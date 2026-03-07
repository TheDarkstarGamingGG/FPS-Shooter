const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

app.use(express.static('public'));

// --- DATABASE SETUP ---
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost/factory').then(() => console.log('MongoDB Connected!'));

const PlayerSchema = new mongoose.Schema({
  username: { type: String, unique: true },
  password: { type: String },
  inventory: {
    stone: { type: Number, default: 0 }, iron_ore: { type: Number, default: 0 },
    copper_ore: { type: Number, default: 0 }, gold_ore: { type: Number, default: 0 },
    iron_ingot: { type: Number, default: 0 }, copper_ingot: { type: Number, default: 0 },
    gold_ingot: { type: Number, default: 0 }, bolts: { type: Number, default: 0 },
    wire: { type: Number, default: 0 }, furnace: { type: Number, default: 0 }, drill: { type: Number, default: 0 }, crafting_station: { type: Number, default: 0 }
  },
  plotData: {
    deposits: Array, // [{ type, x, z, id }]
    machines: Array  // [{ type, x, z, depositId }]
  }
});
const Player = mongoose.model('Player', PlayerSchema);

// --- SERVER STATE ---
const ROOM_MAX = 6;
const PLOT_SIZE = 100;
const rooms = {}; // e.g., { 'room_1': { activePlayers: 0, plotsTaken: [0, 1] } }
const connectedPlayers = {}; // Maps socket.id to game data

// 6 Plot Offsets
const plotOffsets = [
  { x: 0, z: 0 }, { x: PLOT_SIZE, z: 0 }, { x: PLOT_SIZE * 2, z: 0 },
  { x: 0, z: PLOT_SIZE }, { x: PLOT_SIZE, z: PLOT_SIZE }, { x: PLOT_SIZE * 2, z: PLOT_SIZE }
];



// --- GAME LOGIC ---
const RECIPES = {
  furnace: { stone: 10 },
  iron_ingot: { iron_ore: 1 }, copper_ingot: { copper_ore: 1 }, gold_ingot: { gold_ore: 1 },
  bolts: { iron_ingot: 1 }, wire: { copper_ingot: 1 }, // Note: User wanted 1 ingot -> 3 wires, handled below
  crafting_station: { bolts: 10, iron_ingot: 5 },
  drill: { wire: 5, bolts: 10, gold_ingot: 1 }
};

io.on('connection', (socket) => {
  console.log('Connection:', socket.id);

  socket.on('login', async (data) => {
    let user = await Player.findOne({ username: data.username });
    
    // Create account if new
    if (!user) {
      const hash = await bcrypt.hash(data.password, 10);
      user = new Player({ username: data.username, password: hash });
      
      // Generate initial deposits around center (0,0 of their local plot)
      const types = ['iron', 'copper', 'gold', 'stone'];
      user.plotData = { deposits: [], machines: [] };
      types.forEach((t, i) => {
        user.plotData.deposits.push({ type: t, id: `dep_${i}`, x: Math.random()*40 - 20, z: Math.random()*40 - 20 });
      });
      await user.save();
    } else {
      // Verify password
      const valid = await bcrypt.compare(data.password, user.password);
      if (!valid) return socket.emit('loginError', 'Wrong password');
    }

    // Find a room
    let roomName = 'room_1';
    let roomNum = 1;
    while (rooms[roomName] && rooms[roomName].activePlayers >= ROOM_MAX) {
      roomNum++; roomName = `room_${roomNum}`;
    }
    if (!rooms[roomName]) rooms[roomName] = { activePlayers: 0, plotsTaken: [] };

    // Assign Plot
    let myPlotIndex = rooms[roomName].plotsTaken.length;
    rooms[roomName].plotsTaken.push(user.username);
    rooms[roomName].activePlayers++;
    
    const myOffset = plotOffsets[myPlotIndex];
    socket.join(roomName);
    
    connectedPlayers[socket.id] = { dbId: user._id, username: user.username, room: roomName, offset: myOffset, inventory: user.inventory, plotData: user.plotData };

    // Tell everyone in the room about the new factory, and tell the player about the room
    socket.emit('initGame', { offset: myOffset, plotData: user.plotData, inventory: user.inventory });
    socket.broadcast.to(roomName).emit('spawnPlot', { username: user.username, offset: myOffset, plotData: user.plotData });
  });

  // MINING LOGIC
  let miningTimer = null;
  socket.on('startMining', (depositType) => {
    const p = connectedPlayers[socket.id];
    if(!p || p.isMining) return;
    p.isMining = true;
    
    miningTimer = setInterval(async () => {
      if(p.isMining) {
        p.inventory[`${depositType}_ore`] = (p.inventory[`${depositType}_ore`] || 0) + 1;
        socket.emit('updateInventory', p.inventory);
        await Player.updateOne({ _id: p.dbId }, { inventory: p.inventory });
      }
    }, 2000); // 2 seconds per ore
  });
  
  socket.on('stopMining', () => {
    if(connectedPlayers[socket.id]) connectedPlayers[socket.id].isMining = false;
    clearInterval(miningTimer);
  });

  // CRAFTING LOGIC
  socket.on('craft', async (item) => {
    const p = connectedPlayers[socket.id];
    if(!p) return;
    const recipe = RECIPES[item];
    if(!recipe) return;

    // Check if they have materials
    let canCraft = true;
    for (let mat in recipe) { if ((p.inventory[mat] || 0) < recipe[mat]) canCraft = false; }
    
    if (canCraft) {
      for (let mat in recipe) { p.inventory[mat] -= recipe[mat]; }
      if (item === 'wire') { p.inventory.wire += 3; } // Special case: 1 ingot = 3 wires
      else { p.inventory[item] += 1; }
      
      socket.emit('updateInventory', p.inventory);
      await Player.updateOne({ _id: p.dbId }, { inventory: p.inventory });
    }
  });

  socket.on('disconnect', () => {
    const p = connectedPlayers[socket.id];
    if (p) {
      rooms[p.room].activePlayers--;
      clearInterval(miningTimer);
      // Despawn plot for others
      io.to(p.room).emit('despawnPlot', p.username);
      delete connectedPlayers[socket.id];
    }
  });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => console.log(`Server on port ${PORT}`));
