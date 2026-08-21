const test = require('node:test');
const assert = require('node:assert/strict');
const chassisSpecifications = require('../data/f2-chassis-specifications.json');

test('defines the three FIA Formula 2 chassis generations', () => {
  assert.deepEqual(chassisSpecifications.map(chassis => chassis.id), [
    'Dallara GP2-11',
    'Dallara F2 2018',
    'Dallara F2 2024'
  ]);
  assert.deepEqual(chassisSpecifications.map(chassis => chassis.generation), [1, 2, 3]);
  assert.deepEqual(chassisSpecifications.map(chassis => chassis.retiredYear), [2017, 2023, null]);
  assert.deepEqual(chassisSpecifications.map(chassis => chassis.powerHp), [612, 620, 620]);
  assert.deepEqual(chassisSpecifications.map(chassis => chassis.weightKg), [688, 720, 795]);
});
