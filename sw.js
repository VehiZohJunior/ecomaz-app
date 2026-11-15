/* =========================================================================
   EcoMaZ â€” Service Worker
   Rend l'application installable ("Ajouter Ã  l'Ã©cran d'accueil") et lui
   permet de s'ouvrir mÃªme sans connexion. Les donnÃ©es elles-mÃªmes sont
   mises en cache et synchronisÃ©es sÃ©parÃ©ment, via IndexedDB et la file
   d'attente hors ligne (voir supabase-client.js) â€” pas ce fichier, qui ne
   s'occupe que des fichiers de l'application (HTML/CSS/JS/icÃ´nes).
   ========================================================================= */
const CACHE_NAME = 'ecomaz-shell-v186';
const SHELL_FILES = [
  './',
  './index.html',
  './parent.html',
  './portier.html',
  './enseignant.html',
  './espace-fixe.min.js',
  './ecomaz-tokens.css',
  './ecomaz-motion.css',
  './motion.min.js',
  './icones.min.js',
  './icones.svg',
  './theme.css',
  './theme.min.js',
  './recherche.min.js',
  './style.css',
  './app.min.js',
  './config.js',
  './supabase-client.min.js',
  './i18n.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('ecomaz-shell-') && k !== CACHE_NAME).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

// RÃ©seau d'abord â€” toujours la version la plus fraÃ®che dÃ¨s qu'il y a une
// connexion (aucun risque de rester bloquÃ© sur une vieille version aprÃ¨s
// une mise Ã  jour). Le cache ne sert que de repli si le rÃ©seau Ã©choue.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  // Seuls les fichiers de l'application sont gardÃ©s en copie : pas les donnÃ©es
  // du serveur ni les photos / vidÃ©os de Â« Vie de l'Ã©cole Â» (qui rempliraient
  // le tÃ©lÃ©phone), ni les lectures partielles de vidÃ©o.
  if (new URL(event.request.url).origin !== self.location.origin || event.request.headers.has('range')) return;
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copie = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copie)).catch(() => {});
        return response;
      })
      .catch(() => caches.match(event.request, { ignoreSearch: true }).then((trouve) => trouve || caches.match('./index.html')))
  );
});

// Toucher une notification d'annonce : ramÃ¨ne l'application au premier plan
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  // Ouvre l'application concernÃ©e (parents : parent.html ; enseignants : index.html)
  const cible = (event.notification.data && event.notification.data.url) || './parent.html';
  const page = cible.replace('./', '/');
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((fenetres) => {
    // Application de l'Ã©cole : toute fenÃªtre qui n'est ni l'application parents ni portier
    const estEcole = (u) => !u.includes('/parent.html') && !u.includes('/portier.html');
    const ouverte = fenetres.find((f) => (page === '/index.html' ? estEcole(f.url) : f.url.includes(page)));
    if (ouverte) return ouverte.focus();
    return self.clients.openWindow(cible);
  }));
});

// Notification push reÃ§ue (mÃªme application fermÃ©e) : on l'affiche
self.addEventListener('push', (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch (_e) { d = { body: event.data ? event.data.text() : '' }; }
  // Rappel insistant (appel non fait) : reste Ã  l'Ã©cran jusqu'Ã  ce qu'on le touche, longue vibration, son du tÃ©lÃ©phone ;
  // si l'application est ouverte, elle affiche aussi son Ã©cran Â« Appel non fait Â» avec un bip.
  const insistant = !!d.insistant;
  event.waitUntil(Promise.all([
    self.registration.showNotification(d.title || 'EcoMaZ', {
      body: d.body || '', icon: 'icon-192.png', badge: 'icon-192.png', tag: d.tag || undefined,
      renotify: !!d.tag, data: { url: d.url || './parent.html' }, silent: false,
      vibrate: insistant ? [600, 200, 600, 200, 600, 200, 1000] : [200, 100, 200],
      requireInteraction: insistant,
    }),
    insistant ? self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(f => f.forEach(c => c.postMessage({ type: d.type === 'scolarite' ? 'rappel-scolarite' : 'rappel-appel' }))) : null,
  ]));
});
