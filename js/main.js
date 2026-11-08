/* Олива demo: scroll-scrubbed frame sequences on canvas + scroll-linked text layers. */
(() => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const DPR = Math.min(window.devicePixelRatio || 1, 2);

  // ---------- Smooth scroll ----------
  let lenis = null;
  if (!reduce && window.Lenis) {
    lenis = new Lenis({ lerp: 0.09, smoothWheel: true });
    window.__lenis = lenis;
    const raf = (t) => { lenis.raf(t); requestAnimationFrame(raf); };
    requestAnimationFrame(raf);
  }

  // ---------- Sequences ----------
  const portrait = () => innerWidth / innerHeight < 1;
  const scenes = [...document.querySelectorAll('.scrub')].map((el) => {
    const canvas = el.querySelector('.scrub-canvas');
    return {
      el, canvas, ctx: canvas.getContext('2d'),
      name: el.dataset.seq, bg: el.dataset.bg || '#000',
      counts: { d: +el.dataset.d, m: +el.dataset.m },
      mobileZoom: +el.dataset.mobileZoom || 0, edge: null,
      variant: null, frames: [], loading: false, last: -1, progress: 0,
      layers: [...el.querySelectorAll('[data-show]')],
      fadeIn: [...el.querySelectorAll('[data-fade]')],
      fadeOut: [...el.querySelectorAll('[data-fade-out]')],
    };
  });

  // Load order: first frame, then coarse-to-fine strides so scrubbing works before everything arrives.
  function loadOrder(n) {
    const order = [], seen = new Set();
    for (const stride of [n, 16, 8, 4, 2, 1]) {
      for (let i = 0; i < n; i += stride) if (!seen.has(i)) { seen.add(i); order.push(i); }
    }
    if (!seen.has(n - 1)) order.push(n - 1);
    return order;
  }

  function load(scene) {
    // scenes with data-mobile-zoom keep the wide frames on phones and zoom them instead of cropping to 9:16
    const variant = portrait() && !scene.mobileZoom ? 'm' : 'd';
    if (scene.variant === variant) return;
    scene.variant = variant;
    const n = scene.counts[variant];
    scene.frames = new Array(n).fill(null);
    scene.last = -1;
    const queue = loadOrder(n);
    let active = 0;
    const next = () => {
      if (scene.variant !== variant) return;
      while (active < 6 && queue.length) {
        const i = queue.shift();
        const img = new Image();
        img.decoding = 'async';
        active++;
        img.onload = () => { scene.frames[i] = img; active--; if (i === 0 || scene.last === -1) draw(scene, true); next(); };
        img.onerror = () => { active--; next(); };
        img.src = `frames/${scene.name}/${variant}/${String(i + 1).padStart(4, '0')}.webp`;
      }
    };
    next();
  }

  function nearestLoaded(frames, i) {
    if (frames[i]) return i;
    for (let d = 1; d < frames.length; d++) {
      if (frames[i - d]) return i - d;
      if (frames[i + d]) return i + d;
    }
    return -1;
  }

  // average colour of the top and bottom rows of a frame, to extend its studio backdrop seamlessly
  function edgeColors(img) {
    const c = document.createElement('canvas');
    c.width = 32; c.height = 18;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(img, 0, 0, 32, 18);
    const row = (y) => {
      const d = x.getImageData(0, y, 32, 1).data;
      let r = 0, g = 0, b = 0;
      for (let k = 0; k < d.length; k += 4) { r += d[k]; g += d[k + 1]; b += d[k + 2]; }
      const n = d.length / 4;
      return `rgb(${r / n | 0} ${g / n | 0} ${b / n | 0})`;
    };
    return [row(0), row(17)];
  }

  function size(scene) {
    const { canvas } = scene;
    const w = Math.round(canvas.clientWidth * DPR), h = Math.round(canvas.clientHeight * DPR);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; scene.last = -1; }
  }

  function draw(scene, force = false) {
    const n = scene.frames.length;
    if (!n) return;
    const want = Math.round(scene.progress * (n - 1));
    const i = nearestLoaded(scene.frames, want);
    if (i < 0 || (i === scene.last && !force)) return;
    scene.last = i;
    const img = scene.frames[i], { ctx, canvas } = scene;
    const zoomed = scene.mobileZoom && portrait();
    const s = zoomed
      ? (canvas.width / img.naturalWidth) * scene.mobileZoom
      : Math.max(canvas.width / img.naturalWidth, canvas.height / img.naturalHeight);
    const w = img.naturalWidth * s, h = img.naturalHeight * s;
    if (zoomed) {
      if (!scene.edge) scene.edge = edgeColors(img);
      const g = ctx.createLinearGradient(0, 0, 0, canvas.height);
      g.addColorStop(0, scene.edge[0]);
      g.addColorStop(1, scene.edge[1]);
      ctx.fillStyle = g;
    } else ctx.fillStyle = scene.bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const x = (canvas.width - w) / 2, y = (canvas.height - h) / 2;
    ctx.drawImage(img, x, y, w, h);
    if (zoomed) {
      // feather the frame's top and bottom edges into the extended backdrop
      const f = h * 0.14;
      const top = ctx.createLinearGradient(0, y, 0, y + f);
      top.addColorStop(0, scene.edge[0]); top.addColorStop(1, scene.edge[0].replace(')', ' / 0)'));
      ctx.fillStyle = top; ctx.fillRect(0, y - 1, canvas.width, f + 1);
      const bot = ctx.createLinearGradient(0, y + h - f, 0, y + h);
      bot.addColorStop(0, scene.edge[1].replace(')', ' / 0)')); bot.addColorStop(1, scene.edge[1]);
      ctx.fillStyle = bot; ctx.fillRect(0, y + h - f, canvas.width, f + 1);
    }
  }

  // ---------- Scroll-linked layers ----------
  const range = (el, attr) => el.getAttribute(attr).split(' ').map(Number);
  const EDGE = 0.06;

  function layers(scene) {
    const p = scene.progress;
    for (const el of scene.layers) {
      const [a, b] = range(el, 'data-show');
      // a <= 0: visible from the very start; b >= 1: stays visible to the end
      const tin = a <= 0 ? 1 : clamp((p - a) / EDGE);
      const tout = b >= 1 ? 1 : clamp((b - p) / EDGE);
      const t = Math.min(tin, tout);
      el.style.opacity = t;
      el.style.visibility = t <= 0 ? 'hidden' : 'visible';
      if (!el.matches('li')) el.style.translate = `0 ${(1 - t) * 24}px`;
    }
    for (const el of scene.fadeIn) { const [a, b] = range(el, 'data-fade'); el.style.opacity = clamp((p - a) / (b - a)); }
    for (const el of scene.fadeOut) { const [a, b] = range(el, 'data-fade-out'); el.style.opacity = 1 - clamp((p - a) / (b - a)); }
  }

  // ---------- Frame loop ----------
  const header = document.querySelector('.top');
  const hero = scenes.find((s) => s.name === 'hero');

  function tick() {
    const vh = innerHeight;
    for (const scene of scenes) {
      const r = scene.el.getBoundingClientRect();
      const near = r.top < vh * 3 && r.bottom > -vh;
      if (near) load(scene);
      if (r.bottom < 0 || r.top > vh) continue;
      scene.progress = clamp(-r.top / (r.height - vh));
      size(scene);
      draw(scene);
      layers(scene);
    }
    if (hero) header.classList.toggle('is-light', hero.el.getBoundingClientRect().bottom < innerHeight * 0.55);
    requestAnimationFrame(tick);
  }
  load(hero);
  requestAnimationFrame(tick);
  addEventListener('resize', () => scenes.forEach((s) => { s.last = -1; if (s.variant) { s.variant = null; } }));

  // ---------- Reveal images ----------
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
  }, { threshold: 0.2 });
  document.querySelectorAll('.service-img').forEach((el) => io.observe(el));

  // ---------- Booking ----------
  const toast = document.querySelector('.toast');
  let toastTimer;
  document.querySelectorAll('.js-max').forEach((a) => a.addEventListener('click', (e) => {
    e.preventDefault();
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.hidden = true; }, 4200);
  }));
  document.querySelectorAll('a[href^="#"]').forEach((a) => a.addEventListener('click', (e) => {
    const id = a.getAttribute('href');
    if (id.length < 2 || a.classList.contains('js-max')) return;
    const target = document.querySelector(id);
    if (!target) return;
    e.preventDefault();
    if (lenis) lenis.scrollTo(target, { offset: 0, duration: 1.6 });
    else target.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' });
  }));
})();
