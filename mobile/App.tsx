/**
 * Meto
 *
 * @format
 */

import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import RootNavigator from './src/navigation/RootNavigator';
import { ChatProvider } from './src/context/ChatContext';
import { CallProvider } from './src/context/CallContext';
import { WalletProvider } from './src/context/WalletContext';
import { NotificationProvider } from './src/context/NotificationContext';
import { startInviteLinks } from './src/lib/invite';
import DialogHost from './src/components/DialogHost';

startInviteLinks();

function App() {
  return (
    <SafeAreaProvider>
      <ChatProvider>
        <WalletProvider>
          <CallProvider>
            <NotificationProvider>
              <RootNavigator />
              <DialogHost />
            </NotificationProvider>
          </CallProvider>
        </WalletProvider>
      </ChatProvider>
    </SafeAreaProvider>
  );
}

export default App;
