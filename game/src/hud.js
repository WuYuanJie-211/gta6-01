import { CITY, districtAt } from './config.js';
import { MISSIONS } from './missions.js';
export function createHud(game) {
  const el = (id) => document.getElementById(id);
  const [healthFill, healthText, cashText, starsBox, objectiveText, missionList, weaponText, durabilityText, districtText, timerText, promptText, toast, missionCard, missionTitle, missionStory, menu, pauseMenu, overMenu, overText, minimap, speedText, clockText, streetToast] = ['health-fill', 'health-text', 'cash', 'stars', 'objective-text', 'mission-list', 'weapon', 'durability', 'district', 'timer', 'prompt', 'toast', 'mission-card', 'mission-title', 'mission-story', 'menu', 'pause-menu', 'over-menu', 'over-text', 'minimap', 'speed', 'clock', 'street-toast'].map(el);
  const c = minimap.getContext('2d');
  let toastTimer = null;
  let streetTimer = null;
  let lastDistrict = '';
  let shakeTime = 0;
  const missionRows = MISSIONS.map((m, i) => {
    const row = document.createElement('div');
    row.className = 'mission-row';
    row.textContent = `${i + 1}. ${m.title}`;
    missionList.appendChild(row);
    return row;
  });
  function flash(message) {
    toast.textContent = message;
    toast.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 3500);
  }
  function showMissionCard(title, story) {
    missionTitle.textContent = title;
    missionStory.textContent = story;
    missionCard.classList.add('show');
    setTimeout(() => missionCard.classList.remove('show'), 6000);
  }
  function shake() {
    shakeTime = 0.35;
  }
  let hitTimer = null;
  function hitmark() {
    const mark = el('hitmarker');
    if (!mark) return;
    mark.classList.add('show');
    if (hitTimer) clearTimeout(hitTimer);
    hitTimer = setTimeout(() => mark.classList.remove('show'), 120);
  }
  function takeShake(dt) {
    if (shakeTime <= 0) return 0;
    shakeTime -= dt;
    return (Math.random() - 0.5) * 0.6;
  }
  function drawMinimap() {
    const size = minimap.width;
    const p0 = game.player.car ? game.player.car.pos : game.player.pos;
    // v32: clip to a true circle INSIDE the canvas (the CSS border-radius
    // only masked a square canvas, which read as a faceted ring), and in
    // shot mode zoom to the 240m around the player so each shot's minimap
    // reflects its own location instead of the whole-city grid.
    c.save();
    c.beginPath();
    c.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
    c.clip();
    const span = game.shotMode ? 240 : (CITY.halfSize * 2 + 80);
    const cx = game.shotMode ? p0.x : 0;
    const cz = game.shotMode ? p0.z : 0;
    const scale = size / span;
    const toMap = (x, z) => [(x - cx + span / 2) * scale, (z - cz + span / 2) * scale];
    c.fillStyle = '#0e2a3a';
    c.fillRect(0, 0, size, size);
    const [, seaY] = toMap(0, CITY.seaStart);
    c.fillStyle = '#2e7fb8';
    c.fillRect(0, seaY, size, size - seaY);
    const [, beachY] = toMap(0, CITY.beachStart);
    c.fillStyle = '#e8d49a';
    c.fillRect(0, beachY, size, seaY - beachY);
    c.fillStyle = '#3a3f45';
    const [gx, gy] = toMap(-CITY.halfSize, -CITY.halfSize);
    c.fillRect(gx, gy, CITY.halfSize * 2 * scale, (CITY.halfSize + 270) * scale);
    c.fillStyle = '#3e8f4f';
    for (const [bx, bz] of [[-150, -150], [150, -150], [-150, 150], [270, 150]]) {
      const [x, y] = toMap(bx - 23, bz - 23);
      c.fillRect(x, y, 46 * scale, 46 * scale);
    }
    c.strokeStyle = '#565d66';
    c.lineWidth = Math.max(2, CITY.roadWidth * scale);
    for (const line of CITY.roadLinesX) {
      const [x1, y1] = toMap(line, -CITY.halfSize);
      const [, y2] = toMap(line, 270);
      c.beginPath();
      c.moveTo(x1, y1);
      c.lineTo(x1, y2);
      c.stroke();
    }
    for (const line of CITY.roadLinesZ) {
      const [x1, y1] = toMap(-CITY.halfSize, line);
      const [x2] = toMap(CITY.halfSize, line);
      c.beginPath();
      c.moveTo(x1, y1);
      c.lineTo(x2, y1);
      c.stroke();
    }
    c.fillStyle = 'rgba(255,255,255,0.35)';
    c.font = 'bold 8px system-ui, sans-serif';
    c.textAlign = 'center';
    for (const [name, x, z] of [['DOWNTOWN', 225, -225], ['PORT', -315, -315], ['SUBURBS', 315, 105], ['OLD TOWN', -60, 105], ['BEACH', 0, 258]]) {
      const [mx, my] = toMap(x, z);
      c.fillText(name, mx, my);
    }
    const L = game.city.landmarks;
    const shops = [
      [L.dealer, '#4a90d9'], [L.gunShop, '#e74c3c'], [L.garage, '#95a5a6'],
      [L.diner, '#e67e22'], [L.bank, '#9b59b6'], [L.chopShop, '#f1c40f'],
    ];
    for (const [spot, color] of shops) {
      const [x, y] = toMap(spot.x, spot.z);
      c.fillStyle = color;
      c.fillRect(x - 3, y - 3, 6, 6);
    }
    c.fillStyle = '#33dd66';
    L.collectibles.forEach((spot, i) => {
      if (game.missions.state.collected[i]) return;
      const [x, y] = toMap(spot.x, spot.z);
      c.beginPath();
      c.arc(x, y, 3, 0, Math.PI * 2);
      c.fill();
    });
    c.strokeStyle = '#ff8800';
    c.lineWidth = 2;
    for (const cp of L.race) {
      const [x, y] = toMap(cp.x, cp.z);
      c.beginPath();
      c.arc(x, y, 4, 0, Math.PI * 2);
      c.stroke();
    }
    c.fillStyle = '#8b98a1';
    for (const car of game.cars.traffic) {
      const [x, y] = toMap(car.pos.x, car.pos.z);
      c.fillRect(x - 1.5, y - 1.5, 3, 3);
    }
    c.fillStyle = '#ff3333';
    for (const car of game.police.state.cars) {
      const [x, y] = toMap(car.pos.x, car.pos.z);
      c.beginPath();
      c.arc(x, y, 3.5, 0, Math.PI * 2);
      c.fill();
    }
    if (game.police.heli && game.police.heli.visible) {
      const [x, y] = toMap(game.police.heli.position.x, game.police.heli.position.z);
      c.strokeStyle = '#ff3333';
      c.lineWidth = 2;
      c.beginPath();
      c.arc(x, y, 6, 0, Math.PI * 2);
      c.stroke();
    }
    const marker = game.missions.state.marker;
    if (marker) {
      const [x, y] = toMap(marker.x, marker.z);
      c.fillStyle = '#ffe14d';
      c.beginPath();
      c.moveTo(x, y - 6);
      c.lineTo(x + 6, y);
      c.lineTo(x, y + 6);
      c.lineTo(x - 6, y);
      c.closePath();
      c.fill();
    }
    const [px, py] = toMap(p0.x, p0.z);
    let fx;
    let fz;
    if (game.player.car) {
      fx = Math.cos(game.player.car.heading);
      fz = -Math.sin(game.player.car.heading);
    } else {
      fx = Math.sin(game.player.heading);
      fz = Math.cos(game.player.heading);
    }
    c.fillStyle = '#ffffff';
    c.beginPath();
    c.moveTo(px + fx * 7, py + fz * 7);
    c.lineTo(px - fz * 5 - fx * 4, py + fx * 5 - fz * 4);
    c.lineTo(px + fz * 5 - fx * 4, py - fx * 5 - fz * 4);
    c.closePath();
    c.fill();
    c.restore();
  }
  function update() {
    const health = Math.max(0, Math.round(game.player.health));
    healthFill.style.width = `${health}%`;
    healthFill.style.background = health > 50 ? '#37c978' : health > 25 ? '#f1c40f' : '#e74c3c';
    healthText.textContent = `${health}`;
    cashText.textContent = `$${game.cash.toLocaleString('en-US')}`;
    const wanted = game.police.state.wanted;
    starsBox.textContent = '★'.repeat(wanted) + '☆'.repeat(5 - wanted);
    starsBox.style.color = wanted > 0 ? '#ff4444' : '#888888';
    objectiveText.textContent = game.missions.state.objectiveText;
    const idx = game.missions.state.index;
    const done = game.missions.state.done;
    missionRows.forEach((row, i) => {
      row.classList.toggle('done', done || i < idx);
      row.classList.toggle('current', !done && i === idx);
    });
    const weapon = game.player.weapon || 'fists';
    if (weapon === 'fists') {
      weaponText.textContent = game.shotMode ? '' : 'Fists';
    } else {
      const name = weapon === 'pistol' ? 'Pistol' : 'Rifle';
      weaponText.textContent = `${name} ${game.player.mag}/${game.player.ammo}`;
    }
    const car = game.player.car;
    if (car) {
      const hp = Math.max(0, Math.round(car.health));
      if (car.wrecked || hp <= 0) {
        durabilityText.textContent = 'WRECKED — Garage repairs $60';
        durabilityText.style.color = '#e74c3c';
      } else {
        durabilityText.textContent = `Car ${hp}%`;
        durabilityText.style.color = hp > 50 ? '#37c978' : hp > 25 ? '#f1c40f' : '#e74c3c';
      }
    } else {
      durabilityText.textContent = '';
    }
    const p = car ? car.pos : game.player.pos;
    // v31: clock (in-game time, starts 17:31) + street-name toast that
    // shows when the district changes and fades after 4s.
    // v33: shot mode uses the per-shot base time set by stageShot
    // (sunset is later than the dusk shots), so the clock matches the sky.
    const base = game.shotClockMin != null ? game.shotClockMin : 17 * 60 + 31;
    const totalMin = base + Math.floor(game.time / 60);
    const hh = String(Math.floor(totalMin / 60) % 24).padStart(2, '0');
    const mm = String(totalMin % 60).padStart(2, '0');
    clockText.textContent = `${hh}:${mm}`;
    const district = districtAt(p.x, p.z);
    districtText.textContent = district;
    if (game.shotMode) {
      // v32: in shot mode the toast must be on screen when the frame is
      // taken — show it and cancel any fade scheduled before shot mode
      // (a game.step during staging schedules one while shotMode is off,
      // which is why shots 1-2 lost the toast).
      lastDistrict = district;
      streetToast.classList.add('show');
      if (streetTimer) { clearTimeout(streetTimer); streetTimer = null; }
    } else if (district !== lastDistrict) {
      lastDistrict = district;
      streetToast.classList.add('show');
      if (streetTimer) clearTimeout(streetTimer);
      streetTimer = setTimeout(() => streetToast.classList.remove('show'), 4000);
    }
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
  function setShotMode(on, showCash = false) { game.shotMode = on; document.body.classList.toggle('shot-mode', on); document.body.classList.toggle('shot-cash', on && showCash); }
  return { flash, showMissionCard, shake, takeShake, hitmark, update, setPrompt, showMenu, showPause, showOver, setShotMode };
}
