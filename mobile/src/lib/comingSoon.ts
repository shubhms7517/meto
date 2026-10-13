import { Alert } from 'react-native';

// Jo features baad ke phases me banenge (call, wallet, VIP...)
export const comingSoon = (feature: string) => Alert.alert(feature, 'This feature is coming soon ✨');
