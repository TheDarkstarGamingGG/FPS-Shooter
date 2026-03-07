import * as THREE from 'three';
window.socket = io();

// 1. UI & Device Setup
const isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
let lookSensitivity = 1.0;
let myUsername = "";

if (isTouch) {
    document.getElementById('mobile-ui').style.display = 'block';
} else {
    document.getElementById('pc-hints').style.display = 'block';
}

// Menus
const toggleMenu = (id) => {
    const el = document.getElementById(id);
    el.style.display = el.style.display === 'block' ? 'none' : 'block';
    if(!isTouch && el.style.display === 'block') document.exitPointerLock();
};

document.getElementById('btn-pause').onclick = () => toggleMenu('pause-menu');
document.getElementById('close-pause').onclick = () => toggleMenu('pause-menu');
document.getElementById('sens-slider').oninput = (e) => { 
    lookSensitivity = e.target.value; 
    document.getElementById('sens-val').innerText = lookSensitivity; 
};

// Auto-Login Exploit
if(localStorage.getItem('factMMO_u') && localStorage.getItem('factMMO_p')) {
    myUsername = localStorage.getItem('factMMO_u');
    socket.emit('login', { u: myUsername, p: localStorage.getItem('factMMO_p') });
}

document.getElementById('btn-login').addEventListener('click', () => {
    const u = document.getElementById('username').value;
    const p = document.getElementById('password').value;
    localStorage.setItem('factMMO_u', u);
    localStorage.setItem('factMMO_p', p);
    myUsername = u;
    socket.emit('login', { u, p });
});

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

const floorGeo = new THREE.PlaneGeometry(2000, 2000);
const floorMat = new THREE.MeshStandardMaterial({ color: 0x2e7d32 });
const floor = new THREE.Mesh(floorGeo, floorMat);
floor.rotation.x = -Math.PI / 2;
floor.userData = { isGround: true };
scene.add(floor);

const laserMat = new THREE.LineBasicMaterial({ color: 0xff0000, linewidth: 3 });
const laserGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0,0,0), new THREE.Vector3(0,0,0)]);
const laserLine = new THREE.Line(laserGeo, laserMat);
scene.add(laserLine);

let myOffset = { x:0, z:0 };
const interactables = [floor]; 
const otherPlayers = {};

// 3. Multiplayer & Visuals
function createNametag(name) {
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)'; ctx.fillRect(0, 0, 256, 64);
    ctx.font = '30px monospace'; ctx.fillStyle = 'white'; ctx.textAlign = 'center';
    ctx.fillText(name, 128, 40);
    const tex = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({ map: tex });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(4, 1, 1);
    sprite.position.y = 1.5;
    return sprite;
}

socket.on('initGame', (data) => {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('top-left-ui').style.display = 'flex';
    document.getElementById('hotbar').style.display = 'flex';
    myOffset = data.offset;
    camera.position.set(myOffset.x, 2, myOffset.z + 5);
    updateInv(data.inventory);
    
    // Plot Borders (100x100)
    const borderGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(100, 0.1, 100));
    const borderMat = new THREE.LineBasicMaterial({ color: 0xffffff, linewidth: 2 });
    const border = new THREE.LineSegments(borderGeo, borderMat);
    border.position.set(myOffset.x + 50, 0.05, myOffset.z + 50);
    scene.add(border);

    data.plotData.deposits.forEach(dep => {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 1, 2), new THREE.MeshStandardMaterial({ color: getCol(dep.type) }));
        mesh.position.set(myOffset.x + dep.x, 0.5, myOffset.z + dep.z);
        mesh.userData = { isDeposit: true, type: dep.type, id: dep.id };
        scene.add(mesh);
        interactables.push(mesh);
    });
});

function getCol(t) { return t==='iron'?0x777777 : t==='copper'?0xb87333 : t==='gold'?0xffd700 : 0x444444; }

// Player Networking
socket.on('playerMoved', (p) => {
    if(p.id === socket.id) return;
    if(!otherPlayers[p.id]) {
        const pGeo = new THREE.BoxGeometry(1, 2, 1);
        const pMat = new THREE.MeshStandardMaterial({ color: 0xff0000 });
        const pMesh = new THREE.Mesh(pGeo, pMat);
        pMesh.add(createNametag(p.username));
        scene.add(pMesh);
        otherPlayers[p.id] = pMesh;
    }
    otherPlayers[p.id].position.set(p.x, 1, p.z);
});
socket.on('playerLeft', (id) => {
    if(otherPlayers[id]) { scene.remove(otherPlayers[id]); delete otherPlayers[id]; }
});

// Chat System
const chatBox = document.getElementById('chat-box');
const chatMsgs = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');

document.getElementById('btn-chat-toggle').onclick = () => {
    chatBox.style.display = chatBox.style.display === 'flex' ? 'none' : 'flex';
};
chatInput.addEventListener('keypress', (e) => {
    if(e.key === 'Enter' && chatInput.value.trim() !== '') {
        socket.emit('chatMsg', chatInput.value);
        chatInput.value = '';
    }
});
socket.on('chatMsg', (msg) => {
    chatMsgs.innerHTML += `<div>${msg}</div>`;
    chatMsgs.scrollTop = chatMsgs.scrollHeight;
});

// Inventory & Hotbar Logic
let inventory = {};
let hotbarSlots = ['laser', null, null, null];
let activeSlotIdx = 0;

socket.on('updateInventory', inv => updateInv(inv));

function updateInv(inv) {
    inventory = inv;
    let invStr = '';
    
    // Auto-fill hotbar from inventory
    for(let i=1; i<4; i++) {
        if(hotbarSlots[i] && (inv[hotbarSlots[i]] || 0) <= 0) hotbarSlots[i] = null; // Clear if empty
    }
    
    for(let k in inv) {
        if(inv[k] > 0) {
            invStr += `${k}: ${inv[k]}\n`;
            // If item isn't in hotbar, and there's an empty slot, put it there
            if(!hotbarSlots.includes(k)) {
                let emptyIdx = hotbarSlots.indexOf(null);
                if(emptyIdx !== -1) hotbarSlots[emptyIdx] = k;
            }
        }
    }
    
    document.getElementById('inv-display').innerText = invStr || 'Empty';
    
    // Update Hotbar UI
    for(let i=1; i<4; i++) {
        const slotEl = document.getElementById(`slot-${i}`);
        if(hotbarSlots[i]) {
            slotEl.innerText = `${hotbarSlots[i].substring(0,6).toUpperCase()}\n(${inv[hotbarSlots[i]]})`;
        } else {
            slotEl.innerText = 'EMPTY';
        }
    }
}

document.querySelectorAll('.slot').forEach((s, idx) => {
    s.addEventListener('click', () => {
        document.querySelector('.slot.active').classList.remove('active');
        s.classList.add('active');
        activeSlotIdx = idx;
    });
});

// 4. FPS Movement & THE MULTI-TOUCH FIX
let yaw = 0, pitch = 0;
const keys = { w:false, a:false, s:false, d:false };
let joyX = 0, joyY = 0;

if (!isTouch) {
    document.addEventListener('click', (e) => { 
        if(e.target.id !== 'chat-input' && document.getElementById('login-screen').style.display === 'none') document.body.requestPointerLock(); 
    });
    document.addEventListener('mousemove', e => {
        if(document.pointerLockElement) {
            yaw -= e.movementX * 0.002 * lookSensitivity;
            pitch -= e.movementY * 0.002 * lookSensitivity;
            pitch = Math.max(-Math.PI/2.1, Math.min(Math.PI/2.1, pitch));
        }
    });
    document.addEventListener('keydown', e => {
        if(document.activeElement === chatInput) return;
        const k = e.key.toLowerCase();
        if(keys.hasOwnProperty(k)) keys[k] = true;
        if(k === 'e') toggleMenu('inventory-menu');
        if(k === 'i') toggleMenu('crafting-menu');
        if(k === 'c') { e.preventDefault(); chatBox.style.display = 'flex'; chatInput.focus(); document.exitPointerLock(); }
    });
    document.addEventListener('keyup', e => { const k = e.key.toLowerCase(); if(keys.hasOwnProperty(k)) keys[k] = false; });
    document.addEventListener('mousedown', e => { if(document.pointerLockElement && e.button === 0) doAction(); });
    document.addEventListener('mouseup', () => stopAction());
} else {
    // True Multi-Touch
    let joyTouchId = null;
    let lookTouchId = null;
    let lastLookX=0, lastLookY=0;
    
    const jBase = document.getElementById('joystick-base');
    const jStick = document.getElementById('joystick-stick');
    
    jBase.addEventListener('touchstart', e => {
        e.preventDefault(); // Stop screen dragging
        for(let i=0; i<e.changedTouches.length; i++) {
            joyTouchId = e.changedTouches[i].identifier;
        }
    });
    
    document.addEventListener('touchstart', e => {
        if(e.target.tagName === 'CANVAS') {
            for(let i=0; i<e.changedTouches.length; i++) {
                let t = e.changedTouches[i];
                if(t.identifier !== joyTouchId) {
                    lookTouchId = t.identifier;
                    lastLookX = t.clientX; lastLookY = t.clientY;
                }
            }
        }
    });

    document.addEventListener('touchmove', e => {
        for(let i=0; i<e.changedTouches.length; i++) {
            let t = e.changedTouches[i];
            
            // Handle Joystick
            if(t.identifier === joyTouchId) {
                const rect = jBase.getBoundingClientRect();
                let x = t.clientX - rect.left - 60; // 120 width, center is 60
                let y = t.clientY - rect.top - 60;
                const dist = Math.sqrt(x*x + y*y);
                if(dist > 60) { x = (x/dist)*60; y = (y/dist)*60; }
                jStick.style.transform = `translate(${x}px, ${y}px)`;
                joyX = x / 60; joyY = y / 60;
            }
            // Handle Look
            if(t.identifier === lookTouchId) {
                yaw -= (t.clientX - lastLookX) * 0.005 * lookSensitivity;
                pitch -= (t.clientY - lastLookY) * 0.005 * lookSensitivity;
                pitch = Math.max(-1.5, Math.min(1.5, pitch));
                lastLookX = t.clientX; lastLookY = t.clientY;
            }
        }
    });
    
    jBase.addEventListener('touchend', e => {
        for(let i=0; i<e.changedTouches.length; i++) {
            if(e.changedTouches[i].identifier === joyTouchId) {
                joyTouchId = null; joyX = 0; joyY = 0; jStick.style.transform = `translate(0px, 0px)`;
            }
        }
    });
    document.addEventListener('touchend', e => {
        for(let i=0; i<e.changedTouches.length; i++) {
            if(e.changedTouches[i].identifier === lookTouchId) lookTouchId = null;
        }
    });

    const aBtn = document.getElementById('action-btn');
    aBtn.addEventListener('touchstart', () => doAction());
    aBtn.addEventListener('touchend', () => stopAction());
}

// 5. Action Logic
const raycaster = new THREE.Raycaster();
let isActing = false;

function doAction() {
    isActing = true;
    raycaster.setFromCamera(new THREE.Vector2(0,0), camera);
    const hits = raycaster.intersectObjects(interactables);
    
    if(hits.length > 0 && hits[0].distance < 15) {
        const hit = hits[0];
        const obj = hit.object;
        const tool = hotbarSlots[activeSlotIdx];

        if (tool === 'laser' && obj.userData.isDeposit) {
            socket.emit('startMining', obj.userData.type);
        } 
        else if (tool && tool.includes('drill') && obj.userData.isDeposit) {
            socket.emit('placeMachine', { type: tool, x: obj.position.x, y: 1.5, z: obj.position.z });
            isActing = false; 
        }
        else if (tool && (tool.includes('furnace') || tool.includes('station')) && obj.userData.isGround) {
            socket.emit('placeMachine', { type: tool, x: hit.point.x, y: 1, z: hit.point.z });
            isActing = false;
        }
    }
}

function stopAction() {
    isActing = false;
    laserLine.geometry.setFromPoints([new THREE.Vector3(0,0,0), new THREE.Vector3(0,0,0)]);
    socket.emit('stopMining');
}

// 6. Loop & Net Send
setInterval(() => {
    if(document.getElementById('login-screen').style.display === 'none') {
        socket.emit('move', { x: camera.position.x, z: camera.position.z });
    }
}, 50); // Send position 20 times a second

function animate() {
    requestAnimationFrame(animate);
    camera.rotation.set(pitch, yaw, 0, 'YXZ');
    
    const dir = new THREE.Vector3(); camera.getWorldDirection(dir); dir.y = 0; dir.normalize();
    const side = new THREE.Vector3().crossVectors(camera.up, dir).normalize();
    
    let moveZ = (keys.w ? 1 : 0) - (keys.s ? 1 : 0) - joyY;
    let moveX = (keys.a ? 1 : 0) - (keys.d ? 1 : 0) - joyX;
    
    const speed = 0.2;
    if(moveZ !== 0) camera.position.addScaledVector(dir, moveZ * speed);
    if(moveX !== 0) camera.position.addScaledVector(side, moveX * speed);

    if(isActing && activeSlotIdx === 0) {
        raycaster.setFromCamera(new THREE.Vector2(0,0), camera);
        const hits = raycaster.intersectObjects(interactables);
        if(hits.length > 0 && hits[0].object.userData.isDeposit) {
            laserLine.geometry.setFromPoints([camera.position.clone().add(new THREE.Vector3(0,-0.5,0)), hits[0].point]);
        } else stopAction();
    }

    // Make nametags face camera
    for(let id in otherPlayers) {
        otherPlayers[id].children[0].quaternion.copy(camera.quaternion);
    }

    renderer.render(scene, camera);
}
animate();
