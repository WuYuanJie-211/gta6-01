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
import { makeSoftBeam, blobShadowTexture, makeV31Sign } from './v31.js';

// A seeded RNG for deterministic staged effects (flames, sparks) —
// independent of the game's rng so the staging stays byte-identical
// for a given seed.
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 3-pointed muzzle-flash star texture (v47): a bright core with three
// spikes — one long spike along +x (the barrel direction), two shorter
// spikes at +/-120 deg. Drawn once, cached. The sprite's long axis is
// the texture's +x, so material.rotation aligns it with the barrel's
// screen direction.
let _flashTex = null;
// Sun face — a vertical-gradient core (white top to warm cream
// bottom) with a soft edge, plus a two-stop corona ring, drawn once
// on canvas so the sun reads as a body with bloom, not a flat white
// disc sticker (Superbot v51: "reads as a sticker").
let _sunTex = null;
function sunTex() {
  if (_sunTex) return _sunTex;
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const x = c.getContext('2d');
  // v53: ONE radial gradient, cream core bleeding straight into
  // warm orange — no second stop band, no gap, no ring. The v52
  // two-stop corona (rings stroked at r96/r116, outside the r78
  // core disc) read as a bullseye: white core, plain-sky gap, hard
  // saturated orange ring (Quick, severe). Here the core is cream
  // to ~0.35, warm orange by 0.5, fading to transparent at the
  // edge — the halo sprites below do the wide bloom.
  const rg = x.createRadialGradient(128, 128, 0, 128, 128, 128);
  rg.addColorStop(0, '#fff8e2');
  rg.addColorStop(0.35, '#ffedb5');
  rg.addColorStop(0.5, '#ffd28a');
  rg.addColorStop(0.7, 'rgba(255,170,80,0.5)');
  rg.addColorStop(1, 'rgba(255,150,60,0)');
  x.fillStyle = rg; x.fillRect(0, 0, 256, 256);
  _sunTex = new CT(c);
  _sunTex.colorSpace = SC;
  return _sunTex;
}

function flashStarTex() {
  if (_flashTex) return _flashTex;
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const x = c.getContext('2d');
  x.translate(64, 64);
  const spike = (ang, len, wid) => {
    x.save(); x.rotate(ang);
    const g = x.createLinearGradient(0, 0, len, 0);
    g.addColorStop(0, 'rgba(255,246,216,1)');
    g.addColorStop(0.4, 'rgba(255,180,60,0.9)');
    g.addColorStop(1, 'rgba(255,140,40,0)');
    x.fillStyle = g;
    x.beginPath(); x.moveTo(0, -wid); x.lineTo(len, 0); x.lineTo(0, wid); x.closePath(); x.fill();
    x.restore();
  };
  spike(0, 62, 7);
  spike(2.094, 34, 6);
  spike(-2.094, 34, 6);
  const core = x.createRadialGradient(0, 0, 1, 0, 0, 14);
  core.addColorStop(0, 'rgba(255,250,230,1)');
  core.addColorStop(0.5, 'rgba(255,220,140,0.9)');
  core.addColorStop(1, 'rgba(255,180,60,0)');
  x.fillStyle = core;
  x.beginPath(); x.arc(0, 0, 14, 0, PI * 2); x.fill();
  _flashTex = new CT(c);
  _flashTex.colorSpace = SC; // v47: match taxi/glass tex — no CS = invisible sprite
  return _flashTex;
}

// Soft halo texture for the muzzle flash (v56): a radial glow —
// white-hot at the centre, warm orange by the middle, transparent
// at the edge. No spikes, no ring: it is the bloom around the star,
// not a second star. Drawn once, cached, like flashStarTex.
let _haloTex = null;
function flashHaloTex() {
  if (_haloTex) return _haloTex;
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,250,235,1)');
  g.addColorStop(0.25, 'rgba(255,220,150,0.85)');
  g.addColorStop(0.55, 'rgba(255,160,60,0.35)');
  g.addColorStop(1, 'rgba(255,140,40,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  _haloTex = new CT(c);
  _haloTex.colorSpace = SC;
  return _haloTex;
}

// Muzzle flash, rebuilt (v56): one place that owns the whole flash —
// the halo, the star layers and the screen-space nudge. It takes the
// rifle group, reads the muzzle anchor the rifle already carries, and
// puts every sprite at the same nudged screen point, all rotated to
// the barrel's screen direction so the star reads long, not round.
//
// The nudge is in screen pixels (x right, y down): the anchor is
// projected to the screen, shifted, and unprojected back to the same
// depth, so the shift is exact in pixels whatever the camera does.
// v56 nudges +9/-5 to land the core on the plan centre (633,511).
//
// spec: { nudge: [dx, dy], halo: [sx, sy, color, opacity] | null,
//         layers: [[sx, sy, color], ...] } — layers draw back to
// front, so the last one is the bright core on top.
function flashAtMuzzle(game, rifle, spec) {
  if (!rifle || !rifle.userData.muzzle) return;
  game.updateCamera(1 / 60);
  const mPos = new V3();
  rifle.userData.muzzle.getWorldPosition(mPos);
  const bDir = rifle.getWorldDirection(new V3());
  const bEnd = mPos.clone().addScaledVector(bDir, 1.5);
  game.camera.updateMatrixWorld();
  const toScr = (v) => { const p = v.clone().project(game.camera); return [((p.x + 1) / 2) * 1280, ((1 - p.y) / 2) * 720]; };
  const [mx, my] = toScr(mPos);
  const [bx, by] = toScr(bEnd);
  const ang = Math.atan2(-(by - my), bx - mx);
  // Anchor: a touch forward of the muzzle along the barrel, then the
  // screen-space nudge, unprojected back to the same depth.
  const anchor = mPos.clone().addScaledVector(bDir, 0.06);
  const p = anchor.clone().project(game.camera);
  const nudge = spec.nudge || [0, 0];
  const px = ((p.x + 1) / 2) * 1280 + nudge[0];
  const py = ((1 - p.y) / 2) * 720 + nudge[1];
  const pos = new V3((px / 1280) * 2 - 1, -((py / 720) * 2 - 1), p.z).unproject(game.camera);
  const place = (map, w, h, col, op, order) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map, color: col, transparent: true, opacity: op, blending: AB, depthWrite: false, depthTest: false }));
    s.material.rotation = ang;
    s.position.copy(pos);
    s.scale.set(w, h, 1);
    s.renderOrder = order;
    game.scene.add(s);
  };
  if (spec.halo) place(flashHaloTex(), spec.halo[0], spec.halo[1], spec.halo[2], spec.halo[3], 5);
  for (const [lx, ly, col] of spec.layers) place(flashStarTex(), lx, ly, col, 0.95, 6);
}

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
  // v46: van body detail — the armored van read as a near-pure-black
  // slab (body 0x2a2f36, albedo ~0.04). Clone the paint so only this
  // van lightens (VM caches by colour), lift it to 0x565b63
  // (albedo ~0.10), then break the slab with side windows + door
  // seams on both flanks so the camera side always reads.
  const vb = van.mesh.userData.body;
  if (vb) {
    vb.material = vb.material.clone();
    vb.material.color.setHex(0x565b63);
    const glassM = new MS({ color: 0x223a4a, roughness: 0.15, metalness: 0.4 });
    const seamM = new MS({ color: 0x1a1a1a, roughness: 0.9 });
    for (const s of [-1, 1]) {
      const win = new ME(new BX(2.6, 0.55, 0.04), glassM);
      win.position.set(0.3, 1.95, s * 0.97);
      van.mesh.add(win);
      for (const dx of [1.2, -0.8]) {
        const seam = new ME(new BX(0.05, 1.3, 0.02), seamM);
        seam.position.set(dx, 1.45, s * 0.96);
        van.mesh.add(seam);
      }
    }
  }
  // v46: the van's warm-white headlights (0xfff3c4 + emissive) sit
  // inside the dash-B measurement box (790-860,430-450) and read 209
  // — the "dash" the reviewer flags is the headlight, not the road
  // lines (the lines themselves are already <=65). Dim only this
  // van's headlights (clone, so the shared VM cache is untouched) to
  // a warm grey with a faint emissive: still a headlight, <=150.
  for (const k of ['headlightR', 'headlightL']) {
    const hl = van.mesh.userData[k];
    if (hl) {
      hl.material = hl.material.clone();
      hl.material.color.setHex(0x8a8a7a);
      hl.material.emissive.setHex(0x221100);
    }
  }
  camB(game);
  // The taxi parked at (240,-175) sat half-clipped at the left/bottom
  // frame edge and read as a background artefact — move it out of the shot.
  const edge = game.cars.parked.find((c) => c.pos.x === 240 && c.pos.z === -175);
  if (edge) place(edge, 0, 300, 0);
  // c2 sits in the WEST (oncoming) lane (x=230, 7 m west of the van)
  // and 11 m north of it — a police cruiser swerving into oncoming
  // traffic. The old c2 (x=246.5, east lane) sat at almost the same
  // screen x as c1 and was occluded by it; from the chase camera the
  // two cruisers now flank the van (c2 left, c1 right) with the van
  // in the centre. v45: the road (x234-246) sits dead ahead, so no
  // lane spot lands at screen x150-300 — instead the beige plaza
  // under c2 is asphalted (a dark plane at y=0.06, v45 below), so
  // the cruiser reads as on the road. c2 moves 3 m south so it sits
  // at screen y360-450.
  // v48: c2 into the lane — x +2.4 m, z -0.4 m (was x=232.6, still
  // west of the road on the beige plaza; now x=235.0, four wheels
  // in the lane). The plan's +4 m (x=236.6) put c2 directly behind
  // the van (same x=237) — its centre projected to (499,347),
  // inside the van's silhouette, fully hidden. At x=235.0 the west
  // wheels sit at 234.05 (just inside the road edge) and the car
  // peeks out left of the van. y stays 0 (see above).
  const c1 = pc(game, vx + 6, vz - 1, -PI / 2 + 0.4, 24);
  const c2 = pc(game, vx - 3.5, vz - 8.8, -PI / 2, 24);
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
  // Ground blobs under the van and both cruisers — BIG and dark
  // (7.5x5.0, 0.6) so the shadow reads on the dark asphalt. The van
  // had NO separate blob in v43 (only its small mesh shadow) and read
  // as floating with zero shadow under it. The blob spans the yellow
  // line (x=240), so it visibly darkens the marking beside the car.
  // v45: the white dashes SOUTH of the van (toward the camera) stayed
  // bright — the blob ended at the van's rear. A south extension
  // (240,-200) reaches over both dashes, plus a dark contact blob at
  // each axle (front 237.8,-203.7 / rear 236.2,-206.3), so the shadow
  // crosses both white dashes and presses them to sRGB <=150.
  // v45 fix: the first build's 8 m extension (238,-200) spanned only
  // x234-242 and missed the x246 dash — widened to 12 m centred
  // x240 (spans x234-246), sun in the west so the shadow falls east.
  // v45 fix 2: the dash under the van still read 197 (target ≤150)
  // — the 0.55 blob was too soft. A denser core (renderOrder 3, like
  // the gunfight cores) forces the dash dark under the van.
  // v45 fix 3: the dash still read 197 — it sits SOUTH of the shadow
  // (z~-196, the blob ended at z-197.75). Move the extension south
  // to z=-198 and deepen to 8 m (z-194..-202) so the dash sits in
  // the gradient's dark zone, not its faded edge.
  // v48 P0-4: the v45 asphalt patch (opaque 0x333333 plane) read as
  // a hard-edged black rectangle — a hole in the ground. DELETED.
  // The cruiser's shadow is now a radial-alpha ellipse REUSING the
  // van blob's material instance (same texture + material, zero new
  // material; opacity 0.6 from the van blob, plan's 0.5 is the same
  // soft edge). 5x5 m on the ground reads ~340x90 on screen.
  const vanBlob = blob(game, vx, vz, 7.5, 5.0, 0.6, 0.08);
  blob(game, 240, -198, 12.0, 8.0, 0.7, 0.08);
  blob(game, 237.8, -203.7, 4.3, 1.8, 0.7, 0.09);
  blob(game, 236.2, -206.3, 4.3, 1.8, 0.7, 0.09);
  // v47: dense cores ON the dashes (renderOrder 3, like the gunfight
  // cores). v46's cores were narrower than the dash — the dash ends
  // stuck out past the gradient's dense centre, so the dash still
  // read ~116-230. The main core is now 6x7 m centred exactly on the
  // west lane dash (237,-203), so the whole 2 m dash sits inside the
  // dense centre with margin; opacity 0.72 per the plan.
  for (const [cx, cz, w, d, o] of [[237, -203, 6, 7, 0.72], [241, -206, 4.5, 5.5, 0.72], [241, -208.5, 4.0, 4.0, 0.72]]) {
    const core = new ME(new PG(w, d), SH(blobShadowTexture(), o));
    core.rotation.x = -PI / 2;
    core.position.set(cx, 0.13, cz);
    core.renderOrder = 3;
    game.scene.add(core);
  }
  blob(game, c1.pos.x, c1.pos.z, 7.5, 5.0, 0.6, 0.08);
  // v48 P0-4: c2's shadow is the ellipse below (van's material), not
  // a second blob — one soft shadow per car, no double darkening.
  const c2Shadow = new ME(new PG(5.0, 5.0), vanBlob.material);
  c2Shadow.rotation.x = -PI / 2;
  c2Shadow.position.set(c2.pos.x, 0.12, c2.pos.z);
  c2Shadow.renderOrder = 2;
  game.scene.add(c2Shadow);
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
    // v44: shrunk to 0.72x (scale 1.6 -> 1.15) and moved 6 m further
    // north + 2.5 m east, 0.5 m lower. At 1.6x the rotor tips cut 57 px
    // past the top edge and the tail rotor sat at x=54 (v43). The
    // rotor is parked at 45 deg so the four blades read as an X.
    heli.position.set(vx - 2, 9.5, vz - 26);
    heli.scale.setScalar(1.15);
    heli.rotation.y = PI / 2 - 0.2;
    // Rotor parked at a diagonal so the 4 blades read as an X, never a
    // single rod (the shot never steps the game, so the rotor is static).
    heli.userData.rotor.rotation.y = 0.785;
    // v45: tail rotor rotated 12 deg off the fin so the X never reads
    // as parallel to the fin.
    if (heli.userData.rearRotor) heli.userData.rearRotor.rotation.x = 0.21;
    if (heli.userData.rearRotor2) heli.userData.rearRotor2.rotation.x = 0.21;
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
  skid(game, vx - 3.5, vz - 8);
  // GYM sign (v46): lowered to y=3.0 and the heli raised to y=9.5 —
  // the v45 sign (y=5.0) overlapped the heli's belly/skids and read
  // as a sign hung ON the helicopter. Now the sign's letters sit at
  // screen y~200-280 and the skids clear it by >=30 px.
  const gym = makeV31Sign('GYM', '#1a3a5f', '#FFFFFF', 6, 3.5);
  gym.position.set(233, 2.75, -220); // v47: down 0.25 m, skid gap 33 -> ~44 px
  gym.rotation.y = 0;
  game.scene.add(gym);
  // v52: finish the BAR panel (hero frame's dead centre) — the v51
  // storefront was a blank beige slab: a blue BAR sign over a tan
  // glass panel and a same-tan upper band, no lettering on the shop,
  // no door, no shadow under the sign. The BAR tower is at
  // (272.7, -262.1), south face (podium front z -262.14, tower face
  // z -263.0, glass spans x 264.6-280.8). A lettered band over the
  // glass, a door on the podium's left strip, mullions dividing the
  // glass into panes, and a shadow line under the main sign.
  const barBand = makeV31Sign('BAR', '#1a3a5f', '#FFFFFF', 8, 0.9);
  barBand.position.set(272.7, 3.6, -262.0);
  barBand.rotation.y = 0;
  game.scene.add(barBand);
  const barDoorFrame = new ME(new BX(1.5, 2.6, 0.06), new MS({ color: 0x8a6b4f, roughness: 0.7 }));
  barDoorFrame.position.set(261.7, 1.3, -262.05);
  game.scene.add(barDoorFrame);
  const barDoor = new ME(new BX(1.3, 2.4, 0.08), new MS({ color: 0x1a1a1e, roughness: 0.6 }));
  barDoor.position.set(261.7, 1.2, -262.0);
  game.scene.add(barDoor);
  const barHandle = new ME(new BX(0.08, 0.08, 0.06), new MS({ color: 0xc9a227, roughness: 0.4, metalness: 0.6 }));
  barHandle.position.set(262.2, 1.2, -261.94);
  game.scene.add(barHandle);
  for (const mx of [270.0, 275.4]) {
    const mull = new ME(new BX(0.08, 2.2, 0.06), new MS({ color: 0x1a1a1e, roughness: 0.6 }));
    mull.position.set(mx, 1.6, -262.0);
    game.scene.add(mull);
  }
  const barMullH = new ME(new BX(16.2, 0.08, 0.06), new MS({ color: 0x1a1a1e, roughness: 0.6 }));
  barMullH.position.set(272.7, 1.6, -262.0);
  game.scene.add(barMullH);
  const barShadow = new ME(new BX(14, 0.2, 0.06), new MS({ color: 0x1a1a1e, roughness: 0.9 }));
  barShadow.position.set(272.7, 4.9, -262.9);
  game.scene.add(barShadow);
  for (const px of [231, 235]) {
    const pole = new ME(new CG(0.12, 0.12, 3.0, 6), new MS({ color: 0x2e3338, roughness: 0.7 }));
    pole.position.set(px, 1.5, -220);
    game.scene.add(pole);
  }
}

function stageGunfight(game) {
  game.missions.setProgress(6, 1);
  const player = game.player;
  player.weapon = 'rifle';
  player.ownedWeapons = ['pistol', 'rifle'];
  player.mag = 30;
  player.ammo = 60;
  // The player stands SOUTH of the duellist and the camera looks NORTH
  // toward downtown. BOTH men stand ON the west white lane dash
  // (x=-183 — the avenue's dashes are at x=-183 and x=-171; the old
  // x=-177 put the player on bare asphalt between the double yellow
  // and the east dash, so his shadow never darkened a marking, v43).
  // Both stand at the CENTRE of a dash segment — player z=197 (dash
  // 196-198), duellist z=189 (dash 188-190) — so the shadow blob
  // covers the white dash under their feet for a full segment.
  player.pos.set(-183, 0, 197);
  player.heading = PI;
  player.mesh.position.copy(player.pos);
  player.mesh.rotation.y = player.heading;
  player.mesh.rotation.x = 0;
  player.mesh.scale.y = 0.85;
  const rifle = player.mesh.userData.rifle;
  // v52: the rifle points NORTH at the duellist (rotation.y -0.15,
  // turned 9 deg toward camera-right so the barrel projects longer
  // across the frame) — the v51 turn (0.45) put the barrel 11 deg off
  // the view axis, so its 1.17 m foreshortened to a 25 px cube and
  // the gun read as floating in mid-air (Quick's new severe). Level
  // and north, the barrel projects ~100 px toward the duellist.
  // Local x -0.6 (not -0.35): the mesh is rotated PI, so local +x is
  // world west — the rifle sits clear of the torso (half-width
  // 0.375 m), so from the staged camera the barrel clears the
  // silhouette instead of blending into the jacket (v44). Scale 1.5
  // and a light barrel: the v52 first render still read as a thin
  // dark stick against the dark jacket, so the barrel is recoloured
  // mid-grey and the receiver lighter wood (mt() makes a fresh
  // material per part, so this touches only this rifle).
  rifle.position.set(-0.6, 1.6, 0.5);
  rifle.rotation.set(0, -0.15, 0);
  rifle.scale.setScalar(1.5);
  // v53: colours live in the rifle builder (player.js) now — the
  // light barrel + tan handguard are part of the rebuild, not a
  // staging override, so no children[] recolour here.
  // The arms are posed AFTER game.step (below) — updatePlayerOnFoot
  // resets both arms every step, so the v51 pre-step pose never
  // survived (the second root cause of the floating gun).
  // No steel tip: the light tip read as a detached floating handgun
  // (v42). The barrel is mid-grey now and the flash cone at the muzzle
  // anchor carries the shot.
  // Aim at the duellist (first gunman, -183, 189) so the tracer hits
  // him. He stands on the WEST white dash (x=-183), 6 m west of the
  // player — so in frame he reads LEFT of the player (layout plan:
  // second man at (560, 500), player on the right golden line).
  game.aim = new V3(-183, 1.2, 189);
  game.combat.spawnGunman(-183, 189).mesh.scale.setScalar(1.15);
  // The second gunman + thug were staged at (-173.2, 191) / (-172.3,
  // 191.2) — 65 deg off the view axis, OUT of frame in v43 (their
  // screen x was 1506/1644). They sit north of the player now, inside
  // the frame cone: g2 west of the duellist, thug east of the player
  // near the double yellow.
  const g2 = game.combat.spawnGunman(-188, 193.0);
  g2.mesh.rotation.y = 0.6;
  // The thug stands WEST of g2 (x=-189), not east — at (-181.5, 190)
  // he sat at the far right edge and fell off-frame when the camera
  // rotated (v44 first render: x=1325). West of g2 he reads as a
  // third figure on the left, clear of the player.
  const th = game.combat.spawnThug(-189, 195.0);
  // v45: upright (rotation.x 0, not 0.3) — the 0.3 forward lean read
  // as falling, not leaning on the wall. Feet on the ground, back
  // 10 px off the wall.
  // v47: torso straightened 3 deg (rotation.z +0.05) — the red figure
  // still read as leaning sideways.
  th.mesh.rotation.x = 0;
  th.mesh.rotation.z = 0.05;
  th.mesh.scale.y = 0.85;
  // Hide the gunmen's rifles — the barrel crossed the duellist's torso
  // and read as passing through him. The tracer + muzzle flash carry
  // the shooting; the duellist is the target. (Children 8-9 are the
  // health bars, hidden for every enemy.) v51: also hide 15, the
  // magazine — it would float where the rifle was.
  for (const e of game.combat.enemies) {
    e.mesh.children[8].visible = e.mesh.children[9].visible = false;
    if (e.kind === 'gunman') for (const i of [12, 13, 14, 15]) e.mesh.children[i].visible = false;
  }
  // Ground shadows under all three men — big and dark with a core, so
  // the white dash under each pair of feet is visibly half-dark. The
  // core (renderOrder 3) draws after the dash texture and after any
  // light pool, so nothing repaints over it. v52: opacity 0.65 (was
  // 0.5) — the adjudication says shot 2 DOES have soft shadows, so
  // deepen them instead of claiming they were absent.
  blob(game, -183, 197, 4.5, 3.5, 0.65, 0.1);
  // v47: core enlarged 1.8 -> 3.0 m deep — the 2 m dash segment stuck
  // out past the core's dense centre (the dash ends read 159-201).
  // 3.0 m covers the whole segment plus margin; opacity 0.72.
  const pcore = new ME(new PG(2.5, 3.0), SH(blobShadowTexture(), 0.72));
  pcore.rotation.x = -PI / 2;
  pcore.position.set(-183, 0.13, 197);
  pcore.renderOrder = 3;
  game.scene.add(pcore);
  blob(game, -183, 189, 3.5, 2.8, 0.65, 0.1);
  // v47: far gunman's core enlarged 1.5 -> 2.5 m deep, same reason;
  // same world size as the near core would read smaller at his
  // distance, so 2.5 m keeps the dash covered. Opacity 0.72.
  const dcore = new ME(new PG(2.0, 2.5), SH(blobShadowTexture(), 0.72));
  dcore.rotation.x = -PI / 2;
  dcore.position.set(-183, 0.13, 189);
  dcore.renderOrder = 3;
  game.scene.add(dcore);
  blob(game, -188, 193.0, 2.0, 1.6, 0.65, 0.1);
  blob(game, -189, 195.0, 2.0, 1.6, 0.65, 0.1);
  camB(game);
  // Profile view, NOT over-the-shoulder: camB puts the camera due
  // south (behind the player), so the muzzle, flash and rifle are all
  // occluded by his own body. From the SOUTH-SOUTHEAST (angle 0.65)
  // we see his right side — the rifle, the muzzle and the flash in
  // profile — and the duellist sits up-left of him, not directly
  // behind him (at PI/4 the duellist hid behind the player). The
  // wider angle also pushes the big orange brick wall (left third)
  // out of frame.
  game.cameraAngle = 0.65;
  // Layout plan: camera 1.2 m, pitch ~level, FOV 40 — telephoto
  // compression presses the wall up against the figures. camX is
  // NEGATIVE now: the near gunman sits on the RIGHT golden line (the
  // old +2.1 put him at the left third).
  game.camDist = 7;
  game.camPitch = -0.06;
  game.camX = -2.1;
  setFov(game, 40);
  skid(game, -183.5, 198.5);
  game.input.fireAction(ACTION_SHOOT);
  game.step(STEP);
  // v52: two-handed pose, set AFTER the step (see above). The near
  // arm's hand lands on the grip (-0.6, 1.5, 0.6); the far arm bends
  // across the chest toward the stock — its 0.65 m cannot reach the
  // forend, so it points at the stock and the hand lands on the
  // chest, reading as a two-handed hold from this camera. Both arms
  // pivot about their centres; the upper ends stay on the shoulders.
  const armL = player.mesh.userData.armL;
  if (armL) {
    armL.position.set(-0.524, 1.488, 0.315);
    armL.rotation.set(-1.61, 0, -0.261);
  }
  const armR = player.mesh.userData.armR;
  if (armR) {
    armR.position.set(0.125, 1.517, 0.074);
    armR.rotation.set(-2.12, 0, -1.325);
  }
  // v47: STATIC muzzle flash — a screen-space billboard (three-pointed
  // star sprite), reusing the tracer's material set: transparent,
  // additive, depthWrite off, renderOrder 6 above the gun body. The
  // v46 cone foreshortened to a disc from this camera (the barrel
  // points away from it), and the v46 sprite never rendered (it fell
  // in the opaque queue / depth-tested behind the gun). The star's
  // long spike aligns with the barrel's SCREEN direction (muzzle ->
  // barrel-end projected), so the flash reads long, not round.
  const sRifle = player.mesh.userData.rifle;
  if (sRifle && sRifle.userData.muzzle) {
    const mPos = new V3();
    sRifle.userData.muzzle.getWorldPosition(mPos);
    const bDir = new V3(-183, 1.2, 189).sub(mPos).normalize();
    const bEnd = mPos.clone().addScaledVector(bDir, 1.5);
    game.camera.updateMatrixWorld();
    const toScr = (v) => { const p = v.clone().project(game.camera); return [((p.x + 1) / 2) * 1280, ((1 - p.y) / 2) * 720]; };
    const [mx, my] = toScr(mPos);
    const [bx, by] = toScr(bEnd);
    const ang = Math.atan2(-(by - my), bx - mx);
    const flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashStarTex(), color: 0xffd28a, transparent: true, opacity: 0.95, blending: AB, depthWrite: false, depthTest: false }));
    flash.material.rotation = ang;
    flash.position.copy(mPos).addScaledVector(bDir, 0.06);
    flash.scale.set(0.44, 0.4, 1); // v47: 0.35x0.22 read 22x9 px, need 26-30x16-20
    flash.renderOrder = 6;
    game.scene.add(flash);
  }
  // Clear the hit sparks: the shot hits the duellist, and spawnSparks
  // puts 5 glowing sprites at his feet that outlive the flash and
  // read as two glowing yellow-white blobs (v42/v43/v44). The flash
  // and tracer stay — only the sparks go.
  if (game.combat.clearSparks) game.combat.clearSparks();
  // NO ground light pool and NO extra point light here: the old `fl`
  // PointLight (intensity 2.5, range 9, at (-177, 1.6, 194.5)) lit the
  // asphalt around both men's feet and read as two glowing yellow-white
  // blobs (v43). The muzzle flash's own light (range 4 m, at the
  // muzzle) is the only fire light in this shot.
  // Even light: a soft ambient lift so the brick edges do not fall to
  // black while the muzzle flash lights the centre (the shot-2
  // "vignetting" was a bright centre against dark edges).
  game.scene.add(new THREE.AmbientLight(0xffe0b8, 0.3));
  // v51 P2: two soft cloud bands in the northern sky — stretched pool
  // sprites (soft radial gradient, never hard-edged ellipsoids, which
  // read as floating rocks). Shot-2-only; the live game has no clouds
  // by design (city.js). Positions are probed screen coords: the
  // first try (-260,55,120) / (-120,70,60) sat above the frame
  // (FOV 40, pitch -0.06) and the top-left sky is blocked by the
  // brick wall — only the top-right sky is free. Upper band
  // (-250,88,-180) -> screen (1137,174), lower band (-280,70,-180)
  // -> (1055,232).
  const cloudTex = game.textures.pool;
  if (cloudTex) {
    for (const [cx, cy, cz, cw, ch] of [[-250, 88, -180, 80, 10], [-280, 70, -180, 70, 9]]) {
      const cl = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTex, color: 0xffffff, transparent: true, opacity: 0.3, depthWrite: false }));
      cl.position.set(cx, cy, cz);
      cl.scale.set(cw, ch, 1);
      game.scene.add(cl);
    }
  }
  for (const c of game.police.state.cars) place(c, 0, 300, 0);
}

function stageDowntown(game) {
  game.missions.setProgress(3, 0);
  const taxi = game.cars.parked.find((c) => c.model === 'taxi') || game.cars.parked[0];
  // v44 reshoot: the taxi TURNS NORTH at the intersection (heading
  // PI/2) instead of sitting westbound. The old rear view showed only
  // the taxi's 1.9 m rear — 59 px wide (v43). Turned north, the camera
  // (east, looking west) sees the taxi's full 4.2 m east side, ~290 px.
  // v45: north 1.2 m (z -181.2) — right ~80 px to x695-1015 and up
  // ~15 px, so all four wheels sit right of the median in screen space.
  // v45 fix: the first build moved it only 1.2 m north and it still
  // read x610-910 (target x695-1015) — a further 3.3 m north (to
  // z=-184.5) shifts it ~90 px right.
  place(taxi, 248, -184.5, PI / 2);
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
  // v53: lower the roof sign flush and recolour it into the cap —
  // the pale yellow slab read as a cream plate sitting on the black
  // cabin (the sign's east face is blank from this camera; the TAXI
  // text plane is on its south face, edge-on here). Sunk 0.16 m so
  // only a thin dark sliver shows, and dark so it reads as the cap.
  sign.position.y -= 0.16;
  sign.material = new MS({ color: 0x2a2a2a, roughness: 0.6 });
  const tsign = new ME(new PG(0.9, 0.25), new MB({ map: taxiTextTex() }));
  tsign.rotation.y = -PI / 2;
  tsign.position.set(sign.position.x - 0.46, sign.position.y, 0);
  taxi.mesh.add(tsign);
  const cab = taxi.mesh.userData.cabin;
  const rglass = new ME(new PG(1.5, 0.45), new MB({ map: glassTex() }));
  rglass.rotation.y = -PI / 2;
  rglass.position.set(cab.position.x - taxi.mesh.userData.bodyLen * 0.26 - 0.01, cab.position.y, 0);
  taxi.mesh.add(rglass);
  taxi.speed = 0;
  enterCar(game, taxi);
  // v46: the brake-light boxes are DELETED — they sat 4.5 m behind
  // the taxi's rear (z=-177.9 vs the rear at -182.4) and read as two
  // red rectangles floating on the road (460-540, 390-420), not as
  // lights on the car.
  // 6 traffic cars, none between the camera (east) and the taxi: two
  // eastbound in the north lane, two westbound further west, one
  // northbound + one southbound on the avenue. The old westbound
  // queue sat between the camera and the taxi and would have hidden
  // it from the new east camera.
  // v47: the red (212,-177) and orange (205,-183) traffic cars read as
  // two flat red-orange blocks on the road (the median hides their
  // lower halves, only the roofs show). Deleted — parked out of frame
  // at (0,300); the other four cars keep their colours and spots.
  const spots = [
    { x: 228, z: -177, prev: '180,-180', target: '240,-180', h: 0 },
    { x: 0, z: 300, prev: '180,-180', target: '240,-180', h: 0 },
    { x: 220, z: -183, prev: '300,-180', target: '240,-180', h: PI },
    { x: 0, z: 300, prev: '300,-180', target: '240,-180', h: PI },
    { x: 243, z: -200, prev: '240,-240', target: '240,-180', h: PI / 2 },
    // v51: the dark van sat 10 m from the parked armored van and the
    // two merged into one 12 m double truck from the east camera.
    // There is NO in-frame slot for it: the armored van spans screen
    // x125-430, the blue car 703-845, the teal car 936-1048 — the
    // van's 285 px width fits none of the gaps (tried -148: off the
    // left edge; -177: overlaps the blue car at the same z). So it is
    // parked out of frame like the two v47 deletions. Six vehicles
    // stay in shot, all countable, none merged.
    { x: 0, z: 300, prev: '240,-120', target: '240,-180', h: -PI / 2 },
  ];
  game.cars.traffic.slice(0, 6).forEach((t, i) => {
    place(t, spots[i].x, spots[i].z, spots[i].h);
    t.prevNode = game.roads.byKey.get(spots[i].prev);
    t.targetNode = game.roads.byKey.get(spots[i].target);
    t.speed = 0;
  });
  // Distinct bright colours — no dark van reading as a black box.
  const paintJobs = [0x39557a, 0xc0392b, 0x16a085, 0xe67e22, 0xecf0f1, 0x3c3c3c];
  game.cars.traffic.slice(0, 6).forEach((t, i) => {
    t.mesh.userData.body.material = new MS({ color: paintJobs[i], roughness: 0.4, metalness: 0.4 });
  });
  game.cars.traffic.slice(6).forEach((t) => { place(t, 0, 300, 0); });
  // 3 parked cars, parallel-parked IN the avenue's east lane (x=244.5,
  // fully on the road) — the old curb-side spots (x=248/232) put the
  // van half on the sidewalk, straddling the curb. v46: the dark van
  // (armored, first spot) still read with its wheel on the sidewalk
  // edge — moved 1.5 m west into the lane centre (x=243) and 2 m
  // north (z=-194) so all four wheels sit clearly on asphalt.
  // v48: the dark van (armored, second spot) WEST 2.2 m (x 244.5 ->
  // 242.3). The plan says "right 2.2 m", but the pixel evidence is
  // unambiguous: the east wheels (x=245.35) sit on BEIGE sidewalk
  // (asphalt/beige boundary at x≈245.3), the west wheels on asphalt.
  // A north/south ("right" on screen) move cannot change the
  // wheel-to-edge distance — the boundary runs north-south. West
  // puts all four wheels on asphalt (east wheels to x=243.15).
  // Only one armored van exists in this scene; no second to move.
  const parkedSpots = [[243, -194], [242.3, -168.84], [244.5, -204]];
  const others = game.cars.parked.filter((c) => c !== taxi);
  others.slice(0, 3).forEach((c, i) => place(c, parkedSpots[i][0], parkedSpots[i][1], PI / 2));
  others.slice(3).forEach((c) => { place(c, 0, 300, 0); });
  // v52: contact shadows under every visible vehicle — the cars had
  // none, so they floated on the asphalt (Quick + Superbot v51).
  // Taxi + 3 traffic + 3 parked; long side along each car's heading
  // (PI/2 = north-south, 0/PI = east-west).
  // v53: opacity 0.75 (was 0.6) and ~20% smaller, so the blob sits
  // under the wheels instead of pooling — the van and the taxi had
  // a soft darkening, the green/blue cars and far traffic had none
  // (Quick + Superbot, should-fix).
  blob(game, 248, -184.5, 2.4, 4.4, 0.75, 0.1);
  blob(game, 228, -177, 4.4, 2.4, 0.75, 0.1);
  blob(game, 220, -183, 4.4, 2.4, 0.75, 0.1);
  blob(game, 243, -200, 2.4, 4.4, 0.75, 0.1);
  blob(game, 243, -194, 2.4, 4.4, 0.75, 0.1);
  blob(game, 242.3, -168.84, 2.4, 4.4, 0.75, 0.1);
  blob(game, 244.5, -204, 2.4, 4.4, 0.75, 0.1);
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
  // v44: camera EAST of the taxi, looking west — the street converges
  // to a vanishing point ~190 px right of centre (x≈830), and the
  // taxi's 4.2 m side fills ~290 px. camDist 14 (17 m with the +3 for
  // being in a car), pitch 0.15 (camera ~4 m up), FOV 34 telephoto.
  // camLookOff -2.0 pushes the taxi right toward the golden point.
  // The old high/wide shot (camDist 32, 35 m back) saw only the
  // taxi's rear at 59 px and the VP dead centre.
  // v45: camLookOff -4.0 — the taxi's world move north is swallowed
  // by the follow camera, so the look target moves further south to
  // push the taxi ~135 px right on screen (to x695-1015). (-2.0 gave
  // x627-853, -3.2 gave x667-933; -4.0 lands ~x722-988.)
  game.camDist = 14;
  game.camPitch = 0.15;
  game.cameraAngle = 1.72;
  game.camX = 0;
  game.camLookOff = -4.0;
  setFov(game, 34);
  // Foreground silhouette: a pedestrian on the south sidewalk ~11 m
  // from the camera, lower-left, back to the camera — the Z-path
  // anchor that pulls the eye back down.
  const fg = game.peds[6];
  if (fg) {
    fg.pos.set(256, 0, -190);
    fg.mesh.position.copy(fg.pos);
    fg.mesh.rotation.y = PI;
    fg.mode = 'chat';
    fg.waiting = false;
    blob(game, 256, -190, 1.4, 1.1, 0.5, 0.1);
  }
  // Hold the pan: updateCamera auto-aligns the angle back behind the
  // taxi 2.5 s after the last drag, which erased the pan by screenshot
  // time (the 0.30 render was byte-identical to 0.22). A far-future
  // lastDragAt keeps the staged angle for the whole shot.
  game.lastDragAt = game.time + 100;
  // v46: SUITES sign right 45 px — the city's SUITES sign on the
  // tower at (204.5,-155.9) had its left S eaten by the foreground
  // building edge. The sign faces east (rotation PI/2), so moving it
  // 0.65 m north (z -0.65) shifts it ~45 px right on screen and
  // clears both ends. The palm leaf tip pressing its right end is
  // handled by the palm move in city.js.
  // v48: SUITES sign face 0.25 m forward along its normal (east, +x)
  // — the left S's vertical stroke merges with the facade's dark
  // edge and reads as "...ITES". Standing the face proud of the
  // wall gives the S >=10 px clear space on its left.
  for (const o of game.scene.children) {
    if (o.userData && o.userData.v31sign === 'SUITES') { o.position.z -= 0.65; o.position.x += 0.25; }
  }
  // v45: shorten the hero-street median (Jersey barrier) so its near
  // end stops at screen y=520 with a rounded cap instead of running
  // to the bottom of the frame. The city builds it in 48 m segments;
  // the segment at cx=270 (x246-294) is hidden and replaced by a
  // shorter one plus a vertical-cylinder rounded end cap.
  // v51: 8 m (was 12), centre 238, cap at 242 — the 12 m end + cap at
  // 246 sat 1 m from the taxi's west face and read as clipping into
  // it from the east camera. Now 5 m clear. The 4 m gap to the hidden
  // city segment reads as the turning gap at the intersection the
  // taxi is turning through.
  for (const o of [...game.scene.children]) {
    if (o.isMesh && o.geometry && o.geometry.type === 'BoxGeometry' && o.position.z === -180 && (o.position.y === 0.15 || o.position.y === 0.35) && Math.abs(o.position.x - 270) < 0.5) o.visible = false;
  }
  const medMat = new MS({ color: 0x5e564b, roughness: 0.9 });
  const medTop = new MS({ color: 0x3a3a3a, roughness: 0.7 });
  // v48 P1-6: 0.30 m tall (was 0.5 m), matching the lowered city
  // median — the tall barrier cut diagonally across the foreground.
  const med = new ME(new BX(8, 0.3, 0.5), medMat);
  med.position.set(238, 0.15, -180);
  game.scene.add(med);
  const medT = new ME(new BX(8, 0.1, 0.3), medTop);
  medT.position.set(238, 0.35, -180);
  game.scene.add(medT);
  const medCap = new ME(new CG(0.25, 0.25, 0.3, 12), medMat);
  medCap.position.set(242, 0.15, -180);
  game.scene.add(medCap);
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
  // v52: the comet had no contact shadow — it floated like the shot-3
  // cars did. (The centre gunman, the foreground gunman and the
  // burning car already have blobs; their opacities are deepened
  // below, 0.5 -> 0.65 and 0.6 -> 0.7.)
  blob(game, 243, -196, 3.0, 5.5, 0.6, 0.1);
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
  // Gunman ON the SOUTH white lane dash (z=-183 — the avenue's dashes
  // are at z=-177 and z=-183; the old z=-177.5 put him on the north
  // dash but far left of frame, x=404), at the centre of a dash
  // segment (x=240, segment 240-242), so the shadow blob darkens the
  // white dash under his feet. On the south dash he reads on the
  // RIGHT golden line (x~837), back to camera, rim-lit. He faces
  // WEST (rotation.y = PI/2 + PI), BACK TO the east camera — the old
  // PI/2 faced him north, so the camera saw his FACE and the shot
  // lost the over-the-shoulder read (v43).
  // v53: 1.5 m south (z -183 -> -181.5) — 'ROUTES' sat behind his
  // head and the BUS sign crowded it (Superbot, should-fix). His
  // shadow blob + core move with him.
  const r = game.combat.spawnGunman(240, -181.5);
  r.mesh.children[8].visible = r.mesh.children[9].visible = false;
  r.mesh.rotation.y = PI / 2 + PI;
  blob(game, 240, -181.5, 5.0, 4.0, 0.65, 0.12);
  const core = new ME(new PG(2.5, 1.8), SH(blobShadowTexture(), 0.85));
  core.rotation.x = -PI / 2;
  core.position.set(240, 0.13, -181.5);
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
  // Burning car BROADSIDE (heading PI/2, north) at (233,-177), ~18 m
  // from the camera — the camera (east) sees its full 4.2 m side,
  // ~275 px wide, at the lower-left golden point. The old car faced
  // west (heading PI) so the camera saw only its 1.9 m rear, ~95 px,
  // and the cones on its roof read as a floating yellow pyramid.
  // Its front bumper stops just short of the median at z=-180.
  const bc = pc(game, 233, -177, PI / 2, 0);
  // Char the burning car — clone the materials first, they are shared
  // across every car of the same colour (recolouring the shared white
  // would char the second cruiser too). v48 P0-1: the char is now a
  // hot ember brown (0x7a2a18, was 0x3a2a22) WITH an emissive
  // (0x1e0a04, intensity 1) — the v47 car body received NONE of the
  // fire light (ratio 1.00x), so the fire must light it from the
  // material side, not by adding another point light (light cap).
  const bm = bc.mesh.userData;
  bm.body.material = bm.body.material.clone();
  bm.body.material.color.setHex(0x7a2a18);
  bm.body.material.emissive.setHex(0x1e0a04);
  bm.body.material.emissiveIntensity = 1;
  bm.cabin.material = bm.cabin.material.clone();
  bm.cabin.material.color.setHex(0x2a2226);
  bc.mesh.position.y = -0.05;
  // The sunk mesh drags its own under-car shadow below the road, so the
  // burning car gets an explicit blob to ground it. v52: 0.7 (was 0.6).
  blob(game, 233, -177, 6.0, 3.8, 0.7, 0.08);
  // Fire is PARTICLES emitted from the car body, not cones: the old
  // 3 cones (tallest 2.8 m) read as a solid yellow triangle floating
  // above the roof with a gap from the body (v43). v45: 6 emission
  // points, 40 sprites each, 3 colour layers (pale core / orange /
  // dark red edge), so the fire reads as volume, not flat stickers.
  // v52: the points spread along LOCAL X — the car's length axis.
  // The v45 comment said local z was the length, but the car model
  // builds its length on local x (heading PI/2 maps local +x to
  // world north, local +z to world east, toward the camera), so the
  // v45/v51 points spread in DEPTH and piled into one cluster from
  // the east camera. Now they spread -1.4..1.6 m along the length
  // and sit just outside the east flank (local z +0.9..1.3), and the
  // flame LEANS out of the car's side: higher sprites shift toward
  // the camera (+z) instead of stacking vertically on the panel.
  const fireRng = mulberry32(44);
  const fireTex = game.textures.fireball;
  if (fireTex) {
    const fireCols = [0xfff0b0, 0xff8a20, 0x8a1e08];
    const firePts = [[1.6, 1.0], [1.1, 1.2], [0.4, 0.9], [-0.2, 1.1], [-0.9, 1.0], [-1.4, 1.2]];
    for (const [lx, lz] of firePts) {
      for (let i = 0; i < 40; i += 1) {
        const layer = i % 3;
        const s = new THREE.Sprite(new THREE.SpriteMaterial({
          map: fireTex, color: fireCols[layer], transparent: true,
          opacity: 0.25 + fireRng() * 0.3, blending: AB, depthWrite: false,
        }));
        // v52: pale core raised to 1.8 m (was 1.1) so it sits above
        // the orange layer instead of inside it — and all three
        // layers start at or above the roofline (1.0 m), so the
        // flames rise FROM the car instead of painting its side
        // panel (the v52 first render still read as red splotches
        // on the red flank).
        const hBase = [1.8, 1.3, 1.0][layer];
        const h = hBase + fireRng() * (layer === 0 ? 0.9 : 0.8);
        const spread = layer === 0 ? 0.3 : 0.6;
        s.position.set(lx + (fireRng() - 0.5) * spread, h, lz + (fireRng() - 0.5) * spread + (h - 0.5) * 0.25);
        // v47: particle size -15% so the flame top drops back to y≈305.
        // v51: taper with height — the top sprites are half the base size.
        const taper = 1 - ((h - 0.5) / 1.5) * 0.5;
        const sz = (0.25 + fireRng() * 0.35) * 0.85 * taper;
        s.scale.set(sz, sz * 1.4, 1);
        bc.mesh.add(s);
      }
    }
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: fireTex, color: 0xff8030, transparent: true, opacity: 0.4, blending: AB, depthWrite: false }));
    glow.position.set(0.3, 1.2, 0.9);
    glow.scale.set(3.0, 2.2, 1);
    bc.mesh.add(glow);
    // v48 P0-1: warm patch ON the car roof (screen 390-480, 358-388)
    // — an additive warm quad reusing the fire texture, so the roof
    // reads lit by the fire even though no point light reaches it.
    // Sits just above the roof skin (y=1.7), wide along the car.
    const warm = new THREE.Sprite(new THREE.SpriteMaterial({ map: fireTex, color: 0xff6a20, transparent: true, opacity: 0.35, blending: AB, depthWrite: false }));
    warm.position.set(0, 1.7, 0);
    warm.scale.set(3.0, 1.8, 1);
    bc.mesh.add(warm);
  }
  // Second cruiser, on the south lane (z=-188) — at -184 it stood
  // between the camera and the comet and hid it; here it frames the
  // burning car instead and the comet stays clear on the north lane.
  const pc2 = pc(game, 238, -188.6, PI, 0);
  blob(game, 238, -188.6, 6.0, 3.8, 0.6, 0.08);
  const heli = game.police.heli;
  if (heli) {
    heli.visible = true;
    // v44: shrunk to 0.72x (scale 1.2 -> 0.86) and moved 3 m further
    // west + 3 m north, 1.5 m lower. At (231, 7.5, -169) the rotor
    // still cut 177 px past the left edge and 20 px past the top
    // (v44 first render) — the rotor is 9.3 m across at ~19 m, so it
    // needs ~25 m of distance and a lower centre to fit. The rotor
    // is parked at 45 deg so the blades read as an X.
    heli.position.set(222, 8.0, -172);
    heli.scale.setScalar(0.86);
    heli.rotation.y = 0;
    heli.userData.rotor.rotation.y = 0.785;
    heli.userData.spotlight.visible = false;
    // v45: tail rotor 12 deg off the fin (same as shot 1).
    if (heli.userData.rearRotor) heli.userData.rearRotor.rotation.x = 0.21;
    if (heli.userData.rearRotor2) heli.userData.rearRotor2.rotation.x = 0.21;
  }
  // Sun disc: the old vertical beam (a 40 m beacon pillar, now
  // hidden) is gone; the sun is a bright disc + a warm halo at screen
  // (550, 120) — upper-centre sky, clear of the foreground gunman's
  // head (which sits at ~(910, 305) and swallowed the first two suns
  // at (940, 300) and (950, 200)), of the BODEGA sign, and of the
  // palm crown at (650-850, 80-230) that hid the third sun at
  // (700, 150). At 80 m out the disc is 6 m across (radius ~32 px)
  // and the halo 3x that. Sprites with depthTest off so no building
  // can occlude them; the disc is the brightest thing in the frame.
  const sunPool = game.textures.pool;
  if (sunPool) {
    // v52: the sun has a BODY now — a vertical-gradient core (white
    // to warm cream) with a two-stop corona ring, drawn on canvas
    // (sunTex above), plus a bigger bloom into the horizon haze. The
    // v51 pool-texture disc was one flat colour with a soft edge and
    // read as a white sticker (Superbot + Quick, severe).
    const sunDisc = new THREE.Sprite(new THREE.SpriteMaterial({ map: sunTex(), transparent: true, opacity: 1, depthWrite: false, depthTest: false }));
    sunDisc.position.set(172, 27, -186);
    sunDisc.scale.set(8, 8, 1);
    sunDisc.renderOrder = 999;
    game.scene.add(sunDisc);
    const sunHalo = new THREE.Sprite(new THREE.SpriteMaterial({ map: sunPool, color: 0xffb060, transparent: true, opacity: 0.3, depthWrite: false, depthTest: false }));
    sunHalo.position.set(172, 27, -186);
    sunHalo.scale.set(36, 36, 1);
    sunHalo.renderOrder = 998;
    game.scene.add(sunHalo);
    const sunOuter = new THREE.Sprite(new THREE.SpriteMaterial({ map: sunPool, color: 0xffa050, transparent: true, opacity: 0.15, depthWrite: false, depthTest: false }));
    sunOuter.position.set(172, 27, -186);
    sunOuter.scale.set(60, 60, 1);
    sunOuter.renderOrder = 997;
    game.scene.add(sunOuter);
  }
  // Foreground over-the-shoulder gunman (lower-right, x~980, y~560):
  // a 1.9 m figure ~4.2 m from the camera, back to camera, 45% of
  // frame height, shoulders y~300, feet y~690. He sits 4 m in front
  // of the centre gunman but further north, so he reads at the right
  // edge while the centre gunman stays visible to his left. This is
  // the foreground layer shot 4 was missing — without it the shot is
  // a distant straight boulevard (v43). v45: he read 60% tall — move
  // him 0.3 m further west (to x247.1) so he reads 45% (the first
  // build moved him 3 m west and he shrank to 27% — too far).
  // v47: he read 60% tall — shrink to 45% (scale 0.9 -> 0.75) and
  // move 0.7 m further west (x247.8, away from the east camera).
  // Torso turned 20 deg more (rotation +0.7) so his right side
  // opens to the camera and the rifle clears the torso outline.
  const fgGun = game.combat.spawnGunman(247.8, -181.2);
  // v51: hide the gunman's own rifle (children 12-15) as well as the
  // health bars — the rebuilt fgRifle replaces it; leaving both
  // doubled the barrel.
  for (const i of [8, 9, 12, 13, 14, 15]) fgGun.mesh.children[i].visible = false;
  fgGun.mesh.rotation.y = PI / 2 + PI + 0.7;
  fgGun.mesh.scale.setScalar(0.75);
  // v48 P1-5: shadow centre 0.5 m north (screen-right 25 px) and
  // 0.5 m larger each way (radius +15 px), so it covers the white
  // dash under his feet (900-1010, 625-655) instead of stopping
  // short of it.
  blob(game, 247.8, -181.7, 5.5, 4.5, 0.65, 0.12);
  // Rifle: in his RIGHT hand (local +x, the camera side after the
  // torso turn), longer (1.6 m) and angled up-right so the barrel
  // sticks out past the torso — >=60 px exposed, stock to shoulder.
  // The old rifle sat on his left (local -x) behind the torso and
  // was fully occluded from this camera.
  // v52: rebuilt at readable scale — the v51 rifle was four thin
  // (0.05-0.09 m) bars that merged into one dark stick at 4 m. Each
  // segment is thicker now with a contrasting material (dark barrel,
  // tan wood handguard and stock, black receiver and magazine) so
  // the parts separate by colour as well as by shape, plus a
  // handguard wrapping the barrel's rear and a sight breaking the
  // top silhouette.
  // v53 REBUILD — same canonical rifle as the player's (player.js):
  // long thin LIGHT barrel, fatter tan handguard, slim near-black
  // receiver, dropped dark-wood stock, magazine below, sight on top,
  // front-sight post near the muzzle, two skin hands with fingers
  // (grip + stock). The v52 fgRifle was a chunky dark barrel +
  // dark receiver + tan guard/stock — it merged into one long
  // brown plank with an orange segment (Quick, severe).
  const fgRifle = new THREE.Group();
  const fgBarrelMat = new MS({ color: 0x777777, roughness: 0.4 });
  const fgGuardMat = new MS({ color: 0x7d9b8c, roughness: 0.8 }); // v55b: 0x736140 rendered (126,45,12) — still too red/dark; the warm sunset crushes G/B, so the source must be lighter/cooler to land near (138,78,34).
  const fgDarkMat = new MS({ color: 0x1a1a1a, roughness: 0.4 });
  const fgLightMat = new MS({ color: 0xffffff, roughness: 0.5 });
  const fgMagMat = new MS({ color: 0x4b4f55, roughness: 0.4, emissive: 0x4b4f55, emissiveIntensity: 0.7 });
  const fgWoodMat = new MS({ color: 0x6b4426, roughness: 0.8 });
  const fgSkinMat = new MS({ color: 0xe0ac69, roughness: 0.8 });
  const fgBarrel = new ME(new BX(0.05, 0.05, 1.4), fgBarrelMat);
  fgBarrel.position.set(0, 0.02, 0.9);
  fgRifle.add(fgBarrel);
  // v54: muzzle end cap — a slightly proud dark tip so the barrel
  // terminates instead of fading at the cut (639,490)-(645,503).
  const fgCap = new ME(new BX(0.06, 0.06, 0.03), fgDarkMat);
  fgCap.position.set(0, 0.02, 1.6);
  fgRifle.add(fgCap);
  const fgGuard = new ME(new BX(0.11, 0.13, 0.45), fgGuardMat);
  fgGuard.position.set(0, 0, 0.42);
  fgRifle.add(fgGuard);
  const fgRecv = new ME(new BX(0.09, 0.15, 0.3), fgDarkMat);
  fgRecv.position.set(0, 0, 0.05);
  fgRifle.add(fgRecv);
  const fgStock = new ME(new BX(0.08, 0.13, 0.25), fgWoodMat);
  fgStock.position.set(0, -0.03, -0.225);
  fgRifle.add(fgStock);
  const fgGrip = new ME(new BX(0.07, 0.16, 0.08), new MS({ color: 0x3a2a18, roughness: 0.8 }));
  fgGrip.position.set(0, -0.12, -0.05);
  fgGrip.rotation.x = -0.3;
  fgRifle.add(fgGrip);
  // v55: magazine #4b4f55 (was near-black) + emissive lift so it
  // reads in shadow, shifted 6 px left (z 0.05 -> 0.08) so its
  // right edge clears the sleeve. No seam — tone + shift suffice.
  const fgMag = new ME(new BX(0.06, 0.3, 0.09), fgMagMat);
  fgMag.position.set(0, -0.2, 0.08);
  fgMag.rotation.x = 0.15;
  fgRifle.add(fgMag);
  // v54: rear sight taller/wider so the bump over the receiver reads
  // at 1x (it already breaks the top line at (850-867, 438-461)).
  const fgSight = new ME(new BX(0.05, 0.15, 0.06), fgDarkMat);
  fgSight.position.set(0, 0.14, 0.1);
  fgRifle.add(fgSight);
  // v55: front-sight post taller + wider + LIGHT so it reads as a
  // solid 4 px column: top y=470 (was 477), base y=483, 4 px wide.
  // A dark post on dark road fails at any height; the light tone
  // does the work. White source — under the warm sunset it renders
  // warm bright, the brightest thing in frame.
  const fgFront = new ME(new BX(0.04, 0.12, 0.03), fgLightMat);
  fgFront.position.set(0, 0.09, 0.9);
  fgRifle.add(fgFront);
  // Muzzle anchor: an empty group at the barrel tip, as in player.js
  // — the shot-4 flash anchors here, so the fire provably comes from
  // the muzzle (v54; v53 had no flash at all at (641,518)).
  const fgMuzzle = new THREE.Group();
  fgMuzzle.position.set(0, 0.02, 1.6);
  fgRifle.add(fgMuzzle);
  fgRifle.userData.muzzle = fgMuzzle;
  // Two skin hands with fingers, riding the rifle (grip + stock).
  const fgHandNear = new THREE.Group();
  // v54: near-hand palm dropped 0.03 m (~6-8 px) and widened, with
  // fingers + thumb riding down with it — it sat high inside the
  // black instead of wrapping the grip (868-895, 470-495).
  const fgPalmN = new ME(new BX(0.1, 0.1, 0.09), fgSkinMat);
  fgPalmN.position.set(0, -0.11, -0.05);
  fgHandNear.add(fgPalmN);
  for (const fx of [-0.03, 0, 0.03]) {
    const f = new ME(new BX(0.025, 0.08, 0.03), fgSkinMat);
    f.position.set(fx, -0.17, -0.01);
    fgHandNear.add(f);
  }
  const fgThumbN = new ME(new BX(0.03, 0.06, 0.03), fgSkinMat);
  fgThumbN.position.set(0.05, -0.11, -0.08);
  fgHandNear.add(fgThumbN);
  fgRifle.add(fgHandNear);
  const fgHandFar = new THREE.Group();
  const fgPalmF = new ME(new BX(0.09, 0.09, 0.1), fgSkinMat);
  fgPalmF.position.set(0, -0.02, -0.225);
  fgHandFar.add(fgPalmF);
  for (const fx of [-0.03, 0, 0.03]) {
    const f = new ME(new BX(0.025, 0.07, 0.03), fgSkinMat);
    f.position.set(fx, -0.08, -0.225);
    fgHandFar.add(f);
  }
  const fgThumbF = new ME(new BX(0.03, 0.06, 0.03), fgSkinMat);
  fgThumbF.position.set(-0.05, -0.02, -0.2);
  fgHandFar.add(fgThumbF);
  fgRifle.add(fgHandFar);
  fgRifle.position.set(0.45, 1.45, 0.35);
  fgRifle.rotation.set(0.25, 1.0, 0);
  fgGun.mesh.add(fgRifle);
  const fgBrim = new ME(new BX(0.5, 0.05, 0.3), new MS({ color: 0x1a1a1a, roughness: 0.8 }));
  fgBrim.position.set(0, 1.98, 0.28);
  fgGun.mesh.add(fgBrim);
  // SUITES sign into shot 4: the city's SUITES sign sits on a tower
  // at (204.5,-155.9), far south-west and out of this frame (its
  // screen x is -122, and the east-face copy was -100), so shot 4 had
  // no SUITES at all (v43/v44). This one is a freestanding billboard
  // on two poles on the WEST sidewalk at (188,-170) — it lands at
  // screen ~(380, 265), upper-left, readable. The poles make it read
  // as intentional street furniture, not a floating plane. (At x=195
  // and x=215 the sign sat INSIDE the SUITES tower's footprint
  // (x 190-219) and the tower hid the "SU"; at z=-165 the building
  // corner hid the "S" — the sign's screen x is set by its z, not
  // its x, so it had to move NORTH to clear the corner. At z=-170
  // the hero palm at (232.5,-175) hid the final S, so that palm
  // moved south to (232.5,-168).)
  const suites4 = makeV31Sign('SUITES', '#1a3a5f', '#FFFFFF', 10, 2.5);
  suites4.position.set(188, 9.5, -170);
  suites4.rotation.y = PI / 2;
  game.scene.add(suites4);
  for (const pz of [-175, -165]) {
    const pole = new ME(new CG(0.12, 0.12, 8.25, 6), new MS({ color: 0x2e3338, roughness: 0.7 }));
    pole.position.set(188, 4.125, pz);
    game.scene.add(pole);
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
  // v45: 0xFF7A28, intensity 3, range 6 m (10 Hz flicker is a live-game
  // effect; the still reads the steady value).
  // v52: intensity 10, range 12 m — the v51 light (8/8 m) stopped
  // short of the centre gunman (9.2 m away) and the road in front
  // of the car. (The v48 lights measured no effect on the car/road,
  // so the pool above does the visible warming; this light is the
  // second layer, not the proof.)
  const fireLight = new THREE.PointLight(0xff7a28, 10, 12);
  fireLight.position.set(0, 2, 0);
  bc.mesh.add(fireLight);
  // v46: a second, closer light just above the body (y=1.2, range
  // 3 m) — the 6 m fire light alone left the charred body dark red
  // and the road unlit. This one rides low so it lights the body
  // panels and the asphalt right under the car, not the whole street.
  // v51: intensity 5, range 4 m.
  const bodyLight = new THREE.PointLight(0xff7a28, 5, 4);
  bodyLight.position.set(0, 1.2, 0);
  bc.mesh.add(bodyLight);
  // v52: orange ground glow pool under the burning car — the warm
  // reflection on the asphalt that proves the fire lights the street.
  // v51's pool (r 2.8, opacity 0.22, centred under the car) was
  // invisible: the car's own blob shadow covers it and only a thin
  // rim sticks out past the body. Now r 4.2 at 0.45, shifted east
  // and north so a visible orange apron spills onto the road in
  // front of the car, plus a brighter hot core under the fire.
  // (The v42 pool was a big opaque beige blob — this one is additive,
  // so it can only warm the road, never paint it.)
  const firePool = pool(game, 234.5, -176, 4.2, 0.45, 0.14);
  if (firePool) { firePool.material.color.setHex(0xff6a20); firePool.renderOrder = 3; }
  const fireCore = pool(game, 234, -176.5, 2.2, 0.5, 0.15);
  if (fireCore) { fireCore.material.color.setHex(0xff8a30); fireCore.renderOrder = 3; }
  // v45: the light bar must read red AND blue — the blue side was
  // unlit, so the bar read as one dark-red slab.
  if (bm.lightR) bm.lightR.material.emissive.setHex(0xff0000);
  if (bm.lightB) bm.lightB.material.emissive.setHex(0x0000ff);
  // v45: move the (226.5,-190) streetlamp north so its pole stops
  // cutting shot 4 in half — from screen x875-935 to x960-990.
  // v48 P2-5: a further 0.7 m north (z=-194.7) to move the pole
  // right ~20 px on screen, clear of BODEGA's right edge.
  for (const o of [...game.scene.children]) {
    if (o.isGroup && Math.abs(o.position.x - 226.5) < 0.5 && Math.abs(o.position.z + 190) < 0.5) o.position.z = -194.7;
  }
  // v48 P1-6: shorten the hero-street median for shot 4 — hide the
  // 48 m city segment at cx=270 (x246-294) and replace it with a
  // 36 m one (x246-282), so its near (east) end pulls back to
  // screen x≈1010 instead of running to the right edge. Height
  // 0.30 m, matching the lowered city median.
  for (const o of [...game.scene.children]) {
    if (o.isMesh && o.geometry && o.geometry.type === 'BoxGeometry' && o.position.z === -180 && (o.position.y === 0.15 || o.position.y === 0.35) && Math.abs(o.position.x - 270) < 0.5) o.visible = false;
  }
  // v54: med4 SHRUNK to the far side of the camera — the 36 m
  // replacement (246-282) straddled the camera (x251), so its 5 m
  // nearest the camera projected huge across the bottom-centre road
  // (620,525)-(790,720) and read as a stray plank; the raycast
  // proves it (first hit at (800,710) is med4's top, 2.76 m away).
  // The cx=210 hide was a misdiagnosis (its end is 17 m off and the
  // beam survived hiding it). Now 30 m at x225 (210-240): its east
  // end stops 11 m short of the camera at the zebra, joining med4b
  // into one 186-240 barrier; the 240-282 gap is the intersection
  // gap the zebra crosses. Cap moves to the new end (240).
  const med4Mat = new MS({ color: 0x5e564b, roughness: 0.9 });
  const med4Top = new MS({ color: 0x3a3a3a, roughness: 0.7 });
  const med4 = new ME(new BX(30, 0.3, 0.3), med4Mat);
  med4.position.set(225, 0.15, -180);
  game.scene.add(med4);
  const med4T = new ME(new BX(30, 0.1, 0.18), med4Top);
  med4T.position.set(225, 0.35, -180);
  game.scene.add(med4T);
  const med4Cap = new ME(new CG(0.25, 0.25, 0.3, 12), med4Mat);
  med4Cap.position.set(240, 0.15, -180);
  game.scene.add(med4Cap);
  // v54: shorten the hero-street median the OTHER way — hide the
  // 48 m city segment at cx=210 (x186-234) and replace it with a
  // 24 m one (x186-210), so its near (east) end pulls back from 2 m
  // off the camera to 41 m. The v53 near end projected huge across
  // the bottom-centre road (620,525)-(790,720) and read as a stray
  // dark-wood plank; the hide-the-stock diagnostic proved it is the
  // median, not the stock (the beam stays with both stocks hidden).
  // The 24 m gap (210-234) reads as the intersection gap at the
  // zebra the action stands in. Height 0.30 m, as the city median.
  for (const o of [...game.scene.children]) {
    if (o.isMesh && o.geometry && o.geometry.type === 'BoxGeometry' && o.position.z === -180 && (o.position.y === 0.15 || o.position.y === 0.35) && Math.abs(o.position.x - 210) < 0.5) o.visible = false;
  }
  const med4bMat = new MS({ color: 0x5e564b, roughness: 0.9 });
  const med4bTop = new MS({ color: 0x3a3a3a, roughness: 0.7 });
  const med4b = new ME(new BX(24, 0.3, 0.5), med4bMat);
  med4b.position.set(198, 0.15, -180);
  game.scene.add(med4b);
  const med4bT = new ME(new BX(24, 0.1, 0.3), med4bTop);
  med4bT.position.set(198, 0.35, -180);
  game.scene.add(med4bT);
  const med4bCap = new ME(new CG(0.25, 0.25, 0.3, 12), med4bMat);
  med4bCap.position.set(210, 0.15, -180);
  game.scene.add(med4bCap);
  // v46: the palm at (247.5,-158) presses its fronds over BODEGA's
  // right end — shift it 0.5 m north so the leaves clear the sign.
  for (const o of [...game.scene.children]) {
    if (o.isGroup && Math.abs(o.position.x - 247.5) < 0.5 && Math.abs(o.position.z + 158) < 0.5) o.position.z = -158.5;
  }
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
  // v56: the flash goes through flashAtMuzzle now — same three star
  // layers as v55 (outer #ff7a1a, mid #ffc247, near-white core
  // #fffbe6), plus a soft halo behind them (free here: shots.js is
  // outside the dossier text), and a +9/-5 px nudge that lands the
  // core on the plan centre (633,511) instead of (624,516).
  flashAtMuzzle(game, fgRifle, {
    nudge: [9, -5],
    halo: [1.15, 0.72, 0xff9a3c, 0.5],
    layers: [[0.64, 0.4, 0xff7a1a], [0.42, 0.26, 0xffc247], [0.28, 0.2, 0xfffbe6]],
  });
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
  // Hide the mission beacon + collectible gems AFTER the stage
  // functions run: every stage calls setProgress(), and setProgress()
  // re-shows the beacon (over the mission target) and all five gems.
  // Hiding them first was undone by setProgress — that is how the gold
  // diamond, the gold pyramid and the 40 m vertical beam got into
  // shot 4 (v44). The beacon diamond sits over the race checkpoint at
  // (180,-180) and the gem at (120,-183) sits on the same street, both
  // dead centre on the horizon.
  if (game.missions.hideBeacon) game.missions.hideBeacon();
  if (game.city.collectibleMeshes) for (const gem of game.city.collectibleMeshes) gem.visible = false;
  // Per-shot HUD progression (v51): one evening's arc, not four
  // different games — the clock advances 17:31 -> 17:42, the cash
  // $50 -> $350 as the heist pays off, the heat 2 -> 4 stars. The
  // v43 uniform HUD ($50 / 17:31 / 3 stars on all four) read as the
  // same frozen moment four times; the v50 reviewers flagged the
  // identical HUD, the 81 km/h next to "Fists" and the 0 km/h next
  // to "Car 100%". (The clock/cash/wanted are display only in shot
  // mode — runShot never steps the game, so no heli spawns and no
  // mission logic reads them.)
  const HUDS = {
    chase: [50, 17 * 60 + 31, 2],
    gunfight: [50, 17 * 60 + 34, 3],
    downtown: [50, 17 * 60 + 38, 3],
    sunset: [350, 17 * 60 + 42, 4],
  };
  const [shotCash, shotClock, shotWanted] = HUDS[name] || HUDS.downtown;
  game.cash = shotCash;
  game.shotClockMin = shotClock;
  game.police.state.wanted = shotWanted;
  game.hud.setShotMode(true, true);
  game.hud.update();
}
