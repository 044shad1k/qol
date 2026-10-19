// Turns raw hand landmarks into controls: a cursor, pinch, fist, and the
// hand's roll and apparent size (used for rotating and scaling objects).
import { curls, normalize, toPoints } from './features.js';

const PINCH_ON = 0.35;
const PINCH_OFF = 0.5;
const FIST_CURL = 1.9;

// Pinch distance relative to palm length, so it works near and far from the camera.
export function pinchRatio(landmarks) {
  const p = toPoints(landmarks);
  const palm = Math.hypot(p[9][0] - p[0][0], p[9][1] - p[0][1]) || 1;
  return Math.hypot(p[4][0] - p[8][0], p[4][1] - p[8][1]) / palm;
}

// Angle of the knuckle line (index base to little-finger base) in image space.
export function roll(landmarks) {
  const p = toPoints(landmarks);
  return Math.atan2(p[17][1] - p[5][1], p[17][0] - p[5][0]);
}

// Palm length in image space; grows as the hand comes closer to the camera.
export function apparentSize(landmarks) {
  const p = toPoints(landmarks);
  return Math.hypot(p[9][0] - p[0][0], p[9][1] - p[0][1]);
}

export function isFist(landmarks, handedness = 'Right') {
  const c = curls(normalize(landmarks, handedness));
  return c.slice(1).every((value) => value > FIST_CURL);
}

// Smallest signed difference between two angles.
export function angleDelta(from, to) {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

// Smooths a jittery point: little smoothing for fast moves, strong when still.
export class Smoother {
  constructor() { this.value = null; }
  reset() { this.value = null; }
  update(x, y) {
    if (!this.value) {
      this.value = [x, y];
      return this.value;
    }
    const speed = Math.hypot(x - this.value[0], y - this.value[1]);
    const alpha = Math.min(1, 0.25 + speed * 6);
    this.value = [this.value[0] + (x - this.value[0]) * alpha, this.value[1] + (y - this.value[1]) * alpha];
    return this.value;
  }
}

// Reads one frame and keeps pinch state between frames (with hysteresis so
// the pinch does not flicker at the threshold).
export class GestureReader {
  constructor() {
    this.pinching = false;
    this.smoother = new Smoother();
  }

  // Returns null when no hand is visible. x/y are 0..1 in the mirrored (screen) view.
  read(landmarks, handedness = 'Right') {
    if (!landmarks) {
      this.pinching = false;
      this.smoother.reset();
      return null;
    }
    const p = toPoints(landmarks);
    const ratio = pinchRatio(p);
    this.pinching = this.pinching ? ratio < PINCH_OFF : ratio < PINCH_ON;
    const tip = this.pinching ? [(p[4][0] + p[8][0]) / 2, (p[4][1] + p[8][1]) / 2] : [p[8][0], p[8][1]];
    const [x, y] = this.smoother.update(1 - tip[0], tip[1]);
    return {
      x,
      y,
      pinching: this.pinching,
      fist: isFist(p, handedness),
      roll: -roll(p), // negated because the view is mirrored
      size: apparentSize(p),
    };
  }
}
