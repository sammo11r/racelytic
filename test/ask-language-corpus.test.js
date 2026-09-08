const test = require('node:test');
const assert = require('node:assert/strict');
const { interpretLocally } = require('../backend/ask-interpreter');

const supported = [
    ['Who has the most world championships using the 1982 points system?', 'drivers', 1982],
    ['Which driver has the highest number of titles under 1991 rules?', 'drivers', 1991],
    ['Who is the all-time WDC leader with 2003 scoring?', 'drivers', 2003],
    ['Which racer has the greatest number of world crowns based on the 2010 point system?', 'drivers', 2010],
    ['Who is the winningest driver by championships on the 1982 format?', 'drivers', 1982],
    ['Rank drivers by titles according to the 2014 rules', 'drivers', 2014],
    ['Who would be champion most often using current rules?', 'drivers', 2025],
    ['Who is the top driver by world championships with the points system from 1961?', 'drivers', 1961],
    ['Who is the championship record holder with scoring used in 1975?', 'drivers', 1975],
    ['Which pilot has the most WDCs with the 2021 scoring system?', 'drivers', 2021],
    ['Rank racers by world titles using rules from the 1982 season', 'drivers', 1982],
    ['Who leads the driver title count under the system in place in 1991?', 'drivers', 1991],
    ['Who has the greatest championship record if we score it like 2003?', 'drivers', 2003],
    ['Top driver by titles with 2010-style scoring', 'drivers', 2010],
    ['Who has the most world crowns under the 1991 point scheme?', 'drivers', 1991],
    ['Rank the WDC leaders with present-day scoring rules', 'drivers', 2025],
    ['Who has the highest number of championships with points used today?', 'drivers', 2025],
    ['Which driver leads in titles using the rules currently?', 'drivers', 2025],
    ['Most driver championships with 1958 scoring format', 'drivers', 1958],
    ['Greatest number of WDC titles using the 1967 points rules', 'drivers', 1967],
    ['Who has the most titles from 1980 to 2020 using 2010 points?', 'drivers', 2010, 1980, 2020],
    ['Top WDC during seasons 1970–1990 under 1982 rules?', 'drivers', 1982, 1970, 1990],
    ['Rank drivers by titles over 2000-2020 using the 1991 scoring system', 'drivers', 1991, 2000, 2020],
    ['Most world championships across the seasons 1985 through 2015 with 2003 points', 'drivers', 2003, 1985, 2015],
    ['Who leads the titles for 1990 until 2010 under 1961 rules?', 'drivers', 1961, 1990, 2010],
    ['Highest WDC count covering 1980-2000 with 2014 scoring', 'drivers', 2014, 1980, 2000],
    ['Who has most championships only 2001 to 2020 using 1982 rules?', 'drivers', 1982, 2001, 2020],
    ['Rank drivers by titles in years 1995-2005 with 2010 scoring', 'drivers', 2010, 1995, 2005],
    ['Top world-title driver since 2000 using 1991 rules', 'drivers', 1991, 2000, null],
    ['Who has most WDCs after 1999 through 2020 with 1982 points?', 'drivers', 1982, 2000, 2020],
    ['Which constructor has the most championships using 1991 rules?', 'constructors', 1991],
    ['Which team has the highest number of titles with 2003 scoring?', 'constructors', 2003],
    ['Who is the all-time WCC leader under the 2010 points system?', 'constructors', 2010],
    ['Rank constructors by championships using 1982 rules', 'constructors', 1982],
    ['Which manufacturer has the greatest number of world titles with 2014 scoring?', 'constructors', 2014],
    ['Which marque is the winningest by championships using current rules?', 'constructors', 2025],
    ['Top team by constructors titles according to the 1991 format', 'constructors', 1991],
    ['Who leads the WCC count with the points system from 2003?', 'constructors', 2003],
    ['Most constructor crowns with scoring used in 1979', 'constructors', 1979],
    ['Rank teams by titles under the system in place in 1967', 'constructors', 1967],
    ['Which manufacturer has the championship record if we score it like 2010?', 'constructors', 2010],
    ['Greatest WCC total with 1982-style scoring', 'constructors', 1982],
    ['Top constructor by world championships using the 2009 point scheme', 'constructors', 2009],
    ['Most team titles from 1980 to 2020 under 1991 rules', 'constructors', 1991, 1980, 2020],
    ['Rank constructors by titles during seasons 1960-1980 using 1975 points', 'constructors', 1975, 1960, 1980],
    ['Highest WCC count over 2000 through 2021 with 2010 scoring', 'constructors', 2010, 2000, 2021],
    ['Which team has most championships across 1990–2010 using 2003 rules?', 'constructors', 2003, 1990, 2010],
    ['Top constructor by championships since 2000 with current scoring rules', 'constructors', 2025, 2000, null],
    ['Which marque has most world titles up to 2000 using 1982 points?', 'constructors', 1982, null, 2000],
    ['Rank manufacturers by championships before 2010 with 1991 scoring', 'constructors', 1991, null, 2009]
];

test('local question corpus maps fifty realistic phrasings to stable slots', () => {
    assert.equal(supported.length, 50);
    supported.forEach(([query, entity, pointsSystemYear, fromYear = null, toYear = null]) => {
        const result = interpretLocally(query);
        assert.equal(result.intent, 'recalculate_title_counts', query);
        assert.equal(result.entity, entity, query);
        assert.equal(result.pointsSystemYear, pointsSystemYear, query);
        assert.equal(result.fromYear, fromYear, query);
        assert.equal(result.toYear, toYear, query);
        assert.ok(['high', 'medium'].includes(result.confidence), query);
    });
});

const clarifications = [
    ['Who has the most Drivers Championships?', 'pointsSystemYear'],
    ['Rank constructors by titles', 'pointsSystemYear'],
    ['Who has the most WDCs under 1949 rules?', 'pointsSystemYear'],
    ['Compare drivers and constructors by titles with 2010 rules', 'entity'],
    ['Rank teams and drivers by championships under 1991 scoring', 'entity']
];

test('incomplete or ambiguous title questions request the missing slot', () => {
    clarifications.forEach(([query, field]) => {
        const result = interpretLocally(query);
        assert.equal(result.intent, 'unsupported', query);
        assert.ok(result.missingFields.includes(field) || result.ambiguousFields.includes(field), query);
        assert.equal(result.confidence, 'low', query);
    });
});

const extended = [
    ['Who would win the 2016 Drivers Championship using 1982 points?', 'recalculate_season_champion', 'drivers', 1982, 2016, null],
    ['Which constructor wins the 2008 championship under 2010 rules?', 'recalculate_season_champion', 'constructors', 2010, 2008, null],
    ['Who would have won the championship in 2008 under 1991 rules?', 'recalculate_season_champion', 'drivers', 1991, 2008, null],
    ['How many world titles would Lewis Hamilton have under 1982 rules?', 'recalculate_entity_titles', null, 1982, null, 'Lewis Hamilton'],
    ['How many driver championships does Vettel win with 1991 scoring?', 'recalculate_entity_titles', 'drivers', 1991, null, 'Vettel'],
    ['How many WCCs would Ferrari have under current rules?', 'recalculate_entity_titles', 'constructors', 2025, null, 'Ferrari'],
    ['How many championships for McLaren under 2010 rules?', 'recalculate_entity_titles', null, 2010, null, 'McLaren'],
    ['What seasons would change under 1982 scoring?', 'list_changed_championships', 'drivers', 1982, null, null],
    ['Which drivers championships switch with 2010 points?', 'list_changed_championships', 'drivers', 2010, null, null],
    ['How many WCC seasons have a different champion under 1991 rules?', 'list_changed_championships', 'constructors', 1991, null, null],
    ['What champions differ with current rules?', 'list_changed_championships', 'drivers', 2025, null, null],
    ['Which constructor championships change under 2003 scoring?', 'list_changed_championships', 'constructors', 2003, null, null]
];

test('extended MVP language maps to season, subject, and changed-history intents', () => {
    extended.forEach(([query, intent, entity, pointsSystemYear, targetSeason, subjectName]) => {
        const result = interpretLocally(query);
        assert.equal(result.intent, intent, query);
        assert.equal(result.entity, entity, query);
        assert.equal(result.pointsSystemYear, pointsSystemYear, query);
        assert.equal(result.targetSeason, targetSeason, query);
        assert.equal(result.subjectName, subjectName, query);
    });
});

const comparisons = [
    ['Compare the 1982 and 1991 systems', 'drivers', [1982, 1991], null],
    ['How does Ferrari perform under current rules versus 2003 rules?', null, [2025, 2003], 'Ferrari'],
    ['Does Alonso win more titles under 1982 or 1991 rules?', null, [1982, 1991], 'Alonso'],
    ['Compare constructor championships under 2003 versus 2010 rules', 'constructors', [2003, 2010], null]
];

test('rulebook comparisons extract two systems without confusing season ranges', () => {
    comparisons.forEach(([query, entity, years, subjectName]) => {
        const result = interpretLocally(query);
        assert.equal(result.intent, 'compare_points_systems', query);
        assert.equal(result.entity, entity, query);
        assert.deepEqual(result.comparisonPointsSystemYears, years, query);
        assert.equal(result.subjectName, subjectName, query);
    });
    const ranged = interpretLocally('Compare 1982 rules with 1991 rules between 2000 and 2020');
    assert.deepEqual(ranged.comparisonPointsSystemYears, [1982, 1991]);
    assert.deepEqual([ranged.fromYear, ranged.toYear], [2000, 2020]);
    const incomplete = interpretLocally('Which scoring system gives Alonso the most titles?');
    assert.equal(incomplete.intent, 'unsupported');
    assert.deepEqual(incomplete.missingFields, ['comparisonPointsSystemYears']);
});
