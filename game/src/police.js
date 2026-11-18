// Wanted stars and the police who answer them. Crimes raise the level, police
// cars spawn on the roads and chase the player, ramming to slow them down.
// Lay low with no police close by and the heat cools off, star by star.
import * as THREE from 'three';
import { POLICE, CAR } from './config.js';
import { spawnPoliceCar } from './vehicles.js';
import { resolveBuildingCollision } from './city.js';

export function createPolice(game) {
  const state = {
    wanted: 0,
    cars: [],
    decayTimer: 0,
    decayArmed: false,
    ramCooldown: 0,
  };

  /** A crime happened: raise the wanted level (never above 5). */
  function commitCrime(stars) {
    if (state.wanted >= 5) return;
    state.wanted = Math.min(5, state.wanted + stars);
    state.decayTimer = 0;
    game.hud.flash(`Wanted level ${state.wanted} — the Solara Bay PD is on you!`);
  }

  /** Keep the right number of police cars on the road for the wanted level. */
  function keepCars() {
    const want = Math.min(state.wanted, POLICE.maxActiveCars);
    while (state.cars.length < want) {
      state.cars.push(spawnPoliceCar(game));
    }
    while (state.cars.length > want) {
      const car = state.cars.pop();
      game.scene.remove(car.mesh);
    }
  }

  /** Chase the player: steer at them, ram when close, flash the light bar. */
  function update(dt) {
    keepCars();
    state.ramCooldown = Math.max(0, state.ramCooldown - dt);
    const playerPos = game.player.car ? game.player.car.pos : game.player.pos;
    let nearestPolice = Infinity;
    for (const car of state.cars) {
      const dx = playerPos.x - car.pos.x;
      const dz = playerPos.z - car.pos.z;
      const dist = Math.hypot(dx, dz);
      nearestPolice = Math.min(nearestPolice, dist);
      const wantedHeading = Math.atan2(-dz, dx);
      let diff = wantedHeading - car.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      car.heading += Math.max(-1.8 * dt, Math.min(1.8 * dt, diff * 2));
      car.speed = Math.min(CAR.policeTopSpeed, car.speed + 14 * dt);
      const nx = car.pos.x + Math.cos(car.heading) * car.speed * dt;
      const nz = car.pos.z - Math.sin(car.heading) * car.speed * dt;
      car.pos.set(nx, 0, nz);
      // Police cars cannot drive through buildings: they slide along the wall
      // and lose speed, which is how a driver shakes them at a corner.
      if (resolveBuildingCollision(car.pos, CAR.radius, game.city.colliders)) car.speed *= 0.5;
      car.mesh.position.set(car.pos.x, 0, car.pos.z);
      car.mesh.rotation.y = car.heading;
      // Flash the light bar, red then blue.
      const blink = Math.floor(game.time * 4) % 2 === 0;
      if (car.mesh.userData.lightR) {
        car.mesh.userData.lightR.material.emissive.setHex(blink ? 0xff0000 : 0x220000);
        car.mesh.userData.lightB.material.emissive.setHex(blink ? 0x000022 : 0x0000ff);
      }
      // Ram: shove the player's car and chip their health.
      if (dist < 4.5 && state.ramCooldown <= 0) {
        state.ramCooldown = POLICE.ramCooldown;
        game.player.health = Math.max(0, game.player.health - POLICE.ramDamage);
        game.player.lastHitAt = game.time;
        game.hud.shake();
        if (game.player.car) {
          game.player.car.speed *= 0.6;
          game.player.car.pos.x += (dx / dist) * 1.5;
          game.player.car.pos.z += (dz / dist) * 1.5;
        }
      }
    }
    // Cool off: no police near for a while, lose a star. The first star takes
    // `after` seconds; later stars take `interval` each. During the final
    // mission's escape stage the heat cools off faster, so the chase ends.
    if (state.wanted > 0) {
      const escaping = game.missions.state.index === 2 && game.missions.state.stage === 2;
      const after = escaping ? POLICE.escapeDecayAfterSeconds : POLICE.decayAfterSeconds;
      const interval = escaping ? POLICE.escapeDecayIntervalSeconds : POLICE.decayIntervalSeconds;
      if (nearestPolice > 80) {
        state.decayTimer += dt;
        const threshold = state.decayArmed ? interval : after;
        if (state.decayTimer > threshold) {
          state.decayTimer = 0;
          state.decayArmed = true;
          state.wanted -= 1;
          if (state.wanted === 0) game.hud.flash('You lost them. The heat is off — for now.');
        }
      } else {
        state.decayTimer = 0;
        state.decayArmed = false;
      }
    }
    game.audio.updateSiren(dt, state.wanted);
  }

  return { state, commitCrime, update };
}
