const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const { auditConstructorChronology, canonicalizeConstructorChronology } = require('../backend/constructor-lineage-data');
const editorial = require('../data/f1-constructor-lineage-transitions.json');

const DATA = path.join(__dirname, '..', 'data');

function readCsv(filename) {
  return new Promise((resolve, reject) => {
    const rows = [];
    fs.createReadStream(path.join(DATA, filename)).pipe(csv())
      .on('data', row => rows.push(row)).on('end', () => resolve(rows)).on('error', reject);
  });
}

function editorialReport(canonical, results) {
  const chains = new Map();
  for (const row of canonical) {
    if (!chains.has(row.lineageId)) chains.set(row.lineageId, []);
    chains.get(row.lineageId).push(row);
  }
  const transitionKeys = [...chains.values()].flatMap(chain => chain.slice(1).map((row, index) => `${chain[index].constructorId}>${row.constructorId}`));
  const genericTransitions = [...new Set(transitionKeys.filter(key => !editorial.transitions[key]))];
  const transitionsWithoutDirectSource = [...new Set(transitionKeys.filter(key => !(editorial.transitions[key]?.sourceUrl || editorial.transitionSource?.url)))];
  const participation = new Map();
  for (const result of results) {
    const year = Number(result.year);
    if (!result.constructorId || !year) continue;
    if (!participation.has(result.constructorId)) participation.set(result.constructorId, new Set());
    participation.get(result.constructorId).add(year);
  }
  const chronology = new Map();
  for (const row of canonical) {
    const from = Number(row.yearFrom), to = Number(row.yearTo) || Infinity;
    if (!chronology.has(row.constructorId)) chronology.set(row.constructorId, []);
    chronology.get(row.constructorId).push({ from, to });
  }
  const participationMismatches = [...participation].flatMap(([id, years]) => {
    const recorded = chronology.get(id);
    if (!recorded) return [];
    const declaredSeparatePeriods = editorial.separateIdentityPeriods?.[id] || [];
    const outsideYears = [...years].filter(year => !recorded.some(period => year >= period.from && year <= period.to));
    const unexplainedYears = outsideYears.filter(year => !declaredSeparatePeriods.some(period => year >= Number(period.from) && year <= Number(period.to)));
    return unexplainedYears.length ? [{ id, outsideYears: unexplainedYears, chronology: recorded }] : [];
  });
  return { chains: chains.size, genericTransitions, transitionsWithoutDirectSource, participationMismatches };
}

async function main() {
  const [rows, constructors, results] = await Promise.all([
    readCsv('f1db-constructors-chronology.csv'),
    readCsv('f1db-constructors.csv'),
    readCsv('f1db-races-race-results.csv')
  ]);
  const integrity = auditConstructorChronology(rows, constructors.map(row => row.id));
  const canonical = canonicalizeConstructorChronology(rows);
  for (const warning of integrity.warnings) console.warn(`Warning: ${warning}`);
  if (integrity.errors.length) throw new Error(integrity.errors.join('\n'));
  const status = editorialReport(canonical, results);
  const report = { sourceRows: rows.length, canonicalSegments: canonical.length, ...status };
  if (process.argv.includes('--json')) return console.log(JSON.stringify(report, null, 2));
  console.log(`Constructor lineage valid: ${rows.length} source rows normalize to ${canonical.length} segments across ${report.chains} chains.`);
  console.log(`Editorial review: ${report.genericTransitions.length} generic transitions; ${report.transitionsWithoutDirectSource.length} transitions without a direct source; ${report.participationMismatches.length} participation mismatches.`);
}

if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });

module.exports = { editorialReport, main, readCsv };
