import { describe, expect, it } from "vitest";
import { googleCalendarUrl, icsFile } from "@shared/calendar";
import type { Notice } from "@shared/types";

const notice: Notice = {
  id: 7,
  title: "Hackathon registration, round 2; final call",
  description: "Teams of 2-4.\nBring your laptop.",
  imageUrl: null,
  linkUrl: "https://forms.gle/abc123",
  categoryId: null,
  categoryName: null,
  deadline: "2026-10-20T12:00:00.000Z",
  createdByUserId: 1,
  createdByName: "Computing Society",
  createdAt: "2026-10-14T10:00:00.000Z",
  updatedAt: "2026-10-14T10:00:00.000Z",
  viewCount: null,
  isPinned: false,
  sendLastCall: false,
  createdByLogoUrl: null,
};

describe("googleCalendarUrl", () => {
  it("fills in the hour before the deadline", () => {
    const url = new URL(googleCalendarUrl(notice));
    expect(url.hostname).toBe("calendar.google.com");
    expect(url.searchParams.get("dates")).toBe("20261020T110000Z/20261020T120000Z");
    expect(url.searchParams.get("text")).toBe("Deadline: Hackathon registration, round 2; final call");
    expect(url.searchParams.get("details")).toContain("https://forms.gle/abc123");
  });
});

describe("icsFile", () => {
  const ics = icsFile(notice, new Date("2026-10-14T10:00:00Z"));
  const unfolded = ics.replace(/\r\n /g, "");

  it("is a valid single event with a day-before reminder", () => {
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(unfolded).toContain("DTSTART:20261020T110000Z");
    expect(unfolded).toContain("DTEND:20261020T120000Z");
    expect(unfolded).toContain("TRIGGER:-P1D");
    expect(unfolded).toContain("UID:notice-7@ucp-noticeboard");
  });

  it("escapes text and folds long lines", () => {
    expect(unfolded).toContain("SUMMARY:Deadline: Hackathon registration\\, round 2\; final call");
    expect(unfolded).toContain("DESCRIPTION:Teams of 2-4.\\nBring your laptop.\\n\\nhttps://forms.gle/abc123");
    for (const line of ics.split("\r\n")) expect(line.length).toBeLessThanOrEqual(75);
  });
});
