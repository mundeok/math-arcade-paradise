// Canvas-only toy illustrations. No assets, random calls, answers or game state.
// All geometry is in local illustration units, scaled from an L-based size.
import { L } from '../core/layout.js';
import { font, roundRect } from '../core/ui.js';
import { drawArcadeWorld } from './arcadeWorld.js';

const INK = '#24354f';
const CREAM = '#fff3d4';
const PALETTES = {
  g01_combo: ['#975334', '#432d47', '#ffcd62'],
  g02_catch: ['#297e91', '#193c61', '#60dfdc'],
  g03_racing: ['#416db0', '#263351', '#ff916e'],
  g04_timing: ['#775cb1', '#382d58', '#c5a4ff'],
  g05_match: ['#317a76', '#233f51', '#8fe7bb'],
  g06_stack: ['#976535', '#46364b', '#ffd181'],
  g07_shoot: ['#4c71a8', '#2c3655', '#92cfff'],
  g08_chain: ['#327a91', '#244357', '#7ee3f2'],
  g09_balloon: ['#a35480', '#4c2c55', '#ffb7d6'],
  g10_remain: ['#987036', '#4d3948', '#ffe186'],
  g11_farm: ['#52834e', '#284a4c', '#c6e989'],
};

function oval(c, x, y, rx, ry, color) {
  c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  c.fillStyle = color; c.fill();
}
function box(c, x, y, w, h, r, color, edge) {
  roundRect(c, x, y, w, h, r); c.fillStyle = color; c.fill();
  if (edge) { c.strokeStyle = edge; c.stroke(); }
}
function path(c, points, color, edge) {
  c.beginPath(); points.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y));
  c.closePath(); c.fillStyle = color; c.fill();
  if (edge) { c.strokeStyle = edge; c.stroke(); }
}
function line(c, points, color, width) {
  c.beginPath(); points.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y));
  c.strokeStyle = color; c.lineWidth = width; c.stroke();
}
function star(c, x, y, r, color) {
  path(c, Array.from({ length: 10 }, (_, i) => {
    const a = i * Math.PI / 5 - Math.PI / 2, d = r * (i % 2 ? .46 : 1);
    return [x + Math.cos(a) * d, y + Math.sin(a) * d];
  }), color);
}
function face(c, x, y, s = 1) {
  oval(c, x - .12 * s, y, .035 * s, .05 * s, INK);
  oval(c, x + .12 * s, y, .035 * s, .05 * s, INK);
  c.beginPath(); c.arc(x, y + .035 * s, .075 * s, .15, Math.PI - .15);
  c.lineWidth = .025 * s; c.strokeStyle = INK; c.stroke();
}
function gem(c, x, y, s) {
  path(c, [[x-s*.5,y-s*.12],[x-s*.28,y-s*.36],[x+s*.28,y-s*.36],
    [x+s*.5,y-s*.12],[x,y+s*.42]], '#49cde3', CREAM);
  path(c, [[x-s*.22,y-s*.12],[x,y+s*.42],[x+s*.22,y-s*.12]], '#148ab7');
  path(c, [[x-s*.28,y-s*.36],[x-s*.22,y-s*.12],[x+s*.22,y-s*.12],[x+s*.28,y-s*.36]], '#b4fff0');
}
function chest(c) {
  box(c, -.4, -.24, .8, .6, .1, '#b76640', INK);
  box(c, -.4, -.29, .8, .3, .1, '#efad59', INK);
  box(c, -.29, -.28, .095, .62, .03, '#ffe39b');
  box(c, .20, -.28, .095, .62, .03, '#ffe39b');
  line(c, [[-.37,.02],[.37,.02]], INK, .035);
  box(c, -.09, -.065, .18, .22, .035, '#ffe39b', INK);
  oval(c, 0, .015, .027, .04, INK);
}
function car(c) {
  box(c, -.4, -.24, .17, .36, .05, INK);
  box(c, .23, -.24, .17, .36, .05, INK);
  box(c, -.4, .22, .17, .25, .05, INK);
  box(c, .23, .22, .17, .25, .05, INK);
  box(c, -.3, -.46, .6, .98, .2, '#ff8b6b', INK);
  box(c, -.21, -.2, .42, .32, .08, INK);
  box(c, -.17, -.16, .34, .2, .05, '#9fe8f4');
  path(c, [[-.15,-.15],[.07,-.15],[-.15,.03]], '#f3fffb');
  box(c, -.24, -.39, .14, .07, .025, CREAM);
  box(c, .1, -.39, .14, .07, .025, CREAM);
  box(c, -.07, .22, .14, .24, .02, CREAM);
}

/** Paint only the existing card bounds; names, badges and input remain in menu. */
export function drawGameCard(c, id, r, active = true) {
  if (id === 'g01_delivery') id = 'g06_stack';
  c.save();
  const p = PALETTES[id] || ['#68619b', '#333451', '#c4b7ff'];
  roundRect(c, r.x, r.y, r.w, r.h, L.gu(.55)); c.clip();
  const g = c.createLinearGradient(r.x, r.y, r.x + r.w*.4, r.y + r.h);
  g.addColorStop(0, active ? p[0] : '#515969'); g.addColorStop(1, active ? p[1] : '#303948');
  c.fillStyle = g; c.fillRect(r.x, r.y, r.w, r.h);
  oval(c, r.x + r.w*.5, r.y + L.gu(1.55), L.gu(1.5), L.gu(1.25), '#ffffff0c');
  line(c, [[r.x+L.gu(.4),r.y+L.gu(.35)],[r.x+r.w-L.gu(.4),r.y+L.gu(.35)]], '#ffffff30', L.gu(.045));
  star(c, r.x+L.gu(.65), r.y+L.gu(1.65), L.gu(.15), p[2]);
  star(c, r.x+r.w-L.gu(.62), r.y+L.gu(2.2), L.gu(.1), p[2]);
  c.restore();
  c.save(); c.lineWidth = L.gu(.05);
  roundRect(c, r.x, r.y, r.w, r.h, L.gu(.55)); c.strokeStyle = p[2]+'88'; c.stroke(); c.restore();
}

/** A hand-drawn sticker. size is the full illustration box, not a hit target. */
export function drawGameIcon(c, id, x, y, size) {
  c.save(); c.translate(x, y); c.scale(size, size);
  c.lineJoin = 'round'; c.lineCap = 'round'; c.lineWidth = .045;
  oval(c, 0, .4, .43, .09, '#10203955');
  c.rotate(-.065);
  // Cream sticker rim separates the drawing from all card colours.
  box(c, -.44, -.43, .88, .85, .25, CREAM);
  c.scale(.81, .81);
  switch (id) {
    case 'g01_delivery':
      for(const [bx,col] of [[-.42,'#72bcc1'],[.08,'#af96cd']]) {
        box(c,bx,-.12,.34,.43,.045,col,INK);
        path(c,[[bx-.05,-.12],[bx+.17,-.38],[bx+.39,-.12]],col,INK);
        box(c,bx+.12,.12,.1,.19,.025,CREAM);
      }
      box(c,-.13,.13,.26,.28,.04,'#edb46e',INK);
      box(c,-.025,.13,.05,.28,.01,CREAM); break;
    case 'g01_combo':
      path(c, [[-.04,-.51],[-.4,.06],[-.08,.06],[-.19,.5],[.41,-.12],[.08,-.12],[.18,-.51]], '#ffbd47', INK);
      face(c, .005, -.005, .8); star(c, .39, -.37, .1, '#ee805c'); break;
    case 'g02_catch':
      oval(c, 0, -.2, .24, .24, '#67d7d3'); face(c, 0, -.23, .8);
      line(c, [[-.43,.05],[-.25,.34],[.25,.34],[.43,.05]], '#ef9570', .12);
      line(c, [[-.3,.12],[.3,.12]], '#ef9570', .065);
      line(c, [[-.18,.14],[-.13,.3],[.13,.3],[.18,.14]], CREAM, .025); break;
    case 'g03_racing': car(c); break;
    case 'g04_timing':
      oval(c, 0, 0, .43, .43, '#a28adf'); oval(c, 0, 0, .33, .33, '#fffae9');
      for (let i=0;i<8;i++) { const a=i*Math.PI/4; oval(c,Math.sin(a)*.27,Math.cos(a)*.27,.022,.022,INK); }
      line(c, [[-.14,.12],[0,0],[.02,-.21]], INK, .05); oval(c,0,0,.055,.055,'#ef9570');
      box(c,-.12,-.53,.24,.1,.04,'#ef9570'); break;
    case 'g05_match':
      c.rotate(-.1); box(c,-.4,-.35,.38,.67,.09,'#65c9b1',INK); c.rotate(.2);
      box(c,.02,-.3,.38,.67,.09,'#ffb471',INK);
      oval(c,-.22,-.04,.075,.075,CREAM); oval(c,.21,.04,.075,.075,CREAM);
      line(c,[[-.22,-.04],[.21,.04]],INK,.055); break;
    case 'g06_stack':
      box(c,-.4,.23,.8,.15,.06,'#64bcb6',INK);
      oval(c,-.25,.42,.095,.095,INK); oval(c,.25,.42,.095,.095,INK);
      for(const [bx,by] of [[-.31,-.08],[.015,-.08],[-.14,-.4]]) {
        box(c,bx,by,.3,.29,.035,'#edb46e',INK); box(c,bx+.12,by,.06,.29,.01,CREAM);
      } break;
    case 'g07_shoot':
      line(c,[[0,-.37],[0,-.52]],INK,.045); oval(c,0,-.53,.075,.075,'#ef9570');
      box(c,-.47,-.12,.12,.24,.04,'#6fcadf',INK); box(c,.35,-.12,.12,.24,.04,'#6fcadf',INK);
      box(c,-.36,-.34,.72,.66,.16,'#71cadd',INK);
      box(c,-.26,-.2,.52,.3,.08,INK); oval(c,-.12,-.05,.05,.07,CREAM); oval(c,.12,-.05,.05,.07,CREAM);
      box(c,-.13,.18,.26,.035,.015,CREAM); break;
    case 'g08_chain':
      line(c,[[-.29,.22],[0,-.23],[.3,.15]],'#43a7bc',.09);
      for(const [bx,by] of [[-.29,.22],[0,-.23],[.3,.15]]) {
        oval(c,bx,by,.2,.2,'#64cddd'); oval(c,bx-.05,by-.07,.065,.035,'#dcfff9');
      } break;
    case 'g09_balloon':
      for(const [bx,by,col] of [[-.25,-.1,'#b8a1ef'],[.25,-.09,'#65cfd2'],[0,-.29,'#f290b1']]) {
        line(c,[[bx,by+.15],[0,.48]],'#9888a1',.02);
        oval(c,bx,by,.21,.27,col); oval(c,bx-.065,by-.1,.045,.07,'#fff6ed');
      } break;
    case 'g10_remain': chest(c); gem(c,.26,-.34,.33); break;
    case 'g11_farm':
      box(c,-.32,.04,.64,.35,.07,'#d79766',INK);
      box(c,-.37,.005,.74,.13,.05,'#efb888',INK);
      line(c,[[0,.04],[0,-.27]],'#428a65',.055);
      oval(c,-.14,-.25,.18,.095,'#73bf7a'); oval(c,.14,-.34,.18,.105,'#a4d983');
      face(c,0,.2,.65); break;
    default:
      box(c,-.44,-.25,.88,.57,.19,'#a399d4',INK);
      line(c,[[-.3,.02],[-.1,.02]],CREAM,.06); line(c,[[-.2,-.08],[-.2,.12]],CREAM,.06);
      oval(c,.17,-.04,.055,.055,'#ffbd79'); oval(c,.28,.09,.055,.055,'#8fdfcf');
  }
  c.restore();
}

/** Glossy surface only: identical for every candidate, numbers drawn by game. */
export function drawJellySurface(c, x, y, rx, ry = rx, color = '#3186b8') {
  c.save();
  const g=c.createLinearGradient(x-rx,y-ry,x+rx*.5,y+ry);
  g.addColorStop(0,'#9ef0e8'); g.addColorStop(.22,color); g.addColorStop(1,'#224362');
  c.beginPath(); c.ellipse(x,y,rx,ry,0,0,Math.PI*2); c.fillStyle=g; c.fill();
  c.lineWidth=rx*.045; c.strokeStyle='#d4fff3bb'; c.stroke();
  c.beginPath(); c.ellipse(x,y,rx*.87,ry*.87,0,.2,Math.PI*.85);
  c.strokeStyle='#a5e9e54d'; c.lineWidth=rx*.035; c.stroke();
  oval(c,x-rx*.4,y-ry*.64,rx*.18,ry*.075,'#ffffffb0');
  oval(c,x-rx*.65,y-ry*.4,rx*.055,ry*.055,'#ffffff85');
  // A tiny expression below the number, never different for answer/trap values.
  oval(c,x-rx*.18,y+ry*.6,rx*.035,ry*.047,'#e9fff2');
  oval(c,x+rx*.18,y+ry*.6,rx*.035,ry*.047,'#e9fff2');
  c.beginPath();c.arc(x,y+ry*.64,rx*.08,0,Math.PI);
  c.strokeStyle='#e9fff2';c.lineWidth=rx*.025;c.stroke();
  c.restore();
}

/** Bevels stay on the edges so equations and feedback icons remain clear. */
export function drawTileGleam(c, r) {
  c.save();
  const pad=Math.min(L.gu(.4),r.h*.15), thick=Math.min(L.gu(.12),r.h*.035);
  box(c,r.x+pad,r.y+pad,r.w-pad*2,thick,thick/2,'#ffffff55');
  box(c,r.x+pad,r.y+r.h-pad-thick,r.w-pad*2,thick*1.5,thick/2,'#101b3740');
  oval(c,r.x+pad,r.y+r.h*.38,thick*.5,thick*.5,'#ffffff40');
  c.restore();
}

/** Shared entry retained for games that already use the toy art module. */
export function drawPlayBackdrop(c, id, time = 0) {
  drawArcadeWorld(c, id, time);
}

/** Keep reward colours readable against sky, water and scenery. */
export function drawRewardText(c, text, x, y) {
  c.save();c.strokeStyle='#293d59';c.lineWidth=L.gu(.11);c.lineJoin='round';
  c.strokeText(text,x,y);c.fillText(text,x,y);c.restore();
}

/** Same target body size as the original robot; decorative ears stay inside it. */
export function drawNumberRobot(c,x,y,r,label,alpha=1) {
  c.save(); c.globalAlpha*=alpha; c.translate(x,y); c.scale(r,r);
  c.lineJoin='round'; c.lineCap='round'; c.lineWidth=.045;
  line(c,[[0,-.7],[0,-1.3]],'#92bbd1',.07);
  oval(c,0,-1.42,.14,.14,'#ffcf79'); oval(c,-.04,-1.47,.035,.035,CREAM);
  const g=c.createLinearGradient(-.85,-.75,.85,.75); g.addColorStop(0,'#a0e5e2'); g.addColorStop(1,'#438da7');
  box(c,-.85,-.75,1.7,1.5,.35,g,'#d5fff1');
  box(c,-.7,-.5,1.4,1.08,.22,INK);
  box(c,-.51,-.67,1.02,.05,.02,'#f0ffec');
  for(const sx of [-.23,.23]) oval(c,sx,-.61,.04,.045,INK);
  for(const sx of [-.74,.74]) oval(c,sx,.43,.035,.035,'#d5fff1');
  c.font=font(.88); c.textAlign='center'; c.textBaseline='middle'; c.fillStyle='#fff8df';
  c.fillText(String(label),0,.06,1.3);
  c.restore();
}

export function drawToyLauncher(c,x,y,w,h) {
  c.save(); c.lineWidth=w*.025;
  box(c,x-w*.13,y-h*.9,w*.26,h*.86,w*.05,'#b0d8df',INK);
  box(c,x-w*.16,y-h*.9,w*.32,h*.15,w*.045,'#f1c783',INK);
  box(c,x-w*.5,y-h*.2,w,h*.7,h*.22,'#efb86b',INK);
  box(c,x-w*.4,y-h*.12,w*.8,h*.085,h*.035,'#ffe4ad');
  box(c,x-w*.23,y,w*.46,h*.32,h*.09,INK);
  oval(c,x-w*.1,y+h*.13,w*.032,w*.042,'#caffeb');
  oval(c,x+w*.1,y+h*.13,w*.032,w*.042,'#caffeb');
  c.restore();
}

export function drawTreasureChest(c,x,y,size) {
  c.save(); c.translate(x,y); c.scale(size,size); c.lineWidth=.035; c.lineJoin='round';
  chest(c); c.restore();
}
export function drawPirate(c,x,y,size) {
  c.save(); c.translate(x,y); c.scale(size,size); c.lineWidth=.035; c.lineJoin='round';
  oval(c,-.3,.02,.09,.12,'#efbb98'); oval(c,.3,.02,.09,.12,'#efbb98');
  oval(c,0,0,.31,.34,'#ffdab3');
  box(c,-.32,-.28,.64,.16,.06,'#ef8f7c');
  path(c,[[-.4,-.28],[-.23,-.4],[0,-.54],[.23,-.4],[.4,-.28]],INK);
  star(c,0,-.35,.07,'#ffdf8f');
  face(c,0,.035,1.1); oval(c,-.13,.035,.095,.075,INK);
  line(c,[[-.27,-.06],[.27,.09]],INK,.022);
  oval(c,.27,.12,.055,.06,'#ffd579');
  c.restore();
}
