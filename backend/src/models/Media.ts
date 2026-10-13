import { CreationOptional, DataTypes, InferAttributes, InferCreationAttributes, Model } from 'sequelize';
import { sequelize } from '../db/sequelize.js';

// Host ke profile videos (pehla free, baaki user gems se kholta hai)
export class UserVideo extends Model<InferAttributes<UserVideo>, InferCreationAttributes<UserVideo>> {
  declare id: CreationOptional<number>;
  declare userId: number;
  declare url: string;
  declare position: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
}

UserVideo.init(
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    userId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    url: { type: DataTypes.STRING(500), allowNull: false },
    position: { type: DataTypes.SMALLINT.UNSIGNED, allowNull: false, defaultValue: 0 },
    createdAt: DataTypes.DATE,
  },
  { sequelize, tableName: 'user_videos', updatedAt: false, indexes: [{ fields: ['user_id', 'position'] }] },
);

export const MEDIA_KINDS = ['photo', 'video'] as const;
export type MediaKind = (typeof MEDIA_KINDS)[number];

// Kis user ne host ki kaun si photo / video gems dekar kholi (ek baar kholi = hamesha khuli)
export class MediaUnlock extends Model<InferAttributes<MediaUnlock>, InferCreationAttributes<MediaUnlock>> {
  declare id: CreationOptional<number>;
  declare userId: number;
  declare kind: MediaKind;
  declare mediaId: number;
  declare price: number;
  declare createdAt: CreationOptional<Date>;
}

MediaUnlock.init(
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    userId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    kind: { type: DataTypes.ENUM(...MEDIA_KINDS), allowNull: false },
    mediaId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    price: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    createdAt: DataTypes.DATE,
  },
  { sequelize, tableName: 'media_unlocks', updatedAt: false, indexes: [{ unique: true, fields: ['user_id', 'kind', 'media_id'] }] },
);
