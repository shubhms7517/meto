import type { NavigatorScreenParams } from '@react-navigation/native';
import type { UserCard } from '../services/users';
import type { CallInfo } from '../services/calls';

export type MainTabParamList = {
  Users: undefined; // sirf host ko: users ki list (Discover jaisi)
  Discover: undefined;
  Chats: undefined;
  Me: undefined;
};

export type RootStackParamList = {
  Splash: undefined;
  Welcome: undefined;
  Phone: undefined;
  Otp: { phone: string };
  ProfileSetup: undefined;
  Main: NavigatorScreenParams<MainTabParamList> | undefined;
  Profile: { id: number; name?: string }; // doosre user ki profile
  Chat: { id: number; name?: string }; // kisi user ke saath chat (public id)
  BlockedUsers: undefined;
  AddStatus: { uri: string }; // gallery se chuni photo
  StatusViewer: { userId: number | 'me' }; // kiska status dekhna hai
  Wallet: undefined;
  WalletHistory: undefined;
  Vip: undefined;
  Level: undefined;
  Notifications: undefined;
  Match: undefined;
  HostIntro: { invite?: string } | undefined; // "Become a host" (invite = agency link ka code)
  HostApply: { video?: string } | undefined; // form (video HostVideo se wapas aata hai)
  HostVideo: { mode?: 'apply' | 'profile' } | undefined; // front camera, 10 sec apne aap (profile = Me ka intro video)
  HostEarnings: undefined;
  Withdraw: undefined;
  PayoutAccount: undefined; // UPI + PAN
  Withdrawals: undefined; // history
  EditProfile: undefined;
  Settings: undefined;
  Visitors: undefined;
  SupportChat: undefined;
  DeleteAccount: undefined;
  Legal: { kind: 'privacy' | 'terms' | 'host' };
  CustomerService: undefined;
  HostSelfie: { photos: string[]; video: string };
  HostStatus: undefined; // review / reject / approve
  Call: { mode: 'outgoing'; peer: UserCard; source?: 'direct' | 'match' } | { mode: 'incoming'; call: CallInfo };
};
