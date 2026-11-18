// Fist fights. Rival thugs hang around the chop shop and the lighthouse road:
// they walk at Rook, throw punches, and go down in three hits, dropping cash.
// Rook's own punch is F: short range, an arc in front, a cooldown.
import * as THREE from 'three';
import { PLAYER } from './config.js';

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
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.7, 0.3), new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 1 }));
  legL.position.set(-0.19, 0.35, 0);
  const legR = legL.clone();
  legR.position.x = 0.19;
  group.add(legL, legR);
  // Health bar: a red strip with a green strip on top that shrinks.
  const barBg = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.12, 0.05), new THREE.MeshBasicMaterial({ color: 0x881111 }));
  barBg.position.y = 2.35;
  const barFg = new THREE.Mesh(new THREE.BoxGeometry(1.06, 0.08, 0.06), new THREE.MeshBasicMaterial({ color: 0x33dd33 }));
  barFg.position.y = 2.35;
  group.add(barBg, barFg);
  group.userData.barFg = barFg;
  group.userData.legL = legL;
  group.userData.legR = legR;
  return group;
}

export function createCombat(game) {
  const enemies = [];

  /** Spawn a thug at a spot; he walks at Rook and swings when he is close. */
  function spawnThug(x, z) {
    const mesh = createThugMesh();
    mesh.position.set(x, 0, z);
    game.scene.add(mesh);
    const enemy = {
      mesh,
      pos: new THREE.Vector3(x, 0, z),
      health: 30,
      punchTimer: 0,
      alive: true,
      phase: game.rng.range(0, Math.PI * 2),
    };
    enemies.push(enemy);
    return enemy;
  }

  /** Rook throws a punch: anything in front, in range, takes damage. */
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
    // Punching a bystander is a crime too.
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

  function damageEnemy(enemy, amount) {
    enemy.health -= amount;
    const scale = Math.max(0, enemy.health / 30);
    enemy.mesh.userData.barFg.scale.x = scale;
    enemy.mesh.userData.barFg.position.x = -(1 - scale) * 0.53;
    if (enemy.health <= 0) {
      enemy.alive = false;
      enemy.mesh.visible = false;
      game.cash += 20;
      game.hud.flash('Thug down. +$20.');
      game.audio.pickup();
    }
  }

  /** Thugs close in and swing; their punches hurt. */
  function update(dt) {
    for (const enemy of enemies) {
      if (!enemy.alive) continue;
      enemy.punchTimer = Math.max(0, enemy.punchTimer - dt);
      const dx = game.player.pos.x - enemy.pos.x;
      const dz = game.player.pos.z - enemy.pos.z;
      const dist = Math.hypot(dx, dz);
      if (!game.player.onFoot || dist > 60) continue;
      if (dist > 1.6) {
        enemy.pos.x += (dx / dist) * 3.2 * dt;
        enemy.pos.z += (dz / dist) * 3.2 * dt;
        enemy.mesh.position.copy(enemy.pos);
        const swing = Math.sin(game.time * 9 + enemy.phase) * 0.4;
        enemy.mesh.userData.legL.rotation.x = swing;
        enemy.mesh.userData.legR.rotation.x = -swing;
      } else if (enemy.punchTimer <= 0) {
        enemy.punchTimer = 1.0;
        game.player.health = Math.max(0, game.player.health - 8);
        game.player.lastHitAt = game.time;
        game.hud.shake();
        game.audio.punch();
      }
      enemy.mesh.rotation.y = Math.atan2(dx, dz);
      // The health bar always faces the camera.
      enemy.mesh.userData.barFg.lookAt(game.camera.position);
    }
  }

  return { enemies, spawnThug, playerPunch, update };
}
