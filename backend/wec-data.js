const fs = require('node:fs');
const path = require('node:path');
const csv = require('csv-parser');

const DATA_DIRECTORY = path.join(__dirname, '../data');
const CONTRACT_PATH = path.join(DATA_DIRECTORY, 'wec-data-contract.json');

function readCsv(filePath) {
    return new Promise((resolve, reject) => {
        const rows = [];
        fs.createReadStream(filePath).pipe(csv())
            .on('data', row => rows.push(row))
            .on('end', () => resolve(rows))
            .on('error', reject);
    });
}

function headersFor(filePath) {
    const firstLine = fs.readFileSync(filePath, 'utf8').split(/\r?\n/, 1)[0];
    return firstLine.replace(/^\uFEFF/, '').split(',');
}

function ensureColumns(filename, actual, expected) {
    const missing = expected.filter(column => !actual.includes(column));
    if (missing.length) throw new Error(`${filename} is missing columns: ${missing.join(', ')}`);
}

function numberOrNull(value) {
    return value === null || value === undefined || value === '' ? null : Number(value);
}

function shapeClassification(resultRows, crewRows) {
    const crews = new Map();
    for (const row of crewRows) {
        const key = String(row.entryId);
        if (!crews.has(key)) crews.set(key, []);
        crews.get(key).push({
            id: row.driverId,
            name: row.driverName,
            abbreviation: row.abbreviation,
            countryId: row.nationalityCountryId,
            countryName: row.countryName,
            countryCode: row.countryCode,
            category: row.category,
            crewOrder: Number(row.crewOrder)
        });
    }
    for (const crew of crews.values()) crew.sort((first, second) => first.crewOrder - second.crewOrder);
    return resultRows.map(row => ({
        entryId: row.entryId,
        competitorId: row.competitorId,
        carNumber: row.carNumber,
        class: { id: row.classId, code: row.classCode, name: row.className },
        overallPosition: numberOrNull(row.overallPosition),
        classPosition: numberOrNull(row.classPosition),
        status: row.status,
        laps: numberOrNull(row.laps),
        time: row.time,
        timeMillis: numberOrNull(row.timeMillis),
        gap: row.gap,
        bestLap: row.bestLap,
        bestLapMillis: numberOrNull(row.bestLapMillis),
        points: numberOrNull(row.points),
        team: { id: row.teamId, name: row.teamName },
        manufacturer: { id: row.manufacturerId, name: row.manufacturerName },
        carModel: { id: row.carModelId, name: row.carModelName },
        crew: crews.get(String(row.entryId)) || []
    }));
}

async function loadWecFoundation(dataDirectory = DATA_DIRECTORY) {
    const contract = JSON.parse(fs.readFileSync(path.join(dataDirectory, 'wec-data-contract.json'), 'utf8'));
    const datasets = {};
    for (const [filename, expectedHeaders] of Object.entries(contract.foundationFiles)) {
        const filePath = path.join(dataDirectory, filename);
        if (!fs.existsSync(filePath)) throw new Error(`Missing WEC foundation file: ${filename}`);
        ensureColumns(filename, headersFor(filePath), expectedHeaders);
        const key = filename.replace(/^wecdb-/, '').replace(/\.csv$/, '').replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
        datasets[key] = await readCsv(filePath);
        if (!datasets[key].length) throw new Error(`${filename} contains no records.`);
    }
    return { contract, ...datasets };
}

function validateWecFoundation(dataset) {
    const errors = [];
    const seasons = new Map(dataset.seasons.map(row => [row.id, row]));
    const circuits = new Set(dataset.circuits.map(row => row.id));
    const classesBySeason = new Map();

    for (const row of dataset.classes) {
        if (!seasons.has(row.seasonId)) errors.push(`Class ${row.id} refers to unknown season ${row.seasonId}.`);
        if (!classesBySeason.has(row.seasonId)) classesBySeason.set(row.seasonId, new Set());
        classesBySeason.get(row.seasonId).add(row.code);
    }

    for (const circuit of dataset.circuits) {
        if (!circuit.layoutId) errors.push(`Circuit ${circuit.id} has no layout asset identifier.`);
        if (!(Number(circuit.length) > 0)) errors.push(`Circuit ${circuit.id} has no valid length.`);
        if (!(Number(circuit.turns) > 0)) errors.push(`Circuit ${circuit.id} has no valid turn count.`);
        if (!Number.isFinite(Number(circuit.latitude)) || !Number.isFinite(Number(circuit.longitude))) errors.push(`Circuit ${circuit.id} has invalid coordinates.`);
    }

    const roundsBySeason = new Map();
    for (const event of dataset.events) {
        if (!seasons.has(event.seasonId)) errors.push(`Event ${event.id} refers to unknown season ${event.seasonId}.`);
        if (!circuits.has(event.circuitId)) errors.push(`Event ${event.id} refers to unknown circuit ${event.circuitId}.`);
        if (!['standard', 'extended', 'le-mans'].includes(event.pointsScale)) errors.push(`Event ${event.id} has unsupported points scale ${event.pointsScale}.`);
        if (!roundsBySeason.has(event.seasonId)) roundsBySeason.set(event.seasonId, []);
        roundsBySeason.get(event.seasonId).push(Number(event.round));
    }

    for (const [seasonId, rounds] of roundsBySeason) {
        rounds.sort((a, b) => a - b);
        if (rounds.some((round, index) => round !== index + 1)) errors.push(`${seasonId} rounds are not contiguous: ${rounds.join(', ')}.`);
        if (!classesBySeason.get(seasonId)?.size) errors.push(`${seasonId} has no competition classes.`);
    }

    if (errors.length) throw new Error(errors.join('\n'));
    return {
        seasons: dataset.seasons.length,
        events: dataset.events.length,
        circuits: dataset.circuits.length,
        classes: dataset.classes.length
    };
}

module.exports = { CONTRACT_PATH, DATA_DIRECTORY, ensureColumns, loadWecFoundation, shapeClassification, validateWecFoundation };
