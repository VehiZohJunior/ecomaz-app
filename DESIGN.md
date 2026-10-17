# DESIGN.md — Direction artistique d'EcoMaZ

Ce fichier est la référence visuelle unique d'EcoMaZ. Toute décision de design doit le respecter.
En cas de doute : relire ce fichier, puis demander à ZOH. Ne jamais improviser un style.

---

## 0. Règles de sécurité (rappel — le détail est dans CLAUDE.md)

- Travailler uniquement sur la branche `refonte-design`.
- La refonte touche **l'apparence uniquement** : composants visuels, styles, mise en page, animations, formatage à l'affichage.
- Interdit de modifier : logique métier, requêtes et schéma Supabase, authentification et rôles, calculs comptables, paiement Mobile Money, scanner de badge, GPS, notifications et alertes aux parents, fichiers `.env`, format des données enregistrées.
- Ne jamais migrer vers un autre framework.
- Tests : navigation seulement. Aucune écriture en base, sauf avec les comptes de test fournis par ZOH.
- Si une amélioration visuelle exige de toucher à la logique : s'arrêter et demander.

---

## 1. Concept : « Clarté chaleureuse »

La rigueur d'un outil professionnel (ordre, précision des chiffres, fiabilité) et la chaleur d'une école qui fait grandir des enfants.

- **Trois mots** : CONFIANCE, LISIBILITÉ, FIERTÉ.
- **Niveau de qualité visé** : la finition de Linear, la clarté de Stripe, la chaleur d'Airbnb.
- **Identité** : le vert forêt pour la confiance, le terracotta pour la chaleur.
- **Touche ivoirienne** : discrète et élégante. Un motif géométrique léger en filigrane (opacité 4 à 6 %) sur l'écran de connexion et l'en-tête du tableau de bord. Jamais de wax plaqué, jamais de cliché.

### Utilisateurs réels

- Direction et secrétariat : téléphone et ordinateur.
- Parents : souvent peu à l'aise avec le numérique.
- Enseignants : Android d'entrée de gamme.
- Portier : debout, une main occupée, en extérieur.
- Contraintes : connexion 3G, forte luminosité, écrans modestes.

**Mobile d'abord. Toujours.**

---

## 2. Ce qui existe et doit être conservé

- Couleur primaire vert forêt et accent terracotta (badge « Année scolaire »).
- Mode clair **et** mode sombre.
- Barre de navigation inférieure.
- Graphique « Répartition des élèves par classe ».
- Cartes de statistiques (style du mode sombre).
- Avatars à initiales.
- Bouton principal vert plein, champs arrondis.
- Cartes « Élève du mois » et état vide « Rien en attente ».

---

## 3. Défauts constatés à corriger

1. Les panneaux suggestions / messages / notifications s'ouvrent hors de l'écran, à gauche : texte coupé.
2. Carte de paiement (Compta) : boutons « + » qui chevauchent les libellés, espace manquant entre libellé et montant (« Frais d'inscription50 000 F CFA »), « TOTAL » collé à un bouton, aucun statut par échéance.
3. Plan comptable : champs qui débordent à droite, intitulés coupés.
4. En-tête trop haut (titre + 5 boutons ronds + badge empilés, près d'un quart de l'écran).
5. Doublon : bouton « Menu » en bas et menu ☰ en haut.
6. « Vue d'ensemble par classe » : une classe occupe presque un écran.
7. Emoji mélangés aux icônes, lien bleu par défaut du navigateur, casse irrégulière des noms, alerte « appel non fait » répétée.
8. Actions représentées par des icônes seules, sans libellé.
9. **Bug** : sur plusieurs écrans, le bouton Recherche est remplacé par une deuxième icône lune.
10. Parents ↔ Élèves : chevauchements graves (numéros sur libellés, bouton d'un élève sur la fiche suivante, liste coupée).
11. Emploi du temps et Pointage : tableaux qui débordent, première colonne et textes coupés.
12. Cahier d'appel : navigation de mois en deux gros boutons séparés, colonne des noms trop large.
13. Programmes pédagogiques : 3 filtres empilés pleine largeur, titre en double.
14. Fenêtres centrées sur mobile, champs sans espacement entre les groupes.
15. Bouton natif d'envoi de fichiers du navigateur.
16. Boutons « Supprimer » répétés et dominants.
17. Titres répétés dans la première carte, sous-titres redondants (« Garderie · Garderie »).

---

## 4. Couleurs

> Les valeurs exactes du vert forêt et du terracotta doivent être **relevées dans le code** et inscrites ici. Les valeurs ci-dessous sont des estimations à remplacer.

### Marque

| Rôle | Valeur | Usage |
|---|---|---|
| Primaire | vert forêt actuel (≈ `#1F5C46`), nuances 50 → 900 | boutons principaux, onglet actif, éléments de marque |
| Accent | terracotta actuel (≈ `#B8452A`) | année scolaire, reste à payer, mises en avant |
| Accent clair | fond terracotta pâle (≈ `#FBE4DC`) | puces et badges d'accent, avec texte terracotta foncé |

Le texte sur fond terracotta clair est **toujours foncé**. Du texte blanc sur terracotta seulement si le contraste AA est atteint.

### Mode clair

| Rôle | Valeur |
|---|---|
| Fond de page | `#F7F7F5` |
| Surface (cartes) | `#FFFFFF` |
| Bordure | `#E7E5E4` |
| Texte principal | `#1C1917` |
| Texte secondaire | `#57534E` |

### Mode sombre (à conserver et affiner)

| Rôle | Valeur |
|---|---|
| Fond de page | vert-noir profond dans l'esprit actuel (≈ `#121A18`) |
| Surface | un cran plus clair (≈ `#1A2421`) |
| Surface surélevée | encore un cran (≈ `#222E2A`) |
| Bordure | ≈ `#2C3A35` |
| Texte principal | `#F5F5F4` |
| Texte secondaire | `#A8A29E` |

En mode sombre, la profondeur vient de la couleur des surfaces, pas des ombres.

### États

| État | Clair | Sombre (à ajuster pour AA) |
|---|---|---|
| Payé / Présent / Validé | `#16A34A` | `#4ADE80` |
| À payer / Retard / En attente | `#D97706` | `#FBBF24` |
| Impayé / Absent / Refusé | `#DC2626` | `#F87171` |
| Information | `#2563EB` | `#60A5FA` |

Règles absolues :
- Le vert forêt primaire n'est **jamais** utilisé pour un état.
- Un état = **icône + libellé + couleur**. Jamais la couleur seule.
- Badges d'état : fond teinté pâle, texte et icône dans la couleur foncée de l'état.

### Contraste

WCAG AA minimum partout, dans les deux modes. Vérifié écran par écran.

---

## 5. Typographie

- Conserver la police actuelle si elle est propre et lisible. Sinon : **Plus Jakarta Sans** (titres, 600–700) + **Inter** (texte, 400–600).
- Deux polices maximum. Polices auto-hébergées, `font-display: swap`.

| Usage | Taille mobile | Graisse |
|---|---|---|
| Légende, badge | 13px | 500 |
| Texte courant | 15–16px | 400 |
| Libellé de champ | 14px | 500 |
| Titre de carte | 18px | 600 |
| Titre de page (en-tête) | 20px | 700 |
| Grand chiffre (statistique) | 30–32px | 700 |

### Formats

- **Chiffres tabulaires** (`font-variant-numeric: tabular-nums`) pour montants, statistiques, heures, tableaux. Alignés à droite.
- **Montants** : `50 000 F CFA` (espace insécable comme séparateur de milliers). Toujours un espace entre libellé et montant.
- **Dates** : `jeudi 15 octobre 2026` ; format court `15 oct.` dans les listes.
- **Heures** : `08:00 – 09:00`.
- **Noms de personnes** : `Prénom(s) NOM` (« Yepri Christ Ilan BOKRA »), via une fonction de formatage **à l'affichage uniquement**. Ne jamais modifier les données enregistrées.
- **Textes saisis en majuscules** (annonces) : affichés tels quels. Dans le formulaire, rappel discret : « Évitez d'écrire tout en majuscules ».
- Tout en français. Jamais de lorem ipsum.

---

## 6. Formes, espacement, densité

- **Grille de 4px** : 4, 8, 12, 16, 20, 24, 32, 48.
- **Marges de page mobile** : 16px.
- **Arrondis** : 10px (boutons, champs), 16px (cartes), 20px (haut des feuilles coulissantes), complet (badges, avatars, puces).
- **Bordures** fines (1px) plutôt qu'ombres. 2 niveaux d'ombre maximum en mode clair.
- **Zones tactiles** : 44×44px minimum.
- **Densité** : une information simple = une ligne compacte. Interdit d'étaler « Libellé / Valeur » sur des lignes de 70px quand une seule ligne suffit.

---

## 7. Structure globale

### En-tête mobile (56px maximum, collant)

- **Gauche** : titre de la page (court), et dessous la puce terracotta « 2026-2027 » cliquable (sélecteur d'année).
- **Droite** : 2 boutons seulement — **Recherche** et **Notifications** (pastille du nombre).
- **Messages et suggestions** : regroupés dans le centre de notifications, avec onglets *Notifications / Messages / Suggestions*.
- **Bascule clair/sombre** : dans Réglages. Par défaut, suivre le réglage du téléphone.
- Le menu ☰ du haut disparaît.
- Le titre de la page est **uniquement** dans l'en-tête : la première carte ne le répète pas.

### Navigation inférieure (mobile)

5 entrées maximum, selon les écrans existants, par exemple : Accueil, Élèves, Compta, Présences, Menu.
« Menu » ouvre une feuille avec toutes les sections, regroupées (Pédagogie, Vie de l'école, Communication, Réglages).

### Desktop

Barre latérale repliable avec les mêmes sections, contenu centré (largeur max 1200px), tableaux complets.

### Panneaux

- Mobile : **tous** les panneaux (notifications, messages, suggestions, filtres, formulaires, confirmations) s'ouvrent en **feuille coulissante** depuis le bas, pleine largeur, avec poignée, titre, bouton fermer, et bouton principal collé en bas.
- Desktop : panneau ancré ou fenêtre, entièrement visible.
- **Plus jamais de panneau qui sort de l'écran.**

---

## 8. Règles transversales

### Tableaux sur mobile

Aucun tableau coupé. Deux solutions seulement :
1. **Par défaut** : transformation en liste de cartes compactes.
2. **Grilles indispensables** (cahier d'appel mensuel) : première colonne collante, défilement horizontal visible avec dégradé indicateur à droite, colonne du jour mise en évidence et visible à l'ouverture.

### Formulaires

- Libellé à 6px au-dessus du champ, 20px entre deux groupes de champs.
- Placeholders utiles (« Choisir un élève » et non « — Choisir — »).
- Erreurs en français, sous le champ, avec icône.
- 2 à 4 options : **boutons segmentés** plutôt qu'une liste déroulante.
- **Envoi de fichiers** : zone personnalisée (icône, « Ajouter des photos ou vidéos », formats en une ligne), vignettes d'aperçu, bouton pour retirer. Jamais le bouton natif.
- Textes d'aide : une phrase courte, le reste dans un encart repliable « En savoir plus ».

### Filtres

Rangée de puces défilante (« Toutes les classes ▾ », « Enseignant ▾ », « Trimestre ▾ »), chacune ouvrant une feuille de choix. Au-delà de 3 filtres : un bouton « Filtres (2) ». Filtres actifs visibles et effaçables d'un geste.

### Actions

- Actions principales = boutons avec texte. Icône seule uniquement pour les actions universelles (fermer, recherche), avec libellé accessible.
- Actions secondaires d'une ligne : menu « ⋯ » (Modifier, Supprimer…).
- **Supprimer** : jamais un gros bouton répété. Confirmation en feuille coulissante.
- Liens dans le texte : couleur primaire, soulignés au survol. **Aucun lien bleu par défaut.**

### États vides

Composant unique : icône Lucide dans un cercle teinté, phrase courte et positive, une action principale (« Créer un programme », « Effacer les filtres »).

### Chargement, erreurs, hors ligne

- Squelettes de chargement à la forme du contenu, pas de simple roue.
- Erreur : message clair en français + bouton « Réessayer ».
- Hors connexion : bandeau discret et rassurant.
- Confirmations : toast en bas (« Paiement enregistré »).

### Icônes

Lucide uniquement, épaisseur 1,75 à 2, tailles 18/20/24. **Aucun emoji** dans l'interface.

---

## 9. Mouvement

- Pression d'un bouton : 150ms.
- Apparition des cartes en cascade : 200ms, décalage 40ms.
- Feuilles coulissantes : 250ms, courbe ease-out.
- Compteurs animés sur les grands chiffres du tableau de bord.
- Animation de réussite (coche qui se dessine) après paiement, pointage, validation d'appel.
- Respect de `prefers-reduced-motion`.
- Fluide sur Android d'entrée de gamme : animer seulement `transform` et `opacity`.
- Bibliothèque d'animation seulement si légère et compatible avec le projet.

---

## 10. Composants communs

Boutons (principal, secondaire, discret, danger, avec chargement) · champs et erreurs · boutons segmentés · puces de filtre · cartes · cartes de statistiques · lignes de liste compactes · badges d'état · avatars à initiales colorées (aucune photo d'enfant ajoutée) · barre de progression · onglets · feuilles coulissantes · toasts · squelettes · états vides · zone d'envoi de fichiers · navigation inférieure · barre latérale.

Tous construits une seule fois et réutilisés. Aucun style dupliqué.

---

## 11. Direction par écran

### Console Direction

**Tableau de bord**
- En haut : « Bonjour » + date du jour.
- Bande unique **« À faire aujourd'hui »** : appel non fait, enseignants non pointés, demandes de parents, chacune avec son bouton d'action. Aucune alerte répétée ailleurs.
- Grille 2×2 de statistiques : élèves inscrits, enseignants présents aujourd'hui, encaissé ce mois, reste à encaisser.
- Répartition par classe : graphique actuel affiné (barres plus fines, nombres alignés).
- Vue d'ensemble par classe : **une ligne par classe** (nom, cycle en petit, effectif, badge « Appel fait 18/20 » ou « Appel non fait »). Appui = détail en feuille.
- Anniversaires : icône Lucide, liste compacte (avatar, nom, classe, jour).
- Mise en route (6/12) : barre de progression + étapes cochables.
- Bannière notifications : une seule fois, discrète, bouton « Activer », refermable.

**Carte de paiement élève (Compta)**
- En-tête : avatar, nom, classe ; à droite, **reste à payer** en grand (terracotta si > 0, vert si soldé).
- Barre de progression « 150 000 / 450 000 F CFA ».
- Une ligne par échéance : libellé à gauche, montant à droite, badge (Payé / À payer / En retard), bouton « Encaisser » séparé. Échéance payée : date en petit.
- Pied : TOTAL et RESTE alignés à droite.
- Actions avec libellés : « Reçu », « Lien de paiement ».
- Liste des élèves : recherche, filtres (Tous / Soldés / Avec reste / En retard), totaux de la classe en haut.

**Plan comptable**
- Mobile : une ligne par compte (numéro en gras, intitulé sur 2 lignes max, puce de catégorie). Appui = modification en feuille.
- Desktop : tableau aligné, modification en place possible.

**Parents ↔ Élèves (priorité absolue)**
- Une carte par élève : avatar, nom, puce de classe, badge « Compte relié » (vert) ou « Non relié » (ambre).
- Ligne parent : nom, numéros en puces lisibles (« 07 67 68 68 77 »).
- Actions : « Inviter » (feuille : choix du numéro et du canal), « Relier à un compte » (feuille avec recherche), « Créer par e-mail » dans le menu « ⋯ ».
- En haut : recherche, filtres Tous / Non reliés / Reliés, compteur (« 12 élèves non reliés »).
- Aucun élément d'une carte ne peut déborder sur une autre.

**Emploi du temps**
- Mobile : puce de classe, onglets des jours (Lun → Ven), jour actuel sélectionné.
- Liste verticale de créneaux : heure à gauche, cours à droite (matière, enseignant, couleur par matière).
- Créneau vide : ligne fine en pointillés « Ajouter un cours ».
- Récréation / Repos : bande fine teintée, entièrement lisible.
- Desktop : grille hebdomadaire complète.

**Cahier d'appel**
- Navigation de mois sur une ligne : `‹  Octobre 2026  ›`.
- Onglet **Aujourd'hui** par défaut sur mobile : liste des élèves, 3 boutons d'état séparés par élève (Présent / Absent / Retard), « Tous présents » en haut, « Valider l'appel » collé en bas avec le résumé (« 18 présents · 1 absent · 1 retard »).
- Onglet **Mois** : grille selon la règle des tableaux (noms collants et raccourcis si nécessaire, jour actuel en évidence, pastilles explicites).
- L'enregistrement et l'alerte aux parents ne changent pas.

**Pointage enseignants**
- Onglets Aujourd'hui / Journal / Alertes.
- Journal en cartes : enseignant, date, arrivée, départ, badge.
- Explication du pointage GPS dans un encart repliable. États vides soignés.

**Programmes pédagogiques**
- « Nouveau programme » dans l'en-tête ou en bouton flottant. Filtres en puces. État vide avec action.

**Tableau d'affichage**
- Élève du mois / trimestre / année : cartes célébratoires (avatar, nom, classe, période, médaille Lucide), « Modifier » discret.
- Bannière d'actualités : aperçu du défilement en haut, liste des annonces avec date et menu « ⋯ ».
- « Période affichée » reste un champ texte ; suggestions cliquables possibles (« Octobre 2026 ») sans changer ce qui est enregistré.

**Vie de l'école**
- Formulaire en sections claires : Titre et date → Texte → Photos et vidéos → Visibilité.
- Zone d'envoi personnalisée, visibilité en boutons segmentés.
- Publications en fil élégant (photo en grand, titre, date, extrait).

### Console Parent
- Accueil : carte **« Aujourd'hui »** de l'enfant (présence du jour, prochain événement, reste à payer). Plusieurs enfants : sélecteur par avatars.
- Paiement Mobile Money en **3 gestes maximum** : montant très visible, opérateurs clairement présentés, confirmation avec animation de réussite.
- Tableau d'honneur traité comme une célébration.
- Messagerie, notifications, suggestions, actualités : simples et rassurants.

### Console Enseignant
- **Grand bouton de pointage** central, confirmation forte (heure, lieu validé).
- Emploi du temps du jour en frise, cours en cours mis en évidence.
- Appel de la classe selon le modèle du cahier d'appel.
- Création de cours rapide, pensée pour le pouce.

### Console Portier
- Plein écran, utilisable d'une main et d'un coup d'œil.
- Scan validé : écran vert, photo ou avatar, nom, classe. Refusé : écran rouge, raison claire. Vibration courte si possible.
- Compteur du jour (entrées / sorties) toujours visible.

### Écran de connexion
- Logo de l'école, accueil chaleureux, motif en filigrane, choix du profil évident, champs larges.

---

## 12. Thème par école

Un fichier de configuration **côté affichage uniquement** (pas de table en base) : nom de l'école, logo, couleur primaire, couleur d'accent. Thème par défaut EcoMaZ + thème SUCCESS KIDS.

---

## 13. Interdits

Panneau hors écran · élément qui en chevauche un autre · texte coupé · champ qui déborde · tableau coupé · emoji comme icônes · lien bleu par défaut · bouton natif d'envoi de fichiers · plus de deux polices · texte gris pâle peu lisible · dégradés violet-bleu génériques · animations décoratives · alertes répétées · icônes d'action sans libellé · gros boutons « Supprimer » répétés · titres en double · anglais · lorem ipsum · images lourdes.

---

## 14. Exigences techniques

- Contraste AA vérifié, navigation clavier, libellés accessibles.
- Rapide en 3G : images WebP compressées, chargement différé des écrans lourds, aucune bibliothèque inutile.
- Captures de vérification à **360px, 390px et 1440px**, en **mode clair et sombre**.
- Composants réutilisables, code propre.

---

## 15. Critères de réussite mesurables

- Aucun débordement, chevauchement ou texte coupé à 360, 390 et 1440px, dans les deux modes.
- En-tête mobile ≤ 56px.
- Tableau de bord : la direction voit tout ce qu'elle doit faire aujourd'hui sans faire défiler.
- Carte de paiement : on comprend en 2 secondes ce qui est payé, ce qui reste, ce qui est en retard.
- Une classe tient sur une ligne dans la vue d'ensemble.
- Parent : présence du jour en 1 geste après connexion, paiement en 3 gestes maximum.
- Enseignant : pointage en 2 gestes maximum.
- Portier : résultat d'un scan lisible à 1 mètre.
- Contraste AA partout.

---

## 16. Définition de « terminé » pour chaque écran

Un écran est terminé seulement si :
1. Captures avant/après à 360, 390 et 1440px, clair et sombre.
2. Aucun des 17 défauts constatés n'est présent.
3. Tous les critères de réussite concernés sont vérifiés.
4. Toutes les fonctions de l'écran marchent comme avant (navigation seule, ou comptes de test).
5. Un commit clair a été fait.

---

## 17. Ordre de traitement

1. Bug de l'en-tête (bouton Recherche).
2. Écran pilote : en-tête, tableau de bord, carte de paiement.
3. Parents ↔ Élèves.
4. Emploi du temps et Cahier d'appel.
5. Pointage enseignants.
6. Tableau d'affichage, Vie de l'école, Programmes.
7. Reste de la console Direction.
8. Console Parent, puis Enseignant, puis Portier.
9. Écran de connexion.
