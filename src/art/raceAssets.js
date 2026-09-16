// g03만 사용하는 같은 출처 이미지. 파일 실패/느린 로드가 게임 진행을 막지 않는다.
const FILES = { landscape:'countryside-v1.png', dashboard:'dashboard-v1.png', wheel:'wheel-v1.png', tree:'tree-v1.png', asphalt:'asphalt-v1.png' };
const assets = new Map();
export function raceImage(name) {
  if (typeof Image === 'undefined') return null; // DOM 없는 로직 테스트/폴백.
  if (!assets.has(name)) {
    const image = new Image(), entry = { image, status:'loading' };
    assets.set(name, entry);
    image.onload = () => { entry.status = image.naturalWidth ? 'ready' : 'error'; };
    image.onerror = () => { entry.status = 'error'; };
    image.decoding = 'async';
    image.src = new URL('./assets/race/' + FILES[name], import.meta.url).href;
  }
  const entry = assets.get(name);
  return entry.status === 'ready' ? entry.image : null;
}
export function preloadRaceAssets() { Object.keys(FILES).forEach(raceImage); }
export function raceAssetStatus() {
  return Object.fromEntries(Object.keys(FILES).map(name => [name, assets.get(name)?.status ?? 'idle']));
}
