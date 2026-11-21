// The four screenshot scenes. Each one stages the game into a fixed,
// deterministic moment — positions, cars, people, helicopter, camera,
// cash and clock — then the renderer paints two frames and the shot is
// taken. Same seed gives the same frame.
//
// The staging coordinates are load-bearing: they were tuned shot by shot
// against the reviewer's verdicts (van angle, heli height, gunman shadow,
// signal halo). Do not "tidy" a number without re-rendering.
import * as THREE from 'three';
import { BX, CG, CN, MB, MS, ME, V3, PI, AB, PG, CT, DS, SH, CI, SC } from './geo.js';
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
// One shared shadow system (v42/v43): every blob uses the SAME
// procedural 256x256 all-black texture + the same pure-black normal-
// blending material. Opacity is FIXED by category — car 0.6,
// pedestrian 0.5, dark core 0.85 — so no object reads lighter or
// darker than the rest, and no blob can ever be brighter than the road.
function blob(g, x, z, w, d, o, y = 0.12) {
  const s = new ME(new PG(w, d), SH(blobShadowTexture(), o));
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

function setFov(game, f) {
  game.camera.fov = f;
  game.camera.updateProjectionMatrix();
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
  // c2 sits at x=246 (east edge) and 16 m north — clear of the van's
  // c1 angled 23 deg (L-shape): from dead behind, c2 hid as a sliver
  // behind c1 — both white, 3 m apart. With c1 diagonal, c2 (straight)
  // reads as a distinct second cruiser beside it, not a white box
  // peeking out behind the van.
  const c1 = pc(game, vx + 6, vz - 1, -PI / 2 + 0.4, 24);
  const c2 = pc(game, vx + 9, vz - 23, -PI / 2, 24);
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
  blob(game, c1.pos.x, c1.pos.z, 7.5, 5.0, 0.6, 0.08);
  blob(game, c2.pos.x, c2.pos.z, 7.5, 5.0, 0.6, 0.08);
  // Layout plan (v43): camera 1.4 m, pitch ~level, FOV 48 (NOT 60) —
  // narrowing compresses the three cars into a layered diagonal.
  // camPitch 0.11 puts the camera at ~2.8 m — just above the tall
  // van's roof. At 1.4 m the camera sat below the roof and the van
  // blocked c2 entirely; from above the roof c2 reads over it.
  game.cameraAngle = -0.15;
  game.camDist = 8;
  game.camPitch = 0.11;
  game.camLookOff = 1.5;
  game.camX = -1.0;
  setFov(game, 48);
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
    // Rotor parked at a diagonal so the 4 blades read as an X, never a
    // single rod (the shot never steps the game, so the rotor is static).
    heli.userData.rotor.rotation.y = 0.6;
    // No cone beam — the two soft-beam sprites read as a hard triangle.
    // One faint wide glow only: a soft shaft with no core, no edge.
    // The shaft hangs under the heli, not under the van.
    const bg = new THREE.Sprite(new THREE.SpriteMaterial({ map: game.textures.pool, transparent: true, opacity: 0.14, blending: AB, depthWrite: false }));
    bg.position.set(vx - 5, 6.8, vz - 25);
    bg.scale.set(5, 9, 1);
    game.scene.add(bg);
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
  // toward downtown. Both men stand ON the east white lane dash
  // (x=-177) at the CENTRE of a dash segment — player z=197 (dash
  // 196-198), duellist z=189 (dash 188-190) — so the shadow blob covers
  // the white dash under their feet for a full segment. The blob is big
  // (4.5x3.5) with a dark core, so the dash is visibly half-dark north
  // and south of their feet at normal size — the v42 blob (2.2x1.8)
  // only darkened a sliver the reviewers could not see.
  player.pos.set(-177, 0, 197);
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
  // No steel tip: the light tip read as a detached floating handgun
  // (v42). The barrel is mid-grey now and the flash cone at the muzzle
  // anchor carries the shot.
  // Aim at the duellist (first gunman, -183, 189) so the tracer hits
  // him. He stands on the WEST white dash (x=-183), 6 m west of the
  // player — so in frame he reads LEFT of the player (layout plan:
  // second man at (560, 500), player on the right golden line).
  game.aim = new V3(-183, 1.2, 189);
  game.combat.spawnGunman(-183, 189).mesh.scale.setScalar(1.15);
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
  // Ground shadows under all three men — big and dark with a core, so
  // the white dash under each pair of feet is visibly half-dark. The
  // core (renderOrder 3) draws after the dash texture and after any
  // light pool, so nothing repaints over it.
  blob(game, -177, 197, 4.5, 3.5, 0.5, 0.1);
  const pcore = new ME(new PG(2.5, 1.8), SH(blobShadowTexture(), 0.85));
  pcore.rotation.x = -PI / 2;
  pcore.position.set(-177, 0.13, 197);
  pcore.renderOrder = 3;
  game.scene.add(pcore);
  blob(game, -183, 189, 3.5, 2.8, 0.5, 0.1);
  const dcore = new ME(new PG(2.0, 1.5), SH(blobShadowTexture(), 0.85));
  dcore.rotation.x = -PI / 2;
  dcore.position.set(-183, 0.13, 189);
  dcore.renderOrder = 3;
  game.scene.add(dcore);
  blob(game, -173.2, 191.0, 2.0, 1.6, 0.5, 0.1);
  blob(game, -172.3, 191.2, 2.0, 1.6, 0.5, 0.1);
  game.police.state.wanted = 4;
  camB(game);
  // Profile view, NOT over-the-shoulder: camB puts the camera due
  // south (behind the player), so the muzzle, flash and rifle are all
  // occluded by his own body. From the SOUTH-SOUTHEAST (angle PI/6)
  // we see his right side — the rifle, the muzzle and the flash in
  // profile — and the duellist sits up-left of him, not directly
  // behind him (at PI/4 the duellist hid behind the player).
  game.cameraAngle = PI / 6;
  // Layout plan: camera 1.2 m, pitch ~level, FOV 40 — telephoto
  // compression presses the wall up against the figures. camX is
  // NEGATIVE now: the near gunman sits on the RIGHT golden line (the
  // old +2.1 put him at the left third).
  game.camDist = 7;
  game.camPitch = -0.06;
  game.camX = -2.1;
  setFov(game, 40);
  skid(game, -177.5, 198.5);
  game.input.fireAction(ACTION_SHOOT);
  game.step(STEP);
  // The muzzle flash lights the road — a warm point light at the flash.
  // NO ground light pool: the additive pool washed the gunman shadows
  // out and read as a glowing yellow blob under their feet (v42).
  const fl = new THREE.PointLight(0xffa040, 2.5, 9);
  fl.position.set(-177, 1.6, 194.5);
  game.scene.add(fl);
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
  // Brake-light boxes on the taxi's rear (on the car, not the ground).
  // NO red glow plane on the asphalt: it read as a light blob under
  // the taxi (v42).
  for (const gz of [-183.8, -182.2]) {
    const g = new ME(new BX(0.15, 0.25, 0.5), new MB({ color: 0xff2222, transparent: true, opacity: 0.5 }));
    g.position.set(260, 0.75, gz);
    game.scene.add(g);
  }
  // 6 traffic cars in the hero zone. The taxi (258,-183, westbound) is
  // stopped at the red light; two cars queue ahead of it in the same
  // lane, three come eastbound in the north lane, one more westbound
  // past the intersection. The queue cars are staggered 2 m sideways so
  // they read as separate cars, not one blob, and the taxi's black roof
  // no longer sticks to the car ahead.
  const spots = [
    { x: 252, z: -181.6, prev: '300,-180', target: '240,-180', h: PI },
    { x: 246, z: -184.4, prev: '300,-180', target: '240,-180', h: PI },
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
  // 3 parked cars, parallel-parked IN the avenue's east lane (x=244.5,
  // fully on the road) — the old curb-side spots (x=248/232) put the
  // van half on the sidewalk, straddling the curb.
  const parkedSpots = [[244.5, -192], [244.5, -168], [244.5, -204]];
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
    blob(game, walkers[i][0], walkers[i][1], 1.4, 1.1, 0.5, 0.1);
  });
  camB(game);
  // v43: panned (PI/2 - 0.10) — a SMALLER offset moves SUITES right
  // into frame (at -0.16 its S was still cut at the left edge; at -0.30
  // it fell off the frame). BODEGA stays readable at this pan.
  // Layout plan: the ONLY overhead telephoto — camera 9 m, FOV 34.
  // camDist 32 puts the camera 35 m back, so the taxi reads 22-26%
  // of frame width and the street converges to a vanishing point.
  // camLookOff -1.5 nudges the taxi right toward the golden point;
  // cameraAngle -0.05 (not -0.10) pulls SUITES fully in frame.
  game.camDist = 32;
  game.camPitch = 0.21;
  game.cameraAngle = PI / 2 - 0.05;
  game.camX = 2.5;
  game.camLookOff = -1.5;
  setFov(game, 34);
  // Foreground silhouette: a pedestrian on the south sidewalk ~10 m
  // from the camera, lower-left, back to the camera — the Z-path
  // anchor that pulls the eye back down.
  const fg = game.peds[6];
  if (fg) {
    fg.pos.set(269, 0, -174);
    fg.mesh.position.copy(fg.pos);
    fg.mesh.rotation.y = PI;
    fg.mode = 'chat';
    fg.waiting = false;
    blob(game, 269, -174, 1.4, 1.1, 0.5, 0.1);
  }
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
  place(comet, 243, -196, PI / 2);
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
  // Gunman ON the east white lane dash (x=243), 1.5 m NORTH of the
  // camera target — at 9 m that is ~10 deg off the view axis, so in
  // frame he reads on the RIGHT golden line (791, 500), back to
  // camera, rim-lit. (At z=-184 he was 29 deg off-axis, out of frame.)
  const r = game.combat.spawnGunman(243, -181.5);
  r.mesh.children[8].visible = r.mesh.children[9].visible = false;
  r.mesh.rotation.y = PI / 2;
  blob(game, 243, -181.5, 5.0, 4.0, 0.5, 0.12);
  const core = new ME(new PG(2.5, 1.8), SH(blobShadowTexture(), 0.85));
  core.rotation.x = -PI / 2;
  core.position.set(243, 0.13, -181.5);
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
  // Burning car 2 m SOUTH of the camera target's axis (~10 deg off),
  // further WEST (x=236, ~16 m from the camera) so its body reads
  // 20% of frame width, not 45%. In frame it sits lower-left.
  const bc = pc(game, 236, -178, PI, 0);
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
  blob(game, 236, -178, 6.0, 3.8, 0.6, 0.08);
  // Flames are 3D CONES PARENTED TO THE CAR (local coords — the car
  // faces -x at heading PI, so local x = 242.5 - world x), not flat
  // sprites — sprites always face the camera and read as a 2D decal on
  // a beige block (v42). Tallest tongue 3.0 m = 1.6x the car height.
  const flameMat = new MB({ color: 0xff7a20, transparent: true, opacity: 0.92 });
  const coreMat = new MB({ color: 0xffd94d, transparent: true, opacity: 0.95 });
  for (const [lx, fr, fh] of [[1.3, 0.85, 2.8], [0, 0.65, 2.2], [-0.9, 0.5, 1.6]]) {
    const cone = new ME(new CN(fr, fh, 8), flameMat);
    cone.position.set(lx, 1.0 + fh / 2, 0);
    bc.mesh.add(cone);
    const inner = new ME(new CN(fr * 0.55, fh * 0.6, 8), coreMat);
    inner.position.set(lx, 1.0 + fh * 0.3, 0);
    bc.mesh.add(inner);
  }
  const fireTex = game.textures.fireball;
  if (fireTex) {
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: fireTex, color: 0xff8030, transparent: true, opacity: 0.5, blending: AB, depthWrite: false }));
    glow.position.set(0.5, 1.8, 0);
    glow.scale.set(1.6, 2.0, 1);
    bc.mesh.add(glow);
  }
  // Second cruiser, on the south lane (z=-176) — at -184 it stood
  // between the camera and the comet and hid it; here it frames the
  // burning car instead and the comet stays clear on the north lane.
  const pc2 = pc(game, 238, -188, PI, 0);
  blob(game, 238, -188, 6.0, 3.8, 0.6, 0.08);
  const heli = game.police.heli;
  if (heli) {
    heli.visible = true;
    // Overhead at (228, 7.5, -172), scale 1.2 — SOUTH of the view
    // axis so it sits UPPER-LEFT (~300, 160), not top-centre, and
    // small enough that the rotor stays inside the frame.
    heli.position.set(228, 7.5, -172);
    heli.scale.setScalar(1.2);
    heli.rotation.y = 0;
    heli.userData.rotor.rotation.y = 0.5;
    heli.userData.spotlight.visible = false;
  }
  // Clear the frame: random traffic drove through the shot (a red
  // pickup blocked the comet at the right edge) and a pedestrian
  // stood by the camera. Parked cars too — the v41 left cluster (yellow
  // taxi + teal pickup + white cruiser all within 10 m) is the "bunched"
  // mess the user called out; only the staged cars stay. Radius 50 m —
  // a red pickup at ~35 m still cluttered the right edge at 40 m.
  for (const t of game.cars.traffic) {
    if (Math.hypot(t.pos.x - 243, t.pos.z + 180) < 50) place(t, 0, 300, 0);
  }
  for (const c of game.cars.parked) {
    if (c !== comet && Math.hypot(c.pos.x - 243, c.pos.z + 180) < 50) place(c, 0, 300, 0);
  }
  const camX = 243 + 6 * Math.cos(0.24);
  for (const p of game.peds) {
    if (Math.hypot(p.pos.x - camX, p.pos.z + 180) < 9) p.mesh.visible = false;
  }
  // The burning car lights the road — a warm point light at the fire,
  // short range so it does not wash the ground shadows out. NO additive
  // ground pool: the v42 pool read as a glowing beige blob (v42).
  // Fire light rides on the car too, so the car body + ground are lit
  // by the fire — the strongest clue the fire is ON the car.
  const fireLight = new THREE.PointLight(0xff8030, 2, 6);
  fireLight.position.set(0, 2, 0);
  bc.mesh.add(fireLight);
  // Layout plan: WIDE — FOV 54, camera 1.6 m, pitch ~level (horizon
  // at the lower third), so sky, signs and long shadows all fit.
  // camDist 8 (not 9): at 9 m the gunman read only 21% tall; at 8 m
  // he reads ~25% and the car ~15%. camLookOff 0.5 (not 2): the pair
  // sits on the golden points without being pushed to the centre.
  game.cameraAngle = PI / 2 - 0.12;
  game.lastDragAt = game.time;
  game.camDist = 8;
  game.camPitch = 0.0;
  game.camLookOff = 0.5;
  setFov(game, 54);
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
  // Hide the mission beacon in every shot — its gold diamond floats in
  // the middle of the road and reads as a stray object (v42 shot 4).
  if (game.missions.hideBeacon) game.missions.hideBeacon();
  // Hide the collectible gems in every shot — same stray-object read.
  if (game.city.collectibleMeshes) for (const gem of game.city.collectibleMeshes) gem.visible = false;
  if (name === 'chase') stageChase(game);
  else if (name === 'gunfight') stageGunfight(game);
  else if (name === 'sunset') stageSunset(game);
  else stageDowntown(game);
  game.hud.setShotMode(true, true);
  game.hud.update();
}
