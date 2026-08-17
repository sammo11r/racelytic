function optionalInteger(value, { min, max } = {}) {
    if (value === undefined || value === null || value === '') return null;
    const number = Number(value);
    if (!Number.isInteger(number)) return null;
    if (min !== undefined && number < min) return null;
    if (max !== undefined && number > max) return null;
    return number;
}

function integerOrDefault(value, fallback, options) {
    return optionalInteger(value, options) ?? fallback;
}

module.exports = { optionalInteger, integerOrDefault };
