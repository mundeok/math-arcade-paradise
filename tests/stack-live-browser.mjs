// 실제 RAF/벽시계와 마우스 입력으로 연속 플레이. 내부 정답 처리 직접 호출 금지.
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const browser=await chromium.launch({headless:true,...(process.env.BROWSER_CHANNEL?{channel:process.env.BROWSER_CHANNEL}:{})});
try{
  const page=await browser.newPage({viewport:{width:375,height:667}}),errors=[];
  page.on('pageerror',e=>errors.push(e.stack));
  await page.route('**/firestore.googleapis.com/**',r=>r.abort());
  await page.goto(process.env.BASE_URL||'http://127.0.0.1:8124/');
  await page.waitForFunction(()=>window.__engine);
  await page.evaluate(async()=>{
    const e=window.__engine;
    e.settings.sound=false;e.sound.setEnabled(false);
    e.startGame((await import('/src/games/registry.js')).getGameById('g06_stack'));
    window.__testCatches=0;
    const original=e.answerCorrect.bind(e);
    e.answerCorrect=(...args)=>{window.__testCatches++;return original(...args);};
  });
  let lastFrame=-1,lastAdvance=Date.now(),soundEnabled=false;
  const deadline=Date.now()+45000;
  await page.mouse.move(187,540);await page.mouse.down();
  while(Date.now()<deadline){
    const s=await page.evaluate(()=>{
      const e=window.__engine,g=e.game,r=e.canvas.getBoundingClientRect();
      const b=g.blocks.filter(b=>!b.resolved&&(g.multiMode?b.isMultiple:b.correct)).sort((a,b)=>b.y-a.y)[0];
      return{frame:e._lastTs,state:e.state,catches:window.__testCatches,x:r.x+(b?b.x:g.towerX)*r.width/800,y:r.y+r.height*.82};
    });
    assert.deepEqual(errors,[]);assert.equal(s.state,'PLAYING');
    if(s.frame!==lastFrame){lastFrame=s.frame;lastAdvance=Date.now();}
    assert.ok(Date.now()-lastAdvance<2000,'animation loop stopped');
    await page.mouse.move(s.x,s.y);
    if(s.catches>=4&&!soundEnabled){
      await page.evaluate(()=>{const e=window.__engine;e.settings.sound=true;e.sound.setEnabled(true);});
      soundEnabled=true;
    }
    await page.waitForTimeout(100);
  }
  await page.mouse.up();
  const result=await page.evaluate(()=>({catches:window.__testCatches,waves:window.__engine.game.waveIndex,state:window.__engine.state,audio:window.__engine.sound.ctx?.state}));
  assert.ok(result.catches>=10);assert.ok(result.waves>=2);assert.equal(soundEnabled,true);
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({actualSeconds:45,...result,pageErrors:errors},null,2));
}finally{await browser.close();}
