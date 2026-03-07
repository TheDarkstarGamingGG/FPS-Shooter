const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);

app.use(express.static('public'));
const players = {};

io.on('connection', (socket) => {
  console.log('Player connected:', socket.id);

  // New players start with 100 HP
  players[socket.id] = { x: 0, y: 0, z: 0, color: Math.random() * 0xffffff, hp: 100, isDead: false };

  socket.emit('currentPlayers', players);
  socket.broadcast.emit('newPlayer', { id: socket.id, player: players[socket.id] });

  socket.on('playerMovement', (data) => {
    if (players[socket.id] && !players[socket.id].isDead) {
      players[socket.id].x = data.x;
      players[socket.id].y = data.y;
      players[socket.id].z = data.z;
      // We pass 'yaw' so other players see which way you are looking
      socket.broadcast.emit('playerMoved', { id: socket.id, x: data.x, y: data.y, z: data.z, yaw: data.yaw });
    }
  });

  // Hitscan Damage Logic
  socket.on('hitTarget', (targetId) => {
    if (players[targetId] && !players[targetId].isDead) {
      players[targetId].hp -= 25; // AK-47 does 25 damage per hit
      io.emit('healthUpdated', { id: targetId, hp: players[targetId].hp });

      if (players[targetId].hp <= 0) {
        players[targetId].isDead = true;
        io.emit('playerDied', targetId);

        // 3-Second Respawn Timer
        setTimeout(() => {
          if (players[targetId]) {
            players[targetId].hp = 100;
            players[targetId].isDead = false;
            // Spawn them in a random spot to prevent spawn camping
            players[targetId].x = (Math.random() - 0.5) * 20;
            players[targetId].z = (Math.random() - 0.5) * 20;
            io.emit('playerRespawned', { id: targetId, player: players[targetId] });
          }
        }, 3000);
      }
    }
  });

  socket.on('disconnect', () => {
    delete players[socket.id];
    io.emit('playerDisconnected', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => console.log(`Server on port ${PORT}`));
