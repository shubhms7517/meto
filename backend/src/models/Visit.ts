import { CreationOptional, DataTypes, InferAttributes, InferCreationAttributes, Model } from 'sequelize';
import { sequelize } from '../db/sequelize.js';

// Kisne kiski profile dekhi: ek viewer = ek row (dobara dekhe to count + lastAt badhta hai)
export class ProfileVisit extends Model<InferAttributes<ProfileVisit>, InferCreationAttributes<ProfileVisit>> {
  declare id: CreationOptional<number>;
  declare ownerId: number;
  declare viewerId: number;
  declare count: CreationOptional<number>;
  declare lastAt: Date;
  declare createdAt: CreationOptional<Date>;
}

ProfileVisit.init(
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    ownerId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    viewerId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    count: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 1 },
    lastAt: { type: DataTypes.DATE, allowNull: false },
    createdAt: DataTypes.DATE,
  },
  {
    sequelize,
    tableName: 'profile_visits',
    updatedAt: false,
    indexes: [{ unique: true, fields: ['owner_id', 'viewer_id'] }, { fields: ['owner_id', 'last_at'] }],
  },
);
