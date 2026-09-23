// Optional static world art. Gameplay remains fully functional when an asset fails to load.
const FILES = { g07_shoot: 'shoot-bg-v1.webp', g04_timing: 'timing-bg-v1.webp', g11_farm: 'farm-bg-v1.webp', g05_match: 'match-bg-v1.webp', g06_stack: 'stack-bg-v1.webp', g09_balloon: 'balloon-bg-v1.webp', g10_remain: 'treasure-bg-v1.webp' };
const assets = new Map();

export function worldImage(id) {
  if (typeof Image === 'undefined' || !FILES[id]) return null;
  if (!assets.has(id)) {
    const image = new Image();
    const entry = { image, status: 'loading' };
    assets.set(id, entry);
    image.onload = () => { entry.status = image.naturalWidth ? 'ready' : 'error'; };
    image.onerror = () => { entry.status = 'error'; };
    image.decoding = 'async';
    image.src = new URL(`./assets/world/${FILES[id]}`, import.meta.url).href;
  }
  const entry = assets.get(id);
  return entry.status === 'ready' ? entry.image : null;
}

export function preloadWorldAssets() {
  Object.keys(FILES).forEach(worldImage);
}
