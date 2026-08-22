const fs = require('fs');
const path = require('path');
const pool = require('../backend/db');
const {
  databaseValue, fetchText, gapLaps, gapToMilliseconds, markFastestLap, normalized,
  parseClassificationTables, parseNumber, parseStandingsRows, readCsv,
  timeToMilliseconds, writeCsv
} = require('./import-f3-2026-fia');

const YEAR = 2026;
const APPLY = process.argv.includes('--apply');
const DATA_DIR = path.join(__dirname, '../data');
const CACHE_DIR = path.join(DATA_DIR, '.f2-cache');
const file = suffix => path.join(DATA_DIR, `f2db-${suffix}.csv`);

const SESSION_COLUMNS = ['id','raceId','year','round','sessionNumber','code','name','startTimeUtc','endTimeUtc','isRace','cancelled'];
const RESULT_COLUMNS = ['sessionId','raceId','year','round','positionDisplayOrder','positionNumber','points','polePosition','status','driverNumber','driverId','constructorId','laps','time','timeMillis','gapMillis','gapLaps','fastestLap','fastestLapNumber','fastestLapTime','fastestLapTimeMillis','averageSpeed'];
const ENTRY_COLUMNS = ['raceId','year','round','driverNumber','driverId','constructorId','chassisId','engineId'];
const DRIVER_STANDING_COLUMNS = ['year','positionNumber','driverId','constructorId','points','championshipWon','starts','wins','podiums','poles','fastestLaps','retirements'];
const CONSTRUCTOR_STANDING_COLUMNS = ['year','positionNumber','constructorId','points','championshipWon'];

const EVENTS = [
  { round:3, sourceSlug:'montreal', idSlug:'montreal' },
  { round:4, sourceSlug:'monaco', idSlug:'monte-carlo' },
  { round:5, sourceSlug:'barcelona-catalunya', idSlug:'barcelona' },
  { round:6, sourceSlug:'spielberg', idSlug:'spielburg' },
  { round:7, sourceSlug:'silverstone', idSlug:'silverstone' },
  { round:8, sourceSlug:'spa-francorchamps', idSlug:'spa-francorchamps' },
  { round:9, sourceSlug:'budapest', idSlug:'budapest' }
];
const SESSION_DEFINITIONS = [
  { path:'session-classifications', suffix:'free-practice', number:1, name:'Free Practice', race:false },
  { path:'qualifying-classification', suffix:'qualifying', number:2, name:'Qualifying', race:false, qualifying:true },
  { path:'sprint-race-classification', suffix:'race', number:4, name:'Race', race:true },
  { path:'feature-race-classification', suffix:'race-2', number:6, name:'Race', race:true }
];

function classificationUrl(event, definition) {
  return `https://www.fia.com/events/formula-2-championship/season-${YEAR}/${event.sourceSlug}/${definition.path}`;
}

function resultRow(row, order, session, race, entry) {
  const positionText = row.Pos || row.Position || '';
  const positionNumber = /^\d+$/.test(positionText) ? Number(positionText) : '';
  const bestLapTime = row['Best lap'] || row['Best Lap'] || '';
  const gapFirst = row['Gap first'] || row['Gap First'] || '';
  const officialPoints = parseNumber(row.Points);
  return {
    sessionId:session.id, raceId:race.id, year:YEAR, round:race.round,
    positionDisplayOrder:order, positionNumber,
    points:officialPoints === '' && session.qualifying && positionNumber === 1 ? 2 : officialPoints,
    polePosition:session.qualifying && positionNumber === 1 ? 'True' : 'False',
    status:positionNumber ? 'CLA' : (positionText || 'NC').toUpperCase(),
    driverNumber:String(row.Nr || row.No || row.Number || '').replace(/\D/g,''),
    driverId:entry.driverId, constructorId:entry.constructorId,
    laps:parseNumber(row.Laps), time:row.Time || '',
    timeMillis:order === 1 ? timeToMilliseconds(row.Time) : '',
    gapMillis:gapToMilliseconds(gapFirst), gapLaps:gapLaps(gapFirst), fastestLap:'False',
    fastestLapNumber:parseNumber(row['Best lap lap'] || row['Best Lap Lap']),
    fastestLapTime:bestLapTime, fastestLapTimeMillis:timeToMilliseconds(bestLapTime),
    averageSpeed:parseNumber(row.Kph)
  };
}

function driverForStanding(label, drivers, activeDriverIds) {
  const match = label.match(/^(\d+)\s*(.+)$/);
  if (!match) throw new Error(`Invalid driver standing: ${label}`);
  const display = match[2].trim();
  const parts = display.split(/\s+/);
  const initial = normalized(parts[0]).charAt(0);
  const surname = normalized(parts.slice(1).join(' '));
  let candidates = drivers.filter(driver => {
    const name = normalized(driver.name);
    const first = name.charAt(0);
    return first === initial && name.endsWith(surname);
  });
  const active = candidates.filter(driver => activeDriverIds.has(driver.id));
  if (active.length === 1) candidates = active;
  if (candidates.length !== 1) throw new Error(`Could not uniquely map official F2 driver: ${display}`);
  return { position:Number(match[1]), driver:candidates[0] };
}

function constructorForStanding(label, constructors) {
  const match = label.match(/^(\d+)\s*(.+)$/);
  if (!match) throw new Error(`Invalid constructor standing: ${label}`);
  const key = normalized(match[2]);
  const aliases = { trident:'trident-motorsport', hitech:'hitech-racing', damslucasoil:'dams', aixracing:'phm-racing' };
  const constructor = constructors.find(item => normalized(item.name) === key);
  const id = constructor?.id || aliases[key];
  if (!id) throw new Error(`Could not map official F2 constructor: ${match[2]}`);
  return { position:Number(match[1]), id };
}

function latestConstructor(driverId, entries) {
  return entries.filter(entry => entry.year === String(YEAR) && entry.driverId === driverId)
    .sort((a,b) => Number(b.round) - Number(a.round))[0]?.constructorId || '';
}

function stats(driverId, results) {
  const rows = results.filter(row => String(row.year) === String(YEAR) && row.driverId === driverId);
  const races = rows.filter(row => /_race(?:-2)?$/.test(row.sessionId));
  return {
    starts:races.length,
    wins:races.filter(row => Number(row.positionNumber) === 1).length,
    podiums:races.filter(row => Number(row.positionNumber) >= 1 && Number(row.positionNumber) <= 3).length,
    poles:rows.filter(row => /_qualifying$/.test(row.sessionId) && Number(row.positionNumber) === 1).length,
    fastestLaps:races.filter(row => String(row.fastestLap).toLowerCase() === 'true').length,
    retirements:races.filter(row => row.status && !['CLA','FINISHED'].includes(String(row.status).toUpperCase())).length
  };
}

async function replaceYear(connection, table, columns, rows) {
  await connection.query(`DELETE FROM ${table} WHERE year = ?`, [YEAR]);
  if (!rows.length) return;
  await connection.batch(
    `INSERT INTO ${table} (${columns.map(column=>`\`${column}\``).join(',')}) VALUES (${columns.map(()=>'?').join(',')})`,
    rows.map(row => columns.map(column => databaseValue(row[column])))
  );
}

async function updateDatabase(sessions, results, newEntries, driverStandings, constructorStandings) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const ids = sessions.map(session => session.id);
    await connection.query(`DELETE FROM f2_session_results WHERE sessionId IN (${ids.map(()=>'?').join(',')})`, ids);
    await connection.query(`DELETE FROM f2_sessions WHERE id IN (${ids.map(()=>'?').join(',')})`, ids);
    for (const entry of newEntries) {
      await connection.query('DELETE FROM f2_entries WHERE raceId = ? AND driverNumber = ?', [entry.raceId, entry.driverNumber]);
    }
    if (newEntries.length) await connection.batch(
      `INSERT INTO f2_entries (${ENTRY_COLUMNS.map(column=>`\`${column}\``).join(',')}) VALUES (${ENTRY_COLUMNS.map(()=>'?').join(',')})`,
      newEntries.map(row => ENTRY_COLUMNS.map(column => databaseValue(row[column])))
    );
    await connection.batch(
      `INSERT INTO f2_sessions (${SESSION_COLUMNS.map(column=>`\`${column}\``).join(',')}) VALUES (${SESSION_COLUMNS.map(()=>'?').join(',')})`,
      sessions.map(row => SESSION_COLUMNS.map(column => databaseValue(row[column])))
    );
    await connection.batch(
      `INSERT INTO f2_session_results (${RESULT_COLUMNS.map(column=>`\`${column}\``).join(',')}) VALUES (${RESULT_COLUMNS.map(()=>'?').join(',')})`,
      results.map(row => RESULT_COLUMNS.map(column => databaseValue(row[column])))
    );
    await replaceYear(connection, 'f2_season_driver_standings', DRIVER_STANDING_COLUMNS, driverStandings);
    await replaceYear(connection, 'f2_season_constructor_standings', CONSTRUCTOR_STANDING_COLUMNS, constructorStandings);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally { connection.release(); }
}

async function main() {
  const [races, entries, drivers, constructors, oldSessions, oldResults, oldDriverStandings, oldConstructorStandings] = await Promise.all([
    readCsv(file('races')), readCsv(file('entries')), readCsv(file('drivers')), readCsv(file('constructors')),
    readCsv(file('sessions')), readCsv(file('session-results')), readCsv(file('season-driver-standings')), readCsv(file('season-constructor-standings'))
  ]);
  const racesByRound = new Map(races.filter(race=>race.year===String(YEAR)).map(race=>[Number(race.round),race]));
  const entriesByRaceNumber = new Map(entries.map(entry=>[`${entry.raceId}:${entry.driverNumber}`,entry]));
  const latestEntryByNumber = new Map(entries.filter(entry=>entry.year===String(YEAR)).sort((a,b)=>Number(a.round)-Number(b.round)).map(entry=>[String(entry.driverNumber),entry]));
  const commonEntry = entries.find(entry=>entry.year===String(YEAR));
  oldResults.filter(result=>result.year===String(YEAR)).forEach(result=>{
    const number = String(result.driverNumber);
    if (!latestEntryByNumber.has(number) && result.driverId && result.constructorId) {
      latestEntryByNumber.set(number, {
        raceId:result.raceId, year:String(YEAR), round:String(result.round), driverNumber:number,
        driverId:result.driverId, constructorId:result.constructorId,
        chassisId:commonEntry?.chassisId || '', engineId:commonEntry?.engineId || ''
      });
    }
  });
  const importedSessions = [], importedResults = [], newEntries = [];

  for (const event of EVENTS) {
    const race = racesByRound.get(event.round);
    if (!race) throw new Error(`F2 round ${event.round} not found.`);
    for (const definition of SESSION_DEFINITIONS) {
      const session = {
        id:`fia-formula-2-championship_${YEAR}_${event.idSlug}_${definition.suffix}`,
        raceId:race.id, year:YEAR, round:race.round, sessionNumber:definition.number,
        code:'', name:definition.name, startTimeUtc:'', endTimeUtc:'',
        isRace:definition.race?'True':'False', cancelled:'False', qualifying:Boolean(definition.qualifying)
      };
      const url = classificationUrl(event, definition);
      const tables = parseClassificationTables(await fetchText(url), url);
      const official = tables.reduce((largest, table)=>table.rows.length>largest.length?table.rows:largest,[]);
      if (official.length < 18) throw new Error(`Suspiciously short classification (${official.length}) at ${url}`);
      const rows = official.map((row,index)=>{
        const number = String(row.Nr || row.No || row.Number || '').replace(/\D/g,'');
        let entry = entriesByRaceNumber.get(`${race.id}:${number}`);
        if (!entry) {
          const template = latestEntryByNumber.get(number);
          if (!template) throw new Error(`No F2 entry mapping for round ${race.round}, car ${number} (${row.Driver}).`);
          entry = { ...template, raceId:race.id, year:String(YEAR), round:String(race.round) };
          entriesByRaceNumber.set(`${race.id}:${number}`, entry);
          newEntries.push(entry);
        }
        return resultRow(row,index+1,session,race,entry);
      });
      if (definition.race) markFastestLap(rows);
      importedSessions.push(session); importedResults.push(...rows);
      console.log(`${YEAR} round ${race.round} ${definition.name}${definition.suffix==='race-2'?' 2':''}: ${rows.length} results`);
    }
  }

  const importedIds = new Set(importedSessions.map(session=>session.id));
  const mergedSessions = oldSessions.filter(session=>!importedIds.has(session.id)).concat(importedSessions)
    .sort((a,b)=>Number(a.year)-Number(b.year)||Number(a.round)-Number(b.round)||Number(a.sessionNumber)-Number(b.sessionNumber));
  const mergedResults = oldResults.filter(result=>!importedIds.has(result.sessionId)).concat(importedResults);
  const sessionOrder = new Map(mergedSessions.map((session,index)=>[session.id,index]));
  mergedResults.sort((a,b)=>(sessionOrder.get(a.sessionId)??999999)-(sessionOrder.get(b.sessionId)??999999)||Number(a.positionDisplayOrder)-Number(b.positionDisplayOrder));
  const mergedEntries = entries.concat(newEntries).sort((a,b)=>Number(a.year)-Number(b.year)||Number(a.round)-Number(b.round)||Number(a.driverNumber)-Number(b.driverNumber));

  const [driverHtml, constructorHtml] = await Promise.all([
    fetchText('https://www.fiaformula2.com/en/standings/2026/drivers'),
    fetchText('https://www.fiaformula2.com/en/standings/2026/teams')
  ]);
  const activeDriverIds = new Set(mergedEntries.filter(entry=>entry.year===String(YEAR)).map(entry=>entry.driverId));
  const driverStandings = parseStandingsRows(driverHtml).map(cells=>{
    const mapped = driverForStanding(cells[0],drivers,activeDriverIds);
    return { year:YEAR, positionNumber:mapped.position, driverId:mapped.driver.id,
      constructorId:latestConstructor(mapped.driver.id,mergedEntries), points:parseNumber(cells.at(-1)),
      championshipWon:'False', ...stats(mapped.driver.id,mergedResults) };
  });
  const constructorStandings = parseStandingsRows(constructorHtml).map(cells=>{
    const mapped = constructorForStanding(cells[0],constructors);
    return { year:YEAR, positionNumber:mapped.position, constructorId:mapped.id, points:parseNumber(cells.at(-1)), championshipWon:'False' };
  });
  console.log(`Official standings: ${driverStandings.length} drivers, ${constructorStandings.length} teams, ${driverStandings.reduce((sum,row)=>sum+Number(row.points),0)} driver points.`);
  console.log(`Repaired ${newEntries.length} missing round entries.`);
  if (!APPLY) return console.log('Dry run complete. Re-run with --apply to update CSV and database data.');

  fs.mkdirSync(CACHE_DIR,{recursive:true});
  const backup = path.join(CACHE_DIR,`fia-2026-import-backup-${new Date().toISOString().replace(/[:.]/g,'-')}.json`);
  fs.writeFileSync(backup,`${JSON.stringify({
    sessions:oldSessions.filter(row=>row.year===String(YEAR)), results:oldResults.filter(row=>row.year===String(YEAR)),
    entries:entries.filter(row=>row.year===String(YEAR)), driverStandings:oldDriverStandings.filter(row=>row.year===String(YEAR)),
    constructorStandings:oldConstructorStandings.filter(row=>row.year===String(YEAR))
  },null,2)}\n`);
  writeCsv(file('entries'),ENTRY_COLUMNS,mergedEntries);
  writeCsv(file('sessions'),SESSION_COLUMNS,mergedSessions);
  writeCsv(file('session-results'),RESULT_COLUMNS,mergedResults);
  writeCsv(file('season-driver-standings'),DRIVER_STANDING_COLUMNS,oldDriverStandings.filter(row=>row.year!==String(YEAR)).concat(driverStandings));
  writeCsv(file('season-constructor-standings'),CONSTRUCTOR_STANDING_COLUMNS,oldConstructorStandings.filter(row=>row.year!==String(YEAR)).concat(constructorStandings));
  await updateDatabase(importedSessions,importedResults,newEntries,driverStandings,constructorStandings);
  console.log(`Updated F2 CSV and database data. Backup: ${backup}`);
}

main().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>pool.end());
