// Sauvegarde locale (progression, meilleur score, réglages). Tolère un stockage indisponible.
const KEY = 'cariflip.v1';
const defaults = () => ({ solved: {}, best: 0, records: [], lang: 'auto', theme: 'auto', sound: true, soundInSilent: true, haptics: true, tutorialSeen: false, lastLevel: 1,
  stats: { strokes: 0, flips: 0, lines: 0, bestChain: 0, megas: 0, games: 0, hints: 0, bestLines: 0 } });

let state = defaults();
try {
  const raw = localStorage.getItem(KEY);
  if (raw) { const d = defaults(); state = { ...d, ...JSON.parse(raw) }; state.stats = { ...d.stats, ...(state.stats || {}) }; }
} catch { /* stockage bloqué : on joue sans sauvegarde */ }

export function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* ignoré */ }
}
export const store = state;

export function markSolved(n, hintsUsed) {
  const prev = state.solved[n];
  // On garde le meilleur résultat : moins d'indices = mieux.
  if (!prev || hintsUsed < prev.hints) state.solved[n] = { hints: hintsUsed };
  save();
}
export const isSolvedLevel = (n) => !!state.solved[n];
export const highestSolved = () => Object.keys(state.solved).reduce((m, k) => (+k <= 200 ? Math.max(m, +k) : m), 0);
export const solvedCount = () => Object.keys(state.solved).filter((k) => +k <= 200).length;
// Les niveaux s'ouvrent par paquets : on peut sauter jusqu'à 3 niveaux bloquants.
export const isUnlocked = (n) => (n === 201 ? secretUnlocked() : n <= highestSolved() + 3);
// Niveau secret : les 200 niveaux résolus, tous sans indice (étoile).
export function secretUnlocked() {
  for (let n = 1; n <= 200; n++) if (!state.solved[n] || state.solved[n].hints !== 0) return false;
  return true;
}
export function bumpStat(key, by = 1) { state.stats[key] = (state.stats[key] || 0) + by; save(); }
export function maxStat(key, v) { if (v > (state.stats[key] || 0)) { state.stats[key] = v; save(); } }

// Top 3 du Challenge. Renvoie le rang obtenu (0 = record) ou -1 si hors classement.
export function addRecord(entry) {
  const list = [...(state.records || []), entry].sort((a, b) => b.score - a.score);
  const rank = list.indexOf(entry);
  state.records = list.slice(0, 3);
  state.best = Math.max(state.best || 0, entry.score);
  save();
  return rank < 3 ? rank : -1;
}
