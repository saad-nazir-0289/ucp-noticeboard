import { describe, expect, it } from "vitest";
import { cleanOcrText, parseSharedContent } from "@shared/shareParser";
import type { Category } from "@shared/types";
import { CATALOG_FOR_TESTS } from "@shared/categories";
import { AWS_BUILDERS_DAY_WHATSAPP, CSO_HIRING_OCR, INOVATIVEX_HIRING_OCR, FAKIHA_BDE_WHATSAPP, IGDA_WORKSHOP_OUTLOOK, IGNITE_SFF_OCR, LIC_FINANCE_SESSION_OUTLOOK, MEDIA_CLUB_OCR, ORIC_NEWSLETTER_OUTLOOK } from "./shareSamples";
import { IGNITE_SPARK_WORDS, SYMUFOLK_JOBS_WORDS } from "./ocrSamples";
import { confidentText } from "./ocrText";

const categories: Category[] = CATALOG_FOR_TESTS;
/** A category's id by name. */
const cat = (name: string) => categories.find((c) => c.name === name)!.id;

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
    expect(parsed.categoryId).toBe(cat("Careers"));
  });

  it("InovativeX hiring: cut-off caption, Threads banner, deadline on the line under its label", () => {
    // Shared at 6:38 PM on 15 October, the last day to apply.
    const parsed = parseSharedContent({ text: cleanOcrText(INOVATIVEX_HIRING_OCR), fromScreenshot: true }, categories, new Date(2026, 9, 15, 18, 38));
    expect(parsed.title).toBe("Career Services Office: Hiring!");
    expect(parsed.description).not.toMatch(/Instag|Threads|others joined|University of Ce/);
    expect(parsed.description).toContain("Venue: D Building");
    expect(parsed.description).toContain("1+ year of graphic design experience");
    // "Oct 15th, 2026 - Till 12Am" is that night, not the event on the 16th.
    expect(local(parsed.deadline)).toEqual([2026, 10, 15, 23, 59]);
    expect(parsed.categoryId).toBe(cat("Careers"));
  });

  it("a share's own label is not the title", () => {
    const parsed = parseSharedContent({ title: "Saad shared a photo", text: "Saad shared a photo\nRegistrations for the Spring Hackathon close on 20 Oct." }, categories, NOW);
    expect(parsed.title).not.toMatch(/shared a photo/i);
    expect(parsed.description).not.toMatch(/shared a photo/i);
  });

  it("Media Club: caption found without an account header; weekday times don't become the deadline", () => {
    const parsed = fromScreenshot(MEDIA_CLUB_OCR);
    expect(parsed.title).toBe("Your Story. Your Lens. Your Creative Journey.");
    expect(parsed.description).toContain("Venue: CSO Office, next to Auditorium");
    expect(parsed.description).toContain("Friday: 10:00 AM - 1:00 PM & 3:00 PM - 5:00 PM\nOpen for ALL UCPians!");
    expect(parsed.description).not.toMatch(/\bless$/);
    expect(parsed.deadline).toBeUndefined(); // 8–9 Oct have passed; "Thursday" isn't a new date
    expect(parsed.hints.join(" ")).toMatch(/9 October/);
    expect(parsed.categoryId).toBe(cat("Societies"));
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
    expect(parsed.categoryId).toBe(cat("Events"));
    expect(parsed.hints).toEqual([]);
  });
});

describe("real Instagram screenshots, read word by word", () => {
  // Shared on 15 October 2026, evening.
  const read = (words: Parameters<typeof confidentText>[0]) =>
    parseSharedContent({ text: cleanOcrText(confidentText(words)), fromScreenshot: true }, categories, new Date(2026, 9, 15, 19, 45));

  it("drops the words the reader only guessed at from the artwork", () => {
    const ignite = confidentText(IGNITE_SPARK_WORDS);
    expect(ignite).not.toMatch(/mene|Ignites|Rise|ERs|fare a/);
    expect(ignite).toContain("ignite.ntf The countdown is on");
    const symufolk = confidentText(SYMUFOLK_JOBS_WORDS);
    // The QR code panel beside the text.
    expect(symufolk).not.toMatch(/Canto|Rao\)|Oreg|rE a|Diya|To I\b|R024/);
    expect(symufolk).toContain("Bachelor's degree I a relevant field\n");
    expect(symufolk).toContain("Salary Bracket: PKR 50,000-70,000/month\n");
  });

  it("Ignite SPARK: the programme's name as the title, caption only, address without https", () => {
    const parsed = read(IGNITE_SPARK_WORDS);
    expect(parsed.title).toBe("Prime Minister's SPARK AND ELEVATE Program");
    expect(parsed.description).toBe(
      "The countdown is on for innovators ready to take their ideas further. Submit your application for the Prime Minister's SPARK AND ELEVATE Program before the window closes on 26 October 2026.\nApply now: segms.ignite.org.pk"
    );
    expect(parsed.linkUrl).toBe("https://segms.ignite.org.pk");
    expect(local(parsed.deadline)).toEqual([2026, 10, 26, 23, 59]);
  });

  it("Symufolk jobs: caption, then the poster's details; Markdown link unwrapped", () => {
    const parsed = read(SYMUFOLK_JOBS_WORDS);
    expect(parsed.title).toBe("SYMUFOLK is Hiring");
    expect(parsed.linkUrl).toBe("https://forms.cloud.microsoft/r/DZx9bz8BaR");
    expect(parsed.description).toContain("Apply Now: https://forms.cloud.microsoft/r/DZx9bz8BaR\n\nJOB OPPORTUNITIES");
    expect(parsed.description).toContain("2. Receptionist (Female)");
    expect(parsed.description).not.toMatch(/Canto|Diya|R024|\]\(/);
    expect(local(parsed.deadline)).toEqual([2026, 10, 16, 23, 59]);
    expect(parsed.categoryId).toBe(cat("Careers"));
  });
});

describe("real WhatsApp messages", () => {
  it("AWS Builders Day: clean title, untracked link, event time as the date, talks → Workshops", () => {
    const parsed = fromWhatsApp(AWS_BUILDERS_DAY_WHATSAPP);
    expect(parsed.title).toBe("AWS Agentic AI Builders Day");
    expect(parsed.linkUrl).toBe("https://www.meetup.com/aws-sbg-at-superior-university-gold-campus/events/316878829/");
    expect(parsed.description).toContain("Registration: https://www.meetup.com/aws-sbg-at-superior-university-gold-campus/events/316878829/\n");
    expect(parsed.description).not.toMatch(/utm_source|\*|#AWS/);
    expect(local(parsed.deadline)).toEqual([2026, 10, 24, 10, 0]);
    expect(parsed.categoryId).toBe(cat("Workshops"));
  });

  it("Fakiha job ad: capitals calmed, filed under Careers, no invented deadline", () => {
    const parsed = fromWhatsApp(FAKIHA_BDE_WHATSAPP);
    expect(parsed.title).toBe("Fakiha Core Technologies — Business Development Executive");
    expect(parsed.linkUrl).toBe("https://forms.gle/eWzyhrjwKYw3swWF6");
    expect(parsed.description).toContain("Contact: fakihacoretech@gmail.com");
    expect(parsed.deadline).toBeUndefined();
    expect(parsed.categoryId).toBe(cat("Careers"));
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
    expect(parsed.categoryId).toBe(cat("Workshops"));
  });

  it("ORIC newsletter: the newsletter's name as the title, no greeting or sign-off", () => {
    const parsed = fromWhatsApp(ORIC_NEWSLETTER_OUTLOOK);
    expect(parsed.title).toBe("UCP ORIC E-Newsletter, Volume 4, Issue 3 (July–September 2026)");
    expect(parsed.description.startsWith("We are pleased to share the UCP ORIC E-Newsletter")).toBe(true);
    expect(parsed.description).not.toMatch(/Dear Students|Greetings from ORIC|Regards/);
    expect(parsed.deadline).toBeUndefined();
    expect(parsed.categoryId).toBe(cat("Campus"));
  });

  it("LIC session: quoted name shortened at its own break, registration deadline, lost link flagged", () => {
    const parsed = fromWhatsApp(LIC_FINANCE_SESSION_OUTLOOK);
    expect(parsed.title).toBe("Session: A Guide to Financial Freedom: Become a Millionaire in Your 20s");
    expect(local(parsed.deadline)).toEqual([2026, 10, 18, 23, 59]); // registration closes before the 27th
    expect(parsed.description).toContain("Date: Tuesday, 27 October 2026");
    expect(parsed.linkUrl).toBeUndefined();
    expect(parsed.hints.join(" ")).toMatch(/paste it into the Link field/);
    expect(parsed.categoryId).toBe(cat("Workshops"));
  });
});
