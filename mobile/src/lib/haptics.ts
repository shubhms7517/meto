import { Platform, Vibration } from 'react-native';

// Button dabane pe halka jhatka (call, gift, save). Bahut chhota — pareshan na kare
export const tap = () => {
  if (Platform.OS === 'android') Vibration.vibrate(12);
};
export const success = () => {
  if (Platform.OS === 'android') Vibration.vibrate([0, 18, 60, 18]);
};
