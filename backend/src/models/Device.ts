import { CreationOptional, DataTypes, InferAttributes, InferCreationAttributes, Model } from 'sequelize';
import { sequelize } from '../db/sequelize.js';

// Phone ka FCM token — app band ho tab bhi push (call ki ghanti, message)
export class DeviceToken extends Model<InferAttributes<DeviceToken>, InferCreationAttributes<DeviceToken>> {
  declare id: CreationOptional<number>;
  declare userId: number;
  declare token: string;
  declare platform: CreationOptional<string>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

DeviceToken.init(
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    userId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    token: { type: DataTypes.STRING(255), allowNull: false, unique: true },
    platform: { type: DataTypes.STRING(10), allowNull: false, defaultValue: 'android' },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  { sequelize, tableName: 'device_tokens', indexes: [{ fields: ['user_id'] }] },
);
