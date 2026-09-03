const { fromPath } = require('../frontend/js/series-config');

function renderSeasonAnalysisHtml(html, pathname) {
    const series = fromPath(pathname);
    if (series.key === 'f1') return html;
    return html
        .replace('<body>', `<body class="${series.modeClass}">`)
        .replace('/assets/favicon.svg', series.favicon)
        .replaceAll('Formula 1', series.name)
        .replace('FORMULA 1 · SEASON', `${series.name.toUpperCase()} · SEASON`)
        .replace('Tap or focus a round for all selected drivers.', 'Tap or focus a race session for all selected drivers.')
        .replace('Gaps indicate rounds with no recorded data.', 'Gaps indicate cancelled sessions or missing results.')
        .replace('after each recorded round.', 'after each recorded race session.')
        .replace('including sprint points. Uses official standings', 'including recorded bonus points. Uses the season standings')
        .replace('Full field · Grand Prix classifications', 'Full field · Every race session')
        .replace('Points colours use actual race points awarded, not today’s top-ten rule. Tap or focus a cell for race details and sprint points.', 'Points colours use the recorded session points, including bonuses. Tap or focus a cell for details. Cancelled races and missing results are shown separately.')
        .replace('Means use available positive numeric race and qualifying positions; unclassified results are excluded. Finish spread is the population standard deviation (lower is more consistent, at any finishing level). Retirement rate is recorded retirements ÷ starts, excluding DNS/DNQ/withdrawals. Samples differ; compare them before drawing conclusions. Sprints are excluded.',
            `Means use classified positions, with ${series.key === 'academy' ? 'reverse-grid and standard races' : 'sprint and feature races'} shown separately. Each mean includes its sample size. Finish spread is the population standard deviation across all classified races. Unclassified rate excludes DNS/DNQ/withdrawals and includes disqualifications; it is not a retirement rate.`);
}

module.exports = { renderSeasonAnalysisHtml };
