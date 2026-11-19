// Solara Bay v2: four districts (downtown, port, suburbs, old town),
// beach and sea, lighthouse, parks, lamps, billboards, bus stops, signs.
// Boxes and cylinders with a few canvas textures; no network.
import * as THREE from 'three';
import { CITY, COLOURS, districtAt } from './config.js';

// Blocks that stay open on purpose (parks and landmarks), keyed "bx,bz".
const PARK_BLOCKS = new Set(['-150,-150', '150,-150', '-150,150', '270,150']);
const MARINA_BLOCK = '210,210';
const CHOP_BLOCK = '-210,210';
const LIGHTHOUSE_BLOCK = '-210,-210';
const DEALER_BLOCK = '210,-150';
const GUN_BLOCK = '150,-210';
const GARAGE_BLOCK = '270,30';
const DINER_BLOCK = '30,150';
const BANK_BLOCK = '330,-270';

/** A canvas texture of a facade: base colour with a grid of windows, some lit. */
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
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** A house facade: few windows and a door, for the suburbs. */
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

/** A sign board with text on it (MARINA, CHOP SHOP, ...), as a flat plane. */
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
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x8a6b4f, roughness: 1 });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x2e8b57, roughness: 1 });
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
    if (o.isMesh) o.castShadow = true;
  });
  return group;
}

function makeTree(rng) {
  const group = new THREE.Group();
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.2, 0.3, 2, 6),
    new THREE.MeshStandardMaterial({ color: 0x6b4a2f, roughness: 1 }),
  );
  trunk.position.y = 1;
  const top = new THREE.Mesh(
    new THREE.IcosahedronGeometry(rng.range(1.4, 2.2), 0),
    new THREE.MeshStandardMaterial({ color: 0x3e8f4f, roughness: 1 }),
  );
  top.position.y = 3.2;
  top.castShadow = true;
  group.add(trunk, top);
  return group;
}

/** A street lamp: pole plus a warm glowing head. */
function makeLamp() {
  const group = new THREE.Group();
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.09, 0.12, 5.5, 6),
    new THREE.MeshStandardMaterial({ color: 0x2c3e50, roughness: 0.7 }),
  );
  pole.position.y = 2.75;
  const head = new THREE.Mesh(
    new THREE.BoxGeometry(0.9, 0.25, 0.35),
    new THREE.MeshStandardMaterial({ color: 0xffe9a8, emissive: 0xaa8800, roughness: 0.4 }),
  );
  head.position.y = 5.5;
  group.add(pole, head);
  return group;
}

/** A bench: seat and back, for parks and bus stops. */
function makeBench() {
  const group = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0x8a6b4f, roughness: 1 });
  const seat = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.12, 0.6), wood);
  seat.position.y = 0.5;
  const back = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.7, 0.1), wood);
  back.position.set(0, 0.9, -0.28);
  group.add(seat, back);
  return group;
}

/** A billboard on two poles, with a text face. */
function makeBillboard(text, fg, bg) {
  const group = new THREE.Group();
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x555a60, roughness: 0.8 });
  for (const dx of [-4, 4]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 7, 6), poleMat);
    pole.position.set(dx, 3.5, 0);
    group.add(pole);
  }
  const face = makeSign(text, fg, bg, 12, 3);
  face.position.y = 8.5;
  group.add(face);
  return group;
}

/** Build the city into `scene`; return colliders, landmarks, the sea and the
 * boats (for the water bob), and the clouds (for the drift). */
export function buildCity(scene, rng) {
  const colliders = [];
  const landmarks = {
    plaza: { x: 0, z: 12 },
    clientSpot: { x: 6, z: 12 },
    marina: { x: 210, z: 258 },
    // Delivery points sit in FRONT of their buildings: a building's collision
    // box keeps a player 11 m from its centre, so a centre marker with a 10 m
    // radius can never be reached (found by the mission-2 playtest).
    chopShop: { x: -210, z: 194 },
    lighthouse: { x: -216, z: -200 },
    cometSpot: { x: -180, z: 66 },
    packageSpot: { x: -204, z: 194 },
    // Shops sit on real block centres, in front of their buildings —
    // never on an intersection, where they would block the road.
    dealer: { x: 210, z: -126 },
    gunShop: { x: 150, z: -186 },
    garage: { x: 270, z: 54 },
    diner: { x: 30, z: 174 },
    bank: { x: 330, z: -246 },
    armoredSpot: { x: 318, z: -240 },
    portDeliver: { x: -300, z: -288 },
    taxiStand: { x: 12, z: 18 },
    // Five hidden packages, one per district corner.
    collectibles: [
      { x: 120, z: -300 },
      { x: -330, z: -270 },
      { x: 300, z: 120 },
      { x: 180, z: 258 },
      { x: -150, z: -150 },
    ],
    // Four race checkpoints around the outer loop.
    race: [
      { x: 0, z: -360 },
      { x: 360, z: -60 },
      { x: 300, z: 240 },
      { x: -360, z: 180 },
    ],
    // Bus stops where waiting pedestrians stand (and taxi fares flag down).
    busStops: [
      { x: 7.5, z: 60 },
      { x: -127.5, z: -120 },
      { x: 247.5, z: 120 },
    ],
  };

  // Ground: one big slab, then the beach and the sea on top of it.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(CITY.halfSize * 2 + 400, CITY.halfSize * 2 + 400),
    new THREE.MeshStandardMaterial({ color: COLOURS.ground, roughness: 1 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const beach = new THREE.Mesh(
    new THREE.PlaneGeometry(560, 60),
    new THREE.MeshStandardMaterial({ color: COLOURS.sand, roughness: 1 }),
  );
  beach.rotation.x = -Math.PI / 2;
  beach.position.set(0, 0.03, 276);
  beach.receiveShadow = true;
  scene.add(beach);

  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(900, 300),
    new THREE.MeshStandardMaterial({ color: COLOURS.sea, roughness: 0.3, metalness: 0.1 }),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(0, 0.02, 456);
  scene.add(sea);

  // Roads: dark strips along every grid line, pale sidewalks beside them.
  const roadMat = new THREE.MeshStandardMaterial({ color: COLOURS.asphalt, roughness: 1 });
  const walkMat = new THREE.MeshStandardMaterial({ color: COLOURS.sidewalk, roughness: 1 });
  const dashMat = new THREE.MeshStandardMaterial({ color: 0xf5f5f0, roughness: 1 });
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
    for (let d = -360; d <= 240; d += 12) {
      if (Math.abs(d % 60) < 9) continue; // keep intersections clear
      const dash = new THREE.Mesh(new THREE.BoxGeometry(3, 0.05, 0.4), dashMat);
      dash.position.set(line, 0.08, d);
      scene.add(dash);
    }
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
    for (let d = -360; d <= 360; d += 12) {
      if (Math.abs(d % 60) < 9) continue;
      const dash = new THREE.Mesh(new THREE.BoxGeometry(3, 0.05, 0.4), dashMat);
      dash.position.set(d, 0.08, line);
      scene.add(dash);
    }
  }

  // Buildings, one block at a time. Block centres sit halfway between lines.
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
      const park = new THREE.Mesh(
        new THREE.PlaneGeometry(46, 46),
        new THREE.MeshStandardMaterial({ color: COLOURS.grass, roughness: 1 }),
      );
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
      // Container yard: stacked coloured containers, one warehouse, cranes.
      for (let i = 0; i < 6; i += 1) {
        const cx = bx + rng.range(-16, 10);
        const cz = bz + rng.range(-16, 10);
        const stack = rng.int(1, 2);
        for (let s = 0; s < stack; s += 1) {
          const cont = new THREE.Mesh(
            new THREE.BoxGeometry(6, 2.6, 2.6),
            new THREE.MeshStandardMaterial({ color: rng.pick(COLOURS.container), roughness: 0.8 }),
          );
          cont.position.set(cx, 1.3 + s * 2.6, cz);
          cont.rotation.y = rng.chance(0.5) ? 0 : Math.PI / 2;
          cont.castShadow = true;
          scene.add(cont);
        }
        colliders.push({ minX: cx - 3.2, maxX: cx + 3.2, minZ: cz - 3.2, maxZ: cz + 3.2 });
      }
      const warehouse = new THREE.Mesh(
        new THREE.BoxGeometry(30, 9, 20),
        new THREE.MeshStandardMaterial({ color: 0x8a7a68, roughness: 1 }),
      );
      warehouse.position.set(bx + 8, 4.5, bz + 8);
      warehouse.castShadow = true;
      scene.add(warehouse);
      colliders.push({ minX: bx - 7, maxX: bx + 23, minZ: bz - 2, maxZ: bz + 18 });
      continue;
    }
    if (district === 'DOWNTOWN') {
      // One glass tower per block, with roof props and sometimes a neon sign.
      const w = rng.range(18, 26);
      const d = rng.range(18, 26);
      const h = rng.range(30, 85);
      const x = bx + rng.range(-6, 6);
      const z = bz + rng.range(-6, 6);
      const tex = rng.pick(towerTextures).clone();
      tex.needsUpdate = true;
      tex.repeat.set(Math.max(1, Math.round(w / 10)), Math.max(1, Math.round(h / 12)));
      const tower = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 }));
      tower.position.set(x, h / 2, z);
      tower.castShadow = true;
      tower.receiveShadow = true;
      scene.add(tower);
      const roof = new THREE.Mesh(
        new THREE.BoxGeometry(w + 0.4, 0.5, d + 0.4),
        new THREE.MeshStandardMaterial({ color: 0x3a3f45, roughness: 1 }),
      );
      roof.position.set(x, h + 0.25, z);
      scene.add(roof);
      // Roof props: an AC box and an antenna with a red beacon.
      const ac = new THREE.Mesh(new THREE.BoxGeometry(3, 1.5, 2), new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 1 }));
      ac.position.set(x + w / 4, h + 1.2, z);
      scene.add(ac);
      const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 6, 6), new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.6 }));
      antenna.position.set(x - w / 4, h + 3, z - d / 4);
      scene.add(antenna);
      const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), new THREE.MeshStandardMaterial({ color: 0xff2222, emissive: 0xaa0000 }));
      beacon.position.set(x - w / 4, h + 6.2, z - d / 4);
      scene.add(beacon);
      if (towerSignIdx < towerSigns.length && rng.chance(0.6)) {
        const sign = makeSign(towerSigns[towerSignIdx], '#ffffff', '#1a1a2e', 12, 3);
        sign.position.set(x, h - 6, z + d / 2 + 0.1);
        scene.add(sign);
        towerSignIdx += 1;
      }
      colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
      continue;
    }
    if (district === 'SUBURBS') {
      // Low houses with pitched roofs, gardens and trees.
      const count = rng.int(2, 3);
      for (let i = 0; i < count; i += 1) {
        const w = rng.range(10, 14);
        const d = rng.range(8, 12);
        const h = rng.range(5, 8);
        const x = bx + rng.range(-14, 14);
        const z = bz + rng.range(-14, 14);
        const tex = rng.pick(houseTextures).clone();
        tex.needsUpdate = true;
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
        const garden = new THREE.Mesh(
          new THREE.PlaneGeometry(w + 6, d + 6),
          new THREE.MeshStandardMaterial({ color: COLOURS.grass, roughness: 1 }),
        );
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
    // Old town: the v1 blocks, 1-3 mid buildings, taller near the centre.
    const distCentre = Math.hypot(bx, bz);
    const tall = distCentre < 130;
    const count = rng.int(1, 3);
    for (let i = 0; i < count; i += 1) {
      const w = rng.range(12, 22);
      const d = rng.range(12, 22);
      const h = tall ? rng.range(20, 55) : rng.range(8, 24);
      const x = bx + rng.range(-12, 12);
      const z = bz + rng.range(-12, 12);
      const tex = rng.pick(facadeTextures).clone();
      tex.needsUpdate = true;
      tex.repeat.set(Math.max(1, Math.round(w / 10)), Math.max(1, Math.round(h / 12)));
      const building = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }));
      building.position.set(x, h / 2, z);
      building.castShadow = true;
      building.receiveShadow = true;
      scene.add(building);
      const roof = new THREE.Mesh(
        new THREE.BoxGeometry(w + 0.4, 0.4, d + 0.4),
        new THREE.MeshStandardMaterial({ color: 0x555a60, roughness: 1 }),
      );
      roof.position.set(x, h + 0.2, z);
      scene.add(roof);
      if (rng.chance(0.3)) {
        const ac = new THREE.Mesh(new THREE.BoxGeometry(2.5, 1.2, 1.8), new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 1 }));
        ac.position.set(x + w / 4, h + 0.8, z);
        scene.add(ac);
      }
      colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
    }
  }

  // The marina: docks, boats, a sign.
  const boats = [];
  {
    const dockMat = new THREE.MeshStandardMaterial({ color: 0x8a6b4f, roughness: 1 });
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
        new THREE.MeshStandardMaterial({ color: 0xdddddd, roughness: 0.6 }),
      );
      mast.position.set(186 + i * 18, 5, 274);
      scene.add(mast);
    }
    const sign = makeSign('MARINA', '#ffffff', '#1a5f8a');
    sign.position.set(210, 5, 244);
    scene.add(sign);
  }

  // The chop shop: a low warehouse with a sign, at the west edge.
  {
    const shop = new THREE.Mesh(
      new THREE.BoxGeometry(30, 8, 20),
      new THREE.MeshStandardMaterial({ color: 0x7a6a58, roughness: 1 }),
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

  // The lighthouse: striped tower on a round base, at the north-west corner.
  {
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(9, 11, 1.5, 16),
      new THREE.MeshStandardMaterial({ color: 0x9aa0a3, roughness: 1 }),
    );
    base.position.set(-216, 0.75, -216);
    base.castShadow = true;
    scene.add(base);
    const towerMat = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.8 });
    const stripeMat = new THREE.MeshStandardMaterial({ color: 0xd21f2b, roughness: 0.8 });
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
      new THREE.MeshStandardMaterial({ color: 0xffe14d, emissive: 0xaa8800, roughness: 0.4 }),
    );
    lamp.position.set(-216, 29.5, -216);
    scene.add(lamp);
    const cap = new THREE.Mesh(
      new THREE.ConeGeometry(3.4, 2.5, 12),
      new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.8 }),
    );
    cap.position.set(-216, 32.2, -216);
    scene.add(cap);
    colliders.push({ minX: -227, maxX: -205, minZ: -227, maxZ: -205 });
  }

  // Shop fronts: small buildings with signs, each on a kept-open block.
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
    colliders.push({ minX: bx - w / 2, maxX: bx + w / 2, minZ: bz - d / 2, maxZ: bz + d / 2 });
  }
  shopFront(210, -150, 24, 7, 16, 0x4a6a8a, 'AUTO DEALER', '#ffffff', '#1a3a5f');
  shopFront(150, -210, 16, 6, 12, 0x5a4a3a, 'GUN SHOP', '#ffe14d', '#222222');
  shopFront(270, 30, 20, 7, 14, 0x6a6a6a, 'GARAGE', '#ffffff', '#333333');
  shopFront(30, 150, 18, 6, 12, 0xc98a5a, 'DINER', '#ffffff', '#7a3a1a');
  shopFront(330, -270, 22, 14, 16, 0x8a8a9a, 'BANK', '#ffffff', '#2a4a6a');

  // Port cranes: mast, arm and a hanging hook block, at the north edge.
  for (const cx of [-330, -270]) {
    const mast = new THREE.Mesh(
      new THREE.BoxGeometry(3, 42, 3),
      new THREE.MeshStandardMaterial({ color: 0xd8a020, roughness: 0.7 }),
    );
    mast.position.set(cx, 21, -350);
    mast.castShadow = true;
    scene.add(mast);
    const arm = new THREE.Mesh(
      new THREE.BoxGeometry(34, 2, 2),
      new THREE.MeshStandardMaterial({ color: 0xd8a020, roughness: 0.7 }),
    );
    arm.position.set(cx + 12, 40, -350);
    scene.add(arm);
    const hook = new THREE.Mesh(
      new THREE.BoxGeometry(2, 2, 2),
      new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.8 }),
    );
    hook.position.set(cx + 24, 34, -350);
    scene.add(hook);
  }

  // Street lamps along the main avenue (x = 0) and the coast road (z = 240).
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

  // Billboards at four big intersections.
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

  // Bus stops: a bench and a small sign, where waiting pedestrians stand.
  for (const stop of landmarks.busStops) {
    const bench = makeBench();
    bench.position.set(stop.x, 0, stop.z);
    scene.add(bench);
    const sign = makeSign('BUS', '#ffffff', '#2a6a3a', 2.4, 1.2);
    sign.position.set(stop.x, 2.2, stop.z);
    scene.add(sign);
  }

  // Hidden packages: small glowing green diamonds, one per district corner.
  const collectibleMeshes = [];
  for (const spot of landmarks.collectibles) {
    const gem = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.7),
      new THREE.MeshStandardMaterial({ color: 0x33dd66, emissive: 0x228833, roughness: 0.3 }),
    );
    gem.position.set(spot.x, 1.5, spot.z);
    scene.add(gem);
    collectibleMeshes.push(gem);
  }

  // Palms along the beach and the main avenue.
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

  // Beach umbrellas: a cone on a pole, a few bright colours.
  for (let i = 0; i < 8; i += 1) {
    const x = -220 + i * 62;
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.08, 2.6, 6),
      new THREE.MeshStandardMaterial({ color: 0xdddddd, roughness: 0.8 }),
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

  // Distant hills to the north, so the horizon is not a flat line.
  for (let i = 0; i < 5; i += 1) {
    const hill = new THREE.Mesh(
      new THREE.ConeGeometry(rng.range(60, 110), rng.range(35, 70), 7),
      new THREE.MeshStandardMaterial({ color: 0x7d9b76, roughness: 1 }),
    );
    hill.position.set(-400 + i * 200, 0, -420);
    scene.add(hill);
  }

  // Clouds: flat white blobs drifting over the city (main.js moves them).
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

/** Push a circle (position + radius) out of every building it overlaps.
 * Returns true when anything pushed, so a car can lose speed on a hit. */
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
