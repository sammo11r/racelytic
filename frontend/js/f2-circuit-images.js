const F2_CIRCUIT_IMAGE_IDS = Object.freeze({
  'bahrain-international-circuit_bahrain-international-circuit': 'bahrain-1',
  'circuit-de-barcelona-catalunya_circuit-de-barcelona-catalunya': 'catalunya-6',
  'circuit-de-monaco_circuit-de-monaco': 'monaco-6',
  'baku-city-circuit_baku-city-circuit': 'baku-1',
  'red-bull-ring_red-bull-ring': 'spielberg-3',
  'silverstone-circuit_silverstone-circuit': 'silverstone-8',
  'hungaroring_hungaroring': 'hungaroring-3',
  'circuit-de-spa-francorchamps_circuit-de-spa-francorchamps': 'spa-francorchamps-4',
  'autodromo-nazionale-monza_autodromo-nazionale-monza': 'monza-7',
  'circuito-de-jerez_circuito-de-jerez': 'jerez-2',
  'yas-marina-circuit_yas-marina-circuit': 'yas-marina-2',
  'circuit-paul-ricard_paul-ricard-circuit': 'paul-ricard-3',
  'sochi-autodrom_sochi-autodrom': 'sochi-1',
  'circuit-paul-ricard_circuit-paul-ricard-short': 'paul-ricard-3',
  'mugello-circuit_mugello-circuit': 'mugello-1',
  'jeddah-corniche-circuit_jeddah-street-circuit': 'jeddah-1',
  'yas-marina-circuit_yas-marina-circuit-2': 'yas-marina-2',
  'autodromo-enzo-e-dino-ferrari_autodromo-enzo-e-dino-ferrari-2': 'imola-3',
  'circuit-zandvoort_circuit-zandvoort': 'zandvoort-5',
  'melbourne-grand-prix-circuit_melbourne-grand-prix-circuit-2': 'melbourne-2',
  'losail-international-circuit_losail-international-circuit': 'lusail-1',
  'miami-international-autodrome_miami-international-autodrome': 'miami-1',
  'circuit-gilles-villeneuve_circuit-gilles-villeneuve': 'montreal-6',
  'circuito-de-madring_circuito-de-madring': 'madring-1'
});

function f2CircuitImageId(circuitId) {
  return F2_CIRCUIT_IMAGE_IDS[String(circuitId || '')] || null;
}

if (typeof module !== 'undefined') module.exports = { F2_CIRCUIT_IMAGE_IDS, f2CircuitImageId };
