import { CreationOptional, DataTypes, InferAttributes, InferCreationAttributes, Model } from 'sequelize';
import { sequelize } from '../db/sequelize.js';

// Har notification kisi asli event se banti hai (nakli kuch nahi)
export const NOTIF_TYPES = ['call_missed', 'gift', 'follow', 'level_up', 'recharge', 'vip', 'notice', 'checkin', 'vip_ending', 'report'] as const;
export type NotifType = (typeof NOTIF_TYPES)[number];

export class Notification extends Model<InferAttributes<Notification>, InferCreationAttributes<Notification>> {
  declare id: CreationOptional<number>;
  declare userId: number;
  declare type: NotifType;
  declare actorId: number | null; // kisne kiya (gift bheja, follow kiya...)
  declare data: Record<string, unknown> | null;
  declare uniqueKey: string | null; // ek hi event do baar na bane
  declare readAt: Date | null;
  declare createdAt: CreationOptional<Date>;
}

Notification.init(
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    userId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    type: { type: DataTypes.ENUM(...NOTIF_TYPES), allowNull: false },
    actorId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    data: { type: DataTypes.JSON, allowNull: true },
    uniqueKey: { type: DataTypes.STRING(120), allowNull: true, unique: true },
    readAt: { type: DataTypes.DATE, allowNull: true },
    createdAt: DataTypes.DATE,
  },
  { sequelize, tableName: 'notifications', updatedAt: false, indexes: [{ fields: ['user_id', 'id'] }, { fields: ['user_id', 'read_at'] }] },
);
