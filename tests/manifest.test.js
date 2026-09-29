const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
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
  for (const section of ['基本情報', '所在地', '学校情報', '研究情報']) {
    assert.ok(popup.includes(section), `missing section: ${section}`);
  }
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
