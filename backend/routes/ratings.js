const express = require('express');
const { pool, sendError } = require('../route-helpers');
const { ensureRatingsSchema } = require('../ratings');
const { MODEL_VERSION, START_RATING } = require('../rating-engine');
const { uncertaintyAtDate } = require('../rating-engine');
const { JOINT_MODEL_VERSION, jointConfiguration } = require('../joint-rating-model');
const { WEC_MODEL_VERSION } = require('../wec-rating-model');
const { displayedUncertainty, evidenceThresholds, modelConfiguration, uncertaintyLabel } = require('../rating-presentation');
const { seriesPrefix } = require('../series-config');

const router = express.Router();
const SERIES = new Set(['f1', 'f2', 'f3', 'academy', 'fe', 'wec']);
const WEC_CLASS_SCOPES = new Set(['top', 'lmp2', 'gt-pro', 'gt', 'other']);

function ratingSource(req, series) {
    if (series === 'f1' && req.query.model === 'team-adjusted') return {
        key: 'team-adjusted', label: 'Team-adjusted beta', beta: true,
        table: 'app_joint_rating_events', version: JOINT_MODEL_VERSION
    };
    if (series === 'wec') return { key: 'wec-crew', label: 'WEC crew performance', beta: false,
        table: 'app_driver_rating_events', version: WEC_MODEL_VERSION };
    return { key: 'competitive', label: 'Competitive rating', beta: false,
        table: 'app_driver_rating_events', version: MODEL_VERSION };
}

function classScopeFrom(req, series) {
    if (series !== 'wec') return '';
    const value = String(req.query.class || '').toLowerCase();
    return WEC_CLASS_SCOPES.has(value) ? value : 'top';
}

function sourceConfiguration(run, source) {
    if (!source.beta) return modelConfiguration(run);
    try {
        const stored = typeof run?.configuration === 'string' ? JSON.parse(run.configuration) : run?.configuration;
        return jointConfiguration(stored || {});
    } catch { return jointConfiguration(); }
}

function sourceUncertainty(row, asOfDate, config, source) {
    if (!source.beta) return displayedUncertainty(row, asOfDate, config);
    const driver = uncertaintyAtDate(row.driver_evidence_after, row.event_date, asOfDate, config);
    const constructor = uncertaintyAtDate(row.constructor_evidence_after, row.event_date, asOfDate, config);
    return { evidence: driver.evidence, uncertainty: Math.hypot(driver.uncertainty, constructor.uncertainty),
        driver, constructor, asOfDate };
}

function seriesFrom(req) {
    return SERIES.has(String(req.query.series || '').toLowerCase()) ? String(req.query.series).toLowerCase() : 'f1';
}

function cutoffFrom(req) {
    const date = String(req.query.date || '');
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return `${date} 23:59:59`;
    const year = Number.parseInt(req.query.year, 10);
    if (year >= 1950 && year <= 2200) return `${year}-12-31 23:59:59`;
    return '9999-12-31 23:59:59';
}

function number(value, digits = 1) {
    return Number(Number(value || 0).toFixed(digits));
}

function comparableEventTimestamp(value) {
    const text = String(value || '').trim().replace('T', ' ').replace(/Z$/i, '');
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return `${text} 00:00:00`;
    return /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(text) ? text.slice(0, 19) : '';
}

function latestSourceEventSql(series, classScope = '') {
    if (series === 'f1') return `SELECT CAST(MAX(event_date) AS CHAR) AS latest_event FROM (
        SELECT MAX(races.date) AS event_date FROM races
        JOIN races_race_results results ON results.raceId = races.id
        UNION ALL
        SELECT MAX(COALESCE(races.sprintRaceDate, races.date)) AS event_date FROM races
        JOIN races_sprint_race_results results ON results.raceId = races.id
    ) source_events`;
    if (series === 'wec') {
        const classCodes = {
            top: "'LMP1', 'HYPERCAR'", lmp2: "'LMP2'", 'gt-pro': "'LMGTE PRO'", gt: "'LMGTE AM', 'LMGT3'"
        };
        const classFilter = classCodes[classScope]
            ? `AND classes.code IN (${classCodes[classScope]})`
            : classScope === 'other' ? "AND classes.code NOT IN ('LMP1', 'HYPERCAR', 'LMP2', 'LMGTE PRO', 'LMGTE AM', 'LMGT3')" : '';
        return `SELECT CAST(MAX(events.date) AS CHAR) AS latest_event
        FROM wec_events events
        JOIN wec_sessions sessions ON sessions.eventId = events.id AND sessions.type = 'race' AND sessions.status = 'completed'
        JOIN wec_session_results results ON results.eventId = events.id AND results.sessionId = sessions.id
        JOIN wec_classes classes ON classes.id = results.classId
        WHERE events.status = 'completed' ${classFilter}`;
    }
    const prefix = seriesPrefix(series);
    return `SELECT CAST(MAX(COALESCE(sessions.startTimeUtc, races.date)) AS CHAR) AS latest_event
        FROM ${prefix}sessions sessions
        JOIN ${prefix}races races ON races.id = sessions.raceId
        JOIN ${prefix}session_results results ON results.sessionId = sessions.id
        WHERE sessions.isRace = 1 AND sessions.cancelled = 0`;
}

function requestedAsOfDate(req, selectedEvent) {
    if (selectedEvent) return selectedEvent.event_date;
    const date = String(req.query.date || '');
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return `${date} 23:59:59`;
    const year = Number.parseInt(req.query.year, 10);
    if (year >= 1950 && year <= 2200) return `${year}-12-31 23:59:59`;
    return new Date().toISOString();
}

function profileAsOfDate(req) {
    const date = String(req.query.date || '');
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return `${date} 23:59:59`;
    const year = Number.parseInt(req.query.toYear, 10);
    if (year >= 1950 && year <= 2200) {
        const endOfYear = new Date(`${year}-12-31T23:59:59Z`), now = new Date();
        return endOfYear < now ? endOfYear.toISOString() : now.toISOString();
    }
    return new Date().toISOString();
}

router.get('/api/ratings/events', async (req, res) => {
    const series = seriesFrom(req);
    const source = ratingSource(req, series);
    const classScope = classScopeFrom(req, series);
    try {
        await ensureRatingsSchema();
        const rows = await pool.query(`SELECT event_id, event_date, year, round_number, event_sequence, event_name, session_type,
                class_code, class_name, class_scope
            FROM ${source.table}
            WHERE model_version = ? AND series = ? AND (? = '' OR class_scope = ?)
            GROUP BY event_id, event_date, year, round_number, event_sequence, event_name, session_type,
                class_code, class_name, class_scope
            ORDER BY event_date, event_sequence, event_id`, [source.version, series, classScope, classScope]);
        res.set('Cache-Control', 'no-cache, max-age=0, must-revalidate');
        res.json({ modelVersion: source.version, model: source.key, modelLabel: source.label, beta: source.beta,
            series, classScope, events: rows.map(row => ({
            id: row.event_id, date: row.event_date, year: Number(row.year), round: Number(row.round_number),
            eventSequence: Number(row.event_sequence),
            name: row.event_name, sessionType: row.session_type,
            classCode: row.class_code || null, className: row.class_name || null, classScope: row.class_scope || null
        })) });
    } catch (error) { sendError(res, error); }
});

function explanation(row) {
    const change = Number(row.rating_change || 0);
    const expectedPosition = Number(row.expected_position);
    const position = Number(row.position_number);
    const wecUnclassified = row.series === 'wec' && row.position_text !== 'classified';
    const positionDifference = !wecUnclassified && Number.isFinite(position) && position > 0
        ? expectedPosition - position : null;
    const status = String(row.position_text || 'Unclassified');
    const result = wecUnclassified
        ? status.replace(/(^|-)([a-z])/g, (_, separator, letter) => `${separator ? ' ' : ''}${letter.toUpperCase()}`)
        : position > 0 ? `P${position}` : status;
    let summary = `${result} produced a ${change >= 0 ? 'gain' : 'loss'} of ${Math.abs(change).toFixed(1)} points.`;
    if (positionDifference != null && Math.abs(positionDifference) >= .5) {
        summary = `${result} was ${Math.abs(positionDifference).toFixed(1)} places ${positionDifference > 0 ? 'better' : 'lower'} than the model expected.`;
    }
    if (change > 0 && Number(row.higher_rated_beaten) > 0) {
        summary += ` ${Number(row.higher_rated_beaten)} higher-rated rival${Number(row.higher_rated_beaten) === 1 ? '' : 's'} finished behind.`;
    }
    return {
        summary, result, expectedPosition: number(expectedPosition), positionDifference: positionDifference == null ? null : number(positionDifference),
        opponentsBeaten: Number(row.opponents_beaten || 0), higherRatedBeaten: Number(row.higher_rated_beaten || 0),
        fieldStrength: number(row.field_strength), eventWeight: number(row.event_weight, 2),
        effectiveEvidence: number(row.effective_evidence, 2), completion: number(row.completion, 2),
        keyRival: row.key_rival_id ? { id: row.key_rival_id, name: row.key_rival_name,
            rating: number(row.key_rival_rating), outcome: row.key_rival_outcome } : null
    };
}

router.get('/api/ratings', async (req, res) => {
    const series = seriesFrom(req);
    const source = ratingSource(req, series);
    const classScope = classScopeFrom(req, series);
    const requestedEventId = String(req.query.event || '').slice(0, 255);
    let cutoff = cutoffFrom(req);
    let cutoffEventId = '\uffff';
    let cutoffEventSequence = 32767;
    const requestedYear = Number.parseInt(req.query.year, 10);
    let activityYear = requestedYear >= 1950 && requestedYear <= 2200 ? requestedYear : null;
    const order = req.query.order === 'peak' ? 'peak' : 'current';
    const minEvents = Math.max(1, Math.min(100, Number.parseInt(req.query.minEvents, 10) || 3));
    const limit = Math.max(10, Math.min(1000, Number.parseInt(req.query.limit, 10) || 100));
    try {
        await ensureRatingsSchema();
        let selectedEvent = null;
        if (requestedEventId) {
            const selectedRows = await pool.query(`SELECT event_id, event_date, year, event_sequence, event_name, session_type
                FROM ${source.table} WHERE model_version = ? AND series = ? AND event_id = ?
                    AND (? = '' OR class_scope = ?) LIMIT 1`,
            [source.version, series, requestedEventId, classScope, classScope]);
            if (!selectedRows.length) return res.status(400).json({ error: 'Unknown rating event.' });
            selectedEvent = selectedRows[0];
            cutoff = selectedEvent.event_date;
            cutoffEventSequence = Number(selectedEvent.event_sequence);
            cutoffEventId = selectedEvent.event_id;
            activityYear = Number(selectedEvent.year);
        }
        const [rows, years, runRows, sourceRows, ratedRows] = await Promise.all([
            pool.query(`WITH eligible AS (
                    SELECT *, ROW_NUMBER() OVER (PARTITION BY driver_id
                        ORDER BY event_date DESC, event_sequence DESC, event_id DESC) AS recent
                    FROM ${source.table}
                    WHERE model_version = ? AND series = ?
                        AND (? = '' OR class_scope = ?)
                        AND (event_date < ? OR (event_date = ? AND
                            (event_sequence < ? OR (event_sequence = ? AND event_id <= ?))))
                ), summaries AS (
                    SELECT driver_id, COUNT(*) AS event_count, MAX(rating_after) AS peak_rating
                    FROM ${source.table}
                    WHERE model_version = ? AND series = ?
                        AND (? = '' OR class_scope = ?)
                        AND (event_date < ? OR (event_date = ? AND
                            (event_sequence < ? OR (event_sequence = ? AND event_id <= ?))))
                    GROUP BY driver_id
                )
                SELECT eligible.*, summaries.event_count, summaries.peak_rating
                FROM eligible JOIN summaries ON summaries.driver_id = eligible.driver_id
                WHERE eligible.recent = 1 AND summaries.event_count >= ?
                    AND (? = 'peak' OR eligible.year = COALESCE(?, (SELECT MAX(year) FROM ${source.table}
                        WHERE model_version = ? AND series = ? AND (? = '' OR class_scope = ?))))
                ORDER BY CASE WHEN ? = 'peak' THEN summaries.peak_rating ELSE eligible.rating_after END DESC,
                    eligible.rating_after DESC, eligible.driver_name
                LIMIT ?`, [source.version, series, classScope, classScope,
                    cutoff, cutoff, cutoffEventSequence, cutoffEventSequence, cutoffEventId,
                    source.version, series, classScope, classScope,
                    cutoff, cutoff, cutoffEventSequence, cutoffEventSequence, cutoffEventId, minEvents,
                    order, activityYear, source.version, series, classScope, classScope, order, limit]),
            pool.query(`SELECT DISTINCT year FROM ${source.table}
                WHERE model_version = ? AND series = ? AND (? = '' OR class_scope = ?) ORDER BY year DESC`,
            [source.version, series, classScope, classScope]),
            pool.query('SELECT * FROM app_rating_runs WHERE model_version = ? AND series = ? LIMIT 1', [source.version, series]),
            pool.query(latestSourceEventSql(series, classScope)),
            pool.query(`SELECT CAST(MAX(event_date) AS CHAR) AS latest_event FROM ${source.table}
                WHERE model_version = ? AND series = ? AND (? = '' OR class_scope = ?)`,
            [source.version, series, classScope, classScope])
        ]);
        const run = runRows[0];
        const config = sourceConfiguration(run, source), uncertaintyAsOf = requestedAsOfDate(req, selectedEvent);
        const leaderboard = rows.map((row, index) => {
            const state = sourceUncertainty(row, uncertaintyAsOf, config, source);
            return {
                rank: index + 1, driverId: row.driver_id, driverName: row.driver_name,
                constructorName: row.constructor_name || '', rating: number(row.rating_after), previousRating: number(row.rating_before),
                classId: row.class_id || null, classCode: row.class_code || null, className: row.class_name || null,
                classScope: row.class_scope || null, entryId: row.entry_id || null, carNumber: row.car_number || null,
                manufacturerName: row.manufacturer_name || null, crewSize: Number(row.crew_size || 0),
                peakRating: number(row.peak_rating), change: number(row.rating_change), events: Number(row.event_count),
                uncertainty: number(state.uncertainty), uncertaintyLabel: uncertaintyLabel(series, state.uncertainty, state.evidence),
                evidence: number(state.evidence, 2),
                components: source.beta ? {
                    driverRating: number(row.driver_rating_after), constructorRating: number(row.constructor_rating_after),
                    driverUncertainty: number(state.driver.uncertainty), constructorUncertainty: number(state.constructor.uncertainty)
                } : null,
                ratingRange: { low: number(Number(row.rating_after) - state.uncertainty),
                    high: number(Number(row.rating_after) + state.uncertainty) },
                percentile: rows.length < 2 ? 100 : number(100 * (rows.length - index - 1) / (rows.length - 1), 0),
                lastEvent: { id: row.event_id, name: row.event_name, date: row.event_date, year: Number(row.year),
                    position: row.position_number, positionText: row.position_text, expectedPosition: number(row.expected_position),
                    sessionType: row.session_type, classCode: row.class_code || null, className: row.class_name || null,
                    classScope: row.class_scope || null, entryId: row.entry_id || null, carNumber: row.car_number || null }
            };
        });
        const latestSourceEvent = sourceRows[0]?.latest_event || null;
        const latestRatedEvent = ratedRows[0]?.latest_event || null;
        const comparableSourceEvent = comparableEventTimestamp(latestSourceEvent);
        const comparableRatedEvent = comparableEventTimestamp(latestRatedEvent);
        const ratingsCurrent = !comparableSourceEvent || Boolean(comparableRatedEvent
            && comparableRatedEvent >= comparableSourceEvent);
        res.set('Cache-Control', 'no-cache, max-age=0, must-revalidate');
        res.json({ modelVersion: source.version, model: source.key, modelLabel: source.label, beta: source.beta,
            startingRating: START_RATING, series, classScope, order, cutoff,
            uncertaintyAsOf, evidenceThresholds: evidenceThresholds(series),
            selectedEvent: selectedEvent ? { id: selectedEvent.event_id, date: selectedEvent.event_date,
                year: Number(selectedEvent.year), eventSequence: Number(selectedEvent.event_sequence),
                name: selectedEvent.event_name, sessionType: selectedEvent.session_type } : null,
            years: years.map(row => Number(row.year)), generatedAt: run?.calculated_at || null, configuration: config,
            eventCount: Number(run?.event_count || 0),
            freshness: { isCurrent: ratingsCurrent, latestSourceEvent, latestRatedEvent }, leaderboard });
    } catch (error) { sendError(res, error); }
});

router.get('/api/ratings/validation', async (req, res) => {
    const series = seriesFrom(req);
    const source = ratingSource(req, series);
    try {
        await ensureRatingsSchema();
        const rows = await pool.query(`SELECT metrics, evaluated_at
            FROM app_rating_evaluations
            WHERE model_version = ? AND series = ?
            ORDER BY evaluated_at DESC, id DESC LIMIT 1`, [source.version, series]);
        if (!rows.length) return res.json({ available: false, modelVersion: source.version, model: source.key, modelLabel: source.label });
        let metrics = {};
        try { metrics = typeof rows[0].metrics === 'string' ? JSON.parse(rows[0].metrics) : rows[0].metrics || {}; } catch {}
        res.set('Cache-Control', 'no-cache, max-age=0, must-revalidate');
        res.json({ available: true, modelVersion: source.version, model: source.key, modelLabel: source.label,
            evaluatedAt: rows[0].evaluated_at, events: metrics.events ?? metrics.selected?.events ?? null,
            accuracy: metrics.pairwise?.accuracy ?? metrics.selected?.accuracy ?? null,
            brierScore: metrics.pairwise?.brierScore ?? metrics.selected?.brier ?? null,
            positionMeanAbsoluteError: metrics.positions?.meanAbsoluteError ?? metrics.selected?.positionMAE ?? null });
    } catch (error) { sendError(res, error); }
});

router.get('/api/ratings/:driverId', async (req, res) => {
    const series = seriesFrom(req);
    const source = ratingSource(req, series);
    const classScope = classScopeFrom(req, series);
    const driverId = String(req.params.driverId || '').slice(0, 100);
    const fromYear = Math.max(1950, Number.parseInt(req.query.fromYear, 10) || 1950);
    const toYear = Math.min(2200, Number.parseInt(req.query.toYear, 10) || 2200);
    try {
        await ensureRatingsSchema();
        const [rows, runRows] = await Promise.all([pool.query(`SELECT *
            FROM ${source.table}
            WHERE model_version = ? AND series = ? AND driver_id = ? AND year BETWEEN ? AND ?
                AND (? = '' OR class_scope = ?)
            ORDER BY event_date, event_sequence, event_id`,
        [source.version, series, driverId, fromYear, toYear, classScope, classScope]),
        pool.query('SELECT * FROM app_rating_runs WHERE model_version = ? AND series = ? LIMIT 1', [source.version, series])]);
        if (!rows.length) return res.status(404).json({ error: 'Driver rating history not found.' });
        const timeline = rows.map(row => ({
            eventId: row.event_id, date: row.event_date, year: Number(row.year), round: row.round_number,
            eventSequence: Number(row.event_sequence),
            eventName: row.event_name, sessionType: row.session_type, constructorName: row.constructor_name || '',
            classId: row.class_id || null, classCode: row.class_code || null, className: row.class_name || null,
            classScope: row.class_scope || null, entryId: row.entry_id || null, carNumber: row.car_number || null,
            manufacturerName: row.manufacturer_name || null, crewSize: Number(row.crew_size || 0),
            position: row.position_number, positionText: row.position_text, ratingBefore: number(row.rating_before),
            rating: number(row.rating_after), change: number(row.rating_change), expectedScore: number(row.expected_score, 3),
            actualScore: number(row.actual_score, 3), expectedPosition: number(row.expected_position),
            fieldSize: Number(row.field_size), completion: number(row.completion, 3),
            uncertaintyBefore: number(row.uncertainty_before), uncertainty: number(row.uncertainty_after),
            evidenceBefore: number(row.evidence_before, 2), evidence: number(row.evidence_after, 2),
            components: source.beta ? { driverRating: number(row.driver_rating_after),
                constructorRating: number(row.constructor_rating_after),
                driverUncertainty: number(row.driver_uncertainty_after),
                constructorUncertainty: number(row.constructor_uncertainty_after) } : null,
            uncertaintyLabel: uncertaintyLabel(series, row.uncertainty_after, row.evidence_after),
            ratingRange: { low: number(Number(row.rating_after) - Number(row.uncertainty_after)),
                high: number(Number(row.rating_after) + Number(row.uncertainty_after)) },
            explanation: explanation(row)
        }));
        const config = sourceConfiguration(runRows[0], source), uncertaintyAsOf = profileAsOfDate(req);
        const latestRow = rows.at(-1), currentState = sourceUncertainty(latestRow, uncertaintyAsOf, config, source);
        const currentRating = timeline.at(-1).rating;
        const currentRange = { low: number(currentRating - currentState.uncertainty),
            high: number(currentRating + currentState.uncertainty) };
        res.set('Cache-Control', 'no-cache, max-age=0, must-revalidate');
        res.json({ modelVersion: source.version, model: source.key, modelLabel: source.label, beta: source.beta,
            series, classScope, driver: { id: driverId, name: rows[0].driver_name },
            uncertaintyAsOf, evidenceThresholds: evidenceThresholds(series), configuration: config,
            summary: { events: timeline.length, currentRating,
                peakRating: Math.max(...timeline.map(event => event.rating)),
                uncertainty: number(currentState.uncertainty),
                uncertaintyLabel: uncertaintyLabel(series, currentState.uncertainty, currentState.evidence),
                evidence: number(currentState.evidence, 2), ratingRange: currentRange }, timeline });
    } catch (error) { sendError(res, error); }
});

module.exports = router;
module.exports.ratingSource = ratingSource;
module.exports.seriesFrom = seriesFrom;
module.exports.latestSourceEventSql = latestSourceEventSql;
module.exports.comparableEventTimestamp = comparableEventTimestamp;
module.exports.classScopeFrom = classScopeFrom;
module.exports.explanation = explanation;
