const fs = require('node:fs');
const path = require('node:path');

const files = ['frontend/css/style.css', 'frontend/css/polish.css'];

function matchingBrace(source, open) {
    let depth = 0;
    let quote = '';
    let comment = false;
    for (let index = open; index < source.length; index++) {
        const character = source[index];
        const next = source[index + 1];
        if (comment) {
            if (character === '*' && next === '/') { comment = false; index++; }
            continue;
        }
        if (!quote && character === '/' && next === '*') { comment = true; index++; continue; }
        if (quote) {
            if (character === '\\') index++;
            else if (character === quote) quote = '';
            continue;
        }
        if (character === '"' || character === "'") { quote = character; continue; }
        if (character === '{') depth++;
        if (character === '}' && --depth === 0) return index;
    }
    throw new Error('Unbalanced CSS braces.');
}

function consolidate(source) {
    const rules = [];
    let cursor = 0;
    while (cursor < source.length) {
        const open = source.indexOf('{', cursor);
        if (open < 0) break;
        const close = matchingBrace(source, open);
        const rawHeader = source.slice(cursor, open);
        const header = rawHeader.replace(/\/\*[\s\S]*?\*\//g, '').trim();
        const body = source.slice(open + 1, close);
        if (header && !header.startsWith('@') && !body.includes('{')) {
            const key = `${header.replace(/\s+/g, ' ')}{${body.replace(/\s+/g, ' ').trim()}}`;
            rules.push({ start: cursor, end: close + 1, key });
        }
        cursor = close + 1;
    }

    const seen = new Set();
    const removals = [];
    for (let index = rules.length - 1; index >= 0; index--) {
        if (seen.has(rules[index].key)) removals.push(rules[index]);
        else seen.add(rules[index].key);
    }
    return removals.sort((a, b) => b.start - a.start)
        .reduce((result, range) => result.slice(0, range.start) + result.slice(range.end), source)
        .replace(/\n{4,}/g, '\n\n\n');
}

function run({ check = false } = {}) {
    let changed = 0;
    for (const relative of files) {
        const file = path.resolve(__dirname, '..', relative);
        const source = fs.readFileSync(file, 'utf8');
        const output = consolidate(source);
        if (output === source) continue;
        changed++;
        if (!check) fs.writeFileSync(file, output);
    }
    if (check && changed) throw new Error(`${changed} stylesheet(s) contain exact duplicate top-level rules. Run npm run consolidate:css.`);
    console.log(check ? 'Verified CSS contains no exact duplicate top-level rules.' : `Consolidated ${changed} stylesheet(s).`);
}

if (require.main === module) {
    try { run({ check: process.argv.includes('--check') }); }
    catch (error) { console.error(error.message); process.exitCode = 1; }
}

module.exports = { consolidate, run };
