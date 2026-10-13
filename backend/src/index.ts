import { createServer } from 'node:http';
import { env } from './config/env.js';
import { sequelize } from './db/sequelize.js';
import { ensureColumns } from './db/migrate.js';
import './models/index.js';
import { app } from './app.js';
import { startDevPresence } from './lib/devPresence.js';
import { initSocket } from './socket.js';
import { purgeExpiredStatuses } from './routes/status.routes.js';
import { agoraConfigured, sweepStaleCalls } from './services/calls.js';

async function main() {
  await sequelize.authenticate();
  console.log(`✅ MySQL connected (${env.DB_NAME})`);

  // Development me nayi tables apne aap ban jaati hain.
  // `alter: true` mat lagana — MariaDB pe har restart pe duplicate unique index banata hai.
  // Purani table me column jodne ke liye: Wallet se pehle Sequelize migrations pe shift karenge.
  if (env.NODE_ENV === 'development') {
    await ensureColumns();
    await sequelize.sync();
    startDevPresence();
  }

  // 24 ghante purane status saaf (start pe + har 30 min)
  purgeExpiredStatuses().catch(() => {});
  setInterval(() => purgeExpiredStatuses().catch(() => {}), 30 * 60_000).unref();

  // Atki hui calls (server restart / app crash) saaf
  sweepStaleCalls().catch(() => {});
  setInterval(() => sweepStaleCalls().catch(() => {}), 60_000).unref();
  if (!agoraConfigured()) console.log('⚠️  Agora keys missing (.env AGORA_APP_ID / AGORA_APP_CERTIFICATE) — video calls disabled');

  // Express (REST) aur Socket.io (real-time chat) ek hi port pe
  const http = createServer(app);
  initSocket(http);
  http.listen(env.PORT, () => {
    console.log(`🚀 API + Socket running on http://localhost:${env.PORT}`);
  });
}

main().catch(err => {
  console.error('❌ Failed to start server:', err);
  process.exit(1);
});
