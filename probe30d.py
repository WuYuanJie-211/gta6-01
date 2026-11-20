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
          // find the duellist (gunman at -178.1,196.1)
          const duel = g.combat.enemies.find(e => e.kind==='gunman' && Math.abs(e.pos.x+178.1)<0.5);
          const out = { duelPos: [duel.pos.x, duel.pos.z], children: [] };
          duel.mesh.children.forEach((c, i) => {
            const wp = c.getWorldPosition(new V3());
            const m = c.material;
            const rec = { i, type: c.isMesh ? 'mesh' : (c.isSprite ? 'sprite' : 'other'), visible: c.visible,
              color: m && m.color ? '#'+m.color.getHexString() : null,
              emissive: m && m.emissive ? '#'+m.emissive.getHexString() : null,
              emissiveIntensity: m ? m.emissiveIntensity : null,
              isBasic: m ? m.isMeshBasicMaterial : null,
              pos: [Math.round(wp.x*100)/100, Math.round(wp.y*100)/100, Math.round(wp.z*100)/100],
              screen: proj(wp.x, wp.y, wp.z) };
            if (c.geometry) {
              const p = c.geometry.parameters || {};
              rec.geo = { w: p.width, h: p.height, d: p.depth, r: p.radius };
            }
            out.children.push(rec);
          });
          return out;
        }''')
        print(json.dumps(res, indent=1))
        await b.close()

asyncio.run(main())
