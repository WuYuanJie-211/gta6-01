import * as THREE from 'three';
import { STEP } from './config.js';
import { enterCar, spawnPoliceCar } from './vehicles.js';
import { ACTION_SHOOT } from './input.js';
function steerCarToward(game, tx, tz) {
  const car = game.player.car;
  if (!car) return;
  const dx = tx - car.pos.x;
  const dz = tz - car.pos.z;
  const wanted = Math.atan2(-dz, dx);
  let diff = wanted - car.heading;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
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
function cameraBehind(game) {
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
  place(van, 243, -60, Math.PI / 2);
  van.stolen = true;
  enterCar(game, van);
  game.police.state.wanted = 4;
  for (const [x, z] of [[237, -62], [243, -72], [237, -82]]) pc(game, x, z, Math.PI / 2, 24);
  for (const [x, z] of [[231, -120], [255, -135]]) pc(game, x, z, Math.PI / 2, 24);
  cameraBehind(game);
  driveFor(game, 1.5, (g) => steerCarToward(g, 243, -360));
  game.camDist = 14;
  game.camPitch = 0.28;
  const heli = game.police.heli;
  if (heli) {
    heli.visible = true;
    heli.position.set(game.player.car.pos.x - 6, 10, game.player.car.pos.z - 18);
    heli.scale.setScalar(1.5);
  }
}
function stageGunfight(game) {
  game.missions.setProgress(6, 1);
  const player = game.player;
  player.weapon = 'rifle';
  player.ownedWeapons = ['pistol', 'rifle'];
  player.mag = 30;
  player.ammo = 60;
  player.pos.set(-181.5, 0, 192.5);
  player.heading = 0.15;
  player.mesh.position.copy(player.pos);
  player.mesh.rotation.y = player.heading;
  player.mesh.scale.y = 0.68;
  player.mesh.userData.rifle.position.y = 1.7;
  const barrier = new THREE.Mesh(new THREE.BoxGeometry(3, 1.1, 0.7), new THREE.MeshStandardMaterial({ map: game.textures.concrete, roughness: 0.9 }));
  barrier.position.set(-181, 0.55, 194);
  game.scene.add(barrier);
  game.combat.spawnGunman(-182, 201);
  game.combat.spawnGunman(-174, 207);
  game.combat.spawnThug(-188, 204);
  pc(game, -196, 186, Math.PI / 2, 0);
  game.police.state.wanted = 4;
  cameraBehind(game);
  game.cameraAngle = -0.25;
  game.camDist = 6;
  game.camPitch = 0.12;
  for (const [cx, cz] of [[-180.5, 191.5], [-182, 191], [-180, 192], [-182.5, 192]]) game.combat.spawnCasing(new THREE.Vector3(cx, 0.1, cz), player.heading);
  game.input.fireAction(ACTION_SHOOT);
  game.step(STEP);
}
function stageDowntown(game) {
  game.missions.setProgress(3, 0);
  const taxi = game.cars.parked.find((c) => c.model === 'taxi') || game.cars.parked[0];
  place(taxi, 258, -183, Math.PI);
  game.police.state.wanted = 4;
  taxi.speed = 0;
  enterCar(game, taxi);
  for (const gz of [-183.8, -182.2]) {
    const g = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.25, 0.5), new THREE.MeshBasicMaterial({ color: 0xff2222, transparent: true, opacity: 0.85 }));
    g.position.set(261, 0.75, gz);
    game.scene.add(g);
  }
  const spots = [
    { x: 180, z: -177, prev: '120,-180', target: '240,-180', h: 0 },
    { x: 240, z: -177, prev: '180,-180', target: '300,-180', h: 0 },
    { x: 300, z: -177, prev: '240,-180', target: '360,-180', h: 0 },
    { x: 150, z: -183, prev: '180,-180', target: '120,-180', h: Math.PI },
    { x: 210, z: -183, prev: '240,-180', target: '180,-180', h: Math.PI },
    { x: 270, z: -183, prev: '300,-180', target: '240,-180', h: Math.PI },
  ];
  game.cars.traffic.slice(0, 6).forEach((t, i) => {
    place(t, spots[i].x, spots[i].z, spots[i].h);
    t.prevNode = game.roads.byKey.get(spots[i].prev);
    t.targetNode = game.roads.byKey.get(spots[i].target);
    t.speed = 0;
  });
  const walkers = [[120, -172], [150, -188], [180, -172], [200, -188]];
  game.peds.slice(0, 4).forEach((p, i) => {
    p.pos.set(walkers[i][0], 0, walkers[i][1]);
    p.mesh.position.copy(p.pos);
    p.mesh.rotation.y = Math.PI;
    p.mode = 'chat';
    p.waiting = false;
  });
  cameraBehind(game);
  game.camDist = 6.5;
  game.camPitch = 0.25;
}
function stageSunset(game) {
  game.missions.setProgress(5, 0);
  const comet = game.cars.comet;
  place(comet, 30, -180, Math.PI);
  comet.stolen = true;
  comet.speed = 28;
  enterCar(game, comet);
  game.police.state.wanted = 5;
  game.cash = 2000000;
  const tex = game.textures.sunsetSky;
  if (tex) {
    tex.mapping = THREE.EquirectangularReflectionMapping;
    game.scene.background = tex;
    game.scene.fog.color.set(0x8a4a6a);
  }
  game.sun.color.set(0xff7733);
  cameraBehind(game);
  for (const [dx, dz] of [[8, 2], [6, -6]]) pc(game, 30 + dx, -180 + dz, Math.PI, 26);
  pc(game, 15, -185, Math.PI, 24);
  for (const [ex, ez] of [[15, -185], [16.5, -184], [13.5, -186]]) game.combat.spawnExplosion(new THREE.Vector3(ex, 0, ez));
  const heli = game.police.heli;
  if (heli) {
    heli.visible = true;
    heli.position.set(8, 7, -174);
    heli.scale.setScalar(1.8);
  }
  game.camDist = 11;
  game.camPitch = 0.15;
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
