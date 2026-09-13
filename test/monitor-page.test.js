const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const analyticsRouter = require('../backend/routes/analytics');
const databasePool = require('../backend/db');

test.after(async () => databasePool.end());

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('monitor exposes operational, comparative, chart and acquisition views', () => {
  const html = read('frontend/monitor.html');
  const browser = read('frontend/js/monitor.js');
  const backend = read('backend/routes/analytics.js');

  for (const id of ['monitor-health', 'monitor-summary', 'monitor-chart', 'monitor-referrers', 'monitor-recent']) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(html, /id="monitor-refresh"/);
  assert.match(html, /id="monitor-auto-refresh"[^>]+aria-pressed="true"/);
  assert.match(html, /name="robots" content="noindex,nofollow"/);

  assert.match(browser, /setInterval\([\s\S]*60000/);
  assert.match(browser, /document\.visibilityState === 'visible'/);
  assert.match(browser, /Existing dashboard data has been kept/);
  assert.match(browser, /role="img" aria-label="Daily visits/);
  assert.match(browser, /No data is available for this period/);

  assert.match(backend, /COUNT\(DISTINCT CASE WHEN last_seen_at/);
  assert.match(backend, /previousSummary/);
  assert.match(backend, /duration_seconds >= 10/);
  assert.match(backend, /GROUP BY COALESCE\(NULLIF\(referrer_host/);
});

test('junior latest-race query requires completed, non-cancelled race sessions', () => {
  const query = analyticsRouter.latestJuniorRaceQuery('fa');
  assert.match(query, /'academy' AS series/);
  assert.match(query, /FROM fa_races/);
  assert.match(query, /JOIN fa_session_results/);
  assert.match(query, /sessions\.isRace/);
  assert.match(query, /sessions\.cancelled/);
});

test('operational status combines available race, sync and rating freshness', async () => {
  const connection = {
    async query(sql) {
      const series = sql.match(/SELECT '(f1|f2|f3|academy)' AS series/)?.[1];
      if (series) return [{ series, id: `${series}-race`, name: 'Latest race', date: '2026-09-01', year: 2026, round: 10 }];
      if (sql.includes('app_data_sync_runs')) return [{ id: 'sync-1', status: 'succeeded', series: 'f1,f2' }];
      if (sql.includes('app_rating_runs')) return [{ series: 'f1', calculatedAt: '2026-09-02' }];
      throw new Error(`Unexpected query: ${sql}`);
    }
  };

  const status = await analyticsRouter.operationalStatus(connection);
  assert.equal(status.database, 'healthy');
  assert.equal(status.latestRaces.length, 4);
  assert.equal(status.latestSync.status, 'succeeded');
  assert.equal(status.ratingRuns.length, 1);
  assert.ok(Date.parse(status.checkedAt));
});

test('operational status tolerates optional tables that are not installed', async () => {
  const missingTable = Object.assign(new Error('missing'), { code: 'ER_NO_SUCH_TABLE', errno: 1146 });
  const status = await analyticsRouter.operationalStatus({ query: async () => { throw missingTable; } });
  assert.deepEqual(status.latestRaces, []);
  assert.equal(status.latestSync, null);
  assert.deepEqual(status.ratingRuns, []);
});
