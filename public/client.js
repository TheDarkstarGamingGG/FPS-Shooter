import * as THREE from 'three';
window.socket = io();

// UI State
let currentSlot = 0; // 0 = Laser, 1 = Drill, 2 = Furnace
const toggleBtn = document.getElementById('toggle-craft');
const craftMenu = document.getElementById('crafting-menu');

toggleBtn.onclick = () => {
  const isOpen = craftMenu.style.display === 'block';
  craftMenu.style.display = isOpen ? 'none' : 'block';
  toggleBtn.innerText = isOpen ? 'CRAFTING ▼' : 'CLOSE ▲';
};

// 3. Scene setup (Brighter for mobile)
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87CEEB); // Sky Blue
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: false }); // Disable antialias for mobile performance
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const light = new THREE.DirectionalLight(0xffffff, 1.2);
light.position.set(10, 50, 10);
scene.add(light);
scene.add(new THREE.AmbientLight(0xaaaaaa));

// Ground (Green)
const groundGeo = new THREE.PlaneGeometry(1000, 1000);
const groundMat = new THREE.MeshStandardMaterial({ color: 0x228B22 });
const ground = new THREE.Mesh(groundGeo, groundMat);
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

const grid = new THREE.GridHelper(1000, 50, 0x000000, 0x111111);
grid.position.y = 0.01;
scene.add(grid);

// Mining Laser
const laserMat = new THREE.LineBasicMaterial({ color: 0x00ffff, linewidth: 5 });
const laserGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0,0,0), new THREE.Vector3(0,0,0)]);
const laserLine = new THREE.Line(laserGeo, laserMat);
scene.add(laserLine);

// Game State
let myOffset = { x: 0, z: 0 };
const interactables = [];
let inventory = {};

window.login = () => {
  const u = document.getElementById('username').value;
  const p = document.getElementById('password').value;
  if(u && p) socket.emit('login', { username: u, password: p });
};

socket.on('initGame', (data) => {
  document.getElementById('login-screen').style.display = 'none';
  myOffset = data.offset;
  camera.position.set(myOffset.x, 3, myOffset.z + 5); // Lifted camera to avoid ground
  updateInventory(data.inventory);
  buildPlot(data.offset, data.plotData);
});

socket.on('updateInventory', (inv) => updateInventory(inv));

function updateInventory(inv) {
  inventory = inv;
  // Update Hotbar labels
  document.getElementById('count-drill').innerText = inv.drill || 0;
  document.getElementById('count-furnace').innerText = inv.furnace || 0;
  document.getElementById('count-stone').innerText = (inv.stone || 0) + (inv.iron_ore || 0);
}

const matColors = { iron: 0x777777, copper: 0xCD7F32, gold: 0xFFD700, stone: 0x333333 };

function buildPlot(offset, plotData) {
  plotData.deposits.forEach(dep => {
    const geo = new THREE.BoxGeometry(2, 1, 2);
    const mat = new THREE.MeshStandardMaterial({ color: matColors[dep.type] });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(offset.x + dep.x, 0.5, offset.z + dep.z);
    mesh.userData = { isDeposit: true, type: dep.type };
    scene.add(mesh);
    interactables.push(mesh);
  });
}

// Controls
let yaw = 0, pitch = 0;
const keys = { w:false, a:false, s:false, d:false };

// Mobile Swipe to Look
let lastTouchX = 0, lastTouchY = 0;
document.addEventListener('touchstart', e => { 
  if(e.target.tagName === 'CANVAS') {
    lastTouchX = e.touches[0].clientX; lastTouchY = e.touches[0].clientY; 
  }
});
document.addEventListener('touchmove', e => {
  if(e.target.tagName === 'CANVAS') {
    const touch = e.touches[0];
    yaw -= (touch.clientX - lastTouchX) * 0.005;
    pitch -= (touch.clientY - lastTouchY) * 0.005;
    pitch = Math.max(-1.5, Math.min(1.5, pitch));
    lastTouchX = touch.clientX; lastTouchY = touch.clientY;
  }
});

// Action Logic
const actionBtn = document.getElementById('btn-action');
let isActing = false;
actionBtn.addEventListener('touchstart', e => { e.preventDefault(); isActing = true; });
actionBtn.addEventListener('touchend', e => { e.preventDefault(); isActing = false; stopAction(); });

function stopAction() {
  laserLine.geometry.setFromPoints([new THREE.Vector3(0,0,0), new THREE.Vector3(0,0,0)]);
  socket.emit('stopMining');
}

// Switching Slots
document.querySelectorAll('.slot').forEach((s, idx) => {
  s.onclick = () => {
    document.querySelector('.slot.active').classList.remove('active');
    s.classList.add('active');
    currentSlot = idx;
  };
});

const raycaster = new THREE.Raycaster();
function handleAction() {
  if(!isActing) return;
  
  raycaster.setFromCamera(new THREE.Vector2(0,0), camera);
  const hits = raycaster.intersectObjects(interactables);
  
  if(hits.length > 0 && hits[0].distance < 10) {
    const obj = hits[0].object;
    
    if(currentSlot === 0 && obj.userData.isDeposit) { // Laser
      const laserStart = camera.position.clone().add(new THREE.Vector3(0,-0.5,0));
      laserLine.geometry.setFromPoints([laserStart, hits[0].point]);
      socket.emit('startMining', obj.userData.type);
    }
  }
}

// Loop
function animate() {
  requestAnimationFrame(animate);
  camera.rotation.set(pitch, yaw, 0, 'YXZ');
  
  const dir = new THREE.Vector3(); camera.getWorldDirection(dir); dir.y = 0; dir.normalize();
  const side = new THREE.Vector3().crossVectors(camera.up, dir).normalize();
  
  if(keys.w) camera.position.addScaledVector(dir, 0.15);
  if(keys.s) camera.position.addScaledVector(dir, -0.15);
  if(keys.a) camera.position.addScaledVector(side, 0.15);
  if(keys.d) camera.position.addScaledVector(side, -0.15);

  handleAction();
  renderer.render(scene, camera);
}
animate();

// Map Move Buttons
const bind = (id, k) => {
  const b = document.getElementById(id);
  b.ontouchstart = (e) => { e.preventDefault(); keys[k] = true; };
  b.ontouchend = (e) => { e.preventDefault(); keys[k] = false; };
};
bind('btn-w', 'w'); bind('btn-a', 'a'); bind('btn-s', 's'); bind('btn-d', 'd');
