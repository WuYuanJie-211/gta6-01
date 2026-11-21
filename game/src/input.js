// Keyboard + mouse input. Keys are held in a set (drive/steer/run read
// it every step); one-shot actions are latched into a bitmask that the
// game drains once per step with takeActions(). Dragging orbits the
// camera; a click (a press with almost no movement) fires the weapon.
export const ACTION_INTERACT = 1;
export const ACTION_PUNCH = 2;
export const ACTION_PAUSE = 4;
export const ACTION_CONFIRM = 8;
export const ACTION_SHOOT = 16;
export const ACTION_CYCLE = 32;
export const ACTION_RELOAD = 64;
export const ACTION_MUSIC = 128;
export const ACTION_HORN = 256;

export function createInput(canvas) {
  const keys = new Set();
  let actions = 0;
  let dragDx = 0;
  let dragDy = 0;
  let wheel = 0;
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  let downX = 0;
  let downY = 0;

  function onKeyDown(event) {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(event.key)) event.preventDefault();
    if (event.repeat) return;
    keys.add(event.key.toLowerCase());
    if (event.key === 'e' || event.key === 'E') actions |= ACTION_INTERACT;
    if (event.key === 'f' || event.key === 'F') actions |= ACTION_PUNCH;
    if (event.key === 'p' || event.key === 'P' || event.key === 'Escape') actions |= ACTION_PAUSE;
    if (event.key === ' ' || event.key === 'Enter') actions |= ACTION_CONFIRM;
    if (event.key === 'g' || event.key === 'G') actions |= ACTION_SHOOT;
    if (event.key === 'q' || event.key === 'Q') actions |= ACTION_CYCLE;
    if (event.key === 'r' || event.key === 'R') actions |= ACTION_RELOAD;
    if (event.key === 'm' || event.key === 'M') actions |= ACTION_MUSIC;
    if (event.key === 'h' || event.key === 'H') actions |= ACTION_HORN;
  }

  function onKeyUp(event) {
    keys.delete(event.key.toLowerCase());
  }

  function onMouseDown(event) {
    dragging = true;
    lastX = event.clientX;
    lastY = event.clientY;
    downX = event.clientX;
    downY = event.clientY;
  }

  function onMouseMove(event) {
    if (!dragging) return;
    dragDx += event.clientX - lastX;
    dragDy += event.clientY - lastY;
    lastX = event.clientX;
    lastY = event.clientY;
  }

  function onMouseUp(event) {
    dragging = false;
    // A press that barely moved is a click, not a drag — fire the weapon.
    if (Math.hypot(event.clientX - downX, event.clientY - downY) < 6) {
      actions |= ACTION_SHOOT;
    }
  }

  function onWheel(event) {
    event.preventDefault();
    wheel += event.deltaY;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  canvas.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);
  canvas.addEventListener('wheel', onWheel, { passive: false });

  return {
    // -1 / 0 / +1 along the camera axis.
    drive() {
      let v = 0;
      if (keys.has('w') || keys.has('arrowup')) v += 1;
      if (keys.has('s') || keys.has('arrowdown')) v -= 1;
      return v;
    },
    // -1 (left) / 0 / +1 (right).
    steer() {
      let v = 0;
      if (keys.has('a') || keys.has('arrowleft')) v -= 1;
      if (keys.has('d') || keys.has('arrowright')) v += 1;
      return v;
    },
    run() {
      return keys.has('shift');
    },
    takeDrag() {
      const out = { dx: dragDx, dy: dragDy };
      dragDx = 0;
      dragDy = 0;
      return out;
    },
    takeWheel() {
      const out = wheel;
      wheel = 0;
      return out;
    },
    takeActions() {
      const out = actions;
      actions = 0;
      return out;
    },
    // Test / shot staging drive the game through these two.
    setKey(key, down) {
      if (down) keys.add(key);
      else keys.delete(key);
      if (key === 'h' && down) actions |= ACTION_HORN;
    },
    fireAction(action) {
      actions |= action;
    },
  };
}
