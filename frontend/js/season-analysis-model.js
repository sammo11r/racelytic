(function (root, factory) {
  const api = factory(typeof module === 'object' && module.exports ? require('./f1-points-systems') : F1_POINTS_SYSTEMS);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SeasonAnalysisModel = api;
})(typeof window === 'undefined' ? null : window, function (systems) {
  function rulesFor(year) {
    return Object.entries(systems).find(([key]) => {
      const [first, last = first] = key.split('-');
      return year >= Number(first) && year <= (last === 'present' ? Infinity : Number(last));
    })?.[1] || {};
  }
  const sum = values => values.reduce((total, value) => total + Number(value || 0), 0);
  function hasDroppedScores(year, series = 'f1') {
    if (series !== 'f1') return false;
    const rules = rulesFor(Number(year));
    return Boolean(rules.countOnlySegments || Number.isFinite(rules.countBest));
  }
  const best = (values, count = Infinity) => sum([...values].sort((a, b) => b - a).slice(0, count));
  function countedPoints(values, rules) {
    if (rules.countOnlySegments) {
      return best(values.slice(0, rules.firstRoundsWindow), rules.bestFirstRounds)
        + best(values.slice(rules.firstRoundsWindow, rules.firstRoundsWindow + rules.lastRoundsWindow), rules.bestLastRounds);
    }
    return best(values, rules.countBest);
  }
  const raceRecorded = result => Boolean(result && (Number(result.position) > 0 || result.positionText));
  const sprintRecorded = result => Boolean(result && (Number(result.sprintPosition) > 0 || result.sprintPositionText || Number(result.sprintPoints) > 0));
  const driversFor = data => data.analysisDrivers || data.driverChampionship;
  function juniorSessionType(session, index, count, year, series) {
    if (['S', 'F'].includes(session.type)) return session.type;
    const name = String(session.name || '').toLowerCase();
    if (series === 'academy') {
      if (name.includes('reverse')) return 'S';
      if (name.includes('feature') || name.includes('opening')) return 'F';
      if (Number(year) === 2023 && count === 3 && index === 1) return 'S';
      if (Number(year) === 2025 && ((count === 2 && index === 0) || (count === 3 && index === 1))) return 'S';
      return 'F';
    }
    if (name.includes('sprint')) return 'S';
    if (name.includes('feature')) return 'F';
    const number = Number(session.sessionNumber);
    if (number) return year <= 2020 ? number <= 4 ? 'F' : 'S' : year === 2021 ? number >= 8 ? 'F' : 'S' : number >= 6 ? 'F' : 'S';
    return year <= 2020 ? index === 0 ? 'F' : 'S' : index === count - 1 ? 'F' : 'S';
  }
  function adaptJunior(data, series) {
    let sequence = 0;
    const calendar = [...data.calendar].sort((a, b) => a.round - b.round).flatMap(race => {
      const sessions = [...(race.sessions || [])].sort((a, b) => a.sessionNumber - b.sessionNumber);
      if (!sessions.length) return [{ ...race, round: ++sequence, weekendRound: race.round, placeholder: true,
        analysisLabel: 'R' + race.round, name: race.name + ' · Race schedule unavailable' }];
      return sessions.map((session, index) => {
        const type = juniorSessionType(session, index, sessions.length, Number(data.year), series);
        const category = series === 'academy' ? type === 'S' ? 'Reverse-grid race' : 'Standard race' : type === 'S' ? 'Sprint' : 'Feature';
        const sameType = sessions.filter((row, i) => juniorSessionType(row, i, sessions.length, Number(data.year), series) === type);
        const typeIndex = sameType.findIndex(row => row.id === session.id) + 1;
        const label = category + (sameType.length > 1 ? ' ' + typeIndex : '');
        return { ...race, id: session.id, round: ++sequence, weekendRound: race.round, sessionType: type,
          cancelled: Boolean(session.cancelled), date: session.date || race.endDate || race.date,
          analysisLabel: 'R' + race.round + ' ' + (series === 'academy' ? 'Race ' + (index + 1) : type + (sameType.length > 1 ? typeIndex : '')),
          name: race.name + ' · ' + (series === 'academy' ? 'Race ' + (index + 1) + ' · ' : '') + label };
      });
    });
    const driverChampionship = data.championship.map(driver => ({ ...driver,
      // Do not trust the legacy `champion` field: it also marks an inferred leader.
      championshipWon: Boolean(driver.championshipWon),
      raceResults: Object.fromEntries(calendar.filter(race => !race.cancelled && !race.placeholder && driver.raceResults?.[race.id]).map(race => {
        const result = driver.raceResults[race.id];
        const status = String(result.status || result.positionText || '');
        const position = Number(result.position);
        const classified = position > 0 && position < 100 && !/DSQ|DQ|DISQ|EXC/i.test(status);
        return [race.round, { ...result, position: classified ? position : null,
          positionText: classified ? String(position) : /[a-z]/i.test(status) ? status : 'NC', analysisType: race.sessionType }];
      }))
    }));
    return { ...data, series, calendar, driverChampionship, analysisDrivers: driverChampionship,
      constructorChampionship: data.constructorChampionship.map(team => ({ ...team, championshipWon: Boolean(team.championshipWon) })) };
  }
  function seasonState(data, now = new Date()) {
    const calendar = [...data.calendar].sort((a, b) => Number(a.round) - Number(b.round));
    const drivers = driversFor(data);
    const expected = calendar.filter(race => !race.cancelled && !race.placeholder);
    const recorded = expected.filter(race => drivers.some(driver => raceRecorded(driver.raceResults?.[race.round])));
    const available = expected.filter(race => drivers.some(driver => raceRecorded(driver.raceResults?.[race.round]) || sprintRecorded(driver.raceResults?.[race.round])));
    const recordedRounds = new Set(recorded.map(race => Number(race.round)));
    const availableRounds = new Set(available.map(race => Number(race.round)));
    const lastRound = available.at(-1)?.round || 0;
    return { calendar, expected, recorded, available, recordedRounds, availableRounds, lastRound,
      complete: expected.length > 0 && recorded.length === expected.length && !calendar.some(race => race.placeholder) && Boolean(data.summary?.completed),
      roundStatus: race => race.cancelled ? 'cancelled' : recordedRounds.has(Number(race.round)) ? 'recorded'
        : availableRounds.has(Number(race.round)) ? 'sprint-only'
        : new Date(race.date) > now ? 'upcoming' : 'missing' };
  }
  function series(data, mode = 'counted') {
    const state = seasonState(data), rules = rulesFor(Number(data.year));
    return driversFor(data).map(driver => {
      const earned = [];
      const values = state.calendar.filter(race => Number(race.round) <= Number(state.lastRound)).map(race => {
        const result = driver.raceResults?.[race.round];
        earned.push(Number(result?.points || 0) + Number(result?.sprintPoints || 0));
        return { round: Number(race.round), race, points: mode === 'scored' || (data.series && data.series !== 'f1') ? sum(earned) : countedPoints(earned, rules),
          available: state.availableRounds.has(Number(race.round)) };
      });
      return { ...driver, values };
    });
  }
  function leaders(seriesRows) {
    return (seriesRows[0]?.values || []).map((value, index) => {
      const rows = seriesRows.map(driver => ({ ...driver, value: driver.values[index].points })).sort((a, b) => b.value - a.value);
      const tied = rows.filter(driver => Math.abs(driver.value - rows[0].value) < 0.0001);
      return { ...value, gap: rows[0].value - (rows[1]?.value || 0), leader: rows[0], runnerUp: rows[1], tied,
        leaderKey: tied.map(driver => driver.driverId).sort().join(',') };
    });
  }
  function heatClass(result) {
    if (!raceRecorded(result)) return 'absent';
    if (/DSQ|DQ|DISQ|EXC/i.test(result.positionText || '')) return 'disqualified';
    if (!(Number(result.position) > 0) || /DNF|RET|DNS|DNQ|WD/i.test(result.positionText || '')) return 'retired';
    if (Number(result.position) === 1) return 'winner';
    if (Number(result.position) <= 3) return 'podium';
    return Number(result.points) > 0 ? 'points' : 'finish';
  }
  const average = values => values.length ? sum(values) / values.length : null;
  function averages(driver) {
    const results = Object.values(driver.raceResults || {}).filter(raceRecorded);
    const finishes = results.map(result => Number(result.position)).filter(value => Number.isFinite(value) && value > 0);
    const qualifying = Object.values(driver.raceResults || {}).map(result => Number(result.qualifyingPosition)).filter(value => Number.isFinite(value) && value > 0);
    const starts = results.filter(result => !/DNS|DNQ|DNPQ|WD|DNE/i.test(result.positionText || ''));
    const retirements = starts.filter(result => /DNF|RET/i.test(result.positionText || '') ||
      (result.reasonRetired && !/DSQ|DQ|DISQ|EXC/i.test(result.positionText || ''))).length;
    const mean = average(finishes);
    return { ...driver, averageFinish: mean, averageQualifying: average(qualifying), finishes: finishes.length,
      qualifyingCount: qualifying.length, starts: starts.length, retirements,
      retirementRate: starts.length ? retirements / starts.length * 100 : null,
      spread: finishes.length >= 2 ? Math.sqrt(average(finishes.map(value => (value - mean) ** 2))) : null };
  }
  function readState(search) {
    const params = new URLSearchParams(search);
    const view = params.get('view');
    return { year: params.get('year'), view: ['progression', 'margin', 'distribution', 'heatmap', 'averages'].includes(view) ? view : 'progression',
      scoring: params.get('scoring') === 'scored' ? 'scored' : 'counted',
      drivers: params.has('drivers') ? params.get('drivers').split(',').filter(Boolean) : null };
  }
  function juniorAverages(driver) {
    const values = averages(driver);
    const results = Object.values(driver.raceResults || {}).filter(raceRecorded);
    const starts = results.filter(result => !/DNS|DNQ|DNPQ|WD|DNE/i.test(result.positionText || ''));
    const unclassified = starts.filter(result => !(Number(result.position) > 0)).length;
    const sprint = results.filter(result => result.analysisType === 'S' && Number(result.position) > 0).map(result => Number(result.position));
    const feature = results.filter(result => result.analysisType === 'F' && Number(result.position) > 0).map(result => Number(result.position));
    return { ...values, sprintAverage: average(sprint), featureAverage: average(feature), sprintCount: sprint.length, featureCount: feature.length,
      unclassified, unclassifiedRate: starts.length ? unclassified / starts.length * 100 : null };
  }
  return { rulesFor, hasDroppedScores, countedPoints, seasonState, series, leaders, heatClass, averages, readState, raceRecorded, driversFor, adaptJunior, juniorSessionType, juniorAverages };
});
