(function (root, factory) {
  const model = factory();
  if (typeof module === 'object' && module.exports) module.exports = model;
  else root.CircuitAnalysisModel = model;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const positive = value => value !== null && value !== '' && Number.isFinite(Number(value)) && Number(value) > 0;
  const status = result => String(result.positionText || '').trim().toUpperCase();
  const nonstarter = result => /^(DNS|DNQ|DNPQ|WD|W|DNP|DNA|DNE|EX|WITHDRAWN|DID NOT START|DID NOT QUALIFY|DID NOT PREQUALIFY)$/.test(status(result));
  const starter = result => !nonstarter(result);
  const classified = result => starter(result) && !/^(DSQ|DISQ|DQ|DISQUALIFIED|EXCLUDED|EXC)$/.test(status(result)) && positive(result.position);
  function retired(result) {
    if (!starter(result) || /^(DSQ|DISQ|DQ|DISQUALIFIED|EXCLUDED|EXC)$/.test(status(result))) return false;
    const reason = String(result.reasonRetired || '').trim();
    return /^(DNF|RET|RETIRED)$/.test(status(result)) || Boolean(reason && !/^(finished|running)$/i.test(reason));
  }
  function gap(result = {}) {
    const text = String(result.gap || '').trim();
    const lapMatch = text.match(/^\+?(\d+)\s+laps?$/i);
    if (positive(result.gapLaps) || lapMatch) return { seconds: null, laps: Number(result.gapLaps) || Number(lapMatch[1]) };
    if (result.gapMillis !== null && result.gapMillis !== undefined && result.gapMillis !== '' && Number.isFinite(Number(result.gapMillis)) && Number(result.gapMillis) >= 0) {
      return { seconds: Number(result.gapMillis) / 1000, laps: null };
    }
    const match = text.replace(',', '.').match(/^\+?(?:(\d+):)?(?:(\d{1,2}):)?(\d+(?:\.\d+)?)$/);
    if (!match) return { seconds: null, laps: null };
    const seconds = Number(match[3]);
    if ((match[1] && seconds >= 60) || (match[2] && Number(match[2]) >= 60)) return { seconds: null, laps: null };
    return { seconds: seconds + Number(match[2] || match[1] || 0) * 60 + (match[2] ? Number(match[1]) * 3600 : 0), laps: null };
  }
  function median(values) {
    if (!values.length) return null;
    const sorted = [...values].sort((a, b) => a - b), middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  }
  function metrics(races, gridConversion = false) {
    const starters = races.flatMap(race => race.results.filter(starter));
    const onPole = result => gridConversion ? Number(result.grid) === 1 : result.polePosition;
    const poles = races.filter(race => race.results.some(result => starter(result) && onPole(result)));
    const converted = poles.filter(race => race.results.some(result => classified(result) && Number(result.position) === 1 && onPole(result)));
    const wins = races.flatMap(race => race.results.filter(result => Number(result.position) === 1));
    const gridWins = wins.filter(result => positive(result.grid));
    const retirements = starters.filter(retired).length;
    return { starters: starters.length, retirements, retirementRate: starters.length ? retirements / starters.length * 100 : null,
      poles: poles.length, converted: converted.length, poleRate: poles.length ? converted.length / poles.length * 100 : null,
      winners: new Set(wins.map(result => result.driverId)).size,
      winnerGrid: gridWins.length ? gridWins.reduce((sum, result) => sum + Number(result.grid), 0) / gridWins.length : null,
      knownWinnerGrids: gridWins.length };
  }
  function aggregate(races, team = false) {
    const entries = new Map();
    for (const race of races) {
      const seenStarts = new Set(), seenWins = new Set();
      for (const result of race.results.filter(starter)) {
        const id = team ? result.constructorId : result.driverId;
        if (!id) continue;
        const row = entries.get(id) || { id, name: team ? result.constructorName : result.driverName, starts: 0, carStarts: 0, wins: 0, podiums: 0, positions: [], gains: [] };
        if (!seenStarts.has(id)) row.starts++;
        seenStarts.add(id);
        row.carStarts++;
        if (Number(result.position) === 1 && !seenWins.has(id)) { row.wins++; seenWins.add(id); }
        if (classified(result)) {
          const position = Number(result.position);
          row.positions.push(position);
          if (position <= 3) row.podiums++;
          if (positive(result.grid)) row.gains.push(Number(result.grid) - position);
        }
        entries.set(id, row);
      }
    }
    return [...entries.values()].map(row => ({ ...row, winRate: row.wins / row.starts * 100,
      averageFinish: row.positions.length ? row.positions.reduce((sum, n) => sum + n, 0) / row.positions.length : null,
      averageGain: row.gains.length ? row.gains.reduce((sum, n) => sum + n, 0) / row.gains.length : null }));
  }
  function rank(rows, metric, minimum = 1) {
    return rows.filter(row => row.starts >= minimum && row[metric] !== null && (metric !== 'averageFinish' || row.positions.length >= minimum))
      .sort((a, b) => (metric === 'averageFinish' ? a[metric] - b[metric] : b[metric] - a[metric]) || b.wins - a.wins || b.podiums - a.podiums || b.starts - a.starts || a.name.localeCompare(b.name));
  }
  const bands = ['P1', 'P2–3', 'P4–5', 'P6–10', 'P11–15', 'P16+'];
  const band = position => position <= 1 ? 0 : position <= 3 ? 1 : position <= 5 ? 2 : position <= 10 ? 3 : position <= 15 ? 4 : 5;
  function heatmap(races) {
    const cells = Array.from({ length: 6 }, () => Array.from({ length: 7 }, () => []));
    for (const race of races) for (const result of race.results) {
      if (starter(result) && positive(result.grid)) cells[band(Number(result.grid))][classified(result) ? band(Number(result.position)) : 6].push({ race, result });
    }
    return cells;
  }
  function range(races, start, end) {
    return races.filter(race => (!start || race.year >= Number(start)) && (!end || race.year <= Number(end)));
  }
  return { starter, retired, classified, positive, gap, median, metrics, aggregate, rank, bands, heatmap, range };
});
