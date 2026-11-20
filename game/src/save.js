import { SAVE_KEY } from './config.js';
export function saveGame(game) {
  try {
    const data = {
      version: 3,
      cash: game.cash,
      health: game.player.health,
      missionIndex: game.missions.state.index,
      missionStage: game.missions.state.stage,
      weapon: game.player.weapon,
      ownedWeapons: game.player.ownedWeapons || [],
      ammo: game.player.ammo,
      mag: game.player.mag,
      ownedCars: game.ownedCars || [],
      collected: game.missions.state.collected,
      bestRaceTime: game.missions.state.bestRaceTime || null,
      playerX: game.player.pos.x,
      playerZ: game.player.pos.z,
      playerHeading: game.player.heading,
    };
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}
export function loadSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data.cash !== 'number' || typeof data.missionIndex !== 'number') return null;
    if (data.version === undefined) data.bestRaceTime = null;
    return data;
  } catch {
    return null;
  }
}
export function hasSave() {
  return loadSave() !== null;
}
