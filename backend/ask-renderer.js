const fs = require('node:fs');
const path = require('node:path');
const { fromPath } = require('../frontend/js/series-config');

const EXAMPLES = Object.freeze({
    f2: [
        ['Who has the most Formula 2 race wins?', 'Race win leaders'],
        ['Which driver has the most pole positions with ART Grand Prix?', 'ART pole leaders'],
        ['How many wins does Charles Leclerc have?', 'Leclerc wins'],
        ['Who has the most Formula 2 championships?', 'Championship leaders'],
        ['Who has the most race wins at Monaco?', 'Monaco win leaders'],
        ['Which British driver has the most podiums?', 'British podium leaders'],
        ['Who has the most race wins in sprint races only?', 'Sprint win leaders']
    ],
    f3: [
        ['Who has the most Formula 3 race wins?', 'Race win leaders'],
        ['Which driver has the most pole positions with PREMA Racing?', 'PREMA pole leaders'],
        ['How many wins does Oscar Piastri have?', 'Piastri wins'],
        ['Who has the most Formula 3 championships?', 'Championship leaders'],
        ['Who has the most race wins at Monza?', 'Monza win leaders'],
        ['Which British driver has the most podiums?', 'British podium leaders'],
        ['Who has the most race wins in sprint races only?', 'Sprint win leaders']
    ],
    academy: [
        ['Who has the most F1 Academy race wins?', 'Race win leaders'],
        ['Which driver has the most pole positions with PREMA Racing?', 'PREMA pole leaders'],
        ['How many wins does Abbi Pulling have?', 'Pulling wins'],
        ['Who has the most F1 Academy championships?', 'Championship leaders'],
        ['Who has the most race wins at Zandvoort?', 'Zandvoort win leaders'],
        ['Which British driver has the most podiums?', 'British podium leaders'],
        ['Who has the most race wins in reverse-grid races only?', 'Reverse-grid wins']
    ]
});

function esc(value) {
    return String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

function renderAskHtml(pathname) {
    const series = fromPath(pathname);
    const html = fs.readFileSync(path.join(__dirname, '../frontend/ask.html'), 'utf8');
    if (series.key === 'f1') return html;
    const examples = EXAMPLES[series.key].map(([question, label]) =>
        `<button type="button" data-ask-example="${esc(question)}">${esc(label)}</button>`).join('\n          ');
    return html
        .replace('<meta name="description" content="Ask a Formula 1 history question and let Racelytic calculate the answer from its archive.">', `<meta name="description" content="Ask a ${esc(series.name)} history question and let Racelytic calculate the answer from its archive.">`)
        .replace('/assets/favicon.svg', series.favicon)
        .replace('<body class="ask-page">', `<body class="ask-page ${esc(series.modeClass)}" data-ask-series="${esc(series.key)}">`)
        .replace('Describe the Formula 1 history you want to recalculate or compare. Racelytic interprets the question, then explains the answer from recorded results.', `Ask about ${esc(series.name)} records and Racelytic will explain the answer from the recorded results.`)
        .replace('placeholder="Ask a Formula 1 history question…"', `placeholder="Ask a ${esc(series.name)} history question…"`)
        .replace(/<button type="button" data-ask-example="Who has the most Formula 1 race wins\?">[\s\S]*?<button type="button" data-ask-example="Which constructor would have the most championships using the 1991 points system\?">Constructor titles<\/button>/, examples)
        .replace('<strong>One question, every completed season.</strong><p>Recalculate or compare Formula 1 Drivers’ or Constructors’ Championships under official historical points systems.</p>', `<strong>One question, the full ${esc(series.shortName)} archive.</strong><p>Explore driver and team records across every season available in Racelytic.</p>`);
}

module.exports = { EXAMPLES, renderAskHtml };
