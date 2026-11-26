/**
 * Platform-neutral prop types shared by web (@secrets/ui) and React Native
 * (apps/mobile) components. Keep this file free of DOM and RN imports.
 */

export type Size = "sm" | "md" | "lg";
export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type Tone = "neutral" | "accent" | "success" | "danger" | "warning";
export type Presence = "online" | "away" | "busy" | "offline";
export type AvatarSize = "xs" | "sm" | "md" | "lg" | "xl";

export type MessageStatus = "sending" | "sent" | "delivered" | "read" | "failed";
export type MessageDirection = "in" | "out";
/** Position of a bubble within a run of consecutive messages from one sender. */
export type GroupPosition = "single" | "first" | "middle" | "last";

export interface Reaction {
  emoji: string;
  count: number;
  /** True when the current user reacted with this emoji. */
  mine?: boolean;
}

export interface ReplyPreview {
  author: string;
  text: string;
}

export interface AvatarData {
  name: string;
  src?: string;
  presence?: Presence;
}

export interface ConversationSummary {
  id: string;
  title: string;
  avatars: AvatarData[];
  preview?: string;
  /** Preformatted time label, e.g. "9:42 AM", "Yesterday". */
  time?: string;
  unread?: number;
  pinned?: boolean;
  muted?: boolean;
  draft?: string;
  isGroup?: boolean;
  /** Names currently typing. */
  typing?: string[];
  verified?: boolean;
}

export type EncryptionState = "encrypted" | "verified" | "unverified" | "not-encrypted";

export interface StoryItem {
  id: string;
  name: string;
  src?: string;
  unseen?: boolean;
  isSelf?: boolean;
}
