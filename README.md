# EcoMaZ — Gestion Scolaire

Application de gestion scolaire multi-établissements (élèves, notes, présences,
pointage QR, comptabilité, messagerie/SMS) pour écoles en Côte d'Ivoire.

## Structure du dossier

```
index.html              → page d'entrée de l'application
style.css                → tous les styles
app.js                    → toute la logique de l'application
supabase-client.js        → connexion à la base de données Supabase
supabase/
  schema.sql               → structure complète de la base de données (référence, à exécuter dans Supabase SQL Editor)
  functions/envoyer-sms/    → fonction serveur d'envoi de SMS réels (à déployer dans Supabase Edge Functions)
```

Aucune installation ni compilation n'est nécessaire : `index.html`, `style.css`,
`app.js` et `supabase-client.js` forment un site 100% statique, prêt à être
hébergé tel quel (GitHub Pages, Netlify, ou tout hébergeur de fichiers statiques).

Le dossier `supabase/` n'est **pas** servi comme page web — c'est une référence
technique (schéma de base de données + fonction serveur) à coller manuellement
dans le tableau de bord Supabase du projet, comme cela a déjà été fait pour ce
projet. Aucune clé secrète n'y figure : seule la clé publique Supabase
(volontairement visible, sans danger) se trouve dans `supabase-client.js`.

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
