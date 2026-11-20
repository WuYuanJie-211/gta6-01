import sys, asyncio, json
from playwright.async_api import async_playwright

JS = r"""
() => {
  const g = window.__game;
  const out = {};
  const V3 = g.camera.position.constructor;
  // Ray-box intersection done analytically against the known wall boxes.
  function proj(v3) {
    const v = v3.clone().project(g.camera);
    return [Math.round((v.x + 1) / 2 * 1280), Math.round((1 - v.y) / 2 * 720), +v.z.toFixed(2)];
  }
  function rayDir(sx, sy) {
    const v = new V3((sx / 1280) * 2 - 1, -((sy / 720) * 2 - 1), 0.5).unproject(g.camera);
    return v.sub(g.camera.position).normalize();
  }
  // Wall boxes (from probe26b): [cx, cy, cz, w, h, d]
  const boxes = [
    ['A', -151.7, 9.2, 212.3, 16.28, 18.49, 21.24],
    ['B', -155.3, 11.3, 214.5, 21.47, 22.59, 20.73],
    ['C', -153.6, 8.8, 210.4, 16.30, 17.65, 16.85],
    ['D', -210.0, 4.0, 210.0, 30, 8, 20],
  ];
  function rayBox(ox, oy, oz, dx, dy, dz, b) {
    const [nm, cx, cy, cz, w, h, d] = b;
    const mn = [cx - w / 2, cy - h / 2, cz - d / 2], mx = [cx + w / 2, cy + h / 2, cz + d / 2];
    let t0 = 0, t1 = 1e9;
    const o = [ox, oy, oz], dd = [dx, dy, dz];
    for (let i = 0; i < 3; i++) {
      if (Math.abs(dd[i]) < 1e-9) { if (o[i] < mn[i] || o[i] > mx[i]) return null; }
      else {
        let a = (mn[i] - o[i]) / dd[i], c = (mx[i] - o[i]) / dd[i];
        if (a > c) { const t = a; a = c; c = t; }
        if (a > t0) t0 = a;
        if (c < t1) t1 = c;
        if (t0 > t1) return null;
      }
    }
    if (t1 < 0) return null;
    const t = t0 > 0 ? t0 : t1;
    return { name: nm, t: +t.toFixed(1), point: [+(ox + dx * t).toFixed(2), +(oy + dy * t).toFixed(2), +(oz + dz * t).toFixed(2)] };
  }
  out.raycast = {};
  for (const [nm, sx, sy] of [['s700_340', 700, 340], ['s650_350', 650, 350], ['s600_350', 600, 350], ['s550_350', 550, 350], ['s500_350', 500, 350], ['s450_350', 450, 350], ['s400_350', 400, 350], ['s530_300', 530, 300], ['s530_380', 530, 380], ['s700_300', 700, 300], ['s750_360', 750, 360]]) {
    const dir = rayDir(sx, sy);
    const hits = [];
    for (const b of boxes) {
      const h = rayBox(g.camera.position.x, g.camera.position.y, g.camera.position.z, dir.x, dir.y, dir.z, b);
      if (h) hits.push(h);
    }
    hits.sort((a, b) => a.t - b.t);
    out.raycast[nm] = hits.length ? hits[0] : null;
  }
  // also: where does the firing line from rifle origin through gunman right shoulder hit the walls?
  // gunman right shoulder world (world +x side): gm.pos + (0.48,0,0) approx in world x (gunman faces -z, right = +x)
  const gm = g.combat.enemies[0];
  const rf = g.player.mesh.userData.rifle;
  const ro = new V3(); rf.getWorldPosition(ro);
  out.rifleOrigin = [+ro.x.toFixed(2), +ro.y.toFixed(2), +ro.z.toFixed(2)];
  out.gunmanPos = [+gm.pos.x.toFixed(2), +gm.pos.z.toFixed(2)];
  // line from rifle origin through shoulder point (gm.x+0.48, 1.5, gm.z), extend to z=204.1 and z=201.7
  const sh = new V3(gm.pos.x + 0.48, 1.5, gm.pos.z);
  const d = sh.clone().sub(ro);
  for (const Z of [201.7, 204.1, 210, 220]) {
    const t = (Z - ro.z) / d.z;
    out['shoulderLine_z' + Z] = [+((ro.x + d.x * t)).toFixed(2), +((ro.y + d.y * t)).toFixed(2), Z, 't=' + t.toFixed(2)];
  }
  // and the line from rifle origin with bearing = gunman bearing + delta, for deltas
  // (report where a ray at bearing b from rifle origin, y=1.5, hits z=204.1)
  out.bearingHits = {};
  for (const db of [0.1, 0.2, 0.3, 0.4, 0.5, 0.6]) {
    const b = 0.235 + db;
    const dx = Math.sin(b), dz = Math.cos(b);
    const t = (204.1 - ro.z) / dz;
    out.bearingHits['d' + db] = { x: +(ro.x + dx * t).toFixed(2), y: +(ro.y + 0).toFixed(2), screen: proj(new V3(ro.x + dx * t, 1.5, 204.1)) };
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
