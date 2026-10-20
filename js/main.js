// CariFlip — navigation entre écrans et liaison interface / modes de jeu.
import { BoardView } from './renderer.js';
import { PuzzleMode, MAX_HINTS } from './puzzle.js';
import { ChallengeMode, MODES, gradeFor } from './challenge.js';
import { LEVEL_COUNT, CHAPTER_SIZE, levelParams, SECRET_LEVEL } from './generator.js';
import { store, save, markSolved, isSolvedLevel, isUnlocked, solvedCount, highestSolved, addRecord, secretUnlocked, bumpStat, maxStat } from './storage.js';
import { sfx, haptic, hapticsAvailable, silentOverrideAvailable, applyAudioSession, IS_IOS } from './audio.js';
import { makeBoard, set, applyPath, isTile, at } from './board.js';
import { t, fmtNum, fmtDate, applyStatic, setLangPref, onLangChange } from './i18n.js';

export const VERSION = '1.5.0';
const $ = (s) => document.querySelector(s);
const megaEl = document.querySelector('#mega');

// ---------- Fêtes : couleurs des tuiles le 31 octobre et le 25 décembre ----------
// (?season=halloween|christmas dans l'adresse pour tester un autre jour)
function seasonFor(d = new Date()) {
  const forced = new URLSearchParams(location.search).get('season');
  if (forced === 'halloween' || forced === 'christmas') return forced;
  if (d.getMonth() === 9 && d.getDate() === 31) return 'halloween';
  if (d.getMonth() === 11 && d.getDate() === 25) return 'christmas';
  return null;
}
const season = seasonFor();
if (season) document.documentElement.classList.add('season-' + season);
const fmt = (n) => fmtNum(n);

// ---------- Navigation ----------
const screens = ['home', 'settings', 'levels', 'game', 'cmenu', 'challenge', 'howto'];
const stack = ['home'];
const hooks = {};
const current = () => stack[stack.length - 1];

function show(id) {
  for (const s of screens) $('#' + s).hidden = s !== id;
  if (typeof syncUpdateBar === 'function') queueMicrotask(syncUpdateBar);
  // Garde-fou : aucun décalage horizontal résiduel d'un écran à l'autre.
  window.scrollTo(0, 0);
  document.documentElement.scrollLeft = 0; document.body.scrollLeft = 0; $('#app').scrollLeft = 0;
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
function openSheet({ badge = '', badgeClass = '', title, body = '', html = '', actions, locked = false }) {
  $('#sheet-badge').innerHTML = badge;
  $('#sheet-badge').className = 'sheet-badge' + (badgeClass ? ' ' + badgeClass : '');
  $('#sheet-title').textContent = title;
  if (html) $('#sheet-body').innerHTML = html; else $('#sheet-body').textContent = body;
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

const optSound = $('#opt-sound'), optHaptics = $('#opt-haptics'), optSilent = $('#opt-silent');
optSound.checked = store.sound;
optHaptics.checked = store.haptics;
optSilent.checked = store.soundInSilent;
const syncSilentRow = () => { $('#silent-row').hidden = !silentOverrideAvailable() || !store.sound; };
optSound.addEventListener('change', () => { store.sound = optSound.checked; save(); applyAudioSession(); syncSilentRow(); if (store.sound) sfx.clear(1); });
optSilent.addEventListener('change', () => { store.soundInSilent = optSilent.checked; save(); applyAudioSession(); sfx.clear(1); });
optHaptics.addEventListener('change', () => { store.haptics = optHaptics.checked; save(); haptic(20); });
syncSilentRow();
if (!hapticsAvailable()) $('#haptics-row').hidden = true;
// iPhone installé sur l'écran d'accueil : iOS 26 floute une bande sous la barre d'état ;
// on décale le contenu pour que ce flou ne tombe que sur le fond.
if (IS_IOS && (matchMedia('(display-mode: standalone)').matches || navigator.standalone)) document.documentElement.classList.add('ios-standalone');

// ---------- Niveaux ----------
let chapter = Math.floor((Math.max(1, store.lastLevel) - 1) / CHAPTER_SIZE);
const chapterCount = Math.ceil(LEVEL_COUNT / CHAPTER_SIZE);

const SECRET_CHAPTER = chapterCount; // onglet « ★ 201 », présent seulement une fois débloqué
function renderChapters() {
  const box = $('#chapters');
  box.innerHTML = '';
  const tabs = chapterCount + (secretUnlocked() ? 1 : 0);
  if (chapter >= tabs) chapter = chapterCount - 1;
  for (let c = 0; c < tabs; c++) {
    const b = document.createElement('button');
    b.className = 'chapter';
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-selected', String(c === chapter));
    if (c === SECRET_CHAPTER) {
      b.classList.add('secret');
      b.textContent = t('secret.chapter');
    } else {
      const a = c * CHAPTER_SIZE + 1, z = Math.min(LEVEL_COUNT, a + CHAPTER_SIZE - 1);
      let done = 0;
      for (let n = a; n <= z; n++) if (isSolvedLevel(n)) done++;
      b.innerHTML = `${a}–${z}${done ? `<span class="done">${done}/${z - a + 1}</span>` : ''}`;
    }
    b.addEventListener('click', () => { chapter = c; renderLevels(); });
    box.appendChild(b);
  }
  // Centre l'onglet du chapitre en ne faisant défiler QUE la barre d'onglets.
  // (scrollIntoView fait aussi défiler les conteneurs parents ; sur iOS cela décalait tout l'écran.)
  const tab = box.children[chapter];
  if (tab) {
    const left = tab.getBoundingClientRect().left - box.getBoundingClientRect().left + box.scrollLeft;
    box.scrollLeft = Math.max(0, left - (box.clientWidth - tab.offsetWidth) / 2);
  }
}

function levelButton(n, next) {
  const b = document.createElement('button');
  b.className = 'level';
  const solved = store.solved[n];
  if (!isUnlocked(n)) {
    b.disabled = true;
    b.innerHTML = '<svg><use href="#i-lock"/></svg>';
    b.setAttribute('aria-label', t('levels.locked', { n }));
    return b;
  }
  b.innerHTML = `<span>${n}</span>`;
  if (solved) {
    b.classList.add('solved');
    if (solved.hints === 0) b.classList.add('perfect');
    b.innerHTML += `<svg class="mark"><use href="#i-${solved.hints === 0 ? 'star' : 'check'}"/></svg>`;
  }
  if (n === next) b.classList.add('current');
  b.setAttribute('aria-label', t('levels.item', { n, solved: !!solved }));
  b.addEventListener('click', () => go('game', n));
  return b;
}

function renderLevels() {
  renderChapters();
  const grid = $('#level-grid');
  grid.innerHTML = '';
  if (chapter === SECRET_CHAPTER) {
    $('#chapter-caption').textContent = t('secret.caption');
    grid.appendChild(levelButton(SECRET_LEVEL, store.solved[SECRET_LEVEL] ? 0 : SECRET_LEVEL));
    return;
  }
  const a = chapter * CHAPTER_SIZE + 1;
  const p = levelParams(a);
  $('#chapter-caption').textContent = t('levels.caption', { w: p.W, h: p.H, holes: !!p.holes[1] });
  const next = highestSolved() + 1;
  for (let n = a; n < a + CHAPTER_SIZE && n <= LEVEL_COUNT; n++) grid.appendChild(levelButton(n, next));
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
  onCommit: (path) => { countStroke(puzzleView, path); puzzle.commit(path); },
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
    const hasNext = n < LEVEL_COUNT || (n === LEVEL_COUNT && isUnlocked(SECRET_LEVEL));
    const actions = [];
    if (hasNext) actions.push({ label: t('game.next'), primary: true, run: () => loadLevel(n + 1) });
    actions.push({ label: t('game.replay'), run: () => loadLevel(n) });
    actions.push({ label: t('game.list'), run: () => history.back() });
    if (n === SECRET_LEVEL) {
      sfx.mega();
      openSheet({
        badge: '<img src="icons/icon.svg" alt="" width="64" height="64" style="border-radius:14px">',
        title: t('secret.winTitle'), body: t('secret.winBody'), actions, locked: true,
      });
      return;
    }
    openSheet({
      badge: `<svg style="color:var(--${hints ? 'success' : 'stroke'})"><use href="#i-${hints ? 'check' : 'star'}"/></svg>`,
      title: t('game.winTitle', { n }),
      body: n === LEVEL_COUNT && !hasNext ? t('game.winAll') : hints ? t('game.winHints', { n: hints }) : t('game.winStar'),
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
  next.disabled = n >= SECRET_LEVEL || !isUnlocked(n + 1);
  next.querySelector('span').textContent = n < SECRET_LEVEL && isUnlocked(n + 1) ? n + 1 : '';
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
  leave: () => { puzzle.leave(); puzzleView.stop(); chapter = currentLevel === SECRET_LEVEL ? SECRET_CHAPTER : Math.floor((currentLevel - 1) / CHAPTER_SIZE); },
};

// ---------- Challenge ----------
const challengeView = new BoardView($('#challenge-canvas'), {
  onStep: (len, cell, backward) => { backward ? sfx.back() : sfx.step(len); haptic(5); },
  onStart: () => $('#challenge').classList.add('drawing'),
  onEnd: () => $('#challenge').classList.remove('drawing'),
  onCommit: (path) => { countStroke(challengeView, path); challenge.commit(path); },
});
const bonusEl = $('#bonus');
function popBonus(main, sub = '') {
  if (!megaEl.hidden) return; // le méga-combo a la priorité à l'écran
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
  onMega: (k, bonus) => { bumpStat('megas'); showMega(k, bonus); },
  onLines: (k, chain, points) => {
    bumpStat('lines', k); maxStat('bestChain', chain);
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
  if (mode === 'challenge') bumpStat('games');
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


// ---------- Statistiques ----------
function countStroke(view, path) {
  const n = path.filter(([x, y]) => isTile(at(view.board, x, y))).length;
  if (!n) return;
  bumpStat('strokes'); bumpStat('flips', n);
}

// ---------- Méga-combo ----------
let megaTimer = 0;
function showMega(k, bonus) {
  sfx.mega(); haptic(80);
  $('#mega-sub').textContent = t('mega.sub', { n: k, s: fmt(bonus) });
  megaEl.querySelectorAll('.confetti').forEach((c) => c.remove());
  const css = getComputedStyle(document.documentElement);
  const colors = [css.getPropertyValue('--tile-dark'), css.getPropertyValue('--tile-light'), css.getPropertyValue('--stroke')];
  for (let i = 0; i < 36; i++) {
    const c = document.createElement('i');
    c.className = 'confetti';
    const ang = Math.random() * Math.PI * 2, dist = 120 + Math.random() * 220;
    c.style.setProperty('--dx', `${Math.cos(ang) * dist}px`);
    c.style.setProperty('--dy', `${Math.sin(ang) * dist - 60}px`);
    c.style.setProperty('--rot', `${(Math.random() - 0.5) * 720}deg`);
    c.style.background = colors[i % 3].trim();
    c.style.animationDelay = `${Math.random() * 120}ms`;
    megaEl.appendChild(c);
  }
  bonusEl.classList.remove('show');
  megaEl.hidden = true; void megaEl.offsetWidth; megaEl.hidden = false; // relance les animations
  clearTimeout(megaTimer);
  megaTimer = setTimeout(() => { megaEl.hidden = true; }, 2300);
}

// ---------- Easter eggs de l'accueil ----------
// 7 appuis rapides sur le logo.
let logoTaps = 0, logoTimer = 0;
$('#logo').addEventListener('click', () => {
  logoTaps++;
  clearTimeout(logoTimer);
  logoTimer = setTimeout(() => { logoTaps = 0; }, 1500);
  if (logoTaps >= 7) {
    logoTaps = 0;
    haptic(30);
    openSheet({ title: t('egg.brother'), actions: [{ label: t('egg.ok'), primary: true }] });
  }
});
// Appui long sur le numéro de version : crédits et statistiques.
let pressTimer = 0;
const versionLine = $('#version-line');
const cancelPress = () => clearTimeout(pressTimer);
versionLine.addEventListener('pointerdown', () => {
  cancelPress();
  pressTimer = setTimeout(() => { haptic(20); showCredits(); }, 700);
});
['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => versionLine.addEventListener(ev, cancelPress));
versionLine.addEventListener('contextmenu', (e) => e.preventDefault());
function showCredits() {
  const st = store.stats;
  const stars = Object.values(store.solved).filter((v) => v.hints === 0).length;
  const rows = [
    ['stat.solved', solvedCount()], ['stat.stars', stars], ['stat.strokes', st.strokes], ['stat.flips', st.flips],
    ['stat.games', st.games], ['stat.lines', st.lines], ['stat.bestChain', st.bestChain ? '×' + st.bestChain : 0],
    ['stat.megas', st.megas],
  ];
  const html = `${t('credits.by')}</p><p class="stats-title">${t('credits.stats')}</p><ul class="stats">${
    rows.map(([k, v]) => `<li><span>${t(k)}</span><span>${typeof v === 'number' ? fmt(v) : v}</span></li>`).join('')}</ul><p hidden>`;
  openSheet({
    badge: '<img src="icons/icon.svg" alt="" width="56" height="56" style="border-radius:13px">',
    title: `${t('credits.title')} ${VERSION}`, html, actions: [{ label: t('egg.ok'), primary: true }],
  });
}

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
// ---------- Mise à jour ----------
// Le service worker télécharge la nouvelle version en arrière-plan puis attend ; on propose
// « Mettre à jour », jamais pendant une partie de Challenge en cours.
const updateBar = $('#update-bar');
let waitingWorker = null;
function offerUpdate(worker) {
  waitingWorker = worker;
  syncUpdateBar();
}
function syncUpdateBar() {
  const playing = current() === 'challenge' || current() === 'game';
  updateBar.hidden = !waitingWorker || playing;
}
$('#update-btn').addEventListener('click', () => {
  if (!waitingWorker) return;
  $('#update-btn').disabled = true;
  waitingWorker.postMessage('skip-waiting');
});
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading || !hadController) return;
    reloading = true;
    location.reload();
  });
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('sw.js').then((reg) => {
    const watch = (w) => w && w.addEventListener('statechange', () => {
      if (w.state === 'installed' && navigator.serviceWorker.controller) offerUpdate(w);
    });
    if (reg.waiting && navigator.serviceWorker.controller) offerUpdate(reg.waiting);
    watch(reg.installing);
    reg.addEventListener('updatefound', () => watch(reg.installing));
    // Vérifie aussi quand l'app revient au premier plan (iPhone : l'app reste ouverte des jours).
    document.addEventListener('visibilitychange', () => { if (!document.hidden) reg.update().catch(() => {}); });
  }).catch(() => { /* hors PWA (aperçu) : sans effet */ });
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
window.cariflipDebug = { challenge, puzzle, puzzleView, challengeView, showMega, offerUpdate, showCredits };
