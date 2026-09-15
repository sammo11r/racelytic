(function (root, factory) {
  const value = factory();
  if (typeof module === 'object' && module.exports) module.exports = value;
  else {
    root.FORMULA_E_POINTS_SYSTEMS = value.systems;
    root.FORMULA_E_POINTS_PRESETS = value.presets;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const race = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];
  const systems = Object.freeze({
    'fe-current': Object.freeze({
      name: 'Formula E · current', race, sprint: [], qualifying: [], poleBonus: 3,
      fastestLapBonus: 1, fastestLapMaxPosition: 10, countBest: Infinity,
      constructorCountBest: Infinity, preserveOfficialPointsFrom: 2019
    }),
    'fe-2014-15': Object.freeze({
      name: 'Formula E · 2014–15', race, sprint: [], qualifying: [], poleBonus: 3,
      fastestLapBonus: 2, fastestLapMaxPosition: null, countBest: 10,
      constructorCountBest: Infinity, exclusionsCannotBeDropped: true
    }),
    'fe-2015-16': Object.freeze({
      name: 'Formula E · 2015–16', race, sprint: [], qualifying: [], poleBonus: 3,
      fastestLapBonus: 2, fastestLapMaxPosition: null, countBest: Infinity,
      constructorCountBest: Infinity
    }),
    'fe-2016-17': Object.freeze({
      name: 'Formula E · 2016–17', race, sprint: [], qualifying: [], poleBonus: 3,
      fastestLapBonus: 1, fastestLapMaxPosition: null, countBest: Infinity,
      constructorCountBest: Infinity
    }),
    'fe-2017-18': Object.freeze({
      name: 'Formula E · 2017–18', race, sprint: [], qualifying: [], poleBonus: 3,
      fastestLapBonus: 1, fastestLapMaxPosition: 10, countBest: Infinity,
      constructorCountBest: Infinity
    })
  });
  const presets = Object.freeze([
    Object.freeze({
      key: 'current', seasonKey: 'fe-current', scenarioKey: 'fe-current', builderKey: 'fe-current',
      name: 'Formula E · current', era: 'Current E-Prix scoring', racePoints: race,
      sprintPoints: [], qualifyingPoints: [], poleBonus: 3, fastestLapBonus: 1,
      fastestLapMaxPosition: 10,
      years: Array.from({ length: Math.max(0, new Date().getFullYear() - 2018) }, (_, index) => 2019 + index)
    }),
    Object.freeze({
      key: '2014-15', seasonKey: 'fe-2014-15', scenarioKey: 'fe-2014-15', builderKey: null,
      name: 'Formula E · 2014–15', era: 'Inaugural championship', racePoints: race,
      sprintPoints: [], qualifyingPoints: [], poleBonus: 3, fastestLapBonus: 2,
      fastestLapMaxPosition: null, countBestRounds: 10, years: [2015]
    }),
    Object.freeze({
      key: '2015-16', seasonKey: 'fe-2015-16', scenarioKey: 'fe-2015-16', builderKey: null,
      name: 'Formula E · 2015–16', era: 'Season two', racePoints: race,
      sprintPoints: [], qualifyingPoints: [], poleBonus: 3, fastestLapBonus: 2,
      fastestLapMaxPosition: null, years: [2016]
    }),
    Object.freeze({
      key: '2016-17', seasonKey: 'fe-2016-17', scenarioKey: 'fe-2016-17', builderKey: null,
      name: 'Formula E · 2016–17', era: 'Season three', racePoints: race,
      sprintPoints: [], qualifyingPoints: [], poleBonus: 3, fastestLapBonus: 1,
      fastestLapMaxPosition: null, years: [2017]
    }),
    Object.freeze({
      key: '2017-18', seasonKey: 'fe-2017-18', scenarioKey: 'fe-2017-18', builderKey: null,
      name: 'Formula E · 2017–18', era: 'Season four', racePoints: race,
      sprintPoints: [], qualifyingPoints: [], poleBonus: 3, fastestLapBonus: 1,
      fastestLapMaxPosition: 10, years: [2018]
    })
  ]);
  return { systems, presets };
});
