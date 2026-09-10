import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const browser=await chromium.launch({headless:true,channel:process.env.BROWSER_CHANNEL||'msedge'});
try {
  const page=await browser.newPage({viewport:{width:800,height:1280}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  // Keep the ranking backend out of a synthetic test (even reads).
  await page.route('https://firestore.googleapis.com/**',r=>r.abort());
  await page.addInitScript(()=>{window.requestAnimationFrame=()=>0;});
  await page.goto(process.env.BASE_URL||'http://127.0.0.1:8124/');
  await page.waitForFunction(()=>window.__engine);
  const out=process.env.SCREENSHOT_DIR;
  if(out)await mkdir(out,{recursive:true});
  const shot=async n=>{if(out)await page.screenshot({path:resolve(out,n+'.png')});};
  await page.evaluate(async()=>{
    const e=window.__engine;e.settings.sound=false;e.settings.music=false;e.settings.operation='multiply';
    e.startGame((await import('/src/games/registry.js')).getGameById('g01_delivery'));e._render();
  });
  await shot('delivery-ready');
  const point=async key=>page.evaluate(key=>{
    const g=window.__engine.game,r=g._layout();
    const b=key==='correct'?r.buttons[g.targets.indexOf(g.queue[0].answer)]:r[key];
    const c=document.getElementById('game').getBoundingClientRect();
    return {x:c.x+(b.x+b.w/2)*c.width/800,y:c.y+(b.y+b.h/2)*c.height/1280};
  },key);
  let p=await point('start');await page.mouse.click(p.x,p.y);
  await page.evaluate(()=>{const e=window.__engine;e._update(1.01);e._render();});
  p=await point('correct');await page.mouse.move(p.x,p.y);await page.mouse.down();
  assert.equal(await page.evaluate(()=>window.__engine.game.delivered),0);
  await page.mouse.up();
  assert.equal(await page.evaluate(()=>window.__engine.game.delivered),1);
  // Advance with physical arrow key presses, while preserving game time by dt.
  for(let i=0;i<7;i++){
    const k=await page.evaluate(()=>{const g=window.__engine.game;return g.targets.indexOf(g.queue[0].answer)?'ArrowRight':'ArrowLeft';});
    await page.keyboard.press(k);await page.evaluate(()=>window.__engine._update(.12));
  }
  assert.equal(await page.evaluate(()=>window.__engine.game.loads),1);
  await page.evaluate(()=>{const e=window.__engine;e._update(1);e._render();});await shot('delivery-play');
  const fever=await page.evaluate(()=>{
    const e=window.__engine,g=e.game;const original=g.queue[0];
    e.fever.gauge=100;e.fever.gainCorrect();e._update(.7);
    const lives=e.scoreManager.lives,combo=e.scoreManager.combo;
    g._send(1-g.targets.indexOf(g.queue[0].answer));
    const invincible=e.scoreManager.lives===lives&&e.scoreManager.combo===combo;
    e._render();return {invincible,active:g.wasFever,saved:g.normalSaved.queue[0].text===original.text};
  });
  assert.deepEqual(fever,{invincible:true,active:true,saved:true});await shot('delivery-fever');
  const result=await page.evaluate(()=>{
    const e=window.__engine,g=e.game;const original=g.normalSaved.queue[0];
    e.fever.active=false;e._update(.01);const restored=g.queue[0]===original;
    e._update(1);g.remaining=.02;e._update(.03);
    return {restored,state:e.state,records:e.session.current.length,gameId:e.game.id};
  });
  assert.ok(result.restored);assert.equal(result.state,'RESULT');assert.equal(result.gameId,'g01_delivery');
  await shot('delivery-result');
  await page.setViewportSize({width:375,height:667});await page.waitForTimeout(100);
  await page.evaluate(async()=>{
    const e=window.__engine;e.startGame((await import('/src/games/registry.js')).getGameById('g01_delivery'));
    e.game._start();e._update(1.01);e._render();
  });await shot('delivery-phone');
  p=await point('correct');await page.mouse.click(p.x,p.y);
  assert.equal(await page.evaluate(()=>window.__engine.game.delivered),1);
  await page.evaluate(()=>{const e=window.__engine,g=e.game;g.cardAge=g._cardSeconds()-.8;e._render();});
  await shot('delivery-phone-countdown');
  const timeout=await page.evaluate(()=>{
    const e=window.__engine,g=e.game,next=g.queue[1],lives=e.scoreManager.lives;
    e._update(.81);e._render();const record=e.session.current.at(-1);
    return {advanced:g.queue[0]===next,lostOneLife:e.scoreManager.lives===lives-1,
      missed:record.missed,answer:record.userAnswer,progress:g.inLoad,clock:g.cardAge,state:e.state};
  });
  assert.deepEqual(timeout,{advanced:true,lostOneLife:true,missed:true,answer:null,progress:1,clock:0,state:'PLAYING'});
  await shot('delivery-phone-timeout');
  const renderPure=await page.evaluate(()=>{
    const e=window.__engine,g=e.game,c=document.createElement('canvas');c.width=800;c.height=1280;
    const ctx=c.getContext('2d'),state=()=>JSON.stringify({alpha:ctx.globalAlpha,fill:ctx.fillStyle,
      stroke:ctx.strokeStyle,font:ctx.font,matrix:ctx.getTransform().toString()});
    const before=state(),gameBefore=JSON.stringify({remaining:g.remaining,queue:g.queue,targets:g.targets,cardAge:g.cardAge});
    const original=Math.random;Math.random=()=>{throw Error('Decorations must not consume question RNG');};
    try{g.render(ctx);}finally{Math.random=original;}
    return before===state()&&gameBefore===JSON.stringify({remaining:g.remaining,queue:g.queue,targets:g.targets,cardAge:g.cardAge});
  });
  assert.equal(renderPure,true);
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({mouse:true,keyboard:true,mobile:true,fever,result,timeout,renderPure,pageErrors:errors},null,2));
}finally{await browser.close();}
