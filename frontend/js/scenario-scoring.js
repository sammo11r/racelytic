(function exposeScenarioScoring(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ScenarioScoring = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function createScenarioScoring() {
  function awarded(position, scale) {
    const index = Number(position) - 1;
    return index >= 0 && index < (scale || []).length ? Number(scale[index] || 0) : 0;
  }

  function isReverse(event) {
    return event?.raceType === 'S' || /reverse/i.test(String(event?.sessionName || ''));
  }

  function academyPoleEligible(event) {
    const name = String(event?.sessionName || '').toLowerCase();
    if (name.includes('opening') || name.includes('reverse')) return false;
    if (Number(event?.year) === 2023) return !/race\s*2\b/.test(name);
    if (Number(event?.year) === 2024) return true;
    return name.includes('feature') || /race\s*(?:2|3)\b/.test(name);
  }

  function academyEventScore(event, result, position, system) {
    const reverse = isReverse(event);
    const scale = reverse ? system.sprint : system.race;
    let points = awarded(position, scale);
    if (result?.polePosition) points += Number(system.poleBonus || 0);
    const fastestLapLimit = reverse
      ? Number(system.sprintFastestLapMaxPosition || 8)
      : Number(system.fastestLapMaxPosition || 10);
    if (result?.fastestLap && Number(position) > 0 && Number(position) <= fastestLapLimit) {
      points += Number(system.fastestLapBonus || 0);
    }
    return points;
  }

  function academyEventMaximum(event, system) {
    const scale = isReverse(event) ? system.sprint : system.race;
    return Number(scale?.[0] || 0)
      + Number(system.fastestLapBonus || 0)
      + (academyPoleEligible(event) ? Number(system.poleBonus || 0) : 0);
  }

  return { academyEventMaximum, academyEventScore, academyPoleEligible, awarded, isReverse };
}));
