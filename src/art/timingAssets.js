const assets=new Map();
export function timingDrum(name='drum') {
  let {image,status} = assets.get(name)||{status:'idle'};
  if (typeof Image === 'undefined') return null;
  if (!image) {
    image = new Image(); status = 'loading'; image.decoding = 'async';
    const entry={image,status};assets.set(name,entry);
    image.onload = () => { entry.status = image.naturalWidth ? 'ready' : 'error'; };
    image.onerror = () => { entry.status = 'error'; };
    image.src = new URL(`./assets/timing/${name}-v1.webp`, import.meta.url).href;
  }
  return status === 'ready' ? image : null;
}
