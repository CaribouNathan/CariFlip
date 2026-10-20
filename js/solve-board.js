// Solveur générique (outil hors jeu) : trouve un trait unique qui rend chaque ligne unie,
// sur une grille quelconque. Grille en texte : '#' noire, '.' blanche, '-' case libre (cadre ou vide).
// Utilisé pour calculer la solution (indices) des puzzles saisis à la main.

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

export function solveBoard(lines, { budgetMs = 20000 } = {}) {
  const H = lines.length, W = lines[0].length, N = W * H;
  const cell = (p) => lines[(p / W) | 0][p % W];
  const free = new Uint8Array(N);
  for (let p = 0; p < N; p++) if (cell(p) === '-') free[p] = 1;
  const opts = [];
  for (let y = 0; y < H; y++) {
    const b = [], w = [];
    for (let x = 0; x < W; x++) { const c = lines[y][x]; if (c === '#') b.push(y * W + x); else if (c === '.') w.push(y * W + x); }
    if (!b.length && !w.length) continue;
    // Ligne déjà unie : on peut ne rien toucher, ou tout inverser.
    opts.push(b.length && w.length ? [b, w] : [[], b.length ? b : w]);
  }
  const t0 = Date.now();
  const total = 1 << opts.length;
  const order = Array.from({ length: total }, (_, i) => i).sort((a, b) => cost(a) - cost(b));
  function cost(m) { let c = 0; opts.forEach((o, i) => { c += o[(m >> i) & 1].length; }); return c; }

  const allowed = new Uint8Array(N), req = new Uint8Array(N), seen = new Uint8Array(N);
  const nb = (p) => {
    const x = p % W, y = (p / W) | 0, out = [];
    for (const [dx, dy] of DIRS) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const q = ny * W + nx;
      if (allowed[q]) out.push(q);
    }
    return out;
  };
  for (const mask of order) {
    if (Date.now() - t0 > budgetMs) return undefined;
    allowed.set(free); req.fill(0);
    const reqList = [];
    opts.forEach((o, i) => { for (const p of o[(mask >> i) & 1]) { allowed[p] = 1; req[p] = 1; reqList.push(p); } });
    if (!reqList.length) continue;
    const ends = reqList.filter((p) => nb(p).length === 1);
    if (reqList.some((p) => nb(p).length === 0) || ends.length > 2) continue;
    // Connexité des tuiles requises.
    const vis = new Uint8Array(N), st = [reqList[0]]; vis[reqList[0]] = 1;
    while (st.length) { const p = st.pop(); for (const q of nb(p)) if (!vis[q]) { vis[q] = 1; st.push(q); } }
    if (reqList.some((p) => !vis[p])) continue;

    const path = [];
    let steps = 0, timeout = false;
    const viable = (cur, left) => {
      if (!left) return true;
      const v2 = new Uint8Array(N), s2 = [cur]; v2[cur] = 1; let got = 0;
      while (s2.length) { const p = s2.pop(); for (const q of nb(p)) if (!seen[q] && !v2[q]) { v2[q] = 1; s2.push(q); if (req[q]) got++; } }
      if (got < left) return false;
      let dead = 0;
      for (const p of reqList) {
        if (seen[p]) continue;
        let f = 0; for (const q of nb(p)) if (!seen[q] || q === cur) f++;
        if (f <= 1 && ++dead > 1) return false;
      }
      return true;
    };
    const dfs = (p, left) => {
      if ((++steps & 4095) === 0 && Date.now() - t0 > budgetMs) { timeout = true; return false; }
      if (!left) return true;
      const cand = nb(p).filter((q) => !seen[q]).sort((a, b) => req[b] - req[a]);
      for (const q of cand) {
        seen[q] = 1; path.push(q);
        if (viable(q, left - req[q]) && dfs(q, left - req[q])) return true;
        if (timeout) return false;
        path.pop(); seen[q] = 0;
      }
      return false;
    };
    for (const s of (ends.length ? ends : reqList)) {
      seen.fill(0); path.length = 0; seen[s] = 1; path.push(s);
      if (dfs(s, reqList.length - 1)) {
        while (path.length && free[path[path.length - 1]]) path.pop();
        return path.map((p) => [p % W, (p / W) | 0]);
      }
      if (timeout) return undefined;
    }
  }
  return null;
}

export function checkBoard(lines, path) {
  const g = lines.map((l) => [...l]);
  const seen = new Set();
  for (let i = 0; i < path.length; i++) {
    const [x, y] = path[i];
    if (seen.has(x + ',' + y)) return false; seen.add(x + ',' + y);
    if (i && Math.abs(x - path[i - 1][0]) + Math.abs(y - path[i - 1][1]) !== 1) return false;
    const c = g[y][x];
    if (c === '#') g[y][x] = '.'; else if (c === '.') g[y][x] = '#';
  }
  return g.every((r) => { const t = r.filter((c) => c !== '-'); return t.every((c) => c === t[0]); });
}
