const POINT_SYSTEMS = require('../frontend/js/f1-points-systems');
const { pointsFor, simulateConstructors, simulateDrivers } = require('./championship-simulator');
const { editDistance } = require('./search-results');

const cache = new Map();
const CACHE_MS = 5 * 60 * 1000;

function resolvePointsSystem(year) {
    const numericYear = Number(year);
    for (const [key, system] of Object.entries(POINT_SYSTEMS)) {
        const [startText, endText = startText] = String(key).split('-');
        const start = Number(startText);
        const end = endText === 'present' ? Infinity : Number(endText);
        if (numericYear >= start && numericYear <= end) return { key, system };
    }
    return null;
}

function availablePointsSystems() {
    return Object.entries(POINT_SYSTEMS).map(([id, system]) => ({
        id,
        year: Number(String(id).split('-')[0]),
        name: system.name,
        constructorsAvailable: system.constructorsAvailable !== false
    }));
}

function isTrue(value) {
    return value === true || value === 1 || ['1', 'true'].includes(String(value).toLowerCase());
}

function inferRacePointsMultiplier(rows, officialSystem) {
    if (!officialSystem?.race?.length) return 1;
    const positionCounts = new Map();
    rows.forEach(row => {
        const position = Number(row.positionNumber);
        if (position > 0) positionCounts.set(position, Number(positionCounts.get(position) || 0) + 1);
    });
    const matches = new Map([0.25, 0.5, 0.75].map(factor => [factor, 0]));
    rows.forEach(row => {
        const position = Number(row.positionNumber);
        const fullPoints = pointsFor(position, officialSystem.race);
        if (!fullPoints || positionCounts.get(position) !== 1 || isTrue(row.fastestLap)) return;
        const officialPoints = Number(row.officialPoints);
        if (!Number.isFinite(officialPoints) || officialPoints <= 0) return;
        const ratio = officialPoints / fullPoints;
        matches.forEach((count, factor) => {
            if (Math.abs(ratio - factor) < 0.01) matches.set(factor, count + 1);
        });
    });
    const [factor, count] = [...matches.entries()].sort((first, second) => second[1] - first[1])[0];
    return count ? factor : 1;
}

function raceMetadata(rows) {
    const groups = new Map();
    rows.forEach(row => {
        const key = `${Number(row.year)}:${Number(row.round)}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(row);
    });
    const metadata = new Map();
    groups.forEach((raceRows, key) => {
        const positionCounts = new Map();
        const sharedPositions = new Set();
        let fastestLapShare = 0;
        raceRows.forEach(row => {
            const position = Number(row.positionNumber);
            if (position > 0) positionCounts.set(position, Number(positionCounts.get(position) || 0) + 1);
            if (position > 0 && isTrue(row.sharedCar)) sharedPositions.add(position);
            if (isTrue(row.fastestLap)) fastestLapShare += 1;
        });
        const officialSystem = resolvePointsSystem(raceRows[0]?.year)?.system;
        metadata.set(key, {
            fastestLapShare: Math.max(1, fastestLapShare),
            positionShare(position) {
                const numericPosition = Number(position);
                return sharedPositions.has(numericPosition) ? Number(positionCounts.get(numericPosition) || 1) : 1;
            },
            racePointsMultiplier: inferRacePointsMultiplier(raceRows, officialSystem)
        });
    });
    return metadata;
}

function ensureDriver(season, row) {
    const driverId = String(row.driverId);
    if (!season.drivers.has(driverId)) {
        season.drivers.set(driverId, {
            position: Number(row.positionNumber || 0),
            driverId,
            name: row.driverName || driverId,
            points: Number(row.officialPoints || 0),
            raceResults: new Map()
        });
    }
    return season.drivers.get(driverId);
}

function ensureConstructor(season, row) {
    const constructorId = String(row.constructorId);
    if (!season.constructors.has(constructorId)) {
        season.constructors.set(constructorId, {
            position: Number(row.positionNumber || 0),
            constructorId,
            name: row.constructorName || constructorId,
            points: Number(row.officialPoints || 0)
        });
    }
    return season.constructors.get(constructorId);
}

function countingRule(system, entity) {
    if (entity === 'constructors' && system.constructorCountBest !== undefined) {
        return Number.isFinite(system.constructorCountBest)
            ? `Best ${system.constructorCountBest} results count`
            : 'Every result counts';
    }
    if (system.countOnlySegments) {
        return `Best ${system.bestFirstRounds} of the first ${system.firstRoundsWindow} and best ${system.bestLastRounds} of the last ${system.lastRoundsWindow}`;
    }
    return Number.isFinite(system.countBest) ? `Best ${system.countBest} results count` : 'Every result counts';
}

function ruleSummary(system, entity = 'drivers') {
    const constructors = entity === 'constructors';
    const raceScale = constructors && system.constructorRace ? system.constructorRace : system.race;
    const fastestLapBonus = constructors && system.constructorFastestLapBonus !== undefined
        ? system.constructorFastestLapBonus
        : system.fastestLapBonus;
    const rules = [`Race points ${raceScale.join('–')}`];
    if (system.sprint?.length) rules.push(`Sprint points ${system.sprint.join('–')}`);
    else rules.push('No sprint points');
    rules.push(countingRule(system, entity));
    if (constructors && system.constructorScoringCars === 1) rules.push('Only the best-placed car scores for each constructor');
    if (fastestLapBonus) rules.push(`${fastestLapBonus} fastest-lap bonus point${fastestLapBonus === 1 ? '' : 's'}`);
    if (system.poleBonus) rules.push(`${system.poleBonus} pole bonus point${system.poleBonus === 1 ? '' : 's'}`);
    if (system.doublePointsFinalRound) rules.push('Double points in the final round');
    rules.push('Ties decided by countback');
    return rules;
}

function entityLabels(entity) {
    return entity === 'constructors'
        ? { singular: 'constructor', plural: 'constructors', championship: 'Constructors’ Championships' }
        : { singular: 'driver', plural: 'drivers', championship: 'Drivers’ Championships' };
}

function leaderAnswer(leaders, pointsSystemName, seasonsEvaluated, entity) {
    const labels = entityLabels(entity);
    const titles = leaders[0]?.titles || 0;
    const titleLabel = titles === 1 ? 'title' : 'titles';
    if (leaders.length === 1) {
        return `${leaders[0].name} would have the most ${labels.championship} with ${titles} ${titleLabel} under the ${pointsSystemName} points system.`;
    }
    const names = leaders.length === 2
        ? `${leaders[0].name} and ${leaders[1].name}`
        : `${leaders.slice(0, -1).map(entry => entry.name).join(', ')}, and ${leaders.at(-1).name}`;
    return `${names} would be tied for the most ${labels.championship} with ${titles} each under the ${pointsSystemName} points system across ${seasonsEvaluated} completed seasons.`;
}

function normalizedName(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

function nameMatchScore(query, candidate) {
    const wanted = normalizedName(query);
    const available = normalizedName(candidate);
    if (!wanted || !available) return 0;
    if (wanted === available) return 100;
    const tokens = available.split(' ');
    if (tokens.at(-1) === wanted) return 95;
    if (tokens.includes(wanted)) return 90;
    if (available.startsWith(`${wanted} `) || available.endsWith(` ${wanted}`)) return 85;
    if (available.includes(wanted)) return 70;
    const threshold = wanted.length >= 6 ? 2 : wanted.length >= 4 ? 1 : 0;
    if (threshold) {
        const distances = [editDistance(available, wanted), ...tokens.map(token => editDistance(token, wanted))];
        const distance = Math.min(...distances);
        if (distance <= threshold) return 60 - distance;
    }
    return 0;
}

async function resolveNamedSubject(connection, subjectName, entityHint) {
    const entityQueries = entityHint === 'drivers' || entityHint === 'constructors'
        ? [entityHint]
        : ['drivers', 'constructors'];
    const groups = await Promise.all(entityQueries.map(async entity => {
        const rows = await connection.query(entity === 'constructors'
            ? 'SELECT id, name FROM constructors ORDER BY name'
            : 'SELECT id, name FROM drivers ORDER BY name');
        return rows.map(row => ({ id: String(row.id), name: row.name, entity }));
    }));
    const candidates = groups.flat();
    const matches = candidates.map(entry => ({
        ...entry,
        score: nameMatchScore(subjectName, entry.name)
    })).filter(entry => entry.score > 0)
        .sort((first, second) => second.score - first.score || first.name.localeCompare(second.name));
    const bestScore = matches[0]?.score || 0;
    const best = matches.filter(entry => entry.score === bestScore);
    if (!best.length) {
        const wanted = normalizedName(subjectName);
        const suggestions = candidates.map(entry => ({
            ...entry,
            distance: Math.min(editDistance(normalizedName(entry.name), wanted), ...normalizedName(entry.name).split(' ').map(token => editDistance(token, wanted)))
        })).sort((first, second) => first.distance - second.distance || first.name.localeCompare(second.name)).slice(0, 4);
        const error = new Error(`Racelytic could not find a driver or constructor matching “${subjectName}”. Try the full name.`);
        error.statusCode = 422;
        error.suggestions = suggestions.map(({ id, name, entity }) => ({ id, name, entity }));
        throw error;
    }
    if (best.length > 1) {
        const suggestions = best.slice(0, 4).map(entry => entry.name).join(', ');
        const error = new Error(`“${subjectName}” matches more than one name: ${suggestions}. Try a full name.`);
        error.statusCode = 422;
        error.suggestions = best.slice(0, 4).map(({ id, name, entity }) => ({ id, name, entity }));
        throw error;
    }
    return best[0];
}

async function championshipRows(connection, entity, startYear, endYear) {
    if (entity === 'constructors') {
        return Promise.all([
            connection.query(`
                SELECT s.year, s.constructorId, k.name AS constructorName
                FROM seasons_constructor_standings s
                JOIN constructors k ON k.id = s.constructorId
                WHERE s.year BETWEEN ? AND ?
                  AND LOWER(CAST(s.championshipWon AS CHAR)) IN ('1', 'true')
                ORDER BY s.year
            `, [startYear, endYear]),
            connection.query(`
                SELECT s.year, s.constructorId, k.name AS constructorName, s.positionNumber,
                       s.points AS officialPoints
                FROM seasons_constructor_standings s
                JOIN constructors k ON k.id = s.constructorId
                WHERE s.year BETWEEN ? AND ?
                ORDER BY s.year, s.positionDisplayOrder, s.positionNumber
            `, [startYear, endYear])
        ]);
    }
    return Promise.all([
        connection.query(`
            SELECT s.year, s.driverId, d.name AS driverName
            FROM seasons_driver_standings s
            JOIN drivers d ON d.id = s.driverId
            WHERE s.year BETWEEN ? AND ?
              AND LOWER(CAST(s.championshipWon AS CHAR)) IN ('1', 'true')
            ORDER BY s.year
        `, [startYear, endYear]),
        connection.query(`
            SELECT s.year, s.driverId, d.name AS driverName, s.positionNumber,
                   s.points AS officialPoints
            FROM seasons_driver_standings s
            JOIN drivers d ON d.id = s.driverId
            WHERE s.year BETWEEN ? AND ?
            ORDER BY s.year, s.positionDisplayOrder, s.positionNumber
        `, [startYear, endYear])
    ]);
}

function seasonExplanation(year, standings, officialChampion, calendar, entity) {
    const champion = standings[0];
    if (!champion || !officialChampion) return null;
    const changed = String(champion.id) !== String(officialChampion.id);
    const officialUnderNewRules = standings.find(entry => String(entry.id) === String(officialChampion.id));
    const comparator = changed ? officialUnderNewRules : standings[1];
    const raceNames = new Map(calendar.map(race => [Number(race.round), race.name || `Round ${race.round}`]));
    const comparatorRounds = new Map((comparator?.roundScores || []).map(round => [Number(round.round), round]));
    const decisiveRounds = (champion.roundScores || []).map(round => {
        const rivalRound = comparatorRounds.get(Number(round.round));
        return {
            round: Number(round.round),
            name: raceNames.get(Number(round.round)) || `Round ${round.round}`,
            championPoints: Number(round.points || 0),
            rivalPoints: Number(rivalRound?.points || 0),
            swing: Number(round.points || 0) - Number(rivalRound?.points || 0)
        };
    }).filter(round => round.swing > 0)
        .sort((first, second) => second.swing - first.swing || first.round - second.round)
        .slice(0, 3);
    const standingsSummary = standings.slice(0, 5).map(entry => ({
        id: String(entry.id),
        name: entry.name,
        position: Number(entry.simulatedPosition),
        points: Number(entry.points || 0),
        earnedPoints: Number(entry.earnedPoints || 0),
        droppedPoints: Number(entry.droppedPoints || 0),
        officialPosition: Number(entry.originalPosition || 0),
        officialPoints: Number(entry.originalPoints || 0),
        href: `/${entity === 'constructors' ? 'constructor' : 'driver'}?id=${encodeURIComponent(entry.id)}`
    }));
    const margin = Number(champion.points || 0) - Number(standings[1]?.points || 0);
    const opponentName = comparator?.name || standings[1]?.name || 'the runner-up';
    const outcome = changed
        ? `${champion.name} moves from ${champion.originalPosition || 'outside'} to first with ${margin ? `a ${margin}-point lead` : 'the countback advantage'}, while official champion ${officialChampion.name} falls to ${officialUnderNewRules?.simulatedPosition || 'outside the classified standings'}.`
        : `${champion.name} remains champion, finishing ${margin ? `${margin} points` : 'level on points and ahead on countback'} ahead of ${opponentName}.`;
    return {
        year,
        changed,
        officialChampion,
        champion: standingsSummary[0],
        runnerUp: standingsSummary[1] || null,
        comparedWith: comparator ? { id: String(comparator.id), name: comparator.name } : null,
        margin,
        outcome,
        decisiveRounds,
        standings: standingsSummary
    };
}

async function calculateTitleCounts(connection, { pointsSystemYear, fromYear, toYear, entity = 'drivers' }) {
    const selectedEntity = entity === 'constructors' ? 'constructors' : 'drivers';
    const labels = entityLabels(selectedEntity);
    const resolved = resolvePointsSystem(pointsSystemYear);
    if (!resolved) {
        const error = new Error(`Racelytic does not have an official Formula 1 points system for ${pointsSystemYear}.`);
        error.statusCode = 422;
        throw error;
    }
    if (selectedEntity === 'constructors' && resolved.system.constructorsAvailable === false) {
        const error = new Error(`${resolved.system.name} predates the Constructors’ Championship. Choose rules from 1958 onwards.`);
        error.statusCode = 422;
        throw error;
    }
    const startYear = Math.max(selectedEntity === 'constructors' ? 1958 : 1950, Number(fromYear || (selectedEntity === 'constructors' ? 1958 : 1950)));
    const endYear = Math.min(2100, Number(toYear || 2100));
    if (startYear > endYear) {
        const error = new Error('The first season must be earlier than the final season.');
        error.statusCode = 422;
        throw error;
    }
    const cacheKey = `${selectedEntity}:${resolved.key}:${startYear}:${endYear}`;
    const cached = cache.get(cacheKey);
    if (cached && cached.savedAt > Date.now() - CACHE_MS) return cached.value;

    const [[champions, standings], calendar, raceRows, sprintRows] = await Promise.all([
        championshipRows(connection, selectedEntity, startYear, endYear),
        connection.query(`
            SELECT r.year, r.round, COALESCE(NULLIF(gp.fullName, ''), r.officialName) AS raceName
            FROM races r LEFT JOIN grands_prix gp ON gp.id = r.grandPrixId
            WHERE r.year BETWEEN ? AND ? ORDER BY r.year, r.round
        `, [startYear, endYear]),
        connection.query(`
            SELECT rr.year, rr.round, rr.driverId, d.name AS driverName,
                   rr.constructorId, k.name AS constructorName,
                   rr.positionNumber, rr.points AS officialPoints, rr.sharedCar,
                   rr.fastestLap, rr.polePosition
            FROM races_race_results rr
            JOIN drivers d ON d.id = rr.driverId
            LEFT JOIN constructors k ON k.id = rr.constructorId
            WHERE rr.year BETWEEN ? AND ?
            ORDER BY rr.year, rr.round, rr.positionDisplayOrder
        `, [startYear, endYear]),
        resolved.system.sprint?.length ? connection.query(`
            SELECT sr.year, sr.round, sr.driverId, d.name AS driverName,
                   sr.constructorId, sr.positionNumber
            FROM races_sprint_race_results sr
            JOIN drivers d ON d.id = sr.driverId
            WHERE sr.year BETWEEN ? AND ?
            ORDER BY sr.year, sr.round, sr.positionDisplayOrder
        `, [startYear, endYear]) : Promise.resolve([])
    ]);

    const completedYears = new Set(champions.map(row => Number(row.year)));
    if (!completedYears.size) {
        const error = new Error(`No completed Formula 1 ${labels.championship} were found in that range.`);
        error.statusCode = 422;
        throw error;
    }
    const seasons = new Map([...completedYears].map(year => [year, {
        year, calendar: [], drivers: new Map(), constructors: new Map(), completedRounds: new Set()
    }]));
    standings.forEach(row => {
        const season = seasons.get(Number(row.year));
        if (!season) return;
        if (selectedEntity === 'constructors') ensureConstructor(season, row);
        else ensureDriver(season, row);
    });
    calendar.forEach(row => {
        const season = seasons.get(Number(row.year));
        if (season) season.calendar.push({ round: Number(row.round), name: row.raceName || `Round ${Number(row.round)}` });
    });
    const metadataByRace = raceMetadata(raceRows);
    raceRows.forEach(row => {
        const season = seasons.get(Number(row.year));
        if (!season) return;
        const driver = ensureDriver(season, row);
        const round = String(Number(row.round));
        season.completedRounds.add(round);
        const metadata = metadataByRace.get(`${Number(row.year)}:${Number(row.round)}`);
        driver.raceResults.set(round, {
            constructorId: row.constructorId,
            position: row.positionNumber === null ? null : Number(row.positionNumber),
            fastestLap: row.fastestLap,
            fastestLapShare: metadata?.fastestLapShare || 1,
            polePosition: row.polePosition,
            positionShare: metadata?.positionShare(row.positionNumber) || 1,
            racePointsMultiplier: metadata?.racePointsMultiplier || 1,
            sprintResults: []
        });
    });
    sprintRows.forEach(row => {
        const season = seasons.get(Number(row.year));
        if (!season) return;
        const driver = ensureDriver(season, row);
        const round = String(Number(row.round));
        const result = driver.raceResults.get(round) || {
            constructorId: null, position: null, fastestLap: false, polePosition: false, sprintResults: []
        };
        result.sprintConstructorId = row.constructorId;
        result.sprintResults.push({ position: row.positionNumber === null ? null : Number(row.positionNumber) });
        driver.raceResults.set(round, result);
    });

    const officialChampionByYear = new Map(champions.map(row => [Number(row.year), {
        id: String(selectedEntity === 'constructors' ? row.constructorId : row.driverId),
        name: selectedEntity === 'constructors' ? row.constructorName : row.driverName
    }]));
    const simulatedTitles = new Map();
    const officialTitles = new Map();
    const names = new Map();
    const changedChampionships = [];
    const seasonExplanations = [];
    const excludedSeasons = [];
    let seasonsEvaluated = 0;

    for (const season of [...seasons.values()].sort((first, second) => first.year - second.year)) {
        const calendarRounds = new Set(season.calendar.map(race => String(race.round)));
        if (!calendarRounds.size || [...calendarRounds].some(round => !season.completedRounds.has(round))) {
            excludedSeasons.push(season.year);
            continue;
        }
        const data = {
            year: season.year,
            calendar: season.calendar,
            driverChampionship: [...season.drivers.values()].map(driver => ({
                ...driver, raceResults: Object.fromEntries(driver.raceResults)
            })),
            constructorChampionship: [...season.constructors.values()]
        };
        const standingsResult = selectedEntity === 'constructors'
            ? simulateConstructors(data, resolved.system)
            : simulateDrivers(data, resolved.system);
        const simulatedChampion = standingsResult[0];
        const officialChampion = officialChampionByYear.get(season.year);
        if (!simulatedChampion || !officialChampion) continue;
        const explanation = seasonExplanation(season.year, standingsResult, officialChampion, season.calendar, selectedEntity);
        if (explanation) seasonExplanations.push(explanation);
        seasonsEvaluated += 1;
        names.set(String(simulatedChampion.id), simulatedChampion.name);
        names.set(String(officialChampion.id), officialChampion.name);
        simulatedTitles.set(String(simulatedChampion.id), Number(simulatedTitles.get(String(simulatedChampion.id)) || 0) + 1);
        officialTitles.set(String(officialChampion.id), Number(officialTitles.get(String(officialChampion.id)) || 0) + 1);
        if (String(simulatedChampion.id) !== String(officialChampion.id)) {
            changedChampionships.push({
                year: season.year,
                officialChampion,
                simulatedChampion: {
                    id: String(simulatedChampion.id), name: simulatedChampion.name, points: simulatedChampion.points
                },
                margin: simulatedChampion.points - Number(standingsResult[1]?.points || 0),
                explanation,
                href: `/simulator?year=${season.year}&points=${encodeURIComponent(resolved.key)}${selectedEntity === 'constructors' ? '&mode=constructors' : ''}`
            });
        }
    }

    const allIds = new Set([...simulatedTitles.keys(), ...officialTitles.keys()]);
    const ranking = [...allIds].map(id => ({
        id,
        name: names.get(id) || id,
        titles: Number(simulatedTitles.get(id) || 0),
        officialTitles: Number(officialTitles.get(id) || 0)
    })).filter(entry => entry.titles > 0)
        .sort((first, second) => second.titles - first.titles || second.officialTitles - first.officialTitles || first.name.localeCompare(second.name))
        .map((entry, index) => ({ ...entry, rank: index + 1, change: entry.titles - entry.officialTitles }));
    const mostTitles = ranking[0]?.titles || 0;
    const leaders = ranking.filter(entry => entry.titles === mostTitles);
    const evaluatedYears = [...seasons.keys()].filter(year => !excludedSeasons.includes(year)).sort((first, second) => first - second);
    const assumptions = [
        `Only completed Formula 1 ${labels.championship} are included.`,
        `The complete ${resolved.system.name} rule set is applied, not only its race-points scale.`,
        'Sprint results count only when the selected historical system awards sprint points.',
        'Races that historically awarded reduced points retain the recorded race multiplier.',
        'Recorded race classifications are used; ties are resolved by race-finish countback.'
    ];
    if (selectedEntity === 'drivers') assumptions.splice(3, 0, 'Shared-car finishing points and tied fastest-lap bonuses are divided between the recorded drivers.');
    else assumptions.splice(3, 0, 'Constructor-specific scoring limits and race-point scales are applied where the selected rules require them.');
    const value = {
        answer: leaderAnswer(leaders, resolved.system.name, seasonsEvaluated, selectedEntity),
        entity: selectedEntity,
        entityLabel: labels.championship,
        pointsSystem: { id: resolved.key, name: resolved.system.name, rules: ruleSummary(resolved.system, selectedEntity) },
        seasonRange: { from: evaluatedYears[0], to: evaluatedYears.at(-1) },
        seasonsEvaluated,
        excludedSeasons,
        ranking,
        changedChampionships,
        seasonExplanations,
        assumptions
    };
    cache.set(cacheKey, { savedAt: Date.now(), value });
    return value;
}

function seasonChampionAnswer(result, year) {
    const leaders = result.ranking.filter(entry => entry.titles === result.ranking[0]?.titles);
    const championship = result.entity === 'constructors' ? 'Constructors’ Championship' : 'Drivers’ Championship';
    if (leaders.length === 1) {
        return `${leaders[0].name} would win the ${year} ${championship} under the ${result.pointsSystem.name} points system.`;
    }
    const names = leaders.map(entry => entry.name).join(' and ');
    return `${names} would finish tied for the ${year} ${championship} under the ${result.pointsSystem.name} points system.`;
}

function changedChampionshipsAnswer(result) {
    const count = result.changedChampionships.length;
    const noun = count === 1 ? 'championship' : 'championships';
    if (!count) return `No ${result.entityLabel} would change hands under the ${result.pointsSystem.name} points system.`;
    const years = result.changedChampionships.map(entry => entry.year).join(', ');
    return `${count} ${noun} would change hands under the ${result.pointsSystem.name} points system: ${years}.`;
}

function focusForSubject(result, subject) {
    const ranked = result.ranking.find(entry => String(entry.id) === subject.id);
    return {
        id: subject.id,
        name: subject.name,
        entity: subject.entity,
        titles: Number(ranked?.titles || 0),
        officialTitles: Number(ranked?.officialTitles || 0),
        change: Number(ranked?.change || 0),
        href: `/${subject.entity === 'constructors' ? 'constructor' : 'driver'}?id=${encodeURIComponent(subject.id)}`
    };
}

function comparisonAnswer(results, subject) {
    if (subject) {
        const [first, second] = results;
        const firstTitles = first.focus.titles;
        const secondTitles = second.focus.titles;
        if (firstTitles === secondTitles) {
            return `${subject.name} would have ${firstTitles} title${firstTitles === 1 ? '' : 's'} under both the ${first.pointsSystem.name} and ${second.pointsSystem.name} systems.`;
        }
        const better = firstTitles > secondTitles ? first : second;
        const other = better === first ? second : first;
        return `${subject.name} would have ${better.focus.titles} title${better.focus.titles === 1 ? '' : 's'} under the ${better.pointsSystem.name} system, compared with ${other.focus.titles} under ${other.pointsSystem.name}.`;
    }
    const descriptions = results.map(result => {
        const titles = result.ranking[0]?.titles || 0;
        const leaders = result.ranking.filter(entry => entry.titles === titles).map(entry => entry.name).join(' and ');
        return `${leaders} lead${leaders.includes(' and ') ? '' : 's'} with ${titles} title${titles === 1 ? '' : 's'} under ${result.pointsSystem.name}`;
    });
    return `${descriptions[0]}; ${descriptions[1]}.`;
}

async function comparePointsSystems(connection, interpretation) {
    const years = interpretation.comparisonPointsSystemYears.slice(0, 2);
    const subject = interpretation.subjectName
        ? await resolveNamedSubject(connection, interpretation.subjectName, interpretation.entity)
        : null;
    const entity = subject?.entity || interpretation.entity || 'drivers';
    const calculated = await Promise.all(years.map(pointsSystemYear => calculateTitleCounts(connection, {
        ...interpretation, entity, pointsSystemYear
    })));
    const results = calculated.map(result => ({
        ...result,
        ...(subject ? { focus: focusForSubject(result, subject) } : {})
    }));
    const answer = comparisonAnswer(results, subject);
    return {
        ...results[0],
        intent: 'compare_points_systems',
        answer,
        focus: subject ? results[0].focus : undefined,
        comparison: {
            subject: subject ? { id: subject.id, name: subject.name, entity: subject.entity } : null,
            systems: results.map(result => ({
                pointsSystem: result.pointsSystem,
                leaders: result.ranking.filter(entry => entry.titles === result.ranking[0]?.titles),
                ranking: result.ranking.slice(0, 5),
                changedChampionships: result.changedChampionships,
                seasonsEvaluated: result.seasonsEvaluated,
                focus: result.focus || null
            })),
            verdict: answer
        }
    };
}

async function executeAskQuery(connection, interpretation) {
    const intent = interpretation.intent;
    if (intent === 'compare_points_systems') return comparePointsSystems(connection, interpretation);
    if (intent === 'recalculate_entity_titles') {
        const subject = await resolveNamedSubject(connection, interpretation.subjectName, interpretation.entity);
        const result = await calculateTitleCounts(connection, { ...interpretation, entity: subject.entity });
        const focus = focusForSubject(result, subject);
        const championship = subject.entity === 'constructors' ? 'Constructors’ Championship' : 'Drivers’ Championship';
        const titleLabel = focus.titles === 1 ? 'title' : 'titles';
        return {
            ...result,
            intent,
            focus,
            answer: `${subject.name} would have ${focus.titles} ${championship} ${titleLabel} under the ${result.pointsSystem.name} points system.`
        };
    }

    const range = intent === 'recalculate_season_champion'
        ? { fromYear: interpretation.targetSeason, toYear: interpretation.targetSeason }
        : {};
    const result = await calculateTitleCounts(connection, { ...interpretation, ...range });
    if (intent === 'recalculate_season_champion') {
        return { ...result, intent, answer: seasonChampionAnswer(result, interpretation.targetSeason) };
    }
    if (intent === 'list_changed_championships') {
        return { ...result, intent, answer: changedChampionshipsAnswer(result) };
    }
    return { ...result, intent: 'recalculate_title_counts' };
}

module.exports = {
    availablePointsSystems,
    calculateTitleCounts,
    comparePointsSystems,
    executeAskQuery,
    inferRacePointsMultiplier,
    nameMatchScore,
    raceMetadata,
    resolveNamedSubject,
    resolvePointsSystem,
    ruleSummary
};
