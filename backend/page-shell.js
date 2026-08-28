const fs = require('node:fs');
const path = require('node:path');

const shell = fs.readFileSync(path.join(__dirname, '../frontend/templates/page-shell.html'), 'utf8');

function attributes(match) {
    const value = String(match || '').trim();
    return value ? ` ${value}` : '';
}

function renderPageShell(document) {
    const htmlMatch = document.match(/<html([^>]*)>/i);
    const headMatch = document.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
    const bodyMatch = document.match(/<body([^>]*)>([\s\S]*?)<\/body>/i);
    if (!headMatch || !bodyMatch) return document;

    const head = headMatch[1]
        .replace(/\s*<meta\s+charset=["'][^"']+["'][^>]*>/gi, '')
        .replace(/\s*<meta\s+name=["']viewport["'][^>]*>/gi, '')
        .replace(/\s*<link\s+rel=["']stylesheet["']\s+href=["']\/css\/components\.css["'][^>]*>/gi, '')
        .trim();

    return shell
        .replace('{{htmlAttributes}}', attributes(htmlMatch?.[1]))
        .replace('{{bodyAttributes}}', attributes(bodyMatch[1]))
        .replace('{{head}}', head)
        .replace('{{body}}', bodyMatch[2].trim());
}

module.exports = { renderPageShell };
