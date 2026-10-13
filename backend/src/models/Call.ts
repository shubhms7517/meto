import { CreationOptional, DataTypes, InferAttributes, InferCreationAttributes, Model } from 'sequelize';
import { sequelize } from '../db/sequelize.js';

// ringing → accepted → ended
//        ↘ declined / missed (30s me nahi uthaya) / cancelled (caller ne kaata) / busy
export const CALL_STATUSES = ['ringing', 'accepted', 'ended', 'declined', 'missed', 'cancelled', 'busy'] as const;
export type CallStatus = (typeof CALL_STATUSES)[number];

export class Call extends Model<InferAttributes<Call>, InferCreationAttributes<Call>> {
  declare id: CreationOptional<number>;
  declare callerId: number;
  declare calleeId: number;
  declare hostId: CreationOptional<number | null>; // call me host kaun (null = purani call → callee)
  declare channel: string; // Agora channel name
  declare status: CreationOptional<CallStatus>;
  declare rate: number; // coins per minute (call shuru hote waqt ka)
  declare coinsCharged: CreationOptional<number>; // Wallet phase tak 0 (test mode)
  declare answeredAt: Date | null;
  declare endedAt: Date | null;
  declare durationSec: CreationOptional<number>;
  declare endedBy: number | null;
  declare rating: number | null; // caller ki rating 1-5
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

Call.init(
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    callerId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    calleeId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    hostId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true, defaultValue: null },
    channel: { type: DataTypes.STRING(64), allowNull: false, unique: true },
    status: { type: DataTypes.ENUM(...CALL_STATUSES), allowNull: false, defaultValue: 'ringing' },
    rate: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    coinsCharged: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
    answeredAt: { type: DataTypes.DATE, allowNull: true },
    endedAt: { type: DataTypes.DATE, allowNull: true },
    durationSec: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
    endedBy: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    rating: { type: DataTypes.TINYINT.UNSIGNED, allowNull: true },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    tableName: 'calls',
    indexes: [{ fields: ['caller_id', 'created_at'] }, { fields: ['callee_id', 'created_at'] }, { fields: ['status'] }],
  },
);
