const { Server } = require("socket.io");
const http = require("http");
const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Game Configurations
const gameModes = [
  { id: 'wingo_10s', duration: 10, name: '10 Sec' },
  { id: 'wingo_30s', duration: 30, name: '30 Sec' },
  { id: 'wingo_1m', duration: 60, name: '1 Min' },
  { id: 'wingo_5m', duration: 300, name: '5 Min' },
  { id: 'wingo_10m', duration: 600, name: '10 Min' },
];

// State to track periods and timers
const gameStates = {};

// Helper: Generate Period ID based on date and iterations
function generatePeriodId(duration) {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
  // Number of periods passed today
  const secondsSinceMidnight = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
  const periodNum = Math.floor(secondsSinceMidnight / duration) + 1;
  return `${dateStr}${duration}${periodNum.toString().padStart(4, '0')}`;
}

// Helper: Generate Result
function generateResult() {
  const number = Math.floor(Math.random() * 10); // 0-9
  const size = number <= 4 ? 'Small' : 'Big';
  let color = 'Red'; // default
  let colors = ['Red'];
  
  if ([1, 3, 7, 9].includes(number)) {
    color = 'Green';
    colors = ['Green'];
  } else if ([2, 4, 6, 8].includes(number)) {
    color = 'Red';
    colors = ['Red'];
  } else if (number === 0) {
    color = 'Violet/Red';
    colors = ['Violet', 'Red'];
  } else if (number === 5) {
    color = 'Violet/Green';
    colors = ['Violet', 'Green'];
  }

  return { number, size, color, colors };
}

// Initialize game loops
gameModes.forEach(mode => {
  let periodId = generatePeriodId(mode.duration);
  let timeLeft = mode.duration - (Math.floor(Date.now() / 1000) % mode.duration);
  let isResolving = false;
  let history = Array.from({length: 10}).map((_, i) => {
     const res = generateResult();
     return { periodId: `${periodId.slice(0, -1)}${i}`, ...res };
  });

  gameStates[mode.id] = {
    mode: mode.id,
    periodId,
    timeLeft,
    history
  };

  setInterval(() => {
    timeLeft = mode.duration - (Math.floor(Date.now() / 1000) % mode.duration);
    
    // Period rollover
    if (timeLeft === mode.duration || timeLeft === 0) {
      if (!isResolving) {
        isResolving = true;
        // Generate Result
        const result = generateResult();
        const currentPeriod = periodId;
        
        // Add to history
        gameStates[mode.id].history.unshift({ periodId: currentPeriod, ...result });
        if (gameStates[mode.id].history.length > 50) gameStates[mode.id].history.pop();
        
        // In a real app, calculate winnings and update MySQL DB here!
        // e.g. await resolveBets(mode.id, currentPeriod, result);

        // Broadcast Result
        io.to(mode.id).emit('game_result', {
          mode: mode.id,
          periodId: currentPeriod,
          result
        });

        // Generate New Period
        periodId = generatePeriodId(mode.duration);
        
        setTimeout(() => { isResolving = false; }, 1000);
      }
      timeLeft = mode.duration; 
    }

    gameStates[mode.id].periodId = periodId;
    gameStates[mode.id].timeLeft = timeLeft;

    // Broadcast Tick
    io.to(mode.id).emit('game_tick', {
      mode: mode.id,
      periodId,
      timeLeft,
      history: gameStates[mode.id].history.slice(0, 10)
    });

  }, 1000);
});

io.on("connection", (socket) => {
  console.log("Client connected:", socket.id);

  socket.on("join_game", (modeId) => {
    // Leave other modes
    gameModes.forEach(m => socket.leave(m.id));
    
    socket.join(modeId);
    console.log(`Socket ${socket.id} joined ${modeId}`);
    
    // Send immediate state
    if (gameStates[modeId]) {
      socket.emit('game_tick', gameStates[modeId]);
    }
  });

  // Example: Client placing bet
  // In a real app, this should be an HTTP POST request to Next.js API to verify auth/balance securely.
  // We handle bets via the Next.js API, NOT Socket.io directly to maintain security architecture.
});

const PORT = 4000;
server.listen(PORT, () => {
  console.log(`Universal Game Engine (Socket.io) running on http://localhost:${PORT}`);
});
