(function replayChunksModule(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RacelyticReplayChunks = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createReplayChunks() {
  function decodeTrace(track = {}, coordinateScale = 10000) {
    if (!track.quantized) return track;
    return {
      ...track,
      trace: (track.trace || []).map(point => [point[0] / coordinateScale, point[1] / coordinateScale]),
      quantized: undefined
    };
  }

  function prepareManifest(manifest) {
    if (Number(manifest?.schemaVersion) !== 2) return manifest;
    const coordinateScale = Number(manifest.encoding?.coordinateScale) || 10000;
    const timeScale = Number(manifest.encoding?.timeScale) || 1000;
    const decodeEvents = events => Object.fromEntries(Object.entries(events || {}).map(([driverId, rows]) => [
      driverId,
      rows.map(row => [Number(row[0]) / timeScale, ...row.slice(1)])
    ]));
    return {
      ...manifest,
      track: decodeTrace(manifest.track, coordinateScale),
      samples: {},
      positionEvents: manifest.eventTimesQuantized ? decodeEvents(manifest.positionEvents) : (manifest.positionEvents || {}),
      lapEvents: manifest.eventTimesQuantized ? decodeEvents(manifest.lapEvents) : (manifest.lapEvents || {}),
      statusEvents: manifest.eventTimesQuantized ? decodeEvents(manifest.statusEvents) : (manifest.statusEvents || {})
    };
  }

  function mergeRows(target, rows) {
    if (!rows?.length) return target;
    if (!target.length) {
      target.push(...rows);
      return target;
    }
    const knownTimes = new Set(target.map(row => row[0]));
    for (const row of rows) {
      if (!knownTimes.has(row[0])) target.push(row);
    }
    target.sort((a, b) => a[0] - b[0]);
    return target;
  }

  function mergeChunk(replay, chunk) {
    const timeScale = Number(replay.encoding?.timeScale) || 1000;
    const coordinateScale = Number(replay.encoding?.coordinateScale) || 10000;
    const start = Number(chunk.t) || 0;
    for (const driverRows of chunk.d || []) {
      const [driverId, compactSamples] = driverRows;
      const decoded = (compactSamples || []).map(row => [
        (start + Number(row[0])) / timeScale,
        Number(row[1]) / coordinateScale,
        Number(row[2]) / coordinateScale,
        row.length > 3 ? Number(row[3]) / coordinateScale : undefined
      ]);
      replay.samples[driverId] ||= [];
      mergeRows(replay.samples[driverId], decoded);
    }
    replay.loadedUntil = Math.max(Number(replay.loadedUntil) || 0, Number(chunk.e) / timeScale || 0);
    return replay;
  }

  function requiredChunkIndex(replay, time) {
    const chunks = replay?.chunks || [];
    const safeTime = Math.max(0, Number(time) || 0);
    const index = chunks.findIndex(chunk => safeTime < Number(chunk.end));
    return index < 0 ? Math.max(0, chunks.length - 1) : index;
  }

  return { mergeChunk, prepareManifest, requiredChunkIndex };
});
