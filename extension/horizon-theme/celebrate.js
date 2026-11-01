// Fireworks when an assignment is submitted on Horizon (submit-watch.js
// works out that it was, in the page's own world, and says so with
// "ucpnb:submitted", or with a note in sessionStorage when Horizon reloaded
// the page right after). Rockets keep bursting for 5 seconds, then fade.
// Drawn on one canvas over the page that clicks pass through.
(() => {
  const CELEBRATE = "ucpnb_celebrate";
  const LAUNCH_MS = 5000; // keeps bursting this long
  const FADE_MS = 1600; // then the last sparks fall and fade
  const COLOURS = [
    [255, 89, 94], [255, 202, 58], [138, 201, 38], [25, 130, 196], [106, 76, 147],
    [255, 146, 76], [72, 202, 228], [240, 98, 146], [255, 255, 255],
  ];
  let playing = false;

  // The note stays until the show is over, so a reload part-way through
  // (Horizon refreshing the page after submitting) carries on with it.
  const readNote = () => {
    try {
      return Number(sessionStorage.getItem(CELEBRATE));
    } catch {
      return 0;
    }
  };
  const clearNote = () => {
    try {
      sessionStorage.removeItem(CELEBRATE);
    } catch {
      // Nothing to clear.
    }
  };

  function toast() {
    const box = document.createElement("div");
    box.id = "ucpnb-celebrate-toast";
    box.setAttribute("role", "status");
    box.textContent = "🎉 Submitted! Well done.";
    document.body.append(box);
    setTimeout(() => box.classList.add("ucpnb-out"), LAUNCH_MS);
    setTimeout(() => box.remove(), LAUNCH_MS + 600);
  }

  function play() {
    if (playing || !document.body) return;
    playing = true;
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const canvas = document.createElement("canvas");
    canvas.id = "ucpnb-fireworks";
    canvas.setAttribute("aria-hidden", "true");
    document.body.append(canvas);
    toast();
    const ctx = canvas.getContext("2d");
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const size = () => {
      canvas.width = innerWidth * dpr;
      canvas.height = innerHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    size();
    addEventListener("resize", size);

    const rockets = [];
    const sparks = [];
    const start = performance.now();
    let nextLaunch = start;
    const rand = (a, b) => a + Math.random() * (b - a);

    function launch() {
      const w = innerWidth;
      const h = innerHeight;
      rockets.push({
        x: rand(w * 0.12, w * 0.88),
        y: h + 10,
        vx: rand(-1.2, 1.2),
        vy: -rand(h * 0.0135, h * 0.0175), // bursts in the upper part of the screen
        colour: COLOURS[Math.floor(Math.random() * COLOURS.length)],
        trail: [],
      });
    }

    function burst(r) {
      const count = calm ? 28 : Math.floor(rand(55, 85));
      const second = Math.random() < 0.35 ? COLOURS[Math.floor(Math.random() * COLOURS.length)] : r.colour;
      for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 * i) / count + rand(-0.08, 0.08);
        const speed = rand(1.6, 5.2);
        sparks.push({
          x: r.x,
          y: r.y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 1,
          decay: rand(0.011, 0.02),
          colour: i % 2 ? second : r.colour,
          glitter: Math.random() < 0.25,
        });
      }
    }

    function frame(now) {
      const elapsed = now - start;
      if (elapsed < LAUNCH_MS && now >= nextLaunch) {
        launch();
        if (!calm && Math.random() < 0.45) launch();
        nextLaunch = now + rand(calm ? 600 : 220, calm ? 900 : 420);
      }
      // Fade the last frame for trails instead of clearing.
      ctx.globalCompositeOperation = "destination-out";
      ctx.fillStyle = "rgba(0, 0, 0, 0.22)";
      ctx.fillRect(0, 0, innerWidth, innerHeight);
      ctx.globalCompositeOperation = "lighter";

      for (let i = rockets.length - 1; i >= 0; i--) {
        const r = rockets[i];
        r.x += r.vx;
        r.y += r.vy;
        r.vy += 0.16;
        const [cr, cg, cb] = r.colour;
        ctx.fillStyle = `rgba(${cr}, ${cg}, ${cb}, 0.9)`;
        ctx.beginPath();
        ctx.arc(r.x, r.y, 2.4, 0, Math.PI * 2);
        ctx.fill();
        if (r.vy >= -1.2) {
          burst(r);
          rockets.splice(i, 1);
        }
      }
      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i];
        s.x += s.vx;
        s.y += s.vy;
        s.vx *= 0.975;
        s.vy = s.vy * 0.975 + 0.06;
        s.life -= s.decay;
        if (s.life <= 0) {
          sparks.splice(i, 1);
          continue;
        }
        const [cr, cg, cb] = s.colour;
        const alpha = s.glitter ? s.life * (Math.random() < 0.5 ? 1 : 0.3) : s.life;
        ctx.fillStyle = `rgba(${cr}, ${cg}, ${cb}, ${alpha})`;
        ctx.beginPath();
        ctx.arc(s.x, s.y, 1.9, 0, Math.PI * 2);
        ctx.fill();
      }

      canvas.dataset.launching = String(elapsed < LAUNCH_MS);
      if (elapsed < LAUNCH_MS + FADE_MS || rockets.length) {
        requestAnimationFrame(frame);
      } else {
        removeEventListener("resize", size);
        canvas.remove();
        clearNote();
        playing = false;
      }
    }
    requestAnimationFrame(frame);
  }

  document.addEventListener("ucpnb:submitted", play);
  // Horizon reloaded the page right after the submission.
  const fromReload = () => {
    const at = readNote();
    if (at && Date.now() - at < 20000) play();
    else if (at) clearNote();
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", fromReload, { once: true });
  else fromReload();
})();
