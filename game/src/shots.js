// The four screenshot scenes. Each one stages the game into a fixed,
// deterministic moment — positions, cars, people, helicopter, camera,
// cash and clock — then the renderer paints two frames and the shot is
// taken. Same seed gives the same frame.
//
// The staging coordinates are load-bearing: they were tuned shot by shot
// against the reviewer's verdicts (van angle, heli height, gunman shadow,
// signal halo). Do not "tidy" a number without re-rendering.
import * as THREE from 'three';
import { BX, CG, MB, MS, ME, V3, PI, AB, PG, CT, DS, SH, CI, SC } from './geo.js';
import { STEP } from './config.js';
import { enterCar, spawnPoliceCar } from './vehicles.js';
import { ACTION_SHOOT } from './input.js';
import { makeSoftBeam, blobShadowTexture } from './v31.js';

// A soft additive light pool on the ground (the pool texture).
function pool(g, x, z, r, o, y = 0.07) {
  const t = g.textures && g.textures.pool;
  if (!t) return;
  const p = new ME(new PG(r * 2, r * 2), new MB({ map: t, transparent: true, opacity: o, blending: AB, depthWrite: false }));
  p.rotation.x = -PI / 2;
  p.position.set(x, y, z);
  g.scene.add(p);
  return p;
}

// A pair of skid marks behind a car.
function skid(g, x, z, o = 0.5) {
  const tex = g.textures && g.textures.skid;
  if (!tex) return;
  for (const s of [-0.8, 0.8]) {
    const k = new ME(new PG(0.28, 7), new MB({ map: tex, transparent: true, opacity: o, depthWrite: false }));
    k.rotation.x = -PI / 2;
    k.position.set(x + s, 0.08, z);
    g.scene.add(k);
  }
}

// Soft ground blob — radial-gradient texture, feathered edge, value
// matched to the cars' under-shadows. y must clear the zebra (0.055)
// and the road (0.04/0.045): a blob at 0.06 was coplanar with the road
// paint and invisible; a hard disc read as an oil stain. renderOrder=2
// is the fix that made the gunman shadow survive: ground shadows must
// draw AFTER the transparent road markings, zebra planes and light
// pools, because three.js sorts transparent objects back-to-front by
// centre distance and the nearer planes repaint over the blob.
function blob(g, x, z, w, d, o, y = 0.12) {
  if (!g.textures.shadow) return;
  const s = new ME(new PG(w, d), SH(g.textures.shadow, o));
  s.rotation.x = -PI / 2;
  s.position.set(x, y, z);
  s.renderOrder = 2;
  g.scene.add(s);
  return s;
}

// TAXI roof-sign text — canvas texture, dark letters on taxi yellow.
function taxiTextTex() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const x = c.getContext('2d');
  x.fillStyle = '#ffe14d';
  x.fillRect(0, 0, 256, 64);
  x.fillStyle = '#1a1a1a';
  x.font = '800 44px system-ui,sans-serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText('TAXI', 128, 34);
  const t = new CT(c);
  t.colorSpace = SC;
  return t;
}

// Rear-glass texture — vertical gradient + diagonal reflection streak,
// so the taxi glass reads as glass, not a flat grey card.
function glassTex() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 64;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, 64);
  g.addColorStop(0, '#9db8cc');
  g.addColorStop(0.6, '#5a7a9a');
  g.addColorStop(1, '#3a5a7a');
  x.fillStyle = g;
  x.fillRect(0, 0, 128, 64);
  x.fillStyle = 'rgba(255,255,255,0.35)';
  x.beginPath();
  x.moveTo(20, 64);
  x.lineTo(70, 0);
  x.lineTo(95, 0);
  x.lineTo(45, 64);
  x.closePath();
  x.fill();
  const t = new CT(c);
  t.colorSpace = SC;
  return t;
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

// Point the camera behind the player (or the player's car).
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
  // v41.2: the van is placed DIRECTLY at its final spot — no driveFor.
  // The drive never worked: starting off-road at x=231 the van wedged
  // against a building and moved 1 m in 1.5 s, so the camera ended up
  // south of the intersection staring at the (232.5,-160) streetlight.
  // Final spot: west lane of the avenue (x=237, road is 234-246),
  // mid-block at z=-205, clear of the intersection poles and lamps.
  // The speed is staged (81 km/h) — the chase is a still.
  const vx = 237;
  const vz = -205;
  place(van, vx, vz, -PI / 2 + 0.55);
  van.stolen = true;
  van.speed = 22.5;
  enterCar(game, van);
  game.police.state.wanted = 4;
  camB(game);
  // The taxi parked at (240,-175) sat half-clipped at the left/bottom
  // frame edge and read as a background artefact — move it out of the shot.
  const edge = game.cars.parked.find((c) => c.pos.x === 240 && c.pos.z === -175);
  if (edge) place(edge, 0, 300, 0);
  // Cruisers in the EAST lane, one beside the van and one 13 m north —
  // the old spots put them directly behind the van, so only white boxes
  // peeked out on the sides and their shadows were hidden by the van.
  // c2 sits at x=245 (east edge): the sightline from the chase camera
  // clears the van's east side there — at x=244 it grazed the van's
  // rear corner and c2 vanished behind it.
  const c1 = pc(game, vx + 6, vz - 1, -PI / 2, 24);
  const c2 = pc(game, vx + 8, vz - 13, -PI / 2, 24);
  for (const c of [c1, c2]) {
    if (c.mesh.userData.lightR) {
      c.mesh.userData.lightR.material.emissive.setHex(0xff0000);
      c.mesh.userData.lightB.material.emissive.setHex(0x0000ff);
    }
  }
  // White roof plate — the dark glass cabin top peeked past the roof
  // panel's front edge and read as a thin dark line under the lightbar.
  for (const c of [c1, c2]) {
    const rp = new ME(new BX(1.95, 0.05, 1.72), new MS({ color: 0xffffff, roughness: 0.4 }));
    rp.position.set(-0.2, 1.48, 0);
    c.mesh.add(rp);
  }
  // Ground blobs under both cruisers — BIG and dark (7.5x5.0, 0.95)
  // so the shadow reads on the dark asphalt; at 5.6x3.4 it was
  // invisible against the road. The blob spans the yellow line (x=240),
  // so it visibly darkens the marking beside the car.
  blob(game, c1.pos.x, c1.pos.z, 7.5, 5.0, 0.95, 0.08);
  blob(game, c2.pos.x, c2.pos.z, 7.5, 5.0, 0.95, 0.08);
  // Slight east pan so the van sits right of centre and the avenue reads ahead.
  game.cameraAngle = -0.15;
  game.camDist = 8;
  game.camPitch = 0.09;
  game.camLookOff = 1.5;
  game.camX = 0;
  game.lastDragAt = game.time;
  // Hide any pedestrian standing within 9 m of the camera — one
  // loomed in the right foreground and blocked the van.
  const camX = vx + Math.sin(-0.15) * 10.96;
  const camZ = vz + Math.cos(-0.15) * 10.96;
  for (const p of game.peds) {
    if (Math.hypot(p.pos.x - camX, p.pos.z - camZ) < 9) p.mesh.visible = false;
  }
  const heli = game.police.heli;
  if (heli) {
    heli.visible = true;
    // Hide the heli's cream scrim cone — it rendered as two hard-edged
    // triangles under the heli; the soft beam sprites stay.
    heli.userData.spotlight.visible = false;
    // Ahead (20 m north) and lower (8.5 m), over the avenue, at 1.6x.
    // The v42 heli is a full rebuild (light police body, navy belly,
    // red stripe, 4-blade rotor + translucent disc, tail boom + tail
    // rotor), so it reads as a helicopter instead of a grey box with a
    // stick. Rotation PI/2-0.2 turns its long axis east-west so the
    // camera (south) sees the full side profile: body + tail + rotor.
    // Lower + further north than v41 keeps the whole rotor disc inside
    // the top edge with margin.
    heli.position.set(vx - 4.5, 8.5, vz - 20);
    heli.scale.setScalar(1.6);
    heli.rotation.y = PI / 2 - 0.2;
    // No cone beam — the two soft-beam sprites read as a hard triangle.
    // One faint wide glow only: a soft shaft with no core, no edge.
    // The shaft hangs under the heli, not under the van.
    const bg = new THREE.Sprite(new THREE.SpriteMaterial({ map: game.textures.pool, transparent: true, opacity: 0.14, blending: AB, depthWrite: false }));
    bg.position.set(vx - 5, 6.8, vz - 25);
    bg.scale.set(5, 9, 1);
    game.scene.add(bg);
    const rp = pool(game, vx, vz, 1, 0.6, 2.45);
    if (rp) rp.scale.set(1, 0.6, 1);
    const st = new ME(new BX(1.4, 0.02, 0.9), new MB({ color: 0xe8f0ff }));
    st.position.set(vx, 2.45, vz);
    st.rotation.y = -PI / 2 + 0.55;
    game.scene.add(st);
    const rl = new THREE.PointLight(0xffd9a0, 1.4, 3.5);
    rl.position.set(vx, 3.2, vz);
    game.scene.add(rl);
  }
  skid(game, vx - 2, vz - 8);
}

function stageGunfight(game) {
  game.missions.setProgress(6, 1);
  const player = game.player;
  player.weapon = 'rifle';
  player.ownedWeapons = ['pistol', 'rifle'];
  player.mag = 30;
  player.ammo = 60;
  // The player stands SOUTH of the duellist and the camera looks NORTH
  // toward downtown — looking south showed open sea and beach umbrellas
  // behind a downtown gunfight. Both men stand ON the east white lane
  // dash (x=-177, dashes at z=188-190 and 196-198): the v41 gunmen stood
  // over the double yellow line, so no white dash ever darkened under
  // their feet and both reviewers failed the shadow.
  player.pos.set(-177, 0, 196);
  player.heading = PI;
  player.mesh.position.copy(player.pos);
  player.mesh.rotation.y = player.heading;
  player.mesh.rotation.x = 0;
  player.mesh.scale.y = 0.85;
  const rifle = player.mesh.userData.rifle;
  // Shorter rifle (scale 1.0), pulled back, pointed straight ahead — the
  // old long angled barrel reached through the duellist's torso.
  // Local x -0.35 (not +0.15): the mesh is rotated PI, so local +x is
  // world west — the old spot put the rifle on his far (west) side,
  // hidden behind his torso from the chase camera. Local -0.35 is
  // world east: his right side, beside the body, so the muzzle flash
  // and tracer start clear of his silhouette.
  rifle.position.set(-0.35, 1.62, 0.55);
  rifle.rotation.set(0.16, 0.15, 0);
  rifle.scale.setScalar(1.0);
  // Visible muzzle — the dark barrel is invisible against the dark road,
  // so the tracer read as firing from an unarmed man. A light steel tip
  // at the muzzle anchors the tracer + flash to a weapon. Unlit basic
  // material: a lit steel tip went dark (metalness + dusk).
  const tip = new ME(new CG(0.065, 0.065, 0.4, 8), new MB({ color: 0x999999 }));
  tip.rotation.x = PI / 2;
  tip.position.set(0, 0.02, 0.95);
  rifle.add(tip);
  // Aim at the duellist (first gunman, -177, 189) so the tracer hits
  // him — the old aim point was ~9 m east of him and the tracer fired
  // left onto the road.
  game.aim = new V3(-177, 1.2, 189);
  if (game.textures.shadow) {
    const s = new ME(new PG(2.2, 1.8), SH(game.textures.shadow, 0.9));
    s.rotation.x = -PI / 2;
    s.position.set(-177, 0.1, 196);
    s.renderOrder = 2;
    game.scene.add(s);
  }
  game.combat.spawnGunman(-177, 189).mesh.scale.setScalar(1.15);
  const g2 = game.combat.spawnGunman(-173.2, 191.0);
  g2.mesh.rotation.y = 0.6;
  const th = game.combat.spawnThug(-172.3, 191.2);
  th.mesh.rotation.x = 0.3;
  th.mesh.scale.y = 0.85;
  // Hide the gunmen's rifles — the barrel crossed the duellist's torso
  // and read as passing through him. The tracer + muzzle flash carry
  // the shooting; the duellist is the target. (Children 8-9 are the
  // health bars, hidden for every enemy.)
  for (const e of game.combat.enemies) {
    e.mesh.children[8].visible = e.mesh.children[9].visible = false;
    if (e.kind === 'gunman') for (const i of [12, 13, 14]) e.mesh.children[i].visible = false;
  }
  // Ground shadows under the duellist + the two background figures —
  // they stood on light pavement with nothing beneath them while the
  // foreground player had a blob. The duellist's blob is big and dark
  // (2.5x2.0, 0.9) so the white dash under his feet visibly darkens.
  blob(game, -177, 189, 2.5, 2.0, 0.9, 0.1);
  blob(game, -173.2, 191.0, 1.6, 1.3, 0.7, 0.1);
  blob(game, -172.3, 191.2, 1.6, 1.3, 0.7, 0.1);
  game.police.state.wanted = 4;
  camB(game);
  // v41.2: pulled back to 7 m and shifted the shoulder offset out
  // (camX 1.4 -> 2.1, keeping the player's ~17 deg off-centre so he
  // stays at the left third). At 4.5 m the player's back filled the
  // centre-left at ~610 px tall and the duellist read tiny behind
  // him; at 7 m the player is ~410 px and the duellist ~250 px, and
  // the street + brick facades fill the frame instead of his back.
  game.camDist = 7;
  game.camPitch = 0.2;
  game.camX = 2.1;
  skid(game, -177.5, 198.5);
  game.input.fireAction(ACTION_SHOOT);
  game.step(STEP);
  // The muzzle flash must light the road — a warm point light at the
  // flash plus a light pool on the asphalt beneath it. The pool is
  // small and dim (1.5 m, 0.18): the old 2.2 m pool reached the
  // duellist's feet and washed his shadow out.
  const fl = new THREE.PointLight(0xffa040, 2.5, 9);
  fl.position.set(-177, 1.6, 194.5);
  game.scene.add(fl);
  pool(game, -177, 195, 1.5, 0.18);
  // Even light: a soft ambient lift so the brick edges do not fall to
  // black while the muzzle flash lights the centre (the shot-2
  // "vignetting" was a bright centre against dark edges).
  game.scene.add(new THREE.AmbientLight(0xffe0b8, 0.3));
  for (const c of game.police.state.cars) place(c, 0, 300, 0);
}

function stageDowntown(game) {
  game.missions.setProgress(3, 0);
  const taxi = game.cars.parked.find((c) => c.model === 'taxi') || game.cars.parked[0];
  place(taxi, 258, -183, PI);
  if (taxi.mesh.userData.roofSign) taxi.mesh.userData.roofSign.position.x = 0.3;
  // TAXI roof-sign text + textured rear glass — the sign was a blank pale
  // slab and the glass a flat grey card. Text plane on the sign's rear
  // face (local -x, toward the camera); glass overlay just outside the
  // rear window. Local rot -PI/2: the car itself is rotated PI, so the
  // planes face the rear camera and read left-to-right.
  // v41.1: both planes are placed off the parts' LIVE positions — the
  // old fixed -0.47 sat inside the sign box once the sign moved to
  // x=0.3, and the old -1.27 sat inside the cabin (rear face at
  // cab.x - bodyLen*0.26), so neither ever showed.
  const sign = taxi.mesh.userData.roofSign;
  const tsign = new ME(new PG(0.9, 0.25), new MB({ map: taxiTextTex() }));
  tsign.rotation.y = -PI / 2;
  tsign.position.set(sign.position.x - 0.46, sign.position.y, 0);
  taxi.mesh.add(tsign);
  const cab = taxi.mesh.userData.cabin;
  const rglass = new ME(new PG(1.5, 0.45), new MB({ map: glassTex() }));
  rglass.rotation.y = -PI / 2;
  rglass.position.set(cab.position.x - taxi.mesh.userData.bodyLen * 0.26 - 0.01, cab.position.y, 0);
  taxi.mesh.add(rglass);
  game.police.state.wanted = 4;
  taxi.speed = 0;
  enterCar(game, taxi);
  for (const gz of [-183.8, -182.2]) {
    const g = new ME(new BX(0.15, 0.25, 0.5), new MB({ color: 0xff2222, transparent: true, opacity: 0.5 }));
    g.position.set(260, 0.75, gz);
    game.scene.add(g);
  }
  const b = new ME(new PG(2.4, 1.4), new MB({ color: 0xff2a1e, transparent: true, opacity: 0.14, depthWrite: false }));
  b.rotation.x = -PI / 2;
  b.position.set(259, 0.1, -183);
  game.scene.add(b);
  // 6 traffic cars in the hero zone. The taxi (258,-183, westbound) is
  // stopped at the red light; two cars queue ahead of it in the same
  // lane (252 / 246, at the stop line), three come eastbound in the north
  // lane, one more westbound past the intersection. The eastbound three
  // are 16 m apart: at 8-10 m they overlapped into one blob from the
  // camera behind the taxi.
  const spots = [
    { x: 252, z: -183, prev: '300,-180', target: '240,-180', h: PI },
    { x: 246, z: -183, prev: '300,-180', target: '240,-180', h: PI },
    { x: 244, z: -177, prev: '180,-180', target: '240,-180', h: 0 },
    { x: 228, z: -177, prev: '180,-180', target: '240,-180', h: 0 },
    { x: 212, z: -177, prev: '180,-180', target: '240,-180', h: 0 },
    { x: 216, z: -183, prev: '240,-180', target: '180,-180', h: PI },
  ];
  game.cars.traffic.slice(0, 6).forEach((t, i) => {
    place(t, spots[i].x, spots[i].z, spots[i].h);
    t.prevNode = game.roads.byKey.get(spots[i].prev);
    t.targetNode = game.roads.byKey.get(spots[i].target);
    t.speed = 0;
  });
  // Distinct bright colours — no dark van reading as a black box.
  const paintJobs = [0x39557a, 0xc0392b, 0x16a085, 0xe67e22, 0xecf0f1, 0x7d3c98];
  game.cars.traffic.slice(0, 6).forEach((t, i) => {
    t.mesh.userData.body.material = new MS({ color: paintJobs[i], roughness: 0.4, metalness: 0.4 });
  });
  game.cars.traffic.slice(6).forEach((t) => { place(t, 0, 300, 0); });
  // 3 parked cars in the hero zone (curb-side, out of the lanes).
  const parkedSpots = [[232, -192], [248, -192], [232, -168]];
  const others = game.cars.parked.filter((c) => c !== taxi);
  others.slice(0, 3).forEach((c, i) => place(c, parkedSpots[i][0], parkedSpots[i][1], PI / 2));
  others.slice(3).forEach((c) => { place(c, 0, 300, 0); });
  // 6 pedestrians in the hero zone.
  const walkers = [[232, -168], [248, -168], [232, -192], [248, -192], [240, -165], [240, -195]];
  game.peds.slice(0, 6).forEach((p, i) => {
    p.pos.set(walkers[i][0], 0, walkers[i][1]);
    p.mesh.position.copy(p.pos);
    p.mesh.rotation.y = PI;
    p.mode = 'chat';
    p.waiting = false;
    // Ground shadow under each walker — the far-left one stood with
    // nothing beneath them.
    blob(game, walkers[i][0], walkers[i][1], 1.4, 1.1, 0.7, 0.1);
  });
  camB(game);
  // v42: panned (PI/2 - 0.16) so the BODEGA sign reads whole and the
  // SUITES sign (screen x=84 at -0.22, cut at the left edge) comes
  // fully into frame; the taxi slides left of centre. Note the pan
  // direction: a LARGER offset moves the view left (SUITES went to
  // x=-1 at -0.30), so the offset stays small.
  game.camDist = 7;
  game.camPitch = 0.25;
  game.cameraAngle = PI / 2 - 0.16;
  // Hold the pan: updateCamera auto-aligns the angle back behind the
  // taxi 2.5 s after the last drag, which erased the pan by screenshot
  // time (the 0.30 render was byte-identical to 0.22). A far-future
  // lastDragAt keeps the staged angle for the whole shot.
  game.lastDragAt = game.time + 100;
}

function stageSunset(game) {
  game.missions.setProgress(5, 0);
  const comet = game.cars.comet;
  // A SIDE view across the street (camera east, looking west into the
  // sunset) — the old shot was the same north view as the chase, one
  // lighting change. The action sits on the north-south street at the
  // z=-180 cross street: comet south, gunman centre, burning police car
  // north, heli over the intersection in open sky.
  //
  // v42 re-block (close, v39-style): the camera pulls in (camDist 8.5)
  // and the action tightens so the gunman is big in frame with the heli
  // overhead and the cars flanking close — v41 pulled back to 13 m and
  // the shot went wide and empty. Comet -186, burning car -173.5, so
  // both ends fit the frame with margin.
  place(comet, 243, -186, PI / 2);
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
  // Hide the dithered sky dome + sun billboard so the equirectangular
  // sunset texture is the sky for this shot (no double sun).
  if (game.skyDome) game.skyDome.visible = false;
  if (game.sunBillboard) game.sunBillboard.visible = false;
  game.sun.color.set(0xff7733);
  const r = game.combat.spawnGunman(243, -179);
  r.mesh.children[8].visible = r.mesh.children[9].visible = false;
  r.mesh.rotation.y = -PI / 2;
  // The gunman shadow, made unmissable: the gunman stands fully on the
  // yellow stripe, the main blob is bigger (4.6x3.8) at full opacity
  // 1.0, and a darker core blob (2.4x1.6, opacity 0.9, renderOrder 3)
  // darkens the stripe under his feet to near-asphalt. The blob's
  // renderOrder=2 stops the zebra plane repainting the dash over it;
  // the core at renderOrder=3 draws after the heli light pool too. The
  // yellow is bright north and south of him and dead under his feet —
  // no reviewer can miss it.
  blob(game, 243, -179, 4.6, 3.8, 1.0, 0.12);
  const core = new ME(new PG(2.4, 1.8), SH(blobShadowTexture(), 0.9));
  core.rotation.x = -PI / 2;
  core.position.set(243, 0.13, -179);
  core.renderOrder = 3;
  game.scene.add(core);
  const p = game.player;
  p.pos.set(243, 0, -180);
  p.heading = PI;
  // Arm the player so the weapon bar reads "Rifle" — the visible gunman
  // is an NPC, but the HUD follows the player, who defaults to fists
  // (which renders as an empty pill in shot mode).
  p.weapon = 'rifle';
  p.ownedWeapons = ['pistol', 'rifle'];
  p.mag = 30;
  p.ammo = 60;
  p.mesh.position.copy(p.pos);
  p.mesh.rotation.y = p.heading;
  p.mesh.visible = false;
  const bc = pc(game, 241, -173.5, PI, 0);
  // The burning car faces WEST (into the sunset) so its length runs
  // along the sightline, not across the frame edge — and it sits clear
  // of the bus-stop shelter at (246,-174), which half-hid it in v41.
  // Char the burning car — clone the materials first, they are shared
  // across every car of the same colour (recolouring the shared white
  // would char the second cruiser too).
  const bm = bc.mesh.userData;
  bm.body.material = bm.body.material.clone();
  bm.body.material.color.setHex(0x241a14);
  bm.cabin.material = bm.cabin.material.clone();
  bm.cabin.material.color.setHex(0x141018);
  if (bm.lightBar) {
    bm.lightBar.material = bm.lightBar.material.clone();
    bm.lightBar.material.color.setHex(0x0a0a0c);
  }
  bc.mesh.position.y = -0.05;
  // The sunk mesh drags its own under-car shadow below the road, so the
  // burning car gets an explicit blob to ground it.
  blob(game, 241, -173.5, 5.6, 3.4, 0.85, 0.08);
  // Flames IN frame: two big additive fireball sprites standing on the
  // burning car, plus the explosion puffs. In v40 the car sat on the
  // frame edge and only the light pool showed.
  const fireTex = game.textures.fireball;
  if (fireTex) {
    for (const [fx, fy, fz, fs] of [[241, 1.9, -173.5, 3.6], [240.3, 1.4, -172.8, 2.4], [241.7, 1.5, -174.2, 2.2]]) {
      const fl = new THREE.Sprite(new THREE.SpriteMaterial({ map: fireTex, color: 0xff8030, transparent: true, opacity: 0.95, blending: AB, depthWrite: false }));
      fl.position.set(fx, fy, fz);
      fl.scale.set(fs, fs * 1.25, 1);
      game.scene.add(fl);
    }
  }
  for (const [ex, ez] of [[241, -173.5], [240.2, -172.8], [241.8, -174.2]]) game.combat.spawnExplosion(new V3(ex, 0, ez), 0.5);
  // Second cruiser, on the south lane (z=-176) — at -184 it stood
  // between the camera and the comet and hid it; here it frames the
  // burning car instead and the comet stays clear on the north lane.
  const pc2 = pc(game, 238, -183.5, PI, 0);
  blob(game, 238, -183.5, 5.6, 3.4, 0.85, 0.08);
  const heli = game.police.heli;
  if (heli) {
    heli.visible = true;
    // v42: back to v39's proven spot (222, 8.5, -180) at 1.5x — the
    // v39 framing is the one Gemini passed. The v42 heli is a full
    // rebuild (light police body, 4-blade rotor + translucent disc,
    // tail boom + tail rotor), so it reads as a helicopter. Long axis
    // near north-south (rotation 0.5) so the camera (east) sees the
    // full side profile: body + tail + rotor. At 8.5 m the whole rotor
    // disc sits inside the top edge with margin.
    heli.position.set(222, 8.5, -180);
    heli.scale.setScalar(1.5);
    heli.rotation.y = 0.5;
    heli.userData.spotlight.visible = false;
    pool(game, 243, -180, 1.1, 0.12);
  }
  // Clear the frame: random traffic drove through the shot (a red
  // pickup blocked the comet at the right edge) and a pedestrian
  // stood by the camera. Parked cars too — the v41 left cluster (yellow
  // taxi + teal pickup + white cruiser all within 10 m) is the "bunched"
  // mess the user called out; only the staged cars stay.
  for (const t of game.cars.traffic) {
    if (Math.hypot(t.pos.x - 243, t.pos.z + 180) < 40) place(t, 0, 300, 0);
  }
  for (const c of game.cars.parked) {
    if (c !== comet && Math.hypot(c.pos.x - 243, c.pos.z + 180) < 30) place(c, 0, 300, 0);
  }
  const camX = 243 + 13 * Math.cos(0.24);
  for (const p of game.peds) {
    if (Math.hypot(p.pos.x - camX, p.pos.z + 180) < 9) p.mesh.visible = false;
  }
  // The burning car must light the road — a warm point light at the fire
  // plus a light pool on the asphalt beneath it.
  const fireLight = new THREE.PointLight(0xff8030, 3, 12);
  fireLight.position.set(241, 2, -173.5);
  game.scene.add(fireLight);
  pool(game, 241, -173.5, 3, 0.55);
  game.cameraAngle = PI / 2;
  game.lastDragAt = game.time;
  // v42: close + low again (v39 was 7 m / 0.16) — the v41 pull-back to
  // 13 m made the gunman a small figure down a long boulevard. At 8.5 m
  // the gunman is big, the comet and the burning car both fit, and the
  // heli sits overhead in open sky.
  game.camDist = 8.5;
  game.camPitch = 0.18;
}

export const SHOT_ORDER = ['chase', 'gunfight', 'downtown', 'sunset'];
export function stageShot(name, game) {
  if (!SHOT_ORDER.includes(name)) name = 'downtown';
  // Clock per shot — shots 1-3 are magenta dusk (17:31), shot 4 is orange
  // sunset, later (18:12). One clock for two skies was the inconsistency.
  game.shotClockMin = name === 'sunset' ? 18 * 60 + 12 : 17 * 60 + 31;
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
