const askForm = document.getElementById('ask-form');
const askQuery = document.getElementById('ask-query');
const askAnswerStatus = document.getElementById('ask-answer-status');
const askResult = document.getElementById('ask-result');
const askRefinement = document.getElementById('ask-refinement');
const askExamples = document.querySelector('.ask-examples');
const askQuestionHelp = document.getElementById('ask-question-help');
const askInitialState = askAnswerStatus.innerHTML;
let askRequest = null;
let askContext = null;
let askFilterOptions = null;
let askLastInterpretation = null;
let askConversation = [];
const askSeries = window.RacelyticSeries.fromPath();
const askSeriesName = askSeries.name;

function isFollowUpQuery(query) {
  return /^(?:and\b|now\b|only\b|instead\b|what\s+about\b|how\s+about\b|show\b|make\s+that\b|at\b|in\b|with\b|without\b|from\b|since\b|through\b|until\b|between\b|as\s+team-?mates?\b|career\b|shared\b)/i.test(String(query || '').trim());
}

function entityName(entity, plural = false) {
  if (entity !== 'constructors') return plural ? 'Drivers' : 'Driver';
  if (askSeries.entity === 'team') return plural ? 'Teams' : 'Team';
  return plural ? 'Constructors' : 'Constructor';
}

function entityUrl(entity, id) {
  const slug = entity === 'constructors' ? (askSeries.entity === 'team' ? 'team' : 'constructor') : 'driver';
  return resourceUrl(slug, id, { base: askSeries.path });
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
  const comparisonDrivers = data.comparison?.drivers?.map(score => score.driver.name) || interpretation.subjectNames || [];
  const recordCategories = data.options?.recordCategories || [];
  const sampledRecord = ['gridGain', 'averageFinish', 'finishRate', 'winRate', 'podiumRate'].includes(interpretation.recordCategory);
  const systemOptions = selected => `<option value="">Choose rules…</option>
    ${systems.map(system => `<option value="${system.year}" data-system-id="${esc(system.id)}" data-constructors-available="${system.constructorsAvailable}"${system.id === selected ? ' selected' : ''}>${esc(system.name)}</option>`).join('')}`;
  const confidence = interpretation.confidence === 'confirmed'
    ? 'Confirmed'
    : interpretation.confidence === 'high' ? 'High confidence' : 'Check my interpretation';
  const seasonControls = intent === 'recalculate_season_champion'
    ? `<label>Season<input name="targetSeason" type="number" min="1950" max="2100" inputmode="numeric" required value="${esc(interpretedYear(interpretedValue(interpretation.targetSeason)))}"></label>`
    : `<label>From season<input name="fromYear" type="number" min="1950" max="2100" inputmode="numeric" placeholder="All" value="${esc(interpretedYear(interpretedValue(interpretation.fromYear)))}"></label>
      <label>To season<input name="toYear" type="number" min="1950" max="2100" inputmode="numeric" placeholder="Latest" value="${esc(interpretedYear(interpretedValue(interpretation.toYear)))}"></label>`;
  const entityControl = `<label>${recordIntent ? 'Entity' : 'Championship'}<select name="entity">
    ${['record_subject_total', 'recalculate_entity_titles', 'compare_points_systems'].includes(intent) ? `<option value=""${!interpretation.entity ? ' selected' : ''}>Auto-detect</option>` : ''}
    <option value="drivers"${interpretation.entity === 'drivers' || (!['record_subject_total', 'recalculate_entity_titles', 'compare_points_systems'].includes(intent) && interpretation.entity !== 'constructors') ? ' selected' : ''}>Drivers</option>
    <option value="constructors"${interpretation.entity === 'constructors' ? ' selected' : ''}>${entityName('constructors', true)}</option>
  </select></label>`;
  const comparisonMetricOptions = [
    ['wins', 'Race wins'], ['podiums', 'Podiums'], ['poles', 'Pole positions'], ['fastestLaps', 'Fastest laps'],
    ['points', 'Points'], ['pointsShare', 'Points share'], ['starts', 'Starts'], ['dnfs', 'DNFs'], ['gridGain', 'Average positions gained'], ['averageFinish', 'Average finish'], ['averageQualifying', 'Average qualifying position'],
    ['finishRate', 'Finish rate'], ['winRate', 'Win rate'], ['podiumRate', 'Podium rate'], ['race', 'Race head-to-head'],
    ['qualifying', 'Qualifying head-to-head'], ['both', 'Race and qualifying head-to-head']
  ];
  let controls;
  if (recordIntent) {
    controls = `${entityControl}<label>Record<select name="recordCategory" required>${recordCategories.map(category => `<option value="${esc(category.id)}"${category.id === interpretation.recordCategory ? ' selected' : ''}>${esc(category.name)}</option>`).join('')}</select></label>
      <label>Team filter<input name="constructorName" type="text" list="ask-team-options" maxlength="100" placeholder="All teams" value="${esc(interpretation.constructorName || '')}"></label>
      <label>Circuit<input name="circuitName" type="text" list="ask-circuit-options" maxlength="100" placeholder="All circuits" value="${esc(interpretation.circuitName || '')}"></label>
      <label>Host country<input name="venueCountryName" type="text" list="ask-country-options" maxlength="100" placeholder="All countries" value="${esc(interpretation.venueCountryName || '')}"></label>
      <label>Nationality<input name="nationalityName" type="text" list="ask-nationality-options" maxlength="60" placeholder="All nationalities" value="${esc(interpretation.nationalityName || '')}"></label>
      <label>Race format<select name="raceFormat"><option value="">${askSeries.key === 'f1' ? 'Grands Prix' : 'All formats'} (default)</option><option value="all"${interpretation.raceFormat === 'all' ? ' selected' : ''}>All formats</option><option value="F"${interpretation.raceFormat === 'F' ? ' selected' : ''}>${askSeries.key === 'f1' ? 'Grands Prix' : askSeries.key === 'academy' ? 'Standard races' : 'Feature races'}</option><option value="S"${interpretation.raceFormat === 'S' ? ' selected' : ''}>${askSeries.key === 'academy' ? 'Reverse-grid races' : 'Sprint races'}</option></select></label>
      ${sampledRecord ? `<label>Minimum starts<input name="minStarts" type="number" min="1" max="1000" inputmode="numeric" value="${esc(interpretation.minStarts || 10)}"></label>` : ''}
      ${intent === 'record_leader' ? `<label>Results<select name="resultLimit">${[5, 10, 20, 50].map(limit => `<option value="${limit}"${Number(interpretation.resultLimit || 10) === limit ? ' selected' : ''}>Top ${limit}</option>`).join('')}</select></label>` : ''}${seasonControls}`;
  } else if (intent === 'race_result') {
    controls = `<label>Season<input name="targetSeason" type="number" min="1950" max="2100" required value="${esc(interpretation.targetSeason || data.race?.year || '')}"></label>
      <label>Race or circuit<input name="eventName" type="text" list="ask-circuit-options" required maxlength="100" value="${esc(interpretation.eventName || data.race?.name || '')}"></label>
      <label>Answer<select name="resultView"><option value="winner"${interpretation.resultView === 'winner' ? ' selected' : ''}>Winner</option><option value="podium"${interpretation.resultView === 'podium' ? ' selected' : ''}>Podium</option><option value="classification"${interpretation.resultView === 'classification' ? ' selected' : ''}>Full classification</option><option value="driver"${interpretation.resultView === 'driver' ? ' selected' : ''}>One driver</option></select></label>
      <label>Driver (optional)<input name="subjectName" type="text" list="ask-driver-options" maxlength="100" value="${esc(interpretation.subjectName || '')}"></label>`;
  } else if (intent === 'season_standings') {
    controls = `${entityControl}<label>Season<input name="targetSeason" type="number" min="1950" max="2100" required value="${esc(interpretation.targetSeason || data.season?.year || '')}"></label>
      <label>After round<input name="standingRound" type="number" min="1" max="100" placeholder="Final" value="${esc(interpretation.standingRound || data.season?.round || '')}"></label>
      <label>Results<select name="resultLimit">${[5, 10, 20, 50].map(limit => `<option value="${limit}"${Number(interpretation.resultLimit || 20) === limit ? ' selected' : ''}>Top ${limit}</option>`).join('')}</select></label>`;
  } else if (['driver_head_to_head', 'constructor_head_to_head'].includes(intent)) {
    const constructorComparison = intent === 'constructor_head_to_head';
    const availableComparisonMetrics = constructorComparison
      ? comparisonMetricOptions.filter(([value]) => !['pointsShare', 'averageQualifying', 'race', 'qualifying', 'both'].includes(value))
      : comparisonMetricOptions;
    controls = `<label>First ${constructorComparison ? entityName('constructors').toLowerCase() : 'driver'}<input name="subjectNameA" type="text" list="${constructorComparison ? 'ask-team-options' : 'ask-driver-options'}" required maxlength="100" value="${esc(comparisonDrivers[0] || '')}"></label>
      <label>Second ${constructorComparison ? entityName('constructors').toLowerCase() : 'driver'}<input name="subjectNameB" type="text" list="${constructorComparison ? 'ask-team-options' : 'ask-driver-options'}" required maxlength="100" value="${esc(comparisonDrivers[1] || '')}"></label>
      <label>Metric<select name="comparisonMetric">${availableComparisonMetrics.map(([value, label]) => `<option value="${value}"${(data.comparison?.metric || interpretation.comparisonMetric) === value ? ' selected' : ''}>${label}</option>`).join('')}</select></label>
      ${constructorComparison || askSeries.key !== 'f1' ? '' : `<label>Scoring<select name="pointsSystemYear"><option value="">Official points</option>${systems.map(system => `<option value="${system.year}"${system.id === selectedSystem ? ' selected' : ''}>${esc(system.name)}</option>`).join('')}</select></label>`}
      ${constructorComparison ? '' : `<label>Scope<select name="comparisonScope"><option value="career"${(interpretation.comparisonScope || data.comparison?.scope) === 'career' ? ' selected' : ''}>Career totals</option><option value="shared"${(interpretation.comparisonScope || data.comparison?.scope) === 'shared' ? ' selected' : ''}>Shared races</option><option value="teammates"${(interpretation.comparisonScope || data.comparison?.scope) === 'teammates' ? ' selected' : ''}>Teammate races</option></select></label>
      <label>Team filter<input name="constructorName" type="text" list="ask-team-options" maxlength="100" placeholder="All teams" value="${esc(interpretation.constructorName || '')}"></label>`}
      <label>Circuit<input name="circuitName" type="text" list="ask-circuit-options" maxlength="100" placeholder="All circuits" value="${esc(interpretation.circuitName || '')}"></label>
      <label>Host country<input name="venueCountryName" type="text" list="ask-country-options" maxlength="100" placeholder="All countries" value="${esc(interpretation.venueCountryName || '')}"></label>${seasonControls}`;
  } else if (intent === 'streak_leader') {
    controls = `<label>Streak<select name="streakCategory"><option value="wins"${interpretation.streakCategory === 'wins' ? ' selected' : ''}>Consecutive wins</option><option value="podiums"${interpretation.streakCategory === 'podiums' ? ' selected' : ''}>Consecutive podiums</option><option value="points"${interpretation.streakCategory === 'points' ? ' selected' : ''}>Consecutive points finishes</option><option value="finishes"${interpretation.streakCategory === 'finishes' ? ' selected' : ''}>Consecutive classified finishes</option></select></label>
      <label>Results<select name="resultLimit">${[5, 10, 20, 50].map(limit => `<option value="${limit}"${Number(interpretation.resultLimit || 10) === limit ? ' selected' : ''}>Top ${limit}</option>`).join('')}</select></label>${seasonControls}`;
  } else if (intent === 'compare_points_systems') {
    controls = `${entityControl}<label>First rules<select name="comparisonPointsSystemYearA" required>${systemOptions(systems.find(system => systemContainsYear(system.id, comparisonYears[0]))?.id)}</select></label>
      <label>Second rules<select name="comparisonPointsSystemYearB" required>${systemOptions(systems.find(system => systemContainsYear(system.id, comparisonYears[1]))?.id)}</select></label>${seasonControls}`;
  } else {
    controls = `${entityControl}<label>Scoring rules<select name="pointsSystemYear" required>${systemOptions(selectedSystem)}</select></label>${seasonControls}`;
  }
  return `<form class="ask-interpretation-form" aria-label="Edit question interpretation" data-intent="${esc(intent || '')}">
    <div class="ask-interpretation-heading"><span>I understood this as</span><small>${esc(confidence)}</small></div>
    ${interpretation.subjectName && intent !== 'race_result' ? `<input type="hidden" name="subjectName" value="${esc(interpretation.subjectName)}">` : ''}
    <div class="ask-interpretation-controls">
      ${controls}
      <button class="button secondary" type="submit">Recalculate</button>
    </div>
  </form>`;
}

function conversationTrail() {
  if (askConversation.length < 2) return '';
  return `<details class="ask-conversation"><summary>Conversation history <span>${askConversation.length}</span></summary><ol>${askConversation.slice(-8).map(entry => `<li><button type="button" data-ask-history-query="${esc(entry.query)}"><span>${esc(entry.query)}</span><small>${esc(entry.answer)}</small></button></li>`).join('')}</ol></details>`;
}

function refinementPanel(data, followUps = [], forceOpen = false) {
  const compact = window.matchMedia('(max-width: 980px)').matches;
  const editable = ['record_leader', 'record_subject_total', 'race_result', 'season_standings', 'driver_head_to_head', 'constructor_head_to_head', 'streak_leader', 'recalculate_title_counts', 'recalculate_season_champion', 'recalculate_entity_titles', 'list_changed_championships', 'compare_points_systems']
    .includes(data.intent || data.interpretation?.detectedIntent || data.interpretation?.intent);
  return `${conversationTrail()}${followUps.length ? `<div class="ask-followups"><span>Ask a follow-up</span>${followUps.map(question => `<button type="button" data-ask-followup="${esc(question)}">${esc(question)}</button>`).join('')}</div>` : ''}
    ${editable ? `
    <details class="ask-refinement-details"${forceOpen || !compact ? ' open' : ''}>
      <summary>Refine this answer</summary>
      <div class="ask-interpretation-after">${interpretationControls(data)}</div>
    </details>` : ''}`;
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
      ['ask-country-options', askFilterOptions.countries],
      ['ask-driver-options', askFilterOptions.drivers],
      ['ask-nationality-options', askFilterOptions.nationalities]
    ];
    lists.forEach(([id, values]) => {
      if (document.getElementById(id)) return;
      askRefinement.insertAdjacentHTML('beforeend', `<datalist id="${id}">${(values || []).map(value => `<option value="${esc(value)}"></option>`).join('')}</datalist>`);
    });
  } catch {}
}

function syncInterpretationForm(form) {
  const constructors = form.elements.entity?.value === 'constructors';
  const category = form.elements.recordCategory?.value;
  const championshipRecord = category === 'championships';
  const teamFilter = form.elements.constructorName;
  const circuitFilter = form.elements.circuitName;
  const countryFilter = form.elements.venueCountryName;
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
  if (countryFilter) {
    countryFilter.disabled = championshipRecord;
    countryFilter.closest('label')?.classList.toggle('is-disabled', championshipRecord);
    if (championshipRecord) countryFilter.value = '';
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
  if (!search.has('intent') && !search.has('entity') && !search.has('record') && !search.has('subject') && !search.has('driver1') && !search.has('driver2') && !search.has('event') && !search.has('view') && !search.has('round') && !search.has('scope') && !search.has('metric') && !search.has('streak') && !search.has('team') && !search.has('circuit') && !search.has('country') && !search.has('nationality') && !search.has('format') && !search.has('limit') && !search.has('min') && !search.has('points') && !search.has('points2') && !search.has('from') && !search.has('to') && !search.has('season')) return null;
  return {
    intent: search.get('intent') || '',
    entity: search.get('entity') || '',
    recordCategory: search.get('record') || '',
    subjectName: search.get('subject') || '',
    subjectNames: [search.get('driver1'), search.get('driver2')].filter(Boolean),
    eventName: search.get('event') || '',
    resultView: search.get('view') || '',
    standingRound: search.get('round') || '',
    comparisonScope: search.get('scope') || '',
    comparisonMetric: search.get('metric') || '',
    streakCategory: search.get('streak') || '',
    constructorName: search.get('team') || '',
    circuitName: search.get('circuit') || '',
    venueCountryName: search.get('country') || '',
    nationalityName: search.get('nationality') || '',
    raceFormat: search.get('format') || '',
    resultLimit: search.get('limit') || '',
    minStarts: search.get('min') || '',
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
    if (interpretation.subjectNames?.[0]) search.set('driver1', interpretation.subjectNames[0]);
    if (interpretation.subjectNames?.[1]) search.set('driver2', interpretation.subjectNames[1]);
    if (interpretation.eventName) search.set('event', interpretation.eventName);
    if (interpretation.resultView) search.set('view', interpretation.resultView);
    if (interpretation.standingRound) search.set('round', interpretation.standingRound);
    if (interpretation.comparisonScope) search.set('scope', interpretation.comparisonScope);
    if (interpretation.comparisonMetric) search.set('metric', interpretation.comparisonMetric);
    if (interpretation.streakCategory) search.set('streak', interpretation.streakCategory);
    if (interpretation.constructorName) search.set('team', interpretation.constructorName);
    if (interpretation.circuitName) search.set('circuit', interpretation.circuitName);
    if (interpretation.venueCountryName) search.set('country', interpretation.venueCountryName);
    if (interpretation.nationalityName) search.set('nationality', interpretation.nationalityName);
    if (interpretation.raceFormat) search.set('format', interpretation.raceFormat);
    if (interpretation.resultLimit) search.set('limit', interpretation.resultLimit);
    if (interpretation.minStarts) search.set('min', interpretation.minStarts);
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
  const recordQuestion = /\b(?:wins?|victories|podiums?|poles?|pole positions?|fastest[ -]laps?|starts?|points?|dnfs?|retirements?|positions? gained|average finish|finish rate|win rate|podium rate)\b/i.test(question)
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
      ${suggestions.length ? `<div class="ask-name-suggestions"><small>Did you mean?</small>${suggestions.map(entry => `<button type="button" data-ask-name="${esc(entry.name)}" data-original-name="${esc(payload.suggestionContext?.originalName || payload.interpretation?.subjectName || '')}" data-suggestion-field="${esc(payload.suggestionContext?.field || 'subjectName')}"${payload.suggestionContext?.index != null ? ` data-suggestion-index="${payload.suggestionContext.index}"` : ''}>${esc(entry.name)} <span>${entityName(entry.entity)}</span></button>`).join('')}</div>` : ''}
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
    : `${label}s with the ${record.lowerIsBetter ? 'best' : ['finishRate', 'winRate', 'podiumRate', 'gridGain'].includes(record.category) ? 'highest' : 'most'} ${esc(record.label.toLowerCase())}${teamScope}`;
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
        <td data-label="${esc(record.label)}"><strong>${fmtNumber(entry.value)}${esc(record.unit || '')}</strong></td>
        <td data-label="Starts">${fmtNumber(entry.starts)}</td>
        <td data-label="Active span">${entry.firstYear == null ? '—' : esc(entry.firstYear === entry.lastYear ? entry.firstYear : `${entry.firstYear}–${entry.lastYear}`)}</td>
      </tr>`).join('')}</tbody>
    </table></div>
    ${entries.length > 5 ? '<button class="ask-show-results" type="button" data-ask-expand aria-expanded="false">Show all results</button>' : ''}
  </section>`;
}

function raceResultSection(data) {
  return `<section class="ask-evidence" aria-labelledby="ask-race-result-title">
    <div class="ask-section-heading"><div><span>OFFICIAL CLASSIFICATION</span><h2 id="ask-race-result-title">${esc(data.race.year)} ${esc(data.race.name)}</h2></div><small>Round ${fmtNumber(data.race.round)} · ${esc(data.race.circuitName || '')}</small></div>
    ${data.classifications.map(session => `<div class="table-wrap"><table class="ask-ranking-table">
      <caption>${esc(session.name)}</caption>
      <thead><tr><th>Pos.</th><th>Driver</th><th>Constructor</th><th>Points</th><th>Status</th></tr></thead>
      <tbody>${session.entries.map(entry => `<tr><td>${esc(entry.positionText)}</td><td><a href="${esc(entry.href)}"><strong>${esc(entry.name)}</strong></a></td><td>${esc(entry.constructorName || '—')}</td><td>${entry.points == null ? '—' : fmtNumber(entry.points)}</td><td>${esc(entry.status || 'Classified')}</td></tr>`).join('')}</tbody>
    </table></div>`).join('')}
  </section>`;
}

function standingsSection(data) {
  const entity = entityName(data.entity);
  return `<section class="ask-evidence" aria-labelledby="ask-standings-title">
    <div class="ask-section-heading"><div><span>OFFICIAL STANDINGS</span><h2 id="ask-standings-title">${esc(data.season.year)} ${esc(data.entityLabel)} standings</h2></div><small>${data.season.round ? `After round ${fmtNumber(data.season.round)}` : 'Final table'}</small></div>
    <div class="table-wrap"><table class="ask-ranking-table"><caption class="visually-hidden">${esc(data.season.year)} ${esc(data.entityLabel)} standings</caption>
      <thead><tr><th>Rank</th><th>${entity}</th><th>Points</th><th>Wins</th></tr></thead>
      <tbody>${data.standings.map(entry => `<tr${entry.position === 1 ? ' class="ask-ranking-leader"' : ''}><td>${fmtNumber(entry.position)}</td><td><a href="${esc(entry.href)}"><strong>${esc(entry.name)}</strong></a></td><td><strong>${fmtNumber(entry.points)}</strong></td><td>${entry.wins == null ? '—' : fmtNumber(entry.wins)}</td></tr>`).join('')}</tbody>
    </table></div>
  </section>`;
}

function headToHeadSection(data) {
  const [first, second] = data.comparison.drivers;
  const subjectEntity = data.entity === 'constructors' ? 'constructors' : 'drivers';
  const subjectLabel = entityName(subjectEntity);
  const careerComparison = data.comparison.scope === 'career';
  const directHeadToHead = ['race', 'qualifying', 'both'].includes(data.comparison.metric);
  const metricLabel = data.comparison.metricLabel || (data.comparison.metric === 'wins' ? 'Race wins' : 'Result');
  const scoreValue = score => Number(careerComparison || !directHeadToHead ? score.metricValue : data.comparison.metric === 'qualifying' ? score.qualifyingWins : score.raceWins) || 0;
  const chartMax = Math.max(1, ...data.comparison.drivers.map(scoreValue));
  const scoreCard = score => `<article class="ask-comparison-card"><span>${subjectLabel.toUpperCase()}</span><h3><a href="${entityUrl(subjectEntity, score.driver.id)}">${esc(score.driver.name)}</a></h3><strong>${careerComparison || !directHeadToHead ? `${fmtNumber(score.metricValue)}${esc(score.metricUnit || '')} ${esc(metricLabel.toLowerCase())}` : `${fmtNumber(data.comparison.metric === 'qualifying' ? score.qualifyingWins : score.raceWins)} ${data.comparison.metric === 'qualifying' ? 'qualifying' : 'race'} H2H wins`}</strong><meter class="ask-comparison-meter" min="0" max="${chartMax}" value="${scoreValue(score)}" aria-label="${esc(score.driver.name)}: ${scoreValue(score)} ${esc(metricLabel)}"></meter><p>${careerComparison ? data.pointsSystem ? `Recalculated from ${fmtNumber(score.starts)} recorded race starts` : 'Recorded career total in the selected seasons' : `${fmtNumber(score.raceWins)} race H2H wins · ${fmtNumber(score.qualifyingWins)} qualifying H2H wins`}</p></article>`;
  return `<section class="ask-comparison" aria-labelledby="ask-head-to-head-title">
    <div class="ask-section-heading"><div><span>HEAD TO HEAD</span><h2 id="ask-head-to-head-title">${careerComparison ? `${esc(metricLabel)} comparison` : 'Shared race comparison'}</h2></div><small>${careerComparison ? data.pointsSystem ? `${esc(data.pointsSystem.name)} rules` : 'Recorded career totals' : `${fmtNumber(data.comparison.meetings)} starts`}${data.comparison.filters?.constructor ? ` · ${esc(data.comparison.filters.constructor.name)}` : ''}${data.comparison.filters?.circuit ? ` · ${esc(data.comparison.filters.circuit.name)}` : ''}${data.comparison.filters?.venueCountry ? ` · ${esc(data.comparison.filters.venueCountry.name)}` : ''}</small></div>
    <div class="ask-comparison-grid">${scoreCard(first)}${scoreCard(second)}</div>
    ${careerComparison ? '' : `<div class="table-wrap"><table class="ask-ranking-table"><caption class="visually-hidden">Recent shared race results</caption><thead><tr><th>Season</th><th>Race</th><th>${esc(first.driver.name)}</th><th>${esc(second.driver.name)}</th></tr></thead>
      <tbody>${data.comparison.details.map(entry => `<tr><td>${fmtNumber(entry.year)}</td><td>${entry.href ? `<a href="${esc(entry.href)}">${esc(entry.raceName)}</a>` : esc(entry.raceName)}</td><td>${entry.firstPosition || '—'}</td><td>${entry.secondPosition || '—'}</td></tr>`).join('')}</tbody>
    </table></div>`}
  </section>`;
}

function streakSection(data) {
  const streak = data.streak;
  return `<section class="ask-evidence" aria-labelledby="ask-streak-title">
    <div class="ask-section-heading"><div><span>STREAK RECORD</span><h2 id="ask-streak-title">Longest ${esc(streak.label.toLowerCase())}s</h2></div><small>${fmtNumber(streak.total)} drivers with a recorded streak</small></div>
    <div class="table-wrap"><table class="ask-ranking-table"><caption class="visually-hidden">Longest ${esc(streak.label.toLowerCase())}s</caption>
      <thead><tr><th>Rank</th><th>Driver</th><th>Starts</th><th>From</th><th>Through</th></tr></thead>
      <tbody>${streak.ranking.map((entry, index) => `<tr${rankingRowClass(entry, index)}><td>${fmtNumber(entry.rank)}</td><td><a href="${esc(entry.href)}"><strong>${esc(entry.name)}</strong></a></td><td><strong>${fmtNumber(entry.value)}</strong></td><td>${entry.start ? `${fmtNumber(entry.start.year)} ${esc(entry.start.name)}` : '—'}</td><td>${entry.end ? `${fmtNumber(entry.end.year)} ${esc(entry.end.name)}` : '—'}</td></tr>`).join('')}</tbody>
    </table></div>
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

function suggestedFollowUps(data) {
  if (['record_leader', 'record_subject_total'].includes(data.intent)) return [
    'Only since 2022',
    `Now show ${data.entity === 'constructors' ? 'drivers' : entityName('constructors', true).toLowerCase()}`,
    data.scope?.raceFormat === 'S' ? 'Now include all race formats' : askSeries.key === 'f1' ? 'Now include sprints' : 'Only sprint races'
  ];
  if (['driver_head_to_head', 'constructor_head_to_head'].includes(data.intent)) {
    const compared = new Set((data.comparison?.drivers || []).map(score => score.driver?.name));
    const alternative = ['Max Verstappen', 'Lewis Hamilton', 'Fernando Alonso', 'Sebastian Vettel'].find(name => !compared.has(name));
    return [
      data.comparison?.metric === 'qualifying' ? 'Now compare race results' : 'Now compare qualifying',
      data.comparison?.scope === 'teammates' ? 'Now use all shared races' : 'Only as teammates',
      alternative ? `What about ${alternative}?` : 'Only since 2020'
    ];
  }
  if (data.intent === 'race_result') {
    const winner = data.classifications?.[0]?.entries?.[0]?.name;
    return [data.resultView === 'classification' ? 'Show the podium instead' : 'Show the full classification', ...(winner ? [`What about ${winner}?`] : [])];
  }
  if (data.intent === 'season_standings') return [
    `Show ${data.entity === 'constructors' ? 'driver' : entityName('constructors').toLowerCase()} standings instead`,
    data.season?.round ? 'Show the final standings' : 'Show after round 10'
  ];
  if (data.intent === 'streak_leader') return [data.streak?.category === 'wins' ? 'Now show podium streaks' : 'Now show winning streaks', 'Only since 2000', 'Show top 20'];
  if (data.intent === 'compare_points_systems') return ['Only since 2000', 'Now show constructors'];
  return [];
}

function renderAnswer(data) {
  const changed = data.changedChampionships || [];
  const recordIntent = ['record_leader', 'record_subject_total'].includes(data.intent);
  const archiveFact = ['race_result', 'season_standings', 'driver_head_to_head', 'constructor_head_to_head', 'streak_leader'].includes(data.intent);
  const evidence = data.intent === 'race_result' ? raceResultSection(data)
    : data.intent === 'season_standings' ? standingsSection(data)
    : ['driver_head_to_head', 'constructor_head_to_head'].includes(data.intent) ? headToHeadSection(data)
    : data.intent === 'streak_leader' ? streakSection(data)
    : recordIntent
    ? recordSection(data)
    : data.intent === 'compare_points_systems'
    ? comparisonSection(data)
    : data.intent === 'list_changed_championships'
      ? `${changesSection(data)}${rankingSection(data)}`
      : `${explanationSection(data)}${rankingSection(data)}${changesSection(data)}`;
  const answerContext = archiveFact
    ? `Based on the recorded ${esc(askSeriesName)} archive.`
    : recordIntent
    ? data.intent === 'record_subject_total'
      ? `Calculated from the matching results in the recorded ${esc(askSeriesName)} archive.`
      : `Based on ${fmtNumber(data.record.total)} ranked ${entityName(data.entity, true).toLowerCase()} in the recorded ${esc(askSeriesName)} archive.`
    : data.intent === 'compare_points_systems'
    ? 'The same completed seasons were recalculated under both complete rulebooks.'
    : `${fmtNumber(changed.length)} championship${changed.length === 1 ? '' : 's'} change${changed.length === 1 ? 's' : ''} hands compared with the official results.`;
  const scopeSummary = recordIntent ? recordScopeSummary(data) : '';
  const followUps = suggestedFollowUps(data);
  askAnswerStatus.innerHTML = `
    <article class="ask-answer-card">
      <div class="ask-answer-kicker"><span>${recordIntent || archiveFact ? 'OFFICIAL ARCHIVE ANSWER' : 'RECALCULATED ANSWER'}</span><span>${recordIntent ? esc(scopeSummary || data.record.label) : archiveFact ? esc(askSeriesName) : `${fmtNumber(data.seasonsEvaluated)} seasons`}</span></div>
      <h2 tabindex="-1">${esc(data.answer)}</h2>
      <p>${answerContext}</p>
    </article>`;
  askResult.innerHTML = `
    ${data.intent === 'compare_points_systems' || recordIntent ? '' : focusSection(data)}
    ${evidence}
    <details class="ask-method">
      <summary>Evidence, rules and assumptions</summary>
      <div>${data.methodology ? `<dl><dt>Source</dt><dd>${esc(data.methodology.source)}${data.methodology.href ? ` <a href="${esc(data.methodology.href)}">Open source record</a>` : ''}</dd><dt>Coverage</dt><dd>${esc(data.methodology.coverage)}</dd><dt>Sample</dt><dd>${esc(data.methodology.sample)}</dd></dl>` : ''}${data.pointsSystem ? `<ul>${data.pointsSystem.rules.map(rule => `<li>${esc(rule)}</li>`).join('')}</ul>` : ''}<ul>${(data.assumptions || []).map(assumption => `<li>${esc(assumption)}</li>`).join('')}</ul>${data.excludedSeasons?.length ? `<p>Excluded because detailed classifications are incomplete: ${data.excludedSeasons.map(fmtNumber).join(', ')}.</p>` : ''}</div>
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
  if (askExamples) askExamples.hidden = true;
  askRequest?.abort();
  askRequest = new AbortController();
  const request = askRequest;
  askLastInterpretation = interpretation;
  if (pushHistory) history.pushState({}, '', askUrl(query, interpretation));
  renderLoading(query);
  try {
    const response = await fetch('/api/ask', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        query,
        series: askSeries.key,
        ...(askContext && isFollowUpQuery(query) ? { context: askContext } : {}),
        ...(interpretation ? { interpretation } : {})
      }),
      signal: request.signal
    });
    const payload = await response.json();
    if (!response.ok) {
      if (!isFollowUpQuery(query)) askContext = null;
      return renderError(payload);
    }
    askContext = payload.interpretation;
    askLastInterpretation = payload.interpretation;
    const conversationEntry = { query, answer: payload.answer || 'Calculated answer' };
    if (askConversation.at(-1)?.query === query) askConversation[askConversation.length - 1] = conversationEntry;
    else askConversation.push(conversationEntry);
    askConversation = askConversation.slice(-8);
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
    subjectNames: [values.subjectNameA, values.subjectNameB].filter(Boolean),
    eventName: values.eventName,
    resultView: values.resultView,
    standingRound: values.standingRound,
    comparisonScope: values.comparisonScope,
    comparisonMetric: values.comparisonMetric,
    streakCategory: values.streakCategory,
    constructorName: values.constructorName || '',
    circuitName: values.circuitName || '',
    venueCountryName: values.venueCountryName || '',
    nationalityName: values.nationalityName || '',
    raceFormat: values.raceFormat || '',
    resultLimit: values.resultLimit || '',
    minStarts: values.minStarts || '',
    pointsSystemYear: values.pointsSystemYear,
    fromYear: values.fromYear,
    toYear: values.toYear,
    targetSeason: values.targetSeason,
    comparisonPointsSystemYears: [values.comparisonPointsSystemYearA, values.comparisonPointsSystemYearB].filter(Boolean)
  });
});

document.addEventListener('change', event => {
  if (event.target.name === 'circuitName' && event.target.value) {
    const country = event.target.form?.elements.venueCountryName;
    if (country) country.value = '';
  }
  if (event.target.name === 'venueCountryName' && event.target.value) {
    const circuit = event.target.form?.elements.circuitName;
    if (circuit) circuit.value = '';
  }
  if (['entity', 'recordCategory'].includes(event.target.name) && event.target.closest('.ask-interpretation-form')) {
    syncInterpretationForm(event.target.closest('.ask-interpretation-form'));
  }
});

document.addEventListener('click', event => {
  if (askQuestionHelp?.open && !askQuestionHelp.contains(event.target)) askQuestionHelp.open = false;
  const historyEntry = event.target.closest('[data-ask-history-query]');
  if (historyEntry) {
    askQuery.value = historyEntry.dataset.askHistoryQuery;
    askQuery.focus();
    ask(askQuery.value, true);
    return;
  }
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
    const suggestionIndex = Number(nameSuggestion.dataset.suggestionIndex);
    if (nameSuggestion.dataset.suggestionField === 'subjectNames' && Number.isInteger(suggestionIndex) && askLastInterpretation) {
      const revised = { ...askLastInterpretation, subjectNames: [...(askLastInterpretation.subjectNames || [])] };
      revised.subjectNames[suggestionIndex] = nameSuggestion.dataset.askName;
      ask(askQuery.value, true, revised);
      return;
    }
    if (original) {
      const pattern = new RegExp(original.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      askQuery.value = askQuery.value.replace(pattern, nameSuggestion.dataset.askName);
    }
    ask(askQuery.value, true);
    return;
  }
  const example = event.target.closest('[data-ask-example]');
  if (!example) return;
  if (askQuestionHelp) askQuestionHelp.open = false;
  askQuery.value = example.dataset.askExample;
  askQuery.focus();
  ask(askQuery.value, true);
});

document.addEventListener('keydown', event => {
  if (event.key !== 'Escape' || !askQuestionHelp?.open) return;
  askQuestionHelp.open = false;
  askQuestionHelp.querySelector('summary')?.focus();
});

window.addEventListener('popstate', () => {
  askContext = null;
  askConversation = [];
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
    if (askExamples) askExamples.hidden = false;
  }
});

const initialQuestion = new URLSearchParams(location.search).get('q');
if (initialQuestion) {
  askQuery.value = initialQuestion;
  ask(initialQuestion, false, interpretationFromUrl());
}
