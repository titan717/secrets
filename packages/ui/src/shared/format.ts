import type { MessageStatus, Presence } from "./types";

/** "99+" style unread label. */
export function formatCount(count: number, max = 99): string {
  if (count <= 0) return "";
  return count > max ? `${max}+` : String(count);
}

export function unreadLabel(count: number): string {
  return count === 1 ? "1 unread message" : `${count} unread messages`;
}

/** Up to two initials from a display name ("Sarah Chen" → "SC", "@alex" → "A"). */
export function initials(name: string): string {
  const parts = name
    .replace(/^@/, "")
    .trim()
    .split(/[\s._-]+/)
    .filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0]!;
  if (parts.length === 1) return first.slice(0, 1).toUpperCase();
  return (first[0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

/**
 * Deterministic avatar background for initials. Muted hues, all chosen so
 * white initials meet 4.5:1.
 */
export const AVATAR_COLORS = ["#5B4BC4", "#2F6FD0", "#1F7A6D", "#9A3FB8", "#B83E68", "#8A5A12", "#4D5675"] as const;

export function avatarColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length]!;
}

export const STATUS_LABEL: Record<MessageStatus, string> = {
  sending: "Sending",
  sent: "Sent",
  delivered: "Delivered",
  read: "Read",
  failed: "Not sent",
};

export const PRESENCE_LABEL: Record<Presence, string> = {
  online: "Online",
  away: "Away",
  busy: "Do not disturb",
  offline: "Offline",
};

export function typingLabel(names: string[]): string {
  if (names.length === 0) return "";
  if (names.length === 1) return `${names[0]} is typing…`;
  if (names.length === 2) return `${names[0]} and ${names[1]} are typing…`;
  return `${names.length} people are typing…`;
}

/** Split a 60-digit safety number into 12 groups of 5 digits. */
export function safetyNumberGroups(value: string): string[] {
  const digits = value.replace(/\D/g, "");
  const groups: string[] = [];
  for (let i = 0; i < digits.length; i += 5) groups.push(digits.slice(i, i + 5));
  return groups;
}

export const PROFILE_LINK_BASE = "https://secrets.app/u/";
export function profileLink(username: string): string {
  return PROFILE_LINK_BASE + encodeURIComponent(username.replace(/^@/, ""));
}
