// Sets the app version everywhere it's recorded, so the release tag, installer and updater agree.
// Usage: npm run version -- 0.2.0
import { readFileSync, writeFileSync } from 'node:fs';

const version = process.argv[2];
if (!/^\d+\.\d+\.\d+$/.test(version ?? '')) {
  console.error('Usage: npm run version -- <major.minor.patch>, e.g. 0.2.0');
  process.exit(1);
}

const json = (path, set) => {
  const data = JSON.parse(readFileSync(path, 'utf8'));
  set(data);
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n');
};
json('apps/desktop/src-tauri/tauri.conf.json', (c) => (c.version = version));
json('apps/desktop/package.json', (p) => (p.version = version));

const cargo = 'apps/desktop/src-tauri/Cargo.toml';
writeFileSync(cargo, readFileSync(cargo, 'utf8').replace(/^version = ".*"$/m, `version = "${version}"`));

console.log(`Version set to ${version}. Commit, then: git tag v${version} && git push origin v${version}`);
