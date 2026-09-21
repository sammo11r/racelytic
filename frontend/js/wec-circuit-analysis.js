(() => {
  'use strict';
  const model = window.WecCircuitAnalysisModel, $ = id => document.getElementById(id);
  const views = ['specialists', 'history', 'reliability'];
  let circuits = [], data = null, selectedEvents = [], request = 0, controller;
  const state = { circuit: '', era: 'all', classCode: 'all', view: 'specialists', metric: 'wins', minimum: 1 };
  const safe = value => esc(value ?? '');
  const percent = value => value === null ? '—' : `${value.toFixed(1)}%`;
  const href = (type, id) => `/wec/${type}/${encodeURIComponent(id)}`;
  const eraRange = () => state.era === 'all' ? {} : { from: Number(state.era.split('-')[0]), to: Number(state.era.split('-')[1]) };

  function readState() {
    const query = new URLSearchParams(location.search);
    state.circuit = query.get('id') || '';
    state.era = ['all', '2012-2015', '2016-2020', '2021-2026'].includes(query.get('era')) ? query.get('era') : 'all';
    state.classCode = query.get('class') || 'all';
    state.view = views.includes(query.get('view')) ? query.get('view') : 'specialists';
    state.metric = ['wins', 'podiums', 'winRate', 'averageFinish'].includes(query.get('metric')) ? query.get('metric') : 'wins';
    state.minimum = [1, 3, 5].includes(Number(query.get('min'))) ? Number(query.get('min')) : 1;
  }
  function saveState() {
    const query = new URLSearchParams({ id: state.circuit, era: state.era, class: state.classCode, view: state.view, metric: state.metric, min: String(state.minimum) });
    history.replaceState(null, '', `${location.pathname}?${query}`);
  }
  function setView(view, save = true) {
    state.view = views.includes(view) ? view : 'specialists';
    $('wec-ca-view').value = state.view;
    document.querySelectorAll('[data-wec-ca-view]').forEach(button => {
      const active = button.dataset.wecCaView === state.view;
      button.setAttribute('aria-selected', String(active)); button.tabIndex = active ? 0 : -1;
      $(`wec-ca-panel-${button.dataset.wecCaView}`).hidden = !active;
    });
    if (save && state.circuit) saveState();
  }
  function renderHeader() {
    const circuit = data.circuit;
    $('wec-ca-title').textContent = circuit.name;
    const circuitType = circuit.type ? `${String(circuit.type).toLowerCase().replace(/\s+circuit$/, '')} circuit` : '';
    $('wec-ca-meta').textContent = [circuit.placeName, circuit.countryName, circuitType].filter(Boolean).join(' · ');
    $('wec-ca-circuit-link').hidden = false; $('wec-ca-circuit-link').href = href('circuits', circuit.id);
    document.title = `${circuit.name} · WEC Circuit Analysis · Racelytic`;
    const details = [circuit.length ? `${circuit.length.toFixed(3)} km` : '', circuit.turns ? `${circuit.turns} turns` : ''].filter(Boolean).join(' · ');
    $('wec-ca-layout').hidden = false;
    $('wec-ca-layout').innerHTML = circuit.layoutId ? `<img src="/assets/circuits/${encodeURIComponent(circuit.layoutId)}.svg" alt="Track outline of ${safe(circuit.name)}"><figcaption>${safe(details)}<small>${safe(circuit.layoutVersion || 'Latest recorded layout')}</small></figcaption>` : `<span>Track outline unavailable</span><figcaption>${safe(details)}</figcaption>`;
    $('wec-ca-layout').querySelector('img')?.addEventListener('error', event => event.target.remove(), { once: true });
  }
  function renderClasses() {
    const values = model.classes(model.filter(data.events, eraRange()));
    if (state.classCode !== 'all' && !values.some(row => row.code === state.classCode)) state.classCode = 'all';
    $('wec-ca-class').innerHTML = `<option value="all">All classes</option>${values.map(row => `<option value="${safe(row.code)}">${safe(row.code)} · ${safe(row.name)}</option>`).join('')}`;
    $('wec-ca-class').value = state.classCode; $('wec-ca-class').disabled = false;
  }
  function renderSummary() {
    const summary = model.summary(selectedEvents), span = summary.firstYear ? (summary.firstYear === summary.lastYear ? summary.firstYear : `${summary.firstYear}–${summary.lastYear}`) : 'No races';
    $('wec-ca-summary').innerHTML = [
      ['Races analysed', summary.races, span], ['Class wins', summary.classWinners, `${summary.winningTeams} winning teams`],
      ['Classified finish rate', percent(summary.finishRate), `${summary.classified} of ${summary.starts} starts`],
      ['Distance completed', percent(summary.completionRate), 'Relative to class leaders']
    ].map(([label, value, note]) => `<div><span>${safe(label)}</span><strong>${safe(value)}</strong><small>${safe(note)}</small></div>`).join('');
  }
  function metricValue(row) {
    if (state.metric === 'winRate') return percent(row.winRate);
    if (state.metric === 'averageFinish') return row.averageFinish === null ? '—' : row.averageFinish.toFixed(2);
    return row[state.metric];
  }
  function ranking(type, title, collection) {
    const rows = model.rank(selectedEvents, type, state.metric, state.minimum).slice(0, 10);
    const max = Math.max(1, ...rows.map(row => state.metric === 'averageFinish' ? 1 / row.averageFinish : row[state.metric] || 0));
    return `<article class="wec-ca-ranking"><header><h3>${safe(title)}</h3><span>${rows.length ? `Top ${rows.length}` : 'No eligible entries'}</span></header>${rows.length ? `<ol>${rows.map(row => {
      const scale = state.metric === 'averageFinish' ? 1 / row.averageFinish : row[state.metric] || 0;
      return `<li><div><a href="${href(collection, row.id)}">${safe(row.name)}</a><small>${row.starts} starts · ${row.wins} wins · ${row.podiums} podiums</small></div><strong>${safe(metricValue(row))}</strong><i aria-hidden="true" style="--value:${Math.max(4, scale / max * 100)}%"></i></li>`;
    }).join('')}</ol>` : '<p class="wec-ca-no-ranking">Lower the minimum starts or widen the selection.</p>'}</article>`;
  }
  function renderRankings() {
    $('wec-ca-rankings').innerHTML = ranking('driver', 'Drivers', 'drivers') + ranking('team', 'Teams', 'teams') + ranking('manufacturer', 'Manufacturers', 'manufacturers');
  }
  function duration(event) {
    if (event.formatType === 'distance' && event.scheduledDistanceKm) return `${event.scheduledDistanceKm} km`;
    if (event.scheduledMinutes) return event.scheduledMinutes % 60 ? `${event.scheduledMinutes} min` : `${event.scheduledMinutes / 60} hours`;
    return '—';
  }
  function winnerLabel(result) { return result ? `${result.team?.name || 'Unknown'} #${result.carNumber || '—'}` : 'No classified winner'; }
  function renderHistory() {
    const rows = model.eventRows(selectedEvents);
    $('wec-ca-history').innerHTML = `<div class="table-wrap" tabindex="0"><table class="wec-ca-history-table"><thead><tr><th>Season</th><th>Event</th><th>Format</th><th>Overall winner</th><th>Class winners</th><th>Finishers</th></tr></thead><tbody>${rows.map(row => `<tr><td><strong>${row.year}</strong></td><td><a href="${href('races', row.id)}">${safe(row.name)}</a></td><td>${safe(duration(row))}</td><td>${safe(winnerLabel(row.overallWinner))}</td><td><div class="wec-ca-winners">${row.classWinners.map(winner => `<span><b>${safe(winner.class.code)}</b>${safe(winnerLabel(winner))}</span>`).join('')}</div></td><td>${row.classified}/${row.starters}</td></tr>`).join('')}</tbody></table></div>`;
  }
  function renderReliability() {
    const rows = model.reliability(selectedEvents);
    $('wec-ca-reliability').innerHTML = rows.length ? `<div class="wec-ca-reliability-grid">${rows.map(row => `<article><header><strong>${safe(row.code)}</strong><span>${row.starts} starts</span></header><div><span>Classified finishes</span><b>${percent(row.finishRate)}</b><i style="--value:${row.finishRate || 0}%"></i></div><div><span>Distance completed</span><b>${percent(row.completionRate)}</b><i style="--value:${row.completionRate || 0}%"></i></div></article>`).join('')}</div>` : '<p>No reliability data for this selection.</p>';
  }
  function render() {
    renderClasses(); selectedEvents = model.filter(data.events, { ...eraRange(), classCode: state.classCode });
    const empty = !selectedEvents.length;
    $('wec-ca-empty').hidden = !empty; $('wec-ca-workspace').hidden = empty; $('wec-ca-summary').hidden = empty;
    if (empty) { $('wec-ca-status').textContent = 'No matching classified events.'; saveState(); return; }
    renderSummary(); renderRankings(); renderHistory(); renderReliability(); setView(state.view, false);
    $('wec-ca-status').textContent = `${selectedEvents.length} event${selectedEvents.length === 1 ? '' : 's'} in this selection.`; saveState();
  }
  async function load() {
    const version = ++request; controller?.abort(); controller = new AbortController();
    $('wec-ca-status').textContent = 'Loading circuit analysis…'; $('wec-ca-workspace').hidden = true;
    try {
      const next = await getJSON(`/api/wec/analysis/circuits/${encodeURIComponent(state.circuit)}`, { signal: controller.signal });
      if (version !== request) return; data = next; renderHeader(); render();
    } catch (error) {
      if (error.name === 'AbortError' || version !== request) return;
      $('wec-ca-summary').hidden = true; $('wec-ca-status').textContent = `${error.message || 'Circuit analysis could not be loaded.'} Please retry.`;
    }
  }
  async function init() {
    readState(); $('wec-ca-era').value = state.era; $('wec-ca-metric').value = state.metric; $('wec-ca-minimum').value = String(state.minimum); setView(state.view, false);
    try {
      circuits = await getJSON('/api/wec/circuits');
      if (!circuits.length) throw new Error('No WEC circuits are available.');
      if (!state.circuit || !circuits.some(circuit => String(circuit.id) === state.circuit)) state.circuit = String(circuits[0].id);
      $('wec-ca-circuit').innerHTML = circuits.map(circuit => `<option value="${safe(circuit.id)}">${safe(circuit.name)}${circuit.countryName ? ` · ${safe(circuit.countryName)}` : ''}</option>`).join('');
      $('wec-ca-circuit').value = state.circuit; $('wec-ca-circuit').disabled = false; await load();
    } catch (error) { $('wec-ca-status').textContent = `${error.message || 'WEC circuits could not be loaded.'} Please retry.`; }
  }
  $('wec-ca-circuit').addEventListener('change', () => { state.circuit = $('wec-ca-circuit').value; state.classCode = 'all'; load(); });
  $('wec-ca-era').addEventListener('change', () => { state.era = $('wec-ca-era').value; state.classCode = 'all'; render(); });
  $('wec-ca-class').addEventListener('change', () => { state.classCode = $('wec-ca-class').value; render(); });
  $('wec-ca-metric').addEventListener('change', () => { state.metric = $('wec-ca-metric').value; renderRankings(); saveState(); });
  $('wec-ca-minimum').addEventListener('change', () => { state.minimum = Number($('wec-ca-minimum').value); renderRankings(); saveState(); });
  $('wec-ca-view').addEventListener('change', () => setView($('wec-ca-view').value));
  document.querySelectorAll('[data-wec-ca-view]').forEach(button => button.addEventListener('click', () => setView(button.dataset.wecCaView)));
  $('wec-ca-reset').addEventListener('click', () => { state.era = 'all'; state.classCode = 'all'; $('wec-ca-era').value = 'all'; render(); });
  $('wec-ca-share').addEventListener('click', async () => { try { await navigator.clipboard.writeText(location.href); $('wec-ca-status').textContent = 'Link copied.'; } catch { $('wec-ca-status').textContent = 'Copy the current address to share this view.'; } });
  init();
})();
