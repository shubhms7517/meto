import { CreationOptional, DataTypes, InferAttributes, InferCreationAttributes, Model } from 'sequelize';
import { sequelize } from '../db/sequelize.js';

// Har user ka ek wallet. Balance sirf server badalta hai — aur har badlaav ka WalletTx record banta hai.
export class Wallet extends Model<InferAttributes<Wallet>, InferCreationAttributes<Wallet>> {
  declare userId: number;
  declare balance: CreationOptional<number>;
  declare firstRechargeAt: CreationOptional<Date | null>; // null = pehli recharge ka 2× bonus abhi baaki
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

Wallet.init(
  {
    userId: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true },
    balance: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
    firstRechargeAt: { type: DataTypes.DATE, allowNull: true, defaultValue: null },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  { sequelize, tableName: 'wallets' },
);

export const TX_KINDS = ['recharge', 'bonus', 'call', 'gift', 'checkin', 'refund', 'admin', 'message', 'unlock', 'agency'] as const;
export type TxKind = (typeof TX_KINDS)[number];

// Ledger: gems ka har aana-jaana. amount + = aaye, − = gaye.
export class WalletTx extends Model<InferAttributes<WalletTx>, InferCreationAttributes<WalletTx>> {
  declare id: CreationOptional<number>;
  declare userId: number;
  declare kind: TxKind;
  declare amount: number;
  declare balanceAfter: number;
  declare title: string;
  declare subtitle: string | null;
  declare uniqueKey: string | null; // ek hi cheez do baar na jude (purchase token, call id...)
  declare meta: Record<string, unknown> | null;
  declare createdAt: CreationOptional<Date>;
}

WalletTx.init(
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    userId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    kind: { type: DataTypes.ENUM(...TX_KINDS), allowNull: false },
    amount: { type: DataTypes.INTEGER, allowNull: false },
    balanceAfter: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    title: { type: DataTypes.STRING(80), allowNull: false },
    subtitle: { type: DataTypes.STRING(120), allowNull: true },
    uniqueKey: { type: DataTypes.STRING(100), allowNull: true, unique: true },
    meta: { type: DataTypes.JSON, allowNull: true },
    createdAt: DataTypes.DATE,
  },
  { sequelize, tableName: 'wallet_transactions', updatedAt: false, indexes: [{ fields: ['user_id', 'id'] }] },
);
