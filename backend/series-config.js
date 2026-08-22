const JUNIOR_SERIES = Object.freeze(['f2', 'f3', 'academy']);

function academySessionType(session, sessionIndex, sessionCount, year) {
    const name = String(session.name || '').toLowerCase();
    if (name.includes('reverse')) return 'S';
    if (name.includes('feature') || name.includes('opening')) return 'F';
    if (Number(year) === 2023 && sessionCount === 3 && sessionIndex === 1) return 'S';
    if (Number(year) === 2025 && ((sessionCount === 2 && sessionIndex === 0) || (sessionCount === 3 && sessionIndex === 1))) return 'S';
    return 'F';
}

function normaliseSeries(value) {
    const series = String(value || '').toLowerCase();
    return ['f1', ...JUNIOR_SERIES].includes(series) ? series : 'f1';
}

function isJuniorSeries(value) {
    return JUNIOR_SERIES.includes(String(value || '').toLowerCase());
}

function seriesPrefix(value) {
    const series = String(value || '').toLowerCase();
    if (series === 'academy') return 'fa_';
    return isJuniorSeries(series) ? `${series}_` : '';
}

function minimumSeasonYear(value) {
    const series = String(value || '').toLowerCase();
    if (series === 'academy') return 2023;
    if (series === 'f3') return 2019;
    if (series === 'f2') return 2017;
    return 1950;
}

module.exports = { JUNIOR_SERIES, academySessionType, isJuniorSeries, minimumSeasonYear, normaliseSeries, seriesPrefix };
