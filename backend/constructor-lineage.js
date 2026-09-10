function normalizeConstructorLineage(id, rows) {
    const segments = rows.map(row => ({
        constructorId: row.constructorId,
        name: row.name || row.constructorId,
        fullName: row.fullName || row.name || row.constructorId,
        fromYear: Number(row.yearFrom) || null,
        toYear: Number(row.yearTo) || null,
        order: Number(row.positionDisplayOrder) || 0,
        current: row.constructorId === id
    })).sort((a, b) => a.order - b.order);
    return segments.length > 1 ? {
        methodology: 'Operational lineage only. Results and championships remain attributed to the constructor identity under which they were earned.',
        segments
    } : null;
}

async function constructorLineage(connection, id) {
    try {
        const rows = await connection.query(`
            SELECT chronology.positionDisplayOrder, chronology.constructorId,
                chronology.yearFrom, chronology.yearTo, constructors.name, constructors.fullName
            FROM constructors_chronology chronology
            LEFT JOIN constructors ON constructors.id = chronology.constructorId
            WHERE chronology.parentConstructorId = ?
            ORDER BY chronology.positionDisplayOrder
        `, [id]);
        return normalizeConstructorLineage(id, rows);
    } catch (error) {
        if (error.code === 'ER_NO_SUCH_TABLE') return null;
        throw error;
    }
}

// Preserve the original module path while the normalized importer remains compatible with legacy databases.
module.exports = require('./constructor-lineage-v2');
