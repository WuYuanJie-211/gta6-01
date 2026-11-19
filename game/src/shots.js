import * as THREE from 'three';
import{BX,CI,MB,MS,ME,V3,PI,AB,PG}from'./geo.js';
import { STEP } from './config.js';
import { enterCar, spawnPoliceCar } from './vehicles.js';
import { ACTION_SHOOT } from './input.js';
function pool(g,x,z,r=2.6,o=.3){
  const tex=g.textures&&g.textures.pool;
  if(tex){
    const p=new ME(new PG(r*2,r*2),new MB({map:tex,transparent:true,opacity:o,blending:AB,depthWrite:false}));
    p.rotation.x=-PI/2;p.position.set(x,.07,z);g.scene.add(p);
  } else {
    const p=new ME(new CI(r,16),new MB({color:0xfff2b0,transparent:true,opacity:o,blending:AB,depthWrite:false}));
    p.rotation.x=-PI/2;p.position.set(x,.07,z);g.scene.add(p);
  }
}
function skid(g,x,z){
  const tex=g.textures&&g.textures.skid;
  for(const s of[-.8,.8]){
    if(tex){
      const k=new ME(new PG(.28,7),new MB({map:tex,transparent:true,opacity:.5,depthWrite:false}));
      k.rotation.x=-PI/2;k.position.set(x+s,.08,z);g.scene.add(k);
    } else {
      const k=new ME(new BX(.5,.02,7),new MB({color:0x1a1a1a}));
      k.position.set(x+s,.08,z);g.scene.add(k);
    }
  }
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
  place(van, 243, -60, PI / 2);
  van.stolen = true;
  enterCar(game, van);
  game.police.state.wanted = 4;
  camB(game);
  driveFor(game, 1.5, (g) => steerCarToward(g, 243, -360));
  const vx = game.player.car.pos.x;
  const vz = game.player.car.pos.z;
  place(van, vx, vz + 16, -PI / 2);
  const c1 = pc(game, vx + 3, vz + 10, -PI / 2, 24);
  const c2 = pc(game, vx + 5, vz + 7, -PI / 2, 24);
  for (const c of [c1, c2]) {
    if (c.mesh.userData.lightR) {
      c.mesh.userData.lightR.material.emissive.setHex(0xff0000);
      c.mesh.userData.lightB.material.emissive.setHex(0x0000ff);
    }
  }
  game.cameraAngle = 0;
  game.camDist = 6.5;
  game.camPitch = 0;
  game.camLookOff = 3.2;
  game.lastDragAt = game.time;
  const heli = game.police.heli;
  if (heli) {
    heli.visible = true;
    heli.position.set(vx + 8, 14, vz - 20);
    heli.scale.setScalar(1.5);
    heli.rotation.y = 0.4;
    heli.children[0].material.color.set(0x2a2f36);
    pool(game, vx, vz + 16, 1.6, .25);
  }
  skid(game, vx, vz + 12);
}
function stageGunfight(game) {
  game.missions.setProgress(6, 1);
  const player = game.player;
  player.weapon = 'rifle';
  player.ownedWeapons = ['pistol', 'rifle'];
  player.mag = 30;
  player.ammo = 60;
  player.pos.set(-180.5, 0, 192.9);
  player.heading = 0.39;
  player.mesh.position.copy(player.pos);
  player.mesh.rotation.y = player.heading;
  player.mesh.rotation.x = 0.1;
  player.mesh.scale.y = 0.85;
  const rifle = player.mesh.userData.rifle;
  rifle.position.set(0.15, 1.55, 0.6);
  rifle.rotation.x = -0.05;
  if (game.textures.shadow) { const s = new ME(new PG(1.4, 1.1), new MB({ map: game.textures.shadow, transparent: true, opacity: .85, depthWrite: false })); s.rotation.x = -PI / 2; s.position.set(-180.5, .1, 192.9); game.scene.add(s); }
  const barrier = new ME(new BX(3, 0.65, 0.7), new MS({ map: game.textures.concrete, roughness: 0.9 }));
  barrier.position.set(-180.5, 0.325, 193.8);
  barrier.castShadow = true;
  game.scene.add(barrier);
  const g1 = game.combat.spawnGunman(-179.8, 194.6);
  g1.mesh.children[8].visible = g1.mesh.children[9].visible = false;
  game.combat.spawnGunman(-183, 190);
  game.combat.spawnThug(-185, 188);
  game.police.state.wanted = 4;
  camB(game);
  game.cameraAngle = -0.25;
  game.camDist = 8;
  game.camPitch = 0.16;
  for (const [cx, cz] of [[-180, 192], [-181.5, 191.5], [-179.5, 192.2], [-181, 192.6]]) game.combat.spawnCasing(new V3(cx, 0.1, cz), player.heading);
  skid(game, -180.5, 196);
  game.input.fireAction(ACTION_SHOOT);
  game.step(STEP);
}
function stageDowntown(game) {
  game.missions.setProgress(3, 0);
  const taxi = game.cars.parked.find((c) => c.model === 'taxi') || game.cars.parked[0];
  place(taxi, 257, -183, PI);
  game.police.state.wanted = 4;
  taxi.speed = 0;
  enterCar(game, taxi);
  for (const gz of [-183.8, -182.2]) {
    const g = new ME(new BX(0.15, 0.25, 0.5), new MB({ color: 0xff2222, transparent: true, opacity: 0.85 }));
    g.position.set(259, 0.75, gz);
    game.scene.add(g);
  }
  const spots = [
    { x: 180, z: -177, prev: '120,-180', target: '240,-180', h: PI },
    { x: 220, z: -177, prev: '180,-180', target: '300,-180', h: PI },
    { x: 300, z: -177, prev: '240,-180', target: '360,-180', h: PI },
    { x: 232, z: -183, prev: '180,-180', target: '300,-180', h: PI },
    { x: 238, z: -183, prev: '240,-180', target: '300,-180', h: PI },
    { x: 244, z: -183, prev: '180,-180', target: '240,-180', h: PI },
  ];
  game.cars.traffic.slice(0, 6).forEach((t, i) => {
    place(t, spots[i].x, spots[i].z, spots[i].h);
    t.prevNode = game.roads.byKey.get(spots[i].prev);
    t.targetNode = game.roads.byKey.get(spots[i].target);
    t.speed = 0;
  });
  game.cars.traffic.slice(6).forEach(t=>{place(t,0,300,0);});
  game.cars.parked.forEach(c=>{if(c!==taxi)place(c,0,300,0);});
  const walkers = [[120, -168], [150, -192], [180, -168], [200, -192]];
  game.peds.slice(0, 4).forEach((p, i) => {
    p.pos.set(walkers[i][0], 0, walkers[i][1]);
    p.mesh.position.copy(p.pos);
    p.mesh.rotation.y = PI;
    p.mode = 'chat';
    p.waiting = false;
  });
  camB(game);
  game.camDist = 6.5;
  game.camPitch = 0.25;
}
function stageSunset(game) {
  game.missions.setProgress(5, 0);
  const comet = game.cars.comet;
  place(comet, 19, -184, PI);
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
  game.sun.color.set(0xff7733);
  const r = game.combat.spawnGunman(17, -183.5);
  r.mesh.children[8].visible = r.mesh.children[9].visible = false;
  r.mesh.rotation.y = 2.6;
  const b = new ME(new BX(.45, .4, .2), new MB({ color: 0x1f2a1a }));
  b.position.set(-.1, 1.15, -.45); r.mesh.add(b);
  const p = game.player;
  p.pos.set(17, 0, -183.5);
  p.heading = PI;
  p.mesh.position.copy(p.pos);
  p.mesh.rotation.y = p.heading;
  p.mesh.visible = false;
  pc(game, 15, -185, PI, 0);
  for (const [ex, ez] of [[17, -186], [16, -187], [18, -187]]) game.combat.spawnExplosion(new V3(ex, 0, ez), 0.22);
  pc(game, 11, -186, PI, 0);
  const heli = game.police.heli;
  if (heli) {
    heli.visible = true;
    heli.position.set(17, 12, -210);
    heli.scale.setScalar(1.4);
    heli.rotation.y = 0.5;
    heli.children[0].material.color.set(0x2a2f36);
    heli.userData.spotlight.visible = false;
    const stripe = new ME(new BX(.06, .5, 2.2), new MB({ color: 0xffffff }));
    stripe.position.set(1.21, 0, 0);
    heli.add(stripe);
    pool(game, 17, -183.5, 1.2, .15);
  }
  skid(game, 17, -180);
  game.cameraAngle = 0;
  game.lastDragAt = game.time;
  game.camDist = 6.5;
  game.camPitch = 0.12;
}
export const SHOT_ORDER = ['chase', 'gunfight', 'downtown', 'sunset'];
export function stageShot(name, game) {
  if (!SHOT_ORDER.includes(name)) name = 'downtown';
  game.screen = 'playing';
  game.hud.showMenu(false);
  if (name === 'chase') stageChase(game);
  else if (name === 'gunfight') stageGunfight(game);
  else if (name === 'sunset') stageSunset(game);
  else stageDowntown(game);
  game.hud.setShotMode(true, name === 'sunset');
  game.hud.update();
}
