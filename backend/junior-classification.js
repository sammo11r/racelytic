function juniorClassificationPosition(value) {
    const position = Number(value);
    return Number.isInteger(position) && position > 0 && position < 999 ? position : null;
}

function juniorClassificationStatus(status, value, isRace = false) {
    const text = String(status || '').trim();
    if (Number(value) >= 999) {
        // 999 is the feed's unclassified/retired marker, not a finishing place.
        // Generic "CLA" must not override it; keep explicit DNS/DSQ/RET statuses.
        if (text && !/^(CLA|CLASSIFIED|FINISHED|RUNNING)$/i.test(text)) return text;
        return Number(value) === 999 && isRace ? 'DNF' : 'NC';
    }
    return text || null;
}

function juniorClassificationTime(value) {
    const text = String(value ?? '').trim();
    return !text || /^(CLA|CLASSIFIED|FINISHED|RUNNING)$/i.test(text) ? null : text;
}

module.exports = { juniorClassificationPosition, juniorClassificationStatus, juniorClassificationTime };
