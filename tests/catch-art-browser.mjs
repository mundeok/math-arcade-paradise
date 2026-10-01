import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
const browser=await chromium.launch({headless:true,channel:'msedge'});
const dir='test-output/catch-toy';await mkdir(dir,{recursive:true});
try{for(const fallback of [false,true]){
 const c=await browser.newContext({viewport:{width:375,height:667}}),p=await c.newPage(),errors=[];
 p.on('pageerror',e=>errors.push(e.message));
 await p.route('**/*',r=>new URL(r.request().url()).origin!=='http://127.0.0.1:8124'||(fallback&&/assets\/(catch\/|world\/catch-)/.test(r.request().url()))?r.abort():r.continue());
 await p.goto('http://127.0.0.1:8124/');await p.waitForFunction(()=>window.__engine);
 const startGame=()=>p.evaluate(async()=>{const e=window.__engine;e.sound.setEnabled(false);e.startGame((await import('/src/games/registry.js')).getGameById('g02_catch'));});
 await startGame();
 if(!fallback)await p.waitForFunction(async()=>{const a=await import('/src/art/catchAssets.js');return ['mint','peach','yellow','bear'].every(a.catchImage)&&!!(await import('/src/art/worldAssets.js')).worldImage('g02_catch');});
 await p.waitForFunction(()=>window.__engine.game.fallers.filter(f=>f.y>440&&f.y<1100).length>=2);
 await p.screenshot({path:`${dir}/${fallback?'fallback':'phone'}.png`});
 if(!fallback)await p.evaluate(()=>window.__engine.sound.setEnabled(true));
 const start=Date.now();let frame=0,advance=Date.now();
 while(Date.now()-start<(fallback?7000:25000)){
  const s=await p.evaluate(()=>{const e=window.__engine,g=e.game,r=e.canvas.getBoundingClientRect();const f=g.fallers.find(f=>!f.judged&&f.y>420&&f.y<1030&&(g.multiMode?e.fever.isMultiple(f.value):f.correct));return{state:e.state,frame:e._lastTs,x:f?r.x+f.x*r.width/800:null,y:f?r.y+f.y*r.height/1280:null};});
  assert.equal(s.state,'PLAYING');if(s.frame!==frame){frame=s.frame;advance=Date.now();}assert.ok(Date.now()-advance<2000);
  if(s.x!==null)await p.mouse.click(s.x,s.y);await p.waitForTimeout(35);
 }
 const live=await p.evaluate(()=>({correct:window.__engine.session.current.filter(r=>r.correct).length,audio:window.__engine.sound.ctx?.state}));assert.ok(live.correct>=3);
 await p.evaluate(()=>{window.__engine.sound.setEnabled(false);window.__engine.pause();});const t=await p.evaluate(()=>window.__engine.game.time);await p.waitForTimeout(250);assert.equal(await p.evaluate(()=>window.__engine.game.time),t);await p.evaluate(()=>window.__engine.resumeGame());
 if(!fallback){
  assert.equal(live.audio,'running');
  const boundaries=await p.evaluate(()=>{
   const e=window.__engine,g=e.game;e.startGame(g);const tick=n=>{for(let i=0;i<n;i++){e._update(.02);e._render();}};
   const wrong=()=>{g.fallers.forEach((f,i)=>{f.x=150+i*230;f.y=600;});const f=g.fallers.find(f=>!f.correct);e.dispatchTouch(f.x,f.y,'start');e.dispatchTouch(f.x,f.y,'end');};
   const lives=e.scoreManager.lives;wrong();if(e.scoreManager.lives!==lives-1)throw Error('wrong life');tick(80);if(e.freeze.active)throw Error('recovery');
   const f=g.fallers.find(f=>f.correct);f.y=g.FLOOR_Y+1;f.age=1;const before=e.scoreManager.lives;tick(1);if(!e.session.current.at(-1).missed||e.scoreManager.lives!==before)throw Error('miss');
   e.fever.gain(100);tick(2);if(!g.multiMode)throw Error('fever enter');e.fever.active=false;tick(2);if(g.multiMode)throw Error('fever exit');
   e.scoreManager.lives=1;tick(8);wrong();tick(80);if(e.state!=='RESULT')throw Error('result');e.startGame(g);if(e.state!=='PLAYING'||g.multiMode)throw Error('restart');return true;
  });assert.ok(boundaries);
  const count=await p.evaluate(async()=>{const e=window.__engine,{CATALOG,getGameById}=await import('/src/games/registry.js');e.settings.operation='multiply';for(const item of CATALOG){e.startGame(getGameById(item.id));e._update(.016);e._render();e.fever.gain(100);e._update(.016);e._render();e.fever.active=false;e._update(.016);e._render();}return CATALOG.length;});assert.equal(count,11);
 }
 assert.deepEqual(errors,[]);console.log({fallback,...live,errors});await c.close();
}}finally{await browser.close();}
