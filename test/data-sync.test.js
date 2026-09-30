const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { importAll, inferType, selectedFilePrefixes, tableNameFromFile } = require('../backend/import/importer');
const { canonicalizeConstructorChronology } = require('../backend/constructor-lineage-data');
const { isVersionedDataFile, selectedSeries } = require('../scripts/sync-data');
const { checksumFor, extractCsvArchive, selectReleaseAssets } = require('../scripts/sync-f1db');

test('supported database update commands rebuild ratings for every published series', () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
  const syncSource = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'sync-data.js'), 'utf8');
  assert.equal(packageJson.scripts.postimport, 'npm run rebuild:ratings');
  assert.equal(packageJson.scripts['postimport:formula-e'], 'npm run rebuild:ratings -- --series=fe');
  assert.equal(packageJson.scripts['postimport:wec'], 'npm run rebuild:ratings -- --series=wec');
  assert.match(syncSource, /for \(const name of series\) await run\(process\.execPath, \['scripts\/rebuild-ratings\.js', `--series=\$\{name\}`\]\)/);
  assert.ok(syncSource.indexOf("scripts/rebuild-ratings.js") < syncSource.indexOf("finishRun(runId, 'succeeded'"));
  assert.match(syncSource, /const archivePublished = published \|\| error\.archivePublished/);
  assert.match(syncSource, /if \(backupDirectory && !archivePublished\) \{/);
});

test('data sync accepts a unique subset of supported series', () => {
  assert.deepEqual(selectedSeries(['--series=f1,f3,f1']), ['f1', 'f3']);
  assert.deepEqual(selectedSeries(['--series=fe,fe']), ['fe']);
  assert.deepEqual(selectedSeries(['--series=wec,wec']), ['wec']);
  assert.throws(() => selectedSeries(['--series=f1,unknown']), /Unsupported series/);
  assert.throws(() => selectedSeries(['--series=']), /Select at least one series/);
});

test('data sync backups cover every versioned championship archive', () => {
  for (const file of ['f1db-races.csv', 'f2db-sessions.csv', 'f3db-drivers.csv', 'fadb-seasons.csv', 'fedb-races.csv', 'wecdb-standings.csv']) {
    assert.equal(isVersionedDataFile(file), true, file);
  }
  assert.equal(isVersionedDataFile('wec-data-contract.json'), false);
  assert.equal(isVersionedDataFile('.data-sync.lock'), false);
});

test('F1DB release selection requires the official CSV archive', () => {
  const selected = selectReleaseAssets({
    tag_name: 'v2026.12.0',
    assets: [
      { name: 'f1db-csv.zip', browser_download_url: 'https://example.test/f1db.zip', digest: `sha256:${'a'.repeat(64)}` },
      { name: 'checksums_sha256.txt', browser_download_url: 'https://example.test/checksums' }
    ]
  });
  assert.equal(selected.tag, 'v2026.12.0');
  assert.equal(checksumFor(selected.csv, ''), 'a'.repeat(64));
  assert.throws(() => selectReleaseAssets({ tag_name: 'v1', assets: [] }), /no f1db-csv/);
});

test('checksum files are parsed when GitHub does not provide an asset digest', () => {
  const asset = { name: 'f1db-csv.zip' };
  assert.equal(checksumFor(asset, `${'b'.repeat(64)}  f1db-csv.zip\n`), 'b'.repeat(64));
});

test('F1DB extraction publishes only CSV files and requires the core dataset', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'racelytic-sync-test-'));
  try {
    const archive = path.join(root, 'f1db.zip');
    const output = path.join(root, 'output');
    fs.mkdirSync(output);
    const fixture = 'UEsDBBQAAAgIAERAG10k5eneEwAAABEAAAAZAAAAcmVsZWFzZS9mMWRiLWNpcmN1aXRzLmNzdstM0clLzE2NyTPUCUktLonJAwBQSwMEFAAACAgAREAbXSTl6d4TAAAAEQAAAB0AAAByZWxlYXNlL2YxZGItY29uc3RydWN0b3JzLmNzdstM0clLzE2NyTPUCUktLonJAwBQSwMEFAAACAgAREAbXSTl6d4TAAAAEQAAABgAAAByZWxlYXNlL2YxZGItZHJpdmVycy5jc3bLTNHJS8xNjckz1AlJLS6JyQMAUEsDBBQAAAgIAERAG10k5eneEwAAABEAAAAWAAAAcmVsZWFzZS9mMWRiLXJhY2VzLmNzdstM0clLzE2NyTPUCUktLonJAwBQSwMEFAAACAgAREAbXUO/pqMEAAAAAgAAABMAAAByZWxlYXNlL2lnbm9yZS5qc29uq64FAFBLAQIUChQAAAgIAERAG10k5eneEwAAABEAAAAZAAAAAAAAAAAAAACkgQAAAAByZWxlYXNlL2YxZGItY2lyY3VpdHMuY3N2UEsBAhQKFAAACAgAREAbXSTl6d4TAAAAEQAAAB0AAAAAAAAAAAAAAKSBSgAAAHJlbGVhc2UvZjFkYi1jb25zdHJ1Y3RvcnMuY3N2UEsBAhQKFAAACAgAREAbXSTl6d4TAAAAEQAAABgAAAAAAAAAAAAAAKSBmAAAAHJlbGVhc2UvZjFkYi1kcml2ZXJzLmNzdlBLAQIUChQAAAgIAERAG10k5eneEwAAABEAAAAWAAAAAAAAAAAAAACkgeEAAAByZWxlYXNlL2YxZGItcmFjZXMuY3N2UEsBAhQKFAAACAgAREAbXUO/pqMEAAAAAgAAABMAAAAAAAAAAAAAAKSBKAEAAHJlbGVhc2UvaWdub3JlLmpzb25QSwUGAAAAAAUABQBdAQAAXQEAAAAA';
    fs.writeFileSync(archive, Buffer.from(fixture, 'base64'));
    const files = extractCsvArchive(archive, output);
    assert.equal(files.length, 4);
    assert.equal(fs.existsSync(path.join(output, 'ignore.json')), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('safe importer maps series names and retains stable inferred types', () => {
  assert.equal(tableNameFromFile('f1db-races.csv'), 'races');
  assert.equal(tableNameFromFile('f2db-session-results.csv'), 'f2_session_results');
  assert.equal(tableNameFromFile('fadb-drivers.csv'), 'fa_drivers');
  assert.equal(tableNameFromFile('fedb-season-manufacturer-standings.csv'), 'fe_season_manufacturer_standings');
  assert.equal(inferType('year', ['2025', '2026']), 'BIGINT');
  assert.equal(inferType('points', ['1.5', '2']), 'DECIMAL(20,6)');
  assert.deepEqual([...selectedFilePrefixes('fe')], ['fedb-']);
  assert.deepEqual([...selectedFilePrefixes(['f2', 'academy'])], ['f2db-', 'fadb-']);
  assert.throws(() => selectedFilePrefixes('unknown'), /Unsupported import series/);
  const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
  assert.equal(packageJson.scripts['import:formula-e'], 'node backend/import/all.js --series=fe');
  assert.equal(packageJson.scripts['import:wec'], 'node backend/import/all.js --series=wec');
});

test('constructor chronology import collapses repeated parent copies into one chain', () => {
  const rows = ['a', 'b'].flatMap(parentConstructorId => [
    { parentConstructorId, positionDisplayOrder: '1', constructorId: 'a', yearFrom: '2000', yearTo: '2001' },
    { parentConstructorId, positionDisplayOrder: '2', constructorId: 'b', yearFrom: '2002', yearTo: '' }
  ]);
  const normalized = canonicalizeConstructorChronology(rows);
  assert.equal(normalized.length, 2);
  assert.deepEqual(normalized.map(row => row.id), ['b-1', 'b-2']);
});

function importConnection({ failOldCleanup = false, failVerification = false, failRollback = false } = {}) {
  const tables = new Map([['f2_drivers', 1]]);
  let published = false;
  const connection = {
    release() {},
    async batch(sql, rows) {
      const table = sql.match(/INSERT INTO `([^`]+)`/)[1];
      tables.set(table, (tables.get(table) || 0) + rows.length);
    },
    async query(sql) {
      if (sql.startsWith('SELECT GET_LOCK')) return [{ acquired: 1 }];
      if (sql.startsWith('SELECT RELEASE_LOCK')) return [];
      if (sql === 'SHOW TABLES') return [...tables.keys()].map(name => ({ table: name }));
      if (sql.startsWith('SELECT COUNT(*)')) {
        const table = sql.match(/FROM `([^`]+)`/)[1];
        return [{ count: failVerification && published && table === 'f2_drivers' ? 0 : tables.get(table) }];
      }
      if (sql.startsWith('CREATE TABLE')) { tables.set(sql.match(/CREATE TABLE `([^`]+)`/)[1], 0); return []; }
      if (sql.startsWith('RENAME TABLE')) {
        if (failRollback && sql.includes('__failed_')) throw new Error('rollback unavailable');
        published = true;
        for (const [, from, to] of sql.matchAll(/`([^`]+)` TO `([^`]+)`/g)) {
          tables.set(to, tables.get(from));
          tables.delete(from);
        }
        return [];
      }
      if (sql.startsWith('DROP TABLE IF EXISTS')) {
        if (failOldCleanup && sql.includes('__old_')) throw new Error('old table cleanup unavailable');
        for (const [, table] of sql.matchAll(/`([^`]+)`/g)) tables.delete(table);
        return [];
      }
      throw new Error(`Unexpected query: ${sql}`);
    }
  };
  return { pool: { async getConnection() { return connection; } }, tables };
}

test('a post-publication cleanup failure keeps the new archive published', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'racelytic-import-test-'));
  fs.writeFileSync(path.join(directory, 'f2db-drivers.csv'), 'id,name\na,Driver A\n');
  const { pool, tables } = importConnection({ failOldCleanup: true });
  const originalError = console.error;
  console.error = () => {};
  try {
    assert.deepEqual(await importAll({ dataDirectory: directory, series: 'f2', pool }), { tables: 1, rows: 1 });
    assert.equal(tables.get('f2_drivers'), 1);
    assert.equal([...tables.keys()].some(name => name.startsWith('__old_')), true);
  } finally {
    console.error = originalError;
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('a failed publication rollback signals that CSV files must be retained', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'racelytic-import-test-'));
  fs.writeFileSync(path.join(directory, 'f2db-drivers.csv'), 'id,name\na,Driver A\n');
  const { pool, tables } = importConnection({ failVerification: true, failRollback: true });
  try {
    await assert.rejects(importAll({ dataDirectory: directory, series: 'f2', pool }), error => {
      assert.equal(error.archivePublished, true);
      assert.match(error.message, /Database rollback failed/);
      return true;
    });
    assert.equal(tables.get('f2_drivers'), 1);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
