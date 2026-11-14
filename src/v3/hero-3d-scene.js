// Three.js workshop for the prototype 3D Hero (?hero=3d, docs/v3-motion-contract.md).
// Blue blueprints ride a conveyor through the fabricator's lime scan curtain and leave as the objects
// they describe. One blueprint per work follows them and prints that work's TV: CH 01 first, the later
// channels queued on its left. The belt stops with CH 01 on its works pixel, the still camera zooms in
// 2x, and the works section takes over on that frame. Its belt follows the DOM TVs' travel.
// Geometry and materials are procedural on purpose (no generated textures). Renders on demand.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { gsap } from 'gsap';

export const FOV = 30;
const ZOOM = 2; // the closing optical zoom: the whole frame grows together
const TAN = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
export const LAND_FOV = THREE.MathUtils.radToDeg(2 * Math.atan(TAN / ZOOM));
const LIME = 0xc8ff35;
const BELT_TOP = 0.62;
const BELT_START = -11;
const BELT_END = 7;
const SPACING = 1.7;
const KINDS = ['module', 'gear', 'drum', 'module', 'gear', 'drum', 'module']; // then one TV per work
const CROSS = 0.55; // CH 01's blueprint is under the scan curtain, after the About beat
const STOP = 0.84; // the belt has stopped with CH 01 on its works spot, the camera on its landing position
const DECEL = 0.1; // the belt slows down over the end of its run
const PUSH = STOP - 0.05; // the zoom starts while the belt slows, so the frame never stands still between them
const POWER = STOP - 0.12; // CH 01 switches on while the camera still approaches, as the room dims
const SCREEN_OFF = { open: 0.012, alpha: 0.2, bright: 2.6, sat: 0.3 }; // v3.css .tv-screen > img, off
const DISTANCE = 6; // landing camera to the belt's centre line
const CLEAR = 1.5; // TVs in the landing frame stand right of the fabricator's front pillar (x 1.2 to 1.4)
// Wide on the line, close on the scanner as CH 01 prints, then along with it to the landing position.
const SHOTS = [
  { at: 0, pos: [-1, 2.5, 11.5], look: [-1.4, 1, 0] },
  { at: 0.4, pos: [-0.2, 2, 8.4], look: [-1.5, 1, 0] }, // the fabricator stays right of the About copy
  { at: 0.51, pos: [0.85, 1.62, 5.6], look: [0.35, 1, 0] },
];
const SHEET = { w: 0.62, d: 0.46 };
const FRAME_PAD = 48; // room for the drop shadow v3.css puts on .tv-frame

const span = (p, from, to) => THREE.MathUtils.clamp((p - from) / (to - from), 0, 1);
const ease = (t) => THREE.MathUtils.smootherstep(t, 0, 1);
// Belt travel in full-speed progress: constant speed, then a uniform stop over DECEL.
const run = (p) => {
  const t = THREE.MathUtils.clamp(p - (STOP - DECEL), 0, DECEL);
  return Math.min(p, STOP - DECEL) + t - (t * t) / (2 * DECEL);
};

// Landing frame: a frontal camera at LAND_FOV that puts the slot exactly on CH 01's pixel centre.
export function landing(width, height, anchor, slot) {
  const perPx = (depth) => (2 * depth * TAN) / (ZOOM * height);
  const unit = perPx(slot.distance);
  const camera = [slot.x - (anchor[0] - width / 2) * unit, slot.y + (anchor[1] - height / 2) * unit, slot.z + slot.distance];
  const toWorld = (px, py, z = slot.z) => {
    const k = perPx(camera[2] - z);
    return [camera[0] + (px - width / 2) * k, camera[1] - (py - height / 2) * k, z];
  };
  return { camera, toWorld, perPx };
}

// Where the belt stops. rects are the works TVs at the pin start (CSS px, CH 01 first) and unit is
// world units per px on the belt: the TVs keep the works track's spacing, and every one inside the
// landing frame is printed and clear of the fabricator. Channels still off screen may be queued.
export function beltPlan(rects, unit) {
  const offsets = rects.map(({ cx }) => (cx - rects[0].cx) * unit);
  const land = Math.max(...rects.map(({ cx, w }, i) => (cx + w / 2 > 0 ? CLEAR + (w * unit) / 2 - offsets[i] : -Infinity)));
  return { land, offsets };
}

// A TV's cabinet spans the main body of its frame art: the rows, then the columns, that are at least
// 60% as opaque as the fullest one, so antennas, handles and feet stay flat. alpha is one byte per
// pixel; the result is in fractions of the art.
export function bodyBounds(alpha, width, height) {
  const solid = (x, y) => (alpha[y * width + x] > 128 ? 1 : 0);
  const sum = (n, at) => Array.from({ length: n }, (_, i) => at(i)).reduce((a, b) => a + b, 0);
  const wide = (counts) => {
    const min = 0.6 * Math.max(...counts);
    return [counts.findIndex((c) => c >= min), counts.findLastIndex((c) => c >= min) + 1];
  };
  const [top, bottom] = wide(Array.from({ length: height }, (_, y) => sum(width, (x) => solid(x, y))));
  const [left, right] = wide(Array.from({ length: width }, (_, x) => sum(bottom - top, (y) => solid(x, top + y))));
  return { x: left / width, y: top / height, w: (right - left) / width, h: (bottom - top) / height };
}

function canvasTexture(width, height, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(2, Math.round(width));
  canvas.height = Math.max(2, Math.round(height));
  draw(canvas.getContext('2d'), canvas.width, canvas.height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// CSS-like ellipse gradient: radii rx, ry around (cx, cy), stops as [offset, color].
function ellipseGradient(ctx, cx, cy, rx, ry, stops, width, height) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(1, ry / rx);
  const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
  stops.forEach(([offset, color]) => gradient.addColorStop(offset, color));
  ctx.fillStyle = gradient;
  ctx.fillRect(-cx, -cy * (rx / ry), width, height * (rx / ry));
  ctx.restore();
}

// Draws one works TV screen the way v3.css paints .tv-screen; state is the preview's, from the off
// line (SCREEN_OFF) to the full picture (all 1), as .tv.is-on's transition moves it.
function drawScreen(ctx, w, h, image, state, k) {
  const rx0 = 0.35 * w;
  const ry0 = 0.3 * h;
  const s = Math.hypot((0.65 * w) / rx0, (0.7 * h) / ry0);
  ctx.fillStyle = '#050707';
  ctx.fillRect(0, 0, w, h);
  ellipseGradient(ctx, 0.35 * w, 0.3 * h, rx0 * s, ry0 * s, [[0, '#1c2422'], [0.72, '#050707']], w, h);
  const iw = image?.naturalWidth ?? image?.width; // an image, or the playing preview canvas
  if (iw) {
    const ih = image.naturalHeight ?? image.height;
    const scale = Math.max(w / iw, h / ih);
    const dw = iw * scale;
    const dh = ih * scale;
    ctx.save();
    ctx.globalAlpha = state.alpha;
    ctx.filter = `brightness(${state.bright}) saturate(${state.sat})`;
    ctx.translate(0, h / 2);
    ctx.scale(1, state.open);
    ctx.drawImage(image, (w - dw) / 2, -dh / 2, dw, dh);
    ctx.restore();
  }
  const d = 0.7071 * (w + h);
  const shine = ctx.createLinearGradient(w / 2 - (0.7071 * d) / 2, h / 2 - (0.7071 * d) / 2, w / 2 + (0.7071 * d) / 2, h / 2 + (0.7071 * d) / 2);
  shine.addColorStop(0, 'rgba(255,255,255,0.16)');
  shine.addColorStop(0.36, 'rgba(255,255,255,0)');
  ctx.fillStyle = shine;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  for (let y = h - k; y >= 0; y -= 3 * k) ctx.fillRect(0, y, w, k);
  ellipseGradient(ctx, w / 2, h / 2, 0.7071 * w, 0.7071 * h, [[0.56, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0.6)']], w, h);
}

// Decodes an animated preview and plays it by its own frame delays into a canvas that replaces the
// works TV's <img>, so the 3D screen and the works TV show one continuous picture across the
// hand-off. Without ImageDecoder (or on any decode error) the <img> and its static first frame stay.
function createGifPlayer(img, onFrame) {
  if (!('ImageDecoder' in window)) return null;
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  let decoder = null;
  let count = 0;
  let index = -1;
  let clock = 0;
  let due = 0;
  let pending = false;
  let closed = false;
  const show = async (i) => {
    pending = true;
    const { image } = await decoder.decode({ frameIndex: i });
    pending = false;
    if (closed) {
      image.close();
      decoder.close();
      return;
    }
    if (canvas.width !== image.displayWidth) canvas.width = image.displayWidth;
    if (canvas.height !== image.displayHeight) canvas.height = image.displayHeight;
    canvas.getContext('2d').drawImage(image, 0, 0);
    const delay = (image.duration ?? 0) / 1000;
    due += delay > 10 ? delay : 100; // browsers play GIF delays of 10 ms or less at 100 ms
    image.close();
    if (index < 0) {
      img.after(canvas);
      img.hidden = true;
    }
    index = i;
    onFrame();
  };
  fetch(img.src)
    .then(async (response) => {
      if (!response.ok) throw Error(`HTTP ${response.status}`);
      const type = response.headers.get('content-type');
      const data = await response.arrayBuffer();
      if (closed) return;
      decoder = new ImageDecoder({ data, type });
      await Promise.all([decoder.tracks.ready, decoder.completed]);
      count = decoder.tracks.selectedTrack.frameCount;
      await show(0);
    })
    .catch((error) => console.warn('CH 01 preview stays a still frame', error));
  return {
    canvas,
    ready: () => index >= 0,
    advance(ms) {
      clock += ms;
      if (index >= 0 && count > 1 && !pending && clock >= due) show((index + 1) % count).catch((error) => console.warn('CH 01 preview stopped', error));
    },
    destroy() {
      closed = true;
      if (!pending) decoder?.close();
      canvas.remove();
      img.hidden = false;
    },
  };
}

// Blueprint line drawings of what each sheet becomes. Lines only: readable copy stays in HTML.
const DRAWINGS = {
  module(c, x, y, s) {
    const a = s * 0.9;
    const b = s * 0.45;
    const t = y - s * 0.3;
    const u = y + s * 0.3;
    c.moveTo(x, t - b); c.lineTo(x + a, t); c.lineTo(x, t + b); c.lineTo(x - a, t); c.closePath();
    c.moveTo(x - a, t); c.lineTo(x - a, u); c.lineTo(x, u + b); c.lineTo(x + a, u); c.lineTo(x + a, t);
    c.moveTo(x, t + b); c.lineTo(x, u + b);
    c.moveTo(x - a * 0.55, t); c.lineTo(x, t - b * 0.55); c.lineTo(x + a * 0.55, t); c.lineTo(x, t + b * 0.55); c.closePath();
  },
  gear(c, x, y, s) {
    const teeth = 12;
    for (let i = 0; i <= teeth * 4; i += 1) {
      const angle = (i / (teeth * 4)) * Math.PI * 2;
      const r = i % 4 < 2 ? s * 0.95 : s * 0.78;
      c[i ? 'lineTo' : 'moveTo'](x + Math.cos(angle) * r, y + Math.sin(angle) * r);
    }
    c.moveTo(x + s * 0.28, y);
    c.arc(x, y, s * 0.28, 0, Math.PI * 2);
  },
  drum(c, x, y, s) {
    const rw = s * 0.55;
    const rh = s * 0.18;
    const top = y - s * 0.75;
    const bottom = y + s * 0.75;
    c.moveTo(x + rw, top); c.ellipse(x, top, rw, rh, 0, 0, Math.PI * 2);
    c.moveTo(x - rw, top); c.lineTo(x - rw, bottom);
    c.ellipse(x, bottom, rw, rh, 0, Math.PI, 0, true);
    c.lineTo(x + rw, top);
    c.moveTo(x - rw, y); c.ellipse(x, y, rw, rh, 0, Math.PI, 0, true);
  },
  tv(c, x, y, s) {
    const w = s * 1.9;
    const h = s * 1.35;
    const left = x - w / 2;
    const top = y - h / 2;
    const knob = left + w * 0.86;
    c.roundRect(left, top, w, h, s * 0.12);
    c.roundRect(left + s * 0.14, top + s * 0.14, w * 0.66, h - s * 0.28, s * 0.14);
    for (const k of [0.3, 0.56]) { c.moveTo(knob + s * 0.11, top + h * k); c.arc(knob, top + h * k, s * 0.11, 0, Math.PI * 2); }
    for (const k of [0.74, 0.81, 0.88]) { c.moveTo(knob - s * 0.12, top + h * k); c.lineTo(knob + s * 0.12, top + h * k); }
    for (const k of [0.12, 0.88]) { c.moveTo(left + w * k, top + h); c.lineTo(left + w * k, top + h + s * 0.1); }
  },
};

function drawBlueprint(ctx, w, h, kind) {
  const paper = ctx.createLinearGradient(0, 0, w, h);
  paper.addColorStop(0, '#2259a4');
  paper.addColorStop(1, '#163e78');
  ctx.fillStyle = paper;
  ctx.fillRect(0, 0, w, h);
  const line = (x1, y1, x2, y2) => { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); };
  ctx.lineWidth = 1;
  for (let x = 16; x < w; x += 16) { ctx.strokeStyle = x % 64 ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.15)'; line(x, 0, x, h); }
  for (let y = 16; y < h; y += 16) { ctx.strokeStyle = y % 64 ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.15)'; line(0, y, w, y); }
  ctx.strokeStyle = 'rgba(236,245,255,0.92)';
  ctx.lineWidth = 3;
  ctx.strokeRect(14, 14, w - 28, h - 28);
  ctx.lineWidth = 2;
  ctx.strokeRect(w - 176, h - 70, 158, 52);
  line(w - 120, h - 70, w - 120, h - 18);
  line(w - 176, h - 44, w - 120, h - 44);
  const cx = w * 0.42;
  const cy = h * 0.46;
  const s = Math.min(w, h) * 0.28;
  ctx.lineWidth = 3;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  DRAWINGS[kind](ctx, cx, cy, s);
  ctx.stroke();
  ctx.lineWidth = 1.5;
  const dy = cy + s * 1.3;
  line(cx - s, dy, cx + s, dy);
  for (const x of [cx - s, cx + s]) line(x, dy - 8, x, dy + 8);
  line(cx + s * 1.35, cy - s * 0.7, cx + s * 1.35, cy + s * 0.7);
}

function gearGeometry() {
  const shape = new THREE.Shape();
  const teeth = 12;
  for (let i = 0; i <= teeth * 4; i += 1) {
    const angle = (i / (teeth * 4)) * Math.PI * 2;
    const r = i % 4 < 2 ? 0.25 : 0.205;
    shape[i ? 'lineTo' : 'moveTo'](Math.cos(angle) * r, Math.sin(angle) * r);
  }
  shape.holes.push(new THREE.Path().absarc(0, 0, 0.07, 0, Math.PI * 2, true));
  return new THREE.ExtrudeGeometry(shape, { depth: 0.09, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 2, curveSegments: 24 });
}

export function createWorkshop(mount, works) {
  const track = works.querySelector('[data-tv-wall]');
  const pin = works.querySelector('[data-works-pin]');
  const dpr = Math.min(devicePixelRatio, 2);
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(dpr);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap; // PCFSoftShadowMap is deprecated in three 0.185
  renderer.localClippingEnabled = true;
  mount.append(renderer.domElement);
  const anisotropy = renderer.capabilities.getMaxAnisotropy();

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x080a0b);
  scene.fog = new THREE.Fog(0x080a0b, 10, 26);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.03).texture;
  scene.environmentIntensity = 0.55;
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 80);

  let progress = 0;
  let dirty = true;
  let visible = true;
  let shown = true;
  let worksVisible = false;
  let backdrop = null;
  let shelfX = 0; // the works track's x in the frame last drawn
  let worksTravel = 0;
  let worksUnit = 0;
  let ready = false;
  const invalidate = () => { dirty = true; };
  const shelf = () => gsap.getProperty(track, 'x');
  const mesh = (geometry, material, x = 0, y = 0, z = 0, rx = 0) => {
    const object = new THREE.Mesh(geometry, material);
    object.position.set(x, y, z);
    object.rotation.x = rx;
    object.castShadow = true;
    object.receiveShadow = true;
    return object;
  };
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  const rbox = (w, h, d, r = 0.03) => new RoundedBoxGeometry(w, h, d, 3, r);

  // Light: a soft work lamp, a cool rim and the lime scan light; the room dims a little before the zoom.
  const sky = new THREE.HemisphereLight(0x3a434a, 0x050506, 0.9);
  const lamp = new THREE.SpotLight(0xffe6c7, 380, 18, 0.55, 0.7, 2);
  lamp.position.set(0.4, 6.4, 2.2);
  lamp.target.position.set(0, 0.9, 0);
  lamp.castShadow = true;
  lamp.shadow.mapSize.set(2048, 2048);
  lamp.shadow.bias = -0.0003;
  lamp.shadow.normalBias = 0.02;
  const rim = new THREE.DirectionalLight(0x9db4d6, 0.8);
  rim.position.set(-6, 4, -6);
  scene.add(sky, lamp, lamp.target, rim);

  const tiles = canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#101214';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(255,255,255,0.045)';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, w - 2, h - 2);
  });
  tiles.wrapS = THREE.RepeatWrapping;
  tiles.wrapT = THREE.RepeatWrapping;
  tiles.repeat.set(40, 30);
  tiles.anisotropy = anisotropy;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(80, 60), new THREE.MeshStandardMaterial({ map: tiles, roughness: 0.62 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  // Fabricator: machined aluminium frame, anodized base, dark glass back, lime status strips.
  const aluminum = new THREE.MeshStandardMaterial({ color: 0xc4c9ce, metalness: 1, roughness: 0.3 });
  const anodized = new THREE.MeshStandardMaterial({ color: 0x1d2023, metalness: 0.65, roughness: 0.36 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x07090a, metalness: 0.3, roughness: 0.35 });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xe3e6e9, metalness: 1, roughness: 0.12 });
  const led = new THREE.MeshStandardMaterial({ color: 0x0b0d0e, emissive: LIME, emissiveIntensity: 2.6 });
  const fabricator = new THREE.Group();
  fabricator.add(mesh(rbox(2.9, 0.34, 2.7, 0.05), anodized, 0, 0.17, 0), mesh(box(2.5, 0.022, 0.02), led, 0, 0.26, 1.355));
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) fabricator.add(mesh(rbox(0.2, 2.5, 0.2), aluminum, sx * 1.3, 1.59, sz * 1.2));
    fabricator.add(mesh(rbox(2.8, 0.2, 0.2), aluminum, 0, 2.94, sx * 1.2), mesh(rbox(0.2, 0.2, 2.6), aluminum, sx * 1.3, 2.94, 0));
    fabricator.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.3, 16), chrome, sx * 0.2, 2.72, 0, Math.PI / 2));
  }
  const head = mesh(rbox(0.56, 0.3, 0.46, 0.06), anodized, 0, 2.58, 0);
  head.add(mesh(box(0.4, 0.02, 0.01), led, 0, -0.04, 0.236));
  const emitter = mesh(box(0.04, 0.02, 1.3), led, 0, BELT_TOP + 1.56, 0);
  emitter.castShadow = false;
  fabricator.add(mesh(rbox(2.5, 2.2, 0.04, 0.015), glass, 0, 1.47, -1.16), head, mesh(rbox(0.16, 0.1, 2.4), aluminum, 0, BELT_TOP + 1.62, 0), emitter);
  scene.add(fabricator);

  // Conveyor from the far left to the drop-off, on a bed inside the fabricator.
  const beltLength = BELT_END - BELT_START;
  const beltX = (BELT_END + BELT_START) / 2;
  const rubber = canvasTexture(64, 16, (ctx, w, h) => {
    ctx.fillStyle = '#18191b';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#25282a';
    ctx.fillRect(0, 0, 8, h);
  });
  rubber.wrapS = THREE.RepeatWrapping;
  rubber.repeat.set(beltLength / 0.25, 1);
  rubber.anisotropy = anisotropy;
  const conveyor = new THREE.Group();
  conveyor.add(mesh(box(beltLength, 0.06, 1.1), new THREE.MeshStandardMaterial({ map: rubber, roughness: 0.75 }), beltX, BELT_TOP - 0.03, 0));
  for (const z of [-0.6, 0.6]) {
    conveyor.add(mesh(rbox(beltLength, 0.12, 0.06, 0.02), aluminum, beltX, BELT_TOP - 0.05, z));
    for (let x = BELT_START + 1; x <= BELT_END; x += 2.5) {
      if (Math.abs(x) > 1.6) conveyor.add(mesh(box(0.06, BELT_TOP - 0.11, 0.06), anodized, x, (BELT_TOP - 0.11) / 2, z));
    }
  }
  conveyor.add(mesh(box(2.4, 0.22, 1), anodized, 0, 0.45, 0), mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.2, 20), chrome, BELT_END, BELT_TOP - 0.04, 0, Math.PI / 2));
  scene.add(conveyor);

  // Scan curtain: a sheet is clipped away at x > 0 while what it describes grows on the other side.
  const keepLeft = new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0);
  const keepRight = new THREE.Plane(new THREE.Vector3(1, 0, 0), 0);
  const clipped = (material, plane) => Object.assign(material.clone(), { clippingPlanes: [plane], clipShadows: true });
  const sheetLight = canvasTexture(4, 256, (ctx, w, h) => {
    const fade = ctx.createLinearGradient(0, 0, 0, h);
    fade.addColorStop(0, 'rgba(255,255,255,0.95)');
    fade.addColorStop(0.2, 'rgba(255,255,255,0.32)');
    fade.addColorStop(0.85, 'rgba(255,255,255,0.12)');
    fade.addColorStop(1, 'rgba(255,255,255,0.55)');
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = fade;
    ctx.fillRect(0, 0, w, h);
  });
  const curtain = new THREE.Mesh(new THREE.PlaneGeometry(1.25, 1.55), new THREE.MeshBasicMaterial({ color: LIME, map: sheetLight, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
  curtain.rotation.y = Math.PI / 2;
  curtain.position.set(0, BELT_TOP + 0.775, 0);
  const scanLine = mesh(box(0.012, 0.004, 1.12), led, 0, BELT_TOP + 0.003, 0);
  scanLine.castShadow = false;
  const scanLight = new THREE.PointLight(LIME, 2, 4.5, 2);
  scanLight.position.set(0, BELT_TOP + 0.6, 0);
  scene.add(curtain, scanLine, scanLight);

  const faces = {};
  const paperEdge = clipped(new THREE.MeshStandardMaterial({ color: 0xc9d8ee, roughness: 0.9 }), keepLeft);
  const sheetGeometry = box(SHEET.w, 0.006, SHEET.d);
  const blueprint = (kind) => {
    if (!faces[kind]) {
      const map = canvasTexture(512, 384, (ctx, w, h) => drawBlueprint(ctx, w, h, kind));
      map.anisotropy = anisotropy;
      faces[kind] = clipped(new THREE.MeshStandardMaterial({ map, emissive: 0xffffff, emissiveMap: map, emissiveIntensity: 0.35, roughness: 0.85 }), keepLeft);
    }
    const sheet = new THREE.Mesh(sheetGeometry, [paperEdge, paperEdge, faces[kind], paperEdge, paperEdge, paperEdge]);
    sheet.position.y = 0.003;
    sheet.receiveShadow = true;
    return sheet;
  };
  const metalOut = clipped(aluminum, keepRight);
  const darkOut = clipped(anodized, keepRight);
  const ledOut = clipped(led, keepRight);
  const OUTPUTS = {
    module: [[rbox(0.6, 0.32, 0.46, 0.05), darkOut, 0, 0.16, 0], [box(0.5, 0.012, 0.36), ledOut, 0, 0.326, 0]],
    gear: [[gearGeometry(), metalOut, 0, 0.012, 0, -Math.PI / 2]],
    drum: [[new THREE.CylinderGeometry(0.19, 0.19, 0.44, 40), metalOut, 0, 0.22, 0], [new THREE.CylinderGeometry(0.196, 0.196, 0.03, 40), ledOut, 0, 0.3, 0]],
  };
  const YAW = [-0.16, 0.1, -0.05, 0.18, -0.1, 0.06, -0.12];
  const items = [];
  const item = (kind, yaw, offset) => {
    const group = new THREE.Group();
    const sheet = blueprint(kind);
    sheet.rotation.y = yaw;
    group.add(sheet);
    (OUTPUTS[kind] || []).forEach((spec) => group.add(mesh(...spec)));
    group.position.y = BELT_TOP;
    scene.add(group);
    items.push({ group, sheet, offset });
    return items.at(-1);
  };
  KINDS.forEach((kind, i) => item(kind, YAW[i], (KINDS.length - i) * SPACING));

  // Works TVs, rebuilt from the works channel's own DOM. Each one rides the belt behind its blueprint
  // and only exists past the scan plane. A cabinet cut to the art's body gives the flat frame depth;
  // it flattens while the camera turns to face the TVs, because the works DOM draws them flat.
  const flat = (options) => new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false, ...options });
  const plane = new THREE.PlaneGeometry(1, 1);
  const cabinet = clipped(new THREE.MeshStandardMaterial({ color: 0x2a241f, roughness: 0.55, metalness: 0.2 }), keepRight);
  const tvs = [...works.querySelectorAll('.tv')].map((li, index) => {
    const value = (name) => parseFloat(li.style.getPropertyValue(name)) || 0;
    const source = (url) => Object.assign(new Image(), { decoding: 'async', src: url });
    const tv = {
      index,
      bay: li.querySelector('.tv-bay'),
      set: li.querySelector('.tv-set'),
      box: { x: value('--sx'), y: value('--sy'), w: value('--sw'), h: value('--sh') },
      item: item('tv', 0, 0),
      group: new THREE.Group(),
      frame: new THREE.Mesh(plane, flat({ clippingPlanes: [keepRight] })),
      screen: new THREE.Mesh(plane, flat({ clippingPlanes: [keepRight] })),
      body: mesh(box(1, 1, 1), cabinet),
      art: source(li.querySelector('.tv-frame').getAttribute('src')),
      preview: source(li.querySelector('.tv-screen img').getAttribute('src')),
      // Canvas only ever draws a GIF's first frame, so CH 01 plays its own decoded copy.
      player: index === 0 ? createGifPlayer(li.querySelector('.tv-screen img'), () => {
        if (!shown) return; // the works TV shows the canvas itself; the 3D screen catches up on return
        screenDirty = true;
        invalidate();
      }) : null,
      size: null,
      fit: null,
      maps: {},
    };
    tv.body.castShadow = false; // the hand-off backdrop has no TVs, so they cast nothing
    tv.frame.visible = false; // until its art is painted
    tv.screen.position.z = -0.002;
    tv.screen.renderOrder = 1;
    tv.frame.renderOrder = 2;
    tv.group.add(tv.body, tv.screen, tv.frame);
    tv.item.group.add(tv.group);
    tv.art.onload = () => {
      tv.fit = measure(tv.art);
      fitBody(tv);
      paintFrame(tv);
      invalidate();
    };
    tv.preview.onload = () => { paintScreens(tv); invalidate(); };
    return tv;
  });
  // CH 01's lime halo, as .tv.is-on .tv-bay::before paints it behind the set.
  const halo = canvasTexture(256, 128, (ctx, w, h) => ellipseGradient(ctx, w / 2, h / 2, w / 2, h / 2, [[0, 'rgba(200,255,53,0.16)'], [1, 'rgba(200,255,53,0)']], w, h));
  const glow = new THREE.Mesh(plane, flat({ opacity: 0, map: halo }));
  tvs[0]?.item.group.add(glow);
  // CH 01's power state, tweened like .tv.is-on's CSS transition: the line opens up and down.
  const boot = { ...SCREEN_OFF, halo: 0 };
  let powered = false;
  let screenDirty = true;
  let bootTween = null;
  const power = (on) => {
    powered = on;
    bootTween?.kill();
    bootTween = gsap.timeline({ onUpdate: () => { screenDirty = true; invalidate(); } })
      .to(boot, { open: on ? 1 : SCREEN_OFF.open, duration: 0.42, ease: 'power3.out' }, 0)
      .to(boot, { alpha: on ? 1 : SCREEN_OFF.alpha, duration: 0.2, ease: 'none' }, 0)
      .to(boot, { bright: on ? 1 : SCREEN_OFF.bright, sat: on ? 1 : SCREEN_OFF.sat, duration: 0.6, ease: 'power1.out' }, 0)
      .to(boot, { halo: on ? 1 : 0, duration: 0.5, ease: 'none' }, 0);
  };

  function measure(image) {
    const width = 96;
    const height = Math.round((width * image.naturalHeight) / image.naturalWidth);
    const ctx = Object.assign(document.createElement('canvas'), { width, height }).getContext('2d');
    ctx.drawImage(image, 0, 0, width, height);
    return bodyBounds(ctx.getImageData(0, 0, width, height).data.filter((_, i) => i % 4 === 3), width, height);
  }

  // The cabinet stands right behind the frame, inset 1.5% so its front edges stay inside the art,
  // and half as deep as the body is tall (the belt is 1.1 deep, so it never overhangs).
  function fitBody(tv) {
    if (!tv.size || !tv.fit) return;
    const { set: [w, h], unit } = tv.size;
    const { x, y, w: bw, h: bh } = tv.fit;
    tv.depth = 0.5 * bh * h * unit;
    tv.body.scale.set((bw - 0.03) * w * unit, (bh - 0.03) * h * unit, tv.depth);
    tv.body.position.set((x + bw / 2 - 0.5) * w * unit, -(y + bh / 2 - 0.5) * h * unit, -0.005 - tv.depth / 2);
  }

  // The frame is redrawn by the browser at its display size, drop shadow included, so the landing
  // frame maps texel to pixel onto the DOM TV.
  function paintFrame(tv) {
    if (!tv.size || !tv.art.complete || !tv.art.naturalWidth) return;
    const [w, h] = tv.size.set;
    tv.frame.material.map?.dispose();
    tv.frame.material.map = canvasTexture((w + 2 * FRAME_PAD) * dpr, (h + 2 * FRAME_PAD) * dpr, (ctx) => {
      ctx.filter = `drop-shadow(0 ${16 * dpr}px ${18 * dpr}px rgba(0, 0, 0, 0.6))`;
      ctx.drawImage(tv.art, FRAME_PAD * dpr, FRAME_PAD * dpr, w * dpr, h * dpr);
    });
    tv.frame.material.needsUpdate = true;
    tv.frame.visible = true;
  }

  function paintScreens(tv) {
    if (!tv.size) return;
    const [w, h] = tv.size.screen;
    Object.values(tv.maps).forEach((map) => map.dispose());
    // CH 01's map is redrawn by update() while it boots or plays.
    tv.maps.off = canvasTexture(w * dpr, h * dpr, (ctx, cw, ch) => drawScreen(ctx, cw, ch, tv.preview, SCREEN_OFF, dpr));
    if (tv.index === 0) screenDirty = true;
    tv.screen.material.map = tv.maps.off;
    tv.screen.material.needsUpdate = true;
  }

  const land = { pos: new THREE.Vector3(), look: new THREE.Vector3() };
  let tvLand = CLEAR;
  let speed = 0;
  const layout = () => {
    const W = mount.clientWidth;
    const H = mount.clientHeight;
    if (!pin || !track || !tvs.length || !W || !H) return;
    const origin = pin.getBoundingClientRect();
    // The works pin starts with the track at its right end, on CH 01 (main.js initChannels).
    worksTravel = Math.max(0, track.offsetWidth - innerWidth);
    const shift = shelf() + worksTravel;
    const rects = tvs.map((tv) => {
      const bay = tv.bay.getBoundingClientRect();
      const style = getComputedStyle(tv.set);
      const h = parseFloat(style.height);
      return { cx: bay.left - shift - origin.left + bay.width / 2, cy: bay.bottom - origin.top - h / 2, w: parseFloat(style.width), h, bayW: bay.width, bayH: bay.height };
    });
    const unit = (2 * DISTANCE * TAN) / (ZOOM * H);
    worksUnit = unit;
    const plan = beltPlan(rects, unit);
    tvLand = plan.land;
    speed = tvLand / (run(STOP) - CROSS);
    const frame = landing(W, H, [rects[0].cx, rects[0].cy], { x: tvLand, y: BELT_TOP + (rects[0].h * unit) / 2, z: 0, distance: DISTANCE });
    land.pos.fromArray(frame.camera);
    land.look.set(frame.camera[0], frame.camera[1], frame.camera[2] - 1);
    tvs.forEach((tv, i) => {
      const { w, h } = rects[i];
      const sheet = (w * unit) / SHEET.w; // the blueprint matches the TV's footprint
      tv.item.offset = plan.offsets[i];
      tv.item.sheet.scale.set(sheet, 1, sheet);
      tv.group.position.y = (h * unit) / 2;
      tv.frame.scale.set((w + 2 * FRAME_PAD) * unit, (h + 2 * FRAME_PAD) * unit, 1);
      const sw = ((tv.box.w + 1.2) / 100) * w;
      const sh = ((tv.box.h + 1.2) / 100) * h;
      tv.screen.scale.set(sw * unit, sh * unit, 1);
      tv.screen.position.x = (((tv.box.x - 0.6) / 100) * w + sw / 2 - w / 2) * unit;
      tv.screen.position.y = -(((tv.box.y - 0.6) / 100) * h + sh / 2 - h / 2) * unit;
      tv.size = { set: [w, h], screen: [sw, sh], unit };
      fitBody(tv);
      paintFrame(tv);
      paintScreens(tv);
    });
    const { bayW, bayH } = rects[0];
    glow.position.set(0, 0.58 * bayH * unit, -0.01);
    glow.scale.set(1.5 * bayW * unit, bayH * unit, 1);
    invalidate();
  };

  const camPos = new THREE.Vector3();
  const camLook = new THREE.Vector3();
  const next = new THREE.Vector3();
  const pointer = { x: 0, y: 0 };
  const update = () => {
    const p = progress;
    const last = SHOTS.at(-1);
    if (p < last.at) {
      const i = SHOTS.findIndex((shot) => shot.at > p) - 1;
      const [from, to] = [SHOTS[i], SHOTS[i + 1]];
      const t = ease(span(p, from.at, to.at));
      camPos.fromArray(from.pos).lerp(next.fromArray(to.pos), t);
      camLook.fromArray(from.look).lerp(next.fromArray(to.look), t);
    } else {
      const t = ease(span(p, last.at, STOP));
      camPos.fromArray(last.pos).lerp(land.pos, t);
      camLook.fromArray(last.look).lerp(land.look, t);
    }
    const sway = 1 - span(p, 0.6, STOP);
    camera.position.set(camPos.x + pointer.x * 0.4 * sway, camPos.y - pointer.y * 0.22 * sway, camPos.z);
    camera.lookAt(camLook);
    // The lens pushes in from PUSH; from STOP the camera stands still, so everything grows together.
    // No held landing frame or long quintic tail: the first reverse step already pulls the view back.
    const zoom = THREE.MathUtils.smoothstep(p, PUSH, 1);
    camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(TAN / ZOOM ** zoom));
    camera.updateProjectionMatrix();

    // The works shelf is this belt running on, so the belt stands as far ahead as the DOM track is from
    // its start: under the works TVs, and under the stage while the track's scrub still glides home.
    shelfX = shelf();
    const ahead = (shelfX + worksTravel) * worksUnit;
    const belt = speed * run(p);
    const behind = speed * run(STOP) - belt;
    let crossing = 0;
    items.forEach(({ group, offset }) => {
      const printed = tvLand + offset - behind;
      const x = printed + ahead;
      const s = THREE.MathUtils.smoothstep(BELT_END - 0.2 - x, 0, 0.8);
      group.position.x = x;
      group.visible = s > 0;
      group.scale.setScalar(Math.max(s, 0.0001));
      crossing = Math.max(crossing, 1 - Math.min(1, Math.abs(printed) / 0.7)); // the scanner only runs in the hero
    });
    rubber.offset.x = -((belt + ahead) / beltLength) * rubber.repeat.x;
    head.position.z = Math.sin(belt * 1.6) * 0.38;
    curtain.material.opacity = 0.25 + 0.45 * crossing;
    scanLight.intensity = 1.5 + 9 * crossing;
    // While the camera reaches its landing position, the room dims a little and the TVs come up to the
    // works brightness, so the zoom itself changes nothing but scale.
    const settle = ease(span(p, STOP - 0.12, STOP));
    lamp.intensity = 380 * (1 - 0.45 * settle);
    sky.intensity = 0.9 * (1 - 0.4 * settle);
    const lit = 0.72 + 0.28 * settle;
    tvs.forEach((tv) => {
      tv.frame.material.color.setScalar(lit);
      tv.screen.material.color.setScalar(lit);
      // Nothing behind the flat frames once the camera faces them, so the hand-off loses no depth.
      tv.body.visible = Boolean(tv.depth) && settle < 1;
      if (!tv.body.visible) return;
      tv.body.scale.z = tv.depth * (1 - settle);
      tv.body.position.z = -0.005 - tv.body.scale.z / 2;
    });
    const [first] = tvs;
    if (first?.maps.off && screenDirty) {
      const { image } = first.maps.off;
      drawScreen(image.getContext('2d'), image.width, image.height, first.player?.ready() ? first.player.canvas : first.preview, boot, dpr);
      first.maps.off.needsUpdate = true;
      screenDirty = false;
    }
    glow.material.opacity = boot.halo;
  };

  const render = () => {
    renderer.render(scene, camera);
    if (!ready) {
      ready = true;
      mount.dispatchEvent(new Event('v3-hero-ready', { bubbles: true }));
    }
  };

  // The landing frame without its TVs: the DOM ones stand in their place.
  const snapshot = (canvas) => {
    backdrop = canvas;
    const saved = progress;
    progress = 1;
    update();
    tvs.forEach((tv) => { tv.group.visible = false; });
    glow.visible = false;
    render();
    if (canvas.width !== renderer.domElement.width) canvas.width = renderer.domElement.width;
    if (canvas.height !== renderer.domElement.height) canvas.height = renderer.domElement.height;
    canvas.getContext('2d').drawImage(renderer.domElement, 0, 0);
    tvs.forEach((tv) => { tv.group.visible = true; });
    glow.visible = true;
    progress = saved;
    invalidate();
  };

  const tick = (time, deltaTime) => {
    // CH 01 plays while it is on screen: on the 3D screen, then as the works TV after the hand-off.
    if (powered && (shown ? visible : worksVisible)) tvs[0]?.player?.advance(deltaTime);
    if (shelf() !== shelfX) dirty = true;
    if (!shown) {
      if (backdrop && worksVisible && dirty) {
        snapshot(backdrop);
        dirty = false;
      }
      return;
    }
    if (!dirty || !visible) return;
    dirty = false;
    update();
    render();
  };
  gsap.ticker.add(tick);
  const toX = gsap.quickTo(pointer, 'x', { duration: 0.9, ease: 'power3.out', onUpdate: invalidate });
  const toY = gsap.quickTo(pointer, 'y', { duration: 0.9, ease: 'power3.out', onUpdate: invalidate });
  const onPointer = (event) => {
    if (!shown) return;
    toX((event.clientX / innerWidth) * 2 - 1);
    toY((event.clientY / innerHeight) * 2 - 1);
  };
  addEventListener('pointermove', onPointer, { passive: true });
  const resize = () => {
    const { clientWidth: w, clientHeight: h } = mount;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    invalidate();
  };
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(mount);
  const visibility = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.target === mount) visible = entry.isIntersecting;
      else worksVisible = entry.isIntersecting;
    });
    invalidate();
  });
  visibility.observe(mount);
  visibility.observe(pin);
  resize();

  return {
    setProgress(value) {
      progress = value;
      if ((value >= POWER) !== powered) power(!powered);
      invalidate();
    },
    setShown(value) {
      shown = value;
      screenDirty = true;
      invalidate();
      // The canvas still holds the TV-less backdrop frame; draw the stage before it is seen.
      if (value) { dirty = false; update(); render(); }
    },
    layout,
    snapshot,
    destroy() {
      gsap.ticker.remove(tick);
      bootTween?.kill();
      tvs[0]?.player?.destroy();
      gsap.killTweensOf(pointer);
      removeEventListener('pointermove', onPointer);
      resizeObserver.disconnect();
      visibility.disconnect();
      tvs.forEach((tv) => {
        tv.art.onload = null;
        tv.preview.onload = null;
        Object.values(tv.maps).forEach((map) => map.dispose());
      });
      const done = new Set();
      scene.traverse((object) => {
        [object.geometry, ...[object.material].flat()].forEach((item) => {
          if (!item || done.has(item)) return;
          done.add(item);
          item.map?.dispose();
          item.dispose();
        });
      });
      scene.environment.dispose();
      pmrem.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
