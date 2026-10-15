import type { Notice } from "./types";
import { API_BASE_URL } from "./api/client";

// A notice's deadline as a calendar event: the hour leading up to it,
// titled so it reads right in a busy calendar, with the notice's link
// (or its share page) to get back to it. Everything is built on the
// device — nothing is sent anywhere.

const EVENT_LENGTH_MS = 60 * 60 * 1000;

/** 20261019T130000Z — the UTC form both Google and .ics files take. */
function utcStamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function eventDetails(notice: Notice) {
  const end = new Date(notice.deadline!);
  const start = new Date(end.getTime() - EVENT_LENGTH_MS);
  const link = notice.linkUrl || `${API_BASE_URL}/share/notice/${notice.id}`;
  return {
    title: `Deadline: ${notice.title}`,
    start,
    end,
    description: `${notice.description}\n\n${link}`,
  };
}

/** Opens Google Calendar's "new event" page, filled in. */
export function googleCalendarUrl(notice: Notice): string {
  const e = eventDetails(notice);
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: e.title,
    dates: `${utcStamp(e.start)}/${utcStamp(e.end)}`,
    details: e.description,
  });
  return `https://calendar.google.com/calendar/render?${params}`;
}

/** Text values in .ics files escape \, ; , and newlines. */
function icsText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/**
 * Long lines are folded (RFC 5545 §3.1). The limit is 75 octets; this counts
 * characters, which calendar apps accept for non-Latin text too.
 */
function fold(line: string): string {
  const parts: string[] = [];
  let rest = line;
  while (rest.length > 74) {
    parts.push(rest.slice(0, 74));
    rest = " " + rest.slice(74);
  }
  parts.push(rest);
  return parts.join("\r\n");
}

/** An .ics calendar file (Apple Calendar, Outlook, most others), with a reminder a day before. */
export function icsFile(notice: Notice, now: Date = new Date()): string {
  const e = eventDetails(notice);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//UCP NoticeBoard//EN",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:notice-${notice.id}@ucp-noticeboard`,
    `DTSTAMP:${utcStamp(now)}`,
    `DTSTART:${utcStamp(e.start)}`,
    `DTEND:${utcStamp(e.end)}`,
    `SUMMARY:${icsText(e.title)}`,
    `DESCRIPTION:${icsText(e.description)}`,
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    `DESCRIPTION:${icsText(e.title)}`,
    "TRIGGER:-P1D",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}

/** Saves the .ics file; opening it adds the event to the phone's or computer's calendar. */
export function downloadIcs(notice: Notice): void {
  const blob = new Blob([icsFile(notice)], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${notice.title.replace(/[^\w\- ]+/g, "").trim().slice(0, 60) || "notice"}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
