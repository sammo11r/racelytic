const fs = require('node:fs/promises');
const path = require('node:path');
const { ANSWER_CATALOG } = require('../backend/ask-answer-catalog');
const { executeAskQuery } = require('../backend/ask-engine');
const { pool, withConnection } = require('../backend/route-helpers');

const outputPath = path.join(__dirname, '../backend/generated/ask-answers.json');

function validate(entry, result) {
    if (!result || typeof result.answer !== 'string' || result.answer.length < 20) {
        throw new Error(`${entry.path} did not produce a substantial answer.`);
    }
    if (!Array.isArray(result.record?.entries) || !result.record.entries.length) {
        throw new Error(`${entry.path} did not produce supporting record entries.`);
    }
}

async function generateAskAnswers() {
    const generatedAt = new Date().toISOString();
    const pages = await withConnection(async connection => {
        const rendered = [];
        for (const entry of ANSWER_CATALOG) {
            const result = await executeAskQuery(connection, entry.interpretation);
            validate(entry, result);
            rendered.push({ ...entry, result });
        }
        return rendered;
    });
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, `${JSON.stringify({ generatedAt, pages }, null, 2)}\n`, 'utf8');
    return { generatedAt, pages: pages.length, outputPath };
}

if (require.main === module) {
    generateAskAnswers()
        .then(summary => console.log(`Generated ${summary.pages} Ask answer pages at ${summary.outputPath}.`))
        .finally(() => pool.end());
}

module.exports = { generateAskAnswers, outputPath, validate };
