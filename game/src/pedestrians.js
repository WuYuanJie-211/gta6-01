// The people of Solara Bay: pedestrians who stroll the sidewalks, cross at
// corners and scatter when a car comes at them. They are the city feeling alive,
// and hitting one is the fastest way to earn a wanted star.
import * as THREE from 'three';
import { CITY } from './config.js';
import { isOnRoad } from './roads.js';

const SHIRTS = [0xe74c3c, 0x3498db, 0x2ecc71, 0xf39c12, 0x9b59b6, 0xecf0f1, 0x1abc9c, 0xe67e22];

function createPedestrianMesh(color) {
  const group = new THREE.Group();
  const shirt = new THREE.MeshStandardMaterial({ color, roughness: 0.9 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xd9a066, roughness: 0.9 });
  const legs = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 1 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.75, 0.32), shirt);
  torso.position.y = 1.05;
  torso.castShadow = true;
  group.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), skin);
  head.position.y = 1.65;
  group.add(head);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.6, 0.24), legs);
  legL.position.set(-0.14, 0.3, 0);
  const legR = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.6, 0.24), legs);
  legR.position.set(0.14, 0.3, 0);
  group.add(legL, legR);
  group.userData.legL = legL;
  group.userData.legR = legR;
  return group;
}

/** A sidewalk waypoint: just off a road, at a random spot along it. */
function randomSidewalkPoint(rng) {
  const line = rng.pick(CITY.roadLines);
  const along = rng.range(-240, 240);
  const side = rng.pick([-1, 1]) * (CITY.roadWidth / 2 + 1.8);
  if (rng.chance(0.5)) return { x: line + side, z: along };
  return { x: along, z: line + side };
}

/** Scatter pedestrians on the sidewalks around the centre of town. */
export function spawnPedestrians(game, count) {
  for (let i = 0; i < count; i += 1) {
    const point = randomSidewalkPoint(game.rng);
    const mesh = createPedestrianMesh(game.rng.pick(SHIRTS));
    mesh.position.set(point.x, 0, point.z);
    game.scene.add(mesh);
    game.peds.push({
      mesh,
      pos: new THREE.Vector3(point.x, 0, point.z),
      target: randomSidewalkPoint(game.rng),
      speed: game.rng.range(1.1, 1.8),
      alive: true,
      phase: game.rng.range(0, Math.PI * 2),
    });
  }
}

/** Walk to the next sidewalk point; run away from a fast car that gets close. */
export function updatePedestrians(game, dt) {
  for (const ped of game.peds) {
    if (!ped.alive) continue;
    // Flee: a car barrelling at a pedestrian sends them running off the road.
    const car = game.player.car;
    let fleeing = false;
    if (car && Math.abs(car.speed) > 5) {
      const d = Math.hypot(ped.pos.x - car.pos.x, ped.pos.z - car.pos.z);
      if (d < 10) {
        fleeing = true;
        const away = Math.atan2(ped.pos.x - car.pos.x, ped.pos.z - car.pos.z);
        ped.target = {
          x: ped.pos.x + Math.sin(away) * 20,
          z: ped.pos.z + Math.cos(away) * 20,
        };
      }
    }
    const dx = ped.target.x - ped.pos.x;
    const dz = ped.target.z - ped.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 1.5) {
      ped.target = randomSidewalkPoint(game.rng);
      continue;
    }
    const speed = fleeing ? ped.speed * 2.4 : ped.speed;
    ped.pos.x += (dx / dist) * speed * dt;
    ped.pos.z += (dz / dist) * speed * dt;
    ped.mesh.position.copy(ped.pos);
    ped.mesh.rotation.y = Math.atan2(dx, dz);
    const swing = Math.sin(game.time * 8 + ped.phase) * 0.45;
    ped.mesh.userData.legL.rotation.x = swing;
    ped.mesh.userData.legR.rotation.x = -swing;
    // Pedestrians stay out of the sea and off the road middle where they can.
    if (ped.pos.z > 300) ped.target = randomSidewalkPoint(game.rng);
    if (isOnRoad(ped.pos.x, ped.pos.z) && !fleeing) {
      // Crossing: keep going, it reads as a real crossing.
    }
  }
}
