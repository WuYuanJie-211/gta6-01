import { WEAPONS, ECONOMY, CAR_MODELS } from './config.js';
import { enterCar } from './vehicles.js';
export function createShops(game) {
  const SHOPS = [
    { key: 'dealer', name: 'Auto Dealer' },
    { key: 'gunShop', name: 'Gun Shop' },
    { key: 'garage', name: 'Garage' },
    { key: 'diner', name: 'Diner' },
    { key: 'chopShop', name: 'Chop Shop' },
  ];
  function nearShop() {
    const p = game.player.car ? game.player.car.pos : game.player.pos;
    for (const shop of SHOPS) {
      const spot = game.city.landmarks[shop.key];
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
      game.hud.flash('For sale: Comet $2500, Muscle $1800, Van $1100. Press E.');
      return true;
    }
    if (game.cash < car.salePrice) {
      game.hud.flash(`Not enough cash for the ${CAR_MODELS[car.model].name} ($${car.salePrice}).`);
      return true;
    }
    game.cash -= car.salePrice;
    car.forSale = false;
    game.ownedCars.push(car.model);
    enterCar(game, car);
    game.hud.flash(`Bought the ${CAR_MODELS[car.model].name} for $${car.salePrice}!`);
    game.audio.payout();
    return true;
  }
  function buyGun() {
    const player = game.player;
    if (!player.ownedWeapons.includes('pistol')) {
      if (game.cash < WEAPONS.pistol.price) {
        game.hud.flash(`Pistol is $${WEAPONS.pistol.price} — need more cash.`);
        return true;
      }
      game.cash -= WEAPONS.pistol.price;
      player.ownedWeapons.push('pistol');
      player.weapon = 'pistol';
      player.mag = WEAPONS.pistol.mag;
      player.ammo = 12;
      game.hud.flash('Pistol bought! Q switches, R reloads, click to shoot.');
      game.audio.pickup();
      return true;
    }
    if (!player.ownedWeapons.includes('rifle')) {
      if (game.cash < WEAPONS.rifle.price) {
        game.hud.flash(`Rifle is $${WEAPONS.rifle.price} — need more cash.`);
        return true;
      }
      game.cash -= WEAPONS.rifle.price;
      player.ownedWeapons.push('rifle');
      player.weapon = 'rifle';
      player.mag = WEAPONS.rifle.mag;
      player.ammo = 30;
      game.hud.flash('Rifle bought! Q switches, R reloads, click to shoot.');
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
      game.hud.flash('Drive in to repair — $60 for a full fix.');
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
      game.hud.flash('Bring a stolen car here — the chop shop pays.');
      return true;
    }
    if (car.kind === 'comet' || car.kind === 'armored') {
      game.hud.flash('Spoken for — the boss wants it whole.');
      return true;
    }
    if (!car.stolen) {
      game.hud.flash('Chop shop buys hot cars only.');
      return true;
    }
    let pay = game.rng.int(ECONOMY.chopSellMin, ECONOMY.chopSellMax);
    const condition = Math.max(0, Math.min(100, car.health || 0)) / 100;
    pay = Math.floor(pay * (car.wrecked || car.health <= 0 ? 0.5 : 0.5 + 0.5 * condition));
    game.cash += pay;
    game.scene.remove(car.mesh);
    game.player.car = null;
    game.player.onFoot = true;
    game.player.pos.set(car.pos.x + 3, 0, car.pos.z + 3);
    game.player.mesh.visible = true;
    game.player.mesh.position.copy(game.player.pos);
    game.hud.flash(car.wrecked || car.health <= 0 ? `Sold as a wreck for $${pay}.` : `Sold for $${pay}.`);
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
