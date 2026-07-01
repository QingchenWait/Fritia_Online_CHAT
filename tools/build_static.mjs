import { cp, mkdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');

const entries = [
  'index.html',
  'manifest.webmanifest',
  'sw.js',
  'src'
];

async function copyIfExists(relativePath) {
  const source = path.join(root, relativePath);
  const target = path.join(dist, relativePath);
  try {
    await stat(source);
  } catch {
    return;
  }
  await mkdir(path.dirname(target), { recursive: true });
  await cp(source, target, { recursive: true, force: true });
}

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

for (const entry of entries) {
  await copyIfExists(entry);
}

await writeFile(path.join(dist, '.nojekyll'), '');

console.log(`Static site built to ${path.relative(root, dist) || dist}`);
