import * as THREE from 'three';
import{BX,CG,CN,PG,SG,MS,MB,ME,GP,PI,RW,SC,CT,OG,DS}from'./geo.js';
import { CITY, COLOURS, DETAIL, TEXTURES, districtAt } from './config.js';
import {
  makeFacadeAtlas, applyFacadeUVs, makeV31Sign, SIGN_NAMES, SIGN_COLORS,
  makeV31Palm, makeRoadMarkingTexture, makeTrafficLightV31, makeFarSkyline,
  makeRidge, makeSeaGradient, addBlobShadow, addAOSkirt, inHeroZone, HERO_ZONE,
} from './v31.js';
const SM=(o)=>new MS(o);
function tile(tex, rx, ry) {
  const t = tex.clone();
  t.needsUpdate = true;
  t.repeat.set(rx, ry);
  return t;
}
const _mats = new Map();
function M(color, rough = 1, extra = {}) {
  const k = `${color}|${rough}|${extra.metalness ?? 0}|${extra.emissive ?? 0}`;
  let m = _mats.get(k);
  if (!m) { m = SM({color, roughness: rough, ...extra}); _mats.set(k, m); }
  return m;
}
const TM=(t,rx,ry,r=1)=>SM({map:tile(t,rx,ry),roughness:r});
function box(parent, w, h, d, material, x, y, z, shadow = false) {
  const m = new ME(new BX(w, h, d), material);
  m.position.set(x, y, z);
  if (shadow) m.castShadow = true;
  parent.add(m);
  return m;
}
function cyl(parent, rt, rb, h, seg, material, x, y, z, shadow = false) {
  const m = new ME(new CG(rt, rb, h, seg), material);
  m.position.set(x, y, z);
  if (shadow) m.castShadow = true;
  parent.add(m);
  return m;
}
function fallbackTexture(hex, size = 128) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = hex;
  ctx.fillRect(0, 0, size, size);
  const tex = new CT(canvas);
  tex.colorSpace = SC;
  return tex;
}
export async function loadCityTextures() {
  const loader = new THREE.TextureLoader();
  const out = {};
  const jobs = [
    ['glass', '#7fa8c9'], ['brick', '#9a5a44'], ['stucco', '#e8dcc8'], ['asphalt', '#3a3f45'],
    ['sidewalk', '#b9b3a4'], ['grass', '#6fae5e'], ['sand', '#e8d49a'], ['container', '#2e86c1'],
    ['concrete', '#9a9a9a'], ['wood', '#8a6a44'], ['cobble', '#7a7a7a'], ['redPaint', '#d21f2b'],
    ['taxiPaint', '#f1c40f'], ['fireball', '#ff8800'], ['smoke', '#888888'], ['marble', '#e8e8e8'],
    ['glassDark', '#3a5a7a'], ['brickBrown', '#7a4a34'], ['plaster', '#e8dcc8'], ['metal', '#8a6a58'],
    ['awning', '#c0392b'], ['signTaxi', '#111111'], ['sign24h', '#111111'],
    ['signHotel', '#111111'], ['signBar', '#111111'], ['signPizza', '#111111'], ['signAuto', '#111111'],
    ['sunsetSky', '#ff8844'], ['neonSign', '#ff2d95'], ['pool', '#ffffff'], ['skid', '#222222'], ['shadow', '#000000'],
  ];
  await Promise.all(jobs.map(async ([key, hex]) => {
    try {
      const tex = await loader.loadAsync(TEXTURES[key]);
      tex.wrapS = RW;
      tex.wrapT = RW;
      tex.colorSpace = SC;
      tex.anisotropy = 8;
      out[key] = tex;
    } catch {
      const tex = fallbackTexture(hex);
      tex.wrapS = RW;
      tex.wrapT = RW;
      out[key] = tex;
    }
  }));
  return out;
}
const PARK_BLOCKS = new Set(['-150,-150', '150,-150', '-150,150', '270,150']);
const MARINA_BLOCK = '210,210';
const CHOP_BLOCK = '-210,210';
const LIGHTHOUSE_BLOCK = '-210,-210';
const DEALER_BLOCK = '210,-150';
const GUN_BLOCK = '150,-210';
const GARAGE_BLOCK = '270,30';
const DINER_BLOCK = '30,150';
const BANK_BLOCK = '330,-270';
function makeSign(text, fg, bg, w = 10, h = 2.5) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 256, 64);
  ctx.fillStyle = fg;
  ctx.font = 'bold 34px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 128, 34);
  const tex = new CT(canvas);
  tex.colorSpace = SC;
  const g = new GP(), f = new ME(new PG(w, h), SM({ map: tex }));
  f.position.z = .09;
  g.add(new ME(new BX(w, h, .16), M(0x1a1a1a)), f);
  return g;
}
function makePalm(rng) {
  const group = new GP();
  const trunkMat = M(0x8a6b4f);
  const leafMat = M(0x2e8b57);
  const trunk = new ME(new CG(0.18, 0.3, 5, 6), trunkMat);
  trunk.position.y = 2.5;
  trunk.rotation.z = rng.range(-0.08, 0.08);
  group.add(trunk);
  for (let i = 0; i < 6; i += 1) {
    const leaf = new ME(new SG(0.9, 8, 6), leafMat);
    const angle = (i / 6) * PI * 2;
    leaf.position.set(Math.cos(angle) * 1.1, 5.3, Math.sin(angle) * 1.1);
    leaf.scale.set(1.3, 0.55, 1.3);
    group.add(leaf);
  }
  group.traverse((o) => {
    if (o.isMesh) o.castShadow = true;
  });
  addBlobShadow(group, 0, 0, 1.6, 1.6, 0.55);
  return group;
}
function makeTree(rng) {
  const group = new GP();
  const trunk = new ME(
    new CG(0.2, 0.32, 2.4, 8),
    M(0x6b4a2f),
  );
  trunk.position.y = 1.2;
  trunk.rotation.z = rng.range(-0.07, 0.07);
  group.add(trunk);
  const greens = [0x2f7a44, 0x3e8f4f, 0x55a566];
  const sizes = [rng.range(1.6, 2.1), rng.range(1.1, 1.5), rng.range(0.7, 1.0)];
  const heights = [3.1, 4.4, 5.4];
  const offsets = [[0, 0], [0.55, 0.35], [-0.45, -0.3]];
  for (let i = 0; i < 3; i += 1) {
    const puff = new ME(
      new THREE.IcosahedronGeometry(sizes[i], 1),
      SM({ color: greens[i], roughness: 1 }),
    );
    puff.position.set(offsets[i][0] * DETAIL.ts * 2, heights[i], offsets[i][1] * DETAIL.ts * 2);
    group.add(puff);
  }
  // v31: blob shadow so trees stop floating (the shadow pass flagged all 24).
  addBlobShadow(group, 0, 0, 1.8, 1.8, 0.55);
  return group;
}
function makeTrafficLight(state, phase = 0) {
  // v31: proper state machine — exactly ONE lamp lit, always.
  return makeTrafficLightV31(state, phase);
}
function makeHydrant() {
  const group = new GP();
  const red = M(0xc0392b,0.6);
  const body = new ME(new CG(0.22, 0.26, 0.7, 10), red);
  body.position.y = 0.35;
  group.add(body);
  const cap = new ME(new SG(0.22, 10, 8), red);
  cap.position.y = 0.75;
  group.add(cap);
  const nozzle = new ME(new CG(0.09, 0.09, 0.3, 8), red);
  nozzle.rotation.z = PI / 2;
  nozzle.position.set(0.25, 0.4, 0);
  group.add(nozzle);
  addBlobShadow(group, 0, 0, 0.9, 0.9, 0.55);
  return group;
}
function makeLamp() {
  const group = new GP();
  const pole = new ME(
    new CG(0.09, 0.12, 5.5, 6),
    M(0x2c3e50,0.7),
  );
  pole.position.y = 2.75;
  pole.castShadow = true;
  const head = new ME(
    new BX(0.9, 0.25, 0.35),
    M(0xffe9a8,0.4,{emissive:0xaa8800}),
  );
  head.position.y = 5.5;
  const bulb = new ME(
    new SG(0.18, 10, 8),
    M(0xfff6c0,0.3,{emissive:0xcc9900}),
  );
  bulb.position.y = 5.3;
  group.add(pole, head, bulb);
  addBlobShadow(group, 0, 0, 1.0, 1.0, 0.55);
  return group;
}
function makeBench() {
  const group = new GP();
  const wood = M(0x8a6b4f);
  const seat = new ME(new BX(2.2, 0.12, 0.6), wood);
  seat.position.y = 0.5;
  const back = new ME(new BX(2.2, 0.7, 0.1), wood);
  back.position.set(0, 0.9, -0.28);
  group.add(seat, back);
  addBlobShadow(group, 0, 0, 2.4, 1.0, 0.32);
  return group;
}
function makeBillboard(text, fg, bg) {
  const group = new GP();
  const poleMat = M(0x555a60,0.8);
  for (const dx of [-4, 4]) {
    const pole = new ME(new CG(0.25, 0.25, 7, 6), poleMat);
    pole.position.set(dx, 3.5, 0);
    group.add(pole);
  }
  const frame = new ME(
    new BX(12.6, 3.6, 0.3),
    M(0x222222,0.8),
  );
  frame.position.y = 8.5;
  group.add(frame);
  const face = makeSign(text, fg, bg, 12, 3);
  face.position.set(0, 8.5, 0.2);
  group.add(face);
  // v31: blob shadow so the billboard poles stop floating.
  addBlobShadow(group, 0, 0, 13, 3, 0.32);
  return group;
}
export function buildCity(scene, rng, tx = {}) {
  const col = [];
  const towers = [];
  const trafficLights = [];
  // v31: one facade atlas + one shared material for every tower.
  const facadeAtlas = makeFacadeAtlas();
  const facadeMat = SM({ map: facadeAtlas, roughness: 0.9 });
  const landmarks = {
    plaza: { x: 0, z: 12 },
    clientSpot: { x: 6, z: 12 },
    marina: { x: 210, z: 258 },
    chopShop: { x: -210, z: 194 },
    lighthouse: { x: -216, z: -200 },
    cometSpot: { x: -180, z: 66 },
    packageSpot: { x: -204, z: 194 },
    dealer: { x: 210, z: -126 },
    gunShop: { x: 150, z: -186 },
    garage: { x: 270, z: 54 },
    diner: { x: 30, z: 174 },
    bank: { x: 330, z: -246 },
    armoredSpot: { x: 318, z: -240 },
    portDeliver: { x: -300, z: -288 },
    taxiStand: { x: 12, z: 18 },
    collectibles: [
      { x: 120, z: -300 },
      { x: -330, z: -270 },
      { x: 300, z: 120 },
      { x: 180, z: 258 },
      { x: -150, z: -150 },
    ],
    race: [
      { x: 0, z: -360 },
      { x: 360, z: -60 },
      { x: 300, z: 240 },
      { x: -360, z: 180 },
    ],
    busStops: [
      { x: 7.5, z: 60 },
      { x: -127.5, z: -120 },
      { x: 247.5, z: 120 },
      { x: 7.5, z: -172 },
    ],
  };
  const ground = new ME(
    new PG(CITY.halfSize * 2 + 400, CITY.halfSize * 2 + 400),
    SM({ color: COLOURS.ground, roughness: 1 }),
  );
  ground.rotation.x = -PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  const beachMat = TM(tx.sand, 20, 2);
  const beach = new ME(new PG(560, 60), beachMat);
  beach.rotation.x = -PI / 2;
  beach.position.set(0, 0.03, 276);
  beach.receiveShadow = true;
  scene.add(beach);
  {
    const plaza = new ME(new PG(24, 24), TM(tx.cobble, 3, 3));
    plaza.rotation.x = -PI / 2;
    plaza.position.set(0, 0.04, 12);
    plaza.receiveShadow = true;
    scene.add(plaza);
  }
  const sea = new ME(
    new PG(1200, 600),
    SM({ map: makeSeaGradient(), roughness: 0.3, metalness: 0.1 }),
  );
  sea.rotation.x = -PI / 2;
  sea.position.set(0, 0.02, 600);
  scene.add(sea);
  const roadMat = TM(tx.asphalt, 20, 1);
  const walkMat = TM(tx.sidewalk, 60, 1);
  const markTex = makeRoadMarkingTexture();
  const roadLenX = 780;
  const roadLenZ = 660;
  for (const line of CITY.roadLinesX) {
    const strip = new ME(new PG(roadLenZ, CITY.roadWidth), roadMat);
    strip.rotation.x = -PI / 2;
    strip.rotation.z = PI / 2;
    strip.position.set(line, 0.05, -60);
    strip.receiveShadow = true;
    scene.add(strip);
    for (const side of [-1, 1]) {
      const walk = new ME(new PG(roadLenZ, 3), walkMat);
      walk.rotation.x = -PI / 2;
      walk.rotation.z = PI / 2;
      walk.position.set(line + side * (CITY.roadWidth / 2 + 1.5), 0.06, -60);
      scene.add(walk);
    }
    // v31: double yellow centre + white lane dashes, ONE texture on the
    // road plane (2m on / 2m off), not separate geometry.
    const marking = new ME(
      new PG(roadLenZ, CITY.roadWidth),
      new MB({ map: tile(markTex, roadLenZ / 4, 1), transparent: true, depthWrite: false }),
    );
    marking.rotation.x = -PI / 2;
    marking.rotation.z = PI / 2;
    marking.position.set(line, 0.06, -60);
    scene.add(marking);
  }
  for (const line of CITY.roadLinesZ) {
    const strip = new ME(new PG(roadLenX, CITY.roadWidth), roadMat);
    strip.rotation.x = -PI / 2;
    strip.position.set(0, 0.05, line);
    strip.receiveShadow = true;
    scene.add(strip);
    for (const side of [-1, 1]) {
      const walk = new ME(new PG(roadLenX, 3), walkMat);
      walk.rotation.x = -PI / 2;
      walk.position.set(0, 0.06, line + side * (CITY.roadWidth / 2 + 1.5));
      scene.add(walk);
    }
    const marking = new ME(
      new PG(roadLenX, CITY.roadWidth),
      new MB({ map: tile(markTex, roadLenX / 4, 1), transparent: true, depthWrite: false }),
    );
    marking.rotation.x = -PI / 2;
    marking.position.set(0, 0.06, line);
    scene.add(marking);
  }
  const cv=(w,h,f)=>{const c=document.createElement('canvas');c.width=w;c.height=h;f(c.getContext('2d'));const t=new CT(c);t.colorSpace=SC;t.wrapS=t.wrapT=RW;return t;};
  const zebra=cv(128,64,(x)=>{x.fillStyle='#5a5a52';for(let i=0;i<6;i++)x.fillRect(8+i*20,4,10,42);x.fillRect(0,54,128,8);});
  const arrow=cv(64,64,(x)=>{x.fillStyle='#b0b0a6';x.fillRect(26,34,12,26);x.beginPath();x.moveTo(32,4);x.lineTo(52,30);x.lineTo(12,30);x.closePath();x.fill();});
  const railT=cv(64,32,(x)=>{x.fillStyle='#565b60';x.fillRect(0,0,64,32);x.fillStyle='#3a3e44';for(let i=0;i<8;i++)x.fillRect(1+i*8,0,6,32);x.fillStyle='#2c2f34';x.fillRect(0,0,64,5);x.fillRect(0,27,64,5);});
  const flat=(w,d,m,x,z,rz=0,y=0.08)=>{const p=new ME(new PG(w,d),m);p.rotation.x=-PI/2;p.rotation.z=rz;p.position.set(x,y,z);scene.add(p);};
  const zebraM=new MB({map:zebra,transparent:true});
  const arrowM=new MB({map:arrow,transparent:true});
  const lineM=new MB({color:0x3a3a34});
  for(const [ix,iz] of [[0,-180],[120,-180],[180,-180],[240,-180],[240,-120],[240,0],[0,0],[60,-180]]){flat(4.5,12,zebraM,ix+9,iz,0,0.09);flat(4.5,12,zebraM,ix,iz-9,PI/2,0.09);flat(1.2,6,lineM,ix+15,iz-3,0,.09);}
  for(const [ax,az,ar] of [[60,-180,-PI/2],[180,-180,-PI/2],[-120,-180,PI/2],[0,120,0]])flat(2.2,4,arrowM,ax,az,ar);
  for(const [cx,cz,az] of [[240,-60,1],[0,-180,0],[0,-60,1]]){
    const L=az?660:780;
    for(const s of [-1,1]){
      flat(az?0.18:L,az?L:0.18,lineM,cx+(az?s*5.7:0),cz+(az?0:s*5.7));
      box(scene,az?0.4:L,0.18,az?L:0.4,M(0x8a8478),cx+(az?s*6.3:0),0.09,cz+(az?0:s*6.3));
    }
  }
  const rail=(x1,z1,x2,z2)=>{
    const L=Math.hypot(x2-x1,z2-z1);
    const p=new ME(new PG(L,0.5),new MB({map:tile(railT,L/2,1),transparent:true,side:DS}));
    p.position.set((x1+x2)/2,0.45,(z1+z2)/2);p.rotation.y=x1===x2?PI/2:0;scene.add(p);
  };
  for(let x=-330;x<330;x+=60)if(x!==240&&x!==180)rail(x+14,-180,x+30,-180);
  // v31 defect (d): the x=240 rail ran down the MIDDLE of the road the
  // chase van drives (x=243), a plank across shot 1.
  // v33: the east-curb rail sat 4.4m in front of the shot-4 camera and
  // filled its bottom quarter — moved to the WEST curb (x=233.5).
  for(let z=-330;z<240;z+=60)rail(233.5,z+14,233.5,z+30);
  for(let x=-330;x<330;x+=60)if(x!==240&&x!==180){col.push({minX:x+14,maxX:x+23,minZ:-180.3,maxZ:-179.7});col.push({minX:x+23,maxX:x+30,minZ:-180.3,maxZ:-179.7});}
  for(let z=-330;z<240;z+=60){col.push({minX:233.2,maxX:233.8,minZ:z+14,maxZ:z+23});col.push({minX:233.2,maxX:233.8,minZ:z+23,maxZ:z+30});}
  for(const [hx,hz] of [[120,-183],[180,-177],[237,-90],[0,-30],[60,-183],[243,30],[-60,-177],[300,-183]]){
    const hole=new ME(new CG(0.55,0.55,0.06,12),M(0x222222,0.9));
    hole.position.set(hx,0.09,hz);scene.add(hole);
  }
  // v32: the two hero-zone lights face south-east (PI/4) so one lamp face
  // is visible from both the north cameras (shots 1, 3) and the west
  // camera (shot 3 looks west from the east) — the old PI/PI/2 left the
  // [248,-174] light showing its blank side to the shot-3 camera.
  for(const [tx,tz,tr,ts] of [[8,-172,PI,'R'],[-8,-188,0,'R'],[248,-174,PI/4,'R'],[232,-188,PI/4,'R'],[8,8,PI,'G'],[-8,-8,0,'R'],[248,8,PI,'R'],[232,-8,0,'G']]){
    const tl=makeTrafficLight(ts, trafficLights.length * 5.3);tl.position.set(tx,0,tz);tl.rotation.y=tr;scene.add(tl);trafficLights.push(tl);
  }
  for(const [hx,hz] of [[30,10],[-60,-40],[150,60],[210,-30],[120,-174],[180,-186],[240,-150],[0,-174]]){
    const hyd=makeHydrant();hyd.position.set(hx,0,hz);scene.add(hyd);
  }
  for(const [sx,sz,st] of [[-14,-172,'限速 40'],[-2,-188,'直行'],[226,-172,'单行']]){
    const sg=makeSign(st,'#ffffff','#1a3a5f',2.4,1.2);sg.position.set(sx,2.6,sz);scene.add(sg);
    cyl(scene,0.05,0.05,2.6,6,M(0x888888),sx,1.3,sz);
    // v31: blob shadow under the road-sign post so it stops floating.
    addBlobShadow(scene, sx, sz, 0.7, 0.7, 0.55);
  }
  for(let tx2=-300;tx2<=300;tx2+=120){
    const tr2=makeTree(rng);tr2.position.set(tx2,0,-180+(tx2%240===0?-8.5:8.5));scene.add(tr2);
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
  if (tx.neonSign) for (const [nx, nz] of [[180, -168], [120, -192], [300, -168]]) {
    const n = new ME(new PG(5, 3.5), new MB({ map: tx.neonSign }));
    n.position.set(nx, 5, nz); n.rotation.y = PI / 2; scene.add(n);
  }
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
      park.position.set(bx, 0.07, bz);
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
          scene.add(cont);
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
      // v31: facade atlas (one material, UVs baked per building) instead of
      // the flat glass texture. Cell = palette x window style.
      const cell = Math.floor(rng.range(0, 12));
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
      // v32: the podium wears a storefront cell of the facade atlas (the
      // full 20m cell compressed onto the 4.5m base, so its sign band +
      // glass + awning read as a shop front) instead of flat grey
      // concrete. The separate dark band + awning are gone — the texture
      // already carries them. The neon sign is gone too: it sat at the
      // same height as the v31 signs and read as a fragment beside them.
      const podGeo = new BX(w + 1.5, 4.5, d + 1.5);
      applyFacadeUVs(podGeo, rng.int(12, 15), w + 1.5, 20, d + 1.5);
      const pod = new ME(podGeo, facadeMat);
      pod.position.set(x, 2.25, z);
      pod.castShadow = true;
      pod.receiveShadow = true;
      scene.add(pod);
      let tw = w, td = d, ty = h;
      const tiers = h >= 60 ? 3 : h >= 35 ? 2 : 1;
      for (let t = 0; t < tiers; t += 1) {
        tw *= 0.72; td *= 0.72;
        const th = t === tiers - 1 ? 3 : 5;
        // v31: tiers use the facade atlas too (glassTex is gone).
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
        const beacon = new ME(new SG(0.35, 8, 6), M(0xff2222,1,{emissive:0xaa0000}));
        beacon.position.set(x + tw * 0.3, ty + 6.2, z + td * 0.2);
        scene.add(beacon);
      }
      // v31: rooftop props — AC boxes on the roof corners (outside the
      // tier footprint, visible from the air) + a water tank on one in five.
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
        const chimney = new ME(
          new BX(1, 1.4, 1),
          M(0x8a4a3a),
        );
        chimney.position.set(x, h + 2.9, z);
        chimney.castShadow = true;
        scene.add(chimney);
        const porch = new ME(
          new BX(w * 0.5, 0.15, 1.2),
          M(0x8a6b4f),
        );
        porch.position.set(x, 0.08, z + d / 2 + 0.6);
        scene.add(porch);
        const gardenMat = TM(tx.grass, 2, 2);
        const garden = new ME(new PG(w + 6, d + 6), gardenMat);
        garden.rotation.x = -PI / 2;
        garden.position.set(x, 0.04, z);
        scene.add(garden);
        const tree = makeTree(rng);
        tree.position.set(x + w / 2 + 3, 0, z + d / 2 + 2);
        scene.add(tree);
        col.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
      }
      continue;
    }
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
      const building = box(scene, w, h, d, SM({ map: tex, roughness: 0.9 }), x, h / 2, z, true);
      building.receiveShadow = true;
      addAOSkirt(scene, x, z, w, d);
      // v31: AC box on the roof (0.6x0.5x0.4, #E8EBE8).
      if (rng.chance(0.5)) box(scene, 0.6, 0.5, 0.4, M(0xE8EBE8, 0.9), x + w / 4, h + 0.65, z, true);
      box(scene, w + 0.4, 0.4, d + 0.4, M(0x555a60), x, h + 0.2, z);
      for (const [pw, pd, px, pz] of [[w + 0.3, 0.4, 0, d / 2], [w + 0.3, 0.4, 0, -d / 2], [0.4, d + 0.3, w / 2, 0], [0.4, d + 0.3, -w / 2, 0]]) box(scene, pw, 0.6, pd, M(0x6a5a4a), x + px, h + 0.5, z + pz);
      if (rng.chance(0.3)) box(scene, 2.5, 1.2, 1.8, M(0x888888), x + w / 4, h + 0.8, z);
      if (h >= 14) {
        const floors = Math.min(4, Math.floor(h / 7));
        for (let f = 0; f < floors; f += 1) {
          box(scene, w * 0.4, 0.25, 1.4, M(0x6a5a4a), x, 4 + f * 7, z + d / 2 + 0.7, true);
          box(scene, w * 0.4, 0.7, 0.06, M(0x2c3e50, 0.7), x, 4 + f * 7 + 0.45, z + d / 2 + 1.35);
          for (const s of [-1, 1]) box(scene, 0.06, 0.7, d * 0.4, M(0x2c3e50, 0.7), x + s * (w / 2 + 1.35), 4 + f * 7 + 0.45, z);
        }
      }
      if (h < 16 && rng.chance(0.6)) {
        box(scene, w * 0.7, 3, 0.2, M(0x1a2a1a, 0.3, { metalness: 0.4 }), x, 1.5, z + d / 2 + 0.1);
        const awn2 = box(scene, w * 0.75, 0.15, 2, TM(tx.awning, 2, 1, 0.9), x, 3.4, z + d / 2 + 1);
        awn2.rotation.x = 0.22;
        if (stex.length) { const sg2 = new ME(new PG(7, 1.8), new MB({ map: rng.pick(stex) })); sg2.position.set(x, 4.8, z + d / 2 + 0.2); scene.add(sg2); }
      }
      if (rng.chance(0.4)) cyl(scene, 1, 1, 2, 10, M(0x7a6a58, 0.9), x - w / 4, h + 1.4, z - d / 4, true);
      col.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
    }
  }
  // ---- v31: hero-zone dressing, signs, far skyline ----
  // 8 v31 palms (frond planes) along the hero-zone sidewalks.
  // v33: the (247.5,-175) palm stood in front of the BODEGA sign in
  // shot 1 and its trunk hid the "BO" — moved north to -158.
  const heroPalmSpots = [
    [232.5, -195], [247.5, -195], [232.5, -185], [247.5, -185],
    [232.5, -175], [247.5, -158], [232.5, -165], [247.5, -165],
  ];
  for (const [px, pz] of heroPalmSpots) {
    const palm = makeV31Palm();
    palm.position.set(px, 0, pz);
    scene.add(palm);
  }
  // 4 streetlights in the hero zone.
  // v33: the (232.5,-170) lamp stood on the shot-4 sightline to the
  // AUTO DEALER sign and its pole hid the "D" — moved to -160.
  for (const [lx, lz] of [[232.5, -190], [247.5, -190], [232.5, -160], [247.5, -170]]) {
    const lamp = makeLamp();
    lamp.position.set(lx, 0, lz);
    scene.add(lamp);
  }
  // 12 signs: the 12 towers nearest the hero-zone centre, one sign each,
  // 60-70% of the facing facade width, mounted over the entrance (y=5.6),
  // unlit so they read at dusk.
  const heroTowers = towers
    .map((t) => ({ ...t, dist: Math.hypot(t.x - HERO_ZONE.cx, t.z - HERO_ZONE.cz) }))
    .sort((a, b) => a.dist - b.dist)
    .slice(0, 12);
  heroTowers.forEach((t, i) => {
    const name = SIGN_NAMES[i % SIGN_NAMES.length];
    const bg = SIGN_COLORS[i % SIGN_COLORS.length];
    // v33: HALF the signs on the EAST face, half on the SOUTH face.
    // All-south read only in the north-looking shots (1,2); the
    // west-looking shots (3,4) saw them edge-on. East faces read
    // head-on from the west cameras.
    const signW = Math.min(14, t.w * 0.8);
    const sign = makeV31Sign(name, bg, '#FFFFFF', signW, signW * 0.25);
    if (i % 2) {
      sign.position.set(t.x + (t.w + 1.5) / 2 + 0.15, 7.0, t.z);
      sign.rotation.y = PI / 2;
    } else {
      sign.position.set(t.x, 7.0, t.z + (t.d + 1.5) / 2 + 0.15);
      sign.rotation.y = 0;
    }
    scene.add(sign);
  });
  // Far skyline: 24 boxes at 450-550m sharing 4 baked facade cells.
  scene.add(makeFarSkyline(facadeAtlas));
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
      const mast = new ME(
        new CG(0.12, 0.12, 7, 6),
        M(0xdddddd,0.6),
      );
      mast.position.set(186 + i * 18, 5, 274);
      scene.add(mast);
    }
    const sign = makeSign('MARINA', '#ffffff', '#1a5f8a');
    sign.position.set(210, 5, 244);
    scene.add(sign);
  }
  {
    const shop = new ME(
      new BX(30, 8, 20),
      M(0x7a6a58),
    );
    shop.position.set(-210, 4, 210);
    shop.castShadow = true;
    shop.receiveShadow = true;
    scene.add(shop);
    const sign = makeSign('CHOP SHOP', '#ffe14d', '#222222');
    sign.position.set(-210, 9.5, 199);
    scene.add(sign);
    col.push({ minX: -225, maxX: -195, minZ: 200, maxZ: 220 });
  }
  {
    const base = new ME(
      new CG(9, 11, 1.5, 16),
      M(0x9aa0a3),
    );
    base.position.set(-216, 0.75, -216);
    base.castShadow = true;
    scene.add(base);
    const towerMat = SM({ map: tile(tx.marble, 3, 1), roughness: 0.8 });
    const stripeMat = M(0xd21f2b,0.8);
    for (let i = 0; i < 4; i += 1) {
      const seg = new ME(
        new CG(3.4 - i * 0.3, 3.7 - i * 0.3, 6.5, 12),
        i % 2 === 0 ? towerMat : stripeMat,
      );
      seg.position.set(-216, 1.5 + 3.25 + i * 6.5, -216);
      seg.castShadow = true;
      scene.add(seg);
    }
    const lamp = new ME(
      new BX(4, 3, 4),
      M(0xffe14d,0.4,{emissive:0xaa8800}),
    );
    lamp.position.set(-216, 29.5, -216);
    scene.add(lamp);
    const cap = new ME(
      new CN(3.4, 2.5, 12),
      M(0x222222,0.8),
    );
    cap.position.set(-216, 32.2, -216);
    scene.add(cap);
    col.push({ minX: -227, maxX: -205, minZ: -227, maxZ: -205 });
  }
  let shopCell = 12;
  function shopFront(bx, bz, w, h, d, color, signText, signFg, signBg) {
    const sg = new BX(w, h, d);
    // v33: facade-atlas storefront cell instead of a flat colour — the
    // flat 0x4a6a8a dealer box read as one untextured grey slab. h=20 so
    // the V spans the full storefront cell.
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
    const awning = new ME(
      new BX(w * 0.6, 0.15, 2),
      M(0x2c3e50,0.9),
    );
    awning.position.set(bx, 3.2, bz - d / 2 - 0.9);
    awning.rotation.x = 0.25;
    awning.castShadow = true;
    scene.add(awning);
    const door = new ME(
      new BX(2, 3, 0.2),
      M(0x222222,0.7),
    );
    door.position.set(bx, 1.5, bz - d / 2 - 0.05);
    scene.add(door);
    col.push({ minX: bx - w / 2, maxX: bx + w / 2, minZ: bz - d / 2, maxZ: bz + d / 2 });
  }
  shopFront(210, -150, 24, 7, 16, 0x4a6a8a, 'AUTO DEALER', '#ffffff', '#1a3a5f');
  shopFront(150, -210, 16, 6, 12, 0x5a4a3a, 'GUN SHOP', '#ffe14d', '#222222');
  shopFront(270, 30, 20, 7, 14, 0x6a6a6a, 'GARAGE', '#ffffff', '#333333');
  shopFront(30, 150, 18, 6, 12, 0xc98a5a, 'DINER', '#ffffff', '#7a3a1a');
  shopFront(330, -270, 22, 14, 16, 0x8a8a9a, 'BANK', '#ffffff', '#2a4a6a');
  for (const cx of [-330, -270]) {
    const mast = new ME(
      new BX(3, 42, 3),
      M(0xd8a020,0.7),
    );
    mast.position.set(cx, 21, -350);
    mast.castShadow = true;
    scene.add(mast);
    const arm = new ME(
      new BX(34, 2, 2),
      M(0xd8a020,0.7),
    );
    arm.position.set(cx + 12, 40, -350);
    scene.add(arm);
    const hook = new ME(
      new BX(2, 2, 2),
      M(0x333333,0.8),
    );
    hook.position.set(cx + 24, 34, -350);
    scene.add(hook);
  }
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
  for (const stop of landmarks.busStops) {
    const bench = makeBench();
    bench.position.set(stop.x, 0, stop.z);
    scene.add(bench);
    const sign = makeSign('BUS', '#ffffff', '#2a6a3a', 2.4, 1.2);
    sign.position.set(stop.x, 2.2, stop.z);
    scene.add(sign);
    const shelterMat = M(0x2a6a3a,0.8);
    for (const dx of [-1.2, 1.2]) {
      const post = new ME(new CG(0.07, 0.07, 2.6, 6), shelterMat);
      post.position.set(stop.x + dx, 1.3, stop.z - 0.5);
      scene.add(post);
    }
    const shelterRoof = new ME(new BX(3, 0.12, 1.6), shelterMat);
    shelterRoof.position.set(stop.x, 2.7, stop.z - 0.5);
    shelterRoof.castShadow = true;
    scene.add(shelterRoof);
    const rb = makeSign('1路 5路 12路', '#ffffff', '#1a3a5f', 2.2, 1);
    rb.position.set(stop.x, 1.6, stop.z - 1.2);
    scene.add(rb);
  }
  const collectibleMeshes = [];
  for (const spot of landmarks.collectibles) {
    const gem = new ME(
      new OG(0.7),
      M(0x33dd66,0.3,{emissive:0x228833}),
    );
    gem.position.set(spot.x, 1.5, spot.z);
    scene.add(gem);
    collectibleMeshes.push(gem);
  }
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
  for (let i = 0; i < 8; i += 1) {
    const x = -220 + i * 62;
    const pole = new ME(
      new CG(0.08, 0.08, 2.6, 6),
      M(0xdddddd,0.8),
    );
    pole.position.set(x, 1.3, 262);
    const top = new ME(
      new CN(2.4, 1.2, 8),
      SM({ color: rng.pick([0xe74c3c, 0xf1c40f, 0x2e86c1, 0x16a085]), roughness: 0.9 }),
    );
    top.position.set(x, 3, 262);
    top.castShadow = true;
    scene.add(pole, top);
    // v31: blob shadow under the beach umbrella pole so it stops floating.
    addBlobShadow(scene, x, 262, 1.2, 1.2, 0.32);
  }
  for (const [rx, rr, rh] of [[-520, 85, 14], [480, 70, 11]]) {
    const ridge = new ME(
      new CN(rr, rh, 7),
      M(0x8a9aa8),
    );
    ridge.position.set(rx, 0, -640);
    scene.add(ridge);
  }
  // v33: clouds REMOVED — the hard-edged white ellipsoids read as
  // floating rocks under "no floating mesh". Sky dome + sun + far
  // skyline carry the atmosphere now.
  const clouds = [];
  return { colliders: col, landmarks, sea, boats, clouds, collectibleMeshes, trafficLights, towers };
}
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
