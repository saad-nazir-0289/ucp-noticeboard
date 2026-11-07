// Submissions Due, read in the background (loaded into background.js).
// due.js shows them on the dashboard; this reads Horizon's pages.
//
// Reading here rather than in the page: a page's own requests are
// cancelled the moment the student leaves it, and Horizon takes seconds
// per page, so on a first visit the student often left before anything
// arrived and nothing was kept. Here the reads finish whatever the
// student does, all courses at once, and start as soon as any Horizon
// page begins to load (due.js asks), well before the dashboard is on
// screen.
//
// Each course's submission page (/student/course/submission/<id>) is read
// as the student (Horizon's own login; the extension may read
// horizon.ucp.edu.pk). Everything goes into chrome.storage.local
// (ucpnb_due), course by course as each arrives, and only from here, so
// nothing is lost to two writers:
//   courses  { id: name }          the dashboard's courses (from due.js)
//   results  { id: { at, items } } what each course's page showed, and when
//   failed   { id: when }          no submission page came back last time
//   checking [id]                  being read right now
//   loggedOut                      Horizon answered with its sign-in page
(() => {
  const STORE = "ucpnb_due";
  const ORIGIN = "https://horizon.ucp.edu.pk";
  const STALE_MS = 5 * 60 * 1000; // a course read longer ago than this is read again
  const TIMEOUT_MS = 20000;

  // ---------- Reading a submission page (no DOM in a service worker) ----------
  const decode = (html) =>
    html
      .replace(/<[^>]*>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, " ")
      .trim();
  // "2026-11-06 23:59" is Horizon's own time, Pakistan (UTC+5).
  const parseDate = (text) => {
    const m = (text ?? "").match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})/);
    return m ? Date.UTC(+m[1], m[2] - 1, +m[3], +m[4] - 5, +m[5]) : NaN;
  };
  const cell = (row, cls) =>
    row.match(new RegExp(`<td\\b[^>]*class="[^"]*\\b${cls}\\b[^"]*"[^>]*>([\\s\\S]*?)</td>`, "i"))?.[1] ?? "";

  /** The course's assignments, or null when the page isn't its submission page. */
  function parse(html, id) {
    const rows = [...html.matchAll(/<tr\b[^>]*\bsubmission_id="([^"]*)"[^>]*>([\s\S]*?)<\/tr>/gi)];
    const isSubmissionPage =
      rows.length > 0 ||
      /<th\b[^>]*>\s*Due Date\s*<\/th>/i.test(html) ||
      new RegExp(`class="[^"]*md-btn-success[^"]*"[^>]*href="[^"]*/student/course/submission/${id}"`).test(html);
    if (!isSubmissionPage) return null;
    return rows.map(([, sid, row]) => ({
      id: sid,
      title: decode(cell(row, "rec_submission_title")) || "Submission",
      due: parseDate(decode(cell(row, "rec_submission_due_date"))),
      open: /\bupload_submission\b/.test(row) || /<(a|button)\b[^>]*>\s*Upload\b/i.test(row),
    }));
  }

  const signInPage = (response, html) =>
    /\/web\/login|login\.microsoftonline|\/auth_oauth\//i.test(response.url) ||
    /<form\b[^>]*action="[^"]*\/web\/login/i.test(html);

  /** { items } | { signedOut: true } | {} (something else: busy, an error) */
  async function read(id) {
    try {
      const response = await fetch(`${ORIGIN}/student/course/submission/${id}`, {
        credentials: "include",
        cache: "no-store",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      const html = await response.text();
      if (signInPage(response, html)) return { signedOut: true };
      if (!response.ok || !new URL(response.url).pathname.startsWith("/student/course/submission/")) return {};
      const items = parse(html, id);
      return items ? { items } : {};
    } catch {
      return {};
    }
  }

  // ---------- Storage: one writer, changes one after another ----------
  const blank = () => ({ courses: {}, results: {}, failed: {}, checking: [], loggedOut: false });
  let queue = Promise.resolve();
  function update(change) {
    queue = queue
      .then(async () => {
        const state = { ...blank(), ...((await chrome.storage.local.get(STORE))[STORE] ?? {}) };
        change(state);
        await chrome.storage.local.set({ [STORE]: state });
      })
      .catch(() => {});
    return queue;
  }

  // ---------- Checking ----------
  let running = null;
  function refresh(force) {
    if (running) return running;
    running = (async () => {
      const state = { ...blank(), ...((await chrome.storage.local.get(STORE))[STORE] ?? {}) };
      const now = Date.now();
      const todo = Object.keys(state.courses).filter(
        (id) => force || !state.results[id] || now - state.results[id].at > STALE_MS
      );
      if (!todo.length) return;
      await update((s) => {
        s.checking = todo;
        s.loggedOut = false;
      });
      const settle = (id, outcome) =>
        update((s) => {
          s.checking = s.checking.filter((x) => x !== id);
          if (outcome.items) {
            s.results[id] = { at: Date.now(), items: outcome.items };
            delete s.failed[id];
          } else s.failed[id] = Date.now();
          if (outcome.signedOut) s.loggedOut = true;
        });

      const outcomes = await Promise.all(todo.map(async (id) => [id, await read(id)]));
      const retry = [];
      for (const [id, outcome] of outcomes) {
        if (outcome.items || outcome.signedOut) await settle(id, outcome);
        else retry.push(id);
      }
      if (!retry.length) return;
      // Not a submission page and not signed out: open one course the way
      // the student would (its page first), then try those again, once.
      await fetch(`${ORIGIN}/student/course/info/${retry[0]}`, {
        credentials: "include",
        cache: "no-store",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      }).catch(() => {});
      await Promise.all(retry.map(async (id) => settle(id, await read(id))));
    })()
      .catch(() => update((s) => (s.checking = [])))
      .finally(() => {
        running = null;
      });
    return running;
  }

  chrome.runtime.onMessage.addListener((message, sender) => {
    if (message?.type !== "ucpnb-due") return;
    if (!sender.url?.startsWith(ORIGIN)) return;
    (async () => {
      // The dashboard's courses, as on the page right now.
      if (Array.isArray(message.courses) && message.courses.length) {
        await update((s) => {
          s.courses = Object.fromEntries(message.courses.filter(([id]) => typeof id === "string" && id));
          for (const key of ["results", "failed"]) {
            for (const id of Object.keys(s[key])) if (!(id in s.courses)) delete s[key][id];
          }
        });
      }
      // A course's submission page, as the student is looking at it.
      if (message.learned?.id && Array.isArray(message.learned.items)) {
        const { id, items } = message.learned;
        await update((s) => {
          s.results[id] = { at: Date.now(), items };
          delete s.failed[id];
          s.loggedOut = false;
        });
      }
      if (message.refresh) await refresh(Boolean(message.force));
    })();
  });

  // Exposed for tests only.
  self.UCPNB_DUE_PARSE = parse;
})();
