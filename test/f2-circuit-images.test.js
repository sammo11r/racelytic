const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { F2_CIRCUIT_IMAGE_IDS } = require('../frontend/js/f2-circuit-images');

test('every Formula 2 circuit has a valid track-map asset', () => {
  const circuitIds = fs.readFileSync(path.join(__dirname, '../data/f2db-circuits.csv'), 'utf8')
    .trim().split(/\r?\n/).slice(1)
    .map(row => row.slice(0, row.indexOf(',')));

  circuitIds.forEach(circuitId => {
    const imageId = F2_CIRCUIT_IMAGE_IDS[circuitId];
    assert.ok(imageId, `Missing track-map mapping for ${circuitId}`);
    assert.ok(
      fs.existsSync(path.join(__dirname, `../frontend/assets/circuits/${imageId}.svg`)),
      `Missing track-map asset for ${circuitId}: ${imageId}.svg`
    );
  });
});
