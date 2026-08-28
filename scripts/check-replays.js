#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const replayDirectory = path.resolve(__dirname, '..', 'frontend', 'data', 'replays');
const manifests = fs.readdirSync(replayDirectory).filter(name => name.endsWith('-telemetry.json'));
let chunks = 0;
let compressedBytes = 0;

for (const name of manifests) {
  const manifest = JSON.parse(fs.readFileSync(path.join(replayDirectory, name)));
  if (manifest.schemaVersion !== 2 || !manifest.chunks?.length) throw new Error(`${name} is not a chunked schema-v2 replay`);
  let previousEnd = 0;
  manifest.chunks.forEach((chunk, index) => {
    if (Number(chunk.start) !== previousEnd || Number(chunk.end) <= Number(chunk.start)) {
      throw new Error(`${name} has a discontinuity at chunk ${index}`);
    }
    const relative = new URL(chunk.url, 'https://racelytic.test').pathname.replace(/^\/data\/replays\//, '');
    const compressedFile = path.join(replayDirectory, `${relative}.br`);
    const buffer = fs.readFileSync(compressedFile);
    const payload = JSON.parse(zlib.brotliDecompressSync(buffer));
    if (payload.v !== 2 || Number(payload.t) / 1000 !== Number(chunk.start)) {
      throw new Error(`${name} has an invalid chunk payload at ${index}`);
    }
    previousEnd = Number(chunk.end);
    compressedBytes += buffer.length;
    chunks += 1;
  });
}

console.log(`Verified ${manifests.length} compact replay manifests and ${chunks} Brotli timeline chunks (${(compressedBytes / 1024 / 1024).toFixed(1)} MB).`);
