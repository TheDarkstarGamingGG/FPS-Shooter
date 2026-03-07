const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

app.use(express.static('public'));

// --- DATABASE ---
mongoose.connect(process.env.MONGODB_URI).then(() => console.log('MongoDB Connected!'));

const PlayerSchema = new mongoose.Schema({
  username: { type: String, unique: true },
  password: { type: String },
  inventory: { type: Object, default: { stone: 0, iron_ore: 0, copper_ore: 0, gold_ore: 0, iron_ingot: 0, copper_ingot: 0, gold_ingot: 0, bolts: 0, wire: 0, furnace: 0, drill: 0 } },
  plotData: { deposits: Array, machines: Array }
});
const Player = mongoose.model('Player', PlayerSchema);

const PLOT_SIZE = 100;
const plotOffsets = [
  { x: 0, z: 0 }, { x: PLOT_SIZE, z: 0 }, { x: PLOT_SIZE * 2, z: 0 },
  { x: 0, z: PLOT_SIZE }, { x: PLOT_SIZE, z: PLOT_SIZE }, { x: PLOT_SIZE * 2, z: PLOT_SIZE }
];
const activeRooms = {}; 

io.on('connection', (socket) => {
  // LOGIN LOGIC - FIXED ASYNC HERE
  socket.on('login', async (data) => {
    try {
      let user = await Player.findOne({ username: data.username });
      if (!user) {
        const hash = await bcrypt.hash(data.password, 10);
        user = new Player({ 
            username: data.username, 
            password: hash,
            plotData: { 
                deposits: [
                    { type: 'iron', x: 10, z: 10 }, { type: 'copper', x: -10, z: 10 }, 
                    { type: 'gold', x: 10, z: -10 }, { type: 'stone', x: -10, z: -10 }
                ], 
                machines: [] 
            } 
        });
        await user.save();
      } else {
        const valid = await bcrypt.compare(data.password, user.password);
        if (!valid) return socket.emit('loginError', 'Invalid Password');
      }

      // Instance / Room Logic
      let roomName = 'room_1';
      if(!activeRooms[roomName]) activeRooms[roomName] = [];
      let myIndex = activeRooms[roomName].length;
      activeRooms[roomName].push(socket.id);
      
      socket.join(roomName);
      socket.userData = { dbId: user._id, offset: plotOffsets[myIndex], inventory: user.inventory };

      socket.emit('initGame', { 
        offset: plotOffsets[myIndex], 
        plotData: user.plotData, 
        inventory: user.inventory 
      });
    } catch (e) { console.log(e); }
  });

  // MINING
  socket.on('startMining', async (type) => {
    if(!socket.userData) return;
    socket.userData.inventory[type + '_ore'] = (socket.userData.inventory[type + '_ore'] || 0) + 1;
    socket.emit('updateInventory', socket.userData.inventory);
    await Player.updateOne({_id: socket.userData.dbId}, {inventory: socket.userData.inventory});
  });

  // CRAFTING
  socket.on('craft', async (item) => {
    const inv = socket.userData.inventory;
    if (item === 'furnace' && inv.stone >= 10) {
        inv.stone -= 10; inv.furnace = (inv.furnace || 0) + 1;
    }
    // Add other recipes here similarly...
    socket.emit('updateInventory', inv);
    await Player.updateOne({_id: socket.userData.dbId}, {inventory: inv});
  });
});

http.listen(process.env.PORT || 3000, () => console.log('Server Running'));
