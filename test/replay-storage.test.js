const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const zlib = require('node:zlib');
const app = require('../backend/server');
const pool = require('../backend/db');

test.after(async () => pool.end());

function request(port, url, headers = {}) {
  return new Promise((resolve, reject) => {
    http.get({ hostname: '127.0.0.1', port, path: url, headers }, response => {
      const buffers = [];
      response.on('data', chunk => buffers.push(chunk));
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, body: Buffer.concat(buffers) }));
    }).once('error', reject);
  });
}

test('replay chunks use Brotli and immutable caching with an uncompressed fallback', async () => {
  const replayDirectory = path.resolve(__dirname, '..', 'frontend', 'data', 'replays');
  const manifestName = fs.readdirSync(replayDirectory).find(name => name.endsWith('-telemetry.json'));
  const manifest = JSON.parse(fs.readFileSync(path.join(replayDirectory, manifestName)));
  const chunkUrl = manifest.chunks[0].url;
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => server.once('listening', resolve).once('error', reject));
  try {
    const { port } = server.address();
    const compressed = await request(port, chunkUrl, { 'accept-encoding': 'br' });
    assert.equal(compressed.status, 200);
    assert.equal(compressed.headers['content-encoding'], 'br');
    assert.match(compressed.headers['cache-control'], /immutable/);
    assert.equal(JSON.parse(zlib.brotliDecompressSync(compressed.body)).v, 2);

    const plain = await request(port, chunkUrl);
    assert.equal(plain.status, 200);
    assert.equal(plain.headers['content-encoding'], undefined);
    assert.equal(JSON.parse(plain.body).v, 2);
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
