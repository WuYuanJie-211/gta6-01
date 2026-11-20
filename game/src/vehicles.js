import{BX,CG,MS,ME,V3,GP,PI,PG,SH}from'./geo.js';
const _vm=new Map();
function VM(c,r=1,e){const k=c+'|'+r+'|'+(e||0);let m=_vm.get(k);if(!m){m=new MS({color:c,roughness:r,...(e?{emissive:e}:{})});_vm.set(k,m)}return m}
import { CAR, CAR_MODELS, COLOURS, DETAIL, WORLD } from './config.js';
import { nodeNeighbours, nearestNode, isIntersection } from './roads.js';
import { resolveBuildingCollision } from './city.js';
let carTextures = null;
export function setCarTextures(t) { carTextures = t; }
export function createCarMesh(color, kind = 'sedan') {
  const group = new GP();
  const B=(w,h,d,m,x=0,y=0,z=0,s=false)=>{const q=new ME(new BX(w,h,d),m);q.position.set(x,y,z);if(s)q.castShadow=true;group.add(q);return q;};
  const paintMap = carTextures && kind === 'sport' ? carTextures.redPaint : carTextures && kind === 'taxi' ? carTextures.taxiPaint : null;
  const paint = new MS({ color: paintMap ? 0xffffff : color, roughness: paintMap ? 0.35 : 0.4, metalness: paintMap ? 0.6 : 0.4, ...(paintMap ? { map: paintMap } : {}) });
  const glass = new MS({ color: 0x1a2a3a, roughness: 0.2, metalness: 0.6 });
  const tyre = VM(0x151515);
  const model = CAR_MODELS[kind] || CAR_MODELS.sedan;
  const len = model.len;
  const bodyH = model.height;
  if (kind === 'van' || kind === 'armored' || kind === 'truck' || kind === 'bus') {
    const body = B(len, bodyH, 2.1, paint, 0, 0.5 + bodyH / 2, 0, true);
    if (kind === 'truck') {
      B(1.6, 1.3, 2.1, paint, len / 2 - 0.8, 1.5, 0);
      B(len - 2.4, 0.3, 2, VM(0x555a60), -0.8, 1.1, 0);
      const stack = new ME(new CG(0.12, 0.12, 2, 8), new MS({ color: 0xaaaaaa, roughness: 0.3, metalness: 0.7 }));
      stack.position.set(len / 2 - 1.8, 1.8, 0.9);
      group.add(stack);
    }
    if (kind === 'van' || kind === 'armored') {
      B(0.08, 0.28, 1.9, VM(0xff2222,1,0x660000), -len / 2 - 0.02, 0.9, 0);
      B(0.06, 0.8, 1.9, glass, -len / 2 - 0.03, bodyH - 0.1, 0);
      // v33: side windows — the van read as a flat dark box with two
      // small yellow squares and no readable glass from the side.
      for (const side of [-1, 1]) B(len * 0.5, 0.55, 0.06, glass, -0.2, 1.55, side * 1.06);
      for (const sz of [-0.6, 0.6]) B(0.05, bodyH * 0.7, 0.06, VM(0x1a1a1a,0.6), -len / 2 - 0.04, 0.5 + bodyH / 2, sz);
    }
    if (kind === 'bus') {
      for (const side of [-1, 1]) B(len - 1, 0.8, 0.05, glass, 0, 1.9, side * 1.06);
      B(0.08, 0.4, 1.4, VM(0xff8800,1,0x664400), len / 2 + 0.02, 2.3, 0);
    }
    if (kind === 'armored') {
      B(len - 0.5, 0.8, 2.2, new MS({ color: 0x6a6f75, roughness: 0.5, metalness: 0.6 }), 0, 1.5, 0);
      const dm = VM(0x222222, 0.6);
      for (const s of [-0.55, 0.55]) B(0.08, 1.6, 0.1, dm, len / 2 + 0.04, 1.4, s);
      B(0.04, 0.12, 1.9, dm, len / 2 + 0.04, 2.05, 0);
      B(0.04, 0.6, 1.8, dm, len / 2 + 0.04, 0.95, 0);
      B(0.04, 0.3, 0.7, VM(0xf2f2f2, 0.5), len / 2 + 0.04, 0.55, 0);
      for (const s of [-0.7, 0.7]) B(0.06, 0.18, 0.3, VM(0xfff2cc, 1, 0xaa8800), len / 2 + 0.04, 1.35, s);
    }
  } else {
    const body = B(len, 0.55, 2, paint, 0, 0.55, 0, true);
    const cabinL = kind === 'sport' ? len * 0.38 : len * 0.45;
    const cabinH = kind === 'sport' ? 0.45 : bodyH - 0.3;
    const cabin = B(cabinL, cabinH, 1.7, glass, -0.2, 0.85 + cabinH / 2, 0, true);
    B(cabinL * 0.9, 0.08, 1.7, paint, -0.2, 0.85 + cabinH + 0.04, 0);
    B(len * 0.22, 0.3, 1.9, paint, len / 2 - len * 0.11, 0.42, 0);
    B(len * 0.2, 0.28, 1.9, paint, -len / 2 + len * 0.1, 0.41, 0);
    const trimMat = VM(0x1a1a1a,0.6);
    for (const side of [-1, 1]) B(len * 0.9, 0.05, 0.03, trimMat, 0, 0.82, side * 1.01);
    if (kind === 'muscle') {
      B(1.2, 0.25, 0.8, VM(0x222831,0.4), len / 2 - 1, 0.9, 0);
    }
    if (kind === 'pickup') {
      B(len * 0.45, 0.5, 1.9, VM(0x333333,0.9), -len / 2 + len * 0.225, 0.7, 0);
    }
    if (kind === 'taxi') {
      B(0.5, 0.25, 0.9, VM(0xffe14d,1,0x886600), -0.2, 1.5, 0);
      for (const side of [-1, 1]) B(1.6, 0.4, 0.05, VM(0x222222,0.6), 0, 0.55, side * 1.02);
      B(0.08, 0.16, DETAIL.ctb, VM(0xff2222,1,0x660000), -len / 2 - 0.02, 0.62, 0);
      B(0.06, 0.3, 1.5, glass, -0.2 - cabinL / 2 - 0.03, 1.15, 0);
      B(0.03, 0.04, 1.6, VM(0x222222, 0.6), -len / 2 - 0.03, 0.95, 0);
      B(0.04, 0.2, 0.5, VM(0xf2f2f2, 0.5), -len / 2 - 0.14, 0.35, 0);
    }
    if (kind === 'sport') {
      B(0.3, 0.08, 1.8, paint, -len / 2 + 0.15, 1.15, 0);
      B(len, 0.02, 0.5, VM(0xffd94d,0.4), 0, 0.84, 0);
      for (const sz of [-0.6, 0.6]) B(0.12, 0.35, 0.12, paint, -len / 2 + 0.15, 0.95, sz);
      B(0.08, 0.16, DETAIL.ctb, VM(0xff2222,1,0x660000), -len / 2 - 0.02, 0.62, 0);
      B(0.25, 0.18, 1.8, VM(0x1a1a1a,0.8), -len / 2 - 0.02, 0.22, 0);
    }
  }
  if (kind === 'police') {
    // v33: the extra white box (same size as the body) swallowed the
    // glass cabin, so the cruiser read as a white slab; the body is
    // already white. Keep the blue stripe; silver base + lower lights
    // so the lightbar reads as attached to the roof, not floating.
    B(len * 0.5, bodyH * 0.9, 2.02, VM(0x1a3a8f,0.4), 0, 0.55, 0);
    B(0.7, 0.18, 1.2, VM(0x888888,0.5), -0.1, 1.6, 0);
    const lightR = B(0.3, 0.2, 0.55, VM(0xff2222,1,0xaa0000), -0.1, 1.68, 0.3);
    const lightB = B(0.3, 0.2, 0.55, VM(0x2244ff,1,0x0000aa), -0.1, 1.68, -0.3);
    group.userData.lightR = lightR;
    group.userData.lightB = lightB;
  }
  B(0.03, 0.18, 0.7, VM(0xf2f2f2,0.5), -len / 2 - 0.07, 0.42, 0);
  const tall = kind === 'van' || kind === 'armored' || kind === 'truck' || kind === 'bus' || kind === 'police';
  B(0.08, tall ? 0.6 : 0.3, 1.4, VM(0x222222,0.6), len / 2 + 0.02, tall ? 0.9 : 0.45, 0);
  const bumperMat = VM(0x333333,0.6);
  for (const bx of [len / 2 + 0.05, -len / 2 - 0.05]) B(0.15, 0.25, 2.1, bumperMat, bx, 0.35, 0);
  const mirrorMat = VM(0x222222,0.5);
  for (const side of [-1, 1]) B(0.15, 0.12, 0.25, mirrorMat, tall ? len / 2 - 0.8 : 0.3, tall ? 1.5 : 1.05, side * (tall ? 1.12 : 1.05));
  const headMat = VM(0xfff8c0,1,0x888866);
  const tailMat = VM(0xff2222,1,0x660000);
  for (const side of [-0.7, 0.7]) {
    B(0.1, 0.18, 0.35, headMat, len / 2, 0.6, side);
    B(0.1, 0.18, 0.35, tailMat, -len / 2, 0.6, side);
  }
  const wheelR = kind === 'truck' || kind === 'bus' ? 0.55 : 0.42;
  const wheels = [];
  const wheelGeo = new CG(wheelR, wheelR, 0.3, 14);
  const hubGeo = new CG(wheelR * 0.55, wheelR * 0.55, 0.34, 12);
  const hubMat = new MS({ color: 0x888888, roughness: 0.4, metalness: 0.6 });
  for (const [wx, wz] of [[len * 0.32, 0.95], [len * 0.32, -0.95], [-len * 0.32, 0.95], [-len * 0.32, -0.95]]) {
    const wheel = new ME(wheelGeo, tyre);
    wheel.rotation.x = PI / 2;
    wheel.position.set(wx, wheelR, wz);
    wheel.castShadow = true;
    group.add(wheel);
    wheels.push(wheel);
    const hub = new ME(hubGeo, hubMat);
    hub.rotation.x = PI / 2;
    hub.position.set(wx, wheelR, wz);
    group.add(hub);
  }
  group.userData.wheels = wheels;
  group.userData.bodyLen = len;
  if (carTextures && carTextures.shadow) {
    const sh = new ME(new PG(len*1.3,2.8), SH(carTextures.shadow,.65));
    sh.rotation.x = -PI / 2;
    sh.position.set(0, 0.09, 0);
    group.add(sh);
  } else {
    B(len+0.4,.02,2.6,VM(0,1),0,.09,0);
  }
  return group;
}
export function makeCarState(mesh, x, z, heading, kind, topSpeed, model = 'sedan') {
  const modelDef = CAR_MODELS[model];
  return {
    mesh,
    pos: new V3(x, 0, z),
    heading,
    speed: 0,
    kind,
    model,
    topSpeed,
    accel: modelDef ? modelDef.accel : CAR.accel,
    health: CAR.maxHealth,
    wrecked: false,
    targetNode: null,
    prevNode: null,
    forSale: false,
    salePrice: 0,
    stolen: false,
  };
}
function placeOnRoad(game, car, x, z, heading) {
  car.pos.set(x, 0, z);
  car.heading = heading;
  car.mesh.position.copy(car.pos);
  car.mesh.rotation.y = heading;
  game.scene.add(car.mesh);
}
export function spawnCars(game) {
  const rng = game.rng;
  const parkedSpots = [
    { x: 60, z: 18, heading: PI / 2, color: 0xf1c40f, kind: 'taxi' },
    { x: 150, z: 66, heading: PI / 2, color: 0x2e86c1, kind: 'sedan' },
    { x: -60, z: -66, heading: 0, color: 0xecf0f1, kind: 'compact' },
    { x: -120, z: 130, heading: PI, color: 0xe67e22, kind: 'pickup' },
    { x: 300, z: -120, heading: 0, color: 0xc0392b, kind: 'muscle' },
    { x: 120, z: -240, heading: PI / 2, color: 0x16a085, kind: 'van' },
    { x: 300, z: 66, heading: PI, color: 0x7d3c98, kind: 'sedan' },
    { x: -300, z: -180, heading: 0, color: 0x2c3e50, kind: 'truck' },
    { x: 330, z: 180, heading: PI / 2, color: 0xf1c40f, kind: 'compact' },
    { x: 180, z: 240, heading: 0, color: 0x2e86c1, kind: 'sedan' },
    { x: -180, z: 240, heading: PI / 2, color: 0x16a085, kind: 'van' },
    { x: 60, z: -300, heading: PI, color: 0xecf0f1, kind: 'sedan' },
    { x: 180, z: -185, heading: 0, color: 0xc0392b, kind: 'sedan' },
    { x: 240, z: -175, heading: PI, color: 0x2e86c1, kind: 'compact' },
    { x: 300, z: -185, heading: 0, color: 0x16a085, kind: 'van' },
    { x: 60, z: -175, heading: PI, color: 0xf1c40f, kind: 'taxi' },
    { x: 245, z: -120, heading: PI / 2, color: 0x7d3c98, kind: 'sedan' },
    { x: 235, z: -240, heading: -PI / 2, color: 0xe67e22, kind: 'pickup' },
  ];
  for (const spot of parkedSpots) {
    const mesh = createCarMesh(spot.color, spot.kind);
    const model = CAR_MODELS[spot.kind];
    const car = makeCarState(mesh, spot.x, spot.z, spot.heading, 'parked', model.topSpeed, spot.kind);
    placeOnRoad(game, car, spot.x, spot.z, spot.heading);
    game.cars.parked.push(car);
  }
  const comet = createCarMesh(COLOURS.cometRed, 'sport');
  const cometCar = makeCarState(comet, game.city.landmarks.cometSpot.x, game.city.landmarks.cometSpot.z, PI / 2, 'comet', CAR.sportTopSpeed, 'sport');
  placeOnRoad(game, cometCar, cometCar.pos.x, cometCar.pos.z, cometCar.heading);
  game.cars.comet = cometCar;
  const armored = createCarMesh(0x8a8f96, 'armored');
  const armoredCar = makeCarState(armored, game.city.landmarks.armoredSpot.x, game.city.landmarks.armoredSpot.z, PI, 'armored', CAR_MODELS.armored.topSpeed, 'armored');
  placeOnRoad(game, armoredCar, armoredCar.pos.x, armoredCar.pos.z, armoredCar.heading);
  game.cars.armored = armoredCar;
  const saleKinds = ['sport', 'muscle', 'van'];
  saleKinds.forEach((kind, i) => {
    const mesh = createCarMesh(rng.pick(COLOURS.car), kind);
    const model = CAR_MODELS[kind];
    const car = makeCarState(mesh, 192 + i * 12, -132, -PI / 2, 'parked', model.topSpeed, kind);
    car.forSale = true;
    car.salePrice = model.price;
    placeOnRoad(game, car, car.pos.x, car.pos.z, car.heading);
    game.cars.parked.push(car);
  });
  const trafficKinds = ['sedan', 'compact', 'taxi', 'van', 'pickup', 'muscle', 'truck', 'bus', 'sedan', 'compact'];
  for (let i = 0; i < WORLD.trafficCars; i += 1) {
    const node = rng.pick(game.roads.nodes);
    const kind = rng.pick(trafficKinds);
    const mesh = createCarMesh(rng.pick(COLOURS.car), kind);
    const car = makeCarState(mesh, node.x, node.z, rng.pick([0, PI / 2, PI, -PI / 2]), 'traffic', CAR.trafficSpeed, kind);
    car.targetNode = rng.pick(nodeNeighbours(game.roads, node));
    car.prevNode = node;
    car.speed = CAR.trafficSpeed;
    placeOnRoad(game, car, node.x, node.z, car.heading);
    game.cars.traffic.push(car);
  }
}
function steerToward(car, tx, tz, maxTurn) {
  const dx = tx - car.pos.x;
  const dz = tz - car.pos.z;
  const wanted = Math.atan2(-dz, dx);
  let diff = wanted - car.heading;
  while (diff > PI) diff -= PI * 2;
  while (diff < -PI) diff += PI * 2;
  return Math.max(-maxTurn, Math.min(maxTurn, diff * 2.2));
}
function wreckCar(game, car) {
  if (car.wrecked) return;
  car.wrecked = true;
  car.speed = 0;
  if (game.player.car === car) {
    game.audio.wreck();
    game.hud.flash('Your car is wrecked!');
    exitCar(game);
  }
}
function advanceCar(game, car, dt) {
  if (car.wrecked) {
    car.speed = 0;
    return false;
  }
  const nx = car.pos.x + Math.cos(car.heading) * car.speed * dt;
  const nz = car.pos.z - Math.sin(car.heading) * car.speed * dt;
  const before = { x: car.pos.x, z: car.pos.z };
  car.pos.x = nx;
  car.pos.z = nz;
  const hit = resolveBuildingCollision(car.pos, CAR.radius, game.city.colliders);
  if (hit) {
    car.health = Math.max(0, car.health - Math.abs(car.speed) * 0.4);
    car.speed = Math.abs(car.speed) > 4 ? car.speed * 0.2 : 0;
    if (Math.hypot(car.pos.x - before.x, car.pos.z - before.z) < 0.001) car.speed = 0;
    if (car.health <= 0) wreckCar(game, car);
  }
  car.mesh.position.set(car.pos.x, 0, car.pos.z);
  car.mesh.rotation.y = car.heading;
  const spin = (car.speed * dt) / 0.42;
  for (const wheel of car.mesh.userData.wheels) wheel.rotation.z -= spin;
  return hit;
}
export function updateTraffic(game, dt) {
  for (const car of game.cars.traffic) {
    if (!car.targetNode) continue;
    const dx = car.targetNode.x - car.prevNode.x;
    const dz = car.targetNode.z - car.prevNode.z;
    const len = Math.hypot(dx, dz) || 1;
    const laneX = car.targetNode.x + (-dz / len) * 2.5;
    const laneZ = car.targetNode.z + (dx / len) * 2.5;
    car.heading += steerToward(car, laneX, laneZ, 1.6 * dt);
    car.speed = isIntersection(car.pos.x, car.pos.z) ? CAR.trafficSpeed * 0.6 : CAR.trafficSpeed;
    advanceCar(game, car, dt);
    const dist = Math.hypot(car.targetNode.x - car.pos.x, car.targetNode.z - car.pos.z);
    if (dist < 5) {
      const options = nodeNeighbours(game.roads, car.targetNode).filter((n) => n.key !== car.prevNode.key);
      car.prevNode = car.targetNode;
      car.targetNode = options.length ? game.rng.pick(options) : car.prevNode;
    }
  }
}
export function updatePlayerCar(game, dt) {
  const car = game.player.car;
  if (!car) return;
  if (car.health <= 0) {
    wreckCar(game, car);
    return;
  }
  const input = game.input;
  const drive = input.drive();
  const steer = input.steer();
  if (drive > 0) car.speed += car.accel * dt;
  else if (drive < 0) {
    car.speed = car.speed > 0.5 ? car.speed - CAR.brake * dt : car.speed - car.accel * 0.5 * dt;
  } else {
    car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 8 * dt);
  }
  car.speed = Math.max(-CAR.reverseTopSpeed, Math.min(car.topSpeed, car.speed));
  const steerAmount = CAR.steerRate * steer * Math.min(1, Math.abs(car.speed) / 8) * Math.sign(car.speed || 1);
  car.heading -= steerAmount * dt;
  const hit = advanceCar(game, car, dt);
  if (hit && Math.abs(car.speed) > 6) game.audio.crash();
  const others = [...game.cars.parked, ...game.cars.traffic, ...(game.police.cars || [])];
  if (game.cars.comet) others.push(game.cars.comet);
  if (game.cars.armored) others.push(game.cars.armored);
  let carHit = false;
  for (const other of others) {
    if (other === car || other.disabled) continue;
    const dx = car.pos.x - other.pos.x;
    const dz = car.pos.z - other.pos.z;
    const d = Math.hypot(dx, dz);
    const minD = CAR.radius + 1.7;
    if (d < minD) {
      if (d > 0.001) {
        car.pos.x += (dx / d) * (minD - d);
        car.pos.z += (dz / d) * (minD - d);
      } else {
        car.pos.x += minD;
      }
      carHit = true;
    }
  }
  if (carHit) {
    car.health = Math.max(0, car.health - Math.abs(car.speed) * 0.4);
    car.speed = Math.abs(car.speed) > 4 ? car.speed * 0.2 : 0;
    if (Math.abs(car.speed) > 6) game.audio.crash();
    car.mesh.position.set(car.pos.x, 0, car.pos.z);
  }
  if (car.health <= 0) {
    wreckCar(game, car);
    return;
  }
  for (const ped of game.peds) {
    if (!ped.alive) continue;
    const d = Math.hypot(ped.pos.x - car.pos.x, ped.pos.z - car.pos.z);
    if (d < 2.2 && Math.abs(car.speed) > 3) {
      ped.alive = false;
      ped.mesh.visible = false;
      game.police.commitCrime(1);
      game.hud.flash('You hit a pedestrian! The cops are coming.');
    }
  }
  game.audio.setEngine(Math.abs(car.speed) / car.topSpeed);
}
export function enterCar(game, car) {
  game.player.car = car;
  game.player.onFoot = false;
  game.player.mesh.visible = false;
  if (car.kind === 'parked' || car.kind === 'comet') {
    car.stolen = true;
    game.cars.parked = game.cars.parked.filter((c) => c !== car);
    if (car.kind === 'comet') game.cars.comet = null;
    game.audio.honkShort();
  }
  if (car.kind === 'armored') {
    car.stolen = true;
    game.cars.armored = null;
  }
}
export function exitCar(game) {
  const car = game.player.car;
  if (!car) return;
  const sideX = car.pos.x + Math.sin(car.heading) * 2.4;
  const sideZ = car.pos.z + Math.cos(car.heading) * 2.4;
  game.player.pos.set(sideX, 0, sideZ);
  game.player.heading = car.heading;
  game.player.car = null;
  game.player.onFoot = true;
  game.player.mesh.visible = true;
  game.player.mesh.position.copy(game.player.pos);
  game.audio.setEngine(0);
  if (car.kind === 'parked' && !game.cars.parked.includes(car)) game.cars.parked.push(car);
  if (car.kind === 'comet' && !game.cars.comet) game.cars.comet = car;
  if (car.kind === 'armored' && !game.cars.armored) game.cars.armored = car;
}
export function nearestStealableCar(game) {
  const p = game.player.pos;
  let best = null;
  let bestD = 4;
  const candidates = [...game.cars.parked];
  if (game.cars.comet) candidates.push(game.cars.comet);
  if (game.cars.armored) candidates.push(game.cars.armored);
  for (const car of candidates) {
    const d = Math.hypot(car.pos.x - p.x, car.pos.z - p.z);
    if (d < bestD) {
      bestD = d;
      best = car;
    }
  }
  return best;
}
export function spawnPoliceCar(game) {
  const node = nearestNode(game.roads, game.player.pos.x, game.player.pos.z);
  const mesh = createCarMesh(0xffffff, 'police');
  const car = makeCarState(mesh, node.x + game.rng.range(-6, 6), node.z + game.rng.range(-6, 6), 0, 'police', CAR.policeTopSpeed, 'police');
  placeOnRoad(game, car, car.pos.x, car.pos.z, car.heading);
  return car;
}
