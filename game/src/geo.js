// Short names for the three.js classes the game uses, so the modules
// stay readable. `three` comes from the vendored build
// (game/vendor/three.module.min.js) through the import map in index.html.
import * as T from 'three';

// Geometry
export const BX = T.BoxGeometry;
export const CG = T.CylinderGeometry;
export const CN = T.ConeGeometry;
export const CI = T.CircleGeometry;
export const RG = T.RingGeometry;
export const PG = T.PlaneGeometry;
export const SG = T.SphereGeometry;
export const OG = T.OctahedronGeometry;

// Materials and scene objects
export const MS = T.MeshStandardMaterial;
export const MB = T.MeshBasicMaterial;
export const ME = T.Mesh;
export const GP = T.Group;
export const SP = T.Sprite;

// Math, textures, misc
export const V3 = T.Vector3;
export const PI = Math.PI;
export const RW = T.RepeatWrapping;
export const SC = T.SRGBColorSpace;
export const CT = T.CanvasTexture;
export const DS = T.DoubleSide;
export const AB = T.AdditiveBlending;

// Soft ground blob: radial texture, no depth write, polygonOffset
// -1/-4 so it never z-fights the baked road dashes (v46).
export const SH = (tex, opacity) => new MB({
  map: tex, transparent: true, opacity,
  depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4,
});
