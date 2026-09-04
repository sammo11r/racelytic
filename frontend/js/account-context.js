(() => {
  const requested = new URLSearchParams(location.search).get('series');
  let series = ['f1', 'f2', 'f3', 'academy'].includes(requested) ? requested : '';
  if (!series) {
    try { series = localStorage.getItem('racelytic-series') || ''; } catch {}
  }
  if (series === 'f2') document.documentElement.classList.add('f2-account');
  if (series === 'f3') document.documentElement.classList.add('f3-account');
  if (series === 'academy') document.documentElement.classList.add('academy-account');
  document.addEventListener('DOMContentLoaded', () => {
    if (series === 'f2') document.body.classList.add('f2-mode');
    if (series === 'f3') document.body.classList.add('f3-mode');
    if (series === 'academy') document.body.classList.add('academy-mode');
  }, { once: true });
})();
