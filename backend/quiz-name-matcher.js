function normalizedName(value) {
    return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLocaleLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function nameMatchesGuess(driverName, guess) {
    const normalizedDriverName = normalizedName(driverName);
    const normalizedGuess = normalizedName(guess);
    const nameParts = normalizedDriverName.split(' ');
    const surnameParticles = new Set(['da', 'de', 'del', 'della', 'di', 'du', 'la', 'le', 'van', 'von']);
    let surnameStart = nameParts.length - 1;
    while (surnameStart > 0 && surnameParticles.has(nameParts[surnameStart - 1])) surnameStart -= 1;
    const compoundSurname = nameParts.slice(surnameStart).join(' ');
    return normalizedGuess === normalizedDriverName
        || normalizedGuess === nameParts.at(-1)
        || normalizedGuess === compoundSurname;
}

function matchingChampionAnswers(rows, guess) {
    return rows.filter(row => nameMatchesGuess(row.driverName, guess)).map(row => ({
        year: Number(row.year),
        driverName: row.driverName
    }));
}

function constructorMatchesGuess(constructorName, guess) {
    const normalizedConstructor = normalizedName(constructorName);
    const normalizedGuess = normalizedName(guess);
    const simplify = value => value.replace(/\b(scuderia|formula one|formula 1|f1|racing|team|grand prix)\b/g, ' ').replace(/\s+/g, ' ').trim();
    return normalizedGuess === normalizedConstructor || simplify(normalizedGuess) === simplify(normalizedConstructor);
}

module.exports = { normalizedName, nameMatchesGuess, matchingChampionAnswers, constructorMatchesGuess };
