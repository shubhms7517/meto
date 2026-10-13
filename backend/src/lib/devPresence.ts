import { Op } from 'sequelize';
import { User } from '../models/index.js';

/**
 * SIRF DEVELOPMENT: kuch seed (test) users ko "online" rakhta hai, taaki
 * Discover / Online now ki testing ho sake. Ye asli users ko kabhi touch nahi karta
 * (sirf firebase_uid "seed_" se shuru hone wale), aur production me chalta hi nahi.
 */
const ALWAYS_ONLINE = ['seed_user_2', 'seed_user_3', 'seed_user_4', 'seed_user_6', 'seed_user_8', 'seed_user_11', 'seed_user_12', 'seed_user_15'];

export function startDevPresence() {
  const tick = () =>
    User.update(
      { lastSeenAt: new Date() },
      { where: { firebaseUid: { [Op.in]: ALWAYS_ONLINE } }, silent: true },
    ).catch(() => {});
  tick();
  setInterval(tick, 45_000).unref();
  console.log(`🧪 Dev presence: ${ALWAYS_ONLINE.length} test users kept online`);
}
