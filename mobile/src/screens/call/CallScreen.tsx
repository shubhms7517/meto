import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useSafetyMenu } from '../../hooks/useSafetyMenu';
import {
  Alert,
  Animated,
  BackHandler,
  Easing,
  Image,
  PanResponder,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  Vibration,
  useWindowDimensions,
  View,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import createAgoraRtcEngine, {
  ChannelProfileType,
  ClientRoleType,
  IRtcEngine,
  IRtcEngineEventHandler,
  RtcSurfaceView,
  RtcTextureView,
} from 'react-native-agora';
import Avatar from '../../components/Avatar';
import Coin from '../../components/Coin';
import Icon, { IconName } from '../../components/Icon';
import { colors, gradients } from '../../theme';
import { useCall } from '../../context/CallContext';
import { useWallet } from '../../context/WalletContext';
import GiftSheet from '../../components/GiftSheet';
import GiftBurst, { type Burst } from '../../components/GiftBurst';
import type { GiftReceived } from '../../services/gifts';
import { ApiError } from '../../services/api';
import { getSocket } from '../../services/socket';
import { newClientId, sendChatMessage } from '../../services/chat';
import {
  acceptCall,
  CallInfo,
  declineCall,
  endCall,
  ensureCallPermissions,
  formatDuration,
  JoinInfo,
  rateCall,
  startCall,
} from '../../services/calls';
import type { UserCard } from '../../services/users';
import type { CallBilling } from '../../services/calls';
import type { RootStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Call'>;
type Phase =
  | 'starting'
  | 'calling'
  | 'incoming'
  | 'connecting'
  | 'active'
  | 'ended';

const END_TEXT: Record<string, string> = {
  missed: 'No answer',
  declined: 'Call declined',
  cancelled: 'Call cancelled',
  busy: 'User is busy',
  ended: 'Call ended',
};

export default function CallScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const { setInCall, clearInCall, placeCall } = useCall();
  const params = route.params;
  const peer: UserCard =
    params.mode === 'outgoing' ? params.peer : params.call.caller;

  const [phase, setPhase] = useState<Phase>(
    params.mode === 'outgoing' ? 'starting' : 'incoming',
  );
  const [call, setCall] = useState<CallInfo | null>(
    params.mode === 'incoming' ? params.call : null,
  );
  const [remoteUid, setRemoteUid] = useState<number | null>(null);
  const [previewOn, setPreviewOn] = useState(false);
  const [muted, setMuted] = useState(false);
  const [camOff, setCamOff] = useState(false);
  const [speaker, setSpeaker] = useState(true);
  const [seconds, setSeconds] = useState(0);
  const [stars, setStars] = useState(0);
  const [swapped, setSwapped] = useState(false); // true = apna video bada
  const [error, setError] = useState('');
  const [bill, setBill] = useState<(CallBilling & { at: number }) | null>(null); // caller: aakhri billing (at = phone ka waqt)
  const {
    balance,
    openRecharge,
    setBalance,
    refresh: refreshWallet,
    rateFor,
  } = useWallet();
  const [blocked, setBlocked] = useState(false); // call ke beech block kiya → "Call again" / message nahi
  // Call ke beech Report / Block (ganda bartav → turant call band)
  const safety = useSafetyMenu({
    userId: peer.id,
    name: peer.name ?? 'User',
    blocked: false,
    onBlockedChange: b => {
      setBlocked(b);
      if (b) hangUpRef.current?.();
    },
  });
  const hangUpRef = useRef<(() => void) | null>(null);
  const [giftOpen, setGiftOpen] = useState(false);
  const [burst, setBurst] = useState<Burst | null>(null);

  const engine = useRef<IRtcEngine | null>(null);
  const join = useRef<JoinInfo | null>(null);
  const callRef = useRef<CallInfo | null>(call);
  callRef.current = call;
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const startedAt = useRef<number | null>(null);

  /* ---------------- Agora engine ---------------- */
  const handler = useRef<IRtcEngineEventHandler>({
    onUserJoined: (_c, uid) => {
      setRemoteUid(uid);
      startedAt.current = Date.now();
      setPhase('active');
    },
    // Saamne wala nikal gaya (call kaati / app band / network gaya)
    onUserOffline: () => {
      if (callRef.current && phaseRef.current !== 'ended') hangUp();
    },
  }).current;

  const initEngine = useCallback(
    (info: JoinInfo) => {
      if (engine.current) return engine.current;
      const e = createAgoraRtcEngine();
      e.initialize({
        appId: info.appId,
        channelProfile: ChannelProfileType.ChannelProfileCommunication,
      });
      e.registerEventHandler(handler);
      e.enableVideo();
      e.setDefaultAudioRouteToSpeakerphone(true);
      e.startPreview();
      engine.current = e;
      setPreviewOn(true);
      return e;
    },
    [handler],
  );

  const joinChannel = useCallback(() => {
    const info = join.current;
    const e = engine.current;
    if (!info || !e) return;
    e.joinChannel(info.token, info.channel, info.uid, {
      clientRoleType: ClientRoleType.ClientRoleBroadcaster,
      publishCameraTrack: true,
      publishMicrophoneTrack: true,
      autoSubscribeAudio: true,
      autoSubscribeVideo: true,
    });
  }, []);

  const releaseEngine = useCallback(() => {
    const e = engine.current;
    if (!e) return;
    engine.current = null;
    // Har step alag try me — ek fail ho to bhi camera/mic zaroor band hon
    const safe = (fn: () => unknown) => {
      try {
        fn();
      } catch {
        // already stopped
      }
    };
    safe(() => e.muteLocalAudioStream(true));
    safe(() => e.muteLocalVideoStream(true));
    safe(() => e.stopPreview());
    safe(() => e.enableLocalVideo(false));
    safe(() => e.leaveChannel());
    safe(() => e.unregisterEventHandler(handler));
    safe(() => e.release(true)); // sync: camera, mic aur call audio mode turant chhode
    setPreviewOn(false);
    setRemoteUid(null);
  }, [handler]);

  /* ---------------- Call shuru ---------------- */
  useEffect(() => {
    if (params.mode !== 'outgoing') return;
    let cancelled = false;
    (async () => {
      try {
        const res = await startCall(peer.id, params.source ?? 'direct');
        if (cancelled) return;
        setCall(res.call);
        setInCall(res.call.id);
        if (!res.join) {
          // Busy
          setPhase('ended');
          return;
        }
        join.current = res.join;
        initEngine(res.join);
        setPhase('calling');
      } catch (e) {
        if (cancelled) return;
        // Beech me gems khatam ho gaye — call screen band, recharge sheet
        if (e instanceof ApiError && e.code === 'insufficient_gems') {
          navigation.goBack();
          openRecharge({
            needed: 60,
            peerName: peer.name,
            onRecharged: () => placeCall(peer),
          });
          return;
        }
        setError((e as Error).message);
        setPhase('ended');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Incoming: phone vibrate
  useEffect(() => {
    if (phase !== 'incoming') return;
    if (call) setInCall(call.id);
    Vibration.vibrate([0, 900, 700], true);
    return () => Vibration.cancel();
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------------- Server events ---------------- */
  useEffect(() => {
    const s = getSocket();
    if (!s) return;
    const onAccepted = (c: CallInfo) => {
      if (c.id !== callRef.current?.id) return;
      setCall(c);
      // Caller: ab channel join. (Callee ka doosra device bhi yeh event paata hai)
      if (params.mode === 'outgoing' && phaseRef.current === 'calling') {
        setPhase('connecting');
        joinChannel();
      } else if (
        params.mode === 'incoming' &&
        phaseRef.current === 'incoming' &&
        !engine.current
      ) {
        // Kisi aur device pe utha li
        navigation.goBack();
      }
    };
    const onEnded = (c: CallInfo) => {
      if (c.id !== callRef.current?.id) return;
      setCall(c);
      releaseEngine();
      Vibration.cancel();
      setPhase('ended');
    };
    const onBilling = (b: CallBilling) => {
      if (b.callId !== callRef.current?.id) return;
      setBill({ ...b, at: Date.now() });
      setBalance(b.balance);
    };
    s.on('call:accepted', onAccepted);
    s.on('call:ended', onEnded);
    // Call ke beech saamne wale ka gift → animation
    const onGift = (g: GiftReceived) => {
      if (g.from.id !== peer.id) return;
      setBurst({
        key: Date.now(),
        gift: g.gift,
        text: `${g.from.name} sent you`,
      });
    };
    s.on('call:billing', onBilling);
    s.on('gift:received', onGift);
    return () => {
      s.off('gift:received', onGift);
      s.off('call:accepted', onAccepted);
      s.off('call:ended', onEnded);
      s.off('call:billing', onBilling);
    };
  }, [joinChannel, releaseEngine, navigation, params.mode, setBalance]);

  // Screen band → sab saaf
  useEffect(
    () => () => {
      releaseEngine();
      Vibration.cancel();
      clearInCall(callRef.current?.id);
    },
    [releaseEngine, clearInCall],
  );

  // Call khatam → app free (summary screen khuli ho tab bhi nayi call aa sake)
  useEffect(() => {
    if (phase === 'ended') {
      clearInCall(callRef.current?.id);
      Vibration.cancel();
      // Call khatam → balance turant server se (chip, Me, Wallet sab jagah)
      refreshWallet();
    }
  }, [phase, clearInCall, refreshWallet]);

  // Timer
  useEffect(() => {
    if (phase !== 'active') return;
    const t = setInterval(
      () =>
        setSeconds(
          Math.floor((Date.now() - (startedAt.current ?? Date.now())) / 1000),
        ),
      1000,
    );
    return () => clearInterval(t);
  }, [phase]);

  /* ---------------- Actions ---------------- */
  hangUpRef.current = () => {
    hangUp();
  };
  async function hangUp() {
    const c = callRef.current;
    releaseEngine();
    if (!c) return navigation.goBack();
    try {
      const res = await endCall(c.id);
      setCall(res.call);
    } catch {
      // network — server sweeper band kar dega
    }
    setPhase('ended');
  }

  const accept = async () => {
    if (!call) return;
    Vibration.cancel();
    if (!(await ensureCallPermissions())) {
      Alert.alert(
        'Permission needed',
        'Allow camera and microphone to answer video calls.',
      );
      return;
    }
    setPhase('connecting');
    try {
      const res = await acceptCall(call.id);
      setCall(res.call);
      join.current = res.join;
      initEngine(res.join);
      joinChannel();
    } catch (e) {
      // Host ki call uthayi par gems kam — recharge sheet
      if (e instanceof ApiError && e.code === 'insufficient_gems') {
        navigation.goBack();
        openRecharge({ needed: call.rate, peerName: peer.name });
        return;
      }
      setError((e as Error).message);
      setPhase('ended');
    }
  };

  const decline = async (quickReply?: string) => {
    if (!call) return;
    Vibration.cancel();
    try {
      const res = await declineCall(call.id);
      setCall(res.call);
      if (quickReply)
        await sendChatMessage(peer.id, quickReply, newClientId()).catch(
          () => {},
        );
    } catch {
      // ignore
    }
    navigation.goBack();
  };

  const toggleMute = () => {
    engine.current?.muteLocalAudioStream(!muted);
    setMuted(m => !m);
  };
  const toggleCam = () => {
    engine.current?.enableLocalVideo(camOff);
    engine.current?.muteLocalVideoStream(!camOff);
    setCamOff(c => !c);
  };
  const toggleSpeaker = () => {
    engine.current?.setEnableSpeakerphone(!speaker);
    setSpeaker(s => !s);
  };
  const flip = () => engine.current?.switchCamera();

  // Back button: call chal rahi ho to pooch ke kaato
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (phase === 'ended') return false;
      if (phase === 'incoming') {
        decline();
        return true;
      }
      Alert.alert('End call?', undefined, [
        { text: 'Stay', style: 'cancel' },
        { text: 'End', style: 'destructive', onPress: hangUp },
      ]);
      return true;
    });
    return () => sub.remove();
  }); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------------- UI ---------------- */
  if (phase === 'ended') {
    return (
      <Ended
        peer={peer}
        call={call}
        error={error}
        isCaller={params.mode === 'outgoing'}
        blocked={blocked}
        stars={stars}
        onRate={async n => {
          setStars(n);
          if (call) rateCall(call.id, n).catch(() => {});
        }}
        onAgain={() => navigation.replace('Call', { mode: 'outgoing', peer })}
        onRecharge={() =>
          openRecharge({
            needed: call?.rate ?? rateFor(peer.rate),
            peerName: peer.name,
            onRecharged: () =>
              navigation.replace('Call', {
                mode: 'outgoing',
                peer,
                source: params.mode === 'outgoing' ? params.source : undefined,
              }),
          })
        }
        onMessage={() =>
          navigation.replace('Chat', { id: peer.id, name: peer.name })
        }
        onClose={() => navigation.goBack()}
        insetsTop={insets.top}
        insetsBottom={insets.bottom}
      />
    );
  }

  const inCallUI = phase === 'active' || phase === 'connecting';
  const isCaller = params.mode === 'outgoing';
  // Caller: gems kitni der chalenge — agle minute tak ka paid hai + bache poore minute
  // Live balance (gift / recharge ke baad turant) se bache minute
  const liveBal = balance ?? bill?.balance ?? 0;
  const rate = call?.rate ?? rateFor(peer.rate);
  const secsLeft = bill
    ? Math.max(
        0,
        Math.round(
          Math.floor(liveBal / rate) * 60 +
            (bill.at + 60_000 - Date.now()) / 1000,
        ),
      )
    : null;
  const lowGems =
    isCaller && phase === 'active' && secsLeft != null && secsLeft <= 150;
  void seconds; // har second re-render (countdown)

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />

      {/* ----- Background ----- */}
      {phase === 'active' && remoteUid != null ? (
        // Bada video: normally saamne wala; chhote pe tap karo to apna
        swapped && camOff ? (
          <CamOffView peer={null} />
        ) : (
          <RtcSurfaceView
            key={swapped ? 'big-local' : `big-${remoteUid}`}
            canvas={{ uid: swapped ? 0 : remoteUid }}
            style={StyleSheet.absoluteFill}
          />
        )
      ) : (
        <LuxBackground
          peer={peer}
          preview={previewOn && phase !== 'incoming'}
        />
      )}

      {/* ----- Calling / Incoming / Connecting center ----- */}
      {!(phase === 'active' && remoteUid != null) && (
        <View
          style={[
            styles.center,
            { top: insets.top + (phase === 'incoming' ? 120 : 110) },
          ]}
        >
          {phase === 'incoming' && (
            <View style={styles.incTop}>
              <Icon name="lock" size={14} color="rgba(255,255,255,0.8)" />
              <Text style={styles.incTopText}>Meto video call</Text>
            </View>
          )}
          <PulseAvatar peer={peer} />
          <View style={styles.nameRow}>
            <Text style={styles.name}>
              {peer.name}
              {phase === 'incoming' ? `, ${peer.age}` : ''}
            </Text>
            {peer.isVerified && <Icon name="verified" size={20} />}
          </View>
          <Text style={styles.sub}>
            {phase === 'starting'
              ? 'Starting…'
              : phase === 'calling'
              ? 'Calling…'
              : phase === 'incoming'
              ? 'is calling you…'
              : 'Connecting…'}
          </Text>
          {phase !== 'incoming' ? (
            <View style={styles.rate}>
              <Coin size={20} />
              <Text style={styles.rateText}>
                {call?.rate ?? rateFor(peer.rate)} gems / min
              </Text>
            </View>
          ) : peer.isHost && call ? (
            // Host ki call aa rahi hai — user ko saaf daam (uthaya to user deta hai)
            <View style={styles.rate}>
              <Coin size={20} />
              <Text style={styles.rateText}>
                {call.rate.toLocaleString('en-IN')} gems / min · you pay only if you answer
              </Text>
            </View>
          ) : null}
        </View>
      )}

      {/* ----- Active: top bar + local PIP ----- */}
      {inCallUI && (
        <>
          <LinearGradient
            colors={['rgba(0,0,0,0.55)', 'transparent']}
            style={[styles.topShade, { height: insets.top + 110 }]}
            pointerEvents="none"
          />
          <View style={[styles.topbar, { top: insets.top + 8 }]}>
            <Avatar
              uri={peer.avatarUrl}
              seed={peer.id}
              style={styles.mini}
              iconScale={0.9}
            />
            <View>
              <Text style={styles.tbName}>{peer.name}</Text>
              <Text style={styles.timer}>
                ● {phase === 'active' ? formatDuration(seconds) : 'Connecting'}
              </Text>
            </View>
            {/* Gems sirf paise dene wale (user) ko — host ki kamai Host center me */}
            {balance != null && peer.isHost && (
              <View style={styles.bal}>
                <Coin size={18} />
                <Text style={styles.balText}>
                  {balance.toLocaleString('en-IN')}
                </Text>
              </View>
            )}
            <Pressable
              onPress={safety.openMenu}
              hitSlop={8}
              style={[
                styles.safetyBtn,
                !(balance != null && peer.isHost) && { marginLeft: 'auto' },
              ]}
            >
              <Icon name="shield" size={18} color="#fff" />
            </Pressable>
          </View>
          {safety.sheets}
          {lowGems && peer.isHost && (
            <LowGemsBar
              top={insets.top + 60}
              secsLeft={secsLeft!}
              onRecharge={() =>
                openRecharge({
                  needed: call?.rate ?? rateFor(peer.rate),
                  peerName: peer.name,
                  inCall: true,
                })
              }
            />
          )}
          {phase === 'active' && remoteUid != null && (
            <DraggablePip
              top={insets.top + 64}
              bottom={insets.bottom + 140}
              onTap={() => setSwapped(s => !s)}
              onFlip={!swapped ? flip : undefined}
            >
              {/* TextureView: gol corners sahi se cut hote hain (SurfaceView me nahi) */}
              {!swapped && camOff ? (
                <CamOffView peer={null} small />
              ) : (
                <RtcTextureView
                  key={swapped ? `pip-${remoteUid}` : 'pip-local'}
                  canvas={{ uid: swapped ? remoteUid : 0 }}
                  style={StyleSheet.absoluteFill}
                />
              )}
            </DraggablePip>
          )}
        </>
      )}

      {/* ----- Bottom controls ----- */}
      {phase === 'incoming' ? (
        <View style={[styles.incWrap, { bottom: insets.bottom + 40 }]}>
          <View style={styles.quick}>
            {["💬 Can't talk now", '⏰ Call you later'].map(q => (
              <Pressable
                key={q}
                onPress={() => decline(q.slice(3))}
                style={styles.quickChip}
              >
                <Text style={styles.quickText}>{q}</Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.incActions}>
            <RoundBtn
              icon="phoneCall"
              kind="end"
              label="Decline"
              onPress={() => decline()}
            />
            <RoundBtn
              icon="video"
              kind="accept"
              label="Accept"
              onPress={accept}
            />
          </View>
        </View>
      ) : inCallUI ? (
        <View style={[styles.controls, { bottom: insets.bottom + 20 }]}>
          <CtrlBtn
            icon={muted ? 'micOff' : 'mic'}
            label="Mute"
            on={muted}
            onPress={toggleMute}
          />
          <CtrlBtn
            icon={camOff ? 'videoOff' : 'video'}
            label="Camera"
            on={camOff}
            onPress={toggleCam}
          />
          <RoundBtn
            icon="phoneCall"
            kind="end"
            label="End"
            onPress={hangUp}
            small
          />
          <CtrlBtn
            icon="speaker"
            label="Speaker"
            on={!speaker}
            onPress={toggleSpeaker}
          />
          {peer.isHost && (
            <CtrlBtn
              icon="gift"
              label="Gift"
              gold
              onPress={() => setGiftOpen(true)}
            />
          )}
        </View>
      ) : (
        <View style={[styles.outActions, { bottom: insets.bottom + 40 }]}>
          <CtrlBtn icon="flip" label="Flip" onPress={flip} />
          <RoundBtn
            icon="phoneCall"
            kind="end"
            label="Cancel"
            onPress={hangUp}
          />
          <CtrlBtn
            icon={muted ? 'micOff' : 'mic'}
            label="Mute"
            on={muted}
            onPress={toggleMute}
          />
        </View>
      )}
      <GiftBurst burst={burst} onDone={() => setBurst(null)} />
      {giftOpen && (
        <GiftSheet
          to={{ id: peer.id, name: peer.name }}
          callId={call?.id}
          onClose={() => setGiftOpen(false)}
          onSent={gift => setBurst({ key: Date.now(), gift, text: 'You sent' })}
        />
      )}
    </View>
  );
}

/* ================= Pieces ================= */

const PIP_W = 108;
const PIP_H = 156;
const EDGE = 14;

// Chhota video: ungli se kahin bhi khiskao, chhodte hi paas wale kinare pe chala jaata hai. Tap = bada/chhota swap
function DraggablePip({
  top,
  bottom,
  onTap,
  onFlip,
  children,
}: {
  top: number;
  bottom: number;
  onTap: () => void;
  onFlip?: () => void;
  children: React.ReactNode;
}) {
  const { width: SW, height: SH } = useWindowDimensions();
  const minY = top;
  const maxY = SH - bottom - PIP_H;
  const pos = useRef(
    new Animated.ValueXY({ x: SW - PIP_W - EDGE, y: top }),
  ).current;
  const start = useRef({ x: 0, y: 0 });
  const scale = useRef(new Animated.Value(1)).current;
  const tapRef = useRef(onTap);
  tapRef.current = onTap;

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        // @ts-expect-error _value internal hai, lekin current position ke liye yahi sabse simple
        start.current = { x: pos.x._value, y: pos.y._value };
        Animated.spring(scale, {
          toValue: 1.06,
          useNativeDriver: false,
          speed: 30,
        }).start();
      },
      onPanResponderMove: (_e, g) => {
        pos.setValue({ x: start.current.x + g.dx, y: start.current.y + g.dy });
      },
      onPanResponderRelease: (_e, g) => {
        Animated.spring(scale, {
          toValue: 1,
          useNativeDriver: false,
          speed: 30,
        }).start();
        if (Math.abs(g.dx) < 6 && Math.abs(g.dy) < 6) {
          pos.setValue(start.current);
          tapRef.current();
          return;
        }
        const x = start.current.x + g.dx + g.vx * 60;
        const y = start.current.y + g.dy + g.vy * 60;
        Animated.spring(pos, {
          toValue: {
            x: x + PIP_W / 2 < SW / 2 ? EDGE : SW - PIP_W - EDGE,
            y: Math.min(Math.max(y, minY), maxY),
          },
          useNativeDriver: false,
          friction: 7,
          tension: 60,
        }).start();
      },
    }),
  ).current;

  return (
    <Animated.View
      {...pan.panHandlers}
      style={[
        styles.pip,
        { transform: [...pos.getTranslateTransform(), { scale }] },
      ]}
    >
      <View style={styles.pipClip}>{children}</View>
      {onFlip && (
        <Pressable onPress={onFlip} style={styles.pipFlip} hitSlop={6}>
          <Icon name="flip" size={14} color="#fff" />
        </Pressable>
      )}
    </Animated.View>
  );
}

function CamOffView({ small }: { peer: null; small?: boolean }) {
  return (
    <View style={[StyleSheet.absoluteFill, styles.camOff]}>
      <Icon
        name="videoOff"
        size={small ? 24 : 40}
        color="rgba(255,255,255,0.6)"
      />
      {!small && <Text style={styles.camOffText}>Your camera is off</Text>}
    </View>
  );
}

// Premium background: blur photo (ya apna camera) + rose/gold roshni + vignette
function LuxBackground({
  peer,
  preview,
}: {
  peer: UserCard;
  preview: boolean;
}) {
  return (
    <View style={StyleSheet.absoluteFill}>
      <LinearGradient
        colors={['#66173d', '#2e0d1f', '#170610']}
        locations={[0, 0.55, 1]}
        style={StyleSheet.absoluteFill}
      />
      {preview ? (
        <View style={[StyleSheet.absoluteFill, { opacity: 0.45 }]}>
          <RtcSurfaceView canvas={{ uid: 0 }} style={StyleSheet.absoluteFill} />
        </View>
      ) : peer.avatarUrl ? (
        <Image
          source={{ uri: peer.avatarUrl }}
          blurRadius={28}
          style={[StyleSheet.absoluteFill, { opacity: 0.42 }]}
        />
      ) : null}
      <LinearGradient
        colors={['rgba(236,58,114,0.45)', 'transparent']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.8, y: 0.6 }}
        style={StyleSheet.absoluteFill}
      />
      <LinearGradient
        colors={['transparent', 'rgba(222,176,90,0.22)']}
        start={{ x: 0.2, y: 0.4 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <LinearGradient
        colors={['rgba(0,0,0,0.25)', 'transparent', 'rgba(0,0,0,0.6)']}
        locations={[0, 0.4, 1]}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}

// Photo + ghoomti rose-gold ring + pulse rings
function PulseAvatar({ peer }: { peer: UserCard }) {
  const spin = useRef(new Animated.Value(0)).current;
  const waves = [
    useRef(new Animated.Value(0)).current,
    useRef(new Animated.Value(0)).current,
    useRef(new Animated.Value(0)).current,
  ];

  useEffect(() => {
    const loops = [
      Animated.loop(
        Animated.timing(spin, {
          toValue: 1,
          duration: 5000,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
      ),
      ...waves.map((w, i) =>
        Animated.loop(
          Animated.sequence([
            Animated.delay(i * 800),
            Animated.timing(w, {
              toValue: 1,
              duration: 2400,
              easing: Easing.out(Easing.quad),
              useNativeDriver: true,
            }),
            Animated.timing(w, {
              toValue: 0,
              duration: 0,
              useNativeDriver: true,
            }),
          ]),
        ),
      ),
    ];
    loops.forEach(l => l.start());
    return () => loops.forEach(l => l.stop());
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const rotate = spin.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });
  return (
    <View style={styles.pulse}>
      {waves.map((w, i) => (
        <Animated.View
          key={i}
          style={[
            styles.wave,
            {
              borderColor:
                i % 2 ? 'rgba(255,95,143,0.75)' : 'rgba(246,220,155,0.7)',
            },
            {
              opacity: w.interpolate({
                inputRange: [0, 1],
                outputRange: [0.9, 0],
              }),
              transform: [
                {
                  scale: w.interpolate({
                    inputRange: [0, 1],
                    outputRange: [1, 1.9],
                  }),
                },
              ],
            },
          ]}
        />
      ))}
      <Animated.View style={[styles.gring, { transform: [{ rotate }] }]}>
        <LinearGradient
          colors={[colors.gold1, colors.rose1, colors.rose2, colors.gold2]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
      <Avatar
        uri={peer.avatarUrl}
        seed={peer.id}
        style={styles.bigAv}
        iconScale={0.85}
      />
    </View>
  );
}

function RoundBtn({
  icon,
  kind,
  label,
  onPress,
  small,
}: {
  icon: IconName;
  kind: 'end' | 'accept';
  label: string;
  onPress: () => void;
  small?: boolean;
}) {
  const size = small ? 58 : 66;
  return (
    <View style={styles.col}>
      <Pressable onPress={onPress}>
        <LinearGradient
          colors={
            kind === 'end' ? ['#ff5b6f', '#e0103f'] : ['#4ef0a0', '#12b76a']
          }
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[
            styles.round,
            { width: size, height: size, borderRadius: size / 2 },
          ]}
        >
          <View
            style={
              kind === 'end' ? { transform: [{ rotate: '135deg' }] } : undefined
            }
          >
            <Icon name={icon} size={small ? 24 : 28} color="#fff" />
          </View>
        </LinearGradient>
      </Pressable>
      <Text style={styles.lbl}>{label}</Text>
    </View>
  );
}

function CtrlBtn({
  icon,
  label,
  onPress,
  on,
  gold,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  on?: boolean;
  gold?: boolean;
}) {
  return (
    <View style={styles.col}>
      <Pressable onPress={onPress}>
        {gold ? (
          <LinearGradient colors={gradients.gold} style={styles.ctrl}>
            <Icon name={icon} size={22} color={colors.goldText} />
          </LinearGradient>
        ) : (
          <View style={[styles.ctrl, styles.ctrlGlass, on && styles.ctrlOn]}>
            <Icon name={icon} size={22} color={on ? '#1a0b13' : '#fff'} />
          </View>
        )}
      </Pressable>
      <Text style={styles.lbl}>{label}</Text>
    </View>
  );
}

// Call ke beech: gems ~2 min me khatam — countdown + Recharge (call nahi rukti)
function LowGemsBar({
  top,
  secsLeft,
  onRecharge,
}: {
  top: number;
  secsLeft: number;
  onRecharge: () => void;
}) {
  const last = secsLeft <= 60;
  return (
    <View style={[styles.low, { top }, last && styles.lowLast]}>
      <Text style={styles.lowIc}>⏳</Text>
      <View style={{ flex: 1 }}>
        <Text style={styles.lowTitle}>
          {last ? 'Call ends soon' : 'Gems running low'}
        </Text>
        <Text style={styles.lowSub}>{formatDuration(secsLeft)} left</Text>
      </View>
      <Pressable onPress={onRecharge} hitSlop={6}>
        <LinearGradient
          colors={gradients.gold}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.lowBtn}
        >
          <Text style={styles.lowBtnText}>Recharge</Text>
        </LinearGradient>
      </Pressable>
    </View>
  );
}

function Ended(p: {
  peer: UserCard;
  call: CallInfo | null;
  error: string;
  isCaller: boolean;
  blocked: boolean;
  stars: number;
  onRate: (n: number) => void;
  onAgain: () => void;
  onRecharge: () => void;
  onMessage: () => void;
  onClose: () => void;
  insetsTop: number;
  insetsBottom: number;
}) {
  const { amHost } = useWallet(); // host: kamai dikhao; user (paise dene wala): gems, rating
  const status = p.call?.status ?? 'ended';
  const talked = status === 'ended' && (p.call?.durationSec ?? 0) > 0;
  const noGems = p.call?.reason === 'no_gems';
  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />
      <LuxBackground peer={p.peer} preview={false} />
      <View
        style={[
          styles.ended,
          { paddingTop: p.insetsTop + 40, paddingBottom: p.insetsBottom + 24 },
        ]}
      >
        <Pressable
          onPress={p.onClose}
          style={[styles.closeX, { top: p.insetsTop + 8 }]}
          hitSlop={8}
        >
          <Icon name="plus" size={22} color="#fff" strokeWidth={2.4} />
        </Pressable>
        <View style={styles.endAvWrap}>
          <Avatar
            uri={p.peer.avatarUrl}
            seed={p.peer.id}
            style={styles.endAv}
            iconScale={0.85}
          />
        </View>
        <Text style={styles.endTitle}>
          {p.error
            ? 'Call failed'
            : noGems
            ? p.isCaller
              ? 'Your gems ran out'
              : 'Call ended'
            : END_TEXT[status] ?? 'Call ended'}
        </Text>
        <Text style={styles.endSub}>
          {p.error ||
            (noGems && p.isCaller
              ? `Recharge to keep talking with ${p.peer.name}`
              : `with ${p.peer.name}`)}
        </Text>

        {talked && (
          <View style={styles.sumcard}>
            <View style={styles.sumItem}>
              <Text style={styles.sumNum}>
                {formatDuration(p.call!.durationSec)}
              </Text>
              <Text style={styles.sumLbl}>Duration</Text>
            </View>
            <View style={[styles.sumItem, styles.sumBorder]}>
              <Text style={[styles.sumNum, { color: colors.gold1 }]}>
                {amHost
                  ? `+${(p.call!.hostPoints ?? 0).toLocaleString('en-IN')}`
                  : p.call!.coinsCharged}
              </Text>
              <Text style={styles.sumLbl}>
                {amHost ? 'Points earned' : 'Gems used'}
              </Text>
            </View>
            <View style={[styles.sumItem, styles.sumBorder]}>
              <Text style={styles.sumNum}>{p.call!.rate}</Text>
              <Text style={styles.sumLbl}>Gems / min</Text>
            </View>
          </View>
        )}

        {talked && !amHost && (
          <View style={styles.stars}>
            <Text style={styles.starsQ}>How was your call?</Text>
            <View style={styles.starsRow}>
              {[1, 2, 3, 4, 5].map(n => (
                <Pressable key={n} onPress={() => p.onRate(n)} hitSlop={6}>
                  <Text
                    style={[
                      styles.star,
                      n <= p.stars && { color: colors.gold2 },
                    ]}
                  >
                    ★
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        <View style={styles.endBtns}>
          {noGems && !amHost && (
            <Pressable onPress={p.onRecharge}>
              <LinearGradient
                colors={gradients.gold}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.btn}
              >
                <Coin size={20} />
                <Text style={[styles.btnText, { color: colors.goldText }]}>
                  Recharge & call again
                </Text>
              </LinearGradient>
            </Pressable>
          )}
          {!p.error && !p.blocked && !(noGems && !amHost) && (
            <Pressable onPress={p.onAgain}>
              <LinearGradient
                colors={gradients.rose}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.btn}
              >
                <Icon name="videoFill" size={20} color="#fff" />
                <Text style={styles.btnText}>Call again</Text>
              </LinearGradient>
            </Pressable>
          )}
          {!p.blocked && (
            <Pressable
              onPress={p.onMessage}
              style={[styles.btn, styles.btnGhost]}
            >
              <Icon name="chat" size={20} />
              <Text style={styles.btnText}>Send a message</Text>
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safetyBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginLeft: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  root: { flex: 1, backgroundColor: '#170610' },
  center: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  incTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 34,
  },
  incTopText: { color: 'rgba(255,255,255,0.8)', fontSize: 13 },
  pulse: {
    width: 140,
    height: 140,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wave: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 1.5,
  },
  gring: {
    position: 'absolute',
    width: 150,
    height: 150,
    borderRadius: 75,
    overflow: 'hidden',
  },
  bigAv: {
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 3,
    borderColor: '#1c0812',
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 26,
  },
  name: { color: '#fff', fontSize: 26, fontWeight: '700' },
  sub: { color: 'rgba(255,255,255,0.78)', fontSize: 14, marginTop: 6 },
  rate: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 14,
    height: 30,
    paddingLeft: 5,
    paddingRight: 12,
    borderRadius: 15,
    backgroundColor: 'rgba(212,166,75,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(212,166,75,0.35)',
  },
  rateText: { color: colors.gold1, fontSize: 12, fontWeight: '600' },

  topShade: { position: 'absolute', top: 0, left: 0, right: 0 },
  topbar: {
    position: 'absolute',
    left: 14,
    right: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  mini: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#fff',
  },
  tbName: { color: '#fff', fontSize: 15, fontWeight: '700' },
  timer: { color: colors.online, fontSize: 12, fontWeight: '600' },
  bal: {
    marginLeft: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    height: 32,
    paddingLeft: 5,
    paddingRight: 10,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  balText: { color: colors.gold1, fontSize: 12, fontWeight: '700' },
  balSub: { color: 'rgba(255,255,255,0.7)', fontSize: 11 },
  low: {
    position: 'absolute',
    left: 14,
    right: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    paddingLeft: 12,
    paddingRight: 8,
    borderRadius: 18,
    backgroundColor: 'rgba(30,10,20,0.82)',
    borderWidth: 1,
    borderColor: 'rgba(246,220,155,0.45)',
  },
  lowLast: { borderColor: 'rgba(255,95,143,0.7)' },
  lowIc: { fontSize: 18 },
  lowTitle: { color: '#fff', fontSize: 13, fontWeight: '700' },
  lowSub: {
    color: colors.gold1,
    fontSize: 12,
    fontWeight: '600',
    marginTop: 1,
  },
  lowBtn: {
    height: 34,
    paddingHorizontal: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lowBtnText: { color: colors.goldText, fontSize: 13, fontWeight: '800' },
  pip: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: PIP_W,
    height: PIP_H,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: 'rgba(246,220,155,0.9)',
    backgroundColor: '#2a0f22',
    elevation: 14,
    shadowColor: '#000',
  },
  pipClip: { flex: 1, borderRadius: 18, overflow: 'hidden' },
  camOff: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#1c0812',
  },
  camOffText: { color: 'rgba(255,255,255,0.7)', fontSize: 14 },
  pipFlip: {
    position: 'absolute',
    right: 6,
    bottom: 6,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },

  col: { alignItems: 'center' },
  lbl: { color: 'rgba(255,255,255,0.85)', fontSize: 11, marginTop: 7 },
  round: {
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 10,
    shadowColor: '#e0103f',
  },
  ctrl: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctrlGlass: {
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  ctrlOn: { backgroundColor: '#fff' },
  outActions: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    alignItems: 'flex-end',
  },
  incWrap: { position: 'absolute', left: 0, right: 0 },
  quick: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 34,
  },
  quickChip: {
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 18,
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  quickText: { color: '#fff', fontSize: 12.5 },
  incActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 44,
  },
  controls: {
    position: 'absolute',
    left: 12,
    right: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingVertical: 14,
    paddingHorizontal: 10,
    borderRadius: 28,
    backgroundColor: 'rgba(18,7,13,0.6)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },

  ended: { flex: 1, alignItems: 'center', paddingHorizontal: 22 },
  closeX: {
    position: 'absolute',
    right: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
    transform: [{ rotate: '45deg' }],
  },
  endAvWrap: {
    marginTop: 30,
    borderRadius: 52,
    borderWidth: 3,
    borderColor: colors.gold1,
    elevation: 12,
    shadowColor: colors.rose1,
  },
  endAv: { width: 98, height: 98, borderRadius: 49 },
  endTitle: { color: '#fff', fontSize: 22, fontWeight: '700', marginTop: 14 },
  endSub: {
    color: colors.muted,
    fontSize: 13,
    marginTop: 2,
    textAlign: 'center',
  },
  sumcard: {
    flexDirection: 'row',
    width: '100%',
    marginTop: 22,
    borderRadius: 20,
    backgroundColor: 'rgba(30,15,23,0.65)',
    borderWidth: 1,
    borderColor: colors.border,
  },
  sumItem: { flex: 1, alignItems: 'center', paddingVertical: 14 },
  sumBorder: { borderLeftWidth: 1, borderLeftColor: colors.border },
  sumNum: { color: '#fff', fontSize: 18, fontWeight: '700' },
  sumLbl: { color: colors.muted, fontSize: 11 },
  stars: { alignItems: 'center', marginTop: 22 },
  starsQ: { color: colors.muted, fontSize: 13, marginBottom: 6 },
  starsRow: { flexDirection: 'row', gap: 10 },
  star: { fontSize: 32, color: '#4a3540' },
  endBtns: { marginTop: 'auto', width: '100%', gap: 10 },
  btn: {
    height: 52,
    borderRadius: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  btnGhost: {
    backgroundColor: 'rgba(30,15,23,0.8)',
    borderWidth: 1,
    borderColor: colors.border,
  },
  btnText: { color: '#fff', fontSize: 14.5, fontWeight: '600' },
});
