(function lightsOutEngineModule(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.LightsOutEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createLightsOutEngine() {
  const SAVE_KEY = 'racelytic-lights-out-v1';
  const MAX_RESULTS = 10;

  function reactionTier(milliseconds) {
    const value = Number(milliseconds);
    if (!Number.isFinite(value) || value < 0) return null;
    if (value < 200) return { id: 'elite', label: 'Exceptional' };
    if (value < 250) return { id: 'quick', label: 'Quick' };
    if (value < 350) return { id: 'steady', label: 'Steady' };
    return { id: 'slow', label: 'Room to improve' };
  }

  function randomizedHold(random = Math.random) {
    return 900 + Math.floor(Math.max(0, Math.min(.999999, random())) * 3101);
  }

  function normalizeStats(value) {
    const results = Array.isArray(value?.results)
      ? value.results.map(Number).filter(result => Number.isFinite(result) && result >= 0).slice(0, MAX_RESULTS)
      : [];
    return { results, falseStarts: Math.max(0, Math.floor(Number(value?.falseStarts) || 0)) };
  }

  function addResult(stats, milliseconds) {
    const next = normalizeStats(stats);
    const value = Math.max(0, Math.round(Number(milliseconds) || 0));
    next.results.unshift(value);
    next.results = next.results.slice(0, MAX_RESULTS);
    return next;
  }

  function addFalseStart(stats) {
    const next = normalizeStats(stats);
    next.falseStarts += 1;
    return next;
  }

  function summarize(stats) {
    const normalized = normalizeStats(stats);
    const count = normalized.results.length;
    return {
      ...normalized,
      count,
      best: count ? Math.min(...normalized.results) : null,
      average: count ? Math.round(normalized.results.reduce((sum, result) => sum + result, 0) / count) : null
    };
  }

  function loadStats(storage, key = SAVE_KEY) {
    try { return normalizeStats(JSON.parse(storage.getItem(key))); } catch { return normalizeStats(); }
  }

  function saveStats(stats, storage, key = SAVE_KEY) {
    const normalized = normalizeStats(stats);
    storage.setItem(key, JSON.stringify(normalized));
    return normalized;
  }

  return { MAX_RESULTS, SAVE_KEY, addFalseStart, addResult, loadStats, normalizeStats, randomizedHold, reactionTier, saveStats, summarize };
});
