let availableYears = [];
let selectedYear = null;
let raceRows = [];
const revealedRaces = new Map();
let quizGaveUp = false;
let newRaceIds = new Set();
const QUIZ_SERIES = location.pathname.startsWith('/formula-e/') ? 'fe' : location.pathname.startsWith('/academy/') ? 'academy' : location.pathname.startsWith('/f3/') ? 'f3' : location.pathname.startsWith('/f2/') ? 'f2' : 'f1';
const QUIZ_ENTITY_LABEL = document.body.dataset.quizEntityLabel || 'Constructor';
const QUIZ_EVENT_LABEL = document.body.dataset.quizEventLabel || 'Grand Prix';
const seriesQuery = separator => QUIZ_SERIES === 'f1' ? '' : `${separator}series=${QUIZ_SERIES}`;
const progressKey = () => `racelytic-quiz-${QUIZ_SERIES === 'f1' ? '' : `${QUIZ_SERIES}-`}season-race-winners-${selectedYear}`;
const seasonLabel = year => QUIZ_SERIES === 'fe' ? `${Number(year) - 1}–${String(year).slice(-2)}` : String(year);

function saveProgress() {
  try { localStorage.setItem(progressKey(), JSON.stringify({ version: 1, answers: [...revealedRaces], gaveUp: quizGaveUp })); document.getElementById('quiz-save-status').textContent = 'Progress saved'; }
  catch (_) { document.getElementById('quiz-save-status').textContent = 'Progress kept for this visit'; }
}
function restoreProgress() {
  revealedRaces.clear(); quizGaveUp = false;
  try { const saved = JSON.parse(localStorage.getItem(progressKey()) || 'null'); const ids = new Set(raceRows.map(row => row.raceId)); saved?.answers?.forEach(([id, name]) => { if (ids.has(String(id)) && typeof name === 'string') revealedRaces.set(String(id), name); }); quizGaveUp = Boolean(saved?.gaveUp); } catch (_) {}
}
function answerCell(name, length) { return `<span class="quiz-column-sizer" aria-hidden="true">${'M'.repeat(length)}</span>${name ? `<span class="quiz-answer-overlay">${esc(name)}</span>` : '<span class="quiz-empty-answer quiz-answer-overlay" aria-label="Not yet answered"></span>'}`; }
function updateStatus() {
  const found = revealedRaces.size, total = raceRows.length, names = [...new Set(revealedRaces.values())];
  document.getElementById('quiz-score').textContent = `${found} / ${total}`; document.getElementById('quiz-progress-fill').style.width = `${total ? found / total * 100 : 0}%`;
  document.getElementById('guessed-answer-count').textContent = names.length; document.getElementById('guessed-answers').innerHTML = names.map(name => `<span>${esc(name)}</span>`).join('');
  const completion = document.getElementById('quiz-completion'); completion.hidden = found !== total;
  if (!completion.hidden) { document.getElementById('quiz-completion-label').textContent = quizGaveUp ? 'Answers revealed' : 'Quiz complete'; document.getElementById('quiz-completion-title').textContent = quizGaveUp ? `${seasonLabel(selectedYear)} calendar completed` : 'Perfect score'; document.getElementById('quiz-completion-copy').textContent = quizGaveUp ? `You found ${names.length} winning drivers before revealing the remaining races.` : `You completed all ${total} race winners from the ${seasonLabel(selectedYear)} season.`; }
}
function renderBoard() {
  document.getElementById('season-race-winners-quiz-board').innerHTML = `<div class="quiz-column-table table-wrap"><table class="champions-quiz-table season-winners-table"><thead><tr><th>Rd</th><th>${esc(QUIZ_EVENT_LABEL)}</th><th>Winner</th><th>${esc(QUIZ_ENTITY_LABEL)}</th></tr></thead><tbody>${raceRows.map(row => {
    const name = revealedRaces.get(row.raceId); return `<tr data-race-id="${esc(row.raceId)}" class="${name ? 'is-revealed' : ''}${newRaceIds.has(row.raceId) ? ' is-new-answer' : ''}"><td><strong>${row.round}</strong></td><td>${esc(row.raceName)}</td><td class="quiz-driver-cell">${answerCell(name, row.driverNameLength)}</td><td>${row.constructors.map(esc).join(' / ') || '—'}</td></tr>`;
  }).join('')}</tbody></table></div>`; updateStatus();
}
function renderSeasonPicker() { document.getElementById('quiz-season').innerHTML = availableYears.map(year => `<option value="${year}"${year === selectedYear ? ' selected' : ''}>${seasonLabel(year)}</option>`).join(''); }
async function loadSeason(year) {
  const query = year ? `?year=${encodeURIComponent(year)}${seriesQuery('&')}` : seriesQuery('?');
  const data = await getJSON(`/api/games/season-race-winners${query}`); availableYears = data.years; selectedYear = data.year; raceRows = data.races; newRaceIds.clear(); restoreProgress(); renderSeasonPicker(); renderBoard(); document.getElementById('quiz-season').disabled = false; document.getElementById('season-winner-guess').disabled = false; document.querySelector('#season-winner-guess-form button[type="submit"]').disabled = false;
}
function resetQuiz() { revealedRaces.clear(); newRaceIds.clear(); quizGaveUp = false; try { localStorage.removeItem(progressKey()); } catch (_) {} renderBoard(); document.getElementById('quiz-feedback').textContent = 'Progress reset.'; }
async function revealQuiz() {
  const response = await fetch(`/api/games/season-race-winners/reveal${seriesQuery('?')}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ year: selectedYear }) }); const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Unable to reveal the answers.');
  result.answers.forEach(answer => revealedRaces.set(answer.raceId, answer.driverName)); quizGaveUp = true; newRaceIds.clear(); saveProgress(); renderBoard(); document.getElementById('quiz-feedback').textContent = 'Every remaining race winner has been revealed.'; document.getElementById('quiz-completion').scrollIntoView({ behavior: 'smooth', block: 'center' });
}
let pendingConfirmation = null;
function confirmAction(title, copy, label, action) { const dialog = document.getElementById('quiz-confirm-dialog'); document.getElementById('quiz-confirm-title').textContent = title; document.getElementById('quiz-confirm-copy').textContent = copy; document.getElementById('quiz-confirm-submit').textContent = label; pendingConfirmation = action; dialog.returnValue = ''; dialog.showModal(); }

document.getElementById('season-winner-guess-form').addEventListener('submit', async event => {
  event.preventDefault(); const input = event.currentTarget.elements.guess, submit = event.currentTarget.querySelector('button[type="submit"]'), feedback = document.getElementById('quiz-feedback'), guess = input.value.trim(); if (!guess) return; input.disabled = submit.disabled = true;
  try { const response = await fetch(`/api/games/season-race-winners/guess${seriesQuery('?')}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ year: selectedYear, guess }) }); const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Unable to check that guess.');
    if (!result.correct) { feedback.textContent = `${guess} did not win a race in ${seasonLabel(selectedYear)}.`; feedback.className = 'is-incorrect'; }
    else { const fresh = result.matches.filter(match => !revealedRaces.has(match.raceId)); result.matches.forEach(match => revealedRaces.set(match.raceId, match.driverName)); newRaceIds = new Set(fresh.map(match => match.raceId)); saveProgress(); renderBoard(); const names = [...new Set(result.matches.map(match => match.driverName))].join(' and '); feedback.textContent = fresh.length ? `Correct: ${names} revealed ${fresh.length} ${fresh.length === 1 ? 'race' : 'races'}.` : `${names} was already found.`; feedback.className = fresh.length ? 'is-correct' : ''; if (fresh.length) { requestAnimationFrame(() => document.querySelector(`[data-race-id="${fresh[0].raceId}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })); window.setTimeout(() => document.querySelectorAll('.is-new-answer').forEach(row => row.classList.remove('is-new-answer')), 1800); } }
    input.value = '';
  } catch (error) { feedback.textContent = error.message; feedback.className = 'is-incorrect'; }
  finally { input.disabled = submit.disabled = false; input.focus(); }
});
document.getElementById('quiz-season').addEventListener('change', async event => { document.getElementById('quiz-feedback').textContent = ''; try { await loadSeason(Number(event.target.value)); } catch (error) { document.getElementById('quiz-feedback').textContent = error.message; } });
document.getElementById('quiz-reset').addEventListener('click', () => confirmAction('Reset this season?', `Every answer found for ${seasonLabel(selectedYear)} will be removed.`, 'Reset quiz', resetQuiz));
document.getElementById('quiz-reveal').addEventListener('click', () => confirmAction('Reveal every race winner?', `All remaining ${seasonLabel(selectedYear)} winners will be shown and this attempt will be marked as revealed.`, 'Reveal answers', () => revealQuiz().catch(error => { document.getElementById('quiz-feedback').textContent = error.message; })));
document.getElementById('quiz-play-again').addEventListener('click', resetQuiz);
document.getElementById('quiz-confirm-dialog').addEventListener('close', event => { const action = pendingConfirmation; pendingConfirmation = null; if (event.currentTarget.returnValue === 'confirm') action?.(); });
document.getElementById('quiz-confirm-dialog').addEventListener('click', event => { if (event.target === event.currentTarget) event.currentTarget.close('cancel'); });
(async () => { try { await loadSeason(); document.getElementById('season-winner-guess').focus(); } catch (error) { setError('season-race-winners-quiz-board', error.message); document.getElementById('quiz-feedback').textContent = 'The quiz could not be loaded.'; } })();
