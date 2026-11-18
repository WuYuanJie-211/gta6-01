// Cars: a boxy mesh factory, the traffic that drives the road grid, and the
// player's own arcade driving. Every car is the same shape in different paint,
// so the city reads as one fleet, and a stolen car is just a car with a driver.
import * as THREE from 'three';
import { CAR } from './config.js';
import { nodeNeighbours, nearestNode } from './roads.js';
import { resolveBuildingCollision } from './city.js';

/** Build a car mesh. `sport` is lower, longer, with a spoiler; `police` is black-and-white with a light bar. */
export function createCarMesh(color, kind = 'normal') {
  const group = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.4 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x1a2a3a, roughness: 0.2, metalness: 0.6 });
  const tyre = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 1 });
  const isSport = kind === 'sport';
  const isPolice = kind === 'police';
  const bodyLen = isSport ? 4.6 : 4.2;
  const bodyH = isSport ? 0.75 : 0.9;

  if (isPolice) {
    const white = new THREE.Mesh(new THREE.BoxGeometry(bodyLen, bodyH, 2), new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.4, metalness: 0.3 }));
    white.position.y = 0.55;
    white.castShadow = true;
    group.add(white);
    const doors = new THREE.Mesh(new THREE.BoxGeometry(bodyLen * 0.5, bodyH * 0.9, 2.02), new THREE.MeshStandardMaterial({ color: 0x1a3a8f, roughness: 0.4 }));
    doors.position.y = 0.55;
    group.add(doors);
  } else {
    const body = new THREE.Mesh(new THREE.BoxGeometry(bodyLen, bodyH, 2), paint);
    body.position.y = 0.55;
    body.castShadow = true;
    group.add(body);
  }
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(bodyLen * 0.45, 0.6, 1.8), glass);
  cabin.position.set(isSport ? -0.2 : -0.1, 1.2, 0);
  cabin.castShadow = true;
  group.add(cabin);
  if (isSport) {
    const spoiler = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 1.9), paint);
    spoiler.position.set(-bodyLen / 2 + 0.15, 1.15, 0);
    group.add(spoiler);
  }
  if (isPolice) {
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
    head.position.set(bodyLen / 2, 0.6, side);
    group.add(head);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.18, 0.35), tailMat);
    tail.position.set(-bodyLen / 2, 0.6, side);
    group.add(tail);
  }
  // Wheels.
  const wheels = [];
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.3, 10);
  for (const [wx, wz] of [[1.35, 0.95], [1.35, -0.95], [-1.35, 0.95], [-1.35, -0.95]]) {
    const wheel = new THREE.Mesh(wheelGeo, tyre);
    wheel.rotation.x = Math.PI / 2;
    wheel.position.set(wx, 0.36, wz);
    wheel.castShadow = true;
    group.add(wheel);
    wheels.push(wheel);
  }
  group.userData.wheels = wheels;
  group.userData.bodyLen = bodyLen;
  return group;
}

/** A car in the world: mesh, position, heading, speed and what kind it is. */
export function makeCarState(mesh, x, z, heading, kind, topSpeed) {
  return {
    mesh,
    pos: new THREE.Vector3(x, 0, z),
    heading,
    speed: 0,
    kind,
    topSpeed,
    // Traffic only: the node it is driving toward.
    targetNode: null,
    prevNode: null,
  };
}

/** Drop a car on the nearest road, facing along it. */
function placeOnRoad(game, car, x, z, heading) {
  car.pos.set(x, 0, z);
  car.heading = heading;
  car.mesh.position.copy(car.pos);
  car.mesh.rotation.y = heading;
  game.scene.add(car.mesh);
}

/** Spawn the parked cars the player can steal, plus the traffic fleet. */
export function spawnCars(game) {
  const rng = game.rng;
  const parkedSpots = [
    { x: 30, z: 8, heading: Math.PI / 2, color: 0x2e86c1 },
    { x: -66, z: 8, heading: Math.PI / 2, color: 0xf1c40f },
    { x: 126, z: -8, heading: -Math.PI / 2, color: 0x16a085 },
    { x: -126, z: 8, heading: Math.PI / 2, color: 0xecf0f1 },
    { x: 66, z: -128, heading: 0, color: 0x7d3c98 },
    { x: -6, z: 186, heading: Math.PI, color: 0xe67e22 },
    { x: 186, z: 66, heading: Math.PI / 2, color: 0xc0392b },
  ];
  for (const spot of parkedSpots) {
    const mesh = createCarMesh(spot.color, 'normal');
    const car = makeCarState(mesh, spot.x, spot.z, spot.heading, 'parked', CAR.normalTopSpeed);
    placeOnRoad(game, car, spot.x, spot.z, spot.heading);
    game.cars.parked.push(car);
  }
  // The Comet GT: the red sports car mission 2 is about.
  const comet = createCarMesh(0xd21f2b, 'sport');
  const cometCar = makeCarState(comet, game.city.landmarks.cometSpot.x, game.city.landmarks.cometSpot.z, Math.PI / 2, 'comet', CAR.sportTopSpeed);
  placeOnRoad(game, cometCar, cometCar.pos.x, cometCar.pos.z, cometCar.heading);
  game.cars.comet = cometCar;

  // Traffic: cars that drive the grid forever.
  for (let i = 0; i < 10; i += 1) {
    const node = rng.pick(game.roads.nodes);
    const mesh = createCarMesh(rng.pick([0xc0392b, 0x2e86c1, 0xf1c40f, 0x7d3c98, 0x16a085, 0xecf0f1, 0x2c3e50, 0xe67e22]), 'normal');
    const car = makeCarState(mesh, node.x, node.z, rng.pick([0, Math.PI / 2, Math.PI, -Math.PI / 2]), 'traffic', CAR.trafficSpeed);
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

/** Move a car forward by its speed and heading, with building collision. */
function advanceCar(game, car, dt) {
  const nx = car.pos.x + Math.cos(car.heading) * car.speed * dt;
  const nz = car.pos.z - Math.sin(car.heading) * car.speed * dt;
  const before = { x: car.pos.x, z: car.pos.z };
  car.pos.x = nx;
  car.pos.z = nz;
  const hit = resolveBuildingCollision(car.pos, CAR.radius, game.city.colliders);
  if (hit) {
    // A building stop: lose speed, and stop dead when the wall cancelled
    // the whole step's movement. (The check must be inside the hit branch:
    // at low speed a free step moves less than a centimetre, which is not
    // a wall — an earlier version zeroed the speed every step and no car
    // could ever get going.)
    car.speed *= 0.4;
    if (Math.hypot(car.pos.x - before.x, car.pos.z - before.z) < 0.001) car.speed = 0;
  }
  car.mesh.position.set(car.pos.x, 0, car.pos.z);
  car.mesh.rotation.y = car.heading;
  // Wheels spin with speed.
  const spin = (car.speed * dt) / 0.36;
  for (const wheel of car.mesh.userData.wheels) wheel.rotation.z -= spin;
}

/** Traffic cars drive node to node, turning at intersections, right-hand lane. */
export function updateTraffic(game, dt) {
  for (const car of game.cars.traffic) {
    if (!car.targetNode) continue;
    // Aim at the target node, offset into the right-hand lane.
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
  if (drive > 0) car.speed += CAR.accel * dt;
  else if (drive < 0) {
    car.speed = car.speed > 0.5 ? car.speed - CAR.brake * dt : car.speed - CAR.accel * 0.5 * dt;
  } else {
    car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 8 * dt);
  }
  car.speed = Math.max(-CAR.reverseTopSpeed, Math.min(car.topSpeed, car.speed));
  const steerAmount = CAR.steerRate * steer * Math.min(1, Math.abs(car.speed) / 8) * Math.sign(car.speed || 1);
  // Heading decreases when steering right: forward is (cos h, -sin h), so a
  // smaller heading swings the nose toward the right-hand side.
  car.heading -= steerAmount * dt;
  advanceCar(game, car, dt);
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
    game.cars.parked = game.cars.parked.filter((c) => c !== car);
    game.audio.honk();
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
  const car = makeCarState(mesh, node.x + game.rng.range(-6, 6), node.z + game.rng.range(-6, 6), 0, 'police', CAR.policeTopSpeed);
  placeOnRoad(game, car, car.pos.x, car.pos.z, car.heading);
  return car;
}
