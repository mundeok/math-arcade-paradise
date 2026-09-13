// 4x4 board generation and path checks, independent of rendering/engine state.
export const SIDE=4, CELLS=16;
export function adjacent(a,b){return a!==b&&Math.abs(a%SIDE-b%SIDE)<=1&&Math.abs(Math.floor(a/SIDE)-Math.floor(b/SIDE))<=1;}
const pick=a=>a[Math.floor(Math.random()*a.length)];
export function shuffle(a){for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
export function findChain(board,dan,length=5){
  function visit(path){
    if(path.length===length)return path;
    for(let i=0;i<CELLS;i++)if(board[i]?.value%dan===0&&!path.includes(i)&&adjacent(path.at(-1),i)){
      const found=visit([...path,i]);if(found)return found;
    }
    return null;
  }
  for(let i=0;i<CELLS;i++)if(board[i]?.value%dan===0){const found=visit([i]);if(found)return found;}
  return null;
}
function tile(dan,target,easy){
  const max=easy?5:9;
  const value=target?dan*(1+Math.floor(Math.random()*max)):
    pick(Array.from({length:dan*max},(_,i)=>i+1).filter(v=>v%dan!==0));
  return {value};
}
function ensurePath(board,dan,easy){
  const want=easy?8:5;
  if(findChain(board,dan,want))return {board,rearranged:false};
  for(let attempt=0;attempt<24;attempt++){
    shuffle(board);if(findChain(board,dan,want))return {board,rearranged:true};
  }
  // Bounded fallback: lay the existing targets along a connected snake.
  const targets=board.filter(b=>b.value%dan===0),traps=board.filter(b=>b.value%dan!==0);
  const snake=Array.from({length:CELLS},(_,i)=>Math.floor(i/SIDE)*SIDE+(Math.floor(i/SIDE)%2?SIDE-1-i%SIDE:i%SIDE));
  if(Math.random()<.5)snake.reverse();
  const ordered=[...targets,...traps],out=[];snake.forEach((index,i)=>{out[index]=ordered[i];});
  return {board:out,rearranged:true};
}
export function newBoard(dan,easy=false){
  const targets=easy?13:10;
  return ensurePath(shuffle(Array.from({length:CELLS},(_,i)=>tile(dan,i<targets,easy))),dan,easy).board;
}
export function refillBoard(board,removed,dan,easy=false){
  const survivors=board.filter((_,i)=>!removed.has(i));
  const needed=(easy?13:10)-survivors.filter(b=>b.value%dan===0).length;
  const incoming=shuffle(Array.from({length:removed.size},(_,i)=>tile(dan,i<needed,easy)));
  const out=[];
  for(let col=0;col<SIDE;col++){
    const kept=Array.from({length:SIDE},(_,row)=>row*SIDE+col).filter(i=>!removed.has(i)).map(i=>board[i]);
    const fill=Array.from({length:SIDE-kept.length},()=>incoming.pop());
    [...fill,...kept].forEach((b,row)=>{out[row*SIDE+col]=b;});
  }
  return ensurePath(out,dan,easy);
}
