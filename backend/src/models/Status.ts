import { CreationOptional, DataTypes, InferAttributes, InferCreationAttributes, Model } from 'sequelize';
import { sequelize } from '../db/sequelize.js';

export const STATUS_VISIBILITY = ['everyone', 'followers'] as const;
export type StatusVisibility = (typeof STATUS_VISIBILITY)[number];
export const STATUS_TTL_MS = 24 * 60 * 60_000;

// 24 ghante wala photo status
export class Status extends Model<InferAttributes<Status>, InferCreationAttributes<Status>> {
  declare id: CreationOptional<number>;
  declare userId: number;
  declare imageUrl: string;
  declare caption: string | null;
  declare visibility: CreationOptional<StatusVisibility>;
  declare expiresAt: Date;
  declare createdAt: CreationOptional<Date>;
}

Status.init(
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    userId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    imageUrl: { type: DataTypes.STRING(500), allowNull: false },
    caption: { type: DataTypes.STRING(200), allowNull: true },
    visibility: { type: DataTypes.ENUM(...STATUS_VISIBILITY), allowNull: false, defaultValue: 'everyone' },
    expiresAt: { type: DataTypes.DATE, allowNull: false },
    createdAt: DataTypes.DATE,
  },
  {
    sequelize,
    tableName: 'statuses',
    updatedAt: false,
    indexes: [{ fields: ['user_id', 'expires_at'] }, { fields: ['expires_at'] }],
  },
);

// Kisne dekha / ❤ kiya — ek viewer ek status pe ek hi row
export class StatusView extends Model<InferAttributes<StatusView>, InferCreationAttributes<StatusView>> {
  declare id: CreationOptional<number>;
  declare statusId: number;
  declare viewerId: number;
  declare liked: CreationOptional<boolean>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

StatusView.init(
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    statusId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    viewerId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    liked: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    tableName: 'status_views',
    indexes: [{ unique: true, fields: ['status_id', 'viewer_id'] }, { fields: ['viewer_id'] }],
  },
);
