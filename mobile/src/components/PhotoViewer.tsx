import React, { useEffect, useRef, useState } from 'react';
import { FlatList, Image, Modal, Pressable, StatusBar, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from './Icon';

type Props = {
  photos: string[];
  index: number | null; // null = band
  onClose: () => void;
};


// Full-screen photo dekhna, left/right swipe
export default function PhotoViewer({ photos, index, onClose }: Props) {
  const { width: W, height: H } = useWindowDimensions(); // har render pe asli chaudai
  const insets = useSafeAreaInsets();
  const [current, setCurrent] = useState(index ?? 0);
  const list = useRef<FlatList<string>>(null);

  useEffect(() => {
    if (index != null) setCurrent(index);
  }, [index]);

  return (
    <Modal visible={index != null} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <StatusBar barStyle="light-content" />
      <View style={styles.root}>
        {index != null && (
          <FlatList
            ref={list}
            data={photos}
            horizontal
            pagingEnabled
            initialScrollIndex={index}
            getItemLayout={(_, i) => ({ length: W, offset: W * i, index: i })}
            showsHorizontalScrollIndicator={false}
            keyExtractor={(u, i) => `${i}-${u}`}
            onMomentumScrollEnd={e => setCurrent(Math.round(e.nativeEvent.contentOffset.x / W))}
            renderItem={({ item }) => <Image source={{ uri: item }} style={{ width: W, height: H }} resizeMode="contain" />}
          />
        )}
        <View style={[styles.top, { top: insets.top + 8 }]}>
          <Text style={styles.counter}>
            {current + 1} / {photos.length}
          </Text>
          <Pressable onPress={onClose} hitSlop={10} style={styles.close}>
            <Icon name="plus" size={22} color="#fff" strokeWidth={2.4} />
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  top: { position: 'absolute', left: 16, right: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  counter: { color: '#fff', fontSize: 14, fontWeight: '600', backgroundColor: 'rgba(255,255,255,0.12)', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 14, overflow: 'hidden' },
  // "+" ko 45° ghuma ke "×"
  close: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.12)', transform: [{ rotate: '45deg' }] },
});
