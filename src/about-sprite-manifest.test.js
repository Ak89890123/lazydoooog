import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  ABOUT_SPRITE_REGISTRATION,
  ABOUT_SPRITE_SHEET_SPECS,
  createAboutSpriteFrameState,
  createAboutSpriteRenderState,
  validateAboutSpriteManifest,
} from './about-sprite-manifest.js';

const HASH = 'a'.repeat(64);
const APPROVED_SHEETS = ['entrance_roll', 'ollie', 'kickflip', 'boardslide_popout', 'exit_roll'];
const readAsset = (path) => readFileSync(new URL(path, import.meta.url));

const createManifest = (id = 'kickflip') => {
  const spec = ABOUT_SPRITE_SHEET_SPECS[id];
  return {
    id,
    sheetPath: `/assets/sprites/about/${id}.png`,
    frameCount: spec.frameCount,
    cell: { width: 128, height: 128 },
    columns: spec.columns,
    rows: spec.rows,
    canvas: { width: spec.canvasWidth, height: spec.canvasHeight },
    fps: 12,
    anchor: { x: 64, y: 120 },
    groundBaselineY: 112,
    loop: false,
    holdLastFrame: true,
    transparent: true,
    rowMajor: true,
    antialiasFringePixels: 0,
    paletteSize: 24,
    canonicalReferenceSha256: HASH,
    groundedKeyframes: [0, spec.frameCount - 1],
    sha256: 'b'.repeat(64),
    frames: Array.from({ length: spec.frameCount }, (_, index) => ({
      index,
      alphaBbox: { x: 24, y: 18, width: 80, height: 94 },
      boardOrientation: 'side_on_unforeshortened',
      wheelVisibility: 'both',
      wheelbaseApplicable: true,
      wheelCenters: { front: [88, 108], rear: [42, 108] },
    })),
  };
};

test('sprite sheet specifications preserve every locked grid and registration value', () => {
  assert.deepEqual(ABOUT_SPRITE_REGISTRATION, {
    cellWidth: 128,
    cellHeight: 128,
    anchorX: 64,
    anchorY: 120,
    groundBaselineY: 112,
    fps: 12,
  });
  assert.deepEqual(
    Object.fromEntries(Object.entries(ABOUT_SPRITE_SHEET_SPECS).map(([id, spec]) => (
      [id, [spec.frameCount, spec.columns, spec.rows, spec.canvasWidth, spec.canvasHeight]]
    ))),
    {
      entrance_roll: [12, 6, 2, 768, 256],
      ollie: [12, 6, 2, 768, 256],
      kickflip: [16, 8, 2, 1024, 256],
      boardslide_popout: [20, 5, 4, 640, 512],
      exit_roll: [12, 6, 2, 768, 256],
    },
  );
});

test('a structurally complete manifest passes the deterministic validator', () => {
  assert.deepEqual(
    validateAboutSpriteManifest(createManifest(), { canonicalReferenceSha256: HASH }),
    { valid: true, errors: [] },
  );
});

test('approved sheets are hash-bound to one registration reference', () => {
  const reference = JSON.parse(readAsset('../public/assets/sprites/about/sprite-registration-reference.json'));
  const referenceHash = createHash('sha256')
    .update(readAsset('../public/assets/sprites/about/sprite-registration-reference.png'))
    .digest('hex');

  assert.equal(reference.sha256, referenceHash);
  assert.equal(reference.wheelbase, 36);
  APPROVED_SHEETS.forEach((id) => {
    const manifest = JSON.parse(readAsset(`../public/assets/sprites/about/${id}.json`));
    const sheetHash = createHash('sha256')
      .update(readAsset(`../public/assets/sprites/about/${id}.png`))
      .digest('hex');

    assert.deepEqual(
      validateAboutSpriteManifest(manifest, { canonicalReferenceSha256: referenceHash }),
      { valid: true, errors: [] },
    );
    assert.equal(manifest.sha256, sheetHash);
    assert.equal(manifest.canonicalReferenceSha256, referenceHash);
    const transitionHeights = manifest.groundedKeyframes.map((index) => (
      manifest.frames[index].alphaBbox.height
    ));
    transitionHeights.forEach((height) => {
      assert.ok(Math.abs(height - reference.alphaBbox.height) <= 2);
    });
    manifest.frames.filter((frame) => frame.wheelbaseApplicable).forEach((frame) => {
      const wheelbase = frame.wheelCenters.front[0] - frame.wheelCenters.rear[0];
      assert.ok(Math.abs(wheelbase - reference.wheelbase) <= 2);
    });
  });
});

test('boardslide packaging rejects split subjects in the final row', () => {
  const manifest = JSON.parse(readAsset('../public/assets/sprites/about/boardslide_popout.json'));

  manifest.frames.slice(15).forEach((frame) => {
    assert.ok(frame.alphaBbox.width <= 106, `frame ${frame.index} spans ${frame.alphaBbox.width}px`);
  });
});

test('validator rejects unfilled grids, registration drift, and reference substitution', () => {
  const manifest = createManifest('ollie');
  manifest.rows = 3;
  manifest.anchor.y = 119;
  manifest.canonicalReferenceSha256 = 'c'.repeat(64);

  const result = validateAboutSpriteManifest(manifest, { canonicalReferenceSha256: HASH });
  assert.equal(result.valid, false);
  assert.ok(result.errors.includes('grid'));
  assert.ok(result.errors.includes('undeclared-cells'));
  assert.ok(result.errors.includes('canvas'));
  assert.ok(result.errors.includes('anchor'));
  assert.ok(result.errors.includes('reference-hash-mismatch'));
});

test('wheelbase applicability is derived from visibility and orientation', () => {
  const manifest = createManifest();
  manifest.frames[3] = {
    ...manifest.frames[3],
    boardOrientation: 'pitching',
    wheelbaseApplicable: true,
  };
  manifest.frames[4] = {
    ...manifest.frames[4],
    wheelVisibility: 'front_only',
    wheelbaseApplicable: false,
    wheelCenters: { front: [88, 108], rear: [42, 108] },
  };

  const result = validateAboutSpriteManifest(manifest, { canonicalReferenceSha256: HASH });
  assert.equal(result.valid, false);
  assert.ok(result.errors.includes('frame-3:wheelbase-applicability'));
  assert.ok(result.errors.includes('frame-4:rear-wheel-center'));
});

test('sprite frame mapping is deterministic at every canonical phase boundary', () => {
  assert.deepEqual(createAboutSpriteFrameState({ stage: 1, q: 0 }), {
    sheet: 'entrance_roll', frame: 0, visible: true, pose: 'entrance',
  });
  assert.deepEqual(createAboutSpriteFrameState({ stage: 2, q: 0.1 }), {
    sheet: 'kickflip', frame: 0, visible: true, pose: 'action',
  });
  assert.deepEqual(createAboutSpriteFrameState({ stage: 3, q: 0.5 }), {
    sheet: 'boardslide_popout', frame: 19, visible: true, pose: 'impact-hold',
  });
  assert.deepEqual(createAboutSpriteFrameState({ stage: 1, q: 0.72 }), {
    sheet: 'exit_roll', frame: 0, visible: true, pose: 'exit',
  });
  assert.deepEqual(createAboutSpriteFrameState({ stage: 1, q: 0.75 }), {
    sheet: 'exit_roll', frame: 1, visible: true, pose: 'exit',
  });
  assert.deepEqual(createAboutSpriteFrameState({ stage: 3, q: 1 }), {
    sheet: 'exit_roll', frame: 11, visible: true, pose: 'exit',
  });
});

test('reverse playback resolves to the same canonical frame as forward playback', () => {
  const forward = createAboutSpriteFrameState({ stage: 2, q: 0.3375, direction: 1 });
  const reverse = createAboutSpriteFrameState({ stage: 2, q: 0.3375, direction: -1 });

  assert.deepEqual(reverse, forward);
  assert.equal(forward.sheet, 'kickflip');
  assert.equal(forward.frame, 9);
});

test('boardslide holds contact frames until the board clears the rail', () => {
  assert.equal(createAboutSpriteFrameState({ stage: 3, q: 0.44 }).frame, 13);
  assert.equal(createAboutSpriteFrameState({ stage: 3, q: 0.45 }).frame, 14);
});

test('sprite render state addresses exact row-major cells without layout reads', () => {
  const manifest = createManifest('kickflip');

  assert.deepEqual(createAboutSpriteRenderState(manifest, 0), {
    sheetPath: '/assets/sprites/about/kickflip.png',
    backgroundSize: '800% 200%',
    backgroundPosition: '0% 0%',
  });
  assert.deepEqual(createAboutSpriteRenderState(manifest, 9), {
    sheetPath: '/assets/sprites/about/kickflip.png',
    backgroundSize: '800% 200%',
    backgroundPosition: `${(1 / 7) * 100}% 100%`,
  });
});
