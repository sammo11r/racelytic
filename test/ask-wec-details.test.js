const test = require('node:test');
const assert = require('node:assert/strict');
const { parseWecDetail, executeWecDetail } = require('../backend/ask-wec-details');

const connection = { query: async sql => {
    if (/FROM wec_events events JOIN wec_circuits/.test(sql)) return [
        { id: 'le-mans', name: '24 Hours of Le Mans', year: 2024, circuitName: 'Le Mans' },
        { id: 'cota', name: 'Lone Star Le Mans', year: 2024, circuitName: 'COTA' }
    ];
    if (/FROM wec_session_results results JOIN wec_sessions/.test(sql)) return [
        { overallPosition: 3, classPosition: 3, status: 'classified', classCode: 'HYPERCAR', carNumber: '51', teamName: 'Ferrari AF Corse' }
    ];
    if (/SELECT id, name FROM wec_teams/.test(sql)) return [{ id: 7, name: 'Toyota Gazoo Racing' }];
    if (/FROM wec_entries entries JOIN wec_events events/.test(sql)) return [
        { id: 1, competitorId: 'car-7', carNumber: '7', classCode: 'HYPERCAR', eventId: 'le-mans', eventName: '24 Hours of Le Mans' },
        { id: 2, competitorId: 'car-8', carNumber: '8', classCode: 'HYPERCAR', eventId: 'le-mans', eventName: '24 Hours of Le Mans' },
        { id: 3, competitorId: 'car-7', carNumber: '7', classCode: 'HYPERCAR', eventId: 'fuji', eventName: '6 Hours of Fuji' }
    ];
    throw new Error(`Unexpected query: ${sql}`);
} };

test('WEC detail parser requires both ranks or an explicit car entry count', () => {
    assert.equal(parseWecDetail('Where did car #51 finish in class and overall at Le Mans in 2024?').intent, 'wec_class_overall_rank');
    assert.equal(parseWecDetail('How many cars did Toyota Gazoo Racing enter in the 2024 WEC season?').intent, 'wec_team_car_count');
    assert.equal(parseWecDetail('Who won at Le Mans in 2024?'), null);
});

test('WEC class and overall positions come from one race classification', async () => {
    const result = await executeWecDetail(connection, 'Where did car #51 finish in class and overall at Le Mans in 2024?');
    assert.match(result.answer, /P3 in HYPERCAR and P3 overall/);
    assert.equal(result.interpretation.eventName, '24 Hours of Le Mans');
});

test('WEC season car count deduplicates the same competitor across events', async () => {
    const result = await executeWecDetail(connection, 'How many cars did Toyota Gazoo Racing enter in the 2024 WEC season?');
    assert.match(result.answer, /entered 2 distinct WEC cars/);
    assert.equal(result.wecEvidence.rows.length, 2);
});
