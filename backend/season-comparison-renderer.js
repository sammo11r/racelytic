const { fromPath } = require('../frontend/js/series-config');

function renderSeasonComparisonHtml(html, pathname) {
    const series = fromPath(pathname);
    if (series.key === 'f1') return html;
    const types = series.key === 'academy' ? 'reverse-grid and standard races' : 'sprint and feature races';
    return html
        .replace('<body>', `<body class="${series.modeClass}">`)
        .replace('/assets/favicon.svg', series.favicon)
        .replaceAll('Formula 1', series.name)
        .replace('FORMULA 1 · SEASON', `${series.name.toUpperCase()} · SEASON`)
        .replace('Through the same round', 'Through the same weekend')
        .replace('Through round<select', 'Through weekend<select')
        .replace('Historical dropped scores are applied consistently.', 'Every race session and its recorded bonus points are included; cancelled sessions remain gaps.')
        .replace('Lead after each round', 'Lead after each race session')
        .replace('Each season is a separate field, not a driver-to-driver matchup. Means exclude non-classified positions; sample counts are shown beneath each average. Lower spread means more consistent classified finishes. Sort a column to sort both seasons.',
            `Each season is a separate field, not a driver-to-driver matchup. Average finishes are split between ${types}, excluding unclassified results, with sample counts beneath each average. Spread covers all classified races; lower means more consistent finishes. Sort a column to sort both seasons.`)
        .replace('Race measures include Grands Prix only; points include sprint points. Retirement rate is recorded retirements divided by starts, excluding DNS, DNQ, withdrawals and disqualifications from the retirement count. Disqualifications still count as starts. NC alone is not treated as a retirement. Missing results are not zero-performance evidence.',
            `Race measures include all ${types}; points include recorded bonuses. Unclassified rate is unclassified results divided by starts, excluding DNS, DNQ and withdrawals. It includes disqualifications and is not a retirement rate. Cancelled races are excluded from race counts. Missing results are not zero-performance evidence.`)
        .replace('Through-the-same-round comparisons use a continuous run of recorded Grands Prix in both seasons.',
            'Through-the-same-weekend comparisons use a continuous run of fully recorded weekends in both seasons, allowing for cancelled sessions. The same number of weekends can contain different numbers of races. Missing schedules or results stop the shared cutoff.')
        .replace('Historical shared-drive records and retrospective adjustments can produce differences, listed above.', 'Retrospective adjustments or incomplete points records can produce differences, listed above.');
}

module.exports = { renderSeasonComparisonHtml };
