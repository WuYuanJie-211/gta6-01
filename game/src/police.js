// Police: wanted stars, chase cars that ram, roadblocks at 3 stars, the
// helicopter at 4 stars, and the heat cooling off when the player lays low.
import * as THREE from 'three';
import { BX, CG, CN, CI, RG, MB, MS, ME, GP, PI, DS } from './geo.js';
import { poolTexture } from './v31.js';
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
  // v42: rebuilt to Superbot's proportions — silhouette is long body +
  // a main rotor disc 2.4x the body length + tail boom with tail rotor.
  // Body L=4.5 m, rotor diameter 10.8 m. Light police-white body with a
  // navy belly and a red waist stripe, so it reads against both the sky
  // and the towers. Child 0 is the body — shots.js recolors it.
  const bodyMat = mt(0xdde3e8, 0.5);
  const body = B(g, 2.2, 1.5, 4.2, bodyMat, 0, 0, 0);
  body.castShadow = true;
  // Navy belly band + red waist stripe (police livery, reads from any side).
  B(g, 2.24, 0.4, 4.0, mt(0x1b2430, 0.6), 0, -0.55, 0);
  B(g, 2.24, 0.3, 3.8, mt(0xd21f2b, 0.5), 0, 0.1, 0);
  // Sloped windshield (front-lower) + two side windows, dark glass.
  const glassMat = new MS({ color: 0x223a4a, roughness: 0.15, metalness: 0.4 });
  const shield = new ME(new BX(1.9, 1.0, 1.4), glassMat);
  shield.position.set(0, 0.15, 1.85);
  shield.rotation.x = -0.12;
  g.add(shield);
  for (const s of [-1, 1]) B(g, 0.06, 0.65, 1.5, glassMat, s * 1.11, 0.3, 0.7);
  // Engine deck + two exhaust pipes on the top-rear.
  B(g, 1.5, 0.45, 1.3, mt(0x2e3338, 0.6), 0, 0.95, -0.7);
  for (const s of [-0.4, 0.4]) {
    const ex = new ME(new CG(0.09, 0.09, 0.5, 8), mt(0x1a1a1a, 0.6));
    ex.position.set(s, 1.35, -1.0);
    g.add(ex);
  }
  // Tail boom: thick tapered column, LIGHT grey — a navy boom
  // vanished against the dark sunset sky and the tail rotor read as
  // floating, disconnected (v43 shot 4). White ring band around it.
  const boomMat = mt(0xdde3e8, 0.6);
  const boom = new ME(new CG(0.3, 0.55, 3.8, 6), boomMat);
  boom.rotation.x = -PI / 2 + 0.05;
  boom.position.set(0, 0.3, -3.9);
  g.add(boom);
  const ring = new ME(new CG(0.48, 0.48, 0.35, 6), mt(0x1b2430, 0.5));
  ring.rotation.x = -PI / 2 + 0.05;
  ring.position.set(0, 0.32, -3.0);
  g.add(ring);
  // Vertical fin (swept plate, NAVY) + thin yellow tip stripe + red
  // strobe on top. A light-grey fin made the black tail rotor read as
  // a Red Cross sign (v42).
  B(g, 0.12, 1.5, 1.1, mt(0x1b2430, 0.6), 0, 0.75, -5.6);
  B(g, 0.14, 0.12, 0.9, mt(0xffd94d, 0.5), 0, 1.52, -5.6);
  B(g, 0.1, 0.12, 0.1, new MS({ color: 0xff2222, emissive: 0xff0000, emissiveIntensity: 2 }), 0, 1.66, -5.6);
  // Tail rotor (v52): NO blades — the v51 blades still showed a
  // darker X inside the disc (Quick, shot 4). One soft grey spin
  // disc (radial-gradient texture, so no hard plate edge), a darker
  // rim and one faint concentric streak. Child of the rotor, so the
  // mirror clone carries it too, and both shots match.
  const rearRotor = new GP();
  rearRotor.position.set(-0.4, 0.7, -5.6);
  const rrMat = new MS({ color: 0x888888, emissive: 0x888888, emissiveIntensity: 0.3 });
  const rrHub = new ME(new CG(0.14, 0.14, 0.1, 10), rrMat);
  rrHub.rotation.z = PI / 2;
  rearRotor.add(rrHub);
  const rrDisc = new ME(new CI(0.9, 24), new MB({ map: poolTexture(), color: 0x999999, transparent: true, opacity: 0.55, side: DS, depthWrite: false }));
  rrDisc.rotation.y = PI / 2;
  rearRotor.add(rrDisc);
  const rrRim = new ME(new RG(0.82, 0.9, 24), new MB({ color: 0x555555, transparent: true, opacity: 0.6, side: DS, depthWrite: false }));
  rrRim.rotation.y = PI / 2;
  rearRotor.add(rrRim);
  const rrStreak = new ME(new RG(0.45, 0.52, 24), new MB({ color: 0xdddddd, transparent: true, opacity: 0.3, side: DS, depthWrite: false }));
  rrStreak.rotation.y = PI / 2;
  rearRotor.add(rrStreak);
  g.add(rearRotor);
  g.userData.rearRotor = rearRotor;
  // Mirror on the other side of the fin — the camera sees the heli
  // from either side, and a rotor hidden behind the fin reads as no
  // tail rotor at all (v42 shot 4).
  const rearRotor2 = rearRotor.clone();
  rearRotor2.position.x = 0.4;
  g.add(rearRotor2);
  g.userData.rearRotor2 = rearRotor2;
  // Main rotor: mast + hub + FOUR blades (two crossed boxes, 0/90
  // deg) + light-grey tips, parked diagonal in the shots so the four
  // blades read as an X. The old eight-spoke star (four boxes at 45
  // deg) read as one long rod + one big slanted plate from a low camera
  // (v43). One closed translucent disc sits BELOW the blades.
  const rotor = new GP();
  rotor.position.y = 1.15;
  const mast = new ME(new CG(0.14, 0.14, 0.55, 8), mt(0x2e3338, 0.6));
  mast.position.y = -0.15;
  rotor.add(mast);
  const hub = new ME(new CG(0.5, 0.5, 0.2, 12), mt(0x1a1a1a, 0.6));
  hub.position.y = 0.1;
  rotor.add(hub);
  const bladeMat = mt(0x16181a, 0.6);
  for (const a of [0, PI / 2]) {
    const bl = new ME(new BX(10.8, 0.07, 1.0), bladeMat);
    bl.rotation.y = a;
    bl.position.y = 0.2;
    rotor.add(bl);
    for (const s of [-1, 1]) {
      const tip = new ME(new BX(1.1, 0.08, 1.02), mt(0xcccccc, 0.5));
      const tx = s * 4.85 * Math.cos(a);
      const tz = -s * 4.85 * Math.sin(a);
      tip.position.set(tx, 0.2, tz);
      tip.rotation.y = a;
      rotor.add(tip);
    }
  }
  g.add(rotor);
  g.userData.rotor = rotor;
  const disc = new ME(new CI(5.4, 40), new MB({ color: 0xffffff, transparent: true, opacity: 0.12, side: DS, depthWrite: false }));
  disc.rotation.x = -PI / 2;
  disc.position.y = 1.22;
  g.add(disc);
  // Skids: 2 long tubes + 4 struts.
  for (const s of [-0.95, 0.95]) {
    B(g, 0.12, 0.12, 3.6, mt(0x333333, 0.6), s, -1.05, 0);
    for (const z of [-1.2, 1.2]) B(g, 0.08, 0.55, 0.08, mt(0x333333, 0.6), s, -0.75, z);
  }
  // White searchlight disc under the belly + red/green nav lights.
  const lamp = new ME(new CI(0.45, 16), new MB({ color: 0xfff2b0 }));
  lamp.rotation.x = PI / 2;
  lamp.position.set(0, -0.82, 1.2);
  g.add(lamp);
  B(g, 0.08, 0.08, 0.08, new MS({ color: 0xff2222, emissive: 0xff0000, emissiveIntensity: 2 }), -1.12, 0.3, 0.5);
  B(g, 0.08, 0.08, 0.08, new MS({ color: 0x22ff66, emissive: 0x00aa33, emissiveIntensity: 2 }), 1.12, 0.3, 0.5);
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
      heli.userData.rotor.rotation.y += dt * 18;
      heli.userData.rearRotor.rotation.x += dt * 18;
      if (heli.userData.rearRotor2) heli.userData.rearRotor2.rotation.x += dt * 18;
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
