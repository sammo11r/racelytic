const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const csv = require('csv-parser');
const { F1_HOME_PREVIEW: preview, SERIES_HOME_PREVIEWS } = require('../backend/series-home-renderer');
const pointsSystems = require('../frontend/js/f1-points-systems');

async function rowsFrom(file, include) {
    const rows = [];
    const stream = fs.createReadStream(path.join(__dirname, '../data', file)).pipe(csv());
    for await (const row of stream) if (include(row)) rows.push(row);
    return rows;
}

test('landing scoring example reproduces the archive and its alternate championship', async () => {
    const official = await rowsFrom('f1db-seasons-driver-standings.csv', row => Number(row.year) === preview.year);
    assert.deepEqual(official.sort((a, b) => Number(a.positionNumber) - Number(b.positionNumber)).slice(0, 2).map(row => ({ id: row.driverId, points: Number(row.points) })), preview.official.map(({ id, points }) => ({ id, points })));
    const results = await rowsFrom('f1db-races-race-results.csv', row => Number(row.year) === preview.year);
    assert.equal(new Set(results.map(row => row.raceId)).size, 18);
    const scoring = pointsSystems[preview.alternateSystem].race;
    const totals = new Map();
    for (const row of results) totals.set(row.driverId, (totals.get(row.driverId) || 0) + (scoring[Number(row.positionNumber) - 1] || 0));
    assert.deepEqual([...totals].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([id, points]) => ({ id, points })), preview.alternate.map(({ id, points }) => ({ id, points })));
});

test('landing driver comparison and revealed quiz answers match the archive', async () => {
    const drivers = await rowsFrom('f1db-drivers.csv', row => preview.drivers.some(driver => driver.id === row.id));
    for (const driver of preview.drivers) {
        const archived = drivers.find(row => row.id === driver.id);
        assert.equal(Number(archived.totalRaceWins), driver.wins);
        assert.equal(Number(archived.totalPolePositions), driver.poles);
    }
    const champions = await rowsFrom('f1db-seasons-driver-standings.csv', row => row.championshipWon === 'true');
    for (const answer of preview.champions.filter(champion => champion.name)) {
        assert.equal(champions.find(row => Number(row.year) === answer.year).driverId, answer.id);
    }
});

for (const [series, prefix] of [['f2', 'f2db'], ['f3', 'f3db'], ['academy', 'fadb']]) {
    test(`${series} landing examples match the official standings and career totals`, async () => {
        const example = SERIES_HOME_PREVIEWS[series];
        const standings = await rowsFrom(`${prefix}-season-driver-standings.csv`, () => true);
        const topTwo = standings.filter(row => Number(row.year) === example.year).sort((a, b) => Number(a.positionNumber) - Number(b.positionNumber)).slice(0, 2);
        assert.deepEqual(topTwo.map(row => ({ id: row.driverId, points: Number(row.points), wins: Number(row.wins) })), example.contenders.map(({ id, points, wins }) => ({ id, points, wins })));
        const identities = await rowsFrom(`${prefix}-drivers.csv`, row => example.drivers.some(driver => driver.id === row.id));
        for (const driver of example.drivers) {
            assert.ok(identities.some(row => row.id === driver.id), driver.id);
            const career = standings.filter(row => row.driverId === driver.id);
            for (const [metric] of example.comparisonMetrics || [['wins'], ['poles']]) {
                assert.equal(career.reduce((sum, row) => sum + Number(row[metric]), 0), driver[metric], `${driver.name} ${metric}`);
            }
        }
        for (const answer of (example.champions || []).filter(champion => champion.name)) {
            assert.equal(standings.find(row => Number(row.year) === answer.year && row.championshipWon.toLowerCase() === 'true').driverId, answer.id);
        }
    });
}
