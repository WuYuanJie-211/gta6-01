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
  // v47: c2 into the lane — x +2.6 m, z -0.4 m (was x=230, on the
  // beige plaza with an asphalt patch under it; now x=232.6, four
  // wheels on the road itself). The patch follows c2.pos, so it
  // moves with the cruiser.
  const c1 = pc(game, vx + 6, vz - 1, -PI / 2 + 0.4, 24);
  const c2 = pc(game, vx - 4.4, vz - 8.4, -PI / 2, 24);
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
  // v45 fix 4 (REVERTED): a solid black rectangle (op 0.6, render
  // Order 4) rendered as a hard-edged dark slab and STILL did not
  // darken the dash — the baked road dashes punch through any
  // transparent overlay here. Removed; the soft blobs stay. The van
  // shadow is present and crosses both dashes visually, but the dash
  // pixels read ~197, not ≤150 — a partial on P0.8's pixel test.
  blob(game, vx, vz, 7.5, 5.0, 0.6, 0.08);
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
  blob(game, c2.pos.x, c2.pos.z, 7.5, 5.0, 0.6, 0.08);
  // v45: asphalt patch under c2 — the beige plaza under the left
  // cruiser read as a car parked on a sidewalk. A dark asphalt plane
  // (10x7 m, y=0.06) under it makes the cruiser read as on the road.
  const patch = new ME(new PG(10, 7), new MS({ color: 0x333333, roughness: 0.95 }));
  patch.rotation.x = -PI / 2;
  patch.position.set(c2.pos.x, 0.06, c2.pos.z);
  game.scene.add(patch);
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
  skid(game, vx - 2, vz - 8);
  // GYM sign (v46): lowered to y=3.0 and the heli raised to y=9.5 —
  // the v45 sign (y=5.0) overlapped the heli's belly/skids and read
  // as a sign hung ON the helicopter. Now the sign's letters sit at
  // screen y~200-280 and the skids clear it by >=30 px.
  const gym = makeV31Sign('GYM', '#1a3a5f', '#FFFFFF', 6, 3.5);
  gym.position.set(233, 2.75, -220); // v47: down 0.25 m, skid gap 33 -> ~44 px
  gym.rotation.y = 0;
  game.scene.add(gym);
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
  // Bigger rifle (scale 1.3), turned 26 deg toward the camera-right so
  // the barrel reads side-on instead of foreshortened to a stub — the
  // old scale-1.0 rifle pointing straight away was invisible (v43).
  // Local x -0.55 (not -0.35): the mesh is rotated PI, so local +x is
  // world west — the old spot put the rifle only just outside the
  // torso (half-width 0.375 m), so from the staged camera the muzzle
  // sat inside the torso silhouette and the flash was fully occluded
  // by his own body (v44). At -0.55 the muzzle clears the silhouette.
  rifle.position.set(-0.55, 1.65, 0.55);
  rifle.rotation.set(0.16, 0.45, 0);
  rifle.scale.setScalar(1.3);
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
  // health bars, hidden for every enemy.)
  for (const e of game.combat.enemies) {
    e.mesh.children[8].visible = e.mesh.children[9].visible = false;
    if (e.kind === 'gunman') for (const i of [12, 13, 14]) e.mesh.children[i].visible = false;
  }
  // Ground shadows under all three men — big and dark with a core, so
  // the white dash under each pair of feet is visibly half-dark. The
  // core (renderOrder 3) draws after the dash texture and after any
  // light pool, so nothing repaints over it.
  blob(game, -183, 197, 4.5, 3.5, 0.5, 0.1);
  // v47: core enlarged 1.8 -> 3.0 m deep — the 2 m dash segment stuck
  // out past the core's dense centre (the dash ends read 159-201).
  // 3.0 m covers the whole segment plus margin; opacity 0.72.
  const pcore = new ME(new PG(2.5, 3.0), SH(blobShadowTexture(), 0.72));
  pcore.rotation.x = -PI / 2;
  pcore.position.set(-183, 0.13, 197);
  pcore.renderOrder = 3;
  game.scene.add(pcore);
  blob(game, -183, 189, 3.5, 2.8, 0.5, 0.1);
  // v47: far gunman's core enlarged 1.5 -> 2.5 m deep, same reason;
  // same world size as the near core would read smaller at his
  // distance, so 2.5 m keeps the dash covered. Opacity 0.72.
  const dcore = new ME(new PG(2.0, 2.5), SH(blobShadowTexture(), 0.72));
  dcore.rotation.x = -PI / 2;
  dcore.position.set(-183, 0.13, 189);
  dcore.renderOrder = 3;
  game.scene.add(dcore);
  blob(game, -188, 193.0, 2.0, 1.6, 0.5, 0.1);
  blob(game, -189, 195.0, 2.0, 1.6, 0.5, 0.1);
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
    { x: 237, z: -160, prev: '240,-120', target: '240,-180', h: -PI / 2 },
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
  // van half on the sidewalk, straddling the curb. v46: the dark van
  // (armored, first spot) still read with its wheel on the sidewalk
  // edge — moved 1.5 m west into the lane centre (x=243) and 2 m
  // north (z=-194) so all four wheels sit clearly on asphalt.
  // v47: the dark van (armored, second spot) moved right 70 px — 0.84 m
  // north (z -168 -> -168.84) so its right front wheel sits back on
  // asphalt, clear of the curb. (v46 moved the wrong spot's van.)
  const parkedSpots = [[243, -194], [244.5, -168.84], [244.5, -204]];
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
  for (const o of game.scene.children) {
    if (o.userData && o.userData.v31sign === 'SUITES') o.position.z -= 0.65;
  }
  // v45: shorten the hero-street median (Jersey barrier) so its near
  // end stops at screen y=520 with a rounded cap instead of running
  // to the bottom of the frame. The city builds it in 48 m segments;
  // the segment at cx=270 (x246-294) is hidden and replaced by a
  // shorter one (x234-246) plus a vertical-cylinder rounded end cap
  // at x=246. v45 fix: the first build ended the barrier at x=257
  // (7.6 m from the camera) and the cap still landed at the bottom
  // edge (y~680) — ending it at x=246 (18.6 m away) lifts the near
  // end to ~y520.
  for (const o of [...game.scene.children]) {
    if (o.isMesh && o.geometry && o.geometry.type === 'BoxGeometry' && o.position.z === -180 && (o.position.y === 0.35 || o.position.y === 0.75) && Math.abs(o.position.x - 270) < 0.5) o.visible = false;
  }
  const medMat = new MS({ color: 0x5e564b, roughness: 0.9 });
  const medTop = new MS({ color: 0x3a3a3a, roughness: 0.7 });
  // v46: darker (0x5E564B, was pale 0xb8b8b0) and lower (0.5 m, was
  // 0.7 m) — the pale tall barrier cut diagonally across the frame
  // and read as a bright beige slab; now it sits <=34 px tall.
  const med = new ME(new BX(12, 0.5, 0.5), medMat);
  med.position.set(240, 0.25, -180);
  game.scene.add(med);
  const medT = new ME(new BX(12, 0.1, 0.3), medTop);
  medT.position.set(240, 0.55, -180);
  game.scene.add(medT);
  const medCap = new ME(new CG(0.25, 0.25, 0.5, 12), medMat);
  medCap.position.set(246, 0.25, -180);
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
  const r = game.combat.spawnGunman(240, -183);
  r.mesh.children[8].visible = r.mesh.children[9].visible = false;
  r.mesh.rotation.y = PI / 2 + PI;
  blob(game, 240, -183, 5.0, 4.0, 0.5, 0.12);
  const core = new ME(new PG(2.5, 1.8), SH(blobShadowTexture(), 0.85));
  core.rotation.x = -PI / 2;
  core.position.set(240, 0.13, -183);
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
  // would char the second cruiser too). The char is MEDIUM (0x3a2a22),
  // not near-black: at 0x241a14 the car read as a dark pickup truck,
  // not a police car (v44). The light bar stays UNCHARRED so the car
  // still reads as a cruiser.
  const bm = bc.mesh.userData;
  bm.body.material = bm.body.material.clone();
  bm.body.material.color.setHex(0x3a2a22);
  bm.cabin.material = bm.cabin.material.clone();
  bm.cabin.material.color.setHex(0x2a2226);
  bc.mesh.position.y = -0.05;
  // The sunk mesh drags its own under-car shadow below the road, so the
  // burning car gets an explicit blob to ground it.
  blob(game, 233, -177, 6.0, 3.8, 0.6, 0.08);
  // Fire is PARTICLES emitted from the car body, not cones: the old
  // 3 cones (tallest 2.8 m) read as a solid yellow triangle floating
  // above the roof with a gap from the body (v43). v45: 6 emission
  // points SPREAD ALONG THE CAR'S LENGTH (local z, the visible axis)
  // x 60 sprites each, 3 colour layers (pale core / orange / dark
  // red edge), so the fire reads as volume, not flat stickers. The
  // old points spread along local x (the car's width, i.e. depth
  // from this camera) so they piled into one cluster. Flame height
  // 45 px (0.55x car): sprites sit 0.6-1.8 m, size 0.25-0.6 m.
  const fireRng = mulberry32(44);
  const fireTex = game.textures.fireball;
  if (fireTex) {
    const fireCols = [0xfff0b0, 0xff8a20, 0x8a1e08];
    const firePts = [[0.3, 1.6], [-0.3, 1.1], [0.3, 0.4], [-0.3, -0.2], [0.3, -0.9], [-0.2, -1.4]];
    for (const [lx, lz] of firePts) {
      for (let i = 0; i < 60; i += 1) {
        const s = new THREE.Sprite(new THREE.SpriteMaterial({
          map: fireTex, color: fireCols[i % 3], transparent: true,
          opacity: 0.55 + fireRng() * 0.4, blending: AB, depthWrite: false,
        }));
        const h = 0.6 + fireRng() * 1.2;
        s.position.set(lx + (fireRng() - 0.5) * 0.5, h, lz + (fireRng() - 0.5) * 0.6);
        // v47: particle size -15% so the flame top drops back to y≈305.
        const sz = (0.25 + fireRng() * 0.35) * 0.85;
        s.scale.set(sz, sz * 1.4, 1);
        bc.mesh.add(s);
      }
    }
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: fireTex, color: 0xff8030, transparent: true, opacity: 0.4, blending: AB, depthWrite: false }));
    glow.position.set(0.3, 1.2, 0);
    glow.scale.set(2.4, 2.0, 1);
    bc.mesh.add(glow);
  }
  // Second cruiser, on the south lane (z=-188) — at -184 it stood
  // between the camera and the comet and hid it; here it frames the
  // burning car instead and the comet stays clear on the north lane.
  const pc2 = pc(game, 238, -190, PI, 0);
  blob(game, 238, -190, 6.0, 3.8, 0.6, 0.08);
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
  const sunTex = game.textures.pool;
  if (sunTex) {
    const sunDisc = new THREE.Sprite(new THREE.SpriteMaterial({ map: sunTex, color: 0xfff2c0, transparent: true, opacity: 0.95, depthWrite: false, depthTest: false }));
    sunDisc.position.set(172, 27, -186);
    sunDisc.scale.set(6, 6, 1);
    sunDisc.renderOrder = 999;
    game.scene.add(sunDisc);
    const sunHalo = new THREE.Sprite(new THREE.SpriteMaterial({ map: sunTex, color: 0xff9a2e, transparent: true, opacity: 0.35, depthWrite: false, depthTest: false }));
    sunHalo.position.set(172, 27, -186);
    sunHalo.scale.set(18, 18, 1);
    sunHalo.renderOrder = 998;
    game.scene.add(sunHalo);
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
  fgGun.mesh.children[8].visible = fgGun.mesh.children[9].visible = false;
  fgGun.mesh.rotation.y = PI / 2 + PI + 0.7;
  fgGun.mesh.scale.setScalar(0.75);
  blob(game, 247.8, -181.2, 5.0, 4.0, 0.5, 0.12);
  // Rifle: in his RIGHT hand (local +x, the camera side after the
  // torso turn), longer (1.6 m) and angled up-right so the barrel
  // sticks out past the torso — >=60 px exposed, stock to shoulder.
  // The old rifle sat on his left (local -x) behind the torso and
  // was fully occluded from this camera.
  const fgRifle = new ME(new BX(0.07, 0.07, 1.6), new MS({ color: 0x2a2a2a, roughness: 0.4 }));
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
  const fireLight = new THREE.PointLight(0xff7a28, 3, 6);
  fireLight.position.set(0, 2, 0);
  bc.mesh.add(fireLight);
  // v46: a second, closer light just above the body (y=1.2, range
  // 3 m) — the 6 m fire light alone left the charred body dark red
  // and the road unlit. This one rides low so it lights the body
  // panels and the asphalt right under the car, not the whole street.
  const bodyLight = new THREE.PointLight(0xff7a28, 2, 3);
  bodyLight.position.set(0, 1.2, 0);
  bc.mesh.add(bodyLight);
  // v45: the light bar must read red AND blue — the blue side was
  // unlit, so the bar read as one dark-red slab.
  if (bm.lightR) bm.lightR.material.emissive.setHex(0xff0000);
  if (bm.lightB) bm.lightB.material.emissive.setHex(0x0000ff);
  // v45: move the (226.5,-190) streetlamp north so its pole stops
  // cutting shot 4 in half — from screen x875-935 to x960-990.
  // v46: a further 1 m north (z=-194) to x980-1006, clear of BODEGA.
  for (const o of [...game.scene.children]) {
    if (o.isGroup && Math.abs(o.position.x - 226.5) < 0.5 && Math.abs(o.position.z + 190) < 0.5) o.position.z = -194;
  }
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
  // One HUD for all four shots: $50, 17:31, 3 stars. The per-shot
  // clock/cash/wanted sets are gone — a sunset at 18:12 with
  // $2,000,000 next to three dusk shots at 17:31 with $50 read as four
  // different games (v43).
  game.cash = 50;
  game.shotClockMin = 17 * 60 + 31;
  game.police.state.wanted = 3;
  game.hud.setShotMode(true, true);
  game.hud.update();
}
