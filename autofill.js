(function exposeAutofill(root, factory) {
  const api = factory();

  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.RakurakuAutofill = api;
  }
})(globalThis, function createAutofillApi() {
  'use strict';

  const PROFILE_KEYS = Object.freeze([
    'familyName',
    'givenName',
    'familyNameLatin',
    'givenNameLatin',
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

  const MONTH_PROFILE_KEYS = new Set([
    'enrollmentMonth',
    'graduationMonth',
    'laboratoryStartMonth',
    'laboratoryEndMonth',
  ]);

  function normalizeHint(value) {
    return String(value || '')
      .normalize('NFKC')
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .toLowerCase()
      .replace(/[\s_\-./\\()[\]{}:：・]+/g, ' ')
      .trim();
  }

  function normalizedHints(values) {
    return values.map(normalizeHint).filter(Boolean);
  }

  function metadataHintGroups(metadata) {
    const source = metadata && typeof metadata === 'object' ? metadata : {};
    return {
      fieldSpecific: normalizedHints([
        source.placeholder,
        source.name,
        source.id,
        source.ariaLabel,
        source.role,
      ]),
      directLabels: normalizedHints(Array.isArray(source.labelTexts) ? source.labelTexts : []),
      fieldsets: normalizedHints(Array.isArray(source.fieldsetTexts) ? source.fieldsetTexts : []),
      contexts: normalizedHints(Array.isArray(source.contextTexts) ? source.contextTexts : []),
      autocomplete: normalizedHints([source.autocomplete]),
      options: normalizedHints(Array.isArray(source.optionTexts) ? source.optionTexts : []),
    };
  }

  function isUnrelatedHint(hint, allowAddress = false) {
    const compactHint = hint.replace(/\s/g, '');
    return (
      /会社名|法人名|ユーザー名|ユーザ名/.test(compactHint)
      || /(^| )(email|e mail|mail|company|organization|username|user name)($| )/.test(hint)
      || (!allowAddress && /(^| )address($| )/.test(hint))
    );
  }

  function isPrefectureMatch(match) {
    return match === 'currentPrefecture' || match === 'homePrefecture';
  }

  function createScores() {
    return Object.fromEntries(PROFILE_KEYS.map((key) => [key, 0]));
  }

  function scoreHints(hints) {
    const scores = createScores();
    const score = (key, value = 100) => {
      scores[key] = Math.max(scores[key], value);
    };

    for (const hint of hints) {
      if (/(^| )(英字|ローマ字)( |の)?姓($| )|(^| )姓( |の)?(英字|ローマ字)($| )/.test(hint)) {
        score('familyNameLatin', 300);
      }
      if (/(^| )(英字|ローマ字)( |の)?名($| )|(^| )名( |の)?(英字|ローマ字)($| )/.test(hint)) {
        score('givenNameLatin', 300);
      }
      if (/苗字|名字|(^|の| )姓($| |を|は)/.test(hint)) {
        score('familyName', 200);
      }
      if (/下の名前|(^|の| )名($| |を|は)/.test(hint)) {
        score('givenName', 200);
      }
      if (/(^| )(last ?name|family ?name|surname)($| )/.test(hint)) {
        score('familyNameLatin');
      }
      if (/(^| )(first ?name|given ?name)($| )/.test(hint)) {
        score('givenNameLatin');
      }

      if (/生年月日|誕生日/.test(hint)
        || /(^| )(birthday|birth date|date of birth|dob)($| )/.test(hint)
        || hint === 'bday') {
        score('birthDate');
      }
      if (/性別/.test(hint) || /(^| )(gender|sex)($| )/.test(hint)) {
        score('gender');
      }
      if (/帰省先|実家|出身地/.test(hint)
        || /(^| )(home ?town|home prefecture)($| )/.test(hint)) {
        score('homePrefecture', 300);
      }
      if (/現在の?居住地|居住地|現住所/.test(hint)
        || /(^| )(current prefecture|residence|residential area)($| )/.test(hint)) {
        score('currentPrefecture', 300);
      } else if (/(^| )prefecture($| )/.test(hint)) {
        score('currentPrefecture');
      }

      if (/課程|学位課程/.test(hint)
        || /(^| )(academic course|degree course|degree level|academiccourse|degreecourse|degreelevel)($| )/.test(hint)) {
        score('academicCourse', 200);
      }
      if ((/学年/.test(hint) && !/入学/.test(hint))
        || /(^| )(grade|academic year|year of study|academicyear|yearofstudy)($| )/.test(hint)) {
        score('grade', 200);
      }

      if (/学校名|大学名|大学院名|所属大学|所属学校/.test(hint)
        || /(^| )(university|college|institution)($| )/.test(hint)
        || /(^| )(university name|school name|institution name|college name)($| )/.test(hint)) {
        score('schoolName', 200);
      }
      if (/研究科/.test(hint)
        || /(^| )(graduate school|faculty)($| )/.test(hint)) {
        score('departmentName', 200);
      }
      if (/専攻/.test(hint)
        || /(^| )(major|program|major course)($| )/.test(hint)) {
        score('majorName', 200);
      }

      if (/入学/.test(hint)
        || /(^| )(admission|enrollment) (date|month|year)($| )/.test(hint)
        || /(^| )(admission|enrollment)(date|month|year)($| )/.test(hint)) {
        score('enrollmentMonth', 200);
      }
      if (/卒業予定|修了予定/.test(hint)
        || /(^| )expected graduation($| )/.test(hint)
        || /(^| )(expected graduation|graduation) (date|month|year)($| )/.test(hint)
        || /(^| )(expectedgraduation|graduation)(date|month|year)($| )/.test(hint)) {
        score('graduationMonth', 200);
      }

      if (/研究室/.test(hint) && !/開始|終了|予定|年月/.test(hint)
        || /(^| )(laboratory|lab)( name)?($| )/.test(hint)) {
        score('laboratoryName', 200);
      }
      if (/研究室所属開始|所属開始/.test(hint)
        || /(^| )(laboratory|lab) start( date| month| year)?($| )/.test(hint)) {
        score('laboratoryStartMonth', 250);
      }
      if (/研究室所属終了|所属終了/.test(hint)
        || /(^| )(laboratory|lab) end( date| month| year)?($| )/.test(hint)) {
        score('laboratoryEndMonth', 250);
      }

      if (/研究キーワード/.test(hint)
        || hint === 'キーワード'
        || /(^| )research keywords?($| )/.test(hint)) {
        score('researchKeywords', 200);
      }
      if (/研究概要|研究内容|研究説明/.test(hint)
        || /(^| )research (overview|description|details)($| )/.test(hint)) {
        score('researchOverview', 200);
      }
    }

    return scores;
  }

  function resolveScores(scores) {
    const highest = Math.max(...Object.values(scores));
    if (highest === 0) {
      return { hasEvidence: false, match: null };
    }
    const matches = Object.keys(scores).filter((key) => scores[key] === highest);
    return { hasEvidence: true, match: matches.length === 1 ? matches[0] : null };
  }

  function classificationForHints(hints, metadata) {
    const result = resolveScores(scoreHints(hints));
    if (!result.hasEvidence || !result.match) {
      return result;
    }

    const source = metadata && typeof metadata === 'object' ? metadata : {};
    return { hasEvidence: true, match: result.match, segment: null };
  }

  function dateSegmentFromHints(hints) {
    let year = false;
    let month = false;
    for (const hint of hints) {
      const compact = hint.replace(/\s/g, '');
      year ||= /(^| )year($| )/.test(hint) || (/年$/.test(compact) && !/年月$/.test(compact));
      month ||= /(^| )month($| )/.test(hint) || (/月$/.test(compact) && !/年月$/.test(compact));
    }
    if (year === month) return { segment: null, conflict: year };
    return { segment: year ? 'year' : 'month', conflict: false };
  }

  function classifyControl(metadata) {
    const groups = metadataHintGroups(metadata);
    const primaryHints = [...groups.fieldSpecific, ...groups.directLabels];
    const primary = classificationForHints(primaryHints, metadata);
    const allowsAddress = primary.hasEvidence && isPrefectureMatch(primary.match);
    if (primaryHints.some((hint) => isUnrelatedHint(hint, allowsAddress))) {
      return null;
    }
    const componentHints = [...groups.fieldSpecific, ...groups.directLabels];
    const component = dateSegmentFromHints(componentHints);
    const isSelect = String(metadata && metadata.tagName || '').toLowerCase() === 'select';
    if (primary.hasEvidence) {
      if (!primary.match) return null;
      if (MONTH_PROFILE_KEYS.has(primary.match) && component.conflict) return null;
      if (MONTH_PROFILE_KEYS.has(primary.match)
        && component.segment === 'year'
        && !isSelect) return null;
      return {
        profileKey: primary.match,
        segment: isSelect && MONTH_PROFILE_KEYS.has(primary.match)
          ? component.segment
          : primary.segment,
      };
    }

    if (groups.options.includes('男性') && groups.options.includes('女性')) {
      return { profileKey: 'gender', segment: null };
    }

    for (const tier of [groups.fieldsets, groups.contexts, groups.autocomplete]) {
      const contextual = classificationForHints(tier, metadata);
      const contextAllowsAddress = contextual.hasEvidence
        && isPrefectureMatch(contextual.match);
      if (tier.some((hint) => isUnrelatedHint(hint, contextAllowsAddress))) {
        continue;
      }
      if (contextual.hasEvidence) {
        if (!contextual.match) return null;
        if (MONTH_PROFILE_KEYS.has(contextual.match) && component.conflict) return null;
        if (MONTH_PROFILE_KEYS.has(contextual.match)
          && component.segment === 'year'
          && !isSelect) return null;
        return {
          profileKey: contextual.match,
          segment: isSelect && MONTH_PROFILE_KEYS.has(contextual.match)
            ? component.segment
            : contextual.segment,
        };
      }
    }

    return null;
  }

  function classifyField(metadata) {
    const classification = classifyControl(metadata);
    return classification ? classification.profileKey : null;
  }

  function collectFieldMetadata(control, document) {
    const labelTexts = [];
    const contextTexts = [];
    const fieldsetTexts = [];
    const controlId = control.id || '';

    if (controlId) {
      for (const label of document.querySelectorAll('label[for]')) {
        if (label.getAttribute('for') === controlId && label.textContent) {
          labelTexts.push(label.textContent.trim());
        }
      }
    }

    const parentLabel = control.closest('label');
    if (parentLabel && parentLabel.textContent) {
      const text = parentLabel.textContent.trim();
      const nestedControls = typeof parentLabel.querySelectorAll === 'function'
        ? parentLabel.querySelectorAll('input, select, textarea')
        : [];
      const target = nestedControls.length > 1 ? contextTexts : labelTexts;
      if (text && !labelTexts.includes(text) && !contextTexts.includes(text)) {
        target.push(text);
      }
    }

    const fieldset = control.closest('fieldset');
    if (fieldset) {
      const legend = typeof fieldset.querySelector === 'function'
        ? fieldset.querySelector('legend')
        : null;
      if (legend && legend.textContent) {
        fieldsetTexts.push(legend.textContent.trim());
      }
    }

    const tagName = String(control.tagName || '').toLowerCase();
    const inputType = tagName === 'input'
      ? String(control.getAttribute('type') || control.type || 'text').toLowerCase()
      : '';
    const optionTexts = Array.from(control.options || [], (option) => (
      String(option.label || option.textContent || '').trim()
    )).filter(Boolean);

    return {
      labelTexts,
      fieldsetTexts,
      contextTexts,
      placeholder: control.getAttribute('placeholder') || '',
      name: control.getAttribute('name') || '',
      id: controlId,
      ariaLabel: control.getAttribute('aria-label') || '',
      autocomplete: control.getAttribute('autocomplete') || '',
      role: control.getAttribute('role') || '',
      tagName,
      inputType,
      optionTexts,
    };
  }

  function setNativeProperty(control, property, value, document) {
    const view = document.defaultView;
    const tagName = String(control.tagName || '').toLowerCase();
    const constructor = tagName === 'select'
      ? view.HTMLSelectElement
      : tagName === 'textarea'
        ? view.HTMLTextAreaElement
        : view.HTMLInputElement;
    const prototype = constructor && constructor.prototype;
    const descriptor = prototype
      ? Object.getOwnPropertyDescriptor(prototype, property)
      : null;

    if (descriptor && typeof descriptor.set === 'function') {
      descriptor.set.call(control, value);
    } else {
      control[property] = value;
    }
  }

  function dispatchValueEvents(control, document) {
    const EventConstructor = document.defaultView.Event;
    control.dispatchEvent(new EventConstructor('input', { bubbles: true }));
    control.dispatchEvent(new EventConstructor('change', { bubbles: true }));
  }

  function isValidIsoDate(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) return false;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    const days = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    return year > 0 && month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1];
  }

  function isValidIsoMonth(value) {
    return /^\d{4}-(0[1-9]|1[0-2])$/.test(value) && Number(value.slice(0, 4)) > 0;
  }

  function fitsRange(control, value, type) {
    const minimum = control.getAttribute('min') || '';
    const maximum = control.getAttribute('max') || '';
    const valid = type === 'date' ? isValidIsoDate : isValidIsoMonth;
    if (!valid(value)) return false;
    if (valid(minimum) && value < minimum) return false;
    if (valid(maximum) && value > maximum) return false;
    return true;
  }

  function normalizeOptionText(value) {
    return String(value || '').normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
  }

  function optionMatchesSegment(optionText, expected, segment) {
    const normalizedOption = normalizeOptionText(optionText);
    if (!segment) return normalizedOption === normalizeOptionText(expected);

    const numberMatch = /(\d{1,4})/.exec(normalizedOption);
    if (!numberMatch) return false;
    const optionNumber = Number(numberMatch[1]);
    const expectedNumber = Number(expected);
    return Number.isFinite(optionNumber) && optionNumber === expectedNumber;
  }

  function findMatchingOption(select, value, segment) {
    const matches = Array.from(select.options || []).filter((option) => {
      const effectivelyDisabled = typeof option.matches === 'function'
        && option.matches(':disabled');
      const text = option.label || option.textContent || '';
      return !option.disabled
        && !effectivelyDisabled
        && optionMatchesSegment(text, value, segment);
    });
    return matches.length === 1 ? matches[0] : null;
  }

  function getMonthComponents(value) {
    if (!isValidIsoMonth(value)) return null;
    return { year: value.slice(0, 4), month: String(Number(value.slice(5, 7))) };
  }

  function valueForControl(profileKey, profileValue, segment, control) {
    if (!segment) {
      if (profileKey === 'researchKeywords' && Array.isArray(profileValue)) {
        const tagName = String(control.tagName || '').toLowerCase();
        return profileValue.map((value) => String(value).trim()).filter(Boolean)
          .join(tagName === 'textarea' ? '\n' : ', ');
      }
      return typeof profileValue === 'string' ? profileValue.trim() : '';
    }

    const components = getMonthComponents(profileValue);
    return components ? components[segment] : '';
  }

  function setFormControlValue(control, classification, value, document) {
    const tagName = String(control.tagName || '').toLowerCase();
    if (tagName === 'select') {
      const option = findMatchingOption(control, value, classification.segment);
      if (!option) return false;
      const index = Array.prototype.indexOf.call(control.options, option);
      if (index < 0) return false;
      setNativeProperty(control, 'selectedIndex', index, document);
    } else {
      const type = tagName === 'textarea'
        ? 'textarea'
        : String(control.getAttribute('type') || control.type || 'text').toLowerCase();
      if (type === 'date') {
        if (classification.profileKey !== 'birthDate' || !fitsRange(control, value, 'date')) {
          return false;
        }
      } else if (type === 'month') {
        if (!MONTH_PROFILE_KEYS.has(classification.profileKey)
          || classification.segment
          || !fitsRange(control, value, 'month')) {
          return false;
        }
      } else if (type !== 'text' && type !== 'textarea') {
        return false;
      }
      setNativeProperty(control, 'value', value, document);
    }

    dispatchValueEvents(control, document);
    return true;
  }

  function readSpinbuttonValue(control) {
    const ariaValue = control.getAttribute('aria-valuenow');
    const text = ariaValue || control.textContent || '';
    const match = /-?\d+/.exec(String(text));
    return match ? Number(match[0]) : null;
  }

  function setSpinbuttonValue(control, value, document) {
    if (!control || control.getAttribute('role') !== 'spinbutton'
      || control.getAttribute('aria-disabled') === 'true'
      || control.getAttribute('aria-readonly') === 'true'
      || control.disabled
      || control.readOnly
      || typeof control.focus !== 'function') return false;
    const target = Number(value);
    let current = readSpinbuttonValue(control);
    if (!Number.isInteger(target)) return false;
    const KeyboardEventConstructor = document.defaultView.KeyboardEvent;
    if (!KeyboardEventConstructor) return false;
    const minimumAttribute = control.getAttribute('aria-valuemin');
    const maximumAttribute = control.getAttribute('aria-valuemax');
    const minimum = minimumAttribute === null ? Number.NaN : Number(minimumAttribute);
    const maximum = maximumAttribute === null ? Number.NaN : Number(maximumAttribute);
    if ((Number.isFinite(minimum) && target < minimum)
      || (Number.isFinite(maximum) && target > maximum)) return false;
    if (current === target) return true;
    control.focus();
    if (current === null) {
      for (const digit of String(target)) {
        control.dispatchEvent(new KeyboardEventConstructor('keydown', {
          key: digit, code: `Digit${digit}`, bubbles: true, cancelable: true,
        }));
        control.dispatchEvent(new KeyboardEventConstructor('keyup', {
          key: digit, code: `Digit${digit}`, bubbles: true, cancelable: true,
        }));
      }
      if (typeof control.blur === 'function') control.blur();
      return readSpinbuttonValue(control) === target;
    }
    const distance = Math.abs(target - current);
    if (distance > 500) return false;

    for (let attempt = 0; current !== target && attempt < distance; attempt += 1) {
      const key = target > current ? 'ArrowUp' : 'ArrowDown';
      control.dispatchEvent(new KeyboardEventConstructor('keydown', {
        key, bubbles: true, cancelable: true,
      }));
      control.dispatchEvent(new KeyboardEventConstructor('keyup', {
        key, bubbles: true, cancelable: true,
      }));
      const next = readSpinbuttonValue(control);
      if (next === null || next === current || Math.abs(next - current) !== 1
        || Math.abs(target - next) >= Math.abs(target - current)) return false;
      current = next;
    }
    if (typeof control.blur === 'function') control.blur();
    return readSpinbuttonValue(control) === target;
  }

  function fillCustomMonthGroups(document, profile, options = {}) {
    let filledCount = 0;
    let failedCount = 0;
    const onlyProfileKeys = options.onlyProfileKeys
      ? new Set(options.onlyProfileKeys)
      : null;
    const skipProfileKeys = new Set(options.skipProfileKeys || []);
    const onlyControls = options.onlyControls ? new Set(options.onlyControls) : null;

    for (const group of document.querySelectorAll('div[role="group"][data-date-field-input]')) {
      const fieldset = group.closest && group.closest('fieldset');
      if (group.getAttribute('aria-disabled') === 'true'
        || group.getAttribute('aria-readonly') === 'true'
        || group.disabled
        || group.readOnly
        || (fieldset && fieldset.disabled)
        || (onlyControls && !onlyControls.has(group))) continue;
      const classification = classifyControl(collectFieldMetadata(group, document));
      if (!classification || !MONTH_PROFILE_KEYS.has(classification.profileKey)) continue;
      if (skipProfileKeys.has(classification.profileKey)
        || (onlyProfileKeys && !onlyProfileKeys.has(classification.profileKey))) continue;
      const components = getMonthComponents(profile && profile[classification.profileKey]);
      if (!components) continue;

      try {
        const year = group.querySelector('[data-segment="year"]');
        const month = group.querySelector('[data-segment="month"]');
        if (!year || !month) {
          failedCount += 1;
          continue;
        }
        if (year.getAttribute('aria-disabled') === 'true'
          || month.getAttribute('aria-disabled') === 'true'
          || year.getAttribute('aria-readonly') === 'true'
          || month.getAttribute('aria-readonly') === 'true'
          || year.disabled || month.disabled || year.readOnly || month.readOnly) continue;
        const yearValue = readSpinbuttonValue(year);
        const monthValue = readSpinbuttonValue(month);
        const inRange = (control, target) => {
          const min = Number(control.getAttribute('aria-valuemin'));
          const max = Number(control.getAttribute('aria-valuemax'));
          return !(control.getAttribute('aria-valuemin') !== null && Number.isFinite(min) && target < min)
            && !(control.getAttribute('aria-valuemax') !== null && Number.isFinite(max) && target > max);
        };
        if (!inRange(year, components.year) || !inRange(month, components.month)) {
          failedCount += 1;
          continue;
        }
        const yearSet = setSpinbuttonValue(year, components.year, document);
        const monthSet = yearSet && setSpinbuttonValue(month, components.month, document);
        if (monthSet) filledCount += 1;
        else failedCount += 1;
      } catch (_error) {
        failedCount += 1;
      }
    }
    return { filledCount, failedCount };
  }

  function fillDocument(document, profile, options = {}) {
    let filledCount = 0;
    let failedCount = 0;
    const onlyProfileKeys = options.onlyProfileKeys
      ? new Set(options.onlyProfileKeys)
      : null;
    const skipProfileKeys = new Set(options.skipProfileKeys || []);
    const onlyControls = options.onlyControls ? new Set(options.onlyControls) : null;
    const skipControls = options.skipControls ? new Set(options.skipControls) : null;

    for (const control of document.querySelectorAll('input, select, textarea')) {
      if (onlyControls && !onlyControls.has(control)) continue;
      if (skipControls && skipControls.has(control)) continue;
      const tagName = String(control.tagName || '').toLowerCase();
      const type = tagName === 'input'
        ? String(control.getAttribute('type') || control.type || 'text').toLowerCase()
        : tagName;
      const supported = tagName === 'select'
        || tagName === 'textarea'
        || (tagName === 'input' && ['text', 'date', 'month'].includes(type));
      const effectivelyDisabled = typeof control.matches === 'function'
        && control.matches(':disabled');
      if (!supported || control.disabled || effectivelyDisabled || control.readOnly) continue;

      try {
        const metadata = collectFieldMetadata(control, document);
        if (metadata.role === 'combobox' || metadata.role === 'spinbutton') continue;
        const classification = classifyControl(metadata);
        if (!classification) continue;
        if (skipProfileKeys.has(classification.profileKey)
          || (onlyProfileKeys && !onlyProfileKeys.has(classification.profileKey))) continue;
        const storedValue = profile && profile[classification.profileKey];
        const value = valueForControl(
          classification.profileKey,
          storedValue,
          classification.segment,
          control,
        );
        if (!value) continue;
        if (setFormControlValue(control, classification, value, document)) filledCount += 1;
      } catch (_error) {
        failedCount += 1;
      }
    }

    const customMonths = fillCustomMonthGroups(document, profile, options);
    filledCount += customMonths.filledCount;
    failedCount += customMonths.failedCount;
    return { filledCount, failedCount };
  }

  function getAriaListboxes(control, document) {
    const controlledIds = String(control.getAttribute('aria-controls') || '')
      .split(/\s+/).filter(Boolean);
    const listboxes = controlledIds
      .map((id) => document.getElementById && document.getElementById(id))
      .filter((element) => element && element.getAttribute('role') === 'listbox');
    if (listboxes.length) return listboxes;

    const activeId = control.getAttribute('aria-activedescendant');
    const active = activeId && document.getElementById
      ? document.getElementById(activeId)
      : null;
    const activeListbox = active && active.closest
      ? active.closest('[role="listbox"]')
      : null;
    return activeListbox ? [activeListbox] : [];
  }

  function visibleListbox(listbox, document) {
    if (listbox.hidden || listbox.getAttribute('aria-hidden') === 'true') return false;
    const getComputedStyle = document && document.defaultView
      && document.defaultView.getComputedStyle;
    if (typeof getComputedStyle === 'function') {
      const style = getComputedStyle.call(document.defaultView, listbox);
      if (style && (style.display === 'none' || style.visibility === 'hidden')) return false;
    }
    return true;
  }

  function exactAriaOptions(control, document, expectedText) {
    const expected = normalizeOptionText(expectedText);
    return getAriaListboxes(control, document)
      .filter((listbox) => visibleListbox(listbox, document))
      .flatMap((listbox) => Array.from(listbox.querySelectorAll('[role="option"]') || []))
      .filter((option) => option.getAttribute('aria-disabled') !== 'true'
        && normalizeOptionText(option.textContent) === expected);
  }

  async function waitForCondition(condition, options) {
    const timeoutMs = Number.isFinite(options.waitTimeoutMs) ? options.waitTimeoutMs : 3500;
    const pollIntervalMs = Number.isFinite(options.pollIntervalMs) ? options.pollIntervalMs : 25;
    const deadline = Date.now() + timeoutMs;
    while (true) {
      const value = condition();
      if (value) return value;
      if (Date.now() >= deadline) return null;
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }
  }

  function relatedHiddenInputs(control) {
    const group = control.closest && control.closest('[role="group"], fieldset');
    if (group && group.querySelectorAll) {
      return Array.from(group.querySelectorAll('input[type="hidden"]'));
    }
    const parent = control.parentElement;
    if (parent && parent.querySelectorAll) {
      const nearby = Array.from(parent.querySelectorAll('input[type="hidden"]'));
      if (nearby.length) return nearby;
    }
    const formHidden = control.form && control.form.querySelectorAll
      ? Array.from(control.form.querySelectorAll('input[type="hidden"]'))
      : [];
    return formHidden.length === 1 ? formHidden : [];
  }

  async function selectAriaComboboxOption(control, value, document, options) {
    const originalValue = control.value;
    if (typeof control.focus === 'function') control.focus();
    setNativeProperty(control, 'value', value, document);
    control.dispatchEvent(new document.defaultView.Event('input', { bubbles: true }));

    const match = await waitForCondition(() => {
      const candidates = exactAriaOptions(control, document, value);
      if (candidates.length > 1) return { ambiguous: true };
      return candidates.length === 1 ? { option: candidates[0] } : null;
    }, options);
    if (!match || match.ambiguous) {
      setNativeProperty(control, 'value', originalValue, document);
      control.dispatchEvent(new document.defaultView.Event('input', { bubbles: true }));
      return false;
    }

    const tagName = String(match.option.tagName || '').toLowerCase();
    const unsafeElement = ['button', 'a', 'input', 'select', 'textarea'].includes(tagName)
      || (typeof match.option.closest === 'function'
        && match.option.closest('button, a, input[type="submit"], input[type="button"]'));
    if (unsafeElement) {
      setNativeProperty(control, 'value', originalValue, document);
      control.dispatchEvent(new document.defaultView.Event('input', { bubbles: true }));
      return false;
    }

    const wasSelected = match.option.getAttribute('aria-selected') === 'true';
    const listboxesBeforeClick = getAriaListboxes(control, document);
    const listboxWasVisibleBeforeClick = listboxesBeforeClick.some((listbox) => visibleListbox(listbox, document));
    const expandedBeforeClick = control.getAttribute('aria-expanded');
    const popupWasOpen = control.getAttribute('aria-expanded') === 'true'
      || listboxesBeforeClick.some((listbox) => visibleListbox(listbox, document));
    const hiddenInputs = relatedHiddenInputs(control);
    const previousHiddenValues = hiddenInputs.map((input) => input.value);
    match.option.click();
    const confirmed = await waitForCondition(() => {
      const hiddenUpdated = hiddenInputs.some((input, index) => (
        input.value && input.value !== previousHiddenValues[index]
      ));
      const selected = !wasSelected && match.option.getAttribute('aria-selected') === 'true';
      const listboxes = getAriaListboxes(control, document);
      const expandedTransitionedClosed = expandedBeforeClick === 'true'
        && control.getAttribute('aria-expanded') === 'false';
      const listboxTransitionedClosed = listboxWasVisibleBeforeClick
        && (listboxes.length === 0
          || listboxes.every((listbox) => !visibleListbox(listbox, document)));
      const popupClosed = popupWasOpen && (expandedTransitionedClosed || listboxTransitionedClosed);
      const exactComboboxValue = normalizeOptionText(control.value) === normalizeOptionText(value);
      return selected || (exactComboboxValue && (hiddenUpdated || popupClosed));
    }, options);

    if (!confirmed) {
      setNativeProperty(control, 'value', originalValue, document);
      control.dispatchEvent(new document.defaultView.Event('input', { bubbles: true }));
      return false;
    }
    return true;
  }

  function controlsForProfileKey(document, profileKey) {
    return Array.from(document.querySelectorAll('input, select, textarea'))
      .filter((control) => classifyControl(collectFieldMetadata(control, document))?.profileKey === profileKey);
  }

  function relatedToSchoolControl(control, schoolControls) {
    const scopeFor = (element) => element.form
      || (element.closest && element.closest('fieldset, [role="group"]'));
    const scope = scopeFor(control);
    return Boolean(scope && schoolControls.some((school) => scopeFor(school) === scope));
  }

  async function fillDependentProfileKey(document, profile, profileKey, options, schoolControl) {
    const value = profile && profile[profileKey];
    if (typeof value !== 'string' || !value.trim()) return { filledCount: 0, failedCount: 0 };
    const initialControls = controlsForProfileKey(document, profileKey)
      .filter((control) => relatedToSchoolControl(control, [schoolControl]));
    if (initialControls.length && initialControls.every((control) => (
      control.readOnly || control.getAttribute('aria-readonly') === 'true'
    ))) return { filledCount: 0, failedCount: 0 };

    const readyControl = await waitForCondition(() => {
      for (const control of controlsForProfileKey(document, profileKey)
        .filter((item) => relatedToSchoolControl(item, [schoolControl]))) {
        const metadata = collectFieldMetadata(control, document);
        if (metadata.role === 'combobox' || metadata.role === 'spinbutton'
          || control.readOnly || control.getAttribute('aria-readonly') === 'true'
          || control.isConnected === false) continue;
        if (String(control.tagName).toLowerCase() === 'select') {
          if (control.disabled || control.getAttribute('aria-disabled') === 'true'
            || (control.matches && control.matches(':disabled'))) continue;
          const matches = Array.from(control.options || []).filter((item) => (
            !item.disabled && normalizeOptionText(item.label || item.textContent) === normalizeOptionText(value)
          ));
          if (matches.length === 1) return control;
        } else if (!control.disabled && control.getAttribute('aria-disabled') !== 'true'
          && !(control.matches && control.matches(':disabled'))) {
          return control;
        }
      }
      return null;
    }, options);
    if (!readyControl) return { filledCount: 0, failedCount: 1 };

    const result = fillDocument(document, profile, {
      onlyProfileKeys: [profileKey],
      onlyControls: [readyControl],
    });
    return result.filledCount > 0
      ? result
      : { filledCount: 0, failedCount: result.failedCount + 1 };
  }

  async function fillDocumentAsync(document, profile, options = {}) {
    const schoolComboboxes = controlsForProfileKey(document, 'schoolName')
      .filter((control) => control.getAttribute('role') === 'combobox'
        && /^(list|both)$/.test(control.getAttribute('aria-autocomplete') || ''));
    if (!schoolComboboxes.length || !profile || !profile.schoolName) {
      return fillDocument(document, profile);
    }
    const usableSchoolComboboxes = schoolComboboxes.filter((control) => !control.disabled
      && !control.readOnly && control.getAttribute('aria-disabled') !== 'true'
      && control.getAttribute('aria-readonly') !== 'true'
      && !(control.matches && control.matches(':disabled')));
    const dependentControls = ['departmentName', 'majorName']
      .flatMap((key) => controlsForProfileKey(document, key))
      .filter((control) => relatedToSchoolControl(control, usableSchoolComboboxes));
    const result = fillDocument(document, profile, { skipControls: dependentControls });
    if (!usableSchoolComboboxes.length) {
      result.failedCount += 1;
      return result;
    }
    let schoolSelected = false;
    let selectedSchoolControl = null;
    for (const control of usableSchoolComboboxes) {
      if (await selectAriaComboboxOption(control, profile.schoolName, document, options)) {
        result.filledCount += 1;
        schoolSelected = true;
        selectedSchoolControl = control;
        break;
      }
      result.failedCount += 1;
    }
    if (!schoolSelected) return result;

    for (const profileKey of ['departmentName', 'majorName']) {
      const dependent = await fillDependentProfileKey(document, profile, profileKey, options, selectedSchoolControl);
      result.filledCount += dependent.filledCount;
      result.failedCount += dependent.failedCount;
      if (profileKey === 'departmentName'
        && (!profile.departmentName
          || (profile.majorName && (dependent.failedCount > 0 || dependent.filledCount === 0)))) break;
    }
    return result;
  }

  return {
    PROFILE_KEYS,
    normalizeHint,
    collectFieldMetadata,
    classifyControl,
    classifyField,
    setFormControlValue,
    fillDocument,
    fillDocumentAsync,
  };
});
