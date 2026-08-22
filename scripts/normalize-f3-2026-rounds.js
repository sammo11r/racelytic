const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const pool = require('../backend/db');

const DATA_DIR = path.join(__dirname, '../data');
const FILES = ['f3db-races.csv', 'f3db-entries.csv', 'f3db-sessions.csv', 'f3db-session-results.csv'];

function readCsv(filePath) {
  return new Promise((resolve, reject) => {
    const rows = [];
    fs.createReadStream(filePath).pipe(csv())
      .on('data', row => rows.push(row))
      .on('end', () => resolve(rows))
      .on('error', reject);
  });
}

function csvValue(value) {
  const text = String(value ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

async function main() {
  const racePath = path.join(DATA_DIR, FILES[0]);
  const races = await readCsv(racePath);
  const season = races.filter(race => race.year === '2026').sort((a, b) => Number(a.round) - Number(b.round));
  const currentRounds = season.map(race => Number(race.round));
  if (currentRounds.join(',') === '1,2,3,4,5,6,7,8,9') {
    console.log('The 2026 F3 rounds are already normalized.');
    return;
  }
  if (currentRounds.join(',') !== '1,3,4,5,6,7,8,9,10') {
    throw new Error(`Unexpected 2026 round sequence: ${currentRounds.join(',')}`);
  }

  for (const name of FILES) {
    const filePath = path.join(DATA_DIR, name);
    const rows = await readCsv(filePath);
    const columns = Object.keys(rows[0]);
    rows.forEach(row => {
      if (row.year === '2026' && Number(row.round) >= 3) row.round = String(Number(row.round) - 1);
    });
    fs.writeFileSync(filePath, `${columns.join(',')}\n${rows.map(row => columns.map(column => csvValue(row[column])).join(',')).join('\n')}\n`);
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    for (const table of ['f3_races', 'f3_entries', 'f3_sessions', 'f3_session_results']) {
      await connection.query(`UPDATE ${table} SET round = round - 1 WHERE year = 2026 AND round >= 3`);
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
  console.log('Normalized the 2026 F3 calendar from rounds 1,3–10 to rounds 1–9.');
}

main()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => pool.end());
