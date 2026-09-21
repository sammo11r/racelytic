(() => {
  'use strict';
  const scoring = window.WecSeasonSimulatorModel, $ = id => document.getElementById(id);
  const draftKey = 'racelytic:wec-points-system-draft';
  const destinations = [
    ['/wec/simulate-season', 'Simulate season'],
    ['/wec/scenario-calculator', 'Scenario calculator'],
    ['/wec/championship-builder', 'Championship builder']
  ];
  const format = value => Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 });
  let systems = [], user = null;

  function keyFor(system) { return system.id ? `saved:${system.id}` : system.key; }
  function rulesFor(system) {
    return { points: system.racePoints || system.points || [], extended: Number(system.extendedMultiplier ?? system.extended ?? 1),
      leMans: Number(system.leMansMultiplier ?? system.leMans ?? 1) };
  }
  function allRules() {
    return [
      ...Object.entries(scoring.presets).map(([key, preset]) => ({ key, name: preset.label, ...preset })),
      ...systems.map(system => ({ ...system, key: keyFor(system) }))
    ];
  }
  function linksFor(key) {
    return destinations.map(([route, label]) => `<a href="${route}?preset=${encodeURIComponent(key)}">${esc(label)} →</a>`).join('');
  }
  function card(system, type) {
    const rules = rulesFor(system), key = keyFor(system);
    const badge = type === 'preset' ? 'MODEL PRESET' : system.owned ? system.visibility === 'public' ? 'YOUR PUBLIC SYSTEM' : 'YOUR PRIVATE SYSTEM' : `BY ${system.ownerName || 'THE COMMUNITY'}`;
    const actions = type === 'preset'
      ? `<button type="button" data-copy-preset="${esc(key)}">Customize</button>`
      : `<button type="button" data-edit-system="${esc(system.id)}" data-copy="${system.owned ? '0' : '1'}">${system.owned ? 'Edit rules' : 'Remix rules'}</button>`;
    return `<article class="wec-points-card"><span>${esc(badge)}</span><h3>${esc(system.name)}</h3><p>${type === 'preset' ? 'Hypothetical positional scoring for WEC class results.' : 'Reusable endurance-race rules.'}</p><dl><div><dt>Class points</dt><dd>${esc(rules.points.join('–'))}</dd></div><div><dt>Race weights</dt><dd>Extended ×${format(rules.extended)} · Le Mans ×${format(rules.leMans)}</dd></div></dl><div class="wec-points-card-actions">${linksFor(key)}${actions}</div></article>`;
  }
  function renderCards() {
    $('wec-points-preset-grid').innerHTML = Object.entries(scoring.presets).map(([key, preset]) => card({ key, name: preset.label, ...preset }, 'preset')).join('');
    const owned = systems.filter(system => system.owned);
    $('wec-points-owned').innerHTML = owned.length ? owned.map(system => card(system, 'saved')).join('')
      : '<div class="wec-points-empty">No saved WEC systems yet. Start with a preset or create your own.</div>';
    const query = $('wec-points-search').value.trim().toLowerCase();
    const shared = systems.filter(system => !system.owned && (!query || `${system.name} ${system.ownerName}`.toLowerCase().includes(query)));
    $('wec-points-public').innerHTML = shared.length ? shared.map(system => card(system, 'saved')).join('')
      : '<div class="wec-points-empty">No public WEC systems match this search.</div>';
    document.querySelectorAll('[data-copy-preset]').forEach(button => button.addEventListener('click', () => {
      const source = allRules().find(item => item.key === button.dataset.copyPreset);
      openEditor(source, true);
    }));
    document.querySelectorAll('[data-edit-system]').forEach(button => button.addEventListener('click', () => {
      const source = systems.find(item => item.id === button.dataset.editSystem);
      openEditor(source, button.dataset.copy === '1');
    }));
  }
  function compareOptions() {
    const choices = allRules(), first = $('wec-points-first'), second = $('wec-points-second');
    const previous = [first.value, second.value];
    const options = choices.map(item => `<option value="${esc(item.key)}">${esc(item.name)}</option>`).join('');
    first.innerHTML = options; second.innerHTML = options;
    const requested = (new URLSearchParams(location.search).get('compare') || '').split(',');
    first.value = choices.some(item => item.key === requested[0]) ? requested[0] : choices.some(item => item.key === previous[0]) ? previous[0] : 'weighted';
    second.value = choices.some(item => item.key === requested[1]) ? requested[1] : choices.some(item => item.key === previous[1]) ? previous[1] : 'equal';
    renderComparison();
  }
  function renderComparison(updateUrl = false) {
    const choices = allRules();
    const left = choices.find(item => item.key === $('wec-points-first').value) || choices[0];
    const right = choices.find(item => item.key === $('wec-points-second').value) || choices[1] || choices[0];
    if (!left || !right) return;
    const a = rulesFor(left), b = rulesFor(right);
    const rows = [
      ['Class-position points', a.points.join('–'), b.points.join('–')],
      ['Standard race', '×1', '×1'],
      ['Extended race', `×${format(a.extended)}`, `×${format(b.extended)}`],
      ['Le Mans', `×${format(a.leMans)}`, `×${format(b.leMans)}`],
      ['First-place at Le Mans', `${format(Number(a.points[0] || 0) * a.leMans)} pts`, `${format(Number(b.points[0] || 0) * b.leMans)} pts`]
    ];
    $('wec-points-comparison').innerHTML = `<table><caption>${esc(left.name)} compared with ${esc(right.name)}</caption><thead><tr><th scope="col">Rule</th><th scope="col">${esc(left.name)}</th><th scope="col">${esc(right.name)}</th></tr></thead><tbody>${rows.map(([label, one, two]) => `<tr class="${one === two ? '' : 'is-different'}"><th scope="row">${esc(label)}</th><td>${esc(one)}</td><td>${esc(two)}</td></tr>`).join('')}</tbody></table><div class="points-compare-actions"><a class="button primary" href="/wec/simulate-season?preset=${encodeURIComponent(left.key)}">Apply ${esc(left.name)}</a><a class="button secondary" href="/wec/simulate-season?preset=${encodeURIComponent(right.key)}">Apply ${esc(right.name)}</a></div>`;
    if (updateUrl) {
      const url = new URL(location.href);
      url.searchParams.set('compare', `${left.key},${right.key}`);
      history.replaceState(null, '', url);
    }
  }
  function formValues() {
    const points = scoring.parsePoints($('wec-points-positions').value);
    const extended = Number($('wec-points-extended').value), leMans = Number($('wec-points-le-mans').value);
    const name = $('wec-points-name').value.trim();
    const error = name.length < 2 || name.length > 100 ? 'Name must be 2–100 characters.'
      : !points ? 'Enter 1–30 non-negative point values, separated by commas.'
        : !$('wec-points-extended').value.trim() || !$('wec-points-le-mans').value.trim()
          || ![extended, leMans].every(value => Number.isFinite(value) && value >= 0 && value <= 5
            && Math.abs(Math.round(value * 100) - value * 100) < 1e-8)
          ? 'Multipliers must be between 0 and 5 with at most two decimal places.' : '';
    return { error, payload: { name, series: 'wec', racePoints: points || [], sprintPoints: [], qualifyingPoints: [],
      poleBonus: 0, fastestLapBonus: 0, extendedMultiplier: extended, leMansMultiplier: leMans,
      visibility: $('wec-points-visibility').value } };
  }
  function preview(saveDraft = true) {
    const { error, payload } = formValues();
    $('wec-points-preview-name').textContent = payload.name || 'Untitled points system';
    $('wec-points-preview-status').textContent = error || 'Rules are valid and ready to save.';
    $('wec-points-preview-status').classList.toggle('is-error', Boolean(error));
    $('wec-points-preview-scores').innerHTML = `<div><span>Class positions</span><strong>${esc(payload.racePoints.join('–') || 'No points')}</strong></div><div><span>Extended race</span><strong>×${Number.isFinite(payload.extendedMultiplier) ? format(payload.extendedMultiplier) : '—'}</strong></div><div><span>Le Mans</span><strong>×${Number.isFinite(payload.leMansMultiplier) ? format(payload.leMansMultiplier) : '—'}</strong></div>`;
    $('wec-points-preview-links').innerHTML = $('wec-points-id').value ? linksFor(`saved:${$('wec-points-id').value}`) : '';
    $('wec-points-form').querySelector('[type="submit"]').disabled = Boolean(error);
    if (user && saveDraft) { try { sessionStorage.setItem(draftKey, JSON.stringify({ ...payload, id: $('wec-points-id').value })); } catch {} }
  }
  function openEditor(source = null, copy = false) {
    if (!user) { $('wec-points-login').hidden = false; $('wec-points-login').scrollIntoView({ block: 'center' }); return; }
    const fallback = scoring.presets.weighted;
    const rules = source ? rulesFor(source) : { points: fallback.points, extended: fallback.extended, leMans: fallback.leMans };
    $('wec-points-id').value = copy ? '' : source?.id || '';
    $('wec-points-name').value = copy ? `${source?.name || ''} copy` : source?.name || '';
    $('wec-points-positions').value = rules.points.join(', ');
    $('wec-points-extended').value = rules.extended;
    $('wec-points-le-mans').value = rules.leMans;
    $('wec-points-visibility').value = copy ? 'private' : source?.visibility || 'private';
    $('wec-points-form-title').textContent = copy ? 'Customize points system' : source?.id ? 'Edit points system' : 'Create points system';
    $('wec-points-delete').hidden = !$('wec-points-id').value;
    $('wec-points-message').textContent = '';
    $('wec-points-form').hidden = false;
    preview();
    $('wec-points-form').scrollIntoView({ block: 'start', behavior: 'smooth' });
  }
  async function loadSystems() {
    systems = (await getJSON('/api/points-systems')).filter(item => item.series === 'wec');
    renderCards(); compareOptions();
  }
  $('wec-points-new').addEventListener('click', () => {
    let draft; try { draft = JSON.parse(sessionStorage.getItem(draftKey) || 'null'); } catch {}
    openEditor(draft || null);
  });
  $('wec-points-close').addEventListener('click', () => { $('wec-points-form').hidden = true; });
  $('wec-points-form').addEventListener('input', preview);
  $('wec-points-form').addEventListener('submit', async event => {
    event.preventDefault();
    const { error, payload } = formValues(); if (error) return $('wec-points-message').textContent = error;
    const id = $('wec-points-id').value, submit = $('wec-points-form').querySelector('[type="submit"]');
    submit.disabled = true; $('wec-points-message').textContent = 'Saving…';
    try {
      const response = await fetch(id ? `/api/points-systems/${encodeURIComponent(id)}` : '/api/points-systems',
        { method: id ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const saved = await response.json();
      if (!response.ok) throw new Error(saved.error || 'Unable to save points system.');
      $('wec-points-id').value = saved.id;
      $('wec-points-delete').hidden = false;
      try { sessionStorage.removeItem(draftKey); } catch {}
      await loadSystems();
      $('wec-points-message').textContent = 'Saved. This system is available in all three WEC simulator tools.';
      preview(false);
    } catch (failure) { $('wec-points-message').textContent = failure.message; }
    finally { submit.disabled = false; }
  });
  $('wec-points-delete').addEventListener('click', async () => {
    const id = $('wec-points-id').value;
    if (!id || !confirm('Delete this WEC points system?')) return;
    try {
      const response = await fetch(`/api/points-systems/${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!response.ok) { const body = await response.json(); throw new Error(body.error || 'Unable to delete system.'); }
      $('wec-points-form').hidden = true;
      try { sessionStorage.removeItem(draftKey); } catch {}
      await loadSystems();
    } catch (failure) { $('wec-points-message').textContent = failure.message; }
  });
  $('wec-points-search').addEventListener('input', renderCards);
  ['wec-points-first', 'wec-points-second'].forEach(id => $(id).addEventListener('change', () => renderComparison(true)));
  $('wec-points-copy').addEventListener('click', async () => {
    const url = new URL(location.href);
    url.searchParams.set('compare', `${$('wec-points-first').value},${$('wec-points-second').value}`);
    try { await navigator.clipboard.writeText(url.href); $('wec-points-copy').textContent = 'Copied'; }
    catch { $('wec-points-copy').textContent = 'Copy page address'; }
  });
  Promise.all([getJSON('/api/account'), getJSON('/api/points-systems')]).then(([account, available]) => {
    user = account.user;
    systems = available.filter(item => item.series === 'wec');
    $('wec-points-login').hidden = Boolean(user);
    $('wec-points-new').hidden = !user;
    renderCards(); compareOptions();
    const params = new URLSearchParams(location.search);
    const copy = systems.find(item => item.id === params.get('copy'));
    if (copy && user) openEditor(copy, true);
    else if (params.get('edit') && user) {
      const owned = systems.find(item => item.id === params.get('edit') && item.owned);
      if (owned) openEditor(owned);
    }
  }).catch(error => {
    $('wec-points-owned').innerHTML = `<div class="wec-points-empty">Unable to load saved systems: ${esc(error.message)}</div>`;
    $('wec-points-preset-grid').innerHTML = Object.entries(scoring.presets).map(([key, preset]) => card({ key, name: preset.label, ...preset }, 'preset')).join('');
  });
})();
