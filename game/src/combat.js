import * as THREE from 'three';
import{BX,CG,MB,MS,SG,ME,V3,GP,PI,AB,SP,PG,SH}from'./geo.js';
import { PLAYER, WEAPONS, ECONOMY, EFFECTS } from './config.js';
let shadowTex = null;
const B=(g,w,h,d,m,x=0,y=0,z=0)=>{const q=new ME(new BX(w,h,d),m);q.position.set(x,y,z);g.add(q);return q;};
const mt=(c,r=0.9)=>new MS({color:c,roughness:r});
function createThugMesh() {
  const group = new GP();
  const shirt = mt(0x7b241c);
  const skin = mt(0xc98d5f);
  const torso = B(group, 0.75, 0.9, 0.42, shirt, 0, 1.15, 0);
  torso.castShadow = true;
  const head = new ME(new SG(0.26, 12, 10), skin);
  head.position.y = 1.85;
  group.add(head);
  const hair = new ME(new SG(0.27, 12, 8, 0, PI * 2, 0, PI / 2), mt(0x1a1a1a, 1));
  hair.position.y = 1.9;
  group.add(hair);
  const neck = new ME(new CG(0.09, 0.11, 0.18, 8), skin);
  neck.position.y = 1.68;
  group.add(neck);
  const legL = B(group, 0.26, 0.7, 0.3, mt(0x222222, 1), -0.19, 0.35, 0);
  const legR = legL.clone();
  legR.position.x = 0.19;
  group.add(legR);
  const armL = B(group, 0.2, 0.65, 0.22, shirt, -0.48, 1.15, 0);
  const armR = armL.clone();
  armR.position.x = 0.48;
  group.add(armR);
  const barBg = B(group, 1.1, 0.12, 0.05, new MB({ color: 0x881111 }), 0, 2.35, 0);
  const barFg = B(group, 1.06, 0.08, 0.06, new MB({ color: 0x33dd33 }), 0, 2.35, 0);
  group.userData.barFg = barFg;
  group.userData.torso = torso;
  group.userData.legL = legL;
  group.userData.legR = legR;
  group.userData.armL = armL;
  group.userData.armR = armR;
  if (shadowTex) {
    const sh = new ME(new PG(.9,.5), SH(shadowTex,.5));
    sh.rotation.x = -PI / 2;
    sh.position.set(0, 0.1, 0);
    group.add(sh);
  } else {
    B(group,0.9,.02,0.7,mt(0,1),0,.09,0);
  }
  return group;
}
function createGunmanMesh() {
  const group = createThugMesh();
  group.children[0].material = mt(0x1a1a2e);
  B(group, 0.56, 0.12, 0.56, mt(0xd21f2b, 0.8), 0, 1.98, 0);
  B(group, 0.78, 0.5, 0.46, mt(0x7b1a1a), 0, 1.2, 0);
  const gunMat = new MS({ color: 0x111111, roughness: 0.4, metalness: 0.5 });
  B(group, 0.09, 0.14, 0.9, gunMat, 0.35, 1.2, 0.35);
  B(group, 0.06, 0.25, 0.12, gunMat, 0.35, 1.02, 0.5);
  const barrel = new ME(new CG(0.05, 0.05, 0.4, 8), gunMat);
  barrel.rotation.x = PI / 2;
  barrel.position.set(0.35, 1.22, 0.95);
  group.add(barrel);
  return group;
}
export function createCombat(game) {
  shadowTex = game.textures && game.textures.shadow;
  const enemies = [];
  const tracers = [];
  const parts = [];
  function addPart(mesh, pos, vel, life, grow = 0, grav = 0) {
    mesh.position.copy(pos);
    game.scene.add(mesh);
    parts.push({ mesh, vel: vel.clone(), life, maxLife: life, grow, grav });
  }
  function spawnFlash(pos) {
    const flash = new SP(new THREE.SpriteMaterial({ map: game.textures.fireball, transparent: true, blending: AB, depthWrite: false }));
    flash.scale.set(.45,.45,1);
    addPart(flash, pos, new V3(0, 0, 0), EFFECTS.fl);
  }
  function spawnCasing(pos, heading) {
    const casing = new ME(
      new BX(0.06, 0.03, 0.1),
      new MS({ color: 0xd4af37, metalness: 0.7, roughness: 0.4 }),
    );
    casing.rotation.y = Math.random() * PI;
    const side = new V3(Math.cos(heading), 0, -Math.sin(heading));
    addPart(casing, new V3(pos.x + side.x * 0.4, 1.1, pos.z + side.z * 0.4), new V3(side.x * 1.5, 2.2, side.z * 1.5), EFFECTS.ca, 0, 12);
  }
  function spawnSparks(pos, color = 0xffcc44, n = 6) {
    for (let i = 0; i < n; i += 1) {
      const spark = new ME(
        new BX(0.12, 0.12, 0.12),
        new MB({ color, transparent: true }),
      );
      const a = Math.random() * PI * 2;
      const b = Math.random() * PI - PI / 2;
      addPart(spark, pos, new V3(Math.cos(a) * Math.cos(b) * 6, Math.abs(Math.sin(b)) * 5 + 1, Math.sin(a) * Math.cos(b) * 6), EFFECTS.sp, 0, 9);
    }
  }
  function spawnExplosion(pos, so = 0.7) {
    const origin = new V3(pos.x, pos.y + 1, pos.z);
    const fire = game.textures && game.textures.fireball;
    if (fire) {
      const sprite = new SP(new THREE.SpriteMaterial({ map: fire, transparent: true, blending: AB, depthWrite: false }));
      sprite.scale.set(2.6, 2.6, 1);
      addPart(sprite, origin, new V3(0, 0.5, 0), EFFECTS.ex, 6, 0);
    } else {
      for (let i = 0; i < 8; i += 1) {
        const ball = new ME(
          new SG(0.6, 8, 6),
          new MB({ color: 0xff7711, transparent: true }),
        );
        const a = (i / 8) * PI * 2;
        addPart(ball, origin, new V3(Math.cos(a) * 3, 1.5, Math.sin(a) * 3), EFFECTS.ex, 2, 0);
      }
    }
    const smoke = game.textures && game.textures.smoke;
    for (let i = 0; i < 4; i += 1) {
      const puff = smoke
        ? new SP(new THREE.SpriteMaterial({ map: smoke, transparent: true, opacity: so * 0.7, depthWrite: false }))
        : new ME(new SG(1.1, 8, 6), new MS({ color: 0x555555, roughness: 1, transparent: true, opacity: so }));
      if (smoke) puff.scale.set(1.6, 1.6, 1);
      addPart(puff, new V3(pos.x + (i - 1.5) * 0.9 - 0.6, pos.y + 2 + i * 0.6, pos.z + (i % 2 ? 0.5 : -0.4)), new V3(0, 1.2, 0), EFFECTS.ex * 1.4, 2.5, 0);
    }
    game.hud.shake();
  }
  function spawnThug(x, z) {
    const mesh = createThugMesh();
    mesh.position.set(x, 0, z);
    game.scene.add(mesh);
    const enemy = {
      mesh, kind: 'thug',
      pos: new V3(x, 0, z),
      health: 30, maxHealth: 30,
      punchTimer: 0, shootTimer: 0,
      alive: true,
      phase: game.rng.range(0, PI * 2),
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
      pos: new V3(x, 0, z),
      health: 40, maxHealth: 40,
      punchTimer: 0, shootTimer: 1,
      alive: true,
      phase: game.rng.range(0, PI * 2),
    };
    enemies.push(enemy);
    return enemy;
  }
  function spawnTracer(from, to, color = 0xffe14d) {
    const dir = new V3().subVectors(to, from);
    const len = dir.length();
    if (len < 0.1) return;
    dir.normalize();
    for (let i = 0; i < 6; i++) {
      const tracer = new ME(new BX(.07, .07, len / 6), new MB({ color, transparent: true, opacity: .9, blending: AB }));
      tracer.position.copy(from).addScaledVector(dir, len * (i + .5) / 6);
      tracer.lookAt(to);
      game.scene.add(tracer);
      tracers.push({ mesh: tracer, life: 0.16 });
    }
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
      game.hud.shake();
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
    let muzzle = new V3(player.pos.x + fx * 0.8, 1.2, player.pos.z + fz * 0.8);
    const rf = player.mesh.userData.rifle;
    if (player.weapon === 'rifle' && rf) muzzle = rf.localToWorld(new V3(0, 0.02, 0.93));
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
    const tg = bestEnemy || bestCar;
    const end = tg ? new V3(tg.pos.x, 1.2, tg.pos.z) : new V3(player.pos.x + fx * bestDist, 1.2, player.pos.z + fz * bestDist);
    const tf = player.weapon === 'rifle' && rf ? rf.localToWorld(new V3(0, .02, -.2)) : muzzle;
    spawnTracer(tf, end, game.player.weapon === 'rifle' ? 0xff9500 : 0xffe14d);
    spawnFlash(muzzle);
    spawnCasing(player.pos, player.heading);
    game.hud.hitmark();
    if (bestEnemy) {
      damageEnemy(bestEnemy, weapon.damage);
      spawnSparks(end);
    } else if (bestCar) {
      bestCar.health = Math.max(0, (bestCar.health || 0) - weapon.damage);
      spawnSparks(end, 0xffaa33);
      if (bestCar.kind === 'police') game.police.commitCrime(1);
      if (bestCar.health <= 0) {
        bestCar.wrecked = true;
        bestCar.speed = 0;
        spawnExplosion(new V3(bestCar.pos.x, 1, bestCar.pos.z));
        game.audio.explosion();
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
    enemy.flashT = 0.12;
    const scale = Math.max(0, enemy.health / enemy.maxHealth);
    enemy.mesh.userData.barFg.scale.x = scale;
    enemy.mesh.userData.barFg.position.x = -(1 - scale) * 0.53;
    if (enemy.health <= 0) {
      enemy.alive = false;
      enemy.fallT = 1.0;
      enemy.mesh.rotation.x = -PI / 2 * 0.85;
      const drop = enemy.kind === 'gunman' ? ECONOMY.gunmanDrop : ECONOMY.thugDrop;
      game.cash += drop;
      game.hud.flash(`${enemy.kind === 'gunman' ? 'Gunman' : 'Thug'} down. +$${drop}.`);
      game.audio.pickup();
      game.hud.update();
    }
  }
  function update(dt) {
    for (const enemy of enemies) {
      if (!enemy.alive) {
        if (enemy.fallT > 0) {
          enemy.fallT -= dt;
          if (enemy.fallT <= 0) enemy.mesh.visible = false;
        }
        continue;
      }
      enemy.flashT = Math.max(0, (enemy.flashT || 0) - dt);
      if (enemy.flashT > 0) {
        enemy.mesh.userData.torso.material.emissive.setHex(0xffffff);
        enemy.mesh.rotation.x = -0.25;
      } else {
        enemy.mesh.userData.torso.material.emissive.setHex(0x000000);
        enemy.mesh.rotation.x = 0;
      }
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
          const from = new V3(enemy.pos.x, 1.4, enemy.pos.z);
          const to = new V3(game.player.pos.x, 1.2, game.player.pos.z);
          spawnTracer(from, to, 0xff6644);
          spawnFlash(from);
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
      tracer.mesh.material.opacity = Math.max(0, Math.min(1, tracer.life / 0.16)) * .9;
      if (tracer.life <= 0) {
        game.scene.remove(tracer.mesh);
        tracers.splice(i, 1);
      }
    }
    for (let i = parts.length - 1; i >= 0; i -= 1) {
      const part = parts[i];
      part.life -= dt;
      if (part.life <= 0) {
        game.scene.remove(part.mesh);
        parts.splice(i, 1);
        continue;
      }
      part.vel.y -= part.grav * dt;
      part.mesh.position.addScaledVector(part.vel, dt);
      if (part.grow) part.mesh.scale.multiplyScalar(1 + part.grow * dt);
      if (part.mesh.material.transparent) part.mesh.material.opacity = Math.max(0, part.life / part.maxLife);
    }
  }
  return { enemies, spawnThug, spawnGunman, spawnExplosion, spawnCasing, spawnSparks, playerPunch, playerShoot, reloadWeapon, update };
}
