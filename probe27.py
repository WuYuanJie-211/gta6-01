import sys, asyncio, json
from playwright.async_api import async_playwright

JS = r"""
() => {
  const g = window.__game;
  const out = {};
  const V3 = g.camera.position.constructor;
  function proj(v3) {
    const v = v3.clone().project(g.camera);
    return [Math.round((v.x + 1) / 2 * 1280), Math.round((1 - v.y) / 2 * 720), +v.z.toFixed(2)];
  }
  // unproject a screen point onto plane z = Z; returns world point or null
  function unprojToPlane(sx, sy, Z) {
    const v = new V3((sx / 1280) * 2 - 1, -((sy / 720) * 2 - 1), 0.5).unproject(g.camera);
    const dir = v.sub(g.camera.position).normalize();
    if (Math.abs(dir.z) < 1e-6) return null;
    const t = (Z - g.camera.position.z) / dir.z;
    if (t <= 0) return null;
    const p = g.camera.position.clone().addScaledVector(dir, t);
    return [+p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2)];
  }
  const p = g.player;
  const gm = g.combat.enemies[0];
  out.cam = [+g.camera.position.x.toFixed(2), +g.camera.position.y.toFixed(2), +g.camera.position.z.toFixed(2)];
  // gunman silhouette: head, shoulders, sternum, hips, feet + torso L/R edges
  if (gm) {
    out.duellist = {
      head: proj(new V3(gm.pos.x, 1.85, gm.pos.z)),
      shoulderL: proj(new V3(gm.pos.x - 0.48, 1.5, gm.pos.z)), // world -x side
      shoulderR: proj(new V3(gm.pos.x + 0.48, 1.5, gm.pos.z)), // world +x side
      sternum: proj(new V3(gm.pos.x, 1.2, gm.pos.z)),
      hips: proj(new V3(gm.pos.x, 0.8, gm.pos.z)),
      feet: proj(new V3(gm.pos.x, 0, gm.pos.z)),
    };
    // torso box corners: width .75, height .9 centred y 1.15, depth .42
    const c = [];
    for (const sx of [-0.375, 0.375]) for (const sy of [0.7, 1.6]) c.push(proj(new V3(gm.pos.x + sx, sy, gm.pos.z)));
    out.duellist.torsoBox = c;
  }
  // rifle origin world + screen
  const rf = p.mesh.userData.rifle;
  if (rf) {
    const ow = new V3(); rf.getWorldPosition(ow);
    out.rifleOrigin = { world: [+ow.x.toFixed(2), +ow.y.toFixed(2), +ow.z.toFixed(2)], screen: proj(ow) };
    for (const [nm, lp] of [['tip', [0, 0.02, 0.93]], ['mid', [0, 0.02, 0.3]], ['body', [0, 0.02, -0.2]], ['stock', [0, 0.02, -0.45]]]) {
      out['rifle_' + nm] = proj(rf.localToWorld(new V3(...lp)));
    }
    // rifle world aim bearing (local +z in world, from two local points)
    const o0 = rf.localToWorld(new V3(0, 0, 0));
    const o1 = rf.localToWorld(new V3(0, 0, 1));
    const dir = o1.sub(o0).normalize();
    out.rifleDir = [+dir.x.toFixed(3), +dir.y.toFixed(3), +dir.z.toFixed(3)];
    out.rifleBearing = +Math.atan2(dir.x, dir.z).toFixed(3);
  }
  out.playerHeading = +p.heading.toFixed(3);
  // candidate aim points: screen targets -> world on wall planes
  out.aimCandidates = {};
  for (const [nm, sx, sy] of [['A580_350', 580, 350], ['A550_350', 550, 350], ['A600_330', 600, 330], ['A580_300', 580, 300], ['A650_350', 650, 350], ['A700_340', 700, 340]]) {
    out.aimCandidates[nm] = { z2017: unprojToPlane(sx, sy, 201.7), z2041: unprojToPlane(sx, sy, 204.1), z2020: unprojToPlane(sx, sy, 202.0) };
  }
  // grid of points on building B face (z=204.1) and A face (z=201.7) -> screen
  out.wallGrid = [];
  for (const Z of [201.7, 204.1]) {
    for (const x of [-166, -162, -158, -154, -150, -146]) {
      for (const y of [1.0, 1.5, 2.0]) {
        out.wallGrid.push({ Z, x, y, screen: proj(new V3(x, y, Z)) });
      }
    }
  }
  // tracers + flash
  out.tracers = [];
  g.scene.traverse(o => {
    if (o.material && o.material.color && o.material.color.getHex && o.material.color.getHex() === 0xff9500 && o.geometry && o.geometry.type === 'BoxGeometry') {
      const wp = new V3(); o.getWorldPosition(wp);
      out.tracers.push(proj(wp));
    }
  });
  out.sprites = [];
  g.scene.traverse(o => {
    if (o.isSprite) { const wp = new V3(); o.getWorldPosition(wp); out.sprites.push([+o.scale.x.toFixed(2), proj(wp)]); }
  });
  // sparks (small gold boxes): find BoxGeometry meshes with gold-ish material near gunman
  out.sparks = [];
  g.scene.traverse(o => {
    if (o.geometry && o.geometry.type === 'BoxGeometry' && o.material && o.material.color) {
      const hex = o.material.color.getHex();
      if (hex === 0xffcc44 || hex === 0xffaa33) {
        const wp = new V3(); o.getWorldPosition(wp);
        out.sparks.push([hex.toString(16), proj(wp)]);
      }
    }
  });
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
