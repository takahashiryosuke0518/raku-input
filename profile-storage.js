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
  const PROFILE_EXPORT_FORMAT = 'rakuraku-profile';
  const PROFILE_EXPORT_VERSION = 1;

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

  function isPlainObject(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }

  function hasExactKeys(value, expectedKeys) {
    if (!isPlainObject(value)) return false;
    const actualKeys = Object.keys(value);
    return actualKeys.length === expectedKeys.length
      && expectedKeys.every((key) => Object.hasOwn(value, key));
  }

  function isValidExportProfile(profile) {
    const profileKeys = [...PROFILE_KEYS, 'educationHistory', 'finalEducation'];
    if (!hasExactKeys(profile, profileKeys)) return false;
    if (!STRING_KEYS.every((key) => typeof profile[key] === 'string')) return false;
    if (!Array.isArray(profile.researchKeywords)
      || !profile.researchKeywords.every((keyword) => typeof keyword === 'string')) return false;
    if (!hasExactKeys(profile.educationHistory, Object.keys(EDUCATION_HISTORY_FIELDS))) return false;
    for (const [stage, fields] of Object.entries(EDUCATION_HISTORY_FIELDS)) {
      const record = profile.educationHistory[stage];
      if (!hasExactKeys(record, fields)
        || !fields.every((key) => typeof record[key] === 'string')) return false;
    }
    if (!hasExactKeys(profile.finalEducation, ['level', 'completionStatus'])) return false;
    if (typeof profile.finalEducation.level !== 'string'
      || typeof profile.finalEducation.completionStatus !== 'string') return false;
    if (profile.finalEducation.level
      && !FINAL_EDUCATION_LEVELS.has(profile.finalEducation.level)) return false;
    if (profile.finalEducation.completionStatus
      && !FINAL_EDUCATION_COMPLETION_STATUSES.has(profile.finalEducation.completionStatus)) return false;
    return true;
  }

  function createProfileExport(value) {
    return {
      format: PROFILE_EXPORT_FORMAT,
      version: PROFILE_EXPORT_VERSION,
      profile: normalizeProfile(value),
    };
  }

  function serializeProfileExport(value) {
    return `${JSON.stringify(createProfileExport(value), null, 2)}\n`;
  }

  function parseProfileImportJson(source) {
    if (typeof source !== 'string') throw new Error('Invalid profile file');
    let envelope;
    try {
      envelope = JSON.parse(source);
    } catch (_error) {
      throw new Error('Invalid profile file');
    }
    if (!hasExactKeys(envelope, ['format', 'version', 'profile'])
      || envelope.format !== PROFILE_EXPORT_FORMAT
      || envelope.version !== PROFILE_EXPORT_VERSION
      || !isValidExportProfile(envelope.profile)) {
      throw new Error('Invalid profile file');
    }
    return normalizeProfile(envelope.profile);
  }

  function createProfileStorage(storageArea) {
    async function load() {
      const stored = await storageArea.get('profile');
      return normalizeProfile(stored && stored.profile);
    }

    async function save(value) {
      const profile = normalizeProfile(value);
      await storageArea.set({ profile });
      return profile;
    }

    return {
      load,
      save,
      async exportJson() {
        return serializeProfileExport(await load());
      },
      parseImportJson: parseProfileImportJson,
    };
  }

  return {
    PROFILE_KEYS,
    PROFILE_EXPORT_FORMAT,
    PROFILE_EXPORT_VERSION,
    normalizeProfile,
    createProfileStorage,
    normalizeEducationHistory,
    normalizeFinalEducation,
    resolveFinalEducationMonths,
    createProfileExport,
    serializeProfileExport,
    parseProfileImportJson,
  };
});
