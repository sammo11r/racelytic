let quizSeasons = [];
const revealedSeasons = new Map();
const guessedDriverNames = new Set();

function renderQuizTable() {
  const board = document.getElementById('champions-quiz-board');
  const chronological = [...quizSeasons].sort((a, b) => a.year - b.year);
  const columnSize = Math.ceil(chronological.length / 3);
  const columns = Array.from({ length: 3 }, (_, index) =>
    chronological.slice(index * columnSize, (index + 1) * columnSize)
  ).filter(column => column.length);

  board.innerHTML = columns.map(column => `<div class="quiz-column-table table-wrap">
    <table class="champions-quiz-table">
      <thead><tr><th>Season</th><th>Driver</th><th>Team</th></tr></thead>
      <tbody>${column.map(season => {
        const driver = revealedSeasons.get(season.year);
        return `<tr class="${driver ? 'is-revealed' : ''}">
          <td><strong>${esc(season.year)}</strong></td>
          <td class="quiz-driver-cell">${driver ? `<span>${esc(driver)}</span>` : '<span class="quiz-empty-answer" aria-label="Not yet answered"></span>'}</td>
          <td>${season.teams.length ? season.teams.map(esc).join(' / ') : '—'}</td>
        </tr>`;
      }).join('')}</tbody>
    </table>
  </div>`).join('');

  const found = revealedSeasons.size;
  document.getElementById('quiz-score').textContent = `${found} / ${quizSeasons.length}`;
  document.getElementById('quiz-progress-label').textContent = found === quizSeasons.length
    ? 'Perfect score — every season found!'
    : `${quizSeasons.length - found} seasons remaining`;
  document.getElementById('guessed-drivers').innerHTML = [...guessedDriverNames].map(name => `<span>${esc(name)}</span>`).join('');
}

async function initialiseChampionsQuiz() {
  try {
    quizSeasons = await getJSON('/api/games/world-champions');
    renderQuizTable();
    const form = document.getElementById('champion-guess-form');
    form.elements.guess.disabled = false;
    form.querySelector('button').disabled = false;
    document.getElementById('quiz-feedback').textContent = 'You can enter a full name or surname.';
    form.elements.guess.focus();
  } catch (error) {
    setError('champions-quiz-board', error.message);
    document.getElementById('quiz-feedback').textContent = 'The quiz could not be loaded.';
  }
}

document.getElementById('champion-guess-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const input = form.elements.guess;
  const button = form.querySelector('button');
  const feedback = document.getElementById('quiz-feedback');
  const guess = input.value.trim();
  if (!guess) return;

  input.disabled = true;
  button.disabled = true;
  try {
    const response = await fetch('/api/games/world-champions/guess', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ guess })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Unable to check that guess.');
    if (!result.correct) {
      feedback.textContent = `${guess} is not a World Drivers’ Champion.`;
      feedback.className = 'is-incorrect';
    } else {
      const newYears = result.years.filter(year => !revealedSeasons.has(year));
      result.years.forEach(year => revealedSeasons.set(year, result.driverName));
      guessedDriverNames.add(result.driverName);
      renderQuizTable();
      feedback.textContent = newYears.length
        ? `Correct — ${result.driverName} revealed ${newYears.length} ${newYears.length === 1 ? 'season' : 'seasons'}.`
        : `${result.driverName} was already found.`;
      feedback.className = newYears.length ? 'is-correct' : '';
    }
    input.value = '';
  } catch (error) {
    feedback.textContent = error.message;
    feedback.className = 'is-incorrect';
  } finally {
    input.disabled = false;
    button.disabled = false;
    input.focus();
  }
});

initialiseChampionsQuiz();
