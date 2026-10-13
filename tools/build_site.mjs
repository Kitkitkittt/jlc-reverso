import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const dist = join(root, 'dist');
// Only this generated directory is replaced; evidence, source and credentials stay outside it.
await rm(dist, { recursive: true, force: true });
await mkdir(join(dist, 'data'), { recursive: true });
for (const path of ['index.html', 'model', 'exports', 'renders']) {
  await cp(join(root, path), join(dist, path), {
    recursive: true,
    filter: source => !source.split('/').at(-1).startsWith('check-'),
  });
}
await cp(join(root, 'data/scene-spec.json'), join(dist, 'data/scene-spec.json'));
// Publish factual provenance only, never private assets or filesystem locators.
const records = JSON.parse(await readFile(join(root, 'data/sources.json'), 'utf8'));
const fields = ['id', 'title', 'url', 'type', 'status', 'locator', 'rights', 'scope', 'identity_caveat', 'version_caveat', 'geometry_caveat'];
await writeFile(join(dist, 'data/sources.json'), JSON.stringify({ sources: records.sources.map(record =>
  Object.fromEntries(fields.filter(field => field in record).map(field => [field, record[field]]))) }));
await mkdir(join(dist, 'vendor'), { recursive: true });
for (const path of ['build', 'examples/jsm']) {
  await cp(join(root, 'node_modules/three', path), join(dist, 'vendor/three', path), { recursive: true });
}
await cp(join(root, 'node_modules/three/LICENSE'), join(dist, 'vendor/three/LICENSE'));
const html = await readFile(join(dist, 'model/index.html'), 'utf8');
await writeFile(join(dist, 'model/index.html'), html.replaceAll('../node_modules/three/', '../vendor/three/'));
console.log('Static site ready in dist/; source evidence and credentials are not published.');
