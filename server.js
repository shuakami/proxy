const http = require('http');
const handler = require('./api/index.js');

// --- Configuration ---
// Use environment variables for port and Redis URL, with sane defaults.
const PORT = process.env.PORT || 8686;
const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

// Set the Redis URL in the environment, so the existing api/index.js can pick it up.
process.env.REDIS_URL = REDIS_URL;

const server = http.createServer(handler);

server.listen(PORT, () => {
  console.log(`Proxy server is running on http://localhost:${PORT}`);
  console.log(`Connecting to Redis at ${REDIS_URL}`);
});

server.on('error', (err) => {
  console.error('[Server Error]', err);
  process.exit(1);
}); 