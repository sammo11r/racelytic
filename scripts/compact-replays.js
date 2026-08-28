#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');

const ROOT = path.resolve(__dirname, '..');
const REPLAY_DIRECTORY = path.join(ROOT, 'frontend', 'data', 'replays');
const TIME_SCALE = 1000;
const COORDINATE_SCALE = 10000;
const DEFAULT_CHUNK_SECONDS = 120;

function quantizeEvents(events = {}) {
  return Object.fromEntries(Object.entries(events).map(([driverId, rows]) => [
    driverId,
    rows.map(row => [Math.round(Number(row[0]) * TIME_SCALE), ...row.slice(1)])
  ]));
}

function compactReplayData(replay, chunkSeconds = DEFAULT_CHUNK_SECONDS) {
  if (Number(replay.schemaVersion) === 2) throw new Error(`${replay.id || 'Replay'} is already compact`);
  const duration = Number(replay.duration) || 0;
  const chunkCount = Math.max(1, Math.ceil(duration / chunkSeconds));
  const chunks = Array.from({ length: chunkCount }, (_, index) => ({
    v: 2,
    t: index * chunkSeconds * TIME_SCALE,
    e: Math.min(duration, (index + 1) * chunkSeconds) * TIME_SCALE,
    d: []
  }));

  for (const [driverId, samples] of Object.entries(replay.samples || {})) {
    const buckets = Array.from({ length: chunkCount }, () => []);
    for (const row of samples) {
      const time = Math.max(0, Number(row[0]) || 0);
      const bucketIndex = Math.min(chunkCount - 1, Math.floor(time / chunkSeconds));
      buckets[bucketIndex].push([
        Math.round(time * TIME_SCALE) - chunks[bucketIndex].t,
        Math.round(Number(row[1]) * COORDINATE_SCALE),
        Math.round(Number(row[2]) * COORDINATE_SCALE)
      ]);
    }
    for (let index = 0; index < buckets.length; index += 1) {
      const rows = buckets[index];
      const previous = index > 0 ? buckets[index - 1].at(-1) : null;
      const next = index + 1 < buckets.length ? buckets[index + 1][0] : null;
      const withBoundaries = [];
      if (previous) withBoundaries.push([
        previous[0] + chunks[index - 1].t - chunks[index].t,
        previous[1], previous[2]
      ]);
      withBoundaries.push(...rows);
      if (next) withBoundaries.push([
        next[0] + chunks[index + 1].t - chunks[index].t,
        next[1], next[2]
      ]);
      if (withBoundaries.length) chunks[index].d.push([driverId, withBoundaries]);
    }
  }

  const metadata = { ...replay };
  delete metadata.samples;
  delete metadata.positionEvents;
  delete metadata.lapEvents;
  delete metadata.statusEvents;
  metadata.schemaVersion = 2;
  metadata.encoding = {
    format: 'quantized-timeline-v1',
    timeScale: TIME_SCALE,
    coordinateScale: COORDINATE_SCALE,
    chunkSeconds
  };
  metadata.track = {
    ...replay.track,
    quantized: true,
    trace: (replay.track?.trace || []).map(point => [
      Math.round(Number(point[0]) * COORDINATE_SCALE),
      Math.round(Number(point[1]) * COORDINATE_SCALE)
    ])
  };
  metadata.positionEvents = quantizeEvents(replay.positionEvents);
  metadata.lapEvents = quantizeEvents(replay.lapEvents);
  metadata.statusEvents = quantizeEvents(replay.statusEvents);
  metadata.eventTimesQuantized = true;
  metadata.chunks = [];
  return { metadata, chunks };
}

function brotli(buffer) {
  return zlib.brotliCompressSync(buffer, {
    params: {
      [zlib.constants.BROTLI_PARAM_QUALITY]: 6,
      [zlib.constants.BROTLI_PARAM_MODE]: zlib.constants.BROTLI_MODE_TEXT
    }
  });
}

function writeCompactReplay(file, options = {}) {
  const source = fs.readFileSync(file);
  const replay = JSON.parse(source);
  if (Number(replay.schemaVersion) === 2) return { skipped: true, file };
  const { metadata, chunks } = compactReplayData(replay, options.chunkSeconds);
  const replayDirectory = path.join(path.dirname(file), replay.id);
  const chunkDirectory = path.join(replayDirectory, 'chunks');
  fs.mkdirSync(chunkDirectory, { recursive: true });
  let compressedBytes = 0;

  chunks.forEach((chunk, index) => {
    const json = Buffer.from(`${JSON.stringify(chunk)}\n`);
    const compressed = brotli(json);
    const hash = crypto.createHash('sha256').update(compressed).digest('hex').slice(0, 12);
    const baseName = `${String(index).padStart(3, '0')}.${hash}.json`;
    fs.writeFileSync(path.join(chunkDirectory, `${baseName}.br`), compressed);
    compressedBytes += compressed.length;
    metadata.chunks.push({
      start: chunk.t / TIME_SCALE,
      end: chunk.e / TIME_SCALE,
      url: `/data/replays/${replay.id}/chunks/${baseName}`,
      bytes: compressed.length
    });
  });

  const manifest = Buffer.from(`${JSON.stringify(metadata)}\n`);
  fs.writeFileSync(file, manifest);
  return {
    skipped: false,
    file,
    originalBytes: source.length,
    compactBytes: manifest.length + compressedBytes,
    chunks: chunks.length
  };
}

function replayFiles(selectedId) {
  return fs.readdirSync(REPLAY_DIRECTORY)
    .filter(name => name.endsWith('-telemetry.json') && (!selectedId || name === `${selectedId}.json`))
    .map(name => path.join(REPLAY_DIRECTORY, name));
}

function main() {
  const args = process.argv.slice(2);
  const idIndex = args.indexOf('--id');
  const selectedId = idIndex >= 0 ? args[idIndex + 1] : null;
  const chunkIndex = args.indexOf('--chunk-seconds');
  const chunkSeconds = chunkIndex >= 0 ? Number(args[chunkIndex + 1]) : DEFAULT_CHUNK_SECONDS;
  if (!Number.isFinite(chunkSeconds) || chunkSeconds < 30) throw new Error('Chunk duration must be at least 30 seconds');
  const files = replayFiles(selectedId);
  if (!files.length) throw new Error(selectedId ? `Replay not found: ${selectedId}` : 'No replay files found');
  let originalBytes = 0;
  let compactBytes = 0;
  let converted = 0;
  for (const file of files) {
    const result = writeCompactReplay(file, { chunkSeconds });
    if (result.skipped) continue;
    converted += 1;
    originalBytes += result.originalBytes;
    compactBytes += result.compactBytes;
    console.log(`${path.basename(file)}: ${result.chunks} chunks, ${(result.compactBytes / 1024 / 1024).toFixed(2)} MB`);
  }
  console.log(`Converted ${converted}/${files.length} replays: ${(originalBytes / 1024 / 1024).toFixed(1)} MB -> ${(compactBytes / 1024 / 1024).toFixed(1)} MB`);
}

if (require.main === module) {
  try { main(); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}

module.exports = { compactReplayData, writeCompactReplay };
