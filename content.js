(function runOrExposeContent(root, factory) {
  const api = factory();

  if (typeof module === 'object' && module.exports) {
    module.exports = api;
    return undefined;
  }

  return api.runContent({
    storageArea: root.chrome.storage.local,
    document: root.document,
    autofill: root.RakurakuAutofill,
  });
})(globalThis, function createContentApi() {
  'use strict';

  async function runContent({ storageArea, document, autofill }) {
    const stored = await storageArea.get('profile');
    const profile = stored && stored.profile && typeof stored.profile === 'object'
      ? stored.profile
      : {};

    return autofill.fillDocument(document, profile);
  }

  return { runContent };
});
