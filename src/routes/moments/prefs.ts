import { useSettings } from "../../stores/settings";

/** Show/hide the stories (moments) tray on Chats. Backed by the settings store (Settings → Stories). */
export function useMomentsEnabled(): [boolean, (v: boolean) => void] {
  const v = useSettings((s) => s.storiesEnabled);
  return [v, (n: boolean) => useSettings.getState().set({ storiesEnabled: n })];
}
