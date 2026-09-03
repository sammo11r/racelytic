const fs = require('node:fs');
const path = require('node:path');
const { fromPath } = require('../frontend/js/series-config');

function renderCircuitAnalysisHtml(html, pathname) {
    const series = fromPath(pathname);
    const template = fs.readFileSync(path.join(__dirname, '../frontend/templates/f1-circuit-analysis.html'), 'utf8');
    if (series.key === 'f1') return template;
    const formats = series.key === 'academy' ? 'standard and reverse-grid races' : 'feature and sprint races';
    const start = { f2: 2017, f3: 2019, academy: 2023 }[series.key];
    const periods = series.key === 'academy' ? '<option value="2023-2024">2023–2024</option><option value="2025-9999">2025–present</option>'
        : `<option value="${start}-2019">${start === 2019 ? '2019' : '2017–2019'}</option><option value="2020-9999">2020–present</option>`;
    return template
        .replace('<body>', `<body class="${series.modeClass}">`)
        .replace('/assets/favicon.svg', series.favicon)
        .replace('FORMULA 1 · CIRCUIT ANALYSIS', `${series.name.toUpperCase()} · CIRCUIT ANALYSIS`)
        .replaceAll('min="1950"', `min="${start}"`)
        .replace(/<select id="ca-era">[\s\S]*?<\/select>/, `<select id="ca-era"><option value="all">All years</option>${periods}<option value="custom">Custom years</option></select>`)
        .replace('Margins &amp; pole conversion', 'Margins &amp; grid P1 conversion')
        .replace('Driver starts count Grands Prix started. Team starts count Grands Prix with a starter;', 'Driver starts count race sessions started. Team starts count race sessions with a starter;')
        .replace(' Historical shared drives can contribute multiple driver results.', '')
        .replace('Grands Prix only; sprint races are excluded.', `Includes completed ${formats}; cancelled sessions are excluded. Each race session counts separately. Use the race-format filter to compare like formats.`)
        .replace('Pole conversion uses races with a recorded pole starter.', 'Grid P1 conversion uses races with a known P1 starter, including reverse grids. It is not qualifying pole conversion. Where official grids are unavailable, grids are derived using the same rules as the race pages; penalties may not be reflected. Grid coverage is shown in each view.')
        .replace('Source: <a href="https://github.com/f1db/f1db">F1DB</a>.', `Source: the imported ${series.name} results archive.`);
}

module.exports = { renderCircuitAnalysisHtml };
