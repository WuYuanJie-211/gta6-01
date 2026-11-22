// The player on foot: Rook, a driver in a dark jacket, with a pistol
// and a rifle that appear when armed. Movement is camera-relative; the
// walk cycle swings the limbs, and the swing fades in and out smoothly.
import { BX, CG, MS, SG, ME, GP, PI, PG, SH } from './geo.js';
import { PLAYER } from './config.js';
import { resolveBuildingCollision } from './city.js';
import { blobShadowTexture } from './v31.js';

const B = (g, w, h, d, m, x = 0, y = 0, z = 0) => {
  const q = new ME(new BX(w, h, d), m);
  q.position.set(x, y, z);
  g.add(q);
  return q;
};
const mt = (c, r = 0.9) => new MS({ color: c, roughness: r });

export function createPlayerMesh() {
  const group = new GP();
  const jacket = mt(0x2e4053, 0.8);
  const skin = mt(0xe0ac69, 0.8);
  const jeans = mt(0x2c3e50);
  const torso = B(group, 0.7, 0.9, 0.4, jacket, 0, 1.15, 0);
  torso.castShadow = true;
  const head = new ME(new SG(0.26, 14, 12), skin);
  head.position.y = 1.85;
  head.scale.y = 0.8;
  group.add(head);
  const hair = new ME(new SG(0.27, 12, 8, 0, PI * 2, 0, PI / 2), mt(0x1a1a1a, 1));
  hair.position.y = 1.88;
  group.add(hair);
  const legL = B(group, 0.24, 0.7, 0.28, jeans, -0.16, 0.35, 0);
  const legR = B(group, 0.24, 0.7, 0.28, jeans, 0.16, 0.35, 0);
  const armL = B(group, 0.18, 0.65, 0.2, jacket, -0.44, 1.15, 0);
  const armR = B(group, 0.18, 0.65, 0.2, jacket, 0.44, 1.15, 0);
  // Rifle: barrel along local +z (the player's forward). Shots stage
  // it precisely; here it just needs to exist and point forward.
  // The barrel is mid-grey, not near-black, so it reads against the
  // dark road and the muzzle tip does not float detached (v42).
  const rifle = new GP();
  B(rifle, 0.06, 0.06, 0.9, mt(0x3a3a3a, 0.4), 0, 0, 0.45);
  B(rifle, 0.09, 0.14, 0.5, mt(0x3a2a1a, 0.8), 0, 0, 0.1);
  B(rifle, 0.07, 0.12, 0.28, mt(0x3a2a1a, 0.8), 0, 0, -0.28);
  B(rifle, 0.05, 0.2, 0.06, mt(0x3a3a3a, 0.4), 0, -0.12, 0.15);
  // v51: a skin hand ON the grip — the rifle floated above the arm
  // with air between it and the hand. The hand rides the rifle, so
  // the grip always reads held even when the arm pose is approximate.
  B(rifle, 0.12, 0.12, 0.14, skin, 0, -0.1, 0.1);
  // Muzzle anchor: an empty group at the barrel tip. The flash, its
  // light and the tracer all anchor here, so the fire provably comes
  // from the muzzle, never from the waist (v42).
  const muzzle = new GP();
  muzzle.position.set(0, 0, 0.95);
  rifle.add(muzzle);
  rifle.userData.muzzle = muzzle;
  rifle.position.set(0.3, 1.5, 0.3);
  rifle.visible = false;
  group.add(rifle);
  // Pistol, in the right hand.
  const pistol = new GP();
  B(pistol, 0.05, 0.08, 0.24, mt(0x1a1a1a, 0.4), 0, 0, 0.1);
  pistol.position.set(0.44, 0.95, 0.25);
  pistol.visible = false;
  group.add(pistol);
  // Ground blob so the player never floats.
  const blob = new ME(new PG(0.9, 0.7), SH(blobShadowTexture(), 0.5));
  blob.rotation.x = -PI / 2;
  blob.position.set(0, 0.07, 0);
  blob.renderOrder = 2;
  group.add(blob);
  group.userData.legL = legL;
  group.userData.legR = legR;
  group.userData.armL = armL;
  group.userData.armR = armR;
  group.userData.rifle = rifle;
  group.userData.pistol = pistol;
  return group;
}

export function updatePlayerOnFoot(game, dt) {
  const p = game.player;
  const drive = game.input.drive();
  const steer = game.input.steer();
  // Camera-relative: W walks away from the camera, A/D strafe.
  const a = game.cameraAngle;
  const fx = -Math.sin(a);
  const fz = -Math.cos(a);
  const rx = Math.cos(a);
  const rz = -Math.sin(a);
  let mx = fx * drive + rx * steer;
  let mz = fz * drive + rz * steer;
  const len = Math.hypot(mx, mz);
  const moving = len > 0.01;
  if (moving) {
    mx /= len;
    mz /= len;
    const speed = game.input.run() ? PLAYER.runSpeed : PLAYER.walkSpeed;
    p.pos.x += mx * speed * dt;
    p.pos.z += mz * speed * dt;
    p.heading = Math.atan2(mx, mz);
  }
  p.pos.x = Math.max(-388, Math.min(388, p.pos.x));
  p.pos.z = Math.max(-388, Math.min(388, p.pos.z));
  resolveBuildingCollision(p.pos, PLAYER.radius, game.city.colliders);
  // Walk cycle, fading in and out with movement.
  const target = moving ? 1 : 0;
  p.walkBlend = (p.walkBlend ?? 0) + (target - (p.walkBlend ?? 0)) * Math.min(1, 10 * dt);
  const swing = Math.sin(game.time * 10) * 0.5 * p.walkBlend;
  const u = p.mesh.userData;
  u.legL.rotation.x = swing;
  u.legR.rotation.x = -swing;
  u.armL.rotation.x = -swing * 0.8;
  u.armR.rotation.x = swing * 0.8;
  p.mesh.position.set(p.pos.x, Math.abs(Math.sin(game.time * 10)) * 0.05 * p.walkBlend, p.pos.z);
  p.mesh.rotation.y = p.heading;
  // The armed look follows the weapon.
  u.rifle.visible = p.weapon === 'rifle';
  u.pistol.visible = p.weapon === 'pistol';
  if (p.weapon === 'rifle' || p.weapon === 'pistol') {
    u.armR.rotation.x = -1.1;
  }
}
