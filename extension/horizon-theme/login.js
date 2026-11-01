// Horizon's login page: left exactly as Horizon draws it, with one card in
// the bottom-right corner telling students about NoticeBoard (login.css).
// NoticeBoard style only (html.ucpnb-night, set by theme.js); in Original
// style nothing is added.
(() => {
  if (!location.pathname.startsWith("/web/login")) return;

  function build() {
    if (document.getElementById("ucpnb-login-ad") || !document.querySelector("form.oe_login_form")) return;
    const ad = document.createElement("aside");
    ad.id = "ucpnb-login-ad";
    ad.setAttribute("aria-label", "UCP NoticeBoard");
    ad.innerHTML = `
      <img src="${chrome.runtime.getURL("icon128.png")}" alt="" width="52" height="52" />
      <div>
        <span class="ucpnb-ad-kicker">UCP NoticeBoard</span>
        <strong>Every campus notice, in one place.</strong>
        <span class="ucpnb-ad-text">Societies, events and deadlines, right on your Horizon dashboard after you log in.</span>
      </div>`;
    document.body.append(ad);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", build, { once: true });
  else build();
})();
