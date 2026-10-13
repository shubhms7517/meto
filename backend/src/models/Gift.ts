import { CreationOptional, DataTypes, InferAttributes, InferCreationAttributes, Model } from 'sequelize';
import { sequelize } from '../db/sequelize.js';

// Gift catalog (rose, cake, car...). price coins me.
export class Gift extends Model<InferAttributes<Gift>, InferCreationAttributes<Gift>> {
  declare id: CreationOptional<number>;
  declare name: string;
  declare icon: string; // abhi emoji, baad me image/animation URL
  declare price: number;
  declare isRare: CreationOptional<boolean>;
  declare isActive: CreationOptional<boolean>;
}

Gift.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    name: { type: DataTypes.STRING(40), allowNull: false, unique: true },
    icon: { type: DataTypes.STRING(255), allowNull: false },
    price: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    isRare: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  },
  { sequelize, tableName: 'gifts', timestamps: false },
);

// Kisne kisko kaunsa gift kitni baar bheja.
// Bhejna (coins kaatna) Wallet phase me banega — abhi sirf seed + display.
export class GiftTransaction extends Model<InferAttributes<GiftTransaction>, InferCreationAttributes<GiftTransaction>> {
  declare id: CreationOptional<number>;
  declare senderId: number;
  declare receiverId: number;
  declare giftId: number;
  declare quantity: number;
  declare totalPrice: number;
  declare createdAt: CreationOptional<Date>;
}

GiftTransaction.init(
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    senderId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    receiverId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    giftId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    quantity: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    totalPrice: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    createdAt: DataTypes.DATE,
  },
  { sequelize, tableName: 'gift_transactions', updatedAt: false, indexes: [{ fields: ['receiver_id'] }, { fields: ['sender_id'] }] },
);
