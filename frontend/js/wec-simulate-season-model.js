(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.WecSeasonSimulatorModel = api;
})(typeof window === 'undefined' ? null : window, function () {
  const presets = Object.freeze({
    weighted: { label: 'WEC-inspired distance weighting', points: [25, 18, 15, 12, 10, 8, 6, 4, 2, 1], extended: 1.5, leMans: 2 },
    equal: { label: 'Equal-weight races', points: [25, 18, 15, 12, 10, 8, 6, 4, 2, 1], extended: 1, leMans: 1 },
    classic: { label: 'Classic top-six', points: [10, 6, 4, 3, 2, 1], extended: 1, leMans: 1 }
  });
  const validPosition = value => Number.isInteger(Number(value)) && Number(value) > 0 && Number(value) <= 100;
  const rounded = value => Math.round(value * 100) / 100;
  const validPoints = value => Array.isArray(value) && value.length > 0 && value.length <= 30
    && value.some(point => Number(point) > 0)
    && value.every(point => Number.isFinite(Number(point)) && Number(point) >= 0 && Number(point) <= 1000
      && Math.abs(Math.round(Number(point) * 100) - Number(point) * 100) < 1e-8);

  function parsePoints(value) {
    const pieces = String(value || '').split(',').map(piece => piece.trim());
    if (!pieces.length || pieces.length > 30 || pieces.some(piece => !/^(?:\d+)(?:\.\d{1,2})?$/.test(piece))) return null;
    const points = pieces.map(Number);
    return points.every(point => point >= 0 && point <= 1000) && points.some(point => point > 0) ? points : null;
  }

  function settings(input = {}) {
    const preset = presets[input.preset] ? input.preset : 'weighted';
    const defaults = presets[preset];
    const points = Array.isArray(input.points) ? input.points : parsePoints(input.points);
    const multiplier = (value, fallback) => Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= 5
      && Math.abs(Math.round(Number(value) * 100) - Number(value) * 100) < 1e-8 ? Number(value) : fallback;
    return { preset, points: validPoints(points) ? points.map(Number) : [...defaults.points],
      extended: multiplier(input.extended, defaults.extended), leMans: multiplier(input.leMans, defaults.leMans) };
  }

  function eligibleChampionships(data) {
    return (data?.championships || []).filter(item => item.classIds?.length === 1 && item.entities?.length);
  }

  function multiplierFor(event, rules) {
    return event.pointsScale === 'le-mans' ? rules.leMans : event.pointsScale === 'extended' ? rules.extended : 1;
  }

  function simulate(data, championshipId, rules) {
    const championship = eligibleChampionships(data).find(item => item.id === championshipId);
    if (!championship) return null;
    const events = data.events || [];
    const rows = championship.entities.map(entity => {
      const rounds = events.map(event => {
        const result = entity.results?.[event.id];
        const position = result?.status === 'classified' && validPosition(result.position) ? Number(result.position) : null;
        const points = position === null ? 0 : rounded((rules.points[position - 1] || 0) * multiplierFor(event, rules));
        return { eventId: event.id, round: Number(event.round), position, status: result?.status || null, points };
      });
      const finishes = Object.create(null);
      rounds.forEach(round => { if (round.position !== null) finishes[round.position] = (finishes[round.position] || 0) + 1; });
      return { id: entity.id, name: entity.name, officialPosition: entity.finalPosition,
        officialPoints: Number(entity.finalPoints || 0), points: rounded(rounds.reduce((sum, round) => sum + round.points, 0)),
        wins: finishes[1] || 0, podiums: (finishes[1] || 0) + (finishes[2] || 0) + (finishes[3] || 0), finishes, rounds };
    });
    const countback = (a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      for (let position = 1; position <= 100; position += 1) {
        const difference = (b.finishes[position] || 0) - (a.finishes[position] || 0);
        if (difference) return difference;
      }
      return a.name.localeCompare(b.name);
    };
    rows.sort(countback);
    rows.forEach((row, index) => {
      const previous = rows[index - 1];
      const sameCountback = previous && row.points === previous.points
        && Array.from({ length: 100 }, (_, position) => position + 1).every(position => (row.finishes[position] || 0) === (previous.finishes[position] || 0));
      row.position = sameCountback ? previous.position : index + 1;
      row.change = row.officialPosition == null ? null : Number(row.officialPosition) - row.position;
    });
    return { championship, events, rows, leaders: rows.filter(row => row.position === 1),
      officialLeaders: championship.entities.filter(entity => Number(entity.finalPosition) === 1),
      changed: rows.filter(row => row.change !== null && row.change !== 0).length };
  }

  return { presets, parsePoints, settings, eligibleChampionships, multiplierFor, simulate };
});
