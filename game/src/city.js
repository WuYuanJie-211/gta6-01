// Solara Bay itself: the sunny coastal city. Roads, sidewalks, buildings with lit
// windows, palms, the beach and the sea, the marina, the lighthouse and the parks.
// Everything is built from boxes and cylinders with a few canvas textures, so the
// whole city loads from static files with no network request.
import * as THREE from 'three';
import { CITY, COLOURS } from './config.js';

// Blocks that stay open on purpose (parks and landmarks), keyed "bx,bz".
const PARK_BLOCKS = new Set(['-150,-150', '150,-150', '-150,150']);
const MARINA_BLOCK = '210,210';
const CHOP_BLOCK = '-210,210';
const LIGHTHOUSE_BLOCK = '-210,-210';

/** A canvas texture of a facade: base colour with a grid of windows, some lit. */
function makeFacadeTexture(base, rng) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 128, 256);
  for (let row = 0; row < 12; row += 1) {
    for (let col = 0; col < 6; col += 1) {
      const lit = rng.chance(0.25);
      ctx.fillStyle = lit ? '#ffd98a' : '#2c3e50';
      ctx.fillRect(10 + col * 19, 12 + row * 20, 12, 12);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** A sign board with text on it (MARINA, CHOP SHOP, ...), as a flat plane. */
function makeSign(text, fg, bg) {
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
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(10, 2.5),
    new THREE.MeshStandardMaterial({ map: tex }),
  );
  return mesh;
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

/**
 * Build the city into `scene` and return what the game logic needs:
 * building colliders, the landmark spots the missions use, and the marker
 * anchor positions for the HUD minimap.
 */
export function buildCity(scene, rng) {
  const colliders = [];
  const landmarks = {
    plaza: { x: 0, z: 12 },
    clientSpot: { x: 6, z: 12 },
    marina: { x: 210, z: 258 },
    // Delivery/pickup points sit in FRONT of their buildings, on open ground:
    // the marker must be reachable, and a building's own collision box keeps
    // a player 11 m or more from its centre, so a centre marker with a 10 m
    // radius can never be reached (found by the mission-2 playtest).
    chopShop: { x: -210, z: 194 },
    lighthouse: { x: -216, z: -200 },
    cometSpot: { x: -180, z: 66 },
    packageSpot: { x: -204, z: 194 },
  };

  // Ground: one big slab, then the beach and the sea on top of it to the south.
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

  // Roads: dark strips along every grid line, with pale sidewalks beside them.
  const roadMat = new THREE.MeshStandardMaterial({ color: COLOURS.asphalt, roughness: 1 });
  const walkMat = new THREE.MeshStandardMaterial({ color: COLOURS.sidewalk, roughness: 1 });
  const dashMat = new THREE.MeshStandardMaterial({ color: 0xf5f5f0, roughness: 1 });
  const roadLen = CITY.halfSize * 2;
  for (const line of CITY.roadLines) {
    for (const horizontal of [true, false]) {
      const strip = new THREE.Mesh(new THREE.PlaneGeometry(roadLen, CITY.roadWidth), roadMat);
      strip.rotation.x = -Math.PI / 2;
      if (horizontal) strip.rotation.z = Math.PI / 2;
      strip.position.set(horizontal ? line : 0, 0.05, horizontal ? 0 : line);
      if (!horizontal) strip.position.set(0, 0.05, line);
      strip.receiveShadow = true;
      scene.add(strip);
      // Sidewalks on both sides.
      for (const side of [-1, 1]) {
        const walk = new THREE.Mesh(new THREE.PlaneGeometry(roadLen, 3), walkMat);
        walk.rotation.x = -Math.PI / 2;
        if (horizontal) walk.rotation.z = Math.PI / 2;
        walk.position.set(
          horizontal ? line + side * (CITY.roadWidth / 2 + 1.5) : 0,
          0.06,
          horizontal ? 0 : line + side * (CITY.roadWidth / 2 + 1.5),
        );
        scene.add(walk);
      }
      // Dashed centre line.
      for (let d = -252; d <= 252; d += 12) {
        if (Math.abs(d % 60) < 9) continue; // keep intersections clear
        const dash = new THREE.Mesh(new THREE.BoxGeometry(3, 0.05, 0.4), dashMat);
        dash.position.set(horizontal ? d : line, 0.08, horizontal ? line : d);
        scene.add(dash);
      }
    }
  }

  // Buildings, one block at a time.
  const facadeTextures = COLOURS.building.map((c) => {
    const hex = `#${c.toString(16).padStart(6, '0')}`;
    return makeFacadeTexture(hex, rng);
  });
  const blockCentres = [];
  for (let bx = -210; bx <= 210; bx += 60) {
    for (let bz = -210; bz <= 210; bz += 60) blockCentres.push([bx, bz]);
  }
  for (const [bx, bz] of blockCentres) {
    const key = `${bx},${bz}`;
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
      continue;
    }
    if (key === MARINA_BLOCK || key === CHOP_BLOCK || key === LIGHTHOUSE_BLOCK) continue;
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
      const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 });
      const building = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      building.position.set(x, h / 2, z);
      building.castShadow = true;
      building.receiveShadow = true;
      scene.add(building);
      // Flat roof cap so the top is not a stretched facade.
      const roof = new THREE.Mesh(
        new THREE.BoxGeometry(w + 0.4, 0.4, d + 0.4),
        new THREE.MeshStandardMaterial({ color: 0x555a60, roughness: 1 }),
      );
      roof.position.set(x, h + 0.2, z);
      scene.add(roof);
      colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
    }
  }

  // The marina: docks, boats, a sign.
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

  return { colliders, landmarks };
}

/**
 * Push a circle (position + radius, on the ground plane) out of every building
 * it overlaps. Returns true when anything pushed, so a car can lose speed on a hit.
 */
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
