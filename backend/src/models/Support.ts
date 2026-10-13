import { CreationOptional, DataTypes, InferAttributes, InferCreationAttributes, Model } from 'sequelize';
import { sequelize } from '../db/sequelize.js';

export const SUPPORT_TOPICS = ['recharge', 'call', 'withdraw', 'account', 'report', 'other'] as const;
export type SupportTopic = (typeof SUPPORT_TOPICS)[number];

// Customer service: user ki ek baat-cheet (ticket). Solved ke baad naya message = naya ticket
export class SupportTicket extends Model<InferAttributes<SupportTicket>, InferCreationAttributes<SupportTicket>> {
  declare id: CreationOptional<number>;
  declare userId: number;
  declare topic: SupportTopic;
  declare status: CreationOptional<'open' | 'solved'>;
  declare userUnread: CreationOptional<number>; // team ke jawab jo user ne abhi nahi dekhe
  declare lastMessageAt: Date;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

SupportTicket.init(
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    userId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    topic: { type: DataTypes.ENUM(...SUPPORT_TOPICS), allowNull: false },
    status: { type: DataTypes.ENUM('open', 'solved'), allowNull: false, defaultValue: 'open' },
    userUnread: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
    lastMessageAt: { type: DataTypes.DATE, allowNull: false },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  { sequelize, tableName: 'support_tickets', indexes: [{ fields: ['user_id', 'id'] }, { fields: ['status', 'last_message_at'] }] },
);

export class SupportMessage extends Model<InferAttributes<SupportMessage>, InferCreationAttributes<SupportMessage>> {
  declare id: CreationOptional<number>;
  declare ticketId: number;
  declare fromTeam: boolean;
  declare body: string | null;
  declare imageUrl: string | null;
  declare createdAt: CreationOptional<Date>;
}

SupportMessage.init(
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    ticketId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    fromTeam: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    body: { type: DataTypes.TEXT, allowNull: true },
    imageUrl: { type: DataTypes.STRING(255), allowNull: true },
    createdAt: DataTypes.DATE,
  },
  { sequelize, tableName: 'support_messages', updatedAt: false, indexes: [{ fields: ['ticket_id', 'id'] }] },
);
