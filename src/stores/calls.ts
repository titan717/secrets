import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { VoiceRoom } from "@shared";
import { VOICE_URL } from "../config";
import { uuid } from "../lib/id";
import { getToken } from "./session";
import { toast } from "./toast";

export type CallKind = "voice" | "video";

export interface CallRecord {
  id: string;
  conversation_id: string;
  title: string;
  kind: CallKind;
  started_at: string;
  ended_at?: string;
  /** Seconds actually connected. */
  duration?: number;
  outcome: "completed" | "failed" | "missed";
  reason?: string;
  avatar_seed?: string;
}

export interface ActiveCall extends VoiceRoom {
  id: string;
  conversation_id: string;
  title: string;
  started_at: string;
}

export interface StartCallOpts {
  conversation_id: string;
  kind: CallKind;
  title: string;
}

interface CallState {
  active: ActiveCall | null;
  starting: boolean;
  minimized: boolean;
  history: CallRecord[];
  /** Ask the voice service for a room + token and open the call overlay. */
  start: (opts: StartCallOpts) => Promise<void>;
  /** Leave the current call. Pass connectedSeconds for history; failed=true if it never connected. */
  end: (opts?: { connectedSeconds?: number; failed?: string }) => void;
  setMinimized: (v: boolean) => void;
  removeRecord: (id: string) => void;
  clearHistory: () => void;
}

/** Turn voice-service failures into messages a person can act on. */
async function failureMessage(res: Response): Promise<string> {
  let body: { error?: string; message?: string } = {};
  try {
    body = await res.json();
  } catch {
    /* non-JSON */
  }
  if (res.status === 503 || body.error === "livekit_not_configured") return "Calls aren’t set up on this server yet. An admin needs to connect LiveKit to the voice service.";
  if (res.status === 401) return "Your session expired — sign in again to make calls.";
  if (res.status === 403) return "You’re not a member of this conversation.";
  if (res.status === 502) return "The call server didn’t respond. Try again in a moment.";
  return body.message || `Call service returned ${res.status}`;
}

const MAX_HISTORY = 100;

export const useCalls = create<CallState>()(
  persist(
    (set, get) => {
      const record = (r: CallRecord) => set({ history: [r, ...get().history.filter((h) => h.id !== r.id)].slice(0, MAX_HISTORY) });
      return {
        active: null,
        starting: false,
        minimized: false,
        history: [],
        start: async ({ conversation_id, kind, title }) => {
          if (get().active) {
            if (get().active!.conversation_id === conversation_id) set({ minimized: false });
            else toast.info("You’re already in a call — leave it first.");
            return;
          }
          if (get().starting) return;
          set({ starting: true });
          const id = uuid();
          const started_at = new Date().toISOString();
          try {
            const res = await fetch(`${VOICE_URL}/v1/rooms`, {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken() ?? ""}` },
              body: JSON.stringify({ conversation_id, kind }),
            });
            if (!res.ok) throw new Error(await failureMessage(res));
            const room = (await res.json()) as VoiceRoom;
            set({ active: { ...room, kind: room.kind ?? kind, id, conversation_id, title, started_at }, minimized: false });
          } catch (e) {
            const msg = e instanceof TypeError ? "Calls aren’t reachable right now. The voice service may be offline — try again in a bit." : (e as Error).message;
            toast.error(msg);
            record({ id, conversation_id, title, kind, started_at, ended_at: started_at, outcome: "failed", reason: msg });
          } finally {
            set({ starting: false });
          }
        },
        end: (opts = {}) => {
          const a = get().active;
          if (!a) return;
          set({ active: null, minimized: false });
          record({
            id: a.id,
            conversation_id: a.conversation_id,
            title: a.title,
            kind: a.kind,
            started_at: a.started_at,
            ended_at: new Date().toISOString(),
            duration: opts.connectedSeconds,
            outcome: opts.failed ? "failed" : "completed",
            reason: opts.failed,
          });
        },
        setMinimized: (minimized) => set({ minimized }),
        removeRecord: (id) => set({ history: get().history.filter((h) => h.id !== id) }),
        clearHistory: () => set({ history: [] }),
      };
    },
    { name: "secrets.calls", version: 1, partialize: (s) => ({ history: s.history }) as Partial<CallState> },
  ),
);

/** Non-hook helper, e.g. for quick re-call from history. */
export const startCall = (opts: StartCallOpts) => useCalls.getState().start(opts);
