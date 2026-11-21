// The HUD: dark rounded panels (v39 style) for the stats, mission
// list, objective, weapon and district; a circular minimap; toasts and
// mission cards; the wanted flash.
//
// The wanted border is STATIC and subtle (opacity 0.22 while wanted) —
// the old border pulsed with sin(time) and read as a flashing alarm in
// every chase frame.
import { districtAt } from './config.js';

const MISSION_TITLES = [
  'First Fare', 'Hot Wheels', 'The Lighthouse Run', 'Downtown Taxi',
  'Package Hunt', 'Bay Street Grand Prix', 'The Bank Job',
];

export function createHud(game) {
  const $ = (id) => document.getElementById(id);
  const hud = $('hud');
  const healthEl = $('hud-health');
  const healthBarEl = $('hud-health-bar');
  const cashEl = $('hud-cash');
  const clockEl = $('hud-clock');
  const starsEl = $('hud-stars');
  const objectiveEl = $('hud-objective');
  const missionListEl = $('hud-mission-list');
  const weaponEl = $('hud-weapon');
  const districtEl = $('hud-district');
  const promptEl = $('hud-prompt');
  const toastEl = $('hud-toast');
  const missionCardEl = $('hud-mission-card');
  const speedEl = $('hud-speed');
  const speedNumEl = $('hud-speed-number');
  const minimapEl = $('minimap');
  const ctx = minimapEl.getContext('2d');
  const wantedFlashEl = $('hud-wanted-flash');
  const damageFlashEl = $('damage-flash');
  const menuEl = $('menu');
  const pauseEl = $('pause');
  const overEl = $('over');
  let lastDistrict = '';
  let shakeTime = 0;
  let shotMode = false;
  let hitAt = -100;
  let cardTimer = null;
  let toastTimer = null;

  const missionRows = [];
  for (const t of MISSION_TITLES) {
    const row = document.createElement('div');
    row.textContent = t;
    missionListEl.appendChild(row);
    missionRows.push(row);
  }

  function flash(text) {
    toastEl.textContent = text;
    toastEl.classList.remove('hidden');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.add('hidden'), 2500);
  }

  function showMissionCard(title, story) {
    missionCardEl.innerHTML = '';
    const t = document.createElement('div');
    t.className = 'mc-title';
    t.textContent = title;
    const s = document.createElement('div');
    s.className = 'mc-story';
    s.textContent = story;
    missionCardEl.append(t, s);
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

  function showOver(show, text) {
    overEl.classList.toggle('hidden', !show);
    if (text) {
      const p = overEl.querySelector('p');
      if (p) p.textContent = text;
    }
  }

  function setPrompt(text) {
    promptEl.textContent = text;
  }

  function setShotMode(shot, showCash) {
    shotMode = shot;
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
    const hp = Math.max(0, Math.ceil(player.health));
    healthEl.textContent = `♥ ${hp}`;
    healthBarEl.style.width = `${hp}%`;
    healthBarEl.style.background = hp > 50 ? '#37c978' : hp > 25 ? '#f5a623' : '#e74c3c';
    cashEl.textContent = `$${game.cash.toLocaleString('en-US')}`;
    const baseMin = game.shotClockMin ?? (17 * 60 + 31);
    const mins = (baseMin + Math.floor(game.time / 60)) % (24 * 60);
    clockEl.textContent = `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
    const wanted = game.police.state.wanted;
    starsEl.textContent = wanted > 0 ? '★'.repeat(wanted) + '☆'.repeat(5 - wanted) : '';
    // Static, subtle — no pulse.
    wantedFlashEl.style.opacity = wanted > 0 ? '0.22' : '0';
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
    if (!shotMode && game.time - hitAt < 0.2) weaponText += '  ✕';
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
