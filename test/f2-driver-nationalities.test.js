const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const csv = require('csv-parser');

function readF2Drivers() {
  return new Promise((resolve, reject) => {
    const rows = [];
    fs.createReadStream(path.join(__dirname, '../data/f2db-drivers.csv'))
      .pipe(csv())
      .on('data', row => rows.push(row))
      .on('end', () => resolve(rows))
      .on('error', reject);
  });
}

function readF2Constructors() {
  return new Promise((resolve, reject) => {
    const rows = [];
    fs.createReadStream(path.join(__dirname, '../data/f2db-constructors.csv'))
      .pipe(csv())
      .on('data', row => rows.push(row))
      .on('end', () => resolve(rows))
      .on('error', reject);
  });
}

test('every Formula 2 driver has a valid nationality code', async () => {
  const drivers = await readF2Drivers();
  const invalid = drivers
    .filter(driver => !/^[a-z]{2}$/.test(String(driver.countryCode || '')))
    .map(driver => `${driver.name} (${driver.countryCode || 'missing'})`);

  assert.deepEqual(invalid, []);
});

test('every Formula 2 driver nationality has a flag asset', async () => {
  const drivers = await readF2Drivers();
  const flagDirectory = path.join(__dirname, '../frontend/assets/flags');
  const missing = drivers
    .filter(driver => !fs.existsSync(path.join(flagDirectory, `${driver.countryCode}.svg`)))
    .map(driver => `${driver.name} (${driver.countryCode})`);

  assert.deepEqual(missing, []);
});

test('every Formula 2 constructor has a valid nationality and flag asset', async () => {
  const constructors = await readF2Constructors();
  const flagDirectory = path.join(__dirname, '../frontend/assets/flags');
  const invalid = constructors
    .filter(constructor => !/^[a-z]{2}$/.test(String(constructor.countryCode || '')) ||
      !fs.existsSync(path.join(flagDirectory, `${constructor.countryCode}.svg`)))
    .map(constructor => `${constructor.name} (${constructor.countryCode || 'missing'})`);

  assert.deepEqual(invalid, []);
});
