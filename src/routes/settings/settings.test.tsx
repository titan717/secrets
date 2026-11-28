import { beforeEach, describe, expect, it } from "vitest";
import { screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SettingsPage } from "./SettingsPage";
import { renderAt, resetSettings, signInDemo } from "../../test/utils";
import { useSettings } from "../../stores/settings";
import { resetFeatureDB } from "../../api/mock/features";

const open = (path: string) => renderAt(<SettingsPage />, path, "/settings/*");

describe("Settings screens (blueprint p4–p20)", () => {
  beforeEach(() => {
    resetFeatureDB();
    signInDemo();
    resetSettings();
  });

  it("home shows the profile hero and the settings list", () => {
    open("/settings");
    expect(screen.getAllByText("Ava Chen").length).toBeGreaterThan(0);
    for (const label of ["Account", "Privacy", "Notifications", "Appearance", "Fonts"]) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
  });

  it("theme screen switches theme with radios", async () => {
    open("/settings/appearance/theme");
    const radio = screen.getByRole("radio", { name: /Light/ });
    await userEvent.click(radio);
    expect(useSettings.getState().theme).toBe("light");
    expect(radio).toHaveAttribute("aria-checked", "true");
  });

  it("fonts screen defaults to the phone's font and can switch", async () => {
    open("/settings/fonts");
    expect(screen.getByRole("radio", { name: /Phone's font/ })).toHaveAttribute("aria-checked", "true");
    await userEvent.click(screen.getByRole("radio", { name: /Secrets Sans/ }));
    expect(useSettings.getState().font).toBe("general");
  });

  it("colors screen applies a solid and shows the preview bubble", async () => {
    open("/settings/appearance/colors");
    expect(screen.getByText(/Hello there!/)).toBeInTheDocument();
    const solids = screen.getByRole("radiogroup", { name: "Solids" });
    const swatches = within(solids).getAllByRole("radio");
    await userEvent.click(swatches[1]);
    expect(useSettings.getState().accent).not.toBe("g-secrets");
  });

  it("clock format toggles 24-hour", async () => {
    open("/settings/appearance/clock");
    await userEvent.click(screen.getByRole("radio", { name: /24-hour/ }));
    expect(useSettings.getState().clock24).toBe(true);
  });

  it("stories screen loads privacy and toggles the tray", async () => {
    open("/settings/stories");
    expect(screen.getByText("Who can view this story")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("radio", { name: /^All Friends All your/ })).toHaveAttribute("aria-checked", "true"));
    await userEvent.click(screen.getByRole("switch", { name: "Enable stories" }));
    expect(useSettings.getState().storiesEnabled).toBe(false);
  });

  it("about screen counts to 160 and fills a preset", async () => {
    open("/settings/profile/about");
    const box = screen.getByRole("textbox");
    await userEvent.clear(box);
    expect(screen.getByText("0/160")).toBeInTheDocument();
    await userEvent.click(screen.getByText("Deep work mode"));
    expect((box as HTMLTextAreaElement).value).toContain("Deep work mode");
    await userEvent.clear(box);
    await userEvent.type(box, "x".repeat(170));
    expect((box as HTMLTextAreaElement).value.length).toBe(160);
  });

  it("help screen can show tips again", async () => {
    useSettings.setState({ coachSeen: { "chats-v2": true } });
    open("/settings/help");
    await userEvent.click(screen.getByText("Show tips again"));
    expect(useSettings.getState().coachSeen).toEqual({});
  });

  it("add account offers the three sign-in options", () => {
    open("/settings/add-account");
    expect(screen.getByRole("heading", { name: "Add account" })).toBeInTheDocument();
    for (const n of ["Continue with Google", "Continue with email", "Continue with username"]) {
      expect(screen.getByRole("button", { name: n })).toBeInTheDocument();
    }
  });

  it("language screen marks English", () => {
    open("/settings/language");
    expect(screen.getByRole("radio", { name: /English/ })).toHaveAttribute("aria-checked", "true");
  });

  it("app icon screen switches icon", async () => {
    open("/settings/appearance/app-icon");
    await userEvent.click(screen.getByRole("radio", { name: /Secrets Ghost/ }));
    expect(useSettings.getState().appIcon).not.toBe("default");
  });
});
