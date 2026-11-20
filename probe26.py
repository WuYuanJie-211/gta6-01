import sys, asyncio
from playwright.async_api import async_playwright

JS = r"""
() => {
  const g = window.__game;
  const out = {};
  const V3 = g.camera.position.constructor;
  const V = (x, y, z) => new V3(x, y, z);
  function proj(v3) {
    const v = v3.clone().project(g.camera);
    return [Math.round((v.x + 1) / 2 * 1280), Math.round((1 - v.y) / 2 * 720), +v.z.toFixed(2)];
  }
  const p = g.player;
  out.playerPos = [p.pos.x, p.pos.z, +p.heading.toFixed(3)];
  out.cam = [g.camera.position.x.toFixed(2), g.camera.position.y.toFixed(2), g.camera.position.z.toFixed(2)];
  out.camDist = g.camDist; out.camPitch = g.camPitch; out.camX = g.camX;
  // player head: mesh is a group; find head sphere approx via children bounding box
  const pm = p.mesh;
  pm.updateWorldMatrix(true, true);
  out.playerBox = null;
  // head sphere: children of player mesh - find the sphere geometry child near top
  let head = null;
  pm.traverse(o => { if (o.geometry && o.geometry.type === 'SphereGeometry' && o.position.y > 1.2) head = o; });
  if (head) {
    const wp = new V3(); head.getWorldPosition(wp);
    out.headWorld = [wp.x.toFixed(2), wp.y.toFixed(2), wp.z.toFixed(2)];
    out.headScreen = proj(wp);
    const r = head.geometry.parameters.radius * (head.scale.x || 1);
    out.headR = +r.toFixed(3);
    // project head left/right edges: offset along camera-right
    const right = new V3(1, 0, 0).applyQuaternion(g.camera.quaternion);
    out.headL = proj(wp.clone().addScaledVector(right, -r));
    out.headRr = proj(wp.clone().addScaledVector(right, r));
    out.headT = proj(wp.clone().add(new V3(0, r, 0)));
    out.headB = proj(wp.clone().add(new V3(0, -r, 0)));
  }
  // rifle local points -> screen
  const rf = pm.userData.rifle;
  if (rf) {
    for (const [nm, lp] of [['tip', [0, 0.02, 0.93]], ['mid', [0, 0.02, 0.3]], ['body', [0, 0.02, -0.2]], ['stock', [0, 0.02, -0.45]]]) {
      out['rifle_' + nm] = proj(rf.localToWorld(new V3(...lp)));
    }
  }
  // gunman sternum (first enemy = duellist)
  const gm = g.combat.enemies[0];
  if (gm) {
    out.duellistPos = [gm.pos.x, gm.pos.z];
    out.sternum = proj(new V3(gm.pos.x, 1.2, gm.pos.z));
    out.duellistHead = proj(new V3(gm.pos.x, 1.75, gm.pos.z));
    out.duellistFeet = proj(new V3(gm.pos.x, 0, gm.pos.z));
    out.duellistBox = null;
  }
  // red men
  out.redMen = g.combat.enemies.slice(1).map(e => ({ pos: [e.pos.x, e.pos.z], chest: proj(new V3(e.pos.x, 1.1, e.pos.z)) }));
  // tracers: list live tracer mesh positions projected
  out.tracers = [];
  g.scene.traverse(o => {
    if (o.material && o.material.color && o.material.color.getHex && o.material.color.getHex() === 0xff9500 && o.geometry && o.geometry.type === 'BoxGeometry') {
      const wp = new V3(); o.getWorldPosition(wp);
      out.tracers.push(proj(wp));
    }
  });
  // flash sprites
  out.sprites = [];
  g.scene.traverse(o => {
    if (o.isSprite) { const wp = new V3(); o.getWorldPosition(wp); out.sprites.push([o.scale.x, proj(wp)]); }
  });
  // big brick buildings near duel: box meshes with brick-ish material, within 40m of player
  out.buildings = [];
  g.scene.traverse(o => {
    if (o.geometry && o.geometry.type === 'BoxGeometry' && o.position) {
      const dx = o.position.x - p.pos.x, dz = o.position.z - p.pos.z;
      const d = Math.hypot(dx, dz);
      const geo = o.geometry.parameters;
      if (d < 45 && geo && geo.height > 6 && geo.width > 6) {
        out.buildings.push({ pos: [o.position.x.toFixed(1), o.position.y.toFixed(1), o.position.z.toFixed(1)], size: [geo.width, geo.height, geo.depth], dist: +d.toFixed(1), mat: o.material && o.material.map ? 'tex' : (o.material && o.material.color ? '#' + o.material.color.getHexString() : '?') });
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
        import json
        print(json.dumps(await pg.evaluate(JS), indent=1))
        await b.close()

asyncio.run(main())
