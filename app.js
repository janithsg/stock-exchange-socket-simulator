// ============================================
// CONFIGURATION
// ============================================
const CONFIG = {
  PORT: 3000,
  TOTAL_SYMBOLS: 500,
  UPDATE_INTERVAL: 100,        // How often to update random stocks (ms)
  BROADCAST_INTERVAL: 500,     // How often to send updates to clients (ms)
  STOCKS_TO_UPDATE: 15,        // Number of random stocks to update each cycle
  PRICE_CHANGE_RANGE: 0.05,    // Max price change percentage (5%)
  MIN_SPREAD: 0.01,            // Minimum spread between buy/sell (1%)
  MAX_SPREAD: 0.05,            // Maximum spread between buy/sell (5%)
  
  // Table update configuration
  TABLE_ELEMENTS: 20,          // Total number of table elements to generate
  TABLE_UPDATES_PER_SECOND: 6, // Number of elements to push per second
  
  // Homepage update configuration
  HOMEPAGE_UPDATE_INTERVAL: 3000, // How often to send homepage updates (ms)
  
  // Chart update configuration
  CHART_UPDATE_INTERVAL: 500,     // How often to send chart updates (ms)
  CHART_CANDLE_DURATION: 1000,    // Duration of each candle in ms (1 second)
  CHART_BASE_PRICE: 150,          // Starting price for the chart
  CHART_VOLATILITY: 0.02,         // Price volatility (2%)
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
let tableElements = [];
let tableUpdateQueue = [];
let currentTableIndex = 0;
let homepageData = null;

// Chart data storage
let chartData = [];
let currentCandle = null;
let candleStartTime = null;
let lastPrice = CONFIG.CHART_BASE_PRICE;

// Interval tracking
let stockUpdateInterval = null;
let broadcastInterval = null;
let tableUpdateInterval = null;
let homepageUpdateInterval = null;
let chartUpdateInterval = null;

// Connected clients tracking
let connectedClients = 0;

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Generates a random value within a range
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @param {number} decimals - Number of decimal places (default: 2)
 * @returns {number} Random value within range
 */
function randomInRange(min, max, decimals = 2) {
  const value = Math.random() * (max - min) + min;
  return parseFloat(value.toFixed(decimals));
}

/**
 * Generates an array of random values for graph data
 * @param {number} count - Number of values to generate
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @returns {Array<number>} Array of random values
 */
function generateGraphData(count, min, max) {
  return Array.from({ length: count }, () => randomInRange(min, max, 2));
}

/**
 * Updates graph data by adding new value and removing oldest
 * @param {Array<number>} graphData - Current graph data array
 * @param {number} newValue - New value to add
 * @returns {Array<number>} Updated graph data
 */
function updateGraphData(graphData, newValue) {
  const updated = [...graphData];
  updated.shift(); // Remove first element
  updated.push(newValue); // Add new value at end
  return updated;
}

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
 * Generates a random table element symbol name
 * @returns {string} Random symbol name with words
 */
function generateTableSymbolName() {
  const words = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Sigma', 'Omega', 'Prime', 'Nova', 'Stellar', 'Cosmic', 
                 'Quantum', 'Fusion', 'Matrix', 'Nexus', 'Vertex', 'Zenith', 'Apex', 'Core', 'Edge', 'Peak'];
  const suffixes = ['Holdings', 'Corp', 'Ltd', 'Inc', 'Group', 'Industries', 'Systems', 'Technologies', 'Ventures', 'Capital'];
  
  const word1 = words[Math.floor(Math.random() * words.length)];
  const word2 = words[Math.floor(Math.random() * words.length)];
  const suffix = suffixes[Math.floor(Math.random() * suffixes.length)];
  
  return `${word1} ${word2} ${suffix}`;
}

/**
 * Generates a random table element
 * @param {number} index - Index for unique identifier
 * @returns {object} Table element object
 */
function generateTableElement(index) {
  const price = parseFloat((Math.random() * 999 + 1).toFixed(4));
  const changePercent = (Math.random() * 20 - 10).toFixed(2);
  const change = changePercent >= 0 ? `+${changePercent}%` : `${changePercent}%`;
  const lastOrderValue = parseFloat((Math.random() * 50000).toFixed(2));
  const lastOrderQty = Math.floor(Math.random() * 1000) + 1;
  
  return {
    symbol_code: generateSymbol(index),
    symbol_name: generateTableSymbolName(),
    price: price.toFixed(4),
    change: change,
    last_order_value: lastOrderValue.toFixed(2),
    last_order_qty: lastOrderQty
  };
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
// CHART FUNCTIONS
// ============================================

/**
 * Generates a new price based on last price with random walk
 * @param {number} lastPrice - Previous price
 * @returns {number} New price
 */
function generateNewPrice(lastPrice) {
  const change = (Math.random() * 2 - 1) * CONFIG.CHART_VOLATILITY;
  const newPrice = lastPrice * (1 + change);
  return parseFloat(newPrice.toFixed(2));
}

/**
 * Initializes the first candle
 */
function initializeCandle() {
  const now = Date.now();
  candleStartTime = now;
  
  currentCandle = {
    time: Math.floor(now / 1000), // Unix timestamp in seconds
    open: lastPrice,
    high: lastPrice,
    low: lastPrice,
    close: lastPrice,
  };
}

/**
 * Updates the current candle with a new price tick
 * @param {number} price - New price
 */
function updateCurrentCandle(price) {
  if (!currentCandle) {
    initializeCandle();
  }
  
  currentCandle.close = price;
  currentCandle.high = Math.max(currentCandle.high, price);
  currentCandle.low = Math.min(currentCandle.low, price);
}

/**
 * Checks if it's time to complete the current candle and start a new one
 * @returns {boolean} True if candle should be completed
 */
function shouldCompleteCandle() {
  const now = Date.now();
  return (now - candleStartTime) >= CONFIG.CHART_CANDLE_DURATION;
}

/**
 * Completes the current candle and starts a new one
 */
function completeCandle() {
  if (currentCandle) {
    // Add completed candle to history
    chartData.push({ ...currentCandle });
    
    // Keep only last 100 candles
    if (chartData.length > 100) {
      chartData.shift();
    }
    
    // Start new candle
    lastPrice = currentCandle.close;
    initializeCandle();
  }
}

/**
 * Generates initial historical chart data
 */
function initializeChartData() {
  console.log('Initializing chart data...');
  
  const now = Date.now();
  const candlesCount = 50; // Generate 50 historical candles
  
  chartData = [];
  let price = CONFIG.CHART_BASE_PRICE;
  
  for (let i = candlesCount; i > 0; i--) {
    const candleTime = Math.floor((now - (i * CONFIG.CHART_CANDLE_DURATION)) / 1000);
    
    const open = price;
    const close = generateNewPrice(open);
    const high = Math.max(open, close) * (1 + Math.random() * 0.01);
    const low = Math.min(open, close) * (1 - Math.random() * 0.01);
    
    chartData.push({
      time: candleTime,
      open: parseFloat(open.toFixed(2)),
      high: parseFloat(high.toFixed(2)),
      low: parseFloat(low.toFixed(2)),
      close: parseFloat(close.toFixed(2)),
    });
    
    price = close;
  }
  
  lastPrice = price;
  initializeCandle();
  
  console.log(`Chart data initialized with ${chartData.length} candles`);
  console.log(`Starting price: ${CONFIG.CHART_BASE_PRICE}, Current price: ${lastPrice.toFixed(2)}`);
}

/**
 * Updates chart data and emits to clients
 */
function updateChartData() {
  // Generate new price
  const newPrice = generateNewPrice(lastPrice);
  
  // Update current candle
  updateCurrentCandle(newPrice);
  
  // Check if we should complete the candle
  if (shouldCompleteCandle()) {
    completeCandle();
  }
  
  lastPrice = newPrice;
}

/**
 * Clears chart data to reduce memory
 */
function clearChartData() {
  console.log('Clearing chart data...');
  chartData = [];
  currentCandle = null;
  candleStartTime = null;
  lastPrice = CONFIG.CHART_BASE_PRICE;
}

// ============================================
// INITIALIZATION
// ============================================

/**
 * Initializes all stock symbols with default values
 */
function initializeStocks() {
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

/**
 * Initializes table elements
 */
function initializeTableElements() {
  console.log(`Initializing ${CONFIG.TABLE_ELEMENTS} table elements...`);
  
  tableElements = Array.from({ length: CONFIG.TABLE_ELEMENTS }, (_, index) => 
    generateTableElement(index)
  );
  
  // Create initial queue
  tableUpdateQueue = [...tableElements];
  
  console.log('Table elements initialized successfully');
  console.log(`Sample: ${tableElements[0].symbol_code} - ${tableElements[0].symbol_name}`);
  console.log(`  Price: ${tableElements[0].price} (${tableElements[0].change})`);
  console.log(`  Last Order: ${tableElements[0].last_order_qty} @ ${tableElements[0].last_order_value}`);
}

/**
 * Initializes homepage data with default values
 */
function initializeHomepageData() {
  console.log('Initializing homepage data...');
  
  homepageData = {
    main_balance: randomInRange(17200, 18300, 2),
    market_value: randomInRange(10600, 10700, 2),
    
    holding1: {
      avg: randomInRange(10, 100, 2),
      change: randomInRange(0, 60, 2),
      impact_is_positive: Math.random() > 0.5,
      value: randomInRange(1000, 3000, 2)
    },
    holding2: {
      avg: randomInRange(10, 100, 2),
      change: randomInRange(0, 60, 2),
      impact_is_positive: Math.random() > 0.5,
      value: randomInRange(1000, 3000, 2)
    },
    holding3: {
      avg: randomInRange(10, 100, 2),
      change: randomInRange(0, 60, 2),
      impact_is_positive: Math.random() > 0.5,
      value: randomInRange(1000, 3000, 2)
    },
    holding4: {
      avg: randomInRange(10, 100, 2),
      change: randomInRange(0, 60, 2),
      impact_is_positive: Math.random() > 0.5,
      value: randomInRange(1000, 3000, 2)
    },
    
    recommendation1: {
      avg: randomInRange(10, 100, 2),
      positive_change: randomInRange(10, 60, 2),
      negative_change: randomInRange(10, 60, 2)
    },
    recommendation2: {
      avg: randomInRange(10, 100, 2),
      positive_change: randomInRange(10, 60, 2),
      negative_change: randomInRange(10, 60, 2)
    },
    recommendation3: {
      avg: randomInRange(10, 100, 2),
      positive_change: randomInRange(10, 60, 2),
      negative_change: randomInRange(10, 60, 2)
    },
    recommendation4: {
      avg: randomInRange(10, 100, 2),
      positive_change: randomInRange(10, 60, 2),
      negative_change: randomInRange(10, 60, 2)
    },
    
    fav1: {
      price: randomInRange(10, 60, 2),
      change: randomInRange(10, 60, 2),
      impact_is_positive: Math.random() > 0.5,
      graph_data: generateGraphData(20, 10, 60)
    },
    fav2: {
      price: randomInRange(10, 60, 2),
      change: randomInRange(10, 60, 2),
      impact_is_positive: Math.random() > 0.5,
      graph_data: generateGraphData(20, 10, 60)
    },
    fav3: {
      price: randomInRange(10, 60, 2),
      change: randomInRange(10, 60, 2),
      impact_is_positive: Math.random() > 0.5,
      graph_data: generateGraphData(20, 10, 60)
    },
    fav4: {
      price: randomInRange(10, 60, 2),
      change: randomInRange(10, 60, 2),
      impact_is_positive: Math.random() > 0.5,
      graph_data: generateGraphData(20, 10, 60)
    }
  };
  
  console.log('Homepage data initialized successfully');
  console.log(`Sample: Main Balance: ${homepageData.main_balance}, Market Value: ${homepageData.market_value}`);
}

/**
 * Clears all data arrays to reduce memory
 */
function clearAllData() {
  console.log('Clearing all data arrays...');
  stockSymbols = [];
  tableElements = [];
  tableUpdateQueue = [];
  homepageData = null;
  clearChartData();
  console.log('All data cleared');
}

// ============================================
// STOCK UPDATE LOGIC
// ============================================

/**
 * Updates random stocks at configured interval
 */
function startStockUpdates() {
  if (stockUpdateInterval) {
    clearInterval(stockUpdateInterval);
  }
  
  stockUpdateInterval = setInterval(() => {
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
 * Stops stock updates
 */
function stopStockUpdates() {
  if (stockUpdateInterval) {
    clearInterval(stockUpdateInterval);
    stockUpdateInterval = null;
    console.log('Stock update process stopped');
  }
}

/**
 * Broadcasts stock data to all connected clients
 */
function startBroadcasting() {
  if (broadcastInterval) {
    clearInterval(broadcastInterval);
  }
  
  broadcastInterval = setInterval(() => {
    io.emit('stock_update', stockSymbols);
  }, CONFIG.BROADCAST_INTERVAL);
  
  console.log(`Broadcasting started (every ${CONFIG.BROADCAST_INTERVAL}ms)`);
}

/**
 * Stops broadcasting
 */
function stopBroadcasting() {
  if (broadcastInterval) {
    clearInterval(broadcastInterval);
    broadcastInterval = null;
    console.log('Broadcasting stopped');
  }
}

/**
 * Broadcasts table updates one by one at configured rate
 */
function startTableUpdates() {
  if (tableUpdateInterval) {
    clearInterval(tableUpdateInterval);
  }
  
  const intervalMs = 1000 / CONFIG.TABLE_UPDATES_PER_SECOND;
  
  tableUpdateInterval = setInterval(() => {
    if (tableUpdateQueue.length === 0) {
      // Regenerate queue when empty
      tableUpdateQueue = [...tableElements].map(el => ({
        ...el,
        // Update with new random values
        price: parseFloat((parseFloat(el.price) * (1 + (Math.random() * 0.1 - 0.05))).toFixed(4)),
        change: (() => {
          const changePercent = (Math.random() * 20 - 10).toFixed(2);
          return changePercent >= 0 ? `+${changePercent}%` : `${changePercent}%`;
        })(),
        last_order_value: parseFloat((Math.random() * 50000).toFixed(2)),
        last_order_qty: Math.floor(Math.random() * 1000) + 1
      }));
    }
    
    // Send next element in queue
    const element = tableUpdateQueue.shift();
    io.emit('table_update', [element]);
  }, intervalMs);
  
  console.log(`Table updates started (${CONFIG.TABLE_UPDATES_PER_SECOND} elements/second)`);
}

/**
 * Stops table updates
 */
function stopTableUpdates() {
  if (tableUpdateInterval) {
    clearInterval(tableUpdateInterval);
    tableUpdateInterval = null;
    console.log('Table updates stopped');
  }
}

/**
 * Updates homepage data with new random values
 */
function updateHomepageData() {
  if (!homepageData) return;
  
  homepageData.main_balance = randomInRange(17200, 18300, 2);
  homepageData.market_value = randomInRange(10600, 10700, 2);
  
  // Update holdings
  for (let i = 1; i <= 4; i++) {
    const holding = homepageData[`holding${i}`];
    holding.avg = randomInRange(10, 100, 2);
    holding.change = randomInRange(0, 60, 2);
    holding.impact_is_positive = Math.random() > 0.5;
    holding.value = randomInRange(1000, 3000, 2);
  }
  
  // Update recommendations
  for (let i = 1; i <= 4; i++) {
    const rec = homepageData[`recommendation${i}`];
    rec.avg = randomInRange(10, 100, 2);
    rec.positive_change = randomInRange(10, 60, 2);
    rec.negative_change = randomInRange(10, 60, 2);
  }
  
  // Update favorites
  for (let i = 1; i <= 4; i++) {
    const fav = homepageData[`fav${i}`];
    const newPrice = randomInRange(10, 60, 2);
    fav.price = newPrice;
    fav.change = randomInRange(10, 60, 2);
    fav.impact_is_positive = Math.random() > 0.5;
    fav.graph_data = updateGraphData(fav.graph_data, newPrice);
  }
}

/**
 * Broadcasts homepage updates at configured interval
 */
function startHomepageUpdates() {
  if (homepageUpdateInterval) {
    clearInterval(homepageUpdateInterval);
  }
  
  homepageUpdateInterval = setInterval(() => {
    updateHomepageData();
    io.emit('homepage_updates', homepageData);
  }, CONFIG.HOMEPAGE_UPDATE_INTERVAL);
  
  console.log(`Homepage updates started (every ${CONFIG.HOMEPAGE_UPDATE_INTERVAL}ms)`);
}

/**
 * Stops homepage updates
 */
function stopHomepageUpdates() {
  if (homepageUpdateInterval) {
    clearInterval(homepageUpdateInterval);
    homepageUpdateInterval = null;
    console.log('Homepage updates stopped');
  }
}

/**
 * Starts chart updates at configured interval
 */
function startChartUpdates() {
  if (chartUpdateInterval) {
    clearInterval(chartUpdateInterval);
  }
  
  chartUpdateInterval = setInterval(() => {
    updateChartData();
    
    // Emit current candle plus all historical data
    const dataToSend = [...chartData];
    if (currentCandle) {
      dataToSend.push(currentCandle);
    }
    
    io.emit('chart_update', dataToSend);
  }, CONFIG.CHART_UPDATE_INTERVAL);
  
  console.log(`Chart updates started (every ${CONFIG.CHART_UPDATE_INTERVAL}ms)`);
  console.log(`Candle duration: ${CONFIG.CHART_CANDLE_DURATION}ms`);
}

/**
 * Stops chart updates
 */
function stopChartUpdates() {
  if (chartUpdateInterval) {
    clearInterval(chartUpdateInterval);
    chartUpdateInterval = null;
    console.log('Chart updates stopped');
  }
}

/**
 * Starts all update processes
 */
function startAllUpdates() {
  console.log('Starting all update processes...');
  
  // Initialize data if not already initialized
  if (stockSymbols.length === 0) {
    initializeStocks();
  }
  if (tableElements.length === 0) {
    initializeTableElements();
  }
  if (!homepageData) {
    initializeHomepageData();
  }
  if (chartData.length === 0) {
    initializeChartData();
  }
  
  // Start all update processes
  startStockUpdates();
  startBroadcasting();
  startTableUpdates();
  startHomepageUpdates();
  startChartUpdates();
  
  console.log('All update processes started');
}

/**
 * Stops all update processes
 */
function stopAllUpdates() {
  console.log('Stopping all update processes...');
  
  stopStockUpdates();
  stopBroadcasting();
  stopTableUpdates();
  stopHomepageUpdates();
  stopChartUpdates();
  
  console.log('All update processes stopped');
}

// ============================================
// SOCKET.IO EVENTS
// ============================================

io.on('connection', (socket) => {
  connectedClients++;
  console.log(`Client connected: ${socket.id} (Total clients: ${connectedClients})`);
  
  // Start updates if this is the first client
  if (connectedClients === 1) {
    console.log('First client connected - starting data generation');
    startAllUpdates();
  }
  
  // Send initial data immediately on connection
  socket.emit('stock_update', stockSymbols);
  socket.emit('homepage_updates', homepageData);
  
  // Send initial chart data
  const initialChartData = [...chartData];
  if (currentCandle) {
    initialChartData.push(currentCandle);
  }
  socket.emit('chart_update', initialChartData);
  
  socket.on('disconnect', () => {
    connectedClients--;
    console.log(`Client disconnected: ${socket.id} (Total clients: ${connectedClients})`);
    
    // Stop updates and clear data if no clients are connected
    if (connectedClients === 0) {
      console.log('No clients connected - stopping data generation and clearing memory');
      stopAllUpdates();
      clearAllData();
    }
  });
  
  // Optional: Handle client requests for specific stocks
  socket.on('get_stocks', () => {
    socket.emit('stock_update', stockSymbols);
  });
  
  // Optional: Handle client requests for homepage data
  socket.on('get_homepage', () => {
    socket.emit('homepage_updates', homepageData);
  });
  
  // Optional: Handle client requests for chart data
  socket.on('get_chart', () => {
    const chartDataToSend = [...chartData];
    if (currentCandle) {
      chartDataToSend.push(currentCandle);
    }
    socket.emit('chart_update', chartDataToSend);
  });
});

// ============================================
// HTTP ENDPOINTS
// ============================================

app.get('/', (req, res) => {
  res.json({
    message: 'Stock Exchange Simulator API',
    status: 'running',
    connectedClients: connectedClients,
    dataGenerationActive: connectedClients > 0,
    config: {
      totalSymbols: CONFIG.TOTAL_SYMBOLS,
      updateInterval: `${CONFIG.UPDATE_INTERVAL}ms`,
      broadcastInterval: `${CONFIG.BROADCAST_INTERVAL}ms`,
      stocksUpdatedPerCycle: CONFIG.STOCKS_TO_UPDATE,
      tableElements: CONFIG.TABLE_ELEMENTS,
      tableUpdatesPerSecond: CONFIG.TABLE_UPDATES_PER_SECOND,
      homepageUpdateInterval: `${CONFIG.HOMEPAGE_UPDATE_INTERVAL}ms`,
      chartUpdateInterval: `${CONFIG.CHART_UPDATE_INTERVAL}ms`,
      candleDuration: `${CONFIG.CHART_CANDLE_DURATION}ms`
    },
    endpoints: {
      socketio: 'Connect via Socket.IO for real-time updates',
      events: {
        stock_update: 'Batch stock updates',
        table_update: 'Individual table element updates',
        homepage_updates: 'Homepage data updates',
        chart_update: 'Candlestick chart updates (every 200ms)'
      }
    },
    optimization: {
      note: 'Data generation only runs when clients are connected',
      currentState: connectedClients > 0 ? 'Active' : 'Idle (no memory usage)'
    }
  });
});

app.get('/stocks', (req, res) => {
  res.json({
    count: stockSymbols.length,
    stocks: stockSymbols,
    dataGenerationActive: connectedClients > 0
  });
});

app.get('/chart', (req, res) => {
  const chartDataToSend = [...chartData];
  if (currentCandle) {
    chartDataToSend.push(currentCandle);
  }
  res.json({
    count: chartDataToSend.length,
    data: chartDataToSend,
    currentPrice: lastPrice,
    dataGenerationActive: connectedClients > 0
  });
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    connectedClients: connectedClients,
    dataGenerationActive: connectedClients > 0,
    memoryUsage: process.memoryUsage()
  });
});

app.get('/stats', (req, res) => {
  res.json({
    connectedClients: connectedClients,
    dataGenerationActive: connectedClients > 0,
    dataArraySizes: {
      stockSymbols: stockSymbols.length,
      tableElements: tableElements.length,
      chartData: chartData.length,
      homepageDataInitialized: homepageData !== null
    },
    activeIntervals: {
      stockUpdate: stockUpdateInterval !== null,
      broadcast: broadcastInterval !== null,
      tableUpdate: tableUpdateInterval !== null,
      homepageUpdate: homepageUpdateInterval !== null,
      chartUpdate: chartUpdateInterval !== null
    },
    memoryUsage: process.memoryUsage()
  });
});

// ============================================
// SERVER START
// ============================================

async function startServer() {
  try {
    // Don't initialize data on startup - wait for first client
    console.log('Server starting in optimized mode - data generation will begin when first client connects');
    
    // Start server
    server.listen(CONFIG.PORT, () => {
      console.log('='.repeat(50));
      console.log(`🚀 Stock Exchange Simulator running on port ${CONFIG.PORT}`);
      console.log(`⚡ OPTIMIZED MODE: Data generation starts only when clients connect`);
      console.log(`📊 Will manage ${CONFIG.TOTAL_SYMBOLS} stock symbols when active`);
      console.log(`📋 Will manage ${CONFIG.TABLE_ELEMENTS} table elements when active`);
      console.log(`🏠 Homepage updates: every ${CONFIG.HOMEPAGE_UPDATE_INTERVAL}ms`);
      console.log(`📈 Chart updates: every ${CONFIG.CHART_UPDATE_INTERVAL}ms`);
      console.log(`🕯️  Candle duration: ${CONFIG.CHART_CANDLE_DURATION}ms`);
      console.log(`🔄 Update interval: ${CONFIG.UPDATE_INTERVAL}ms`);
      console.log(`📡 Broadcast interval: ${CONFIG.BROADCAST_INTERVAL}ms`);
      console.log(`📤 Table updates: ${CONFIG.TABLE_UPDATES_PER_SECOND}/second`);
      console.log(`💤 Currently IDLE - waiting for client connections`);
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
  stopAllUpdates();
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('\nSIGINT received, shutting down gracefully...');
  stopAllUpdates();
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});