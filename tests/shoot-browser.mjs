// 격리 브라우저: 프레임별 렌더 + 실제 시간/마우스/오디오 검사. 외부 기록 차단.
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const browser=await chromium.launch({headless:true,...(process.env.BROWSER_CHANNEL?{channel:process.env.BROWSER_CHANNEL}:{})});
try{
  const page=await browser.newPage({viewport:{width:375,height:667}}),errors=[];
  page.on('pageerror',e=>errors.push(e.stack));await page.route('**/firestore.googleapis.com/**',r=>r.abort());
  await page.addInitScript(()=>{window.requestAnimationFrame=()=>0;});
  const url=process.env.BASE_URL||'http://127.0.0.1:8124/';
  await page.goto(url);await page.waitForFunction(()=>window.__engine);
  const simulation=await page.evaluate(async()=>{
    const e=window.__engine;e.startGame((await import('/src/games/registry.js')).getGameById('g07_shoot'));
    const g=e.game;let frames=0,entered=false,exited=false,maxStage=0;
    for(;frames<3600&&e.state==='PLAYING';frames++){
      const en=g.enemies.find(en=>!en.judged&&(g.multiMode?en.isMultiple:en.correct)&&!g.bullets.some(b=>Math.abs(b.x-en.x)<g.enemyR));
      if(en){e.dispatchTouch(en.x,g.charY,'start');e.dispatchTouch(en.x,g.charY,'end');}
      e._update(1/60);e._render();
      if(g.multiMode)entered=true;else if(entered)exited=true;
      maxStage=Math.max(maxStage,e.fever.stage);
    }
    return{frames,cleared:g.squadsCleared,records:e.session.current.length,wrong:e.session.current.filter(r=>!r.correct).length,entered,exited,maxStage,state:e.state};
  });
  assert.equal(simulation.frames,3600);assert.ok(simulation.cleared>=2);assert.equal(simulation.wrong,0);assert.ok(simulation.entered&&simulation.exited);
  const checks=await page.evaluate(async()=>{
    const e=window.__engine,g=e.game;
    const t=g.time;e.pause();e._update(.1);e._render();if(g.time!==t)throw Error('pause');e.resumeGame();e._update(.02);if(g.time<=t)throw Error('resume');
    e.fever.active=false;g.update(0);
    const rect=e.canvas.getBoundingClientRect();
    const touch=new Touch({identifier:7,target:e.canvas,clientX:rect.left+rect.width/2,clientY:rect.top+rect.height*.86});
    e.canvas.dispatchEvent(new TouchEvent('touchstart',{touches:[touch],changedTouches:[touch],cancelable:true}));
    e.canvas.dispatchEvent(new TouchEvent('touchcancel',{touches:[],changedTouches:[touch],cancelable:true}));
    g.onTouch(400,g.charY,'end');if(g.bullets.length)throw Error('touchcancel fired');
    g.onTouch(400,g.charY,'start');window.dispatchEvent(new Event('blur'));g.onTouch(400,g.charY,'end');if(g.bullets.length)throw Error('blur fired');
    g.squadProgress=4;g._startRound();e.ui.reset();e.particles.clear();g.puffs=[];g.floatTexts=[];g.feverBanner=null;e._render();
    // 모든 새 렌더 소품은 난수를 쓰지 않고 Canvas 상태를 보존한다.
    const art=await import('/src/art/shootArt.js');const c=document.createElement('canvas');c.width=800;c.height=1280;const ctx=c.getContext('2d');
    const state=()=>JSON.stringify({fill:ctx.fillStyle,stroke:ctx.strokeStyle,alpha:ctx.globalAlpha,font:ctx.font,transform:ctx.getTransform().toJSON()});
    const before=state(),rng=Math.random;Math.random=()=>{throw Error('render RNG');};
    try{art.drawAimGuide(ctx,400,400,1000,.1);art.drawCaptainFrame(ctx,400,500,53);art.drawRobotBurst(ctx,400,500,53,.5,true);art.drawSquadStatus(ctx,4,1,false,null,0);}finally{Math.random=rng;}
    if(state()!==before)throw Error('Canvas state leak');
    const draw=ctx.fillText.bind(ctx);let scoreY=null;
    ctx.fillText=(text,x,y,...args)=>{if(String(text).startsWith('명중 +'))scoreY=y;draw(text,x,y,...args);};
    art.drawSquadStatus(ctx,4,1,false,null,0,'+1234');if(scoreY<1100)throw Error('score overlaps play field');
    return{pauseResume:true,cancelNoFire:true,artStatePreserved:true,scoreInFooter:true};
  });
  const dir=process.env.SCREENSHOT_DIR;if(dir){await mkdir(dir,{recursive:true});await page.screenshot({path:resolve(dir,'shoot-captain-phone.png')});}
  await page.evaluate(()=>{
    const e=window.__engine,g=e.game,good=g.enemies.find(en=>en.correct);
    e.dispatchTouch(good.x,g.charY,'start');e.dispatchTouch(good.x,g.charY,'end');
    for(let i=0;i<60;i++){e._update(1/60);e._render();if(g.squadsCleared>0&&g.clearEffect)break;}
  });
  if(dir)await page.screenshot({path:resolve(dir,'shoot-clear-phone.png')});
  // 마지막 오답→결과→재시작. 실제 외부 순위 요청은 위에서 차단한다.
  await page.evaluate(()=>{
    const e=window.__engine,g=e.game;e.fever.active=false;e.scoreManager.lives=1;g.multiMode=false;g._startRound();
    g._judgeWrong(g.enemies.find(en=>!en.correct));for(let i=0;i<80;i++){e._update(.02);e._render();}
    if(e.state!=='RESULT')throw Error('result stuck');e.startGame(g);e._update(.02);e._render();if(g.squadsCleared||g.squadProgress)throw Error('restart not reset');
  });
  assert.deepEqual(errors,[]);

  // 실제 RAF를 사용하는 새 페이지에서 35초 실제 클릭 플레이 (내부 판정 직접 호출 없음).
  const live=await browser.newPage({viewport:{width:375,height:667}});live.on('pageerror',e=>errors.push(e.stack));
  await live.route('**/firestore.googleapis.com/**',r=>r.abort());await live.goto(url);await live.waitForFunction(()=>window.__engine);
  await live.evaluate(async()=>{const e=window.__engine;e.sound.setEnabled(false);e.startGame((await import('/src/games/registry.js')).getGameById('g07_shoot'));});
  let lastFrame=0,lastAdvance=Date.now(),audio=false;const until=Date.now()+35000;
  while(Date.now()<until){
    const s=await live.evaluate(()=>{
      const e=window.__engine,g=e.game,r=e.canvas.getBoundingClientRect();
      const en=g.enemies.find(en=>!en.judged&&(g.multiMode?en.isMultiple:en.correct)&&!g.bullets.some(b=>Math.abs(b.x-en.x)<g.enemyR));
      return{frame:e._lastTs,state:e.state,score:e.scoreManager.score,x:en?r.x+en.x*r.width/800:null,y:r.y+g.charY*r.height/1280};
    });
    assert.deepEqual(errors,[]);assert.equal(s.state,'PLAYING');
    if(s.frame!==lastFrame){lastFrame=s.frame;lastAdvance=Date.now();}assert.ok(Date.now()-lastAdvance<2000,'RAF stopped');
    if(s.x!==null)await live.mouse.click(s.x,s.y);
    if(s.score>400&&!audio){await live.evaluate(()=>window.__engine.sound.setEnabled(true));audio=true;}
    await live.waitForTimeout(90);
  }
  const actual=await live.evaluate(()=>{const e=window.__engine;return{seconds:35,cleared:e.game.squadsCleared,records:e.session.current.length,wrong:e.session.current.filter(r=>!r.correct).length,audio:e.sound.ctx?.state};});
  assert.ok(actual.cleared>=2);assert.equal(actual.wrong,0);assert.ok(audio);assert.deepEqual(errors,[]);
  console.log(JSON.stringify({simulation,...checks,resultRestart:true,actual,pageErrors:errors},null,2));
}finally{await browser.close();}
