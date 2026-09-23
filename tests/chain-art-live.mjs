import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
const browser = await chromium.launch({ headless:true, channel:'msedge' });
const origin = process.env.BASE_URL || 'http://127.0.0.1:8124';
const dir = resolve('test-output/chain-toy');
await mkdir(dir,{recursive:true});
const errors=[];
try {
 for(const fallback of [false,true]) {
  const context=await browser.newContext({viewport:{width:800,height:1280}});
  const page=await context.newPage();
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>new URL(r.request().url()).origin!==new URL(origin).origin || (fallback&&r.request().url().includes('/assets/chain/')) ? r.abort():r.continue());
  await page.goto(origin); await page.waitForFunction(()=>window.__engine);
  await page.evaluate(async()=>{const e=window.__engine;e.settings.operation='multiply';e.sound.setEnabled(false);e.startGame((await import('/src/games/registry.js')).getGameById('g08_chain'));});
  await page.waitForFunction(async()=>Object.values((await import('/src/art/chainAssets.js')).chainAssetStatus()).every(s=>s==='ready'||s==='error'));
  assert.equal(await page.evaluate(async()=>Object.values((await import('/src/art/chainAssets.js')).chainAssetStatus()).every(s=>s==='ready')), !fallback);
  const ready=()=>page.waitForFunction(()=>window.__engine.game._inputReady());
  const drag=async(wrong=false,shot=false)=>{
   await ready();
   const pts=await page.evaluate(async wrong=>{
    const g=window.__engine.game;
    const path=wrong?[g.board.findIndex(b=>b.value%g.D!==0)]:(await import('/src/games/chainBoard.js')).findChain(g.board,g.D,5);
    const box=document.querySelector('canvas').getBoundingClientRect();
    return path.map(i=>{const p=g._layout().points[i];return{x:box.x+p.x*box.width/800,y:box.y+p.y*box.height/1280};});
   },wrong);
   await page.mouse.move(pts[0].x,pts[0].y);await page.mouse.down();
   for(const p of pts.slice(1)) await page.mouse.move(p.x,p.y,{steps:5});
   if(shot)await page.screenshot({path:resolve(dir,fallback?'fallback.png':'desktop.png')});
   await page.mouse.up(); await page.waitForTimeout(450);
  };
  const first=await page.evaluate(()=>window.__engine._lastTs);
  await drag(false,true);
  for(let i=0;i<(fallback?2:8);i++)await drag();
  assert.ok(await page.evaluate(()=>window.__engine.game.poppedCount)>=15);
  assert.ok(await page.evaluate(()=>window.__engine._lastTs)>first);
  if(!fallback){
   await page.evaluate(()=>{const e=window.__engine;e.fever.active=false;e.fever.gauge=0;});await page.waitForTimeout(800);
   const lives=await page.evaluate(()=>window.__engine.scoreManager.lives);
   await drag(true);assert.equal(await page.evaluate(()=>window.__engine.scoreManager.lives),lives-1);
   await page.evaluate(()=>window.__engine.sound.setEnabled(true));await drag();
   await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>window.__engine.state),'PAUSED');
   const t=await page.evaluate(()=>window.__engine.game.time);await page.waitForTimeout(250);
   assert.equal(await page.evaluate(()=>window.__engine.game.time),t);await page.keyboard.press('Escape');
   await page.evaluate(()=>{window.__engine.sound.setEnabled(false);window.__engine.fever.gain(100);});await page.waitForTimeout(600);
   assert.ok(await page.evaluate(()=>window.__engine.game.wasFever));await drag();
   await page.screenshot({path:resolve(dir,'fever.png')});
   await page.evaluate(()=>{window.__engine.fever.active=false;window.__engine.fever.gauge=0;});await page.waitForTimeout(900);
   await page.setViewportSize({width:375,height:667});await drag();
   await page.screenshot({path:resolve(dir,'phone.png')});
   await page.evaluate(()=>{window.__engine.game.remaining=.05;});await page.waitForTimeout(350);
   assert.equal(await page.evaluate(()=>window.__engine.state),'RESULT');
   const p=await page.evaluate(()=>{const e=window.__engine,b=e.scene.retryBtn,r=e.canvas.getBoundingClientRect();return{x:r.x+(b.x+b.w/2)*r.width/800,y:r.y+(b.y+b.h/2)*r.height/1280};});
   await page.mouse.click(p.x,p.y);await drag();
   const games=await page.evaluate(async()=>{const {CATALOG,getGameById}=await import('/src/games/registry.js');const e=window.__engine;for(const g of CATALOG){e.startGame(getGameById(g.id));e._update(.016);e._render();e.fever.gain(100);e._update(.016);e._render();e.fever.active=false;e._update(.016);e._render();}e.setState('MENU');return CATALOG.length;});
   assert.equal(games,11);
  }
  await context.close();
 }
 assert.deepEqual(errors,[]);
 console.log(JSON.stringify({realRAF:true,continuousDrag:true,wrongRecovery:true,fever:true,pauseResume:true,resultRetry:true,mobile:true,soundOnOff:true,fallback:true,allGames:11,errors}));
}finally{await browser.close();}
