const askForm = document.getElementById('ask-form');
const askQuery = document.getElementById('ask-query');
const askAnswerStatus = document.getElementById('ask-answer-status');
const askResult = document.getElementById('ask-result');
const askRefinement = document.getElementById('ask-refinement');
const askInitialState = askAnswerStatus.innerHTML;
let askRequest = null;
let askContext = null;
let askFilterOptions = null;
const askSeries = window.RacelyticSeries.fromPath();
const askSeriesName = askSeries.name;

function entityName(entity, plural = false) {
  if (entity !== 'constructors') return plural ? 'Drivers' : 'Driver';
  if (askSeries.entity === 'team') return plural ? 'Teams' : 'Team';
  return plural ? 'Constructors' : 'Constructor';
}

function entityUrl(entity, id) {
  const slug = entity === 'constructors' ? (askSeries.entity === 'team' ? 'team' : 'constructor') : 'driver';
  return `${askSeries.path}/${slug}?id=${encodeURIComponent(id)}`;
}

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
  const recordIntent = ['record_leader', 'record_subject_total'].includes(intent);
  const systems = data.options?.pointsSystems || [];
  const selectedSystem = data.pointsSystem?.id
    || systems.find(system => systemContainsYear(system.id, interpretation.pointsSystemYear))?.id;
  const comparisonYears = interpretation.comparisonPointsSystemYears || [];
  const recordCategories = data.options?.recordCategories || [];
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
    ${interpretation.subjectName ? `<input type="hidden" name="subjectName" value="${esc(interpretation.subjectName)}">` : ''}
    <div class="ask-interpretation-controls">
      <label>${recordIntent ? 'Entity' : 'Championship'}<select name="entity">
        ${['record_subject_total', 'recalculate_entity_titles', 'compare_points_systems'].includes(intent) ? `<option value=""${!interpretation.entity ? ' selected' : ''}>Auto-detect</option>` : ''}
        <option value="drivers"${interpretation.entity === 'drivers' || (!['record_subject_total', 'recalculate_entity_titles', 'compare_points_systems'].includes(intent) && interpretation.entity !== 'constructors') ? ' selected' : ''}>Drivers</option>
        <option value="constructors"${interpretation.entity === 'constructors' ? ' selected' : ''}>${entityName('constructors', true)}</option>
      </select></label>
      ${recordIntent
        ? `<label>Record<select name="recordCategory" required>${recordCategories.map(category => `<option value="${esc(category.id)}"${category.id === interpretation.recordCategory ? ' selected' : ''}>${esc(category.name)}</option>`).join('')}</select></label>
          <label>Team filter<input name="constructorName" type="text" list="ask-team-options" maxlength="100" placeholder="All teams" value="${esc(interpretation.constructorName || '')}"></label>
          <label>Circuit<input name="circuitName" type="text" list="ask-circuit-options" maxlength="100" placeholder="All circuits" value="${esc(interpretation.circuitName || '')}"></label>
          <label>Nationality<input name="nationalityName" type="text" list="ask-nationality-options" maxlength="60" placeholder="All nationalities" value="${esc(interpretation.nationalityName || '')}"></label>
          <label>Race format<select name="raceFormat"><option value="">${askSeries.key === 'f1' ? 'Grands Prix' : 'All formats'} (default)</option><option value="all"${interpretation.raceFormat === 'all' ? ' selected' : ''}>All formats</option><option value="F"${interpretation.raceFormat === 'F' ? ' selected' : ''}>${askSeries.key === 'f1' ? 'Grands Prix' : askSeries.key === 'academy' ? 'Standard races' : 'Feature races'}</option><option value="S"${interpretation.raceFormat === 'S' ? ' selected' : ''}>${askSeries.key === 'academy' ? 'Reverse-grid races' : 'Sprint races'}</option></select></label>
          ${intent === 'record_leader' ? `<label>Results<select name="resultLimit">${[5, 10, 20, 50].map(limit => `<option value="${limit}"${Number(interpretation.resultLimit || 10) === limit ? ' selected' : ''}>Top ${limit}</option>`).join('')}</select></label>` : ''}`
        : intent === 'compare_points_systems'
        ? `<label>First rules<select name="comparisonPointsSystemYearA" required>${systemOptions(systems.find(system => systemContainsYear(system.id, comparisonYears[0]))?.id)}</select></label>
          <label>Second rules<select name="comparisonPointsSystemYearB" required>${systemOptions(systems.find(system => systemContainsYear(system.id, comparisonYears[1]))?.id)}</select></label>`
        : `<label>Scoring rules<select name="pointsSystemYear" required>${systemOptions(selectedSystem)}</select></label>`}
      ${seasonControls}
      <button class="button secondary" type="submit">Recalculate</button>
    </div>
  </form>`;
}

function refinementPanel(data, followUps = [], forceOpen = false) {
  const compact = window.matchMedia('(max-width: 980px)').matches;
  return `${followUps.length ? `<div class="ask-followups"><span>Ask a follow-up</span>${followUps.map(question => `<button type="button" data-ask-followup="${esc(question)}">${esc(question)}</button>`).join('')}</div>` : ''}
    <details class="ask-refinement-details"${forceOpen || !compact ? ' open' : ''}>
      <summary>Refine this answer</summary>
      <div class="ask-interpretation-after">${interpretationControls(data)}</div>
    </details>`;
}

async function hydrateFilterOptions() {
  if (!askRefinement.querySelector('[list^="ask-"]')) return;
  try {
    if (!askFilterOptions) {
      const response = await fetch(`/api/ask/options?series=${encodeURIComponent(askSeries.key)}`);
      if (!response.ok) throw new Error('Filter suggestions unavailable');
      askFilterOptions = await response.json();
    }
    const lists = [
      ['ask-team-options', askFilterOptions.teams],
      ['ask-circuit-options', askFilterOptions.circuits],
      ['ask-nationality-options', askFilterOptions.nationalities]
    ];
    lists.forEach(([id, values]) => {
      if (document.getElementById(id)) return;
      askRefinement.insertAdjacentHTML('beforeend', `<datalist id="${id}">${(values || []).map(value => `<option value="${esc(value)}"></option>`).join('')}</datalist>`);
    });
  } catch {}
}

function syncInterpretationForm(form) {
  const constructors = form.elements.entity.value === 'constructors';
  const category = form.elements.recordCategory?.value;
  const championshipRecord = category === 'championships';
  const teamFilter = form.elements.constructorName;
  const circuitFilter = form.elements.circuitName;
  const raceFormat = form.elements.raceFormat;
  if (teamFilter) {
    teamFilter.disabled = constructors;
    teamFilter.closest('label')?.classList.toggle('is-disabled', constructors);
    if (constructors) teamFilter.value = '';
  }
  if (circuitFilter) {
    circuitFilter.disabled = championshipRecord;
    circuitFilter.closest('label')?.classList.toggle('is-disabled', championshipRecord);
    if (championshipRecord) circuitFilter.value = '';
  }
  if (raceFormat) {
    const fixedFormat = championshipRecord || category === 'poles';
    raceFormat.disabled = fixedFormat;
    raceFormat.closest('label')?.classList.toggle('is-disabled', fixedFormat);
    if (fixedFormat) raceFormat.value = '';
  }
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
  if (!search.has('intent') && !search.has('entity') && !search.has('record') && !search.has('subject') && !search.has('team') && !search.has('circuit') && !search.has('nationality') && !search.has('format') && !search.has('limit') && !search.has('points') && !search.has('points2') && !search.has('from') && !search.has('to') && !search.has('season')) return null;
  return {
    intent: search.get('intent') || '',
    entity: search.get('entity') || '',
    recordCategory: search.get('record') || '',
    subjectName: search.get('subject') || '',
    constructorName: search.get('team') || '',
    circuitName: search.get('circuit') || '',
    nationalityName: search.get('nationality') || '',
    raceFormat: search.get('format') || '',
    resultLimit: search.get('limit') || '',
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
    if (interpretation.intent) search.set('intent', interpretation.intent);
    if (interpretation.entity) search.set('entity', interpretation.entity);
    if (interpretation.recordCategory) search.set('record', interpretation.recordCategory);
    if (interpretation.subjectName) search.set('subject', interpretation.subjectName);
    if (interpretation.constructorName) search.set('team', interpretation.constructorName);
    if (interpretation.circuitName) search.set('circuit', interpretation.circuitName);
    if (interpretation.nationalityName) search.set('nationality', interpretation.nationalityName);
    if (interpretation.raceFormat) search.set('format', interpretation.raceFormat);
    if (interpretation.resultLimit) search.set('limit', interpretation.resultLimit);
    if (interpretation.pointsSystemYear) search.set('points', interpretation.pointsSystemYear);
    if (interpretation.comparisonPointsSystemYears?.[0]) search.set('points', interpretation.comparisonPointsSystemYears[0]);
    if (interpretation.comparisonPointsSystemYears?.[1]) search.set('points2', interpretation.comparisonPointsSystemYears[1]);
    if (interpretation.fromYear) search.set('from', interpretation.fromYear);
    if (interpretation.toYear) search.set('to', interpretation.toYear);
    if (interpretation.targetSeason) search.set('season', interpretation.targetSeason);
  }
  return `${askSeries.path}/ask?${search}`;
}

function renderLoading(question) {
  const recordQuestion = /\b(?:wins?|victories|podiums?|poles?|pole positions?|fastest[ -]laps?|starts?|points?)\b/i.test(question)
    && !/\b(?:points? system|scoring rules?|recalculate|under)\b/i.test(question);
  askAnswerStatus.setAttribute('aria-busy', 'true');
  askRefinement.innerHTML = '';
  askResult.innerHTML = '';
  askAnswerStatus.innerHTML = `
    <div class="ask-loading">
      <span></span><div><strong>Reading your question…</strong><p>${recordQuestion ? `Searching the recorded ${esc(askSeriesName)} archive.` : 'Recalculating completed seasons under the selected rulebook.'}</p></div>
    </div>`;
}

function renderError(payload) {
  const examples = payload.examples || [];
  const suggestions = payload.suggestions || [];
  askRefinement.innerHTML = payload.interpretation && payload.options
    ? refinementPanel(payload, [], true)
    : '';
  askResult.innerHTML = '';
  askAnswerStatus.innerHTML = `
    <div class="ask-error" role="alert">
      <span>Question not calculated</span>
      <strong>${esc(payload.error || 'Racelytic could not calculate that answer.')}</strong>
      ${payload.seriesMismatch ? `<a class="button secondary" href="${esc(payload.seriesMismatch.url)}">Open ${esc(payload.seriesMismatch.name)} Ask</a>` : ''}
      ${payload.suggestedAction ? `<a class="button secondary" href="${esc(payload.suggestedAction.url)}">${esc(payload.suggestedAction.label)}</a>` : ''}
      ${suggestions.length ? `<div class="ask-name-suggestions"><small>Did you mean?</small>${suggestions.map(entry => `<button type="button" data-ask-name="${esc(entry.name)}" data-original-name="${esc(payload.interpretation?.subjectName || '')}">${esc(entry.name)} <span>${entityName(entry.entity)}</span></button>`).join('')}</div>` : ''}
      ${examples.length ? `<div class="ask-error-examples">${examples.map(example => `<button type="button" data-ask-example="${esc(example)}">${esc(example)}</button>`).join('')}</div>` : ''}
    </div>`;
  syncInterpretationForms();
  hydrateFilterOptions();
}

function rankingRowClass(entry, index) {
  const classes = [];
  if (entry.rank === 1) classes.push('ask-ranking-leader');
  if (index >= 5) classes.push('ask-ranking-extra');
  return classes.length ? ` class="${classes.join(' ')}"` : '';
}

function rankingSection(data) {
  const heading = data.intent === 'recalculate_season_champion' ? 'Recalculated season result' : 'Recalculated title leaders';
  return `<section class="ask-evidence" aria-labelledby="ask-ranking-title">
    <div class="ask-section-heading"><div><span>RESULTS</span><h2 id="ask-ranking-title">${heading}</h2></div><small>${esc(data.entityLabel)} · official totals cover the same seasons</small></div>
    <div class="table-wrap">
      <table class="ask-ranking-table">
        <caption class="visually-hidden">${esc(heading)}</caption>
        <thead><tr><th>Rank</th><th>${data.entity === 'constructors' ? 'Constructor' : 'Driver'}</th><th>Recalculated titles</th><th>Official titles</th><th>Difference</th></tr></thead>
        <tbody>${data.ranking.slice(0, 10).map((entry, index) => `<tr${rankingRowClass(entry, index)}>
          <td data-label="Rank">${fmtNumber(entry.rank)}</td>
          <td data-label="${entityName(data.entity)}"><a href="${entityUrl(data.entity, entry.id)}"><strong>${esc(entry.name)}</strong></a></td>
          <td data-label="Recalculated titles"><strong>${fmtNumber(entry.titles)}</strong></td>
          <td data-label="Official titles">${fmtNumber(entry.officialTitles)}</td>
          <td data-label="Difference"><span class="ask-title-change ${entry.change > 0 ? 'up' : entry.change < 0 ? 'down' : ''}">${signedTitles(entry.change)}</span></td>
        </tr>`).join('')}</tbody>
      </table>
      ${data.ranking.length > 5 ? '<button class="ask-show-results" type="button" data-ask-expand aria-expanded="false">Show all results</button>' : ''}
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
        <caption class="visually-hidden">Recalculated season standings</caption>
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
  const label = entityName(data.focus.entity);
  return `<a class="ask-focus-card" href="${esc(data.focus.href)}">
    <span>${label}</span><strong>${esc(data.focus.name)}</strong>
    <div><b>${fmtNumber(data.focus.titles)}</b><small>recalculated titles</small></div>
    <div><b>${fmtNumber(data.focus.officialTitles)}</b><small>official titles</small></div>
    <em class="ask-title-change ${data.focus.change > 0 ? 'up' : data.focus.change < 0 ? 'down' : ''}">${signedTitles(data.focus.change)}</em>
  </a>`;
}

function recordSection(data) {
  const record = data.record;
  if (!record) return '';
  const label = entityName(data.entity);
  const entries = record.entries.length ? record.entries : data.subject ? [{ ...data.subject, rank: 1, starts: 0, firstYear: null, lastYear: null }] : [];
  const teamScope = data.constructorFilter ? ` for ${esc(data.constructorFilter.name)}` : '';
  const heading = data.subject
    ? `${esc(data.subject.name)}’s ${esc(record.label.toLowerCase())}${teamScope}`
    : `${label}s with the most ${esc(record.label.toLowerCase())}${teamScope}`;
  const coverage = record.coverage?.fromYear && record.coverage?.toYear
    ? `Archive ${record.coverage.fromYear === record.coverage.toYear ? record.coverage.fromYear : `${record.coverage.fromYear}–${record.coverage.toYear}`}`
    : 'Recorded archive';
  const context = data.subject ? `Official total · ${coverage}` : `${fmtNumber(record.total)} ranked ${entityName(data.entity, true).toLowerCase()} · ${coverage}`;
  return `<section class="ask-evidence" aria-labelledby="ask-record-title">
    <div class="ask-section-heading"><div><span>OFFICIAL RECORD</span><h2 id="ask-record-title">${heading}</h2></div><small>${context}</small></div>
    <div class="table-wrap"><table class="ask-ranking-table">
      <caption class="visually-hidden">${heading}</caption>
      <thead><tr><th>Rank</th><th>${label}</th><th>${esc(record.label)}</th><th>Starts</th><th>Active span</th></tr></thead>
      <tbody>${entries.map((entry, index) => `<tr${rankingRowClass(entry, index)}>
        <td data-label="Rank">${fmtNumber(entry.rank)}</td>
        <td data-label="${label}"><a href="${entityUrl(data.entity, entry.id)}"><strong>${esc(entry.name)}</strong></a></td>
        <td data-label="${esc(record.label)}"><strong>${fmtNumber(entry.value)}</strong></td>
        <td data-label="Starts">${fmtNumber(entry.starts)}</td>
        <td data-label="Active span">${entry.firstYear == null ? '—' : esc(entry.firstYear === entry.lastYear ? entry.firstYear : `${entry.firstYear}–${entry.lastYear}`)}</td>
      </tr>`).join('')}</tbody>
    </table></div>
    ${entries.length > 5 ? '<button class="ask-show-results" type="button" data-ask-expand aria-expanded="false">Show all results</button>' : ''}
  </section>`;
}

function recordScopeSummary(data) {
  const scope = data.scope || {};
  const parts = [];
  if (scope.category !== 'championships') {
    const labels = { all: 'All race formats', F: askSeries.key === 'f1' ? 'Grands Prix only' : askSeries.key === 'academy' ? 'Standard races only' : 'Feature races only', S: askSeries.key === 'academy' ? 'Reverse-grid races only' : 'Sprint races only' };
    if (labels[scope.raceFormat]) parts.push(labels[scope.raceFormat]);
  }
  if (scope.circuit?.name) parts.push(scope.circuit.name);
  if (scope.nationality?.name) parts.push(`${scope.nationality.name} ${entityName(data.entity, true).toLowerCase()}`);
  return parts.join(' · ');
}

function renderAnswer(data) {
  const changed = data.changedChampionships || [];
  const recordIntent = ['record_leader', 'record_subject_total'].includes(data.intent);
  const evidence = recordIntent
    ? recordSection(data)
    : data.intent === 'compare_points_systems'
    ? comparisonSection(data)
    : data.intent === 'list_changed_championships'
      ? `${changesSection(data)}${rankingSection(data)}`
      : `${explanationSection(data)}${rankingSection(data)}${changesSection(data)}`;
  const answerContext = recordIntent
    ? data.intent === 'record_subject_total'
      ? `Calculated from the matching results in the recorded ${esc(askSeriesName)} archive.`
      : `Based on ${fmtNumber(data.record.total)} ranked ${entityName(data.entity, true).toLowerCase()} in the recorded ${esc(askSeriesName)} archive.`
    : data.intent === 'compare_points_systems'
    ? 'The same completed seasons were recalculated under both complete rulebooks.'
    : `${fmtNumber(changed.length)} championship${changed.length === 1 ? '' : 's'} change${changed.length === 1 ? 's' : ''} hands compared with the official results.`;
  const scopeSummary = recordIntent ? recordScopeSummary(data) : '';
  const followUps = recordIntent ? [
    'Only since 2022',
    `Now show ${data.entity === 'constructors' ? 'drivers' : entityName('constructors', true).toLowerCase()}`,
    data.scope?.raceFormat === 'S' ? 'Now include all race formats' : askSeries.key === 'f1' ? 'Now include sprints' : askSeries.key === 'academy' ? 'Only reverse-grid races' : 'Only sprint races'
  ] : [];
  askAnswerStatus.innerHTML = `
    <article class="ask-answer-card">
      <div class="ask-answer-kicker"><span>${recordIntent ? 'OFFICIAL ARCHIVE ANSWER' : 'RECALCULATED ANSWER'}</span><span>${recordIntent ? esc(scopeSummary || data.record.label) : `${fmtNumber(data.seasonsEvaluated)} seasons`}</span></div>
      <h2 tabindex="-1">${esc(data.answer)}</h2>
      <p>${answerContext}</p>
    </article>`;
  askResult.innerHTML = `
    ${data.intent === 'compare_points_systems' || recordIntent ? '' : focusSection(data)}
    ${evidence}
    <details class="ask-method">
      <summary>Rules and assumptions</summary>
      <div>${data.pointsSystem ? `<ul>${data.pointsSystem.rules.map(rule => `<li>${esc(rule)}</li>`).join('')}</ul>` : ''}<ul>${data.assumptions.map(assumption => `<li>${esc(assumption)}</li>`).join('')}</ul>${data.excludedSeasons?.length ? `<p>Excluded because detailed classifications are incomplete: ${data.excludedSeasons.map(fmtNumber).join(', ')}.</p>` : ''}</div>
    </details>`;
  askRefinement.innerHTML = refinementPanel(data, followUps);
  syncInterpretationForms();
  hydrateFilterOptions();
}

async function ask(question, pushHistory = true, interpretation = null) {
  const query = question.trim();
  if (query.length < 8) {
    askQuery.setCustomValidity('Enter at least 8 characters.');
    askQuery.reportValidity();
    return;
  }
  askQuery.setCustomValidity('');
  askRequest?.abort();
  askRequest = new AbortController();
  const request = askRequest;
  if (pushHistory) history.pushState({}, '', askUrl(query, interpretation));
  renderLoading(query);
  try {
    const response = await fetch('/api/ask', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        query,
        series: askSeries.key,
        ...(askContext && /^(?:and\b|now\b|only\b|instead\b|what\s+about\b|how\s+about\b|show\b|make\s+that\b)/i.test(query) ? { context: askContext } : {}),
        ...(interpretation ? { interpretation } : {})
      }),
      signal: request.signal
    });
    const payload = await response.json();
    if (!response.ok) {
      if (!/^(?:and\b|now\b|only\b|instead\b|what\s+about\b|how\s+about\b|show\b|make\s+that\b)/i.test(query)) askContext = null;
      return renderError(payload);
    }
    askContext = payload.interpretation;
    if (pushHistory) history.replaceState({}, '', askUrl(query, payload.interpretation));
    renderAnswer(payload);
    if (pushHistory && window.matchMedia('(max-width: 980px)').matches) {
      const heading = askAnswerStatus.querySelector('h2');
      heading?.focus({ preventScroll: true });
      askAnswerStatus.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  } catch (error) {
    if (error.name !== 'AbortError') renderError({ error: 'The answer could not be calculated. Check your connection and try again.' });
  } finally {
    if (askRequest === request) askAnswerStatus.setAttribute('aria-busy', 'false');
  }
}

askForm.addEventListener('submit', event => {
  event.preventDefault();
  ask(askQuery.value, true);
});

askQuery.addEventListener('input', () => askQuery.setCustomValidity(''));

document.addEventListener('submit', event => {
  const form = event.target.closest('.ask-interpretation-form');
  if (!form) return;
  event.preventDefault();
  const values = Object.fromEntries(new FormData(form));
  ask(askQuery.value, true, {
    intent: form.dataset.intent,
    entity: values.entity,
    recordCategory: values.recordCategory,
    subjectName: values.subjectName,
    constructorName: values.constructorName || '',
    circuitName: values.circuitName || '',
    nationalityName: values.nationalityName || '',
    raceFormat: values.raceFormat || '',
    resultLimit: values.resultLimit || '',
    pointsSystemYear: values.pointsSystemYear,
    fromYear: values.fromYear,
    toYear: values.toYear,
    targetSeason: values.targetSeason,
    comparisonPointsSystemYears: [values.comparisonPointsSystemYearA, values.comparisonPointsSystemYearB].filter(Boolean)
  });
});

document.addEventListener('change', event => {
  if (['entity', 'recordCategory'].includes(event.target.name) && event.target.closest('.ask-interpretation-form')) {
    syncInterpretationForm(event.target.closest('.ask-interpretation-form'));
  }
});

document.addEventListener('click', event => {
  const followUp = event.target.closest('[data-ask-followup]');
  if (followUp) {
    askQuery.value = followUp.dataset.askFollowup;
    askQuery.focus();
    ask(askQuery.value, true);
    return;
  }
  const showResults = event.target.closest('[data-ask-expand]');
  if (showResults) {
    const table = showResults.closest('.ask-evidence')?.querySelector('.ask-ranking-table');
    const expanded = !table?.classList.contains('is-expanded');
    table?.classList.toggle('is-expanded', expanded);
    showResults.setAttribute('aria-expanded', String(expanded));
    showResults.textContent = expanded ? 'Show fewer results' : 'Show all results';
    return;
  }
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
  askContext = null;
  const query = new URLSearchParams(location.search).get('q') || '';
  askQuery.value = query;
  if (query) ask(query, false, interpretationFromUrl());
  else {
    askRequest?.abort();
    askRequest = null;
    askAnswerStatus.innerHTML = askInitialState;
    askAnswerStatus.setAttribute('aria-busy', 'false');
    askRefinement.innerHTML = '';
    askResult.innerHTML = '';
  }
});

const initialQuestion = new URLSearchParams(location.search).get('q');
if (initialQuestion) {
  askQuery.value = initialQuestion;
  ask(initialQuestion, false, interpretationFromUrl());
}
