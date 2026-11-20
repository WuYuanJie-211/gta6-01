import * as THREE from 'three';
import{BX,CG,MB,MS,ME,V3,PI,AB,PG,CT,DS,SH}from'./geo.js';
import { STEP } from './config.js';
import { enterCar, spawnPoliceCar } from './vehicles.js';
import { ACTION_SHOOT } from './input.js';
import { makeSoftBeam } from './v31.js';
function pool(g,x,z,r,o,y=.07){
  const t=g.textures&&g.textures.pool;if(!t)return;
  const p=new ME(new PG(r*2,r*2),new MB({map:t,transparent:true,opacity:o,blending:AB,depthWrite:false}));
  p.rotation.x=-PI/2;p.position.set(x,y,z);g.scene.add(p);return p;
}
function skid(g,x,z,o=.5){
  const tex=g.textures&&g.textures.skid;if(!tex)return;
  for(const s of[-.8,.8]){
    const k=new ME(new PG(.28,7),new MB({map:tex,transparent:true,opacity:o,depthWrite:false}));
    k.rotation.x=-PI/2;k.position.set(x+s,.08,z);g.scene.add(k);
  }
}
let _bt;
function beam(g,a,b,rt,rb,o){
  // v31 defect (c): the old 12-segment cone had hard triangle facets.
  // Soft beam: 32 segments + smooth gradient + halo cone (see v31.js).
  makeSoftBeam(g.scene, a, b, rt, rb, o);
}
function steerCarToward(game, tx, tz) {
  const car = game.player.car;
  if (!car) return;
  const dx = tx - car.pos.x;
  const dz = tz - car.pos.z;
  const wanted = Math.atan2(-dz, dx);
  let diff = wanted - car.heading;
  while (diff > PI) diff -= PI * 2;
  while (diff < -PI) diff += PI * 2;
  game.input.setKey('a', diff > 0.06);
  game.input.setKey('d', diff < -0.06);
}
function driveFor(game, seconds, steerFn) {
  game.input.setKey('w', true);
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    if (steerFn) steerFn(game);
    game.step(STEP);
  }
  game.input.setKey('w', false);
  game.input.setKey('a', false);
  game.input.setKey('d', false);
}
function place(car, x, z, h) {
  car.pos.set(x, 0, z);
  car.heading = h;
  car.mesh.position.copy(car.pos);
  car.mesh.rotation.y = h;
}
function pc(game, x, z, h, s) {
  const c = spawnPoliceCar(game);
  place(c, x, z, h);
  c.speed = s;
  game.police.state.cars.push(c);
  return c;
}
function camB(game) {
  let fx;
  let fz;
  if (game.player.car) {
    fx = Math.cos(game.player.car.heading);
    fz = -Math.sin(game.player.car.heading);
  } else {
    fx = Math.sin(game.player.heading);
    fz = Math.cos(game.player.heading);
  }
  game.cameraAngle = Math.atan2(-fx, -fz);
  game.lastDragAt = game.time;
}
function stageChase(game) {
  game.missions.setProgress(6, 1);
  const van = game.cars.armored;
  // v31: chase re-staged into the 40x40m hero zone (240,-180). The van
  // starts at z=-177, drives ~17m north in 1.5s, and is re-placed 14m back
  // to z=-180 — the shot lands dead-centre in the hero zone.
  place(van, 243, -177, PI / 2);
  van.stolen = true;
  enterCar(game, van);
  game.police.state.wanted = 4;
  camB(game);
  driveFor(game, 1.5, (g) => steerCarToward(g, 243, -270));
  const vx = game.player.car.pos.x;
  const vz = game.player.car.pos.z;
  place(van, vx + 1.2, vz + 14, -PI / 2);
  const c1 = pc(game, vx - 4.5, vz + 6, -PI / 2, 24);
  const c2 = pc(game, vx + 8, vz + 10, -PI / 2, 24);
  for (const c of [c1, c2]) {
    if (c.mesh.userData.lightR) {
      c.mesh.userData.lightR.material.emissive.setHex(0xff0000);
      c.mesh.userData.lightB.material.emissive.setHex(0x0000ff);
    }
  }
  game.cameraAngle = 0;
  game.camDist = 7.5;
  game.camPitch = 0.09;
  game.camLookOff = 1.5;
  game.camX = -2.2;
  game.lastDragAt = game.time;
  const heli = game.police.heli;
  if (heli) {
    heli.visible = true;
    heli.position.set(vx + 8, 14, vz - 24);
    heli.scale.setScalar(1.5);
    heli.rotation.y = 0.4;
    heli.children[0].material.color.set(0x2a2f36);
    // v32: brighter soft shaft (the old 0.05/0.3 read as almost nothing
    // once the cone became a sprite — a searchlight must be visible).
    beam(game, new V3(vx + 8, 13.15, vz - 24), new V3(vx + 1.2, 2.4, vz + 14), .3, 2.4, .18);
    beam(game, new V3(vx + 8, 13.15, vz - 24), new V3(vx + 1.2, 2.4, vz + 14), .15, .6, .45);
    const rp=pool(game,vx+1.2,vz+14,1,.6,2.45);if(rp)rp.scale.set(1,.6,1);
    const st = new ME(new BX(1.4, .02, .9), new MB({ color: 0xe8f0ff, emissive: 0xe8f0ff, emissiveIntensity: 1 }));
    st.position.set(vx + 1.2, 2.45, vz + 14); game.scene.add(st);
    const rl = new THREE.PointLight(0xffd9a0, 1.4, 3.5); rl.position.set(vx + 1.2, 3.2, vz + 14); game.scene.add(rl);
  }
  const dk=new ME(new PG(18,70),new MB({color:0,transparent:true,opacity:.2,depthWrite:false}));dk.rotation.x=-PI/2;dk.position.set(vx,.06,vz-10);game.scene.add(dk);
  skid(game, vx, vz + 12);
}
function stageGunfight(game) {
  game.missions.setProgress(6, 1);
  const player = game.player;
  player.weapon = 'rifle';
  player.ownedWeapons = ['pistol', 'rifle'];
  player.mag = 30;
  player.ammo = 60;
  // v32: the player stands SOUTH of the duellist and the camera looks
  // NORTH toward downtown — the old staging looked south, so the horizon
  // showed open sea and beach umbrellas behind a downtown gunfight.
  player.pos.set(-178.86, 0, 196.1);
  player.heading = PI;
  player.mesh.position.copy(player.pos);
  player.mesh.rotation.y = player.heading;
  player.mesh.rotation.x = 0;
  player.mesh.scale.y = 0.85;
  const rifle = player.mesh.userData.rifle;
  // v32: shorter rifle (scale 1.4 -> 1.0), pulled back (z 0.75 -> 0.55),
  // pointed straight ahead — the old long angled barrel reached through
  // the duellist's torso.
  rifle.position.set(0.15, 1.62, 0.55);
  rifle.rotation.set(0.16, 0.15, 0);
  rifle.scale.setScalar(1.0);
  // v31 defect (a): the old aim point (-169.53, 200.85) was ~9m east of the
  // duellist, so the tracer fired left onto the road away from him. Aim
  // at the duellist (first gunman, -178.1, 191.5) so the tracer hits him.
  game.aim=new V3(-178.1,1.2,191.5);
  if (game.textures.shadow) { const s = new ME(new PG(.9,.5), SH(game.textures.shadow,.5)); s.rotation.x = -PI / 2; s.position.set(-178.86, .1, 196.1); game.scene.add(s); }
  game.combat.spawnGunman(-178.1,191.5).mesh.scale.setScalar(1.15);
  const g2 = game.combat.spawnGunman(-173.2, 191.0);
  g2.mesh.rotation.y = .6;
  const th = game.combat.spawnThug(-172.3, 191.2);
  th.mesh.rotation.x = .3;
  th.mesh.scale.y = .85;
  for (const e of game.combat.enemies) e.mesh.children[8].visible = e.mesh.children[9].visible = false;
  game.police.state.wanted = 4;
  camB(game);
  game.camDist = 2.8;
  game.camPitch = 0.036;
  game.camX = 1.4;
  skid(game, -179.3, 193.5);
  game.input.fireAction(ACTION_SHOOT);
  game.step(STEP);
  // v32: the muzzle flash must light the road — a warm point light at the
  // flash plus a light pool on the asphalt beneath it.
  const fl = new THREE.PointLight(0xffa040, 2.5, 9);
  fl.position.set(-178.4, 1.6, 194);
  game.scene.add(fl);
  pool(game, -178.4, 194, 2.2, 0.5);
  for (const c of game.police.state.cars) place(c, 0, 300, 0);
}
function stageDowntown(game) {
  game.missions.setProgress(3, 0);
  const taxi = game.cars.parked.find((c) => c.model === 'taxi') || game.cars.parked[0];
  place(taxi, 258, -183, PI);
  taxi.mesh.children.at(-1).position.x = .3;
  game.police.state.wanted = 4;
  taxi.speed = 0;
  enterCar(game, taxi);
  for (const gz of [-183.8, -182.2]) {
    const g = new ME(new BX(0.15, 0.25, 0.5), new MB({ color: 0xff2222, transparent: true, opacity: 0.5 }));
    g.position.set(260, 0.75, gz);
    game.scene.add(g);
  }
  const b=new ME(new PG(2.4,1.4),new MB({color:0xff2a1e,transparent:true,opacity:.14,depthWrite:false}));b.rotation.x=-PI/2;b.position.set(259,.1,-183);game.scene.add(b);
  // v31: 6 traffic cars in the hero zone. The taxi (258,-183, westbound)
  // is stopped at the red light; two cars queue ahead of it in the same
  // lane (252 / 246, at the stop line), three come eastbound in the north
  // lane, one more westbound past the intersection.
  const spots = [
    { x: 252, z: -183, prev: '300,-180', target: '240,-180', h: PI },
    { x: 246, z: -183, prev: '300,-180', target: '240,-180', h: PI },
    { x: 230, z: -177, prev: '180,-180', target: '240,-180', h: 0 },
    { x: 222, z: -177, prev: '180,-180', target: '240,-180', h: 0 },
    { x: 240, z: -177, prev: '240,-180', target: '300,-180', h: 0 },
    { x: 228, z: -183, prev: '240,-180', target: '180,-180', h: PI },
  ];
  game.cars.traffic.slice(0, 6).forEach((t, i) => {
    place(t, spots[i].x, spots[i].z, spots[i].h);
    t.prevNode = game.roads.byKey.get(spots[i].prev);
    t.targetNode = game.roads.byKey.get(spots[i].target);
    t.speed = 0;
  });
  game.cars.traffic[0].mesh.children[0].material = new MS({ color: 0x39557a, roughness: .4, metalness: .4 });
  game.cars.traffic.slice(6).forEach(t=>{place(t,0,300,0);});
  // v31: 3 parked cars in the hero zone (curb-side, out of the lanes).
  const parkedSpots = [[232, -192], [248, -192], [232, -168]];
  const others = game.cars.parked.filter(c=>c!==taxi);
  others.slice(0, 3).forEach((c, i) => place(c, parkedSpots[i][0], parkedSpots[i][1], PI / 2));
  others.slice(3).forEach(c=>{place(c,0,300,0);});
  // v31: 6 pedestrians in the hero zone (was 4, spread across the map).
  const walkers = [[232, -168], [248, -168], [232, -192], [248, -192], [240, -165], [240, -195]];
  game.peds.slice(0, 6).forEach((p, i) => {
    p.pos.set(walkers[i][0], 0, walkers[i][1]);
    p.mesh.position.copy(p.pos);
    p.mesh.rotation.y = PI;
    p.mode = 'chat';
    p.waiting = false;
  });
  camB(game);
  game.camDist = 5.5;
  game.camPitch = 0.25;
}
function stageSunset(game) {
  game.missions.setProgress(5, 0);
  const comet = game.cars.comet;
  // v32: re-staged as a SIDE view across the street (camera east, looking
  // west into the sunset) — the old shot was the same north view as the
  // chase, one lighting change. The action sits on the north-south street
  // at the z=-180 cross street: comet south, gunman centre, burning
  // police car north, heli over the intersection in open sky.
  place(comet, 243, -190, PI / 2);
  comet.stolen = true;
  comet.speed = 0;
  game.police.state.wanted = 5;
  game.cash = 2000000;
  const tex = game.textures.sunsetSky;
  if (tex) {
    tex.mapping = THREE.EquirectangularReflectionMapping;
    game.scene.background = tex;
    game.scene.fog.color.set(0x8a4a6a);
  }
  // v31: hide the dithered sky dome + sun billboard so the equirectangular
  // sunset texture is the sky for this shot (no double sun).
  if (game.skyDome) game.skyDome.visible = false;
  if (game.sunBillboard) game.sunBillboard.visible = false;
  game.sun.color.set(0xff7733);
  const r = game.combat.spawnGunman(243, -180);
  r.mesh.children[8].visible = r.mesh.children[9].visible = false;
  r.mesh.rotation.y = -PI / 2;
  const b = new ME(new BX(.45, .4, .2), new MB({ color: 0x1f2a1a }));
  b.position.set(-.42, .85, -.45); r.mesh.add(b);
  const p = game.player;
  p.pos.set(243, 0, -180);
  p.heading = PI;
  // v31: arm the player so the weapon bar reads "Rifle" — the visible
  // gunman is an NPC, but the HUD follows the player, who defaults to
  // fists (which renders as an empty pill in shot mode).
  p.weapon = 'rifle';
  p.ownedWeapons = ['pistol', 'rifle'];
  p.mag = 30;
  p.ammo = 60;
  p.mesh.position.copy(p.pos);
  p.mesh.rotation.y = p.heading;
  p.mesh.visible = false;
  const bc = pc(game, 243, -172, -PI / 2, 0);
  const bm = bc.mesh.children;
  bm[7].material.color.setHex(0x241a14);bm[8].material=new MS({color:0x141018,roughness:.9});bm[1].material=new MS({color:0x0a0a0c,roughness:.9});bc.mesh.position.y=-.15;
  for (const [ex, ez] of [[243, -172], [242.2, -171.3], [243.8, -172.7]]) game.combat.spawnExplosion(new V3(ex, 0, ez), 0.22);
  pc(game, 238, -186, PI, 0);
  const heli = game.police.heli;
  if (heli) {
    heli.visible = true;
    // v32: over the cross-street intersection, far west (31m) and high
    // (15m) so it reads as a distant helicopter in open sky, not a looming
    // rotor across a building face (the old 243,12,-194) nor out of frame
    // (243,18,-180) nor looming (228,13,-180).
    heli.position.set(220, 15, -180);
    heli.scale.setScalar(1.4);
    heli.rotation.y = 0.5;
    heli.children[0].material.color.set(0x2a2f36);
    heli.userData.spotlight.visible = false;
    const stripe = new ME(new BX(.06, .5, 2.2), new MB({ color: 0xffffff }));
    stripe.position.set(1.21, 0, 0);
    heli.add(stripe);
    pool(game, 243, -180, 1.1, .12);
  }
  // v32: the burning car must light the road — a warm point light at the
  // fire plus a light pool on the asphalt beneath it.
  const fireLight = new THREE.PointLight(0xff8030, 3, 12);
  fireLight.position.set(243, 2, -172);
  game.scene.add(fireLight);
  pool(game, 243, -172, 3, 0.55);
  game.cameraAngle = PI / 2;
  game.lastDragAt = game.time;
  game.camDist = 8;
  game.camPitch = 0.12;
}
export const SHOT_ORDER = ['chase', 'gunfight', 'downtown', 'sunset'];
export function stageShot(name, game) {
  if (!SHOT_ORDER.includes(name)) name = 'downtown';
  game.screen = 'playing';
  game.camX = 0;
  game.hud.showMenu(false);
  if (name === 'chase') stageChase(game);
  else if (name === 'gunfight') stageGunfight(game);
  else if (name === 'sunset') stageSunset(game);
  else stageDowntown(game);
  game.hud.setShotMode(true, true);
  game.hud.update();
}
