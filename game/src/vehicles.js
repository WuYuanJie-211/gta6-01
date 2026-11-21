// Cars: meshes, spawning, traffic, the player's driving, stealing and
// police spawns. A car is a state object {mesh, pos, heading, speed,
// kind, model, ...} plus a mesh built by createCarMesh.
//
// The under-car shadow is part of the mesh: a soft blob plane WIDER
// than the body (it sticks out 0.5 m on every side) at y=0.06 with
// renderOrder 2, so it reads as a contact shadow from any camera and
// is never repainted over by road paint. That is the v41 fix for the
// shot-4 police cars that looked like they were floating.
import { BX, CG, MS, ME, V3, GP, PI, PG, SH } from './geo.js';
import { CAR, CAR_MODELS, COLOURS, WORLD } from './config.js';
import { nodeNeighbours, nearestNode, isIntersection } from './roads.js';
import { resolveBuildingCollision } from './city.js';
import { blobShadowTexture } from './v31.js';

// Cached standard materials: same colour/roughness/emissive reuses one.
const _vm = new Map();
function VM(c, r = 1, e) {
  const k = `${c}|${r}|${e || 0}`;
  let m = _vm.get(k);
  if (!m) {
    m = new MS({ color: c, roughness: r, ...(e ? { emissive: e } : {}) });
    _vm.set(k, m);
  }
  return m;
}

let _paint = null;
export function setCarTextures(textures) {
  _paint = textures;
}

const B = (g, w, h, d, m, x = 0, y = 0, z = 0) => {
  const q = new ME(new BX(w, h, d), m);
  q.position.set(x, y, z);
  g.add(q);
  return q;
};

export function createCarMesh(model, color, police = false) {
  const def = CAR_MODELS[model];
  const len = def.len;
  const h = def.height;
  const g = new GP();
  const glass = VM(0x14181c, 0.2);
  const dark = VM(0x1a1a1a, 0.9);
  const tyre = VM(0x111111, 1);
  const steel = VM(0x888888, 0.4);
  let paint = VM(color, 0.4);
  if (_paint) {
    if (model === 'sport' && _paint.redPaint) paint = new MS({ color, roughness: 0.35, metalness: 0.4, map: _paint.redPaint });
    if (model === 'taxi' && _paint.taxiPaint) paint = new MS({ color, roughness: 0.35, metalness: 0.4, map: _paint.taxiPaint });
  }
  // Body shell. Local +x is the front (heading 0 drives toward +x).
  const body = B(g, len, h, 1.9, paint, 0, 0.5 + h / 2, 0);
  body.castShadow = true;
  g.userData.body = body;
  g.userData.bodyLen = len;
  // Wheels.
  const wheelGeo = new CG(0.34, 0.34, 0.24, 12);
  for (const [wx, wz] of [[len * 0.32, 0.85], [len * 0.32, -0.85], [-len * 0.32, 0.85], [-len * 0.32, -0.85]]) {
    const wheel = new ME(wheelGeo, tyre);
    wheel.rotation.x = PI / 2;
    wheel.position.set(wx, 0.34, wz);
    g.add(wheel);
    const hub = new ME(new CG(0.16, 0.16, 0.26, 8), steel);
    hub.rotation.x = PI / 2;
    hub.position.set(wx, 0.34, wz);
    g.add(hub);
  }
  const tall = model === 'van' || model === 'armored' || model === 'bus' || model === 'truck';
  if (!tall) {
    // Cabin: dark glass band on top of the body.
    const cabin = B(g, len * 0.52, 0.5, 1.7, glass, -len * 0.06, 0.5 + h + 0.25, 0);
    cabin.castShadow = true;
    g.userData.cabin = cabin;
  } else {
    // Windshield + frame on the front face. The frame is dark and only
    // slightly larger than the glass, so it reads as a dark border around
    // the glass — the old light-grey frame (0.95 tall, 1.95 wide) read
    // as one pure-white front panel on the black armored van.
    const wy = model === 'armored' ? 1.85 : model === 'bus' ? 2.0 : 1.6;
    const frame = B(g, 0.02, 0.8, 1.8, VM(0x1a1a1a, 0.5), len / 2 + 0.01, wy, 0);
    g.userData.frame = frame;
    const shield = B(g, 0.05, 0.7, 1.7, glass, len / 2 + 0.04, wy, 0);
    g.userData.windshield = shield;
    if (model === 'bus') {
      // Side glass strip.
      B(g, len * 0.7, 0.5, 0.04, glass, -0.2, 1.9, 0.96);
      B(g, len * 0.7, 0.5, 0.04, glass, -0.2, 1.9, -0.96);
    }
    if (model === 'truck') {
      // Cargo box behind the cab.
      B(g, len * 0.55, 1.4, 1.9, VM(0x8a8f94, 0.7), -len * 0.2, 1.4, 0);
    }
  }
  if (model === 'pickup') {
    // Open bed: low walls at the rear.
    B(g, 0.08, 0.5, 1.9, paint, -len * 0.42, 1.15, 0);
    B(g, len * 0.3, 0.5, 0.08, paint, -len * 0.3, 1.15, 0.92);
    B(g, len * 0.3, 0.5, 0.08, paint, -len * 0.3, 1.15, -0.92);
  }
  if (model === 'sport') {
    // Spoiler.
    B(g, 0.5, 0.06, 1.7, dark, -len / 2 + 0.15, 0.5 + h + 0.28, 0);
    B(g, 0.06, 0.22, 0.08, dark, -len / 2 + 0.3, 0.5 + h + 0.16, 0.7);
    B(g, 0.06, 0.22, 0.08, dark, -len / 2 + 0.3, 0.5 + h + 0.16, -0.7);
  }
  // Headlights (warm) and tail lights (red), slightly proud of the body.
  for (const s of [-0.6, 0.6]) {
    const hl = B(g, 0.06, 0.16, 0.4, VM(0xfff3c4, 0.3, 0xcc9900), len / 2 + 0.01, 0.85, s);
    g.userData[`headlight${s > 0 ? 'R' : 'L'}`] = hl;
    B(g, 0.06, 0.14, 0.4, VM(0xd32f2f, 0.3, 0xaa0000), -len / 2 - 0.01, 0.85, s);
  }
  // Bumpers.
  B(g, 0.12, 0.22, 1.92, VM(0x333333, 0.6), len / 2 + 0.02, 0.55, 0);
  B(g, 0.12, 0.22, 1.92, VM(0x333333, 0.6), -len / 2 - 0.02, 0.55, 0);
  if (model === 'taxi') {
    // Roof sign, blank here — shots.js paints the TAXI text on it.
    const sign = B(g, 0.9, 0.24, 0.4, VM(0xffe14d, 0.5), -0.1, 0.5 + h + 0.62, 0);
    g.userData.roofSign = sign;
  }
  if (police) {
    // Light bar: red left, blue right, hot emissive.
    const bar = B(g, 1.1, 0.1, 0.34, dark, -0.2, 0.5 + h + 0.52, 0);
    g.userData.lightBar = bar;
    const lr = B(g, 0.45, 0.14, 0.3, VM(0xff0000, 0.3, 0xff0000), -0.2, 0.5 + h + 0.6, 0.28);
    const lb = B(g, 0.45, 0.14, 0.3, VM(0x0000ff, 0.3, 0x0000ff), -0.2, 0.5 + h + 0.6, -0.28);
    g.userData.lightR = lr;
    g.userData.lightB = lb;
  }
  // Under-car shadow: wider than the body on every side, dark, drawn
  // after the road paint so it is never covered up.
  const shadow = new ME(new PG(len + 1.4, 3.4), SH(blobShadowTexture(), 0.85));
  shadow.rotation.x = -PI / 2;
  shadow.position.set(0, 0.06, 0);
  shadow.renderOrder = 2;
  g.add(shadow);
  g.userData.shadow = shadow;
  return g;
}

function makeCar(game, model, color, x, z, heading, opts = {}) {
  const mesh = createCarMesh(model, color, !!opts.police);
  mesh.position.set(x, 0, z);
  mesh.rotation.y = heading;
  game.scene.add(mesh);
  const car = {
    model,
    kind: opts.kind || model,
    mesh,
    pos: new V3(x, 0, z),
    heading,
    speed: 0,
    health: CAR.maxHealth,
    wrecked: false,
    stolen: false,
    forSale: !!opts.forSale,
    salePrice: opts.salePrice || 0,
    prevNode: null,
    targetNode: null,
  };
  return car;
}

export function spawnCars(game) {
  const rng = game.rng;
  const parked = [];
  const L = game.city.landmarks;
  // The mission cars.
  const comet = makeCar(game, 'sport', COLOURS.cometRed, L.cometSpot.x, L.cometSpot.z, PI / 2, { kind: 'comet' });
  game.cars.comet = comet;
  parked.push(comet);
  const armored = makeCar(game, 'armored', 0x2a2f36, L.armoredSpot.x, L.armoredSpot.z, PI / 2, { kind: 'armored' });
  game.cars.armored = armored;
  parked.push(armored);
  // The taxi, by the plaza.
  const taxi = makeCar(game, 'taxi', 0xffe14d, 240, -175, PI);
  parked.push(taxi);
  // For sale at the dealer: Comet $2500, Muscle $1800, Van $1100.
  const saleSpots = [
    ['sport', COLOURS.cometRed, 216, -138, 2500],
    ['muscle', 0x7d3c98, 222, -138, 1800],
    ['van', 0xecf0f1, 204, -138, 1100],
  ];
  for (const [model, color, x, z, price] of saleSpots) {
    parked.push(makeCar(game, model, color, x, z, PI / 2, { forSale: true, salePrice: price }));
  }
  // Other parked cars, curb-side around the city.
  const others = [
    ['sedan', 0x2e86c1, 180, -192, PI / 2],
    ['compact', 0xe67e22, 300, -168, PI / 2],
    ['pickup', 0x16a085, 232, -168, PI / 2],
    ['truck', 0x8a8f94, -120, 60, 0],
    ['bus', 0xf1c40f, 60, 120, PI / 2],
    ['sedan', 0xc0392b, -60, -60, 0],
    ['compact', 0x2c3e50, 248, -192, PI / 2],
    ['muscle', 0xe74c3c, 232, -192, PI / 2],
  ];
  for (const [model, color, x, z, h] of others) {
    parked.push(makeCar(game, model, color, x, z, h));
  }
  game.cars.parked = parked;
  // Traffic: 20 cars on the road graph.
  const traffic = [];
  const models = ['sedan', 'compact', 'taxi', 'van', 'pickup', 'sedan', 'compact', 'muscle'];
  for (let i = 0; i < WORLD.trafficCars; i += 1) {
    const node = game.roads.nodes[Math.floor(rng.next() * game.roads.nodes.length)];
    const next = nodeNeighbours(game.roads, node)[0];
    const model = rng.pick(models);
    const color = model === 'taxi' ? 0xffe14d : rng.pick(COLOURS.car);
    const car = makeCar(game, model, color, node.x, node.z, 0);
    car.prevNode = node;
    car.targetNode = next;
    car.heading = Math.atan2(-(next.z - node.z), next.x - node.x);
    car.speed = CAR.trafficSpeed;
    traffic.push(car);
  }
  game.cars.traffic = traffic;
}

export function spawnPoliceCar(game) {
  const car = makeCar(game, 'sedan', 0xffffff, 0, 300, 0, { police: true, kind: 'police' });
  return car;
}

function stopAtRedLight(game, car) {
  // A red lamp within 10 m ahead stops the car at the line.
  for (const tl of game.city.trafficLights) {
    const u = tl.userData.trafficLight;
    if (u.state !== 'r') continue;
    const dx = tl.position.x - car.pos.x;
    const dz = tl.position.z - car.pos.z;
    const d = Math.hypot(dx, dz);
    if (d > 12) continue;
    const fx = Math.cos(car.heading);
    const fz = -Math.sin(car.heading);
    if (dx * fx + dz * fz > 0) return true;
  }
  return false;
}

export function updateTraffic(game, dt) {
  for (const car of game.cars.traffic) {
    if (car.wrecked) continue;
    const target = car.targetNode;
    if (!target) continue;
    const dx = target.x - car.pos.x;
    const dz = target.z - car.pos.z;
    const dist = Math.hypot(dx, dz);
    const want = Math.atan2(-dz, dx);
    let diff = want - car.heading;
    while (diff > PI) diff -= PI * 2;
    while (diff < -PI) diff += PI * 2;
    car.heading += Math.max(-1.6 * dt, Math.min(1.6 * dt, diff));
    const stopped = stopAtRedLight(game, car);
    const speed = stopped ? 0 : CAR.trafficSpeed;
    car.speed += (speed - car.speed) * Math.min(1, 3 * dt);
    car.pos.x += Math.cos(car.heading) * car.speed * dt;
    car.pos.z += -Math.sin(car.heading) * car.speed * dt;
    if (dist < 2) {
      const next = nodeNeighbours(game.roads, target);
      const options = next.filter((n) => n !== car.prevNode);
      car.prevNode = target;
      car.targetNode = options.length ? options[Math.floor(game.rng.next() * options.length)] : next[0];
    }
    if (Math.abs(car.pos.x) > 395 || Math.abs(car.pos.z) > 395) {
      const node = nearestNode(game.roads, 0, 0);
      car.pos.set(node.x, 0, node.z);
      car.prevNode = node;
      car.targetNode = nodeNeighbours(game.roads, node)[0];
    }
    car.mesh.position.copy(car.pos);
    car.mesh.rotation.y = car.heading;
  }
}

export function updatePlayerCar(game, dt) {
  const car = game.player.car;
  if (!car) return;
  const def = CAR_MODELS[car.model];
  const drive = game.input.drive();
  const steer = game.input.steer();
  const top = car.model === 'sport' ? CAR.sportTopSpeed : def.topSpeed;
  if (drive > 0) car.speed += def.accel * dt;
  else if (drive < 0) {
    car.speed -= (car.speed > 0.5 ? CAR.brake : def.accel * 0.5) * dt;
  } else {
    car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 8 * dt);
  }
  car.speed = Math.max(-CAR.reverseTopSpeed, Math.min(top, car.speed));
  if (Math.abs(car.speed) > 0.1) {
    car.heading += steer * CAR.steerRate * dt * Math.sign(car.speed) * Math.min(1, Math.abs(car.speed) / 8);
  }
  car.pos.x += Math.cos(car.heading) * car.speed * dt;
  car.pos.z += -Math.sin(car.heading) * car.speed * dt;
  car.pos.x = Math.max(-388, Math.min(388, car.pos.x));
  car.pos.z = Math.max(-388, Math.min(388, car.pos.z));
  resolveBuildingCollision(car.pos, CAR.radius, game.city.colliders);
  // Bumping traffic.
  for (const other of game.cars.traffic) {
    if (other === car || other.wrecked) continue;
    const d = Math.hypot(other.pos.x - car.pos.x, other.pos.z - car.pos.z);
    if (d < 3.4 && Math.abs(car.speed) > 2) {
      other.health -= 12;
      car.health -= 4;
      car.speed *= 0.4;
      game.audio.crash();
      game.hud.shake();
      if (other.health <= 0 && !other.wrecked) {
        other.wrecked = true;
        other.speed = 0;
        game.hud.flash('That car is wrecked.');
      }
    }
  }
  // Running a pedestrian over is a crime, and the game notices.
  for (const ped of game.peds) {
    if (!ped.alive) continue;
    const d = Math.hypot(ped.pos.x - car.pos.x, ped.pos.z - car.pos.z);
    if (d < 1.6 && Math.abs(car.speed) > 3) {
      ped.alive = false;
      ped.mesh.rotation.x = PI / 2;
      ped.mesh.position.y = 0.3;
      game.police.commitCrime(1);
      game.audio.crash();
      game.hud.flash('You ran someone over — the cops saw that.');
    }
  }
  if (car.health <= 0 && !car.wrecked) {
    car.wrecked = true;
    car.speed = 0;
    game.audio.wreck();
    game.hud.flash('The car is wrecked.');
  }
  game.audio.setEngine(Math.abs(car.speed) / top);
  car.mesh.position.copy(car.pos);
  car.mesh.rotation.y = car.heading;
}

export function enterCar(game, car) {
  game.player.car = car;
  game.player.onFoot = false;
  game.player.mesh.visible = false;
  game.audio.honkShort();
}

export function exitCar(game) {
  const car = game.player.car;
  if (!car) return;
  game.player.car = null;
  game.player.onFoot = true;
  game.player.pos.set(car.pos.x + 3, 0, car.pos.z + 3);
  game.player.mesh.visible = true;
  game.player.mesh.position.copy(game.player.pos);
}

export function nearestStealableCar(game) {
  const p = game.player.pos;
  let best = null;
  let bestD = 3.5;
  for (const car of [...game.cars.parked, ...game.cars.traffic]) {
    if (car.wrecked) continue;
    const d = Math.hypot(car.pos.x - p.x, car.pos.z - p.z);
    if (d < bestD) {
      bestD = d;
      best = car;
    }
  }
  return best;
}
