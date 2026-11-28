import { describe, it, expect, beforeEach } from "vitest";
import { screen, fireEvent, waitFor, render } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { Signup, useSignupDraft, usernameIdeas, ageOn, normalizeUsername } from "./Signup";
import { Welcome } from "./Welcome";
import { Login } from "./Login";
import { resetMockDB, setMockSession } from "../../api/mock/db";
import { useSession } from "../../stores/session";
import { resetSettings } from "../../test/utils";

function at(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/welcome" element={<Welcome />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup/*" element={<Signup />} />
        <Route path="/chats" element={<div data-testid="chats" />} />
        <Route path="*" element={<div data-testid="elsewhere" />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("Onboarding (p38–47)", () => {
  beforeEach(() => {
    resetMockDB();
    setMockSession(false);
    useSession.setState({ token: null, user: null, ready: true });
    useSignupDraft.getState().reset();
    resetSettings();
  });

  it("helpers: username normalising, ideas and age", () => {
    expect(normalizeUsername("@Amit K!")).toBe("amitk");
    const ideas = usernameIdeas("Amit Kumar", "", () => 0.5);
    expect(ideas[0]).toBe("amit");
    expect(ideas.every((s) => /^[a-z0-9_.]{3,24}$/.test(s))).toBe(true);
    expect(ageOn("2000-06-15", new Date(2026, 5, 14))).toBe(25);
    expect(ageOn("2000-06-15", new Date(2026, 5, 15))).toBe(26);
  });

  it("welcome shows headline, Google, Create account and Log in", () => {
    at("/welcome");
    expect(screen.getByRole("heading", { name: "The chat app that thinks with you." })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Continue with Google/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Log in" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));
    expect(screen.getByRole("heading", { name: "What's your name?" })).toBeInTheDocument();
  });

  it("Google chooser signs in the demo account", async () => {
    at("/welcome");
    fireEvent.click(screen.getByRole("button", { name: /Continue with Google/ }));
    expect(screen.getByRole("dialog", { name: "Choose an account" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Ava Chen/ }));
    await waitFor(() => expect(screen.getByTestId("chats")).toBeInTheDocument());
    expect(useSession.getState().user?.username).toBe("ava");
  });

  it("signs in with username then password", async () => {
    at("/login");
    fireEvent.change(screen.getByLabelText("Email or username"), { target: { value: "ava" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByRole("heading", { name: "Enter your password" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "secrets123" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() => expect(screen.getByTestId("chats")).toBeInTheDocument());
  });

  it("walks name → birthday → username and creates the account", async () => {
    at("/signup");
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByRole("heading", { name: "What's your name?" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Your name"), { target: { value: "Amit" } });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByRole("heading", { name: "When's your birthday?" })).toBeInTheDocument();
    expect(screen.getByText("Choose your date of birth")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    const dlg = screen.getByRole("dialog", { name: "Choose your date of birth" });
    expect(dlg).toHaveTextContent("Sat, 1 Jan");
    fireEvent.click(screen.getByRole("button", { name: "30 January 2000" }));
    fireEvent.click(screen.getByRole("button", { name: "OK" }));
    expect(screen.getByText("30 January 2000")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByRole("heading", { name: "Pick a username" })).toBeInTheDocument();
    expect(screen.getByLabelText("Username")).toHaveValue("amit");
    await waitFor(() => expect(screen.getByText("@amit is available.")).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText("Username"), { target: { value: "maya" } });
    await waitFor(() => expect(screen.getByText("@maya is taken.")).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText("Username"), { target: { value: "amit_k" } });
    await waitFor(() => expect(screen.getByText("@amit_k is available.")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));
    await waitFor(() => expect(screen.getByTestId("chats")).toBeInTheDocument());
    expect(useSession.getState().user).toMatchObject({ username: "amit_k", display_name: "Amit" });
  });

  it("rejects birthdays under 13", () => {
    useSignupDraft.setState({ name: "Kid", birthday: `${new Date().getFullYear() - 5}-01-01` });
    at("/signup/birthday");
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByRole("alert")).toHaveTextContent("at least 13");
  });
});
