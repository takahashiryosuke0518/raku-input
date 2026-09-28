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

test('normalizeProfile keeps only the four string fields and trims them', () => {
  assert.deepEqual(
    normalizeProfile({
      familyName: '  保存値  ',
      givenName: 42,
      familyNameLatin: '  LATIN-VALUE ',
      extra: 'ignored',
    }),
    {
      familyName: '保存値',
      givenName: '',
      familyNameLatin: 'LATIN-VALUE',
      givenNameLatin: '',
    },
  );
  assert.deepEqual(PROFILE_KEYS, [
    'familyName',
    'givenName',
    'familyNameLatin',
    'givenNameLatin',
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
  };
  const expected = {
    familyName: '姓の値',
    givenName: '名の値',
    familyNameLatin: 'FAMILY',
    givenNameLatin: 'GIVEN',
  };

  assert.deepEqual(await storage.save(input), expected);
  assert.deepEqual(area.lastSet, { profile: expected });
});
