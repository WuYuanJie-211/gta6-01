// The screenshot scenes behind ?shot=chase|drive|walk|mission. Each one stages
// a real game state — a car, a wanted level, police behind it, a mission in
// progress — then plays the rules forward for a few seconds with a scripted
// driver, so the frame is what a short game really looks like and the same
// seed always gives the same frame. Nothing here is faked: the HUD, the
// minimap and the traffic are all the live game.
import { STEP } from './config.js';
import { enterCar, spawnPoliceCar } from './vehicles.js';

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

/** The cover: three stars, three police cars on the tail, the lighthouse run. */
function stageChase(game) {
  game.missions.setProgress(2, 1);
  const comet = game.cars.comet;
  comet.pos.set(0, 0, 120);
  comet.heading = Math.PI / 2; // north, up the avenue
  comet.mesh.position.copy(comet.pos);
  comet.mesh.rotation.y = comet.heading;
  comet.stolen = true;
  enterCar(game, comet);
  game.police.state.wanted = 3;
  const tailSpots = [[2, 132], [-4, 148], [5, 165]];
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
  driveFor(game, 2.5, (g) => steerCarToward(g, 0, -240));
  game.hud.hideMissionCard();
}

/** The coastal drive: beach and sea on the right, skyline ahead, traffic around. */
function stageDrive(game) {
  game.missions.setProgress(0, 1);
  const car = game.cars.parked[0];
  car.pos.set(-120, 0, 240);
  car.heading = 0; // east, along the coast road
  car.mesh.position.copy(car.pos);
  car.mesh.rotation.y = car.heading;
  enterCar(game, car);
  // Two traffic cars on the coast road ahead of the player, driving east.
  const coastSpots = [
    { x: -50, prev: '-60,240', target: '0,240' },
    { x: 40, prev: '0,240', target: '60,240' },
  ];
  game.cars.traffic.slice(0, 2).forEach((t, i) => {
    t.pos.set(coastSpots[i].x, 0, 240);
    t.heading = 0;
    t.prevNode = game.roads.byKey.get(coastSpots[i].prev);
    t.targetNode = game.roads.byKey.get(coastSpots[i].target);
    t.speed = 10;
    t.mesh.position.copy(t.pos);
    t.mesh.rotation.y = t.heading;
  });
  cameraBehind(game);
  driveFor(game, 3, (g) => steerCarToward(g, 240, 240));
  game.hud.hideMissionCard();
}

/** On foot at a busy intersection: pedestrians, traffic, a car to steal. */
function stageWalk(game) {
  game.missions.setProgress(0, 0);
  const player = game.player;
  player.pos.set(65, 0, 88);
  player.heading = Math.PI; // north, toward the intersection
  player.mesh.position.copy(player.pos);
  // A car parked right by the kerb, close enough for the prompt to show.
  const car = game.cars.parked[0];
  car.pos.set(68, 0, 82);
  car.heading = Math.PI / 2;
  car.mesh.position.copy(car.pos);
  car.mesh.rotation.y = car.heading;
  // A few pedestrians on the sidewalks around this corner.
  const spots = [[54, 70], [66, 60], [52, 84], [70, 96]];
  game.peds.slice(0, 4).forEach((ped, i) => {
    ped.pos.set(spots[i][0], 0, spots[i][1]);
    ped.target = { x: spots[i][0] + 20, z: spots[i][1] };
    ped.mesh.position.copy(ped.pos);
  });
  cameraBehind(game);
  walkFor(game, 1);
  game.hud.hideMissionCard();
}

/** The steal: Rook beside the red Comet GT, chop-shop muscle closing in. */
function stageMission(game) {
  game.missions.setProgress(1, 0);
  const player = game.player;
  const comet = game.cars.comet;
  // Stand south-west of the Comet, close enough for the prompt, off to the
  // side so the car is not hidden behind Rook from the camera.
  player.pos.set(-177, 0, 64);
  // Face the Comet GT.
  player.heading = Math.atan2(comet.pos.x - player.pos.x, comet.pos.z - player.pos.z);
  player.mesh.position.copy(player.pos);
  player.mesh.rotation.y = player.heading;
  game.combat.spawnThug(-168, 82);
  game.combat.spawnThug(-190, 56);
  cameraBehind(game);
  // Two seconds of the thugs closing in; the beacon spins over the Comet.
  for (let i = 0; i < Math.round(2 / STEP); i += 1) game.step(STEP);
  game.hud.hideMissionCard();
}

/** Set `game` to the named scene (chase, drive, walk or mission; anything else is drive). */
export function stageShot(name, game) {
  game.screen = 'playing';
  game.hud.showMenu(false);
  if (name === 'chase') stageChase(game);
  else if (name === 'walk') stageWalk(game);
  else if (name === 'mission') stageMission(game);
  else stageDrive(game);
  game.hud.update();
}
