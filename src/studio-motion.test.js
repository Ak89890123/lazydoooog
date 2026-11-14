import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getStudioHeroState } from './studio-motion-math.js';
import { featuredProjects } from './sections/featured-projects.js';

const animationMap = JSON.parse(readFileSync(new URL('./animation-map.json', import.meta.url)));
const stages = animationMap.studio.hero.stages;

test('formal Hero never uncovers the corridor before intact paper is opaque', () => {
  for (let step = 0; step <= 1000; step += 1) {
    const state = getStudioHeroState(step / 1000, stages);
    if (state.paperOpacity < 1) {
      assert.equal(state.corridorVisible, false);
      assert.equal(state.tearProgress, 0);
    }
    if (state.corridorVisible) {
      assert.equal(state.filmOpacity, 0);
      assert.equal(state.paperOpacity, 1);
    }
  }
});

test('pending final decoded frame keeps film visible, including a fast fling', () => {
  const state = getStudioHeroState(1, stages, false);
  assert.equal(state.filmOpacity, 1);
  assert.equal(state.paperOpacity, 0);
  assert.equal(state.corridorVisible, false);
  assert.equal(state.filmProgress, 1);
});

test('formal Hero is reversible, bounded, and preserves final film hold', () => {
  const forward = Array.from({ length: 101 }, (_, i) => getStudioHeroState(i / 100, stages));
  const reverse = Array.from({ length: 101 }, (_, i) => getStudioHeroState((100 - i) / 100, stages)).reverse();
  assert.deepEqual(reverse, forward);
  assert.equal(getStudioHeroState(-1, stages).introOpacity, 1);
  assert.equal(getStudioHeroState(NaN, stages).progress, 0);
  assert.equal(getStudioHeroState(5, stages).tearProgress, 1);
  assert.equal(getStudioHeroState(stages.coverStart, stages).filmProgress, 1);
  assert.equal(getStudioHeroState(stages.coverEnd, stages).tearProgress, 0);
});

test('formal resume restores seven sections and every project has source-grounded detail', () => {
  const markup = readFileSync(new URL('./studio.js', import.meta.url), 'utf8');
  const sections = [...markup.matchAll(/<section id="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(sections, ['hero', 'about', 'skills', 'experience', 'projects', 'values', 'contact']);
  assert.equal(new Set(featuredProjects.map(({ id }) => id)).size, featuredProjects.length);
  assert(featuredProjects.every(({ details }) => details.length >= 3));
});
