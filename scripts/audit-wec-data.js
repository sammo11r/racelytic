const fs = require('node:fs');
const path = require('node:path');
const csv = require('csv-parser');
const { DATA_DIRECTORY, loadWecFoundation, validateWecFoundation } = require('../backend/wec-data');

const EXPECTED_SEASON_COVERAGE = {
    2012: { events: 8, competitors: 58, entries: 273, crewAssignments: 764, sessions: 47, results: 1606, championships: 7, standings: 1384 },
    2013: { events: 8, competitors: 57, entries: 263, crewAssignments: 748, sessions: 33, results: 1134, championships: 10, standings: 1472 },
    2014: { events: 8, competitors: 59, entries: 246, crewAssignments: 697, sessions: 33, results: 1061, championships: 11, standings: 1688 },
    2015: { events: 8, competitors: 57, entries: 275, crewAssignments: 779, sessions: 34, results: 1210, championships: 11, standings: 2072 },
    2016: { events: 9, competitors: 61, entries: 317, crewAssignments: 896, sessions: 37, results: 1355, championships: 11, standings: 2268 },
    2017: { events: 9, competitors: 60, entries: 276, crewAssignments: 773, sessions: 38, results: 1224, championships: 9, standings: 1674 },
    2018: { events: 8, competitors: 70, entries: 330, crewAssignments: 934, sessions: 42, results: 1765, championships: 8, standings: 1872 },
    2019: { events: 8, competitors: 61, entries: 265, crewAssignments: 750, sessions: 45, results: 1526, championships: 8, standings: 1792 },
    2021: { events: 6, competitors: 63, entries: 227, crewAssignments: 663, sessions: 44, results: 1502, championships: 10, standings: 1440 },
    2022: { events: 6, competitors: 64, entries: 246, crewAssignments: 713, sessions: 38, results: 1377, championships: 10, standings: 1458 },
    2023: { events: 7, competitors: 63, entries: 282, crewAssignments: 846, sessions: 50, results: 1556, championships: 7, standings: 1186 },
    2024: { events: 8, competitors: 62, entries: 318, crewAssignments: 944, sessions: 64, results: 1875, championships: 5, standings: 1248 },
    2025: { events: 8, competitors: 62, entries: 314, crewAssignments: 923, sessions: 68, results: 1899, championships: 5, standings: 1224 }
};

function readCsv(filename) {
    return new Promise((resolve, reject) => {
        const rows = [];
        fs.createReadStream(path.join(DATA_DIRECTORY, filename)).pipe(csv())
            .on('data', row => rows.push(row)).on('end', () => resolve(rows)).on('error', reject);
    });
}

function requireUnique(rows, key, label) {
    const seen = new Set();
    for (const row of rows) {
        const value = typeof key === 'function' ? key(row) : row[key];
        if (!value) throw new Error(`${label} has an empty identity.`);
        if (seen.has(value)) throw new Error(`${label} has duplicate identity ${value}.`);
        seen.add(value);
    }
}

function countPresent(rows, field) {
    return rows.filter(row => String(row[field] || '').trim()).length;
}

async function main() {
    const dataset = await loadWecFoundation();
    const summary = validateWecFoundation(dataset);
    const classificationFiles = Object.keys(dataset.contract.classificationFiles);
    const present = classificationFiles.filter(filename => fs.existsSync(path.join(DATA_DIRECTORY, filename)));
    if (present.length && present.length !== classificationFiles.length) {
        throw new Error(`Partial WEC classification dataset: ${present.length}/${classificationFiles.length} files present.`);
    }
    if (present.length) {
        const [drivers, teams, manufacturers, models, competitors, entries, crew, sessions, results, championships, standings] = await Promise.all([
            readCsv('wecdb-drivers.csv'), readCsv('wecdb-teams.csv'), readCsv('wecdb-manufacturers.csv'), readCsv('wecdb-car-models.csv'), readCsv('wecdb-competitors.csv'),
            readCsv('wecdb-entries.csv'), readCsv('wecdb-entry-drivers.csv'), readCsv('wecdb-sessions.csv'),
            readCsv('wecdb-session-results.csv'), readCsv('wecdb-championships.csv'), readCsv('wecdb-standings.csv')
        ]);
        requireUnique(drivers, 'id', 'Driver');
        requireUnique(teams, 'id', 'Team');
        requireUnique(manufacturers, 'id', 'Manufacturer');
        requireUnique(models, 'id', 'Car model');
        requireUnique(competitors, 'id', 'Competitor');
        requireUnique(entries, 'id', 'Entry');
        requireUnique(crew, row => `${row.entryId}:${row.driverId}`, 'Crew assignment');
        requireUnique(sessions, 'id', 'Session');
        requireUnique(results, row => `${row.sessionId}:${row.entryId}`, 'Session result');
        requireUnique(championships, 'id', 'Championship');
        requireUnique(standings, row => `${row.championshipId}:${row.round}:${row.entityId}`, 'Standing');
        const entryIds = new Set(entries.map(row => row.id));
        const sessionIds = new Set(sessions.map(row => row.id));
        const competitorIds = new Set(competitors.map(row => row.id));
        const driverIds = new Set(drivers.map(row => row.id));
        const teamIds = new Set(teams.map(row => row.id));
        const manufacturerIds = new Set(manufacturers.map(row => row.id));
        const modelIds = new Set(models.map(row => row.id));
        const eventIds = new Set(dataset.events.map(row => row.id));
        const classIds = new Set(dataset.classes.map(row => row.id));
        const entityIds = new Set([...drivers, ...teams, ...manufacturers, ...competitors].map(row => row.id));
        const championshipIds = new Set(championships.map(row => row.id));
        const eventsById = new Map(dataset.events.map(row => [row.id, row]));
        const entriesById = new Map(entries.map(row => [row.id, row]));
        const sessionsById = new Map(sessions.map(row => [row.id, row]));
        for (const model of models) if (!manufacturerIds.has(model.manufacturerId)) throw new Error(`Car model ${model.id} refers to unknown manufacturer ${model.manufacturerId}.`);
        for (const competitor of competitors) {
            if (!teamIds.has(competitor.teamId)) throw new Error(`Competitor ${competitor.id} refers to unknown team ${competitor.teamId}.`);
            if (!manufacturerIds.has(competitor.manufacturerId)) throw new Error(`Competitor ${competitor.id} refers to unknown manufacturer ${competitor.manufacturerId}.`);
            if (!modelIds.has(competitor.carModelId)) throw new Error(`Competitor ${competitor.id} refers to unknown car model ${competitor.carModelId}.`);
        }
        for (const row of entries) {
            if (!eventIds.has(row.eventId)) throw new Error(`Entry ${row.id} refers to unknown event ${row.eventId}.`);
            if (!competitorIds.has(row.competitorId)) throw new Error(`Entry refers to unknown competitor ${row.competitorId}.`);
            if (!classIds.has(row.classId)) throw new Error(`Entry ${row.id} refers to unknown class ${row.classId}.`);
            if (!teamIds.has(row.teamId)) throw new Error(`Entry ${row.id} refers to unknown team ${row.teamId}.`);
            if (!manufacturerIds.has(row.manufacturerId)) throw new Error(`Entry ${row.id} refers to unknown manufacturer ${row.manufacturerId}.`);
            if (!modelIds.has(row.carModelId)) throw new Error(`Entry ${row.id} refers to unknown car model ${row.carModelId}.`);
            if (eventsById.get(row.eventId).seasonId !== row.seasonId) throw new Error(`Entry ${row.id} has a mismatched season.`);
        }
        for (const row of crew) {
            if (!entryIds.has(row.entryId)) throw new Error(`Crew refers to unknown entry ${row.entryId}.`);
            if (!driverIds.has(row.driverId)) throw new Error(`Crew refers to unknown driver ${row.driverId}.`);
            if (entriesById.get(row.entryId).eventId !== row.eventId) throw new Error(`Crew for ${row.entryId} has a mismatched event.`);
        }
        for (const row of sessions) {
            if (!eventIds.has(row.eventId)) throw new Error(`Session ${row.id} refers to unknown event ${row.eventId}.`);
            if (row.classId && !classIds.has(row.classId)) throw new Error(`Session ${row.id} refers to unknown class ${row.classId}.`);
            if (eventsById.get(row.eventId).seasonId !== row.seasonId) throw new Error(`Session ${row.id} has a mismatched season.`);
            if (!['practice', 'warm-up', 'qualifying', 'hyperpole', 'race'].includes(row.type)) throw new Error(`${row.id} has out-of-scope session type ${row.type}.`);
            if (/\b(?:test|prologue)\b/i.test(row.name)) throw new Error(`${row.id} includes an out-of-scope test session.`);
            if (/\brace hour \d+\b/i.test(row.name)) throw new Error(`${row.id} includes an interim race classification.`);
        }
        for (const row of results) {
            if (!entryIds.has(row.entryId)) throw new Error(`Result refers to unknown entry ${row.entryId}.`);
            if (!sessionIds.has(row.sessionId)) throw new Error(`Result refers to unknown session ${row.sessionId}.`);
            if (!classIds.has(row.classId)) throw new Error(`Result refers to unknown class ${row.classId}.`);
            const entry = entriesById.get(row.entryId);
            const session = sessionsById.get(row.sessionId);
            if (entry.eventId !== row.eventId || session.eventId !== row.eventId) throw new Error(`Result ${row.sessionId}/${row.entryId} has a mismatched event.`);
            if (entry.classId !== row.classId) throw new Error(`Result ${row.sessionId}/${row.entryId} has a mismatched class.`);
        }
        const crewEntries = new Set(crew.map(row => row.entryId));
        for (const entry of entries) if (!crewEntries.has(entry.id)) throw new Error(`Entry ${entry.id} has no crew.`);
        const eventResults = new Map();
        for (const row of results) {
            if (!eventResults.has(row.sessionId)) eventResults.set(row.sessionId, []);
            eventResults.get(row.sessionId).push(row);
        }
        for (const [sessionId, rows] of eventResults) {
            const overall = rows.filter(row => row.overallPosition !== '').map(row => Number(row.overallPosition)).sort((a, b) => a - b);
            if (overall.some((position, index) => position !== index + 1)) throw new Error(`${sessionId} has non-contiguous overall positions.`);
            for (const classId of new Set(rows.map(row => row.classId))) {
                const positions = rows.filter(row => row.classId === classId && row.classPosition !== '').map(row => Number(row.classPosition)).sort((a, b) => a - b);
                if (positions.some((position, index) => position !== index + 1)) throw new Error(`${sessionId}/${classId} has non-contiguous class positions.`);
            }
        }
        for (const session of sessions) {
            if (!eventResults.has(session.id)) throw new Error(`${session.id} has no official classification rows.`);
        }
        for (const event of dataset.events) {
            const eventEntries = entries.filter(row => row.eventId === event.id);
            const raceSessions = sessions.filter(row => row.eventId === event.id && row.type === 'race');
            if (raceSessions.length !== 1) throw new Error(`${event.id} has ${raceSessions.length} race sessions instead of one.`);
            const raceRows = eventResults.get(raceSessions[0].id) || [];
            if (!raceRows.length || raceRows.length > eventEntries.length) throw new Error(`${event.id} has invalid race classification coverage.`);
        }
        for (const row of standings) {
            if (!championshipIds.has(row.championshipId)) throw new Error(`Standing refers to unknown championship ${row.championshipId}.`);
            if (!entityIds.has(row.entityId)) throw new Error(`Standing refers to unknown entity ${row.entityId}.`);
        }
        const seasonIds = new Set(dataset.seasons.map(row => row.id));
        for (const championship of championships) {
            if (!seasonIds.has(championship.seasonId)) throw new Error(`${championship.id} has an invalid season reference.`);
            if (!classIds.has(championship.classId)) throw new Error(`${championship.id} has an invalid class reference.`);
            const scope = String(championship.classIds || championship.classId).split('|').filter(Boolean);
            if (!scope.includes(championship.classId)) throw new Error(`${championship.id} scope omits its primary class.`);
            for (const classId of scope) if (!classIds.has(classId) || !classId.startsWith(`${championship.seasonId}-`)) {
                throw new Error(`${championship.id} has invalid scoped class ${classId}.`);
            }
        }
        const champions = standings.filter(row => row.championshipWon === 'true');
        for (const championship of championships) {
            if (champions.filter(row => row.championshipId === championship.id).length < 1) throw new Error(`${championship.id} has no champion.`);
            const championshipRows = standings.filter(row => row.championshipId === championship.id);
            const finalRound = Math.max(...championshipRows.map(row => Number(row.round)));
            if (finalRound !== Math.max(...dataset.events.filter(row => row.seasonId === championship.seasonId).map(row => Number(row.round)))) {
                throw new Error(`${championship.id} does not reach the final season round.`);
            }
            if (championshipRows.some(row => row.championshipWon === 'true' && Number(row.round) !== finalRound)) throw new Error(`${championship.id} awards a title before its final round.`);
            const scope = new Set(String(championship.classIds || championship.classId).split('|').filter(Boolean));
            const scopedEntries = entries.filter(row => row.seasonId === championship.seasonId && scope.has(row.classId));
            const scopedEntryIds = new Set(scopedEntries.map(row => row.id));
            const participatingEntities = championship.entityType === 'driver'
                ? new Set(crew.filter(row => scopedEntryIds.has(row.entryId)).map(row => row.driverId))
                : championship.entityType === 'manufacturer' ? new Set(scopedEntries.map(row => row.manufacturerId))
                    : championship.entityType === 'team' ? new Set(scopedEntries.map(row => row.teamId))
                        : new Set(scopedEntries.map(row => row.competitorId));
            const missingEntities = championshipRows.filter(row => Number(row.round) === finalRound && Number(row.points) > 0 && !participatingEntities.has(row.entityId));
            if (missingEntities.length) throw new Error(`${championship.id} contains entities outside its class scope: ${missingEntities.slice(0, 5).map(row => row.entityId).join(', ')}.`);
            for (const round of new Set(championshipRows.map(row => row.round))) {
                const rows = championshipRows.filter(row => row.round === round);
                const positions = rows.map(row => Number(row.position)).sort((a, b) => a - b);
                if (!positions.length || positions[0] !== 1) throw new Error(`${championship.id} round ${round} has no leader.`);
            }
        }
        const coverageBySeason = {};
        for (const season of dataset.seasons) {
            const year = Number(season.year);
            const seasonEvents = dataset.events.filter(row => row.seasonId === season.id);
            const seasonEventIds = new Set(seasonEvents.map(row => row.id));
            const seasonSessions = sessions.filter(row => row.seasonId === season.id);
            const seasonSessionIds = new Set(seasonSessions.map(row => row.id));
            const seasonChampionships = championships.filter(row => row.seasonId === season.id);
            const seasonChampionshipIds = new Set(seasonChampionships.map(row => row.id));
            const actual = {
                events: seasonEvents.length,
                competitors: competitors.filter(row => row.seasonId === season.id).length,
                entries: entries.filter(row => row.seasonId === season.id).length,
                crewAssignments: crew.filter(row => seasonEventIds.has(row.eventId)).length,
                sessions: seasonSessions.length,
                results: results.filter(row => seasonSessionIds.has(row.sessionId)).length,
                championships: seasonChampionships.length,
                standings: standings.filter(row => seasonChampionshipIds.has(row.championshipId)).length
            };
            const expected = EXPECTED_SEASON_COVERAGE[year];
            if (expected) for (const [field, value] of Object.entries(expected)) {
                if (actual[field] !== value) throw new Error(`${year} ${field} coverage changed: expected ${value}, found ${actual[field]}.`);
            }
            coverageBySeason[year] = actual;
        }
        const metadataCounts = {
            driverNationalities: countPresent(drivers, 'nationalityCountryId'),
            driverCategories: countPresent(crew, 'category'),
            teamCountries: countPresent(teams, 'countryId'),
            manufacturerCountries: countPresent(manufacturers, 'countryId')
        };
        if (metadataCounts.driverNationalities !== drivers.length) throw new Error('WEC driver nationality coverage is incomplete.');
        if (metadataCounts.driverCategories !== crew.length) throw new Error('WEC driver category coverage is incomplete.');
        if (metadataCounts.teamCountries !== teams.length) throw new Error('WEC team country coverage is incomplete.');
        if (metadataCounts.manufacturerCountries !== manufacturers.length) throw new Error('WEC manufacturer country coverage is incomplete.');
        const countryRows = await readCsv('f1db-countries.csv');
        const countryIds = new Set(countryRows.map(row => row.id));
        const countryCodes = new Map(countryRows.map(row => [row.id, String(row.alpha2Code || '').toLowerCase()]));
        const referencedCountries = new Set([
            ...dataset.circuits.map(row => row.countryId), ...drivers.map(row => row.nationalityCountryId),
            ...teams.map(row => row.countryId), ...manufacturers.map(row => row.countryId)
        ]);
        for (const countryId of referencedCountries) {
            if (!countryIds.has(countryId)) throw new Error(`WEC metadata refers to unknown country ${countryId}.`);
            const flag = path.join(DATA_DIRECTORY, '..', 'frontend', 'assets', 'flags', `${countryCodes.get(countryId)}.svg`);
            if (!countryCodes.get(countryId) || !fs.existsSync(flag)) throw new Error(`WEC metadata has no flag asset for ${countryId}.`);
        }
        for (const circuit of dataset.circuits) {
            for (const field of ['type', 'direction', 'latitude', 'longitude', 'length', 'turns', 'layoutId', 'layoutVersion', 'mapSourceUrl']) {
                if (!String(circuit[field] || '').trim()) throw new Error(`WEC circuit ${circuit.id} is missing ${field}.`);
            }
            const asset = path.join(DATA_DIRECTORY, '..', 'frontend', 'assets', 'circuits', `${circuit.layoutId}.svg`);
            if (!fs.existsSync(asset)) throw new Error(`WEC circuit ${circuit.id} has no layout asset ${circuit.layoutId}.svg.`);
        }
        const metadata = {
            driverNationalities: `${metadataCounts.driverNationalities}/${drivers.length}`,
            driverCategories: `${metadataCounts.driverCategories}/${crew.length}`,
            teamCountries: `${metadataCounts.teamCountries}/${teams.length}`,
            manufacturerCountries: `${metadataCounts.manufacturerCountries}/${manufacturers.length}`
        };
        Object.assign(summary, { competitors: competitors.length, entries: entries.length, crewAssignments: crew.length, sessions: sessions.length, results: results.length, championships: championships.length, standings: standings.length, coverageBySeason, metadata });
    }
    console.log(`WEC data audited: ${JSON.stringify(summary)}`);
}

if (require.main === module) main().catch(error => {
    console.error(error.message || error);
    process.exitCode = 1;
});

module.exports = { main };
