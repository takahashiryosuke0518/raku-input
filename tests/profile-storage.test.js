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
  familyNameKana: '',
  givenNameKana: '',
  phoneNumber: '',
  mobilePhone: '',
  currentPostalCode: '',
  currentAddress: '',
  currentBuilding: '',
  email: '',
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
  educationHistory: {
    middleSchool: { schoolName: '', enrollmentMonth: '', graduationMonth: '' },
    highSchool: { schoolName: '', enrollmentMonth: '', graduationMonth: '' },
    bachelor: {
      universityName: '', facultyName: '', departmentName: '', enrollmentMonth: '', graduationMonth: '',
    },
    master: {
      graduateSchoolName: '', graduateDepartmentName: '', majorName: '', enrollmentMonth: '', completionMonth: '',
    },
  },
  finalEducation: { level: '', completionStatus: '' },
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
      familyNameKana: ' ヤマダ ',
      givenNameKana: ' タロウ ',
      phoneNumber: ' 000-0000-0000 ',
      mobilePhone: ' 000-0000-0000 ',
      email: ' example@example.com ',
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
      educationHistory: {
        middleSchool: { schoolName: ' 中学校 ', enrollmentMonth: ' 2012-04 ', graduationMonth: ' 2015-03 ' },
        highSchool: { schoolName: ' 高等学校 ', enrollmentMonth: ' 2015-04 ', graduationMonth: ' 2018-03 ' },
        bachelor: {
          universityName: ' 大学 ', facultyName: ' 学部 ', departmentName: ' 学科 ',
          enrollmentMonth: ' 2018-04 ', graduationMonth: ' 2022-03 ',
        },
        master: {
          graduateSchoolName: ' 大学院 ', graduateDepartmentName: ' 研究科 ', majorName: ' 専攻 ',
          enrollmentMonth: ' 2022-04 ', completionMonth: ' 2024-03 ',
        },
      },
      finalEducation: { level: 'master', completionStatus: 'completionExpected' },
      researchKeywords: [' 医療画像処理 ', '', '深層学習', 1, 'PET '],
      researchOverview: ' 研究内容... ',
      extra: 'ignored',
    }),
    {
      familyName: '保存値',
      givenName: '',
      familyNameLatin: 'LATIN-VALUE',
      givenNameLatin: '',
      familyNameKana: 'ヤマダ',
      givenNameKana: 'タロウ',
      phoneNumber: '000-0000-0000',
      mobilePhone: '000-0000-0000',
      currentPostalCode: '',
      currentAddress: '',
      currentBuilding: '',
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
        middleSchool: { schoolName: '中学校', enrollmentMonth: '2012-04', graduationMonth: '2015-03' },
        highSchool: { schoolName: '高等学校', enrollmentMonth: '2015-04', graduationMonth: '2018-03' },
        bachelor: {
          universityName: '大学', facultyName: '学部', departmentName: '学科',
          enrollmentMonth: '2018-04', graduationMonth: '2022-03',
        },
        master: {
          graduateSchoolName: '大学院', graduateDepartmentName: '研究科', majorName: '専攻',
          enrollmentMonth: '2022-04', completionMonth: '2024-03',
        },
      },
      finalEducation: { level: 'master', completionStatus: 'completionExpected' },
    },
  );
  assert.deepEqual(PROFILE_KEYS, [
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
  ]);
});

test('load returns an empty normalized profile when nothing is stored', async () => {
  const storage = createProfileStorage(createFakeStorage());

  assert.deepEqual(await storage.load(), EMPTY_PROFILE);
});

test('normalizeProfile stores current postal code and address components', () => {
  assert.deepEqual(normalizeProfile({
    currentPostalCode: ' 1234567 ',
    currentAddress: ' 東京都千代田区千代田1-1 ',
    currentBuilding: ' ○○マンション101 ',
  }), {
    ...EMPTY_PROFILE,
    currentPostalCode: '1234567',
    currentAddress: '東京都千代田区千代田1-1',
    currentBuilding: '○○マンション101',
  });
});

test('final education dates prefer its matching history record and only use matching legacy school data as fallback', () => {
  const { resolveFinalEducationMonths } = require('../profile-storage.js');
  assert.deepEqual(resolveFinalEducationMonths({
    finalEducation: { level: 'master' },
    educationHistory: {
      master: {
        graduateSchoolName: '大学院A', enrollmentMonth: '2022-04', completionMonth: '2024-03',
      },
    },
    schoolName: '大学院A', enrollmentMonth: '2021-04', graduationMonth: '2023-03',
  }), { enrollmentMonth: '2022-04', completionMonth: '2024-03' });

  assert.deepEqual(resolveFinalEducationMonths({
    finalEducation: { level: 'bachelor' },
    educationHistory: { bachelor: { universityName: '旧プロフィールの大学' } },
    schoolName: '旧プロフィールの大学', enrollmentMonth: '2018-04', graduationMonth: '2022-03',
  }), { enrollmentMonth: '2018-04', completionMonth: '2022-03' });

  assert.deepEqual(resolveFinalEducationMonths({
    finalEducation: { level: 'bachelor' },
    educationHistory: { bachelor: { universityName: '別の大学' } },
    schoolName: '旧プロフィールの大学', enrollmentMonth: '2018-04', graduationMonth: '2022-03',
  }), { enrollmentMonth: '', completionMonth: '' });

  const doctorate = normalizeProfile({
    finalEducation: { level: 'doctorate', completionStatus: 'completionExpected' },
    educationHistory: {
      master: { graduateSchoolName: '修士課程', enrollmentMonth: '2022-04', completionMonth: '2024-03' },
    },
  });
  assert.deepEqual(doctorate.finalEducation, {
    level: 'doctorate', completionStatus: 'completionExpected',
  });
  assert.deepEqual(resolveFinalEducationMonths(doctorate), {
    enrollmentMonth: '', completionMonth: '',
  });
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

test('old single-school profiles remain intact without being copied into history records', async () => {
  const area = createFakeStorage({
    profile: {
      schoolName: '旧プロフィールの大学',
      departmentName: '旧プロフィールの研究科',
      majorName: '旧プロフィールの専攻',
      enrollmentMonth: '2022-04',
      graduationMonth: '2024-03',
    },
  });
  const profile = await createProfileStorage(area).load();

  assert.equal(profile.schoolName, '旧プロフィールの大学');
  assert.equal(profile.departmentName, '旧プロフィールの研究科');
  assert.equal(profile.majorName, '旧プロフィールの専攻');
  assert.equal(profile.enrollmentMonth, '2022-04');
  assert.equal(profile.graduationMonth, '2024-03');
  assert.deepEqual(profile.educationHistory, EMPTY_PROFILE.educationHistory);
  assert.deepEqual(profile.finalEducation, { level: '', completionStatus: '' });
});

test('save stores one normalized profile object and returns it', async () => {
  const area = createFakeStorage();
  const storage = createProfileStorage(area);
  const input = {
    familyName: '  姓の値 ',
    givenName: ' 名の値  ',
    familyNameKana: ' ヤマダ ',
    givenNameKana: ' タロウ ',
    phoneNumber: ' 000-0000-0000 ',
    mobilePhone: ' 000-0000-0000 ',
    email: ' example@example.com ',
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
    educationHistory: {
      middleSchool: { schoolName: ' 中学校 ', enrollmentMonth: ' 2012-04 ', graduationMonth: ' 2015-03 ' },
      highSchool: { schoolName: ' 高等学校 ', enrollmentMonth: ' 2015-04 ', graduationMonth: ' 2018-03 ' },
      bachelor: {
        universityName: ' 大学 ', facultyName: ' 学部 ', departmentName: ' 学科 ',
        enrollmentMonth: ' 2018-04 ', graduationMonth: ' 2022-03 ',
      },
      master: {
        graduateSchoolName: ' 大学院 ', graduateDepartmentName: ' 研究科 ', majorName: ' 専攻 ',
        enrollmentMonth: ' 2022-04 ', completionMonth: ' 2024-03 ',
      },
    },
    finalEducation: { level: 'master', completionStatus: 'completionExpected' },
  };
  const expected = {
    familyName: '姓の値',
    givenName: '名の値',
    familyNameKana: 'ヤマダ',
    givenNameKana: 'タロウ',
    phoneNumber: '000-0000-0000',
    mobilePhone: '000-0000-0000',
    currentPostalCode: '',
    currentAddress: '',
    currentBuilding: '',
    email: 'example@example.com',
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
    educationHistory: {
      middleSchool: { schoolName: '中学校', enrollmentMonth: '2012-04', graduationMonth: '2015-03' },
      highSchool: { schoolName: '高等学校', enrollmentMonth: '2015-04', graduationMonth: '2018-03' },
      bachelor: {
        universityName: '大学', facultyName: '学部', departmentName: '学科',
        enrollmentMonth: '2018-04', graduationMonth: '2022-03',
      },
      master: {
        graduateSchoolName: '大学院', graduateDepartmentName: '研究科', majorName: '専攻',
        enrollmentMonth: '2022-04', completionMonth: '2024-03',
      },
    },
    finalEducation: { level: 'master', completionStatus: 'completionExpected' },
  };

  assert.deepEqual(await storage.save(input), expected);
  assert.deepEqual(area.lastSet, { profile: expected });
});
