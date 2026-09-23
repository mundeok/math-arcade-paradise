// Optional decorative images: no game state, random values, or collision changes.
const names = ['pancake', 'pudding', 'macaron', 'donut', 'cake', 'plate'];
const assets = new Map();

export function stackImage(name) {
  if (typeof Image === 'undefined' || !names.includes(name)) return null;
  if (!assets.has(name)) {
    const image = new Image(), entry = { image, status: 'loading' };
    assets.set(name, entry);
    image.onload = () => { entry.status = image.naturalWidth ? 'ready' : 'error'; };
    image.onerror = () => { entry.status = 'error'; };
    image.decoding = 'async';
    image.src = new URL(`./assets/stack/${name}-v1.webp`, import.meta.url).href;
  }
  const entry = assets.get(name);
  return entry.status === 'ready' ? entry.image : null;
}

export function preloadStackAssets() { names.forEach(stackImage); }
export function stackAssetStatus() {
  return Object.fromEntries(names.map(name => [name, assets.get(name)?.status ?? 'idle']));
}
