(function initialiseRatingsNavigation() {
  const names = new Set(['f1', 'f2', 'f3', 'academy']);
  const query = new URLSearchParams(location.search);
  const series = names.has(query.get('series')) ? query.get('series') : 'f1';
  const model = series === 'f1' && query.get('model') === 'team-adjusted' ? 'team-adjusted' : '';
  const route = location.pathname === '/ratings' ? 'overview' : location.pathname.split('/').filter(Boolean).at(-1);
  document.querySelectorAll('[data-rating-route]').forEach(link => {
    const destination = new URL(link.getAttribute('href'), location.origin);
    destination.searchParams.set('series', series);
    if (model) destination.searchParams.set('model', model);
    link.href = `${destination.pathname}?${destination.searchParams}`;
    if (link.dataset.ratingRoute === route) link.setAttribute('aria-current', 'page');
  });
})();
