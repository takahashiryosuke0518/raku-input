const test = require('node:test');
const assert = require('node:assert/strict');

const { createPopupController } = require('../popup.js');
const {
  createProfileExport,
  serializeProfileExport,
  parseProfileImportJson,
} = require('../profile-storage.js');

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

const EDUCATION_FIELDS = [
  ['middleSchoolName', 'middleSchool', 'schoolName'],
  ['middleSchoolEnrollmentMonth', 'middleSchool', 'enrollmentMonth'],
  ['middleSchoolGraduationMonth', 'middleSchool', 'graduationMonth'],
  ['highSchoolName', 'highSchool', 'schoolName'],
  ['highSchoolEnrollmentMonth', 'highSchool', 'enrollmentMonth'],
  ['highSchoolGraduationMonth', 'highSchool', 'graduationMonth'],
  ['bachelorUniversityName', 'bachelor', 'universityName'],
  ['bachelorFacultyName', 'bachelor', 'facultyName'],
  ['bachelorDepartmentName', 'bachelor', 'departmentName'],
  ['bachelorEnrollmentMonth', 'bachelor', 'enrollmentMonth'],
  ['bachelorGraduationMonth', 'bachelor', 'graduationMonth'],
  ['masterGraduateSchoolName', 'master', 'graduateSchoolName'],
  ['masterGraduateDepartmentName', 'master', 'graduateDepartmentName'],
  ['masterMajorName', 'master', 'majorName'],
  ['masterEnrollmentMonth', 'master', 'enrollmentMonth'],
  ['masterCompletionMonth', 'master', 'completionMonth'],
  ['finalEducationLevel', 'finalEducation', 'level'],
  ['finalEducationCompletionStatus', 'finalEducation', 'completionStatus'],
];

const SAVED_PROFILE = {
  familyName: '保存姓',
  givenName: '保存名',
  familyNameLatin: 'FAMILY',
  givenNameLatin: 'GIVEN',
  familyNameKana: 'ヤマダ',
  givenNameKana: 'タロウ',
  phoneNumber: '000-0000-0000',
  mobilePhone: '000-0000-0000',
  currentPostalCode: '0100001',
  currentAddress: '東京都千代田区千代田1-1',
  currentBuilding: '○○マンション101',
  email: 'example@example.com',
  birthDate: '2002-05-18',
  gender: '男性',
  currentPrefecture: '秋田県',
  homePrefecture: '宮城県',
  academicCourse: '修士',
  grade: '修士1年',
  schoolName: '秋田県立大学',
  departmentName: 'システム科学技術研究科',
  majorName: '総合システム工学専攻',
  enrollmentMonth: '2026-04',
  graduationMonth: '2028-03',
  laboratoryName: '○○研究室',
  laboratoryStartMonth: '2026-04',
  laboratoryEndMonth: '2028-03',
  researchKeywords: ['医療画像処理', '深層学習', 'PET'],
  researchOverview: '研究内容...',
  educationHistory: {
    middleSchool: { schoolName: '市立中学校', enrollmentMonth: '2012-04', graduationMonth: '2015-03' },
    highSchool: { schoolName: '県立高校', enrollmentMonth: '2015-04', graduationMonth: '2018-03' },
    bachelor: {
      universityName: '県立大学', facultyName: '工学部', departmentName: '情報学科',
      enrollmentMonth: '2018-04', graduationMonth: '2022-03',
    },
    master: {
      graduateSchoolName: '県立大学大学院', graduateDepartmentName: 'システム科学技術研究科',
      majorName: '総合システム工学専攻', enrollmentMonth: '2022-04', completionMonth: '2024-03',
    },
  },
  finalEducation: { level: 'master', completionStatus: 'completionExpected' },
};

function createFakeDocument(values = {}) {
  const elements = Object.fromEntries([
    ...[...PROFILE_KEYS, ...EDUCATION_FIELDS.map(([id]) => id)].map((id) => [id, {
      id,
      value: Array.isArray(values[id]) ? values[id].join('\n') : (values[id] || ''),
      disabled: false,
      addEventListener() {},
    }]),
    ['saveButton', { disabled: false, addEventListener() {} }],
    ['fillButton', { disabled: false, addEventListener() {} }],
    ['exportButton', { disabled: false, addEventListener() {} }],
    ['importButton', { disabled: false, addEventListener() {} }],
    ['importFileInput', { disabled: false, value: '', files: [], addEventListener() {}, click() {} }],
    ['status', { textContent: '', dataset: {} }],
  ]);

  return {
    elements,
    getElementById(id) {
      return elements[id] || null;
    },
  };
}

function createHarness(options = {}) {
  const document = createFakeDocument(options.values);
  const savedProfile = options.profile || SAVED_PROFILE;
  const storageApi = {
    loadCalls: 0,
    saveCalls: [],
    async load() {
      this.loadCalls += 1;
      if (options.loadError) throw options.loadError;
      return savedProfile;
    },
    async save(profile) {
      this.saveCalls.push(profile);
      if (options.saveError) throw options.saveError;
      const normalized = Object.fromEntries(
        PROFILE_KEYS.map((key) => [
          key,
          key === 'researchKeywords'
            ? profile[key].map((value) => value.trim()).filter(Boolean)
            : String(profile[key] || '').trim(),
        ]),
      );
      normalized.educationHistory = Object.fromEntries(Object.entries(profile.educationHistory).map(
        ([stage, record]) => [stage, Object.fromEntries(Object.entries(record).map(
          ([key, value]) => [key, String(value || '').trim()],
        ))],
      ));
      normalized.finalEducation = Object.fromEntries(Object.entries(profile.finalEducation).map(
        ([key, value]) => [key, String(value || '').trim()],
      ));
      return normalized;
    },
    async exportJson() {
      return serializeProfileExport(await this.load());
    },
    parseImportJson(source) {
      return parseProfileImportJson(source);
    },
  };
  const tabsApi = {
    calls: [],
    async query(query) {
      this.calls.push(query);
      if (options.tabsError) throw options.tabsError;
      return options.tabsResult === undefined ? [{ id: 123 }] : options.tabsResult;
    },
  };
  const scriptingApi = {
    calls: [],
    async executeScript(details) {
      this.calls.push(details);
      if (options.scriptingError) throw options.scriptingError;
      return options.injectionResult === undefined
        ? [{ frameId: 0, result: { filledCount: 4, failedCount: 0 } }]
        : options.injectionResult;
    },
  };
  const fileApi = {
    downloadCalls: [],
    readCalls: [],
    confirmCalls: 0,
    downloadText(filename, contents, mimeType) {
      if (options.downloadError) throw options.downloadError;
      this.downloadCalls.push({ filename, contents, mimeType });
    },
    async readText(file) {
      this.readCalls.push(file);
      if (options.readError) throw options.readError;
      return file.text();
    },
    confirmReplace() {
      this.confirmCalls += 1;
      return options.confirmResult === undefined ? true : options.confirmResult;
    },
  };
  const controller = createPopupController({
    document,
    storageApi,
    tabsApi,
    scriptingApi,
    fileApi,
  });

  return { document, storageApi, tabsApi, scriptingApi, fileApi, controller };
}

test('init restores all saved values into the popup', async () => {
  const harness = createHarness();

  await harness.controller.init();

  for (const key of PROFILE_KEYS) {
    assert.equal(
      harness.document.elements[key].value,
      harness.storageApi.loadCalls && (
        key === 'researchKeywords' ? SAVED_PROFILE[key].join('\n') : SAVED_PROFILE[key]
      ),
    );
  }
  for (const [id, stage, key] of EDUCATION_FIELDS) {
    const value = stage === 'finalEducation'
      ? SAVED_PROFILE.finalEducation[key]
      : SAVED_PROFILE.educationHistory[stage][key];
    assert.equal(harness.document.elements[id].value, value);
  }
  assert.equal(harness.document.elements.status.textContent, '');
});

test('init and fillCurrentPage report profile load failure safely', async () => {
  const failure = new Error('sensitive profile data');
  const initHarness = createHarness({ loadError: failure });
  await initHarness.controller.init();
  assert.equal(
    initHarness.document.elements.status.textContent,
    'プロフィールを読み込めませんでした。',
  );

  const fillHarness = createHarness({ loadError: failure });
  await fillHarness.controller.fillCurrentPage();
  assert.equal(fillHarness.scriptingApi.calls.length, 0);
  assert.equal(
    fillHarness.document.elements.status.textContent,
    'プロフィールを読み込めませんでした。',
  );
  assert.equal(fillHarness.document.elements.status.textContent.includes(failure.message), false);
});

test('saveProfile stores all fields, reapplies normalized values, and reports success', async () => {
  const harness = createHarness({
    values: {
      familyName: '  姓の値 ',
      givenName: ' 名の値  ',
      familyNameLatin: ' FAMILY ',
      givenNameLatin: ' GIVEN ',
      familyNameKana: ' ヤマダ ',
      givenNameKana: ' タロウ ',
      phoneNumber: ' 000-0000-0000 ',
      mobilePhone: ' 000-0000-0000 ',
      currentPostalCode: ' 0100001 ',
      currentAddress: ' 秋田市山王1-1 ',
      currentBuilding: ' 県庁マンション101 ',
      email: ' example@example.com ',
      birthDate: ' 2002-05-18 ',
      gender: ' 男性 ',
      currentPrefecture: ' 秋田県 ',
      homePrefecture: ' 宮城県 ',
      academicCourse: ' 修士 ',
      grade: ' 修士1年 ',
      schoolName: ' 秋田県立大学 ',
      departmentName: ' システム科学技術研究科 ',
      majorName: ' 総合システム工学専攻 ',
      enrollmentMonth: ' 2026-04 ',
      graduationMonth: ' 2028-03 ',
      laboratoryName: ' ○○研究室 ',
      laboratoryStartMonth: ' 2026-04 ',
      laboratoryEndMonth: ' 2028-03 ',
      researchKeywords: '医療画像処理\n深層学習\nPET',
      researchOverview: ' 研究内容... ',
      middleSchoolName: ' 市立中学校 ',
      middleSchoolEnrollmentMonth: ' 2012-04 ',
      middleSchoolGraduationMonth: ' 2015-03 ',
      highSchoolName: ' 県立高校 ',
      highSchoolEnrollmentMonth: ' 2015-04 ',
      highSchoolGraduationMonth: ' 2018-03 ',
      bachelorUniversityName: ' 県立大学 ',
      bachelorFacultyName: ' 工学部 ',
      bachelorDepartmentName: ' 情報学科 ',
      bachelorEnrollmentMonth: ' 2018-04 ',
      bachelorGraduationMonth: ' 2022-03 ',
      masterGraduateSchoolName: ' 県立大学大学院 ',
      masterGraduateDepartmentName: ' システム科学技術研究科 ',
      masterMajorName: ' 総合システム工学専攻 ',
      masterEnrollmentMonth: ' 2022-04 ',
      masterCompletionMonth: ' 2024-03 ',
      finalEducationLevel: ' master ',
      finalEducationCompletionStatus: ' completionExpected ',
    },
  });

  await harness.controller.saveProfile();

  assert.deepEqual(harness.storageApi.saveCalls, [{
    familyName: '  姓の値 ',
    givenName: ' 名の値  ',
    familyNameLatin: ' FAMILY ',
    givenNameLatin: ' GIVEN ',
    familyNameKana: ' ヤマダ ',
    givenNameKana: ' タロウ ',
    phoneNumber: ' 000-0000-0000 ',
    mobilePhone: ' 000-0000-0000 ',
    currentPostalCode: ' 0100001 ',
    currentAddress: ' 秋田市山王1-1 ',
    currentBuilding: ' 県庁マンション101 ',
    email: ' example@example.com ',
    birthDate: ' 2002-05-18 ',
    gender: ' 男性 ',
    currentPrefecture: ' 秋田県 ',
    homePrefecture: ' 宮城県 ',
    academicCourse: ' 修士 ',
    grade: ' 修士1年 ',
    schoolName: ' 秋田県立大学 ',
    departmentName: ' システム科学技術研究科 ',
    majorName: ' 総合システム工学専攻 ',
    enrollmentMonth: ' 2026-04 ',
    graduationMonth: ' 2028-03 ',
    laboratoryName: ' ○○研究室 ',
    laboratoryStartMonth: ' 2026-04 ',
    laboratoryEndMonth: ' 2028-03 ',
    researchKeywords: ['医療画像処理', '深層学習', 'PET'],
    researchOverview: ' 研究内容... ',
    educationHistory: {
      middleSchool: { schoolName: ' 市立中学校 ', enrollmentMonth: ' 2012-04 ', graduationMonth: ' 2015-03 ' },
      highSchool: { schoolName: ' 県立高校 ', enrollmentMonth: ' 2015-04 ', graduationMonth: ' 2018-03 ' },
      bachelor: {
        universityName: ' 県立大学 ', facultyName: ' 工学部 ', departmentName: ' 情報学科 ',
        enrollmentMonth: ' 2018-04 ', graduationMonth: ' 2022-03 ',
      },
      master: {
        graduateSchoolName: ' 県立大学大学院 ', graduateDepartmentName: ' システム科学技術研究科 ',
        majorName: ' 総合システム工学専攻 ', enrollmentMonth: ' 2022-04 ', completionMonth: ' 2024-03 ',
      },
    },
    finalEducation: { level: ' master ', completionStatus: ' completionExpected ' },
  }]);
  assert.equal(harness.document.elements.familyName.value, '姓の値');
  assert.equal(harness.document.elements.birthDate.value, '2002-05-18');
  assert.equal(harness.document.elements.gender.value, '男性');
  assert.equal(harness.document.elements.currentPrefecture.value, '秋田県');
  assert.equal(harness.document.elements.homePrefecture.value, '宮城県');
  assert.equal(harness.document.elements.masterGraduateSchoolName.value, '県立大学大学院');
  assert.equal(harness.document.elements.masterGraduateDepartmentName.value, 'システム科学技術研究科');
  assert.equal(harness.document.elements.finalEducationLevel.value, 'master');
  assert.equal(harness.document.elements.status.textContent, '保存しました。');
  assert.equal(harness.document.elements.status.dataset.kind, 'success');
});

test('saveProfile reports storage failure without exposing the error text', async () => {
  const secretError = new Error('sensitive saved value');
  const harness = createHarness({ saveError: secretError });

  await harness.controller.saveProfile();

  assert.equal(harness.document.elements.status.textContent, '保存できませんでした。');
  assert.equal(harness.document.elements.status.textContent.includes(secretError.message), false);
  assert.equal(harness.document.elements.status.dataset.kind, 'error');
});

test('exportProfile downloads every saved profile field as profile.local.json', async () => {
  const harness = createHarness();

  await harness.controller.exportProfile();

  assert.equal(harness.fileApi.downloadCalls.length, 1);
  const download = harness.fileApi.downloadCalls[0];
  assert.equal(download.filename, 'profile.local.json');
  assert.equal(download.mimeType, 'application/json');
  assert.deepEqual(JSON.parse(download.contents), createProfileExport(SAVED_PROFILE));
  assert.equal(harness.document.elements.status.textContent, 'プロフィールをエクスポートしました。');
  assert.equal(harness.document.elements.status.dataset.kind, 'success');
});

test('importProfile validates, confirms, saves, and restores every imported field', async () => {
  const imported = structuredClone(SAVED_PROFILE);
  imported.familyName = 'test-imported-family';
  imported.educationHistory.master.graduateSchoolName = 'test-imported-graduate-school';
  imported.finalEducation.completionStatus = 'completed';
  const file = { text: async () => serializeProfileExport(imported) };
  const harness = createHarness({ values: { familyName: 'test-before-import' } });

  await harness.controller.importProfile(file);

  assert.deepEqual(harness.fileApi.readCalls, [file]);
  assert.equal(harness.fileApi.confirmCalls, 1);
  assert.deepEqual(harness.storageApi.saveCalls, [imported]);
  assert.equal(harness.document.elements.familyName.value, 'test-imported-family');
  assert.equal(
    harness.document.elements.masterGraduateSchoolName.value,
    'test-imported-graduate-school',
  );
  assert.equal(harness.document.elements.finalEducationCompletionStatus.value, 'completed');
  assert.equal(harness.document.elements.status.textContent, 'プロフィールをインポートしました。');
  assert.equal(harness.document.elements.status.dataset.kind, 'success');
});

test('importProfile rejects invalid JSON and unsupported versions without changing data', async (t) => {
  const invalidFiles = [
    { name: 'invalid JSON', source: '{' },
    {
      name: 'unsupported version',
      source: JSON.stringify({ ...createProfileExport(SAVED_PROFILE), version: 999 }),
    },
  ];

  for (const { name, source } of invalidFiles) {
    await t.test(name, async () => {
      const harness = createHarness({ values: { familyName: 'test-existing-ui' } });
      await harness.controller.importProfile({ text: async () => source });
      assert.equal(harness.fileApi.confirmCalls, 0);
      assert.deepEqual(harness.storageApi.saveCalls, []);
      assert.equal(harness.document.elements.familyName.value, 'test-existing-ui');
      assert.equal(harness.document.elements.status.textContent, 'プロフィールファイルを読み込めませんでした。');
      assert.equal(harness.document.elements.status.dataset.kind, 'error');
    });
  }
});

test('importProfile cancellation leaves saved data and the form unchanged', async () => {
  const harness = createHarness({
    values: { familyName: 'test-existing-ui' },
    confirmResult: false,
  });

  await harness.controller.importProfile({ text: async () => serializeProfileExport(SAVED_PROFILE) });

  assert.equal(harness.fileApi.confirmCalls, 1);
  assert.deepEqual(harness.storageApi.saveCalls, []);
  assert.equal(harness.document.elements.familyName.value, 'test-existing-ui');
  assert.equal(harness.document.elements.status.textContent, 'インポートをキャンセルしました。');
});

test('importProfile save failure leaves the form unchanged and hides error details', async () => {
  const secretError = new Error('test-private-error-detail');
  const harness = createHarness({
    values: { familyName: 'test-existing-ui' },
    saveError: secretError,
  });

  await harness.controller.importProfile({ text: async () => serializeProfileExport(SAVED_PROFILE) });

  assert.equal(harness.fileApi.confirmCalls, 1);
  assert.equal(harness.storageApi.saveCalls.length, 1);
  assert.equal(harness.document.elements.familyName.value, 'test-existing-ui');
  assert.equal(harness.document.elements.status.textContent, 'プロフィールをインポートできませんでした。');
  assert.equal(harness.document.elements.status.textContent.includes(secretError.message), false);
  assert.equal(harness.document.elements.status.dataset.kind, 'error');
});

test('fillCurrentPage does not inject when every saved field is empty', async () => {
  const harness = createHarness({
    profile: Object.fromEntries(PROFILE_KEYS.map((key) => [key, ''])),
  });

  await harness.controller.fillCurrentPage();

  assert.equal(harness.scriptingApi.calls.length, 0);
  assert.equal(
    harness.document.elements.status.textContent,
    '先にプロフィールを保存してください。',
  );
});

test('fillCurrentPage injects the two scripts into the active tab in order', async () => {
  const harness = createHarness();

  await harness.controller.fillCurrentPage();

  assert.deepEqual(harness.tabsApi.calls, [{ active: true, currentWindow: true }]);
  assert.deepEqual(harness.scriptingApi.calls, [{
    target: { tabId: 123 },
    files: ['autofill.js', 'content.js'],
  }]);
  assert.equal(harness.document.elements.status.textContent, '4件の入力欄に入力しました。');
});

test('fillCurrentPage reports no matches and partial failures', async (t) => {
  await t.test('no matches', async () => {
    const harness = createHarness({
      injectionResult: [{ frameId: 0, result: { filledCount: 0, failedCount: 0 } }],
    });
    await harness.controller.fillCurrentPage();
    assert.equal(
      harness.document.elements.status.textContent,
      '対応する入力欄が見つかりませんでした。',
    );
  });

  await t.test('some failures', async () => {
    const harness = createHarness({
      injectionResult: [{ frameId: 0, result: { filledCount: 2, failedCount: 1 } }],
    });
    await harness.controller.fillCurrentPage();
    assert.equal(
      harness.document.elements.status.textContent,
      '2件に入力しました（1件は入力できませんでした）。',
    );
  });

  await t.test('only failures', async () => {
    const harness = createHarness({
      injectionResult: [{ frameId: 0, result: { filledCount: 0, failedCount: 2 } }],
    });
    await harness.controller.fillCurrentPage();
    assert.equal(
      harness.document.elements.status.textContent,
      '対応する入力欄に入力できませんでした。',
    );
  });
});

test('fillCurrentPage reports a safe error for tab and injection failures', async (t) => {
  const cases = [
    { name: 'no active tab', tabsResult: [] },
    { name: 'tab query rejection', tabsError: new Error('tab secret') },
    { name: 'script rejection', scriptingError: new Error('script secret') },
    { name: 'empty injection result', injectionResult: [] },
    { name: 'missing script result', injectionResult: [{ frameId: 0 }] },
  ];

  for (const options of cases) {
    await t.test(options.name, async () => {
      const harness = createHarness(options);
      await harness.controller.fillCurrentPage();
      assert.equal(
        harness.document.elements.status.textContent,
        'このページでは入力できません。',
      );
      assert.equal(harness.document.elements.status.dataset.kind, 'error');
    });
  }
});
