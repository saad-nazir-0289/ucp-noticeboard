// Horizon's login page at night (NoticeBoard style; login.css draws it):
// a photo of the campus at night (login-night.jpg), stars twinkling and
// sky lanterns drifting up over it, and a quiet line about NoticeBoard in
// the bottom-right corner. In Original style the scene is
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
      <div class="ucpnb-ls-credit">
        <span class="ucpnb-ls-kicker">UCP NoticeBoard</span>
        <strong>Every campus notice, in one place.</strong>
        <span class="ucpnb-ls-tag">Societies, events and deadlines, right on your Horizon dashboard.</span>
      </div>`;
    scene.querySelector(".ucpnb-ls-photo").style.backgroundImage = photo;
    // Sky lanterns drifting up over the campus, each its own size, speed,
    // sway and start time.
    const lanterns = document.createElement("div");
    lanterns.className = "ucpnb-ls-lanterns";
    for (let i = 0; i < 22; i++) {
      const lantern = document.createElement("span");
      const size = 10 + Math.random() * 16;
      lantern.style.left = `${4 + Math.random() * 92}%`;
      lantern.style.width = `${size}px`;
      lantern.style.height = `${size * 1.3}px`;
      lantern.style.animationDuration = `${16 + Math.random() * 18}s, ${3 + Math.random() * 3}s`;
      lantern.style.animationDelay = `${-Math.random() * 30}s, ${-Math.random() * 3}s`;
      lantern.style.opacity = String(0.65 + Math.random() * 0.35);
      lanterns.append(lantern);
    }
    scene.querySelector(".ucpnb-ls-glow").before(lanterns);
    document.body.prepend(scene);
    document.documentElement.classList.add("ucpnb-login");
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", build, { once: true });
  else build();
})();
