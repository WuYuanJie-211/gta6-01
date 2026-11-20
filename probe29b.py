import sys, asyncio, json
from playwright.async_api import async_playwright

JS = r"""
() => {
  const g = window.__game;
  const out = {};
  const V3 = g.camera.position.constructor;
  function proj(v3) {
    const v = v3.clone().project(g.camera);
    return [Math.round((v.x + 1) / 2 * 1280), Math.round((1 - v.y) / 2 * 720)];
  }
  const rf = g.player.mesh.userData.rifle;
  const tip = rf.localToWorld(new V3(0, 0.02, 0.93));
  out.muzzleWorld = [+tip.x.toFixed(2), +tip.y.toFixed(2), +tip.z.toFixed(2)];
  out.muzzleTip = proj(tip);
  // duellist (scale 1.15 gunman)
  const d = g.combat.enemies.find(e => e.kind === 'gunman' && e.mesh.scale.x === 1.15);
  out.duellist = { pos: [+d.pos.x.toFixed(2), +d.pos.z.toFixed(2)],
    headCentre: proj(new V3(d.pos.x, 1.85 * 1.15, d.pos.z)),
    torsoTop: proj(new V3(d.pos.x, 1.6 * 1.15, d.pos.z)),
    torsoMid: proj(new V3(d.pos.x, 1.15 * 1.15, d.pos.z)),
    torsoBottom: proj(new V3(d.pos.x, 0.7 * 1.15, d.pos.z)) };
  // ray from muzzle through a point just past the duellist's LEFT shoulder (his left = +x / screen-left).
  // Shoulder approx: duellist pos + 0.45 in +x, y 1.35. Pass 0.35m east of it.
  const WALL_X = -166.04;
  out.candidates = [];
  for (const off of [0.2, 0.35, 0.5, 0.7]) {
    const P = new V3(d.pos.x + 0.45 + off, 1.35, d.pos.z);
    const dir = new V3().subVectors(P, tip);
    const t = (WALL_X - tip.x) / dir.x;
    const aim = tip.clone().addScaledVector(dir, t);
    // tracer screen samples muzzle -> aim
    const line = [];
    for (let i = 0; i <= 10; i++) line.push(proj(tip.clone().lerp(aim, i / 10)));
    out.candidates.push({
      off, aimWorld: [+aim.x.toFixed(2), +aim.y.toFixed(2), +aim.z.toFixed(2)],
      aimScreen: proj(aim), tracer: line,
      shoulderScreen: proj(P),
    });
  }
  // also: aim on the wall at the duellist's z (same z as duellist) — tracer passes his shoulder height?
  out.wallAtDuellistZ = proj(new V3(WALL_X, 1.5, d.pos.z));
  // red men for clearance check
  out.redMen = [];
  for (const e of g.combat.enemies) {
    if (e === d) continue;
    out.redMen.push({ kind: e.kind, headCentre: proj(new V3(e.pos.x, 1.85 * e.mesh.scale.y, e.pos.z)), torsoMid: proj(new V3(e.pos.x, 1.15 * e.mesh.scale.y, e.pos.z)) });
  }
  return out;
}
"""

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'])
        pg = await b.new_page(viewport={'width': 1280, 'height': 720})
        await pg.goto('http://localhost:8080/?shot=gunfight&seed=7', wait_until='load')
        await pg.wait_for_function('window.__shotReady === true', timeout=60000)
        await pg.wait_for_timeout(300)
        print(json.dumps(await pg.evaluate(JS), indent=1))
        await b.close()

asyncio.run(main())
