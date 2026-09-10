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

function renderExampleGroup(label, examples) {
    return `<section class="ask-example-group" aria-label="${esc(label)}"><strong>${esc(label)}</strong><div class="ask-example-list">
                ${examples.map(([question, title]) => `<button type="button" data-ask-example="${esc(question)}">${esc(title)}</button>`).join('\n                ')}
              </div></section>`;
}

function renderJuniorExampleGroups(examples) {
    return `<div class="ask-example-groups">
              ${renderExampleGroup('Records', examples.slice(0, 4))}
              ${renderExampleGroup('People & places', examples.slice(4, 6))}
              ${renderExampleGroup('Race formats', examples.slice(6))}
            </div>`;
}

function renderAskHtml(pathname) {
    const series = fromPath(pathname);
    const html = fs.readFileSync(path.join(__dirname, '../frontend/ask.html'), 'utf8');
    if (series.key === 'f1') return html;
    const examples = renderJuniorExampleGroups(EXAMPLES[series.key]);
    return html
        .replace('<meta name="description" content="Ask a Formula 1 history question and let Racelytic calculate the answer from its archive.">', `<meta name="description" content="Ask a ${esc(series.name)} history question and let Racelytic calculate the answer from its archive.">`)
        .replace('/assets/favicon.svg', series.favicon)
        .replace('<body class="ask-page">', `<body class="ask-page ${esc(series.modeClass)}" data-ask-series="${esc(series.key)}">`)
        .replace('Describe the Formula 1 history you want to recalculate or compare. Racelytic interprets the question, then explains the answer from recorded results.', `Ask about ${esc(series.name)} records and Racelytic will explain the answer from the recorded results.`)
        .replace('placeholder="Ask a Formula 1 history question…"', `placeholder="Ask a ${esc(series.name)} history question…"`)
        .replace(/<!-- ask-examples:start -->[\s\S]*?<!-- ask-examples:end -->/, `<!-- ask-examples:start -->\n            ${examples}\n            <!-- ask-examples:end -->`)
        .replace('One question, every completed season.', `One question, the full ${esc(series.shortName)} archive.`)
        .replace('Ask for archive records, or recalculate Formula 1 Drivers’ or Constructors’ Championships under historical points systems.', `Explore driver and team records across every season available in Racelytic.`);
}

module.exports = { EXAMPLES, renderAskHtml };
