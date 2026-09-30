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
    ],
    fe: [
        ['Who has the most Formula E race wins?', 'Race win leaders'],
        ['Which driver has the most Formula E podiums?', 'Podium leaders'],
        ['How many wins does Sébastien Buemi have?', 'Buemi wins'],
        ['Who has the most Formula E championships?', 'Championship leaders'],
        ['Who won the 2024 Monaco E-Prix?', '2024 Monaco winner'],
        ['Show the 2025 Formula E driver standings', '2025 standings'],
        ['Compare Pascal Wehrlein and Mitch Evans', 'Compare drivers']
    ],
    wec: [
        ['Who has the most WEC overall wins?', 'Overall win leaders'],
        ['Who has the most WEC Hypercar class wins?', 'Hypercar win leaders'],
        ['How many WEC overall wins does Toyota Gazoo Racing have?', 'Toyota wins'],
        ['Who won the 2025 Le Mans race overall?', '2025 Le Mans winner'],
        ['Show the 2025 Le Mans Hypercar podium', 'Le Mans Hypercar podium'],
        ['Show the 2025 Hypercar driver standings', 'Hypercar standings'],
        ['Who has the most WEC LMP2 podiums since 2018?', 'LMP2 podium leaders'],
        ['Where was the first WEC race of 2025 held?', '2025 opening race']
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

function renderExpandedExampleGroups(series, examples) {
    if (series === 'fe') return `<div class="ask-example-groups">
      ${renderExampleGroup('Records', examples.slice(0, 4))}
      ${renderExampleGroup('Race and standings', examples.slice(4, 6))}
      ${renderExampleGroup('Compare', examples.slice(6))}
    </div>`;
    if (series === 'wec') return `<div class="ask-example-groups">
      ${renderExampleGroup('Overall and class records', examples.slice(0, 3))}
      ${renderExampleGroup('Race results', examples.slice(3, 5))}
      ${renderExampleGroup('Class standings', examples.slice(5, 7))}
      ${renderExampleGroup('Archive chronology', examples.slice(7))}
    </div>`;
    return renderJuniorExampleGroups(examples);
}

function renderAskHtml(pathname) {
    const series = fromPath(pathname);
    const html = fs.readFileSync(path.join(__dirname, '../frontend/ask.html'), 'utf8');
    if (series.key === 'f1') return html;
    const examples = renderExpandedExampleGroups(series.key, EXAMPLES[series.key]);
    let rendered = html
        .replace('<meta name="description" content="Ask a Formula 1 history question and let Racelytic calculate the answer from its archive.">', `<meta name="description" content="Ask a ${esc(series.name)} history question and let Racelytic calculate the answer from its archive.">`)
        .replace('/assets/favicon.svg', series.favicon)
        .replace('<body class="ask-page">', `<body class="ask-page ${esc(series.modeClass)}" data-ask-series="${esc(series.key)}">`)
        .replace('Ask the Formula 1 archive. Follow up to explore the evidence.', `Ask the ${esc(series.name)} archive. Follow up to explore the evidence.`)
        .replace('placeholder="Ask a Formula 1 history question…"', `placeholder="Ask a ${esc(series.name)} history question…"`)
        .replace(/<!-- ask-examples:start -->[\s\S]*?<!-- ask-examples:end -->/, `<!-- ask-examples:start -->\n            ${examples}\n            <!-- ask-examples:end -->`)
        .replace('Start a conversation with the archive.', `Start a conversation with the ${esc(series.shortName)} archive.`)
        .replace('Ask for a race result, a record, or a championship calculation. The answer and its evidence will appear here.', `Ask for a race result, a record, or a championship calculation in ${esc(series.name)}. The answer and its evidence will appear here.`);
    if (series.key === 'wec') {
        rendered = rendered
            .replace(/<details class="ask-question-help" id="ask-question-help">[\s\S]*?<\/details>/, `<details class="ask-question-help" id="ask-question-help"><summary aria-label="Show supported question types"><span class="ask-question-mark" aria-hidden="true">?</span><span>Supported questions</span></summary><div class="ask-question-menu" role="region" aria-label="Supported question types" tabindex="0"><header><strong>What can I ask?</strong><p>WEC answers use recorded race classifications and official standings.</p></header><section><h2>Calculated WEC questions</h2><ul><li><strong>Overall or class records</strong><span>Rank drivers and teams by wins, podiums, or starts.</span></li><li><strong>Race results</strong><span>Look up an overall or class winner, podium, or classification.</span></li><li><strong>Championship standings</strong><span>Choose a season, class, and driver or team table.</span></li><li><strong>Follow-up filters</strong><span>Narrow the previous answer by season or class.</span></li></ul></section></div></details>`)
            .replace('Ask for a race result, a record, or a championship calculation in World Endurance Championship. The answer and its evidence will appear here.', 'Ask for an overall or class result, a record, or championship standings. The answer and its evidence will appear here.');
    }
    return rendered;
}

module.exports = { EXAMPLES, renderAskHtml };
