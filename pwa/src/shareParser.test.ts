import { describe, expect, it } from "vitest";
import { cleanFormatting, cleanOcrText, findDeadline, guessCategory, parseSharedContent } from "@shared/shareParser";
import type { Category } from "@shared/types";
import { CATALOG_FOR_TESTS } from "@shared/categories";

const categories: Category[] = CATALOG_FOR_TESTS;
/** A category's id by name. */
const cat = (name: string) => categories.find((c) => c.name === name)!.id;

// Wednesday 14 October 2026, 10:00 local time.
const NOW = new Date(2026, 9, 14, 10, 0);

const local = (iso: string | undefined) => {
  const d = new Date(iso!);
  return [d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes()];
};

describe("parseSharedContent", () => {
  it("reads a forwarded WhatsApp announcement", () => {
    const parsed = parseSharedContent(
      {
        text:
          "*🚀 Spring Hackathon 2026*\n" +
          "Teams of 2-4. Prizes for the top three!\n" +
          "Registration deadline: 20 Oct, 5pm\n" +
          "Event on 25th October in the main auditorium\n" +
          "Register: https://forms.gle/abc123",
      },
      categories,
      NOW
    );

    expect(parsed.title).toBe("Spring Hackathon 2026");
    expect(parsed.description).toContain("Teams of 2-4");
    expect(parsed.description).not.toContain("*");
    expect(parsed.description).toContain("Register: https://forms.gle/abc123"); // links stay in the text too
    expect(parsed.linkUrl).toBe("https://forms.gle/abc123");
    expect(local(parsed.deadline)).toEqual([2026, 10, 20, 17, 0]); // the deadline line wins over the event date
    expect(parsed.categoryId).toBe(cat("Competitions")); // a hackathon with prizes
    expect(parsed.source).toBe("whatsapp");
    expect(parsed.hints).toEqual([]);
  });

  it("explains that an Instagram share is only a link", () => {
    const parsed = parseSharedContent({ text: "https://www.instagram.com/p/C1a2B3c4/?igsh=MTIz" }, categories, NOW);

    expect(parsed.source).toBe("instagram");
    expect(parsed.linkUrl).toBe("https://www.instagram.com/p/C1a2B3c4/"); // tracking parameter dropped
    expect(parsed.title).toBe("");
    expect(parsed.hints[0]).toMatch(/screenshot/i);
  });

  it("uses an email's subject as the title", () => {
    const parsed = parseSharedContent(
      {
        title: "Mid-term examination schedule",
        text: "Dear students,\nThe mid-term schedule is attached. Report clashes by 18/10/2026.\nRegards,\nExams Office",
      },
      categories,
      NOW
    );

    expect(parsed.source).toBe("email");
    expect(parsed.title).toBe("Mid-term examination schedule");
    expect(parsed.description.startsWith("The mid-term schedule is attached.")).toBe(true); // greeting dropped
    expect(local(parsed.deadline)).toEqual([2026, 10, 18, 23, 59]);
    expect(parsed.categoryId).toBe(cat("Academics"));
  });

  it("drops Subject/Re/Fwd prefixes from a pasted email", () => {
    const parsed = parseSharedContent({ text: "Subject: Fee submission reminder\nDear students, pay by 28/10/2026." }, categories, NOW);
    expect(parsed.title).toBe("Fee submission reminder");
  });

  it("shortens a long first line into a title", () => {
    const parsed = parseSharedContent(
      {
        text: "The Computing Society is looking for enthusiastic members to join the organizing team for this semester's workshops and contests. Apply now!",
      },
      categories,
      NOW
    );

    expect(parsed.title.length).toBeLessThanOrEqual(90);
    expect(parsed.title.endsWith("…")).toBe(true);
    // A society looking for members: Societies, though it mentions events too.
    expect(parsed.categoryId).toBe(cat("Societies"));
  });
});

describe("findDeadline", () => {
  it("understands common date formats", () => {
    expect(local(findDeadline("Last date 20 October", NOW)?.toISOString())).toEqual([2026, 10, 20, 23, 59]);
    expect(local(findDeadline("closes Oct 22nd, 2026", NOW)?.toISOString())).toEqual([2026, 10, 22, 23, 59]);
    expect(local(findDeadline("submit by 25-10", NOW)?.toISOString())).toEqual([2026, 10, 25, 23, 59]);
    expect(local(findDeadline("due 30.10.26", NOW)?.toISOString())).toEqual([2026, 10, 30, 23, 59]);
  });

  it("understands relative days and times", () => {
    expect(local(findDeadline("register by tomorrow 11:30 pm", NOW)?.toISOString())).toEqual([2026, 10, 15, 23, 30]);
    expect(local(findDeadline("Trials this Saturday at 9am", NOW)?.toISOString())).toEqual([2026, 10, 17, 9, 0]);
  });

  it("rolls a year-less date that has passed into next year", () => {
    const december = new Date(2026, 11, 20);
    expect(local(findDeadline("Apply before 5 Jan", december)?.toISOString())).toEqual([2027, 1, 5, 23, 59]);
  });

  it("ignores past dates and text without dates", () => {
    expect(findDeadline("The welcome session was held on 2/10/2026.", NOW)).toBeUndefined();
    expect(findDeadline("Library hours extended during exams", NOW)).toBeUndefined();
  });

  it("prefers a real date over a weekday", () => {
    // "Thursday" here is a time slot of the dated event, not a deadline.
    expect(local(findDeadline("Walk-in interviews 22nd October 2026\nThursday: 11:00 AM - 1:00 PM", NOW)?.toISOString())).toEqual([2026, 10, 22, 23, 59]);
    expect(findDeadline("Interviews were 8th-9th October 2026\nThursday: 11:00 AM", NOW)).toBeUndefined();
  });

  it("only rolls a year-less date into next year around New Year", () => {
    // A post dated "October 5" seen on 14 October is in the past, not next October.
    expect(findDeadline("Posted October 5", NOW)).toBeUndefined();
  });

  it("doesn't mistake times or scores for dates", () => {
    expect(findDeadline("Starts at 2.30 in room 4", NOW)).toBeUndefined();
  });
});

describe("guessCategory", () => {
  it("files notices under the fixed categories", () => {
    const guess = (text: string) => guessCategory(text, categories, text);
    expect(guess("Summer internship drive — bring your CV")).toBe(cat("Careers"));
    expect(guess("Football trials on the main ground")).toBe(cat("Sports"));
    expect(guess("Inter-University Debate Championship — finals on 26th")).toBe(cat("Competitions"));
    expect(guess("Spring Hackathon 2026 — prizes for top three")).toBe(cat("Competitions"));
    expect(guess("Arts Society recruitment — auditions on Friday")).toBe(cat("Societies"));
    expect(guess("Library closed on Friday for maintenance")).toBe(cat("Campus"));
    expect(guess("HEC need-based scholarship applications open")).toBe(cat("Scholarships"));
    expect(guess("Mid-term examination schedule released")).toBe(cat("Academics"));
    expect(guess("Webinar: Getting started with cloud computing")).toBe(cat("Workshops"));
    expect(guess("Annual sports gala")).toBe(cat("Sports"));
  });

  it("leaves it to the publisher when nothing fits", () => {
    expect(guessCategory("Hello everyone", categories)).toBeUndefined();
    // A venue's name says nothing about the notice.
    expect(guessCategory("Meet us at Gold Campus", categories)).toBeUndefined();
  });
});

describe("cleanFormatting", () => {
  it("strips WhatsApp markup but keeps underscores inside words", () => {
    expect(cleanFormatting("*Bold* _italic_ ~gone~ snake_case")).toBe("Bold italic gone snake_case");
  });
});

describe("cleanOcrText", () => {
  it("drops phone and Instagram chrome from a screenshot's text", () => {
    const ocr = "9:41\n87%\ncomputing.society\nFollow\nSPRING HACK '26\nTeams of 2-4 | Register by 20 Oct\nLiked by ali_k and 212 others\nView all 14 comments\n2d";
    expect(cleanOcrText(ocr)).toBe("computing.society\nSPRING HACK '26\nTeams of 2-4 Register by 20 Oct");
  });

  it("titles a post from its caption, not the account name or poster lettering", () => {
    const ocr = "9:41\n( arts.society.ucp\nFollow\nARTS SOCIETY\nOld City Lahore - Sunday 7 AM\nLiked by ali_k and 212 others\narts.society.ucp Photography walk through the old city this Sunday! Registration closes 18 Oct.\nView all 14 comments";
    const parsed = parseSharedContent({ text: cleanOcrText(ocr) }, categories, NOW);
    expect(parsed.title).toBe("Photography walk through the old city this Sunday!");
    expect(parsed.description.startsWith("Photography walk through")).toBe(true);
    expect(local(parsed.deadline)).toEqual([2026, 10, 18, 23, 59]);
  });

  it("feeds into a sensible draft", () => {
    const ocr = "9:41\ncomputing.society\nSPRING HACK '26\nTeams of 2-4 | Register by 20 Oct\nLiked by ali_k and 212 others";
    const parsed = parseSharedContent({ text: cleanOcrText(ocr) }, categories, NOW);
    expect(parsed.title).toBe("Spring Hack '26"); // shouting calmed down
    expect(local(parsed.deadline)).toEqual([2026, 10, 20, 23, 59]);
  });
});

describe("screenshot text", () => {
  it("rejoins lines the screen wrapped", () => {
    expect(cleanOcrText("Photography walk through the old city\nthis Sunday! Bring any\ncamera, phones welcome.\nARTS SOCIETY")).toBe(
      "Photography walk through the old city this Sunday! Bring any camera, phones welcome.\nARTS SOCIETY"
    );
  });
});

describe("titles", () => {
  it("never uses a greeting or a mail banner", () => {
    const parsed = parseSharedContent({ text: "CAUTION: This email originated outside UCP.\nDear all,\nLibrary closed on Friday for maintenance." }, categories, NOW);
    expect(parsed.title).toBe("Library closed on Friday for maintenance.");
  });

  it("uses a quoted name the text gives", () => {
    const parsed = parseSharedContent({ text: 'You are invited to a seminar entitled “AI in Healthcare” on 20 Oct.' }, categories, NOW);
    expect(parsed.title).toBe("Seminar: AI in Healthcare");
  });
});
