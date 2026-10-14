import { describe, expect, it } from "vitest";
import { cleanOcrText, parseSharedContent } from "@shared/shareParser";
import type { Category } from "@shared/types";
import { AWS_BUILDERS_DAY_WHATSAPP, CSO_HIRING_OCR, FAKIHA_BDE_WHATSAPP, IGDA_WORKSHOP_OUTLOOK, IGNITE_SFF_OCR, MEDIA_CLUB_OCR } from "./shareSamples";

const categories: Category[] = [
  { id: 1, name: "Academics" },
  { id: 2, name: "Careers" },
  { id: 3, name: "Events" },
  { id: 4, name: "Societies" },
  { id: 5, name: "Sports" },
];

// When the samples were collected: 14 October 2026, evening.
const NOW = new Date(2026, 9, 14, 22, 30);

const fromScreenshot = (ocr: string) => parseSharedContent({ text: cleanOcrText(ocr), fromScreenshot: true }, categories, NOW);
const fromWhatsApp = (text: string) => parseSharedContent({ text }, categories, NOW);
const local = (iso: string | undefined) => {
  const d = new Date(iso!);
  return [d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes()];
};

describe("real Instagram screenshots", () => {
  it("ignores the status bar, icon noise and the previous post", () => {
    const cleaned = cleanOcrText(CSO_HIRING_OCR);
    expect(cleaned).not.toMatch(/10:21/);
    expect(cleaned).not.toMatch(/didn't get lucky/); // the post scrolled past above
    expect(cleaned).not.toMatch(/Qu Qz|Gv N/);
  });

  it("CSO hiring: caption first, poster details kept, passed deadline flagged", () => {
    const parsed = fromScreenshot(CSO_HIRING_OCR);
    expect(parsed.title.startsWith("The Career Services Office is pleased to share internship opportunities")).toBe(true);
    expect(parsed.description).toContain("Paid: PKR 10,000 per month");
    expect(parsed.description).toContain("Email: Cso@ucp.edu.pk");
    expect(parsed.deadline).toBeUndefined();
    expect(parsed.hints.join(" ")).toMatch(/11 October.*passed/);
    expect(parsed.categoryId).toBe(2);
  });

  it("Media Club: caption found without an account header; weekday times don't become the deadline", () => {
    const parsed = fromScreenshot(MEDIA_CLUB_OCR);
    expect(parsed.title).toBe("Your Story. Your Lens. Your Creative Journey.");
    expect(parsed.description).toContain("Venue: CSO Office, next to Auditorium");
    expect(parsed.description).toContain("Friday: 10:00 AM - 1:00 PM & 3:00 PM - 5:00 PM\nOpen for ALL UCPians!");
    expect(parsed.description).not.toMatch(/\bless$/);
    expect(parsed.deadline).toBeUndefined(); // 8–9 Oct have passed; "Thursday" isn't a new date
    expect(parsed.hints.join(" ")).toMatch(/9 October/);
    expect(parsed.categoryId).toBe(4);
  });

  it("Ignite: deadline, form link and a caption rejoined across lines", () => {
    const parsed = fromScreenshot(IGNITE_SFF_OCR);
    expect(local(parsed.deadline)).toEqual([2026, 10, 16, 23, 59]);
    expect(parsed.linkUrl).toBe("https://forms.gle/tszmwekXQCLfZzP79");
    expect(parsed.description.split("\n")[0]).toBe(
      "Ignite National Technology Fund invites Pakistani FinTech startups to apply for the Singapore FinTech Festival 2026, taking place from 18 to 20 November 2026 in Singapore."
    );
    expect(parsed.description).toContain("Apply Now: https://forms.gle/tszmwekXQCLfZzP79\nTake Pakistan's FinTech");
    expect(parsed.description).not.toMatch(/5 days ago|Ministry of Ignite/);
    expect(parsed.categoryId).toBe(3);
    expect(parsed.hints).toEqual([]);
  });
});

describe("real WhatsApp messages", () => {
  it("AWS Builders Day: clean title, untracked link, event time as the date", () => {
    const parsed = fromWhatsApp(AWS_BUILDERS_DAY_WHATSAPP);
    expect(parsed.title).toBe("AWS Agentic AI Builders Day");
    expect(parsed.linkUrl).toBe("https://www.meetup.com/aws-sbg-at-superior-university-gold-campus/events/316878829/");
    expect(parsed.description).toContain("Registration: https://www.meetup.com/aws-sbg-at-superior-university-gold-campus/events/316878829/\n");
    expect(parsed.description).not.toMatch(/utm_source|\*|#AWS/);
    expect(local(parsed.deadline)).toEqual([2026, 10, 24, 10, 0]);
    expect(parsed.categoryId).toBe(3);
  });

  it("Fakiha job ad: capitals calmed, filed under Careers, no invented deadline", () => {
    const parsed = fromWhatsApp(FAKIHA_BDE_WHATSAPP);
    expect(parsed.title).toBe("Fakiha Core Technologies — Business Development Executive");
    expect(parsed.linkUrl).toBe("https://forms.gle/eWzyhrjwKYw3swWF6");
    expect(parsed.description).toContain("Contact: fakihacoretech@gmail.com");
    expect(parsed.deadline).toBeUndefined();
    expect(parsed.categoryId).toBe(2);
  });
});

describe("real email pasted from Outlook", () => {
  it("IGDA workshop: the workshop's name, not the banner or greeting, is the title", () => {
    const parsed = fromWhatsApp(IGDA_WORKSHOP_OUTLOOK);
    expect(parsed.title).toBe("Workshop: Discover the World of Game Development");
    // Who it's for stays in the details; "Dear Students," doesn't.
    expect(parsed.description.startsWith("This email is targeted at students who are enrolled in 6th, 7th and 8th semesters.")).toBe(true);
    expect(parsed.description).not.toMatch(/^Dear Students,$/m);
    expect(local(parsed.deadline)).toEqual([2026, 10, 16, 14, 0]); // the "Time:" line under the date
    expect(parsed.linkUrl).toMatch(/^https:\/\/forms\.cloud\.microsoft\/Pages\/ResponsePage\.aspx\?id=syGyEmQEI0KJ5YiINXeLWMZ/);
    expect(parsed.categoryId).toBe(3);
  });
});
