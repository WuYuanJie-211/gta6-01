import asyncio, json
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'])
        pg = await b.new_page(viewport={'width': 1280, 'height': 720})
        await pg.goto('http://localhost:8080/?shot=gunfight&seed=7', wait_until='load')
        await pg.wait_for_function('window.__shotReady === true', timeout=60000)
        res = await pg.evaluate('''() => {
          const g = window.__game;
          const cam = g.camera;
          const proj = (x,y,z) => {
            const v = new cam.position.constructor(x,y,z).project(cam);
            return [Math.round((v.x*0.5+0.5)*1280), Math.round((-v.y*0.5+0.5)*720)];
          };
          const V3 = g.player.pos.constructor;
          const rf = g.player.mesh.userData.rifle;
          const out = { trials: [], duelTorsoL: proj(-177.66, 1.35, 196.15), duelTorsoR: proj(-178.52, 1.35, 196.15), duelTorsoC: proj(-178.1, 1.35, 196.15), redMen: { g2: proj(-173.2, 1.35, 194.7), th: proj(-172.3, 1.35, 194.9) } };
          for (const rx of [-0.12, 0.0, 0.1, 0.16, 0.25, 0.35]) {
            rf.rotation.x = rx;
            g.player.mesh.updateMatrixWorld(true);
            const muzzle = rf.localToWorld(new V3(0, 0.02, 0.93));
            const tip2 = rf.localToWorld(new V3(0, 0.02, 1.93));
            const dir = [tip2.x-muzzle.x, tip2.y-muzzle.y, tip2.z-muzzle.z];
            const L = Math.hypot(...dir);
            const d = dir.map(v => v/L);
            let hit = null;
            if (d[1] < -1e-4) {
              const t = (0.1 - muzzle.y) / d[1];
              if (t > 0) {
                const hp = [muzzle.x+d[0]*t, 0.1, muzzle.z+d[2]*t];
                hit = { t: Math.round(t*10)/10, point: hp.map(v=>Math.round(v*100)/100), screen: proj(...hp) };
              }
            }
            out.trials.push({ rx, muzzle: [muzzle.x, muzzle.y, muzzle.z].map(v=>Math.round(v*100)/100), muzzleScreen: proj(muzzle.x, muzzle.y, muzzle.z), barrelDir: d.map(v=>Math.round(v*1000)/1000), hit });
          }
          return out;
        }''')
        print(json.dumps(res, indent=1))
        await b.close()

asyncio.run(main())
