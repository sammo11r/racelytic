function teammateEvents(events) {
    const output = [];
    for (const event of events || []) {
        const teams = new Map();
        for (const participant of event.participants || []) {
            const constructorName = String(participant.constructorName || '').trim();
            if (!constructorName) continue;
            if (!teams.has(constructorName)) teams.set(constructorName, []);
            teams.get(constructorName).push(participant);
        }
        for (const [constructorName, participants] of teams) {
            if (participants.length < 2) continue;
            output.push({
                ...event,
                id: `${event.id}:team:${encodeURIComponent(constructorName)}`,
                sourceEventId: String(event.id),
                constructorName,
                participants
            });
        }
    }
    return output;
}

module.exports = { teammateEvents };
