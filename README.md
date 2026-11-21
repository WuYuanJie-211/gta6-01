[![make.fun](https://make.fun/badge/gta6-01.svg)](https://make.fun/c/gta6-01)
[![rank](https://make.fun/badge/gta6-01/WuYuanJie-211/gta6-01/rank.svg)](https://make.fun/c/gta6-01)
[![reward](https://make.fun/badge/gta6-01/WuYuanJie-211/gta6-01/reward.svg)](https://make.fun/c/gta6-01)

# Solara Bay — an original open-world crime game

A sunset coastal city, one wheelman, seven jobs. **Solara Bay** is my entry
for [make.fun's gta6-01](https://make.fun/c/gta6-01) ("Make GTA 6"): a
complete open-world crime game that plays in a desktop browser from static
files, with no network request at all.

Everything is original: the city, the names, the story, the cars and the art.
No Rockstar names, characters, maps, art or music anywhere.

## The game

You are **Rook**, a driver for hire in Solara Bay. The story runs in seven
missions:

1. **First Fare** — pick up Mara at the plaza and drive her to the Marina.
2. **Hot Wheels** — steal the red Comet GT and deliver it to the Chop Shop,
   with the police on you and chop-shop muscle waiting.
3. **The Lighthouse Run** — run a package to the Lighthouse with three wanted
   stars on you, then lose the tail.
4. **Downtown Taxi** — grab a taxi and run three fares from the bus stops
   across town; every fare pays.
5. **Package Hunt** — five green packages are hidden across the districts;
   find them all.
6. **Bay Street Grand Prix** — four checkpoints, one lap, three minutes on
   the clock.
7. **The Bank Job** — steal the armored van by the Bank, deliver it to the
   Chop Shop with four stars on you, and lose the tail. Finish it and the
   Bay is yours.

Between and after the jobs, the city is free roam: walk the streets, steal any
parked car, buy a car at the dealer, buy a gun at the gun shop, sell a hot car
at the chop shop, get a meal at the diner, outrun the police and the
helicopter, and watch the wanted stars cool off when you lay low.

## Systems

- **Open city** — a 13×11 road grid across four districts: glass downtown
  towers, the container port with cranes, low suburbs with gardens, and the
  old town, beach, sea, marina and striped lighthouse, all built in three.js.
  The facades and ground wear real textures (glass curtain wall, brick,
  stucco, asphalt, sidewalk, grass, sand, container steel), generated on a
  GPU with SDXL and shipped as local files under `game/textures/` — no
  network, and a flat-colour fallback if a file is ever missing.
- **Grounded roads** — the road sits in a channel below the sidewalk, edged
  by real 0.15 m curbs, with the lane markings baked into the asphalt
  texture at full resolution: double yellow lines, lane dashes and edge
  lines stay hard-edged and sharp instead of blurring to mush, and every
  grounded object sits on a soft blob shadow.
- **On foot and by car** — walk, run, drive, and steal parked cars (E). Ten
  car models with their own shapes, speeds and prices — sedan, compact, taxi,
  van, pickup, truck, bus, muscle, the Comet GT sports car, and the armored
  van — plus damage and repair. Cars have hub-capped wheels, grilles,
  bumpers, mirrors and roofs; a car at 0 bodywork is a wreck — it stops and
  throws you out, and the garage is the only way back.
- **Traffic and pedestrians** — 20 cars drive the grid (easing off at
  intersections); 36 people stroll the sidewalks, wait at bus stops, chat in
  groups, stop to check their phones, and scatter when a car comes at them.
  People have arms that swing, hair, necks, hats and bags; thugs and gunmen
  too.
- **Wanted level and police** — crimes earn stars; police cars chase, ram and
  cut you off from ahead; at 3 stars a roadblock goes up in front of you; at
  4 stars a police helicopter joins and the heat never cools off while it is
  overhead; laying low cools the heat off.
- **Missions and story** — seven chained jobs with objectives, a 3D beacon,
  payouts and a story card for each, plus a mission list in the HUD.
- **Combat** — fist fights (F) with rival thugs, and guns: buy a pistol or a
  rifle at the gun shop, shoot (click / G), reload (R), switch weapons (Q).
  Armed guards shoot back.
- **Economy** — money has uses: buy cars and guns and ammo, repair at the
  garage, eat at the diner; money has sources: missions, taxi fares, hidden
  packages, selling hot cars, and dropping thugs.
- **HUD and minimap** — health bar, cash, wanted stars, speed, weapon and
  ammo, car bodywork, the district you are in, the race clock, the mission
  list and objective, and a live top-down map with district names, shops,
  collectibles, checkpoints, the helicopter, the police and the mission
  marker.
- **Start and save** — title menu, pause menu, and save / load through
  localStorage (cash, health, mission progress, weapons, cars bought,
  packages found).
- **Sound** — a synthesized engine hum, a two-tone police siren (a second
  siren joins at 4 stars), a looping music track (M toggles it), and effects
  for gunshots, crashes, pickups, payouts and reloads (WebAudio, no audio
  files).

## The look

The city is dressed, not just built: one 1024-pixel facade atlas gives every
tower a window grid, sill, lit panes, parapet, rooftop AC boxes and water
tanks; twelve big signs (HOTEL, CAFE, BODEGA, MARINE, GARAGE, SUITES, PALACE,
CANTINA, FARMACIA, PENSION, MERCADO, TALLER) give the buildings names; the
roads carry double yellow lines, lane dashes, zebras and stop lines; palms,
streetlights, hydrants, benches, umbrellas and bins fill the sidewalks. The
sky is a dithered sunset gradient with a soft sun, sea and far skyline, and
every grounded object sits on a soft blob shadow. The renderer uses ACES
filmic tone mapping with sRGB output, so the sunset reads warm instead of
blown-out white.

## Controls

| Key | Action |
| --- | --- |
| WASD / arrows | Walk and drive |
| Shift | Run |
| Mouse drag | Look around (orbit camera) |
| Wheel | Zoom |
| E | Get in / steal a car, pick things up, shop, get out |
| F | Punch |
| Click / G | Shoot (when armed) |
| Q | Switch weapon |
| R | Reload |
| H | Horn (in a car) |
| M | Music on/off |
| P / Esc | Pause and save |

## Play it

```sh
node serve.ts
# open http://localhost:8080
```

Screenshot scenes (deterministic, same seed gives the same frame):

```sh
# ?shot=chase | gunfight | downtown | sunset, with &seed=N
http://localhost:8080/?shot=chase&seed=7
```

## Build

`main.ts` (Node 22, standard library only) copies `game/` and `screenshots/`
to the output directory and writes `dossier.json` with the vendored
`vendor/makefun-game.ts`. Run it twice and the output is byte-identical.

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

three.js r160 is vendored as `game/vendor/three.module.min.js` (MIT).

## v5 — fresh rewrite

The whole game rewritten from scratch in one session: same city, same seven
missions, same four screenshot scenes, rebuilt line by line. The v5 fixes
are the road and the framing: lane markings baked into the asphalt with
hard edges, real curbs, the road sunk in a channel below the sidewalk,
full anisotropy so the markings stay sharp; the sunset helicopter fully in
frame; flames in frame on the burning car; a visible shadow under every
grounded vehicle; the gunman shadow darkening the yellow stripe so it
cannot be missed; the HUD back to dark rounded panels with a health bar;
and a static, subtle wanted border instead of a pulsing one.
