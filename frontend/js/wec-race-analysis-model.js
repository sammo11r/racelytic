(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.WecRaceAnalysisModel = api;
})(typeof window === 'undefined' ? null : window, function () {
  const number = value => value === null || value === undefined || value === '' || !Number.isFinite(Number(value)) ? null : Number(value);
  const nonStarter = entry => ['not-started', 'did-not-start', 'dns'].includes(String(entry?.status || '').toLowerCase());
  const disqualified = entry => ['disqualified', 'excluded', 'dsq', 'dq'].includes(String(entry?.status || '').toLowerCase());
  const classified = entry => String(entry?.status || '').toLowerCase() === 'classified' && number(entry?.classPosition) !== null;
  const classCode = entry => String(entry?.class?.code || 'Unclassified');

  function readState(search) {
    const query = new URLSearchParams(search), view = query.get('view');
    return { year: query.get('year'), race: query.get('race'), classCode: query.get('class') || 'overall',
      view: ['flow', 'results', 'points', 'distance'].includes(view) ? view : view === 'story' ? 'flow' : view === 'pace' ? 'points' : 'flow',
      entries: query.has('entries') ? query.get('entries').split(',').filter(Boolean) : null,
      sort: ['overallPosition', 'classPosition', 'qualifyingPosition', 'entry', 'laps', 'bestLapMillis', 'points'].includes(query.get('sort')) ? query.get('sort') : 'overallPosition',
      direction: query.get('direction') === 'desc' ? -1 : 1 };
  }

  function withQualifying(data, sessionClassifications = []) {
    const positions = new Map();
    sessionClassifications.forEach(classification => classification.forEach(entry => {
      const position = number(entry.classPosition);
      if (position !== null) positions.set(String(entry.entryId), position);
    }));
    return { ...data, classification: (data.classification || []).map(entry => ({ ...entry,
      qualifyingPosition: positions.get(String(entry.entryId)) ?? null })) };
  }

  function positionChange(entry) {
    const qualifying = number(entry?.qualifyingPosition), finish = number(entry?.classPosition);
    return classified(entry) && qualifying > 0 && finish > 0 ? qualifying - finish : null;
  }

  function rowsFor(data, selectedClass = 'overall') {
    const rows = Array.isArray(data?.classification) ? data.classification : [];
    return selectedClass === 'overall' ? rows : rows.filter(entry => classCode(entry) === selectedClass);
  }

  function groupsFor(data, selectedClass = 'overall') {
    const groups = new Map();
    rowsFor(data, selectedClass).forEach(entry => {
      const code = classCode(entry);
      if (!groups.has(code)) groups.set(code, []);
      groups.get(code).push(entry);
    });
    return [...groups.entries()].map(([code, entries]) => {
      const ordered = [...entries].sort((a, b) => (number(a.classPosition) ?? 9999) - (number(b.classPosition) ?? 9999));
      const winner = ordered.find(entry => classified(entry) && number(entry.classPosition) === 1) || null;
      const fastest = [...entries].filter(entry => number(entry.bestLapMillis) !== null).sort((a, b) => number(a.bestLapMillis) - number(b.bestLapMillis))[0] || null;
      const starters = entries.filter(entry => !nonStarter(entry));
      const finishers = starters.filter(classified);
      const leaderLaps = Math.max(0, ...entries.map(entry => number(entry.laps) || 0));
      return { code, name: entries[0]?.class?.name || code, entries: ordered, winner, fastest, starters: starters.length, finishers: finishers.length, leaderLaps };
    });
  }

  function summary(data, selectedClass = 'overall') {
    const rows = rowsFor(data, selectedClass), groups = groupsFor(data, selectedClass);
    const starters = rows.filter(entry => !nonStarter(entry));
    const classifiedRows = starters.filter(classified);
    const winner = selectedClass === 'overall'
      ? rows.find(entry => classified(entry) && number(entry.overallPosition) === 1) || null
      : rows.find(entry => classified(entry) && number(entry.classPosition) === 1) || null;
    const fastest = [...rows].filter(entry => number(entry.bestLapMillis) !== null).sort((a, b) => number(a.bestLapMillis) - number(b.bestLapMillis))[0] || null;
    const winningLaps = winner ? number(winner.laps) || 0 : 0;
    const classLeaderLaps = new Map(groups.map(group => [group.code, group.leaderLaps]));
    const completionTotal = starters.reduce((total, entry) => {
      const benchmark = classLeaderLaps.get(classCode(entry)) || 0;
      return total + (benchmark ? Math.min(1, (number(entry.laps) || 0) / benchmark) : 0);
    }, 0);
    return { rows, groups, winner, fastest, starters: starters.length, classified: classifiedRows.length,
      attrition: starters.length - classifiedRows.length, classCount: groups.length, winningLaps,
      completionRate: starters.length ? completionTotal / starters.length * 100 : null };
  }

  function distanceRows(data, selectedClass = 'overall') {
    return groupsFor(data, selectedClass).map(group => ({ ...group, entries: group.entries.map(entry => ({ ...entry,
      distancePercent: group.leaderLaps ? (number(entry.laps) || 0) / group.leaderLaps * 100 : 0,
      lapDeficit: group.leaderLaps - (number(entry.laps) || 0)
    })).sort((a, b) => b.distancePercent - a.distancePercent || (number(a.classPosition) ?? 9999) - (number(b.classPosition) ?? 9999)) }));
  }

  function sortedRows(data, selectedClass, key, direction = 1) {
    const value = entry => key === 'entry' ? `${entry.team?.name || ''} ${entry.carNumber || ''}` : number(entry[key]);
    return [...rowsFor(data, selectedClass)].sort((left, right) => {
      const a = value(left), b = value(right);
      if (a === null) return b === null ? 0 : 1;
      if (b === null) return -1;
      return direction * (typeof a === 'string' ? a.localeCompare(b) : a - b);
    });
  }

  return { readState, withQualifying, positionChange, rowsFor, groupsFor, summary, distanceRows, sortedRows, classified, nonStarter, disqualified };
});
