import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveContacts } from './collapse-contacts.js';

const box = (values = {}) => ({ x: 0, y: 0, z: 0, hx: 1, hy: 1, hz: 1, active: true, ...values });
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `${a} != ${b}`);

// Independent volume oracle: a single assertion, no allocations/assertions per pair.
function assertSeparated(boxes) {
  const active = boxes.filter(body => body.active !== false);
  let overlaps = 0;
  for (let i = 0; i < active.length; i += 1) for (let j = i + 1; j < active.length; j += 1) {
    const a = active[i], b = active[j];
    if (a.fixed && b.fixed) continue;
    if (Math.min(a.x + a.hx, b.x + b.hx) - Math.max(a.x - a.hx, b.x - b.hx) > 1e-10 &&
        Math.min(a.y + a.hy, b.y + b.hy) - Math.max(a.y - a.hy, b.y - b.hy) > 1e-10 &&
        Math.min(a.z + a.hz, b.z + b.hz) - Math.max(a.z - a.hz, b.z - b.hz) > 1e-10) overlaps += 1;
  }
  assert.equal(overlaps, 0, 'no intersecting volumes remain');
}

test('unequal and contained volumes separate along the closest real contact face', () => {
  for (const bodies of [
    [box({ hx: 3, hy: 2, hz: 2 }), box({ x: 2.7, y: 1.8, z: 1.6, hx: 0.7, hy: 0.8, hz: 0.8 })],
    [box({ x: -3.1, y: -2, z: -3.1, hx: 3, hy: 3, hz: 3 }),
      box({ x: -3.05, y: -2, z: -3, hx: 0.1, hy: 0.2, hz: 0.3 })],
    // Tiny released fragments must still find long, thin bounds in coarser levels.
    [box({ x: -30.8, hx: 30.84, hy: 0.2, hz: 0.1 }),
      box({ x: 0.035, y: 0.19, z: 0.09, hx: 0.0035, hy: 0.012, hz: 0.012 })],
  ]) {
    const original = structuredClone(bodies), a = original[0], b = original[1];
    const closest = Math.min(...['x', 'y', 'z'].map(axis => a[`h${axis}`] + b[`h${axis}`] - Math.abs(a[axis] - b[axis])));
    resolveContacts(bodies);
    assertSeparated(bodies);
    assert.deepEqual(bodies[0], a);
    near(Math.hypot(bodies[1].x - b.x, bodies[1].y - b.y, bodies[1].z - b.z), closest);
  }
});

test('separated boxes and face, edge or corner touching are exact no-ops', () => {
  for (const bodies of [[], [box()], [box(), box({ x: 2.01 })], [box(), box({ z: -2 })],
    [box(), box({ y: 2 })], [box(), box({ x: 2, y: 2 })], [box(), box({ x: 2, y: 2, z: 2 })],
    [box({ x: -0.1, z: -0.1 }), box({ x: 0.1, y: -5, z: 0.1 })]]) {
    const original = structuredClone(bodies);
    assert.equal(resolveContacts(bodies), bodies);
    assert.deepEqual(bodies, original);
  }
});

test('a neighbouring contact resolves the cascade without moving unrelated boxes', () => {
  const bodies = [box(), box({ x: 2.1 }), box({ x: 1.5 }), box({ x: 30, z: -30 })];
  const original = structuredClone(bodies), references = bodies.slice();
  resolveContacts(bodies);
  assertSeparated(bodies);
  assert.ok(bodies[2].y !== 0 || bodies[2].z !== 0, 'blocked X contacts deflect along another axis');
  assert.deepEqual(bodies[0], original[0]);
  assert.deepEqual(bodies[1], original[1]);
  assert.deepEqual(bodies[3], original[3]);
  bodies.forEach((body, i) => assert.equal(body, references[i]));
});

test('inactive volumes neither obstruct nor move', () => {
  const inactive = box({ hx: 10000, hy: 10000, hz: 10000, active: false });
  const original = structuredClone(inactive), lone = box();
  resolveContacts([inactive, lone]);
  assert.deepEqual(lone, box());
  const bodies = [inactive, box(), box({ y: 0.25 })];
  resolveContacts(bodies);
  assertSeparated(bodies);
  near(bodies[2].y, 2);
  assert.deepEqual(inactive, original);
});

test('fixed architecture stays unchanged while smaller and larger flying bounds clear it', () => {
  const fixed = [box({ fixed: true }), box({ fixed: true, x: 0.5 }),
    box({ fixed: true, x: 20, hx: 0.0035, hy: 0.012, hz: 0.012 })];
  const original = structuredClone(fixed);
  const bodies = [box({ x: 20, hx: 4, hy: 3, hz: 2 }), ...fixed,
    box({ x: -0.99, hx: 0.012, hy: 0.012, hz: 0.012 })];
  resolveContacts(bodies);
  assertSeparated(bodies);
  assert.deepEqual(fixed, original, 'including fixed-fixed architectural interlocks');
  const settled = structuredClone(bodies);
  resolveContacts(bodies);
  assert.deepEqual(bodies, settled);
});

test('tightly coincident unequal bounds spread in three dimensions and stay settled', () => {
  const bodies = Array.from({ length: 96 }, (_, i) => box({
    y: (i % 7) * 1e-8, hx: 0.1 + (i % 3) * 0.07,
    hy: 0.1 + (i % 5) * 0.03, hz: 0.2 + (i % 4) * 0.04,
  }));
  resolveContacts(bodies);
  assertSeparated(bodies);
  for (const axis of ['x', 'y', 'z']) assert.ok(new Set(bodies.map(body => body[axis])).size > 3);
  const settled = structuredClone(bodies);
  resolveContacts(bodies);
  assert.deepEqual(bodies, settled);
});

test('1830 crowded bounds fully separate compactly at scales 1 and .012 with deterministic rewind', () => {
  for (const scale of [1, 0.012]) {
    const sample = Array.from({ length: 1830 }, (_, i) => box({
      x: 0.2 + (i % 7) * 1e-5 * scale, y: 0.3 + (i % 11) * 1e-5 * scale,
      z: 0.5 + (i % 13) * 1e-5 * scale,
      hx: (0.1 + (i % 7) * 0.025) * scale,
      hy: (0.1 + (i % 11) * 0.015) * scale,
      hz: (0.1 + (i % 5) * 0.0375) * scale,
    }));
    const forward = structuredClone(sample), rewind = structuredClone(sample);
    resolveContacts(forward);
    assertSeparated(forward);
    assert.ok(Math.max(...forward.map(body => Math.hypot(body.x - 0.2, body.y - 0.3, body.z - 0.5))) < 15 * scale,
      'crowding spreads locally instead of creating a tall column');
    resolveContacts([box(), box(), box()]);
    resolveContacts(rewind);
    assert.deepEqual(rewind, forward, 'no solver state leaks between scroll samples');
    resolveContacts(rewind);
    assert.deepEqual(rewind, forward, 'settled contacts do not creep');
  }
});
