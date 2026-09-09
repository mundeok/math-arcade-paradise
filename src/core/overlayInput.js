// overlayInput.js — 닉네임/비밀번호 입력용 HTML 오버레이 (SPEC §랭킹)
// 캔버스에는 텍스트 입력이 없으므로, 한글 IME 키보드를 띄우려면 실제 <input> 요소가 필요하다.
//   → 외부 리소스가 아니라 DOM 요소일 뿐이므로 "외부 리소스 0개" 원칙과 무관하다.
// 스타일은 전부 인라인(별도 CSS 파일 없음). 오버레이는 캔버스 위에 잠깐 떴다 사라진다.

import { validateNickname, nicknameMessage } from './nicknameFilter.js';

function el(tag, style, props) {
  const e = document.createElement(tag);
  if (style) Object.assign(e.style, style);
  if (props) Object.assign(e, props);
  return e;
}

function makeShell(titleText) {
  const overlay = el('div', {
    position: 'fixed', inset: '0', zIndex: '9999',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'rgba(10,15,25,0.72)',
    font: '16px -apple-system, "Noto Sans KR", "Malgun Gothic", sans-serif',
  });
  const box = el('div', {
    width: 'min(86vw, 460px)', boxSizing: 'border-box',
    background: '#1b2740', borderRadius: '18px', padding: '22px 20px',
    boxShadow: '0 12px 40px rgba(0,0,0,0.5)', textAlign: 'center', color: '#fff',
  });
  const title = el('div', { fontSize: '20px', fontWeight: '700', marginBottom: '14px' }, { textContent: titleText });
  box.appendChild(title);
  overlay.appendChild(box);
  return { overlay, box };
}

function bigInput(type, maxLength) {
  return el('input', {
    width: '100%', boxSizing: 'border-box', fontSize: '26px', textAlign: 'center',
    padding: '12px 10px', borderRadius: '12px', border: '2px solid #3a4a6a',
    background: '#0e1626', color: '#fff', outline: 'none',
  }, { type, maxLength: maxLength || 20, autocomplete: 'off', autocapitalize: 'off', spellcheck: false });
}

function buttonRow(box, onOk, onCancel) {
  const row = el('div', { display: 'flex', gap: '10px', marginTop: '16px' });
  const cancel = el('button', btnStyle('#33405c'), { textContent: '취소' });
  const ok = el('button', btnStyle('#3ec18f'), { textContent: '확인' });
  cancel.addEventListener('click', onCancel);
  ok.addEventListener('click', onOk);
  row.appendChild(cancel);
  row.appendChild(ok);
  box.appendChild(row);
  return { ok, cancel };
}
function btnStyle(bg) {
  return {
    flex: '1', fontSize: '18px', fontWeight: '700', color: '#fff', background: bg,
    border: 'none', borderRadius: '12px', padding: '14px 0', cursor: 'pointer',
  };
}

// 닉네임 입력. 실시간 검증(한글 2~6자·금칙어). 차단 사유는 숨기고 형식 안내만 준다.
//   반환: Promise<string|null> (확인=검증 통과한 닉, 취소/뒤=null)
export function promptNickname(defaultValue = '') {
  return new Promise((resolve) => {
    const { overlay, box } = makeShell('닉네임을 정해줘! (한글 2~6자)');
    const input = bigInput('text', 6);
    input.value = defaultValue || '';
    const msg = el('div', { minHeight: '22px', fontSize: '15px', color: '#ff9a9a', marginTop: '10px' });
    box.appendChild(input);
    box.appendChild(msg);

    let composing = false;
    const revalidate = () => {
      const r = validateNickname(input.value);
      // 조합 중(IME)엔 오류 문구를 숨겨 깜빡임을 막고, 확인 버튼만 잠근다.
      msg.textContent = r.ok || composing ? '' : nicknameMessage(r.code);
      ok.disabled = !r.ok;
      ok.style.opacity = r.ok ? '1' : '0.5';
      return r.ok;
    };
    input.addEventListener('compositionstart', () => { composing = true; });
    input.addEventListener('compositionend', () => { composing = false; revalidate(); });
    input.addEventListener('input', revalidate);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && revalidate()) submit(); });

    const cleanup = () => { try { document.body.removeChild(overlay); } catch (e) {} };
    const submit = () => { if (revalidate()) { cleanup(); resolve(input.value.trim()); } };
    const cancel = () => { cleanup(); resolve(null); };
    const { ok } = buttonRow(box, submit, cancel);

    document.body.appendChild(overlay);
    revalidate();
    try { input.focus(); } catch (e) {}
  });
}

// 비밀번호 입력(관리자). 반환: Promise<string|null>
export function promptPassword(titleText = '비밀번호를 입력하세요') {
  return new Promise((resolve) => {
    const { overlay, box } = makeShell(titleText);
    const input = bigInput('password', 32);
    box.appendChild(input);
    const cleanup = () => { try { document.body.removeChild(overlay); } catch (e) {} };
    const submit = () => { cleanup(); resolve(input.value); };
    const cancel = () => { cleanup(); resolve(null); };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
    buttonRow(box, submit, cancel);
    document.body.appendChild(overlay);
    try { input.focus(); } catch (e) {}
  });
}
