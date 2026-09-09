// main.js — 진입점. 엔진 생성 + 씬 등록 + 초기 상태 진입.

import { Engine, STATE } from './core/engine.js';
import { menuScene } from './scenes/menuScene.js';
import { tutorialScene } from './scenes/tutorialScene.js';
import { resultScene } from './scenes/resultScene.js';
import { settingsScene } from './scenes/settingsScene.js';
import { reportScene } from './scenes/reportScene.js';
import { rankingScene } from './scenes/rankingScene.js';
import { adminScene } from './scenes/adminScene.js';

const canvas = document.getElementById('game');
const engine = new Engine(canvas);

// 씬 등록 (PLAYING/PAUSED/ORIENTATION_WARNING은 엔진이 직접 처리)
engine.registerScene('menu', menuScene);
engine.registerScene('tutorial', tutorialScene);
engine.registerScene('result', resultScene);
engine.registerScene('settings', settingsScene);
engine.registerScene('report', reportScene);
engine.registerScene('ranking', rankingScene);
engine.registerScene('admin', adminScene);

// 시작 화면 진입. ⚠️ ?admin=1 이면 관리자 화면으로(비밀번호 입력) — 메뉴엔 노출하지 않는다.
const isAdmin = new URLSearchParams(location.search).get('admin') === '1';
engine.setState(isAdmin ? STATE.ADMIN : STATE.MENU);

// 디버깅용 전역 노출 (개발 편의)
window.__engine = engine;
