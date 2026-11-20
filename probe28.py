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
  out.camera = [+cam.x.toFixed(2), +cam.y.toFixed(2), +cam.z.toFixed(2)];
  // camera right vector (screen-right) in world, XZ-plane
  const right = new V3().setFromMatrixColumn(g.camera.matrixWorld, 0);
  const rightXZ = [right.x, right.z];
  const rl = Math.hypot(rightXZ[0], rightXZ[1]);
  const leftXZ = [-rightXZ[0] / rl, -rightXZ[1] / rl]; // screen-left, XZ
  out.screenLeftXZ = [+leftXZ[0].toFixed(3), +leftXZ[1].toFixed(3)];
  // muzzle tip + current tracer start + aim
  const rf = g.player.mesh.userData.rifle;
  const tip = rf.localToWorld(new V3(0, 0.02, 0.93));
  const body = rf.localToWorld(new V3(0, 0.02, -0.2));
  out.muzzleTip = proj(tip);
  out.tracerStartNow = proj(body);
  out.aim = proj(g.aim);
  out.aimWorld = [+g.aim.x.toFixed(2), +g.aim.y.toFixed(2), +g.aim.z.toFixed(2)];
  // tracer line samples from muzzle tip to aim (screen)
  out.tracerFromTip = [];
  for (let i = 0; i <= 10; i++) {
    const p = tip.clone().lerp(g.aim, i / 10);
    out.tracerFromTip.push(proj(p));
  }
  out.tracerFromBody = [];
  for (let i = 0; i <= 10; i++) {
    const p = body.clone().lerp(g.aim, i / 10);
    out.tracerFromBody.push(proj(p));
  }
  // enemies: head-top / head-centre / torso-top / torso-bottom projections + candidate move
  out.enemies = [];
  for (const e of g.combat.enemies) {
    const sy = e.mesh.scale.y;
    const headTopY = 2.11 * sy;
    const info = {
      kind: e.kind,
      pos: [+e.pos.x.toFixed(2), +e.pos.z.toFixed(2)],
      scaleY: sy,
      headTop: proj(new V3(e.pos.x, headTopY, e.pos.z)),
      headCentre: proj(new V3(e.pos.x, 1.85 * sy, e.pos.z)),
      torsoTop: proj(new V3(e.pos.x, 1.6 * sy, e.pos.z)),
      torsoBottom: proj(new V3(e.pos.x, 0.7 * sy, e.pos.z)),
    };
    // candidate: 1.6m toward camera + 0.4m screen-left (XZ plane)
    const dx = cam.x - e.pos.x, dz = cam.z - e.pos.z;
    const dl = Math.hypot(dx, dz);
    const toCam = [dx / dl, dz / dl];
    const nx = e.pos.x + toCam[0] * 1.6 + leftXZ[0] * 0.4;
    const nz = e.pos.z + toCam[1] * 1.6 + leftXZ[1] * 0.4;
    info.candidate = [+nx.toFixed(2), +nz.toFixed(2)];
    info.candidateHeadTop = proj(new V3(nx, headTopY, nz));
    info.candidateHeadCentre = proj(new V3(nx, 1.85 * sy, nz));
    info.candidateTorsoTop = proj(new V3(nx, 1.6 * sy, nz));
    out.enemies.push(info);
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
