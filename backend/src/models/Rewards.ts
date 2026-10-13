import { CreationOptional, DataTypes, InferAttributes, InferCreationAttributes, Model } from 'sequelize';
import { sequelize } from '../db/sequelize.js';

// Roz ka check-in — ek din me ek hi (unique userId + day)
export class CheckIn extends Model<InferAttributes<CheckIn>, InferCreationAttributes<CheckIn>> {
  declare id: CreationOptional<number>;
  declare userId: number;
  declare day: string; // YYYY-MM-DD (India time)
  declare streakDay: number; // 1..7
  declare reward: number;
  declare createdAt: CreationOptional<Date>;
}

CheckIn.init(
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    userId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    day: { type: DataTypes.DATEONLY, allowNull: false },
    streakDay: { type: DataTypes.TINYINT.UNSIGNED, allowNull: false },
    reward: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    createdAt: DataTypes.DATE,
  },
  { sequelize, tableName: 'checkins', updatedAt: false, indexes: [{ unique: true, fields: ['user_id', 'day'] }] },
);

// VIP kharida — har payment ka record (ek token ek hi baar)
export class VipOrder extends Model<InferAttributes<VipOrder>, InferCreationAttributes<VipOrder>> {
  declare id: CreationOptional<number>;
  declare userId: number;
  declare planId: string;
  declare months: number;
  declare priceInr: number;
  declare provider: 'dev' | 'google';
  declare tokenHash: string;
  declare vipUntil: Date;
  declare createdAt: CreationOptional<Date>;
}

VipOrder.init(
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    userId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    planId: { type: DataTypes.STRING(20), allowNull: false },
    months: { type: DataTypes.TINYINT.UNSIGNED, allowNull: false },
    priceInr: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    provider: { type: DataTypes.ENUM('dev', 'google'), allowNull: false },
    tokenHash: { type: DataTypes.CHAR(64), allowNull: false, unique: true },
    vipUntil: { type: DataTypes.DATE, allowNull: false },
    createdAt: DataTypes.DATE,
  },
  { sequelize, tableName: 'vip_orders', updatedAt: false, indexes: [{ fields: ['user_id'] }] },
);
