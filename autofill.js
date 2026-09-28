(function exposeAutofill(root, factory) {
  const api = factory();

  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.RakurakuAutofill = api;
  }
})(globalThis, function createAutofillApi() {
  'use strict';

  const PROFILE_KEYS = [
    'familyName',
    'givenName',
    'familyNameLatin',
    'givenNameLatin',
  ];

  function normalizeHint(value) {
    return String(value || '')
      .normalize('NFKC')
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .toLowerCase()
      .replace(/[\s_\-./\\()[\]{}:：・]+/g, ' ')
      .trim();
  }

  function metadataHints(metadata) {
    const source = metadata && typeof metadata === 'object' ? metadata : {};
    const labels = Array.isArray(source.labelTexts) ? source.labelTexts : [];

    return [
      ...labels,
      source.placeholder,
      source.name,
      source.id,
      source.ariaLabel,
      source.autocomplete,
    ].map(normalizeHint).filter(Boolean);
  }

  function classifyField(metadata) {
    const hints = metadataHints(metadata);
    const blocked = hints.some((hint) => {
      const compactHint = hint.replace(/\s/g, '');
      return (
        /氏名|お名前|会社名|法人名|ユーザー名|ユーザ名/.test(compactHint)
        || /(^| )(email|e mail|mail|address|company|organization|username|user name|full name)($| )/.test(hint)
      );
    });

    if (blocked) {
      return null;
    }

    const scores = Object.fromEntries(PROFILE_KEYS.map((key) => [key, 0]));
    const score = (key, value) => {
      scores[key] = Math.max(scores[key], value);
    };

    for (const hint of hints) {
      if (/英字.*姓|姓.*英字|ローマ字.*姓|姓.*ローマ字/.test(hint)) {
        score('familyNameLatin', 300);
      }
      if (/英字.*名|名.*英字|ローマ字.*名|名.*ローマ字/.test(hint)) {
        score('givenNameLatin', 300);
      }

      if (/苗字|名字|(^|の| )姓($| |を|は)/.test(hint)) {
        score('familyName', 200);
      }
      if (/下の名前|(^|の| )名($| |を|は)/.test(hint)) {
        score('givenName', 200);
      }

      if (/(^| )(last name|family name|surname)($| )/.test(hint)) {
        score('familyNameLatin', 100);
      }
      if (/(^| )(first name|given name)($| )/.test(hint)) {
        score('givenNameLatin', 100);
      }
    }

    const highest = Math.max(...Object.values(scores));
    if (highest === 0) {
      return null;
    }

    const matches = PROFILE_KEYS.filter((key) => scores[key] === highest);
    return matches.length === 1 ? matches[0] : null;
  }

  function collectFieldMetadata(input, document) {
    const labelTexts = [];
    const inputId = input.id || '';

    if (inputId) {
      for (const label of document.querySelectorAll('label[for]')) {
        if (label.getAttribute('for') === inputId && label.textContent) {
          labelTexts.push(label.textContent.trim());
        }
      }
    }

    const parentLabel = input.closest('label');
    if (parentLabel && parentLabel.textContent) {
      const text = parentLabel.textContent.trim();
      if (text && !labelTexts.includes(text)) {
        labelTexts.push(text);
      }
    }

    return {
      labelTexts,
      placeholder: input.getAttribute('placeholder') || '',
      name: input.getAttribute('name') || '',
      id: inputId,
      ariaLabel: input.getAttribute('aria-label') || '',
      autocomplete: input.getAttribute('autocomplete') || '',
    };
  }

  function setInputValue(input, value, document) {
    const view = document.defaultView;
    const inputPrototype = view.HTMLInputElement.prototype;
    const valueDescriptor = Object.getOwnPropertyDescriptor(inputPrototype, 'value');

    if (valueDescriptor && typeof valueDescriptor.set === 'function') {
      valueDescriptor.set.call(input, value);
    } else {
      input.value = value;
    }

    input.dispatchEvent(new view.Event('input', { bubbles: true }));
    input.dispatchEvent(new view.Event('change', { bubbles: true }));
  }

  function fillDocument(document, profile) {
    let filledCount = 0;
    let failedCount = 0;

    for (const input of document.querySelectorAll('input')) {
      const declaredType = input.getAttribute('type');
      const isTextInput = declaredType === null || declaredType.toLowerCase() === 'text';
      const isEffectivelyDisabled = typeof input.matches === 'function'
        && input.matches(':disabled');
      if (!isTextInput || input.disabled || isEffectivelyDisabled || input.readOnly) {
        continue;
      }

      try {
        const profileKey = classifyField(collectFieldMetadata(input, document));
        const storedValue = profileKey && profile && profile[profileKey];
        const value = typeof storedValue === 'string' ? storedValue.trim() : '';

        if (!value) {
          continue;
        }

        setInputValue(input, value, document);
        filledCount += 1;
      } catch (_error) {
        failedCount += 1;
      }
    }

    return { filledCount, failedCount };
  }

  return {
    normalizeHint,
    collectFieldMetadata,
    classifyField,
    fillDocument,
  };
});
