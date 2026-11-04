// Fireworks when an assignment is submitted on Horizon (submit-watch.js
// works out that it was, in the page's own world, and says so with
// "ucpnb:submitted", or with a note in sessionStorage when Horizon reloaded
// the page right after). Rockets keep going up and bursting for 5 seconds,
// then the last sparks fall and fade.
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

  // Real fireworks on any screen and at any frame rate: everything moves by
  // the time that has passed (not per frame), each rocket is aimed at a
  // point in the upper part of the screen and bursts there, and the first
  // bursts appear within a moment, so even a page that changes quickly
  // shows proper fireworks.
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
    let w = 0;
    let h = 0;
    let scale = 1; // bursts sized to the screen
    const size = () => {
      w = innerWidth;
      h = innerHeight;
      scale = Math.max(0.6, Math.min(w, h) / 800);
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    size();
    addEventListener("resize", size);

    const GRAVITY = 800; // px/s², rockets
    const SPARK_GRAVITY = 150;
    const rockets = [];
    const sparks = [];
    const rand = (a, b) => a + Math.random() * (b - a);
    const pick = () => COLOURS[Math.floor(Math.random() * (COLOURS.length - 1))]; // not plain white

    function launch() {
      const x = rand(w * 0.1, w * 0.9);
      const targetX = x + rand(-w * 0.08, w * 0.08);
      const targetY = rand(h * 0.12, h * 0.42);
      const rise = h + 10 - targetY;
      const vy = -Math.sqrt(2 * GRAVITY * rise);
      const flight = -vy / GRAVITY;
      rockets.push({ x, y: h + 10, px: x, py: h + 10, vx: (targetX - x) / flight, vy, left: flight, colour: pick() });
    }

    function burst(x, y, colour) {
      const count = calm ? 36 : Math.floor(rand(90, 140));
      const second = Math.random() < 0.4 ? pick() : colour;
      const ring = Math.random() < 0.25; // some bursts are a clean ring
      const power = rand(170, 300) * scale;
      for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 * i) / count + rand(-0.05, 0.05);
        const speed = ring ? power : power * Math.sqrt(Math.random());
        sparks.push({
          x, y, px: x, py: y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: rand(1.1, 1.8),
          age: 0,
          colour: i % 3 === 0 ? second : colour,
          glitter: Math.random() < 0.3,
        });
      }
      // A bright flash at the centre.
      sparks.push({ x, y, px: x, py: y, vx: 0, vy: 0, life: 0.25, age: 0, colour: [255, 255, 255], flash: true });
    }

    const start = performance.now();
    let last = start;
    let nextLaunch = 0;
    // Straight away: two rockets on their way and one burst already open.
    launch();
    launch();
    burst(rand(w * 0.3, w * 0.7), rand(h * 0.18, h * 0.32), pick());

    function frame(now) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const elapsed = now - start;
      if (elapsed < LAUNCH_MS && elapsed >= nextLaunch) {
        launch();
        if (!calm && Math.random() < 0.5) launch();
        nextLaunch = elapsed + rand(calm ? 650 : 260, calm ? 950 : 480);
      }
      // Fade what was drawn, for the streaks behind everything that moves.
      ctx.globalCompositeOperation = "destination-out";
      ctx.fillStyle = `rgba(0, 0, 0, ${Math.min(1, dt * 11)})`;
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = "lighter";
      ctx.lineCap = "round";

      for (let i = rockets.length - 1; i >= 0; i--) {
        const r = rockets[i];
        r.px = r.x;
        r.py = r.y;
        r.x += r.vx * dt;
        r.y += r.vy * dt;
        r.vy += GRAVITY * dt;
        r.left -= dt;
        const [cr, cg, cb] = r.colour;
        ctx.strokeStyle = `rgba(${cr}, ${cg}, ${cb}, 0.9)`;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(r.px, r.py);
        ctx.lineTo(r.x, r.y);
        ctx.stroke();
        if (r.left <= 0) {
          burst(r.x, r.y, r.colour);
          rockets.splice(i, 1);
        }
      }
      const drag = Math.pow(0.35, dt); // sparks slow down as they spread
      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i];
        s.age += dt;
        if (s.age >= s.life) {
          sparks.splice(i, 1);
          continue;
        }
        s.px = s.x;
        s.py = s.y;
        s.vx *= drag;
        s.vy = s.vy * drag + SPARK_GRAVITY * dt;
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        const fade = 1 - s.age / s.life;
        const [cr, cg, cb] = s.colour;
        if (s.flash) {
          const radius = 40 * scale * (0.5 + s.age / s.life);
          const glow = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, radius);
          glow.addColorStop(0, `rgba(255, 255, 255, ${0.8 * fade})`);
          glow.addColorStop(1, "rgba(255, 255, 255, 0)");
          ctx.fillStyle = glow;
          ctx.fillRect(s.x - radius, s.y - radius, radius * 2, radius * 2);
          continue;
        }
        const alpha = s.glitter ? fade * (Math.random() < 0.5 ? 1 : 0.25) : fade;
        ctx.strokeStyle = `rgba(${cr}, ${cg}, ${cb}, ${alpha})`;
        ctx.lineWidth = 2.2 * Math.max(0.6, scale);
        ctx.beginPath();
        ctx.moveTo(s.px, s.py);
        ctx.lineTo(s.x, s.y);
        ctx.stroke();
      }

      canvas.dataset.launching = String(elapsed < LAUNCH_MS);
      canvas.dataset.sparks = String(sparks.length);
      if (elapsed < LAUNCH_MS + FADE_MS || rockets.length || sparks.length) {
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
