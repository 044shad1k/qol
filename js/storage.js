// Everything stays in this browser. Packs can be exported as JSON and shared.
const KEY = 'qol.v1';
const PACK_FORMAT = 'qol-pack';

function read() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) ?? {};
  } catch {
    return {};
  }
}

function write(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

const round = (value) => Math.round(value * 1e4) / 1e4;

export function compact(sample) {
  return {
    label: sample.label,
    vector: sample.vector.map(round),
    curls: sample.curls.map(round),
    points: sample.points.map((p) => p.map(round)),
  };
}

export function loadState() {
  const state = read();
  return {
    alphabet: state.alphabet ?? 'kk',
    language: state.language ?? 'en',
    packs: state.packs ?? {},
    progress: state.progress ?? {},
  };
}

export function saveState(state) {
  return write(state);
}

export function exportPack(alphabet, samples) {
  return JSON.stringify({ format: PACK_FORMAT, version: 1, alphabet, created: new Date().toISOString(), samples }, null, 0);
}

export function parsePack(text) {
  const data = JSON.parse(text);
  if (data?.format !== PACK_FORMAT || !Array.isArray(data.samples)) throw new Error('Not a Qol pack');
  const valid = data.samples.filter((s) => typeof s.label === 'string'
    && Array.isArray(s.vector) && s.vector.length === 65
    && Array.isArray(s.curls) && s.curls.length === 5
    && Array.isArray(s.points) && s.points.length === 21);
  if (!valid.length) throw new Error('The pack has no usable recordings');
  return { alphabet: data.alphabet, samples: valid };
}
