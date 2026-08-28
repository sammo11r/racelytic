const test = require('node:test');
const assert = require('node:assert/strict');
const { compactReplayData } = require('../scripts/compact-replays');
const { mergeChunk, prepareManifest, requiredChunkIndex } = require('../frontend/js/replay-chunks');

function sampleReplay() {
  return {
    schemaVersion: 1,
    id: 'sample-replay',
    mode: 'telemetry',
    series: 'f1',
    duration: 250,
    track: { type: 'coordinates', trace: [[.12345, .67894], [.9, .1]] },
    drivers: [{ id: '1', code: 'ONE' }],
    samples: { 1: [[0, .12345, .67894], [119.5, .2, .3], [120.5, .4, .5], [249, .9, .1]] },
    positionEvents: { 1: [[0, 2], [120.25, 1]] },
    lapEvents: { 1: [[0, 1], [90.5, 2]] }
  };
}

test('compact replay format quantizes metadata and splits timeline samples', () => {
  const { metadata, chunks } = compactReplayData(sampleReplay(), 120);
  assert.equal(metadata.schemaVersion, 2);
  assert.equal(chunks.length, 3);
  assert.equal(metadata.samples, undefined);
  assert.deepEqual(metadata.track.trace[0], [1235, 6789]);
  assert.deepEqual(metadata.positionEvents['1'][1], [120250, 1]);
  assert.ok(chunks[0].d[0][1].some(row => row[0] > 120000), 'first chunk retains a look-ahead sample');
  assert.ok(chunks[1].d[0][1].some(row => row[0] < 0), 'next chunk retains the previous sample');
});

test('browser decoder progressively merges compact chunks', () => {
  const { metadata, chunks } = compactReplayData(sampleReplay(), 120);
  metadata.chunks = chunks.map((chunk, index) => ({ start: chunk.t / 1000, end: chunk.e / 1000, url: `${index}.json` }));
  const replay = prepareManifest(metadata);
  mergeChunk(replay, chunks[0]);
  assert.equal(replay.samples['1'].length, 3);
  assert.equal(replay.positionEvents['1'][1][0], 120.25);
  assert.equal(replay.track.trace[0][0], .1235);
  assert.equal(requiredChunkIndex(replay, 121), 1);
  mergeChunk(replay, chunks[1]);
  assert.equal(replay.samples['1'].filter(row => row[0] === 119.5).length, 1);
});
