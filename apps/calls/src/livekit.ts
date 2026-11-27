/**
 * LiveKit helpers. Docs: https://docs.livekit.io/frontends/authentication/tokens/
 * https://docs.livekit.io/reference/server-sdk-js/classes/RoomServiceClient.html
 */
import { AccessToken, RoomServiceClient, TrackSource, type VideoGrant } from "livekit-server-sdk";

export interface LiveKitConfig { url: string; httpUrl: string; apiKey: string; apiSecret: string }
export type CallKind = "voice" | "video";

export function liveKitConfig(): LiveKitConfig | null {
  const url = process.env.LIVEKIT_URL?.trim();
  const apiKey = process.env.LIVEKIT_API_KEY?.trim();
  const apiSecret = process.env.LIVEKIT_API_SECRET?.trim();
  if (!url || !apiKey || !apiSecret) return null;
  // RoomServiceClient wants an http(s) host; clients connect with ws(s)
  const httpUrl = url.replace(/^wss:/i, "https:").replace(/^ws:/i, "http:");
  const wsUrl = url.replace(/^https:/i, "wss:").replace(/^http:/i, "ws:");
  return { url: wsUrl, httpUrl, apiKey, apiSecret };
}

export const missingLiveKitVars = () => ["LIVEKIT_URL", "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET"].filter((k) => !process.env[k]?.trim());

let client: { key: string; svc: RoomServiceClient } | null = null;
export function roomService(cfg: LiveKitConfig): RoomServiceClient {
  const key = `${cfg.httpUrl}|${cfg.apiKey}`;
  if (!client || client.key !== key) client = { key, svc: new RoomServiceClient(cfg.httpUrl, cfg.apiKey, cfg.apiSecret) };
  return client.svc;
}

/** createRoom returns the existing room if one with that name already exists. */
export async function ensureRoom(cfg: LiveKitConfig, name: string, metadata: Record<string, unknown>) {
  return roomService(cfg).createRoom({
    name,
    emptyTimeout: Number(process.env.ROOM_EMPTY_TIMEOUT) || 300,
    departureTimeout: Number(process.env.ROOM_DEPARTURE_TIMEOUT) || 30,
    metadata: JSON.stringify(metadata),
  });
}

export async function participantCount(cfg: LiveKitConfig, room: string): Promise<number> {
  const rooms = await roomService(cfg).listRooms([room]);
  return rooms[0]?.numParticipants ?? 0;
}

export async function joinToken(
  cfg: LiveKitConfig,
  opts: { room: string; identity: string; name?: string; kind?: CallKind; metadata?: Record<string, unknown> },
): Promise<string> {
  const at = new AccessToken(cfg.apiKey, cfg.apiSecret, {
    identity: opts.identity,
    name: opts.name,
    ttl: process.env.TOKEN_TTL || "2h",
    metadata: opts.metadata ? JSON.stringify(opts.metadata) : undefined,
  });
  const sources =
    opts.kind === "voice"
      ? [TrackSource.MICROPHONE, TrackSource.SCREEN_SHARE, TrackSource.SCREEN_SHARE_AUDIO]
      : [TrackSource.MICROPHONE, TrackSource.CAMERA, TrackSource.SCREEN_SHARE, TrackSource.SCREEN_SHARE_AUDIO];
  const grant: VideoGrant = { room: opts.room, roomJoin: true, canPublish: true, canSubscribe: true, canPublishData: true, canPublishSources: sources };
  at.addGrant(grant);
  return at.toJwt();
}

/** Turn LiveKit SDK / network errors into readable messages. */
export function describeLiveKitError(e: unknown): { status: number; message: string } {
  const err = e as { status?: number; message?: string; cause?: { code?: string } };
  const msg = `${err?.message ?? String(e)}${err?.cause?.code ? ` (${err.cause.code})` : ""}`;
  if (err?.status === 401 || /unauthori[sz]ed|invalid.*(key|secret|token)/i.test(msg)) {
    return { status: 502, message: "LiveKit rejected the API key/secret. Check LIVEKIT_API_KEY / LIVEKIT_API_SECRET." };
  }
  if (/ENOTFOUND|ECONNREFUSED|fetch failed|ETIMEDOUT|EAI_AGAIN/i.test(msg)) return { status: 502, message: `Could not reach LiveKit at LIVEKIT_URL: ${msg}` };
  return { status: 502, message: `LiveKit error: ${msg}` };
}
