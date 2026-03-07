import * as THREE from 'three';

const socket = io(); // Connect to your server

// 1. SCENE SETUP
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb); // Sky blue
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// Add lighting and a floor
scene.add(new THREE.AmbientLight(0xffffff, 0.6));
const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
dirLight.position.set(10, 20, 10);
scene.add(dirLight);

const grid = new THREE.GridHelper(100, 100, 0x000000, 0x555555);
scene.add(grid);

// 2. PLAYER DATA
const players = {}; // Stores other players
let myId = null;
let myCube = null;

// Physics Variables
const speed = 0.15;
let playerVelocityY = 0;
const gravity = -0.015;
const jumpForce = 0.3;
let isGrounded = false;

// Input tracking
const keys = { w: false, a: false, s: false, d: false, space: false };

// 3. NETWORKING (Talking to the server)
socket.on('currentPlayers', (serverPlayers) => {
  myId = socket.id;
  for (let id in serverPlayers) {
    addPlayer(id, serverPlayers[id]);
  }
});

socket.on('newPlayer', (data) => {
  addPlayer(data.id, data.player);
});

socket.on('playerMoved', (data) => {
  if (players[data.id]) {
    players[data.id].position.set(data.x, data.y, data.z);
  }
});

socket.on('playerDisconnected', (id) => {
  if (players[id]) {
    scene.remove(players[id]);
    delete players[id];
  }
});

// Helper to spawn players
function addPlayer(id, data) {
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const mat = new THREE.MeshStandardMaterial({ color: data.color });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(data.x, data.y, data.z);
  scene.add(mesh);
  
  if (id === myId) {
    myCube = mesh; // This one is me!
  } else {
    players[id] = mesh; // These are other people
  }
}

// 4. INPUT MAPPING (PC & Mobile)
// PC Keyboards
window.addEventListener('keydown', (e) => {
  if(e.key === 'w') keys.w = true;
  if(e.key === 'a') keys.a = true;
  if(e.key === 's') keys.s = true;
  if(e.key === 'd') keys.d = true;
  if(e.key === ' ') keys.space = true;
});
window.addEventListener('keyup', (e) => {
  if(e.key === 'w') keys.w = false;
  if(e.key === 'a') keys.a = false;
  if(e.key === 's') keys.s = false;
  if(e.key === 'd') keys.d = false;
  if(e.key === ' ') keys.space = false;
});

// Mobile Buttons
const bindBtn = (id, key) => {
  const btn = document.getElementById(id);
  btn.addEventListener('touchstart', (e) => { e.preventDefault(); keys[key] = true; });
  btn.addEventListener('touchend', (e) => { e.preventDefault(); keys[key] = false; });
};
bindBtn('btn-w', 'w'); bindBtn('btn-a', 'a'); bindBtn('btn-s', 's'); bindBtn('btn-d', 'd'); bindBtn('btn-jump', 'space');

// 5. THE GAME LOOP
function animate() {
  requestAnimationFrame(animate);

  if (myCube) {
    let moved = false;

    // Movement Logic
    if (keys.w) { myCube.position.z -= speed; moved = true; }
    if (keys.s) { myCube.position.z += speed; moved = true; }
    if (keys.a) { myCube.position.x -= speed; moved = true; }
    if (keys.d) { myCube.position.x += speed; moved = true; }

    // Gravity & Jumping Logic
    playerVelocityY += gravity;
    myCube.position.y += playerVelocityY;

    // Floor collision (Stops you from falling forever)
    if (myCube.position.y <= 0.5) {
      myCube.position.y = 0.5;
      playerVelocityY = 0;
      isGrounded = true;
    } else {
      isGrounded = false;
    }

    if (keys.space && isGrounded) {
      playerVelocityY = jumpForce;
      moved = true;
    }

    // Camera follows the player slightly from behind and up
    camera.position.x = myCube.position.x;
    camera.position.y = myCube.position.y + 3;
    camera.position.z = myCube.position.z + 6;
    camera.lookAt(myCube.position);

    // Send my new position to the server so friends can see me
    if (moved || !isGrounded) {
      socket.emit('playerMovement', { x: myCube.position.x, y: myCube.position.y, z: myCube.position.z });
    }
  }

  renderer.render(scene, camera);
}
animate();
