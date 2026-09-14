// 별도 로컬 서버/프로필. 자동 클릭은 난이도 평가가 아니라 진행/판정/렌더 회귀 검사다.
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
  res.setHeader('Content-Type',extname(p)==='.js'?'text/javascript; charset=utf-8':'text/html; charset=utf-8');res.end(await readFile(p));
}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const url=`http://127.0.0.1:${server.address().port}/`;
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
let browser;
try{
  browser=await chromium.launch({headless:true,...(process.env.BROWSER_CHANNEL?{channel:process.env.BROWSER_CHANNEL}:{})});
  const errors=[];
  async function pageSetup(virtual=false){
    const p=await browser.newPage({viewport:{width:375,height:667}});p.on('pageerror',e=>errors.push(e.stack));
    await p.route('**/firestore.googleapis.com/**',r=>r.abort());
    if(virtual)await p.addInitScript(()=>{window.requestAnimationFrame=()=>0;});
    await p.goto(url);await p.waitForFunction(()=>window.__engine);
    await p.evaluate(async()=>{const e=window.__engine;e.sound.setEnabled(false);e.startGame((await import('/src/games/registry.js')).getGameById('g09_balloon'));});return p;
  }
  const p=await pageSetup(true);
  const simulated=await p.evaluate(()=>{
    const e=window.__engine,g=e.game;let entered=false,exited=false,stage=0;
    for(let i=0;i<3600;i++){
      if(i%12===0){const b=g.balloons.find(b=>(g.multiMode?e.fever.isMultiple(b.value):b.correct)&&b.y>=g.playTop&&b.y<=g.playBottom);
        if(b){const preview=g.nextProblem,normal=!g.multiMode&&!e.fever.active;
          e.dispatchTouch(b.x,b.y,'start');e.dispatchTouch(b.x,b.y,'end');
          if(normal&&preview&&g.problem!==preview)throw Error('preview changed instead of promotion');}}
      e._update(1/60);e._render();if(e.state!=='PLAYING')throw Error('Stopped '+e.state);
      if(g.multiMode)entered=true;else if(entered)exited=true;stage=Math.max(stage,e.fever.stage);
    }
    return{seconds:60,bouquets:g.bouquets,records:e.session.current.length,wrong:e.session.current.filter(r=>!r.correct).length,entered,exited,stage};
  });
  assert.ok(simulated.bouquets>=3);assert.equal(simulated.wrong,0);assert.ok(simulated.entered&&simulated.exited);assert.equal(simulated.stage,3);
  const boundaries=await p.evaluate(()=>{
    const e=window.__engine,g=e.game;e.startGame(g);
    const tick=n=>{for(let i=0;i<n;i++){e._update(.02);e._render();}};
    const tap=b=>{e.dispatchTouch(b.x,b.y,'start');e.dispatchTouch(b.x,b.y,'end');};
    tap(g.balloons.find(b=>b.correct));const problem=g.problem,points=e.scoreManager.score,lives=e.scoreManager.lives;
    tap(g.balloons.find(b=>!b.correct));if(!e.freeze.active)throw Error('no feedback');tick(75);
    if(g.collected.length!==1||g.problem!==problem||e.scoreManager.lives!==lives-1||e.scoreManager.score!==points)throw Error('wrong lost bouquet');
    const anchors=g.balloons.map(b=>[b.slot,b.baseX,b.baseY]), recordsBefore=e.session.current.length;tick(300);
    if(g.collected.length!==1||e.session.current.length!==recordsBefore)throw Error('idle penalty');
    if(JSON.stringify(anchors)!==JSON.stringify(g.balloons.map(b=>[b.slot,b.baseX,b.baseY])))throw Error('anchors moved');
    e.fever.gain(100);tick(1);if(!g.multiMode)throw Error('enter');e.fever.active=false;tick(1);
    if(g.collected.length!==1||g.problem!==problem||g.savedRound!==null)throw Error('restore');
    const t=g.time;e.pause();tick(5);if(g.time!==t)throw Error('pause');e.resumeGame();tick(1);if(g.time<=t)throw Error('resume');
    e.scoreManager.lives=1;tap(g.balloons.find(b=>!b.correct));tick(75);if(e.state!=='RESULT')throw Error('result');
    e.startGame(g);tick(1);if(g.collected.length||g.bouquets)throw Error('restart');
    tap(g.balloons.find(b=>b.correct));tap(g.balloons.find(b=>b.correct));e.ui.reset();e.particles.clear();g.flights=[];e._render();
    // 학습 기록마다 다른 문제, 안내는 현재 문제보다 작은 글꼴이며 답을 미리 주지 않는다.
    const records=e.session.current.filter(r=>r.correct);if(records.length!==2)throw Error('per-problem records');
    if(records[0].question.text===records[1].question.text)throw Error('same problem repeated');
    return{wrongRetains:true,idleNoPenalty:true,feverRestores:true,pauseResume:true,resultRestart:true,perProblemRecords:true};
  });
  const dir=process.env.SCREENSHOT_DIR;if(dir){await mkdir(dir,{recursive:true});await p.screenshot({path:resolve(dir,'balloon-two-phone.png')});}
  await p.evaluate(()=>{const e=window.__engine,g=e.game;for(let i=0;i<4;i++){const b=g.balloons.find(b=>b.correct);e.dispatchTouch(b.x,b.y,'start');e.dispatchTouch(b.x,b.y,'end');}if(g.bouquets!==1||g.balloons.length!==6)throw Error('board clear');e._update(.09);e._render();});
  if(dir)await p.screenshot({path:resolve(dir,'balloon-burst-phone.png')});
  await p.evaluate(()=>{const e=window.__engine;e.fever.gain(100);e.game.update(.01);e.ui.reset();e.particles.clear();e.game.burst=null;e.game.flights=[];e._render();});
  if(dir)await p.screenshot({path:resolve(dir,'balloon-fever-phone.png')});
  assert.deepEqual(errors,[]);
  const live=await pageSetup();let lastFrame=0,advanced=Date.now(),audio=false;const end=Date.now()+35000;
  while(Date.now()<end){
    const s=await live.evaluate(()=>{const e=window.__engine,g=e.game,r=e.canvas.getBoundingClientRect();
      const b=g.balloons.find(b=>(g.multiMode?e.fever.isMultiple(b.value):b.correct)&&b.y>=g.playTop&&b.y<=g.playBottom);
      return{frame:e._lastTs,state:e.state,score:e.scoreManager.score,x:b?r.x+b.x*r.width/800:null,y:b?r.y+b.y*r.height/1280:null};});
    assert.equal(s.state,'PLAYING');assert.deepEqual(errors,[]);
    if(s.frame!==lastFrame){lastFrame=s.frame;advanced=Date.now();}assert.ok(Date.now()-advanced<2000,'RAF stalled');
    if(s.x!==null)await live.mouse.click(s.x,s.y);
    if(s.score>500&&!audio){await live.evaluate(()=>window.__engine.sound.setEnabled(true));audio=true;}
    await live.waitForTimeout(180);
  }
  const actual=await live.evaluate(()=>{const e=window.__engine;return{seconds:35,bouquets:e.game.bouquets,records:e.session.current.length,wrong:e.session.current.filter(r=>!r.correct).length,audio:e.sound.ctx?.state};});
  assert.ok(actual.bouquets>=3);assert.equal(actual.wrong,0);assert.equal(actual.audio,'running');assert.deepEqual(errors,[]);
  console.log(JSON.stringify({simulated,boundaries,actual,errors},null,2));
}finally{await browser?.close();await new Promise(r=>server.close(r));}
