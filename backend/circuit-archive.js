const { f2CircuitImageId } = require('../frontend/js/f2-circuit-images');

function juniorCircuitArchiveRow(row, layouts) {
    // The existing Valencia image mapping refers to a different venue; do not borrow its map or name.
    const layoutId = row.id === 'valencia' ? null : f2CircuitImageId(row.id);
    const canonical = layouts.get(layoutId);
    const location = String(row.placeName || '').split(',').map(part => part.trim()).filter(Boolean);
    const countryName = location.length > 1 ? location.pop() : canonical?.countryName || '';
    if (location.length === 1 && location[0] === countryName) location.pop();
    const type = String(row.type || '').trim().toUpperCase().replace(/ CIRCUIT$/, '');
    return {
        ...row,
        shortName: canonical?.name || row.name,
        fullName: row.name,
        previousNames: canonical?.previousNames || '',
        placeName: location.join(', '),
        countryName,
        countryId: countryName.toLowerCase().replace(/\s+/g, '-'),
        type,
        length: Number(row.lengthMeters) > 0 ? Number(row.lengthMeters) / 1000 : null,
        layoutId,
        seasons: String(row.calendarYears || '').split(',').map(Number).filter(year => year > 0),
        currentSeason: Number(row.currentSeason) || null,
        totalRacesHeld: Number(row.recordedRacesHeld) || 0
    };
}

module.exports = { juniorCircuitArchiveRow };
