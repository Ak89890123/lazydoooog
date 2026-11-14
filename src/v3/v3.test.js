import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { collectWorks, fitTvPicture, renderWorks } from './works.js';
import { addWork } from '../../scripts/works.mjs';
import { LAND_FOV, beltPlan, bodyBounds, landing } from './hero-3d-scene.js';
import { DOG, INSET, OBSTACLES, PHYSICS, airWindow } from './skate-game.js';
import { RUN, STOPS, TRACK, WAIT, cameraAt, catchUp, chase, hillsideTexture, holeAt, pose, roadSurface, skyline, snapStop, streetBlockout, tinyPlanet } from './skate-runner.js';
import { PAPER_HEIGHT, PLANET_TOP, careerDistance, careerFrame, careerPhone, careerPose, careerStopProgress } from './career-flight.js';
import { buildSheet, flatness, posePaper } from './paper-crumple.js';
import { createGroundBlackHole } from './black-hole.js';
import { OPENING_START, openingAt, collapseFrame, collapseLean, collapsePull, collapseSwirl, riderCollapseFrame } from './collapse-motion.js';

const { Box3, PerspectiveCamera, Vector3 } = THREE;

const tv = JSON.parse(readFileSync(new URL('./tv-frames.json', import.meta.url), 'utf8'));
const worksDir = new URL('../../works/', import.meta.url);

const bodyState = (root) => ({
  position: root.position.toArray(), quaternion: root.quaternion.toArray(),
  scale: root.scale.toArray(), visible: root.visible,
});

test('opening strength gates distance-ordered trembling, release and suction into the mouth', () => {
  const config = { openUntil: 0.56, gravity: 2100, duration: 9 };
  assert.equal(openingAt(0.22, config), 0);
  assert.equal(openingAt(0.7, config), 1);
  let previous = 0;
  for (const distance of [0, 6, 15, 40, 80, 200]) {
    const { start } = collapseFrame(0, distance, config);
    assert.ok(start > previous && start > 0.22 && start < config.openUntil);
    assert.ok(Math.abs(collapseFrame(start, distance, config).stress - 1) < 1e-10,
      'release occurs when the growing opening reaches that distance resistance');
    assert.equal(collapseFrame(0.03, distance, config).shake, 0);
    const before = collapseFrame(start - 0.025, distance, config);
    assert.ok(before.shake > 0 && before.flight === 0, 'the intact structure trembles before it breaks');
    assert.equal(collapseFrame(0.7, distance, config).flight, 1,
      'the street is in by 0.7, before the rider sinks into the throat, even with the 0.04 stagger');
    previous = start;
  }
  assert.ok(collapsePull(0) === 0 && collapsePull(1) === 1 && collapseLean(0) === 0);
  let gain = 0;
  for (let step = 1; step <= 100; step += 1) {
    const flight = step / 100, before = (step - 1) / 100;
    const next = collapsePull(flight) - collapsePull(before);
    assert.ok(next > gain, 'drawn in faster and faster, never settling short of the mouth');
    assert.ok(collapseLean(flight) > collapseLean(before), 'leaning further over as it goes');
    gain = next;
  }
  assert.equal(collapseSwirl(12, 0), 0, 'no swirl before the pull');
  assert.ok(collapseSwirl(3, 0.5) > 4 * collapseSwirl(30, 0.5), 'like a drain: far out it comes almost straight in');
});

test('the hole never moves the intact rider; its pieces flow around wherever the rider is now', () => {
  const scene = new THREE.Scene(), geometry = new THREE.BoxGeometry(2, 2, 2), source = new THREE.MeshBasicMaterial();
  const piece = new THREE.Mesh(geometry, source), rider = new THREE.Mesh(geometry, source);
  piece.position.set(6, 1, 0);
  rider.position.set(40, 0, 0);
  scene.add(piece, rider);
  const controller = createGroundBlackHole(THREE, scene,
    { center: [0, 0.025, 0], maxRadius: 3.1, gravity: 2100, duration: 9, openUntil: 0.56 });
  controller.addBody(piece);
  controller.addBody(rider, { intact: true });
  const mesh = scene.getObjectByName(`runner-fragments-${piece.id}`).children[0];
  const shader = { uniforms: {}, vertexShader: 'void main() {}', fragmentShader: '' };
  mesh.material.onBeforeCompile(shader);
  const at = mesh.geometry.attributes.contact.getX(0) * 12;
  const sample = (p) => {
    controller.update(p);
    return Array.from(shader.uniforms.contactTexture.value.image.data.slice(at, at + 12));
  };
  const free = sample(0.46);
  // Its owner flies the rider into the piece's path, turned and shrinking.
  rider.position.set(free[0], free[1], free[2]);
  rider.rotation.set(0.2, 0.4, 0);
  rider.scale.setScalar(0.8);
  const placed = bodyState(rider);
  const pushed = sample(0.46);
  assert.deepEqual(bodyState(rider), placed, 'the hole never moves, turns or shrinks the rider');
  const box = new Box3().setFromObject(rider), centre = box.getCenter(new Vector3()), half = box.getSize(new Vector3()).multiplyScalar(0.5);
  const e = new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion(...pushed.slice(8, 12))).elements;
  const extent = [0, 1, 2].map((axis) => (Math.abs(e[axis]) + Math.abs(e[axis + 4]) + Math.abs(e[axis + 8])) * pushed[3]);
  assert.ok([0, 1, 2].some((axis) => Math.abs(pushed[axis] - centre.getComponent(axis)) >= extent[axis] + half.getComponent(axis) - 1e-6),
    'the piece is pushed clear of the rider');
  rider.position.set(40, 0, 0);
  assert.deepEqual(sample(0.46), free, 'the pieces follow the rider where it is now, not where it was registered');
  assert.equal(scene.getObjectByName(`runner-fragments-${rider.id}`), undefined, 'no fractured rider copies are created');
  controller.update(0); controller.dispose();
  assert.equal(rider.position.x, 40, 'cleanup leaves the rider where its owner put it');
  geometry.dispose(); source.dispose();
});

test('the black hole waits for the rider, catches it in the air off the kicker and draws it in from there', () => {
  const config = JSON.parse(readFileSync(new URL('../animation-map.json', import.meta.url))).v3.experience.groundHole;
  const ramp = RUN.at(-1), lip = ramp.x + ramp.w, mouth = { x: TRACK[1], z: config.centerZ };
  assert.ok(WAIT > STOPS.at(-2) && WAIT < ramp.x, 'at the last ad the rider waits short of the kicker');
  // However far the scroll has gone, the hole stays shut until the rider leaves the lip.
  for (let x = STOPS.at(-2); x < lip; x += 0.01) assert.equal(holeAt(1, x), OPENING_START, `the hole waits for the rider at ${x}`);
  assert.equal(openingAt(OPENING_START, config), 0);
  // Off the lip it never comes down: it rises, turns once and hovers over the mouth while the hole opens with it.
  let previous = OPENING_START, lowest = Infinity;
  for (let x = lip; x <= TRACK[1]; x += 0.01) {
    assert.ok(holeAt(1, x) >= previous, 'the hole opens further as the flight carries the rider in');
    previous = holeAt(1, x);
    lowest = Math.min(lowest, pose(x).y);
  }
  assert.ok(lowest >= ramp.h - 1e-9, 'caught in the air');
  const hover = pose(TRACK[1]);
  assert.ok(hover.toHole === 1 && hover.y > 1.5 && hover.spin > 6 && Math.cos(hover.spin) === 1, 'a full turn on the way up to the hover');
  assert.equal(holeAt(0.4, TRACK[1]), 0.4, 'once the rider hovers, the hole follows the scroll');
  // The scroll rocks the caught rider at full size, then shrinks it into the throat beneath the mouth.
  const held = { x: TRACK[1], y: hover.y, z: config.centerZ };
  const resisting = riderCollapseFrame(0.5, held, mouth, config.maxRadius);
  assert.ok(resisting.scale === 1 && resisting.rock.some((angle) => Math.abs(angle) > 0.01), 'it resists at full size, rocking');
  assert.ok(Math.hypot(resisting.position[0] - mouth.x, resisting.position[2] - mouth.z) < 1e-9, 'without drifting off the mouth');
  const gone = riderCollapseFrame(0.9, held, mouth, config.maxRadius);
  assert.ok(gone.scale < 0.02 && gone.position[1] < -0.57 * config.maxRadius - 1, 'gone below the throat cover before the space fade');
  const pulled = riderCollapseFrame(0.9, { x: lip + 2, y: 1.7, z: 0.5 }, mouth, config.maxRadius);
  assert.ok(Math.hypot(pulled.position[0] - mouth.x, pulled.position[2] - mouth.z) < 1e-9, 'a rider still in flight is drawn to the mouth, not dropped where it is');
  // Whatever the scroll, the rider's own run never jumps: road, kicker, flight and plunge join up.
  for (const progress of [0.1, 0.4, 0.7, 1]) {
    let last;
    for (let x = STOPS.at(-2); x <= TRACK[1]; x += 0.005) {
      const p = pose(x);
      const { position } = riderCollapseFrame(holeAt(progress, x), { x, y: p.y, z: config.centerZ * p.toHole }, mouth, config.maxRadius);
      if (last) assert.ok(Math.hypot(...position.map((v, i) => v - last[i])) < 0.2, `no jump at ${x} with the scroll at ${progress}`);
      if (x < ramp.x) assert.ok(position[1] === 0 && position[2] === 0, 'on the road until the kicker');
      last = position;
    }
  }
});

test('shared model instances shrink into separate real contact volumes and rewind exactly', () => {
  const scene = new THREE.Scene(), geometry = new THREE.BoxGeometry(2, 2, 2);
  const source = new THREE.MeshBasicMaterial();
  const roots = [new THREE.Mesh(geometry, source), new THREE.Mesh(geometry, source)];
  const controller = createGroundBlackHole(THREE, scene,
    { center: [0, 0.025, 0], maxRadius: 3.1, gravity: 2100, duration: 9, openUntil: 0.56 });
  roots.forEach(root => { root.position.set(6, 1, 0); scene.add(root); controller.addBody(root); });
  const fragments = roots.map(root => scene.getObjectByName(`runner-fragments-${root.id}`).children[0]);
  const shader = { uniforms: {}, vertexShader: 'void main() {}', fragmentShader: '' };
  fragments[0].material.onBeforeCompile(shader);
  const sample = p => {
    controller.update(p);
    const data = shader.uniforms.contactTexture.value.image.data;
    return fragments.map(mesh => {
      const at = mesh.geometry.attributes.contact.getX(0) * 12;
      return Array.from(data.slice(at, at + 12));
    });
  };
  const forward = sample(0.46);
  const a = forward[0], b = forward[1];
  assert.ok(a[3] > 0 && a[3] < 0.6 && b[3] > 0 && b[3] < 0.6, 'the actual uploaded transforms shrink both models');
  const extent = row => {
    const e = new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion(...row.slice(8, 12))).elements;
    return [0, 1, 2].map(axis => (Math.abs(e[axis]) + Math.abs(e[axis + 4]) + Math.abs(e[axis + 8])) * row[3]);
  };
  const ah = extent(a), bh = extent(b);
  assert.ok([0, 1, 2].some(axis => Math.abs(a[axis] - b[axis]) >= ah[axis] + bh[axis] - 1e-6),
    'the rendered rotated boxes touch or separate instead of occupying the same volume');
  sample(0.6);
  assert.deepEqual(sample(0.46), forward, 'reverse scroll uploads the same collision-resolved poses');
  controller.update(0); controller.dispose();
  roots.forEach(root => { assert.ok(root.visible); assert.deepEqual(root.scale.toArray(), [1, 1, 1]); });
  geometry.dispose(); source.dispose();
});

test('the curved ground hole animates authored parts, catches up late models and restores sources', () => {
  const scene = new THREE.Scene();
  const config = { center: [TRACK[1], 0.025, 1], maxRadius: 3.1, gravity: 2100, duration: 9, openUntil: 0.56 };
  const first = new THREE.Mesh(new THREE.BoxGeometry(2, 4, 2).translate(0, 2, 0), new THREE.MeshBasicMaterial());
  const pivots = new Float32Array(first.geometry.attributes.position.count * 3);
  for (let i = 0; i < pivots.length; i += 3) pivots.set([i < pivots.length / 2 ? -0.5 : 0.5, 2, 0], i);
  first.geometry.setAttribute('_shard', new THREE.BufferAttribute(pivots, 3));
  first.geometry.setAttribute('_cluster', new THREE.BufferAttribute(pivots.slice(), 3));
  first.position.set(config.center[0] - 6, 0, -4);
  first.rotation.set(0.1, 0.3, -0.12);
  first.scale.set(1.2, 0.8, 1.4);
  const hidden = first.clone(); hidden.visible = false;
  const original = [first, hidden].map(bodyState);
  scene.add(first, hidden);
  let redraws = 0;
  const controller = createGroundBlackHole(THREE, scene, config, () => { redraws += 1; });
  controller.addBody(first); controller.addBody(hidden);
  assert.equal(redraws, 0, 'preparing parts at rest must not refresh the TV boot');
  controller.update(0);
  assert.deepEqual([first, hidden].map(bodyState), original);
  const hole = scene.getObjectByName('runner-ground-hole');
  assert.equal(hole.scale.x, 0);
  controller.update(0.27);
  assert.ok(hole.scale.x > 0 && hole.scale.x < config.maxRadius);
  assert.ok(first.visible, 'small opening keeps the original building intact while it trembles');
  controller.update(0.6);
  assert.equal(hole.scale.x, config.maxRadius);
  controller.update(0.7);
  assert.equal(hole.scale.x, config.maxRadius, 'suction continues through a fixed opening');
  controller.update(0.42);
  const fragments = scene.getObjectByName(`runner-fragments-${first.id}`);
  assert.ok(fragments.visible);
  assert.equal(first.visible, false, 'the intact source is replaced by the authored parts');
  assert.equal(hidden.visible, false, 'hidden models stay hidden');
  assert.deepEqual(first.position.toArray(), original[0].position, 'source transforms are never mutated by GPU motion');
  const mesh = fragments.children[0];
  assert.ok(mesh.visible, 'a mesh used as the body root still renders its parts');
  assert.equal(mesh.geometry.attributes.position, first.geometry.attributes.position, 'the source triangles are reused without cutting');
  assert.equal(new Set(mesh.geometry.attributes.contact.array).size, 2, 'authored grouping reaches the animation as contact parts');
  const late = first.clone(); late.visible = true; scene.add(late);
  controller.addBody(late);
  const lateFragments = scene.getObjectByName(`runner-fragments-${late.id}`);
  assert.equal(redraws, 1, 'a late visible fragment group requests a redraw at the current progress');
  assert.ok(lateFragments.visible, 'a delayed model immediately takes the current collapse progress');
  assert.equal(lateFragments.children[0].geometry.attributes.position, mesh.geometry.attributes.position,
    'instances share triangles while keeping separate contact indices');
  assert.notDeepEqual(lateFragments.children[0].geometry.attributes.contact.array, mesh.geometry.attributes.contact.array,
    'coincident instances still receive independent collision transforms');
  controller.update(0);
  assert.deepEqual([first, hidden].map(bodyState), original);
  assert.ok(!fragments.visible && !lateFragments.visible, 'reverse scroll hides all fragments at the source boundary');
  controller.update(0.7);
  assert.ok(fragments.visible && lateFragments.visible, 'forward replay reuses the same fragments');
  controller.addBody(first);
  assert.equal(scene.children.filter(node => node.name === fragments.name).length, 1, 'recapturing replaces the previous body');
  controller.dispose();
  assert.equal(scene.getObjectByName('runner-ground-hole'), undefined);
  assert.deepEqual(scene.children, [first, hidden, late], 'cleanup removes fragments and preserves all original models');
  assert.deepEqual([first, hidden].map(bodyState), original);
});

test('each shipped street building carries modelled part pivots on complete triangles', async () => {
  const { buildings, blockout } = JSON.parse(readFileSync(new URL('../animation-map.json', import.meta.url))).v3.runner;
  for (const { model } of [...buildings, ...blockout.shops]) {
    const bytes = readFileSync(new URL(`../../public${model}`, import.meta.url));
    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).register(() => ({ name: 'geometry-only', loadTexture: () => Promise.resolve(null) }));
    const { scene } = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
    const parts = new Set();
    scene.traverse(node => {
      if (!node.isMesh) return;
      const { geometry } = node;
      const { position, _shard: part, _cluster: group } = geometry.attributes;
      assert.ok(part && group && part.count === position.count && group.count === position.count, `${model}: every surface has its authored pivots`);
      const count = geometry.index?.count ?? position.count;
      for (let i = 0; i < count; i += 3) {
        const indices = [0, 1, 2].map(offset => geometry.index ? geometry.index.getX(i + offset) : i + offset);
        for (const attribute of [part, group]) {
          const values = indices.map(index => [attribute.getX(index), attribute.getY(index), attribute.getZ(index)].join(','));
          assert.ok(values[0] === values[1] && values[1] === values[2], `${model}: a triangle cannot span independently moving parts`);
        }
        const index = indices[0];
        parts.add([part.getX(index), part.getY(index), part.getZ(index)].join(','));
      }
    });
    assert.ok(parts.size > 5, `${model}: the building must contain multiple modelled parts`);
  }
});

test('career flights stop for reading at every company and retrace the same continuous route', () => {
  const config = JSON.parse(readFileSync(new URL('../animation-map.json', import.meta.url))).v3.experience;
  const count = 3;
  const total = careerDistance(config, count);
  const suit = { face: 0, t: 1, opening: true };
  for (let i = 0; i < count; i += 1) {
    const centre = careerStopProgress(i, config, count);
    for (const offset of [-0.45, 0, 0.45]) {
      const { transition, journey, travel } = careerFrame(centre + offset * config.holdVh / total, config, count);
      assert.deepEqual({ transition, journey, travel }, { transition: 1, journey: i, travel: 0 });
    }
    assert.deepEqual(careerFrame(centre, config, count).paper, suit, 'the reading point shows the flat space suit');
  }
  const forward = Array.from({ length: 2001 }, (_, i) => careerFrame(i / 2000, config, count));
  for (let i = 1; i < forward.length; i += 1) {
    assert.ok(forward[i].journey >= forward[i - 1].journey);
    assert.ok(forward[i].journey - forward[i - 1].journey < 0.025, 'flight has no position jump');
    assert.deepEqual(careerFrame(i / 2000, config, count), forward[i], 'seeking backwards has no accumulated state');
  }
  assert.deepEqual(careerFrame(-1, config, count), { transition: 0, journey: 0, travel: 0, paper: suit, exit: 0 });
  const end = careerFrame(2, config, count);
  assert.ok(end.exit === 1 && end.journey > 2.4 && Math.abs(end.travel) < 1e-9, 'the flight ends still, past the last planet');
});

test('each flight crumples the suit into the rocket and lands as the suit again', () => {
  const config = JSON.parse(readFileSync(new URL('../animation-map.json', import.meta.url))).v3.experience;
  const frames = Array.from({ length: 4001 }, (_, i) => careerFrame(i / 4000, config, 3));
  const phases = [];
  frames.forEach(({ paper }, i) => {
    const phase = paper.opening && paper.t === 1 ? `${paper.face}` : `${paper.face}${paper.opening ? '+' : '-'}`;
    if (phases.at(-1) !== phase) {
      // A sticker only hands over to the other one as a ball.
      if (phases.length && phases.at(-1)[0] !== phase[0]) assert.ok(!frames[i - 1].paper.opening && frames[i - 1].paper.t > 0.97 && paper.t < 0.03);
      phases.push(phase);
    }
  });
  assert.deepEqual(phases, ['0', '0-', '1+', '1', '1-', '0+', '0', '0-', '1+', '1', '1-', '0+', '0', '0-', '1+', '1']);
  for (const { travel, paper } of frames) if (travel > 0) assert.deepEqual(paper, { face: 1, t: 1, opening: true }, 'only the flat rocket flies');
});

test('after the last stop the rocket climbs out of frame and drops a phone that grows into the middle', () => {
  const config = JSON.parse(readFileSync(new URL('../animation-map.json', import.meta.url))).v3.experience;
  const total = careerDistance(config, 3);
  const frames = Array.from({ length: 2001 }, (_, i) => careerFrame(1 - (1 - i / 2000) * config.exitVh / total, config, 3));
  const rocket = frames.map((frame) => careerPose(frame));
  const phone = frames.map(({ exit }) => careerPhone(exit));
  const out = phone.findIndex(({ shown }) => shown);
  assert.ok(out > 0 && !phone[0].shown, 'the rocket leaves the planet before the phone appears');
  assert.ok(Math.abs(phone[out].y - rocket[out].y) < 0.01 && phone[out].scale < 0.12, 'the phone starts small, behind the rocket');
  for (let i = 1; i < frames.length; i += 1) {
    assert.ok(rocket[i].y <= rocket[i - 1].y + 1e-9, 'the rocket only climbs');
    assert.ok(phone[i].y >= phone[i - 1].y && phone[i].scale >= phone[i - 1].scale, 'the phone only falls and grows');
    assert.ok(phone[i].scale - phone[i - 1].scale < 0.002, 'the zoom is slow');
  }
  const landed = phone.findIndex(({ angle }) => angle === 0);
  assert.ok(rocket[landed].y + PAPER_HEIGHT / 2 < 0, 'the rocket is gone before the phone settles');
  const rest = phone.at(-1);
  assert.ok(rest.x === 0.5 && rest.y === 0.5 && rest.scale === 1 && rest.angle === 0 && rest.notice === 1,
    'the phone rests upright in the middle with its notification');
});

test('the suit stands centred on each docked planet and the rocket turns nose-up without a jump', () => {
  const config = JSON.parse(readFileSync(new URL('../animation-map.json', import.meta.url))).v3.experience;
  const frames = Array.from({ length: 4001 }, (_, i) => careerFrame(i / 4000, config, 3));
  for (let i = 0; i < 3; i += 1) {
    const { x, y, scale, angle } = careerPose(careerFrame(careerStopProgress(i, config, 3), config, 3));
    assert.ok(x === 0.5 && scale === 1 && angle === 0, 'the docked suit stands upright at the centre');
    assert.ok(Math.abs(y + PAPER_HEIGHT / 2 - PLANET_TOP) < 1e-9, 'the feet rest on the planet top');
  }
  const poses = frames.map((frame) => careerPose(frame));
  frames.forEach(({ travel }, i) => {
    if (travel > 0.5) assert.ok(Math.abs(poses[i].angle + Math.PI / 4) < 0.08, 'the flying rocket points up the route');
    if (i) assert.ok(Math.abs(poses[i].angle - poses[i - 1].angle) < 0.02, 'swapping stickers inside the ball never snaps the turn');
  });
});

test('paper crumples from the edges, unfolds from the centre with a small overshoot and rests exactly flat', () => {
  const width = 40;
  const height = 50;
  const alpha = Uint8Array.from({ length: width * height }, (_, i) => {
    const x = (i % width + 0.5) / width - 0.5;
    const y = (Math.floor(i / width) + 0.5) / height - 0.5;
    return x * x + y * y < 0.16 ? 255 : 0;
  });
  const sheet = buildSheet(alpha, width, height, 1, 7);
  const out = new Float32Array(sheet.count * 3);
  const close = (a, b) => a.every((v, i) => Math.abs(v - b[i]) < 1e-6);
  for (const state of [{ t: 1, opening: true }, { t: 0, opening: false }]) {
    assert.equal(posePaper(sheet, state, out), 1);
    assert.ok(close(out, sheet.flat), 'both ends of a phase show the creased flat sheet');
  }
  posePaper(sheet, { t: 1, opening: false }, out);
  const ball = Float32Array.from(out);
  for (let k = 0; k < sheet.count; k += 1) {
    assert.ok(Math.hypot(ball[k * 3] - sheet.cx, ball[k * 3 + 1] - sheet.cy, ball[k * 3 + 2]) < 0.235, 'crumpled paper stays in the ball');
  }
  posePaper(sheet, { t: 0, opening: true }, out);
  assert.ok(close(out, ball), 'crumpling ends on the ball the unfold starts from');
  assert.ok(flatness(0.2, false, 1) < flatness(0.2, false, 0), 'crumpling starts at the edges');
  assert.ok(flatness(0.3, true, 0) > flatness(0.3, true, 1), 'unfolding starts at the centre');
  const peak = Math.max(...Array.from({ length: 101 }, (_, i) => flatness(i / 100, true, 0)));
  assert.ok(peak > 1.03 && peak < 1.1, 'the unfold springs a little past flat');
});

test('idle sky frames reuse the captured planet street; movement recaptures it', () => {
  const config = JSON.parse(readFileSync(new URL('../animation-map.json', import.meta.url))).v3.runner;
  let captures = 0, composites = 0, captureSize;
  const scene = new THREE.Scene();
  const renderer = {
    capabilities: { maxTextureSize: 16384 },
    setRenderTarget(target) { if (target) captureSize = [target.width, target.height, target.samples]; },
    render(object) { if (object === scene) captures += 1; else composites += 1; },
  };
  const lens = tinyPlanet(THREE, renderer, scene, config.lenses.planet, config.camera.z);
  lens.setSize(1280, 720);
  const camera = new PerspectiveCamera(38, 1280 / 720, 0.1, 110);
  lens.render(camera);
  assert.ok(captureSize[0] >= 1280 && captureSize[0] <= 1536 && captureSize[1] === 720,
    'the visible panorama slice keeps pixel density within a viewport-sized GPU budget');
  assert.equal(captureSize[2], 0, 'the projected panorama does not allocate a large multisample target');
  lens.render(camera, false);
  lens.render(camera, false);
  assert.deepEqual([captures, composites], [1, 3]);
  camera.position.x = 16;
  lens.render(camera);
  assert.deepEqual([captures, composites], [2, 4]);
  lens.dispose();
});

test('the cropped planet keeps its pole outside the view and captures every stop building up to its roof', async () => {
  const config = JSON.parse(readFileSync(new URL('../animation-map.json', import.meta.url))).v3.runner;
  const models = await Promise.all(config.buildings.map(async ({ model }) => {
    const bytes = readFileSync(new URL(`../../public${model}`, import.meta.url));
    return (await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')).scene;
  }));
  let capture;
  const renderer = {
    capabilities: { maxTextureSize: 16384 },
    setRenderTarget() {},
    render(scene, camera) { camera.updateMatrixWorld(); if (camera.isPerspectiveCamera) capture = camera; },
  };
  const lens = tinyPlanet(THREE, renderer, new THREE.Scene(), config.lenses.planet, config.camera.z);
  const camera = new PerspectiveCamera(config.camera.fov, 1, 0.1, 60);
  for (const [width, height] of [[1920, 1009], [1920, 911], [1536, 864], [1280, 720]]) {
    lens.setSize(width, height);
    camera.aspect = width / height;
    for (const tower of skyline(STOPS.slice(1), config.buildings, config.doorHeight).filter(({ ad }) => ad !== undefined)) {
      const building = models[tower.model];
      building.scale.setScalar(tower.scale);
      building.scale.y *= tower.heightMultiplier;
      building.rotation.y = tower.yaw;
      building.position.set(tower.x - tower.offsetX, config.blockout.sidewalk.height - tower.baseHeight - 0.005, tower.z - tower.offsetZ);
      const box = new Box3().setFromObject(building);
      camera.position.set(tower.x, config.camera.y, config.camera.z);
      camera.lookAt(tower.x, config.camera.lookY, 0);
      camera.updateMatrixWorld();
      lens.render(camera);
      for (const x of [box.min.x, box.max.x]) for (const z of [box.min.z, box.max.z]) {
        const point = new Vector3(x, box.max.y, z);
        const ndc = point.clone().project(capture);
        assert.ok(Math.abs(ndc.y) < 1, `roof must be captured before the lens pass: ${tower.ad}`);
      }
      // The empty corners of a bounding box extend beyond curved roofs. Check the actual roof vertices.
      let top = height;
      building.traverse((node) => {
        if (!node.isMesh) return;
        const vertices = node.geometry.attributes.position;
        for (let i = 0; i < vertices.count; i += 1) {
          const point = new Vector3().fromBufferAttribute(vertices, i).applyMatrix4(node.matrixWorld);
          if (point.y < tower.h * 0.9) continue;
          const [px, py] = lens.toView(point);
          assert.ok(px > 0 && px < width && py > 64 && py < height, `roof must clear navigation and fit in the frame: ${tower.ad}, ${px}, ${py}`);
          top = Math.min(top, py);
        }
      });
      assert.ok(top < height * 0.4, 'door-calibrated towers retain a prominent roofline despite their different storey counts');
      const [x, y] = lens.toView(new Vector3(tower.x, 0, 0));
      assert.ok(Math.abs(x - width / 2) < 1e-6 && Math.abs(y / height - 0.82) < 1e-6, 'lane sits in the lower fifth');
      assert.ok(y + config.lenses.planet.radius * height > height, 'the pole is below the frame');
      if (width === 1920) {
        // The annotated arc drops about 0.17 screen heights at 0.36 screen widths from centre.
        const angle = Math.asin(0.36 * width / (config.lenses.planet.radius * height));
        const ground = new Vector3(tower.x, 0, 0).project(capture);
        const croppedNdcX = angle / Math.PI * capture.view.fullWidth / capture.view.width;
        const [edgeX, edgeY] = lens.toView(new Vector3(croppedNdcX, ground.y, ground.z).unproject(capture));
        assert.ok(Math.abs(edgeX - width * 0.86) < 1e-6, 'samples the annotated right edge of the road');
        assert.ok((edgeY - y) / height > 0.16 && (edgeY - y) / height < 0.23, 'road follows the shallow red reference arc');
      }
    }
  }
  lens.dispose();
});

test('both shoes stay rigid on their own foot instead of splitting with Root or shin weights', () => {
  const bytes = readFileSync(new URL('../../public/assets/models/runner-dog.glb', import.meta.url));
  const jsonEnd = 20 + bytes.readUInt32LE(12);
  const gltf = JSON.parse(bytes.toString('utf8', 20, jsonEnd));
  const bin = jsonEnd + 8;
  const attribute = (id) => {
    const a = gltf.accessors[id], v = gltf.bufferViews[a.bufferView];
    const size = { SCALAR: 1, VEC3: 3, VEC4: 4 }[a.type];
    const width = { 5121: 1, 5123: 2, 5126: 4 }[a.componentType];
    const read = { 5121: 'readUInt8', 5123: 'readUInt16LE', 5126: 'readFloatLE' }[a.componentType];
    return Array.from({ length: a.count }, (_, i) => Array.from({ length: size }, (_, j) =>
      bytes[read](bin + v.byteOffset + (a.byteOffset || 0) + i * (v.byteStride || size * width) + j * width)));
  };
  const { attributes: a } = gltf.meshes[0].primitives[0];
  const positions = attribute(a.POSITION), joints = attribute(a.JOINTS_0), weights = attribute(a.WEIGHTS_0);
  const skeleton = gltf.skins[0].joints.map((id) => gltf.nodes[id].name);
  const counts = { LeftFoot: 0, RightFoot: 0 };
  positions.forEach(([x, y], i) => {
    if (y > -0.78) return; // complete shoes, including the formerly detached heel/sole patches
    const foot = x > 0 ? 'LeftFoot' : 'RightFoot';
    const weight = weights[i].reduce((sum, w, j) => sum + (skeleton[joints[i][j]] === foot ? w : 0), 0);
    assert.ok(Math.abs(weight - 1) < 1e-6, `${foot} vertex ${i}: rigid shoe weight ${weight}`);
    counts[foot]++;
  });
  assert.ok(counts.LeftFoot > 500 && counts.RightFoot > 500, 'checks both complete shoes');
});

test('the shipped grind rail spans each rail obstacle with its pipe top under the sliding deck', () => {
  const config = JSON.parse(readFileSync(new URL('../animation-map.json', import.meta.url))).v3.runner;
  const bytes = readFileSync(new URL(`../../public${config.railModel}`, import.meta.url));
  const gltf = JSON.parse(bytes.toString('utf8', 20, 20 + bytes.readUInt32LE(12)));
  const primitives = gltf.meshes.flatMap(({ primitives }) => primitives);
  const positions = primitives.map((p) => gltf.accessors[p.attributes.POSITION]);
  const [x, y] = [0, 1].map((axis) => [Math.min(...positions.map((p) => p.min[axis])), Math.max(...positions.map((p) => p.max[axis]))]);
  assert.ok(primitives.reduce((n, p) => n + gltf.accessors[p.indices].count / 3, 0) < 10000, 'decimated for the runner');
  assert.ok(Math.abs(y[0]) < 1e-6, 'base plates stand on the road');
  const rails = RUN.filter(({ trick }) => trick === 'boardslide');
  assert.deepEqual(RUN.map(({ trick }) => trick), [...Array(5).fill('boardslide'), 'launch']);
  for (const { w, h } of rails) {
    assert.ok(Math.abs(x[1] - x[0] - w) < 1e-3, 'model length is the obstacle length');
    assert.ok(Math.abs(y[1] - (h + 0.103)) < 2e-3, 'deck underside (h + DECK + 0.003) rides the pipe top');
  }
});

test('the launch kicker fits the existing straight wheel path without raised lips', () => {
  const config = JSON.parse(readFileSync(new URL('../animation-map.json', import.meta.url))).v3.runner;
  const bytes = readFileSync(new URL(`../../public${config.rampModel}`, import.meta.url));
  const gltf = JSON.parse(bytes.toString('utf8', 20, 20 + bytes.readUInt32LE(12)));
  const binary = 28 + bytes.readUInt32LE(12);
  const primitives = gltf.meshes.flatMap(({ primitives }) => primitives);
  const ramp = RUN.at(-1);
  assert.equal(ramp.trick, 'launch');
  assert.ok(gltf.materials.some(({ name }) => name === 'Ramp paint'), 'paint can activate independently');
  assert.ok(primitives.reduce((n, p) => n + gltf.accessors[p.indices].count / 3, 0) < 3000);
  const bounds = [Infinity, Infinity, -Infinity, -Infinity];
  for (const primitive of primitives) {
    const accessor = gltf.accessors[primitive.attributes.POSITION];
    const view = gltf.bufferViews[accessor.bufferView];
    for (let i = 0; i < accessor.count; i += 1) {
      const offset = binary + (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0) + i * (view.byteStride ?? 12);
      const x = bytes.readFloatLE(offset), y = bytes.readFloatLE(offset + 4);
      bounds[0] = Math.min(bounds[0], x); bounds[1] = Math.min(bounds[1], y);
      bounds[2] = Math.max(bounds[2], x); bounds[3] = Math.max(bounds[3], y);
      assert.ok(y <= ramp.h * x / ramp.w + 1e-5, 'no geometry projects into the straight wheel path');
    }
  }
  for (const [actual, expected] of bounds.map((value, i) => [value, [0, 0, ramp.w, ramp.h][i]])) {
    assert.ok(Math.abs(actual - expected) < 1e-5, 'road entry and takeoff match the pose contract');
  }
});

test('the shipped skateboard keeps seven rigid parts, round wheels and the runner deck height', () => {
  const config = JSON.parse(readFileSync(new URL('../animation-map.json', import.meta.url))).v3.runner;
  const bytes = readFileSync(new URL(`../../public${config.boardModel}`, import.meta.url));
  assert.equal(bytes.toString('ascii', 0, 4), 'glTF');
  const gltf = JSON.parse(bytes.toString('utf8', 20, 20 + bytes.readUInt32LE(12)));
  const parts = gltf.nodes.filter(({ mesh }) => mesh !== undefined);
  assert.equal(parts.length, 7);
  const bounds = ({ mesh }) => {
    const positions = gltf.meshes[mesh].primitives.map((p) => gltf.accessors[p.attributes.POSITION]);
    return [0, 1, 2].map((axis) => [Math.min(...positions.map((p) => p.min[axis])), Math.max(...positions.map((p) => p.max[axis]))]);
  };
  const wheels = parts.filter(({ name }) => name.startsWith('Wheel '));
  assert.equal(wheels.length, 4);
  assert.equal(parts.filter(({ name }) => name.startsWith('Truck ')).length, 2);
  for (const part of wheels) {
    const [x, y] = bounds(part).map(([lo, hi]) => hi - lo);
    assert.ok(Math.abs(x - y) < 1e-6, 'round wheel in the runner side view');
    assert.ok(Math.abs(bounds(part)[1][0] + 0.1) < 1e-6, 'wheel touches ground with the board pivot at 0.1');
  }
  const deck = parts.find(({ name }) => name === 'Deck');
  const x = bounds(deck)[0];
  assert.ok(x[1] - x[0] > 1 && x[1] - x[0] < 1.12);
  const grip = gltf.meshes[deck.mesh].primitives.find((p) => gltf.materials[p.material].name === 'Charcoal grip');
  const y = gltf.accessors[grip.attributes.POSITION];
  assert.ok(y.min[1] < 0.0225 && y.max[1] > 0.0225, 'deck includes the existing sole contact height');
});

test('the runner picture fills the visible TV glass and lands at the viewport 1:1', () => {
  for (const [width, height] of [[1920, 911], [1440, 900], [1280, 720]]) {
    const [cx, cy, w, h] = [width / 2, height * 0.53, 460, 310];
    const end = 1.2 * Math.max(cx / (w / 2), Math.max(cy, height - cy) / (h / 2));
    for (let i = 0; i <= 100; i += 1) {
      const zoom = end ** (i / 100);
      const { x, y, scale } = fitTvPicture([cx, cy, w, h], zoom, width, height);
      const left = cx + (x - w / 2) * zoom;
      const top = cy + (y - h / 2) * zoom;
      assert.ok(left <= Math.max(0, cx - w / 2 * zoom) + 1e-7);
      assert.ok(top <= Math.max(0, cy - h / 2 * zoom) + 1e-7);
      assert.ok(left + width * scale * zoom >= Math.min(width, cx + w / 2 * zoom) - 1e-7);
      assert.ok(top + height * scale * zoom >= Math.min(height, cy + h / 2 * zoom) - 1e-7);
      if (i === 100) {
        assert.ok(Math.abs(left) + Math.abs(top) < 1e-7);
        assert.ok(Math.abs(scale * zoom - 1) < 1e-7);
      }
    }
  }
});

test('works follow folder order and need a title and a preview', () => {
  const works = collectWorks(
    {
      '/works/02-b/work.json': { title: 'B' },
      '/works/01-a/work.json': { title: 'A' },
      '/works/03-c/work.json': { summary: 'no title' },
      '/works/04-d/work.json': { title: 'no preview' },
    },
    { '/works/01-a/preview.gif': '/a.gif', '/works/02-b/preview.gif': '/b.gif', '/works/03-c/preview.gif': '/c.gif' },
  );
  assert.deepEqual(works.map(({ id, frame }) => [id, frame]), [['01-a', 'console'], ['02-b', 'portable']]);
});

test('only https and mailto links become clickable and work text is escaped', () => {
  const [safe, unsafe] = collectWorks(
    {
      '/works/1/work.json': { title: '<b>x</b>', href: 'https://example.com' },
      '/works/2/work.json': { title: 'y', href: 'javascript:alert(1)' },
    },
    { '/works/1/preview.gif': '/1.gif', '/works/2/preview.gif': '/2.gif' },
  );
  assert.equal(unsafe.href, null);
  const html = renderWorks([safe, unsafe], tv.frames);
  assert.match(html, /<a class="tv-link" href="https:\/\/example\.com" target="_blank" rel="noopener noreferrer">/);
  assert.match(html, /<div class="tv-link">/);
  assert.match(html, /&lt;b&gt;x&lt;\/b&gt;/);
  assert.doesNotMatch(html, /javascript:|<b>x/);
  // The transition TV closes the row with the frame after the last work's, and is no channel of its own.
  assert.match(html, /<li class="tv-exit tv--monitor" [^>]*aria-hidden="true">(?:(?!<li).)*<span class="tv-feed"><\/span>(?:(?!<li).)*$/s);
});

test('every shipped works folder has a valid work.json and exactly one preview', () => {
  const folders = readdirSync(worksDir, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map(({ name }) => name);
  assert.ok(folders.length > 0);
  for (const folder of folders) {
    const data = JSON.parse(readFileSync(new URL(`${folder}/work.json`, worksDir), 'utf8'));
    const previews = readdirSync(new URL(`${folder}/`, worksDir)).filter((file) => /^preview\.(gif|webp|png|jpg)$/.test(file));
    assert.equal(previews.length, 1, `${folder} needs exactly one preview file`);
    const [work] = collectWorks({ [`/works/${folder}/work.json`]: data }, { [`/works/${folder}/${previews[0]}`]: 'preview' });
    assert.ok(work, `${folder} needs a title`);
    if (data.href) assert.ok(work.href, `${folder} href must start with https:// or mailto:`);
  }
});

test('the works CLI adds the next folder as the last TV and leaves nothing behind on bad input', () => {
  const dir = mkdtempSync(join(tmpdir(), 'works-'));
  mkdirSync(join(dir, '07-old'));
  const preview = join(dir, 'shot.PNG');
  writeFileSync(preview, 'png');
  const { folder } = addWork(dir, { title: ' New Bot ', preview, tags: 'n8n, ,LLM', href: 'https://example.com' });
  assert.equal(folder, '08-new-bot');
  assert.deepEqual(JSON.parse(readFileSync(join(dir, folder, 'work.json'), 'utf8')), { title: 'New Bot', tags: ['n8n', 'LLM'], href: 'https://example.com' });
  assert.ok(existsSync(join(dir, folder, 'preview.png')));
  assert.throws(() => addWork(dir, { title: 'x', preview, href: 'javascript:alert(1)' }), /--href/);
  assert.throws(() => addWork(dir, { title: 'x', preview: join(dir, 'clip.mp4') }), /--preview/);
  assert.throws(() => addWork(dir, { preview }), /--title/);
  assert.deepEqual(readdirSync(dir).sort(), ['07-old', '08-new-bot', 'shot.PNG']);
  rmSync(dir, { recursive: true, force: true });
});

test('every obstacle can be cleared at the slowest and the fastest speed', () => {
  const dogWidth = DOG.height * DOG.aspect * (DOG.hitbox.right - DOG.hitbox.left);
  for (const { id, width, height } of tv.obstacles) {
    const h = OBSTACLES[id];
    const need = ((h * width) / height) * (1 - 2 * INSET) + dogWidth;
    for (const speed of [PHYSICS.startSpeed, PHYSICS.maxSpeed]) {
      assert.ok(airWindow(h * (1 - INSET)) * speed > need * 1.15, `${id} at speed ${speed}`);
    }
  }
});

test('the scroll run clears every obstacle, unlocks every chore and never jumps between frames', () => {
  const surface = ({ trick, x, w, h }, at) => (trick === 'launch' ? (h * (at - x)) / w : h);
  for (const spot of RUN) {
    for (let at = spot.x; at <= spot.x + spot.w; at += 0.01) assert.ok(pose(at).y >= surface(spot, at) - 1e-9, `${spot.id} at ${at}`);
  }
  RUN.forEach((spot, i) => {
    // The last chore is the jump into the black hole: its flight ends over the mouth, which is the last stop.
    const last = i === RUN.length - 1;
    assert.ok(spot.from > STOPS[i] && (last ? spot.to === spot.stop : spot.to < spot.stop), `${spot.id} rides inside the stretch before its ad`);
    assert.deepEqual(pose(last ? WAIT : spot.stop), pose(TRACK[0]), `${spot.id}: the rider waits at its ad standing on flat ground`);
  });
  assert.deepEqual(RUN.map(({ id }) => id), tv.obstacles.map(({ id }) => id));
  const turn = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
  let last = pose(TRACK[0]);
  for (let x = TRACK[0]; x <= TRACK[1]; x += 0.005) {
    const now = pose(x);
    assert.ok(Math.abs(now.y - last.y) < 0.03, `y at ${x}`);
    for (const key of ['crouch', 'tuck', 'land', 'wind', 'balance', 'push', 'swing', 'toHole']) assert.ok(Math.abs(now[key] - last[key]) < 0.05, `${key} at ${x}`);
    for (const key of ['tilt', 'spin', 'pop', 'flip', 'shuv']) assert.ok(turn(now[key], last[key]) < 0.1, `${key} at ${x}`);
    last = now;
  }
});

test('the rider keeps its own pace: a capped speed, an exact stop, and an unseen catch-up from off screen', () => {
  const speed = 2.6;
  for (const [from, to, start] of [[0, 11, 0], [11, TRACK[1], 0], [40, 21.5, speed]]) {
    let [x, v, t] = [from, start, 0];
    while ((x !== to || v !== 0) && t < 60) {
      [x, v] = chase(x, v, to, 1 / 60, speed);
      t += 1 / 60;
      assert.ok(Math.abs(v) <= speed + 1e-9, 'never faster than its own pace');
      assert.ok(Math.sign(from - to) * (x - to) > -0.03, 'never overshoots the stop');
    }
    assert.equal(x, to, 'comes to rest exactly on the stop');
    assert.ok(t >= Math.abs(to - from) / speed, 'a far stop takes its full skating time');
  }
  const edge = 7.5;
  assert.equal(catchUp(3, 11, 0, edge, speed), null, 'a rider on screen is never moved');
  assert.deepEqual(catchUp(5, TRACK[1], 60, edge, speed), [60 - edge, speed], 'left behind, it waits just off the left edge, rolling in');
  assert.deepEqual(catchUp(50, 0, 10, edge, speed), [10 + edge, -speed], 'scrolled back, it rolls in from the right');
  assert.equal(catchUp(80, 90, 60, edge, speed), null, 'never moved away from its stop');
});

test('the run rests on every ad while scrolling; one wheel step from a rest moves one ad', () => {
  const { hold } = JSON.parse(readFileSync(new URL('../animation-map.json', import.meta.url))).v3.runner;
  const n = STOPS.length - 1;
  const onStop = (x, tolerance = 1e-6) => STOPS.some((stop) => Math.abs(stop - x) < tolerance);
  const stopOf = (x) => STOPS.indexOf(x); // a detent holds the camera exactly on its ad
  let previous = cameraAt(0, hold);
  for (let step = 1; step <= 6000; step += 1) {
    const x = cameraAt(step / 6000, hold);
    assert.ok(x >= previous, 'scrolling forward never moves the camera back');
    previous = x;
  }
  STOPS.forEach((stop, k) => {
    assert.equal(cameraAt(k / n, hold), stop);
    if (k) assert.equal(cameraAt((k - hold / 2) / n, hold), stop, 'each ad holds the camera for part of its scroll');
  });
  for (let step = 1; step < 1000; step += 1) {
    for (const direction of [1, -1]) {
      const p = step / 1000, from = cameraAt(p, hold);
      const passing = snapStop(p, direction, hold, -1);
      if (passing === p) assert.ok(onStop(from, 1e-3), `stopping while passing stays only on an ad: ${p}`);
      else assert.ok(onStop(cameraAt(passing, hold)) && Math.sign(cameraAt(passing, hold) - from) === direction, `${p} snaps on to an ad`);
      const at = stopOf(from);
      if (at < 0) continue;
      // Left from this ad's rest: the neighbouring ad, as far as the run goes.
      const next = Math.max(0, Math.min(n, at + direction));
      assert.equal(stopOf(cameraAt(snapStop(p, direction, hold, at), hold)), next, `one step from ad ${at} at ${p}`);
    }
  }
  assert.equal(snapStop(0.4, undefined, hold, 2), 0.4, 'before any scroll has a direction, the run stays put');
});

test('tower 03 has three separate tiers with aligned walls and keeps its original ground-floor ad', async () => {
  const bytes = readFileSync(new URL('../../public/assets/models/runner-building-03.glb', import.meta.url));
  const { scene } = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  scene.updateMatrixWorld(true);
  const walls = [[2.5, 3.7], [5, 7.5], [9, 10.3]].map(([lo, hi], tier) => {
    const part = scene.getObjectByName(`building-03-tier-${tier}`);
    assert.ok(part, 'upper tiers remain independently editable');
    const box = new Box3();
    part.traverse((node) => {
      if (!node.isMesh || node.material.name !== 'Cool concrete') return;
      const positions = node.geometry.attributes.position;
      for (let i = 0; i < positions.count; i += 1) {
        const point = new Vector3().fromBufferAttribute(positions, i).applyMatrix4(node.matrixWorld);
        if (point.y > lo && point.y < hi) box.expandByPoint(point);
      }
    });
    return box;
  });
  for (const wall of walls.slice(1)) {
    assert.ok(Math.abs(wall.min.z - walls[0].min.z) < 1e-5 && Math.abs(wall.max.z - walls[0].max.z) < 1e-5, 'front and back wall planes align across all three tiers');
    assert.ok(wall.max.x - wall.min.x >= 0.98 * (walls[0].max.x - walls[0].min.x), 'upper walls no longer retreat into a pyramid');
  }
  const ad = new Box3();
  scene.traverse((node) => { if (node.isMesh && node.material.name === 'Ad screen') ad.union(new Box3().setFromObject(node)); });
  assert.ok(Math.abs(ad.min.y - 1.991) < 1e-5 && Math.abs(ad.max.y - 3.905) < 1e-5 && Math.abs(ad.max.x - ad.min.x - 6.468) < 1e-5, 'the original bottom ad keeps its height and width');
});

test('buildings 01 and 05 omit projecting neon side signs and retain their main ad screens', async () => {
  for (const [tag, minAd, maxAd] of [
    ['01', [-2.00213, 3.084547, 0.573051], [2.00209, 5.929735, 1.707232]],
    ['05', [-1.041539, 4.066186, 1.365538], [0.996326, 5.663386, 1.365538]],
  ]) {
    const bytes = readFileSync(new URL(`../../public/assets/models/runner-building-${tag}.glb`, import.meta.url));
    const { scene } = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
    scene.updateMatrixWorld(true);
    const ad = new Box3();
    scene.traverse(node => {
      if (!node.isMesh) return;
      if (node.material.name === 'Ad screen') ad.union(new Box3().setFromObject(node));
      const pivots = node.geometry.attributes._shard;
      for (let i = 0; i < pivots.count; i += 1) {
        const p = new Vector3().fromBufferAttribute(pivots, i).applyMatrix4(node.matrixWorld);
        // Measured centres of the removed sign panels; facade and balcony parts lie outside these regions.
        const sideSign = tag === '01'
          ? Math.abs(p.x) > 2.43 && p.z > -0.63 && p.z < -0.48
          : p.y > 0.7 && Math.abs(p.x) > 1.3 && p.z > 1.14;
        assert.ok(!sideSign, `${tag}: projecting side sign remains at ${p.toArray()}`);
      }
    });
    assert.ok(ad.min.distanceTo(new Vector3(...minAd)) < 1e-5 && ad.max.distanceTo(new Vector3(...maxAd)) < 1e-5,
      `${tag}: the main screen keeps its original position and dimensions`);
  }
});

test('the street calibrates every tower by its entrance with real footprints and one building at every stop', async () => {
  const { buildings: sizes, doorHeight } = JSON.parse(readFileSync(new URL('../animation-map.json', import.meta.url))).v3.runner;
  for (const { model, width, depth, height } of sizes) {
    const bytes = readFileSync(new URL(`../../public${model}`, import.meta.url));
    const { scene } = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
    const actual = new Box3().setFromObject(scene).getSize(new Vector3());
    assert.ok(Math.abs(width - actual.x) < 1e-5 && Math.abs(depth - actual.z) < 1e-5 && Math.abs(height - actual.y) < 1e-5, `${model}: layout must use the shipped dimensions`);
  }
  const towers = skyline(STOPS.slice(1), sizes, doorHeight);
  const shown = towers.filter(({ ad }) => ad !== undefined);
  assert.deepEqual(shown.map(({ ad, x }) => [ad, x]), RUN.map(({ stop }, i) => [i, stop]), 'each automation ad stands at its stop');
  for (const [i, tower] of towers.entries()) {
    assert.ok(Math.abs(tower.scale * sizes[tower.model].doorHeight - doorHeight * (sizes[tower.model].scaleMultiplier ?? 1)) < 1e-5, 'door-calibrated models keep their proportions, including the explicit round-tower enlargement');
    for (const other of towers.slice(i + 1)) {
      assert.ok(Math.abs(tower.x - other.x) > (tower.w + other.w) / 2 || Math.abs(tower.z - other.z) > (tower.d + other.d) / 2, 'physical building footprints do not intersect');
      if (tower.model === other.model) assert.equal(tower.scale, other.scale, 'no miniature gap fillers');
    }
  }
  const gaps = shown.slice(1).map((tower, i) => tower.x - shown[i].x);
  assert.ok(Math.max(...gaps) - Math.min(...gaps) > 2, 'stretches are long and short, not an equal-spaced parade');
  const fronts = shown.map(({ z, d }) => z + d / 2);
  assert.ok(Math.max(...fronts) - Math.min(...fronts) > 0.3, 'fronts step back at different depths');
});

test('street packing uses the visible body and aligns the widened round tower with shop fronts', async () => {
  const c = JSON.parse(readFileSync(new URL('../animation-map.json', import.meta.url))).v3.runner;
  const round = c.buildings[3];
  assert.ok(round.scaleMultiplier > 1.2, 'the round tower keeps its enlarged width and depth');
  for (const source of [c.buildings[0], c.buildings[1], round, c.blockout.shops[4]]) {
    assert.ok(source.footprint, `${source.model}: buried base must not reserve empty street width`);
    const bytes = readFileSync(new URL(`../../public${source.model}`, import.meta.url));
    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).register(() => ({ name: 'geometry-only', loadTexture: () => Promise.resolve(null) }));
    const { scene } = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
    scene.updateMatrixWorld(true);
    const box = new Box3();
    const scale = c.doorHeight / source.doorHeight * (source.scaleMultiplier ?? 1);
    scene.traverse(node => {
      if (!node.isMesh) return;
      const p = node.geometry.attributes.position;
      for (let i = 0; i < p.count; i += 1) {
        const point = new Vector3().fromBufferAttribute(p, i).applyMatrix4(node.matrixWorld);
        if (point.y > source.baseHeight + 0.005 / scale) box.expandByPoint(point);
      }
    });
    for (const [key, actual] of Object.entries({ left: box.min.x, right: box.max.x, back: box.min.z, front: box.max.z })) {
      assert.ok(Math.abs(source.footprint[key] - actual) < 1e-5, `${source.model}: visible ${key} includes every remaining object`);
    }
  }
  const tower = skyline(STOPS.slice(1), c.buildings, c.doorHeight)[3];
  assert.ok(Math.abs(tower.scale - c.doorHeight / round.doorHeight * round.scaleMultiplier) < 1e-6);
  const { shops } = streetBlockout(skyline(STOPS.slice(1), c.buildings, c.doorHeight), c.blockout, c.doorHeight);
  assert.ok(Math.abs(tower.z + tower.d / 2 - (shops[3].z + shops[3].d / 2)) < 1e-6, 'the cylinder entrance aligns with the shop fronts');
  assert.equal(tower.packingW, tower.w, 'the full cylinder width owns the gaps to its neighbours');
  assert.equal(tower.h, round.height * tower.scale * round.heightMultiplier);
  assert.equal(tower.baseHeight, round.baseHeight * tower.scale * round.heightMultiplier, 'the shortened tower stays grounded on the shared pavement');
});

test('the six shipped Rodin storefronts retain their measured bounds, embedded PBR maps and source provenance', () => {
  const shops = JSON.parse(readFileSync(new URL('../animation-map.json', import.meta.url))).v3.runner.blockout.shops;
  const report = JSON.parse(readFileSync(new URL('./fixtures/storefront-models.json', import.meta.url)));
  shops.forEach((shop, i) => {
    const bytes = readFileSync(new URL(`../../public${shop.model}`, import.meta.url));
    assert.equal(bytes.toString('ascii', 0, 4), 'glTF');
    assert.equal(bytes.readUInt32LE(8), bytes.length);
    const gltf = JSON.parse(bytes.toString('utf8', 20, 20 + bytes.readUInt32LE(12)));
    const positions = gltf.meshes.flatMap(mesh => mesh.primitives.map(p => gltf.accessors[p.attributes.POSITION]));
    const lo = [0, 1, 2].map(a => Math.min(...positions.map(p => p.min[a])));
    const hi = [0, 1, 2].map(a => Math.max(...positions.map(p => p.max[a])));
    [shop.w, shop.h, shop.d].forEach((v, a) => assert.ok(Math.abs(hi[a] - lo[a] - v) < 1e-5, `${shop.name}: real model dimensions own the layout`));
    assert.ok(Math.abs(lo[1]) < 1e-5 && Math.abs(lo[0] + hi[0]) < 1e-5 && Math.abs(lo[2] + hi[2]) < 1e-5, 'base grounded and footprint centred');
    assert.ok(report[i].sourceSha256.length === 64 && report[i].model === shop.model && report[i].bytes === bytes.length);
    assert.ok(gltf.meshes.every(mesh => mesh.primitives.every(p => p.attributes.NORMAL !== undefined)), 'near buildings keep smooth surface normals');
    if (i > 0 && i < 5) {
      assert.ok(gltf.images.length >= 3 && gltf.images.every(image => image.bufferView !== undefined), 'PBR maps stay embedded');
      assert.ok(gltf.materials[0].normalTexture && gltf.materials[0].pbrMetallicRoughness.baseColorTexture, 'normal and colour detail survive processing');
    }
    if (i === 1 || i === 4) {
      const names = i === 1 ? ['Motorcycle ivory enamel', 'Motorcycle red lettering', 'Motorcycle steel trim'] : ['Optical teal enamel', 'Optical warm ivory lettering', 'Optical muted brass trim'];
      for (const name of names) {
        const material = gltf.materials.findIndex(m => m.name === name);
        assert.ok(material >= 0 && gltf.meshes.some(mesh => mesh.primitives.some(p => p.material === material)), `${name}: repaired signs ship as geometry`);
        assert.equal(gltf.materials[material].pbrMetallicRoughness.baseColorTexture, undefined, 'clean signage does not reuse the distorted Rodin lettering texture');
      }
    }
  });
});

test('hillside textures keep weathering, framed light and filtered colour without external assets', () => {
  for (const kind of ['plaster', 'concrete', 'window']) {
    const map = hillsideTexture(THREE, kind);
    const { data, width, height } = map.image;
    assert.equal(data.length, width * height * 4);
    assert.equal(map.colorSpace, THREE.SRGBColorSpace);
    assert.ok(map.generateMipmaps && map.minFilter === THREE.LinearMipmapLinearFilter, 'distant detail is mip filtered');
    const shades = new Set(data.filter((_, i) => i % 4 === 0));
    assert.ok(shades.size > 20, 'surfaces contain actual tonal variation');
    if (kind === 'window') {
      const pixel = (x, y) => data[(y * width + x) * 4];
      assert.ok(pixel(16, 16) > pixel(0, 16) + 150 && pixel(16, 16) > pixel(width / 2, 16) + 150, 'warm panes retain dark border and mullion');
    }
    map.dispose();
  }
});

test('asphalt keeps world-scale grains and separate worn double-yellow and white edge lines', () => {
  const config = JSON.parse(readFileSync(new URL('../animation-map.json', import.meta.url))).v3.runner.blockout;
  const maps = { map: new THREE.Texture(), normalMap: new THREE.Texture(), roughnessMap: new THREE.Texture() };
  for (const path of [config.road.map, config.road.normalMap, config.road.roughnessMap]) {
    assert.ok(existsSync(new URL(`../../public${path}`, import.meta.url)), 'road assets ship with the site');
  }
  for (const padding of [64, config.endPadding]) {
    const left = TRACK[0] - padding, right = TRACK[1] + padding;
    const road = roadSurface(THREE, config, left, right, maps);
    const [asphalt, ...lines] = road.children;
    assert.equal(asphalt.position.y, 0, 'rider ground height stays unchanged');
    assert.equal(asphalt.material.normalMap, maps.normalMap);
    assert.equal(asphalt.material.roughnessMap, maps.roughnessMap);
    const uv = asphalt.geometry.attributes.uv;
    assert.ok(Math.abs((right - left) / (uv.getX(1) - uv.getX(0)) - config.road.tileSize) < 1e-5, 'extending the street adds repeats instead of stretching the asphalt');
    assert.equal(lines.length, 4);
    assert.ok(lines.every(line => line.position.y > 0 && line.position.y < 0.004 && line.material.polygonOffset), 'paint is below the rider shadow and avoids coplanar flicker');
    assert.ok(lines[0].position.z > config.sidewalk.front && lines[3].position.z < config.sidewalk.front + config.road.width, 'white edges stay within the road');
    assert.ok(lines[1].position.z > 0.5 && lines[2].position.z > lines[1].position.z, 'separate centre lines leave the rider lane clear');
    assert.ok(lines[0].material.color.equals(lines[3].material.color) && lines[1].material.color.equals(lines[2].material.color) && !lines[0].material.color.equals(lines[1].material.color));
    const wear = lines[0].material.alphaMap;
    assert.equal(wear.colorSpace, THREE.NoColorSpace);
    assert.ok(wear.generateMipmaps && wear.minFilter === THREE.LinearMipmapLinearFilter);
    const green = wear.image.data.filter((_, i) => i % 4 === 1);
    const missing = green.filter(v => v === 0).length / green.length;
    assert.ok(missing > 0.05 && missing < 0.25, 'paint has light wear without becoming a dashed line');
    const controller = createGroundBlackHole(THREE, new THREE.Scene(),
      { center: [TRACK[1], 0.025, 1], maxRadius: 3.1, gravity: 2100, duration: 9, openUntil: 0.56 });
    controller.addSurface(road);
    const positions = asphalt.geometry.attributes.position, refinedUV = asphalt.geometry.attributes.uv;
    assert.ok(positions.count > 1000 && positions.count < 12000, 'only the funnel neighbourhood is finely tessellated, regardless of road length');
    for (let i = 1; i < asphalt.geometry.parameters.widthSegments; i += 1) {
      const distance = positions.getX(i) - positions.getX(i - 1);
      const textureDistance = (refinedUV.getX(i) - refinedUV.getX(i - 1)) * config.road.tileSize;
      assert.ok(Math.abs(distance - textureDistance) < 0.0001, 'local refinement preserves the asphalt texture scale');
    }
    assert.ok(lines.every(line => line.geometry.attributes.position.count > 100), 'paint strips also have vertices to curve down with the asphalt');
    controller.dispose();
  }
});

test('fast-food front windows meet their mullions without exposing the bright interior', async () => {
  const bytes = readFileSync(new URL('../../public/assets/models/runner-shop-06.glb', import.meta.url));
  const { scene } = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  scene.updateMatrixWorld(true);
  const ray = new THREE.Raycaster();
  // Probe both sides of the seven inner mullions, just beyond the metal edge.
  for (let i = 0; i < 7; i += 1) for (const side of [-1, 1]) {
    const x = -1.7805737 + i * 0.6184063 + side * 0.016;
    ray.set(new Vector3(x, 1, 5), new Vector3(0, 0, -1));
    assert.equal(ray.intersectObject(scene)[0].object.material.name, 'Smoky dining glass', 'a window seam must show glazing rather than the dining room');
  }
});

test('the street packs distinct neighbouring shops and supported hillside homes without stair gaps', async () => {
  const c = JSON.parse(readFileSync(new URL('../animation-map.json', import.meta.url))).v3.runner;
  const towers = skyline(STOPS.slice(1), c.buildings, c.doorHeight);
  assert.equal(towers.length, 6, 'only the six focal buildings use ad towers');
  const { shops, homes, platforms, sidewalk } = streetBlockout(towers, c.blockout, c.doorHeight);
  assert.ok(shops.length > 6, 'the six unique storefronts also continue beyond the course');
  assert.equal(new Set(homes.map(h => h.row)).size, 3, 'main street plus three terraces makes four layers');
  const lots = [...towers, ...shops, ...homes];
  for (const [i, a] of lots.entries()) for (const b of lots.slice(i + 1)) {
      assert.ok(Math.abs(a.x - b.x) >= (a.w + b.w) / 2 || Math.abs(a.z - b.z) >= (a.d + b.d) / 2, 'building footprints must not overlap');
  }
  shops.forEach((s) => {
    const source = c.blockout.shops.find(shop => shop.model === s.model);
    assert.ok(Math.abs(s.scale * source.doorHeight - c.doorHeight) < 1e-6, `${s.name}: entrance sets the scale`);
    assert.ok(Math.abs(s.h / source.h - s.scale) < 1e-6, 'model scale stays uniform');
    const width = source.footprint ? source.footprint.right - source.footprint.left : source.w;
    const depth = source.footprint ? source.footprint.front - source.footprint.back : source.d;
    assert.ok(Math.abs(s.w / width - s.scale) < 1e-6 && Math.abs(s.d / depth - s.scale) < 1e-6, 'packing uses the visible footprint without stretching the model');
    assert.ok(Math.abs(s.y + source.baseHeight * s.scale + 0.005 - sidewalk.h) < 1e-6 && s.z + s.d / 2 < -4, 'shop bases are buried at the shared pavement height behind the run');
  });
  assert.equal(sidewalk.h, c.blockout.sidewalk.height);
  assert.ok(sidewalk.z + sidewalk.d / 2 < -1, 'pavement stays clear of the rider and obstacles');
  for (const lot of [...towers, ...shops]) {
    assert.ok(Math.abs(lot.x - sidewalk.x) + lot.w / 2 < sidewalk.w / 2 && Math.abs(lot.z - sidewalk.z) + lot.d / 2 < sidewalk.d / 2, 'one continuous pavement contains every base, including both street extensions');
  }
  assert.equal(new Set(shops.filter(s => s.x > -10 && s.x < TRACK[1]).map(s => s.model)).size, 6, 'all six storefronts occur along the run');
  const front = [...towers.map(t => ({ ...t, w: t.packingW })), ...shops].sort((a, b) => a.x - b.x);
  front.slice(1).forEach((s, i) => {
    assert.notEqual(s.model, front[i].model, 'identical storefronts must have another building between them, including both extensions');
    assert.ok(s.x - s.w / 2 - (front[i].x + front[i].w / 2) <= 0.16, 'street buildings leave only a narrow seam, without stair alleys');
  });
  const fastFood = shops.find(s => s.model.endsWith('06.glb'));
  assert.ok(fastFood.scale > 1.8, 'the formerly undersized single-storey restaurant is enlarged by its entrance');
  for (const side of [-1, 1]) {
    const edge = side < 0 ? TRACK[0] - c.blockout.endPadding : TRACK[1] + c.blockout.endPadding;
    const endShops = shops.filter(s => side < 0 ? s.x < TRACK[0] : s.x > TRACK[1]);
    assert.ok(endShops.length > 0 && endShops.every(s => c.blockout.shops.some(source => source.model === s.model)), 'both ends reuse the shipped shops');
    assert.ok(endShops.some(s => side * (s.x + side * s.w / 2 - edge) >= 0), 'near storefronts reach the street edge');
    for (let row = 0; row < c.blockout.terraces.length; row += 1) {
      assert.ok(platforms.some(p => p.row === row && Math.abs(p.x + side * p.w / 2 - edge) < 1e-6), 'every hillside row reaches both street edges');
    }
  }
  homes.forEach((h, i) => {
    const p = platforms[i];
    assert.equal(h.y, p.h, 'every home sits on its terrace');
    assert.ok(Math.abs(h.x - p.x) + h.w / 2 <= p.w / 2 && Math.abs(h.z - p.z) + h.d / 2 <= p.d / 2, 'the platform supports the entire footprint');
    assert.ok(h.y + h.h <= 92 && h.z - h.d / 2 > -65, 'roof heights and depth fit the four-layer hillside envelope');
  });
  for (let row = 0; row < c.blockout.terraces.length; row += 1) {
    const line = homes.filter(h => h.row === row).sort((a, b) => a.x - b.x);
    line.slice(1).forEach((h, i) => assert.ok(h.x - h.w / 2 - (line[i].x + line[i].w / 2) <= 0.16, 'hillside homes no longer reserve strips for stairs'));
  }
});

test('finite hillside ends stay outside the viewport at both camera limits, including ultrawide', () => {
  const c = JSON.parse(readFileSync(new URL('../animation-map.json', import.meta.url))).v3.runner;
  const street = streetBlockout(skyline(STOPS.slice(1), c.buildings, c.doorHeight), c.blockout, c.doorHeight);
  const renderer = {
    capabilities: { maxTextureSize: 16384 }, setRenderTarget() {},
    render(scene, camera) { camera.updateMatrixWorld(); },
  };
  const lens = tinyPlanet(THREE, renderer, new THREE.Scene(), c.lenses.planet, c.camera.z);
  const camera = new PerspectiveCamera(c.camera.fov, 1, 0.1, 110);
  for (const [width, height] of [[1280, 720], [1920, 1009], [2560, 1080], [3440, 1440]]) {
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    lens.setSize(width, height);
    for (const side of [-1, 1]) {
      const x = side < 0 ? TRACK[0] : TRACK[1];
      camera.position.set(x, c.camera.y, c.camera.z);
      camera.lookAt(x, c.camera.lookY, 0);
      camera.updateMatrixWorld();
      lens.render(camera);
      for (const boxes of [street.homes, street.platforms]) for (let row = 0; row < c.blockout.terraces.length; row++) {
        const end = boxes.filter(b => b.row === row).at(side < 0 ? 0 : -1);
        for (const y of [end.y, end.y + end.h / 2, end.y + end.h]) for (const z of [end.z - end.d / 2, end.z + end.d / 2]) {
          const [px, py] = lens.toView(new Vector3(end.x + side * end.w / 2, y, z));
          assert.ok(px < 0 || px > width || py > height, `${width}x${height}, side ${side}, row ${row}: finite edge visible at ${px}, ${py}`);
        }
      }
    }
  }
  lens.dispose();
});

test('the rider kicks once leaving the start and every ad but the last, its planted foot staying put', () => {
  const planted = new Set();
  const kicks = [];
  let last = null;
  for (let x = TRACK[0]; x <= TRACK[1]; x += 0.005) {
    const { step, y } = pose(x);
    if (step && !last) kicks.push({ first: step });
    if (!step && last) kicks.at(-1).end = last;
    if (step && last) assert.ok(Math.hypot(...step.map((v, i) => v - last[i])) < 0.02, `kick foot jumps at ${x}`);
    if (step?.[1] === 0) {
      assert.equal(y, 0, 'kicks only on flat ground');
      assert.ok(step[2] > 0.17, 'planted beside the deck and wheels');
      planted.add((x + step[0]).toFixed(6)); // world x of the planted sole
    }
    last = step;
  }
  assert.equal(kicks.length, STOPS.length - 1);
  assert.equal(planted.size, STOPS.length - 1, 'one fixed ground contact per push');
  for (const { first, end } of kicks) {
    for (const sole of [first, end]) assert.ok(sole[1] > 0.12 && Math.abs(sole[2]) < 0.01, 'starts and ends on the deck');
  }
});

test('the 3D hero landing frame projects every placed point back onto its works pixel', () => {
  const [width, height] = [1440, 900];
  const slot = { x: 2.4, y: 1.35, z: 2, distance: 3 };
  const frame = landing(width, height, [548, 621], slot);
  const camera = new PerspectiveCamera(LAND_FOV, width / height, 0.1, 80);
  camera.position.fromArray(frame.camera);
  camera.lookAt(frame.camera[0], frame.camera[1], frame.camera[2] - 1);
  camera.updateMatrixWorld();
  const pixel = (point) => {
    const ndc = new Vector3(...point).project(camera);
    return [((ndc.x + 1) / 2) * width, ((1 - ndc.y) / 2) * height];
  };
  // CH 01's slot, a shelf corner and the backdrop centre, at the depths the scene uses.
  for (const [px, py, z] of [[548, 621, slot.z], [1300, 760, slot.z - 0.008], [720, 450, slot.z - 0.3]]) {
    const [x, y] = pixel(frame.toWorld(px, py, z));
    assert.ok(Math.abs(x - px) < 1e-6 && Math.abs(y - py) < 1e-6, `${px},${py} at z ${z} lands on ${x},${y}`);
  }
  assert.deepEqual(frame.toWorld(548, 621).slice(0, 2).map((v) => +v.toFixed(9)), [slot.x, slot.y]);
});

test('the belt stops with every TV in the landing frame printed and clear of the fabricator', () => {
  // Works TVs at the pin start: CH 01 right of centre, CH 02 cut by the left edge, CH 03 off screen.
  const rects = [{ cx: 890, w: 669 }, { cx: -130, w: 480 }, { cx: -1150, w: 650 }];
  const unit = 0.0018;
  const { land, offsets } = beltPlan(rects, unit);
  const left = (i) => land + offsets[i] - (rects[i].w * unit) / 2;
  assert.ok(left(0) > 1.4 && left(1) > 1.4, 'on screen TVs stand right of the front pillar (x 1.4)');
  assert.ok(left(2) < 0, 'an off-screen channel may still wait before the scan plane');
  assert.ok(Math.abs(offsets[0] - offsets[1] - 1020 * unit) < 1e-9, 'the belt keeps the works spacing');
});

test('a TV cabinet spans the body of its frame art, without antennas, feet or the screen hole', () => {
  // 10x10 art: an antenna in rows 0-2, the body in rows 3-8 with a screen hole, two feet in row 9.
  const alpha = new Uint8Array(100);
  const fill = (x0, x1, y0, y1) => { for (let y = y0; y <= y1; y += 1) for (let x = x0; x <= x1; x += 1) alpha[y * 10 + x] = 255; };
  fill(5, 5, 0, 2);
  fill(1, 8, 3, 8);
  for (let y = 4; y <= 7; y += 1) alpha.fill(0, y * 10 + 3, y * 10 + 7);
  fill(2, 2, 9, 9);
  fill(7, 7, 9, 9);
  assert.deepEqual(bodyBounds(alpha, 10, 10), { x: 0.1, y: 0.3, w: 0.8, h: 0.6 });
});
