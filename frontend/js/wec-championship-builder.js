(() => {
  'use strict';
  const scoring = window.WecSeasonSimulatorModel, model = window.WecChampionshipBuilderModel;
  const $ = id => document.getElementById(id);
  const page = '/wec/championship-builder', draftKey = 'racelytic:wec-championship-builder';
  const format = value => Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
  const labels = { drivers: 'Drivers', teams: 'Teams', manufacturers: 'Manufacturers' };
  let archive = [], calendar = [], raceData = Object.create(null), field = { drivers: new Map(), teams: new Map(), manufacturers: new Map() };
  let eligible = { drivers: new Set(), teams: new Set(), manufacturers: new Set() }, mode = 'drivers', restoring = false, saving = false, savedSystems = [];

  function message(value, id = 'builder-calendar-message') { $(id).textContent = value; }
  function applyPreset(preset) {
    const saved = savedSystems.find(system => `saved:${system.id}` === preset);
    const rules = saved ? { points: saved.racePoints, extended: saved.extendedMultiplier, leMans: saved.leMansMultiplier }
      : scoring.presets[preset] || scoring.presets.weighted;
    $('builder-points').value = saved || preset in scoring.presets ? preset : 'weighted';
    $('builder-point-values').value = rules.points.join(', ');
    $('builder-extended').value = rules.extended;
    $('builder-le-mans').value = rules.leMans;
  }
  function readRules() {
    const points = scoring.parsePoints($('builder-point-values').value);
    const extended = Number($('builder-extended').value), leMans = Number($('builder-le-mans').value);
    if (!points) return { error: 'Enter 1–30 non-negative point values, separated by commas.' };
    if (!$('builder-extended').value.trim() || !$('builder-le-mans').value.trim()
      || ![extended, leMans].every(value => Number.isFinite(value) && value >= 0 && value <= 5
        && Math.abs(Math.round(value * 100) - value * 100) < 1e-8)) {
      return { error: 'Race multipliers must be between 0 and 5 with at most two decimal places.' };
    }
    return { rules: scoring.settings({ preset: $('builder-points').value, points, extended, leMans }) };
  }
  function saveDraft() {
    if (restoring) return;
    try {
      sessionStorage.setItem(draftKey, JSON.stringify({ sourceId: new URLSearchParams(location.search).get('id') || $('builder-id').value || '',
        calendar, classCode: $('builder-class').value,
        driverIds: [...eligible.drivers], teamIds: [...eligible.teams], manufacturerIds: [...eligible.manufacturers],
        preset: $('builder-points').value, points: $('builder-point-values').value,
        extended: $('builder-extended').value, leMans: $('builder-le-mans').value,
        name: $('builder-name').value, description: $('builder-description').value, visibility: $('builder-visibility').value }));
    } catch {}
  }
  function populateYears() {
    const years = [...new Set(archive.map(item => Number(item.year)))].sort((a, b) => b - a);
    $('builder-year').innerHTML = years.map(year => `<option value="${year}">${year}</option>`).join('');
    $('builder-year').disabled = !years.length;
    populateRaces();
  }
  function populateRaces() {
    const year = $('builder-year').value;
    const events = archive.filter(item => String(item.year) === year).sort((a, b) => a.round - b.round);
    $('builder-race').innerHTML = events.map(event => `<option value="${esc(event.id)}">R${event.round} · ${esc(event.name)}</option>`).join('');
    $('builder-race').disabled = !events.length;
    $('builder-add-season').disabled = !events.length;
    updateAddButton();
  }
  function updateAddButton() {
    const id = $('builder-race').value, added = calendar.some(item => item.id === id);
    $('builder-add-race').disabled = !id || added || calendar.length >= 100;
    $('builder-add-race').textContent = added ? 'Added' : calendar.length >= 100 ? 'Calendar full' : 'Add race';
  }
  async function fetchRace(id) {
    if (!raceData[id]) {
      const data = await getJSON(`/api/wec/events/${encodeURIComponent(id)}`);
      if (!data.coverage?.classifications || !data.classification?.length) throw new Error('No race classification is available for this event.');
      raceData[id] = data;
    }
    return raceData[id];
  }
  function refreshClass(preferred = null) {
    const options = model.classOptions(calendar, raceData), previous = preferred || $('builder-class').value;
    $('builder-class').innerHTML = options.length
      ? options.map(item => `<option value="${esc(item.code)}">${esc(item.name)}</option>`).join('')
      : '<option value="">Add a race first</option>';
    $('builder-class').disabled = !options.length;
    if (options.some(item => item.code === previous)) $('builder-class').value = previous;
    refreshField();
  }
  function refreshField(saved = null) {
    const next = model.discoveredField(calendar, raceData, $('builder-class').value);
    for (const type of Object.keys(next)) {
      const prior = field[type];
      eligible[type] = new Set([...next[type].keys()].filter(id => saved
        ? (saved[type] || []).includes(id) : eligible[type].has(id) || !prior.has(id)));
    }
    field = next;
    renderFields();
    update();
  }
  function renderFields() {
    $('builder-fields').innerHTML = Object.entries(labels).map(([type, label]) => `<details class="builder-field-section" open><summary><span><strong>Eligible ${label.toLowerCase()}</strong><small id="builder-${type}-count">${eligible[type].size} of ${field[type].size} selected</small></span><span aria-hidden="true">⌄</span></summary><div class="builder-field-tools"><input type="search" data-field-search="${type}" placeholder="Search ${label.toLowerCase()}" aria-label="Search eligible ${label.toLowerCase()}"><button type="button" data-field-action="select" data-field-type="${type}">Select all</button><button type="button" data-field-action="clear" data-field-type="${type}">Clear</button></div><div class="builder-field-list">${field[type].size ? [...field[type]].sort((a, b) => a[1].localeCompare(b[1])).map(([id, name]) => `<label><input type="checkbox" data-field-item="${type}" value="${esc(id)}"${eligible[type].has(id) ? ' checked' : ''}><span>${esc(name)}</span></label>`).join('') : '<small>Add a race containing this class to discover the field.</small>'}</div></details>`).join('');
    $('builder-fields').querySelectorAll('[data-field-item]').forEach(input => input.addEventListener('change', () => {
      const selected = eligible[input.dataset.fieldItem];
      if (input.checked) selected.add(input.value); else selected.delete(input.value);
      $(`builder-${input.dataset.fieldItem}-count`).textContent = `${selected.size} of ${field[input.dataset.fieldItem].size} selected`;
      update();
    }));
    $('builder-fields').querySelectorAll('[data-field-search]').forEach(input => input.addEventListener('input', () => {
      const query = input.value.trim().toLowerCase();
      input.closest('details').querySelectorAll('[data-field-item]').forEach(box => {
        box.closest('label').hidden = Boolean(query && !box.nextElementSibling.textContent.toLowerCase().includes(query));
      });
    }));
    $('builder-fields').querySelectorAll('[data-field-action]').forEach(button => button.addEventListener('click', () => {
      const type = button.dataset.fieldType, selected = button.dataset.fieldAction === 'select';
      $('builder-fields').querySelectorAll(`[data-field-item="${type}"]`).forEach(input => { input.checked = selected; });
      eligible[type] = selected ? new Set(field[type].keys()) : new Set();
      $(`builder-${type}-count`).textContent = `${eligible[type].size} of ${field[type].size} selected`;
      update();
    }));
  }
  function renderCalendar() {
    $('builder-race-count').textContent = `${calendar.length} race${calendar.length === 1 ? '' : 's'}`;
    $('builder-calendar').innerHTML = calendar.length ? calendar.map((item, index) => {
      const event = archive.find(row => row.id === item.id) || raceData[item.id]?.event || {};
      return `<article class="builder-calendar-race" draggable="true" data-calendar-index="${index}"><b>${index + 1}</b><span><strong>${esc(event.name || item.id)}</strong><small>${esc(event.year)} · R${esc(event.round)} · ${esc(event.circuitName || event.circuit?.name || '')}</small></span><label class="wec-builder-weight"><span>Race weight</span><select data-weight="${index}">${[['standard', 'Standard'], ['extended', 'Extended'], ['le-mans', 'Le Mans']].map(([value, label]) => `<option value="${value}"${item.pointsScale === value ? ' selected' : ''}>${label}</option>`).join('')}</select></label><div><button type="button" data-move="${index}" data-direction="-1"${index === 0 ? ' disabled' : ''} aria-label="Move ${esc(event.name)} up">↑</button><button type="button" data-move="${index}" data-direction="1"${index === calendar.length - 1 ? ' disabled' : ''} aria-label="Move ${esc(event.name)} down">↓</button><button type="button" data-remove="${index}" aria-label="Remove ${esc(event.name)}">×</button></div></article>`;
    }).join('') : '<div class="empty-state"><strong>Start with your calendar</strong><span>Add a classified race or a full season above.</span></div>';
    $('builder-calendar').querySelectorAll('[data-weight]').forEach(select => select.addEventListener('change', () => {
      calendar[Number(select.dataset.weight)].pointsScale = select.value; update();
    }));
    $('builder-calendar').querySelectorAll('[data-move]').forEach(button => button.addEventListener('click', () => move(Number(button.dataset.move), Number(button.dataset.move) + Number(button.dataset.direction))));
    $('builder-calendar').querySelectorAll('[data-remove]').forEach(button => button.addEventListener('click', () => {
      calendar.splice(Number(button.dataset.remove), 1); refreshClass(); renderCalendar(); updateAddButton();
    }));
    let dragged = null;
    $('builder-calendar').querySelectorAll('[data-calendar-index]').forEach(card => {
      card.addEventListener('dragstart', () => { dragged = Number(card.dataset.calendarIndex); card.classList.add('is-dragging'); });
      card.addEventListener('dragend', () => card.classList.remove('is-dragging'));
      card.addEventListener('dragover', event => event.preventDefault());
      card.addEventListener('drop', event => { event.preventDefault(); if (dragged !== null) move(dragged, Number(card.dataset.calendarIndex)); });
    });
    updateAddButton();
  }
  function move(from, to) {
    if (to < 0 || to >= calendar.length || from === to) return;
    const [item] = calendar.splice(from, 1); calendar.splice(to, 0, item);
    renderCalendar(); update();
  }
  function renderResults(results) {
    const rows = results[mode], label = labels[mode];
    $('builder-results-title').textContent = `${$('builder-name').value.trim() || 'Custom WEC championship'} · ${label}`;
    $('builder-results').innerHTML = rows.length ? `<div class="table-wrap"><table class="simulation-table"><caption class="sr-only">${esc(label)} standings</caption><thead><tr><th scope="col">Pos.</th><th scope="col">${label.slice(0, -1)}</th><th scope="col">Points</th><th scope="col">Wins</th><th scope="col">Podiums</th></tr></thead><tbody>${rows.map(row => `<tr${row.position === 1 ? ' class="simulated-leader"' : ''}><td class="simulation-position">${row.position}</td><td><a href="/wec/${mode}/${encodeURIComponent(row.id)}"><strong>${esc(row.name)}</strong></a></td><td class="simulated-points">${format(row.points)}</td><td>${row.finishes[1] || 0}</td><td>${(row.finishes[1] || 0) + (row.finishes[2] || 0) + (row.finishes[3] || 0)}</td></tr>`).join('')}</tbody></table></div>` : `<div class="empty-state"><strong>${calendar.length ? 'No eligible results' : 'No classification yet'}</strong><span>${calendar.length ? 'Choose a class and select at least one eligible competitor.' : 'Add a race to calculate the championship.'}</span></div>`;
    const parts = [];
    if (results.coverage.missing) parts.push(`${results.coverage.missing} race${results.coverage.missing === 1 ? '' : 's'} without a classification`);
    if (results.coverage.noClass) parts.push(`${results.coverage.noClass} race${results.coverage.noClass === 1 ? '' : 's'} without this class`);
    $('builder-coverage').textContent = parts.length ? `Not scored: ${parts.join(' · ')}.` : `${results.coverage.scored} classified race${results.coverage.scored === 1 ? '' : 's'} scored.`;
  }
  function update() {
    const { rules, error } = readRules();
    const name = $('builder-name').value.trim();
    const setupError = calendar.length && !$('builder-class').value ? 'Choose a WEC class.'
      : calendar.length && !Object.values(eligible).some(items => items.size) ? 'Select at least one eligible competitor.'
        : calendar.length && (name.length < 2 || name.length > 100) ? 'Championship name must be 2–100 characters.' : '';
    $('builder-save').disabled = saving || Boolean(error || setupError) || !calendar.length;
    message(error || setupError, 'builder-message');
    $('builder-rule-summary').innerHTML = error ? `<p class="wec-builder-error">${esc(error)}</p>`
      : `<div><span>Class finish points</span><strong>${rules.points.join('–')}</strong></div><div><span>Extended races</span><strong>×${format(rules.extended)}</strong></div><div><span>Le Mans</span><strong>×${format(rules.leMans)}</strong></div><div><span>Scoring</span><strong>Best car per team / manufacturer</strong></div>`;
    const results = error ? { drivers: [], teams: [], manufacturers: [], coverage: { scored: 0, missing: 0, noClass: 0 } }
      : model.calculate(calendar, raceData, $('builder-class').value, eligible, rules);
    renderResults(results);
    const years = [...new Set(calendar.map(item => Number(archive.find(event => event.id === item.id)?.year || raceData[item.id]?.event?.year)))].sort((a, b) => a - b);
    $('builder-summary-races').textContent = calendar.length ? `${calendar.length} race${calendar.length === 1 ? '' : 's'}` : 'No races yet';
    $('builder-summary-range').textContent = years.length ? years.length === 1 ? `${years[0]} season` : `${years[0]}–${years.at(-1)} · ${years.length} seasons` : 'Choose a race to begin';
    $('builder-summary-field').textContent = calendar.length ? `${eligible.drivers.size} drivers · ${eligible.teams.size} teams · ${eligible.manufacturers.size} manufacturers` : 'No field yet';
    $('builder-summary-class').textContent = $('builder-class').value && !$('builder-class').disabled
      ? `${$('builder-class').selectedOptions[0]?.textContent} class` : 'Choose a race to discover classes';
    $('builder-summary-points').textContent = $('builder-points').selectedOptions[0]?.textContent || 'Custom';
    $('builder-summary-bonuses').textContent = error || `${rules.points.length} positions · extended ×${format(rules.extended)} · Le Mans ×${format(rules.leMans)}`;
    $('builder-summary-status').textContent = !calendar.length ? 'Start with the calendar' : error ? 'Check scoring rules' : !results[mode].length ? 'Choose an eligible field' : 'Classification live';
    saveDraft();
  }
  async function addRace() {
    const id = $('builder-race').value;
    if (!id || calendar.some(item => item.id === id)) return;
    if (calendar.length >= 100) return message('A championship can contain at most 100 races.');
    $('builder-add-race').disabled = true; message('Loading race classification…');
    try {
      const data = await fetchRace(id);
      calendar.push({ id, pointsScale: data.event.pointsScale || 'standard' });
      refreshClass(); renderCalendar(); message('Race added. Drag rows or use the arrow buttons to reorder.');
    } catch (error) { message(error.message); }
    finally { updateAddButton(); }
  }
  async function addSeason() {
    const year = $('builder-year').value;
    const events = archive.filter(event => String(event.year) === year && !calendar.some(item => item.id === event.id))
      .sort((a, b) => a.round - b.round).slice(0, 100 - calendar.length);
    $('builder-add-season').disabled = true; message(`Loading ${year} classifications…`);
    const settled = await Promise.allSettled(events.map(event => fetchRace(event.id)));
    settled.forEach((result, index) => { if (result.status === 'fulfilled') calendar.push({ id: events[index].id, pointsScale: result.value.event.pointsScale || 'standard' }); });
    refreshClass(); renderCalendar();
    const added = settled.filter(result => result.status === 'fulfilled').length;
    message(added ? `${added} races added from ${year}${added < events.length ? `; ${events.length - added} without classifications skipped` : ''}.` : `No new classified races were available for ${year}.`);
    $('builder-add-season').disabled = false;
  }
  function configuration(rules) {
    return { series: 'wec', raceIds: calendar.map(item => item.id), classCode: $('builder-class').value,
      raceWeights: Object.fromEntries(calendar.map(item => [item.id, item.pointsScale])),
      driverIds: [...eligible.drivers], teamIds: [...eligible.teams], manufacturerIds: [...eligible.manufacturers],
      pointsSystem: { id: $('builder-points').value, name: $('builder-points').selectedOptions[0]?.textContent || 'Custom',
        race: rules.points, sprint: [], qualifying: [], extended: rules.extended, leMans: rules.leMans } };
  }
  function shareState(saved) {
    $('builder-share').hidden = !saved || saved.visibility !== 'public';
    $('builder-share').dataset.url = saved ? `${location.origin}${page}?id=${encodeURIComponent(saved.id)}` : '';
  }
  async function saveChampionship() {
    if (saving) return;
    const { rules, error } = readRules();
    if (error || !calendar.length) return message(error || 'Add a race first.', 'builder-message');
    const name = $('builder-name').value.trim();
    if (!$('builder-class').value) return message('Choose a WEC class.', 'builder-message');
    if (!Object.values(eligible).some(items => items.size)) return message('Select at least one eligible competitor.', 'builder-message');
    if (name.length < 2 || name.length > 100) return message('Championship name must be 2–100 characters.', 'builder-message');
    const id = $('builder-id').value;
    const payload = { name, description: $('builder-description').value,
      visibility: $('builder-visibility').value, configuration: configuration(rules) };
    saving = true; $('builder-save').disabled = true;
    message('Saving…', 'builder-message');
    try {
      const response = await fetch(id ? `/api/custom-championships/${encodeURIComponent(id)}` : '/api/custom-championships',
        { method: id ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const saved = await response.json();
      if (response.status === 401) { $('builder-message').innerHTML = 'Sign in from the <a href="/account?series=wec">account page</a> to save this championship.'; return; }
      if (!response.ok) throw new Error(saved.error || 'Unable to save championship.');
      $('builder-id').value = saved.id;
      history.replaceState(null, '', `${page}?id=${encodeURIComponent(saved.id)}`);
      $('builder-save').textContent = 'Save championship';
      message(saved.visibility === 'public' ? 'Saved and ready to share.' : 'Saved to your account.', 'builder-message');
      shareState(saved); saveDraft();
    } catch (error) { message(error.message, 'builder-message'); }
    finally {
      saving = false;
      const invalid = !calendar.length || !$('builder-class').value || !Object.values(eligible).some(items => items.size)
        || $('builder-name').value.trim().length < 2 || Boolean(readRules().error);
      $('builder-save').disabled = invalid;
    }
  }
  async function restoreConfiguration(config) {
    if (config.series !== 'wec') throw new Error('This championship belongs to another series.');
    const requestedIds = (config.raceIds || []).map(String);
    const ids = requestedIds.filter(id => archive.some(event => event.id === id));
    const settled = await Promise.allSettled(ids.map(id => fetchRace(id)));
    const availableIds = ids.filter((_, index) => settled[index].status === 'fulfilled');
    calendar = availableIds.map(id => ({ id, pointsScale: config.raceWeights?.[id] || raceData[id].event.pointsScale || 'standard' }));
    const points = config.pointsSystem || {};
    $('builder-points').value = 'custom';
    $('builder-point-values').value = (points.race || scoring.presets.weighted.points).join(', ');
    $('builder-extended').value = points.extended ?? 1.5;
    $('builder-le-mans').value = points.leMans ?? 2;
    refreshClass(config.classCode);
    refreshField({ drivers: config.driverIds || [], teams: config.teamIds || [], manufacturers: config.manufacturerIds || [] });
    renderCalendar();
    return requestedIds.length - availableIds.length;
  }
  async function restoreSaved(id) {
    const saved = await getJSON(`/api/custom-championships/${encodeURIComponent(id)}`);
    if (saved.configuration?.series !== 'wec') throw new Error('This championship belongs to another series.');
    $('builder-id').value = saved.owned ? saved.id : '';
    $('builder-name').value = saved.name;
    $('builder-description').value = saved.description || '';
    $('builder-visibility').value = saved.visibility;
    const skipped = await restoreConfiguration(saved.configuration);
    if (!saved.owned) $('builder-save').textContent = 'Save your own copy';
    shareState(saved);
    const ready = saved.owned ? 'Your championship is ready to edit.' : 'Viewing a shared championship. Save your own copy to change it.';
    message(`${ready}${skipped ? ` ${skipped} unavailable race${skipped === 1 ? ' was' : 's were'} skipped.` : ''}`);
  }
  async function restoreDraft(expectedSourceId = '') {
    let draft;
    try { draft = JSON.parse(sessionStorage.getItem(draftKey) || 'null'); } catch { return; }
    if (!draft || !Array.isArray(draft.calendar)) return;
    if (String(draft.sourceId || '') !== String(expectedSourceId || '')) return;
    const ids = draft.calendar.map(item => item.id).filter(id => archive.some(event => event.id === id));
    const settled = await Promise.allSettled(ids.map(id => fetchRace(id)));
    calendar = ids.filter((_, index) => settled[index].status === 'fulfilled').map(id => ({ id,
      pointsScale: draft.calendar.find(item => item.id === id)?.pointsScale || raceData[id].event.pointsScale || 'standard' }));
    $('builder-name').value = draft.name || 'My custom WEC championship';
    $('builder-description').value = draft.description || '';
    $('builder-visibility').value = draft.visibility === 'public' ? 'public' : 'private';
    if (scoring.presets[draft.preset]) applyPreset(draft.preset);
    else { $('builder-points').value = 'custom'; $('builder-point-values').value = draft.points || ''; $('builder-extended').value = draft.extended; $('builder-le-mans').value = draft.leMans; }
    refreshClass(draft.classCode);
    refreshField({ drivers: draft.driverIds || [], teams: draft.teamIds || [], manufacturers: draft.manufacturerIds || [] });
    renderCalendar();
    if (calendar.length) message('Recovered your unfinished championship.');
  }
  function reset() {
    if (calendar.length && !confirm('Reset this championship draft?')) return;
    try { sessionStorage.removeItem(draftKey); } catch {}
    $('builder-id').value = ''; $('builder-name').value = 'My custom WEC championship';
    $('builder-description').value = ''; $('builder-visibility').value = 'private';
    $('builder-save').textContent = 'Save championship';
    history.replaceState(null, '', page); shareState(null);
    calendar = []; field = { drivers: new Map(), teams: new Map(), manufacturers: new Map() };
    eligible = { drivers: new Set(), teams: new Set(), manufacturers: new Set() };
    applyPreset('weighted'); refreshClass(); renderCalendar(); message('Draft reset.');
  }
  $('builder-year').addEventListener('change', populateRaces);
  $('builder-race').addEventListener('change', updateAddButton);
  $('builder-add-race').addEventListener('click', addRace);
  $('builder-add-season').addEventListener('click', addSeason);
  $('builder-class').addEventListener('change', refreshField);
  $('builder-points').addEventListener('change', event => { if (event.target.value !== 'custom') applyPreset(event.target.value); update(); });
  ['builder-point-values', 'builder-extended', 'builder-le-mans'].forEach(id => $(id).addEventListener('input', () => { $('builder-points').value = 'custom'; update(); }));
  ['builder-name', 'builder-description', 'builder-visibility'].forEach(id => $(id).addEventListener('input', update));
  $('builder-save').addEventListener('click', saveChampionship);
  $('builder-reset').addEventListener('click', reset);
  $('builder-share').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText($('builder-share').dataset.url); message('Share link copied.', 'builder-message'); }
    catch { message('Copy the page address to share this championship.', 'builder-message'); }
  });
  document.querySelectorAll('[data-builder-mode]').forEach(button => button.addEventListener('click', () => {
    mode = button.dataset.builderMode;
    document.querySelectorAll('[data-builder-mode]').forEach(item => {
      const active = item === button;
      item.classList.toggle('active', active); item.setAttribute('aria-pressed', String(active));
    });
    update();
  }));
  applyPreset('weighted');
  Promise.all([getJSON('/api/wec/events'), getJSON('/api/points-systems').catch(() => [])]).then(async ([events, systems]) => {
    savedSystems = systems.filter(system => system.series === 'wec');
    $('builder-points').insertAdjacentHTML('beforeend', savedSystems.map(system => `<option value="saved:${esc(system.id)}">${esc(system.name)} · ${system.owned ? 'yours' : 'community'}</option>`).join(''));
    archive = events.filter(event => String(event.status).toLowerCase() === 'completed');
    populateYears();
    restoring = true;
    try {
      const savedId = new URLSearchParams(location.search).get('id');
      if (savedId) { await restoreSaved(savedId); await restoreDraft(savedId); }
      else {
        await restoreDraft('');
        const requestedPreset = new URLSearchParams(location.search).get('preset');
        if (requestedPreset && [...$('builder-points').options].some(option => option.value === requestedPreset)) applyPreset(requestedPreset);
      }
    } catch (error) { message(error.message, 'builder-message'); }
    finally { restoring = false; update(); }
  }).catch(error => message(`Unable to load WEC races: ${error.message}`));
})();
