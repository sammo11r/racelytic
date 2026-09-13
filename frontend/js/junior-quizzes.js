const QUIZ_SERIES = location.pathname.startsWith('/academy/') ? 'academy' : location.pathname.startsWith('/f3/') ? 'f3' : 'f2';

function storedProgress(key) {
  try { const value = JSON.parse(localStorage.getItem(key) || 'null'); return value && Array.isArray(value.answers) ? value : null; }
  catch (_) { return null; }
}

function updateCard(quiz, total, validIds, key) {
  const card = document.querySelector(`[data-quiz-card="${quiz}"]`);
  if (!card) return;
  const progress = storedProgress(key);
  const found = progress?.answers.filter(answer => Array.isArray(answer) && validIds.has(String(answer[0]))).length || 0;
  const gaveUp = Boolean(progress?.gaveUp), status = card.querySelector('[data-quiz-status]'), action = card.querySelector('[data-quiz-action]');
  status.classList.toggle('is-progress', found > 0 && found < total);
  status.classList.toggle('is-complete', total > 0 && found === total && !gaveUp);
  status.textContent = gaveUp ? 'Answers revealed' : !found ? 'Not started' : found === total ? 'Completed' : `${found} / ${total} found`;
  action.innerHTML = `${found && found < total ? 'Continue quiz' : found === total ? 'Review quiz' : 'Start quiz'} <span aria-hidden="true">→</span>`;
}

(async () => {
  const [champions, winners, constructors, season] = await Promise.allSettled([
    getJSON(`/api/games/world-champions?series=${QUIZ_SERIES}`), getJSON(`/api/games/race-winners?series=${QUIZ_SERIES}`),
    getJSON(`/api/games/constructor-champions?series=${QUIZ_SERIES}`), getJSON(`/api/games/season-race-winners?series=${QUIZ_SERIES}`)
  ]);
  if (champions.status === 'fulfilled') { const card = document.querySelector('[data-quiz-card="champions"]'), years = champions.value.map(row => Number(row.year)); if (card) { card.querySelector('[data-quiz-coverage]').textContent = `${Math.min(...years)}–${Math.max(...years)}`; card.querySelector('[data-quiz-count]').textContent = `${years.length} seasons`; } }
  if (winners.status === 'fulfilled') { const card = document.querySelector('[data-quiz-card="race-winners"]'), years = winners.value.map(row => Number(row.firstWinYear)); if (card) { card.querySelector('[data-quiz-coverage]').textContent = `Since ${Math.min(...years)}`; card.querySelector('[data-quiz-count]').textContent = `${winners.value.length} winners`; } }
  if (constructors.status === 'fulfilled') { const rows = constructors.value, years = rows.map(row => Number(row.year)), card = document.querySelector('[data-quiz-card="constructor-champions"]'); if (card) { card.querySelector('[data-quiz-coverage]').textContent = `${Math.min(...years)}–${Math.max(...years)}`; card.querySelector('[data-quiz-count]').textContent = `${rows.length} seasons`; updateCard('constructor-champions', rows.length, new Set(years.map(String)), `racelytic-quiz-${QUIZ_SERIES}-constructor-champions`); } }
  if (season.status === 'fulfilled') { const { year, races } = season.value, card = document.querySelector('[data-quiz-card="season-race-winners"]'); if (card) { card.querySelector('[data-quiz-coverage]').textContent = `${year} season`; card.querySelector('[data-quiz-count]').textContent = `${races.length} races`; updateCard('season-race-winners', races.length, new Set(races.map(row => String(row.raceId))), `racelytic-quiz-${QUIZ_SERIES}-season-race-winners-${year}`); } }
})();
