const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('WEC exposes a branded games hub and archive-backed quiz library', () => {
    const games = read('frontend/wec-games.html');
    const quizzes = read('frontend/wec-quizzes.html');
    for (const html of [games, quizzes]) {
        assert.match(html, /class="wec-mode"/);
        assert.match(html, /favicon-wec\.svg/);
    }
    assert.match(games, /href="\/wec\/quizzes"/);
    assert.match(games, /href="\/wec\/idle-racing-manager"/);
    assert.match(games, /href="\/wec\/lights-out"/);
    assert.match(quizzes, /data-quiz-card="race-winners"/);
    assert.match(quizzes, /data-quiz-card="season-race-winners"/);
});

test('WEC winner quizzes use overall entries and accept any winning crew driver', () => {
    const routes = read('backend/routes/games.js');
    const winners = read('frontend/wec-race-winners-quiz.html');
    const crews = read('frontend/wec-season-race-winners-quiz.html');
    assert.match(routes, /async function getWecRaceWinners\(\)/);
    assert.match(routes, /results\.overallPosition = 1/);
    assert.match(routes, /crew\.entryId = results\.entryId/);
    assert.match(routes, /row\.driverNames\.some\(name => nameMatchesGuess\(name, guess\)\)/);
    assert.match(winners, /src="\/js\/race-winners-quiz\.js"/);
    assert.match(crews, /data-quiz-answer-label="Winning crew"/);
    assert.match(crews, /src="\/js\/season-race-winners-quiz\.js"/);
});

test('WEC games are present in routes, championship switching and navigation', () => {
    const server = read('backend/server.js');
    const navigation = read('frontend/js/navigation.js');
    const footer = read('frontend/js/privacy.js');
    for (const route of ['games', 'quizzes', 'race-winners-quiz', 'season-race-winners-quiz', 'idle-racing-manager', 'lights-out']) {
        assert.match(server, new RegExp(`app\\.get\\('\/wec\/${route.replaceAll('-', '\\-')}'`));
        assert.match(navigation, new RegExp(`'\/wec\/${route.replaceAll('-', '\\-')}'`));
    }
    assert.match(navigation, /gamesTitle\.textContent = 'WEC GAMES'/);
    assert.match(footer, /games: '\/wec\/games'/);
});
