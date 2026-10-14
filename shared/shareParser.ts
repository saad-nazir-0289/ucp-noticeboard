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
  /** The text was read off a screenshot (see cleanOcrText), not typed or copied. */
  fromScreenshot?: boolean;
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
  const text = cleanFormatting(rawText).replace(URL_PATTERN, (url) => withoutTracking(trimUrl(url)) + url.slice(trimUrl(url).length));
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
  const caption = findCaption(lines, input.fromScreenshot ?? false);
  if (subject && !HAS_URL.test(subject)) {
    title = stripEmailPrefix(subject);
  } else if (caption) {
    title = firstSentence(caption.text);
    bodyLines = [caption.text, ...lines.slice(caption.index + 1)];
    // A short (or cut-off) caption leaves the details on the poster itself:
    // keep the poster's text too, after the caption.
    const posterLines = lines.slice(0, caption.index).filter((l) => !isHandle(l) && !l.toLowerCase().includes(caption.handle));
    if (bodyLines.join(" ").length < 300 && posterLines.length > 0) {
      bodyLines = [...bodyLines, "", ...posterLines];
    }
  } else if (namedTitle(prose)) {
    // 'a workshop titled "Discover the World of Game Development"': the
    // name it was given beats whatever line happens to come first.
    title = namedTitle(prose)!;
  } else {
    const firstIndex = lines.findIndex(
      (l) => /[\p{L}\p{N}]/u.test(l.replace(URL_PATTERN, "")) && !isHandle(l) && !isGreeting(l) && !isEmailBanner(l)
    );
    if (firstIndex >= 0) {
      title = stripEmailPrefix(lines[firstIndex].replace(URL_PATTERN, "").trim());
      bodyLines = lines.slice(firstIndex + 1);
    }
  }
  title = shortenTitle(titleCase(stripDecoration(title)));

  // Description: the rest of the message, or the whole message when the
  // title already used up its only line. Links stay in the text too;
  // lines of nothing but hashtags don't need to.
  bodyLines = bodyLines.filter((l) => !/^(#[\p{L}\p{N}_]+\s*)+$/u.test(l) && !isGreeting(l));
  let description = bodyLines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  if (!description) description = lines.join("\n").trim();
  if (description === title) description = "";

  const hints: string[] = [];
  if (source === "instagram") {
    hints.push("Instagram only shares a link, not the caption or picture. Share a screenshot of the post to fill in the details too.");
  }

  const dates = scanDates(`${subject}\n${prose}`, now);
  const deadline = pickDeadline(dates, `${subject}\n${prose}`, now);
  const categoryId = guessCategory(`${subject}\n${prose}`, categories);
  if (!deadline) {
    const lastPast = dates.filter((c) => c.explicit && c.date.getTime() <= now.getTime()).sort((a, b) => b.date.getTime() - a.date.getTime())[0];
    if (lastPast) {
      hints.push(
        `The dates in this post (latest ${lastPast.date.toLocaleDateString("en-GB", { day: "numeric", month: "long" })}) have already passed — check it's still worth posting.`
      );
    }
  }

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
 * (clock, battery, "Liked by…", "View all 12 comments") and with noise the
 * reader makes of icons and QR codes. Drops those lines, and anything above
 * the post's header (the end of the previous post), and joins sentences
 * the screen wrapped across lines.
 */
export function cleanOcrText(value: string): string {
  const uiLine =
    /^(\d{1,2}[:.]\d{2}(\s?[ap]m)?|\d{1,3}%|liked by\b.*|view (all )?\d*\s*comments?|\d+\s*(likes?|comments?|shares?|views?)|follow(ing)?|message|reply|translate|see translation|sponsored|suggested for you|add a comment.*|more|less|original audio.*|\d+\s*[smhdw]( ago)?|\d+\s+(seconds?|minutes?|hours?|days?|weeks?)\s+ago)$/i;
  let lines = value
    .split(/\r?\n/)
    .map((line) =>
      line
        .replace(/[|©®™•·]+/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        // Stray marks the reader picks up from icons and avatars: "( name".
        .replace(/^[^\p{L}\p{N}@#"'“]+(?=\p{L})/u, "")
        // An emoji read as a letter or symbol in front of a label: "I Venue: …", "@ Friday: …".
        .replace(/^(?:[@&]|[Il])\s+(?=\p{Lu}\p{Ll}+:)/u, "")
        // Instagram's "… more" / "less" for long captions.
        .replace(/(\.{3}|…)\s*more$/i, "…")
        .replace(/\s+less$/i, "")
    )
    // The status bar ("10:21 PM ⏰ 5G 87%") is always at the very top.
    .filter((line, index) => !(index < 3 && /^\d{1,2}[:.]\d{2}\s?([ap]m)?\b/i.test(line)))
    .filter((line) => line.replace(/[^\p{L}]/gu, "").length >= 3 && !uiLine.test(line) && !isOcrNoise(line));

  // Everything above the post's header line (its account name) belongs to
  // whatever was scrolled past.
  const caption = findCaption(lines, true);
  if (caption) {
    const header = lines.findIndex((l, i) => i < caption.index && l.toLowerCase().split(" ").some((w) => w.replace(/^@/, "") === caption.handle));
    if (header > 0) lines = lines.slice(header);
  }

  // Rejoin sentences the screen wrapped across lines: a line that doesn't
  // end a sentence followed by one starting in lower case — or, in the
  // caption (the app's own text, laid out edge to edge), a line about as
  // wide as the caption's widest (it ran out of room, it didn't end).
  // Poster lettering isn't judged by width: its lines vary too much.
  const captionAt = findCaption(lines, true)?.index ?? lines.length;
  const fullWidth = Math.max(0, ...lines.slice(captionAt).map((l) => l.length)) * 0.7;
  return lines
    .reduce<{ out: string[]; index: number }>(({ out: joined, index }, line) => {
      const previous = joined[joined.length - 1];
      const startsWithHandle = isHandle(line.split(" ")[0]) || captionStart(line) !== undefined;
      // A "Label: …" line ("Friday: 10 AM – 1 PM", "Apply: https://…") is
      // complete in itself; whatever follows it is a new line.
      const labelled = previous && /^\p{L}[\p{L} ]{0,20}:/u.test(previous);
      const inCaption = index > captionAt;
      const wrapped =
        previous && (/^[\p{Ll}]/u.test(line) || (inCaption && !labelled && previous.length >= fullWidth && previous.length >= 30));
      if (previous && wrapped && !/[.!?:]$/.test(previous) && !startsWithHandle && !isHandle(previous)) {
        joined[joined.length - 1] = `${previous} ${line}`;
      } else {
        joined.push(line);
      }
      return { out: joined, index: index + 1 };
    }, { out: [], index: 0 })
    .out.join("\n");
}

/** Small words that count as real text even though they're short. */
const SHORT_WORDS = new Set(["a", "an", "to", "of", "at", "in", "on", "by", "or", "and", "for", "the", "is", "it", "we", "we're", "&", "+", "-", "–", "—", "am", "pm", "ai", "it", "pk", "ucp", "no", "up", "my", "us"]);

/**
 * A line that's mostly not words — what the reader makes of icons, a QR
 * code or a profile picture ("Qu Qz 2 Gv N"). Lines with a link, an email
 * or a "Label:" are always kept.
 */
function isOcrNoise(line: string): boolean {
  if (/https?:\/\/|@\w+\.\w|^\p{L}[\p{L} ]{1,20}:/u.test(line) || isHandle(line)) return false;
  const tokens = line.split(" ").filter(Boolean);
  const wordy = tokens.filter((t) => {
    const bare = t.replace(/^[("'“‘[]+|[)"'”’\].,!?:;]+$/g, "");
    if (SHORT_WORDS.has(bare.toLowerCase())) return true;
    if (/^\d{2,4}(st|nd|rd|th)?$/i.test(bare) || /^\d{1,2}[:.]\d{2}$/.test(bare)) return true;
    return /^[\p{L}][\p{L}'’-]{2,}$/u.test(bare) && /[aeiouy]/i.test(bare);
  }).length;
  return wordy / tokens.length <= 0.5;
}

/** Removes WhatsApp markup (*bold*, _italic_, ~strike~, ```mono```) and odd spacing. */
export function cleanFormatting(value: string): string {
  return value
    .replace(/\r\n?/g, "\n")
    .replace(/```/g, "")
    .replace(/(^|[\s(])[*_~]+(?=\S)/g, "$1")
    .replace(/(\S)[*_~]+(?=[\s().,!?:;]|$)/gm, "$1")
    // "Register:(https://…)" — a link someone wrapped in brackets.
    .replace(/:?\s*\((https?:\/\/[^\s)]+)\)/g, (m, url) => `${m.startsWith(":") ? ":" : ""} ${url}`)
    .replace(/\u00a0/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** A bare account handle ("computing.society"), common at the top of a screenshot. */
function isHandle(line: string): boolean {
  return line.length <= 31 && /^@?[a-z0-9_]+(?:[._][a-z0-9_]+)+$/i.test(line);
}

/**
 * In a screenshot of a post, the caption is the line that starts with the
 * account's handle ("arts.society.ucp Photography walk this Sunday!").
 * Its words, not the poster's big lettering, make the best title. In
 * screenshots, a plain handle ("ucpcso The Career Services Office…") counts
 * too: a lower-case run-together name followed by a capitalised sentence.
 */
function findCaption(lines: string[], fromScreenshot: boolean): { text: string; index: number; handle: string } | undefined {
  const handles = new Set(lines.filter(isHandle).map((l) => l.replace(/^@/, "").toLowerCase()));
  for (const [index, line] of lines.entries()) {
    const [first, ...rest] = line.split(" ");
    const handle = first.replace(/^@/, "").toLowerCase();
    if (rest.length >= 3 && handles.has(handle)) {
      return { text: rest.join(" "), index, handle };
    }
  }
  if (fromScreenshot) {
    for (const [index, line] of lines.entries()) {
      const caption = captionStart(line);
      if (caption) return { ...caption, index };
    }
  }
  return undefined;
}

/** "ucpcso The Career Services…" → the handle and the caption after it. */
function captionStart(line: string): { text: string; handle: string } | undefined {
  const m = line.match(/^@?([a-z][a-z0-9._]{4,29}) (\p{Lu}[^ ]*(?: [^ ]+){2,})$/u);
  return m && !SHORT_WORDS.has(m[1]) ? { handle: m[1], text: m[2] } : undefined;
}

/** "Dear Students,", "Hello everyone" — how a message opens, never its title. */
function isGreeting(line: string): boolean {
  return line.length <= 40 && /^(dear|hi|hello|hey|respected|assalam|salam|greetings)\b[^.!?]*[,!]?$/i.test(line);
}

/** Lines mail apps and senders put on top: "This email is targeted at…", "CAUTION: external email". */
function isEmailBanner(line: string): boolean {
  return /^(this (e-?mail|message) (is|was|has)\b|caution\b|external (e-?mail|sender)|you don't often get email)/i.test(line);
}

/**
 * The name something was given in the text: 'a workshop titled "X"' →
 * "Workshop: X", 'a session called "X"' → "Session: X".
 */
function namedTitle(text: string): string | undefined {
  const m = text.match(
    /\b(?:(workshop|seminar|webinar|session|talk|event|competition|hackathon|bootcamp|training|lecture|course|programme|program|contest|conference|meetup)\s+)?(?:titled|entitled|called|named)\s*[:]?\s*["“'‘]([^"”'’\n]{6,80})["”'’]/i
  );
  if (!m) return undefined;
  const name = m[2].replace(/[.,;:!]+$/, "").trim();
  return m[1] ? `${m[1][0].toUpperCase()}${m[1].slice(1).toLowerCase()}: ${name}` : name;
}

function firstSentence(value: string): string {
  const end = value.search(/[.!?](\s|$)/);
  return end > 10 ? value.slice(0, end + 1) : value;
}

/** "Subject: …", "Re: …", "Fwd: …" from a copied or forwarded email. */
function stripEmailPrefix(value: string): string {
  return value.replace(/^(subject|re|fw|fwd)\s*:\s*/i, "").replace(/^(re|fw|fwd)\s*:\s*/i, "");
}

/** Emoji, bullets and trailing colons don't belong in a title. */
function stripDecoration(value: string): string {
  return value
    .replace(/^[^\p{L}\p{N}"'(]+/u, "")
    .replace(/[\s:\-–—|\p{Extended_Pictographic}\u200d\ufe0f]+$/u, "")
    .trim();
}

/** Words kept in capitals when a shouted title is calmed down. */
const KEEP_UPPER = /^(ucp|aws|ai|ml|it|cs|ui|ux|hr|ceo|cto|nastp|pkr|usa|uk|uae|ngo|faq|id|ieee|acm|gdsc|nasa|llm|api|seo|ptv|hec|ntf|sff|ii|iii|iv)$/i;

/** "FAKIHA CORE TECHNOLOGIES" → "Fakiha Core Technologies", keeping "AWS", "AI"… */
function titleCase(value: string): string {
  const letters = value.replace(/[^\p{L}]/gu, "");
  if (letters.length < 6 || letters !== letters.toUpperCase() || value.trim().split(/\s+/).length < 2) return value;
  return value.replace(/\p{L}[\p{L}'’]*/gu, (word, offset: number) => {
    if (KEEP_UPPER.test(word) || (word.length <= 2 && offset > 0 && !/^(OF|TO|IN|ON|AT|BY|OR|AN|A)$/.test(word))) return word;
    const lower = word.toLowerCase();
    if (offset > 0 && /^(of|to|in|on|at|by|or|an|a|and|the|for|with)$/.test(lower)) return lower;
    return lower[0].toUpperCase() + lower.slice(1);
  });
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
  return url.replace(/[).,!?:;'"*\]]+$/, "");
}

/** Drops tracking parameters (utm_*, Instagram's igsh, fbclid…) from a link. */
function withoutTracking(url: string): string {
  try {
    const parsed = new URL(url);
    for (const key of [...parsed.searchParams.keys()]) {
      if (/^(utm_\w+|igsh|igshid|fbclid|gclid|si|mibextid)$/i.test(key)) parsed.searchParams.delete(key);
    }
    return parsed.toString();
  } catch {
    return url;
  }
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
  /** A real date ("20 Oct"), rather than a weekday or "tomorrow". */
  explicit: boolean;
}

/**
 * Finds the deadline in free text. Dates on a line with a deadline word
 * win; otherwise the earliest upcoming date. Dates without a year are
 * assumed to be the next time that date comes round. Day/month order
 * follows Pakistan's convention (20/10 = 20 October).
 */
export function findDeadline(text: string, now: Date = new Date()): Date | undefined {
  return pickDeadline(scanDates(text, now), text, now);
}

/**
 * Dates on a line with a deadline word win; otherwise the earliest
 * upcoming date. Weekdays ("this Thursday") only count when there's no
 * real date anywhere — in "8–9 October … Thursday 11 AM" they're times of
 * the dated event, not a separate deadline.
 */
function pickDeadline(candidates: Candidate[], text: string, now: Date): Date | undefined {
  const anyExplicit = candidates.some((c) => c.explicit);
  const upcoming = candidates.filter((c) => c.date.getTime() > now.getTime() && (c.explicit || !anyExplicit));
  if (upcoming.length === 0) return undefined;

  const onDeadlineLine = upcoming.filter((c) => DEADLINE_WORDS.test(lineAround(text, c.index)));
  const pool = onDeadlineLine.length > 0 ? onDeadlineLine : upcoming;
  return pool.sort((a, b) => a.date.getTime() - b.date.getTime())[0].date;
}

/** Every date mentioned, past or future. */
function scanDates(text: string, now: Date): Candidate[] {
  const candidates: Candidate[] = [];
  const add = (date: Date | undefined, index: number, matchLength: number, explicit = true) => {
    if (!date || Number.isNaN(date.getTime())) return;
    const time = findTime(timeSnippet(text, index, matchLength));
    if (time) date.setHours(time.hours, time.minutes, 0, 0);
    else date.setHours(23, 59, 0, 0);
    candidates.push({ date, index, hasTime: Boolean(time), explicit });
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
    add(d, m.index!, m[0].length, false);
  }
  for (const m of lower.matchAll(/\b(?:(this|next|coming)\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/g)) {
    const target = WEEKDAYS.indexOf(m[2]);
    let delta = (target - now.getDay() + 7) % 7;
    if (m[1] === "next" && delta === 0) delta = 7;
    add(new Date(now.getFullYear(), now.getMonth(), now.getDate() + delta), m.index!, m[0].length, false);
  }
  return candidates;
}

function monthIndex(token: string): number {
  return MONTHS.indexOf(token.slice(0, 3));
}

function makeDate(day: number, month: number, year: string | undefined, now: Date): Date | undefined {
  if (month < 0 || month > 11 || day < 1 || day > 31) return undefined;
  let fullYear = year ? Number(year.length === 2 ? `20${year}` : year) : now.getFullYear();
  let date = new Date(fullYear, month, day);
  if (date.getMonth() !== month) return undefined; // e.g. 31 Feb
  // No year given and the date has passed (by more than a day): next
  // year's — but only around the turn of the year ("5 Jan" in December).
  // "October 5" in mid-October is a post's date, not one 12 months away.
  const nextYears = new Date(fullYear + 1, month, day);
  if (!year && date.getTime() < now.getTime() - 24 * 3600 * 1000 && nextYears.getTime() - now.getTime() < 120 * 24 * 3600 * 1000) {
    fullYear += 1;
    date = new Date(fullYear, month, day);
  }
  return date;
}

/**
 * Where a date's time can be: just after it on the same line ("20 Oct,
 * 5pm"), or on a following "Time:" line. A time on any other line belongs
 * to something else ("Thursday: 11 AM" under a date range).
 */
function timeSnippet(text: string, index: number, matchLength: number): string {
  const sameLine = text.slice(index, index + matchLength + 25).split("\n")[0];
  const lineEnd = text.indexOf("\n", index);
  const nextLine = lineEnd === -1 ? "" : text.slice(lineEnd + 1).split("\n")[0];
  return /^\W*time\s*:/i.test(nextLine) ? `${sameLine}\n${nextLine}` : sameLine;
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
  career: ["internship", "intern", "job", "hiring", "career", "placement", "cv", "resume", "vacancy", "recruiter", "interview", "seeking", "executive", "salary", "stipend", "commission", "full-time", "part-time", "fresh graduates"],
  job: ["internship", "intern", "job", "hiring", "career", "placement", "cv", "resume", "vacancy", "interview", "seeking", "executive", "salary", "stipend", "commission", "full-time", "part-time", "fresh graduates"],
  academic: ["exam", "mid-term", "midterm", "mids", "final exam", "final term", "quiz", "assignment", "class", "course", "lecture", "timetable", "datesheet", "date sheet", "schedule", "semester", "result", "library", "fee", "enrollment", "enrolment"],
  sport: ["sport", "football", "cricket", "basketball", "futsal", "badminton", "volleyball", "trials", "tournament", "match", "gym", "athletics"],
  societ: ["society", "club", "auditions", "recruit", "members", "join", "membership", "walk-in"],
  club: ["society", "club", "auditions", "recruit", "members", "join", "membership", "walk-in"],
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
