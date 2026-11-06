import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { createStore, openDatabase } from './db.js';
import { loadZone } from './movable.js';
import { createSseHub } from './sse.js';

const config = loadConfig();
const model = loadZone(config.zoneFile);
const db = openDatabase(config.dataDir);
const store = createStore(db);
const hub = createSseHub();
const app = createApp({ config, store, model, hub });

const server = app.listen(config.port, config.host, () => {
  console.log(`Layout service nghe tại ${config.host}:${config.port}`);
});

function shutdown(signal) {
  console.log(`Nhận ${signal}, đang dừng Layout service`);
  // Đóng luồng SSE trước, nếu không server.close() sẽ chờ các kết nối dài.
  hub.closeAll();
  server.close(() => {
    store.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 5000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
