const assert = require('node:assert/strict');
const test = require('node:test');

const { findClassificationDocument, parseClassificationItems } = require('../scripts/fia-classification-pdf');

function item(str, x, y) { return { str, transform: [1, 0, 0, 1, x, y] }; }

test('finds final FIA classification PDFs inside the requested event only', () => {
  const html = [
    '<div class="event-title">Budapest</div>',
    '<a href="/budapest-race.pdf"><div class="field-name-title-field"><div class="field-item even">DOC 49 - 2026 Budapest Event - F2 Race 2 (Feature) final classification</div></div></a>',
    '<div class="event-title active">Monza</div>',
    '<a href="/monza-old.pdf"><div class="field-name-title-field"><div class="field-item even">DOC 52 - 2025 Monza Event - F2 Race 2 (Feature) - final classification</div></div></a>',
    '<a href="/monza-provisional.pdf"><div class="field-name-title-field"><div class="field-item even">DOC 54 - 2026 Monza Event - F2 Race 2 (Feature) - provisional classification</div></div></a>',
    '<a href="/monza-final.pdf"><div class="field-name-title-field"><div class="field-item even">DOC 77 - 2026 Monza Event - F2 Race 2 (Feature) - final classification</div></div></a>'
  ].join('');
  assert.equal(findClassificationDocument(html, 'monza', 'feature', 2026), 'https://www.fia.com/monza-final.pdf');
  assert.equal(findClassificationDocument(html, 'budapest', 'sprint'), null);
});

test('parses classified and retired drivers from an FIA race PDF table', () => {
  const items = [
    item('NO', 40.8, 100), item('DRIVER', 60.8, 100), item('NAT TEAM', 156, 100),
    item('LAPS', 303.4, 100), item('TIME', 339.2, 100), item('GAP', 384.8, 100),
    item('INT', 425, 100), item('KM/H', 458.2, 100), item('FASTEST', 494.7, 100),
    item('ON', 537, 100), item('PTS', 555.4, 100),
    item('1', 31.4, 90), item('2', 49.4, 90), item('Joshua DURKSEN', 60.8, 90),
    item('Invicta Racing', 174.1, 90), item('30', 307, 90), item('51:05.855', 333.5, 90),
    item('203.705', 454.9, 90), item('1:33.031', 494.8, 90), item('27', 537, 90), item('25', 557.6, 90),
    item('NOT CLASSIFIED', 274, 80),
    item('4', 49.4, 70), item('Colton HERTA', 60.8, 70), item('Hitech', 174.1, 70),
    item('10', 307, 70), item('16:47.533', 333.5, 70), item('DNF', 389.8, 70),
    item('205.884', 454.6, 70), item('1:34.205', 494.6, 70), item('5', 541.9, 70),
    item('OVERALL FASTEST LAP', 260, 60), item('1', 49.4, 50), item('Rafael CAMARA', 60.8, 50)
  ];
  assert.deepEqual(parseClassificationItems(items), [
    { Pos:'1', Nr:'2', Driver:'Joshua DURKSEN', Points:'25', Laps:'30', Time:'51:05.855', 'Gap first':'',
      'Best lap':'1:33.031', 'Best lap lap':'27', Kph:'203.705', Status:'CLA' },
    { Pos:'', Nr:'4', Driver:'Colton HERTA', Points:'', Laps:'10', Time:'16:47.533', 'Gap first':'DNF',
      'Best lap':'1:34.205', 'Best lap lap':'5', Kph:'205.884', Status:'DNF' }
  ]);
});

test('parses the alternate practice and qualifying column order', () => {
  const items = [
    item('NO DRIVER', 45.1, 100), item('NAT TEAM', 192.6, 100), item('TIME', 358.7, 100),
    item('LAPS', 395.4, 100), item('GAP', 425.5, 100), item('INT', 461, 100),
    item('KM/H', 491.3, 100), item('TIME OF DAY', 522, 100),
    item('1', 32.9, 90), item('15', 46.3, 90), item('Alexander DUNNE', 62.3, 90),
    item('Rodin Motorsport', 211.8, 90), item('1:31.957', 353.5, 90), item('10', 399, 90),
    item('226.788', 488.2, 90), item('10:24:54', 529.6, 90)
  ];
  assert.deepEqual(parseClassificationItems(items)[0], {
    Pos:'1', Nr:'15', Driver:'Alexander DUNNE', Points:'', Laps:'10', Time:'1:31.957', 'Gap first':'',
    'Best lap':'1:31.957', 'Best lap lap':'', Kph:'226.788', Status:'CLA'
  });

  const qualifying = [
    item('NO DRIVER', 45.1, 100), item('NAT TEAM', 175.5, 100), item('TIME', 326.8, 100),
    item('LAPS', 363.5, 100), item('%', 399, 100), item('GAP', 426.1, 100),
    item('INT', 461.8, 100), item('KM/H', 490.3, 100), item('TIME OF DAY', 522.6, 100),
    item('1', 32.9, 90), item('1', 50.9, 90), item('Rafael CAMARA', 62.3, 90),
    item('Invicta Racing', 194.5, 90), item('1:31.326', 321.6, 90), item('10', 367.1, 90),
    item('100.000', 385.8, 90), item('228.355', 487.7, 90), item('15:10:46', 529.1, 90)
  ];
  assert.equal(parseClassificationItems(qualifying)[0].Laps, '10');
});
