/**
 * Contract between apps/web and voice.secretsapi (LiveKit).
 * POST {VOICE_URL}/v1/rooms   header Authorization: Bearer <secrets session token>
 *   body { conversation_id, kind: "voice" | "video" } -> VoiceRoom
 * POST {VOICE_URL}/v1/token   body { room, identity?, name? } -> { token, url, room }
 * GET  {VOICE_URL}/v1/rooms/:room -> { room, participants: number }
 * The web client joins with livekit-client using { url, token }.
 */
export interface VoiceRoom { room: string; url: string; token: string; kind: "voice" | "video" }
