const caModel = window.CircuitAnalysisModel;
const caSeries = location.pathname.match(/^\/(f2|f3|academy)(?:\/|$)/)?.[1] || 'f1';
const caJunior = caSeries !== 'f1', caBase = caJunior ? `/${caSeries}` : '';
const caSeriesName = { f1: 'Formula 1', f2: 'Formula 2', f3: 'Formula 3', academy: 'F1 Academy' }[caSeries];
const caTeamPage = ['f3', 'academy'].includes(caSeries) ? 'team' : 'constructor';
const caPoleLabel = caJunior ? 'Grid P1 conversion' : 'Pole conversion';
const caPoleSample = caJunior ? 'known P1 starts' : 'recorded poles';
const caMetrics = races => caModel.metrics(races, caJunior);
const caGetJSON = (url, options) => getJSON(caJunior ? `${url}${url.includes('?') ? '&' : '?'}series=${caSeries}` : url, options);
const caEntityLink = (type, id) => `${caBase}/${type}?id=${encodeURIComponent(id)}`;
const caNode = id => document.getElementById(`ca-${id}`);
const caViews = ['specialists', 'trends', 'movement', 'reliability'];
const caMetricNames = { wins: 'Wins', podiums: 'Podiums', winRate: 'Win percentage', averageFinish: 'Average finish' };
let caCircuits = [], caData = null, caView = 'specialists', caId = '', caRequest = 0, caController;
let caRange = { era: 'all', from: '', to: '' };
let caPickerMatches = [], caPickerActive = -1;
let caFormat = 'all';
const caCache = new Map();
const caPercent = value => value === null ? '—' : `${value.toFixed(1)}%`;
const caNumber = value => value === null ? '—' : value.toFixed(2);
const caRaceLink = race => `${caEntityLink('race', race.id)}${race.sessionId ? `&session=${encodeURIComponent(race.sessionId)}` : ''}`;
const caCircuitLabel = circuit => `${circuit.name}${circuit.countryName ? ` · ${circuit.countryName}` : ''}`;
const caNormalize = text => String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const caCount = (value, noun) => `${value} ${noun}${value === 1 ? '' : 's'}`;
function caCommitRange() { caRange = { era: caNode('era').value, from: caNode('from').value, to: caNode('to').value }; }

function caReadState() {
  const query = params();
  caId = query.get('id') || '';
  caFormat = caJunior && ['F', 'S'].includes(query.get('format')) ? query.get('format') : 'all';
  caNode('format').value = caFormat;
  caView = caViews.includes(query.get('view')) ? query.get('view') : 'specialists';
  caNode('era').value = [...caNode('era').options].some(option => option.value === query.get('era')) ? query.get('era') : 'all';
  for (const key of ['from', 'to']) caNode(key).value = /^(?:19[5-9]\d|[2-9]\d{3})$/.test(query.get(key) || '') ? query.get(key) : '';
  if (caNode('from').value || caNode('to').value) caNode('era').value = 'custom';
  caNode('metric').value = Object.hasOwn(caMetricNames, query.get('metric')) ? query.get('metric') : 'wins';
  for (const [node, key] of [['minimum', 'min'], ['movement-minimum', 'movementMin']]) {
    caNode(node).value = ['1', '3', '5', '10'].includes(query.get(key)) ? query.get(key) : '3';
  }
  if (caNode('era').value !== 'custom') caApplyEra();
  caYearVisibility();
  caCommitRange();
}
function caSaveState() {
  const query = new URLSearchParams();
  query.set('id', caId); query.set('view', caView); query.set('era', caRange.era);
  if (caJunior) query.set('format', caFormat);
  if (caRange.era === 'custom') for (const key of ['from', 'to']) if (caRange[key]) query.set(key, caRange[key]);
  query.set('metric', caNode('metric').value); query.set('min', caNode('minimum').value); query.set('movementMin', caNode('movement-minimum').value);
  history.replaceState(null, '', `${location.pathname}?${query}`);
}
function caApplyEra() {
  const era = caNode('era').value;
  caYearVisibility();
  if (era === 'custom') return;
  const [start, end] = era === 'all' ? ['', ''] : era.split('-');
  caNode('from').value = start; caNode('to').value = end === '9999' ? '' : end;
}
function caYearVisibility() {
  const custom = caNode('era').value === 'custom';
  caNode('from-label').hidden = !custom; caNode('to-label').hidden = !custom;
  caNode('filters').classList.toggle('ca-custom-range', custom);
}
function caValidRange() {
  const start = caNode('from'), end = caNode('to');
  end.setCustomValidity(start.value && end.value && Number(start.value) > Number(end.value) ? 'The end year must be the same as or after the start year.' : '');
  return start.checkValidity() && end.checkValidity();
}
function caRaces() { return caModel.range(caData?.races || [], caRange.from, caRange.to).filter(race => caFormat === 'all' || race.raceType === caFormat); }
function caSetView(view, save = true) {
  caView = caViews.includes(view) ? view : 'specialists';
  document.querySelectorAll('[data-view]').forEach(button => {
    const selected = button.dataset.view === caView;
    button.setAttribute('aria-selected', String(selected)); button.tabIndex = selected ? 0 : -1;
    caNode(button.dataset.view).hidden = !selected;
  });
  if (save && caId) caSaveState();
}
function caHeader() {
  const archiveCircuit = caCircuits.find(row => String(row.id) === caId);
  const circuit = { ...archiveCircuit, ...Object.fromEntries(Object.entries(caData.circuit).filter(([, value]) => value != null)) };
  if (caJunior && archiveCircuit?.placeName) circuit.placeName = archiveCircuit.placeName;
  caNode('title').textContent = circuit.name;
  document.title = `${circuit.name} · ${caSeriesName} Circuit Analysis · Racelytic`;
  caNode('location').textContent = [circuit.placeName, circuit.countryName, circuit.type ? `${String(circuit.type).toLowerCase().replace(/\s+circuit$/, '')} circuit` : ''].filter(Boolean).join(' · ');
  caNode('circuit-link').hidden = false;
  caNode('circuit-link').href = caEntityLink('circuit', caId);
  const length = circuit.layoutLength ?? circuit.length, turns = circuit.layoutTurns ?? circuit.turns;
  const dimensions = [Number(length) > 0 ? `${Number(length).toFixed(3)} km` : '', Number(turns) > 0 ? `${turns} turns` : ''].filter(Boolean).join(' · ');
  caNode('layout').hidden = false;
  caNode('layout').innerHTML = `${circuit.layoutId ? `<img src="/assets/circuits/${encodeURIComponent(circuit.layoutId)}.svg" width="240" height="100" alt="Track outline of ${esc(circuit.name)}">` : '<span>Track outline unavailable</span>'}<figcaption>${esc(dimensions)}<small>Current / last recorded layout</small></figcaption>`;
  caNode('layout').querySelector('img')?.addEventListener('error', event => {
    event.target.replaceWith(Object.assign(document.createElement('span'), { textContent: 'Track outline unavailable' }));
  }, { once: true });
}
function caSummary(races) {
  const metrics = caMetrics(races), years = races.map(race => race.year);
  const cards = [
    ['Races analysed', races.length, years.length ? `${Math.min(...years)}–${Math.max(...years)}` : 'No matching races'],
    ['Different winners', races.length ? metrics.winners : '—', 'Winning drivers'],
    [caPoleLabel, caPercent(metrics.poleRate), `${metrics.converted} wins / ${metrics.poles} ${caPoleSample}`],
    ['Retirement rate', caPercent(metrics.retirementRate), `${metrics.retirements} retirements / ${metrics.starters} starts`]
  ];
  caNode('summary').innerHTML = cards.map(([label, value, note]) => `<div><span>${esc(label)}</span><strong>${esc(value)}</strong><small>${esc(note)}</small></div>`).join('');
}
function caRankingTable(races, team) {
  const metric = caNode('metric').value, minimum = Number(caNode('minimum').value);
  const rows = caModel.rank(caModel.aggregate(races, team), metric, minimum), top = rows.slice(0, 12);
  const max = Math.max(...top.map(row => row[metric]), 1);
  return `<section class="ca-ranking"><header><h3>${team ? 'Teams' : 'Drivers'}</h3><span>Top ${top.length} of ${rows.length} eligible${metric === 'averageFinish' ? ' · Lower is better' : ''}</span></header>${top.length ? `<ol>${top.map(row => {
    const value = metric === 'winRate' ? caPercent(row[metric]) : metric === 'averageFinish' ? caNumber(row[metric]) : row[metric];
    const width = metric === 'averageFinish' ? (max - row[metric] + 1) / max * 100 : row[metric] / max * 100;
    return `<li><div class="ca-rank-name"><a href="${caEntityLink(team ? caTeamPage : 'driver', row.id)}">${esc(row.name)}</a><small>${caCount(row.starts, team && !caJunior ? 'GP start' : 'start')} · ${caCount(row.wins, 'win')} · ${caCount(row.podiums, 'podium')}${metric === 'averageFinish' ? ` · ${row.positions.length} classified` : ''}</small></div><div class="ca-rank-value"><strong>${esc(value)}</strong><small>${esc(caMetricNames[metric])}</small></div><div class="ca-rank-bar" aria-hidden="true"><i style="width:${Math.max(0, Math.min(100, width))}%"></i></div></li>`;
  }).join('')}</ol>` : '<div class="ca-empty-inline">No entries meet this minimum. Try 1 start or a wider year range.</div>'}</section>`;
}
function caSpecialists(races) { caNode('rankings').innerHTML = caRankingTable(races, false) + caRankingTable(races, true); }
function caMarginRows(races) {
  return races.map(race => ({ race, winner: race.results.find(result => Number(result.position) === 1), ...caModel.gap(race.results.find(result => Number(result.position) === 2)) }));
}
function caMarginLabel(row) { return row.seconds !== null ? `${row.seconds.toFixed(3)} s` : row.laps !== null ? `${row.laps} lap${row.laps === 1 ? '' : 's'}` : 'Unavailable'; }
function caMarginChart(rows) {
  const timed = rows.filter(row => row.seconds !== null);
  if (!timed.length) return '<p class="ca-empty-inline">No timed winning margins are recorded for this selection. See the race details below.</p>';
  const width = 820, height = 310, left = 62, right = 22, top = 38, bottom = 52;
  const years = rows.map(row => row.race.year), first = Math.min(...years), last = Math.max(...years);
  const max = Math.max(...timed.map(row => row.seconds), 1) * 1.12, median = caModel.median(timed.map(row => row.seconds));
  const x = year => left + (year - first) / (last + 1 - first) * (width - left - right);
  const raceYear = race => {
    const date = Date.parse(race.date), start = Date.UTC(race.year, 0, 1), end = Date.UTC(race.year + 1, 0, 1);
    return Number.isFinite(date) && date >= start && date < end ? race.year + (date - start) / (end - start) : race.year + .5;
  };
  const y = seconds => top + (1 - seconds / max) * (height - top - bottom);
  let connected = false;
  const path = rows.map(row => {
    if (row.seconds === null) { connected = false; return ''; }
    const command = connected ? 'L' : 'M'; connected = true;
    return `${command}${x(raceYear(row.race))},${y(row.seconds)}`;
  }).join(' ');
  const step = Math.max(1, Math.ceil((last - first) / 6)), ticks = [];
  for (let year = first; year <= last; year += step) ticks.push(year);
  if (ticks[ticks.length - 1] !== last) ticks.push(last);
  return `<div class="ca-chart-scroll" tabindex="0" role="region" aria-label="Winning margin chart; scroll horizontally on small screens"><svg class="ca-margin-svg" viewBox="0 0 ${width} ${height}" role="group" aria-label="Winning margin in seconds by year"><text x="${left}" y="18" class="ca-axis-title">Margin (seconds)</text>${[0, 1, 2, 3, 4].map(index => {
    const value = max * index / 4;
    return `<line x1="${left}" x2="${width - right}" y1="${y(value)}" y2="${y(value)}" class="ca-grid-line"/><text x="${left - 10}" y="${y(value) + 4}" text-anchor="end">${value.toFixed(max < 5 ? 1 : 0)}</text>`;
  }).join('')}${ticks.map(year => `<text x="${x(year + .5)}" y="${height - bottom + 24}" text-anchor="middle">${year}</text>`).join('')}<text x="${width / 2}" y="${height - 7}" text-anchor="middle">Year</text><line x1="${left}" x2="${width - right}" y1="${y(median)}" y2="${y(median)}" class="ca-median"/><path d="${path}" class="ca-margin-line"/>${rows.map((row, index) => row.seconds === null ? '' : `<circle cx="${x(raceYear(row.race))}" cy="${y(row.seconds)}" r="6" role="button" tabindex="0" data-margin="${index}" aria-label="${esc(`${row.race.year} ${displayRaceName(row.race)}: ${caMarginLabel(row)}, won by ${row.winner?.driverName || 'unknown'}. Show race details.`)}"><title>${esc(`${row.race.year}: ${caMarginLabel(row)}`)}</title></circle>`).join('')}</svg></div><div class="ca-chart-legend"><span><i></i>Winning margin</span><span><i class="median"></i>Median ${median.toFixed(3)} s</span></div>`;
}
function caTrends(races) {
  const rows = caMarginRows(races), timed = rows.filter(row => row.seconds !== null), lapped = rows.filter(row => row.laps !== null);
  const metrics = caMetrics(races);
  caNode('trends').innerHTML = `<div class="ca-section-head"><div><h2>How close was the finish?</h2><p>Recorded gap to second place. Select a point to inspect the race.</p></div></div><div class="ca-mini-stats"><div><span>Median timed margin</span><strong>${timed.length ? `${caModel.median(timed.map(row => row.seconds)).toFixed(3)} s` : '—'}</strong><small>${timed.length} timed races</small></div><div><span>${caPoleLabel}</span><strong>${caPercent(metrics.poleRate)}</strong><small>${metrics.converted} wins / ${metrics.poles} ${caPoleSample}</small></div><div><span>Average winner grid</span><strong>${caNumber(metrics.winnerGrid)}</strong><small>${metrics.knownWinnerGrids} known grid positions</small></div></div>${caMarginChart(rows)}<div id="ca-point-detail" class="ca-point-detail" aria-live="polite">Tap, focus or hover over a point for race details.</div><p class="ca-note">${timed.length} timed margins · ${lapped.length} lapped finishes · ${rows.length - timed.length - lapped.length} unavailable. Lapped and missing finishes are excluded from the seconds chart and break the line. Years use chronological spacing; multiple races in a year use their dates. A small finishing margin alone does not measure race competitiveness.</p><details class="ca-race-details"><summary>All ${rows.length} race margins, including lapped finishes</summary><div class="ca-table-scroll" tabindex="0" role="region" aria-label="Race margins"><table><caption class="sr-only">Winning margins for selected races</caption><thead><tr><th scope="col">Race</th><th scope="col">Winner</th><th scope="col">Margin to second</th></tr></thead><tbody>${[...rows].reverse().map(row => `<tr><td><a href="${caRaceLink(row.race)}">${row.race.year} · ${esc(displayRaceName(row.race))}</a></td><td>${esc(row.winner?.driverName || 'Unavailable')}</td><td>${esc(caMarginLabel(row))}</td></tr>`).join('')}</tbody></table></div></details>`;
  caNode('trends').querySelectorAll('[data-margin]').forEach(point => {
    const show = () => {
      const row = rows[Number(point.dataset.margin)];
      caNode('point-detail').innerHTML = `<strong>${row.race.year} · ${esc(displayRaceName(row.race))}</strong><span>${esc(row.winner?.driverName || 'Winner unavailable')} · ${esc(caMarginLabel(row))} to second</span><a href="${caRaceLink(row.race)}">Open race results ↗</a>`;
    };
    for (const event of ['pointerenter', 'focus', 'click']) point.addEventListener(event, show);
    point.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); show(); } });
  });
}
function caMovement(races) {
  const minimum = Number(caNode('movement-minimum').value);
  const rows = caModel.aggregate(races).filter(row => row.gains.length >= minimum).sort((a, b) => b.averageGain - a.averageGain || b.gains.length - a.gains.length);
  const gainers = rows.filter(row => row.averageGain >= 0).slice(0, 6), losers = rows.filter(row => row.averageGain < 0).reverse().slice(0, 6);
  const max = Math.max(...[...gainers, ...losers].map(row => Math.abs(row.averageGain)), 1);
  caNode('movers').innerHTML = `<p class="ca-note">Classified results with a known grid position only; ${minimum}+ measured starts per driver. Unclassified finishes are shown in the heatmap below.</p><div class="ca-columns">${[[gainers, 'Largest average gains'], [losers, 'Largest average losses']].map(([items, label]) => `<section class="ca-mover-group"><h3>${label}</h3><div class="ca-zero-label">Loss ← <span>0</span> → Gain</div>${items.length ? items.map(row => `<div class="ca-mover"><div><a href="${caEntityLink('driver', row.id)}">${esc(row.name)}</a><small>${row.gains.length} measured starts</small></div><div class="ca-diverging" aria-hidden="true"><i class="${row.averageGain < 0 ? 'loss' : 'gain'}" style="width:${Math.abs(row.averageGain) / max * 50}%"></i></div><strong>${row.averageGain > 0 ? '+' : ''}${row.averageGain.toFixed(2)}</strong></div>`).join('') : '<p class="ca-empty-inline">No drivers meet this selection. Try a lower minimum or a wider year range.</p>'}</section>`).join('')}</div>`;
  caHeatmap(races);
}
function caHeatmap(races) {
  const cells = caModel.heatmap(races), columns = [...caModel.bands, 'Unclassified'];
  const total = cells.flat().reduce((sum, cell) => sum + cell.length, 0);
  caNode('heatmap').innerHTML = `<div class="ca-section-head"><div><h3>How much does the grid matter?</h3><p>All ${total} starters with a known grid position; independent of the ranking minimum. Colour shows the share of each starting group.</p></div></div><div class="ca-table-scroll" tabindex="0" role="region" aria-label="Starting group to finishing group heatmap"><table class="ca-heatmap-table"><caption>Start ↓ / Finish → · select a cell to inspect its results</caption><thead><tr><th scope="col">Grid</th>${columns.map(label => `<th scope="col">${label}</th>`).join('')}</tr></thead><tbody>${cells.map((row, grid) => {
    const rowTotal = row.reduce((sum, cell) => sum + cell.length, 0);
    return `<tr><th scope="row">${caModel.bands[grid]}<small>${rowTotal} starts</small></th>${row.map((cell, finish) => {
      const share = rowTotal ? cell.length / rowTotal : 0;
      return `<td><button type="button" data-cell="${grid},${finish}" ${cell.length ? '' : 'disabled'} style="--heat:${share.toFixed(3)}" aria-label="Grid ${caModel.bands[grid]} to ${columns[finish]}: ${cell.length} results, ${(share * 100).toFixed(1)} percent of this starting group"><strong>${cell.length}</strong><small>${rowTotal ? `${(share * 100).toFixed(0)}%` : '—'}</small></button></td>`;
    }).join('')}</tr>`;
  }).join('')}</tbody></table></div><div id="ca-cell-detail" class="ca-cell-detail" aria-live="polite"></div><p class="ca-note">Unclassified includes retirements without a classified position, disqualifications and other unclassified results. Pit-lane starts and unknown grids are excluded.</p>`;
  caNode('heatmap').querySelectorAll('[data-cell]').forEach(button => button.addEventListener('click', () => {
    const [grid, finish] = button.dataset.cell.split(',').map(Number), entries = cells[grid][finish];
    caNode('heatmap').querySelectorAll('[data-cell]').forEach(cell => cell.setAttribute('aria-pressed', String(cell === button)));
    caNode('cell-detail').innerHTML = `<h4>${caModel.bands[grid]} → ${columns[finish]} · ${entries.length} results</h4><div class="ca-table-scroll" tabindex="0" role="region" aria-label="Selected heatmap results"><table><thead><tr><th scope="col">Race</th><th scope="col">Driver</th><th scope="col">Grid</th><th scope="col">Result</th></tr></thead><tbody>${[...entries].reverse().map(({ race, result }) => `<tr><td><a href="${caRaceLink(race)}">${race.year} · ${esc(displayRaceName(race))}</a></td><td>${esc(result.driverName)}</td><td>${esc(result.grid)}</td><td>${esc(caModel.classified(result) ? `P${result.position}` : result.positionText || 'Unclassified')}</td></tr>`).join('')}</tbody></table></div>`;
  }));
}
function caReliability(races) {
  const metrics = caMetrics(races), excluded = races.reduce((sum, race) => sum + race.results.filter(result => !caModel.starter(result)).length, 0);
  caNode('reliability').innerHTML = `<div class="ca-section-head"><div><h2>Retirement rate by race</h2><p>Recorded retirements divided by actual starts. Late classified retirements are included.</p></div></div><div class="ca-mini-stats"><div><span>Retirement rate</span><strong>${caPercent(metrics.retirementRate)}</strong><small>${metrics.retirements} retirements / ${metrics.starters} starts</small></div><div><span>Non-starters excluded</span><strong>${excluded}</strong><small>DNS, DNQ, DNPQ and withdrawals</small></div></div><div class="ca-table-scroll" tabindex="0" role="region" aria-label="Retirement rate by race"><table class="ca-reliability-table"><thead><tr><th scope="col">Race</th><th scope="col">Retirement rate</th><th scope="col">Retired / starts</th><th scope="col">Excluded</th></tr></thead><tbody>${[...races].reverse().map(race => {
    const row = caMetrics([race]);
    return `<tr><td><a href="${caRaceLink(race)}">${race.year} · ${esc(displayRaceName(race))}</a></td><td><div class="ca-rate"><i style="width:${row.retirementRate || 0}%" aria-hidden="true"></i><span>${caPercent(row.retirementRate)}</span></div></td><td>${row.retirements} / ${row.starters}</td><td>${race.results.length - row.starters}</td></tr>`;
  }).join('')}</tbody></table></div><p class="ca-note">This measures recorded retirements, not mechanical failures alone. Disqualifications count as starts but not retirements. Shortened races, accidents and changing regulations affect comparisons across eras.</p>`;
}
function caRender() {
  if (!caData) return;
  if (!caValidRange()) { caNode('status').textContent = 'Choose a valid year range, then select Apply.'; return; }
  caCommitRange();
  const races = caRaces();
  caSaveState(); caSummary(races);
  caNode('workspace').hidden = !races.length;
  caNode('empty').hidden = Boolean(races.length);
  const years = caData.races.map(race => race.year);
  caNode('empty-message').textContent = `${caData.circuit.name} has ${years.length ? `recorded races from ${Math.min(...years)} to ${Math.max(...years)}` : 'no recorded races'}. Choose another period or show all years.`;
  caNode('status').textContent = `${races.length} of ${caData.races.length} recorded Grands Prix selected. Historical races may use different layouts.`;
  if (caJunior) {
    caNode('status').textContent = `${races.length} of ${caData.races.length} recorded race sessions selected. Each race counts separately.`;
    const grids = races.flatMap(race => race.results.filter(result => caModel.starter(result) && caModel.positive(result.grid)).map(() => race.gridSource));
    const derived = grids.filter(source => source === 'derived').length;
    caNode('grid-coverage').textContent = `Grid positions: ${grids.length} of ${caMetrics(races).starters} starts known.${derived ? ` ${derived} are derived from qualifying or earlier results and may omit penalties.` : ''}`;
    caNode('empty-message').textContent += ' The race-format filter also applies.';
    caNode('reset').textContent = 'Show all years and race formats';
  }
  if (races.length) { caSpecialists(races); caTrends(races); caMovement(races); caReliability(races); }
  caSetView(caView, false);
}
async function caLoad() {
  const request = ++caRequest, id = caId;
  caController?.abort(); caController = new AbortController();
  caData = null;
  caNode('workspace').hidden = true; caNode('empty').hidden = true; caNode('summary').innerHTML = '';
  caNode('title').textContent = caCircuits.find(row => String(row.id) === id)?.name || 'Circuit performance';
  caNode('layout').hidden = true; caNode('circuit-link').hidden = true; caNode('location').textContent = '';
  caNode('grid-coverage').textContent = '';
  caNode('hero').setAttribute('aria-busy', 'true'); caNode('status').textContent = 'Loading circuit analysis…';
  caSaveState();
  try {
    const data = caCache.get(id) || await caGetJSON(`/api/circuits/${encodeURIComponent(id)}/analysis`, { signal: caController.signal });
    if (request !== caRequest) return;
    if (String(data?.circuit?.id) !== id || !Array.isArray(data.races)) throw new Error('Circuit data is unavailable.');
    caCache.set(id, data); caData = data;
    caHeader(); caRender();
  } catch (error) {
    if (request !== caRequest || error.name === 'AbortError') return;
    caNode('status').textContent = `${error.message} Select Apply to retry.`;
  } finally { if (request === caRequest) caNode('hero').setAttribute('aria-busy', 'false'); }
}
function caResolveCircuit() {
  const query = caNormalize(caNode('search').value);
  const matches = caCircuits.filter(row => [caCircuitLabel(row), row.name, row.shortName, row.id].some(value => caNormalize(value) === query));
  const circuit = matches.length === 1 ? matches[0] : null;
  caNode('search').setCustomValidity(circuit ? '' : 'Select a circuit from the suggestions.');
  if (circuit) caNode('search').value = caCircuitLabel(circuit);
  return circuit;
}
function caClosePicker() {
  caNode('picker-menu').hidden = true;
  caNode('search').setAttribute('aria-expanded', 'false');
  caNode('search').removeAttribute('aria-activedescendant');
  caNode('picker-toggle').setAttribute('aria-expanded', 'false');
  caNode('picker-toggle').setAttribute('aria-label', 'Show circuits');
  caPickerActive = -1;
}
function caHighlightCircuit(index, scroll = false) {
  caPickerActive = index;
  caNode('circuit-options').querySelectorAll('[role="option"]').forEach((option, optionIndex) => option.setAttribute('aria-selected', String(optionIndex === index)));
  if (index < 0) caNode('search').removeAttribute('aria-activedescendant');
  else {
    caNode('search').setAttribute('aria-activedescendant', `ca-circuit-option-${index}`);
    if (scroll) caNode(`circuit-option-${index}`).scrollIntoView({ block: 'nearest' });
  }
}
function caOpenPicker(showAll = false) {
  const tokens = showAll ? [] : caNormalize(caNode('search').value).split(/\s+/).filter(Boolean);
  caPickerMatches = caCircuits.filter(circuit => {
    const text = caNormalize([circuit.name, circuit.shortName, circuit.countryName, circuit.placeName, circuit.id].join(' '));
    return tokens.every(token => text.includes(token));
  });
  caNode('circuit-options').innerHTML = caPickerMatches.map((circuit, index) => `<div id="ca-circuit-option-${index}" class="ca-picker-option" role="option" tabindex="-1" aria-selected="false" data-circuit-index="${index}"><span>${esc(circuit.name)}</span><small>${esc(circuit.countryName || circuit.placeName || '')}</small></div>`).join('');
  caNode('picker-count').textContent = caPickerMatches.length ? `${caCount(caPickerMatches.length, 'circuit')} · Type to filter or choose below` : 'No circuits match your search.';
  caNode('picker-menu').hidden = false;
  caNode('search').setAttribute('aria-expanded', 'true');
  caNode('picker-toggle').setAttribute('aria-expanded', 'true');
  caNode('picker-toggle').setAttribute('aria-label', 'Hide circuits');
  caHighlightCircuit(showAll ? caPickerMatches.findIndex(circuit => String(circuit.id) === caId) : -1, showAll);
}
function caChooseCircuit(index) {
  const circuit = caPickerMatches[index];
  if (!circuit) return;
  caNode('search').value = caCircuitLabel(circuit);
  caNode('search').setCustomValidity('');
  caNode('search').focus();
  caClosePicker();
  caApply();
}
function caBindPicker() {
  const input = caNode('search');
  input.addEventListener('focus', () => { caOpenPicker(true); input.select(); });
  input.addEventListener('click', () => { if (caNode('picker-menu').hidden) caOpenPicker(true); });
  input.addEventListener('input', () => { input.setCustomValidity(''); caOpenPicker(); });
  input.addEventListener('keydown', event => {
    if (event.isComposing) return;
    const open = !caNode('picker-menu').hidden;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) { caOpenPicker(true); return; }
      if (caPickerMatches.length) caHighlightCircuit(caPickerActive < 0 ? (event.key === 'ArrowDown' ? 0 : caPickerMatches.length - 1) : (caPickerActive + (event.key === 'ArrowDown' ? 1 : -1) + caPickerMatches.length) % caPickerMatches.length, true);
    } else if (event.key === 'Enter' && open && (caPickerActive >= 0 || caPickerMatches.length === 1)) {
      event.preventDefault(); caChooseCircuit(caPickerActive >= 0 ? caPickerActive : 0);
    } else if (event.key === 'Escape') {
      event.preventDefault(); caClosePicker();
      const selected = caCircuits.find(circuit => String(circuit.id) === caId);
      if (selected) input.value = caCircuitLabel(selected);
      input.setCustomValidity('');
    } else if (event.key === 'Tab') caClosePicker();
  });
  caNode('picker-toggle').addEventListener('click', () => {
    const open = !caNode('picker-menu').hidden;
    input.focus();
    if (open) caClosePicker(); else caOpenPicker(true);
  });
  caNode('circuit-options').addEventListener('mousedown', event => event.preventDefault());
  caNode('circuit-options').addEventListener('click', event => {
    const option = event.target.closest('[data-circuit-index]');
    if (option) caChooseCircuit(Number(option.dataset.circuitIndex));
  });
  caNode('picker').addEventListener('focusout', event => {
    if (!caNode('picker').contains(event.relatedTarget)) caClosePicker();
  });
}
function caApply(event) {
  event?.preventDefault();
  const circuit = caResolveCircuit();
  caValidRange();
  if (!circuit || !caNode('filters').reportValidity()) return;
  caClosePicker();
  caCommitRange();
  if (caId !== String(circuit.id) || !caData) { caId = String(circuit.id); caLoad(); }
  else caRender();
}
async function caInit() {
  caReadState(); caSetView(caView, false);
  caNode('format-control').hidden = !caJunior;
  if (caSeries === 'academy') {
    caNode('format').querySelector('[value="F"]').textContent = 'Standard races';
    caNode('format').querySelector('[value="S"]').textContent = 'Reverse-grid races';
  }
  caNode('format').addEventListener('change', () => { caFormat = caNode('format').value; caRender(); });
  caNode('filters').addEventListener('submit', caApply);
  caBindPicker();
  caNode('era').addEventListener('change', () => { caApplyEra(); if (caValidRange()) caRender(); });
  for (const key of ['from', 'to']) caNode(key).addEventListener('input', () => { caNode('era').value = 'custom'; caValidRange(); });
  for (const key of ['metric', 'minimum']) caNode(key).addEventListener('change', () => { if (caData) { caSpecialists(caRaces()); caSaveState(); } });
  caNode('movement-minimum').addEventListener('change', () => { if (caData) { caMovement(caRaces()); caSaveState(); } });
  caNode('reset').addEventListener('click', () => { caNode('era').value = 'all'; caFormat = 'all'; caNode('format').value = 'all'; caApplyEra(); caRender(); });
  const tabs = [...document.querySelectorAll('[data-view]')];
  tabs.forEach((button, index) => {
    button.addEventListener('click', () => caSetView(button.dataset.view));
    button.addEventListener('keydown', event => {
      const next = event.key === 'ArrowRight' ? (index + 1) % tabs.length : event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : null;
      if (next === null) return;
      event.preventDefault(); caSetView(tabs[next].dataset.view); tabs[next].focus();
    });
  });
  caNode('share').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(location.href); caNode('status').textContent = 'Link copied with the selected circuit, period, view and ranking filters.'; }
    catch { caNode('status').textContent = 'Copy the URL from your address bar to share this selection.'; }
  });
  try {
    caCircuits = (await caGetJSON('/api/circuits')).filter(row => Number(row.totalRacesHeld) > 0);
    if (!caCircuits.length) throw new Error('No circuits with recorded races are available.');
    if (!caCircuits.some(row => String(row.id) === caId)) caId = String(caCircuits.find(row => row.id === 'silverstone')?.id || caCircuits[0].id);
    caNode('search').value = caCircuitLabel(caCircuits.find(row => String(row.id) === caId));
    await caLoad();
  } catch (error) { caNode('status').textContent = `${error.message} Reload the page to retry.`; }
  window.addEventListener('popstate', () => {
    caReadState();
    const circuit = caCircuits.find(row => String(row.id) === caId) || caCircuits[0];
    if (!circuit) return;
    caId = String(circuit.id); caNode('search').value = caCircuitLabel(circuit); caLoad();
  });
}
caInit();
