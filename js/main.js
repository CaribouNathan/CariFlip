// CariFlip — navigation entre écrans et liaison interface / modes de jeu.
import { BoardView } from './renderer.js';
import { PuzzleMode, MAX_HINTS } from './puzzle.js';
import { ChallengeMode, MODES, gradeFor } from './challenge.js';
import { LEVEL_COUNT, CHAPTER_SIZE, levelParams } from './generator.js';
import { store, save, markSolved, isSolvedLevel, isUnlocked, solvedCount, highestSolved, addRecord } from './storage.js';
import { sfx, haptic } from './audio.js';
import { makeBoard, set, applyPath } from './board.js';

export const VERSION = '1.1.0';
const $ = (s) => document.querySelector(s);
const fmt = (n) => n.toLocaleString('fr-FR');
const plural = (n, one, many) => `${n} ${n > 1 ? many : one}`;

// ---------- Navigation ----------
const screens = ['home', 'levels', 'game', 'cmenu', 'challenge', 'howto'];
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
  $('#puzzle-progress').textContent = n ? `${n} / ${LEVEL_COUNT} niveaux résolus` : `${LEVEL_COUNT} niveaux`;
  $('#best-score').textContent = store.best ? `Meilleur score : ${fmt(store.best)}` : 'Tenez le plus longtemps possible';
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
  $('#chapter-caption').textContent = `Grilles de ${p.W} × ${p.H}${p.holes[1] ? ', avec cases creuses' : ''}`;
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
      b.setAttribute('aria-label', `Niveau ${n}, verrouillé`);
    } else {
      b.innerHTML = `<span>${n}</span>`;
      if (solved) {
        b.classList.add('solved');
        if (solved.hints === 0) b.classList.add('perfect');
        b.innerHTML += `<svg class="mark"><use href="#i-${solved.hints === 0 ? 'star' : 'check'}"/></svg>`;
      }
      if (n === next) b.classList.add('current');
      b.setAttribute('aria-label', `Niveau ${n}${solved ? ', résolu' : ''}`);
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
    chip.textContent = k ? plural(k, 'ligne mixte', 'lignes mixtes') : 'Résolu';
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
    if (!last) actions.push({ label: 'Niveau suivant', primary: true, run: () => loadLevel(n + 1) });
    actions.push({ label: 'Rejouer', run: () => loadLevel(n) });
    actions.push({ label: 'Liste des niveaux', run: () => history.back() });
    openSheet({
      badge: `<svg style="color:var(--${hints ? 'success' : 'stroke'})"><use href="#i-${hints ? 'check' : 'star'}"/></svg>`,
      title: `Niveau ${n} réussi`,
      body: last ? 'Les 200 niveaux sont terminés. Bravo.' : hints ? `Avec ${plural(hints, 'indice', 'indices')}. Refaites-le sans pour gagner l’étoile.` : 'Sans indice : étoile gagnée.',
      actions, locked: true,
    });
  },
});
let currentLevel = 1;
function loadLevel(n) {
  currentLevel = n;
  store.lastLevel = n; save();
  $('#game-title').textContent = `Niveau ${n}`;
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
    $('#hud-level').textContent = `Niveau ${level}`;
    $('#hud-lines').textContent = plural(lines, 'ligne', 'lignes');
    $('#hud-mode').textContent = mode === 'practice' ? 'Entraînement' : '';
  },
  onCountdown: (label) => {
    countdownEl.className = 'countdown' + (label && label.length > 1 ? ' go' : '');
    countdownEl.innerHTML = label ? `<span>${label}</span>` : '';
  },
  onLines: (k, chain, points) => {
    popBonus(`${plural(k, 'ligne', 'lignes')}  +${fmt(points)}`, chain > 1 ? `Chaîne ×${chain}` : '');
  },
  onBonus: (text) => popBonus(text),
  onGameOver: (r) => {
    const practice = !MODES[r.mode].records;
    const grade = gradeFor(r.score);
    let title = 'Partie terminée', rank = -1;
    if (!practice) {
      rank = addRecord({ score: r.score, lines: r.lines, grade, chain: r.maxChain, date: Date.now() });
      title = rank === 0 ? 'Nouveau record' : rank > 0 ? `${rank + 1}e meilleur score` : 'Partie terminée';
    }
    setTimeout(() => openSheet({
      badge: practice ? fmt(r.score) : grade,
      badgeClass: practice ? '' : 'grade',
      title: practice ? 'Entraînement terminé' : title,
      body: `${fmt(r.score)} points · ${plural(r.lines, 'ligne', 'lignes')} · chaîne max ×${r.maxChain || 0}`,
      actions: [
        { label: 'Rejouer', primary: true, run: () => startChallenge(r.mode) },
        { label: 'Menu Challenge', run: () => history.back() },
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
    title: 'Pause',
    body: `Score : ${fmt(challenge.score)}`,
    actions: [
      { label: 'Reprendre', primary: true, run: () => challenge.resume() },
      { label: 'Recommencer', run: () => startChallenge() },
      { label: 'Quitter', run: () => { challenge.stop(); history.back(); } },
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
  if (!recs.length) { box.innerHTML = '<p class="empty">Aucune partie de Challenge pour l’instant.</p>'; return; }
  box.innerHTML = recs.map((r, i) => `
    <div class="rec">
      <span class="rec-rank">${i + 1}</span>
      <span class="rec-grade">${r.grade || gradeFor(r.score)}</span>
      <span class="rec-score">${fmt(r.score)}</span>
      <span class="rec-meta">${plural(r.lines || 0, 'ligne', 'lignes')}<br>${r.date ? new Date(r.date).toLocaleDateString('fr-FR') : ''}</span>
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
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => {
  [puzzleView, challengeView, ...demos].forEach((v) => v.refreshTheme());
});

// ---------- Installation (PWA) ----------
const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const hint = $('#install-hint');
if (!standalone && isIOS) {
  hint.textContent = 'Pour l’installer : bouton Partager de Safari, puis « Sur l’écran d’accueil ».';
  hint.hidden = false;
}
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  hint.innerHTML = '';
  const b = document.createElement('button');
  b.className = 'pill-btn';
  b.textContent = 'Installer l’application';
  b.addEventListener('click', async () => { deferredPrompt.prompt(); await deferredPrompt.userChoice; deferredPrompt = null; hint.hidden = true; });
  hint.appendChild(b);
  hint.hidden = false;
});
if ('serviceWorker' in navigator && location.protocol === 'https:' || location.hostname === 'localhost') {
  navigator.serviceWorker?.register('sw.js').catch(() => { /* hors PWA (aperçu) : sans effet */ });
}

history.replaceState({ depth: 1 }, '');
show('home');
refreshHome();

// Accès de diagnostic (console / tests automatisés), sans effet sur le jeu.
window.cariflipDebug = { challenge, puzzle, puzzleView, challengeView };
