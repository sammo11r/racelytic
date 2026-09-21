(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.WecCircuitAnalysisModel = api;
})(typeof window === 'undefined' ? null : window, function () {
  const number = value => value === null || value === undefined || value === '' || !Number.isFinite(Number(value)) ? null : Number(value);
  const classCode = result => String(result?.class?.code || 'Unclassified');
  const started = result => !['not-started', 'did-not-start', 'dns', 'withdrawn'].includes(String(result?.status || '').toLowerCase());
  const classified = result => String(result?.status || '').toLowerCase() === 'classified' && number(result?.classPosition) !== null;

  function filter(events, options = {}) {
    const from = number(options.from), to = number(options.to), selectedClass = options.classCode || 'all';
    return (events || []).filter(event => (!from || event.year >= from) && (!to || event.year <= to)).map(event => ({
      ...event,
      results: (event.results || []).filter(result => selectedClass === 'all' || classCode(result) === selectedClass)
    })).filter(event => event.results.length);
  }

  function classes(events) {
    const values = new Map();
    (events || []).flatMap(event => event.results || []).forEach(result => {
      const code = classCode(result);
      if (!values.has(code)) values.set(code, { code, name: result.class?.name || code, order: number(result.class?.displayOrder) ?? 99 });
    });
    return [...values.values()].sort((a, b) => a.order - b.order || a.code.localeCompare(b.code));
  }

  function summary(events) {
    const results = events.flatMap(event => event.results || []), starters = results.filter(started), finishers = starters.filter(classified);
    const winners = results.filter(result => classified(result) && number(result.classPosition) === 1);
    const winningTeams = new Set(winners.map(result => result.team?.id).filter(Boolean));
    const years = events.map(event => number(event.year)).filter(value => value !== null);
    const completion = events.flatMap(event => (event.results || []).filter(started).map(result => {
      const peers = (event.results || []).filter(peer => classCode(peer) === classCode(result));
      const leader = Math.max(0, ...peers.map(peer => number(peer.laps) || 0));
      return leader ? Math.min(1, (number(result.laps) || 0) / leader) : 0;
    }));
    return { races: events.length, firstYear: years.length ? Math.min(...years) : null, lastYear: years.length ? Math.max(...years) : null,
      starts: starters.length, classified: finishers.length, finishRate: starters.length ? finishers.length / starters.length * 100 : null,
      completionRate: completion.length ? completion.reduce((sum, value) => sum + value, 0) / completion.length * 100 : null,
      classWinners: winners.length, winningTeams: winningTeams.size };
  }

  function entities(events, type) {
    const rows = new Map();
    events.forEach(event => (event.results || []).forEach(result => {
      const subjects = type === 'driver' ? result.crew || [] : [result[type]];
      subjects.filter(subject => subject?.id).forEach(subject => {
        const key = subject.id, row = rows.get(key) || { id: key, name: subject.name, starts: 0, wins: 0, podiums: 0, positions: [], laps: 0 };
        if (started(result)) row.starts += 1;
        if (classified(result) && number(result.classPosition) === 1) row.wins += 1;
        if (classified(result) && number(result.classPosition) <= 3) row.podiums += 1;
        if (classified(result)) row.positions.push(number(result.classPosition));
        row.laps += number(result.laps) || 0;
        rows.set(key, row);
      });
    }));
    return [...rows.values()].map(row => ({ ...row,
      averageFinish: row.positions.length ? row.positions.reduce((sum, value) => sum + value, 0) / row.positions.length : null,
      winRate: row.starts ? row.wins / row.starts * 100 : null
    }));
  }

  function rank(events, type, metric = 'wins', minimum = 1) {
    const descending = metric !== 'averageFinish';
    return entities(events, type).filter(row => row.starts >= minimum && (metric !== 'averageFinish' || row.positions.length >= minimum))
      .sort((a, b) => {
        const av = a[metric] ?? (descending ? -1 : Infinity), bv = b[metric] ?? (descending ? -1 : Infinity);
        return (descending ? bv - av : av - bv) || b.wins - a.wins || b.podiums - a.podiums || a.name.localeCompare(b.name);
      });
  }

  function eventRows(events) {
    return [...events].sort((a, b) => b.year - a.year || b.round - a.round).map(event => {
      const results = event.results || [], overall = results.find(result => classified(result) && number(result.overallPosition) === 1) || null;
      return { ...event, overallWinner: overall, classWinners: results.filter(result => classified(result) && number(result.classPosition) === 1),
        starters: results.filter(started).length, classified: results.filter(classified).length };
    });
  }

  function reliability(events) {
    const rows = new Map();
    events.forEach(event => (event.results || []).forEach(result => {
      const code = classCode(result), row = rows.get(code) || { code, starts: 0, classified: 0, laps: 0, possibleLaps: 0 };
      if (!started(result)) return;
      const leader = Math.max(0, ...(event.results || []).filter(peer => classCode(peer) === code).map(peer => number(peer.laps) || 0));
      row.starts += 1; row.classified += classified(result) ? 1 : 0; row.laps += Math.min(leader, number(result.laps) || 0); row.possibleLaps += leader;
      rows.set(code, row);
    }));
    return [...rows.values()].map(row => ({ ...row, finishRate: row.starts ? row.classified / row.starts * 100 : null,
      completionRate: row.possibleLaps ? row.laps / row.possibleLaps * 100 : null })).sort((a, b) => b.starts - a.starts);
  }

  return { filter, classes, summary, entities, rank, eventRows, reliability, started, classified };
});
