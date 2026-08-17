let winnerRows = [];
const revealedWinners = new Map();

function renderWinnerBoard() {
  const board = document.getElementById('race-winners-quiz-board');
  const columnSize = Math.ceil(winnerRows.length / 3);
  const columns = Array.from({ length: 3 }, (_, index) =>
    winnerRows.slice(index * columnSize, (index + 1) * columnSize)
  ).filter(column => column.length);

  board.innerHTML = columns.map(column => `<div class="quiz-column-table table-wrap">
    <table class="champions-quiz-table race-winners-table">
      <thead><tr><th>Wins</th><th>Driver</th><th>First win</th></tr></thead>
      <tbody>${column.map(row => {
        const name = revealedWinners.get(row.slot);
        return `<tr class="${name ? 'is-revealed' : ''}">
          <td><strong>${fmtNumber(row.wins)}</strong></td>
          <td class="quiz-driver-cell">${name ? `<span>${esc(name)}</span>` : '<span class="quiz-empty-answer" aria-label="Not yet answered"></span>'}</td>
          <td>${esc(row.firstWinYear)}</td>
        </tr>`;
      }).join('')}</tbody>
    </table>
  </div>`).join('');

  const found = revealedWinners.size;
  document.getElementById('quiz-score').textContent = `${found} / ${winnerRows.length}`;
  document.getElementById('quiz-progress-label').textContent = found === winnerRows.length
    ? 'Perfect score. Every winner found!'
    : `${winnerRows.length - found} drivers remaining`;
  const names = [...new Set(revealedWinners.values())];
  document.getElementById('guessed-drivers').innerHTML = names.map(name => `<span>${esc(name)}</span>`).join('');
}

async function initialiseRaceWinnersQuiz() {
  try {
    winnerRows = await getJSON('/api/games/race-winners');
    renderWinnerBoard();
    const form = document.getElementById('winner-guess-form');
    form.elements.guess.disabled = false;
    form.querySelector('button').disabled = false;
    document.getElementById('quiz-feedback').textContent = 'You can enter a full name or surname.';
    form.elements.guess.focus();
  } catch (error) {
    setError('race-winners-quiz-board', error.message);
    document.getElementById('quiz-feedback').textContent = 'The quiz could not be loaded.';
  }
}

document.getElementById('winner-guess-form').addEventListener('submit', async event => {
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
    const response = await fetch('/api/games/race-winners/guess', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ guess })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Unable to check that guess.');
    if (!result.correct) {
      feedback.textContent = `${guess} is not a Formula 1 Grand Prix winner.`;
      feedback.className = 'is-incorrect';
    } else {
      const newMatches = result.matches.filter(match => !revealedWinners.has(match.slot));
      result.matches.forEach(match => revealedWinners.set(match.slot, match.driverName));
      renderWinnerBoard();
      const names = result.matches.map(match => match.driverName).join(' and ');
      feedback.textContent = newMatches.length ? `Correct: ${names}.` : `${names} already ${result.matches.length > 1 ? 'were' : 'was'} found.`;
      feedback.className = newMatches.length ? 'is-correct' : '';
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

initialiseRaceWinnersQuiz();
