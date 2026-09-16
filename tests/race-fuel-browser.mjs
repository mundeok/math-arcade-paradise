// 격리된 실제 Chromium 입력/rAF 검사. 경계값만 준비하며 정답 함수·가상 시간은 사용하지 않는다.
import assert from 'node:assert/strict';
import http from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,relative,extname,isAbsolute} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const root=fileURLToPath(new URL('../',import.meta.url));
const server=http.createServer(async(req,res)=>{
  try {
    let p=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
    const rel=relative(root,p);if(rel.startsWith('..')||isAbsolute(rel)){res.writeHead(403).end();return;}
    if(!rel)p=resolve(root,'index.html');
    res.setHeader('Content-Type',extname(p)==='.png'?'image/png':extname(p)==='.js'?'text/javascript; charset=utf-8':'text/html; charset=utf-8');
    res.end(await readFile(p));
  }catch{res.writeHead(404).end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin=`http://127.0.0.1:${server.address().port}`;
const dir=process.env.SCREENSHOT_DIR;let browser;
try {
  browser=await chromium.launch({headless:true,channel:process.env.BROWSER_CHANNEL||'chrome'});
  const context=await browser.newContext({viewport:{width:375,height:667},hasTouch:true});
  const page=await context.newPage(),errors=[],requests=[];
  page.on('pageerror',e=>{errors.push(e.stack);console.error(e.stack);});page.on('dialog',d=>d.dismiss());
  await page.route('**/*',r=>{
    if(new URL(r.request().url()).origin===origin)return r.continue();
    requests.push(r.request().url());return r.abort();
  });
  await page.goto(origin);await page.waitForFunction(()=>window.__engine);
  await page.evaluate(()=>{
    const e=window.__engine,original=e._render.bind(e);
    window.raceQA={frames:0,entered:false,exited:false,boostSeen:false,ending:false,hud:null,renderMs:[]};
    e._render=()=>{const begin=performance.now();original();const q=window.raceQA;q.frames++;
      if(e.game?.id==='g03_racing'){
        if(q.renderMs.length<600)q.renderMs.push(performance.now()-begin);
        if(e.fever.active)q.entered=true;else if(q.entered)q.exited=true;
        if(e.game.manualBoostT>0)q.boostSeen=true;if(e.game.finishing)q.ending=true;
      }
    };
    const hud=e.ui.drawHUD.bind(e.ui);
    e.ui.drawHUD=(ctx,opts)=>{window.raceQA.hud=opts.survival??null;hud(ctx,opts);};
  });
  async function start(op='mixed') {
    await page.evaluate(async op=>{
      const game=(await import('/src/games/registry.js')).getGameById('g03_racing');
      const e=window.__engine;e.game?.destroy?.();e.settings.operation=op;
      e.settings.timeScale=1;e.sound.setEnabled(false);e.sound.setMusicEnabled(false);
      e.startGame(game);
    },op);
  }
  async function assetsReady(){
    await page.waitForFunction(async()=>Object.values((await import('/src/art/raceAssets.js')).raceAssetStatus()).every(s=>s==='ready'));
  }
  async function snap(){return page.evaluate(()=>{
    const e=window.__engine,g=e.game;
    return {state:e.state,freeze:e.freeze.active,fuel:g.fuel,boost:g.manualBoostT,passed:g.gatesPassed,
      lane:g.targetLane,correct:g.gate?.correctLane,remaining:g.gate?(1-g.gate.p)*g.gate.sec:null,
      locked:g.gate?.locked,multi:!!g.gate?.multi,score:e.scoreManager.score,lives:e.scoreManager.lives,
      combo:e.scoreManager.combo,records:e.session.current.length,near:g.laneChangedThisGate&&g.raceElapsed-g.lastLaneChangeAt<=.5};
  });}
  async function steer(lane){
    for(let i=0;i<2;i++){const s=await snap();if(s.lane===lane)return;
      await page.keyboard.press(lane<s.lane?'ArrowLeft':'ArrowRight');}
  }
  async function pass(correct=true,near=false){
    await page.waitForFunction(()=>{const e=window.__engine;return e.state==='PLAYING'&&!e.freeze.active&&e.game.gate&&!e.game.gate.locked;});
    const before=await snap();const lane=correct?before.correct:(before.correct+1)%3;
    if(near){
      await steer(lane===0?1:lane-1);
      await page.waitForFunction(()=>{const g=window.__engine.game;return g.gate&&(1-g.gate.p)*g.gate.sec<=.49;},{},{polling:'raf',timeout:5000});
      assert.equal((await snap()).locked,false,'니어미스 입력 전 잠금 아님');
    }
    await steer(lane);
    // 피버 전환은 진행 중 게이트를 새 문제로 교체한다. 같은 게이트라고 가정해
    // 이전 답을 계속 유지하지 말고, 새로 보이는 답에 실제 키 입력으로 반응한다.
    const deadline=Date.now()+6000;
    while((await snap()).passed===before.passed){
      assert.ok(Date.now()<deadline,'게이트 판정 대기 시간 초과');
      const current=await snap();
      if(!current.locked&&current.correct!=null){
        await steer(correct?current.correct:(current.correct+1)%3);
      }
      await page.waitForTimeout(40);
    }
    const after=await snap();assert.equal(after.records,before.records+1);
    return {before,after};
  }
  async function shot(name){if(dir){
    // 이미지 onload/입력 직후의 이전 캔버스를 캡처하지 않도록 실제 렌더를 기다린다.
    await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
    await mkdir(dir,{recursive:true});await page.screenshot({path:resolve(dir,name+'.png')});
  }}
  async function boostTouch(){
    const p=await page.evaluate(()=>{const e=window.__engine,b=e.game._boostRect(),r=e.canvas.getBoundingClientRect();return {x:r.x+(b.x+b.w/2)*r.width/800,y:r.y+(b.y+b.h/2)*r.height/1280};});
    await page.touchscreen.tap(p.x,p.y);
  }
  async function tapAt(x,y){
    const r=await page.evaluate(()=>{const r=window.__engine.canvas.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};});
    await page.touchscreen.tap(r.x+x*r.w/800,r.y+y*r.h/1280);
  }

  let s,turn;
  if(!process.env.RACE_BOUNDARIES_ONLY){
  await start();assert.equal(await page.evaluate(()=>window.__engine.game.bestScore),null);
  await assetsReady();
  await page.keyboard.press('1');await page.evaluate(()=>window.__engine.game.fuel=60);
  await shot('race-cockpit-normal-phone');
  const lane=(await snap()).lane;await boostTouch();s=await snap();
  assert.equal(s.fuel,40);assert.equal(s.lane,lane);assert.ok(s.boost>0);
  await page.waitForTimeout(220);
  await shot('race-fuel-boost-phone');
  turn=await pass();assert.equal(turn.after.fuel,48);assert.equal(turn.after.score,150);
  await page.keyboard.press('p');const paused=await snap();
  await page.waitForTimeout(250);assert.equal((await snap()).boost,paused.boost);
  await page.keyboard.press('p');
  turn=await pass(true,true);assert.equal(turn.after.fuel,61,'정답+니어미스 13');
  turn=await pass(false);assert.equal(turn.after.fuel,36);assert.ok(turn.after.freeze);
  assert.equal(turn.after.lives,turn.before.lives);await shot('race-fuel-wrong-feedback');
  await page.waitForFunction(()=>!window.__engine.freeze.active);
  console.log('PASS actual touch booster, steering, correct, near-miss, wrong, pause/resume');

  // 같은 실제 주행에서 피버 진입/종료와 30 초과 진행까지 확인한다.
  await page.evaluate(()=>window.__engine.sound.setEnabled(true));
  while((await snap()).passed<32){
    const turn=await pass();assert.ok(turn.after.fuel>=turn.before.fuel,JSON.stringify(turn));
    if(turn.after.passed%10===0)console.log(`live gates: ${turn.after.passed}`);
  }
  s=await snap();assert.equal(s.state,'PLAYING');
  const qa=await page.evaluate(()=>window.raceQA);
  assert.ok(qa.entered&&qa.exited);assert.ok(qa.frames>600);assert.ok(qa.hud?.label==='연료');
  await shot('race-fuel-endless-tablet-before-resize');
  console.log('PASS 32 real-time gates, natural fever enter/exit, sound ON, rAF alive');
  }

  // 피버 진입을 준비한 뒤 실제 게이트/조향으로 함정을 통과한다.
  await start('divide');await page.evaluate(()=>{const e=window.__engine;e.game.fuel=60;e.fever.gain(100);});
  await page.waitForFunction(()=>window.__engine.game.gate?.multi,undefined,{timeout:5000}).catch(async err=>{console.log('fever failure snapshot',await snap(),await page.evaluate(()=>({mode:window.__engine.game.mode,qa:window.raceQA,active:window.__engine.fever.active})));throw err;});
  turn=await pass(false);assert.equal(turn.after.fuel,60);assert.equal(turn.after.combo,turn.before.combo);
  assert.equal(turn.after.freeze,false);await boostTouch();assert.equal((await snap()).fuel,40);
  turn=await pass();assert.equal(turn.after.fuel,48);
  console.log('PASS actual fever trap harmless and paid booster');

  // 자연 주행 시간은 그대로 두고 연료 경계값만 준비한다.
  await start('multiply');await page.setViewportSize({width:800,height:1280});
  await page.evaluate(()=>window.__engine.game.fuel=30);await shot('race-fuel-low30-tablet');
  assert.equal(await page.evaluate(()=>window.__engine.game.getSurvivalHUD().note),'낮음');
  await page.evaluate(()=>window.__engine.game.fuel=15);await shot('race-fuel-low15-tablet');
  assert.equal(await page.evaluate(()=>window.__engine.game.getSurvivalHUD().note),'매우 낮음');
  await page.evaluate(()=>window.__engine.game.fuel=25);
  turn=await pass(false);assert.equal(turn.after.fuel,0);assert.equal(turn.after.lives,3);
  await page.waitForTimeout(400);assert.equal((await snap()).state,'PLAYING');assert.equal((await snap()).freeze,true);
  await page.waitForFunction(()=>window.__engine.game.finishing);await shot('race-fuel-empty-banner');
  assert.equal(await page.evaluate(()=>window.__engine.game.gate),null);
  await page.waitForFunction(()=>window.__engine.state==='RESULT');await shot('race-fuel-result');
  assert.equal((await snap()).records,1);console.log('PASS fuel0 wrong feedback -> gate-count banner -> RESULT');
  await start('multiply');assert.equal((await snap()).fuel,100);assert.equal((await snap()).boost,0);
  await page.evaluate(()=>window.__engine.game.fuel=20);await boostTouch();
  await page.waitForFunction(()=>window.__engine.state==='RESULT');assert.equal((await snap()).records,0);
  console.log('PASS restart + fuel20 booster exhaustion without fake wrong record');

  // 새 1인칭 조작 영역: 화면 탭은 조향, 대시보드 탭은 조향하지 않는다.
  await start('multiply');await page.setViewportSize({width:800,height:1280});
  await tapAt(740,850);assert.equal((await snap()).lane,2);
  await tapAt(60,850);assert.equal((await snap()).lane,1);
  await tapAt(60,1130);assert.equal((await snap()).lane,1);
  await page.waitForTimeout(150);await shot('race-cockpit-normal-tablet');
  await boostTouch();await page.waitForTimeout(300);
  assert.ok(await page.evaluate(()=>window.__engine.game.boostVisual>.95));
  await shot('race-cockpit-boost-tablet');
  await page.keyboard.press('p');const visual=await page.evaluate(()=>window.__engine.game.boostVisual);
  await page.waitForTimeout(150);assert.equal(await page.evaluate(()=>window.__engine.game.boostVisual),visual);
  await page.keyboard.press('p');
  console.log('PASS cockpit touch steering, dashboard isolation, boost ramp and paused visuals');
  await page.evaluate(()=>{const e=window.__engine;e.pendingGame=e.game;e.setState('TUTORIAL');});
  await shot('race-cockpit-tutorial');await page.keyboard.press('Enter');
  assert.equal((await snap()).fuel,100);

  // 공용 HUD 수정 회귀: 전 게임의 시작 및 피버 전환을 렌더하고 하트 경로 보존 확인.
  const regression=await page.evaluate(async()=>{
    const {CATALOG,getGameById}=await import('/src/games/registry.js'),e=window.__engine,out=[];
    for(const item of CATALOG){e.game?.destroy?.();const g=getGameById(item.id);e.startGame(g);
      e._update(.016);e._render();const resource=window.raceQA.hud;
      if(g.id!=='g03_racing'&&resource!==null)throw Error('resource HUD leaked: '+g.id);
      if(e.fever){e.fever.gain(100);e._update(.016);e._render();e.fever.active=false;e._update(.016);e._render();}
      out.push(g.id);
    }return out;
  });
  assert.equal(regression.length,11);assert.deepEqual(errors,[]);
  const assetState=await page.evaluate(async()=>(await import('/src/art/raceAssets.js')).raceAssetStatus());
  assert.equal(Object.values(assetState).filter(s=>s==='ready').length,5);
  // 이미지 전부 실패해도 폴백으로 실제 입력/게이트 진행이 가능한지 별도 페이지에서 검사.
  const fallback=await context.newPage();fallback.on('pageerror',e=>errors.push(e.stack));
  await fallback.route('**/*',r=>new URL(r.request().url()).origin!==origin||r.request().url().endsWith('.png')?r.abort():r.continue());
  await fallback.goto(origin);await fallback.waitForFunction(()=>window.__engine);
  await fallback.evaluate(async()=>{const g=(await import('/src/games/registry.js')).getGameById('g03_racing');const e=window.__engine;e.settings.operation='multiply';e.startGame(g);});
  await fallback.waitForFunction(async()=>Object.values((await import('/src/art/raceAssets.js')).raceAssetStatus()).every(s=>s==='error'));
  const answerLane=await fallback.evaluate(()=>window.__engine.game.gate.correctLane);
  if(answerLane!==1)await fallback.keyboard.press(answerLane===0?'ArrowLeft':'ArrowRight');
  await fallback.waitForFunction(()=>window.__engine.game.gatesPassed>=1);
  assert.equal(await fallback.evaluate(()=>window.__engine.scoreManager.combo),1);
  if(dir)await fallback.screenshot({path:resolve(dir,'race-cockpit-images-failed.png')});
  await fallback.close();assert.deepEqual(errors,[]);
  const renderTiming=await page.evaluate(()=>{const a=window.raceQA.renderMs.sort((a,b)=>a-b);return {medianMs:a[Math.floor(a.length/2)],p95Ms:a[Math.floor(a.length*.95)]};});
  console.log('PASS five local images decoded + missing-image fallback remains playable',JSON.stringify({assetState,renderTiming}));
  console.log(JSON.stringify({regression,errors,externalRequestsBlocked:requests.length,frames:await page.evaluate(()=>window.raceQA.frames)},null,2));
} finally {await browser?.close();await new Promise(r=>server.close(r));}
