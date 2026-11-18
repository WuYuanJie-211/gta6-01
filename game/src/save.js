// Save and load through localStorage: cash, health, mission progress and where
// the player stands. A save that cannot be read is treated as no save, never as
// an error, so a fresh player always gets a clean start.
const SAVE_KEY = 'solara-bay-save-v1';

/** Write the current progress down. Returns true when it stuck. */
export function saveGame(game) {
  try {
    const data = {
      cash: game.cash,
      health: game.player.health,
      missionIndex: game.missions.index,
      missionStage: game.missions.stage,
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
