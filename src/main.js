import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { StereoEffect } from 'three/addons/effects/StereoEffect.js';

const $ = (id) => document.getElementById(id);
const MODEL_URL = './classroom.glb';
const MODEL_BYTES_FALLBACK = 21479588;

/* ------------------------------------------------------------------ erros na tela */
function showError(msg) {
  const el = $('error');
  el.hidden = false;
  el.textContent += msg + '\n';
}
window.addEventListener('error', (e) => showError(e.message));
window.addEventListener('unhandledrejection', (e) => showError(String(e.reason)));

/* ------------------------------------------------------------------ renderer / cena */
const canvas = $('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0xbcd7ee);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(80, window.innerWidth / window.innerHeight, 0.1, 1000);

const effect = new StereoEffect(renderer);
effect.setSize(window.innerWidth, window.innerHeight);

const hemi = new THREE.HemisphereLight(0xffffff, 0x9a9aa8, 2.0);
const sun = new THREE.DirectionalLight(0xffffff, 1.0);
sun.position.set(0.4, 1, 0.3);
scene.add(hemi, sun);

const LIGHT_LEVELS = [0.7, 1, 1.5, 2.2];
let lightIdx = 1;
function applyLight() {
  const s = LIGHT_LEVELS[lightIdx];
  hemi.intensity = 2.0 * s;
  sun.intensity = 1.0 * s;
}

/* ------------------------------------------------------------------ estado */
const state = {
  pos: new THREE.Vector3(),
  eye: 1.6,           // altura do olho acima do chão (unidades do modelo)
  floorY: 0,
  roomH: 3,
  spawnYaw: 0,        // direção inicial do olhar
  // sem giroscópio
  yaw: 0,
  pitch: 0,
  // com giroscópio
  hasGyro: false,
  gyro: { alpha: 0, beta: 0, gamma: 0 },
  yawOffset: 0,
  userYaw: 0,
  // andar
  walk: false,
  move: { x: 0, y: 0 },
  speed: 2,
  radius: 0.5,
  ready: false,
  running: false,
  stereo: false,
};

let meshes = [];
const raycaster = new THREE.Raycaster();
const UP = new THREE.Vector3(0, 1, 0);
const DOWN = new THREE.Vector3(0, -1, 0);

function castRay(origin, dir, far = Infinity) {
  raycaster.set(origin, dir);
  raycaster.far = far;
  const hits = raycaster.intersectObjects(meshes, false);
  return hits.length ? hits[0] : null;
}

/* ------------------------------------------------------------------ giroscópio */
const _euler = new THREE.Euler();
const _q0 = new THREE.Quaternion();
const _q1 = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5)); // -90° em X
const _zee = new THREE.Vector3(0, 0, 1);
const _qd = new THREE.Quaternion();
const _qy = new THREE.Quaternion();
const _fwd = new THREE.Vector3();

function screenAngle() {
  if (screen.orientation && typeof screen.orientation.angle === 'number') return screen.orientation.angle;
  return typeof window.orientation === 'number' ? window.orientation : 0;
}

function deviceQuaternion(out) {
  const d = THREE.MathUtils.degToRad;
  _euler.set(d(state.gyro.beta), d(state.gyro.alpha), -d(state.gyro.gamma), 'YXZ');
  out.setFromEuler(_euler);
  out.multiply(_q1);
  out.multiply(_q0.setFromAxisAngle(_zee, -d(screenAngle())));
  return out;
}

function yawOf(q) {
  _fwd.set(0, 0, -1).applyQuaternion(q);
  return Math.atan2(-_fwd.x, -_fwd.z);
}

function recenter() {
  state.userYaw = 0;
  if (state.hasGyro) {
    deviceQuaternion(_qd);
    state.yawOffset = state.spawnYaw - yawOf(_qd);
  } else {
    state.yaw = state.spawnYaw;
    state.pitch = 0;
  }
}

function onOrient(e) {
  if (e.alpha == null || e.beta == null || e.gamma == null) return;
  state.gyro.alpha = e.alpha;
  state.gyro.beta = e.beta;
  state.gyro.gamma = e.gamma;
  if (!state.hasGyro) {
    state.hasGyro = true;
    recenter();
  }
}
window.addEventListener('deviceorientation', onOrient, true);

/* ------------------------------------------------------------------ arrastar para olhar */
let drag = null;
canvas.addEventListener('pointerdown', (e) => {
  if (drag) return;
  drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  if (!drag || e.pointerId !== drag.id) return;
  const dx = e.clientX - drag.x;
  const dy = e.clientY - drag.y;
  drag.x = e.clientX;
  drag.y = e.clientY;
  if (state.hasGyro) {
    state.userYaw += dx * 0.005;
  } else {
    state.yaw += dx * 0.005;
    state.pitch = THREE.MathUtils.clamp(state.pitch + dy * 0.005, -1.5, 1.5);
  }
});
const endDrag = (e) => {
  if (drag && e.pointerId === drag.id) drag = null;
};
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);
canvas.addEventListener('dblclick', () => {
  if (state.stereo) setStereo(false);
});

/* ------------------------------------------------------------------ joystick */
const pad = $('pad');
const knob = $('knob');
let padPointer = null;
const PAD_R = 34;
function padUpdate(e) {
  const r = pad.getBoundingClientRect();
  let x = e.clientX - (r.left + r.width / 2);
  let y = e.clientY - (r.top + r.height / 2);
  const len = Math.hypot(x, y);
  if (len > PAD_R) {
    x = (x / len) * PAD_R;
    y = (y / len) * PAD_R;
  }
  knob.style.transform = `translate(${x}px, ${y}px)`;
  state.move.x = x / PAD_R;
  state.move.y = y / PAD_R;
}
function padReset() {
  padPointer = null;
  knob.style.transform = '';
  state.move.x = 0;
  state.move.y = 0;
}
pad.addEventListener('pointerdown', (e) => {
  padPointer = e.pointerId;
  pad.setPointerCapture(e.pointerId);
  padUpdate(e);
});
pad.addEventListener('pointermove', (e) => {
  if (e.pointerId === padPointer) padUpdate(e);
});
pad.addEventListener('pointerup', padReset);
pad.addEventListener('pointercancel', padReset);

/* ------------------------------------------------------------------ onde nascer */
function findSpawn(root) {
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());

  const dirs = [];
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    dirs.push(new THREE.Vector3(Math.cos(a), 0, Math.sin(a)));
  }

  let best = null;
  const N = 10;
  const origin = new THREE.Vector3();

  for (const f of [0.1, 0.2, 0.3]) {
    const y0 = box.min.y + size.y * f;
    for (let ix = 0; ix < N; ix++) {
      for (let iz = 0; iz < N; iz++) {
        const x = box.min.x + size.x * (0.1 + (0.8 * (ix + 0.5)) / N);
        const z = box.min.z + size.z * (0.1 + (0.8 * (iz + 0.5)) / N);
        origin.set(x, y0, z);

        const down = castRay(origin, DOWN);
        const up = castRay(origin, UP);
        if (!down || !up) continue;
        const floorY = origin.y - down.distance;
        const ceilY = origin.y + up.distance;
        const roomH = ceilY - floorY;
        if (roomH < size.y * 0.05) continue;

        const eye = floorY + roomH * 0.5;
        origin.set(x, eye, z);

        let minD = Infinity;
        let maxD = -1;
        let maxDir = null;
        let enclosed = true;
        for (const d of dirs) {
          const h = castRay(origin, d);
          if (!h) {
            enclosed = false;
            break;
          }
          if (h.distance < minD) minD = h.distance;
          if (h.distance > maxD) {
            maxD = h.distance;
            maxDir = d;
          }
        }
        if (!enclosed) continue;
        if (!best || minD > best.score) {
          best = { score: minD, x, z, floorY, roomH, dir: maxDir.clone() };
        }
      }
    }
  }

  if (best) {
    return {
      x: best.x,
      z: best.z,
      floorY: best.floorY,
      roomH: best.roomH,
      yaw: Math.atan2(-best.dir.x, -best.dir.z),
    };
  }
  // plano B: centro da caixa, olhando para frente
  return {
    x: (box.min.x + box.max.x) / 2,
    z: (box.min.z + box.max.z) / 2,
    floorY: box.min.y,
    roomH: size.y * 0.6,
    yaw: 0,
    fallback: true,
  };
}

function setEye(eye) {
  state.eye = THREE.MathUtils.clamp(eye, state.floorY + state.roomH * 0.1, state.floorY + state.roomH * 0.95) - state.floorY;
  state.pos.y = state.floorY + state.eye;
}

/* ------------------------------------------------------------------ carregar modelo */
const bar = document.querySelector('#bar > i');
const status = $('status');
const enter = $('enter');

new GLTFLoader().load(
  MODEL_URL,
  (gltf) => {
    try {
      const root = gltf.scene;
      const maxAniso = Math.min(4, renderer.capabilities.getMaxAnisotropy());
      root.traverse((o) => {
        if (!o.isMesh) return;
        meshes.push(o);
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) {
          m.side = THREE.DoubleSide;
          if (m.map) m.map.anisotropy = maxAniso;
        }
      });
      scene.add(root);
      root.updateMatrixWorld(true);

      status.textContent = 'Procurando o melhor lugar na sala…';
      // dá um respiro para a tela atualizar antes do cálculo
      setTimeout(() => {
        try {
          const box = new THREE.Box3().setFromObject(root);
          const diag = box.getSize(new THREE.Vector3()).length();
          const sp = findSpawn(root);

          state.floorY = sp.floorY;
          state.roomH = sp.roomH;
          state.pos.set(sp.x, sp.floorY + sp.roomH * 0.5, sp.z);
          state.eye = sp.roomH * 0.5;
          state.spawnYaw = sp.yaw;
          state.yaw = sp.yaw;
          state.speed = state.eye * 1.2;
          state.radius = state.eye * 0.3;

          camera.near = Math.max(0.02, state.eye * 0.03);
          camera.far = diag * 2;
          camera.updateProjectionMatrix();
          effect.setEyeSeparation(state.eye * 0.04);

          if (state.hasGyro) recenter();
          state.ready = true;
          bar.style.width = '100%';
          status.textContent = sp.fallback ? 'Pronto (posição aproximada)' : 'Pronto';
          enter.disabled = false;
        } catch (err) {
          showError('Erro ao posicionar a câmera: ' + (err.stack || err));
        }
      }, 50);
    } catch (err) {
      showError('Erro ao montar a cena: ' + (err.stack || err));
    }
  },
  (xhr) => {
    const total = xhr.lengthComputable && xhr.total ? xhr.total : MODEL_BYTES_FALLBACK;
    const pct = Math.min(99, Math.round((xhr.loaded / total) * 100));
    bar.style.width = pct + '%';
    status.textContent = `Carregando modelo… ${pct}%`;
  },
  (err) => showError('Falha ao carregar o modelo: ' + (err && err.message ? err.message : err)),
);

/* ------------------------------------------------------------------ UI */
async function start() {
  try {
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
      await DeviceOrientationEvent.requestPermission(); // iOS
    }
  } catch (_) { /* sem permissão: segue com arrastar */ }
  window.addEventListener('deviceorientation', onOrient, true);
  try {
    if (navigator.wakeLock) navigator.wakeLock.request('screen').catch(() => {});
  } catch (_) { /* ok */ }
  $('intro').hidden = true;
  $('toolbar').hidden = false;
  state.running = true;
  recenter();
}
enter.addEventListener('click', start);

$('btn-center').addEventListener('click', recenter);
$('btn-light').addEventListener('click', () => {
  lightIdx = (lightIdx + 1) % LIGHT_LEVELS.length;
  applyLight();
});
$('btn-walk').addEventListener('click', (e) => {
  state.walk = !state.walk;
  e.currentTarget.setAttribute('aria-pressed', String(state.walk));
  $('pad').hidden = !state.walk;
  $('height').hidden = !state.walk;
  if (!state.walk) padReset();
});
$('btn-up').addEventListener('click', () => setEye(state.floorY + state.eye + state.roomH * 0.06));
$('btn-down').addEventListener('click', () => setEye(state.floorY + state.eye - state.roomH * 0.06));

function setStereo(on) {
  state.stereo = on;
  document.body.classList.toggle('stereo', on);
  $('exit').hidden = !on;
  $('btn-vr').setAttribute('aria-pressed', String(on));
  onResize();
}
$('btn-vr').addEventListener('click', () => setStereo(!state.stereo));
$('exit').addEventListener('click', () => setStereo(false));

function onResize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h);
  effect.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', onResize);

if (!('ondeviceorientation' in window)) {
  $('hint').textContent = 'Arraste na tela para olhar em volta.';
}

/* ------------------------------------------------------------------ loop */
const _right = new THREE.Vector3();
const _dir = new THREE.Vector3();
const clock = new THREE.Clock();

function updateCamera() {
  camera.position.copy(state.pos);
  if (state.hasGyro) {
    deviceQuaternion(_qd);
    _qy.setFromAxisAngle(UP, state.yawOffset + state.userYaw);
    camera.quaternion.copy(_qy).multiply(_qd);
  } else {
    camera.rotation.set(state.pitch, state.yaw, 0, 'YXZ');
  }
}

function updateWalk(dt) {
  if (!state.walk) return;
  const mx = state.move.x;
  const my = state.move.y;
  const mag = Math.min(1, Math.hypot(mx, my));
  if (mag < 0.08) return;

  camera.getWorldDirection(_fwd);
  _fwd.y = 0;
  if (_fwd.lengthSq() < 1e-6) return;
  _fwd.normalize();
  _right.crossVectors(_fwd, UP);

  _dir.set(0, 0, 0).addScaledVector(_fwd, -my).addScaledVector(_right, mx);
  if (_dir.lengthSq() < 1e-6) return;
  _dir.normalize();

  const hit = castRay(state.pos, _dir, state.radius);
  if (hit) return; // parede / móvel na frente
  state.pos.addScaledVector(_dir, state.speed * mag * dt);
}

applyLight();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.1);
  if (state.ready) {
    updateWalk(dt);
    updateCamera();
  }
  if (state.stereo) effect.render(scene, camera);
  else renderer.render(scene, camera);
});
