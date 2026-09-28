const test = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeHint,
  collectFieldMetadata,
  classifyField,
  fillDocument,
} = require('../autofill.js');

function metadata(overrides = {}) {
  return {
    labelTexts: [],
    placeholder: '',
    name: '',
    id: '',
    ariaLabel: '',
    autocomplete: '',
    ...overrides,
  };
}

test('normalizeHint normalizes width, case, camelCase, whitespace, and separators', () => {
  assert.equal(normalizeHint('  ＬＡＳＴ＿Name--Field　'), 'last name field');
});

test('classifyField recognizes unambiguous hints for each profile field', () => {
  const cases = [
    [metadata({ labelTexts: ['姓'] }), 'familyName'],
    [metadata({ placeholder: '苗字（必須）' }), 'familyName'],
    [metadata({ labelTexts: ['名'] }), 'givenName'],
    [metadata({ ariaLabel: '下の名前' }), 'givenName'],
    [metadata({ labelTexts: ['英字姓'] }), 'familyNameLatin'],
    [metadata({ labelTexts: ['姓（ローマ字）'] }), 'familyNameLatin'],
    [metadata({ placeholder: 'LAST NAME' }), 'familyNameLatin'],
    [metadata({ name: 'family_name' }), 'familyNameLatin'],
    [metadata({ id: 'surname' }), 'familyNameLatin'],
    [metadata({ autocomplete: 'family-name' }), 'familyNameLatin'],
    [metadata({ labelTexts: ['英字名'] }), 'givenNameLatin'],
    [metadata({ labelTexts: ['名（ローマ字）'] }), 'givenNameLatin'],
    [metadata({ placeholder: 'First Name' }), 'givenNameLatin'],
    [metadata({ name: 'givenName' }), 'givenNameLatin'],
    [metadata({ autocomplete: 'given-name' }), 'givenNameLatin'],
  ];

  for (const [fieldMetadata, expected] of cases) {
    assert.equal(classifyField(fieldMetadata), expected);
  }
});

test('explicit Japanese labels take precedence over generic autocomplete hints', () => {
  assert.equal(
    classifyField(metadata({
      labelTexts: ['姓'],
      autocomplete: 'family-name',
    })),
    'familyName',
  );
  assert.equal(
    classifyField(metadata({
      labelTexts: ['名'],
      autocomplete: 'given-name',
    })),
    'givenName',
  );
});

test('classifyField rejects ambiguous full-name hints', () => {
  const ambiguous = [
    metadata({ labelTexts: ['氏名'] }),
    metadata({ labelTexts: ['お名前'] }),
    metadata({ placeholder: 'name' }),
    metadata({ placeholder: 'full name' }),
    metadata({ labelTexts: ['姓 名'] }),
  ];

  for (const fieldMetadata of ambiguous) {
    assert.equal(classifyField(fieldMetadata), null);
  }
});

class FakeEvent {
  constructor(type, options = {}) {
    this.type = type;
    this.bubbles = Boolean(options.bubbles);
  }
}

class FakeLabel {
  constructor(textContent, htmlFor = '') {
    this.textContent = textContent;
    this.htmlFor = htmlFor;
  }

  getAttribute(name) {
    return name === 'for' ? this.htmlFor : null;
  }
}

class FakeInput {
  constructor(attributes = {}, options = {}) {
    this.attributes = { ...attributes };
    this.disabled = Boolean(options.disabled);
    this.readOnly = Boolean(options.readOnly);
    this.parentLabel = options.parentLabel || null;
    this.effectivelyDisabled = Boolean(options.effectivelyDisabled);
    this.events = [];
    this._value = options.value || '';
    this.failOnSet = Boolean(options.failOnSet);
    this.ownerDocument = null;
  }

  get value() {
    return this._value;
  }

  set value(nextValue) {
    if (this.failOnSet) {
      throw new Error('setter failed');
    }
    this._value = nextValue;
  }

  get id() {
    return this.attributes.id || '';
  }

  get type() {
    return this.attributes.type || 'text';
  }

  getAttribute(name) {
    return Object.hasOwn(this.attributes, name) ? this.attributes[name] : null;
  }

  closest(selector) {
    return selector === 'label' ? this.parentLabel : null;
  }

  dispatchEvent(event) {
    this.events.push({ type: event.type, bubbles: event.bubbles });
    return true;
  }

  matches(selector) {
    return selector === ':disabled' ? this.effectivelyDisabled : false;
  }
}

class FakeDocument {
  constructor(inputs = [], labels = []) {
    this.inputs = inputs;
    this.labels = labels;
    this.defaultView = { Event: FakeEvent, HTMLInputElement: FakeInput };
    this.submitCalls = 0;
    this.forms = [{ submit: () => { this.submitCalls += 1; } }];

    for (const input of inputs) {
      input.ownerDocument = this;
    }
  }

  querySelectorAll(selector) {
    if (selector === 'input') {
      return this.inputs;
    }
    if (selector === 'label[for]') {
      return this.labels;
    }
    return [];
  }
}

test('collectFieldMetadata reads labels and every supported attribute source', () => {
  const parentLabel = new FakeLabel('親ラベル');
  const input = new FakeInput({
    id: 'field-id',
    name: 'field-name',
    placeholder: '入力例',
    'aria-label': 'ARIAラベル',
    autocomplete: 'given-name',
  }, { parentLabel });
  const document = new FakeDocument(
    [input],
    [new FakeLabel('関連ラベル', 'field-id'), new FakeLabel('別のラベル', 'other')],
  );

  assert.deepEqual(collectFieldMetadata(input, document), {
    labelTexts: ['関連ラベル', '親ラベル'],
    placeholder: '入力例',
    name: 'field-name',
    id: 'field-id',
    ariaLabel: 'ARIAラベル',
    autocomplete: 'given-name',
  });
});

test('collected label, placeholder, name, id, aria-label, and autocomplete can drive classification', () => {
  const cases = [
    [new FakeInput({ id: 'a' }), [new FakeLabel('姓', 'a')], 'familyName'],
    [new FakeInput({}, { parentLabel: new FakeLabel('名') }), [], 'givenName'],
    [new FakeInput({ placeholder: 'last name' }), [], 'familyNameLatin'],
    [new FakeInput({ name: 'first_name' }), [], 'givenNameLatin'],
    [new FakeInput({ id: 'surname' }), [], 'familyNameLatin'],
    [new FakeInput({ 'aria-label': 'ローマ字名' }), [], 'givenNameLatin'],
    [new FakeInput({ autocomplete: 'family-name' }), [], 'familyNameLatin'],
  ];

  for (const [input, labels, expected] of cases) {
    const document = new FakeDocument([input], labels);
    assert.equal(classifyField(collectFieldMetadata(input, document)), expected);
  }
});

test('classifyField rejects unrelated purposes even when they contain name characters', () => {
  const unrelated = [
    'email',
    'address',
    'company',
    '会社名',
    '法人名',
    'ユーザー名',
    'username',
  ];

  for (const hint of unrelated) {
    assert.equal(classifyField(metadata({ labelTexts: [hint] })), null);
  }
});

test('fillDocument updates only writable text inputs with non-empty matching profile values', () => {
  const firstFamily = new FakeInput({ name: 'last_name' }, { value: 'old' });
  const secondFamily = new FakeInput({ placeholder: 'Family Name' });
  const emptyGiven = new FakeInput({ name: 'first_name' }, { value: 'keep' });
  const japaneseFamily = new FakeInput({ id: 'jp-family' });
  const hidden = new FakeInput({ name: 'last_name', type: 'hidden' }, { value: 'hidden' });
  const email = new FakeInput({ name: 'email', type: 'email' }, { value: 'email' });
  const disabled = new FakeInput({ name: 'last_name' }, { disabled: true, value: 'disabled' });
  const readOnly = new FakeInput({ name: 'last_name' }, { readOnly: true, value: 'readonly' });
  const document = new FakeDocument(
    [firstFamily, secondFamily, emptyGiven, japaneseFamily, hidden, email, disabled, readOnly],
    [new FakeLabel('姓', 'jp-family')],
  );

  const result = fillDocument(document, {
    familyName: '保存姓',
    givenName: '',
    familyNameLatin: 'SAVED-FAMILY',
    givenNameLatin: '',
  });

  assert.deepEqual(result, { filledCount: 3, failedCount: 0 });
  assert.equal(firstFamily.value, 'SAVED-FAMILY');
  assert.equal(secondFamily.value, 'SAVED-FAMILY');
  assert.equal(japaneseFamily.value, '保存姓');
  assert.equal(emptyGiven.value, 'keep');
  assert.equal(hidden.value, 'hidden');
  assert.equal(email.value, 'email');
  assert.equal(disabled.value, 'disabled');
  assert.equal(readOnly.value, 'readonly');
  assert.deepEqual(firstFamily.events, [
    { type: 'input', bubbles: true },
    { type: 'change', bubbles: true },
  ]);
  assert.equal(document.submitCalls, 0);
});

test('fillDocument counts a failed setter and continues with later matching inputs', () => {
  const broken = new FakeInput({ name: 'last_name' }, { failOnSet: true });
  const working = new FakeInput({ name: 'last_name' });
  const document = new FakeDocument([broken, working]);

  assert.deepEqual(
    fillDocument(document, { familyNameLatin: 'VALUE' }),
    { filledCount: 1, failedCount: 1 },
  );
  assert.equal(working.value, 'VALUE');
});

test('strong Japanese labels outrank repeated weaker English metadata', () => {
  const japaneseFamily = metadata({
    labelTexts: ['姓'],
    id: 'familyNameJa',
    name: 'family_name_ja',
  });
  const japaneseGiven = metadata({
    labelTexts: ['名'],
    id: 'givenNameJa',
    name: 'given_name_ja',
  });
  const japaneseFamilyWithAutocomplete = metadata({
    labelTexts: ['姓'],
    id: 'familyName',
    name: 'family_name',
    autocomplete: 'family-name',
  });

  assert.equal(classifyField(japaneseFamily), 'familyName');
  assert.equal(classifyField(japaneseGiven), 'givenName');
  assert.equal(classifyField(japaneseFamilyWithAutocomplete), 'familyName');
});

test('fillDocument maps the exact fixture metadata to all four distinct profile values', () => {
  const familyJa = new FakeInput({ id: 'familyNameJa', name: 'family_name_ja' });
  const givenJa = new FakeInput({ id: 'givenNameJa', name: 'given_name_ja' });
  const familyEn = new FakeInput({
    id: 'familyNameEn',
    name: 'last_name',
    autocomplete: 'family-name',
  });
  const givenEn = new FakeInput({
    id: 'givenNameEn',
    name: 'first_name',
    autocomplete: 'given-name',
  });
  const document = new FakeDocument(
    [familyJa, givenJa, familyEn, givenEn],
    [
      new FakeLabel('姓', 'familyNameJa'),
      new FakeLabel('名', 'givenNameJa'),
      new FakeLabel('Last Name', 'familyNameEn'),
      new FakeLabel('First Name', 'givenNameEn'),
    ],
  );

  assert.deepEqual(fillDocument(document, {
    familyName: '日本語姓',
    givenName: '日本語名',
    familyNameLatin: 'LATIN-FAMILY',
    givenNameLatin: 'LATIN-GIVEN',
  }), { filledCount: 4, failedCount: 0 });
  assert.deepEqual(
    [familyJa.value, givenJa.value, familyEn.value, givenEn.value],
    ['日本語姓', '日本語名', 'LATIN-FAMILY', 'LATIN-GIVEN'],
  );
});

test('normalized separators cannot bypass unrelated Japanese field exclusions', () => {
  const cases = ['会社 名', '会社_名', '会社-名', 'ユーザー 名', 'ユーザー_名', 'ユーザー-名'];

  for (const label of cases) {
    assert.equal(
      classifyField(metadata({ labelTexts: [label], name: 'given_name' })),
      null,
    );
  }
});

test('classifyField recognizes Japanese instructions containing an explicit surname or given-name token', () => {
  assert.equal(
    classifyField(metadata({ labelTexts: ['姓を入力してください'] })),
    'familyName',
  );
  assert.equal(
    classifyField(metadata({ labelTexts: ['名を入力してください'] })),
    'givenName',
  );
});

test('fillDocument respects effective fieldset disabled state and the first-legend exception', () => {
  const disabledDescendant = new FakeInput(
    { name: 'last_name' },
    { effectivelyDisabled: true, value: 'disabled-value' },
  );
  const firstLegendDescendant = new FakeInput(
    { name: 'last_name' },
    { effectivelyDisabled: false, value: 'legend-value' },
  );
  const document = new FakeDocument([disabledDescendant, firstLegendDescendant]);

  assert.deepEqual(
    fillDocument(document, { familyNameLatin: 'SAVED' }),
    { filledCount: 1, failedCount: 0 },
  );
  assert.equal(disabledDescendant.value, 'disabled-value');
  assert.equal(firstLegendDescendant.value, 'SAVED');
});
