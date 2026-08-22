const assert = require('node:assert/strict');
const test = require('node:test');
const { academyEventMaximum, academyEventScore } = require('../frontend/js/scenario-scoring');

const system = {
  race: [25, 18, 15, 12, 10, 8, 6, 4, 2, 1],
  sprint: [10, 8, 6, 5, 4, 3, 2, 1],
  poleBonus: 2,
  fastestLapBonus: 1,
  fastestLapMaxPosition: 10,
  sprintFastestLapMaxPosition: 8
};

test('Academy scenario applies full and reverse-grid points independently', () => {
  const feature = { year: 2026, sessionName: 'Feature Race', raceType: 'F' };
  const reverse = { year: 2026, sessionName: 'Reverse Grid Race', raceType: 'S' };
  assert.equal(academyEventScore(feature, {}, 1, system), 25);
  assert.equal(academyEventScore(reverse, {}, 1, system), 10);
  assert.equal(academyEventScore(reverse, {}, 9, system), 0);
  assert.equal(academyEventScore(feature, { polePosition: true, fastestLap: true }, 1, system), 28);
  assert.equal(academyEventScore(reverse, { fastestLap: true }, 8, system), 2);
  assert.equal(academyEventScore(reverse, { fastestLap: true }, 9, system), 0);
  assert.equal(academyEventMaximum(feature, system), 28);
  assert.equal(academyEventMaximum(reverse, system), 11);
});
