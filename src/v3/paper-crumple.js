// Canvas 2D crumpled-paper sticker. A triangle mesh covers the sticker and every triangle is textured with an
// affine setTransform + clip. Each vertex has a creased flat position, a crumpled-ball position and a radial
// delay: crumpling starts at the edges, unfolding starts at the centre and overshoots a little before settling.
// Triangles are painted far to near and shaded by their normal against the light; back faces show the paper back.
// The state { face, t, opening } is the only input, so scrolling either way paints the same frame.

const ROWS = 18;
const SPREAD = 0.42; // how far the centre leads the edges within one phase
const BALL = 0.21; // ball radius, in base sheet heights
const CREASE = 0.0075; // depth of the creases left on the flattened sheet
const SPIN = [2.4, 1.15]; // ball turn around z, then y, when fully crumpled (radians)
const DEPTH = 3.6; // perspective distance, in base sheet heights
const GROW = 0.75; // device px each clip triangle grows to cover anti-aliased seams
const BACK = '#e0d6c6';
const LIGHT = [-0.45, -0.62, 0.64].map((v, _, l) => v / Math.hypot(...l));
export const PAPER_BOX = 1.9; // canvas side, in base sheet heights

const clamp = (v) => Math.min(1, Math.max(0, v));
const smooth = (v) => v * v * (3 - 2 * v);
const backOut = (v) => { const y = v - 1; return 1 + 2.3 * y * y * y + 1.3 * y * y; };
// How flat one vertex is (r = its radial delay): crumpling reaches the edges first, unfolding the centre first.
export const flatness = (t, opening, r) => (opening
  ? backOut(clamp((t - r * SPREAD) / (1 - SPREAD)))
  : 1 - smooth(clamp((t - (1 - r) * SPREAD) / (1 - SPREAD))));

// alpha: one byte per mask pixel. The sheet is `size` base heights tall with the mask's aspect.
export function buildSheet(alpha, width, height, size, seed) {
  const rand = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const aspect = width / height;
  const unit = size / height;
  const cols = Math.max(2, Math.round(ROWS * aspect));
  let sumX = 0;
  let sumY = 0;
  let solid = 0;
  for (let i = 0; i < alpha.length; i += 1) {
    if (alpha[i] < 40) continue;
    sumX += i % width;
    sumY += Math.floor(i / width);
    solid += 1;
  }
  const cx = (sumX / solid + 0.5 - width / 2) * unit;
  const cy = (sumY / solid + 0.5 - height / 2) * unit;
  // Farthest sticker point in each direction: the outline folds to the ball's near pole.
  const bins = 64;
  const binOf = (angle) => Math.floor((angle / (2 * Math.PI) + 0.5) * bins) % bins;
  const reach = new Float32Array(bins);
  for (let i = 0; i < alpha.length; i += 1) {
    if (alpha[i] < 40) continue;
    const dx = (i % width + 0.5 - width / 2) * unit - cx;
    const dy = (Math.floor(i / width) + 0.5 - height / 2) * unit - cy;
    const bin = binOf(Math.atan2(dy, dx));
    reach[bin] = Math.max(reach[bin], Math.hypot(dx, dy));
  }
  const outline = reach.map((r, i) => Math.max(reach[(i + bins - 1) % bins], r, reach[(i + 1) % bins], unit * 4));
  const count = (cols + 1) * (ROWS + 1);
  const flat = new Float32Array(count * 3);
  const ball = new Float32Array(count * 3);
  const delay = new Float32Array(count);
  const uv = new Float32Array(count * 2);
  for (let j = 0, k = 0; j <= ROWS; j += 1) {
    for (let i = 0; i <= cols; i += 1, k += 1) {
      const x = (i / cols - 0.5) * size * aspect;
      const y = (j / ROWS - 0.5) * size;
      flat.set([x, y, (rand() - 0.5) * 2 * CREASE], k * 3);
      uv.set([i / cols, j / ROWS], k * 2);
      const angle = Math.atan2(y - cy, x - cx);
      const r = Math.min(1, Math.hypot(x - cx, y - cy) / outline[binOf(angle)]);
      delay[k] = r;
      // Centre on the far pole, outline on the near pole: the ball mostly shows the paper's back.
      const polar = Math.PI * (1 - r) + (rand() - 0.5) * 0.8;
      const azimuth = angle + (rand() - 0.5) * 0.9;
      const radius = BALL * (0.72 + rand() * 0.38);
      ball.set([cx + radius * Math.sin(polar) * Math.cos(azimuth), cy + radius * Math.sin(polar) * Math.sin(azimuth),
        radius * Math.cos(polar)], k * 3);
    }
  }
  // Cells without sticker pixels are never drawn; random diagonals keep the creases from lining up.
  const tris = [];
  for (let j = 0; j < ROWS; j += 1) {
    for (let i = 0; i < cols; i += 1) {
      let used = false;
      for (let y = Math.floor(j / ROWS * height); y < Math.ceil((j + 1) / ROWS * height) && !used; y += 1) {
        for (let x = Math.floor(i / cols * width); x < Math.ceil((i + 1) / cols * width) && !used; x += 1) {
          used = alpha[y * width + x] > 2;
        }
      }
      const a = j * (cols + 1) + i;
      const c = a + cols + 1;
      if (used) tris.push(...(rand() < 0.5 ? [a, a + 1, c, a + 1, c + 1, c] : [a, a + 1, c + 1, a, c + 1, c]));
    }
  }
  return { size, cx, cy, count, flat, ball, delay, uv, tris: Uint16Array.from(tris), extent: size * Math.max(1, aspect) };
}

// Writes the posed vertices into `out` and returns how open the whole sheet is (above 1 while overshooting).
export function posePaper(sheet, { t, opening }, out) {
  const p = clamp(t);
  const whole = opening ? backOut(p) : 1 - smooth(p);
  const turn = 1 - whole;
  const cz = Math.cos(turn * SPIN[0]);
  const sz = Math.sin(turn * SPIN[0]);
  const cy = Math.cos(turn * SPIN[1]);
  const sy = Math.sin(turn * SPIN[1]);
  const { flat, ball, delay } = sheet;
  for (let k = 0; k < sheet.count; k += 1) {
    const f = flatness(p, opening, delay[k]);
    const i = k * 3;
    const x = ball[i] + (flat[i] - ball[i]) * f - sheet.cx;
    const y = ball[i + 1] + (flat[i + 1] - ball[i + 1]) * f - sheet.cy;
    const z = ball[i + 2] + (flat[i + 2] - ball[i + 2]) * f;
    const tx = x * cz - y * sz;
    out[i] = tx * cy + z * sy + sheet.cx;
    out[i + 1] = x * sz + y * cz + sheet.cy;
    out[i + 2] = z * cy - tx * sy;
  }
  return whole;
}

const blank = (width, height) => Object.assign(document.createElement('canvas'), { width, height });

// faces: [{ src, size, seed }]; size is the sheet height relative to the base height set by resize().
export function createPaperCrumple(canvas, faces, onReady) {
  const ctx = canvas.getContext('2d');
  let sheets = [];
  let live = true;
  let base = 0;
  let ratio = 1;
  let painted = '';

  const prepare = (image, size, seed) => {
    const maskHeight = 160;
    const maskWidth = Math.round(maskHeight * image.naturalWidth / image.naturalHeight);
    const mask = blank(maskWidth, maskHeight).getContext('2d', { willReadFrequently: true });
    mask.drawImage(image, 0, 0, maskWidth, maskHeight);
    const rgba = mask.getImageData(0, 0, maskWidth, maskHeight).data;
    const sheet = buildSheet(rgba.filter((_, i) => i % 4 === 3), maskWidth, maskHeight, size, seed);
    const triangles = sheet.tris.length / 3;
    return {
      ...sheet, image, h: 0,
      out: new Float32Array(sheet.count * 3), screen: new Float32Array(sheet.count * 2),
      depth: new Float32Array(triangles), order: new Uint16Array(triangles),
    };
  };

  // Textures are redrawn at the painted size: minifying the source per triangle breaks up the ink lines.
  const texture = (sheet) => {
    const h = Math.max(16, Math.round(base * ratio * sheet.size));
    if (sheet.h === h) return;
    const w = Math.round(h * sheet.image.naturalWidth / sheet.image.naturalHeight);
    const front = blank(w, h);
    const f = front.getContext('2d');
    f.imageSmoothingQuality = 'high';
    f.drawImage(sheet.image, 0, 0, w, h);
    const tint = (colour) => {
      const tinted = blank(w, h);
      const g = tinted.getContext('2d');
      g.drawImage(front, 0, 0);
      g.globalCompositeOperation = 'source-in';
      g.fillStyle = colour;
      g.fillRect(0, 0, w, h);
      return tinted;
    };
    const dark = tint('#000');
    // The outline is drawn off-canvas so only its blurred shadow lands inside.
    const pad = Math.round(h * 0.08);
    const shadow = blank(w + pad * 2, h + pad * 2);
    const s = shadow.getContext('2d');
    s.shadowColor = '#000';
    s.shadowBlur = h * 0.03;
    s.shadowOffsetX = shadow.width;
    s.drawImage(dark, pad - shadow.width, pad);
    Object.assign(sheet, { w, h, pad, front, dark, shadow, back: tint(BACK), light: tint('#fff') });
  };

  Promise.all(faces.map(async ({ src, size, seed }) => {
    const image = new Image();
    image.src = src;
    await image.decode();
    return prepare(image, size, seed);
  })).then((ready) => {
    if (!live) return;
    sheets = ready;
    onReady();
  }).catch((error) => console.warn('Career paper stickers unavailable', error));

  function draw(state) {
    const sheet = sheets[state.face];
    const key = `${state.face} ${state.t} ${state.opening} ${canvas.width}`;
    if (!sheet || !base || key === painted) return;
    painted = key;
    texture(sheet);
    const { out, screen, tris, uv, depth, order, w, h } = sheet;
    const whole = posePaper(sheet, state, out);
    const unit = base * ratio;
    const mid = canvas.width / 2;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let k = 0; k < sheet.count; k += 1) {
      const scale = unit * DEPTH / (DEPTH - out[k * 3 + 2]);
      screen[k * 2] = mid + out[k * 3] * scale;
      screen[k * 2 + 1] = mid + out[k * 3 + 1] * scale;
    }
    // The shadow grows from a small blot under the ball into the sticker's own outline.
    const open = clamp(whole);
    const shadowX = mid + (sheet.cx + 0.03) * unit;
    const shadowY = mid + (sheet.cy + 0.055) * unit;
    if (open < 1) {
      const radius = (BALL * 1.2 + (sheet.extent * 0.4 - BALL * 1.2) * open) * unit;
      const blot = ctx.createRadialGradient(shadowX, shadowY, 0, shadowX, shadowY, radius);
      blot.addColorStop(0, 'rgba(0, 0, 0, 0.42)');
      blot.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.globalAlpha = 1 - open;
      ctx.fillStyle = blot;
      ctx.fillRect(shadowX - radius, shadowY - radius, radius * 2, radius * 2);
    }
    const shadowScale = (0.8 + 0.2 * open) * unit * sheet.size / h;
    ctx.globalAlpha = 0.32 * open * open;
    ctx.setTransform(shadowScale, 0, 0, shadowScale, shadowX, shadowY);
    ctx.drawImage(sheet.shadow, -(sheet.cx * h / sheet.size + w / 2 + sheet.pad), -(sheet.cy * h / sheet.size + h / 2 + sheet.pad));
    ctx.globalAlpha = 1;
    const count = tris.length / 3;
    for (let q = 0; q < count; q += 1) {
      order[q] = q;
      depth[q] = out[tris[q * 3] * 3 + 2] + out[tris[q * 3 + 1] * 3 + 2] + out[tris[q * 3 + 2] * 3 + 2];
    }
    order.sort((a, b) => depth[a] - depth[b]);
    for (const q of order) {
      const a = tris[q * 3];
      const b = tris[q * 3 + 1];
      const c = tris[q * 3 + 2];
      const ax = screen[a * 2];
      const ay = screen[a * 2 + 1];
      const dx1 = screen[b * 2] - ax;
      const dy1 = screen[b * 2 + 1] - ay;
      const dx2 = screen[c * 2] - ax;
      const dy2 = screen[c * 2 + 1] - ay;
      const area = dx1 * dy2 - dy1 * dx2;
      if (Math.abs(area) < 0.05) continue;
      const front = area > 0;
      // Lambert light relative to the flat sheet: creases stay faint, folds turn light or dark.
      const e1 = [out[b * 3] - out[a * 3], out[b * 3 + 1] - out[a * 3 + 1], out[b * 3 + 2] - out[a * 3 + 2]];
      const e2 = [out[c * 3] - out[a * 3], out[c * 3 + 1] - out[a * 3 + 1], out[c * 3 + 2] - out[a * 3 + 2]];
      const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
      const light = (n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2]) / (Math.hypot(...n) || 1) * (front ? 1 : -1);
      const shade = light - LIGHT[2];
      const gx = ax + (dx1 + dx2) / 3;
      const gy = ay + (dy1 + dy2) / 3;
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.beginPath();
      for (const [x, y] of [[ax, ay], [ax + dx1, ay + dy1], [ax + dx2, ay + dy2]]) {
        const d = Math.hypot(x - gx, y - gy) || 1;
        ctx.lineTo(x + (x - gx) / d * GROW, y + (y - gy) / d * GROW);
      }
      ctx.clip();
      const u0 = uv[a * 2] * w;
      const v0 = uv[a * 2 + 1] * h;
      const du1 = uv[b * 2] * w - u0;
      const dv1 = uv[b * 2 + 1] * h - v0;
      const du2 = uv[c * 2] * w - u0;
      const dv2 = uv[c * 2 + 1] * h - v0;
      const det = du1 * dv2 - du2 * dv1;
      const ma = (dx1 * dv2 - dx2 * dv1) / det;
      const mb = (dy1 * dv2 - dy2 * dv1) / det;
      const mc = (dx2 * du1 - dx1 * du2) / det;
      const md = (dy2 * du1 - dy1 * du2) / det;
      ctx.setTransform(ma, mb, mc, md, ax - ma * u0 - mc * v0, ay - mb * u0 - md * v0);
      const sx = Math.max(0, u0 + Math.min(0, du1, du2) - 2);
      const sy = Math.max(0, v0 + Math.min(0, dv1, dv2) - 2);
      const sw = Math.min(w, u0 + Math.max(0, du1, du2) + 2) - sx;
      const sh = Math.min(h, v0 + Math.max(0, dv1, dv2) + 2) - sy;
      ctx.drawImage(front ? sheet.front : sheet.back, sx, sy, sw, sh, sx, sy, sw, sh);
      const amount = shade < 0 ? Math.min(0.62, -shade * 0.95) : Math.min(0.3, shade * 0.75);
      if (amount > 0.004) {
        ctx.globalAlpha = amount;
        ctx.drawImage(shade < 0 ? sheet.dark : sheet.light, sx, sy, sw, sh, sx, sy, sw, sh);
      }
      ctx.restore();
    }
  }

  return {
    draw,
    // sheetHeight: CSS px of one base sheet height. Returns the square canvas side in CSS px.
    resize(sheetHeight) {
      base = sheetHeight;
      ratio = Math.min(devicePixelRatio || 1, 2);
      const side = Math.ceil(base * PAPER_BOX);
      canvas.style.width = canvas.style.height = `${side}px`;
      canvas.width = canvas.height = Math.round(side * ratio);
      painted = '';
      return side;
    },
    dispose() {
      live = false;
      sheets = [];
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    },
  };
}
