const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);

// Serve the 'public' folder to anyone who visits the site
app.use(express.static('public'));

// This object stores every player's coordinates
const players = {};

io.on('connection', (socket) => {
  console.log('A player connected:', socket.id);

  // When a new player joins, give them default coordinates
  players[socket.id] = { x: 0, y: 0.5, z: 0, color: Math.random() * 0xffffff };

  // Tell the new player about everyone else
  socket.emit('currentPlayers', players);

  // Tell everyone else about the new player
  socket.broadcast.emit('newPlayer', { id: socket.id, player: players[socket.id] });

  // When a player moves, update the brain and tell everyone
  socket.on('playerMovement', (movementData) => {
    players[socket.id].x = movementData.x;
    players[socket.id].y = movementData.y;
    players[socket.id].z = movementData.z;
    socket.broadcast.emit('playerMoved', { id: socket.id, x: movementData.x, y: movementData.y, z: movementData.z });
  });

  // When a player leaves, delete them and tell everyone
  socket.on('disconnect', () => {
    console.log('Player disconnected:', socket.id);
    delete players[socket.id];
    io.emit('playerDisconnected', socket.id);
  });
});

// Render provides a specific PORT, otherwise use 3000
const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
