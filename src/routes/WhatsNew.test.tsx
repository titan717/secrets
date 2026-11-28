import { describe, it, expect, beforeEach } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { WhatsNewPage, RELEASE } from "./WhatsNew";
import { signInDemo, resetSettings, renderAt } from "../test/utils";
import { useSettings } from "../stores/settings";
import { APP_VERSION } from "../lib/version";

describe("What's new (p33–37)", () => {
  beforeEach(() => {
    signInDemo();
    resetSettings({ whatsNewSeen: "0.1.0" });
  });

  it("renders version, headline, every section and Continue", () => {
    renderAt(<WhatsNewPage />, "/whats-new");
    expect(screen.getByText(`Secrets ${APP_VERSION}`)).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: RELEASE.title })).toBeInTheDocument();
    for (const s of RELEASE.sections) expect(screen.getByRole("heading", { level: 2, name: s.heading })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue" })).toBeInTheDocument();
  });

  it("marks the version as seen on Continue and on close", () => {
    renderAt(<WhatsNewPage />, "/whats-new");
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(useSettings.getState().whatsNewSeen).toBe(APP_VERSION);
    resetSettings({ whatsNewSeen: "0.1.0" });
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(useSettings.getState().whatsNewSeen).toBe(APP_VERSION);
  });
});
