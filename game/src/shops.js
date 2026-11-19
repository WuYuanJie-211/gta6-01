import { WEAPONS, ECONOMY, CAR_MODELS } from './config.js';
import { enterCar } from './vehicles.js';
export function createShops(game) {
  const SHOPS = [
    { key: 'dealer', name: 'Auto Dealer', at: 'dealer' },
    { key: 'gunShop', name: 'Gun Shop', at: 'gunShop' },
    { key: 'garage', name: 'Garage', at: 'garage' },
    { key: 'diner', name: 'Diner', at: 'diner' },
    { key: 'chopShop', name: 'Chop Shop', at: 'chopShop' },
  ];
  function nearShop() {
    const p = game.player.car ? game.player.car.pos : game.player.pos;
    for (const shop of SHOPS) {
      const spot = game.city.landmarks[shop.at];
      if (Math.hypot(spot.x - p.x, spot.z - p.z) < 6) return shop;
    }
    return null;
  }
  function nearestSaleCar() {
    const p = game.player.pos;
    let best = null;
    let bestD = 6;
    for (const car of game.cars.parked) {
      if (!car.forSale) continue;
      const d = Math.hypot(car.pos.x - p.x, car.pos.z - p.z);
      if (d < bestD) {
        bestD = d;
        best = car;
      }
    }
    return best;
  }
  function buyCar() {
    const car = nearestSaleCar();
    if (!car) {
      game.hud.flash('Cars for sale: Comet GT $2500, Muscle $1800, Van $1100. Stand by one and press E.');
      return true;
    }
    if (game.cash < car.salePrice) {
      game.hud.flash(`Not enough cash — the ${CAR_MODELS[car.model].name} is $${car.salePrice}.`);
      return true;
    }
    game.cash -= car.salePrice;
    car.forSale = false;
    game.ownedCars.push(car.model);
    enterCar(game, car);
    game.hud.flash(`You bought the ${CAR_MODELS[car.model].name} for $${car.salePrice}. Drive it home!`);
    game.audio.payout();
    return true;
  }
  function buyGun() {
    const player = game.player;
    if (!player.ownedWeapons.includes('pistol')) {
      if (game.cash < WEAPONS.pistol.price) {
        game.hud.flash(`The Pistol is $${WEAPONS.pistol.price}. Come back with more cash.`);
        return true;
      }
      game.cash -= WEAPONS.pistol.price;
      player.ownedWeapons.push('pistol');
      player.weapon = 'pistol';
      player.mag = WEAPONS.pistol.mag;
      player.ammo = 12;
      game.hud.flash('Pistol bought! Q switches weapons, R reloads, click to shoot.');
      game.audio.pickup();
      return true;
    }
    if (!player.ownedWeapons.includes('rifle')) {
      if (game.cash < WEAPONS.rifle.price) {
        game.hud.flash(`The Rifle is $${WEAPONS.rifle.price}. Come back with more cash.`);
        return true;
      }
      game.cash -= WEAPONS.rifle.price;
      player.ownedWeapons.push('rifle');
      player.weapon = 'rifle';
      player.mag = WEAPONS.rifle.mag;
      player.ammo = 30;
      game.hud.flash('Rifle bought! Q switches weapons, R reloads, click to shoot.');
      game.audio.pickup();
      return true;
    }
    const weapon = WEAPONS[player.weapon] || WEAPONS.pistol;
    if (game.cash < weapon.ammoPrice) {
      game.hud.flash(`Ammo is $${weapon.ammoPrice}. Come back with more cash.`);
      return true;
    }
    game.cash -= weapon.ammoPrice;
    player.ammo += weapon.ammoPerBuy;
    game.hud.flash(`Bought ${weapon.ammoPerBuy} rounds for the ${weapon.name}.`);
    game.audio.pickup();
    return true;
  }
  function repair() {
    const car = game.player.car;
    if (!car) {
      game.hud.flash('Drive a car in to repair it — $60 for a full fix.');
      return true;
    }
    if (car.health >= 100) {
      game.hud.flash('Already in perfect shape.');
      return true;
    }
    if (game.cash < ECONOMY.garageRepair) {
      game.hud.flash(`A repair is $${ECONOMY.garageRepair}. Come back with more cash.`);
      return true;
    }
    game.cash -= ECONOMY.garageRepair;
    car.health = 100;
    car.wrecked = false;
    game.hud.flash('Repaired to 100%.');
    game.audio.pickup();
    return true;
  }
  function heal() {
    if (game.player.health >= 100) {
      game.hud.flash('You feel fine already.');
      return true;
    }
    if (game.cash < ECONOMY.dinerHeal) {
      game.hud.flash(`A meal is $${ECONOMY.dinerHeal}. Come back with more cash.`);
      return true;
    }
    game.cash -= ECONOMY.dinerHeal;
    game.player.health = Math.min(100, game.player.health + ECONOMY.dinerHealAmount);
    game.hud.flash(`A good meal. +${ECONOMY.dinerHealAmount} health.`);
    game.audio.pickup();
    return true;
  }
  function sellCar() {
    const car = game.player.car;
    if (!car) {
      game.hud.flash('Bring a stolen car here and the chop shop will pay for it.');
      return true;
    }
    if (car.kind === 'comet' || car.kind === 'armored') {
      game.hud.flash('This one is spoken for — the boss wants it whole.');
      return true;
    }
    if (!car.stolen) {
      game.hud.flash('The chop shop only buys hot cars.');
      return true;
    }
    let pay = game.rng.int(ECONOMY.chopSellMin, ECONOMY.chopSellMax);
    if (car.wrecked || car.health <= 0) pay = Math.floor(pay / 2);
    game.cash += pay;
    game.scene.remove(car.mesh);
    game.player.car = null;
    game.player.onFoot = true;
    game.player.pos.set(car.pos.x + 3, 0, car.pos.z + 3);
    game.player.mesh.visible = true;
    game.player.mesh.position.copy(game.player.pos);
    game.hud.flash(car.wrecked || car.health <= 0 ? `Sold as a wreck for $${pay} — half price.` : `Sold for $${pay}. The chop shop never saw you.`);
    game.audio.payout();
    return true;
  }
  function interact() {
    const shop = nearShop();
    if (!shop) return false;
    if (shop.key === 'dealer') return buyCar();
    if (shop.key === 'gunShop') return buyGun();
    if (shop.key === 'garage') return repair();
    if (shop.key === 'diner') return heal();
    if (shop.key === 'chopShop') return sellCar();
    return false;
  }
  return { nearShop, interact };
}
