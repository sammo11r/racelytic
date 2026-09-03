(function (root, factory) {
  const api = factory(typeof module === 'object' && module.exports ? require('./season-analysis-model') : SeasonAnalysisModel);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SeasonComparisonModel = api;
})(typeof window === 'undefined' ? null : window, function (analysis) {
  const sum = values => values.reduce((a, b) => a + b, 0);
  const mean = values => values.length ? sum(values) / values.length : null;
  const status = result => String(result.status || result.positionText || '').toUpperCase();
  const nonStart = result => /DNS|DNQ|DNPQ|DNE|WD/.test(status(result));
  const disqualified = result => /DSQ|DISQ|EXC|^DQ$/.test(status(result));
  const classified = result => Number(result.position) > 0 && !disqualified(result) && !nonStart(result);
  const retirement = result => !nonStart(result) && !disqualified(result) &&
    (/DNF|RET/.test(status(result)) || Boolean(result.reasonRetired && !/finished|running/i.test(result.reasonRetired)));
  function readState(search) {
    const params = new URLSearchParams(search), requestedView = params.get('view');
    return { first: params.get('first'), second: params.get('second'),
      view: ['overview', 'progression', 'competition', 'field'].includes(requestedView) ? requestedView : 'overview',
      basis: params.get('basis') === 'matched' ? 'matched' : 'available',
      round: /^\d+$/.test(params.get('round') || '') ? Number(params.get('round')) : null,
      field: params.get('field') === 'ten' ? 'ten' : 'all',
      sort: ['position', 'name', 'points', 'finish', 'qualifying', 'sprint', 'feature', 'spread'].includes(params.get('sort')) ? params.get('sort') : 'position',
      direction: params.get('direction') === 'desc' ? -1 : 1 };
  }
  function commonRounds(first, second) {
    const states = [first, second].map(data => analysis.seasonState(data));
    let round = 0;
    const completedRound = (state, data, number) => {
      if (!data.series || data.series === 'f1') return state.recordedRounds.has(number);
      const sessions = state.calendar.filter(race => Number(race.weekendRound) === number);
      return sessions.length > 0 && sessions.every(race => !race.placeholder && (race.cancelled || state.recordedRounds.has(Number(race.round))));
    };
    while (states.every((state, index) => completedRound(state, [first, second][index], round + 1))) round++;
    return round;
  }
  function snapshot(data, cutoff = null) {
    const fullState = analysis.seasonState(data);
    const junior = Boolean(data.series && data.series !== 'f1');
    // A junior cutoff is a weekend, never a session sequence number: formats differ by year.
    const includedCalendar = cutoff == null ? data.calendar.filter(race => Number(race.round) <= Number(fullState.lastRound))
      : data.calendar.filter(race => Number(junior ? race.weekendRound : race.round) <= cutoff);
    const round = Math.max(0, ...includedCalendar.map(race => Number(race.round)));
    const rows = analysis.driversFor(data).map(driver => ({ ...driver,
      raceResults: Object.fromEntries(Object.entries(driver.raceResults || {}).filter(([key]) => Number(key) <= round)) }))
      .filter(driver => cutoff == null || Object.values(driver.raceResults).some(analysis.raceRecorded));
    const scoped = { ...data, analysisDrivers: rows, calendar: includedCalendar };
    const state = analysis.seasonState(scoped), series = analysis.series(scoped);
    const order = [...series].sort((a, b) => (b.values.at(-1)?.points || 0) - (a.values.at(-1)?.points || 0));
    const standings = cutoff == null ? data.driverChampionship : order.map((driver, index) => {
      const points = driver.values.at(-1)?.points || 0;
      const firstTie = order.findIndex(row => Math.abs((row.values.at(-1)?.points || 0) - points) < 0.00001);
      return { ...driver, points, position: firstTie + 1, championshipWon: false, tied: firstTie !== index || order[index + 1]?.values.at(-1)?.points === points };
    });
    const leader = cutoff == null ? standings.find(driver => driver.championshipWon) || standings[0] : standings[0];
    const runner = standings.find(driver => driver.driverId !== leader?.driverId);
    const leaderSeries = series.find(driver => driver.driverId === leader?.driverId);
    const denominator = leaderSeries?.values.at(-1)?.points || 0;
    const axisRounds = cutoff == null ? fullState.calendar.length : scoped.calendar.length;
    const progress = (leaderSeries?.values || []).map((value, index) => ({ ...value, x: (index + 1) / Math.max(axisRounds, 1) * 100,
      value: denominator > 0 ? value.points / denominator * 100 : null, driver: leader.name }));
    const leaders = analysis.leaders(series);
    const marginSeries = leaders.map((value, index) => ({ ...value, x: (index + 1) / Math.max(axisRounds, 1) * 100,
      value: value.leader.value > 0 ? value.gap / value.leader.value * 100 : null }));
    const results = rows.flatMap(driver => Object.entries(driver.raceResults).filter(([, result]) => analysis.raceRecorded(result))
      .map(([key, result]) => ({ ...result, driverId: driver.driverId, round: Number(key) })));
    const starts = results.filter(result => !nonStart(result));
    const wins = results.filter(result => classified(result) && Number(result.position) === 1);
    const winners = new Set(wins.map(result => result.driverId));
    const teams = new Set(wins.map(result => result.constructorId).filter(Boolean));
    const counts = [...winners].map(id => new Set(wins.filter(result => result.driverId === id).map(result => result.round)).size);
    const margin = leader && runner ? Number(leader.points) - Number(runner.points) : null;
    const totalPoints = sum(standings.map(driver => Number(driver.points || 0)));
    const fields = rows.map(driver => {
      const raceResults = Object.values(driver.raceResults).filter(analysis.raceRecorded);
      const finishes = raceResults.filter(classified).map(result => Number(result.position));
      const qualifying = Object.values(driver.raceResults).map(result => Number(result.qualifyingPosition)).filter(value => Number.isFinite(value) && value > 0);
      const finish = mean(finishes), standing = standings.find(row => row.driverId === driver.driverId);
      const types = junior ? analysis.juniorAverages(driver) : {};
      return { ...driver, position: standing?.position > 0 ? standing.position : null, points: standing?.points ?? null, tied: standing?.tied,
        finish, qualifying: mean(qualifying), finishCount: finishes.length, qualifyingCount: qualifying.length,
        sprint: types.sprintAverage, feature: types.featureAverage, sprintCount: types.sprintCount, featureCount: types.featureCount,
        spread: finishes.length > 1 ? Math.sqrt(mean(finishes.map(value => (value - finish) ** 2))) : null };
    });
    let previous;
    let leadChanges = 0;
    for (const entry of leaders.filter(value => value.available)) {
      if (previous && previous !== entry.leaderKey) leadChanges++;
      previous = entry.leaderKey;
    }
    const mismatches = cutoff == null ? series.filter(driver => driver.points != null && Math.abs((driver.values.at(-1)?.points || 0) - driver.points) > .01).map(driver => driver.name) : [];
    return { data, year: data.year, fullState, state, cutoff, round, leader, runner, progress, marginSeries, fields, mismatches,
      complete: fullState.complete, metrics: {
        races: state.recorded.length, winners: state.recorded.length ? winners.size : null, teams: state.recorded.length ? teams.size : null,
        winnerRate: state.recorded.length ? winners.size / state.recorded.length * 10 : null,
        dominantShare: state.recorded.length ? Math.max(0, ...counts) / state.recorded.length * 100 : null,
        margin, marginPercent: leader?.points > 0 && margin != null ? margin / leader.points * 100 : null,
        concentration: totalPoints > 0 ? sum(standings.slice(0, 3).map(driver => Number(driver.points || 0))) / totalPoints * 100 : null,
        retirementRate: starts.length ? results.filter(retirement).length / starts.length * 100 : null,
        unclassified: starts.filter(result => !classified(result)).length,
        unclassifiedRate: starts.length ? starts.filter(result => !classified(result)).length / starts.length * 100 : null,
        retirements: results.filter(retirement).length, starts: starts.length, nonStarts: results.filter(nonStart).length,
        disqualifications: results.filter(disqualified).length, leadChanges
      } };
  }
  function compare(data, basis, requestedRound) {
    const maxRound = commonRounds(...data);
    const cutoff = basis === 'matched' ? Math.min(maxRound, Math.max(1, Number(requestedRound) || maxRound)) : null;
    return { maxRound, cutoff, snapshots: data.map(season => snapshot(season, cutoff)) };
  }
  function sortedField(snapshot, size, key, direction) {
    const rows = size === 'ten' ? snapshot.fields.filter(row => row.position != null && row.position <= 10) : snapshot.fields;
    return [...rows].sort((a, b) => {
      if (a[key] == null) return b[key] == null ? a.name.localeCompare(b.name) : 1;
      if (b[key] == null) return -1;
      return direction * (typeof a[key] === 'string' ? a[key].localeCompare(b[key]) : a[key] - b[key]) || a.name.localeCompare(b.name);
    });
  }
  return { readState, commonRounds, snapshot, compare, sortedField, retirement, nonStart, disqualified };
});
