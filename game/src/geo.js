// Short aliases for the three.js classes the game uses everywhere, so the
// gameplay modules stay readable. Imported as `three` from the vendored
// build (game/vendor/three.module.min.js) via the import map in index.html.
import * as T from 'three';

// Geometry
export const BX = T.BoxGeometry;
export const CG = T.CylinderGeometry;
export const CN = T.ConeGeometry;
export const CI = T.CircleGeometry;
export const PG = T.PlaneGeometry;
export const SG = T.SphereGeometry;
export const OG = T.OctahedronGeometry;

// Materials / objects
export const MS = T.MeshStandardMaterial;
export const MB = T.MeshBasicMaterial;
export const ME = T.Mesh;
export const GP = T.Group;
export const SP = T.Sprite;

// Math / textures / misc
export const V3 = T.Vector3;
export const PI = Math.PI;
export const RW = T.RepeatWrapping;
export const SC = T.SRGBColorSpace;
export const CT = T.CanvasTexture;
export const DS = T.DoubleSide;
export const AB = T.AdditiveBlending;

// A transparent ground-shadow plane: a soft blob texture, no depth write,
// pulled one step toward the camera so it never z-fights the road paint.
export const SH = (tex, opacity) => new MB({
  map: tex, transparent: true, opacity,
  depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1,
});
