// Rendu canvas du plateau + saisie du tracé (doigt, stylet, souris).
import { at, isTile, isTraversable, inBounds, FREE, HOLE } from './board.js';

const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const clamp01 = (t) => Math.max(0, Math.min(1, t));

function readTheme() {
  const s = getComputedStyle(document.documentElement);
  const v = (n) => s.getPropertyValue(n).trim();
  return {
    board: v('--board'), reserve: v('--reserve'), well: v('--well'), dot: v('--dot'),
    dark: v('--tile-dark'), light: v('--tile-light'), lightEdge: v('--tile-light-edge'),
    stroke: v('--stroke'), hint: v('--accent'), danger: v('--danger'), success: v('--success'),
    gauge: v('--gauge'),
  };
}

export class BoardView {
  constructor(canvas, { interactive = true, onStep, onCommit, onStart, onEnd } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.interactive = interactive;
    this.onStep = onStep; this.onCommit = onCommit; this.onStart = onStart; this.onEnd = onEnd;
    this.board = null;
    this.field = null;          // {x0,y0,x1,y1} zone de jeu (fond plein)
    this.zones = [];            // zones de fond supplémentaires [{x0,y0,x1,y1,tone}]
    this.reach = null;          // rectangle où le doigt peut tracer (null = partout)
    this.limit = null;          // {y, gauge 0..1} ligne limite (Challenge)
    this.piece = null;          // {rows, x0, yb} bloc en chute, yb = ligne (réelle) de sa base
    this.path = [];
    this.drawing = false;
    this.enabled = true;
    this.hintPath = null;       // tracé d'indice (pointillés)
    this.flips = new Map();     // index -> {start, dur, from, to}
    this.clears = new Map();    // y -> {start, dur}
    this.flashes = new Map();   // y -> {start, dur, color}
    this.drops = new Map();     // y -> {start, dur, dist} lignes qui retombent après effacement
    this.danger = 0;            // 0..1 teinte d'alerte sur la zone de jeu
    this.theme = readTheme();
    this.dpr = 1;
    this.cell = 0; this.ox = 0; this.oy = 0;
    this.running = false;

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(canvas.parentElement);

    if (interactive) {
      canvas.addEventListener('pointerdown', (e) => this.down(e));
      canvas.addEventListener('pointermove', (e) => this.move(e));
      canvas.addEventListener('pointerup', (e) => this.up(e));
      canvas.addEventListener('pointercancel', (e) => this.up(e));
      canvas.addEventListener('lostpointercapture', (e) => this.up(e));
    }
  }

  refreshTheme() { this.theme = readTheme(); }

  setBoard(board, field, { zones = [], reach = null } = {}) {
    this.board = board;
    this.field = field || { x0: 1, y0: 1, x1: board.w - 2, y1: board.h - 2 };
    this.zones = zones;
    this.reach = reach;
    this.resize();
  }

  resize() {
    if (!this.board) return;
    const parent = this.canvas.parentElement;
    const W = parent.clientWidth, H = parent.clientHeight;
    if (!W || !H) return;
    this.dpr = Math.min(window.devicePixelRatio || 1, 3);
    this.canvas.width = Math.round(W * this.dpr);
    this.canvas.height = Math.round(H * this.dpr);
    this.canvas.style.width = W + 'px';
    this.canvas.style.height = H + 'px';
    const { w, h } = this.board;
    this.cell = Math.floor(Math.min(W / w, H / h, 84));
    this.ox = Math.floor((W - this.cell * w) / 2);
    this.oy = Math.floor((H - this.cell * h) / 2);
    this.draw(performance.now());
  }

  start() {
    if (this.running) return;
    this.running = true;
    const loop = (t) => {
      if (!this.running) return;
      this.draw(t);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
  stop() { this.running = false; }

  // ---------- Saisie ----------
  inReach(x, y) {
    const r = this.reach;
    return !r || (x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1);
  }
  canEnter(x, y) {
    return inBounds(this.board, x, y) && isTraversable(at(this.board, x, y)) && this.inReach(x, y);
  }
  cellAt(e, strict) {
    const r = this.canvas.getBoundingClientRect();
    const px = e.clientX - r.left - this.ox, py = e.clientY - r.top - this.oy;
    const x = Math.floor(px / this.cell), y = Math.floor(py / this.cell);
    if (!inBounds(this.board, x, y)) return null;
    if (strict) {
      // Tolérance aux coins : on n'entre dans une case qu'au plus près de son centre.
      const cx = (x + 0.5) * this.cell, cy = (y + 0.5) * this.cell;
      if (Math.abs(px - cx) > this.cell * 0.42 || Math.abs(py - cy) > this.cell * 0.42) return null;
    }
    return [x, y];
  }
  inPath(x, y) { return this.path.some((p) => p[0] === x && p[1] === y); }

  down(e) {
    if (!this.enabled || !this.board || this.drawing) return;
    const c = this.cellAt(e, false);
    if (!c || !this.canEnter(c[0], c[1])) return;
    e.preventDefault();
    this.canvas.setPointerCapture?.(e.pointerId);
    this.drawing = true;
    this.pointerId = e.pointerId;
    this.path = [c];
    this.onStart?.();
    this.onStep?.(this.path.length, c);
  }

  move(e) {
    if (!this.drawing || e.pointerId !== this.pointerId) return;
    const events = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    for (const ev of (events.length ? events : [e])) { this.track(ev); if (!this.drawing) return; }
  }

  track(e) {
    const target = this.cellAt(e, true);
    if (!target) return;
    let guard = 0;
    while (guard++ < 40) {
      const last = this.path[this.path.length - 1];
      if (last[0] === target[0] && last[1] === target[1]) return;
      const prev = this.path[this.path.length - 2];
      if (prev && prev[0] === target[0] && prev[1] === target[1]) { // retour arrière
        this.path.pop();
        this.onStep?.(this.path.length, prev, true);
        return;
      }
      // Avance d'une case vers la cible (axe dominant d'abord), utile si le doigt va vite.
      const dx = target[0] - last[0], dy = target[1] - last[1];
      const steps = Math.abs(dx) >= Math.abs(dy)
        ? [[Math.sign(dx), 0], [0, Math.sign(dy)]]
        : [[0, Math.sign(dy)], [Math.sign(dx), 0]];
      let moved = false;
      for (const [sx, sy] of steps) {
        if (!sx && !sy) continue;
        const n = [last[0] + sx, last[1] + sy];
        if (!this.canEnter(n[0], n[1]) || this.inPath(n[0], n[1])) continue;
        this.path.push(n);
        this.onStep?.(this.path.length, n, false);
        moved = true;
        break;
      }
      if (!moved) return;
    }
  }

  up(e) {
    if (!this.drawing || (e.pointerId !== undefined && e.pointerId !== this.pointerId)) return;
    this.drawing = false;
    const path = this.path;
    this.path = [];
    this.onEnd?.();
    if (path.length) this.onCommit?.(path);
  }

  // Annule le trait en cours sans rien inverser (bouton ✕ ou interruption du jeu).
  cancelDrawing() {
    const was = this.drawing;
    this.drawing = false;
    this.path = [];
    if (was) {
      try { this.canvas.releasePointerCapture?.(this.pointerId); } catch { /* déjà relâché */ }
      this.onEnd?.();
    }
    return was;
  }

  // ---------- Animations ----------
  animateFlips(path, board, { stagger = 18, dur = 220 } = {}) {
    const now = performance.now();
    let i = 0, end = now;
    for (const [x, y] of path) {
      const c = at(board, x, y);
      if (!isTile(c)) continue;
      const start = now + i * stagger;
      this.flips.set(y * board.w + x, { start, dur, to: c, from: c === 'B' ? 'W' : 'B' });
      end = Math.max(end, start + dur);
      i++;
    }
    return end - now;
  }
  animateClear(rows, dur = 340) {
    const now = performance.now();
    for (const y of rows) this.clears.set(y, { start: now, dur });
    return dur;
  }
  flashRows(rows, color, dur = 700) {
    const now = performance.now();
    for (const y of rows) this.flashes.set(y, { start: now, dur, color });
  }
  // Fait retomber des lignes : dropMap y -> nombre de cases de chute.
  animateDrops(dropMap, dur = 200) {
    const now = performance.now();
    for (const [y, dist] of dropMap) if (dist > 0) this.drops.set(y, { start: now, dur: dur + dist * 25, dist });
  }
  resetAnims() { this.flips.clear(); this.clears.clear(); this.flashes.clear(); this.drops.clear(); }

  // ---------- Dessin ----------
  rr(x, y, w, h, r) {
    const c = this.ctx;
    c.beginPath();
    c.roundRect ? c.roundRect(x, y, w, h, r) : c.rect(x, y, w, h);
  }

  zoneRect(z) {
    const s = this.cell;
    return [z.x0 * s, z.y0 * s, (z.x1 - z.x0 + 1) * s, (z.y1 - z.y0 + 1) * s];
  }

  tile(color, px, py, sx = 1, sy = 1, alpha = 1) {
    const c = this.ctx, s = this.cell, T = this.theme;
    const gap = Math.max(2, s * 0.08), rad = s * 0.18;
    const tw = (s - 2 * gap) * sx, th = (s - 2 * gap) * sy;
    c.globalAlpha = alpha;
    this.rr(px + (s - tw) / 2, py + (s - th) / 2, tw, th, rad * Math.min(sx, 1));
    c.fillStyle = color === 'B' ? T.dark : T.light;
    c.fill();
    if (color === 'W') { c.lineWidth = 1; c.strokeStyle = T.lightEdge; c.stroke(); }
    c.globalAlpha = 1;
  }

  draw(now) {
    const c = this.ctx, b = this.board, T = this.theme;
    if (!b || !this.cell) return;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.clearRect(0, 0, this.canvas.width, this.canvas.height);
    const s = this.cell;
    c.save();
    c.translate(this.ox, this.oy);

    // Fonds : zones secondaires (réserve) puis zone de jeu.
    for (const z of this.zones) {
      const [zx, zy, zw, zh] = this.zoneRect(z);
      this.rr(zx - s * 0.08, zy - s * 0.08, zw + s * 0.16, zh + s * 0.16, s * 0.22);
      c.fillStyle = z.tone === 'reserve' ? T.reserve : T.board; c.fill();
    }
    const f = this.field;
    const [fx, fy, fw, fh] = this.zoneRect(f);
    this.rr(fx - s * 0.08, fy - s * 0.08, fw + s * 0.16, fh + s * 0.16, s * 0.22);
    c.fillStyle = T.board; c.fill();
    if (this.danger > 0) {
      c.globalAlpha = 0.2 * this.danger;
      c.fillStyle = T.danger; c.fill();
      c.globalAlpha = 1;
    }

    const gap = Math.max(2, s * 0.08), rad = s * 0.18;
    for (let y = 0; y < b.h; y++) {
      const clear = this.clears.get(y);
      let rowScale = 1, rowAlpha = 1;
      if (clear) {
        const t = clamp01((now - clear.start) / clear.dur);
        rowScale = 1 - easeOut(t) * 0.6; rowAlpha = 1 - t;
      }
      let dropY = 0;
      const drop = this.drops.get(y);
      if (drop) {
        const t = clamp01((now - drop.start) / drop.dur);
        dropY = -(1 - easeOut(t)) * drop.dist * s;
        if (t >= 1) this.drops.delete(y);
      }
      for (let x = 0; x < b.w; x++) {
        const v = at(b, x, y);
        const px = x * s, py = y * s;
        const inField = x >= f.x0 && x <= f.x1 && y >= f.y0 && y <= f.y1;
        if (v === FREE) {
          // Cadre traversable : un point discret signale qu'on peut y passer.
          if (!inField && this.inReach(x, y) && !this.zones.some((z) => x >= z.x0 && x <= z.x1 && y >= z.y0 && y <= z.y1)) {
            c.fillStyle = T.dot;
            c.beginPath(); c.arc(px + s / 2, py + s / 2, Math.max(1.5, s * 0.06), 0, Math.PI * 2); c.fill();
          }
          continue;
        }
        if (v === HOLE) {
          // Case creuse : contour pointillé sur fond enfoncé, impossible à confondre avec une tuile.
          const ins = gap + s * 0.06;
          this.rr(px + ins, py + ins, s - 2 * ins, s - 2 * ins, rad);
          c.fillStyle = T.well; c.fill();
          c.setLineDash([Math.max(2, s * 0.08), Math.max(2, s * 0.07)]);
          c.lineWidth = Math.max(1.5, s * 0.04); c.strokeStyle = T.dot; c.stroke();
          c.setLineDash([]);
          continue;
        }
        let color = v, sx = 1;
        const fl = this.flips.get(y * b.w + x);
        if (fl) {
          const t = clamp01((now - fl.start) / fl.dur);
          if (t < 0.5) { color = fl.from; sx = Math.cos(t * Math.PI); }
          else { color = fl.to; sx = -Math.cos(t * Math.PI); }
          if (t >= 1) this.flips.delete(y * b.w + x);
        }
        sx = Math.max(0.04, Math.abs(sx)) * rowScale;
        this.tile(color, px, py + dropY, sx, rowScale, rowAlpha);
      }
      if (clear && now - clear.start >= clear.dur) this.clears.delete(y);
    }

    // Lignes mises en évidence (réussite / échec).
    for (const [y, fl] of this.flashes) {
      const t = clamp01((now - fl.start) / fl.dur);
      if (t >= 1) { this.flashes.delete(y); continue; }
      c.globalAlpha = 0.35 * (1 - t);
      this.rr(fx, y * s + gap / 2, fw, s - gap, rad);
      c.fillStyle = fl.color === 'danger' ? T.danger : T.success;
      c.fill();
      c.globalAlpha = 1;
    }

    // Bloc en chute (Challenge) : dessiné par-dessus, rogné en haut du canvas.
    if (this.piece) {
      const { rows, x0, yb } = this.piece;
      const n = rows.length;
      rows.forEach((row, i) => {
        const py = (yb - (n - 1 - i)) * s;
        row.forEach((col, j) => this.tile(col, (x0 + j) * s, py));
      });
    }

    // Ligne limite + jauge d'arrivée du prochain bloc.
    if (this.limit) {
      const ly = this.limit.y * s - s * 0.3;
      const lx = fx - s * 0.08, lw = fw + s * 0.16, lh = Math.max(5, s * 0.24);
      this.rr(lx, ly, lw, lh, lh / 2);
      c.fillStyle = T.danger; c.fill();
      const g = clamp01(this.limit.gauge || 0);
      if (g > 0) {
        this.rr(lx, ly, lw * g, lh, lh / 2);
        c.fillStyle = T.gauge; c.fill();
      }
    }

    if (this.hintPath && this.hintPath.length) this.drawLine(this.hintPath, T.hint, 0.55, now, true);
    if (this.path.length) this.drawLine(this.path, T.stroke, 0.95, now, false);
    c.restore();
  }

  drawLine(path, color, alpha, now, dashed) {
    const c = this.ctx, s = this.cell;
    const pts = path.map(([x, y]) => [x * s + s / 2, y * s + s / 2]);
    c.save();
    c.globalAlpha = alpha;
    c.strokeStyle = color; c.fillStyle = color;
    c.lineCap = 'round'; c.lineJoin = 'round';
    c.lineWidth = Math.max(4, s * 0.22);
    if (dashed) { c.setLineDash([s * 0.18, s * 0.22]); c.lineDashOffset = -now / 40; }
    c.beginPath();
    pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
    if (pts.length === 1) c.lineTo(pts[0][0] + 0.01, pts[0][1]);
    c.stroke();
    c.setLineDash([]);
    // Départ : disque plein, plus un anneau autour de la case pour le repérer sous le doigt.
    const pulse = dashed ? 1 + 0.15 * Math.sin(now / 160) : 1;
    c.beginPath(); c.arc(pts[0][0], pts[0][1], Math.max(6, s * 0.2) * pulse, 0, Math.PI * 2); c.fill();
    if (!dashed) {
      c.globalAlpha = 1;
      c.lineWidth = Math.max(2, s * 0.07);
      const [x0, y0] = path[0];
      this.rr(x0 * s + s * 0.04, y0 * s + s * 0.04, s * 0.92, s * 0.92, s * 0.22);
      c.stroke();
    }
    c.restore();
  }
}
