// The HUD: stats, mission list, objective, prompt, street/district,
// circular minimap, speed, weapon bar, toasts, the mission card, and the
// title / pause / wasted overlays. All DOM — the 3D scene never draws UI.
// Element IDs match game/index.html exactly.
import { districtAt } from './config.js';
import { MISSIONS } from './missions.js';

export function createHud(game) {
  const el = (id) => document.getElementById(id);
  const hud = el('hud');
  const healthEl = el('hud-health');
  const cashEl = el('hud-cash');
  const clockEl = el('hud-clock');
  const starsEl = el('hud-stars');
  const objectiveEl = el('hud-objective');
  const missionListEl = el('hud-mission-list');
  const weaponEl = el('hud-weapon');
  const districtEl = el('hud-district');
  const promptEl = el('hud-prompt');
  const toastEl = el('hud-toast');
  const missionCardEl = el('hud-mission-card');
  const speedEl = el('hud-speed');
  const speedNumEl = el('hud-speed-number');
  const wantedFlashEl = el('hud-wanted-flash');
  const damageFlashEl = el('damage-flash');
  const menuEl = el('menu');
  const pauseEl = el('pause');
  const overEl = el('over');
  const minimap = el('minimap');
  const ctx = minimap.getContext('2d');
  let toastTimer = null;
  let cardTimer = null;
  let shakeTime = 0;
  let hitAt = -10;
  let lastDistrict = '';

  const missionRows = MISSIONS.map((m, i) => {
    const row = document.createElement('div');
    row.textContent = `${i + 1}. ${m.title}`;
    missionListEl.appendChild(row);
    return row;
  });

  function flash(message) {
    toastEl.textContent = message;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toastEl.textContent = ''; }, 3500);
  }

  function showMissionCard(title, story) {
    missionCardEl.textContent = `${title} — ${story}`;
    missionCardEl.classList.remove('hidden');
    if (cardTimer) clearTimeout(cardTimer);
    cardTimer = setTimeout(() => missionCardEl.classList.add('hidden'), 6000);
  }

  function shake() {
    shakeTime = 0.35;
  }

  function hitmark() {
    hitAt = game.time;
  }

  function takeShake(dt) {
    if (shakeTime <= 0) return 0;
    shakeTime -= dt;
    return (Math.random() - 0.5) * 0.35;
  }

  function showMenu(show) {
    menuEl.classList.toggle('hidden', !show);
    hud.classList.toggle('hidden', show);
  }

  function showPause(show) {
    pauseEl.classList.toggle('hidden', !show);
  }

  function showOver(show) {
    overEl.classList.toggle('hidden', !show);
  }

  function setPrompt(text) {
    promptEl.textContent = text;
  }

  function setShotMode(shot, showCash) {
    document.body.classList.toggle('shot-mode', shot);
    document.body.classList.toggle('shot-cash', showCash);
  }

  function drawMinimap() {
    const size = 140;
    const scale = size / 840;
    const cx = size / 2;
    const cy = size / 2;
    ctx.clearRect(0, 0, size, size);
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, size / 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = '#1a2a1a';
    ctx.fillRect(0, 0, size, size);
    // Sea to the south (bottom), beach band above it.
    ctx.fillStyle = '#1f6f8b';
    ctx.fillRect(0, cy + 300 * scale, size, size);
    ctx.fillStyle = '#d9c48a';
    ctx.fillRect(0, cy + 240 * scale, size, 60 * scale);
    // Roads as a faint grid.
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1;
    for (const x of [-360, -300, -240, -180, -120, -60, 0, 60, 120, 180, 240, 300, 360]) {
      ctx.beginPath();
      ctx.moveTo(cx + x * scale, 0);
      ctx.lineTo(cx + x * scale, size);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, cy + x * scale);
      ctx.lineTo(size, cy + x * scale);
      ctx.stroke();
    }
    const dot = (x, z, color, r = 3) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(cx + x * scale, cy + z * scale, r, 0, Math.PI * 2);
      ctx.fill();
    };
    const shops = [
      [game.city.landmarks.dealer, '#f5a623'],
      [game.city.landmarks.gunShop, '#e74c3c'],
      [game.city.landmarks.garage, '#3498db'],
      [game.city.landmarks.diner, '#2ecc71'],
      [game.city.landmarks.chopShop, '#9b59b6'],
    ];
    for (const [spot, color] of shops) dot(spot.x, spot.z, color);
    for (const gem of game.city.collectibleMeshes) {
      if (gem.visible) dot(gem.position.x, gem.position.z, '#2eff5e', 2);
    }
    const marker = game.missions.state.marker;
    if (marker) dot(marker.x, marker.z, '#ffd94d', 5);
    for (const car of game.police.state.cars) dot(car.pos.x, car.pos.z, '#ff4444', 2.5);
    if (game.police.heli?.visible) dot(game.police.heli.position.x, game.police.heli.position.z, '#ff8800', 3);
    const p = game.player.car ? game.player.car.pos : game.player.pos;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(cx + p.x * scale, cy + p.z * scale, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, size / 2 - 1, 0, Math.PI * 2);
    ctx.stroke();
  }

  function update() {
    const player = game.player;
    healthEl.textContent = `♥ ${Math.max(0, Math.ceil(player.health))}`;
    cashEl.textContent = `$${game.cash.toLocaleString('en-US')}`;
    const baseMin = game.shotClockMin ?? (17 * 60 + 31);
    const mins = (baseMin + Math.floor(game.time / 60)) % (24 * 60);
    clockEl.textContent = `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
    const wanted = game.police.state.wanted;
    starsEl.textContent = wanted > 0 ? '★'.repeat(wanted) + '☆'.repeat(5 - wanted) : '';
    wantedFlashEl.style.opacity = wanted > 0 ? String(0.35 + 0.25 * Math.sin(game.time * 6)) : '0';
    const sinceHit = game.time - player.lastHitAt;
    damageFlashEl.style.opacity = sinceHit < 0.4 ? String(Math.max(0, 0.9 - sinceHit)) : '0';
    const state = game.missions.state;
    objectiveEl.textContent = state.objectiveText + (state.timerText ? `  ${state.timerText}` : '');
    missionRows.forEach((row, i) => {
      row.style.color = i < state.index || state.done ? '#37c978' : i === state.index ? '#ffd94d' : '#9aa7b5';
      row.style.fontWeight = i === state.index ? '700' : '400';
      row.style.textDecoration = i < state.index || state.done ? 'line-through' : 'none';
    });
    const w = player.weapon;
    let weaponText = 'Fists';
    if (w === 'pistol') weaponText = `Pistol ${player.mag}/${player.ammo}`;
    else if (w === 'rifle') weaponText = `Rifle ${player.mag}/${player.ammo}`;
    if (player.car) weaponText += `  ·  Car ${Math.max(0, Math.ceil(player.car.health))}%`;
    if (game.time - hitAt < 0.2) weaponText += '  ✕';
    weaponEl.textContent = weaponText;
    const pos = player.car ? player.car.pos : player.pos;
    const district = districtAt(pos.x, pos.z);
    if (district !== lastDistrict) {
      lastDistrict = district;
      districtEl.textContent = district;
    }
    if (player.car) {
      speedEl.classList.remove('hidden');
      speedNumEl.textContent = String(Math.round(Math.abs(player.car.speed) * 3.6));
    } else {
      speedEl.classList.add('hidden');
    }
    drawMinimap();
  }

  return {
    flash, showMissionCard, shake, hitmark, takeShake,
    showMenu, showPause, showOver, setPrompt, setShotMode, update,
  };
}
