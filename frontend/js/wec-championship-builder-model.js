(function (root, factory) {
  const api = factory(typeof module === 'object' && module.exports
    ? require('./wec-simulate-season-model') : root.WecSeasonSimulatorModel);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.WecChampionshipBuilderModel = api;
})(typeof window === 'undefined' ? null : window, function (scoring) {
  const round2 = value => Math.round((value + Number.EPSILON) * 100) / 100;
  const modes = { drivers: ['crew', 'drivers'], teams: ['team', 'teams'], manufacturers: ['manufacturer', 'manufacturers'] };
  const validFinish = value => Number.isInteger(Number(value)) && Number(value) > 0;

  function classOptions(calendar, raceData) {
    const classes = new Map();
    calendar.forEach(item => (raceData[item.id]?.classification || []).forEach(result => {
      if (result.class?.code) classes.set(result.class.code, result.class.name || result.class.code);
    }));
    return [...classes].map(([code, name]) => ({ code, name }));
  }

  function discoveredField(calendar, raceData, classCode) {
    const field = { drivers: new Map(), teams: new Map(), manufacturers: new Map() };
    calendar.forEach(item => (raceData[item.id]?.classification || [])
      .filter(result => result.class?.code === classCode).forEach(result => {
        (result.crew || []).forEach(driver => field.drivers.set(String(driver.id), driver.name));
        if (result.team?.id) field.teams.set(String(result.team.id), result.team.name);
        if (result.manufacturer?.id) field.manufacturers.set(String(result.manufacturer.id), result.manufacturer.name);
      }));
    return field;
  }

  function calculate(calendar, raceData, classCode, eligible, rules) {
    const standings = { drivers: new Map(), teams: new Map(), manufacturers: new Map() };
    const coverage = { scored: 0, missing: 0, noClass: 0 };
    function add(mode, id, name, points, finish) {
      if (!eligible[mode]?.has(String(id))) return;
      const table = standings[mode];
      if (!table.has(String(id))) table.set(String(id), { id: String(id), name, points: 0, finishes: Object.create(null), races: 0 });
      const row = table.get(String(id));
      row.points = round2(row.points + points);
      row.finishes[finish] = (row.finishes[finish] || 0) + 1;
      row.races += 1;
    }
    calendar.forEach(item => {
      const data = raceData[item.id];
      const results = (data?.classification || []).filter(result => result.class?.code === classCode);
      if (!data?.coverage?.classifications) { coverage.missing += 1; return; }
      if (!results.length) { coverage.noClass += 1; return; }
      coverage.scored += 1;
      const bestTeams = new Map(), bestManufacturers = new Map();
      const scale = item.pointsScale || data.event?.pointsScale || 'standard';
      results.filter(result => result.status === 'classified' && validFinish(result.classPosition)).forEach(result => {
        const finish = Number(result.classPosition);
        const points = round2(Number(rules.points[finish - 1] || 0) * scoring.multiplierFor({ pointsScale: scale }, rules));
        (result.crew || []).forEach(driver => add('drivers', driver.id, driver.name, points, finish));
        for (const [map, entity] of [[bestTeams, result.team], [bestManufacturers, result.manufacturer]]) {
          if (!entity?.id) continue;
          const previous = map.get(String(entity.id));
          if (!previous || finish < previous.finish) map.set(String(entity.id), { id: entity.id, name: entity.name, points, finish });
        }
      });
      for (const row of bestTeams.values()) add('teams', row.id, row.name, row.points, row.finish);
      for (const row of bestManufacturers.values()) add('manufacturers', row.id, row.name, row.points, row.finish);
    });
    const sorted = mode => {
      const rows = [...standings[mode].values()].sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      for (let finish = 1; finish <= 100; finish += 1) {
        const difference = (b.finishes[finish] || 0) - (a.finishes[finish] || 0);
        if (difference) return difference;
      }
      return a.name.localeCompare(b.name);
      });
      rows.forEach((row, index) => {
        const previous = rows[index - 1];
        const tied = previous && row.points === previous.points
          && Array.from({ length: 100 }, (_, finish) => finish + 1)
            .every(finish => (row.finishes[finish] || 0) === (previous.finishes[finish] || 0));
        row.position = tied ? previous.position : index + 1;
      });
      return rows;
    };
    return { drivers: sorted('drivers'), teams: sorted('teams'), manufacturers: sorted('manufacturers'), coverage };
  }

  return { calculate, classOptions, discoveredField, modes };
});
