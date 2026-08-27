const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { inferType, tableNameFromFile } = require('../backend/import/importer');
const { selectedSeries } = require('../scripts/sync-data');
const { checksumFor, extractCsvArchive, selectReleaseAssets } = require('../scripts/sync-f1db');

test('data sync accepts a unique subset of supported series', () => {
  assert.deepEqual(selectedSeries(['--series=f1,f3,f1']), ['f1', 'f3']);
  assert.throws(() => selectedSeries(['--series=f1,unknown']), /Unsupported series/);
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
  assert.equal(inferType('year', ['2025', '2026']), 'BIGINT');
  assert.equal(inferType('points', ['1.5', '2']), 'DECIMAL(20,6)');
});
