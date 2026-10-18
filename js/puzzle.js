// Mode Puzzle : un niveau, un seul trait pour rendre chaque ligne uniforme.
import { generateLevel } from './generator.js';
import { applyPath, isSolved, rowState, cloneBoard, isTile, at, dirtyRowCount } from './board.js';
import { sfx, haptic } from './audio.js';
import { t } from './i18n.js';

export const MAX_HINTS = 3;

export class PuzzleMode {
  constructor(view, ui) {
    this.view = view;
    this.ui = ui; // { onWin(n, hints), onStatus(text, tone), onDirty(count), onShake() }
    this.level = null;
    this.board = null;
    this.hints = 0;
    this.timers = [];
  }

  later(fn, ms) { this.timers.push(setTimeout(fn, ms)); }
  clearTimers() { this.timers.forEach(clearTimeout); this.timers = []; }

  load(n) {
    this.clearTimers();
    this.level = generateLevel(n);
    this.board = cloneBoard(this.level.board);
    this.hints = 0;
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
    if (this.hints >= MAX_HINTS || !this.level) return this.hints;
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
        this.later(() => this.ui.onWin(this.level.n, this.hints), 760);
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

  leave() { this.clearTimers(); this.view.cancelDrawing(); }
}
