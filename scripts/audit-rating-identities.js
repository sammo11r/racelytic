const pool = require('../backend/db');
const { loadRatingEvents } = require('../backend/rating-data');
const { auditRatingIdentities } = require('../backend/rating-identity-audit');

async function main() {
    const connection = await pool.getConnection();
    try {
        const events = {};
        for (const series of ['f1', 'f2', 'f3', 'academy']) events[series] = await loadRatingEvents(connection, series);
        const report = auditRatingIdentities(events);
        if (process.argv.includes('--summary')) {
            console.table(Object.entries(report.series).map(([series, item]) => ({
                series: series.toUpperCase(), events: item.events, drivers: item.drivers,
                constructors: item.constructors, missingTeamIds: item.missingConstructorId,
                nameCollisions: item.driverNameCollisions.length + item.constructorNameCollisions.length,
                components: item.graph.components, largestDriverShare: item.graph.largestDriverShare,
                transferDrivers: item.graph.transferDrivers, issues: item.issueCount
            })));
            console.log(`Cross-series driver names: ${report.crossSeries.matchedNames} matched, ${report.crossSeries.linkedNames} linked, ${report.crossSeries.unlinkedNames.length} unlinked.`);
        } else console.log(JSON.stringify(report, null, 2));
        if (process.argv.includes('--strict') && report.issueCount) process.exitCode = 1;
    } finally {
        connection.release();
        await pool.end();
    }
}

main().catch(async error => {
    console.error(error);
    try { await pool.end(); } catch {}
    process.exitCode = 1;
});

module.exports = { main };
