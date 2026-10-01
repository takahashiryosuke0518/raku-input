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
  };
});
