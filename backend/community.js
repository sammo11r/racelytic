function parseJson(value, fallback) {
    if (value == null) return fallback;
    if (typeof value !== 'string') return value;
    try { return JSON.parse(value); }
    catch { return fallback; }
}

function pointItems(rows) {
    return rows.map(row => ({
        type: 'points', id: row.id, name: row.name, ownerName: row.ownerName,
        series: 'all', createdAt: row.createdAt, updatedAt: row.updatedAt,
        racePoints: parseJson(row.racePoints, []), sprintPoints: parseJson(row.sprintPoints, []),
        qualifyingPoints: parseJson(row.qualifyingPoints, []), poleBonus: Number(row.poleBonus || 0),
        fastestLapBonus: Number(row.fastestLapBonus || 0), countBestRounds: row.countBestRounds
    }));
}

function configuredItems(rows, type) {
    return rows.map(row => {
        const configuration = parseJson(row.configuration, {});
        return {
            type, id: row.id, name: row.name, ownerName: row.ownerName,
            description: type === 'championships' ? row.description || '' : '',
            series: ['f2', 'f3', 'academy'].includes(configuration.series) ? configuration.series : 'f1',
            configuration, createdAt: row.createdAt, updatedAt: row.updatedAt
        };
    });
}

function filterItems(items, { type = 'all', series = 'all', query = '', sort = 'newest' } = {}) {
    const normalizedQuery = String(query).trim().toLocaleLowerCase();
    const filtered = items.filter(item => {
        if (type !== 'all' && item.type !== type) return false;
        if (series !== 'all' && item.series !== 'all' && item.series !== series) return false;
        if (!normalizedQuery) return true;
        const configuration = item.configuration || {};
        return [item.name, item.ownerName, item.description, configuration.pointsSystem?.name, configuration.category]
            .filter(Boolean).join(' ').toLocaleLowerCase().includes(normalizedQuery);
    });
    const time = field => value => new Date(value[field] || 0).getTime();
    const created = time('createdAt'), updated = time('updatedAt');
    filtered.sort(sort === 'name'
        ? (a, b) => a.name.localeCompare(b.name) || a.ownerName.localeCompare(b.ownerName)
        : sort === 'oldest' ? (a, b) => created(a) - created(b)
        : sort === 'updated' ? (a, b) => updated(b) - updated(a)
        : (a, b) => created(b) - created(a));
    return filtered;
}

module.exports = { configuredItems, filterItems, parseJson, pointItems };
