// Qol Studio: draw, build and play with a bare hand in front of the webcam.
// The mouse works too, which helps when there is no camera.
import { angleDelta, GestureReader } from './gestures.js';
import { createTracker, startCamera } from './tracker.js';
import { loadState } from './storage.js';
import { setLanguage, t } from './i18n.js';

const DWELL_MS = 700;
const DELETE_MS = 600;
const GAME_SECONDS = 45;
const COLORS = ['#2dd4bf', '#f472b6', '#facc15', '#60a5fa', '#a78bfa', '#fb923c', '#f8fafc'];
const BONES = [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [0, 17], [17, 18], [18, 19], [19, 20]];

const $ = (id) => document.getElementById(id);
const scene = $('scene');
const hud = $('hud');
const video = $('video');
const sceneContext = scene.getContext('2d');
const hudContext = hud.getContext('2d');

const ui = { tool: 'draw', color: COLORS[0], cameraVisible: true };
let objects = [];
const history = [];
let particles = [];
let tracker = null;
let lastVideoTime = -1;
let landmarks = null;
const reader = new GestureReader();
const mouse = { x: 0.5, y: 0.5, down: false, active: false, wheel: 0 };

// ---------- geometry ----------

let width = 0;
let height = 0;
const unit = () => Math.min(width, height);
const px = (x, y) => [x * width, y * height];

function resize() {
  const ratio = window.devicePixelRatio || 1;
  width = window.innerWidth;
  height = window.innerHeight;
  for (const canvas of [scene, hud]) {
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    canvas.getContext('2d').setTransform(ratio, 0, 0, ratio, 0, 0);
  }
}

function hitTest(x, y) {
  const [cx, cy] = px(x, y);
  for (let i = objects.length - 1; i >= 0; i -= 1) {
    const object = objects[i];
    if (object.kind === 'stroke') {
      if (object.points.some(([sx, sy]) => Math.hypot(sx * width - cx, sy * height - cy) < Math.max(18, object.width))) return object;
    } else {
      const [ox, oy] = px(object.x, object.y);
      if (Math.hypot(ox - cx, oy - cy) < object.size * unit() * 1.1) return object;
    }
  }
  return null;
}

// ---------- history ----------

function remember() {
  history.push(JSON.stringify(objects));
  if (history.length > 60) history.shift();
}

function undo() {
  if (history.length) objects = JSON.parse(history.pop());
}

// ---------- drawing ----------

function shapePath(context, object, scale = unit()) {
  const r = object.size * scale;
  context.beginPath();
  if (object.kind === 'circle') {
    context.arc(0, 0, r, 0, Math.PI * 2);
  } else if (object.kind === 'square') {
    context.roundRect(-r * 0.85, -r * 0.85, r * 1.7, r * 1.7, r * 0.18);
  } else if (object.kind === 'triangle') {
    for (let i = 0; i < 3; i += 1) {
      const a = -Math.PI / 2 + (i * Math.PI * 2) / 3;
      context.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    context.closePath();
  } else if (object.kind === 'star') {
    for (let i = 0; i < 10; i += 1) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const radius = i % 2 ? r * 0.45 : r;
      context.lineTo(Math.cos(a) * radius, Math.sin(a) * radius);
    }
    context.closePath();
  }
}

function drawObject(context, object, w, h, scale, highlight = false) {
  context.save();
  if (object.kind === 'stroke') {
    context.strokeStyle = object.color;
    context.lineWidth = object.width;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.shadowColor = object.color;
    context.shadowBlur = highlight ? 18 : 8;
    const points = object.points.map(([x, y]) => [x * w, y * h]);
    context.beginPath();
    context.moveTo(...points[0]);
    for (let i = 1; i < points.length - 1; i += 1) {
      const mid = [(points[i][0] + points[i + 1][0]) / 2, (points[i][1] + points[i + 1][1]) / 2];
      context.quadraticCurveTo(points[i][0], points[i][1], mid[0], mid[1]);
    }
    context.lineTo(...points[points.length - 1]);
    context.stroke();
  } else {
    context.translate(object.x * w, object.y * h);
    context.rotate(object.rot);
    shapePath(context, object, scale);
    context.fillStyle = object.color;
    context.shadowColor = 'rgb(0 0 0 / 0.45)';
    context.shadowBlur = highlight ? 30 : 14;
    context.shadowOffsetY = highlight ? 12 : 6;
    context.fill();
    context.shadowColor = 'transparent';
    context.lineWidth = highlight ? 4 : 2;
    context.strokeStyle = highlight ? '#ffffff' : 'rgb(255 255 255 / 0.35)';
    context.stroke();
  }
  context.restore();
}

function burst(x, y, color, count = 18) {
  for (let i = 0; i < count; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 2 + Math.random() * 5;
    particles.push({ x: x * width, y: y * height, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 1, color });
  }
}

// ---------- toolbar ----------

const TOOLS = [
  ['draw', '✏️', 'toolDraw'], ['circle', '●', 'toolCircle'], ['square', '■', 'toolSquare'],
  ['triangle', '▲', 'toolTriangle'], ['star', '★', 'toolStar'], ['game', '🎈', 'toolGame'],
];
const ACTIONS = [
  ['undo', '↶', 'undo', () => undo()],
  ['clear', '🗑', 'clearScene', () => { if (objects.length) { remember(); objects.forEach((o) => burst(o.x ?? o.points[0][0], o.y ?? o.points[0][1], o.color, 6)); objects = []; } }],
  ['save', '⤓', 'save', () => savePicture()],
  ['camera', '👁', 'cameraToggle', () => { ui.cameraVisible = !ui.cameraVisible; video.classList.toggle('hidden', !ui.cameraVisible); }],
];

function button(label, title, onPress, extraClass = '') {
  const element = document.createElement('button');
  element.type = 'button';
  element.className = `tool ${extraClass}`;
  element.textContent = label;
  element.title = title;
  element.setAttribute('aria-label', title);
  element.addEventListener('click', onPress);
  return element;
}

function buildToolbar() {
  $('tools').replaceChildren(...TOOLS.map(([id, icon, key]) => {
    const element = button(icon, t(key), () => selectTool(id));
    element.dataset.tool = id;
    return element;
  }));
  $('colors').replaceChildren(...COLORS.map((color) => {
    const element = button('', color, () => { ui.color = color; syncToolbar(); }, 'swatch');
    element.style.background = color;
    element.dataset.color = color;
    return element;
  }));
  $('actions').replaceChildren(...ACTIONS.map(([, icon, key, action]) => button(icon, t(key), action)));
  syncToolbar();
}

function syncToolbar() {
  for (const element of document.querySelectorAll('[data-tool]')) element.setAttribute('aria-pressed', String(element.dataset.tool === ui.tool));
  for (const element of document.querySelectorAll('[data-color]')) element.setAttribute('aria-pressed', String(element.dataset.color === ui.color));
}

function selectTool(id) {
  if (id === 'game') game.start();
  else game.stop();
  ui.tool = id;
  syncToolbar();
}

// ---------- bubble game ----------

const game = {
  active: false,
  bubbles: [],
  score: 0,
  ends: 0,
  over: false,
  nextSpawn: 0,

  best() {
    try { return Number(localStorage.getItem('qol.studio.best')) || 0; } catch { return 0; }
  },

  start() {
    this.active = true;
    this.over = false;
    this.bubbles = [];
    this.score = 0;
    this.ends = performance.now() + GAME_SECONDS * 1000;
    this.nextSpawn = 0;
    $('score').hidden = false;
  },

  stop() {
    this.active = false;
    this.bubbles = [];
    $('score').hidden = true;
  },

  finish() {
    this.over = true;
    this.bubbles.forEach((b) => burst(b.x, b.y, b.color, 4));
    this.bubbles = [];
    try { if (this.score > this.best()) localStorage.setItem('qol.studio.best', String(this.score)); } catch { /* private mode */ }
  },

  update(input, now, dt) {
    if (this.over) {
      $('score').innerHTML = `${t('gameOver', { score: this.score })}<small>${t('gameBest', { best: Math.max(this.best(), this.score) })}</small>`;
      return;
    }
    const left = Math.max(0, Math.ceil((this.ends - now) / 1000));
    $('score').innerHTML = `${this.score}<small>${t('gameTime', { seconds: left })}</small>`;
    if (left === 0) { this.finish(); return; }
    const elapsed = GAME_SECONDS - (this.ends - now) / 1000;
    if (now > this.nextSpawn) {
      const size = 0.035 + Math.random() * 0.045;
      this.bubbles.push({
        x: 0.08 + Math.random() * 0.84,
        y: 1.1,
        r: size,
        speed: (0.08 + Math.random() * 0.08 + elapsed * 0.003),
        wobble: Math.random() * Math.PI * 2,
        color: COLORS[Math.floor(Math.random() * (COLORS.length - 1))],
      });
      this.nextSpawn = now + Math.max(220, 800 - elapsed * 14);
    }
    for (const bubble of this.bubbles) {
      bubble.y -= bubble.speed * dt;
      bubble.wobble += dt * 2;
    }
    if (input) {
      const [cx, cy] = px(input.x, input.y);
      this.bubbles = this.bubbles.filter((bubble) => {
        const bx = (bubble.x + Math.sin(bubble.wobble) * 0.01) * width;
        const hit = Math.hypot(bx - cx, bubble.y * height - cy) < bubble.r * unit() + 14;
        if (hit) {
          this.score += bubble.r < 0.05 ? 3 : 1;
          burst(bubble.x, bubble.y, bubble.color, 14);
        }
        return !hit;
      });
    }
    this.bubbles = this.bubbles.filter((bubble) => bubble.y > -0.15);
  },

  draw(context) {
    for (const bubble of this.bubbles) {
      const x = (bubble.x + Math.sin(bubble.wobble) * 0.01) * width;
      const y = bubble.y * height;
      const r = bubble.r * unit();
      const gradient = context.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
      gradient.addColorStop(0, 'rgb(255 255 255 / 0.9)');
      gradient.addColorStop(0.35, `${bubble.color}aa`);
      gradient.addColorStop(1, `${bubble.color}33`);
      context.beginPath();
      context.arc(x, y, r, 0, Math.PI * 2);
      context.fillStyle = gradient;
      context.fill();
      context.lineWidth = 2;
      context.strokeStyle = `${bubble.color}`;
      context.stroke();
    }
  },
};

// ---------- interaction ----------

const interaction = {
  wasPinching: false,
  grabbed: null,
  grab: null,
  stroke: null,
  hover: null,
  hoverSince: 0,
  hoverArmed: true,
  deleting: null,
  deleteSince: 0,
};

function elementAt(input) {
  if (!input) return null;
  const [x, y] = px(input.x, input.y);
  return document.elementFromPoint(x, y)?.closest('.tool') ?? null;
}

function release() {
  interaction.grabbed = null;
  interaction.grab = null;
  if (interaction.stroke && interaction.stroke.points.length < 2) objects = objects.filter((o) => o !== interaction.stroke);
  interaction.stroke = null;
}

function step(input, now, dt) {
  const pinching = Boolean(input?.pinching && !input.fist);
  const pinchStart = pinching && !interaction.wasPinching;
  interaction.wasPinching = pinching;

  // Toolbar: hold the cursor over a button, or pinch on it.
  const hovered = interaction.grabbed || interaction.stroke ? null : elementAt(input);
  document.querySelectorAll('.tool.hover').forEach((element) => { if (element !== hovered) element.classList.remove('hover'); });
  if (hovered !== interaction.hover) {
    interaction.hover = hovered;
    interaction.hoverSince = now;
    interaction.hoverArmed = true;
  }
  if (hovered) {
    hovered.classList.add('hover');
    if (input.source === 'hand' && interaction.hoverArmed && (pinchStart || now - interaction.hoverSince > DWELL_MS)) {
      interaction.hoverArmed = false;
      hovered.click();
    }
    return;
  }

  if (!input) {
    release();
    setHint(tracker ? t('hintNoHand') : '');
    if (game.active) game.update(null, now, dt);
    return;
  }

  if (game.active) {
    game.update(input, now, dt);
    setHint('');
    return;
  }

  if (pinchStart) {
    const target = hitTest(input.x, input.y);
    if (target && target.kind !== 'stroke') {
      remember();
      objects = objects.filter((o) => o !== target).concat(target); // bring to front
      interaction.grabbed = target;
      interaction.grab = { dx: target.x - input.x, dy: target.y - input.y, roll: input.roll, size: input.size, startSize: target.size, startRot: target.rot };
    } else if (ui.tool === 'draw') {
      remember();
      interaction.stroke = { kind: 'stroke', points: [[input.x, input.y]], color: ui.color, width: Math.max(6, unit() * 0.012) };
      objects.push(interaction.stroke);
    } else {
      remember();
      const shape = { kind: ui.tool, x: input.x, y: input.y, size: 0.09, rot: 0, color: ui.color };
      objects.push(shape);
      burst(input.x, input.y, ui.color, 10);
      interaction.grabbed = shape;
      interaction.grab = { dx: 0, dy: 0, roll: input.roll, size: input.size, startSize: shape.size, startRot: 0 };
    }
  }

  if (pinching && interaction.grabbed) {
    const { grabbed, grab } = interaction;
    grabbed.x = input.x + grab.dx;
    grabbed.y = input.y + grab.dy;
    if (input.source === 'hand') {
      grabbed.rot = grab.startRot + angleDelta(grab.roll, input.roll);
      grabbed.size = Math.min(0.45, Math.max(0.025, grab.startSize * (input.size / grab.size) ** 1.5));
    }
  } else if (pinching && interaction.stroke) {
    const points = interaction.stroke.points;
    const [lx, ly] = points[points.length - 1];
    if (Math.hypot((input.x - lx) * width, (input.y - ly) * height) > 3) points.push([input.x, input.y]);
  } else if (!pinching) {
    release();
  }

  if (input.wheel && !interaction.grabbed) {
    const target = hitTest(input.x, input.y);
    if (target && target.kind !== 'stroke') target.size = Math.min(0.45, Math.max(0.025, target.size * (input.wheel < 0 ? 1.08 : 0.93)));
  }

  // Fist over something deletes it after a short hold.
  if (input.fist) {
    const target = hitTest(input.x, input.y);
    if (target !== interaction.deleting) {
      interaction.deleting = target;
      interaction.deleteSince = now;
    }
    if (target && now - interaction.deleteSince > DELETE_MS) {
      remember();
      objects = objects.filter((o) => o !== target);
      const [bx, by] = target.kind === 'stroke' ? target.points[Math.floor(target.points.length / 2)] : [target.x, target.y];
      burst(bx, by, target.color, 26);
      interaction.deleting = null;
    }
  } else {
    interaction.deleting = null;
  }

  if (interaction.grabbed) setHint(t('hintGrab'));
  else if (interaction.deleting) setHint(t('hintDelete'));
  else setHint(t('hintIdle', { action: t(ui.tool === 'draw' ? 'actionDraw' : 'actionShape') }));
}

let hintText = '';
function setHint(text) {
  if (text !== hintText) {
    hintText = text;
    $('hint').textContent = text;
  }
}

// ---------- rendering ----------

function render(input, now) {
  sceneContext.clearRect(0, 0, width, height);
  if (game.active) {
    game.draw(sceneContext);
  } else {
    for (const object of objects) drawObject(sceneContext, object, width, height, unit(), object === interaction.grabbed);
  }
  particles = particles.filter((p) => (p.life -= 0.025) > 0);
  for (const p of particles) {
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.15;
    sceneContext.globalAlpha = p.life;
    sceneContext.fillStyle = p.color;
    sceneContext.beginPath();
    sceneContext.arc(p.x, p.y, 3 + 3 * p.life, 0, Math.PI * 2);
    sceneContext.fill();
  }
  sceneContext.globalAlpha = 1;

  hudContext.clearRect(0, 0, width, height);
  if (landmarks) drawSkeleton();
  if (!input) return;
  const [x, y] = px(input.x, input.y);
  const pinching = input.pinching && !input.fist;
  hudContext.lineWidth = 3;
  hudContext.strokeStyle = input.fist ? '#f87171' : '#ffffff';
  hudContext.fillStyle = pinching ? ui.color : 'transparent';
  hudContext.beginPath();
  hudContext.arc(x, y, pinching ? 10 : 16, 0, Math.PI * 2);
  hudContext.fill();
  hudContext.stroke();
  const progress = interaction.hover && interaction.hoverArmed && input.source === 'hand'
    ? (now - interaction.hoverSince) / DWELL_MS
    : interaction.deleting ? (now - interaction.deleteSince) / DELETE_MS : 0;
  if (progress > 0) {
    hudContext.strokeStyle = interaction.deleting ? '#f87171' : '#2dd4bf';
    hudContext.lineWidth = 5;
    hudContext.beginPath();
    hudContext.arc(x, y, 24, -Math.PI / 2, -Math.PI / 2 + Math.min(1, progress) * Math.PI * 2);
    hudContext.stroke();
  }
}

// Maps landmarks from the camera frame to the screen, matching object-fit: cover.
function toScreen(point) {
  const vw = video.videoWidth || 1;
  const vh = video.videoHeight || 1;
  const scale = Math.max(width / vw, height / vh);
  const offsetX = (width - vw * scale) / 2;
  const offsetY = (height - vh * scale) / 2;
  return [width - (point.x * vw * scale + offsetX), point.y * vh * scale + offsetY];
}

function drawSkeleton() {
  const points = landmarks.map(toScreen);
  hudContext.strokeStyle = 'rgb(94 234 212 / 0.55)';
  hudContext.lineWidth = 3;
  hudContext.lineCap = 'round';
  for (const [a, b] of BONES) {
    hudContext.beginPath();
    hudContext.moveTo(...points[a]);
    hudContext.lineTo(...points[b]);
    hudContext.stroke();
  }
}

function savePicture() {
  const ratio = 2;
  const canvas = document.createElement('canvas');
  canvas.width = width * ratio;
  canvas.height = height * ratio;
  const context = canvas.getContext('2d');
  context.fillStyle = '#0b1211';
  context.fillRect(0, 0, canvas.width, canvas.height);
  for (const object of objects) {
    drawObject(context, { ...object, width: object.width ? object.width * ratio : undefined }, canvas.width, canvas.height, unit() * ratio);
  }
  const link = document.createElement('a');
  link.href = canvas.toDataURL('image/png');
  link.download = 'qol-studio.png';
  link.click();
}

// ---------- input loop ----------

// Hand input is reported in screen space; landmarks are converted with the
// same cover-fit as the video so the cursor sits on the fingertip.
function handInput(result) {
  landmarks = result.landmarks?.[0] ?? null;
  if (!landmarks) {
    reader.read(null);
    return null;
  }
  const handedness = result.handedness?.[0]?.[0]?.categoryName ?? 'Right';
  // Same scale on both axes so pinch distance and hand roll are not distorted.
  // GestureReader mirrors x itself, so it gets the mirror image of the screen.
  const screen = landmarks.map((p) => {
    const [sx, sy] = toScreen(p);
    return { x: 1 - sx / unit(), y: sy / unit(), z: p.z };
  });
  const gesture = reader.read(screen, handedness);
  return { ...gesture, x: (gesture.x * unit()) / width, y: (gesture.y * unit()) / height, source: 'hand' };
}

let lastFrame = performance.now();
let lastInput = null;
function loop(now) {
  const dt = Math.min(0.05, (now - lastFrame) / 1000);
  lastFrame = now;
  let input = lastInput;
  if (tracker && video.readyState >= 2 && video.currentTime !== lastVideoTime) {
    lastVideoTime = video.currentTime;
    input = handInput(tracker.detectForVideo(video, now));
  }
  if (!landmarks && mouse.active) {
    input = { x: mouse.x, y: mouse.y, pinching: mouse.down, fist: false, roll: 0, size: 1, wheel: mouse.wheel, source: 'mouse' };
    mouse.wheel = 0;
  }
  lastInput = input;
  step(input, now, dt);
  render(input, now);
  requestAnimationFrame(loop);
}

// ---------- wiring ----------

scene.addEventListener('pointermove', (event) => {
  mouse.active = true;
  mouse.x = event.clientX / width;
  mouse.y = event.clientY / height;
});
scene.addEventListener('pointerdown', (event) => {
  mouse.active = true;
  mouse.down = true;
  mouse.x = event.clientX / width;
  mouse.y = event.clientY / height;
  scene.setPointerCapture(event.pointerId);
});
scene.addEventListener('pointerup', () => { mouse.down = false; });
scene.addEventListener('pointerleave', () => { if (!mouse.down) mouse.active = false; });
scene.addEventListener('wheel', (event) => { event.preventDefault(); mouse.wheel = event.deltaY; }, { passive: false });
document.addEventListener('keydown', (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key === 'z') undo();
});
window.addEventListener('resize', resize);

$('start').addEventListener('click', async () => {
  $('start').disabled = true;
  $('gateStatus').textContent = t('loading');
  try {
    await startCamera(video);
  } catch {
    $('gateStatus').textContent = t('cameraError');
    $('start').disabled = false;
    return;
  }
  try {
    tracker = await createTracker();
  } catch {
    $('gateStatus').textContent = t('modelError');
    return;
  }
  $('gate').hidden = true;
});

setLanguage(loadState().language);
document.documentElement.lang = loadState().language;
for (const element of document.querySelectorAll('[data-i18n]')) element.textContent = t(element.dataset.i18n);
resize();
buildToolbar();
requestAnimationFrame(loop);
