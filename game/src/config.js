export const CITY = {
  roadLinesX: [-360, -300, -240, -180, -120, -60, 0, 60, 120, 180, 240, 300, 360],
  roadLinesZ: [-360, -300, -240, -180, -120, -60, 0, 60, 120, 180, 240],
  roadLines: [-360, -300, -240, -180, -120, -60, 0, 60, 120, 180, 240, 300, 360],
  roadWidth: 12,
  blockSize: 48,
  halfSize: 390,
  beachStart: 246,
  seaStart: 300,
};
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
  pistolDamage: 20,
  pistolCooldown: 0.28,
  rifleDamage: 34,
  rifleCooldown: 0.12,
};
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
  armored: { name: 'Armored Van', topSpeed: 25, accel: 15, price: 0, len: 5.2, height: 1.9 },
};
export const CAR = {
  normalTopSpeed: 26,
  sportTopSpeed: 38,
  policeTopSpeed: 34,
  trafficSpeed: 10,
  accel: 18,
  brake: 30,
  reverseTopSpeed: 9,
  steerRate: 1.9,
  radius: 1.7,
  maxHealth: 100,
  wreckSmokeAt: 40,
};
export const POLICE = {
  maxActiveCars: 4,
  maxActiveCarsHigh: 6, 
  chaseRange: 220,
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
  ground: 0x9aa0a3,
  asphalt: 0x3a3f45,
  sidewalk: 0xb9b3a4,
  sand: 0xe8d49a,
  sea: 0x2e7fb8,
  grass: 0x6fae5e,
  building: [0xe8dcc8, 0xd8e4ea, 0xf2c9a0, 0xc9d6c2, 0xe6b8b8, 0xbcd0e8, 0xf0e6d2],
  tower: [0x9fc4dd, 0x7fa8c9, 0xb8d4e8, 0x8fb8d8],
  house: [0xf2e3c9, 0xe8c9a0, 0xd8e4ea, 0xf0d0c0, 0xc9d6c2],
  container: [0xc0392b, 0x2e86c1, 0xf1c40f, 0x16a085, 0xe67e22, 0x7d3c98],
  car: [0xc0392b, 0x2e86c1, 0xf1c40f, 0x7d3c98, 0x16a085, 0xecf0f1, 0x2c3e50, 0xe67e22],
  cometRed: 0xd21f2b,
  policeWhite: 0xf2f2f2,
  policeBlue: 0x1a3a8f,
};
export const TEXTURES = {
  glass: 'textures/glass-facade.jpg',
  brick: 'textures/brick-facade.jpg',
  stucco: 'textures/suburban-wall.jpg',
  asphalt: 'textures/asphalt.jpg',
  sidewalk: 'textures/sidewalk.jpg',
  grass: 'textures/grass.jpg',
  sand: 'textures/sand.jpg',
  container: 'textures/container-metal.jpg',
};
export const STEP = 1 / 60;
export const DETAIL = {
  cometTailBar: 1.9,
  treeSpread: 0.5,
};
export const SAVE_KEY = 'solara-bay-save-v2';
