(function initialiseRatingsOverview() {
  const names = { f1: 'Formula 1', f2: 'Formula 2', f3: 'Formula 3', academy: 'F1 Academy' };
  const query = new URLSearchParams(location.search);
  const series = Object.hasOwn(names, query.get('series')) ? query.get('series') : 'f1';
  const model = series === 'f1' && query.get('model') === 'team-adjusted' ? 'team-adjusted' : '';
  const elements = {
    freshness: document.getElementById('ratings-overview-freshness'),
    leaders: document.getElementById('ratings-overview-leaders'),
    movers: document.getElementById('ratings-overview-movers'),
    feature: document.getElementById('ratings-overview-feature'),
    compare: document.getElementById('ratings-overview-compare-link'),
    search: document.getElementById('ratings-overview-search'),
    results: document.getElementById('ratings-overview-search-results')
  };
  let drivers = [];

  const destination = (path, extra = {}) => {
    const target = new URL(path, location.origin);
    target.searchParams.set('series', series);
    if (model) target.searchParams.set('model', model);
    Object.entries(extra).forEach(([key, value]) => target.searchParams.set(key, value));
    return `${target.pathname}?${target.searchParams}`;
  };
  const dateLabel = value => value ? new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value)) : 'an unavailable date';
  const driverRow = (driver, detail) => {
    const item = document.createElement('li');
    const link = document.createElement('a');
    link.href = destination('/ratings/driver', { driver: driver.driverId });
    const name = document.createElement('strong');
    name.textContent = driver.driverName;
    const context = document.createElement('small');
    context.textContent = detail;
    const score = document.createElement('b');
    score.textContent = Math.round(driver.rating);
    link.append(name, context, score);
    item.append(link);
    return item;
  };
  const renderSearch = () => {
    const term = elements.search.value.trim().toLocaleLowerCase();
    elements.results.replaceChildren();
    if (!term) return;
    const matches = drivers.filter(driver => `${driver.driverName} ${driver.constructorName || ''}`.toLocaleLowerCase().includes(term)).slice(0, 8);
    const list = document.createElement('ul');
    matches.forEach(driver => list.append(driverRow(driver, `${driver.constructorName || 'Team unavailable'} · rank #${driver.rank}`)));
    if (!matches.length) {
      const empty = document.createElement('p');
      empty.textContent = 'No rated drivers match that search.';
      elements.results.append(empty);
    } else elements.results.append(list);
  };

  elements.search.addEventListener('input', renderSearch);
  (async () => {
    const api = new URL('/api/ratings', location.origin);
    api.searchParams.set('series', series);
    api.searchParams.set('minEvents', '3');
    api.searchParams.set('limit', '1000');
    if (model) api.searchParams.set('model', model);
    try {
      const response = await fetch(api, { cache: 'no-store' });
      if (!response.ok) throw new Error('Ratings unavailable');
      const data = await response.json();
      drivers = data.leaderboard || [];
      elements.freshness.textContent = `${data.modelLabel || data.modelVersion} · ratings through ${dateLabel(data.freshness?.latestRatedEvent)}`;
      elements.leaders.replaceChildren(...drivers.slice(0, 5).map(driver => driverRow(driver, `#${driver.rank} · ${driver.constructorName || 'Team unavailable'}`)));
      const movers = [...drivers].sort((a, b) => Math.abs(b.change) - Math.abs(a.change)).slice(0, 5);
      elements.movers.replaceChildren(...movers.map(driver => driverRow(driver, `${driver.change > 0 ? '+' : ''}${Number(driver.change).toFixed(1)} at ${driver.lastEvent?.name || 'latest event'}`)));
      const featured = drivers.slice(0, 2);
      if (featured.length === 2) {
        const heading = document.createElement('h3');
        heading.textContent = `${featured[0].driverName} vs ${featured[1].driverName}`;
        const copy = document.createElement('p');
        copy.textContent = `${Math.abs(Math.round(featured[0].rating - featured[1].rating))} rating points separate the current top two.`;
        const scores = document.createElement('div');
        featured.forEach(driver => {
          const item = document.createElement('span');
          item.textContent = `${driver.driverName} ${Math.round(driver.rating)}`;
          scores.append(item);
        });
        elements.feature.replaceChildren(heading, copy, scores);
        elements.compare.href = destination('/ratings/compare', { drivers: featured.map(driver => driver.driverId).join(',') });
      }
    } catch {
      elements.freshness.textContent = 'The latest ratings snapshot could not be loaded.';
      elements.leaders.innerHTML = '<li>Ratings unavailable.</li>';
      elements.movers.innerHTML = '<li>Changes unavailable.</li>';
    }
  })();
})();
