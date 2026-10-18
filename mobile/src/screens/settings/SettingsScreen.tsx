import React, { useCallback, useState } from 'react';
import { Pressable, ScrollView, StatusBar, StyleSheet, Switch, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from '../../components/Icon';
import { colors } from '../../theme';
import type { RootStackParamList } from '../../navigation/types';
import type { Prefs } from '../../services/api';
import { getMyProfile, savePrefs, type Me } from '../../services/users';
import { getWithdrawInfo } from '../../services/host';
import { signOut } from '../../services/auth';
import { useWallet } from '../../context/WalletContext';
import { version as APP_VERSION } from '../../../package.json';
import { appAlert } from '../../lib/dialog';

type Props = NativeStackScreenProps<RootStackParamList, 'Settings'>;

const maskPhone = (p: string | null) => (p ? `${p.slice(0, 5)}••••${p.slice(-4)}` : '—');

// Settings: user aur host dono (host ke liye payouts / host rules, user ke liye "Hosts can call me")
export default function SettingsScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { amHost } = useWallet();
  const [me, setMe] = useState<Me | null>(null);
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [upi, setUpi] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      getMyProfile()
        .then(m => {
          setMe(m);
          if (m.prefs) setPrefs(m.prefs);
        })
        .catch(() => {});
      if (amHost)
        getWithdrawInfo()
          .then(i => setUpi(i.account?.upiId ?? null))
          .catch(() => {});
    }, [amHost]),
  );

  const toggle = async (k: keyof Prefs, v: boolean) => {
    if (!prefs) return;
    const before = prefs;
    setPrefs({ ...prefs, [k]: v }); // turant switch badlo, server baad me
    try {
      setPrefs((await savePrefs({ [k]: v })).prefs);
    } catch (e) {
      setPrefs(before);
      appAlert('Settings', (e as Error).message);
    }
  };

  const onSignOut = () =>
    appAlert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => {
          await signOut();
          navigation.reset({ index: 0, routes: [{ name: 'Welcome' }] });
        },
      },
    ]);

  return (
    <View style={st.root}>
      <StatusBar barStyle="light-content" />
      <View style={[st.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10} style={st.back}>
          <Icon name="back" size={20} />
        </Pressable>
        <Text style={st.title}>Settings</Text>
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 30 }}>
        <Section title="Account">
          <Row icon="✏️" label={amHost ? 'Edit profile & photos' : 'Edit profile'} onPress={() => navigation.navigate('EditProfile')} />
          <Row icon="📱" label="Phone number" right={maskPhone(me?.phone ?? null)} />
          <Row icon="🔐" label="Login" right={me?.authProvider === 'google' ? `Google${me.email ? ` · ${me.email}` : ''}` : 'Phone'} />
        </Section>

        {amHost && (
          <Section title="Payouts">
            <Row icon="🏦" label="UPI & PAN" right={upi ?? 'Add'} onPress={() => navigation.navigate('PayoutAccount')} />
            <Row icon="🧾" label="Withdrawals" onPress={() => navigation.navigate('Withdrawals')} />
          </Section>
        )}

        <Section title="Notifications">
          <Row icon="💬" label="Messages" toggle={prefs?.pushMessages} onToggle={v => toggle('pushMessages', v)} />
          {amHost ? (
            <Row icon="🎁" label="Gifts & earnings" toggle={prefs?.pushGifts} onToggle={v => toggle('pushGifts', v)} />
          ) : (
            <>
              <Row icon="📞" label="Missed calls" toggle={prefs?.pushMissedCalls} onToggle={v => toggle('pushMissedCalls', v)} />
              <Row icon="🎁" label="Offers & rewards" toggle={prefs?.pushOffers} onToggle={v => toggle('pushOffers', v)} />
            </>
          )}
        </Section>

        {!amHost && (
          <Section title="Privacy & safety">
            <Row
              icon="📞"
              label="Hosts can call me"
              sub="You pay only if you answer"
              toggle={prefs?.hostCanCall}
              onToggle={v => toggle('hostCanCall', v)}
            />
            <Row icon="🚫" label="Blocked users" onPress={() => navigation.navigate('BlockedUsers')} />
          </Section>
        )}

        <Section title="Help">
          {amHost && <Row icon="📜" label="Host rules" onPress={() => navigation.navigate('Legal', { kind: 'host' })} />}
          {amHost && <Row icon="🚫" label="Blocked users" onPress={() => navigation.navigate('BlockedUsers')} />}
          <Row icon="🎧" label="Customer service" onPress={() => navigation.navigate('CustomerService')} />
          <Row icon="📄" label="Terms of service" onPress={() => navigation.navigate('Legal', { kind: 'terms' })} />
          <Row icon="🔒" label="Privacy policy" onPress={() => navigation.navigate('Legal', { kind: 'privacy' })} />
        </Section>

        <Section>
          <Row icon="⎋" label="Sign out" onPress={onSignOut} />
          <Row icon="🗑️" label="Delete account" danger onPress={() => navigation.navigate('DeleteAccount')} />
        </Section>
        <Text style={st.ver}>Meto v{APP_VERSION}</Text>
      </ScrollView>
    </View>
  );
}

function Section({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <>
      <Text style={st.sec}>{title ?? ' '}</Text>
      <View style={st.card}>{children}</View>
    </>
  );
}

function Row(p: { icon: string; label: string; sub?: string; right?: string; danger?: boolean; toggle?: boolean; onToggle?: (v: boolean) => void; onPress?: () => void }) {
  const body = (
    <View style={st.row}>
      <View style={[st.ic, p.danger && { backgroundColor: 'rgba(255,59,92,0.14)' }]}>
        <Text style={{ fontSize: 14 }}>{p.icon}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[st.label, p.danger && { color: '#ff8a9e' }]}>{p.label}</Text>
        {!!p.sub && <Text style={st.sub}>{p.sub}</Text>}
      </View>
      {p.onToggle ? (
        <Switch
          value={!!p.toggle}
          onValueChange={p.onToggle}
          disabled={p.toggle === undefined}
          trackColor={{ false: 'rgba(255,255,255,0.18)', true: colors.online }}
          thumbColor="#fff"
        />
      ) : (
        <>
          {!!p.right && (
            <Text style={st.right} numberOfLines={1}>
              {p.right}
            </Text>
          )}
          {p.onPress && <Icon name="chevron" size={14} color={colors.fine} />}
        </>
      )}
    </View>
  );
  return p.onPress ? (
    <Pressable onPress={p.onPress} style={({ pressed }) => pressed && { opacity: 0.7 }}>
      {body}
    </Pressable>
  ) : (
    body
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingBottom: 6 },
  back: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  title: { color: colors.text, fontSize: 19, fontWeight: '700' },
  sec: { color: colors.muted, fontSize: 11, fontWeight: '700', letterSpacing: 0.7, textTransform: 'uppercase', marginHorizontal: 20, marginTop: 16, marginBottom: 7 },
  card: { marginHorizontal: 16, borderRadius: 18, overflow: 'hidden', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  row: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 13, minHeight: 54, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  ic: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.06)' },
  label: { color: colors.text, fontSize: 14, fontWeight: '600' },
  sub: { color: colors.muted, fontSize: 11, marginTop: 1 },
  right: { color: colors.muted, fontSize: 12, maxWidth: 170 },
  ver: { color: colors.fine, fontSize: 11, textAlign: 'center', marginTop: 16 },
});
