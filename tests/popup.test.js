const test = require('node:test');
const assert = require('node:assert/strict');

const { createPopupController } = require('../popup.js');

const PROFILE_KEYS = [
  'familyName',
  'givenName',
  'familyNameLatin',
  'givenNameLatin',
];

function createFakeDocument(values = {}) {
  const elements = Object.fromEntries([
    ...PROFILE_KEYS.map((id) => [id, {
      id,
      value: values[id] || '',
      disabled: false,
      addEventListener() {},
    }]),
    ['saveButton', { disabled: false, addEventListener() {} }],
    ['fillButton', { disabled: false, addEventListener() {} }],
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
  const savedProfile = options.profile || {
    familyName: '保存姓',
    givenName: '保存名',
    familyNameLatin: 'FAMILY',
    givenNameLatin: 'GIVEN',
  };
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
      return Object.fromEntries(
        PROFILE_KEYS.map((key) => [key, String(profile[key] || '').trim()]),
      );
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
  const controller = createPopupController({
    document,
    storageApi,
    tabsApi,
    scriptingApi,
  });

  return { document, storageApi, tabsApi, scriptingApi, controller };
}

test('init restores all four saved values into the popup', async () => {
  const harness = createHarness();

  await harness.controller.init();

  for (const key of PROFILE_KEYS) {
    assert.equal(harness.document.elements[key].value, harness.storageApi.loadCalls && {
      familyName: '保存姓',
      givenName: '保存名',
      familyNameLatin: 'FAMILY',
      givenNameLatin: 'GIVEN',
    }[key]);
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

test('saveProfile stores four fields, reapplies normalized values, and reports success', async () => {
  const harness = createHarness({
    values: {
      familyName: '  姓の値 ',
      givenName: ' 名の値  ',
      familyNameLatin: ' FAMILY ',
      givenNameLatin: ' GIVEN ',
    },
  });

  await harness.controller.saveProfile();

  assert.deepEqual(harness.storageApi.saveCalls, [{
    familyName: '  姓の値 ',
    givenName: ' 名の値  ',
    familyNameLatin: ' FAMILY ',
    givenNameLatin: ' GIVEN ',
  }]);
  assert.equal(harness.document.elements.familyName.value, '姓の値');
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
