// Service worker : met tout le jeu en cache pour qu'il fonctionne hors ligne.
// À chaque nouvelle version publiée, incrémenter CACHE pour forcer la mise à jour.
const CACHE = 'cariflip-1.3.0';
const FILES = [
  './', 'index.html', 'manifest.webmanifest', 'css/style.css',
  'js/main.js', 'js/renderer.js', 'js/board.js', 'js/generator.js', 'js/rng.js',
  'js/puzzle.js', 'js/challenge.js', 'js/pieces.js', 'js/solver.js', 'js/start.js', 'js/storage.js', 'js/audio.js',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png',
  'icons/maskable-512.png', 'icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('cariflip-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Cache d'abord (jeu instantané et hors ligne), réseau en secours.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || fetch(e.request))
  );
});
