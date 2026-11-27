/**
 * Copied verbatim from titan717/api.secrets packages/shared/src/voice.ts. Keep shapes identical.
 * POST {VOICE_URL}/v1/rooms   header Authorization: Bearer <secrets session token>
 *   body { conversation_id, kind: "voice" | "video" } -> VoiceRoom
 * POST {VOICE_URL}/v1/token   body { room, identity?, name? } -> { token, url, room }
 * GET  {VOICE_URL}/v1/rooms/:room -> { room, participants: number }
 * The web client joins with livekit-client using { url, token }.
 */
export interface VoiceRoom { room: string; url: string; token: string; kind: "voice" | "video" }

export interface CreateRoomBody { conversation_id: string; kind: "voice" | "video" }
export interface TokenBody { room: string; identity?: string; name?: string }
export interface TokenResponse { token: string; url: string; room: string }
export interface RoomInfo { room: string; participants: number }

/** Secrets API session JWT payload (HS256, signed with JWT_SECRET). */
export interface SessionClaims { sub: string; username?: string; did?: string; exp?: number; iat?: number }
