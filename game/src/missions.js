// Missions: seven chained jobs with stages, a 3D beacon over the current
// target, payouts and a story card per job. The state machine is data:
// MISSIONS lists the stages; the update loop only knows the stage keys
// (pickup / steal / deliver / fare / collect / race / escape).
import { BX, CG, MB, MS, SG, ME, GP, PI, OG, DS } from './geo.js';
import { WORLD, ECONOMY } from './config.js';
import { enterCar } from './vehicles.js';
import { randomNode } from './roads.js';

const B = (g, w, h, d, m, x = 0, y = 0, z = 0) => {
  const q = new ME(new BX(w, h, d), m);
  q.position.set(x, y, z);
  g.add(q);
  return q;
};
const mt = (c, r = 0.9) => new MS({ color: c, roughness: r });

export const MISSIONS = [
  {
    title: 'First Fare',
    story: 'Drive Mara to the Marina.',
    stages: [
      { text: 'Pick up Mara', key: 'pickup', at: 'clientSpot' },
      { text: 'Drive Mara to Marina', key: 'deliver', to: 'marina' },
    ],
  },
  {
    title: 'Hot Wheels',
    story: 'Steal the unwatched Comet GT on Bay Street.',
    stages: [
      { text: 'Steal the Comet', key: 'steal', at: 'cometSpot' },
      { text: 'Deliver the Comet to Chop Shop', key: 'deliver', to: 'chopShop', thugs: 2 },
    ],
  },
  {
    title: 'The Lighthouse Run',
    story: 'One package, one lighthouse, every cop in town.',
    stages: [
      { text: 'Pick up package', key: 'pickup', at: 'packageSpot' },
      { text: 'Deliver package to Lighthouse', key: 'deliver', to: 'lighthouse', heat: 3 },
      { text: 'Lose the cops', key: 'escape' },
    ],
  },
  {
    title: 'Downtown Taxi',
    story: 'Grab a taxi, take three fares.',
    stages: [
      { text: 'Pick up 3 fares', key: 'fare', count: 3 },
    ],
  },
  {
    title: 'Package Hunt',
    story: 'Find five green packages across the city.',
    stages: [
      { text: 'Find 5 packages', key: 'collect', count: 5 },
    ],
  },
  {
    title: 'Bay Street Grand Prix',
    story: 'Four checkpoints, one lap, three minutes.',
    stages: [
      { text: 'Race 4 checkpoints', key: 'race', count: 4, timeLimit: 180 },
    ],
  },
  {
    title: 'The Bank Job',
    story: 'Take the van leaving the bank at noon.',
    stages: [
      { text: 'Steal the van', key: 'steal', at: 'armoredSpot' },
      { text: 'Deliver van to Chop Shop', key: 'deliver', to: 'chopShop', heat: 4, gunmen: 3 },
      { text: 'Lose the cops', key: 'escape' },
    ],
  },
];

// The beacon: a translucent yellow pillar + a spinning diamond, parked
// over the current objective.
function createBeacon() {
  const group = new GP();
  const pillar = new ME(
    new CG(1.2, 1.2, 40, 12, 1, true),
    new MB({ color: 0xffe14d, transparent: true, opacity: 0.18, side: DS, depthWrite: false }),
  );
  pillar.position.y = 20;
  const diamond = new ME(
    new OG(0.9),
    new MS({ color: 0xffe14d, emissive: 0xaa8800, roughness: 0.3 }),
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

  // Mara, the first client, waiting at the plaza.
  const clientMesh = new GP();
  {
    const jacket = mt(0xf1c40f);
    const skin = mt(0xd9a066);
    const torso = B(clientMesh, 0.6, 0.8, 0.34, jacket, 0, 1.1, 0);
    torso.castShadow = true;
    const head = new ME(new SG(0.24, 12, 10), skin);
    head.position.y = 1.72;
    const hair = new ME(new SG(0.25, 12, 8, 0, PI * 2, 0, PI / 2), mt(0x4a2a1a, 1));
    hair.position.y = 1.76;
    const neck = new ME(new CG(0.09, 0.11, 0.18, 8), skin);
    neck.position.y = 1.52;
    const legL = B(clientMesh, 0.22, 0.7, 0.28, mt(0x333333, 1), -0.15, 0.35, 0);
    const legR = legL.clone();
    legR.position.x = 0.15;
    const armL = B(clientMesh, 0.16, 0.65, 0.18, jacket, -0.4, 1.1, 0);
    const armR = armL.clone();
    armR.position.x = 0.4;
    clientMesh.add(head, hair, neck, legR, armR);
    clientMesh.position.set(game.city.landmarks.clientSpot.x, 0, game.city.landmarks.clientSpot.z);
    game.scene.add(clientMesh);
  }

  const state = {
    index: 0,
    stage: 0,
    done: false,
    objectiveText: '',
    marker: null,
    escaping: false,
    timerText: '',
    fareDone: 0,
    farePicked: false,
    fareDest: null,
    farePed: null,
    collected: [false, false, false, false, false],
    raceCp: 0,
    raceTime: 0,
    bestRaceTime: null,
    spawnedForStage: '',
  };

  function mission() {
    return MISSIONS[state.index];
  }

  function nearestWaitingPed() {
    const p = game.player.car ? game.player.car.pos : game.player.pos;
    let best = null;
    let bestD = Infinity;
    for (const ped of game.peds) {
      if (!ped.alive || !ped.waiting) continue;
      const d = Math.hypot(ped.pos.x - p.x, ped.pos.z - p.z);
      if (d < bestD) {
        bestD = d;
        best = ped;
      }
    }
    return best;
  }

  function nearestPackage() {
    const p = game.player.pos;
    let best = null;
    let bestD = Infinity;
    game.city.landmarks.collectibles.forEach((spot, i) => {
      if (state.collected[i]) return;
      const d = Math.hypot(spot.x - p.x, spot.z - p.z);
      if (d < bestD) {
        bestD = d;
        best = { ...spot, index: i };
      }
    });
    return best;
  }

  function stageTarget() {
    const L = game.city.landmarks;
    const stage = mission().stages[state.stage];
    const key = stage.key;
    if (key === 'pickup' || key === 'steal') return L[stage.at];
    if (key === 'deliver') return L[stage.to];
    if (key === 'fare') {
      if (state.farePicked && state.fareDest) return state.fareDest;
      const ped = nearestWaitingPed();
      return ped ? { x: ped.pos.x, z: ped.pos.z } : null;
    }
    if (key === 'collect') return nearestPackage();
    if (key === 'race') return L.race[state.raceCp];
    return null;
  }

  function refreshObjective() {
    if (state.done) {
      state.objectiveText = 'Solara Bay is yours. Free roam.';
      state.marker = null;
      state.escaping = false;
      state.timerText = '';
      beacon.visible = false;
      return;
    }
    const stage = mission().stages[state.stage];
    state.objectiveText = `${mission().title}: ${stage.text}`;
    state.marker = stageTarget();
    state.escaping = stage.key === 'escape';
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
    state.fareDone = 0;
    state.farePicked = false;
    state.fareDest = null;
    state.farePed = null;
    state.collected = [false, false, false, false, false];
    state.raceCp = 0;
    state.raceTime = 0;
    state.spawnedForStage = '';
    if (game.city.collectibleMeshes) {
      for (const gem of game.city.collectibleMeshes) gem.visible = true;
    }
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
        game.hud.showMissionCard('SOLARA BAY IS YOURS', `Rook ran the city. $${game.cash} in the pocket.`);
        refreshObjective();
        return;
      }
      startMission(state.index);
      return;
    }
    refreshObjective();
  }

  // E pressed near the current target. Returns true if it did something.
  function interact() {
    if (state.done) return false;
    const stage = mission().stages[state.stage];
    const key = stage.key;
    const target = stageTarget();
    const p = game.player.pos;
    if (key === 'pickup' && target) {
      const d = Math.hypot(target.x - p.x, target.z - p.z);
      if (d < 4) {
        completeStage();
        return true;
      }
    }
    if (key === 'steal') {
      const car = state.index === 6 ? game.cars.armored : game.cars.comet;
      if (car && !car.stolen) {
        const d = Math.hypot(car.pos.x - p.x, car.pos.z - p.z);
        if (d < 4) {
          enterCar(game, car);
          game.police.commitCrime(state.index === 6 ? 3 : 2);
          game.hud.flash('Yours now — and so is the heat!');
          if (state.index === 6) {
            const bank = game.city.landmarks.bank;
            game.combat.spawnExplosion({ x: bank.x, y: 2, z: bank.z });
            game.audio.explosion();
          }
          completeStage();
          return true;
        }
      }
    }
    if (key === 'fare') {
      if (!state.farePicked) {
        const car = game.player.car;
        if (!car || car.model !== 'taxi') {
          game.hud.flash('Need a taxi — one is by the plaza.');
          return false;
        }
        const ped = nearestWaitingPed();
        if (ped) {
          const d = Math.hypot(ped.pos.x - car.pos.x, ped.pos.z - car.pos.z);
          if (d < 6) {
            state.farePicked = true;
            state.farePed = ped;
            ped.waiting = false;
            ped.mesh.visible = false;
            state.fareDest = randomNode(game.roads, game.rng, { minX: 60, maxX: 360, minZ: -360, maxZ: -60 });
            game.hud.flash('Fare aboard — take them downtown.');
            refreshObjective();
            return true;
          }
        }
      }
    }
    if (key === 'collect') {
      const pkg = nearestPackage();
      if (pkg) {
        const d = Math.hypot(pkg.x - p.x, pkg.z - p.z);
        if (d < 4) {
          state.collected[pkg.index] = true;
          if (game.city.collectibleMeshes) game.city.collectibleMeshes[pkg.index].visible = false;
          game.cash += ECONOMY.collectiblePay;
          game.audio.pickup();
          game.hud.flash(`Package found! +$${ECONOMY.collectiblePay} (${state.collected.filter(Boolean).length}/5).`);
          if (state.collected.every(Boolean)) completeStage();
          else refreshObjective();
          return true;
        }
      }
    }
    return false;
  }

  function update(dt) {
    clientMesh.visible = state.index === 0 && state.stage === 0;
    if (state.done) return;
    beacon.userData.diamond.rotation.y += dt * 1.5;
    beacon.userData.diamond.position.y = 6 + Math.sin(game.time * 2) * 0.5;
    const stage = mission().stages[state.stage];
    const key = stage.key;
    const target = stageTarget();
    const pos = game.player.car ? game.player.car.pos : game.player.pos;
    if (key === 'deliver' && target) {
      const d = Math.hypot(target.x - pos.x, target.z - pos.z);
      if (d < 12) {
        if (state.index === 0 && !game.player.car) return;
        completeStage();
      }
    }
    if (key === 'fare' && state.farePicked && state.fareDest) {
      const d = Math.hypot(state.fareDest.x - pos.x, state.fareDest.z - pos.z);
      if (d < 12) {
        const fare = game.rng.int(ECONOMY.taxiFareMin, ECONOMY.taxiFareMax);
        game.cash += fare;
        game.hud.flash(`Fare dropped off. +$${fare}. (${state.fareDone + 1}/3)`);
        game.audio.payout();
        state.fareDone += 1;
        if (state.farePed) {
          state.farePed.pos.set(state.fareDest.x + 3, 0, state.fareDest.z + 3);
          state.farePed.mesh.position.copy(state.farePed.pos);
          state.farePed.mesh.visible = true;
          state.farePed.mode = 'stroll';
          state.farePed.target = { x: state.fareDest.x + 20, z: state.fareDest.z + 20 };
        }
        state.farePed = null;
        state.farePicked = false;
        state.fareDest = null;
        if (state.fareDone >= stage.count) completeStage();
        else refreshObjective();
      }
    }
    if (key === 'race') {
      if (state.raceTime <= 0 && state.raceCp === 0) {
        state.raceTime = stage.timeLimit;
      }
      state.raceTime -= dt;
      const mins = Math.max(0, Math.floor(state.raceTime / 60));
      const secs = Math.max(0, Math.floor(state.raceTime % 60));
      state.timerText = `${mins}:${String(secs).padStart(2, '0')}`;
      if (state.raceTime <= 0) {
        state.raceCp = 0;
        state.raceTime = stage.timeLimit;
        game.hud.flash('Too slow — the lap restarts.');
        refreshObjective();
        return;
      }
      if (target) {
        const d = Math.hypot(target.x - pos.x, target.z - pos.z);
        if (d < 12) {
          state.raceCp += 1;
          game.audio.pickup();
          if (state.raceCp >= stage.count) {
            const lap = stage.timeLimit - state.raceTime;
            if (state.bestRaceTime === null || lap < state.bestRaceTime) {
              state.bestRaceTime = lap;
              game.hud.flash(`New best lap: ${(lap / 60).toFixed(1)}s!`);
            }
            state.timerText = '';
            completeStage();
          } else {
            game.hud.flash(`Checkpoint ${state.raceCp}/${stage.count} — keep going!`);
            refreshObjective();
          }
        }
      }
    }
    if (key === 'escape' && game.police.state.wanted === 0) {
      completeStage();
    }
    if (stage.heat && game.police.state.wanted < stage.heat) {
      game.police.commitCrime(stage.heat - game.police.state.wanted);
    }
    const stageId = `${state.index}-${state.stage}`;
    if ((stage.thugs || stage.gunmen) && state.spawnedForStage !== stageId && game.combat.enemies.filter((e) => e.alive).length === 0) {
      state.spawnedForStage = stageId;
      if (stage.thugs) {
        for (let i = 0; i < stage.thugs; i += 1) {
          game.combat.spawnThug(-196 + i * 14, 196 + i * 14);
        }
        game.hud.flash('Chop shop muscle is here. F to fight!');
      }
      if (stage.gunmen) {
        for (let i = 0; i < stage.gunmen; i += 1) {
          game.combat.spawnGunman(-196 + i * 14, 224 - i * 14);
        }
        game.hud.flash('Armed guards! Get a gun or run.');
      }
    }
  }

  function stageKey() {
    if (state.done) return '';
    return mission().stages[state.stage].key;
  }

  function setProgress(index, stage) {
    state.index = Math.min(index, MISSIONS.length - 1);
    state.stage = Math.min(stage, MISSIONS[state.index].stages.length - 1);
    state.done = false;
    state.fareDone = 0;
    state.farePicked = false;
    state.fareDest = null;
    state.farePed = null;
    state.collected = [false, false, false, false, false];
    state.raceCp = 0;
    state.raceTime = 0;
    state.spawnedForStage = '';
    if (game.city.collectibleMeshes) {
      for (const gem of game.city.collectibleMeshes) gem.visible = true;
    }
    refreshObjective();
  }

  startMission(0);
  return { state, interact, update, startMission, setProgress, stageKey };
}
