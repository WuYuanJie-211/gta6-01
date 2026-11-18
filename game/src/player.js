// Rook on foot: a small stylised person who walks, runs, turns with the camera
// and throws a punch. The mesh is boxes and a sphere, built once and posed by
// the controller, so the outline in the dossier says what each part does.
import * as THREE from 'three';
import { PLAYER } from './config.js';
import { resolveBuildingCollision } from './city.js';

/** Build Rook: jacket torso, head, legs that swing while walking, a punching arm. */
export function createPlayerMesh() {
  const group = new THREE.Group();
  const jacket = new THREE.MeshStandardMaterial({ color: 0x2e4053, roughness: 0.8 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xe0ac69, roughness: 0.8 });
  const jeans = new THREE.MeshStandardMaterial({ color: 0x2c3e50, roughness: 0.9 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.9, 0.4), jacket);
  torso.position.y = 1.15;
  torso.castShadow = true;
  group.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 10), skin);
  head.position.y = 1.85;
  head.castShadow = true;
  group.add(head);
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.27, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 1 }));
  hair.position.y = 1.9;
  group.add(hair);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.7, 0.3), jeans);
  legL.position.set(-0.18, 0.35, 0);
  const legR = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.7, 0.3), jeans);
  legR.position.set(0.18, 0.35, 0);
  group.add(legL, legR);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.7, 0.22), jacket);
  armL.position.set(-0.48, 1.2, 0);
  const armR = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.7, 0.22), jacket);
  armR.position.set(0.48, 1.2, 0);
  group.add(armL, armR);
  group.userData.legL = legL;
  group.userData.legR = legR;
  group.userData.armR = armR;
  return group;
}

/** Walk/run with WASD relative to the camera, colliding with buildings. */
export function updatePlayerOnFoot(game, dt) {
  const player = game.player;
  const input = game.input;
  const drive = input.drive();
  const steer = input.steer();
  const speed = input.run() ? PLAYER.runSpeed : PLAYER.walkSpeed;
  // Camera-relative movement: forward is away from the camera.
  const camAngle = game.cameraAngle;
  const moveAngle = camAngle + Math.PI - Math.atan2(steer, drive);
  const moving = drive !== 0 || steer !== 0;
  if (moving) {
    const step = speed * dt;
    player.pos.x += Math.sin(moveAngle) * step;
    player.pos.z += Math.cos(moveAngle) * step;
    resolveBuildingCollision(player.pos, PLAYER.radius, game.city.colliders);
    // Face where we walk.
    let diff = moveAngle - player.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    player.heading += Math.max(-8 * dt, Math.min(8 * dt, diff));
  }
  player.mesh.position.copy(player.pos);
  player.mesh.rotation.y = player.heading;
  // Legs swing while walking; the right arm snaps out while punching.
  const swing = moving ? Math.sin(game.time * 10) * 0.5 : 0;
  player.mesh.userData.legL.rotation.x = swing;
  player.mesh.userData.legR.rotation.x = -swing;
  const punchT = Math.max(0, player.punchTimer);
  player.mesh.userData.armR.rotation.x = punchT > 0 ? -1.4 : 0;
  player.punchTimer = Math.max(0, player.punchTimer - dt);
}
