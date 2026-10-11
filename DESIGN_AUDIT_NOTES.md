# EcoMaZ — Rapport de reconnaissance (Lot 0)

Spécification : `ECOMAZ_MOTION_DESIGN_SPEC.md` (§ 0.3). Établi le 2026-10-11 sur la branche `design/motion-refonte`.
Aucun fichier de l'application n'a été modifié pour ce lot.

## 1. Dépôt de travail et hébergement — ÉCART avec la spécification

| Spécification | Réalité constatée |
|---|---|
| Hébergement Netlify (plan Pro), projets `glittery-tulumba-6f5e2a` / `gorgeous-macaron-643d09` | **GitHub Pages** : https://vehizohjunior.github.io/ecomaz-app/ (dépôt `VehiZohJunior/ecomaz-app`, branche `main`). Netlify **n'est plus utilisé** (décision de l'utilisateur, 2026-10-10) ; `gorgeous-macaron` sert une ancienne copie. |
| Déploiement de prévisualisation Netlify par lot | GitHub Pages ne publie qu'une branche : **pas de prévisualisation automatique**. Voir § 9 (décision à prendre). |
| Supabase plan Pro | Projet `hvqtsvpkxffseclsfoun` (plan non vérifié ici). |

Dépôt de travail local : `Bureau\DOSSIER CODAGE\EcoMaZgit` (git, relié à GitHub). Console développeur : `Bureau\DOSSIER CODAGE\EcoMaZ-dev-console` (dépôt `ecomaz-dev-console`). Journal des actions : `Bureau\DOSSIER CODAGE\EcoMaZ-journal`.

## 2. Stack

- **Framework** : aucun — HTML + JavaScript natif (pas de React/Vue). Une seule application monopage générée par `app.js` (5 914 lignes, fonctions `renderX()` qui produisent du HTML en chaînes de caractères).
- **Build** : aucun. Les fichiers sont servis tels quels.
- **Pages** : `index.html` (personnel), `parent.html`, `portier.html` (applications installables, mêmes scripts + `espace-fixe.js`), `affichage.html` (écran TV), `pointage-gps.html` (lien GPS enseignant), `confidentialite.html`, `landing-parent/` (page de présentation, non publiée).
- **Données** : `supabase-client.js` (Supabase JS v2 par CDN), `config.js`.
- **Installable (PWA)** : `manifest.json`, `sw.js` (cache réseau d'abord), manifeste généré à la volée pour les noms « EcoMaZ-… ».

## 3. Styles

- CSS global : `theme.css` (jetons, 141 lignes) puis `style.css` (composants, 617 lignes). Pas de Tailwind, pas de modules CSS.
- **Variables CSS déjà en place** (refonte du 2026-10-09/10) : palette vert forêt `--forest-50…950` (primaire `#245840`), accent terre cuite `--clay-*`, neutres teintés, sémantiques, échelle typo, espacements base 4, rayons, 3 ombres, durées et courbe `cubic-bezier(.2,0,0,1)`, plus des **alias historiques** (`--primary`, `--green`…) utilisés partout.
- Styles en ligne dans `app.js` : nombreux (mise en page) ; tailles et rayons déjà convertis en jetons, ~35 `font-size` restants.
- **Polices actuelles** : Plus Jakarta Sans (titres) + Inter (texte) ; Baloo 2 + Nunito pour la console parent. → La spec demande **Nunito seule** (à faire au Lot 2).
- **Écarts de jetons** avec la spec : vert primaire `#245840` (spec `#1f5c46`), terre cuite `#b9482a` (spec `#b5492f`), **pas d'or** (`--em-gold-*` à créer). Préfixe des jetons : spec `--em-*` ; existant sans préfixe → au Lot 2, créer les `--em-*` et rebrancher les alias existants dessus (un seul système).

## 4. Animation

- Aucune bibliothèque (ni Framer Motion, ni GSAP, ni Lottie).
- Existant : apparition des vues en fondu + 8 px, fenêtres animées, cartes d'honneur **retournables** (3D), animations d'entrée en cascade des panneaux de la console parent, `prefers-reduced-motion` respecté globalement.

## 5. Mode sombre

- Existe. Piloté par `theme.js` : attribut `data-theme="dark|light"` sur `<html>`, préférence mémorisée (`localStorage`, clé `ecomaz_theme`), sinon réglage système. Bouton 🌙/☀️ dans la barre du haut et sur l'écran de connexion. → **Compatible** avec la spec § 2.1 (pas de second système à créer).

## 6. Fichiers par espace et composants partagés

| Espace | Point d'entrée | Fonctions principales (`app.js`) |
|---|---|---|
| Administration (Direction/Fondation/Secrétariat) | `index.html` | `renderDashboard`, `renderEleves`, `renderNotes`, `renderPresencesEleves`, `renderEmploiTemps`, `renderProgrammes`, `renderPointageScan`, `renderEnseignants`, `renderPresencesEnseignants`, `renderComptabilite` (+11 onglets), `renderMessagerie`, `renderTableauAffichage`, `renderParametres` |
| Parent | `parent.html` | `enterAppParent`, `renderParentDashboard`, `renderActualitesParent`, `renderTableauHonneurParent`, bulles (`renderBulles`…) |
| Portier | `portier.html` | `enterAppPortier`, `renderPortierDashboard`, `renderPortierBarreRecherche` |
| Enseignant | `index.html` (même application que l'administration, menu réduit) | mêmes écrans, 5 pages ; pointage GPS par lien SMS → `pointage-gps.html` |

Composants partagés : `.card`, `.panel`, `.btn` (+ variantes), `.badge`, `.subtab`, `.table-wrap` (cartes sur téléphone via `theme.js`), `.modal`, `.topbar`, `.sidebar` + `.nav-item`, barre du bas `.bottom-nav` (`theme.js`), recherche globale (`recherche.js`), pile de notifications `#toastStack`.

## 7. Tableau d'honneur — cause du bug D1 (texte en miroir)

- Composant : `renderTableauHonneurParent()` (`app.js` ≈ l. 1132) + CSS `.hc-*` (`style.css` ≈ l. 545-560).
- C'est une **carte retournable** : `.hc-flip` tourne de `rotateY(180deg)` au toucher ; la face arrière est elle-même tournée de 180°, et les deux faces ont `backface-visibility: hidden` **sans le préfixe `-webkit-`**.
- **Cause probable** : sur Safari iOS et certains navigateurs Android, sans `-webkit-backface-visibility`, la face cachée reste visible **à l'envers** (texte en miroir) ; même effet sur une capture « page entière ». Le toucher rend aussi la carte retournée inattendue pour un parent.
- Correction prévue au Lot 1 : supprimer le retournement (la nouvelle carte § 5.1.6 n'a pas de verso).

## 8. Points de la spécification qui ne correspondent pas à l'existant (à arbitrer)

1. **D3 « doublons »** : ce n'est pas un bug de requête. La base contient **3 entrées réelles distinctes** pour la catégorie élève : Kylian Manga (CM1) est saisi pour le **mois**, le **trimestre** et l'**année**. Il n'y a aucun doublon par catégorie **et** période. Option : regrouper visuellement une même personne en une seule carte avec plusieurs badges (« Mois · Trimestre · Année »).
2. **D4 date incohérente** : fiche réelle de Yepri BOKRA — naissance 23/09/2026, inscription 11/09/2026 (erreur de saisie probable). Liste complète des fiches incohérentes au Lot 6 ; aucune correction automatique.
3. **« Présence de la semaine » dans la fiche enfant** : un parent **n'a pas le droit de lire** la table des présences (règle de sécurité actuelle). L'afficher demande une nouvelle règle en base → **accord explicite nécessaire**. Sinon le bloc reste masqué (jamais de fausses données).
4. **Console portier (§ 5.2)** : la spec décrit un « contrôle de sortie » par **scan du badge du parent**, avec « sortie autorisée / refusée » et « récupéré par ». L'existant est différent : le portier choisit une classe ou tape le nom de l'élève pour **prévenir l'enseignant** que le parent est arrivé. Pas de scan parent, pas de liste de personnes autorisées. Appliquer § 5.2 tel quel = **nouvelle fonctionnalité** (logique + base), pas une refonte visuelle. Proposition : appliquer au Lot 5 le **thème sombre et les états visuels** (attente, envoi, confirmation) à l'existant, et traiter le contrôle de sortie comme un projet séparé si vous le voulez.
5. **Paiement Mobile Money parent (§ 5.1.8)** : le paiement en ligne est **désactivé** (configuration inactive). Pas d'écran à animer pour l'instant.
6. **Barre basse parent (Accueil, Messages, Paiements, Profil)** : la console parent est **une seule page** ; messages/notifications/suggestions sont des bulles en haut. Les onglets demandés supposent de nouveaux écrans. Proposition : barre basse limitée aux entrées réelles (Accueil, Messages, Profil) ou garder les bulles.
7. **Espace enseignant (§ 5.4)** : pas d'application enseignant séparée, ni de « création de cours », ni de bouton « Pointer mon arrivée » dans l'app (le pointage se fait par badge QR ou par lien SMS GPS). Le Lot 7 portera sur l'existant : `pointage-gps.html` (bouton circulaire, états GPS) et les écrans enseignant de l'app.
8. **Bouton « Applaudir »** : demande une table en base → derrière un drapeau désactivé, comme le prévoit la spec, jusqu'à votre accord.
9. **Landing page (§ 5.5)** : la page existante `landing-parent/` vise les **parents** ; la spec décrit une page **commerciale pour les écoles** (tarifs 600 000 / 50 000 F CFA, démo). Ce sera une nouvelle page ; témoignage et délai restent des espaces réservés.
10. **Police** : la spec impose Nunito seule ; la refonte récente utilise Plus Jakarta Sans + Inter. Le Lot 2 remplacera par Nunito (cohérent avec la console parent).
11. **Emojis** : très nombreux dans l'interface (menu, titres, boutons, bulles). Lot 3 = remplacement par des icônes SVG Lucide intégrées (sans dépendance).

## 9. Méthode de travail proposée (décision à prendre)

- Branche `design/motion-refonte` (créée), un commit par lot, rien sur `main` sans votre accord.
- **Prévisualisation** (GitHub Pages n'en propose pas) — options gratuites :
  - (a) **Prévisualisation sur cet ordinateur** (serveur local) : vous ne pourrez pas la voir sur votre téléphone.
  - (b) **Copie de prévisualisation en ligne** dans un sous-dossier `/preview/` de la branche `main` : visible sur téléphone à `…/ecomaz-app/preview/`, sans toucher à l'application de l'école. La base de données reste la vraie (lecture réelle, mêmes comptes).
  - (c) Un **second dépôt GitHub** dédié aux prévisualisations (à créer par vous).
- Chaque lot : résumé des fichiers, captures, liste de ce qu'il reste à valider, ligne dans le journal local.

## 10. Décisions de Vehi Zoh Junior (2026-10-11)

1. **Prévisualisation** : dossier `/preview/` en ligne (https://vehizohjunior.github.io/ecomaz-app/preview/), publié par `tools/publier_apercu.py` depuis la branche `design/motion-refonte`. L'application de l'école (racine) n'est pas touchée. Même base de données et mêmes comptes ; la connexion est partagée avec l'application réelle (même adresse).
2. **Présence de la semaine (parent)** : accord pour une règle en base permettant à un parent de lire **uniquement** les présences de **ses** enfants (Lot 4, testée avant publication).
3. **Console portier** : nouveau look (thème sombre, états visuels) **sur l'existant** ; pas de contrôle de sortie par badge (projet séparé si besoin).
4. **Tableau d'honneur** : une carte par personne et par catégorie, avec un badge par période (« Mois · Trimestre · Année »).

## 11. Journal des lots

| Lot | Contenu | Commit (branche) | État |
|---|---|---|---|
| L0 | Rapport de reconnaissance | 46c18f6 | Fait |
| L1 | D1 cartes d'honneur sans verso (plus de texte en miroir), D3 regroupement par personne, D5 en-tête collant opaque | voir `git log` | À valider sur l'aperçu |
