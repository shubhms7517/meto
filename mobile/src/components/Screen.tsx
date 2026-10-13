import React from 'react';
import {
  KeyboardAvoidingView,
  StatusBar,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing } from '../theme';

type Props = {
  children: React.ReactNode;
  background?: React.ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
};

// Dark app background + safe area + keyboard handling
export default function Screen({ children, background, contentStyle }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />
      {background}
      {/* Android edge-to-edge me window resize nahi hoti, isliye dono pe padding */}
      <KeyboardAvoidingView style={styles.flex} behavior="padding">
        <View
          style={[
            styles.content,
            { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 24 },
            contentStyle,
          ]}>
          {children}
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, overflow: 'hidden' },
  flex: { flex: 1 },
  content: { flex: 1, paddingHorizontal: spacing.screen },
});
