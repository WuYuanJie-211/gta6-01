// The city: ground, roads, curbs, buildings, districts, the hero
// zone. One build, seeded, so the same seed always makes the same
// city.
//
// v41 ground stack — the fix for the floating road. From the bottom:
// a base slab at y=0; a sidewalk plane with real tile seams at y=0.01;
// the road planes at y=0.04 (avenues) / 0.045 (streets) wearing the
// baked-marking asphalt texture; real curb boxes 0.15 m high along
// every road edge (top y=0.15); opaque zebra planes at y=0.055. The
// road sits IN a channel between curbs, below the sidewalk, with a
// visible 3D edge — it cannot read as a carpet laid on top. Nothing
// transparent sits between the camera and the road except the blobs,
// which draw last (renderOrder 2).
import * as THREE from 'three';
import { BX, CG, CN, CI, PG, SG, OG, MS, MB, ME, GP, V3, PI, RW, SC, CT, DS } from './geo.js';
import { CITY, districtAt, COLOURS, TEXTURES } from './config.js';
import {
  makeRoadTexture, makeRoadRoughnessTexture, makeSidewalkTexture, makeZebraTexture, makeFacadeAtlas,
  applyFacadeUVs, makeTrafficLight, makeHydrant, makeSign, makeLamp,
  makeBench, makeTree, makePalm, makeV31Palm, makeV31Sign, makeFarSkyline,
  addBlobShadow, addAOSkirt, makeBillboard,
  makeKiosk, makeDumpster, makeTrafficCones, makePlanter, makeBikeRack,
} from './v31.js';

export const HERO_ZONE = { minX: 220, maxX: 260, minZ: -200, maxZ: -160, cx: 240, cz: -180 };
const SIGN_NAMES = ['BODEGA', 'SUITES', 'HOTEL', 'CASINO', 'MALL', 'BANK', 'PIZZA', 'TACOS', 'GYM', 'CINEMA', 'BAR', '24H'];
const SIGN_COLORS = ['#a87a4e', '#2e3d4d', '#6e3535', '#3a3248', '#3a5a44', '#8a4a40', '#9a5a38', '#4a7a70', '#625a62', '#7a5248', '#3a5a6e', '#333333'];

const M = (c, r = 0.9, extra = {}) => new MS({ color: c, roughness: r, ...extra });
const SM = (o) => new MS(o);
const TM = (tex, rx, ry, rough = 0.9) => {
  const t = tex.clone();
  t.needsUpdate = true;
  t.wrapS = RW;
  t.wrapT = RW;
  t.repeat.set(rx, ry);
  return new MS({ map: t, roughness: rough });
};
const tile = (tex, rx, ry) => {
  const t = tex.clone();
  t.needsUpdate = true;
  t.wrapS = RW;
  t.wrapT = RW;
  t.repeat.set(rx, ry);
  return t;
};
const box = (scene, w, h, d, mat, x, y, z, cast = false) => {
  const m = new ME(new BX(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = cast;
  scene.add(m);
  return m;
};
const cyl = (scene, rTop, rBot, h, seg, mat, x, y, z, cast = false) => {
  const m = new ME(new CG(rTop, rBot, h, seg), mat);
  m.position.set(x, y, z);
  m.castShadow = cast;
  scene.add(m);
  return m;
};

// Flat-colour fallbacks for the texture files. Two files were never
// shipped (red-paint, taxi-paint) — the fallback is how the Comet stays
// red and the taxi stays yellow. Do not "fix" the paths without
// shipping the files.
const FALLBACK = {
  glass: 0x3a5a7a, brick: 0xa85a4a, stucco: 0xd8c49a, asphalt: 0x4b4e53,
  sidewalk: 0xb3a98f, grass: 0x4a7a3a, sand: 0xd9c48a, container: 0x7a7a7a,
  concrete: 0x9aa0a3, wood: 0x8a6b4f, cobble: 0x8a8a8a, redPaint: 0xd21f2b,
  taxiPaint: 0xffe14d, fireball: 0xff8030, smoke: 0x888888, pool: 0xffffff,
  skid: 0x222222, shadow: 0x000000, marble: 0xd8d8d8, glassDark: 0x1c2836,
  brickBrown: 0x7a4a3a, plaster: 0xe0d8c0, metal: 0x8a8f94, awning: 0xe74c3c,
  signTaxi: 0xffe14d, sign24h: 0x2a6a3a, signHotel: 0x8a1a1a, signBar: 0x7d3c98,
  signPizza: 0xd35400, signAuto: 0x1a3a5f, sunsetSky: 0xff8c5a, neonSign: 0xff2a7a,
};

function flatTexture(color) {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 4;
  const x = c.getContext('2d');
  x.fillStyle = `#${color.toString(16).padStart(6, '0')}`;
  x.fillRect(0, 0, 4, 4);
  const t = new CT(c);
  t.colorSpace = SC;
  return t;
}

export async function loadCityTextures() {
  const loader = new THREE.TextureLoader();
  const out = {};
  for (const [key, path] of Object.entries(TEXTURES)) {
    try {
      const t = await loader.loadAsync(path);
      t.colorSpace = SC;
      t.anisotropy = 8;
      out[key] = t;
    } catch {
      out[key] = flatTexture(FALLBACK[key] ?? 0x888888);
    }
  }
  return out;
}

export function buildCity(scene, rng, textures) {
  const col = [];
  const trafficLights = [];
  const towers = [];
  const tx = textures;
  const aniso = textures.anisotropy || 8;
  const facadeAtlas = makeFacadeAtlas();
  const facadeMat = new MS({ map: facadeAtlas, roughness: 0.9 });

  const landmarks = {
    plaza: { x: 0, z: 0 },
    clientSpot: { x: 6, z: 4 },
    marina: { x: 210, z: 250 },
    cometSpot: { x: 246, z: -150 },
    chopShop: { x: -210, z: 210 },
    packageSpot: { x: 120, z: 120 },
    lighthouse: { x: -216, z: -216 },
    armoredSpot: { x: 330, z: -252 },
    bank: { x: 330, z: -270 },
    dealer: { x: 210, z: -150 },
    gunShop: { x: 150, z: -210 },
    garage: { x: 270, z: 30 },
    diner: { x: 30, z: 150 },
    race: [{ x: 180, z: -180 }, { x: 180, z: 60 }, { x: -60, z: 60 }, { x: -60, z: -180 }],
    busStops: [{ x: 14, z: -174 }, { x: -14, z: -186 }, { x: 234, z: -186 }, { x: 14, z: 6 }, { x: -14, z: -6 }],
    collectibles: [{ x: 120, z: -183 }, { x: 0, z: 30 }, { x: -120, z: 120 }, { x: 300, z: -60 }, { x: -240, z: -300 }],
  };

  // ---- Ground stack ----
  // Base slab: the dirt under everything.
  const base = new ME(new PG(820, 700), M(COLOURS.ground, 1));
  base.rotation.x = -PI / 2;
  base.position.set(0, 0, -60);
  base.receiveShadow = true;
  scene.add(base);
  // Sidewalk: one big plane with tile seams, 1 cm up.
  const walkTex = makeSidewalkTexture(aniso);
  walkTex.repeat.set(50, 42.5);
  const walk = new ME(new PG(800, 680), new MS({ map: walkTex, roughness: 0.95 }));
  walk.rotation.x = -PI / 2;
  walk.position.set(0, 0.01, -60);
  walk.receiveShadow = true;
  scene.add(walk);
  // Roads: baked-marking asphalt. Avenues (N-S) 600 m = 75 tiles at
  // y=0.04; streets (E-W) 720 m = 90 tiles at y=0.045, so the two
  // never z-fight where they cross.
  const roadTex = makeRoadTexture(aniso);
  roadTex.wrapT = RW;
  const roadTexA = roadTex.clone();
  roadTexA.needsUpdate = true;
  roadTexA.wrapT = RW;
  roadTexA.repeat.set(1, 75);
  const roadTexS = roadTex.clone();
  roadTexS.needsUpdate = true;
  roadTexS.wrapT = RW;
  roadTexS.repeat.set(1, 90);
  // v57 row 4: the roughness map breaks the specular up — the tyre
  // tracks are polished smooth (dark, glossy at sunset) and the oil
  // patches near-gloss, while the rest stays rough. Same repeats as
  // the colour map so the tracks line up. roughness 1.0: the map
  // drives it (roughnessMap multiplies the scalar).
  const roadRough = makeRoadRoughnessTexture(aniso);
  roadRough.wrapT = RW;
  const roadRoughA = roadRough.clone();
  roadRoughA.needsUpdate = true;
  roadRoughA.wrapT = RW;
  roadRoughA.repeat.set(1, 75);
  const roadRoughS = roadRough.clone();
  roadRoughS.needsUpdate = true;
  roadRoughS.wrapT = RW;
  roadRoughS.repeat.set(1, 90);
  const roadMatA = new MS({ map: roadTexA, roughnessMap: roadRoughA, roughness: 1.0 });
  const roadMatS = new MS({ map: roadTexS, roughnessMap: roadRoughS, roughness: 1.0 });
  for (const x of CITY.roadLinesX) {
    // Subdivided into 4 m quads (3 x 150): one big triangle per road
    // stretched the texture into blurry patches at a grazing angle.
    const geo = new PG(12, 600, 3, 150);
    geo.rotateX(-PI / 2);
    const road = new ME(geo, roadMatA);
    road.position.set(x, 0.04, -60);
    road.receiveShadow = true;
    scene.add(road);
  }
  for (const z of CITY.roadLinesZ) {
    const geo = new PG(12, 720, 3, 180);
    geo.rotateX(-PI / 2);
    geo.rotateY(PI / 2);
    const road = new ME(geo, roadMatS);
    road.position.set(0, 0.045, z);
    road.receiveShadow = true;
    scene.add(road);
  }
  // Curbs: real 0.15 m boxes along every road edge, in segments that
  // stop at each intersection (the gaps are the crosswalks). Two
  // InstancedMeshes, one per direction — one draw call each.
  const curbMat = new MS({ color: 0xc9c2b2, roughness: 0.95, emissive: 0x2a2a2a });
  const aveSegs = [];
  for (const x of CITY.roadLinesX) {
    for (let i = 0; i < CITY.roadLinesZ.length - 1; i += 1) {
      const z0 = CITY.roadLinesZ[i] + 6;
      const z1 = CITY.roadLinesZ[i + 1] - 6;
      aveSegs.push([x - 6.18, (z0 + z1) / 2]);
      aveSegs.push([x + 6.18, (z0 + z1) / 2]);
    }
  }
  const aveCurbs = new THREE.InstancedMesh(new BX(0.35, 0.15, 48), curbMat, aveSegs.length);
  {
    const m4 = new THREE.Matrix4();
    aveSegs.forEach(([x, z], i) => {
      m4.makeTranslation(x, 0.075, z);
      aveCurbs.setMatrixAt(i, m4);
    });
  }
  scene.add(aveCurbs);
  const stSegs = [];
  for (const z of CITY.roadLinesZ) {
    for (let i = 0; i < CITY.roadLinesX.length - 1; i += 1) {
      const x0 = CITY.roadLinesX[i] + 6;
      const x1 = CITY.roadLinesX[i + 1] - 6;
      stSegs.push([(x0 + x1) / 2, z - 6.18]);
      stSegs.push([(x0 + x1) / 2, z + 6.18]);
    }
  }
  const stCurbs = new THREE.InstancedMesh(new BX(48, 0.15, 0.35), curbMat, stSegs.length);
  {
    const m4 = new THREE.Matrix4();
    stSegs.forEach(([x, z], i) => {
      m4.makeTranslation(x, 0.075, z);
      stCurbs.setMatrixAt(i, m4);
    });
  }
  scene.add(stCurbs);
  // v57 row 4: curb profile — a slightly wider, darker coping cap on
  // top of each curb, so the curb reads as a profiled edge (light
  // face, dark cap) instead of a plain box. Same segments, one draw
  // call per direction.
  const capMat = new MS({ color: 0x8a8272, roughness: 0.9 });
  const aveCaps = new THREE.InstancedMesh(new BX(0.42, 0.05, 48), capMat, aveSegs.length);
  {
    const m4 = new THREE.Matrix4();
    aveSegs.forEach(([x, z], i) => {
      m4.makeTranslation(x, 0.175, z);
      aveCaps.setMatrixAt(i, m4);
    });
  }
  scene.add(aveCaps);
  const stCaps = new THREE.InstancedMesh(new BX(48, 0.05, 0.42), capMat, stSegs.length);
  {
    const m4 = new THREE.Matrix4();
    stSegs.forEach(([x, z], i) => {
      m4.makeTranslation(x, 0.175, z);
      stCaps.setMatrixAt(i, m4);
    });
  }
  scene.add(stCaps);
  // Median barrier down the hero street (z=-180): light Jersey
  // barriers, not the dark striped band the old rail read as. Gaps at
  // every intersection so cars can turn and the zebra crosses clean.
  const medianMat = new MS({ color: 0x5e564b, roughness: 0.9 });
  // Dark grey top, not yellow: the yellow top read as a giant yellow
  // guardrail crossing the whole lower half of the sunset shot (v43),
  // where the camera looks straight down the barrier's length.
  const medianTop = new MS({ color: 0x3a3a3a, roughness: 0.7 });
  for (let i = 0; i < CITY.roadLinesX.length - 1; i += 1) {
    const x0 = CITY.roadLinesX[i] + 6;
    const x1 = CITY.roadLinesX[i + 1] - 6;
    const cx = (x0 + x1) / 2;
    box(scene, 48, 0.3, 0.5, medianMat, cx, 0.15, -180);
    box(scene, 48, 0.1, 0.3, medianTop, cx, 0.35, -180);
    col.push({ minX: x0, maxX: x1, minZ: -180.25, maxZ: -179.75 });
  }
  // Zebra crossings: opaque planes on the hero-zone intersections, so
  // the bars are crisp white on asphalt and never sort against blobs.
  const zebraTex = makeZebraTexture(aniso);
  const zebraMat = new MS({ map: zebraTex, roughness: 0.95 });
  for (const zx of [180, 240, 300]) {
    for (const zz of [-240, -180, -120]) {
      const g1 = new PG(12, 3);
      g1.rotateX(-PI / 2);
      const z1 = new ME(g1, zebraMat);
      z1.position.set(zx, 0.055, zz - 7.5);
      scene.add(z1);
      const g2 = new PG(12, 3);
      g2.rotateX(-PI / 2);
      g2.rotateY(PI / 2);
      const z2 = new ME(g2, zebraMat);
      z2.position.set(zx - 7.5, 0.055, zz);
      scene.add(z2);
    }
  }
  // Manholes.
  for (const [hx, hz] of [[120, -183], [180, -177], [237, -90], [0, -30], [60, -183], [243, 30], [-60, -177], [300, -183]]) {
    // v60 fix round (Superbot final plan, item 1): the covers were
    // 0x222222 (albedo ~0.13) and read as pure-black discs / holes in
    // the sunset foreground. Lift to 0x383838 (albedo ~0.22, the
    // reviewer's number) so they read as iron covers, not holes.
    const hole = new ME(new CG(0.55, 0.55, 0.06, 12), M(0x383838, 0.9));
    hole.position.set(hx, 0.05, hz);
    scene.add(hole);
  }
  // Traffic lights. The two hero-zone lights face south-east (PI/4)
  // so one lamp face is visible from the north cameras and the west
  // camera alike.
  for (const [tx2, tz, tr, ts] of [[8, -172, PI, 'R'], [-8, -188, 0, 'R'], [248, -174, PI / 4, 'R'], [226, -188, PI / 4, 'R'], [8, 8, PI, 'G'], [-8, -8, 0, 'R'], [248, 8, PI, 'R'], [232, -8, 0, 'G']]) {
    const tl = makeTrafficLight(ts, trafficLights.length * 5.3);
    tl.position.set(tx2, 0, tz);
    tl.rotation.y = tr;
    scene.add(tl);
    trafficLights.push(tl);
  }
  for (const [hx, hz] of [[30, 10], [-60, -40], [150, 60], [210, -30], [120, -174], [180, -186], [240, -150], [0, -174]]) {
    const hyd = makeHydrant();
    hyd.position.set(hx, 0, hz);
    scene.add(hyd);
  }
  for (const [sx, sz, st] of [[-14, -172, '限速 40'], [-2, -188, '直行'], [226, -172, '单行']]) {
    const sg = makeSign(st, '#ffffff', '#1a3a5f', 2.4, 1.2);
    sg.position.set(sx, 2.6, sz);
    scene.add(sg);
    cyl(scene, 0.05, 0.05, 2.6, 6, M(0x888888), sx, 1.3, sz);
    addBlobShadow(scene, sx, sz, 0.7, 0.7, 0.55);
  }
  for (let tx2 = -300; tx2 <= 300; tx2 += 120) {
    const tr2 = makeTree(rng);
    tr2.position.set(tx2, 0, -180 + (tx2 % 240 === 0 ? -8.5 : 8.5));
    scene.add(tr2);
  }
  for (const lx of [-360, -240, -120, 0, 120, 240, 360]) {
    for (const lz of [-360, -240, -120, 0, 120, 240]) {
      if ((lx + lz) % 240 !== 0) continue;
      const lamp = makeLamp();
      lamp.position.set(lx + 7, 0, lz + 7);
      scene.add(lamp);
    }
  }
  const stex = ['signTaxi', 'sign24h', 'signHotel', 'signBar', 'signPizza', 'signAuto'].map((k) => tx[k]).filter(Boolean);
  if (tx.neonSign) {
    for (const [nx, nz] of [[180, -168], [120, -192], [300, -168]]) {
      const n = new ME(new PG(5, 3.5), new MB({ map: tx.neonSign }));
      // v52: +0.1 m proud of the wall — coplanar, its magenta edges
      // z-fought with the facade and read as torn (Superbot v51).
      n.position.set(nx + 0.1, 5, nz);
      n.rotation.y = PI / 2;
      scene.add(n);
    }
  }

  // ---- One building block per 60 m grid cell. The district decides the fill.
  const PARK_BLOCKS = new Set(['0,0', '-60,60', '120,120', '-180,-60']);
  const MARINA_BLOCK = '180,240';
  const CHOP_BLOCK = '-240,180';
  const LIGHTHOUSE_BLOCK = '-240,-240';
  const DEALER_BLOCK = '180,-180';
  const GUN_BLOCK = '120,-240';
  const GARAGE_BLOCK = '240,0';
  const DINER_BLOCK = '0,120';
  const BANK_BLOCK = '300,-300';
  const blocks = [];
  for (let bx = -330; bx <= 330; bx += 60) {
    for (let bz = -330; bz <= 210; bz += 60) blocks.push([bx, bz]);
  }
  const tsigns = ['HOTEL', 'CASINO', 'MALL', 'BANK'];
  let tsi = 0;
  for (const [bx, bz] of blocks) {
    const key = `${bx},${bz}`;
    const district = districtAt(bx, bz);
    if (PARK_BLOCKS.has(key)) {
      const parkMat = TM(tx.grass, 4, 4);
      const park = new ME(new PG(46, 46), parkMat);
      park.rotation.x = -PI / 2;
      park.position.set(bx, 0.02, bz);
      park.receiveShadow = true;
      scene.add(park);
      for (let i = 0; i < 5; i += 1) {
        const tree = makeTree(rng);
        tree.position.set(bx + rng.range(-18, 18), 0, bz + rng.range(-18, 18));
        scene.add(tree);
      }
      for (const [ox, oz] of [[-14, 14], [14, -14]]) {
        const bench = makeBench();
        bench.position.set(bx + ox, 0, bz + oz);
        bench.rotation.y = rng.range(0, PI);
        scene.add(bench);
      }
      continue;
    }
    if (key === MARINA_BLOCK || key === CHOP_BLOCK || key === LIGHTHOUSE_BLOCK
      || key === DEALER_BLOCK || key === GUN_BLOCK || key === GARAGE_BLOCK
      || key === DINER_BLOCK || key === BANK_BLOCK) continue;
    if (district === 'PORT') {
      for (let i = 0; i < 6; i += 1) {
        const cx = bx + rng.range(-16, 10);
        const cz = bz + rng.range(-16, 10);
        const stack = rng.int(1, 2);
        for (let s = 0; s < stack; s += 1) {
          const useTex = rng.chance(0.6);
          const cont = new ME(
            new BX(6, 2.6, 2.6),
            useTex ? TM(tx.container, 2, 1, 0.8) : SM({ color: rng.pick(COLOURS.container), roughness: 0.8 }),
          );
          cont.position.set(cx, 1.3 + s * 2.6, cz);
          cont.rotation.y = rng.chance(0.5) ? 0 : PI / 2;
          cont.castShadow = true;
          if (Math.hypot(cx - 237, cz + 160) >= 5) scene.add(cont);
        }
        col.push({ minX: cx - 3.2, maxX: cx + 3.2, minZ: cz - 3.2, maxZ: cz + 3.2 });
      }
      const ww = rng.range(26, 34);
      const wd = rng.range(16, 22);
      const wh = rng.range(8, 11);
      const wm = TM(tx.metal, 3, 1, 0.9);
      box(scene, ww, wh, wd, wm, bx + 8, wh / 2, bz + 8, true);
      const saw1 = box(scene, ww + 0.4, 0.3, wd / 2 + 0.2, M(0x5a4a3a), bx + 8, wh + 0.8, bz + 8 - wd / 4);
      saw1.rotation.x = 0.18;
      const saw2 = box(scene, ww + 0.4, 0.3, wd / 2 + 0.2, M(0x5a4a3a), bx + 8, wh + 0.8, bz + 8 + wd / 4);
      saw2.rotation.x = -0.18;
      col.push({ minX: bx - 7, maxX: bx + 23, minZ: bz - 2, maxZ: bz + 18 });
      continue;
    }
    if (district === 'DOWNTOWN') {
      const w = rng.range(16, 30);
      const d = rng.range(14, 26);
      const dc = Math.hypot(bx - 210, bz + 210);
      const landmark = bx === 210 && bz === -210;
      const h = landmark ? rng.range(105, 120) : dc < 90 ? rng.range(70, 110) : dc < 170 ? rng.range(45, 75) : rng.range(25, 50);
      const x = bx + rng.range(-6, 6);
      const z = bz + rng.range(-6, 6);
      // Facade atlas (one material, UVs baked per building) instead of
      // a flat glass texture. Cell = palette x window style. The rng
      // call always runs (keeps the stream aligned); near the gunfight
      // the cell is forced to vary by grid position, so the shot-2
      // street is not one repeated orange brick (v42).
      // v51: style 0 (pane grid) only — the style-1 horizontal strip
      // windows read as flat coloured slabs with thin bands on the
      // tall towers (the "striped textures" the reviewers flagged).
      // 6 palettes still vary, so the street is not one repeated cell.
      let cell = Math.floor(rng.range(0, 6));
      if (Math.hypot(bx + 177, bz - 190) < 90) {
        const gx = Math.round(bx / 60);
        const gz = Math.round(bz / 60);
        cell = ((gx + gz) % 6 + 6) % 6;
      }
      const towerGeo = new BX(w, h, d);
      applyFacadeUVs(towerGeo, cell, w, h, d);
      const tower = new ME(towerGeo, facadeMat);
      tower.position.set(x, h / 2, z);
      tower.castShadow = true;
      tower.receiveShadow = true;
      scene.add(tower);
      towers.push({ x, z, w, d, h });
      addAOSkirt(scene, x, z, w + 1.5, d + 1.5);
      for (const [fx, fz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) box(scene, 0.7, h, 0.7, M(0x14202c, 0.4, { metalness: 0.5 }), x + fx * (w / 2 - 0.2), h / 2, z + fz * (d / 2 - 0.2));
      box(scene, w + 0.6, 0.5, d + 0.6, M(0x3a3f45), x, h - 0.25, z);
      for (const [pw, pd, px, pz] of [[w + 0.4, 0.5, 0, d / 2], [w + 0.4, 0.5, 0, -d / 2], [0.5, d + 0.4, w / 2, 0], [0.5, d + 0.4, -w / 2, 0]]) box(scene, pw, 0.8, pd, M(0x3a3f45), x + px, h + 0.4, z + pz);
      // The podium wears a storefront cell of the facade atlas (the
      // full 20 m cell compressed onto the 4.5 m base, so its sign band
      // + glass + awning read as a shop front) instead of flat concrete.
      const podGeo = new BX(w + 1.5, 4.5, d + 1.5);
      applyFacadeUVs(podGeo, rng.int(12, 15), w + 1.5, 20, d + 1.5);
      const pod = new ME(podGeo, facadeMat);
      pod.position.set(x, 2.25, z);
      pod.castShadow = true;
      pod.receiveShadow = true;
      scene.add(pod);
      let tw = w;
      let td = d;
      let ty = h;
      const tiers = h >= 60 ? 3 : h >= 35 ? 2 : 1;
      for (let t = 0; t < tiers; t += 1) {
        tw *= 0.72;
        td *= 0.72;
        const th = t === tiers - 1 ? 3 : 5;
        const tierGeo = new BX(tw, th, td);
        applyFacadeUVs(tierGeo, cell, tw, th, td);
        const tier = new ME(tierGeo, facadeMat);
        tier.position.set(x, ty + th / 2, z);
        tier.castShadow = true;
        scene.add(tier);
        box(scene, tw + 0.4, 0.5, td + 0.4, M(0x3a3f45), x, ty + th + 0.25, z);
        ty += th + 0.5;
      }
      if (rng.chance(0.3)) {
        const pyr = new ME(new CN(Math.max(tw, td) * 0.72, 4, 4), M(0x2c3e50, 0.7));
        pyr.position.set(x, ty + 2, z);
        pyr.rotation.y = PI / 4;
        scene.add(pyr);
      } else {
        if (h >= 80) box(scene, tw * 0.5, 2.5, td * 0.5, M(0xffe14d, 0.5, { emissive: 0x664400 }), x, ty + 1.25, z);
        else {
          cyl(scene, 1.2, 1.2, 2.4, 10, M(0x7a6a58, 0.9), x + tw * 0.2, ty + 1.2, z - td * 0.2, true);
          box(scene, 3, 1.5, 2, M(0x888888), x - tw * 0.2, ty + 0.75, z + td * 0.2);
        }
        cyl(scene, 0.08, 0.08, 6, 6, M(0x333333, 0.6), x + tw * 0.3, ty + 3, z + td * 0.2);
        const beacon = new ME(new SG(0.35, 8, 6), M(0xff2222, 1, { emissive: 0xaa0000 }));
        beacon.position.set(x + tw * 0.3, ty + 6.2, z + td * 0.2);
        scene.add(beacon);
      }
      // Rooftop props — AC boxes on the roof corners (outside the tier
      // footprint, visible from the air) + a water tank on one in five.
      const acCorners = [[w / 2 - 1, d / 2 - 1], [-w / 2 + 1, d / 2 - 1], [w / 2 - 1, -d / 2 + 1]];
      const acN = rng.int(1, 3);
      for (let a = 0; a < acN; a += 1) {
        const [ax, az] = acCorners[a];
        box(scene, 0.6, 0.5, 0.4, M(0xE8EBE8, 0.9), x + ax, h + 0.75, z + az, true);
      }
      if (rng.chance(0.2)) {
        cyl(scene, 0.9, 0.9, 2.0, 10, M(0x7a6a58, 0.9), x - w / 2 + 1, h + 1.5, z - d / 2 + 1, true);
      }
      if (tsi < tsigns.length && rng.chance(0.6)) {
        const sign = makeSign(tsigns[tsi], '#ffffff', '#1a1a2e', 12, 3);
        sign.position.set(x, h - 6, z + d / 2 + 0.1);
        scene.add(sign);
        tsi += 1;
      }
      col.push({ minX: x - (w + 1.5) / 2, maxX: x + (w + 1.5) / 2, minZ: z - (d + 1.5) / 2, maxZ: z + (d + 1.5) / 2 });
      continue;
    }
    if (district === 'SUBURBS') {
      const count = rng.int(2, 3);
      for (let i = 0; i < count; i += 1) {
        const w = rng.range(10, 14);
        const d = rng.range(8, 12);
        const h = rng.range(5, 8);
        const x = bx + rng.range(-14, 14);
        const z = bz + rng.range(-14, 14);
        const tex = rng.chance(0.4) ? tile(tx.plaster, 2, 1)
          : rng.chance(0.5) ? tile(tx.wood, 2, 1) : tile(tx.stucco, 2, 1);
        const house = new ME(new BX(w, h, d), SM({ map: tex, roughness: 0.95 }));
        house.position.set(x, h / 2, z);
        house.castShadow = true;
        house.receiveShadow = true;
        scene.add(house);
        const roof = new ME(
          new CN(Math.max(w, d) * 0.72, 3, 4),
          SM({ color: rng.pick([0x8a4a3a, 0x5a4a3a, 0x3a5a4a]), roughness: 1 }),
        );
        roof.position.set(x, h + 1.5, z);
        roof.rotation.y = PI / 4;
        scene.add(roof);
        const chimney = new ME(new BX(1, 1.4, 1), M(0x8a4a3a));
        chimney.position.set(x, h + 2.9, z);
        chimney.castShadow = true;
        scene.add(chimney);
        const porch = new ME(new BX(w * 0.5, 0.15, 1.2), M(0x8a6b4f));
        porch.position.set(x, 0.08, z + d / 2 + 0.6);
        scene.add(porch);
        const gardenMat = TM(tx.grass, 2, 2);
        const garden = new ME(new PG(w + 6, d + 6), gardenMat);
        garden.rotation.x = -PI / 2;
        garden.position.set(x, 0.02, z);
        scene.add(garden);
        const tree = makeTree(rng);
        tree.position.set(x + w / 2 + 3, 0, z + d / 2 + 2);
        scene.add(tree);
        col.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
      }
      continue;
    }
    // Old town (and anywhere else): brick buildings with parapets,
    // balconies, AC boxes and the occasional storefront.
    const distCentre = Math.hypot(bx, bz);
    const tall = distCentre < 130;
    const count = rng.int(1, 3);
    for (let i = 0; i < count; i += 1) {
      const w = rng.range(12, 22);
      const d = rng.range(12, 22);
      const h = tall ? rng.range(20, 55) : rng.range(8, 24);
      const x = bx + rng.range(-12, 12);
      const z = bz + rng.range(-12, 12);
      const brickTex = rng.chance(0.5) ? tx.brickBrown : tx.brick;
      const tex = tile(brickTex, Math.max(1, Math.round(w / 8)), Math.max(1, Math.round(h / 8)));
      // Facade variety: brick is only ~60% now — the rest are stucco
      // in beige, pale mint or grey-blue, so the street is not one long
      // brick wall.
      const stuccoCol = rng.pick([0xd8c9a8, 0xa8bfae, 0x7d8b96, 0xc9a878]);
      const bmat = rng.chance(0.6)
        ? SM({ map: tex, roughness: 0.9 })
        : SM({ map: tile(tx.stucco, 2, 1), color: stuccoCol, roughness: 0.95 });
      const building = box(scene, w, h, d, bmat, x, h / 2, z, true);
      building.receiveShadow = true;
      addAOSkirt(scene, x, z, w, d);
      if (rng.chance(0.5)) box(scene, 0.6, 0.5, 0.4, M(0xE8EBE8, 0.9), x + w / 4, h + 0.65, z, true);
      box(scene, w + 0.4, 0.4, d + 0.4, M(0x555a60), x, h + 0.2, z);
      for (const [pw, pd, px, pz] of [[w + 0.3, 0.4, 0, d / 2], [w + 0.3, 0.4, 0, -d / 2], [0.4, d + 0.3, w / 2, 0], [0.4, d + 0.3, -w / 2, 0]]) box(scene, pw, 0.6, pd, M(0x6a5a4a), x + px, h + 0.5, z + pz);
      if (rng.chance(0.3)) box(scene, 2.5, 1.2, 1.8, M(0x888888), x + w / 4, h + 0.8, z);
      if (h >= 14) {
        // v53: the per-floor side "fins" are DELETED — they were
        // 0.06 x 0.7 x (d*0.4) LONG HORIZONTAL bars along the side
        // walls, not vertical pilasters, and from the south camera
        // one read as a diagonal brown plank across the window bay
        // (shot 2, Quick + Superbot, severe). No rotated or long
        // horizontal bars survive on any tall building.
      }
      if (h < 16 && rng.chance(0.8)) {
        // Storefront cell, not a flat dark box — the face shot 2 sees.
        const sw = box(scene, w * 0.7, 3, 0.2, facadeMat, x, 1.5, z + d / 2 + 0.1);
        applyFacadeUVs(sw.geometry, 12, w * 0.7, 20, 0.2);
        // v47: sunk 0.35 m (y 3.4 -> 3.05).
        const awnCol = rng.pick([0xc0392b, 0x1e8449, 0xe67e22, 0x7d3c98, 0x2c3e50, 0x0066aa]);
        const awnMat = rng.chance(0.5) ? TM(tx.awning, 2, 1, 0.9) : M(awnCol, 0.85);
        const awn2 = box(scene, w * 0.75, 0.15, 2, awnMat, x, 3.05, z + d / 2 + 0.7);
        awn2.rotation.x = 0.05;
        for (const s of [-1, 1]) {
          const strut = box(scene, 0.12, 2.1, 0.12, M(0x8a8a8a, 0.9), x + s * w * 0.25, 2.78, z + d / 2 + 0.85);
          strut.rotation.x = -2.16;
        }
        // v52: two vertical posts under the awning's outer edge — the
        // diagonal struts alone left the board reading as floating.
        for (const s of [-1, 1]) box(scene, 0.1, 2.9, 0.1, M(0x2e3338, 0.7), x + s * w * 0.25, 1.45, z + d / 2 + 1.6);
        if (stex.length) {
          const sg2 = new ME(new PG(7, 1.8), new MB({ map: rng.pick(stex) }));
          sg2.position.set(x, 4.8, z + d / 2 + 0.2);
          scene.add(sg2);
        }
      }
      if (rng.chance(0.4)) cyl(scene, 1, 1, 2, 10, M(0x7a6a58, 0.9), x - w / 4, h + 1.4, z - d / 4, true);
      col.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
    }
  }

  // ---- Hero-zone dressing, signs, far skyline ----
  // 8 frond palms along the hero-zone sidewalks. The (247.5,-175) palm
  // stood in front of the BODEGA sign and its trunk hid the "BO" — it
  // sits north at -158 now. Heights vary 7-12 m, leans point different
  // ways, positions jitter — never a row of identical poles. The two
  // west palms nearest the sunset heli (z=-175, -185) are short (7 m)
  // so their crowns stay well below the heli's 8.5 m flight band.
  const heroPalmSpots = [
    [232.5, -195, 9, 1.5, 2.1], [247.5, -195, 9, 1.1, 0.9],
    [232.5, -185.5, 7, 1.0, 0.4], [250.1, -213.0, 10, 1.6, 3.3],
    [232.5, -168.5, 7, 0.8, 4.0], [247.5, -158, 8, 1.2, 5.5],
    [232.5, -155, 9, 1.8, 1.2], [246.3, -163.4, 9, 0.9, 2.8],
  ];
  for (let i = 0; i < heroPalmSpots.length; i += 1) {
    const [px, pz, ph, pl, pd] = heroPalmSpots[i];
    const palm = makeV31Palm(ph, pl, pd);
    palm.position.set(px, 0, pz);
    if (i === 3 || i === 7) palm.scale.setScalar(0.78); // v47: cut-top palms down
    scene.add(palm);
  }
  // 4 streetlights in the hero zone. The (232.5,-170) lamp stood on the
  // sunset camera's sightline to the AUTO DEALER sign and its pole hid
  // the "D" — it sits at -160 now. The (232.5,-160) lamp's pole crossed
  // the SUITES sign's "S" in the downtown shot — it sits at -150 now.
  for (const [lx, lz] of [[226.5, -190], [247.5, -190], [232.5, -150], [247.5, -170]]) {
    const lamp = makeLamp();
    lamp.position.set(lx, 0, lz);
    scene.add(lamp);
  }
  // 12 signs: the 12 towers nearest the hero-zone centre, one sign each,
  // 60-70% of the facing facade width, mounted over the entrance (y=7),
  // unlit so they read at dusk. Half on the EAST face, half on the SOUTH
  // face — all-south read only in the north-looking shots; the
  // west-looking shots saw them edge-on.
  const heroTowers = towers
    .map((t) => ({ ...t, dist: Math.hypot(t.x - HERO_ZONE.cx, t.z - HERO_ZONE.cz) }))
    .sort((a, b) => a.dist - b.dist)
    .slice(0, 12);
  heroTowers.forEach((t, i) => {
    const name = SIGN_NAMES[i % SIGN_NAMES.length];
    const bg = SIGN_COLORS[i % SIGN_COLORS.length];
    // v51: CINEMA 18 m — its tower sits ~100 m from the shot-1
    // camera, so the type read a quarter of GYM's. (v52: size is
    // perspective-correct and legible — settled, do not widen again.)
    const signW = name === 'CINEMA' ? 18 : Math.min(14, t.w * 0.8);
    const sign = makeV31Sign(name, bg, '#FFFFFF', signW, signW * 0.25);
    // v51: SUITES +0.4 m forward — stands the face proud of the wall
    // so the lamp post clears it (on top of the v48 +0.25 in
    // stageDowntown). SUITES is i=1, east face, so it applies here.
    const fwd = name === 'SUITES' ? 0.4 : 0;
    if (i % 2) {
      sign.position.set(t.x + (t.w + 1.5) / 2 + 0.15 + fwd, 7.0, t.z);
      sign.rotation.y = PI / 2;
    } else {
      sign.position.set(t.x, 7.0, t.z + (t.d + 1.5) / 2 + 0.15);
      sign.rotation.y = 0;
    }
    scene.add(sign);
  });
  // Hero shop fronts (v42): the 12 towers nearest the centre get
  // distinct ground-floor storefronts — a solid podium colour from the
  // 6-colour palette, a glowing glass panel, an awning on half of them,
  // and a prop out front. The old podium wore one atlas cell, so every
  // shop read as the same brick box. The panel/glass sit on the same
  // face as the tower's sign (east for odd i, south for even i).
  const SHOP_PALETTE = [0x8c4a3a, 0xd8c9a8, 0xa8bfae, 0xc9a878, 0x4a4a52, 0x4a4a4a];
  const SHOP_GLASS = [0xffd98a, 0x9fd8ff, 0xa8e6a0, 0xd8a8b0, 0x8a7a62, 0x8ecae6];
  const SHOP_AWN = [0xc0392b, 0x1e8449, 0xe67e22, 0x6e5a6e, 0x2c3e50, 0x0066aa];
  heroTowers.forEach((t, i) => {
    const east = i % 2 === 1;
    const panelCol = SHOP_PALETTE[i % SHOP_PALETTE.length];
    const glassCol = SHOP_GLASS[i % SHOP_GLASS.length];
    const pw = t.w + 1.5;
    const pd = t.d + 1.5;
    if (east) {
      box(scene, 0.12, 4.5, pd, M(panelCol, 0.9), t.x + pw / 2 + 0.08, 2.25, t.z);
      box(scene, 0.08, 2.2, pd * 0.6, M(glassCol, 0.3, { emissive: glassCol }), t.x + pw / 2 + 0.18, 1.6, t.z);
      // v51: upper window band — the podium above the glass (y 2.7-4.5)
      // was a blank slab (the "blank panel under BAR"). Same glass,
      // same width, at y 3.6, so every shop front reads finished.
      box(scene, 0.08, 0.9, pd * 0.6, M(glassCol, 0.3, { emissive: glassCol }), t.x + pw / 2 + 0.18, 3.6, t.z);
      // Awning with a valance lip: a 0.2-thick slab plus a hanging front
      // strip, so it reads as a real awning, not a pure black flat
      // plate (v42).
      if (i % 4 < 2) {
        box(scene, 1.4, 0.2, pd * 0.6, M(SHOP_AWN[i % SHOP_AWN.length], 0.85), t.x + pw / 2 + 0.7, 2.95, t.z); // v47: sunk 0.35
        box(scene, 0.08, 0.5, pd * 0.6, M(SHOP_AWN[i % SHOP_AWN.length], 0.85), t.x + pw / 2 + 1.36, 2.7, t.z);
        // v52: two posts under the awning's outer edge, down to the
        // sidewalk — without them the awning + glass read as a board
        // floating on the facade (Superbot v51, shot 3).
        for (const s of [-1, 1]) box(scene, 0.1, 2.9, 0.1, M(0x2e3338, 0.7), t.x + pw / 2 + 1.3, 1.45, t.z + s * pd * 0.25);
      }
    } else {
      box(scene, pw, 4.5, 0.12, M(panelCol, 0.9), t.x, 2.25, t.z + pd / 2 + 0.08);
      box(scene, pw * 0.6, 2.2, 0.08, M(glassCol, 0.3, { emissive: glassCol }), t.x, 1.6, t.z + pd / 2 + 0.18);
      // v51: upper window band, south face (see east branch above).
      box(scene, pw * 0.6, 0.9, 0.08, M(glassCol, 0.3, { emissive: glassCol }), t.x, 3.6, t.z + pd / 2 + 0.18);
      if (i % 4 < 2) {
        box(scene, pw * 0.6, 0.2, 1.4, M(SHOP_AWN[i % SHOP_AWN.length], 0.85), t.x, 2.95, t.z + pd / 2 + 0.7); // v47: sunk 0.35
        box(scene, pw * 0.6, 0.5, 0.08, M(SHOP_AWN[i % SHOP_AWN.length], 0.85), t.x, 2.7, t.z + pd / 2 + 1.36);
        // v52: two posts under the awning's outer edge (see east branch).
        for (const s of [-1, 1]) box(scene, 0.1, 2.9, 0.1, M(0x2e3338, 0.7), t.x + s * pw * 0.25, 1.45, t.z + pd / 2 + 1.3);
      }
    }
    // A prop out front (crate / bin / potted plant, cycling).
    const px = east ? t.x + pw / 2 + 1.8 : t.x + (i % 3 - 1) * 3;
    const pz = east ? t.z + (i % 3 - 1) * 3 : t.z + pd / 2 + 1.8;
    if (i % 3 === 0) box(scene, 0.8, 0.8, 0.8, M(0x8a6b4f, 0.9), px, 0.4, pz);
    else if (i % 3 === 1) cyl(scene, 0.4, 0.4, 1.0, 8, M(0x2c3e50, 0.8), px, 0.5, pz, true);
    else {
      cyl(scene, 0.3, 0.4, 0.6, 8, M(0x8a4a3a, 0.9), px, 0.3, pz, true);
      const bush = new ME(new SG(0.5, 8, 6), M(0x2f6b30, 1));
      bush.position.set(px, 0.9, pz);
      scene.add(bush);
    }
  });
  // v57 row 3 — street clutter: the five kit props, placed along the
  // hero-zone sidewalks where the four shots look. Scale and rotation
  // vary per prop; roughly one in five spots is left empty so the
  // street reads as lived-in, not a catalogue row. Positions sit on
  // the sidewalks (x ~226-252, z ~-155 to -215), clear of the road,
  // the heli band and the shot cameras.
  const propSpots = [
    ['kiosk', 246.5, -166, 0.3, 1.0],
    ['planter', 233.5, -161, 1.2, 1.0],
    ['cones', 241, -176, 0.8, 1.0],
    ['bike', 229.5, -190, -0.5, 1.05],
    ['dumpster', 252.5, -208, 2.6, 0.95],
    ['planter', 244, -210, 2.0, 1.1],
    ['cones', 228, -200, 1.6, 0.9],
    ['kiosk', 231, -214, 3.1, 1.0],
  ];
  for (let i = 0; i < propSpots.length; i += 1) {
    if (i % 5 === 4) continue; // drop one in five
    const [kind, px, pz, rot, sc] = propSpots[i];
    let prop;
    if (kind === 'kiosk') prop = makeKiosk();
    else if (kind === 'dumpster') prop = makeDumpster();
    else if (kind === 'cones') prop = makeTrafficCones();
    else if (kind === 'planter') prop = makePlanter();
    else prop = makeBikeRack();
    prop.position.set(px, 0, pz);
    prop.rotation.y = rot + rng.range(-0.15, 0.15);
    prop.scale.setScalar(sc * rng.range(0.95, 1.08));
    // v57.2: props cast real shadows (they read pasted-in without
    // one — the kiosk had bright sidewalk right up to its base).
    prop.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    scene.add(prop);
  }
  // One fire escape on tower 1's south face (its sign is on the east
  // face, so the south face is free): 3 platforms up the upper floors.
  {
    const fe = heroTowers[1];
    if (fe) {
      for (let f = 0; f < 3; f += 1) {
        box(scene, 4, 0.12, 1.0, M(0x333333, 0.7, { metalness: 0.6 }), fe.x, 6 + f * 3, fe.z + (fe.d + 1.5) / 2 + 0.6);
      }
    }
  }
  // Far skyline: 24 boxes at 450-550 m sharing 4 baked facade cells.
  scene.add(makeFarSkyline(facadeAtlas));

  // The sea: a plane south of the beach, animated by the game loop.
  const sea = new ME(new PG(900, 320), new MS({ color: COLOURS.sea, roughness: 0.25, metalness: 0.15 }));
  sea.rotation.x = -PI / 2;
  sea.position.set(0, 0.02, 460);
  scene.add(sea);
  // Beach sand between the sidewalk and the water.
  const sandMat = TM(tx.sand, 24, 2, 1);
  const sand = new ME(new PG(780, 56), sandMat);
  sand.rotation.x = -PI / 2;
  sand.position.set(0, 0.012, 274);
  scene.add(sand);

  // Marina: three docks, three boats, a sign.
  const boats = [];
  {
    const dockMat = M(0x8a6b4f);
    for (let i = 0; i < 3; i += 1) {
      const dock = new ME(new BX(4, 0.6, 26), dockMat);
      dock.position.set(186 + i * 18, 0.4, 262);
      dock.castShadow = true;
      scene.add(dock);
      const hull = new ME(
        new BX(3.4, 1.6, 9),
        SM({ color: rng.pick(COLOURS.car), roughness: 0.6 }),
      );
      hull.position.set(186 + i * 18, 0.9, 274);
      hull.castShadow = true;
      scene.add(hull);
      boats.push(hull);
      const mast = new ME(new CG(0.12, 0.12, 7, 6), M(0xdddddd, 0.6));
      mast.position.set(186 + i * 18, 5, 274);
      scene.add(mast);
    }
    const sign = makeSign('MARINA', '#ffffff', '#1a5f8a');
    sign.position.set(210, 5, 244);
    scene.add(sign);
  }
  // Chop shop.
  {
    const shop = new ME(new BX(30, 8, 20), M(0x7a6a58));
    shop.position.set(-210, 4, 210);
    shop.castShadow = true;
    shop.receiveShadow = true;
    scene.add(shop);
    const sign = makeSign('CHOP SHOP', '#ffe14d', '#222222');
    sign.position.set(-210, 9.5, 199);
    scene.add(sign);
    col.push({ minX: -225, maxX: -195, minZ: 200, maxZ: 220 });
  }
  // Striped lighthouse: base + 4 alternating segments + lamp + cap.
  {
    const base = new ME(new CG(9, 11, 1.5, 16), M(0x9aa0a3));
    base.position.set(-216, 0.75, -216);
    base.castShadow = true;
    scene.add(base);
    const towerMat = SM({ map: tile(tx.marble, 3, 1), roughness: 0.8 });
    const stripeMat = M(0xd21f2b, 0.8);
    for (let i = 0; i < 4; i += 1) {
      const seg = new ME(
        new CG(3.4 - i * 0.3, 3.7 - i * 0.3, 6.5, 12),
        i % 2 === 0 ? towerMat : stripeMat,
      );
      seg.position.set(-216, 1.5 + 3.25 + i * 6.5, -216);
      seg.castShadow = true;
      scene.add(seg);
    }
    const lamp = new ME(new BX(4, 3, 4), M(0xffe14d, 0.4, { emissive: 0xaa8800 }));
    lamp.position.set(-216, 29.5, -216);
    scene.add(lamp);
    const cap = new ME(new CN(3.4, 2.5, 12), M(0x222222, 0.8));
    cap.position.set(-216, 32.2, -216);
    scene.add(cap);
    col.push({ minX: -227, maxX: -205, minZ: -227, maxZ: -205 });
  }
  // The five shops. Each wears a storefront cell of the facade atlas
  // instead of a flat colour — the flat dealer box read as one
  // untextured grey slab. h=20 so the UVs span the full storefront cell.
  let shopCell = 12;
  function shopFront(bx, bz, w, h, d, color, signText, signFg, signBg) {
    const sg = new BX(w, h, d);
    applyFacadeUVs(sg, shopCell, w, 20, d);
    shopCell = shopCell === 15 ? 12 : shopCell + 1;
    const shop = new ME(sg, facadeMat);
    shop.position.set(bx, h / 2, bz);
    shop.castShadow = true;
    shop.receiveShadow = true;
    scene.add(shop);
    const sign = makeSign(signText, signFg, signBg);
    sign.position.set(bx, h + 1.25, bz - d / 2 - 0.1);
    sign.rotation.y = PI;
    scene.add(sign);
    // v47: sunk 0.35 m (y 3.2 -> 2.85).
    const awning = new ME(new BX(w * 0.6, 0.15, 2), M(0x2c3e50, 0.9));
    awning.position.set(bx, 2.85, bz - d / 2 - 0.6);
    awning.rotation.x = 0.08;
    awning.castShadow = true;
    scene.add(awning);
    for (const sx of [-1, 1]) {
      const strut = new ME(new BX(0.12, 2.1, 0.12), M(0x8a8a8a, 0.9));
      strut.position.set(bx + sx * w * 0.2, 2.6, bz - d / 2 - 0.8);
      strut.rotation.x = 2.13;
      scene.add(strut);
    }
    const door = new ME(new BX(2, 3, 0.2), M(0x222222, 0.7));
    door.position.set(bx, 1.5, bz - d / 2 - 0.05);
    scene.add(door);
    col.push({ minX: bx - w / 2, maxX: bx + w / 2, minZ: bz - d / 2, maxZ: bz + d / 2 });
  }
  shopFront(210, -150, 24, 7, 16, 0x4a6a8a, 'AUTO DEALER', '#ffffff', '#1a3a5f');
  shopFront(150, -210, 16, 6, 12, 0x5a4a3a, 'GUN SHOP', '#ffe14d', '#222222');
  shopFront(270, 30, 20, 7, 14, 0x6a6a6a, 'GARAGE', '#ffffff', '#333333');
  shopFront(30, 150, 18, 6, 12, 0xc98a5a, 'DINER', '#ffffff', '#7a3a1a');
  shopFront(330, -270, 22, 14, 16, 0x8a8a9a, 'BANK', '#ffffff', '#2a4a6a');
  // Port cranes.
  for (const cx of [-330, -270]) {
    const mast = new ME(new BX(3, 42, 3), M(0xd8a020, 0.7));
    mast.position.set(cx, 21, -350);
    mast.castShadow = true;
    scene.add(mast);
    const arm = new ME(new BX(34, 2, 2), M(0xd8a020, 0.7));
    arm.position.set(cx + 12, 40, -350);
    scene.add(arm);
    const hook = new ME(new BX(2, 2, 2), M(0x333333, 0.8));
    hook.position.set(cx + 24, 34, -350);
    scene.add(hook);
  }
  // Lamp rows along the avenues and the beachfront.
  for (let z = -360; z <= 240; z += 60) {
    for (const side of [-8.5, 8.5]) {
      const lamp = makeLamp();
      lamp.position.set(side, 0, z);
      scene.add(lamp);
    }
  }
  for (let x = -360; x <= 360; x += 60) {
    const lamp = makeLamp();
    lamp.position.set(x, 0, 248.5);
    scene.add(lamp);
  }
  const boards = [
    ['SOLARA BAY', '#ffd94d', '#1a2a3a', 60, 60],
    ['COMET GT', '#ffffff', '#8a1a1a', -60, -60],
    ['CASINO', '#ffe14d', '#2a1a4a', 300, 0],
    ['MARINA', '#ffffff', '#1a5f8a', 0, -300],
  ];
  for (const [text, fg, bg, x, z] of boards) {
    const board = makeBillboard(text, fg, bg);
    board.position.set(x + 12, 0, z + 12);
    board.rotation.y = PI / 4;
    scene.add(board);
  }
  // Bus stops: bench + sign + shelter + route board. Both signs sit
  // on their own posts now — the BUS sign (y=2.2) and the route board
  // (y=1.7) had no support and read as two green panels floating in
  // mid-air in the downtown shot (v43).
  for (const stop of landmarks.busStops) {
    const bench = makeBench();
    bench.position.set(stop.x, 0, stop.z);
    scene.add(bench);
    const sign = makeSign('BUS', '#ffffff', '#2a6a3a', 3.0, 1.5);
    // v54: 0.3 m north (stop.z + 0.3) — the sign's right edge covered
    // the ROUTES board's R at (811,356); the board's own 0.3 m shift
    // only half-freed it. The post moves with the sign.
    sign.position.set(stop.x, 2.2, stop.z + 0.3);
    scene.add(sign);
    const signPost = new ME(new CG(0.12, 0.12, 1.5, 6), M(0x2e3338, 0.7));
    signPost.position.set(stop.x, 0.75, stop.z + 0.3);
    scene.add(signPost);
    const shelterMat = M(0x2a6a3a, 0.8);
    // v54: right post inset to +0.6 (was +1.2) — it stood at screen
    // ~828, inside the ROUTES word, hiding the R (and O/U before the
    // board shift). At +0.6 it sits in the margin before the R and
    // the whole word reads; it stays under the 3 m roof.
    for (const dx of [-1.2, 0.6]) {
      const post = new ME(new CG(0.12, 0.12, 2.6, 6), shelterMat);
      post.position.set(stop.x + dx, 1.3, stop.z - 0.5);
      scene.add(post);
    }
    const shelterRoof = new ME(new BX(3, 0.12, 1.6), shelterMat);
    shelterRoof.position.set(stop.x, 2.7, stop.z - 0.5);
    shelterRoof.castShadow = true;
    scene.add(shelterRoof);
    // Route board, bigger (3.2x1.4) so it reads at distance, not a
    // clipped tiny blue sign (v42 shot 4).
    // v51: English — the CJK glyphs rendered garbled/overlapping in
    // the headless renderer (no CJK font), so the board read as
    // broken marks. Same weight, size and baseline as before.
    const rb = makeSign('ROUTES 1 · 5 · 12', '#ffffff', '#1a3a5f', 3.2, 1.4);
    // v54: 0.5 m north in total (z -1.2 -> -1.7) — the BUS sign's
    // right edge covered the R, and 0.3 m only half-freed it; the
    // shelter post then covered O/U. At -1.7 the R clears the post
    // (1 px nick) and the whole word reads. The board's own post
    // moves with it so it stays supported.
    rb.position.set(stop.x, 1.7, stop.z - 1.7);
    scene.add(rb);
    const rbPost = new ME(new CG(0.06, 0.06, 1.1, 6), M(0x2e3338, 0.7));
    rbPost.position.set(stop.x, 0.55, stop.z - 1.7);
    scene.add(rbPost);
  }
  // The five green collectible packages.
  const collectibleMeshes = [];
  for (const spot of landmarks.collectibles) {
    const gem = new ME(
      new OG(0.7),
      M(0x33dd66, 0.3, { emissive: 0x228833 }),
    );
    gem.position.set(spot.x, 1.5, spot.z);
    scene.add(gem);
    collectibleMeshes.push(gem);
  }
  // Beach palms: one row on the sand, two rows flanking the beach road.
  for (let x = -260; x <= 260; x += 26) {
    const palm = makePalm(rng);
    palm.position.set(x, 0, 250);
    scene.add(palm);
  }
  for (let z = -240; z <= 240; z += 40) {
    for (const side of [-8.5, 8.5]) {
      const palm = makePalm(rng);
      palm.position.set(side, 0, z);
      scene.add(palm);
    }
  }
  // Beach umbrellas.
  for (let i = 0; i < 8; i += 1) {
    const x = -220 + i * 62;
    const pole = new ME(new CG(0.08, 0.08, 2.6, 6), M(0xdddddd, 0.8));
    pole.position.set(x, 1.3, 262);
    const top = new ME(
      new CN(2.4, 1.2, 8),
      SM({ color: rng.pick([0xe74c3c, 0xf1c40f, 0x2e86c1, 0x16a085]), roughness: 0.9 }),
    );
    top.position.set(x, 3, 262);
    top.castShadow = true;
    scene.add(pole, top);
    addBlobShadow(scene, x, 262, 1.2, 1.2, 0.32);
  }
  // Distant hills north of the city.
  for (const [rx, rr, rh] of [[-520, 85, 14], [480, 70, 11]]) {
    const ridge = new ME(new CN(rr, rh, 7), M(0x8a9aa8));
    ridge.position.set(rx, 0, -640);
    scene.add(ridge);
  }
  // No clouds — the hard-edged white ellipsoids read as floating rocks.
  // The sky dome + sun + far skyline carry the atmosphere now.
  const clouds = [];
  return { colliders: col, landmarks, sea, boats, clouds, collectibleMeshes, trafficLights, towers };
}

// Push a circle (pos, radius) out of every overlapping AABB collider.
// Returns true if anything was pushed.
export function resolveBuildingCollision(pos, radius, colliders) {
  let hit = false;
  for (const c of colliders) {
    const minX = c.minX - radius;
    const maxX = c.maxX + radius;
    const minZ = c.minZ - radius;
    const maxZ = c.maxZ + radius;
    if (pos.x > minX && pos.x < maxX && pos.z > minZ && pos.z < maxZ) {
      const pushLeft = pos.x - minX;
      const pushRight = maxX - pos.x;
      const pushBack = pos.z - minZ;
      const pushFront = maxZ - pos.z;
      const smallest = Math.min(pushLeft, pushRight, pushBack, pushFront);
      if (smallest === pushLeft) pos.x = minX;
      else if (smallest === pushRight) pos.x = maxX;
      else if (smallest === pushBack) pos.z = minZ;
      else pos.z = maxZ;
      hit = true;
    }
  }
  return hit;
}
