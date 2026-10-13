import { CreationOptional, DataTypes, InferAttributes, InferCreationAttributes, Model } from 'sequelize';
import { sequelize } from '../db/sequelize.js';

// blockerId ne blockedId ko block kiya — dono ek doosre ko na dekh sakte, na message kar sakte
export class Block extends Model<InferAttributes<Block>, InferCreationAttributes<Block>> {
  declare id: CreationOptional<number>;
  declare blockerId: number;
  declare blockedId: number;
  declare createdAt: CreationOptional<Date>;
}

Block.init(
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    blockerId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    blockedId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    createdAt: DataTypes.DATE,
  },
  {
    sequelize,
    tableName: 'blocks',
    updatedAt: false,
    indexes: [{ unique: true, fields: ['blocker_id', 'blocked_id'] }, { fields: ['blocked_id'] }],
  },
);

export const REPORT_REASONS = ['fake_profile', 'inappropriate_content', 'asking_money', 'harassment', 'underage', 'other'] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export const REPORT_PRIORITIES = ['urgent', 'high', 'normal'] as const;
export type ReportPriority = (typeof REPORT_PRIORITIES)[number];

// Admin panel me review hoga (open → reviewed / dismissed). Report se user pe automatic asar nahi.
export class Report extends Model<InferAttributes<Report>, InferCreationAttributes<Report>> {
  declare id: CreationOptional<number>;
  declare reporterId: number;
  declare reportedId: number;
  declare reason: ReportReason;
  declare priority: CreationOptional<ReportPriority>;
  declare reporterIsNew: CreationOptional<boolean>; // report ke waqt reporter ka account 24h se naya tha
  declare details: string | null;
  declare conversationId: number | null; // chat se report kiya ho to admin chat dekh sake
  declare status: CreationOptional<'open' | 'reviewed' | 'dismissed'>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

Report.init(
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    reporterId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    reportedId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    reason: { type: DataTypes.ENUM(...REPORT_REASONS), allowNull: false },
    priority: { type: DataTypes.ENUM(...REPORT_PRIORITIES), allowNull: false, defaultValue: 'normal' },
    reporterIsNew: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    details: { type: DataTypes.STRING(500), allowNull: true },
    conversationId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    status: { type: DataTypes.ENUM('open', 'reviewed', 'dismissed'), allowNull: false, defaultValue: 'open' },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    tableName: 'reports',
    indexes: [
      { fields: ['reported_id', 'status'] },
      { fields: ['reporter_id', 'reported_id'] },
      { fields: ['status', 'priority', 'created_at'] }, // admin ki list: open + priority + latest
    ],
  },
);
