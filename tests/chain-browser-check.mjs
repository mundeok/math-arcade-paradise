import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const browser=await chromium.launch({headless:true,channel:process.env.BROWSER_CHANNEL||'msedge'});
try{
  const page=await browser.newPage({viewport:{width:800,height:1280}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://firestore.googleapis.com/**',r=>r.abort());
  await page.addInitScript(()=>{window.requestAnimationFrame=()=>0;});
  await page.goto(process.env.BASE_URL||'http://127.0.0.1:8124/');await page.waitForFunction(()=>window.__engine);
  const dir=process.env.SCREENSHOT_DIR;if(dir)await mkdir(dir,{recursive:true});
  const shot=async name=>{await page.evaluate(()=>window.__engine._render());if(dir)await page.screenshot({path:resolve(dir,name+'.png')});};
  async function start(){await page.evaluate(async()=>{
    const e=window.__engine;e.game?.destroy?.();e.settings.sound=false;e.settings.music=false;e.settings.operation='multiply';e.settings.dans=[4];
    e.startGame((await import('/src/games/registry.js')).getGameById('g08_chain'));e._update(1.01);
  });}
  async function points(){return page.evaluate(async()=>{
    const g=window.__engine.game,path=(await import('/src/games/chainBoard.js')).findChain(g.board,g.D,5),r=document.querySelector('canvas').getBoundingClientRect();
    return path.map(i=>{const p=g._layout().points[i];return {x:r.x+p.x*r.width/800,y:r.y+p.y*r.height/1280};});
  });}
  await start();await shot('chain-start');
  let p=await points();await page.mouse.move(p[0].x,p[0].y);await page.mouse.down();
  for(const v of p.slice(1))await page.mouse.move(v.x,v.y,{steps:5});
  assert.equal(await page.evaluate(()=>window.__engine.session.current.length),0);
  assert.equal(await page.evaluate(()=>window.__engine.game.path.length),5);await shot('chain-selected');
  await page.mouse.up();assert.equal(await page.evaluate(()=>window.__engine.session.current.length),5);
  await page.evaluate(()=>window.__engine._update(.08));await shot('chain-pop');
  await page.evaluate(()=>window.__engine._update(.5));
  const wrong=await page.evaluate(()=>{
    const e=window.__engine,g=e.game,b=g.board,lives=e.scoreManager.lives,score=e.scoreManager.score;
    g.path=[g.board.findIndex(t=>t.value%g.D!==0)];g._submit();
    return e.scoreManager.lives===lives-1&&e.scoreManager.score===score&&g.board===b&&!e.freeze.active&&e.problemGenerator.reviewQueue.length>0;
  });assert.equal(wrong,true);
  await page.evaluate(()=>{
    const e=window.__engine;e.fever.gauge=100;e.fever.gainCorrect();e._update(.5);
  });await shot('chain-fever');
  const fever=await page.evaluate(()=>{
    const e=window.__engine,g=e.game,lives=e.scoreManager.lives;
    g.path=Array.from({length:16},(_,i)=>Math.floor(i/4)*4+(Math.floor(i/4)%2?3-i%4:i%4));
    g._submit();const safe=e.scoreManager.lives>=lives&&g.chainCount===13;
    g.path=[0];g.dragging=true;e.fever.active=false;e._update(.01);
    return {safe,cleared:!g.path.length&&!g.pops.length&&!g.dragging,restored:g.D===4&&g.board.length===16};
  });assert.deepEqual(fever,{safe:true,cleared:true,restored:true});
  // A native cancelled touch must not be interpreted as a release by core input.
  await start();const canceled=await page.evaluate(()=>{
    const e=window.__engine,g=e.game,c=e.canvas,r=c.getBoundingClientRect(),p=g._layout().points[0];
    const touch=new Touch({identifier:77,target:c,clientX:r.x+p.x*r.width/800,clientY:r.y+p.y*r.height/1280});
    c.dispatchEvent(new TouchEvent('touchstart',{touches:[touch],changedTouches:[touch],bubbles:true,cancelable:true}));
    const selected=g.path.length===1;
    c.dispatchEvent(new TouchEvent('touchcancel',{touches:[],changedTouches:[touch],bubbles:true,cancelable:true}));
    return selected&&e.session.current.length===0&&!g.dragging;
  });assert.equal(canceled,true);
  await page.keyboard.press('Space');await page.keyboard.press('p');await page.keyboard.press('p');await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(()=>window.__engine.session.current.length),0);
  await page.setViewportSize({width:375,height:667});await page.waitForTimeout(100);await start();
  // Touch sequence uses the real Input mapping at phone scale.
  const mobile=await page.evaluate(async()=>{
    const e=window.__engine,g=e.game,c=e.canvas,r=c.getBoundingClientRect(),path=(await import('/src/games/chainBoard.js')).findChain(g.board,g.D,5);
    let t;
    path.forEach((i,n)=>{const p=g._layout().points[i];t=new Touch({identifier:88,target:c,clientX:r.x+p.x*r.width/800,clientY:r.y+p.y*r.height/1280});
      c.dispatchEvent(new TouchEvent(n?'touchmove':'touchstart',{touches:[t],changedTouches:[t],bubbles:true,cancelable:true}));});
    const count=g.path.length;c.dispatchEvent(new TouchEvent('touchend',{touches:[],changedTouches:[t],bubbles:true,cancelable:true}));
    return count===5&&e.session.current.length===5;
  });assert.equal(mobile,true);await page.evaluate(()=>window.__engine._update(.5));await shot('chain-phone');
  const pure=await page.evaluate(()=>{
    const g=window.__engine.game,c=document.createElement('canvas');c.width=800;c.height=1280;const ctx=c.getContext('2d');
    const state=()=>JSON.stringify({fill:ctx.fillStyle,alpha:ctx.globalAlpha,font:ctx.font,matrix:ctx.getTransform().toString()});
    const before=state(),board=JSON.stringify(g.board),rnd=Math.random;
    Math.random=()=>{throw Error('art consumed RNG');};try{g.render(ctx);}finally{Math.random=rnd;}
    return state()===before&&JSON.stringify(g.board)===board;
  });assert.equal(pure,true);
  await page.evaluate(()=>{const e=window.__engine;e.game.remaining=.01;e._update(.02);});
  assert.equal(await page.evaluate(()=>window.__engine.state),'RESULT');assert.deepEqual(errors,[]);
  console.log(JSON.stringify({mouse:true,mobile,canceled,wrong,fever,renderPure:pure,result:true,pageErrors:errors},null,2));
}finally{await browser.close();}
