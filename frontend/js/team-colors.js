/* Constructor-aware chart colors. Base colors are brand-inspired rather than official assets. */
const CONSTRUCTOR_COLORS = {
  ferrari: '#e32636', mclaren: '#ff8700', mercedes: '#00a19c', 'red-bull': '#3154a4',
  williams: '#1678df', alpine: '#2878c8', 'aston-martin': '#006f62', haas: '#b6b8bd',
  sauber: '#52a332', 'alfa-romeo': '#9b0000', 'toro-rosso': '#3158a5', rb: '#4562cf',
  alphatauri: '#52677f', 'racing-point': '#e66aa5', 'force-india': '#ee7cac', renault: '#f4c300',
  lotus: '#145b35', 'lotus-f1': '#ba9b44', benetton: '#39a94b', jordan: '#e8c800',
  minardi: '#2e4057', tyrrell: '#2767b0', brabham: '#174b9b', ligier: '#2867c6',
  cooper: '#17633e', maserati: '#8c1f32', brawn: '#b6cf00', toyota: '#d71920',
  honda: '#d71920', bar: '#b7bac0', jaguar: '#1f6f43', arrows: '#e77817', prost: '#2c55a2',
  audi: '#d4e600', cadillac: '#b7aa8b', andretti: '#174b8f',
  stewart: '#f2f2f0', march: '#c83945', matra: '#3671b8', wolf: '#be9b45', shadow: '#2c2f35',
  'team-lotus': '#145b35', vanwall: '#1d6645', bugatti: '#4d78a8', porsche: '#a7a9ac'
};

const DRIVER_DASHES = ['', '9 5', '3 4', '12 4 3 4'];

function hashString(value) {
  let hash = 2166136261;
  for (const character of String(value || 'unknown')) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return hash >>> 0;
}

function hexToHsl(hex) {
  const value = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map(index => parseInt(value.slice(index, index + 2), 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min;
  let hue = 0;
  if (delta) hue = max === r ? ((g - b) / delta) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
  hue = (hue * 60 + 360) % 360;
  const lightness = (max + min) / 2;
  const saturation = delta ? delta / (1 - Math.abs(2 * lightness - 1)) : 0;
  return [hue, saturation * 100, lightness * 100];
}

function hslToHex(hue, saturation, lightness) {
  const s = saturation / 100, l = lightness / 100;
  const chroma = (1 - Math.abs(2 * l - 1)) * s;
  const x = chroma * (1 - Math.abs((hue / 60) % 2 - 1));
  const m = l - chroma / 2;
  const section = Math.floor(((hue % 360) + 360) % 360 / 60);
  const rgb = [[chroma,x,0],[x,chroma,0],[0,chroma,x],[0,x,chroma],[x,0,chroma],[chroma,0,x]][section];
  return `#${rgb.map(channel => Math.round((channel + m) * 255).toString(16).padStart(2, '0')).join('')}`;
}

function colorDistance(first, second) {
  const channels = color => [1, 3, 5].map(index => parseInt(color.slice(index, index + 2), 16));
  const a = channels(first), b = channels(second);
  return Math.sqrt(a.reduce((sum, value, index) => sum + (value - b[index]) ** 2, 0));
}

function primaryConstructor(driver) {
  const appearances = {};
  Object.values(driver.raceResults || {}).forEach(result => {
    [result.constructorId, result.sprintConstructorId].filter(Boolean).forEach(id => { appearances[id] = (appearances[id] || 0) + 1; });
  });
  return Object.entries(appearances).sort((a, b) => b[1] - a[1])[0]?.[0] || 'independent';
}

function baseConstructorColor(constructorId) {
  if (CONSTRUCTOR_COLORS[constructorId]) return CONSTRUCTOR_COLORS[constructorId];
  const hash = hashString(constructorId);
  return hslToHex(hash % 360, 58 + hash % 18, 42 + hash % 12);
}

function variantColor(base, teammateIndex) {
  if (!teammateIndex) return base;
  const [hue, saturation, lightness] = hexToHsl(base);
  const offsets = [[9, 7, -12], [-10, -3, 14], [18, -8, -20]];
  const [h, s, l] = offsets[(teammateIndex - 1) % offsets.length];
  return hslToHex(hue + h, Math.max(38, Math.min(92, saturation + s)), Math.max(28, Math.min(68, lightness + l)));
}

function assignDriverTeamStyles(drivers) {
  const teams = new Map();
  drivers.forEach(driver => {
    const constructorId = primaryConstructor(driver);
    if (!teams.has(constructorId)) teams.set(constructorId, []);
    teams.get(constructorId).push(driver);
  });
  const styles = new Map();
  const assignedColors = [];
  teams.forEach((teamDrivers, constructorId) => teamDrivers.forEach((driver, index) => {
    const base = baseConstructorColor(constructorId);
    let color = variantColor(base, index);
    let attempts = 0;
    while (assignedColors.some(existing => colorDistance(existing, color) < 46) && attempts < 5) {
      const [h, s, l] = hexToHsl(color);
      color = hslToHex(h + (attempts % 2 ? -8 : 8), s, l + (attempts % 2 ? 9 : -9));
      attempts += 1;
    }
    assignedColors.push(color);
    styles.set(String(driver.driverId), { color, baseColor: base, dash: DRIVER_DASHES[index % DRIVER_DASHES.length], constructorId, teammateIndex: index });
  }));
  return styles;
}
