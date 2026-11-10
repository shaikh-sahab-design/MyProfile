/* Tech Text effect for the home title.
   Vanilla port of React Bits "TechText" by David Haz (https://reactbits.dev, MIT + Commons Clause).
   Changes from the original: it reads its font size and colour from the <h1> it decorates,
   wraps onto several lines when the title wraps (mobile), and works inside the scaled stage. */
(() => {
  const title = document.querySelector('[data-tech-text]');
  if (!title) return;

  const S = {
    fontFamily: 'Georgia, "Times New Roman", serif',
    fontWeight: 400,
    letterSpacing: -0.03,
    accentColor: '#94a3b8',
    reach: 200,
    softness: 0.7,
    dashLength: 4,
    dashGap: 2,
    strokeWidth: 1.25,
    lineStyle: 'solid',
    reveal: 'letter',
    specks: 6,
    selection: true,
    labels: true,
    draggable: true,
    bounce: 0.75,
    sweep: true,
    speed: 1,
    clickKick: true,
    intro: 'metrics',
    introDuration: 2.6,
    guides: true
  };

  /* Room around the title for guide labels, the selection frame and specks (CSS px, read from CSS) */
  const PAD = { l: 60, r: 120, t: 56, b: 40 };
  const LABEL_FONT = '10px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
  const FALLOFF_STEPS = 8;
  const SPRING = 320;
  const INTRO_DELAY = 0.15;
  const KICK_DECAY = 0.62;

  const approach = (c, t, dt, s) => c + (t - c) * (1 - Math.exp(-dt / s));
  const clamp01 = (v) => Math.min(1, Math.max(0, Number(v) || 0));
  const smoothstep = (e0, e1, v) => { const t = clamp01((v - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };
  const noise = (...values) => {
    let h = 2166136261;
    for (const value of values) {
      h = Math.imul(h ^ (value | 0), 16777619);
      h ^= h >>> 13;
      h = Math.imul(h, 0x5bd1e995);
      h ^= h >>> 15;
    }
    return (h >>> 0) / 4294967296;
  };
  const signed = (v) => (v > 0 ? `+${v}` : v < 0 ? `−${-v}` : '0');

  const text = title.textContent.trim();
  title.setAttribute('aria-label', text);
  const container = document.createElement('div');
  container.className = 'tech-text';
  container.setAttribute('aria-hidden', 'true');
  const canvas = document.createElement('canvas');
  canvas.className = 'tech-text-canvas';
  container.appendChild(canvas);
  title.appendChild(container);
  title.classList.add('has-tech-text');

  const ctx = canvas.getContext('2d');
  const scratch = document.createElement('canvas');
  const scratchCtx = scratch.getContext('2d');
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;

  let width = 1, height = 1, dpr = 1, scale = 1;
  let boxW = 1, fontSize = 60, lineHeight = 85;
  let raf = 0, last = performance.now(), visible = false;
  let layoutKey = '', word = null, glyphs = [];
  let presence = 0, clock = 0, pulse = 0, placed = false, dragging = -1, cursor = '';
  let introClock = 0, introducing = false, fontsReady = !document.fonts, guideAlpha = 0;
  const kicks = [];
  const press = { x: 0, y: 0, time: 0, index: -1 };
  const pointer = { x: 0, y: 0, inside: false };
  const grab = { x: 0, y: 0 };
  const lens = { x: 0, y: 0 };
  const frame = { x1: 0, y1: 0, x2: 0, y2: 0, alpha: 0, index: -1 };

  const fontFor = (size) => `${S.fontWeight} ${size}px ${S.fontFamily}`;
  const palette = () => ({ ink: getComputedStyle(title).getPropertyValue('--ink').trim() || '#111827', accent: S.accentColor });
  const setFont = (target, size) => {
    target.font = fontFor(size);
    if ('letterSpacing' in target) target.letterSpacing = `${S.letterSpacing * size}px`;
    target.textAlign = 'left';
    target.textBaseline = 'alphabetic';
  };

  const sprite = (glyph, stroke, ink) => {
    const pad = Math.ceil(S.strokeWidth * 2 + 4);
    const left = glyph.box.x1 - pad;
    const top = glyph.box.y1 - pad;
    const w = glyph.box.x2 - glyph.box.x1 + pad * 2;
    const h = glyph.box.y2 - glyph.box.y1 + pad * 2;
    const image = document.createElement('canvas');
    image.width = Math.max(1, Math.ceil(w * dpr));
    image.height = Math.max(1, Math.ceil(h * dpr));
    const c = image.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, -left * dpr, -top * dpr);
    setFont(c, word.size);
    if (stroke) {
      c.lineJoin = 'round';
      c.lineWidth = S.strokeWidth * 2;
      c.lineCap = 'butt';
      c.strokeStyle = ink;
      if (S.lineStyle !== 'solid') c.setLineDash([Math.max(1, S.dashLength), Math.max(1, S.dashGap)]);
      c.strokeText(glyph.char, glyph.x, glyph.baseline);
      c.setLineDash([]);
      c.globalCompositeOperation = 'destination-out';
      c.fillStyle = '#000000';
      c.fillText(glyph.char, glyph.x, glyph.baseline);
      c.globalCompositeOperation = 'source-over';
    } else {
      c.fillStyle = ink;
      c.fillText(glyph.char, glyph.x, glyph.baseline);
    }
    return { image, left, top };
  };

  /* Greedy word wrap that matches how the browser wraps the (invisible) h1 text */
  const wrap = (probe) => {
    const words = text.split(' ');
    const lines = [];
    let line = '';
    for (const w of words) {
      const next = line ? `${line} ${w}` : w;
      if (line && probe.measureText(next).width > boxW + 0.5) { lines.push(line); line = w; }
      else line = next;
    }
    if (line) lines.push(line);
    return lines;
  };

  const ensureLayout = (ink) => {
    const key = [fontSize, lineHeight, boxW, ink, width, height, dpr].join('|');
    if (key === layoutKey && word) return word;
    layoutKey = key;
    const probe = scratchCtx;
    const size = fontSize;
    setFont(probe, size);
    word = { size, rows: [] };
    const previous = glyphs;
    glyphs = [];
    let flatIndex = 0;
    wrap(probe).forEach((lineText, r) => {
      const m = probe.measureText(lineText);
      const inkHeight = m.actualBoundingBoxAscent + m.actualBoundingBoxDescent;
      const x = PAD.l + m.actualBoundingBoxLeft;
      const baseline = PAD.t + r * lineHeight + (lineHeight - inkHeight) / 2 + m.actualBoundingBoxAscent;
      const xHeight = baseline - probe.measureText('x').actualBoundingBoxAscent;
      const capHeight = baseline - probe.measureText('H').actualBoundingBoxAscent;
      const ascender = baseline - probe.measureText('d').actualBoundingBoxAscent;
      const descender = baseline + probe.measureText('p').actualBoundingBoxDescent;
      const top = baseline - m.actualBoundingBoxAscent;
      const bottom = baseline + m.actualBoundingBoxDescent;
      const inkTop = Math.min(top, capHeight) - 2;
      const inkBottom = Math.max(bottom, baseline) + 2;
      const row = {
        baseline,
        left: x - m.actualBoundingBoxLeft,
        right: x + m.actualBoundingBoxRight,
        top,
        bottom,
        lines: [
          { y: baseline, label: 'baseline' },
          { y: xHeight, label: 'x-height' },
          { y: capHeight, label: 'cap height' },
          ...(capHeight - ascender > Math.max(11, size * 0.06) ? [{ y: ascender, label: 'ascender' }] : []),
          { y: descender, label: 'descender' }
        ],
        bands: [
          { y0: xHeight, y1: baseline, up: true, order: 0 },
          { y0: capHeight, y1: xHeight, up: true, order: 1 },
          { y0: inkTop, y1: capHeight, up: true, order: 2 },
          { y0: baseline, y1: inkBottom, up: false, order: 1 }
        ].filter((b) => b.y1 - b.y0 > 0.5)
      };
      word.rows.push(row);
      let prefix = '';
      Array.from(lineText).forEach((char) => {
        prefix += char;
        const own = probe.measureText(char);
        const gx = x + probe.measureText(prefix).width - own.width;
        const i = flatIndex++;
        if (!char.trim()) return;
        const base = {
          char,
          x: gx,
          baseline,
          row: r,
          box: {
            x1: gx - own.actualBoundingBoxLeft,
            y1: baseline - own.actualBoundingBoxAscent,
            x2: gx + own.actualBoundingBoxRight,
            y2: baseline + own.actualBoundingBoxDescent
          }
        };
        const kept = previous[glyphs.length];
        glyphs.push({
          ...base,
          offset: kept?.char === char ? kept.offset : { x: 0, y: 0 },
          velocity: { x: 0, y: 0 },
          outline: 0,
          shown: 1,
          index: i,
          fill: sprite(base, false, ink),
          dashes: sprite(base, true, ink)
        });
      });
      flatIndex++;
    });
    const rows = word.rows;
    word.left = Math.min(...rows.map((r) => r.left));
    word.right = Math.max(...rows.map((r) => r.right));
    word.top = rows[0].top;
    word.bottom = rows[rows.length - 1].bottom;
    dragging = -1;
    frame.index = -1;
    return word;
  };

  const glyphAt = (x, y) => {
    if (!word) return -1;
    const row = word.rows.findIndex((r) => y >= r.top - 24 && y <= r.bottom + 24);
    if (row < 0) return -1;
    let best = -1, bestDistance = Infinity;
    glyphs.forEach((g, i) => {
      if (g.row !== row) return;
      const x1 = g.box.x1 + g.offset.x;
      const x2 = g.box.x2 + g.offset.x;
      const d = x < x1 ? x1 - x : x > x2 ? x - x2 : 0;
      if (d < bestDistance) { bestDistance = d; best = i; }
    });
    return bestDistance < 28 ? best : -1;
  };

  const falloff = (target, cx, cy, radius, strength, softness) => {
    const inner = Math.min(1, Math.max(0, 1 - softness));
    const gradient = target.createRadialGradient(cx, cy, 0, cx, cy, radius);
    gradient.addColorStop(0, `rgba(0, 0, 0, ${strength})`);
    if (inner > 0.995) {
      gradient.addColorStop(0.995, `rgba(0, 0, 0, ${strength})`);
      gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
      return gradient;
    }
    for (let i = 0; i <= FALLOFF_STEPS; i++) {
      const t = i / FALLOFF_STEPS;
      const eased = t * t * (3 - 2 * t);
      gradient.addColorStop(inner + (1 - inner) * t, `rgba(0, 0, 0, ${strength * (1 - eased)})`);
    }
    return gradient;
  };

  const blit = (target, art, dx, dy, ox, oy) => {
    target.drawImage(art.image, Math.round((art.left + dx) * dpr - ox), Math.round((art.top + dy) * dpr - oy));
  };

  const drawReveal = () => {
    const radius = S.reach * dpr;
    const cx = lens.x * dpr;
    const cy = lens.y * dpr;
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = falloff(ctx, cx, cy, radius, presence, S.softness);
    ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
    ctx.globalCompositeOperation = 'source-over';
    const x0 = Math.max(0, Math.floor(cx - radius));
    const y0 = Math.max(0, Math.floor(cy - radius));
    const x1 = Math.min(canvas.width, Math.ceil(cx + radius));
    const y1 = Math.min(canvas.height, Math.ceil(cy + radius));
    if (x1 <= x0 || y1 <= y0) return;
    const w = x1 - x0, h = y1 - y0;
    if (scratch.width < w || scratch.height < h) {
      scratch.width = Math.max(scratch.width, w);
      scratch.height = Math.max(scratch.height, h);
    }
    scratchCtx.setTransform(1, 0, 0, 1, 0, 0);
    scratchCtx.globalCompositeOperation = 'source-over';
    scratchCtx.clearRect(0, 0, w, h);
    for (const g of glyphs) blit(scratchCtx, g.dashes, g.offset.x, g.offset.y, x0, y0);
    scratchCtx.globalCompositeOperation = 'destination-in';
    scratchCtx.fillStyle = falloff(scratchCtx, cx - x0, cy - y0, radius, 1, S.softness);
    scratchCtx.fillRect(0, 0, w, h);
    scratchCtx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = presence;
    ctx.drawImage(scratch, 0, 0, w, h, x0, y0, w, h);
    ctx.globalAlpha = 1;
  };

  const crisp = (v) => (Math.round(v * dpr) + 0.5) / dpr;

  const perimeterPoint = (distance, w, h) => {
    let d = ((distance % (2 * (w + h))) + 2 * (w + h)) % (2 * (w + h));
    if (d < w) return [frame.x1 + d, frame.y1, 0, -1];
    d -= w;
    if (d < h) return [frame.x2, frame.y1 + d, 1, 0];
    d -= h;
    if (d < w) return [frame.x2 - d, frame.y2, 0, 1];
    d -= w;
    return [frame.x1, frame.y2 - d, -1, 0];
  };

  const drawSpecks = (a, accent) => {
    const w = frame.x2 - frame.x1;
    const h = frame.y2 - frame.y1;
    if (w < 2 || h < 2) return;
    const perimeter = 2 * (w + h);
    const seed = frame.index + 1;
    const grid = 3;
    ctx.fillStyle = accent;
    ctx.strokeStyle = accent;
    for (let k = 0; k < S.specks; k++) {
      const period = 0.5 + noise(seed, k, 11) * 1.2;
      const t = pulse / period + noise(seed, k, 17);
      const cycle = Math.floor(t);
      const life = t - cycle;
      if (life > 0.7) continue;
      const [px, py, nx, ny] = perimeterPoint(noise(seed, k, cycle) * perimeter, w, h);
      const pick = noise(seed, k, cycle, 2);
      const size = pick < 0.46 ? 2 : pick < 0.7 ? 3 : pick < 0.84 ? 5 : pick < 0.94 ? 8 : 11;
      const large = size >= 8;
      const out = (large ? 9 : 4) + Math.floor(noise(seed, k, cycle, 1) * 5) * grid;
      const x = frame.x1 + Math.round((px + nx * out - frame.x1) / grid) * grid;
      const y = frame.y1 + Math.round((py + ny * out - frame.y1) / grid) * grid;
      const tone = noise(seed, k, cycle, 3);
      const blink = life < 0.06 || (life > 0.32 && life < 0.36) ? 0.35 : 1;
      ctx.globalAlpha = a * (large ? 0.3 + 0.4 * tone : 0.3 + 0.6 * tone) * blink;
      const left = Math.round(x - size / 2);
      const top = Math.round(y - size / 2);
      if (tone < 0.26 || (large && tone < 0.78)) {
        ctx.strokeRect(left + 0.5, top + 0.5, size, size);
        if (large && tone > 0.5) ctx.fillRect(Math.round(x) - 1, Math.round(y) - 1, 2, 2);
      } else {
        ctx.fillRect(left, top, size, size);
      }
    }
    for (let j = 0; j < 2; j++) {
      const head = (pulse * 0.42 * S.speed + j * 0.5) * perimeter;
      for (let i = 0; i < 4; i++) {
        const [x, y] = perimeterPoint(head - i * 6, w, h);
        const size = i === 0 ? 3 : 2;
        ctx.globalAlpha = a * [0.95, 0.55, 0.32, 0.16][i];
        ctx.fillRect(Math.round(x - size / 2), Math.round(y - size / 2), size, size);
      }
    }
    ctx.globalAlpha = 1;
  };

  const drawFrame = (accent) => {
    const g = glyphs[frame.index];
    if (!g || frame.alpha < 0.01) return;
    const a = frame.alpha;
    const x1 = crisp(frame.x1), y1 = crisp(frame.y1), x2 = crisp(frame.x2), y2 = crisp(frame.y2);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = accent;
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1;
    const moved = Math.hypot(g.offset.x, g.offset.y);
    if (moved > 1) {
      const hx = (g.box.x1 + g.box.x2) / 2;
      const hy = (g.box.y1 + g.box.y2) / 2;
      ctx.beginPath();
      ctx.moveTo(hx, hy);
      ctx.lineTo(hx + g.offset.x, hy + g.offset.y);
      ctx.setLineDash([3, 4]);
      ctx.globalAlpha = 0.45 * a;
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.rect(Math.round(hx) - 2, Math.round(hy) - 2, 4, 4);
      ctx.globalAlpha = 0.7 * a;
      ctx.fill();
    }
    ctx.beginPath();
    ctx.rect(x1, y1, x2 - x1, y2 - y1);
    ctx.globalAlpha = 0.5 * a;
    ctx.stroke();
    ctx.beginPath();
    for (const [cx, cy] of [[x1, y1], [x2, y1], [x2, y2], [x1, y2]]) ctx.rect(Math.round(cx) - 2, Math.round(cy) - 2, 5, 5);
    ctx.globalAlpha = 0.95 * a;
    ctx.fill();
    ctx.globalAlpha = 1;
    if (S.specks > 0) drawSpecks(a, accent);
    if (S.labels) {
      ctx.font = LABEL_FONT;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.fillStyle = accent;
      ctx.globalAlpha = 0.62 * a;
      const label = moved > 1
        ? `${signed(Math.round(g.offset.x))}, ${signed(Math.round(-g.offset.y))}`
        : `${g.char}  ${Math.round(g.box.x2 - g.box.x1)} × ${Math.round(g.box.y2 - g.box.y1)}`;
      ctx.fillText(label, Math.round(frame.x1), Math.round(frame.y1) - 7);
      ctx.globalAlpha = 1;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  };

  const drawLines = (accent, alpha, growth, only) => {
    const pad = Math.max(12, word.size * 0.12);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.strokeStyle = accent;
    ctx.fillStyle = accent;
    ctx.lineWidth = 1;
    ctx.font = LABEL_FONT;
    ctx.textBaseline = 'middle';
    word.rows.forEach((row, r) => {
      if (only >= 0 && r !== only) return;
      const x1 = Math.round(row.left - pad);
      const x2 = Math.round(row.right + pad);
      const room = width - x2 > 70;
      ctx.textAlign = room ? 'left' : 'right';
      row.lines.forEach((line, k) => {
        const grow = growth(k);
        if (grow <= 0.001) return;
        const y = crisp(line.y);
        const end = x1 + (x2 - x1) * grow;
        ctx.globalAlpha = alpha * 0.4;
        ctx.beginPath();
        ctx.moveTo(x1, y);
        ctx.lineTo(end, y);
        ctx.stroke();
        ctx.globalAlpha = alpha * 0.9;
        ctx.fillRect(x1 - 1, Math.round(line.y) - 1, 3, 3);
        ctx.fillRect(Math.round(end) - 1, Math.round(line.y) - 1, 3, 3);
        if (S.labels) {
          ctx.globalAlpha = alpha * 0.62 * smoothstep(0.7, 1, grow);
          ctx.fillText(line.label, room ? x2 + 8 : x1 - 8, Math.round(line.y));
        }
      });
    });
    ctx.textAlign = 'left';
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
  };

  const drawFilling = (g, lead, progress) => {
    const art = g.fill;
    const left = Math.floor(art.left * dpr);
    const top = Math.floor(art.top * dpr);
    const w = art.image.width + 2;
    const h = art.image.height + 2;
    const fill = clamp01((progress - 0.24 - 0.28 * lead) / 0.48);
    const rects = [];
    for (const band of word.rows[g.row].bands) {
      const amount = smoothstep(0.3 * band.order, 0.3 * band.order + 0.4, fill);
      if (amount <= 0) continue;
      const span = (band.y1 - band.y0) * amount;
      const y0 = Math.round((band.up ? band.y1 - span : band.y0) * dpr);
      const y1 = Math.round((band.up ? band.y1 : band.y0 + span) * dpr);
      if (y1 > y0) rects.push([y0, y1 - y0]);
    }
    const outline = smoothstep(0.08 + 0.2 * lead, 0.22 + 0.2 * lead, progress);
    if (outline > 0.001) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(left - 2, top - 2, w + 2, h + 2);
      for (const [y, span] of rects) ctx.rect(left - 2, y, w + 2, span);
      ctx.clip('evenodd');
      ctx.globalAlpha = outline;
      blit(ctx, g.dashes, 0, 0, 0, 0);
      ctx.restore();
    }
    if (rects.length) {
      ctx.save();
      ctx.beginPath();
      for (const [y, span] of rects) ctx.rect(left - 2, y, w + 2, span);
      ctx.clip();
      blit(ctx, g.fill, 0, 0, 0, 0);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  };

  const kick = (index) => {
    const strength = (word ? word.size : 120) * 11;
    kicks.push({ index, at: pulse, velocity: strength });
    for (let d = 1; d < glyphs.length; d++) {
      const velocity = strength * Math.pow(KICK_DECAY, d);
      if (velocity < 30) break;
      for (const j of [index - d, index + d]) {
        if (j >= 0 && j < glyphs.length) kicks.push({ index: j, at: pulse + d * 0.055, velocity });
      }
    }
    wake();
  };

  const tick = (now) => {
    raf = 0;
    const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
    last = now;
    const { ink, accent } = palette();
    const view = ensureLayout(ink);
    const damping = 2 * Math.sqrt(SPRING) * (1 - clamp01(S.bounce) * 0.96);

    const introOn = S.intro !== 'none' && !reducedMotion && glyphs.length > 0;
    if (introOn && fontsReady) introClock += dt;
    const progress = introOn ? clamp01((introClock - INTRO_DELAY) / Math.max(0.3, S.introDuration)) : 1;
    introducing = introOn && progress < 1;

    const sweeping = !introducing && S.sweep && !reducedMotion && !pointer.inside && dragging < 0;
    if (sweeping) clock += dt * S.speed;
    pulse += dt;
    let targetX = pointer.x;
    let targetY = pointer.y;
    if (sweeping) {
      /* One full left-right-left pass per row, then move to the next row */
      const lap = (clock * 0.45) / (Math.PI * 2);
      const row = view.rows[Math.floor(lap) % view.rows.length];
      targetX = row.left + (row.right - row.left) * (0.5 - 0.5 * Math.cos(clock * 0.45));
      targetY = row.top + (row.bottom - row.top) * (0.45 + 0.1 * Math.sin(clock * 0.8));
    }
    const active = !introducing && (pointer.inside || sweeping || dragging >= 0);
    if (active && !placed) { lens.x = targetX; lens.y = targetY; }
    if (active) {
      const lag = pointer.inside ? 0.05 : 0.22;
      lens.x = approach(lens.x, targetX, dt, lag);
      lens.y = approach(lens.y, targetY, dt, lag);
    }
    placed = active;
    presence = approach(presence, S.reveal === 'area' && active && dragging < 0 ? 1 : 0, dt, 0.16);

    for (let k = kicks.length - 1; k >= 0; k--) {
      if (kicks[k].at > pulse) continue;
      const g = glyphs[kicks[k].index];
      if (g) g.velocity.y -= kicks[k].velocity;
      kicks.splice(k, 1);
    }

    let moving = false;
    glyphs.forEach((g, i) => {
      if (i === dragging) {
        g.offset.x = approach(g.offset.x, pointer.x - grab.x, dt, 0.03);
        g.offset.y = approach(g.offset.y, pointer.y - grab.y, dt, 0.03);
        g.velocity.x = 0;
        g.velocity.y = 0;
        moving = true;
        return;
      }
      const { offset, velocity } = g;
      if (Math.abs(offset.x) < 0.05 && Math.abs(offset.y) < 0.05 && Math.hypot(velocity.x, velocity.y) < 0.5) {
        offset.x = offset.y = velocity.x = velocity.y = 0;
        return;
      }
      velocity.x += (-SPRING * offset.x - damping * velocity.x) * dt;
      velocity.y += (-SPRING * offset.y - damping * velocity.y) * dt;
      offset.x += velocity.x * dt;
      offset.y += velocity.y * dt;
      moving = true;
    });

    const focus = introducing ? -1 : dragging >= 0 ? dragging : active ? glyphAt(lens.x, lens.y) : -1;
    if (focus >= 0 && S.selection) {
      const g = glyphs[focus];
      const bx1 = g.box.x1 + g.offset.x - 6;
      const by1 = g.box.y1 + g.offset.y - 6;
      const bx2 = g.box.x2 + g.offset.x + 6;
      const by2 = g.box.y2 + g.offset.y + 6;
      if (frame.index < 0 || frame.alpha < 0.02) { frame.x1 = bx1; frame.y1 = by1; frame.x2 = bx2; frame.y2 = by2; }
      const glide = focus === dragging ? 0.02 : 0.08;
      frame.x1 = approach(frame.x1, bx1, dt, glide);
      frame.y1 = approach(frame.y1, by1, dt, glide);
      frame.x2 = approach(frame.x2, bx2, dt, glide);
      frame.y2 = approach(frame.y2, by2, dt, glide);
      frame.index = focus;
    }
    frame.alpha = approach(frame.alpha, focus >= 0 && S.selection ? 1 : 0, dt, 0.1);

    glyphs.forEach((g, i) => {
      const target = !introducing && S.reveal === 'letter' && i === focus && i !== dragging ? 1 : 0;
      g.outline = approach(g.outline, target, dt, 0.09);
      if (Math.abs(g.outline - target) > 0.002) moving = true;
      else g.outline = target;
    });

    guideAlpha = approach(guideAlpha, S.guides && !introducing && (focus >= 0 || presence > 0.4) ? 1 : 0, dt, 0.14);

    const hovering = !introducing && focus >= 0 && pointer.inside;
    const nextCursor = dragging >= 0 ? 'grabbing' : hovering && S.draggable ? 'grab' : hovering && S.clickKick ? 'pointer' : '';
    if (nextCursor !== cursor) { cursor = nextCursor; title.style.cursor = nextCursor; }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const g of glyphs) {
      const moved = Math.hypot(g.offset.x, g.offset.y);
      if (moved > 1) {
        ctx.globalAlpha = Math.min(1, moved / 24) * 0.55;
        blit(ctx, g.dashes, 0, 0, 0, 0);
        ctx.globalAlpha = 1;
      }
    }
    if (introducing && S.intro === 'metrics') {
      drawLines(accent, 1 - smoothstep(0.84, 1, progress), (k) => smoothstep(0.02 + 0.04 * k, 0.2 + 0.04 * k, progress), -1);
    } else if (guideAlpha > 0.005) {
      const row = frame.index >= 0 && glyphs[frame.index] ? glyphs[frame.index].row : -1;
      drawLines(accent, guideAlpha * 0.6, () => 1, row);
    }
    glyphs.forEach((g, i) => {
      if (introducing && S.intro === 'metrics') {
        const lead = glyphs.length > 1 ? i / (glyphs.length - 1) : 0;
        if (progress < 0.72 + 0.28 * lead) { drawFilling(g, lead, progress); return; }
      }
      if (g.outline < 0.999) {
        ctx.globalAlpha = 1 - g.outline;
        blit(ctx, g.fill, g.offset.x, g.offset.y, 0, 0);
      }
      if (g.outline > 0.001) {
        ctx.globalAlpha = g.outline;
        blit(ctx, g.dashes, g.offset.x, g.offset.y, 0, 0);
      }
      ctx.globalAlpha = 1;
    });
    if (presence > 0.001) drawReveal();
    drawFrame(accent);

    const settling = moving || introducing || kicks.length > 0 ||
      (guideAlpha > 0.005 && guideAlpha < 0.995) ||
      (frame.alpha > 0.01 && frame.alpha < 0.99);
    if ((active || settling) && visible) raf = requestAnimationFrame(tick);
  };

  function wake() {
    if (raf || !visible) return;
    last = performance.now();
    raf = requestAnimationFrame(tick);
  }

  /* The desktop stage is CSS-scaled, so measure in unscaled px and render at the on-screen density */
  const resize = () => {
    /* PAD follows the canvas overhang set in CSS (it is smaller on mobile) */
    PAD.l = -container.offsetLeft;
    PAD.t = -container.offsetTop;
    PAD.r = container.offsetWidth - title.clientWidth - PAD.l;
    PAD.b = container.offsetHeight - title.clientHeight - PAD.t;
    const cs = getComputedStyle(title);
    fontSize = parseFloat(cs.fontSize) || 60;
    lineHeight = parseFloat(cs.lineHeight) || fontSize * 1.25;
    boxW = title.clientWidth;
    width = boxW + PAD.l + PAD.r;
    height = title.clientHeight + PAD.t + PAD.b;
    const rect = title.getBoundingClientRect();
    scale = title.offsetWidth ? rect.width / title.offsetWidth : 1;
    dpr = Math.min((window.devicePixelRatio || 1) * scale, 3);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    layoutKey = '';
    wake();
  };

  /* Pointer events come from the h1 itself, so the padding around the canvas never blocks the portrait */
  const locate = (e) => {
    const rect = title.getBoundingClientRect();
    pointer.x = (e.clientX - rect.left) / scale + PAD.l;
    pointer.y = (e.clientY - rect.top) / scale + PAD.t;
  };
  title.addEventListener('pointermove', (e) => { locate(e); pointer.inside = true; wake(); }, { passive: true });
  title.addEventListener('pointerenter', (e) => { locate(e); pointer.inside = true; wake(); }, { passive: true });
  title.addEventListener('pointerleave', () => { if (dragging >= 0) return; pointer.inside = false; wake(); }, { passive: true });
  title.addEventListener('pointerdown', (e) => {
    locate(e);
    pointer.inside = true;
    const primary = e.pointerType !== 'mouse' || e.button === 0;
    const index = introducing || !primary ? -1 : glyphAt(pointer.x, pointer.y);
    press.x = pointer.x; press.y = pointer.y; press.time = performance.now(); press.index = index;
    if (S.draggable && index >= 0) {
      dragging = index;
      grab.x = pointer.x - glyphs[index].offset.x;
      grab.y = pointer.y - glyphs[index].offset.y;
      title.setPointerCapture?.(e.pointerId);
    }
    wake();
  }, { passive: true });
  const onUp = (e) => {
    if (dragging >= 0) {
      dragging = -1;
      title.releasePointerCapture?.(e.pointerId);
      const r = title.getBoundingClientRect();
      pointer.inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    }
    if (e.type === 'pointerup' && press.index >= 0 && S.clickKick && !reducedMotion && performance.now() - press.time < 450) {
      locate(e);
      if (Math.hypot(pointer.x - press.x, pointer.y - press.y) < 6) kick(press.index);
    }
    press.index = -1;
    wake();
  };
  title.addEventListener('pointerup', onUp, { passive: true });
  title.addEventListener('pointercancel', onUp, { passive: true });

  new ResizeObserver(resize).observe(title);
  window.addEventListener('resize', () => requestAnimationFrame(resize));
  new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; wake(); }).observe(container);
  const fontsLoaded = () => { fontsReady = true; layoutKey = ''; wake(); };
  if (document.fonts) {
    document.fonts.load(fontFor(64), text).then(fontsLoaded, fontsLoaded);
  }
  resize();
})();
