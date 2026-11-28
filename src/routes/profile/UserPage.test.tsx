import { describe, it, expect, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { UserPage } from "./UserPage";
import { signInDemo, resetSettings, renderAt } from "../../test/utils";

describe("Public profile (p3)", () => {
  beforeEach(() => {
    signInDemo();
    resetSettings();
  });

  it("shows cover actions, name, handle, about, joined, Add Friend and media row", async () => {
    renderAt(<UserPage />, "/u/maya", "/u/:username");
    await waitFor(() => expect(screen.getByRole("heading", { name: "Maya Patel" })).toBeInTheDocument());
    expect(screen.getByText("@maya")).toBeInTheDocument();
    expect(screen.getByText(/Product designer/)).toBeInTheDocument();
    expect(screen.getByText(/Joined/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Back" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Share profile" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Add Friend/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Media, files and links/ })).toBeInTheDocument();
  });

  it("offers Edit profile on your own page", async () => {
    renderAt(<UserPage />, "/u/ava", "/u/:username");
    await waitFor(() => expect(screen.getByRole("button", { name: /Edit profile/ })).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /Media, files/ })).toBeNull();
  });
});
