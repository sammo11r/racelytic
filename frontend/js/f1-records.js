(() => {
  const node = id => document.getElementById(`fr-${id}`);
  const labels = { wins: 'Wins', championships: 'Championships', podiums: 'Podiums', poles: 'Pole positions', fastestLaps: 'Fastest laps', points: 'Points', starts: 'Starts', gridGain: 'Average positions gained' };
  const currentYear = new Date().getFullYear();
  const series = activeSeriesKey(), junior = series !== 'f1', academy = series === 'academy';
  const firstSeason = { f1: 1950, f2: 2017, f3: 2019, academy: 2023 }[series];
  const teamLabel = ['f3', 'academy'].includes(series) ? 'Team' : 'Constructor';
  const entityLabel = value => value === 'drivers' ? 'drivers' : `${teamLabel.toLowerCase()}s`;
  const formatLabel = value => value === 'all' ? 'All race formats' : value === 'F' ? (academy ? 'Standard races' : 'Feature races') : (academy ? 'Reverse-grid races' : 'Sprint races');
  let type = 'drivers', data = null, page = 1, request = 0, controller, saveConfiguration = null;
  const pickers = {};
  const valueText = (value, category) => category === 'gridGain' ? `${value > 0 ? '+' : ''}${Number(value).toFixed(2)}` : fmtNumber(value);
  const link = entry => `${activeSeriesBase()}/${data.type === 'drivers' ? 'driver' : teamLabel.toLowerCase()}?id=${encodeURIComponent(entry.id)}`;
  const normalize = text => String(text).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

  function picker(key, rows) {
    const input = node(key), root = node(`${key}-picker`), list = node(`${key}-options`), arrow = root.querySelector('button');
    const all = { id: '', name: `All ${key === 'circuit' ? 'circuits' : `${teamLabel.toLowerCase()}s`}` };
    const items = [all, ...rows.sort((a, b) => a.name.localeCompare(b.name)).map(row => ({ id: String(row.id), name: row.name }))];
    let selected = '', matches = [], active = -1;
    function label() { return items.find(row => row.id === selected)?.name || all.name; }
    function close() { list.hidden = true; input.setAttribute('aria-expanded', 'false'); arrow.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant'); input.value = selected ? label() : ''; }
    function highlight(index) {
      active = index;
      list.querySelectorAll('[role=option]').forEach((option, i) => option.setAttribute('aria-selected', String(i === active)));
      if (active >= 0) { input.setAttribute('aria-activedescendant', `fr-${key}-option-${active}`); list.children[active]?.scrollIntoView({ block: 'nearest' }); }
      else input.removeAttribute('aria-activedescendant');
    }
    function show(search = '') {
      matches = items.filter(row => normalize(row.name).includes(normalize(search)));
      list.innerHTML = matches.length ? matches.map((row, index) => `<div role="option" id="fr-${key}-option-${index}" data-index="${index}" aria-selected="false">${esc(row.name)}</div>`).join('') : '<p>No matches. Try another name.</p>';
      list.hidden = false; input.setAttribute('aria-expanded', 'true'); arrow.setAttribute('aria-expanded', 'true');
      highlight(matches.findIndex(row => row.id === selected));
    }
    function choose(index) {
      if (!matches[index]) return;
      selected = matches[index].id; close(); input.focus(); load();
    }
    input.addEventListener('focus', () => { input.select(); });
    input.addEventListener('click', () => show());
    input.addEventListener('input', () => { show(input.value); highlight(matches.length ? 0 : -1); });
    input.addEventListener('keydown', event => {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault(); const open = !list.hidden; if (!open) show();
        highlight(Math.max(0, Math.min(matches.length - 1, active + (event.key === 'ArrowDown' ? 1 : -1))));
      } else if (event.key === 'Enter' && !list.hidden) { event.preventDefault(); choose(active >= 0 ? active : 0); }
      else if (event.key === 'Escape') { event.preventDefault(); close(); }
      else if (event.key === 'Tab') close();
    });
    arrow.addEventListener('click', () => { const open = !list.hidden; input.focus(); if (open) close(); else show(); });
    list.addEventListener('mousedown', event => event.preventDefault());
    list.addEventListener('click', event => { const option = event.target.closest('[data-index]'); if (option) choose(Number(option.dataset.index)); });
    root.addEventListener('focusout', event => { if (!root.contains(event.relatedTarget)) close(); });
    document.addEventListener('pointerdown', event => { if (!root.contains(event.target)) close(); });
    return { get value() { return selected; }, get label() { return label(); }, set(value) { selected = items.some(row => row.id === value) ? value : ''; close(); } };
  }

  function controls() {
    const category = node('category').value, titles = category === 'championships';
    const sprintRelevant = ['wins', 'podiums', 'points', 'starts', 'gridGain'].includes(category);
    if (titles) pickers.circuit?.set('');
    if (type === 'constructors') pickers.constructor?.set('');
    if (!sprintRelevant) node('sprints').checked = false;
    node('circuit-picker').hidden = titles;
    node('constructor-picker').hidden = type === 'constructors';
    node('sprints-label').hidden = junior || !sprintRelevant;
    if (junior) {
      node('format-label').hidden = titles || category === 'poles';
      if (titles) node('format').value = 'all';
      if (category === 'poles') node('format').value = 'F';
    }
    node('minimum-label').hidden = category !== 'gridGain';
    if (category === 'gridGain') { node('more-filters').hidden = false; node('more').setAttribute('aria-expanded', 'true'); }
    node('from-label').hidden = node('to-label').hidden = node('era').value !== 'custom';
    document.querySelectorAll('[data-fr-type]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.frType === type)));
    node('filter-note').hidden = !titles && category !== 'points' && category !== 'gridGain' && !(junior && category === 'poles');
    node('filter-note').textContent = titles ? 'Championships use season titles. Circuit and sprint filters do not apply.'
      : category === 'points' ? 'Points use each era’s scoring system; totals are not normalised across eras.'
        : 'Averages use classified results with known grids. The measured sample excludes non-classifications and missing grids.';
    if (junior && titles) node('filter-note').textContent = 'Championships use confirmed season titles. Circuit and race-format filters do not apply.';
    if (junior && category === 'poles') node('filter-note').textContent = 'Recorded pole awards in qualifying-based races. Reverse-grid P1 starts are excluded.';
    if (junior && category === 'gridGain') node('filter-note').textContent = 'Averages use known or derived grids. Derived grids follow the race format and may not reflect penalties; missing grids and non-classifications are excluded.';
  }
  function config() {
    return { series, type, category: node('category').value, fromYear: node('from').value || null, toYear: node('to').value || null,
      circuitId: pickers.circuit?.value || '', constructorId: pickers.constructor?.value || '', nationality: node('nationality').value,
      includeSprints: junior ? node('format').value !== 'F' : node('sprints').checked,
      ...(junior ? { raceFormat: node('format').value } : {}), minStarts: node('category').value === 'gridGain' ? Number(node('minimum').value) : 1 };
  }
  function query(config, withPage = false) {
    const params = new URLSearchParams();
    Object.entries(config).forEach(([key, value]) => { if (key !== 'series' && !(junior && key === 'includeSprints') && value !== '' && value !== false && value != null && !(key === 'minStarts' && config.category !== 'gridGain')) params.set(key, String(value)); });
    if (withPage && page > 1) params.set('page', String(page));
    return params;
  }
  function writeURL() { if (data) history.replaceState(null, '', `${location.pathname}?${query(data.configuration, true)}`); }
  function applyEra() {
    const era = node('era').value;
    if (era !== 'custom') {
      node('from').value = { all: '', current: currentYear, recent: Math.max(firstSeason, currentYear - (junior ? 2 : 9)), '2000': 2000 }[era];
      node('to').value = ['current', 'recent'].includes(era) ? currentYear : '';
    }
  }
  function restore() {
    const params = new URLSearchParams(location.search);
    type = params.get('type') === 'constructors' ? 'constructors' : 'drivers';
    node('category').value = Object.hasOwn(labels, params.get('category')) ? params.get('category') : 'wins';
    for (const [key, param] of [['from', 'fromYear'], ['to', 'toYear']]) {
      const value = params.get(param); node(key).value = /^\d{4}$/.test(value || '') && Number(value) >= firstSeason && Number(value) <= 2200 ? value : '';
    }
    node('era').value = node('from').value || node('to').value ? 'custom' : 'all';
    pickers.circuit.set(params.get('circuitId') || ''); pickers.constructor.set(params.get('constructorId') || '');
    node('nationality').value = params.get('nationality') || '';
    node('sprints').checked = params.get('includeSprints') === 'true';
    if (junior) node('format').value = ['all', 'F', 'S'].includes(params.get('raceFormat')) ? params.get('raceFormat') : params.has('includeSprints') && !node('sprints').checked ? 'F' : 'all';
    const minimum = Number(params.get('minStarts'));
    if (Number.isInteger(minimum) && minimum >= 1 && minimum <= 1000 && ![...node('minimum').options].some(option => Number(option.value) === minimum)) node('minimum').add(new Option(`${minimum} results`, String(minimum)));
    node('minimum').value = minimum >= 1 && minimum <= 1000 ? String(minimum) : '10';
    page = Math.max(1, Math.floor(Number(params.get('page')) || 1));
    if (node('nationality').value || node('sprints').checked || (junior && node('format').value !== 'all')) { node('more-filters').hidden = false; node('more').setAttribute('aria-expanded', 'true'); }
    controls();
  }
  function filterChips(configuration) {
    const chips = [], c = configuration;
    if (c.fromYear || c.toYear) chips.push(['years', `${c.fromYear || firstSeason}–${c.toYear || 'present'}`]);
    if (c.circuitId) chips.push(['circuit', pickers.circuit.label]);
    if (c.constructorId) chips.push(['constructor', pickers.constructor.label]);
    if (c.nationality) chips.push(['nationality', displayCountryName(c.nationality)]);
    if (!junior && c.includeSprints) chips.push(['sprints', 'Sprints included']);
    if (junior && c.raceFormat !== 'all' && c.category !== 'poles') chips.push(['format', formatLabel(c.raceFormat)]);
    if (c.category === 'gridGain' && c.minStarts > 1) chips.push(['minimum', `At least ${c.minStarts} measured results`]);
    node('chips').innerHTML = chips.map(([key, label]) => `<button type="button" data-remove="${key}" aria-label="Remove ${esc(label)} filter">${esc(label)} <span aria-hidden="true">×</span></button>`).join('');
    return chips.map(([, label]) => label).join(' · ') || 'All-time';
  }
  function method() {
    const c = data.configuration;
    if (junior) {
      const notes = [c.category === 'championships' ? `Only seasons marked as championship won in the archive count. With a ${teamLabel.toLowerCase()} filter, a driver title counts when that driver scored race points for the selected ${teamLabel.toLowerCase()} in the winning season. A title season with multiple teams can count for each.` : `${formatLabel(c.raceFormat)}. Each completed race session counts separately; cancelled sessions and sessions without results are excluded.`,
        'Starts exclude DNS, DNQ, DNPQ and withdrawn entries. Retirements and post-start disqualifications count as starts. Team starts count sessions with at least one starter; podiums count finishing places.',
        'Pole awards and fastest laps use recorded archive flags. Reverse-grid P1 starts do not count as poles. Points sum recorded race points, including any bonuses recorded there; totals are not normalised across scoring changes.',
        'Equal displayed values share a rank; the next rank skips the tied places. Names within a tie are alphabetical. Period shows the years of matching entries. Team identities follow the archive; renamed teams are not merged.'];
      if (c.category === 'gridGain') {
        const coverage = data.coverage || {};
        notes.unshift(`Average grid position minus classified finish, using at least ${c.minStarts} measured results per entry. Grids use the same rules as circuit analysis: official grid classifications where available, otherwise qualifying or the preceding race with the applicable reverse-grid rule. Derived grids may not reflect penalties. Split or missing qualifying without a usable combined grid is excluded. Zero and negative averages remain eligible. Team averages use individual driver results.`);
        notes.unshift(`${fmtNumber(coverage.measured)} measured results across the selected entries, including ${fmtNumber(coverage.derived)} using derived grids, from ${fmtNumber(coverage.starters)} starts. Each ranked entry shows its own eligible sample.`);
      }
      node('method-text').innerHTML = notes.map(text => `<p>${esc(text)}</p>`).join('');
      return;
    }
    const notes = [c.category === 'championships' ? 'Only seasons marked as championship won in the archive count. With a constructor filter, a driver title counts when the champion scored Grand Prix points with that constructor in the winning season. A season with points scored for multiple constructors can count for each.' : `${c.includeSprints ? 'Grands Prix and sprint races count separately.' : 'Grands Prix only; sprint races are excluded.'}`,
      'Starts exclude DNS, DNQ, DNPQ and withdrawn or excluded entries. Retirements and post-start disqualifications count as starts. Constructor starts count races with at least one starter; car starts count individual result entries.',
      'Shared drives can credit more than one driver. Constructor wins and podium places count each race finishing position once. Constructor identities follow the archive; renamed teams are not merged. Period shows the years of matching entries.',
      'Equal displayed values share a rank; the next rank skips the tied places. Names within a tie are alphabetical.'];
    if (c.category === 'gridGain') notes.unshift(`Average grid position minus classified finish, across at least ${c.minStarts} results with a recorded grid and classified position. Missing grids, pit-lane starts without a numbered grid, non-classifications and disqualifications are excluded. Measured sample counts are shown; constructor averages use individual driver results. Zero and negative averages remain eligible.`);
    if (c.category === 'points') notes.unshift('Points sum recorded race points under the scoring system of each era. They are not normalised across eras and can differ from championship totals under historical dropped-score rules.');
    node('method-text').innerHTML = notes.map(text => `<p>${esc(text)}</p>`).join('');
  }
  function render() {
    const entries = data.entries, c = data.configuration, scope = filterChips(c), pages = Math.max(1, Math.ceil(entries.length / 25));
    page = Math.max(1, Math.min(page, pages));
    node('title').textContent = `${data.label}${junior ? (c.category === 'championships' ? '' : ` · ${formatLabel(c.raceFormat)}`) : c.includeSprints ? ' · GP + sprint' : ''}`;
    node('count').textContent = `${fmtNumber(data.total)} eligible ${entityLabel(data.type)} · ${scope}`;
    if (entries.length) {
      const top = entries[0], holders = entries.filter(entry => entry.rank === 1), next = entries.find(entry => entry.rank > 1);
      const gap = next ? Math.round((top.value - next.value) * 100) / 100 : 0;
      const gapLabel = gap === 1 ? { wins: 'win', championships: 'championship', podiums: 'podium', poles: 'pole position', fastestLaps: 'fastest lap', points: 'point', starts: 'start', gridGain: 'position' }[c.category]
        : c.category === 'gridGain' ? 'positions' : data.label.toLowerCase();
      const holderLinks = holders.map(entry => `<a href="${link(entry)}">${esc(entry.name)}</a>`);
      const holderNames = holders.length > 3 ? `${holders.length} joint record holders` : holderLinks.join(' · ');
      node('summary').innerHTML = `<div><span class="fr-kicker">${holders.length > 1 ? 'Joint record holders' : 'Record holder'}</span><h3>${holderNames}</h3>${holders.length > 3 ? `<details class="fr-holders"><summary>Show all record holders</summary><div>${holderLinks.join(' · ')}</div></details>` : ''}<p>${esc(scope)}</p></div><div><span class="fr-total">${valueText(top.value, c.category)}</span><p>${esc(data.label)}</p></div><div class="fr-gap">${next ? `<strong>${valueText(gap, c.category)} ${esc(gapLabel)} ahead</strong><p>Next: <a href="${link(next)}">${esc(next.name)}</a>${entries.filter(entry => entry.value === next.value).length > 1 ? ' and others tied' : ''} · ${valueText(next.value, c.category)}</p>` : '<strong>No other eligible contenders</strong><p>Try a wider season range.</p>'}</div>`;
    } else node('summary').innerHTML = '';
    const columns = c.category === 'gridGain' ? [['sample', 'Measured results'], ['starts', c.type === 'constructors' ? 'Race starts' : 'Starts']]
      : c.category === 'starts' ? [['wins', 'Wins'], ['podiums', 'Podiums']]
      : [['starts', c.type === 'constructors' ? 'Race starts' : 'Starts'], [c.category === 'wins' ? 'podiums' : 'wins', c.category === 'wins' ? 'Podiums' : 'Wins']];
    const maximum = Math.max(...entries.map(entry => Math.abs(entry.value)), 1);
    node('ranking').innerHTML = entries.length ? `<div class="fr-table-scroll" role="region" tabindex="0" aria-label="Record rankings"><table class="fr-table"><caption class="sr-only">${esc(data.label)} ranking · ${esc(scope)}</caption><thead><tr><th scope="col">Rank</th><th scope="col">${c.type === 'drivers' ? 'Driver' : teamLabel}</th><th scope="col" class="fr-secondary">Period</th>${columns.map(([, label]) => `<th scope="col" class="fr-secondary">${label}</th>`).join('')}<th scope="col" class="fr-metric" aria-sort="descending">${esc(data.label)}</th></tr></thead><tbody>${entries.slice((page - 1) * 25, page * 25).map(entry => `<tr><td class="fr-rank">${entry.rank}</td><td class="fr-person"><a href="${link(entry)}">${esc(entry.name)}</a><small>${esc(displayCountryName(entry.nationalityCountryId))}${c.category === 'gridGain' ? ` · ${entry.sample} measured` : ''}</small></td><td class="fr-secondary">${entry.firstYear === entry.lastYear ? entry.firstYear : `${entry.firstYear}–${entry.lastYear}`}</td>${columns.map(([key]) => `<td class="fr-secondary">${fmtNumber(entry[key])}</td>`).join('')}<td class="fr-metric"><strong>${valueText(entry.value, c.category)}</strong><span class="fr-bar${entry.value < 0 ? ' fr-negative' : ''}" aria-hidden="true"><i style="width:${Math.abs(entry.value) / maximum * 100}%"></i></span></td></tr>`).join('')}</tbody></table></div>` : '<div class="fr-empty">No records match these filters. Try a wider season range or a lower minimum.<br><button type="button" data-reset>Reset filters</button></div>';
    node('pagination').innerHTML = pages > 1 ? `<button type="button" data-page="${page - 1}" ${page === 1 ? 'disabled' : ''}>← Previous</button><span>${(page - 1) * 25 + 1}–${Math.min(page * 25, entries.length)} of ${entries.length} · Page ${page} / ${pages}</span><button type="button" data-page="${page + 1}" ${page === pages ? 'disabled' : ''}>Next →</button>` : '';
    method(); writeURL();
  }
  async function load(keepPage = false) {
    const id = ++request; controller?.abort(); controller = new AbortController();
    controls();
    node('save').disabled = node('share').disabled = true; node('save-panel').hidden = true; saveConfiguration = null;
    node('to').setCustomValidity(node('from').value && node('to').value && Number(node('from').value) > Number(node('to').value) ? 'The end season must be the same as or after the start season.' : '');
    if (!node('filters').reportValidity()) { node('message').textContent = 'Correct the season range to update these records.'; node('results').hidden = true; node('results').setAttribute('aria-busy', 'false'); return; }
    const configuration = config(); if (!keepPage) page = 1;
    node('results').hidden = false; node('results').setAttribute('aria-busy', 'true');
    node('message').textContent = 'Updating records…'; node('summary').innerHTML = ''; node('ranking').innerHTML = '<p class="fr-empty">Calculating records…</p>'; node('pagination').innerHTML = ''; node('count').textContent = ''; node('title').textContent = labels[configuration.category];
    filterChips(configuration); node('method-text').innerHTML = '';
    try {
      const result = await getJSON(`/api/records/explore?${query(configuration)}`, { signal: controller.signal });
      if (id !== request) return;
      data = result; render(); node('message').textContent = ''; node('save').disabled = node('share').disabled = false;
    } catch (error) {
      if (id !== request || error.name === 'AbortError') return;
      data = null; node('message').textContent = error.message;
      node('ranking').innerHTML = '<div class="fr-empty">The records could not be loaded. <button type="button" data-retry>Try again</button></div>';
    } finally { if (id === request) node('results').setAttribute('aria-busy', 'false'); }
  }
  function reset() {
    node('era').value = 'all'; applyEra(); pickers.circuit.set(''); pickers.constructor.set(''); node('nationality').value = ''; node('sprints').checked = false; node('minimum').value = '10'; if (junior) node('format').value = 'all'; load();
  }
  async function initialise() {
    const results = await Promise.allSettled([getJSON('/api/circuits'), getJSON('/api/constructors'), getJSON('/api/drivers?limit=1000')]);
    const [circuits, constructors, drivers] = results.map(result => result.status === 'fulfilled' ? result.value : []);
    pickers.circuit = picker('circuit', circuits.filter(row => Number(row.totalRacesHeld) > 0));
    pickers.constructor = picker('constructor', constructors);
    for (const [index, key] of ['circuit', 'constructor'].entries()) if (results[index].status === 'rejected') { node(key).disabled = true; node(`${key}-picker`).querySelector('button').disabled = true; node(key).placeholder = 'Filter unavailable'; }
    const countries = [...new Set([...drivers.map(row => row.nationalityCountryId || row.countryCode), ...constructors.map(row => row.countryId || row.countryCode)].filter(Boolean))];
    node('nationality').insertAdjacentHTML('beforeend', countries.sort((a, b) => displayCountryName(a).localeCompare(displayCountryName(b))).map(country => `<option value="${esc(country)}">${esc(displayCountryName(country))}</option>`).join(''));
    restore(); await load(true);
  }
  document.querySelectorAll('[data-fr-type]').forEach(button => button.addEventListener('click', () => { type = button.dataset.frType; load(); }));
  node('filters').addEventListener('submit', event => { event.preventDefault(); load(); });
  for (const key of ['category', 'from', 'to', 'nationality', 'sprints', 'minimum']) node(key).addEventListener('change', () => load());
  node('format')?.addEventListener('change', () => load());
  node('era').addEventListener('change', () => { applyEra(); load(); });
  node('more').addEventListener('click', () => { const expanded = node('more-filters').hidden; node('more-filters').hidden = !expanded; node('more').setAttribute('aria-expanded', String(expanded)); });
  node('reset').addEventListener('click', reset);
  node('chips').addEventListener('click', event => {
    const key = event.target.closest('[data-remove]')?.dataset.remove; if (!key) return;
    if (key === 'years') { node('era').value = 'all'; applyEra(); }
    else if (pickers[key]) pickers[key].set('');
    else if (key === 'sprints') node('sprints').checked = false;
    else node(key).value = key === 'minimum' ? '1' : key === 'format' ? 'all' : '';
    load();
  });
  node('ranking').addEventListener('click', event => { if (event.target.closest('[data-reset]')) reset(); if (event.target.closest('[data-retry]')) load(); });
  node('pagination').addEventListener('click', event => { const button = event.target.closest('[data-page]'); if (button && !button.disabled) { page = Number(button.dataset.page); render(); node('title').scrollIntoView({ block: 'start', behavior: 'smooth' }); } });
  window.addEventListener('popstate', () => { restore(); load(true); });
  node('share').addEventListener('click', async () => {
    try { writeURL(); await navigator.clipboard.writeText(location.href); node('message').textContent = 'Link copied with these filters and this page.'; }
    catch { node('message').textContent = 'Copy the address from your browser to share these records.'; }
  });
  node('save').addEventListener('click', async () => {
    const snapshot = data, id = request; if (!snapshot) return;
    try {
      const account = await getJSON('/api/account'); if (request !== id) return;
      if (!account.user) { node('message').innerHTML = `<a href="/account?series=${series}" target="_blank" rel="noopener">Sign in in a new tab</a>, then select Save to record book again. Your filters stay here.`; return; }
      saveConfiguration = { ...snapshot.configuration }; node('save-panel').hidden = false;
      node('save-name').value = `${snapshot.label} · ${filterChips(snapshot.configuration)}`.slice(0, 100); node('save-message').textContent = ''; node('save-name').focus();
    } catch (error) { if (request === id) node('message').textContent = error.message; }
  });
  node('cancel-save').addEventListener('click', () => { node('save-panel').hidden = true; saveConfiguration = null; });
  node('save-panel').addEventListener('submit', async event => {
    event.preventDefault(); if (!saveConfiguration) return;
    const button = event.target.querySelector('[type=submit]'); button.disabled = true; node('save-message').textContent = 'Saving…';
    try {
      const result = await getJSON('/api/records/saved', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: node('save-name').value, visibility: node('visibility').value, configuration: saveConfiguration }) });
      node('save-message').textContent = result.visibility === 'public' ? 'Saved and shared with the community.' : 'Saved to your record book.';
    } catch (error) { node('save-message').textContent = error.message; }
    finally { button.disabled = false; }
  });
  initialise().catch(error => { node('message').textContent = error.message; });
})();
