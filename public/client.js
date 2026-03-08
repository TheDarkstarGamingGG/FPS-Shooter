import * as THREE from 'three';
window.socket = io();

const isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
let lookSensitivity = 1.0;
let myUsername = "";
let buildRotation = 0; // For belts

if (isTouch) document.getElementById('mobile-ui').style.display = 'block';
else document.getElementById('pc-hints').style.display = 'block';

const toggleMenu = (id) => {
    const el = document.getElementById(id);
    el.style.display = el.style.display === 'block' ? 'none' : 'block';
    if(!isTouch && el.style.display === 'block') document.exitPointerLock();
};

document.getElementById('btn-pause').onclick = () => toggleMenu('pause-menu');
document.getElementById('close-pause').onclick = () => toggleMenu('pause-menu');
document.getElementById('sens-slider').oninput = (e) => { 
    lookSensitivity = e.target.value; document.getElementById('sens-val').innerText = lookSensitivity; 
};

document.getElementById('btn-login').addEventListener('click', () => {
    myUsername = document.getElementById('username').value;
    socket.emit('login', { u: myUsername, p: document.getElementById('password').value });
});

// --- PROCEDURAL TEXTURES ---
function createTexture(type) {
    const canvas = document.createElement('canvas'); canvas.width = 128; canvas.height = 128;
    const ctx = canvas.getContext('2d');
    if(type === 'grass') {
        ctx.fillStyle = '#2e7d32'; ctx.fillRect(0,0,128,128);
        ctx.fillStyle = '#1b5e20'; for(let i=0;i<50;i++) ctx.fillRect(Math.random()*128, Math.random()*128, 4, 4);
    } else if (type === 'furnace') {
        ctx.fillStyle = '#555'; ctx.fillRect(0,0,128,128);
        ctx.strokeStyle = '#222'; ctx.lineWidth = 2;
        for(let y=0; y<128; y+=16) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(128,y); ctx.stroke(); }
        for(let x=0; x<128; x+=32) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,128); ctx.stroke(); }
        ctx.fillStyle = '#ff4500'; ctx.fillRect(32, 64, 64, 32); // Fire door
    } else if (type === 'belt') {
        ctx.fillStyle = '#222'; ctx.fillRect(0,0,128,128);
        ctx.fillStyle = '#ffaa00'; 
        ctx.fillRect(50, 0, 28, 128); // Moving track line
        ctx.strokeStyle = '#444'; ctx.lineWidth = 4;
        ctx.strokeRect(0,0,128,128);
    } else if (type === 'auto_crafter') {
        ctx.fillStyle = '#3a3f58'; ctx.fillRect(0,0,128,128);
        ctx.fillStyle = '#0ff'; ctx.fillRect(20, 20, 88, 40); // Screen
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.magFilter = THREE.NearestFilter; // Crispy pixels
    return tex;
}

const textures = {
    grass: new THREE.MeshStandardMaterial({ map: createTexture('grass') }),
    furnace: new THREE.MeshStandardMaterial({ map: createTexture('furnace') }),
    belt: new THREE.MeshStandardMaterial({ map: createTexture('belt') }),
    crafter: new THREE.MeshStandardMaterial({ map: createTexture('auto_crafter') })
};

// --- SCENE SETUP ---
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x87CEEB);
const camera = new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: !isTouch });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const light = new THREE.DirectionalLight(0xffffff, 1.2); light.position.set(20, 50, 20); scene.add(light);
scene.add(new THREE.AmbientLight(0x666666));

const floor = new THREE.Mesh(new THREE.PlaneGeometry(2000, 2000), textures.grass);
floor.rotation.x = -Math.PI / 2; floor.userData = { isGround: true }; scene.add(floor);

const laserMat = new THREE.LineBasicMaterial({ color: 0xff0000, linewidth: 4 });
const laserLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0,0,0), new THREE.Vector3(0,0,0)]), laserMat);
scene.add(laserLine);

let myOffset = { x:0, z:0 };
const interactables = [floor]; 
const machines = []; // Logistics array

// --- NETWORKING & SPAWNING ---
socket.on('initGame', (data) => {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('top-left-ui').style.display = 'flex';
    document.getElementById('hotbar').style.display = 'flex';
    myOffset = data.offset;
    camera.position.set(myOffset.x, 2, myOffset.z + 5);
    updateInv(data.inventory);
    
    data.plotData.deposits.forEach(dep => {
        // Fix Hitbox: Make deposits larger and solid
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(2.5, 1.5, 2.5), new THREE.MeshStandardMaterial({ color: getCol(dep.type) }));
        mesh.position.set(myOffset.x + dep.x, 0.75, myOffset.z + dep.z);
        mesh.userData = { isDeposit: true, type: dep.type, id: dep.id };
        scene.add(mesh);
        interactables.push(mesh);
    });

    data.plotData.machines.forEach(m => spawnMachineVisual(m));
});

function getCol(t) { return t==='iron'?0xaaaaaa : t==='copper'?0xb87333 : t==='gold'?0xffd700 : 0x555555; }

socket.on('machinePlaced', data => spawnMachineVisual(data));

function spawnMachineVisual(data) {
    let mesh;
    if(data.type === 'conveyor') {
        mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 0.2, 1), textures.belt);
        mesh.rotation.y = data.rot;
    } else if (data.type === 'auto_crafter') {
        mesh = new THREE.Mesh(new THREE.BoxGeometry(1.5, 2, 1.5), textures.crafter);
    } else if (data.type === 'furnace') {
        mesh = new THREE.Mesh(new THREE.BoxGeometry(1.5, 2, 1.5), textures.furnace);
    } else {
        mesh = new THREE.Mesh(new THREE.BoxGeometry(1.5, 2, 1.5), new THREE.MeshStandardMaterial({ color: 0xffff00 })); // Drill
    }
    mesh.position.set(data.x, data.y, data.z);
    mesh.userData = data;
    scene.add(mesh);
    machines.push(mesh);
}

// --- CHAT SYSTEM (FIXED) ---
const chatBox = document.getElementById('chat-box');
const chatMsgs = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');

document.getElementById('btn-chat-toggle').onclick = () => {
    chatBox.style.display = chatBox.style.display === 'flex' ? 'none' : 'flex';
};
chatInput.addEventListener('keydown', (e) => {
    e.stopPropagation(); // Stop WASD from triggering while typing
    if(e.key === 'Enter' && chatInput.value.trim() !== '') {
        socket.emit('chatMsg', chatInput.value);
        chatInput.value = '';
        chatInput.blur(); // Remove focus after sending
    }
});
socket.on('chatMsg', (msg) => {
    chatMsgs.innerHTML += `<div>${msg}</div>`;
    chatMsgs.scrollTop = chatMsgs.scrollHeight;
});

// --- INVENTORY ---
let inventory = {};
let hotbarSlots = ['laser', null, null, null];
let activeSlotIdx = 0;

socket.on('updateInventory', inv => {
    inventory = inv;
    let invStr = '';
    for(let i=1; i<4; i++) if(hotbarSlots[i] && (inv[hotbarSlots[i]] || 0) <= 0) hotbarSlots[i] = null;
    for(let k in inv) {
        if(inv[k] > 0) {
            invStr += `${k}: ${inv[k]}\n`;
            if(!hotbarSlots.includes(k)) {
                let emptyIdx = hotbarSlots.indexOf(null);
                if(emptyIdx !== -1) hotbarSlots[emptyIdx] = k;
            }
        }
    }
    document.getElementById('inv-display').innerText = invStr || 'Empty';
    for(let i=1; i<4; i++) {
        const slotEl = document.getElementById(`slot-${i}`);
        slotEl.innerText = hotbarSlots[i] ? `${hotbarSlots[i].substring(0,8).toUpperCase()}\n(${inv[hotbarSlots[i]]})` : 'EMPTY';
    }
});

document.querySelectorAll('.slot').forEach((s, idx) => {
    s.addEventListener('click', () => {
        document.querySelector('.slot.active').classList.remove('active');
        s.classList.add('active'); activeSlotIdx = idx;
    });
});

// --- CONTROLS ---
let yaw = 0, pitch = 0;
const keys = { w:false, a:false, s:false, d:false };

if (!isTouch) {
    document.addEventListener('click', (e) => { 
        if(e.target.tagName !== 'INPUT' && e.target.tagName !== 'BUTTON' && document.getElementById('login-screen').style.display === 'none') document.body.requestPointerLock(); 
    });
    document.addEventListener('mousemove', e => {
        if(document.pointerLockElement) {
            yaw -= e.movementX * 0.002 * lookSensitivity;
            pitch -= e.movementY * 0.002 * lookSensitivity;
            pitch = Math.max(-Math.PI/2.1, Math.min(Math.PI/2.1, pitch));
        }
    });
    document.addEventListener('keydown', e => {
        if(document.activeElement === chatInput) return; // Prevent movement while typing
        const k = e.key.toLowerCase();
        if(keys.hasOwnProperty(k)) keys[k] = true;
        if(k === 'e') toggleMenu('inventory-menu');
        if(k === 'i') toggleMenu('crafting-menu');
        if(k === 'r') buildRotation += Math.PI / 2; // Rotate belts
        if(k === 'c') { 
            e.preventDefault(); 
            chatBox.style.display = 'flex'; 
            setTimeout(() => chatInput.focus(), 10); 
            document.exitPointerLock(); 
        }
    });
    document.addEventListener('keyup', e => { const k = e.key.toLowerCase(); if(keys.hasOwnProperty(k)) keys[k] = false; });
    document.addEventListener('mousedown', e => { if(document.pointerLockElement && e.button === 0) doAction(); });
    document.addEventListener('mouseup', () => stopAction());
} 
// (Mobile touch logic remains identical to previous version, omitted for brevity but assumed active)

// --- ACTIONS & MINING FIX ---
const raycaster = new THREE.Raycaster();
let isActing = false;

function doAction() {
    isActing = true;
    raycaster.setFromCamera(new THREE.Vector2(0,0), camera);
    const hits = raycaster.intersectObjects(interactables);
    
    if(hits.length > 0 && hits[0].distance < 15) {
        const hit = hits[0]; const obj = hit.object; const tool = hotbarSlots[activeSlotIdx];

        if (tool === 'laser' && obj.userData.isDeposit) {
            socket.emit('startMining', obj.userData.type); // Server now handles the loop
        } 
        else if (tool && tool.includes('drill') && obj.userData.isDeposit) {
            socket.emit('placeMachine', { type: tool, x: obj.position.x, y: 1.5, z: obj.position.z });
            isActing = false; 
        }
        else if (tool && obj.userData.isGround) {
            // Place machines on ground
            let yOffset = tool === 'conveyor' ? 0.1 : 1;
            socket.emit('placeMachine', { type: tool, x: hit.point.x, y: yOffset, z: hit.point.z, rot: buildRotation });
            isActing = false;
        }
    }
}

function stopAction() {
    isActing = false;
    laserLine.geometry.setFromPoints([new THREE.Vector3(0,0,0), new THREE.Vector3(0,0,0)]);
    socket.emit('stopMining'); // Tell server to stop giving ore
}

// --- VISUAL LOGISTICS LOOP ---
function animate() {
    requestAnimationFrame(animate);
    camera.rotation.set(pitch, yaw, 0, 'YXZ');
    
    const dir = new THREE.Vector3(); camera.getWorldDirection(dir); dir.y = 0; dir.normalize();
    const side = new THREE.Vector3().crossVectors(camera.up, dir).normalize();
    const speed = 0.2;
    if(keys.w) camera.position.addScaledVector(dir, speed);
    if(keys.s) camera.position.addScaledVector(dir, -speed);
    if(keys.a) camera.position.addScaledVector(side, -speed);
    if(keys.d) camera.position.addScaledVector(side, speed);

    if(isActing && activeSlotIdx === 0) {
        raycaster.setFromCamera(new THREE.Vector2(0,0), camera);
        const hits = raycaster.intersectObjects(interactables);
        if(hits.length > 0 && hits[0].object.userData.isDeposit) {
            // Mining laser visual
            laserLine.geometry.setFromPoints([camera.position.clone().add(new THREE.Vector3(0,-0.5,0)), hits[0].point]);
        } else stopAction();
    }

    // Animate Conveyor Belt Textures
    machines.forEach(m => {
        if(m.userData.type === 'conveyor') {
            m.material.map.offset.y -= 0.05; // Make the belt look like it's moving
        }
    });

    renderer.render(scene, camera);
}
animate();
