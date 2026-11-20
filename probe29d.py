import asyncio
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'])
        pg = await b.new_page(viewport={'width': 1280, 'height': 720})
        await pg.goto('http://localhost:8080/?shot=gunfight&seed=7', wait_until='load')
        await pg.wait_for_function('window.__shotReady === true', timeout=60000)
        info = await pg.evaluate('''() => {
          const g = window.__game;
          const out = { aim: g.aim ? [g.aim.x, g.aim.y, g.aim.z] : null, tracers: [], flashes: [], sparks: [] };
          g.scene.traverse(o => {
            if (!o.isMesh && !o.isSprite) return;
            const m = o.material;
            if (!m) return;
            const c = m.color ? m.color.getHex() : null;
            const pos = o.getWorldPosition(new (o.position.constructor)());
            const rec = { type: o.isSprite ? 'sprite' : 'mesh', color: c, opacity: m.opacity, pos: [Math.round(pos.x*100)/100, Math.round(pos.y*100)/100, Math.round(pos.z*100)/100], visible: o.visible };
            if (c === 0xff9500 || c === 0xffe14d) out.tracers.push(rec);
            if (o.isSprite) out.flashes.push(rec);
            if (c === 0xffcc00 || c === 0xffaa33) out.sparks.push(rec);
          });
          // project aim and muzzle to screen via camera
          const cam = g.camera;
          const v = new (g.aim.constructor)(g.aim.x, g.aim.y, g.aim.z).project(cam);
          out.aimScreen = [Math.round((v.x*0.5+0.5)*1280), Math.round((-v.y*0.5+0.5)*720)];
          return out;
        }''')
        print(info)
        await b.close()

asyncio.run(main())
