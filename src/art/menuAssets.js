// 메뉴 첫 화면에서만 사용하는 같은 출처 이미지. 실패해도 카드 메뉴는 코드 그림으로 계속 열린다.
const FILES = { hero: 'menu-hero-v1.png' };
const CARD_IDS = [
  'g01_delivery', 'g02_catch', 'g03_racing', 'g04_timing', 'g05_match', 'g06_stack',
  'g07_shoot', 'g08_chain', 'g09_balloon', 'g10_remain', 'g11_farm',
];
const assets = new Map();

export function menuImage(name) {
  if (typeof Image === 'undefined') return null;
  if (!assets.has(name)) {
    const image = new Image();
    const entry = { image, status: 'loading' };
    assets.set(name, entry);
    image.onload = () => { entry.status = image.naturalWidth ? 'ready' : 'error'; };
    image.onerror = () => { entry.status = 'error'; };
    image.decoding = 'async';
    image.src = new URL(`./assets/menu/${FILES[name]}`, import.meta.url).href;
  }
  const entry = assets.get(name);
  return entry.status === 'ready' ? entry.image : null;
}

export function preloadMenuAssets() {
  Object.keys(FILES).forEach(menuImage);
  CARD_IDS.forEach(menuCardImage);
}

export function menuCardImage(id) {
  if (typeof Image === 'undefined' || !CARD_IDS.includes(id)) return null;
  const name = `card:${id}`;
  if (!assets.has(name)) {
    const image = new Image();
    const entry = { image, status: 'loading' };
    assets.set(name, entry);
    image.onload = () => { entry.status = image.naturalWidth ? 'ready' : 'error'; };
    image.onerror = () => { entry.status = 'error'; };
    image.decoding = 'async';
    image.src = new URL(`./assets/menu/cards/${id}.png`, import.meta.url).href;
  }
  const entry = assets.get(name);
  return entry.status === 'ready' ? entry.image : null;
}

export function menuAssetStatus() {
  return Object.fromEntries(Object.keys(FILES).map(name => [name, assets.get(name)?.status ?? 'idle']));
}
