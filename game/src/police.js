// Police: wanted stars, chase cars that ram, roadblocks at 3 stars, the
// helicopter at 4 stars, and the heat cooling off when the player lays low.
import * as THREE from 'three';
import { BX, CN, CI, MB, MS, ME, GP, PI } from './geo.js';
import { POLICE, CAR } from './config.js';
import { spawnPoliceCar } from './vehicles.js';
import { nearestNode } from './roads.js';
import { resolveBuildingCollision } from './city.js';

const B = (g, w, h, d, m, x = 0, y = 0, z = 0) => {
  const q = new ME(new BX(w, h, d), m);
  q.position.set(x, y, z);
  g.add(q);
  return q;
};
const mt = (c, r = 0.9) => new MS({ color: c, roughness: r });

function rotatedAABB(x, z, halfLen, halfWid, angle) {
  const c = Math.abs(Math.cos(angle));
  const s = Math.abs(Math.sin(angle));
  const hx = halfLen * c + halfWid * s;
  const hz = halfLen * s + halfWid * c;
  return { minX: x - hx, maxX: x + hx, minZ: z - hz, maxZ: z + hz };
}

function createHeli() {
  const g = new GP();
  const bodyMat = mt(0x2a2f36, 0.5);
  // Child 0 is the body — shots.js recolors it.
  const body = B(g, 2.4, 1.6, 4.5, bodyMat, 0, 0, 0);
  body.castShadow = true;
  const glass = B(g, 2.0, 0.9, 1.4, mt(0x14181c, 0.2), 0, 0.3, 1.6);
  glass.castShadow = true;
  // Tail boom to z=-5.8, tail fin and rear rotor.
  B(g, 0.45, 0.45, 4.0, bodyMat, 0, 0.2, -4.0);
  B(g, 0.1, 1.3, 0.9, mt(0xd21f2b, 0.6), 0, 0.6, -5.7);
  const rearRotor = B(g, 0.08, 1.7, 0.3, mt(0x222222, 0.6), 0.3, 0.5, -5.7);
  // Main rotor: 9 m across, spins in update().
  const rotor = B(g, 9, 0.08, 0.5, mt(0x222222, 0.6), 0, 1.15, 0);
  g.userData.rotor = rotor;
  g.userData.rearRotor = rearRotor;
  // Skids.
  for (const s of [-0.9, 0.9]) B(g, 0.12, 0.12, 3.4, mt(0x333333, 0.6), s, -1.0, 0);
  // Searchlight cone under the belly. Shots hide it (the soft beam
  // sprites carry the light instead); in play it marks the heli's pool.
  const spot = new ME(
    new CN(2.2, 0.5, 6, 12, 1, true),
    new MB({ color: 0xfff2cc, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false }),
  );
  spot.position.y = -3.4;
  spot.rotation.x = PI;
  g.add(spot);
  g.userData.spotlight = spot;
  return g;
}

export function createPolice(game) {
  const state = { wanted: 0, cars: [] };
  let lastCrimeAt = -100;
  let lastDecayAt = 0;
  let roadblock = null;
  let roadblockAt = -100;

  const heli = createHeli();
  heli.visible = false;
  game.scene.add(heli);

  function spawnChaser() {
    const p = game.player.car ? game.player.car.pos : game.player.pos;
    const node = nearestNode(game.roads, p.x + game.rng.range(-60, 60), p.z + game.rng.range(-60, 60));
    const car = spawnPoliceCar(game);
    car.pos.set(node.x, 0, node.z);
    car.heading = game.rng.range(0, PI * 2);
    car.mesh.position.copy(car.pos);
    car.mesh.rotation.y = car.heading;
    state.cars.push(car);
    return car;
  }

  function placeRoadblock() {
    const p = game.player.car ? game.player.car.pos : game.player.pos;
    const ahead = nearestNode(game.roads, p.x, p.z);
    const cars = [];
    for (const s of [-1, 1]) {
      const car = spawnPoliceCar(game);
      const along = s * 2.5;
      car.pos.set(ahead.x + along, 0, ahead.z + s * 3.5);
      car.heading = PI / 2;
      car.mesh.position.copy(car.pos);
      car.mesh.rotation.y = car.heading;
      car.userData = car.userData || {};
      car.roadblock = true;
      state.cars.push(car);
      cars.push(car);
    }
    roadblock = cars;
    roadblockAt = game.time;
  }

  function commitCrime(n) {
    state.wanted = Math.min(5, state.wanted + n);
    lastCrimeAt = game.time;
    const max = state.wanted >= 4 ? POLICE.maxActiveCarsHigh : POLICE.maxActiveCars;
    while (state.cars.filter((c) => !c.wrecked).length < Math.min(state.wanted + 1, max)) {
      spawnChaser();
    }
    if (state.wanted >= POLICE.heliAtStars && !heli.visible) {
      heli.visible = true;
      const p = game.player.car ? game.player.car.pos : game.player.pos;
      heli.position.set(p.x + 12, 38, p.z + 12);
    }
    if (state.wanted >= POLICE.roadblockAtStars && !roadblock && game.time - roadblockAt > 20) {
      placeRoadblock();
    }
  }

  function update(dt) {
    game.audio.updateSiren(dt, state.wanted);
    const target = game.player.car ? game.player.car.pos : game.player.pos;
    // Helicopter: hover over the player, rotor spinning.
    if (state.wanted >= POLICE.heliAtStars) {
      heli.visible = true;
      const hx = target.x + 12;
      const hz = target.z + 12;
      heli.position.x += (hx - heli.position.x) * Math.min(1, 0.8 * dt);
      heli.position.z += (hz - heli.position.z) * Math.min(1, 0.8 * dt);
      heli.position.y = 38 + Math.sin(game.time * 0.8) * 1.2;
      heli.rotation.y += dt * 0.15;
      heli.userData.rotor.rotation.y += dt * 22;
      heli.userData.rearRotor.rotation.x += dt * 18;
    } else {
      heli.visible = false;
    }
    // Chase cars: steer at the player, ram when close.
    for (const car of state.cars) {
      if (car.wrecked) continue;
      if (car.roadblock) {
        car.mesh.position.copy(car.pos);
        continue;
      }
      const dx = target.x - car.pos.x;
      const dz = target.z - car.pos.z;
      const dist = Math.hypot(dx, dz);
      const want = Math.atan2(-dz, dx);
      let diff = want - car.heading;
      while (diff > PI) diff -= PI * 2;
      while (diff < -PI) diff += PI * 2;
      car.heading += Math.max(-2.2 * dt, Math.min(2.2 * dt, diff));
      const top = dist > 60 ? CAR.policeTopSpeed : CAR.policeTopSpeed * 0.85;
      car.speed += (top - car.speed) * Math.min(1, 1.5 * dt);
      car.pos.x += Math.cos(car.heading) * car.speed * dt;
      car.pos.z += -Math.sin(car.heading) * car.speed * dt;
      resolveBuildingCollision(car.pos, CAR.radius, game.city.colliders);
      car.mesh.position.copy(car.pos);
      car.mesh.rotation.y = car.heading;
      if (dist < 3.2) {
        if (!car.ramAt || game.time - car.ramAt > POLICE.ramCooldown) {
          car.ramAt = game.time;
          const victim = game.player.car;
          if (victim) {
            victim.health -= POLICE.ramDamage * 4;
            car.speed *= 0.3;
          } else {
            game.player.health -= POLICE.ramDamage;
            game.player.lastHitAt = game.time;
          }
          game.audio.crash();
          game.hud.shake();
        }
      }
      if (car.health <= 0) {
        car.wrecked = true;
        car.speed = 0;
        game.audio.wreck();
      }
    }
    // Drop wrecked cars from the active list.
    state.cars = state.cars.filter((c) => {
      if (c.wrecked) {
        game.scene.remove(c.mesh);
        return false;
      }
      return true;
    });
    if (roadblock) {
      roadblock = roadblock.filter((c) => !c.wrecked);
      if (state.wanted < POLICE.roadblockAtStars || roadblock.length === 0) {
        for (const c of roadblock) c.roadblock = false;
        roadblock = null;
      }
    }
    // Heat cools off when the player lays low.
    const escaping = game.missions.state.escaping;
    const after = escaping ? POLICE.escapeDecayAfterSeconds : POLICE.decayAfterSeconds;
    const interval = escaping ? POLICE.escapeDecayIntervalSeconds : POLICE.decayIntervalSeconds;
    if (state.wanted > 0 && game.time - lastCrimeAt > after && game.time - lastDecayAt > interval) {
      lastDecayAt = game.time;
      state.wanted -= 1;
    }
  }

  return { state, commitCrime, update, heli };
}
