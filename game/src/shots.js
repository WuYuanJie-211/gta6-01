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
  // in the centre.
  const c1 = pc(game, vx + 6, vz - 1, -PI / 2 + 0.4, 24);
  const c2 = pc(game, vx - 7, vz - 11, -PI / 2, 24);
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
  blob(game, vx, vz, 7.5, 5.0, 0.6, 0.08);
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
    // v44: shrunk to 0.72x (scale 1.6 -> 1.15) and moved 6 m further
    // north + 2.5 m east, 0.5 m lower. At 1.6x the rotor tips cut 57 px
    // past the top edge and the tail rotor sat at x=54 (v43). The
    // rotor is parked at 45 deg so the four blades read as an X.
    heli.position.set(vx - 2, 8.0, vz - 26);
    heli.scale.setScalar(1.15);
    heli.rotation.y = PI / 2 - 0.2;
    // Rotor parked at a diagonal so the 4 blades read as an X, never a
    // single rod (the shot never steps the game, so the rotor is static).
    heli.userData.rotor.rotation.y = 0.785;
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
  // GYM sign into frame: the city's GYM sign sits on a tower at
  // (146.9,-134.8), far west and behind this camera, so shot 1 had no
  // GYM at all (v43). This one mounts on the CINEMA tower's EAST face
  // (tower 208.3,-275.3, w=17.1 -> face at x=216.85), BELOW the
  // CINEMA sign (y=3.5, not 7) — the south face is seen at a glancing
  // angle and its ground floor is hidden behind the shop podium
  // (v44). It sits at x=220, on the podium's east face, so the
  // podium (which protrudes east of the tower face) does not hide it.
  // Facing the chase camera, upper-left.
  const gym = makeV31Sign('GYM', '#6e5a6e', '#FFFFFF', 8, 2.5);
  gym.position.set(221, 3.5, -275.3);
  gym.rotation.y = PI / 2;
  game.scene.add(gym);
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
  blob(game, -183, 197, 4.5, 3.5, 0.5, 0.1);
  const pcore = new ME(new PG(2.5, 1.8), SH(blobShadowTexture(), 0.85));
  pcore.rotation.x = -PI / 2;
  pcore.position.set(-183, 0.13, 197);
  pcore.renderOrder = 3;
  game.scene.add(pcore);
  blob(game, -183, 189, 3.5, 2.8, 0.5, 0.1);
  const dcore = new ME(new PG(2.0, 1.5), SH(blobShadowTexture(), 0.85));
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
  place(taxi, 248, -180, PI / 2);
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
  // Brake-light boxes on the taxi's rear (south face now, it faces
  // north) — on the car, not the ground. NO red glow plane on the
  // asphalt: it read as a light blob under the taxi (v42).
  for (const gx of [247.3, 248.7]) {
    const g = new ME(new BX(0.5, 0.25, 0.15), new MB({ color: 0xff2222, transparent: true, opacity: 0.5 }));
    g.position.set(gx, 0.75, -177.9);
    game.scene.add(g);
  }
  // 6 traffic cars, none between the camera (east) and the taxi: two
  // eastbound in the north lane, two westbound further west, one
  // northbound + one southbound on the avenue. The old westbound
  // queue sat between the camera and the taxi and would have hidden
  // it from the new east camera.
  const spots = [
    { x: 228, z: -177, prev: '180,-180', target: '240,-180', h: 0 },
    { x: 212, z: -177, prev: '180,-180', target: '240,-180', h: 0 },
    { x: 220, z: -183, prev: '300,-180', target: '240,-180', h: PI },
    { x: 205, z: -183, prev: '300,-180', target: '240,-180', h: PI },
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
  // v44: camera EAST of the taxi, looking west — the street converges
  // to a vanishing point ~190 px right of centre (x≈830), and the
  // taxi's 4.2 m side fills ~290 px. camDist 14 (17 m with the +3 for
  // being in a car), pitch 0.15 (camera ~4 m up), FOV 34 telephoto.
  // camLookOff -2.0 pushes the taxi right toward the golden point.
  // The old high/wide shot (camDist 32, 35 m back) saw only the
  // taxi's rear at 59 px and the VP dead centre.
  game.camDist = 14;
  game.camPitch = 0.15;
  game.cameraAngle = 1.72;
  game.camX = 0;
  game.camLookOff = -2.0;
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
  // above the roof with a gap from the body (v43). 6 emission points
  // (engine bay, A-pillar, rear seat, roofline) x 10 sprites each,
  // seeded so the render is deterministic, additive so they glow
  // against the car. Every sprite sits inside the car outline
  // (local x -1.9..1.9, z -0.8..0.8) and no higher than 2.5 m
  // (1.6x the car height). The ones below the roofline are occluded
  // by the body; the ones above it read as flame tongues.
  const fireRng = mulberry32(44);
  const fireTex = game.textures.fireball;
  if (fireTex) {
    const fireCols = [0xffd94d, 0xff9a2e, 0xff7a20];
    const firePts = [[1.6, 0.3], [1.1, -0.3], [0.4, 0.3], [-0.2, -0.3], [-0.9, 0.3], [-1.4, -0.2]];
    for (const [lx, lz] of firePts) {
      for (let i = 0; i < 10; i += 1) {
        const s = new THREE.Sprite(new THREE.SpriteMaterial({
          map: fireTex, color: fireCols[i % 3], transparent: true,
          opacity: 0.55 + fireRng() * 0.4, blending: AB, depthWrite: false,
        }));
        const h = 0.5 + fireRng() * 2.0;
        s.position.set(lx + (fireRng() - 0.5) * 0.6, h, lz + (fireRng() - 0.5) * 0.5);
        const sz = 0.3 + fireRng() * 0.5;
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
  // a distant straight boulevard (v43).
  const fgGun = game.combat.spawnGunman(247.4, -181.2);
  fgGun.mesh.children[8].visible = fgGun.mesh.children[9].visible = false;
  fgGun.mesh.rotation.y = PI / 2 + PI;
  fgGun.mesh.scale.setScalar(1.15);
  blob(game, 247.4, -181.2, 5.0, 4.0, 0.5, 0.12);
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
