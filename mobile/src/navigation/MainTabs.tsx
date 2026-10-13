import React, { useEffect } from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import TabBar from '../components/TabBar';
import DiscoverScreen from '../screens/main/DiscoverScreen';
import ChatsScreen from '../screens/main/ChatsScreen';
import MeScreen from '../screens/main/MeScreen';
import HostMeScreen from '../screens/host/HostMeScreen';
import { useWallet } from '../context/WalletContext';
import { colors } from '../theme';
import { usePresence } from '../hooks/usePresence';
import { useChat } from '../context/ChatContext';
import type { MainTabParamList } from './types';
import { onInvite } from '../lib/invite';
import { navigationRef } from './ref';

const Tab = createBottomTabNavigator<MainTabParamList>();

export default function MainTabs() {
  usePresence(); // login ke baad hi chalta hai (Main tabs sirf logged-in users ke liye)
  const { unreadTotal } = useChat();
  const { amHost } = useWallet(); // approved host → bilkul alag interface (Host · Chats · Me)
  // Agency link (login se pehle ya baad) → Invite screen
  useEffect(() => onInvite(code => navigationRef.isReady() && navigationRef.navigate('HostIntro', { invite: code })), []);
  const chatsBadge = { tabBarBadge: unreadTotal > 0 ? (unreadTotal > 99 ? '99+' : unreadTotal) : undefined };
  if (amHost) {
    return (
      <Tab.Navigator
        key="host"
        tabBar={props => <TabBar {...props} />}
        screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.bg } }}>
        <Tab.Screen name="Users" component={DiscoverScreen} />
        <Tab.Screen name="Chats" component={ChatsScreen} options={chatsBadge} />
        <Tab.Screen name="Me" component={HostMeScreen} />
      </Tab.Navigator>
    );
  }
  return (
    <Tab.Navigator
      key="user"
      tabBar={props => <TabBar {...props} />}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.bg } }}>
      <Tab.Screen name="Discover" component={DiscoverScreen} />
      <Tab.Screen
        name="Chats"
        component={ChatsScreen}
        options={{ tabBarBadge: unreadTotal > 0 ? (unreadTotal > 99 ? '99+' : unreadTotal) : undefined }}
      />
      <Tab.Screen name="Me" component={MeScreen} />
    </Tab.Navigator>
  );
}
