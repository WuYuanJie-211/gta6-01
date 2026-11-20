// v31 surface/staging upgrade (Superbot 9-system plan). Geometry + missions
// unchanged from v30; adds facades, signs, ground, sky, shadows, traffic lights.
import * as THREE from 'three';
import { BX, CG, CN, PG, SG, MS, MB, ME, GP, V3, PI, CT, SC, RW, DS, AB } from './geo.js';

export const HERO_ZONE = { minX: 220, maxX: 260, minZ: -200, maxZ: -160, cx: 240, cz: -180 };
export function inHeroZone(x, z, pad = 0) {
  return x >= HERO_ZONE.minX - pad && x <= HERO_ZONE.maxX + pad
    && z >= HERO_ZONE.minZ - pad && z <= HERO_ZONE.maxZ + pad;
}

// ---------------------------------------------------------------------------
// 1. Facade atlas: 1024 canvas, 16 cells of 256px.
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
  // grid: 5 cols x 8 rows, pane 36x22, gaps so the sill fits.
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
// 2. Sign system: 12 names, unlit so they read at dusk.
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
    // bold condensed sans, all caps. v32: auto-fit — shrink the font
    // until the whole word fits the 512px panel.
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
    // manual letter-spacing (canvas has no letterSpacing in all browsers)
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
  // v32: much darker + wider dark core so the blob reads on dark asphalt
  // (the old 0.85/0.45 falloff was invisible on the road).
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
// 5. Skyline + sky. Dithered gradient dome, sun, sea, hills, skyline.
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
  // v35: 0.6% dither — 1% still grained in the purple sky at this res.
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
  const dome = new ME(new THREE.SphereGeometry(800, 32, 16), mat);
  return dome;
}

export function makeSunBillboard() {
  const g = new GP();
  // v32: ONE wide soft glow with a long gradual falloff (no separate hard
  // disc) + a small dim core. The old 26m core used the same texture as
  // the 60m glow, so it read as a hard-edged disc sitting on the horizon.
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
  // v33: sRGB so the fronds render green, not the teal the linear
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
    // v31 fix: tilt OUTWARD (+x) so fronds arc out and droop like a palm
    // crown; alternate the angle so the crown is layered, not a flat ring.
    // (The old -0.5 tipped the tops inward, which read as a spiky ball.)
    frond.rotation.x = 0.7 + (i % 2) * 0.35;
    group.add(frond);
  }
  addBlobShadow(group, 0, 0, 1.6, 1.6, 0.55);
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
  // v34: deep olive + mid-grey, dashes inset from the curb — survives the
  // sunset grade and reads as paint, not light shafts / curb bleed.
  ctx.fillStyle = '#4a3510';
  ctx.fillRect(0, 26, 256, 4);
  ctx.fillRect(0, 34, 256, 4);
  // white lane dashes: 2m on / 2m off (half the tile is dash)
  ctx.fillStyle = '#707070';
  ctx.fillRect(0, 14, 128, 3);
  ctx.fillRect(0, 47, 128, 3);
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
  const housing = new ME(new BX(0.9, 2.3, 0.3), new MS({ color: 0x4a0f0a, roughness: 0.6 }));
  housing.position.set(0, 4.9, 3.6);
  g.add(housing);
  const lamps = [];
  for (let i = 0; i < 3; i += 1) {
    const mat = new MS({ color: 0x330a06, roughness: 0.4, emissive: 0x000000, emissiveIntensity: 0 });
    // v33: ONE sphere per lamp, centred in the housing — the lit lamp
    // reads from ANY angle. Flat discs were edge-on/invisible sideways.
    const lamp = new ME(new SG(0.4, 12, 10), mat);
    lamp.position.set(0, 5.7 - i * 0.8, 3.6);
    g.add(lamp);
    lamps.push(mat);
  }
  // v36: halo 3.2/0.8, forward of housing, lamp 1.8 — orb must read at range.
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: beamGlowTexture(), transparent: true, opacity: 0.8, blending: AB, depthWrite: false }));
  glow.scale.set(3.2, 3.2, 1);
  g.add(glow);
  function setState(s) {
    // s: 'R' (lamp 0), 'Y' (lamp 1), 'G' (lamp 2). Exactly one on.
    const on = s === 'G' ? 2 : s === 'Y' ? 1 : 0;
    for (let i = 0; i < 3; i += 1) {
      const m = lamps[i];
      if (i === on) {
        m.color.setHex(LIGHT_COLORS[i]);
        m.emissive.setHex(LIGHT_COLORS[i]);
        m.emissiveIntensity = 1.8;
      } else {
        m.color.setHex(0x330a06);
        m.emissive.setHex(0x000000);
        m.emissiveIntensity = 0;
      }
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
  // 16s cycle: R 0-8, G 8-14, Y 14-16.
  for (const l of lights) {
    const t = (time + (l.userData.phase || 0)) % 16;
    const s = t < 8 ? 'R' : t < 14 ? 'G' : 'Y';
    if (l.userData.state !== s) l.userData.setState(s);
  }
}

// ---------------------------------------------------------------------------
// Soft beam (replaces the hard-edged cone in shots.js): a camera-facing
// Sprite with a soft radial glow. A Sprite has NO silhouette edge at all
// (unlike a cone, whose geometric boundary always reads as a hard triangle),
// so the shaft is pure falloff. One wide dim glow + one narrow brighter
// core, both additive, both fading to transparent at every edge.
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
  // The beam is foreshortened (it runs mostly along the view direction),
  // so the sprite is scaled to its vertical drop, not its 3D length:
  // a tall soft shaft from the heli down to the target, no hard edges.
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
