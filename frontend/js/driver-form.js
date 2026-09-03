let driverFormData = null;
let formDrivers = [];
let formMetric = 'finish';
let formView = 'trend';
let formCircuitScope = 'selected';
let formCircuitMinimum = 2;
let formResultSort = { key: 'date', direction: 'desc' };
let formResultFilters = { constructor: '', year: '', status: '' };
let formRequest = 0;
let formController = null;

const formElement = id => document.getElementById(id);
const validValues = (value, allowed, fallback) => allowed.includes(String(value)) ? String(value) : fallback;
const mean = values => values.length ? values.reduce((sum, value) => sum + Number(value), 0) / values.length : null;

function statusCategory(result) {
  const positionText = String(result.positionText || '').trim();
  const reason = String(result.reasonRetired || '').trim();
  const combined = `${positionText} ${reason}`;
  if (/\b(?:DNS|DNQ|DNPQ|DID NOT START|WITHDREW|WITHDRAWN|WD)\b/i.test(combined)) return 'nonstarter';
  if (/\b(?:DSQ|DQ|DISQ|DISQUALIFIED|EXC|EXCLUDED)\b/i.test(combined)) return 'disqualified';
  if (/\b(?:NC|UNC|UNCLASSIFIED)\b/i.test(combined)) return 'unclassified';
  if (/\b(?:DNF|RET|RETIRED)\b/i.test(combined)) return 'retired';
  if (reason && !/^(?:finished|running|classified|cla|\+?\d+\s+laps?)$/i.test(reason)) return 'retired';
  return Number(result.position) > 0 ? 'classified' : 'unclassified';
}

function statusLabel(result) {
  const category = statusCategory(result);
  if (category === 'classified') return 'Finished';
  if (category === 'nonstarter') return String(result.positionText || result.reasonRetired || 'Did not start');
  if (category === 'disqualified') return String(result.positionText || result.reasonRetired || 'Disqualified');
  if (category === 'retired') return String(result.reasonRetired || result.positionText || 'Retired');
  return String(result.positionText || result.reasonRetired || 'Unclassified');
}

function officialClassification(result) {
  const category = statusCategory(result);
  return Number(result.position) > 0 && category !== 'disqualified' && category !== 'nonstarter' ? Number(result.position) : null;
}

function selectedFormResults() {
  if (!driverFormData) return [];
  const range = formElement('form-range').value;
  return range === 'all' ? [...driverFormData.results] : driverFormData.results.slice(0, Number(range));
}

function resultLabel(result, compact = false) {
  const race = displayRaceName(result, compact);
  const session = result.sessionName || (String(result.officialName || '').includes(' · ') ? String(result.officialName).split(' · ').pop() : '');
  return activeSeriesKey() === 'f1' || !session || race.includes(session) ? race : `${race} · ${session}`;
}

function positionLabel(value) { return Number(value) > 0 ? `P${Number(value)}` : 'Missing'; }

function formFinishLabel(result) {
  const position = officialClassification(result);
  return position ? `P${position}` : '—';
}

function timingLabel(result) {
  if (result.time) return String(result.time);
  if (result.gap) return String(result.gap);
  if (Number(result.gapLaps) > 0) return `+${result.gapLaps} lap${Number(result.gapLaps) === 1 ? '' : 's'}`;
  if (Number(result.gapMillis) > 0) return `+${(Number(result.gapMillis) / 1000).toFixed(3)}s`;
  return '—';
}

function updateFormUrl(mode = 'replace') {
  const query = new URLSearchParams();
  const driver = formElement('form-driver')?.value;
  if (driver) query.set('driver', driver);
  query.set('range', formElement('form-range')?.value || '10');
  query.set('window', formElement('form-window')?.value || '5');
  query.set('metric', formMetric);
  query.set('view', formView);
  const next = `${location.pathname}?${query}`;
  history[mode === 'push' ? 'pushState' : 'replaceState'](null, '', next);
}

function setFormStatus(message, state = '') {
  const status = formElement('driver-form-status');
  status.textContent = message;
  status.dataset.state = state;
}

function showFormLoading() {
  setFormStatus('Loading driver form…', 'loading');
  formElement('driver-form-summary').innerHTML = '<div><span>Average finish</span><strong>—</strong><small>Loading…</small></div><div><span>Average qualifying</span><strong>—</strong><small>Loading…</small></div><div><span>Points</span><strong>—</strong><small>Loading…</small></div><div><span>Classified rate</span><strong>—</strong><small>Loading…</small></div>';
  formElement('driver-form-workspace').hidden = true;
}

function rollingValues(results, key, windowSize) {
  const chronological = [...results].reverse();
  return chronological.map((result, index) => {
    const raw = Number(result[key]);
    if (!(raw > 0)) return { result, value: null, raw: null, sample: 0 };
    if (windowSize === 1) return { result, value: raw, raw, sample: 1 };
    const values = chronological.slice(Math.max(0, index - windowSize + 1), index + 1)
      .map(item => Number(item[key])).filter(value => value > 0);
    return { result, value: mean(values), raw, sample: values.length };
  });
}

function chartPath(points, x, y) {
  let path = '';
  let drawing = false;
  points.forEach((point, index) => {
    if (point.value === null) { drawing = false; return; }
    path += `${drawing ? 'L' : 'M'}${x(index)},${y(point.value)} `;
    drawing = true;
  });
  return path.trim();
}

function trendReadoutMarkup(point, key, windowSize) {
  if (!point) return 'Focus or select a race to inspect it.';
  const result = point.result;
  const measured = point.value === null ? 'No recorded position' : `${positionLabel(point.value)}${windowSize > 1 ? ` · ${point.sample}-race sample` : ''}`;
  return `<strong>${esc(result.year)} ${esc(resultLabel(result))}</strong>${esc(result.constructorName || 'Unknown team')} · ${esc(key === 'position' ? formFinishLabel(result) : positionLabel(result.qualifying))} · ${esc(statusLabel(result))}<br>${windowSize === 1 ? 'Raw result' : `${windowSize}-race rolling form`}: ${esc(measured)} · ${fmtNumber(result.points)} points`;
}

function bindTrendReadouts(points, key, windowSize) {
  const readout = formElement('form-trend-readout');
  const show = index => { readout.innerHTML = trendReadoutMarkup(points[Number(index)], key, windowSize); };
  document.querySelectorAll('[data-form-point]').forEach(element => {
    element.addEventListener('focus', () => show(element.dataset.formPoint));
    element.addEventListener('pointerenter', () => show(element.dataset.formPoint));
    element.addEventListener('click', () => show(element.dataset.formPoint));
  });
  show(points.length - 1);
}

function renderFormTrend(results) {
  const windowSize = Number(formElement('form-window').value);
  const key = formMetric === 'finish' ? 'position' : 'qualifying';
  const label = formMetric === 'finish' ? 'Finishing position' : 'Qualifying position';
  const points = rollingValues(results, key, windowSize);
  const numeric = points.map(point => point.value).filter(value => value !== null);
  const rawAverage = mean(results.map(result => Number(result[key])).filter(value => value > 0));
  const width = 960, height = 350, left = 46, right = 24, top = 24, bottom = 42;
  const maximum = Math.max(20, ...numeric, rawAverage || 0);
  const x = index => left + index / Math.max(points.length - 1, 1) * (width - left - right);
  const y = value => top + (value - 1) / Math.max(maximum - 1, 1) * (height - top - bottom);
  const grid = [1, 5, 10, 15, 20].filter(value => value <= maximum).map(value => `<line x1="${left}" y1="${y(value)}" x2="${width - right}" y2="${y(value)}"></line><text x="${left - 8}" y="${y(value) + 4}" text-anchor="end">P${value}</text>`).join('');
  const average = rawAverage === null ? '' : `<g class="form-average-line"><line x1="${left}" y1="${y(rawAverage)}" x2="${width - right}" y2="${y(rawAverage)}"></line><rect x="${width - right - 105}" y="${y(rawAverage) - 21}" width="105" height="18" rx="4"></rect><text x="${width - right - 7}" y="${y(rawAverage) - 8}" text-anchor="end">Mean P${rawAverage.toFixed(2)}</text></g>`;
  const circles = points.map((point, index) => point.value === null
    ? `<text class="form-gap-marker" x="${x(index)}" y="${height - 17}" text-anchor="middle">×</text>`
    : `<circle tabindex="0" role="button" aria-label="${esc(`${point.result.year} ${resultLabel(point.result)} ${label} ${point.value.toFixed(2)}`)}" data-form-point="${index}" cx="${x(index)}" cy="${y(point.value)}" r="5"></circle>`).join('');
  const maximumPoints = Math.max(1, ...results.map(result => Number(result.points || 0)));
  const chronological = [...results].reverse();
  const pointBars = chronological.map((result, index) => `<button type="button" data-form-point="${index}" aria-label="${esc(`${result.year} ${resultLabel(result)}, ${fmtNumber(result.points)} points`)}" style="--points:${Math.max(2, Number(result.points || 0) / maximumPoints * 100)}%"><i></i><span>${esc(activeSeriesKey() === 'f1' ? `R${result.round}` : `${String(result.sessionName || 'R').toLowerCase().includes('sprint') ? 'S' : 'F'}${result.round}`)}</span></button>`).join('');
  formElement('driver-form-trend').innerHTML = `<section class="analysis-chart-section"><div class="section-heading"><div><h2>${label}</h2><p>${windowSize === 1 ? 'Raw race-by-race position' : `${windowSize}-race rolling average`}; gaps mark missing classifications.</p></div><div class="form-metric-switch" role="group" aria-label="Form metric"><button type="button" data-form-metric="finish" aria-pressed="${formMetric === 'finish'}">Finish</button><button type="button" data-form-metric="qualifying" aria-pressed="${formMetric === 'qualifying'}">Qualifying</button></div></div>${points.length ? `<div class="form-trend-chart"><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(label)} over the selected races"><g class="chart-grid">${grid}</g>${average}<g class="chart-series" style="--series-color:${activeSeriesAccent()}"><path d="${chartPath(points, x, y)}"></path>${circles}</g></svg></div><div id="form-trend-readout" class="form-trend-readout" aria-live="polite"></div><div class="form-points-scroll" aria-label="Points by race"><div class="form-points-strip" style="--race-count:${Math.max(points.length, 1)}">${pointBars}</div></div>` : '<div class="empty-state">No results are available in this range.</div>'}</section>`;
  document.querySelectorAll('[data-form-metric]').forEach(button => button.addEventListener('click', () => { formMetric = button.dataset.formMetric; updateFormUrl(); renderFormTrend(results); }));
  if (points.length) bindTrendReadouts(points, key, windowSize);
}

function comparableResult(result) {
  return Number(result.position) > 0 && !['nonstarter', 'disqualified'].includes(statusCategory(result));
}

function renderFormTeammates(results) {
  const map = new Map();
  results.forEach(result => result.teammates.forEach(mate => {
    const id = String(mate.driverId);
    const entry = map.get(id) || { ...mate, shared: 0, raceWins: 0, raceLosses: 0, raceTies: 0, raceCompared: 0, qualiWins: 0, qualiLosses: 0, qualiTies: 0, qualiCompared: 0, driverPoints: 0, matePoints: 0 };
    entry.shared++;
    entry.driverPoints += Number(result.points || 0);
    entry.matePoints += Number(mate.points || 0);
    if (comparableResult(result) && comparableResult(mate)) { entry.raceCompared++; result.position < mate.position ? entry.raceWins++ : result.position > mate.position ? entry.raceLosses++ : entry.raceTies++; }
    if (Number(result.qualifying) > 0 && Number(mate.qualifying) > 0) { entry.qualiCompared++; result.qualifying < mate.qualifying ? entry.qualiWins++ : result.qualifying > mate.qualifying ? entry.qualiLosses++ : entry.qualiTies++; }
    map.set(id, entry);
  }));
  const entries = [...map.values()].sort((a, b) => b.shared - a.shared || a.driverName.localeCompare(b.driverName));
  const cards = entries.map(entry => `<a class="form-teammate-card" href="${seriesPageUrl('driver', 'id', entry.driverId)}"><span>${entry.shared} shared start${entry.shared === 1 ? '' : 's'}</span><h3>${esc(entry.driverName)}</h3><dl><div><dt>Race H2H</dt><dd>${entry.raceWins}–${entry.raceLosses}${entry.raceTies ? `–${entry.raceTies}` : ''}</dd></div><div><dt>Qualifying</dt><dd>${entry.qualiWins}–${entry.qualiLosses}${entry.qualiTies ? `–${entry.qualiTies}` : ''}</dd></div><div><dt>Points</dt><dd>${fmtNumber(entry.driverPoints)}–${fmtNumber(entry.matePoints)}</dd></div></dl><p>${entry.raceCompared}/${entry.shared} race and ${entry.qualiCompared}/${entry.shared} qualifying comparisons available.</p></a>`).join('');
  formElement('driver-form-teammates').innerHTML = `<section class="analysis-chart-section"><div class="section-heading"><div><h2>Teammate comparison</h2><p>Same-team sessions within the selected range; missing and non-starting classifications are excluded.</p></div></div>${cards ? `<div class="form-teammate-grid">${cards}</div>` : '<div class="empty-state">No teammate comparisons are available in this range.</div>'}</section>`;
}

function circuitRows(results) {
  const map = new Map();
  results.forEach(result => {
    if (!result.circuitId) return;
    const id = String(result.circuitId);
    const entry = map.get(id) || { id, name: result.circuitName, starts: 0, points: 0, positions: [], wins: 0 };
    if (statusCategory(result) !== 'nonstarter') entry.starts++;
    entry.points += Number(result.points || 0);
    if (officialClassification(result)) entry.positions.push(Number(result.position));
    if (Number(result.position) === 1) entry.wins++;
    map.set(id, entry);
  });
  return [...map.values()].map(entry => ({ ...entry, average: mean(entry.positions) }))
    .filter(entry => entry.average !== null && entry.starts >= formCircuitMinimum)
    .sort((a, b) => a.average - b.average || b.starts - a.starts);
}

function renderFormCircuits() {
  const scopeResults = formCircuitScope === 'career' ? driverFormData.results : selectedFormResults();
  const circuits = circuitRows(scopeResults);
  const rows = entries => entries.map((entry, index) => `<a href="${seriesPageUrl('circuit', 'id', entry.id)}"><b>${index + 1}</b><span>${esc(entry.name)}<small>${entry.starts} starts · ${fmtNumber(entry.points)} pts · ${entry.wins} win${entry.wins === 1 ? '' : 's'}</small></span><strong>P${entry.average.toFixed(2)}</strong></a>`).join('');
  formElement('driver-form-circuits').innerHTML = `<section class="analysis-chart-section"><div class="section-heading"><div><h2>Best and toughest circuits</h2><p>Average classified finish with a minimum-start threshold.</p></div><div class="form-view-controls"><label>Scope<select id="form-circuit-scope"><option value="selected" ${formCircuitScope === 'selected' ? 'selected' : ''}>Selected races</option><option value="career" ${formCircuitScope === 'career' ? 'selected' : ''}>Entire career</option></select></label><label>Minimum starts<select id="form-circuit-minimum"><option value="1" ${formCircuitMinimum === 1 ? 'selected' : ''}>1 start</option><option value="2" ${formCircuitMinimum === 2 ? 'selected' : ''}>2 starts</option><option value="3" ${formCircuitMinimum === 3 ? 'selected' : ''}>3 starts</option><option value="5" ${formCircuitMinimum === 5 ? 'selected' : ''}>5 starts</option></select></label></div></div>${circuits.length ? `<div class="form-circuit-columns"><div><h3>Strongest average finishes</h3>${rows(circuits.slice(0, 10))}</div><div><h3>Toughest average finishes</h3>${rows([...circuits].reverse().slice(0, 10))}</div></div>` : '<div class="empty-state">No circuits meet this scope and minimum-start threshold.</div>'}</section>`;
  formElement('form-circuit-scope').addEventListener('change', event => { formCircuitScope = event.target.value; renderFormCircuits(); });
  formElement('form-circuit-minimum').addEventListener('change', event => { formCircuitMinimum = Number(event.target.value); renderFormCircuits(); });
}

function sortValue(result, key) {
  if (key === 'race') return resultLabel(result).toLowerCase();
  if (key === 'constructor') return String(result.constructorName || '').toLowerCase();
  if (key === 'date') return new Date(result.date || `${result.year}-01-01`).getTime();
  if (key === 'status') return statusCategory(result);
  if (key === 'timing') {
    if (Number(result.gapLaps) > 0) return Number(result.gapLaps) * 86400000;
    if (Number(result.gapMillis) > 0) return Number(result.gapMillis);
    const parsed = Number(String(result.gap || result.time || '').replace(/[^0-9.]/g, ''));
    return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
  }
  if (key === 'finish') return officialClassification(result) || 999;
  if (key === 'gained') return Number(result.grid) > 0 && officialClassification(result) ? Number(result.grid) - Number(result.position) : -999;
  return Number(result[key]) || 0;
}

function renderFormResults(results) {
  const constructors = [...new Set(results.map(result => result.constructorName).filter(Boolean))].sort();
  const years = [...new Set(results.map(result => Number(result.year)).filter(Boolean))].sort((a, b) => b - a);
  let filtered = results.filter(result => (!formResultFilters.constructor || result.constructorName === formResultFilters.constructor) && (!formResultFilters.year || String(result.year) === formResultFilters.year) && (!formResultFilters.status || statusCategory(result) === formResultFilters.status));
  filtered.sort((a, b) => { const first = sortValue(a, formResultSort.key), second = sortValue(b, formResultSort.key); const order = typeof first === 'string' ? first.localeCompare(second) : first - second; return formResultSort.direction === 'asc' ? order : -order; });
  const columns = [['date', 'Date'], ['race', 'Race'], ['constructor', 'Team'], ['qualifying', 'Qual.'], ['grid', 'Grid'], ['finish', 'Finish'], ['gained', 'Change'], ['status', 'Status'], ['timing', 'Time / gap'], ['points', 'Points']];
  const heading = columns.map(([key, label]) => `<th><button type="button" data-form-sort="${key}" aria-label="Sort by ${label}">${label}${formResultSort.key === key ? (formResultSort.direction === 'asc' ? ' ↑' : ' ↓') : ''}</button></th>`).join('');
  const rows = filtered.map(result => { const finish = officialClassification(result); const gained = Number(result.grid) > 0 && finish ? Number(result.grid) - finish : null; const category = statusCategory(result); return `<tr><td>${esc(fmtDate(result.date))}</td><td><a href="${seriesPageUrl('race', 'id', result.raceId)}">${esc(result.year)} ${esc(resultLabel(result))}</a></td><td>${esc(result.constructorName || '—')}</td><td>${positionLabel(result.qualifying)}</td><td>${positionLabel(result.grid)}</td><td>${finish ? `P${finish}` : '—'}</td><td>${gained === null ? '—' : `${gained > 0 ? '+' : ''}${gained}`}</td><td><span class="form-status form-status-${category}">${esc(statusLabel(result))}</span></td><td>${esc(timingLabel(result))}</td><td>${fmtNumber(result.points)}</td></tr>`; }).join('');
  formElement('driver-form-results').innerHTML = `<section class="analysis-chart-section"><div class="section-heading"><div><h2>Selected results</h2><p>Finish and official status are kept separate; missing positions remain missing.</p></div><span class="form-results-count">${filtered.length} of ${results.length} results</span></div><div class="form-result-filters"><label>Team<select id="form-result-constructor"><option value="">All teams</option>${constructors.map(value => `<option value="${esc(value)}" ${formResultFilters.constructor === value ? 'selected' : ''}>${esc(value)}</option>`).join('')}</select></label><label>Season<select id="form-result-year"><option value="">All seasons</option>${years.map(value => `<option value="${value}" ${formResultFilters.year === String(value) ? 'selected' : ''}>${value}</option>`).join('')}</select></label><label>Status<select id="form-result-status"><option value="">All statuses</option>${[['classified','Finished'],['retired','Retired'],['nonstarter','Did not start'],['disqualified','Disqualified'],['unclassified','Unclassified']].map(([value, label]) => `<option value="${value}" ${formResultFilters.status === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label><button type="button" id="form-result-reset" class="form-table-reset">Reset filters</button></div><div class="table-wrap" tabindex="0" aria-label="Driver results; sortable columns"><table class="form-results-table"><thead><tr>${heading}</tr></thead><tbody>${rows || '<tr><td colspan="10">No results match these filters.</td></tr>'}</tbody></table></div></section>`;
  [['form-result-constructor', 'constructor'], ['form-result-year', 'year'], ['form-result-status', 'status']].forEach(([id, key]) => formElement(id).addEventListener('change', event => { formResultFilters[key] = event.target.value; renderFormResults(results); }));
  formElement('form-result-reset').addEventListener('click', () => { formResultFilters = { constructor: '', year: '', status: '' }; renderFormResults(results); });
  document.querySelectorAll('[data-form-sort]').forEach(button => button.addEventListener('click', () => { const key = button.dataset.formSort; formResultSort = formResultSort.key === key ? { key, direction: formResultSort.direction === 'asc' ? 'desc' : 'asc' } : { key, direction: ['race', 'constructor', 'status'].includes(key) ? 'asc' : 'desc' }; renderFormResults(results); }));
}

function renderDriverForm() {
  const results = selectedFormResults();
  const classifications = results.map(officialClassification).filter(Boolean);
  const qualifying = results.map(result => Number(result.qualifying)).filter(value => value > 0);
  const starters = results.filter(result => statusCategory(result) !== 'nonstarter');
  const classified = starters.filter(result => officialClassification(result));
  const finished = starters.filter(result => statusCategory(result) === 'classified');
  const retired = results.filter(result => statusCategory(result) === 'retired').length;
  const nonstarters = results.filter(result => statusCategory(result) === 'nonstarter').length;
  const disqualified = results.filter(result => statusCategory(result) === 'disqualified').length;
  const gains = results.filter(result => Number(result.grid) > 0 && officialClassification(result)).map(result => Number(result.grid) - Number(result.position));
  const points = results.reduce((sum, result) => sum + Number(result.points || 0), 0);
  const classifiedRate = starters.length ? classified.length / starters.length * 100 : null;
  const finishRate = starters.length ? finished.length / starters.length * 100 : null;
  formElement('driver-form-summary').innerHTML = `<div><span>Average finish</span><strong>${mean(classifications)?.toFixed(2) || '—'}</strong><small>${classifications.length} official classification${classifications.length === 1 ? '' : 's'}</small></div><div><span>Average qualifying</span><strong>${mean(qualifying)?.toFixed(2) || '—'}</strong><small>${qualifying.length} recorded position${qualifying.length === 1 ? '' : 's'}</small></div><div><span>Points scored</span><strong>${fmtNumber(points)}</strong><small>${results.length} race session${results.length === 1 ? '' : 's'} selected${mean(gains) === null ? '' : ` · ${mean(gains) > 0 ? '+' : ''}${mean(gains).toFixed(2)} places`}</small></div><div><span>Classified rate</span><strong>${classifiedRate === null ? '—' : `${classifiedRate.toFixed(1)}%`}</strong><small>${classified.length}/${starters.length} starters classified · ${finishRate === null ? '—' : finishRate.toFixed(1)}% finished<br>${retired} retired · ${nonstarters} DNS/DNQ · ${disqualified} DSQ</small></div>`;
  renderFormTrend(results);
  renderFormTeammates(results);
  renderFormCircuits();
  renderFormResults(results);
  formElement('driver-form-workspace').hidden = false;
  setFormStatus(`${driverFormData.driver.name} · ${results.length} of ${driverFormData.results.length} available race sessions shown`, 'ready');
  const teams = [...new Set(results.map(result => result.constructorName).filter(Boolean))];
  const years = results.map(result => Number(result.year)).filter(Boolean);
  formElement('form-title').textContent = driverFormData.driver.name;
  formElement('form-meta').textContent = `${teams[0] || 'Team unavailable'}${years.length ? ` · ${Math.min(...years)}–${Math.max(...years)}` : ''} · ${activeSeriesName()}`;
  document.title = `${driverFormData.driver.name} form · ${activeSeriesName()} · Racelytic`;
}

async function loadDriverForm({ push = false } = {}) {
  const id = formElement('form-driver').value;
  if (!id) return;
  const request = ++formRequest;
  formController?.abort();
  formController = new AbortController();
  showFormLoading();
  updateFormUrl(push ? 'push' : 'replace');
  try {
    const data = await getJSON(`/api/drivers/${encodeURIComponent(id)}/form`, { signal: formController.signal });
    if (request !== formRequest) return;
    driverFormData = data;
    try { localStorage.setItem(`racelytic-driver-form-${activeSeriesKey()}`, id); } catch {}
    renderDriverForm();
  } catch (error) {
    if (error.name === 'AbortError' || request !== formRequest) return;
    setFormStatus(error.message || 'Unable to load driver form.', 'error');
    formElement('driver-form-summary').innerHTML = '';
    formElement('driver-form-workspace').hidden = false;
    formElement('driver-form-trend').innerHTML = `<div class="empty-state">${esc(error.message || 'Unable to load driver form.')}</div>`;
  }
}

function selectFormView(value, { update = true, focus = false } = {}) {
  formView = validValues(value, ['trend', 'teammates', 'circuits', 'results'], 'trend');
  document.querySelectorAll('[data-form-panel]').forEach(panel => { panel.hidden = panel.dataset.formPanel !== formView; });
  document.querySelectorAll('[data-form-view]').forEach(button => { const active = button.dataset.formView === formView; button.setAttribute('aria-selected', String(active)); button.tabIndex = active ? 0 : -1; if (active && focus) button.focus(); });
  formElement('form-view').value = formView;
  if (update) updateFormUrl();
}

function renderDriverOptions(query = '', preferred = '', syncInput = false) {
  const needle = query.trim().toLowerCase();
  const matches = needle ? formDrivers.filter(driver => `${driver.name} ${driver.abbreviation || ''}`.toLowerCase().includes(needle)) : formDrivers;
  const current = preferred || formElement('form-driver').value;
  formElement('form-driver-options').innerHTML = matches.slice(0, 100).map(driver => `<option value="${esc(driver.name)}"></option>`).join('');
  const selected = formDrivers.find(driver => String(driver.id) === String(current));
  if (selected && syncInput) formElement('form-driver-search').value = selected.name;
  formElement('form-driver-search').disabled = !formDrivers.length;
  return matches;
}

function chooseSearchedDriver({ firstMatch = false } = {}) {
  const search = formElement('form-driver-search');
  const query = search.value.trim().toLowerCase();
  if (!query) { search.setCustomValidity(''); return false; }
  const exact = formDrivers.find(driver => driver.name.toLowerCase() === query || String(driver.abbreviation || '').toLowerCase() === query);
  const match = exact || (firstMatch ? formDrivers.find(driver => `${driver.name} ${driver.abbreviation || ''}`.toLowerCase().includes(query)) : null);
  if (!match) { search.setCustomValidity(query ? 'Choose a driver from the suggestions.' : 'Enter a driver name.'); search.reportValidity(); return false; }
  search.setCustomValidity('');
  search.value = match.name;
  if (String(formElement('form-driver').value) === String(match.id)) return true;
  formElement('form-driver').value = match.id;
  loadDriverForm({ push: true });
  return true;
}

async function initialiseDriverForm() {
  const query = params();
  formMetric = validValues(query.get('metric'), ['finish', 'qualifying'], 'finish');
  formView = validValues(query.get('view'), ['trend', 'teammates', 'circuits', 'results'], 'trend');
  formElement('form-range').value = validValues(query.get('range'), ['5', '10', '20', '50', 'all'], '10');
  formElement('form-window').value = validValues(query.get('window'), ['1', '3', '5', '10'], '5');
  formElement('form-series-label').textContent = `${activeSeriesName().toUpperCase()} · DRIVER FORM`;
  selectFormView(formView, { update: false });
  try {
    const drivers = await getJSON('/api/drivers?limit=1000');
    formDrivers = [...drivers].sort((a, b) => Number(b.lastYear || 0) - Number(a.lastYear || 0) || Number(b.totalRaceStarts || 0) - Number(a.totalRaceStarts || 0) || a.name.localeCompare(b.name));
    let saved = '';
    try { saved = localStorage.getItem(`racelytic-driver-form-${activeSeriesKey()}`) || ''; } catch {}
    const preferred = query.get('driver') || saved || formDrivers[0]?.id || '';
    formElement('form-driver').value = formDrivers.some(driver => String(driver.id) === String(preferred)) ? preferred : formDrivers[0]?.id || '';
    renderDriverOptions('', formElement('form-driver').value, true);
    await loadDriverForm();
  } catch (error) {
    setFormStatus(error.message || 'Unable to load drivers.', 'error');
    formElement('driver-form-summary').innerHTML = '';
  }
}

formElement('form-driver-search').addEventListener('input', event => { event.currentTarget.setCustomValidity(''); renderDriverOptions(event.target.value); });
formElement('form-driver-search').addEventListener('change', () => chooseSearchedDriver());
formElement('form-driver-search').addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); chooseSearchedDriver({ firstMatch: true }); } });
formElement('form-range').addEventListener('change', () => { updateFormUrl(); renderDriverForm(); });
formElement('form-window').addEventListener('change', () => { updateFormUrl(); renderFormTrend(selectedFormResults()); });
formElement('form-view').addEventListener('change', event => selectFormView(event.target.value));
document.querySelectorAll('[data-form-view]').forEach(button => button.addEventListener('click', () => selectFormView(button.dataset.formView)));
document.querySelector('.driver-form-tabs').addEventListener('keydown', event => { if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return; event.preventDefault(); const values = ['trend', 'teammates', 'circuits', 'results']; const current = values.indexOf(formView); const next = event.key === 'Home' ? 0 : event.key === 'End' ? values.length - 1 : (current + (event.key === 'ArrowRight' ? 1 : -1) + values.length) % values.length; selectFormView(values[next], { focus: true }); });
window.addEventListener('popstate', () => { const query = params(); const driver = query.get('driver'); formMetric = validValues(query.get('metric'), ['finish', 'qualifying'], formMetric); formElement('form-range').value = validValues(query.get('range'), ['5', '10', '20', '50', 'all'], '10'); formElement('form-window').value = validValues(query.get('window'), ['1', '3', '5', '10'], '5'); selectFormView(query.get('view'), { update: false }); if (driver && driver !== formElement('form-driver').value && formDrivers.some(item => String(item.id) === String(driver))) { formElement('form-driver').value = driver; renderDriverOptions('', driver, true); loadDriverForm(); } else if (driverFormData) renderDriverForm(); });

initialiseDriverForm();
