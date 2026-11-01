// Notices a successful assignment submission on Horizon, for the fireworks
// (celebrate.js). Runs in the page's own world (manifest "world": "MAIN") so
// it can see Horizon's own functions and requests; it changes nothing.
//
// Horizon's submission page (any course, semester or department) has an
// "Upload & Submit" button that asks "Are you sure to Submit Submission"
// and then calls upload_submit_submission(), which sends the files and the
// submission. So:
//   1. A submission starts when that function is called (or, if Horizon
//      ever renames it, when the "Submit" confirm dialog's OK is clicked).
//   2. Every request sent from then on (not page loads) is checked: an HTTP
//      error, or a reply that says error / status false / success false,
//      means it failed. So does an alert or Horizon's error box saying so.
//   3. Once those requests are done and at least one succeeded, it's a
//      success: "ucpnb:submitted" goes to celebrate.js. If Horizon reloads
//      the page straight away, a note in sessionStorage carries it over.
(() => {
  if (window.__ucpnbSubmitWatch) return;
  window.__ucpnbSubmitWatch = true;

  const CELEBRATE = "ucpnb_celebrate"; // success, for celebrate.js (also across a reload)
  const PENDING = "ucpnb_submit_pending"; // started, result not known before the page changed
  const FAIL_WORDS = /\b(error|errors|fail|failed|failure|invalid|not allowed|cannot|can't|unable|expired|denied|exception|already submitted)\b/i;
  let watch = null; // { started, pending, ok, failed, formSent, timer }

  const note = (key, value) => {
    try {
      if (value == null) sessionStorage.removeItem(key);
      else sessionStorage.setItem(key, value);
    } catch {
      // Private window without storage: only a celebration across a reload is lost.
    }
  };

  function start() {
    if (watch && Date.now() - watch.started < 3000) return; // the same submission, seen twice
    watch = { started: Date.now(), pending: 0, ok: 0, failed: false, formSent: false, timer: 0 };
    // Nothing came back in two minutes: give up quietly.
    const mine = watch;
    setTimeout(() => {
      if (watch === mine) finish(false);
    }, 120000);
  }

  function finish(success) {
    if (!watch) return;
    clearTimeout(watch.timer);
    watch = null;
    note(PENDING, null);
    if (!success) return;
    note(CELEBRATE, String(Date.now()));
    document.dispatchEvent(new CustomEvent("ucpnb:submitted"));
  }

  // Horizon's own error box in the submission dialog, or an error notice.
  function pageShowsError() {
    const box = document.getElementById("submission_body_error_text");
    if (box && box.offsetParent !== null && box.textContent.trim()) return true;
    for (const el of document.querySelectorAll(".uk-notify-message, .uk-modal-dialog, .alert-danger, .alert-error, .swal2-popup, .toast")) {
      if (el.offsetParent !== null && FAIL_WORDS.test(el.textContent)) return true;
    }
    return false;
  }

  // Done when no request is still out for a moment (Horizon may send the
  // attachments and the submission one after another).
  function settle() {
    if (!watch) return;
    clearTimeout(watch.timer);
    if (watch.failed) return finish(false);
    if (watch.pending > 0 || watch.ok === 0) return;
    watch.timer = setTimeout(() => {
      if (!watch || watch.pending > 0) return;
      finish(!watch.failed && !pageShowsError());
    }, 1200);
  }

  function judge(status, body) {
    if (!watch) return;
    if (status < 200 || status >= 300) {
      watch.failed = true;
      return;
    }
    if (typeof body === "string" && /^\s*[{[]/.test(body)) {
      try {
        const reply = JSON.parse(body);
        const said = (o) =>
          o && typeof o === "object" && (o.error || o.status === false || o.success === false || o.status === "error" || o.status === "failed");
        if (said(reply) || said(reply?.result)) {
          watch.failed = true;
          return;
        }
      } catch {
        // Not JSON after all: judged by its status alone.
      }
    }
    watch.ok += 1;
  }

  // ---------- Requests ----------
  const open = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, ...rest) {
    this.__ucpnbMethod = String(method).toUpperCase();
    return open.call(this, method, ...rest);
  };
  const send = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function (...args) {
    if (watch && this.__ucpnbMethod !== "GET") {
      watch.pending += 1;
      // "readystatechange" comes before Horizon's own "load" handler, which
      // may reload the page.
      let counted = false;
      const done = () => {
        if (counted || this.readyState !== 4) return;
        counted = true;
        const text = this.responseType === "" || this.responseType === "text" ? this.responseText : null;
        judge(this.status, text);
        if (watch) watch.pending -= 1;
        settle();
      };
      this.addEventListener("readystatechange", done);
      this.addEventListener("loadend", done);
    }
    return send.apply(this, args);
  };
  const nativeFetch = window.fetch;
  window.fetch = function (input, init) {
    const method = String(init?.method ?? input?.method ?? "GET").toUpperCase();
    const result = nativeFetch.apply(this, arguments);
    if (watch && method !== "GET") {
      watch.pending += 1;
      result
        .then(async (response) => judge(response.status, await response.clone().text().catch(() => null)))
        .catch(() => watch && (watch.failed = true))
        .finally(() => {
          if (watch) watch.pending -= 1;
          settle();
        });
    }
    return result;
  };

  // ---------- Messages Horizon shows ----------
  const nativeAlert = window.alert;
  window.alert = function (message) {
    if (watch && FAIL_WORDS.test(String(message))) watch.failed = true;
    return nativeAlert.apply(this, arguments);
  };

  // ---------- Where a submission starts ----------
  const wrap = () => {
    const fn = window.upload_submit_submission;
    if (typeof fn !== "function" || fn.__ucpnb) return;
    const wrapped = function () {
      start();
      return fn.apply(this, arguments);
    };
    wrapped.__ucpnb = true;
    window.upload_submit_submission = wrapped;
  };
  document.addEventListener("DOMContentLoaded", wrap);
  window.addEventListener("load", wrap);
  // The confirm dialog's OK, in case the function is named differently.
  document.addEventListener(
    "click",
    (e) => {
      const ok = e.target.closest?.(".js-modal-confirm, .uk-modal-dialog .uk-button-primary");
      const dialog = ok?.closest(".uk-modal, .uk-modal-dialog");
      if (dialog && /submit/i.test(dialog.textContent)) start();
    },
    true
  );

  // Leaving the page before the result was worked out (Horizon reloading
  // after submitting): a success so far is carried over to the next page.
  // A submission sent as a whole page (a form) rather than a request.
  document.addEventListener("submit", () => watch && (watch.formSent = true), true);
  window.addEventListener("pagehide", () => {
    if (!watch) return;
    if (!watch.failed && watch.ok > 0 && watch.pending === 0) {
      note(CELEBRATE, String(Date.now()));
    } else if (!watch.failed && watch.formSent) {
      // Judged on the page it leads to.
      note(PENDING, String(Date.now()));
    }
    // Anything else (stopped by Horizon, nothing sent, the student moved
    // on): nothing to celebrate.
  });

  // The page a submission sent as a whole form led to: celebrated unless it
  // shows an error.
  const pendingSince = Number((() => {
    try {
      return sessionStorage.getItem(PENDING);
    } catch {
      return 0;
    }
  })());
  if (pendingSince && Date.now() - pendingSince < 120000) {
    window.addEventListener("load", () => {
      note(PENDING, null);
      if (!pageShowsError() && !FAIL_WORDS.test(document.querySelector("#page_content")?.textContent.slice(0, 3000) ?? "")) {
        note(CELEBRATE, String(Date.now()));
        document.dispatchEvent(new CustomEvent("ucpnb:submitted"));
      }
    });
  } else if (pendingSince) {
    note(PENDING, null);
  }
})();
