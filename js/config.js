// Synchronisation des profils (Supabase). Valeurs publiques par conception : la table n'est
// accessible qu'au travers des fonctions cariflip_get / cariflip_put, avec le code famille exact.
// Laisser vide = jeu sans synchro (tout reste sur l'appareil).
let url = 'https://qlnisjlgmtagslssqhck.supabase.co';
let key = 'sb_publishable_A-2i9zIapK0TnVAx6JH3bw_5ebu7dRj';

// Surcharge locale (tests) : localStorage['cariflip.config'] = {"url": "...", "key": "..."}
try {
  const o = JSON.parse(localStorage.getItem('cariflip.config') || 'null');
  if (o && o.url) { url = o.url; key = o.key || ''; }
} catch { /* ignoré */ }

export const SUPABASE_URL = url;
export const SUPABASE_KEY = key;
