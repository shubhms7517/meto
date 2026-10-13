/**
 * @format
 */

import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';
import { API_URL } from './src/services/api';
import notifee from '@notifee/react-native';
import { getMessaging, setBackgroundMessageHandler } from '@react-native-firebase/messaging';
import { handleNotifEvent, handleRemoteMessage } from './src/services/push';

// App band / background: call ki ghanti (poori screen) + Decline button
setBackgroundMessageHandler(getMessaging(), msg => handleRemoteMessage(msg, false));
notifee.onBackgroundEvent(handleNotifEvent);

// Dev: warnings / errors backend ke log me bhi bhejo (debugger khole bina dikh jaayein)
if (__DEV__) {
  for (const level of ['warn', 'error']) {
    const orig = console[level];
    console[level] = (...args) => {
      orig(...args);
      try {
        const msg = args.map(a => (a instanceof Error ? a.stack : typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
        fetch(`${API_URL}/api/devlog`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ level, msg }) }).catch(() => {});
      } catch {}
    };
  }
}

AppRegistry.registerComponent(appName, () => App);
