// This launcher expects your existing generic importer.js in this folder.
// If you already imported F1DB, you do not need to run this again.
const { importAll } = require('./importer');
const pool = require('../db');

importAll()
  .then(async () => { await pool.end(); })
  .catch(async error => { console.error(error); await pool.end(); process.exit(1); });
