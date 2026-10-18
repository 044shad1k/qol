import { FilesetResolver, HandLandmarker } from '../vendor/vision_bundle.mjs';
import { describe } from './features.js';
import { SignClassifier } from './classifier.js';
import { ALPHABETS, playableWords } from './alphabets.js';
import { compact, exportPack, loadState, parsePack, saveState } from './storage.js';
import { adviceText, setLanguage, t } from './i18n.js';

const HOLD_MS = 600;
const LIVE_HOLD_MS = 700;
const SPACE_AFTER_MS = 1200;
const RECORD_FRAMES = 15;
const RECORD_TIMEOUT_MS = 4000;
const MIN_EXAMPLES = 3;

const BONES = [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [0, 17], [17, 18], [18, 19], [19, 20]];

const $ = (id) => document.getElementById(id);
const state = loadState();
let classifier = new SignClassifier([]);
let mode = 'practice';
let tracker = null;
let lastPose = null;

// ---------- shared helpers ----------

const samples = () => state.packs[state.alphabet] ?? [];
const ready = () => classifier.labels().filter((label) => classifier.count(label) >= MIN_EXAMPLES);

function persist() {
  if (!saveState(state)) $('teachStatus').textContent = t('storageFull');
}

function rebuild() {
  classifier = new SignClassifier(samples());
}

function progressFor(letter) {
  const book = (state.progress[state.alphabet] ??= {});
  return (book[letter] ??= { solved: 0, skipped: 0 });
}

// Fires once a condition has held continuously for `ms`.
class Hold {
  constructor(ms) { this.ms = ms; this.since = null; }
  reset() { this.since = null; }
  update(ok, now) {
    if (!ok) { this.since = null; return 0; }
    this.since ??= now;
    return Math.min(1, (now - this.since) / this.ms);
  }
}

function setHold(fraction) {
  $('holdBar').style.width = `${Math.round(fraction * 100)}%`;
}

function setMeter(element, score, good) {
  element.style.width = `${score}%`;
  element.classList.toggle('good', good);
}

// Advice text changes at most a few times a second so it is readable.
const throttled = new Map();
function say(element, text, now) {
  const last = throttled.get(element) ?? 0;
  if (now - last < 350 && element.textContent) return;
  throttled.set(element, now);
  element.textContent = text;
}

function celebrate(element) {
  element.classList.remove('win');
  void element.offsetWidth;
  element.classList.add('win');
}

function drawHand(context, points, { width, height, color, lineWidth }) {
  context.strokeStyle = color;
  context.fillStyle = color;
  context.lineWidth = lineWidth;
  context.lineCap = 'round';
  for (const [a, b] of BONES) {
    context.beginPath();
    context.moveTo(points[a][0] * width, points[a][1] * height);
    context.lineTo(points[b][0] * width, points[b][1] * height);
    context.stroke();
  }
  for (const point of points) {
    context.beginPath();
    context.arc(point[0] * width, point[1] * height, lineWidth * 0.9, 0, Math.PI * 2);
    context.fill();
  }
}

// Draws a recorded example, fitted into the small reference canvas and
// flipped to match the mirrored camera view.
function drawReference(canvas, letter) {
  const context = canvas.getContext('2d');
  context.clearRect(0, 0, canvas.width, canvas.height);
  const example = samples().find((sample) => sample.label === letter);
  if (!example) return;
  const xs = example.points.map((p) => -p[0]);
  const ys = example.points.map((p) => p[1]);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const size = Math.max(maxX - minX, maxY - minY) || 1;
  const pad = 0.12;
  const fitted = example.points.map((_, i) => [
    pad + (1 - 2 * pad) * ((xs[i] - minX) / size + (1 - (maxX - minX) / size) / 2),
    pad + (1 - 2 * pad) * ((ys[i] - minY) / size + (1 - (maxY - minY) / size) / 2),
  ]);
  const color = getComputedStyle(document.documentElement).getPropertyValue('--brand').trim() || '#0f766e';
  drawHand(context, fitted, { width: canvas.width, height: canvas.height, color, lineWidth: 4 });
}

// ---------- practice ----------

const practice = {
  target: null,
  previous: null,
  hold: new Hold(HOLD_MS),
  streak: 0,
  solved: 0,
  skipped: 0,
  pause: 0,

  pick() {
    const letters = ready();
    if (!letters.length) { this.target = null; return; }
    // Letters with fewer successes come up more often.
    const pool = letters.filter((letter) => letter !== this.previous || letters.length === 1);
    const weights = pool.map((letter) => 1 / (1 + progressFor(letter).solved));
    let roll = Math.random() * weights.reduce((a, b) => a + b, 0);
    this.target = pool.find((_, i) => (roll -= weights[i]) <= 0) ?? pool[0];
    this.previous = this.target;
    this.hold.reset();
    $('practiceTarget').textContent = this.target;
    $('practiceTarget').classList.remove('win');
    $('practiceAdvice').textContent = '';
    drawReference($('practiceReference'), this.target);
  },

  show() {
    if (!this.target || !ready().includes(this.target)) this.pick();
    this.renderStats();
  },

  renderStats() {
    $('practiceStreak').textContent = this.streak;
    const total = this.solved + this.skipped;
    $('practiceAccuracy').textContent = total ? `${this.solved}/${total}` : '—';
  },

  skip() {
    if (!this.target) return;
    progressFor(this.target).skipped += 1;
    this.skipped += 1;
    this.streak = 0;
    persist();
    this.renderStats();
    this.pick();
  },

  frame(pose, now) {
    if (!this.target || now < this.pause) return;
    const advice = $('practiceAdvice');
    if (!pose) {
      setMeter($('practiceMeter'), 0, false);
      setHold(this.hold.update(false, now));
      say(advice, t('noHand'), now);
      return;
    }
    const prediction = classifier.predict(pose.vector);
    const correct = prediction?.label === this.target;
    setMeter($('practiceMeter'), classifier.similarity(pose.vector, this.target), correct);
    const held = this.hold.update(correct, now);
    setHold(held);
    if (held >= 1) {
      progressFor(this.target).solved += 1;
      this.solved += 1;
      this.streak += 1;
      persist();
      this.renderStats();
      advice.textContent = t('perfect');
      celebrate($('practiceTarget'));
      this.pause = now + 700;
      setTimeout(() => this.pick(), 700);
      return;
    }
    say(advice, correct ? t('hold') : adviceText(classifier.advise(pose, this.target)), now);
  },
};

// ---------- spell ----------

const spell = {
  word: null,
  index: 0,
  started: 0,
  hold: new Hold(HOLD_MS),
  pause: 0,

  show() {
    const words = playableWords(state.alphabet, ready());
    const list = $('spellWords');
    list.replaceChildren(...words.map((word) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = word;
      button.addEventListener('click', () => this.start(word));
      return button;
    }));
    if (!words.length) {
      const note = document.createElement('p');
      note.className = 'muted';
      note.textContent = t('noWords');
      list.append(note);
    }
    if (!this.word) this.start(words[Math.floor(Math.random() * words.length)] ?? null);
  },

  start(word) {
    this.word = word;
    this.index = 0;
    this.started = performance.now();
    this.hold.reset();
    $('spellAdvice').textContent = word ? '' : t('noWords');
    this.render();
  },

  next() {
    const words = playableWords(state.alphabet, ready()).filter((word) => word !== this.word);
    this.start(words[Math.floor(Math.random() * words.length)] ?? this.word);
  },

  custom(text) {
    const word = text.trim().toLocaleUpperCase();
    if (!word) return;
    const have = new Set(ready());
    if (![...word].every((letter) => have.has(letter))) {
      $('spellAdvice').textContent = t('badWord');
      return;
    }
    this.start(word);
  },

  render() {
    const letters = this.word ? [...this.word] : [];
    $('spellWord').replaceChildren(...letters.map((letter, i) => {
      const span = document.createElement('span');
      span.textContent = letter;
      if (i < this.index) span.className = 'done';
      if (i === this.index) span.className = 'now';
      return span;
    }));
  },

  frame(pose, now) {
    if (!this.word || this.index >= this.word.length || now < this.pause) return;
    const target = this.word[this.index];
    const advice = $('spellAdvice');
    if (!pose) {
      setMeter($('spellMeter'), 0, false);
      setHold(this.hold.update(false, now));
      say(advice, t('noHand'), now);
      return;
    }
    const correct = classifier.predict(pose.vector)?.label === target;
    setMeter($('spellMeter'), classifier.similarity(pose.vector, target), correct);
    const held = this.hold.update(correct, now);
    setHold(held);
    if (held < 1) {
      say(advice, correct ? t('hold') : adviceText(classifier.advise(pose, target)), now);
      return;
    }
    progressFor(target).solved += 1;
    persist();
    this.index += 1;
    this.hold.reset();
    this.pause = now + 350;
    this.render();
    if (this.index === this.word.length) {
      advice.textContent = t('wordDone', { seconds: ((now - this.started) / 1000).toFixed(1) });
      setTimeout(() => this.next(), 1800);
    } else {
      advice.textContent = t('perfect');
    }
  },
};

// ---------- live translation ----------

const live = {
  text: '',
  hold: new Hold(LIVE_HOLD_MS),
  candidate: null,
  typed: null,
  lastHand: 0,

  show() { this.render(); },

  render() { $('liveText').textContent = this.text; },

  frame(pose, now) {
    if (!pose) {
      setHold(0);
      this.candidate = null;
      this.typed = null;
      this.hold.reset();
      $('liveLetter').textContent = t('unknown');
      if (this.lastHand && now - this.lastHand > SPACE_AFTER_MS && this.text && !this.text.endsWith(' ')) {
        this.text += ' ';
        this.render();
      }
      return;
    }
    this.lastHand = now;
    const label = classifier.predict(pose.vector)?.label ?? null;
    $('liveLetter').textContent = label ?? t('unknown');
    if (label !== this.candidate) {
      this.candidate = label;
      this.hold.reset();
      // Changing the letter allows the same letter to be typed again later.
      if (label !== this.typed) this.typed = null;
    }
    const held = this.hold.update(label !== null && label !== this.typed, now);
    setHold(held);
    if (held >= 1) {
      this.text += label;
      this.typed = label;
      this.hold.reset();
      celebrate($('liveLetter'));
      this.render();
    }
  },

  speak() {
    if (!this.text.trim() || !('speechSynthesis' in window)) return;
    const utterance = new SpeechSynthesisUtterance(this.text.toLocaleLowerCase());
    const wanted = ALPHABETS[state.alphabet].speech;
    const voices = speechSynthesis.getVoices();
    const voice = voices.find((v) => v.lang === wanted)
      ?? voices.find((v) => v.lang.startsWith(wanted.slice(0, 2)))
      ?? (state.alphabet === 'kk' ? voices.find((v) => v.lang.startsWith('ru')) : null);
    if (voice) utterance.voice = voice;
    utterance.lang = voice?.lang ?? wanted;
    speechSynthesis.cancel();
    speechSynthesis.speak(utterance);
  },
};

// ---------- teach / record ----------

const teach = {
  selected: null,
  busy: false,

  frame() {},

  show() {
    const letters = ALPHABETS[state.alphabet].letters;
    this.selected ??= letters[0];
    $('teachLetters').replaceChildren(...letters.map((letter) => {
      const button = document.createElement('button');
      button.type = 'button';
      const count = classifier.count(letter);
      button.className = count >= MIN_EXAMPLES ? 'has' : '';
      button.setAttribute('aria-pressed', String(letter === this.selected));
      button.innerHTML = '<b></b><small></small>';
      button.querySelector('b').textContent = letter;
      button.querySelector('small').textContent = count || '';
      button.addEventListener('click', () => { this.selected = letter; this.show(); });
      return button;
    }));
    $('teachSummary').textContent = t('recorded', { n: ready().length, total: letters.length });
    $('teachRemove').disabled = !classifier.count(this.selected);
    $('teachRecord').disabled = this.busy || !tracker;
  },

  async record() {
    if (this.busy || !tracker) return;
    this.busy = true;
    this.show();
    const status = $('teachStatus');
    for (let n = 3; n > 0; n -= 1) {
      status.textContent = t('countdown', { n });
      await new Promise((resolve) => setTimeout(resolve, 700));
    }
    status.textContent = t('recording');
    const captured = [];
    const started = performance.now();
    await new Promise((resolve) => {
      const grab = () => {
        if (lastPose) captured.push(compact({ label: this.selected, ...lastPose }));
        setHold(captured.length / RECORD_FRAMES);
        if (captured.length >= RECORD_FRAMES || performance.now() - started > RECORD_TIMEOUT_MS) resolve();
        else setTimeout(grab, 90);
      };
      grab();
    });
    setHold(0);
    if (captured.length) {
      state.packs[state.alphabet] = [...samples(), ...captured];
      persist();
      rebuild();
    }
    status.textContent = captured.length
      ? `${this.selected} · ${t('saved')} · ${t('samples', { n: classifier.count(this.selected) })}`
      : t('noHand');
    this.busy = false;
    // Move on to the next letter that still needs examples.
    const letters = ALPHABETS[state.alphabet].letters;
    const next = letters.slice(letters.indexOf(this.selected) + 1).find((letter) => classifier.count(letter) < MIN_EXAMPLES);
    if (captured.length && classifier.count(this.selected) >= MIN_EXAMPLES * 3 && next) this.selected = next;
    this.show();
  },

  remove() {
    state.packs[state.alphabet] = samples().filter((sample) => sample.label !== this.selected);
    persist();
    rebuild();
    this.show();
  },

  clearAll() {
    if (!confirm(t('confirmClear'))) return;
    state.packs[state.alphabet] = [];
    state.progress[state.alphabet] = {};
    persist();
    rebuild();
    this.show();
  },

  export() {
    const blob = new Blob([exportPack(state.alphabet, samples())], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `qol-${state.alphabet}-pack.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  },

  async import(file) {
    try {
      const pack = parsePack(await file.text());
      const alphabet = ALPHABETS[pack.alphabet] ? pack.alphabet : state.alphabet;
      state.packs[alphabet] = [...(state.packs[alphabet] ?? []), ...pack.samples];
      state.alphabet = alphabet;
      $('alphabet').value = alphabet;
      persist();
      rebuild();
      $('teachStatus').textContent = t('imported', { n: pack.samples.length });
    } catch (error) {
      $('teachStatus').textContent = t('importFailed', { reason: error.message });
    }
    this.show();
  },
};

const MODES = { practice, spell, live, teach };

// ---------- layout ----------

function translatePage() {
  document.documentElement.lang = state.language;
  for (const element of document.querySelectorAll('[data-i18n]')) element.textContent = t(element.dataset.i18n);
}

function switchMode(next) {
  mode = next;
  setHold(0);
  for (const tab of document.querySelectorAll('[data-mode]')) tab.setAttribute('aria-selected', String(tab.dataset.mode === mode));
  const locked = mode !== 'teach' && ready().length < 2;
  $('empty').hidden = !locked;
  for (const view of document.querySelectorAll('[data-view]')) view.hidden = locked || view.dataset.view !== mode;
  if (!locked) MODES[mode].show();
}

function fillAlphabets() {
  $('alphabet').replaceChildren(...Object.entries(ALPHABETS).map(([id, alphabet]) => new Option(alphabet.name, id)));
  $('alphabet').value = state.alphabet;
}

// ---------- camera and tracking ----------

async function startCamera() {
  const status = $('status');
  $('start').disabled = true;
  status.textContent = t('loading');
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, facingMode: 'user' }, audio: false });
  } catch {
    status.textContent = t('cameraError');
    $('start').disabled = false;
    return;
  }
  const video = $('video');
  video.srcObject = stream;
  await video.play();
  try {
    const files = await FilesetResolver.forVisionTasks(new URL('../vendor/wasm', import.meta.url).href);
    const options = (delegate) => ({
      baseOptions: { modelAssetPath: new URL('../vendor/hand_landmarker.task', import.meta.url).href, delegate },
      runningMode: 'VIDEO',
      numHands: 1,
      minHandDetectionConfidence: 0.6,
      minHandPresenceConfidence: 0.6,
      minTrackingConfidence: 0.5,
    });
    try {
      tracker = await HandLandmarker.createFromOptions(files, options('GPU'));
    } catch {
      tracker = await HandLandmarker.createFromOptions(files, options('CPU'));
    }
  } catch {
    status.textContent = t('modelError');
    return;
  }
  $('gate').hidden = true;
  status.textContent = '';
  if (mode === 'teach') teach.show();
  requestAnimationFrame(loop);
}

let lastVideoTime = -1;
function loop(now) {
  const video = $('video');
  const canvas = $('overlay');
  if (video.readyState >= 2 && video.currentTime !== lastVideoTime) {
    lastVideoTime = video.currentTime;
    if (canvas.width !== video.videoWidth) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
    }
    const result = tracker.detectForVideo(video, now);
    const context = canvas.getContext('2d');
    context.clearRect(0, 0, canvas.width, canvas.height);
    const landmarks = result.landmarks?.[0];
    if (landmarks) {
      const handedness = result.handedness?.[0]?.[0]?.categoryName ?? 'Right';
      lastPose = describe(landmarks, handedness);
      drawHand(context, landmarks.map((p) => [p.x, p.y]), { width: canvas.width, height: canvas.height, color: '#5eead4', lineWidth: 5 });
    } else {
      lastPose = null;
    }
    $('status').textContent = landmarks ? '' : t('noHand');
    const view = MODES[mode];
    if ($('empty').hidden) view.frame(lastPose, now);
  }
  requestAnimationFrame(loop);
}

// ---------- wiring ----------

for (const tab of document.querySelectorAll('[data-mode]')) tab.addEventListener('click', () => switchMode(tab.dataset.mode));
$('goRecord').addEventListener('click', () => switchMode('teach'));
$('start').addEventListener('click', startCamera);
$('practiceSkip').addEventListener('click', () => practice.skip());
$('spellNext').addEventListener('click', () => spell.next());
$('spellForm').addEventListener('submit', (event) => { event.preventDefault(); spell.custom($('spellInput').value); });
$('liveSpeak').addEventListener('click', () => live.speak());
$('liveBack').addEventListener('click', () => { live.text = live.text.slice(0, -1); live.render(); });
$('liveClear').addEventListener('click', () => { live.text = ''; live.render(); });
$('teachRecord').addEventListener('click', () => teach.record());
$('teachRemove').addEventListener('click', () => teach.remove());
$('teachClear').addEventListener('click', () => teach.clearAll());
$('teachExport').addEventListener('click', () => teach.export());
$('teachImport').addEventListener('change', (event) => { if (event.target.files[0]) teach.import(event.target.files[0]); event.target.value = ''; });

document.addEventListener('keydown', (event) => {
  if (event.code === 'Space' && mode === 'teach' && event.target.tagName !== 'INPUT') {
    event.preventDefault();
    teach.record();
  }
});

$('alphabet').addEventListener('change', (event) => {
  state.alphabet = event.target.value;
  persist();
  rebuild();
  practice.target = null;
  spell.word = null;
  teach.selected = null;
  live.text = '';
  switchMode(mode);
});

$('language').addEventListener('change', (event) => {
  state.language = event.target.value;
  setLanguage(state.language);
  persist();
  translatePage();
  switchMode(mode);
});

setLanguage(state.language);
$('language').value = state.language;
fillAlphabets();
translatePage();
rebuild();
switchMode(ready().length >= 2 ? 'practice' : 'teach');
