// Générateur pseudo-aléatoire déterministe (mulberry32).
// Une même graine produit exactement la même suite sur tous les appareils.
export function mulberry32(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    bool: () => next() < 0.5,
  };
}

// Graine stable par niveau. Changer GEN_VERSION régénère tous les niveaux :
// à ne faire qu'en connaissance de cause (la progression des joueurs serait décalée).
export const GEN_VERSION = 1;
export function seedForLevel(n) {
  return (Math.imul(n, 2654435761) ^ Math.imul(GEN_VERSION, 0x9E3779B9) ^ 0xCAF1F11) >>> 0;
}
