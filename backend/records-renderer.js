const fs = require('node:fs');
const path = require('node:path');
const { fromPath } = require('../frontend/js/series-config');
const { minimumSeasonYear } = require('./series-config');

function renderRecordsHtml(pathname) {
    const series = fromPath(pathname);
    const html = fs.readFileSync(path.join(__dirname, '../frontend/templates/f1-records.html'), 'utf8');
    if (series.key === 'f1') return html;
    const team = series.entity === 'team';
    return html.replace('<body>', `<body class="${series.modeClass}">`)
        .replace('/assets/favicon.svg', series.favicon)
        .replaceAll('F1 Records', `${series.shortName} Records`)
        .replace('FORMULA 1 · RECORD BOOK', `${series.name.toUpperCase()} · RECORD BOOK`)
        .replaceAll('min="1950"', `min="${minimumSeasonYear(series.key)}"`)
        .replace('placeholder="1950"', `placeholder="${minimumSeasonYear(series.key)}"`)
        .replace('<option value="2000">2000–present</option>', '')
        .replace('Last 10 seasons', 'Last 3 seasons')
        .replace('Rank drivers or constructors', team ? 'Rank drivers or teams' : 'Rank drivers or constructors')
        .replace('>Constructors</button>', team ? '>Teams</button>' : '>Constructors</button>')
        .replace('for="fr-constructor">Constructor', `for="fr-constructor">${team ? 'Team' : 'Constructor'}`)
        .replaceAll('All constructors', team ? 'All teams' : 'All constructors')
        .replaceAll('Show constructors', team ? 'Show teams' : 'Show constructors')
        .replace('aria-label="Constructors"', `aria-label="${team ? 'Teams' : 'Constructors'}"`)
        .replace('<label id="fr-sprints-label"', '<label id="fr-format-label">Race format<select id="fr-format"><option value="all">All race formats</option><option value="F">' + (series.key === 'academy' ? 'Standard races' : 'Feature races') + '</option><option value="S">' + (series.key === 'academy' ? 'Reverse-grid races' : 'Sprint races') + '</option></select></label><label id="fr-sprints-label"')
        .replace('Source: <a href="https://github.com/f1db/f1db">F1DB</a>, as imported into Racelytic. Includes Indianapolis 500 races that counted towards the World Championship. Figures reflect the available archive.', `Source: the imported ${series.name} results archive, from ${minimumSeasonYear(series.key)} onwards. Figures reflect the available archive.`);
}

module.exports = { renderRecordsHtml };
