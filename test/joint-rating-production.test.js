const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { after } = require('node:test');
const root = path.join(__dirname, '..');
const { JOINT_COLUMNS, databaseDateTime, jointValues, values } = require('../scripts/rebuild-ratings');
const ratingsRouter = require('../backend/routes/ratings');
after(() => require('../backend/db').end());

test('joint rating persistence columns and row serialization stay aligned', () => {
  assert.equal(jointValues({ eventDate: '2026-09-04' }).length, JOINT_COLUMNS.length);
  const schema = fs.readFileSync(path.join(root, 'database/ratings.sql'), 'utf8');
  assert.match(schema, /CREATE TABLE IF NOT EXISTS app_joint_rating_events/);
  for (const column of ['driver_rating_after', 'constructor_rating_after', 'driver_uncertainty_after',
    'constructor_uncertainty_after']) assert.ok(JOINT_COLUMNS.includes(column));
});

test('rating rebuild serializes ISO event timestamps for MariaDB DATETIME columns', () => {
  assert.equal(databaseDateTime('2017-04-15T10:10:00Z'), '2017-04-15 10:10:00');
  assert.equal(databaseDateTime('2026-09-04'), '2026-09-04 00:00:00');
  assert.equal(databaseDateTime('2026-09-04T12:30:00+02:00'), '2026-09-04 10:30:00');
  assert.equal(values({ eventDate: '2017-04-15T10:10:00Z' })[3], '2017-04-15 10:10:00');
  assert.equal(jointValues({ eventDate: '2017-04-15T10:10:00Z' })[3], '2017-04-15 10:10:00');
  assert.throws(() => databaseDateTime('not-a-date'), /Invalid rating event date/);
});

test('team-adjusted API source is allow-listed to F1', () => {
  const adjusted = ratingsRouter.ratingSource({ query: { model: 'team-adjusted' } }, 'f1');
  assert.equal(adjusted.table, 'app_joint_rating_events');
  assert.equal(adjusted.beta, true);
  assert.equal(ratingsRouter.ratingSource({ query: { model: 'team-adjusted' } }, 'f2').key, 'competitive');
  assert.equal(ratingsRouter.ratingSource({ query: { model: 'anything' } }, 'f1').key, 'competitive');
});

test('ratings explorer exposes an explicit F1 beta without changing the default', () => {
  const html = fs.readFileSync(path.join(root, 'frontend/templates/ratings-explorer.html'), 'utf8');
  const script = fs.readFileSync(path.join(root, 'frontend/js/ratings.js'), 'utf8');
  assert.match(html, /<option value="competitive">Competitive<\/option>/);
  assert.match(html, /<option value="team-adjusted">Team-adjusted beta<\/option>/);
  assert.match(script, /model: 'competitive'/);
  assert.match(script, /query\.set\('model', ratingState\.model\)/);
});

test('rating freshness compares database timestamps without transport timezone shifts', () => {
  assert.match(ratingsRouter.latestSourceEventSql('f2'), /CAST\(MAX\(COALESCE\(sessions\.startTimeUtc, races\.date\)\) AS CHAR\)/);
  assert.equal(ratingsRouter.comparableEventTimestamp('2026-09-04'), '2026-09-04 00:00:00');
  assert.equal(ratingsRouter.comparableEventTimestamp('2026-08-23T08:30:00Z'), '2026-08-23 08:30:00');
  assert.equal(ratingsRouter.comparableEventTimestamp('2026-08-23 08:30:00'), '2026-08-23 08:30:00');
});

test('rating freshness responses must revalidate after a rebuild', () => {
  const source = fs.readFileSync(path.join(__dirname, '../backend/routes/ratings.js'), 'utf8');
  assert.equal(source.match(/res\.set\('Cache-Control', 'no-cache, max-age=0, must-revalidate'\)/g)?.length, 3);
});
