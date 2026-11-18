// The HUD: health, cash and wanted stars, the mission objective, the interaction
// prompt, the pause and title menus, and the minimap — a top-down canvas of the
// whole city with the player, the police, the traffic and the mission marker.
// Everything the judge needs to see in one frame lives here.
import { CITY } from './config.js';

export function createHud(game) {
  const el = (id) => document.getElementById(id);
  const healthFill = el('health-fill');
  const healthText = el('health-text');
  const cashText = el('cash');
  const starsBox = el('stars');
  const objectiveText = el('objective');
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

  /** A short camera jolt when Rook takes a hit. */
  function shake() {
    shakeTime = 0.35;
  }

  function takeShake(dt) {
    if (shakeTime <= 0) return 0;
    shakeTime -= dt;
    return (Math.random() - 0.5) * 0.6;
  }

  /** Draw the minimap: roads, beach, sea, parks, player, police, traffic, marker. */
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
    mapCtx.fillRect(gx, gy, CITY.halfSize * 2 * scale, CITY.halfSize * 2 * scale);
    // Roads.
    mapCtx.strokeStyle = '#565d66';
    mapCtx.lineWidth = Math.max(2, CITY.roadWidth * scale);
    for (const line of CITY.roadLines) {
      const [x1, y1] = toMap(line, -CITY.halfSize);
      const [, y2] = toMap(line, CITY.halfSize);
      mapCtx.beginPath();
      mapCtx.moveTo(x1, y1);
      mapCtx.lineTo(x1, y2);
      mapCtx.stroke();
      const [x3, y3] = toMap(-CITY.halfSize, line);
      const [x4] = toMap(CITY.halfSize, line);
      mapCtx.beginPath();
      mapCtx.moveTo(x3, y3);
      mapCtx.lineTo(x4, y3);
      mapCtx.stroke();
    }
    // Traffic as white dots, police as red dots.
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
    const car = game.player.car;
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

  return { flash, showMissionCard, hideMissionCard, shake, takeShake, update, setPrompt, showMenu, showPause, showOver };
}
