// Synthetic hands for tests: a flat palm with fingers bent by given amounts.
const BASES = [
  [0.45, -0.35], // thumb base
  [0.3, -1.0], // index
  [0.0, -1.0], // middle
  [-0.28, -0.95], // ring
  [-0.52, -0.85], // pinky
];
const SEGMENTS = [[0.45, 0.35, 0.3], [0.45, 0.28, 0.22], [0.5, 0.3, 0.24], [0.45, 0.28, 0.22], [0.36, 0.22, 0.2]];
const START = [-0.9, -1.57, -1.57, -1.57, -1.6]; // thumb points sideways, fingers point up

// bends: five numbers in radians, spread evenly over the finger's joints.
export function hand(bends, { dx = 0, dy = 0, scale = 1, noise = 0, seed = 1, left = false } = {}) {
  let state = seed;
  const random = () => {
    state = (state * 16807) % 2147483647;
    return (state / 2147483647 - 0.5) * 2 * noise;
  };
  const points = Array.from({ length: 21 }, () => [0, 0, 0]);
  BASES.forEach((base, f) => {
    let [x, y] = base;
    let angle = START[f];
    points[1 + f * 4] = [x, y, 0];
    for (let j = 0; j < 3; j += 1) {
      angle += (f === 0 ? -1 : 1) * bends[f] / 3;
      x += Math.cos(angle) * SEGMENTS[f][j];
      y += Math.sin(angle) * SEGMENTS[f][j];
      points[2 + f * 4 + j] = [x, y, 0];
    }
  });
  return points.map(([x, y, z]) => ({
    x: (left ? -x : x) * scale + dx + random(),
    y: y * scale + dy + random(),
    z: z * scale + random(),
  }));
}

export const SHAPES = {
  FIST: [1.6, 2.8, 2.8, 2.8, 2.8],
  OPEN: [0, 0, 0, 0, 0],
  POINT: [1.6, 0, 2.8, 2.8, 2.8],
  PEACE: [1.6, 0, 0, 2.8, 2.8],
  L: [0, 0, 2.8, 2.8, 2.8],
};
