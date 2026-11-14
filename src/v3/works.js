// Works channel data: one folder per work in works/ (see works/README.md).
const FRAMES = ['console', 'portable', 'monitor'];
const TILTS = [-1.4, 0.9, -0.6, 1.2, -1];
const SAFE_HREF = /^(https:\/\/|mailto:)[^\s"'<>]+$/;
const esc = (value) => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const text = (value) => (typeof value === 'string' ? value.trim() : '');
const folderOf = (path) => path.slice(0, path.lastIndexOf('/'));

// Fit a viewport-sized picture over the visible glass in its unscaled local coordinates.
// As the glass grows past the viewport, only that visible crop must be covered.
export function fitTvPicture([cx, cy, w, h], zoom, width, height) {
  const left = Math.max(-w / 2, -cx / zoom);
  const right = Math.min(w / 2, (width - cx) / zoom);
  const top = Math.max(-h / 2, -cy / zoom);
  const bottom = Math.min(h / 2, (height - cy) / zoom);
  const scale = Math.max((right - left) / width, (bottom - top) / height);
  return { x: w / 2 + (left + right - width * scale) / 2, y: h / 2 + (top + bottom - height * scale) / 2, scale };
}

// Folder names set the channel order; a work needs a title and one preview file.
export function collectWorks(jsonModules, mediaModules) {
  const media = Object.fromEntries(Object.entries(mediaModules).map(([path, url]) => [folderOf(path), url]));
  return Object.keys(jsonModules).sort().map((path, index) => {
    const data = jsonModules[path] ?? {};
    const folder = folderOf(path);
    const title = text(data.title);
    if (!title || !media[folder]) return null;
    const href = SAFE_HREF.test(text(data.href)) ? text(data.href) : null;
    return {
      id: folder.split('/').pop(),
      title,
      summary: text(data.summary),
      tags: Array.isArray(data.tags) ? data.tags.map(text).filter(Boolean).slice(0, 5) : [],
      href,
      linkLabel: href ? text(data.linkLabel) || '開啟作品' : '',
      frame: FRAMES.includes(data.frame) ? data.frame : FRAMES[index % FRAMES.length],
      media: media[folder],
    };
  }).filter(Boolean);
}

export function renderWorks(works, frames) {
  const frameById = Object.fromEntries(frames.map((frame) => [frame.id.replace(/^tv-/, ''), frame]));
  const vars = ({ width, height, screen: { x, y, w, h } }) => `--ar:${width}/${height};--sx:${x}%;--sy:${y}%;--sw:${w}%;--sh:${h}%`;
  const set = (frame, screen) => `<span class="tv-bay"><span class="tv-set">
      <span class="tv-screen">${screen}</span>
      <img class="tv-frame" src="${frame.src}" alt="" width="${frame.width}" height="${frame.height}" loading="lazy" decoding="async" />
    </span></span>`;
  const items = works.map((work, index) => {
    const frame = frameById[work.frame];
    const tag = work.href ? 'a' : 'div';
    const external = work.href?.startsWith('https://') ? ' target="_blank" rel="noopener noreferrer"' : '';
    const link = work.href ? ` href="${esc(work.href)}"${external}` : '';
    return `<li class="tv tv--${work.frame}" style="${vars(frame)};--tilt:${TILTS[index % TILTS.length]}deg">
  <${tag} class="tv-link"${link}>
    ${set(frame, `<img src="${esc(work.media)}" alt="" loading="lazy" decoding="async" />`)}
    <span class="tv-tag">
      <strong>${esc(work.title)}</strong>
      ${work.summary ? `<span class="tv-summary">${esc(work.summary)}</span>` : ''}
      ${work.tags.length ? `<span class="tv-tags">${work.tags.map(esc).join(' · ')}</span>` : ''}
      ${work.href ? `<span class="tv-go">${esc(work.linkLabel)}<span aria-hidden="true">↗</span></span>` : ''}
    </span>
  </${tag}>
</li>`;
  });
  // The transition TV after the last work: the next frame in the cycle, and a screen that main.js feeds
  // with the next section before the works channel zooms into it.
  const exit = FRAMES[(FRAMES.indexOf(works.at(-1)?.frame) + 1) % FRAMES.length];
  items.push(`<li class="tv-exit tv--${exit}" style="${vars(frameById[exit])}" aria-hidden="true">${set(frameById[exit], '<span class="tv-feed"></span>')}</li>`);
  return items.join('');
}
