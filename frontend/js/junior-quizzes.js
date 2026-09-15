const QUIZ_SERIES = location.pathname.startsWith('/formula-e/') ? 'fe' : location.pathname.startsWith('/academy/') ? 'academy' : location.pathname.startsWith('/f3/') ? 'f3' : 'f2';
const seasonLabel = year => QUIZ_SERIES === 'fe' ? `${Number(year) - 1}–${String(year).slice(-2)}` : String(year);

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
  try {
    const { quizzes } = await getJSON(`/api/games/quiz-summary?series=${QUIZ_SERIES}`);
    const cards = [
      ['champions', quizzes.champions, `racelytic-quiz-${QUIZ_SERIES}-champions`],
      ['race-winners', quizzes.raceWinners, `racelytic-quiz-${QUIZ_SERIES}-race-winners`],
      ['constructor-champions', quizzes.constructorChampions, `racelytic-quiz-${QUIZ_SERIES}-constructor-champions`]
    ];

    cards.forEach(([type, summary, key]) => {
      const card = document.querySelector(`[data-quiz-card="${type}"]`);
      if (!card || !summary) return;
      card.querySelector('[data-quiz-coverage]').textContent = type === 'race-winners'
        ? `Since ${seasonLabel(summary.firstYear)}`
        : `${seasonLabel(summary.firstYear)}–${seasonLabel(summary.lastYear)}`;
      card.querySelector('[data-quiz-count]').textContent = `${summary.total} ${type === 'race-winners' ? 'winners' : 'seasons'}`;
      updateCard(type, summary.total, new Set(summary.answerIds), key);
    });

    const season = quizzes.seasonRaceWinners;
    const seasonCard = document.querySelector('[data-quiz-card="season-race-winners"]');
    if (seasonCard && season) {
      seasonCard.querySelector('[data-quiz-coverage]').textContent = `${seasonLabel(season.year)} season`;
      seasonCard.querySelector('[data-quiz-count]').textContent = `${season.total} races`;
      updateCard('season-race-winners', season.total, new Set(season.answerIds), `racelytic-quiz-${QUIZ_SERIES}-season-race-winners-${season.year}`);
    }
  } catch (error) {
    console.error('Quiz summaries could not be loaded.', error);
  }
})();
