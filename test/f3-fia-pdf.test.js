const assert = require('node:assert/strict');
const test = require('node:test');

const { findClassificationDocuments } = require('../scripts/fia-classification-pdf');
const { driverIdForClassification, mergeGroupedQualifying,
  newDriverFromClassification } = require('../scripts/import-f3-2026-fia');

test('finds both final F3 qualifying groups and ignores provisional documents', () => {
  const html = [
    '<div class="event-title active">Monza</div>',
    '<a href="/group-b-provisional.pdf"><div class="field-name-title-field"><div class="field-item even">DOC 25 - 2026 Monza Event - F3 Qualifying - Group B - Provisional classification</div></div></a>',
    '<a href="/group-b-final.pdf"><div class="field-name-title-field"><div class="field-item even">DOC 44 - 2026 Monza Event - F3 Qualifying - Group B - Final Classification</div></div></a>',
    '<a href="/group-a-final.pdf"><div class="field-name-title-field"><div class="field-item even">DOC 43 - 2026 Monza Event - F3 Qualifying - Group A - Final Classification</div></div></a>'
  ].join('');
  assert.deepEqual(
    findClassificationDocuments(html, 'monza', 'qualifying', 2026, 'f3').map(document => document.url),
    ['https://www.fia.com/group-a-final.pdf', 'https://www.fia.com/group-b-final.pdf']
  );
});

test('maps full and initialled FIA driver names to the correct F3 identity', () => {
  const drivers = [
    { id: 'ricardo-escotto', firstName: 'Ricardo', lastName: 'Escotto' },
    { id: 'nandhavud-bhirombhakdi', firstName: 'Nandhavud', lastName: 'Bhirombhakdi' }
  ];
  assert.equal(driverIdForClassification('Ricardo ESCOTTO', drivers), 'ricardo-escotto');
  assert.equal(driverIdForClassification('N. BHIROMBHAKDI', drivers), 'nandhavud-bhirombhakdi');
});

test('creates a stable minimal driver record for a new full FIA classification name', () => {
  assert.deepEqual(newDriverFromClassification('Alex POWELL', []), {
    id: 'alex-powell', name: 'Alex Powell', firstName: 'Alex', lastName: 'Powell',
    abbreviation: 'POW', countryCode: 'us', pictureUrl: ''
  });
  assert.equal(newDriverFromClassification('N. BHIROMBHAKDI', []), null);
});

test('maps shortened FIA names to established database identities', () => {
  const drivers = [
    { id: 'wing-lam-gerrard-xie', firstName: 'Wing Lam Gerrard', lastName: 'Xie' },
    { id: 'michael-shin', firstName: 'Michael', lastName: 'Shin' }
  ];
  assert.equal(driverIdForClassification('Gerrard XIE', drivers), 'wing-lam-gerrard-xie');
  assert.equal(driverIdForClassification('Woohyun SHIN', drivers), 'michael-shin');
});

test('combines split qualifying by alternating the fastest group and retaining non-classified drivers', () => {
  const rows = mergeGroupedQualifying([
    { title: 'Group A', rows: [
      { Pos: '1', Nr: '12', Time: '1:38.163', Status: 'CLA' },
      { Pos: '2', Nr: '10', Time: '1:38.222', Status: 'CLA' },
      { Pos: '', Nr: '6', Time: '', Status: 'DSQ' }
    ] },
    { title: 'Group B', rows: [
      { Pos: '1', Nr: '5', Time: '1:38.114', Status: 'CLA' },
      { Pos: '2', Nr: '29', Time: '1:38.350', Status: 'CLA' },
      { Pos: '', Nr: '1', Time: '', Status: 'NC' }
    ] }
  ]);
  assert.deepEqual(rows.map(row => [row.Pos, row.Nr, row.Status]), [
    ['1', '5', 'CLA'], ['2', '12', 'CLA'], ['3', '29', 'CLA'], ['4', '10', 'CLA'],
    ['', '1', 'NC'], ['', '6', 'DSQ']
  ]);
});
