let battleData = null;
let battleDrivers = [];
let battleTeammates = [];
let battleView = 'overview';
let battleSeason = '';
let battleRaceFilters = { season: '', team: '', status: '' };
let battleSort = { key: 'date', direction: 'desc' };
let battlePage = 1;
let battleRequest = 0;
let teammateRequest = 0;
let battleController = null;
let teammateController = null;

const battleElement = id => document.getElementById(id);
const battleValidPosition = value => Number.isFinite(Number(value)) && Number(value) > 0 && Number(value) < 100;
const battleMean = values => values.length ? values.reduce((sum, value) => sum + Number(value), 0) / values.length : null;
const battleValid = (value, allowed, fallback) => allowed.includes(String(value)) ? String(value) : fallback;

function battleCategory(text, position) {
  const value = String(text || '').trim();
  if (/\b(?:DNS|DNQ|DNPQ|DID NOT START|WITHDREW|WITHDRAWN|WD)\b/i.test(value)) return 'nonstarter';
  if (/\b(?:DSQ|DQ|DISQ|DISQUALIFIED|EXC|EXCLUDED)\b/i.test(value)) return 'disqualified';
  if (/\b(?:NC|UNC|UNCLASSIFIED)\b/i.test(value)) return 'unclassified';
  if (/\b(?:DNF|RET|RETIRED)\b/i.test(value)) return 'retired';
  return battleValidPosition(position) ? 'classified' : 'unclassified';
}

function battleStatusLabel(text, position) {
  const category = battleCategory(text, position);
  if (category === 'classified') return 'Finished';
  if (valueOrDash(text) !== '—') return String(text);
  return { retired: 'Retired', nonstarter: 'Did not start', disqualified: 'Disqualified', unclassified: 'Unclassified' }[category];
}

function valueOrDash(value) { return value === null || value === undefined || value === '' ? '—' : value; }
function battlePosition(text, position) { return battleValidPosition(position) && !['nonstarter', 'disqualified'].includes(battleCategory(text, position)) ? Number(position) : null; }
function battlePositionLabel(text, position) { const value = battlePosition(text, position); return value ? `P${value}` : '—'; }
function battleQualifyingLabel(value) { return battleValidPosition(value) ? `P${Number(value)}` : '—'; }

function battleRows() { return battleData?.teammateRaces || []; }

function setBattleStatus(message, state = '') {
  battleElement('battle-status').textContent = message;
  battleElement('battle-status').dataset.state = state;
}

function updateBattleUrl(mode = 'replace') {
  const query = new URLSearchParams();
  const first = battleElement('battle-driver').value;
  const second = battleElement('battle-teammate').value;
  if (first) query.set('first', first);
  if (second) query.set('second', second);
  query.set('view', battleView);
  history[mode === 'push' ? 'pushState' : 'replaceState'](null, '', `${location.pathname}?${query}`);
}

function renderSuggestions(targetId, items) {
  battleElement(targetId).innerHTML = items.slice(0, 120).map(item => `<option value="${esc(item.name)}"></option>`).join('');
}

function searchableMatch(items, value, firstMatch = false) {
  const query = String(value || '').trim().toLowerCase();
  if (!query) return null;
  return items.find(item => item.name.toLowerCase() === query || String(item.abbreviation || '').toLowerCase() === query)
    || (firstMatch ? items.find(item => `${item.name} ${item.abbreviation || ''}`.toLowerCase().includes(query)) : null);
}

function chooseFirstDriver(firstMatch = false) {
  const input = battleElement('battle-driver-search');
  if (!input.value.trim()) { input.setCustomValidity(''); return false; }
  const match = searchableMatch(battleDrivers, input.value, firstMatch);
  if (!match) { input.setCustomValidity('Choose a driver from the suggestions.'); input.reportValidity(); return false; }
  input.setCustomValidity(''); input.value = match.name;
  if (String(battleElement('battle-driver').value) === String(match.id)) return true;
  battleElement('battle-driver').value = match.id;
  loadTeammates({ push: true });
  return true;
}

function comparisonScore(races, type) {
  return races.reduce((score, race) => {
    let first = null, second = null, eligible = true;
    if (type === 'race') {
      first = battlePosition(race.firstPositionText, race.firstPosition);
      second = battlePosition(race.secondPositionText, race.secondPosition);
      eligible = first !== null && second !== null;
    } else if (type === 'qualifying') {
      first = battleValidPosition(race.firstQualifying) ? Number(race.firstQualifying) : null;
      second = battleValidPosition(race.secondQualifying) ? Number(race.secondQualifying) : null;
      eligible = first !== null && second !== null;
    } else {
      const firstCategory = battleCategory(race.firstPositionText, race.firstPosition);
      const secondCategory = battleCategory(race.secondPositionText, race.secondPosition);
      eligible = !['nonstarter', 'disqualified'].includes(firstCategory) && !['nonstarter', 'disqualified'].includes(secondCategory);
      first = Number(race.firstPoints || 0); second = Number(race.secondPoints || 0);
    }
    if (!eligible) { score.excluded++; return score; }
    score.compared++;
    if (first === second) score.ties++;
    else if (type === 'race' || type === 'qualifying' ? first < second : first > second) score.first++;
    else score.second++;
    return score;
  }, { first: 0, second: 0, ties: 0, excluded: 0, compared: 0 });
}

function scoreBar(label, score, firstName, secondName, note) {
  const decisive = score.first + score.second;
  const firstWidth = decisive ? score.first / decisive * 100 : 50;
  const firstRate = decisive ? score.first / decisive * 100 : 0;
  const secondRate = decisive ? score.second / decisive * 100 : 0;
  return `<div class="battle-score"><div class="battle-score-heading"><span>${esc(label)}</span><small>${esc(note)}</small></div><div class="battle-score-numbers"><strong>${score.first}</strong><div class="battle-score-track" aria-label="${esc(`${firstName} ${firstRate.toFixed(1)} percent; ${secondName} ${secondRate.toFixed(1)} percent`)}"><i style="width:${firstWidth}%"></i></div><strong>${score.second}</strong></div><div class="battle-score-names"><span>${esc(firstName)} · ${firstRate.toFixed(0)}%</span><span>${secondRate.toFixed(0)}% · ${esc(secondName)}</span></div><p class="battle-score-foot">${score.compared}/${score.compared + score.excluded} comparable · ${score.ties} tie${score.ties === 1 ? '' : 's'} · ${score.excluded} excluded</p></div>`;
}

function pointsTotal(races, key) { return races.reduce((sum, race) => sum + Number(race[key] || 0), 0); }

function renderBattleOverview() {
  const races = battleRows(), [first, second] = battleData.drivers;
  const raceScore = comparisonScore(races, 'race');
  const qualifyingScore = comparisonScore(races, 'qualifying');
  const pointsScore = comparisonScore(races, 'points');
  const firstFinishes = races.map(race => battlePosition(race.firstPositionText, race.firstPosition)).filter(value => value !== null);
  const secondFinishes = races.map(race => battlePosition(race.secondPositionText, race.secondPosition)).filter(value => value !== null);
  const firstFinished = races.filter(race => battleCategory(race.firstPositionText, race.firstPosition) === 'classified').length;
  const secondFinished = races.filter(race => battleCategory(race.secondPositionText, race.secondPosition) === 'classified').length;
  return `<div class="battle-score-grid">${scoreBar('Race head-to-head', raceScore, first.name, second.name, 'Official classifications available for both drivers')}${scoreBar('Qualifying head-to-head', qualifyingScore, first.name, second.name, 'Recorded qualifying positions for both drivers')}${scoreBar('Points head-to-head', pointsScore, first.name, second.name, 'Both drivers started and neither was disqualified')}</div><div class="comparison-scorecard battle-metrics"><div class="comparison-metric"><strong class="${pointsTotal(races, 'firstPoints') > pointsTotal(races, 'secondPoints') ? 'leader' : ''}">${fmtNumber(pointsTotal(races, 'firstPoints'))}</strong><span>Points as teammates</span><strong class="${pointsTotal(races, 'secondPoints') > pointsTotal(races, 'firstPoints') ? 'leader' : ''}">${fmtNumber(pointsTotal(races, 'secondPoints'))}</strong></div><div class="comparison-metric"><strong class="${battleMean(firstFinishes) < battleMean(secondFinishes) ? 'leader' : ''}">${battleMean(firstFinishes)?.toFixed(2) || '—'}</strong><span>Average classification</span><strong class="${battleMean(secondFinishes) < battleMean(firstFinishes) ? 'leader' : ''}">${battleMean(secondFinishes)?.toFixed(2) || '—'}</strong></div><div class="comparison-metric"><strong class="${firstFinished > secondFinished ? 'leader' : ''}">${firstFinished}/${races.length}</strong><span>Finished races</span><strong class="${secondFinished > firstFinished ? 'leader' : ''}">${secondFinished}/${races.length}</strong></div></div><p class="battle-method">Only races for the same team are included. DNS, DNQ and disqualifications remain visible but do not become automatic head-to-head losses; missing qualifying positions remain missing.</p>`;
}

function seasonSummary(races, first, second) {
  const race = comparisonScore(races, 'race'), qualifying = comparisonScore(races, 'qualifying'), points = comparisonScore(races, 'points');
  const teams = [...new Set(races.map(item => item.constructorName).filter(Boolean))].join(', ');
  return `<article class="battle-season-card"><div><span>${races[0].year}</span><h3>${esc(teams || 'Team unavailable')}</h3><small>${races.length} teammate race${races.length === 1 ? '' : 's'}</small><p>${race.compared} race · ${qualifying.compared} qualifying comparisons</p></div><dl><div><dt>Race H2H</dt><dd>${race.first}–${race.second}${race.ties ? `–${race.ties}` : ''}</dd></div><div><dt>Qualifying</dt><dd>${qualifying.first}–${qualifying.second}${qualifying.ties ? `–${qualifying.ties}` : ''}</dd></div><div><dt>Points H2H</dt><dd>${points.first}–${points.second}${points.ties ? `–${points.ties}` : ''}</dd></div><div><dt>Points scored</dt><dd>${fmtNumber(pointsTotal(races, 'firstPoints'))}–${fmtNumber(pointsTotal(races, 'secondPoints'))}</dd></div></dl><a href="${seriesPageUrl('season', 'year', races[0].year)}">View season →</a></article>`;
}

function renderBattleSeasons() {
  const races = battleRows(), [first, second] = battleData.drivers;
  const years = [...new Set(races.map(race => Number(race.year)))].sort((a, b) => b - a);
  const filteredYears = battleSeason ? years.filter(year => String(year) === battleSeason) : years;
  return `<div class="battle-season-toolbar"><label>Season<select id="battle-season-filter"><option value="">All teammate seasons</option>${years.map(year => `<option value="${year}" ${battleSeason === String(year) ? 'selected' : ''}>${year}</option>`).join('')}</select></label></div><div class="battle-season-list">${filteredYears.map(year => seasonSummary(races.filter(race => Number(race.year) === year), first, second)).join('') || '<div class="empty-state">No teammate season matches this filter.</div>'}</div>`;
}

function raceStatusGroup(race) {
  const categories = [battleCategory(race.firstPositionText, race.firstPosition), battleCategory(race.secondPositionText, race.secondPosition)];
  if (categories.includes('disqualified')) return 'disqualified';
  if (categories.includes('nonstarter')) return 'nonstarter';
  if (categories.includes('retired')) return 'retired';
  if (categories.includes('unclassified')) return 'unclassified';
  return 'classified';
}

function raceSortValue(race, key) {
  if (key === 'date') return new Date(race.date || `${race.year}-01-01`).getTime();
  if (key === 'race') return displayRaceName(race).toLowerCase();
  if (key === 'team') return String(race.constructorName || '').toLowerCase();
  if (key === 'first') return battlePosition(race.firstPositionText, race.firstPosition) || 999;
  if (key === 'second') return battlePosition(race.secondPositionText, race.secondPosition) || 999;
  if (key === 'status') return raceStatusGroup(race);
  return 0;
}

function raceDriverCells(race, prefix) {
  const text = race[`${prefix}PositionText`], position = race[`${prefix}Position`], category = battleCategory(text, position);
  return `<td>${battlePositionLabel(text, position)}</td><td><span class="battle-result-status ${category}">${esc(battleStatusLabel(text, position))}</span></td><td>${battleQualifyingLabel(race[`${prefix}Qualifying`])}</td><td>${fmtNumber(race[`${prefix}Points`])}</td>`;
}

function mobileRaceCard(race, first, second) {
  const driver = (name, prefix) => `<div><strong>${esc(name)}</strong><span>${battlePositionLabel(race[`${prefix}PositionText`], race[`${prefix}Position`])} · ${esc(battleStatusLabel(race[`${prefix}PositionText`], race[`${prefix}Position`]))}<br>Qual. ${battleQualifyingLabel(race[`${prefix}Qualifying`])} · ${fmtNumber(race[`${prefix}Points`])} pts</span></div>`;
  return `<article class="battle-mobile-card"><a href="${seriesPageUrl('race', 'id', race.raceId)}">${esc(race.year)} ${esc(displayRaceName(race))}</a><small>${esc(race.constructorName || 'Team unavailable')} · ${esc(fmtDate(race.date))}</small><div class="battle-mobile-pair">${driver(first.name, 'first')}${driver(second.name, 'second')}</div></article>`;
}

function renderBattleRaces() {
  const races = battleRows(), [first, second] = battleData.drivers;
  const years = [...new Set(races.map(race => Number(race.year)))].sort((a, b) => b - a);
  const teams = [...new Set(races.map(race => race.constructorName).filter(Boolean))].sort();
  let filtered = races.filter(race => (!battleRaceFilters.season || String(race.year) === battleRaceFilters.season) && (!battleRaceFilters.team || race.constructorName === battleRaceFilters.team) && (!battleRaceFilters.status || raceStatusGroup(race) === battleRaceFilters.status));
  filtered.sort((a, b) => { const firstValue = raceSortValue(a, battleSort.key), secondValue = raceSortValue(b, battleSort.key); const order = typeof firstValue === 'string' ? firstValue.localeCompare(secondValue) : firstValue - secondValue; return battleSort.direction === 'asc' ? order : -order; });
  const paged = pageItems(filtered, battlePage, 25); battlePage = paged.page;
  const columns = [['date', 'Date'], ['race', 'Race'], ['team', 'Team'], ['first', first.name], ['first-status', 'Status'], ['first-qualifying', 'Qual.'], ['first-points', 'Pts'], ['second', second.name], ['second-status', 'Status'], ['second-qualifying', 'Qual.'], ['second-points', 'Pts']];
  const headings = columns.map(([key, label]) => ['date', 'race', 'team', 'first', 'second'].includes(key) ? `<th><button type="button" data-battle-sort="${key}">${esc(label)}${battleSort.key === key ? (battleSort.direction === 'asc' ? ' ↑' : ' ↓') : ''}</button></th>` : `<th>${esc(label)}</th>`).join('');
  const tableRows = paged.items.map(race => `<tr><td>${esc(fmtDate(race.date))}</td><td><a href="${seriesPageUrl('race', 'id', race.raceId)}">${esc(race.year)} ${esc(displayRaceName(race))}</a></td><td>${esc(race.constructorName || '—')}</td>${raceDriverCells(race, 'first')}${raceDriverCells(race, 'second')}</tr>`).join('');
  return `<div class="battle-race-heading"><div><h2>Teammate races</h2><p>Separate classifications, statuses, qualifying positions and points.</p></div><span class="battle-results-count">${filtered.length} of ${races.length} races</span></div><div class="battle-race-filters"><label>Season<select id="battle-race-season"><option value="">All seasons</option>${years.map(year => `<option value="${year}" ${battleRaceFilters.season === String(year) ? 'selected' : ''}>${year}</option>`).join('')}</select></label><label>Team<select id="battle-race-team"><option value="">All teams</option>${teams.map(team => `<option value="${esc(team)}" ${battleRaceFilters.team === team ? 'selected' : ''}>${esc(team)}</option>`).join('')}</select></label><label>Outcome<select id="battle-race-status"><option value="">All outcomes</option>${[['classified','Both finished'],['retired','Retirement involved'],['nonstarter','Non-starter involved'],['disqualified','Disqualification involved'],['unclassified','Unclassified involved']].map(([value, label]) => `<option value="${value}" ${battleRaceFilters.status === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label><button type="button" id="battle-race-reset" class="battle-filter-reset">Reset filters</button></div><div id="battle-results-region"><div class="table-wrap battle-results-table-wrap" tabindex="0" aria-label="Sortable teammate race results"><table class="battle-results-table"><thead><tr>${headings}</tr></thead><tbody>${tableRows || '<tr><td colspan="11">No races match these filters.</td></tr>'}</tbody></table></div><div class="battle-mobile-results">${paged.items.map(race => mobileRaceCard(race, first, second)).join('') || '<div class="empty-state">No races match these filters.</div>'}</div></div>`;
}

function bindBattlePanel() {
  if (battleView === 'seasons') battleElement('battle-season-filter')?.addEventListener('change', event => { battleSeason = event.target.value; renderBattlePanel(); });
  if (battleView === 'races') {
    [['battle-race-season', 'season'], ['battle-race-team', 'team'], ['battle-race-status', 'status']].forEach(([id, key]) => battleElement(id)?.addEventListener('change', event => { battleRaceFilters[key] = event.target.value; battlePage = 1; renderBattlePanel(); }));
    battleElement('battle-race-reset')?.addEventListener('click', () => { battleRaceFilters = { season: '', team: '', status: '' }; battlePage = 1; renderBattlePanel(); });
    document.querySelectorAll('[data-battle-sort]').forEach(button => button.addEventListener('click', () => { const key = button.dataset.battleSort; battleSort = battleSort.key === key ? { key, direction: battleSort.direction === 'asc' ? 'desc' : 'asc' } : { key, direction: ['race', 'team', 'first', 'second'].includes(key) ? 'asc' : 'desc' }; battlePage = 1; renderBattlePanel(); }));
    renderPagination('battle-results-region', battleRows().filter(race => (!battleRaceFilters.season || String(race.year) === battleRaceFilters.season) && (!battleRaceFilters.team || race.constructorName === battleRaceFilters.team) && (!battleRaceFilters.status || raceStatusGroup(race) === battleRaceFilters.status)).length, battlePage, 25, page => { battlePage = page; renderBattlePanel(); });
  }
}

function renderBattlePanel() {
  const panel = battleElement(`battle-panel-${battleView}`);
  if (!panel) return;
  panel.innerHTML = battleView === 'overview' ? renderBattleOverview() : battleView === 'seasons' ? renderBattleSeasons() : renderBattleRaces();
  bindBattlePanel();
}

function selectBattleView(value, { update = true, focus = false } = {}) {
  battleView = battleValid(value, ['overview', 'seasons', 'races'], 'overview');
  document.querySelectorAll('[data-battle-panel]').forEach(panel => { panel.hidden = panel.dataset.battlePanel !== battleView; });
  document.querySelectorAll('[data-battle-view]').forEach(button => { const active = button.dataset.battleView === battleView; button.setAttribute('aria-selected', String(active)); button.tabIndex = active ? 0 : -1; if (active && focus) button.focus(); });
  const select = battleElement('battle-view'); if (select) select.value = battleView;
  renderBattlePanel();
  if (update) updateBattleUrl();
}

function renderBattle() {
  const races = battleRows(), [first, second] = battleData.drivers;
  if (!races.length) {
    battleElement('battle-content').innerHTML = '<div class="empty-state">These drivers have no recorded races for the same team.</div>';
    setBattleStatus(`${first.name} and ${second.name} have no recorded teammate races.`, 'empty');
    return;
  }
  const years = races.map(race => Number(race.year)).filter(Boolean);
  const teams = [...new Set(races.map(race => race.constructorName).filter(Boolean))];
  battleElement('battle-content').innerHTML = `<section class="battle-identity"><a href="${seriesPageUrl('driver', 'id', first.id)}"><span>${esc(displayCountryName(first.nationalityCountryId))}</span><h2>${esc(first.name)}</h2></a><div>${races.length} teammate race${races.length === 1 ? '' : 's'}<br>${Math.min(...years)}–${Math.max(...years)}</div><a href="${seriesPageUrl('driver', 'id', second.id)}"><span>${esc(displayCountryName(second.nationalityCountryId))}</span><h2>${esc(second.name)}</h2></a></section><div id="battle-workspace"><nav class="analysis-visualization-menu" aria-label="Teammate battle views"><label class="analysis-mobile-view">Battle view<select id="battle-view"><option value="overview">Overview</option><option value="seasons">Shared seasons</option><option value="races">Teammate races</option></select></label><div class="analysis-visualization-tabs" role="tablist"><button id="battle-tab-overview" type="button" role="tab" aria-controls="battle-panel-overview" data-battle-view="overview">Overview</button><button id="battle-tab-seasons" type="button" role="tab" aria-controls="battle-panel-seasons" data-battle-view="seasons">Shared seasons</button><button id="battle-tab-races" type="button" role="tab" aria-controls="battle-panel-races" data-battle-view="races">Teammate races</button></div></nav><div class="battle-workspace-content"><section id="battle-panel-overview" role="tabpanel" aria-labelledby="battle-tab-overview" data-battle-panel="overview"></section><section id="battle-panel-seasons" role="tabpanel" aria-labelledby="battle-tab-seasons" data-battle-panel="seasons" hidden></section><section id="battle-panel-races" role="tabpanel" aria-labelledby="battle-tab-races" data-battle-panel="races" hidden></section></div></div>`;
  document.querySelectorAll('[data-battle-view]').forEach(button => button.addEventListener('click', () => selectBattleView(button.dataset.battleView)));
  battleElement('battle-view').addEventListener('change', event => selectBattleView(event.target.value));
  document.querySelector('#battle-workspace .analysis-visualization-tabs').addEventListener('keydown', event => { if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return; event.preventDefault(); const values = ['overview', 'seasons', 'races']; const current = values.indexOf(battleView); const next = event.key === 'Home' ? 0 : event.key === 'End' ? values.length - 1 : (current + (event.key === 'ArrowRight' ? 1 : -1) + values.length) % values.length; selectBattleView(values[next], { focus: true }); });
  selectBattleView(battleView, { update: false });
  setBattleStatus(`${first.name} and ${second.name} · ${races.length} same-team races · ${teams.join(', ')}`, 'ready');
  document.title = `${first.name} vs ${second.name} · ${activeSeriesName()} · Racelytic`;
}

async function loadBattle({ push = false } = {}) {
  const first = battleElement('battle-driver').value, second = battleElement('battle-teammate').value;
  if (!first || !second || first === second) return;
  const request = ++battleRequest;
  battleController?.abort(); battleController = new AbortController();
  setBattleStatus('Building teammate battle…', 'loading');
  battleElement('battle-content').innerHTML = '<div class="loading-state">Building teammate battle…</div>';
  updateBattleUrl(push ? 'push' : 'replace');
  try {
    const data = await getJSON(`/api/drivers/compare?ids=${encodeURIComponent(first)},${encodeURIComponent(second)}`, { signal: battleController.signal });
    if (request !== battleRequest) return;
    battleData = data;
    try { localStorage.setItem(`racelytic-teammate-battle-${activeSeriesKey()}`, `${first},${second}`); } catch {}
    battleElement('swap-battle-drivers').disabled = false;
    renderBattle();
  } catch (error) {
    if (error.name === 'AbortError' || request !== battleRequest) return;
    setBattleStatus(error.message || 'Unable to load this teammate battle.', 'error');
    battleElement('battle-content').innerHTML = `<div class="empty-state">${esc(error.message || 'Unable to load this teammate battle.')}</div>`;
  }
}

async function loadTeammates({ preferred = '', push = false } = {}) {
  const id = battleElement('battle-driver').value;
  if (!id) return;
  const request = ++teammateRequest;
  teammateController?.abort(); teammateController = new AbortController();
  battleElement('battle-teammate').innerHTML = '<option value="">Loading teammates…</option>';
  battleElement('battle-teammate').disabled = true;
  setBattleStatus('Loading teammates…', 'loading');
  try {
    const teammates = await getJSON(`/api/drivers/${encodeURIComponent(id)}/teammates`, { signal: teammateController.signal });
    if (request !== teammateRequest) return;
    battleTeammates = [...teammates].sort((a, b) => Number(b.lastSeason || 0) - Number(a.lastSeason || 0) || Number(b.sharedRaces || 0) - Number(a.sharedRaces || 0) || a.name.localeCompare(b.name));
    const match = battleTeammates.find(item => String(item.id) === String(preferred)) || battleTeammates[0];
    battleElement('battle-teammate').innerHTML = battleTeammates.length ? battleTeammates.map(teammate => `<option value="${esc(teammate.id)}">${esc(teammate.name)}</option>`).join('') : '<option value="">No teammates found</option>';
    battleElement('battle-teammate').value = match?.id || '';
    battleElement('battle-teammate').disabled = !battleTeammates.length;
    if (match) loadBattle({ push });
    else { battleElement('battle-content').innerHTML = '<div class="empty-state">No recorded teammates were found for this driver.</div>'; setBattleStatus('No recorded teammates found.', 'empty'); }
  } catch (error) {
    if (error.name === 'AbortError' || request !== teammateRequest) return;
    setBattleStatus(error.message || 'Unable to load teammates.', 'error');
    battleElement('battle-content').innerHTML = `<div class="empty-state">${esc(error.message || 'Unable to load teammates.')}</div>`;
  }
}

async function swapBattleDrivers() {
  const first = battleElement('battle-driver').value, second = battleElement('battle-teammate').value;
  if (!first || !second) return;
  const secondDriver = battleDrivers.find(driver => String(driver.id) === String(second));
  battleElement('battle-driver').value = second;
  battleElement('battle-driver-search').value = secondDriver?.name || battleElement('battle-teammate').selectedOptions[0]?.textContent || '';
  await loadTeammates({ preferred: first, push: true });
}

function resetBattleDrivers() {
  battleController?.abort(); teammateController?.abort();
  battleRequest++; teammateRequest++;
  battleData = null; battleTeammates = [];
  battleElement('battle-driver').value = '';
  battleElement('battle-teammate').value = '';
  battleElement('battle-driver-search').value = '';
  battleElement('battle-teammate').innerHTML = '<option value="">Choose a driver first</option>';
  battleElement('battle-teammate').disabled = true;
  battleElement('swap-battle-drivers').disabled = true;
  battleElement('battle-content').innerHTML = '<div class="empty-state">Choose a driver, then select one of their recorded teammates.</div>';
  setBattleStatus('Choose a driver to start a teammate comparison.', 'empty');
  updateBattleUrl('push');
  battleElement('battle-driver-search').focus();
}

async function initialiseBattle() {
  const query = params();
  battleView = battleValid(query.get('view'), ['overview', 'seasons', 'races'], 'overview');
  battleElement('battle-series-label').textContent = `${activeSeriesName().toUpperCase()} · TEAMMATES`;
  battleElement('swap-battle-drivers').disabled = true;
  try {
    battleDrivers = await getJSON('/api/drivers?limit=1000');
    battleDrivers.sort((a, b) => Number(b.lastYear || 0) - Number(a.lastYear || 0) || Number(b.totalRaceWins || 0) - Number(a.totalRaceWins || 0) || a.name.localeCompare(b.name));
    renderSuggestions('battle-driver-options', battleDrivers);
    let saved = [];
    try { saved = String(localStorage.getItem(`racelytic-teammate-battle-${activeSeriesKey()}`) || '').split(','); } catch {}
    const firstId = query.get('first') || saved[0] || battleDrivers[0]?.id;
    const first = battleDrivers.find(driver => String(driver.id) === String(firstId)) || battleDrivers[0];
    battleElement('battle-driver').value = first?.id || '';
    battleElement('battle-driver-search').value = first?.name || '';
    battleElement('battle-driver-search').disabled = !first;
    await loadTeammates({ preferred: query.get('second') || saved[1] || '' });
  } catch (error) {
    setBattleStatus(error.message || 'Unable to load drivers.', 'error');
    battleElement('battle-content').innerHTML = `<div class="empty-state">${esc(error.message || 'Unable to load drivers.')}</div>`;
  }
}

battleElement('battle-driver-search').addEventListener('input', event => { event.currentTarget.setCustomValidity(''); const query = event.target.value.toLowerCase(); renderSuggestions('battle-driver-options', query ? battleDrivers.filter(driver => `${driver.name} ${driver.abbreviation || ''}`.toLowerCase().includes(query)) : battleDrivers); });
battleElement('battle-driver-search').addEventListener('change', () => chooseFirstDriver());
battleElement('battle-driver-search').addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); chooseFirstDriver(true); } });
battleElement('battle-teammate').addEventListener('change', () => loadBattle({ push: true }));
battleElement('swap-battle-drivers').addEventListener('click', swapBattleDrivers);
battleElement('reset-battle-drivers').addEventListener('click', resetBattleDrivers);
window.addEventListener('popstate', () => location.reload());

initialiseBattle();
