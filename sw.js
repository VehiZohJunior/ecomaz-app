/* =========================================================================
   EcoMaZ — Service Worker
   Rend l'application installable ("Ajouter à l'écran d'accueil") et lui
   permet de s'ouvrir même sans connexion. Les données elles-mêmes sont
   mises en cache et synchronisées séparément, via IndexedDB et la file
   d'attente hors ligne (voir supabase-client.js) — pas ce fichier, qui ne
   s'occupe que des fichiers de l'application (HTML/CSS/JS/icônes).
   ========================================================================= */
const CACHE_NAME = 'ecomaz-shell-v120';
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

// Réseau d'abord — toujours la version la plus fraîche dès qu'il y a une
// connexion (aucun risque de rester bloqué sur une vieille version après
// une mise à jour). Le cache ne sert que de repli si le réseau échoue.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  // Seuls les fichiers de l'application sont gardés en copie : pas les données
  // du serveur ni les photos / vidéos de « Vie de l'école » (qui rempliraient
  // le téléphone), ni les lectures partielles de vidéo.
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

// Toucher une notification d'annonce : ramène l'application au premier plan
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  // Ouvre l'application concernée (parents : parent.html ; enseignants : index.html)
  const cible = (event.notification.data && event.notification.data.url) || './parent.html';
  const page = cible.replace('./', '/');
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((fenetres) => {
    // Application de l'école : toute fenêtre qui n'est ni l'application parents ni portier
    const estEcole = (u) => !u.includes('/parent.html') && !u.includes('/portier.html');
    const ouverte = fenetres.find((f) => (page === '/index.html' ? estEcole(f.url) : f.url.includes(page)));
    if (ouverte) return ouverte.focus();
    return self.clients.openWindow(cible);
  }));
});

// Notification push reçue (même application fermée) : on l'affiche
self.addEventListener('push', (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch (_e) { d = { body: event.data ? event.data.text() : '' }; }
  event.waitUntil(self.registration.showNotification(d.title || 'EcoMaZ', {
    body: d.body || '', icon: 'icon-192.png', badge: 'icon-192.png', tag: d.tag || undefined,
    renotify: !!d.tag, data: { url: d.url || './parent.html' }, vibrate: [200, 100, 200],
  }));
});
