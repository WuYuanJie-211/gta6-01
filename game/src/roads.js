// The road network of Solara Bay: a regular grid. Roads run along the lines in
// config; every crossing of an x-line and a z-line is a node, and traffic cars
// hop from node to neighbouring node, so they always stay on a road.
import { CITY } from './config.js';

/** Build the network once; the result is plain data, no three.js in here. */
export function buildRoads() {
  const lines = CITY.roadLines;
  const nodes = [];
  const byKey = new Map();
  for (const x of lines) {
    for (const z of lines) {
      const node = { x, z, key: `${x},${z}` };
      nodes.push(node);
      byKey.set(node.key, node);
    }
  }
  return { lines, nodes, byKey };
}

/** The neighbouring intersections of a node (up to four, along the grid). */
export function nodeNeighbours(roads, node) {
  const out = [];
  const step = 60;
  for (const [dx, dz] of [[step, 0], [-step, 0], [0, step], [0, -step]]) {
    const next = roads.byKey.get(`${node.x + dx},${node.z + dz}`);
    if (next) out.push(next);
  }
  return out;
}

/** Nearest intersection to a point (used to drop police and traffic on a road). */
export function nearestNode(roads, x, z) {
  let best = roads.nodes[0];
  let bestD = Infinity;
  for (const node of roads.nodes) {
    const d = (node.x - x) ** 2 + (node.z - z) ** 2;
    if (d < bestD) {
      bestD = d;
      best = node;
    }
  }
  return best;
}

/**
 * Closest point on any road centreline to (x, z), plus the road's direction.
 * Traffic and the autopilot steer toward this when they need to get back on tarmac.
 */
export function nearestRoadPoint(x, z) {
  let best = null;
  let bestD = Infinity;
  for (const line of CITY.roadLines) {
    // Roads running north-south (constant x) and east-west (constant z).
    const dX = Math.abs(x - line);
    if (dX < bestD) {
      bestD = dX;
      best = { x: line, z, along: 'z' };
    }
    const dZ = Math.abs(z - line);
    if (dZ < bestD) {
      bestD = dZ;
      best = { x, z: line, along: 'x' };
    }
  }
  return best;
}

/** Is (x, z) on a road surface (within half the road width of a centreline)? */
export function isOnRoad(x, z) {
  const half = CITY.roadWidth / 2;
  for (const line of CITY.roadLines) {
    if (Math.abs(x - line) <= half || Math.abs(z - line) <= half) return true;
  }
  return false;
}
