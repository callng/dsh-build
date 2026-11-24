const { readFileSync, writeFileSync } = require('node:fs');
const { resolve } = require('node:path');

const root = resolve(process.argv[2]);
const adaptations = [
  [
    'apps/desktop/scripts/desktop-package-environment.mjs',
    "if (target.platform !== 'darwin' || !options.unsigned) resolveDesktopPolicyEnvironment(environment)",
    'if (!options.unsigned) resolveDesktopPolicyEnvironment(environment)',
  ],
  [
    'apps/desktop/scripts/electron-builder-config.mjs',
    'const policy = packagesMacOS && unsigned ? undefined : resolveDesktopPolicyEnvironment(env)',
    'const policy = unsigned ? undefined : resolveDesktopPolicyEnvironment(env)',
  ],
];

// Apply only the two unsigned-policy changes; stop if upstream changes these statements.
for (const [filename, before, after] of adaptations) {
  const path = resolve(root, filename);
  const source = readFileSync(path, 'utf8');
  if (source.split(before).length !== 2) {
    throw new Error(`Upstream packaging changed in ${filename}; review the unsigned-policy adaptation.`);
  }
  writeFileSync(path, source.replace(before, after));
}
writeFileSync(resolve(root, 'apps/desktop/.env.windows'), 'DSH_DESKTOP_APP_ID=com.deepseek.dsh\n');
