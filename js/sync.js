// Synchronisation des profils entre appareils (Supabase, deux fonctions SQL : cariflip_get / cariflip_put).
// Le jeu reste 100 % local : la synchro tourne en tâche de fond quand le réseau est là.
// Algorithme : lire la version distante, fusionner avec la locale (fusion sans perte, voir storage.js),
// écrire si besoin avec le numéro de révision lu ; si quelqu'un a écrit entre-temps, on recommence.
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';
import { getDevice, getFamily, mergeFamily, adoptFamily, sameFamily, save, onSave } from './storage.js';

export const syncConfigured = () => !!(SUPABASE_URL && SUPABASE_KEY);

let state = 'idle';            // idle | syncing | ok | offline | error | off
let lastError = '';
const watchers = [];
export const onSyncState = (fn) => watchers.push(fn);
export const syncState = () => ({ state, lastSync: getDevice().lastSync, error: lastError });
function setState(s, err = '') { state = s; lastError = err; watchers.forEach((fn) => fn(syncState())); }

function headers() {
  const h = { 'Content-Type': 'application/json', apikey: SUPABASE_KEY };
  // Ancienne clé « anon » (JWT) : aussi en Authorization. Les clés sb_publishable_ vont seulement dans apikey.
  if (SUPABASE_KEY.startsWith('eyJ')) h.Authorization = `Bearer ${SUPABASE_KEY}`;
  return h;
}
async function rpc(fn, body) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  try {
    const r = await fetch(`${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/rpc/${fn}`, {
      method: 'POST', headers: headers(), body: JSON.stringify(body), signal: ctrl.signal, cache: 'no-store',
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const txt = await r.text();
    return txt ? JSON.parse(txt) : null;
  } finally { clearTimeout(timer); }
}
export const fetchFamily = (code) => rpc('cariflip_get', { p_code: code });

let running = null, again = false;
export function syncNow() {
  if (!syncConfigured() || !getDevice().code) { setState('off'); return Promise.resolve(false); }
  if (running) { again = true; return running; }
  running = (async () => {
    setState('syncing');
    try {
      for (let attempt = 0; attempt < 4; attempt++) {
        const dev = getDevice();
        const remote = await fetchFamily(dev.code);
        const rev = remote ? Number(remote.rev) || 0 : 0;
        const merged = mergeFamily(getFamily(), remote ? remote.data : null);
        if (remote && sameFamily(merged, remote.data)) {
          dev.rev = rev;
        } else {
          const newRev = await rpc('cariflip_put', { p_code: dev.code, p_data: merged, p_rev: rev });
          if (newRev === null || newRev === undefined) continue; // conflit : relire et refusionner
          dev.rev = Number(newRev);
        }
        // Ce qui a pu être joué pendant la requête est conservé : on refusionne avec l'état local du moment.
        adoptFamily(mergeFamily(getFamily(), merged));
        dev.lastSync = Date.now();
        save(false);
        setState('ok');
        return true;
      }
      setState('error', 'conflict');
      return false;
    } catch (e) {
      setState(navigator.onLine === false || e.name === 'AbortError' || e instanceof TypeError ? 'offline' : 'error', String(e.message || e));
      return false;
    } finally {
      running = null;
      if (again) { again = false; setTimeout(syncNow, 300); }
    }
  })();
  return running;
}

// Déclencheurs : après chaque progression (regroupées), au retour au premier plan,
// au retour du réseau, et régulièrement tant que l'app est affichée.
let debounce = 0;
export function scheduleSync(ms = 2500) {
  clearTimeout(debounce);
  debounce = setTimeout(syncNow, ms);
}
export function startSync() {
  onSave(() => scheduleSync());
  document.addEventListener('visibilitychange', () => { if (!document.hidden) syncNow(); else if (debounce) syncNow(); });
  window.addEventListener('online', () => syncNow());
  window.addEventListener('pagehide', () => { if (debounce) syncNow(); });
  setInterval(() => { if (!document.hidden) syncNow(); }, 45000);
  syncNow();
}
