import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { ConnectionState, Room, RoomEvent, Track, type Participant, type RemoteTrack } from "livekit-client";
import type { ActiveCall } from "../../stores/calls";

export type CallPhase = "connecting" | "connected" | "reconnecting" | "disconnected" | "failed";

export interface TileInfo {
  key: string;
  participant: Participant;
  isLocal: boolean;
  screen: boolean;
  name: string;
  userId: string;
}

function meta(p: Participant): { user_id?: string; username?: string } {
  try {
    return p.metadata ? JSON.parse(p.metadata) : {};
  } catch {
    return {};
  }
}

export function displayName(p: Participant) {
  const m = meta(p);
  return p.name || m.username || p.identity || "Guest";
}

export function participantUserId(p: Participant) {
  return meta(p).user_id || p.identity;
}

function friendlyMediaError(e: unknown): string {
  const name = (e as { name?: string })?.name ?? "";
  if (name === "NotAllowedError") return "Permission denied — allow microphone/camera access in your browser.";
  if (name === "NotFoundError") return "No microphone or camera found.";
  if (name === "NotReadableError") return "Your microphone or camera is in use by another app.";
  return (e as Error)?.message || "Could not access media devices.";
}

/**
 * Connects to a LiveKit room for the active call and exposes participants + local media toggles.
 * One Room per call id; disconnects on unmount / call change.
 */
export function useCallRoom(call: ActiveCall | null) {
  const roomRef = useRef<Room | null>(null);
  const [phase, setPhase] = useState<CallPhase>("connecting");
  const [error, setError] = useState<string | null>(null);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [connectedAt, setConnectedAt] = useState<number | null>(null);
  const [version, bump] = useReducer((x: number) => x + 1, 0);
  const audioHost = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!call) return;
    const room = new Room({ adaptiveStream: true, dynacast: true, audioCaptureDefaults: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    roomRef.current = room;
    setPhase("connecting");
    setError(null);
    setMediaError(null);
    setConnectedAt(null);

    const host = document.createElement("div");
    host.style.display = "none";
    document.body.appendChild(host);
    audioHost.current = host;

    const onSub = (track: RemoteTrack) => {
      if (track.kind === Track.Kind.Audio) host.appendChild(track.attach());
      bump();
    };
    const onUnsub = (track: RemoteTrack) => {
      track.detach().forEach((el) => el.remove());
      bump();
    };
    const onState = (s: ConnectionState) => {
      if (s === ConnectionState.Connected) {
        setPhase("connected");
        setConnectedAt((t) => t ?? Date.now());
      } else if (s === ConnectionState.Reconnecting || s === ConnectionState.SignalReconnecting) setPhase("reconnecting");
      else if (s === ConnectionState.Disconnected) setPhase((p) => (p === "failed" ? p : "disconnected"));
      bump();
    };

    room
      .on(RoomEvent.TrackSubscribed, onSub)
      .on(RoomEvent.TrackUnsubscribed, onUnsub)
      .on(RoomEvent.ConnectionStateChanged, onState)
      .on(RoomEvent.ParticipantConnected, bump)
      .on(RoomEvent.ParticipantDisconnected, bump)
      .on(RoomEvent.TrackMuted, bump)
      .on(RoomEvent.TrackUnmuted, bump)
      .on(RoomEvent.LocalTrackPublished, bump)
      .on(RoomEvent.LocalTrackUnpublished, bump)
      .on(RoomEvent.ActiveSpeakersChanged, bump)
      .on(RoomEvent.ParticipantMetadataChanged, bump)
      .on(RoomEvent.AudioPlaybackStatusChanged, () => setAudioBlocked(!room.canPlaybackAudio))
      .on(RoomEvent.MediaDevicesError, (e: Error) => setMediaError(friendlyMediaError(e)));

    let cancelled = false;
    (async () => {
      try {
        await room.connect(call.url, call.token);
        if (cancelled) return;
        try {
          await room.localParticipant.setMicrophoneEnabled(true);
        } catch (e) {
          setMediaError(friendlyMediaError(e));
        }
        if (call.kind === "video") {
          try {
            await room.localParticipant.setCameraEnabled(true);
          } catch (e) {
            setMediaError(friendlyMediaError(e));
          }
        }
        setAudioBlocked(!room.canPlaybackAudio);
        bump();
      } catch (e) {
        if (cancelled) return;
        setPhase("failed");
        setError((e as Error)?.message ? `Couldn’t join the call: ${(e as Error).message}` : "Couldn’t join the call.");
      }
    })();

    return () => {
      cancelled = true;
      room.removeAllListeners();
      void room.disconnect();
      host.remove();
      roomRef.current = null;
    };
  }, [call?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const room = roomRef.current;
  const lp = room?.localParticipant;

  const toggle = useCallback(async (what: "mic" | "camera" | "screen") => {
    const r = roomRef.current;
    if (!r) return;
    const p = r.localParticipant;
    try {
      setMediaError(null);
      if (what === "mic") await p.setMicrophoneEnabled(!p.isMicrophoneEnabled);
      if (what === "camera") await p.setCameraEnabled(!p.isCameraEnabled);
      if (what === "screen") await p.setScreenShareEnabled(!p.isScreenShareEnabled, { audio: true });
    } catch (e) {
      if ((e as { name?: string })?.name !== "NotAllowedError" || what !== "screen") setMediaError(friendlyMediaError(e));
    }
    bump();
  }, []);

  const tiles: TileInfo[] = [];
  if (room) {
    const all: Participant[] = [room.localParticipant, ...Array.from(room.remoteParticipants.values())];
    for (const p of all) {
      const isLocal = p === room.localParticipant;
      const base = { participant: p, isLocal, name: isLocal ? "You" : displayName(p), userId: participantUserId(p) };
      if (p.getTrackPublication(Track.Source.ScreenShare)?.track) tiles.unshift({ ...base, key: `${p.identity}:screen`, screen: true });
      tiles.push({ ...base, key: p.identity || "local", screen: false });
    }
  }

  return {
    phase,
    error,
    mediaError,
    clearMediaError: () => setMediaError(null),
    audioBlocked,
    startAudio: () => roomRef.current?.startAudio().then(() => setAudioBlocked(false)),
    connectedAt,
    tiles,
    remoteCount: room ? room.remoteParticipants.size : 0,
    mic: !!lp?.isMicrophoneEnabled,
    camera: !!lp?.isCameraEnabled,
    screen: !!lp?.isScreenShareEnabled,
    toggle,
    version,
  };
}
