import { describe, it, expect, beforeEach } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import { ShareProfilePage } from "./ShareProfile";
import { signInDemo, resetSettings, renderAt } from "../../test/utils";
import { useSettings } from "../../stores/settings";

describe("Share profile (p1)", () => {
  beforeEach(() => {
    signInDemo();
    resetSettings();
  });

  it("renders header, card, link and actions", () => {
    renderAt(<ShareProfilePage />, "/share");
    expect(screen.getByRole("heading", { name: "Share profile" })).toBeInTheDocument();
    expect(screen.getByText("Tap the card to change its colour.")).toBeInTheDocument();
    expect(screen.getByText("Scan with any camera to add me on Secrets")).toBeInTheDocument();
    expect(screen.getByText(/\/u\/ava$/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Share$/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Save image/ })).toBeInTheDocument();
    expect(screen.getAllByRole("radio")).toHaveLength(6);
  });

  it("defaults to blue and cycles colour when the card is tapped", () => {
    renderAt(<ShareProfilePage />, "/share");
    expect(screen.getByRole("radio", { name: "Blue" })).toHaveAttribute("aria-checked", "true");
    fireEvent.click(screen.getByRole("button", { name: /Profile card/ }));
    expect(useSettings.getState().shareColor).toBe("red");
    fireEvent.click(screen.getByRole("radio", { name: "Pink" }));
    expect(useSettings.getState().shareColor).toBe("pink");
  });

  it("toggles the signed-out preview setting", () => {
    renderAt(<ShareProfilePage />, "/share");
    const before = useSettings.getState().privacy.profilePreview;
    fireEvent.click(screen.getByRole("switch", { name: "Preview for signed-out visitors" }));
    expect(useSettings.getState().privacy.profilePreview).toBe(!before);
  });

  it("shows another user's card without the preview toggle", async () => {
    renderAt(<ShareProfilePage />, "/share?u=maya");
    await waitFor(() => expect(screen.getByText(/\/u\/maya$/)).toBeInTheDocument());
    expect(screen.queryByRole("switch")).toBeNull();
  });
});
