import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

const canvas = document.getElementById('scene');
const intro = document.getElementById('intro');
const help = document.getElementById('help');
const startButton = document.getElementById('startButton');
const loadProgress = document.getElementById('loadProgress');
const loadStatus = document.getElementById('loadStatus');
const PLAN_W = 23.35;
const PLAN_D = 13.14;
const PLAN_X0 = 26;
const PLAN_Y0 = 18;
const PLAN_SCALE = PLAN_W / 680;
const EYE_HEIGHT = 1.67;

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
} catch (error) {
  loadStatus.textContent = 'This device does not support the 3D walkthrough.';
  throw error;
}
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
renderer.setSize(innerWidth, innerHeight, false);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xb8bcc1);
scene.fog = new THREE.Fog(0xb8bcc1, 24, 48);
const camera = new THREE.PerspectiveCamera(63, innerWidth / innerHeight, 0.04, 90);
camera.position.set(2.65, EYE_HEIGHT, 1.3);
camera.rotation.order = 'YXZ';
camera.rotation.y = 0.45;
const controls = new PointerLockControls(camera, canvas);
controls.pointerSpeed = 0.85;
controls.minPolarAngle = 0.35;
controls.maxPolarAngle = Math.PI - 0.35;

scene.add(new THREE.HemisphereLight(0xfff7ea, 0x4d535a, 2.0));
const sun = new THREE.DirectionalLight(0xfff3df, 3.2);
sun.position.set(-9, 15, -6);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -16;
sun.shadow.camera.right = 16;
sun.shadow.camera.top = 12;
sun.shadow.camera.bottom = -12;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 38;
sun.shadow.bias = -0.00035;
scene.add(sun);
const warmFill = new THREE.PointLight(0xffd7a3, 42, 15, 2);
warmFill.position.set(-1.5, 2.8, -0.8);
scene.add(warmFill);
const coolFill = new THREE.PointLight(0xdceeff, 32, 13, 2);
coolFill.position.set(5.4, 2.7, 1.5);
scene.add(coolFill);

function pdfPoint(x, y) {
  return new THREE.Vector2(
    (x - PLAN_X0) * PLAN_SCALE - PLAN_W / 2,
    (y - PLAN_Y0) * PLAN_SCALE - PLAN_D / 2
  );
}

const wallSegments = [
  [26,18,184,18],[26,18,26,140],[26,140,174,140],[184,18,184,104],
  [100,18,100,65],[100,95,100,140],[26,65,72,65],[84,65,100,65],
  [184,65,398,65],[406,65,472,65],[472,18,654,18],[472,18,472,65],
  [654,18,654,116],[654,127,654,262],[472,65,504,65],[504,65,504,143],
  [472,143,504,143],[504,103,588,103],[588,103,588,18],[544,103,544,143],
  [504,143,504,219],[504,219,654,219],[588,103,588,143],[588,143,654,143],
  [498,143,498,219],[498,219,498,257],[498,257,563,257],[575,257,654,257],
  [654,257,654,385],[584,371,654,371],[584,371,584,385],[584,385,654,385],
  [466,376,517,376],[466,262,466,376],[517,262,517,376],[466,262,498,262],
  [517,262,654,262],[517,332,585,332],[585,332,585,371],
  [184,65,184,140],[184,140,184,218],[184,230,184,257],
  [52,140,184,140],[52,140,52,257],[52,257,112,257],[124,257,205,257],
  [112,257,112,328],[112,328,112,360],[26,257,26,322],[26,334,26,360],
  [26,360,112,360],[26,322,75,322],[88,322,112,322],
  [52,218,124,218],[124,218,124,257],[52,257,52,280],
  [318,257,318,298],[318,298,398,298],[398,257,398,298],[398,257,437,257],
  [449,257,498,257],[437,257,437,298],[437,298,466,298],
  [398,65,398,104],[406,104,472,104],[406,65,406,104]
].map(([x1,y1,x2,y2]) => [pdfPoint(x1,y1), pdfPoint(x2,y2)]);

const roomPositions = {
  entry: [2.65, 1.3, 0.45], living: [0.2, 0.4, 0],
  family: [-2.5, 0.5, 0], kitchen: [-7.0, 1.3, 0],
  bed1: [-7.7, -2.9, 0], bed2: [6.2, -0.1, 0],
  bed3: [9.5, -0.1, 0], bed4: [5.5, 5.4, 0], balcony: [-1.5, -5.1, -Math.PI / 2]
};

let modelReady = false;
new GLTFLoader().load('apartment.glb', gltf => {
  gltf.scene.traverse(object => {
    if (!object.isMesh) return;
    object.castShadow = true;
    object.receiveShadow = true;
    if (object.material) object.material.envMapIntensity = 0.75;
  });
  scene.add(gltf.scene);
  modelReady = true;
  loadProgress.style.width = '100%';
  loadStatus.textContent = 'Furnished apartment ready';
  startButton.disabled = false;
}, event => {
  if (!event.total) return;
  const value = Math.max(4, Math.min(96, Math.round(event.loaded / event.total * 100)));
  loadProgress.style.width = `${value}%`;
  loadStatus.textContent = `Loading furnished apartment… ${value}%`;
}, error => {
  console.error('Apartment model failed to load', error);
  loadStatus.textContent = 'The 3D model could not load. Please refresh and try again.';
});

const keys = Object.create(null);
let started = false;
let touchLook = null;
let yaw = 0.45;
let pitch = 0;
document.addEventListener('keydown', event => { keys[event.code] = true; });
document.addEventListener('keyup', event => { keys[event.code] = false; });
startButton.addEventListener('click', () => {
  if (!modelReady) return;
  started = true;
  intro.classList.add('hidden');
  if (matchMedia('(pointer:fine)').matches) controls.lock();
});
canvas.addEventListener('click', () => {
  if (started && matchMedia('(pointer:fine)').matches && !controls.isLocked) controls.lock();
});
canvas.addEventListener('touchstart', event => {
  const t = event.changedTouches[0];
  if (t.clientX > innerWidth * 0.36) touchLook = { id: t.identifier, x: t.clientX, y: t.clientY };
}, { passive: true });
canvas.addEventListener('touchmove', event => {
  if (!touchLook) return;
  const t = [...event.changedTouches].find(v => v.identifier === touchLook.id);
  if (!t) return;
  yaw -= (t.clientX - touchLook.x) * 0.006;
  pitch = THREE.MathUtils.clamp(pitch - (t.clientY - touchLook.y) * 0.004, -1.1, 1.1);
  camera.rotation.set(pitch, yaw, 0, 'YXZ');
  touchLook.x = t.clientX;
  touchLook.y = t.clientY;
}, { passive: true });
canvas.addEventListener('touchend', event => {
  if (touchLook && [...event.changedTouches].some(v => v.identifier === touchLook.id)) touchLook = null;
}, { passive: true });

document.querySelectorAll('[data-move]').forEach(button => {
  const code = { forward: 'KeyW', back: 'KeyS', left: 'KeyA', right: 'KeyD' }[button.dataset.move];
  const on = event => { event.preventDefault(); keys[code] = true; };
  const off = event => { event.preventDefault(); keys[code] = false; };
  button.addEventListener('touchstart', on, { passive: false });
  button.addEventListener('touchend', off, { passive: false });
  button.addEventListener('mousedown', on);
  button.addEventListener('mouseup', off);
  button.addEventListener('mouseleave', off);
});
document.querySelectorAll('[data-room]').forEach(button => {
  button.addEventListener('click', () => {
    const [x, z, angle] = roomPositions[button.dataset.room];
    camera.position.set(x, EYE_HEIGHT, z);
    yaw = angle;
    pitch = 0;
    camera.rotation.set(0, angle, 0, 'YXZ');
  });
});
document.getElementById('helpButton').onclick = () => {
  help.classList.remove('hidden');
  help.setAttribute('aria-hidden', 'false');
};
document.getElementById('closeHelp').onclick = () => {
  help.classList.add('hidden');
  help.setAttribute('aria-hidden', 'true');
};
document.getElementById('fullscreenButton').onclick = () => {
  if (!document.fullscreenElement) document.documentElement.requestFullscreen();
  else document.exitFullscreen();
};

function distanceToSegment(px, pz, a, b) {
  const abx = b.x - a.x;
  const abz = b.y - a.y;
  const t = THREE.MathUtils.clamp(((px - a.x) * abx + (pz - a.y) * abz) / (abx * abx + abz * abz), 0, 1);
  return Math.hypot(px - (a.x + abx * t), pz - (a.y + abz * t));
}
function collides(x, z) {
  if (x < -PLAN_W / 2 + 0.18 || x > PLAN_W / 2 - 0.18 || z < -PLAN_D / 2 + 0.18 || z > PLAN_D / 2 - 0.18) return true;
  return wallSegments.some(([a, b]) => distanceToSegment(x, z, a, b) < 0.24);
}
const direction = new THREE.Vector3();
const side = new THREE.Vector3();
function move(delta) {
  const forward = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0);
  const strafe = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
  if (!forward && !strafe) return;
  camera.getWorldDirection(direction);
  direction.y = 0;
  direction.normalize();
  side.crossVectors(direction, camera.up).normalize();
  const velocity = direction.multiplyScalar(forward).add(side.multiplyScalar(strafe)).normalize().multiplyScalar(delta * 2.1);
  const nx = camera.position.x + velocity.x;
  const nz = camera.position.z + velocity.z;
  if (!collides(nx, camera.position.z)) camera.position.x = nx;
  if (!collides(camera.position.x, nz)) camera.position.z = nz;
  camera.position.y = EYE_HEIGHT;
}
function updateMap() {
  const left = (camera.position.x / PLAN_W + 0.5) * 100;
  const top = (camera.position.z / PLAN_D + 0.5) * 100;
  const marker = document.getElementById('mapMarker');
  const mapDirection = document.getElementById('mapDirection');
  marker.style.left = `${left}%`;
  marker.style.top = `${top}%`;
  mapDirection.style.left = `${left}%`;
  mapDirection.style.top = `${top}%`;
  mapDirection.style.transform = `rotate(${camera.rotation.y - Math.PI / 2}rad)`;
}
window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.setSize(innerWidth, innerHeight, false);
});
const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const delta = Math.min(clock.getDelta(), 0.05);
  if (started) move(delta);
  updateMap();
  renderer.render(scene, camera);
}
animate();
