import * as THREE from 'three';
window.socket = io();

// 1. Device Detection & UI
const isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
if (isTouch) {
    document.getElementById('mobile-ui').style.display = 'block';
} else {
    document.getElementById('pc-hints').style.display = 'block';
}

const invMenu = document.getElementById('inventory-menu');
const craftMenu = document.getElementById('crafting-menu');
let activeTool = 'laser';
let inventory = {};

// 2. Scene Setup
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87CEEB);
const camera = new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: !isTouch });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const light = new THREE.DirectionalLight(0xffffff, 1.2);
light.position.set(20, 50, 20);
scene.add(light);
scene.add(new THREE.AmbientLight(0x666666));

// The Ground (Tagged for Raycasting)
const floorGeo = new THREE.PlaneGeometry(1000, 1000);
const floorMat = new THREE.MeshStandardMaterial({ color: 0x2e7d32 });
const floor = new THREE.Mesh(floorGeo, floorMat);
floor.rotation.x = -Math.PI / 2;
floor.userData = { isGround: true };
scene.add(floor);

// Laser Visual
const laserMat = new THREE.LineBasicMaterial({ color: 0xff0000, linewidth: 3 });
const laserGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0,0,0), new THREE.Vector3(0,0,0)]);
const laserLine = new THREE.Line(laserGeo, laserMat);
scene.add(laserLine);

// Game State
let myOffset = { x:0, z:0 };
const interactables = [floor]; 

// Build the World
socket.on('initGame', (data) => {
    document.getElementById('login-screen').style.display = 'none';
    myOffset = data.offset;
    camera.position.set(myOffset.x, 2, myOffset.z + 5);
    updateInv(data.inventory);
    
    // Spawn Deposits
    data.plotData.deposits.forEach(dep => {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 1, 2), new THREE.MeshStandardMaterial({ color: getCol(dep.type) }));
        mesh.position.set(myOffset.x + dep.x, 0.5, myOffset.z + dep.z);
        mesh.userData = { isDeposit: true, type: dep.type, id: dep.id };
        scene.add(mesh);
        interactables.push(mesh);
    });

    // Spawn Pre-existing Machines
    data.plotData.machines.forEach(m => spawnMachineVisual(m));
});

function getCol(t) { return t==='iron'?0x777777 : t==='copper'?0xb87333 : t==='gold'?0xffd700 : 0x444444; }

socket.on('updateInventory', inv => updateInv(inv));
socket.on('machinePlaced', data => spawnMachineVisual(data));

function updateInv(inv) {
    inventory = inv;
    let str = ''; for(let k in inv) if(inv[k]>0) str += `${k}: ${inv[k]}\n`;
    document.getElementById('inv-display').innerText = str || 'Empty';
    document.getElementById('c-drill').innerText = inv.drill || 0;
    document.getElementById('c-furnace').innerText = inv.furnace || 0;
    document.getElementById('c-station').innerText = inv.crafting_station || 0;
}

function spawnMachineVisual(data) {
    let geo = new THREE.BoxGeometry(1.5, 2, 1.5);
    let col = data.type === 'drill' ? 0xffff00 : data.type === 'furnace' ? 0x888888 : 0x0000ff;
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: col }));
    mesh.position.set(data.x, data.y, data.z);
    scene.add(mesh);
}

// 3. FPS Movement & Look Logic
let yaw = 0, pitch = 0;
const keys = { w:false, a:false, s:false, d:false };
let joyX = 0, joyY = 0;

if (!isTouch) {
    // PC Pointer Lock & Keyboard
    document.addEventListener('click', () => { if(document.getElementById('login-screen').style.display === 'none') document.body.requestPointerLock(); });
    document.addEventListener('mousemove', e => {
        if(document.pointerLockElement) {
            yaw -= e.movementX * 0.002;
            pitch -= e.movementY * 0.002;
            pitch = Math.max(-Math.PI/2.1, Math.min(Math.PI/2.1, pitch));
        }
    });
    document.addEventListener('keydown', e => {
        const k = e.key.toLowerCase();
        if(keys.hasOwnProperty(k)) keys[k] = true;
        if(k === 'e') { invMenu.style.display = invMenu.style.display==='block'?'none':'block'; document.exitPointerLock(); }
        if(k === 'i') { craftMenu.style.display = craftMenu.style.display==='block'?'none':'block'; document.exitPointerLock(); }
    });
    document.addEventListener('keyup', e => { const k = e.key.toLowerCase(); if(keys.hasOwnProperty(k)) keys[k] = false; });
    document.addEventListener('mousedown', e => { if(document.pointerLockElement && e.button === 0) doAction(); });
    document.addEventListener('mouseup', () => stopAction());
} else {
    // Mobile Joystick & Swipe
    let lastX=0, lastY=0;
    document.addEventListener('touchstart', e => { if(e.target.tagName === 'CANVAS') { lastX = e.touches[0].clientX; lastY = e.touches[0].clientY; }});
    document.addEventListener('touchmove', e => {
        if(e.target.tagName === 'CANVAS') {
            const t = e.touches[0];
            yaw -= (t.clientX - lastX) * 0.005;  // DELTA movement!
            pitch -= (t.clientY - lastY) * 0.005;
            pitch = Math.max(-1.5, Math.min(1.5, pitch));
            lastX = t.clientX; lastY = t.clientY;
        }
    });
    
    const jBase = document.getElementById('joystick-base');
    const jStick = document.getElementById('joystick-stick');
    jBase.addEventListener('touchmove', e => {
        const rect = jBase.getBoundingClientRect();
        const touch = e.touches[0];
        let x = touch.clientX - rect.left - 50; // Center is 50,50
        let y = touch.clientY - rect.top - 50;
        const dist = Math.sqrt(x*x + y*y);
        if(dist > 50) { x = (x/dist)*50; y = (y/dist)*50; } // Clamp to circle
        jStick.style.transform = `translate(${x}px, ${y}px)`;
        joyX = x / 50; joyY = y / 50; // Normalize -1 to 1
    });
    jBase.addEventListener('touchend', () => { joyX = 0; joyY = 0; jStick.style.transform = `translate(0px, 0px)`; });

    const aBtn = document.getElementById('action-btn');
    aBtn.addEventListener('touchstart', () => doAction());
    aBtn.addEventListener('touchend', () => stopAction());
}

// Hotbar Logic
document.querySelectorAll('.slot').forEach(s => {
    s.addEventListener('click', () => {
        document.querySelector('.slot.active').classList.remove('active');
        s.classList.add('active');
        activeTool = s.dataset.tool;
    });
});

// 4. Action & Raycasting Logic
const raycaster = new THREE.Raycaster();
let isActing = false;

function doAction() {
    isActing = true;
    raycaster.setFromCamera(new THREE.Vector2(0,0), camera);
    const hits = raycaster.intersectObjects(interactables);
    
    if(hits.length > 0 && hits[0].distance < 15) {
        const hit = hits[0];
        const obj = hit.object;

        if (activeTool === 'laser' && obj.userData.isDeposit) {
            socket.emit('startMining', obj.userData.type);
        } 
        else if (activeTool === 'drill' && obj.userData.isDeposit) {
            // Place Drill ON Deposit
            if((inventory.drill || 0) > 0) {
                socket.emit('placeMachine', { type: 'drill', x: obj.position.x, y: 1.5, z: obj.position.z, depositId: obj.userData.id });
                isActing = false; // Prevent spamming
            }
        }
        else if ((activeTool === 'furnace' || activeTool === 'crafting_station') && obj.userData.isGround) {
            // Place on Ground
            if((inventory[activeTool] || 0) > 0) {
                socket.emit('placeMachine', { type: activeTool, x: hit.point.x, y: 1, z: hit.point.z });
                isActing = false;
            }
        }
    }
}

function stopAction() {
    isActing = false;
    laserLine.geometry.setFromPoints([new THREE.Vector3(0,0,0), new THREE.Vector3(0,0,0)]);
    socket.emit('stopMining');
}

document.getElementById('btn-login').addEventListener('click', () => {
    socket.emit('login', { u: document.getElementById('username').value, p: document.getElementById('password').value });
});

// 5. Game Loop
function animate() {
    requestAnimationFrame(animate);
    camera.rotation.set(pitch, yaw, 0, 'YXZ');
    
    const dir = new THREE.Vector3(); camera.getWorldDirection(dir); dir.y = 0; dir.normalize();
    const side = new THREE.Vector3().crossVectors(camera.up, dir).normalize();
    
    // Combine PC and Mobile inputs
    let moveZ = (keys.w ? 1 : 0) - (keys.s ? 1 : 0) - joyY;
    let moveX = (keys.a ? 1 : 0) - (keys.d ? 1 : 0) - joyX;
    
    const speed = 0.2;
    if(moveZ !== 0) camera.position.addScaledVector(dir, moveZ * speed);
    if(moveX !== 0) camera.position.addScaledVector(side, moveX * speed);

    if(isActing && activeTool === 'laser') {
        raycaster.setFromCamera(new THREE.Vector2(0,0), camera);
        const hits = raycaster.intersectObjects(interactables);
        if(hits.length > 0 && hits[0].object.userData.isDeposit) {
            laserLine.geometry.setFromPoints([camera.position.clone().add(new THREE.Vector3(0,-0.5,0)), hits[0].point]);
        } else stopAction();
    }

    renderer.render(scene, camera);
}
animate();
