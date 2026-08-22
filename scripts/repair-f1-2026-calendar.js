const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../data');
const racesPath = path.join(DATA_DIR, 'f1db-races.csv');
const circuitsPath = path.join(DATA_DIR, 'f1db-circuits.csv');
const grandsPrixPath = path.join(DATA_DIR, 'f1db-grands-prix.csv');

const sepangRace = '1172,2026,16,"2026-10-04",,"bahrain","Formula 1 Gulf Air Bahrain Grand Prix in Malaysia 2026","KNOCKOUT",,"sepang","sepang-1","RACE","CLOCKWISE",5.543,15,56,310.408,,,false,false,,,,,,,,,,,,,,,,,,,,,,,,,,';

function repairRaces(content) {
  const lines = content.trimEnd().split(/\r?\n/);
  const hasSepang = lines.some(line => /^\d+,2026,\d+,.*,"sepang","sepang-1",/.test(line));
  if (!hasSepang) {
    for (let index = 0; index < lines.length; index += 1) {
      const match = lines[index].match(/^(\d+),2026,(\d+),/);
      if (match && Number(match[2]) >= 16) {
        lines[index] = lines[index].replace(
          new RegExp(`^${match[1]},2026,${match[2]},`),
          `${match[1]},2026,${Number(match[2]) + 1},`
        );
      }
    }
    lines.push(sepangRace);
  }
  return `${lines.join('\n')}\n`;
}

function updateHeldCount(content, id, expectedPrevious, next) {
  const expression = new RegExp(`^("${id}"[^\\r\\n]*,)${expectedPrevious}$`, 'm');
  if (expression.test(content)) return content.replace(expression, `$1${next}`);
  if (new RegExp(`^("${id}"[^\\r\\n]*,)${next}$`, 'm').test(content)) return content;
  throw new Error(`Could not update ${id} totalRacesHeld from ${expectedPrevious} to ${next}.`);
}

fs.writeFileSync(racesPath, repairRaces(fs.readFileSync(racesPath, 'utf8')));
fs.writeFileSync(circuitsPath, updateHeldCount(fs.readFileSync(circuitsPath, 'utf8'), 'sepang', 19, 20));
fs.writeFileSync(grandsPrixPath, updateHeldCount(fs.readFileSync(grandsPrixPath, 'utf8'), 'bahrain', 21, 22));
console.log('F1 2026 calendar now includes the Bahrain Grand Prix at Sepang as round 16.');
