// Turns 21 MediaPipe hand landmarks into a pose description that does not
// depend on where the hand is in the frame, how big it is, or which hand it is.

export const FINGERS = ['thumb', 'index', 'middle', 'ring', 'pinky'];

// Landmark indices for each finger, from the base joint to the tip.
export const CHAINS = [
  [1, 2, 3, 4],
  [5, 6, 7, 8],
  [9, 10, 11, 12],
  [13, 14, 15, 16],
  [17, 18, 19, 20],
];
export const TIPS = CHAINS.map((chain) => chain[3]);

const WRIST = 0;
const MIDDLE_BASE = 9;

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const norm = (v) => Math.hypot(v[0], v[1], v[2]);

function angleBetween(u, v) {
  const lu = norm(u);
  const lv = norm(v);
  if (!lu || !lv) return 0;
  const cos = (u[0] * v[0] + u[1] * v[1] + u[2] * v[2]) / (lu * lv);
  return Math.acos(Math.min(1, Math.max(-1, cos)));
}

// Accepts MediaPipe's {x, y, z} objects or plain [x, y, z] arrays.
export function toPoints(landmarks) {
  if (!Array.isArray(landmarks) || landmarks.length !== 21) {
    throw new Error('Expected 21 hand landmarks');
  }
  return landmarks.map((p) => (Array.isArray(p) ? [p[0], p[1], p[2] ?? 0] : [p.x, p.y, p.z ?? 0]));
}

// Left hands are mirrored so one recording works for both hands.
// Coordinates are moved to the wrist and scaled by the palm length.
export function normalize(landmarks, handedness = 'Right') {
  const points = toPoints(landmarks).map((p) => (handedness === 'Left' ? [-p[0], p[1], p[2]] : p));
  const origin = points[WRIST];
  const scale = norm(sub(points[MIDDLE_BASE], origin)) || 1;
  return points.map((p) => sub(p, origin).map((value) => value / scale));
}

// Total bend of each finger in radians: 0 is straight, about 3 is a fist.
export function curls(points) {
  return CHAINS.map((chain) => {
    const joints = [WRIST, ...chain];
    let bend = 0;
    for (let i = 1; i < joints.length - 1; i += 1) {
      bend += angleBetween(sub(points[joints[i]], points[joints[i - 1]]), sub(points[joints[i + 1]], points[joints[i]]));
    }
    return bend;
  });
}

const CURL_WEIGHT = 0.5;

export function describe(landmarks, handedness = 'Right') {
  const points = normalize(landmarks, handedness);
  const fingerCurls = curls(points);
  const vector = [...points.slice(1).flat(), ...fingerCurls.map((value) => value * CURL_WEIGHT)];
  return { points, curls: fingerCurls, vector, handedness };
}

export function distance(a, b) {
  let total = 0;
  for (let i = 0; i < a.length; i += 1) total += (a[i] - b[i]) ** 2;
  return Math.sqrt(total);
}
