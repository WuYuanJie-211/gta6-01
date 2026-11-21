// Deterministic seeded random numbers (mulberry32). One stream per
// game, seeded from the URL (?seed=7 by default), so the city, the
// traffic and the pedestrians are identical on every load with the same
// seed — the screenshots are reproducible, and so is a playtest.
export function createRandom(seed) {
  let state = seed >>> 0;

  function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  return {
    next,
    // Float in [min, max).
    range(min, max) {
      return min + next() * (max - min);
    },
    // Integer in [min, max], both ends inclusive.
    int(min, max) {
      return Math.floor(this.range(min, max + 1));
    },
    // One element of an array, uniformly.
    pick(items) {
      return items[Math.floor(next() * items.length)];
    },
    // True with probability p.
    chance(p) {
      return next() < p;
    },
  };
}
