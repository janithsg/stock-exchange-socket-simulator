// ============================================
// CONFIGURATION
// ============================================
const CONFIG = {
  PORT: 3000,
  TOTAL_SYMBOLS: 300,
  UPDATE_INTERVAL: 100,        // How often to update random stocks (ms)
  BROADCAST_INTERVAL: 500,     // How often to send updates to clients (ms)
  STOCKS_TO_UPDATE: 15,        // Number of random stocks to update each cycle
  PRICE_CHANGE_RANGE: 0.05,    // Max price change percentage (5%)
  MIN_SPREAD: 0.01,            // Minimum spread between buy/sell (1%)
  MAX_SPREAD: 0.05,            // Maximum spread between buy/sell (5%)
};

// ============================================
// DEPENDENCIES
// ============================================
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

// Note: Install nodemon as dev dependency
// npm install --save-dev nodemon

// ============================================
// SERVER SETUP
// ============================================
const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// ============================================
// DATA STORAGE
// ============================================
let stockSymbols = [];

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Generates a random stock symbol
 * @param {number} index - Index for unique identifier
 * @returns {string} Generated symbol
 */
function generateSymbol(index) {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const prefix = Array.from({ length: 3 }, () => 
    letters[Math.floor(Math.random() * letters.length)]
  ).join('');
  
  return `${prefix}.X${String(index).padStart(4, '0')}`;
}

/**
 * Generates a random company name
 * @returns {string} Random company name
 */
function generateCompanyName() {
  const prefixes = ['Aero', 'Bio', 'Cyber', 'Data', 'Eco', 'Fintech', 'Global', 'Hydro', 'Info', 'Quantum'];
  const suffixes = ['Systems', 'Technologies', 'Solutions', 'Industries', 'Corp', 'Group', 'Dynamics', 'Innovations', 'Enterprises', 'Holdings'];
  
  const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
  const suffix = suffixes[Math.floor(Math.random() * suffixes.length)];
  
  return `${prefix} ${suffix}`;
}

/**
 * Generates initial stock price
 * @returns {number} Random price between 1 and 1000
 */
function generateInitialPrice() {
  return parseFloat((Math.random() * 999 + 1).toFixed(3));
}

/**
 * Generates sell price based on buy price
 * @param {number} buyPrice - Buy price
 * @returns {number} Sell price (slightly lower than buy)
 */
function generateSellPrice(buyPrice) {
  const spread = CONFIG.MIN_SPREAD + Math.random() * (CONFIG.MAX_SPREAD - CONFIG.MIN_SPREAD);
  return parseFloat((buyPrice * (1 - spread)).toFixed(3));
}

/**
 * Calculates percentage change
 * @param {number} oldPrice - Previous price
 * @param {number} newPrice - Current price
 * @returns {string} Formatted percentage change
 */
function calculateChange(oldPrice, newPrice) {
  const change = ((newPrice - oldPrice) / oldPrice) * 100;
  const sign = change >= 0 ? '+' : '';
  return `${sign}${change.toFixed(2)}%`;
}

/**
 * Updates a stock's buy and sell prices with random changes
 * @param {object} stock - Stock object to update
 */
function updateStockPrices(stock) {
  const oldBuyPrice = stock.buy_value;
  const oldSellPrice = stock.sell_value;
  
  // Update buy price
  const buyChangePercent = (Math.random() * 2 - 1) * CONFIG.PRICE_CHANGE_RANGE;
  const newBuyPrice = oldBuyPrice * (1 + buyChangePercent);
  stock.buy_value = parseFloat(Math.max(0.001, newBuyPrice).toFixed(3));
  stock.buy_change = calculateChange(oldBuyPrice, stock.buy_value);
  
  // Update sell price (maintain spread but add some variation)
  const sellChangePercent = (Math.random() * 2 - 1) * CONFIG.PRICE_CHANGE_RANGE;
  const newSellPrice = oldSellPrice * (1 + sellChangePercent);
  stock.sell_value = parseFloat(Math.max(0.001, newSellPrice).toFixed(3));
  stock.sell_change = calculateChange(oldSellPrice, stock.sell_value);
}

/**
 * Updates a stock's buy and sell prices with random changes
 * @param {object} stock - Stock object to update
 */
function updateStockPrices(stock) {
  const oldBuyPrice = stock.buy_value;
  const oldSellPrice = stock.sell_value;
  
  // Update buy price
  const buyChangePercent = (Math.random() * 2 - 1) * CONFIG.PRICE_CHANGE_RANGE;
  const newBuyPrice = oldBuyPrice * (1 + buyChangePercent);
  stock.buy_value = parseFloat(Math.max(0.001, newBuyPrice).toFixed(3));
  stock.buy_change = calculateChange(oldBuyPrice, stock.buy_value);
  
  // Update sell price (maintain spread but add some variation)
  const sellChangePercent = (Math.random() * 2 - 1) * CONFIG.PRICE_CHANGE_RANGE;
  const newSellPrice = oldSellPrice * (1 + sellChangePercent);
  stock.sell_value = parseFloat(Math.max(0.001, newSellPrice).toFixed(3));
  stock.sell_change = calculateChange(oldSellPrice, stock.sell_value);
}

/**
 * Gets random unique indices
 * @param {number} count - Number of random indices needed
 * @param {number} max - Maximum value (exclusive)
 * @returns {Set<number>} Set of unique random indices
 */
function getRandomIndices(count, max) {
  const indices = new Set();
  const actualCount = Math.min(count, max);
  
  while (indices.size < actualCount) {
    indices.add(Math.floor(Math.random() * max));
  }
  
  return indices;
}

// ============================================
// INITIALIZATION
// ============================================

/**
 * Initializes all stock symbols with default values
 */
async function initializeStocks() {
  console.log(`Initializing ${CONFIG.TOTAL_SYMBOLS} stock symbols...`);
  
  stockSymbols = Array.from({ length: CONFIG.TOTAL_SYMBOLS }, (_, index) => {
    const buyPrice = generateInitialPrice();
    const sellPrice = generateSellPrice(buyPrice);
    
    return {
      symbol_name: generateSymbol(index),
      buy_value: buyPrice,
      name: generateCompanyName(),
      buy_change: '+0.00%',
      sell_value: sellPrice,
      sell_change: '+0.00%'
    };
  });
  
  console.log('Stock symbols initialized successfully');
  console.log(`Sample: ${stockSymbols[0].symbol_name} - ${stockSymbols[0].name}`);
  console.log(`  Buy: ${stockSymbols[0].buy_value} (${stockSymbols[0].buy_change})`);
  console.log(`  Sell: ${stockSymbols[0].sell_value} (${stockSymbols[0].sell_change})`);
}

// ============================================
// STOCK UPDATE LOGIC
// ============================================

/**
 * Updates random stocks at configured interval
 */
async function startStockUpdates() {
  setInterval(() => {
    const randomIndices = getRandomIndices(
      CONFIG.STOCKS_TO_UPDATE,
      stockSymbols.length
    );
    
    for (const index of randomIndices) {
      updateStockPrices(stockSymbols[index]);
    }
  }, CONFIG.UPDATE_INTERVAL);
  
  console.log(`Stock update process started (every ${CONFIG.UPDATE_INTERVAL}ms)`);
}

/**
 * Broadcasts stock data to all connected clients
 */
async function startBroadcasting() {
  setInterval(() => {
    io.emit('stock_update', stockSymbols);
  }, CONFIG.BROADCAST_INTERVAL);
  
  console.log(`Broadcasting started (every ${CONFIG.BROADCAST_INTERVAL}ms)`);
}

// ============================================
// SOCKET.IO EVENTS
// ============================================

io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);
  
  // Send initial data immediately on connection
  socket.emit('stock_update', stockSymbols);
  
  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
  });
  
  // Optional: Handle client requests for specific stocks
  socket.on('get_stocks', () => {
    socket.emit('stock_update', stockSymbols);
  });
});

// ============================================
// HTTP ENDPOINTS
// ============================================

app.get('/', (req, res) => {
  res.json({
    message: 'Stock Exchange Simulator API',
    status: 'running',
    config: {
      totalSymbols: CONFIG.TOTAL_SYMBOLS,
      updateInterval: `${CONFIG.UPDATE_INTERVAL}ms`,
      broadcastInterval: `${CONFIG.BROADCAST_INTERVAL}ms`,
      stocksUpdatedPerCycle: CONFIG.STOCKS_TO_UPDATE
    },
    endpoints: {
      socketio: 'Connect via Socket.IO for real-time updates',
      event: 'stock_update'
    }
  });
});

app.get('/stocks', (req, res) => {
  res.json({
    count: stockSymbols.length,
    stocks: stockSymbols
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// ============================================
// SERVER START
// ============================================

async function startServer() {
  try {
    // Initialize stocks
    await initializeStocks();
    
    // Start background processes
    await startStockUpdates();
    await startBroadcasting();
    
    // Start server
    server.listen(CONFIG.PORT, () => {
      console.log('='.repeat(50));
      console.log(`🚀 Stock Exchange Simulator running on port ${CONFIG.PORT}`);
      console.log(`📊 Managing ${CONFIG.TOTAL_SYMBOLS} stock symbols`);
      console.log(`🔄 Update interval: ${CONFIG.UPDATE_INTERVAL}ms`);
      console.log(`📡 Broadcast interval: ${CONFIG.BROADCAST_INTERVAL}ms`);
      console.log('='.repeat(50));
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Start the server
startServer();

// ============================================
// GRACEFUL SHUTDOWN
// ============================================

process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('\nSIGINT received, shutting down gracefully...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});