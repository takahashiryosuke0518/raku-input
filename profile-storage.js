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
  ]);

  function normalizeProfile(value) {
    const source = value && typeof value === 'object' ? value : {};

    return Object.fromEntries(
      PROFILE_KEYS.map((key) => [
        key,
        typeof source[key] === 'string' ? source[key].trim() : '',
      ]),
    );
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
