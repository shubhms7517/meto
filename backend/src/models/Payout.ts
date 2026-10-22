import { CreationOptional, DataTypes, InferAttributes, InferCreationAttributes, Model } from 'sequelize';
import { sequelize } from '../db/sequelize.js';

// Host ke payout details (ek baar): UPI + PAN. Sirf payouts team dekhti hai.
export class PayoutAccount extends Model<InferAttributes<PayoutAccount>, InferCreationAttributes<PayoutAccount>> {
  declare userId: number;
  declare upiId: string;
  declare upiName: string;
  declare pan: string;
  declare panName: string;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

PayoutAccount.init(
  {
    userId: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true },
    upiId: { type: DataTypes.STRING(120), allowNull: false },
    upiName: { type: DataTypes.STRING(80), allowNull: false },
    pan: { type: DataTypes.STRING(10), allowNull: false },
    panName: { type: DataTypes.STRING(80), allowNull: false },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  { sequelize, tableName: 'payout_accounts' },
);

export const WITHDRAW_STATUSES = ['pending', 'paid', 'rejected'] as const;
export type WithdrawStatus = (typeof WITHDRAW_STATUSES)[number];

// Withdraw request: points request ke waqt hi katte hain; reject → points wapas.
// Rakam paise (paisa = ₹/100) me — decimal ki galti nahi
export class Withdrawal extends Model<InferAttributes<Withdrawal>, InferCreationAttributes<Withdrawal>> {
  declare id: CreationOptional<number>;
  declare userId: number;
  declare points: number; // kitne gems kate
  declare beans: CreationOptional<number>; // host ne kitne beans maange
  declare amountPaise: number; // admin ke rate se ₹ (sirf admin dekhta hai)
  declare tdsPaise: number;
  declare netPaise: number; // host ko milega
  declare upiId: string;
  declare upiName: string;
  declare status: CreationOptional<WithdrawStatus>;
  declare utr: string | null; // bank ka reference (paid)
  declare reason: string | null; // reject ki wajah
  declare paidAt: Date | null;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

Withdrawal.init(
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    userId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    points: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    beans: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false, defaultValue: 0 },
    amountPaise: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    tdsPaise: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    netPaise: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    upiId: { type: DataTypes.STRING(120), allowNull: false },
    upiName: { type: DataTypes.STRING(80), allowNull: false },
    status: { type: DataTypes.ENUM(...WITHDRAW_STATUSES), allowNull: false, defaultValue: 'pending' },
    utr: { type: DataTypes.STRING(40), allowNull: true },
    reason: { type: DataTypes.STRING(200), allowNull: true },
    paidAt: { type: DataTypes.DATE, allowNull: true },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  { sequelize, tableName: 'withdrawals', indexes: [{ fields: ['user_id', 'id'] }, { fields: ['status'] }] },
);
