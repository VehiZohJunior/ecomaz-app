/* =========================================================================
   EcoMaZ — Service Worker
   Rend l'application installable ("Ajouter à l'écran d'accueil") et lui
   permet de s'ouvrir même sans connexion. Les données elles-mêmes sont
   mises en cache et synchronisées séparément, via IndexedDB et la file
   d'attente hors ligne (voir supabase-client.js) — pas ce fichier, qui ne
   s'occupe que des fichiers de l'application (HTML/CSS/JS/icônes).
   ========================================================================= */
const CACHE_NAME = 'ecomaz-shell-v2';
const SHELL_FILES = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './config.js',
  './supabase-client.js',
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
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

// Réseau d'abord — toujours la version la plus fraîche dès qu'il y a une
// connexion (aucun risque de rester bloqué sur une vieille version après
// une mise à jour). Le cache ne sert que de repli si le réseau échoue.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copie = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copie)).catch(() => {});
        return response;
      })
      .catch(() => caches.match(event.request).then((trouve) => trouve || caches.match('./index.html')))
  );
});
