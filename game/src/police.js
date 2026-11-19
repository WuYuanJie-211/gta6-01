import * as THREE from 'three';
import { POLICE, CAR } from './config.js';
import { spawnPoliceCar } from './vehicles.js';
import { nearestNode } from './roads.js';
import { resolveBuildingCollision } from './city.js';
function rotatedAABB(x, z, halfLen, halfWid, angle) {
  const c = Math.abs(Math.cos(angle));
  const s = Math.abs(Math.sin(angle));
  const hx = halfLen * c + halfWid * s;
  const hz = halfLen * s + halfWid * c;
  return { minX: x - hx, maxX: x + hx, minZ: z - hz, maxZ: z + hz };
}
function createHelicopterMesh() {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x1a3a8f, roughness: 0.5 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.6, 4.5), bodyMat);
  body.castShadow = true;
  group.add(body);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 4), bodyMat);
  tail.position.set(0, 0.3, -4);
  group.add(tail);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.4, 0.8), bodyMat);
  fin.position.set(0, 0.8, -5.8);
  group.add(fin);
  const cockpit = new THREE.Mesh(
    new THREE.BoxGeometry(2.0, 1.0, 1.2),
    new THREE.MeshStandardMaterial({ color: 0x1a2a3a, roughness: 0.2, metalness: 0.6 }),
  );
  cockpit.position.set(0, 0.3, 2.2);
  group.add(cockpit);
  const tailRotor = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.2, 0.3), new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.5 }));
  tailRotor.position.set(0.35, 0.8, -5.8);
  group.add(tailRotor);
  const rotor = new THREE.Mesh(new THREE.BoxGeometry(9, 0.08, 0.5), new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.5 }));
  rotor.position.y = 1.1;
  group.add(rotor);
  const rotor2 = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 9), new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.5 }));
  rotor2.position.y = 1.1;
  group.add(rotor2);
  const skidMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.8 });
  for (const side of [-1, 1]) {
    const skid = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 3.5), skidMat);
    skid.position.set(side * 1.1, -1.1, 0);
    group.add(skid);
  }
  const light = new THREE.Mesh(
    new THREE.ConeGeometry(6, 30, 16, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xfff8c0, transparent: true, opacity: 0.12, side: THREE.DoubleSide }),
  );
  light.position.set(0, -16, 0);
  light.rotation.x = Math.PI;
  group.add(light);
  const bulb = new THREE.Mesh(
    new THREE.SphereGeometry(0.5, 10, 8),
    new THREE.MeshStandardMaterial({ color: 0xfff8c0, emissive: 0xcc9900, roughness: 0.3 }),
  );
  bulb.position.set(0, -1.2, 1.5);
  group.add(bulb);
  group.userData.rotor = rotor;
  group.userData.rotor2 = rotor2;
  group.userData.tailRotor = tailRotor;
  group.visible = false;
  return group;
}
export function createPolice(game) {
  const state = {
    wanted: 0,
    cars: [],
    decayTimer: 0,
    decayArmed: false,
    ramCooldown: 0,
    roadblock: null,
  };
  const heli = createHelicopterMesh();
  game.scene.add(heli);
  function commitCrime(stars) {
    if (state.wanted >= 5) return;
    state.wanted = Math.min(5, state.wanted + stars);
    state.decayTimer = 0;
    game.hud.flash(`Wanted level ${state.wanted} — the Solara Bay PD is on you!`);
  }
  function keepCars() {
    const max = state.wanted >= 4 ? POLICE.maxActiveCarsHigh : POLICE.maxActiveCars;
    const want = Math.min(state.wanted, max);
    while (state.cars.length < want) {
      const car = spawnPoliceCar(game);
      if (state.cars.length % 2 === 1) {
        const playerPos = game.player.car ? game.player.car.pos : game.player.pos;
        const heading = game.player.car ? game.player.car.heading : game.player.heading;
        const ax = playerPos.x + Math.cos(heading) * 70;
        const az = playerPos.z - Math.sin(heading) * 70;
        const node = nearestNode(game.roads, ax, az);
        car.pos.set(node.x, 0, node.z);
        car.mesh.position.copy(car.pos);
      }
      state.cars.push(car);
    }
    while (state.cars.length > want) {
      const car = state.cars.pop();
      game.scene.remove(car.mesh);
    }
  }
  function spawnRoadblock() {
    const playerPos = game.player.car ? game.player.car.pos : game.player.pos;
    const heading = game.player.car ? game.player.car.heading : game.player.heading;
    const ax = playerPos.x + Math.cos(heading) * 80;
    const az = playerPos.z - Math.sin(heading) * 80;
    const node = nearestNode(game.roads, ax, az);
    const perp = heading + Math.PI / 2;
    const barriers = [];
    const colliders = [];
    for (const offset of [-3.5, 3.5]) {
      const bx = node.x + Math.cos(perp) * offset;
      const bz = node.z - Math.sin(perp) * offset;
      const barrier = new THREE.Group();
      const stripe = new THREE.Mesh(
        new THREE.BoxGeometry(5, 1, 0.4),
        new THREE.MeshStandardMaterial({ color: 0xe67e22, roughness: 0.7 }),
      );
      stripe.position.y = 0.9;
      const white = new THREE.Mesh(
        new THREE.BoxGeometry(5, 0.3, 0.42),
        new THREE.MeshStandardMaterial({ color: 0xf5f5f0, roughness: 0.7 }),
      );
      white.position.y = 1.1;
      const legL = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.8, 0.3), new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.8 }));
      legL.position.set(-2.2, 0.4, 0);
      const legR = legL.clone();
      legR.position.x = 2.2;
      barrier.add(stripe, white, legL, legR);
      barrier.position.set(bx, 0, bz);
      barrier.rotation.y = perp;
      barrier.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      game.scene.add(barrier);
      barriers.push(barrier);
      colliders.push(rotatedAABB(bx, bz, 2.5, 0.4, perp));
    }
    for (const c of colliders) game.city.colliders.push(c);
    state.roadblock = { node, barriers, colliders };
    game.hud.flash('Roadblock ahead! Find another way around.');
  }
  function removeRoadblock() {
    if (!state.roadblock) return;
    for (const barrier of state.roadblock.barriers) game.scene.remove(barrier);
    for (const c of state.roadblock.colliders) {
      const i = game.city.colliders.indexOf(c);
      if (i >= 0) game.city.colliders.splice(i, 1);
    }
    state.roadblock = null;
  }
  function update(dt) {
    keepCars();
    state.ramCooldown = Math.max(0, state.ramCooldown - dt);
    const playerPos = game.player.car ? game.player.car.pos : game.player.pos;
    if (state.wanted >= POLICE.roadblockAtStars && !state.roadblock) spawnRoadblock();
    if (state.wanted < POLICE.roadblockAtStars && state.roadblock) removeRoadblock();
    const heliActive = state.wanted >= POLICE.heliAtStars;
    heli.visible = heliActive;
    if (heliActive) {
      heli.position.x += (playerPos.x + 12 - heli.position.x) * Math.min(1, dt * 0.8);
      heli.position.z += (playerPos.z + 12 - heli.position.z) * Math.min(1, dt * 0.8);
      heli.position.y = 38;
      heli.userData.rotor.rotation.y += dt * 22;
      heli.userData.rotor2.rotation.y += dt * 22;
      heli.userData.tailRotor.rotation.x += dt * 30;
      heli.rotation.y = Math.atan2(playerPos.x - heli.position.x, playerPos.z - heli.position.z);
    }
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
      if (resolveBuildingCollision(car.pos, CAR.radius, game.city.colliders)) car.speed *= 0.5;
      car.mesh.position.set(car.pos.x, 0, car.pos.z);
      car.mesh.rotation.y = car.heading;
      const blink = Math.floor(game.time * 4) % 2 === 0;
      if (car.mesh.userData.lightR) {
        car.mesh.userData.lightR.material.emissive.setHex(blink ? 0xff0000 : 0x220000);
        car.mesh.userData.lightB.material.emissive.setHex(blink ? 0x000022 : 0x0000ff);
      }
      if (dist < 4.5 && state.ramCooldown <= 0) {
        state.ramCooldown = POLICE.ramCooldown;
        game.player.health = Math.max(0, game.player.health - POLICE.ramDamage);
        game.player.lastHitAt = game.time;
        game.hud.shake();
        if (game.player.car) {
          game.player.car.speed *= 0.6;
          game.player.car.health = Math.max(0, game.player.car.health - 8);
          game.player.car.pos.x += (dx / dist) * 1.5;
          game.player.car.pos.z += (dz / dist) * 1.5;
        }
      }
    }
    if (state.wanted > 0) {
      const escaping = game.missions.state.escaping;
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
  return { state, commitCrime, update, heli };
}
