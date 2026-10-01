const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8').replace(/\r\n/g, '\n');
}

test('manifest defines a minimal Manifest V3 popup extension', () => {
  const manifest = JSON.parse(read('manifest.json'));

  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.name, 'らくらくにゅうりょくん！');
  assert.equal(manifest.version, '0.1.0');
  assert.deepEqual(
    [...manifest.permissions].sort(),
    ['activeTab', 'scripting', 'storage'].sort(),
  );
  assert.equal(manifest.action.default_popup, 'popup.html');
  assert.equal(manifest.host_permissions, undefined);
  assert.equal(manifest.content_scripts, undefined);
  assert.equal(manifest.background, undefined);
});

test('every local file referenced by the manifest exists', () => {
  const manifest = JSON.parse(read('manifest.json'));
  const referencedFiles = [manifest.action.default_popup];

  for (const relativePath of referencedFiles) {
    assert.equal(fs.existsSync(path.join(ROOT, relativePath)), true, relativePath);
  }
});

test('popup contains all profile fields, sections, actions, status region, and ordered local scripts', () => {
  const popup = read('popup.html');
  const requiredIds = [
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
    'middleSchoolName',
    'middleSchoolEnrollmentMonth',
    'middleSchoolGraduationMonth',
    'highSchoolName',
    'highSchoolEnrollmentMonth',
    'highSchoolGraduationMonth',
    'bachelorUniversityName',
    'bachelorFacultyName',
    'bachelorDepartmentName',
    'bachelorEnrollmentMonth',
    'bachelorGraduationMonth',
    'masterGraduateSchoolName',
    'masterGraduateDepartmentName',
    'masterMajorName',
    'masterEnrollmentMonth',
    'masterCompletionMonth',
    'finalEducationLevel',
    'finalEducationCompletionStatus',
    'saveButton',
    'fillButton',
    'status',
  ];

  for (const id of requiredIds) {
    assert.match(popup, new RegExp(`id=["']${id}["']`));
  }
  assert.match(popup, /id=["']birthDate["'][^>]*type=["']date["']/);
  assert.match(popup, /<select[^>]+id=["']gender["']/);
  assert.match(popup, /<select[^>]+id=["']currentPrefecture["']/);
  assert.match(popup, /<select[^>]+id=["']homePrefecture["']/);
  assert.match(popup, /<option[^>]+value=["']秋田県["'][^>]*>秋田県<\/option>/);
  assert.match(popup, /<option[^>]+value=["']海外["'][^>]*>海外<\/option>/);
  for (const section of ['基本情報', '所在地', '学校情報', '学歴情報', '中学校', '高等学校', '大学（学士）', '大学院（修士）', '最終学歴', '研究情報']) {
    assert.ok(popup.includes(section), `missing section: ${section}`);
  }
  assert.match(popup, /<label for=["']masterGraduateSchoolName["']>大学院学校名<\/label>\s*<input id=["']masterGraduateSchoolName["']/);
  assert.match(popup, /<label for=["']masterGraduateDepartmentName["']>研究科名<\/label>\s*<input id=["']masterGraduateDepartmentName["']/);
  assert.match(popup, /<option[^>]+value=["']doctorate["']>大学院（博士）<\/option>/);
  assert.match(popup, /id=["']status["'][^>]*aria-live=["']polite["']/);
  assert.match(popup, /<link[^>]+href=["']popup\.css["']/);

  const profileScriptIndex = popup.indexOf('src="profile-storage.js"');
  const popupScriptIndex = popup.indexOf('src="popup.js"');
  assert.ok(profileScriptIndex >= 0);
  assert.ok(popupScriptIndex > profileScriptIndex);

  const scriptTags = [...popup.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
  assert.equal(scriptTags.length, 2);
  for (const [, attributes, body] of scriptTags) {
    assert.match(attributes, /\bsrc=["'][^"']+["']/);
    assert.equal(body.trim(), '');
  }
});

test('production assets contain no remote requests or dynamic code evaluation', () => {
  const productionFiles = [
    'manifest.json',
    'popup.html',
    'popup.css',
    'profile-storage.js',
    'autofill.js',
    'content.js',
    'popup.js',
  ];
  const prohibited = [
    'http://',
    'https://',
    'fetch(',
    'XMLHttpRequest',
    'eval(',
    'new Function',
  ];

  for (const relativePath of productionFiles) {
    const source = read(relativePath);
    for (const token of prohibited) {
      assert.equal(source.includes(token), false, `${relativePath}: ${token}`);
    }
  }
});

test('legacy trailing-unit and two-pair email fixture stays minimal and anonymous', () => {
  const fixture = read('tests/fixtures/legacy-trailing-unit-email.html');
  assert.match(fixture, /<dt>生年月日<\/dt>[\s\S]*<select>[\s\S]*<\/select><\/span><label>年<\/label>/);
  assert.match(fixture, /<dt>E-mailアドレス<\/dt>[\s\S]*<input type="text">[\s\S]*＠[\s\S]*<input type="text">[\s\S]*＠[\s\S]*<input type="text">[\s\S]*＠[\s\S]*<input type="text">/);
  assert.match(fixture, /<dt>携帯アドレス<\/dt>[\s\S]*＠[\s\S]*＠/);
  assert.doesNotMatch(fixture, /[A-Za-z0-9.+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
});

test('legacy fixture stays minimal and contains only anonymous structure examples', () => {
  const fixture = read('tests/fixtures/test-form.html');

  for (const snippet of [
    '<label for="text">姓：</label><input name="kname1"',
    '<label for="text">セイ：</label><input name="yname1"',
    '<select name="ybirth">',
    'type="radio" value="1"><label for="text">男</label>',
    '<input name="gtel1" type="text">-<input name="gtel2" type="text">-<input name="gtel3"',
    '<input name="account1" type="text">＠<input name="domain1"',
    'name="mobileAddress" type="email"',
    'style="display: none"><option value="">選択してください</option>',
    '<div class="formbox">\n        <dt class="formbox01">漢字氏名</dt>',
    '<dd class="formbox02"><span><div><label for="text">姓：</label><div class="jqTransformInputWrapper"><div><div><input type="text">',
    '<dt class="formbox01">カナ氏名</dt>',
    '<dt class="formbox01">生年月日</dt>',
    '<dt class="formbox01">電話番号</dt>\n        <dd class="formbox02"><span><input name="gtel1" type="text"></span><label class="hyphen">-</label>',
    '<dt class="formbox01">携帯電話番号</dt>\n        <dd class="formbox02"><span><input name="kttel1" type="text"></span><label class="hyphen">-</label>',
    '<select style="display: none"><option value="">年</option><option value="2028">2028年</option></select><label for="text">年</label>',
    '<dt class="formbox01">E-mailアドレス確認</dt>',
  ]) {
    assert.ok(fixture.includes(snippet), `missing legacy structure: ${snippet}`);
  }

  assert.match(fixture, /addEventListener\('submit'/);
  assert.doesNotMatch(fixture, /[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/);
});
