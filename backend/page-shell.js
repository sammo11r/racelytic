const fs = require('node:fs');
const path = require('node:path');

const shell = fs.readFileSync(path.join(__dirname, '../frontend/templates/page-shell.html'), 'utf8');
const header = fs.readFileSync(path.join(__dirname, '../frontend/components/header.html'), 'utf8').trim();
const footer = fs.readFileSync(path.join(__dirname, '../frontend/components/footer.html'), 'utf8').trim();

const EMPTY_HEADER = /\s*<div\s+id=["']header["']\s*>\s*<\/div>\s*/i;
const FALLBACK_FOOTER = /\s*<footer\b[^>]*class=["'][^"']*\bfooter\b[^"']*["'][^>]*>[\s\S]*?<\/footer>\s*/i;

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

    const renderedHeader = `<div id="header">\n${header}\n</div>`;
    const renderedFooter = `<footer class="footer">\n${footer.replace('{{year}}', String(new Date().getFullYear()))}\n</footer>`;
    const sourceBody = bodyMatch[2];
    const bodyWithHeader = EMPTY_HEADER.test(sourceBody)
        ? sourceBody.replace(EMPTY_HEADER, `\n${renderedHeader}\n`)
        : `${renderedHeader}\n${sourceBody}`;
    const body = (FALLBACK_FOOTER.test(bodyWithHeader)
        ? bodyWithHeader.replace(FALLBACK_FOOTER, `\n${renderedFooter}\n`)
        : `${bodyWithHeader}\n${renderedFooter}`).trim();

    return shell
        .replace('{{htmlAttributes}}', attributes(htmlMatch?.[1]))
        .replace('{{bodyAttributes}}', attributes(bodyMatch[1]))
        .replace('{{head}}', head)
        .replace('{{body}}', body);
}

module.exports = { renderPageShell };
