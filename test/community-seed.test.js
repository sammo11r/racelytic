const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'scripts/seed-community.js'), 'utf8');
const packageJson = require('../package.json');

test('community seed is repeatable and available as an explicit command', () => {
  assert.equal(packageJson.scripts['seed:community'], 'node scripts/seed-community.js');
  assert.match(source, /ON DUPLICATE KEY UPDATE/g);
  assert.match(source, /const DRY_RUN = process\.argv\.includes\('--dry-run'\)/);
  assert.match(source, /if \(DRY_RUN\) await connection\.rollback\(\)/);
});

test('starter creations are transparently owned by a non-login Racelytic curator', () => {
  assert.match(source, /CURATOR_USERNAME = 'racelytic-starters'/);
  assert.match(source, /display_name, password_hash/);
  assert.match(source, /'Racelytic', 'disabled\$curated-community-content'/);
  assert.match(source, /reserved Racelytic starter account identity is already in use/);
});

test('starter content represents every supported championship', () => {
  for (const series of ['f1', 'f2', 'f3', 'academy']) {
    assert.match(source, new RegExp(`series: '${series}'`));
  }
  assert.match(source, /finishers: '10000000-/);
  assert.match(source, /academy: '20000000-/);
  assert.match(source, /academy: '30000000-/);
});
