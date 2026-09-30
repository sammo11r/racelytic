const test = require('node:test');
const assert = require('node:assert/strict');
const { interpretLocally } = require('../backend/ask-interpreter');
const { driverTeamHistory } = require('../backend/ask-team-history');

const starts = [
    { eventId: 1, eventName: 'First Race', eventDate: '2020-01-01', year: 2020, round: 1,
        driverId: 1, driverName: 'Alice One', teamId: 10, teamName: 'Red Team', position: 1, status: '1' },
    { eventId: 1, eventName: 'First Race', eventDate: '2020-01-01', year: 2020, round: 1,
        driverId: 2, driverName: 'Bob Two', teamId: 10, teamName: 'Red Team', position: 2, status: '2' },
    { eventId: 2, eventName: 'Second Race', eventDate: '2020-02-01', year: 2020, round: 2,
        driverId: 1, driverName: 'Alice One', teamId: 20, teamName: 'Blue Team', position: 2, status: '2' },
    { eventId: 2, eventName: 'Second Race', eventDate: '2020-02-01', year: 2020, round: 2,
        driverId: 3, driverName: 'Cara Three', teamId: 20, teamName: 'Blue Team', position: 1, status: '1' },
    { eventId: 3, eventName: 'Third Race', eventDate: '2020-03-01', year: 2020, round: 3,
        driverId: 1, driverName: 'Alice One', teamId: 10, teamName: 'Red Team', position: 1, status: '1' }
];
const connection = { query: async () => starts };

test('team history parser separates team changes and teammate pairings', () => {
    assert.equal(interpretLocally('Which teams did Alice One race for?').historyMode, 'teams');
    assert.equal(interpretLocally("Who were Alice One's teammates?").historyMode, 'teammates');
});

test('returning to a former team creates a new recorded stint', async () => {
    const result = await driverTeamHistory(connection, { series: 'f1', subjectName: 'Alice One', historyMode: 'teams' });
    assert.match(result.answer, /3 recorded team stints.*Red Team → Blue Team → Red Team/);
});

test('teammate pairings require shared team and event', async () => {
    const result = await driverTeamHistory(connection, { series: 'f1', subjectName: 'Alice One', historyMode: 'teammates' });
    assert.equal(result.fact.rows.length, 2);
    assert.match(result.answer, /2 recorded teammate pairings/);
});
