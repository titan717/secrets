import type { ReactElement } from "react";
import { render } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { getDB, resetMockDB, setMockSession, findUser } from "../api/mock/db";
import { useSession } from "../stores/session";
import { useSettings, SETTINGS_DEFAULTS } from "../stores/settings";

/** Signs in the demo user (ava) against the mock database. */
export function signInDemo() {
  resetMockDB();
  setMockSession(true);
  const db = getDB();
  const me = findUser(db.me)!;
  useSession.setState({ token: "mock", user: me, ready: true });
  return me;
}

export function resetSettings(patch: Partial<typeof SETTINGS_DEFAULTS> = {}) {
  useSettings.setState({ ...SETTINGS_DEFAULTS, coachSeen: { "story-preview": true }, ...patch } as any);
}

/** Renders `ui` at `path` inside a router; `pattern` is the route path (defaults to "*"). */
export function renderAt(ui: ReactElement, path = "/", pattern = "*") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path={pattern} element={ui} />
        <Route path="*" element={<div data-testid="elsewhere" />} />
      </Routes>
    </MemoryRouter>,
  );
}
