// The HUD v2: health, cash, wanted stars, objective + full mission list,
// weapon and ammo, car bodywork, district, race clock, prompt, menus,
// and a minimap (districts, shops, gems, checkpoints, heli, cars, marker).
import { CITY, districtAt } from './config.js';
import { MISSIONS } from './missions.js';

export function createHud(game) {
  const el = (id) => document.getElementById(id);
  const healthFill = el('health-fill');
  const healthText = el('health-text');
  const cashText = el('cash');
  const starsBox = el('stars');
  const objectiveText = el('objective-text');
  const missionList = el('mission-list');
  const weaponText = el('weapon');
  const durabilityText = el('durability');
  const districtText = el('district');
  const timerText = el('timer');
  const promptText = el('prompt');
  const toast = el('toast');
  const missionCard = el('mission-card');
  const missionTitle = el('mission-title');
  const missionStory = el('mission-story');
  const menu = el('menu');
  const pauseMenu = el('pause-menu');
  const overMenu = el('over-menu');
  const overText = el('over-text');
  const minimap = el('minimap');
  const mapCtx = minimap.getContext('2d');
  const speedText = el('speed');
  let toastTimer = null;
  let shakeTime = 0;

  const missionRows = MISSIONS.map((m, i) => {
    const row = document.createElement('div');
    row.className = 'mission-row';
    row.textContent = `${i + 1}. ${m.title}`;
    missionList.appendChild(row);
    return row;
  });

  /** A big centre message that fades after a few seconds. */
  function flash(message) {
    toast.textContent = message;
    toast.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 3500);
  }

  /** The mission card: title + story, shown when a mission starts. */
  function showMissionCard(title, story) {
    missionTitle.textContent = title;
    missionStory.textContent = story;
    missionCard.classList.add('show');
    setTimeout(() => missionCard.classList.remove('show'), 6000);
  }

  /** Hide the mission card at once (screenshot scenes do this). */
  function hideMissionCard() {
    missionCard.classList.remove('show');
  }

  /** Hide the toast at once (screenshot scenes do this). */
  function hideToast() {
    toast.classList.remove('show');
    if (toastTimer) clearTimeout(toastTimer);
  }

  /** A short camera jolt when Rook takes a hit. */
  function shake() {
    shakeTime = 0.35;
  }

  function takeShake(dt) {
    if (shakeTime <= 0) return 0;
    shakeTime -= dt;
    return (Math.random() - 0.5) * 0.6;
  }

  /** Draw the minimap: districts, roads, beach, sea, parks, shops, markers. */
  function drawMinimap() {
    const size = minimap.width;
    const scale = size / (CITY.halfSize * 2 + 80);
    const toMap = (x, z) => [(x + CITY.halfSize + 40) * scale, (z + CITY.halfSize + 40) * scale];
    mapCtx.fillStyle = '#0e2a3a';
    mapCtx.fillRect(0, 0, size, size);
    // Sea and beach at the south edge.
    const [, seaY] = toMap(0, CITY.seaStart);
    mapCtx.fillStyle = '#2e7fb8';
    mapCtx.fillRect(0, seaY, size, size - seaY);
    const [, beachY] = toMap(0, CITY.beachStart);
    mapCtx.fillStyle = '#e8d49a';
    mapCtx.fillRect(0, beachY, size, seaY - beachY);
    // City ground.
    mapCtx.fillStyle = '#3a3f45';
    const [gx, gy] = toMap(-CITY.halfSize, -CITY.halfSize);
    mapCtx.fillRect(gx, gy, CITY.halfSize * 2 * scale, (CITY.halfSize + 270) * scale);
    // Parks as green squares.
    mapCtx.fillStyle = '#3e8f4f';
    for (const [bx, bz] of [[-150, -150], [150, -150], [-150, 150], [270, 150]]) {
      const [x, y] = toMap(bx - 23, bz - 23);
      mapCtx.fillRect(x, y, 46 * scale, 46 * scale);
    }
    // Roads: vertical lines on x, horizontal lines on z.
    mapCtx.strokeStyle = '#565d66';
    mapCtx.lineWidth = Math.max(2, CITY.roadWidth * scale);
    for (const line of CITY.roadLinesX) {
      const [x1, y1] = toMap(line, -CITY.halfSize);
      const [, y2] = toMap(line, 270);
      mapCtx.beginPath();
      mapCtx.moveTo(x1, y1);
      mapCtx.lineTo(x1, y2);
      mapCtx.stroke();
    }
    for (const line of CITY.roadLinesZ) {
      const [x1, y1] = toMap(-CITY.halfSize, line);
      const [x2] = toMap(CITY.halfSize, line);
      mapCtx.beginPath();
      mapCtx.moveTo(x1, y1);
      mapCtx.lineTo(x2, y1);
      mapCtx.stroke();
    }
    // District names, so the player always knows where they are.
    mapCtx.fillStyle = 'rgba(255,255,255,0.55)';
    mapCtx.font = 'bold 8px system-ui, sans-serif';
    mapCtx.textAlign = 'center';
    for (const [name, x, z] of [['DOWNTOWN', 225, -225], ['PORT', -315, -315], ['SUBURBS', 315, 105], ['OLD TOWN', -60, 105], ['BEACH', 0, 258]]) {
      const [mx, my] = toMap(x, z);
      mapCtx.fillText(name, mx, my);
    }
    // Shops: one coloured square each.
    const L = game.city.landmarks;
    const shops = [
      [L.dealer, '#4a90d9'], [L.gunShop, '#e74c3c'], [L.garage, '#95a5a6'],
      [L.diner, '#e67e22'], [L.bank, '#9b59b6'], [L.chopShop, '#f1c40f'],
    ];
    for (const [spot, color] of shops) {
      const [x, y] = toMap(spot.x, spot.z);
      mapCtx.fillStyle = color;
      mapCtx.fillRect(x - 3, y - 3, 6, 6);
    }
    // Uncollected packages as green dots.
    mapCtx.fillStyle = '#33dd66';
    L.collectibles.forEach((spot, i) => {
      if (game.missions.state.collected[i]) return;
      const [x, y] = toMap(spot.x, spot.z);
      mapCtx.beginPath();
      mapCtx.arc(x, y, 3, 0, Math.PI * 2);
      mapCtx.fill();
    });
    // Race checkpoints as orange rings.
    mapCtx.strokeStyle = '#ff8800';
    mapCtx.lineWidth = 2;
    for (const cp of L.race) {
      const [x, y] = toMap(cp.x, cp.z);
      mapCtx.beginPath();
      mapCtx.arc(x, y, 4, 0, Math.PI * 2);
      mapCtx.stroke();
    }
    // Traffic white, police red, helicopter a red ring.
    mapCtx.fillStyle = '#ffffff';
    for (const car of game.cars.traffic) {
      const [x, y] = toMap(car.pos.x, car.pos.z);
      mapCtx.fillRect(x - 1.5, y - 1.5, 3, 3);
    }
    mapCtx.fillStyle = '#ff3333';
    for (const car of game.police.state.cars) {
      const [x, y] = toMap(car.pos.x, car.pos.z);
      mapCtx.beginPath();
      mapCtx.arc(x, y, 3.5, 0, Math.PI * 2);
      mapCtx.fill();
    }
    if (game.police.heli && game.police.heli.visible) {
      const [x, y] = toMap(game.police.heli.position.x, game.police.heli.position.z);
      mapCtx.strokeStyle = '#ff3333';
      mapCtx.lineWidth = 2;
      mapCtx.beginPath();
      mapCtx.arc(x, y, 6, 0, Math.PI * 2);
      mapCtx.stroke();
    }
    // Mission marker as a yellow diamond.
    const marker = game.missions.state.marker;
    if (marker) {
      const [x, y] = toMap(marker.x, marker.z);
      mapCtx.fillStyle = '#ffe14d';
      mapCtx.beginPath();
      mapCtx.moveTo(x, y - 6);
      mapCtx.lineTo(x + 6, y);
      mapCtx.lineTo(x, y + 6);
      mapCtx.lineTo(x - 6, y);
      mapCtx.closePath();
      mapCtx.fill();
    }
    // The player as a white triangle, pointing where they face. On foot the
    // forward is (sin h, cos h); in a car it is (cos h, -sin h).
    const p = game.player.car ? game.player.car.pos : game.player.pos;
    const [px, py] = toMap(p.x, p.z);
    let fx;
    let fz;
    if (game.player.car) {
      fx = Math.cos(game.player.car.heading);
      fz = -Math.sin(game.player.car.heading);
    } else {
      fx = Math.sin(game.player.heading);
      fz = Math.cos(game.player.heading);
    }
    mapCtx.fillStyle = '#ffffff';
    mapCtx.beginPath();
    mapCtx.moveTo(px + fx * 7, py + fz * 7);
    mapCtx.lineTo(px - fz * 5 - fx * 4, py + fx * 5 - fz * 4);
    mapCtx.lineTo(px + fz * 5 - fx * 4, py - fx * 5 - fz * 4);
    mapCtx.closePath();
    mapCtx.fill();
  }

  /** Refresh every HUD number and line from the game state. */
  function update() {
    const health = Math.max(0, Math.round(game.player.health));
    healthFill.style.width = `${health}%`;
    healthFill.style.background = health > 50 ? '#37c978' : health > 25 ? '#f1c40f' : '#e74c3c';
    healthText.textContent = `${health}`;
    cashText.textContent = `$${game.cash}`;
    const wanted = game.police.state.wanted;
    starsBox.textContent = '★'.repeat(wanted) + '☆'.repeat(5 - wanted);
    starsBox.style.color = wanted > 0 ? '#ff4444' : '#888888';
    objectiveText.textContent = game.missions.state.objectiveText;
    // The mission list: done, current, or still to come.
    const idx = game.missions.state.index;
    const done = game.missions.state.done;
    missionRows.forEach((row, i) => {
      row.classList.toggle('done', done || i < idx);
      row.classList.toggle('current', !done && i === idx);
    });
    // Weapon and ammo, on foot; the car's bodywork, while driving.
    const weapon = game.player.weapon || 'fists';
    if (weapon === 'fists') {
      weaponText.textContent = 'Fists';
    } else {
      const name = weapon === 'pistol' ? 'Pistol' : 'Rifle';
      weaponText.textContent = `${name} ${game.player.mag}/${game.player.ammo}`;
    }
    const car = game.player.car;
    if (car) {
      const hp = Math.max(0, Math.round(car.health));
      durabilityText.textContent = `Car ${hp}%`;
      durabilityText.style.color = hp > 50 ? '#37c978' : hp > 25 ? '#f1c40f' : '#e74c3c';
    } else {
      durabilityText.textContent = '';
    }
    // Where am I, and how long is left on the race clock.
    const p = car ? car.pos : game.player.pos;
    districtText.textContent = districtAt(p.x, p.z);
    timerText.textContent = game.missions.state.timerText || '';
    speedText.textContent = car ? `${Math.round(Math.abs(car.speed) * 3.6)} km/h` : '';
    drawMinimap();
  }

  function setPrompt(text) {
    promptText.textContent = text;
  }

  function showMenu(show) {
    menu.classList.toggle('hidden', !show);
  }
  function showPause(show) {
    pauseMenu.classList.toggle('hidden', !show);
  }
  function showOver(show, text) {
    overText.textContent = text;
    overMenu.classList.toggle('hidden', !show);
  }

  return { flash, hideToast, showMissionCard, hideMissionCard, shake, takeShake, update, setPrompt, showMenu, showPause, showOver };
}
