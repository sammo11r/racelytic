const fs = require('node:fs');
const path = require('node:path');
const { resourcePath } = require('./resource-routes');

const snapshotPath = path.join(__dirname, 'generated/ask-answers.json');

function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

function readSnapshot(file = snapshotPath) {
    try {
        const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (!Array.isArray(parsed.pages)) throw new Error('pages must be an array');
        return parsed;
    } catch (error) {
        if (error.code === 'ENOENT') return { generatedAt: null, pages: [] };
        throw new Error(`Unable to read generated Ask answers: ${error.message}`);
    }
}

function answerMap(snapshot = readSnapshot()) {
    return new Map(snapshot.pages.map(page => [page.path, page]));
}

function formatValue(value, unit = '') {
    const number = Number(value);
    const formatted = Number.isFinite(number) ? number.toLocaleString('en-US', { maximumFractionDigits: 2 }) : String(value ?? '—');
    return `${formatted}${unit || ''}`;
}

function entityHref(page, entry) {
    const resource = page.result.entity === 'constructors'
        ? (page.series === 'f3' || page.series === 'academy' ? 'team' : 'constructor') : 'driver';
    return resourcePath(page.series, resource, entry.id);
}

function relatedPages(page, pages) {
    const sameSeries = pages.filter(candidate => candidate.series === page.series && candidate.path !== page.path);
    const sameMetric = pages.filter(candidate => candidate.series !== page.series
        && candidate.interpretation?.recordCategory === page.interpretation?.recordCategory);
    return [...sameSeries.slice(0, 3), ...sameMetric.slice(0, 2)].slice(0, 5);
}

function renderAnswerPage(page, snapshot) {
    const record = page.result.record;
    const generated = snapshot.generatedAt ? new Date(snapshot.generatedAt) : null;
    const updatedLabel = generated && !Number.isNaN(generated.valueOf())
        ? generated.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : 'Unknown';
    const rows = record.entries.map(entry => `<tr>
              <td>${esc(entry.rank)}</td>
              <th scope="row"><a href="${esc(entityHref(page, entry))}">${esc(entry.name)}</a></th>
              <td>${esc(formatValue(entry.value, record.unit))}</td>
              <td>${esc(entry.firstYear || '—')}–${esc(entry.lastYear || '—')}</td>
            </tr>`).join('\n');
    const assumptions = (page.result.assumptions || []).map(item => `<li>${esc(item)}</li>`).join('');
    const related = relatedPages(page, snapshot.pages).map(item => `<li><a href="${esc(item.path)}">${esc(item.question)}</a></li>`).join('');
    return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(page.question)} · Racelytic</title>
  <link rel="stylesheet" href="/css/style.css"><link rel="stylesheet" href="/css/polish.css"><link rel="stylesheet" href="/css/ask-answers.css">
</head><body class="ask-answer-page"><div id="header"></div>
  <main class="container ask-answer-main"><article>
    <p class="eyebrow">${esc(page.seriesName)} archive answer</p><h1>${esc(page.question)}</h1>
    <p class="ask-answer-lead">${esc(page.result.answer)}</p>
    <p class="ask-answer-updated">Calculated from Racelytic’s recorded archive. Last recalculated ${esc(updatedLabel)}.</p>
    <section aria-labelledby="ranking-title"><h2 id="ranking-title">Supporting ranking</h2><div class="table-scroll"><table>
      <caption>${esc(record.label)} — top ${esc(record.entries.length)}</caption>
      <thead><tr><th scope="col">Rank</th><th scope="col">${esc(page.result.entityLabel || 'Competitor')}</th><th scope="col">${esc(record.label)}</th><th scope="col">Archive span</th></tr></thead>
      <tbody>${rows}</tbody></table></div></section>
    <section aria-labelledby="method-title"><h2 id="method-title">How this answer was calculated</h2>
      <p>${esc(page.result.methodology?.source || 'Racelytic archive records.')} Coverage: ${esc(page.result.methodology?.coverage || 'recorded archive')}. ${esc(page.result.methodology?.sample || '')}</p>
      ${assumptions ? `<ul>${assumptions}</ul>` : ''}</section>
    ${related ? `<aside aria-labelledby="related-title"><h2 id="related-title">Related questions</h2><ul>${related}</ul></aside>` : ''}
  </article></main><footer class="footer"></footer></body></html>`;
}

function descriptionFor(page) {
    return `${page.result.answer} See the supporting ${page.seriesName} ranking and calculation from Racelytic’s recorded archive.`.slice(0, 300);
}

module.exports = { answerMap, descriptionFor, readSnapshot, renderAnswerPage, snapshotPath };
