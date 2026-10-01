(function exposeProfileStorage(root, factory) {
  const api = factory();

  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.RakurakuProfileStorage = api;
  }
})(globalThis, function createProfileStorageApi() {
  'use strict';

  const PROFILE_KEYS = Object.freeze([
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

  const STRING_KEYS = PROFILE_KEYS.filter((key) => key !== 'researchKeywords');

  const EDUCATION_HISTORY_FIELDS = Object.freeze({
    middleSchool: ['schoolName', 'enrollmentMonth', 'graduationMonth'],
    highSchool: ['schoolName', 'enrollmentMonth', 'graduationMonth'],
    bachelor: ['universityName', 'facultyName', 'departmentName', 'enrollmentMonth', 'graduationMonth'],
    master: ['graduateSchoolName', 'graduateDepartmentName', 'majorName', 'enrollmentMonth', 'completionMonth'],
  });
  const FINAL_EDUCATION_LEVELS = new Set(['middleSchool', 'highSchool', 'bachelor', 'master', 'doctorate']);
  const FINAL_EDUCATION_COMPLETION_STATUSES = new Set([
    'graduated', 'graduationExpected', 'completed', 'completionExpected',
  ]);

  function normalizeRecord(source, fields) {
    const record = source && typeof source === 'object' && !Array.isArray(source) ? source : {};
    return Object.fromEntries(fields.map((key) => [
      key, typeof record[key] === 'string' ? record[key].trim() : '',
    ]));
  }

  function normalizeEducationHistory(value) {
    const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    return Object.fromEntries(Object.entries(EDUCATION_HISTORY_FIELDS).map(([stage, fields]) => [
      stage, normalizeRecord(source[stage], fields),
    ]));
  }

  function normalizeFinalEducation(value) {
    const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    return {
      level: FINAL_EDUCATION_LEVELS.has(source.level) ? source.level : '',
      completionStatus: FINAL_EDUCATION_COMPLETION_STATUSES.has(source.completionStatus)
        ? source.completionStatus : '',
    };
  }

  function sameSchoolName(left, right) {
    return typeof left === 'string' && typeof right === 'string'
      && left.normalize('NFKC').trim() !== ''
      && left.normalize('NFKC').trim() === right.normalize('NFKC').trim();
  }

  // Prefer the selected stage's record. Legacy single-school dates are a fallback
  // only when its stored school name exactly matches that stage's institution.
  // Dates from any other stage are never substituted.
  function resolveFinalEducationMonths(value) {
    const profile = value && typeof value === 'object' ? value : {};
    const finalEducation = normalizeFinalEducation(profile.finalEducation);
    const stage = finalEducation.level;
    const monthFields = {
      middleSchool: ['enrollmentMonth', 'graduationMonth'],
      highSchool: ['enrollmentMonth', 'graduationMonth'],
      bachelor: ['enrollmentMonth', 'graduationMonth'],
      master: ['enrollmentMonth', 'completionMonth'],
    }[stage];
    if (!monthFields) return { enrollmentMonth: '', completionMonth: '' };

    const record = normalizeRecord(profile.educationHistory && profile.educationHistory[stage],
      EDUCATION_HISTORY_FIELDS[stage]);
    const recordSchoolName = record.schoolName || record.universityName || record.graduateSchoolName;
    const canUseLegacy = sameSchoolName(recordSchoolName, profile.schoolName);
    const [startKey, endKey] = monthFields;
    return {
      enrollmentMonth: record[startKey]
        || (canUseLegacy && typeof profile.enrollmentMonth === 'string' ? profile.enrollmentMonth.trim() : ''),
      completionMonth: record[endKey]
        || (canUseLegacy && typeof profile.graduationMonth === 'string' ? profile.graduationMonth.trim() : ''),
    };
  }

  function normalizeProfile(value) {
    const source = value && typeof value === 'object' ? value : {};

    const profile = Object.fromEntries(
      STRING_KEYS.map((key) => [
        key,
        typeof source[key] === 'string' ? source[key].trim() : '',
      ]),
    );
    profile.researchKeywords = Array.isArray(source.researchKeywords)
      ? source.researchKeywords
        .filter((keyword) => typeof keyword === 'string')
        .map((keyword) => keyword.trim())
        .filter(Boolean)
      : [];
    profile.educationHistory = normalizeEducationHistory(source.educationHistory);
    profile.finalEducation = normalizeFinalEducation(source.finalEducation);
    return profile;
  }

  function createProfileStorage(storageArea) {
    return {
      async load() {
        const stored = await storageArea.get('profile');
        return normalizeProfile(stored && stored.profile);
      },

      async save(value) {
        const profile = normalizeProfile(value);
        await storageArea.set({ profile });
        return profile;
      },
    };
  }

  return {
    PROFILE_KEYS,
    normalizeProfile,
    createProfileStorage,
    normalizeEducationHistory,
    normalizeFinalEducation,
    resolveFinalEducationMonths,
  };
});
