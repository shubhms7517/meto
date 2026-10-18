import { CreationOptional, DataTypes, InferAttributes, InferCreationAttributes, Model } from 'sequelize';
import { sequelize } from '../db/sequelize.js';

// Admin panel ke log (app ke users se bilkul alag — apna email + password)
export const ADMIN_ROLES = ['owner', 'moderator', 'support', 'finance'] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

export class Admin extends Model<InferAttributes<Admin>, InferCreationAttributes<Admin>> {
  declare id: CreationOptional<number>;
  declare email: string;
  declare name: string;
  declare role: AdminRole;
  declare passwordHash: string; // scrypt:salt:hash
  declare status: CreationOptional<'active' | 'disabled'>;
  declare failedLogins: CreationOptional<number>;
  declare lockedUntil: CreationOptional<Date | null>;
  declare lastLoginAt: CreationOptional<Date | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  toJSONSafe() {
    return { id: this.id, email: this.email, name: this.name, role: this.role, status: this.status, lastLoginAt: this.lastLoginAt };
  }
}

Admin.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    email: { type: DataTypes.STRING(160), allowNull: false, unique: true },
    name: { type: DataTypes.STRING(60), allowNull: false },
    role: { type: DataTypes.ENUM(...ADMIN_ROLES), allowNull: false },
    passwordHash: { type: DataTypes.STRING(255), allowNull: false },
    status: { type: DataTypes.ENUM('active', 'disabled'), allowNull: false, defaultValue: 'active' },
    failedLogins: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
    lockedUntil: { type: DataTypes.DATE, allowNull: true, defaultValue: null },
    lastLoginAt: { type: DataTypes.DATE, allowNull: true, defaultValue: null },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  { sequelize, tableName: 'admins' },
);

// Login session: token ka sirf hash DB me (token chori ho to bhi DB se kaam ka nahi)
export class AdminSession extends Model<InferAttributes<AdminSession>, InferCreationAttributes<AdminSession>> {
  declare id: CreationOptional<number>;
  declare adminId: number;
  declare tokenHash: string;
  declare ip: string | null;
  declare userAgent: string | null;
  declare expiresAt: Date;
  declare lastUsedAt: Date;
  declare createdAt: CreationOptional<Date>;
}

AdminSession.init(
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    adminId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    tokenHash: { type: DataTypes.CHAR(64), allowNull: false, unique: true },
    ip: { type: DataTypes.STRING(64), allowNull: true },
    userAgent: { type: DataTypes.STRING(255), allowNull: true },
    expiresAt: { type: DataTypes.DATE, allowNull: false },
    lastUsedAt: { type: DataTypes.DATE, allowNull: false },
    createdAt: DataTypes.DATE,
  },
  { sequelize, tableName: 'admin_sessions', updatedAt: false },
);

// Audit log: har admin kaam ka record. Sirf INSERT — koi update / delete route nahi
export class AuditLog extends Model<InferAttributes<AuditLog>, InferCreationAttributes<AuditLog>> {
  declare id: CreationOptional<number>;
  declare adminId: number;
  declare action: string; // jaise host.approve, wallet.adjust, setting.update
  declare targetType: string | null; // user / withdrawal / setting / ticket …
  declare targetId: string | null;
  declare summary: string | null; // insaan ke padhne layak
  declare before: unknown;
  declare after: unknown;
  declare ip: string | null;
  declare createdAt: CreationOptional<Date>;
}

AuditLog.init(
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    adminId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    action: { type: DataTypes.STRING(60), allowNull: false },
    targetType: { type: DataTypes.STRING(30), allowNull: true },
    targetId: { type: DataTypes.STRING(64), allowNull: true },
    summary: { type: DataTypes.STRING(500), allowNull: true },
    before: { type: DataTypes.JSON, allowNull: true },
    after: { type: DataTypes.JSON, allowNull: true },
    ip: { type: DataTypes.STRING(64), allowNull: true },
    createdAt: DataTypes.DATE,
  },
  { sequelize, tableName: 'audit_logs', updatedAt: false, indexes: [{ fields: ['created_at'] }, { fields: ['admin_id'] }, { fields: ['target_type', 'target_id'] }] },
);

// Account delete ka record (DPDP / kaanoon): profile data mit jaata hai, sirf ye chhota record bachta hai
export class DeletedAccount extends Model<InferAttributes<DeletedAccount>, InferCreationAttributes<DeletedAccount>> {
  declare id: CreationOptional<number>;
  declare publicId: number;
  declare role: string;
  declare joinedAt: Date | null;
  declare reason: string; // self = user ne app se, admin = panel se
  declare createdAt: CreationOptional<Date>;
}

DeletedAccount.init(
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    publicId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    role: { type: DataTypes.STRING(10), allowNull: false },
    joinedAt: { type: DataTypes.DATE, allowNull: true },
    reason: { type: DataTypes.STRING(20), allowNull: false },
    createdAt: DataTypes.DATE,
  },
  { sequelize, tableName: 'deleted_accounts', updatedAt: false },
);
