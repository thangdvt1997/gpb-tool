import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { openDatabase } from './db.js';
import { createSseHub } from './sse.js';

const config = loadConfig();
const db = openDatabase(config.dataDir);
const hub = createSseHub();
const app = createApp({ config, db, hub });

const server = app.listen(config.port, config.host, () => {
  console.log(`Display service nghe tại ${config.host}:${config.port}`);
});

function shutdown(signal) {
  console.log(`Nhận ${signal}, đang dừng Display service`);
  // Phải kết thúc luồng SSE trước, nếu không server.close() chờ đến khi timeout.
  hub.closeAll();
  server.close(() => {
    db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 5000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
