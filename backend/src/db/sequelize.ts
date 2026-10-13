import { Sequelize } from 'sequelize';
import { env, isProd } from '../config/env.js';

export const sequelize = new Sequelize(env.DB_NAME, env.DB_USER, env.DB_PASSWORD, {
  host: env.DB_HOST,
  port: env.DB_PORT,
  dialect: 'mysql',
  logging: isProd ? false : (sql: string) => console.log(`  [sql] ${sql}`),
  define: {
    underscored: true, // createdAt → created_at
    charset: 'utf8mb4', // emoji support (names, bio)
    collate: 'utf8mb4_unicode_ci',
  },
  pool: { max: 10, min: 0, idle: 10_000 },
});
