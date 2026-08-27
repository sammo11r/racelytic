const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
let pool;

function databasePool() {
  if (!pool) pool = require('../db');
  return pool;
}

const DATA_DIR = path.join(__dirname, '../../data');
const IMPORT_LOCK = 'racelytic:data-import';

function tableNameFromFile(filename) {
  if (/^fadb-/i.test(filename)) return `fa_${filename.replace(/^fadb-/i, '').replace(/\.csv$/i, '').replace(/-/g, '_')}`;
  const match = filename.toLowerCase().match(/^f([123])db-/);
  const series = match && match[1] !== '1' ? `f${match[1]}_` : '';
  return series + filename.replace(/^f[123]db-/i, '').replace(/\.csv$/i, '').replace(/-/g, '_');
}

function identifier(value) {
  if (!/^[a-zA-Z0-9_]+$/.test(value)) throw new Error(`Unsafe SQL identifier: ${value}`);
  return `\`${value}\``;
}

function isInteger(value) { return /^-?\d+$/.test(value); }
function isDecimal(value) { return /^-?\d+\.\d+$/.test(value); }
function isBoolean(value) {
  return String(value).toLowerCase() === 'true' || String(value).toLowerCase() === 'false';
}
function isDate(value) { return /^\d{4}-\d{2}-\d{2}$/.test(value); }

function normalizedImportValue(table, column, value) {
  if (table === 'f3_entries' && column === 'chassisId' && ['dallara-f3-2020', 'dallara-f3-2021'].includes(value)) {
    return 'dallara-f3-2019';
  }
  return value;
}

function inferType(column, values) {
  const clean = values.filter(value => value !== null && value !== undefined && value !== '');
  if (!clean.length) return 'TEXT';
  const name = column.toLowerCase();
  if (name === 'id' || name.endsWith('id') || name.includes('code')) return 'VARCHAR(100)';
  if ((name === 'date' || name.endsWith('date')) && clean.every(isDate)) return 'DATE';
  if ((name === 'year' || name.includes('position') || name.includes('laps') || name.includes('round') || name.includes('number') || name.includes('stops') || name.includes('millis')) && clean.every(isInteger)) return 'BIGINT';
  if ((name.includes('points') || name.includes('percentage') || name.includes('length') || name.includes('distance') || name.includes('latitude') || name.includes('longitude') || name.includes('capacity')) && clean.every(value => isInteger(value) || isDecimal(value))) return 'DECIMAL(20,6)';
  if (clean.every(isBoolean)) return 'TINYINT(1)';
  if (clean.every(isInteger)) return 'BIGINT';
  if (clean.every(value => isInteger(value) || isDecimal(value))) return 'DECIMAL(20,6)';
  return 'TEXT';
}

function readCsv(filePath) {
  return new Promise((resolve, reject) => {
    const rows = [];
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', row => rows.push(row))
      .on('end', () => resolve(rows))
      .on('error', reject);
  });
}

async function loadDatasets(dataDirectory = DATA_DIR) {
  const files = fs.readdirSync(dataDirectory)
    .filter(file => /^(?:f[123]db|fadb)-.*\.csv$/i.test(file))
    .sort();
  if (!files.length) throw new Error(`No database CSV files found in ${dataDirectory}.`);
  const datasets = [];
  const tables = new Set();
  for (const file of files) {
    const table = tableNameFromFile(file);
    if (tables.has(table)) throw new Error(`Multiple CSV files map to ${table}.`);
    const rows = await readCsv(path.join(dataDirectory, file));
    if (!rows.length) throw new Error(`${file} contains no data rows.`);
    tables.add(table);
    datasets.push({ file, table, rows });
  }
  return datasets;
}

async function createTable(connection, table, rows) {
  const columns = Object.keys(rows[0]);
  if (!columns.length) throw new Error(`${table} has no columns.`);
  const definitions = columns.map(column => `${identifier(column)} ${inferType(column, rows.map(row => row[column]))} NULL`);
  if (columns.includes('id')) definitions.push('PRIMARY KEY (`id`)');
  await connection.query(`CREATE TABLE ${identifier(table)} (${definitions.join(',')}) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
}

async function insertRows(connection, table, sourceTable, rows) {
  const columns = Object.keys(rows[0]);
  const sql = `INSERT INTO ${identifier(table)} (${columns.map(identifier).join(',')}) VALUES (${columns.map(() => '?').join(',')})`;
  const values = rows.map(row => columns.map(column => {
    const value = normalizedImportValue(sourceTable, column, row[column]);
    if (value === undefined || value === '') return null;
    if (String(value).toLowerCase() === 'true') return 1;
    if (String(value).toLowerCase() === 'false') return 0;
    return value;
  }));
  for (let offset = 0; offset < values.length; offset += 1000) {
    await connection.batch(sql, values.slice(offset, offset + 1000));
  }
}

async function tableNames(connection) {
  const rows = await connection.query('SHOW TABLES');
  return new Set(rows.map(row => String(Object.values(row)[0])));
}

async function dropTables(connection, names) {
  if (!names.length) return;
  await connection.query(`DROP TABLE IF EXISTS ${names.map(identifier).join(',')}`);
}

async function verifyPublishedTables(connection, datasets) {
  for (const dataset of datasets) {
    const rows = await connection.query(`SELECT COUNT(*) AS count FROM ${identifier(dataset.table)}`);
    if (Number(rows[0].count) !== dataset.rows.length) {
      throw new Error(`${dataset.table} published ${rows[0].count} rows; expected ${dataset.rows.length}.`);
    }
  }
}

async function importAll(options = {}) {
  const dataDirectory = options.dataDirectory || DATA_DIR;
  const minimumRowRatio = Number(options.minimumRowRatio ?? process.env.DATA_SYNC_MIN_ROW_RATIO ?? 0.9);
  const datasets = await loadDatasets(dataDirectory);
  const token = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  const stageName = table => `__sync_${token}_${table}`;
  const oldName = table => `__old_${token}_${table}`;
  const failedName = table => `__failed_${token}_${table}`;
  const connection = await databasePool().getConnection();
  let locked = false;
  let published = false;
  let existing = new Set();

  try {
    const lockRows = await connection.query('SELECT GET_LOCK(?, 0) AS acquired', [IMPORT_LOCK]);
    if (Number(lockRows[0].acquired) !== 1) throw new Error('Another database import is already running.');
    locked = true;
    existing = await tableNames(connection);

    for (const dataset of datasets) {
      if (existing.has(dataset.table) && minimumRowRatio > 0) {
        const current = await connection.query(`SELECT COUNT(*) AS count FROM ${identifier(dataset.table)}`);
        const currentCount = Number(current[0].count);
        if (currentCount && dataset.rows.length / currentCount < minimumRowRatio) {
          throw new Error(`${dataset.file} shrank from ${currentCount} to ${dataset.rows.length} rows; refusing publication.`);
        }
      }
      const stage = stageName(dataset.table);
      await createTable(connection, stage, dataset.rows);
      await insertRows(connection, stage, dataset.table, dataset.rows);
      console.log(`Staged ${dataset.file}: ${dataset.rows.length} rows`);
    }

    const renamePairs = [];
    for (const dataset of datasets) {
      if (existing.has(dataset.table)) renamePairs.push(`${identifier(dataset.table)} TO ${identifier(oldName(dataset.table))}`);
      renamePairs.push(`${identifier(stageName(dataset.table))} TO ${identifier(dataset.table)}`);
    }
    await connection.query(`RENAME TABLE ${renamePairs.join(',')}`);
    published = true;

    try {
      await verifyPublishedTables(connection, datasets);
    } catch (error) {
      const rollbackPairs = [];
      for (const dataset of datasets) {
        rollbackPairs.push(`${identifier(dataset.table)} TO ${identifier(failedName(dataset.table))}`);
        if (existing.has(dataset.table)) rollbackPairs.push(`${identifier(oldName(dataset.table))} TO ${identifier(dataset.table)}`);
      }
      await connection.query(`RENAME TABLE ${rollbackPairs.join(',')}`);
      await dropTables(connection, datasets.map(dataset => failedName(dataset.table)));
      published = false;
      throw error;
    }

    await dropTables(connection, datasets.filter(dataset => existing.has(dataset.table)).map(dataset => oldName(dataset.table)));
    console.log(`Atomically published ${datasets.length} tables.`);
    return { tables: datasets.length, rows: datasets.reduce((sum, dataset) => sum + dataset.rows.length, 0) };
  } catch (error) {
    if (!published) {
      try { await dropTables(connection, datasets.map(dataset => stageName(dataset.table))); }
      catch (cleanupError) { console.error('Failed to remove staging tables:', cleanupError); }
    }
    throw error;
  } finally {
    if (locked) {
      try { await connection.query('SELECT RELEASE_LOCK(?)', [IMPORT_LOCK]); }
      catch (error) { console.error('Failed to release import lock:', error); }
    }
    connection.release();
  }
}

module.exports = {
  importAll,
  inferType,
  loadDatasets,
  normalizedImportValue,
  tableNameFromFile
};
