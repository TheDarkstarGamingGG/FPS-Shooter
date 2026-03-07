import * as THREE from 'three';

const socket = io();

// 1. SCENE SETUP
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

scene.add(new THREE.AmbientLight(0xffffff, 0.6));
const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
dirLight.position.set(10, 20, 10);
scene.add(dirLight);

const grid = new THREE.GridHelper(200, 200, 0x000000, 0x555555);
scene.add(grid);

// 2. GAME STATE & VARIABLES
const players = {}; 
const hitboxes = []; // Used for the Hitscan Raycaster
let myId = null;
let myPlayer = null;
let isDead = false;

// Weapon State
let ammo = 30;
let isReloading = false;
let isShooting = false;
let lastShotTime = 0;
const fireRate = 100; // ms between shots (Continuous fire)

// Physics
const speed = 0.2;
let velocityY = 0;
const gravity = -0.015;
let isGrounded = false;

// Camera Look Variables
let pitch = 0; // Up/Down
let yaw = 0;   // Left/Right
const cameraOffset = new THREE.Vector3(0, 1.5, 0); // Head height

// Raycaster for shooting
const raycaster = new THREE.Raycaster();
const screenCenter = new THREE.Vector2(0, 0);

// 3. THE AK-47 MODEL
scene.add(camera); // Camera must be in scene to hold the gun
const gunGroup = new THREE.Group();
const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.4), new THREE.MeshStandardMaterial({color: 0x222222}));
barrel.position.z = -0.2;
const mag = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.15, 0.1), new THREE.MeshStandardMaterial({color: 0x111111}));
mag.position.set(0, -0.1, -0.1);
gunGroup.add(barrel); gunGroup.add(mag);
gunGroup.position.set(0.3, -0.3, -0.5); // Bottom right of vision
camera.add(gunGroup);

// 4. NETWORKING
socket.on('currentPlayers', (serverPlayers) => {
  myId = socket.id;
  for (let id in serverPlayers) {
    if(!serverPlayers[id].isDead) addPlayer(id, serverPlayers[id]);
  }
});

socket.on('newPlayer', (data) => addPlayer(data.id, data.player));

socket.on('playerMoved', (data) => {
  if (players[data.id]) {
    players[data.id].position.set(data.x, data.y, data.z);
    players[data.id].rotation.y = data.yaw; // Turn their body to face where they are looking
  }
});

socket.on('healthUpdated', (data) => {
  if(data.id === myId) {
    document.getElementById('hp-val').innerText = Math.max(0, data.hp);
  }
});

socket.on('playerDied', (id) => {
  if (id === myId) {
    isDead = true;
    document.getElementById('wasted').style.display = 'block';
  }
  if (players[id]) {
    scene.remove(players[id]);
    const index = hitboxes.indexOf(players[id]);
    if (index > -1) hitboxes.splice(index, 1);
    delete players[id];
  }
});

socket.on('playerRespawned', (data) => {
  if (data.id === myId) {
    isDead = false;
    document.getElementById('wasted').style.display = 'none';
    document.getElementById('hp-val').innerText = "100";
    ammo = 30; document.getElementById('ammo-val').innerText = ammo;
  }
  addPlayer(data.id, data.player);
});

socket.on('playerDisconnected', (id) => {
  if (players[id]) { scene.remove(players[id]); delete players[id]; }
});

// Humanoid Builder
function addPlayer(id, data) {
  const group = new THREE.Group();
  
  // Torso
  const bodyGeo = new THREE.BoxGeometry(0.8, 1.2, 0.4);
  const bodyMat = new THREE.MeshStandardMaterial({ color: data.color });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.position.y = 0.6;
  
  // Head
  const headGeo = new THREE.BoxGeometry(0.5, 0.5, 0.5);
  const headMat = new THREE.MeshStandardMaterial({ color: 0xffcc99 });
  const head = new THREE.Mesh(headGeo, headMat);
  head.position.y = 1.45;
  
  group.add(body); group.add(head);
  group.position.set(data.x, data.y, data.z);
  scene.add(group);
  
  if (id === myId) {
    myPlayer = group;
    // Hide our own body so it doesn't block the camera
    body.visible = false; head.visible = false;
  } else {
    group.userData.id = id;
    players[id] = group;
    hitboxes.push(group); // Add to Raycaster targets
  }
}

// 5. INPUT CONTROLS
const keys = { w: false, a: false, s: false, d: false, space: false };

// PC Mouse Look & Shoot
document.body.addEventListener('click', () => { if(!isDead) document.body.requestPointerLock(); });
document.addEventListener('mousemove', (e) => {
  if (document.pointerLockElement === document.body && !isDead) {
    yaw -= e.movementX * 0.002;
    pitch -= e.movementY * 0.002;
    pitch = Math.max(-Math.PI/2.1, Math.min(Math.PI/2.1, pitch)); // Prevent snapping neck
  }
});
document.addEventListener('mousedown', (e) => { if(e.button === 0) isShooting = true; });
document.addEventListener('mouseup', (e) => { if(e.button === 0) isShooting = false; });
document.addEventListener('keydown', (e) => {
    if(e.key === 'r') triggerReload();
    if(keys.hasOwnProperty(e.key.toLowerCase())) keys[e.key.toLowerCase()] = true; 
    if(e.key === ' ') keys.space = true;
});
document.addEventListener('keyup', (e) => {
    if(keys.hasOwnProperty(e.key.toLowerCase())) keys[e.key.toLowerCase()] = false;
    if(e.key === ' ') keys.space = false;
});

// Mobile Look & Shoot
const lookZone = document.getElementById('look-zone');
let lastTouchX = 0, lastTouchY = 0;

lookZone.addEventListener('touchstart', (e) => {
  if(e.target.id === 'look-zone') {
    lastTouchX = e.touches[0].clientX; lastTouchY = e.touches[0].clientY;
  }
});
lookZone.addEventListener('touchmove', (e) => {
  if(e.target.id === 'look-zone' && !isDead) {
    const touch = e.touches[0];
    yaw -= (touch.clientX - lastTouchX) * 0.005;
    pitch -= (touch.clientY - lastTouchY) * 0.005;
    pitch = Math.max(-Math.PI/2.1, Math.min(Math.PI/2.1, pitch));
    lastTouchX = touch.clientX; lastTouchY = touch.clientY;
  }
});

const bindBtn = (id, key) => {
  const btn = document.getElementById(id);
  btn.addEventListener('touchstart', (e) => { e.preventDefault(); keys[key] = true; });
  btn.addEventListener('touchend', (e) => { e.preventDefault(); keys[key] = false; });
};
bindBtn('btn-w', 'w'); bindBtn('btn-a', 'a'); bindBtn('btn-s', 's'); bindBtn('btn-d', 'd'); bindBtn('btn-jump', 'space');

const shootBtn = document.getElementById('btn-shoot');
shootBtn.addEventListener('touchstart', (e) => { e.preventDefault(); isShooting = true; });
shootBtn.addEventListener('touchend', (e) => { e.preventDefault(); isShooting = false; });

document.getElementById('btn-reload').addEventListener('touchstart', (e) => { e.preventDefault(); triggerReload(); });

// 6. WEAPON LOGIC
function triggerReload() {
  if(isReloading || ammo === 30 || isDead) return;
  isReloading = true;
  document.getElementById('ammo-val').innerText = "REL";
  
  setTimeout(() => {
    if(isDead) return; // Cancel if killed while reloading
    ammo = 30;
    isReloading = false;
    document.getElementById('ammo-val').innerText = ammo;
  }, 2000);
}

function handleShooting() {
  if(isDead) return;
  if(isReloading) return;
  if(ammo <= 0) { triggerReload(); return; }

  const now = Date.now();
  if (isShooting && now - lastShotTime > fireRate) {
    ammo--;
    document.getElementById('ammo-val').innerText = ammo;
    lastShotTime = now;

    // Visual Recoil
    gunGroup.position.z = -0.4; 
    setTimeout(() => gunGroup.position.z = -0.5, 50);

    // Hitscan detection
    raycaster.setFromCamera(screenCenter, camera);
    const intersects = raycaster.intersectObjects(hitboxes, true); // true = check children (head/body)
    
    if (intersects.length > 0) {
      // Traverse up to find the parent group with the UserData ID
      let hitObject = intersects[0].object;
      while(hitObject.parent && !hitObject.userData.id) { hitObject = hitObject.parent; }
      
      if(hitObject.userData.id) {
        socket.emit('hitTarget', hitObject.userData.id);
      }
    }
  }
}

// 7. THE GAME LOOP
function animate() {
  requestAnimationFrame(animate);

  if (myPlayer && !isDead) {
    let moved = false;

    // Apply Camera Rotations
    camera.rotation.set(pitch, yaw, 0, 'YXZ');
    
    // Calculate movement relative to where we are looking
    const direction = new THREE.Vector3();
    camera.getWorldDirection(direction);
    direction.y = 0; // Don't fly into the sky
    direction.normalize();
    
    const right = new THREE.Vector3();
    right.crossVectors(camera.up, direction).normalize();

    if (keys.w) { myPlayer.position.addScaledVector(direction, speed); moved = true; }
    if (keys.s) { myPlayer.position.addScaledVector(direction, -speed); moved = true; }
    if (keys.a) { myPlayer.position.addScaledVector(right, speed); moved = true; }
    if (keys.d) { myPlayer.position.addScaledVector(right, -speed); moved = true; }

    // Gravity & Jumping
    velocityY += gravity;
    myPlayer.position.y += velocityY;

    if (myPlayer.position.y <= 0) {
      myPlayer.position.y = 0;
      velocityY = 0;
      isGrounded = true;
    } else {
      isGrounded = false;
    }

    if (keys.space && isGrounded) { velocityY = 0.35; moved = true; }

    // Lock camera to player head
    camera.position.copy(myPlayer.position).add(cameraOffset);

    // Reload Animation (Tilt gun down)
    if (isReloading) {
      gunGroup.rotation.x = THREE.MathUtils.lerp(gunGroup.rotation.x, Math.PI / 4, 0.1);
    } else {
      gunGroup.rotation.x = THREE.MathUtils.lerp(gunGroup.rotation.x, 0, 0.2);
    }

    handleShooting();

    if (moved || yaw !== 0 || pitch !== 0) {
      socket.emit('playerMovement', { x: myPlayer.position.x, y: myPlayer.position.y, z: myPlayer.position.z, yaw: yaw });
    }
  } else if (isDead) {
    // Look up at the sky when dead
    camera.rotation.set(Math.PI/2, 0, 0);
  }

  renderer.render(scene, camera);
}
animate();
