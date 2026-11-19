import * as THREE from 'three';
import { CITY, COLOURS, DETAIL, TEXTURES, districtAt } from './config.js';
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
  if (!m) { m = new THREE.MeshStandardMaterial({ color, roughness: rough, ...extra }); _mats.set(k, m); }
  return m;
}
function box(parent, w, h, d, material, x, y, z, shadow = false) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y, z);
  if (shadow) m.castShadow = true;
  parent.add(m);
  return m;
}
function cyl(parent, rt, rb, h, seg, material, x, y, z, shadow = false) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), material);
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
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
export async function loadCityTextures() {
  const loader = new THREE.TextureLoader();
  const out = {};
  const jobs = [
    ['glass', TEXTURES.glass, '#7fa8c9'],
    ['brick', TEXTURES.brick, '#9a5a44'],
    ['stucco', TEXTURES.stucco, '#e8dcc8'],
    ['asphalt', TEXTURES.asphalt, '#3a3f45'],
    ['sidewalk', TEXTURES.sidewalk, '#b9b3a4'],
    ['grass', TEXTURES.grass, '#6fae5e'],
    ['sand', TEXTURES.sand, '#e8d49a'],
    ['container', TEXTURES.container, '#2e86c1'],
    ['concrete', TEXTURES.concrete, '#9a9a9a'],
    ['wood', TEXTURES.wood, '#8a6a44'],
    ['cobble', TEXTURES.cobble, '#7a7a7a'],
    ['redPaint', TEXTURES.redPaint, '#d21f2b'],
    ['taxiPaint', TEXTURES.taxiPaint, '#f1c40f'],
    ['fireball', TEXTURES.fireball, '#ff8800'],
    ['smoke', TEXTURES.smoke, '#888888'],
    ['marble', TEXTURES.marble, '#e8e8e8'],
    ['glassDark', TEXTURES.glassDark, '#3a5a7a'],
    ['brickBrown', TEXTURES.brickBrown, '#7a4a34'],
    ['plaster', TEXTURES.plaster, '#e8dcc8'],
    ['metal', TEXTURES.metal, '#8a6a58'],
    ['stone', TEXTURES.stone, '#8a8a8a'],
    ['awning', TEXTURES.awning, '#c0392b'],
    ['signTaxi', TEXTURES.signTaxi, '#111111'],
    ['sign24h', TEXTURES.sign24h, '#111111'],
    ['signHotel', TEXTURES.signHotel, '#111111'],
    ['signBar', TEXTURES.signBar, '#111111'],
    ['signPizza', TEXTURES.signPizza, '#111111'],
    ['signAuto', TEXTURES.signAuto, '#111111'],
  ];
  await Promise.all(jobs.map(async ([key, url, hex]) => {
    try {
      const tex = await loader.loadAsync(url);
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
      out[key] = tex;
    } catch {
      const tex = fallbackTexture(hex);
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
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
function makeDashTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 16;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 128, 16);
  ctx.fillStyle = '#f5f5f0';
  ctx.fillRect(0, 0, 64, 16);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  return tex;
}
function makeFacadeTexture(base, rng, floors = 12, cols = 6) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 128, 256);
  for (let row = 0; row < floors; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const lit = rng.chance(0.25);
      ctx.fillStyle = lit ? '#ffd98a' : '#2c3e50';
      ctx.fillRect(10 + col * 19, 12 + row * 20, 12, 12);
      ctx.strokeStyle = 'rgba(0,0,0,0.45)';
      ctx.lineWidth = 1;
      ctx.strokeRect(9 + col * 19, 11 + row * 20, 14, 14);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
function makeHouseTexture(base, rng) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 128, 128);
  for (const [x, y] of [[20, 30], [80, 30], [20, 70], [80, 70]]) {
    ctx.fillStyle = rng.chance(0.3) ? '#ffd98a' : '#2c3e50';
    ctx.fillRect(x, y, 22, 22);
  }
  ctx.fillStyle = '#5a3a22';
  ctx.fillRect(54, 88, 20, 40);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
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
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshStandardMaterial({ map: tex }),
  );
}
function makePalm(rng) {
  const group = new THREE.Group();
  const trunkMat = M(0x8a6b4f);
  const leafMat = M(0x2e8b57);
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.3, 5, 6), trunkMat);
  trunk.position.y = 2.5;
  trunk.rotation.z = rng.range(-0.08, 0.08);
  group.add(trunk);
  for (let i = 0; i < 6; i += 1) {
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.5, 3.2, 4), leafMat);
    const angle = (i / 6) * Math.PI * 2;
    leaf.position.set(Math.cos(angle) * 1.2, 5.4, Math.sin(angle) * 1.2);
    leaf.rotation.z = Math.cos(angle) * 1.1;
    leaf.rotation.x = -Math.sin(angle) * 1.1;
    group.add(leaf);
  }
  group.traverse((o) => {
    if (o.isMesh) o.castShadow = false;
  });
  return group;
}
function makeTree(rng) {
  const group = new THREE.Group();
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.2, 0.32, 2.4, 8),
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
    const puff = new THREE.Mesh(
      new THREE.IcosahedronGeometry(sizes[i], 1),
      new THREE.MeshStandardMaterial({ color: greens[i], roughness: 1 }),
    );
    puff.position.set(offsets[i][0] * DETAIL.treeSpread * 2, heights[i], offsets[i][1] * DETAIL.treeSpread * 2);
    group.add(puff);
  }
  return group;
}
function makeTrafficLight(state){
  const g=new THREE.Group();
  cyl(g,0.1,0.13,5.5,6,M(0x2c3e50,0.7),0,2.75,0);
  const arm=cyl(g,0.08,0.08,3.6,6,M(0x2c3e50,0.7),0,5.4,1.8);arm.rotation.x=Math.PI/2;
  box(g,0.5,1.3,0.4,M(0x1a1a1a,0.6),0,4.9,3.6);
  const cols=[0xff2222,0xffcc00,0x33cc33],on=state==='G'?2:0;
  for(let i=0;i<3;i+=1){
    const lamp=new THREE.Mesh(new THREE.SphereGeometry(0.15,8,6),new THREE.MeshStandardMaterial({color:cols[i],emissive:cols[i],emissiveIntensity:i===on?1.8:0.08}));
    lamp.position.set(0,5.35-i*0.4,3.82);g.add(lamp);
  }
  const pc=state==='G'?0xff2222:0x33cc33;
  box(g,0.3,0.5,0.12,new THREE.MeshStandardMaterial({color:pc,emissive:pc,emissiveIntensity:1.5}),0,2.4,0.15);
  return g;
}
function makeHydrant() {
  const group = new THREE.Group();
  const red = M(0xc0392b,0.6);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.7, 10), red);
  body.position.y = 0.35;
  group.add(body);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), red);
  cap.position.y = 0.75;
  group.add(cap);
  const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.3, 8), red);
  nozzle.rotation.z = Math.PI / 2;
  nozzle.position.set(0.25, 0.4, 0);
  group.add(nozzle);
  return group;
}
function makeLamp() {
  const group = new THREE.Group();
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.09, 0.12, 5.5, 6),
    M(0x2c3e50,0.7),
  );
  pole.position.y = 2.75;
  const head = new THREE.Mesh(
    new THREE.BoxGeometry(0.9, 0.25, 0.35),
    M(0xffe9a8,0.4,{emissive:0xaa8800}),
  );
  head.position.y = 5.5;
  const bulb = new THREE.Mesh(
    new THREE.SphereGeometry(0.18, 10, 8),
    M(0xfff6c0,0.3,{emissive:0xcc9900}),
  );
  bulb.position.y = 5.3;
  group.add(pole, head, bulb);
  return group;
}
function makeBench() {
  const group = new THREE.Group();
  const wood = M(0x8a6b4f);
  const seat = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.12, 0.6), wood);
  seat.position.y = 0.5;
  const back = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.7, 0.1), wood);
  back.position.set(0, 0.9, -0.28);
  group.add(seat, back);
  return group;
}
function makeBillboard(text, fg, bg) {
  const group = new THREE.Group();
  const poleMat = M(0x555a60,0.8);
  for (const dx of [-4, 4]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 7, 6), poleMat);
    pole.position.set(dx, 3.5, 0);
    group.add(pole);
  }
  const frame = new THREE.Mesh(
    new THREE.BoxGeometry(12.6, 3.6, 0.3),
    M(0x222222,0.8),
  );
  frame.position.y = 8.5;
  group.add(frame);
  const face = makeSign(text, fg, bg, 12, 3);
  face.position.set(0, 8.5, 0.2);
  group.add(face);
  return group;
}
export function buildCity(scene, rng, textures = {}) {
  const colliders = [];
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
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(CITY.halfSize * 2 + 400, CITY.halfSize * 2 + 400),
    new THREE.MeshStandardMaterial({ color: COLOURS.ground, roughness: 1 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  const beachMat = textures.sand
    ? new THREE.MeshStandardMaterial({ map: tile(textures.sand, 20, 2), roughness: 1 })
    : new THREE.MeshStandardMaterial({ color: COLOURS.sand, roughness: 1 });
  const beach = new THREE.Mesh(new THREE.PlaneGeometry(560, 60), beachMat);
  beach.rotation.x = -Math.PI / 2;
  beach.position.set(0, 0.03, 276);
  beach.receiveShadow = true;
  scene.add(beach);
  if (textures.cobble) {
    const plaza = new THREE.Mesh(
      new THREE.PlaneGeometry(24, 24),
      new THREE.MeshStandardMaterial({ map: tile(textures.cobble, 3, 3), roughness: 1 }),
    );
    plaza.rotation.x = -Math.PI / 2;
    plaza.position.set(0, 0.04, 12);
    plaza.receiveShadow = true;
    scene.add(plaza);
  }
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(900, 300),
    new THREE.MeshStandardMaterial({ color: COLOURS.sea, roughness: 0.3, metalness: 0.1 }),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(0, 0.02, 456);
  scene.add(sea);
  const roadMat = textures.asphalt
    ? new THREE.MeshStandardMaterial({ map: tile(textures.asphalt, 60, 1), roughness: 1 })
    : new THREE.MeshStandardMaterial({ color: COLOURS.asphalt, roughness: 1 });
  const walkMat = textures.sidewalk
    ? new THREE.MeshStandardMaterial({ map: tile(textures.sidewalk, 60, 1), roughness: 1 })
    : new THREE.MeshStandardMaterial({ color: COLOURS.sidewalk, roughness: 1 });
  const dashTex = makeDashTexture();
  const roadLenX = 780;
  const roadLenZ = 660;
  for (const line of CITY.roadLinesX) {
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(roadLenZ, CITY.roadWidth), roadMat);
    strip.rotation.x = -Math.PI / 2;
    strip.rotation.z = Math.PI / 2;
    strip.position.set(line, 0.05, -60);
    strip.receiveShadow = true;
    scene.add(strip);
    for (const side of [-1, 1]) {
      const walk = new THREE.Mesh(new THREE.PlaneGeometry(roadLenZ, 3), walkMat);
      walk.rotation.x = -Math.PI / 2;
      walk.rotation.z = Math.PI / 2;
      walk.position.set(line + side * (CITY.roadWidth / 2 + 1.5), 0.06, -60);
      scene.add(walk);
    }
    const dashLine = new THREE.Mesh(
      new THREE.PlaneGeometry(roadLenZ, 0.4),
      new THREE.MeshBasicMaterial({ map: tile(dashTex, roadLenZ / 12, 1), transparent: true }),
    );
    dashLine.rotation.x = -Math.PI / 2;
    dashLine.rotation.z = Math.PI / 2;
    dashLine.position.set(line, 0.07, -60);
    scene.add(dashLine);
  }
  for (const line of CITY.roadLinesZ) {
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(roadLenX, CITY.roadWidth), roadMat);
    strip.rotation.x = -Math.PI / 2;
    strip.position.set(0, 0.05, line);
    strip.receiveShadow = true;
    scene.add(strip);
    for (const side of [-1, 1]) {
      const walk = new THREE.Mesh(new THREE.PlaneGeometry(roadLenX, 3), walkMat);
      walk.rotation.x = -Math.PI / 2;
      walk.position.set(0, 0.06, line + side * (CITY.roadWidth / 2 + 1.5));
      scene.add(walk);
    }
    const dashLine = new THREE.Mesh(
      new THREE.PlaneGeometry(roadLenX, 0.4),
      new THREE.MeshBasicMaterial({ map: tile(dashTex, roadLenX / 12, 1), transparent: true }),
    );
    dashLine.rotation.x = -Math.PI / 2;
    dashLine.position.set(0, 0.07, line);
    scene.add(dashLine);
  }
  const cv=(w,h,f)=>{const c=document.createElement('canvas');c.width=w;c.height=h;f(c.getContext('2d'));const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.wrapS=THREE.RepeatWrapping;t.wrapT=THREE.RepeatWrapping;return t;};
  const zebra=cv(128,64,(x)=>{x.fillStyle='#f5f5f0';for(let i=0;i<6;i++)x.fillRect(8+i*20,4,10,42);x.fillRect(0,54,128,8);});
  const arrow=cv(64,64,(x)=>{x.fillStyle='#f5f5f0';x.fillRect(26,34,12,26);x.beginPath();x.moveTo(32,4);x.lineTo(52,30);x.lineTo(12,30);x.closePath();x.fill();});
  const railT=cv(64,32,(x)=>{x.fillStyle='rgba(200,205,212,0.45)';x.fillRect(0,0,64,32);x.fillStyle='#3a3e44';for(let i=0;i<8;i++)x.fillRect(1+i*8,0,6,32);x.fillStyle='#2c2f34';x.fillRect(0,0,64,5);x.fillRect(0,27,64,5);});
  const flat=(w,d,m,x,z,rz=0,y=0.08)=>{const p=new THREE.Mesh(new THREE.PlaneGeometry(w,d),m);p.rotation.x=-Math.PI/2;p.rotation.z=rz;p.position.set(x,y,z);scene.add(p);};
  const zebraM=new THREE.MeshBasicMaterial({map:zebra,transparent:true});
  const arrowM=new THREE.MeshBasicMaterial({map:arrow,transparent:true});
  const lineM=new THREE.MeshBasicMaterial({color:0xf5f5f0});
  for(const [ix,iz] of [[0,-180],[120,-180],[180,-180],[240,-180],[240,-120],[240,0],[0,0],[60,-180]]){flat(4.5,12,zebraM,ix+9,iz,0,0.09);flat(4.5,12,zebraM,ix,iz-9,Math.PI/2,0.09);}
  for(const [ax,az,ar] of [[60,-180,-Math.PI/2],[180,-180,-Math.PI/2],[300,-180,-Math.PI/2],[-120,-180,Math.PI/2],[240,-120,0],[0,120,0]])flat(2.2,4,arrowM,ax,az,ar);
  for(const [cx,cz,az] of [[240,-60,1],[0,-180,0],[0,-60,1]]){
    const L=az?660:780;
    for(const s of [-1,1]){
      flat(az?0.18:L,az?L:0.18,lineM,cx+(az?s*5.7:0),cz+(az?0:s*5.7));
      box(scene,az?0.4:L,0.18,az?L:0.4,M(0xb9b3a4),cx+(az?s*6.3:0),0.09,cz+(az?0:s*6.3));
    }
  }
  const rail=(x1,z1,x2,z2)=>{
    const L=Math.hypot(x2-x1,z2-z1);
    const p=new THREE.Mesh(new THREE.PlaneGeometry(L,0.85),new THREE.MeshBasicMaterial({map:tile(railT,L/2,1),transparent:true,side:THREE.DoubleSide}));
    p.position.set((x1+x2)/2,0.72,(z1+z2)/2);p.rotation.y=x1===x2?Math.PI/2:0;scene.add(p);
  };
  for(let x=-330;x<330;x+=60)rail(x+14,-180,x+46,-180);
  for(let z=-330;z<240;z+=60)rail(240,z+14,240,z+46);
  for(let x=-330;x<330;x+=60){colliders.push({minX:x+14,maxX:x+23,minZ:-180.3,maxZ:-179.7});colliders.push({minX:x+37,maxX:x+46,minZ:-180.3,maxZ:-179.7});}
  for(let z=-330;z<240;z+=60){colliders.push({minX:239.7,maxX:240.3,minZ:z+14,maxZ:z+23});colliders.push({minX:239.7,maxX:240.3,minZ:z+37,maxZ:z+46});}
  for(const [hx,hz] of [[120,-183],[180,-177],[237,-90],[0,-30],[60,-183],[243,30],[-60,-177],[300,-183]]){
    const hole=new THREE.Mesh(new THREE.CylinderGeometry(0.55,0.55,0.06,12),M(0x222222,0.9));
    hole.position.set(hx,0.09,hz);scene.add(hole);
  }
  for(const [tx,tz,tr,ts] of [[8,-172,Math.PI,'R'],[-8,-188,0,'G'],[248,-172,Math.PI,'G'],[232,-188,0,'R'],[8,8,Math.PI,'G'],[-8,-8,0,'R'],[248,8,Math.PI,'R'],[232,-8,0,'G']]){
    const tl=makeTrafficLight(ts);tl.position.set(tx,0,tz);tl.rotation.y=tr;scene.add(tl);
  }
  for(const [hx,hz] of [[30,10],[-60,-40],[150,60],[210,-30],[120,-174],[180,-186],[240,-150],[0,-174]]){
    const hyd=makeHydrant();hyd.position.set(hx,0,hz);scene.add(hyd);
  }
  for(const [sx,sz,st] of [[-14,-172,'限速 40'],[14,-188,'直行'],[226,-172,'单行']]){
    const sg=makeSign(st,'#ffffff','#1a3a5f',2.4,1.2);sg.position.set(sx,2.6,sz);scene.add(sg);
    cyl(scene,0.05,0.05,2.6,6,M(0x888888),sx,1.3,sz);
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
  const facadeTextures = COLOURS.building.map((c) => {
    const hex = `#${c.toString(16).padStart(6, '0')}`;
    return makeFacadeTexture(hex, rng);
  });
  const towerTextures = COLOURS.tower.map((c) => {
    const hex = `#${c.toString(16).padStart(6, '0')}`;
    return makeFacadeTexture(hex, rng, 16, 8);
  });
  const houseTextures = COLOURS.house.map((c) => {
    const hex = `#${c.toString(16).padStart(6, '0')}`;
    return makeHouseTexture(hex, rng);
  });
  const signTexs = ['signTaxi', 'sign24h', 'signHotel', 'signBar', 'signPizza', 'signAuto'].map((k) => textures[k]).filter(Boolean);
  const blockCentres = [];
  for (let bx = -330; bx <= 330; bx += 60) {
    for (let bz = -330; bz <= 210; bz += 60) blockCentres.push([bx, bz]);
  }
  const towerSigns = ['HOTEL', 'CASINO', 'MALL', 'BANK'];
  let towerSignIdx = 0;
  for (const [bx, bz] of blockCentres) {
    const key = `${bx},${bz}`;
    const district = districtAt(bx, bz);
    if (PARK_BLOCKS.has(key)) {
      const parkMat = textures.grass
        ? new THREE.MeshStandardMaterial({ map: tile(textures.grass, 4, 4), roughness: 1 })
        : new THREE.MeshStandardMaterial({ color: COLOURS.grass, roughness: 1 });
      const park = new THREE.Mesh(new THREE.PlaneGeometry(46, 46), parkMat);
      park.rotation.x = -Math.PI / 2;
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
        bench.rotation.y = rng.range(0, Math.PI);
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
          const useTex = textures.container && rng.chance(0.6);
          const cont = new THREE.Mesh(
            new THREE.BoxGeometry(6, 2.6, 2.6),
            useTex
              ? new THREE.MeshStandardMaterial({ map: tile(textures.container, 2, 1), roughness: 0.8 })
              : new THREE.MeshStandardMaterial({ color: rng.pick(COLOURS.container), roughness: 0.8 }),
          );
          cont.position.set(cx, 1.3 + s * 2.6, cz);
          cont.rotation.y = rng.chance(0.5) ? 0 : Math.PI / 2;
          cont.castShadow = true;
          scene.add(cont);
        }
        colliders.push({ minX: cx - 3.2, maxX: cx + 3.2, minZ: cz - 3.2, maxZ: cz + 3.2 });
      }
      const ww = rng.range(26, 34);
      const wd = rng.range(16, 22);
      const wh = rng.range(8, 11);
      const wm = textures.metal ? new THREE.MeshStandardMaterial({ map: tile(textures.metal, 3, 1), roughness: 0.9 }) : M(0x8a7a68);
      box(scene, ww, wh, wd, wm, bx + 8, wh / 2, bz + 8, true);
      const saw1 = box(scene, ww + 0.4, 0.3, wd / 2 + 0.2, M(0x5a4a3a), bx + 8, wh + 0.8, bz + 8 - wd / 4);
      saw1.rotation.x = 0.18;
      const saw2 = box(scene, ww + 0.4, 0.3, wd / 2 + 0.2, M(0x5a4a3a), bx + 8, wh + 0.8, bz + 8 + wd / 4);
      saw2.rotation.x = -0.18;
      colliders.push({ minX: bx - 7, maxX: bx + 23, minZ: bz - 2, maxZ: bz + 18 });
      continue;
    }
    if (district === 'DOWNTOWN') {
      const w = rng.range(18, 26);
      const d = rng.range(18, 26);
      const dc = Math.hypot(bx - 210, bz + 210);
      const landmark = bx === 210 && bz === -210;
      const h = landmark ? rng.range(105, 120) : rng.range(30, 85) * (dc < 150 ? 1.15 : 0.85);
      const x = bx + rng.range(-6, 6);
      const z = bz + rng.range(-6, 6);
      const glassTex = textures.glassDark && rng.chance(0.5) ? textures.glassDark : textures.glass;
      let tex;
      if (glassTex) tex = tile(glassTex, Math.max(1, Math.round(w / 8)), Math.max(1, Math.round(h / 10)));
      else { tex = rng.pick(towerTextures).clone(); tex.needsUpdate = true; tex.repeat.set(Math.max(1, Math.round(w / 10)), Math.max(1, Math.round(h / 12))); }
      const towerMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55, metalness: 0.15 });
      const tower = box(scene, w, h, d, towerMat, x, h / 2, z, true);
      tower.receiveShadow = true;
      for (const [fx, fz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) box(scene, 0.7, h, 0.7, M(0x14202c, 0.4, { metalness: 0.5 }), x + fx * (w / 2 - 0.2), h / 2, z + fz * (d / 2 - 0.2));
      box(scene, w + 0.6, 0.5, d + 0.6, M(0x3a3f45), x, h - 0.25, z);
      for (const [pw, pd, px, pz] of [[w + 0.4, 0.5, 0, d / 2], [w + 0.4, 0.5, 0, -d / 2], [0.5, d + 0.4, w / 2, 0], [0.5, d + 0.4, -w / 2, 0]]) box(scene, pw, 0.8, pd, M(0x3a3f45), x + px, h + 0.4, z + pz);
      box(scene, w + 1.5, 4.5, d + 1.5, new THREE.MeshStandardMaterial({ map: textures.concrete ? tile(textures.concrete, 2, 1) : null, color: textures.concrete ? 0xffffff : 0x2c3e50, roughness: 0.8 }), x, 2.25, z, true);
      box(scene, w * 0.8, 3.2, 0.2, M(0x0e1a24, 0.25, { metalness: 0.5 }), x, 1.6, z + d / 2 + 0.85);
      const awn = box(scene, w * 0.85, 0.18, 2.4, textures.awning ? new THREE.MeshStandardMaterial({ map: tile(textures.awning, 3, 1), roughness: 0.9 }) : M(0xc0392b), x, 3.7, z + d / 2 + 1.9);
      awn.rotation.x = 0.22;
      if (signTexs.length) { const sg = new THREE.Mesh(new THREE.PlaneGeometry(9, 2.2), new THREE.MeshBasicMaterial({ map: rng.pick(signTexs) })); sg.position.set(x, 5.6, z + d / 2 + 0.95); scene.add(sg); }
      box(scene, w * 0.55, 4, d * 0.55, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, metalness: 0.1 }), x, h + 2, z, true);
      box(scene, w * 0.55 + 0.4, 0.5, d * 0.55 + 0.4, M(0x3a3f45), x, h + 4.25, z);
      cyl(scene, 1.2, 1.2, 2.4, 10, M(0x7a6a58, 0.9), x + w * 0.12, h + 5.6, z - d * 0.1, true);
      box(scene, 3, 1.5, 2, M(0x888888), x - w * 0.12, h + 5.2, z + d * 0.1);
      cyl(scene, 0.08, 0.08, 6, 6, M(0x333333, 0.6), x + w * 0.18, h + 7.5, z + d * 0.12);
      const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), M(0xff2222,1,{emissive:0xaa0000}));
      beacon.position.set(x + w * 0.18, h + 10.7, z + d * 0.12);
      scene.add(beacon);
      if (towerSignIdx < towerSigns.length && rng.chance(0.6)) {
        const sign = makeSign(towerSigns[towerSignIdx], '#ffffff', '#1a1a2e', 12, 3);
        sign.position.set(x, h - 6, z + d / 2 + 0.1);
        scene.add(sign);
        towerSignIdx += 1;
      }
      colliders.push({ minX: x - (w + 1.5) / 2, maxX: x + (w + 1.5) / 2, minZ: z - (d + 1.5) / 2, maxZ: z + (d + 1.5) / 2 });
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
        let tex;
        if (textures.plaster && rng.chance(0.4)) {
          tex = tile(textures.plaster, 2, 1);
        } else if (textures.wood && rng.chance(0.5)) {
          tex = tile(textures.wood, 2, 1);
        } else if (textures.stucco) {
          tex = tile(textures.stucco, 2, 1);
        } else {
          tex = rng.pick(houseTextures).clone();
          tex.needsUpdate = true;
        }
        const house = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 }));
        house.position.set(x, h / 2, z);
        house.castShadow = true;
        house.receiveShadow = true;
        scene.add(house);
        const roof = new THREE.Mesh(
          new THREE.ConeGeometry(Math.max(w, d) * 0.72, 3, 4),
          new THREE.MeshStandardMaterial({ color: rng.pick([0x8a4a3a, 0x5a4a3a, 0x3a5a4a]), roughness: 1 }),
        );
        roof.position.set(x, h + 1.5, z);
        roof.rotation.y = Math.PI / 4;
        scene.add(roof);
        const chimney = new THREE.Mesh(
          new THREE.BoxGeometry(1, 1.4, 1),
          M(0x8a4a3a),
        );
        chimney.position.set(x, h + 2.9, z);
        chimney.castShadow = true;
        scene.add(chimney);
        const porch = new THREE.Mesh(
          new THREE.BoxGeometry(w * 0.5, 0.15, 1.2),
          M(0x8a6b4f),
        );
        porch.position.set(x, 0.08, z + d / 2 + 0.6);
        scene.add(porch);
        const gardenMat = textures.grass
          ? new THREE.MeshStandardMaterial({ map: tile(textures.grass, 2, 2), roughness: 1 })
          : new THREE.MeshStandardMaterial({ color: COLOURS.grass, roughness: 1 });
        const garden = new THREE.Mesh(new THREE.PlaneGeometry(w + 6, d + 6), gardenMat);
        garden.rotation.x = -Math.PI / 2;
        garden.position.set(x, 0.04, z);
        scene.add(garden);
        const tree = makeTree(rng);
        tree.position.set(x + w / 2 + 3, 0, z + d / 2 + 2);
        scene.add(tree);
        colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
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
      const brickTex = textures.brickBrown && rng.chance(0.5) ? textures.brickBrown : textures.brick;
      let tex;
      if (brickTex) tex = tile(brickTex, Math.max(1, Math.round(w / 8)), Math.max(1, Math.round(h / 8)));
      else { tex = rng.pick(facadeTextures).clone(); tex.needsUpdate = true; tex.repeat.set(Math.max(1, Math.round(w / 10)), Math.max(1, Math.round(h / 12))); }
      const building = box(scene, w, h, d, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }), x, h / 2, z, true);
      building.receiveShadow = true;
      box(scene, w + 0.4, 0.4, d + 0.4, M(0x555a60), x, h + 0.2, z);
      for (const [pw, pd, px, pz] of [[w + 0.3, 0.4, 0, d / 2], [w + 0.3, 0.4, 0, -d / 2], [0.4, d + 0.3, w / 2, 0], [0.4, d + 0.3, -w / 2, 0]]) box(scene, pw, 0.6, pd, M(0x6a5a4a), x + px, h + 0.5, z + pz);
      if (rng.chance(0.3)) box(scene, 2.5, 1.2, 1.8, M(0x888888), x + w / 4, h + 0.8, z);
      if (h >= 14) {
        const floors = Math.min(4, Math.floor(h / 7));
        for (let f = 0; f < floors; f += 1) {
          box(scene, w * 0.4, 0.25, 1.4, M(0x6a5a4a), x, 4 + f * 7, z + d / 2 + 0.7, true);
          box(scene, w * 0.4, 0.7, 0.06, M(0x2c3e50, 0.7), x, 4 + f * 7 + 0.45, z + d / 2 + 1.35);
        }
      }
      if (h < 16 && rng.chance(0.6)) {
        box(scene, w * 0.7, 3, 0.2, M(0x1a2a1a, 0.3, { metalness: 0.4 }), x, 1.5, z + d / 2 + 0.1);
        const awn2 = box(scene, w * 0.75, 0.15, 2, textures.awning ? new THREE.MeshStandardMaterial({ map: tile(textures.awning, 2, 1), roughness: 0.9 }) : M(0x2e6b4f), x, 3.4, z + d / 2 + 1);
        awn2.rotation.x = 0.22;
        if (signTexs.length) { const sg2 = new THREE.Mesh(new THREE.PlaneGeometry(7, 1.8), new THREE.MeshBasicMaterial({ map: rng.pick(signTexs) })); sg2.position.set(x, 4.8, z + d / 2 + 0.2); scene.add(sg2); }
      }
      if (rng.chance(0.4)) cyl(scene, 1, 1, 2, 10, M(0x7a6a58, 0.9), x - w / 4, h + 1.4, z - d / 4, true);
      colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
    }
  }
  const boats = [];
  {
    const dockMat = M(0x8a6b4f);
    for (let i = 0; i < 3; i += 1) {
      const dock = new THREE.Mesh(new THREE.BoxGeometry(4, 0.6, 26), dockMat);
      dock.position.set(186 + i * 18, 0.4, 262);
      dock.castShadow = true;
      scene.add(dock);
      const hull = new THREE.Mesh(
        new THREE.BoxGeometry(3.4, 1.6, 9),
        new THREE.MeshStandardMaterial({ color: rng.pick(COLOURS.car), roughness: 0.6 }),
      );
      hull.position.set(186 + i * 18, 0.9, 274);
      hull.castShadow = true;
      scene.add(hull);
      boats.push(hull);
      const mast = new THREE.Mesh(
        new THREE.CylinderGeometry(0.12, 0.12, 7, 6),
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
    const shop = new THREE.Mesh(
      new THREE.BoxGeometry(30, 8, 20),
      M(0x7a6a58),
    );
    shop.position.set(-210, 4, 210);
    shop.castShadow = true;
    shop.receiveShadow = true;
    scene.add(shop);
    const sign = makeSign('CHOP SHOP', '#ffe14d', '#222222');
    sign.position.set(-210, 9.5, 199);
    scene.add(sign);
    colliders.push({ minX: -225, maxX: -195, minZ: 200, maxZ: 220 });
  }
  {
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(9, 11, 1.5, 16),
      M(0x9aa0a3),
    );
    base.position.set(-216, 0.75, -216);
    base.castShadow = true;
    scene.add(base);
    const towerMat = new THREE.MeshStandardMaterial({ map: textures.marble ? tile(textures.marble, 3, 1) : null, color: textures.marble ? 0xffffff : 0xf2f2f2, roughness: 0.8 });
    const stripeMat = M(0xd21f2b,0.8);
    for (let i = 0; i < 4; i += 1) {
      const seg = new THREE.Mesh(
        new THREE.CylinderGeometry(3.4 - i * 0.3, 3.7 - i * 0.3, 6.5, 12),
        i % 2 === 0 ? towerMat : stripeMat,
      );
      seg.position.set(-216, 1.5 + 3.25 + i * 6.5, -216);
      seg.castShadow = true;
      scene.add(seg);
    }
    const lamp = new THREE.Mesh(
      new THREE.BoxGeometry(4, 3, 4),
      M(0xffe14d,0.4,{emissive:0xaa8800}),
    );
    lamp.position.set(-216, 29.5, -216);
    scene.add(lamp);
    const cap = new THREE.Mesh(
      new THREE.ConeGeometry(3.4, 2.5, 12),
      M(0x222222,0.8),
    );
    cap.position.set(-216, 32.2, -216);
    scene.add(cap);
    colliders.push({ minX: -227, maxX: -205, minZ: -227, maxZ: -205 });
  }
  function shopFront(bx, bz, w, h, d, color, signText, signFg, signBg) {
    const shop = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshStandardMaterial({ color, roughness: 0.9 }),
    );
    shop.position.set(bx, h / 2, bz);
    shop.castShadow = true;
    shop.receiveShadow = true;
    scene.add(shop);
    const sign = makeSign(signText, signFg, signBg);
    sign.position.set(bx, h + 1.6, bz - d / 2 - 0.1);
    sign.rotation.y = Math.PI;
    scene.add(sign);
    const awning = new THREE.Mesh(
      new THREE.BoxGeometry(w * 0.6, 0.15, 2),
      M(0x2c3e50,0.9),
    );
    awning.position.set(bx, 3.2, bz - d / 2 - 0.9);
    awning.rotation.x = 0.25;
    awning.castShadow = true;
    scene.add(awning);
    const door = new THREE.Mesh(
      new THREE.BoxGeometry(2, 3, 0.2),
      M(0x222222,0.7),
    );
    door.position.set(bx, 1.5, bz - d / 2 - 0.05);
    scene.add(door);
    colliders.push({ minX: bx - w / 2, maxX: bx + w / 2, minZ: bz - d / 2, maxZ: bz + d / 2 });
  }
  shopFront(210, -150, 24, 7, 16, 0x4a6a8a, 'AUTO DEALER', '#ffffff', '#1a3a5f');
  shopFront(150, -210, 16, 6, 12, 0x5a4a3a, 'GUN SHOP', '#ffe14d', '#222222');
  shopFront(270, 30, 20, 7, 14, 0x6a6a6a, 'GARAGE', '#ffffff', '#333333');
  shopFront(30, 150, 18, 6, 12, 0xc98a5a, 'DINER', '#ffffff', '#7a3a1a');
  shopFront(330, -270, 22, 14, 16, 0x8a8a9a, 'BANK', '#ffffff', '#2a4a6a');
  for (const cx of [-330, -270]) {
    const mast = new THREE.Mesh(
      new THREE.BoxGeometry(3, 42, 3),
      M(0xd8a020,0.7),
    );
    mast.position.set(cx, 21, -350);
    mast.castShadow = true;
    scene.add(mast);
    const arm = new THREE.Mesh(
      new THREE.BoxGeometry(34, 2, 2),
      M(0xd8a020,0.7),
    );
    arm.position.set(cx + 12, 40, -350);
    scene.add(arm);
    const hook = new THREE.Mesh(
      new THREE.BoxGeometry(2, 2, 2),
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
    board.rotation.y = Math.PI / 4;
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
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.6, 6), shelterMat);
      post.position.set(stop.x + dx, 1.3, stop.z - 0.5);
      scene.add(post);
    }
    const shelterRoof = new THREE.Mesh(new THREE.BoxGeometry(3, 0.12, 1.6), shelterMat);
    shelterRoof.position.set(stop.x, 2.7, stop.z - 0.5);
    shelterRoof.castShadow = true;
    scene.add(shelterRoof);
    const rb = makeSign('1路 5路 12路', '#ffffff', '#1a3a5f', 2.2, 1);
    rb.position.set(stop.x, 1.6, stop.z - 1.2);
    scene.add(rb);
  }
  const collectibleMeshes = [];
  for (const spot of landmarks.collectibles) {
    const gem = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.7),
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
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.08, 2.6, 6),
      M(0xdddddd,0.8),
    );
    pole.position.set(x, 1.3, 262);
    const top = new THREE.Mesh(
      new THREE.ConeGeometry(2.4, 1.2, 8),
      new THREE.MeshStandardMaterial({ color: rng.pick([0xe74c3c, 0xf1c40f, 0x2e86c1, 0x16a085]), roughness: 0.9 }),
    );
    top.position.set(x, 3, 262);
    top.castShadow = true;
    scene.add(pole, top);
  }
  for (let i = 0; i < 5; i += 1) {
    const hill = new THREE.Mesh(
      new THREE.ConeGeometry(rng.range(60, 110), rng.range(35, 70), 7),
      M(0x7d9b76),
    );
    hill.position.set(-400 + i * 200, 0, -420);
    scene.add(hill);
  }
  const clouds = [];
  for (let i = 0; i < 6; i += 1) {
    const cloud = new THREE.Group();
    for (let j = 0; j < 3; j += 1) {
      const puff = new THREE.Mesh(
        new THREE.SphereGeometry(rng.range(6, 12), 8, 6),
        new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, transparent: true, opacity: 0.85 }),
      );
      puff.scale.y = 0.45;
      puff.position.set(j * 8 - 8, rng.range(-1, 1), rng.range(-3, 3));
      cloud.add(puff);
    }
    cloud.position.set(rng.range(-350, 350), rng.range(85, 120), rng.range(-350, 250));
    scene.add(cloud);
    clouds.push(cloud);
  }
  return { colliders, landmarks, sea, boats, clouds, collectibleMeshes };
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
