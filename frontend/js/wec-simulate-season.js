(() => {
  'use strict';
  const model = window.WecSeasonSimulatorModel, $ = id => document.getElementById(id);
  const initial = new URLSearchParams(location.search);
  let seasonData = null, requestId = 0, savedSystems = [];
  const collection = { driver: 'drivers', team: 'teams', competitor: 'entries', manufacturer: 'manufacturers' };
  const showStatus = message => { $('wec-sim-status').textContent = message; $('wec-sim-status').hidden = !message; };
  const format = value => Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 });

  function applyPreset(key) {
    const saved = savedSystems.find(system => `saved:${system.id}` === key);
    const preset = saved ? { points: saved.racePoints, extended: saved.extendedMultiplier, leMans: saved.leMansMultiplier }
      : model.presets[key] || model.presets.weighted;
    $('wec-sim-preset').value = saved || key in model.presets ? key : 'weighted';
    $('wec-sim-points').value = preset.points.join(', ');
    $('wec-sim-extended').value = preset.extended;
    $('wec-sim-le-mans').value = preset.leMans;
  }

  function readRules() {
    const points = model.parsePoints($('wec-sim-points').value);
    const extended = Number($('wec-sim-extended').value), leMans = Number($('wec-sim-le-mans').value);
    if (!points) return { error: 'Enter between 1 and 30 non-negative point values, separated by commas.' };
    if (!$('wec-sim-extended').value.trim() || !$('wec-sim-le-mans').value.trim()
      || ![extended, leMans].every(value => Number.isFinite(value) && value >= 0 && value <= 5
        && Math.abs(Math.round(value * 100) - value * 100) < 1e-8)) return { error: 'Race multipliers must be between 0 and 5 with at most two decimal places.' };
    return { rules: model.settings({ preset: $('wec-sim-preset').value, points, extended, leMans }) };
  }

  function saveState() {
    if (!seasonData) return;
    const url = new URL(location.href);
    url.searchParams.set('year', $('wec-sim-season').value);
    url.searchParams.set('championship', $('wec-sim-championship').value);
    url.searchParams.set('preset', $('wec-sim-preset').value);
    if ($('wec-sim-preset').value === 'custom') {
      url.searchParams.set('points', $('wec-sim-points').value);
      url.searchParams.set('extended', $('wec-sim-extended').value);
      url.searchParams.set('leMans', $('wec-sim-le-mans').value);
    } else {
      ['points', 'extended', 'leMans'].forEach(key => url.searchParams.delete(key));
    }
    if ($('wec-sim-changed').checked) url.searchParams.set('changed', '1'); else url.searchParams.delete('changed');
    history.replaceState(null, '', url);
  }

  function render() {
    if (!seasonData) return;
    const { rules, error } = readRules();
    if (error) { showStatus(error); $('wec-sim-summary').innerHTML = ''; $('wec-sim-table').innerHTML = ''; $('wec-sim-share').disabled = true; return; }
    const result = model.simulate(seasonData, $('wec-sim-championship').value, rules);
    if (!result) { showStatus('Choose a single-class championship to simulate.'); return; }
    const leaderNames = result.leaders.map(row => row.name).join(' · ');
    const officialNames = result.officialLeaders.map(row => row.name).join(' · ') || 'Not recorded';
    $('wec-sim-results-title').textContent = `${result.championship.name} · ${seasonData.season.year}`;
    $('wec-sim-summary').innerHTML = [
      ['Simulated leader', leaderNames, `${format(result.leaders[0]?.points || 0)} pts`],
      ['Official leader', officialNames, 'Official final standing'],
      ['Changed positions', result.changed, `${result.events.length} race${result.events.length === 1 ? '' : 's'} recalculated`]
    ].map(([label, value, note]) => `<div><span>${esc(label)}</span><strong>${esc(value)}</strong><small>${esc(note)}</small></div>`).join('');
    const rows = $('wec-sim-changed').checked ? result.rows.filter(row => row.change !== 0 && row.change !== null) : result.rows;
    const linkType = collection[result.championship.entityType];
    $('wec-sim-table').innerHTML = rows.length ? `<table class="wec-sim-table"><caption class="sr-only">${esc(result.championship.name)} alternative standings</caption><thead><tr><th scope="col">New</th><th scope="col">${esc(result.championship.entityType === 'driver' ? 'Driver' : result.championship.entityType === 'manufacturer' ? 'Manufacturer' : 'Team')}</th><th scope="col">Points</th><th scope="col">Official</th><th scope="col">Change</th>${result.events.map(event => `<th scope="col"><a href="/wec/races/${encodeURIComponent(event.id)}" title="${esc(event.name)}">R${esc(event.round)}</a></th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr><td>P${row.position}</td><th scope="row"><a href="/wec/${linkType}/${encodeURIComponent(row.id)}">${esc(row.name)}</a></th><td class="wec-sim-points-cell">${format(row.points)}</td><td>${row.officialPosition == null ? '—' : `P${row.officialPosition}`}<small>${format(row.officialPoints)} official pts</small></td><td class="${row.change > 0 ? 'wec-sim-up' : row.change < 0 ? 'wec-sim-down' : ''}">${row.change == null ? '—' : row.change > 0 ? `↑ ${row.change}` : row.change < 0 ? `↓ ${Math.abs(row.change)}` : '—'}</td>${row.rounds.map(round => `<td>${round.position === null ? esc(String(round.status || '—').replaceAll('-', ' ')) : `P${round.position}`}<small>${format(round.points)} pts</small></td>`).join('')}</tr>`).join('')}</tbody></table>` : '<p class="empty-state">No positions changed under these rules.</p>';
    showStatus(''); $('wec-sim-share').disabled = false; saveState();
  }

  async function loadSeason(year, requestedChampionship = null) {
    const current = ++requestId;
    seasonData = null; showStatus(`Loading ${year} WEC season…`); $('wec-sim-championship').disabled = true; $('wec-sim-share').disabled = true;
    $('wec-sim-summary').innerHTML = ''; $('wec-sim-table').innerHTML = '';
    try {
      const data = await getJSON(`/api/wec/analysis/seasons/${encodeURIComponent(year)}`);
      if (current !== requestId) return;
      seasonData = data;
      const choices = model.eligibleChampionships(data);
      const select = $('wec-sim-championship');
      select.innerHTML = choices.map(item => `<option value="${esc(item.id)}">${esc(item.name)}</option>`).join('');
      select.disabled = !choices.length;
      const requested = choices.find(item => item.id === requestedChampionship);
      const preferred = choices.find(item => item.entityType === 'manufacturer' && /hypercar|lmp1/i.test(item.name)) || choices[0];
      if (requested || preferred) select.value = (requested || preferred).id;
      if (choices.length) render(); else showStatus('This season has no single-class championship standings to simulate.');
    } catch (error) { if (current === requestId) showStatus(`Unable to load ${year}: ${error.message}`); }
  }

  $('wec-sim-season').addEventListener('change', event => loadSeason(event.target.value));
  $('wec-sim-championship').addEventListener('change', render);
  $('wec-sim-preset').addEventListener('change', event => { if (event.target.value !== 'custom') applyPreset(event.target.value); render(); });
  ['wec-sim-points', 'wec-sim-extended', 'wec-sim-le-mans'].forEach(id => $(id).addEventListener('input', () => { $('wec-sim-preset').value = 'custom'; render(); }));
  $('wec-sim-changed').addEventListener('change', render);
  $('wec-sim-share').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(location.href); showStatus('Share link copied.'); }
    catch { showStatus('Copy the current address to share this simulation.'); }
  });

  applyPreset(initial.get('preset') || 'weighted');
  if (initial.has('points')) { $('wec-sim-preset').value = 'custom'; $('wec-sim-points').value = initial.get('points'); }
  if (initial.has('extended')) $('wec-sim-extended').value = initial.get('extended');
  if (initial.has('leMans')) $('wec-sim-le-mans').value = initial.get('leMans');
  $('wec-sim-changed').checked = initial.get('changed') === '1';
  Promise.all([getJSON('/api/wec/seasons'), getJSON('/api/points-systems').catch(() => [])]).then(([seasons, systems]) => {
    savedSystems = systems.filter(system => system.series === 'wec');
    $('wec-sim-preset').insertAdjacentHTML('beforeend', savedSystems.map(system => `<option value="saved:${esc(system.id)}">${esc(system.name)} · ${system.owned ? 'yours' : 'community'}</option>`).join(''));
    if (!initial.has('points')) applyPreset(initial.get('preset') || 'weighted');
    const eligible = seasons.filter(season => Number(season.eventCount) > 0);
    const select = $('wec-sim-season');
    select.innerHTML = eligible.map(season => `<option value="${season.year}">${season.year}</option>`).join('');
    select.disabled = !eligible.length;
    if (!eligible.length) return showStatus('No WEC seasons are available.');
    const year = eligible.find(season => String(season.year) === initial.get('year'))?.year || eligible[0].year;
    select.value = year;
    loadSeason(year, initial.get('championship'));
  }).catch(error => showStatus(`Unable to load WEC seasons: ${error.message}`));
})();
