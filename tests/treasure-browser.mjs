// 독립 서버/브라우저 프로필. 실제 입력/RAF와 경계 검사를 함께 수행하며 외부 기록 전송 차단.
import assert from 'node:assert/strict';
import http from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,relative,isAbsolute,extname} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const server=http.createServer(async(req,res)=>{try{
  let p=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
  const rel=relative(root,p);if(rel.startsWith('..')||isAbsolute(rel)){res.writeHead(403).end();return;}
  if(!rel)p=resolve(root,'index.html');
  const mime={'.js':'text/javascript','.html':'text/html','.css':'text/css','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.json':'application/json'};
  res.setHeader('Content-Type',mime[extname(p)]||'application/octet-stream');res.end(await readFile(p));
}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const url=`http://127.0.0.1:${server.address().port}/`,origin=new URL(url).origin;
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
let browser;
try{
  browser=await chromium.launch({headless:true,...(process.env.BROWSER_CHANNEL?{channel:process.env.BROWSER_CHANNEL}:{})});
  const errors=[],blocked=[];
  async function pageSetup(virtual=false){
    const p=await browser.newPage({viewport:{width:375,height:667},hasTouch:true});
    p.on('pageerror',e=>errors.push(e.stack));
    await p.route('**/*',r=>{if(new URL(r.request().url()).origin===origin)return r.continue();blocked.push(r.request().url());return r.abort();});
    if(virtual)await p.addInitScript(()=>{window.requestAnimationFrame=()=>0;});
    await p.goto(url);await p.waitForFunction(()=>window.__engine);
    await p.evaluate(async()=>{const e=window.__engine;e.sound.setEnabled(false);e.storage.set('g10_remain.oneShotSeen',true);
      e.startGame((await import('/src/games/registry.js')).getGameById('g10_remain'));});return p;
  }
  const p=await pageSetup(true);
  const boundaries=await p.evaluate(async()=>{
    const e=window.__engine,g=e.game;
    const tick=n=>{for(let i=0;i<n;i++){e._update(.02);e._render();}};
    const tap=r=>{e.dispatchTouch(r.x+r.w/2,r.y+r.h/2,'start');e.dispatchTouch(r.x+r.w/2,r.y+r.h/2,'end');};
    const force=(D,P)=>{g._nextProblem();Object.assign(g,{dividend:D,divisor:P,q:Math.floor(D/P),r:D%P,counts:Array(P).fill(0),pile:D,
      pirateBounces:Array(P).fill(0),problem:{a:D,b:P,op:'÷',answer:Math.floor(D/P),remainder:D%P||null,level:3,text:`${D} ÷ ${P}`}});};
    const fire=k=>{g._setQuantity(k??g.q);tap(g._btnDone());};
    const collect=()=>{tap(g._chestRect());tick(21);};
    e.storage.set('g10_remain.oneShotSeen',false);e.startGame(g);tick(1);
    if(g.mode!=='concept')throw Error('first instruction');
    tap(g._btnConceptClose());if(!g.practice)throw Error('practice entry');
    for(let n=0;n<3;n++){tap(g._pirateRects()[0]);while(g.pile>=g.divisor||Math.min(...g.counts)!==Math.max(...g.counts))tap(g._btnRound());collect();}
    if(e.scoreManager.score||e.session.current.length||g.cargoCount||e.fever.gauge)throw Error('practice paid');
    tap(g._btnConcept());if(g.practice||g.mode!=='play')throw Error('practice exit');
    force(17,5);
    for(let i=0;i<8;i++){g._dealRound();tap(g._pirateRects()[0]);tap(g._chestRect());tap(g._btnDone());}
    if(g.pile!==17||e.session.current.length)throw Error('no-calculation bypass');
    fire(3);const correct=g.problem,time=g.timeLeft;tick(700);
    if(g.mode!=='collect'||g.problem!==correct||g.timeLeft!==time||e.session.current.length!==1)throw Error('collect timer or record');
    tap(g._chestRect());tap(g._chestRect());tick(21);if(g.cargoCount!==1||e.session.current.length!==1)throw Error('duplicate collect');
    force(17,5);fire(2);if(g.pile!==7||g.counts.some(n=>n!==2)||!e.freeze.active)throw Error('underfire');tick(65);
    force(17,5);fire(4);if(g.pile!==17||g.counts.some(n=>n!==0)||g.failure.missing!==3)throw Error('overfire');tick(65);
    e.scoreManager.lives=3;
    force(15,5);fire(3);collect();if(g.cargoCount!==2||!g.receipt.detail.includes('0'))throw Error('zero reward');
    force(17,5);g.predictVal=3;const normal=g.problem,normalTime=g.timeLeft;
    e.fever.gain(100);tick(1);if(g.dividend>10||!g.predict||!g.savedNormal)throw Error('fever easy');
    fire(9);if(e.scoreManager.lives!==3||e.freeze.active)throw Error('fever invincibility');tick(2);
    for(const stage of [1,2,3]){e.fever.stage=stage;fire();collect();}
    fire();const easy=g.problem;e.fever.active=false;tick(1);
    if(g.problem!==easy||g.mode!=='collect')throw Error('lost correct fever pickup');
    collect();if(g.problem!==normal||g.predictVal!==3||g.flights.length||g.movingGems.length)throw Error('restore');
    if(Math.abs(g.timeLeft-(normalTime-.02))>.05)throw Error('timer restore');
    const cargo=g.cargoCount,t=g.time;e.pause();tick(10);if(g.time!==t)throw Error('pause');e.resumeGame();tick(1);if(g.time<=t)throw Error('resume');
    g.timeLeft=.001;const life=e.scoreManager.lives;tick(1);if(!e.freeze.active||e.scoreManager.lives!==life-1)throw Error('timeout');tick(65);
    if(g.cargoCount!==cargo||g.mode!=='play')throw Error('timeout lost cargo');
    e.problemGenerator.currentLevel=5;force(81,9);fire(9);tick(18);if(g.flights.some(f=>!f.landed)||g.counts.some(n=>n!==9))throw Error('long animation');collect();
    e.scoreManager.lives=1;g.timeLeft=.001;tick(66);if(e.state!=='RESULT')throw Error('result');
    e.startGame(g);if(g.cargoCount||g.flights.length||g.drag||g.receipt)throw Error('restart');
    const games=[];const {CATALOG,getGameById}=await import('/src/games/registry.js');
    e.settings.operation='multiply';
    for(const item of CATALOG){const other=getGameById(item.id);e.startGame(other);tick(1);
      e.fever?.gain(100);tick(1);if(e.fever)e.fever.active=false;tick(1);games.push(item.id);}
    e.settings.operation='divide';e.startGame(getGameById('g10_remain'));force(17,5);
    g._setQuantity(3);e._render();
    return{practiceNoRewards:true,noBypass:true,fireRecordsOnce:true,collectTimerStopped:true,underAndOver:true,zeroReward:true,
      feverStages:[1,2,3],normalBoardRestored:true,pauseResume:true,timeout:true,resultRestart:true,games};
  });
  const dir=process.env.SCREENSHOT_DIR;if(dir){await mkdir(dir,{recursive:true});await p.screenshot({path:resolve(dir,'treasure-phone.png')});}
  await p.evaluate(()=>{const e=window.__engine,g=e.game;g._fire();e._update(.16);e._render();});
  if(dir)await p.screenshot({path:resolve(dir,'treasure-collect.png')});
  await p.evaluate(()=>{const e=window.__engine;e.game._judge();e._update(.41);e.game.cargoCount=6;e._render();});
  if(dir)await p.screenshot({path:resolve(dir,'treasure-cargo.png')});
  await p.evaluate(()=>{const e=window.__engine;e.storage.set('g10_remain.oneShotSeen',false);e.startGame(e.game);e._render();});
  if(dir)await p.screenshot({path:resolve(dir,'treasure-intro.png')});
  await p.evaluate(()=>{const e=window.__engine,g=e.game,r=g._btnConceptClose();
    e.dispatchTouch(r.x+r.w/2,r.y+r.h/2,'start');e.dispatchTouch(r.x+r.w/2,r.y+r.h/2,'end');e._render();});
  if(dir)await p.screenshot({path:resolve(dir,'treasure-practice.png')});
  await p.evaluate(()=>{const e=window.__engine,g=e.game;g._leavePractice();g._nextProblem();
    Object.assign(g,{dividend:17,divisor:5,q:3,r:2,counts:Array(5).fill(0),pile:17,
      problem:{a:17,b:5,op:'÷',answer:3,remainder:2,level:3,text:'17 ÷ 5'}});
    g._setQuantity(4);const r=g._btnDone();e.dispatchTouch(r.x+r.w/2,r.y+r.h/2,'start');e._render();});
  if(dir)await p.screenshot({path:resolve(dir,'treasure-overfire.png')});
  assert.deepEqual(errors,[]);

  const live=await pageSetup();let lastFrame=0,advanced=Date.now(),audio=false,muted=false,restored=false,sawFever=false;
  const start=Date.now(),seconds=Number(process.env.LIVE_SECONDS||35),end=start+seconds*1000;
  while(Date.now()<end){
    const s=await live.evaluate(()=>{const e=window.__engine,g=e.game,r=e.canvas.getBoundingClientRect();
      const point=q=>({x:r.x+(q.x+q.w/2)*r.width/800,y:r.y+(q.y+q.h/2)*r.height/1280});
      let target=null,drag=false;
      if(g.mode==='play'){
        if(g.predictVal!==g.q) {
          const q=g._quantityRect();target={x:q.x+q.w*(g.q-1)/8,y:q.y,w:0,h:q.h};
        } else target=g._btnDone();
      } else if(g.mode==='collect'){target=g._chestRect();drag=g.cargoCount%2===0;}
      return{frame:e._lastTs,state:e.state,fever:!!e.fever?.active,target:target?point(target):null,drag,source:point(g._pileRect())};
    });
    assert.equal(s.state,'PLAYING');assert.deepEqual(errors,[]);sawFever ||=s.fever;
    if(s.frame!==lastFrame){lastFrame=s.frame;advanced=Date.now();}assert.ok(Date.now()-advanced<2000,'RAF stalled');
    if(s.target){
      if(s.drag){await live.mouse.move(s.source.x,s.source.y);await live.mouse.down();await live.mouse.move(s.target.x,s.target.y,{steps:8});await live.mouse.up();}
      else await live.touchscreen.tap(s.target.x,s.target.y);
    }
    const age=Date.now()-start;
    if(age>3000&&!audio){await live.evaluate(()=>{const s=window.__engine.sound;s.setEnabled(true);window.audioNodes=0;
      const orig=s.ctx.createOscillator.bind(s.ctx);s.ctx.createOscillator=()=>{window.audioNodes++;return orig();};});audio=true;}
    if(age>12000&&!muted){await live.evaluate(()=>{window.__engine.sound.setEnabled(false);window.mutedNodes=window.audioNodes;});muted=true;}
    if(age>15000&&!restored){assert.ok(await live.evaluate(()=>window.audioNodes===window.mutedNodes),'OFF creates audio');
      await live.evaluate(()=>window.__engine.sound.setEnabled(true));restored=true;}
    await live.waitForTimeout(140);
  }
  // 마지막 프레임이 수집 대기면 실제 탭으로 마무리해 정답 기록과 짐 개수를 비교한다.
  const pending=await live.evaluate(()=>{const e=window.__engine,g=e.game;if(g.mode!=='collect')return null;
    const c=e.canvas.getBoundingClientRect(),r=g._chestRect();return{x:c.x+(r.x+r.w/2)*c.width/800,y:c.y+(r.y+r.h/2)*c.height/1280};});
  if(pending)await live.touchscreen.tap(pending.x,pending.y);
  const actual=await live.evaluate(()=>{const e=window.__engine;return{cargo:e.game.cargoCount,records:e.session.current.length,wrong:e.session.current.filter(r=>!r.correct).length,audio:e.sound.ctx?.state};});
  assert.ok(actual.cargo>=8);assert.equal(actual.cargo,actual.records);assert.equal(actual.wrong,0);assert.equal(actual.audio,'running');assert.ok(sawFever);
  assert.ok(audio&&muted&&restored);assert.ok(await live.evaluate(()=>window.audioNodes>0));
  await live.keyboard.press('Escape');await live.waitForTimeout(200);const paused=await live.evaluate(()=>({t:window.__engine.game.time,a:window.audioNodes}));
  await live.waitForTimeout(450);assert.deepEqual(await live.evaluate(()=>({t:window.__engine.game.time,a:window.audioNodes})),paused);
  await live.keyboard.press('Escape');await live.waitForTimeout(100);assert.ok(await live.evaluate(t=>window.__engine.game.time>t,paused.t));
  await live.setViewportSize({width:800,height:1280});await live.waitForTimeout(100);
  if(dir)await live.screenshot({path:resolve(dir,'treasure-tablet.png')});
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({boundaries,actual:{...actual,seconds,sawFever,realTouchAndDrag:true,audioOffAndPause:true},errors,blockedExternalRequests:blocked.length},null,2));
}finally{await browser?.close();await new Promise(r=>server.close(r));}
