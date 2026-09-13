// 격리 브라우저: 실제 입력/엔진 득점/Canvas/피버 경계 검증. 온라인 기록 전송 금지.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_CHANNEL ? {channel:process.env.BROWSER_CHANNEL} : {}) });
try {
  const page=await browser.newPage({viewport:{width:800,height:1280}}), errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/firestore.googleapis.com/**',r=>r.abort());
  await page.addInitScript(()=>{ window.requestAnimationFrame=()=>0; });
  await page.goto(process.env.BASE_URL || 'http://127.0.0.1:8124/');
  await page.waitForFunction(()=>window.__engine);
  const pointer=await page.evaluate(async()=>{
    const e=window.__engine;
    e.settings.sound=false;e.settings.music=false;
    e.startGame((await import('/src/games/registry.js')).getGameById('g06_stack'));
    e._render();
    const r=e.canvas.getBoundingClientRect();
    return {x:r.x+r.width*0.7,y:r.y+r.height*0.8};
  });
  await page.mouse.move(pointer.x,pointer.y);await page.mouse.down();
  const target=await page.evaluate(()=>{const e=window.__engine;e._update(0.04);return e.game.towerTargetX;});
  await page.mouse.up(); assert.ok(Math.abs(target-560)<1);
  const result=await page.evaluate(async()=>{
    const {L}=await import('/src/core/layout.js');
    const e=window.__engine,g=e.game;
    const receive=perfect=>{
      g.towerTargetX=g.towerX;
      g.blocks=[{value:g.problem.answer,correct:true,x:g.towerX+(perfect?0:g.perfectHalfW+L.gu(.1)),y:g._catchY()-g.fallBlockH/2,age:1}];
      g.update(0);
    };
    receive(false); const normal=e.scoreManager.score;
    receive(true); const perfect=e.scoreManager.score-normal;
    if(normal!==10||perfect!==20)throw Error('catch points');
    const beforeProgress=g.deliveredCount;
    e.fever.gauge=100;e.fever.gainCorrect();g.update(0);
    const lives=e.scoreManager.lives,combo=e.scoreManager.combo;
    const b={value:e.fever.randomTrap(),x:g.towerX,y:g._catchY()};
    g._catchTrap(b);
    if(e.scoreManager.lives!==lives||e.scoreManager.combo!==combo)throw Error('fever trap penalty');
    const before=e.scoreManager.score;
    g._catchMultiple({value:e.fever.dan*3,x:g.towerX,y:g._catchY()});
    const feverPoints=e.scoreManager.score-before;
    if(feverPoints!==60)throw Error('core fever x3 not retained');
    const old=g.blocks.slice();e.fever.active=false;g.update(0);
    if(g.multiMode||g.blocks.some(b=>old.includes(b)||b.isMultiple!==undefined))throw Error('stale fever blocks');
    if(g.deliveredCount!==beforeProgress+1)throw Error('progress lost');
    // 새 그림 함수는 상태/난수/정답 판정을 건드리지 않는다.
    const art=await import('/src/art/stackDessertArt.js');
    const c=document.createElement('canvas');c.width=L.W;c.height=L.H;const ctx=c.getContext('2d');
    ctx.fillStyle='#123456';ctx.translate(L.gu(.1),L.gu(.1));
    const state=()=>JSON.stringify({fill:ctx.fillStyle,font:ctx.font,alpha:ctx.globalAlpha,transform:ctx.getTransform().toJSON()});
    const save=state(),random=Math.random;
    Math.random=()=>{throw Error('art consumed RNG');};
    try {art.drawDessert(ctx,400,500,112,56,'999',40);art.drawDessertPlate(ctx,400,600,200,28);art.drawDessertShop(ctx,1);}finally{Math.random=random;}
    if(state()!==save)throw Error('art state leak');
    return {normalPoints:normal,perfectPoints:perfect,feverPoints,feverCleanExit:true,artStatePreserved:true};
  });
  const dir=process.env.SCREENSHOT_DIR;
  if(dir)await mkdir(dir,{recursive:true});
  const shot=async name=>{if(dir)await page.screenshot({path:resolve(dir,name+'.png')});};
  // 시각 검사 장면: 상태를 고정하여 최종 한 개/균형/진열을 함께 확인한다.
  await page.evaluate(()=>{
    const e=window.__engine,g=e.game;
    g.waveIndex=3;g.deliveredCount=6;g.stacked=[3,5,4,7,2,6];g.wrongInWave=2;g.tiltCur=12;g.recoveryCharge=2;
    g.completedDesserts=[{number:1,values:[3,5,4,7]},{number:2,values:[2,5,4,7,3]},{number:3,values:[4,2,3,6,5,7]}];
    g.problem={text:'24 ÷ 6',answer:4,blank:null};g.catchFeedback={perfect:true,points:20,t:0,dur:.5};g.feverBanner=null;
    g.blocks=[{value:4,correct:true,x:560,y:570},{value:6,correct:false,x:240,y:660}];
    e.ui.comboOverlays=[];e.ui.floatScores=[];e.ui.flashTime=0;g.waveGlow=null;g.popEffects=[];g.thud=0;
    e.particles.clear();e._render();
  });
  await shot('dessert-desktop');
  await page.setViewportSize({width:375,height:667});await page.waitForTimeout(80);
  await page.evaluate(()=>window.__engine._render());await shot('dessert-phone');
  await page.evaluate(()=>{const e=window.__engine;e.fever.gauge=100;e.fever.gainCorrect();e.game.update(.01);e._render();});
  await shot('dessert-fever');
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({...result,pointerInput:true,pageErrors:errors},null,2));
} finally {await browser.close();}
