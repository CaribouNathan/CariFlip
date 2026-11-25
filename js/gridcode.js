// Code de partage d'une grille de l'éditeur : la grille entière tient dans le code
// (aucun serveur). Alphabet sans caractères ambigus (pas de 0/O, 1/I/L).
//   valeur = cases en base 3 (noire, blanche, creuse), puis dimensions ; écrite en base 31 ;
//   un dernier caractère de contrôle détecte les fautes de frappe.
import { makeBoard, set, at, BLACK, WHITE, HOLE } from './board.js';

const ALPHA = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const BASE = BigInt(ALPHA.length);
export const MIN_SIZE = 3, MAX_SIZE = 8;
const SPAN = MAX_SIZE - MIN_SIZE + 1;          // 6 tailles possibles par côté
const CELL = { [BLACK]: 0n, [WHITE]: 1n, [HOLE]: 2n };
const CELLS = [BLACK, WHITE, HOLE];

const checkChar = (body) => {
  let sum = 7;
  for (const c of body) sum = (sum * 3 + ALPHA.indexOf(c) + 1) % ALPHA.length;
  return ALPHA[sum];
};

// rows : tableau de chaînes ('B', 'W', 'X'), toutes de même longueur.
export function encodeGrid(rows) {
  const H = rows.length, W = rows[0].length;
  let v = 0n;
  for (let i = W * H - 1; i >= 0; i--) v = v * 3n + CELL[rows[(i / W) | 0][i % W]];
  v = v * BigInt(SPAN * SPAN) + BigInt((W - MIN_SIZE) * SPAN + (H - MIN_SIZE));
  let body = '';
  do { body = ALPHA[Number(v % BASE)] + body; v /= BASE; } while (v > 0n);
  return body + checkChar(body);
}

export const normalizeGridCode = (s) => String(s || '').toUpperCase().replace(/[^0-9A-Z]/g, '');
export const formatGridCode = (c) => (c ? c.match(/.{1,4}/g).join('-') : '');

// Renvoie les lignes de la grille, ou null si le code est invalide.
export function decodeGrid(raw) {
  const code = normalizeGridCode(raw);
  if (code.length < 2 || code.length > 40) return null;
  const body = code.slice(0, -1);
  if ([...code].some((c) => !ALPHA.includes(c)) || checkChar(body) !== code[code.length - 1]) return null;
  let v = 0n;
  for (const c of body) v = v * BASE + BigInt(ALPHA.indexOf(c));
  const dims = Number(v % BigInt(SPAN * SPAN));
  v /= BigInt(SPAN * SPAN);
  const W = MIN_SIZE + ((dims / SPAN) | 0), H = MIN_SIZE + (dims % SPAN);
  const rows = [];
  for (let y = 0; y < H; y++) {
    let row = '';
    for (let x = 0; x < W; x++) { row += CELLS[Number(v % 3n)]; v /= 3n; }
    rows.push(row);
  }
  if (v !== 0n) return null;                     // caractères en trop
  return encodeGrid(rows) === code ? rows : null; // une seule écriture possible par grille
}

// Plateau de jeu (avec son cadre traversable) à partir des lignes d'une grille.
export function boardFromRows(rows) {
  const H = rows.length, W = rows[0].length;
  const b = makeBoard(W + 2, H + 2);
  rows.forEach((r, y) => [...r].forEach((c, x) => set(b, x + 1, y + 1, c)));
  return b;
}
export function rowsFromBoard(b) {
  const rows = [];
  for (let y = 1; y < b.h - 1; y++) { let r = ''; for (let x = 1; x < b.w - 1; x++) r += at(b, x, y); rows.push(r); }
  return rows;
}
