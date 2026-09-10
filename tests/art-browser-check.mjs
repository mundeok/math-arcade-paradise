// Canvas art regression; separate headless session, never touches the user's tab.
// Start localhost first. PLAYWRIGHT_MODULE and BROWSER_CHANNEL are optional.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const browser = await chromium.launch({ headless:true, ...(process.env.BROWSER_CHANNEL ? {channel:process.env.BROWSER_CHANNEL} : {}) });
try {
  const page=await browser.newPage({viewport:{width:800,height:1280}}), errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{window.requestAnimationFrame=()=>0;});
  await page.goto(process.env.BASE_URL || 'http://127.0.0.1:8124/');
  await page.waitForFunction(()=>window.__engine);
  const result=await page.evaluate(async()=>{
    const art=await import('/src/art/toyArt.js');
    const world=await import('/src/art/arcadeWorld.js');
    const {CATALOG}=await import('/src/games/registry.js');
    const {L}=await import('/src/core/layout.js');
    const c=document.createElement('canvas'); c.width=L.W; c.height=L.H;
    const ctx=c.getContext('2d',{willReadFrequently:true});
    const state=()=>JSON.stringify({alpha:ctx.globalAlpha,fill:ctx.fillStyle,stroke:ctx.strokeStyle,
      width:ctx.lineWidth,font:ctx.font,align:ctx.textAlign,baseline:ctx.textBaseline,
      join:ctx.lineJoin,cap:ctx.lineCap,matrix:[...['a','b','c','d','e','f'].map(k=>ctx.getTransform()[k])]});
    const calls=[
      ...['g00_dummy',...CATALOG.map(g=>g.id)].map(id=>()=>art.drawGameIcon(ctx,id,L.gu(4),L.gu(4),L.gu(3))),
      ()=>art.drawGameCard(ctx,'g01_combo',{x:L.safe,y:L.safe,w:L.gu(5),h:L.gu(5)},true),
      ()=>art.drawJellySurface(ctx,L.gu(4),L.gu(4),L.gu(1.5)),
      ()=>art.drawNumberRobot(ctx,L.gu(4),L.gu(4),L.gu(1.5),'72',.7),
      ()=>art.drawToyLauncher(ctx,L.gu(4),L.gu(4),L.gu(3),L.gu(2)),
      ()=>art.drawTileGleam(ctx,{x:L.safe,y:L.safe,w:L.gu(5),h:L.gu(3)}),
      ()=>art.drawPirate(ctx,L.gu(4),L.gu(4),L.gu(2)),
      ()=>art.drawTreasureChest(ctx,L.gu(4),L.gu(4),L.gu(2)),
      ...['g02_catch','g07_shoot','g08_chain','g09_balloon'].map(id=>()=>art.drawPlayBackdrop(ctx,id)),
      ...CATALOG.filter(g=>g.id!=='g03_racing').map(g=>()=>world.drawArcadeWorld(ctx,g.id,2.5)),
      ()=>world.drawWorldHeader(ctx,'g03_racing'),
      ()=>world.drawWorldBuddy(ctx,L.gu(4),L.gu(4),L.gu(2),2.5,'bot'),
      ()=>art.drawRewardText(ctx,'+100',L.gu(4),L.gu(4)),
    ];
    const originalRandom=Math.random;
    Math.random=()=>{throw new Error('Rendering must not consume gameplay RNG');};
    const images=[];
    const clear=()=>{ctx.save();ctx.resetTransform();ctx.clearRect(0,0,L.W,L.H);ctx.restore();};
    try {
      for(const draw of calls) {
        clear(); ctx.globalAlpha=.8; ctx.translate(.5,.5);
        const before=state(); draw();
        if(state()!==before) throw new Error('Art helper leaked canvas state');
        const a=c.toDataURL(); clear(); draw();
        if(a!==c.toDataURL()) throw new Error(`Art helper ${images.length} is not deterministic`);
        images.push(a); ctx.resetTransform();
      }
    } finally {Math.random=originalRandom;}
    return {helpersChecked:calls.length,uniqueIcons:new Set(images.slice(0,12)).size,statePreserved:true,deterministic:true};
  });
  assert.equal(result.uniqueIcons,12);
  const dir=process.env.SCREENSHOT_DIR;
  if(dir) await mkdir(dir,{recursive:true});
  const snapshot=async name=>{if(dir) await page.screenshot({path:resolve(dir,name+'.png')});};
  await page.evaluate(()=>{window.__engine.setState('MENU');window.__engine._render();});
  await snapshot('menu');
  const ids=await page.evaluate(async()=> (await import('/src/games/registry.js')).CATALOG.map(g=>g.id));
  for(const id of ids) {
    await page.evaluate(async id=>{
      const e=window.__engine; e.settings.sound=false; e.settings.music=false; e.settings.operation='multiply';
      e.startGame((await import('/src/games/registry.js')).getGameById(id));
      if(id==='g01_delivery') e.game._start();
      if(id==='g10_remain') e.game._nextProblem();
      for(let i=0;i<22;i++) e._update(.05);
      e._render();
    },id);
    await snapshot(id);
    await page.evaluate(()=>{
      const e=window.__engine;
      if(e.fever){e.fever.gauge=100;e.fever.gainCorrect();e._syncFeverEasy();e._update(.02);e._render();}
    });
    await snapshot(id+'-fever');
  }
  await page.setViewportSize({width:375,height:667});
  await page.waitForTimeout(100); // resize clears Canvas; RAF is disabled in this test
  await page.evaluate(()=>{window.__engine.setState('MENU');window.__engine._render();});
  await snapshot('phone-menu');
  for(const id of ['g02_catch','g08_chain','g09_balloon','g04_timing']) {
    await page.evaluate(async id=>{
      const e=window.__engine;
      e.startGame((await import('/src/games/registry.js')).getGameById(id));
      for(let i=0;i<40;i++) e._update(.05);
      e._render();
    },id);
    await snapshot('phone-'+id);
  }
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({...result,gamesRendered:ids.length,pageErrors:errors},null,2));
} finally {await browser.close();}
