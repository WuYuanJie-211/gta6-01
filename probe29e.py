import asyncio, json
from playwright.async_api import async_playwright

# Candidate aims: points that put the tracer on a sideways (visible) path passing near the duellist.
# Duellist at (-178.09, 196.15), torso screen centre ~(805,379), torso x 757-854.
CANDIDATES = {
    'ground_W_2m':      (-180.0, 0.1, 198.0),
    'ground_W_2m_far':  (-180.0, 0.1, 200.0),
    'ground_W_1m':      (-179.1, 0.1, 198.0),
    'air_W_2m':         (-180.0, 1.35, 196.1),
    'ground_E_2m':      (-176.0, 0.1, 198.0),
    'wall_low':         (-166.2, 0.6, 200.0),
    'shoulder':         (-177.7, 1.35, 196.1),
}

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'])
        pg = await b.new_page(viewport={'width': 1280, 'height': 720})
        await pg.goto('http://localhost:8080/?shot=gunfight&seed=7', wait_until='load')
        await pg.wait_for_function('window.__shotReady === true', timeout=60000)
        res = await pg.evaluate(''' (cands) => {
          const g = window.__game;
          const cam = g.camera;
          const proj = (x,y,z) => {
            const v = new cam.position.constructor(x,y,z).project(cam);
            return [Math.round((v.x*0.5+0.5)*1280), Math.round((-v.y*0.5+0.5)*720)];
          };
          const muzzle = [-177.5, 1.51, 194.42];
          const mS = proj(...muzzle);
          // duellist torso centre + left/right edges (screen)
          const torsoC = proj(-178.09, 1.35, 196.15);
          const torsoL = proj(-177.66, 1.35, 196.15);
          const torsoR = proj(-178.52, 1.35, 196.15);
          const out = { muzzle: mS, torsoC, torsoL, torsoR, cands: {} };
          const distToSeg = (px,py, x1,y1,x2,y2) => {
            const dx=x2-x1, dy=y2-y1, L2=dx*dx+dy*dy;
            let t = L2 ? ((px-x1)*dx+(py-y1)*dy)/L2 : 0; t=Math.max(0,Math.min(1,t));
            return Math.round(Math.hypot(px-(x1+t*dx), py-(y1+t*dy)));
          };
          for (const [name, a] of Object.entries(cands)) {
            const aS = proj(...a);
            const len = Math.round(Math.hypot(aS[0]-mS[0], aS[1]-mS[1]));
            const dTorso = distToSeg(torsoC[0], torsoC[1], mS[0], mS[1], aS[0], aS[1]);
            const d3 = Math.round(Math.hypot(a[0]+178.09, a[2]-196.15)*100)/100;
            out.cands[name] = { aim: a, screen: aS, screenLen: len, distToTorsoPx: dTorso, dist3D: d3 };
          }
          return out;
        }''' , CANDIDATES)
        print(json.dumps(res, indent=1))
        await b.close()

asyncio.run(main())
