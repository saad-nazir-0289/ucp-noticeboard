// "Submissions Due" on the Horizon dashboard, a section of its own just
// before News and Announcements:
// every assignment still open for submission, in every course on the
// dashboard, soonest first, each linking to its submission page.
//
// Each course card links to /student/course/info/<id>; its submission page
// is /student/course/submission/<id>, with one row per assignment
// (tr[submission_id]: title, start, due date, and an "Upload" button while
// it can still be submitted). Those pages are read in the background, as
// the student (same site, their own login), at most every 10 minutes; the
// last result shows straight away meanwhile.
//
// Left out: assignments past their due date, rows without an Upload button,
// and ones the student submitted with the extension watching
// (submit-watch.js notes those in ucpnb_submitted_ids).
(() => {
  if (!location.pathname.startsWith("/student/dashboard")) return;

  const CACHE = "ucpnb_due_cache"; // page storage: { at, items }
  const DONE = "ucpnb_submitted_ids"; // page storage, from submit-watch.js
  const FRESH_MS = 10 * 60 * 1000;
  const read = (key, fallback) => {
    try {
      return JSON.parse(localStorage.getItem(key) ?? "null") ?? fallback;
    } catch {
      return fallback;
    }
  };
  const write = (key, value) => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Not cached: read again next time.
    }
  };

  // "2026-11-06 23:59", Horizon's own (Pakistan) time.
  const parseDate = (text) => {
    const m = text.trim().match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})/);
    return m ? new Date(+m[1], m[2] - 1, +m[3], +m[4], +m[5]).getTime() : NaN;
  };

  // Course id to name, and to its card's header, whose colour the course's
  // submissions take.
  const headers = new Map();
  function courses() {
    const found = new Map();
    for (const link of document.querySelectorAll('#page_content_inner a[href*="/student/course/info/"]')) {
      const id = link.getAttribute("href").split("/student/course/info/")[1]?.split(/[/?#]/)[0];
      if (!id || found.has(id)) continue;
      const header = link.querySelector(".card-header");
      const name = header?.textContent.trim() || link.textContent.trim().split("\n")[0].trim();
      found.set(id, name);
      if (header) headers.set(id, header);
    }
    return found;
  }
  // The course card's own colour (a gradient in NoticeBoard style, Horizon's
  // blue in Original), as shown right now.
  function paintOf(courseId) {
    const header = headers.get(courseId);
    if (!header) return null;
    const style = getComputedStyle(header);
    return style.backgroundImage !== "none" ? style.backgroundImage : style.backgroundColor;
  }

  async function readCourse(id, name) {
    const response = await fetch(`/student/course/submission/${id}`, { credentials: "same-origin" });
    if (!response.ok) return [];
    const page = new DOMParser().parseFromString(await response.text(), "text/html");
    return [...page.querySelectorAll("tr[submission_id]")].map((row) => ({
      id: row.getAttribute("submission_id"),
      courseId: id,
      course: name,
      title: row.querySelector(".rec_submission_title")?.textContent.trim() || "Submission",
      due: parseDate(row.querySelector(".rec_submission_due_date")?.textContent ?? ""),
      open: Boolean(row.querySelector(".upload_submission")),
    }));
  }

  // ---------- Showing them ----------
  const dueText = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  function countdown(due) {
    const ms = due - Date.now();
    const hours = ms / 3600000;
    if (hours < 1) return { text: `${Math.max(1, Math.round(ms / 60000))} min left`, level: "urgent" };
    if (hours < 24) return { text: `${Math.round(hours)} h left`, level: "urgent" };
    const days = Math.floor(hours / 24);
    if (days < 3) return { text: days === 1 ? "1 day left" : `${days} days left`, level: "soon" };
    return { text: `${days} days left`, level: "later" };
  }

  // A section of its own, with a heading like Horizon's "News and
  // Announcements" (the same classes, so the same look in either style),
  // just before it.
  function section() {
    let box = document.getElementById("ucpnb-due");
    if (box) return box;
    const news = [...document.querySelectorAll("#page_content_inner :is(h2, h3, h4)")].find((h) =>
      /news\s*(and|&)\s*announcements/i.test(h.textContent)
    );
    if (!news) return null;
    box = document.createElement("section");
    box.id = "ucpnb-due";
    box.setAttribute("aria-labelledby", "ucpnb-due-heading");
    const heading = document.createElement(news.tagName);
    heading.id = "ucpnb-due-heading";
    heading.className = news.className;
    box.append(heading);
    news.before(box);
    return box;
  }

  function show(items, { checking = false } = {}) {
    const box = section();
    if (!box) return;
    const done = new Set(read(DONE, []));
    const now = Date.now();
    const due = items
      .filter((i) => i.open && i.due > now && !done.has(String(i.id)))
      .sort((a, b) => a.due - b.due);
    const heading = box.querySelector("#ucpnb-due-heading");
    heading.textContent = "Submissions Due";
    if (due.length) {
      const count = document.createElement("span");
      count.className = "ucpnb-due-count";
      count.textContent = String(due.length);
      heading.append(" ", count);
    }
    box.querySelector(".ucpnb-due-body")?.remove();
    const body = document.createElement("div");
    body.className = "ucpnb-due-body";
    box.append(body);
    if (!due.length) {
      const empty = document.createElement("p");
      empty.className = "ucpnb-due-empty";
      empty.textContent = checking ? "Checking your courses…" : "Nothing due right now. 🎉";
      body.append(empty);
      return;
    }
    const list = document.createElement("div");
    list.className = "ucpnb-due-list";
    for (const item of due) {
      const { text, level } = countdown(item.due);
      const card = document.createElement("a");
      card.className = `ucpnb-due-card ucpnb-due-${level}`;
      card.href = `/student/course/submission/${item.courseId}`;
      // Header in the course card's colour, like the course cards above.
      const top = document.createElement("span");
      top.className = "ucpnb-due-course";
      top.textContent = item.course;
      const paint = paintOf(item.courseId);
      if (paint) top.style.setProperty("background", paint, "important");
      const inner = document.createElement("span");
      inner.className = "ucpnb-due-inner";
      const name = document.createElement("b");
      name.className = "ucpnb-due-title";
      name.textContent = item.title;
      const when = document.createElement("span");
      when.className = "ucpnb-due-when";
      when.textContent = `Due ${dueText.format(item.due)}`;
      const chip = document.createElement("span");
      chip.className = "ucpnb-due-chip";
      chip.textContent = text;
      inner.append(name, when, chip);
      card.append(top, inner);
      list.append(card);
    }
    body.append(list);
  }

  async function refresh() {
    const list = courses();
    if (list.size === 0) return;
    const cached = read(CACHE, null);
    if (cached?.items) show(cached.items);
    else show([], { checking: true });
    if (cached && Date.now() - cached.at < FRESH_MS) return;
    const results = await Promise.all([...list].map(([id, name]) => readCourse(id, name).catch(() => null)));
    // A course that couldn't be read keeps what was known about it.
    const items = results.flatMap((r, i) => r ?? (cached?.items ?? []).filter((x) => x.courseId === [...list.keys()][i]));
    write(CACHE, { at: Date.now(), items });
    show(items);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", refresh, { once: true });
  else refresh();
  // Countdowns stay current on a dashboard left open.
  setInterval(() => {
    const cached = read(CACHE, null);
    if (cached?.items && document.getElementById("ucpnb-due")) show(cached.items);
  }, 60000);
})();
