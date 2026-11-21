// Pedestrians: 36 people on the sidewalks. The first six wait at bus
// stops (the taxi fares), the next six chat in groups, the rest stroll
// and occasionally stop to check their phones. They flee a fast car and
// scatter — and the game notices if you run one over.
import { BX, CG, MS, SG, ME, V3, GP, PI } from './geo.js';
import { CITY } from './config.js';
import { isOnRoad } from './roads.js';
import { addBlobShadow } from './v31.js';

const B = (g, w, h, d, m, x = 0, y = 0, z = 0) => {
  const q = new ME(new BX(w, h, d), m);
  q.position.set(x, y, z);
  g.add(q);
  return q;
};
const mt = (c, r = 0.9) => new MS({ color: c, roughness: r });
const SHIRTS = [0xe74c3c, 0x3498db, 0x2ecc71, 0xf39c12, 0x9b59b6, 0xecf0f1, 0x1abc9c, 0xe67e22];
const PANTS = [0x333333, 0x2c3e50, 0x5a4a3a, 0x7f8c8d, 0x2e4053];
const SKINS = [0xd9a066, 0xc98a5a, 0x8a5a3a, 0xe8b88a, 0xf0c8a0];

function createPedestrianMesh(rng) {
  const group = new GP();
  const shirt = mt(rng.pick(SHIRTS));
  const skin = mt(rng.pick(SKINS));
  const legs = mt(rng.pick(PANTS), 1);
  const height = rng.range(0.88, 1.12);
  const build = rng.range(0.85, 1.25);
  const torso = B(group, 0.55 * build, 0.75, 0.32 * build, shirt, 0, 1.05, 0);
  torso.castShadow = true;
  const head = new ME(new SG(0.22, 12, 10), skin);
  head.position.y = 1.65;
  group.add(head);
  const hair = new ME(new SG(0.23, 12, 8, 0, PI * 2, 0, PI / 2), mt(rng.pick([0x1a1a1a, 0x4a2a1a, 0x8a6a3a, 0x666666]), 1));
  hair.position.y = 1.69;
  group.add(hair);
  const neck = new ME(new CG(0.08, 0.1, 0.16, 8), skin);
  neck.position.y = 1.48;
  group.add(neck);
  if (rng.chance(0.3)) {
    const hat = new ME(new CG(0.28, 0.3, 0.08, 10), mt(rng.pick([0x8a1a1a, 0x2a4a6a, 0xf1c40f])));
    hat.position.y = 1.85;
    group.add(hat);
  }
  if (rng.chance(0.25)) {
    B(group, 0.3, 0.4, 0.12, mt(0x6a4a2a, 1), 0, 1.1, -0.22);
  }
  const legL = B(group, 0.2, 0.6, 0.24, legs, -0.14, 0.3, 0);
  const legR = B(group, 0.2, 0.6, 0.24, legs, 0.14, 0.3, 0);
  const armL = B(group, 0.16, 0.55, 0.18, shirt, -0.38, 1.05, 0);
  const armR = B(group, 0.16, 0.55, 0.18, shirt, 0.38, 1.05, 0);
  group.userData.legL = legL;
  group.userData.legR = legR;
  group.userData.armL = armL;
  group.userData.armR = armR;
  const phone = B(group, 0.08, 0.16, 0.03, mt(0x111111, 0.4), 0.38, 0.85, 0.25);
  phone.visible = false;
  group.userData.phone = phone;
  group.scale.set(1, height, 1);
  // A blob shadow, so pedestrians stop floating. The group's Y scale
  // stretches it up to 12% in one axis — invisible on a soft blob.
  addBlobShadow(group, 0, 0, 0.9, 0.9, 0.55);
  return group;
}

function randomSidewalkPoint(rng) {
  const line = rng.pick(CITY.roadLinesX);
  const along = rng.range(-360, 360);
  const side = rng.pick([-1, 1]) * (CITY.roadWidth / 2 + 1.8);
  if (rng.chance(0.5)) return { x: line + side, z: along };
  return { x: along, z: line + side };
}

export function spawnPedestrians(game, count) {
  const rng = game.rng;
  const stops = game.city.landmarks.busStops;
  const chatSpots = [{ x: 14, z: 26 }, { x: -30, z: 252 }];
  for (let i = 0; i < count; i += 1) {
    let mode = 'stroll';
    let point = randomSidewalkPoint(rng);
    if (i < 6) {
      mode = 'wait';
      const stop = stops[i % stops.length];
      point = { x: stop.x + rng.range(-1.5, 1.5), z: stop.z + rng.range(-1.5, 1.5) };
    } else if (i < 12) {
      mode = 'chat';
      const spot = chatSpots[Math.floor((i - 6) / 3)];
      const angle = ((i - 6) % 3) * (PI * 2 / 3);
      point = { x: spot.x + Math.cos(angle) * 1.4, z: spot.z + Math.sin(angle) * 1.4 };
    }
    const mesh = createPedestrianMesh(rng);
    mesh.position.set(point.x, 0, point.z);
    if (mode === 'chat') mesh.rotation.y = Math.atan2(-point.x + chatSpots[Math.floor((i - 6) / 3)].x, -point.z + chatSpots[Math.floor((i - 6) / 3)].z);
    game.scene.add(mesh);
    game.peds.push({
      mesh,
      pos: new V3(point.x, 0, point.z),
      target: randomSidewalkPoint(rng),
      speed: rng.range(1.1, 1.8),
      alive: true,
      phase: rng.range(0, PI * 2),
      mode,
      waiting: mode === 'wait',
      chatSpot: mode === 'chat' ? chatSpots[Math.floor((i - 6) / 3)] : null,
    });
  }
}

export function updatePedestrians(game, dt) {
  for (const ped of game.peds) {
    if (!ped.alive) continue;
    if ((ped.mode === 'wait' && ped.waiting) || ped.mode === 'chat') {
      const bob = Math.sin(game.time * 2 + ped.phase) * 0.03;
      ped.mesh.position.y = bob;
      continue;
    }
    const car = game.player.car;
    let fleeing = false;
    if (car && Math.abs(car.speed) > 5) {
      const d = Math.hypot(ped.pos.x - car.pos.x, ped.pos.z - car.pos.z);
      if (d < 10) {
        fleeing = true;
        const away = Math.atan2(ped.pos.x - car.pos.x, ped.pos.z - car.pos.z);
        ped.target = {
          x: ped.pos.x + Math.sin(away) * 20,
          z: ped.pos.z + Math.cos(away) * 20,
        };
      }
    }
    const dx = ped.target.x - ped.pos.x;
    const dz = ped.target.z - ped.pos.z;
    if (!fleeing && ped.mode === 'stroll') {
      if (ped.phonePause === undefined) ped.phonePause = 0;
      if (ped.phoneTimer === undefined) ped.phoneTimer = game.rng.range(10, 25);
      if (ped.phoneTimer !== undefined) {
        ped.phoneTimer -= dt;
        if (ped.phoneTimer <= 0) { ped.phonePause = game.rng.range(2, 4); ped.phoneTimer = undefined; }
      }
      if (ped.phonePause > 0) {
        ped.phonePause -= dt;
        ped.mesh.userData.phone.visible = true;
        ped.mesh.userData.armR.rotation.x = -1.2;
        ped.mesh.position.copy(ped.pos);
        continue;
      }
      ped.mesh.userData.phone.visible = false;
    }
    const dist = Math.hypot(dx, dz);
    if (dist < 1.5) {
      ped.target = randomSidewalkPoint(game.rng);
      continue;
    }
    const speed = fleeing ? ped.speed * 2.4 : ped.speed;
    ped.pos.x += (dx / dist) * speed * dt;
    ped.pos.z += (dz / dist) * speed * dt;
    ped.mesh.position.copy(ped.pos);
    ped.mesh.rotation.y = Math.atan2(dx, dz);
    const swing = Math.sin(game.time * 8 + ped.phase) * 0.45;
    ped.mesh.userData.legL.rotation.x = swing;
    ped.mesh.userData.legR.rotation.x = -swing;
    ped.mesh.userData.armL.rotation.x = -swing;
    ped.mesh.userData.armR.rotation.x = swing;
    if (ped.pos.z > 300) ped.target = randomSidewalkPoint(game.rng);
  }
}
