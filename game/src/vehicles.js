// Cars v2: nine models, each its own silhouette; traffic x2, dealer lot,
// armored van by the bank, bodywork takes hits (garage fixes it).
// A car faces (cos h, -sin h), local +X is its nose.
import * as THREE from 'three';
import { CAR, CAR_MODELS, COLOURS, WORLD } from './config.js';
import { nodeNeighbours, nearestNode } from './roads.js';
import { resolveBuildingCollision } from './city.js';

// Per-model silhouette, built from boxes. Length runs along local X; the nose is at +X.
export function createCarMesh(color, kind = 'sedan') {
  const group = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.4 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x1a2a3a, roughness: 0.2, metalness: 0.6 });
  const tyre = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 1 });
  const model = CAR_MODELS[kind] || CAR_MODELS.sedan;
  const len = model.len;
  const bodyH = model.height;

  if (kind === 'van' || kind === 'armored' || kind === 'truck' || kind === 'bus') {
    // Tall box body: the body IS the shape.
    const body = new THREE.Mesh(new THREE.BoxGeometry(len, bodyH, 2.1), paint);
    body.position.y = 0.5 + bodyH / 2;
    body.castShadow = true;
    group.add(body);
    if (kind === 'truck') {
      // A cab up front, a flat bed behind it.
      const cab = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.3, 2.1), paint);
      cab.position.set(len / 2 - 0.8, 1.5, 0);
      group.add(cab);
      const bed = new THREE.Mesh(new THREE.BoxGeometry(len - 2.4, 0.3, 2), new THREE.MeshStandardMaterial({ color: 0x555a60, roughness: 1 }));
      bed.position.set(-0.8, 1.1, 0);
      group.add(bed);
    }
    if (kind === 'bus') {
      // A window strip along both sides.
      for (const side of [-1, 1]) {
        const strip = new THREE.Mesh(new THREE.BoxGeometry(len - 1, 0.8, 0.05), glass);
        strip.position.set(0, 1.9, side * 1.06);
        group.add(strip);
      }
    }
    if (kind === 'armored') {
      // Plated: grey armour slabs and a roof light bar.
      const plate = new THREE.Mesh(new THREE.BoxGeometry(len - 0.5, 0.8, 2.2), new THREE.MeshStandardMaterial({ color: 0x6a6f75, roughness: 0.5, metalness: 0.6 }));
      plate.position.y = 1.5;
      group.add(plate);
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.25, 1.4), new THREE.MeshStandardMaterial({ color: 0xffe14d, emissive: 0x886600 }));
      bar.position.set(0, bodyH + 0.6, 0);
      group.add(bar);
    }
  } else {
    // Low body plus a cabin, scaled per model: the compact is short and tall,
    // the muscle has a hood scoop, the Comet GT is long and flat.
    const body = new THREE.Mesh(new THREE.BoxGeometry(len, 0.55, 2), paint);
    body.position.y = 0.55;
    body.castShadow = true;
    group.add(body);
    const cabinL = kind === 'sport' ? len * 0.38 : len * 0.45;
    const cabinH = kind === 'sport' ? 0.45 : bodyH - 0.3;
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(cabinL, cabinH, 1.7), glass);
    cabin.position.set(-0.2, 0.85 + cabinH / 2, 0);
    cabin.castShadow = true;
    group.add(cabin);
    if (kind === 'muscle') {
      const scoop = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.25, 0.8), new THREE.MeshStandardMaterial({ color: 0x222831, roughness: 0.4 }));
      scoop.position.set(len / 2 - 1, 0.9, 0);
      group.add(scoop);
    }
    if (kind === 'pickup') {
      // An open bed behind the cab, with two side rails.
      const bed = new THREE.Mesh(new THREE.BoxGeometry(len * 0.45, 0.5, 1.9), new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.9 }));
      bed.position.set(-len / 2 + len * 0.225, 0.7, 0);
      group.add(bed);
    }
    if (kind === 'taxi') {
      // A yellow roof sign and black door stripes.
      const roofSign = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.25, 0.9), new THREE.MeshStandardMaterial({ color: 0xffe14d, emissive: 0x886600 }));
      roofSign.position.set(-0.2, 1.5, 0);
      group.add(roofSign);
      for (const side of [-1, 1]) {
        const check = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.4, 0.05), new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.6 }));
        check.position.set(0, 0.55, side * 1.02);
        group.add(check);
      }
    }
    if (kind === 'sport') {
      // The Comet GT: a rear spoiler and a yellow stripe.
      const spoiler = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.08, 1.8), paint);
      spoiler.position.set(-len / 2 + 0.15, 1.15, 0);
      group.add(spoiler);
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(len, 0.02, 0.5), new THREE.MeshStandardMaterial({ color: 0xffd94d, roughness: 0.4 }));
      stripe.position.set(0, 0.84, 0);
      group.add(stripe);
    }
  }
  if (kind === 'police') {
    // White body with a blue stripe and a light bar.
    const white = new THREE.Mesh(new THREE.BoxGeometry(len, bodyH, 2), new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.4, metalness: 0.3 }));
    white.position.y = 0.55;
    white.castShadow = true;
    group.add(white);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(len * 0.5, bodyH * 0.9, 2.02), new THREE.MeshStandardMaterial({ color: 0x1a3a8f, roughness: 0.4 }));
    stripe.position.y = 0.55;
    group.add(stripe);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.18, 1.2), new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.5 }));
    bar.position.set(-0.1, 1.6, 0);
    group.add(bar);
    const lightR = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.2, 0.55), new THREE.MeshStandardMaterial({ color: 0xff2222, emissive: 0xaa0000 }));
    lightR.position.set(-0.1, 1.72, 0.3);
    const lightB = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.2, 0.55), new THREE.MeshStandardMaterial({ color: 0x2244ff, emissive: 0x0000aa }));
    lightB.position.set(-0.1, 1.72, -0.3);
    group.add(lightR, lightB);
    group.userData.lightR = lightR;
    group.userData.lightB = lightB;
  }
  // Headlights and taillights.
  const headMat = new THREE.MeshStandardMaterial({ color: 0xfff8c0, emissive: 0x888866 });
  const tailMat = new THREE.MeshStandardMaterial({ color: 0xff2222, emissive: 0x660000 });
  for (const side of [-0.7, 0.7]) {
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.18, 0.35), headMat);
    head.position.set(len / 2, 0.6, side);
    group.add(head);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.18, 0.35), tailMat);
    tail.position.set(-len / 2, 0.6, side);
    group.add(tail);
  }
  // Wheels, bigger on the truck and the bus.
  const wheelR = kind === 'truck' || kind === 'bus' ? 0.55 : 0.42;
  const wheels = [];
  const wheelGeo = new THREE.CylinderGeometry(wheelR, wheelR, 0.3, 10);
  for (const [wx, wz] of [[len * 0.32, 0.95], [len * 0.32, -0.95], [-len * 0.32, 0.95], [-len * 0.32, -0.95]]) {
    const wheel = new THREE.Mesh(wheelGeo, tyre);
    wheel.rotation.x = Math.PI / 2;
    wheel.position.set(wx, wheelR, wz);
    wheel.castShadow = true;
    group.add(wheel);
    wheels.push(wheel);
  }
  group.userData.wheels = wheels;
  group.userData.bodyLen = len;
  return group;
}

/** A car: mesh, position, heading, speed, role (`kind`) and bodywork
 * (`model` — sedan, taxi, sport...; fares and the dealer need the model). */
export function makeCarState(mesh, x, z, heading, kind, topSpeed, model = 'sedan') {
  const modelDef = CAR_MODELS[model];
  return {
    mesh,
    pos: new THREE.Vector3(x, 0, z),
    heading,
    speed: 0,
    kind,
    model,
    topSpeed,
    accel: modelDef ? modelDef.accel : CAR.accel,
    health: CAR.maxHealth,
    // Traffic only: the node it is driving toward.
    targetNode: null,
    prevNode: null,
    // Dealer lot only: the price on the windscreen.
    forSale: false,
    salePrice: 0,
    stolen: false,
  };
}

/** Drop a car in the world, facing along its heading. */
function placeOnRoad(game, car, x, z, heading) {
  car.pos.set(x, 0, z);
  car.heading = heading;
  car.mesh.position.copy(car.pos);
  car.mesh.rotation.y = heading;
  game.scene.add(car.mesh);
}

/** Spawn the cars: the Comet GT, the armored van, the stealable parked cars,
 * three cars for sale on the dealer lot, and the traffic stream. */
export function spawnCars(game) {
  const rng = game.rng;
  const parkedSpots = [
    { x: 60, z: 18, heading: Math.PI / 2, color: 0xf1c40f, kind: 'taxi' },
    { x: 150, z: 66, heading: Math.PI / 2, color: 0x2e86c1, kind: 'sedan' },
    { x: -60, z: -66, heading: 0, color: 0xecf0f1, kind: 'compact' },
    { x: -120, z: 130, heading: Math.PI, color: 0xe67e22, kind: 'pickup' },
    { x: 300, z: -120, heading: 0, color: 0xc0392b, kind: 'muscle' }, // off road x=240, the chase route
    { x: 120, z: -240, heading: Math.PI / 2, color: 0x16a085, kind: 'van' },
    { x: 300, z: 66, heading: Math.PI, color: 0x7d3c98, kind: 'sedan' },
    { x: -300, z: -180, heading: 0, color: 0x2c3e50, kind: 'truck' },
    { x: 330, z: 180, heading: Math.PI / 2, color: 0xf1c40f, kind: 'compact' },
    { x: 180, z: 240, heading: 0, color: 0x2e86c1, kind: 'sedan' },
    { x: -180, z: 240, heading: Math.PI / 2, color: 0x16a085, kind: 'van' },
    { x: 60, z: -300, heading: Math.PI, color: 0xecf0f1, kind: 'sedan' }, // off road x=0, the race route
  ];
  for (const spot of parkedSpots) {
    const mesh = createCarMesh(spot.color, spot.kind);
    const model = CAR_MODELS[spot.kind];
    const car = makeCarState(mesh, spot.x, spot.z, spot.heading, 'parked', model.topSpeed, spot.kind);
    placeOnRoad(game, car, spot.x, spot.z, spot.heading);
    game.cars.parked.push(car);
  }
  // The Comet GT: the red sports car the early missions revolve around.
  const comet = createCarMesh(COLOURS.cometRed, 'sport');
  const cometCar = makeCarState(comet, game.city.landmarks.cometSpot.x, game.city.landmarks.cometSpot.z, Math.PI / 2, 'comet', CAR.sportTopSpeed, 'sport');
  placeOnRoad(game, cometCar, cometCar.pos.x, cometCar.pos.z, cometCar.heading);
  game.cars.comet = cometCar;
  // The armored van: parked by the bank, the prize of the heist mission.
  const armored = createCarMesh(0x8a8f96, 'armored');
  const armoredCar = makeCarState(armored, game.city.landmarks.armoredSpot.x, game.city.landmarks.armoredSpot.z, Math.PI, 'armored', CAR_MODELS.armored.topSpeed, 'armored');
  placeOnRoad(game, armoredCar, armoredCar.pos.x, armoredCar.pos.z, armoredCar.heading);
  game.cars.armored = armoredCar;
  // Three cars for sale on the dealer lot (block 210,-150, in front of the shop).
  const saleKinds = ['sport', 'muscle', 'van'];
  saleKinds.forEach((kind, i) => {
    const mesh = createCarMesh(rng.pick(COLOURS.car), kind);
    const model = CAR_MODELS[kind];
    const car = makeCarState(mesh, 192 + i * 12, -132, -Math.PI / 2, 'parked', model.topSpeed, kind);
    car.forSale = true;
    car.salePrice = model.price;
    placeOnRoad(game, car, car.pos.x, car.pos.z, car.heading);
    game.cars.parked.push(car);
  });
  // Traffic: twice v1's fleet, on the whole grid.
  const trafficKinds = ['sedan', 'compact', 'taxi', 'van', 'pickup', 'muscle', 'truck', 'bus', 'sedan', 'compact'];
  for (let i = 0; i < WORLD.trafficCars; i += 1) {
    const node = rng.pick(game.roads.nodes);
    const kind = rng.pick(trafficKinds);
    const mesh = createCarMesh(rng.pick(COLOURS.car), kind);
    const car = makeCarState(mesh, node.x, node.z, rng.pick([0, Math.PI / 2, Math.PI, -Math.PI / 2]), 'traffic', CAR.trafficSpeed, kind);
    car.targetNode = rng.pick(nodeNeighbours(game.roads, node));
    car.prevNode = node;
    car.speed = CAR.trafficSpeed;
    placeOnRoad(game, car, node.x, node.z, car.heading);
    game.cars.traffic.push(car);
  }
}

/** Steer a car toward a point: returns the turn rate to apply this frame. */
function steerToward(car, tx, tz, maxTurn) {
  const dx = tx - car.pos.x;
  const dz = tz - car.pos.z;
  const wanted = Math.atan2(-dz, dx);
  let diff = wanted - car.heading;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return Math.max(-maxTurn, Math.min(maxTurn, diff * 2.2));
}

/**
 * Move a car forward by its speed and heading, with building collision. A hit
 * costs speed and bodywork: v1 only slowed the car when the whole step was
 * cancelled, which let cars slide through a building at a glancing angle; now
 * the car stops at the wall and takes damage. Returns true on a hit.
 */
function advanceCar(game, car, dt) {
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
  }
  car.mesh.position.set(car.pos.x, 0, car.pos.z);
  car.mesh.rotation.y = car.heading;
  const spin = (car.speed * dt) / 0.42;
  for (const wheel of car.mesh.userData.wheels) wheel.rotation.z -= spin;
  return hit;
}

/** Traffic cars drive node to node, turning at intersections, right-hand lane. */
export function updateTraffic(game, dt) {
  for (const car of game.cars.traffic) {
    if (!car.targetNode) continue;
    const dx = car.targetNode.x - car.prevNode.x;
    const dz = car.targetNode.z - car.prevNode.z;
    const len = Math.hypot(dx, dz) || 1;
    const laneX = car.targetNode.x + (-dz / len) * 2.5;
    const laneZ = car.targetNode.z + (dx / len) * 2.5;
    car.heading += steerToward(car, laneX, laneZ, 1.6 * dt);
    car.speed = CAR.trafficSpeed;
    advanceCar(game, car, dt);
    const dist = Math.hypot(car.targetNode.x - car.pos.x, car.targetNode.z - car.pos.z);
    if (dist < 5) {
      const options = nodeNeighbours(game.roads, car.targetNode).filter((n) => n.key !== car.prevNode.key);
      car.prevNode = car.targetNode;
      car.targetNode = options.length ? game.rng.pick(options) : car.prevNode;
    }
  }
}

/** The player's car: arcade throttle, steering and braking from the input. */
export function updatePlayerCar(game, dt) {
  const car = game.player.car;
  if (!car) return;
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
  // Car-to-car: parked cars, traffic and police are solid for the player
  // (traffic ghosts through itself — background flow).
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
        car.pos.x += minD; // dead-centre overlap: push east
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
  // Hitting a pedestrian at speed is a crime, and it shows.
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

/** The player gets in: the car becomes theirs, the person mesh hides. */
export function enterCar(game, car) {
  game.player.car = car;
  game.player.onFoot = false;
  game.player.mesh.visible = false;
  if (car.kind === 'parked' || car.kind === 'comet') {
    car.stolen = true;
    game.cars.parked = game.cars.parked.filter((c) => c !== car);
    if (car.kind === 'comet') game.cars.comet = null;
    game.audio.honk();
  }
  if (car.kind === 'armored') {
    car.stolen = true;
    game.cars.armored = null;
  }
}

/** The player gets out beside the car, on foot again. */
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
}

/** Nearest car the player could get into (within 4 m), or null. */
export function nearestStealableCar(game) {
  const p = game.player.pos;
  let best = null;
  let bestD = 4;
  const candidates = [...game.cars.parked];
  if (game.cars.comet && !game.cars.comet.stolen) candidates.push(game.cars.comet);
  if (game.cars.armored && !game.cars.armored.stolen) candidates.push(game.cars.armored);
  for (const car of candidates) {
    const d = Math.hypot(car.pos.x - p.x, car.pos.z - p.z);
    if (d < bestD) {
      bestD = d;
      best = car;
    }
  }
  return best;
}

/** Where a police car should appear: on the road behind the player. */
export function spawnPoliceCar(game) {
  const node = nearestNode(game.roads, game.player.pos.x, game.player.pos.z);
  const mesh = createCarMesh(0xffffff, 'police');
  const car = makeCarState(mesh, node.x + game.rng.range(-6, 6), node.z + game.rng.range(-6, 6), 0, 'police', CAR.policeTopSpeed, 'police');
  placeOnRoad(game, car, car.pos.x, car.pos.z, car.heading);
  return car;
}
