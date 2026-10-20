// Mode Challenge (et Entraînement) : des blocs de lignes tombent du haut et s'empilent.
// Seule la zone basse est à portée du doigt ; effacer des lignes fait retomber la pile,
// ce qui ramène à portée les lignes de la réserve. Partie perdue si la pile dépasse la limite.
import { makeBoard, set, isTile, at, BLACK, WHITE, FREE } from './board.js';
import { START_FIGURE, START_SOLUTION, FIRST_DELAY, SEQUENCE } from './sequence.js';
import { sfx, haptic } from './audio.js';
import { t } from './i18n.js';

export const COLS = 9;                // 9 colonnes de tuiles, comme Polarium
export const SPAWN = 1;               // ligne au-dessus de la limite (les blocs entrent par le haut)
export const RESERVE = 7;             // réserve visible mais hors d'atteinte
export const PLAY = 10;               // zone jouable
export const MEGA_LINES = 6;          // seuil du méga-combo (la figure de départ en fait 8)
const W = COLS + 2;
const H = SPAWN + RESERVE + PLAY + 1; // + ligne de cadre en bas
const PLAY_TOP = SPAWN + RESERVE;
const BOTTOM_Y = PLAY_TOP + PLAY - 1;
const MAX_STACK = RESERVE + PLAY;
const yOf = (i) => BOTTOM_Y - i;      // ligne de pile i (0 = tout en bas) -> ligne du plateau

export const MODES = {
  challenge: {
    label: 'Challenge',
    pace: 1,                          // rythme de la vidéo de référence
    fall: (lvl) => Math.min(8, 4 + lvl * 0.3), // lignes par seconde
    linesPerLevel: 10,
    records: true,
  },
  practice: {
    label: 'Entraînement',
    pace: 1.6,                        // même suite de blocs, plus lentement
    fall: () => 3,
    linesPerLevel: Infinity,
    records: false,
  },
};

// Points d'un trait : 1 ligne 100, 2 lignes 300, 3 lignes 600, 4 lignes 1 000…
export const linePoints = (k) => (k * (k + 1) / 2) * 100;

const uniform = (row) => row.every((c) => c === row[0]);
const toRow = (str) => [...str].map((c) => (c === '#' ? BLACK : WHITE));

export class ChallengeMode {
  constructor(view, ui) {
    this.view = view;
    // ui : onHud, onGauge, onCountdown(label|null), onLines(k, chain, points), onBonus(text), onGameOver(result)
    this.ui = ui;
    this.raf = 0;
    this.field = { x0: 1, y0: PLAY_TOP, x1: COLS, y1: BOTTOM_Y };
    this.zones = [{ x0: 1, y0: SPAWN, x1: COLS, y1: PLAY_TOP - 1, tone: 'reserve' }];
    this.reach = { x0: 0, y0: PLAY_TOP, x1: W - 1, y1: H - 1 };
  }

  start(modeKey = 'challenge') {
    this.modeKey = modeKey;
    this.mode = MODES[modeKey];
    this.level = 1;
    // Départ : la figure « 1 » de Polarium, posée au fond, qui s'efface d'un seul trait.
    const h = START_FIGURE.length;
    this.stack = START_FIGURE.map(toRow).reverse();                // pile : index 0 = ligne du bas
    this.startSolution = START_SOLUTION.map(([x, y]) => [x, BOTTOM_Y - h + y]); // coordonnées du plateau
    this.seq = 0;                                                  // prochain bloc de la suite fixe
    this.nextGap = FIRST_DELAY * 1000 * this.mode.pace;
    this.score = 0; this.lines = 0; this.chain = 0; this.maxChain = 0;
    this.piece = null; this.timer = 0;
    this.paused = false; this.over = false; this.busy = false;
    this.countdown = 3.8;
    this.lastLabel = undefined;
    const v = this.view;
    v.resetAnims();
    v.cancelDrawing();
    v.hintPath = null;
    v.piece = null;
    v.limit = { y: SPAWN, gauge: 0 };
    // La réserve (hors d'atteinte) est affichée tassée de moitié : la zone jouable gagne en taille.
    v.setBoard(this.build(), this.field, { zones: this.zones, reach: this.reach, squeeze: { rows: PLAY_TOP, k: 0.5 } });
    v.enabled = false;
    this.hud();
    this.last = performance.now();
    cancelAnimationFrame(this.raf);
    const loop = (t) => { this.tick(t); this.raf = requestAnimationFrame(loop); };
    this.raf = requestAnimationFrame(loop);
  }

  build() {
    const b = makeBoard(W, H, FREE);
    this.stack.forEach((row, i) => {
      const y = yOf(i);
      if (y >= 0) row.forEach((c, x) => set(b, x + 1, y, c));
    });
    this.board = b;
    const over = this.stack.length - PLAY;
    this.view.danger = over > RESERVE - 3 ? Math.min(1, (over - (RESERVE - 3)) / 3) : 0;
    return b;
  }
  refresh() { this.view.board = this.build(); }
  hud() { this.ui.onHud({ score: this.score, level: this.level, lines: this.lines, mode: this.modeKey }); }

  tick(t) {
    const dt = Math.min(0.1, (t - this.last) / 1000);
    this.last = t;
    if (this.paused || this.over) return;

    if (this.countdown > 0) {
      this.countdown -= dt;
      const c = this.countdown;
      const label = c > 2.8 ? '3' : c > 1.8 ? '2' : c > 0.8 ? '1' : c > 0 ? 'go' : null;
      if (label !== this.lastLabel) {
        this.lastLabel = label;
        this.ui.onCountdown(label);
        if (label === 'go') { this.view.enabled = true; sfx.clear(2); }
        else if (label) sfx.step(0);
      }
      return;
    }
    if (this.busy) return; // la pile est figée pendant l'animation d'effacement

    // Cadence de la suite fixe : le compteur tourne aussi pendant la chute du bloc précédent.
    this.timer += dt * 1000;
    this.view.limit.gauge = Math.min(1, this.timer / this.nextGap);
    if (this.piece) {
      const p = this.piece;
      const target = yOf(this.stack.length);
      p.yb = Math.min(target, p.yb + p.speed * dt);
      if (p.yb >= target) this.land();
    } else if (this.timer >= this.nextGap) this.spawn();
  }

  spawn() {
    // Bloc suivant de la suite fixe de Polarium ; à la fin de la suite, elle reprend un peu plus vite.
    const loop = Math.floor(this.seq / SEQUENCE.length);
    const [gap, g] = SEQUENCE[this.seq % SEQUENCE.length];
    this.seq++;
    const rows = g.split('/').map(toRow);
    this.piece = { rows, solution: null, x0: 1, yb: SPAWN - 1, speed: this.mode.fall(this.level) };
    this.view.piece = this.piece;
    this.timer = 0;
    this.nextGap = Math.max(1500, gap * 1000 * this.mode.pace * Math.pow(0.85, loop));
  }

  land() {
    const { rows, solution } = this.piece;
    for (let r = rows.length - 1; r >= 0; r--) this.stack.push(rows[r]);
    // Solution du bloc posé, en coordonnées du plateau (sert aux tests ; y 0 local = ligne au-dessus).
    const topY = yOf(this.stack.length - 1);
    this.lastLanded = solution ? solution.map(([x, y]) => [x, topY - 1 + y]) : null;
    this.piece = null;
    this.view.piece = null;
    this.refresh();
    sfx.push(); haptic(10);
    if (this.stack.length > MAX_STACK) this.gameOver();
  }

  // Bouton « Faire tomber » : le bloc en cours tombe d'un coup, ou le suivant arrive tout de suite.
  rush() {
    if (this.paused || this.over || this.countdown > 0 || this.busy) return;
    if (this.piece) {
      const dist = Math.max(0, yOf(this.stack.length) - this.piece.yb);
      this.score += Math.round(dist) * 5 * this.level;
      this.piece.yb = yOf(this.stack.length);
      this.land();
    } else {
      this.score += 20 * this.level;
      this.spawn();
    }
    this.hud();
  }

  commit(path) {
    if (this.over || this.paused) return;
    const tiles = path.filter(([x, y]) => y >= PLAY_TOP && y <= BOTTOM_Y && isTile(at(this.board, x, y)));
    if (!tiles.length) return;
    this.busy = true;
    this.view.enabled = false;
    for (const [x, y] of tiles) {
      const i = BOTTOM_Y - y, j = x - 1;
      this.stack[i][j] = this.stack[i][j] === BLACK ? WHITE : BLACK;
    }
    this.refresh();
    // Les très longs traits gardent une animation courte (≈ 0,6 s au total).
    const dur = this.view.animateFlips(tiles, this.board, { stagger: Math.min(12, 450 / tiles.length), dur: 160 });
    sfx.flip();
    setTimeout(() => this.resolve(), dur + 30);
  }

  resolve() {
    if (this.over) return;
    const full = [];
    this.stack.forEach((row, i) => { if (uniform(row)) full.push(i); });
    if (!full.length) {
      if (this.chain) this.ui.onChainBroken?.();
      this.chain = 0;
      return this.done();
    }
    const ys = full.map(yOf);
    this.view.flashRows(ys, 'success', 400);
    const d = this.view.animateClear(ys, 300);
    sfx.clear(full.length); haptic(20);
    setTimeout(() => {
      if (this.over) return;
      // Chute visuelle : chaque ligne restante descend du nombre de lignes effacées sous elle.
      const drops = new Map();
      let removedBelow = 0;
      const kept = [];
      this.stack.forEach((row, i) => {
        if (full.includes(i)) { removedBelow++; return; }
        kept.push(row);
        if (removedBelow) drops.set(yOf(kept.length - 1), removedBelow);
      });
      this.stack = kept;
      const k = full.length;
      this.chain++;
      this.maxChain = Math.max(this.maxChain, this.chain);
      // Lignes × niveau, plus un bonus de chaîne qui grandit à chaque bloc effacé à la suite.
      const points = (linePoints(k) + 150 * (this.chain - 1)) * this.level;
      this.score += points;
      this.lines += k;
      this.ui.onLines(k, this.chain, points);
      // Méga-combo : 6 lignes ou plus effacées d'un seul trait.
      if (k >= MEGA_LINES) { const bonus = 5000 * this.level; this.score += bonus; this.ui.onMega?.(k, bonus); }
      if (!this.stack.length) {
        this.score += 1000 * this.level;
        this.ui.onBonus(t('ch.clear'));
      }
      const lvl = Math.min(20, 1 + Math.floor(this.lines / this.mode.linesPerLevel));
      if (lvl > this.level) { this.level = lvl; this.ui.onBonus(t('ch.levelUp', { n: lvl })); }
      this.refresh();
      this.view.animateDrops(drops);
      this.hud();
      this.done();
    }, d);
  }

  done() {
    this.busy = false;
    if (!this.over) this.view.enabled = !this.paused && this.countdown <= 0.8;
  }

  pause() {
    if (this.over || this.paused) return;
    this.paused = true;
    this.view.cancelDrawing();
    this.view.enabled = false;
  }
  resume() {
    if (this.over || !this.paused) return;
    this.paused = false;
    this.last = performance.now();
    this.view.enabled = !this.busy && this.countdown <= 0.8;
  }

  gameOver() {
    this.over = true;
    this.view.cancelDrawing();
    this.view.enabled = false;
    this.view.limit.gauge = 0;
    this.view.flashRows(this.stack.map((_, i) => yOf(i)).filter((y) => y < PLAY_TOP), 'danger', 1200);
    sfx.over(); haptic(120);
    this.ui.onGameOver({ mode: this.modeKey, score: this.score, lines: this.lines, level: this.level, maxChain: this.maxChain });
  }

  stop() { cancelAnimationFrame(this.raf); this.over = true; this.view.cancelDrawing(); this.view.piece = null; }
}

// Note en lettre, à la manière du jeu d'origine (barème propre à CariFlip).
const GRADES = [
  [0, 'E-'], [5000, 'E'], [12000, 'E+'], [25000, 'D-'], [40000, 'D'], [60000, 'D+'],
  [85000, 'C-'], [115000, 'C'], [150000, 'C+'], [200000, 'B-'], [260000, 'B'], [330000, 'B+'],
  [420000, 'A-'], [520000, 'A'], [650000, 'A+'], [800000, 'S'],
];
export function gradeFor(score) {
  let g = GRADES[0][1];
  for (const [min, label] of GRADES) if (score >= min) g = label;
  return g;
}
