let championshipRows = [];
const revealedConstructors = new Map();
const guessedConstructors = new Set();
let activeDecade = 'all';
let quizGaveUp = false;
let newYears = new Set();
const QUIZ_SERIES = location.pathname.startsWith('/academy/') ? 'academy' : location.pathname.startsWith('/f3/') ? 'f3' : location.pathname.startsWith('/f2/') ? 'f2' : 'f1';
const QUIZ_SERIES_QUERY = QUIZ_SERIES === 'f1' ? '' : `?series=${QUIZ_SERIES}`;
const QUIZ_ENTITY_LABEL = document.body.dataset.quizEntityLabel || 'Constructor';
const QUIZ_PROGRESS_KEY = QUIZ_SERIES === 'f1' ? 'racelytic-quiz-constructor-champions' : `racelytic-quiz-${QUIZ_SERIES}-constructor-champions`;

function saveProgress() {
  try {
    localStorage.setItem(QUIZ_PROGRESS_KEY, JSON.stringify({ version: 1, answers: [...revealedConstructors], names: [...guessedConstructors], gaveUp: quizGaveUp }));
    document.getElementById('quiz-save-status').textContent = 'Progress saved';
  } catch (_) { document.getElementById('quiz-save-status').textContent = 'Progress kept for this visit'; }
}

function restoreProgress() {
  try {
    const saved = JSON.parse(localStorage.getItem(QUIZ_PROGRESS_KEY) || 'null');
    const years = new Set(championshipRows.map(row => String(row.year)));
    saved?.answers?.forEach(([year, name]) => { if (years.has(String(year)) && typeof name === 'string') revealedConstructors.set(Number(year), name); });
    saved?.names?.forEach(name => guessedConstructors.add(name));
    quizGaveUp = Boolean(saved?.gaveUp);
  } catch (_) {}
}

function visibleRows() {
  const rows = [...championshipRows].sort((a, b) => a.year - b.year);
  return activeDecade === 'all' ? rows : rows.filter(row => Math.floor(row.year / 10) * 10 === Number(activeDecade));
}

function answerCell(name, length) {
  return `<span class="quiz-column-sizer" aria-hidden="true">${'M'.repeat(length)}</span>${name ? `<span class="quiz-answer-overlay">${esc(name)}</span>` : '<span class="quiz-empty-answer quiz-answer-overlay" aria-label="Not yet answered"></span>'}`;
}

function updateStatus() {
  const found = revealedConstructors.size;
  const total = championshipRows.length;
  document.getElementById('quiz-score').textContent = `${found} / ${total}`;
  document.getElementById('quiz-progress-fill').style.width = `${total ? found / total * 100 : 0}%`;
  document.getElementById('guessed-answer-count').textContent = guessedConstructors.size;
  document.getElementById('guessed-answers').innerHTML = [...guessedConstructors].map(name => `<span>${esc(name)}</span>`).join('');
  const completion = document.getElementById('quiz-completion');
  completion.hidden = found !== total;
  if (!completion.hidden) {
    document.getElementById('quiz-completion-label').textContent = quizGaveUp ? 'Answers revealed' : 'Quiz complete';
    document.getElementById('quiz-completion-title').textContent = quizGaveUp ? 'Championship table completed' : 'Perfect score';
    document.getElementById('quiz-completion-copy').textContent = quizGaveUp ? `You found ${guessedConstructors.size} ${QUIZ_ENTITY_LABEL.toLowerCase()} champions before revealing the rest.` : `You completed all ${total} championship seasons.`;
  }
}

function renderFilters() {
  const decades = [...new Set(championshipRows.map(row => Math.floor(row.year / 10) * 10))].sort();
  document.getElementById('quiz-decade-filters').innerHTML = ['all', ...decades].map(decade => `<button type="button" data-decade="${decade}" aria-pressed="${String(decade) === String(activeDecade)}">${decade === 'all' ? 'All seasons' : `${decade}s`}</button>`).join('');
}

function renderBoard() {
  const rows = visibleRows();
  const columnCount = activeDecade === 'all' ? (window.innerWidth >= 1180 ? 3 : window.innerWidth >= 800 ? 2 : 1) : 1;
  const size = Math.ceil(rows.length / columnCount);
  const columns = Array.from({ length: columnCount }, (_, index) => rows.slice(index * size, (index + 1) * size)).filter(column => column.length);
  document.getElementById('constructor-champions-quiz-board').innerHTML = columns.map(column => `<div class="quiz-column-table table-wrap"><table class="champions-quiz-table"><thead><tr><th>Season</th><th>${esc(QUIZ_ENTITY_LABEL)}</th></tr></thead><tbody>${column.map(row => {
    const name = revealedConstructors.get(row.year);
    return `<tr data-year="${row.year}" class="${name ? 'is-revealed' : ''}${newYears.has(row.year) ? ' is-new-answer' : ''}"><td><strong>${row.year}</strong></td><td class="quiz-driver-cell">${answerCell(name, row.constructorNameLength)}</td></tr>`;
  }).join('')}</tbody></table></div>`).join('');
  updateStatus();
}

function chooseDecade(decade) { activeDecade = String(decade); renderFilters(); renderBoard(); }
function scrollToYear(year) { requestAnimationFrame(() => document.querySelector(`[data-year="${year}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })); }

function resetQuiz() {
  revealedConstructors.clear(); guessedConstructors.clear(); newYears.clear(); quizGaveUp = false;
  try { localStorage.removeItem(QUIZ_PROGRESS_KEY); } catch (_) {}
  chooseDecade(window.innerWidth < 800 ? Math.max(...championshipRows.map(row => Math.floor(row.year / 10) * 10)) : 'all');
  document.getElementById('quiz-feedback').textContent = 'Progress reset.';
}

async function revealQuiz() {
  const response = await fetch(`/api/games/constructor-champions/reveal${QUIZ_SERIES_QUERY}`, { method: 'POST' });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Unable to reveal the answers.');
  result.answers.forEach(answer => { revealedConstructors.set(answer.year, answer.constructorName); guessedConstructors.add(answer.constructorName); });
  quizGaveUp = true; newYears.clear(); saveProgress(); chooseDecade('all');
  document.getElementById('quiz-feedback').textContent = `Every remaining ${QUIZ_ENTITY_LABEL.toLowerCase()} champion has been revealed.`;
  document.getElementById('quiz-completion').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

let pendingConfirmation = null;
function confirmAction(title, copy, label, action) {
  const dialog = document.getElementById('quiz-confirm-dialog');
  document.getElementById('quiz-confirm-title').textContent = title; document.getElementById('quiz-confirm-copy').textContent = copy; document.getElementById('quiz-confirm-submit').textContent = label;
  pendingConfirmation = action; dialog.returnValue = ''; dialog.showModal();
}

document.getElementById('constructor-guess-form').addEventListener('submit', async event => {
  event.preventDefault(); const input = event.currentTarget.elements.guess; const submit = event.currentTarget.querySelector('button[type="submit"]'); const feedback = document.getElementById('quiz-feedback'); const guess = input.value.trim(); if (!guess) return;
  input.disabled = submit.disabled = true;
  try {
    const response = await fetch(`/api/games/constructor-champions/guess${QUIZ_SERIES_QUERY}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ guess }) });
    const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Unable to check that guess.');
    if (!result.correct) { feedback.textContent = `${guess} is not a ${QUIZ_ENTITY_LABEL} Champion.`; feedback.className = 'is-incorrect'; }
    else {
      const fresh = result.matches.filter(match => !revealedConstructors.has(match.year));
      result.matches.forEach(match => { revealedConstructors.set(match.year, match.constructorName); guessedConstructors.add(match.constructorName); });
      newYears = new Set(fresh.map(match => match.year)); saveProgress();
      if (fresh.length && activeDecade !== 'all' && !fresh.some(match => Math.floor(match.year / 10) * 10 === Number(activeDecade))) activeDecade = String(Math.floor(fresh[0].year / 10) * 10);
      renderFilters(); renderBoard(); const names = [...new Set(result.matches.map(match => match.constructorName))].join(' and ');
      feedback.textContent = fresh.length ? `Correct: ${names} revealed ${fresh.length} ${fresh.length === 1 ? 'season' : 'seasons'}.` : `${names} was already found.`; feedback.className = fresh.length ? 'is-correct' : '';
      if (fresh.length) { scrollToYear(fresh[0].year); window.setTimeout(() => document.querySelectorAll('.is-new-answer').forEach(row => row.classList.remove('is-new-answer')), 1800); }
    }
    input.value = '';
  } catch (error) { feedback.textContent = error.message; feedback.className = 'is-incorrect'; }
  finally { input.disabled = submit.disabled = false; input.focus(); }
});

document.getElementById('quiz-decade-filters').addEventListener('click', event => { const button = event.target.closest('[data-decade]'); if (button) chooseDecade(button.dataset.decade); });
document.getElementById('quiz-reset').addEventListener('click', () => confirmAction('Reset this quiz?', `Every ${QUIZ_ENTITY_LABEL.toLowerCase()} you found and all saved progress will be cleared.`, 'Reset quiz', resetQuiz));
document.getElementById('quiz-reveal').addEventListener('click', () => confirmAction('Reveal every champion?', `All remaining ${QUIZ_ENTITY_LABEL.toLowerCase()} champions will be shown and this attempt will be marked as revealed.`, 'Reveal answers', () => revealQuiz().catch(error => { document.getElementById('quiz-feedback').textContent = error.message; })));
document.getElementById('quiz-play-again').addEventListener('click', resetQuiz);
document.getElementById('quiz-confirm-dialog').addEventListener('close', event => { const action = pendingConfirmation; pendingConfirmation = null; if (event.currentTarget.returnValue === 'confirm') action?.(); });
document.getElementById('quiz-confirm-dialog').addEventListener('click', event => { if (event.target === event.currentTarget) event.currentTarget.close('cancel'); });

(async () => {
  try { championshipRows = await getJSON(`/api/games/constructor-champions${QUIZ_SERIES_QUERY}`); restoreProgress(); if (window.innerWidth < 800) activeDecade = String(Math.max(...championshipRows.map(row => Math.floor(row.year / 10) * 10))); renderFilters(); renderBoard(); const form = document.getElementById('constructor-guess-form'); form.elements.guess.disabled = false; form.querySelector('button[type="submit"]').disabled = false; form.elements.guess.focus(); }
  catch (error) { setError('constructor-champions-quiz-board', error.message); document.getElementById('quiz-feedback').textContent = 'The quiz could not be loaded.'; }
})();

window.addEventListener('resize', () => renderBoard());
