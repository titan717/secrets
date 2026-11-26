import { describe, expect, it } from "vitest";
import { avatarColor, formatCount, initials, profileLink, safetyNumberGroups, typingLabel, AVATAR_COLORS } from "../src/shared";
import { contrastRatio } from "@secrets/tokens";

describe("shared helpers", () => {
  it("formats counts", () => {
    expect(formatCount(0)).toBe("");
    expect(formatCount(5)).toBe("5");
    expect(formatCount(150)).toBe("99+");
  });
  it("computes initials", () => {
    expect(initials("Sarah Chen")).toBe("SC");
    expect(initials("@alex")).toBe("A");
    expect(initials("mary jane watson")).toBe("MW");
    expect(initials("")).toBe("?");
  });
  it("avatar colors are deterministic and AA with white initials", () => {
    expect(avatarColor("x")).toBe(avatarColor("x"));
    for (const c of AVATAR_COLORS) expect(contrastRatio(c, "#FFFFFF")).toBeGreaterThanOrEqual(4.5);
  });
  it("typing labels", () => {
    expect(typingLabel(["Sam"])).toBe("Sam is typing…");
    expect(typingLabel(["A", "B"])).toBe("A and B are typing…");
    expect(typingLabel(["A", "B", "C"])).toBe("3 people are typing…");
  });
  it("safety number groups", () => {
    const g = safetyNumberGroups("1".repeat(60));
    expect(g).toHaveLength(12);
    expect(g[0]).toBe("11111");
  });
  it("profile link never contains keys, only username", () => {
    expect(profileLink("@alex")).toBe("https://secrets.app/u/alex");
  });
});
