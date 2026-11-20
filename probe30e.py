import asyncio, json
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'])
        pg = await b.new_page(viewport={'width': 640, 'height': 480})
        errors = []
        pg.on('pageerror', lambda e: errors.append(str(e)))
        pg.on('console', lambda m: errors.append('CONSOLE-ERROR: ' + m.text) if m.type == 'error' else None)
        await pg.goto('http://localhost:8080/', wait_until='load')
        await pg.wait_for_function('window.__game !== undefined', timeout=30000)
        await pg.wait_for_timeout(2000)
        res = await pg.evaluate('''() => {
          const g = window.__game;
          const out = {
            mission: g.missions ? g.missions.current : null,
            missionName: g.missions && g.missions.current ? g.missions.current.name : null,
            playerPos: [Math.round(g.player.pos.x*10)/10, Math.round(g.player.pos.z*10)/10],
            cash: g.cash,
            health: g.player.health,
            enemies: g.combat.enemies.length,
            hasShot: typeof g.combat.playerShoot === 'function',
          };
          // fire one shot to exercise combat.js (tracer + flash paths)
          try {
            g.input.fireAction(g.ACTION_SHOOT || 0);
            g.step(1/60);
            out.shotFired = true;
            out.afterShot = { cash: g.cash, enemiesAlive: g.combat.enemies.filter(e=>e.alive).length };
          } catch (e) { out.shotError = String(e); }
          return out;
        }''')
        print(json.dumps(res, indent=1))
        print('PAGE ERRORS:', errors if errors else 'none')
        await b.close()

asyncio.run(main())
