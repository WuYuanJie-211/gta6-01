// Keyboard and mouse, read once per frame. WASD/arrows move, mouse drag orbits
// the camera, wheel zooms, E interacts, F punches, P or Escape pauses.
// The game also reads keys directly from this object, so a screenshot scene can
// drive it by writing the same fields.
export const ACTION_INTERACT = 1;
export const ACTION_PUNCH = 2;
export const ACTION_PAUSE = 4;
export const ACTION_CONFIRM = 8;

export function createInput(canvas) {
  const keys = new Set();
  let actions = 0;
  let dragDx = 0;
  let dragDy = 0;
  let wheel = 0;
  let dragging = false;
  let lastX = 0;
  let lastY = 0;

  function onKeyDown(event) {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(event.key)) event.preventDefault();
    if (event.repeat) return;
    keys.add(event.key.toLowerCase());
    if (event.key === 'e' || event.key === 'E') actions |= ACTION_INTERACT;
    if (event.key === 'f' || event.key === 'F') actions |= ACTION_PUNCH;
    if (event.key === 'p' || event.key === 'P' || event.key === 'Escape') actions |= ACTION_PAUSE;
    if (event.key === ' ' || event.key === 'Enter') actions |= ACTION_CONFIRM;
  }
  function onKeyUp(event) {
    keys.delete(event.key.toLowerCase());
  }
  function onMouseDown(event) {
    dragging = true;
    lastX = event.clientX;
    lastY = event.clientY;
  }
  function onMouseMove(event) {
    if (!dragging) return;
    dragDx += event.clientX - lastX;
    dragDy += event.clientY - lastY;
    lastX = event.clientX;
    lastY = event.clientY;
  }
  function onMouseUp() {
    dragging = false;
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
    /** Forward/back along the facing direction, -1..1. */
    drive() {
      let v = 0;
      if (keys.has('w') || keys.has('arrowup')) v += 1;
      if (keys.has('s') || keys.has('arrowdown')) v -= 1;
      return v;
    },
    /** Left/right steering, -1..1. */
    steer() {
      let v = 0;
      if (keys.has('a') || keys.has('arrowleft')) v -= 1;
      if (keys.has('d') || keys.has('arrowright')) v += 1;
      return v;
    },
    /** True while the run key is held. */
    run() {
      return keys.has('shift');
    },
    /** Mouse drag since the last frame, in pixels; resets on read. */
    takeDrag() {
      const out = { dx: dragDx, dy: dragDy };
      dragDx = 0;
      dragDy = 0;
      return out;
    },
    /** Wheel scroll since the last frame; resets on read. */
    takeWheel() {
      const out = wheel;
      wheel = 0;
      return out;
    },
    /** One-shot actions since the last frame; resets on read. */
    takeActions() {
      const out = actions;
      actions = 0;
      return out;
    },
    /** For scripted scenes: pretend a key is held. */
    setKey(key, down) {
      if (down) keys.add(key);
      else keys.delete(key);
    },
  };
}
