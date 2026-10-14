import { describe, expect, it } from "vitest";
import { shareMessage } from "@shared/share";
import type { Notice } from "@shared/types";

const notice = (deadline: string | null): Notice => ({
  id: 7,
  title: "Spring Hackathon registrations close",
  description: "Teams of 2-4.",
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
  createdByLogoUrl: null,
});

describe("shareMessage", () => {
  it("puts the notice's name above the link", () => {
    expect(shareMessage(notice(null))).toBe("Spring Hackathon registrations close");
  });

  it("adds the deadline when there is one", () => {
    const message = shareMessage(notice("2026-10-20T12:00:00Z"));
    expect(message.split("\n")[0]).toBe("Spring Hackathon registrations close");
    expect(message.split("\n")[1]).toMatch(/^Deadline: (?=.*Oct)(?=.*20)(?=.*2026).*$/);
    expect(message).not.toContain("·");
  });
});
