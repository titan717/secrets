import { useEffect, useRef, useState } from "react";
import { Track } from "livekit-client";
import { AlertTriangle, Maximize2, Mic, MicOff, Minimize2, MonitorUp, MonitorX, PhoneOff, Video, VideoOff, Volume2, X } from "lucide-react";
import { Avatar, Button, Spinner } from "../../ui";
import { useCalls } from "../../stores/calls";
import { useChat } from "../../stores/chat";
import { useSession } from "../../stores/session";
import { useCallRoom, type TileInfo } from "../../lib/voice/useCallRoom";
import { formatDuration } from "../../lib/voice/format";
import "../../styles/calls.css";

function useNow(active: boolean) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

function Tile({ tile, version }: { tile: TileInfo; version: number }) {
  const ref = useRef<HTMLVideoElement>(null);
  const known = useChat((s) => s.users[tile.userId]);
  const me = useSession((s) => s.user);
  const user = tile.isLocal ? (me ?? known) : known;
  const p = tile.participant;
  const pub = p.getTrackPublication(tile.screen ? Track.Source.ScreenShare : Track.Source.Camera);
  const track = pub?.track && !pub.isMuted ? pub.track : undefined;
  const micOn = p.isMicrophoneEnabled;

  useEffect(() => {
    const el = ref.current;
    if (!el || !track) return;
    track.attach(el);
    return () => {
      track.detach(el);
    };
  }, [track, version]);

  const name = tile.isLocal ? "You" : user?.display_name || tile.name;
  return (
    <div className={`call-tile ${p.isSpeaking && !tile.screen ? "is-speaking" : ""} ${tile.screen ? "is-screen" : ""} ${track ? "has-video" : ""}`}>
      {track ? (
        <video ref={ref} autoPlay playsInline muted={tile.isLocal} className={tile.isLocal && !tile.screen ? "is-mirror" : ""} />
      ) : (
        <div className="call-tile-avatar">
          <Avatar name={tile.isLocal ? (user?.display_name ?? "You") : name} src={user?.avatar_url} seed={tile.userId} size={88} />
        </div>
      )}
      <div className="call-tile-label">
        {!tile.screen && !micOn && <MicOff size={13} aria-label="Muted" />}
        {tile.screen && <MonitorUp size={13} />}
        <span className="truncate">{tile.screen ? `${name}’s screen` : name}</span>
      </div>
    </div>
  );
}

export function CallStage() {
  const active = useCalls((s) => s.active)!;
  const end = useCalls((s) => s.end);
  const minimized = useCalls((s) => s.minimized);
  const setMinimized = useCalls((s) => s.setMinimized);
  const c = useCallRoom(active);
  const now = useNow(c.phase === "connected" || c.phase === "reconnecting");
  const elapsed = c.connectedAt ? (now - c.connectedAt) / 1000 : 0;
  const isVideo = active.kind === "video";
  const canShare = typeof navigator !== "undefined" && !!navigator.mediaDevices?.getDisplayMedia;

  const leave = () => end(c.connectedAt ? { connectedSeconds: Math.round((Date.now() - c.connectedAt) / 1000) } : c.error ? { failed: c.error } : {});

  // Keyboard: M mute, V camera, Esc minimize
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, [contenteditable]")) return;
      if (e.key === "m" || e.key === "M") void c.toggle("mic");
      if ((e.key === "v" || e.key === "V") && isVideo) void c.toggle("camera");
      if (e.key === "Escape" && !minimized) setMinimized(true);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [c.toggle, isVideo, minimized, setMinimized]); // eslint-disable-line react-hooks/exhaustive-deps

  const status =
    c.phase === "connecting" ? "Connecting…" : c.phase === "reconnecting" ? "Reconnecting…" : c.phase === "failed" ? "Call failed" : c.phase === "disconnected" ? "Call ended" : c.remoteCount === 0 ? `Waiting for others · ${formatDuration(elapsed)}` : formatDuration(elapsed);

  const controls = (
    <div className="call-controls">
      <button type="button" className={`call-btn ${c.mic ? "" : "is-off"}`} onClick={() => void c.toggle("mic")} aria-label={c.mic ? "Mute" : "Unmute"} title={c.mic ? "Mute (M)" : "Unmute (M)"} disabled={c.phase === "failed"}>
        {c.mic ? <Mic size={20} /> : <MicOff size={20} />}
      </button>
      {isVideo && (
        <button type="button" className={`call-btn ${c.camera ? "" : "is-off"}`} onClick={() => void c.toggle("camera")} aria-label={c.camera ? "Turn camera off" : "Turn camera on"} title="Camera (V)" disabled={c.phase === "failed"}>
          {c.camera ? <Video size={20} /> : <VideoOff size={20} />}
        </button>
      )}
      {canShare && !minimized && (
        <button type="button" className={`call-btn ${c.screen ? "is-on" : ""}`} onClick={() => void c.toggle("screen")} aria-label={c.screen ? "Stop sharing" : "Share screen"} title={c.screen ? "Stop sharing" : "Share screen"} disabled={c.phase !== "connected"}>
          {c.screen ? <MonitorX size={20} /> : <MonitorUp size={20} />}
        </button>
      )}
      <button type="button" className="call-btn call-leave" onClick={leave} aria-label="Leave call" title="Leave call">
        <PhoneOff size={20} />
      </button>
    </div>
  );

  if (minimized) {
    return (
      <div className="call-pill" role="region" aria-label={`Call with ${active.title}`}>
        <button type="button" className="call-pill-info" onClick={() => setMinimized(false)} title="Return to call">
          <span className={`call-dot is-${c.phase}`} />
          <span className="col call-pill-text">
            <strong className="truncate">{active.title}</strong>
            <span className="faint">{status}</span>
          </span>
          <Maximize2 size={15} />
        </button>
        {controls}
      </div>
    );
  }

  const n = c.tiles.length;
  const hasScreen = c.tiles.some((t) => t.screen);
  return (
    <div className={`call-overlay ${isVideo ? "is-video" : "is-voice"}`} role="dialog" aria-modal="true" aria-label={`${isVideo ? "Video" : "Voice"} call with ${active.title}`}>
      <header className="call-top">
        <div className="grow">
          <h2 className="truncate">{active.title}</h2>
          <p className="call-status">
            <span className={`call-dot is-${c.phase}`} />
            {status}
          </p>
        </div>
        <button type="button" className="call-icon" onClick={() => setMinimized(true)} aria-label="Minimize call" title="Minimize (Esc)">
          <Minimize2 size={18} />
        </button>
      </header>

      {c.phase === "failed" ? (
        <div className="call-center">
          <AlertTriangle size={36} className="call-warn" />
          <p className="call-fail">{c.error}</p>
          <Button variant="secondary" onClick={leave}>
            Close
          </Button>
        </div>
      ) : n === 0 ? (
        <div className="call-center">
          <Spinner size={26} />
        </div>
      ) : (
        <div className={`call-grid n-${Math.min(n, 9)} ${hasScreen ? "has-screen" : ""}`}>
          {c.tiles.map((t) => (
            <Tile key={t.key} tile={t} version={c.version} />
          ))}
        </div>
      )}

      {(c.mediaError || c.audioBlocked) && (
        <div className="call-banner" role="status">
          {c.audioBlocked ? (
            <>
              <Volume2 size={16} />
              <span>Your browser paused call audio.</span>
              <Button size="sm" onClick={() => void c.startAudio()}>
                Enable audio
              </Button>
            </>
          ) : (
            <>
              <AlertTriangle size={16} />
              <span>{c.mediaError}</span>
              <button type="button" className="call-icon sm" onClick={c.clearMediaError} aria-label="Dismiss">
                <X size={14} />
              </button>
            </>
          )}
        </div>
      )}

      <footer className="call-bottom">{controls}</footer>
    </div>
  );
}
