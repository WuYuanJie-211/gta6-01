// Combat: thugs and gunmen, punches, gunfire, tracers, muzzle flashes,
// casings, sparks, explosions. Enemies carry a health bar above their
// head; gunmen shoot back from range, thugs close in to punch.
//
// CHILD ORDER in the enemy meshes is load-bearing: shots.js hides the
// health bars (children 8-9) and the gunmen's rifles (children 12-14)
// by number. Keep the add order.
import * as THREE from 'three';
import { BX, CG, CN, MB, MS, SG, ME, V3, GP, PI, AB, SP, PG, SH } from './geo.js';
import { PLAYER, WEAPONS, ECONOMY, EFFECTS } from './config.js';
import { blobShadowTexture, poolTexture } from './v31.js';

const B = (g, w, h, d, m, x = 0, y = 0, z = 0) => {
  const q = new ME(new BX(w, h, d), m);
  q.position.set(x, y, z);
  g.add(q);
  return q;
};
const mt = (c, r = 0.9) => new MS({ color: c, roughness: r });

function createEnemyMesh(kind) {
  const group = new GP();
  const gunman = kind === 'gunman';
  const shirt = gunman ? mt(0x2c3e50) : mt(0x7b241c);
  const skin = mt(0xc98d5f);
  const pants = mt(0x2c3e50, 1);
  // 0 torso, 1 head, 2 legL, 3 legR, 4 armL, 5 armR, 6 hat, 7 vest.
  const torso = B(group, 0.75, 0.9, 0.42, shirt, 0, 1.15, 0);
  torso.castShadow = true;
  // v57 row 2: a shoulder bar (child of the torso) and hands (children
  // of the arms) so gunmen read as people. Both ride existing meshes,
  // so the load-bearing child order below (8-9 bars, 12-15 rifle) is
  // untouched.
  const sh = new ME(new BX(0.86, 0.16, 0.46), shirt);
  sh.position.set(0, 0.38, 0);
  torso.add(sh);
  const head = new ME(new SG(0.26, 12, 10), skin);
  head.position.y = 1.85;
  group.add(head);
  const legL = B(group, 0.24, 0.7, 0.28, pants, -0.16, 0.35, 0);
  const legR = B(group, 0.24, 0.7, 0.28, pants, 0.16, 0.35, 0);
  const armL = B(group, 0.18, 0.65, 0.2, shirt, -0.48, 1.15, 0);
  const armR = B(group, 0.18, 0.65, 0.2, shirt, 0.48, 1.15, 0);
  for (const arm of [armL, armR]) {
    const hand = new ME(new BX(0.13, 0.11, 0.15), skin);
    hand.position.set(0, -0.36, 0);
    arm.add(hand);
  }
  const hat = B(group, 0.5, 0.12, 0.5, gunman ? mt(0x1a1a1a, 0.8) : mt(0x8a1a1a, 0.9), 0, 2.02, 0);
  hat.visible = true;
  const vest = B(group, 0.78, 0.5, 0.46, gunman ? mt(0x1a1a1a, 0.95) : mt(0x5a2a1a, 0.95), 0, 1.2, 0);
  vest.visible = gunman;
  // 8 health bar background, 9 health bar foreground.
  const barBg = new ME(new PG(0.9, 0.12), new MB({ color: 0x661111 }));
  barBg.position.set(0, 2.35, 0.3);
  group.add(barBg);
  const barFg = new ME(new PG(0.86, 0.08), new MB({ color: 0x37c978 }));
  barFg.position.set(0, 2.35, 0.31);
  group.add(barFg);
  group.userData.barFg = barFg;
  // 10 ground blob (pedestrian category, fixed 0.5 — one shared
  // shadow system, no per-enemy tuning).
  const blob = new ME(new PG(1.1, 0.9), SH(blobShadowTexture(), 0.5));
  blob.rotation.x = -PI / 2;
  blob.position.set(0, 0.07, 0);
  blob.renderOrder = 2;
  group.add(blob);
  // 11 muzzle flash sprite (hidden until the enemy fires).
  const flash = new SP(new THREE.SpriteMaterial({
    map: poolTexture(), color: 0xffa040, transparent: true, opacity: 0,
    blending: AB, depthWrite: false,
  }));
  flash.position.set(0, 1.5, 0.6);
  flash.scale.set(1.2, 1.2, 1);
  group.add(flash);
  group.userData.flash = flash;
  if (gunman) {
    // 12 barrel, 13 body, 14 stock, 15 magazine — the rifle.
    const barrel = B(group, 0.05, 0.05, 0.9, mt(0x222222, 0.4), 0.3, 1.45, 0.6);
    barrel.visible = true;
    B(group, 0.09, 0.14, 0.5, mt(0x3a2a1a, 0.8), 0.3, 1.42, 0.2);
    B(group, 0.07, 0.12, 0.3, mt(0x3a2a1a, 0.8), 0.3, 1.4, -0.15);
    // v51: magazine under the receiver — the fourth segment, so the
    // rifle reads as barrel + body + stock + magazine, not a bare rod.
    B(group, 0.06, 0.22, 0.1, mt(0x222222, 0.4), 0.3, 1.28, 0.25);
  }
  group.userData.legL = legL;
  group.userData.legR = legR;
  group.userData.armL = armL;
  group.userData.armR = armR;
  return group;
}

export function createCombat(game) {
  const enemies = [];
  const tracers = [];
  const flashes = [];
  const casings = [];
  const sparks = [];
  const explosions = [];

  function spawnEnemy(kind, x, z) {
    const mesh = createEnemyMesh(kind);
    mesh.position.set(x, 0, z);
    game.scene.add(mesh);
    const e = {
      kind,
      mesh,
      pos: new V3(x, 0, z),
      health: kind === 'gunman' ? 60 : 50,
      maxHealth: kind === 'gunman' ? 60 : 50,
      alive: true,
      speed: kind === 'gunman' ? 1.6 : 2.2,
      attackTimer: 0,
      shootTimer: game.rng.range(0.5, 1.5),
      phase: game.rng.range(0, PI * 2),
    };
    enemies.push(e);
    return e;
  }

  function spawnThug(x, z) {
    return spawnEnemy('thug', x, z);
  }

  function spawnGunman(x, z) {
    return spawnEnemy('gunman', x, z);
  }

  function addTracer(from, to, color = 0xffa040) {
    const dir = new V3().subVectors(to, from);
    const len = dir.length();
    // v51: 0.08 m thick (was 0.03 — a hairline) in 3 segments fading
    // toward the target (0.95 / 0.6 / 0.3), so the line reads as a
    // bullet path with falloff, not a taut wire. Never shares a mesh
    // with the flash.
    const segs = [];
    for (let i = 0; i < 3; i += 1) {
      const segLen = len / 3;
      const segFrom = from.clone().addScaledVector(dir, i / 3);
      const segTo = from.clone().addScaledVector(dir, (i + 1) / 3);
      const m = new ME(
        new BX(0.08, 0.08, segLen),
        new MB({ color, transparent: true, opacity: [0.95, 0.6, 0.3][i], blending: AB, depthWrite: false }),
      );
      m.position.copy(segFrom).addScaledVector(dir, 1 / 6);
      m.lookAt(segTo);
      game.scene.add(m);
      tracers.push({ mesh: m, life: 0.03 });
      segs.push(m);
    }
    return segs;
  }

  // Muzzle flash (v46): real tapered cone along the barrel, 28 px
  // long, 8 px base radius, 2 frames. The 0.9 m glow sprite is gone —
  // it read as a 22 px halo and its disc painted the bright band on
  // the target's chest. Inner cone is the 7 px bright core.
  function addFlash(pos, dir, scale = 1) {
    const d = dir.clone().normalize();
    const up = new V3(0, 1, 0);
    // Cone apex (+y) must point BACK at the muzzle, base forward —
    // a flame cone is narrow at the gun and wide at the front. The
    // old code pointed the apex forward, so the cone read as a spike
    // (and the glow sprite hid the error).
    const q = new THREE.Quaternion().setFromUnitVectors(up, d.clone().negate());
    const outer = new ME(new CN(0.038 * scale, 0.136 * scale, 8), new MB({ color: 0xff9a2e }));
    outer.quaternion.copy(q);
    outer.position.copy(pos).addScaledVector(d, 0.05 * scale);
    game.scene.add(outer);
    const inner = new ME(new CN(0.03 * scale, 0.08 * scale, 8), new MB({ color: 0xfff6d8 }));
    inner.quaternion.copy(q);
    inner.position.copy(pos).addScaledVector(d, 0.04 * scale);
    game.scene.add(inner);
    flashes.push({ mesh: outer, life: 0.033 });
    flashes.push({ mesh: inner, life: 0.033 });
    const light = new THREE.PointLight(0xffa040, 3, 2.5);
    light.position.copy(pos);
    game.scene.add(light);
    flashes.push({ sprite: null, light, life: 0.033 });
    return inner;
  }

  function spawnCasing(pos) {
    const m = new ME(new BX(0.06, 0.06, 0.14), mt(0xd8a020, 0.4));
    m.position.copy(pos);
    m.position.y = 1.2;
    game.scene.add(m);
    casings.push({ mesh: m, vel: new V3((Math.random() - 0.5) * 2, 2, (Math.random() - 0.5) * 2), life: EFFECTS.ca });
  }

  function spawnSparks(pos) {
    for (let i = 0; i < 5; i += 1) {
      const s = new SP(new THREE.SpriteMaterial({
        map: poolTexture(), color: 0xffd94d, transparent: true, opacity: 0.9,
        blending: AB, depthWrite: false,
      }));
      s.position.set(pos.x + (Math.random() - 0.5), pos.y + Math.random() * 0.5, pos.z + (Math.random() - 0.5));
      s.scale.set(0.3, 0.3, 1);
      game.scene.add(s);
      sparks.push({ sprite: s, life: EFFECTS.sp });
    }
  }

  function spawnExplosion(pos, scale = 1) {
    const tex = game.textures.fireball || game.textures.smoke;
    const fire = new SP(new THREE.SpriteMaterial({
      map: tex, color: 0xff8030, transparent: true, opacity: 0.95,
      blending: AB, depthWrite: false,
    }));
    fire.position.set(pos.x, 1.2 * scale, pos.z);
    fire.scale.set(2.4 * scale, 2.4 * scale, 1);
    game.scene.add(fire);
    const smokeTex = game.textures.smoke;
    const smoke = smokeTex ? new SP(new THREE.SpriteMaterial({
      map: smokeTex, color: 0x555555, transparent: true, opacity: 0.7, depthWrite: false,
    })) : null;
    if (smoke) {
      smoke.position.set(pos.x, 2.5 * scale, pos.z);
      smoke.scale.set(3 * scale, 3 * scale, 1);
      game.scene.add(smoke);
    }
    const light = new THREE.PointLight(0xff8030, 3, 12 * scale);
    light.position.set(pos.x, 2, pos.z);
    game.scene.add(light);
    explosions.push({ fire, smoke, light, life: EFFECTS.ex, scale });
    game.audio.explosion();
    // Blast damage.
    const p = game.player.car ? game.player.car.pos : game.player.pos;
    if (Math.hypot(p.x - pos.x, p.z - pos.z) < 4 * scale) {
      game.player.health -= 20 * scale;
      game.player.lastHitAt = game.time;
      game.hud.shake();
    }
    for (const e of enemies) {
      if (e.alive && Math.hypot(e.pos.x - pos.x, e.pos.z - pos.z) < 4 * scale) {
        e.health -= 50 * scale;
      }
    }
  }

  function muzzleWorld() {
    const p = game.player;
    // The muzzle anchor on the rifle (local z=1.6, the barrel tip) —
    // its world position IS the muzzle, no forward offset guess.
    const rifle = p.mesh.userData.rifle;
    if (rifle && rifle.userData.muzzle) {
      const wp = new V3();
      rifle.userData.muzzle.getWorldPosition(wp);
      return wp;
    }
    const fx = Math.sin(p.heading);
    const fz = Math.cos(p.heading);
    return new V3(p.pos.x + fx * 0.8, 1.55, p.pos.z + fz * 0.8);
  }

  function aimPoint() {
    if (game.aim) return game.aim.clone();
    // Nearest enemy in front, else a point 30 m ahead.
    const p = game.player;
    const fx = Math.sin(p.heading);
    const fz = Math.cos(p.heading);
    let best = null;
    let bestD = PLAYER.shootRange;
    for (const e of enemies) {
      if (!e.alive) continue;
      const dx = e.pos.x - p.pos.x;
      const dz = e.pos.z - p.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < bestD && dx * fx + dz * fz > 0) {
        bestD = d;
        best = e;
      }
    }
    if (best) return new V3(best.pos.x, 1.2, best.pos.z);
    return new V3(p.pos.x + fx * 30, 1.2, p.pos.z + fz * 30);
  }

  function playerPunch() {
    const p = game.player;
    if (p.punchTimer > 0 || !p.onFoot) return;
    p.punchTimer = PLAYER.punchCooldown;
    game.audio.punch();
    const fx = Math.sin(p.heading);
    const fz = Math.cos(p.heading);
    for (const e of enemies) {
      if (!e.alive) continue;
      const dx = e.pos.x - p.pos.x;
      const dz = e.pos.z - p.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < PLAYER.punchRange && dx * fx + dz * fz > 0) {
        e.health -= PLAYER.punchDamage;
        e.pos.x += (dx / d) * 1.2;
        e.pos.z += (dz / d) * 1.2;
        game.hud.hitmark();
        spawnSparks(e.pos);
        if (e.health <= 0) killEnemy(e);
        return;
      }
    }
  }

  function playerShoot() {
    const p = game.player;
    if (!p.onFoot) return;
    if (p.weapon === 'fists') {
      playerPunch();
      return;
    }
    if (p.shootTimer > 0 || p.reloadTimer > 0) return;
    const w = WEAPONS[p.weapon];
    if (p.mag <= 0) {
      game.audio.click();
      game.hud.flash('Out of mag — R to reload.');
      return;
    }
    p.shootTimer = p.weapon === 'rifle' ? PLAYER.rifleCooldown : PLAYER.pistolCooldown;
    p.mag -= 1;
    const from = muzzleWorld();
    const to = aimPoint();
    addTracer(from, to);
    const dir = new V3().subVectors(to, from);
    // v46: the cone follows the BARREL, not the aim line — the aim
    // drops to the chest (down-right on screen) while the barrel
    // points up-right, and a cone on the aim line is foreshortened
    // end-on from this camera. The rifle's +z is flipped by the PI
    // parenting (player heading PI), so getWorldDirection points
    // BACKWARD; the barrel direction is its negation.
    const rifle = p.mesh.userData.rifle;
    if (rifle) { rifle.getWorldDirection(dir); dir.negate(); }
    addFlash(from, dir, p.weapon === 'rifle' ? 1.2 : 0.8);
    spawnCasing(from);
    game.audio.gunshot();
    game.hud.shake();
    // Hit: the first enemy within 1.2 m of the aim point.
    for (const e of enemies) {
      if (!e.alive) continue;
      if (Math.hypot(e.pos.x - to.x, e.pos.z - to.z) < 1.6) {
        e.health -= w.damage;
        game.hud.hitmark();
        spawnSparks(e.pos);
        if (e.health <= 0) killEnemy(e);
        break;
      }
    }
  }

  function killEnemy(e) {
    e.alive = false;
    e.mesh.visible = false;
    const drop = e.kind === 'gunman' ? ECONOMY.gunmanDrop : ECONOMY.thugDrop;
    game.cash += drop;
    game.hud.flash(`+ $${drop}`);
    game.audio.pickup();
  }

  function reloadWeapon() {
    const p = game.player;
    if (p.weapon === 'fists') return;
    const w = WEAPONS[p.weapon];
    if (p.mag >= w.mag || p.ammo <= 0 || p.reloadTimer > 0) return;
    p.reloadTimer = 0.9;
    game.audio.reload();
    const take = Math.min(w.mag - p.mag, p.ammo);
    p.mag += take;
    p.ammo -= take;
  }

  function update(dt) {
    const p = game.player;
    const target = p.car ? p.car.pos : p.pos;
    for (const e of enemies) {
      if (!e.alive) continue;
      const dx = target.x - e.pos.x;
      const dz = target.z - e.pos.z;
      const dist = Math.hypot(dx, dz);
      e.mesh.rotation.y = Math.atan2(dx, dz);
      const swing = Math.sin(game.time * 8 + e.phase) * 0.4;
      e.mesh.userData.legL.rotation.x = swing;
      e.mesh.userData.legR.rotation.x = -swing;
      // Health bar follows health.
      const frac = Math.max(0, e.health / e.maxHealth);
      e.mesh.userData.barFg.scale.x = frac;
      e.mesh.userData.barFg.position.x = -(1 - frac) * 0.43;
      if (e.kind === 'thug') {
        if (dist > 1.8) {
          e.pos.x += (dx / dist) * e.speed * dt;
          e.pos.z += (dz / dist) * e.speed * dt;
        } else {
          e.attackTimer -= dt;
          if (e.attackTimer <= 0) {
            e.attackTimer = 0.9;
            p.health -= 8;
            p.lastHitAt = game.time;
            game.audio.punch();
            game.hud.shake();
          }
        }
      } else {
        // Gunman: hold range and shoot.
        if (dist > 18) {
          e.pos.x += (dx / dist) * e.speed * dt;
          e.pos.z += (dz / dist) * e.speed * dt;
        }
        e.shootTimer -= dt;
        if (e.shootTimer <= 0 && dist < 25) {
          e.shootTimer = game.rng.range(1.2, 2.2);
          const from = new V3(e.pos.x, 1.5, e.pos.z);
          const to = new V3(target.x, 1.2, target.z);
          addTracer(from, to, 0xff5040);
          const fl = e.mesh.userData.flash;
          fl.material.opacity = 0.95;
          setTimeout(() => { fl.material.opacity = 0; }, 120);
          game.audio.gunshot();
          p.health -= 6;
          p.lastHitAt = game.time;
          game.hud.shake();
        }
      }
      e.mesh.position.copy(e.pos);
      if (e.health <= 0) killEnemy(e);
    }
    // Timers.
    if (p.punchTimer > 0) p.punchTimer -= dt;
    if (p.shootTimer > 0) p.shootTimer -= dt;
    if (p.reloadTimer > 0) p.reloadTimer -= dt;
    const tick = (list) => {
      for (let i = list.length - 1; i >= 0; i -= 1) {
        const it = list[i];
        it.life -= dt;
        if (it.life <= 0) {
          if (it.mesh) game.scene.remove(it.mesh);
          if (it.sprite) game.scene.remove(it.sprite);
          if (it.light) game.scene.remove(it.light);
          list.splice(i, 1);
        }
      }
    };
    tick(tracers);
    tick(flashes);
    tick(sparks);
    for (let i = casings.length - 1; i >= 0; i -= 1) {
      const c = casings[i];
      c.life -= dt;
      c.vel.y -= 9 * dt;
      c.mesh.position.addScaledVector(c.vel, dt);
      if (c.mesh.position.y < 0.05) {
        c.mesh.position.y = 0.05;
        c.vel.set(0, 0, 0);
      }
      if (c.life <= 0) {
        game.scene.remove(c.mesh);
        casings.splice(i, 1);
      }
    }
    for (let i = explosions.length - 1; i >= 0; i -= 1) {
      const ex = explosions[i];
      ex.life -= dt;
      const t = 1 - ex.life / EFFECTS.ex;
      ex.fire.scale.set(3.2 * ex.scale * (1 + t), 3.2 * ex.scale * (1 + t), 1);
      ex.fire.material.opacity = Math.max(0, 0.95 - t);
      if (ex.smoke) {
        ex.smoke.position.y += dt * 1.5;
        ex.smoke.material.opacity = Math.max(0, 0.7 - t * 0.5);
      }
      ex.light.intensity = Math.max(0, 3 - t * 3);
      if (ex.life <= 0) {
        game.scene.remove(ex.fire);
        if (ex.smoke) game.scene.remove(ex.smoke);
        game.scene.remove(ex.light);
        explosions.splice(i, 1);
      }
    }
  }

  // Remove all hit sparks immediately. A shot that hits an enemy
  // spawns 5 glowing sprites at the enemy's feet (spawnSparks); they
  // live longer than the flash, so they survive into the screenshot
  // and read as two glowing yellow-white blobs under the target's
  // feet (v42/v43/v44 shot 2). The flash + tracer stay.
  function clearSparks() {
    for (const s of sparks) game.scene.remove(s.sprite);
    sparks.length = 0;
  }

  return {
    enemies, spawnThug, spawnGunman, spawnExplosion, spawnCasing,
    spawnSparks, clearSparks, playerPunch, playerShoot, reloadWeapon, update,
  };
}
