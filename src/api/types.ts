/**
 * Public types for the frontend. Everything here mirrors the contract in
 * `src/api/contract.md`; E2EE can be added by changing `src/lib/envelope.ts`
 * only.
 */
export type {
  Attachment,
  MessageBody,
  MessageEnvelope,
} from "../shared/envelope";
export type {
  ApiError,
  Channel,
  Conversation,
  ConversationKind,
  Dock,
  DockMember,
  DockRole,
  DockVisibility,
  ID,
  MessageView,
  Reaction,
  Session,
  User,
} from "../shared/types";
export type {
  AiChatRequest,
  AiMessage,
  AiProvider,
  AiStreamEvent,
  Effort,
  EffortLevel,
} from "../shared/ai";
export type { VoiceRoom } from "../shared/voice";
export type { FeatureFlags } from "../shared/flags";

/** Client-side envelope alias used throughout the UI. */
export type Envelope = import("../shared/envelope").MessageEnvelope;
