const askForm = document.getElementById('ask-form');
const askQuery = document.getElementById('ask-query');
const askResult = document.getElementById('ask-result');
let askRequest = null;

function signedTitles(value) {
  const number = Number(value || 0);
  if (!number) return '—';
  return `${number > 0 ? '+' : '−'}${fmtNumber(Math.abs(number))}`;
}

function systemContainsYear(id, year) {
  const [startText, endText = startText] = String(id).split('-');
  const start = Number(startText);
  const end = endText === 'present' ? Infinity : Number(endText);
  return Number(year) >= start && Number(year) <= end;
}

function interpretationControls(data) {
  const interpretation = data.interpretation || {};
  const intent = data.intent || interpretation.detectedIntent || interpretation.intent;
  const systems = data.options?.pointsSystems || [];
  const selectedSystem = data.pointsSystem?.id
    || systems.find(system => systemContainsYear(system.id, interpretation.pointsSystemYear))?.id;
  const comparisonYears = interpretation.comparisonPointsSystemYears || [];
  const systemOptions = selected => `<option value="">Choose rules…</option>
    ${systems.map(system => `<option value="${system.year}" data-system-id="${esc(system.id)}" data-constructors-available="${system.constructorsAvailable}"${system.id === selected ? ' selected' : ''}>${esc(system.name)}</option>`).join('')}`;
  const confidence = interpretation.confidence === 'confirmed'
    ? 'Confirmed'
    : interpretation.confidence === 'high' ? 'High confidence' : 'Check my interpretation';
  const seasonControls = intent === 'recalculate_season_champion'
    ? `<label>Season<input name="targetSeason" type="number" min="1950" max="2100" inputmode="numeric" required value="${esc(interpretedYear(interpretedValue(interpretation.targetSeason)))}"></label>`
    : `<label>From season<input name="fromYear" type="number" min="1950" max="2100" inputmode="numeric" placeholder="All" value="${esc(interpretedYear(interpretedValue(interpretation.fromYear)))}"></label>
      <label>To season<input name="toYear" type="number" min="1950" max="2100" inputmode="numeric" placeholder="Latest" value="${esc(interpretedYear(interpretedValue(interpretation.toYear)))}"></label>`;
  return `<form class="ask-interpretation-form" aria-label="Edit question interpretation" data-intent="${esc(intent || '')}">
    <div class="ask-interpretation-heading"><span>I understood this as</span><small>${esc(confidence)}</small></div>
    <div class="ask-interpretation-controls">
      <label>Championship<select name="entity">
        ${['recalculate_entity_titles', 'compare_points_systems'].includes(intent) ? `<option value=""${!interpretation.entity ? ' selected' : ''}>Auto-detect</option>` : ''}
        <option value="drivers"${interpretation.entity === 'drivers' || (!['recalculate_entity_titles', 'compare_points_systems'].includes(intent) && interpretation.entity !== 'constructors') ? ' selected' : ''}>Drivers</option>
        <option value="constructors"${interpretation.entity === 'constructors' ? ' selected' : ''}>Constructors</option>
      </select></label>
      ${intent === 'compare_points_systems'
        ? `<label>First rules<select name="comparisonPointsSystemYearA" required>${systemOptions(systems.find(system => systemContainsYear(system.id, comparisonYears[0]))?.id)}</select></label>
          <label>Second rules<select name="comparisonPointsSystemYearB" required>${systemOptions(systems.find(system => systemContainsYear(system.id, comparisonYears[1]))?.id)}</select></label>`
        : `<label>Scoring rules<select name="pointsSystemYear" required>${systemOptions(selectedSystem)}</select></label>`}
      ${seasonControls}
      <button class="button secondary" type="submit">Recalculate</button>
    </div>
  </form>`;
}

function syncInterpretationForm(form) {
  const constructors = form.elements.entity.value === 'constructors';
  form.querySelectorAll('select[name*="SystemYear"]').forEach(rules => {
    [...rules.options].forEach(option => {
      option.disabled = constructors && option.dataset.constructorsAvailable === 'false';
    });
    if (rules.selectedOptions[0]?.disabled) rules.value = '';
  });
}

function syncInterpretationForms() {
  document.querySelectorAll('.ask-interpretation-form').forEach(syncInterpretationForm);
}

function interpretedValue(value) {
  return value === null || value === undefined ? '' : value;
}

function interpretedYear(value) {
  return value === '' ? '' : String(value);
}

function interpretationFromUrl() {
  const search = new URLSearchParams(location.search);
  if (!search.has('entity') && !search.has('points') && !search.has('points2') && !search.has('from') && !search.has('to') && !search.has('season')) return null;
  return {
    entity: search.get('entity') || '',
    pointsSystemYear: search.get('points') || '',
    comparisonPointsSystemYears: [search.get('points'), search.get('points2')].filter(Boolean),
    fromYear: search.get('from') || '',
    toYear: search.get('to') || '',
    targetSeason: search.get('season') || ''
  };
}

function askUrl(query, interpretation) {
  const search = new URLSearchParams({ q: query });
  if (interpretation) {
    if (interpretation.entity) search.set('entity', interpretation.entity);
    if (interpretation.pointsSystemYear) search.set('points', interpretation.pointsSystemYear);
    if (interpretation.comparisonPointsSystemYears?.[0]) search.set('points', interpretation.comparisonPointsSystemYears[0]);
    if (interpretation.comparisonPointsSystemYears?.[1]) search.set('points2', interpretation.comparisonPointsSystemYears[1]);
    if (interpretation.fromYear) search.set('from', interpretation.fromYear);
    if (interpretation.toYear) search.set('to', interpretation.toYear);
    if (interpretation.targetSeason) search.set('season', interpretation.targetSeason);
  }
  return `/ask?${search}`;
}

function renderLoading() {
  askResult.setAttribute('aria-busy', 'true');
  askResult.innerHTML = `
    <div class="ask-loading">
      <span></span><div><strong>Reading your question…</strong><p>Recalculating completed seasons under the selected rulebook.</p></div>
    </div>`;
}

function renderError(payload) {
  const examples = payload.examples || [];
  const suggestions = payload.suggestions || [];
  askResult.innerHTML = `
    ${payload.interpretation && payload.options ? interpretationControls(payload) : ''}
    <div class="ask-error" role="alert">
      <span>Question not calculated</span>
      <strong>${esc(payload.error || 'Racelytic could not calculate that answer.')}</strong>
      ${suggestions.length ? `<div class="ask-name-suggestions"><small>Did you mean?</small>${suggestions.map(entry => `<button type="button" data-ask-name="${esc(entry.name)}" data-original-name="${esc(payload.interpretation?.subjectName || '')}">${esc(entry.name)} <span>${entry.entity === 'constructors' ? 'Constructor' : 'Driver'}</span></button>`).join('')}</div>` : ''}
      ${examples.length ? `<div class="ask-error-examples">${examples.map(example => `<button type="button" data-ask-example="${esc(example)}">${esc(example)}</button>`).join('')}</div>` : ''}
    </div>`;
  syncInterpretationForms();
}

function rankingSection(data) {
  const heading = data.intent === 'recalculate_season_champion' ? 'Recalculated season result' : 'Recalculated title leaders';
  return `<section class="ask-evidence" aria-labelledby="ask-ranking-title">
    <div class="ask-section-heading"><div><span>RESULTS</span><h2 id="ask-ranking-title">${heading}</h2></div><small>${esc(data.entityLabel)} · official totals cover the same seasons</small></div>
    <div class="table-wrap">
      <table class="ask-ranking-table">
        <thead><tr><th>Rank</th><th>${data.entity === 'constructors' ? 'Constructor' : 'Driver'}</th><th>Recalculated titles</th><th>Official titles</th><th>Difference</th></tr></thead>
        <tbody>${data.ranking.slice(0, 10).map(entry => `<tr${entry.rank === 1 ? ' class="ask-ranking-leader"' : ''}>
          <td data-label="Rank">${fmtNumber(entry.rank)}</td>
          <td data-label="${data.entity === 'constructors' ? 'Constructor' : 'Driver'}"><a href="/${data.entity === 'constructors' ? 'constructor' : 'driver'}?id=${encodeURIComponent(entry.id)}"><strong>${esc(entry.name)}</strong></a></td>
          <td data-label="Recalculated titles"><strong>${fmtNumber(entry.titles)}</strong></td>
          <td data-label="Official titles">${fmtNumber(entry.officialTitles)}</td>
          <td data-label="Difference"><span class="ask-title-change ${entry.change > 0 ? 'up' : entry.change < 0 ? 'down' : ''}">${signedTitles(entry.change)}</span></td>
        </tr>`).join('')}</tbody>
      </table>
    </div>
  </section>`;
}

function changesSection(data) {
  const changed = data.changedChampionships || [];
  return `<section class="ask-changes" aria-labelledby="ask-changes-title">
    <div class="ask-section-heading"><div><span>CHANGED HISTORY</span><h2 id="ask-changes-title">Championships that change hands</h2></div><small>${fmtNumber(changed.length)} of ${fmtNumber(data.seasonsEvaluated)}</small></div>
    ${changed.length ? `<div class="ask-change-grid">${changed.map(season => `<a class="ask-change-card" href="${esc(season.href)}">
      <span>${esc(season.year)}</span>
      <div><small>Official</small><strong>${esc(season.officialChampion.name)}</strong></div>
      <b aria-hidden="true">→</b>
      <div><small>Recalculated</small><strong>${esc(season.simulatedChampion.name)}</strong></div>
      <em>${fmtNumber(season.simulatedChampion.points)} pts · ${season.margin ? `${fmtNumber(season.margin)}-point margin` : 'countback'}${season.explanation?.decisiveRounds?.[0] ? ` · biggest swing: ${esc(season.explanation.decisiveRounds[0].name)}` : ''}</em>
    </a>`).join('')}</div>` : '<div class="ask-no-changes">The champion stays the same in every evaluated season.</div>'}
  </section>`;
}

function explanationSection(data) {
  if (data.intent !== 'recalculate_season_champion') return '';
  const explanation = data.seasonExplanations?.[0];
  if (!explanation) return '';
  return `<section class="ask-explanation" aria-labelledby="ask-explanation-title">
    <div class="ask-section-heading"><div><span>WHY</span><h2 id="ask-explanation-title">How the result was decided</h2></div><small>${explanation.changed ? 'Champion changes' : 'Champion retained'}</small></div>
    <p class="ask-explanation-outcome">${esc(explanation.outcome)}</p>
    <div class="ask-explanation-grid">
      <div class="table-wrap"><table class="ask-season-table">
        <thead><tr><th>Pos.</th><th>${data.entity === 'constructors' ? 'Constructor' : 'Driver'}</th><th>Counted</th><th>Dropped</th></tr></thead>
        <tbody>${explanation.standings.map(entry => `<tr><td>${fmtNumber(entry.position)}</td><td><a href="${esc(entry.href)}">${esc(entry.name)}</a></td><td>${fmtNumber(entry.points)}</td><td>${fmtNumber(entry.droppedPoints)}</td></tr>`).join('')}</tbody>
      </table></div>
      <div class="ask-decisive-rounds"><h3>Largest points swings</h3>${explanation.decisiveRounds.length
        ? explanation.decisiveRounds.map(round => `<div><span>${esc(round.name)}</span><strong>+${fmtNumber(round.swing)}</strong><small>${esc(explanation.champion.name)} ${fmtNumber(round.championPoints)} · ${esc(explanation.comparedWith?.name || 'rival')} ${fmtNumber(round.rivalPoints)}</small></div>`).join('')
        : '<p>The title was resolved by the season-wide points total or countback rather than one positive race swing.</p>'}</div>
    </div>
  </section>`;
}

function comparisonSection(data) {
  if (!data.comparison) return '';
  return `<section class="ask-comparison" aria-labelledby="ask-comparison-title">
    <div class="ask-section-heading"><div><span>RULEBOOK COMPARISON</span><h2 id="ask-comparison-title">Two systems, side by side</h2></div><small>${fmtNumber(data.comparison.systems[0]?.seasonsEvaluated || 0)} completed seasons</small></div>
    <div class="ask-comparison-grid">${data.comparison.systems.map(system => {
      const subject = system.focus;
      const leaders = system.leaders.map(entry => entry.name).join(' and ');
      const titles = subject ? subject.titles : system.leaders[0]?.titles || 0;
      return `<article class="ask-comparison-card">
        <span>${esc(system.pointsSystem.name)} POINTS</span>
        <h3>${esc(subject?.name || leaders)}</h3>
        <strong>${fmtNumber(titles)} title${titles === 1 ? '' : 's'}</strong>
        <p>${fmtNumber(system.changedChampionships.length)} championship${system.changedChampionships.length === 1 ? '' : 's'} change hands.</p>
        <ul>${system.pointsSystem.rules.slice(0, 4).map(rule => `<li>${esc(rule)}</li>`).join('')}</ul>
      </article>`;
    }).join('')}</div>
  </section>`;
}

function focusSection(data) {
  if (!data.focus) return '';
  const label = data.focus.entity === 'constructors' ? 'Constructor' : 'Driver';
  return `<a class="ask-focus-card" href="${esc(data.focus.href)}">
    <span>${label}</span><strong>${esc(data.focus.name)}</strong>
    <div><b>${fmtNumber(data.focus.titles)}</b><small>recalculated titles</small></div>
    <div><b>${fmtNumber(data.focus.officialTitles)}</b><small>official titles</small></div>
    <em class="ask-title-change ${data.focus.change > 0 ? 'up' : data.focus.change < 0 ? 'down' : ''}">${signedTitles(data.focus.change)}</em>
  </a>`;
}

function renderAnswer(data) {
  const changed = data.changedChampionships || [];
  const evidence = data.intent === 'compare_points_systems'
    ? comparisonSection(data)
    : data.intent === 'list_changed_championships'
      ? `${changesSection(data)}${rankingSection(data)}`
      : `${explanationSection(data)}${rankingSection(data)}${changesSection(data)}`;
  const answerContext = data.intent === 'compare_points_systems'
    ? 'The same completed seasons were recalculated under both complete rulebooks.'
    : `${fmtNumber(changed.length)} championship${changed.length === 1 ? '' : 's'} change${changed.length === 1 ? 's' : ''} hands compared with the official results.`;
  askResult.innerHTML = `
    ${interpretationControls(data)}
    <article class="ask-answer-card">
      <div class="ask-answer-kicker"><span>CALCULATED ANSWER</span><span>${fmtNumber(data.seasonsEvaluated)} seasons</span></div>
      <h2>${esc(data.answer)}</h2>
      <p>${answerContext}</p>
    </article>
    ${data.intent === 'compare_points_systems' ? '' : focusSection(data)}
    ${evidence}
    <details class="ask-method">
      <summary>Rules and assumptions</summary>
      <div><ul>${data.pointsSystem.rules.map(rule => `<li>${esc(rule)}</li>`).join('')}</ul><ul>${data.assumptions.map(assumption => `<li>${esc(assumption)}</li>`).join('')}</ul>${data.excludedSeasons.length ? `<p>Excluded because detailed classifications are incomplete: ${data.excludedSeasons.map(fmtNumber).join(', ')}.</p>` : ''}</div>
    </details>`;
  syncInterpretationForms();
}

async function ask(question, pushHistory = true, interpretation = null) {
  const query = question.trim();
  if (query.length < 8) return;
  askRequest?.abort();
  askRequest = new AbortController();
  const request = askRequest;
  if (pushHistory) history.pushState({}, '', askUrl(query, interpretation));
  renderLoading();
  try {
    const response = await fetch('/api/ask', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query, ...(interpretation ? { interpretation } : {}) }),
      signal: request.signal
    });
    const payload = await response.json();
    if (!response.ok) return renderError(payload);
    renderAnswer(payload);
  } catch (error) {
    if (error.name !== 'AbortError') renderError({ error: 'The answer could not be calculated. Check your connection and try again.' });
  } finally {
    if (askRequest === request) askResult.setAttribute('aria-busy', 'false');
  }
}

askForm.addEventListener('submit', event => {
  event.preventDefault();
  ask(askQuery.value, true);
});

document.addEventListener('submit', event => {
  const form = event.target.closest('.ask-interpretation-form');
  if (!form) return;
  event.preventDefault();
  const values = Object.fromEntries(new FormData(form));
  ask(askQuery.value, true, {
    entity: values.entity,
    pointsSystemYear: values.pointsSystemYear,
    fromYear: values.fromYear,
    toYear: values.toYear,
    targetSeason: values.targetSeason,
    comparisonPointsSystemYears: [values.comparisonPointsSystemYearA, values.comparisonPointsSystemYearB].filter(Boolean)
  });
});

document.addEventListener('change', event => {
  if (event.target.name === 'entity' && event.target.closest('.ask-interpretation-form')) {
    syncInterpretationForm(event.target.closest('.ask-interpretation-form'));
  }
});

document.addEventListener('click', event => {
  const nameSuggestion = event.target.closest('[data-ask-name]');
  if (nameSuggestion) {
    const original = nameSuggestion.dataset.originalName;
    askQuery.value = original ? askQuery.value.replace(original, nameSuggestion.dataset.askName) : askQuery.value;
    ask(askQuery.value, true);
    return;
  }
  const example = event.target.closest('[data-ask-example]');
  if (!example) return;
  askQuery.value = example.dataset.askExample;
  askQuery.focus();
  ask(askQuery.value, true);
});

window.addEventListener('popstate', () => {
  const query = new URLSearchParams(location.search).get('q') || '';
  askQuery.value = query;
  if (query) ask(query, false, interpretationFromUrl());
});

const initialQuestion = new URLSearchParams(location.search).get('q');
if (initialQuestion) {
  askQuery.value = initialQuestion;
  ask(initialQuestion, false, interpretationFromUrl());
}
