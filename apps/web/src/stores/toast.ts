import { create } from "zustand";
import { uuid } from "../lib/id";

export type ToastKind = "info" | "success" | "error";
export interface Toast { id: string; kind: ToastKind; text: string }

interface ToastState {
  toasts: Toast[];
  push: (text: string, kind?: ToastKind) => void;
  dismiss: (id: string) => void;
}

export const useToasts = create<ToastState>((set, get) => ({
  toasts: [],
  push: (text, kind = "info") => {
    const id = uuid();
    set({ toasts: [...get().toasts.slice(-3), { id, kind, text }] });
    setTimeout(() => get().dismiss(id), kind === "error" ? 5200 : 3200);
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
}));

export const toast = {
  info: (t: string) => useToasts.getState().push(t, "info"),
  success: (t: string) => useToasts.getState().push(t, "success"),
  error: (t: string) => useToasts.getState().push(t, "error"),
};
