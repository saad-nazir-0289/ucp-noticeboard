// Horizon's login page at night (NoticeBoard style; login.css draws it):
// the campus at night with sky lanterns rising (login-night.jpg), a little
// twinkle and neon glow, and a neon "UCP NoticeBoard" sign in the sky. In Original style the scene is
// hidden and Horizon's page shows as it is.
(() => {
  if (!location.pathname.startsWith("/web/login")) return;

  function build() {
    if (document.getElementById("ucpnb-login-scene") || !document.querySelector("form.oe_login_form")) return;
    const scene = document.createElement("div");
    scene.id = "ucpnb-login-scene";
    scene.setAttribute("aria-hidden", "true");
    // The campus at night with sky lanterns (login-night.jpg, in the
    // extension), loaded by the page from the extension.
    const photo = `url("${chrome.runtime.getURL("login-night.jpg")}")`;
    scene.innerHTML = `
      <div class="ucpnb-ls-photo"></div>
      <div class="ucpnb-ls-shade"></div>
      <div class="ucpnb-ls-stars"></div>
      <div class="ucpnb-ls-glow"></div>
      <div class="ucpnb-ls-sign">
        <span class="ucpnb-ls-kicker">Now on Horizon</span>
        <strong><span class="ucpnb-ls-ucp">UCP</span> <span class="ucpnb-ls-nb">Notice<span class="ucpnb-ls-flicker">B</span>oard</span></strong>
        <span class="ucpnb-ls-tag">Every campus notice, in one place</span>
      </div>`;
    scene.querySelector(".ucpnb-ls-photo").style.backgroundImage = photo;
    document.body.prepend(scene);
    document.documentElement.classList.add("ucpnb-login");
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", build, { once: true });
  else build();
})();
