import { useEffect, useRef, useState } from "react";
import AgoraRTC, {
  type IAgoraRTCClient,
  type IAgoraRTCRemoteUser,
} from "agora-rtc-sdk-ng";

type Props = {
  appId: string;
  channel: string;
  uid: number;
  token: string;
};

export default function AgoraPlayer({ appId, channel, uid, token }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const clientRef = useRef<IAgoraRTCClient | null>(null);
  const [remoteCount, setRemoteCount] = useState(0);
  const [err, setErr] = useState("");
  const [joined, setJoined] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const container = containerRef.current;
    if (!container) return;

    const client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });
    clientRef.current = client;

    const onUserPublished = async (
      user: IAgoraRTCRemoteUser,
      mediaType: "audio" | "video",
    ) => {
      try {
        await client.subscribe(user, mediaType);
      } catch {
        return;
      }
      if (cancelled) return;

      if (mediaType === "video" && user.videoTrack) {
        const div = document.createElement("div");
        div.id = `agora-remote-${user.uid}`;
        div.style.width = "100%";
        div.style.height = "100%";
        div.style.borderRadius = "10px";
        div.style.overflow = "hidden";
        div.style.background = "#000";
        container.appendChild(div);
        user.videoTrack.play(div);
      }
      if (mediaType === "audio" && user.audioTrack) {
        user.audioTrack.play();
      }
      setRemoteCount((prev) => prev + 1);
    };

    const removeUserEl = (uidNum: number | string) => {
      const el = container.querySelector(`#agora-remote-${uidNum}`);
      el?.remove();
    };

    const onUserUnpublished = (
      user: IAgoraRTCRemoteUser,
      mediaType: "audio" | "video",
    ) => {
      if (mediaType === "video") {
        removeUserEl(user.uid);
        setRemoteCount((prev) => Math.max(0, prev - 1));
      }
    };

    const onUserLeft = (user: IAgoraRTCRemoteUser) => {
      removeUserEl(user.uid);
      setRemoteCount((prev) => Math.max(0, prev - 1));
    };

    client.on("user-published", onUserPublished);
    client.on("user-unpublished", onUserUnpublished);
    client.on("user-left", onUserLeft);

    (async () => {
      try {
        // Subscriber: koi local track publish nahi
        await client.join(appId, channel, token, uid);
        if (!cancelled) setJoined(true);
      } catch (e) {
        if (!cancelled) setErr((e as Error).message || "Agora join failed");
      }
    })();

    return () => {
      cancelled = true;
      const c = clientRef.current;
      if (c) {
        c.removeAllListeners();
        c.leave().catch(() => {});
      }
      if (container) container.innerHTML = "";
    };
  }, [appId, channel, uid, token]);

  if (err) return <div className="alert a-red">Agora error · {err}</div>;

  return (
    <div className="agora-wrap">
      <div className="agora-stage">
        <div ref={containerRef} className="agora-video" />
        {!joined && <div className="agora-joining">Joining call…</div>}
        {joined && remoteCount === 0 && (
          <div className="agora-joining">Waiting for host & user video…</div>
        )}
      </div>
      <div className="dimtxt" style={{ marginTop: 8 }}>
        Channel: <code className="code">{channel}</code> · UID {uid}{" "}
        (subscriber)
      </div>
    </div>
  );
}
