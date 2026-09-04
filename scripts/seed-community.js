const pool = require('../backend/db');
const { ensureAuthSchema } = require('../backend/auth');
const { PRIVACY_VERSION, TERMS_VERSION } = require('../backend/legal');
const { seriesPrefix } = require('../backend/series-config');

const CURATOR_ID = '00000000-0000-4000-8000-000000000001';
const CURATOR_USERNAME = 'racelytic-starters';
const DRY_RUN = process.argv.includes('--dry-run');

const ids = {
  points: {
    finishers: '10000000-0000-4000-8000-000000000001',
    classic: '10000000-0000-4000-8000-000000000002',
    sprint: '10000000-0000-4000-8000-000000000003'
  },
  records: {
    f1: '20000000-0000-4000-8000-000000000001',
    f2: '20000000-0000-4000-8000-000000000002',
    f3: '20000000-0000-4000-8000-000000000003',
    academy: '20000000-0000-4000-8000-000000000004'
  },
  championships: {
    f1: '30000000-0000-4000-8000-000000000001',
    f2: '30000000-0000-4000-8000-000000000002',
    f3: '30000000-0000-4000-8000-000000000003',
    academy: '30000000-0000-4000-8000-000000000004'
  }
};

const systems = [
  {
    id: ids.points.finishers, name: 'Every Finisher Scores',
    racePoints: [25, 20, 16, 13, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1],
    sprintPoints: [10, 8, 6, 5, 4, 3, 2, 1], qualifyingPoints: [],
    poleBonus: 0, fastestLapBonus: 1, fastestLapMaxPosition: 15
  },
  {
    id: ids.points.classic, name: 'Classic Top Six',
    racePoints: [10, 6, 4, 3, 2, 1], sprintPoints: [], qualifyingPoints: [],
    poleBonus: 0, fastestLapBonus: 0, fastestLapMaxPosition: null
  },
  {
    id: ids.points.sprint, name: 'Sprint Specialist',
    racePoints: [25, 18, 15, 12, 10, 8, 6, 4, 2, 1],
    sprintPoints: [15, 12, 10, 8, 6, 5, 4, 3, 2, 1], qualifyingPoints: [3, 2, 1],
    poleBonus: 0, fastestLapBonus: 1, fastestLapMaxPosition: 10
  }
];

const records = [
  { id: ids.records.f1, name: 'F1 champions since 2000', configuration: { series: 'f1', type: 'drivers', category: 'championships', fromYear: 2000, toYear: null, circuitId: '', constructorId: '', nationality: '', includeSprints: false, minStarts: 1 } },
  { id: ids.records.f2, name: 'Formula 2 feature-race winners', configuration: { series: 'f2', type: 'drivers', category: 'wins', fromYear: 2017, toYear: null, circuitId: '', constructorId: '', nationality: '', raceFormat: 'F', includeSprints: false, minStarts: 1 } },
  { id: ids.records.f3, name: 'Formula 3 qualifying specialists', configuration: { series: 'f3', type: 'drivers', category: 'poles', fromYear: 2019, toYear: null, circuitId: '', constructorId: '', nationality: '', raceFormat: 'F', includeSprints: false, minStarts: 1 } },
  { id: ids.records.academy, name: 'F1 Academy race winners', configuration: { series: 'academy', type: 'drivers', category: 'wins', fromYear: 2023, toYear: null, circuitId: '', constructorId: '', nationality: '', raceFormat: 'all', includeSprints: true, minStarts: 1 } }
];

const pointSnapshots = {
  f1: { id: 'modern', name: 'Modern Formula 1', race: [25, 18, 15, 12, 10, 8, 6, 4, 2, 1], sprint: [3, 2, 1], qualifying: [], poleBonus: 0, fastestLapBonus: 1, fastestLapMaxPosition: 10 },
  f2: { id: 'f2-current', name: 'Formula 2 · current', race: [25, 18, 15, 12, 10, 8, 6, 4, 2, 1], sprint: [10, 8, 6, 5, 4, 3, 2, 1], qualifying: [], poleBonus: 2, fastestLapBonus: 1, fastestLapMaxPosition: 10 },
  f3: { id: 'f3-current', name: 'Formula 3 · current', race: [25, 18, 15, 12, 10, 8, 6, 4, 2, 1], sprint: [10, 9, 8, 7, 6, 5, 4, 3, 2, 1], qualifying: [], poleBonus: 2, fastestLapBonus: 1, fastestLapMaxPosition: 10 },
  academy: { id: 'academy-current', name: 'F1 Academy · current', race: [25, 18, 15, 12, 10, 8, 6, 4, 2, 1], sprint: [10, 8, 6, 5, 4, 3, 2, 1], qualifying: [], poleBonus: 2, fastestLapBonus: 1, fastestLapMaxPosition: 10 }
};

async function curator(connection) {
  const existing = await connection.query('SELECT id, username FROM app_users WHERE username = ? OR id = ?', [CURATOR_USERNAME, CURATOR_ID]);
  if (existing.some(user => user.id !== CURATOR_ID || user.username !== CURATOR_USERNAME)) {
    throw new Error('The reserved Racelytic starter account identity is already in use.');
  }
  if (existing.length) return CURATOR_ID;
  await connection.query(`INSERT INTO app_users
    (id, username, display_name, password_hash, terms_version, privacy_version, legal_accepted_at)
    VALUES (?, ?, 'Racelytic', 'disabled$curated-community-content', ?, ?, CURRENT_TIMESTAMP)`,
    [CURATOR_ID, CURATOR_USERNAME, TERMS_VERSION, PRIVACY_VERSION]);
  return CURATOR_ID;
}

async function seedPoints(connection, userId) {
  for (const system of systems) {
    await connection.query(`INSERT INTO app_points_systems
      (id, user_id, name, race_points, sprint_points, qualifying_points, pole_bonus,
       fastest_lap_bonus, fastest_lap_max_position, count_best_rounds, best_first_rounds,
       first_rounds_window, best_last_rounds, last_rounds_window, sprint_counts_toward_round,
       visibility, tie_breaker)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, NULL, 1, 'public', 'countback')
      ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), name = VALUES(name),
        race_points = VALUES(race_points), sprint_points = VALUES(sprint_points),
        qualifying_points = VALUES(qualifying_points), pole_bonus = VALUES(pole_bonus),
        fastest_lap_bonus = VALUES(fastest_lap_bonus), fastest_lap_max_position = VALUES(fastest_lap_max_position),
        visibility = 'public', updated_at = CURRENT_TIMESTAMP`, [
      system.id, userId, system.name, JSON.stringify(system.racePoints), JSON.stringify(system.sprintPoints),
      JSON.stringify(system.qualifyingPoints), system.poleBonus, system.fastestLapBonus, system.fastestLapMaxPosition
    ]);
  }
}

async function seedRecords(connection, userId) {
  for (const record of records) {
    await connection.query(`INSERT INTO app_saved_records (id, user_id, name, configuration, visibility)
      VALUES (?, ?, ?, ?, 'public') ON DUPLICATE KEY UPDATE user_id = VALUES(user_id),
      name = VALUES(name), configuration = VALUES(configuration), visibility = 'public', updated_at = CURRENT_TIMESTAMP`,
    [record.id, userId, record.name, JSON.stringify(record.configuration)]);
  }
}

function placeholders(values) { return values.map(() => '?').join(','); }

async function f1RunIn(connection) {
  const races = await connection.query(`SELECT r.id, r.round FROM races r
    WHERE r.year = 2021 AND EXISTS (SELECT 1 FROM races_race_results result WHERE result.raceId = r.id)
    ORDER BY r.round DESC LIMIT 6`);
  if (!races.length) throw new Error('The 2021 Formula 1 run-in is unavailable.');
  races.reverse();
  const raceIds = races.map(race => String(race.id));
  const rows = await connection.query(`SELECT DISTINCT driverId, constructorId FROM races_race_results
    WHERE raceId IN (${placeholders(raceIds)})`, raceIds);
  return {
    series: 'f1', raceIds,
    driverIds: [...new Set(rows.map(row => String(row.driverId)).filter(Boolean))],
    constructorIds: [...new Set(rows.map(row => String(row.constructorId)).filter(Boolean))],
    pointsSystem: pointSnapshots.f1
  };
}

async function juniorRunIn(connection, series, year = 2024, weekendCount = 4) {
  const prefix = seriesPrefix(series);
  const weekends = await connection.query(`SELECT races.id, races.round FROM ${prefix}races races
    WHERE races.year = ? AND EXISTS (SELECT 1 FROM ${prefix}session_results result WHERE result.raceId = races.id)
    ORDER BY races.round DESC LIMIT ${Number(weekendCount)}`, [year]);
  if (!weekends.length) throw new Error(`The ${year} ${series} run-in is unavailable.`);
  weekends.reverse();
  const weekendIds = weekends.map(race => String(race.id));
  const sessions = await connection.query(`SELECT sessions.id, sessions.raceId, sessions.sessionNumber
    FROM ${prefix}sessions sessions WHERE sessions.raceId IN (${placeholders(weekendIds)})
      AND sessions.isRace = 1 AND sessions.cancelled = 0
      AND EXISTS (SELECT 1 FROM ${prefix}session_results result WHERE result.sessionId = sessions.id)
    ORDER BY sessions.year, sessions.round, sessions.sessionNumber`, weekendIds);
  const resultRows = await connection.query(`SELECT DISTINCT driverId, constructorId FROM ${prefix}session_results
    WHERE raceId IN (${placeholders(weekendIds)})`, weekendIds);
  return {
    series, raceIds: sessions.map(session => `${session.raceId}::${session.id}`),
    driverIds: [...new Set(resultRows.map(row => String(row.driverId)).filter(Boolean))],
    constructorIds: [...new Set(resultRows.map(row => String(row.constructorId)).filter(Boolean))],
    pointsSystem: pointSnapshots[series]
  };
}

async function seedChampionships(connection, userId) {
  const starters = [
    { id: ids.championships.f1, name: 'The 2021 Final Six', description: 'Revisit the final six races of the 2021 Formula 1 title fight as a standalone championship.', configuration: await f1RunIn(connection) },
    { id: ids.championships.f2, name: '2024 Formula 2 Run-In', description: 'The final four Formula 2 weekends of 2024, with every sprint and feature race counting.', configuration: await juniorRunIn(connection, 'f2') },
    { id: ids.championships.f3, name: '2024 Formula 3 Run-In', description: 'The final four Formula 3 weekends of 2024, recast as a compact championship.', configuration: await juniorRunIn(connection, 'f3') },
    { id: ids.championships.academy, name: '2024 F1 Academy Run-In', description: 'The closing four F1 Academy weekends of 2024, with the complete eligible field.', configuration: await juniorRunIn(connection, 'academy') }
  ];
  for (const item of starters) {
    if (!item.configuration.raceIds.length || !item.configuration.driverIds.length || !item.configuration.constructorIds.length) {
      throw new Error(`${item.name} did not resolve to a complete field.`);
    }
    await connection.query(`INSERT INTO app_custom_championships
      (id, user_id, name, description, visibility, configuration) VALUES (?, ?, ?, ?, 'public', ?)
      ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), name = VALUES(name), description = VALUES(description),
        visibility = 'public', configuration = VALUES(configuration), updated_at = CURRENT_TIMESTAMP`,
    [item.id, userId, item.name, item.description, JSON.stringify(item.configuration)]);
  }
  return starters;
}

async function main() {
  await ensureAuthSchema();
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const userId = await curator(connection);
    await seedPoints(connection, userId);
    await seedRecords(connection, userId);
    const championships = await seedChampionships(connection, userId);
    if (DRY_RUN) await connection.rollback(); else await connection.commit();
    console.log(`${DRY_RUN ? 'Validated' : 'Seeded'} ${systems.length} points systems, ${records.length} record views and ${championships.length} championships.`);
    championships.forEach(item => console.log(`- ${item.name}: ${item.configuration.raceIds.length} races, ${item.configuration.driverIds.length} drivers`));
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
    await pool.end();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
