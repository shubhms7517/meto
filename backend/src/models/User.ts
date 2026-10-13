import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  NonAttribute,
} from 'sequelize';
import type { HostProfile } from './Host.js';
import { sequelize } from '../db/sequelize.js';
import { ageOn, isOnline } from '../lib/age.js';
import { busyUsers } from '../lib/presence.js';

export const GENDERS = ['male', 'female', 'other'] as const;
export type Gender = (typeof GENDERS)[number];

// active = normal, under_review = reports ki wajah se check ho raha, banned = block
export const USER_STATUSES = ['active', 'under_review', 'banned'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

// user = paise dekar call karta hai, host = approved host (call leti hai, kamati hai). Sirf server/admin badalta hai.
export const USER_ROLES = ['user', 'host'] as const;
export type UserRole = (typeof USER_ROLES)[number];

const NEW_USER_DAYS = 7;

// Settings ke switch (DB me sirf jo badla wo; baaki default)
export const PREF_DEFAULTS = {
  pushMessages: true,
  pushMissedCalls: true,
  pushGifts: true, // host: gifts & earnings
  pushOffers: false,
  hostCanCall: true, // user: hosts mujhe call kar sakti hain
};
export type Prefs = typeof PREF_DEFAULTS;

type NonColumns = { omit: 'isProfileComplete' | 'age' | 'online' | 'languageList' | 'isVip' | 'isHost' | 'host' | 'settings' };

export class User extends Model<InferAttributes<User, NonColumns>, InferCreationAttributes<User, NonColumns>> {
  declare id: CreationOptional<number>;
  declare publicId: number; // app me dikhne wala ID (jaise ID:100853803)
  declare firebaseUid: string;
  declare phone: string | null;
  declare email: string | null;
  declare authProvider: 'phone' | 'google';

  declare name: string | null;
  declare gender: Gender | null;
  declare birthday: string | null; // YYYY-MM-DD
  declare bio: string | null;
  declare avatarUrl: string | null;
  declare city: string | null;
  declare country: CreationOptional<string>; // ISO code, jaise "IN"
  declare languages: string | null; // "Hindi,English"

  declare role: CreationOptional<UserRole>;
  declare prefs: CreationOptional<Partial<Prefs> | null>;
  declare inviteAgencyId: CreationOptional<number | null>; // agency link se aayi (sirf yahi host ban sakti hai)
  declare visitorsSeenAt: CreationOptional<Date | null>; // Visitors list kab dekhi (naye ginne ke liye)
  declare host?: NonAttribute<HostProfile>; // include: 'host' se aata hai

  declare isVerified: CreationOptional<boolean>; // selfie verification ke baad (baad ka phase)
  declare level: CreationOptional<number>;
  declare xp: CreationOptional<number>; // gems kharch = XP (level isi se)
  declare vipUntil: CreationOptional<Date | null>;

  declare status: CreationOptional<UserStatus>;
  declare lastLoginAt: Date | null;
  declare lastSeenAt: Date | null; // online status ke liye

  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  get isProfileComplete(): boolean {
    return !!(this.name && this.gender && this.birthday);
  }

  get age(): number | null {
    return this.birthday ? ageOn(this.birthday) : null;
  }

  get online(): boolean {
    return isOnline(this.lastSeenAt);
  }

  // Host sirf ladki — role galti se lag bhi jaye to ladka host nahi maana jayega
  get settings(): Prefs {
    const raw = typeof this.prefs === 'string' ? JSON.parse(this.prefs) : this.prefs; // MariaDB JSON → text
    return { ...PREF_DEFAULTS, ...(raw ?? {}) };
  }

  get isHost(): boolean {
    return this.role === 'host' && this.gender === 'female';
  }

  get isVip(): boolean {
    return !!this.vipUntil && this.vipUntil.getTime() > Date.now();
  }

  get languageList(): string[] {
    return this.languages ? this.languages.split(',').filter(Boolean) : [];
  }

  // Sirf khud ke liye — phone, email, birthday sab
  toPublicJSON() {
    return {
      id: this.publicId,
      name: this.name,
      gender: this.gender,
      birthday: this.birthday,
      age: this.age,
      bio: this.bio,
      avatarUrl: this.avatarUrl,
      city: this.city,
      country: this.country,
      languages: this.languageList,
      isVerified: this.isVerified,
      role: this.role,
      level: this.level,
      xp: this.xp,
      isVip: this.isVip,
      vipUntil: this.isVip ? this.vipUntil : null,
      phone: this.phone,
      authProvider: this.authProvider,
      prefs: this.settings,
      email: this.email,
      profileComplete: this.isProfileComplete,
      createdAt: this.createdAt,
    };
  }

  // Doosre users ke liye card (Discover grid) — private data (phone, email, birthday) kabhi nahi
  toCardJSON() {
    return {
      id: this.publicId,
      name: this.name,
      gender: this.gender,
      age: this.age,
      avatarUrl: this.avatarUrl,
      city: this.city,
      isVerified: this.isVerified,
      isVip: this.isVip,
      isHost: this.isHost,
      rate: this.isHost ? (this.host?.rate ?? null) : null, // host ka per-minute rate (include: 'host' ho tab)
      level: this.level,
      online: this.online && !(this.isHost && this.host?.available === false), // host 3 call miss kare to offline
      busy: this.online && busyUsers.has(this.id), // abhi kisi call par
      lastSeenAt: this.online ? null : this.lastSeenAt,
      isNew: Date.now() - this.createdAt.getTime() < NEW_USER_DAYS * 86_400_000,
    };
  }

  // Doosre user ka poora profile page
  toProfileJSON() {
    return {
      ...this.toCardJSON(),
      bio: this.bio,
      country: this.country,
      languages: this.languageList,
      level: this.level,
    };
  }
}

User.init(
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    publicId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, unique: true },
    firebaseUid: { type: DataTypes.STRING(128), allowNull: false, unique: true },
    phone: { type: DataTypes.STRING(20), allowNull: true, unique: true },
    email: { type: DataTypes.STRING(255), allowNull: true },
    authProvider: { type: DataTypes.ENUM('phone', 'google'), allowNull: false },

    name: { type: DataTypes.STRING(40), allowNull: true },
    gender: { type: DataTypes.ENUM(...GENDERS), allowNull: true },
    birthday: { type: DataTypes.DATEONLY, allowNull: true },
    bio: { type: DataTypes.STRING(300), allowNull: true },
    avatarUrl: { type: DataTypes.STRING(500), allowNull: true },
    city: { type: DataTypes.STRING(60), allowNull: true },
    country: { type: DataTypes.STRING(2), allowNull: false, defaultValue: 'IN' },
    languages: { type: DataTypes.STRING(120), allowNull: true },

    role: { type: DataTypes.ENUM(...USER_ROLES), allowNull: false, defaultValue: 'user' },
    prefs: { type: DataTypes.JSON, allowNull: true, defaultValue: null },
    inviteAgencyId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true, defaultValue: null },
    visitorsSeenAt: { type: DataTypes.DATE, allowNull: true, defaultValue: null },
    isVerified: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    level: { type: DataTypes.SMALLINT.UNSIGNED, allowNull: false, defaultValue: 0 },
    xp: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
    vipUntil: { type: DataTypes.DATE, allowNull: true, defaultValue: null },

    status: { type: DataTypes.ENUM(...USER_STATUSES), allowNull: false, defaultValue: 'active' },
    lastLoginAt: { type: DataTypes.DATE, allowNull: true },
    lastSeenAt: { type: DataTypes.DATE, allowNull: true },

    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    tableName: 'users',
    indexes: [{ fields: ['email'] }, { fields: ['status'] }, { fields: ['last_seen_at'] }, { fields: ['role'] }],
  },
);
