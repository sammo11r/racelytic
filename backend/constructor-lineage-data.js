function chronologySignature(rows) {
  return [...rows].sort((a, b) => Number(a.positionDisplayOrder) - Number(b.positionDisplayOrder))
    .map(row => [row.constructorId, Number(row.yearFrom) || null, Number(row.yearTo) || null]).join('|');
}

function canonicalizeConstructorChronology(rows) {
  const byParent = new Map();
  for (const row of rows) {
    if (!row.parentConstructorId) continue;
    const parentId = row.parentConstructorId;
    if (!byParent.has(parentId)) byParent.set(parentId, []);
    byParent.get(parentId).push(row);
  }
  const bySignature = new Map();
  for (const [parentId, segments] of byParent) {
    const signature = chronologySignature(segments);
    if (!bySignature.has(signature)) bySignature.set(signature, { parents: [], segments });
    bySignature.get(signature).parents.push(parentId);
  }
  const memberSignatures = new Map();
  for (const [signature, chain] of bySignature) {
    for (const segment of chain.segments) {
      const previous = memberSignatures.get(segment.constructorId);
      if (previous && previous !== signature) throw new Error(`Constructor ${segment.constructorId} belongs to conflicting chronology chains.`);
      memberSignatures.set(segment.constructorId, signature);
    }
  }
  const usedIds = new Set();
  return [...bySignature.values()].flatMap(chain => {
    const sorted = [...chain.segments].sort((a, b) => Number(a.positionDisplayOrder) - Number(b.positionDisplayOrder));
    const base = sorted.at(-1)?.constructorId || chain.parents.sort()[0];
    let lineageId = base;
    for (let suffix = 2; usedIds.has(lineageId); suffix += 1) lineageId = `${base}-${suffix}`;
    usedIds.add(lineageId);
    return sorted.map((row, index) => ({
      id: `${lineageId}-${index + 1}`,
      schemaVersion: 2,
      lineageId,
      positionDisplayOrder: index + 1,
      constructorId: row.constructorId,
      yearFrom: row.yearFrom,
      yearTo: row.yearTo
    }));
  });
}

function auditConstructorChronology(rows, constructorIds = []) {
  const errors = [], warnings = [];
  const constructors = new Set(constructorIds);
  const byParent = new Map();
  for (const row of rows) {
    if (!byParent.has(row.parentConstructorId)) byParent.set(row.parentConstructorId, []);
    byParent.get(row.parentConstructorId).push(row);
    if (!row.parentConstructorId || !row.constructorId) errors.push('Every chronology row needs parentConstructorId and constructorId.');
    if (constructors.size && !constructors.has(row.constructorId)) errors.push(`Unknown constructor ${row.constructorId}.`);
  }
  for (const [parentId, unsorted] of byParent) {
    const chain = [...unsorted].sort((a, b) => Number(a.positionDisplayOrder) - Number(b.positionDisplayOrder));
    const positions = chain.map(row => Number(row.positionDisplayOrder));
    if (new Set(positions).size !== positions.length) errors.push(`${parentId} has duplicate display positions.`);
    if (!chain.some(row => row.constructorId === parentId)) errors.push(`${parentId} is not a member of its own chronology.`);
    chain.forEach((row, index) => {
      const from = Number(row.yearFrom), to = Number(row.yearTo);
      if (!Number.isInteger(from)) errors.push(`${parentId}/${row.constructorId} has no valid start year.`);
      if (row.yearTo && (!Number.isInteger(to) || to < from)) errors.push(`${parentId}/${row.constructorId} has an invalid year range.`);
      if (!row.yearTo && index !== chain.length - 1) errors.push(`${parentId}/${row.constructorId} is open-ended before the final segment.`);
      const previous = chain[index - 1];
      if (previous?.yearTo && from <= Number(previous.yearTo)) errors.push(`${parentId} has overlapping segments around ${from}.`);
      if (previous?.yearTo && from > Number(previous.yearTo) + 1) warnings.push(`${parentId} has a gap before ${from}.`);
    });
  }
  try { canonicalizeConstructorChronology(rows); } catch (error) { errors.push(error.message); }
  return { errors: [...new Set(errors)], warnings: [...new Set(warnings)] };
}

module.exports = { auditConstructorChronology, canonicalizeConstructorChronology, chronologySignature };
