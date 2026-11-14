import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  createReleaseTargets,
  createSheetSettings,
  mapTearProgress,
  normalizeTearConfig,
  ripFragmentShader,
  ripVertexShader,
} from './paper-tear-transition.js';

const readPngChunk = (bytes, expectedType) => {
  let offset = 8;

  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString('ascii', offset + 4, offset + 8);

    if (type === expectedType) return bytes.subarray(offset + 8, offset + 8 + length);
    offset += length + 12;
  }

  return null;
};

const animationMap = JSON.parse(readFileSync(
  new URL('./animation-map.json', import.meta.url),
  'utf8',
));

test('paper tear defaults preserve the CodePen material parameters', () => {
  const config = normalizeTearConfig({ tearOffset: 0.5 });

  assert.equal(config.seamX, 0.5);
  assert.equal(config.seamTopX, 0.5);
  assert.equal(config.seamBottomX, 0.5);
  assert.equal(config.tearWidthRatio, 0.4 / 3);
  assert.equal(config.ripWhiteThreshold, 0.7);
  assert.equal(config.releaseAt, 0.72);
  assert.equal(config.releaseDistanceScale, 1);
  assert.equal(config.releaseRotationScale, 1);
  assert.equal(config.ripTexture, '/assets/textures/codepen-rip.jpg');
});

test('both masked sheets retain the full 3:2 photo geometry without a white halo', () => {
  const settings = createSheetSettings(1.5, { tearOffset: 0.5 });

  assert.equal(settings.width, 3);
  assert.equal(settings.height, 2);
  assert.equal(settings.tearWidth, 0.4);
  assert.equal(settings.seamTopX, 0.5);
  assert.equal(settings.seamBottomX, 0.5);
  assert.equal(settings.left.width, 3);
  assert.equal(settings.right.width, 3);
  assert.equal(settings.left.tearXAngle, -0.01);
  assert.equal(settings.left.tearYAngle, -0.1);
  assert.equal(settings.left.tearZAngle, 0.05);
  assert.equal(settings.right.tearXAngle, 0.2);
  assert.equal(settings.right.tearYAngle, 0.1);
  assert.equal(settings.right.tearZAngle, -0.1);
  assert.equal(settings.left.shadeAmount, 0);
  assert.equal(settings.right.shadeAmount, 0.4);
});

test('the tear mask interpolates from 75% at the top to 37.5% at the bottom', () => {
  const settings = createSheetSettings(1.5, {
    seamX: 0.5,
    seamTopX: 0.75,
    seamBottomX: 0.375,
  });

  assert.equal(settings.seamTopX, 0.75);
  assert.equal(settings.seamBottomX, 0.375);
});

test('scroll progress separates tearing from the original release and fall phase', () => {
  const settings = createSheetSettings(1.5, { releaseAt: 0.72, tearOffset: 0.5 });

  assert.deepEqual(mapTearProgress(0, settings), {
    progress: 0,
    release: 0,
    fall: 0,
    tearAmount: 0,
  });
  assert.equal(mapTearProgress(0.36, settings).tearAmount, 0.575);
  assert.equal(mapTearProgress(0.72, settings).tearAmount, 1.15);
  assert.equal(mapTearProgress(0.72, settings).fall, 0);
  assert.deepEqual(mapTearProgress(1, settings), {
    progress: 1,
    release: 1,
    fall: 1,
    tearAmount: 2.25,
  });
});

test('the tuned fall curve uses a longer release phase and eases into its landing', () => {
  const settings = createSheetSettings(1.5, { releaseAt: 0.6, tearOffset: 0.5 });
  const midpoint = mapTearProgress(0.8, settings);

  assert.ok(Math.abs(midpoint.release - 0.5) < 1e-12);
  assert.ok(Math.abs(midpoint.fall - 0.5) < 1e-12);
});

test('the sequence preserves the longer paper exit after extending the Hero motion beats', () => {
  const hero = animationMap.sections.find((section) => section.id === 'hero');

  assert.equal(hero.paperTear.duration, 3.472);
  assert.ok(Math.abs(hero.paperTear.releaseAt - 1.86 / 3.472) < 1e-10);
  assert.ok(Math.abs(hero.titleHoldDuration - 1.15 * 0.7 * 0.5) < 1e-12);
  assert.equal(hero.sequenceScrollDistanceVh, 10.89);
  assert.equal(hero.endTime, 10.375);
  assert.ok(hero.paperTear.duration / 2.25 > 1.35);
  assert.ok(Math.abs(
    hero.paperTear.duration * (1 - hero.paperTear.releaseAt)
      - 3.1 * (1 - 0.6) * 1.3
  ) < 1e-10);
});

test('release distance and rotation scales reduce travel without changing direction', () => {
  const baseline = createReleaseTargets(4.731);
  const tuned = createReleaseTargets(4.731, 0.72, 0.58);

  assert.ok(Math.abs(tuned.left.y - baseline.left.y * 0.72) < 1e-12);
  assert.ok(Math.abs(tuned.right.x - baseline.right.x * 0.72) < 1e-12);
  assert.ok(Math.abs(tuned.left.zRotation - baseline.left.zRotation * 0.58) < 1e-12);
  assert.ok(tuned.left.x < 0);
  assert.ok(tuned.right.x > 0);
});

test('unsafe configuration values are clamped without changing the two-sheet model', () => {
  const config = normalizeTearConfig({
    seamX: 4,
    seamTopX: 3,
    seamBottomX: -2,
    tearWidthRatio: -3,
    ripWhiteThreshold: 2,
    tearOffset: -5,
    releaseAt: 0.1,
    tearReleaseAmount: 9,
    tearEndAmount: 0,
    releaseDistanceScale: 8,
    releaseRotationScale: -2,
    pixelRatioCap: 8,
  });

  assert.equal(config.seamX, 0.78);
  assert.equal(config.seamTopX, 0.78);
  assert.equal(config.seamBottomX, 0.22);
  assert.equal(config.tearWidthRatio, 0.06);
  assert.equal(config.ripWhiteThreshold, 0.86);
  assert.equal(config.tearOffset, 0);
  assert.equal(config.releaseAt, 0.5);
  assert.equal(config.tearReleaseAmount, 1.35);
  assert.equal(config.tearEndAmount, 1.5);
  assert.equal(config.releaseDistanceScale, 1.2);
  assert.equal(config.releaseRotationScale, 0.3);
  assert.equal(config.pixelRatioCap, 2);
});

test('the shipped shaders retain the CodePen bend and photographed rip-mask contracts', () => {
  assert.match(ripVertexShader, /uTearAmount - \(1\.0 - uv\.y\)/);
  assert.match(ripVertexShader, /mix\(uSeamBottomX, uSeamTopX, uv\.y\)/);
  assert.match(ripVertexShader, /position\.x - seamWorldX/);
  assert.match(ripVertexShader, /rotationY\(rotation\.y\).*rotationX\(rotation\.x\).*rotationZ\(rotation\.z\)/s);
  assert.match(ripFragmentShader, /mix\(uSeamBottomX, uSeamTopX, vUv\.y\)/);
  assert.match(ripFragmentShader, /if \(alpha <= 0\.0\) discard/);
  assert.match(ripFragmentShader, /texture2D\(uRip, vec2\(ripX, ripY\)\)/);
  assert.match(ripFragmentShader, /uWhiteThreshold/);
  assert.match(ripFragmentShader, /uBorder/);
  assert.match(ripFragmentShader, /float tearShadeMask = 1\.0 - smoothstep/);
  assert.match(ripFragmentShader, /vAmount \* uShadeAmount \* tearShadeMask \* 0\.35/);
});

test('the Hero handoff frame is explicitly tagged for sRGB browser display', () => {
  const bytes = readFileSync(new URL(
    '../public/assets/posters/hero-title-scroll-v2-final.png',
    import.meta.url,
  ));

  assert.deepEqual([...readPngChunk(bytes, 'sRGB')], [1]);
  assert.equal(readPngChunk(bytes, 'cICP'), null);
});
