// Screenshot scenes (?shot=chase|gunfight|downtown|race): each stages a
// real game state, then plays the rules forward a few seconds with a
// scripted driver. Nothing is faked — HUD, minimap and traffic are live.
import { STEP } from './config.js';
import { enterCar, spawnPoliceCar } from './vehicles.js';
import { ACTION_SHOOT } from './input.js';

/** Steer the player's car toward a point: A when the nose must turn left, D for right. */
function steerCarToward(game, tx, tz) {
  const car = game.player.car;
  if (!car) return;
  const dx = tx - car.pos.x;
  const dz = tz - car.pos.z;
  const wanted = Math.atan2(-dz, dx);
  let diff = wanted - car.heading;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  game.input.setKey('a', diff > 0.06);
  game.input.setKey('d', diff < -0.06);
}

/** Hold W for `seconds`, steering with `steerFn` each step, then let go. */
function driveFor(game, seconds, steerFn) {
  game.input.setKey('w', true);
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    if (steerFn) steerFn(game);
    game.step(STEP);
  }
  game.input.setKey('w', false);
  game.input.setKey('a', false);
  game.input.setKey('d', false);
}

/** Hold W on foot for `seconds` (camera-relative, like a real player). */
function walkFor(game, seconds) {
  game.input.setKey('w', true);
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i += 1) game.step(STEP);
  game.input.setKey('w', false);
}

/** Put the camera right behind the player's direction of travel. */
function cameraBehind(game) {
  let fx;
  let fz;
  if (game.player.car) {
    fx = Math.cos(game.player.car.heading);
    fz = -Math.sin(game.player.car.heading);
  } else {
    fx = Math.sin(game.player.heading);
    fz = Math.cos(game.player.heading);
  }
  game.cameraAngle = Math.atan2(-fx, -fz);
  game.lastDragAt = game.time;
}

/**
 * The cover: the bank job in downtown. Four stars, the police helicopter
 * overhead, a roadblock going up ahead, four police cars on the tail, the
 * armored van barrelling north between the towers.
 */
function stageChase(game) {
  game.missions.setProgress(6, 1);
  const van = game.cars.armored;
  van.pos.set(240, 0, -60);
  van.heading = Math.PI / 2; // north, up the downtown avenue
  van.mesh.position.copy(van.pos);
  van.mesh.rotation.y = van.heading;
  van.stolen = true;
  enterCar(game, van);
  game.police.state.wanted = 4;
  const tailSpots = [[242, -48], [236, -32], [244, -16], [238, 0]];
  for (const [x, z] of tailSpots) {
    const pc = spawnPoliceCar(game);
    pc.pos.set(x, 0, z);
    pc.heading = Math.PI / 2;
    pc.speed = 24;
    pc.mesh.position.copy(pc.pos);
    pc.mesh.rotation.y = pc.heading;
    game.police.state.cars.push(pc);
  }
  cameraBehind(game);
  // 2.2 s north: the heli closes in, the roadblock appears ahead, and
  // the van stops 25 m short of it, so the frame shows the chase.
  driveFor(game, 2.2, (g) => steerCarToward(g, 240, -360));
  // Frame the chase: a wider, lower camera (so the sky is in the frame) and
  // the helicopter low and close ahead of the van, not high and far — a
  // 30 m heli 45 m ahead sits above the frame, as the first version proved.
  game.camDist = 14;
  game.camPitch = 0.28;
  const heli = game.police.heli;
  if (heli) {
    // Low, ahead and to the right: clear of the mission bar (top centre)
    // and the minimap (top right), in front of the towers, searchlight
    // reaching down toward the road.
    heli.position.set(game.player.car.pos.x + 15, 10, game.player.car.pos.z - 25);
  }
  game.hud.hideToast();
  game.hud.hideMissionCard();
}

/**
 * The gunfight: Rook on foot with the rifle at the chop shop, three armed
 * guards shooting back, tracers in the air, the bank-job beacon overhead.
 */
function stageGunfight(game) {
  game.missions.setProgress(6, 1);
  const player = game.player;
  player.weapon = 'rifle';
  player.ownedWeapons = ['pistol', 'rifle'];
  player.mag = 30;
  player.ammo = 60;
  player.pos.set(-182, 0, 190);
  player.heading = Math.atan2(-182 - player.pos.x, 214 - player.pos.z);
  player.mesh.position.copy(player.pos);
  player.mesh.rotation.y = player.heading;
  game.combat.spawnGunman(-186, 216);
  game.combat.spawnGunman(-178, 218);
  game.combat.spawnGunman(-182, 224);
  game.combat.spawnThug(-168, 200);
  cameraBehind(game);
  // Two rifle shots 0.2 s apart, then a final shot with no steps after
  // it: the tracer is still in the air when the frame is taken.
  for (let s = 0; s < 2; s += 1) {
    game.input.fireAction(ACTION_SHOOT);
    for (let i = 0; i < Math.round(0.2 / STEP); i += 1) game.step(STEP);
  }
  game.input.fireAction(ACTION_SHOOT);
  game.step(STEP);
  game.hud.hideMissionCard();
}

/**
 * The downtown taxi run: a yellow cab on the downtown avenue, towers and a
 * billboard around it, six traffic cars on the same roads, fares waiting.
 */
function stageDowntown(game) {
  game.missions.setProgress(3, 0);
  const taxi = game.cars.parked.find((c) => c.model === 'taxi') || game.cars.parked[0];
  taxi.pos.set(120, 0, -180);
  taxi.heading = 0; // east, along the downtown avenue
  taxi.mesh.position.copy(taxi.pos);
  taxi.mesh.rotation.y = taxi.heading;
  enterCar(game, taxi);
  // Six traffic cars on the downtown roads, driving east and west.
  const spots = [
    { x: 180, z: -180, prev: '120,-180', target: '180,-180' },
    { x: 240, z: -120, prev: '180,-120', target: '240,-120' },
    { x: 300, z: -240, prev: '240,-240', target: '300,-240' },
    { x: 200, z: -60, prev: '240,-60', target: '180,-60' },
    { x: 60, z: -120, prev: '120,-120', target: '60,-120' },
    { x: 320, z: -180, prev: '360,-180', target: '300,-180' },
  ];
  game.cars.traffic.slice(0, 6).forEach((t, i) => {
    t.pos.set(spots[i].x, 0, spots[i].z);
    t.heading = spots[i].x > 240 ? Math.PI : 0;
    t.prevNode = game.roads.byKey.get(spots[i].prev);
    t.targetNode = game.roads.byKey.get(spots[i].target);
    t.speed = 10;
    t.mesh.position.copy(t.pos);
    t.mesh.rotation.y = t.heading;
  });
  cameraBehind(game);
  driveFor(game, 3, (g) => steerCarToward(g, 360, -180));
  game.hud.hideMissionCard();
}

/**
 * The race: the Comet GT on the start line of the bay street circuit, the
 * first checkpoint dead ahead, the clock running, the port on the left.
 */
function stageRace(game) {
  game.missions.setProgress(5, 0);
  const comet = game.cars.comet;
  comet.pos.set(0, 0, -240);
  comet.heading = Math.PI / 2; // north, toward checkpoint 1
  comet.mesh.position.copy(comet.pos);
  comet.mesh.rotation.y = comet.heading;
  comet.stolen = true;
  enterCar(game, comet);
  cameraBehind(game);
  // 2.5 s north: the first checkpoint and its beacon stay ahead, the
  // timer counts down, and the car never overshoots the circuit.
  driveFor(game, 2.5, (g) => steerCarToward(g, 0, -360));
  game.hud.hideMissionCard();
}

/** Set `game` to the named scene (chase, gunfight, downtown or race; anything else is downtown). */
export function stageShot(name, game) {
  game.screen = 'playing';
  game.hud.showMenu(false);
  if (name === 'chase') stageChase(game);
  else if (name === 'gunfight') stageGunfight(game);
  else if (name === 'race') stageRace(game);
  else stageDowntown(game);
  game.hud.update();
}
