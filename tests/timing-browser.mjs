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
    await p.route('**/*',r=>new URL(r.request().url()).origin===new URL(url).origin?r.continue():r.abort());
    if(virtual)await p.addInitScript(()=>{window.requestAnimationFrame=()=>0;});
    await p.goto(url);await p.waitForFunction(()=>window.__engine);
    await p.evaluate(async()=>{const e=window.__engine;e.sound.setEnabled(false);e.startGame((await import('/src/games/registry.js')).getGameById('g04_timing'));});return p;
  }
  const p=await pageSetup(true);
  const simulated=await p.evaluate(()=>{
    const e=window.__engine,g=e.game;let entered=false,exited=false,stage=0;
    for(let i=0;i<3600;i++){
      if(i%12===0){
        const nm=g.numbers.find(n=>g.multiMode?e.fever.isMultiple(n.value):n.correct);
        if(nm){const q=g._numPos(nm);e.dispatchTouch(q.x,q.y,'start');e.dispatchTouch(q.x,q.y,'end');}
      }
      e._update(1/60);e._render();if(e.state!=='PLAYING')throw Error('Stopped '+e.state);
      if(g.multiMode)entered=true;else if(entered)exited=true;stage=Math.max(stage,e.fever.stage);
    }
    return{seconds:60,phrases:g.phrases,records:e.session.current.length,wrong:e.session.current.filter(r=>!r.correct).length,entered,exited,stage};
  });
  assert.ok(simulated.phrases>=3);assert.equal(simulated.wrong,0);assert.ok(simulated.entered&&simulated.exited);assert.equal(simulated.stage,3);
  const boundaries=await p.evaluate(()=>{
    const e=window.__engine,g=e.game;e.startGame(g);
    const tick=n=>{for(let i=0;i<n;i++){e._update(.02);e._render();}};
    const tap=n=>{const p=g._numPos(n);e.dispatchTouch(p.x,p.y,'start');e.dispatchTouch(p.x,p.y,'end');};
    g.time=.3;tap(g.numbers.find(n=>n.correct));if(e.scoreManager.score!==50)throw Error('offbeat wrong');
    const problem=g.problem,lives=e.scoreManager.lives;
    tap(g.numbers.find(n=>!n.correct));tick(75);
    if(g.problem!==problem||g.phraseHits!==1||e.scoreManager.lives!==lives-1)throw Error('wrong reset');
    g.elapsed=g.limit-.01;tick(1);if(!e.freeze.active||!e.session.current.at(-1).missed)throw Error('timeout');
    tick(75);if(g.phraseHits!==1)throw Error('timeout lost phrase');
    const normal=g.problem,elapsed=g.elapsed;e.fever.gain(100);tick(1);
    if(!g.multiMode||g.numbers.length!==8)throw Error('enter');
    const before=e.scoreManager.lives;tap(g.numbers.find(n=>!e.fever.isMultiple(n.value)));
    if(e.scoreManager.lives!==before)throw Error('fever penalty');tick(10);
    e.fever.stage=3;tick(1);if(g.numbers.some(n=>!e.fever.isMultiple(n.value)))throw Error('ultra trap');
    e.fever.active=false;tick(1);if(g.problem!==normal||g.phraseHits!==1||Math.abs(g.elapsed-elapsed-.02)>1e-6)throw Error('restore');
    const t=g.time;e.pause();tick(5);if(g.time!==t)throw Error('pause beat');e.resumeGame();tick(1);if(g.time<=t)throw Error('resume beat');
    e.scoreManager.lives=1;tap(g.numbers.find(n=>!n.correct));tick(75);if(e.state!=='RESULT')throw Error('result');
    e.startGame(g);if(g.phraseHits||g.phrases||g.time)throw Error('restart');
    for(let i=0;i<3;i++){g.time=2;tap(g.numbers.find(n=>n.correct));}
    e.ui.reset();e.particles.clear();g.note=null;e._render();
    if(g.phraseHits!==3||e.scoreManager.score!==300)throw Error('PERFECT scoring');
    return{mathVsBeat:true,wrongRetains:true,timeout:true,feverInvincible:true,ultra:true,feverRestore:true,pauseResume:true,resultRestart:true};
  });
  const dir=process.env.SCREENSHOT_DIR;if(dir){await mkdir(dir,{recursive:true});await p.screenshot({path:resolve(dir,'drum-three-phone.png')});}
  await p.evaluate(()=>{
    const e=window.__engine,g=e.game,n=g.numbers.find(n=>n.correct),q=g._numPos(n);g.time=2;
    e.dispatchTouch(q.x,q.y,'start');e.dispatchTouch(q.x,q.y,'end');e._update(.09);e._render();
    if(g.phrases!==1||e.scoreManager.score!==500||g.time!==2.09)throw Error('ensemble resets beat');
  });
  if(dir)await p.screenshot({path:resolve(dir,'drum-ensemble-phone.png')});
  await p.evaluate(()=>{const e=window.__engine;e.fever.gain(100);e._update(.02);e.ui.reset();e.particles.clear();e._render();});
  if(dir)await p.screenshot({path:resolve(dir,'drum-fever-phone.png')});
  const live=await pageSetup();let lastFrame=0,advanced=Date.now(),audio=false;const started=Date.now(),end=started+35000;let muted=false,restored=false;
  while(Date.now()<end){
    const s=await live.evaluate(()=>{const e=window.__engine,g=e.game,r=e.canvas.getBoundingClientRect();
      const n=g.numbers.find(n=>g.multiMode?e.fever.isMultiple(n.value):n.correct),p=n?g._numPos(n):null;
      return{frame:e._lastTs,state:e.state,score:e.scoreManager.score,x:p?r.x+p.x*r.width/800:null,y:p?r.y+p.y*r.height/1280:null};});
    assert.equal(s.state,'PLAYING');assert.deepEqual(errors,[]);
    if(s.frame!==lastFrame){lastFrame=s.frame;advanced=Date.now();}assert.ok(Date.now()-advanced<2000,'RAF stalled');
    if(s.x!==null)await live.mouse.click(s.x,s.y);
    if(Date.now()-started>5000&&!audio){await live.evaluate(()=>{const s=window.__engine.sound;s.setEnabled(true);s.setMusicEnabled(true);
      window.audioNodes=0;const orig=s.ctx.createOscillator.bind(s.ctx);s.ctx.createOscillator=()=>{window.audioNodes++;return orig();};});audio=true;}
    if(Date.now()-started>20000&&!muted){await live.evaluate(()=>{window.__engine.sound.setEnabled(false);window.mutedNodes=window.audioNodes;});muted=true;}
    if(Date.now()-started>23000&&!restored){assert.ok(await live.evaluate(()=>window.audioNodes===window.mutedNodes),'OFF creates audio nodes');
      await live.evaluate(()=>window.__engine.sound.setEnabled(true));restored=true;}
    await live.waitForTimeout(180);
  }
  const actual=await live.evaluate(()=>{const e=window.__engine;return{seconds:35,phrases:e.game.phrases,records:e.session.current.length,wrong:e.session.current.filter(r=>!r.correct).length,audio:e.sound.ctx?.state};});
  assert.ok(actual.phrases>=3);assert.equal(actual.wrong,0);assert.equal(actual.audio,'running');assert.ok(audio&&muted&&restored);assert.ok(await live.evaluate(()=>window.audioNodes>0));assert.deepEqual(errors,[]);
  const pausedNodes=await live.evaluate(()=>{window.__engine.pause();return window.audioNodes;});
  await live.waitForTimeout(450);
  assert.equal(await live.evaluate(()=>window.audioNodes),pausedNodes,'pause scheduled new music');
  await live.evaluate(()=>window.__engine.resumeGame());await live.waitForTimeout(800);
  assert.ok(await live.evaluate(()=>window.audioNodes)>pausedNodes,'resume missing beat');
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({simulated,boundaries,actual,audioOffAndPause:true,errors},null,2));
}finally{await browser?.close();await new Promise(r=>server.close(r));}
