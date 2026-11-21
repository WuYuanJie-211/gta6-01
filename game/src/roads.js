// The road graph: one node per avenue/street crossing, edges to the four
// neighbours. Traffic, police spawns, fares and the race all drive on it.
import { CITY } from './config.js';

export function buildRoads() {
  const nodes = [];
  const byKey = new Map();
  for (const x of CITY.roadLinesX) {
    for (const z of CITY.roadLinesZ) {
      const node = { x, z, key: `${x},${z}` };
      nodes.push(node);
      byKey.set(node.key, node);
    }
  }
  return { linesX: CITY.roadLinesX, linesZ: CITY.roadLinesZ, nodes, byKey };
}

export function nodeNeighbours(roads, node) {
  const out = [];
  const step = CITY.roadLinesX[1] - CITY.roadLinesX[0];
  for (const [dx, dz] of [[step, 0], [-step, 0], [0, step], [0, -step]]) {
    const next = roads.byKey.get(`${node.x + dx},${node.z + dz}`);
    if (next) out.push(next);
  }
  return out;
}

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

export function randomNode(roads, rng, bounds) {
  const pool = bounds
    ? roads.nodes.filter((n) => n.x >= bounds.minX && n.x <= bounds.maxX && n.z >= bounds.minZ && n.z <= bounds.maxZ)
    : roads.nodes;
  return rng.pick(pool.length ? pool : roads.nodes);
}

// Is the point on a road strip (either direction)?
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

// On both an avenue and a street — a crossing.
export function isIntersection(x, z) {
  const half = CITY.roadWidth / 2;
  let onX = false;
  let onZ = false;
  for (const line of CITY.roadLinesX) {
    if (Math.abs(x - line) <= half) onX = true;
  }
  for (const line of CITY.roadLinesZ) {
    if (Math.abs(z - line) <= half) onZ = true;
  }
  return onX && onZ;
}
