import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
const browser=await chromium.launch({headless:true,channel:'msedge'});
const dir='test-output/delivery-toy';await mkdir(dir,{recursive:true});
try{for(const fallback of [false,true]){
 const context=await browser.newContext({viewport:{width:375,height:667}}),p=await context.newPage(),errors=[];
 p.on('pageerror',e=>errors.push(e.message));
 await p.route('**/*',r=>new URL(r.request().url()).origin!=='http://127.0.0.1:8124'||(fallback&&r.request().url().includes('/assets/delivery/'))?r.abort():r.continue());
 await p.goto('http://127.0.0.1:8124/');await p.waitForFunction(()=>window.__engine);
 await p.evaluate(async()=>{const e=window.__engine;e.sound.setEnabled(false);e.startGame((await import('/src/games/registry.js')).getGameById('g01_delivery'));});
 if(!fallback)await p.waitForFunction(async()=>{const a=await import('/src/art/deliveryAssets.js');return ['mint','peach','truck','depart','background'].every(a.deliveryImage);});
 await p.waitForTimeout(100);await p.screenshot({path:`${dir}/${fallback?'fallback-ready':'ready'}.png`});
 const point=async key=>p.evaluate(key=>{const e=window.__engine,g=e.game,r=g._layout(),b=key==='start'?r.start:r.buttons[g.targets.indexOf(g.queue[0].answer)],c=e.canvas.getBoundingClientRect();return{x:c.x+(b.x+b.w/2)*c.width/800,y:c.y+(b.y+b.h/2)*c.height/1280};},key);
 let q=await point('start');await p.mouse.click(q.x,q.y);await p.waitForTimeout(1200);
 await p.screenshot({path:`${dir}/${fallback?'fallback':'phone'}.png`});
 if(!fallback)await p.evaluate(()=>window.__engine.sound.setEnabled(true));
 const start=Date.now();let lastFrame=0,lastAdvance=Date.now();
 while(Date.now()-start<(fallback?5000:20000)){
  const s=await p.evaluate(()=>({state:window.__engine.state,frame:window.__engine._lastTs}));assert.equal(s.state,'PLAYING');
  if(s.frame!==lastFrame){lastFrame=s.frame;lastAdvance=Date.now();}assert.ok(Date.now()-lastAdvance<2000);
  q=await point('correct');await p.mouse.click(q.x,q.y);await p.waitForTimeout(180);
 }
 const result=await p.evaluate(()=>{const e=window.__engine;return{loads:e.game.loads,correct:e.session.current.filter(r=>r.correct).length,audio:e.sound.ctx?.state};});
 assert.ok(result.loads>=1);assert.ok(result.correct>=8);
 await p.evaluate(()=>{window.__engine.sound.setEnabled(false);window.__engine.pause();});
 const t=await p.evaluate(()=>window.__engine.game.time);await p.waitForTimeout(250);assert.equal(await p.evaluate(()=>window.__engine.game.time),t);
 await p.evaluate(()=>window.__engine.resumeGame());await p.waitForTimeout(200);assert.ok(await p.evaluate(()=>window.__engine.game.time)>t);
 if(!fallback){
  assert.equal(result.audio,'running');
  const n=await p.evaluate(async()=>{const e=window.__engine,{CATALOG,getGameById}=await import('/src/games/registry.js');e.settings.operation='multiply';for(const item of CATALOG){e.startGame(getGameById(item.id));e._update(.016);e._render();e.fever.gain(100);e._update(.016);e._render();e.fever.active=false;e._update(.016);e._render();}e.startGame(getGameById('g01_delivery'));return CATALOG.length;});assert.equal(n,11);
  assert.equal(await p.evaluate(()=>window.__engine.game.phase),'ready');
 }
 assert.deepEqual(errors,[]);console.log({fallback,...result,errors});await context.close();
}}finally{await browser.close();}
