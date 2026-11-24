const assert = require('node:assert/strict');
const { mkdtempSync, readFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { test, after } = require('node:test');
const checkUpstream = require('./check-upstream.cjs');

const originalDirectory = process.cwd();
const directory = mkdtempSync(join(tmpdir(), 'dsh-check-test-'));
process.chdir(directory);
after(() => {
  process.chdir(originalDirectory);
  rmSync(directory, { recursive: true, force: true });
});

const tag = 'dsh-v0.2.3-alpha.2';
const installer = '0.2.3-alpha.2-win-x64.exe';
const notes = '[中文](#cn) | [English](#en)\r\n\r\n- 更新 @author\r\nFull Changelog: https://github.com/deepseek-ai/deepseek-harness/compare/a...b';

function fixture({ existing, upstreamStatus, version = '0.2.3-alpha.2', event = 'push' } = {}) {
  const outputs = {};
  let tagRequests = 0;
  const summary = { addRaw() { return this; }, async write() {} };
  return {
    outputs,
    tagRequests: () => tagRequests,
    context: { eventName: event, repo: { owner: 'callng', repo: 'dsh-build' } },
    core: { setOutput: (name, value) => { outputs[name] = value; }, summary },
    github: { rest: {
      repos: {
        listTags: async () => {
          tagRequests++;
          return { data: [
            { name: 'vendor-v9.0.0', commit: { sha: 'vendor' } },
            { name: tag, commit: { sha: 'upstream-commit' } },
            { name: 'dsh-v0.2.3-alpha.1', commit: { sha: 'older-commit' } },
          ] };
        },
        getReleaseByTag: async ({ owner, tag: requestedTag }) => {
          assert.equal(requestedTag, tag);
          if (owner === 'deepseek-ai') {
            if (upstreamStatus) throw Object.assign(new Error('API failure'), { status: upstreamStatus });
            return { data: { name: 'v0.2.3-alpha.2', body: notes, prerelease: true, draft: false } };
          }
          if (!existing) throw Object.assign(new Error('Not Found'), { status: 404 });
          return { data: existing };
        },
        getContent: async ({ ref }) => {
          assert.equal(ref, 'upstream-commit');
          return { data: { content: Buffer.from(JSON.stringify({
            version, engines: { node: '^24.22.3 || >=26.13.1' },
          })).toString('base64') } };
        },
      },
    } },
  };
}

test('the first run builds the newest DSH prerelease and preserves all upstream notes', async () => {
  const input = fixture();
  await checkUpstream(input);
  assert.deepEqual(input.outputs, {
    build: 'true', tag, sha: 'upstream-commit', node: '^24.22.3 || >=26.13.1',
  });
  const metadata = JSON.parse(readFileSync('upstream-release.json', 'utf8'));
  assert.equal(metadata.body, notes);
  assert.equal(metadata.name, 'v0.2.3-alpha.2');
  assert.equal(metadata.prerelease, true);
  assert.equal(metadata.installer, installer);
  assert.equal(metadata.sourceInstaller, 'deepseek-harness-0.2.3-alpha.2-win-x64-unsigned.exe');
});

test('a published installer prevents a duplicate build', async () => {
  const input = fixture({ existing: {
    draft: false, assets: [{ name: installer, state: 'uploaded', size: 123 }],
  } });
  await checkUpstream(input);
  assert.equal(input.outputs.build, 'false');
});

test('drafts and releases without the installer remain eligible for recovery', async () => {
  for (const existing of [
    { draft: true, assets: [{ name: installer, state: 'uploaded', size: 123 }] },
    { draft: false, assets: [] },
  ]) {
    const input = fixture({ existing });
    await checkUpstream(input);
    assert.equal(input.outputs.build, 'true');
  }
});

test('a tag awaiting its release notes is deferred, while API outages fail visibly', async () => {
  const pending = fixture({ upstreamStatus: 404 });
  await checkUpstream(pending);
  assert.equal(pending.outputs.build, 'false');
  await assert.rejects(checkUpstream(fixture({ upstreamStatus: 500 })), /API failure/);
});

test('a tag pointing to a different package version is rejected before building', async () => {
  await assert.rejects(checkUpstream(fixture({ version: '0.2.3-alpha.1' })), /must match package.json/);
});

test('scheduled runs check upstream without an additional time gate or workflow-run API request', async () => {
  const input = fixture({ event: 'schedule' });
  await checkUpstream(input);
  assert.equal(input.tagRequests(), 1);
  assert.equal(input.outputs.build, 'true');
});
