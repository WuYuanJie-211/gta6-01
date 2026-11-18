// Solara Bay: all the numbers the rest of the game shares. One place to tune the city,
// the cars, the police and the missions, so a balance change never means hunting
// through five files.
export const CITY = {
  // Road centrelines, metres. Nine roads each way, 60 m apart, road surface 12 m wide.
  roadLines: [-240, -180, -120, -60, 0, 60, 120, 180, 240],
  roadWidth: 12,
  blockSize: 48,
  // The city runs x,z in [-270, 270]; the beach is the strip z > 246, the sea beyond 300.
  halfSize: 270,
  beachStart: 246,
  seaStart: 300,
};

export const PLAYER = {
  walkSpeed: 6,
  runSpeed: 10,
  radius: 0.6,
  maxHealth: 100,
  punchRange: 2.0,
  punchDamage: 25,
  punchCooldown: 0.4,
};

export const CAR = {
  // Arcade driving: metres per second, per second, radians per second.
  normalTopSpeed: 26,
  sportTopSpeed: 38,
  policeTopSpeed: 34,
  trafficSpeed: 10,
  accel: 18,
  brake: 30,
  reverseTopSpeed: 9,
  steerRate: 1.9,
  radius: 1.7,
};

export const POLICE = {
  maxActiveCars: 4,
  chaseRange: 220,
  ramDamage: 2,
  ramCooldown: 1.0,
  // Wanted falls one star after this long with no police close by.
  decayAfterSeconds: 12,
  decayIntervalSeconds: 8,
};

export const WORLD = {
  trafficCars: 10,
  pedestrians: 14,
  // Cash the player starts with, and what each mission pays.
  startCash: 50,
  missionPay: [200, 500, 800],
};

export const COLOURS = {
  sky: 0x8ec9ee,
  sun: 0xfff2d8,
  ground: 0x9aa0a3,
  asphalt: 0x3a3f45,
  sidewalk: 0xb9b3a4,
  sand: 0xe8d49a,
  sea: 0x2e7fb8,
  grass: 0x6fae5e,
  // Building facades: sunny pastel modern city.
  building: [0xe8dcc8, 0xd8e4ea, 0xf2c9a0, 0xc9d6c2, 0xe6b8b8, 0xbcd0e8, 0xf0e6d2],
  car: [0xc0392b, 0x2e86c1, 0xf1c40f, 0x7d3c98, 0x16a085, 0xecf0f1, 0x2c3e50, 0xe67e22],
  cometRed: 0xd21f2b,
  policeWhite: 0xf2f2f2,
  policeBlue: 0x1a3a8f,
};

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

/** Where the save is kept between visits (this browser only). */
export const SAVE_KEY = 'solara-bay-save-v1';
