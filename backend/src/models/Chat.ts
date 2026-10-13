import { CreationOptional, DataTypes, InferAttributes, InferCreationAttributes, Model } from 'sequelize';
import { sequelize } from '../db/sequelize.js';

// Do users ke beech ek hi conversation. userLowId < userHighId (duplicate se bachav)
export class Conversation extends Model<InferAttributes<Conversation>, InferCreationAttributes<Conversation>> {
  declare id: CreationOptional<number>;
  declare userLowId: number;
  declare userHighId: number;
  declare lastMessageId: number | null;
  declare lastMessageAt: Date | null;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  otherUserId(me: number) {
    return this.userLowId === me ? this.userHighId : this.userLowId;
  }
}

Conversation.init(
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    userLowId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    userHighId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    lastMessageId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    lastMessageAt: { type: DataTypes.DATE, allowNull: true },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    tableName: 'conversations',
    indexes: [
      { unique: true, fields: ['user_low_id', 'user_high_id'] },
      { fields: ['user_high_id'] },
      { fields: ['last_message_at'] },
    ],
  },
);

export const MESSAGE_TYPES = ['text', 'image', 'gift', 'system'] as const;
export type MessageType = (typeof MESSAGE_TYPES)[number];

export class Message extends Model<InferAttributes<Message>, InferCreationAttributes<Message>> {
  declare id: CreationOptional<number>;
  declare conversationId: number;
  declare senderId: number;
  declare receiverId: number;
  declare type: CreationOptional<MessageType>;
  declare body: string;
  declare clientId: string | null; // app ka temporary id (dobara bhejne pe duplicate na bane)
  declare deliveredAt: Date | null; // receiver ke phone tak pahuncha (✓✓ grey)
  declare readAt: Date | null; // receiver ne padh liya (✓✓ blue)
  declare createdAt: CreationOptional<Date>;
}

Message.init(
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    conversationId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    senderId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    receiverId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    type: { type: DataTypes.ENUM(...MESSAGE_TYPES), allowNull: false, defaultValue: 'text' },
    body: { type: DataTypes.TEXT, allowNull: false },
    clientId: { type: DataTypes.STRING(64), allowNull: true },
    deliveredAt: { type: DataTypes.DATE, allowNull: true },
    readAt: { type: DataTypes.DATE, allowNull: true },
    createdAt: DataTypes.DATE,
  },
  {
    sequelize,
    tableName: 'messages',
    updatedAt: false,
    indexes: [
      { fields: ['conversation_id', 'id'] },
      { fields: ['receiver_id', 'read_at'] },
      { unique: true, fields: ['sender_id', 'client_id'] },
    ],
  },
);
