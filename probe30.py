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
          const rf = g.player.mesh.userData.rifle;
          // muzzle tip (same call the tracer uses)
          const muzzle = rf.localToWorld(new (g.player.pos.constructor)(0, 0.02, 0.93));
          // a second point further along the barrel axis
          const tip2 = rf.localToWorld(new (g.player.pos.constructor)(0, 0.02, 1.93));
          const dir = [tip2.x-muzzle.x, tip2.y-muzzle.y, tip2.z-muzzle.z];
          const L = Math.hypot(...dir);
          const d = dir.map(v => v/L);
          // barrel ray intersected with ground plane y=0.1
          let hit = null;
          if (Math.abs(d[1]) > 1e-6) {
            const t = (0.1 - muzzle.y) / d[1];
            hit = { t: Math.round(t*100)/100, point: [muzzle.x+d[0]*t, 0.1, muzzle.z+d[2]*t].map(v=>Math.round(v*100)/100), screen: proj(muzzle.x+d[0]*t, 0.1, muzzle.z+d[2]*t) };
          }
          // duellist + current aim
          const duel = [-178.1, 196.1];
          const out = {
            muzzle: [muzzle.x, muzzle.y, muzzle.z].map(v=>Math.round(v*100)/100),
            muzzleScreen: proj(muzzle.x, muzzle.y, muzzle.z),
            barrelDir: d.map(v=>Math.round(v*1000)/1000),
            barrelLen: Math.round(L*100)/100,
            rayGroundHit: hit,
            aim: g.aim ? [g.aim.x, g.aim.y, g.aim.z] : null,
            aimScreen: g.aim ? proj(g.aim.x, g.aim.y, g.aim.z) : null,
            duelTorsoC: proj(-178.1, 1.35, 196.1),
            duelTorsoL: proj(-177.66, 1.35, 196.1),
            duelTorsoR: proj(-178.52, 1.35, 196.1),
            duelHead: proj(-178.1, 1.85, 196.1),
            duelHip: proj(-178.1, 1.2, 196.1),
            playerHead: proj(g.player.pos.x, 1.85, g.player.pos.z),
            rifleRot: [rf.rotation.x, rf.rotation.y, rf.rotation.z].map(v=>Math.round(v*1000)/1000),
            playerHeading: Math.round(g.player.heading*1000)/1000,
          };
          return out;
        }''')
        print(json.dumps(res, indent=1))
        await b.close()

asyncio.run(main())
