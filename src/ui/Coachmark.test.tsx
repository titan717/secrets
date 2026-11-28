import { describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CoachTour } from "./Coachmark";
import { useSettings } from "../stores/settings";
import { resetSettings } from "../test/utils";

// jsdom has no layout; pretend every element is on screen.
Element.prototype.getClientRects = function () {
  return [{ x: 0, y: 0, width: 10, height: 10 }] as unknown as DOMRectList;
};

describe("CoachTour (blueprint p21–32)", () => {
  it("skips steps whose target is missing, shows dots and finishes with Continue", async () => {
    resetSettings({ coachSeen: {} });
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const action = vi.fn();
    render(
      <>
        <button data-coach="a">A</button>
        <button data-coach="c">C</button>
        <CoachTour
          id="t1"
          delay={10}
          steps={[
            { target: "a", title: "First", body: "one" },
            { target: "b", title: "Missing", body: "two" },
            { target: "c", title: "Last", body: "three", secondary: "Got it", action },
          ]}
        />
      </>,
    );
    await act(async () => {
      vi.advanceTimersByTime(20);
    });
    vi.useRealTimers();
    expect(screen.getByRole("dialog", { name: "First" })).toBeInTheDocument();
    expect(screen.getByLabelText("Tip 1 of 2")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByRole("dialog", { name: "Last" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Got it" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(action).toHaveBeenCalled();
    expect(useSettings.getState().coachSeen.t1).toBe(true);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("does not show a tour that was already seen", async () => {
    resetSettings({ coachSeen: { t2: true } });
    render(
      <>
        <button data-coach="a">A</button>
        <CoachTour id="t2" delay={0} steps={[{ target: "a", title: "Hidden", body: "x" }]} />
      </>,
    );
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
