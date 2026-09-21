(function initialiseWecDriverFormModel(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.WecDriverFormModel = api;
})(typeof window === 'undefined' ? null : window, function createWecDriverFormModel() {
  'use strict';
  const views = new Set(['trend', 'classes', 'crew', 'results']);
  const ranges = new Set(['5', '10', '20', '50', 'all']);
  const windows = new Set(['1', '3', '5']);
  const numeric = value => Number.isFinite(Number(value)) && Number(value) > 0;

  function readState(search = '') {
    const params = new URLSearchParams(search), view = params.get('view'), range = params.get('range'), window = params.get('window');
    return { driver: params.get('driver') || null, view: views.has(view) ? view : 'trend', range: ranges.has(range) ? range : '10', window: windows.has(window) ? Number(window) : 3 };
  }
  function category(row) {
    const status = String(row?.status || '').toLowerCase();
    if (status === 'classified') return 'classified';
    if (['not-started', 'dns', 'withdrawn'].includes(status)) return 'nonstarter';
    if (['disqualified', 'excluded'].includes(status)) return 'disqualified';
    if (status === 'retired') return 'retired';
    return 'unclassified';
  }
  function selectedRows(rows = [], range = '10') {
    const sorted = [...rows].sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')) || Number(b.round) - Number(a.round));
    return range === 'all' ? sorted : sorted.slice(0, Number(range));
  }
  function mean(values) { return values.length ? values.reduce((sum, value) => sum + Number(value), 0) / values.length : null; }
  function summary(rows = []) {
    const starters = rows.filter(row => category(row) !== 'nonstarter');
    const classified = starters.filter(row => category(row) === 'classified' && numeric(row.classPosition));
    return {
      starts: starters.length,
      classified: classified.length,
      averageClassFinish: mean(classified.map(row => Number(row.classPosition))),
      classWins: classified.filter(row => Number(row.classPosition) === 1).length,
      podiums: classified.filter(row => Number(row.classPosition) <= 3).length,
      classifiedRate: starters.length ? classified.length / starters.length * 100 : null
    };
  }
  function rolling(rows = [], windowSize = 3) {
    const chronological = [...rows].reverse();
    return chronological.map((row, index) => {
      if (category(row) !== 'classified' || !numeric(row.classPosition)) return { row, raw: null, value: null, sample: 0 };
      const values = chronological.slice(Math.max(0, index - windowSize + 1), index + 1)
        .filter(item => category(item) === 'classified' && numeric(item.classPosition)).map(item => Number(item.classPosition));
      return { row, raw: Number(row.classPosition), value: mean(values), sample: values.length };
    });
  }
  function classBreakdown(rows = []) {
    const groups = new Map();
    rows.forEach(row => {
      const code = row.classCode || 'Unknown';
      if (!groups.has(code)) groups.set(code, []);
      groups.get(code).push(row);
    });
    return [...groups.entries()].map(([code, entries]) => ({ code, entries, ...summary(entries) }))
      .sort((a, b) => b.starts - a.starts || a.code.localeCompare(b.code));
  }
  function crewBreakdown(crew = [], rows = []) {
    const events = new Set(rows.map(row => String(row.eventId)));
    const map = new Map();
    crew.filter(row => events.has(String(row.eventId))).forEach(row => {
      if (!map.has(row.driverId)) map.set(row.driverId, { id: row.driverId, name: row.driverName, countryName: row.countryName, events: new Set(), entries: new Set() });
      const item = map.get(row.driverId); item.events.add(String(row.eventId)); item.entries.add(`${row.eventId}:${row.entryId}`);
    });
    return [...map.values()].map(item => ({ ...item, startsTogether: item.events.size, entriesTogether: item.entries.size }))
      .sort((a, b) => b.startsTogether - a.startsTogether || a.name.localeCompare(b.name));
  }
  return Object.freeze({ readState, category, selectedRows, summary, rolling, classBreakdown, crewBreakdown });
});
