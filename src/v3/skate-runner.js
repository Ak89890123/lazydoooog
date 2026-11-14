import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { createRunnerSky } from './runner-sky.js';
import { createGroundBlackHole } from './black-hole.js';
import { OPENING_START, riderCollapseFrame } from './collapse-motion.js';
import { createHillsideHome } from './hillside-structure.js';
import { hideShopBacking } from './structure-motion.js';

// Skate run behind ?game=runner (docs/v3-motion-contract.md). Scroll moves the camera and snaps it to one
// ad per automation; the rider skates on its own clock towards that stop, one trick per chore, so a fast
// scroll never rushes it. The pose and clock math is pure (v3.test.js); three.js loads only when the run
// starts. World units: the rider stands about 1 tall and x runs right. Each chore sits in the stretch of
// gap units that ends at its automation's ad; it is w long, and h is the height the wheels ride at on top.
// runner-rail.glb is 3 long; its pipe top (0.594) is where the deck underside rides: h + DECK + 0.003.
const RAIL = { trick: 'boardslide', w: 3, h: 0.491 };
export const COURSE = [
  { id: 'paper', ...RAIL, gap: 16 },
  // Visible packing half-widths + one shop + two 0.15 seams (rounded up to 0.01).
  { id: 'box', ...RAIL, gap: 18.68 },
  { id: 'inbox', ...RAIL, gap: 21.18 },
  { id: 'cone', ...RAIL, gap: 20.04 },
  { id: 'computer', ...RAIL, gap: 14.32 },
  { id: 'binders', trick: 'launch', gap: 13.55, w: 2.2, h: 0.6 },
];

const TAU = Math.PI * 2;
const PREP = 0.6; // crouch before take-off and after landing
const DECK = 0.1; // deck centre above the wheels' contact point
const TOP = DECK + 0.0225; // deck surface the soles stand on
const STANCE = 0.12; // each sole's centre this far from the deck centre, front foot towards the nose
const FLIGHT = 5; // the black hole's centre, the last stop, lies this far past the kicker's lip
const HOVER = 1.8; // wheel height at which the hole holds the rider over its mouth
const ease = (v, a, b) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const dip = (v, c, r = 0.5) => (Math.abs(v - c) < r ? 0.5 + 0.5 * Math.cos((Math.PI * (v - c)) / r) : 0);
// Arm wind-up around a take-off at c: back during the crouch, through neutral at the pop, forward after it.
const wind = (v, c) => (Math.abs(v - c) < 0.5 ? -Math.sin(TAU * (v - c)) : 0);
// Arms out for balance from take-off at a until they settle after landing at b.
const balance = (v, a, b) => ease(v, a, a + 0.4) * (1 - ease(v, b + 0.15, b + PREP));
// Touch-down impact d after landing: peaks within 0.2 (knees soak it up, arms fling out) and fades by PREP.
const impact = (d) => {
  if (d <= 0 || d >= PREP) return 0;
  return d < 0.2 ? Math.sin((Math.PI / 2) * (d / 0.2)) : 0.5 + 0.5 * Math.cos((Math.PI * (d - 0.2)) / (PREP - 0.2));
};
const arc = (v, a, b, y0, y1, peak) => {
  const s = (v - a) / (b - a);
  return y0 + (y1 - y0) * s + 4 * peak * s * (1 - s);
};
const inside = (v, a, b) => v >= a && v <= b;

// A trick gives its take-off a and landing b (from the obstacle start) and the pose at distance dx.
const TRICKS = {
  // Pops onto the rail, turns the board across it, slides, and pops back out.
  boardslide: ({ w, h }) => {
    const [a, on, off, b] = [-1.3, 0.35, w - 0.35, w + 1.2];
    return {
      a,
      b,
      at(dx) {
        let y = 0;
        if (inside(dx, a, on)) y = arc(dx, a, on, 0, h, 0.3);
        else if (inside(dx, on, off)) y = h;
        else if (inside(dx, off, b)) y = arc(dx, off, b, h, 0, 0.25);
        return {
          y,
          spin: (Math.PI / 2) * ease(dx, a + 0.4 * (on - a), on) * (1 - ease(dx, off, off + 0.6 * (b - off))),
          crouch: dip(dx, a) + impact(dx - b) + 0.4 * dip(dx, on, 0.3),
          land: impact(dx - b) + 0.6 * impact(dx - on),
          wind: wind(dx, a),
          balance: balance(dx, a, b),
        };
      },
    };
  },
  // Rides up the kicker into the black hole's pull: it never comes down, but spins a full turn while the pull
  // carries it up and over the mouth, its stop. It sets off only when the hole calls it (initSkateRunner).
  launch: ({ w, h }) => {
    const slope = Math.atan2(h, w);
    return {
      a: 0,
      b: w, // cleared at take-off
      end: w + FLIGHT,
      settle: 0,
      at(dx) {
        const crouch = 0.5 * dip(dx, w);
        const arms = ease(dx, w - 0.2, w + 0.2);
        if (dx <= w) return { y: Math.max(0, (h * dx) / w), tilt: slope * ease(dx, 0, 0.3), crouch, wind: wind(dx, w), balance: arms };
        const t = Math.min(1, (dx - w) / FLIGHT);
        return {
          // Leaves the lip with a free jump's pop (slope 0.88), then levels off at the hover instead of falling.
          y: h + (HOVER - h) * (3 - 2 * t) * t * t + 0.88 * FLIGHT * t * (1 - t) ** 2,
          tilt: slope * (1 - ease(t, 0, 0.5)),
          spin: TAU * ease(t, 0.1, 0.85),
          crouch: crouch + 0.35 * Math.sin(Math.PI * t),
          wind: wind(dx, w),
          balance: arms,
          toHole: ease(t, 0, 1), // also carries it across to the mouth's z
        };
      },
    };
  },
};

// land: touch-down impact; wind: arm wind-up around a take-off; balance: arms out from take-off until they
// settle after landing; push/swing/step: the kick-push below; toHole: how far the hole has carried it in.
const NEUTRAL = { y: 0, tilt: 0, spin: 0, crouch: 0, tuck: 0, pop: 0, flip: 0, shuv: 0, land: 0, wind: 0, balance: 0, push: 0, swing: 0, toHole: 0 };
const SETTLE = 1; // rolling room between a landing's recovery and the ad stop
let stop = 0;
export const RUN = COURSE.map((spot) => {
  const { a, b, at, end = b + PREP, settle = SETTLE } = TRICKS[spot.trick](spot);
  stop += spot.gap;
  const x = stop - settle - end;
  return { ...spot, x, at, from: x + a - PREP, land: x + b, to: x + end, stop };
});
export const TRACK = [0, stop];
export const STOPS = [TRACK[0], ...RUN.map((spot) => spot.stop)]; // the start, then one ad per automation
// At the last ad the rider waits short of the kicker: the jump is the black hole's.
export const WAIT = RUN.at(-1).from;
// The hole never runs ahead of the rider: shut until it leaves the kicker, then opening as the flight carries it
// in, so the scroll can neither swallow nor snatch up a rider that is still on the road.
export const holeAt = (progress, x) => Math.min(progress, OPENING_START + (1 - OPENING_START) * pose(x).toHole);

// Scroll progress to the camera's x. Every ad gets the same share of the run's scroll: the camera eases to
// it over the first part and rests on it for the last `hold` of the share, a detent you can scroll through.
export function cameraAt(progress, hold) {
  const n = STOPS.length - 1;
  const i = Math.min(n - 1, Math.floor(progress * n));
  const t = ease(progress * n - i, 0, 1 - hold);
  return t === 0 ? STOPS[i] : t === 1 ? STOPS[i + 1] : STOPS[i] + (STOPS[i + 1] - STOPS[i]) * t; // a rest is exactly its stop
}

// Where the scroll settles. Between two ads: on through the next detent in the scroll direction, to its far
// edge, so the next wheel step that way leaves at once. Inside an ad's detent: it stays when the visitor
// stopped there while scrolling through, and moves to the neighbouring ad when the scroll left from this
// ad's rest (`rested`), so one wheel step always moves one ad.
export function snapStop(progress, direction, hold, rested) {
  const n = STOPS.length - 1;
  const i = Math.min(n - 1, Math.floor(progress * n));
  const local = progress * n - i;
  const at = local <= 1e-3 ? i : local >= 1 - hold - 1e-3 ? i + 1 : -1; // the ad whose detent holds the scroll
  if (!direction || (at >= 0 && at !== rested)) return progress; // no direction yet (a refresh): stay
  const stop = Math.max(0, Math.min(n, at < 0 ? i + (direction > 0) : at + Math.sign(direction)));
  return direction > 0 ? stop / n : Math.max(0, (stop - hold) / n);
}

// One kick-push as the rider leaves each stop but the last. step is the back sole in rider space: it leaves
// the deck, plants beside the board and stays put on the ground while the rider rolls past, then steps back on.
const PUSH = 1.5; // run distance of one push
const SIDE = 0.19; // planted beside the board, clear of the deck edge and wheels
const PLANT = 0.06; // where the sole touches down, along the board
const [REACH, LIFT] = [0.3, 0.52]; // touch-down and lift-off within a push
const PUSHES = STOPS.slice(0, -1).map((at) => at + 0.2);
function kick(u) {
  if (u < REACH) {
    const t = u / REACH;
    const step = [-STANCE + (PLANT + STANCE) * ease(t, 0, 1), TOP * (1 - ease(t, 0.35, 1)) + 0.06 * Math.sin(Math.PI * t), SIDE * ease(t, 0, 0.6)];
    return { step, swing: -ease(t, 0, 1) };
  }
  const planted = PLANT - (Math.min(u, LIFT) - REACH) * PUSH; // moves back exactly as far as the rider rolls
  if (u < LIFT) return { step: [planted, 0, SIDE], swing: -1 + 2 * ease(u, REACH, LIFT) };
  const t = (u - LIFT) / (1 - LIFT);
  const step = [planted - (planted + STANCE) * ease(t, 0, 1), TOP * ease(t, 0, 0.6) + 0.08 * Math.sin(Math.PI * t), SIDE * (1 - ease(t, 0.4, 1))];
  return { step, swing: 1 - ease(t, 0, 1) };
}

export function pose(at) {
  const x = Math.min(at, TRACK[1]); // the run ends held over the hole
  const spot = RUN.find(({ from, to }) => x >= from && x <= to);
  if (spot) return { ...NEUTRAL, ...spot.at(x - spot.x) };
  const start = PUSHES.find((s) => x > s && x < s + PUSH);
  if (start === undefined) return { ...NEUTRAL };
  const u = (x - start) / PUSH;
  return { ...NEUTRAL, ...kick(u), push: ease(u, 0, 0.25) * (1 - ease(u, 0.7, 1)) };
}

// The rider's own clock: towards target at no more than speed, accelerating and braking to stop on it.
const ACCEL = 3.2;
const BRAKE = 2.2;
export function chase(x, v, target, dt, speed) {
  const d = target - x;
  const want = Math.sign(d) * Math.min(speed, Math.sqrt(2 * BRAKE * Math.abs(d)));
  const next = v + Math.min(ACCEL * dt, Math.max(-ACCEL * dt, want - v));
  const at = x + next * dt;
  return Math.abs(target - at) < 0.02 && Math.abs(next) < 0.3 ? [target, 0] : [at, next];
}

// Further than edge from the camera the rider is off screen: it may wait just outside the edge it will
// enter from, already rolling, so it is never far behind. It is never moved away from its target.
export function catchUp(x, target, cam, edge, speed) {
  if (Math.abs(x - cam) <= edge) return null;
  const side = Math.sign(x - cam);
  const at = cam + side * edge;
  return Math.sign(target - at) === -side ? [at, -side * speed] : null;
}

const hash = (i) => {
  const v = Math.sin(i * 127.1) * 43758.5453;
  return v - Math.floor(v);
};

// Shared, deterministic surfaces; no image downloads or changes to the Rodin materials.
export function hillsideTexture(THREE, kind) {
  const window = kind === 'window';
  const width = window ? 64 : 256, height = window ? 96 : 256;
  const pixels = new Uint8Array(width * height * 4);
  // Terms along one axis only, worked out once per column or row rather than for every pixel.
  const weights = new Float64Array(width), phases = new Float64Array(width), waves = new Float64Array(height);
  for (let x = 0; x < width; x += 1) [weights[x], phases[x]] = [hash(Math.floor(x / 6) + 40), hash(Math.floor(x / 6)) * 4];
  for (let y = 0; y < height; y += 1) waves[y] = Math.sin(y * 0.021);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const i = (y * width + x) * 4;
    let shade;
    if (window) {
      const frame = x < 4 || x >= width - 4 || y < 4 || y >= height - 4 || Math.abs(x - width / 2) < 1 || y % 32 < 2;
      shade = frame ? 24 : 205 + 27 * y / height + 14 * hash(x + y * width);
    } else {
      const joint = kind === 'concrete' ? x % 128 < 2 || y % 64 < 2 : x % 16 === 0 || y % 16 === 0;
      const stain = weights[x] * (0.5 + 0.5 * Math.sin(y * 0.013 + phases[x]));
      shade = 199 + 11 * (Math.sin(x * 0.053 + waves[y]) + Math.sin(x * 0.019 + y * 0.033))
        + 15 * hash(x + y * width) - 60 * stain - 33 * joint;
    }
    pixels[i] = pixels[i + 1] = pixels[i + 2] = shade; // written directly: an array per pixel made this slow
    pixels[i + 3] = 255;
  }
  const map = new THREE.DataTexture(pixels, width, height);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = window ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
  map.magFilter = THREE.LinearFilter;
  map.minFilter = THREE.LinearMipmapLinearFilter;
  map.generateMipmaps = true;
  map.needsUpdate = true;
  return map;
}

// Static world-space asphalt and four painted strips share the street's existing planet projection.
export function roadSurface(THREE, config, left, right, maps) {
  const group = new THREE.Group();
  group.name = 'runner-road';
  const span = right - left, mid = (left + right) / 2;
  const geometry = new THREE.PlaneGeometry(span, 80), uv = geometry.attributes.uv;
  for (let i = 0; i < uv.count; i += 1) {
    uv.setXY(i, uv.getX(i) * span / config.road.tileSize, uv.getY(i) * 80 / config.road.tileSize);
  }
  const asphalt = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
    color: '#717779', map: maps.map, normalMap: maps.normalMap, roughnessMap: maps.roughnessMap,
    normalScale: new THREE.Vector2(0.45, 0.45), roughness: 1,
  }));
  asphalt.rotation.x = -Math.PI / 2;
  asphalt.position.set(mid, 0, -25);
  group.add(asphalt);

  // A repeatable grayscale alpha mask chips the paint without adding crack meshes or per-frame noise.
  const width = 256, height = 32, pixels = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const grain = hash(x + y * width);
    const shade = y < 2 || y >= height - 2 || grain > 0.94 ? 0 : 215 + 40 * grain;
    pixels.set([shade, shade, shade, 255], (y * width + x) * 4);
  }
  const wear = new THREE.DataTexture(pixels, width, height);
  wear.wrapS = THREE.RepeatWrapping;
  wear.anisotropy = maps.map.anisotropy;
  wear.magFilter = THREE.LinearFilter;
  wear.minFilter = THREE.LinearMipmapLinearFilter;
  wear.generateMipmaps = true;
  wear.needsUpdate = true;
  const back = config.sidewalk.front, front = back + config.road.width, centre = (back + front) / 2;
  [back + 0.3, centre - 0.14, centre + 0.14, front - 0.3].forEach((z, i) => {
    const geometry = new THREE.PlaneGeometry(span, 0.14), uv = geometry.attributes.uv;
    for (let v = 0; v < uv.count; v += 1) uv.setX(v, uv.getX(v) * span / 4 + i * 0.37);
    const line = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
      color: i === 0 || i === 3 ? '#d8d5c8' : '#d4ae45', alphaMap: wear,
      transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1,
      polygonOffsetUnits: -1, roughness: 0.96,
    }));
    line.rotation.x = -Math.PI / 2;
    line.position.set(mid, 0.001, z);
    group.add(line);
  });
  return group;
}

// The buried plinth does not reserve street space. Keep asymmetric body bounds centred on each lot.
function streetFootprint(width, depth, footprint, scale, yaw = 0) {
  const { left, right, back, front } = footprint ?? { left: -width / 2, right: width / 2, back: -depth / 2, front: depth / 2 };
  const c = Math.cos(yaw), s = Math.sin(yaw);
  return {
    w: scale * ((right - left) * c + (front - back) * Math.abs(s)),
    d: scale * ((front - back) * c + (right - left) * Math.abs(s)),
    offsetX: scale * ((left + right) * c + (back + front) * s) / 2,
    offsetZ: scale * ((back + front) * c - (left + right) * s) / 2,
  };
}

// Only ad stops use the large Rodin towers. Independent shops and hillside homes fill the rest of the street.
export function skyline(stops, sizes, doorHeight) {
  return stops.map((x, ad) => {
    const model = ad % sizes.length;
    const seed = ad + 30;
    const { width, depth } = sizes[model];
    const scale = doorHeight / sizes[model].doorHeight * (sizes[model].scaleMultiplier ?? 1);
    const heightMultiplier = sizes[model].heightMultiplier ?? 1;
    const h = sizes[model].height * scale * heightMultiplier;
    const yaw = (hash(seed + 11) - 0.5) * 0.09;
    const footprint = streetFootprint(width, depth, sizes[model].footprint, scale, yaw);
    const front = sizes[model].front ?? -4 - 0.6 * hash(seed + 23) - Math.max(0, h - 21) * 0.6;
    const packingW = footprint.w;
    return { model, scale, heightMultiplier, yaw, ...footprint, packingW, h, baseHeight: sizes[model].baseHeight * scale * heightMultiplier, z: front - footprint.d / 2, ad, x };
  });
}

// One continuous street, detailed Rodin shops between ads, with three supported residential terraces.
// Layout is separate from meshes so real footprints and terrace support can be checked together.
export function streetBlockout(towers, config, doorHeight) {
  const sizes = config.shops.map((shop) => {
    const scale = doorHeight / shop.doorHeight;
    return { ...shop, scale, ...streetFootprint(shop.w, shop.d, shop.footprint, scale), h: shop.h * scale,
      y: config.sidewalk.height - shop.baseHeight * scale - 0.005 };
  }).sort((a, b) => b.w - a.w);
  const shops = [];
  towers.forEach((tower, i) => {
    const right = tower.x - tower.packingW / 2;
    const left = i ? towers[i - 1].x + towers[i - 1].packingW / 2 : right - sizes[0].w - 0.3;
    // One distinct shop per ad, widest first; COURSE gaps match these footprints.
    const shop = sizes[i];
    shops.push({ ...shop, x: (left + right) / 2, z: -4.5 - shop.d / 2 });
  });
  const platforms = [];
  const homes = [];
  const front = Math.min(...towers.map(({ z, d }) => z - d / 2)) - 2;
  const left = TRACK[0] - config.endPadding, right = TRACK[1] + config.endPadding;
  const cells = Math.ceil((right - left) / config.cellWidth);
  const width = (right - left) / cells;
  for (let i = 0; i < cells; i += 1) {
    const x = left + (i + 0.5) * width;
    for (const [row, level] of config.terraces.entries()) {
      const y = level.base + level.rise * hash(i + row * 71 + 500);
      const z = front - row * (level.d + config.alleyDepth) - level.d / 2;
      platforms.push({ x, y: 0, z, w: width, h: y, d: level.d, row });
      const h = level.minHeight + (level.maxHeight - level.minHeight) * hash(i + row * 59 + 620);
      homes.push({ x, y, z: z - 0.5, w: width - 0.15, h, d: level.d - 2, row });
    }
  }
  // Continue the same street beyond both camera stops; the run does not end the city.
  for (const side of [-1, 1]) {
    let edge = side < 0 ? shops[0].x - shops[0].w / 2 : towers.at(-1).x + towers.at(-1).w / 2;
    const start = side < 0 ? config.shops.findIndex(s => s.model === shops[0].model) : -1;
    for (let i = 0; side * (edge - (side < 0 ? left : right)) < 0; i += 1) {
      // Start beside the first shop's neighbour in the cycle, rather than repeating it at the seam.
      const source = config.shops.at((start + side * (i + 1)) % config.shops.length);
      const shop = sizes.find(s => s.model === source.model);
      const x = edge + side * (0.15 + shop.w / 2);
      shops.push({ ...shop, x, z: -4.5 - shop.d / 2 });
      edge = x + side * shop.w / 2;
    }
  }
  const lots = [...towers, ...shops];
  const start = Math.min(left, ...lots.map(s => s.x - s.w / 2)) - 1;
  const end = Math.max(right, ...lots.map(s => s.x + s.w / 2)) + 1;
  const back = Math.min(...lots.map(s => s.z - s.d / 2)) - 1;
  const sidewalk = { x: (start + end) / 2, z: (back + config.sidewalk.front) / 2,
    w: end - start, h: config.sidewalk.height, d: config.sidewalk.front - back };
  return { shops, platforms, homes, sidewalk };
}

export function prepareTowerGeometry(THREE, node) {
  const source = node.geometry;
  const geometry = node.geometry = source.index ? source.toNonIndexed() : node.material.name === 'Ad screen' ? source.clone() : source;
  // The same points: keep the loader's bounds instead of measuring these large meshes again.
  geometry.boundingBox ??= source.boundingBox?.clone() ?? null;
  geometry.boundingSphere ??= source.boundingSphere?.clone() ?? null;
  // Flat normals, one per triangle, written straight into an array: computeVertexNormals() reads each vertex
  // through accessors, which takes tens of milliseconds on these meshes.
  const p = geometry.attributes.position.array, normals = new Float32Array(p.length);
  for (let i = 0; i < p.length; i += 9) {
    const ux = p[i + 3] - p[i], uy = p[i + 4] - p[i + 1], uz = p[i + 5] - p[i + 2];
    const vx = p[i + 6] - p[i], vy = p[i + 7] - p[i + 1], vz = p[i + 8] - p[i + 2];
    const x = uy * vz - uz * vy, y = uz * vx - ux * vz, z = ux * vy - uy * vx, length = Math.sqrt(x * x + y * y + z * z) || 1;
    normals[i] = normals[i + 3] = normals[i + 6] = x / length;
    normals[i + 1] = normals[i + 4] = normals[i + 7] = y / length;
    normals[i + 2] = normals[i + 5] = normals[i + 8] = z / length;
  }
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  if (node.material.name !== 'Ad screen') return;
  // Move authored pivots with the screen's vertices, on this geometry's own copy.
  const centre = new THREE.Box3().setFromBufferAttribute(geometry.attributes.position).getCenter(new THREE.Vector3());
  geometry.translate(-centre.x, -centre.y, -centre.z);
  for (const name of ['_shard', '_cluster']) {
    const attribute = geometry.attributes[name];
    if (!attribute) continue;
    for (let i = 0; i < attribute.count; i += 1) {
      attribute.setXYZ(i, attribute.getX(i) - centre.x, attribute.getY(i) - centre.y, attribute.getZ(i) - centre.z);
    }
    attribute.needsUpdate = true;
  }
  node.position.add(centre.multiply(node.scale).applyQuaternion(node.quaternion));
}

// Static reading (and leaving motion) shows every automation the run would unlock.
export function showUnlocks(section) {
  section.querySelectorAll('[data-unlock]').forEach((item) => item.classList.add('is-unlocked'));
  section.classList.add('is-complete');
}

// Scroll owns the camera through cameraAt(): it rests on each ad for a moment even while scrolling, and a
// stop between two ads snaps on to the next ad in the scroll direction, so one wheel step moves on by one
// ad. The rider owns its clock (gsap.ticker): it skates towards the stop the camera is heading for at
// config.dogSpeed, tricks included, and rewinds the same way when scrolled back. At the last ad it waits short
// of the kicker until the black hole (runner-collapse) calls it up and over the mouth, still on its own clock.
// When the camera rests on an ad and the scrolling has stopped, its screen turns and its card opens beside it.
// Prepare the street as the works approach, leaving the initial hero load alone.
// A wheel gesture ends after this much quiet (ms): a long spin or a trackpad's momentum still moves one ad.
const GESTURE_GAP = 200; // ponytail: fixed gap; tune here if a mouse or trackpad splits or merges gestures
let building = Promise.resolve(); // one street build at a time: a rebuild shares the canvas's WebGL context
export function initSkateRunner(section, config, holeConfig) {
  const stage = section.querySelector('[data-game]');
  const canvas = stage.querySelector('canvas');
  const loadingScreen = document.createElement('div');
  loadingScreen.className = 'runner-loading';
  loadingScreen.setAttribute('role', 'status');
  loadingScreen.setAttribute('aria-label', '載入跑酷場景…');
  loadingScreen.append(document.querySelector('#site-loading .loading-gears').cloneNode(true));
  loadingScreen.querySelectorAll('[data-gear]').forEach((gear) => {
    gear.removeAttribute('style');
    gear.removeAttribute('data-svg-origin');
    gear.setAttribute('transform', `rotate(${gear.dataset.gear === '20' ? 171 : gear.dataset.gear === '16' ? 90 : 0})`);
  });
  stage.append(loadingScreen);
  canvas.dispatchEvent(new Event('runner-model-ready', { bubbles: true }));
  const card = section.querySelector('[data-runner-ad]');
  const unlocks = RUN.map(({ id }) => section.querySelector(`[data-unlock="${id}"]`));
  const lens = config.lenses[new URLSearchParams(location.search).get('world') ?? 'planet'];
  const near = 1e-3 * (TRACK[1] - TRACK[0]); // which stop counts as reached, in world units
  const state = { progress: 0 };
  const rider = { x: TRACK[0], v: 0 };
  let cam = TRACK[0];
  let reach = 0; // beyond this distance from the camera the rider is off screen
  let open = -1; // the ad whose card is showing
  let rested = 0, restY = -1; // the stop the camera last rested on, and the scroll position there
  let stillY = -1, stillAt = 0; // where the scroll has stayed, and since when (s)
  let dirty = true;
  let skyTime = 0;
  let scene = null;
  let loading = false;
  let destroyed = false;
  let collapse = 0;
  const swallow = ({ detail }) => {
    collapse = detail;
    scene?.collapse(collapse);
  };
  canvas.addEventListener('runner-collapse', swallow);
  const paint = () => {
    RUN.forEach(({ land }, i) => unlocks[i].classList.toggle('is-unlocked', rider.x >= land));
    section.classList.toggle('is-complete', rider.x >= RUN.at(-1).land);
    scene?.render(cam, rider.x, skyTime, dirty || scene.busy());
    if (cam === TRACK[0] || cam === TRACK[1]) canvas.dispatchEvent(new Event('runner-frame', { bubbles: true }));
    dirty = false;
  };
  // The card stands beside its ad's screen, on whichever side has room, and wipes out from it.
  const place = () => {
    const box = scene?.anchor(open);
    const [w, h] = [stage.clientWidth, stage.clientHeight];
    const [left, right, middle] = box ? [box.left, box.right, (Math.max(0, box.top) + Math.min(h, box.bottom)) / 2] : [w / 2, w / 2, h / 3];
    const flip = right + 28 + card.offsetWidth > w - 16;
    card.classList.toggle('is-left', flip);
    gsap.set(card, {
      left: Math.max(16, flip ? left - 28 - card.offsetWidth : right + 28),
      top: Math.min(h - card.offsetHeight - 16, Math.max(16, middle - 34)),
    });
    return flip;
  };
  const show = (i) => {
    open = i;
    card.replaceChildren(...[...unlocks[i].children].map((node) => node.cloneNode(true)));
    const flip = place();
    gsap.fromTo(card, { autoAlpha: 0, clipPath: flip ? 'inset(0% 0% 0% 100%)' : 'inset(0% 100% 0% 0%)' }, {
      autoAlpha: 1, clipPath: 'inset(0% 0% 0% 0%)', duration: 0.45, ease: 'power3.out', overwrite: true,
    });
    scene?.flip(i);
  };
  const hide = () => {
    open = -1;
    gsap.to(card, { autoAlpha: 0, duration: 0.18, ease: 'power1.out', overwrite: true });
  };
  const tween = gsap.to(state, {
    progress: 1,
    ease: 'none',
    onUpdate: () => {
      cam = cameraAt(state.progress, config.hold);
      dirty = true;
    },
    scrollTrigger: {
      trigger: section,
      pin: section.querySelector('[data-game-pin]'),
      start: 'top top',
      end: () => `+=${innerHeight * config.scrollDistanceVh}`,
      scrub: config.scrub,
      snap: {
        // Rests are recorded only where the snap settles (staying here, or onComplete), never by the ticker: a
        // step inside an ad's detent leaves the camera still, and must not be mistaken for a new rest before the
        // snap decides. A refresh also re-runs the snap; only a scroll away from the rest counts as leaving it.
        snapTo: (value, self) => {
          if (value < 0 || value > 1) return value; // settled outside the run, where nothing snaps
          const to = snapStop(value, self.direction, config.hold, Math.abs(scrollY - restY) > 1 ? rested : -1);
          if (to === value) [rested, restY] = [STOPS.findIndex((stop) => Math.abs(stop - cameraAt(value, config.hold)) < 0.05), scrollY];
          return to;
        },
        inertia: false, delay: 0.1, duration: { min: 0.3, max: 0.9 }, ease: 'power2.inOut',
        onComplete: (self) => { [rested, restY] = [Math.round(self.progress * (STOPS.length - 1)), scrollY]; },
      },
      invalidateOnRefresh: true,
      // Finish the camera scrub and close the card for the works TV, but let the rider skate home.
      onLeaveBack: (self) => {
        self.getTween()?.progress(1);
        open = -1;
        gsap.set(card, { autoAlpha: 0, overwrite: true });
        paint();
        canvas.dispatchEvent(new Event('runner-model-ready', { bubbles: true }));
      },
      onLeave: (self) => { self.getTween()?.progress(1); paint(); },
    },
  });
  const trigger = tween.scrollTrigger;
  // main.js creates the preceding works pin first; its start stays current through refresh and resize.
  const works = ScrollTrigger.getAll().find(({ trigger, pin }) => trigger === section.previousElementSibling && pin);
  // One wheel gesture, one ad. Left to the browser, a wheel step stops the camera between two ads until the snap
  // pulls it on; here the gesture's first event glides the scroll straight to the neighbouring ad instead. It
  // leaves a rest from its detent's edge facing the move (the camera holds still across a detent, so the jump is
  // unseen) and lands in whole pixels inside the next detent, where the snap above and the next step read that
  // ad. Past either end of the run the page scrolls on; keys, the scrollbar and touch keep the snap.
  const pin = section.querySelector('[data-game-pin]');
  let glide = null, wheelAt = -Infinity;
  const wheel = (event) => {
    const fresh = event.timeStamp - wheelAt > GESTURE_GAP;
    wheelAt = event.timeStamp;
    const { start, end } = trigger;
    if (event.ctrlKey || !event.deltaY || scrollY < start - 1 || scrollY > end + 1) return;
    const direction = Math.sign(event.deltaY), n = STOPS.length - 1;
    const p = gsap.utils.clamp(0, 1, (scrollY - start) / (end - start));
    const cam = cameraAt(p, config.hold);
    const here = STOPS.findIndex((stop) => Math.abs(stop - cam) < 0.05);
    const to = snapStop(p, direction, config.hold, here);
    if (cameraAt(to, config.hold) === cam) return;
    event.preventDefault();
    if (glide?.isActive() || (!fresh && here >= 0)) return; // between ads (entering the run) it always moves on
    const from = here < 0 ? p : direction > 0 ? here / n : Math.max(0, (here - config.hold) / n);
    const y = start + to * (end - start);
    const scroll = { y: start + from * (end - start) };
    let last = scrollY;
    glide = gsap.to(scroll, {
      y: direction > 0 ? Math.floor(y) : Math.ceil(y), duration: 0.8, ease: 'power2.inOut',
      onUpdate: () => {
        if (Math.abs(scrollY - last) > 1) return glide.kill(); // the scrollbar, keys or a jump took over
        scrollTo(0, scroll.y);
        last = scrollY;
      },
    });
  };
  pin.addEventListener('wheel', wheel, { passive: false });
  const load = () => {
    loading = true;
    building = building
      .then(() => Promise.all([import('three'), import('three/addons/loaders/GLTFLoader.js'), import('three/addons/utils/BufferGeometryUtils.js'),
        import('three/addons/libs/meshopt_decoder.module.js')]))
      .then(async ([THREE, { GLTFLoader }, { mergeGeometries }, { MeshoptDecoder }]) => {
        if (destroyed) return;
        MeshoptDecoder.useWorkers(2); // the storefronts' compressed geometry decodes off the main thread
        const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
        const view = await createScene(canvas, THREE, loader, config, unlocks, skyline(STOPS.slice(1), config.buildings, config.doorHeight), lens, holeConfig, mergeGeometries);
        if (destroyed) { view.dispose(); return; }
        scene = view;
        scene.resize(stage.clientWidth, stage.clientHeight);
        scene.render(cam, rider.x, skyTime);
        scene.collapse(collapse);
        stage.classList.add('is-runner-ready');
        canvas.dispatchEvent(new Event('runner-model-ready', { bubbles: true }));
        dirty = true;
      })
      .catch((error) => {
        console.warn('Skate run unavailable', error);
        if (!destroyed) {
          loadingScreen.textContent = '場景載入失敗';
          canvas.dispatchEvent(new Event('runner-model-ready', { bubbles: true }));
        }
      });
  };
  // Towards goal on the rider's own clock, dt of it in steps no longer than a frame's cap. Off screen it waits
  // just outside the edge it will enter from.
  const skate = (goal, dt) => {
    if (rider.x === goal && rider.v === 0) return;
    const jump = catchUp(rider.x, goal, cam, reach, config.dogSpeed);
    if (jump) [rider.x, rider.v] = jump;
    for (let left = dt; left > 0; left -= 0.05) [rider.x, rider.v] = chase(rider.x, rider.v, goal, Math.min(0.05, left), config.dogSpeed);
    dirty = true;
  };
  const tick = (time, deltaTime) => {
    if (!loading && scrollY >= works.start - innerHeight) load(); // also a deep link past it
    // A jump right after load skips ScrollTrigger's snap, so a second of stillness on an ad is a rest too
    // (well after any snap has decided, so it never races one).
    if (scrollY !== stillY) [stillY, stillAt] = [scrollY, time];
    else if (scrollY !== restY && time - stillAt > 1 && scrollY >= trigger.start && scrollY <= trigger.end) {
      const at = STOPS.findIndex((stop) => Math.abs(stop - cameraAt(trigger.progress, config.hold)) < 0.05);
      if (at >= 0) [rested, restY] = [at, scrollY];
    }
    const dt = Math.min(0.05, deltaTime / 1000);
    if (collapse > 0) {
      // The hole calls the rider up the kicker and over its mouth, on the rider's own clock, and waits for it
      // (holeAt). Its pull grows with the scroll and runs that clock up to four times faster on the ground, so a
      // rider left behind still flies in before the street fades; the hole's catch slows it back to its own pace.
      skate(TRACK[1], dt * (1 + 3 * ease(collapse, 0, 0.3) * (1 - pose(rider.x).toHole)));
      if (dirty) paint();
      return;
    }
    const skyActive = trigger.isActive && !document.hidden;
    if (skyActive) skyTime += dt;
    const heading = trigger.direction < 0 ? STOPS.findLast((s) => s <= cam + near) : STOPS.find((s) => s >= cam - near);
    skate(heading === TRACK[1] ? WAIT : heading, dt);
    if (open >= 0 && Math.abs(RUN[open].stop - cam) > 0.3) hide();
    // Resting on a stop: the scroll has stopped and leads to this same stop, so the scrub is not just passing
    // through. Its ad's card opens.
    const at = STOPS.findIndex((stop) => Math.abs(stop - cam) < 0.05);
    if (at > 0 && at - 1 !== open && !ScrollTrigger.isScrolling() && Math.abs(cameraAt(trigger.progress, config.hold) - STOPS[at]) < 0.05) show(at - 1);
    if (dirty || scene?.busy() || skyActive) paint();
  };
  gsap.ticker.add(tick);
  const measure = () => {
    // The cropped planet shows only its upper arc. Enter just outside its visible angle, in either direction.
    reach = lens ? lens.round / TAU * Math.atan2(stage.clientWidth / 2, stage.clientHeight * (lens.top + lens.radius - 1)) + 1
      : config.camera.z * Math.tan((config.camera.fov * Math.PI) / 360) * (stage.clientWidth / stage.clientHeight) + 1;
  };
  measure();
  const resize = new ResizeObserver(() => {
    measure();
    scene?.resize(stage.clientWidth, stage.clientHeight);
    if (open >= 0) place();
    dirty = true;
  });
  resize.observe(stage);
  paint();
  return () => {
    destroyed = true;
    loadingScreen.remove();
    stage.classList.remove('is-runner-ready');
    pin.removeEventListener('wheel', wheel);
    glide?.kill();
    canvas.removeEventListener('runner-collapse', swallow);
    gsap.ticker.remove(tick);
    resize.disconnect();
    gsap.killTweensOf(card);
    gsap.set(card, { clearProps: 'all' });
    card.classList.remove('is-left');
    card.replaceChildren();
    scene?.dispose();
    scene = null;
    showUnlocks(section);
  };
}

const AD_FONT = '"Noto Sans TC", "Microsoft JhengHei", sans-serif';
// Greedy lines: Latin words and figures stay whole, Chinese breaks between characters.
const wrap = (pen, text, width) => text.match(/[\w%+−-]+|\s+|./gu).reduce((lines, piece) => {
  const line = lines.at(-1) + piece;
  if (!lines.at(-1).trim() || pen.measureText(line.trim()).width <= width) lines[lines.length - 1] = line;
  else lines.push(piece.trimStart());
  return lines;
}, ['']).map((line) => line.trim()).filter(Boolean);

// An automation's ad: the chore it removed, small and struck out, then the automation as the headline,
// beside the chore's sticker. The camera crops tall screens, so their content fills a square at the foot.
async function poster(item, width, height) {
  const before = item.querySelector('span').textContent;
  const title = item.querySelector('strong').textContent;
  const icon = new Image();
  icon.src = item.querySelector('img').src;
  await Promise.all([icon.decode().catch(() => {}), document.fonts.load(`900 40px ${AD_FONT}`, before + title).catch(() => {})]);
  await idle(); // then draws in idle time
  const art = document.createElement('canvas');
  [art.width, art.height] = [width, height];
  const pen = art.getContext('2d');
  const u = Math.min(width, height) / 100;
  pen.fillStyle = '#0d1011';
  pen.fillRect(0, 0, width, height);
  pen.strokeStyle = '#c8ff35';
  pen.lineWidth = 2 * u;
  pen.strokeRect(u, u, width - 2 * u, height - 2 * u);
  const [x, y, w, h] = width >= height ? [0, 0, width, height] : [0, height - width, width, width];
  const wide = w > 1.2 * h;
  const pad = 7 * u;
  const side = wide ? Math.min(0.7 * h, 0.38 * w) : 0.36 * w;
  if (icon.naturalWidth) {
    const fit = side / Math.max(icon.naturalWidth, icon.naturalHeight);
    const top = wide ? y + (h - side) / 2 : y + pad;
    pen.drawImage(icon, x + pad + (side - icon.naturalWidth * fit) / 2, top + (side - icon.naturalHeight * fit) / 2, icon.naturalWidth * fit, icon.naturalHeight * fit);
  }
  const left = wide ? x + 2 * pad + side : x + pad;
  const top = wide ? y + 0.28 * h : y + pad + side + 4 * u;
  const room = x + w - pad - left;
  pen.textBaseline = 'top';
  pen.font = `700 ${7 * u}px ${AD_FONT}`;
  pen.fillStyle = '#a4aaa5';
  pen.fillText(before, left, top);
  pen.fillRect(left, top + 3.8 * u, Math.min(room, pen.measureText(before).width), 0.8 * u); // struck out
  let size = 20 * u;
  let lines;
  do {
    await idle(8); // the first measure at each size is slow: one size at a time
    size -= u;
    pen.font = `900 ${size}px ${AD_FONT}`;
    lines = wrap(pen, title, room);
  } while (size > 8 * u && (lines.length > 3 || top + 11 * u + lines.length * 1.15 * size > y + h - pad));
  pen.fillStyle = '#c8ff35';
  lines.forEach((line, i) => pen.fillText(line, left, top + 11 * u + i * 1.15 * size));
  return art;
}

// The street renders wide enough to hold lens.round into a target; a full-screen pass maps each view pixel's
// angle round the planet centre to the panorama's x and the log of its radius to the panorama's y. That
// conformal map keeps shapes (only scale changes), like a tiny-planet photo; the two ends meet underneath.
export function tinyPlanet(THREE, renderer, scene, lens, distance, skyMap = null) {
  const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType }); // linear, dark scene
  const wide = new THREE.PerspectiveCamera();
  const fov = 95; // capture the rooftops too; the flat camera's 38° clips them before the lens pass
  const lane = new THREE.Vector3();
  const uniforms = {
    map: { value: target.texture }, size: { value: new THREE.Vector2() }, centre: { value: new THREE.Vector2() }, crop: { value: 1 },
    ground: { value: 1 }, rise: { value: 1 }, horizon: { value: 0 }, flatten: { value: 0 }, stretch: { value: 1 }, sky: { value: scene.fog?.color ?? scene.background },
    skyMap: { value: skyMap }, atmosphere: { value: Boolean(skyMap) },
  };
  const pass = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
    uniforms,
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: `
      uniform sampler2D map; uniform vec2 size; uniform vec2 centre; uniform float ground; uniform float rise;
      uniform float horizon, flatten, stretch, crop; uniform vec3 sky; uniform sampler2D skyMap; uniform bool atmosphere; varying vec2 vUv;
      void main() {
        vec2 d = vUv * size - centre;
        float r = max(length(d), 1e-3);
        vec2 uv = vec2(0.5 + atan(d.x, d.y) / 6.2831853, horizon + rise * log(r / ground));
        uv = mix(uv, vec2(0.5 + (vUv.x - 0.5) / stretch, vUv.y), flatten);
        uv.x = 0.5 + (uv.x - 0.5) / crop;
        vec4 street = uv.y > 1.0 || (flatten > 0.0 && uv.y < 0.0) ? vec4(0.0) : texture2D(map, vec2(uv.x, max(uv.y, 0.0)));
        vec3 background = atmosphere ? texture2D(skyMap, vUv).rgb : sky;
        gl_FragColor = vec4(street.rgb + background * (1.0 - street.a), 1.0);
        #include <colorspace_fragment>
      }`,
    depthTest: false,
  }));
  const flat = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  let stretch = 1, panoramaWidth = 1, panoramaHeight = 1;
  return {
    target,
    setSize(width, height) {
      stretch = lens.round / (2 * distance * Math.tan((fov * Math.PI) / 360) * (width / height));
      uniforms.stretch.value = stretch;
      // Only the central arc can reach this cropped planet's viewport. Render
      // that camera slice at its original pixel density, rather than a 9K panorama.
      const centreY = height * (1 - lens.top - lens.radius);
      uniforms.crop.value = Math.min(1, Math.max(Math.atan2(width / 2, Math.max(0, -centreY)) / Math.PI, 1 / stretch) * 1.04);
      panoramaWidth = Math.round(width * stretch); panoramaHeight = height;
      target.setSize(Math.min(renderer.capabilities.maxTextureSize, Math.ceil(panoramaWidth * uniforms.crop.value)), height);
      uniforms.size.value.set(width, height);
      uniforms.ground.value = lens.radius * height;
      uniforms.centre.value.set(width / 2, height * (1 - lens.top - lens.radius));
      uniforms.rise.value = (width * stretch) / (2 * Math.PI * height); // panorama heights per log step
    },
    // frame: the pose whose view of the lane sets the planet's surface row. A camera turning away from it
    // (the dive into the hole) rolls the street through the view instead of carrying the surface row along.
    render(camera, updateStreet = true, frame = camera) {
      if (updateStreet) {
        const capture = (pose) => {
          wide.copy(pose);
          wide.fov = fov;
          wide.aspect = camera.aspect * stretch;
          wide.setViewOffset(panoramaWidth, panoramaHeight, panoramaWidth * (1 - uniforms.crop.value) / 2,
            0, panoramaWidth * uniforms.crop.value, panoramaHeight);
          wide.updateProjectionMatrix();
        };
        capture(frame);
        uniforms.horizon.value = (lane.set(frame.position.x, 0, 0).project(wide).y + 1) / 2;
        if (frame !== camera) capture(camera);
        renderer.setRenderTarget(target);
        renderer.render(scene, wide);
      }
      renderer.setRenderTarget(null);
      renderer.render(pass, flat);
    },
    // A world point's place on the view, in px from the top left, through the same map.
    toView(point) {
      const p = point.clone().project(wide);
      const angle = Math.PI * p.x * uniforms.crop.value;
      const r = uniforms.ground.value * Math.exp(((p.y + 1) / 2 - uniforms.horizon.value) / uniforms.rise.value);
      return [uniforms.centre.value.x + r * Math.sin(angle), uniforms.size.value.y - uniforms.centre.value.y - r * Math.cos(angle)];
    },
    dispose() {
      target.dispose();
      pass.geometry.dispose();
      pass.material.dispose();
    },
  };
}

// Yield to the page between loading steps. Steps queue up and run in idle periods, several to a period while it
// still has the time the next one needs (need, ms), else in the next period with that room; a busy page still
// runs a step every 200 ms. The ticker draws every frame, so periods are the 10-14 ms left between frames.
let slots = Promise.resolve(), period = { timeRemaining: () => 0 };
const idle = (need = 6) => (slots = slots.then(() => new Promise((resolve) => {
  if (period.timeRemaining() >= need) return resolve(period);
  if (!window.requestIdleCallback) return setTimeout(resolve, 16, period = { timeRemaining: () => 0 });
  const wait = () => requestIdleCallback((deadline) => {
    if (deadline.timeRemaining() >= need || deadline.didTimeout) resolve(period = deadline);
    else wait();
  }, { timeout: 200 });
  wait();
})));

// Set: blocks stand in for the chores; a night street of Rodin buildings carries each automation's ad on the
// building at its stop (skyline() above); the rider and board are the approved Rodin
// models (grey blocks until they load, or if they cannot). Obstacles turn lime
// once the rider clears them. The sticker look is real
// 3D: three-band toon shading, an ink shell around every block and a cream die-cut shell around the
// run lane. Shells are back faces drawn slightly larger, so they outline the silhouette from any angle.
// It loads while the visitor scrolls the works above, so heavy steps run in small pieces between frames.
async function createScene(canvas, THREE, loader, config, unlocks, towers, lensConfig, holeConfig, mergeGeometries) {
  let live = true;
  // The works transition TV copies this canvas into its screen, so the last frame must stay readable.
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  await idle(10); // creating the context took this step
  const scene = new THREE.Scene();
  let last = null;
  const air = new THREE.Color('#121516');
  renderer.setClearColor(air, 0);
  scene.fog = new THREE.Fog(air, 10, 48);
  const sky = createRunnerSky(THREE, config.sky, () => {
    if (last) view.render(...last);
    canvas.dispatchEvent(new Event('runner-model-ready', { bubbles: true }));
  }, async (texture, image) => { // the moon uploads in idle time before the sky draws it
    await idle(10);
    if (!live) return image.close();
    Object.assign(texture, { image, needsUpdate: true });
    renderer.initTexture(texture);
  });
  if (!lensConfig) scene.background = sky.texture;
  const camera = new THREE.PerspectiveCamera(config.camera.fov, 1, 0.1, 110);
  const held = new THREE.PerspectiveCamera(); // the dive's planet frame
  const lens = lensConfig && tinyPlanet(THREE, renderer, scene, lensConfig, config.camera.z, sky.texture);
  // Wait for shaders compiling in parallel, polling here rather than through compileAsync(), whose timer
  // throws once a disposal (motion switched off mid-load) has removed one of their materials.
  const compiled = async (materials) => {
    while (live && [...materials].some((material) => renderer.properties.get(material).currentProgram?.isReady() === false)) {
      await new Promise((resolve) => setTimeout(resolve, 10)); // a cheap check: poll beside the step queue, not in it
    }
  };
  // Runs work through idle periods; heavy items wait for a period with room for them.
  const spread = async (items, work, heavy) => {
    for (const item of items) {
      await idle(heavy(item) ? 10 : 3);
      if (!live) return false;
      work(item);
    }
    return live;
  };
  const large = (bytes) => bytes > 1 << 18;
  // A model's first street frame would upload all of its buffers at once. A 1 px draw per buffer moves them
  // into idle time instead; three keeps one uploaded buffer per attribute, so the street then draws from it.
  const carrier = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial());
  carrier.frustumCulled = false;
  carrier.geometry.setDrawRange(0, 1);
  const pixel = new THREE.WebGLRenderTarget(1, 1);
  const upload = ([buffer, index]) => {
    const { geometry } = carrier;
    if (index) geometry.setIndex(buffer);
    else geometry.setAttribute('position', buffer);
    renderer.setRenderTarget(pixel);
    renderer.render(carrier, camera);
    renderer.setRenderTarget(null);
    geometry.setIndex(null);
    geometry.deleteAttribute('position');
  };
  // Before an object joins the street, its GPU work runs in idle time: textures, bounds, buffers, then its
  // shaders compiled off the main thread for the target the street renders into, and their first use, whose
  // error checks wait for the GPU. Its first street frame then only draws.
  const settle = async (object) => {
    const textures = new Set(), bounds = new Set(), buffers = new Map(), materials = new Map();
    object.traverse((node) => [node.material].flat().forEach((material) => {
      if (!material || materials.has(material)) return;
      materials.set(material, node);
      Object.values(material).forEach((value) => { if (value?.isTexture) textures.add(value); });
    }));
    object.traverseVisible((node) => {
      const { geometry } = node;
      if (!geometry) return;
      // Culling reads a mesh's own sphere where it has one (skins, batches, fragments), else its geometry's.
      if (!geometry.boundingBox || (node.boundingSphere === undefined && !geometry.boundingSphere) || node.boundingSphere === null) bounds.add(node);
      if (!node.layers.test(camera.layers)) return;
      if (geometry.index) buffers.set(geometry.index, [geometry.index, true]);
      Object.values(geometry.attributes).forEach((attribute) => buffers.set(attribute.data ?? attribute, [attribute, false]));
    });
    const compiling = new Set();
    if (!await spread(textures, (texture) => renderer.initTexture(texture), ({ image }) => large((image?.width ?? 0) * (image?.height ?? 0)))) return;
    if (!await spread(bounds, (node) => { // a skin's sphere poses every vertex: otherwise its first frame measures it
      if (!node.geometry.boundingBox) node.geometry.computeBoundingBox();
      if (node.boundingSphere === null) {
        object.updateMatrixWorld(true); // through its bones' current matrices, as its first frame would
        node.computeBoundingSphere();
      } else if (node.boundingSphere === undefined && !node.geometry.boundingSphere) node.geometry.computeBoundingSphere();
    }, ({ geometry }) => large(geometry.attributes.position.count * 12))) return;
    if (!await spread(buffers.values(), upload, ([buffer]) => large((buffer.array ?? buffer.data.array).byteLength))) return;
    if (!await spread(new Set(materials.values()), (node) => {
      renderer.setRenderTarget(lens ? lens.target : null);
      renderer.compile(node, camera, scene).forEach((material) => compiling.add(material));
      renderer.setRenderTarget(null);
    }, () => false)) return;
    await compiled(compiling);
    await spread(compiling, (material) => renderer.properties.get(material).currentProgram?.getUniforms(), () => true); // each waits on the GPU
  };
  const hole = createGroundBlackHole(THREE, scene, { ...holeConfig, viewDistance: camera.far, center: [TRACK[1], 0.025, holeConfig.centerZ] }, () => {
    if (last) view.render(...last);
    canvas.dispatchEvent(new Event('runner-model-ready', { bubbles: true }));
  }, idle);
  let collapse = 0;
  const mouth = { x: TRACK[1], z: holeConfig.centerZ };
  const rockQ = new THREE.Quaternion(), rockE = new THREE.Euler();
  const sun = new THREE.DirectionalLight('#ffe0bd', 2.2);
  sun.position.set(-4, 7, 6);
  scene.add(new THREE.HemisphereLight('#e8ece6', '#2a2d2e', 2.2), sun);

  const bands = new THREE.DataTexture(new Uint8Array([90, 170, 255]), 3, 1, THREE.RedFormat);
  bands.needsUpdate = true;
  const paint = (color) => new THREE.MeshToonMaterial({ color, gradientMap: bands });
  const ink = new THREE.MeshBasicMaterial({ color: '#15130f', side: THREE.BackSide });
  const sticker = new THREE.MeshBasicMaterial({ color: '#efe6d2', side: THREE.BackSide });
  // Shells for a geometry centred on its box: per-axis scale keeps each line t thick in world units.
  const outline = (mesh, [w, h, d], lane) => {
    for (const [t, material] of lane ? [[0.02, ink], [0.05, sticker]] : [[0.015, ink]]) {
      const shell = new THREE.Mesh(mesh.geometry, material);
      shell.scale.set(1 + (2 * t) / w, 1 + (2 * t) / h, 1 + (2 * t) / d);
      mesh.add(shell);
    }
    return mesh;
  };
  const add = (geometry, material, x, y, z, parent = scene) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  };
  const block = (w, h, d, material, x, y, z, parent, lane = false) =>
    outline(add(new THREE.BoxGeometry(w, h, d), material, x, y, z, parent), [w, h, d], lane);
  await idle(10); // the sky, lens and hole took this step; the road takes the next
  // Detailed near storefronts, then three increasingly subdued hillside streets.
  const [left, right] = [TRACK[0] - config.blockout.endPadding, TRACK[1] + config.blockout.endPadding];
  // Decoded off the main thread (flipped there, as the texture loader's upload would), then each uploads in idle
  // time; until then the material holds an empty texture.
  const bitmaps = new THREE.ImageBitmapLoader().setOptions({ imageOrientation: 'flipY' });
  const roadMaps = Object.fromEntries(['map', 'normalMap', 'roughnessMap'].map(slot => {
    const path = config.blockout.road[slot];
    const map = new THREE.Texture();
    map.flipY = false;
    bitmaps.load(path, async (image) => {
      await idle(10);
      if (!live) return image.close();
      Object.assign(map, { image, needsUpdate: true });
      renderer.initTexture(map);
      if (last) view.render(...last);
      canvas.dispatchEvent(new Event('runner-model-ready', { bubbles: true }));
    }, undefined, error => console.warn('Runner road texture unavailable', path, error));
    if (slot === 'map') map.colorSpace = THREE.SRGBColorSpace;
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    return [slot, map];
  }));
  const road = roadSurface(THREE, config.blockout, left, right, roadMaps);
  scene.add(road);
  hole.addSurface(road);
  const street = streetBlockout(towers, config.blockout, config.doorHeight);
  await idle(10); // the road took this step; each hillside texture takes about 13 ms
  const plaster = hillsideTexture(THREE, 'plaster');
  await idle(10);
  const concrete = hillsideTexture(THREE, 'concrete');
  await idle(10);
  const glazing = hillsideTexture(THREE, 'window');
  await idle();
  // Four world units per repeat on every box face, so tall retaining walls do not stretch the stains.
  const masonry = (w, h, d) => {
    const geometry = new THREE.BoxGeometry(w, h, d), uv = geometry.attributes.uv;
    for (let i = 0; i < uv.count; i += 1) {
      const face = Math.floor(i / 4);
      uv.setXY(i, uv.getX(i) * (face < 2 ? d : w) / 4, uv.getY(i) * (face === 2 || face === 3 ? d : h) / 4);
    }
    return geometry;
  };
  const walls = config.blockout.terraces.map((_, row) => new THREE.MeshStandardMaterial({
    color: new THREE.Color('#444c47').lerp(air, row * 0.2), map: concrete, bumpMap: concrete, bumpScale: 0.035, roughness: 1, fog: false,
  }));
  const homes = config.blockout.terraces.map((_, row) => ['#565b51', '#4e5a5b', '#61594e'].map(color => new THREE.MeshStandardMaterial({
    color: new THREE.Color(color).lerp(air, row * 0.24), map: plaster, bumpMap: plaster, bumpScale: 0.02, roughness: 0.95, fog: false,
  })));
  const shop = new THREE.MeshLambertMaterial({ color: '#676e6e', fog: false });
  const recess = new THREE.MeshLambertMaterial({ color: '#282e30', fog: false });
  const trim = new THREE.MeshStandardMaterial({ color: '#353d39', map: concrete, roughness: 1, fog: false });
  // One solid pavement buries the measured model bases, independent of each building's spacing.
  const { x, z, w, h, d } = street.sidewalk;
  const pavement = add(masonry(w, h + 0.5, d), new THREE.MeshStandardMaterial({
    color: '#74746a', map: concrete, bumpMap: concrete, bumpScale: 0.012, roughness: 1, fog: false,
  }), x, (h - 0.5) / 2, z);
  hole.addSurface(pavement);
  const terraces = [];
  for (const { x, z, w, h, d, row } of street.platforms) {
    await idle(3);
    const platform = add(masonry(w, h, d), walls[row], x, h / 2, z);
    platform.name = 'runner-terrace';
    terraces.push(platform);
  }
  // Emissive-looking panes carry their own warm light; no per-window scene lights or extra meshes.
  const warm = config.blockout.terraces.map((_, row) => ['#ffd39a', '#d9a766', '#edbf85'].map(color => new THREE.MeshBasicMaterial({
    color: new THREE.Color(color).lerp(air, row * 0.28), map: glazing, fog: false,
  })));
  const dark = new THREE.MeshBasicMaterial({ color: '#253033', map: glazing, fog: false });
  for (const [index, { x, y, z, w, h, d, row }] of street.homes.entries()) {
    await idle(4); // a few milliseconds a home
    const home = createHillsideHome(THREE, mergeGeometries, { x, y, z, w, h, d }, {
      wall: homes[row][Math.floor(hash(index + 31) * homes[row].length)], roof: trim,
      windowFor: (floor, side) => hash(index * 13 + floor + side) > 0.6 ? warm[row][(index + side) % warm[row].length] : dark,
    });
    // A home stands on its terrace (the same cell and row) and goes into the hole with it.
    terraces[index].attach(home);
    hole.addBody(terraces[index]);
  }
  await idle();
  await hole.batch(mergeGeometries, idle);
  const shopFallbacks = street.shops.map(({ x, y, z, w, h, d }) => {
    const group = new THREE.Group();
    scene.add(group);
    const height = h + y - street.sidewalk.h;
    add(new THREE.BoxGeometry(w, height, d), shop, x, street.sidewalk.h + height / 2, z, group);
    const front = z + d / 2;
    add(new THREE.BoxGeometry(w - 0.5, 1.8, 0.08), recess, x, street.sidewalk.h + 0.95, front + 0.05, group);
    hole.addBody(group);
    return group;
  });
  const [dim, lit] = [new THREE.Color('#5d6366'), new THREE.Color('#c8ff35')];
  const props = [];
  const marks = RUN.map(({ trick, x, w, h }, i) => {
    const material = paint(dim);
    const obstacle = new THREE.Group();
    obstacle.name = `runner-obstacle-${i}`;
    scene.add(obstacle);
    if (trick === 'boardslide') {
      // Stands in until runner-rail.glb loads, or if it cannot.
      const top = h + DECK + 0.003; // the normalized deck underside, not the wheels, rides the rail
      block(w, 0.06, 0.06, material, x + w / 2, top - 0.03, 0, obstacle, true);
      [x + 0.2, x + w - 0.2].forEach((px) => block(0.05, top, 0.05, material, px, top / 2, 0, obstacle, true));
    } else {
      // Centred on the wedge's centroid so the shells grow outwards on every face, the slope included.
      const shape = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(w, 0), new THREE.Vector2(w, h)]);
      const wedge = new THREE.ExtrudeGeometry(shape, { depth: 0.9, bevelEnabled: false }).translate((-2 * w) / 3, -h / 3, -0.45);
      outline(add(wedge, material, x + (2 * w) / 3, h / 3, 0, obstacle), [w, h, 0.9], true);
    }
    props.push({ obstacle, x: trick === 'boardslide' ? x + w / 2 : x, i, rail: trick === 'boardslide' });
    hole.addBody(obstacle);
    return { material, base: dim };
  });
  // Two downloads at a time, each fetched in its own worker: the loader's request pumps every chunk through
  // script, and even fetch() finishes a body on the thread that asked for it, 30-60 ms per storefront. A
  // stalled file holds only one place; each file then starts parsing in idle time.
  const fetcher = URL.createObjectURL(new Blob([`onmessage = async ({ data: url }) => {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(response.status + ' ' + url);
      const data = await response.arrayBuffer();
      postMessage(data, [data]);
    } catch (error) {
      postMessage(String(error));
    }
  };`], { type: 'text/javascript' }));
  let downloading = 0;
  const waiting = [];
  const loadModel = async (path) => {
    while (downloading >= 2) await new Promise((resolve) => waiting.push(resolve));
    downloading += 1;
    const worker = new Worker(fetcher);
    const data = await new Promise((resolve, reject) => {
      worker.onmessage = ({ data: reply }) => (typeof reply === 'string' ? reject(new Error(reply)) : resolve(reply));
      worker.postMessage(new URL(path, location.href).href);
    }).finally(() => {
      worker.terminate();
      downloading -= 1;
      waiting.shift()?.();
    });
    await idle(8);
    return loader.parseAsync(data, '');
  };
  for (const [path, railProp, paintName] of [[config.railModel, true, 'Weathered grey green paint'], [config.rampModel, false, 'Ramp paint']]) {
    loadModel(path).then(async ({ scene: model }) => {
      if (!live) { disposeObject(model); return; }
      model.traverse((node) => {
        if (!node.isMesh) return;
        const old = node.material;
        node.material = new THREE.MeshToonMaterial({ name: old.name, color: old.color, gradientMap: bands });
        old.dispose();
      });
      await settle(model);
      if (!live) { disposeObject(model); return; }
      props.filter(({ rail }) => rail === railProp).forEach(({ obstacle, x, i }) => {
        const prop = model.clone();
        prop.position.x = x;
        // Each obstacle's own paint turns lime once the rider clears it.
        prop.traverse((node) => {
          if (node.material?.name !== paintName) return;
          node.material = node.material.clone();
          marks[i] = { material: node.material, base: node.material.color.clone() };
        });
        obstacle.children.forEach((child) => { child.visible = false; });
        obstacle.add(prop);
        hole.addBody(obstacle);
      });
      if (last) view.render(...last);
      canvas.dispatchEvent(new Event('runner-model-ready', { bubbles: true }));
    }).catch((error) => console.warn('Runner obstacle unavailable', path, error));
  }

  // Rider: the board flips about its own long axis; the body spins and leans with the whole rider.
  const rider = new THREE.Group();
  rider.rotation.order = 'ZYX';
  const board = new THREE.Group();
  board.rotation.order = 'YZX';
  board.position.y = DECK;
  const boardFallback = new THREE.Group();
  board.add(boardFallback);
  const side = paint('#3a3f42');
  block(1, 0.0195, 0.27, [side, side, paint('#1b1d1e'), paint('#ff7a2f'), side, side], 0, 0.01275, 0, boardFallback, true);
  const wheel = paint('#d9dcd6');
  for (const wx of [-0.33, 0.33]) for (const wz of [-0.1, 0.1]) block(0.08, 0.08, 0.06, wheel, wx, -0.06, wz, boardFallback, true);
  const body = new THREE.Group();
  body.rotation.y = -0.35;
  block(0.3, 0.36, 0.24, paint('#6f8f7a'), 0, 0.18, 0, body, true);
  block(0.4, 0.42, 0.3, paint('#d9dcd6'), 0, 0.57, 0, body, true);
  block(0.3, 0.26, 0.28, paint('#f2f3ee'), 0, 0.91, 0, body, true);
  block(0.14, 0.1, 0.14, paint('#1b1d1e'), 0.2, 0.88, 0, body, true); // the snout shows which way it faces
  rider.add(board, body);
  scene.add(rider);
  hole.addBody(rider, { intact: true }); // only render() moves it; the hole's pieces flow around it
  const shadow = add(new THREE.CircleGeometry(0.45, 24), new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.45, depthWrite: false }), 0, 0.004, 0);
  shadow.rotation.x = -Math.PI / 2;

  let dog = null;
  const disposeObject = (root) => root.traverse((node) => {
    node.geometry?.dispose();
    [node.material].flat().forEach((material) => {
      if (material) Object.values(material).forEach((value) => { if (value?.isTexture) value.dispose(); });
      material?.dispose();
    });
  });
  config.blockout.shops.forEach(({ model: path }) => {
    loadModel(path).then(async ({ scene: model }) => {
      if (!live) { disposeObject(model); return; }
      model.traverse((node) => {
        if (!node.isMesh) return;
        if (node.geometry.attributes._backing) {
          node.material = Array.isArray(node.material) ? node.material.map(hideShopBacking) : hideShopBacking(node.material);
        }
        [node.material].flat().forEach((material) => {
          material.fog = false;
          material.roughness = Math.max(material.roughness, 0.65);
          // Transmissive storefront glass flashes pure black in the planet render target while scrolling.
          if (material.transmission > 0) material.transmission = 0;
          if (material.map) material.map.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
        });
      });
      await settle(model);
      if (!live) { disposeObject(model); return; }
      street.shops.forEach(({ model: source, scale, x, y, z, offsetX, offsetZ }, i) => {
        if (source !== path) return;
        const instance = model.clone();
        instance.scale.setScalar(scale);
        instance.position.set(x - offsetX, y, z - offsetZ);
        scene.add(instance);
        hole.addBody(instance);
        shopFallbacks[i].children.forEach((child) => { child.visible = false; });
      });
      if (last) view.render(...last);
      canvas.dispatchEvent(new Event('runner-model-ready', { bubbles: true }));
    }).catch((error) => console.warn('Runner storefront unavailable', path, error));
  });
  loadModel(config.boardModel).then(async ({ scene: model }) => {
    if (!live) { disposeObject(model); return; }
    const materials = new Map();
    model.traverse((node) => {
      if (!node.isMesh) return;
      const old = node.material;
      if (!materials.has(old)) materials.set(old, new THREE.MeshToonMaterial({ color: old.color, map: old.map, gradientMap: bands }));
      node.material = materials.get(old);
    });
    materials.forEach((_, old) => old.dispose());
    await settle(model);
    if (!live) { disposeObject(model); return; }
    board.add(model);
    boardFallback.visible = false;
    if (last) view.render(...last);
    canvas.dispatchEvent(new Event('runner-model-ready', { bubbles: true }));
  }).catch((error) => console.warn('Runner skateboard unavailable', error));
  loadModel(config.dogModel)
    .then(async (gltf) => {
      if (!live) { disposeObject(gltf.scene); return; }
      const dressed = dressDog(gltf.scene, THREE, (map) => new THREE.MeshToonMaterial({ map, gradientMap: bands }));
      await settle(dressed.root);
      if (!live) { disposeObject(dressed.root); return; }
      dog = dressed;
      rider.add(dog.root);
      body.visible = false;
      if (last) view.render(...last);
      canvas.dispatchEvent(new Event('runner-model-ready', { bubbles: true }));
    })
    .catch((error) => console.warn('Runner dog unavailable', error));
  // Each automation's screen shows its poster(); it brightens with the camera's distance and turns once
  // when the camera arrives (flips: ad -> start time).
  const billboards = [];
  const flips = new Map();
  // Flat normals are shared by the six focal towers. Only ad screens ignore fog and brighten near the camera.
  Promise.all(config.buildings.map(({ model }) => loadModel(model)))
    .then(async (files) => {
      const drop = () => { files.forEach(({ scene: model }) => disposeObject(model)); return []; };
      if (!live) return drop();
      const looks = new Map();
      const sources = [];
      for (const { scene: model } of files) {
        const meshes = [];
        model.traverse((node) => { if (node.isMesh) meshes.push(node); });
        for (const node of meshes) {
          await idle(10); // flattening a tower mesh takes about 13 ms
          if (!live) return drop();
          prepareTowerGeometry(THREE, node);
          const old = node.material;
          if (!looks.has(old) && old.name !== 'Ad screen') {
            const neon = /neon/i.test(old.name);
            const glazing = old.emissive.getHex() !== 0 && !neon;
            looks.set(old, new THREE.MeshToonMaterial({
              color: old.color.clone().multiplyScalar(glazing ? 0.28 : 1), emissive: old.emissive,
              emissiveIntensity: neon ? 0.28 : 0.08, gradientMap: bands,
            }));
          }
        }
        sources.push(model);
      }
      const built = new THREE.Group(); // settled together before they join the street
      const ads = towers.flatMap(({ x, z, scale, heightMultiplier, yaw, offsetX, offsetZ, baseHeight, model: id, ad }) => {
        const building = sources[id].clone();
        building.scale.setScalar(scale);
        building.scale.y *= heightMultiplier;
        building.rotation.y = yaw;
        building.position.set(x - offsetX, street.sidewalk.h - baseHeight - 0.005, z - offsetZ);
        built.add(building);
        building.name = `runner-tower-${ad}`;
        const ads = [];
        building.traverse((node) => {
          if (!node.isMesh) return;
          const old = node.material;
          if (old.name !== 'Ad screen') { node.material = looks.get(old); return; }
          node.material = new THREE.MeshBasicMaterial({ color: '#000', fog: false, side: THREE.DoubleSide });
          node.geometry.computeBoundingBox();
          const size = node.geometry.boundingBox.getSize(new THREE.Vector3());
          ads.push({ material: node.material, node, base: node.scale.x, ad, x, aspect: size.x / size.y });
        });
        return ads;
      });
      // Clones now share the prepared toon materials; dispose imported PBR materials last.
      looks.forEach((_, old) => old.dispose());
      await settle(built);
      if (!live) return drop();
      for (const building of [...built.children]) {
        scene.add(building);
        hole.addBody(building);
      }
      billboards.push(...ads);
      return ads;
    })
    .then(async (ads) => {
      for (const { material, node, ad, aspect } of ads) { // one poster per step: fitting the headline measures a lot of text
        const art = await poster(unlocks[ad], Math.round(1024 * Math.min(1, aspect)), Math.round(1024 / Math.max(1, aspect)));
        if (!live) return;
        const map = new THREE.CanvasTexture(art);
        map.colorSpace = THREE.SRGBColorSpace;
        map.flipY = false; // glTF UVs
        node.layers.disable(0); // off the street camera until its upload and shader are ready; still a hole part
        Object.assign(material, { map, needsUpdate: true });
        await settle(node);
        node.layers.enable(0);
      }
    })
    .then(() => {
      if (!live) return;
      if (last) view.render(...last);
      canvas.dispatchEvent(new Event('runner-model-ready', { bubbles: true }));
    })
    .catch((error) => console.warn('Runner buildings unavailable', error));

  const view = {
    resize(width, height) {
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      lens?.setSize(width, height);
      sky.resize(width, height);
      if (collapse > 0 && last) view.render(...last);
    },
    // cam is the camera's x, x the rider's: each runs on its own clock. The hole follows the scroll, but waits
    // for the rider (holeAt); it adds only the scroll's rocking and plunge to the rider's own path.
    render(cam, x, skyTime = 0, updateStreet = true) {
      last = [cam, x, skyTime];
      const p = pose(x);
      const shown = holeAt(collapse, x);
      const flying = { x, y: p.y, z: holeConfig.centerZ * p.toHole };
      const { scale, position, rock } = riderCollapseFrame(shown, flying, mouth, holeConfig.maxRadius);
      rider.scale.setScalar(scale);
      rider.position.set(...position);
      rider.rotation.set(0, p.spin, p.tilt);
      rider.quaternion.premultiply(rockQ.setFromEuler(rockE.set(...rock)));
      board.rotation.set(p.flip, p.shuv, p.pop);
      if (dog) dog.pose(p, (pose(x + 0.05).y - pose(x - 0.05).y) / 0.1, x);
      body.position.y = DECK + 0.0225 + 0.2 * p.tuck;
      body.scale.y = 1 - 0.28 * p.crouch;
      shadow.position.set(x, 0.004, flying.z);
      shadow.scale.setScalar(1 / (1 + p.y));
      shadow.visible = shown <= OPENING_START; // none once the mouth opens beneath it
      camera.position.set(cam, config.camera.y, config.camera.z);
      camera.lookAt(cam, config.camera.lookY, 0); // low beside the lane, looking up at the stop's building
      let frame = camera;
      if (shown > 0) {
        const lift = ease(shown, 0.12, 0.5);
        camera.position.y += lift * 0.8;
        const lookY = config.camera.lookY * (1 - lift) + lift * 2.5;
        camera.lookAt(cam, lookY, holeConfig.centerZ * ease(shown, 0, 0.22));
        // The camera follows the rider down: it orbits the point it looks at, far out over the mouth rather than
        // turning about the lens, while that point sinks with the falling rider into the throat. It rises over
        // the mouth, then closes in above the throat looking down into it.
        const into = ease(shown, 0.55, 0.95);
        if (into > 0) {
          frame = held.copy(camera);
          const throat = -0.55 * holeConfig.maxRadius;
          const centre = lookY + (throat - lookY) * ease(shown, 0.6, 0.88);
          const up = camera.position.y - lookY, out = config.camera.z - holeConfig.centerZ;
          const angle = Math.atan2(up, out) + (Math.atan2(-0.6 - throat, 0.3) - Math.atan2(up, out)) * ease(shown, 0.55, 0.92);
          const reach = Math.hypot(up, out) + (Math.hypot(-0.6 - throat, 0.3) - Math.hypot(up, out)) * into;
          camera.position.set(cam, centre + reach * Math.sin(angle), holeConfig.centerZ + reach * Math.cos(angle));
          camera.lookAt(cam, centre, holeConfig.centerZ);
        }
        updateStreet = true;
      }
      hole.update(shown);
      RUN.forEach(({ land }, i) => marks[i].material.color.copy(x >= land ? lit : marks[i].base));
      billboards.forEach(({ material, x: at }) => material.color.setScalar(0.16 + 0.84 * (1 - ease(Math.abs(cam - at), 2, 8))));
      const now = performance.now();
      flips.forEach((start, ad) => {
        if (collapse > 0) { ad.node.scale.x = ad.base; flips.delete(ad); return; }
        const t = (now - start) / 700;
        ad.node.scale.x = ad.base * (t >= 1 ? 1 : Math.max(0.04, Math.abs(Math.cos(TAU * t)))); // one full turn
        if (t >= 1) flips.delete(ad);
      });
      sky.render(renderer, skyTime);
      if (lens) lens.render(camera, updateStreet, frame);
      else renderer.render(scene, camera);
    },
    busy: () => flips.size > 0,
    collapse(progress) {
      if (collapse === progress) return;
      collapse = progress;
      if (last) view.render(...last);
    },
    flip(i) {
      const ad = billboards.find((b) => b.ad === i);
      if (ad) flips.set(ad, performance.now());
    },
    // The ad screen's box on the canvas in CSS pixels, as last rendered.
    anchor(i) {
      const ad = billboards.find((b) => b.ad === i);
      if (!ad) return null;
      const box = new THREE.Box3().setFromObject(ad.node);
      const [xs, ys] = [[], []];
      for (let corner = 0; corner < 8; corner += 1) {
        const point = new THREE.Vector3(corner & 1 ? box.max.x : box.min.x, corner & 2 ? box.max.y : box.min.y, corner & 4 ? box.max.z : box.min.z);
        const p = lens ? null : point.project(camera);
        const [x, y] = lens ? lens.toView(point) : [((p.x + 1) / 2) * canvas.clientWidth, ((1 - p.y) / 2) * canvas.clientHeight];
        xs.push(x);
        ys.push(y);
      }
      return { left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys) };
    },
    dispose() {
      live = false;
      hole.dispose();
      lens?.dispose();
      sky.dispose();
      disposeObject(scene);
      bands.dispose();
      URL.revokeObjectURL(fetcher);
      carrier.geometry.dispose();
      carrier.material.dispose();
      pixel.dispose();
      renderer.dispose();
    },
  };
  await Promise.all([settle(scene), compiled(sky.compile(renderer))]); // so the first frame below only draws
  return view;
}

const DOG_HEIGHT = 1.06; // world units, the graybox rider's height
const DOG_YAW = 0.7; // three-quarter view towards the run, so knee bends read in silhouette

// The rigged dog (scripts/runner-dog-rig.py) posed from pose(x) every frame, so it scrubs both ways.
// turn(bone, axis, angle, ...) rotates a bone about the model's rest axes (x: the dog's left, y: up,
// z: its front) at its own joint, rightmost first; children inherit it, so a child's turn is relative.
// The legs are solved last: the hips sit over both ankles, then two-bone IK puts each ankle exactly on its
// target (the deck, or the ground for a kick-push) with the knee towards the dog's front.
function dressDog(root, THREE, toon) {
  const bones = {};
  let skin = null;
  root.updateMatrixWorld(true);
  root.traverse((node) => {
    if (node.isSkinnedMesh) skin = node;
    if (!node.isBone) return;
    const rest = node.getWorldQuaternion(new THREE.Quaternion());
    const at = node.getWorldPosition(new THREE.Vector3());
    bones[node.name] = { node, local: node.quaternion.clone(), rest, inverse: rest.clone().invert(), at };
  });
  const box = new THREE.Box3().setFromBufferAttribute(skin.geometry.attributes.position);
  const scale = DOG_HEIGHT / (box.max.y - box.min.y);
  root.scale.setScalar(scale);

  const old = skin.material;
  skin.material = toon(old.map);
  old.dispose();
  // Thin ink line: the same skinned mesh drawn inside out, pushed out along its skinned normals.
  const ink = new THREE.MeshBasicMaterial({ color: '#15130f', side: THREE.BackSide });
  ink.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace('#include <skinning_vertex>', '#include <skinning_vertex>\n\ttransformed += normalize( objectNormal ) * 0.02;');
  };
  const shell = new THREE.SkinnedMesh(skin.geometry, ink);
  shell.position.copy(skin.position);
  shell.quaternion.copy(skin.quaternion);
  shell.scale.copy(skin.scale);
  shell.bind(skin.skeleton, skin.bindMatrix);
  skin.parent.add(shell);
  skin.frustumCulled = shell.frustumCulled = false;

  const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
  const Q = () => new THREE.Quaternion();
  const AXES = { x: V(1, 0, 0), y: V(0, 1, 0), z: V(0, 0, 1) };
  // Elbows bend about the axis across each arm's rest bend; positive folds the forearm further.
  for (const side of ['Left', 'Right']) {
    const [shoulder, elbow, hand] = ['UpperArm', 'LowerArm', 'Hand'].map((name) => bones[side + name].at);
    AXES[side + 'Elbow'] = V().subVectors(elbow, shoulder).cross(V().subVectors(hand, elbow)).normalize();
  }
  const [delta, step] = [Q(), Q()];
  const turn = (name, ...steps) => {
    const bone = bones[name];
    delta.identity();
    for (let i = 0; i < steps.length; i += 2) delta.multiply(step.setFromAxisAngle(AXES[steps[i]], steps[i + 1]));
    bone.node.quaternion.copy(bone.local).multiply(step.copy(bone.inverse).multiply(delta).multiply(bone.rest));
  };

  // A bone frame: y along the bone, x across its bend plane. A bone keeps its rest offset from that frame.
  const basis = new THREE.Matrix4();
  const across = V();
  const frame = (dir, side, q) => q.setFromRotationMatrix(basis.makeBasis(side, dir, across.crossVectors(side, dir)));
  const segment = (from, to) => {
    const dir = V().subVectors(to.at, from.at);
    const length = dir.length() * scale;
    dir.normalize();
    return { length, offset: frame(dir, V().crossVectors(dir, AXES.z).normalize(), Q()).invert().multiply(from.rest) };
  };
  const legs = [['Left', 1], ['Right', -1]].map(([side, sign]) => {
    const [hip, knee, ankle, toes] = ['UpperLeg', 'LowerLeg', 'Foot', 'ToesEnd'].map((name) => bones[side + name]);
    const ball = V().addVectors(ankle.at, toes.at).multiplyScalar(0.5).setY(box.min.y); // sole centre
    const [thigh, shin] = [segment(hip, knee), segment(knee, ankle)];
    return { sign, hip, knee, ankle, thigh, shin, reach: 0.98 * (thigh.length + shin.length), heel: ankle.at.clone().sub(ball).multiplyScalar(scale), foot: Q(), joint: V(), target: V() };
  });
  const [hipAt, kneeAt, dir, axis, bend, pole, mid, aim] = Array.from({ length: 8 }, () => V());
  const [riderQ, yawQ, deckQ, thighQ, shinQ, parentQ] = Array.from({ length: 6 }, Q);
  // Two-bone IK in world space: target is the ankle, footQ the foot's world rotation.
  const solve = (leg, target, footQ) => {
    const { thigh, shin } = leg;
    leg.hip.node.getWorldPosition(hipAt);
    dir.subVectors(target, hipAt);
    const dist = Math.min(dir.length(), (thigh.length + shin.length) * 0.999);
    dir.normalize();
    const cos = (thigh.length ** 2 + dist ** 2 - shin.length ** 2) / (2 * thigh.length * dist);
    axis.crossVectors(dir, pole).normalize();
    bend.crossVectors(axis, dir);
    kneeAt.copy(hipAt).addScaledVector(dir, thigh.length * cos).addScaledVector(bend, thigh.length * Math.sqrt(1 - cos * cos));
    target.copy(hipAt).addScaledVector(dir, dist);
    frame(dir.subVectors(kneeAt, hipAt).normalize(), axis, thighQ).multiply(thigh.offset);
    leg.hip.node.parent.getWorldQuaternion(parentQ);
    leg.hip.node.quaternion.copy(parentQ.invert().multiply(thighQ));
    frame(dir.subVectors(target, kneeAt).normalize(), axis, shinQ).multiply(shin.offset);
    leg.knee.node.quaternion.copy(parentQ.copy(thighQ).invert().multiply(shinQ));
    leg.ankle.node.quaternion.copy(parentQ.copy(shinQ).invert().multiply(footQ));
  };

  return {
    root,
    // vy is the run's climb per unit of x, which lags the tail; x keeps it wagging as the run goes on.
    pose(p, vy, x) {
      const crouch = Math.min(1.2, p.crouch);
      const flex = 0.32 + 0.45 * crouch + 0.55 * p.tuck; // knee flex sets the hip height over the ankles
      const lean = 0.15 + 0.25 * Math.min(1, crouch) + 0.2 * p.tuck + 0.3 * p.push;
      const level = 0.85 * p.tilt; // a manual tips the board; the upper body stays nearly upright
      const fall = p.balance * Math.min(1, Math.max(0, -vy)); // dropping towards a landing
      // Arms spread to balance from take-off, rise higher while dropping and fling forward on impact.
      const spread = Math.min(1.4, p.balance + 0.4 * fall + 0.3 * p.land);
      const look = 0.35 * Math.cos(p.spin); // the head keeps turning towards the run as the rider spins
      const yaw = DOG_YAW * Math.cos(p.spin); // a boardslide (spin π/2) shows the dog in profile
      root.rotation.y = yaw;
      const lift = Math.max(-0.4, Math.min(0.5, 0.15 - 0.35 * vy));
      turn('Hips', 'z', -level, 'x', lean);
      for (const [side, sign] of [['Left', 1], ['Right', -1]]) {
        // The arm opposite the kicking (right) leg swings forward as that leg pushes back.
        const reach = 0.5 * p.land - 0.7 * p.wind - 0.6 * sign * p.swing;
        turn(side + 'UpperArm', 'y', -sign * 0.45 * (1 - 0.6 * Math.min(1, spread)), 'x', -reach, 'z', sign * (0.25 + 0.65 * spread));
        turn(side + 'LowerArm', 'y', -sign * 0.6 * (1 - 0.5 * Math.min(1, spread)), side + 'Elbow', 0.25 * spread + 0.3 * p.land);
      }
      turn('Chest', 'y', 0.4 * look);
      turn('Neck', 'y', 0.3 * look, 'x', -0.5 * lean + 0.2 * p.land);
      turn('Head', 'y', 0.5 * look);
      for (let i = 1; i <= 4; i += 1) turn('Tail' + i, 'x', 0.3 * lift, 'y', 0.12 * Math.sin(2.4 * x - 0.6 * i));

      // Ankle targets in rider space: soles on the deck, tilting with the ollie pop while the front foot
      // drags towards the nose, lifted off for a flip trick; the back sole follows the kick-push path.
      const rider = root.parent;
      root.position.set(0, 0, 0);
      rider.updateMatrixWorld(true);
      deckQ.setFromAxisAngle(AXES.z, p.pop * (1 - p.tuck));
      mid.set(0, 0, 0);
      aim.set(0, 0, 0);
      for (const leg of legs) {
        const front = leg.sign > 0;
        const sole = leg.target.set(front ? STANCE + (0.08 * Math.max(0, p.pop)) / 0.35 : -STANCE, TOP - DECK, 0).applyQuaternion(deckQ);
        sole.y += DECK + 0.3 * p.tuck;
        if (!front && p.step) sole.fromArray(p.step);
        leg.foot.copy(deckQ).multiply(yawQ.setFromAxisAngle(AXES.y, yaw + (front ? 0 : 0.5 * p.push)));
        sole.add(dir.copy(leg.heel).applyQuaternion(leg.foot));
        mid.add(rider.worldToLocal(leg.hip.node.getWorldPosition(leg.joint)));
        aim.add(sole);
      }
      mid.multiplyScalar(0.5);
      aim.multiplyScalar(0.5);
      // Hips over the ankles at the knee flex, but low enough for both legs to reach: a kick-push drops
      // the hips and bends the front knee deep, because this dog's legs are short next to the deck.
      aim.y += (legs[0].thigh.length + legs[0].shin.length) * Math.cos(flex) * 0.96;
      for (const leg of legs) {
        hipAt.subVectors(leg.joint, mid).add(aim);
        const h = Math.hypot(leg.target.x - hipAt.x, leg.target.z - hipAt.z);
        aim.y = Math.min(aim.y, leg.target.y + Math.sqrt(Math.max(0, leg.reach ** 2 - h * h)) - (leg.joint.y - mid.y));
      }
      root.position.subVectors(aim, mid);
      rider.updateMatrixWorld(true);
      rider.getWorldQuaternion(riderQ);
      yawQ.setFromAxisAngle(AXES.y, yaw);
      for (const leg of legs) {
        pole.set(0.3 * leg.sign, 0, 1).normalize().applyQuaternion(yawQ).applyQuaternion(riderQ);
        solve(leg, rider.localToWorld(leg.target), leg.foot.premultiply(riderQ).multiply(leg.ankle.rest));
      }
    },
  };
}
