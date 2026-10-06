(function exposePopup(root, factory) {
  const api = factory();

  if (typeof module === 'object' && module.exports) {
    module.exports = api;
    return;
  }

  function start() {
    const storageApi = root.RakurakuProfileStorage.createProfileStorage(
      root.chrome.storage.local,
    );
    const fileApi = {
      downloadText(filename, contents, mimeType) {
        const url = root.URL.createObjectURL(new root.Blob([contents], { type: mimeType }));
        try {
          const link = root.document.createElement('a');
          link.href = url;
          link.download = filename;
          link.click();
        } finally {
          root.URL.revokeObjectURL(url);
        }
      },
      readText(file) {
        return file.text();
      },
      confirmReplace() {
        return root.confirm('現在保存されているプロフィールを、選択したファイルの内容で置き換えます。よろしいですか？');
      },
    };
    const controller = api.createPopupController({
      document: root.document,
      storageApi,
      tabsApi: root.chrome.tabs,
      scriptingApi: root.chrome.scripting,
      fileApi,
    });

    root.document.getElementById('saveButton').addEventListener('click', () => {
      controller.saveProfile();
    });
    root.document.getElementById('fillButton').addEventListener('click', () => {
      controller.fillCurrentPage();
    });
    root.document.getElementById('exportButton').addEventListener('click', () => {
      controller.exportProfile();
    });
    const importFileInput = root.document.getElementById('importFileInput');
    root.document.getElementById('importButton').addEventListener('click', () => {
      importFileInput.click();
    });
    importFileInput.addEventListener('change', () => {
      const file = importFileInput.files && importFileInput.files[0];
      if (file) controller.importProfile(file);
      importFileInput.value = '';
    });
    controller.init();
  }

  if (root.document.readyState === 'loading') {
    root.document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})(globalThis, function createPopupApi() {
  'use strict';

  const PROFILE_KEYS = [
    'familyName',
    'givenName',
    'familyNameLatin',
    'givenNameLatin',
    'familyNameKana',
    'givenNameKana',
    'phoneNumber',
    'mobilePhone',
    'currentPostalCode',
    'currentCity',
    'currentStreet',
    'currentBuilding',
    'email',
    'birthDate',
    'gender',
    'currentPrefecture',
    'homePrefecture',
    'academicCourse',
    'grade',
    'schoolName',
    'departmentName',
    'majorName',
    'enrollmentMonth',
    'graduationMonth',
    'laboratoryName',
    'laboratoryStartMonth',
    'laboratoryEndMonth',
    'researchKeywords',
    'researchOverview',
  ];

  const EDUCATION_FIELD_BINDINGS = [
    ['middleSchoolName', 'educationHistory', 'middleSchool', 'schoolName'],
    ['middleSchoolEnrollmentMonth', 'educationHistory', 'middleSchool', 'enrollmentMonth'],
    ['middleSchoolGraduationMonth', 'educationHistory', 'middleSchool', 'graduationMonth'],
    ['highSchoolName', 'educationHistory', 'highSchool', 'schoolName'],
    ['highSchoolEnrollmentMonth', 'educationHistory', 'highSchool', 'enrollmentMonth'],
    ['highSchoolGraduationMonth', 'educationHistory', 'highSchool', 'graduationMonth'],
    ['bachelorUniversityName', 'educationHistory', 'bachelor', 'universityName'],
    ['bachelorFacultyName', 'educationHistory', 'bachelor', 'facultyName'],
    ['bachelorDepartmentName', 'educationHistory', 'bachelor', 'departmentName'],
    ['bachelorEnrollmentMonth', 'educationHistory', 'bachelor', 'enrollmentMonth'],
    ['bachelorGraduationMonth', 'educationHistory', 'bachelor', 'graduationMonth'],
    ['masterGraduateSchoolName', 'educationHistory', 'master', 'graduateSchoolName'],
    ['masterGraduateDepartmentName', 'educationHistory', 'master', 'graduateDepartmentName'],
    ['masterMajorName', 'educationHistory', 'master', 'majorName'],
    ['masterEnrollmentMonth', 'educationHistory', 'master', 'enrollmentMonth'],
    ['masterCompletionMonth', 'educationHistory', 'master', 'completionMonth'],
    ['finalEducationLevel', 'finalEducation', '', 'level'],
    ['finalEducationCompletionStatus', 'finalEducation', '', 'completionStatus'],
  ];

  function createPopupController({ document, storageApi, tabsApi, scriptingApi, fileApi }) {
    const fields = Object.fromEntries(
      [...PROFILE_KEYS, ...EDUCATION_FIELD_BINDINGS.map(([id]) => id)]
        .map((key) => [key, document.getElementById(key)]),
    );
    const status = document.getElementById('status');
    let preservedCurrentAddress = '';
    let profileLoaded = false;

    function setStatus(message, kind = 'info') {
      status.textContent = message;
      status.dataset.kind = kind;
    }

    function readForm() {
      const profile = Object.fromEntries(PROFILE_KEYS.map((key) => [
        key,
        key === 'researchKeywords'
          ? fields[key].value.split(/[\n,、]/).map((value) => value.trim()).filter(Boolean)
          : fields[key].value,
      ]));
      profile.currentAddress = preservedCurrentAddress;
      profile.educationHistory = {};
      profile.finalEducation = {};
      for (const [id, section, stage, key] of EDUCATION_FIELD_BINDINGS) {
        const destination = section === 'educationHistory'
          ? (profile.educationHistory[stage] ||= {})
          : profile.finalEducation;
        destination[key] = fields[id].value;
      }
      return profile;
    }

    function writeForm(profile) {
      preservedCurrentAddress = typeof profile.currentAddress === 'string'
        ? profile.currentAddress : '';
      profileLoaded = true;
      for (const key of PROFILE_KEYS) {
        fields[key].value = key === 'researchKeywords'
          ? (Array.isArray(profile[key]) ? profile[key].join('\n') : '')
          : (profile[key] || '');
      }
      for (const [id, section, stage, key] of EDUCATION_FIELD_BINDINGS) {
        const value = section === 'educationHistory'
          ? profile.educationHistory && profile.educationHistory[stage]
            ? profile.educationHistory[stage][key]
            : ''
          : profile.finalEducation && profile.finalEducation[key];
        fields[id].value = value || '';
      }
    }

    async function loadProfile() {
      try {
        const profile = await storageApi.load();
        preservedCurrentAddress = typeof profile.currentAddress === 'string'
          ? profile.currentAddress : '';
        profileLoaded = true;
        return profile;
      } catch (_error) {
        setStatus('プロフィールを読み込めませんでした。', 'error');
        return null;
      }
    }

    async function init() {
      const profile = await loadProfile();
      if (!profile) {
        return;
      }

      writeForm(profile);
      setStatus('');
    }

    async function saveProfile() {
      try {
        if (!profileLoaded && !await loadProfile()) return;
        const profile = await storageApi.save(readForm());
        writeForm(profile);
        setStatus('保存しました。', 'success');
      } catch (_error) {
        setStatus('保存できませんでした。', 'error');
      }
    }

    async function exportProfile() {
      try {
        const contents = await storageApi.exportJson();
        fileApi.downloadText('profile.local.json', contents, 'application/json');
        setStatus('プロフィールをエクスポートしました。', 'success');
      } catch (_error) {
        setStatus('プロフィールをエクスポートできませんでした。', 'error');
      }
    }

    async function importProfile(file) {
      let profile;
      try {
        const contents = await fileApi.readText(file);
        profile = storageApi.parseImportJson(contents);
      } catch (_error) {
        setStatus('プロフィールファイルを読み込めませんでした。', 'error');
        return;
      }

      let confirmed;
      try {
        confirmed = fileApi.confirmReplace();
      } catch (_error) {
        setStatus('プロフィールをインポートできませんでした。', 'error');
        return;
      }
      if (!confirmed) {
        setStatus('インポートをキャンセルしました。');
        return;
      }

      try {
        const savedProfile = await storageApi.save(profile);
        writeForm(savedProfile);
        setStatus('プロフィールをインポートしました。', 'success');
      } catch (_error) {
        setStatus('プロフィールをインポートできませんでした。', 'error');
      }
    }

    function showFillResult(result) {
      const { filledCount, failedCount } = result;

      if (filledCount > 0 && failedCount > 0) {
        setStatus(
          `${filledCount}件に入力しました（${failedCount}件は入力できませんでした）。`,
          'warning',
        );
      } else if (filledCount > 0) {
        setStatus(`${filledCount}件の入力欄に入力しました。`, 'success');
      } else if (failedCount > 0) {
        setStatus('対応する入力欄に入力できませんでした。', 'error');
      } else {
        setStatus('対応する入力欄が見つかりませんでした。');
      }
    }

    async function fillCurrentPage() {
      const profile = await loadProfile();
      if (!profile) {
        return;
      }

      const hasLegacyData = PROFILE_KEYS.some((key) => (
        Array.isArray(profile[key]) ? profile[key].length > 0 : Boolean(profile[key])
      )) || Boolean(profile.currentAddress);
      const hasEducationData = EDUCATION_FIELD_BINDINGS.some(([id, section, stage, key]) => {
        const value = section === 'educationHistory'
          ? profile.educationHistory && profile.educationHistory[stage]
            ? profile.educationHistory[stage][key]
            : ''
          : profile.finalEducation && profile.finalEducation[key];
        return Boolean(value);
      });
      if (!hasLegacyData && !hasEducationData) {
        setStatus('先にプロフィールを保存してください。', 'warning');
        return;
      }

      try {
        const tabs = await tabsApi.query({ active: true, currentWindow: true });
        const tabId = tabs && tabs[0] && tabs[0].id;
        if (typeof tabId !== 'number') {
          throw new Error('Active tab unavailable');
        }

        const injectionResults = await scriptingApi.executeScript({
          target: { tabId },
          files: ['autofill.js', 'content.js'],
        });
        const result = injectionResults && injectionResults[0]
          ? injectionResults[0].result
          : null;

        if (
          !result
          || typeof result.filledCount !== 'number'
          || typeof result.failedCount !== 'number'
        ) {
          throw new Error('Injection result unavailable');
        }

        showFillResult(result);
      } catch (_error) {
        setStatus('このページでは入力できません。', 'error');
      }
    }

    return { init, saveProfile, exportProfile, importProfile, fillCurrentPage };
  }

  return { createPopupController };
});
