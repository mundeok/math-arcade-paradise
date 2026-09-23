import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
const browser=await chromium.launch({headless:true,channel:'msedge'});
await mkdir('test-output/shoot-toy',{recursive:true});
try{for(const fallback of [false,true]){
 const c=await browser.newContext({viewport:{width:375,height:667}}),p=await c.newPage(),errors=[];
 p.on('pageerror',e=>errors.push(e.message));
 await p.route('**/*',r=>new URL(r.request().url()).origin!=='http://127.0.0.1:8124'||(fallback&&/assets\/(shoot\/|world\/shoot-)/.test(r.request().url()))?r.abort():r.continue());
 await p.goto('http://127.0.0.1:8124/');await p.waitForFunction(()=>window.__engine);
 await p.evaluate(async()=>{const e=window.__engine;e.sound.setEnabled(false);e.startGame((await import('/src/games/registry.js')).getGameById('g07_shoot'));});
 if(!fallback)await p.waitForFunction(async()=>{const a=await import('/src/art/shootAssets.js');return ['teal','purple','peach','ship'].every(n=>a.shootImage(n))&&!!(await import('/src/art/worldAssets.js')).worldImage('g07_shoot');});
 await p.waitForTimeout(350);await p.screenshot({path:`test-output/shoot-toy/${fallback?'fallback':'phone'}.png`});
 for(let i=0;i<10;i++){
  const q=await p.evaluate(()=>{const e=window.__engine,g=e.game,n=g.enemies.find(n=>!n.judged&&(g.multiMode?e.fever.isMultiple(n.value):n.correct)),r=e.canvas.getBoundingClientRect();return n?{x:r.x+n.x*r.width/800,y:r.y+g.charY*r.height/1280}:null;});
  if(q)await p.mouse.click(q.x,q.y);await p.waitForTimeout(400);
 }
 assert.ok(await p.evaluate(()=>window.__engine.session.current.some(r=>r.correct)));assert.deepEqual(errors,[]);await c.close();
}console.log('Shoot art loading, mobile, fallback and live input PASS');}finally{await browser.close();}
