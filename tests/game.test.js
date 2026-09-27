const { test } = require('node:test');
const assert = require('node:assert/strict');
const g = require('../game.js');
const idle = { moveX: 0, soft: false };
function run() { const s = g.createSim(123, 0); g.startGame(s, 123); return s; }
function award(s, colors, chain = 1) {
  g.awardCascade(s, { colors, reds: colors[1], cleared: colors.reduce((a,b) => a+b), chain, score: 10 });
}
function zombie(s, kind, x = 292, y = 80) {
  const z = g.createZombie(kind, g.mulberry32(7), s.nextId++);
  z.x = x; z.y = y; s.zombies.push(z); return z;
}
test('four simultaneous projectiles consume three shields and deal one damage', () => {
  const s = run(); s.shield = 3;
  for (let i=0;i<4;i++) s.shots.push(g.makeEnemyShot(43,80));
  g.updateCombat(s, 1/60);
  assert.equal(s.shield,0); assert.equal(s.hp,9); assert.equal(s.stats.blocked,3);
  assert.equal(s.stats.damage.shooter,1);
});
test('contact and sabotage bypass shields', () => {
  const s = run(); s.shield = 3;
  zombie(s,'tank',41); zombie(s,'saboteur',41);
  g.updateCombat(s,1/60);
  assert.equal(s.hp,6); assert.equal(s.shield,3);
  assert.ok(s.board.cells.some(Boolean));
});
test('blue accumulation, cap, excess discard and chain bonus', () => {
  const s = run(); s.shield=0;
  award(s,[0,0,0,3,0,0]); assert.equal(s.shield,0);
  award(s,[0,0,0,1,0,0]); assert.equal(s.shield,1);
  award(s,[0,0,0,30,0,0]); assert.equal(s.shield,3); assert.equal(s.blueMeter,0);
  s.shield=0; award(s,[0,4,0,0,0,0],5); assert.equal(s.blueMeter,1);
});
test('repair respects health and per-wave limits without banking excess', () => {
  const s=run(); s.hp=5;
  award(s,[0,0,35,0,0,0]); assert.equal(s.hp,7); assert.equal(s.healsThisWave,2); assert.equal(s.greenMeter,0);
  award(s,[0,0,10,0,0,0]); assert.equal(s.hp,7);
  s.rest=1/60; g.updateWave(s,1/60); assert.equal(s.healsThisWave,0);
  s.hp=9; award(s,[0,0,20,0,0,0]); assert.equal(s.hp,10); assert.equal(s.greenMeter,0);
});
test('suppression slows movement and stationary firing, and refreshes without stacking', () => {
  const s=run(); const shooter=zombie(s,'shooter'); const runner=zombie(s,'runner',400);
  const x=runner.x; award(s,[0,0,0,0,6,0]); s.bullets=[];
  g.updateCombat(s,1/60);
  assert.ok(Math.abs(shooter.attack-1/120)<1e-9);
  assert.ok(Math.abs(runner.x-(x-runner.speed/120))<1e-9);
  award(s,[0,0,0,0,18,0]); assert.equal(s.suppression,2);
});
test('rocket interception explodes once locally, not at a remote target', () => {
  const s=run(); const near=zombie(s,'tank',95,70); const far=zombie(s,'shooter',292,70);
  s.bullets=[g.makeBullet({kind:'rocket',y:80},0)]; s.shots=[g.makeEnemyShot(70,80)];
  g.updateCombat(s,1/60);
  assert.equal(near.hp,1); assert.equal(far.hp,2);
  assert.equal(s.bullets.length,0); assert.equal(s.shots.length,0);
  assert.equal(s.booms.filter(b=>b.radius===70).length,1);
  assert.equal(s.stats.rocketsIntercepted,1);
});
test('waves gate types, cap shooters, honor budget and only rest after clearing', () => {
  const s=run();
  for(let i=0;i<100;i++) assert.equal(g.pickZombieKind(s),'normal');
  s.wave=4; zombie(s,'shooter');
  for(let i=0;i<200;i++) assert.notEqual(g.pickZombieKind(s),'shooter');
  s.wave=6; zombie(s,'shooter');
  for(let i=0;i<200;i++) assert.notEqual(g.pickZombieKind(s),'shooter');
  s.waveBudget=0; g.updateWave(s,1); assert.equal(s.rest,0);
  s.zombies=[]; s.shots=[g.makeEnemyShot(200,80)]; g.updateWave(s,1); assert.equal(s.rest,0);
  s.shots=[]; g.updateWave(s,1); assert.equal(s.rest,6);
  g.updateWave(s,6); assert.equal(s.wave,7); assert.ok(s.spawnInterval>=s.profile.minInterval);
});
test('shooter cannot fire before its full three-second charge', () => {
  const s=run(); const z=zombie(s,'shooter');
  for(let i=0;i<179;i++) g.updateCombat(s,1/60);
  assert.equal(s.shots.length,0);
  for(let i=0;i<3;i++) g.updateCombat(s,1/60);
  assert.equal(s.shots.length,1); assert.ok(z.attack<.1);
});
test('pause freezes combat and powers; restarting clears meters, trace and effects', () => {
  const s=run(); s.suppression=2; s.phase='paused';
  g.advance(s,.1,idle); assert.equal(s.suppression,2); assert.equal(s.time,0);
  g.startGame(s,123,'advanced'); assert.equal(s.shield,0); assert.equal(s.suppression,0);
  assert.equal(s.blueMeter,0); assert.equal(s.trace.length,0); assert.equal(s.wave,1);
});
test('preview is exactly the next spawned tower; diamond remains every 30 towers', () => {
  const s=run(); const next=structuredClone(s.nextGems);
  g.spawnTower(s); assert.deepEqual(s.active.cells.map(c=>c.gem),next);
  for(let i=3;i<=30;i++) g.spawnTower(s);
  assert.ok(s.active.cells.some(c=>c.gem.diamond));
  assert.equal(s.nextGems.some(c=>c.diamond),false);
});
test('puzzle randomness cannot consume the enemy random stream', () => {
  const a=run(), b=run();
  for(let i=0;i<100;i++) g.makeGem(a,false);
  assert.equal(a.enemyRng.next(),b.enemyRng.next());
  assert.equal(a.aimRng.next(),b.aimRng.next());
});
test('guided tutorial completes with blue power without affecting best score', () => {
  const s=run(); const best=s.best; g.startTutorial(s); g.hardDrop(s);
  assert.equal(s.phase,'over'); assert.equal(s.endReason,'tutorial');
  assert.equal(s.shield,1); assert.equal(s.best,best);
});
test('base and board failures have distinct causes', () => {
  const s=run(); g.hurt(s,10,'tank'); assert.equal(s.endReason,'base');
  g.startGame(s,123); s.board.cells[5]={color:1,crash:false,diamond:false};
  g.hardDrop(s); assert.equal(s.endReason,'board');
});
test('cascade counts colors without changing ordinary attacks', () => {
  const s=run(); for(let x=0;x<4;x++) s.board.cells[130+x]={color:3,crash:false,diamond:false};
  const result=g.resolveCascade(s.board); assert.equal(result.colors[3],4);
  g.awardCascade(s,result); assert.equal(s.bullets.length,4); assert.equal(s.shield,2);
});
test('identical seeded input trace reproduces the simulation', () => {
  const a=run(),b=run();
  for(let i=0;i<300;i++) g.advance(a,1/60,{moveX:i%60<30?-1:1,soft:true,rotate:i%43===0});
  for(const entry of a.trace) g.advance(b,entry.dt,entry.actions);
  assert.equal(a.hp,b.hp); assert.equal(a.score,b.score);
  assert.deepEqual(a.board.cells,b.board.cells); assert.deepEqual(a.zombies,b.zombies);
});
test('trace includes terminal hard drop and replays through a pause', () => {
  const a=run(),b=run();
  for(let i=0;i<8;i++) g.advance(a,1/60,{...idle,hard:true});
  if(a.phase==='playing') {
    g.advance(a,1/60,{...idle,pause:true});
    g.advance(a,.08,idle);
    g.advance(a,1/60,{...idle,pause:true});
  }
  for(let i=0;i<60 && a.phase==='playing';i++) g.advance(a,1/60,{...idle,hard:true});
  for(const entry of a.trace) g.advance(b,entry.dt,entry.actions);
  assert.equal(a.phase,'over'); assert.equal(a.endReason,b.endReason);
  assert.equal(a.score,b.score); assert.deepEqual(a.stats,b.stats);
});
