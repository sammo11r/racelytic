const RESULTS_ORIGIN = 'https://results.formulae.fia.com';

let pdfjsPromise;

function normalized(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[øØ]/g, 'o').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function parseDelimited(text, separator = ';') {
  const rows = [];
  let row = [], value = '', quoted = false;
  const source = String(text || '').replace(/^\uFEFF/, '');
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (character === '"') {
      if (quoted && source[index + 1] === '"') { value += '"'; index += 1; }
      else quoted = !quoted;
    } else if (character === separator && !quoted) {
      row.push(value); value = '';
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && source[index + 1] === '\n') index += 1;
      row.push(value); value = '';
      if (row.some(cell => cell !== '')) rows.push(row);
      row = [];
    } else value += character;
  }
  if (value || row.length) { row.push(value); if (row.some(cell => cell !== '')) rows.push(row); }
  if (!rows.length) return [];
  const headers = rows.shift().map(header => header.trim());
  return rows.map(values => Object.fromEntries(headers.map((header, index) => [header, values[index] || ''])));
}

function timeMillis(value) {
  const text = String(value || '').trim();
  if (!/^\d+(?::\d+){0,2}(?:[.,]\d+)?$/.test(text)) return '';
  return Math.round(text.replace(',', '.').split(':').map(Number).reduce((total, part) => total * 60 + part, 0) * 1000);
}

function parseClassificationCsv(text) {
  return parseDelimited(text).filter(row => row.NUMBER && (row.DRIVER_SECONDNAME || row.DRIVER_FIRSTNAME)).map(row => ({
    positionNumber: /^\d+$/.test(row.POSITION) ? Number(row.POSITION) : '',
    driverNumber: String(row.NUMBER).replace(/\D/g, ''),
    status: row.STATUS || '',
    laps: /^\d+$/.test(row.LAPS) ? Number(row.LAPS) : '',
    time: row.TOTAL_TIME || '',
    gap: row.GAP_FIRST || '',
    fastestLapNumber: /^\d+$/.test(row.FL_LAPNUM) ? Number(row.FL_LAPNUM) : '',
    fastestLapTime: row.FL_TIME || '',
    fastestLapTimeMillis: timeMillis(row.FL_TIME),
    averageSpeed: row.FL_KPH ? Number(String(row.FL_KPH).replace(',', '.')) : '',
    teamName: row.TEAM || '', vehicle: row.VEHICLE || '',
    firstName: row.DRIVER_FIRSTNAME || '', lastName: row.DRIVER_SECONDNAME || '',
    name: `${row.DRIVER_FIRSTNAME || ''} ${row.DRIVER_SECONDNAME || ''}`.replace(/\s+/g, ' ').trim(),
    abbreviation: row.DRIVER_SHORTNAME || '', nationalityCode: row.DRIVER_COUNTRY || row.DRIVER_HOMETOWN || ''
  }));
}

function parseQualifyingCsv(text) {
  return parseDelimited(text).filter(row => (row.NUMBER || row.NO) && (row.DRIVER_SECONDNAME || row.DRIVER_FIRSTNAME)).map(row => ({
    positionNumber: /^\d+$/.test(row.POSITION || row.POS) ? Number(row.POSITION || row.POS) : '',
    driverNumber: String(row.NUMBER || row.NO).replace(/\D/g, ''),
    laps: /^\d+$/.test(String(row['LAPS'] || '').trim()) ? Number(row['LAPS']) : '',
    fastestLapNumber: /^\d+$/.test(String(row.LAP || '').trim()) ? Number(row.LAP) : '',
    time: row.TIME || row.FL_TIME || '', timeMillis: timeMillis(row.TIME || row.FL_TIME),
    gap: row.GAP_FIRST || '', averageSpeed: row.KPH ? Number(String(row.KPH).replace(',', '.')) : '',
    teamName: row.TEAM || '', vehicle: row.VEHICLE || '',
    firstName: row.DRIVER_FIRSTNAME || '', lastName: row.DRIVER_SECONDNAME || '',
    name: `${row.DRIVER_FIRSTNAME || ''} ${row.DRIVER_SECONDNAME || ''}`.replace(/\s+/g, ' ').trim(),
    abbreviation: row.DRIVER_SHORTNAME || '', nationalityCode: row.DRIVER_COUNTRY || row.DRIVER_HOMETOWN || ''
  }));
}

function apiIndexUrl(id) {
  const encoded = String(id || '').split('/').map(part => encodeURIComponent(part)).join('/');
  return `${RESULTS_ORIGIN}/api/getindex/${encoded}`;
}

async function fetchResponse(url, type = 'json') {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { accept: type === 'json' ? 'application/json' : '*/*',
        'user-agent': 'Racelytic Formula E official-data importer/1.0' } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      if (type === 'json') return response.json();
      if (type === 'buffer') return response.arrayBuffer();
      return response.text();
    } catch (error) {
      lastError = error;
      if (attempt < 3) await new Promise(resolve => setTimeout(resolve, attempt * 400));
    }
  }
  throw new Error(`${url}: ${lastError.message}`);
}

async function folderItems(id) {
  return (await fetchResponse(apiIndexUrl(id))).items || [];
}

function roundNumber(value) {
  const matches = [...String(value || '').matchAll(/(?:^|[\/_\s-])(?:R|ROUND\s*)0*(\d{1,2})(?=$|[\/_\s-])/gi)];
  return matches.length ? Number(matches.at(-1)[1]) : '';
}

async function findRaceClassification(folderId, depth = 0) {
  if (depth > 4) return null;
  const items = await folderItems(folderId);
  const file = items.find(item => String(item.extention).toLowerCase() === 'csv' && /classification[_\s-]*race/i.test(item.title));
  if (file) return file;
  const folders = items.filter(item => item.extention === 'catalog' &&
    /(?:^|\b)race(?:$|\b)|championship|round\s*\d/i.test(item.title) &&
    !/championship(?:s| standings)|practice|qualif|duel|test/i.test(item.title));
  for (const folder of folders) {
    const found = await findRaceClassification(folder.id, depth + 1);
    if (found) return found;
  }
  return null;
}

function qualifyingDocumentScore(item) {
  const title = String(item.title || '');
  if (String(item.extention).toLowerCase() !== 'csv' || !/classification/i.test(title)
      || !/super[_\s-]*pole|qualifying/i.test(title)) return -1;
  return 10 + (/amended|final/i.test(title) ? 8 : 0) + (/super[_\s-]*pole/i.test(title) ? 4 : 0) - (/group/i.test(title) ? 2 : 0);
}

async function findQualifyingClassification(folderId, depth = 0, allowGroups = false) {
  if (depth > 4) return null;
  const items = await folderItems(folderId);
  const file = items.filter(item => qualifyingDocumentScore(item) >= 0 && (allowGroups || !/group/i.test(item.title)))
    .sort((first, second) => qualifyingDocumentScore(second) - qualifyingDocumentScore(first))[0];
  if (file) return file;
  const folders = items.filter(item => item.extention === 'catalog' &&
    (/qualif|super\s*pole|round\s*\d/i.test(item.title) || /(?:abb\s+fia\s+)?formula\s+e\s+championship/i.test(item.title))
    && !/practice|race|test|duel/i.test(item.title) && (allowGroups || !/group/i.test(item.title)));
  for (const folder of folders) {
    const found = await findQualifyingClassification(folder.id, depth + 1, allowGroups);
    if (found) return found;
  }
  return null;
}

async function resultsSeasonFolder(seasonNumber) {
  const root = await folderItems('formula-e/files/results');
  return root.find(item => new RegExp(`\\bSeason ${seasonNumber}\\b`, 'i').test(item.title));
}

async function noticeboardSeasonFolder(seasonNumber) {
  const root = await folderItems('formula-e/files/noticeboard');
  return root.find(item => new RegExp(`\\bSeason ${seasonNumber}\\b`, 'i').test(item.title));
}

async function collectClassifications(seasonNumber) {
  const season = await resultsSeasonFolder(seasonNumber);
  if (!season) throw new Error(`Official results archive has no Formula E Season ${seasonNumber}.`);
  const eventFolders = (await folderItems(season.id)).filter(item => item.extention === 'catalog');
  const collected = [];
  for (const event of eventFolders) {
    const file = await findRaceClassification(event.id);
    if (!file) continue;
    const rows = parseClassificationCsv(await fetchResponse(new URL(file.url, RESULTS_ORIGIN).href, 'text'));
    const dateMatch = String(file.id).match(/\/(\d{8})\d{4}_[^/]*Race/i);
    if (rows.length) collected.push({
      round: roundNumber(`${event.id}/${file.id}`),
      date: dateMatch?.[1] || '', rows
    });
  }
  collected.sort((first, second) => first.date.localeCompare(second.date));
  const classifications = new Map(collected.map((item, index) => [item.round || index + 1, item.rows]));
  return classifications;
}

async function collectQualifyingClassifications(seasonNumber) {
  const season = await resultsSeasonFolder(seasonNumber);
  if (!season) throw new Error(`Official results archive has no Formula E Season ${seasonNumber}.`);
  const eventFolders = (await folderItems(season.id)).filter(item => item.extention === 'catalog');
  const collected = [];
  for (const event of eventFolders) {
    const file = await findQualifyingClassification(event.id, 0, Number(seasonNumber) <= 7);
    if (!file) continue;
    const rows = parseQualifyingCsv(await fetchResponse(new URL(file.url, RESULTS_ORIGIN).href, 'text'));
    const dateMatch = String(file.id).match(/\/(\d{8})\d{4}_[^/]*Qualifying/i);
    if (rows.length) collected.push({
      // Session folders frequently contain numbers (for example "Qualifying 2").
      // The event folder is the authoritative championship round identifier.
      round: roundNumber(event.id) || roundNumber(file.id), date: dateMatch?.[1] || '', rows
    });
  }
  collected.sort((first, second) => first.date.localeCompare(second.date));
  return new Map(collected.map((item, index) => [item.round || index + 1, item.rows]));
}

function archiveSessionCode(title) {
  const value = String(title || '').replace(/^\d{12}_/, '').trim();
  const practice = value.match(/(?:free|non qualifying)\s+practice(?:\s*(\d+))?/i);
  if (practice) return practice[1] ? `free-practice-${practice[1]}` : 'free-practice';
  if (/^race(?:\s*\d+)?$/i.test(value)) return 'race';
  if (/shakedown/i.test(value)) return 'shakedown';
  if (/qualifying/i.test(value)) return 'qualifying';
  return '';
}

async function collectSessionSchedule(seasonNumber) {
  const season = await resultsSeasonFolder(seasonNumber);
  if (!season) return new Map();
  const eventFolders = (await folderItems(season.id)).filter(item => item.extention === 'catalog');
  const collected = [];
  for (const event of eventFolders) {
    const eventItems = await folderItems(event.id);
    const championship = eventItems.find(item => item.extention === 'catalog' && /formula\s+e.*championship/i.test(item.title))
      || eventItems.find(item => item.extention === 'catalog' && /round\s*\d/i.test(item.title));
    if (!championship) continue;
    const sessions = new Map();
    for (const folder of (await folderItems(championship.id)).filter(item => item.extention === 'catalog')) {
      const basename = String(folder.id).split('/').at(-1);
      const match = basename.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})_(.+)$/);
      if (!match) continue;
      const code = archiveSessionCode(match[6]);
      if (!code) continue;
      const localDateTime = `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:00`;
      const current = sessions.get(code);
      if (!current || localDateTime < current.localDateTime) sessions.set(code, { code, localDateTime, title: match[6] });
    }
    if (sessions.size) collected.push({ round: roundNumber(event.id) || roundNumber(championship.id),
      first: [...sessions.values()].map(item => item.localDateTime).sort()[0], sessions: [...sessions.values()] });
  }
  collected.sort((a, b) => a.first.localeCompare(b.first));
  return new Map(collected.map((item, index) => [item.round || index + 1, item.sessions]));
}

async function pdfText(buffer) {
  pdfjsPromise ||= import('pdfjs-dist/legacy/build/pdf.mjs');
  const pdfjs = await pdfjsPromise;
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(buffer), useWorkerFetch: false,
    isEvalSupported: false, useSystemFonts: true });
  const document = await loadingTask.promise;
  const rows = [];
  try {
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const content = await (await document.getPage(pageNumber)).getTextContent();
      rows.push(...groupedPdfRows(content.items).map(row => row.text));
    }
  } finally { await loadingTask.destroy(); }
  return rows.join(' ');
}

async function parseCircuitMapPdf(buffer) {
  const text = (await pdfText(buffer)).replace(/(\d)\s*([.,])\s*(\d)/g, '$1$2$3');
  const length = text.match(/(?:track|circuit)\s+length\s*:?\s*([\d.,]+)\s*(km|m)\b/i);
  if (!length) return { lengthMeters: '', turns: '', direction: '' };
  const amount = Number(length[1].replace(',', '.'));
  // Several official maps label kilometre decimals with "m" (for example 3.051m).
  // A circuit-scale value below 20 is necessarily kilometres.
  return { lengthMeters: Math.round(amount * (length[2].toLowerCase() === 'km' || amount < 20 ? 1000 : 1)), turns: '', direction: '' };
}

async function collectCircuitDocuments(seasonNumber) {
  const season = await resultsSeasonFolder(seasonNumber);
  if (!season) return new Map();
  const eventFolders = (await folderItems(season.id)).filter(item => item.extention === 'catalog');
  const documents = new Map();
  for (const event of eventFolders) {
    const information = (await folderItems(event.id)).find(item => item.extention === 'catalog' && /event information/i.test(item.title));
    if (!information) continue;
    const candidates = (await folderItems(information.id)).filter(item => String(item.extention).toLowerCase() === 'pdf' && /circuit\s*map/i.test(item.title));
    const file = candidates.sort((a, b) => String(b.title).localeCompare(String(a.title), undefined, { numeric: true }))[0];
    if (!file) continue;
    const url = new URL(file.url, RESULTS_ORIGIN).href;
    const metadata = await parseCircuitMapPdf(await fetchResponse(url, 'buffer'));
    const round = roundNumber(event.id);
    if (round) documents.set(round, { ...metadata, layoutUrl: url });
  }
  return documents;
}

function groupedPdfRows(items) {
  const groups = [];
  for (const item of items || []) {
    if (!item?.str?.trim() || !Array.isArray(item.transform)) continue;
    const y = Number(item.transform[5]);
    let group = groups.find(candidate => Math.abs(candidate.y - y) <= 1.25);
    if (!group) { group = { y, items: [] }; groups.push(group); }
    group.items.push({ x: Number(item.transform[4]), text: item.str.trim() });
  }
  return groups.sort((first, second) => second.y - first.y).map(group => {
    group.items.sort((first, second) => first.x - second.x);
    return { ...group, text: group.items.map(item => item.text).join(' ') };
  });
}

async function parseEntryListPdf(buffer) {
  pdfjsPromise ||= import('pdfjs-dist/legacy/build/pdf.mjs');
  const pdfjs = await pdfjsPromise;
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(buffer), useWorkerFetch: false,
    isEvalSupported: false, useSystemFonts: true });
  const document = await loadingTask.promise;
  const entries = [];
  try {
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const content = await (await document.getPage(pageNumber)).getTextContent();
      for (const row of groupedPdfRows(content.items)) {
        const match = row.text.match(/^\s*(\d+)\s+(.+?)\s+\(([A-Z]{2,3})\)(?:\s+|$)/);
        if (!match || /^(?:POS|NO|Nº)$/i.test(match[2])) continue;
        entries.push({ driverNumber: match[1], teamName: match[2].trim(), teamNationalityCode: match[3] });
      }
    }
  } finally { await loadingTask.destroy(); }
  return entries;
}

function entryDocumentScore(item) {
  const title = String(item.title || '');
  if (!/entry\s*list/i.test(title) || String(item.extention).toLowerCase() !== 'pdf') return -1;
  return (/amended/i.test(title) ? 8 : 0) + (/official|final/i.test(title) ? 4 : 0) - (/provisional/i.test(title) ? 2 : 0);
}

async function collectTeamNationalities(seasonNumber) {
  const season = await noticeboardSeasonFolder(seasonNumber);
  if (!season) return [];
  const eventFolders = (await folderItems(season.id)).filter(item => item.extention === 'catalog');
  const firstRound = eventFolders.find(item => /^01_/i.test(String(item.id).split('/').at(-1))) || eventFolders.at(-1);
  if (!firstRound) return [];
  const candidates = (await folderItems(firstRound.id)).filter(item => entryDocumentScore(item) >= 0)
    .sort((first, second) => entryDocumentScore(second) - entryDocumentScore(first));
  if (!candidates.length) return [];
  const buffer = await fetchResponse(new URL(candidates[0].url, RESULTS_ORIGIN).href, 'buffer');
  return parseEntryListPdf(buffer);
}

async function collectOfficialSeasonData(seasonNumber) {
  const [classifications, qualifying, entries, schedule, circuits] = await Promise.all([
    collectClassifications(seasonNumber), collectQualifyingClassifications(seasonNumber), collectTeamNationalities(seasonNumber),
    collectSessionSchedule(seasonNumber), collectCircuitDocuments(seasonNumber)
  ]);
  const countryByNumber = new Map(entries.map(entry => [entry.driverNumber, entry.teamNationalityCode]));
  const countryByTeam = new Map(entries.map(entry => [normalized(entry.teamName), entry.teamNationalityCode]));
  for (const rows of classifications.values()) {
    for (const row of rows) row.teamNationalityCode = countryByNumber.get(row.driverNumber) || countryByTeam.get(normalized(row.teamName)) || '';
  }
  return { classifications, qualifying, entries, schedule, circuits };
}

module.exports = { archiveSessionCode, collectCircuitDocuments, collectClassifications, collectOfficialSeasonData,
  collectQualifyingClassifications, collectSessionSchedule, collectTeamNationalities, findQualifyingClassification, groupedPdfRows,
  normalized, parseClassificationCsv, parseDelimited, parseEntryListPdf, parseQualifyingCsv, roundNumber, timeMillis };
