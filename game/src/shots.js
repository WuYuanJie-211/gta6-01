import * as THREE from 'three';
import{BX,CG,MB,MS,ME,V3,PI,AB,PG,CT,DS,SH}from'./geo.js';
import { STEP } from './config.js';
import { enterCar, spawnPoliceCar } from './vehicles.js';
import { ACTION_SHOOT } from './input.js';
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
  if(!_bt){const c=document.createElement('canvas');c.width=1;c.height=8;
  const x=c.getContext('2d'),gr=x.createLinearGradient(0,0,0,8);
  gr.addColorStop(0,'#000');gr.addColorStop(.5,'#fff');gr.addColorStop(1,'#fff');
  x.fillStyle=gr;x.fillRect(0,0,1,8);_bt=new CT(c);}
  const d=new V3(a.x-b.x,a.y-b.y,a.z-b.z),L=d.length();d.normalize();
  const m=new ME(new CG(rt,rb,L,12,1,true),new MB({map:_bt,transparent:true,opacity:o,blending:AB,depthWrite:false,side:DS}));
  m.position.set((a.x+b.x)/2,(a.y+b.y)/2,(a.z+b.z)/2);
  m.quaternion.setFromUnitVectors(new V3(0,1,0),d);g.scene.add(m);
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
  place(van, vx + 1.2, vz + 14, -PI / 2);
  const c1 = pc(game, vx - 4.5, vz + 6, -PI / 2, 24);
  const c2 = pc(game, vx + 5.5, vz + 3, -PI / 2, 24);
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
    beam(game, new V3(vx + 8, 13.15, vz - 24), new V3(vx + 1.2, 2.4, vz + 14), .3, 2.4, .12);
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
  player.pos.set(-178.86, 0, 192.93);
  player.heading = 0.286;
  player.mesh.position.copy(player.pos);
  player.mesh.rotation.y = player.heading;
  player.mesh.rotation.x = 0;
  player.mesh.scale.y = 0.85;
  const rifle = player.mesh.userData.rifle;
  rifle.position.set(0.15, 1.62, 0.75);
  rifle.rotation.set(-0.12, 0.6, 0);
  rifle.scale.setScalar(1.4);
  game.aim=new V3(-166.2,1.5,204);
  if (game.textures.shadow) { const s = new ME(new PG(.9,.5), SH(game.textures.shadow,.5)); s.rotation.x = -PI / 2; s.position.set(-178.86, .1, 192.93); game.scene.add(s); }
  const barrier = new ME(new BX(3, 0.65, 0.7), new MS({ map: game.textures.concrete, roughness: 0.9 }));
  barrier.position.set(-179.3, 0.325, 194.1);
  barrier.castShadow = true;
  game.scene.add(barrier);
  for(const wy of[4.45,11.45]){const w=new ME(new BX(13,1.4,.1),new MB({color:0x2c3e50}));w.position.set(-151.7,wy,201.6);game.scene.add(w);}
  game.combat.spawnGunman(-178.1,196.1).mesh.scale.setScalar(1.15);
  const g2 = game.combat.spawnGunman(-173.2, 194.7);
  g2.mesh.rotation.y = .6;
  const th = game.combat.spawnThug(-172.3, 194.9);
  th.mesh.rotation.x = .3;
  th.mesh.scale.y = .85;
  for (const e of game.combat.enemies) e.mesh.children[8].visible = e.mesh.children[9].visible = false;
  game.police.state.wanted = 4;
  camB(game);
  game.camDist = 2.8;
  game.camPitch = 0.036;
  game.camX = 1.4;
  skid(game, -179.3, 196);
  game.input.fireAction(ACTION_SHOOT);
  game.step(STEP);
  for (const c of game.police.state.cars) place(c, 0, 300, 0);
}
function stageDowntown(game) {
  game.missions.setProgress(3, 0);
  const taxi = game.cars.parked.find((c) => c.model === 'taxi') || game.cars.parked[0];
  place(taxi, 266, -183, PI);
  taxi.mesh.children.at(-1).position.x = .3;
  game.police.state.wanted = 4;
  taxi.speed = 0;
  enterCar(game, taxi);
  for (const gz of [-183.8, -182.2]) {
    const g = new ME(new BX(0.15, 0.25, 0.5), new MB({ color: 0xff2222, transparent: true, opacity: 0.85 }));
    g.position.set(268, 0.75, gz);
    game.scene.add(g);
  }
  const b=new ME(new PG(2.4,1.4),new MB({color:0xff2a1e,transparent:true,opacity:.14,depthWrite:false}));b.rotation.x=-PI/2;b.position.set(259,.1,-183);game.scene.add(b);
  const spots = [
    { x: 180, z: -177, prev: '120,-180', target: '240,-180', h: PI },
    { x: 220, z: -177, prev: '180,-180', target: '300,-180', h: PI },
    { x: 300, z: -177, prev: '240,-180', target: '360,-180', h: PI },
    { x: 0, z: 300, prev: '240,-180', target: '300,-180', h: PI },
  ];
  game.cars.traffic.slice(0, 4).forEach((t, i) => {
    place(t, spots[i].x, spots[i].z, spots[i].h);
    t.prevNode = game.roads.byKey.get(spots[i].prev);
    t.targetNode = game.roads.byKey.get(spots[i].target);
    t.speed = 0;
  });
  game.cars.traffic[3].mesh.children[0].material = new MS({ color: 0x39557a, roughness: .4, metalness: .4 });
  game.cars.traffic.slice(4).forEach(t=>{place(t,0,300,0);});
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
  game.camDist = 5.5;
  game.camPitch = 0.25;
}
function stageSunset(game) {
  game.missions.setProgress(5, 0);
  const comet = game.cars.comet;
  place(comet, 22, -188, PI);
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
  const bc = pc(game, 17, -189, PI, 0);
  const bm = bc.mesh.children;
  bm[7].material.color.setHex(0x241a14);bm[8].material=new MS({color:0x141018,roughness:.9});bm[1].material=new MS({color:0x0a0a0c,roughness:.9});bc.mesh.position.y=-.15;
  for (const [ex, ez] of [[17, -189], [16.2, -188.3], [17.8, -189.7]]) game.combat.spawnExplosion(new V3(ex, 0, ez), 0.22);
  pc(game, 9, -189.5, PI, 0);
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
    pool(game, 17, -183.5, 1.1, .12);
  }
  game.cameraAngle = 0;
  game.lastDragAt = game.time;
  game.camDist = 7.5;
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
  game.hud.setShotMode(true, name === 'sunset');
  game.hud.update();
}
