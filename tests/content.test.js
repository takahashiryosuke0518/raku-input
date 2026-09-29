const test = require('node:test');
const assert = require('node:assert/strict');

const { runContent } = require('../content.js');

test('runContent loads the saved profile and returns the real fill result', async () => {
  const profile = {
    familyName: '保存姓',
    givenName: '保存名',
    familyNameLatin: 'FAMILY',
    givenNameLatin: 'GIVEN',
  };
  const document = { marker: 'document' };
  let receivedDocument;
  let receivedProfile;
  const autofill = {
    fillDocument(actualDocument, actualProfile) {
      receivedDocument = actualDocument;
      receivedProfile = actualProfile;
      return { filledCount: 4, failedCount: 0 };
    },
  };
  const storageArea = {
    async get(key) {
      assert.equal(key, 'profile');
      return { profile };
    },
  };

  assert.deepEqual(
    await runContent({ storageArea, document, autofill }),
    { filledCount: 4, failedCount: 0 },
  );
  assert.equal(receivedDocument, document);
  assert.equal(receivedProfile, profile);
});

test('runContent treats a missing saved profile as an empty object', async () => {
  let receivedProfile;
  const autofill = {
    fillDocument(_document, profile) {
      receivedProfile = profile;
      return { filledCount: 0, failedCount: 0 };
    },
  };

  const result = await runContent({
    storageArea: { get: async () => ({}) },
    document: {},
    autofill,
  });

  assert.deepEqual(result, { filledCount: 0, failedCount: 0 });
  assert.deepEqual(receivedProfile, {});
});

test('runContent rejects when storage cannot be read', async () => {
  const failure = new Error('storage unavailable');

  await assert.rejects(
    runContent({
      storageArea: { get: async () => { throw failure; } },
      document: {},
      autofill: { fillDocument: () => ({ filledCount: 0, failedCount: 0 }) },
    }),
    failure,
  );
});

test('runContent uses asynchronous autofill orchestration when the content script exposes it', async () => {
  const expected = { filledCount: 3, failedCount: 0 };
  let called = false;
  const result = await runContent({
    storageArea: { get: async () => ({ profile: { schoolName: '秋田県立大学' } }) },
    document: { marker: 'page' },
    autofill: {
      fillDocument() { throw new Error('sync fallback should not run'); },
      async fillDocumentAsync(document, profile) {
        called = document.marker === 'page' && profile.schoolName === '秋田県立大学';
        return expected;
      },
    },
  });

  assert.equal(called, true);
  assert.deepEqual(result, expected);
});
