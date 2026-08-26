// build.js — Cloudflare Pages 정적 배포용 산출물 생성 (Phase 6 이전 임시 버전)
// 하는 일은 딱 하나: index.html 과 src/ 폴더를 dist/ 로 "내용 변경 없이" 그대로 복사한다.
// (파일 병합=단일 HTML 인라인화는 Phase 6 작업이므로 여기서 하지 않는다.)
//
// 배포에서 제외되는 것: SPEC.md, .claude/, PHASE*.md, build.js 자신.
//   → dist/ 에는 앱 구동에 필요한 것(index.html, src/)만 담기므로 문서/설정이 공개되지 않는다.
//
// Node 표준 모듈만 사용한다(외부 패키지 없음).

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const DIST = path.join(ROOT, 'dist');

// 배포에 포함할 항목(허용 목록). 여기 없는 것은 전부 제외된다.
//   → SPEC.md, .claude/, PHASE*.md, build.js 등은 자동으로 빠진다.
const INCLUDE = ['index.html', 'src'];

// 1) dist/ 초기화 (이전 산출물 잔재 제거)
fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });

// 2) 허용 목록만 dist/ 로 그대로 복사 (내용 변경 없음)
for (const name of INCLUDE) {
  const from = path.join(ROOT, name);
  const to = path.join(DIST, name);
  if (!fs.existsSync(from)) {
    console.error(`✗ 없음: ${name} (건너뜀)`);
    continue;
  }
  const stat = fs.statSync(from);
  if (stat.isDirectory()) {
    fs.cpSync(from, to, { recursive: true }); // 폴더 통째로 복사
  } else {
    fs.copyFileSync(from, to); // 파일 복사
  }
  console.log(`✓ 복사: ${name}${stat.isDirectory() ? '/' : ''}`);
}

console.log(`\n완료 → ${path.relative(ROOT, DIST)}/`);
