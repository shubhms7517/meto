import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, KeyboardAvoidingView, Pressable, StatusBar, StyleSheet, Text, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import LinearGradient from 'react-native-linear-gradient';
import { launchImageLibrary } from 'react-native-image-picker';
import Icon from '../../components/Icon';
import { colors, gradients } from '../../theme';
import type { RootStackParamList } from '../../navigation/types';
import { getSocket } from '../../services/socket';
import { getSupportThread, sendSupport, SUPPORT_TOPICS, topicLabel, type SupportMessage, type SupportTicket, type SupportTopic } from '../../services/support';

type Props = NativeStackScreenProps<RootStackParamList, 'SupportChat'>;

const hhmm = (iso: string) => new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

// Meto team se baat: pehle topic, phir message / screenshot. Jawab asli team deti hai (koi bot nahi)
export default function SupportChatScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const [ticket, setTicket] = useState<SupportTicket | null>(null);
  const [msgs, setMsgs] = useState<SupportMessage[] | null>(null);
  const [topic, setTopic] = useState<SupportTopic | null>(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const list = useRef<FlatList<SupportMessage>>(null);

  const load = useCallback(() => {
    getSupportThread()
      .then(r => {
        setTicket(r.ticket);
        setMsgs(r.messages);
      })
      .catch(() => setMsgs([]));
  }, []);
  useEffect(load, [load]);

  // Team ka jawab turant (screen khuli ho to) — "dekh liya" bhi ho jaye
  useEffect(() => {
    const s = getSocket();
    const on = () => load();
    s?.on('support:message', on);
    return () => {
      s?.off('support:message', on);
    };
  }, [load]);

  // Nayi baat-cheet (ya pichhli solved) → pehle topic chunna
  const needTopic = !ticket || ticket.status === 'solved';

  const send = async (photo?: string) => {
    const body = text.trim();
    if ((!body && !photo) || sending) return;
    if (needTopic && !topic) {
      Alert.alert('Choose a topic', 'Pick what your question is about first.');
      return;
    }
    setSending(true);
    try {
      const r = await sendSupport({ topic: needTopic ? topic! : undefined, body: photo ? undefined : body, photo });
      setTicket(r.ticket);
      setMsgs(m => (needTopic ? [r.message] : [...(m ?? []), r.message]));
      if (!photo) setText('');
      setTopic(null);
    } catch (e) {
      Alert.alert('Not sent', (e as Error).message);
    } finally {
      setSending(false);
    }
  };

  const pickShot = async () => {
    const res = await launchImageLibrary({ mediaType: 'photo', selectionLimit: 1, quality: 0.8 });
    const uri = res.assets?.[0]?.uri;
    if (uri) send(uri);
  };

  // Solved ke baad naya sawal → nayi baat-cheet (purane message nahi dikhte)
  const shown = needTopic && ticket?.status === 'solved' && topic ? [] : msgs ?? [];

  return (
    <KeyboardAvoidingView style={st.root} behavior="padding">
      <StatusBar barStyle="light-content" />
      <View style={[st.header, { paddingTop: insets.top + 6 }]}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10} style={st.back}>
          <Icon name="back" size={20} />
        </Pressable>
        <LinearGradient colors={['#5fe3a3', '#1f6e5e']} style={st.logo}>
          <Text style={st.logoText}>🎧</Text>
        </LinearGradient>
        <View style={st.flex}>
          <Text style={st.title}>Meto Support</Text>
          <Text style={st.sub}>Real team · replies in a few hours</Text>
        </View>
      </View>

      {needTopic && (
        <View style={st.topics}>
          {SUPPORT_TOPICS.map(t => (
            <Pressable key={t.key} onPress={() => setTopic(t.key)} style={[st.topic, topic === t.key && st.topicOn]}>
              <Text style={st.topicText}>
                {t.emoji} {t.label}
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      {!msgs ? (
        <ActivityIndicator color={colors.rose1} style={st.loading} />
      ) : (
        <FlatList
          ref={list}
          data={shown}
          keyExtractor={m => String(m.id)}
          contentContainerStyle={st.msgs}
          onContentSizeChange={() => list.current?.scrollToEnd({ animated: false })}
          ListHeaderComponent={
            ticket && !(needTopic && topic) ? (
              <Text style={st.sys}>
                Topic: {topicLabel(ticket.topic)} · Ticket #{ticket.id}
              </Text>
            ) : undefined
          }
          ListFooterComponent={
            ticket?.status === 'solved' && !topic ? <Text style={st.sys}>✓ Solved · pick a topic above to ask something new</Text> : undefined
          }
          ListEmptyComponent={<Text style={st.empty}>{needTopic ? 'Choose a topic above, then tell us what happened.' : ''}</Text>}
          renderItem={({ item: m }) => (
            <View style={[st.bubble, m.fromTeam ? st.them : st.me]}>
              {!!m.imageUrl && <Image source={{ uri: m.imageUrl }} style={st.shot} />}
              {!!m.body && <Text style={st.body}>{m.body}</Text>}
              <Text style={st.time}>
                {hhmm(m.createdAt)}
                {m.fromTeam ? ' · Meto team' : ''}
              </Text>
            </View>
          )}
        />
      )}

      <View style={[st.inputRow, { paddingBottom: insets.bottom + 10 }]}>
        <Pressable onPress={pickShot} disabled={sending} hitSlop={6} style={st.iconBtn}>
          <Icon name="image" size={19} />
        </Pressable>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder={needTopic && !topic ? 'Choose a topic first…' : 'Type your message…'}
          placeholderTextColor={colors.placeholder}
          style={st.input}
          multiline
          maxLength={2000}
        />
        <Pressable onPress={() => send()} disabled={sending || !text.trim()}>
          <LinearGradient colors={gradients.rose} style={[st.sendBtn, !text.trim() && st.off]}>
            {sending ? <ActivityIndicator color="#fff" size="small" /> : <Icon name="send" size={17} color="#fff" />}
          </LinearGradient>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  back: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  logo: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  logoText: { fontSize: 18 },
  title: { color: colors.text, fontSize: 15, fontWeight: '700' },
  sub: { color: colors.muted, fontSize: 11, marginTop: 1 },
  topics: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 14, paddingTop: 12 },
  topic: { paddingHorizontal: 11, paddingVertical: 7, borderRadius: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  topicOn: { borderColor: colors.rose1, backgroundColor: 'rgba(255,95,143,0.14)' },
  topicText: { color: colors.text, fontSize: 12.5 },
  loading: { marginTop: 40 },
  msgs: { padding: 14, gap: 8, flexGrow: 1 },
  sys: { alignSelf: 'center', color: colors.fine, fontSize: 11, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.05)', marginVertical: 4, overflow: 'hidden' },
  empty: { color: colors.fine, textAlign: 'center', marginTop: 30, fontSize: 13 },
  bubble: { maxWidth: '80%', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16 },
  me: { alignSelf: 'flex-end', backgroundColor: colors.rose2, borderBottomRightRadius: 5 },
  them: { alignSelf: 'flex-start', backgroundColor: '#2a2025', borderBottomLeftRadius: 5 },
  body: { color: '#fff', fontSize: 13.5, lineHeight: 19 },
  shot: { width: 160, height: 200, borderRadius: 12, marginBottom: 4, backgroundColor: '#1c1418' },
  time: { color: 'rgba(255,255,255,0.65)', fontSize: 10, marginTop: 3, textAlign: 'right' },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: 12, paddingTop: 10, backgroundColor: '#160c11', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  iconBtn: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.07)' },
  input: { flex: 1, minHeight: 42, maxHeight: 120, borderRadius: 21, paddingHorizontal: 14, paddingVertical: 10, color: colors.text, fontSize: 14, backgroundColor: colors.surface },
  sendBtn: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  off: { opacity: 0.45 },
});
