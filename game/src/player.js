import{BX,CG,MS,SG,ME,GP,PI}from'./geo.js';
import { PLAYER } from './config.js';
import { resolveBuildingCollision } from './city.js';
const B=(g,w,h,d,m,x=0,y=0,z=0)=>{const q=new ME(new BX(w,h,d),m);q.position.set(x,y,z);g.add(q);return q;};
const mt=(c,r=0.9)=>new MS({color:c,roughness:r});
export function createPlayerMesh() {
  const group = new GP();
  const jacket = mt(0x2e4053, 0.8);
  const skin = mt(0xe0ac69, 0.8);
  const jeans = mt(0x2c3e50);
  const torso = B(group, 0.7, 0.9, 0.4, jacket, 0, 1.15, 0);
  torso.castShadow = true;
  const head = new ME(new SG(0.26, 14, 12), skin);
  head.position.y = 1.85;head.scale.y=.8;
  head.castShadow = true;
  group.add(head);
  const hair = new ME(new SG(0.27, 12, 8, 0, PI * 2, 0, PI / 2), mt(0x1a1a1a, 1));
  hair.position.y = 1.9;
  group.add(hair);
  const neck = new ME(new CG(0.09, 0.11, 0.18, 8), skin);
  neck.position.y = 1.68;
  group.add(neck);
  const legL = B(group, 0.26, 0.7, 0.3, jeans, -0.18, 0.35, 0);
  const legR = B(group, 0.26, 0.7, 0.3, jeans, 0.18, 0.35, 0);
  const shoeMat = mt(0x1a1a1a);
  const shoeL = B(group, 0.26, 0.12, 0.42, shoeMat, -0.18, 0.06, 0.06);
  const shoeR = shoeL.clone();
  shoeR.position.x = 0.18;
  group.add(shoeR);
  const armL = B(group, 0.2, 0.7, 0.22, jacket, -0.48, 1.2, 0);
  const armR = B(group, 0.2, 0.7, 0.22, jacket, 0.48, 1.2, 0);
  // v31 defect (b): the old gunMat (metalness 0.5) threw a bright specular
  // highlight that read as a WHITE gun stock in shot 2. Matte it down,
  // and give the stock/grip a dead-matte dark wood finish.
  const gunMat = new MS({ color: 0x1a1a1a, roughness: 0.6, metalness: 0.15 });
  const stockMat = new MS({ color: 0x1a1210, roughness: 1, metalness: 0 });
  const pistol = new GP();
  B(pistol, 0.08, 0.14, 0.4, gunMat, 0, 0, 0);
  B(pistol, 0.08, 0.18, 0.1, gunMat, 0, -0.12, -0.1);
  B(pistol, 0.06, 0.08, 0.28, gunMat, 0, 0.03, 0.32);
  B(pistol, 0.03, 0.06, 0.06, gunMat, 0, 0.1, 0.15);
  pistol.position.set(0.48, 0.9, 0.35);
  pistol.visible = false;
  const rifle = new GP();
  B(rifle, 0.09, 0.14, 0.9, gunMat, 0, 0, 0);
  B(rifle, 0.08, 0.16, 0.3, stockMat, 0, -0.05, -0.45);
  B(rifle, 0.07, 0.2, 0.12, stockMat, 0, -0.14, 0.05);
  const rifleBarrel = new ME(new CG(0.03, 0.03, 0.5, 8), gunMat);
  rifleBarrel.rotation.x = PI / 2;
  rifleBarrel.position.set(0, 0.02, 0.68);
  rifle.add(rifleBarrel);
  B(rifle, 0.04, 0.1, 0.12, gunMat, 0, 0.12, 0.3);
  rifle.position.set(0.48, 0.9, 0.4);
  rifle.visible = false;
  group.add(pistol, rifle);
  group.userData.legL = legL;
  group.userData.legR = legR;
  group.userData.armL = armL;
  group.userData.armR = armR;
  group.userData.pistol = pistol;
  group.userData.rifle = rifle;
  return group;
}
export function updatePlayerOnFoot(game, dt) {
  const player = game.player;
  const input = game.input;
  const drive = input.drive();
  const steer = input.steer();
  const speed = input.run() ? PLAYER.runSpeed : PLAYER.walkSpeed;
  const camAngle = game.cameraAngle;
  const moveAngle = camAngle + PI - Math.atan2(steer, drive);
  const moving = drive !== 0 || steer !== 0;
  if (moving) {
    const step = speed * dt;
    player.pos.x += Math.sin(moveAngle) * step;
    player.pos.z += Math.cos(moveAngle) * step;
    resolveBuildingCollision(player.pos, PLAYER.radius, game.city.colliders);
    let diff = moveAngle - player.heading;
    while (diff > PI) diff -= PI * 2;
    while (diff < -PI) diff += PI * 2;
    player.heading += Math.max(-8 * dt, Math.min(8 * dt, diff));
  }
  player.mesh.position.copy(player.pos);
  player.mesh.rotation.y = player.heading;
  player.swingAmp = player.swingAmp ?? 0;
  player.swingAmp += ((moving ? 1 : 0) - player.swingAmp) * Math.min(1, dt * 6);
  const swing = Math.sin(game.time * 10) * 0.5 * player.swingAmp;
  player.mesh.userData.legL.rotation.x = swing;
  player.mesh.userData.legR.rotation.x = -swing;
  player.mesh.userData.armL.rotation.x = -swing;
  const punchT = Math.max(0, player.punchTimer);
  const armed = player.weapon && player.weapon !== 'fists';
  player.mesh.userData.armR.rotation.x = punchT > 0 ? -1.4 : armed ? -1.4 : 0;
  player.mesh.userData.pistol.visible = armed && player.weapon === 'pistol';
  player.mesh.userData.rifle.visible = armed && player.weapon === 'rifle';
  player.punchTimer = Math.max(0, player.punchTimer - dt);
  player.shootTimer = Math.max(0, (player.shootTimer || 0) - dt);
  player.reloadTimer = Math.max(0, (player.reloadTimer || 0) - dt);
}
