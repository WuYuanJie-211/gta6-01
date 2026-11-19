// The road network: a regular grid (13 lines on x, 11 on z, 60 m apart).
// Every crossing is a node; traffic hops node to node, staying on roads.
import { CITY } from './config.js';

/** Build the network once; the result is plain data, no three.js in here. */
export function buildRoads() {
  const lines = CITY.roadLines;
  const nodes = [];
  const byKey = new Map();
  for (const x of CITY.roadLinesX) {
    for (const z of CITY.roadLinesZ) {
      const node = { x, z, key: `${x},${z}` };
      nodes.push(node);
      byKey.set(node.key, node);
    }
  }
  return { lines, linesX: CITY.roadLinesX, linesZ: CITY.roadLinesZ, nodes, byKey };
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

/** A random intersection, optionally inside one district's bounds. */
export function randomNode(roads, rng, bounds) {
  const pool = bounds
    ? roads.nodes.filter((n) => n.x >= bounds.minX && n.x <= bounds.maxX && n.z >= bounds.minZ && n.z <= bounds.maxZ)
    : roads.nodes;
  return rng.pick(pool.length ? pool : roads.nodes);
}

/** Is (x, z) on a road surface (within half the road width of a centreline)? */
export function isOnRoad(x, z) {
  const half = CITY.roadWidth / 2;
  for (const line of CITY.roadLinesX) {
    if (Math.abs(x - line) <= half) return true;
  }
  for (const line of CITY.roadLinesZ) {
    if (Math.abs(z - line) <= half) return true;
  }
  return false;
}
