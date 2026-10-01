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
    'familyNameKana',
    'givenNameKana',
    'phoneNumber',
    'mobilePhone',
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

  const MONTH_PROFILE_KEYS = new Set([
    'enrollmentMonth',
    'graduationMonth',
    'laboratoryStartMonth',
    'laboratoryEndMonth',
  ]);
  const DATE_PROFILE_KEYS = new Set(['birthDate', ...MONTH_PROFILE_KEYS]);

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
      nearLabels: normalizedHints(Array.isArray(source.nearLabelTexts) ? source.nearLabelTexts : []),
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
      || /携帯アドレス|携帯メール|mobile email|mobile mail/.test(hint)
      || /(^| )(company|organization|username|user name)($| )/.test(hint)
      || (!allowAddress && /(^| )address($| )/.test(hint))
    );
  }

  function isPrefectureMatch(match) {
    return match === 'currentPrefecture' || match === 'homePrefecture';
  }

  function allowsAddressHint(match) {
    return isPrefectureMatch(match) || match === 'email';
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
      if (/携帯アドレス|携帯メール|mobile email|mobile mail/.test(hint)) {
        continue;
      }
      if (/^(セイ|姓カナ|姓 カナ)$|フリガナ 姓|ふりがな 姓|(^| )(family name kana|surname kana)($| )/.test(hint)) {
        score('familyNameKana', 350);
      }
      if (/^(メイ|名カナ|名 カナ)$|フリガナ 名|ふりがな 名|(^| )(given name kana|first name kana)($| )/.test(hint)) {
        score('givenNameKana', 350);
      }
      if (/携帯電話|携帯番号|携帯/.test(hint)
        || /(^| )(mobile|cell) (phone|telephone|number)($| )/.test(hint)) {
        score('mobilePhone', 350);
      } else if (/固定電話|電話番号|電話/.test(hint)
        || /(^| )(phone number|telephone|phone)($| )/.test(hint)
        || hint === 'tel') {
        score('phoneNumber', 250);
      }
      if (/メールアドレス|e mailアドレス|(^| )(e mail|email|mail)( |$)/.test(hint)) {
        score('email', 250);
      }

      if (/(^| )(英字|ローマ字)( |の)?姓($| )|(^| )姓( |の)?(英字|ローマ字)($| )/.test(hint)) {
        score('familyNameLatin', 300);
      }
      if (/(^| )(英字|ローマ字)( |の)?名($| )|(^| )名( |の)?(英字|ローマ字)($| )/.test(hint)) {
        score('givenNameLatin', 300);
      }
      if (/苗字|名字/.test(hint)) {
        score('familyName', 200);
      }
      if (/下の名前/.test(hint)) {
        score('givenName', 200);
      }
      if (/(^| )(family name|surname|last name) (ja|japanese)($| )/.test(hint)) {
        score('familyName', 250);
      }
      if (/(^| )(given name|first name) (ja|japanese)($| )/.test(hint)) {
        score('givenName', 250);
      }
      if (/(^| )(last ?name|family ?name|surname)($| )/.test(hint)) {
        score('familyNameLatin');
      }
      if (/(^| )(first ?name|given ?name)($| )/.test(hint)) {
        score('givenNameLatin');
      }

      if (/生年月日|誕生日/.test(hint)
        || /(^| )(birthday|birth date|date of birth|dob)($| )/.test(hint)
        || /(^| )(birth|birthday) (year|month|day)($| )/.test(hint)
        || /(^| )(year|month|day) of birth($| )/.test(hint)
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
      if (/卒業予定|修了予定|卒業(年月|年|月|見込み)|修了(年月|年|月|見込み)/.test(hint)
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
    let day = false;
    for (const hint of hints) {
      const compact = hint.replace(/\s/g, '');
      year ||= /(^| )year($| )/.test(hint) || (/年$/.test(compact) && !/年月$/.test(compact));
      month ||= /(^| )month($| )/.test(hint) || (/月$/.test(compact) && !/年月$/.test(compact));
      day ||= /(^| )day($| )/.test(hint) || /日$/.test(compact);
    }
    const matched = [year, month, day].filter(Boolean).length;
    if (matched !== 1) return { segment: null, conflict: matched > 1 };
    return { segment: year ? 'year' : month ? 'month' : 'day', conflict: false };
  }

  function classifyControl(metadata) {
    const groups = metadataHintGroups(metadata);
    const primaryHints = [...groups.fieldSpecific, ...groups.directLabels, ...groups.nearLabels];
    const groupHints = [...groups.fieldsets, ...groups.contexts];
    const kanaContext = groupHints.some((hint) => /カナ|ふりがな|フリガナ|kana/.test(hint));
    const kanjiContext = groupHints.some((hint) => /漢字|kanji/.test(hint));
    const localNameHints = [...groups.directLabels, ...groups.nearLabels];
    const hasFamilyLabel = localNameHints.some((hint) => /^(姓|せい|セイ)$/.test(hint));
    const hasGivenLabel = localNameHints.some((hint) => /^(名|めい|メイ)$/.test(hint));
    const autocompleteNameKey = !kanaContext && !kanjiContext
      ? (hasFamilyLabel && groups.autocomplete.includes('family name'))
        ? 'familyName'
        : (hasGivenLabel && groups.autocomplete.includes('given name'))
          ? 'givenName'
          : null
      : null;
    const contextualNameKey = kanaContext === kanjiContext
      ? autocompleteNameKey
      : kanaContext
        ? kanaNameKeyForLocalHints(localNameHints)
        : kanjiNameKeyForLocalHints(localNameHints);
    const hasUnqualifiedFamilyOrGivenLabel = localNameHints.some((hint) => /^(姓|名)$/.test(hint));
    const hasJapaneseNameFieldHint = groups.fieldSpecific.some((hint) => (
      /(^| )(family name|surname|last name|given name|first name) (ja|japanese)($| )/.test(hint)
    ));
    if (hasUnqualifiedFamilyOrGivenLabel && !kanaContext && !kanjiContext
      && !hasJapaneseNameFieldHint && !autocompleteNameKey) {
      return null;
    }
    const primary = contextualNameKey
      ? { hasEvidence: true, match: contextualNameKey }
      : classificationForHints(primaryHints, metadata);
    const allowsAddress = primary.hasEvidence && allowsAddressHint(primary.match);
    if (primaryHints.some((hint) => isUnrelatedHint(hint, allowsAddress))) {
      return null;
    }
    const componentHints = [...groups.fieldSpecific, ...groups.directLabels, ...groups.nearLabels];
    const hintedComponent = dateSegmentFromHints(componentHints);
    const isSelect = String(metadata && metadata.tagName || '').toLowerCase() === 'select';
    const definitionContextIsBirthDate = scoreHints(
      normalizedHints([metadata.definitionHeading || '']),
    ).birthDate > 0;
    const orderedBirthComponent = isSelect
      && metadata.definitionSelectCount === 3
      && Number.isInteger(metadata.definitionSelectIndex)
      && definitionContextIsBirthDate
      && Array.isArray(metadata.definitionSelectSegments)
      && metadata.definitionSelectSegments.join(',') === 'year,month,day'
      ? ['year', 'month', 'day'][metadata.definitionSelectIndex] || null
      : null;
    const component = orderedBirthComponent
      ? { segment: orderedBirthComponent, conflict: false }
      : hintedComponent;
    if (primary.hasEvidence) {
      if (!primary.match) return null;
      if (DATE_PROFILE_KEYS.has(primary.match) && component.conflict) return null;
      if (MONTH_PROFILE_KEYS.has(primary.match)
        && component.segment === 'year'
        && !isSelect) return null;
      return {
        profileKey: primary.match,
        segment: isSelect && DATE_PROFILE_KEYS.has(primary.match)
          ? component.segment
          : primary.segment || null,
      };
    }

    if (groups.options.includes('男性') && groups.options.includes('女性')) {
      return { profileKey: 'gender', segment: null };
    }

    for (const tier of [groups.fieldsets, groups.contexts, groups.autocomplete]) {
      const contextual = classificationForHints(tier, metadata);
      const contextAllowsAddress = contextual.hasEvidence
        && allowsAddressHint(contextual.match);
      if (tier.some((hint) => isUnrelatedHint(hint, contextAllowsAddress))) {
        continue;
      }
      if (contextual.hasEvidence) {
        if (!contextual.match) return null;
        if (DATE_PROFILE_KEYS.has(contextual.match) && component.conflict) return null;
        if (MONTH_PROFILE_KEYS.has(contextual.match)
          && component.segment === 'year'
          && !isSelect) return null;
        return {
          profileKey: contextual.match,
          segment: isSelect && DATE_PROFILE_KEYS.has(contextual.match)
            ? component.segment
            : contextual.segment || null,
        };
      }
    }

    return null;
  }

  function classifyField(metadata) {
    const classification = classifyControl(metadata);
    return classification ? classification.profileKey : null;
  }

  function kanaNameKeyForLocalHints(hints) {
    for (const hint of hints) {
      const compact = hint.replace(/\s/g, '');
      if (/^(姓|せい|セイ|姓カナ|フリガナ姓|ふりがな姓)$/.test(compact)
        || /(^| )(family name kana|surname kana)($| )/.test(hint)) return 'familyNameKana';
      if (/^(名|めい|メイ|名カナ|フリガナ名|ふりがな名)$/.test(compact)
        || /(^| )(given name kana|first name kana)($| )/.test(hint)) return 'givenNameKana';
    }
    return null;
  }

  function kanjiNameKeyForLocalHints(hints) {
    for (const hint of hints) {
      const compact = hint.replace(/\s/g, '');
      if (/^(姓|苗字|名字)$/.test(compact)) return 'familyName';
      if (/^(名|下の名前)$/.test(compact)) return 'givenName';
    }
    return null;
  }

  function queryElements(element, selector) {
    if (!element || typeof element.querySelectorAll !== 'function') return [];
    try {
      return Array.from(element.querySelectorAll(selector) || []);
    } catch (_error) {
      return [];
    }
  }

  function elementTagName(element) {
    return String(element && element.tagName || '').toLowerCase();
  }

  function getNearbyLabelTexts(control) {
    let branch = control;
    for (let depth = 0; branch && depth < 5; depth += 1) {
      const sibling = branch.previousElementSibling;
      const scope = branch === control ? branch.parentElement : branch;
      const scopeControls = queryElements(scope, 'input, select, textarea');
      const uniquelyContainsControl = scopeControls.length === 1 && scopeControls[0] === control;
      if (elementTagName(sibling) === 'label') {
        const text = String(sibling.textContent || '').trim();
        // A label directly before this control is unambiguous even when its
        // enclosing definition contains other fields. For wrapper siblings,
        // require the wrapper itself to contain only this control.
        const isSelectUnitAfterWrapper = elementTagName(control) === 'select'
          && branch !== control;
        if (text && (branch === control || (uniquelyContainsControl && !isSelectUnitAfterWrapper))) {
          return [text];
        }
      }
      const siblingLabels = queryElements(sibling, 'label');
      const siblingControls = queryElements(sibling, 'input, select, textarea');
      if (uniquelyContainsControl && siblingLabels.length === 1 && siblingControls.length === 0) {
        const text = String(siblingLabels[0].textContent || '').trim();
        if (text) return [text];
      }
      branch = branch.parentElement;
    }

    const acceptedTags = new Set(['div', 'li', 'span', 'td', 'dd']);
    let ancestor = control && control.parentElement;
    for (let depth = 0; ancestor && depth < 6; depth += 1, ancestor = ancestor.parentElement) {
      if (!acceptedTags.has(elementTagName(ancestor))) continue;
      const controls = queryElements(ancestor, 'input, select, textarea');
      const labels = queryElements(ancestor, 'label');
      if (controls.length === 1 && controls[0] === control && labels.length === 1) {
        const text = String(labels[0].textContent || '').trim();
        if (text) return [text];
      }
    }
    return [];
  }

  function getDefinitionInfo(control) {
    const acceptedTags = new Set(['div', 'dl', 'fieldset', 'section', 'article']);
    const pairedDefinition = getPairedDefinition(control);
    if (pairedDefinition) {
      const heading = String(pairedDefinition.previousElementSibling.textContent || '').trim();
      if (heading) {
        const definitionControls = queryElements(pairedDefinition, 'input, select, textarea');
        const selectControls = definitionControls.filter((item) => elementTagName(item) === 'select');
        const selectSegments = getSelectUnitSegments(pairedDefinition, selectControls);
        return {
          heading,
          selectCount: selectControls.length,
          selectIndex: selectControls.indexOf(control),
          selectSegments,
        };
      }
    }

    let ancestor = control && control.parentElement;
    // Keep this walk bounded while allowing wrapper-heavy legacy forms. The
    // unique dt/dd and control-containment checks reject broad ancestors.
    for (let depth = 0; ancestor && depth < 8; depth += 1, ancestor = ancestor.parentElement) {
      if (!acceptedTags.has(elementTagName(ancestor))) continue;
      const terms = queryElements(ancestor, 'dt');
      const definitions = queryElements(ancestor, 'dd');
      const controls = definitions.length === 1
        ? queryElements(definitions[0], 'input, select, textarea')
        : [];
      if (terms.length === 1 && definitions.length === 1 && controls.includes(control)) {
        const text = String(terms[0].textContent || '').trim();
        if (text) {
          const definitionControls = queryElements(definitions[0], 'input, select, textarea');
          const selectControls = definitionControls
            .filter((item) => elementTagName(item) === 'select');
          const selectSegments = getSelectUnitSegments(definitions[0], selectControls);
          return {
            heading: text,
            selectCount: selectControls.length,
            selectIndex: selectControls.indexOf(control),
            selectSegments,
          };
        }
      }
    }
    return null;
  }

  function getPairedDefinition(control) {
    let ancestor = control && control.parentElement;
    for (let depth = 0; ancestor && depth < 10; depth += 1, ancestor = ancestor.parentElement) {
      if (elementTagName(ancestor) !== 'dd'
        || elementTagName(ancestor.previousElementSibling) !== 'dt'
        || queryElements(ancestor.parentElement, 'dt').length !== 1
        || queryElements(ancestor.parentElement, 'dd').length !== 1
        || !queryElements(ancestor, 'input, select, textarea').includes(control)) continue;
      return ancestor;
    }
    return null;
  }

  function getSelectUnitSegments(definition, selects) {
    return selects.map((select) => {
      const candidates = [];
      let branch = select;
      for (let depth = 0; branch && branch !== definition && depth < 12; depth += 1) {
        const controls = branch === select
          ? [select]
          : queryElements(branch, 'input, select, textarea');
        const uniquelyContainsSelect = controls.length === 1 && controls[0] === select;
        const unitLabel = branch.nextElementSibling;
        if (uniquelyContainsSelect && elementTagName(unitLabel) === 'label') {
          const unit = normalizeHint(unitLabel.textContent).replace(/\s/g, '');
          const segment = unit === '年'
            ? 'year'
            : unit === '月'
              ? 'month'
              : unit === '日'
                ? 'day'
                : null;
          if (segment) candidates.push(segment);
        }
        branch = branch.parentElement;
      }
      return candidates.length === 1 ? candidates[0] : null;
    });
  }

  function getDefinitionHeading(control) {
    return getDefinitionInfo(control)?.heading || '';
  }

  function getTableHeaderLabel(control) {
    const cell = control && typeof control.closest === 'function'
      ? control.closest('td')
      : null;
    const row = cell && cell.parentElement;
    if (!cell || elementTagName(row) !== 'tr' || elementTagName(cell.previousElementSibling) !== 'th') {
      return '';
    }
    const cells = queryElements(row, 'th, td');
    const controls = queryElements(cell, 'input, select, textarea');
    if (cells.length !== 2 || controls.length !== 1 || controls[0] !== control) return '';
    return String(cell.previousElementSibling.textContent || '').trim();
  }

  function collectFieldMetadata(control, document) {
    const labelTexts = [];
    const nearLabelTexts = [];
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

    for (const text of [
      ...getNearbyLabelTexts(control),
      getTableHeaderLabel(control),
    ]) {
      if (text && !labelTexts.includes(text) && !nearLabelTexts.includes(text)) {
        nearLabelTexts.push(text);
      }
    }

    const definitionInfo = getDefinitionInfo(control);
    const definitionHeading = definitionInfo?.heading || '';
    if (definitionHeading && !contextTexts.includes(definitionHeading)) {
      contextTexts.push(definitionHeading);
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

    const metadata = {
      labelTexts,
      nearLabelTexts,
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
    if (tagName === 'select' && definitionInfo?.selectCount === 3
      && definitionInfo.selectIndex >= 0) {
      metadata.definitionSelectCount = definitionInfo.selectCount;
      metadata.definitionSelectIndex = definitionInfo.selectIndex;
      metadata.definitionHeading = definitionInfo.heading;
      metadata.definitionSelectSegments = definitionInfo.selectSegments;
    }
    return metadata;
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

  function hasClassToken(element, token) {
    if (element && element.classList && typeof element.classList.contains === 'function') {
      return element.classList.contains(token);
    }
    return (` ${String(element && element.className || '')} `).includes(` ${token} `);
  }

  function syncJqTransformSelectView(select) {
    const wrappers = [];
    let ancestor = select && select.parentElement;
    for (let depth = 0; ancestor && depth < 12; depth += 1, ancestor = ancestor.parentElement) {
      if (hasClassToken(ancestor, 'jqTransformSelectWrapper')) wrappers.push(ancestor);
    }
    if (wrappers.length !== 1) return;

    const wrapper = wrappers[0];
    const nativeSelects = queryElements(wrapper, 'input, select, textarea')
      .filter((control) => elementTagName(control) === 'select');
    if (nativeSelects.length !== 1 || nativeSelects[0] !== select) return;

    const openLinks = queryElements(wrapper, 'a.jqTransformSelectOpen');
    const displayElements = queryElements(wrapper, 'div > span');
    const lists = queryElements(wrapper, 'ul');
    const options = Array.from(select.options || []);
    const links = queryElements(wrapper, 'ul > li > a');
    const selectedIndex = select.selectedIndex;
    const selectedOption = options[selectedIndex];
    if (openLinks.length !== 1
      || displayElements.length !== 1
      || elementTagName(displayElements[0]) !== 'span'
      || displayElements[0] !== openLinks[0].previousElementSibling
      || displayElements[0].parentElement !== openLinks[0].parentElement
      || lists.length !== 1
      || !selectedOption
      || selectedIndex < 0
      || links.length !== options.length
      || !links.every((link, index) => (
        link.getAttribute('index') === String(index)
        && normalizeOptionText(link.textContent) === normalizeOptionText(options[index].textContent)
        && link.classList
        && typeof link.classList.contains === 'function'
        && typeof link.classList.add === 'function'
        && typeof link.classList.remove === 'function'
      ))) return;

    const display = displayElements[0];
    if (normalizeOptionText(display.textContent) === normalizeOptionText(selectedOption.textContent)) return;

    if (typeof display.textContent !== 'string') return;
    display.textContent = selectedOption.textContent;
    for (let index = 0; index < links.length; index += 1) {
      const classList = links[index].classList;
      if (index === selectedIndex) {
        if (!classList.contains('selected')) classList.add('selected');
      } else if (classList.contains('selected')) {
        classList.remove('selected');
      }
    }
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

  function optionMatchesSegment(option, expected, segment) {
    const text = String(option && (option.label || option.textContent) || '');
    if (!segment) return normalizeOptionText(text) === normalizeOptionText(expected);
    if (!['year', 'month', 'day'].includes(segment)) return false;

    const expectedMatch = /^(\d{1,4})$/.exec(String(expected));
    if (!expectedMatch) return false;
    const expectedNumber = Number(expectedMatch[1]);
    if (segment === 'month' && (expectedNumber < 1 || expectedNumber > 12)) return false;
    if (segment === 'day' && (expectedNumber < 1 || expectedNumber > 31)) return false;

    const candidates = [text, String(option.value || '')];
    return candidates.some((candidate) => {
      const numberMatch = /(\d{1,4})/.exec(normalizeOptionText(candidate));
      if (!numberMatch) return false;
      const optionNumber = Number(numberMatch[1]);
      if (!Number.isFinite(optionNumber) || optionNumber !== expectedNumber) return false;
      return segment !== 'year' || numberMatch[1] === expectedMatch[1];
    });
  }

  function findMatchingOption(select, value, segment) {
    const matches = Array.from(select.options || []).filter((option) => {
      const effectivelyDisabled = typeof option.matches === 'function'
        && option.matches(':disabled');
      return !option.disabled
        && !effectivelyDisabled
        && optionMatchesSegment(option, value, segment);
    });
    return matches.length === 1 ? matches[0] : null;
  }

  function getMonthComponents(value) {
    if (!isValidIsoMonth(value)) return null;
    return { year: value.slice(0, 4), month: String(Number(value.slice(5, 7))) };
  }

  function getBirthDateComponents(value) {
    if (!isValidIsoDate(value)) return null;
    const [year, month, day] = value.split('-');
    return { year, month, day };
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

    const components = profileKey === 'birthDate'
      ? getBirthDateComponents(profileValue)
      : getMonthComponents(profileValue);
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
      } else if (type !== 'text' && type !== 'textarea' && type !== 'email' && type !== 'tel') {
        return false;
      }
      setNativeProperty(control, 'value', value, document);
    }

    dispatchValueEvents(control, document);
    if (tagName === 'select') syncJqTransformSelectView(control);
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

  function genderCategory(value) {
    const normalized = normalizeHint(value).replace(/\s/g, '');
    if (/^(男性|男)$/.test(normalized) || normalized === 'male') return 'male';
    if (/^(女性|女)$/.test(normalized) || normalized === 'female') return 'female';
    if (/^(その他|その他の性別)$/.test(normalized) || normalized === 'other') return 'other';
    return null;
  }

  function radioLabels(control, document) {
    const metadata = collectFieldMetadata(control, document);
    const direct = metadata.labelTexts.filter(Boolean);
    return direct.length ? direct : metadata.nearLabelTexts.filter(Boolean);
  }

  function radioScope(control, document) {
    let ancestor = control.parentElement;
    while (ancestor) {
      const tagName = elementTagName(ancestor);
      if (tagName === 'fieldset' || ancestor.getAttribute?.('role') === 'group') return ancestor;
      ancestor = ancestor.parentElement;
    }
    return control.form || document;
  }

  function fillGenderRadios(document, profile, options = {}) {
    const onlyProfileKeys = options.onlyProfileKeys ? new Set(options.onlyProfileKeys) : null;
    const skipProfileKeys = new Set(options.skipProfileKeys || []);
    const onlyControls = options.onlyControls ? new Set(options.onlyControls) : null;
    const skipControls = options.skipControls ? new Set(options.skipControls) : null;
    if (skipProfileKeys.has('gender') || (onlyProfileKeys && !onlyProfileKeys.has('gender'))) {
      return { filledCount: 0, controls: new Set() };
    }
    const target = genderCategory(profile && profile.gender);
    if (!target) return { filledCount: 0, controls: new Set() };
    const radios = Array.from(document.querySelectorAll('input, select, textarea'))
      .filter((control) => String(control.tagName).toLowerCase() === 'input'
        && String(control.getAttribute('type') || control.type || '').toLowerCase() === 'radio'
        && (control.getAttribute('name') || control.name));
    const groups = [];
    for (const radio of radios) {
      const name = radio.getAttribute('name') || radio.name;
      const scope = radioScope(radio, document);
      let group = groups.find((item) => item.name === name && item.scope === scope);
      if (!group) {
        group = { name, scope, controls: [] };
        groups.push(group);
      }
      group.controls.push(radio);
    }

    let filledCount = 0;
    const changed = new Set();
    for (const group of groups) {
      if ((onlyControls && !group.controls.every((control) => onlyControls.has(control)))
        || (skipControls && group.controls.some((control) => skipControls.has(control)))) continue;
      const entries = group.controls.map((control) => ({ control, labels: radioLabels(control, document) }));
      const categories = new Set(entries.flatMap((entry) => (
        entry.labels.length === 1 ? [genderCategory(entry.labels[0])] : []
      )).filter(Boolean));
      const contextHints = group.controls.flatMap((control) => {
        const metadata = collectFieldMetadata(control, document);
        return [...metadata.fieldsetTexts, ...metadata.contextTexts];
      });
      const explicitGenderContext = classifyField({ labelTexts: contextHints }) === 'gender';
      if (!explicitGenderContext && !(categories.has('male') && categories.has('female'))) continue;

      const matches = entries.filter((entry) => (
        entry.labels.length === 1 && genderCategory(entry.labels[0]) === target
      ));
      if (matches.length !== 1) continue;
      const control = matches[0].control;
      if (control.disabled || control.readOnly
        || (typeof control.matches === 'function' && control.matches(':disabled'))) continue;
      try {
        setNativeProperty(control, 'checked', true, document);
        dispatchValueEvents(control, document);
        changed.add(control);
        filledCount += 1;
      } catch (_error) {
        // Keep the original selection if a radio cannot be safely updated.
      }
    }
    return { filledCount, controls: changed };
  }

  function confirmationHint(value) {
    const hint = normalizeHint(value).replace(/\s/g, '');
    return /確認|再入力|もう一度|confirm|reenter|re-enter/.test(hint);
  }

  function ancestorContainers(control) {
    const acceptedTags = new Set(['div', 'li', 'span', 'td', 'dd']);
    const result = [];
    let ancestor = control && control.parentElement;
    for (let depth = 0; ancestor && depth < 6; depth += 1, ancestor = ancestor.parentElement) {
      if (acceptedTags.has(elementTagName(ancestor))) result.push(ancestor);
    }
    return result;
  }

  function groupControls(group) {
    return queryElements(group, 'input, select, textarea').filter((control) => (
      String(control.tagName || '').toLowerCase() === 'input'
    ));
  }

  function contactGroupLabel(group, controls, document) {
    const labels = queryElements(group, 'label')
      .map((label) => String(label.textContent || '').trim())
      .filter(Boolean);
    if (labels.length === 1) return labels[0];

    const contexts = controls.map((control) => collectFieldMetadata(control, document).contextTexts);
    if (contexts.length && contexts.every((items) => items.length === 1 && items[0] === contexts[0][0])) {
      return contexts[0][0];
    }
    return '';
  }

  function fillSplitContactGroups(document, profile, options = {}) {
    const onlyProfileKeys = options.onlyProfileKeys ? new Set(options.onlyProfileKeys) : null;
    const skipProfileKeys = new Set(options.skipProfileKeys || []);
    const onlyControls = options.onlyControls ? new Set(options.onlyControls) : null;
    const skipControls = options.skipControls ? new Set(options.skipControls) : null;
    const allowKey = (key, controls) => !skipProfileKeys.has(key)
      && (!onlyProfileKeys || onlyProfileKeys.has(key))
      && (!onlyControls || controls.every((control) => onlyControls.has(control)))
      && (!skipControls || controls.every((control) => !skipControls.has(control)));
    const considered = new Set();
    const reservedControls = new Set();
    let filledCount = 0;
    const candidates = [];

    for (const control of document.querySelectorAll('input, select, textarea')) {
      if (String(control.tagName || '').toLowerCase() !== 'input'
        || !['text', 'tel', 'email'].includes(String(control.getAttribute('type') || control.type || 'text').toLowerCase())) continue;
      const definitionGroup = getPairedDefinition(control);
      const groups = [...ancestorContainers(control)];
      if (definitionGroup && !groups.includes(definitionGroup)) groups.push(definitionGroup);
      for (const group of groups) {
        const controls = groupControls(group);
        const label = contactGroupLabel(group, controls, document);
        if (!label || controls.some((item) => !['text', 'tel', 'email'].includes(
          String(item.getAttribute('type') || item.type || 'text').toLowerCase(),
        ))) continue;
        const key = classifyField({ labelTexts: [label] });
        const emailSeparatorCount = (String(group.textContent || '').normalize('NFKC').match(/@/g) || []).length;
        const emailGroup = key === 'email'
          && ((controls.length === 2 && emailSeparatorCount === 1)
            || (controls.length === 4 && emailSeparatorCount === 2));
        const phoneGroup = ['phoneNumber', 'mobilePhone'].includes(key)
          // The separator can be generated by CSS or rendered outside textContent.
          // Three inputs under one uniquely identified phone group are enough to
          // treat them as a single segmented control; never fill them individually.
          && controls.length === 3;
        if ((!emailGroup && !phoneGroup)
          || controls.some((item) => considered.has(item))
          || candidates.some((candidate) => candidate.group === group
            || (candidate.controls.length === controls.length
              && candidate.controls.every((item, index) => item === controls[index])))) continue;
        candidates.push({ group, controls, label, key, emailGroup, phoneGroup });
      }
    }

    const unconfirmedEmailGroups = candidates.filter((candidate) => (
      candidate.emailGroup && !confirmationHint(candidate.label)
    ));
    const confirmationEmailGroups = candidates.filter((candidate) => (
      candidate.emailGroup && confirmationHint(candidate.label)
    ));
    for (const candidate of candidates) {
        const { group, controls, label, key, emailGroup, phoneGroup } = candidate;
        if (emailGroup) {
          if (!confirmationHint(label) && unconfirmedEmailGroups.length !== 1) continue;
          if (confirmationHint(label)
            && (unconfirmedEmailGroups.length !== 1 || confirmationEmailGroups.length !== 1)) continue;
        }
        if (!allowKey(key, controls)) continue;
        controls.forEach((item) => considered.add(item));
        // Once a uniquely identified split group is accepted, keep every member
        // out of the ordinary per-control path, even if its value is unusable.
        controls.forEach((item) => reservedControls.add(item));

        const rawValue = profile && profile[key];
        if (typeof rawValue !== 'string' || !rawValue.trim()) continue;
        const value = rawValue.trim();
        let parts = null;
        if (emailGroup && (key === 'email') && !/携帯アドレス|携帯メール|mobile email|mobile mail/i.test(label)) {
          const emailParts = value.split('@');
          if (emailParts.length === 2 && emailParts[0] && emailParts[1]) {
            parts = controls.length === 4 ? [...emailParts, ...emailParts] : emailParts;
          }
        }
        if (phoneGroup) {
          const normalizedPhone = value.normalize('NFKC');
          const phoneParts = /^(\d{2,5})-(\d{1,4})-(\d{3,4})$/.exec(normalizedPhone);
          if (phoneParts) parts = phoneParts.slice(1);
          else if (/^\d{11}$/.test(normalizedPhone)) {
            parts = [normalizedPhone.slice(0, 3), normalizedPhone.slice(3, 7), normalizedPhone.slice(7)];
          }
        }
        if (!parts || parts.length !== controls.length) continue;

        for (let index = 0; index < controls.length; index += 1) {
          const item = controls[index];
          if (item.disabled || item.readOnly
            || (typeof item.matches === 'function' && item.matches(':disabled'))) {
            break;
          }
          try {
            if (!setFormControlValue(item, { profileKey: key, segment: null }, parts[index], document)) {
              break;
            }
            filledCount += 1;
          } catch (_error) {
            break;
          }
        }
        // Reserved controls stay excluded even after a partial setter failure.
    }
    return { filledCount, controls: reservedControls };
  }

  function fillDocument(document, profile, options = {}) {
    const radioResult = fillGenderRadios(document, profile || {}, options);
    const contactResult = fillSplitContactGroups(document, profile || {}, options);
    let filledCount = radioResult.filledCount + contactResult.filledCount;
    let failedCount = 0;
    const onlyProfileKeys = options.onlyProfileKeys
      ? new Set(options.onlyProfileKeys)
      : null;
    const skipProfileKeys = new Set(options.skipProfileKeys || []);
    const onlyControls = options.onlyControls ? new Set(options.onlyControls) : null;
    const skipControls = options.skipControls ? new Set(options.skipControls) : null;
    const emailEntries = Array.from(document.querySelectorAll('input, select, textarea'))
      .filter((control) => String(control.tagName || '').toLowerCase() === 'input'
        && ['text', 'email'].includes(String(control.getAttribute('type') || control.type || 'text').toLowerCase())
        && !control.disabled && !control.readOnly
        && !(typeof control.matches === 'function' && control.matches(':disabled')))
      .map((control) => ({ control, metadata: collectFieldMetadata(control, document) }))
      .filter((entry) => classifyControl(entry.metadata)?.profileKey === 'email');
    const unconfirmedEmailEntries = emailEntries.filter((entry) => !confirmationHint(
      [...entry.metadata.labelTexts, ...entry.metadata.nearLabelTexts].join(' '),
    ));
    const confirmedEmailEntries = emailEntries.filter((entry) => confirmationHint(
      [...entry.metadata.labelTexts, ...entry.metadata.nearLabelTexts].join(' '),
    ));
    const allowedEmailControls = new Set();
    if (unconfirmedEmailEntries.length === 1) {
      allowedEmailControls.add(unconfirmedEmailEntries[0].control);
      if (confirmedEmailEntries.length === 1) {
        allowedEmailControls.add(confirmedEmailEntries[0].control);
      }
    }

    for (const control of document.querySelectorAll('input, select, textarea')) {
      if (radioResult.controls.has(control) || contactResult.controls.has(control)) continue;
      if (onlyControls && !onlyControls.has(control)) continue;
      if (skipControls && skipControls.has(control)) continue;
      const tagName = String(control.tagName || '').toLowerCase();
      const type = tagName === 'input'
        ? String(control.getAttribute('type') || control.type || 'text').toLowerCase()
        : tagName;
      const supported = tagName === 'select'
        || tagName === 'textarea'
        || (tagName === 'input' && ['text', 'date', 'month', 'email', 'tel'].includes(type));
      const effectivelyDisabled = typeof control.matches === 'function'
        && control.matches(':disabled');
      if (!supported || control.disabled || effectivelyDisabled || control.readOnly) continue;

      try {
        const metadata = collectFieldMetadata(control, document);
        if (metadata.role === 'combobox' || metadata.role === 'spinbutton') continue;
        const classification = classifyControl(metadata);
        if (!classification) continue;
        if (classification.profileKey === 'email' && !allowedEmailControls.has(control)) continue;
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
