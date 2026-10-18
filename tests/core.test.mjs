import test from 'node:test';
import assert from 'node:assert/strict';
import { describe, distance, FINGERS } from '../js/features.js';
import { SignClassifier } from '../js/classifier.js';
import { compact, exportPack, parsePack } from '../js/storage.js';
import { playableWords } from '../js/alphabets.js';
import { hand, SHAPES } from './hands.mjs';

function trained(samplesPerShape = 8) {
  const samples = [];
  let seed = 1;
  for (const [label, bends] of Object.entries(SHAPES)) {
    for (let i = 0; i < samplesPerShape; i += 1) {
      seed += 1;
      samples.push({ label, ...describe(hand(bends, { noise: 0.02, seed, dx: 0.1 * i, scale: 0.8 + 0.05 * i })) });
    }
  }
  return new SignClassifier(samples);
}

test('pose does not depend on position, size or hand', () => {
  const base = describe(hand(SHAPES.PEACE)).vector;
  const moved = describe(hand(SHAPES.PEACE, { dx: 3, dy: -2, scale: 0.4 })).vector;
  const left = describe(hand(SHAPES.PEACE, { left: true }), 'Left').vector;
  assert.ok(distance(base, moved) < 1e-9);
  assert.ok(distance(base, left) < 1e-9);
});

test('curl is near zero for a straight finger and large for a bent one', () => {
  const { curls } = describe(hand(SHAPES.POINT));
  assert.ok(curls[1] < 0.6, `index should be straight, got ${curls[1]}`);
  assert.ok(curls[2] > 2.0, `middle should be bent, got ${curls[2]}`);
});

test('recognises every recorded shape from new noisy examples', () => {
  const model = trained();
  let seed = 999;
  for (const [label, bends] of Object.entries(SHAPES)) {
    for (let i = 0; i < 5; i += 1) {
      seed += 7;
      const pose = describe(hand(bends, { noise: 0.03, seed, dx: -0.5, scale: 1.3 }));
      assert.equal(model.predict(pose.vector).label, label);
    }
  }
});

test('rejects a pose unlike any recording', () => {
  const model = trained();
  const odd = describe(hand([0, 2.8, 0, 2.8, 0], { noise: 0.01, seed: 5 }));
  const result = model.predict(odd.vector);
  assert.equal(result.label, null);
});

test('advice names the finger that is wrong', () => {
  const model = trained();
  const indexBent = describe(hand([1.6, 2.6, 0, 2.8, 2.8]));
  assert.deepEqual(model.advise(indexBent, 'PEACE'), { kind: 'straighten', finger: 'index' });
  const ringOpen = describe(hand([1.6, 0, 0, 0, 2.8]));
  assert.deepEqual(model.advise(ringOpen, 'PEACE'), { kind: 'bend', finger: 'ring' });
  assert.equal(model.advise(describe(hand(SHAPES.PEACE)), 'PEACE'), null);
});

test('similarity is high for the target and low for another shape', () => {
  const model = trained();
  const pose = describe(hand(SHAPES.L));
  assert.ok(model.similarity(pose.vector, 'L') > 80);
  assert.ok(model.similarity(pose.vector, 'FIST') < model.similarity(pose.vector, 'L'));
});

test('packs round-trip and reject foreign files', () => {
  const sample = compact({ label: 'A', ...describe(hand(SHAPES.FIST)) });
  const pack = parsePack(exportPack('asl', [sample]));
  assert.equal(pack.alphabet, 'asl');
  assert.equal(pack.samples[0].label, 'A');
  assert.throws(() => parsePack('{"hello":1}'));
  assert.equal(FINGERS.length, 5);
});

test('only words made of recorded letters are offered', () => {
  assert.deepEqual(playableWords('asl', ['C', 'A', 'T']), ['CAT']);
  assert.deepEqual(playableWords('asl', []), []);
});
