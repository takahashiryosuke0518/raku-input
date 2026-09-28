(function exposePopup(root, factory) {
  const api = factory();

  if (typeof module === 'object' && module.exports) {
    module.exports = api;
    return;
  }

  function start() {
    const storageApi = root.RakurakuProfileStorage.createProfileStorage(
      root.chrome.storage.local,
    );
    const controller = api.createPopupController({
      document: root.document,
      storageApi,
      tabsApi: root.chrome.tabs,
      scriptingApi: root.chrome.scripting,
    });

    root.document.getElementById('saveButton').addEventListener('click', () => {
      controller.saveProfile();
    });
    root.document.getElementById('fillButton').addEventListener('click', () => {
      controller.fillCurrentPage();
    });
    controller.init();
  }

  if (root.document.readyState === 'loading') {
    root.document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})(globalThis, function createPopupApi() {
  'use strict';

  const PROFILE_KEYS = [
    'familyName',
    'givenName',
    'familyNameLatin',
    'givenNameLatin',
  ];

  function createPopupController({ document, storageApi, tabsApi, scriptingApi }) {
    const fields = Object.fromEntries(
      PROFILE_KEYS.map((key) => [key, document.getElementById(key)]),
    );
    const status = document.getElementById('status');

    function setStatus(message, kind = 'info') {
      status.textContent = message;
      status.dataset.kind = kind;
    }

    function readForm() {
      return Object.fromEntries(PROFILE_KEYS.map((key) => [key, fields[key].value]));
    }

    function writeForm(profile) {
      for (const key of PROFILE_KEYS) {
        fields[key].value = profile[key] || '';
      }
    }

    async function loadProfile() {
      try {
        return await storageApi.load();
      } catch (_error) {
        setStatus('プロフィールを読み込めませんでした。', 'error');
        return null;
      }
    }

    async function init() {
      const profile = await loadProfile();
      if (!profile) {
        return;
      }

      writeForm(profile);
      setStatus('');
    }

    async function saveProfile() {
      try {
        const profile = await storageApi.save(readForm());
        writeForm(profile);
        setStatus('保存しました。', 'success');
      } catch (_error) {
        setStatus('保存できませんでした。', 'error');
      }
    }

    function showFillResult(result) {
      const { filledCount, failedCount } = result;

      if (filledCount > 0 && failedCount > 0) {
        setStatus(
          `${filledCount}件に入力しました（${failedCount}件は入力できませんでした）。`,
          'warning',
        );
      } else if (filledCount > 0) {
        setStatus(`${filledCount}件の入力欄に入力しました。`, 'success');
      } else if (failedCount > 0) {
        setStatus('対応する入力欄に入力できませんでした。', 'error');
      } else {
        setStatus('対応する入力欄が見つかりませんでした。');
      }
    }

    async function fillCurrentPage() {
      const profile = await loadProfile();
      if (!profile) {
        return;
      }

      if (!PROFILE_KEYS.some((key) => Boolean(profile[key]))) {
        setStatus('先にプロフィールを保存してください。', 'warning');
        return;
      }

      try {
        const tabs = await tabsApi.query({ active: true, currentWindow: true });
        const tabId = tabs && tabs[0] && tabs[0].id;
        if (typeof tabId !== 'number') {
          throw new Error('Active tab unavailable');
        }

        const injectionResults = await scriptingApi.executeScript({
          target: { tabId },
          files: ['autofill.js', 'content.js'],
        });
        const result = injectionResults && injectionResults[0]
          ? injectionResults[0].result
          : null;

        if (
          !result
          || typeof result.filledCount !== 'number'
          || typeof result.failedCount !== 'number'
        ) {
          throw new Error('Injection result unavailable');
        }

        showFillResult(result);
      } catch (_error) {
        setStatus('このページでは入力できません。', 'error');
      }
    }

    return { init, saveProfile, fillCurrentPage };
  }

  return { createPopupController };
});
