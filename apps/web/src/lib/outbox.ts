/**
 * Persistent offline queue for outgoing messages (localStorage).
 * Entries survive reloads and are flushed on reconnect. The server dedupes
 * on (sender_id, client_msg_id), so re-sending is always safe.
 */
export type PendingStatus = "queued" | "sending" | "failed";

export interface PendingMsg {
  client_msg_id: string;
  conversation_id: string;
  ciphertext: string;
  nonce: string | null;
  created_at: string;
  status: PendingStatus;
  attempts: number;
  error?: string;
}

const key = (userId: string) => `secrets.outbox.${userId}`;

export function loadOutbox(userId: string): Record<string, PendingMsg> {
  try {
    const raw = localStorage.getItem(key(userId));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, PendingMsg>;
    // Anything that was mid-flight when the tab closed goes back to queued.
    for (const p of Object.values(parsed)) if (p.status === "sending") p.status = "queued";
    return parsed;
  } catch {
    return {};
  }
}

export function saveOutbox(userId: string, items: Record<string, PendingMsg>) {
  try {
    localStorage.setItem(key(userId), JSON.stringify(items));
  } catch {
    /* quota — best effort */
  }
}

const syncKey = (userId: string) => `secrets.lastSync.${userId}`;
export const loadLastSync = (userId: string) => localStorage.getItem(syncKey(userId));
export const saveLastSync = (userId: string, iso: string) => localStorage.setItem(syncKey(userId), iso);
