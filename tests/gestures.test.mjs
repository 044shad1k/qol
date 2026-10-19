import test from 'node:test';
import assert from 'node:assert/strict';
import { angleDelta, apparentSize, GestureReader, isFist, pinchRatio, roll } from '../js/gestures.js';
import { hand, SHAPES } from './hands.mjs';

// Moves the thumb tip onto the index tip.
function pinched(points) {
  const copy = points.map((p) => ({ ...p }));
  copy[4] = { ...copy[8], x: copy[8].x + 0.02 };
  return copy;
}

test('pinch is detected with hysteresis', () => {
  const reader = new GestureReader();
  const open = hand(SHAPES.OPEN, { dx: 0.5, dy: 0.8, scale: 0.2 });
  assert.equal(reader.read(open).pinching, false);
  assert.equal(reader.read(pinched(open)).pinching, true);
  assert.ok(pinchRatio(pinched(open)) < 0.35);
  assert.equal(reader.read(null), null);
});

test('cursor follows the index fingertip in mirrored screen space', () => {
  const reader = new GestureReader();
  const pose = hand(SHAPES.POINT, { dx: 0.3, dy: 0.7, scale: 0.2 });
  const frame = reader.read(pose);
  assert.ok(Math.abs(frame.x - (1 - pose[8].x)) < 1e-9);
  assert.ok(Math.abs(frame.y - pose[8].y) < 1e-9);
});

test('fist and open hand are told apart', () => {
  assert.equal(isFist(hand(SHAPES.FIST)), true);
  assert.equal(isFist(hand(SHAPES.OPEN)), false);
  assert.equal(isFist(hand(SHAPES.POINT)), false);
});

test('size grows when the hand is bigger in the frame', () => {
  assert.ok(apparentSize(hand(SHAPES.OPEN, { scale: 0.3 })) > apparentSize(hand(SHAPES.OPEN, { scale: 0.15 })));
});

test('roll changes when the hand turns', () => {
  const upright = hand(SHAPES.OPEN);
  const turned = upright.map(({ x, y, z }) => ({ x: x * Math.cos(0.5) - y * Math.sin(0.5), y: x * Math.sin(0.5) + y * Math.cos(0.5), z }));
  assert.ok(Math.abs(angleDelta(roll(upright), roll(turned)) - 0.5) < 1e-6);
  assert.ok(Math.abs(angleDelta(3.1, -3.1) - (2 * Math.PI - 6.2)) < 1e-9);
});
