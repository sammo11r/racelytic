const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');

const ORIGIN = 'https://www.f1academy.com';
const DATA_DIR = path.join(__dirname, '../data');
const FROM_YEAR = 2023;
const TO_YEAR = new Date().getFullYear();
const CHASSIS = {
  id: 'tatuus-f4-t421', name: 'Tatuus T-421-F1A', constructor: 'Tatuus Automobili', yearFrom: 2023, yearTo: '',
  category: 'F1 Academy / Formula 4', monocoque: 'FIA 2021-compliant carbon-fibre monocoque', frontSuspension: 'Double wishbone, pushrod',
  rearSuspension: 'Double wishbone, pushrod', transmission: 'Sadev six-speed sequential with Magneti Marelli paddle shift', brakes: 'Four-piston ventilated brakes',
  lengthMm: 4350, widthMm: 1750, heightMm: 950, wheelbaseMm: 2750, weightKg: 570,
  fuelCapacityLitres: '', engineName: 'Autotecnica Motori', engineConfiguration: '1.4-litre turbocharged inline-four',
  engineDisplacementCc: 1373, aspiration: 'Turbocharged', powerOutput: '174 hp @ 5500 rpm', topSpeed: '240 km/h', notes: 'F1 Academy-specific front and rear wings'
};
const ENGINE = { id: 'autotecnica-motori-14t', name: 'Autotecnica Motori 1.4T' };
const FILES = {
  seasons: ['fadb-seasons.csv', ['year']],
  drivers: ['fadb-drivers.csv', ['id', 'name', 'firstName', 'lastName', 'abbreviation', 'countryCode', 'pictureUrl']],
  constructors: ['fadb-constructors.csv', ['id', 'name', 'abbreviation', 'countryCode', 'pictureUrl']],
  circuits: ['fadb-circuits.csv', ['id', 'name', 'type', 'direction', 'placeName', 'lengthMeters', 'turns', 'pictureUrl', 'mapUrl']],
  chassis: ['fadb-chassis.csv', Object.keys(CHASSIS)],
  engines: ['fadb-engines.csv', ['id', 'name']],
  races: ['fadb-races.csv', ['id', 'year', 'round', 'date', 'endDate', 'name', 'code', 'circuitId', 'sourceUrl']],
  sessions: ['fadb-sessions.csv', ['id', 'raceId', 'year', 'round', 'sessionNumber', 'code', 'name', 'startTimeUtc', 'endTimeUtc', 'isRace', 'cancelled']],
  entries: ['fadb-entries.csv', ['raceId', 'year', 'round', 'driverNumber', 'driverId', 'constructorId', 'chassisId', 'engineId']],
  results: ['fadb-session-results.csv', ['sessionId', 'raceId', 'year', 'round', 'positionDisplayOrder', 'positionNumber', 'points', 'polePosition', 'status', 'driverNumber', 'driverId', 'constructorId', 'laps', 'time', 'timeMillis', 'gapMillis', 'gapLaps', 'fastestLap', 'fastestLapNumber', 'fastestLapTime', 'fastestLapTimeMillis', 'averageSpeed']],
  driverStandings: ['fadb-season-driver-standings.csv', ['year', 'positionNumber', 'driverId', 'constructorId', 'points', 'championshipWon', 'starts', 'wins', 'podiums', 'poles', 'fastestLaps', 'retirements']],
  constructorStandings: ['fadb-season-constructor-standings.csv', ['year', 'positionNumber', 'constructorId', 'points', 'championshipWon']]
};

function slug(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
function cleanName(forename, surname, fallback = '') {
  return `${String(forename || '').trim()} ${String(surname || '').trim()}`.trim() || String(fallback || '').replace(/\s+/g, ' ').trim();
}
function bool(value) { return value ? 'True' : 'False'; }
function csvValue(value) {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}
function writeCsv(key, rows) {
  const [filename, columns] = FILES[key];
  const content = [columns.join(','), ...rows.map(row => columns.map(column => csvValue(row[column])).join(','))].join('\n');
  fs.writeFileSync(path.join(DATA_DIR, filename), `${content}\n`);
}
function readCsv(filename) {
  const file = path.join(DATA_DIR, filename);
  if (!fs.existsSync(file)) return Promise.resolve([]);
  return new Promise((resolve, reject) => {
    const rows = [];
    fs.createReadStream(file).pipe(csv()).on('data', row => rows.push(row)).on('end', () => resolve(rows)).on('error', reject);
  });
}
function parseTimeMillis(value) {
  const text = String(value || '').trim();
  if (!/^\d+(?::\d+){0,2}(?:\.\d+)?$/.test(text)) return '';
  const parts = text.split(':').map(Number);
  let seconds = 0;
  for (const part of parts) seconds = seconds * 60 + part;
  return Math.round(seconds * 1000);
}
function utc(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().replace('.000Z', 'Z');
}
function completed(endDate) { return String(endDate || '') < new Date().toISOString().slice(0, 10); }
function resultStatus(row) {
  if (row.ResultStatus) return row.ResultStatus;
  const display = String(row.DisplayFinishPosition || '').trim();
  return /^\d+$/.test(display) ? '' : display || String(row.TimeOrFinishReason || '').trim();
}
function isRaceSession(session) { return session.SessionCode === 'RESULT' || session.SessionType === 'RESULT' || /race/i.test(session.SessionName || ''); }
function isReverseRace(year, raceSessions, index, name) {
  if (/reverse/i.test(name || '')) return true;
  if (Number(year) === 2023 && raceSessions.length === 3 && index === 1) return true;
  if (Number(year) === 2025 && raceSessions.length === 2 && index === 0) return true;
  if (Number(year) === 2025 && raceSessions.length === 3 && index === 1) return true;
  return false;
}
function basePoints(position, reverse) {
  const scale = reverse ? [10, 8, 6, 5, 4, 3, 2, 1] : [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];
  return Number(scale[Number(position) - 1] || 0);
}
function upsert(map, id, value) {
  if (!id) return;
  const current = map.get(id) || {};
  map.set(id, { ...current, ...Object.fromEntries(Object.entries(value).filter(([, item]) => item !== '' && item !== null && item !== undefined)) });
}
function pageProps(html, url) {
  const match = html.match(/<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
  if (!match) throw new Error(`${url}: embedded page data was not found.`);
  return JSON.parse(match[1]).props.pageProps;
}
async function nextData(url) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(60000),
        headers: { accept: 'text/html,application/xhtml+xml', 'user-agent': 'Racelytic data synchronizer/1.0' }
      });
      if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
      return pageProps(await response.text(), url);
    } catch (error) {
      lastError = error;
      if (attempt < 3) await new Promise(resolve => setTimeout(resolve, attempt * 1000));
    }
  }
  throw lastError;
}
async function circuitAliases() {
  const rows = (await Promise.all(['f1db-circuits.csv', 'f2db-circuits.csv', 'f3db-circuits.csv'].map(readCsv))).flat();
  const aliases = new Map();
  for (const row of rows) {
    for (const name of [row.name, row.placeName?.split(',')[0]]) if (name) aliases.set(slug(name), row);
  }
  const manual = {
    spielberg: 'red-bull-ring', barcelona: 'circuit-de-barcelona-catalunya', zandvoort: 'circuit-zandvoort',
    monza: 'autodromo-nazionale-monza', 'le-castellet': 'circuit-paul-ricard', austin: 'circuit-of-the-americas',
    jeddah: 'jeddah-corniche-circuit', miami: 'miami-international-autodrome', singapore: 'marina-bay-street-circuit',
    'yas-marina': 'yas-marina-circuit', shanghai: 'shanghai-international-circuit', montreal: 'circuit-gilles-villeneuve',
    'las-vegas': 'las-vegas-street-circuit'
  };
  return { aliases, manual };
}
function canonicalCircuit(circuit, lookup) {
  const keys = [circuit.CircuitName, circuit.CircuitShortName].map(slug);
  let row = keys.map(key => lookup.aliases.get(key)).find(Boolean);
  if (!row) {
    const target = lookup.manual[keys[1]] || lookup.manual[keys[0]];
    row = [...lookup.aliases.values()].find(item => item.id === target || String(item.id).startsWith(`${target}_`));
  }
  return row || { id: slug(circuit.CircuitName || circuit.CircuitShortName), name: circuit.CircuitName || circuit.CircuitShortName };
}

async function collect() {
  const maps = { drivers: new Map(), constructors: new Map(), circuits: new Map() };
  const rows = Object.fromEntries(['seasons', 'races', 'sessions', 'entries', 'results', 'driverStandings', 'constructorStandings'].map(key => [key, []]));
  const lookup = await circuitAliases();
  const first = await nextData(`${ORIGIN}/Racing-Series/Calendar?seasonid=1`);
    const seasons = first.seasonData.filter(item => {
      const year = Number(String(item.SeasonName).match(/\d{4}/)?.[0]);
      return year >= FROM_YEAR && year <= TO_YEAR;
    });
    for (const season of [...seasons].sort((a, b) => a.SeasonId - b.SeasonId)) {
      const year = Number(String(season.SeasonName).match(/\d{4}/)?.[0]);
      process.stdout.write(`${year}: `);
      const calendar = season.SeasonId === 1 ? first : await nextData(`${ORIGIN}/Racing-Series/Calendar?seasonid=${season.SeasonId}`);
      const driverPage = await nextData(`${ORIGIN}/Racing-Series/Standings/Driver?seasonId=${season.SeasonId}`);
      const teamPage = await nextData(`${ORIGIN}/Racing-Series/Standings/Team?seasonId=${season.SeasonId}`);
      const drivers = driverPage.pageData.Standings || [];
      const teams = teamPage.pageData.Standings || [];
      rows.seasons.push({ year });
      for (const item of drivers) {
        const name = String(item.FullName || item.DisplayName).replace(/\s+/g, ' ').trim();
        const driverId = slug(name);
        const parts = name.split(' ');
        upsert(maps.drivers, driverId, { id: driverId, name, firstName: parts[0], lastName: parts.slice(1).join(' '), abbreviation: item.TLA || '', countryCode: String(item.CountryCode || '').toLowerCase(), pictureUrl: '' });
      }
      for (const item of teams) {
        const constructorId = slug(item.FullName || item.DisplayName);
        upsert(maps.constructors, constructorId, { id: constructorId, name: item.FullName || item.DisplayName, abbreviation: item.TLA || '', countryCode: String(item.CountryCode || '').toLowerCase(), pictureUrl: '' });
      }
      const seasonResults = [];
      for (const [raceIndex, race] of (calendar.pageData.Races || []).entries()) {
        const raceId = `fa-${race.RaceId}`;
        const resultUrl = `${ORIGIN}/Racing-Series/Results?raceid=${race.RaceId}`;
        const resultPage = await nextData(resultUrl);
        const circuit = canonicalCircuit({ ...race, ...resultPage.pageData.CircuitInformation }, lookup);
        upsert(maps.circuits, circuit.id, { id: circuit.id, name: resultPage.pageData.CircuitInformation?.CircuitName || race.CircuitName, type: circuit.type || '', direction: circuit.direction || '', placeName: `${race.CircuitShortName}, ${race.CountryName}`, lengthMeters: Number(resultPage.pageData.CircuitInformation?.CircuitLengthInKM || 0) * 1000 || circuit.lengthMeters || '', turns: circuit.turns || '', pictureUrl: circuit.pictureUrl || '', mapUrl: circuit.mapUrl || '' });
        rows.races.push({ id: raceId, year, round: race.RoundNumber, date: race.RaceStartDate, endDate: race.RaceEndDate, name: race.CircuitShortName, code: String(race.CountryCode || '').toUpperCase(), circuitId: circuit.id, sourceUrl: resultUrl });
        const calendarSessions = race.Sessions || [];
        calendarSessions.forEach((session, index) => rows.sessions.push({ id: `fa-${session.SessionId}`, raceId, year, round: race.RoundNumber, sessionNumber: index + 1, code: session.SessionShortName || session.SessionCode, name: session.SessionName, startTimeUtc: utc(session.SessionStartTime), endTimeUtc: utc(session.SessionEndTime), isRace: bool(isRaceSession(session)), cancelled: bool(session.NoClassification && session.SessionResultsAvailable) }));
        const resultById = new Map((resultPage.pageData.SessionResults || []).map(session => [Number(session.SessionId), session]));
        for (const classification of resultPage.pageData.SessionResults || []) {
          const session = calendarSessions.find(item => Number(item.SessionId) === Number(classification.SessionId));
          if (!session) continue;
          if (classification?.Results?.length > 0 && classification.Results.length < 5) {
            const stored = rows.sessions.find(item => item.id === `fa-${session.SessionId}`);
            if (stored) stored.cancelled = 'True';
          }
        }
        const raceSessions = calendarSessions.filter(isRaceSession);
        for (const session of calendarSessions) {
          const classification = resultById.get(Number(session.SessionId));
          if (!classification?.Results?.length || classification.Results.length < 5) continue;
          const raceSession = isRaceSession(session);
          const sessionIndex = raceSession ? raceSessions.findIndex(item => Number(item.SessionId) === Number(session.SessionId)) : -1;
          const reverse = raceSession && isReverseRace(year, raceSessions, sessionIndex, session.SessionName);
          const officialPoints = raceSession
            ? new Map(drivers.map(driver => [slug(String(driver.FullName).replace(/\s+/g, ' ').trim()), driver.RacePoints?.[raceIndex]?.[sessionIndex]]))
            : new Map();
          const eligible = classification.Results.filter(item => Number(item.FinishPosition) > 0 && Number(item.FinishPosition) <= (reverse ? 8 : 10));
          const fastestTime = Math.min(...eligible.map(item => parseTimeMillis(item.Best)).filter(Boolean));
          classification.Results.forEach((item, order) => {
            const name = cleanName(item.DriverForename, item.DriverSurname, item.DriverDisplayName);
            const driverId = slug(name); const constructorId = slug(item.TeamName);
            upsert(maps.drivers, driverId, { id: driverId, name, firstName: String(item.DriverForename || '').trim(), lastName: String(item.DriverSurname || '').trim(), abbreviation: item.TLA || '', pictureUrl: '' });
            upsert(maps.constructors, constructorId, { id: constructorId, name: item.TeamName, abbreviation: '', pictureUrl: '' });
            const points = raceSession ? officialPoints.get(driverId) : '';
            const lapMillis = parseTimeMillis(item.Best);
            const fastestLap = Boolean(raceSession && fastestTime && lapMillis === fastestTime && Number(item.FinishPosition) <= (reverse ? 8 : 10));
            const bonus = raceSession ? Number(points || 0) - basePoints(item.FinishPosition, reverse) - (fastestLap ? 1 : 0) : 0;
            const result = { sessionId: `fa-${session.SessionId}`, raceId, year, round: race.RoundNumber, positionDisplayOrder: order + 1, positionNumber: Number(item.FinishPosition) > 0 ? item.FinishPosition : '', points: points ?? '', polePosition: bool(raceSession && bonus >= 2), status: resultStatus(item), driverNumber: item.CarNumber || '', driverId, constructorId, laps: item.LapsCompleted ?? '', time: item.TimeOrFinishReason || '', timeMillis: parseTimeMillis(item.TimeOrFinishReason), gapMillis: parseTimeMillis(item.Gap), gapLaps: String(item.Gap || '').match(/(\d+)\s*LAP/i)?.[1] || '', fastestLap: bool(fastestLap), fastestLapNumber: item.BestLap || '', fastestLapTime: item.Best || '', fastestLapTimeMillis: lapMillis, averageSpeed: item.Speed || '' };
            rows.results.push(result);
            if (raceSession) seasonResults.push(result);
          });
        }
        const entrants = new Map();
        for (const result of rows.results.filter(item => item.raceId === raceId)) entrants.set(result.driverId, result);
        if (!entrants.size && !completed(race.RaceEndDate)) {
          for (const driver of drivers) entrants.set(slug(String(driver.FullName).replace(/\s+/g, ' ').trim()), { driverId: slug(String(driver.FullName).replace(/\s+/g, ' ').trim()), constructorId: slug(driver.TeamName), driverNumber: driver.CarNumber });
        }
        for (const entry of entrants.values()) rows.entries.push({ raceId, year, round: race.RoundNumber, driverNumber: entry.driverNumber || '', driverId: entry.driverId, constructorId: entry.constructorId, chassisId: CHASSIS.id, engineId: ENGINE.id });
        process.stdout.write(`${raceIndex + 1}/${calendar.pageData.Races.length} `);
      }
      const complete = completed(season.SeasonEndDate);
      for (const item of drivers) {
        const driverId = slug(String(item.FullName).replace(/\s+/g, ' ').trim());
        const results = seasonResults.filter(result => result.driverId === driverId);
        rows.driverStandings.push({ year, positionNumber: item.Position, driverId, constructorId: slug(item.TeamName), points: item.TotalPoints, championshipWon: bool(complete && item.Position === 1), starts: results.length, wins: results.filter(item => Number(item.positionNumber) === 1).length, podiums: results.filter(item => Number(item.positionNumber) >= 1 && Number(item.positionNumber) <= 3).length, poles: results.filter(item => item.polePosition === 'True').length, fastestLaps: results.filter(item => item.fastestLap === 'True').length, retirements: results.filter(item => !item.positionNumber).length });
      }
      for (const item of teams) rows.constructorStandings.push({ year, positionNumber: item.Position, constructorId: slug(item.FullName || item.DisplayName), points: item.TotalPoints, championshipWon: bool(complete && item.Position === 1) });
      console.log('done');
    }
  const missingCountries = [...maps.drivers.values()].filter(item => !item.countryCode);
  const missingTeamCountries = [...maps.constructors.values()].filter(item => !item.countryCode);
  if (missingCountries.length) throw new Error(`Drivers without nationality: ${missingCountries.map(item => item.name).join(', ')}`);
  if (missingTeamCountries.length) throw new Error(`Teams without nationality: ${missingTeamCountries.map(item => item.name).join(', ')}`);
  writeCsv('drivers', [...maps.drivers.values()].sort((a, b) => a.name.localeCompare(b.name)));
  writeCsv('constructors', [...maps.constructors.values()].sort((a, b) => a.name.localeCompare(b.name)));
  writeCsv('circuits', [...maps.circuits.values()].sort((a, b) => a.name.localeCompare(b.name)));
  writeCsv('chassis', [CHASSIS]); writeCsv('engines', [ENGINE]);
  for (const key of ['seasons', 'races', 'sessions', 'entries', 'results', 'driverStandings', 'constructorStandings']) writeCsv(key, rows[key]);
  console.log(`Wrote complete F1 Academy dataset for ${FROM_YEAR}–${TO_YEAR}.`);
}

if (require.main === module) collect().catch(error => { console.error(error); process.exitCode = 1; });

module.exports = { basePoints, cleanName, isReverseRace, pageProps, parseTimeMillis, slug };
