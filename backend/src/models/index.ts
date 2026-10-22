// Saare models + unke relations ek jagah. Server aur scripts isi file ko import karte hain.
import { Call } from './Call.js';
import { Conversation, Message } from './Chat.js';
import { Follow } from './Follow.js';
import { Block, Report } from './Safety.js';
import { Status, StatusView } from './Status.js';
import { Gift, GiftTransaction } from './Gift.js';
import { User } from './User.js';
import { UserPhoto } from './UserPhoto.js';
import { Wallet, WalletTx } from './Wallet.js';
import { CheckIn, VipOrder } from './Rewards.js';
import { Notification } from './Notification.js';
import { Agency, AgencyGemTx, AgencyPayout, AgencySession, AppSetting, HostProfile, HostTx, HostWallet } from './Host.js';
import { DeviceToken } from './Device.js';
import { MediaUnlock, UserVideo } from './Media.js';
import { PayoutAccount, Withdrawal } from './Payout.js';
import { ProfileVisit } from './Visit.js';
import { Admin, AdminSession, AuditLog, ADMIN_ROLES, DeletedAccount, type AdminRole } from './Admin.js';
import { SupportMessage, SupportTicket, SUPPORT_TOPICS, type SupportTopic } from './Support.js';

const cascade = { onDelete: 'CASCADE' as const };

User.hasMany(UserPhoto, { as: 'photos', foreignKey: 'userId', ...cascade });
UserPhoto.belongsTo(User, { foreignKey: 'userId', ...cascade });

Follow.belongsTo(User, { as: 'follower', foreignKey: 'followerId', ...cascade });
Follow.belongsTo(User, { as: 'following', foreignKey: 'followingId', ...cascade });

GiftTransaction.belongsTo(User, { as: 'sender', foreignKey: 'senderId', ...cascade });
GiftTransaction.belongsTo(User, { as: 'receiver', foreignKey: 'receiverId', ...cascade });
GiftTransaction.belongsTo(Gift, { foreignKey: 'giftId', onDelete: 'RESTRICT' });

Conversation.belongsTo(User, { as: 'userLow', foreignKey: 'userLowId', ...cascade });
Conversation.belongsTo(User, { as: 'userHigh', foreignKey: 'userHighId', ...cascade });
Conversation.hasMany(Message, { foreignKey: 'conversationId', ...cascade });
Message.belongsTo(Conversation, { foreignKey: 'conversationId', ...cascade });
Message.belongsTo(User, { as: 'sender', foreignKey: 'senderId', ...cascade });
Message.belongsTo(User, { as: 'receiver', foreignKey: 'receiverId', ...cascade });

Block.belongsTo(User, { as: 'blocker', foreignKey: 'blockerId', ...cascade });
Block.belongsTo(User, { as: 'blocked', foreignKey: 'blockedId', ...cascade });
Report.belongsTo(User, { as: 'reporter', foreignKey: 'reporterId', ...cascade });
Report.belongsTo(User, { as: 'reported', foreignKey: 'reportedId', ...cascade });

User.hasMany(Status, { as: 'statuses', foreignKey: 'userId', ...cascade });
Status.belongsTo(User, { foreignKey: 'userId', ...cascade });
Status.hasMany(StatusView, { as: 'views', foreignKey: 'statusId', ...cascade });
StatusView.belongsTo(Status, { foreignKey: 'statusId', ...cascade });
StatusView.belongsTo(User, { as: 'viewer', foreignKey: 'viewerId', ...cascade });

Call.belongsTo(User, { as: 'caller', foreignKey: 'callerId', ...cascade });
Call.belongsTo(User, { as: 'callee', foreignKey: 'calleeId', ...cascade });

User.hasOne(Wallet, { foreignKey: 'userId', ...cascade });
Wallet.belongsTo(User, { foreignKey: 'userId', ...cascade });
WalletTx.belongsTo(User, { foreignKey: 'userId', ...cascade });
Notification.belongsTo(User, { foreignKey: 'userId', ...cascade });
Notification.belongsTo(User, { as: 'actor', foreignKey: 'actorId', ...cascade });
CheckIn.belongsTo(User, { foreignKey: 'userId', ...cascade });
VipOrder.belongsTo(User, { foreignKey: 'userId', ...cascade });

User.hasOne(HostProfile, { as: 'host', foreignKey: 'userId', ...cascade });
HostProfile.belongsTo(User, { foreignKey: 'userId', ...cascade });
HostProfile.belongsTo(Agency, { foreignKey: 'agencyId', onDelete: 'SET NULL' });
Agency.hasMany(HostProfile, { foreignKey: 'agencyId', onDelete: 'SET NULL' });
HostWallet.belongsTo(User, { foreignKey: 'userId', ...cascade });
HostTx.belongsTo(User, { foreignKey: 'userId', ...cascade });
DeviceToken.belongsTo(User, { foreignKey: 'userId', ...cascade });
User.hasMany(UserVideo, { as: 'videos', foreignKey: 'userId', ...cascade });
UserVideo.belongsTo(User, { foreignKey: 'userId', ...cascade });
MediaUnlock.belongsTo(User, { foreignKey: 'userId', ...cascade });
PayoutAccount.belongsTo(User, { foreignKey: 'userId', ...cascade });
Withdrawal.belongsTo(User, { foreignKey: 'userId', ...cascade });
ProfileVisit.belongsTo(User, { as: 'owner', foreignKey: 'ownerId', ...cascade });
ProfileVisit.belongsTo(User, { as: 'viewer', foreignKey: 'viewerId', ...cascade });
SupportTicket.belongsTo(User, { as: 'user', foreignKey: 'userId', ...cascade });
SupportMessage.belongsTo(SupportTicket, { as: 'ticket', foreignKey: 'ticketId', ...cascade });

export { Admin, AdminSession, AuditLog, ADMIN_ROLES, DeletedAccount, type AdminRole };
export { SupportMessage, SupportTicket, SUPPORT_TOPICS, type SupportTopic };
export { ProfileVisit, PayoutAccount, Withdrawal, MediaUnlock, UserVideo, DeviceToken, Agency, AgencyGemTx, AgencyPayout, AgencySession, AppSetting, HostProfile, HostTx, HostWallet, Block, CheckIn, Notification, VipOrder, Call, Conversation, Follow, Gift, GiftTransaction, Message, Report, Status, StatusView, User, UserPhoto, Wallet, WalletTx };
