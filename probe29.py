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
  out.muzzleTip = proj(tip);
  out.aimNow = proj(g.aim);
  // duellist = the gunman at scale 1.15 (the target); red men = the other two enemies
  out.enemies = [];
  for (const e of g.combat.enemies) {
    const sy = e.mesh.scale.y;
    out.enemies.push({
      kind: e.kind,
      pos: [+e.pos.x.toFixed(2), +e.pos.z.toFixed(2)],
      scaleY: sy,
      headTop: proj(new V3(e.pos.x, 2.11 * sy, e.pos.z)),
      headCentre: proj(new V3(e.pos.x, 1.85 * sy, e.pos.z)),
      torsoTop: proj(new V3(e.pos.x, 1.6 * sy, e.pos.z)),
      torsoMid: proj(new V3(e.pos.x, 1.15 * sy, e.pos.z)),
      torsoBottom: proj(new V3(e.pos.x, 0.7 * sy, e.pos.z)),
    });
  }
  // grid of aim points along building B's -x face (x=-166.2), z from 204 to 226
  out.aimGrid = [];
  for (let z = 204; z <= 226; z += 2) {
    const a = new V3(-166.2, 1.5, z);
    out.aimGrid.push({ z, screen: proj(a) });
  }
  // also vary x (off the wall face) at z=204, to see screen-x sensitivity
  out.aimX = [];
  for (let x = -166.2; x <= -158; x += 2) {
    const a = new V3(x, 1.5, 204);
    out.aimX.push({ x, screen: proj(a) });
  }
  // tracer line from tip to current aim, sampled
  out.tracerNow = [];
  for (let i = 0; i <= 10; i++) out.tracerNow.push(proj(tip.clone().lerp(g.aim, i / 10)));
  // where is the wall face in screen space? project wall-face points at several z
  out.wallFace = [];
  for (let z = 196; z <= 226; z += 4) {
    out.wallFace.push({ z, top: proj(new V3(-166.04, 12, z)), mid: proj(new V3(-166.04, 1.5, z)), bottom: proj(new V3(-166.04, 0, z)) });
  }
  // duellist candidate moves: move him toward the wall (+x) at same z, and +x/+z
  out.duellistMoves = [];
  const d = g.combat.enemies.find(e => e.mesh.scale.x === 1.15) || g.combat.enemies[0];
  for (const [dx, dz] of [[2,0],[4,0],[6,0],[8,0],[4,2],[6,2],[8,2],[6,-2],[8,-2]]) {
    const nx = d.pos.x + dx, nz = d.pos.z + dz;
    out.duellistMoves.push({ dx, dz, pos: [+nx.toFixed(1), +nz.toFixed(1)], headCentre: proj(new V3(nx, 1.85 * 1.15, nz)), torsoMid: proj(new V3(nx, 1.15 * 1.15, nz)) });
  }
  return out;
}
"""

async def main():
    shot = sys.argv[1] if len(sys.argv) > 1 else 'gunfight'
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'])
        pg = await b.new_page(viewport={'width': 1280, 'height': 720})
        await pg.goto(f'http://localhost:8080/?shot={shot}&seed=7', wait_until='load')
        await pg.wait_for_function('window.__shotReady === true', timeout=60000)
        await pg.wait_for_timeout(300)
        print(json.dumps(await pg.evaluate(JS), indent=1))
        await b.close()

asyncio.run(main())
