// "Submissions Due" on the Horizon dashboard, a section of its own just
// before News and Announcements: every assignment still open for
// submission, in every course on the dashboard, soonest first, each linking
// to its submission page.
//
// Each course card links to /student/course/info/<id>; its submission page
// is /student/course/submission/<id>, with one row per assignment
// (tr[submission_id]: title, start, due date, and an "Upload" button while
// it can still be submitted).
//
// The pages are read by the extension's background (due-worker.js), so a
// read isn't lost when the student leaves the page, and all courses are
// read at once. This script:
// - on every Horizon page, as it opens and as it's left: asks the
//   background to read any course not read in the last 5 minutes, so the
//   reading is under way while Horizon is still preparing the dashboard;
// - on a course's submission page: hands over what that page shows, so the
//   dashboard is right about that course straight away;
// - on the dashboard: tells the background which courses there are, shows
//   what it knows at once and each course as it arrives (storage changes),
//   and asks again every 5 minutes while open, on coming back to the tab,
//   and on "Check now".
// If the background can't read a course (no submission page, or Horizon's
// sign-in page: some browsers don't let it use the student's sign-in), the
// dashboard reads that course itself, as before, and hands it over.
//
// A page that isn't a submission page (Horizon busy, signed out, an error)
// never counts as "nothing due": the course keeps what was last known, and
// the section says it couldn't be checked.
//
// Not every few seconds: each check opens one Horizon page per course, and
// Horizon takes seconds to answer each, so checking constantly would slow
// the portal down for the student; deadlines don't change that often.
//
// Left out: assignments past their due date, rows without an Upload button,
// and, for half an hour, ones the student just submitted with the extension
// watching (submit-watch.js notes those in ucpnb_submitted_ids), until
// Horizon's page catches up.
(() => {
  const STORE = "ucpnb_due"; // chrome.storage.local, written by due-worker.js
  const DONE = "ucpnb_submitted_ids"; // page storage: { id: when }, from submit-watch.js
  const DONE_FOR_MS = 30 * 60 * 1000;
  const EVERY_MS = 5 * 60 * 1000; // while the dashboard stays open and in view

  const ask = (message) => {
    try {
      chrome.runtime.sendMessage({ type: "ucpnb-due", ...message }).catch(() => {});
    } catch {
      // The extension was updated or removed: this page is on its own.
    }
  };

  // Every Horizon page: get the reading started early, as it opens and as
  // it's left (usually for the dashboard, which takes Horizon seconds).
  ask({ refresh: true });
  window.addEventListener("pagehide", () => ask({ refresh: true }));

  const recentlySubmitted = () => {
    let done = {};
    try {
      done = JSON.parse(localStorage.getItem(DONE) ?? "{}") ?? {};
    } catch {
      // Nothing noted.
    }
    if (Array.isArray(done) || typeof done !== "object") return new Set(); // the old list: Horizon decides
    const now = Date.now();
    return new Set(Object.keys(done).filter((id) => now - done[id] < DONE_FOR_MS));
  };

  // "2026-11-06 23:59" is Horizon's own time, Pakistan (UTC+5), whatever
  // the device's time zone.
  const parseDate = (text) => {
    const m = (text ?? "").trim().match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})/);
    return m ? Date.UTC(+m[1], m[2] - 1, +m[3], +m[4] - 5, +m[5]) : NaN;
  };
  const clean = (text) => (text ?? "").replace(/\s+/g, " ").trim();

  /**
   * A course's assignments from its submission page, or null when the page
   * isn't one (a sign-in or error page): unknown, not empty.
   */
  function parseCourse(doc, courseId) {
    const rows = [...doc.querySelectorAll("tr[submission_id]")];
    // Columns by their headings, in case Horizon drops a class name.
    const headings = [...doc.querySelectorAll("thead th")].map((th) => clean(th.textContent).toLowerCase());
    const isSubmissionPage =
      rows.length > 0 ||
      headings.includes("due date") ||
      Boolean(doc.querySelector(`a.md-btn-success[href*="/student/course/submission/${courseId}"]`));
    if (!isSubmissionPage) return null;
    const column = (row, name) => {
      const i = headings.indexOf(name);
      return i >= 0 ? row.children[i] : null;
    };
    return rows.map((row) => ({
      id: row.getAttribute("submission_id"),
      title:
        clean((row.querySelector(".rec_submission_title") ?? column(row, "name"))?.textContent) || "Submission",
      due: parseDate((row.querySelector(".rec_submission_due_date") ?? column(row, "due date"))?.textContent),
      open: Boolean(
        row.querySelector(".upload_submission") ||
          [...row.querySelectorAll("a, button")].some((el) => /^upload\b/i.test(clean(el.textContent)))
      ),
    }));
  }

  // ---------- On a course's submission page: hand over what it shows ----------
  const onSubmissionPage = location.pathname.match(/^\/student\/course\/submission\/([^/?#]+)/);
  if (onSubmissionPage) {
    const id = onSubmissionPage[1];
    const learn = () => {
      const items = parseCourse(document, id);
      if (items) ask({ learned: { id, items } });
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", learn, { once: true });
    else learn();
    return;
  }

  if (!location.pathname.startsWith("/student/dashboard")) return;

  // ---------- On the dashboard ----------
  // Course id to name, and to its card's header, whose colour the course's
  // submissions take.
  const headers = new Map();
  function courses() {
    const found = new Map();
    for (const link of document.querySelectorAll('#page_content_inner a[href*="/student/course/info/"]')) {
      const id = link.getAttribute("href").split("/student/course/info/")[1]?.split(/[/?#]/)[0];
      if (!id || found.has(id)) continue;
      const header = link.querySelector(".card-header");
      const name = clean(header?.textContent) || clean(link.textContent.trim().split("\n")[0]);
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

  // ---------- Showing them ----------
  const dueText = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Karachi",
  });
  function countdown(due) {
    const ms = due - Date.now();
    const hours = ms / 3600000;
    if (hours < 1) return { text: `${Math.max(1, Math.round(ms / 60000))} min left`, level: "urgent" };
    if (hours < 24) return { text: `${Math.round(hours)} h left`, level: "urgent" };
    const days = Math.floor(hours / 24);
    if (days < 3) return { text: days === 1 ? "1 day left" : `${days} days left`, level: "soon" };
    return { text: `${days} days left`, level: "later" };
  }
  function ago(at) {
    const min = Math.round((Date.now() - at) / 60000);
    if (min < 1) return "just now";
    if (min < 60) return `${min} min ago`;
    const h = Math.round(min / 60);
    return h < 24 ? `${h} h ago` : "over a day ago";
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

  let list = new Map(); // the dashboard's courses
  let state = null; // ucpnb_due, as last read
  let selfChecking = 0; // courses this page is reading itself (fallback)

  function show() {
    const box = section();
    if (!box || !state) return;
    const results = state.results ?? {};
    const failed = [...list.keys()].filter((id) => state.failed?.[id] && !state.checking?.includes(id));
    const checking = [...list.keys()].filter((id) => state.checking?.includes(id)).length + selfChecking;
    const done = recentlySubmitted();
    const now = Date.now();
    const due = [];
    for (const [courseId, name] of list) {
      for (const item of results[courseId]?.items ?? []) {
        if (item.open && item.due > now && !done.has(String(item.id))) due.push({ ...item, courseId, course: name });
      }
    }
    due.sort((a, b) => a.due - b.due);
    const unknown = [...list.keys()].filter((id) => !results[id]);

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

    // When it was last checked, and a way to check now.
    const status = document.createElement("p");
    status.className = "ucpnb-due-status";
    status.setAttribute("aria-live", "polite");
    const times = [...list.keys()].map((id) => results[id]?.at).filter(Boolean);
    if (checking) {
      const of = list.size - checking;
      status.textContent = `Checking your courses… ${of} of ${list.size}`;
    } else {
      const parts = [];
      if (times.length) parts.push(`Checked ${ago(Math.min(...times))}`);
      if (failed.length) parts.push(`couldn't reach ${failed.length === 1 ? "1 course" : `${failed.length} courses`}`);
      status.textContent = parts.join(", ");
      const again = document.createElement("button");
      again.type = "button";
      again.className = "ucpnb-due-again";
      again.textContent = failed.length ? "Try again" : "Check now";
      again.addEventListener("click", () => {
        fellBack.clear();
        ask({ refresh: true, force: true });
      });
      if (parts.length) status.append(" · ");
      status.append(again);
    }
    body.append(status);

    if (!due.length) {
      const empty = document.createElement("p");
      empty.className = "ucpnb-due-empty";
      empty.textContent =
        checking && unknown.length
          ? "Looking for assignments…"
          : failed.length || unknown.length
            ? "Nothing due in the courses checked."
            : "Nothing due right now. 🎉";
      body.append(empty);
      return;
    }
    const cards = document.createElement("div");
    cards.className = "ucpnb-due-list";
    for (const item of due) {
      const { text, level } = countdown(item.due);
      const card = document.createElement("a");
      card.className = `ucpnb-due-card ucpnb-due-${level}`;
      card.href = `/student/course/submission/${item.courseId}`;
      // The course card's colour: the stripe takes it as it is (a gradient in
      // NoticeBoard style), the course name its first colour.
      const paint = paintOf(item.courseId);
      if (paint) {
        card.style.setProperty("--d-paint", paint);
        const solid = paint.match(/rgba?\([^)]*\)/)?.[0];
        if (solid) card.style.setProperty("--d-ink", solid);
      }
      const course = document.createElement("span");
      course.className = "ucpnb-due-course";
      course.textContent = item.course;
      const name = document.createElement("b");
      name.className = "ucpnb-due-title";
      name.textContent = item.title;
      const when = document.createElement("span");
      when.className = "ucpnb-due-when";
      when.textContent = `Due ${dueText.format(item.due)}`;
      const chip = document.createElement("span");
      chip.className = "ucpnb-due-chip";
      chip.textContent = text;
      card.append(course, name, when, chip);
      cards.append(card);
    }
    body.append(cards);
  }

  let pending = 0;
  const showSoon = () => {
    if (!pending) pending = requestAnimationFrame(() => ((pending = 0), show()));
  };

  // ---------- If the background couldn't read a course: read it from here ----------
  const fellBack = new Set(); // courses this page already read itself
  let backgroundRan = false; // a background read finished while this page was open
  async function fallBack() {
    // Even when the background got Horizon's sign-in page: the student is on
    // the dashboard, so signed in; the browser may just not let the
    // background use the sign-in.
    if (!backgroundRan || !state || state.checking?.some((id) => list.has(id))) return;
    const todo = [...list.keys()].filter((id) => state.failed?.[id] && !fellBack.has(id));
    if (!todo.length) return;
    todo.forEach((id) => fellBack.add(id));
    selfChecking += todo.length;
    showSoon();
    await Promise.all(
      todo.map(async (id) => {
        try {
          const response = await fetch(`/student/course/submission/${id}`, {
            credentials: "same-origin",
            cache: "no-store",
          });
          if (response.ok && new URL(response.url).pathname.startsWith("/student/course/submission/")) {
            const items = parseCourse(new DOMParser().parseFromString(await response.text(), "text/html"), id);
            if (items) ask({ learned: { id, items } });
          }
        } catch {
          // Stays "couldn't reach".
        } finally {
          selfChecking--;
          showSoon();
        }
      })
    );
  }

  async function load() {
    try {
      state = (await chrome.storage.local.get(STORE))[STORE] ?? { results: {}, failed: {}, checking: [] };
    } catch {
      state = { results: {}, failed: {}, checking: [] };
    }
    showSoon();
    fallBack();
  }

  function start() {
    list = courses();
    if (list.size === 0) return;
    // The courses on the page, and read whichever aren't fresh.
    ask({ courses: [...list], refresh: true });
    load();
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "local" && STORE in changes) {
        if (changes[STORE].oldValue?.checking?.length && !changes[STORE].newValue?.checking?.length) backgroundRan = true;
        state = changes[STORE].newValue ?? state;
        showSoon();
        fallBack();
      }
    });
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") ask({ refresh: true });
    });
    window.addEventListener("pageshow", (e) => {
      if (e.persisted) ask({ refresh: true });
    });
    setInterval(() => {
      if (document.visibilityState === "visible") ask({ refresh: true });
    }, EVERY_MS);
    // Countdowns and "checked … ago" stay current; another tab's
    // submission noted (submit-watch.js).
    setInterval(showSoon, 60000);
    window.addEventListener("storage", (e) => {
      if (e.key === DONE) showSoon();
    });
  }

  try {
    localStorage.removeItem("ucpnb_due_cache"); // older versions' copies
    localStorage.removeItem("ucpnb_due_v2");
  } catch {
    // Nothing to tidy.
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
