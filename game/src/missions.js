// The story of Solara Bay: three missions that chain into one arc — Rook the
// wheelman proves himself, steals the Comet GT, then runs the lighthouse gauntlet.
// Each mission is a stage with an objective line (shown in the HUD and on the
// minimap), a 3D beacon in the world, and a payout. Finish all three and the
// city is Rook's; free roam goes on after.
import * as THREE from 'three';
import { WORLD } from './config.js';
import { enterCar } from './vehicles.js';

const MISSIONS = [
  {
    title: 'First Fare',
    story: 'Mara needs a ride to the Marina. Pick her up at the plaza, then drive her there. Drive like you mean it.',
    stages: [
      { text: 'Pick up Mara at the plaza (walk to her, press E)', key: 'pickup' },
      { text: 'Drive Mara to the Marina', key: 'deliver' },
    ],
  },
  {
    title: 'Hot Wheels',
    story: 'The Comet GT is parked on Bay Street and nobody is watching. Steal it, shake the heat, and bring it to the chop shop.',
    stages: [
      { text: 'Steal the Comet GT (press E by the red car)', key: 'steal' },
      { text: 'Deliver the Comet GT to the Chop Shop', key: 'deliver' },
    ],
  },
  {
    title: 'The Lighthouse Run',
    story: 'One package, one lighthouse, every cop in the city. Deliver it and lose the tail — then Solara Bay is yours.',
    stages: [
      { text: 'Pick up the package at the Chop Shop (press E)', key: 'pickup' },
      { text: 'Deliver the package to the Lighthouse — 3 stars on you!', key: 'deliver' },
      { text: 'Lose the cops — get the wanted level to zero', key: 'escape' },
    ],
  },
];

/** A yellow light pillar plus a spinning diamond: the mission marker in the world. */
function createBeacon() {
  const group = new THREE.Group();
  const pillar = new THREE.Mesh(
    new THREE.CylinderGeometry(1.2, 1.2, 40, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffe14d, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false }),
  );
  pillar.position.y = 20;
  const diamond = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.9),
    new THREE.MeshStandardMaterial({ color: 0xffe14d, emissive: 0xaa8800, roughness: 0.3 }),
  );
  diamond.position.y = 6;
  group.add(pillar, diamond);
  group.userData.diamond = diamond;
  return group;
}

export function createMissions(game) {
  const beacon = createBeacon();
  beacon.visible = false;
  game.scene.add(beacon);
  // Mara, the client of mission 1: a person in a yellow jacket waiting at the plaza.
  const clientMesh = new THREE.Group();
  {
    const jacket = new THREE.MeshStandardMaterial({ color: 0xf1c40f, roughness: 0.9 });
    const skin = new THREE.MeshStandardMaterial({ color: 0xd9a066, roughness: 0.9 });
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.8, 0.34), jacket);
    torso.position.y = 1.1;
    torso.castShadow = true;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 10), skin);
    head.position.y = 1.72;
    const legs = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.3), new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 1 }));
    legs.position.y = 0.35;
    clientMesh.add(torso, head, legs);
    clientMesh.position.set(game.city.landmarks.clientSpot.x, 0, game.city.landmarks.clientSpot.z);
    game.scene.add(clientMesh);
  }
  const state = {
    index: 0,
    stage: 0,
    done: false,
    objectiveText: '',
    marker: null, // {x, z} or null
    clientVisible: false,
    // Mara, the client of mission 1: a person mesh standing at the plaza.
    client: null,
  };

  function mission() {
    return MISSIONS[state.index];
  }

  /** Where the current stage points: a world position, or null. */
  function stageTarget() {
    const L = game.city.landmarks;
    const key = mission().stages[state.stage].key;
    if (state.index === 0) return key === 'pickup' ? L.clientSpot : L.marina;
    if (state.index === 1) return key === 'steal' ? L.cometSpot : L.chopShop;
    if (key === 'pickup') return L.packageSpot;
    if (key === 'deliver') return L.lighthouse;
    return null; // escape: no marker, just lose the heat
  }

  function refreshObjective() {
    if (state.done) {
      state.objectiveText = 'Solara Bay is yours. Free roam — the city never sleeps.';
      state.marker = null;
      beacon.visible = false;
      return;
    }
    state.objectiveText = `${mission().title}: ${mission().stages[state.stage].text}`;
    state.marker = stageTarget();
    if (state.marker) {
      beacon.visible = true;
      beacon.position.set(state.marker.x, 0, state.marker.z);
    } else {
      beacon.visible = false;
    }
  }

  function startMission(index) {
    state.index = index;
    state.stage = 0;
    refreshObjective();
    game.hud.showMissionCard(mission().title, mission().story);
  }

  function completeStage() {
    game.audio.pickup();
    state.stage += 1;
    if (state.stage >= mission().stages.length) {
      const pay = WORLD.missionPay[state.index];
      game.cash += pay;
      game.hud.flash(`${mission().title} complete! +$${pay}.`);
      game.audio.payout();
      state.index += 1;
      if (state.index >= MISSIONS.length) {
        state.done = true;
        state.stage = 0;
        game.hud.showMissionCard('SOLARA BAY IS YOURS', `Rook ran the whole city. $${game.cash} in the pocket — and the Bay never forgets a wheelman.`);
        refreshObjective();
        return;
      }
      startMission(state.index);
      return;
    }
    refreshObjective();
  }

  /** E pressed: pickups, stealing, and anything else the current stage needs. */
  function interact() {
    if (state.done) return false;
    const key = mission().stages[state.stage].key;
    const target = stageTarget();
    const p = game.player.pos;
    if (key === 'pickup' && target) {
      const d = Math.hypot(target.x - p.x, target.z - p.z);
      if (d < 4) {
        completeStage();
        return true;
      }
    }
    if (key === 'steal' && state.index === 1) {
      const comet = game.cars.comet;
      if (comet && !comet.stolen) {
        const d = Math.hypot(comet.pos.x - p.x, comet.pos.z - p.z);
        if (d < 4) {
          comet.stolen = true;
          enterCar(game, comet);
          game.police.commitCrime(2);
          game.hud.flash('The Comet GT is yours — and so is the heat!');
          completeStage();
          return true;
        }
      }
    }
    return false;
  }

  /** Arrival checks and the escape stage, run every frame. */
  function update(dt) {
    void dt;
    // Mara waits at the plaza until Rook picks her up.
    clientMesh.visible = state.index === 0 && state.stage === 0;
    if (state.done) return;
    beacon.userData.diamond.rotation.y += dt * 1.5;
    beacon.userData.diamond.position.y = 6 + Math.sin(game.time * 2) * 0.5;
    const key = mission().stages[state.stage].key;
    const target = stageTarget();
    const pos = game.player.car ? game.player.car.pos : game.player.pos;
    if (key === 'deliver' && target) {
      const d = Math.hypot(target.x - pos.x, target.z - pos.z);
      if (d < 12) {
        if (state.index === 0 && !game.player.car) return; // Mara rides in a car
        completeStage();
      }
    }
    if (key === 'escape' && game.police.state.wanted === 0) {
      completeStage();
    }
    // Mission 3 heat: the moment the package is picked up, the city turns.
    if (state.index === 2 && state.stage === 1 && game.police.state.wanted < 3) {
      game.police.commitCrime(3 - game.police.state.wanted);
    }
    // Mission 2 muscle: thugs show up at the chop shop.
    if (state.index === 1 && state.stage === 1 && game.combat.enemies.length === 0) {
      game.combat.spawnThug(-196, 196);
      game.combat.spawnThug(-224, 224);
      game.hud.flash('Chop shop muscle is here. F to fight!');
    }
  }

  /** The key of the current stage ('pickup', 'steal', 'deliver', 'escape'). */
  function stageKey() {
    if (state.done) return '';
    return mission().stages[state.stage].key;
  }

  /** Jump to a mission and stage (used by saves and screenshot scenes). */
  function setProgress(index, stage) {
    state.index = Math.min(index, MISSIONS.length - 1);
    state.stage = Math.min(stage, MISSIONS[state.index].stages.length - 1);
    state.done = false;
    refreshObjective();
  }

  startMission(0);
  return { state, interact, update, startMission, setProgress, stageKey };
}
