(function (root, factory) {
  const api = factory(typeof module === 'object' && module.exports
    ? require('./wec-simulate-season-model') : root.WecSeasonSimulatorModel);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.WecScenarioModel = api;
})(typeof window === 'undefined' ? null : window, function (scoring) {
  const round2 = value => Math.round((value + Number.EPSILON) * 100) / 100;
  const position = value => Number.isInteger(Number(value)) && Number(value) > 0 && Number(value) <= 100 ? Number(value) : null;

  function officialAt(entity, cutoff) {
    return (entity.rounds || []).filter(row => Number(row.round) <= cutoff)
      .sort((a, b) => Number(b.round) - Number(a.round))[0] || null;
  }

  function cutoffRounds(data, championship) {
    const available = new Set(championship.entities.flatMap(entity => (entity.rounds || []).map(row => Number(row.round))));
    return (data.events || []).filter(event => available.has(Number(event.round))).map(event => Number(event.round));
  }

  function initialPredictions(data, championship, cutoff) {
    return Object.fromEntries((data.events || []).filter(event => Number(event.round) > cutoff).map(event => {
      const hasResults = championship.entities.some(entity => entity.results?.[event.id]);
      return [event.id, Object.fromEntries(championship.entities.map(entity => {
        const result = entity.results?.[event.id];
        const finish = result?.status === 'classified' ? position(result.position) : null;
        return [entity.id, finish || (hasResults ? 0 : null)];
      }))];
    }));
  }

  function crewGroups(data, championship, eventId) {
    if (championship.entityType !== 'driver') return {};
    const events = data.events || [];
    const eventIndex = events.findIndex(event => event.id === eventId);
    const hasResults = championship.entities.some(entity => entity.results?.[eventId]);
    return Object.fromEntries(championship.entities.map(entity => {
      const result = entity.results?.[eventId] || (!hasResults && eventIndex >= 0
        ? events.slice(0, eventIndex).reverse().map(event => entity.results?.[event.id]).find(Boolean) : null);
      return [entity.id, String(result?.competitorId || result?.entryId || entity.id)];
    }));
  }

  function setPrediction(predictions, eventId, entityId, next, entityType, groups = {}) {
    const race = predictions[eventId];
    if (!race || !Object.hasOwn(race, entityId)) return false;
    if (next !== null && next !== 0 && !position(next)) return false;
    const groupOf = id => entityType === 'driver' ? String(groups[id] || id) : String(id);
    const ownGroup = groupOf(entityId), previous = race[entityId];
    if (position(next)) {
      for (const id of Object.keys(race)) {
        if (groupOf(id) !== ownGroup && race[id] === Number(next)) race[id] = previous;
      }
    }
    for (const id of Object.keys(race)) {
      if (groupOf(id) === ownGroup) race[id] = next === null ? null : Number(next);
    }
    return true;
  }

  function project(data, championshipId, cutoff, predictions, rules) {
    const championship = scoring.eligibleChampionships(data).find(item => item.id === championshipId);
    if (!championship || !Number.isInteger(cutoff) || cutoff < 0) return null;
    const future = (data.events || []).filter(event => Number(event.round) > cutoff);
    const largestAward = Math.max(0, ...rules.points.map(Number).filter(Number.isFinite));
    const maximum = round2(future.reduce((sum, event) => sum + largestAward * scoring.multiplierFor(event, rules), 0));
    const rows = championship.entities.map(entity => {
      const official = officialAt(entity, cutoff);
      const finishes = Object.create(null);
      (data.events || []).filter(event => Number(event.round) <= cutoff).forEach(event => {
        const result = entity.results?.[event.id];
        const finish = result?.status === 'classified' ? position(result.position) : null;
        if (finish) finishes[finish] = (finishes[finish] || 0) + 1;
      });
      const projected = future.map(event => {
        const finish = position(predictions?.[event.id]?.[entity.id]);
        if (finish) finishes[finish] = (finishes[finish] || 0) + 1;
        return { eventId: event.id, position: finish, points: finish ? round2(Number(rules.points[finish - 1] || 0) * scoring.multiplierFor(event, rules)) : 0 };
      });
      const officialPoints = Number(official?.points || 0);
      const predictedPoints = round2(projected.reduce((sum, item) => sum + item.points, 0));
      return { id: entity.id, name: entity.name, officialPosition: official?.position ?? null,
        officialPoints, predictedPoints, points: round2(officialPoints + predictedPoints),
        maximum: round2(officialPoints + maximum), finishes, projected };
    });
    rows.sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      for (let place = 1; place <= 100; place += 1) {
        const difference = (b.finishes[place] || 0) - (a.finishes[place] || 0);
        if (difference) return difference;
      }
      return a.name.localeCompare(b.name);
    });
    rows.forEach((row, index) => {
      const previous = rows[index - 1];
      row.position = previous && row.points === previous.points
        && Array.from({ length: 100 }, (_, place) => place + 1).every(place => (row.finishes[place] || 0) === (previous.finishes[place] || 0))
        ? previous.position : index + 1;
    });
    const unassignedEvents = future.filter(event => !championship.entities.some(entity => predictions?.[event.id]?.[entity.id] !== null
      && predictions?.[event.id]?.[entity.id] !== undefined)).length;
    const unassignedEntries = future.reduce((total, event) => total + championship.entities.filter(entity => predictions?.[event.id]?.[entity.id] === null
      || predictions?.[event.id]?.[entity.id] === undefined).length, 0);
    return { championship, future, rows, leaders: rows.filter(row => row.position === 1),
      officialLeaders: championship.entities.filter(entity => Number(officialAt(entity, cutoff)?.position) === 1),
      unassignedEvents, unassignedEntries, maximum };
  }

  return { cutoffRounds, crewGroups, initialPredictions, officialAt, project, setPrediction };
});
