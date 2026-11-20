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
  const cam = g.camera.position;
  const right = new V3().setFromMatrixColumn(g.camera.matrixWorld, 0);
  const rl = Math.hypot(right.x, right.z);
  const leftXZ = [-right.x / rl, -right.z / rl];
  // tracer from muzzle tip to aim (screen)
  const rf = g.player.mesh.userData.rifle;
  const tip = rf.localToWorld(new V3(0, 0.02, 0.93));
  const tipS = proj(tip), aimS = proj(g.aim);
  out.tracer = [tipS, aimS];
  function tracerYatX(sx) {
    const [x0, y0] = tipS, [x1, y1] = aimS;
    if (sx < Math.min(x0, x1) || sx > Math.max(x0, x1)) return null;
    return Math.round(y0 + (y1 - y0) * (sx - x0) / (x1 - x0));
  }
  out.grid = [];
  // base positions: g2 gunman (-174.8,198.5) headTop 2.11, th thug (-173.6,198.5) headTop 1.79
  const bases = [['g2', -174.8, 198.5, 2.11], ['th', -173.6, 198.5, 1.79]];
  for (const [nm, bx, bz, ht] of bases) {
    for (const dl of [0, 1, 2, 3, 4, 5, 6, -1, -2]) {        // metres screen-left (+)
      for (const dc of [0, 1.6, 3.2, -1.6]) {                  // metres toward camera (+)
        const dx = cam.x - bx, dz = cam.z - bz;
        const dlen = Math.hypot(dx, dz);
        const nx = bx + (dx / dlen) * dc + leftXZ[0] * dl;
        const nz = bz + (dz / dlen) * dc + leftXZ[1] * dl;
        const hc = proj(new V3(nx, ht - 0.26, nz));
        const htop = proj(new V3(nx, ht, nz));
        const ttop = proj(new V3(nx, ht - 0.51, nz));
        const feet = proj(new V3(nx, 0, nz));
        const ty = tracerYatX(hc[0]);
        // clear if head centre x is outside tracer x-range by 35px, or tracer y is above headTop-5 or below feet+5
        const clear = (hc[0] + 35 < 351) || (hc[0] - 35 > 708) || (ty !== null && (ty < htop[1] - 5 || ty > feet[1] + 5)) || ty === null;
        out.grid.push({ man: nm, dLeft: dl, dCam: dc, pos: [+nx.toFixed(2), +nz.toFixed(2)], headX: hc[0], headTopY: htop[1], torsoTopY: ttop[1], feetY: feet[1], tracerY: ty, clear });
      }
    }
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
        print(json.dumps(await pg.evaluate(JS), indent=0))
        await b.close()

asyncio.run(main())
