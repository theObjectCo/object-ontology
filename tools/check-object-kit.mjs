import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';

const root = new URL('../vendor/object-kit/', import.meta.url);
const source = JSON.parse(readFileSync(new URL('SOURCE.json', root), 'utf8'));
assert.match(source.revision, /^[a-f0-9]{40}$/);
const actual = readdirSync(new URL('cloud/', root)).map(name => `cloud/${name}`).sort();
assert.deepEqual(actual, Object.keys(source.files).sort(), 'vendor file inventory differs from pinned source');
for (const file of actual) {
  const hash = createHash('sha256').update(readFileSync(new URL(file, root))).digest('hex');
  assert.equal(hash, source.files[file], `vendor drift: ${file}; update upstream and repin`);
}
console.log(`Object kit: ${actual.length} files verified at ${source.revision}`);
