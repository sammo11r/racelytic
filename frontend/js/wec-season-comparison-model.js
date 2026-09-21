(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.WecSeasonComparisonModel = api;
})(typeof window === 'undefined' ? null : window, function () {
  const sum = values => values.reduce((total, value) => total + value, 0);
  const mean = values => values.length ? sum(values) / values.length : null;
  const number = value => Number.isFinite(Number(value)) ? Number(value) : null;
  const disqualified = result => ['disqualified', 'excluded'].includes(String(result?.status || '').toLowerCase());
  const nonStart = result => ['not-started', 'did-not-start'].includes(String(result?.status || '').toLowerCase());
  const classified = result => String(result?.status || '').toLowerCase() === 'classified' && number(result?.position) > 0;

  function readState(search) {
    const query = new URLSearchParams(search), requestedView = query.get('view');
    return {
      first: query.get('first'), second: query.get('second'),
      firstChampionship: query.get('firstChampionship'), secondChampionship: query.get('secondChampionship'),
      view: ['overview', 'progression', 'competition', 'field'].includes(requestedView) ? requestedView : 'overview',
      basis: query.get('basis') === 'matched' ? 'matched' : 'available',
      round: /^\d+$/.test(query.get('round') || '') ? Number(query.get('round')) : null,
      field: query.get('field') === 'ten' ? 'ten' : 'all',
      sort: ['position', 'name', 'points', 'finish', 'spread', 'unclassifiedRate'].includes(query.get('sort')) ? query.get('sort') : 'position',
      direction: query.get('direction') === 'desc' ? -1 : 1
    };
  }

  function defaultChampionship(data) {
    return data?.championships?.find(item => item.entityType === 'manufacturer' && /hypercar|lmp1/i.test(`${item.name} ${item.classCode || ''}`))
      || data?.championships?.find(item => item.entityType === 'driver' && /hypercar|lmp1/i.test(`${item.name} ${item.classCode || ''}`))
      || data?.championships?.[0] || null;
  }

  function latestRound(championship) {
    return Math.max(0, ...championship.entities.flatMap(entity => entity.rounds.map(round => Number(round.round) || 0)));
  }

  function standingsAt(championship, cutoff = null) {
    return championship.entities.map(entity => {
      const rounds = entity.rounds.filter(round => cutoff == null || Number(round.round) <= cutoff);
      const standing = rounds.at(-1);
      return standing ? { ...entity, position: number(standing.position), points: number(standing.points) || 0,
        championshipWon: cutoff == null && Boolean(entity.championshipWon) } : null;
    }).filter(Boolean).sort((left, right) => (left.position || 9999) - (right.position || 9999) || right.points - left.points || left.name.localeCompare(right.name));
  }

  function leadersByRound(championship, cutoff) {
    const last = cutoff == null ? latestRound(championship) : cutoff;
    return Array.from({ length: last }, (_, index) => {
      const round = index + 1;
      const rows = championship.entities.map(entity => {
        const standing = entity.rounds.find(item => Number(item.round) === round);
        return standing ? { id: entity.id, name: entity.name, position: number(standing.position), points: number(standing.points) || 0 } : null;
      }).filter(Boolean).sort((left, right) => (left.position || 9999) - (right.position || 9999) || right.points - left.points);
      const leader = rows[0];
      const tied = leader ? rows.filter(row => row.position === leader.position && Math.abs(row.points - leader.points) < .00001) : [];
      const runnerUp = leader ? rows.find(row => row.position > leader.position || row.points < leader.points - .00001) : null;
      return { round, available: Boolean(leader), leader, runnerUp, tied, leaderKey: tied.map(row => row.id).sort().join('|'),
        gap: leader && runnerUp ? Math.max(0, leader.points - runnerUp.points) : 0 };
    });
  }

  function snapshot(data, championshipId, cutoff = null) {
    const championship = data.championships.find(item => item.id === championshipId) || defaultChampionship(data);
    if (!championship) return null;
    const maximumRound = latestRound(championship), round = cutoff == null ? maximumRound : Math.min(maximumRound, cutoff);
    const standings = standingsAt(championship, round);
    if (cutoff == null) standings.forEach(row => { row.championshipWon = Boolean(championship.entities.find(entity => String(entity.id) === String(row.id))?.championshipWon); });
    const leader = standings.find(row => row.championshipWon) || standings[0];
    const tiedLeaders = leader ? standings.filter(row => row.position === leader.position && Math.abs(row.points - leader.points) < .00001) : [];
    const runnerUp = leader ? standings.find(row => row.position > leader.position || row.points < leader.points - .00001) : null;
    const includedEvents = data.events.filter(event => Number(event.round) <= round);
    const resultRows = standings.flatMap(entity => includedEvents.map(event => {
      const result = entity.results?.[event.id];
      return result ? { ...result, entityId: entity.id, entityName: entity.name, eventId: event.id, round: event.round } : null;
    }).filter(Boolean));
    const starts = resultRows.filter(result => !nonStart(result));
    const classifiedRows = starts.filter(classified), wins = classifiedRows.filter(result => Number(result.position) === 1);
    const winnerIds = new Set(wins.map(result => String(result.entityId)));
    const podiumIds = new Set(classifiedRows.filter(result => Number(result.position) <= 3).map(result => String(result.entityId)));
    const totalPoints = sum(standings.map(row => row.points));
    const fields = standings.map(entity => {
      const results = includedEvents.map(event => entity.results?.[event.id]).filter(Boolean);
      const entityStarts = results.filter(result => !nonStart(result));
      const positions = entityStarts.filter(classified).map(result => Number(result.position));
      const finish = mean(positions);
      return { id: entity.id, name: entity.name, position: entity.position, points: entity.points,
        finish, finishCount: positions.length, starts: entityStarts.length,
        spread: positions.length ? Math.sqrt(mean(positions.map(value => (value - finish) ** 2))) : null,
        unclassifiedRate: entityStarts.length ? (entityStarts.length - positions.length) / entityStarts.length * 100 : null };
    });
    const leaderSource = championship.entities.find(entity => String(entity.id) === String(leader?.id));
    const denominator = leader?.points || 0;
    const progress = (leaderSource?.rounds || []).filter(item => Number(item.round) <= round).map(item => ({
      round: Number(item.round), points: Number(item.points || 0), value: denominator > 0 ? Number(item.points || 0) / denominator * 100 : null,
      event: data.events.find(event => Number(event.round) === Number(item.round)) || null
    }));
    const leaders = leadersByRound(championship, round);
    const marginSeries = leaders.map(item => ({ ...item, value: item.leader?.points > 0 ? item.gap / item.leader.points * 100 : null,
      event: data.events.find(event => Number(event.round) === item.round) || null }));
    let previous, leadChanges = 0;
    leaders.filter(item => item.available).forEach(item => { if (previous && previous !== item.leaderKey) leadChanges++; previous = item.leaderKey; });
    const margin = leader && runnerUp ? leader.points - runnerUp.points : null;
    return { data, championship, year: data.season.year, round, maximumRound, events: includedEvents, standings, leader, tiedLeaders, runnerUp, progress, marginSeries, fields,
      complete: data.season.status === 'completed' && round >= maximumRound,
      metrics: {
        rounds: includedEvents.length, fieldSize: standings.length, winners: includedEvents.length ? winnerIds.size : null,
        podiumEntities: includedEvents.length ? podiumIds.size : null, margin,
        marginPercent: leader?.points > 0 && margin != null ? margin / leader.points * 100 : null,
        concentration: totalPoints > 0 ? sum(standings.slice(0, 3).map(row => row.points)) / totalPoints * 100 : null,
        unclassifiedRate: starts.length ? (starts.length - classifiedRows.length) / starts.length * 100 : null,
        starts: starts.length, unclassified: starts.length - classifiedRows.length, leadChanges
      } };
  }

  function compare(data, championshipIds, basis, requestedRound) {
    const chosen = data.map((season, index) => season.championships.find(item => item.id === championshipIds[index]) || defaultChampionship(season));
    const maxRound = Math.min(...chosen.map(latestRound));
    const cutoff = basis === 'matched' ? Math.min(maxRound, Math.max(1, Number(requestedRound) || maxRound)) : null;
    return { maxRound, cutoff, snapshots: data.map((season, index) => snapshot(season, chosen[index]?.id, cutoff)) };
  }

  function sortedField(snapshot, size, key, direction) {
    const rows = size === 'ten' ? snapshot.fields.filter(row => row.position != null && row.position <= 10) : snapshot.fields;
    return [...rows].sort((left, right) => {
      if (left[key] == null) return right[key] == null ? left.name.localeCompare(right.name) : 1;
      if (right[key] == null) return -1;
      return direction * (typeof left[key] === 'string' ? left[key].localeCompare(right[key]) : left[key] - right[key]) || left.name.localeCompare(right.name);
    });
  }

  return { readState, defaultChampionship, latestRound, standingsAt, leadersByRound, snapshot, compare, sortedField, classified, nonStart, disqualified };
});
