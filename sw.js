/* =========================================================================
   EcoMaZ — Service Worker
   Rend l'application installable ("Ajouter à l'écran d'accueil") et lui
   permet de s'ouvrir même sans connexion. Les données elles-mêmes sont
   mises en cache et synchronisées séparément, via IndexedDB et la file
   d'attente hors ligne (voir supabase-client.js) — pas ce fichier, qui ne
   s'occupe que des fichiers de l'application (HTML/CSS/JS/icônes).
   ========================================================================= */
const CACHE_NAME = 'ecomaz-shell-v212';
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

// Bibliothèques venant d'un autre site, indispensables au démarrage (21/11/2026) :
// avant, elles n'étaient pas gardées → sans réseau, l'application ne démarrait pas.
// Adresses VERSIONNÉES (le contenu ne change jamais) : gardées sans limite de temps,
// servies depuis le téléphone d'abord. L'empreinte de sécurité (SRI) reste vérifiée.
const CDN_FICHIERS = [
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.119.0/dist/umd/supabase.min.js',
  'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js',
  'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js',
];
const CACHE_CDN = 'ecomaz-cdn-v1';
const estCdnGarde = (url) => CDN_FICHIERS.includes(url) || url.startsWith('https://fonts.gstatic.com/') || url.startsWith('https://fonts.googleapis.com/css');

self.addEventListener('install', (event) => {
  event.waitUntil(Promise.all([
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES)),
    // Jamais bloquant : si le site extérieur ne répond pas, l'installation continue
    caches.open(CACHE_CDN).then((cache) => Promise.all(CDN_FICHIERS.map((u) => cache.add(new Request(u, { mode: 'cors', credentials: 'omit' })).catch(() => null)))),
  ]));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => (k.startsWith('ecomaz-shell-') && k !== CACHE_NAME) || (k.startsWith('ecomaz-cdn-') && k !== CACHE_CDN)).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

// Réseau d'abord — toujours la version la plus fraîche dès qu'il y a une
// connexion (aucun risque de rester bloqué sur une vieille version après
// une mise à jour). Le cache ne sert que de repli si le réseau échoue.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  // Bibliothèques extérieures : téléphone d'abord, réseau sinon (puis gardées)
  if (estCdnGarde(event.request.url)) {
    event.respondWith(caches.open(CACHE_CDN).then((cache) => cache.match(event.request, { ignoreVary: true }).then((trouve) => trouve || fetch(event.request).then((rep) => {
      if (rep && (rep.ok || rep.type === 'opaque')) cache.put(event.request, rep.clone()).catch(() => {});
      return rep;
    }))));
    return;
  }
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
  // Rappel insistant (appel non fait) : reste à l'écran jusqu'à ce qu'on le touche, longue vibration, son du téléphone ;
  // si l'application est ouverte, elle affiche aussi son écran « Appel non fait » avec un bip.
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
