// Fixed destinations require a bounded fact deck, not rejection sampling of
// nextProblem (which would consume unseen review questions). Game-local only.
export function makeDeliveryBank(settings = {}, easy = false) {
  const selected=(settings.dans || []).filter(d=>Number.isInteger(d)&&d>=2&&d<=9);
  const level=settings.fixedLevel ? Math.min(2,settings.fixedLevelValue || 1) : 1;
  let dans=selected.length ? [...new Set(selected)] : level===2 ? [6,7,8,9] : [2,3,4,5];
  if(easy && dans.some(d=>d<=5)) dans=dans.filter(d=>d<=5);
  const mode=settings.operation || 'mixed', bank=[];
  for(const d of dans) for(let b=2;b<=(easy?5:9);b++) {
    if(mode!=='divide') bank.push(fact(d,b,'×',d*b,d<=5?1:2));
    if(mode!=='multiply') bank.push(fact(d*b,d,'÷',b,d<=5?1:2));
  }
  return bank;
}
function fact(a,b,op,answer,level) {
  return {a,b,op,answer,remainder:null,level,text:`${a} ${op} ${b}`,blank:null,fromReview:false};
}
export function factKey(p) {return `${p.a}|${p.op}|${p.b}`;}
const pick=a=>a[Math.floor(Math.random()*a.length)];

export class DeliveryDeck {
  constructor(settings={}) {this.settings=settings;this.reviews=[];this.recent=[];this.served=0;this.wave=0;}
  startBatch(easy=false) {
    const all=makeDeliveryBank(this.settings,easy);
    // Alternate operations between deliveries, never mid-card. Teacher lock wins.
    const wanted=this.settings.operation==='divide'?'÷':this.settings.operation==='multiply'?'×':this.wave%2?'÷':'×';
    const review=!easy && this.reviews[0];
    const op=review?review.p.op:wanted;
    this.bank=all.filter(p=>p.op===op);
    if(review && !this.bank.some(p=>factKey(p)===factKey(review.p))) this.bank.push({...review.p});
    const answers=[...new Set(this.bank.map(p=>p.answer))];
    const varied=answers.filter(a=>this.bank.filter(p=>p.answer===a).length>=2);
    const first=review?review.p.answer:pick(varied.length>=2?varied:answers);
    let choices=answers.filter(a=>a!==first && String(a).length===String(first).length);
    if(!choices.length) choices=answers.filter(a=>a!==first);
    this.targets=Math.random()<.5?[first,pick(choices)]:[pick(choices),first];
    this.easy=easy;this.wave++;this.recent=[];
    return [...this.targets];
  }
  next() {
    this.served++;
    const due=!this.easy && this.reviews.find(r=>r.due<=this.served && this.targets.includes(r.p.answer));
    if(due) {due.due=this.served+4;return {...due.p,fromReview:true};}
    const answer=pick(this.targets);
    const pool=this.bank.filter(p=>p.answer===answer);
    const fresh=pool.filter(p=>!this.recent.includes(factKey(p)));
    const p={...pick(fresh.length?fresh:pool)};
    this.recent.push(factKey(p));if(this.recent.length>3)this.recent.shift();
    return p;
  }
  report(p,correct) {
    const key=factKey(p);
    if(correct) this.reviews=this.reviews.filter(r=>factKey(r.p)!==key);
    else {
      this.reviews=this.reviews.filter(r=>factKey(r.p)!==key);
      // Two previews may already be queued. Revisit after at least two cards.
      this.reviews.push({p:{...p},due:this.served+1});
    }
  }
}
