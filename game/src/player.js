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
  // v57 row 2: shoulders, collar, belt and shoes so the figure reads
  // as a person at 2 m, not five boxes and a sphere. The shoulder bar
  // is wider than the torso; the collar rings the neck; the belt breaks
  // the jacket at the waist; the shoes ground the legs.
  B(group, 0.86, 0.18, 0.44, jacket, 0, 1.52, 0);
  B(group, 0.4, 0.1, 0.3, mt(0x1e2c3a, 0.85), 0, 1.63, 0);
  B(group, 0.72, 0.08, 0.42, mt(0x1a1a1a, 0.9), 0, 0.72, 0);
  const head = new ME(new SG(0.26, 14, 12), skin);
  head.position.y = 1.85;
  head.scale.y = 0.8;
  group.add(head);
  const hair = new ME(new SG(0.27, 12, 8, 0, PI * 2, 0, PI / 2), mt(0x1a1a1a, 1));
  hair.position.y = 1.88;
  group.add(hair);
  const legL = B(group, 0.24, 0.7, 0.28, jeans, -0.16, 0.35, 0);
  const legR = B(group, 0.24, 0.7, 0.28, jeans, 0.16, 0.35, 0);
  B(group, 0.24, 0.1, 0.34, mt(0x1a1a1a, 0.9), -0.16, 0.05, 0.03);
  B(group, 0.24, 0.1, 0.34, mt(0x1a1a1a, 0.9), 0.16, 0.05, 0.03);
  const armL = B(group, 0.18, 0.65, 0.2, jacket, -0.44, 1.15, 0);
  const armR = B(group, 0.18, 0.65, 0.2, jacket, 0.44, 1.15, 0);
  // Hands ride the arms (children, so they swing with the walk cycle).
  for (const arm of [armL, armR]) {
    const hand = new ME(new BX(0.14, 0.12, 0.16), skin);
    hand.position.set(0, -0.36, 0);
    arm.add(hand);
  }
  // Rifle: barrel along local +z (the player's forward). Shots stage
  // it precisely; here it just needs to exist and point forward.
  // v53 REBUILD (both reviewers, v52): the old rifle was a dark
  // 0.9 m barrel + dark receiver + a skin block — it read as one
  // long brown plank with a tan block, not a rifle. This one is
  // built ONCE at true size with parts that separate by SILHOUETTE
  // as well as colour: a long thin LIGHT barrel (1.4 m, pale grey,
  // well past the near hand), a fatter tan handguard, a slim
  // near-black receiver, a dropped dark-wood stock, a magazine
  // hanging below, a sight on top and a front-sight post near the
  // muzzle — plus TWO skin hands with fingers (grip + stock), so
  // the hold reads two-handed from behind. The muzzle anchor is
  // the barrel tip (local z 1.6); flash + tracer anchor here.
  const rifle = new GP();
  // v57.3 (Superbot plan — weapon three-way split): the warm light
  // makes neutral greys render warm/saturated, so the sources are
  // blue-biased to cancel it. Receiver L 32-40 sat <=8, handguard
  // hue 25-35 sat 30-40 L 38-46, barrel L 55-68 sat 10-20, mag
  // L 45-55 neutral and >=12 L lighter than the handguard.
  const rBarrel = mt(0x5f6a75, 0.4);
  // v57.2: the receiver/handguard were near-black (0x1a1a1a /
  // 0x3a3e44) and blended into the player's dark jacket, so only
  // the pale barrel read — the rifle looked detached/floating and
  // the reviewer saw no weapon in the player's hands. Lighten the
  // receiver and handguard to mid-grey so the whole rifle reads as
  // one continuous object from grip to muzzle, in every shot.
  const rGuard = mt(0x453f38, 0.8); // v55: gunmetal, was tan 0xa9743f
  // — in shot 2 it rendered bright yellow (#ffd21f) and read as a
  // plastic prop; the dark gunmetal separates it from the skin hands.
  const rDark = mt(0x2e343c, 0.4);
  const rWood = mt(0x5a3a22, 0.8);
  B(rifle, 0.05, 0.05, 1.4, rBarrel, 0, 0.02, 0.9); // barrel, z 0.2-1.6
  B(rifle, 0.11, 0.13, 0.45, rGuard, 0, 0, 0.42); // handguard, z 0.2-0.65
  B(rifle, 0.09, 0.15, 0.3, rDark, 0, 0, 0.05); // receiver, z -0.1-0.2
  B(rifle, 0.08, 0.13, 0.25, rWood, 0, -0.03, -0.225); // stock, z -0.35--0.1
  const rGrip = B(rifle, 0.07, 0.16, 0.08, mt(0x3a2a18, 0.8), 0, -0.12, -0.05);
  rGrip.rotation.x = -0.3;
  const rMag = B(rifle, 0.05, 0.24, 0.09, mt(0x484e56, 0.4), 0, -0.17, 0.05); // v57.3: own mag material (was rDark) so it reads L 45-55, >=12 L lighter than the handguard
  rMag.rotation.x = 0.15;
  B(rifle, 0.035, 0.12, 0.06, rDark, 0, 0.13, 0.1); // sight
  B(rifle, 0.03, 0.08, 0.03, rDark, 0, 0.06, 1.5); // front-sight post
  // Two skin hands with fingers, riding the rifle: the near hand on
  // the grip, the far hand on the stock (the far arm cannot reach
  // the forend — it bends across the chest and its hand lands here).
  const handNear = new GP();
  B(handNear, 0.09, 0.1, 0.09, skin, 0, -0.08, -0.05);
  for (const fx of [-0.03, 0, 0.03]) B(handNear, 0.025, 0.08, 0.03, skin, fx, -0.14, -0.01);
  B(handNear, 0.03, 0.06, 0.03, skin, 0.05, -0.08, -0.08);
  rifle.add(handNear);
  const handFar = new GP();
  B(handFar, 0.09, 0.09, 0.1, skin, 0, -0.02, -0.225);
  for (const fx of [-0.03, 0, 0.03]) B(handFar, 0.025, 0.07, 0.03, skin, fx, -0.08, -0.225);
  B(handFar, 0.03, 0.06, 0.03, skin, -0.05, -0.02, -0.2);
  rifle.add(handFar);
  // Muzzle anchor: an empty group at the barrel tip. The flash, its
  // light and the tracer all anchor here, so the fire provably comes
  // from the muzzle, never from the waist (v42).
  const muzzle = new GP();
  muzzle.position.set(0, 0.02, 1.6);
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
