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
  const p = g.player;
  // wall mapping: all box meshes within 45m, project 8 corners -> screen bbox
  out.walls = [];
  g.scene.traverse(o => {
    if (!o.geometry || o.geometry.type !== 'BoxGeometry' || !o.position) return;
    const dx = o.position.x - p.pos.x, dz = o.position.z - p.pos.z;
    if (Math.hypot(dx, dz) > 45) return;
    const geo = o.geometry.parameters;
    if (!geo || geo.height < 6 || geo.width < 6) return;
    o.updateWorldMatrix(true, false);
    const hw = geo.width / 2, hh = geo.height / 2, hd = geo.depth / 2;
    const pts = [];
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1])
      pts.push(proj(new V3(o.position.x + sx * hw, o.position.y + sy * hh, o.position.z + sz * hd)));
    const xs = pts.map(q => q[0]), ys = pts.map(q => q[1]);
    const vis = pts.filter(q => q[2] < 1).length;
    out.walls.push({ pos: [+(o.position.x).toFixed(1), +(o.position.y).toFixed(1), +(o.position.z).toFixed(1)], size: [+geo.width.toFixed(1), +geo.height.toFixed(1), +geo.depth.toFixed(1)], faceZmin: +(o.position.z - hd).toFixed(1), screen: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)], vis });
  });
  // shot 3 specifics if taxi exists
  const taxi = g.player.car;
  if (taxi) {
    const L = 4.4; // approx taxi length; use bodyLen if present
    const bl = taxi.mesh.userData.bodyLen || 4.4;
    out.taxi = { pos: [taxi.pos.x, taxi.pos.z], heading: taxi.heading, bodyLen: bl,
      rearBumper: proj(new V3(taxi.pos.x - Math.cos(0) * 0, 0.4, taxi.pos.z)), // placeholder
    };
    // car forward is local +x; world forward = rotate by heading: (cos h, -sin h)?? use mesh matrix
    const fwd = new V3(1, 0, 0).applyQuaternion(taxi.mesh.quaternion);
    const rear = new V3(taxi.pos.x, 0.4, taxi.pos.z).addScaledVector(fwd, -bl / 2 - 0.05);
    const front = new V3(taxi.pos.x, 0.4, taxi.pos.z).addScaledVector(fwd, bl / 2 + 0.05);
    out.taxi.rearBumper = proj(rear);
    out.taxi.frontBumper = proj(front);
    out.taxi.roofRear = proj(new V3(taxi.pos.x, 1.5, taxi.pos.z).addScaledVector(fwd, -bl / 2));
    // bleed plane: find red transparent plane near taxi
    out.bleed = null; out.shadowChild = null;
    g.scene.traverse(o => {
      if (o.geometry && o.geometry.type === 'PlaneGeometry' && o.material && o.material.color && o.material.color.getHex() === 0xff2a1e) {
        const wp = new V3(); o.getWorldPosition(wp);
        out.bleed = { world: [+(wp.x).toFixed(1), +(wp.y).toFixed(2), +(wp.z).toFixed(1)], screen: proj(wp), op: o.material.opacity };
      }
    });
    // taxi children order
    out.taxiChildren = taxi.mesh.children.map((c, i) => ({ i, geo: c.geometry ? c.geometry.type : 'group', mat: c.material && c.material.map ? 'tex' : (c.material && c.material.color ? '#' + c.material.color.getHexString() : '?'), pos: [+(c.position.x).toFixed(2), +(c.position.y).toFixed(2), +(c.position.z).toFixed(2)] }));
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
