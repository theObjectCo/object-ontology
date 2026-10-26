import { relative, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';

const root = new URL('../vendor/object-kit/', import.meta.url);
const source = JSON.parse(readFileSync(new URL('SOURCE.json', root), 'utf8'));
assert.match(source.revision, /^[a-f0-9]{40}$/);
const actual = readdirSync(root, { recursive: true, withFileTypes: true })
  .filter(entry => entry.isFile())
  .map(entry => relative(fileURLToPath(root), join(entry.parentPath, entry.name)).replaceAll('\\', '/'))
  .filter(file => !['SOURCE.json', 'README.md'].includes(file)).sort();
assert.deepEqual(actual, Object.keys(source.files).sort(), 'vendor file inventory differs from pinned source');
for (const file of actual) {
  const hash = createHash('sha256').update(readFileSync(new URL(file, root))).digest('hex');
  assert.equal(hash, source.files[file], `vendor drift: ${file}; update upstream and repin`);
}
console.log(`Object kit: ${actual.length} files verified at ${source.revision}`);
