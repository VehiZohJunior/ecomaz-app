# EcoMaZ — Gestion Scolaire

Application de gestion scolaire multi-établissements (élèves, notes, présences,
pointage QR, comptabilité, messagerie/SMS) pour écoles en Côte d'Ivoire.

## Structure du dossier

```
index.html              → page d'entrée de l'application
style.css                → tous les styles
app.js                    → toute la logique de l'application
i18n.js                   → traductions (français / anglais)
config.js                 → SEUL fichier à modifier pour changer de serveur (cloud ↔ local)
supabase-client.js        → connexion à la base de données Supabase + mode hors ligne
sw.js / manifest.js       → installabilité (PWA) et cache de l'application
supabase/
  schema.sql               → structure complète de la base de données (référence, à exécuter dans Supabase SQL Editor)
  functions/                → fonctions serveur (SMS, pointage, notifications, gestion des écoles)
serveur-local/
  GUIDE-INSTALLATION.md    → faire tourner EcoMaZ sans aucun accès internet (serveur local dans l'école)
```

Aucune installation ni compilation n'est nécessaire : les fichiers `.html`, `.css`
et `.js` à la racine forment un site 100% statique, prêt à être hébergé tel quel
(GitHub Pages, Netlify, ou tout hébergeur de fichiers statiques) — ou servi
localement dans une école sans internet, voir `serveur-local/`.

Le dossier `supabase/` n'est **pas** servi comme page web — c'est une référence
technique (schéma de base de données + fonctions serveur) à coller manuellement
dans le tableau de bord Supabase du projet, comme cela a déjà été fait pour ce
projet. Aucune clé secrète n'y figure : seule la clé publique Supabase
(volontairement visible, sans danger) se trouve dans `config.js`.

## Mode hors ligne

L'application fonctionne sans connexion pendant l'utilisation (données mises en
cache, actions mises en file d'attente et synchronisées au retour du réseau —
voir `supabase-client.js`). Pour une école n'ayant **jamais** accès à internet,
voir `serveur-local/GUIDE-INSTALLATION.md` : un serveur installé physiquement
dans l'école, sans dépendance au cloud.

## Déploiement sur GitHub Pages

1. Créer un nouveau dépôt sur GitHub et y déposer tout le contenu de ce dossier
2. Dans le dépôt : **Settings → Pages**
3. Sous "Build and deployment", choisir **Deploy from a branch**
4. Branche : **main**, dossier : **/ (root)**
5. Enregistrer — le site sera disponible à `https://<utilisateur>.github.io/<nom-du-depot>/` après quelques minutes

## Base de données

Le projet utilise Supabase (PostgreSQL + authentification + sécurité au niveau
des lignes). Toute la structure de base est dans `supabase/schema.sql`,
exécutée section par section au fil du développement — la base de données déjà
en place n'a pas besoin d'être reconstruite, ce fichier sert de documentation
et de référence en cas de nouvelle installation.
