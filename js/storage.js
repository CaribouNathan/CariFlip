// Sauvegarde locale + modèle de données synchronisable.
//
// Deux parties :
//  - « appareil » : réglages propres à cet appareil (langue, thème, son…), profil actif,
//    code famille, dernier niveau ouvert. Jamais envoyé au serveur.
//  - « famille » : tous les profils et leur progression. C'est ce qui est synchronisé.
//
// La fusion de deux versions de la famille (mergeFamily) est commutative et idempotente :
// on peut fusionner dans n'importe quel ordre, autant de fois qu'on veut, sans rien perdre.
//  - niveaux résolus : union, on garde le moins d'indices et le trait le plus court ;
//  - compteurs : un compteur par appareil (chacun n'incrémente que le sien), total = somme ;
//  - records : union, puis meilleurs scores ;
//  - nom / avatar / suppression : la modification la plus récente l'emporte.

const KEY = 'cariflip.v2';
const OLD_KEY = 'cariflip.v1';

const STAT_KEYS = ['strokes', 'flips', 'lines', 'megas', 'games', 'hints', 'taGames', 'dailyDone'];
const MAX_KEYS = ['bestChain', 'bestLines'];

const randId = (n = 10) => {
  const a = '0123456789abcdefghijklmnopqrstuvwxyz';
  const buf = new Uint8Array(n);
  (globalThis.crypto || { getRandomValues: (b) => b.map(() => Math.random() * 256) }).getRandomValues(buf);
  return [...buf].map((v) => a[v % a.length]).join('');
};

// Code famille : 12 caractères sans ambiguïté (pas de 0/O, 1/I/L), affiché XXXX-XXXX-XXXX.
const CODE_ALPHA = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
export function newFamilyCode() {
  const buf = new Uint8Array(12);
  crypto.getRandomValues(buf);
  return [...buf].map((v) => CODE_ALPHA[v % CODE_ALPHA.length]).join('');
}
export const normalizeCode = (s) => String(s || '').toUpperCase().replace(/[^0-9A-Z]/g, '');
export const isValidCode = (c) => c.length === 12 && [...c].every((ch) => CODE_ALPHA.includes(ch));
export const formatCode = (c) => (c ? c.match(/.{1,4}/g).join('-') : '');

const deviceDefaults = () => ({
  id: randId(8), lang: 'auto', theme: 'auto', sound: true, soundInSilent: true, haptics: true,
  accent: 'blue',
  profile: null, lastLevel: {}, code: null, rev: 0, lastSync: 0, legacy: null,
});
const emptyFamily = () => ({ profiles: {}, grids: {} });

export function newProfile(name, avatar) {
  const now = Date.now();
  return {
    id: randId(10), name, avatar, created: now, updated: now, deleted: false,
    solved: {}, daily: {}, custom: {}, records: [], ta: [], stats: {}, maxes: {}, tutorialSeen: false,
  };
}

// ---------- Chargement ----------
let device = deviceDefaults();
let family = emptyFamily();
try {
  const raw = localStorage.getItem(KEY);
  if (raw) {
    const d = JSON.parse(raw);
    device = { ...deviceDefaults(), ...(d.device || {}) };
    family = d.family && d.family.profiles ? d.family : emptyFamily();
  } else {
    // Migration depuis la 1.8 : réglages repris, progression mise de côté pour le premier profil.
    const old = localStorage.getItem(OLD_KEY);
    if (old) {
      const o = JSON.parse(old);
      for (const k of ['lang', 'theme', 'sound', 'soundInSilent', 'haptics']) if (k in o) device[k] = o[k];
      device.legacy = { solved: o.solved || {}, records: o.records || [], stats: o.stats || {}, tutorialSeen: !!o.tutorialSeen, lastLevel: o.lastLevel || 1 };
    }
  }
} catch { /* stockage bloqué : on joue sans sauvegarde */ }

const listeners = { save: [], change: [] };
export const onSave = (fn) => listeners.save.push(fn);
export const onFamilyChange = (fn) => listeners.change.push(fn);

function persist() {
  try { localStorage.setItem(KEY, JSON.stringify({ device, family })); } catch { /* ignoré */ }
}
// save() : réglages ou progression modifiés. La progression déclenche une synchro (différée).
export function save(progress = true) {
  persist();
  if (progress) listeners.save.forEach((fn) => fn());
}

// ---------- Profils ----------
export const getDevice = () => device;
export const getFamily = () => family;
export const profiles = () => Object.values(family.profiles).filter((p) => !p.deleted).sort((a, b) => a.created - b.created);
export function currentProfile() {
  const p = family.profiles[device.profile];
  if (p && !p.deleted) return p;
  const list = profiles();
  if (list.length) { device.profile = list[0].id; persist(); return list[0]; }
  return null;
}
export function createProfile(name, avatar) {
  const p = newProfile(name, avatar);
  // Premier profil d'un appareil qui avait une progression 1.8 : il la récupère.
  if (device.legacy) {
    const L = device.legacy;
    p.solved = L.solved; p.records = L.records; p.tutorialSeen = L.tutorialSeen;
    const st = {};
    for (const k of STAT_KEYS) if (L.stats[k]) st[k] = L.stats[k];
    p.stats[device.id] = st;
    for (const k of MAX_KEYS) if (L.stats[k]) p.maxes[k] = L.stats[k];
    device.lastLevel[p.id] = L.lastLevel;
    device.legacy = null;
  }
  if (!device.code) device.code = newFamilyCode();
  family.profiles[p.id] = p;
  device.profile = p.id;
  save();
  return p;
}
export function updateProfile(id, patch) {
  const p = family.profiles[id];
  if (!p) return;
  Object.assign(p, patch, { updated: Math.max(Date.now(), p.updated + 1) });
  save();
}
export function deleteProfile(id) {
  const p = family.profiles[id];
  if (!p) return;
  family.profiles[id] = tombstone({ ...p, updated: Math.max(Date.now(), p.updated + 1) });
  save();
  if (device.profile === id) { device.profile = null; currentProfile(); persist(); }
}
export function switchProfile(id) {
  if (!family.profiles[id]) return;
  device.profile = id;
  save(false);
}

// ---------- Fusion ----------
// Résultat d'une grille : { hints, len, path, plen, late }
//  - hints : le moins d'indices utilisés ; len : le moins de tuiles inversées ;
//  - path / plen : le trait gagnant enregistré (pour le revoir) et son nombre de tuiles :
//    on garde le plus court des traits connus ;
//  - late (Puzzle du jour) : grille rattrapée après sa date ; vrai seulement si elle n'a
//    jamais été résolue le jour même.
const better = (a, b) => {
  if (!a) return b; if (!b) return a;
  const out = { hints: Math.min(a.hints, b.hints) };
  const la = a.len ?? Infinity, lb = b.len ?? Infinity;
  if (Math.min(la, lb) !== Infinity) out.len = Math.min(la, lb);
  const pa = a.path ? a : null, pb = b.path ? b : null;
  const pick = !pa ? pb : !pb ? pa : (pa.plen < pb.plen || (pa.plen === pb.plen && pa.path <= pb.path)) ? pa : pb;
  if (pick) { out.path = pick.path; out.plen = pick.plen; }
  if (a.late && b.late) out.late = true;
  return out;
};
const result = (hints, len, path, late) => {
  const r = { hints, len };
  if (path) { r.path = path; r.plen = len; }
  if (late) r.late = true;
  return r;
};
const mergeResults = (A = {}, B = {}) => {
  const out = {};
  for (const k of new Set([...Object.keys(A), ...Object.keys(B)])) out[k] = better(A[k], B[k]);
  return out;
};
const recKey = (r) => `${r.date}|${r.score}`;
const mergeTop = (A = [], B = [], n) => {
  const m = new Map();
  for (const r of [...A, ...B]) m.set(recKey(r), r);
  return [...m.values()].sort((a, b) => b.score - a.score || a.date - b.date).slice(0, n);
};
export function mergeProfile(a, b) {
  if (!a) return b; if (!b) return a;
  const meta = (b.updated > a.updated || (b.updated === a.updated && JSON.stringify(b.name) > JSON.stringify(a.name))) ? b : a;
  const stats = {};
  for (const dev of new Set([...Object.keys(a.stats || {}), ...Object.keys(b.stats || {})])) {
    const x = (a.stats || {})[dev] || {}, y = (b.stats || {})[dev] || {};
    const s = {};
    for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) s[k] = Math.max(x[k] || 0, y[k] || 0);
    stats[dev] = s;
  }
  const maxes = {};
  for (const k of new Set([...Object.keys(a.maxes || {}), ...Object.keys(b.maxes || {})])) maxes[k] = Math.max((a.maxes || {})[k] || 0, (b.maxes || {})[k] || 0);
  // Profil supprimé : on ne garde que sa « pierre tombale » (la suppression doit se propager
  // aux autres appareils), sans sa progression, pour ne pas alourdir la synchro indéfiniment.
  if (meta.deleted) return tombstone({ id: a.id, name: meta.name, avatar: meta.avatar, created: Math.min(a.created, b.created), updated: Math.max(a.updated, b.updated) });
  return {
    id: a.id, name: meta.name, avatar: meta.avatar, deleted: !!meta.deleted,
    created: Math.min(a.created, b.created), updated: Math.max(a.updated, b.updated),
    solved: mergeResults(a.solved, b.solved),
    daily: mergeResults(a.daily, b.daily),
    custom: mergeResults(a.custom, b.custom),
    records: mergeTop(a.records, b.records, 3),
    ta: mergeTop(a.ta, b.ta, 5),
    stats, maxes,
    tutorialSeen: !!(a.tutorialSeen || b.tutorialSeen),
  };
}
const tombstone = (p) => ({ id: p.id, name: p.name, avatar: p.avatar, created: p.created, updated: p.updated, deleted: true,
  solved: {}, daily: {}, custom: {}, records: [], ta: [], stats: {}, maxes: {}, tutorialSeen: false });
// Grilles créées ou reçues (communes à la famille), rangées par leur code.
// Nom et suppression : la modification la plus récente l'emporte.
function mergeGrid(a, b) {
  if (!a) return b; if (!b) return a;
  const meta = (b.updated > a.updated || (b.updated === a.updated && JSON.stringify(b.name) > JSON.stringify(a.name))) ? b : a;
  const first = (b.created < a.created || (b.created === a.created && String(b.author) < String(a.author))) ? b : a;
  return { code: a.code, name: meta.name, deleted: !!meta.deleted, author: first.author ?? null,
    created: Math.min(a.created, b.created), updated: Math.max(a.updated, b.updated) };
}
export function mergeFamily(A, B) {
  const out = { profiles: {}, grids: {} };
  const ga = (A && A.grids) || {}, gb = (B && B.grids) || {};
  for (const k of new Set([...Object.keys(ga), ...Object.keys(gb)])) out.grids[k] = mergeGrid(ga[k], gb[k]);
  const pa = (A && A.profiles) || {}, pb = (B && B.profiles) || {};
  for (const id of new Set([...Object.keys(pa), ...Object.keys(pb)])) out.profiles[id] = mergeProfile(pa[id], pb[id]);
  return out;
}
// Remplace la famille locale par une version fusionnée (venue de la synchro).
// Les écrans ne sont prévenus que si quelque chose a réellement changé : la synchro tourne
// en tâche de fond et ne doit pas faire redessiner l'interface pour rien.
export function adoptFamily(merged) {
  const changed = !sameFamily(family, merged);
  family = merged;
  currentProfile();
  persist();
  if (changed) listeners.change.forEach((fn) => fn());
  return changed;
}
export const sameFamily = (a, b) => JSON.stringify(canon(a)) === JSON.stringify(canon(b));
function canon(v) {
  if (Array.isArray(v)) return v.map(canon);
  if (v && typeof v === 'object') return Object.keys(v).sort().reduce((o, k) => { o[k] = canon(v[k]); return o; }, {});
  return v;
}

// ---------- Accès « store » (compatibilité avec le reste du jeu) ----------
// Réglages → appareil ; progression → profil actif.
const P = () => currentProfile() || { solved: {}, daily: {}, custom: {}, records: [], ta: [], stats: {}, maxes: {} };
export const store = {};
for (const k of ['lang', 'theme', 'sound', 'soundInSilent', 'haptics', 'accent']) {
  Object.defineProperty(store, k, { get: () => device[k], set: (v) => { device[k] = v; }, enumerable: true });
}
Object.defineProperties(store, {
  solved: { get: () => P().solved },
  daily: { get: () => P().daily },
  custom: { get: () => (P().custom ||= {}) },
  records: { get: () => P().records },
  ta: { get: () => P().ta },
  best: { get: () => Math.max(0, ...P().records.map((r) => r.score)) },
  stats: { get: () => totals(P()) },
  tutorialSeen: { get: () => !!P().tutorialSeen, set: (v) => { const p = currentProfile(); if (p) p.tutorialSeen = !!v; } },
  lastLevel: {
    get: () => device.lastLevel[device.profile] || 1,
    set: (v) => { if (device.profile) device.lastLevel[device.profile] = v; },
  },
});
function totals(p) {
  const t = {};
  for (const k of STAT_KEYS) t[k] = 0;
  for (const s of Object.values(p.stats || {})) for (const k of STAT_KEYS) t[k] += s[k] || 0;
  for (const k of MAX_KEYS) t[k] = (p.maxes || {})[k] || 0;
  return t;
}

// ---------- Progression ----------
// len : nombre de tuiles inversées par le trait gagnant (médaille du trait optimal).
// path : le trait gagnant (encodé, voir encodePath), gardé pour pouvoir le revoir.
export function markSolved(n, hintsUsed, len, path) {
  const p = currentProfile(); if (!p) return;
  p.solved[n] = better(p.solved[n], result(hintsUsed, len, path));
  save();
}
// late : grille d'un jour passé, rattrapée depuis le calendrier (ne compte pas dans la série).
export function markDaily(date, hintsUsed, len, path, late) {
  const p = currentProfile(); if (!p) return;
  const first = !p.daily[date];
  p.daily[date] = better(p.daily[date], result(hintsUsed, len, path, late));
  if (first) bumpStat('dailyDone', 1, false);
  save();
}
export function markCustom(code, hintsUsed, len, path) {
  const p = currentProfile(); if (!p) return;
  (p.custom ||= {})[code] = better(p.custom[code], result(hintsUsed, len, path));
  save();
}

// Trait compact : case de départ (deux caractères en base 36) puis une lettre par pas (R, L, D, U).
export function encodePath(path) {
  if (!path || !path.length) return '';
  let s = path[0][0].toString(36) + path[0][1].toString(36);
  for (let i = 1; i < path.length; i++) {
    const dx = path[i][0] - path[i - 1][0], dy = path[i][1] - path[i - 1][1];
    s += dx === 1 ? 'R' : dx === -1 ? 'L' : dy === 1 ? 'D' : 'U';
  }
  return s;
}
export function decodePath(s) {
  if (!s || s.length < 2) return null;
  let x = parseInt(s[0], 36), y = parseInt(s[1], 36);
  if (Number.isNaN(x) || Number.isNaN(y)) return null;
  const out = [[x, y]];
  for (const c of s.slice(2)) {
    if (c === 'R') x++; else if (c === 'L') x--; else if (c === 'D') y++; else if (c === 'U') y--; else return null;
    out.push([x, y]);
  }
  return out;
}

// ---------- Grilles de l'éditeur (communes à la famille) ----------
export const grids = () => Object.values(family.grids || {}).filter((g) => !g.deleted).sort((a, b) => b.created - a.created);
export const getGrid = (code) => { const g = (family.grids || {})[code]; return g && !g.deleted ? g : null; };
export function addGrid(code, name, author = null) {
  family.grids ||= {};
  const now = Date.now(), old = family.grids[code];
  family.grids[code] = old
    ? { ...old, name: old.deleted ? name : old.name, deleted: false, updated: Math.max(now, old.updated + 1) }
    : { code, name, author, created: now, updated: now, deleted: false };
  save();
  return family.grids[code];
}
export function removeGrid(code) {
  const g = (family.grids || {})[code];
  if (!g) return;
  family.grids[code] = { ...g, deleted: true, updated: Math.max(Date.now(), g.updated + 1) };
  save();
}
export const isSolvedLevel = (n) => !!P().solved[n];
export const highestSolved = () => Object.keys(P().solved).reduce((m, k) => (+k <= 200 ? Math.max(m, +k) : m), 0);
export const solvedCount = () => Object.keys(P().solved).filter((k) => +k <= 200).length;
// Les niveaux s'ouvrent par paquets : on peut sauter jusqu'à 3 niveaux bloquants.
export const isUnlocked = (n) => (n === 201 ? secretUnlocked() : n <= highestSolved() + 3);
// Niveau secret : les 200 niveaux résolus, tous sans indice (étoile).
export function secretUnlocked() {
  const s = P().solved;
  for (let n = 1; n <= 200; n++) if (!s[n] || s[n].hints !== 0) return false;
  return true;
}
export function bumpStat(key, by = 1, doSave = true) {
  const p = currentProfile(); if (!p) return;
  const s = (p.stats[device.id] ||= {});
  s[key] = (s[key] || 0) + by;
  if (doSave) save();
}
export function maxStat(key, v) {
  const p = currentProfile(); if (!p) return;
  if (v > (p.maxes[key] || 0)) { p.maxes[key] = v; save(); }
}

// Top 3 du Challenge. Renvoie le rang obtenu (0 = record) ou -1 si hors classement.
export function addRecord(entry) {
  const p = currentProfile(); if (!p) return -1;
  p.records = mergeTop(p.records, [entry], 3);
  save();
  return p.records.indexOf(entry);
}
// Top 5 du contre-la-montre.
export function addTimeRecord(entry) {
  const p = currentProfile(); if (!p) return -1;
  p.ta = mergeTop(p.ta, [entry], 5);
  save();
  return p.ta.indexOf(entry);
}

// Série du Puzzle du jour : jours consécutifs résolus jusqu'à aujourd'hui (ou hier).
export const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export function dailyStreak(today = new Date()) {
  const all = P().daily;
  const done = (k) => all[k] && !all[k].late;   // une grille rattrapée ne compte pas
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (!done(dayKey(d))) d.setDate(d.getDate() - 1);
  let n = 0;
  while (done(dayKey(d))) { n++; d.setDate(d.getDate() - 1); }
  return n;
}
export function bestDailyStreak() {
  const all = P().daily;
  const days = Object.keys(all).filter((k) => !all[k].late).sort();
  let best = 0, run = 0, prev = null;
  for (const k of days) {
    const [y, m, dd] = k.split('-').map(Number);
    const t = Date.UTC(y, m - 1, dd);
    run = prev !== null && t - prev === 86400000 ? run + 1 : 1;
    best = Math.max(best, run); prev = t;
  }
  return best;
}
