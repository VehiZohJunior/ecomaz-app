# EcoMaZ — Installer un serveur local (école sans accès internet)

Ce guide permet de faire tourner EcoMaZ **entièrement dans les murs d'une école**, sans aucune connexion internet, en utilisant un ordinateur (ou un petit boîtier type Raspberry Pi 4/5, 4 Go de RAM minimum) comme serveur local. Les appareils du personnel (téléphones, tablettes, ordinateurs) s'y connectent par le **wifi local de l'établissement** — pas besoin qu'il aille jusqu'à internet.

**Important, à savoir avant de commencer :**
- Une école en mode local devient une île indépendante : ses données restent dans ses murs. Elles n'apparaissent pas dans la Console Développeur et ne se partagent pas automatiquement avec le reste d'EcoMaZ, jusqu'à ce qu'une synchronisation manuelle soit faite (voir tout en bas de ce guide).
- **Les vrais SMS aux parents ne peuvent physiquement pas fonctionner sans internet** (Africa's Talking, le service qui envoie les SMS, est sur internet — aucune solution locale ne peut contourner ça). Les notifications internes à l'application (Direction/Fondation) continuent de fonctionner normalement en local.
- Cette installation est plus technique que le reste d'EcoMaZ — prévoir l'aide d'une personne à l'aise avec l'informatique pour la faire une fois. Ensuite, le personnel de l'école utilise l'appli normalement, sans rien connaître de tout ça.

---

## Ce qu'il faut avant de commencer

- Un ordinateur ou boîtier qui va rester allumé en permanence dans l'école (ou au moins pendant les heures d'utilisation)
- Une connexion internet **temporaire, une seule fois**, pour installer les outils (ensuite, plus besoin)
- Un routeur wifi dans l'école (pour que les téléphones/tablettes du personnel se connectent au serveur local)

## Étape 1 — Installer Docker

Docker est l'outil qui fait tourner le serveur. Télécharger et installer **Docker Desktop** :
- Windows/Mac : https://www.docker.com/products/docker-desktop/
- Raspberry Pi / Linux : suivre https://docs.docker.com/engine/install/

Vérifier que ça fonctionne en ouvrant un terminal et en tapant :
```bash
docker --version
```

## Étape 2 — Installer l'outil Supabase (CLI officiel)

```bash
npm install -g supabase
```

*(Nécessite Node.js — déjà présent sur la plupart des ordinateurs utilisés pour le développement ; sinon l'installer depuis nodejs.org)*

## Étape 3 — Démarrer le serveur local

Dans un dossier dédié (ex. créer un dossier `EcoMaZ-Serveur` sur le Bureau) :

```bash
supabase init
supabase start
```

La première fois, ça télécharge les briques nécessaires (peut prendre plusieurs minutes selon la connexion). À la fin, un résumé s'affiche avec plusieurs adresses et clés — **les noter précieusement**, notamment :
- `API URL` (ressemble à `http://127.0.0.1:54321`)
- `anon key` (une longue chaîne de caractères)

## Étape 4 — Créer les tables de la base de données

1. Ouvrir l'adresse `Studio URL` affichée à l'étape 3 (ressemble à `http://127.0.0.1:54323`) dans un navigateur
2. Aller dans **SQL Editor**
3. Ouvrir le fichier `supabase/schema.sql` (dans le dossier de l'application EcoMaZ), copier tout son contenu, le coller, puis **Run**
4. Créer le premier compte Direction de cette école : **Authentication → Add user**, puis dans SQL Editor :
   ```sql
   insert into profiles (id, ecole_id, role, nom_complet)
   values ('<UID du compte créé>', (select id from ecoles limit 1), 'direction', 'Nom du directeur');
   ```
   (Si aucune école n'existe encore, la créer d'abord : `insert into ecoles (nom_ecole) values ('Nom de l'école') returning id;`)

## Étape 4bis — Déployer les fonctions techniques (pointage, absences...)

Plusieurs fonctionnalités (pointage QR, notification d'absence) passent par des "fonctions serveur" (Edge Functions) — elles aussi doivent tourner sur le serveur local, sinon ces boutons ne fonctionneront pas du tout :

```bash
supabase functions deploy enregistrer-pointage --no-verify-jwt
supabase functions deploy notifier-absence-eleve --no-verify-jwt
supabase functions deploy creer-ecole-cliente --no-verify-jwt
supabase functions deploy supprimer-ecole-cliente --no-verify-jwt
```

## Étape 5 — Connecter l'application à ce serveur local

1. Copier tout le dossier de l'application EcoMaZ (`EcoMaZgit`) sur le serveur local
2. Ouvrir le fichier `config.js` avec un éditeur de texte
3. Remplacer les deux valeurs par celles notées à l'étape 3 :
   ```js
   const SUPABASE_URL = 'http://ADRESSE-IP-DU-SERVEUR:54321';
   const SUPABASE_KEY = 'la anon key notée à l\'étape 3';
   ```
   ⚠️ Remplacer `127.0.0.1` par l'**adresse IP locale réelle** du serveur sur le réseau wifi de l'école (ex. `192.168.1.50`), sinon seul l'ordinateur serveur lui-même pourra se connecter — pas les téléphones du personnel. Trouver cette adresse avec `ipconfig` (Windows) ou `ifconfig` (Mac/Linux).
4. Servir ces fichiers sur le réseau local — le plus simple : utiliser le petit serveur déjà fourni (`node .devserver.js`) directement sur la machine serveur, ou n'importe quel serveur de fichiers statiques

## Étape 6 — Connexion du personnel

Sur chaque téléphone/tablette/ordinateur de l'école : se connecter au wifi de l'établissement, puis ouvrir dans le navigateur l'adresse du serveur (ex. `http://192.168.1.50:5190`). Installer l'application (📲 Installer l'application) pour un accès plus rapide au quotidien.

---

## Synchroniser plus tard avec le cloud (optionnel)

Si l'école obtient un jour une connexion internet (même occasionnelle — un déplacement en ville avec le boîtier, une clé 4G ponctuelle), il est possible d'exporter les données locales (bouton **"Exporter une sauvegarde (JSON)"** dans Paramètres) et de les transmettre pour une synchronisation manuelle vers le compte cloud de l'école — cette étape n'est pas automatisée aujourd'hui, elle se fait au cas par cas.
