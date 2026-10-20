// CariFlip — navigation entre écrans et liaison interface / modes de jeu.
import { BoardView } from './renderer.js';
import { PuzzleMode, MAX_HINTS } from './puzzle.js';
import { ChallengeMode, MODES, gradeFor } from './challenge.js';
import { LEVEL_COUNT, CHAPTER_SIZE, levelParams, SECRET_LEVEL, dailyLevel, rushLevel, rushParams } from './generator.js';
import { store, save, markSolved, markDaily, isSolvedLevel, isUnlocked, solvedCount, highestSolved, addRecord, addTimeRecord, secretUnlocked, bumpStat, maxStat,
         profiles, currentProfile, createProfile, updateProfile, deleteProfile, switchProfile, getDevice, getFamily, mergeFamily, adoptFamily,
         normalizeCode, isValidCode, formatCode, dayKey, dailyStreak, bestDailyStreak, onFamilyChange } from './storage.js';
import { syncConfigured, syncNow, startSync, onSyncState, syncState, fetchFamily } from './sync.js';
import { optimalForLevel, minFlips } from './optimal.js';
import { sfx, haptic, hapticsAvailable, silentOverrideAvailable, applyAudioSession, IS_IOS } from './audio.js';
import { makeBoard, set, applyPath, isTile, at } from './board.js';
import { t, fmtNum, fmtDate, applyStatic, setLangPref, onLangChange } from './i18n.js';

export const VERSION = '1.9.0';
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
if (season) {
  document.documentElement.classList.add('season-' + season);
  // Icônes de saison : logo, onglet, signet iOS et manifeste (pris en compte à l'ajout à l'écran d'accueil).
  document.querySelector('link[rel="icon"]').href = `icons/icon-${season}.svg`;
  document.querySelector('link[rel="apple-touch-icon"]').href = `icons/apple-touch-icon-${season}.png`;
  document.querySelector('link[rel="manifest"]').href = `manifest-${season}.webmanifest`;
  document.getElementById('logo').src = `icons/icon-${season}.svg`;
}
const fmt = (n) => fmtNum(n);

// ---------- Navigation ----------
const screens = ['welcome', 'home', 'profiles', 'profile-edit', 'rush', 'stats', 'settings', 'levels', 'game', 'cmenu', 'challenge', 'howto'];
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
  if (hooks[current()]?.intercept?.()) { history.pushState({ depth: stack.length }, ''); return; }
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
  actions.forEach(({ label, primary, danger, keep, run }) => {
    const b = document.createElement('button');
    b.className = 'btn' + (primary ? ' primary' : '') + (danger ? ' danger' : '');
    b.textContent = label;
    // keep : la fenêtre reste ouverte (l'action la ferme elle-même si tout va bien).
    b.addEventListener('click', () => { if (!keep) closeSheet(); run?.(); });
    box.appendChild(b);
  });
  sheet.dataset.locked = locked ? '1' : '';
  sheet.hidden = false;
  box.querySelector('.btn')?.focus();
}
function closeSheet() { sheet.hidden = true; }

// ---------- Accueil ----------
function refreshHome() {
  const p = currentProfile();
  if (p) { setAvatar($('#chip-avatar'), p.avatar); $('#chip-name').textContent = p.name; }
  const n = solvedCount();
  $('#puzzle-progress').textContent = n ? t('home.progress', { n, total: LEVEL_COUNT }) : t('home.levels', { n: LEVEL_COUNT });
  $('#best-score').textContent = store.best ? t('home.best', { s: fmt(store.best) }) : t('home.challengeSub');
  const streak = dailyStreak();
  $('#daily-sub').textContent = store.daily[dayKey()] ? t('home.dailyDone', { n: streak }) : streak ? t('home.dailyTodo', { n: streak }) : t('home.dailyNew');
  const rushBest = store.ta[0]?.score || 0;
  $('#rush-sub').textContent = rushBest ? t('home.rushBest', { n: rushBest }) : t('home.rushSub');
  $('#profiles-sub').textContent = t('home.profilesSub', { n: profiles().length });
}
hooks.home = { enter: refreshHome };
$('#version').textContent = VERSION;
$('#go-puzzle').addEventListener('click', () => {
  go('levels', true);
  // Première fois : le tutoriel s'ouvre par-dessus la liste, « Compris » y ramène.
  if (!store.tutorialSeen) { store.tutorialSeen = true; save(); go('howto'); }
});
$('#go-challenge').addEventListener('click', () => go('cmenu'));
$('#go-daily').addEventListener('click', () => go('game', 'daily'));
$('#go-rush').addEventListener('click', () => go('rush'));
$('#go-profiles').addEventListener('click', () => go('profiles'));
$('#profile-chip').addEventListener('click', () => go('profiles'));
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
function refreshCanvases() { [puzzleView, challengeView, rushView, ...demos].forEach((v) => v && v.refreshTheme()); }
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
bindSeg('#seg-theme', store.theme || 'auto', (v) => { store.theme = v; save(false); applyTheme(); });

const optSound = $('#opt-sound'), optHaptics = $('#opt-haptics'), optSilent = $('#opt-silent');
optSound.checked = store.sound;
optHaptics.checked = store.haptics;
optSilent.checked = store.soundInSilent;
const syncSilentRow = () => { $('#silent-row').hidden = !silentOverrideAvailable() || !store.sound; };
optSound.addEventListener('change', () => { store.sound = optSound.checked; save(false); applyAudioSession(); syncSilentRow(); if (store.sound) sfx.clear(1); });
optSilent.addEventListener('change', () => { store.soundInSilent = optSilent.checked; save(false); applyAudioSession(); sfx.clear(1); });
optHaptics.addEventListener('change', () => { store.haptics = optHaptics.checked; save(false); haptic(20); });
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
    if (isOptimal(n, solved)) b.innerHTML += '<svg class="medal"><use href="#i-medal"/></svg>';
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
  $('#chapter-caption').textContent = p.stock ? t('levels.stock') : t('levels.caption', { w: p.W, h: p.H, holes: !!p.holes[1] });
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
  onWin: (n, hints, flips, level) => {
    if (level.daily) return dailyWon(level, hints, flips);
    markSolved(n, hints, flips);
    const hasNext = n < LEVEL_COUNT || (n === LEVEL_COUNT && isUnlocked(SECRET_LEVEL));
    const actions = [];
    if (hasNext) actions.push({ label: t('game.next'), primary: true, run: () => loadLevel(n + 1) });
    actions.push({ label: t('game.replay'), run: () => loadLevel(n) });
    actions.push({ label: t('game.list'), run: () => history.back() });
    const medal = medalLine(flips, optimalForLevel(n));
    if (n === SECRET_LEVEL) {
      sfx.mega();
      openSheet({
        badge: '<img src="icons/icon.svg" alt="" width="64" height="64" style="border-radius:14px">',
        title: t('secret.winTitle'), html: esc(t('secret.winBody')) + medal, actions, locked: true,
      });
      return;
    }
    openSheet({
      badge: `<svg style="color:var(--${hints ? 'success' : 'stroke'})"><use href="#i-${hints ? 'check' : 'star'}"/></svg>`,
      title: t('game.winTitle', { n }),
      html: esc(n === LEVEL_COUNT && !hasNext ? t('game.winAll') : hints ? t('game.winHints', { n: hints }) : t('game.winStar')) + medal,
      actions, locked: true,
    });
  },
});
const esc = (str) => String(str).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// Médaille du trait optimal : le moins de tuiles inversées possible pour cette grille.
const isOptimal = (n, res) => res && res.len != null && optimalForLevel(n) != null && res.len <= optimalForLevel(n);
function medalLine(flips, optimal) {
  if (optimal == null) return '';
  return flips <= optimal
    ? `</p><p class="medal-line"><svg><use href="#i-medal"/></svg> ${esc(t('game.optimal', { n: flips }))}`
    : `</p><p class="medal-line muted">${esc(t('game.notOptimal', { n: flips, o: optimal }))}`;
}

// ---------- Puzzle du jour ----------
let puzzleCtx = 'level';   // 'level' ou 'daily' : l'écran #game sert aux deux
let dailyOptimal = null;
function openDaily() {
  puzzleCtx = 'daily';
  const key = dayKey();
  const lvl = dailyLevel(key);
  dailyOptimal = minFlips(lvl.board, 3000);
  if (typeof dailyOptimal !== 'number') dailyOptimal = null;
  $('#game-title').textContent = t('daily.title');
  $('#game-back').textContent = t('nav.home');
  $('#size-label').textContent = `${lvl.board.w - 2} × ${lvl.board.h - 2}`;
  $('#prev-level').hidden = $('#next-level').hidden = true;
  puzzle.load(lvl);
  refreshHint();
}
function dailyWon(level, hints, flips) {
  markDaily(level.key, hints, flips);
  const streak = dailyStreak();
  const optimal = dailyOptimal;
  openSheet({
    badge: `<svg style="color:var(--${hints ? 'success' : 'stroke'})"><use href="#i-${hints ? 'check' : 'star'}"/></svg>`,
    title: t('daily.winTitle'),
    html: esc(t('daily.streak', { n: streak })) + medalLine(flips, optimal) + `</p><p class="medal-line muted">${esc(t('daily.again'))}`,
    actions: [
      { label: t('rush.home'), primary: true, run: () => history.back() },
      { label: t('game.replay'), run: () => openDaily() },
    ],
    locked: true,
  });
}

let currentLevel = 1;
function loadLevel(n) {
  puzzleCtx = 'level';
  $('#game-back').textContent = t('nav.levels');
  $('#prev-level').hidden = $('#next-level').hidden = false;
  currentLevel = n;
  store.lastLevel = n; save(false);
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
$('#hint-btn').addEventListener('click', () => { const before = puzzle.hints; puzzle.hint(); if (puzzle.hints > before) bumpStat('hints'); refreshHint(); });
$('#prev-level').addEventListener('click', () => loadLevel(currentLevel - 1));
$('#next-level').addEventListener('click', () => loadLevel(currentLevel + 1));
hooks.game = {
  enter: (n) => {
    if (n === 'daily') openDaily();
    else if (n) loadLevel(n);
    else if (puzzleCtx === 'daily') openDaily();
    else loadLevel(currentLevel);
    puzzleView.start();
  },
  leave: () => { puzzle.leave(); puzzleView.stop(); if (puzzleCtx === 'level') chapter = currentLevel === SECRET_LEVEL ? SECRET_CHAPTER : Math.floor((currentLevel - 1) / CHAPTER_SIZE); },
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
    if (!practice) maxStat('bestLines', r.lines);
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
    const view = { game: puzzleView, rush: rushView }[current()] || challengeView;
    // Le ✕ disparaît dès l'annulation et le bouton du dessous (niveau précédent/suivant,
    // « Faire tomber ») prendrait le clic du même appui : on avale ce clic.
    swallowClicksUntil = performance.now() + 500;
    if (view.cancelDrawing()) { sfx.back(); haptic(15); }
  });
});
let swallowClicksUntil = 0;
document.addEventListener('click', (e) => {
  if (performance.now() < swallowClicksUntil && !e.target.closest('[data-cancel]')) { e.stopPropagation(); e.preventDefault(); }
}, true);
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



// ---------- Contre-la-montre ----------
const RUSH_MS = 180000, SKIP_MS = 10000;
const rushView = new BoardView($('#rush-canvas'), {
  onStep: (len, cell, backward) => { backward ? sfx.back() : sfx.step(len); haptic(5); },
  onStart: () => $('#rush').classList.add('drawing'),
  onEnd: () => $('#rush').classList.remove('drawing'),
  onCommit: (path) => { countStroke(rushView, path); rushPuzzle.commit(path); },
});
const rush = { left: RUSH_MS, solved: 0, seed: 0, running: false, over: true, timer: 0, last: 0, countdown: 0 };
const rushPuzzle = new PuzzleMode(rushView, {
  winDelay: 380,
  onStatus: () => {},
  onDirty: (k) => { const c = $('#rush-chip'); c.textContent = k ? t('game.dirty', { n: k }) : t('game.solved'); c.classList.toggle('done', !k); },
  onShake: () => { const st = $('#rush-stage'); st.classList.remove('shake'); void st.offsetWidth; st.classList.add('shake'); },
  onWin: () => {
    if (rush.over) return;
    rush.solved++;
    rushPop(t('rush.nice'));
    rushNext();
  },
});
function rushPop(text) {
  const el = $('#rush-bonus');
  el.querySelector('.bonus-main').textContent = text;
  el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
}
function rushHud() {
  const s = Math.max(0, Math.ceil(rush.left / 1000));
  const el = $('#rush-time');
  el.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  el.classList.toggle('low', s <= 15);
  $('#rush-count').textContent = t('rush.count', { n: rush.solved });
}
function rushNext() {
  const lvl = rushLevel(rush.solved, (rush.seed + rush.solved * 7919) >>> 0);
  rushPuzzle.load(lvl);
  rushView.enabled = rush.running;
  rushHud();
}
function rushTick() {
  const now = performance.now();
  const dt = now - rush.last; rush.last = now;
  if (!rush.running) return;
  rush.left -= dt;
  if (rush.left <= 0) { rush.left = 0; rushHud(); return rushEnd(); }
  rushHud();
}
function startRush() {
  clearInterval(rush.timer);
  rush.left = RUSH_MS; rush.solved = 0; rush.over = false; rush.running = false;
  rush.seed = (Math.random() * 2 ** 32) >>> 0;
  rushNext();
  rushView.enabled = false;
  rushView.start();
  // 3, 2, 1, partez
  const cd = $('#rush-countdown');
  let n = 3;
  const step = () => {
    if (rush.over) return;
    if (n > 0) { cd.className = 'countdown'; cd.innerHTML = `<span>${n}</span>`; sfx.step(0); n--; rush.countdown = setTimeout(step, 800); return; }
    cd.className = 'countdown go'; cd.innerHTML = `<span>${t('ch.go')}</span>`; sfx.clear(2);
    rush.countdown = setTimeout(() => { cd.innerHTML = ''; }, 600);
    rush.running = true; rush.last = performance.now(); rushView.enabled = true;
    rush.timer = setInterval(rushTick, 100);
  };
  step();
}
function rushEnd() {
  rush.running = false; rush.over = true;
  clearInterval(rush.timer);
  rushView.cancelDrawing(); rushView.enabled = false;
  sfx.over(); haptic(80);
  bumpStat('taGames', 1, false);
  const rank = addTimeRecord({ score: rush.solved, date: Date.now() });
  openSheet({
    badge: String(rush.solved), badgeClass: 'grade',
    title: rank === 0 && rush.solved ? t('rush.record') : rank > 0 ? t('rush.rank', { n: rank + 1 }) : t('rush.over'),
    body: t('rush.summary', { n: rush.solved }),
    actions: [
      { label: t('rush.again'), primary: true, run: () => startRush() },
      { label: t('rush.home'), run: () => history.back() },
    ],
    locked: true,
  });
}
function stopRush() {
  rush.running = false; rush.over = true;
  clearInterval(rush.timer); clearTimeout(rush.countdown);
  $('#rush-countdown').innerHTML = '';
  rushPuzzle.leave(); rushView.stop();
}
function rushQuitMenu() {
  if (rush.over) { history.back(); return; }
  const wasRunning = rush.running;
  rush.running = false;
  openSheet({
    title: t('rush.quitTitle'), body: t('rush.quitBody'),
    actions: [
      { label: t('rush.resume'), primary: true, run: () => { rush.last = performance.now(); rush.running = wasRunning || !rush.over; } },
      { label: t('rush.quit'), run: () => { stopRush(); history.back(); } },
    ],
    locked: true,
  });
}
$('#rush-quit').addEventListener('click', rushQuitMenu);
$('#rush-skip').addEventListener('click', () => {
  if (!rush.running) return;
  rush.left -= SKIP_MS;
  sfx.fail(); haptic(20);
  rushPop('−10 s');
  if (rush.left <= 0) { rush.left = 0; rushHud(); rushEnd(); return; }
  rushNext();
});
hooks.rush = {
  enter: startRush,
  leave: stopRush,
  intercept: () => { if (!rush.over) { rushQuitMenu(); return true; } return false; },
};
document.addEventListener('visibilitychange', () => {
  if (document.hidden && current() === 'rush' && rush.running) rushQuitMenu();
});

// ---------- Profils ----------
const AVATARS = [
  ['🦌', '#C08A55'], ['🦊', '#FF9F0A'], ['🐻', '#A2845E'], ['🐼', '#8E8E93'], ['🐯', '#FFB340'], ['🦁', '#E0A526'],
  ['🐸', '#34C759'], ['🐵', '#B07F5A'], ['🐧', '#5AC8FA'], ['🦉', '#AF52DE'], ['🐙', '#FF6482'], ['🦄', '#DA8FFF'],
  ['🐢', '#30B0C7'], ['🐝', '#FFD60A'], ['🐳', '#0A84FF'], ['🦖', '#63C466'], ['🐱', '#FF9F7A'], ['🐶', '#C69C6D'],
];
const avatarColor = (emoji) => (AVATARS.find(([e]) => e === emoji) || [null, '#8E8E93'])[1];
function setAvatar(el, emoji) { el.textContent = emoji || '🙂'; el.style.setProperty('--av', avatarColor(emoji)); }
const avatarHtml = (emoji, cls = '') => `<span class="avatar ${cls}" style="--av:${avatarColor(emoji)}">${esc(emoji || '🙂')}</span>`;

// Formulaire prénom + avatar (premier lancement et écran d'édition).
function buildProfileForm(box, { name = '', avatar } = {}) {
  const used = new Set(profiles().map((p) => p.avatar));
  let pick = avatar || (AVATARS.find(([e]) => !used.has(e)) || AVATARS[0])[0];
  box.innerHTML = `<div class="avatar big"></div>
    <input class="text-input" maxlength="20" autocomplete="off" placeholder="${esc(t('form.name'))}" value="${esc(name)}">
    <div class="avatar-grid" role="radiogroup">${AVATARS.map(([e, c]) => `<button type="button" role="radio" style="--av:${c}" data-e="${e}">${e}</button>`).join('')}</div>`;
  const big = box.querySelector('.avatar.big'), input = box.querySelector('input');
  const paint = () => { setAvatar(big, pick); box.querySelectorAll('[data-e]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.e === pick))); };
  box.querySelectorAll('[data-e]').forEach((b) => b.addEventListener('click', () => { pick = b.dataset.e; paint(); haptic(5); }));
  paint();
  return { get: () => ({ name: input.value.trim().slice(0, 20), avatar: pick }), input };
}

// Premier lancement : créer un profil, ou rejoindre une famille existante avec son code.
let welcomeForm = null;
function showWelcome() {
  stack.length = 0; stack.push('welcome');
  history.replaceState({ depth: 1 }, '');
  show('welcome');
  welcomeForm = buildProfileForm($('#welcome-form'));
  const btn = $('#welcome-create');
  const sync = () => { btn.disabled = !welcomeForm.get().name; };
  welcomeForm.input.addEventListener('input', sync);
  sync();
  $('#welcome-join-toggle').hidden = !syncConfigured();
}
function enterHome() {
  stack.length = 0; stack.push('home');
  history.replaceState({ depth: 1 }, '');
  show('home');
  refreshHome();
}
$('#welcome-create').addEventListener('click', () => {
  const { name, avatar } = welcomeForm.get();
  if (!name) return;
  createProfile(name, avatar);
  haptic(20); sfx.win();
  enterHome();
  syncNow();
});
$('#welcome-join-toggle').addEventListener('click', () => { $('#welcome-join').hidden = !$('#welcome-join').hidden; $('#welcome-code').focus(); });
$('#welcome-code').addEventListener('input', (e) => {
  const c = normalizeCode(e.target.value).slice(0, 12);
  e.target.value = formatCode(c);
});
$('#welcome-join-btn').addEventListener('click', async () => {
  const err = $('#welcome-error');
  const ok = await joinFamily($('#welcome-code').value, (msg) => { err.textContent = msg; err.hidden = !msg; });
  if (ok) {
    if (currentProfile()) enterHome();
    else { err.textContent = ''; err.hidden = true; $('#welcome-join').hidden = true; }
  }
});
// Rejoindre une famille : on récupère ses profils et on y ajoute ceux de l'appareil.
async function joinFamily(raw, report) {
  const code = normalizeCode(raw);
  if (!syncConfigured()) { report(t('welcome.noSync')); return false; }
  if (!isValidCode(code)) { report(t('welcome.badCode')); return false; }
  report('');
  let remote;
  try { remote = await fetchFamily(code); } catch { report(t('welcome.offline')); return false; }
  if (!remote) { report(t('welcome.notFound')); return false; }
  const dev = getDevice();
  dev.code = code; dev.rev = 0;
  adoptFamily(mergeFamily(getFamily(), remote.data));
  save();
  await syncNow();
  haptic(20); sfx.win();
  return true;
}

function renderProfiles() {
  const cur = currentProfile();
  $('#profile-list').innerHTML = profiles().map((p) => {
    const solved = Object.keys(p.solved).filter((k) => +k <= LEVEL_COUNT).length;
    const stars = Object.entries(p.solved).filter(([k, v]) => +k <= LEVEL_COUNT && v.hints === 0).length;
    return `<div class="row profile-row" data-id="${p.id}" role="button" tabindex="0">
      ${avatarHtml(p.avatar)}
      <span class="row-text"><span class="row-title">${esc(p.name)}</span><span class="row-sub">${esc(t('profiles.sub', { n: solved, s: stars }))}</span></span>
      ${p.id === cur?.id ? '<svg class="current-mark"><use href="#i-check"/></svg>' : ''}
      <button class="edit-btn" data-edit="${p.id}" aria-label="${esc(t('profiles.edit'))}"><svg><use href="#i-pencil"/></svg></button>
    </div>`;
  }).join('');
  $('#profile-list').querySelectorAll('.profile-row').forEach((row) => row.addEventListener('click', (e) => {
    const edit = e.target.closest('[data-edit]');
    if (edit) { go('profile-edit', edit.dataset.edit); return; }
    switchProfile(row.dataset.id);
    haptic(15);
    history.back();
  }));
  renderSync();
}
function renderSync() {
  if (current() !== 'profiles') return;
  const st = syncState();
  const dev = getDevice();
  const icon = $('#sync-icon');
  icon.className = 'row-icon' + (st.state === 'ok' ? ' ok' : st.state === 'error' ? ' err' : st.state === 'syncing' ? ' busy' : '');
  const conf = syncConfigured();
  $('#sync-state').textContent = conf ? t('sync.' + (st.state === 'off' ? 'idle' : st.state)) : t('sync.off');
  $('#sync-when').textContent = !conf ? t('sync.offSub') : dev.lastSync ? t('sync.when', { d: new Date(dev.lastSync).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' }) }) : t('sync.never');
  $('#sync-code').textContent = formatCode(dev.code) || '—';
  for (const id of ['#sync-code-row', '#sync-join', '#sync-now', '#sync-help']) $(id).hidden = !conf;
}
onSyncState(renderSync);
$('#profile-new').addEventListener('click', () => go('profile-edit', null));
$('#sync-now').addEventListener('click', () => syncNow());
$('#sync-code-row').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(formatCode(getDevice().code)); } catch { /* ignoré */ }
  const v = $('#sync-code-row .stat-val'); v.textContent = t('sync.copied'); haptic(10);
  setTimeout(() => { v.textContent = t('sync.copy'); }, 1500);
});
$('#sync-join').addEventListener('click', () => {
  openSheet({
    title: t('sync.joinTitle'),
    html: `${esc(t('sync.joinBody'))}</p><input class="text-input code-input" id="join-code" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="XXXX-XXXX-XXXX" maxlength="16"><p class="form-error" id="join-error" hidden>`,
    actions: [
      { label: t('sync.joinBtn'), primary: true, keep: true, run: async () => {
        const err = $('#join-error');
        const ok = await joinFamily($('#join-code').value, (m) => { err.textContent = m; err.hidden = !m; });
        if (ok) { closeSheet(); renderProfiles(); }
      } },
      { label: t('pe.cancel') },
    ],
  });
  const inp = $('#join-code');
  inp.addEventListener('input', () => { inp.value = formatCode(normalizeCode(inp.value).slice(0, 12)); });
  setTimeout(() => inp.focus(), 50);
});
hooks.profiles = { enter: renderProfiles };

let editing = null, editForm = null;
hooks['profile-edit'] = {
  enter: (id) => {
    if (id !== undefined) editing = id;
    const p = editing ? getFamily().profiles[editing] : null;
    $('#pe-title').textContent = t(p ? 'pe.edit' : 'pe.new');
    editForm = buildProfileForm($('#pe-form'), p ? { name: p.name, avatar: p.avatar } : {});
    const sync = () => { $('#pe-save').disabled = !editForm.get().name; };
    editForm.input.addEventListener('input', sync); sync();
    $('#pe-delete').hidden = !p || profiles().length <= 1;
  },
};
$('#pe-save').addEventListener('click', () => {
  const { name, avatar } = editForm.get();
  if (!name) return;
  if (editing) updateProfile(editing, { name, avatar });
  else createProfile(name, avatar);
  haptic(15);
  history.back();
});
$('#pe-delete').addEventListener('click', () => {
  const p = getFamily().profiles[editing];
  if (!p) return;
  openSheet({
    title: t('pe.confirmTitle', { name: p.name }), body: t('pe.confirmBody'),
    actions: [
      { label: t('pe.confirm'), danger: true, run: () => { deleteProfile(p.id); history.back(); } },
      { label: t('pe.cancel'), primary: true },
    ],
  });
});

// Synchro reçue : l'écran affiché se remet à jour (sauf en pleine partie).
onFamilyChange(() => {
  if (!currentProfile()) { showWelcome(); return; }
  const id = current();
  if (['home', 'levels', 'profiles', 'stats', 'cmenu'].includes(id)) hooks[id]?.enter?.();
  if (id === 'home') refreshHome();
});

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

// ---------- Easter egg de l'accueil : appui long sur le logo ----------
function longPress(el, ms, run) {
  let timer = 0, x = 0, y = 0;
  const cancel = () => { clearTimeout(timer); timer = 0; };
  el.addEventListener('pointerdown', (e) => {
    cancel(); x = e.clientX; y = e.clientY;
    timer = setTimeout(() => { timer = 0; run(); }, ms);
  });
  el.addEventListener('pointermove', (e) => { if (Math.hypot(e.clientX - x, e.clientY - y) > 12) cancel(); });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => el.addEventListener(ev, cancel));
  el.addEventListener('contextmenu', (e) => e.preventDefault());
}
function showBrother() {
  haptic(30);
  openSheet({ title: t('egg.brother'), actions: [{ label: t('egg.ok'), primary: true }] });
  $('#sheet-title').classList.add('egg');
}
longPress($('#logo'), 700, showBrother);
// Appui long sur le numéro de version : indice sur les tuiles de saison.
longPress($('#version-line'), 700, () => {
  haptic(20);
  openSheet({
    badge: `<img src="${$('#logo').getAttribute('src')}" alt="" width="56" height="56" style="border-radius:13px">`,
    title: t('egg.psst'), body: t('egg.season'), actions: [{ label: t('egg.ok'), primary: true }],
  });
});

// ---------- Statistiques ----------
function renderStats() {
  const st = store.stats;
  const solved = solvedCount();
  const stars = Object.entries(store.solved).filter(([k, v]) => +k <= LEVEL_COUNT && v.hints === 0).length;
  const recs = store.records || [];
  const bestRec = recs[0];
  const bestLines = Math.max(st.bestLines || 0, ...recs.map((r) => r.lines || 0));
  const none = t('stat.none');
  const n = (v) => (v ? fmt(v) : '0');
  const row = (label, val) => `<div class="row stat-row"><span class="row-title">${label}</span><span class="stat-val">${val}</span></div>`;
  const group = (title, rows) => `<h3 class="section-title">${title}</h3><div class="group">${rows.join('')}</div>`;

  const chapters = [];
  for (let c = 0; c * CHAPTER_SIZE < LEVEL_COUNT; c++) {
    const a = c * CHAPTER_SIZE + 1, z = Math.min(LEVEL_COUNT, a + CHAPTER_SIZE - 1);
    let done = 0;
    for (let k = a; k <= z; k++) if (isSolvedLevel(k)) done++;
    const pct = Math.round((done / (z - a + 1)) * 100);
    chapters.push(`<div class="row stat-row chap-row"><span class="chap-name">${a}–${z}</span><span class="chap-bar"><i style="width:${pct}%"></i></span><span class="stat-val">${done}/${z - a + 1}</span></div>`);
  }
  const secret = store.solved[SECRET_LEVEL] ? t('stat.secretDone') : t('stat.secretLocked');
  const optimalCount = Object.entries(store.solved).filter(([k, v]) => +k <= LEVEL_COUNT && isOptimal(+k, v)).length;
  const prof = currentProfile();

  $('#stats-body').innerHTML = `
    <p class="stats-profile">${prof ? avatarHtml(prof.avatar) : ''}<span>${esc(prof ? prof.name : '')}</span></p>
    <div class="stat-hero">
      <div><b>${solved}</b><span>${t('stats.solvedShort')}</span></div>
      <div><b>${stars}</b><span>${t('stats.starsShort')}</span></div>
      <div><b>${bestRec ? bestRec.grade || gradeFor(bestRec.score) : none}</b><span>${t('stats.bestShort')}</span></div>
    </div>
    ${group(t('stats.puzzle'), [
      row(t('stat.solved'), `${solved} / ${LEVEL_COUNT}`),
      row(t('stat.stars'), `${stars} / ${LEVEL_COUNT}`),
      row(t('stat.optimal'), `${optimalCount} / ${LEVEL_COUNT}`),
      row(t('stat.highest'), highestSolved() || none),
      row(t('stat.hints'), n(st.hints)),
      row(t('stat.secret'), secret),
    ])}
    ${group(t('stats.chapters'), chapters)}
    ${group(t('stats.daily'), [
      row(t('stat.dailyDone'), n(Object.keys(store.daily).length)),
      row(t('stat.streak'), n(dailyStreak())),
      row(t('stat.bestStreak'), n(bestDailyStreak())),
    ])}
    ${group(t('stats.rush'), [
      row(t('stat.rushBest'), store.ta[0] ? t('rush.count', { n: store.ta[0].score }) : none),
      row(t('stat.rushGames'), n(st.taGames)),
    ])}
    ${group(t('stats.challenge'), [
      row(t('stat.games'), n(st.games)),
      row(t('stat.best'), store.best ? fmt(store.best) : none),
      row(t('stat.grade'), bestRec ? bestRec.grade || gradeFor(bestRec.score) : none),
      row(t('stat.bestLines'), n(bestLines)),
      row(t('stat.lines'), n(st.lines)),
      row(t('stat.bestChain'), st.bestChain ? '×' + st.bestChain : none),
      row(t('stat.megas'), n(st.megas)),
    ])}
    ${group(t('stats.general'), [
      row(t('stat.strokes'), n(st.strokes)),
      row(t('stat.flips'), n(st.flips)),
    ])}
    <p class="footnote">${t('stats.by', { v: VERSION })}</p>`;
}
hooks.stats = { enter: renderStats };
$('#go-stats').addEventListener('click', () => go('stats'));

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
  const playing = ['challenge', 'game', 'rush', 'welcome'].includes(current());
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
    $('#game-title').textContent = puzzleCtx === 'daily' ? t('daily.title') : t('game.level', { n: currentLevel });
    puzzle.ui.onDirty(puzzle.board ? dirtyCount() : 0);
  } else if (id !== 'challenge' && id !== 'rush' && id !== 'profile-edit') hooks[id]?.enter?.();
});
function dirtyCount() { const c = $('#dirty-chip'); return c.classList.contains('done') ? 0 : parseInt(c.textContent, 10) || 0; }

history.replaceState({ depth: 1 }, '');
// Premier lancement : création du profil ; sinon le dernier profil utilisé.
// (tests automatisés : profil créé d'office si localStorage['cariflip.test-profile'] existe)
try { if (!currentProfile() && localStorage.getItem('cariflip.test-profile')) { const leg = !!getDevice().legacy; const tp = createProfile('Test', '🦌'); if (!leg) tp.tutorialSeen = true; save(false); } } catch { /* ignoré */ }
if (currentProfile()) { show('home'); refreshHome(); } else showWelcome();
startSync();

// Accès de diagnostic (console / tests automatisés), sans effet sur le jeu.
window.cariflipDebug = { challenge, puzzle, puzzleView, challengeView, rushView, rushPuzzle, rush, syncNow, getFamily, getDevice, showMega, offerUpdate, showBrother, renderStats, season };
