const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  normalizeHint,
  collectFieldMetadata,
  classifyField,
  fillDocument,
  fillDocumentAsync,
} = require('../autofill.js');

function metadata(overrides = {}) {
  return {
    labelTexts: [],
    contextTexts: [],
    fieldsetTexts: [],
    placeholder: '',
    name: '',
    id: '',
    ariaLabel: '',
    autocomplete: '',
    tagName: 'input',
    inputType: 'text',
    optionTexts: [],
    role: '',
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

test('classifyField recognizes birth date and gender hints without site-specific ids', () => {
  const cases = [
    [metadata({ labelTexts: ['生年月日'], inputType: 'date' }), 'birthDate'],
    [metadata({ placeholder: '誕生日' }), 'birthDate'],
    [metadata({ name: 'birthday', inputType: 'date' }), 'birthDate'],
    [metadata({ id: 'birthDate', inputType: 'date' }), 'birthDate'],
    [metadata({ ariaLabel: 'Date of Birth', inputType: 'date' }), 'birthDate'],
    [metadata({ autocomplete: 'bday', inputType: 'date' }), 'birthDate'],
    [metadata({ labelTexts: ['DOB'], inputType: 'date' }), 'birthDate'],
    [metadata({ labelTexts: ['性別'], tagName: 'select' }), 'gender'],
    [metadata({ name: 'gender', tagName: 'select' }), 'gender'],
    [metadata({ id: 'sexId', tagName: 'select' }), 'gender'],
  ];

  for (const [fieldMetadata, expected] of cases) {
    assert.equal(classifyField(fieldMetadata), expected);
  }
});

test('partial birthday autocomplete fields are not treated as a complete birth date', () => {
  for (const autocomplete of ['bday-year', 'bday-month', 'bday-day']) {
    assert.equal(classifyField(metadata({ autocomplete })), null);
  }
});

test('classifyField keeps current prefecture and home prefecture distinct', () => {
  const currentHints = [
    metadata({ labelTexts: ['居住地'], tagName: 'select' }),
    metadata({ labelTexts: ['現住所'], tagName: 'select' }),
    metadata({ ariaLabel: '現在の居住地', tagName: 'select' }),
    metadata({ name: 'prefecture', tagName: 'select' }),
    metadata({ id: 'currentPrefecture', tagName: 'select' }),
    metadata({ placeholder: 'Residence' }),
    metadata({ labelTexts: ['Residential Area'] }),
  ];
  const homeHints = [
    metadata({ labelTexts: ['帰省先'], tagName: 'select' }),
    metadata({ ariaLabel: '実家', tagName: 'select' }),
    metadata({ labelTexts: ['出身地'], tagName: 'select' }),
    metadata({ name: 'hometown', tagName: 'select' }),
    metadata({ id: 'homeTownId', tagName: 'select' }),
    metadata({ placeholder: 'Home Town' }),
    metadata({ labelTexts: ['Home Prefecture'] }),
  ];

  for (const fieldMetadata of currentHints) {
    assert.equal(classifyField(fieldMetadata), 'currentPrefecture');
  }
  for (const fieldMetadata of homeHints) {
    assert.equal(classifyField(fieldMetadata), 'homePrefecture');
  }
});

test('address-prefecture field names remain eligible for current and home prefectures', () => {
  assert.equal(classifyField(metadata({
    labelTexts: ['居住地'],
    name: 'address[prefecture]',
    tagName: 'select',
  })), 'currentPrefecture');
  assert.equal(classifyField(metadata({
    labelTexts: ['帰省先'],
    name: 'home_address_prefecture',
    tagName: 'select',
  })), 'homePrefecture');
  assert.equal(classifyField(metadata({
    name: 'company_address_prefecture',
    tagName: 'select',
  })), null);
});

test('field-specific location hint outranks a conflicting shared heading', () => {
  assert.equal(classifyField(metadata({
    name: 'current_prefecture',
    contextTexts: ['帰省先'],
    tagName: 'select',
  })), 'currentPrefecture');
});

test('field-specific evidence is not blocked by unrelated shared context', () => {
  assert.equal(classifyField(metadata({
    name: 'birthday',
    inputType: 'date',
    contextTexts: ['会社名'],
  })), 'birthDate');
});

test('select options can identify gender but cannot guess between two prefecture fields', () => {
  assert.equal(classifyField(metadata({
    tagName: 'select',
    optionTexts: ['未設定', '男性', '女性', 'その他'],
  })), 'gender');
  assert.equal(classifyField(metadata({
    tagName: 'select',
    optionTexts: ['北海道', '秋田県', '宮城県', '海外'],
  })), null);
  assert.equal(classifyField(metadata({ labelTexts: ['地域'], tagName: 'select' })), null);
});

test('classifyField recognizes unambiguous school and research profile hints', () => {
  const cases = [
    [metadata({ labelTexts: ['課程'] }), 'academicCourse'],
    [metadata({ name: 'academicCourse' }), 'academicCourse'],
    [metadata({ ariaLabel: 'Degree Level' }), 'academicCourse'],
    [metadata({ labelTexts: ['学年'] }), 'grade'],
    [metadata({ name: 'year_of_study' }), 'grade'],
    [metadata({ name: 'year' }), null],
    [metadata({ labelTexts: ['大学名'] }), 'schoolName'],
    [metadata({ name: 'university' }), 'schoolName'],
    [metadata({ ariaLabel: '所属大学' }), 'schoolName'],
    [metadata({ labelTexts: ['高校名'] }), null],
    [metadata({ labelTexts: ['研究科'] }), 'departmentName'],
    [metadata({ name: 'graduateSchool' }), 'departmentName'],
    [metadata({ name: 'department' }), null],
    [metadata({ labelTexts: ['専攻・コース'] }), 'majorName'],
    [metadata({ name: 'major' }), 'majorName'],
    [metadata({ name: 'course' }), null],
    [metadata({ labelTexts: ['入学年月'] }), 'enrollmentMonth'],
    [metadata({ name: 'admissionMonth' }), 'enrollmentMonth'],
    [metadata({ labelTexts: ['卒業予定年月'] }), 'graduationMonth'],
    [metadata({ name: 'expectedGraduation' }), 'graduationMonth'],
    [metadata({ labelTexts: ['所属研究室'] }), 'laboratoryName'],
    [metadata({ name: 'laboratory' }), 'laboratoryName'],
    [metadata({ name: 'lab_name' }), 'laboratoryName'],
    [metadata({ labelTexts: ['研究室所属開始年月'] }), 'laboratoryStartMonth'],
    [metadata({ name: 'laboratoryStartMonth' }), 'laboratoryStartMonth'],
    [metadata({ labelTexts: ['研究室所属終了予定年月'] }), 'laboratoryEndMonth'],
    [metadata({ name: 'laboratoryEndMonth' }), 'laboratoryEndMonth'],
    [metadata({ labelTexts: ['研究キーワード'] }), 'researchKeywords'],
    [metadata({ labelTexts: ['商品検索キーワード'] }), null],
    [metadata({ labelTexts: ['キーワード'], fieldsetTexts: ['研究情報'] }), 'researchKeywords'],
    [metadata({ name: 'researchKeywords' }), 'researchKeywords'],
    [metadata({ labelTexts: ['研究概要'] }), 'researchOverview'],
    [metadata({ name: 'researchDescription' }), 'researchOverview'],
  ];

  for (const [fieldMetadata, expected] of cases) {
    assert.equal(classifyField(fieldMetadata), expected, JSON.stringify(fieldMetadata));
  }
});

test('school research classification uses direct legend and rejects shared ambiguous words', () => {
  assert.equal(classifyField(metadata({
    name: 'school',
    contextTexts: ['学校情報'],
  })), null);
  assert.equal(classifyField(metadata({
    name: 'course',
    contextTexts: ['専攻・コース'],
  })), 'majorName');
  assert.equal(classifyField(metadata({
    name: 'department',
    contextTexts: ['研究科'],
  })), 'departmentName');
});

test('split enrollment and graduation selects identify year and month segments', () => {
  const { classifyControl } = require('../autofill.js');
  const cases = [
    [{ name: 'graduationYear' }, { profileKey: 'graduationMonth', segment: 'year' }],
    [{ name: 'graduationMonth' }, { profileKey: 'graduationMonth', segment: 'month' }],
    [{ name: 'admissionYear' }, { profileKey: 'enrollmentMonth', segment: 'year' }],
    [{ name: 'admissionMonth' }, { profileKey: 'enrollmentMonth', segment: 'month' }],
    [{ name: 'laboratoryStartYear' }, { profileKey: 'laboratoryStartMonth', segment: 'year' }],
    [{ name: 'laboratoryEndMonth' }, { profileKey: 'laboratoryEndMonth', segment: 'month' }],
    [{ name: 'year' }, null],
  ];

  for (const [hints, expected] of cases) {
    assert.deepEqual(classifyControl(metadata({ ...hints, tagName: 'select' })), expected);
  }

  assert.deepEqual(classifyControl(metadata({
    name: 'year',
    tagName: 'select',
    fieldsetTexts: ['入学年月'],
  })), { profileKey: 'enrollmentMonth', segment: 'year' });
  assert.equal(classifyControl(metadata({
    name: 'graduationYear',
    ariaLabel: '卒業予定月',
    tagName: 'select',
  })), null);
  assert.equal(classifyControl(metadata({ name: 'admissionYear', tagName: 'input' })), null);
});

class FakeEvent {
  constructor(type, options = {}) {
    this.type = type;
    this.bubbles = Boolean(options.bubbles);
    this.key = options.key || '';
  }
}

class FakeKeyboardEvent extends FakeEvent {}

class FakeLabel {
  constructor(textContent, htmlFor = '', controls = []) {
    this.textContent = textContent;
    this.htmlFor = htmlFor;
    this.controls = controls;
  }

  getAttribute(name) {
    return name === 'for' ? this.htmlFor : null;
  }

  querySelectorAll(selector) {
    return ['input', 'input, select'].includes(selector) ? this.controls : [];
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
    this.tagName = 'INPUT';
    this.onEvent = options.onEvent || null;
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

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }

  closest(selector) {
    return selector === 'label' ? this.parentLabel : null;
  }

  dispatchEvent(event) {
    this.events.push({ type: event.type, bubbles: event.bubbles });
    if (this.onEvent) this.onEvent(event, this);
    return true;
  }

  matches(selector) {
    return selector === ':disabled' ? this.effectivelyDisabled : false;
  }
}

class FakeTextArea extends FakeInput {
  constructor(attributes = {}, options = {}) {
    super(attributes, options);
    this.tagName = 'TEXTAREA';
  }
}

class FakeOption {
  constructor(value, textContent, options = {}) {
    this.value = value;
    this.textContent = textContent;
    this.disabled = Boolean(options.disabled);
  }
}

class FakeAriaOption {
  constructor(textContent, onClick = null) {
    this.tagName = 'DIV';
    this.textContent = textContent;
    this.attributes = { role: 'option', 'aria-selected': 'false' };
    this.onClick = onClick;
    this.parentListbox = null;
  }

  getAttribute(name) { return this.attributes[name] || null; }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  closest(selector) { return selector === '[role="listbox"]' ? this.parentListbox : null; }
  click() { if (this.onClick) this.onClick(this); }
}

class FakeListbox {
  constructor(id, options = []) {
    this.id = id;
    this.attributes = { id, role: 'listbox' };
    this.options = options;
    this.hidden = true;
    for (const option of options) option.parentListbox = this;
  }

  getAttribute(name) { return this.attributes[name] || null; }
  querySelectorAll(selector) { return selector === '[role="option"]' ? this.options : []; }
}

class FakeSpinbutton {
  constructor(segment, value) {
    this.attributes = {
      role: 'spinbutton',
      'data-segment': segment,
      'aria-valuenow': value === null ? '' : String(value),
    };
    this.textContent = value === null ? '' : String(value);
    this.events = [];
    this.focused = false;
    this.tagName = 'SPAN';
  }

  getAttribute(name) { return this.attributes[name] || null; }
  focus() { this.focused = true; }
  dispatchEvent(event) {
    this.events.push({ type: event.type, key: event.key });
    if (event.type === 'keydown' && ['ArrowUp', 'ArrowDown'].includes(event.key)) {
      const delta = event.key === 'ArrowUp' ? 1 : -1;
      const value = Number(this.attributes['aria-valuenow']) + delta;
      this.attributes['aria-valuenow'] = String(value);
      this.textContent = String(value);
    } else if (event.type === 'keydown' && /^\d$/.test(event.key)) {
      const value = `${this.textContent}${event.key}`;
      this.attributes['aria-valuenow'] = value;
      this.textContent = value;
    }
    return true;
  }
}

class FakeMonthGroup {
  constructor(label, year, month) {
    this.tagName = 'DIV';
    this.attributes = {
      role: 'group',
      'aria-label': label,
      'data-date-field-input': '',
    };
    this.segments = {
      year: new FakeSpinbutton('year', year),
      month: new FakeSpinbutton('month', month),
    };
  }

  getAttribute(name) { return this.attributes[name] || null; }
  closest() { return null; }
  querySelector(selector) {
    const segment = /data-segment="(year|month)"/.exec(selector);
    return segment ? this.segments[segment[1]] : null;
  }
}

class FakeSelect {
  constructor(attributes = {}, options = [], state = {}) {
    this.attributes = { ...attributes };
    this.options = options;
    this.disabled = Boolean(state.disabled);
    this.readOnly = Boolean(state.readOnly);
    this.parentLabel = state.parentLabel || null;
    this.effectivelyDisabled = Boolean(state.effectivelyDisabled);
    this.events = [];
    this._value = state.value || '';
    this._selectedIndex = options.findIndex((option) => option.value === this._value);
    this.failOnSet = Boolean(state.failOnSet);
    this.ownerDocument = null;
    this.tagName = 'SELECT';
    this.onEvent = state.onEvent || null;
  }

  get value() {
    return this._value;
  }

  set value(nextValue) {
    if (this.failOnSet) {
      throw new Error('setter failed');
    }
    this._selectedIndex = this.options.findIndex((option) => option.value === nextValue);
    this._value = this._selectedIndex >= 0 ? nextValue : '';
  }

  get selectedIndex() {
    return this._selectedIndex;
  }

  set selectedIndex(nextIndex) {
    if (this.failOnSet) {
      throw new Error('setter failed');
    }
    this._selectedIndex = nextIndex >= 0 && nextIndex < this.options.length
      ? nextIndex
      : -1;
    this._value = this._selectedIndex >= 0
      ? this.options[this._selectedIndex].value
      : '';
  }

  get id() {
    return this.attributes.id || '';
  }

  getAttribute(name) {
    return Object.hasOwn(this.attributes, name) ? this.attributes[name] : null;
  }

  closest(selector) {
    return selector === 'label' ? this.parentLabel : null;
  }

  dispatchEvent(event) {
    this.events.push({ type: event.type, bubbles: event.bubbles });
    if (this.onEvent) this.onEvent(event, this);
    return true;
  }

  matches(selector) {
    return selector === ':disabled' ? this.effectivelyDisabled : false;
  }
}

class FakeDocument {
  constructor(controls = [], labels = [], specialElements = []) {
    this.controls = controls;
    this.labels = labels;
    this.specialElements = specialElements;
    this.defaultView = {
      Event: FakeEvent,
      KeyboardEvent: FakeKeyboardEvent,
      HTMLInputElement: FakeInput,
      HTMLSelectElement: FakeSelect,
      HTMLTextAreaElement: FakeTextArea,
    };
    this.submitCalls = 0;
    this.forms = [{ submit: () => { this.submitCalls += 1; } }];

    for (const control of controls) {
      control.ownerDocument = this;
    }
  }

  querySelectorAll(selector) {
    if (selector === 'input') {
      return this.controls.filter((control) => control.tagName === 'INPUT');
    }
    if (selector === 'select') {
      return this.controls.filter((control) => control.tagName === 'SELECT');
    }
    if (selector === 'input, select') {
      return this.controls;
    }
    if (selector === 'input, select, textarea') {
      return this.controls;
    }
    if (selector === 'textarea') {
      return this.controls.filter((control) => control.tagName === 'TEXTAREA');
    }
    if (selector === 'label[for]') {
      return this.labels;
    }
    if (selector === 'div[role="group"][data-date-field-input]') {
      return this.specialElements.filter((element) => element.tagName === 'DIV');
    }
    if (selector === '[role="option"]') {
      return this.specialElements.flatMap((element) => element.options || []);
    }
    return [];
  }

  getElementById(id) {
    return this.specialElements.find((element) => element.id === id) || null;
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
    contextTexts: [],
    fieldsetTexts: [],
    placeholder: '入力例',
    name: 'field-name',
    id: 'field-id',
    ariaLabel: 'ARIAラベル',
    autocomplete: 'given-name',
    role: '',
    tagName: 'input',
    inputType: 'text',
    optionTexts: [],
  });
});

function parseStandardFixture() {
  const fixturePath = path.join(__dirname, 'fixtures', 'standard-academic-form.html');
  const html = fs.readFileSync(fixturePath, 'utf8');
  const labels = [];
  const controls = [];
  const attributeMap = (source) => Object.fromEntries(
    [...source.matchAll(/([\w-]+)="([^"]*)"/g)].map((match) => [match[1], match[2]]),
  );

  for (const match of html.matchAll(/<label(?:\s+for="([^"]+)")?>([\s\S]*?)<\/label>/gi)) {
    const contents = match[2];
    const text = contents
      .replace(/<select\b[^>]*>[\s\S]*?<\/select>|<textarea\b[^>]*>[\s\S]*?<\/textarea>|<input\b[^>]*>/gi, '')
      .trim();
    const htmlFor = match[1] || '';
    const nestedControls = [];
    const controlMatch = /<(input|select|textarea)\b([^>]*)>/i.exec(contents);
    if (controlMatch) {
      const attrs = attributeMap(controlMatch[2]);
      const nested = controlMatch[1].toLowerCase() === 'select'
        ? new FakeSelect(attrs, [])
        : controlMatch[1].toLowerCase() === 'textarea'
          ? new FakeTextArea(attrs)
          : new FakeInput(attrs);
      nestedControls.push(nested);
      nested.parentLabel = null;
    }
    labels.push(new FakeLabel(text, htmlFor, nestedControls));
  }

  for (const match of html.matchAll(/<select\b([^>]*)>([\s\S]*?)<\/select>|<textarea\b([^>]*)>([\s\S]*?)<\/textarea>|<input\b([^>]*)\/?>/gi)) {
    const tagName = match[1] !== undefined
      ? 'select'
      : match[3] !== undefined
        ? 'textarea'
        : 'input';
    const attrs = attributeMap(match[1] || match[3] || match[5] || '');
    let control;
    if (tagName === 'select') {
      const options = [...(match[2] || '').matchAll(/<option\b([^>]*)>([\s\S]*?)<\/option>/gi)]
        .map((option) => {
          const optionAttrs = attributeMap(option[1]);
          const textContent = option[2].replace(/<[^>]+>/g, '').trim();
          return new FakeOption(optionAttrs.value || textContent, textContent);
        });
      control = new FakeSelect(attrs, options);
    } else if (tagName === 'textarea') {
      control = new FakeTextArea(attrs);
    } else {
      control = new FakeInput(attrs);
    }

    const directLabel = labels.find((label) => label.htmlFor && label.htmlFor === attrs.id)
      || labels.find((label) => label.controls.some((nested) => nested.attributes.name === attrs.name));
    if (directLabel && !directLabel.controls.includes(control)) {
      directLabel.controls.push(control);
      control.parentLabel = directLabel.htmlFor ? null : directLabel;
    }
    controls.push(control);
  }

  return new FakeDocument(controls, labels);
}

test('ordinary HTML academic form fixture fills all matching standard controls', () => {
  const document = parseStandardFixture();
  const byName = Object.fromEntries(document.controls.map((control) => [
    control.attributes.name,
    control,
  ]));

  const result = fillDocument(document, {
    academicCourse: '修士',
    grade: '修士1年',
    schoolName: '秋田県立大学',
    departmentName: 'システム科学技術研究科',
    majorName: '総合システム工学専攻',
    enrollmentMonth: '2026-04',
    graduationMonth: '2028-03',
    laboratoryName: 'Sample Lab',
    laboratoryStartMonth: '2026-04',
    laboratoryEndMonth: '2028-03',
    researchKeywords: ['医療画像処理', '深層学習', 'PET'],
    researchOverview: '画像解析の研究概要',
  });
  assert.deepEqual(
    document.controls.map((control) => control.value),
    ['2', 'm1', '秋田県立大学', 'u-a', 'システム科学技術研究科', 'gs-a',
      '総合システム工学専攻', 'major-a', '2026-04', '2028-03',
      'Sample Lab', '2026-04', '2028-03', '医療画像処理, 深層学習, PET', '画像解析の研究概要'],
  );
  assert.deepEqual(result, { filledCount: 15, failedCount: 0 });

  assert.equal(byName.academicCourse.value, '2');
  assert.equal(byName.grade.value, 'm1');
  assert.equal(byName.university.value, '秋田県立大学');
  assert.equal(byName.universityChoice.value, 'u-a');
  assert.equal(byName.graduateSchoolText.value, 'システム科学技術研究科');
  assert.equal(byName.graduateSchool.value, 'gs-a');
  assert.equal(byName.majorText.value, '総合システム工学専攻');
  assert.equal(byName.major.value, 'major-a');
  assert.equal(byName.admissionMonth.value, '2026-04');
  assert.equal(byName.graduationMonth.value, '2028-03');
  assert.equal(byName.laboratory.value, 'Sample Lab');
  assert.equal(byName.laboratoryStartMonth.value, '2026-04');
  assert.equal(byName.laboratoryEndMonth.value, '2028-03');
  assert.equal(byName.researchKeywords.value, '医療画像処理, 深層学習, PET');
  assert.equal(byName.researchOverview.value, '画像解析の研究概要');
  assert.equal(document.submitCalls, 0);
});

test('split year and month selects receive matching enrollment, graduation, and lab dates', () => {
  const yearOptions = (value) => [
    new FakeOption('2027', '2027年'),
    new FakeOption(value, `${value}年`),
    new FakeOption('2029', '2029年'),
  ];
  const monthOptions = [
    new FakeOption('1', '1月'),
    new FakeOption('3', '3月'),
    new FakeOption('4', '4月'),
  ];
  const controls = [
    new FakeSelect({ name: 'admissionYear' }, yearOptions('2026')),
    new FakeSelect({ name: 'admissionMonth' }, monthOptions),
    new FakeSelect({ name: 'graduationYear' }, yearOptions('2028')),
    new FakeSelect({ name: 'graduationMonth' }, monthOptions),
    new FakeSelect({ name: 'laboratoryStartYear' }, yearOptions('2026')),
    new FakeSelect({ name: 'laboratoryStartMonth' }, monthOptions),
    new FakeSelect({ name: 'laboratoryEndYear' }, yearOptions('2028')),
    new FakeSelect({ name: 'laboratoryEndMonth' }, monthOptions),
  ];
  const document = new FakeDocument(controls);

  assert.deepEqual(fillDocument(document, {
    enrollmentMonth: '2026-04',
    graduationMonth: '2028-03',
    laboratoryStartMonth: '2026-04',
    laboratoryEndMonth: '2028-03',
  }), { filledCount: 8, failedCount: 0 });
  assert.deepEqual(controls.map((control) => control.value), [
    '2026', '4', '2028', '3', '2026', '4', '2028', '3',
  ]);
});

test('custom ARIA year/month segments fill all four month profile fields through spinbutton keys', () => {
  const groups = [
    new FakeMonthGroup('入学年月', 2024, 1),
    new FakeMonthGroup('卒業予定年月', 2024, 1),
    new FakeMonthGroup('研究室所属開始年月', 2024, 1),
    new FakeMonthGroup('研究室所属終了予定年月', 2024, 1),
  ];
  const document = new FakeDocument([], [], groups);
  assert.equal(classifyField(collectFieldMetadata(groups[0], document)), 'enrollmentMonth');

  const result = fillDocument(document, {
    enrollmentMonth: '2026-04',
    graduationMonth: '2028-03',
    laboratoryStartMonth: '2025-10',
    laboratoryEndMonth: '2029-03',
  });
  assert.deepEqual(result, { filledCount: 4, failedCount: 0 }, JSON.stringify(groups.map((group) => [
    group.segments.year.attributes,
    group.segments.month.attributes,
    group.segments.year.events.slice(0, 3),
  ])));
  assert.deepEqual(groups.map((group) => [
    group.segments.year.getAttribute('aria-valuenow'),
    group.segments.month.getAttribute('aria-valuenow'),
  ]), [['2026', '4'], ['2028', '3'], ['2025', '10'], ['2029', '3']]);
  assert.equal(document.submitCalls, 0);
});

test('custom spinbutton segments accept typed digits when their current segment is blank', () => {
  const group = new FakeMonthGroup('研究室所属開始年月', null, null);
  const document = new FakeDocument([], [], [group]);

  assert.deepEqual(fillDocument(document, { laboratoryStartMonth: '2025-10' }), {
    filledCount: 1,
    failedCount: 0,
  });
  assert.equal(group.segments.year.getAttribute('aria-valuenow'), '2025');
  assert.equal(group.segments.month.getAttribute('aria-valuenow'), '10');
});

test('blank spinbutton segments respect their declared value range', () => {
  const group = new FakeMonthGroup('入学年月', null, null);
  group.segments.year.attributes['aria-valuemin'] = '1900';
  group.segments.year.attributes['aria-valuemax'] = '2100';
  const document = new FakeDocument([], [], [group]);

  assert.deepEqual(fillDocument(document, { enrollmentMonth: '2200-04' }), {
    filledCount: 0,
    failedCount: 1,
  });
  assert.equal(group.segments.year.getAttribute('aria-valuenow'), null);
  assert.equal(group.segments.year.events.length, 0);
});

test('spinbutton adjustment stops when keyboard input moves away from the target', () => {
  const group = new FakeMonthGroup('入学年月', 2024, 1);
  const year = group.segments.year;
  year.dispatchEvent = (event) => {
    year.events.push({ type: event.type, key: event.key });
    if (event.type === 'keydown' && event.key === 'ArrowUp') {
      year.attributes['aria-valuenow'] = String(Number(year.getAttribute('aria-valuenow')) - 1);
      year.textContent = year.getAttribute('aria-valuenow');
    }
    return true;
  };
  const document = new FakeDocument([], [], [group]);

  assert.deepEqual(fillDocument(document, { enrollmentMonth: '2026-04' }), {
    filledCount: 0,
    failedCount: 1,
  });
  assert.equal(year.getAttribute('aria-valuenow'), '2023');
  assert.equal(year.events.filter((event) => event.type === 'keydown').length, 1);
});

test('custom month group skips disabled and readonly ARIA segments', () => {
  const group = new FakeMonthGroup('入学年月', 2024, 1);
  group.attributes['aria-disabled'] = 'true';
  const readOnlyGroup = new FakeMonthGroup('卒業予定年月', 2024, 1);
  readOnlyGroup.segments.month.attributes['aria-readonly'] = 'true';
  const document = new FakeDocument([], [], [group, readOnlyGroup]);

  assert.deepEqual(fillDocument(document, {
    enrollmentMonth: '2026-04',
    graduationMonth: '2028-03',
  }), { filledCount: 0, failedCount: 0 });
  assert.equal(group.segments.year.getAttribute('aria-valuenow'), '2024');
  assert.equal(readOnlyGroup.segments.year.getAttribute('aria-valuenow'), '2024');
});

test('custom month group preflights both segments before changing either value', () => {
  const disabledMonth = new FakeMonthGroup('入学年月', 2024, 1);
  disabledMonth.segments.month.attributes['aria-disabled'] = 'true';
  const outOfRangeMonth = new FakeMonthGroup('卒業予定年月', 2024, 1);
  outOfRangeMonth.segments.month.attributes['aria-valuemax'] = '9';
  const document = new FakeDocument([], [], [disabledMonth, outOfRangeMonth]);

  const result = fillDocument(document, {
    enrollmentMonth: '2026-04',
    graduationMonth: '2028-10',
  });
  assert.deepEqual(result, { filledCount: 0, failedCount: 1 });
  assert.equal(disabledMonth.segments.year.getAttribute('aria-valuenow'), '2024');
  assert.equal(outOfRangeMonth.segments.year.getAttribute('aria-valuenow'), '2024');
});

test('ARIA school combobox selects only an exact visible option then fills dependent selects in order', async () => {
  const order = [];
  const department = new FakeSelect({ name: 'graduateSchool' }, [], { disabled: true });
  const major = new FakeSelect({ name: 'major' }, [], { disabled: true });
  const listbox = new FakeListbox('school-options');
  const school = new FakeInput({
    'aria-label': '学校名',
    role: 'combobox',
    'aria-autocomplete': 'list',
    'aria-expanded': 'false',
    'aria-controls': 'school-options',
  }, {
    onEvent(event, input) {
      if (event.type === 'input') setTimeout(() => { listbox.hidden = false; }, 5);
    },
  });
  const schoolForm = {};
  school.form = department.form = major.form = schoolForm;
  listbox.options.push(new FakeAriaOption('秋田県立大学（別キャンパス）'));
  listbox.options.push(new FakeAriaOption('秋田県立大学', (option) => {
    order.push('school');
    option.setAttribute('aria-selected', 'true');
    listbox.hidden = true;
    school.setAttribute('aria-expanded', 'false');
    setTimeout(() => {
      department.disabled = false;
      department.options = [new FakeOption('dept-1', 'システム科学技術研究科')];
    }, 5);
    department.onEvent = (event) => {
      if (event.type === 'change') {
        order.push('department');
        major.disabled = false;
        major.options = [new FakeOption('major-1', '総合システム工学専攻')];
      }
    };
  }));
  for (const option of listbox.options) option.parentListbox = listbox;
  major.onEvent = (event) => { if (event.type === 'change') order.push('major'); };
  const document = new FakeDocument([school, department, major], [], [listbox]);

  assert.deepEqual(await fillDocumentAsync(document, {
    schoolName: '秋田県立大学',
    departmentName: 'システム科学技術研究科',
    majorName: '総合システム工学専攻',
  }, { waitTimeoutMs: 200, pollIntervalMs: 2 }), { filledCount: 3, failedCount: 0 });
  assert.deepEqual(order, ['school', 'department', 'major']);
  assert.equal(school.value, '秋田県立大学');
  assert.equal(department.value, 'dept-1');
  assert.equal(major.value, 'major-1');
  assert.equal(document.submitCalls, 0);
});

test('multiple school forms only fill dependent selects in the selected school scope', async () => {
  const firstListbox = new FakeListbox('school-one-options');
  const secondListbox = new FakeListbox('school-two-options');
  const firstSchool = new FakeInput({
    'aria-label': '学校名', role: 'combobox', 'aria-autocomplete': 'list',
    'aria-expanded': 'false', 'aria-controls': 'school-one-options',
  }, { onEvent(event) { if (event.type === 'input') firstListbox.hidden = false; } });
  const secondSchool = new FakeInput({
    'aria-label': '学校名', role: 'combobox', 'aria-autocomplete': 'list',
    'aria-expanded': 'false', 'aria-controls': 'school-two-options',
  }, { onEvent(event) { if (event.type === 'input') secondListbox.hidden = false; } });
  firstListbox.options = [new FakeAriaOption('秋田県立大学', (option) => {
    option.setAttribute('aria-selected', 'true');
    firstListbox.hidden = true;
    firstSchool.setAttribute('aria-expanded', 'false');
  })];
  secondListbox.options = [new FakeAriaOption('秋田県立大学')];
  for (const option of firstListbox.options) option.parentListbox = firstListbox;
  for (const option of secondListbox.options) option.parentListbox = secondListbox;
  const firstDepartment = new FakeSelect({ name: 'graduateSchool' }, [
    new FakeOption('dep-one', 'システム科学技術研究科'),
  ]);
  const secondDepartment = new FakeSelect({ name: 'graduateSchool' }, [
    new FakeOption('dep-two', 'システム科学技術研究科'),
  ], { disabled: true });
  const formOne = {};
  const formTwo = {};
  firstSchool.form = firstDepartment.form = formOne;
  secondSchool.form = secondDepartment.form = formTwo;
  const document = new FakeDocument(
    [firstSchool, firstDepartment, secondSchool, secondDepartment],
    [],
    [firstListbox, secondListbox],
  );

  const result = await fillDocumentAsync(document, {
    schoolName: '秋田県立大学',
    departmentName: 'システム科学技術研究科',
  }, { waitTimeoutMs: 100, pollIntervalMs: 2 });
  assert.deepEqual(result, { filledCount: 2, failedCount: 0 });
  assert.equal(firstDepartment.value, 'dep-one');
  assert.equal(secondDepartment.value, '');
});

test('ARIA combobox with no exact option does not report school or dependent fields filled', async () => {
  const listbox = new FakeListbox('school-options', [new FakeAriaOption('秋田県立大学大学院')]);
  const school = new FakeInput({
    'aria-label': '学校名', role: 'combobox', 'aria-autocomplete': 'list',
    'aria-expanded': 'false', 'aria-controls': 'school-options',
  }, {
    value: '以前の学校',
    onEvent(event) { if (event.type === 'input') listbox.hidden = false; },
  });
  const department = new FakeSelect({ name: 'graduateSchool' }, [], { disabled: true });
  const document = new FakeDocument([school, department], [], [listbox]);
  school.form = department.form = {};

  assert.deepEqual(await fillDocumentAsync(document, {
    schoolName: '秋田県立大学', departmentName: 'システム科学技術研究科',
  }, { waitTimeoutMs: 20, pollIntervalMs: 1 }), { filledCount: 0, failedCount: 1 });
  assert.equal(school.value, '以前の学校');
  assert.equal(department.value, '');
  assert.equal(document.submitCalls, 0);
});

test('disabled ARIA school combobox is left unchanged and not focused or counted', async () => {
  const listbox = new FakeListbox('school-options', [new FakeAriaOption('秋田県立大学')]);
  listbox.hidden = false;
  listbox.options[0].parentListbox = listbox;
  const school = new FakeInput({
    'aria-label': '学校名', role: 'combobox', 'aria-autocomplete': 'list',
    'aria-expanded': 'true', 'aria-controls': 'school-options',
  }, { disabled: true, value: '前の値' });
  const document = new FakeDocument([school], [], [listbox]);

  assert.deepEqual(await fillDocumentAsync(document, { schoolName: '秋田県立大学' }, {
    waitTimeoutMs: 20,
    pollIntervalMs: 1,
  }), { filledCount: 0, failedCount: 1 });
  assert.equal(school.value, '前の値');
  assert.deepEqual(school.events, []);
});

test('ordinary school text inputs still fill when an unrelated ARIA combobox is disabled', async () => {
  const combo = new FakeInput({
    'aria-label': '学校名', role: 'combobox', 'aria-autocomplete': 'list',
  }, { disabled: true });
  const ordinarySchool = new FakeInput({ name: 'university' });
  const document = new FakeDocument([combo, ordinarySchool]);

  const result = await fillDocumentAsync(document, { schoolName: '秋田県立大学' });
  assert.equal(ordinarySchool.value, '秋田県立大学');
  assert.equal(combo.value, '');
  assert.equal(result.filledCount, 1);
  assert.equal(result.failedCount, 1);
});

test('ARIA combobox is confirmed when its related hidden selection value changes', async () => {
  const hiddenSchoolId = { value: '' };
  const listbox = new FakeListbox('school-options');
  const school = new FakeInput({
    'aria-label': '学校名', role: 'combobox', 'aria-autocomplete': 'list',
    'aria-expanded': 'true', 'aria-controls': 'school-options',
  }, { onEvent(event) { if (event.type === 'input') listbox.hidden = false; } });
  school.form = { querySelectorAll: () => [hiddenSchoolId] };
  listbox.options = [new FakeAriaOption('秋田県立大学', () => {
    hiddenSchoolId.value = 'site-specific-id';
  })];
  listbox.options[0].parentListbox = listbox;
  const document = new FakeDocument([school], [], [listbox]);

  assert.deepEqual(await fillDocumentAsync(document, { schoolName: '秋田県立大学' }, {
    waitTimeoutMs: 100,
    pollIntervalMs: 2,
  }), { filledCount: 1, failedCount: 0 });
  assert.equal(hiddenSchoolId.value, 'site-specific-id');
  assert.equal(document.submitCalls, 0);
});

test('ARIA combobox text assignment and pre-closed aria-expanded do not prove a selection', async () => {
  const listbox = new FakeListbox('school-options');
  const school = new FakeInput({
    'aria-label': '学校名', role: 'combobox', 'aria-autocomplete': 'list',
    'aria-expanded': 'false', 'aria-controls': 'school-options',
  }, { onEvent(event) { if (event.type === 'input') listbox.hidden = false; } });
  listbox.options = [new FakeAriaOption('秋田県立大学')];
  listbox.options[0].parentListbox = listbox;
  const document = new FakeDocument([school], [], [listbox]);

  assert.deepEqual(await fillDocumentAsync(document, { schoolName: '秋田県立大学' }, {
    waitTimeoutMs: 20,
    pollIntervalMs: 1,
  }), { filledCount: 0, failedCount: 1 });
  assert.equal(school.value, '');
  assert.equal(document.submitCalls, 0);
});

test('ARIA option implemented as a submit button is never clicked', async () => {
  const listbox = new FakeListbox('school-options');
  let optionClicks = 0;
  const unsafeOption = new FakeAriaOption('秋田県立大学', () => { optionClicks += 1; });
  unsafeOption.tagName = 'BUTTON';
  unsafeOption.attributes.type = 'submit';
  listbox.options.push(unsafeOption);
  unsafeOption.parentListbox = listbox;
  const school = new FakeInput({
    'aria-label': '学校名', role: 'combobox', 'aria-autocomplete': 'list',
    'aria-expanded': 'false', 'aria-controls': 'school-options',
  }, { onEvent(event) { if (event.type === 'input') listbox.hidden = false; } });
  const document = new FakeDocument([school], [], [listbox]);

  assert.deepEqual(await fillDocumentAsync(document, { schoolName: '秋田県立大学' }, {
    waitTimeoutMs: 50,
    pollIntervalMs: 2,
  }), { filledCount: 0, failedCount: 1 });
  assert.equal(optionClicks, 0);
  assert.equal(document.submitCalls, 0);
});

test('dependent select waits for its matching option and leaves it unchanged when unavailable', async () => {
  const listbox = new FakeListbox('school-options');
  const school = new FakeInput({
    'aria-label': '学校名', role: 'combobox', 'aria-autocomplete': 'list',
    'aria-expanded': 'false', 'aria-controls': 'school-options',
  }, { onEvent(event) { if (event.type === 'input') listbox.hidden = false; } });
  const department = new FakeSelect({ name: 'graduateSchool' }, [], { disabled: true });
  listbox.options = [new FakeAriaOption('秋田県立大学', (option) => {
    option.setAttribute('aria-selected', 'true');
    listbox.hidden = true;
    school.setAttribute('aria-expanded', 'false');
    department.disabled = false;
  })];
  for (const option of listbox.options) option.parentListbox = listbox;
  const major = new FakeSelect({ name: 'major' }, [
    new FakeOption('old-major', '古い専攻'),
    new FakeOption('major-new', '総合システム工学専攻'),
  ], { value: 'old-major' });
  const schoolForm = {};
  school.form = department.form = major.form = schoolForm;
  const document = new FakeDocument([school, department, major], [], [listbox]);

  assert.deepEqual(await fillDocumentAsync(document, {
    schoolName: '秋田県立大学', departmentName: 'システム科学技術研究科',
  }, { waitTimeoutMs: 20, pollIntervalMs: 1 }), { filledCount: 1, failedCount: 1 });
  assert.equal(department.value, '');
  assert.deepEqual(department.events, []);
  assert.equal(major.value, 'old-major');
  assert.deepEqual(major.events, []);
  assert.equal(document.submitCalls, 0);
});

test('dependent field inserted after school selection is discovered and filled', async () => {
  const listbox = new FakeListbox('school-options');
  const school = new FakeInput({
    'aria-label': '学校名', role: 'combobox', 'aria-autocomplete': 'list',
    'aria-expanded': 'false', 'aria-controls': 'school-options',
  }, { onEvent(event) { if (event.type === 'input') listbox.hidden = false; } });
  const document = new FakeDocument([school], [], [listbox]);
  const newDepartment = new FakeSelect({ name: 'graduateSchool' }, [], { disabled: true });
  const schoolForm = {};
  school.form = newDepartment.form = schoolForm;
  const option = new FakeAriaOption('秋田県立大学', (selectedOption) => {
    selectedOption.setAttribute('aria-selected', 'true');
    listbox.hidden = true;
    school.setAttribute('aria-expanded', 'false');
    setTimeout(() => {
      document.controls.push(newDepartment);
      newDepartment.disabled = false;
      newDepartment.options = [new FakeOption('dep', 'システム科学技術研究科')];
    }, 5);
  });
  option.parentListbox = listbox;
  listbox.options.push(option);

  assert.deepEqual(await fillDocumentAsync(document, {
    schoolName: '秋田県立大学',
    departmentName: 'システム科学技術研究科',
  }, { waitTimeoutMs: 200, pollIntervalMs: 2 }), { filledCount: 2, failedCount: 0 });
  assert.equal(newDepartment.value, 'dep');
});

test('collectFieldMetadata reads select identity and displayed option text', () => {
  const select = new FakeSelect(
    { id: 'sex-field', name: 'sex', 'aria-label': '性別' },
    [new FakeOption('0', '未設定'), new FakeOption('1', ' 男性 ')],
  );
  const document = new FakeDocument([select], [new FakeLabel('性別', 'sex-field')]);

  assert.deepEqual(collectFieldMetadata(select, document), {
    labelTexts: ['性別'],
    contextTexts: [],
    placeholder: '',
    name: 'sex',
    id: 'sex-field',
    ariaLabel: '性別',
    autocomplete: '',
    fieldsetTexts: [],
    tagName: 'select',
    inputType: '',
    optionTexts: ['未設定', '男性'],
    role: '',
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

test('fillDocument fills a LabBase-like form with all eight distinct profile values', () => {
  const familyJa = new FakeInput({ id: 'familyNameJa', name: 'family_name_ja' });
  const givenJa = new FakeInput({ id: 'givenNameJa', name: 'given_name_ja' });
  const familyEn = new FakeInput({ placeholder: 'last name' });
  const givenEn = new FakeInput({ placeholder: 'first name' });
  const birthday = new FakeInput({
    id: 'birthday',
    name: 'birthday',
    type: 'date',
    min: '1900-01-01',
    max: '2100-12-31',
  });
  const gender = new FakeSelect(
    { id: 'sexId', name: 'sexId' },
    [
      new FakeOption('0', '未設定'),
      new FakeOption('1', '男性'),
      new FakeOption('2', '女性'),
      new FakeOption('9', 'その他'),
    ],
  );
  const currentPrefecture = new FakeSelect(
    { id: 'prefectureId', name: 'prefectureId' },
    [new FakeOption('5', '秋田県'), new FakeOption('4', '宮城県')],
  );
  const homePrefecture = new FakeSelect(
    { id: 'homeTownId', name: 'homeTownId' },
    [new FakeOption('site-akita', '秋田県'), new FakeOption('site-miyagi', '宮城県')],
  );
  const document = new FakeDocument(
    [
      familyJa,
      givenJa,
      familyEn,
      givenEn,
      birthday,
      gender,
      currentPrefecture,
      homePrefecture,
    ],
    [new FakeLabel('姓', 'familyNameJa'), new FakeLabel('名', 'givenNameJa')],
  );

  assert.deepEqual(fillDocument(document, {
    familyName: '高橋',
    givenName: '諒丞',
    familyNameLatin: 'TAKAHASHI',
    givenNameLatin: 'RYOSUKE',
    birthDate: '2002-05-18',
    gender: '男性',
    currentPrefecture: '秋田県',
    homePrefecture: '宮城県',
  }), { filledCount: 8, failedCount: 0 });
  assert.deepEqual(
    [familyJa.value, givenJa.value, familyEn.value, givenEn.value],
    ['高橋', '諒丞', 'TAKAHASHI', 'RYOSUKE'],
  );
  assert.equal(birthday.value, '2002-05-18');
  assert.equal(gender.value, '1');
  assert.equal(currentPrefecture.value, '5');
  assert.equal(homePrefecture.value, 'site-miyagi');
  for (const control of [birthday, gender, currentPrefecture, homePrefecture]) {
    assert.deepEqual(control.events, [
      { type: 'input', bubbles: true },
      { type: 'change', bubbles: true },
    ]);
  }
  assert.equal(document.submitCalls, 0);
});

test('select matching uses displayed text instead of site-specific option values', () => {
  const numericSite = new FakeSelect(
    { name: 'gender' },
    [new FakeOption('1', '男性'), new FakeOption('2', '女性')],
  );
  const letterSite = new FakeSelect(
    { name: 'gender' },
    [new FakeOption('M', '男性'), new FakeOption('F', '女性')],
  );
  const document = new FakeDocument([numericSite, letterSite]);

  assert.deepEqual(
    fillDocument(document, { gender: '男性' }),
    { filledCount: 2, failedCount: 0 },
  );
  assert.equal(numericSite.value, '1');
  assert.equal(letterSite.value, 'M');
});

test('select matching preserves the exact displayed option when values are duplicated', () => {
  const select = new FakeSelect(
    { name: 'gender' },
    [new FakeOption('shared', '女性'), new FakeOption('shared', '男性')],
  );
  const document = new FakeDocument([select]);

  assert.deepEqual(
    fillDocument(document, { gender: '男性' }),
    { filledCount: 1, failedCount: 0 },
  );
  assert.equal(select.selectedIndex, 1);
});

test('date inputs reject invalid or out-of-range profile dates without firing events', () => {
  const beforeMinimum = new FakeInput(
    { name: 'birthday', type: 'date', min: '2003-01-01' },
    { value: '2004-01-01' },
  );
  const afterMaximum = new FakeInput(
    { name: 'birthday', type: 'date', max: '2001-12-31' },
    { value: '2000-01-01' },
  );
  const invalidFormat = new FakeInput(
    { name: 'birthday', type: 'date' },
    { value: '2000-02-02' },
  );
  const document = new FakeDocument([beforeMinimum, afterMaximum, invalidFormat]);

  assert.deepEqual(
    fillDocument(document, { birthDate: '2002/05/18' }),
    { filledCount: 0, failedCount: 0 },
  );
  assert.deepEqual(
    [beforeMinimum.value, afterMaximum.value, invalidFormat.value],
    ['2004-01-01', '2000-01-01', '2000-02-02'],
  );
  assert.deepEqual(beforeMinimum.events, []);
  assert.deepEqual(afterMaximum.events, []);
  assert.deepEqual(invalidFormat.events, []);

  assert.deepEqual(
    fillDocument(document, { birthDate: '2002-05-18' }),
    { filledCount: 1, failedCount: 0 },
  );
  assert.equal(invalidFormat.value, '2002-05-18');
});

test('date inputs reject year zero without clearing the existing value', () => {
  const birthday = new FakeInput(
    { name: 'birthday', type: 'date' },
    { value: '2000-01-01' },
  );
  const document = new FakeDocument([birthday]);

  assert.deepEqual(
    fillDocument(document, { birthDate: '0000-01-01' }),
    { filledCount: 0, failedCount: 0 },
  );
  assert.equal(birthday.value, '2000-01-01');
  assert.deepEqual(birthday.events, []);
});

test('fillDocument skips disabled, readonly, unavailable, and ambiguous controls', () => {
  const disabledGender = new FakeSelect(
    { name: 'gender' },
    [new FakeOption('1', '男性')],
    { disabled: true, value: 'old' },
  );
  const readonlyBirthday = new FakeInput(
    { name: 'birthday', type: 'date' },
    { readOnly: true, value: '2000-01-01' },
  );
  const missingOption = new FakeSelect(
    { name: 'prefecture' },
    [new FakeOption('4', '宮城県')],
    { value: '4' },
  );
  const ambiguousLocation = new FakeSelect(
    { 'aria-label': '地域' },
    [new FakeOption('5', '秋田県'), new FakeOption('4', '宮城県')],
    { value: '4' },
  );
  const document = new FakeDocument([
    disabledGender,
    readonlyBirthday,
    missingOption,
    ambiguousLocation,
  ]);

  assert.deepEqual(fillDocument(document, {
    birthDate: '2002-05-18',
    gender: '男性',
    currentPrefecture: '秋田県',
    homePrefecture: '宮城県',
  }), { filledCount: 0, failedCount: 0 });
  assert.equal(disabledGender.value, 'old');
  assert.equal(readonlyBirthday.value, '2000-01-01');
  assert.equal(missingOption.value, '4');
  assert.equal(ambiguousLocation.value, '4');
  assert.equal(document.submitCalls, 0);
});

test('fillDocument leaves unverified custom combobox and spinbutton controls unchanged', () => {
  const combobox = new FakeInput({
    'aria-label': '学校名',
    role: 'combobox',
    'aria-autocomplete': 'list',
  }, { value: '入力して候補選択が必要' });
  const spinbutton = new FakeInput({
    'aria-label': '入学年月',
    role: 'spinbutton',
  }, { value: '2020-01' });
  const document = new FakeDocument([combobox, spinbutton]);

  assert.deepEqual(fillDocument(document, {
    schoolName: '秋田県立大学',
    enrollmentMonth: '2026-04',
  }), { filledCount: 0, failedCount: 0 });
  assert.equal(combobox.value, '入力して候補選択が必要');
  assert.equal(spinbutton.value, '2020-01');
  assert.deepEqual(combobox.events, []);
  assert.deepEqual(spinbutton.events, []);
});

test('shared English-name heading does not override each input own last-name and first-name hints', () => {
  const familyInput = new FakeInput({ placeholder: 'last name' });
  const givenInput = new FakeInput({ placeholder: 'first name' });
  const sharedHeading = new FakeLabel('名前（英字）', '', [familyInput, givenInput]);
  familyInput.parentLabel = sharedHeading;
  givenInput.parentLabel = sharedHeading;
  const document = new FakeDocument([familyInput, givenInput]);

  assert.deepEqual(fillDocument(document, {
    familyNameLatin: 'TAKAHASHI',
    givenNameLatin: 'RYOSUKE',
  }), { filledCount: 2, failedCount: 0 });
  assert.equal(familyInput.value, 'TAKAHASHI');
  assert.equal(givenInput.value, 'RYOSUKE');
});

test('compact and spaced English field names distinguish family name from given name', () => {
  const cases = [
    ['last name', 'familyNameLatin'],
    ['lastname', 'familyNameLatin'],
    ['family name', 'familyNameLatin'],
    ['familyname', 'familyNameLatin'],
    ['surname', 'familyNameLatin'],
    ['first name', 'givenNameLatin'],
    ['firstname', 'givenNameLatin'],
    ['given name', 'givenNameLatin'],
    ['givenname', 'givenNameLatin'],
  ];

  for (const [placeholder, expected] of cases) {
    assert.equal(classifyField(metadata({ placeholder })), expected);
  }
  assert.equal(classifyField(metadata({ placeholder: 'name' })), null);
});

test('generic English-name headings do not identify either individual field', () => {
  assert.equal(classifyField(metadata({ labelTexts: ['名前（英字）'] })), null);
  assert.equal(classifyField(metadata({ labelTexts: ['英字氏名'] })), null);
});
