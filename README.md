[![make.fun](https://make.fun/badge/gta6-01.svg)](https://make.fun/c/gta6-01)
[![rank](https://make.fun/badge/gta6-01/WuYuanJie-211/gta6-01/rank.svg)](https://make.fun/c/gta6-01)
[![reward](https://make.fun/badge/gta6-01/WuYuanJie-211/gta6-01/reward.svg)](https://make.fun/c/gta6-01)

# Solara Bay — an original open-world crime game

A sunny coastal city, one wheelman, three jobs. **Solara Bay** is my entry for
[make.fun's gta6-01](https://make.fun/c/gta6-01) ("Make GTA 6"): a complete
open-world crime game that plays in a desktop browser from static files, with
no network request at all.

Everything is original: the city, the names, the story, the cars and the art.
No Rockstar names, characters, maps, art or music anywhere.

## The game

You are **Rook**, a driver for hire in Solara Bay. The story runs in three
missions:

1. **First Fare** — pick up Mara at the plaza and drive her to the Marina.
2. **Hot Wheels** — steal the red Comet GT and deliver it to the Chop Shop,
   with the police on you and chop-shop muscle waiting.
3. **The Lighthouse Run** — run a package to the Lighthouse with three wanted
   stars on you, then lose the tail. Finish it and the Bay is yours.

Between and after the jobs, the city is free roam: walk the streets, steal any
parked car, outrun the police, brawl with rivals, and watch the wanted stars
cool off when you lay low.

## Systems

- **Open city** — a 9×9 road grid with buildings, parks, palms, a beach, the
  sea, a marina and a striped lighthouse, all built in three.js.
- **On foot and by car** — walk, run, drive, and steal parked cars (E).
- **Traffic and pedestrians** — cars drive the grid, people stroll the
  sidewalks and scatter when a car comes at them.
- **Wanted level and police** — crimes earn stars; police cars chase and ram;
  laying low cools the heat off.
- **Missions and story** — three chained jobs with objectives, a 3D beacon,
  payouts and a story card for each.
- **Combat** — fist fights (F) with rival thugs who guard the chop shop.
- **HUD and minimap** — health, cash, wanted stars, speed, mission objective
  and a live top-down map of the city, the police and the mission marker.
- **Start and save** — title menu, pause menu, and save / load through
  localStorage.
- **Sound** — a synthesized engine hum, police siren and effects (WebAudio,
  no audio files).

## Controls

| Key | Action |
| --- | --- |
| WASD / arrows | Walk and drive |
| Shift | Run |
| Mouse drag | Look around (orbit camera) |
| Wheel | Zoom |
| E | Get in / steal a car, pick things up, get out |
| F | Punch |
| P / Esc | Pause and save |

## Play it

```sh
node serve.ts
# open http://localhost:8080
```

Screenshot scenes (deterministic, same seed gives the same frame):

```sh
# ?shot=chase | drive | walk | mission, with &seed=N
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
