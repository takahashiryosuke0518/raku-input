# 旧来型フォーム対応 実装計画

> **実装時の必須スキル:** `superpowers:executing-plans` または `superpowers:subagent-driven-development` を使ってタスク単位で実装する。ユーザー指定により、Git add/commit/push/pull/branch/merge/rebaseは実行しない。

**Goal:** 標準HTML、LabBase型UI、旧来型分割フォームにプロフィールの意味情報から安全に自動入力する。

**Architecture:** プロフィールは意味値を保存し、DOM判定時にフォーム形式へ変換する。既存の単一autofillエンジンを拡張し、限定的な近接ラベル情報、部品判定、radio選択を追加する。意味やグループが曖昧な欄は変更しない。

**Tech Stack:** Chrome Extension Manifest V3、HTML、CSS、JavaScript、Node.js `node:test` / `assert`。

**Spec:** `docs/superpowers/specs/2026-10-01-legacy-form-autofill-design.md`

## Global Constraints

- プロフィールの新規キーは `familyNameKana`、`givenNameKana`、`phoneNumber`、`mobilePhone`、`email` とし、すべて文字列である。
- `birthDate` は `YYYY-MM-DD`、年月項目は `YYYY-MM`、電話番号はハイフン区切り文字列を維持する。
- 保存されていない新規プロフィール値は空文字列に正規化する。漢字名/英字名からカナを生成しない。
- 項目の意味を判定してから日付/年月のyear/month/dayを割り当てる。
- 電話/メールの分割は同一グループと形式の根拠が十分な場合だけ行う。name/idだけでは分割しない。
- `phoneNumber`と`mobilePhone`は相互にフォールバックしない。一般電話1欄は`phoneNumber`のみを使う。`email`を携帯アドレス欄へ転用しない。
- 確認欄への複製は、表示文言等から確認欄だと明確な場合だけ行う。
- radioはサイト固有valueではなく関連labelの表示文字で照合する。
- radioの近接兄弟labelは小コンテナにradio/labelがそれぞれ1個で、他radioと混同しない場合だけ採用する。
- month/day数値のゼロ埋め正規化は意味確定済みの日付/年月segmentに限る。
- styled native selectではnative selectの選択状態更新を保証し、サイト固有ラッパーを操作しない。
- submit、次へ、保存、登録などの操作を実行しない。
- 合成input/changeイベントはページ側listenerを起動し得るため、サイト側の任意の送信/遷移を完全には防止できない。保証範囲と実機確認事項を文書化する。
- テスト、fixture、ログには実データを使わず、明らかなダミー値のみを使う。
- 標準HTMLフォームと既存LabBase対応を維持し、既存プロフィール形式を壊さない。
- Git操作（add/commit/push/pull/branch/merge/rebase）を行わない。

## Review Focus

- 壊れた`label[for]`と近接DOM: 漢字姓/名とカナ姓/名を別々に判定し、共通見出しだけならスキップする。
- 壊れたradio `for`属性: radio/labelが各1個の小コンテナだけ対応し、複数labelの曖昧radioはスキップする。
- 同一ページの生年月日・入学・卒業・研究室年月: 各年月の年/月selectが別プロフィール値を受ける。
- 電話の3欄が同一番号か判断できない: 区切りとDOM関係がない欄を変更しない。
- phoneNumber/mobilePhoneの別種欄: 相互転用しない。emailは通常メール欄だけに使い、携帯アドレス欄は変更しない。
- メールの通常欄、`@`区切り欄、確認欄: 十分な構造根拠と明確な確認ラベルがある場合だけ適切に分割/複製する。
- month/day optionの`5`と`05`: 日付/年月componentとして確定した場合のみ同じ値に照合する。
- イベントやUI副作用: 拡張側submit/click非実行を検証する。ページ側listener由来の副作用を完全には防げないことを仕様と実機確認事項に明記する。

---

### Task 1: プロフィール保存とpopup項目を拡張

**Files:**
- Modify: `profile-storage.js`
- Modify: `popup.html`
- Modify: `popup.js`
- Test: `tests/profile-storage.test.js`
- Test: `tests/popup.test.js`

**Interfaces:**
- Consumes: 既存の`PROFILE_KEYS`、`normalizeProfile(value)`、popupのキーIDと同名のDOM要素。
- Produces: 5つの新規文字列プロフィールキー。既存データにキーがなくても`normalizeProfile`とloadが固定形プロフィールを返す。

- [ ] **Step 1: profile storageの失敗テストを追加**

`tests/profile-storage.test.js`の空プロフィール・期待キー・保存のケースに5キーを加える。既存形式だけを持つ保存値のload結果で新5キーが`''`であること、新キーがtrimされ、未知キーが保存結果へ混入しないことをassertする。テスト値は「山田」「太郎」「ヤマダ」「タロウ」等の明確なサンプル値に限る。

- [ ] **Step 2: 対象テストを実行し失敗を確認**

Run: `node --test tests/profile-storage.test.js`
Expected: 新しい期待形と現行プロフィール形状の不一致でFAIL。

- [ ] **Step 3: 保存層へキーを追加**

`profile-storage.js`の`PROFILE_KEYS`へ`familyNameKana`、`givenNameKana`、`phoneNumber`、`mobilePhone`、`email`を加える。既存の文字列正規化経路を使い、別の保存形式を導入しない。

- [ ] **Step 4: popupの入力欄とコントローラを追加**

`popup.html`へ各プロフィールキーと同じid/nameのtext/email/tel欄と日本語labelを追加する。`popup.js`のキー一覧がDOMとstorage双方で5項目を読み書きし、入力有無判定にも含めるよう更新する。空値は既存の値を消さない方針を変えない。

- [ ] **Step 5: popupの失敗テストを追加・実行**

`tests/popup.test.js`に5値の初期表示と保存のケースを加え、Run: `node --test tests/popup.test.js`。新欄未対応によるFAILを確認する。

- [ ] **Step 6: Task 1の対象テストを実行**

Run: `node --test tests/profile-storage.test.js tests/popup.test.js`
Expected: 2ファイルの全ケースPASS。

### Task 2: 意味に基づく近接ラベルと新フィールド分類

**Files:**
- Modify: `autofill.js`
- Test: `tests/autofill.test.js`

**Interfaces:**
- Consumes: Task 1のプロフィールキー、既存の`collectFieldMetadata(control, document)`と`classifyControl(metadata)`。
- Produces: 近接ラベルおよび構造化ラベルの限定的なhint情報と、新しい意味プロフィールキーへの分類。

- [ ] **Step 1: 新規分類のテストを追加**

`classifyField`ケースへカナ姓/名の指定語（日本語/英語）、phone/mobile/emailの一般的なlabel/autocomplete、共通「カナ氏名」単独でnullとなるケース、既存姓/名の回帰ケースを追加する。

- [ ] **Step 2: 近接DOM fixtureを追加**

テストDOMへ誤った`for`属性のlabel、同じ小wrapperのlabelとcontrol、wrapper兄弟label、同じ行のdt/ddとth/tdを表現するfixtureを加える。広いancestorに姓・名を含めても個別controlへ共有contextとして割り当てないテストを加える。fixture値はすべて固定のダミー値とする。

- [ ] **Step 3: 分類テストを実行し失敗を確認**

Run: `node --test tests/autofill.test.js`
Expected: 新しいカナ/連絡先分類・DOMラベル収集のケースがFAIL。

- [ ] **Step 4: hint収集を拡張**

`collectFieldMetadata`で正しいfor参照だけを直接labelとして扱う。限定ancestorの近接label、および一意なdt/dd・th/td関係を別hint groupに集める。複数候補・複数controlに同じlabelが曖昧に結びつく場合は追加しない。ancestor全体のtextContentを追加しない。

- [ ] **Step 5: 意味分類を追加**

既存のscore方式へカナ姓/名とemail/phone/mobilePhoneの語彙を追加する。カナ共通見出しだけではスコアを与えない。電話/メールの確認語は分類対象の種類と確認欄属性の双方として保持し、別用途の欄をメールと誤分類しない。

- [ ] **Step 6: Task 2テストを実行**

Run: `node --test tests/autofill.test.js`
Expected: 新規ケースと既存autofillケースがPASS。

### Task 3: birthDateと年月selectの分割入力

**Files:**
- Modify: `autofill.js`
- Test: `tests/autofill.test.js`

**Interfaces:**
- Consumes: Task 2の意味hint分類、既存`dateSegmentFromHints`、`setFormControlValue`。
- Produces: `birthDate`のyear/month/day segmentと、既存年月プロフィールキーのyear/month segmentを、意味判定後に適用する。

- [ ] **Step 1: 分割年月/日selectテストを追加**

2002-05-18の生年月日select三つと、2028-03 graduationMonthの年/月selectをfixtureに作り、各selectの選択状態とinput/changeイベントをassertする。

- [ ] **Step 2: 近接した複数年月の混同テストを追加**

birthDate、enrollmentMonth、graduationMonth、laboratoryStartMonthそれぞれの年/月欄がそのプロフィール値に対応することをassertする。単に「年」「月」とだけある曖昧欄は未変更であることをassertする。

- [ ] **Step 3: 対象テストを実行し失敗を確認**

Run: `node --test tests/autofill.test.js`
Expected: date three-selectおよびbirth segment関連ケースがFAIL。

- [ ] **Step 4: 日付/年月部品抽出とclassificationを実装**

意味項目の分類後にbirthDateのyear/month/dayと年月キーのyear/monthを求める。name/id属性のbirthYear/birthdayYear/yearOfBirth等はlabel/contextと組み合わせる補助hintに限定する。既存`input[type=date]`、`input[type=month]`、LabBaseカスタム年月経路を保つ。

- [ ] **Step 5: native select値更新を検証**

各部品で表示optionを一意に選び、実selectの`selectedIndex`を更新して既存input/changeを発火するテストを通す。候補不在・重複時は値を変えない。

- [ ] **Step 6: Task 3対象テストを実行**

Run: `node --test tests/autofill.test.js`
Expected: 分割日付と年月、既存LabBaseおよび標準date/monthがPASS。

### Task 4: radio、電話分割、メール分割と確認欄

**Files:**
- Modify: `autofill.js`
- Test: `tests/autofill.test.js`

**Interfaces:**
- Consumes: Task 2のlabel/group metadata、Task 3のDOM値設定/event helper、プロフィールgender/phone/mobilePhone/email。
- Produces: radio群を関連label表示で選択し、根拠が十分な電話/メール群を分解してセットする処理。

- [ ] **Step 1: radio意味照合テストを追加**

プロフィール値 男性/女性/その他 と表示label 男/女/その他、英語 male/female/otherを組み合わせる。サイトvalueが`1`/`2`/`M`/`F`でも関連labelだけで一意選択し、checkedとinput/changeをassertする。ラベルが曖昧なら未変更をassertする。

- [ ] **Step 2: 壊れたforの近接radio labelテストを追加**

小さな`li`内にradio 1個と`for="text"`の兄弟label 1個があると表示文字で選択すること、同一コンテナにradio 1個とlabel複数がある場合は選択しないこと、広い親の文章をlabel扱いしないことをassertする。

- [ ] **Step 3: 電話分割グループの正例と負例テストを追加**

3欄と間のハイフン、同一の近接wrapper、電話labelが揃う正例で番号が三分割されることをassertする。無関係な3欄やnameの連番だけの例は未変更をassertする。1欄phone入力は全番号を受ける。

`phoneNumber`のみ入力のプロフィールで携帯欄が変わらず、`mobilePhone`のみ入力のプロフィールで固定電話欄が変わらず、明確な一般電話1欄にも`mobilePhone`を転用しないことをassertする。

- [ ] **Step 4: メール分割・確認欄テストを追加**

区切り表示`@`を持つaccount/domain欄へemailを分割する。単一email欄は全体を受ける。明示された確認欄のみ同値になり、2組目でも確認根拠のない欄は未変更であることをassertする。nameだけの根拠は負例にする。

「携帯アドレス」/「mobile email」欄にemailを入力しないこともassertする。

- [ ] **Step 5: 対象テストを実行し失敗を確認**

Run: `node --test tests/autofill.test.js`
Expected: 新しいradio/電話/メールケースがFAIL。

- [ ] **Step 6: radio群の意味label照合を実装**

nameでradio群をまとめ、正しいforまたは内包label表示を読み、profile genderの同義語を意味照合する。壊れたforでは小コンテナにradioと候補labelが各1個で一意な場合のみ近接labelを使う。value文字列は選択判定に使わず、一意候補のみcheckedを設定しinput/changeを発火する。既存gender select処理を維持する。

- [ ] **Step 7: 電話/メール分割のconfidence判定を実装**

明確な論理グループとseparator表示と関連label等の複数根拠がある場合だけ複数欄へ値を割り当てる。電話欄は`phoneNumber`と`mobilePhone`を厳密に分け、一般電話欄には`phoneNumber`だけを使う。番号を数字部品へ分割する前に区切りと欄数を検証する。emailは通常メール欄に限定し、携帯アドレス欄を除外する。emailの`@`構造はDOM表示等で確認し、確認用複製は明示確認hintが存在する場合だけ行う。name/id aloneでgroupを成立させない。

- [ ] **Step 8: Task 4対象テストを実行**

Run: `node --test tests/autofill.test.js`
Expected: 新機能と既存LabBase/native select/autofillケースがPASS。

### Task 5: イベント副作用境界と日付数値照合を固定

**Files:**
- Modify: `autofill.js`
- Test: `tests/autofill.test.js`

**Interfaces:**
- Consumes: 既存のselect option照合とvalue event発火経路、Task 3/4のsegment/イベント処理。
- Produces: year/month/dayに限定した数値option照合のテスト保証、拡張自身が送信/クリック/遷移を呼ばないテスト保証。

- [ ] **Step 1: month/dayゼロ埋め照合テストを追加**

profile component `05`にoption text/value `5`、およびprofile component `5`にoption `05`が一致することをassertする。year/month/dayとして分類されない一般selectでは`5`と`05`を同値扱いしないことをassertする。

- [ ] **Step 2: 拡張側のsubmit/click非呼出しテストを追加**

既存fake formのsubmit、requestSubmit、対象ボタンのclick呼出しを監視し、複数controlのinput/change listener実行後も拡張自身からそれらを呼ばないことをassertする。ページlistenerが直接起こす副作用を完全防止するテストとはしない。

- [ ] **Step 3: select option照合を確認/実装**

年月/日付componentとして確定したsegmentに限り、表示文字とoption valueの数値表現を比較して先頭ゼロを無視する。一般selectは従来の完全一致照合を維持する。

- [ ] **Step 4: 対象テストを実行**

Run: `node --test tests/autofill.test.js`
Expected: month/dayのゼロ埋め正規化と一般select負例、submit/requestSubmit/click非呼出しケースがPASS。

- [ ] **Step 5: 保証の限界を確認**

ページlistenerが合成イベントに反応する副作用は完全には防げないこと、`form.submit()`や直接遷移等が残ること、旧式サイトで実機確認が必要なことを仕様と最終報告に明記する。拡張コードでsubmit抑止やglobal API monkey patchを行わない。

### Task 6: fixture統合と回帰確認

**Files:**
- Modify: `tests/fixtures/test-form.html`
- Test: `tests/autofill.test.js`
- Test: `tests/profile-storage.test.js`
- Test: `tests/popup.test.js`

**Interfaces:**
- Consumes: Task 1〜5のprofile/storage/popup/autofill動作。
- Produces: 代表的な標準・旧式フォームの統合 fixture と回帰検証。

- [ ] **Step 1: fixtureへ旧来フォーム例を追加**

不正for+近接姓/名とカナ、年月/日付select、radio性別、区切り付き電話、@付きメールと明示確認欄、styled native selectを追加する。既存手動fixture構造は残す。

- [ ] **Step 2: 非送信を統合確認するテストを追加**

submitイベントとボタンclickの監視をfixtureテストに置き、入力後にどちらも呼ばれないことをassertする。空プロフィール値、disabled/readonly、ambiguous option、setter失敗の既存保証も維持する。

- [ ] **Step 3: 全テストを実行**

Run: `npm test`
Expected: 全テストPASS、fail 0。

- [ ] **Step 4: 手動fixtureの差分を確認**

Run: `git diff --check`
Expected: whitespace errorなし。ユーザー指定によりstatus確認以外のGit操作を行わない。

## 実装時リスク

- 小さなDOM fixtureの模倣では実サイトDOMのlabel距離やjQuery構造を完全には表現できない。曖昧な実サイト構造を変更しない設計にし、fixtureはpositive/negative双方を置く。
- 分割部品のname/id語は補助情報にとどめ、項目意味の確定順をテストで固定する。
- UI wrapperの表示状態はnative selectと常に同期するとは限らない。対象範囲はnative stateと標準イベントとする。
