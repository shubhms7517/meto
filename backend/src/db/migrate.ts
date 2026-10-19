import { sequelize } from './sequelize.js';

// sync() purani table me naya column nahi jodta. Jo column chahiye, yahan likho — start pe na ho to jud jayega.
// sync() se PEHLE chalna chahiye (model ke index naye column pe ho sakte hain).
const COLUMNS: { table: string; column: string; ddl: string }[] = [
  { table: 'users', column: 'xp', ddl: 'INT UNSIGNED NOT NULL DEFAULT 0' },
  { table: 'users', column: 'vip_until', ddl: 'DATETIME NULL DEFAULT NULL' },
  { table: 'users', column: 'role', ddl: "ENUM('user','host') NOT NULL DEFAULT 'user' AFTER languages" },
  { table: 'users', column: 'prefs', ddl: 'JSON NULL DEFAULT NULL' },
  { table: 'users', column: 'visitors_seen_at', ddl: 'DATETIME NULL DEFAULT NULL' },
  { table: 'users', column: 'invite_agency_id', ddl: 'BIGINT UNSIGNED NULL DEFAULT NULL' },
  { table: 'gifts', column: 'icon_url', ddl: 'VARCHAR(255) NULL DEFAULT NULL' },
  { table: 'gifts', column: 'svga_url', ddl: 'VARCHAR(255) NULL DEFAULT NULL' },
  { table: 'calls', column: 'host_id', ddl: 'BIGINT UNSIGNED NULL DEFAULT NULL AFTER callee_id' },
  // Agency portal login (owner admin panel se banata hai)
  { table: 'agencies', column: 'email', ddl: 'VARCHAR(160) NULL DEFAULT NULL' },
  { table: 'agencies', column: 'password_hash', ddl: 'VARCHAR(255) NULL DEFAULT NULL' },
  { table: 'agencies', column: 'last_login_at', ddl: 'DATETIME NULL DEFAULT NULL' },
  { table: 'agencies', column: 'failed_logins', ddl: 'INT UNSIGNED NOT NULL DEFAULT 0' },
  { table: 'agencies', column: 'locked_until', ddl: 'DATETIME NULL DEFAULT NULL' },
];

// ENUM me naya value (sync() purana column nahi badalta). need = jo value honi chahiye.
const ENUMS: { table: string; column: string; need: string; ddl: string }[] = [
  { table: 'wallet_transactions', column: 'kind', need: 'unlock', ddl: "ENUM('recharge','bonus','call','gift','checkin','refund','admin','message','unlock') NOT NULL" },
  { table: 'messages', column: 'type', need: 'call', ddl: "ENUM('text','image','gift','system','call') NOT NULL DEFAULT 'text'" },
  { table: 'host_transactions', column: 'kind', need: 'unlock', ddl: "ENUM('call','gift','withdraw','refund','admin','message','unlock') NOT NULL" },
];

async function ensureEnums() {
  for (const e of ENUMS) {
    const [rows] = await sequelize.query(
      'SELECT COLUMN_TYPE AS t FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?',
      { replacements: [e.table, e.column] },
    );
    const t = (rows as { t: string }[])[0]?.t;
    if (!t || t.includes(`'${e.need}'`)) continue;
    await sequelize.query(`ALTER TABLE \`${e.table}\` MODIFY \`${e.column}\` ${e.ddl}`);
    console.log(`🧱 enum ${e.table}.${e.column} += ${e.need}`);
  }
}

export async function ensureColumns() {
  await ensureEnums();
  for (const c of COLUMNS) {
    const [rows] = await sequelize.query(
      'SELECT COUNT(*) AS n FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?',
      { replacements: [c.table, c.column] },
    );
    const [tbl] = await sequelize.query('SELECT COUNT(*) AS n FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?', {
      replacements: [c.table],
    });
    if (Number((tbl as { n: number }[])[0].n) === 0) continue; // table hi nahi — sync() poori bana dega
    if (Number((rows as { n: number }[])[0].n) > 0) continue;
    await sequelize.query(`ALTER TABLE \`${c.table}\` ADD COLUMN \`${c.column}\` ${c.ddl}`);
    console.log(`🧱 added column ${c.table}.${c.column}`);
  }
}
