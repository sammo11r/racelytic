const DECISION_DOCUMENTS_URL = 'https://www.fia.com/documents/championship/championships/formula-2-championship-44';
const F3_DECISION_DOCUMENTS_URL = 'https://www.fia.com/documents/championships/fia-formula-3-championship-1012';

let pdfjsPromise;

function decodeHtml(value) {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)));
}

function plainText(value) {
  return decodeHtml(String(value || '').replace(/<[^>]+>/g, ' '))
    .replace(/[\u2010-\u2015]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalized(value) {
  return plainText(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]/g, '');
}

function documentTitlePattern(kind, series = 'f2') {
  const label = String(series).toUpperCase();
  if (!['F2', 'F3'].includes(label)) throw new Error(`Unsupported FIA classification series: ${series}`);
  if (kind === 'practice') return new RegExp(`\\b${label} Practice - classification\\b`, 'i');
  if (kind === 'qualifying') return new RegExp(`\\b${label} Qualifying(?: - Group [A-Z])? - final classification\\b`, 'i');
  if (kind === 'sprint') return new RegExp(`\\b${label} Race 1(?: \\(Sprint\\))? - final classification\\b`, 'i');
  if (kind === 'feature') return new RegExp(`\\b${label} Race 2(?: \\(Feature\\))? - final classification\\b`, 'i');
  throw new Error(`Unknown FIA classification document kind: ${kind}`);
}

function findClassificationDocuments(html, eventName, kind, year, series = 'f2') {
  const source = String(html || '');
  const eventMatches = [...source.matchAll(/<div class="event-title[^"]*">\s*([^<]+?)\s*<\/div>/gi)];
  const eventKey = normalized(eventName);
  const eventIndex = eventMatches.findIndex(match => normalized(match[1]) === eventKey);
  if (eventIndex < 0) return [];
  const start = eventMatches[eventIndex].index;
  const end = eventMatches[eventIndex + 1]?.index ?? source.length;
  const block = source.slice(start, end);
  const titlePattern = documentTitlePattern(kind, series);
  const documents = [];
  for (const anchor of block.matchAll(/<a\s+href="([^"]+\.pdf[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi)) {
    const titleMatch = anchor[2].match(/field-name-title-field[\s\S]*?<div class="field-item even">([\s\S]*?)<\/div>/i);
    const title = plainText(titleMatch?.[1] || anchor[2]);
    if (year && !new RegExp(`\\b${year}\\b`).test(title)) continue;
    if (titlePattern.test(title)) documents.push({
      title,
      url: new URL(decodeHtml(anchor[1]), 'https://www.fia.com').href
    });
  }
  return documents.sort((first, second) => {
    const firstGroup = first.title.match(/\bGroup ([A-Z])\b/i)?.[1] || '';
    const secondGroup = second.title.match(/\bGroup ([A-Z])\b/i)?.[1] || '';
    return firstGroup.localeCompare(secondGroup);
  });
}

function findClassificationDocument(html, eventName, kind, year, series = 'f2') {
  return findClassificationDocuments(html, eventName, kind, year, series)[0]?.url || null;
}

function groupedTextRows(items) {
  const groups = new Map();
  for (const item of items || []) {
    if (!item?.str?.trim() || !Array.isArray(item.transform)) continue;
    const y = Math.round(Number(item.transform[5]) * 2) / 2;
    if (!groups.has(y)) groups.set(y, []);
    groups.get(y).push({ text: item.str.trim(), x: Number(item.transform[4]) });
  }
  return [...groups.entries()].sort((first, second) => second[0] - first[0])
    .map(([y, rowItems]) => {
      rowItems.sort((first, second) => first.x - second.x);
      return { y, items: rowItems, text: rowItems.map(item => item.text).join(' ') };
    });
}

function headerColumns(items) {
  const supported = new Set(['LAPS', 'TIME', '%', 'GAP', 'INT', 'KM/H', 'FASTEST', 'ON', 'PTS', 'TIME OF DAY']);
  return items.map(item => ({ ...item, label: item.text.trim().toUpperCase() }))
    .filter(item => supported.has(item.label));
}

function closestColumn(columns, x) {
  return columns.reduce((closest, column) => !closest || Math.abs(column.x - x) < Math.abs(closest.x - x)
    ? column : closest, null);
}

function parseClassificationItems(items) {
  const rows = groupedTextRows(items);
  const headerIndex = rows.findIndex(row => /\bDRIVER\b/i.test(row.text) && /\bTEAM\b/i.test(row.text));
  if (headerIndex < 0) return [];
  const columns = headerColumns(rows[headerIndex].items);
  if (!columns.some(column => column.label === 'TIME') || !columns.some(column => column.label === 'LAPS')) return [];
  const firstDataX = Math.min(...columns.map(column => column.x)) - 16;
  const lastDataX = Math.max(...columns.map(column => column.x)) + 16;
  const parsed = [];
  let sectionStatus = '';
  for (const row of rows.slice(headerIndex + 1)) {
    if (/OVERALL FASTEST LAP|FASTEST LAP ELIGIBLE|PENALTIES/i.test(row.text)) break;
    if (/DID NOT START/i.test(row.text)) { sectionStatus = 'DNS'; continue; }
    if (/DISQUALIFIED/i.test(row.text)) { sectionStatus = 'DSQ'; continue; }
    if (/NOT CLASSIFIED/i.test(row.text)) { sectionStatus = 'NC'; continue; }
    const identifiers = row.items.filter(item => item.x < 60 && /^\d+$/.test(item.text));
    if (!identifiers.length || !row.items.some(item => item.x >= 60 && item.x < firstDataX)) continue;
    const positionItem = identifiers.find(item => item.x < 40);
    const numberItem = identifiers.find(item => item !== positionItem && item.x >= 40)
      || (!positionItem ? identifiers[0] : null);
    if (!numberItem) continue;
    const values = {};
    const driver = row.items.find(item => item.x >= 60 && item.x < firstDataX && !/^\*+$/.test(item.text))?.text || '';
    for (const item of row.items.filter(candidate => candidate.x >= firstDataX && candidate.x <= lastDataX)) {
      const column = closestColumn(columns, item.x);
      if (column) values[column.label] = item.text;
    }
    const position = positionItem?.text || '';
    const gap = values.GAP || '';
    parsed.push({
      Pos: position,
      Nr: numberItem.text,
      Driver: driver,
      Points: values.PTS || '',
      Laps: values.LAPS || '',
      Time: values.TIME || '',
      'Gap first': gap,
      'Best lap': values.FASTEST || values.TIME || '',
      'Best lap lap': values.ON || '',
      Kph: values['KM/H'] || '',
      Status: position ? 'CLA' : (gap || sectionStatus || 'NC').toUpperCase()
    });
  }
  return parsed;
}

async function parseClassificationPdf(buffer) {
  pdfjsPromise ||= import('pdfjs-dist/legacy/build/pdf.mjs');
  const pdfjs = await pdfjsPromise;
  const bytes = buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : Uint8Array.from(buffer);
  const loadingTask = pdfjs.getDocument({ data: bytes, useWorkerFetch: false,
    isEvalSupported: false, useSystemFonts: true });
  const document = await loadingTask.promise;
  const rows = [];
  try {
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      rows.push(...parseClassificationItems(content.items));
    }
  } finally {
    await loadingTask.destroy();
  }
  if (!rows.length) throw new Error('The official FIA PDF contains no readable classification table.');
  return rows;
}

async function fetchClassificationPdf(url) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { accept: 'application/pdf',
        'user-agent': 'Racelytic FIA classification importer/1.0' } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const buffer = await response.arrayBuffer();
      const signature = Buffer.from(buffer.slice(0, 5)).toString('ascii');
      if (signature !== '%PDF-') throw new Error('response is not a PDF');
      return parseClassificationPdf(buffer);
    } catch (error) {
      lastError = error;
      if (attempt < 3) await new Promise(resolve => setTimeout(resolve, attempt * 500));
    }
  }
  throw new Error(`${url}: ${lastError.message}`);
}

module.exports = { DECISION_DOCUMENTS_URL, F3_DECISION_DOCUMENTS_URL, fetchClassificationPdf,
  findClassificationDocument, findClassificationDocuments, parseClassificationItems, parseClassificationPdf };
