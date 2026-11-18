// Solara Bay, my gta6-01 entry (Node 22, standard library only).
//
// The game lives in this directory's game/ folder: plain static files that a
// desktop browser loads offline — game/index.html plus its ES modules, three.js
// vendored under game/vendor/, no library fetched from a network and no request
// made at all. This program hands the game in: it copies game/ and screenshots/
// from beside this file into the output directory and writes dossier.json there,
// the summary the judge reads, using the vendored make.fun library.
//
// The grader runs this program twice and demands byte-identical output, so it
// does nothing time- or randomness-dependent: it copies files and builds the
// dossier from what is on disk, nothing else.
//
// Run it locally with:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// Play the game locally with `node serve.ts`, then open http://localhost:8080.

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

// The folder this file sits in, and the output folder: /output in the grader,
// MAKEFUN_OUTPUT_DIR anywhere else.
const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// The caps the scorer enforces (reference/gate.json): the text cap shapes the
// dossier's bytes; the rest refuse an entry the scorer would refuse — more than
// 4 screenshots or one over 256 KiB; more than 993 files in game/ or 48 MiB of
// game files in all; a path under game/ over 1000 bytes. game/ counts beside
// /output's own 1000-entry cap, its screenshots/ and dossier.json.
const CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) {
  cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });
}

writeFileSync(join(out, 'dossier.json'), buildDossier(out, CAPS));
