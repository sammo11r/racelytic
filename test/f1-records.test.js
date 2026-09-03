const test = require('node:test');
const assert = require('node:assert/strict');
const { configuration, rankEntries, explore } = require('../backend/f1-records');

test('championship definitions ignore circuit and sprint filters but retain title constructor', () => {
  const config = configuration({ category: 'championships', constructorId: 'ferrari', circuitId: 'monaco', includeSprints: true });
  assert.equal(config.constructorId, 'ferrari');
  assert.equal(config.circuitId, '');
  assert.equal(config.includeSprints, false);
  assert.equal(configuration({ type: 'constructors', constructorId: 'ferrari' }).constructorId, '');
});

test('average definitions retain the sample requirement in saved and shared configurations', () => {
  assert.equal(configuration({ category: 'gridGain' }).minStarts, 10);
  assert.equal(configuration({ category: 'gridGain', minStarts: '25' }).minStarts, 25);
  assert.equal(configuration({ category: 'gridGain', minStarts: -1 }).minStarts, 10);
  assert.equal(configuration({ category: 'poles', includeSprints: 'true' }).includeSprints, false);
  assert.equal(configuration({ category: 'wins', includeSprints: 'true' }).includeSprints, true);
  assert.equal(configuration({ nationality: 'united-states-of-america' }).nationality, 'united-states-of-america');
});

test('inverted year ranges fail with a useful validation error', () => {
  assert.throws(() => configuration({ fromYear: 2020, toYear: 2010 }), error => error.status === 400);
  assert.equal(configuration({ fromYear: 'junk' }).fromYear, null);
  assert.equal(configuration({ fromYear: 2000, toYear: 2000 }).toYear, 2000);
});

test('competition ranks preserve ties at displayed precision, including zero and negative averages', () => {
  const rows = rankEntries([{ name: 'Z', value: '7' }, { name: 'A', value: 7 }, { name: 'B', value: 4 }, { name: 'D', value: -0.124 }, { name: 'C', value: 0 }, { name: 'E', value: -0.121 }]);
  assert.deepEqual(rows.map(row => [row.name, row.value, row.rank]), [['A', 7, 1], ['Z', 7, 1], ['B', 4, 3], ['C', 0, 4], ['D', -0.12, 5], ['E', -0.12, 5]]);
});

test('F1 archive regression checks', { skip: process.env.F1_RECORDS_DB_TESTS !== '1' }, async t => {
  const pool = require('../backend/db');
  try {
    await t.test('Ferrari title filter excludes titles won in other constructor seasons', async () => {
      const result = await explore(pool, { category: 'championships', constructorId: 'ferrari', toYear: 2020 });
      assert.equal(result.entries.find(row => row.id === 'michael-schumacher').value, 5);
      assert.equal(result.entries.find(row => row.id === 'niki-lauda').value, 2);
      assert.equal(result.entries.some(row => ['sebastian-vettel', 'fernando-alonso', 'alain-prost'].includes(row.id)), false);
    });
    await t.test('Adelaide 1989 excludes non-qualifiers and counts constructor races once', async () => {
      const query = { category: 'starts', circuitId: 'adelaide', fromYear: 1989, toYear: 1989 };
      const drivers = await explore(pool, query), constructors = await explore(pool, { ...query, type: 'constructors' });
      assert.equal(drivers.total, 26);
      assert.ok(drivers.entries.every(row => row.rank === 1));
      assert.equal(constructors.entries.find(row => row.id === 'williams').starts, 1);
      assert.equal(constructors.entries.find(row => row.id === 'williams').carStarts, 2);
    });
    await t.test('averages require measured results, not entries, and retain negative outcomes', async () => {
      const result = await explore(pool, { category: 'gridGain', toYear: 2020, minStarts: 25 });
      assert.ok(result.entries.length > 0);
      assert.ok(result.entries.every(row => row.sample >= 25));
      assert.ok(result.entries.some(row => row.value < 0));
      assert.ok(!result.entries.some(row => row.id === 'george-amick'));
    });
    await t.test('full rankings exceed 250 and optional limits disclose the full count', async () => {
      const full = await explore(pool, { category: 'starts', toYear: 2020 });
      const limited = await explore(pool, { category: 'starts', toYear: 2020, limit: 5 });
      assert.ok(full.entries.length > 250);
      assert.equal(limited.total, full.total);
      assert.equal(limited.entries.length, 5);
    });
    await t.test('sprint records are separate sessions and cannot alter pole records', async () => {
      const query = { category: 'starts', fromYear: 2021, toYear: 2021, circuitId: 'silverstone' };
      const gp = await explore(pool, query), combined = await explore(pool, { ...query, includeSprints: true });
      assert.equal(gp.entries.find(row => row.id === 'lewis-hamilton').value, 1);
      assert.equal(combined.entries.find(row => row.id === 'lewis-hamilton').value, 2);
    });
  } finally { await pool.end(); }
});
