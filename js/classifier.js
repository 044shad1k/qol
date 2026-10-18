// Few-shot sign recognition: nearest neighbours over recorded examples,
// plus finger-level advice on how to get closer to a target sign.
import { FINGERS, TIPS, distance } from './features.js';

const K = 5;
const CURL_TOLERANCE = 0.45;
const TIP_TOLERANCE = 0.35;

export class SignClassifier {
  constructor(samples = []) {
    this.samples = samples;
    this.rejectDistance = this.calibrate();
  }

  labels() {
    return [...new Set(this.samples.map((sample) => sample.label))];
  }

  count(label) {
    return this.samples.filter((sample) => sample.label === label).length;
  }

  // How far a pose may be from every example before we call it "unknown".
  // Based on how far apart examples of the same sign are from each other.
  calibrate() {
    const spreads = [];
    for (const sample of this.samples) {
      let best = Infinity;
      for (const other of this.samples) {
        if (other !== sample && other.label === sample.label) best = Math.min(best, distance(sample.vector, other.vector));
      }
      if (Number.isFinite(best)) spreads.push(best);
    }
    if (!spreads.length) return 1.2;
    spreads.sort((a, b) => a - b);
    const median = spreads[Math.floor(spreads.length / 2)];
    return Math.max(0.6, median * 6);
  }

  nearest(vector, label = null) {
    return this.samples
      .filter((sample) => label === null || sample.label === label)
      .map((sample) => ({ sample, d: distance(vector, sample.vector) }))
      .sort((a, b) => a.d - b.d);
  }

  predict(vector) {
    const ranked = this.nearest(vector);
    if (!ranked.length) return null;
    const votes = new Map();
    for (const { sample, d } of ranked.slice(0, K)) {
      votes.set(sample.label, (votes.get(sample.label) ?? 0) + 1 / (d + 1e-3));
    }
    const total = [...votes.values()].reduce((a, b) => a + b, 0);
    const [label, weight] = [...votes.entries()].sort((a, b) => b[1] - a[1])[0];
    const closest = this.nearest(vector, label)[0].d;
    return {
      label: closest <= this.rejectDistance ? label : null,
      guess: label,
      confidence: weight / total,
      distance: closest,
    };
  }

  // 0..100: how close the pose is to the closest example of the target sign.
  similarity(vector, target) {
    const best = this.nearest(vector, target)[0];
    if (!best) return 0;
    return Math.round(100 * Math.exp(-best.d / this.rejectDistance));
  }

  // The single most useful correction, or null when the pose already matches.
  // `mirrored` is true when the video is shown like a mirror (selfie view).
  advise(pose, target, { mirrored = true } = {}) {
    const best = this.nearest(pose.vector, target)[0];
    if (!best) return { kind: 'no-examples' };
    const reference = best.sample;

    let worstFinger = -1;
    let worstGap = CURL_TOLERANCE;
    pose.curls.forEach((value, i) => {
      const gap = Math.abs(value - reference.curls[i]);
      if (gap > worstGap) {
        worstGap = gap;
        worstFinger = i;
      }
    });
    if (worstFinger >= 0) {
      const tooBent = pose.curls[worstFinger] > reference.curls[worstFinger];
      return { kind: tooBent ? 'straighten' : 'bend', finger: FINGERS[worstFinger] };
    }

    let worstTip = -1;
    let worstShift = TIP_TOLERANCE;
    let shift = [0, 0];
    TIPS.forEach((tip, i) => {
      const dx = reference.points[tip][0] - pose.points[tip][0];
      const dy = reference.points[tip][1] - pose.points[tip][1];
      const size = Math.hypot(dx, dy);
      if (size > worstShift) {
        worstShift = size;
        worstTip = i;
        shift = [dx, dy];
      }
    });
    if (worstTip >= 0) {
      // Undo the left-hand flip and the selfie flip so "left" means the
      // user's screen left. Image y grows downwards.
      const screenDx = shift[0] * (pose.handedness === 'Left' ? -1 : 1) * (mirrored ? -1 : 1);
      const horizontal = Math.abs(screenDx) >= Math.abs(shift[1]);
      const direction = horizontal ? (screenDx > 0 ? 'right' : 'left') : (shift[1] > 0 ? 'down' : 'up');
      return { kind: 'move', finger: FINGERS[worstTip], direction };
    }

    const prediction = this.predict(pose.vector);
    if (prediction && prediction.label && prediction.label !== target) {
      return { kind: 'rotate', confusedWith: prediction.label };
    }
    return null;
  }
}
