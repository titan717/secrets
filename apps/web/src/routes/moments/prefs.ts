import { useSyncExternalStore } from "react";

const KEY = "secrets.moments.enabled";
const subs = new Set<() => void>();
const read = () => localStorage.getItem(KEY) !== "0";

/** Local preference: show/hide the moments row on Chats. */
export function useMomentsEnabled(): [boolean, (v: boolean) => void] {
  const v = useSyncExternalStore(
    (cb) => {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    read,
    () => true,
  );
  return [
    v,
    (n: boolean) => {
      localStorage.setItem(KEY, n ? "1" : "0");
      subs.forEach((f) => f());
    },
  ];
}
