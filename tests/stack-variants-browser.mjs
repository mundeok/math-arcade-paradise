import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const browser=await chromium.launch({headless:true,...(process.env.BROWSER_CHANNEL?{channel:process.env.BROWSER_CHANNEL}:{})});
try{
  const page=await browser.newPage({viewport:{width:375,height:667}}),errors=[];
  page.on('pageerror',e=>errors.push(e.stack));
  await page.route('**/firestore.googleapis.com/**',r=>r.abort());
  await page.addInitScript(()=>{window.requestAnimationFrame=()=>0;});
  await page.goto(process.env.BASE_URL||'http://127.0.0.1:8124/');await page.waitForFunction(()=>window.__engine);
  const ids=['pancake','pudding','macaron','donut','cake'];
  const dir=process.env.SCREENSHOT_DIR;if(dir)await mkdir(dir,{recursive:true});
  const result=[];
  for(let k=0;k<5;k++){
    const before=await page.evaluate(async k=>{
      const e=window.__engine;
      e.startGame((await import('/src/games/registry.js')).getGameById('g06_stack'));
      const g=e.game;g.waveIndex=k;g.stacked=Array.from({length:g.target-1},(_,i)=>i+2);g.deliveredCount=g.target-1;
      g.problem={a:24,b:6,op:'÷',answer:4,text:'24 ÷ 6',blank:null,level:1};
      g.blocks=[{x:400,y:530,value:4,correct:true,age:1},{x:160,y:620,value:6,correct:false,age:1}];
      g.thud=.06;e._render();return g.dessertKind.id;
    },k);
    assert.equal(before,ids[k]);
    if(dir)await page.screenshot({path:resolve(dir,`kind-${ids[k]}.png`)});
    const transition=await page.evaluate(()=>{
      const e=window.__engine,g=e.game,old=g.dessertKind.id;
      g._catchCorrect({x:g.towerX,y:g._catchY(),value:4});
      e._render();
      return{old,finished:g.waveGlow.kind,next:g.dessertKind.id,blocks:g.blocks.length};
    });
    assert.equal(transition.finished,ids[k]);assert.equal(transition.next,ids[(k+1)%5]);assert.ok(transition.blocks>0);
    if(dir)await page.screenshot({path:resolve(dir,`finished-${ids[k]}.png`)});
    // 모든 종류의 완성 순간부터 진열 완료까지, 매 프레임 실제 엔진 렌더를 실행한다.
    await page.evaluate(()=>{const e=window.__engine;for(let i=0;i<40;i++){e._update(1/60);e._render();}});
    result.push(transition);
  }
  const invariants=await page.evaluate(async()=>{
    const {L}=await import('/src/core/layout.js');
    const art=await import('/src/art/stackDessertArt.js');
    const c=document.createElement('canvas');c.width=L.W;c.height=L.H;const ctx=c.getContext('2d');
    const original=ctx.fillText.bind(ctx);let labels=[];
    ctx.fillText=(text,...args)=>{labels.push(String(text));original(text,...args);};
    const rng=Math.random;Math.random=()=>{throw Error('render consumed RNG');};
    const unique=new Set();
    try{
      for(const kind of art.DESSERT_KINDS){
        ctx.clearRect(0,0,L.W,L.H);labels=[];
        art.drawFinishedDessert(ctx,L.W/2,L.H-L.gu(2),L.gu(5),L.gu(1.6),8,kind.id);
        if(labels.length)throw Error('finished dessert still has numeric label');
        unique.add(c.toDataURL());
        for(const n of ['4','21','999']){
          labels=[];art.drawDessert(ctx,L.gu(4),L.gu(4),L.gu(2.8),L.gu(1.4),n,L.font(.038),kind.id);
          if(labels.join()!==n)throw Error('active label lost');
        }
      }
    }finally{Math.random=rng;}
    if(unique.size!==5)throw Error('desserts not visually distinct');
    const e=window.__engine,g=e.game,t=g.time;
    e.pause();e._update(.5);e._render();if(g.time!==t)throw Error('pause advanced');
    e.resumeGame();e._update(.02);e._render();if(g.time<=t)throw Error('resume stuck');
    e.scoreManager.lives=1;
    g._miss({x:g.towerX});e._render();if(e.state!=='RESULT')throw Error('last miss failed to end');
    e.startGame(g);e._update(.02);e._render();
    if(g.dessertKind.id!=='pancake'||g.completedDesserts.length)throw Error('restart not reset');
    return{uniqueFinished:unique.size,numbersReadable:true,finishedLabelsRemoved:true,pauseResume:true,resultRestart:true};
  });
  assert.deepEqual(errors,[]);console.log(JSON.stringify({variants:result,...invariants,pageErrors:errors},null,2));
}finally{await browser.close();}
