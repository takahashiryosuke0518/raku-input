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
    const controller = api.createPopupController({
      document: root.document,
      storageApi,
      tabsApi: root.chrome.tabs,
      scriptingApi: root.chrome.scripting,
    });

    root.document.getElementById('saveButton').addEventListener('click', () => {
      controller.saveProfile();
    });
    root.document.getElementById('fillButton').addEventListener('click', () => {
      controller.fillCurrentPage();
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
    'currentAddress',
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

  function createPopupController({ document, storageApi, tabsApi, scriptingApi }) {
    const fields = Object.fromEntries(
      [...PROFILE_KEYS, ...EDUCATION_FIELD_BINDINGS.map(([id]) => id)]
        .map((key) => [key, document.getElementById(key)]),
    );
    const status = document.getElementById('status');

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
        return await storageApi.load();
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
        const profile = await storageApi.save(readForm());
        writeForm(profile);
        setStatus('保存しました。', 'success');
      } catch (_error) {
        setStatus('保存できませんでした。', 'error');
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
      ));
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

    return { init, saveProfile, fillCurrentPage };
  }

  return { createPopupController };
});
