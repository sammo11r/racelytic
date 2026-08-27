const test = require('node:test');
const assert = require('node:assert/strict');
const game = require('../frontend/js/lights-out-engine');

test('reaction tiers use clear timing boundaries', () => {
  assert.equal(game.reactionTier(199).id, 'elite');
  assert.equal(game.reactionTier(200).id, 'quick');
  assert.equal(game.reactionTier(249).id, 'quick');
  assert.equal(game.reactionTier(250).id, 'steady');
  assert.equal(game.reactionTier(350).id, 'slow');
  assert.equal(game.reactionTier(-1), null);
});

test('random hold is unpredictable within the intended safe range', () => {
  assert.equal(game.randomizedHold(() => 0), 900);
  assert.equal(game.randomizedHold(() => .999999), 4000);
});

test('reaction history retains the ten latest valid attempts', () => {
  let stats = game.normalizeStats();
  for (let value = 200; value < 212; value += 1) stats = game.addResult(stats, value);
  assert.equal(stats.results.length, game.MAX_RESULTS);
  assert.deepEqual(stats.results.slice(0, 2), [211, 210]);
  assert.equal(game.summarize(stats).best, 202);
});

test('summary tracks averages and false starts separately', () => {
  let stats = game.addResult(game.normalizeStats(), 200);
  stats = game.addResult(stats, 300);
  stats = game.addFalseStart(stats);
  const summary = game.summarize(stats);
  assert.equal(summary.average, 250);
  assert.equal(summary.best, 200);
  assert.equal(summary.count, 2);
  assert.equal(summary.falseStarts, 1);
});
