const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { pipeline } = require('stream/promises');

const ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const STATE_PATH = path.join(DATA_DIR, '.f1db-release.json');
const RELEASE_URL = 'https://api.github.com/repos/f1db/f1db/releases/latest';
const REQUIRED_FILES = ['f1db-races.csv', 'f1db-drivers.csv', 'f1db-constructors.csv', 'f1db-circuits.csv'];

function requestHeaders() {
  const headers = {
    accept: 'application/vnd.github+json',
    'user-agent': 'Racelytic data synchronizer/1.0',
    'x-github-api-version': '2022-11-28'
  };
  if (process.env.GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  return headers;
}

async function responseOrThrow(url, options = {}) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        ...options,
        signal: options.signal || AbortSignal.timeout(30000),
        headers: { ...requestHeaders(), ...options.headers }
      });
      if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
      return response;
    } catch (error) {
      lastError = error;
      if (attempt < 3) await new Promise(resolve => setTimeout(resolve, attempt * 1000));
    }
  }
  throw lastError;
}

function selectReleaseAssets(release) {
  const csv = release.assets?.find(asset => asset.name === 'f1db-csv.zip');
  const checksums = release.assets?.find(asset => asset.name === 'checksums_sha256.txt');
  if (!release.tag_name || !csv?.browser_download_url) throw new Error('Latest F1DB release has no f1db-csv.zip asset.');
  return { tag: release.tag_name, csv, checksums };
}

async function latestRelease() {
  return selectReleaseAssets(await (await responseOrThrow(RELEASE_URL)).json());
}

async function download(url, target) {
  const response = await responseOrThrow(url, { headers: { accept: 'application/octet-stream' } });
  await pipeline(response.body, fs.createWriteStream(target));
}

function sha256(file) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    fs.createReadStream(file).on('data', chunk => hash.update(chunk)).on('end', () => resolve(hash.digest('hex'))).on('error', reject);
  });
}

function checksumFor(asset, checksumText) {
  const digest = String(asset.digest || '').match(/^sha256:([a-f0-9]{64})$/i)?.[1];
  if (digest) return digest.toLowerCase();
  const line = checksumText?.split(/\r?\n/).find(value => value.trim().endsWith(asset.name));
  return line?.match(/\b([a-f0-9]{64})\b/i)?.[1]?.toLowerCase() || null;
}

function readState() {
  try { return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8')); }
  catch { return {}; }
}

function extractCsvArchive(archivePath, outputDirectory) {
  const listed = spawnSync('tar', ['-tf', archivePath], { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
  if (listed.status !== 0) throw new Error(`Could not inspect F1DB archive: ${listed.stderr || listed.error?.message || 'tar failed'}`);
  const entries = listed.stdout.split(/\r?\n/).filter(Boolean);
  const selected = new Map();
  for (const entry of entries) {
    const normalized = entry.replaceAll('\\', '/');
    const segments = normalized.split('/').filter(Boolean);
    if (path.posix.isAbsolute(normalized) || segments.includes('..')) throw new Error(`Unsafe archive entry: ${entry}`);
    const basename = segments.at(-1);
    if (!/^f1db-.*\.csv$/i.test(basename)) continue;
    if (selected.has(basename)) throw new Error(`Duplicate archive entry: ${basename}`);
    selected.set(basename, normalized);
  }
  const names = new Set(selected.keys());
  const missing = REQUIRED_FILES.filter(file => !names.has(file));
  if (missing.length) throw new Error(`F1DB archive is missing: ${missing.join(', ')}.`);
  const unpacked = path.join(outputDirectory, '_archive');
  fs.mkdirSync(unpacked);
  const extracted = spawnSync('tar', ['-xf', archivePath, '-C', unpacked], { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
  if (extracted.status !== 0) throw new Error(`Could not extract F1DB archive: ${extracted.stderr || extracted.error?.message || 'tar failed'}`);
  for (const [basename, entry] of selected) {
    const source = path.join(unpacked, ...entry.split('/'));
    if (!fs.existsSync(source)) throw new Error(`Archive entry was not extracted: ${entry}`);
    fs.copyFileSync(source, path.join(outputDirectory, basename));
  }
  fs.rmSync(unpacked, { recursive: true, force: true });
  return [...selected.keys()];
}

async function syncF1db(options = {}) {
  const state = readState();
  let release;
  try { release = await latestRelease(); }
  catch (error) {
    if (!state.tag) throw error;
    console.warn(`Could not check for a newer F1DB release; keeping verified ${state.tag}: ${error.message}`);
    return { version: state.tag, changed: false, checkFailed: true };
  }
  if (!options.force && state.tag === release.tag) {
    console.log(`F1DB ${release.tag} is already installed.`);
    return { version: release.tag, changed: false };
  }

  const temporaryDirectory = fs.mkdtempSync(path.join(options.temporaryRoot || DATA_DIR, '.f1db-sync-'));
  try {
    const archivePath = path.join(temporaryDirectory, release.csv.name);
    await download(release.csv.browser_download_url, archivePath);
    let checksumText = '';
    if (release.checksums?.browser_download_url) {
      checksumText = await (await responseOrThrow(release.checksums.browser_download_url)).text();
    }
    const expected = checksumFor(release.csv, checksumText);
    if (!expected) throw new Error(`No SHA-256 checksum published for F1DB ${release.tag}.`);
    const actual = await sha256(archivePath);
    if (actual !== expected) throw new Error(`F1DB checksum mismatch: expected ${expected}, received ${actual}.`);

    const extractedDirectory = path.join(temporaryDirectory, 'csv');
    fs.mkdirSync(extractedDirectory);
    const files = extractCsvArchive(archivePath, extractedDirectory);
    for (const file of files) fs.copyFileSync(path.join(extractedDirectory, file), path.join(DATA_DIR, file));
    fs.writeFileSync(STATE_PATH, `${JSON.stringify({ tag: release.tag, sha256: actual, installedAt: new Date().toISOString() }, null, 2)}\n`);
    console.log(`Installed ${files.length} CSV files from F1DB ${release.tag}.`);
    return { version: release.tag, changed: true, files: files.length };
  } finally {
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

if (require.main === module) {
  syncF1db({ force: process.argv.includes('--force') }).catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = { checksumFor, extractCsvArchive, selectReleaseAssets, syncF1db };
