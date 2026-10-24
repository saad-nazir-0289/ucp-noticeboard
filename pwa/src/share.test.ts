import { describe, expect, it } from "vitest";
import { shareCaption } from "@shared/share";
import type { Notice } from "@shared/types";

const notice = (deadline: string | null, description = "Teams of 2-4.\nPrizes for the top three teams."): Notice => ({
  id: 7,
  title: "Spring Hackathon registrations close",
  description,
  imageUrl: null,
  linkUrl: null,
  categoryId: null,
  categoryName: null,
  deadline,
  createdByUserId: 1,
  createdByName: "Computing Society",
  createdAt: "2026-10-14T10:00:00Z",
  updatedAt: "2026-10-14T10:00:00Z",
  viewCount: null,
  isPinned: false,
  sendLastCall: false,
  createdByLogoUrl: null,
});

const URL = "https://ucpnb-api.duckdns.org/share/notice/7";

describe("shareCaption", () => {
  it("name, then details, then the link on its own at the end", () => {
    expect(shareCaption(notice(null), URL)).toBe(
      "Spring Hackathon registrations close\n\nTeams of 2-4.\nPrizes for the top three teams.\n\n" + URL
    );
  });

  it("adds the deadline under the name", () => {
    const caption = shareCaption(notice("2026-10-20T12:00:00Z"), URL);
    expect(caption.split("\n")[1]).toMatch(/^Deadline: (?=.*Oct)(?=.*20)(?=.*2026).*$/);
    expect(caption).not.toContain("·");
  });

  it("shortens very long details, keeping the link at the end", () => {
    const caption = shareCaption(notice(null, "word ".repeat(1000)), URL);
    expect(caption.length).toBeLessThanOrEqual(2500);
    expect(caption.endsWith("\n\n" + URL)).toBe(true);
    expect(caption).toContain("…");
  });
});
