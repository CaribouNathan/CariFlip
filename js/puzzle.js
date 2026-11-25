// Mode Puzzle : un niveau, un seul trait pour rendre chaque ligne uniforme.
import { generateLevel } from './generator.js';
import { applyPath, isSolved, rowState, cloneBoard, isTile, at, dirtyRowCount } from './board.js';
import { sfx, haptic } from './audio.js';
import { t } from './i18n.js';

export const MAX_HINTS = 3;

export class PuzzleMode {
  constructor(view, ui) {
    this.view = view;
    this.ui = ui; // { onWin(n, hints, flips, level), onStatus(text, tone), onDirty(count), onShake() }
    this.level = null;
    this.board = null;
    this.hints = 0;
    this.timers = [];
  }

  later(fn, ms) { this.timers.push(setTimeout(fn, ms)); }
  clearTimers() { this.timers.forEach(clearTimeout); this.timers = []; }

  // n : numéro de niveau, ou niveau déjà construit (Puzzle du jour, contre-la-montre).
  load(n) {
    this.clearTimers();
    this.level = typeof n === 'object' ? n : generateLevel(n);
    this.board = cloneBoard(this.level.board);
    this.hints = 0;
    this.replaying = false;
    const v = this.view;
    v.resetAnims();
    v.cancelDrawing();
    v.hintPath = null;
    v.danger = 0;
    v.setBoard(this.board);
    v.enabled = true;
    this.ui.onDirty(dirtyRowCount(this.board));
    this.ui.onStatus(t('game.intro'));
  }

  hint() {
    if (this.hints >= MAX_HINTS || !this.level || this.replaying) return this.hints;
    this.hints++;
    const sol = this.level.solution;
    const len = this.hints === 1 ? 1 : this.hints === 2 ? Math.max(2, Math.ceil(sol.length / 3)) : sol.length;
    this.view.hintPath = sol.slice(0, len);
    const msg = t(`game.hint${this.hints}`);
    this.ui.onStatus(msg, 'hint');
    return this.hints;
  }

  commit(path) {
    const v = this.view;
    // Un tracé qui ne touche aucune tuile (cadre seul) est ignoré.
    if (!path.some(([x, y]) => isTile(at(this.board, x, y)))) return;
    v.enabled = false;
    const flips = path.filter(([x, y]) => isTile(at(this.board, x, y))).length;
    const next = applyPath(this.board, path);
    v.board = next;
    const dur = v.animateFlips(path, next);
    sfx.flip();
    this.later(() => {
      if (isSolved(next)) {
        const rows = [];
        for (let y = 0; y < next.h; y++) if (rowState(next, y) !== null) rows.push(y);
        v.flashRows(rows, 'success', 500);
        sfx.win(); haptic(30);
        this.ui.onDirty(0);
        this.later(() => v.animateClear(rows, 420), 260);
        this.later(() => this.ui.onWin(this.level.n, this.hints, flips, this.level, path), this.ui.winDelay ?? 760);
        return;
      }
      // Échec : on montre les lignes encore mixtes puis on remet la grille d'origine.
      const bad = [];
      for (let y = 0; y < next.h; y++) if (rowState(next, y) === false) bad.push(y);
      v.flashRows(bad, 'danger', 750);
      sfx.fail(); haptic(60);
      this.ui.onShake();
      this.ui.onStatus(t('game.fail', { n: bad.length }), 'fail');
      this.later(() => {
        v.board = this.board;
        const d = v.animateFlips([...path].reverse(), this.board, { stagger: 10, dur: 180 });
        this.later(() => { v.enabled = true; }, d);
      }, 820);
    }, dur + 60);
  }

  // Rejoue un trait enregistré : il se dessine case par case, la grille s'inverse et reste
  // affichée résolue un instant, puis revient à son état de départ.
  replay(path, onDone) {
    if (!this.level || !path || !path.length) return;
    const v = this.view;
    this.clearTimers();
    v.resetAnims(); v.cancelDrawing();
    v.hintPath = null;
    v.enabled = false;
    v.board = this.board;
    v.path = [];
    this.replaying = true;
    const step = Math.max(28, Math.min(90, 2200 / path.length));
    path.forEach((cell, i) => this.later(() => { v.path = path.slice(0, i + 1); if (i % 2 === 0) sfx.step(i / 2); }, 250 + i * step));
    const drawn = 250 + path.length * step + 350;
    this.later(() => {
      const next = applyPath(this.board, path);
      v.path = [];
      v.board = next;
      const dur = v.animateFlips(path, next, { stagger: Math.min(18, 500 / path.length), dur: 200 });
      sfx.flip();
      this.later(() => {
        const rows = [];
        for (let y = 0; y < next.h; y++) if (rowState(next, y) === true) rows.push(y);
        v.flashRows(rows, 'success', 600);
      }, dur + 40);
      this.later(() => {
        v.board = this.board;
        const d = v.animateFlips([...path].reverse(), this.board, { stagger: 6, dur: 160 });
        this.later(() => { this.replaying = false; v.enabled = true; onDone?.(); }, d);
      }, dur + 1500);
    }, drawn);
  }
  stopReplay() {
    if (!this.replaying) return;
    this.replaying = false;
    this.clearTimers();
    this.view.resetAnims(); this.view.path = [];
    this.view.board = this.board;
    this.view.enabled = true;
  }

  leave() { this.clearTimers(); this.replaying = false; this.view.path = []; this.view.cancelDrawing(); }
}
