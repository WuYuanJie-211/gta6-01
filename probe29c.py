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
  const d = g.combat.enemies.find(e => e.kind === 'gunman' && e.mesh.scale.x === 1.15);
  out.duellist = { pos: [+d.pos.x.toFixed(2), +d.pos.z.toFixed(2)],
    headCentre: proj(new V3(d.pos.x, 1.85 * 1.15, d.pos.z)),
    torsoTop: proj(new V3(d.pos.x, 1.6 * 1.15, d.pos.z)),
    torsoMid: proj(new V3(d.pos.x, 1.15 * 1.15, d.pos.z)),
    torsoBottom: proj(new V3(d.pos.x, 0.7 * 1.15, d.pos.z)) };
  // torso left/right edges: torso is 0.75 wide * 1.15, centred on pos; project the side points
  out.duellist.torsoLeft = proj(new V3(d.pos.x + 0.43, 1.15 * 1.15, d.pos.z));
  out.duellist.torsoRight = proj(new V3(d.pos.x - 0.43, 1.15 * 1.15, d.pos.z));
  out.duellist.shoulderL = proj(new V3(d.pos.x + 0.43, 1.35, d.pos.z));
  const rf = g.player.mesh.userData.rifle;
  out.rifleTests = [];
  const origRot = rf.rotation.y;
  for (const ry of [0.6, 0.4, 0.2, 0.0, -0.2]) {
    rf.rotation.y = ry;
    rf.updateMatrixWorld(true);
    const tip = rf.localToWorld(new V3(0, 0.02, 0.93));
    const body = rf.localToWorld(new V3(0, 0.02, -0.2));
    // aim at duellist left shoulder (his left = +x)
    const shoulder = new V3(d.pos.x + 0.43, 1.35, d.pos.z);
    // aim just past his left shoulder: 0.5m further east (+x) at same height
    const pastShoulder = new V3(d.pos.x + 0.93, 1.35, d.pos.z);
    out.rifleTests.push({
      ry, tipWorld: [+tip.x.toFixed(2), +tip.y.toFixed(2), +tip.z.toFixed(2)],
      tipScreen: proj(tip), bodyScreen: proj(body),
      shoulderScreen: proj(shoulder), pastShoulderScreen: proj(pastShoulder),
    });
  }
  rf.rotation.y = origRot;
  rf.updateMatrixWorld(true);
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
