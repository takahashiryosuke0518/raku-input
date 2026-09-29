const test = require('node:test');
const assert = require('node:assert/strict');

const {
  PROFILE_KEYS,
  normalizeProfile,
  createProfileStorage,
} = require('../profile-storage.js');

const EMPTY_PROFILE = {
  familyName: '',
  givenName: '',
  familyNameLatin: '',
  givenNameLatin: '',
  birthDate: '',
  gender: '',
  currentPrefecture: '',
  homePrefecture: '',
  academicCourse: '',
  grade: '',
  schoolName: '',
  departmentName: '',
  majorName: '',
  enrollmentMonth: '',
  graduationMonth: '',
  laboratoryName: '',
  laboratoryStartMonth: '',
  laboratoryEndMonth: '',
  researchKeywords: [],
  researchOverview: '',
};

function createFakeStorage(initial = {}) {
  const data = { ...initial };

  return {
    lastSet: null,
    async get(key) {
      return { [key]: data[key] };
    },
    async set(value) {
      this.lastSet = value;
      Object.assign(data, value);
    },
  };
}

test('normalizeProfile keeps all profile fields, trims strings, and normalizes keyword arrays', () => {
  assert.deepEqual(
    normalizeProfile({
      familyName: '  保存値  ',
      givenName: 42,
      familyNameLatin: '  LATIN-VALUE ',
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
      researchKeywords: [' 医療画像処理 ', '', '深層学習', 1, 'PET '],
      researchOverview: ' 研究内容... ',
      extra: 'ignored',
    }),
    {
      familyName: '保存値',
      givenName: '',
      familyNameLatin: 'LATIN-VALUE',
      givenNameLatin: '',
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
    },
  );
  assert.deepEqual(PROFILE_KEYS, [
    'familyName',
    'givenName',
    'familyNameLatin',
    'givenNameLatin',
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
  ]);
});

test('load returns an empty normalized profile when nothing is stored', async () => {
  const storage = createProfileStorage(createFakeStorage());

  assert.deepEqual(await storage.load(), EMPTY_PROFILE);
});

test('load fills missing saved fields without leaking extra fields', async () => {
  const area = createFakeStorage({
    profile: { givenName: '保存値', extra: 'ignored' },
  });
  const storage = createProfileStorage(area);

  assert.deepEqual(await storage.load(), {
    ...EMPTY_PROFILE,
    givenName: '保存値',
  });
});

test('save stores one normalized profile object and returns it', async () => {
  const area = createFakeStorage();
  const storage = createProfileStorage(area);
  const input = {
    familyName: '  姓の値 ',
    givenName: ' 名の値  ',
    familyNameLatin: ' FAMILY ',
    givenNameLatin: ' GIVEN ',
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
    researchKeywords: [' 医療画像処理 ', '深層学習', 'PET '],
    researchOverview: ' 研究内容... ',
  };
  const expected = {
    familyName: '姓の値',
    givenName: '名の値',
    familyNameLatin: 'FAMILY',
    givenNameLatin: 'GIVEN',
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
  };

  assert.deepEqual(await storage.save(input), expected);
  assert.deepEqual(area.lastSet, { profile: expected });
});
