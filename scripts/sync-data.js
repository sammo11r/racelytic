const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { importAll } = require('../backend/import/importer');
const { syncF1db } = require('./sync-f1db');

let pool;

function databasePool() {
  if (!pool) pool = require('../backend/db');
  return pool;
}

async function closePool() {
  if (pool) await pool.end();
}

const ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const BACKUP_ROOT = path.join(DATA_DIR, '.sync-backups');
const LOCK_PATH = path.join(DATA_DIR, '.data-sync.lock');
const ALLOWED_SERIES = ['f1', 'f2', 'f3', 'academy'];

function argumentValue(name, args = process.argv.slice(2)) {
  const argument = args.find(value => value.startsWith(`--${name}=`));
  return argument ? argument.slice(name.length + 3) : null;
}

function selectedSeries(args = process.argv.slice(2)) {
  const requested = (argumentValue('series', args) || process.env.DATA_SYNC_SERIES || ALLOWED_SERIES.join(','))
    .split(',').map(value => value.trim().toLowerCase()).filter(Boolean);
  const invalid = requested.filter(value => !ALLOWED_SERIES.includes(value));
  if (invalid.length) throw new Error(`Unsupported series: ${invalid.join(', ')}.`);
  return [...new Set(requested)];
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    console.log(`\n> ${path.basename(command)} ${args.join(' ')}`);
    const child = spawn(command, args, { cwd: ROOT, stdio: 'inherit', env: { ...process.env, ...options.env } });
    child.on('error', reject);
    child.on('exit', code => code === 0 ? resolve() : reject(new Error(`${args[0] || path.basename(command)} exited with code ${code}.`)));
  });
}

function dataFiles() {
  return fs.readdirSync(DATA_DIR).filter(file => /^(?:f[123]db|fadb)-.*\.csv$/i.test(file));
}

function createBackup(runId) {
  const directory = path.join(BACKUP_ROOT, runId);
  fs.mkdirSync(directory, { recursive: true });
  for (const file of dataFiles()) fs.copyFileSync(path.join(DATA_DIR, file), path.join(directory, file));
  const state = path.join(DATA_DIR, '.f1db-release.json');
  if (fs.existsSync(state)) fs.copyFileSync(state, path.join(directory, '.f1db-release.json'));
  return directory;
}

function restoreBackup(directory) {
  for (const file of dataFiles()) fs.rmSync(path.join(DATA_DIR, file));
  const state = path.join(DATA_DIR, '.f1db-release.json');
  if (fs.existsSync(state)) fs.rmSync(state);
  for (const file of fs.readdirSync(directory)) fs.copyFileSync(path.join(directory, file), path.join(DATA_DIR, file));
}

function trimBackups(retention = Number(process.env.DATA_SYNC_BACKUP_RETENTION || 5)) {
  if (!fs.existsSync(BACKUP_ROOT)) return;
  const directories = fs.readdirSync(BACKUP_ROOT, { withFileTypes: true })
    .filter(entry => entry.isDirectory()).map(entry => entry.name).sort().reverse();
  for (const directory of directories.slice(Math.max(0, retention))) {
    fs.rmSync(path.join(BACKUP_ROOT, directory), { recursive: true, force: true });
  }
}

function acquireFileLock(runId) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  try {
    const descriptor = fs.openSync(LOCK_PATH, 'wx');
    fs.writeFileSync(descriptor, `${JSON.stringify({ runId, pid: process.pid, startedAt: new Date().toISOString() })}\n`);
    fs.closeSync(descriptor);
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    let lock = {};
    try { lock = JSON.parse(fs.readFileSync(LOCK_PATH, 'utf8')); } catch {}
    const age = Date.now() - Date.parse(lock.startedAt || 0);
    if (age > 6 * 60 * 60 * 1000) {
      fs.rmSync(LOCK_PATH);
      return acquireFileLock(runId);
    }
    throw new Error(`Another data sync is active${lock.runId ? ` (${lock.runId})` : ''}.`);
  }
}

function releaseFileLock(runId) {
  try {
    const lock = JSON.parse(fs.readFileSync(LOCK_PATH, 'utf8'));
    if (lock.runId === runId) fs.rmSync(LOCK_PATH);
  } catch {}
}

async function ensureRunTable() {
  await databasePool().query(`
    CREATE TABLE IF NOT EXISTS app_data_sync_runs (
      id VARCHAR(36) PRIMARY KEY,
      started_at DATETIME(3) NOT NULL,
      finished_at DATETIME(3) NULL,
      status VARCHAR(20) NOT NULL,
      series VARCHAR(100) NOT NULL,
      source_versions LONGTEXT NULL,
      summary LONGTEXT NULL,
      error_message TEXT NULL,
      INDEX idx_data_sync_started (started_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

async function startRun(id, series) {
  await databasePool().query(
    'INSERT INTO app_data_sync_runs (id, started_at, status, series) VALUES (?, CURRENT_TIMESTAMP(3), ?, ?)',
    [id, 'running', series.join(',')]
  );
}

async function finishRun(id, status, sourceVersions, summary, error) {
  await databasePool().query(
    'UPDATE app_data_sync_runs SET finished_at=CURRENT_TIMESTAMP(3), status=?, source_versions=?, summary=?, error_message=? WHERE id=?',
    [status, JSON.stringify(sourceVersions || {}), JSON.stringify(summary || {}), error ? String(error.message || error).slice(0, 65000) : null, id]
  );
}

async function showStatus() {
  await ensureRunTable();
  const rows = await databasePool().query('SELECT id, started_at, finished_at, status, series, source_versions, summary, error_message FROM app_data_sync_runs ORDER BY started_at DESC LIMIT 10');
  console.table(rows.map(row => ({
    id: row.id, started: row.started_at, finished: row.finished_at, status: row.status,
    series: row.series, versions: row.source_versions, error: row.error_message
  })));
}

async function refreshSources(series, year, force) {
  const versions = {};
  if (series.includes('f1')) {
    const result = await syncF1db({ force });
    versions.f1 = result.version;
  }
  if (series.includes('f2')) {
    if (year === 2026 && process.env.DATA_SYNC_F2_SOURCE !== 'motorsportstats') {
      await run(process.execPath, ['scripts/import-f2-2026-fia.js', '--csv-only']);
    } else {
      const common = [`--year=${year}`, '--csv-only', '--headless'];
      await run(process.execPath, ['scripts/import-f2-results.js', ...common]);
      await run(process.execPath, ['scripts/import-f2-standings.js', ...common]);
    }
    versions.f2 = String(year);
  }
  if (series.includes('f3')) {
    if (year === 2026 && process.env.DATA_SYNC_F3_SOURCE !== 'motorsportstats') {
      await run(process.execPath, ['scripts/import-f3-2026-fia.js', '--csv-only']);
    } else {
      await run(process.execPath, ['scripts/collect-f3-data.js', '--headless', '--refresh-current']);
    }
    versions.f3 = String(year);
  }
  if (series.includes('academy')) {
    await run(process.execPath, ['scripts/collect-academy-data.js']);
    versions.academy = String(year);
  }
  return versions;
}

async function validateSources(series) {
  await run(process.execPath, ['--test']);
  for (const name of series.filter(value => value !== 'f1')) {
    await run(process.execPath, ['scripts/audit-f3-data.js', `--series=${name}`, '--csv-only']);
  }
}

async function main(args = process.argv.slice(2)) {
  if (args.includes('--status')) {
    try { await showStatus(); }
    finally { await closePool(); }
    return;
  }
  const series = selectedSeries(args);
  const year = Number(argumentValue('year', args) || new Date().getUTCFullYear());
  const dryRun = args.includes('--dry-run');
  const skipFetch = args.includes('--skip-fetch') || dryRun;
  const force = args.includes('--force');
  const noBackup = args.includes('--no-backup');
  const runId = crypto.randomUUID();
  const backupId = `${new Date().toISOString().replace(/[:.]/g, '-')}-${runId.slice(0, 8)}`;
  let backupDirectory;
  let runRecorded = false;
  const sourceVersions = {};

  acquireFileLock(runId);
  try {
    await ensureRunTable();
    await startRun(runId, series);
    runRecorded = true;
    if (!noBackup && !dryRun) backupDirectory = createBackup(backupId);
    if (!skipFetch) Object.assign(sourceVersions, await refreshSources(series, year, force));
    await validateSources(series);
    if (dryRun) {
      await finishRun(runId, 'validated', sourceVersions, { dryRun: true }, null);
      console.log('Dry run complete: source data passed validation; database was not changed.');
      return;
    }
    const imported = await importAll();
    await finishRun(runId, 'succeeded', sourceVersions, imported, null);
    trimBackups();
    console.log(`Data sync ${runId} completed successfully.`);
  } catch (error) {
    if (backupDirectory) {
      try { restoreBackup(backupDirectory); }
      catch (restoreError) { error.message += ` CSV restore also failed: ${restoreError.message}`; }
    }
    if (runRecorded) {
      try { await finishRun(runId, 'failed', sourceVersions, {}, error); }
      catch (recordError) { console.error('Could not record failed sync:', recordError); }
    }
    throw error;
  } finally {
    releaseFileLock(runId);
    await closePool();
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = { argumentValue, selectedSeries, trimBackups };
