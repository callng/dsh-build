const assert = require('node:assert/strict');
const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { test, after } = require('node:test');
const childProcess = require('node:child_process');

const originalDirectory = process.cwd();
const directory = mkdtempSync(join(tmpdir(), 'dsh-publish-test-'));
process.chdir(directory);
mkdirSync('release');
after(() => {
  process.chdir(originalDirectory);
  rmSync(directory, { recursive: true, force: true });
});

const uploads = [];
const originalExec = childProcess.execFileSync;
childProcess.execFileSync = (...arguments_) => { uploads.push(arguments_); };
const publishRelease = require('./publish-release.cjs');
childProcess.execFileSync = originalExec;

const metadata = {
  tag: 'dsh-v0.2.3-alpha.2', name: 'v0.2.3-alpha.2', prerelease: true,
  body: '[中文](#cn) | [English](#en)\r\n\r\n- 更新 @author\r\nFull Changelog: https://example.com/a...b',
  installer: 'deepseek-harness-0.2.3-alpha.2-win-x64-unsigned.exe',
};
writeFileSync('release/upstream-release.json', JSON.stringify(metadata));
writeFileSync(join('release', metadata.installer), 'installer-fixture');

test('publication uploads the EXE into a draft before exposing the identical tag and changelog', async () => {
  const requests = [];
  await publishRelease({
    context: { repo: { owner: 'callng', repo: 'dsh-build' }, sha: 'workflow-commit' },
    core: { summary: { addLink() { return this; }, async write() {} } },
    github: { rest: { repos: {
      getReleaseByTag: async () => { throw Object.assign(new Error('Not Found'), { status: 404 }); },
      createRelease: async request => {
        assert.equal(uploads.length, 0);
        requests.push(request);
        return { data: { id: 42, draft: true } };
      },
      updateRelease: async request => {
        assert.equal(uploads.length, 1);
        requests.push(request);
        return { data: { html_url: 'https://github.com/callng/dsh-build/releases/tag/' + metadata.tag } };
      },
    } } },
  });
  assert.equal(requests[0].draft, true);
  assert.equal(requests[0].target_commitish, 'workflow-commit');
  assert.equal(requests[1].draft, false);
  assert.equal(requests[1].release_id, 42);
  for (const request of requests) {
    assert.equal(request.tag_name, metadata.tag);
    assert.equal(request.name, metadata.name);
    assert.equal(request.body, metadata.body);
    assert.equal(request.prerelease, true);
  }
  assert.equal(uploads[0][0], 'gh');
  assert.deepEqual(uploads[0][1], [
    'release', 'upload', metadata.tag, join(directory, 'release', metadata.installer),
    '--repo', 'callng/dsh-build', '--clobber',
  ]);
});
