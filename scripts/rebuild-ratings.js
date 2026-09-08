const pool = require('../backend/db');
const { loadRatingEvents } = require('../backend/rating-data');
const { calculateRatings, DEFAULT_CONFIGURATION, MODEL_VERSION } = require('../backend/rating-engine');
const { configuredEvents } = require('../backend/rating-calibration');
const { calculateJointRatings, F1_JOINT_CONFIGURATION, JOINT_MODEL_VERSION } = require('../backend/joint-rating-model');
const { ensureRatingsSchema } = require('../backend/ratings');

const VALID_SERIES = ['f1', 'f2', 'f3', 'academy'];
const requested = process.argv.find(argument => argument.startsWith('--series='))?.split('=')[1];
const dryRun = process.argv.includes('--dry-run');

function insertSql(count) {
    const row = `(${Array(35).fill('?').join(',')})`;
    return `INSERT INTO app_driver_rating_events
        (model_version, series, event_id, event_date, year, round_number, event_sequence, event_name, session_type,
         driver_id, driver_name, constructor_name, position_number, position_text, rating_before,
         rating_after, rating_change, expected_score, actual_score, expected_position, field_size, completion,
         event_weight, field_strength, effective_evidence, uncertainty_before, uncertainty_after,
         evidence_before, evidence_after,
         opponents_beaten, higher_rated_beaten, key_rival_id, key_rival_name, key_rival_rating, key_rival_outcome)
        VALUES ${Array(count).fill(row).join(',')}`;
}

function values(row) {
    return [row.modelVersion, row.series, row.eventId, row.eventDate, row.year, row.round, row.eventSequence,
        row.eventName, row.sessionType, row.driverId, row.driverName, row.constructorName,
        row.positionNumber, row.positionText, row.ratingBefore, row.ratingAfter, row.ratingChange,
        row.expectedScore, row.actualScore, row.expectedPosition, row.fieldSize, row.completion,
        row.eventWeight, row.fieldStrength, row.effectiveEvidence, row.uncertaintyBefore, row.uncertaintyAfter,
        row.evidenceBefore, row.evidenceAfter,
        row.opponentsBeaten, row.higherRatedBeaten, row.keyRivalId, row.keyRivalName, row.keyRivalRating, row.keyRivalOutcome];
}

const JOINT_COLUMNS = ['model_version', 'series', 'event_id', 'event_date', 'year', 'round_number', 'event_sequence',
    'event_name', 'session_type', 'driver_id', 'driver_name', 'constructor_id', 'constructor_name', 'position_number',
    'position_text', 'rating_before', 'rating_after', 'rating_change', 'driver_rating_before', 'driver_rating_after',
    'driver_rating_change', 'constructor_rating_before', 'constructor_rating_after', 'constructor_rating_change',
    'expected_score', 'actual_score', 'expected_position', 'field_size', 'completion', 'event_weight', 'field_strength',
    'effective_evidence', 'uncertainty_before', 'uncertainty_after', 'evidence_before', 'evidence_after',
    'driver_uncertainty_before', 'driver_uncertainty_after', 'driver_evidence_before', 'driver_evidence_after',
    'constructor_uncertainty_before', 'constructor_uncertainty_after', 'constructor_evidence_before', 'constructor_evidence_after'];

function jointInsertSql(count) {
    const row = `(${Array(JOINT_COLUMNS.length).fill('?').join(',')})`;
    return `INSERT INTO app_joint_rating_events (${JOINT_COLUMNS.join(',')}) VALUES ${Array(count).fill(row).join(',')}`;
}

function jointValues(row) {
    return [row.modelVersion, row.series, row.eventId, row.eventDate, row.year, row.round, row.eventSequence,
        row.eventName, row.sessionType, row.driverId, row.driverName, row.constructorId, row.constructorName,
        row.positionNumber, row.positionText, row.ratingBefore, row.ratingAfter, row.ratingChange,
        row.driverRatingBefore, row.driverRatingAfter, row.driverRatingChange, row.constructorRatingBefore,
        row.constructorRatingAfter, row.constructorRatingChange, row.expectedScore, row.actualScore,
        row.expectedPosition, row.fieldSize, row.completion, row.eventWeight, row.fieldStrength, row.effectiveEvidence,
        row.uncertaintyBefore, row.uncertaintyAfter, row.evidenceBefore, row.evidenceAfter,
        row.driverUncertaintyBefore, row.driverUncertaintyAfter, row.driverEvidenceBefore, row.driverEvidenceAfter,
        row.constructorUncertaintyBefore, row.constructorUncertaintyAfter,
        row.constructorEvidenceBefore, row.constructorEvidenceAfter];
}

async function rebuild(series, connection) {
    const events = await loadRatingEvents(connection, series);
    const result = calculateRatings(configuredEvents(events, DEFAULT_CONFIGURATION), DEFAULT_CONFIGURATION);
    console.log(`${series.toUpperCase()}: ${events.length} events, ${result.rows.length} rating rows`);
    if (dryRun) return;

    await connection.beginTransaction();
    try {
        await connection.query('DELETE FROM app_driver_rating_events WHERE model_version = ? AND series = ?', [MODEL_VERSION, series]);
        for (let offset = 0; offset < result.rows.length; offset += 200) {
            const batch = result.rows.slice(offset, offset + 200);
            await connection.query(insertSql(batch.length), batch.flatMap(values));
        }
        await connection.query(`INSERT INTO app_rating_runs
            (model_version, series, event_count, rating_row_count, configuration, calculated_at)
            VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON DUPLICATE KEY UPDATE event_count = VALUES(event_count), rating_row_count = VALUES(rating_row_count),
                configuration = VALUES(configuration), calculated_at = CURRENT_TIMESTAMP`,
            [MODEL_VERSION, series, events.length, result.rows.length, JSON.stringify(result.configuration)]);
        await connection.commit();
    } catch (error) {
        await connection.rollback();
        throw error;
    }
}

async function rebuildJointF1(connection) {
    const events = await loadRatingEvents(connection, 'f1');
    const result = calculateJointRatings(configuredEvents(events, DEFAULT_CONFIGURATION), F1_JOINT_CONFIGURATION);
    console.log(`F1 team-adjusted beta: ${events.length} events, ${result.rows.length} rating rows`);
    if (dryRun) return;
    await connection.beginTransaction();
    try {
        await connection.query('DELETE FROM app_joint_rating_events WHERE model_version = ? AND series = ?',
            [JOINT_MODEL_VERSION, 'f1']);
        for (let offset = 0; offset < result.rows.length; offset += 200) {
            const batch = result.rows.slice(offset, offset + 200);
            await connection.query(jointInsertSql(batch.length), batch.flatMap(jointValues));
        }
        await connection.query(`INSERT INTO app_rating_runs
            (model_version, series, event_count, rating_row_count, configuration, calculated_at)
            VALUES (?, 'f1', ?, ?, ?, CURRENT_TIMESTAMP)
            ON DUPLICATE KEY UPDATE event_count = VALUES(event_count), rating_row_count = VALUES(rating_row_count),
                configuration = VALUES(configuration), calculated_at = CURRENT_TIMESTAMP`,
            [JOINT_MODEL_VERSION, events.length, result.rows.length, JSON.stringify(result.configuration)]);
        await connection.commit();
    } catch (error) {
        await connection.rollback();
        throw error;
    }
}

async function main() {
    if (requested && !VALID_SERIES.includes(requested)) throw new Error(`Unknown series: ${requested}`);
    await ensureRatingsSchema();
    const connection = await pool.getConnection();
    try {
        for (const series of requested ? [requested] : VALID_SERIES) {
            await rebuild(series, connection);
            if (series === 'f1') await rebuildJointF1(connection);
        }
    } finally {
        connection.release();
        await pool.end();
    }
    console.log(dryRun ? 'Dry run complete; no ratings were written.'
        : `Ratings rebuilt with ${MODEL_VERSION}; F1 team-adjusted beta uses ${JOINT_MODEL_VERSION}.`);
}

if (require.main === module) main().catch(async error => {
    console.error(error);
    try { await pool.end(); } catch {}
    process.exitCode = 1;
});

module.exports = { JOINT_COLUMNS, jointInsertSql, jointValues, rebuild, rebuildJointF1 };
