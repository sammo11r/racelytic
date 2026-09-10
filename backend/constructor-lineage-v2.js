const editorial = require('../data/f1-constructor-lineage-transitions.json');
const { chronologySignature } = require('./constructor-lineage-data');
const lineageCache = new Map();
let lineageContextCache = { expiresAt: 0, values: null };
const CACHE_MS = 5 * 60 * 1000;

function transitionFor(previous, current) {
  if (!previous) return null;
  const relationship = editorial.transitions[`${previous.constructorId}>${current.constructorId}`] || {};
  return {
    type: relationship.type || 'operational-continuation',
    label: relationship.label || 'Operational continuation',
    note: relationship.note || 'The imported chronology records continuity between these constructor identities.',
    continuity: relationship.continuity || ['operation'],
    confidence: relationship.confidence || 'unreviewed',
    sourceLabel: relationship.sourceLabel || editorial.transitionSource.label,
    sourceUrl: relationship.sourceUrl || editorial.transitionSource.url
  };
}

function normalizeConstructorLineage(id, rows) {
  const segments = rows.map((row, index) => ({
    segmentId: row.segmentId || row.id || `${row.lineageId || row.parentConstructorId || 'lineage'}-${Number(row.positionDisplayOrder) || index + 1}`,
    constructorId: row.constructorId,
    name: row.name || row.constructorId,
    fullName: row.fullName || row.name || row.constructorId,
    fromYear: Number(row.yearFrom) || null,
    toYear: Number(row.yearTo) || null,
    order: Number(row.positionDisplayOrder) || index + 1
  })).filter(segment => segment.constructorId).sort((a, b) => a.order - b.order);
  const matching = segments.flatMap((segment, index) => segment.constructorId === id ? [index] : []);
  const currentIndex = matching.at(-1);
  segments.forEach((segment, index) => {
    segment.sameIdentity = segment.constructorId === id;
    segment.current = index === currentIndex;
    segment.transition = transitionFor(segments[index - 1], segment);
  });
  if (segments.length <= 1 || currentIndex === undefined) return null;
  const identities = [...new Set(segments.map(segment => segment.constructorId))];
  return {
    schemaVersion: 2,
    methodology: editorial.methodology,
    reviewedAt: editorial.reviewedAt,
    repeatedIdentity: matching.length > 1,
    source: editorial.source,
    summary: {
      firstYear: segments.find(segment => segment.fromYear)?.fromYear || null,
      lastYear: segments.at(-1)?.toYear || null,
      identityCount: identities.length,
      transitionCount: Math.max(0, segments.length - 1),
      currentName: segments.at(-1)?.name || ''
    },
    segments
  };
}

async function constructorLineage(connection, id) {
  const cached = lineageCache.get(id);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  try {
    let rows;
    try {
      rows = await connection.query(`
        SELECT chronology.lineageId, chronology.id AS segmentId, chronology.positionDisplayOrder,
          chronology.constructorId, chronology.yearFrom, chronology.yearTo, constructors.name, constructors.fullName
        FROM constructors_chronology chronology
        LEFT JOIN constructors ON constructors.id = chronology.constructorId
        WHERE chronology.lineageId = (
          SELECT member.lineageId FROM constructors_chronology member
          WHERE member.constructorId = ? ORDER BY member.positionDisplayOrder DESC LIMIT 1
        )
        ORDER BY chronology.positionDisplayOrder
      `, [id]);
    } catch (error) {
      if (!['ER_BAD_FIELD_ERROR', 'ER_NO_SUCH_COLUMN'].includes(error.code)) throw error;
      rows = await connection.query(`
        SELECT chronology.parentConstructorId, chronology.positionDisplayOrder, chronology.constructorId,
          chronology.yearFrom, chronology.yearTo, constructors.name, constructors.fullName
        FROM constructors_chronology chronology
        LEFT JOIN constructors ON constructors.id = chronology.constructorId
        WHERE chronology.parentConstructorId = COALESCE(
          (SELECT own.parentConstructorId FROM constructors_chronology own WHERE own.parentConstructorId = ? LIMIT 1),
          (SELECT member.parentConstructorId FROM constructors_chronology member WHERE member.constructorId = ? ORDER BY member.parentConstructorId LIMIT 1)
        )
        ORDER BY chronology.positionDisplayOrder
      `, [id, id]);
    }
    const value = normalizeConstructorLineage(id, rows);
    if (value) lineageCache.set(id, { expiresAt: Date.now() + CACHE_MS, value });
    return value;
  } catch (error) {
    if (error.code === 'ER_NO_SUCH_TABLE') return null;
    error.message = `Constructor lineage unavailable: ${error.message}`;
    throw error;
  }
}

function lineageContext(id, rows) {
  const ordered = [...rows].sort((a, b) => Number(a.positionDisplayOrder) - Number(b.positionDisplayOrder));
  const last = ordered.at(-1);
  const occurrences = ordered.flatMap((row, index) => row.constructorId === id ? [index] : []);
  if (!last || !occurrences.length || ordered.length < 2) return null;
  if (last.constructorId !== id) return { lineageId: last.lineageId || last.parentConstructorId, label: `Later became ${last.name || last.constructorId}` };
  const previous = [...ordered.slice(0, -1)].reverse().find(row => row.constructorId !== id);
  return previous ? { lineageId: last.lineageId || last.parentConstructorId, label: `Previously ${previous.name || previous.constructorId}` } : null;
}

async function constructorLineageContexts(connection, ids) {
  if (!ids.length) return new Map();
  if (lineageContextCache.values && lineageContextCache.expiresAt > Date.now()) {
    return new Map(ids.filter(id => lineageContextCache.values.has(id)).map(id => [id, lineageContextCache.values.get(id)]));
  }
  let rows, normalized = true;
  try {
    rows = await connection.query(`
      SELECT chronology.lineageId, chronology.positionDisplayOrder, chronology.constructorId,
        chronology.yearFrom, chronology.yearTo, constructors.name
      FROM constructors_chronology chronology
      LEFT JOIN constructors ON constructors.id = chronology.constructorId
      ORDER BY chronology.lineageId, chronology.positionDisplayOrder
    `);
  } catch (error) {
    if (!['ER_BAD_FIELD_ERROR', 'ER_NO_SUCH_COLUMN'].includes(error.code)) return new Map();
    normalized = false;
    rows = await connection.query(`
      SELECT chronology.parentConstructorId, chronology.positionDisplayOrder, chronology.constructorId,
        chronology.yearFrom, chronology.yearTo, constructors.name
      FROM constructors_chronology chronology
      LEFT JOIN constructors ON constructors.id = chronology.constructorId
      ORDER BY chronology.parentConstructorId, chronology.positionDisplayOrder
    `);
  }
  const groups = new Map();
  for (const row of rows) {
    const key = normalized ? row.lineageId : row.parentConstructorId;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  const unique = normalized ? [...groups.values()] : [...new Map([...groups.values()].map(chain => [chronologySignature(chain), chain])).values()];
  const result = new Map();
  for (const chain of unique) for (const id of new Set(chain.map(row => row.constructorId))) result.set(id, lineageContext(id, chain));
  lineageContextCache = { expiresAt: Date.now() + CACHE_MS, values: result };
  return new Map(ids.filter(id => result.has(id)).map(id => [id, result.get(id)]));
}

function clearConstructorLineageCache() { lineageCache.clear(); lineageContextCache = { expiresAt: 0, values: null }; }

function scopeConstructorLineage(lineage, id, years) {
  if (!lineage) return null;
  const ranges = lineage.segments.filter(segment => segment.constructorId === id);
  const outsideYears = [...new Set(years.map(Number).filter(year => year && !ranges.some(segment => year >= segment.fromYear && (!segment.toYear || year <= segment.toYear))))].sort((a, b) => a - b);
  if (!outsideYears.length) return lineage;
  const first = outsideYears[0], last = outsideYears.at(-1);
  return { ...lineage, identityScope: {
    outsideYears,
    label: first === last ? String(first) : `${first}–${last}`,
    note: 'This constructor identifier also contains results from a separate historical use of the same name. Those seasons are not part of the operational lineage shown here.'
  } };
}

async function optionalConstructorLineage(connection, id, logger = console) {
  try { return await constructorLineage(connection, id); }
  catch (error) {
    logger.warn?.(error.message);
    return null;
  }
}

module.exports = { clearConstructorLineageCache, constructorLineage, constructorLineageContexts, normalizeConstructorLineage, optionalConstructorLineage, scopeConstructorLineage, transitionFor };
