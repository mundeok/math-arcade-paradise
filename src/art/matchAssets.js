// Decorative sprites only. Missing assets keep the original drawing path alive.
const files = { animals: 'animals-v1.webp', cookie: 'cookie-v1.webp' };
const assets = new Map();

export function matchImage(name) {
  if (typeof Image === 'undefined' || !files[name]) return null;
  if (!assets.has(name)) {
    const image = new Image(), entry = { image, status: 'loading' };
    assets.set(name, entry);
    image.onload = () => { entry.status = image.naturalWidth ? 'ready' : 'error'; };
    image.onerror = () => { entry.status = 'error'; };
    image.decoding = 'async';
    image.src = new URL(`./assets/match/${files[name]}`, import.meta.url).href;
  }
  const entry = assets.get(name);
  return entry.status === 'ready' ? entry.image : null;
}

export function preloadMatchAssets() { Object.keys(files).forEach(matchImage); }
export function matchAssetStatus() {
  return Object.fromEntries(Object.keys(files).map(k => [k, assets.get(k)?.status ?? 'idle']));
}

// Measured on the generated sheet: rabbit ears need taller cells than puppy/cat.
const portraits = [
  [[.005, .008, .328, .267], [.332, .053, .337, .223], [.672, .045, .318, .231]],
  [[.005, .273, .328, .245], [.332, .307, .337, .213], [.672, .300, .318, .220]],
  [[.005, .517, .328, .242], [.332, .555, .337, .203], [.672, .533, .318, .226]],
  [[.005, .758, .328, .232], [.332, .780, .337, .210], [.672, .765, .318, .225]],
];

export function drawMatchAnimal(ctx, x, y, r, kind, mood, time) {
  const image = matchImage('animals');
  if (!image) return false;
  const row = { wait: 0, happy: 1, worry: 2, sad: 3 }[mood] ?? 0;
  const col = [0, 1, 2, 1, 2][kind % 5];
  const [sx, sy, sw, sh] = portraits[row][col];
  const height = r * 2.55, width = height * sw * image.naturalWidth / (sh * image.naturalHeight);
  const bob = Math.sin((time || 0) * 3) * r * .05;
  ctx.drawImage(image, sx * image.naturalWidth, sy * image.naturalHeight,
    sw * image.naturalWidth, sh * image.naturalHeight,
    x - width / 2, y - height / 2 + bob, width, height);
  return true;
}
