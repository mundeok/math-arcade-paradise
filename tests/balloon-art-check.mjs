import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
const browser=await chromium.launch({headless:true,channel:'msedge'});
const dir='test-output/balloon-toy';await mkdir(dir,{recursive:true});
const errors=[];
try{
 for(const fallback of [false,true]){
  const context=await browser.newContext({viewport:{width:800,height:1280}}),p=await context.newPage();
  p.on('pageerror',e=>errors.push(e.message));
  await p.route('**/*',r=>new URL(r.request().url()).origin!=='http://127.0.0.1:8124'||(fallback&&/assets\/(balloon\/|world\/balloon-)/.test(r.request().url()))?r.abort():r.continue());
  await p.goto('http://127.0.0.1:8124/');await p.waitForFunction(()=>window.__engine);
  await p.evaluate(async()=>{const e=window.__engine;e.sound.setEnabled(false);e.startGame((await import('/src/games/registry.js')).getGameById('g09_balloon'));});
  if(!fallback)await p.waitForFunction(async()=>!!(await import('/src/art/balloonAssets.js')).balloonImage()&&!!(await import('/src/art/worldAssets.js')).worldImage('g09_balloon'));
  await p.waitForTimeout(500);await p.screenshot({path:`${dir}/${fallback?'fallback':'desktop'}.png`});
  for(let i=0;i<8;i++){
   const b=await p.evaluate(()=>{const e=window.__engine,g=e.game,b=g.balloons.find(b=>g.multiMode?e.fever.isMultiple(b.value):b.correct),r=e.canvas.getBoundingClientRect();return{x:r.x+b.x*r.width/800,y:r.y+b.y*r.height/1280};});
   await p.mouse.click(b.x,b.y);await p.waitForTimeout(200);
  }
  assert.ok(await p.evaluate(()=>window.__engine.session.current.filter(r=>r.correct).length)>=8);
  if(!fallback){
   await p.setViewportSize({width:375,height:667});await p.waitForTimeout(250);await p.screenshot({path:`${dir}/phone.png`});
   const count=await p.evaluate(async()=>{const e=window.__engine,{CATALOG,getGameById}=await import('/src/games/registry.js');e.settings.operation='multiply';for(const g of CATALOG){e.startGame(getGameById(g.id));e._update(.016);e._render();e.fever.gain(100);e._update(.016);e._render();e.fever.active=false;e._update(.016);e._render();}e.setState('MENU');return CATALOG.length;});assert.equal(count,11);
  }
  await context.close();
 }
 assert.deepEqual(errors,[]);console.log({loadedImages:true,fallback:true,allGames:11,errors});
}finally{await browser.close();}
