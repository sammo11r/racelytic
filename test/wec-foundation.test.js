const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { all, fromPath } = require('../frontend/js/series-config');
const { matchResourcePath, resourcePath } = require('../backend/resource-routes');
const { indexesForTable, inferType, loadDatasets, selectedFilePrefixes, tableNameFromFile } = require('../backend/import/importer');
const { loadWecFoundation, shapeClassification, validateWecFoundation } = require('../backend/wec-data');
const { canonicalDriverId, canonicalDriverName, championshipClassIds, championshipPdfMatches } = require('../scripts/collect-wec-data');

const root = path.join(__dirname, '..');

test('WEC has a distinct endurance identity and public namespace', () => {
    assert.equal(all.wec.entity, 'entry');
    assert.equal(fromPath('/wec/seasons/2025').key, 'wec');
    assert.equal(resourcePath('wec', 'season', 2025), '/wec/seasons/2025');
    assert.deepEqual(matchResourcePath('/wec/seasons/2025'), { series: 'wec', resource: 'season', id: '2025', slug: '' });
    assert.equal(resourcePath('wec', 'carModel', 'ferrari-499p'), '/wec/cars/ferrari-499p');
    assert.deepEqual(matchResourcePath('/wec/cars/ferrari-499p'), { series: 'wec', resource: 'carModel', id: 'ferrari-499p', slug: '' });
    assert.deepEqual(matchResourcePath('/wec/car-models/ferrari-499p'), { series: 'wec', resource: 'carModel', id: 'ferrari-499p', slug: '' });
});

test('WEC uses a distinct endurance-green accent rather than the F2 blue palette', () => {
    const polish = fs.readFileSync(path.join(root, 'frontend/css/polish.css'), 'utf8');
    const favicon = fs.readFileSync(path.join(root, 'frontend/assets/favicon-wec.svg'), 'utf8');
    assert.match(polish, /body\.wec-mode\s*\{[\s\S]*?--accent:\s*#087f5b;/);
    assert.match(polish, /body\.f2-mode\s*\{[\s\S]*?--accent:\s*#1677ff;/);
    assert.match(favicon, /<rect width="64" height="64" rx="14" fill="#ffffff"\/>/);
    assert.match(favicon, /<path d="M35 10h14L29 54H15z" fill="#087f5b"\/>/);
});

test('WEC car numbers remain identifiers so leading zeroes survive import', () => {
    assert.equal(inferType('carNumber', ['007', '009', '7']), 'VARCHAR(20)');
});

test('WEC driver profiles consolidate official spelling variants', () => {
    assert.equal(canonicalDriverId('Alexandrer Sims'), 'alexander-sims');
    assert.equal(canonicalDriverId('Charles Eastwood'), 'charlie-eastwood');
    assert.equal(canonicalDriverId('Victor Shaitar'), 'victor-shaytar');
    assert.equal(canonicalDriverName('Sophia Floersch'), 'Sophia Flörsch');
    const styles = fs.readFileSync(path.join(root, 'frontend/css/wec.css'), 'utf8');
    const route = fs.readFileSync(path.join(root, 'backend/routes/wec.js'), 'utf8');
    const script = fs.readFileSync(path.join(root, 'frontend/js/wec.js'), 'utf8');
    assert.match(styles, /\.wec-flag\s*\{[^}]*width:\s*22px;[^}]*height:\s*15px;/);
    assert.match(route, /const classifiedAppearances = appearances\.filter\(row => row\.status !== 'not-started'\)/);
    assert.match(route, /starts:\s*classifiedAppearances\.length/);
    assert.match(route, /classWins:\s*appearances\.filter\(row => row\.status === 'classified'/);
    assert.match(script, /'not-started': 'Did not start'/);
    assert.match(script, /const outcome = appearanceOutcome\(item\)/);
    assert.match(script, /drivers: 'WEC DRIVER'/);
    const page = fs.readFileSync(path.join(root, 'frontend/wec-entity.html'), 'utf8');
    assert.match(page, /id="wec-driver-profile"/);
    assert.match(page, /id="wec-driver-seasons"/);
    assert.match(page, /id="wec-driver-connections"/);
    assert.match(page, /id="wec-driver-result-outcome"/);
    assert.match(route, /carModels\.id AS carModelId/);
    assert.match(route, /JOIN wec_entry_drivers crew ON crew\.entryId = target\.entryId/);
    assert.match(script, /function renderWecDriverProfile/);
    assert.match(script, /function renderWecDriverResults/);
    assert.match(script, /function wecIsLeMans/);
    assert.match(script, /renderPagination\('wec-driver-results'/);
});

test('generic importer publishes WEC files into an isolated table namespace', async () => {
    assert.deepEqual([...selectedFilePrefixes('wec')], ['wecdb-']);
    assert.equal(tableNameFromFile('wecdb-entry-drivers.csv'), 'wec_entry_drivers');
    const datasets = await loadDatasets(path.join(root, 'data'), { series: ['wec'] });
    assert.deepEqual(datasets.map(dataset => dataset.table), [
        'wec_car_models', 'wec_championships', 'wec_circuits', 'wec_classes', 'wec_competitors', 'wec_drivers',
        'wec_entries', 'wec_entry_drivers', 'wec_events', 'wec_manufacturers', 'wec_seasons',
        'wec_session_results', 'wec_sessions', 'wec_standings', 'wec_teams'
    ]);
});

test('WEC imports index race classifications by event and session', () => {
    assert.deepEqual(indexesForTable('wec_session_results', ['sessionId', 'eventId', 'entryId']), [
        'KEY `idx_wec_results_event_session_entry` (`eventId`,`sessionId`,`entryId`)',
        'KEY `idx_wec_results_entry_event` (`entryId`,`eventId`)'
    ]);
    assert.deepEqual(indexesForTable('wec_entry_drivers', ['entryId', 'eventId', 'driverId']), [
        'KEY `idx_wec_entry_drivers_event_entry` (`eventId`,`entryId`)',
        'KEY `idx_wec_entry_drivers_driver_event` (`driverId`,`eventId`)'
    ]);
});

test('WEC foundation covers completed championships and the ongoing 2026 season', async () => {
    const dataset = await loadWecFoundation();
    assert.deepEqual(validateWecFoundation(dataset), { seasons: 14, events: 109, circuits: 16, classes: 57 });
    assert.deepEqual(dataset.seasons.map(season => season.id), [
        'wec-2012', 'wec-2013', 'wec-2014', 'wec-2015', 'wec-2016', 'wec-2017',
        'wec-2018-2019', 'wec-2019-2020', 'wec-2021', 'wec-2022', 'wec-2023', 'wec-2024', 'wec-2025', 'wec-2026'
    ]);
    assert.deepEqual(dataset.events.filter(event => event.year === '2022').map(event => event.pointsScale), ['extended', 'standard', 'le-mans', 'standard', 'standard', 'extended']);
    assert.deepEqual(dataset.events.filter(event => event.year === '2023').map(event => event.pointsScale), ['extended', 'standard', 'standard', 'le-mans', 'standard', 'standard', 'extended']);
    for (const year of ['2024', '2025']) {
        assert.deepEqual(dataset.events.filter(event => event.year === year).map(event => event.pointsScale), ['extended', 'standard', 'standard', 'le-mans', 'standard', 'standard', 'standard', 'extended']);
    }
    assert.equal(dataset.seasons.find(season => season.id === 'wec-2026').status, 'ongoing');
    const currentEvents = dataset.events.filter(event => event.year === '2026');
    assert.deepEqual(currentEvents.map(event => event.pointsScale), ['standard', 'standard', 'le-mans', 'standard', 'standard', 'standard', 'standard', 'standard']);
    assert.deepEqual(currentEvents.map(event => event.status), ['completed', 'completed', 'completed', 'completed', 'completed', 'upcoming', 'upcoming', 'upcoming']);
});

test('WEC result contract classifies entries instead of duplicating results per driver', () => {
    const contract = JSON.parse(fs.readFileSync(path.join(root, 'data/wec-data-contract.json'), 'utf8'));
    assert.equal(contract.resultUnit, 'entry');
    assert.ok(contract.classificationFiles['wecdb-entry-drivers.csv'].includes('entryId'));
    assert.ok(contract.classificationFiles['wecdb-session-results.csv'].includes('classPosition'));
    assert.ok(contract.classificationFiles['wecdb-session-results.csv'].includes('overallPosition'));
    assert.ok(contract.standingsFiles['wecdb-championships.csv'].includes('classIds'));
    assert.match(contract.invariants.join(' '), /never one driver/i);
});

test('WEC championship PDFs and historical multi-class scopes are validated', () => {
    const season = { id: 'wec-2017', year: 2017, classes: [['LMP1'], ['LMP2'], ['LMGTE PRO'], ['LMGTE AM']] };
    const lmp = { name: 'LMP FIA WORLD ENDURANCE DRIVERS CHAMPIONSHIP AFTER BAHRAIN', entityType: 'driver', classId: 'wec-2017-lmp1' };
    const gt = { name: 'GT FIA WORLD ENDURANCE MANUFACTURERS CHAMPIONSHIP AFTER BAHRAIN', entityType: 'manufacturer', classId: 'wec-2017-lmgte-pro' };
    assert.equal(championshipPdfMatches(lmp, '2017 LMP FIA WORLD ENDURANCE DRIVERS CHAMPIONSHIP'), true);
    assert.equal(championshipPdfMatches(lmp, '2017 GT AM FIA WORLD ENDURANCE DRIVERS TROPHY'), false);
    assert.equal(championshipPdfMatches(gt, '2017 GT FIA WORLD ENDURANCE MANUFACTURERS CHAMPIONSHIP'), true);
    assert.equal(championshipPdfMatches(gt, '2017 LMP1 FIA WORLD ENDURANCE MANUFACTURERS CHAMPIONSHIP'), false);
    assert.deepEqual(championshipClassIds(lmp, season), ['wec-2017-lmp1', 'wec-2017-lmp2']);
    assert.deepEqual(championshipClassIds(gt, season), ['wec-2017-lmgte-pro', 'wec-2017-lmgte-am']);
});

test('WEC pages expose endurance-specific archive surfaces', () => {
    const navigation = fs.readFileSync(path.join(root, 'frontend/js/navigation.js'), 'utf8');
    const home = fs.readFileSync(path.join(root, 'frontend/wec.html'), 'utf8');
    assert.match(navigation, /if \(isWecMode\)/);
    assert.match(home, /car is the classified competitor/i);
    assert.doesNotMatch(home, /simulat|ratings/i);
    assert.match(fs.readFileSync(path.join(root, 'frontend/data-sources.html'), 'utf8'), /id="wec"[\s\S]*official FIA WEC website/);
});

test('WEC database has a dedicated overview for every archive category', () => {
    const page = fs.readFileSync(path.join(root, 'frontend/wec-database.html'), 'utf8');
    const navigation = fs.readFileSync(path.join(root, 'frontend/js/navigation.js'), 'utf8');
    const sharedScript = fs.readFileSync(path.join(root, 'frontend/js/database-overview.js'), 'utf8');
    const route = fs.readFileSync(path.join(root, 'backend/routes/wec.js'), 'utf8');
    const server = fs.readFileSync(path.join(root, 'backend/server.js'), 'utf8');
    const destinations = [...page.matchAll(/class="database-category" href="([^"]+)"/g)].map(match => match[1]);
    assert.deepEqual(destinations, ['/wec/seasons', '/wec/races', '/wec/drivers', '/wec/teams', '/wec/circuits', '/wec/cars']);
    assert.match(page, /class="eyebrow">WEC DATABASE/);
    assert.match(page, /data-archive-count="cars"/);
    assert.match(navigation, /\['\/wec\/database', 'Overview'/);
    assert.match(sharedScript, /series === 'wec'[\s\S]*?'\/api\/wec\/database'/);
    assert.match(route, /router\.get\('\/api\/wec\/database'/);
    assert.match(server, /app\.get\('\/wec\/database'/);
});

test('WEC analysis starts with class-aware championship progression', () => {
    const overview = fs.readFileSync(path.join(root, 'frontend/wec-analysis.html'), 'utf8');
    const page = fs.readFileSync(path.join(root, 'frontend/wec-season-analysis.html'), 'utf8');
    const script = fs.readFileSync(path.join(root, 'frontend/js/wec-season-analysis.js'), 'utf8');
    const styles = fs.readFileSync(path.join(root, 'frontend/css/wec-analysis.css'), 'utf8');
    const navigation = fs.readFileSync(path.join(root, 'frontend/js/navigation.js'), 'utf8');
    const privacy = fs.readFileSync(path.join(root, 'frontend/js/privacy.js'), 'utf8');
    const route = fs.readFileSync(path.join(root, 'backend/routes/wec.js'), 'utf8');
    const server = fs.readFileSync(path.join(root, 'backend/server.js'), 'utf8');
    assert.match(overview, /href="\/wec\/season-analysis"/);
    assert.match(overview, /Built around entries and classes/);
    assert.match(page, /id="analysis-championship"/);
    assert.match(page, /id="season-progression-chart"/);
    assert.match(page, /id="results-heatmap"/);
    assert.match(page, /id="average-position-table"/);
    assert.match(script, /getJSON\(`\/api\/wec\/analysis\/seasons\/\$\{encodeURIComponent\(year\)\}`\)/);
    assert.match(page, /Endpoint labels show their latest official totals/i);
    assert.match(styles, /#entity-picker/);
    assert.match(navigation, /\['\/wec\/analysis', 'Overview'/);
    assert.match(navigation, /\['\/wec\/season-analysis', 'Season analysis'/);
    assert.match(privacy, /database: '\/wec\/database', analysis: '\/wec\/analysis'/);
    assert.match(route, /router\.get\('\/api\/wec\/analysis\/seasons\/:year'/);
    assert.match(route, /championships\.entityType = 'competitor'/);
    assert.match(server, /app\.get\('\/wec\/analysis'/);
    assert.match(server, /app\.get\('\/wec\/season-analysis'/);
});

test('WEC has an entry-first race archive in the database navigation', () => {
    const navigation = fs.readFileSync(path.join(root, 'frontend/js/navigation.js'), 'utf8');
    const page = fs.readFileSync(path.join(root, 'frontend/wec-races.html'), 'utf8');
    const script = fs.readFileSync(path.join(root, 'frontend/js/wec-races.js'), 'utf8');
    assert.match(navigation, /\['\/wec\/races', 'Races'/);
    assert.match(page, /WEC RACE ARCHIVE/);
    assert.match(page, /id="wec-races"[^>]+aria-busy="true"/);
    assert.match(script, /winner\.drivers/);
    assert.match(script, /Overall winner/);
});

test('WEC has a searchable driver archive in the database navigation', () => {
    const navigation = fs.readFileSync(path.join(root, 'frontend/js/navigation.js'), 'utf8');
    const page = fs.readFileSync(path.join(root, 'frontend/wec-drivers.html'), 'utf8');
    const script = fs.readFileSync(path.join(root, 'frontend/js/wec-drivers.js'), 'utf8');
    const route = fs.readFileSync(path.join(root, 'backend/routes/wec.js'), 'utf8');
    const server = fs.readFileSync(path.join(root, 'backend/server.js'), 'utf8');
    assert.match(navigation, /\['\/wec\/drivers', 'Drivers'/);
    assert.match(page, /id="wec-driver-browser-title">Find a driver/);
    assert.match(page, /id="wec-drivers"[^>]+aria-busy="true"/);
    assert.match(script, /getJSON\('\/api\/wec\/drivers'\)/);
    assert.match(script, /overall-winners/);
    assert.match(script, /resourceUrl\('driver', driver\.id, \{ base: '\/wec'/);
    assert.match(route, /router\.get\('\/api\/wec\/drivers'/);
    assert.match(route, /results\.status = 'classified' AND results\.classPosition BETWEEN 1 AND 3/);
    assert.match(server, /app\.get\('\/wec\/drivers'/);
});

test('WEC has a team archive with entry-first endurance records', () => {
    const navigation = fs.readFileSync(path.join(root, 'frontend/js/navigation.js'), 'utf8');
    const page = fs.readFileSync(path.join(root, 'frontend/wec-teams.html'), 'utf8');
    const script = fs.readFileSync(path.join(root, 'frontend/js/wec-teams.js'), 'utf8');
    const route = fs.readFileSync(path.join(root, 'backend/routes/wec.js'), 'utf8');
    const server = fs.readFileSync(path.join(root, 'backend/server.js'), 'utf8');
    assert.match(navigation, /\['\/wec\/teams', 'Teams'/);
    assert.match(page, /id="wec-team-browser-title">Teams/);
    assert.match(page, /Latest recorded grid/);
    assert.match(page, /id="wec-teams"[^>]+aria-busy="true"/);
    assert.match(script, /getJSON\('\/api\/wec\/teams'\)/);
    assert.match(script, /resourceUrl\('team', team\.id, \{ base: '\/wec'/);
    assert.match(script, /overall-winners/);
    assert.match(script, /Latest recorded grid/);
    assert.match(route, /router\.get\('\/api\/wec\/teams'/);
    assert.match(route, /results\.status = 'classified' AND results\.classPosition = 1/);
    assert.match(route, /championships\.entityType = 'competitor'/);
    assert.match(server, /app\.get\('\/wec\/teams'/);
});

test('WEC has a filterable car-model archive in the database navigation', () => {
    const navigation = fs.readFileSync(path.join(root, 'frontend/js/navigation.js'), 'utf8');
    const page = fs.readFileSync(path.join(root, 'frontend/wec-cars.html'), 'utf8');
    const script = fs.readFileSync(path.join(root, 'frontend/js/wec-cars.js'), 'utf8');
    const styles = fs.readFileSync(path.join(root, 'frontend/css/wec.css'), 'utf8');
    const route = fs.readFileSync(path.join(root, 'backend/routes/wec.js'), 'utf8');
    const server = fs.readFileSync(path.join(root, 'backend/server.js'), 'utf8');
    assert.match(navigation, /\['\/wec\/cars', 'Cars'/);
    assert.match(page, /id="wec-car-browser-title">Cars/);
    assert.match(page, /id="wec-cars"[^>]+aria-busy="true"/);
    assert.match(script, /getJSON\('\/api\/wec\/cars'\)/);
    assert.match(script, /resourceUrl\('carModel', car\.id, \{ base: '\/wec'/);
    assert.match(script, /overall-winners/);
    assert.match(styles, /\.wec-car-grid/);
    assert.match(route, /router\.get\('\/api\/wec\/cars'/);
    assert.match(route, /GROUP BY entries\.carModelId/);
    assert.match(server, /app\.get\('\/wec\/cars'/);
    assert.match(server, /app\.get\('\/wec\/cars\/:resourceId'/);
    assert.match(page, /Latest season/);
});

test('WEC team profiles explain multi-entry careers without a submenu or unbounded result wall', () => {
    const page = fs.readFileSync(path.join(root, 'frontend/wec-entity.html'), 'utf8');
    const script = fs.readFileSync(path.join(root, 'frontend/js/wec.js'), 'utf8');
    const styles = fs.readFileSync(path.join(root, 'frontend/css/wec.css'), 'utf8');
    const route = fs.readFileSync(path.join(root, 'backend/routes/wec.js'), 'utf8');
    assert.match(page, /id="wec-team-profile"/);
    assert.doesNotMatch(page, /aria-label="Team sections"/);
    assert.match(page, /id="wec-team-result-outcome"/);
    assert.match(script, /wecDriverStat\('Race weekends'/);
    assert.match(script, /wecDriverStat\('Entry starts'/);
    assert.match(script, /const pageSize = 12/);
    assert.match(script, /renderWecTeamChampionships\(data\)/);
    assert.match(script, /renderWecTeamResults\(data\)/);
    assert.match(styles, /\.wec-team-profile \.detail-stat\.highlight[^}]+var\(--accent-light\)/);
    assert.match(styles, /\.wec-team-event-card/);
    assert.match(route, /championships\.entityType/);
    assert.match(route, /WHERE entries\.teamId = \?/);
});

test('WEC has a filterable endurance circuit archive in the database navigation', () => {
    const navigation = fs.readFileSync(path.join(root, 'frontend/js/navigation.js'), 'utf8');
    const page = fs.readFileSync(path.join(root, 'frontend/wec-circuits.html'), 'utf8');
    const script = fs.readFileSync(path.join(root, 'frontend/js/wec-circuits.js'), 'utf8');
    const route = fs.readFileSync(path.join(root, 'backend/routes/wec.js'), 'utf8');
    const server = fs.readFileSync(path.join(root, 'backend/server.js'), 'utf8');
    assert.match(navigation, /\['\/wec\/circuits', 'Circuits'/);
    assert.match(page, /id="wec-circuit-browser-title">Find a venue/);
    assert.match(page, /id="wec-circuits"[^>]+aria-busy="true"/);
    assert.match(script, /getJSON\('\/api\/wec\/circuits'\)/);
    assert.match(script, /twentyFourHours/);
    assert.match(script, /resourceUrl\('circuit', circuit\.id, \{ base: '\/wec'/);
    assert.match(route, /router\.get\('\/api\/wec\/circuits'/);
    assert.match(route, /events\.scheduledMinutes = 1440/);
    assert.match(server, /app\.get\('\/wec\/circuits'/);
});

test('every WEC venue opens a dedicated circuit history page', () => {
    const page = fs.readFileSync(path.join(root, 'frontend/wec-circuit.html'), 'utf8');
    const script = fs.readFileSync(path.join(root, 'frontend/js/wec-circuit.js'), 'utf8');
    const route = fs.readFileSync(path.join(root, 'backend/routes/wec.js'), 'utf8');
    const server = fs.readFileSync(path.join(root, 'backend/server.js'), 'utf8');
    const seo = fs.readFileSync(path.join(root, 'backend/seo-data.js'), 'utf8');
    assert.match(page, /id="wec-circuit-hero"[^>]+aria-busy="true"/);
    assert.match(page, /id="wec-circuit-records"/);
    assert.match(page, /id="wec-circuit-events"[^>]+aria-busy="true"/);
    assert.match(script, /getJSON\(`\/api\/wec\/circuits\/\$\{encodeURIComponent\(WEC_CIRCUIT_DETAIL_ID\)\}`\)/);
    assert.match(script, /Overall winner/);
    assert.match(script, /wec-circuit-history-format/);
    assert.match(route, /router\.get\('\/api\/wec\/circuits\/:circuitId'/);
    assert.match(route, /results\.overallPosition = 1/);
    assert.match(server, /app\.get\('\/wec\/circuits\/:resourceId'/);
    assert.match(seo, /series === 'wec'[\s\S]*FROM wec_circuits/);
});

test('WEC season SEO does not depend on Formula-style driver standings', () => {
    const seo = fs.readFileSync(path.join(root, 'backend/seo-data.js'), 'utf8');
    assert.match(seo, /if \(series === 'wec'\)[\s\S]*FROM wec_seasons/);
});

test('WEC classifications keep one entry result with its ordered crew', () => {
    const results = [{
        entryId: 'bahrain-7', carNumber: '7', classId: 'wec-2025-hypercar', classCode: 'HYPERCAR', className: 'Hypercar',
        overallPosition: '1', classPosition: '1', status: 'classified', laps: '237', time: '8:01:08.626',
        timeMillis: '28868626', gap: '', bestLap: '1:50.410', bestLapMillis: '110410', points: '38',
        teamId: 'toyota-gazoo-racing', teamName: 'Toyota Gazoo Racing', manufacturerId: 'toyota', manufacturerName: 'Toyota',
        carModelId: 'toyota-gr010-hybrid', carModelName: 'Toyota GR010 - Hybrid'
    }];
    const crews = [
        { entryId: 'bahrain-7', crewOrder: '2', category: 'P', driverId: 'kamui-kobayashi', driverName: 'Kamui Kobayashi', abbreviation: 'KOB', nationalityCountryId: 'jpn' },
        { entryId: 'bahrain-7', crewOrder: '1', category: 'P', driverId: 'mike-conway', driverName: 'Mike Conway', abbreviation: 'CON', nationalityCountryId: 'gbr' }
    ];
    const shaped = shapeClassification(results, crews);
    assert.equal(shaped.length, 1);
    assert.equal(shaped[0].overallPosition, 1);
    assert.equal(shaped[0].laps, 237);
    assert.deepEqual(shaped[0].crew.map(driver => driver.name), ['Mike Conway', 'Kamui Kobayashi']);
    assert.equal(shaped[0].team.name, 'Toyota Gazoo Racing');
});

test('WEC race page starts with a focused endurance event header', () => {
    const page = fs.readFileSync(path.join(root, 'frontend/wec-race.html'), 'utf8');
    const script = fs.readFileSync(path.join(root, 'frontend/js/wec-race.js'), 'utf8');
    const server = fs.readFileSync(path.join(root, 'backend/server.js'), 'utf8');
    assert.match(page, /id="wec-race-head"[^>]+aria-busy="true"/);
    assert.match(page, /id="wec-race-summary"/);
    assert.match(page, /id="wec-session-tabs"/);
    assert.match(page, /id="wec-race-classification"/);
    assert.match(page, /id="wec-entry-list"/);
    assert.match(script, /race-detail-hero wec-race-hero/);
    assert.match(script, /<span>Circuit<\/span>/);
    assert.match(script, /Date ·/);
    assert.match(server, /app\.get\('\/wec\/races\/:resourceId'/);
});

test('WEC race SEO queries endurance events rather than Formula race tables', () => {
    const seo = fs.readFileSync(path.join(root, 'backend/seo-data.js'), 'utf8');
    assert.match(seo, /if \(series === 'wec'\)[\s\S]*FROM wec_events events/);
});

test('official 2025 fixtures preserve every entry, crew and parallel classification', async () => {
    const datasets = await loadDatasets(path.join(root, 'data'), { series: ['wec'] });
    const byTable = new Map(datasets.map(dataset => [dataset.table, dataset.rows]));
    assert.equal(byTable.get('wec_entries').filter(row => row.seasonId === 'wec-2025').length, 314);
    assert.equal(byTable.get('wec_entry_drivers').filter(row => row.eventId.startsWith('wec-2025-')).length, 923);
    assert.equal(byTable.get('wec_session_results').filter(row => row.eventId.startsWith('wec-2025-')).length, 1899);
    assert.equal(byTable.get('wec_sessions').filter(row => row.seasonId === 'wec-2025').length, 68);
    assert.equal(byTable.get('wec_competitors').filter(row => row.seasonId === 'wec-2025').length, 62);
    const results = byTable.get('wec_session_results').filter(row => row.eventId === 'wec-2025-r8-bahrain');
    assert.deepEqual(results.slice(0, 2).map(row => [row.entryId, row.overallPosition, row.classPosition]), [
        ['wec-2025-r8-bahrain-7', '1', '1'], ['wec-2025-r8-bahrain-8', '2', '2']
    ]);
    const lmgt3Winner = results.find(row => row.entryId.endsWith('-87'));
    assert.equal(lmgt3Winner.overallPosition, '18');
    assert.equal(lmgt3Winner.classPosition, '1');
    assert.equal(lmgt3Winner.laps, '216');
});

test('official 2025 final standings include every championship and champion', async () => {
    const datasets = await loadDatasets(path.join(root, 'data'), { series: ['wec'] });
    const byTable = new Map(datasets.map(dataset => [dataset.table, dataset.rows]));
    assert.equal(byTable.get('wec_championships').filter(row => row.seasonId === 'wec-2025').length, 5);
    assert.equal(byTable.get('wec_standings').filter(row => row.championshipId.startsWith('wec-2025-')).length, 1224);
    const champions = byTable.get('wec_standings').filter(row => row.championshipWon === 'true' && row.championshipId.startsWith('wec-2025-'));
    assert.equal(new Set(champions.map(row => row.championshipId)).size, 5);
    assert.ok(champions.some(row => row.championshipId === 'wec-2025-hypercar-manufacturers' && row.entityId === 'ferrari' && row.points === '245'));
});

test('ongoing 2026 standings stop at the latest completed race and award no champions', async () => {
    const datasets = await loadDatasets(path.join(root, 'data'), { series: ['wec'] });
    const byTable = new Map(datasets.map(dataset => [dataset.table, dataset.rows]));
    const championships = byTable.get('wec_championships').filter(row => row.seasonId === 'wec-2026');
    const standings = byTable.get('wec_standings').filter(row => row.championshipId.startsWith('wec-2026-'));
    assert.equal(championships.length, 4);
    assert.equal(standings.length, 680);
    assert.deepEqual([...new Set(standings.map(row => Number(row.round)))], [1, 2, 3, 4, 5]);
    assert.ok(standings.every(row => row.championshipWon === 'false'));
    assert.ok(standings.some(row => row.championshipId === 'wec-2026-hypercar-manufacturers'
        && row.round === '5' && row.position === '1' && row.entityId === 'toyota' && row.points === '140'));
});

test('WEC archive preserves official practice, qualifying and Hyperpole sessions for later race sections', async () => {
    const datasets = await loadDatasets(path.join(root, 'data'), { series: ['wec'] });
    const byTable = new Map(datasets.map(dataset => [dataset.table, dataset.rows]));
    const sessions = byTable.get('wec_sessions');
    assert.ok(sessions.some(row => row.name === 'Free Practice 1'));
    assert.ok(sessions.some(row => row.name === 'Qualifying HYPERCAR'));
    assert.ok(sessions.some(row => row.name === 'Hyperpole 2 HYPERCAR'));
    assert.equal(new Set(sessions.filter(row => row.seasonId === 'wec-2025').map(row => row.eventId)).size, 8);
    const page = fs.readFileSync(path.join(root, 'frontend/wec-race.html'), 'utf8');
    assert.doesNotMatch(page, /id="wec-session-select"/);
});

test('WEC standings retain official points after every 2025 round', async () => {
    const datasets = await loadDatasets(path.join(root, 'data'), { series: ['wec'] });
    const standings = datasets.find(dataset => dataset.table === 'wec_standings').rows;
    const ferrari = standings.filter(row => row.championshipId === 'wec-2025-hypercar-manufacturers' && row.entityId === 'ferrari');
    assert.deepEqual(ferrari.map(row => [row.round, row.points]), [['1', '66'], ['2', '92'], ['3', '136'], ['4', '172'], ['5', '175'], ['6', '203'], ['7', '204'], ['8', '245']]);
});

test('official 2024 archive preserves session-only entries and final champions', async () => {
    const datasets = await loadDatasets(path.join(root, 'data'), { series: ['wec'] });
    const byTable = new Map(datasets.map(dataset => [dataset.table, dataset.rows]));
    assert.equal(byTable.get('wec_entries').filter(row => row.seasonId === 'wec-2024').length, 318);
    assert.equal(byTable.get('wec_sessions').filter(row => row.seasonId === 'wec-2024').length, 64);
    assert.equal(byTable.get('wec_session_results').filter(row => row.eventId.startsWith('wec-2024-')).length, 1875);
    assert.ok(byTable.get('wec_entries').some(row => row.id === 'wec-2024-r5-sao-paulo-78'));
    const standings = byTable.get('wec_standings');
    assert.ok(standings.some(row => row.championshipId === 'wec-2024-hypercar-manufacturers' && row.round === '8' && row.entityId === 'toyota' && row.points === '190' && row.championshipWon === 'true'));
    assert.ok(standings.some(row => row.championshipId === 'wec-2024-hypercar-drivers' && row.round === '8' && row.entityId === 'kevin-estre' && row.points === '152' && row.championshipWon === 'true'));
});

test('official 2023 archive supports full-season LMP2, LMGTE Am and Garage 56', async () => {
    const datasets = await loadDatasets(path.join(root, 'data'), { series: ['wec'] });
    const byTable = new Map(datasets.map(dataset => [dataset.table, dataset.rows]));
    assert.equal(byTable.get('wec_entries').filter(row => row.seasonId === 'wec-2023').length, 282);
    assert.equal(byTable.get('wec_sessions').filter(row => row.seasonId === 'wec-2023').length, 50);
    assert.equal(byTable.get('wec_session_results').filter(row => row.eventId.startsWith('wec-2023-')).length, 1556);
    assert.equal(byTable.get('wec_championships').filter(row => row.seasonId === 'wec-2023').length, 7);
    const lmp2Champion = byTable.get('wec_competitors').find(row => row.id === 'wec-2023-lmp2-41');
    const garage56 = byTable.get('wec_entries').find(row => row.id === 'wec-2023-r4-le-mans-24');
    assert.equal(lmp2Champion.championshipEligible, 'true');
    assert.equal(garage56.classId, 'wec-2023-innovative-car');
    assert.equal(garage56.championshipEligible, 'false');
    assert.ok(byTable.get('wec_standings').some(row => row.championshipId === 'wec-2023-hypercar-manufacturers' && row.round === '7' && row.entityId === 'toyota' && row.points === '217' && row.championshipWon === 'true'));
    assert.ok(byTable.get('wec_standings').some(row => row.championshipId === 'wec-2023-lmp2-drivers' && row.round === '7' && row.entityId === 'robert-kubica' && row.points === '173' && row.championshipWon === 'true'));
});

test('official 2022 archive preserves LMGTE Pro and both LMP2 trophies', async () => {
    const datasets = await loadDatasets(path.join(root, 'data'), { series: ['wec'] });
    const byTable = new Map(datasets.map(dataset => [dataset.table, dataset.rows]));
    assert.equal(byTable.get('wec_entries').filter(row => row.seasonId === 'wec-2022').length, 246);
    assert.equal(byTable.get('wec_sessions').filter(row => row.seasonId === 'wec-2022').length, 38);
    assert.equal(byTable.get('wec_session_results').filter(row => row.eventId.startsWith('wec-2022-')).length, 1377);
    assert.equal(byTable.get('wec_championships').filter(row => row.seasonId === 'wec-2022').length, 10);
    const standings = byTable.get('wec_standings');
    assert.ok(standings.some(row => row.championshipId === 'wec-2022-hypercar-manufacturers' && row.round === '6' && row.entityId === 'toyota' && row.points === '186' && row.championshipWon === 'true'));
    assert.ok(standings.some(row => row.championshipId === 'wec-2022-lmp2-pro-am-teams' && row.round === '6' && row.entityId === 'wec-2022-lmp2-83' && row.points === '177' && row.championshipWon === 'true'));
    assert.ok(standings.some(row => row.championshipId === 'wec-2022-lmgte-drivers' && row.round === '6' && row.entityId === 'james-calado' && row.points === '135' && row.championshipWon === 'true'));
});

test('official historical standings cover every completed pre-2022 season', async () => {
    const datasets = await loadDatasets(path.join(root, 'data'), { series: ['wec'] });
    const byTable = new Map(datasets.map(dataset => [dataset.table, dataset.rows]));
    const championships = byTable.get('wec_championships');
    const standings = byTable.get('wec_standings');
    for (const seasonId of ['wec-2012', 'wec-2013', 'wec-2014', 'wec-2015', 'wec-2016', 'wec-2017', 'wec-2018-2019', 'wec-2019-2020', 'wec-2021']) {
        assert.ok(championships.some(row => row.seasonId === seasonId), `${seasonId} should have official championships`);
        assert.ok(standings.some(row => row.championshipId.startsWith(`${seasonId}-`)), `${seasonId} should have official standings`);
    }
    assert.ok(standings.some(row => row.championshipId === 'wec-2012-lmp1-drivers' && row.round === '8' && row.entityId === 'andre-lotterer' && row.points === '172.5' && row.championshipWon === 'true'));
    assert.ok(standings.some(row => row.championshipId === 'wec-2013-lmp2-teams' && row.round === '8' && row.entityId === 'wec-2013-lmp2-35' && row.points === '141.5' && row.championshipWon === 'true'));
    assert.ok(standings.some(row => row.championshipId === 'wec-2019-2020-lmp1-teams' && row.round === '8' && row.entityId === 'toyota-gazoo-racing' && row.points === '241' && row.championshipWon === 'true'));
    assert.ok(standings.some(row => row.championshipId === 'wec-2021-hypercar-drivers' && row.round === '6' && row.entityId === 'mike-conway' && row.points === '173' && row.championshipWon === 'true'));
});

test('WEC classifications and standings link to archive profiles', () => {
    const page = fs.readFileSync(path.join(root, 'frontend/wec-entity.html'), 'utf8');
    const script = fs.readFileSync(path.join(root, 'frontend/js/wec.js'), 'utf8');
    const server = fs.readFileSync(path.join(root, 'backend/server.js'), 'utf8');
    assert.match(page, /data-wec-view="entity"/);
    assert.match(script, /entityPath\('drivers'/);
    assert.match(script, /entityPath\('entries'/);
    assert.match(script, /entityPath\('car-models'/);
    assert.match(script, /championship\.entityType === 'team' \? 'teams'/);
    assert.match(server, /app\.get\('\/wec\/car-models\/:resourceId'/);
    assert.match(server, /\['drivers', 'teams', 'manufacturers', 'entries'\]/);
});

test('WEC seasons reuse the shared championship archive design language', () => {
    const seasons = fs.readFileSync(path.join(root, 'frontend/wec-seasons.html'), 'utf8');
    const script = fs.readFileSync(path.join(root, 'frontend/js/wec-seasons.js'), 'utf8');
    const route = fs.readFileSync(path.join(root, 'backend/routes/wec.js'), 'utf8');
    const seasonsRoute = route.slice(route.indexOf("router.get('/api/wec/seasons'"), route.indexOf("router.get('/api/wec/home'"));
    assert.match(seasons, /class="container page seasons-directory"/);
    assert.doesNotMatch(seasons, /WORLD ENDURANCE CHAMPIONSHIP HISTORY/);
    assert.match(seasons, /\/css\/seasons-overview\.css/);
    assert.match(seasons, /id="season-search"/);
    assert.match(seasons, /id="season-sort"/);
    assert.match(seasons, /id="seasons" class="season-grid"/);
    assert.match(script, /class="season-card"/);
    assert.match(script, /return '2018\/19'/);
    assert.match(script, /return '2019\/20'/);
    assert.match(script, /class="season-year-divider"/);
    assert.match(script, /class="season-year-highlight"/);
    assert.match(script, /Top-class champion/);
    assert.match(script, /pageItems\(seasons/);
    assert.match(script, /renderPagination\('seasons'/);
    assert.match(seasonsRoute, /SELECT seasonId, COUNT\(\*\) AS eventCount/);
    assert.match(seasonsRoute, /SELECT seasonId, COUNT\(\*\) AS classCount/);
    assert.match(seasonsRoute, /SELECT seasonId, COUNT\(\*\) AS entryCount/);
    assert.doesNotMatch(seasonsRoute, /COUNT\(DISTINCT events\.id\) AS eventCount/);
    assert.match(seasonsRoute, /stale-while-revalidate=86400/);
});

test('WEC season page presents a focused championship header card', () => {
    const page = fs.readFileSync(path.join(root, 'frontend/wec-season.html'), 'utf8');
    const script = fs.readFileSync(path.join(root, 'frontend/js/wec-season.js'), 'utf8');
    const styles = fs.readFileSync(path.join(root, 'frontend/css/wec-season.css'), 'utf8');
    const route = fs.readFileSync(path.join(root, 'backend/routes/wec.js'), 'utf8');
    assert.match(page, /id="wec-champions"/);
    assert.match(page, /class="wec-season-hero"[\s\S]*id="champions" class="wec-season-champions"[\s\S]*id="wec-champions"/);
    assert.match(page, /CHAMPIONSHIP SUMMARY/);
    assert.doesNotMatch(page, /class="back-link"/);
    assert.doesNotMatch(page, /id="wec-season-facts"/);
    assert.doesNotMatch(page, /class="wec-season-index"/);
    assert.doesNotMatch(page, /id="calendar"|id="entries"|id="standings"/);
    assert.match(page, /id="wec-race-results-title">Race results/);
    assert.match(page, /id="wec-race-results"/);
    assert.match(page, /id="wec-season-standings-title">Standings/);
    assert.doesNotMatch(page, /Final positions, points and race-by-race results/);
    assert.doesNotMatch(page, /The winning team and driver crew/);
    assert.match(page, /id="wec-standings-types"/);
    assert.match(page, /id="wec-standings-championships"/);
    assert.match(page, /class="wec-standings-legend" aria-label="Standings result legend"/);
    assert.match(page, /id="wec-standings-championships"[\s\S]*class="wec-standings-legend"[\s\S]*id="wec-season-standings"/);
    assert.match(page, /id="wec-season-standings-title">Standings[\s\S]*id="wec-race-results-title">Race results/);
    assert.match(page, /Winner[\s\S]*Second[\s\S]*Third[\s\S]*Retired[\s\S]*Not classified[\s\S]*Disqualified[\s\S]*Excluded[\s\S]*Did not start[\s\S]*Did not participate/);
    assert.match(script, /wec-champion-title--\$\{esc\(championship\.entityType\)\}/);
    assert.match(script, /Current leaders by category/);
    assert.match(script, /Championship leaders/);
    assert.match(script, /showLeaders \? row\.position === 1 : row\.championshipWon/);
    assert.match(script, /byId\('wec-season-year'\)\.textContent = match\[1\]/);
    assert.match(script, /\/api\/wec\/seasons\/\$\{encodeURIComponent\(match\[1\]\)\}\/header/);
    assert.match(route, /router\.get\('\/api\/wec\/seasons\/:year\/header'/);
    assert.match(route, /router\.get\('\/api\/wec\/seasons\/:year\/results'/);
    assert.match(route, /router\.get\('\/api\/wec\/seasons\/:year\/standings'/);
    assert.match(script, /function renderSeasonStandings/);
    assert.match(script, /seasonStandingType: 'manufacturer'/);
    assert.match(script, /Promise\.allSettled\(\[standingsRequest, resultsRequest\]\)/);
    assert.match(script, /URLSearchParams\(window\.location\.search\)/);
    assert.match(script, /window\.history\.replaceState/);
    assert.doesNotMatch(script, /function renderCalendar|function renderEntries|function renderProgression/);
    assert.match(script, /data-standing-type/);
    assert.match(script, /data-standing-championship/);
    assert.match(script, /team: 'Team trophies', competitor: 'Team entries'/);
    assert.match(script, /type === 'team'/);
    assert.match(script, /team: 'teams', competitor: 'entries'/);
    assert.match(script, /competitor: 'entries'/);
    assert.match(script, /wec-standing-car-number/);
    assert.match(route, /results\.status = 'classified' AND results\.classPosition IS NOT NULL/);
    assert.match(route, /results\.status = 'classified' AND results\.classPosition = 1/);
    assert.match(route, /standings\.championshipWon = 1/);
    assert.match(route, /seasons\.status <> 'completed'/);
    assert.match(route, /SELECT MAX\(latestStandings\.round\)/);
    const standingsRoute = route.split("router.get('/api/wec/seasons/:year/standings'")[1]
        .split("router.get('/api/wec/seasons/:year'")[0];
    assert.match(standingsRoute, /championships\.entityType IN \('driver', 'manufacturer', 'team', 'competitor'\)/);
    assert.match(standingsRoute, /standingTeams\.id = standings\.entityId/);
    assert.match(standingsRoute, /COALESCE\(drivers\.name, manufacturers\.name, standingTeams\.name, competitorTeams\.name\)/);
    assert.match(route, /row\.entityType === 'competitor' \? result\.competitorId === row\.entityId/);
    assert.match(route, /competitors\.carNumber, competitors\.teamId/);
    assert.match(route, /championship\.classIds\.includes\(result\.classId\)/);
    assert.doesNotMatch(route, /teamTrophyCompetitors/);
    assert.match(route, /Cache-Control', 'public, max-age=300, stale-while-revalidate=86400'/);
    const seasonRoute = route.split("router.get('/api/wec/seasons/:year',")[1]
        .split("router.get('/api/wec/events/:eventId'")[0];
    assert.match(seasonRoute, /COUNT\(CASE WHEN sessions\.type = 'race' THEN 1 END\) AS classificationCount/);
    assert.match(styles, /\.wec-season-hero \{[\s\S]*border-radius: 16px;[\s\S]*box-shadow: var\(--shadow-small\);/);
    assert.match(styles, /\.wec-race-results-table tr > :nth-child\(2\) \{ position: sticky/);
    assert.match(styles, /\.wec-season-standings-table tr > :nth-child\(2\) \{ position: sticky/);
    assert.doesNotMatch(styles, /\.wec-progression-table|\.wec-entry-filters|\.wec-standing-toolbar/);
});

test('WEC season analysis only treats classified positions as finishes', () => {
    const script = fs.readFileSync(path.join(root, 'frontend/js/wec-season-analysis.js'), 'utf8');
    assert.match(script, /result\?\.status === 'classified' && Number\(result\.position\) > 0/);
    assert.match(script, /starts\.filter\(result => result\.status === 'classified'\)\.map\(result => Number\(result\.position\)\)/);
});

test('WEC landing uses the shared championship experience without losing race entry context', () => {
    const { renderSeriesHome } = require('../backend/series-home-renderer');
    const home = renderSeriesHome('wec');
    const script = fs.readFileSync(path.join(root, 'frontend/js/wec.js'), 'utf8');
    assert.match(home, /data-series-home="wec"/);
    assert.match(home, /class="container series-snapshot"/);
    assert.match(home, /class="container home-questions"/);
    assert.match(home, /id="series-archive"/);
    assert.match(script, /window\.history\.replaceState/);
    assert.match(script, /data-class-code/);
});

test('WEC integration covers footer identity, participant search, SEO and prerendering', () => {
    const privacy = fs.readFileSync(path.join(root, 'frontend/js/privacy.js'), 'utf8');
    const races = fs.readFileSync(path.join(root, 'frontend/js/wec-races.js'), 'utf8');
    const route = fs.readFileSync(path.join(root, 'backend/routes/wec.js'), 'utf8');
    const seo = fs.readFileSync(path.join(root, 'backend/seo-data.js'), 'utf8');
    const prerender = fs.readFileSync(path.join(root, 'backend/seo-prerender.js'), 'utf8');
    const server = fs.readFileSync(path.join(root, 'backend/server.js'), 'utf8');
    assert.match(privacy, /contains\('wec-mode'\) \? 'wec'/);
    assert.match(privacy, /data-sources#wec/);
    assert.match(route, /router\.get\('\/api\/wec\/home'/);
    assert.match(route, /searchTermsByEvent/);
    assert.match(races, /race\.searchText/);
    assert.match(seo, /'wec_car_models', 'carModel'/);
    assert.match(prerender, /initial\.series === 'wec' \? 'wec-race-head'/);
    assert.match(server, /'wec-races\.html'/);
});
