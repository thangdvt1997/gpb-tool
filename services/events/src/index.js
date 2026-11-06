import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { openDatabase } from './db.js';

const config = loadConfig();
const db = openDatabase(config.dataDir);
const app = createApp({ config, db });

const server = app.listen(config.port, config.host, () => {
  console.log(`Events service nghe tại ${config.host}:${config.port}`);
});

function shutdown(signal) {
  console.log(`Nhận ${signal}, đang dừng Events service`);
  server.close(() => {
    db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 5000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
