(function initialiseRatingsNavigation() {
  const names = new Set(['f1', 'f2', 'f3', 'academy', 'fe', 'wec']);
  const update = () => {
    const query = new URLSearchParams(location.search);
    const series = names.has(query.get('series')) ? query.get('series') : 'f1';
    const model = series === 'f1' && query.get('model') === 'team-adjusted' ? 'team-adjusted' : '';
    const classScope = series === 'wec' && ['top', 'lmp2', 'gt-pro', 'gt'].includes(query.get('class')) ? query.get('class') : series === 'wec' ? 'top' : '';
    const route = location.pathname === '/ratings' ? 'overview' : location.pathname.split('/').filter(Boolean).at(-1);
    document.querySelectorAll('[data-rating-route]').forEach(link => {
      const destination = new URL(link.pathname, location.origin);
      destination.searchParams.set('series', series);
      if (model) destination.searchParams.set('model', model);
      if (classScope) destination.searchParams.set('class', classScope);
      link.href = `${destination.pathname}?${destination.searchParams}`;
      if (link.dataset.ratingRoute === route) link.setAttribute('aria-current', 'page');
    });
  };
  update();
  window.addEventListener('ratings:context-change', update);
  window.addEventListener('popstate', update);
})();
