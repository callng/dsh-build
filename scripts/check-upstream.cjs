const { writeFileSync } = require('node:fs');

module.exports = async function checkUpstream({ github, context, core }) {
  core.setOutput('build', 'false');

  if (context.eventName === 'schedule') {
    const { data: run } = await github.rest.actions.getWorkflowRun({
      ...context.repo, run_id: context.runId,
    });
    const twoHourSlot = Math.floor(Date.parse(run.created_at) / (2 * 60 * 60 * 1000));
    if (twoHourSlot % 5 !== 0) {
      await core.summary.addRaw('Outside the ten-hour upstream check slot.').write();
      return;
    }
  }

  const upstream = { owner: 'deepseek-ai', repo: 'deepseek-harness' };
  const { data: tags } = await github.rest.repos.listTags({ ...upstream, per_page: 100 });
  const tag = tags.find(entry => /^dsh-v\d/.test(entry.name));
  if (!tag) throw new Error('The upstream repository has no dsh-v* tag.');

  let release;
  try {
    ({ data: release } = await github.rest.repos.getReleaseByTag({
      ...upstream, tag: tag.name,
    }));
  } catch (error) {
    if (error.status !== 404) throw error;
    await core.summary.addRaw(`${tag.name} has no release notes yet; the next check will retry.`).write();
    return;
  }
  if (release.draft) {
    await core.summary.addRaw(`${tag.name} is still a draft upstream release.`).write();
    return;
  }

  const { data: file } = await github.rest.repos.getContent({
    ...upstream, path: 'package.json', ref: tag.commit.sha,
  });
  const manifest = JSON.parse(Buffer.from(file.content, 'base64').toString('utf8'));
  if (tag.name !== `dsh-v${manifest.version}` || !manifest.engines?.node) {
    throw new Error('The upstream tag must match package.json and declare its Node.js requirement.');
  }
  const installer = `deepseek-harness-${manifest.version}-win-x64-unsigned.exe`;

  let existing;
  try {
    ({ data: existing } = await github.rest.repos.getReleaseByTag({
      ...context.repo, tag: tag.name,
    }));
  } catch (error) {
    if (error.status !== 404) throw error;
  }
  if (existing && !existing.draft && existing.assets.some(asset =>
    asset.name === installer && asset.state === 'uploaded' && asset.size > 0)) {
    await core.summary.addRaw(`${tag.name} already has a published Windows installer; no build is needed.`).write();
    return;
  }

  writeFileSync('upstream-release.json', JSON.stringify({
    tag: tag.name,
    name: release.name,
    body: release.body,
    prerelease: release.prerelease,
    installer,
  }, null, 2) + '\n');
  core.setOutput('tag', tag.name);
  core.setOutput('sha', tag.commit.sha);
  core.setOutput('node', manifest.engines.node);
  core.setOutput('build', 'true');
  await core.summary.addRaw(`Build ${tag.name} from upstream commit ${tag.commit.sha}.`).write();
};
