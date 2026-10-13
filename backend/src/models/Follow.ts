import { CreationOptional, DataTypes, InferAttributes, InferCreationAttributes, Model } from 'sequelize';
import { sequelize } from '../db/sequelize.js';

// followerId → followingId ko follow karta hai
export class Follow extends Model<InferAttributes<Follow>, InferCreationAttributes<Follow>> {
  declare id: CreationOptional<number>;
  declare followerId: number;
  declare followingId: number;
  declare createdAt: CreationOptional<Date>;
}

Follow.init(
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    followerId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    followingId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    createdAt: DataTypes.DATE,
  },
  {
    sequelize,
    tableName: 'follows',
    updatedAt: false,
    indexes: [
      { unique: true, fields: ['follower_id', 'following_id'] }, // ek hi user ko do baar follow nahi
      { fields: ['following_id'] },
    ],
  },
);
