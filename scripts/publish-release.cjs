const { readFileSync, renameSync, statSync } = require('node:fs');
const { execFileSync } = require('node:child_process');
const { resolve } = require('node:path');

module.exports = async function publishRelease({ github, context, core }) {
  const metadata = JSON.parse(readFileSync('release/upstream-release.json', 'utf8'));
  const sourceInstaller = resolve('release', metadata.sourceInstaller);
  const installer = resolve('release', metadata.installer);
  if (statSync(sourceInstaller).size === 0) throw new Error('The Windows installer is empty.');
  renameSync(sourceInstaller, installer);

  let release;
  try {
    ({ data: release } = await github.rest.repos.getReleaseByTag({
      ...context.repo, tag: metadata.tag,
    }));
  } catch (error) {
    if (error.status !== 404) throw error;
  }
  const fields = {
    ...context.repo,
    tag_name: metadata.tag,
    name: metadata.name,
    body: metadata.body,
    prerelease: metadata.prerelease,
  };
  if (!release) {
    ({ data: release } = await github.rest.repos.createRelease({
      ...fields, target_commitish: context.sha, draft: true,
    }));
  }

  // The tag becomes a published version only after its installer has uploaded.
  execFileSync('gh', [
    'release', 'upload', metadata.tag, installer,
    '--repo', `${context.repo.owner}/${context.repo.repo}`, '--clobber',
  ], { stdio: 'inherit' });
  const { data: published } = await github.rest.repos.updateRelease({
    ...fields, release_id: release.id, draft: false,
  });
  await core.summary.addLink(`Published ${metadata.tag}`, published.html_url).write();
};
