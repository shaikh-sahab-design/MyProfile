/* Mohammad Adil Shaikh — profile site interactions.
   Mirrors the prototype wiring in the Figma file:
   - nav links / scroll cues move between screens (smooth scroll)
   - "Let's Connect" opens a centred overlay, closes on outside click
   - Google Drive icon opens a small toast that slides in, closes on outside click
   - Experience list scrolls inside its frame with a draggable custom thumb
   - portfolio cards animate on hover (pan, zoom, or step through variants) */
(() => {
  const root = document.documentElement;
  const mobile = window.matchMedia('(max-width: 899px)');
  const noHover = window.matchMedia('(hover: none)');

  /* ---------- Stage scaling (desktop) ---------- */
  function fit() {
    const s = mobile.matches ? 1 : Math.min(window.innerWidth / 1440, window.innerHeight / 1024);
    root.style.setProperty('--s', s.toFixed(4));
    root.style.setProperty('--s-modal', mobile.matches ? 1 : Math.min(1, Math.max(s, 0.6)).toFixed(4));
    syncThumb();
  }
  window.addEventListener('resize', fit);

  /* ---------- Reveal on enter ---------- */
  const screens = document.querySelectorAll('.screen');
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => { if (e.isIntersecting) e.target.classList.add('is-visible'); });
  }, { threshold: 0.25 });
  screens.forEach((s) => io.observe(s));

  /* ---------- About: type the text out the first time the section shows ---------- */
  const aboutBody = document.querySelector('.about__body');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (aboutBody && !reduceMotion.matches) {
    const chars = [];
    aboutBody.querySelectorAll('p').forEach((p) => {
      const text = p.textContent;
      p.textContent = '';
      for (const ch of text) {
        const span = document.createElement('span');
        span.className = 'tw';
        span.textContent = ch;
        p.appendChild(span);
        chars.push(span);
      }
    });
    aboutBody.classList.add('is-typing');
    let n = 0;
    let timer = null;
    const finish = () => {
      clearTimeout(timer);
      chars.forEach((c) => c.classList.add('on'));
      chars.forEach((c) => c.classList.remove('caret'));
      aboutBody.classList.remove('is-typing');
    };
    const step = () => {
      if (n > 0) chars[n - 1].classList.remove('caret');
      if (n >= chars.length) { finish(); return; }
      const c = chars[n++];
      c.classList.add('on', 'caret');
      const ch = c.textContent;
      timer = setTimeout(step, /[.,]/.test(ch) ? 90 : ch === ' ' ? 14 : 9);
    };
    const typeIO = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        typeIO.disconnect();
        setTimeout(step, 500);
      }
    }, { threshold: 0.35 });
    typeIO.observe(document.getElementById('about'));
    aboutBody.addEventListener('click', finish);
  }

  /* ---------- Overlays ---------- */
  const modal = document.getElementById('connect');
  let lastFocus = null;
  function openModal() {
    lastFocus = document.activeElement;
    modal.hidden = false;
    modal.querySelector('a, button').focus();
  }
  function closeModal() {
    modal.hidden = true;
    if (lastFocus) lastFocus.focus();
  }
  document.querySelectorAll('[data-open="connect"]').forEach((b) => b.addEventListener('click', openModal));
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });
  modal.querySelector('[data-close]').addEventListener('click', () => {
    closeModal();
    document.getElementById('home').scrollIntoView({ behavior: 'smooth' });
  });

  const driveBtn = document.querySelector('.social--drive');
  const toast = document.getElementById('drive-toast');
  function setToast(open) {
    toast.hidden = !open;
    driveBtn.setAttribute('aria-expanded', String(open));
  }
  driveBtn.addEventListener('click', (e) => { e.stopPropagation(); setToast(toast.hidden); });
  toast.addEventListener('click', (e) => e.stopPropagation());
  document.addEventListener('click', () => { if (!toast.hidden) setToast(false); });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!modal.hidden) closeModal();
    if (!toast.hidden) setToast(false);
  });

  /* ---------- Experience: custom scrollbar ---------- */
  const list = document.querySelector('.exp__list');
  const track = document.querySelector('.exp__track');
  const thumb = document.querySelector('.exp__thumb');
  function syncThumb() {
    if (!list || mobile.matches) return;
    const max = list.scrollHeight - list.clientHeight;
    const room = track.clientHeight - thumb.offsetHeight;
    thumb.style.top = (max > 0 ? (list.scrollTop / max) * room : 0) + 'px';
  }
  list.addEventListener('scroll', syncThumb, { passive: true });

  thumb.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    thumb.setPointerCapture(e.pointerId);
    thumb.classList.add('is-dragging');
    const scale = parseFloat(getComputedStyle(root).getPropertyValue('--s')) || 1;
    const startY = e.clientY;
    const startTop = list.scrollTop;
    const max = list.scrollHeight - list.clientHeight;
    const room = track.clientHeight - thumb.offsetHeight;
    const move = (ev) => { list.scrollTop = startTop + ((ev.clientY - startY) / scale) * (max / room); };
    const up = () => {
      thumb.classList.remove('is-dragging');
      thumb.removeEventListener('pointermove', move);
      thumb.removeEventListener('pointerup', up);
      thumb.removeEventListener('pointercancel', up);
    };
    thumb.addEventListener('pointermove', move);
    thumb.addEventListener('pointerup', up);
    thumb.addEventListener('pointercancel', up);
  });
  track.addEventListener('pointerdown', (e) => {
    if (e.target !== track) return;
    const rect = track.getBoundingClientRect();
    const ratio = (e.clientY - rect.top) / rect.height;
    list.scrollTo({ top: ratio * (list.scrollHeight - list.clientHeight), behavior: 'smooth' });
  });

  /* ---------- Portfolio: step-through cards ----------
     data-step  : transition time per step (s), single value or list
     data-delay : wait before each step (s), single value or list
     data-back  : fade time back to the first frame on leave (s) */
  const nums = (v) => String(v || '0').split(',').map(Number);
  document.querySelectorAll('.card--slides').forEach((card) => {
    const frames = [...card.querySelectorAll('img')];
    const steps = nums(card.dataset.step);
    const delays = nums(card.dataset.delay);
    const back = Number(card.dataset.back || 0.8);
    let i = 0;
    let timer = null;
    const pick = (arr, n) => arr[Math.min(n, arr.length - 1)];

    function show(n, fade) {
      card.style.setProperty('--fade', fade + 's');
      frames.forEach((f, k) => f.classList.toggle('is-active', k === n));
      i = n;
    }
    function next() {
      if (i >= frames.length - 1) return;
      const n = i;
      timer = setTimeout(() => {
        show(n + 1, pick(steps, n));
        timer = setTimeout(next, pick(steps, n) * 1000);
      }, pick(delays, n) * 1000);
    }
    function start() { clearTimeout(timer); next(); }
    function stop() { clearTimeout(timer); show(0, back); }

    card.addEventListener('mouseenter', start);
    card.addEventListener('mouseleave', stop);
    card.addEventListener('focus', start);
    card.addEventListener('blur', stop);
    card._start = start;
    card._stop = stop;
  });

  /* Touch screens have no hover: play the card animations while they are on screen */
  const cards = document.querySelectorAll('.card');
  const cardIO = new IntersectionObserver((entries) => {
    entries.forEach(({ target, isIntersecting }) => {
      target.classList.toggle('is-hover', isIntersecting);
      if (target._start) (isIntersecting ? target._start : target._stop)();
    });
  }, { threshold: 0.6 });
  function touchMode() {
    cards.forEach((c) => (noHover.matches ? cardIO.observe(c) : cardIO.unobserve(c)));
  }
  noHover.addEventListener?.('change', touchMode);
  touchMode();

  /* Mobile card heights keep the design aspect ratio */
  const colWidth = { 'work__col--1': 410, 'work__col--2': 597, 'work__col--3': 411 };
  cards.forEach((c) => {
    const col = [...c.parentElement.classList].find((k) => colWidth[k]);
    const h = parseFloat(c.style.getPropertyValue('--h'));
    if (col && h) c.style.setProperty('--ar', `${colWidth[col]} / ${h}`);
  });

  mobile.addEventListener?.('change', fit);
  fit();
})();
