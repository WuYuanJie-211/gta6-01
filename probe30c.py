import asyncio, json
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'])
        pg = await b.new_page(viewport={'width': 1280, 'height': 720})
        await pg.goto('http://localhost:8080/?shot=downtown&seed=7', wait_until='load')
        await pg.wait_for_function('window.__shotReady === true', timeout=60000)
        res = await pg.evaluate('''() => {
          const g = window.__game;
          const cam = g.camera;
          const proj = (x,y,z) => {
            const v = new cam.position.constructor(x,y,z).project(cam);
            return [Math.round((v.x*0.5+0.5)*1280), Math.round((-v.y*0.5+0.5)*720)];
          };
          const taxi = g.player.car;
          const out = { taxiPos: [taxi.pos.x, taxi.pos.z], taxiHeading: taxi.heading };
          // taxi nose: forward = (cos h, -sin h) for cars (see camB)
          const fx = Math.cos(taxi.heading), fz = -Math.sin(taxi.heading);
          const nose = [taxi.pos.x + fx*2.25, 0.5, taxi.pos.z + fz*2.25];
          out.nose = nose.map(v=>Math.round(v*100)/100);
          out.noseScreen = proj(...nose);
          out.taxiScreen = proj(taxi.pos.x, 1, taxi.pos.z);
          // candidate bar positions: lane line (255,-183), zebra (249,-180), zebra (240,-189)
          for (const [name, pt] of [['laneLine255', [255, 0.1, -183]], ['zebra249', [249, 0.1, -180]], ['zebra240', [240, 0.1, -189]], ['railZ180', [260, 0.45, -180]]]) {
            out[name] = proj(...pt);
          }
          // try taxi x values: move taxi west (decreasing x) and report nose screen + bar visibility
          out.trials = [];
          for (const tx of [266, 262, 258, 255, 252]) {
            const n = [tx + fx*2.25, 0.5, taxi.pos.z + fz*2.25];
            out.trials.push({ taxiX: tx, nose: n.map(v=>Math.round(v*100)/100), noseScreen: proj(...n) });
          }
          return out;
        }''')
        print(json.dumps(res, indent=1))
        await b.close()

asyncio.run(main())
