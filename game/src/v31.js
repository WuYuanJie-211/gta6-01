// Visual upgrade: facades, signs, ground dressing, sky, shadows and
// traffic lights. Geometry and missions live elsewhere; this module only
// makes the city LOOK like a place — one 1024px facade atlas shared by
// every tower, big unlit signs, blob shadows, a dithered sunset dome.
import * as THREE from 'three';
import { BX, CG, CN, PG, SG, MS, MB, ME, GP, V3, PI, CT, SC, RW, DS, AB } from './geo.js';

// The 40x40 m hero zone all four screenshots are staged in.
export const HERO_ZONE = { minX: 220, maxX: 260, minZ: -200, maxZ: -160, cx: 240, cz: -180 };
export function inHeroZone(x, z, pad = 0) {
  return x >= HERO_ZONE.minX - pad && x <= HERO_ZONE.maxX + pad
    && z >= HERO_ZONE.minZ - pad && z <= HERO_ZONE.maxZ + pad;
}

// ---------------------------------------------------------------------------
// Facade atlas: one 1024 canvas, 16 cells of 256px.
// Cells 0-11 are tower facades (6 pastel palettes x 2 window styles);
// cells 12-15 are ground-floor storefronts (glass + sign band + awning).
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

// Deterministic hash from an integer, so the atlas is identical on every
// load — no Math.random in texture generation.
function hash01(i) {
  const s = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function drawFacadeCell(ctx, ox, oy, palette, style, seedBase) {
  ctx.fillStyle = palette;
  ctx.fillRect(ox, oy, 256, 256);
  // A subtle darker lower half so the facade is not one flat slab.
  ctx.fillStyle = 'rgba(0,0,0,0.05)';
  ctx.fillRect(ox, oy + 128, 256, 128);
  // Window grid: 5 columns x 8 rows, 36x22 panes.
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
      // A 2px light edge on top of each pane — the reflection line.
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fillRect(x, y, pw, 2);
      if (style === 0) {
        // Lighter sill below the pane, inside the 8px row gap.
        ctx.fillStyle = shade(palette, 1.18);
        ctx.fillRect(x - 2, y + ph, pw + 4, 6);
      } else {
        // Style B: horizontal mid-bar, no sill.
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
  // Sign band across the top.
  ctx.fillStyle = accent;
  ctx.fillRect(ox, oy, 256, 44);
  // Four floor-to-ceiling glass panels.
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
    // Warm interior glow on one panel in three.
    if (i % 3 === 0) {
      ctx.fillStyle = 'rgba(255,233,168,0.55)';
      ctx.fillRect(x + 4, y0 + 100, pw - 8, 46);
    }
  }
  // Striped awning.
  ctx.fillStyle = accent;
  ctx.fillRect(ox, y0 + 158, 256, 18);
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  for (let x = ox; x < ox + 256; x += 16) ctx.fillRect(x, y0 + 158, 8, 18);
  // Bulkhead below.
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

// Bake one atlas cell + tiling into a BoxGeometry's UVs, so every building
// can share ONE atlas texture and ONE material (no per-building clones).
// cell: 0..15. w,h,d: building size in metres.
export function applyFacadeUVs(geometry, cell, w, h, d) {
  const col = cell % 4, row = Math.floor(cell / 4);
  const ou = col * 0.25, ov = 1 - (row + 1) * 0.25;
  // Per-face repeat: +x/-x faces are (d x h), +z/-z are (w x h),
  // +y/-y (roof) are (w x d). A cell covers 12x20 m of wall.
  const reps = [
    [(d / CELL_WORLD_W) * 0.25, (h / CELL_WORLD_H) * 0.25], // +x
    [(d / CELL_WORLD_W) * 0.25, (h / CELL_WORLD_H) * 0.25], // -x
    [(w / CELL_WORLD_W) * 0.25, (d / CELL_WORLD_H) * 0.25], // +y
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
// Signs: 12 names, unlit materials so they read at dusk.
// ---------------------------------------------------------------------------
export const SIGN_NAMES = [
  'HOTEL', 'CAFE', 'BODEGA', 'MARINE',
  'GARAGE', 'SUITES', 'PALACE', 'CANTINA',
  'FARMACIA', 'PENSION', 'MERCADO', 'TALLER',
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
    // Bold condensed sans, all caps. Auto-fit: shrink the font until the
    // whole word fits the 512px panel.
    const chars = [...text];
    let size = 58;
    let widths = [];
    let total = 0;
    while (size >= 26) {
      ctx.font = `800 ${size}px "Arial Narrow", "Helvetica Neue Condensed", system-ui, sans-serif`;
      const spacing = size * 0.05;
      widths = chars.map((ch) => ctx.measureText(ch).width);
      total = widths.reduce((a, b) => a + b, 0) + spacing * (chars.length - 1);
      if (total <= 496) break;
      size -= 2;
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // Manual letter-spacing (canvas has no letterSpacing in all browsers).
    const spacing = size * 0.05;
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
// Ground shadows. One 128px radial-gradient alpha texture, reused for
// every blob shadow and AO skirt in the game.
// ---------------------------------------------------------------------------
let _blobTex = null;
export function blobShadowTexture() {
  if (_blobTex) return _blobTex;
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  // Dark, wide core so the blob reads even on dark asphalt; soft falloff
  // so it never reads as a hard black disc.
  const gr = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
  gr.addColorStop(0, 'rgba(0,0,0,0.95)');
  gr.addColorStop(0.5, 'rgba(0,0,0,0.7)');
  gr.addColorStop(0.75, 'rgba(0,0,0,0.35)');
  gr.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gr;
  ctx.fillRect(0, 0, 128, 128);
  _blobTex = new CT(canvas);
  return _blobTex;
}

// Soft contact shadow under a grounded object: 1.3x its footprint.
export function addBlobShadow(parent, x, z, w, d, opacity = 0.55, y = 0.08) {
  const tex = blobShadowTexture();
  const m = new ME(
    new PG(w * 1.3, d * 1.3),
    new MB({ map: tex, transparent: true, opacity, depthWrite: false }),
  );
  m.rotation.x = -PI / 2;
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

// Ambient-occlusion skirt where a building meets the ground.
export function addAOSkirt(parent, x, z, w, d, opacity = 0.25) {
  const tex = blobShadowTexture();
  const m = new ME(
    new PG(w + 1.2, d + 1.2),
    new MB({ map: tex, transparent: true, opacity, depthWrite: false }),
  );
  m.rotation.x = -PI / 2;
  m.position.set(x, 0.012, z);
  parent.add(m);
  return m;
}

// ---------------------------------------------------------------------------
// Skyline + sky. Dithered gradient dome, sun glow, sea, far skyline.
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
  // 0.6% dither noise — without it the gradient bands visibly at this size.
  const img = ctx.getImageData(0, 0, 1024, 1024);
  const data = img.data;
  for (let y = 0; y < 1024; y += 1) {
    for (let x = 0; x < 1024; x += 1) {
      const i = (y * 1024 + x) * 4;
      const n = (hash01((x & 63) * 64 + (y & 63)) - 0.5) * 0.012 * 255;
      data[i] = Math.max(0, Math.min(255, data[i] + n));
      data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + n));
      data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + n));
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new CT(canvas);
  tex.colorSpace = SC;
  const mat = new MB({ map: tex, side: THREE.BackSide });
  mat.fog = false;
  return new ME(new THREE.SphereGeometry(800, 32, 16), mat);
}

export function makeSunBillboard() {
  const g = new GP();
  // One wide soft glow with a long gradual falloff, plus a small dim core.
  // No hard disc: a hard sun reads as a flat circle pasted on the sky.
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const gr = ctx.createRadialGradient(128, 128, 2, 128, 128, 126);
  gr.addColorStop(0, 'rgba(255,244,200,0.95)');
  gr.addColorStop(0.12, 'rgba(255,220,150,0.75)');
  gr.addColorStop(0.3, 'rgba(255,190,110,0.45)');
  gr.addColorStop(0.55, 'rgba(255,150,90,0.2)');
  gr.addColorStop(0.8, 'rgba(255,130,80,0.06)');
  gr.addColorStop(1, 'rgba(255,130,80,0)');
  ctx.fillStyle = gr;
  ctx.fillRect(0, 0, 256, 256);
  const tex = new CT(canvas);
  tex.colorSpace = SC;
  const glowMat = new MB({ map: tex, transparent: true, blending: AB, depthWrite: false });
  glowMat.fog = false;
  const glow = new ME(new PG(110, 110), glowMat);
  const coreMat = new MB({ map: tex, transparent: true, blending: AB, depthWrite: false, opacity: 0.55 });
  coreMat.fog = false;
  const core = new ME(new PG(11, 11), coreMat);
  // West-northwest horizon, 8 degrees up — the sunset direction.
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
  // 24 boxes at 450-550 m, north/east/west (never over the sea), sharing
  // 4 baked facade cells. No window geometry — the texture does the work.
  const g = new GP();
  const mat = new MS({ map: atlas, roughness: 0.9 });
  for (let i = 0; i < 24; i += 1) {
    const ang = (i / 24) * PI * 2 + hash01(i * 3.1) * 0.2;
    if (Math.sin(ang) > 0.55) continue; // skip the southern sea sector
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
// Ground dressing: palms (8 frond planes on one alpha texture) and the
// road-marking texture (double yellow + white dashes, one tile per road).
// ---------------------------------------------------------------------------
let _frondTex = null;
export function frondTexture() {
  if (_frondTex) return _frondTex;
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 128, 128);
  // One frond: two tapered leaf blades with a centre rib.
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
  // sRGB so the fronds render green, not the teal the linear
  // interpretation produced under the sunset light.
  _frondTex.colorSpace = SC;
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
    // Tilt OUTWARD so the fronds arc out and droop like a palm crown;
    // alternate the angle so the crown is layered, not a flat ring.
    frond.rotation.x = 0.7 + (i % 2) * 0.35;
    group.add(frond);
  }
  addBlobShadow(group, 0, 0, 1.6, 1.6, 0.55);
  return group;
}

// Double yellow centre line + white lane dashes, baked into one tile.
// Deep olive + mid-grey: survives the sunset grade and reads as paint,
// not as light shafts or curb bleed.
export function makeRoadMarkingTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 256, 64);
  ctx.fillStyle = '#4a3510';
  ctx.fillRect(0, 26, 256, 4);
  ctx.fillRect(0, 34, 256, 4);
  // White lane dashes: 2 m on / 2 m off (half the tile is dash).
  ctx.fillStyle = '#707070';
  ctx.fillRect(0, 14, 128, 3);
  ctx.fillRect(0, 47, 128, 3);
  const tex = new CT(canvas);
  tex.wrapS = RW;
  tex.wrapT = RW;
  return tex;
}

// ---------------------------------------------------------------------------
// Traffic lights: exactly ONE lamp lit. R 8s -> G 6s -> Y 2s, phase offset.
// The red lamp carries a halo RING (transparent centre so the orb shows
// through, bright ring band fading outside) — a soft blob hid behind the
// lamp sphere and read as nothing, the ring reads from any angle.
// ---------------------------------------------------------------------------
const LIGHT_COLORS = [0xff2a1e, 0xffcc00, 0x33cc33]; // R, Y, G

let _ringTex = null;
function haloRingTexture() {
  if (_ringTex) return _ringTex;
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.42, 'rgba(255,255,255,0)');
  g.addColorStop(0.52, 'rgba(255,255,255,0.95)');
  g.addColorStop(0.68, 'rgba(255,255,255,0.85)');
  g.addColorStop(0.85, 'rgba(255,255,255,0.25)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 256, 256);
  _ringTex = new CT(c);
  return _ringTex;
}

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
  // Near-black housing so the red orb pops by contrast.
  const housing = new ME(new BX(0.9, 2.3, 0.3), new MS({ color: 0x140404, roughness: 0.6 }));
  housing.position.set(0, 4.9, 3.6);
  g.add(housing);
  const lamps = [];
  for (let i = 0; i < 3; i += 1) {
    // Unlit basic material — a lit lamp reads saturated red on any bg.
    const mat = new MB({ color: 0x330a06 });
    const lamp = new ME(new SG(0.45, 12, 10), mat);
    lamp.position.set(0, 5.7 - i * 0.8, 3.6);
    g.add(lamp);
    lamps.push(mat);
  }
  // Ring halo, 2.2 m across — the band sits just outside the 0.45 orb.
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloRingTexture(), transparent: true, opacity: 0.85, depthWrite: false }));
  glow.scale.set(2.2, 2.2, 1);
  g.add(glow);

  function setState(s) {
    // s: 'R' (lamp 0), 'Y' (lamp 1), 'G' (lamp 2). Exactly one on.
    const on = s === 'G' ? 2 : s === 'Y' ? 1 : 0;
    for (let i = 0; i < 3; i += 1) {
      lamps[i].color.setHex(i === on ? LIGHT_COLORS[i] : 0x330a06);
    }
    glow.position.set(0, 5.7 - on * 0.8, 3.9);
    glow.material.color.setHex(LIGHT_COLORS[on]);
    g.userData.state = s;
  }

  g.userData.lamps = lamps;
  g.userData.setState = setState;
  g.userData.phase = phase;
  setState(initialState);
  addBlobShadow(g, 0, 0, 1.2, 1.2, 0.55);
  return g;
}

export function updateTrafficLights(lights, time) {
  // 16 s cycle: R 0-8, G 8-14, Y 14-16.
  for (const l of lights) {
    const t = (time + (l.userData.phase || 0)) % 16;
    const s = t < 8 ? 'R' : t < 14 ? 'G' : 'Y';
    if (l.userData.state !== s) l.userData.setState(s);
  }
}

// ---------------------------------------------------------------------------
// Soft beam: camera-facing sprites, soft radial glow, NO silhouette edge.
// A cone's boundary reads as a hard triangle; two additive sprites (a wide
// dim shaft + a narrow brighter core) fade to transparent at every edge.
// ---------------------------------------------------------------------------
let _beamGlowTex = null;
export function beamGlowTexture() {
  if (_beamGlowTex) return _beamGlowTex;
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const gr = ctx.createRadialGradient(128, 128, 2, 128, 128, 126);
  gr.addColorStop(0, 'rgba(255,250,230,0.9)');
  gr.addColorStop(0.25, 'rgba(255,240,200,0.55)');
  gr.addColorStop(0.55, 'rgba(255,220,160,0.22)');
  gr.addColorStop(0.8, 'rgba(255,200,130,0.07)');
  gr.addColorStop(1, 'rgba(255,200,130,0)');
  ctx.fillStyle = gr;
  ctx.fillRect(0, 0, 256, 256);
  _beamGlowTex = new CT(canvas);
  return _beamGlowTex;
}

export function makeSoftBeam(scene, a, b, rt, rb, opacity) {
  const tex = beamGlowTexture();
  const g = new GP();
  const mid = new V3((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  // The beam runs mostly along the view direction, so the sprite is
  // scaled to its vertical drop, not its 3D length: a tall soft shaft
  // from the helicopter down to the target, no hard edges.
  const drop = Math.max(2, Math.abs(a.y - b.y));
  const wide = new THREE.Sprite(new THREE.SpriteMaterial({
    map: tex, transparent: true, opacity: opacity * 0.9,
    blending: AB, depthWrite: false,
  }));
  wide.position.copy(mid);
  wide.scale.set(rb * 3.2, drop * 1.15, 1);
  g.add(wide);
  const core = new THREE.Sprite(new THREE.SpriteMaterial({
    map: tex, transparent: true, opacity: Math.min(0.5, opacity * 1.6),
    blending: AB, depthWrite: false,
  }));
  core.position.copy(mid);
  core.scale.set(rb * 1.4, drop * 0.9, 1);
  g.add(core);
  scene.add(g);
  return g;
}
