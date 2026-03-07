function log(msg) {
  document.getElementById('debug').innerText = msg;
  console.log(msg);
}

// Update your login button listener to this:
document.getElementById('btn-login').addEventListener('click', () => {
  const u = document.getElementById('username').value;
  const p = document.getElementById('password').value;
  log(`Attempting login for: ${u}`); // This will show on your phone screen!
  if(u && p) socket.emit('login', { username: u, password: p });
});

socket.on('connect', () => log("Connected to Server!"));
socket.on('connect_error', (err) => log("Connect Error: " + err));
socket.on('initGame', (data) => log("Game Starting..."));

import * as THREE from 'three';

window.socket = io();

// UI Elements
const loginScreen = document.getElementById('login-screen');
const invDisplay = document.getElementById('inv-display');

// 3D Scene Setup
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x222222);
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const light = new THREE.DirectionalLight(0xffffff, 1);
light.position.set(10, 20, 10);
scene.add(light);
scene.add(new THREE.AmbientLight(0x404040));

const grid = new THREE.GridHelper(500, 100, 0x0f0, 0x333333);
scene.add(grid);

// Game State
let myOffset = { x: 0, z: 0 };
const interactables = []; // Things we can shoot with laser
let isMining = false;

// Mining Laser Visual
const materialLine = new THREE.LineBasicMaterial({ color: 0xff0000, linewidth: 3 });
const geometryLine = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0,0,0), new THREE.Vector3(0,0,0)]);
const laserLine = new THREE.Line(geometryLine, materialLine);
scene.add(laserLine);

// Materials for Deposits
const matColors = {
  iron: 0x888888, copper: 0xb87333, gold: 0xffd700, stone: 0x555555
};

// Login Logic
document.getElementById('btn-login').addEventListener('click', () => {
  const u = document.getElementById('username').value;
  const p = document.getElementById('password').value;
  if(u && p) socket.emit('login', { username: u, password: p });
});

socket.on('initGame', (data) => {
  loginScreen.style.display = 'none';
  myOffset = data.offset;
  
  // Start player in the middle of their plot
  camera.position.set(myOffset.x, 2, myOffset.z + 10);
  
  updateInventoryUI(data.inventory);
  buildPlot(data.offset, data.plotData);
  
  // Enable pointer lock for PC
  document.body.requestPointerLock();
});

socket.on('spawnPlot', (data) => buildPlot(data.offset, data.plotData));
socket.on('updateInventory', (inv) => updateInventoryUI(inv));

function updateInventoryUI(inv) {
  let str = '';
  for(let key in inv) { if(inv[key] > 0) str += `${key}: ${inv[key]}\n`; }
  invDisplay.innerText = str || 'Empty';
}

function buildPlot(offset, plotData) {
  // Build Deposits
  plotData.deposits.forEach(dep => {
    const geo = new THREE.BoxGeometry(2, 2, 2);
    const mat = new THREE.MeshStandardMaterial({ color: matColors[dep.type] });
    const mesh = new THREE.Mesh(geo, mat);
    // Apply local coordinates + room offset
    mesh.position.set(offset.x + dep.x, 1, offset.z + dep.z);
    mesh.userData = { isDeposit: true, type: dep.type };
    scene.add(mesh);
    interactables.push(mesh);
  });
}

// Input & Mining Logic
const keys = { w: false, a: false, s: false, d: false };
const raycaster = new THREE.Raycaster();
const screenCenter = new THREE.Vector2(0, 0);

document.addEventListener('keydown', e => { if(keys.hasOwnProperty(e.key.toLowerCase())) keys[e.key.toLowerCase()] = true; });
document.addEventListener('keyup', e => { if(keys.hasOwnProperty(e.key.toLowerCase())) keys[e.key.toLowerCase()] = false; });
document.addEventListener('mousedown', () => startMining());
document.addEventListener('mouseup', () => stopMining());

const mineBtn = document.getElementById('btn-mine');
mineBtn.addEventListener('touchstart', e => { e.preventDefault(); startMining(); });
mineBtn.addEventListener('touchend', e => { e.preventDefault(); stopMining(); });

let yaw = 0, pitch = 0;
document.addEventListener('mousemove', (e) => {
  if (document.pointerLockElement) {
    yaw -= e.movementX * 0.002;
    pitch -= e.movementY * 0.002;
    pitch = Math.max(-Math.PI/2.1, Math.min(Math.PI/2.1, pitch));
  }
});

function startMining() {
  isMining = true;
  raycaster.setFromCamera(screenCenter, camera);
  const hits = raycaster.intersectObjects(interactables);
  if(hits.length > 0 && hits[0].distance < 15) { // Range check
    const hitObj = hits[0].object;
    if(hitObj.userData.isDeposit) {
      // Fire the laser visually
      laserLine.geometry.setFromPoints([camera.position, hits[0].point]);
      socket.emit('startMining', hitObj.userData.type);
    }
  }
}

function stopMining() {
  isMining = false;
  laserLine.geometry.setFromPoints([new THREE.Vector3(0,0,0), new THREE.Vector3(0,0,0)]);
  socket.emit('stopMining');
}

// Game Loop
function animate() {
  requestAnimationFrame(animate);

  if (loginScreen.style.display === 'none') {
    camera.rotation.set(pitch, yaw, 0, 'YXZ');
    const dir = new THREE.Vector3(); camera.getWorldDirection(dir); dir.y = 0; dir.normalize();
    const right = new THREE.Vector3(); right.crossVectors(camera.up, dir).normalize();

    const speed = 0.2;
    if (keys.w) camera.position.addScaledVector(dir, speed);
    if (keys.s) camera.position.addScaledVector(dir, -speed);
    if (keys.a) camera.position.addScaledVector(right, speed);
    if (keys.d) camera.position.addScaledVector(right, -speed);
    
    // Keep laser attached to camera if mining
    if(isMining) {
      raycaster.setFromCamera(screenCenter, camera);
      const hits = raycaster.intersectObjects(interactables);
      if(hits.length > 0 && hits[0].distance < 15) {
        // Drop the laser slightly below camera so it looks like a handheld tool
        const laserStart = camera.position.clone().add(new THREE.Vector3(0, -0.5, 0));
        laserLine.geometry.setFromPoints([laserStart, hits[0].point]);
      } else { stopMining(); }
    }
  }

  renderer.render(scene, camera);
}
animate();
