// Solara Bay v31 — surface + staging upgrade (Superbot's 9-system plan).
// Geometry and mission logic are unchanged from v30; this module only adds
// surface detail, staging, sky and shadows on top of the existing city.
//
// Systems (in plan order):
//   6. Ground shadow pass (blob shadows + AO skirts) — FIRST
//   1. Window texture / facades / rooftop props (1024 atlas, 6 palettes)
//   2. Sign system (12 in the hero zone, 4 colours, unlit)
//   3. Ground system (markings, sidewalks, palms, lights)
//   4. Vehicle readability (glass band, tail lights, shadow) — via vehicles.js
//   5. Skyline + sky (dithered gradient dome, sun, sea, ridges, far skyline)
//   7. Spawn density rule (40x40m hero zone, full budget)
//   8. HUD polish (in hud.js / index.html)
// Plus the 4 v30 defect fixes: tracer aim, white gun stock, beam edges,
// rail plank in shot 1; and the traffic-light one-lamp state machine.
import * as THREE from 'three';
import { BX, CG, CN, PG, SG, MS, MB, ME, GP, V3, PI, CT, SC, RW, DS, AB } from './geo.js';

export const HERO_ZONE = { minX: 220, maxX: 260, minZ: -200, maxZ: -160, cx: 240, cz: -180 };
export function inHeroZone(x, z, pad = 0) {
  return x >= HERO_ZONE.minX - pad && x <= HERO_ZONE.maxX + pad
    && z >= HERO_ZONE.minZ - pad && z <= HERO_ZONE.maxZ + pad;
}

// ---------------------------------------------------------------------------
// 1. Facade atlas: one 1024x1024 canvas, 16 cells of 256px.
//    6 palettes x 2 window styles = 12 facade cells + 4 storefront cells.
//    One cell = 12m wide x 20m tall of facade on a building face.
// ---------------------------------------------------------------------------
export const FACADE_PALETTES = ['#F2E3B3', '#F0C9C0', '#C9E6D8', '#CFE3F0', '#EDE4D3', '#E8A87C'];
export const CELL_WORLD_W = 12;
export const CELL_WORLD_H = 20;

function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.max(0, Math.round(((n >> 16) & 255) * f)));
  const g = Math.min(255, Math.max(0, Math.round(((n >> 8) & 255) * f)));
  const b = Math.min(255, Math.max(0, Math.round((n & 255) * f)));
  return `rgb(${r},${g},${b})`;
}

// Deterministic pseudo-random from an integer (so the atlas is identical
// on every load — no Math.random in texture generation).
function hash01(i) {
  const s = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function drawFacadeCell(ctx, ox, oy, palette, style, seedBase) {
  ctx.fillStyle = palette;
  ctx.fillRect(ox, oy, 256, 256);
  // subtle vertical grime / variation so the facade is not a flat slab
  ctx.fillStyle = 'rgba(0,0,0,0.05)';
  ctx.fillRect(ox, oy + 128, 256, 128);
  // grid: 5 cols x 8 rows, pane 36x22, 4px side gap, 8px row gap so the
  // 6px sill fits inside the gap without touching the next row.
  const cols = 5, rows = 8;
  const pw = 36, ph = 22, gx = 4, gy = 8;
  const x0 = ox + 30, y0 = oy + 12;
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const x = x0 + c * (pw + gx);
      const y = y0 + r * (ph + gy);
      const lit = hash01(seedBase + r * cols + c) < 0.12;
      ctx.fillStyle = lit ? '#FFE9A8' : '#2B3A46';
      ctx.fillRect(x, y, pw, ph);
      // 2px light edge on top of the pane (reflection)
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fillRect(x, y, pw, 2);
      if (style === 0) {
        // 6px lighter sill below the pane, inside the 8px row gap
        ctx.fillStyle = shade(palette, 1.18);
        ctx.fillRect(x - 2, y + ph, pw + 4, 6);
      } else {
        // style B: horizontal mid-bar, no sill
        ctx.fillStyle = shade(palette, 0.82);
        ctx.fillRect(x, y + ph / 2 - 1, pw, 2);
        ctx.fillStyle = shade(palette, 0.9);
        ctx.fillRect(x, y + ph, pw, 2);
      }
    }
  }
}

function drawStorefrontCell(ctx, ox, oy, palette, accent) {
  ctx.fillStyle = palette;
  ctx.fillRect(ox, oy, 256, 256);
  // sign band at the top
  ctx.fillStyle = accent;
  ctx.fillRect(ox, oy, 256, 44);
  // floor-to-ceiling glass panels
  const panels = 4;
  const pw = 52, gap = 8;
  const x0 = ox + 12, y0 = oy + 60;
  for (let i = 0; i < panels; i += 1) {
    const x = x0 + i * (pw + gap);
    ctx.fillStyle = '#2B3A46';
    ctx.fillRect(x, y0, pw, 150);
    ctx.fillStyle = 'rgba(255,255,255,0.30)';
    ctx.fillRect(x, y0, pw, 3);
    ctx.fillRect(x, y0, 3, 150);
    // warm interior glow on one panel in three
    if (i % 3 === 0) {
      ctx.fillStyle = 'rgba(255,233,168,0.55)';
      ctx.fillRect(x + 4, y0 + 100, pw - 8, 46);
    }
  }
  // awning stripe
  ctx.fillStyle = accent;
  ctx.fillRect(ox, y0 + 158, 256, 18);
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  for (let x = ox; x < ox + 256; x += 16) ctx.fillRect(x, y0 + 158, 8, 18);
  // bulkhead below
  ctx.fillStyle = shade(palette, 0.85);
  ctx.fillRect(ox, oy + 232, 256, 24);
}

export function makeFacadeAtlas() {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d');
  const storeAccents = ['#C0392B', '#1F6F8B', '#E67E22', '#2C3E50'];
  for (let i = 0; i < 16; i += 1) {
    const col = i % 4, row = Math.floor(i / 4);
    const ox = col * 256, oy = row * 256;
    if (i < 12) {
      const palette = FACADE_PALETTES[i % 6];
      const style = i < 6 ? 0 : 1;
      drawFacadeCell(ctx, ox, oy, palette, style, i * 40 + 7);
    } else {
      drawStorefrontCell(ctx, ox, oy, FACADE_PALETTES[(i - 12) % 6], storeAccents[i - 12]);
    }
  }
  const tex = new CT(canvas);
  tex.colorSpace = SC;
  tex.wrapS = RW;
  tex.wrapT = RW;
  tex.anisotropy = 8;
  return tex;
}

// Bake a cell + tiling into a BoxGeometry's UVs so all buildings can share
// ONE atlas texture / ONE material (no per-building texture clones).
// cell: 0..15. w,h,d: building size in metres.
export function applyFacadeUVs(geometry, cell, w, h, d) {
  const col = cell % 4, row = Math.floor(cell / 4);
  const ou = col * 0.25, ov = 1 - (row + 1) * 0.25;
  // per-face repeat: px/nx faces are (d x h), pz/nz are (w x h), py/ny (w x d)
  const reps = [
    [(d / CELL_WORLD_W) * 0.25, (h / CELL_WORLD_H) * 0.25], // +x
    [(d / CELL_WORLD_W) * 0.25, (h / CELL_WORLD_H) * 0.25], // -x
    [(w / CELL_WORLD_W) * 0.25, (d / CELL_WORLD_H) * 0.25], // +y (roof, covered)
    [(w / CELL_WORLD_W) * 0.25, (d / CELL_WORLD_H) * 0.25], // -y
    [(w / CELL_WORLD_W) * 0.25, (h / CELL_WORLD_H) * 0.25], // +z
    [(w / CELL_WORLD_W) * 0.25, (h / CELL_WORLD_H) * 0.25], // -z
  ];
  const uv = geometry.attributes.uv;
  for (let f = 0; f < 6; f += 1) {
    for (let v = 0; v < 4; v += 1) {
      const idx = f * 4 + v;
      uv.setXY(idx, ou + uv.getX(idx) * reps[f][0], ov + uv.getY(idx) * reps[f][1]);
    }
  }
  uv.needsUpdate = true;
  return geometry;
}

// ---------------------------------------------------------------------------
// 2. Sign system. 12 names (first word x surname), 4 build-first colours,
//    unlit so they read at dusk. Cached by text+colour.
// ---------------------------------------------------------------------------
export const SIGN_NAMES = [
  'HOTEL SERIWA', 'CAFE PELICANO', 'BODEGA LA OLA', 'MARINE MONTERO',
  'GARAGE ODALYS', 'SUITES MALUN', 'PALACE PIRA', 'CANTINA LAGUNA',
  'FARMACIA KUMALA', 'PENSION BINTU', 'MERCADO TEKO', 'TALLER RASI',
];
export const SIGN_COLORS = ['#C0392B', '#1F6F8B', '#E67E22', '#2C3E50'];
const _signCache = new Map();
export function makeV31Sign(text, bg, fg = '#FFFFFF', w = 10, h = 2.5) {
  const key = `${text}|${bg}|${fg}`;
  let tex = _signCache.get(key);
  if (!tex) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 512, 128);
    ctx.fillStyle = fg;
    // bold condensed sans, all caps, 5% letter spacing
    ctx.font = '800 58px "Arial Narrow", "Helvetica Neue Condensed", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // manual letter-spacing (canvas has no letterSpacing in all browsers)
    const spacing = 58 * 0.05;
    const chars = [...text];
    const widths = chars.map((ch) => ctx.measureText(ch).width);
    const total = widths.reduce((a, b) => a + b, 0) + spacing * (chars.length - 1);
    let x = 256 - total / 2;
    chars.forEach((ch, i) => {
      ctx.fillText(ch, x + widths[i] / 2, 66);
      x += widths[i] + spacing;
    });
    tex = new CT(canvas);
    tex.colorSpace = SC;
    _signCache.set(key, tex);
  }
  const g = new GP();
  const face = new ME(new PG(w, h), new MB({ map: tex }));
  face.position.z = 0.09;
  g.add(new ME(new BX(w, h, 0.16), new MS({ color: 0x1a1a1a, roughness: 0.9 })), face);
  g.userData.v31sign = text;
  return g;
}

// ---------------------------------------------------------------------------
// 6. Ground shadow pass. One 128px radial-gradient alpha texture, reused.
//    Blob shadow: plane at y=0.01, 1.15x footprint, 0.32-0.4 opacity.
//    AO skirt: plane (footprint + 0.8m) at y=0.012, 0.14 opacity.
// ---------------------------------------------------------------------------
let _blobTex = null;
export function blobShadowTexture() {
  if (_blobTex) return _blobTex;
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const gr = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
  gr.addColorStop(0, 'rgba(0,0,0,0.85)');
  gr.addColorStop(0.55, 'rgba(0,0,0,0.45)');
  gr.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gr;
  ctx.fillRect(0, 0, 128, 128);
  _blobTex = new CT(canvas);
  return _blobTex;
}

export function addBlobShadow(parent, x, z, w, d, opacity = 0.36, y = 0.01) {
  const tex = blobShadowTexture();
  const m = new ME(
    new PG(w * 1.15, d * 1.15),
    new MB({ map: tex, transparent: true, opacity, depthWrite: false }),
  );
  m.rotation.x = -PI / 2;
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

export function addAOSkirt(parent, x, z, w, d, opacity = 0.14) {
  const tex = blobShadowTexture();
  const m = new ME(
    new PG(w + 0.8, d + 0.8),
    new MB({ map: tex, transparent: true, opacity, depthWrite: false }),
  );
  m.rotation.x = -PI / 2;
  m.position.set(x, 0.012, z);
  parent.add(m);
  return m;
}

// Debug pass: list every mesh whose bounding-box bottom sits under 0.05
// with no shadow child (i.e. it would float). Returns the offenders.
export function shadowAudit(scene) {
  const bad = [];
  const box = new THREE.Box3();
  const tmp = new THREE.Vector3();
  // Scene-level shadow planes (building AO skirts live on the scene, not
  // on the building group): world pos + half-extents, so a facade detail
  // can be matched to the skirt under its building.
  const groundPlanes = [];
  scene.traverse((o) => {
    if (!o.isMesh || !o.material || !o.material.transparent) return;
    if (!o.geometry || o.geometry.type !== 'PlaneGeometry') return;
    o.getWorldPosition(tmp);
    if (tmp.y > 0.15) return;
    const p = o.geometry.parameters || {};
    groundPlanes.push({ x: tmp.x, z: tmp.z, hx: (p.width || 2) / 2 + 1, hz: (p.height || 2) / 2 + 1 });
  });
  scene.traverse((o) => {
    if (!o.isMesh) return;
    if (o.material && o.material.transparent && o.material.opacity < 0.5) return;
    if (o.geometry && o.geometry.type === 'PlaneGeometry' && o.rotation.x === -PI / 2) return;
    box.setFromObject(o);
    if (box.min.y < 0.05 && box.min.y > -0.5) {
      o.getWorldPosition(tmp);
      // Far scenery (the 200-500m skyline) needs no blob shadow.
      if (Math.hypot(tmp.x, tmp.z) > 300) return;
      // A shadow counts if this mesh, any child, or any ancestor up to the
      // scene carries a transparent shadow plane near the ground (car
      // under-shadows sit at y=0.09, blob/AO at y~0.01 — accept y<0.15),
      // or a scene-level AO skirt covers this object's XZ footprint.
      let hasShadow = false;
      o.traverse((c) => {
        if (c !== o && c.isMesh && c.material && c.material.transparent) hasShadow = true;
      });
      let p = o.parent;
      while (!hasShadow && p && p !== scene) {
        for (const s of p.children) {
          if (s !== o && s.isMesh && s.material && s.material.transparent
            && s.position.y < 0.15) { hasShadow = true; break; }
        }
        p = p.parent;
      }
      if (!hasShadow) {
        for (const gp of groundPlanes) {
          if (Math.abs(tmp.x - gp.x) <= gp.hx && Math.abs(tmp.z - gp.z) <= gp.hz) { hasShadow = true; break; }
        }
      }
      if (!hasShadow) {
        const geo = o.geometry ? o.geometry.type : '?';
        const col = o.material && o.material.color ? '#' + o.material.color.getHexString() : '?';
        bad.push(`${geo}${col}@(${tmp.x.toFixed(1)},${tmp.y.toFixed(2)},${tmp.z.toFixed(1)})`);
      }
    }
  });
  return bad;
}

// ---------------------------------------------------------------------------
// 5. Skyline + sky. Dithered gradient dome (no banding), sun billboard,
//    sea gradient, hill ridges, far skyline boxes sharing 4 baked textures.
// ---------------------------------------------------------------------------
export function makeSkyDome() {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d');
  const stops = [
    [0.0, '#2B2A5E'], [0.38, '#7A4E8C'], [0.68, '#FF8C5A'], [1.0, '#FFB86B'],
  ];
  const gr = ctx.createLinearGradient(0, 0, 0, 1024);
  for (const [p, c] of stops) gr.addColorStop(p, c);
  ctx.fillStyle = gr;
  ctx.fillRect(0, 0, 1024, 1024);
  // 2% dither noise — breaks the gradient into imperceptible grain so the
  // sky never shows banding steps.
  const img = ctx.getImageData(0, 0, 1024, 1024);
  const data = img.data;
  for (let i = 0; i < data.length; i += 4) {
    const n = (hash01(i * 0.37) - 0.5) * 0.04 * 255;
    data[i] = Math.max(0, Math.min(255, data[i] + n));
    data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + n));
    data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + n));
  }
  ctx.putImageData(img, 0, 0);
  const tex = new CT(canvas);
  tex.colorSpace = SC;
  const mat = new MB({ map: tex, side: THREE.BackSide });
  mat.fog = false;
  const dome = new ME(new THREE.SphereGeometry(800, 32, 16), mat);
  return dome;
}

export function makeSunBillboard() {
  const g = new GP();
  // 26m sun disc at 8 degrees elevation, additive; 60m soft glow behind it.
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const gr = ctx.createRadialGradient(128, 128, 4, 128, 128, 126);
  gr.addColorStop(0, 'rgba(255,244,200,1)');
  gr.addColorStop(0.25, 'rgba(255,200,110,0.9)');
  gr.addColorStop(0.6, 'rgba(255,140,90,0.35)');
  gr.addColorStop(1, 'rgba(255,140,90,0)');
  ctx.fillStyle = gr;
  ctx.fillRect(0, 0, 256, 256);
  const tex = new CT(canvas);
  tex.colorSpace = SC;
  const glowMat = new MB({ map: tex, transparent: true, blending: AB, depthWrite: false });
  glowMat.fog = false;
  const glow = new ME(new PG(60, 60), glowMat);
  const coreMat = new MB({ map: tex, transparent: true, blending: AB, depthWrite: false });
  coreMat.fog = false;
  const core = new ME(new PG(26, 26), coreMat);
  // place toward the west-northwest horizon (sunset), 8 deg elevation.
  const az = Math.PI * 0.78, el = (8 * PI) / 180, r = 760;
  const px = Math.cos(az) * Math.cos(el) * r;
  const py = Math.sin(el) * r;
  const pz = Math.sin(az) * Math.cos(el) * r;
  glow.position.set(px, py, pz);
  core.position.set(px, py, pz);
  glow.lookAt(0, 0, 0);
  core.lookAt(0, 0, 0);
  g.add(glow, core);
  return g;
}

export function makeSeaGradient() {
  const canvas = document.createElement('canvas');
  canvas.width = 4;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const gr = ctx.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, '#2E8FA8');
  gr.addColorStop(1, '#1F6F8B');
  ctx.fillStyle = gr;
  ctx.fillRect(0, 0, 4, 256);
  const tex = new CT(canvas);
  tex.colorSpace = SC;
  return tex;
}

export function makeFarSkyline(atlas) {
  // 24 boxes at 450-550m, north/east/west (not over the sea), sharing 4
  // baked facade cells. No window geometry — the texture does the work.
  const g = new GP();
  const mat = new MS({ map: atlas, roughness: 0.9 });
  for (let i = 0; i < 24; i += 1) {
    const ang = (i / 24) * PI * 2 + hash01(i * 3.1) * 0.2;
    // skip the southern sea sector (angle near +z)
    if (Math.sin(ang) > 0.55) continue;
    const r = 450 + hash01(i * 7.7) * 100;
    const x = Math.cos(ang) * r;
    const z = Math.sin(ang) * r;
    const w = 18 + hash01(i * 1.3) * 22;
    const d = 14 + hash01(i * 2.9) * 16;
    const h = 22 + hash01(i * 5.3) * 46;
    const cell = [0, 3, 6, 9][i % 4];
    const geo = new BX(w, h, d);
    applyFacadeUVs(geo, cell, w, h, d);
    const m = new ME(geo, mat);
    m.position.set(x, h / 2, z);
    g.add(m);
  }
  return g;
}

export function makeRidge(color, x, z, radius, height) {
  const m = new ME(
    new CN(radius, height, 7),
    new MS({ color, roughness: 1 }),
  );
  m.position.set(x, 0, z);
  return m;
}

// ---------------------------------------------------------------------------
// 3. Ground dressing: v31 palm (8 frond planes on one alpha texture),
//    road-marking textures (double yellow + white dashes), zebra, stop line.
// ---------------------------------------------------------------------------
let _frondTex = null;
export function frondTexture() {
  if (_frondTex) return _frondTex;
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 128, 128);
  // one frond: a tapered leaf blade with a centre rib
  ctx.strokeStyle = '#2E8B57';
  ctx.fillStyle = '#2E8B57';
  ctx.beginPath();
  ctx.moveTo(64, 126);
  ctx.quadraticCurveTo(30, 70, 14, 14);
  ctx.quadraticCurveTo(58, 60, 64, 126);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(64, 126);
  ctx.quadraticCurveTo(98, 70, 114, 14);
  ctx.quadraticCurveTo(70, 60, 64, 126);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#1E6B3E';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(64, 126);
  ctx.lineTo(64, 10);
  ctx.stroke();
  _frondTex = new CT(canvas);
  return _frondTex;
}

export function makeV31Palm() {
  const group = new GP();
  const trunkMat = new MS({ color: 0x8a6b4f, roughness: 1 });
  const trunk = new ME(new CG(0.16, 0.28, 5, 6), trunkMat);
  trunk.position.y = 2.5;
  trunk.castShadow = true;
  group.add(trunk);
  const tex = frondTexture();
  for (let i = 0; i < 8; i += 1) {
    const frond = new ME(
      new PG(2.6, 2.6),
      new MB({ map: tex, transparent: true, side: DS, depthWrite: false }),
    );
    const a = (i / 8) * PI * 2;
    frond.position.set(Math.cos(a) * 0.9, 5.2, Math.sin(a) * 0.9);
    frond.rotation.y = -a + PI / 2;
    // v31 fix: tilt OUTWARD (+x) so fronds arc out and droop like a palm
    // crown; alternate the angle so the crown is layered, not a flat ring.
    // (The old -0.5 tipped the tops inward, which read as a spiky ball.)
    frond.rotation.x = 0.7 + (i % 2) * 0.35;
    group.add(frond);
  }
  addBlobShadow(group, 0, 0, 1.6, 1.6, 0.36);
  return group;
}

// Road-marking strip: double yellow centre line + white lane dashes,
// baked into ONE texture for the whole road plane.
export function makeRoadMarkingTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 256, 64);
  // double yellow centre line: 0.12m lines, 0.15m gap (scaled to texture)
  ctx.fillStyle = '#E8C547';
  ctx.fillRect(0, 26, 256, 4);
  ctx.fillRect(0, 34, 256, 4);
  // white lane dashes: 2m on / 2m off (half the tile is dash)
  ctx.fillStyle = '#F2F2F2';
  ctx.fillRect(0, 8, 128, 3);
  ctx.fillRect(0, 53, 128, 3);
  const tex = new CT(canvas);
  tex.wrapS = RW;
  tex.wrapT = RW;
  return tex;
}

// ---------------------------------------------------------------------------
// Traffic light state machine: exactly ONE lamp lit, always.
// States cycle R (8s) -> G (6s) -> Y (2s). Phase offset per light.
// ---------------------------------------------------------------------------
const LIGHT_COLORS = [0xff2a1e, 0xffcc00, 0x33cc33]; // R, Y, G
export function makeTrafficLightV31(initialState = 'R', phase = 0) {
  const g = new GP();
  const poleMat = new MS({ color: 0x2c3e50, roughness: 0.7 });
  const pole = new ME(new CG(0.1, 0.13, 5.5, 6), poleMat);
  pole.position.y = 2.75;
  pole.castShadow = true;
  g.add(pole);
  const arm = new ME(new CG(0.08, 0.08, 3.6, 6), poleMat);
  arm.rotation.x = PI / 2;
  arm.position.set(0, 5.4, 1.8);
  g.add(arm);
  const housing = new ME(new BX(0.9, 2.3, 0.5), new MS({ color: 0x1a1a1a, roughness: 0.6 }));
  housing.position.set(0, 4.9, 3.6);
  g.add(housing);
  const lamps = [];
  for (let i = 0; i < 3; i += 1) {
    const mat = new MS({ color: 0x111111, roughness: 0.4, emissive: 0x000000, emissiveIntensity: 0 });
    const lamp = new ME(new SG(0.32, 10, 8), mat);
    lamp.position.set(0, 5.7 - i * 0.8, 3.9);
    g.add(lamp);
    lamps.push(mat);
  }
  function setState(s) {
    // s: 'R' (lamp 0), 'Y' (lamp 1), 'G' (lamp 2). Exactly one on.
    const on = s === 'G' ? 2 : s === 'Y' ? 1 : 0;
    for (let i = 0; i < 3; i += 1) {
      const m = lamps[i];
      if (i === on) {
        m.color.setHex(LIGHT_COLORS[i]);
        m.emissive.setHex(LIGHT_COLORS[i]);
        m.emissiveIntensity = 3;
      } else {
        m.color.setHex(0x111111);
        m.emissive.setHex(0x000000);
        m.emissiveIntensity = 0;
      }
    }
    g.userData.state = s;
  }
  g.userData.lamps = lamps;
  g.userData.setState = setState;
  g.userData.phase = phase;
  setState(initialState);
  addBlobShadow(g, 0, 0, 1.2, 1.2, 0.36);
  return g;
}

export function updateTrafficLights(lights, time) {
  // 16s cycle: R 0-8, G 8-14, Y 14-16.
  for (const l of lights) {
    const t = (time + (l.userData.phase || 0)) % 16;
    const s = t < 8 ? 'R' : t < 14 ? 'G' : 'Y';
    if (l.userData.state !== s) l.userData.setState(s);
  }
}

// ---------------------------------------------------------------------------
// Soft beam (replaces the hard-edged cone in shots.js): 32 radial segments
// + a smooth ease gradient + a wide low-opacity halo cone, so the silhouette
// has no triangle facets and no hard edge.
// ---------------------------------------------------------------------------
let _beamTex = null;
export function beamTexture() {
  if (_beamTex) return _beamTex;
  const canvas = document.createElement('canvas');
  canvas.width = 8;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const gr = ctx.createLinearGradient(0, 0, 0, 64);
  gr.addColorStop(0, 'rgba(0,0,0,0)');
  gr.addColorStop(0.25, 'rgba(255,255,255,0.25)');
  gr.addColorStop(0.6, 'rgba(255,255,255,0.85)');
  gr.addColorStop(0.9, 'rgba(255,255,255,1)');
  gr.addColorStop(1, 'rgba(255,255,255,0.9)');
  ctx.fillStyle = gr;
  ctx.fillRect(0, 0, 8, 64);
  _beamTex = new CT(canvas);
  return _beamTex;
}

export function makeSoftBeam(scene, a, b, rt, rb, opacity) {
  const tex = beamTexture();
  const g = new GP();
  const d = new V3(a.x - b.x, a.y - b.y, a.z - b.z);
  const L = d.length();
  d.normalize();
  const mid = new V3((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  const q = new THREE.Quaternion().setFromUnitVectors(new V3(0, 1, 0), d);
  // core cone: 32 segments, smooth gradient, additive
  const core = new ME(
    new CG(rt, rb, L, 32, 1, true),
    new MB({ map: tex, transparent: true, opacity, blending: AB, depthWrite: false, side: DS }),
  );
  core.position.copy(mid);
  core.quaternion.copy(q);
  g.add(core);
  // halo cone: 2.2x wider, 0.3x opacity — softens the silhouette edge
  const halo = new ME(
    new CG(rt * 2.2, rb * 2.2, L, 32, 1, true),
    new MB({ map: tex, transparent: true, opacity: opacity * 0.3, blending: AB, depthWrite: false, side: DS }),
  );
  halo.position.copy(mid);
  halo.quaternion.copy(q);
  g.add(halo);
  scene.add(g);
  return g;
}
