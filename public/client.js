import * as THREE from 'three';
window.socket = io();

// 1. Scene Setup
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87CEEB); // Sky Blue
const camera = new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// Lighting
const ambient = new THREE.AmbientLight(0xffffff, 0.7);
scene.add(ambient);
const sun = new THREE.DirectionalLight(0xffffff, 1);
sun.position.set(5, 10, 5);
scene.add(sun);

// 2. The Floor (Fixes the "Grey World")
const floorGeo = new THREE.PlaneGeometry(1000, 1000);
const floorMat = new THREE.MeshStandardMaterial({ color: 0x2e7d32 }); // Grass Green
const floor = new THREE.Mesh(floorGeo, floorMat);
floor.rotation.x = -Math.PI / 2;
scene.add(floor);

// 3. UI Toggle Logic
const craftBtn = document.getElementById('toggle-craft');
const craftMenu = document.getElementById('crafting-menu');
craftBtn.onclick = () => {
    const isHidden = craftMenu.style.display === 'none' || craftMenu.style.display === '';
    craftMenu.style.display = isHidden ? 'block' : 'none';
};

// 4. Game Logic
let myOffset = { x:0, z:0 };
const interactables = [];

window.login = () => {
    const u = document.getElementById('username').value;
    const p = document.getElementById('password').value;
    socket.emit('login', { username: u, password: p });
};

socket.on('initGame', (data) => {
    document.getElementById('login-screen').style.display = 'none';
    myOffset = data.offset;
    // Spawn camera ABOVE ground
    camera.position.set(myOffset.x, 2, myOffset.z + 10);
    
    data.plotData.deposits.forEach(dep => {
        const mesh = new THREE.Mesh(
            new THREE.BoxGeometry(2, 1, 2),
            new THREE.MeshStandardMaterial({ color: getCol(dep.type) })
        );
        mesh.position.set(myOffset.x + dep.x, 0.5, myOffset.z + dep.z);
        mesh.userData = { type: dep.type };
        scene.add(mesh);
        interactables.push(mesh);
    });
});

function getCol(t) {
    if(t === 'iron') return 0x777777;
    if(t === 'copper') return 0xb87333;
    if(t === 'gold') return 0xffd700;
    return 0x555555;
}

// 5. Controls & Animation
let yaw = 0, pitch = 0;
document.addEventListener('touchmove', (e) => {
    const touch = e.touches[0];
    if(e.target.tagName === 'CANVAS') {
        yaw -= (touch.clientX - (window.innerWidth/2)) * 0.0001;
        pitch -= (touch.clientY - (window.innerHeight/2)) * 0.0001;
        pitch = Math.max(-1.5, Math.min(1.5, pitch));
    }
});

function animate() {
    requestAnimationFrame(animate);
    camera.rotation.set(pitch, yaw, 0, 'YXZ');
    renderer.render(scene, camera);
}
animate();
