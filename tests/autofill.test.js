const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  normalizeHint,
  collectFieldMetadata,
  classifyControl,
  classifyField,
  setFormControlValue,
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
    [metadata({ labelTexts: ['姓'] }), null],
    [metadata({ placeholder: '苗字（必須）' }), 'familyName'],
    [metadata({ labelTexts: ['名'] }), null],
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

test('classifyField separates kana names and personal contact fields from other purposes', () => {
  const cases = [
    ...['セイ', '姓カナ', '姓（カナ）', 'フリガナ（姓）', 'ふりがな（姓）', 'family name kana', 'surname kana']
      .map((label) => [metadata({ labelTexts: [label] }), 'familyNameKana']),
    ...['メイ', '名カナ', '名（カナ）', 'フリガナ（名）', 'ふりがな（名）', 'given name kana', 'first name kana']
      .map((label) => [metadata({ labelTexts: [label] }), 'givenNameKana']),
    [metadata({ labelTexts: ['カナ氏名'] }), null],
    [metadata({ labelTexts: ['電話番号'] }), 'phoneNumber'],
    [metadata({ labelTexts: ['固定電話'] }), 'phoneNumber'],
    [metadata({ autocomplete: 'tel' }), 'phoneNumber'],
    [metadata({ labelTexts: ['携帯電話'] }), 'mobilePhone'],
    [metadata({ labelTexts: ['携帯番号'] }), 'mobilePhone'],
    [metadata({ labelTexts: ['郵便番号'] }), 'currentPostalCode'],
    [metadata({ labelTexts: ['市区郡・地名・番地'] }), 'currentAddress'],
    [metadata({ labelTexts: ['建物名・部屋番号'] }), 'currentBuilding'],
    [metadata({ labelTexts: ['都道府県'] }), 'currentPrefecture'],
    [metadata({ labelTexts: ['E-mailアドレス'] }), 'email'],
    [metadata({ labelTexts: ['メールアドレス'] }), 'email'],
    [metadata({ labelTexts: ['携帯アドレス'] }), null],
    [metadata({ labelTexts: ['携帯メール'] }), null],
  ];

  for (const [fieldMetadata, expected] of cases) {
    assert.equal(classifyField(fieldMetadata), expected, JSON.stringify(fieldMetadata));
  }
});

test('current address fields fill by labels and split postal group without clicking search controls', () => {
  const html = fs.readFileSync(path.join(__dirname, 'fixtures', 'current-address-form.html'), 'utf8');
  for (const siteField of [
    'gyubin1', 'gyubin2', 'gken', 'gadrs1', 'gadrs2',
    'gtel1', 'gtel2', 'gtel3', 'kttel1', 'kttel2', 'kttel3',
  ]) {
    assert.match(html, new RegExp(`name="${siteField}"`));
  }
  assert.match(html, /休暇中の連絡先/);
  assert.match(html, /住所検索/);
  const postal1 = new FakeInput({ type: 'text', name: 'gyubin1' });
  const postal2 = new FakeInput({ type: 'text', name: 'gyubin2' });
  const postalLabel = new FakeLabel('郵便番号');
  const postalGroup = new FakeContainer('div', {
    controls: [postal1, postal2], labels: [postalLabel], textContent: '郵便番号 -',
  });
  const prefecture = new FakeSelect({ name: 'gken', id: 'prefecture' }, [
    new FakeOption('', '選択してください'), new FakeOption('秋田県', '秋田県'),
  ]);
  const prefectureLabel = new FakeLabel('都道府県', 'prefecture');
  const address = new FakeInput({ name: 'gadrs1', id: 'address' });
  const building = new FakeInput({ name: 'gadrs2', id: 'building' });
  const vacation = new FakeInput({ name: 'vacation-address', id: 'vacation' });
  const search = { clicks: 0, click() { this.clicks += 1; } };
  const labels = [
    prefectureLabel,
    new FakeLabel('市区郡・地名・番地', 'address'),
    new FakeLabel('建物名・部屋番号', 'building'),
    new FakeLabel('休暇中の連絡先住所', 'vacation'),
  ];
  const controls = [postal1, postal2, prefecture, address, building, vacation];
  const document = new FakeDocument(controls, labels, [search]);
  const currentAddressGroup = new FakeContainer('div', { controls: [prefecture, address, building, vacation] });
  const addressDefinition = new FakeContainer('dd', { children: [currentAddressGroup] });
  addressDefinition.controls = [prefecture, address, building, vacation];
  new FakeContainer('div', {
    children: [new FakeContainer('dt', { textContent: '現住所' }), addressDefinition],
  });
  // Labels and field grouping model the visible site structure; name attributes are only fixture locators.
  prefecture.parentElement = currentAddressGroup;
  address.parentElement = currentAddressGroup;
  building.parentElement = currentAddressGroup;
  vacation.parentElement = currentAddressGroup;
  postal1.parentElement = postalGroup;
  postal2.parentElement = postalGroup;
  const result = fillDocument(document, {
    currentPostalCode: '010-0001',
    currentPrefecture: '秋田県',
    currentAddress: '秋田市山王1-1',
    currentBuilding: '県庁マンション101',
  });

  assert.equal(classifyControl(collectFieldMetadata(address, document))?.profileKey, 'currentAddress');

  assert.deepEqual(
    [result.filledCount, postal1.value, postal2.value, prefecture.value, address.value, building.value],
    [5, '010', '0001', '秋田県', '秋田市山王1-1', '県庁マンション101'],
  );
  assert.deepEqual([postal1.value, postal2.value], ['010', '0001']);
  assert.equal(prefecture.value, '秋田県');
  assert.equal(address.value, '秋田市山王1-1');
  assert.equal(building.value, '県庁マンション101');
  assert.equal(vacation.value, '');
  assert.equal(search.clicks, 0);
});

test('current address range uses sibling headings, syncs jqTransform, and excludes vacation fields', () => {
  const html = fs.readFileSync(path.join(__dirname, 'fixtures', 'current-address-dual-form.html'), 'utf8');
  assert.match(html, /現住所/);
  assert.match(html, /休暇中の連絡先/);
  assert.match(html, /現住所と同じ場合はこちらにチェックしてください/);
  assert.equal((html.match(/type="button"/g) || []).length, 4);

  const controls = [];
  const searchButtons = [];
  const makeDefinition = (label, prefix) => {
    const term = new FakeContainer('dt', { textContent: label });
    let fields;
    let result;
    let child;
    if (label === '郵便番号') {
      const postal = [
        new FakeInput({ type: 'text', id: `${prefix}-postal-1`, maxlength: '3' }),
        new FakeInput({ type: 'text', id: `${prefix}-postal-2`, maxlength: '4' }),
      ];
      const searchInput = new FakeInput({ type: 'button', id: `${prefix}-search-input` });
      const searchButton = { tagName: 'BUTTON', clicks: 0, click() { this.clicks += 1; } };
      const hyphen = new FakeLabel('-');
      const firstWrapper = new FakeContainer('span', { controls: [postal[0]], children: [postal[0]] });
      const secondWrapper = new FakeContainer('span', { controls: [postal[1]], children: [postal[1]] });
      firstWrapper.className = 'jqTransformInputWrapper';
      secondWrapper.className = 'jqTransformInputWrapper';
      const postalGroup = new FakeContainer('span', {
        controls: postal, labels: [hyphen],
        children: [firstWrapper, hyphen, secondWrapper, searchButton],
      });
      const secondarySearchGroup = new FakeContainer('span', {
        controls: [searchInput], children: [searchInput],
      });
      const definition = new FakeContainer('dd', {
        controls: [...postal, searchInput], labels: [hyphen],
        children: [postalGroup, secondarySearchGroup],
      });
      postal[0].parentElement = firstWrapper;
      postal[1].parentElement = secondWrapper;
      searchInput.parentElement = secondarySearchGroup;
      hyphen.parentElement = postalGroup;
      searchButtons.push(searchButton, searchInput);
      fields = postal;
      result = { postal };
      child = postalGroup;
      controls.push(...postal, searchInput);
      return { term, definition, fields, result, child };
    }
    if (label === 'Prefecture') {
      const select = new FakeSelect({ id: `${prefix}-prefecture`, class: 'jqTransformHidden' }, [
        new FakeOption('', 'Choose'), new FakeOption('pref-a', 'Prefecture A'),
      ]);
      let displayText = 'Choose';
      const selectedClasses = select.options.map(() => new Set());
      const links = select.options.map((option, index) => ({
        tagName: 'A', textContent: option.textContent,
        getAttribute(name) { return name === 'index' ? String(index) : null; },
        classList: {
          contains(name) { return selectedClasses[index].has(name); },
          add(name) { selectedClasses[index].add(name); },
          remove(name) { selectedClasses[index].delete(name); },
        },
      }));
      const display = {
        tagName: 'SPAN', get textContent() { return displayText; },
        set textContent(value) { displayText = value; },
      };
      const bar = { tagName: 'DIV' };
      const open = {
        tagName: 'A', previousElementSibling: display, parentElement: bar,
        getAttribute(name) { return name === 'class' ? 'jqTransformSelectOpen' : null; },
      };
      display.parentElement = bar;
      const list = { tagName: 'UL' };
      const wrapper = {
        tagName: 'DIV', className: 'jqTransformSelectWrapper', parentElement: null,
        children: [select],
        classList: { contains(name) { return name === 'jqTransformSelectWrapper'; } },
        querySelectorAll(selector) {
          if (selector === 'input, select, textarea') return [select];
          if (selector === 'a.jqTransformSelectOpen') return [open];
          if (selector === 'div > span') return [display];
          if (selector === 'ul') return [list];
          if (selector === 'ul > li > a') return links;
          if (selector === 'a') return [open, ...links];
          return [];
        },
      };
      const definition = new FakeContainer('dd', { controls: [select], children: [wrapper] });
      select.parentElement = wrapper;
      wrapper.parentElement = definition;
      fields = [select];
      result = { prefecture: select, display, selectedClasses };
      child = wrapper;
      controls.push(select);
      return { term, definition, fields, result, child };
    }
    const input = new FakeInput({ type: 'text', id: `${prefix}-${label}` });
    const definition = new FakeContainer('dd', { controls: [input], children: [input] });
    fields = [input];
    result = { [label]: input };
    controls.push(input);
    return { term, definition, fields, result, child: input };
  };
  const makeAddressSet = (prefix) => [
    makeDefinition('郵便番号', prefix), makeDefinition('Prefecture', prefix),
    makeDefinition('Street address', prefix), makeDefinition('Building', prefix),
  ];
  const current = makeAddressSet('current');
  const vacation = makeAddressSet('vacation');
  const phone = ['Fixed telephone', 'Mobile telephone'].map((label, index) => {
    const initial = index === 0 ? ['03', '1234', '5678'] : ['090', '2345', '6789'];
    const fields = [1, 2, 3].map((part) => new FakeInput(
      { type: 'text', id: `phone-${index}-${part}` }, { value: initial[part - 1] },
    ));
    controls.push(...fields);
    return { term: new FakeContainer('dt', { textContent: label }),
      definition: new FakeContainer('dd', { controls: fields, children: fields }) };
  });
  const currentHeading = new FakeContainer('div', { textContent: '現住所' });
  const vacationHeading = new FakeContainer('div', { textContent: '休暇中の連絡先' });
  const auxiliaryHeading = new FakeContainer('div', {
    textContent: '現住所と同じ場合はこちらにチェックしてください。',
  });
  const siblings = [currentHeading];
  for (const [index, entry] of current.entries()) {
    siblings.push(new FakeContainer('dl', { children: [entry.term, entry.definition] }));
    if (index === 0) siblings.push(new FakeContainer('div', { textContent: 'Please enter complete details.' }));
  }
  for (const entry of phone) {
    siblings.push(new FakeContainer('dl', { children: [entry.term, entry.definition] }));
  }
  siblings.push(vacationHeading, auxiliaryHeading);
  for (const entry of vacation) {
    siblings.push(new FakeContainer('dl', { children: [entry.term, entry.definition] }));
  }
  const commonParent = new FakeContainer('div', { children: siblings });
  commonParent.className = 'eswrap';
  const document = new FakeDocument(controls);
  const result = fillDocument(document, {
    currentPostalCode: '1234567',
    currentPrefecture: 'Prefecture A',
    currentAddress: 'Current street',
    currentBuilding: 'Current building',
  });
  assert.equal(result.filledCount, 5);
  assert.deepEqual(current[0].result.postal.map((control) => control.value), ['123', '4567']);
  assert.equal(current[1].result.prefecture.value, 'pref-a');
  assert.equal(current[1].result.display.textContent, 'Prefecture A');
  assert.ok(current[1].result.selectedClasses[1].has('selected'));
  assert.equal(current[2].result['Street address'].value, 'Current street');
  assert.equal(current[3].result.Building.value, 'Current building');
  assert.deepEqual(phone.map(({ definition }) => definition.controls.map((control) => control.value)), [
    ['03', '1234', '5678'], ['090', '2345', '6789'],
  ]);
  assert.deepEqual(vacation[0].result.postal.map((control) => control.value), ['', '']);
  assert.equal(vacation[1].result.prefecture.value, '');
  assert.equal(vacation[2].result['Street address'].value, '');
  assert.equal(vacation[3].result.Building.value, '');
  assert.deepEqual([searchButtons[0].clicks, searchButtons[2].clicks], [0, 0]);
  assert.deepEqual([searchButtons[1].value, searchButtons[3].value], ['', '']);
});

test('ambiguous sibling address headings leave the field unchanged', () => {
  const input = new FakeInput({ type: 'text' }, { value: 'Existing value' });
  const term = new FakeContainer('dt', { textContent: 'Street address' });
  const definition = new FakeContainer('dd', { controls: [input], children: [input] });
  const dl = new FakeContainer('dl', { children: [term, definition] });
  const firstHeading = new FakeContainer('div', { textContent: '現住所' });
  const secondHeading = new FakeContainer('div', { textContent: '現住所' });
  new FakeContainer('div', { children: [firstHeading, secondHeading, dl] });

  assert.deepEqual(fillDocument(new FakeDocument([input]), {
    currentAddress: 'Replacement address',
  }), { filledCount: 0, failedCount: 0 });
  assert.equal(input.value, 'Existing value');
});

test('empty fixed phone profile value preserves typed fixed phone and never borrows mobile value', () => {
  const fixed = [1, 2, 3].map((index) => new FakeInput({ type: 'text', name: `gtel${index}` }, {
    value: ['018', '123', '4567'][index - 1],
  }));
  const mobile = [1, 2, 3].map((index) => new FakeInput({ type: 'text', name: `kttel${index}` }));
  const labels = [new FakeLabel('固定電話番号'), new FakeLabel('携帯電話番号')];
  const fixedGroup = new FakeContainer('div', {
    controls: fixed, labels: [labels[0]], textContent: '固定電話番号--',
  });
  const mobileGroup = new FakeContainer('div', {
    controls: mobile, labels: [labels[1]], textContent: '携帯電話番号--',
  });
  const document = new FakeDocument([...fixed, ...mobile], labels);

  assert.deepEqual(fillDocument(document, {
    phoneNumber: '', mobilePhone: '090-1234-5678',
  }), { filledCount: 3, failedCount: 0 });
  assert.deepEqual(fixed.map((control) => control.value), ['018', '123', '4567']);
  assert.deepEqual(mobile.map((control) => control.value), ['090', '1234', '5678']);
});

test('multiple postal groups are ambiguous and remain unchanged', () => {
  const groups = [0, 1].map((index) => {
    const fields = [
      new FakeInput({ type: 'text', name: `postal${index}a` }, { value: '111' }),
      new FakeInput({ type: 'text', name: `postal${index}b` }, { value: '2222' }),
    ];
    const group = new FakeContainer('div', {
      controls: fields,
      labels: [new FakeLabel('郵便番号')],
    });
    return fields;
  });
  const document = new FakeDocument(groups.flat());

  assert.deepEqual(fillDocument(document, { currentPostalCode: '0100001' }), {
    filledCount: 0,
    failedCount: 0,
  });
  assert.deepEqual(groups.map((group) => group.map((control) => control.value)), [
    ['111', '2222'],
    ['111', '2222'],
  ]);
});

test('duplicate current address controls are ambiguous and remain unchanged', () => {
  const first = new FakeInput({ type: 'text', id: 'address-one' }, { value: '入力済み1' });
  const second = new FakeInput({ type: 'text', id: 'address-two' }, { value: '入力済み2' });
  const labels = [
    new FakeLabel('市区郡・地名・番地', 'address-one'),
    new FakeLabel('市区郡・地名・番地', 'address-two'),
  ];
  const document = new FakeDocument([first, second], labels);

  assert.deepEqual(fillDocument(document, { currentAddress: '秋田市山王1-1' }), {
    filledCount: 0,
    failedCount: 0,
  });
  assert.deepEqual([first.value, second.value], ['入力済み1', '入力済み2']);
});

test('bare surname and given-name labels need group or standard autocomplete context', () => {
  assert.equal(classifyField(metadata({ labelTexts: ['姓'] })), null);
  assert.equal(classifyField(metadata({ labelTexts: ['名'] })), null);
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
    this.parentElement = null;
    this.tagName = 'LABEL';
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
    this.parentElement = options.parentElement || null;
    this.effectivelyDisabled = Boolean(options.effectivelyDisabled);
    this.checked = Boolean(options.checked);
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
    if (selector === 'label' && this.parentLabel) return this.parentLabel;
    let current = this.parentElement;
    while (current) {
      if (selector === current.tagName.toLowerCase()) return current;
      current = current.parentElement;
    }
    return null;
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

class FakeContainer {
  constructor(tagName, { controls = [], labels = [], parentElement = null, children = [], textContent = '' } = {}) {
    this.tagName = tagName.toUpperCase();
    this.controls = controls;
    this.labels = labels;
    this.children = children;
    this.parentElement = parentElement;
    this.textContent = textContent;
    this.previousElementSibling = null;
    for (const control of controls) control.parentElement = this;
    for (const label of labels) label.parentElement = this;
    for (let index = 0; index < children.length; index += 1) {
      children[index].parentElement = this;
      children[index].previousElementSibling = children[index - 1] || null;
      children[index].nextElementSibling = children[index + 1] || null;
    }
  }

  querySelectorAll(selector) {
    if (selector === 'label' || selector === 'label[for]') return this.labels;
    if (selector === 'dt') return this.children.filter((child) => child.tagName === 'DT');
    if (selector === 'dd') return this.children.filter((child) => child.tagName === 'DD');
    if (selector === 'input, select, textarea' || selector === 'input, select') return this.controls;
    if (selector === 'input[type="radio"]') return this.controls.filter((control) => control.type === 'radio');
    if (selector === 'input, select, textarea') return this.controls;
    if (selector === 'input[type="tel"], input[type="text"], input[type="email"]') {
      return this.controls.filter((control) => ['tel', 'text', 'email'].includes(control.type));
    }
    if (selector === 'th, td') return this.children.filter((child) => ['TH', 'TD'].includes(child.tagName));
    return [];
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
    this.requestSubmitCalls = 0;
    this.forms = [{
      submit: () => { this.submitCalls += 1; },
      requestSubmit: () => { this.requestSubmitCalls += 1; },
    }];

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
    if (selector === 'label') {
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

function educationFixtureField(label, control) {
  const term = new FakeContainer('dt', { textContent: label });
  const definition = new FakeContainer('dd', { controls: [control], children: [control] });
  const row = new FakeContainer('dl', { children: [term, definition] });
  row.controls = [control];
  return { row, control };
}

function educationFixtureHeading(text, className = '') {
  const heading = new FakeContainer('div', { textContent: text });
  heading.className = className;
  return heading;
}

function jqTransformFixtureWrapper(select) {
  const wrapper = new FakeContainer('span', { controls: [select], children: [select] });
  wrapper.className = 'jqTransformSelectWrapper';
  wrapper.classList = { contains: (name) => name === 'jqTransformSelectWrapper' };
  const display = { tagName: 'SPAN', textContent: '', parentElement: null };
  const optionLinks = select.options.map((option, index) => {
    const classes = new Set();
    return {
      tagName: 'A', textContent: option.textContent,
      getAttribute: (name) => name === 'index' ? String(index) : null,
      classList: {
        contains: (name) => classes.has(name),
        add: (name) => classes.add(name),
        remove: (name) => classes.delete(name),
      },
    };
  });
  const open = { tagName: 'A', previousElementSibling: display, parentElement: null };
  const displayHost = { children: [display, open] };
  display.parentElement = displayHost;
  open.parentElement = displayHost;
  const list = { tagName: 'UL' };
  wrapper.querySelectorAll = (selector) => ({
    'input, select, textarea': [select],
    'a.jqTransformSelectOpen': [open],
    'div > span': [display],
    ul: [list],
    'ul > li > a': optionLinks,
    a: [open, ...optionLinks],
  }[selector] || []);
  select.jqDisplay = display;
  return wrapper;
}

function educationDateField(label, date) {
  const [yearValue, monthValue] = date.split('-');
  const year = new FakeSelect({}, [new FakeOption('', '年'), new FakeOption(yearValue, `${yearValue}年`)]);
  const month = new FakeSelect({}, [new FakeOption('', '月'), new FakeOption(monthValue, `${Number(monthValue)}月`)]);
  const yearWrapper = jqTransformFixtureWrapper(year);
  const monthWrapper = jqTransformFixtureWrapper(month);
  const yearLabel = new FakeLabel('年');
  const monthLabel = new FakeLabel('月');
  const term = new FakeContainer('dt', { textContent: label });
  const definition = new FakeContainer('dd', {
    labels: [yearLabel, monthLabel],
    children: [yearWrapper, yearLabel, monthWrapper, monthLabel],
  });
  definition.controls = [year, month];
  const row = new FakeContainer('dl', { children: [term, definition] });
  row.controls = [year, month];
  return { row, controls: [year, month], year, month };
}

function textFromFixtureMarkup(markup) {
  return String(markup || '').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
}

function educationDocumentFromFixtureHtml(html) {
  const formBody = /<form>\s*<div[^>]*>([\s\S]*)<\/div>\s*<\/form>/.exec(html)?.[1] || '';
  const blocks = formBody.match(/<div\b[^>]*>[\s\S]*?<\/div>|<dl\b[^>]*>[\s\S]*?<\/dl>/g) || [];
  const children = [];
  const controls = [];
  const rows = [];

  for (const block of blocks) {
    if (/^<div\b/.test(block)) {
      const className = /\bclass="([^"]*)"/.exec(block)?.[1] || '';
      children.push(educationFixtureHeading(textFromFixtureMarkup(block), className));
      continue;
    }
    const match = /^<dl\b[^>]*>\s*<dt[^>]*>([\s\S]*?)<\/dt>\s*<dd[^>]*>([\s\S]*?)<\/dd>\s*<\/dl>$/.exec(block);
    assert.ok(match, 'fixture DL must contain one DT followed by one DD');
    const termText = textFromFixtureMarkup(match[1]);
    const definitionMarkup = match[2];
    const definitionChildren = [];
    const definitionControls = [];
    const definitionLabels = [];
    const items = definitionMarkup.match(/<input\b[^>]*>|<span\b[^>]*jqTransformSelectWrapper[^>]*>[\s\S]*?<\/span>|<select\b[^>]*>[\s\S]*?<\/select>|<label\b[^>]*>[\s\S]*?<\/label>/g) || [];
    for (const item of items) {
      if (/^<input\b/.test(item)) {
        const type = /\btype="([^"]+)"/.exec(item)?.[1] || 'text';
        const control = new FakeInput({ type });
        definitionChildren.push(control);
        definitionControls.push(control);
        controls.push(control);
      } else if (/^<span\b/.test(item) || /^<select\b/.test(item)) {
        const selectMarkup = /<select\b[^>]*>([\s\S]*?)<\/select>/.exec(item)?.[1] || '';
        const options = [...selectMarkup.matchAll(/<option\b[^>]*value="([^"]*)"[^>]*>([\s\S]*?)<\/option>/g)]
          .map((option) => new FakeOption(option[1], textFromFixtureMarkup(option[2])));
        const control = new FakeSelect({}, options);
        definitionChildren.push(/^<span\b/.test(item) ? jqTransformFixtureWrapper(control) : control);
        definitionControls.push(control);
        controls.push(control);
      } else {
        const label = new FakeLabel(textFromFixtureMarkup(item));
        definitionChildren.push(label);
        definitionLabels.push(label);
      }
    }
    const term = new FakeContainer('dt', { textContent: termText });
    const definition = new FakeContainer('dd', {
      labels: definitionLabels,
      children: definitionChildren,
    });
    definition.controls = definitionControls;
    const row = new FakeContainer('dl', { children: [term, definition] });
    row.controls = definitionControls;
    children.push(row);
    rows.push({ term: termText, controls: definitionControls });
  }
  const root = new FakeContainer('div', { children });
  root.controls = controls;
  return { document: new FakeDocument(controls), rows };
}

test('realistic education HTML classifies decorated mixed-node DT labels by school section', () => {
  const html = fs.readFileSync(path.join(__dirname, 'fixtures', 'education-history-form.html'), 'utf8');
  const { document, rows } = educationDocumentFromFixtureHtml(html);
  const profile = {
    schoolName: '旧プロフィール大学',
    finalEducation: { level: 'doctorate', completionStatus: 'completed' },
    educationHistory: {
      middleSchool: {
        schoolName: '市立中学校', enrollmentMonth: '2020-04', graduationMonth: '2023-03',
      },
      highSchool: {
        schoolName: '県立高等学校', enrollmentMonth: '2023-04', graduationMonth: '2026-03',
      },
      bachelor: {
        universityName: '学士大学', facultyName: '理工学部', departmentName: '情報学科',
        enrollmentMonth: '2026-04', graduationMonth: '2030-03',
      },
      master: {
        graduateSchoolName: '修士大学院', graduateDepartmentName: '工学研究科', majorName: '情報専攻',
        enrollmentMonth: '2030-04', completionMonth: '2032-03',
      },
    },
  };

  fillDocument(document, profile);

  assert.equal(rows[0].controls[0].value, '市立中学校');
  assert.deepEqual(rows[1].controls.map((control) => control.value), ['2020', '4', '2023', '3']);
  assert.equal(rows[2].controls[0].value, '県立高等学校');
  assert.deepEqual(rows[3].controls.map((control) => control.value), ['2023', '4', '2026', '3']);
  assert.deepEqual(rows.slice(4, 7).map((row) => row.controls[0].value), ['学士大学', '理工学部', '情報学科']);
  assert.deepEqual(rows[7].controls.map((control) => control.value), ['2026', '4', '2030', '3']);
  assert.deepEqual(rows.slice(8, 11).map((row) => row.controls[0].value), ['修士大学院', '工学研究科', '情報専攻']);
  for (const row of [rows[1], rows[3], rows[7]]) {
    for (const control of row.controls) {
      assert.equal(control.jqDisplay.textContent, control.options[control.selectedIndex].textContent);
    }
  }
});

test('bachelor-prefixed field labels are not assigned in another school section', () => {
  const control = new FakeInput();
  const root = new FakeContainer('div', { children: [
    educationFixtureHeading('中学校'), educationFixtureField('大学学校名', control).row,
  ] });
  root.controls = [control];

  fillDocument(new FakeDocument([control]), {
    schoolName: '旧プロフィール大学',
    educationHistory: {
      middleSchool: { schoolName: '中学校名' },
      bachelor: { universityName: '大学名' },
    },
  });

  assert.equal(control.value, '');
});

test('final education fixture uses the selected master record for its independent admission row', () => {
  const html = fs.readFileSync(path.join(__dirname, 'fixtures', 'education-history-form.html'), 'utf8');
  const { document, rows } = educationDocumentFromFixtureHtml(html);
  const conditionalMasterValuesBefore = rows.slice(8, 13)
    .flatMap((row) => row.controls.map((control) => control.value));

  fillDocument(document, {
    schoolName: '異なる旧プロフィール大学',
    enrollmentMonth: '2018-04',
    graduationMonth: '2022-03',
    finalEducation: { level: 'master', completionStatus: 'completed' },
    educationHistory: {
      bachelor: {
        universityName: '学士大学', enrollmentMonth: '2018-04', graduationMonth: '2022-03',
      },
      master: {
        graduateSchoolName: '修士大学院', enrollmentMonth: '2022-04', completionMonth: '2024-03',
      },
    },
  });

  assert.deepEqual(
    rows.slice(8, 13).flatMap((row) => row.controls.map((control) => control.value)),
    conditionalMasterValuesBefore,
  );
  assert.equal(rows[13].controls[0].value, 'master');
  assert.deepEqual(rows[14].controls.map((control) => control.value), ['2022', '4']);
  assert.deepEqual(rows[15].controls.map((control) => control.value), ['2024', '3', 'completed']);
  for (const row of [rows[14], rows[15]]) {
    for (const control of row.controls) {
      assert.equal(control.jqDisplay.textContent, control.options[control.selectedIndex].textContent);
    }
  }
});

test('final education explanatory text is not a boundary without formal heading semantics', () => {
  const admission = educationDateField('◆入学年月', '2022-04');
  const root = new FakeContainer('div', { children: [
    educationFixtureHeading('出身大学（修士）', 'heading_l2'),
    educationFixtureHeading('最終学歴情報をご確認の上、間違いがある場合は修正してください。'),
    admission.row,
  ] });
  root.controls = admission.controls;
  const document = new FakeDocument(admission.controls);
  const valuesBefore = admission.controls.map((control) => control.value);

  fillDocument(document, {
    finalEducation: { level: 'master', completionStatus: 'completed' },
    educationHistory: {
      master: { enrollmentMonth: '2022-04', completionMonth: '2024-03' },
    },
  });

  assert.deepEqual(admission.controls.map((control) => control.value), valuesBefore);
});

test('combined education dates skip unless the four select segments are exactly year month year month', () => {
  const selects = [
    new FakeSelect({}, [new FakeOption('', '年'), new FakeOption('2020', '2020年')]),
    new FakeSelect({}, [new FakeOption('', '月'), new FakeOption('4', '4月')]),
    new FakeSelect({}, [new FakeOption('', '年'), new FakeOption('2023', '2023年')]),
  ];
  const labels = [new FakeLabel('年'), new FakeLabel('月'), new FakeLabel('年')];
  const children = selects.flatMap((select, index) => [jqTransformFixtureWrapper(select), labels[index]]);
  const term = new FakeContainer('dt', { textContent: '入学／卒業年月' });
  const definition = new FakeContainer('dd', { labels, children });
  definition.controls = selects;
  const row = new FakeContainer('dl', { children: [term, definition] });
  row.controls = selects;
  const root = new FakeContainer('div', { children: [educationFixtureHeading('中学校'), row] });
  root.controls = selects;

  fillDocument(new FakeDocument(selects), {
    educationHistory: {
      middleSchool: { enrollmentMonth: '2020-04', graduationMonth: '2023-03' },
    },
  });

  assert.deepEqual(selects.map((control) => control.value), ['', '', '']);
});

test('education history routes by exact school section and never broadcasts legacy schoolName', () => {
  const html = fs.readFileSync(path.join(__dirname, 'fixtures', 'education-history-form.html'), 'utf8');
  assert.match(html, /高等学校（中等教育学校）/);
  assert.match(html, /出身大学（学士）/);
  assert.match(html, /出身大学（修士）/);
  const middle = new FakeInput();
  const high = new FakeInput();
  const bachelor = new FakeInput();
  const master = new FakeInput();
  const other = new FakeInput();
  const kosen = new FakeInput();
  const doctorate = new FakeInput();
  const middleField = educationFixtureField('学校名', middle);
  const highField = educationFixtureField('学校名', high);
  const bachelorField = educationFixtureField('大学名', bachelor);
  const masterField = educationFixtureField('大学院学校名', master);
  const otherField = educationFixtureField('学校名', other);
  const kosenField = educationFixtureField('学校名', kosen);
  const root = new FakeContainer('div', { children: [
    educationFixtureHeading('中学校'), middleField.row,
    educationFixtureHeading('高等学校（中等教育学校）'), highField.row,
    educationFixtureHeading('出身大学（学士）'), bachelorField.row,
    educationFixtureHeading('出身大学（修士）'), masterField.row,
    educationFixtureHeading('その他学歴'), otherField.row,
    educationFixtureHeading('高等専門学校'), kosenField.row,
    educationFixtureHeading('大学院（博士）'), educationFixtureField('大学院学校名', doctorate).row,
  ] });
  root.controls = [middle, high, bachelor, master, other, kosen, doctorate];
  const document = new FakeDocument(root.controls);
  const profile = {
    schoolName: '旧プロフィールの大学名',
    departmentName: '旧プロフィールの学部名',
    majorName: '旧プロフィールの専攻名',
    enrollmentMonth: '2018-04',
    graduationMonth: '2022-03',
    finalEducation: { level: 'master', completionStatus: 'completed' },
    educationHistory: {
      middleSchool: { schoolName: '市立中学校' },
      highSchool: { schoolName: '県立高等学校' },
      bachelor: { universityName: '学士大学' },
      master: { graduateSchoolName: '修士大学院' },
    },
  };

  fillDocument(document, profile);

  assert.equal(middle.value, '市立中学校');
  assert.equal(high.value, '県立高等学校');
  assert.equal(bachelor.value, '学士大学');
  assert.equal(master.value, '', '修士の履歴は博士向け欄に入力しない');
  assert.equal(other.value, '');
  assert.equal(kosen.value, '');
  assert.equal(doctorate.value, '', '博士課程向け未対応欄にも旧プロフィールを転用しない');
});

test('education sections map independent fields and four split dates, syncing jqTransform selects', () => {
  const bachelorName = new FakeInput();
  const faculty = new FakeInput();
  const department = new FakeInput();
  const bachelorAdmission = educationDateField('入学年月', '2018-04');
  const bachelorGraduation = educationDateField('卒業年月', '2022-03');
  const masterName = new FakeInput();
  const researchDepartment = new FakeInput();
  const major = new FakeInput();
  const masterAdmission = educationDateField('入学年月', '2022-04');
  const masterCompletion = educationDateField('修了年月', '2024-03');
  const root = new FakeContainer('div', { children: [
    educationFixtureHeading('出身大学（学士）'),
    educationFixtureField('大学名', bachelorName).row,
    educationFixtureField('学部名', faculty).row,
    educationFixtureField('学科名', department).row,
    bachelorAdmission.row, bachelorGraduation.row,
    educationFixtureHeading('出身大学（修士）'),
    educationFixtureField('大学院学校名', masterName).row,
    educationFixtureField('研究科名', researchDepartment).row,
    educationFixtureField('専攻名', major).row,
    masterAdmission.row, masterCompletion.row,
  ] });
  const controls = [bachelorName, faculty, department, masterName, researchDepartment, major,
    ...bachelorAdmission.controls, ...bachelorGraduation.controls,
    ...masterAdmission.controls, ...masterCompletion.controls];
  root.controls = controls;
  const document = new FakeDocument(controls);
  fillDocument(document, {
    finalEducation: { level: 'doctorate', completionStatus: '' },
    educationHistory: {
      bachelor: {
        universityName: '学士大学', facultyName: '理工学部', departmentName: '情報学科',
        enrollmentMonth: '2018-04', graduationMonth: '2022-03',
      },
      master: {
        graduateSchoolName: '修士大学院', graduateDepartmentName: '工学研究科', majorName: '情報専攻',
        enrollmentMonth: '2022-04', completionMonth: '2024-03',
      },
    },
  });

  assert.deepEqual([bachelorName.value, faculty.value, department.value], ['学士大学', '理工学部', '情報学科']);
  assert.deepEqual([masterName.value, researchDepartment.value, major.value], ['修士大学院', '工学研究科', '情報専攻']);
  for (const field of [bachelorAdmission, bachelorGraduation, masterAdmission, masterCompletion]) {
    assert.deepEqual([field.year.value, field.month.value], [field.year.options[1].value, field.month.options[1].value]);
    assert.equal(field.year.jqDisplay.textContent, field.year.options[1].textContent);
    assert.equal(field.month.jqDisplay.textContent, field.month.options[1].textContent);
  }
});

test('final education selects and dates use only the selected stage record', () => {
  const level = new FakeSelect({}, [
    new FakeOption('', '未設定'), new FakeOption('master', '大学院（修士）'),
  ]);
  const status = new FakeSelect({}, [
    new FakeOption('', '未設定'), new FakeOption('completed', '修了'),
  ]);
  const levelRow = educationFixtureField('学歴区分', level).row;
  const statusRow = educationFixtureField('卒業・修了区分', status).row;
  const admission = educationDateField('入学年月', '2022-04');
  const completion = educationDateField('卒業・修了年月', '2024-03');
  const root = new FakeContainer('div', { children: [
    educationFixtureHeading('最終学歴情報'), levelRow, admission.row, completion.row, statusRow,
  ] });
  const controls = [level, status, ...admission.controls, ...completion.controls];
  root.controls = controls;
  const document = new FakeDocument(controls);
  fillDocument(document, {
    schoolName: '異なる旧プロフィール大学', enrollmentMonth: '2018-04', graduationMonth: '2022-03',
    finalEducation: { level: 'master', completionStatus: 'completed' },
    educationHistory: {
      bachelor: { universityName: '別の学士大学', enrollmentMonth: '2018-04', graduationMonth: '2022-03' },
      master: { graduateSchoolName: '最終大学院', enrollmentMonth: '2022-04', completionMonth: '2024-03' },
    },
  });

  assert.equal(level.value, 'master');
  assert.equal(status.value, 'completed');
  assert.deepEqual([admission.year.value, admission.month.value], ['2022', '04']);
  assert.deepEqual([completion.year.value, completion.month.value], ['2024', '03']);
});

test('duplicate education headings or repeated date groups are left unchanged', () => {
  const firstSchool = new FakeInput({}, { value: '既存値A' });
  const secondSchool = new FakeInput({}, { value: '既存値B' });
  const duplicatedAdmissionA = educationDateField('入学年月', '2018-04');
  const duplicatedAdmissionB = educationDateField('入学年月', '2018-04');
  const uniqueGraduation = educationDateField('卒業年月', '2022-03');
  const root = new FakeContainer('div', { children: [
    educationFixtureHeading('中学校'), educationFixtureField('学校名', firstSchool).row,
    educationFixtureHeading('中学校'), educationFixtureField('学校名', secondSchool).row,
    educationFixtureHeading('出身大学（学士）'), duplicatedAdmissionA.row,
    duplicatedAdmissionB.row, uniqueGraduation.row,
  ] });
  const controls = [firstSchool, secondSchool, ...duplicatedAdmissionA.controls,
    ...duplicatedAdmissionB.controls, ...uniqueGraduation.controls];
  root.controls = controls;
  fillDocument(new FakeDocument(controls), {
    schoolName: '旧プロフィール大学',
    finalEducation: { level: 'master' },
    educationHistory: {
      middleSchool: { schoolName: '新しい中学校名' },
      bachelor: {
        enrollmentMonth: '2018-04', graduationMonth: '2022-03',
      },
    },
  });

  assert.deepEqual([firstSchool.value, secondSchool.value], ['既存値A', '既存値B']);
  for (const control of [...duplicatedAdmissionA.controls, ...duplicatedAdmissionB.controls]) {
    assert.equal(control.value, '');
  }
  assert.deepEqual([uniqueGraduation.year.value, uniqueGraduation.month.value], ['2022', '03']);
});

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
    nearLabelTexts: [],
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
    nearLabelTexts: [],
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
    [new FakeInput({ id: 'a' }), [new FakeLabel('姓', 'a')], null],
    [new FakeInput({}, { parentLabel: new FakeLabel('名') }), [], null],
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
  assert.equal(classifyField(metadata({ labelTexts: ['email'] })), 'email');
});

test('split date selects resolve the profile meaning before year month and day components', () => {
  const controls = [];
  const labels = [];
  const addSelect = (name, label, values) => {
    const id = `field-${controls.length}`;
    const select = new FakeSelect({ id, name }, values.map(([value, text]) => new FakeOption(value, text)));
    controls.push(select);
    labels.push(new FakeLabel(label, id));
    return select;
  };
  const years = [['2002', '2002年'], ['2026', '2026年'], ['2028', '2028年']];
  const months = [['4', '4月'], ['5', '05月'], ['3', '3月']];
  const days = [['18', '18日'], ['5', '5日']];
  const birthYear = addSelect('birthYear', '年', years);
  const birthMonth = addSelect('birthdayMonth', '月', months);
  const birthDay = addSelect('birthDay', '日', days);
  const enrollmentYear = addSelect('year', '入学年月 年', years);
  const enrollmentMonth = addSelect('month', '入学年月 月', months);
  const graduationYear = addSelect('year', '卒業年月 年', years);
  const graduationMonth = addSelect('month', '卒業年月 月', months);
  const labStartYear = addSelect('year', '研究室所属開始年月 年', years);
  const labStartMonth = addSelect('month', '研究室所属開始年月 月', months);
  const labEndYear = addSelect('year', '研究室所属終了年月 年', years);
  const labEndMonth = addSelect('month', '研究室所属終了年月 月', months);
  const ambiguousYear = addSelect('year', '年', years);
  const document = new FakeDocument(controls, labels);

  assert.deepEqual(fillDocument(document, {
    birthDate: '2002-05-18',
    enrollmentMonth: '2026-04',
    graduationMonth: '2028-03',
    laboratoryStartMonth: '2026-04',
    laboratoryEndMonth: '2028-03',
  }), { filledCount: 11, failedCount: 0 });
  assert.deepEqual(
    [birthYear.value, birthMonth.value, birthDay.value],
    ['2002', '5', '18'],
  );
  assert.deepEqual(
    [enrollmentYear.value, enrollmentMonth.value, graduationYear.value, graduationMonth.value],
    ['2026', '4', '2028', '3'],
  );
  assert.deepEqual(
    [labStartYear.value, labStartMonth.value, labEndYear.value, labEndMonth.value],
    ['2026', '4', '2028', '3'],
  );
  assert.equal(ambiguousYear.value, '');
  for (const control of controls.slice(0, 11)) {
    assert.deepEqual(control.events.map(({ type }) => type), ['input', 'change']);
  }
});

test('collectFieldMetadata uses one nearby label in a small wrapper and ignores ambiguous wrappers', () => {
  const oneInput = new FakeInput({ id: 'one', type: 'text' });
  const oneLabel = new FakeLabel('姓：', 'text');
  const oneWrapper = new FakeContainer('div', { controls: [oneInput], labels: [oneLabel] });
  const twoInputs = [new FakeInput({}), new FakeInput({})];
  const twoLabels = [new FakeLabel('姓：'), new FakeLabel('名：')];
  const ambiguousWrapper = new FakeContainer('li', { controls: twoInputs, labels: twoLabels });
  const document = new FakeDocument([oneInput, ...twoInputs], [oneLabel, ...twoLabels]);

  assert.deepEqual(collectFieldMetadata(oneInput, document).nearLabelTexts, ['姓：']);
  assert.equal(classifyField(collectFieldMetadata(oneInput, document)), null);
  assert.deepEqual(collectFieldMetadata(twoInputs[0], document).nearLabelTexts, []);
  assert.deepEqual(collectFieldMetadata(twoInputs[1], document).nearLabelTexts, []);
  assert.ok(oneWrapper && ambiguousWrapper);
});

test('collectFieldMetadata reads only paired dt/dd and th/td labels', () => {
  const definitionInput = new FakeInput({});
  const term = new FakeContainer('dt', { textContent: '姓' });
  const definition = new FakeContainer('dd', { controls: [definitionInput] });
  new FakeContainer('dl', { children: [term, definition] });

  const tableInput = new FakeInput({});
  const header = new FakeContainer('th', { textContent: '名' });
  const cell = new FakeContainer('td', { controls: [tableInput] });
  new FakeContainer('tr', { children: [header, cell] });
  const broadInput = new FakeInput({});
  const broad = new FakeContainer('form', {
    controls: [broadInput],
    textContent: '姓 名 電話番号',
  });
  const document = new FakeDocument([definitionInput, tableInput, broadInput]);

  assert.deepEqual(collectFieldMetadata(definitionInput, document).nearLabelTexts, []);
  assert.deepEqual(collectFieldMetadata(definitionInput, document).contextTexts, ['姓']);
  assert.deepEqual(collectFieldMetadata(tableInput, document).nearLabelTexts, ['名']);
  assert.deepEqual(collectFieldMetadata(broadInput, document).nearLabelTexts, []);
});

test('a unique dt/dd context is required before a group term can label its controls', () => {
  const input = new FakeSelect({}, [new FakeOption('2028', '2028年')]);
  const term = new FakeContainer('dt', { textContent: '生年月日' });
  const firstDefinition = new FakeContainer('dd', { controls: [input] });
  const secondDefinition = new FakeContainer('dd');
  const wrapper = new FakeContainer('div', { children: [term, firstDefinition, secondDefinition] });
  wrapper.controls = [input];
  const document = new FakeDocument([input]);

  assert.deepEqual(collectFieldMetadata(input, document).contextTexts, []);
  assert.equal(classifyControl(metadata({ nearLabelTexts: ['年'], tagName: 'select' })), null);
  assert.ok(wrapper);
});

test('formbox definition terms and adjacent sibling labels identify split profile controls', () => {
  const family = new FakeInput({ type: 'text' });
  const given = new FakeInput({ type: 'text' });
  const familyLabel = new FakeLabel('姓：', 'unmatched');
  const givenLabel = new FakeLabel('名：', 'unmatched');
  const nameTerm = new FakeContainer('dt', { textContent: '漢字氏名' });
  const nameDefinition = new FakeContainer('dd', {
    controls: [family, given],
    labels: [familyLabel, givenLabel],
    children: [familyLabel, family, givenLabel, given],
  });
  const nameGroup = new FakeContainer('div', { children: [nameTerm, nameDefinition] });
  nameGroup.controls = [family, given];
  nameGroup.className = 'formbox';

  let displayedYear = '';
  const year = new FakeSelect({}, [new FakeOption('2002', '2002年')], {
    onEvent(event, control) {
      if (event.type === 'change') {
        displayedYear = control.options[control.selectedIndex]?.textContent || '';
      }
    },
  });
  const month = new FakeSelect({}, [new FakeOption('5', '5月')]);
  const day = new FakeSelect({}, [new FakeOption('18', '18日')]);
  const birthTerm = new FakeContainer('dt', { textContent: '生年月日' });
  const birthLabels = ['年', '月', '日'].map((text) => new FakeLabel(text, 'unmatched'));
  const birthDefinition = new FakeContainer('dd', {
    controls: [year, month, day],
    labels: birthLabels,
    children: [birthLabels[0], year, birthLabels[1], month, birthLabels[2], day],
  });
  const birthGroup = new FakeContainer('div', { children: [birthTerm, birthDefinition] });
  birthGroup.controls = [year, month, day];
  birthGroup.className = 'formbox';
  const document = new FakeDocument([family, given, year, month, day], [
    familyLabel, givenLabel, ...birthLabels,
  ]);

  assert.equal(family.previousElementSibling, familyLabel);
  assert.deepEqual(collectFieldMetadata(family, document).nearLabelTexts, ['姓：']);
  assert.deepEqual(collectFieldMetadata(family, document).contextTexts, ['漢字氏名']);
  assert.deepEqual(collectFieldMetadata(year, document).nearLabelTexts, ['年']);
  assert.deepEqual(collectFieldMetadata(year, document).contextTexts, ['生年月日']);
  assert.ok(nameGroup && birthGroup);
  assert.deepEqual(fillDocument(document, {
    familyName: '山田',
    givenName: '太郎',
    birthDate: '2002-05-18',
  }), { filledCount: 5, failedCount: 0 });
  assert.equal(family.value, '山田');
  assert.equal(given.value, '太郎');
  assert.deepEqual([year.value, month.value, day.value], ['2002', '5', '18']);
  assert.deepEqual([year.selectedIndex, month.selectedIndex, day.selectedIndex], [0, 0, 0]);
  assert.equal(year.options[year.selectedIndex].textContent, '2002年');
  assert.equal(displayedYear, '2002年');
  assert.deepEqual(year.events.map(({ type }) => type), ['input', 'change']);
});

test('legacy formbox metadata combines unique dt/dd context with deep local labels for every split field', () => {
  const allControls = [];
  const allLabels = [];
  const boxes = [];

  function makeField(labelText, control, position = 'before') {
    const label = new FakeLabel(labelText, 'broken-for');
    const inner = new FakeContainer('div', { controls: [control] });
    const middle = new FakeContainer('div', { children: [inner] });
    middle.controls = [control];
    const spanChildren = position === 'before' ? [label, middle] : [middle, label];
    const span = new FakeContainer('span', { labels: [label], children: spanChildren });
    span.controls = [control];
    allControls.push(control);
    allLabels.push(label);
    return { control, label, span };
  }

  function makeBox(heading, fields, textContent = '') {
    const term = new FakeContainer('dt', { textContent: heading });
    const definition = new FakeContainer('dd', {
      children: fields.map((field) => field.span),
      textContent,
    });
    definition.controls = fields.map((field) => field.control);
    definition.labels = fields.map((field) => field.label);
    const box = new FakeContainer('div', { children: [term, definition] });
    box.controls = definition.controls;
    box.labels = definition.labels;
    boxes.push(box);
    return fields;
  }

  const kanji = makeBox('漢字氏名', [
    makeField('姓：', new FakeInput({ type: 'text' })),
    makeField('名：', new FakeInput({ type: 'text' })),
  ]);
  const kana = makeBox('カナ氏名', [
    makeField('セイ：', new FakeInput({ type: 'text' })),
    makeField('メイ：', new FakeInput({ type: 'text' })),
  ]);
  const birth = makeBox('生年月日', [
    makeField('年', new FakeSelect({ style: 'display: none' }, [new FakeOption('', '年'), new FakeOption('2002', '2002年')]), 'after'),
    makeField('月', new FakeSelect({ style: 'display: none' }, [new FakeOption('', '月'), new FakeOption('5', '5月')]), 'after'),
    makeField('日', new FakeSelect({ style: 'display: none' }, [new FakeOption('', '日'), new FakeOption('18', '18日')]), 'after'),
  ]);
  const gender = makeBox('性別', [
    makeField('男', new FakeInput({ type: 'radio', name: 'gender', value: '1' }), 'after'),
    makeField('女', new FakeInput({ type: 'radio', name: 'gender', value: '2' }), 'after'),
  ]);
  const graduation = makeBox('卒業年月', [
    makeField('年', new FakeSelect({ style: 'display: none' }, [new FakeOption('', '年'), new FakeOption('2028', '2028年')]), 'after'),
    makeField('月', new FakeSelect({ style: 'display: none' }, [new FakeOption('', '月'), new FakeOption('03', '03月')]), 'after'),
  ]);
  const fixed = makeBox('電話番号', [1, 2, 3].map(() => makeField('', new FakeInput({ type: 'text' }))), '--');
  const mobile = makeBox('携帯電話番号', [1, 2, 3].map(() => makeField('', new FakeInput({ type: 'text' }))), '--');
  const mail = makeBox('E-mailアドレス', [
    makeField('', new FakeInput({ type: 'text' })),
    makeField('', new FakeInput({ type: 'text' })),
  ], '＠');
  const mailConfirm = makeBox('E-mailアドレス確認', [
    makeField('', new FakeInput({ type: 'text' })),
    makeField('', new FakeInput({ type: 'text' })),
  ], '＠');
  const mobileEmail = makeBox('携帯アドレス', [
    makeField('携帯アドレス', new FakeInput({ type: 'email' })),
  ]);
  const document = new FakeDocument(allControls, allLabels);

  const expected = [
    ...kanji.map(({ control }, index) => [control, index ? 'givenName' : 'familyName', null]),
    ...kana.map(({ control }, index) => [control, index ? 'givenNameKana' : 'familyNameKana', null]),
    ...birth.map(({ control }, index) => [control, 'birthDate', ['year', 'month', 'day'][index]]),
    ...gender.map(({ control }) => [control, 'gender', null]),
    ...graduation.map(({ control }, index) => [control, 'graduationMonth', index ? 'month' : 'year']),
    ...fixed.map(({ control }) => [control, 'phoneNumber', null]),
    ...mobile.map(({ control }) => [control, 'mobilePhone', null]),
    ...mail.map(({ control }) => [control, 'email', null]),
    ...mailConfirm.map(({ control }) => [control, 'email', null]),
  ];
  for (const [control, profileKey, segment] of expected) {
    const metadata = collectFieldMetadata(control, document);
    assert.ok(metadata.contextTexts.length === 1, `missing unique group context for ${profileKey}`);
    assert.deepEqual(classifyControl(metadata), { profileKey, segment });
  }
  for (const component of ['年', '月', '日']) {
    assert.equal(classifyControl(metadata({ nearLabelTexts: [component], tagName: 'select' })), null);
  }
  assert.equal(classifyControl(collectFieldMetadata(mobileEmail[0].control, document)), null);
  assert.ok(boxes.length > 0);
  assert.deepEqual(graduation.map(({ control }) => control.value), ['', '']);

  assert.deepEqual(fillDocument(document, {
    familyName: '山田',
    givenName: '太郎',
    familyNameKana: 'ヤマダ',
    givenNameKana: 'タロウ',
    birthDate: '2002-05-18',
    gender: '男性',
    graduationMonth: '2028-03',
    phoneNumber: '03-1111-2222',
    mobilePhone: '080-2222-3333',
    email: 'sample@example.com',
  }), { filledCount: 20, failedCount: 0 });
  assert.deepEqual(kanji.map(({ control }) => control.value), ['山田', '太郎']);
  assert.deepEqual(kana.map(({ control }) => control.value), ['ヤマダ', 'タロウ']);
  assert.deepEqual(birth.map(({ control }) => control.value), ['2002', '5', '18']);
  assert.deepEqual(birth.map(({ control }) => control.selectedIndex), [1, 1, 1]);
  assert.deepEqual(birth.map(({ control }) => control.events.map(({ type }) => type)), [
    ['input', 'change'], ['input', 'change'], ['input', 'change'],
  ]);
  assert.equal(gender[0].control.checked, true);
  assert.equal(gender[1].control.checked, false);
  assert.deepEqual(graduation.map(({ control }) => control.value), ['2028', '03']);
  assert.deepEqual(graduation.map(({ control }) => control.selectedIndex), [1, 1]);
  assert.deepEqual(fixed.map(({ control }) => control.value), ['03', '1111', '2222']);
  assert.deepEqual(mobile.map(({ control }) => control.value), ['080', '2222', '3333']);
  assert.deepEqual(mail.map(({ control }) => control.value), ['sample', 'example.com']);
  assert.deepEqual(mailConfirm.map(({ control }) => control.value), ['sample', 'example.com']);
  assert.equal(mobileEmail[0].control.value, '');
});

test('input-wrapper sibling labels and a seventh-level dt/dd group classify kanji and kana names', () => {
  const controls = [];
  const labels = [];
  const boxes = [];

  function makeNameField(labelText) {
    const input = new FakeInput({ type: 'text' });
    const inner = new FakeContainer('div', { controls: [input] });
    const outer = new FakeContainer('div', { children: [inner] });
    outer.controls = [input];
    const inputWrapper = new FakeContainer('div', { children: [outer] });
    inputWrapper.controls = [input];
    const label = new FakeLabel(labelText, 'unmatched');
    const field = new FakeContainer('div', { labels: [label], children: [label, inputWrapper] });
    field.controls = [input];
    const line = new FakeContainer('span', { children: [field] });
    line.controls = [input];
    controls.push(input);
    labels.push(label);
    return { input, label, line };
  }

  function makeNameGroup(heading, firstLabel, secondLabel) {
    const fields = [makeNameField(firstLabel), makeNameField(secondLabel)];
    const term = new FakeContainer('dt', { textContent: heading });
    const definition = new FakeContainer('dd', {
      children: fields.map((field) => field.line),
      labels: fields.map((field) => field.label),
    });
    definition.controls = fields.map((field) => field.input);
    const group = new FakeContainer('div', { children: [term, definition] });
    group.controls = definition.controls;
    boxes.push(group);
    return fields;
  }

  const kanji = makeNameGroup('漢字氏名', '姓：', '名 ：');
  const kana = makeNameGroup('カナ氏名', 'セイ：', 'メイ ：');
  const document = new FakeDocument(controls, labels);
  const expected = [
    [kanji[0].input, '姓：', '漢字氏名', 'familyName'],
    [kanji[1].input, '名 ：', '漢字氏名', 'givenName'],
    [kana[0].input, 'セイ：', 'カナ氏名', 'familyNameKana'],
    [kana[1].input, 'メイ ：', 'カナ氏名', 'givenNameKana'],
  ];

  for (const [control, label, heading, profileKey] of expected) {
    const fieldMetadata = collectFieldMetadata(control, document);
    assert.deepEqual(fieldMetadata.nearLabelTexts, [label]);
    assert.deepEqual(fieldMetadata.contextTexts, [heading]);
    assert.deepEqual(classifyControl(fieldMetadata), { profileKey, segment: null });
  }
  assert.deepEqual(fillDocument(document, {
    familyName: '山田',
    givenName: '太郎',
    familyNameKana: 'ヤマダ',
    givenNameKana: 'タロウ',
  }), { filledCount: 4, failedCount: 0 });
  assert.deepEqual(controls.map((control) => control.value), ['山田', '太郎', 'ヤマダ', 'タロウ']);
  assert.equal(boxes.length, 2);
});

test('a preceding label is not shared with controls inside a multi-control wrapper', () => {
  const first = new FakeInput({ type: 'text' });
  const second = new FakeInput({ type: 'text' });
  const label = new FakeLabel('姓：', 'unmatched');
  const wrapper = new FakeContainer('div', { controls: [first, second], children: [first, second] });
  assert.equal(first.parentElement, wrapper);
  const term = new FakeContainer('dt', { textContent: '漢字氏名' });
  const definition = new FakeContainer('dd', { labels: [label], children: [label, wrapper] });
  definition.controls = [first, second];
  assert.equal(wrapper.previousElementSibling, label);
  const group = new FakeContainer('div', { children: [term, definition] });
  group.controls = [first, second];
  const document = new FakeDocument([first, second], [label]);

  for (const control of [first, second]) {
    assert.deepEqual(collectFieldMetadata(control, document).nearLabelTexts, []);
    assert.equal(classifyControl(collectFieldMetadata(control, document)), null);
  }
});

test('hidden birthday and graduation selects use identical native updates with padded numeric options', () => {
  const controls = [];
  const labels = [];
  const rendered = new Map();

  function selectField(heading, component, options, profileKey, part) {
    const select = new FakeSelect({ class: 'jqTransformHidden', style: 'display: none' }, options, {
      value: '',
      onEvent(event, control) {
        if (event.type === 'change') {
          rendered.set(`${profileKey}.${part}`, control.options[control.selectedIndex]?.textContent || '');
        }
      },
    });
    const label = new FakeLabel(component, 'unmatched');
    const wrapper = new FakeContainer('span', { controls: [select], labels: [label], children: [select, label] });
    const term = new FakeContainer('dt', { textContent: heading });
    const definition = new FakeContainer('dd', { children: [wrapper] });
    definition.controls = [select];
    definition.labels = [label];
    const group = new FakeContainer('div', { children: [term, definition] });
    group.controls = [select];
    controls.push(select);
    labels.push(label);
    return select;
  }

  const birthday = [
    selectField('生年月日', '年', [new FakeOption('', '年'), new FakeOption('2002', '2002')], 'birthDate', 'year'),
    selectField('生年月日', '月', [new FakeOption('', '月'), new FakeOption('05', '05')], 'birthDate', 'month'),
    selectField('生年月日', '日', [
      new FakeOption('', '日'), ...Array.from({ length: 31 }, (_, index) => {
        const value = String(index + 1).padStart(2, '0');
        return new FakeOption(value, value);
      }),
    ], 'birthDate', 'day'),
  ];
  const graduation = [
    selectField('卒業年月', '年', [new FakeOption('', '年'), new FakeOption('2028', '2028')], 'graduationMonth', 'year'),
    selectField('卒業年月', '月', [new FakeOption('', '月'), new FakeOption('03', '03')], 'graduationMonth', 'month'),
  ];
  const document = new FakeDocument(controls, labels);

  for (const [control, profileKey, segment] of [
    ...birthday.map((control, index) => [control, 'birthDate', ['year', 'month', 'day'][index]]),
    ...graduation.map((control, index) => [control, 'graduationMonth', ['year', 'month'][index]]),
  ]) {
    const classification = classifyControl(collectFieldMetadata(control, document));
    assert.deepEqual(classification, { profileKey, segment });
  }

  assert.deepEqual(fillDocument(document, {
    birthDate: '2002-05-05',
    graduationMonth: '2028-03',
  }), { filledCount: 5, failedCount: 0 });
  assert.deepEqual(birthday.map((control) => [control.value, control.selectedIndex]), [
    ['2002', 1], ['05', 1], ['05', 5],
  ]);
  assert.deepEqual(graduation.map((control) => [control.value, control.selectedIndex]), [
    ['2028', 1], ['03', 1],
  ]);
  assert.deepEqual(birthday.map((control) => control.events.map(({ type }) => type)), [
    ['input', 'change'], ['input', 'change'], ['input', 'change'],
  ]);
  assert.deepEqual(graduation.map((control) => control.events.map(({ type }) => type)), [
    ['input', 'change'], ['input', 'change'],
  ]);
  assert.deepEqual([...rendered.entries()], [
    ['birthDate.year', '2002'], ['birthDate.month', '05'], ['birthDate.day', '05'],
    ['graduationMonth.year', '2028'], ['graduationMonth.month', '03'],
  ]);
});

test('jqTransform select views sync only when a unique wrapper and option map are proven', () => {
  let clickCalls = 0;
  function makeSelect(options, currentText = '-▼-', { wrapperCount = 1, mapIndexes } = {}) {
    const select = new FakeSelect({ type: 'select-one' }, options);
    let displayText = currentText;
    let displayWrites = 0;
    let classWrites = 0;
    const display = {
      tagName: 'SPAN',
      get textContent() { return displayText; },
      set textContent(value) { displayWrites += 1; displayText = value; },
    };
    const bar = { tagName: 'DIV' };
    display.parentElement = bar;
    const open = {
      tagName: 'A',
      className: 'jqTransformSelectOpen',
      previousElementSibling: display,
      parentElement: bar,
      getAttribute(name) { return name === 'class' ? this.className : null; },
      click() { clickCalls += 1; },
    };
    bar.children = [display, open];
    const links = options.map((option, index) => {
      const classes = new Set(index === 0 ? ['selected'] : []);
      return {
        tagName: 'A',
        textContent: option.textContent,
        getAttribute(name) {
          if (name === 'index') return String(mapIndexes ? mapIndexes[index] : index);
          return null;
        },
        classList: {
          contains(name) { return classes.has(name); },
          add(name) { classWrites += 1; classes.add(name); },
          remove(name) { classWrites += 1; classes.delete(name); },
        },
        click() { clickCalls += 1; },
        get selected() { return classes.has('selected'); },
      };
    });
    const list = { tagName: 'UL' };
    list.children = links;
    const wrappers = Array.from({ length: wrapperCount }, () => ({
      tagName: 'DIV',
      className: 'jqTransformSelectWrapper',
      classList: { contains(name) { return name === 'jqTransformSelectWrapper'; } },
      querySelectorAll(selector) {
        if (selector === 'input, select, textarea') return [select];
        if (selector === 'a.jqTransformSelectOpen') return [open];
        if (selector === 'div > span') return [display];
        if (selector === 'ul') return [list];
        if (selector === 'ul > li > a') return links;
        if (selector === 'a') return [open, ...links];
        return [];
      },
    }));
    for (let index = 0; index < wrappers.length - 1; index += 1) {
      wrappers[index].parentElement = wrappers[index + 1];
    }
    select.parentElement = wrappers[0];
    return {
      select,
      display,
      links,
      wrappers,
      get displayWrites() { return displayWrites; },
      get classWrites() { return classWrites; },
      get displayText() { return displayText; },
    };
  }

  const birthdayOptions = [
    new FakeOption('', '-▼-'), new FakeOption('2002', '2002年'),
  ];
  const birth = makeSelect(birthdayOptions);
  // jqTransform's open anchor is outside the option list: wrapper-wide anchors
  // are N + 1, while only the N anchors under UL correspond to native options.
  assert.equal(birth.wrappers[0].querySelectorAll('a').length, birthdayOptions.length + 1);
  assert.equal(birth.wrappers[0].querySelectorAll('ul > li > a').length, birthdayOptions.length);
  const birthMonth = makeSelect([new FakeOption('', ''), new FakeOption('05', '05')]);
  const birthDayOptions = [new FakeOption('', '')];
  for (let day = 1; day <= 31; day += 1) {
    const value = String(day).padStart(2, '0');
    birthDayOptions.push(new FakeOption(value, value));
  }
  const birthDay = makeSelect(birthDayOptions);
  const graduation = makeSelect([
    new FakeOption('', '-▼-'), new FakeOption('2028', '2028年'),
  ], '2028年');
  const eventSynced = makeSelect([
    new FakeOption('', '-▼-'), new FakeOption('03', '03月'),
  ]);
  eventSynced.select.onEvent = (event) => {
    if (event.type === 'change') eventSynced.display.textContent = '03月';
  };
  const standard = new FakeSelect({}, [new FakeOption('', ''), new FakeOption('05', '05月')]);
  const ambiguousWrapper = makeSelect([
    new FakeOption('', '-▼-'), new FakeOption('18', '18日'),
  ], '-▼-', { wrapperCount: 2 });
  const ambiguousOptions = makeSelect([
    new FakeOption('', '-▼-'), new FakeOption('05', '05月'),
  ], '-▼-', { mapIndexes: [0, 0] });
  const controls = [birth.select, birthMonth.select, birthDay.select, graduation.select, eventSynced.select, standard,
    ambiguousWrapper.select, ambiguousOptions.select];
  const document = new FakeDocument(controls);

  assert.equal(setFormControlValue(birth.select, { profileKey: 'birthDate', segment: 'year' }, '2002', document), true);
  assert.deepEqual([birth.select.value, birth.select.selectedIndex], ['2002', 1]);
  assert.equal(birth.displayText, '2002年');
  assert.equal(birth.links[1].selected, true);
  assert.deepEqual(birth.select.events.map(({ type }) => type), ['input', 'change']);

  for (const [field, segment, value] of [
    [birthMonth, 'month', '05'], [birthDay, 'day', '18'],
  ]) {
    assert.equal(setFormControlValue(field.select, { profileKey: 'birthDate', segment }, value, document), true);
    assert.equal(field.select.value, value);
    assert.equal(field.displayText, value);
    assert.equal(field.links[field.select.selectedIndex].selected, true);
    assert.deepEqual(field.select.events.map(({ type }) => type), ['input', 'change']);
  }

  assert.equal(setFormControlValue(graduation.select, { profileKey: 'graduationMonth', segment: 'year' }, '2028', document), true);
  assert.equal(graduation.displayText, '2028年');
  assert.equal(graduation.displayWrites, 0);
  assert.equal(graduation.classWrites, 0);

  assert.equal(setFormControlValue(eventSynced.select, { profileKey: 'graduationMonth', segment: 'month' }, '03', document), true);
  assert.equal(eventSynced.displayText, '03月');
  assert.equal(eventSynced.displayWrites, 1);
  assert.equal(eventSynced.classWrites, 0);

  assert.equal(setFormControlValue(standard, { profileKey: 'birthDate', segment: 'month' }, '05', document), true);
  assert.equal(standard.value, '05');
  assert.equal(setFormControlValue(ambiguousWrapper.select, { profileKey: 'birthDate', segment: 'day' }, '18', document), true);
  assert.equal(ambiguousWrapper.displayText, '-▼-');
  assert.equal(ambiguousWrapper.displayWrites, 0);
  assert.equal(setFormControlValue(ambiguousOptions.select, { profileKey: 'birthDate', segment: 'month' }, '05', document), true);
  assert.equal(ambiguousOptions.displayText, '-▼-');
  assert.equal(ambiguousOptions.displayWrites, 0);
  assert.equal(clickCalls, 0);
});

test('birth date select order overrides the preceding unit label in one three-select DD', () => {
  const controls = [];
  const labels = [];
  const rendered = [];
  const year = new FakeSelect({ class: 'jqTransformHidden', name: 'ybirth' }, [
    new FakeOption('', ''), new FakeOption('2002', '2002'),
  ], { onEvent(event, control) { if (event.type === 'change') rendered.push(control.value); } });
  const month = new FakeSelect({ class: 'jqTransformHidden', name: 'mbirth' }, [
    new FakeOption('', ''), new FakeOption('05', '05'),
  ], { onEvent(event, control) { if (event.type === 'change') rendered.push(control.value); } });
  const dayOptions = [new FakeOption('', '')];
  for (let day = 1; day <= 31; day += 1) {
    const value = String(day).padStart(2, '0');
    dayOptions.push(new FakeOption(value, value));
  }
  const day = new FakeSelect({ class: 'jqTransformHidden', name: 'dbirth' }, dayOptions, {
    onEvent(event, control) { if (event.type === 'change') rendered.push(control.value); },
  });
  const unitLabels = ['年', '月', '日'].map((text) => new FakeLabel(text, 'unmatched'));
  const wrappers = [year, month, day].map((select) => {
    const wrapper = new FakeContainer('span', { children: [select] });
    wrapper.controls = [select];
    controls.push(select);
    return wrapper;
  });
  const term = new FakeContainer('dt', { textContent: '生年月日' });
  const definition = new FakeContainer('dd', {
    labels: unitLabels,
    children: [wrappers[0], unitLabels[0], wrappers[1], unitLabels[1], wrappers[2], unitLabels[2]],
    textContent: '年 月 日',
  });
  definition.controls = controls;
  const group = new FakeContainer('div', { children: [term, definition] });
  group.controls = controls;
  labels.push(...unitLabels);
  const document = new FakeDocument(controls, labels);

  const expected = [
    [year, 'year'], [month, 'month'], [day, 'day'],
  ];
  for (const [index, [control, segment]] of expected.entries()) {
    const fieldMetadata = collectFieldMetadata(control, document);
    assert.deepEqual(fieldMetadata.contextTexts, ['生年月日']);
    assert.deepEqual(fieldMetadata.nearLabelTexts, []);
    assert.equal(fieldMetadata.definitionSelectCount, 3);
    assert.equal(fieldMetadata.definitionSelectIndex, index);
    assert.deepEqual(fieldMetadata.definitionSelectSegments, ['year', 'month', 'day']);
    assert.deepEqual(classifyControl(fieldMetadata), { profileKey: 'birthDate', segment });
  }
  assert.deepEqual(fillDocument(document, { birthDate: '2002-05-05' }), {
    filledCount: 3,
    failedCount: 0,
  });
  assert.deepEqual([year, month, day].map((select) => [select.value, select.selectedIndex]), [
    ['2002', 1], ['05', 1], ['05', 5],
  ]);
  assert.deepEqual(rendered, ['2002', '05', '05']);
});

test('nested select wrappers use their unique trailing year month day labels', () => {
  const controls = [];
  const labels = ['年', '月', '日'].map((text) => new FakeLabel(text, 'unmatched'));
  const year = new FakeSelect({ name: 'part-a' }, [
    new FakeOption('', ''), new FakeOption('2003', '2003'),
  ]);
  const month = new FakeSelect({ name: 'part-b' }, [
    new FakeOption('', ''), new FakeOption('05', '05'),
  ]);
  const day = new FakeSelect({ name: 'part-c' }, [
    new FakeOption('', ''), new FakeOption('18', '18'),
  ]);
  const wrappers = [year, month, day].map((select) => {
    const wrapper = new FakeContainer('div', { controls: [select], children: [select] });
    controls.push(select);
    return wrapper;
  });
  const nestedRow = new FakeContainer('div', {
    labels,
    children: [wrappers[0], labels[0], wrappers[1], labels[1], wrappers[2], labels[2]],
  });
  nestedRow.controls = controls;
  const term = new FakeContainer('dt', { textContent: '生年月日' });
  const definition = new FakeContainer('dd', {
    labels,
    children: [nestedRow],
  });
  definition.controls = controls;
  const formGroup = new FakeContainer('div', { children: [term, definition] });
  formGroup.controls = controls;
  const document = new FakeDocument(controls, labels);

  for (const [index, [control, segment]] of [
    [year, 'year'], [month, 'month'], [day, 'day'],
  ].entries()) {
    const fieldMetadata = collectFieldMetadata(control, document);
    assert.equal(fieldMetadata.definitionSelectCount, 3);
    assert.equal(fieldMetadata.definitionSelectIndex, index);
    assert.deepEqual(fieldMetadata.definitionSelectSegments, ['year', 'month', 'day']);
    assert.deepEqual(classifyControl(fieldMetadata), { profileKey: 'birthDate', segment });
  }

  assert.deepEqual(fillDocument(document, { birthDate: '2003-05-18' }), {
    filledCount: 3,
    failedCount: 0,
  });
  assert.deepEqual([year, month, day].map((select) => [select.value, select.selectedIndex]), [
    ['2003', 1], ['05', 1], ['18', 1],
  ]);
});

test('one email DD with two @ pairs fills the address and its confirmation, not mobile address', () => {
  const controls = [];
  const labels = [];
  function makeBox(heading, separatorText) {
    const inputs = Array.from({ length: 4 }, () => new FakeInput({ type: 'text' }));
    const wrappers = inputs.map((input) => {
      const wrapper = new FakeContainer('span', { children: [input] });
      wrapper.controls = [input];
      controls.push(input);
      return wrapper;
    });
    const term = new FakeContainer('dt', { textContent: heading });
    const definition = new FakeContainer('dd', {
      children: [wrappers[0], wrappers[1], wrappers[2], wrappers[3]],
      textContent: separatorText,
    });
    definition.controls = inputs;
    const group = new FakeContainer('div', { children: [term, definition] });
    group.controls = inputs;
    return inputs;
  }

  const email = makeBox('Email address', '@ @');
  const mobileAddress = makeBox('Mobile address', '@ @');
  const document = new FakeDocument(controls, labels);
  for (const input of email) {
    const fieldMetadata = collectFieldMetadata(input, document);
    assert.deepEqual(fieldMetadata.contextTexts, ['Email address']);
    assert.equal(classifyControl(fieldMetadata)?.profileKey, 'email');
  }
  for (const input of mobileAddress) {
    assert.equal(classifyControl(collectFieldMetadata(input, document)), null);
  }

  assert.deepEqual(fillDocument(document, { email: 'sample@example.com' }), {
    filledCount: 4,
    failedCount: 0,
  });
  assert.deepEqual(email.map((input) => input.value), [
    'sample', 'example.com', 'sample', 'example.com',
  ]);
  assert.deepEqual(mobileAddress.map((input) => input.value), ['', '', '', '']);
});

test('three phone inputs in one uniquely labelled group split without relying on visible separators', () => {
  const controls = [];
  const labels = [];
  function makeBox(heading, profileKey) {
    const term = new FakeContainer('dt', { textContent: heading });
    const fields = Array.from({ length: 3 }, () => {
      const input = new FakeInput({ type: 'text' });
      const inner = new FakeContainer('div', { controls: [input] });
      const wrapper = new FakeContainer('span', { children: [inner] });
      wrapper.controls = [input];
      controls.push(input);
      return wrapper;
    });
    const definition = new FakeContainer('dd', { children: fields, textContent: '' });
    definition.controls = fields.flatMap((field) => field.controls);
    const group = new FakeContainer('div', { children: [term, definition] });
    group.controls = definition.controls;
    for (const input of definition.controls) {
      const fieldMetadata = collectFieldMetadata(input, new FakeDocument(controls, labels));
      assert.equal(classifyControl(fieldMetadata)?.profileKey, profileKey);
      assert.equal(fieldMetadata.contextTexts[0], heading);
    }
    return definition.controls;
  }

  const fixed = makeBox('電話番号', 'phoneNumber');
  const mobile = makeBox('携帯電話番号', 'mobilePhone');
  const document = new FakeDocument(controls, labels);

  assert.deepEqual(fillDocument(document, {
    phoneNumber: '03-1234-5678',
    mobilePhone: '090-2345-6789',
  }), { filledCount: 6, failedCount: 0 });
  assert.deepEqual(fixed.map((control) => control.value), ['03', '1234', '5678']);
  assert.deepEqual(mobile.map((control) => control.value), ['090', '2345', '6789']);
});

test('hyphen labels do not break DD phone groups and reserved mobile controls never get whole values', () => {
  const controls = [];
  const labels = [];

  function phoneGroup(heading) {
    const term = new FakeContainer('dt', { textContent: heading });
    const fields = [];
    const groupLabels = [];
    for (let index = 0; index < 3; index += 1) {
      const input = new FakeInput({ type: 'text' });
      const wrapper = new FakeContainer('span', { controls: [input], children: [input] });
      fields.push(wrapper);
      controls.push(input);
      if (index < 2) {
        const hyphen = new FakeLabel('-', 'unmatched');
        hyphen.className = 'hyphen';
        groupLabels.push(hyphen);
        labels.push(hyphen);
      }
    }
    // The site places a hyphen label immediately before the second and third wrappers.
    const inputFields = fields.filter((field) => field instanceof FakeContainer);
    const children = [inputFields[0], groupLabels[0], inputFields[1], groupLabels[1], inputFields[2]];
    const definition = new FakeContainer('dd', { labels: groupLabels, children });
    definition.controls = inputFields.map((field) => field.controls[0]);
    const box = new FakeContainer('div', { children: [term, definition] });
    box.controls = definition.controls;
    return definition.controls;
  }

  const fixed = phoneGroup('電話番号');
  const mobile = phoneGroup('携帯電話番号');
  const document = new FakeDocument(controls, labels);

  for (const [group, key] of [[fixed, 'phoneNumber'], [mobile, 'mobilePhone']]) {
    for (const [index, input] of group.entries()) {
      const fieldMetadata = collectFieldMetadata(input, document);
      assert.equal(fieldMetadata.contextTexts[0], key === 'phoneNumber' ? '電話番号' : '携帯電話番号');
      assert.deepEqual(fieldMetadata.nearLabelTexts, index === 0 ? [] : ['-']);
      assert.equal(classifyControl(fieldMetadata)?.profileKey, key);
    }
  }

  assert.deepEqual(fillDocument(document, {
    phoneNumber: '09052396441',
    mobilePhone: '09052396441',
  }), { filledCount: 6, failedCount: 0 });
  assert.deepEqual(fixed.map((input) => input.value), ['090', '5239', '6441']);
  assert.deepEqual(mobile.map((input) => input.value), ['090', '5239', '6441']);
  for (const input of [...fixed, ...mobile]) {
    assert.deepEqual(input.events.map(({ type }) => type), ['input', 'change']);
  }
});

test('DD phone groups remain grouped beyond the shallow per-control ancestor walk', () => {
  const controls = [];
  const labels = [];
  function makeGroup(heading) {
    const term = new FakeContainer('dt', { textContent: heading });
    const inputs = Array.from({ length: 3 }, () => {
      const input = new FakeInput({ type: 'text' });
      let branch = input;
      for (let depth = 0; depth < 7; depth += 1) {
        const wrapper = new FakeContainer('div', { children: [branch] });
        wrapper.controls = [input];
        branch = wrapper;
      }
      const field = new FakeContainer('span', { children: [branch] });
      field.controls = [input];
      controls.push(input);
      return { input, field };
    });
    const hyphens = [new FakeLabel('-', ''), new FakeLabel('-', '')];
    labels.push(...hyphens);
    const definition = new FakeContainer('dd', {
      children: [inputs[0].field, hyphens[0], inputs[1].field, hyphens[1], inputs[2].field],
      labels: hyphens,
    });
    definition.controls = inputs.map(({ input }) => input);
    new FakeContainer('div', { children: [term, definition] });
    for (const { input } of inputs) {
      const fieldMetadata = collectFieldMetadata(input, new FakeDocument(controls, labels));
      assert.equal(fieldMetadata.contextTexts[0], heading);
      assert.equal(classifyControl(fieldMetadata)?.profileKey, heading === '電話番号' ? 'phoneNumber' : 'mobilePhone');
    }
    return inputs.map(({ input }) => input);
  }

  const fixed = makeGroup('電話番号');
  const mobile = makeGroup('携帯電話番号');
  assert.deepEqual(fillDocument(new FakeDocument(controls, labels), {
    phoneNumber: '09052396441',
    mobilePhone: '09052396441',
  }), { filledCount: 6, failedCount: 0 });
  assert.deepEqual(fixed.map((input) => input.value), ['090', '5239', '6441']);
  assert.deepEqual(mobile.map((input) => input.value), ['090', '5239', '6441']);
  for (const input of [...fixed, ...mobile]) {
    assert.deepEqual(input.events.map(({ type }) => type), ['input', 'change']);
  }
});

test('radio gender uses a unique nearby sibling label even when for is wrong', () => {
  const male = new FakeInput({ type: 'radio', name: 'sexcd', id: 'male-choice', value: '1' });
  const female = new FakeInput({ type: 'radio', name: 'sexcd', id: 'female-choice', value: '2' });
  const maleLabel = new FakeLabel('男', 'text');
  const femaleLabel = new FakeLabel('女', 'text');
  new FakeContainer('li', { controls: [male], labels: [maleLabel] });
  new FakeContainer('li', { controls: [female], labels: [femaleLabel] });
  const document = new FakeDocument([male, female], [maleLabel, femaleLabel]);

  assert.deepEqual(fillDocument(document, { gender: '男性' }), { filledCount: 1, failedCount: 0 });
  assert.equal(male.checked, true);
  assert.equal(female.checked, false);
  assert.deepEqual(male.events.map(({ type }) => type), ['input', 'change']);
  assert.deepEqual(female.events, []);
});

test('radio with multiple nearby label candidates is left unchecked', () => {
  const ambiguous = new FakeInput({ type: 'radio', name: 'sexcd', id: 'ambiguous', value: '1' });
  const female = new FakeInput({ type: 'radio', name: 'sexcd', id: 'female', value: '2' });
  const labels = [new FakeLabel('男', 'text'), new FakeLabel('その他', 'text')];
  const femaleLabel = new FakeLabel('女', 'text');
  new FakeContainer('li', { controls: [ambiguous], labels });
  new FakeContainer('li', { controls: [female], labels: [femaleLabel] });
  const document = new FakeDocument([ambiguous, female], [...labels, femaleLabel]);

  assert.deepEqual(fillDocument(document, { gender: '男性' }), { filledCount: 0, failedCount: 0 });
  assert.equal(ambiguous.checked, false);
  assert.equal(female.checked, false);
  assert.deepEqual(ambiguous.events, []);
});

test('split fixed and mobile phone groups use only their matching profile values', () => {
  const makeGroup = (prefix, label, content) => {
    const controls = [1, 2, 3].map((number) => new FakeInput({
      type: 'text',
      name: `${prefix}${number}`,
    }));
    const labelNode = new FakeLabel(label);
    const group = new FakeContainer('div', {
      controls,
      labels: [labelNode],
      textContent: `${label}--`,
    });
    return { controls, group };
  };
  const fixed = makeGroup('gtel', '固定電話番号');
  const mobile = makeGroup('kttel', '携帯電話番号');
  const unrelated = [1, 2, 3].map((number) => new FakeInput({ type: 'text', name: `other${number}` }));
  new FakeContainer('div', { controls: unrelated, textContent: '---' });
  const document = new FakeDocument([...fixed.controls, ...mobile.controls, ...unrelated]);

  assert.deepEqual(fillDocument(document, {
    phoneNumber: '03-1234-5678',
    mobilePhone: '090-1234-5678',
  }), { filledCount: 6, failedCount: 0 });
  assert.deepEqual(fixed.controls.map((control) => control.value), ['03', '1234', '5678']);
  assert.deepEqual(mobile.controls.map((control) => control.value), ['090', '1234', '5678']);
  assert.deepEqual(unrelated.map((control) => control.value), ['', '', '']);

  const fixedOnly = makeGroup('fixed', '固定電話番号');
  const mobileOnly = makeGroup('mobile', '携帯電話番号');
  const secondDocument = new FakeDocument([...fixedOnly.controls, ...mobileOnly.controls]);
  assert.deepEqual(fillDocument(secondDocument, {
    phoneNumber: '',
    mobilePhone: '090-1234-5678',
  }), { filledCount: 3, failedCount: 0 });
  assert.deepEqual(fixedOnly.controls.map((control) => control.value), ['', '', '']);
  assert.deepEqual(mobileOnly.controls.map((control) => control.value), ['090', '1234', '5678']);

  const fixedPhone = new FakeInput({ type: 'tel', id: 'fixed-phone' });
  const mobilePhone = new FakeInput({ type: 'tel', id: 'mobile-phone' });
  const singleDocument = new FakeDocument(
    [fixedPhone, mobilePhone],
    [new FakeLabel('電話番号', 'fixed-phone'), new FakeLabel('携帯電話', 'mobile-phone')],
  );
  assert.deepEqual(fillDocument(singleDocument, {
    phoneNumber: '03-1234-5678',
    mobilePhone: '',
  }), { filledCount: 1, failedCount: 0 });
  assert.equal(fixedPhone.value, '03-1234-5678');
  assert.equal(mobilePhone.value, '');
});

test('email fills standard, @ split, and explicit confirmation fields but skips mobile email', () => {
  const standard = new FakeInput({ type: 'email', id: 'standard' });
  const confirmation = new FakeInput({ type: 'email', id: 'confirmation' });
  const mobileEmail = new FakeInput({ type: 'email', id: 'mobile-email' });
  const account = new FakeInput({ type: 'text' });
  const domain = new FakeInput({ type: 'text' });
  const confirmAccount = new FakeInput({ type: 'text' });
  const confirmDomain = new FakeInput({ type: 'text' });
  const unconfirmedAccount = new FakeInput({ type: 'text', name: 'account2' });
  const unconfirmedDomain = new FakeInput({ type: 'text', name: 'domain2' });
  const mainGroup = new FakeContainer('div', {
    controls: [account, domain], labels: [new FakeLabel('メールアドレス')], textContent: '＠',
  });
  const confirmGroup = new FakeContainer('li', {
    controls: [confirmAccount, confirmDomain],
    labels: [new FakeLabel('メールアドレス再入力')],
    textContent: '＠',
  });
  new FakeContainer('div', {
    controls: [unconfirmedAccount, unconfirmedDomain],
    textContent: '＠',
  });
  const labels = [
    new FakeLabel('E-mail address', 'standard'),
    new FakeLabel('E-mail address confirm', 'confirmation'),
    new FakeLabel('携帯アドレス', 'mobile-email'),
    mainGroup.labels[0],
    confirmGroup.labels[0],
  ];
  const controls = [
    standard,
    confirmation,
    mobileEmail,
    account,
    domain,
    confirmAccount,
    confirmDomain,
    unconfirmedAccount,
    unconfirmedDomain,
  ];
  const document = new FakeDocument(controls, labels);

  assert.deepEqual(fillDocument(document, { email: 'sample@example.com' }), {
    filledCount: 6,
    failedCount: 0,
  });
  assert.equal(standard.value, 'sample@example.com');
  assert.equal(confirmation.value, 'sample@example.com');
  assert.equal(mobileEmail.value, '');
  assert.deepEqual([account.value, domain.value], ['sample', 'example.com']);
  assert.deepEqual([confirmAccount.value, confirmDomain.value], ['sample', 'example.com']);
  assert.deepEqual([unconfirmedAccount.value, unconfirmedDomain.value], ['', '']);
  assert.ok(mainGroup && confirmGroup);
});

test('duplicate email fields without an explicit confirmation label remain unchanged', () => {
  const first = new FakeInput({ type: 'email', id: 'mail-one' });
  const second = new FakeInput({ type: 'email', id: 'mail-two' });
  const document = new FakeDocument(
    [first, second],
    [new FakeLabel('メールアドレス', 'mail-one'), new FakeLabel('メールアドレス', 'mail-two')],
  );

  assert.deepEqual(fillDocument(document, { email: 'sample@example.com' }), {
    filledCount: 0,
    failedCount: 0,
  });
  assert.equal(first.value, '');
  assert.equal(second.value, '');
});

test('fillDocument updates only writable text inputs with non-empty matching profile values', () => {
  const firstFamily = new FakeInput({ name: 'last_name' }, { value: 'old' });
  const secondFamily = new FakeInput({ placeholder: 'Family Name' });
  const emptyGiven = new FakeInput({ name: 'first_name' }, { value: 'keep' });
  const japaneseFamily = new FakeInput({ id: 'familyNameJa', name: 'family_name_ja' });
  const hidden = new FakeInput({ name: 'last_name', type: 'hidden' }, { value: 'hidden' });
  const email = new FakeInput({ name: 'email', type: 'email' }, { value: 'email' });
  const disabled = new FakeInput({ name: 'last_name' }, { disabled: true, value: 'disabled' });
  const readOnly = new FakeInput({ name: 'last_name' }, { readOnly: true, value: 'readonly' });
  const document = new FakeDocument(
    [firstFamily, secondFamily, emptyGiven, japaneseFamily, hidden, email, disabled, readOnly],
    [new FakeLabel('姓', 'familyNameJa')],
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
    id: 'familyNameJa',
    name: 'family_name_ja',
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

test('classifyField leaves surname and given-name instructions ambiguous without a group context', () => {
  assert.equal(
    classifyField(metadata({ labelTexts: ['姓を入力してください'] })),
    null,
  );
  assert.equal(
    classifyField(metadata({ labelTexts: ['名を入力してください'] })),
    null,
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

test('date and month select segments match zero-padded numeric options but generic selects stay exact', () => {
  const monthDate = new FakeSelect({ id: 'birth-month', name: 'birthMonth' }, [
    new FakeOption('5', '5月'),
  ]);
  const dayDate = new FakeSelect({ id: 'birth-day', name: 'birthDay' }, [
    new FakeOption('5', '5日'),
  ]);
  const graduationMonth = new FakeSelect({ id: 'grad-month', name: 'graduationMonth' }, [
    new FakeOption('05', '五月'),
  ]);
  const genericCourse = new FakeSelect({ id: 'course', name: 'academicCourse' }, [
    new FakeOption('5', '05'),
  ]);
  const document = new FakeDocument(
    [monthDate, dayDate, graduationMonth, genericCourse],
    [
      new FakeLabel('生年月日 月', 'birth-month'),
      new FakeLabel('生年月日 日', 'birth-day'),
      new FakeLabel('卒業年月 月', 'grad-month'),
      new FakeLabel('課程', 'course'),
    ],
  );

  assert.deepEqual(fillDocument(document, {
    birthDate: '2002-05-05',
    graduationMonth: '2028-05',
    academicCourse: '5',
  }), { filledCount: 3, failedCount: 0 });
  assert.equal(monthDate.value, '5');
  assert.equal(dayDate.value, '5');
  assert.equal(graduationMonth.value, '05');
  assert.equal(genericCourse.value, '');
});

test('value changes dispatch only input/change and do not call extension submit or click actions', () => {
  const family = new FakeInput({ id: 'family' });
  const document = new FakeDocument([family], [new FakeLabel('苗字', 'family')]);
  let clickCalls = 0;
  const actionButton = { click() { clickCalls += 1; } };

  assert.deepEqual(fillDocument(document, { familyName: '山田' }), {
    filledCount: 1,
    failedCount: 0,
  });
  assert.deepEqual(family.events.map(({ type }) => type), ['input', 'change']);
  assert.equal(document.submitCalls, 0);
  assert.equal(document.requestSubmitCalls, 0);
  assert.equal(clickCalls, 0);
  assert.ok(actionButton);
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
