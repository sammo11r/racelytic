(function initialiseWecDriverComparisonModel(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.WecDriverComparisonModel = api;
})(typeof window === 'undefined' ? null : window, function createWecDriverComparisonModel() {
  'use strict';

  const validViews = new Set(['overview', 'shared', 'crew']);
  const classified = value => Number.isFinite(Number(value)) && Number(value) > 0;

  function readState(search = '') {
    const params = new URLSearchParams(search);
    const view = params.get('view');
    return {
      first: params.get('first') || null,
      second: params.get('second') || null,
      view: validViews.has(view) ? view : 'overview'
    };
  }

  function sharedAppearances(first = [], second = []) {
    const secondByEvent = new Map(second.map(row => [String(row.eventId), row]));
    return first.filter(row => secondByEvent.has(String(row.eventId))).map(row => {
      const other = secondByEvent.get(String(row.eventId));
      return {
        eventId: row.eventId,
        eventName: row.eventName,
        year: Number(row.year),
        round: Number(row.round),
        date: row.date,
        sameEntry: String(row.entryId) === String(other.entryId),
        sameClass: String(row.classCode) === String(other.classCode),
        first: row,
        second: other
      };
    }).sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')) || b.round - a.round);
  }

  function headToHead(rows = []) {
    return rows.reduce((score, row) => {
      const first = row.first.classPosition, second = row.second.classPosition;
      if (!row.sameClass || row.first.status !== 'classified' || row.second.status !== 'classified'
          || !classified(first) || !classified(second)) { score.excluded += 1; return score; }
      score.compared += 1;
      if (Number(first) === Number(second)) score.ties += 1;
      else if (Number(first) < Number(second)) score.first += 1;
      else score.second += 1;
      return score;
    }, { first: 0, second: 0, ties: 0, compared: 0, excluded: 0 });
  }

  function sharedCrew(rows = []) {
    const entries = rows.filter(row => row.sameEntry);
    return {
      rows: entries,
      starts: entries.filter(row => row.first.status !== 'not-started').length,
      classWins: entries.filter(row => row.first.status === 'classified' && Number(row.first.classPosition) === 1).length,
      podiums: entries.filter(row => row.first.status === 'classified' && Number(row.first.classPosition) >= 1 && Number(row.first.classPosition) <= 3).length
    };
  }

  return Object.freeze({ readState, sharedAppearances, headToHead, sharedCrew });
});
