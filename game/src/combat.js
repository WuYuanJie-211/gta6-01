import * as THREE from 'three';
import { PLAYER, WEAPONS, ECONOMY } from './config.js';
function createThugMesh() {
  const group = new THREE.Group();
  const shirt = new THREE.MeshStandardMaterial({ color: 0x7b241c, roughness: 0.9 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xc98d5f, roughness: 0.9 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.9, 0.42), shirt);
  torso.position.y = 1.15;
  torso.castShadow = true;
  group.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 10), skin);
  head.position.y = 1.85;
  group.add(head);
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.27, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 1 }));
  hair.position.y = 1.9;
  group.add(hair);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.18, 8), skin);
  neck.position.y = 1.68;
  group.add(neck);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.7, 0.3), new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 1 }));
  legL.position.set(-0.19, 0.35, 0);
  const legR = legL.clone();
  legR.position.x = 0.19;
  group.add(legL, legR);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.65, 0.22), shirt);
  armL.position.set(-0.48, 1.15, 0);
  const armR = armL.clone();
  armR.position.x = 0.48;
  group.add(armL, armR);
  const barBg = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.12, 0.05), new THREE.MeshBasicMaterial({ color: 0x881111 }));
  barBg.position.y = 2.35;
  const barFg = new THREE.Mesh(new THREE.BoxGeometry(1.06, 0.08, 0.06), new THREE.MeshBasicMaterial({ color: 0x33dd33 }));
  barFg.position.y = 2.35;
  group.add(barBg, barFg);
  group.userData.barFg = barFg;
  group.userData.legL = legL;
  group.userData.legR = legR;
  group.userData.armL = armL;
  group.userData.armR = armR;
  return group;
}
function createGunmanMesh() {
  const group = createThugMesh();
  group.children[0].material = new THREE.MeshStandardMaterial({ color: 0x1a1a2e, roughness: 0.9 });
  const gunMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.4, metalness: 0.5 });
  const rifle = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.14, 0.9), gunMat);
  rifle.position.set(0.35, 1.2, 0.35);
  group.add(rifle);
  return group;
}
export function createCombat(game) {
  const enemies = [];
  const tracers = [];
  function spawnThug(x, z) {
    const mesh = createThugMesh();
    mesh.position.set(x, 0, z);
    game.scene.add(mesh);
    const enemy = {
      mesh, kind: 'thug',
      pos: new THREE.Vector3(x, 0, z),
      health: 30, maxHealth: 30,
      punchTimer: 0, shootTimer: 0,
      alive: true,
      phase: game.rng.range(0, Math.PI * 2),
    };
    enemies.push(enemy);
    return enemy;
  }
  function spawnGunman(x, z) {
    const mesh = createGunmanMesh();
    mesh.position.set(x, 0, z);
    game.scene.add(mesh);
    const enemy = {
      mesh, kind: 'gunman',
      pos: new THREE.Vector3(x, 0, z),
      health: 40, maxHealth: 40,
      punchTimer: 0, shootTimer: 1,
      alive: true,
      phase: game.rng.range(0, Math.PI * 2),
    };
    enemies.push(enemy);
    return enemy;
  }
  function spawnTracer(from, to, color = 0xffe14d) {
    const dir = new THREE.Vector3().subVectors(to, from);
    const len = dir.length();
    if (len < 0.1) return;
    const tracer = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, 0.06, len),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 }),
    );
    tracer.position.copy(from).addScaledVector(dir, 0.5);
    tracer.lookAt(to);
    game.scene.add(tracer);
    tracers.push({ mesh: tracer, life: 0.09 });
  }
  function playerPunch() {
    const player = game.player;
    if (player.punchTimer > 0 || !player.onFoot) return;
    player.punchTimer = PLAYER.punchCooldown;
    game.audio.punch();
    const fx = Math.sin(player.heading);
    const fz = Math.cos(player.heading);
    for (const enemy of enemies) {
      if (!enemy.alive) continue;
      const dx = enemy.pos.x - player.pos.x;
      const dz = enemy.pos.z - player.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > PLAYER.punchRange) continue;
      const dot = (dx * fx + dz * fz) / (dist || 1);
      if (dot < 0.3) continue;
      damageEnemy(enemy, PLAYER.punchDamage);
    }
    for (const ped of game.peds) {
      if (!ped.alive) continue;
      const dx = ped.pos.x - player.pos.x;
      const dz = ped.pos.z - player.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > PLAYER.punchRange) continue;
      const dot = (dx * fx + dz * fz) / (dist || 1);
      if (dot < 0.3) continue;
      ped.alive = false;
      ped.mesh.visible = false;
      game.police.commitCrime(1);
      game.hud.flash('You hit a pedestrian! The cops are coming.');
    }
  }
  function playerShoot() {
    const player = game.player;
    const weapon = WEAPONS[player.weapon];
    if (!weapon || !player.onFoot) return;
    if (player.shootTimer > 0 || player.reloadTimer > 0) return;
    if (player.mag <= 0) {
      game.audio.click();
      game.hud.flash('Out of ammo — reloading.');
      reloadWeapon();
      return;
    }
    player.shootTimer = player.weapon === 'rifle' ? PLAYER.rifleCooldown : PLAYER.pistolCooldown;
    player.mag -= 1;
    game.audio.gunshot();
    const fx = Math.sin(player.heading);
    const fz = Math.cos(player.heading);
    const muzzle = new THREE.Vector3(player.pos.x + fx * 0.8, 1.2, player.pos.z + fz * 0.8);
    const range = PLAYER.shootRange;
    let bestDist = range;
    let bestEnemy = null;
    let bestCar = null;
    for (const enemy of enemies) {
      if (!enemy.alive) continue;
      const dx = enemy.pos.x - player.pos.x;
      const dz = enemy.pos.z - player.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > range) continue;
      const dot = (dx * fx + dz * fz) / (dist || 1);
      if (dot < 0.92) continue;
      if (dist < bestDist) {
        bestDist = dist;
        bestEnemy = enemy;
        bestCar = null;
      }
    }
    const allCars = [...game.cars.parked, ...game.cars.traffic, ...(game.police.cars || [])];
    if (game.cars.comet) allCars.push(game.cars.comet);
    if (game.cars.armored) allCars.push(game.cars.armored);
    for (const car of allCars) {
      const dx = car.pos.x - player.pos.x;
      const dz = car.pos.z - player.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > range) continue;
      const dot = (dx * fx + dz * fz) / (dist || 1);
      if (dot < 0.92) continue;
      if (dist < bestDist) {
        bestDist = dist;
        bestCar = car;
        bestEnemy = null;
      }
    }
    const end = new THREE.Vector3(player.pos.x + fx * bestDist, 1.2, player.pos.z + fz * bestDist);
    spawnTracer(muzzle, end, game.player.weapon === 'rifle' ? 0xff9500 : 0xffe14d);
    if (bestEnemy) damageEnemy(bestEnemy, weapon.damage);
    else if (bestCar) {
      bestCar.health = Math.max(0, (bestCar.health || 0) - weapon.damage);
      if (bestCar.kind === 'police') game.police.commitCrime(1);
      if (bestCar.health <= 0) {
        bestCar.wrecked = true;
        bestCar.speed = 0;
        if (bestCar.kind === 'police') game.hud.flash('Police car disabled.');
      }
    }
    game.hud.update();
  }
  function reloadWeapon() {
    const player = game.player;
    const weapon = WEAPONS[player.weapon];
    if (!weapon || player.reloadTimer > 0) return;
    if (player.mag >= weapon.mag || player.ammo <= 0) return;
    player.reloadTimer = 1.0;
    game.audio.reload();
    const needed = weapon.mag - player.mag;
    const taken = Math.min(needed, player.ammo);
    player.ammo -= taken;
    player.mag += taken;
  }
  function damageEnemy(enemy, amount) {
    enemy.health -= amount;
    const scale = Math.max(0, enemy.health / enemy.maxHealth);
    enemy.mesh.userData.barFg.scale.x = scale;
    enemy.mesh.userData.barFg.position.x = -(1 - scale) * 0.53;
    if (enemy.health <= 0) {
      enemy.alive = false;
      enemy.mesh.visible = false;
      const drop = enemy.kind === 'gunman' ? ECONOMY.gunmanDrop : ECONOMY.thugDrop;
      game.cash += drop;
      game.hud.flash(`${enemy.kind === 'gunman' ? 'Gunman' : 'Thug'} down. +$${drop}.`);
      game.audio.pickup();
      game.hud.update();
    }
  }
  function update(dt) {
    for (const enemy of enemies) {
      if (!enemy.alive) continue;
      enemy.punchTimer = Math.max(0, enemy.punchTimer - dt);
      enemy.shootTimer = Math.max(0, enemy.shootTimer - dt);
      const dx = game.player.pos.x - enemy.pos.x;
      const dz = game.player.pos.z - enemy.pos.z;
      const dist = Math.hypot(dx, dz);
      if (!game.player.onFoot || dist > 80) continue;
      enemy.mesh.rotation.y = Math.atan2(dx, dz);
      if (enemy.kind === 'gunman') {
        if (dist > 24) {
          enemy.pos.x += (dx / dist) * 4 * dt;
          enemy.pos.z += (dz / dist) * 4 * dt;
        } else if (dist < 10) {
          enemy.pos.x -= (dx / dist) * 3 * dt;
          enemy.pos.z -= (dz / dist) * 3 * dt;
        }
        enemy.mesh.position.copy(enemy.pos);
        if (enemy.shootTimer <= 0 && dist < 42) {
          enemy.shootTimer = 1.2;
          const from = new THREE.Vector3(enemy.pos.x, 1.4, enemy.pos.z);
          const to = new THREE.Vector3(game.player.pos.x, 1.2, game.player.pos.z);
          spawnTracer(from, to, 0xff6644);
          game.audio.gunshot();
          game.player.health = Math.max(0, game.player.health - 6);
          game.player.lastHitAt = game.time;
          game.hud.shake();
        }
        continue;
      }
      if (dist > 1.6) {
        enemy.pos.x += (dx / dist) * 3.2 * dt;
        enemy.pos.z += (dz / dist) * 3.2 * dt;
        enemy.mesh.position.copy(enemy.pos);
        const swing = Math.sin(game.time * 9 + enemy.phase) * 0.4;
        enemy.mesh.userData.legL.rotation.x = swing;
        enemy.mesh.userData.legR.rotation.x = -swing;
        enemy.mesh.userData.armL.rotation.x = -swing;
        enemy.mesh.userData.armR.rotation.x = swing;
      } else if (enemy.punchTimer <= 0) {
        enemy.punchTimer = 1.0;
        game.player.health = Math.max(0, game.player.health - 8);
        game.player.lastHitAt = game.time;
        game.hud.shake();
        game.audio.punch();
      }
      enemy.mesh.userData.barFg.lookAt(game.camera.position);
    }
    for (let i = tracers.length - 1; i >= 0; i -= 1) {
      const tracer = tracers[i];
      tracer.life -= dt;
      tracer.mesh.material.opacity = Math.max(0, tracer.life / 0.09) * 0.9;
      if (tracer.life <= 0) {
        game.scene.remove(tracer.mesh);
        tracers.splice(i, 1);
      }
    }
  }
  return { enemies, spawnThug, spawnGunman, playerPunch, playerShoot, reloadWeapon, update };
}
