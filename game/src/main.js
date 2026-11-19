import * as THREE from 'three';
import { STEP, WORLD, PLAYER, WEAPONS } from './config.js';
import { createRandom } from './random.js';
import { buildRoads } from './roads.js';
import { buildCity, loadCityTextures } from './city.js';
import { createInput, ACTION_INTERACT, ACTION_PUNCH, ACTION_PAUSE, ACTION_CONFIRM, ACTION_SHOOT, ACTION_CYCLE, ACTION_RELOAD, ACTION_MUSIC, ACTION_HORN } from './input.js';
import { createPlayerMesh, updatePlayerOnFoot } from './player.js';
import { spawnCars, updateTraffic, updatePlayerCar, enterCar, exitCar, nearestStealableCar } from './vehicles.js';
import { spawnPedestrians, updatePedestrians } from './pedestrians.js';
import { createPolice } from './police.js';
import { createCombat } from './combat.js';
import { createMissions } from './missions.js';
import { createShops } from './shops.js';
import { createHud } from './hud.js';
import { saveGame, loadSave, hasSave } from './save.js';
import { createAudio } from './audio.js';
import { stageShot } from './shots.js';
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : 7;
class Game {
  constructor(textures = {}) {
    this.time = 0;
    this.rng = createRandom(seed);
    this.cash = WORLD.startCash;
    this.screen = 'title';
    this.cameraAngle = Math.PI;
    this.camDist = 9;
    this.camPitch = 0.32;
    this.lastDragAt = -10;
    this.ownedCars = [];
    this.canvas = document.getElementById('game');
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x8ec9ee);
    this.scene.fog = new THREE.Fog(0x8ec9ee, 260, 800);
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1500);
    const sun = new THREE.DirectionalLight(0xffd9a0, 2.6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -90;
    sun.shadow.camera.right = 90;
    sun.shadow.camera.top = 90;
    sun.shadow.camera.bottom = -90;
    sun.shadow.camera.far = 400;
    this.scene.add(sun);
    this.scene.add(new THREE.HemisphereLight(0xbfd9ff, 0x8a7a5a, 0.9));
    this.sun = sun;
    this.roads = buildRoads();
    this.city = buildCity(this.scene, this.rng, textures);
    this.input = createInput(this.canvas);
    this.audio = createAudio();
    this.hud = createHud(this);
    this.police = createPolice(this);
    this.combat = createCombat(this);
    this.missions = createMissions(this);
    this.shops = createShops(this);
    this.player = {
      mesh: createPlayerMesh(),
      pos: new THREE.Vector3(this.city.landmarks.plaza.x, 0, this.city.landmarks.plaza.z),
      heading: Math.PI,
      health: PLAYER.maxHealth,
      lastHitAt: -100,
      onFoot: true,
      car: null,
      punchTimer: 0,
      shootTimer: 0,
      reloadTimer: 0,
      weapon: 'fists',
      ownedWeapons: [],
      mag: 0,
      ammo: 0,
    };
    this.scene.add(this.player.mesh);
    this.player.mesh.position.copy(this.player.pos);
    this.cars = { parked: [], traffic: [], comet: null, armored: null };
    this.peds = [];
    spawnCars(this);
    spawnPedestrians(this, WORLD.pedestrians);
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.wireMenu();
  }
  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }
  wireMenu() {
    const on = (id, fn) => {
      const button = document.getElementById(id);
      if (button) button.addEventListener('click', () => {
        this.audio.unlock();
        fn();
      });
    };
    const continueButton = document.getElementById('btn-continue');
    if (continueButton && !hasSave()) continueButton.classList.add('hidden');
    on('btn-start', () => this.startGame(null));
    on('btn-continue', () => this.startGame(loadSave()));
    on('btn-resume', () => this.setScreen('playing'));
    on('btn-save', () => {
      this.hud.flash(saveGame(this) ? 'Progress saved.' : 'Could not save here.');
    });
    on('btn-load', () => {
      const data = loadSave();
      if (data) {
        this.startGame(data);
        this.hud.flash('Save loaded.');
      } else this.hud.flash('No save found.');
    });
    on('btn-restart', () => window.location.reload());
    on('btn-quit', () => window.location.reload());
    on('btn-retry', () => window.location.reload());
    on('btn-menu-title', () => window.location.reload());
  }
  startGame(save) {
    if (save) {
      this.cash = save.cash;
      this.player.health = save.health;
      this.player.pos.set(save.playerX, 0, save.playerZ);
      this.player.heading = save.playerHeading;
      this.missions.setProgress(save.missionIndex, save.missionStage);
      this.player.weapon = save.weapon || 'fists';
      this.player.ownedWeapons = save.ownedWeapons || [];
      if ((save.weapon === 'pistol' || save.weapon === 'rifle') && !this.player.ownedWeapons.includes(save.weapon)) {
        this.player.ownedWeapons.push(save.weapon);
      }
      this.player.ammo = save.ammo || 0;
      this.player.mag = save.mag || 0;
      this.ownedCars = save.ownedCars || [];
      if (typeof save.bestRaceTime === 'number') this.missions.state.bestRaceTime = save.bestRaceTime;
      if (Array.isArray(save.collected)) {
        this.missions.state.collected = save.collected;
        this.city.collectibleMeshes.forEach((gem, i) => {
          gem.visible = !save.collected[i];
        });
      }
      this.player.mesh.position.copy(this.player.pos);
    }
    this.setScreen('playing');
    this.hud.flash('Welcome to Solara Bay. Mara is waiting at the plaza.');
  }
  setScreen(screen) {
    this.screen = screen;
    this.hud.showMenu(screen === 'title');
    this.hud.showPause(screen === 'paused');
    this.hud.showOver(screen === 'over', 'WASTED — Rook is down. The Bay will wait.');
    if (screen === 'playing') this.audio.unlock();
  }
  interact() {
    if (this.missions.interact()) return;
    if (this.shops.interact()) return;
    if (this.player.onFoot) {
      const car = nearestStealableCar(this);
      if (car) {
        if (car.wrecked || car.health <= 0) {
          this.hud.flash('This car is a wreck — it will not move.');
          return;
        }
        if (car === this.cars.comet && !car.stolen) {
          car.stolen = true;
          this.police.commitCrime(1);
          this.hud.flash('You stole the Comet GT! The cops are coming.');
        }
        if (car.forSale) {
          this.hud.flash(`For sale — $${car.salePrice}. Press E at the dealer counter to buy it.`);
          return;
        }
        enterCar(this, car);
      }
    } else {
      exitCar(this);
    }
  }
  cycleWeapon() {
    const owned = this.player.ownedWeapons;
    if (!owned.length) {
      this.hud.flash('No guns yet — the gun shop is downtown.');
      return;
    }
    const order = ['fists', ...owned];
    const idx = order.indexOf(this.player.weapon);
    this.player.weapon = order[(idx + 1) % order.length];
    const name = this.player.weapon === 'fists' ? 'Fists' : WEAPONS[this.player.weapon].name;
    this.hud.flash(`Weapon: ${name}.`);
  }
  refreshPrompt() {
    if (this.screen !== 'playing') {
      this.hud.setPrompt('');
      return;
    }
    if (!this.player.onFoot) {
      const shop = this.shops.nearShop();
      if (shop && shop.key === 'garage') {
        this.hud.setPrompt('E — repair the car ($60) · WASD — drive · mouse — look around');
        return;
      }
      if (shop && shop.key === 'chopShop') {
        this.hud.setPrompt('E — sell this car · WASD — drive · mouse — look around');
        return;
      }
      const marker = this.missions.state.marker;
      if (this.missions.stageKey() === 'fare' && marker && this.player.car.model === 'taxi') {
        const d = Math.hypot(marker.x - this.player.car.pos.x, marker.z - this.player.car.pos.z);
        if (d < 6) {
          this.hud.setPrompt('E — pick up the fare');
          return;
        }
      }
      this.hud.setPrompt('E — get out of the car · WASD — drive · mouse — look around');
      return;
    }
    const target = this.missions.state.marker;
    const key = this.missions.stageKey();
    if (target && (key === 'pickup' || key === 'steal' || key === 'collect')) {
      const d = Math.hypot(target.x - this.player.pos.x, target.z - this.player.pos.z);
      if (d < 6) {
        if (key === 'steal') {
          this.hud.setPrompt(this.missions.state.index === 6 ? 'E — steal the armored van' : 'E — steal the Comet GT');
        } else if (key === 'collect') {
          this.hud.setPrompt('E — grab the package');
        } else {
          this.hud.setPrompt('E — pick it up');
        }
        return;
      }
    }
    const shop = this.shops.nearShop();
    if (shop) {
      const hints = {
        dealer: 'E — buy a car',
        gunShop: 'E — buy a gun / ammo',
        garage: 'E — repair (drive a car in)',
        diner: 'E — eat ($25, +50 health)',
        chopShop: 'E — sell a stolen car (drive one in)',
      };
      this.hud.setPrompt(hints[shop.key] || 'E — shop');
      return;
    }
    const car = nearestStealableCar(this);
    if (car) {
      this.hud.setPrompt(car === this.cars.comet ? 'E — steal the Comet GT' : car.forSale ? `E — get in the car (for sale $${car.salePrice})` : 'E — get in the car');
      return;
    }
    this.hud.setPrompt('WASD — walk · Shift — run · E — interact · F — punch · click — shoot · Q — weapon · P — pause');
  }
  step(dt) {
    this.time += dt;
    const playing = this.screen === 'playing';
    updateTraffic(this, dt);
    updatePedestrians(this, dt);
    this.city.sea.position.y = 0.02 + Math.sin(this.time * 0.5) * 0.12;
    for (const boat of this.city.boats) {
      boat.position.y = 0.9 + Math.sin(this.time * 0.8 + boat.position.x) * 0.15;
    }
    for (const cloud of this.city.clouds) {
      cloud.position.x += dt * 1.2;
      if (cloud.position.x > 420) cloud.position.x = -420;
    }
    if (!playing) return;
    const actions = this.input.takeActions();
    if (actions & ACTION_PAUSE) {
      this.setScreen('paused');
      return;
    }
    if (actions & ACTION_INTERACT) this.interact();
    if (actions & ACTION_PUNCH) this.combat.playerPunch();
    if (actions & ACTION_SHOOT) this.combat.playerShoot();
    if (actions & ACTION_CYCLE) this.cycleWeapon();
    if (actions & ACTION_RELOAD) this.combat.reloadWeapon();
    if (actions & ACTION_MUSIC) {
      const on = this.audio.toggleMusic();
      this.hud.flash(on ? 'Music on.' : 'Music off.');
    }
    if (actions & ACTION_HORN && !this.player.onFoot) this.audio.honk();
    if (this.player.onFoot) updatePlayerOnFoot(this, dt);
    else updatePlayerCar(this, dt);
    this.police.update(dt);
    this.combat.update(dt);
    this.missions.update(dt);
    if (this.player.health < PLAYER.maxHealth && this.time - this.player.lastHitAt > 5) {
      this.player.health = Math.min(PLAYER.maxHealth, this.player.health + 1.5 * dt);
    }
    if (this.player.health <= 0) {
      this.setScreen('over');
      return;
    }
    this.refreshPrompt();
    this.hud.update();
  }
  updateCamera(dt) {
    const drag = this.input.takeDrag();
    if (drag.dx !== 0 || drag.dy !== 0) {
      this.cameraAngle -= drag.dx * 0.005;
      this.camPitch = Math.max(0.12, Math.min(0.9, this.camPitch + drag.dy * 0.003));
      this.lastDragAt = this.time;
    }
    const wheel = this.input.takeWheel();
    if (wheel !== 0) this.camDist = Math.max(5, Math.min(16, this.camDist + wheel * 0.005));
    const target = this.player.car ? this.player.car.pos : this.player.pos;
    let fx;
    let fz;
    if (this.player.car) {
      fx = Math.cos(this.player.car.heading);
      fz = -Math.sin(this.player.car.heading);
    } else {
      fx = Math.sin(this.player.heading);
      fz = Math.cos(this.player.heading);
    }
    if (this.time - this.lastDragAt > 2.5) {
      const wanted = Math.atan2(-fx, -fz);
      let diff = wanted - this.cameraAngle;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this.cameraAngle += diff * Math.min(1, 1.6 * dt);
    }
    const dist = this.player.car ? this.camDist + 3 : this.camDist;
    const horiz = dist * Math.cos(this.camPitch);
    const height = dist * Math.sin(this.camPitch) + 1.6;
    const shake = this.hud.takeShake(dt);
    this.camera.position.set(
      target.x + Math.sin(this.cameraAngle) * horiz + shake,
      height,
      target.z + Math.cos(this.cameraAngle) * horiz + shake,
    );
    this.camera.lookAt(target.x, 1.6, target.z);
    this.sun.position.set(target.x + 120, 100, target.z + 40);
    this.sun.target.position.set(target.x, 0, target.z);
    this.sun.target.updateMatrixWorld();
  }
  render() {
    this.renderer.render(this.scene, this.camera);
  }
}
const textures = await loadCityTextures();
const game = new Game(textures);
window.__game = game;
function runShot(name) {
  stageShot(name, game);
  game.setScreen('playing');
  game.hud.showMenu(false);
  let painted = 0;
  function paint() {
    game.updateCamera(1 / 60);
    game.render();
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}
function runGame() {
  let accumulator = 0;
  let last = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, 0.25);
    last = now;
    while (accumulator >= STEP) {
      game.step(STEP);
      accumulator -= STEP;
    }
    game.updateCamera(1 / 60);
    game.render();
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && game.screen === 'playing') game.setScreen('paused');
  });
  requestAnimationFrame(frame);
}
if (shot) runShot(shot);
else runGame();
