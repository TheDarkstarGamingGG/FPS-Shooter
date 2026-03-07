const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

app.use(express.static('public'));

mongoose.connect(process.env.MONGODB_URI).then(() => console.log('MongoDB Connected!'));

const PlayerSchema = new mongoose.Schema({
  username: { type: String, unique: true },
  password: { type: String },
  inventory: { type: Object, default: {} },
  plotData: { deposits: Array, machines: Array }
});
const Player = mongoose.model('Player', PlayerSchema);

const PLOT_SIZE = 100;
const plotOffsets = [ {x:0,z:0}, {x:PLOT_SIZE,z:0}, {x:PLOT_SIZE*2,z:0}, {x:0,z:PLOT_SIZE}, {x:PLOT_SIZE,z:PLOT_SIZE}, {x:PLOT_SIZE*2,z:PLOT_SIZE} ];
const activeRooms = {}; 
const playerPositions = {}; // Network tracking

const RECIPES = {
    furnace: { stone: 10 }, iron_ingot: { iron_ore: 1 }, copper_ingot: { copper_ore: 1 }, gold_ingot: { gold_ore: 1 },
    bolts: { iron_ingot: 1 }, wire: { copper_ingot: 1 }, crafting_station: { bolts: 10, iron_ingot: 5 }, drill: { wire: 5, bolts: 10, gold_ingot: 1 }
};

io.on('connection', (socket) => {
  socket.on('login', async (data) => {
    try {
      let user = await Player.findOne({ username: data.u });
      if (!user) {
        const hash = await bcrypt.hash(data.p, 10);
        user = new Player({ 
            username: data.u, password: hash,
            plotData: { deposits: [{ type: 'iron', id: 'd1', x: 20, z: 20 }, { type: 'copper', id: 'd2', x: 80, z: 20 }, { type: 'gold', id: 'd3', x: 80, z: 80 }, { type: 'stone', id: 'd4', x: 20, z: 80 }], machines: [] } 
        });
        await user.save();
      } else {
        const valid = await bcrypt.compare(data.p, user.password);
        if (!valid) return socket.emit('loginError', 'Invalid Password');
      }

      let roomName = 'room_1';
      if(!activeRooms[roomName]) activeRooms[roomName] = [];
      let myIndex = activeRooms[roomName].indexOf(user._id.toString());
      if(myIndex === -1) { myIndex = activeRooms[roomName].length; activeRooms[roomName].push(user._id.toString()); }
      
      socket.join(roomName);
      socket.userData = { dbId: user._id, room: roomName, inventory: user.inventory, plotData: user.plotData, username: data.u };

      socket.emit('initGame', { offset: plotOffsets[myIndex], plotData: user.plotData, inventory: user.inventory });
      
      // Announce to chat
      io.to(roomName).emit('chatMsg', `<i><span style="color:#0f0">${data.u} joined the server.</span></i>`);
    } catch (e) { console.log(e); }
  });

  // MULTIPLAYER MOVEMENT SYNC
  socket.on('move', (pos) => {
      if(!socket.userData) return;
      playerPositions[socket.id] = { id: socket.id, username: socket.userData.username, x: pos.x, z: pos.z };
      socket.to(socket.userData.room).emit('playerMoved', playerPositions[socket.id]);
  });

  socket.on('chatMsg', (msg) => {
      if(!socket.userData) return;
      io.to(socket.userData.room).emit('chatMsg', `<b>${socket.userData.username}:</b> ${msg}`);
  });

  socket.on('startMining', async (type) => {
    if(!socket.userData) return;
    socket.userData.inventory[type + '_ore'] = (socket.userData.inventory[type + '_ore'] || 0) + 1;
    socket.emit('updateInventory', socket.userData.inventory);
    await Player.updateOne({_id: socket.userData.dbId}, {inventory: socket.userData.inventory});
  });

  socket.on('craft', async (item) => {
    if(!socket.userData || !RECIPES[item]) return;
    let inv = socket.userData.inventory;
    const reqs = RECIPES[item];
    
    let canCraft = true;
    for(let k in reqs) if((inv[k]||0) < reqs[k]) canCraft = false;
    
    if(canCraft) {
        for(let k in reqs) inv[k] -= reqs[k];
        if(item === 'wire') inv.wire = (inv.wire||0) + 3;
        else inv[item] = (inv[item]||0) + 1;
        socket.emit('updateInventory', inv);
        await Player.updateOne({_id: socket.userData.dbId}, {inventory: inv});
    }
  });

  socket.on('disconnect', () => {
      if(socket.userData) {
          io.to(socket.userData.room).emit('playerLeft', socket.id);
          delete playerPositions[socket.id];
      }
  });
});

http.listen(process.env.PORT || 3000, () => console.log('Server Running'));
