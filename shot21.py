import sys, asyncio
from playwright.async_api import async_playwright

async def main():
    shots = sys.argv[1].split(',') if len(sys.argv) > 1 else ['gunfight']
    outdir = sys.argv[2] if len(sys.argv) > 2 else '/tmp/shots21'
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'])
        pg = await b.new_page(viewport={'width': 1280, 'height': 720})
        for s in shots:
            await pg.goto(f'http://localhost:8080/?shot={s}&seed=7', wait_until='load')
            try:
                await pg.wait_for_function('window.__shotReady === true', timeout=60000)
            except Exception as e:
                print(s, 'NOT READY', e)
                continue
            await pg.wait_for_timeout(300)
            await pg.screenshot(path=f'{outdir}/{s}.jpg', type='jpeg', quality=80)
            print(s, 'ok')
        await b.close()

asyncio.run(main())
