// Photos uploaded by the admin ("uploads/<file>") are served resized and as
// WebP by the API (/img/<width>/<file>, see ImagesController) instead of the
// multi-megabyte originals. Anything else (the bundled placeholder SVGs, a
// data URL...) is used as is.
const WIDTHS = [480, 800, 1200];

const uploadName = (url) => {
  const match = /^uploads\/([A-Za-z0-9._-]+\.(?:jpe?g|png|webp))$/i.exec(url || '');
  return match ? match[1] : null;
};

export function photoSrc(url, width = 800) {
  const name = uploadName(url);
  return name ? `/img/${width}/${name}` : `/${url}`;
}

// srcSet + sizes for responsive <img>: the browser picks the smallest file
// that is sharp enough for the space the photo actually takes.
export function photoSrcSet(url) {
  const name = uploadName(url);
  return name ? WIDTHS.map((w) => `/img/${w}/${name} ${w}w`).join(', ') : undefined;
}
