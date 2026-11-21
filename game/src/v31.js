// Shared look: the facade atlas, the sky, the signs, the soft shadows
// and the street furniture. Everything here is procedural canvas or
// geometry — no network, no files.
//
// The v41 road fix lives in this file: the asphalt texture has the lane
// markings BAKED IN with hard edges (no separate transparent marking
// plane to blur or z-fight), the sidewalk has real tile seams, and the
// zebra is an opaque plane. The road reads as ground, not as a dark
// carpet laid on top of it.
import * as THREE from 'three';
import { BX, CG, CN, PG, SG, MS, MB, ME, GP, SP, V3, PI, RW, SC, CT, DS, AB, SH } from './geo.js';
import { CITY, COLOURS } from './config.js';

// A tiny seeded PRNG so the painted textures are identical on every
// load (the city uses its own seeded stream; canvas paint must not use
// Math.random, or the screenshots would differ run to run).
function mulberry(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

// ---------------------------------------------------------------- blobs

let _blobTex = null;
export function blobShadowTexture() {
  if (_blobTex) return _blobTex;
  const [c, x] = canvas(256, 256);
  const g = x.createRadialGradient(128, 128, 8, 128, 128, 128);
  g.addColorStop(0, 'rgba(0,0,0,0.95)');
  g.addColorStop(0.55, 'rgba(0,0,0,0.55)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 256, 256);
  _blobTex = new CT(c);
  return _blobTex;
}

let _poolTex = null;
export function poolTexture() {
  if (_poolTex) return _poolTex;
  const [c, x] = canvas(256, 256);
  const g = x.createRadialGradient(128, 128, 4, 128, 128, 128);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.35)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 256, 256);
  _poolTex = new CT(c);
  return _poolTex;
}

let _ringTex = null;
export function ringTexture() {
  if (_ringTex) return _ringTex;
  const [c, x] = canvas(256, 256);
  x.strokeStyle = 'rgba(255,255,255,0.95)';
  x.lineWidth = 10;
  x.beginPath();
  x.arc(128, 128, 100, 0, PI * 2);
  x.stroke();
  x.strokeStyle = 'rgba(255,255,255,0.25)';
  x.lineWidth = 18;
  x.beginPath();
  x.arc(128, 128, 100, 0, PI * 2);
  x.stroke();
  _ringTex = new CT(c);
  return _ringTex;
}

// A soft ground blob. y=0.07 clears the road planes (0.04/0.045) and
// the zebra (0.055); renderOrder=2 draws it after the transparent
// pools and skids, so a blob is never repainted over by road paint.
export function addBlobShadow(parent, x, z, w, d, opacity, y = 0.07) {
  const s = new ME(new PG(w, d), SH(blobShadowTexture(), opacity));
  s.rotation.x = -PI / 2;
  s.position.set(x, y, z);
  s.renderOrder = 2;
  parent.add(s);
  return s;
}

// A dark skirt under a building base so it sits on the ground instead
// of floating a hair above it.
export function addAOSkirt(scene, x, z, w, d) {
  const s = new ME(new PG(w + 2.5, d + 2.5), SH(blobShadowTexture(), 0.45));
  s.rotation.x = -PI / 2;
  s.position.set(x, 0.03, z);
  s.renderOrder = 1;
  scene.add(s);
  return s;
}

// ------------------------------------------------------- road textures
//
// The road tile is 1024x1024 px = 12 m across x 8 m along. One tile
// covers the full road width, so the centre lines, lane dashes and edge
// lines are painted once, with hard edges, and repeat cleanly every
// 8 m (avenues are 600 m = 75 tiles, streets 720 m = 90 tiles — both
// whole numbers, so the dash phase never jumps). Speckle, patches and
// cracks are drawn with wrap-around so the tile is seamless.

export function makeRoadTexture(aniso) {
  const [c, x] = canvas(1024, 1024);
  const rnd = mulberry(4101);
  const wrap = (fn) => {
    for (const [dx, dy] of [[0, 0], [-1024, 0], [1024, 0], [0, -1024], [0, 1024]]) {
      x.save();
      x.translate(dx, dy);
      fn();
      x.restore();
    }
  };
  // Base asphalt: mid-dark grey, light enough that the grain reads.
  x.fillStyle = '#4b4e53';
  x.fillRect(0, 0, 1024, 1024);
  // Large soft tonal patches (repairs, wear).
  for (let i = 0; i < 14; i += 1) {
    const px = rnd() * 1024;
    const py = rnd() * 1024;
    const pw = 90 + rnd() * 220;
    const ph = 70 + rnd() * 180;
    const shade = rnd() < 0.5 ? 'rgba(0,0,0,0.10)' : 'rgba(255,255,255,0.05)';
    wrap(() => {
      x.fillStyle = shade;
      x.beginPath();
      x.ellipse(px, py, pw, ph, rnd() * PI, 0, PI * 2);
      x.fill();
    });
  }
  // Aggregate speckle.
  for (let i = 0; i < 9000; i += 1) {
    const px = rnd() * 1024;
    const py = rnd() * 1024;
    const r = 0.6 + rnd() * 1.8;
    const v = 52 + Math.floor(rnd() * 84);
    wrap(() => {
      x.fillStyle = `rgb(${v},${v + 2},${v + 6})`;
      x.beginPath();
      x.arc(px, py, r, 0, PI * 2);
      x.fill();
    });
  }
  // Cracks — kept faint (0.35 alpha, 1-2 px): at a grazing angle near
  // the camera the old 0.55-alpha cracks stretched into black streaks.
  x.strokeStyle = 'rgba(20,20,24,0.35)';
  for (let i = 0; i < 9; i += 1) {
    const px = rnd() * 1024;
    const py = rnd() * 1024;
    wrap(() => {
      x.beginPath();
      x.moveTo(px, py);
      let qx = px;
      let qy = py;
      for (let s = 0; s < 6; s += 1) {
        qx += (rnd() - 0.5) * 130;
        qy += (rnd() - 0.5) * 130;
        x.lineTo(qx, qy);
      }
      x.lineWidth = 1 + rnd() * 1;
      x.stroke();
    });
  }
  // --- Markings, hard edges, no blur. Across: 1024 px = 12 m (85.3
  // px/m). Along: 1024 px = 8 m (128 px/m).
  const m = 1024 / 12; // px per metre across
  const edge = (px, w) => { x.fillRect(px - w / 2, 0, w, 1024); };
  // White edge lines.
  x.fillStyle = '#dcdcdc';
  edge(0.35 * m, 10);
  edge(11.65 * m, 10);
  // Double yellow centre lines.
  x.fillStyle = '#e6c832';
  edge(512 - 15, 12);
  edge(512 + 15, 12);
  // White lane dashes: 2 m on, 2 m off (256 px on, 256 off).
  x.fillStyle = '#e9e9e9';
  for (const cx of [3 * m, 9 * m]) {
    for (const y0 of [0, 512]) x.fillRect(cx - 6.5, y0, 13, 256);
  }
  const t = new CT(c);
  t.colorSpace = SC;
  t.anisotropy = aniso;
  return t;
}

// Sidewalk tile: 1024x1024 px = 16 m x 16 m, seams every 2 m.
export function makeSidewalkTexture(aniso) {
  const [c, x] = canvas(1024, 1024);
  const rnd = mulberry(4102);
  x.fillStyle = '#b3a98f';
  x.fillRect(0, 0, 1024, 1024);
  // Per-tile shade variation.
  for (let ty = 0; ty < 8; ty += 1) {
    for (let tx = 0; tx < 8; tx += 1) {
      const v = rnd() * 14 - 7;
      x.fillStyle = v >= 0 ? `rgba(255,255,255,${v / 100})` : `rgba(0,0,0,${-v / 100})`;
      x.fillRect(tx * 128, ty * 128, 128, 128);
    }
  }
  // Speckle.
  for (let i = 0; i < 4200; i += 1) {
    const v = 140 + Math.floor(rnd() * 60);
    x.fillStyle = `rgb(${v},${v - 6},${v - 22})`;
    x.fillRect(rnd() * 1024, rnd() * 1024, 1.6, 1.6);
  }
  // Seams.
  x.strokeStyle = '#8a7f68';
  x.lineWidth = 3;
  for (let i = 0; i <= 8; i += 1) {
    x.beginPath(); x.moveTo(i * 128, 0); x.lineTo(i * 128, 1024); x.stroke();
    x.beginPath(); x.moveTo(0, i * 128); x.lineTo(1024, i * 128); x.stroke();
  }
  const t = new CT(c);
  t.colorSpace = SC;
  t.wrapS = RW;
  t.wrapT = RW;
  t.anisotropy = aniso;
  return t;
}

// Zebra crossing: 1024x256 px = 12 m x 3 m, opaque so it never sorts
// against the blobs. Six white bars on asphalt.
export function makeZebraTexture(aniso) {
  const [c, x] = canvas(1024, 256);
  const rnd = mulberry(4103);
  x.fillStyle = '#4b4e53';
  x.fillRect(0, 0, 1024, 256);
  for (let i = 0; i < 500; i += 1) {
    const v = 52 + Math.floor(rnd() * 84);
    x.fillStyle = `rgb(${v},${v + 2},${v + 6})`;
    x.fillRect(rnd() * 1024, rnd() * 256, 2, 2);
  }
  x.fillStyle = '#e9e9e9';
  for (let i = 0; i < 6; i += 1) {
    const cx = (1 + i * 2) * (1024 / 12);
    x.fillRect(cx - 30, 0, 60, 256);
  }
  // Wear: a few dark scuffs on the bars.
  for (let i = 0; i < 26; i += 1) {
    x.fillStyle = 'rgba(40,40,44,0.35)';
    x.fillRect(rnd() * 1024, rnd() * 256, 8 + rnd() * 22, 4 + rnd() * 10);
  }
  const t = new CT(c);
  t.colorSpace = SC;
  t.anisotropy = aniso;
  return t;
}

// --------------------------------------------------------- facade atlas

const PALETTES = [
  { bg: '#d8c49a', win: '#2a3a4a', trim: '#b09a6a' },
  { bg: '#a85a4a', win: '#22303e', trim: '#7a3a30' },
  { bg: '#5a7a9a', win: '#1c2836', trim: '#3a5a7a' },
  { bg: '#c2a878', win: '#22303e', trim: '#9a7f52' },
  { bg: '#e0d8c0', win: '#2a3a4a', trim: '#b8ac88' },
  { bg: '#4a4f55', win: '#12181f', trim: '#2e3338' },
];
const SHOP_NAMES = ['SHOP', 'CAFE', '24H', 'BANK'];

function paintFacadeCell(x, ox, oy, pal, style, rnd) {
  x.fillStyle = pal.bg;
  x.fillRect(ox, oy, 256, 256);
  // Floor lines.
  x.fillStyle = pal.trim;
  for (let f = 1; f < 8; f += 1) x.fillRect(ox, oy + f * 32, 256, 2);
  if (style === 0) {
    // 5x8 pane grid.
    for (let r = 0; r < 8; r += 1) {
      for (let col = 0; col < 5; col += 1) {
        const wx = ox + 14 + col * 48;
        const wy = oy + 8 + r * 32;
        const lit = rnd() < 0.14;
        x.fillStyle = lit ? '#ffd97a' : pal.win;
        x.fillRect(wx, wy, 34, 20);
        x.fillStyle = 'rgba(255,255,255,0.25)';
        x.fillRect(wx, wy, 34, 4);
      }
    }
  } else {
    // Horizontal strip windows.
    for (let r = 0; r < 8; r += 1) {
      const wy = oy + 8 + r * 32;
      const lit = rnd() < 0.12;
      x.fillStyle = lit ? '#ffd97a' : pal.win;
      x.fillRect(ox + 12, wy, 232, 20);
      x.fillStyle = pal.trim;
      for (let m = 1; m < 6; m += 1) x.fillRect(ox + 12 + m * 40, wy, 3, 20);
    }
  }
  // Top band.
  x.fillStyle = pal.trim;
  x.fillRect(ox, oy, 256, 6);
}

function paintShopCell(x, ox, oy, name, bg, rnd) {
  x.fillStyle = bg;
  x.fillRect(ox, oy, 256, 256);
  // Sign band.
  x.fillStyle = '#1a1a22';
  x.fillRect(ox, oy, 256, 58);
  x.fillStyle = '#ffffff';
  x.font = '800 34px system-ui,sans-serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText(name, ox + 128, oy + 30);
  // Big glass panes with a reflection streak.
  for (let i = 0; i < 3; i += 1) {
    const gx = ox + 12 + i * 80;
    const grad = x.createLinearGradient(gx, oy + 70, gx, oy + 190);
    grad.addColorStop(0, '#9db8cc');
    grad.addColorStop(1, '#3a5a7a');
    x.fillStyle = grad;
    x.fillRect(gx, oy + 70, 72, 120);
    x.fillStyle = 'rgba(255,255,255,0.3)';
    x.beginPath();
    x.moveTo(gx + 12, oy + 190);
    x.lineTo(gx + 40, oy + 70);
    x.lineTo(gx + 52, oy + 70);
    x.lineTo(gx + 24, oy + 190);
    x.closePath();
    x.fill();
  }
  // Awning stripes.
  for (let i = 0; i < 8; i += 1) {
    x.fillStyle = i % 2 ? '#e74c3c' : '#f5f0e6';
    x.fillRect(ox + i * 32, oy + 204, 32, 52);
  }
}

export function makeFacadeAtlas() {
  const [c, x] = canvas(1024, 1024);
  const rnd = mulberry(4104);
  for (let i = 0; i < 6; i += 1) {
    const col = i % 4;
    const row = Math.floor(i / 4);
    paintFacadeCell(x, col * 256, row * 256, PALETTES[i], 0, rnd);
  }
  for (let i = 0; i < 6; i += 1) {
    const cell = 6 + i;
    const col = cell % 4;
    const row = Math.floor(cell / 4);
    paintFacadeCell(x, col * 256, row * 256, PALETTES[i], 1, rnd);
  }
  const shopBg = ['#2a6a3a', '#7a3a1a', '#1a3a5f', '#2a1a4a'];
  for (let i = 0; i < 4; i += 1) {
    const cell = 12 + i;
    const col = cell % 4;
    const row = Math.floor(cell / 4);
    paintShopCell(x, col * 256, row * 256, SHOP_NAMES[i], shopBg[i], rnd);
  }
  const t = new CT(c);
  t.colorSpace = SC;
  return t;
}

// Map a box's faces onto one atlas cell. One cell covers 16 m x 16 m
// of facade, so the windows repeat instead of stretching. The passed
// h is the facade height to span, not necessarily the geometry's own
// height — a 4.5 m podium passes h=20 to wear the whole storefront
// cell (sign band + glass + awning) as a shop front.
export function applyFacadeUVs(geo, cell, w, h, d) {
  const uv = geo.attributes.uv;
  const norm = geo.attributes.normal;
  const col = cell % 4;
  const row = Math.floor(cell / 4);
  const u0 = col * 0.25;
  const v0 = 1 - (row + 1) * 0.25;
  for (let i = 0; i < uv.count; i += 1) {
    const nx = Math.abs(norm.getX(i));
    const ny = Math.abs(norm.getY(i));
    let fw;
    let fh;
    if (nx > 0.5) { fw = d; fh = h; } else if (ny > 0.5) { fw = w; fh = d; } else { fw = w; fh = h; }
    uv.setXY(i, u0 + uv.getX(i) * (fw / 16), v0 + uv.getY(i) * (fh / 16));
  }
  uv.needsUpdate = true;
}

// ------------------------------------------------------------------ sky

export function makeSkyDome() {
  const geo = new THREE.SphereGeometry(800, 32, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `varying vec3 vP;
      void main(){
        float h = clamp(normalize(vP).y, 0.0, 1.0);
        vec3 zen = vec3(0.17, 0.16, 0.37);
        vec3 mid = vec3(0.48, 0.31, 0.55);
        vec3 hor = vec3(1.0, 0.55, 0.35);
        vec3 col = h < 0.22 ? mix(hor, mid, h / 0.22) : mix(mid, zen, (h - 0.22) / 0.78);
        float d = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) / 255.0;
        gl_FragColor = vec4(col + d, 1.0);
      }`,
  });
  const dome = new THREE.Mesh(geo, mat);
  dome.renderOrder = -10;
  return dome;
}

export function makeSunBillboard() {
  const [c, x] = canvas(256, 256);
  const g = x.createRadialGradient(128, 128, 4, 128, 128, 128);
  g.addColorStop(0, 'rgba(255,240,200,1)');
  g.addColorStop(0.25, 'rgba(255,200,120,0.85)');
  g.addColorStop(0.6, 'rgba(255,140,80,0.25)');
  g.addColorStop(1, 'rgba(255,140,80,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 256, 256);
  const t = new CT(c);
  t.colorSpace = SC;
  const s = new SP(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, fog: false }));
  s.position.set(-560, 110, -260);
  s.scale.set(150, 150, 1);
  return s;
}

// ------------------------------------------------------- traffic lights

// One lamp face: pole, arm, housing, three lamp orbs. The lit lamp is
// a real sphere with a hot emissive core plus a halo ring sprite, so
// the red reads as a glowing orb from any camera, not a flat disc.
export function makeTrafficLight(state, offset) {
  const g = new GP();
  const dark = new MS({ color: 0x22262a, roughness: 0.6, metalness: 0.4 });
  const pole = new ME(new CG(0.09, 0.11, 4.6, 8), dark);
  pole.position.y = 2.3;
  g.add(pole);
  const arm = new ME(new BX(1.5, 0.1, 0.1), dark);
  arm.position.set(0.7, 4.5, 0);
  g.add(arm);
  const housing = new ME(new BX(0.5, 1.35, 0.5), new MS({ color: 0x14161a, roughness: 0.5, metalness: 0.5 }));
  housing.position.set(1.35, 4.1, 0);
  g.add(housing);
  const visor = new ME(new BX(0.56, 0.08, 0.56), dark);
  visor.position.set(1.35, 4.82, 0);
  g.add(visor);
  const lamps = {};
  const defs = [
    ['r', 0xff2a22, 4.55],
    ['y', 0xffb020, 4.1],
    ['g', 0x2aff5e, 3.65],
  ];
  for (const [key, color, y] of defs) {
    const m = new MS({ color: 0x1a1a1a, emissive: color, emissiveIntensity: 0.06, roughness: 0.3 });
    const orb = new ME(new SG(0.17, 12, 10), m);
    orb.position.set(1.35, y, 0.26);
    g.add(orb);
    lamps[key] = { mesh: orb, mat: m, color };
  }
  const halo = new SP(new THREE.SpriteMaterial({
    map: ringTexture(), transparent: true, opacity: 0.7,
    blending: AB, depthWrite: false,
  }));
  halo.scale.set(0.9, 0.9, 1);
  halo.position.set(1.35, 4.55, 0.4);
  g.add(halo);
  g.userData.trafficLight = { lamps, halo, offset, state };
  return g;
}

export function updateTrafficLights(lights, time) {
  for (const tl of lights) {
    const u = tl.userData.trafficLight;
    const phase = (time + u.offset) % 13.5;
    const lit = phase < 6 ? 'g' : phase < 7.5 ? 'y' : 'r';
    for (const key of ['r', 'y', 'g']) {
      const on = key === lit;
      u.lamps[key].mat.emissiveIntensity = on ? 2.6 : 0.06;
    }
    const lamp = u.lamps[lit];
    u.halo.position.set(1.35, lamp.mesh.position.y, 0.4);
    u.halo.material.color.setHex(lamp.color);
    u.halo.material.opacity = lit === 'r' ? 0.7 : 0.45;
    u.state = lit;
  }
}

// ------------------------------------------------------------- soft beam

// A searchlight shaft as two additive sprites with no silhouette edge
// (a cone mesh had hard triangle facets). a = source, b = ground point.
export function makeSoftBeam(scene, a, b, rt, rb, o) {
  const tex = poolTexture();
  const len = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
  const mk = (t, r, op) => {
    const s = new SP(new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: op, blending: AB, depthWrite: false }));
    s.position.set(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t);
    s.scale.set(r * 2, len * 0.55, 1);
    scene.add(s);
    return s;
  };
  mk(0.3, rt, o);
  mk(0.7, rb, o * 0.7);
}

// ---------------------------------------------------------------- signs

function signTexture(text, fg, bg, w, h) {
  const [c, x] = canvas(512, Math.max(64, Math.round(512 * (h / w))));
  x.fillStyle = bg;
  x.fillRect(0, 0, c.width, c.height);
  x.fillStyle = fg;
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  let size = Math.floor(c.height * 0.52);
  x.font = `800 ${size}px system-ui,sans-serif`;
  while (x.measureText(text).width > c.width * 0.92 && size > 12) {
    size -= 4;
    x.font = `800 ${size}px system-ui,sans-serif`;
  }
  x.fillText(text, c.width / 2, c.height / 2 + 2);
  const t = new CT(c);
  t.colorSpace = SC;
  return t;
}

// A big unlit sign (MeshBasicMaterial, so it reads at dusk). The
// backboard is a solid dark panel larger than the face, so the sign
// reads as one clean panel instead of text floating on a busy facade.
export function makeV31Sign(name, bg, fg, w, h) {
  const g = new GP();
  const back = new ME(new BX(w + 0.5, h + 0.5, 0.12), new MS({ color: 0x1a1a1e, roughness: 0.7 }));
  g.add(back);
  const face = new ME(new PG(w, h), new MB({ map: signTexture(name, fg, bg, w, h) }));
  face.position.z = 0.08;
  g.add(face);
  g.userData.v31sign = name;
  return g;
}

// A flat canvas sign for shops, street signs and bus stops.
export function makeSign(text, fg, bg, w = 6, h = 3) {
  const m = new ME(new PG(w, h), new MB({ map: signTexture(text, fg, bg, w, h) }));
  return m;
}

export function makeBillboard(text, fg, bg) {
  const g = new GP();
  const postMat = new MS({ color: 0x3a3f45, roughness: 0.7, metalness: 0.3 });
  for (const dx of [-4, 4]) {
    const post = new ME(new BX(0.4, 8, 0.4), postMat);
    post.position.set(dx, 4, 0);
    g.add(post);
  }
  const back = new ME(new BX(10.4, 4.4, 0.3), new MS({ color: 0x1a1a1e, roughness: 0.7 }));
  back.position.y = 9;
  g.add(back);
  const face = new ME(new PG(10, 4), new MB({ map: signTexture(text, fg, bg, 10, 4) }));
  face.position.set(0, 9, 0.18);
  g.add(face);
  return g;
}

// ------------------------------------------------------- street furniture

export function makeLamp() {
  const g = new GP();
  const dark = new MS({ color: 0x2e3338, roughness: 0.6, metalness: 0.5 });
  const pole = new ME(new CG(0.09, 0.12, 5.6, 8), dark);
  pole.position.y = 2.8;
  g.add(pole);
  const arm = new ME(new BX(1.7, 0.09, 0.09), dark);
  arm.position.set(0.8, 5.5, 0);
  g.add(arm);
  const head = new ME(new BX(0.55, 0.14, 0.28), dark);
  head.position.set(1.6, 5.45, 0);
  g.add(head);
  const glow = new ME(new BX(0.45, 0.04, 0.2), new MB({ color: 0xffe6b0 }));
  glow.position.set(1.6, 5.36, 0);
  g.add(glow);
  return g;
}

export function makeHydrant() {
  const g = new GP();
  const red = new MS({ color: 0xc0392b, roughness: 0.55 });
  const body = new ME(new CG(0.2, 0.24, 0.72, 10), red);
  body.position.y = 0.36;
  g.add(body);
  const dome = new ME(new SG(0.2, 10, 8, 0, PI * 2, 0, PI / 2), red);
  dome.position.y = 0.72;
  g.add(dome);
  for (const s of [-1, 1]) {
    const cap = new ME(new CG(0.09, 0.09, 0.14, 8), red);
    cap.rotation.z = PI / 2;
    cap.position.set(s * 0.24, 0.45, 0);
    g.add(cap);
  }
  const base = new ME(new CG(0.28, 0.3, 0.12, 10), new MS({ color: 0x7a2a20, roughness: 0.8 }));
  base.position.y = 0.06;
  g.add(base);
  return g;
}

export function makeBench() {
  const g = new GP();
  const wood = new MS({ color: 0x8a6b4f, roughness: 0.9 });
  const iron = new MS({ color: 0x2e3338, roughness: 0.6, metalness: 0.4 });
  const seat = new ME(new BX(1.8, 0.08, 0.5), wood);
  seat.position.y = 0.45;
  g.add(seat);
  const back = new ME(new BX(1.8, 0.5, 0.07), wood);
  back.position.set(0, 0.75, -0.24);
  back.rotation.x = -0.15;
  g.add(back);
  for (const dx of [-0.8, 0.8]) {
    const leg = new ME(new BX(0.08, 0.45, 0.45), iron);
    leg.position.set(dx, 0.22, 0);
    g.add(leg);
  }
  return g;
}

export function makeTree(rng) {
  const g = new GP();
  const trunk = new ME(new CG(0.14, 0.2, 2.1, 8), new MS({ color: 0x6a4a2a, roughness: 1 }));
  trunk.position.y = 1.05;
  g.add(trunk);
  const greens = [0x2e7d32, 0x388e3c, 0x43a047];
  const c1 = new ME(new SG(1.25, 10, 8), new MS({ color: rng.pick(greens), roughness: 1 }));
  c1.position.set(0, 2.9, 0);
  g.add(c1);
  const c2 = new ME(new SG(0.85, 10, 8), new MS({ color: rng.pick(greens), roughness: 1 }));
  c2.position.set(0.7, 3.5, 0.3);
  g.add(c2);
  return g;
}

// Palm crown: 8-14 V-folded leaves in 3 layers (upper upright, middle
// horizontal, lower drooping), 2-4 dry yellow leaves hanging under the
// crown, 3-6 coconuts. Colours are per LEAF in 3 grades. Each leaf is a
// nested group (yaw, then pitch) so the droop is radial — the old flat
// fronds pitched around the world X axis, so half of them pointed up.
function makePalmCrown(g, x, y, z, scale, rnd) {
  const greens = [0x2f4a26, 0x3f6b30, 0x6f8f3a];
  const leaves = 11;
  for (let i = 0; i < leaves; i += 1) {
    const a = (i / leaves) * PI * 2 + (rnd ? rnd() * 0.4 : i * 0.13);
    const layer = i % 3;
    const droop = layer === 0 ? 0.25 : layer === 1 ? 0.75 : 1.25;
    const len = 3.1 * scale * (layer === 2 ? 1.1 : 1);
    const yaw = new GP();
    yaw.position.set(x, y, z);
    yaw.rotation.y = a;
    const pitch = new GP();
    pitch.rotation.x = droop;
    yaw.add(pitch);
    for (const s of [-1, 1]) {
      const blade = new ME(
        new BX(0.5, 0.03, len),
        new MS({ color: greens[(i + (s > 0 ? 1 : 0)) % 3], roughness: 1, side: DS }),
      );
      blade.position.set(s * 0.18, 0, len / 2);
      blade.rotation.z = -s * 0.45;
      pitch.add(blade);
    }
    g.add(yaw);
  }
  for (let i = 0; i < 3; i += 1) {
    const a = (i / 3) * PI * 2 + 0.7;
    const dry = new ME(new BX(0.28, 0.03, 2.2), new MS({ color: 0x8a7a4e, roughness: 1, side: DS }));
    dry.position.set(x + Math.sin(a) * 0.9, y - 0.9, z + Math.cos(a) * 0.9);
    dry.rotation.y = a;
    dry.rotation.x = 1.9;
    g.add(dry);
  }
  for (let i = 0; i < 4; i += 1) {
    const a = (i / 4) * PI * 2 + 0.4;
    const nut = new ME(new SG(0.11, 8, 6), new MS({ color: 0x6a5a3a, roughness: 1 }));
    nut.position.set(x + Math.sin(a) * 0.35, y - 0.35, z + Math.cos(a) * 0.35);
    g.add(nut);
  }
}

// Segmented curved trunk: 9 short cylinders stacked along a C-curve,
// leaning 8-15 deg, bend concentrated in the lower third, radius 0.35
// at the base tapering to 0.2 at the top. Returns the crown offset.
function makePalmTrunk(g, h, lean, leanDir) {
  const segs = 9;
  const segH = h / segs;
  const dx = Math.sin(leanDir);
  const dz = Math.cos(leanDir);
  for (let i = 0; i < segs; i += 1) {
    const t = (i + 0.5) / segs;
    const off = lean * (2 * t - t * t);
    const tilt = Math.atan((lean * (2 - 2 * t)) / h);
    const rTop = 0.35 - 0.15 * ((i + 1) / segs);
    const rBot = 0.35 - 0.15 * (i / segs);
    const seg = new ME(new CG(rTop, rBot, segH * 1.1, 7), new MS({ color: 0x7a5a3a, roughness: 1 }));
    seg.position.set(dx * off, segH * (i + 0.5), dz * off);
    seg.rotation.x = dz * tilt;
    seg.rotation.z = -dx * tilt;
    g.add(seg);
  }
  return { x: dx * lean, z: dz * lean };
}

export function makePalm(rng) {
  const g = new GP();
  const h = rng.range(6, 12);
  const lean = rng.range(0.6, 1.9);
  const leanDir = rng.range(0, PI * 2);
  const top = makePalmTrunk(g, h, lean, leanDir);
  makePalmCrown(g, top.x, h, top.z, h / 8, () => rng.range(0, 1));
  return g;
}

// The hero-zone palm: taller, fuller, so the boulevard reads. Height,
// lean and lean direction vary per call so no two read the same.
export function makeV31Palm(h = 8, lean = 1.2, leanDir = 0.5) {
  const g = new GP();
  const top = makePalmTrunk(g, h, lean, leanDir);
  makePalmCrown(g, top.x, h, top.z, h / 8, null);
  return g;
}

// ---------------------------------------------------------- far skyline

// 24 boxes at 450-550 m sharing 4 baked facade cells, so the horizon
// is a city, not a flat colour.
export function makeFarSkyline(atlas) {
  const g = new GP();
  const rnd = mulberry(4105);
  const mat = new MS({ map: atlas, roughness: 0.9 });
  for (let i = 0; i < 24; i += 1) {
    const a = (i / 24) * PI * 2;
    // Keep the sea side (due south) clear — the horizon there is water.
    if (Math.sin(a) > 0.55 && Math.cos(a) > -0.4) continue;
    const r = 450 + rnd() * 100;
    const w = 24 + rnd() * 22;
    const h = 40 + rnd() * 60;
    const d = 24 + rnd() * 22;
    const geo = new BX(w, h, d);
    applyFacadeUVs(geo, Math.floor(rnd() * 4), w, h, d);
    const tower = new ME(geo, mat);
    tower.position.set(Math.cos(a) * r, h / 2 - 2, Math.sin(a) * r);
    g.add(tower);
  }
  return g;
}
