// Every tunable number in the game lives here: the city grid, the
// player, the cars, the police, the weapons, the economy, the textures.
// The gameplay modules read these; nothing else hard-codes a balance
// number.

// The road grid: 13 north-south avenues (x) and 11 east-west streets
// (z), 60 m apart, 12 m wide. The city runs from -390 to +390; the
// beach starts at z=246 and the sea at z=300.
export const CITY = {
  roadLinesX: [-360, -300, -240, -180, -120, -60, 0, 60, 120, 180, 240, 300, 360],
  roadLinesZ: [-360, -300, -240, -180, -120, -60, 0, 60, 120, 180, 240],
  roadWidth: 12,
  halfSize: 390,
  beachStart: 246,
  seaStart: 300,
};

// Districts, checked in order — the first box that contains the point
// wins, so the small districts come before the OLD TOWN catch-all.
export const DISTRICTS = [
  { name: 'DOWNTOWN', minX: 60, maxX: 390, minZ: -390, maxZ: -60 },
  { name: 'PORT', minX: -390, maxX: -240, minZ: -390, maxZ: -240 },
  { name: 'SUBURBS', minX: 240, maxX: 390, minZ: -60, maxZ: 270 },
  { name: 'BEACH', minX: -390, maxX: 390, minZ: 246, maxZ: 270 },
  { name: 'OLD TOWN', minX: -390, maxX: 390, minZ: -390, maxZ: 270 },
];

export function districtAt(x, z) {
  for (const d of DISTRICTS) {
    if (x >= d.minX && x < d.maxX && z >= d.minZ && z < d.maxZ) return d.name;
  }
  return 'OLD TOWN';
}

export const PLAYER = {
  walkSpeed: 6,
  runSpeed: 10,
  radius: 0.6,
  maxHealth: 100,
  punchRange: 2.0,
  punchDamage: 25,
  punchCooldown: 0.4,
  shootRange: 42,
  pistolCooldown: 0.28,
  rifleCooldown: 0.12,
};

// len/height are the body shell; topSpeed is m/s, accel is m/s^2.
export const CAR_MODELS = {
  sedan: { name: 'Sedan', topSpeed: 26, accel: 18, price: 800, len: 4.2, height: 0.9 },
  compact: { name: 'Compact', topSpeed: 24, accel: 20, price: 600, len: 3.4, height: 1.0 },
  taxi: { name: 'Taxi', topSpeed: 27, accel: 18, price: 900, len: 4.2, height: 0.9 },
  van: { name: 'Van', topSpeed: 22, accel: 14, price: 1100, len: 5.0, height: 1.6 },
  pickup: { name: 'Pickup', topSpeed: 28, accel: 19, price: 1200, len: 4.6, height: 1.0 },
  truck: { name: 'Truck', topSpeed: 20, accel: 12, price: 1500, len: 6.5, height: 1.8 },
  bus: { name: 'Bus', topSpeed: 18, accel: 10, price: 2000, len: 7.5, height: 2.2 },
  muscle: { name: 'Muscle', topSpeed: 32, accel: 21, price: 1800, len: 4.4, height: 0.85 },
  sport: { name: 'Comet GT', topSpeed: 38, accel: 24, price: 2500, len: 4.6, height: 0.75 },
  armored: { name: 'Armored Van', topSpeed: 25, accel: 15, price: 0, len: 4.7, height: 1.9 },
};

// Driving feel + police chase numbers, shared by vehicles / police.
export const CAR = {
  sportTopSpeed: 38,
  policeTopSpeed: 34,
  trafficSpeed: 10,
  accel: 18,
  brake: 30,
  reverseTopSpeed: 9,
  steerRate: 1.9,
  radius: 1.7,
  maxHealth: 100,
};

export const POLICE = {
  maxActiveCars: 4,
  maxActiveCarsHigh: 6,
  ramDamage: 2,
  ramCooldown: 1.0,
  heliAtStars: 4,
  roadblockAtStars: 3,
  decayAfterSeconds: 12,
  decayIntervalSeconds: 8,
  escapeDecayAfterSeconds: 6,
  escapeDecayIntervalSeconds: 5,
};

export const WEAPONS = {
  fists: { name: 'Fists', price: 0 },
  pistol: { name: 'Pistol', price: 150, damage: 20, mag: 12, ammoPrice: 30, ammoPerBuy: 24 },
  rifle: { name: 'Rifle', price: 400, damage: 34, mag: 30, ammoPrice: 60, ammoPerBuy: 60 },
};

export const ECONOMY = {
  garageRepair: 60,
  dinerHeal: 25,
  dinerHealAmount: 50,
  chopSellMin: 200,
  chopSellMax: 450,
  taxiFareMin: 40,
  taxiFareMax: 90,
  collectiblePay: 50,
  thugDrop: 20,
  gunmanDrop: 35,
};

export const WORLD = {
  trafficCars: 20,
  pedestrians: 36,
  startCash: 50,
  missionPay: [200, 500, 800, 300, 400, 600, 1000],
  collectibles: 5,
};

export const COLOURS = {
  ground: 0x8f959a,
  sea: 0x2e7fb8,
  container: [0xc0392b, 0x2e86c1, 0xf1c40f, 0x16a085, 0xe67e22, 0x7d3c98],
  car: [0xc0392b, 0x2e86c1, 0xf1c40f, 0x7d3c98, 0x16a085, 0xecf0f1, 0x2c3e50, 0xe67e22],
  cometRed: 0xd21f2b,
};

// Texture paths. Two of them (red-paint, taxi-paint) were never shipped
// in the repo — the loader falls back to a flat colour for them, which
// is how the Comet stays red and the taxi stays yellow. That fallback
// is load bearing; do not "fix" the paths without shipping the files.
const T = (n) => `textures/${n}.jpg`;
export const TEXTURES = {
  glass: T('glass-1024'),
  brick: T('brick-1024'),
  stucco: T('suburban-wall'),
  asphalt: T('asphalt'),
  sidewalk: T('sidewalk'),
  grass: T('grass'),
  sand: T('sand'),
  container: T('container-metal'),
  concrete: T('concrete-512'),
  wood: T('wood-512'),
  cobble: T('cobble-512'),
  redPaint: T('red-paint-512'),
  taxiPaint: T('taxi-paint-512'),
  fireball: 'textures/fireball-512.png',
  smoke: 'textures/smoke-512.png',
  pool: 'textures/pool-soft.png',
  skid: 'textures/skid-soft.png',
  shadow: 'textures/shadow-soft.png',
  marble: T('marble-512'),
  glassDark: T('glass-dark-1024'),
  brickBrown: T('brick-brown-1024'),
  plaster: T('plaster-1024'),
  metal: T('metal-1024'),
  awning: T('awning-512'),
  signTaxi: T('sign-taxi'),
  sign24h: T('sign-24h'),
  signHotel: T('sign-hotel'),
  signBar: T('sign-bar'),
  signPizza: T('sign-pizza'),
  signAuto: T('sign-auto'),
  sunsetSky: T('sunset-sky'),
  neonSign: T('neon-sign'),
};

// Particle lifetimes (seconds): flash, casing, spark, explosion.
export const EFFECTS = {
  fl: 0.14,
  ca: 0.7,
  sp: 0.25,
  ex: 1.2,
};

// Fixed simulation step (s) and two detail knobs the city builder uses.
export const STEP = 1 / 60;
export const DETAIL = {
  ctb: 1.9,
  ts: 0.5,
};

export const SAVE_KEY = 'solara-bay-save-v2';
