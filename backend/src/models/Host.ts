import { CreationOptional, DataTypes, InferAttributes, InferCreationAttributes, Model } from 'sequelize';
import { sequelize } from '../db/sequelize.js';

// Owner ke admin panel se badalne wali settings (host ka hissa, rate, withdraw...). key → JSON value
export class AppSetting extends Model<InferAttributes<AppSetting>, InferCreationAttributes<AppSetting>> {
  declare key: string;
  declare value: unknown;
  declare updatedAt: CreationOptional<Date>;
}

AppSetting.init(
  {
    key: { type: DataTypes.STRING(60), primaryKey: true },
    value: { type: DataTypes.JSON, allowNull: false },
    updatedAt: DataTypes.DATE,
  },
  { sequelize, tableName: 'app_settings', createdAt: false },
);

// Agency: ladkiyan laati hai. Code (jaise AG1045) host form me daala jaata hai.
export const AGENCY_STATUSES = ['active', 'disabled'] as const;

export class Agency extends Model<InferAttributes<Agency>, InferCreationAttributes<Agency>> {
  declare id: CreationOptional<number>;
  declare code: string;
  declare name: string;
  declare commissionPct: CreationOptional<number>; // host ki kamai ka kitna % agency ko (company ke hisse se)
  declare status: CreationOptional<(typeof AGENCY_STATUSES)[number]>;
  declare email: CreationOptional<string | null>; // agency portal login
  declare passwordHash: CreationOptional<string | null>;
  declare lastLoginAt: CreationOptional<Date | null>;
  declare failedLogins: CreationOptional<number>;
  declare lockedUntil: CreationOptional<Date | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  toPortalJSON() {
    return { id: this.id, code: this.code, name: this.name, email: this.email, commissionPct: Number(this.commissionPct) };
  }
}

Agency.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    code: { type: DataTypes.STRING(20), allowNull: false, unique: true },
    name: { type: DataTypes.STRING(80), allowNull: false },
    commissionPct: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
    status: { type: DataTypes.ENUM(...AGENCY_STATUSES), allowNull: false, defaultValue: 'active' },
    email: { type: DataTypes.STRING(160), allowNull: true, defaultValue: null },
    passwordHash: { type: DataTypes.STRING(255), allowNull: true, defaultValue: null },
    lastLoginAt: { type: DataTypes.DATE, allowNull: true, defaultValue: null },
    failedLogins: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
    lockedUntil: { type: DataTypes.DATE, allowNull: true, defaultValue: null },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  { sequelize, tableName: 'agencies' },
);

// Agency portal login session (admin se alag) — token ka sirf hash DB me
export class AgencySession extends Model<InferAttributes<AgencySession>, InferCreationAttributes<AgencySession>> {
  declare id: CreationOptional<number>;
  declare agencyId: number;
  declare tokenHash: string;
  declare ip: string | null;
  declare userAgent: string | null;
  declare expiresAt: Date;
  declare lastUsedAt: Date;
  declare createdAt: CreationOptional<Date>;
}

AgencySession.init(
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    agencyId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    tokenHash: { type: DataTypes.CHAR(64), allowNull: false, unique: true },
    ip: { type: DataTypes.STRING(64), allowNull: true },
    userAgent: { type: DataTypes.STRING(255), allowNull: true },
    expiresAt: { type: DataTypes.DATE, allowNull: false },
    lastUsedAt: { type: DataTypes.DATE, allowNull: false },
    createdAt: DataTypes.DATE,
  },
  { sequelize, tableName: 'agency_sessions', updatedAt: false },
);

// Host ki application + host ki settings. Approve hone par users.role = 'host'.
export const HOST_STATUSES = ['pending', 'approved', 'rejected', 'suspended'] as const;
export type HostStatus = (typeof HOST_STATUSES)[number];

export class HostProfile extends Model<InferAttributes<HostProfile>, InferCreationAttributes<HostProfile>> {
  declare userId: number;
  declare agencyId: number | null;
  declare status: CreationOptional<HostStatus>;
  declare rate: CreationOptional<number>; // gems per minute jo user dega (host chunti hai)
  declare available: CreationOptional<boolean>; // "Online for calls" switch
  declare application: Record<string, unknown> | null; // photos, video, selfie, dob
  declare rejectReason: string | null;
  declare reviewedAt: Date | null;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

HostProfile.init(
  {
    userId: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true },
    agencyId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    status: { type: DataTypes.ENUM(...HOST_STATUSES), allowNull: false, defaultValue: 'pending' },
    rate: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 1000 },
    available: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    application: { type: DataTypes.JSON, allowNull: true },
    rejectReason: { type: DataTypes.STRING(200), allowNull: true },
    reviewedAt: { type: DataTypes.DATE, allowNull: true },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  { sequelize, tableName: 'host_profiles', indexes: [{ fields: ['status'] }, { fields: ['agency_id'] }] },
);

// Host ki kamai: points (gems se alag). 100 points = ₹1 (setting).
export class HostWallet extends Model<InferAttributes<HostWallet>, InferCreationAttributes<HostWallet>> {
  declare userId: number;
  declare points: CreationOptional<number>;
  declare totalEarned: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

HostWallet.init(
  {
    userId: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true },
    points: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false, defaultValue: 0 },
    totalEarned: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false, defaultValue: 0 },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  { sequelize, tableName: 'host_wallets' },
);

export const HOST_TX_KINDS = ['call', 'gift', 'withdraw', 'refund', 'admin', 'message', 'unlock'] as const;
export type HostTxKind = (typeof HOST_TX_KINDS)[number];

// Points ka ledger: har kamai / withdraw ki ek line
export class HostTx extends Model<InferAttributes<HostTx>, InferCreationAttributes<HostTx>> {
  declare id: CreationOptional<number>;
  declare userId: number;
  declare kind: HostTxKind;
  declare points: number; // + kamai, − withdraw
  declare balanceAfter: number;
  declare title: string;
  declare subtitle: string | null;
  declare uniqueKey: string | null;
  declare meta: Record<string, unknown> | null;
  declare createdAt: CreationOptional<Date>;
}

HostTx.init(
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    userId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    kind: { type: DataTypes.ENUM(...HOST_TX_KINDS), allowNull: false },
    points: { type: DataTypes.INTEGER, allowNull: false },
    balanceAfter: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    title: { type: DataTypes.STRING(80), allowNull: false },
    subtitle: { type: DataTypes.STRING(120), allowNull: true },
    uniqueKey: { type: DataTypes.STRING(100), allowNull: true, unique: true },
    meta: { type: DataTypes.JSON, allowNull: true },
    createdAt: DataTypes.DATE,
  },
  { sequelize, tableName: 'host_transactions', updatedAt: false, indexes: [{ fields: ['user_id', 'id'] }] },
);
