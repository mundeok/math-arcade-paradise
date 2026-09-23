import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
const browser=await chromium.launch({headless:true,channel:'msedge'});
await mkdir('test-output/timing-toy',{recursive:true});
try{
 for(const fallback of [false,true]){
  const context=await browser.newContext({viewport:{width:375,height:667}}),p=await context.newPage(),errors=[];
  p.on('pageerror',e=>errors.push(e.message));
  await p.route('**/*',r=>new URL(r.request().url()).origin!=='http://127.0.0.1:8124'||(fallback&&/assets\/(timing\/|world\/timing-)/.test(r.request().url()))?r.abort():r.continue());
  await p.goto('http://127.0.0.1:8124/');await p.waitForFunction(()=>window.__engine);
  await p.evaluate(async()=>{const e=window.__engine;e.sound.setEnabled(false);e.startGame((await import('/src/games/registry.js')).getGameById('g04_timing'));});
  if(!fallback)await p.waitForFunction(async()=>!!(await import('/src/art/timingAssets.js')).timingDrum()&&!!(await import('/src/art/worldAssets.js')).worldImage('g04_timing'));
  await p.waitForTimeout(300);await p.screenshot({path:`test-output/timing-toy/${fallback?'fallback':'phone'}.png`});
  for(let i=0;i<8;i++){
   const q=await p.evaluate(()=>{const e=window.__engine,g=e.game,n=g.numbers.find(n=>g.multiMode?e.fever.isMultiple(n.value):n.correct),q=g._numPos(n),r=e.canvas.getBoundingClientRect();return{x:r.x+q.x*r.width/800,y:r.y+q.y*r.height/1280};});
   await p.mouse.click(q.x,q.y);await p.waitForTimeout(200);
  }
  assert.ok(await p.evaluate(()=>window.__engine.session.current.filter(r=>r.correct).length)>=8);
  if(!fallback){
   await p.evaluate(()=>{const e=window.__engine;e.fever.gain(100);});await p.waitForTimeout(250);await p.screenshot({path:'test-output/timing-toy/fever.png'});
   const count=await p.evaluate(async()=>{const e=window.__engine,{CATALOG,getGameById}=await import('/src/games/registry.js');e.settings.operation='multiply';for(const g of CATALOG){e.startGame(getGameById(g.id));e._update(.016);e._render();e.fever.gain(100);e._update(.016);e._render();e.fever.active=false;e._update(.016);e._render();}return CATALOG.length;});assert.equal(count,11);
  }
  assert.deepEqual(errors,[]);await context.close();
 }
 console.log('Image loading, fallback, eight clicks, mobile, fever, all 11 games: PASS');
}finally{await browser.close();}
