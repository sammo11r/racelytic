const POINT_SYSTEMS = require('../frontend/js/f1-points-systems');
const { countRoundDetails, pointsFor, scoreResult, simulateConstructors, simulateDrivers } = require('./championship-simulator');
const { editDistance } = require('./search-results');
const f1Records = require('./f1-records');
const { isJuniorSeries, minimumSeasonYear, normaliseSeries, seriesPrefix } = require('./series-config');
const { all: SERIES } = require('../frontend/js/series-config');
const { resourcePath } = require('./resource-routes');

const cache = new Map();
const recordCacheByConnection = new WeakMap();
const sharedRecordCache = new Map();
const CACHE_MS = 5 * 60 * 1000;

const NATIONALITIES = Object.freeze({
    british: ['united-kingdom', 'GB'], dutch: ['netherlands', 'NL'], german: ['germany', 'DE'], french: ['france', 'FR'],
    italian: ['italy', 'IT'], spanish: ['spain', 'ES'], brazilian: ['brazil', 'BR'], australian: ['australia', 'AU'],
    american: ['united-states-of-america', 'US'], argentine: ['argentina', 'AR'], austrian: ['austria', 'AT'],
    belgian: ['belgium', 'BE'], canadian: ['canada', 'CA'], finnish: ['finland', 'FI'], japanese: ['japan', 'JP'],
    mexican: ['mexico', 'MX'], monegasque: ['monaco', 'MC'], 'new zealand': ['new-zealand', 'NZ'],
    'new zealander': ['new-zealand', 'NZ'], 'south african': ['south-africa', 'ZA'], swedish: ['sweden', 'SE'],
    swiss: ['switzerland', 'CH'], thai: ['thailand', 'TH'], chinese: ['china', 'CN'], indian: ['india', 'IN'],
    indonesian: ['indonesia', 'ID'], danish: ['denmark', 'DK'], norwegian: ['norway', 'NO'], irish: ['ireland', 'IE'], polish: ['poland', 'PL'],
    portuguese: ['portugal', 'PT'], colombian: ['colombia', 'CO'], russian: ['russia', 'RU'], venezuelan: ['venezuela', 'VE'],
    chilean: ['chile', 'CL'], czech: ['czech-republic', 'CZ'], hungarian: ['hungary', 'HU'], romanian: ['romania', 'RO']
});

const VENUE_COUNTRY_ALIASES = Object.freeze({
    england: ['united-kingdom', 'united kingdom', 'great britain', 'britain', 'england'],
    britain: ['united-kingdom', 'united kingdom', 'great britain', 'britain', 'england'],
    'great britain': ['united-kingdom', 'united kingdom', 'great britain', 'britain', 'england'],
    uk: ['united-kingdom', 'united kingdom', 'great britain', 'britain', 'england'],
    usa: ['united-states-of-america', 'united states of america', 'united states', 'usa'],
    america: ['united-states-of-america', 'united states of america', 'united states', 'usa']
});

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

function nationalityOptions() {
    return Object.keys(NATIONALITIES).map(name => name.replace(/\b\w/g, letter => letter.toUpperCase())).sort();
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

function recordValueLabel(category, value) {
    const labels = {
        wins: value === 1 ? 'race win' : 'race wins',
        podiums: value === 1 ? 'podium' : 'podiums',
        poles: value === 1 ? 'pole position' : 'pole positions',
        fastestLaps: value === 1 ? 'fastest lap' : 'fastest laps',
        starts: value === 1 ? 'race start' : 'race starts',
        points: 'points',
        gridGain: 'average positions gained',
        averageFinish: 'average finishing position',
        finishRate: 'finish rate',
        winRate: 'win rate',
        podiumRate: 'podium rate',
        dnfs: value === 1 ? 'DNF' : 'DNFs',
        championships: value === 1 ? 'championship' : 'championships'
    };
    return labels[category] || category;
}

function ordinal(value) {
    const number = Number(value);
    if (!Number.isInteger(number) || number < 1) return String(value || '—');
    const remainder = number % 100;
    const suffix = remainder >= 11 && remainder <= 13 ? 'th'
        : number % 10 === 1 ? 'st' : number % 10 === 2 ? 'nd' : number % 10 === 3 ? 'rd' : 'th';
    return `${number}${suffix}`;
}

function joinedNames(entries) {
    const names = entries.map(entry => entry.name);
    if (names.length < 2) return names[0] || 'No one';
    if (names.length === 2) return `${names[0]} and ${names[1]}`;
    return `${names.slice(0, -1).join(', ')}, and ${names.at(-1)}`;
}

function seriesDetails(value) {
    const key = normaliseSeries(value);
    return SERIES[key];
}

function entityHref(series, entity, id) {
    const config = seriesDetails(series);
    const slug = entity === 'constructors' && config.entity === 'team' ? 'team' : entity === 'constructors' ? 'constructor' : 'driver';
    return resourcePath(config.key, slug, id);
}

function recordRangeLabel(interpretation) {
    if (interpretation.fromYear && interpretation.fromYear === interpretation.toYear) return ` in ${interpretation.fromYear}`;
    return interpretation.fromYear || interpretation.toYear
        ? ` from ${interpretation.fromYear || minimumSeasonYear(interpretation.series)} to ${interpretation.toYear || 'the latest completed race'}`
        : '';
}

function raceFormatLabel(format, series) {
    if (format === 'all') return 'All race formats';
    if (format === 'S') return series === 'academy' ? 'Reverse-grid races only' : 'Sprint races only';
    if (series === 'f1') return 'Grands Prix only';
    return series === 'academy' ? 'Standard races only' : 'Feature races only';
}

function recordAssumptions(constructor, series, scope = {}) {
    const config = seriesDetails(series);
    return [
        scope.category === 'championships'
            ? 'Only seasons marked as championship wins in the archive count.'
            : `${raceFormatLabel(scope.raceFormat || (isJuniorSeries(config.key) ? 'all' : 'F'), config.key)} are included.`,
        'Disqualified and non-starting entries do not count as classified starts, wins or podiums.',
        ...(['gridGain', 'averageFinish', 'finishRate', 'winRate', 'podiumRate'].includes(scope.category)
            ? [`A minimum of ${scope.minStarts || 10} starts is required for this rate or average.`] : []),
        ...(scope.category === 'dnfs'
            ? ['DNFs count recorded retirements or unclassified starts; disqualifications and non-starting entries are excluded.'] : []),
        ...(constructor ? [scope.category === 'championships'
            ? `A title counts when the champion scored points for ${constructor.name} during that title season.`
            : `Only results recorded with ${constructor.name} count toward this answer.`] : []),
        ...(scope.circuit ? [`Only races recorded at ${scope.circuit.name} count.`] : []),
        ...(scope.venueCountry ? [`Only races held at circuits in ${scope.venueCountry.name} count.`] : []),
        ...(scope.nationality ? [`Only ${scope.nationality.name} ${scope.entity === 'constructors' ? 'teams or constructors' : 'drivers'} count.`] : []),
        `Figures reflect the ${config.name} results currently available in the Racelytic archive.`
    ];
}

async function resolveNamedCircuit(connection, name, series) {
    if (!name) return null;
    const prefix = seriesPrefix(series);
    const rows = await connection.query(`SELECT id, name FROM ${prefix}circuits ORDER BY name`);
    const ranked = rows.map(row => ({ id: String(row.id), name: row.name, score: Math.max(nameMatchScore(name, row.name), nameMatchScore(name, row.id)) }))
        .filter(row => row.score > 0).sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
    if (!ranked.length) {
        const error = new Error(`Racelytic could not find a ${seriesDetails(series).name} circuit matching “${name}”.`);
        error.statusCode = 422;
        throw error;
    }
    return ranked[0];
}

async function resolveVenueCountry(connection, name, series) {
    const wanted = normalizedName(name);
    const aliases = VENUE_COUNTRY_ALIASES[wanted] || [wanted];
    const prefix = seriesPrefix(series);
    const rows = isJuniorSeries(series)
        ? await connection.query(`SELECT id AS circuitId, placeName FROM ${prefix}circuits ORDER BY name`)
        : await connection.query(`
            SELECT circuits.id AS circuitId, countries.id AS countryId, countries.name AS countryName
            FROM circuits
            JOIN countries ON countries.id = circuits.countryId
            ORDER BY countries.name, circuits.name
        `);
    const matching = rows.filter(row => {
        const values = isJuniorSeries(series)
            ? [row.placeName]
            : [row.countryId, row.countryName];
        return values.some(value => aliases.some(alias => {
            const available = String(value || '').split(',').map(part => normalizedName(part));
            return available.some(part => part === normalizedName(alias));
        }));
    });
    if (!matching.length) return null;
    return {
        name: name.replace(/\b\w/g, letter => letter.toUpperCase()),
        circuitIds: [...new Set(matching.map(row => String(row.circuitId)))]
    };
}

async function resolveRecordVenue(connection, { circuitName, venueCountryName }, series) {
    if (circuitName && venueCountryName) {
        const error = new Error('Choose either a circuit or a host country so Racelytic does not ignore either scope.');
        error.statusCode = 422;
        throw error;
    }
    const name = circuitName || venueCountryName;
    if (!name) return { circuit: null, venueCountry: null };
    const countryFirst = Boolean(venueCountryName && !circuitName);
    if (countryFirst) {
        const venueCountry = await resolveVenueCountry(connection, name, series);
        if (venueCountry) return { circuit: null, venueCountry };
    }
    try {
        return { circuit: await resolveNamedCircuit(connection, name, series), venueCountry: null };
    } catch (circuitError) {
        if (!countryFirst) {
            const venueCountry = await resolveVenueCountry(connection, name, series);
            if (venueCountry) return { circuit: null, venueCountry };
        }
        const error = new Error(`Racelytic could not resolve “${name}” as a ${seriesDetails(series).name} circuit or host country. The scope was not ignored.`);
        error.statusCode = 422;
        throw error;
    }
}

function resolveNationality(name, series) {
    if (!name) return null;
    const normalized = normalizedName(name);
    const values = NATIONALITIES[normalized];
    if (!values) {
        const error = new Error(`Racelytic does not recognise the nationality “${name}”.`);
        error.statusCode = 422;
        throw error;
    }
    return { id: values[isJuniorSeries(series) ? 1 : 0], name: name.replace(/\b\w/g, letter => letter.toUpperCase()) };
}

async function exploreRecords(connection, records, input) {
    const shareAcrossPool = Number.isInteger(Number(connection?.threadId));
    let cacheForConnection = shareAcrossPool ? sharedRecordCache : recordCacheByConnection.get(connection);
    if (!cacheForConnection) {
        cacheForConnection = new Map();
        recordCacheByConnection.set(connection, cacheForConnection);
    }
    const key = JSON.stringify(input);
    const cached = cacheForConnection.get(key);
    if (cached && cached.savedAt > Date.now() - CACHE_MS) return cached.value;
    const value = await records.explore(connection, input);
    if (shareAcrossPool && cacheForConnection.size >= 500) {
        for (const [cachedKey, entry] of cacheForConnection) {
            if (entry.savedAt <= Date.now() - CACHE_MS) cacheForConnection.delete(cachedKey);
        }
        if (cacheForConnection.size >= 500) cacheForConnection.delete(cacheForConnection.keys().next().value);
    }
    cacheForConnection.set(key, { savedAt: Date.now(), value });
    return value;
}

async function resolveRecordConstructor(connection, interpretation, entity) {
    if (!interpretation.constructorName) return null;
    if (entity !== 'drivers') {
        const error = new Error('A constructor filter can only be applied to driver record questions.');
        error.statusCode = 422;
        throw error;
    }
    return resolveNamedSubject(connection, interpretation.constructorName, 'constructors', interpretation.series);
}

async function calculateRecordLeader(connection, interpretation) {
    const series = normaliseSeries(interpretation.series);
    const seriesConfig = seriesDetails(series);
    const type = interpretation.entity === 'constructors' ? 'constructors' : 'drivers';
    const constructor = await resolveRecordConstructor(connection, interpretation, type);
    const venue = interpretation.recordCategory === 'championships'
        ? { circuit: null, venueCountry: null }
        : await resolveRecordVenue(connection, interpretation, series);
    const { circuit, venueCountry } = venue;
    const nationality = resolveNationality(interpretation.nationalityName, series);
    const records = isJuniorSeries(series) ? require('./junior-records') : f1Records;
    const resultLimit = Math.max(1, Math.min(50, Number(interpretation.resultLimit) || 10));
    const fullRecord = await exploreRecords(connection, records, {
        series,
        type,
        constructorId: constructor?.id,
        circuitId: circuit?.id,
        circuitIds: venueCountry?.circuitIds,
        nationality: nationality?.id,
        raceFormat: interpretation.raceFormat || undefined,
        category: interpretation.recordCategory,
        minStarts: interpretation.minStarts,
        fromYear: interpretation.fromYear,
        toYear: interpretation.toYear,
        limit: 1000
    });
    const leadingValue = Number(fullRecord.entries[0]?.value || 0);
    const leaders = fullRecord.entries.filter(entry => Number(entry.value) === leadingValue);
    const range = recordRangeLabel(interpretation);
    const teamScope = constructor ? ` with ${constructor.name}` : '';
    const circuitScope = circuit ? ` at ${circuit.name}` : venueCountry ? ` in ${venueCountry.name}` : '';
    const nationalityScope = nationality ? ` among ${nationality.name} ${type === 'constructors' ? 'teams' : 'drivers'}` : '';
    const leaderNames = leaders.length > 3
        ? `${leaders.length} ${type === 'constructors' ? (seriesConfig.entity === 'team' ? 'teams' : 'constructors') : 'drivers'}`
        : joinedNames(leaders);
    const verb = leaders.length === 1 ? 'has' : 'are tied with';
    const singleSeasonTitle = fullRecord.category === 'championships' && interpretation.fromYear && interpretation.fromYear === interpretation.toYear && leaders.length === 1;
    const answer = singleSeasonTitle
        ? `${leaders[0].name} won the ${interpretation.fromYear} ${seriesConfig.name} ${type === 'constructors' ? (seriesConfig.entity === 'team' ? 'Teams’' : 'Constructors’') : 'Drivers’'} Championship.`
        : leaders.length
        ? `${leaderNames} ${verb} the ${fullRecord.lowerIsBetter ? 'best' : ['finishRate', 'winRate', 'podiumRate', 'gridGain'].includes(fullRecord.category) ? 'highest' : 'most'} ${seriesConfig.name} ${recordValueLabel(fullRecord.category, leadingValue)}${teamScope}${circuitScope}${nationalityScope}${range}: ${leadingValue}${fullRecord.unit || ''}.`
        : `No ${type === 'constructors' ? (seriesConfig.entity === 'team' ? 'teams' : 'constructors') : 'drivers'} have recorded any ${seriesConfig.name} ${recordValueLabel(fullRecord.category, 0)}${teamScope}${circuitScope}${nationalityScope}${range}.`;
    const record = { ...fullRecord, entries: fullRecord.entries.slice(0, resultLimit) };
    const scope = { category: record.category, raceFormat: record.configuration.raceFormat, minStarts: record.configuration.minStarts, circuit, venueCountry, nationality, entity: type };
    return {
        intent: 'record_leader',
        entity: type,
        entityLabel: type === 'constructors' ? (seriesConfig.entity === 'team' ? 'Teams' : 'Constructors') : 'Drivers',
        constructorFilter: constructor ? { id: constructor.id, name: constructor.name, href: entityHref(series, 'constructors', constructor.id) } : null,
        scope,
        answer,
        record,
        methodology: {
            source: `Official ${seriesConfig.name} archive records.`,
            coverage: record.coverage?.fromYear ? `${record.coverage.fromYear}–${record.coverage.toYear}` : 'Recorded archive',
            sample: `${record.total} ranked ${type}.`
        },
        assumptions: recordAssumptions(constructor, series, scope)
    };
}

async function calculateRecordSubjectTotal(connection, interpretation) {
    const series = normaliseSeries(interpretation.series);
    const seriesConfig = seriesDetails(series);
    const subject = await resolveNamedSubject(connection, interpretation.subjectName, interpretation.entity, series);
    const constructor = await resolveRecordConstructor(connection, interpretation, subject.entity);
    const venue = interpretation.recordCategory === 'championships'
        ? { circuit: null, venueCountry: null }
        : await resolveRecordVenue(connection, interpretation, series);
    const { circuit, venueCountry } = venue;
    const nationality = resolveNationality(interpretation.nationalityName, series);
    const records = isJuniorSeries(series) ? require('./junior-records') : f1Records;
    const record = await exploreRecords(connection, records, {
        series,
        type: subject.entity,
        entityId: subject.id,
        constructorId: constructor?.id,
        circuitId: circuit?.id,
        circuitIds: venueCountry?.circuitIds,
        nationality: nationality?.id,
        raceFormat: interpretation.raceFormat || undefined,
        category: interpretation.recordCategory,
        minStarts: interpretation.minStarts,
        fromYear: interpretation.fromYear,
        toYear: interpretation.toYear,
        limit: 1
    });
    const entry = record.entries[0] || null;
    const value = Number(entry?.value || 0);
    const range = recordRangeLabel(interpretation);
    const teamScope = constructor ? ` with ${constructor.name}` : '';
    const circuitScope = circuit ? ` at ${circuit.name}` : venueCountry ? ` in ${venueCountry.name}` : '';
    const nationalityScope = nationality ? ` among ${nationality.name} ${subject.entity === 'constructors' ? 'teams' : 'drivers'}` : '';
    const scope = { category: record.category, raceFormat: record.configuration.raceFormat, minStarts: record.configuration.minStarts, circuit, venueCountry, nationality, entity: subject.entity };
    return {
        intent: 'record_subject_total',
        entity: subject.entity,
        entityLabel: subject.entity === 'constructors' ? (seriesConfig.entity === 'team' ? 'Teams' : 'Constructors') : 'Drivers',
        answer: `${subject.name} has ${value}${record.unit || ''} ${seriesConfig.name} ${recordValueLabel(record.category, value)}${teamScope}${circuitScope}${nationalityScope}${range}.`,
        constructorFilter: constructor ? { id: constructor.id, name: constructor.name, href: entityHref(series, 'constructors', constructor.id) } : null,
        scope,
        subject: {
            id: subject.id,
            name: subject.name,
            value,
            href: entityHref(series, subject.entity, subject.id)
        },
        record,
        methodology: {
            source: `Official ${seriesConfig.name} archive records.`,
            coverage: record.coverage?.fromYear ? `${record.coverage.fromYear}–${record.coverage.toYear}` : 'Recorded archive',
            sample: `Matching results for ${subject.name}.`
        },
        assumptions: recordAssumptions(constructor, series, scope)
    };
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

const NAME_ALIASES = Object.freeze({
    schumi: 'michael schumacher',
    checo: 'sergio perez',
    nando: 'fernando alonso',
    rbr: 'red bull',
    merc: 'mercedes'
});

function nameMatchScore(query, candidate) {
    const input = normalizedName(query);
    const wanted = NAME_ALIASES[input] || input;
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

async function resolveNamedSubject(connection, subjectName, entityHint, series = 'f1') {
    const prefix = seriesPrefix(normaliseSeries(series));
    const entityQueries = entityHint === 'drivers' || entityHint === 'constructors'
        ? [entityHint]
        : ['drivers', 'constructors'];
    const groups = await Promise.all(entityQueries.map(async entity => {
        const rows = await connection.query(entity === 'constructors'
            ? `SELECT id, name FROM ${prefix}constructors ORDER BY name`
            : `SELECT id, name FROM ${prefix}drivers ORDER BY name`);
        return rows.map(row => ({ id: String(row.id), name: row.name, entity }));
    }));
    const candidates = groups.flat();
    const matches = candidates.map(entry => ({
        ...entry,
        score: Math.max(nameMatchScore(subjectName, entry.name), nameMatchScore(subjectName, entry.id))
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
        href: resourcePath('f1', entity === 'constructors' ? 'constructor' : 'driver', entry.id)
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
        href: resourcePath('f1', subject.entity === 'constructors' ? 'constructor' : 'driver', subject.id)
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

function askHttpError(message, statusCode = 422) {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
}

async function resolveNamedRace(connection, eventName, year, series = 'f1') {
    const selectedSeries = normaliseSeries(series);
    const prefix = seriesPrefix(selectedSeries);
    const rows = isJuniorSeries(selectedSeries)
        ? await connection.query(`
            SELECT races.id, races.year, races.round, races.name,
                   circuits.name AS circuitName
            FROM ${prefix}races races
            LEFT JOIN ${prefix}circuits circuits ON circuits.id = races.circuitId
            WHERE races.year = ?
            ORDER BY races.round
        `, [year])
        : await connection.query(`
            SELECT races.id, races.year, races.round,
                   COALESCE(NULLIF(grands_prix.fullName, ''), races.officialName) AS name,
                   COALESCE(NULLIF(circuits.fullName, ''), circuits.name) AS circuitName
            FROM races
            LEFT JOIN grands_prix ON grands_prix.id = races.grandPrixId
            LEFT JOIN circuits ON circuits.id = races.circuitId
            WHERE races.year = ?
            ORDER BY races.round
        `, [year]);
    const ranked = rows.map(row => ({
        ...row,
        id: String(row.id),
        score: Math.max(nameMatchScore(eventName, row.name), nameMatchScore(eventName, row.circuitName))
    })).filter(row => row.score > 0)
        .sort((first, second) => second.score - first.score || Number(first.round) - Number(second.round));
    if (!ranked.length) {
        throw askHttpError(`Racelytic could not find a ${seriesDetails(selectedSeries).name} race matching “${eventName}” in ${year}.`);
    }
    return ranked[0];
}

function classificationEntry(row, entity = 'drivers', series = 'f1') {
    const id = String(entity === 'constructors' ? row.constructorId : row.driverId);
    const name = entity === 'constructors' ? row.constructorName : row.driverName;
    return {
        id,
        name,
        position: row.positionNumber === null ? null : Number(row.positionNumber),
        positionText: row.positionText || (row.positionNumber === null ? '—' : String(row.positionNumber)),
        points: row.points === null ? null : Number(row.points || 0),
        constructorId: row.constructorId ? String(row.constructorId) : null,
        constructorName: row.constructorName || null,
        status: row.status || row.reasonRetired || null,
        sessionName: row.sessionName || null,
        href: entityHref(series, entity, id)
    };
}

async function calculateRaceResult(connection, interpretation) {
    const series = normaliseSeries(interpretation.series);
    const race = await resolveNamedRace(connection, interpretation.eventName, interpretation.targetSeason, series);
    const prefix = seriesPrefix(series);
    let rows;
    if (isJuniorSeries(series)) {
        rows = await connection.query(`
            SELECT results.positionNumber, results.positionDisplayOrder, results.points,
                   results.status, results.driverId, results.constructorId,
                   drivers.name AS driverName, constructors.name AS constructorName,
                   sessions.id AS sessionId, sessions.name AS sessionName,
                   sessions.sessionNumber
            FROM ${prefix}session_results results
            JOIN ${prefix}sessions sessions ON sessions.id = results.sessionId
            JOIN ${prefix}drivers drivers ON drivers.id = results.driverId
            LEFT JOIN ${prefix}constructors constructors ON constructors.id = results.constructorId
            WHERE results.raceId = ?
              AND LOWER(CAST(sessions.isRace AS CHAR)) IN ('1', 'true')
              AND LOWER(COALESCE(CAST(sessions.cancelled AS CHAR), 'false')) NOT IN ('1', 'true')
            ORDER BY sessions.sessionNumber, results.positionDisplayOrder, results.positionNumber
        `, [race.id]);
    } else {
        rows = await connection.query(`
            SELECT results.positionNumber, results.positionText, results.positionDisplayOrder,
                   results.points, results.reasonRetired, results.driverId, results.constructorId,
                   drivers.name AS driverName, constructors.name AS constructorName,
                   'Grand Prix' AS sessionName
            FROM races_race_results results
            JOIN drivers ON drivers.id = results.driverId
            LEFT JOIN constructors ON constructors.id = results.constructorId
            WHERE results.raceId = ?
            ORDER BY results.positionDisplayOrder, results.positionNumber
        `, [race.id]);
    }
    if (!rows.length) throw askHttpError(`${race.name} does not have a recorded race classification yet.`);

    const sessions = new Map();
    rows.forEach(row => {
        const key = String(row.sessionId || row.sessionName || 'race');
        if (!sessions.has(key)) sessions.set(key, { name: row.sessionName || 'Race', sessionNumber: Number(row.sessionNumber || 0), entries: [] });
        sessions.get(key).entries.push(classificationEntry(row, 'drivers', series));
    });
    const subject = interpretation.subjectName
        ? await resolveNamedSubject(connection, interpretation.subjectName, 'drivers', series)
        : null;
    const view = interpretation.resultView || 'winner';
    const limit = view === 'classification' ? 50 : view === 'podium' ? 3 : 1;
    const sessionGroups = [...sessions.values()].sort((first, second) => first.sessionNumber - second.sessionNumber);
    const nameCounts = new Map();
    sessionGroups.forEach(session => nameCounts.set(session.name, Number(nameCounts.get(session.name) || 0) + 1));
    const nameIndexes = new Map();
    const classifications = sessionGroups.map(session => {
        const index = Number(nameIndexes.get(session.name) || 0) + 1;
        nameIndexes.set(session.name, index);
        return {
            name: nameCounts.get(session.name) > 1 ? `${session.name} ${index}` : session.name,
            entries: subject ? session.entries.filter(entry => entry.id === subject.id) : session.entries.slice(0, limit)
        };
    });
    const selected = classifications.flatMap(session => session.entries.map(entry => ({ ...entry, sessionName: session.name })));
    if (subject && !selected.length) throw askHttpError(`${subject.name} does not have a recorded result at ${race.name} in ${race.year}.`);
    const winners = classifications.map(session => ({ name: session.name, winner: session.entries.find(entry => entry.position === 1) })).filter(item => item.winner);
    const answer = subject
        ? classifications.length === 1
            ? `${subject.name} finished ${selected[0].position ? ordinal(selected[0].position) : selected[0].positionText} at ${race.name} in ${race.year}.`
            : selected.map(entry => `${subject.name} finished ${entry.position ? ordinal(entry.position) : entry.positionText} in the ${entry.sessionName}`).join('; ') + ` at ${race.name} in ${race.year}.`
        : view === 'podium' ? `The recorded podium for ${race.name} in ${race.year} is ${selected.map(entry => entry.name).join(', ').replace(/\.+$/, '')}.`
        : winners.length === 1 ? `${winners[0].winner.name} won the ${race.year} ${race.name}.`
        : `${winners.map(item => `${item.winner.name} won the ${item.name}`).join('; ')} at the ${race.year} ${race.name}.`;
    return {
        intent: 'race_result',
        answer,
        entity: 'drivers',
        entityLabel: 'Drivers',
        race: { id: race.id, name: race.name, circuitName: race.circuitName, year: Number(race.year), round: Number(race.round), href: resourcePath(series, 'race', race.id, race.name) },
        resultView: view,
        classifications,
        methodology: {
            source: 'Official race classification stored in the Racelytic archive.',
            coverage: `${race.year} ${race.name}`,
            sample: `${rows.length} recorded entries across ${classifications.length} race session${classifications.length === 1 ? '' : 's'}.`,
            href: resourcePath(series, 'race', race.id, race.name)
        },
        assumptions: [`Results reflect the official ${seriesDetails(series).name} classification stored in the Racelytic archive.`]
    };
}

function rankAggregatedStandings(rows, entity, series) {
    const totals = new Map();
    rows.forEach(row => {
        const id = String(entity === 'constructors' ? row.constructorId : row.driverId);
        if (!id || id === 'null' || id === 'undefined') return;
        const name = entity === 'constructors' ? row.constructorName : row.driverName;
        const current = totals.get(id) || { id, name, points: 0, wins: 0, countback: {} };
        current.points += Number(row.points || 0);
        const position = Number(row.positionNumber);
        if (position > 0 && !isTrue(row.sprint)) {
            current.countback[position] = Number(current.countback[position] || 0) + 1;
            if (position === 1) current.wins += 1;
        }
        totals.set(id, current);
    });
    return [...totals.values()]
        .sort((first, second) => {
            if (second.points !== first.points) return second.points - first.points;
            const positions = new Set([...Object.keys(first.countback), ...Object.keys(second.countback)].map(Number));
            for (const position of [...positions].sort((a, b) => a - b)) {
                const difference = Number(second.countback[position] || 0) - Number(first.countback[position] || 0);
                if (difference) return difference;
            }
            return first.name.localeCompare(second.name);
        })
        .map((entry, index) => ({ ...entry, position: index + 1, href: entityHref(series, entity, entry.id) }));
}

async function calculateSeasonStandings(connection, interpretation) {
    const series = normaliseSeries(interpretation.series);
    const prefix = seriesPrefix(series);
    const entity = interpretation.entity === 'constructors' ? 'constructors' : 'drivers';
    const year = Number(interpretation.targetSeason);
    const round = interpretation.standingRound ? Number(interpretation.standingRound) : null;
    let standings;
    if (!round && !isJuniorSeries(series)) {
        const table = entity === 'constructors' ? 'seasons_constructor_standings' : 'seasons_driver_standings';
        const idColumn = entity === 'constructors' ? 'constructorId' : 'driverId';
        const joinTable = entity === 'constructors' ? 'constructors' : 'drivers';
        standings = await connection.query(`
            SELECT standings.${idColumn} AS id, subjects.name, standings.positionNumber AS position,
                   standings.points
            FROM ${table} standings
            JOIN ${joinTable} subjects ON subjects.id = standings.${idColumn}
            WHERE standings.year = ?
            ORDER BY standings.positionDisplayOrder, standings.positionNumber
        `, [year]);
        standings = standings.map(row => ({ ...row, id: String(row.id), position: Number(row.position), points: Number(row.points || 0), href: entityHref(series, entity, row.id) }));
    } else {
        const rows = isJuniorSeries(series)
            ? await connection.query(`
                SELECT results.driverId, drivers.name AS driverName, results.constructorId,
                       constructors.name AS constructorName, results.positionNumber, results.points, 0 AS sprint
                FROM ${prefix}session_results results
                JOIN ${prefix}sessions sessions ON sessions.id = results.sessionId
                JOIN ${prefix}races races ON races.id = results.raceId
                JOIN ${prefix}drivers drivers ON drivers.id = results.driverId
                LEFT JOIN ${prefix}constructors constructors ON constructors.id = results.constructorId
                WHERE races.year = ?
                  AND LOWER(CAST(sessions.isRace AS CHAR)) IN ('1', 'true')
                  AND (? IS NULL OR races.round <= ?)
            `, [year, round, round])
            : await connection.query(`
                SELECT results.driverId, drivers.name AS driverName, results.constructorId,
                       constructors.name AS constructorName, results.positionNumber, results.points, 0 AS sprint
                FROM races_race_results results
                JOIN drivers ON drivers.id = results.driverId
                LEFT JOIN constructors ON constructors.id = results.constructorId
                WHERE results.year = ? AND (? IS NULL OR results.round <= ?)
                UNION ALL
                SELECT results.driverId, drivers.name AS driverName, results.constructorId,
                       constructors.name AS constructorName, results.positionNumber, results.points, 1 AS sprint
                FROM races_sprint_race_results results
                JOIN drivers ON drivers.id = results.driverId
                LEFT JOIN constructors ON constructors.id = results.constructorId
                WHERE results.year = ? AND (? IS NULL OR results.round <= ?)
            `, [year, round, round, year, round, round]);
        standings = rankAggregatedStandings(rows, entity, series);
    }
    if (!standings.length) throw askHttpError(`Racelytic does not have recorded ${seriesDetails(series).name} standings for ${year}${round ? ` after round ${round}` : ''}.`);
    const leader = standings[0];
    return {
        intent: 'season_standings',
        answer: `${leader.name} leads the ${year} ${entity === 'constructors' ? 'constructors’' : 'drivers’'} standings${round ? ` after round ${round}` : ''} with ${leader.points} points.`,
        entity,
        entityLabel: entity === 'constructors' ? 'Constructors' : 'Drivers',
        season: { year, round },
        standings: standings.slice(0, interpretation.resultLimit || 20),
        methodology: {
            source: round ? 'Recorded race points summed through the selected round.' : 'Official final standings stored in the Racelytic archive.',
            coverage: `${year}${round ? ` through round ${round}` : ' final standings'}`,
            sample: `${standings.length} ranked ${entity}.`,
            href: resourcePath(series, 'season', year)
        },
        assumptions: [round ? 'Points are summed through the selected round; equal totals are ordered by wins, then name.' : 'Final standings use the official positions stored in the Racelytic archive.']
    };
}

async function resolveComparisonDriver(connection, name, series, fromYear, toYear) {
    try {
        return await resolveNamedSubject(connection, name, 'drivers', series);
    } catch (error) {
        const candidates = /matches more than one name/i.test(error.message)
            ? (error.suggestions || []).filter(entry => entry.entity === 'drivers')
            : [];
        if (candidates.length < 2) throw error;
        const prefix = seriesPrefix(series);
        const placeholders = candidates.map(() => '?').join(', ');
        const values = [...candidates.map(entry => entry.id), fromYear, toYear];
        const rows = isJuniorSeries(series)
            ? await connection.query(`
                SELECT results.driverId, COUNT(DISTINCT results.sessionId) AS appearances,
                       MAX(races.year) AS lastYear
                FROM ${prefix}session_results results
                JOIN ${prefix}sessions sessions ON sessions.id = results.sessionId
                JOIN ${prefix}races races ON races.id = results.raceId
                WHERE results.driverId IN (${placeholders})
                  AND races.year BETWEEN ? AND ?
                  AND LOWER(CAST(sessions.isRace AS CHAR)) IN ('1', 'true')
                GROUP BY results.driverId
            `, values)
            : await connection.query(`
                SELECT driverId, COUNT(DISTINCT raceId) AS appearances, MAX(year) AS lastYear
                FROM races_race_results
                WHERE driverId IN (${placeholders}) AND year BETWEEN ? AND ?
                GROUP BY driverId
            `, values);
        const participation = new Map(rows.map(row => [String(row.driverId), {
            appearances: Number(row.appearances || 0), lastYear: Number(row.lastYear || 0)
        }]));
        const ranked = candidates.map(candidate => ({
            ...candidate,
            appearances: participation.get(String(candidate.id))?.appearances || 0,
            lastYear: participation.get(String(candidate.id))?.lastYear || 0
        })).sort((first, second) => second.appearances - first.appearances || second.lastYear - first.lastYear);
        if (!ranked[0].appearances || ranked[0].appearances === ranked[1].appearances && ranked[0].lastYear === ranked[1].lastYear) throw error;
        return { ...ranked[0], score: 95 };
    }
}

async function calculateConstructorHeadToHead(connection, interpretation) {
    if (interpretation.pointsSystemYear) {
        throw askHttpError('Applying one historical rulebook is currently supported for driver comparisons, not constructor comparisons.');
    }
    const series = normaliseSeries(interpretation.series);
    const names = interpretation.subjectNames.slice(0, 2);
    const subjects = await Promise.all(names.map((name, index) => resolveNamedSubject(connection, name, 'constructors', series).catch(error => {
        error.suggestionField = 'subjectNames';
        error.suggestionIndex = index;
        error.originalName = name;
        throw error;
    })));
    const [first, second] = subjects;
    if (first.id === second.id) throw askHttpError('Choose two different constructors for a comparison.');
    const supportedMetrics = new Set(['wins', 'podiums', 'poles', 'fastestLaps', 'points', 'starts', 'dnfs', 'gridGain', 'averageFinish', 'finishRate', 'winRate', 'podiumRate']);
    const metric = supportedMetrics.has(interpretation.comparisonMetric) ? interpretation.comparisonMetric : 'wins';
    const totals = await Promise.all(subjects.map(subject => calculateRecordSubjectTotal(connection, {
        series,
        entity: 'constructors',
        subjectName: subject.name,
        recordCategory: metric,
        circuitName: interpretation.circuitName,
        venueCountryName: interpretation.venueCountryName,
        fromYear: interpretation.fromYear,
        toYear: interpretation.toYear,
        minStarts: interpretation.minStarts
    })));
    const scores = totals.map((result, index) => ({
        driver: subjects[index],
        metricValue: Number(result.subject.value || 0),
        metricUnit: result.record.unit || '',
        metricLabel: result.record.label,
        record: result.record
    }));
    const lowerIsBetter = Boolean(totals[0].record.lowerIsBetter);
    const values = scores.map(score => score.metricValue);
    const leader = values[0] === values[1] ? null : lowerIsBetter
        ? values[0] < values[1] ? first : second
        : values[0] > values[1] ? first : second;
    const display = score => `${score.metricValue.toLocaleString('en-US', { maximumFractionDigits: 2 })}${score.metricUnit}`;
    const label = String(totals[0].record.label || metric).toLowerCase();
    const answer = leader
        ? `${leader.name} has ${lowerIsBetter ? 'the better' : 'more'} ${seriesDetails(series).name} ${label}: ${first.name} has ${display(scores[0])}, while ${second.name} has ${display(scores[1])}.`
        : `${first.name} and ${second.name} are tied at ${display(scores[0])} each for ${seriesDetails(series).name} ${label}.`;
    const fromYear = Number(interpretation.fromYear || minimumSeasonYear(series));
    const toYear = Number(interpretation.toYear || 2100);
    return {
        intent: 'constructor_head_to_head',
        answer,
        entity: 'constructors',
        entityLabel: seriesDetails(series).entity === 'team' ? 'Teams' : 'Constructors',
        comparison: {
            drivers: scores, meetings: null, scope: 'career', metric,
            metricLabel: totals[0].record.label, range: { fromYear, toYear },
            filters: { circuit: totals[0].scope?.circuit || null, venueCountry: totals[0].scope?.venueCountry || null }, details: []
        },
        methodology: {
            source: 'Official constructor and team records in the Racelytic archive.',
            coverage: `${fromYear}–${toYear === 2100 ? 'latest' : toYear}`,
            sample: 'Both constructors use the same archive filters.'
        },
        assumptions: [
            ...new Set(totals.flatMap(result => result.assumptions || [])),
            'Raw totals are not normalized for season length, entries per team or era.'
        ]
    };
}

async function calculateDriverRulebookComparison(connection, interpretation, drivers, constructor, venue) {
    const series = normaliseSeries(interpretation.series);
    if (series !== 'f1') throw askHttpError('Historical Formula 1 points systems can only be applied on the Formula 1 Ask page.');
    const resolved = resolvePointsSystem(interpretation.pointsSystemYear);
    if (!resolved) throw askHttpError(`Racelytic does not have an official Formula 1 points system for ${interpretation.pointsSystemYear}.`);
    const fromYear = Number(interpretation.fromYear || 1950);
    const toYear = Number(interpretation.toYear || 2100);
    const [raceRows, sprintRows, calendarRows] = await Promise.all([
        connection.query(`
            SELECT results.raceId, results.year, results.round, races.circuitId,
                   results.driverId, results.constructorId, results.positionNumber, results.positionText,
                   results.points AS officialPoints, results.sharedCar,
                   results.fastestLap, results.polePosition
            FROM races_race_results results
            JOIN races ON races.id = results.raceId
            WHERE results.year BETWEEN ? AND ?
            ORDER BY results.year, results.round, results.positionDisplayOrder
        `, [fromYear, toYear]),
        resolved.system.sprint?.length ? connection.query(`
            SELECT results.raceId, results.year, results.round, races.circuitId,
                   results.driverId, results.constructorId, results.positionNumber, results.positionText,
                   results.points AS officialPoints
            FROM races_sprint_race_results results
            JOIN races ON races.id = results.raceId
            WHERE results.year BETWEEN ? AND ?
            ORDER BY results.year, results.round, results.positionDisplayOrder
        `, [fromYear, toYear]) : Promise.resolve([]),
        connection.query(`
            SELECT year, round
            FROM races
            WHERE year BETWEEN ? AND ?
            ORDER BY year, round
        `, [fromYear, toYear])
    ]);
    const ids = new Set(drivers.map(driver => String(driver.id)));
    const venueIds = venue.venueCountry ? new Set(venue.venueCountry.circuitIds.map(String)) : null;
    const included = row => ids.has(String(row.driverId))
        && (!constructor || String(row.constructorId) === String(constructor.id))
        && (!venue.circuit || String(row.circuitId) === String(venue.circuit.id))
        && (!venueIds || venueIds.has(String(row.circuitId)));
    let selectedRaces = raceRows.filter(included);
    let selectedSprints = sprintRows.filter(included);
    if (interpretation.comparisonScope === 'shared') {
        const sharedRounds = new Set();
        const participants = new Map();
        selectedRaces.forEach(row => {
            const key = `${row.year}:${row.round}`;
            if (!participants.has(key)) participants.set(key, new Set());
            participants.get(key).add(String(row.driverId));
        });
        participants.forEach((present, key) => { if (drivers.every(driver => present.has(String(driver.id)))) sharedRounds.add(key); });
        selectedRaces = selectedRaces.filter(row => sharedRounds.has(`${row.year}:${row.round}`));
        selectedSprints = selectedSprints.filter(row => sharedRounds.has(`${row.year}:${row.round}`));
    }
    const metadata = raceMetadata(raceRows);
    const finalRounds = new Map();
    const calendarRounds = new Map();
    calendarRows.forEach(row => {
        const year = Number(row.year);
        finalRounds.set(year, Math.max(Number(finalRounds.get(year) || 0), Number(row.round)));
        if (!calendarRounds.has(year)) calendarRounds.set(year, new Set());
        calendarRounds.get(year).add(Number(row.round));
    });
    const byDriver = new Map(drivers.map(driver => [String(driver.id), new Map()]));
    const ensureRound = row => {
        const seasons = byDriver.get(String(row.driverId));
        if (!seasons.has(Number(row.year))) seasons.set(Number(row.year), new Map());
        const rounds = seasons.get(Number(row.year));
        if (!rounds.has(Number(row.round))) rounds.set(Number(row.round), {
            round: Number(row.round), position: null, fastestLap: false, polePosition: false,
            positionShare: 1, fastestLapShare: 1, racePointsMultiplier: 1, sprintResults: [], officialPoints: 0,
            started: false
        });
        return rounds.get(Number(row.round));
    };
    const excludedClassification = row => /^(?:DNS|DNQ|DNPQ|WD|DSQ|DISQ|DQ|EXC|EXCLUDED)$/i
        .test(String(row.positionText || '').trim());
    const classifiedPosition = row => {
        const position = Number(row.positionNumber);
        return position > 0 && !excludedClassification(row) ? position : null;
    };
    selectedRaces.forEach(row => {
        const round = ensureRound(row);
        const raceMeta = metadata.get(`${Number(row.year)}:${Number(row.round)}`);
        const position = classifiedPosition(row);
        round.position = position;
        round.started = round.started || !/^(?:DNS|DNQ|DNPQ|WD)$/i.test(String(row.positionText || '').trim());
        round.fastestLap = position ? row.fastestLap : false;
        round.polePosition = position ? row.polePosition : false;
        round.positionShare = position ? raceMeta?.positionShare(position) || 1 : 1;
        round.fastestLapShare = raceMeta?.fastestLapShare || 1;
        round.racePointsMultiplier = raceMeta?.racePointsMultiplier || 1;
        round.officialPoints += Number(row.officialPoints || 0);
    });
    selectedSprints.forEach(row => {
        const round = ensureRound(row);
        round.sprintResults.push({ position: classifiedPosition(row) });
        round.officialPoints += Number(row.officialPoints || 0);
    });
    const scores = drivers.map(driver => {
        const seasons = byDriver.get(String(driver.id));
        let points = 0, earnedPoints = 0, droppedPoints = 0, officialPoints = 0, starts = 0;
        const seasonDetails = [];
        for (const [year, roundsMap] of [...seasons.entries()].sort((a, b) => a[0] - b[0])) {
            const rounds = [...(calendarRounds.get(year) || new Set(roundsMap.keys()))].sort((a, b) => a - b).map(roundNumber => {
                const round = roundsMap.get(roundNumber);
                return round ? {
                    ...round,
                    ...scoreResult(round, resolved.system, { isFinalRound: round.round === finalRounds.get(year) })
                } : { round: roundNumber, officialPoints: 0, started: false, ...scoreResult(null, resolved.system) };
            });
            const counted = countRoundDetails(rounds, resolved.system);
            points += counted.points;
            earnedPoints += counted.earnedPoints;
            droppedPoints += counted.droppedPoints;
            officialPoints += rounds.reduce((sum, round) => sum + round.officialPoints, 0);
            starts += rounds.filter(round => round.started).length;
            seasonDetails.push({ year, points: counted.points, droppedPoints: counted.droppedPoints });
        }
        return {
            driver,
            metricValue: Math.round(points * 100) / 100,
            metricUnit: '',
            metricLabel: `${resolved.system.name} points`,
            officialPoints: Math.round(officialPoints * 100) / 100,
            earnedPoints: Math.round(earnedPoints * 100) / 100,
            droppedPoints: Math.round(droppedPoints * 100) / 100,
            starts,
            seasons: seasonDetails
        };
    });
    if (!scores.some(score => score.starts)) throw askHttpError(`${drivers[0].name} and ${drivers[1].name} have no matching recorded starts in that scope.`);
    const leader = scores[0].metricValue === scores[1].metricValue ? null
        : scores[0].metricValue > scores[1].metricValue ? drivers[0] : drivers[1];
    const answer = leader
        ? `${leader.name} scores more points when both careers are recalculated under the ${resolved.system.name} system: ${drivers[0].name} has ${scores[0].metricValue}, while ${drivers[1].name} has ${scores[1].metricValue}.`
        : `${drivers[0].name} and ${drivers[1].name} are tied on ${scores[0].metricValue} points under the ${resolved.system.name} system.`;
    const venueLabel = venue.circuit ? ` at ${venue.circuit.name}` : venue.venueCountry ? ` in ${venue.venueCountry.name}` : '';
    const coveredYears = scores.flatMap(score => score.seasons.map(season => season.year));
    const coverageFrom = coveredYears.length ? Math.min(...coveredYears) : fromYear;
    const coverageTo = coveredYears.length ? Math.max(...coveredYears) : toYear;
    return {
        intent: 'driver_head_to_head',
        answer,
        entity: 'drivers',
        entityLabel: 'Drivers',
        pointsSystem: { id: resolved.key, name: resolved.system.name, rules: ruleSummary(resolved.system) },
        comparison: {
            drivers: scores, meetings: null, scope: interpretation.comparisonScope || 'career', metric: 'points',
            metricLabel: `${resolved.system.name} points`, range: { fromYear, toYear },
            filters: { constructor, circuit: venue.circuit, venueCountry: venue.venueCountry }, details: []
        },
        methodology: {
            source: 'Official race and sprint classifications recalculated with one complete historical rulebook.',
            coverage: `${coverageFrom}–${coverageTo}${venueLabel}`,
            sample: `${scores.map(score => `${score.driver.name}: ${score.starts} race starts`).join('; ')}.`
        },
        assumptions: [
            `The complete ${resolved.system.name} rule set is applied separately within each season.`,
            'Race and sprint classifications are rescored; officially awarded bonus or penalty points outside those classifications are not carried over.',
            'Shared-car points, tied fastest-lap bonuses, reduced-points races and dropped-score rules follow the historical simulator methodology.',
            'Career totals are not normalized for different career lengths unless a shared-race or season scope is selected.'
        ]
    };
}

async function calculateStreakLeader(connection, interpretation) {
    const series = normaliseSeries(interpretation.series);
    const prefix = seriesPrefix(series);
    const fromYear = Number(interpretation.fromYear || minimumSeasonYear(series));
    const toYear = Number(interpretation.toYear || 2100);
    const category = ['wins', 'podiums', 'points', 'finishes'].includes(interpretation.streakCategory)
        ? interpretation.streakCategory : 'wins';
    const rows = isJuniorSeries(series)
        ? await connection.query(`
            SELECT results.driverId, drivers.name AS driverName, results.raceId, results.sessionId,
                   races.year, races.round, races.name AS raceName, sessions.name AS sessionName,
                   sessions.sessionNumber, results.positionNumber, results.points, results.status
            FROM ${prefix}session_results results
            JOIN ${prefix}sessions sessions ON sessions.id = results.sessionId
            JOIN ${prefix}races races ON races.id = results.raceId
            JOIN ${prefix}drivers drivers ON drivers.id = results.driverId
            WHERE races.year BETWEEN ? AND ?
              AND LOWER(CAST(sessions.isRace AS CHAR)) IN ('1', 'true')
              AND LOWER(COALESCE(CAST(sessions.cancelled AS CHAR), 'false')) NOT IN ('1', 'true')
            ORDER BY races.year, races.round, sessions.sessionNumber, results.positionNumber
        `, [fromYear, toYear])
        : await connection.query(`
            SELECT results.driverId, drivers.name AS driverName, results.raceId, results.year,
                   results.round, COALESCE(NULLIF(grands_prix.fullName, ''), races.officialName) AS raceName,
                   'Grand Prix' AS sessionName, results.positionNumber, results.positionText,
                   results.points, results.reasonRetired AS status
            FROM races_race_results results
            JOIN drivers ON drivers.id = results.driverId
            JOIN races ON races.id = results.raceId
            LEFT JOIN grands_prix ON grands_prix.id = races.grandPrixId
            WHERE results.year BETWEEN ? AND ?
            ORDER BY results.year, results.round, results.positionNumber
        `, [fromYear, toYear]);
    const deduped = new Map();
    rows.forEach(row => {
        const key = `${row.driverId}:${row.sessionId || row.raceId}`;
        const current = deduped.get(key);
        if (!current || Number(row.positionNumber || Infinity) < Number(current.positionNumber || Infinity)) deduped.set(key, row);
    });
    const byDriver = new Map();
    [...deduped.values()].forEach(row => {
        const id = String(row.driverId);
        if (!byDriver.has(id)) byDriver.set(id, []);
        byDriver.get(id).push(row);
    });
    const qualifies = row => {
        const position = Number(row.positionNumber);
        if (category === 'wins') return position === 1;
        if (category === 'podiums') return position > 0 && position <= 3;
        if (category === 'points') return Number(row.points || 0) > 0;
        return position > 0 && !/^(?:DNS|DNQ|DNPQ|WD|DSQ|DISQ|DQ|EXC|EXCLUDED)$/i.test(String(row.status || row.positionText || ''));
    };
    const ranking = [...byDriver.entries()].map(([id, driverRows]) => {
        let best = { length: 0, start: null, end: null };
        let current = { length: 0, start: null, end: null };
        driverRows.forEach(row => {
            if (qualifies(row)) {
                if (!current.length) current.start = row;
                current.length += 1;
                current.end = row;
                if (current.length > best.length) best = { ...current };
            } else current = { length: 0, start: null, end: null };
        });
        const name = driverRows[0]?.driverName || id;
        const event = row => row ? { year: Number(row.year), round: Number(row.round), name: row.raceName, sessionName: row.sessionName } : null;
        return { id, name, value: best.length, start: event(best.start), end: event(best.end), href: entityHref(series, 'drivers', id) };
    }).filter(entry => entry.value > 0)
        .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name))
        .map((entry, index) => ({ ...entry, rank: index + 1 }));
    if (!ranking.length) throw askHttpError(`No matching ${seriesDetails(series).name} streaks are recorded in that range.`);
    const labels = { wins: 'winning', podiums: 'podium', points: 'points-scoring', finishes: 'classified-finish' };
    const leader = ranking[0];
    return {
        intent: 'streak_leader',
        answer: `${leader.name} has the longest ${seriesDetails(series).name} ${labels[category]} streak in the selected range at ${leader.value} consecutive starts.`,
        entity: 'drivers', entityLabel: 'Drivers',
        streak: { category, label: `${labels[category][0].toUpperCase()}${labels[category].slice(1)} streak`, total: ranking.length, ranking: ranking.slice(0, interpretation.resultLimit || 10) },
        methodology: {
            source: 'Official race classifications in the Racelytic archive.',
            coverage: `${fromYear}–${toYear === 2100 ? 'latest' : toYear}`,
            sample: `${deduped.size} recorded driver starts.`
        },
        assumptions: ['Streaks follow each driver’s consecutive recorded starts; a race the driver did not enter does not break the streak.', 'Shared-car duplicate classifications are reduced to the driver’s best result in that race.']
    };
}

async function calculateDriverHeadToHead(connection, interpretation) {
    const series = normaliseSeries(interpretation.series);
    const prefix = seriesPrefix(series);
    const fromYear = Number(interpretation.fromYear || minimumSeasonYear(series));
    const toYear = Number(interpretation.toYear || 2100);
    let first;
    let second;
    try {
        [first, second] = await Promise.all(interpretation.subjectNames.slice(0, 2)
            .map((name, index) => resolveComparisonDriver(connection, name, series, fromYear, toYear).catch(error => {
            error.suggestionField = 'subjectNames';
            error.suggestionIndex = index;
            error.originalName = name;
            throw error;
            })));
    } catch (driverError) {
        try {
            return await calculateConstructorHeadToHead(connection, { ...interpretation, intent: 'constructor_head_to_head' });
        } catch {
            throw driverError;
        }
    }
    if (first.id === second.id) throw askHttpError('Choose two different drivers for a head-to-head comparison.');
    const [constructor, venue] = await Promise.all([
        interpretation.constructorName ? resolveNamedSubject(connection, interpretation.constructorName, 'constructors', series) : null,
        resolveRecordVenue(connection, interpretation, series)
    ]);
    const { circuit, venueCountry } = venue;
    if (interpretation.pointsSystemYear) {
        return calculateDriverRulebookComparison(connection, interpretation, [first, second], constructor, venue);
    }
    const metric = interpretation.comparisonMetric || 'both';
    const scope = interpretation.comparisonScope || 'shared';
    const careerMetrics = new Set(['wins', 'podiums', 'poles', 'fastestLaps', 'points', 'starts', 'dnfs', 'gridGain', 'averageFinish', 'finishRate', 'winRate', 'podiumRate']);
    if (scope === 'career' && careerMetrics.has(metric)) {
        const totals = await Promise.all([first, second].map(driver => calculateRecordSubjectTotal(connection, {
            series,
            entity: 'drivers',
            subjectName: driver.name,
            recordCategory: metric,
            fromYear: interpretation.fromYear,
            toYear: interpretation.toYear,
            minStarts: interpretation.minStarts,
            constructorName: constructor?.name,
            circuitName: circuit?.name,
            venueCountryName: venueCountry?.name
        })));
        const scores = totals.map((result, index) => ({
            driver: index === 0 ? first : second,
            metricValue: Number(result.subject.value || 0),
            metricUnit: result.record.unit || '',
            metricLabel: result.record.label,
            victories: metric === 'wins' ? Number(result.subject.value || 0) : 0,
            record: result.record
        }));
        const lowerIsBetter = Boolean(totals[0].record.lowerIsBetter);
        const firstValue = scores[0].metricValue;
        const secondValue = scores[1].metricValue;
        const leader = firstValue === secondValue ? null
            : lowerIsBetter ? firstValue < secondValue ? first : second
                : firstValue > secondValue ? first : second;
        const display = score => `${score.metricValue.toLocaleString('en-US', { maximumFractionDigits: 2 })}${score.metricUnit}`;
        const metricLabel = String(totals[0].record.label || metric).toLowerCase();
        const higherMetric = ['gridGain', 'finishRate', 'winRate', 'podiumRate'].includes(metric);
        const comparisonPhrase = lowerIsBetter ? `the better ${seriesDetails(series).name} ${metricLabel}`
            : higherMetric ? `the higher ${seriesDetails(series).name} ${metricLabel}`
                : `more ${seriesDetails(series).name} ${metricLabel}`;
        const answer = leader
            ? `${leader.name} has ${comparisonPhrase}: ${first.name} has ${display(scores[0])}, while ${second.name} has ${display(scores[1])}.`
            : `${first.name} and ${second.name} are tied at ${display(scores[0])} each for ${seriesDetails(series).name} ${metricLabel}.`;
        return {
            intent: 'driver_head_to_head',
            answer,
            entity: 'drivers',
            entityLabel: 'Drivers',
            comparison: {
                drivers: scores, meetings: null, scope, metric, metricLabel: totals[0].record.label,
                range: { fromYear, toYear }, filters: { constructor, circuit, venueCountry }, details: []
            },
            methodology: {
                source: 'Official classifications and season records in the Racelytic archive.',
                coverage: `${fromYear}–${toYear === 2100 ? 'latest' : toYear}`,
                sample: 'Career totals for both selected drivers use the same filters.'
            },
            assumptions: [
                ...new Set(totals.flatMap(result => result.assumptions || [])),
                'Raw career totals are not normalized for differences in career length, season length or era.',
                ...(metric === 'points' ? ['Championship points are compared as officially awarded; scoring systems differ between eras.'] : [])
            ]
        };
    }
    const rows = isJuniorSeries(series)
        ? await connection.query(`
             SELECT results.raceId, results.sessionId, races.year, races.round, races.name AS raceName,
                    races.circuitId,
                   sessions.name AS sessionName, results.driverId, results.constructorId,
                   results.positionNumber, results.points, results.status,
                   results.fastestLap, results.polePosition
            FROM ${prefix}session_results results
            JOIN ${prefix}sessions sessions ON sessions.id = results.sessionId
            JOIN ${prefix}races races ON races.id = results.raceId
            WHERE results.driverId IN (?, ?) AND races.year BETWEEN ? AND ?
              AND LOWER(CAST(sessions.isRace AS CHAR)) IN ('1', 'true')
            ORDER BY races.year, races.round, sessions.sessionNumber
        `, [first.id, second.id, fromYear, toYear])
        : await connection.query(`
             SELECT results.raceId, results.year, results.round, races.circuitId,
                   COALESCE(NULLIF(grands_prix.fullName, ''), races.officialName) AS raceName,
                   'Grand Prix' AS sessionName, results.driverId, results.constructorId,
                   results.positionNumber, results.positionText, results.gridPositionNumber,
                   results.qualificationPositionNumber, results.points, results.reasonRetired,
                   results.fastestLap, results.polePosition
            FROM races_race_results results
            JOIN races ON races.id = results.raceId
            LEFT JOIN grands_prix ON grands_prix.id = races.grandPrixId
            WHERE results.driverId IN (?, ?) AND results.year BETWEEN ? AND ?
            ORDER BY results.year, results.round
        `, [first.id, second.id, fromYear, toYear]);
    const bySession = new Map();
    rows.forEach(row => {
        const key = `${row.raceId}:${row.sessionId || 'race'}`;
        if (!bySession.has(key)) bySession.set(key, []);
        bySession.get(key).push(row);
    });
    const meetings = [...bySession.values()].filter(group => group.some(row => String(row.driverId) === first.id)
        && group.some(row => String(row.driverId) === second.id))
        .filter(group => !circuit || group.some(row => String(row.circuitId) === circuit.id))
        .filter(group => !venueCountry || group.some(row => venueCountry.circuitIds.includes(String(row.circuitId))))
        .filter(group => !constructor || group.every(row => String(row.constructorId) === constructor.id))
        .filter(group => interpretation.comparisonScope !== 'teammates' || String(group[0].constructorId) === String(group[1].constructorId));
    if (!meetings.length) throw askHttpError(`${first.name} and ${second.name} have no matching ${scope === 'teammates' ? 'teammate ' : ''}race starts in that range.`);
    const score = driver => ({
        driver, victories: 0, podiums: 0, poles: 0, fastestLaps: 0, starts: 0, dnfs: 0,
        raceWins: 0, qualifyingWins: 0, points: 0, finishes: 0, finishTotal: 0,
        qualifyingSamples: 0, qualifyingTotal: 0,
        gridGainTotal: 0, gridGainSamples: 0
    });
    const firstScore = score(first);
    const secondScore = score(second);
    const addResult = (target, row) => {
        const position = Number(row.positionNumber);
        const status = String(row.status || row.reasonRetired || row.positionText || '').trim();
        const excluded = /^(?:DNS|DNQ|DNPQ|WD|DNP|DNA|DNE|DSQ|DISQ|DQ|EXC|EXCLUDED|DID NOT START|DID NOT QUALIFY)$/i.test(status);
        if (!excluded) target.starts += 1;
        if (position > 0) {
            target.finishes += 1;
            target.finishTotal += position;
            if (position === 1) target.victories += 1;
            if (position <= 3) target.podiums += 1;
        }
        if (isTrue(row.polePosition) || Number(row.qualificationPositionNumber) === 1) target.poles += 1;
        if (Number(row.qualificationPositionNumber) > 0) {
            target.qualifyingSamples += 1;
            target.qualifyingTotal += Number(row.qualificationPositionNumber);
        }
        if (isTrue(row.fastestLap)) target.fastestLaps += 1;
        if (!excluded && status && !/^(?:finished|classified|running|\+?\d+\s+laps?)$/i.test(status) && !/^\d+$/.test(status)) target.dnfs += 1;
        const grid = Number(row.gridPositionNumber);
        if (grid > 0 && position > 0) {
            target.gridGainTotal += grid - position;
            target.gridGainSamples += 1;
        }
        target.points += Number(row.points || 0);
    };
    const details = meetings.map(group => {
        const a = group.find(row => String(row.driverId) === first.id);
        const b = group.find(row => String(row.driverId) === second.id);
        addResult(firstScore, a);
        addResult(secondScore, b);
        if (Number(a.positionNumber) > 0 && Number(b.positionNumber) > 0) {
            if (Number(a.positionNumber) < Number(b.positionNumber)) firstScore.raceWins += 1;
            if (Number(b.positionNumber) < Number(a.positionNumber)) secondScore.raceWins += 1;
        }
        if (Number(a.qualificationPositionNumber) > 0 && Number(b.qualificationPositionNumber) > 0) {
            if (Number(a.qualificationPositionNumber) < Number(b.qualificationPositionNumber)) firstScore.qualifyingWins += 1;
            if (Number(b.qualificationPositionNumber) < Number(a.qualificationPositionNumber)) secondScore.qualifyingWins += 1;
        }
        return {
            raceId: String(a.raceId), year: Number(a.year), round: Number(a.round), raceName: a.raceName,
            sessionName: a.sessionName, firstPosition: Number(a.positionNumber) || null,
            secondPosition: Number(b.positionNumber) || null,
            href: resourcePath(series, 'race', a.raceId, a.raceName)
        };
    });
    const metricDetails = {
        wins: ['victories', 'Race wins', false, ''], podiums: ['podiums', 'Podiums', false, ''],
        poles: ['poles', 'Pole positions', false, ''], fastestLaps: ['fastestLaps', 'Fastest laps', false, ''],
        points: ['points', 'Points', false, ''], pointsShare: ['pointsShare', 'Points share', false, '%'], starts: ['starts', 'Starts', false, ''],
        dnfs: ['dnfs', 'DNFs', false, ''], averageFinish: ['averageFinish', 'Average finish', true, ''],
        averageQualifying: ['averageQualifying', 'Average qualifying position', true, ''],
        gridGain: ['gridGain', 'Average positions gained', false, ''], finishRate: ['finishRate', 'Finish rate', false, '%'],
        winRate: ['winRate', 'Win rate', false, '%'], podiumRate: ['podiumRate', 'Podium rate', false, '%'],
        race: ['raceWins', 'Race head-to-head wins', false, ''], qualifying: ['qualifyingWins', 'Qualifying head-to-head wins', false, ''],
        both: ['raceWins', 'Race head-to-head wins', false, '']
    };
    const decorate = target => {
        target.averageFinish = target.finishes ? Number((target.finishTotal / target.finishes).toFixed(2)) : 0;
        target.averageQualifying = target.qualifyingSamples ? Number((target.qualifyingTotal / target.qualifyingSamples).toFixed(2)) : 0;
        target.gridGain = target.gridGainSamples ? Number((target.gridGainTotal / target.gridGainSamples).toFixed(2)) : 0;
        target.finishRate = target.starts ? Number((target.finishes / target.starts * 100).toFixed(2)) : 0;
        target.winRate = target.starts ? Number((target.victories / target.starts * 100).toFixed(2)) : 0;
        target.podiumRate = target.starts ? Number((target.podiums / target.starts * 100).toFixed(2)) : 0;
        return target;
    };
    decorate(firstScore);
    decorate(secondScore);
    const combinedPoints = firstScore.points + secondScore.points;
    firstScore.pointsShare = combinedPoints ? Number((firstScore.points / combinedPoints * 100).toFixed(2)) : 0;
    secondScore.pointsShare = combinedPoints ? Number((secondScore.points / combinedPoints * 100).toFixed(2)) : 0;
    const [metricField, metricLabel, lowerIsBetter, metricUnit] = metricDetails[metric] || metricDetails.both;
    firstScore.metricValue = Number(firstScore[metricField] || 0);
    secondScore.metricValue = Number(secondScore[metricField] || 0);
    firstScore.metricUnit = secondScore.metricUnit = metricUnit;
    firstScore.metricLabel = secondScore.metricLabel = metricLabel;
    const firstValue = firstScore.metricValue;
    const secondValue = secondScore.metricValue;
    const leader = firstValue === secondValue ? null
        : lowerIsBetter ? firstValue < secondValue ? first : second
            : firstValue > secondValue ? first : second;
    const directHeadToHead = ['race', 'qualifying', 'both'].includes(metric);
    const higherMetric = ['gridGain', 'finishRate', 'winRate', 'podiumRate', 'pointsShare'].includes(metric);
    const venueLabel = circuit ? ` at ${circuit.name}` : venueCountry ? ` in ${venueCountry.name}` : '';
    const comparisonPhrase = lowerIsBetter ? `the better ${metricLabel.toLowerCase()}`
        : higherMetric ? `the higher ${metricLabel.toLowerCase()}` : `more ${metricLabel.toLowerCase()}`;
    const answer = directHeadToHead
        ? leader ? `${leader.name} leads the ${metric === 'qualifying' ? 'qualifying' : 'race'} head-to-head across ${meetings.length} shared starts${venueLabel}, ${firstValue}–${secondValue}.`
            : `${first.name} and ${second.name} are tied ${firstValue}–${secondValue} across ${meetings.length} shared starts${venueLabel}.`
        : leader ? `${leader.name} has ${comparisonPhrase} across their ${scope === 'teammates' ? 'teammate' : 'shared'} races${venueLabel}: ${first.name} has ${firstValue}${metricUnit}, while ${second.name} has ${secondValue}${metricUnit}.`
            : `${first.name} and ${second.name} are tied at ${firstValue}${metricUnit} each for ${metricLabel.toLowerCase()} across ${meetings.length} shared starts${venueLabel}.`;
    return {
        intent: 'driver_head_to_head',
        answer,
        entity: 'drivers',
        entityLabel: 'Drivers',
        comparison: {
            drivers: [firstScore, secondScore], meetings: meetings.length, scope, metric, metricLabel,
            range: { fromYear, toYear }, filters: { constructor, circuit, venueCountry }, details: details.slice(-20).reverse()
        },
        methodology: {
            source: 'Official race classifications in the Racelytic archive.',
            coverage: `${fromYear}–${toYear === 2100 ? 'latest' : toYear}`,
            sample: `${meetings.length} starts shared by both drivers${constructor ? ` for ${constructor.name}` : ''}${venueLabel}.`
        },
        assumptions: [
            'Race head-to-heads compare classified finishing positions in starts shared by both drivers.',
            'Qualifying head-to-heads are shown when comparable qualifying positions are recorded.',
            ...(constructor ? [`Both drivers must be recorded for ${constructor.name} in the compared start.`] : []),
            ...(circuit ? [`Only starts recorded at ${circuit.name} are included.`] : []),
            ...(venueCountry ? [`Only starts at circuits in ${venueCountry.name} are included.`] : [])
        ]
    };
}

async function executeAskQuery(connection, interpretation) {
    const intent = interpretation.intent;
    if (intent === 'record_leader') return calculateRecordLeader(connection, interpretation);
    if (intent === 'record_subject_total') return calculateRecordSubjectTotal(connection, interpretation);
    if (intent === 'race_result') return calculateRaceResult(connection, interpretation);
    if (intent === 'season_standings') return calculateSeasonStandings(connection, interpretation);
    if (intent === 'driver_head_to_head') return calculateDriverHeadToHead(connection, interpretation);
    if (intent === 'constructor_head_to_head') return calculateConstructorHeadToHead(connection, interpretation);
    if (intent === 'streak_leader') return calculateStreakLeader(connection, interpretation);
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
    nationalityOptions,
    calculateRecordLeader,
    calculateRecordSubjectTotal,
    calculateRaceResult,
    calculateSeasonStandings,
    calculateDriverHeadToHead,
    calculateConstructorHeadToHead,
    calculateStreakLeader,
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
