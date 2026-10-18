// CariFlip — navigation entre écrans et liaison interface / modes de jeu.
import { BoardView } from './renderer.js';
import { PuzzleMode, MAX_HINTS } from './puzzle.js';
import { ChallengeMode, MODES, gradeFor } from './challenge.js';
import { LEVEL_COUNT, CHAPTER_SIZE, levelParams } from './generator.js';
import { store, save, markSolved, isSolvedLevel, isUnlocked, solvedCount, highestSolved, addRecord } from './storage.js';
import { sfx, haptic } from './audio.js';
import { makeBoard, set, applyPath } from './board.js';
import { t, fmtNum, fmtDate, applyStatic, setLangPref, onLangChange } from './i18n.js';

export const VERSION = '1.4.1';
const $ = (s) => document.querySelector(s);
const fmt = (n) => fmtNum(n);

// ---------- Navigation ----------
const screens = ['home', 'settings', 'levels', 'game', 'cmenu', 'challenge', 'howto'];
const stack = ['home'];
const hooks = {};
const current = () => stack[stack.length - 1];

function show(id) {
  for (const s of screens) $('#' + s).hidden = s !== id;
}
function go(id, arg) {
  hooks[current()]?.leave?.();
  stack.push(id);
  history.pushState({ depth: stack.length }, '');
  show(id);
  hooks[id]?.enter?.(arg);
}
function back() {
  if (stack.length <= 1) return;
  hooks[current()]?.leave?.();
  stack.pop();
  show(current());
  hooks[current()]?.enter?.();
}
// Bouton retour Android / geste retour : même effet que la flèche de l'app.
window.addEventListener('popstate', () => {
  if (!sheet.hidden && sheet.dataset.locked) { history.pushState({ depth: stack.length }, ''); return; }
  if (!sheet.hidden) closeSheet();
  if (current() === 'challenge' && hooks.challenge.intercept()) { history.pushState({ depth: stack.length }, ''); return; }
  back();
});
document.addEventListener('click', (e) => {
  if (e.target.closest('[data-back]')) history.back();
});

// ---------- Fenêtre modale ----------
const sheet = $('#sheet');
function openSheet({ badge = '', badgeClass = '', title, body = '', actions, locked = false }) {
  $('#sheet-badge').innerHTML = badge;
  $('#sheet-badge').className = 'sheet-badge' + (badgeClass ? ' ' + badgeClass : '');
  $('#sheet-title').textContent = title;
  $('#sheet-body').textContent = body;
  const box = $('#sheet-actions');
  box.innerHTML = '';
  actions.forEach(({ label, primary, run }) => {
    const b = document.createElement('button');
    b.className = 'btn' + (primary ? ' primary' : '');
    b.textContent = label;
    b.addEventListener('click', () => { closeSheet(); run?.(); });
    box.appendChild(b);
  });
  sheet.dataset.locked = locked ? '1' : '';
  sheet.hidden = false;
  box.querySelector('.btn')?.focus();
}
function closeSheet() { sheet.hidden = true; }

// ---------- Accueil ----------
function refreshHome() {
  const n = solvedCount();
  $('#puzzle-progress').textContent = n ? t('home.progress', { n, total: LEVEL_COUNT }) : t('home.levels', { n: LEVEL_COUNT });
  $('#best-score').textContent = store.best ? t('home.best', { s: fmt(store.best) }) : t('home.challengeSub');
}
hooks.home = { enter: refreshHome };
$('#version').textContent = VERSION;
$('#go-puzzle').addEventListener('click', () => {
  go('levels', true);
  // Première fois : le tutoriel s'ouvre par-dessus la liste, « Compris » y ramène.
  if (!store.tutorialSeen) { store.tutorialSeen = true; save(); go('howto'); }
});
$('#go-challenge').addEventListener('click', () => go('cmenu'));
$('#go-howto').addEventListener('click', () => go('howto'));
$('#go-settings').addEventListener('click', () => go('settings'));

// ---------- Réglages ----------
const THEME_COLORS = { light: '#F2F2F7', dark: '#000000' };
function applyTheme() {
  const root = document.documentElement;
  const metas = document.querySelectorAll('meta[name="theme-color"]');
  if (store.theme === 'light' || store.theme === 'dark') {
    root.dataset.theme = store.theme;
    metas.forEach((m) => { m.content = THEME_COLORS[store.theme]; });
  } else {
    delete root.dataset.theme;
    metas.forEach((m) => { m.content = m.media.includes('dark') ? THEME_COLORS.dark : THEME_COLORS.light; });
  }
  // Les canvas relisent leurs couleurs.
  refreshCanvases();
}
function refreshCanvases() { [puzzleView, challengeView, ...demos].forEach((v) => v && v.refreshTheme()); }
function bindSeg(id, value, onPick) {
  const seg = $(id);
  const paint = (v) => seg.querySelectorAll('button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.value === v)));
  seg.querySelectorAll('button').forEach((b) => {
    b.setAttribute('role', 'radio');
    b.addEventListener('click', () => { paint(b.dataset.value); onPick(b.dataset.value); });
  });
  paint(value);
}
bindSeg('#seg-lang', store.lang || 'auto', (v) => setLangPref(v));
bindSeg('#seg-theme', store.theme || 'auto', (v) => { store.theme = v; save(); applyTheme(); });

const optSound = $('#opt-sound'), optHaptics = $('#opt-haptics');
optSound.checked = store.sound;
optHaptics.checked = store.haptics;
optSound.addEventListener('change', () => { store.sound = optSound.checked; save(); if (store.sound) sfx.clear(1); });
optHaptics.addEventListener('change', () => { store.haptics = optHaptics.checked; save(); haptic(20); });
if (!navigator.vibrate) $('#haptics-row').hidden = true;

// ---------- Niveaux ----------
let chapter = Math.floor((Math.max(1, store.lastLevel) - 1) / CHAPTER_SIZE);
const chapterCount = Math.ceil(LEVEL_COUNT / CHAPTER_SIZE);

function renderChapters() {
  const box = $('#chapters');
  box.innerHTML = '';
  for (let c = 0; c < chapterCount; c++) {
    const a = c * CHAPTER_SIZE + 1, z = Math.min(LEVEL_COUNT, a + CHAPTER_SIZE - 1);
    let done = 0;
    for (let n = a; n <= z; n++) if (isSolvedLevel(n)) done++;
    const b = document.createElement('button');
    b.className = 'chapter';
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-selected', String(c === chapter));
    b.innerHTML = `${a}–${z}${done ? `<span class="done">${done}/${z - a + 1}</span>` : ''}`;
    b.addEventListener('click', () => { chapter = c; renderLevels(); });
    box.appendChild(b);
  }
  box.children[chapter]?.scrollIntoView({ block: 'nearest', inline: 'center' });
}

function renderLevels() {
  renderChapters();
  const a = chapter * CHAPTER_SIZE + 1;
  const p = levelParams(a);
  $('#chapter-caption').textContent = t('levels.caption', { w: p.W, h: p.H, holes: !!p.holes[1] });
  const grid = $('#level-grid');
  grid.innerHTML = '';
  const next = highestSolved() + 1;
  for (let n = a; n < a + CHAPTER_SIZE && n <= LEVEL_COUNT; n++) {
    const b = document.createElement('button');
    b.className = 'level';
    const solved = store.solved[n];
    if (!isUnlocked(n)) {
      b.disabled = true;
      b.innerHTML = '<svg><use href="#i-lock"/></svg>';
      b.setAttribute('aria-label', t('levels.locked', { n }));
    } else {
      b.innerHTML = `<span>${n}</span>`;
      if (solved) {
        b.classList.add('solved');
        if (solved.hints === 0) b.classList.add('perfect');
        b.innerHTML += `<svg class="mark"><use href="#i-${solved.hints === 0 ? 'star' : 'check'}"/></svg>`;
      }
      if (n === next) b.classList.add('current');
      b.setAttribute('aria-label', t('levels.item', { n, solved: !!solved }));
      b.addEventListener('click', () => go('game', n));
    }
    grid.appendChild(b);
  }
}
hooks.levels = {
  enter: (fromHome) => {
    // Depuis l'accueil : on ouvre le chapitre du prochain niveau à résoudre.
    if (fromHome) chapter = Math.floor((Math.min(highestSolved() + 1, LEVEL_COUNT) - 1) / CHAPTER_SIZE);
    renderLevels();
  },
};

// ---------- Puzzle ----------
const puzzleView = new BoardView($('#puzzle-canvas'), {
  onStep: (len, cell, backward) => { backward ? sfx.back() : sfx.step(len); haptic(5); },
  onStart: () => $('#game').classList.add('drawing'),
  onEnd: () => $('#game').classList.remove('drawing'),
  onCommit: (path) => puzzle.commit(path),
});
const statusEl = $('#game-status');
const puzzle = new PuzzleMode(puzzleView, {
  onStatus: (text, tone = '') => { statusEl.textContent = text; statusEl.className = tone; },
  onDirty: (k) => {
    const chip = $('#dirty-chip');
    chip.textContent = k ? t('game.dirty', { n: k }) : t('game.solved');
    chip.classList.toggle('done', !k);
  },
  onShake: () => {
    const st = $('#puzzle-stage');
    st.classList.remove('shake'); void st.offsetWidth; st.classList.add('shake');
  },
  onWin: (n, hints) => {
    markSolved(n, hints);
    const last = n >= LEVEL_COUNT;
    const actions = [];
    if (!last) actions.push({ label: t('game.next'), primary: true, run: () => loadLevel(n + 1) });
    actions.push({ label: t('game.replay'), run: () => loadLevel(n) });
    actions.push({ label: t('game.list'), run: () => history.back() });
    openSheet({
      badge: `<svg style="color:var(--${hints ? 'success' : 'stroke'})"><use href="#i-${hints ? 'check' : 'star'}"/></svg>`,
      title: t('game.winTitle', { n }),
      body: last ? t('game.winAll') : hints ? t('game.winHints', { n: hints }) : t('game.winStar'),
      actions, locked: true,
    });
  },
});
let currentLevel = 1;
function loadLevel(n) {
  currentLevel = n;
  store.lastLevel = n; save();
  $('#game-title').textContent = t('game.level', { n });
  const p = levelParams(n);
  $('#size-label').textContent = `${p.W} × ${p.H}`;
  const prev = $('#prev-level'), next = $('#next-level');
  prev.disabled = n <= 1;
  prev.querySelector('span').textContent = n > 1 ? n - 1 : '';
  next.disabled = n >= LEVEL_COUNT || !isUnlocked(n + 1);
  next.querySelector('span').textContent = n < LEVEL_COUNT ? n + 1 : '';
  puzzle.load(n);
  refreshHint();
}
function refreshHint() {
  const left = MAX_HINTS - puzzle.hints;
  $('#hint-badge').textContent = left;
  $('#hint-badge').hidden = left <= 0;
  $('#hint-btn').disabled = left <= 0;
}
$('#hint-btn').addEventListener('click', () => { puzzle.hint(); refreshHint(); });
$('#prev-level').addEventListener('click', () => loadLevel(currentLevel - 1));
$('#next-level').addEventListener('click', () => loadLevel(currentLevel + 1));
hooks.game = {
  enter: (n) => { if (n) loadLevel(n); else loadLevel(currentLevel); puzzleView.start(); },
  leave: () => { puzzle.leave(); puzzleView.stop(); chapter = Math.floor((currentLevel - 1) / CHAPTER_SIZE); },
};

// ---------- Challenge ----------
const challengeView = new BoardView($('#challenge-canvas'), {
  onStep: (len, cell, backward) => { backward ? sfx.back() : sfx.step(len); haptic(5); },
  onStart: () => $('#challenge').classList.add('drawing'),
  onEnd: () => $('#challenge').classList.remove('drawing'),
  onCommit: (path) => challenge.commit(path),
});
const bonusEl = $('#bonus');
function popBonus(main, sub = '') {
  bonusEl.querySelector('.bonus-main').textContent = main;
  bonusEl.querySelector('.bonus-sub').textContent = sub;
  bonusEl.classList.remove('show'); void bonusEl.offsetWidth; bonusEl.classList.add('show');
}
const countdownEl = $('#countdown');
const challenge = new ChallengeMode(challengeView, {
  onHud: ({ score, level, lines, mode }) => {
    $('#hud-score').textContent = fmt(score);
    $('#hud-level').textContent = t('ch.level', { n: level });
    $('#hud-lines').textContent = t('ch.lines', { n: lines });
    $('#hud-mode').textContent = mode === 'practice' ? t('ch.practice') : '';
  },
  onCountdown: (label) => {
    countdownEl.className = 'countdown' + (label === 'go' ? ' go' : '');
    countdownEl.innerHTML = label ? `<span>${label === 'go' ? t('ch.go') : label}</span>` : '';
  },
  onLines: (k, chain, points) => {
    popBonus(`${t('ch.lines', { n: k })}  +${fmt(points)}`, chain > 1 ? t('ch.chain', { n: chain }) : '');
  },
  onBonus: (text) => popBonus(text),
  onGameOver: (r) => {
    const practice = !MODES[r.mode].records;
    const grade = gradeFor(r.score);
    let title = t('ch.over'), rank = -1;
    if (!practice) {
      rank = addRecord({ score: r.score, lines: r.lines, grade, chain: r.maxChain, date: Date.now() });
      title = rank === 0 ? t('ch.record') : rank > 0 ? t('ch.rank', { n: rank + 1 }) : t('ch.over');
    }
    setTimeout(() => openSheet({
      badge: practice ? fmt(r.score) : grade,
      badgeClass: practice ? '' : 'grade',
      title: practice ? t('ch.practiceOver') : title,
      body: t('ch.summary', { s: fmt(r.score), lines: r.lines, chain: r.maxChain || 0 }),
      actions: [
        { label: t('game.replay'), primary: true, run: () => startChallenge(r.mode) },
        { label: t('ch.menu'), run: () => history.back() },
      ],
      locked: true,
    }), 900);
  },
});
let challengeMode = 'challenge';
function startChallenge(mode = challengeMode) {
  challengeMode = mode;
  challenge.start(mode);
  challengeView.start();
}
function pauseMenu() {
  challenge.pause();
  openSheet({
    title: t('ch.pause'),
    body: t('ch.score', { s: fmt(challenge.score) }),
    actions: [
      { label: t('ch.resume'), primary: true, run: () => challenge.resume() },
      { label: t('ch.restart'), run: () => startChallenge() },
      { label: t('ch.quit'), run: () => { challenge.stop(); history.back(); } },
    ],
    locked: true,
  });
}
$('#pause-btn').addEventListener('click', pauseMenu);
$('#rush-btn').addEventListener('click', () => challenge.rush());
// Boutons ✕ : annulent le trait en cours (utilisables avec l'autre main pendant le tracé).
document.querySelectorAll('[data-cancel]').forEach((b) => {
  b.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    const view = current() === 'game' ? puzzleView : challengeView;
    if (view.cancelDrawing()) { sfx.back(); haptic(15); }
  });
});
hooks.challenge = {
  enter: (mode) => startChallenge(mode || challengeMode),
  leave: () => { challenge.stop(); challengeView.stop(); countdownEl.innerHTML = ''; },
  // Retour système pendant une partie : on met en pause plutôt que de quitter.
  intercept: () => { if (!challenge.over && !challenge.paused) { pauseMenu(); return true; } return false; },
};
document.addEventListener('visibilitychange', () => {
  if (document.hidden && current() === 'challenge' && !challenge.over && !challenge.paused) pauseMenu();
});

function renderRecords() {
  const box = $('#records');
  const recs = store.records || [];
  if (!recs.length) { box.innerHTML = `<p class="empty">${t('cmenu.none')}</p>`; return; }
  box.innerHTML = recs.map((r, i) => `
    <div class="rec">
      <span class="rec-rank">${i + 1}</span>
      <span class="rec-grade">${r.grade || gradeFor(r.score)}</span>
      <span class="rec-score">${fmt(r.score)}</span>
      <span class="rec-meta">${t('ch.lines', { n: r.lines || 0 })}<br>${r.date ? fmtDate(r.date) : ''}</span>
    </div>`).join('');
}
hooks.cmenu = { enter: renderRecords };
$('#start-challenge').addEventListener('click', () => go('challenge', 'challenge'));
$('#start-practice').addEventListener('click', () => go('challenge', 'practice'));

// ---------- Comment jouer : petites démos animées ----------
function demoBoard(rows) {
  const W = rows[0].length, H = rows.length;
  const b = makeBoard(W + 2, H + 2);
  rows.forEach((r, y) => [...r].forEach((c, x) => set(b, x + 1, y + 1, c)));
  return b;
}
const demoA = demoBoard(['BWW', 'WBB']);
const demoPath = [[1, 1], [1, 2]];
const demoB = applyPath(demoA, demoPath);
const demoC = demoBoard(['WWB', 'XWB']);
const demoCPath = [[3, 1], [4, 1], [4, 2], [3, 2]];
const demos = [];
let demoTimer = 0;
function setupDemos() {
  if (!demos.length) {
    document.querySelectorAll('[data-demo]').forEach((cv) => {
      const v = new BoardView(cv, { interactive: false });
      v.kind = cv.dataset.demo;
      demos.push(v);
    });
  }
  let phase = 0;
  const cycle = () => {
    phase = (phase + 1) % 2;
    for (const v of demos) {
      v.resetAnims();
      if (v.kind === '1') { v.setBoard(demoA); v.path = phase ? demoPath : demoPath.slice(0, 1); }
      if (v.kind === '2') { v.setBoard(phase ? demoB : demoA); if (phase) v.animateFlips(demoPath, demoB); }
      if (v.kind === '3') { v.setBoard(demoB); if (phase) v.flashRows([1, 2], 'success', 1200); }
      if (v.kind === '4') { v.setBoard(demoC); v.path = phase ? demoCPath : demoCPath.slice(0, 2); }
    }
  };
  cycle();
  demos.forEach((v) => { v.refreshTheme(); v.start(); });
  clearInterval(demoTimer);
  demoTimer = setInterval(cycle, 1400);
}
hooks.howto = {
  enter: setupDemos,
  leave: () => { clearInterval(demoTimer); demos.forEach((v) => v.stop()); },
};

// Thème : les canvas relisent les couleurs quand le système bascule clair/sombre.
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', refreshCanvases);

// ---------- Installation (PWA) ----------
const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const hint = $('#install-hint');
function refreshInstallHint() {
  if (!standalone && isIOS && !deferredPrompt) { hint.textContent = t('home.installIOS'); hint.hidden = false; }
  if (deferredPrompt) hint.querySelector('button').textContent = t('home.installBtn');
}
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  hint.innerHTML = '';
  const b = document.createElement('button');
  b.className = 'pill-btn';
  b.textContent = t('home.installBtn');
  b.addEventListener('click', async () => { deferredPrompt.prompt(); await deferredPrompt.userChoice; deferredPrompt = null; hint.hidden = true; });
  hint.appendChild(b);
  hint.hidden = false;
});
if ('serviceWorker' in navigator && location.protocol === 'https:' || location.hostname === 'localhost') {
  navigator.serviceWorker?.register('sw.js').catch(() => { /* hors PWA (aperçu) : sans effet */ });
}

// Langue : textes fixes, puis écran courant re-rendu quand la langue change.
applyStatic();
applyTheme();
refreshInstallHint();
onLangChange(() => {
  refreshInstallHint();
  const id = current();
  if (id === 'game') {
    $('#game-title').textContent = t('game.level', { n: currentLevel });
    puzzle.ui.onDirty(puzzle.board ? dirtyCount() : 0);
  } else if (id !== 'challenge') hooks[id]?.enter?.();
});
function dirtyCount() { const c = $('#dirty-chip'); return c.classList.contains('done') ? 0 : parseInt(c.textContent, 10) || 0; }

history.replaceState({ depth: 1 }, '');
show('home');
refreshHome();

// Accès de diagnostic (console / tests automatisés), sans effet sur le jeu.
window.cariflipDebug = { challenge, puzzle, puzzleView, challengeView };
