import React, { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import LinearGradient from 'react-native-linear-gradient';
import { colors } from '../../theme';
import type { RootStackParamList } from '../../navigation/types';
import { getHostMe, type HostSummary } from '../../services/host';
import { BigButton, HostHeader, s, Step } from './common';

type Props = NativeStackScreenProps<RootStackParamList, 'HostStatus'>;

// Application ki haalat: review me / reject (wajah ke saath) / approve
export default function HostStatusScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const [h, setH] = useState<HostSummary | null>(null);

  useFocusEffect(
    useCallback(() => {
      getHostMe().then(setH).catch(() => {});
    }, []),
  );

  const app = h?.application;
  const status = h?.role === 'host' ? 'approved' : app?.status;

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" />
      <LinearGradient colors={['#4a1230', '#1c0a15', colors.bg]} locations={[0, 0.45, 0.8]} style={StyleSheet.absoluteFill} />
      <HostHeader title="Host application" top={insets.top} onBack={() => navigation.goBack()} />
      {!h ? (
        <ActivityIndicator color={colors.rose1} style={{ marginTop: 80 }} />
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
          {status === 'rejected' ? (
            <>
              <View style={st.top}>
                <View style={[st.ring, st.ringRed]}>
                  <Text style={st.ringEmoji}>✋</Text>
                </View>
                <Text style={st.h}>Not approved</Text>
                <Text style={st.p}>Your application could not be approved this time.</Text>
              </View>
              <View style={st.reason}>
                <Text style={st.reasonText}>
                  <Text style={{ fontWeight: '800' }}>Reason: </Text>
                  {app?.rejectReason}
                </Text>
              </View>
              <BigButton label="Apply again" onPress={() => navigation.replace('HostApply')} />
            </>
          ) : status === 'approved' ? (
            <View style={st.top}>
              <View style={st.ring}>
                <Text style={st.ringEmoji}>🎉</Text>
              </View>
              <Text style={st.h}>You are a Meto host</Text>
              <Text style={st.p}>Users can now find and call you. Keep Meto open to receive calls.</Text>
            </View>
          ) : (
            <>
              <View style={st.top}>
                <View style={st.ring}>
                  <Text style={st.ringEmoji}>⏳</Text>
                </View>
                <Text style={st.h}>Under review</Text>
                <Text style={st.p}>Our team checks every host by hand so Meto stays safe and real. We'll notify you. You can use Meto normally until then.</Text>
              </View>
              <View style={[s.card, { marginTop: 22 }]}>
                <Step n={1} title="Photos & video" done />
                <Step n={2} title="Live selfie" done />
                {app?.agency && <Step n={3} title="Agency" sub={`${app.agency.name} · ${app.agency.code}`} done />}
                <Step n={app?.agency ? 4 : 3} title="Team review" sub="In progress" right="Pending" />
              </View>
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  top: { alignItems: 'center', marginTop: 26, paddingHorizontal: 24 },
  ring: { width: 120, height: 120, borderRadius: 60, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'rgba(246,220,155,0.5)', backgroundColor: 'rgba(246,220,155,0.08)' },
  ringRed: { borderColor: 'rgba(255,59,92,0.5)', backgroundColor: 'rgba(255,59,92,0.08)' },
  ringEmoji: { fontSize: 50 },
  h: { color: colors.text, fontSize: 21, fontWeight: '800', marginTop: 16 },
  p: { color: colors.muted, fontSize: 12.5, lineHeight: 19, textAlign: 'center', marginTop: 6 },
  reason: { marginHorizontal: 16, marginTop: 16, padding: 12, borderRadius: 16, backgroundColor: 'rgba(255,59,92,0.08)', borderWidth: 1, borderColor: 'rgba(255,59,92,0.3)' },
  reasonText: { color: '#ffb3c0', fontSize: 12.5, lineHeight: 18 },
});
