import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon, { IconName } from './Icon';
import { colors } from '../theme';

const ICONS: Record<string, IconName> = {
  Users: 'compass',
  Discover: 'compass',
  Chats: 'chat',
  Me: 'user',
};

// Neeche floating glass tab bar (design jaisa)
export default function TabBar({
  state,
  navigation,
  descriptors,
}: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const bottom = Math.max(insets.bottom, 10) + 6;
  return (
    <>
      {/* Tab bar ke peeche aur system nav bar ke neeche content ko dark fade se chhupao */}
      <LinearGradient
        pointerEvents="none"
        colors={['rgba(18,7,13,0)', 'rgba(18,7,13,0.92)', colors.bg]}
        locations={[0, 0.45, 1]}
        style={[styles.fade, { height: bottom + 100 }]}
      />
      <View pointerEvents="box-none" style={[styles.outer, { bottom }]}>
        <View style={styles.bar}>
          {state.routes.map((route, index) => {
            const focused = state.index === index;
            const badge = descriptors[route.key].options.tabBarBadge;
            const onPress = () => {
              const e = navigation.emit({
                type: 'tabPress',
                target: route.key,
                canPreventDefault: true,
              });
              if (!focused && !e.defaultPrevented)
                navigation.navigate(route.name);
            };
            return (
              <Pressable
                key={route.key}
                onPress={onPress}
                style={styles.tab}
                accessibilityRole="tab"
                accessibilityState={{ selected: focused }}
              >
                <View style={styles.icWrap}>
                  {focused && (
                    <LinearGradient
                      colors={['rgba(255,95,143,0.24)', 'rgba(216,27,92,0.12)']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={StyleSheet.absoluteFill}
                    />
                  )}
                  <Icon
                    name={ICONS[route.name]}
                    size={22}
                    color={focused ? colors.rose1 : colors.fine}
                  />
                </View>
                <Text style={[styles.label, focused && styles.labelOn]}>
                  {route.name}
                </Text>
                {badge != null && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{badge}</Text>
                  </View>
                )}
              </Pressable>
            );
          })}
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  fade: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  outer: { position: 'absolute', left: 14, right: 14 },
  bar: {
    height: 66,
    borderRadius: 24,
    backgroundColor: '#1e0f17',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    elevation: 16,
    shadowColor: '#000',
  },
  tab: { alignItems: 'center', gap: 4, width: 76 },
  icWrap: {
    width: 46,
    height: 30,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  label: { fontSize: 10.5, fontWeight: '500', color: colors.fine },
  labelOn: { color: colors.text },
  badge: {
    position: 'absolute',
    top: -4,
    right: 14,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 5,
    borderRadius: 9,
    backgroundColor: colors.rose1,
    borderWidth: 2,
    borderColor: '#1e0f17',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
});
