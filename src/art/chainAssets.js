// Optional images; missing art leaves the procedural scene playable.
const files = { background: 'background-v1.webp', jellies: 'jellies-v1.webp' };
const assets = new Map();
export function chainImage(name) {
  if (typeof Image === 'undefined' || !files[name]) return null;
  if (!assets.has(name)) {
    const image = new Image(), entry = { image, status: 'loading' };
    assets.set(name, entry);
    image.onload = () => { entry.status = image.naturalWidth ? 'ready' : 'error'; };
    image.onerror = () => { entry.status = 'error'; };
    image.decoding = 'async';
    image.src = new URL(`./assets/chain/${files[name]}`, import.meta.url).href;
  }
  const entry = assets.get(name);
  return entry.status === 'ready' ? entry.image : null;
}
export function preloadChainAssets() { Object.keys(files).forEach(chainImage); }
export function chainAssetStatus() {
  return Object.fromEntries(Object.keys(files).map(n => [n, assets.get(n)?.status ?? 'idle']));
}
