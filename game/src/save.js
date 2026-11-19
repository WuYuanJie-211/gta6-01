// Save/load through localStorage: cash, health, mission, weapons, ammo,
// cars bought, packages found, player position. An unreadable save is
// treated as no save. v2 has its own key (v1 saves could never load).
import { SAVE_KEY } from './config.js';

/** Write the current progress down. Returns true when it stuck. */
export function saveGame(game) {
  try {
    const data = {
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
      playerX: game.player.pos.x,
      playerZ: game.player.pos.z,
      playerHeading: game.player.heading,
      savedAt: new Date().toISOString(),
    };
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

/** Read a save back, or null when there is none (or it is broken). */
export function loadSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data.cash !== 'number' || typeof data.missionIndex !== 'number') return null;
    return data;
  } catch {
    return null;
  }
}

/** True when a save exists to continue from. */
export function hasSave() {
  return loadSave() !== null;
}
