// Sauvegarde locale (progression, meilleur score, réglages). Tolère un stockage indisponible.
const KEY = 'cariflip.v1';
const defaults = () => ({ solved: {}, best: 0, records: [], lang: 'auto', theme: 'auto', sound: true, soundInSilent: true, haptics: true, tutorialSeen: false, lastLevel: 1 });

let state = defaults();
try {
  const raw = localStorage.getItem(KEY);
  if (raw) state = { ...defaults(), ...JSON.parse(raw) };
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
export const highestSolved = () => Object.keys(state.solved).reduce((m, k) => Math.max(m, +k), 0);
export const solvedCount = () => Object.keys(state.solved).length;
// Les niveaux s'ouvrent par paquets : on peut sauter jusqu'à 3 niveaux bloquants.
export const isUnlocked = (n) => n <= highestSolved() + 3;

// Top 3 du Challenge. Renvoie le rang obtenu (0 = record) ou -1 si hors classement.
export function addRecord(entry) {
  const list = [...(state.records || []), entry].sort((a, b) => b.score - a.score);
  const rank = list.indexOf(entry);
  state.records = list.slice(0, 3);
  state.best = Math.max(state.best || 0, entry.score);
  save();
  return rank < 3 ? rank : -1;
}
