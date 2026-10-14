import type { Category } from "./types";

/**
 * Turns something shared into the app — a forwarded WhatsApp message, an
 * Instagram link, an email from Outlook, or text read off a screenshot —
 * into a first draft of a notice. Runs entirely on the device, for free;
 * nothing is sent anywhere. The person always reviews the form before
 * publishing, so this aims for "mostly right", not perfect.
 */

export interface SharedContent {
  /** Android puts an email's subject here. */
  title?: string;
  text?: string;
  url?: string;
}

export type ShareSource = "instagram" | "whatsapp" | "email" | "text";

export interface ParsedShare {
  title: string;
  description: string;
  linkUrl?: string;
  /** ISO timestamp, only ever in the future. */
  deadline?: string;
  categoryId?: number;
  source: ShareSource;
  /** Short notes to show above the form, e.g. what couldn't be filled in. */
  hints: string[];
}

const URL_PATTERN = /\bhttps?:\/\/[^\s<>"']+/gi;
const HAS_URL = /\bhttps?:\/\//i;
const TITLE_MAX = 90;

export function parseSharedContent(input: SharedContent, categories: Category[], now: Date = new Date()): ParsedShare {
  const rawText = [input.text, input.url && !input.text?.includes(input.url) ? input.url : ""]
    .filter(Boolean)
    .join("\n");
  const text = cleanFormatting(rawText);
  const subject = cleanFormatting(input.title ?? "").trim();

  const urls = [...text.matchAll(URL_PATTERN)].map((m) => trimUrl(m[0]));
  const linkUrl = urls[0];
  const isInstagram = urls.some((u) => /(^|\.)instagram\.com$/i.test(hostname(u)));

  // Text with the links taken out, to judge what's actually written.
  const prose = text.replace(URL_PATTERN, "").replace(/[ \t]+\n/g, "\n").trim();
  // Lines of the message with its links kept ("Register here: https://…"),
  // dropping only lines that are nothing but a link.
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && l.replace(URL_PATTERN, "").trim() !== "");

  const source: ShareSource = isInstagram && prose.length < 40 ? "instagram" : subject ? "email" : rawText ? "whatsapp" : "text";

  // Title: an email's subject; a social post's caption; otherwise the
  // first real line of the message.
  let title = "";
  let bodyLines = lines;
  const caption = findCaption(lines);
  if (subject && !HAS_URL.test(subject)) {
    title = stripEmailPrefix(subject);
  } else if (caption) {
    title = firstSentence(caption.text);
    bodyLines = [caption.text, ...lines.slice(caption.index + 1)];
  } else {
    const firstIndex = lines.findIndex((l) => /[\p{L}\p{N}]/u.test(l.replace(URL_PATTERN, "")) && !isHandle(l));
    if (firstIndex >= 0) {
      title = stripEmailPrefix(lines[firstIndex].replace(URL_PATTERN, "").trim());
      bodyLines = lines.slice(firstIndex + 1);
    }
  }
  title = shortenTitle(stripDecoration(title));

  // Description: the rest of the message, or the whole message when the
  // title already used up its only line. Links stay in the text too.
  let description = bodyLines.join("\n").trim();
  if (!description) description = lines.join("\n").trim();
  if (description === title) description = "";

  const hints: string[] = [];
  if (source === "instagram") {
    hints.push("Instagram only shares a link, not the caption or picture. Share a screenshot of the post to fill in the details too.");
  }

  const deadline = findDeadline(`${subject}\n${prose}`, now);
  const categoryId = guessCategory(`${subject}\n${prose}`, categories);

  return {
    title,
    description,
    linkUrl,
    deadline: deadline?.toISOString(),
    categoryId,
    source,
    hints,
  };
}

/**
 * Text read off a screenshot comes with the phone's and app's own chrome
 * (clock, battery, "Liked by…", "View all 12 comments"). Drops those lines
 * and joins words split across lines, keeping the actual announcement.
 */
export function cleanOcrText(value: string): string {
  const uiLine =
    /^(\d{1,2}[:.]\d{2}(\s?[ap]m)?|\d{1,3}%|liked by\b.*|view (all )?\d*\s*comments?|\d+\s*(likes?|comments?|shares?|views?)|follow(ing)?|message|reply|translate|see translation|sponsored|suggested for you|add a comment.*|more|original audio.*|\d+\s*[smhdw]( ago)?)$/i;
  return value
    .split(/\r?\n/)
    .map((line) =>
      line
        .replace(/[|©®™•·]+/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        // Stray marks the reader picks up from icons and avatars: "( name".
        .replace(/^[^\p{L}\p{N}@#"'“]+(?=\p{L})/u, "")
    )
    .filter((line) => line.replace(/[^\p{L}]/gu, "").length >= 3 && !uiLine.test(line))
    // Rejoin sentences the screen wrapped across lines: a line that doesn't
    // end a sentence, followed by one starting in lower case.
    .reduce<string[]>((joined, line) => {
      const previous = joined[joined.length - 1];
      const startsWithHandle = isHandle(line.split(" ")[0]);
      if (previous && !/[.!?:]$/.test(previous) && /^[\p{Ll}]/u.test(line) && !startsWithHandle && !isHandle(previous)) {
        joined[joined.length - 1] = `${previous} ${line}`;
      } else {
        joined.push(line);
      }
      return joined;
    }, [])
    .join("\n");
}

/** Removes WhatsApp markup (*bold*, _italic_, ~strike~, ```mono```) and odd spacing. */
export function cleanFormatting(value: string): string {
  return value
    .replace(/\r\n?/g, "\n")
    .replace(/```/g, "")
    .replace(/(^|[\s(])[*_~]+(?=\S)/g, "$1")
    .replace(/(\S)[*_~]+(?=[\s).,!?:;]|$)/gm, "$1")
    .replace(/\u00a0/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** A bare account handle ("computing.society"), common at the top of a screenshot. */
function isHandle(line: string): boolean {
  return /^@?[a-z0-9._]{3,30}$/i.test(line) && /[._]/.test(line);
}

/**
 * In a screenshot of a post, the caption is the line that starts with the
 * account's handle ("arts.society.ucp Photography walk this Sunday!").
 * Its words, not the poster's big lettering, make the best title.
 */
function findCaption(lines: string[]): { text: string; index: number } | undefined {
  const handles = new Set(lines.filter(isHandle).map((l) => l.replace(/^@/, "").toLowerCase()));
  for (const [index, line] of lines.entries()) {
    const [first, ...rest] = line.split(" ");
    if (rest.length >= 3 && handles.has(first.replace(/^@/, "").toLowerCase())) {
      return { text: rest.join(" "), index };
    }
  }
  return undefined;
}

function firstSentence(value: string): string {
  const end = value.search(/[.!?](\s|$)/);
  return end > 10 ? value.slice(0, end + 1) : value;
}

/** "Subject: …", "Re: …", "Fwd: …" from a copied or forwarded email. */
function stripEmailPrefix(value: string): string {
  return value.replace(/^(subject|re|fw|fwd)\s*:\s*/i, "").replace(/^(re|fw|fwd)\s*:\s*/i, "");
}

/** Leading emoji, bullets and trailing colons don't belong in a title. */
function stripDecoration(value: string): string {
  return value
    .replace(/^[^\p{L}\p{N}"'(]+/u, "")
    .replace(/[\s:\-–—|]+$/u, "")
    .trim();
}

function shortenTitle(value: string): string {
  if (value.length <= TITLE_MAX) return value;
  const sentenceEnd = value.slice(0, TITLE_MAX).search(/[.!?](\s|$)/);
  if (sentenceEnd >= 20) return value.slice(0, sentenceEnd + 1);
  const cut = value.slice(0, TITLE_MAX - 1);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), 40)).trim()}…`;
}

function hostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

function trimUrl(url: string): string {
  return url.replace(/[).,!?:;'"\]]+$/, "");
}

// ---------- Deadlines ----------

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const MONTH = "(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\\.?";
const DAY = "(\\d{1,2})(?:st|nd|rd|th)?";
const YEAR = "(?:,?\\s*(\\d{4}))?";

/** Words that mark a date as the one that matters ("register by 20 Oct"). */
const DEADLINE_WORDS = /\b(deadline|last date|due|till|until|untill|before|by|closes?|closing|ends?|register|registration|apply|submit|submission|expires?)\b/i;

interface Candidate {
  date: Date;
  index: number;
  hasTime: boolean;
}

/**
 * Finds the deadline in free text. Dates on a line with a deadline word
 * win; otherwise the earliest upcoming date. Dates without a year are
 * assumed to be the next time that date comes round. Day/month order
 * follows Pakistan's convention (20/10 = 20 October).
 */
export function findDeadline(text: string, now: Date = new Date()): Date | undefined {
  const candidates: Candidate[] = [];
  const add = (date: Date | undefined, index: number, matchLength: number, hasTime = false) => {
    if (!date || Number.isNaN(date.getTime())) return;
    const time = !hasTime ? findTime(text.slice(index, index + matchLength + 25)) : undefined;
    if (time) date.setHours(time.hours, time.minutes, 0, 0);
    else if (!hasTime) date.setHours(23, 59, 0, 0);
    candidates.push({ date, index, hasTime: hasTime || Boolean(time) });
  };

  const lower = text.toLowerCase();

  for (const m of lower.matchAll(new RegExp(`\\b${DAY}\\s*(?:of\\s+)?${MONTH}${YEAR}`, "g"))) {
    add(makeDate(Number(m[1]), monthIndex(m[2]), m[3], now), m.index!, m[0].length);
  }
  for (const m of lower.matchAll(new RegExp(`\\b${MONTH}\\s+${DAY}\\b${YEAR}`, "g"))) {
    add(makeDate(Number(m[2]), monthIndex(m[1]), m[3], now), m.index!, m[0].length);
  }
  for (const m of lower.matchAll(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/g)) {
    add(makeDate(Number(m[1]), Number(m[2]) - 1, m[3], now), m.index!, m[0].length);
  }
  for (const m of lower.matchAll(/\b(\d{1,2})\.(\d{1,2})\.(\d{2,4})\b/g)) {
    add(makeDate(Number(m[1]), Number(m[2]) - 1, m[3], now), m.index!, m[0].length);
  }
  for (const m of lower.matchAll(/\b(today|tonight|tomorrow|day after tomorrow)\b/g)) {
    const offset = m[1] === "tomorrow" ? 1 : m[1] === "day after tomorrow" ? 2 : 0;
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
    add(d, m.index!, m[0].length);
  }
  for (const m of lower.matchAll(/\b(?:(this|next|coming)\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/g)) {
    const target = WEEKDAYS.indexOf(m[2]);
    let delta = (target - now.getDay() + 7) % 7;
    if (m[1] === "next" && delta === 0) delta = 7;
    add(new Date(now.getFullYear(), now.getMonth(), now.getDate() + delta), m.index!, m[0].length);
  }

  const upcoming = candidates.filter((c) => c.date.getTime() > now.getTime());
  if (upcoming.length === 0) return undefined;

  const onDeadlineLine = upcoming.filter((c) => DEADLINE_WORDS.test(lineAround(text, c.index)));
  const pool = onDeadlineLine.length > 0 ? onDeadlineLine : upcoming;
  return pool.sort((a, b) => a.date.getTime() - b.date.getTime())[0].date;
}

function monthIndex(token: string): number {
  return MONTHS.indexOf(token.slice(0, 3));
}

function makeDate(day: number, month: number, year: string | undefined, now: Date): Date | undefined {
  if (month < 0 || month > 11 || day < 1 || day > 31) return undefined;
  let fullYear = year ? Number(year.length === 2 ? `20${year}` : year) : now.getFullYear();
  let date = new Date(fullYear, month, day);
  if (date.getMonth() !== month) return undefined; // e.g. 31 Feb
  // No year given and the date has passed (by more than a day): next year's.
  if (!year && date.getTime() < now.getTime() - 24 * 3600 * 1000) {
    fullYear += 1;
    date = new Date(fullYear, month, day);
  }
  return date;
}

/** "5pm", "5:30 pm", "17:00" near a date. */
function findTime(snippet: string): { hours: number; minutes: number } | undefined {
  const twelve = snippet.match(/\b(\d{1,2})(?::|\.)?(\d{2})?\s*(am|pm)\b/i);
  if (twelve) {
    let hours = Number(twelve[1]) % 12;
    if (twelve[3].toLowerCase() === "pm") hours += 12;
    return { hours, minutes: Number(twelve[2] ?? 0) };
  }
  const twentyFour = snippet.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  if (twentyFour) return { hours: Number(twentyFour[1]), minutes: Number(twentyFour[2]) };
  return undefined;
}

function lineAround(text: string, index: number): string {
  const start = text.lastIndexOf("\n", index) + 1;
  const end = text.indexOf("\n", index);
  return text.slice(start, end === -1 ? undefined : end);
}

// ---------- Category ----------

/** Words that suggest a kind of notice, keyed by a word found in the category's name. */
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  event: ["event", "workshop", "seminar", "webinar", "hackathon", "competition", "contest", "championship", "debate", "conference", "session", "meetup", "festival", "fest", "ceremony", "talk", "expo", "exhibition", "showcase", "screening", "gala", "summit", "orientation"],
  career: ["internship", "intern", "job", "hiring", "career", "placement", "cv", "resume", "vacancy", "recruiter", "interview"],
  job: ["internship", "intern", "job", "hiring", "career", "placement", "cv", "resume", "vacancy", "interview"],
  academic: ["exam", "mid-term", "midterm", "mids", "final exam", "final term", "quiz", "assignment", "class", "course", "lecture", "timetable", "datesheet", "date sheet", "schedule", "semester", "result", "library", "fee", "enrollment", "enrolment"],
  sport: ["sport", "football", "cricket", "basketball", "futsal", "badminton", "volleyball", "trials", "tournament", "match", "gym", "athletics"],
  societ: ["society", "club", "auditions", "recruit", "members", "join our team", "join the team", "membership"],
  club: ["society", "club", "auditions", "recruit", "members", "membership"],
};

/** The best-matching category, or none when nothing matches or two tie (a coin flip is worse than asking). */
export function guessCategory(text: string, categories: Category[]): number | undefined {
  const lower = text.toLowerCase();
  let best: { id: number; score: number } | undefined;
  let tied = false;

  for (const category of categories) {
    const name = category.name.toLowerCase();
    let score = lower.includes(name) ? 2 : 0;
    for (const [stem, words] of Object.entries(CATEGORY_KEYWORDS)) {
      if (!name.includes(stem)) continue;
      for (const word of words) {
        if (new RegExp(`\\b${word.replace(/[-\s]/g, "[-\\s]?")}`, "i").test(lower)) score += 1;
      }
    }
    if (score > 0 && (!best || score > best.score)) {
      best = { id: category.id, score };
      tied = false;
    } else if (score > 0 && score === best?.score) {
      tied = true;
    }
  }
  return tied ? undefined : best?.id;
}
