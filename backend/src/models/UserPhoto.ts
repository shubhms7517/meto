import { CreationOptional, DataTypes, InferAttributes, InferCreationAttributes, Model } from 'sequelize';
import { sequelize } from '../db/sequelize.js';

// Profile album. isLocked = private photo (baad me VIP/coins se unlock)
export class UserPhoto extends Model<InferAttributes<UserPhoto>, InferCreationAttributes<UserPhoto>> {
  declare id: CreationOptional<number>;
  declare userId: number;
  declare url: string;
  declare isLocked: CreationOptional<boolean>;
  declare position: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
}

UserPhoto.init(
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    userId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    url: { type: DataTypes.STRING(500), allowNull: false },
    isLocked: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    position: { type: DataTypes.SMALLINT.UNSIGNED, allowNull: false, defaultValue: 0 },
    createdAt: DataTypes.DATE,
  },
  { sequelize, tableName: 'user_photos', updatedAt: false, indexes: [{ fields: ['user_id', 'position'] }] },
);
