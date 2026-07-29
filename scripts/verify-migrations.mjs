import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const drizzleDirectory = path.join(root, 'drizzle');
const journalPath = path.join(drizzleDirectory, 'meta', '_journal.json');

assert.ok(fs.existsSync(journalPath), 'Drizzle journal is missing.');

const journal = JSON.parse(fs.readFileSync(journalPath, 'utf8'));

assert.equal(
  journal.dialect,
  'postgresql',
  'Drizzle journal must use PostgreSQL.',
);
assert.ok(
  Array.isArray(journal.entries) && journal.entries.length > 0,
  'Drizzle journal has no entries.',
);

const tags = new Set();

for (const [position, entry] of journal.entries.entries()) {
  assert.equal(
    entry.idx,
    position,
    `Migration index ${entry.idx} is not contiguous at position ${position}.`,
  );
  assert.match(
    entry.tag,
    /^\d{4}_[a-z0-9_]+$/i,
    `Invalid migration tag: ${entry.tag}`,
  );
  assert.ok(!tags.has(entry.tag), `Duplicate migration tag: ${entry.tag}`);
  tags.add(entry.tag);

  const sqlPath = path.join(drizzleDirectory, `${entry.tag}.sql`);

  assert.ok(
    fs.existsSync(sqlPath),
    `Journal entry has no SQL file: ${entry.tag}.sql`,
  );
  assert.ok(
    fs.statSync(sqlPath).size > 0,
    `Migration SQL file is empty: ${entry.tag}.sql`,
  );
}

const sqlTags = fs
  .readdirSync(drizzleDirectory)
  .filter((name) => /^\d{4}_.+\.sql$/i.test(name))
  .map((name) => name.replace(/\.sql$/i, ''));

for (const tag of sqlTags) {
  assert.ok(
    tags.has(tag),
    `Migration SQL file is not registered in the journal: ${tag}.sql`,
  );
}

console.log(
  `Migration integrity passed: ${journal.entries.length} journal entries and ${sqlTags.length} SQL files.`,
);
