// 매 프레임 업데이트와 렌더를 함께 실행한다. 중간 성공 연출 예외를 건너뛰지 않는다.
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const browser = await chromium.launch({headless:true,...(process.env.BROWSER_CHANNEL?{channel:process.env.BROWSER_CHANNEL}:{})});
try {
  const page=await browser.newPage({viewport:{width:800,height:1280}}),errors=[];
  page.on('pageerror',e=>errors.push(e.stack));
  await page.route('**/firestore.googleapis.com/**',r=>r.abort());
  await page.addInitScript(()=>{window.requestAnimationFrame=()=>0;});
  await page.goto(process.env.BASE_URL||'http://127.0.0.1:8124/');
  await page.waitForFunction(()=>window.__engine);
  const result=await page.evaluate(async()=>{
    const e=window.__engine;
    e.startGame((await import('/src/games/registry.js')).getGameById('g06_stack'));
    const g=e.game;let catches=0,frames=0,entered=false,exited=false;
    const award=e.answerCorrect.bind(e);
    e.answerCorrect=(...args)=>{catches++;return award(...args);};
    try {
      for(;frames<5400 && e.state==='PLAYING';frames++) {
        const b=g.blocks.filter(b=>!b.resolved&&(g.multiMode?b.isMultiple:b.correct)).sort((a,b)=>b.y-a.y)[0];
        if(b)e.dispatchTouch(b.x,1000,'move');
        e._update(1/60);e._render();
        if(g.multiMode)entered=true;else if(entered)exited=true;
      }
      return {frames,catches,waves:g.waveIndex,entered,exited,state:e.state};
    }catch(err){return{frames,catches,error:err.stack};}
  });
  console.log(JSON.stringify(result,null,2));
  assert.equal(result.error,undefined);assert.equal(result.frames,5400);
  assert.ok(result.catches>=15);assert.ok(result.waves>=3);
  assert.ok(result.entered&&result.exited);assert.deepEqual(errors,[]);
}finally{await browser.close();}
