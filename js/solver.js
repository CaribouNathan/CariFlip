// Solveur « méga-combo » : cherche un trait unique qui rend TOUTES les lignes unies.
// Grille : `rows` (de haut en bas) de 8 tuiles 'B'/'W', bordée d'une colonne de cadre
// à gauche et à droite et d'une ligne de cadre en bas, toutes traversables sans inversion.
// Coordonnées renvoyées : x 0..9 (0 et 9 = cadre), y 0..R (R = cadre du bas).
//
// Principe : dans chaque ligne, le trait doit inverser exactement ses noires ou exactement
// ses blanches (2 choix par ligne). Pour chaque combinaison, on cherche un chemin simple qui
// passe par toutes les tuiles choisies, sans toucher les autres, le cadre servant de couloir.

const COLS = 8, W = COLS + 2;
const DX = [1, -1, 0, 0], DY = [0, 0, 1, -1];

export function solveFullClear(rows, { budgetMs = 150, rnd = Math.random, topFrame = false } = {}) {
  // topFrame : ligne de cadre aussi en haut (grilles du mode Puzzle). Les lignes sont alors décalées de 1.
  const T = topFrame ? 1 : 0;
  const R = rows.length, H = R + 1 + T, N = W * H;
  const t0 = performance.now();
  const isFrame = new Uint8Array(N);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (x === 0 || x === W - 1 || y === R + T || y < T) isFrame[y * W + x] = 1;
  // Options par ligne : [cases si on inverse les noires, cases si on inverse les blanches].
  const opts = rows.map((row, y) => {
    const b = [], w = [];
    row.forEach((c, i) => (c === 'B' ? b : w).push((y + T) * W + i + 1));
    return [b, w];
  });
  if (opts.some(([b, w]) => !b.length || !w.length)) return null; // ligne déjà unie : hors sujet ici

  const allowed = new Uint8Array(N), req = new Uint8Array(N), seen = new Uint8Array(N);
  const nb = (p, out) => {
    const x = p % W, y = (p / W) | 0;
    let n = 0;
    for (let d = 0; d < 4; d++) {
      const nx = x + DX[d], ny = y + DY[d];
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const q = ny * W + nx;
      if (allowed[q]) out[n++] = q;
    }
    return n;
  };
  const tmp = new Int32Array(4), stack = new Int32Array(N), vis = new Uint8Array(N);

  // Ordre des combinaisons aléatoire : solutions variées, pas toujours la même.
  const total = 1 << R;
  const order = Array.from({ length: total }, (_, i) => i);
  for (let i = total - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }

  for (const mask of order) {
    if (performance.now() - t0 > budgetMs) return undefined; // budget épuisé : inconnu
    allowed.fill(0); req.fill(0);
    for (let p = 0; p < N; p++) if (isFrame[p]) allowed[p] = 1;
    const reqList = [];
    for (let y = 0; y < R; y++) for (const p of opts[y][(mask >> y) & 1]) { allowed[p] = 1; req[p] = 1; reqList.push(p); }
    // Filtres rapides : aucune tuile isolée, au plus 2 impasses (les deux extrémités du trait).
    const ends = [];
    let dead = false;
    for (const p of reqList) {
      const n = nb(p, tmp);
      if (n === 0) { dead = true; break; }
      if (n === 1) ends.push(p);
    }
    if (dead || ends.length > 2) continue;
    // Toutes les tuiles choisies doivent être dans la même composante.
    vis.fill(0);
    let sp = 0; stack[sp++] = reqList[0]; vis[reqList[0]] = 1;
    while (sp) { const p = stack[--sp]; const n = nb(p, tmp); for (let i = 0; i < n; i++) { const q = tmp[i]; if (!vis[q]) { vis[q] = 1; stack[sp++] = q; } } }
    if (reqList.some((p) => !vis[p])) continue;

    const path = searchPath(reqList, ends, allowed, req, seen, nb, N, t0, budgetMs);
    if (path === undefined) return undefined;
    if (path) {
      while (path.length && isFrame[path[path.length - 1]]) path.pop();
      while (path.length && isFrame[path[0]]) path.shift();
      return path.map((p) => [p % W, (p / W) | 0]);
    }
  }
  return null; // aucune solution
}

function searchPath(reqList, ends, allowed, req, seen, nb, N, t0, budgetMs) {
  const W2 = W;
  const path = [];
  const nbBuf = Array.from({ length: N + 1 }, () => new Int32Array(4));
  const vis = new Uint8Array(N), st = new Int32Array(N), tmp = new Int32Array(4);
  let steps = 0, out = false;

  // Élagage : depuis la case courante, toutes les tuiles restantes restent atteignables,
  // et au plus une d'entre elles est devenue une impasse (la future fin du trait).
  const viable = (cur, left) => {
    if (!left) return true;
    vis.fill(0);
    let sp = 0; st[sp++] = cur; vis[cur] = 1;
    let reached = 0;
    while (sp) {
      const p = st[--sp];
      const n = nb(p, tmp);
      for (let i = 0; i < n; i++) {
        const q = tmp[i];
        if (seen[q] || vis[q]) continue;
        vis[q] = 1; st[sp++] = q;
        if (req[q]) reached++;
      }
    }
    if (reached < left) return false;
    let deadEnds = 0;
    for (const p of reqList) {
      if (seen[p]) continue;
      const n = nb(p, tmp);
      let free = 0;
      for (let i = 0; i < n; i++) if (!seen[tmp[i]] || tmp[i] === cur) free++;
      if (free <= 1 && ++deadEnds > 1) return false;
    }
    return true;
  };

  const dfs = (p, left, depth) => {
    if ((++steps & 1023) === 0 && performance.now() - t0 > budgetMs) { out = true; return false; }
    if (!left) return true;
    const buf = nbBuf[depth];
    const n = nb(p, buf);
    // Tuiles à inverser d'abord, cadre ensuite.
    const cand = [];
    for (let i = 0; i < n; i++) if (!seen[buf[i]]) cand.push(buf[i]);
    cand.sort((a, b) => req[b] - req[a]);
    for (const q of cand) {
      seen[q] = 1; path.push(q);
      const l2 = left - req[q];
      if (viable(q, l2) && dfs(q, l2, depth + 1)) return true;
      if (out) return false;
      path.pop(); seen[q] = 0;
    }
    return false;
  };

  const starts = ends.length ? ends : reqList;
  for (const s of starts) {
    seen.fill(0); path.length = 0;
    seen[s] = 1; path.push(s);
    if (dfs(s, reqList.length - 1, 0)) return path.slice();
    if (out) return undefined;
  }
  void W2;
  return null;
}

// Vérifie un trait : chemin simple, cases adjacentes, et toutes les lignes unies à la fin.
export function checkFullClear(rows, path) {
  const R = rows.length;
  const g = rows.map((r) => r.slice());
  const seen = new Set();
  for (let i = 0; i < path.length; i++) {
    const [x, y] = path[i];
    if (x < 0 || x >= W || y < 0 || y > R) return false;
    const k = y * W + x;
    if (seen.has(k)) return false;
    seen.add(k);
    if (i && Math.abs(x - path[i - 1][0]) + Math.abs(y - path[i - 1][1]) !== 1) return false;
    if (x >= 1 && x <= COLS && y < R) g[y][x - 1] = g[y][x - 1] === 'B' ? 'W' : 'B';
  }
  return g.every((r) => r.every((c) => c === r[0]));
}
