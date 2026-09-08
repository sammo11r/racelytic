const { configuration, uncertaintyAtDate } = require('./rating-engine');

const EVIDENCE_THRESHOLDS = Object.freeze({
    f1: Object.freeze({ measured: 10, stable: 50 }),
    f2: Object.freeze({ measured: 8, stable: 30 }),
    f3: Object.freeze({ measured: 8, stable: 24 }),
    academy: Object.freeze({ measured: 6, stable: 16 })
});

function evidenceThresholds(series) {
    return EVIDENCE_THRESHOLDS[String(series || '').toLowerCase()] || EVIDENCE_THRESHOLDS.f1;
}

function uncertaintyLabel(series, value, evidence) {
    const usefulEvidence = Number(evidence), thresholds = evidenceThresholds(series);
    if (Number.isFinite(usefulEvidence)) {
        if (usefulEvidence >= thresholds.stable) return 'Stable';
        if (usefulEvidence >= thresholds.measured) return 'Measured';
        return 'Provisional';
    }
    const uncertainty = Number(value);
    if (!Number.isFinite(uncertainty)) return 'Unknown';
    if (uncertainty <= 72) return 'Stable';
    if (uncertainty <= 110) return 'Measured';
    return 'Provisional';
}

function modelConfiguration(run) {
    try {
        const stored = run?.configuration;
        const parsed = typeof stored === 'string' ? JSON.parse(stored) : (stored || {});
        return configuration(parsed);
    }
    catch { return configuration(); }
}

function displayedUncertainty(row, asOfDate, config) {
    return uncertaintyAtDate(Number(row.evidence_after), row.event_date, asOfDate, config);
}

module.exports = { displayedUncertainty, EVIDENCE_THRESHOLDS, evidenceThresholds, modelConfiguration, uncertaintyLabel };
