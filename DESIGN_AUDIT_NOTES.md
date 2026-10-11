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
| L1 | D1 cartes d honneur sans verso, D3 regroupement par personne, D5 en-tête opaque | 49696b0 | Publié en aperçu |
| L2 | Jetons `ecomaz-tokens.css` (spec § 2.1, thème sombre limité à l écran), `ecomaz-motion.css` et `motion.js` (window.EmMotion), police Nunito partout, rôles de theme.css branchés sur les jetons --em-*, anneau de focus or 3 px, chiffres tabulaires, texte terracotta-800 sur fond terracotta (contraste AA) | voir git log | À valider sur l aperçu |
| L3 | Icônes Lucide (87, licence ISC, sources dans `tools/lucide-icons/`, générateur `tools/generer_icones.py`) : `icones.js` remplace l'emoji de tête des éléments d'interface (menu, titres, boutons, onglets, badges, bulles, barre du bas, recherche) avant l'affichage ; textes saisis par l'école jamais modifiés ; main de salutation en SVG ; grille des espaces de connexion corrigée sur petit écran. Poids ajouté : icones.js 8,5 Ko + motion.js 1,4 Ko gzippés (budget 10 Ko respecté) | voir git log | À valider sur l'aperçu |
| L4 | Console parent (§ 5.1) : en-tête de marque (pastille « E », EcoMaZ Parents + école, boutons 44 px, cloche avec pastille animée), salutation 26 px avec main qui salue deux fois, fiche enfant en carte forte (avatar or, détails, **présence de la semaine** branchée sur les vraies présences — règle de base section 43, lecture seule de SES enfants, 2 tests ajoutés), alerte d'absence du jour sans délai, actualités avec bloc date et « Tout voir », tableau d'honneur animé (halo or sur l'élève à l'honneur ; bouton Applaudir prêt mais masqué, `ENABLE_APPLAUSE = false`), barre basse Accueil/Messages/Suggestions/Profil avec pastille glissante, onglet Profil (nom, enfants, déconnexion), toasts animés. Écarts : pas d'onglet Paiements (paiement en ligne désactivé) ; dates d'actualité = date de publication (pas de date d'événement en base) | voir git log | À valider sur l'aperçu |
| L5 | Console portier (§ 5.2) sur le fonctionnement existant : thème sombre dédié dès la connexion (bouton clair/sombre masqué), en-tête « PORTAIL · école / Arrivée des parents » + pastille « En service », grandes cibles (classes, élèves, bouton or « Prévenir »), états visuels : envoi (spinner, durée réelle), confirmation (cercle vert, coche dessinée, onde, heure HHhMM, « Nouveau signalement », vibration 30 ms), échec (cercle rouge sans rebond, message, « Réessayer » / « Retour », vibration 60-40-60). Enregistrement inchangé (une ligne `notifications_portier`). Pas de scan de badge parent (décision du 2026-10-11) | voir git log | À valider sur l'aperçu |
| L6 | Administration (§ 5.3) : barre latérale (entrées 700, rayon 12, survol discret), chiffres clés en cascade + compteurs **une seule fois** par session, états vides explicites (« Appel non effectué » + « Faire l'appel », « Aucun pointage aujourd'hui » + « Voir le journal »), barres de répartition animées (40 ms, max 12), alertes du jour en pastilles ou message positif (et « appel pas encore fait » quand il n'a pas eu lieu), tableaux (lignes 48 px, montants à droite), formulaires (44 px, rayon 12, focus vert), toasts de réussite avec coche dessinée, format monétaire « 600 000 F CFA » (constante DEVISE), **validation des dates à la saisie** (naissance ni future, ni après l'inscription, âge ≥ 6 mois) | voir git log | À valider sur l'aperçu |

### Fiches existantes aux dates incohérentes (§ 6.2 — non corrigées automatiquement)
- EL-0005 (Garderie) : naissance 23/09/2026, inscription 11/09/2026 — naissance après inscription.
- EL-0005 (second élève portant le même matricule) : naissance 05/09/2026, inscription 12/08/2026 — naissance après inscription.
- EL-0034 : naissance 12/10/2026 (dans le futur), inscription 27/10/2026 (dans le futur).
Les noms complets sont dans le journal local (non publié).

### Anomalie découverte, non corrigée (signalée)
- **Matricules en double** : deux élèves portent EL-0005. Le matricule est calculé à partir du nombre d'élèves (`EL-` + effectif + 1) : après une suppression, un matricule déjà attribué peut être redonné. Correction proposée (logique métier, hors refonte visuelle) : prendre le plus grand numéro existant + 1.
| L7 | Espace enseignant (§ 5.4), adapté à l'existant : page de pointage par lien SMS (`pointage-gps.html`) — grand bouton rond 160 px avec anneau qui pulse tant que non pointé, écrans « Localisation en cours… » / « Validation en cours… » (spinner), succès (cercle vert, coche dessinée, onde, heure, « Bonne journée ! », vibration), « Vous semblez hors de l'établissement » et « À vérifier » au ton factuel sans animation ludique, erreur avec « Réessayer » ; logique et appel serveur inchangés. Emploi du temps : créneau en cours encadré d'or avec la mention « En cours ». Bouton de thème non ajouté sur les pages simples. Pas de confettis (aucun jalon de ponctualité n'existe dans les données) | voir git log | À valider sur l'aperçu |
| L8 | Page de présentation pour les écoles (§ 5.5), dossier `landing/` (générée par `tools/generer_landing.py`, icônes Lucide intégrées) : navigation, hero (orbite, cascade, reflet du bouton, téléphone flottant avec 3 notifications en boucle sans chevauchement), bandeau des niveaux défilant incliné, 6 fonctionnalités, frise de la journée (ligne qui se dessine au défilement), données, témoignage (espace réservé), tarifs 600 000 / 50 000 F CFA, FAQ accessible (une réponse à la fois, délai en espace réservé), appel final WhatsApp, pied de page ; contacts centralisés dans `landing/site-config.js` ; SEO (titre, description ≤ 160, Open Graph, un seul h1). **Écarts volontaires** : (1) la spec dit « une base par école cliente » — c'est faux techniquement (une base commune, chaque école cloisonnée par des règles de sécurité) : le texte décrit la réalité ; (2) les notifications du téléphone montrent des fonctions réelles (annonce de début des cours, paiement reçu, actualité) au lieu de « Arrivée à 7h42 » et « Sortie validée », qui n'existent pas ; (3) « Sorties sécurisées » devient « Arrivées des parents signalées » ; (4) image Open Graph 1200×630 à créer (l'icône 512 px sert en attendant) | voir git log | À valider sur l'aperçu |
| L9 | Passe finale : anneau de focus or **doublé d'un liseré vert foncé** (visible sur fond clair et sombre) ; tous les éléments cliquables non natifs (div/span avec onclick) reçoivent le rôle « bouton » et l'accès clavier Entrée/Espace (theme.js) ; audit de contraste automatisé sur tous les écrans Direction, console Parent, console Portier (connexion, liste, confirmation, échec) et page de présentation, en clair et en sombre — seul défaut trouvé : heures de la frise de la landing en sombre (corrigé) ; « réduire les animations » : aucun élément ne reste invisible, 2 boucles infinies au maximum dans la console parent ; console développeur synchronisée sur la branche `design/motion-refonte` de son dépôt (jetons, Nunito, icônes, animations ; 2 icônes ajoutées : cadenas ouvert, carte bancaire) | voir git log | À valider |

### Performance (§ 8) — écart à signaler
Poids JavaScript ajouté par la refonte (gzip) : ≈ 17 Ko (icones.js 8,6 Ko, chargé en différé ; app.js + 6,7 Ko pour les nouveaux écrans parent/portier/administration ; motion.js 1,4 Ko ; autres < 1 Ko). Le budget de la spécification est de 10 Ko : **dépassé d'environ 7 Ko**. Atténuations : icones.js est chargé en « defer » (ne bloque pas l'affichage) et tous les fichiers sont mis en cache par le service worker (coût uniquement au premier chargement). Réduction possible plus tard : minifier les fichiers (demande un outil de construction, aujourd'hui absent) ou retirer les icônes jamais affichées. Lighthouse n'a pas été lancé (outil non installé ici).
