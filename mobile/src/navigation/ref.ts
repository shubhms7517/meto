import { createNavigationContainerRef } from '@react-navigation/native';
import type { RootStackParamList } from './types';

// Screen ke bahar se navigate karne ke liye (jaise incoming call)
export const navigationRef = createNavigationContainerRef<RootStackParamList>();
