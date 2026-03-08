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

const RECIPES = {
    furnace: { stone: 10 }, iron_ingot: { iron_ore: 1 }, copper_ingot: { copper_ore: 1 }, gold_ingot: { gold_ore: 1 },
    bolts: { iron_ingot: 1 }, wire: { copper_ingot: 1 }, auto_crafter: { bolts: 10, iron_ingot: 5 }, conveyor: { iron_ingot: 1 }, drill: { wire: 5, bolts: 10, gold_ingot: 1 }
};

const activeMiners = {}; // Tracks who is currently shooting a laser

io.on('connection', (socket) => {
  socket.on('login', async (data) => {
    try {
      let user = await Player.findOne({ username: data.u });
      if (!user) {
        const hash = await bcrypt.hash(data.p, 10);
        user = new Player({ username: data.u, password: hash, plotData: { deposits: [{ type: 'iron', id: 'd1', x: 20, z: 20 }, { type: 'copper', id: 'd2', x: 80, z: 20 }], machines: [] } });
        await user.save();
      }
      
      let roomName = 'room_1';
      socket.join(roomName);
      socket.userData = { dbId: user._id, room: roomName, inventory: user.inventory, plotData: user.plotData, username: data.u };
      socket.emit('initGame', { offset: plotOffsets[0], plotData: user.plotData, inventory: user.inventory });
    } catch (e) { console.log(e); }
  });

  // FIXED CHAT
  socket.on('chatMsg', (msg) => {
      if(!socket.userData) return;
      // Broadcast to everyone in the room, INCLUDING the sender
      io.in(socket.userData.room).emit('chatMsg', `<b>${socket.userData.username}:</b> ${msg}`);
  });

  // FIXED MINING: Give ore every 1 second while holding the button
  socket.on('startMining', (type) => {
    if(!socket.userData || activeMiners[socket.id]) return;
    activeMiners[socket.id] = setInterval(async () => {
        socket.userData.inventory[type + '_ore'] = (socket.userData.inventory[type + '_ore'] || 0) + 1;
        socket.emit('updateInventory', socket.userData.inventory);
        await Player.updateOne({_id: socket.userData.dbId}, {inventory: socket.userData.inventory});
    }, 1000); // 1 ore per second
  });

  socket.on('stopMining', () => {
      if(activeMiners[socket.id]) { clearInterval(activeMiners[socket.id]); delete activeMiners[socket.id]; }
  });

  socket.on('placeMachine', async (data) => {
    if(!socket.userData) return;
    let inv = socket.userData.inventory;
    if((inv[data.type] || 0) > 0) {
        inv[data.type] -= 1;
        socket.userData.plotData.machines.push(data);
        socket.emit('updateInventory', inv);
        io.to(socket.userData.room).emit('machinePlaced', data); 
        await Player.updateOne({_id: socket.userData.dbId}, { inventory: inv, 'plotData.machines': socket.userData.plotData.machines });
    }
  });

  socket.on('craft', async (item) => {
    if(!socket.userData || !RECIPES[item]) return;
    let inv = socket.userData.inventory; const reqs = RECIPES[item]; let canCraft = true;
    for(let k in reqs) if((inv[k]||0) < reqs[k]) canCraft = false;
    
    if(canCraft) {
        for(let k in reqs) inv[k] -= reqs[k];
        if(item === 'wire') inv.wire = (inv.wire||0) + 3; else inv[item] = (inv[item]||0) + 1;
        socket.emit('updateInventory', inv);
        await Player.updateOne({_id: socket.userData.dbId}, {inventory: inv});
    }
  });

  socket.on('disconnect', () => {
      if(activeMiners[socket.id]) clearInterval(activeMiners[socket.id]);
  });
});

http.listen(process.env.PORT || 3000, () => console.log('Server Running'));
