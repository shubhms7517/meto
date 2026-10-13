import React from 'react';
import { DarkTheme, NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import SplashScreen from '../screens/auth/SplashScreen';
import WelcomeScreen from '../screens/auth/WelcomeScreen';
import PhoneScreen from '../screens/auth/PhoneScreen';
import OtpScreen from '../screens/auth/OtpScreen';
import ProfileSetupScreen from '../screens/auth/ProfileSetupScreen';
import ProfileScreen from '../screens/profile/ProfileScreen';
import ChatScreen from '../screens/chat/ChatScreen';
import BlockedUsersScreen from '../screens/settings/BlockedUsersScreen';
import AddStatusScreen from '../screens/status/AddStatusScreen';
import StatusViewerScreen from '../screens/status/StatusViewerScreen';
import CallScreen from '../screens/call/CallScreen';
import WalletScreen from '../screens/wallet/WalletScreen';
import WalletHistoryScreen from '../screens/wallet/WalletHistoryScreen';
import HostIntroScreen from '../screens/host/HostIntroScreen';
import HostApplyScreen from '../screens/host/HostApplyScreen';
import HostSelfieScreen from '../screens/host/HostSelfieScreen';
import HostVideoScreen from '../screens/host/HostVideoScreen';
import HostEarningsScreen from '../screens/host/HostEarningsScreen';
import WithdrawScreen from '../screens/host/WithdrawScreen';
import PayoutAccountScreen from '../screens/host/PayoutAccountScreen';
import WithdrawalsScreen from '../screens/host/WithdrawalsScreen';
import EditProfileScreen from '../screens/settings/EditProfileScreen';
import CustomerServiceScreen from '../screens/settings/CustomerServiceScreen';
import SettingsScreen from '../screens/settings/SettingsScreen';
import VisitorsScreen from '../screens/main/VisitorsScreen';
import DeleteAccountScreen from '../screens/settings/DeleteAccountScreen';
import LegalScreen from '../screens/settings/LegalScreen';
import HostStatusScreen from '../screens/host/HostStatusScreen';
import VipScreen from '../screens/wallet/VipScreen';
import LevelScreen from '../screens/wallet/LevelScreen';
import NotificationsScreen from '../screens/notifications/NotificationsScreen';
import MatchScreen from '../screens/match/MatchScreen';
import { navigationRef } from './ref';
import MainTabs from './MainTabs';
import { colors } from '../theme';
import type { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

const theme = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, background: colors.bg, primary: colors.rose1 },
};

export default function RootNavigator() {
  return (
    <NavigationContainer theme={theme} ref={navigationRef}>
      <Stack.Navigator
        initialRouteName="Splash"
        screenOptions={{ headerShown: false, animation: 'slide_from_right', contentStyle: { backgroundColor: colors.bg } }}>
        <Stack.Screen name="Splash" component={SplashScreen} options={{ animation: 'fade' }} />
        <Stack.Screen name="Welcome" component={WelcomeScreen} options={{ animation: 'fade' }} />
        <Stack.Screen name="Phone" component={PhoneScreen} />
        <Stack.Screen name="Otp" component={OtpScreen} />
        <Stack.Screen name="ProfileSetup" component={ProfileSetupScreen} />
        <Stack.Screen name="Main" component={MainTabs} options={{ animation: 'fade' }} />
        <Stack.Screen name="Profile" component={ProfileScreen} />
        <Stack.Screen name="Chat" component={ChatScreen} />
        <Stack.Screen name="BlockedUsers" component={BlockedUsersScreen} />
        <Stack.Screen name="AddStatus" component={AddStatusScreen} options={{ animation: 'slide_from_bottom' }} />
        <Stack.Screen name="StatusViewer" component={StatusViewerScreen} options={{ animation: 'fade' }} />
        <Stack.Screen name="Wallet" component={WalletScreen} />
        <Stack.Screen name="WalletHistory" component={WalletHistoryScreen} />
        <Stack.Screen name="Vip" component={VipScreen} />
        <Stack.Screen name="Level" component={LevelScreen} />
        <Stack.Screen name="HostIntro" component={HostIntroScreen} />
        <Stack.Screen name="HostApply" component={HostApplyScreen} />
        <Stack.Screen name="HostSelfie" component={HostSelfieScreen} />
        <Stack.Screen name="HostVideo" component={HostVideoScreen} />
        <Stack.Screen name="HostEarnings" component={HostEarningsScreen} />
        <Stack.Screen name="Withdraw" component={WithdrawScreen} />
        <Stack.Screen name="PayoutAccount" component={PayoutAccountScreen} />
        <Stack.Screen name="Withdrawals" component={WithdrawalsScreen} />
        <Stack.Screen name="EditProfile" component={EditProfileScreen} />
        <Stack.Screen name="CustomerService" component={CustomerServiceScreen} />
        <Stack.Screen name="Settings" component={SettingsScreen} />
        <Stack.Screen name="Visitors" component={VisitorsScreen} />
        <Stack.Screen name="DeleteAccount" component={DeleteAccountScreen} />
        <Stack.Screen name="Legal" component={LegalScreen} />
        <Stack.Screen name="HostStatus" component={HostStatusScreen} />
        <Stack.Screen name="Notifications" component={NotificationsScreen} />
        <Stack.Screen name="Match" component={MatchScreen} options={{ animation: 'slide_from_bottom' }} />
        <Stack.Screen name="Call" component={CallScreen} options={{ animation: 'fade', gestureEnabled: false }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
