# らくらくにゅうりょくん！ MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 「姓」「名」「英字姓」「英字名」を保存し、利用者の明示操作で現在のWebページにある対応欄だけへ入力するManifest V3拡張機能を作る。

**Architecture:** ポップアップ、保存アダプター、DOM判定・入力ロジック、注入用アダプターを小さなプレーンJavaScriptファイルへ分離する。`activeTab` と `chrome.scripting.executeScript()` でボタン操作時だけ現在タブへ処理を注入し、登録値は `chrome.storage.local` のみから取得する。

**Tech Stack:** Chrome Extension Manifest V3、HTML、CSS、JavaScript、Node.js組み込み `node:test` / `assert`（外部依存なし）

**Spec:** `docs/superpowers/specs/2026-09-28-rakuraku-nyuryokun-mvp-design.md`

## Global Constraints

- 対象項目は `familyName`、`givenName`、`familyNameLatin`、`givenNameLatin` の4つだけとする。
- 登録情報は `chrome.storage.local` の `profile` キー配下だけに保存し、ソース、fixture、ログへ個人情報を記載しない。
- 外部API、AI、外部通信、外部スクリプト、実行時依存、開発依存を使わない。
- 必要権限は `storage`、`activeTab`、`scripting` だけとする。
- 自動入力は「このページに入力」の明示操作時だけ行い、フォーム送信処理を実装しない。
- iframeとShadow DOM、`chrome://`、ChromeウェブストアはMVP対象外とする。
- Content Security Policyに適合させ、インラインJavaScriptと動的コード評価を使わない。
- git commitおよびgit pushを実行しない。各タスクの終了点はテストと差分確認とする。

## Review Focus

- 全角・半角、大小文字、空白、ハイフン、アンダースコアが混在する手掛かりも同じ意味として判定する（Task 2）。
- `会社名`、`ユーザー名` など「名」を含む別用途の欄へ入力しない（Task 2）。
- `label[for]` と親 `label` の両形式からテキストを取得できる（Task 2）。
- スクリプト注入結果が欠ける場合や注入APIが失敗する場合も、ページを変更せず利用者向けエラーにする（Task 3）。
- 同じ項目の対応欄が複数ある場合はすべて処理し、一部失敗しても成功件数と失敗件数を正しく返す（Task 2）。

---

### Task 1: プロフィール保存と復元

**Files:**
- Create: `package.json`
- Create: `profile-storage.js`
- Create: `tests/profile-storage.test.js`

**Interfaces:**
- Consumes: `chrome.storage.local` と同じ `get(key)` / `set(value)` を持つStorageArea。
- Produces: `PROFILE_KEYS: readonly string[]`、`normalizeProfile(value): Profile`、`createProfileStorage(storageArea): { load(): Promise<Profile>, save(value): Promise<Profile> }`。ブラウザでは `globalThis.RakurakuProfileStorage`、Nodeでは `module.exports` から同じAPIを公開する。

- [ ] **Step 1: 保存・復元の失敗テストを書く**

`tests/profile-storage.test.js` に、未保存時は4つの空文字列を返すこと、余分なキーを捨てて非文字列・欠落値を空文字列へ正規化すること、保存時に前後空白を除き `{ profile: normalized }` を一括保存することをassertするテストを書く。

```js
assert.deepEqual(normalizeProfile({ familyName: '  保存値  ', extra: 'x' }), {
  familyName: '保存値', givenName: '', familyNameLatin: '', givenNameLatin: ''
});
assert.deepEqual(await storage.load(), EMPTY_PROFILE);
assert.deepEqual(fakeArea.lastSet, { profile: expectedProfile });
```

- [ ] **Step 2: REDを確認する**

Run: `node --test tests/profile-storage.test.js`
Expected: `profile-storage.js` または公開関数が存在しないためFAIL。

- [ ] **Step 3: 最小実装とテストコマンドを追加する**

`profile-storage.js` に上記3インターフェースを実装する。`package.json` は `private: true` と `scripts.test: "node --test"` だけを含み、dependencies/devDependenciesは定義しない。

- [ ] **Step 4: GREENと全体テストを確認する**

Run: `npm test`
Expected: profile storage testsがすべてPASS、警告なし。

- [ ] **Step 5: 差分を確認する**

Run: `git diff --check; git status --short`
Expected: whitespace errorなし。新規3ファイルだけが実装差分として表示され、commitは行わない。

### Task 2: 入力欄判定と値設定

**Files:**
- Create: `autofill.js`
- Create: `tests/autofill.test.js`

**Interfaces:**
- Consumes: `Document`相当の `querySelectorAll()` / `querySelector()` と、input相当の属性・`value`・`dispatchEvent()`。
- Produces: `normalizeHint(value): string`、`collectFieldMetadata(input, document): FieldMetadata`、`classifyField(metadata): ProfileKey | null`、`fillDocument(document, profile): { filledCount: number, failedCount: number }`。ブラウザでは `globalThis.RakurakuAutofill`、Nodeでは `module.exports` から同じAPIを公開する。

- [ ] **Step 1: 正規化と4分類の失敗テストを書く**

`tests/autofill.test.js` に、`姓` / `名`、`last name` / `first name`、`family_name` / `given-name`、`autocomplete`、`英字姓` / `ローマ字名` が設計どおり4キーへ分類されることを表形式でassertする。大小文字、全角空白、ハイフン、アンダースコアの混在例も含める。`collectFieldMetadata()` について、`label[for]`、親 `label`、`placeholder`、`name`、`id`、`aria-label`、`autocomplete` の各ソースが収集されて分類へ渡るケースを1つずつ含める。

```js
for (const [metadata, expected] of cases) {
  assert.equal(classifyField(metadata), expected);
}
```

- [ ] **Step 2: REDを確認する**

Run: `node --test tests/autofill.test.js`
Expected: `autofill.js` または分類関数が存在しないためFAIL。

- [ ] **Step 3: 正規化と分類の最小実装を書く**

明示的な英字・ローマ字表現、明確な日本語表現、英語表現/`autocomplete` の順にスコアを付け、同点または閾値未満は `null` にする。`氏名`、`お名前`、`name`、`full name` は明示的に分類しない。

- [ ] **Step 4: 分類テストのGREENを確認する**

Run: `node --test tests/autofill.test.js`
Expected: 正規化と4分類のテストがPASS。

- [ ] **Step 5: 除外・label収集・入力処理の失敗テストを書く**

同じテストファイルへ、次をassertするテストを追加する。

- `email`、`address`、`company`、`会社名`、`ユーザー名`、`氏名`、`full name` は `null`。
- `label[for]` と親 `label` の双方からテキストを収集する。
- 対象はtype未指定/`text`かつ有効・書き込み可能なinputだけで、hidden/disabled/readonly/他typeは変更しない。
- 空の登録値は入力せず、対応する複数欄はすべて登録値に置換する。
- ネイティブvalue setterの後に、bubblingする `input`、`change` をこの順で送出する。
- 1要素のsetterがthrowしても後続要素を処理し、`{ filledCount: 1, failedCount: 1 }` を返す。
- fake formの `submit()` は一度も呼ばれない。

- [ ] **Step 6: 追加テストのREDを確認する**

Run: `node --test tests/autofill.test.js`
Expected: DOM収集または入力関数が未実装のため、追加ケースがFAIL。

- [ ] **Step 7: DOM収集と入力の最小実装を書く**

`collectFieldMetadata()` と `fillDocument()` を公開シグネチャどおり実装する。要素ごとの例外だけを捕捉して件数化し、クリック、フォーカス、キー操作、submitは呼ばない。

- [ ] **Step 8: GREENと全体テストを確認する**

Run: `npm test`
Expected: Task 1とTask 2の全テストがPASS、警告なし。

- [ ] **Step 9: 差分を確認する**

Run: `git diff --check; git status --short`
Expected: whitespace errorなし。commitは行わない。

### Task 3: 注入処理とポップアップ制御

**Files:**
- Create: `content.js`
- Create: `popup.js`
- Create: `tests/content.test.js`
- Create: `tests/popup.test.js`

**Interfaces:**
- Consumes: Task 1の `createProfileStorage()` / `normalizeProfile()`、Task 2の `fillDocument()`、`chrome.tabs.query()`、`chrome.scripting.executeScript()`。
- Produces: `runContent({ storageArea, document, autofill }): Promise<FillResult>`、`createPopupController({ document, storageApi, tabsApi, scriptingApi }): { init(), saveProfile(), fillCurrentPage() }`。Chrome注入時の `content.js` の完了値は `FillResult` とする。

- [ ] **Step 1: contentアダプターの失敗テストを書く**

`tests/content.test.js` に、保存プロフィールを取得して `fillDocument()` へ渡し、その `{ filledCount, failedCount }` を返すこと、取得失敗は呼び出し元へrejectすることをassertする。

- [ ] **Step 2: REDを確認する**

Run: `node --test tests/content.test.js`
Expected: `content.js` または `runContent()` が存在しないためFAIL。

- [ ] **Step 3: contentアダプターを最小実装する**

Nodeでは `runContent` をexportし、Chrome注入時は `globalThis.RakurakuAutofill` と `chrome.storage.local` を使って即時実行したPromiseをファイルの完了値として返す。

- [ ] **Step 4: contentテストのGREENを確認する**

Run: `node --test tests/content.test.js`
Expected: content testsがPASS。

- [ ] **Step 5: popup制御の失敗テストを書く**

`tests/popup.test.js` にfake DOMとfake Chrome APIを用意し、次をassertする。

- `init()` が保存値を4入力欄へ復元する。
- `saveProfile()` が4入力値を保存し、成功/失敗の日本語ステータスを表示する。
- 全項目が空なら `executeScript()` を呼ばず「先にプロフィールを保存してください」を表示する。
- アクティブタブに `files: ['autofill.js', 'content.js']` をこの順で1回注入する。
- `filledCount` が正、0、または一部失敗の各結果を適切に表示する。
- タブなし、API reject、空のInjectionResult、結果欠落は「このページでは入力できません」にする。
- API失敗のメッセージや登録値をconsoleへ出力しない。

- [ ] **Step 6: popupテストのREDを確認する**

Run: `node --test tests/popup.test.js`
Expected: `popup.js` またはcontrollerが存在しないためFAIL。

- [ ] **Step 7: popup controllerを最小実装する**

DOM要素IDを `familyName`、`givenName`、`familyNameLatin`、`givenNameLatin`、`saveButton`、`fillButton`、`status` に固定する。ブラウザでは `DOMContentLoaded` 後にcontrollerを生成してイベントを接続し、Nodeではfactoryだけをexportする。

- [ ] **Step 8: GREENと全体テストを確認する**

Run: `npm test`
Expected: Task 1〜3の全テストがPASS、警告なし。

- [ ] **Step 9: 差分を確認する**

Run: `git diff --check; git status --short`
Expected: whitespace errorなし。commitは行わない。

### Task 4: Manifest、ポップアップUI、手動確認フォーム

**Files:**
- Create: `manifest.json`
- Create: `popup.html`
- Create: `popup.css`
- Create: `tests/manifest.test.js`
- Create: `tests/fixtures/test-form.html`

**Interfaces:**
- Consumes: Task 1の `profile-storage.js` とTask 3の `popup.js`、Task 2/3の注入ファイル名。
- Produces: Chromeが読み込めるManifest V3拡張パッケージと、4対応欄・4未対応欄・送信検知を持つローカル確認フォーム。

- [ ] **Step 1: 拡張パッケージ構造の失敗テストを書く**

`tests/manifest.test.js` に次をassertする。

```js
assert.equal(manifest.manifest_version, 3);
assert.deepEqual(manifest.permissions.sort(), ['activeTab', 'scripting', 'storage'].sort());
assert.equal(manifest.action.default_popup, 'popup.html');
assert.equal(manifest.host_permissions, undefined);
```

加えて、`popup.html` が4入力ID、2ボタンID、status、`profile-storage.js`→`popup.js` の順の外部scriptを持ち、inline scriptを持たないこと、Manifest参照先がすべて存在することをassertする。プロダクションファイルに `http://`、`https://`、`fetch(`、`XMLHttpRequest`、`eval(`、`new Function` が含まれないことも静的に検証する。

- [ ] **Step 2: REDを確認する**

Run: `node --test tests/manifest.test.js`
Expected: manifestまたはpopupファイルが存在しないためFAIL。

- [ ] **Step 3: ManifestとポップアップUIを実装する**

拡張名を「らくらくにゅうりょくん！」、バージョンを `0.1.0` とし、4項目へ明確な日本語labelと適切な `autocomplete` を付ける。保存と入力ボタンを視覚的に区別し、statusは `aria-live="polite"` にする。

- [ ] **Step 4: パッケージ構造テストのGREENを確認する**

Run: `node --test tests/manifest.test.js`
Expected: manifest/popup構造テストがPASS。

- [ ] **Step 5: 手動確認フォームを追加する**

`tests/fixtures/test-form.html` に、日本語の姓/名、英語のlast name/first name、未対応のemail/address/company/full name、利用者操作専用のsubmitボタン、送信が発生した場合だけ表示される警告領域を置く。個人情報の初期値は入れない。

- [ ] **Step 6: 全自動検証を実行する**

Run: `npm test`
Expected: 全テストPASS、fail 0、警告なし。

Run: `node -e "const m=require('./manifest.json'); if(m.manifest_version!==3) process.exit(1); console.log('Manifest V3 OK')"`
Expected: `Manifest V3 OK`、exit 0。

Run: `git diff --check; git status --short`
Expected: whitespace errorなし。意図した新規ファイルだけが表示され、commitは行わない。

- [ ] **Step 7: ChromeでMVPを手動確認する**

`chrome://extensions` のデベロッパーモードからリポジトリルートを「パッケージ化されていない拡張機能を読み込む」で開き、次を順に確認する。

1. エラーなく読み込める。
2. 4項目を保存し、ポップアップを閉じて開き直しても同じ値が表示される。
3. `tests/fixtures/test-form.html` で「このページに入力」を押すと対応4欄へ入力される。
4. email/address/company/full nameは変更されない。
5. 送信警告が表示されず、フォーム送信が起きない。

個人情報はテスト用の架空値を手入力し、コードやログへ保存しない。Chrome GUIを自動操作できない環境では、Step 6の結果と手動手順を最終報告し、GUI未確認を明記する。
