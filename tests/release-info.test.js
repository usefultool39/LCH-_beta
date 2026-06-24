const assert = require('node:assert/strict');
const test = require('node:test');
const {
  artifactNames,
  normalizeTag,
  releaseNotes,
  validateReadme,
  validateVersions
} = require('../scripts/release-info');

test('release metadata is internally consistent', () => {
  assert.equal(validateVersions(), '0.15.2');
  assert.equal(validateReadme(), true);
});

test('artifact names match the public release contract', () => {
  assert.deepEqual(artifactNames('0.15.2'), [
    'Lan-Control-Hub-0.15.2-win-x64-portable.exe',
    'Lan-Control-Hub-0.15.2-win-x64-setup.exe',
    'Lan-Control-Hub-0.15.2-mac-x64.zip',
    'Lan-Control-Hub-0.15.2-mac-arm64.zip'
  ]);
});

test('release notes are read from the changelog', () => {
  assert.equal(normalizeTag('refs/tags/v0.15.2'), '0.15.2');
  assert.match(releaseNotes(process.cwd(), 'v0.15.2'), /Downloads/);
});
