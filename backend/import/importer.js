const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const pool = require('../db');

const DATA_DIR = path.join(__dirname, '../../data');

function tableNameFromFile(filename) {
  const match = filename.toLowerCase().match(/^f([123])db-/);
  const series = match && match[1] !== '1' ? `f${match[1]}_` : '';
  return series + filename.replace(/^f[123]db-/i,'').replace(/\.csv$/i,'').replace(/-/g,'_');
}
function isInteger(v){ return /^-?\d+$/.test(v); }
function isDecimal(v){ return /^-?\d+\.\d+$/.test(v); }
function isBoolean(v){ return String(v).toLowerCase() === 'true' || String(v).toLowerCase() === 'false'; }
function isDate(v){ return /^\d{4}-\d{2}-\d{2}$/.test(v); }

function normalizedImportValue(table, column, value) {
  if (table === 'f3_entries' && column === 'chassisId' && ['dallara-f3-2020', 'dallara-f3-2021'].includes(value)) {
    return 'dallara-f3-2019';
  }
  return value;
}

function inferType(column, values) {
  const clean = values.filter(v => v !== null && v !== undefined && v !== '');
  if (!clean.length) return 'TEXT';
  const c = column.toLowerCase();
  if (c === 'id' || c.endsWith('id') || c.includes('code')) return 'VARCHAR(100)';
  if ((c === 'date' || c.endsWith('date')) && clean.every(isDate)) return 'DATE';
  if ((c === 'year' || c.includes('position') || c.includes('laps') || c.includes('round') || c.includes('number') || c.includes('stops') || c.includes('millis')) && clean.every(isInteger)) return 'BIGINT';
  if ((c.includes('points') || c.includes('percentage') || c.includes('length') || c.includes('distance') || c.includes('latitude') || c.includes('longitude') || c.includes('capacity')) && clean.every(v => isInteger(v) || isDecimal(v))) return 'DECIMAL(20,6)';
  if (clean.every(isBoolean)) return 'TINYINT(1)';
  if (clean.every(isInteger)) return 'BIGINT';
  if (clean.every(v => isInteger(v) || isDecimal(v))) return 'DECIMAL(20,6)';
  return 'TEXT';
}
function readCsv(filePath){
  return new Promise((resolve,reject)=>{
    const rows=[];
    fs.createReadStream(filePath).pipe(csv()).on('data',r=>rows.push(r)).on('end',()=>resolve(rows)).on('error',reject);
  });
}
async function createTable(c, table, rows){
  if(!rows.length) return;
  const cols=Object.keys(rows[0]);
  const defs=cols.map(col=>`\`${col.replace(/`/g,'``')}\` ${inferType(col,rows.map(r=>r[col]))} NULL`);
  if(cols.includes('id')) defs.push('PRIMARY KEY (`id`)');
  await c.query(`DROP TABLE IF EXISTS \`${table}\``);
  await c.query(`CREATE TABLE \`${table}\` (${defs.join(',')}) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
}
async function insertRows(c,table,rows){
  if(!rows.length)return;
  const cols=Object.keys(rows[0]);
  const sql=`INSERT INTO \`${table}\` (${cols.map(x=>`\`${x.replace(/`/g,'``')}\``).join(',')}) VALUES (${cols.map(()=>'?').join(',')})`;
  const values=rows.map(row=>cols.map(col=>{
      const v=normalizedImportValue(table,col,row[col]);
      if(v===undefined||v==='') return null;
      if(String(v).toLowerCase()==='true') return 1;
      if(String(v).toLowerCase()==='false') return 0;
      return v;
    }));
  const batchSize=1000;
  for(let offset=0;offset<values.length;offset+=batchSize){
    await c.batch(sql,values.slice(offset,offset+batchSize));
  }
}
async function importAll(){
  let c;
  let foreignKeyChecksDisabled=false;
  try{
    c=await pool.getConnection();
    await c.query('SET FOREIGN_KEY_CHECKS=0');
    foreignKeyChecksDisabled=true;
    const files=fs.readdirSync(DATA_DIR).filter(f=>/^f[123]db-.*\.csv$/i.test(f)).sort();
    for(const file of files){
      console.log(`Importing ${file}`);
      const rows=await readCsv(path.join(DATA_DIR,file));
      const table=tableNameFromFile(file);
      await createTable(c,table,rows);
      await insertRows(c,table,rows);
      console.log(`  ✓ ${table}: ${rows.length} rows`);
    }
    console.log(`Imported ${files.length} files.`);
  } finally {
    if(c){
      if(foreignKeyChecksDisabled){
        try { await c.query('SET FOREIGN_KEY_CHECKS=1'); }
        catch(error) { console.error('Failed to restore foreign key checks:', error); }
      }
      c.release();
    }
  }
}
module.exports={importAll};
