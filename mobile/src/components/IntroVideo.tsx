import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import Video from 'react-native-video';
import { colors } from '../theme';

type Props = { uri: string; style?: ViewStyle; label?: string };

// Host ka intro video: chupchaap (mute) chalta rehta hai, tap → awaaz ke saath / ruk jaata hai
export default function IntroVideo({ uri, style, label = 'Intro video' }: Props) {
  const [muted, setMuted] = useState(true);
  const [paused, setPaused] = useState(false);
  const [loading, setLoading] = useState(true);

  return (
    <Pressable
      onPress={() => {
        if (muted) {
          setMuted(false);
          setPaused(false);
        } else setPaused(p => !p);
      }}
      style={[st.box, style]}>
      <Video
        source={{ uri }}
        style={StyleSheet.absoluteFill}
        resizeMode="cover"
        repeat
        muted={muted}
        paused={paused}
        onLoad={() => setLoading(false)}
        playInBackground={false}
      />
      {loading && <ActivityIndicator color="#fff" style={StyleSheet.absoluteFill} />}
      {!!label && (
        <View style={st.tag}>
          <Text style={st.tagText}>
            {paused ? '▶' : muted ? '🔇' : '🔊'} {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const st = StyleSheet.create({
  box: { overflow: 'hidden', borderRadius: 18, backgroundColor: '#000' },
  tag: { position: 'absolute', left: 8, bottom: 8, paddingHorizontal: 8, height: 24, borderRadius: 12, justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.55)' },
  tagText: { color: colors.text, fontSize: 11, fontWeight: '700' },
});
