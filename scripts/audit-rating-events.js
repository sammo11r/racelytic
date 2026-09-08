const pool = require('../backend/db');
const { auditRatingEvents } = require('../backend/rating-audit');
const { loadRatingEvents } = require('../backend/rating-data');

const SERIES = ['f1', 'f2', 'f3', 'academy'];

function argument(name) {
    return process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3);
}

function selectedSeries() {
    const requested = argument('series');
    if (!requested) return SERIES;
    if (!SERIES.includes(requested)) throw new Error(`Unknown series: ${requested}`);
    return [requested];
}

async function main() {
    const connection = await pool.getConnection(), reports = {};
    try {
        for (const series of selectedSeries()) {
            reports[series] = auditRatingEvents(await loadRatingEvents(connection, series));
        }
    } finally {
        connection.release();
        await pool.end();
    }

    if (process.argv.includes('--json')) console.log(JSON.stringify(reports, null, 2));
    else console.table(Object.entries(reports).map(([series, report]) => ({
        series: series.toUpperCase(), ...report.summary
    })));
    if (process.argv.includes('--strict')
        && Object.values(reports).some(report => report.summary.issueCount > 0)) process.exitCode = 1;
}

main().catch(async error => {
    console.error(error);
    try { await pool.end(); } catch {}
    process.exitCode = 1;
});

module.exports = { selectedSeries };
