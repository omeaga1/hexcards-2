// Installs Arc UI (https://uiarc.dev, MIT) items from its public shadcn-style registry
// without the shadcn CLI. Usage: npm run arc:add -- button radio-cards arc-skill
// Components land in apps/desktop/src/components/arc/<name>/ (Arc's "@components/arc/..." targets,
// which import each other with relative paths). The agent skill ("~/.claude/...") lands at the repo root.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const COMPONENTS = join(REPO, 'apps', 'desktop', 'src', 'components');
const REGISTRY = 'https://uiarc.dev/r';

const names = process.argv.slice(2);
if (names.length === 0) {
  console.error('Usage: npm run arc:add -- <component> [...]');
  process.exit(1);
}

const seen = new Set();
const npmDeps = new Set();

async function add(ref) {
  const url = ref.startsWith('http') ? ref : `${REGISTRY}/${ref}.json`;
  if (seen.has(url)) return;
  seen.add(url);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const item = await res.json();
  if (item.meta?.tier && item.meta.tier !== 'free') throw new Error(`${item.name} is not a free Arc item.`);
  for (const dep of item.registryDependencies ?? []) await add(dep);
  for (const dep of item.dependencies ?? []) npmDeps.add(dep);
  for (const file of item.files ?? []) {
    const [root, rel] = file.target?.startsWith('@components/')
      ? [COMPONENTS, file.target.slice('@components/'.length)]
      : file.target?.startsWith('~/.claude/')
        ? [REPO, file.target.slice(2)]
        : [];
    if (!root) throw new Error(`${item.name}: unexpected target ${file.target}`);
    const out = resolve(root, rel);
    if (!out.startsWith(root)) throw new Error(`${item.name}: target escapes project: ${file.target}`);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, file.content);
    console.log(`  ${out.slice(REPO.length + 1)}`);
  }
}

for (const name of names) await add(name);
if (npmDeps.size) console.log(`\nnpm dependencies (install in apps/desktop): ${[...npmDeps].join(' ')}`);
