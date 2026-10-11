# EcoMaZ — Spécification de mise à jour du design et du motion design

> **Destinataire : Claude Code.**
> Ce document est la source de vérité pour la refonte visuelle et animée d'EcoMaZ.
> Il couvre l'audit, le système de design, le système de mouvement, les spécifications écran par écran, le code de référence, les règles d'accessibilité et de performance, l'ordre d'exécution et les critères d'acceptation.
> Lis-le en entier avant de modifier un seul fichier.

---

## 0. Contexte et règles de sécurité du chantier (À LIRE EN PREMIER)

### 0.1 Le produit

- **EcoMaZ** est une application de gestion scolaire couvrant de la garderie à l'université (garderie, maternelle, primaire, collège, lycée, grande école).
- Elle est **en production réelle** à l'école **SUCCESS KIDS** (Abidjan, Côte d'Ivoire), école pilote et premier client, depuis **août 2026**.
- Hébergement : **Netlify** (plan Pro). Base de données : **Supabase** (plan Pro).
- Le projet Netlify le plus avancé est **`glittery-tulumba-6f5e2a`**, rebrandé « SUCCESS KIDS — Gestion Scolaire » (pointage, scanner de badge). Un second projet existe : `gorgeous-macaron-643d09`. **Vérifie lequel est le dépôt de travail avant toute modification et demande confirmation si tu as un doute.**
- Espaces existants :
  - **Administration** (desktop) : tableau de bord, élèves et inscriptions, notes et bulletins, pointage élèves (appel), emploi du temps, programmes pédagogiques, scanner de badge, enseignants, journal de pointage enseignants, finances.
  - **Console parent** : actualités, fiche enfant, tableau d'honneur (élève et enseignant·e du mois/trimestre/année), messagerie, notifications, boîte à suggestions, alerte d'absence, paiement Mobile Money.
  - **Console portier** : contrôle des sorties.
  - **Espace enseignant** (mobile) : création de cours, pointage.
- Fonctionnalités annoncées : comptabilité complète, paiement Mobile Money, présence élèves et enseignants, emplois du temps et programmes, message automatique aux parents en cas d'absence, souveraineté des données (une base par école cliente).

### 0.2 Règles impératives

1. **Ne casse aucune fonctionnalité.** Cette refonte est **visuelle et animée uniquement**. Aucune logique métier, aucune requête Supabase, aucun calcul comptable, aucun flux de paiement, aucune règle de pointage ne doit changer de comportement.
2. **Ne modifie pas le schéma de base de données**, sauf pour la validation de dates décrite en § 6.2, et seulement après accord explicite de l'utilisateur.
3. **Travaille sur une branche dédiée** (`design/motion-refonte`). Ne pousse jamais directement en production.
4. **Utilise un déploiement de prévisualisation Netlify** (deploy preview) pour chaque lot. L'école utilise l'outil tous les jours : l'appel du matin, les paiements et les sorties ne doivent jamais être interrompus.
5. **Garde un retour arrière possible** : chaque lot est un commit (ou une PR) indépendant et réversible.
6. **Commence par détecter la stack** (voir § 0.3) et adapte le code de référence de ce document à cette stack. Le code fourni ici est en CSS et JavaScript natifs ; il doit être traduit proprement, pas collé à l'aveugle.
7. **Ne supprime aucun texte métier** (libellés, montants, mentions) sans le signaler.
8. **Données d'exemple** : n'introduis jamais de données fictives dans l'application réelle. Les maquettes contenaient des exemples (« Awa », « Ilan K. », compteurs d'applaudissements, présences de la semaine) : ils servent uniquement d'illustration.

### 0.3 Étape 0 : reconnaissance du code (obligatoire, avant tout changement)

Produis un court rapport (dans le terminal ou un fichier `DESIGN_AUDIT_NOTES.md`) qui répond à :

- Quel framework ? (React, Vue, Svelte, HTML/JS natif, autre) Quelle version ?
- Quel outil de build ? (Vite, CRA, Next, aucun)
- Comment les styles sont-ils écrits ? (CSS global, modules CSS, Tailwind, styled-components, inline)
- Où sont définies les couleurs et polices actuelles ? Y a-t-il déjà des variables CSS ?
- Existe-t-il une bibliothèque d'animation ? (Framer Motion, GSAP, Lottie, aucune)
- Existe-t-il un mode sombre ? Comment est-il déclenché ? (le bouton lune est visible dans l'en-tête parent et admin)
- Liste des fichiers des quatre espaces (admin, parent, portier, enseignant) et des composants partagés (cartes, boutons, en-tête, barre latérale).
- Le composant du **tableau d'honneur** et la cause du bug d'inversion (§ 6.1).

Ne passe à l'étape suivante qu'une fois ce rapport établi.

---

## 1. Audit d'expert : constat avant refonte

Constat établi à partir de captures réelles de la console parent (web) et du tableau de bord administration (desktop).

### 1.1 Ce qui fonctionne déjà

- Fond vert très pâle, cartes blanches arrondies, ombres douces : base propre et moderne.
- Typographie arrondie, chaleureuse, adaptée au milieu scolaire.
- Message d'accueil personnalisé (« Bonjour, [prénom] ») : bon point d'entrée émotionnel.
- Fiche enfant claire (nom, statut, matricule, dates).
- Tableau de bord admin sobre, bien organisé (barre latérale par sections : Élèves, Pédagogie, Pointage & enseignants, Finances), indicateurs clés, graphique de répartition par classe, alertes du jour.
- Cohérence de palette entre le vert du graphique admin et les cartes parent.

### 1.2 Défauts à corriger (par gravité)

| # | Gravité | Écran | Défaut | Correction |
|---|---|---|---|---|
| D1 | **Bloquant** | Parent — Tableau d'honneur | Les noms et classes sur les cartes sont **affichés en miroir / à l'envers** (« Kylian Manga », « Mme Kouadio », « M. KOUAME » illisibles). | § 6.1 |
| D2 | **Élevé** | Parent — Tableau d'honneur | Cartes **très hautes et vides** (≈ 3:4), seulement un dégradé vert→terracotta, pas de photo, pas d'information utile. Elles écrasent visuellement la page. | Refonte § 5.1.6 |
| D3 | **Élevé** | Parent — Tableau d'honneur | Trois cartes identiques pour « Élève à l'honneur » (même élève répété) : données de démonstration ou bug de requête. | Vérifier la requête ; dédupliquer ; § 6.3 |
| D4 | **Moyen** | Parent — Fiche enfant | Date de naissance **postérieure** à la date d'inscription (23/09/2026 vs 11/09/2026). | Validation § 6.2 |
| D5 | **Moyen** | Parent — En-tête | L'en-tête « EcoMaZ-PARENTS D'ELEVES SUCCESS KIDS » apparaît **au milieu de la page** (barre collante qui chevauche le contenu en capture longue) ; icônes d'en-tête en emoji (lune, cloche, enveloppe, ampoule). | En-tête § 5.1.1 ; icônes SVG § 2.6 |
| D6 | **Moyen** | Admin — KPI | « Présence élèves aujourd'hui » et « Présence enseignants aujourd'hui » affichent « — » sans explication. | État vide explicite § 5.3.2 |
| D7 | **Faible** | Partout | Emojis utilisés comme icônes (📰, 🏆, 👋, 🧑‍🏫…). Rendu variable selon les téléphones Android, aspect peu professionnel. | Remplacer par SVG § 2.6 |
| D8 | **Faible** | Partout | Aucune animation d'entrée, aucun retour visuel d'action, aucune célébration : l'app est fonctionnelle mais « inerte ». | Système de mouvement § 3 |
| D9 | **Faible** | Parent — Actualités | Les actualités sont des lignes grises sans hiérarchie (date en petit sous le titre). | Carte actualité § 5.1.5 |

### 1.3 Positionnement retenu

Objectif de l'utilisateur : le design **le plus attrayant, le plus moderne, le plus captivant, le plus professionnel**, avec un **effet d'accroche positive** fort.

Résolution de la tension « ludique vs professionnel » : **une identité, deux registres d'intensité**.

- **Registre sobre** — Administration (direction, comptabilité) : mouvement minimal, fonctionnel, rapide. La crédibilité prime.
- **Registre vivant** — Parent, enseignant, portier, landing page : entrées en cascade, célébrations, retours d'action marqués. L'engagement prime.

Même palette, mêmes rayons, même typographie, mêmes courbes partout. Seules l'**amplitude** et la **fréquence** des animations changent.

### 1.4 Doctrine d'engagement (accroche positive, jamais toxique)

À faire :
1. **Progrès visibles** (présences de la semaine qui se remplissent, barres de progression).
2. **Reconnaissance** (tableau d'honneur, applaudissements, badges).
3. **Rituels légers** (récapitulatif hebdomadaire « Voici la semaine de votre enfant »).
4. **Bonne nouvelle d'abord** : l'accueil met en avant ce qui va bien avant les alertes.

À ne jamais faire :
- Rappels culpabilisants, séries (streaks) qui se « brisent » avec un message négatif.
- Compteurs de temps passé dans l'app, récompense de l'usage pour l'usage.
- Effets clignotants ou sonores non sollicités.
- Animations qui retardent l'accès à une information (une alerte d'absence s'affiche **immédiatement**).

---

## 2. Système de design (jetons)

### 2.1 Fichier de jetons

Crée **un seul fichier** `src/styles/ecomaz-tokens.css` (adapte le chemin à la stack), importé **une fois** à la racine de l'application, avant tout autre style. Tous les composants consomment ces variables ; **aucune couleur, durée, rayon ou ombre en dur** dans les composants après la refonte.

```css
/* =========================================================
   EcoMaZ — Jetons de design (source unique)
   ========================================================= */
:root {
  /* --- Marque --- */
  --em-green-900: #14392d;   /* fonds forts, texte sur clair, hero */
  --em-green-700: #1f5c46;   /* couleur primaire : boutons, liens, logo */
  --em-green-500: #2e7d62;   /* succès de marque, coches, barres */
  --em-green-100: #e3f1eb;   /* fonds doux, pastille d'onglet actif */

  /* --- Accents --- */
  --em-terracotta-600: #b5492f; /* badges, sur-titres, notifications */
  --em-terracotta-800: #8a3520; /* texte sur fond terracotta-100 */
  --em-terracotta-100: #f8e6df;
  --em-gold-400: #e8b04b;       /* honneur, CTA, focus, halo */
  --em-gold-100: #fbf0d9;
  --em-gold-800: #8a5a0c;       /* texte sur fond gold-100 */

  /* --- Neutres --- */
  --em-bg: #f5f7f5;
  --em-surface: #ffffff;
  --em-text: #1a1f1c;
  --em-text-muted: #5f6b65;     /* contraste ≥ 4.5:1 sur blanc */
  --em-text-on-dark: #cfe3da;   /* texte secondaire sur green-900 */
  --em-border: #e4e9e6;

  /* --- États --- */
  --em-success: #10b981;
  --em-danger: #ef4444;
  --em-warning: #f59e0b;

  /* --- Portier (thème sombre dédié) --- */
  --em-gate-bg: #0f1613;
  --em-gate-surface: #17201c;
  --em-gate-border: #26332d;
  --em-gate-text: #eef3f0;
  --em-gate-muted: #9fb0a7;

  /* --- Rayons --- */
  --em-radius-xs: 9px;
  --em-radius-sm: 12px;
  --em-radius-md: 16px;
  --em-radius-lg: 20px;
  --em-radius-xl: 24px;
  --em-radius-2xl: 28px;
  --em-radius-pill: 999px;

  /* --- Ombres --- */
  --em-shadow-sm: 0 1px 2px rgba(20, 57, 45, 0.06);
  --em-shadow-md: 0 8px 24px rgba(20, 57, 45, 0.08);
  --em-shadow-hover: 0 14px 30px rgba(20, 57, 45, 0.14);
  --em-shadow-lg: 0 22px 44px rgba(20, 57, 45, 0.12);
  --em-shadow-float: 0 40px 80px rgba(0, 0, 0, 0.45);

  /* --- Espacements (base 4) --- */
  --em-space-1: 4px;  --em-space-2: 8px;  --em-space-3: 12px;
  --em-space-4: 16px; --em-space-5: 20px; --em-space-6: 24px;
  --em-space-8: 32px; --em-space-10: 40px; --em-space-14: 56px;

  /* --- Typographie --- */
  --em-font: "Nunito", system-ui, -apple-system, "Segoe UI", sans-serif;
  --em-fw-regular: 400; --em-fw-semibold: 600; --em-fw-bold: 700;
  --em-fw-extrabold: 800; --em-fw-black: 900;
  --em-fs-11: 0.6875rem; --em-fs-12: 0.75rem; --em-fs-13: 0.8125rem;
  --em-fs-14: 0.875rem;  --em-fs-15: 0.9375rem; --em-fs-17: 1.0625rem;
  --em-fs-20: 1.25rem;   --em-fs-26: 1.625rem;

  /* --- Mouvement (voir § 3) --- */
  --em-ease-out:  cubic-bezier(.22, 1, .36, 1);
  --em-ease-back: cubic-bezier(.34, 1.56, .64, 1);
  --em-ease-tab:  cubic-bezier(.34, 1.4, .64, 1);
  --em-ease-sym:  cubic-bezier(.65, 0, .35, 1);
  --em-dur-press: 160ms;
  --em-dur-hover: 240ms;
  --em-dur-enter: 520ms;
  --em-dur-celebrate: 760ms;
  --em-stagger: 80ms;
}

/* Mode sombre (console parent / enseignant / admin) */
:root[data-theme="dark"] {
  --em-bg: #0f1613;
  --em-surface: #17201c;
  --em-text: #eef3f0;
  --em-text-muted: #9fb0a7;
  --em-border: #26332d;
  --em-green-100: #1d3a2f;
  --em-terracotta-100: #3a221b;
  --em-gold-100: #3a2e17;
  --em-shadow-md: 0 8px 24px rgba(0, 0, 0, 0.35);
  --em-shadow-hover: 0 14px 30px rgba(0, 0, 0, 0.45);
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --em-bg: #0f1613; --em-surface: #17201c; --em-text: #eef3f0;
    --em-text-muted: #9fb0a7; --em-border: #26332d; --em-green-100: #1d3a2f;
    --em-terracotta-100: #3a221b; --em-gold-100: #3a2e17;
    --em-shadow-md: 0 8px 24px rgba(0, 0, 0, 0.35);
  }
}

/* Réduction des animations : toutes les durées tombent à 0 */
@media (prefers-reduced-motion: reduce) {
  :root {
    --em-dur-press: 0ms; --em-dur-hover: 0ms;
    --em-dur-enter: 0ms; --em-dur-celebrate: 0ms; --em-stagger: 0ms;
  }
}
```

> **Remarque** : si le bouton lune existant pilote déjà un thème, branche-le sur l'attribut `data-theme="dark|light"` de `<html>` et conserve la préférence (même mécanisme que l'existant). Ne crée pas un second système de thème.

### 2.2 Palette : rôles et interdits

| Jeton | Rôle | Interdit |
|---|---|---|
| `green-700` | Action primaire, liens, logo | Grandes surfaces de fond (utiliser `green-900`) |
| `green-900` | Hero, carte enfant, carte tarif mise en avant, fond portier | Texte courant sur fond clair long (préférer `--em-text`) |
| `gold-400` | Honneur, CTA principal landing, anneau de focus, halo | Texte blanc dessus (contraste insuffisant) : texte `green-900` |
| `terracotta-600` | Sur-titres, badges, pastille de notification | Boutons primaires |
| Rouge `danger` | Erreurs, absences critiques uniquement | Décoration |

- **Plus aucun dégradé décoratif plein cadre** (supprimer le dégradé vert→terracotta des cartes d'honneur).
- Couleurs qui doivent être distinguées : elles diffèrent aussi en **luminosité**, pas seulement en teinte (daltonisme).

### 2.3 Typographie

- Police unique : **Nunito** (400, 600, 700, 800, 900). Chargement :
  ```html
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&display=swap" rel="stylesheet">
  ```
  Si l'app doit fonctionner hors ligne ou en PWA, **auto-héberge** les fichiers woff2 (sous-ensemble latin + latin-ext pour les accents).
- Échelle :

| Usage | Taille | Graisse | Interlettrage |
|---|---|---|---|
| Titre d'écran mobile (« Bonjour, … ») | 26px | 900 | -0.01em |
| Titre de section | 17px | 900 | 0 |
| Nom (fiche, carte) | 14–17px | 800 | 0 |
| Corps | 14–15px | 400–600 | 0 |
| Légende / méta | 12–13px | 400–700 | 0 |
| Sur-titre (eyebrow) | 12–13px | 800 | 0.04–0.1em, MAJUSCULES |
| Chiffres KPI | 22–42px | 900 | -0.02em, `font-variant-numeric: tabular-nums` |

- Les chiffres (montants, effectifs, heures) utilisent `font-variant-numeric: tabular-nums` pour éviter le tremblement pendant les compteurs animés.

### 2.4 Surfaces

- **Carte standard** : fond `--em-surface`, bordure 1px `--em-border`, rayon 16–20px, ombre `--em-shadow-sm`.
- **Carte forte** (fiche enfant, carte tarif mise en avant) : fond `--em-green-900`, texte blanc, rayon 24px, motif décoratif : un anneau (`border: 22px solid rgba(255,255,255,.06)`) de 160px en haut à droite, débordant de 40px, `overflow: hidden` sur la carte.
- **Glassmorphisme** : **uniquement** sur des éléments flottants courts (toast, en-tête collant si souhaité). Jamais sur les tableaux, formulaires ou listes.
- Coins : jamais de coins carrés sur un élément interactif.

### 2.5 Cibles tactiles et focus

- Toute cible interactive : **minimum 44×44 px** (boutons de navigation : 52px de haut).
- Focus clavier visible : `outline: 3px solid var(--em-gold-400); outline-offset: 2px;` sur `:focus-visible`. Ne jamais supprimer l'outline sans remplacement.

### 2.6 Icônes

- **Remplacer tous les emojis-icônes** par des **icônes SVG en trait** (stroke 2, `stroke-linecap="round"`, `stroke-linejoin="round"`, `fill="none"`, `stroke="currentColor"`), 18–24px.
- Recommandé : **Lucide** (si React : `lucide-react` ; sinon SVG inline). Correspondances :

| Usage | Emoji actuel | Icône |
|---|---|---|
| Notifications | 🔔 | `bell` |
| Messages | ✉️ | `mail` / `message-square` |
| Suggestions | 💡 | `lightbulb` |
| Thème sombre | 🌙 | `moon` / `sun` |
| Actualités | 📰 | `newspaper` (ou carte date, § 5.1.5) |
| Tableau d'honneur | 🏆 | `trophy` |
| Salutation | 👋 | `hand` (animé, § 5.1.2) |
| Accueil / Paiements / Profil | — | `home`, `credit-card`, `user` |
| Portier | — | `shield`, `qr-code`, `scan-line`, `check`, `send` |

- Icône seule dans un bouton : `aria-label` obligatoire. Icône décorative : `aria-hidden="true"`.
- Les emojis restent autorisés **dans le contenu saisi par l'école** (actualités, messages), pas dans l'interface.

---

## 3. Système de mouvement

### 3.1 Principes (les cinq règles)

1. **Une idée par écran** : un seul mouvement principal à la fois ; le reste est calme.
2. **Jamais d'attente** : le contenu est lisible pendant l'animation, jamais bloqué derrière. Aucune animation ne retarde un clic, une saisie ou une alerte.
3. **Célébrer les progrès, pas l'usage** : on anime une présence, une réussite, un applaudissement, une validation — jamais le temps passé.
4. **Le rebond reste rare** : la courbe `ease-back` est réservée aux validations, aux honneurs et aux confirmations, pour garder sa valeur.
5. **Respect du réglage système** : avec `prefers-reduced-motion: reduce`, tout s'affiche directement, état final, sans transition.

### 3.2 Courbes

| Nom | Valeur | Usage |
|---|---|---|
| Sortie douce | `cubic-bezier(.22, 1, .36, 1)` | Entrées d'éléments, navigation, survol, ouverture d'accordéon. **Courbe par défaut.** |
| Rebond | `cubic-bezier(.34, 1.56, .64, 1)` | Validations, pastilles qui apparaissent (pop), compteur qui « bondit », chevron de FAQ. |
| Rebond doux (onglet) | `cubic-bezier(.34, 1.4, .64, 1)` | Pastille d'onglet actif qui glisse. |
| Symétrique | `cubic-bezier(.65, 0, .35, 1)` | Boucles (ligne de scan), chargements. |
| Linéaire | `linear` | Rotation de spinner, bandeau défilant, orbite décorative. |

Interdit : `ease-in` seul pour une entrée (paraît lent), `ease` par défaut du navigateur dans les nouveaux composants.

### 3.3 Durées

| Jeton | Valeur | Usage |
|---|---|---|
| `--em-dur-press` | 160ms | Appui (scale 0.96–0.97) |
| `--em-dur-hover` | 240ms | Survol, couleur, changement d'onglet (couleur) |
| `--em-dur-enter` | 520ms | Entrée d'un élément / d'un écran (500–700ms selon taille) |
| `--em-dur-celebrate` | 760ms | Confettis, célébration |
| Pastille d'onglet | 420ms | Glissement de l'indicateur |
| Accordéon | 380ms | Hauteur ; 300ms opacité |
| Boucles décoratives | 1.6s – 40s | Pulse 2.2s, halo 2.6s, scan 2.4s, flottement 6s, défilement 28s, orbite 40s |

### 3.4 Décalage (stagger)

- Pas de base : **80ms** entre éléments frères.
- Délai maximal cumulé à l'ouverture d'un écran : **≈ 700ms**. Au-delà, ne pas animer (les éléments sous la ligne de flottaison s'animent à l'apparition au défilement, pas à l'ouverture).
- Ordre : de haut en bas, de gauche à droite.

### 3.5 Propriétés autorisées

- **Uniquement `transform` et `opacity`** pour les animations (performance GPU). Exceptions tolérées : `box-shadow` (survol, halo), `grid-template-rows` (accordéon), `color`/`background-color` (transitions courtes).
- Interdit d'animer : `width`, `height`, `top`, `left`, `margin`, `padding` (sauf démonstration interne).
- `will-change` : **ne pas l'utiliser globalement**. Seulement sur un élément qui s'anime en continu (bandeau défilant), retiré sinon.

### 3.6 Bibliothèque d'animations (fichier `src/styles/ecomaz-motion.css`)

```css
/* =========================================================
   EcoMaZ — Bibliothèque de mouvement
   Importé après ecomaz-tokens.css
   ========================================================= */

/* --- Keyframes --- */
@keyframes em-rise   { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: none; } }
@keyframes em-rise-lg{ from { opacity: 0; transform: translateY(26px); } to { opacity: 1; transform: none; } }
@keyframes em-pop    { 0% { opacity: 0; transform: scale(.4); } 70% { opacity: 1; transform: scale(1.12); } 100% { opacity: 1; transform: scale(1); } }
@keyframes em-fill-y { from { transform: scaleY(0); } to { transform: scaleY(1); } }
@keyframes em-fill-x { from { transform: scaleX(0); } to { transform: scaleX(1); } }
@keyframes em-pulse  { 0% { box-shadow: 0 0 0 0 rgba(181,73,47,.55); } 80%,100% { box-shadow: 0 0 0 9px rgba(181,73,47,0); } }
@keyframes em-glow   { 0%,100% { box-shadow: 0 0 0 0 rgba(232,176,75,.55); } 50% { box-shadow: 0 0 0 7px rgba(232,176,75,0); } }
@keyframes em-bump   { 0% { transform: scale(1); } 40% { transform: scale(1.3); } 100% { transform: scale(1); } }
@keyframes em-wave   { 0%,60%,100% { transform: rotate(0); } 15% { transform: rotate(16deg); } 30% { transform: rotate(-8deg); } 45% { transform: rotate(12deg); } }
@keyframes em-burst  {
  0%   { opacity: 1; transform: translate(-50%,-50%) translate(0,0) rotate(0deg) scale(1); }
  100% { opacity: 0; transform: translate(-50%,-50%) translate(var(--dx), var(--dy)) rotate(220deg) scale(.5); }
}
@keyframes em-scan   { 0% { top: 8%; } 50% { top: 88%; } 100% { top: 8%; } }  /* exception tolérée : élément de 3px */
@keyframes em-spin   { to { transform: rotate(360deg); } }
@keyframes em-draw   { from { stroke-dashoffset: 40; } to { stroke-dashoffset: 0; } }
@keyframes em-ring   { 0% { transform: scale(.6); opacity: .8; } 100% { transform: scale(1.8); opacity: 0; } }
@keyframes em-toast  { 0% { transform: translateY(120%); opacity: 0; } 100% { transform: none; opacity: 1; } }
@keyframes em-corner { 0%,100% { opacity: 1; } 50% { opacity: .45; } }
@keyframes em-float  { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }
@keyframes em-marquee{ from { transform: translateX(0); } to { transform: translateX(-50%); } }
@keyframes em-shine  { 0% { transform: translateX(-120%); } 60%,100% { transform: translateX(220%); } }
@keyframes em-orbit  { to { transform: rotate(360deg); } }

/* --- Classes utilitaires --- */
.em-rise    { animation: em-rise var(--em-dur-enter) var(--em-ease-out) both; animation-delay: calc(var(--i, 0) * var(--em-stagger)); }
.em-pop     { animation: em-pop 460ms var(--em-ease-back) both; }
.em-fill-y  { transform-origin: bottom; animation: em-fill-y 600ms var(--em-ease-out) both; }
.em-fill-x  { transform-origin: left;   animation: em-fill-x 1.2s var(--em-ease-out) both; }
.em-pulse   { animation: em-pulse 2.2s ease-out infinite; }
.em-glow    { animation: em-glow 2.6s ease-in-out infinite; }
.em-bump    { animation: em-bump 380ms var(--em-ease-back); }
.em-wave    { display: inline-block; transform-origin: 70% 80%; animation: em-wave 1.8s ease-in-out 700ms 2; }
.em-spin    { animation: em-spin 900ms linear infinite; }
.em-float   { animation: em-float 6s ease-in-out infinite; }

/* Retours d'interaction */
.em-press { transition: transform var(--em-dur-press) var(--em-ease-out), box-shadow var(--em-dur-hover) ease, background-color var(--em-dur-hover) ease; }
.em-press:active { transform: scale(.96); }
.em-lift  { transition: transform var(--em-dur-hover) var(--em-ease-out), box-shadow var(--em-dur-hover) ease, border-color var(--em-dur-hover) ease; }
@media (hover: hover) {
  .em-lift:hover { transform: translateY(-3px); box-shadow: var(--em-shadow-hover); }
}

/* Particule de confettis */
.em-burst {
  position: absolute; left: 50%; top: 42%;
  width: 8px; height: 8px; border-radius: 2px;
  pointer-events: none;
  animation: em-burst var(--em-dur-celebrate) var(--em-ease-out) forwards;
}

/* Apparition au défilement (progressive : sans support, l'élément est simplement visible) */
@supports (animation-timeline: view()) {
  .em-reveal {
    animation: em-rise-lg linear both;
    animation-timeline: view();
    animation-range: entry 0% entry 45%;
  }
}

/* Réduction des animations : neutralisation complète */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
  .em-burst { display: none; }
}
```

> **Important** : la règle `prefers-reduced-motion` ci-dessus laisse les éléments à leur **état final** (opacity 1, position finale) grâce à `both`/`forwards`. Vérifie qu'aucun élément ne reste invisible (opacity 0) avec la réduction activée.

### 3.7 Utilitaires JavaScript (fichier `src/lib/motion.js`)

```js
// Préférence de réduction des animations
export const prefersReducedMotion = () =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Compteur animé (KPI) — easeOutCubic, chiffres tabulaires côté CSS
export function countUp(el, to, { duration = 900, from = 0, format = (n) => n.toLocaleString('fr-FR') } = {}) {
  if (prefersReducedMotion() || !Number.isFinite(to)) { el.textContent = format(to); return; }
  const start = performance.now();
  const ease = (t) => 1 - Math.pow(1 - t, 3);
  function frame(now) {
    const t = Math.min(1, (now - start) / duration);
    el.textContent = format(Math.round(from + (to - from) * ease(t)));
    if (t < 1) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

// Apparition au défilement — repli pour les navigateurs sans animation-timeline
export function revealOnScroll(root = document) {
  if (CSS.supports('animation-timeline: view()') || prefersReducedMotion()) return;
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) { e.target.classList.add('em-rise'); io.unobserve(e.target); }
    });
  }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });
  root.querySelectorAll('.em-reveal').forEach((el) => io.observe(el));
}

// Confettis : 12 particules aux couleurs de la marque
export function burst(container, { count = 12 } = {}) {
  if (prefersReducedMotion()) return;
  const palette = ['#e8b04b', '#b5492f', '#2e7d62', '#1f5c46'];
  for (let i = 0; i < count; i++) {
    const a = (Math.PI * 2 * i) / count;
    const r = 54 + (i % 3) * 14;
    const p = document.createElement('span');
    p.className = 'em-burst';
    p.setAttribute('aria-hidden', 'true');
    p.style.background = palette[i % palette.length];
    p.style.setProperty('--dx', `${Math.round(Math.cos(a) * r)}px`);
    p.style.setProperty('--dy', `${Math.round(Math.sin(a) * r)}px`);
    p.style.animationDelay = `${(i % 3) * 30}ms`;
    container.appendChild(p);
    p.addEventListener('animationend', () => p.remove(), { once: true });
  }
}

// Rejouer une animation CSS sur un élément (ex. em-bump sur un compteur)
export function replay(el, className) {
  el.classList.remove(className);
  void el.offsetWidth; // force le reflow
  el.classList.add(className);
}
```

**Si la stack est React** : transforme ces utilitaires en hooks (`useCountUp`, `useReveal`) et en composant `<Burst />` ; conserve exactement les mêmes valeurs. N'ajoute **Framer Motion** que si l'équipe l'utilise déjà ; sinon, le CSS ci-dessus suffit et pèse zéro kilo-octet de JavaScript supplémentaire.

**Nettoyage obligatoire** : tout `setTimeout`, `requestAnimationFrame` ou `IntersectionObserver` créé dans un composant est annulé au démontage.

---

## 4. Registres par espace

| Espace | Registre | Animations autorisées | Animations interdites |
|---|---|---|---|
| Administration | Sobre | Entrée en cascade des cartes KPI (1 fois par session de page), compteurs, remplissage des barres, survol, appui | Confettis, halo, flottement, rebond hors validation |
| Parent | Vivant | Tout le catalogue | Boucles multiples simultanées (max. 2 éléments en boucle visibles à la fois) |
| Enseignant | Vivant mesuré | Entrées, validation de pointage (pop + coche dessinée), toasts | Confettis à chaque action (réservés aux jalons) |
| Portier | Opérationnel | Scan, spinner, validation, toast | Toute animation décorative (l'agent doit lire vite) |
| Landing page | Expressif | Tout, y compris orbite, bandeau, reflet | Animations qui masquent le texte du hero |

---

## 5. Spécifications écran par écran

Les valeurs ci-dessous sont des cibles exactes. Les noms de classes sont indicatifs ; adapte-les aux conventions du projet.

### 5.1 Console parent (mobile d'abord, 360–430px ; doit rester correcte jusqu'au desktop)

Structure verticale : **En-tête fixe → Zone défilante (salutation, fiche enfant, actualités, tableau d'honneur) → Barre de navigation basse fixe**.

Sur desktop (≥ 900px) : conteneur centré `max-width: 960px`, la barre de navigation basse devient une barre horizontale en haut ou reste en bas selon l'existant ; le tableau d'honneur passe en grille.

#### 5.1.1 En-tête

- Hauteur ≈ 64px, padding `18px 20px 12px`, fond `--em-bg` (pas de barre blanche détachée qui chevauche le contenu — corrige D5 : si l'en-tête est `sticky`, vérifie son `z-index` et son fond pour qu'il ne flotte pas au milieu de la page).
- Gauche : pastille logo 38×38, rayon 12, fond `green-700`, lettre « E » blanche 900 18px ; à côté, deux lignes : « ECOMAZ PARENTS » (12px, 700, `text-muted`, interlettrage .04em) et le nom de l'école (15px, 800).
- Droite : boutons icône 44×44, rayon 14, fond blanc, bordure `--em-border` : thème, notifications, messages, suggestions. Sur mobile, regrouper messages et suggestions dans le menu ou la barre basse si la place manque ; **garder la cloche visible**.
- Pastille de compteur sur la cloche : min 20×20, rayon 10, fond `terracotta-600`, texte blanc 11px 900, bordure 2px couleur du fond, position `top:-4px; right:-4px`, classe `.em-pulse` **uniquement si le compteur > 0**. `aria-label="Notifications, N nouvelles"`.
- Nom du parent et « Déconnexion » : déplacer dans l'onglet **Profil** sur mobile (allège l'en-tête). Sur desktop, ils peuvent rester dans l'en-tête.
- Animation : `.em-rise`, `--i: 0`.

#### 5.1.2 Salutation

- Titre « Bonjour, [prénom] » 26px 900, suivi d'une **icône main SVG** (trait `terracotta-600`, 24px) dans un `span.em-wave` : la main salue **deux fois**, 700ms après l'ouverture, puis s'arrête.
- Sous-titre 14px `text-muted` : « Voici la semaine de votre enfant. » (ou « de vos enfants » si plusieurs).
- Animation : `.em-rise`, `--i: 1`.

#### 5.1.3 Fiche enfant (carte forte)

- Fond `green-900`, texte blanc, rayon 24, padding 18, gap 16, motif anneau en haut à droite (§ 2.4).
- Avatar : 56×56, rayon 18, fond `gold-400`, initiales `green-900` 900 20px. **Si une photo existe, l'afficher** (`object-fit: cover`), sinon les initiales. Animation `.em-pop`, délai 320ms.
- Nom 17px 800 ; ligne « [Niveau/classe] » 13px `--em-text-on-dark` + pastille statut « Actif » (fond `rgba(255,255,255,.14)`, 12px 800, rayon pilule).
- Matricule, date de naissance, date d'inscription : conserver, dans une rangée de 3 colonnes (12px libellé `text-on-dark`, 14px 800 valeur) ou dans un panneau dépliable « Détails » pour alléger.
- **Bloc « Présence de la semaine »** (nouveau, branché sur les données réelles de pointage) :
  - Libellé 13px 700 `text-on-dark`.
  - Grille 5 colonnes (Lun → Ven), gap 8. Chaque jour : case 44px de haut, rayon 12, fond `rgba(255,255,255,.1)` ; si présent : remplissage `green-500` avec coche blanche (stroke 3), classe `.em-fill-y`, délais **520ms + i × 110ms** ; si absent : case vide avec un petit tiret ou point `terracotta` (ne pas utiliser de rouge alarmant pour une absence justifiée) ; si jour futur : case vide neutre.
  - Libellé du jour 11px 800 sous la case.
  - Si plusieurs enfants : un carrousel horizontal de fiches (défilement avec accroche `scroll-snap-type: x mandatory`).
- Animation de la carte : `.em-rise`, `--i: 2`.

#### 5.1.4 Alerte d'absence (prioritaire)

- Si une alerte d'absence du jour existe, elle s'affiche **au-dessus de la fiche enfant**, **sans délai d'animation** (règle 2) : carte fond `terracotta-100`, texte `terracotta-800`, icône `alert-circle`, bouton « Voir » ou « Justifier ». Une seule animation tolérée : apparition 200ms opacity.

#### 5.1.5 Actualités

- Titre de section « Actualités » 17px 900 (sans emoji).
- Chaque actualité = carte blanche, bordure, rayon 18, padding 14, gap 12, alignée au centre :
  - **Bloc date** à gauche : 48×52, rayon 14, fond `terracotta-100`, texte `terracotta-600` ; jour en 18px 900, mois abrégé en majuscules 10px 800 interlettrage .06em (« OCT »). La date affichée est la **date de l'événement** si elle existe, sinon la date de publication.
  - Titre 14px 800 ; méta 12px `text-muted` (« Samedi 3 octobre · 8h »).
- Animation : `.em-rise` en cascade (délais 340ms, 410ms…), classe `.em-lift` (survol desktop uniquement).
- Au-delà de 3 actualités : lien « Tout voir ».

#### 5.1.6 Tableau d'honneur (refonte complète — corrige D1, D2, D3)

- En-tête : « Tableau d'honneur » 17px 900 + période à droite (« Octobre », « 1er trimestre »…) 12px 700 `text-muted`.
- Deux sous-groupes : **Élève(s) à l'honneur** puis **Enseignant(e)s à l'honneur**, chacun avec un sous-titre 12–13px 700 et une icône SVG.
- Disposition mobile : rangée horizontale défilante (`overflow-x: auto`, `scroll-snap-type: x mandatory`, barre de défilement masquée), cartes de **150px** de large. Desktop : grille `repeat(auto-fill, minmax(180px, 1fr))`.
- **Carte d'honneur** (remplace les grandes cartes dégradées) :
  - Fond blanc, bordure 1px `--em-border` (**`gold-400` pour la première carte de la catégorie élève**), rayon 20, padding `16px 12px 12px`, colonne centrée, gap 6, `overflow: hidden`, `position: relative`.
  - Avatar rond 64×64 : **photo réelle** si disponible, sinon initiales blanches 900 20px sur `green-700` ; bordure 3px blanche (ou `gold-400` + classe `.em-glow` pour l'élève du mois).
  - Initiales : ignorer les civilités (« M. », « Mme », « Mlle », « Dr ») ; 2 lettres max.
  - Nom 14px 800 ; classe ou matière 12px `text-muted` ; badge « Élève du mois » / « Enseignante » / « Enseignant » : 11px 800, `terracotta-600` sur `terracotta-100`, rayon pilule. **Accorder le genre** selon la donnée disponible, sinon « Enseignant·e ».
  - Bouton **« Applaudir »** (nouveau) : pleine largeur, min-height 44, rayon 14, fond `green-100`, texte `green-900` 13px 900, icône pouce + compteur. Au clic :
    1. compteur +1 avec `.em-bump` (via `replay()`),
    2. `burst()` de 12 confettis dans la carte,
    3. un seul applaudissement par parent et par honneur (désactiver le bouton ensuite, `aria-pressed="true"`, libellé « Applaudi »).
    - **Persistance** : nécessite une table ou un champ côté Supabase. **Ne crée rien sans accord de l'utilisateur.** En attendant, implémente le composant derrière un drapeau (`ENABLE_APPLAUSE=false`) et masque le bouton.
  - Animation d'entrée : `.em-rise`, délais 560ms + i × 90ms.
  - Un **mot d'encouragement** facultatif (texte saisi par l'école) : 13px italique `text-muted`, entre guillemets « ».
- Cas vide : « Les honneurs du mois seront bientôt annoncés. » avec une icône trophée en trait, pas de carte fantôme.

#### 5.1.7 Barre de navigation basse

- Fixe en bas, fond blanc, bordure haute `--em-border`, padding `10px 12px 18px` + `env(safe-area-inset-bottom)`.
- Grille 4 colonnes : **Accueil, Messages, Paiements, Profil** (adapter si l'app a d'autres entrées ; max 5).
- Chaque onglet : bouton 52px de haut, icône 22px + libellé 11px 800 ; couleur active `green-900`, inactive `text-muted`, transition couleur 240ms.
- **Pastille active glissante** : un seul élément absolu de largeur `calc((100% - 24px) / 4)`, hauteur 52, rayon 16, fond `green-100`, déplacé par `transform: translateX(index × 100%)` avec `transition: transform 420ms var(--em-ease-tab)`.
- `aria-current="page"` sur l'onglet actif.
- Pastille de compteur sur Messages si non lus (même style que la cloche, sans pulse).

#### 5.1.8 Paiement Mobile Money (écran ou feuille)

- Montant dû en grand (32px 900, chiffres tabulaires), échéance, historique.
- Pendant le paiement : spinner `.em-spin` + texte « Confirmation sur votre téléphone… ».
- Succès : cercle `green-500` 96px en `.em-pop`, **coche dessinée** (`stroke-dasharray: 40` + `em-draw`, délai 240ms), onde `em-ring`, puis reçu. **Pas de confettis pour un paiement** (c'est une transaction, pas une célébration).
- Échec : carte `terracotta-100`, message clair, bouton « Réessayer ». Aucune animation de secousse.
- Ne modifie **aucune** logique de paiement.

#### 5.1.9 Messagerie, notifications, suggestions

- Liste : cartes avec avatar, aperçu, heure ; non lu = point `terracotta-600` 8px + nom en 800.
- Nouvelle notification reçue pendant que l'app est ouverte : **toast** en bas (au-dessus de la barre de navigation), animation `em-toast` 460ms `ease-back` doux, disparition après 4s, `role="status"`.
- Boîte à suggestions : après envoi, coche dessinée + « Merci, votre suggestion a été transmise. »

### 5.2 Console portier (mobile, thème sombre dédié)

Raison du thème sombre : moins d'éblouissement en extérieur et en fin de journée, lecture rapide, statut très contrasté.

- Fond `--em-gate-bg`, texte `--em-gate-text`.
- **En-tête** : sur-titre « PORTAIL · [NOM ÉCOLE] » 12px 700 `gate-muted` interlettrage .06em ; titre « Contrôle de sortie » 20px 900 ; pastille d'état à droite « En service » (point `success` 8px, fond `#1d3a2f`, texte `#9fe0c3`, 12px 800).
- **État 1 — Attente de scan** :
  - Cadre carré (ratio 1:1), rayon 28, fond `gate-surface`, bordure `gate-border` ; si le scanner caméra existe, le flux vidéo s'affiche dedans.
  - Quatre coins de visée `gold-400` (4px, 44×44, rayon 14 au coin), classe `em-corner` (opacité 1 ↔ .45, 1.6s).
  - Ligne de scan : 3px, `gold-400`, halo `box-shadow: 0 0 18px 4px rgba(232,176,75,.55)`, animation `em-scan` 2.4s courbe symétrique, infinie.
  - Texte « Présentez le badge du parent » 18px 900 ; « Le code QR se lit automatiquement. » 14px `gate-muted`.
  - Bouton de saisie manuelle (secours) : pleine largeur, 56px, rayon 18, fond `gold-400`, texte `green-900` 16px 900.
- **État 2 — Vérification** : spinner SVG 72px (`em-spin` 900ms linéaire, piste `gate-border`, arc `gold-400`), « Vérification de l'autorisation… ». Durée réelle uniquement ; **aucun délai artificiel**.
- **État 3a — Sortie autorisée** :
  - Cercle 96px `green-500` en `em-pop` 480ms, coche blanche dessinée (`em-draw`, délai 240ms), onde `em-ring` 1.1s.
  - « Sortie autorisée » 22px 900.
  - Carte : avatar enfant, nom, classe + matricule ; séparateur ; « Récupéré par » (nom + lien de parenté) et « Heure » (HHhMM, chiffres tabulaires).
  - Deux boutons 56px : « Nouveau scan » (contour) et « Notifier le parent » (`gold-400`). Si la notification est déjà automatique, remplacer le second par une confirmation « Parent notifié ».
  - Toast « Parent prévenu · Passage enregistré dans le journal. » (`em-toast`, 2.6s).
- **État 3b — Sortie refusée** (à créer si absent) : cercle `danger` 96px, icône croix, **pas de rebond** (apparition 200ms opacity), « Personne non autorisée », bouton « Alerter la direction ». Ton sérieux, aucune animation ludique.
- Retour haptique (si PWA mobile et API disponible) : `navigator.vibrate(30)` sur validation, `navigator.vibrate([60,40,60])` sur refus.
- **Chaque passage reste journalisé** (ne pas toucher à la logique existante).

### 5.3 Administration (desktop, registre sobre)

Base existante conservée (barre latérale + contenu). Raffinements :

#### 5.3.1 Barre latérale

- Logo école + nom + niveaux (« Garderie · Maternelle · Primaire »).
- Titres de section 11–12px 800 MAJUSCULES interlettrage .06em `text-muted`.
- Entrées : icônes SVG (remplacer les emojis), 14px 700, rayon 12, hauteur ≥ 40px ; actif = fond `green-100`, texte `green-900` ; survol fond `rgba(31,92,70,.06)` 240ms.
- Responsive : sous 900px, la barre se replie en tiroir (bouton menu).

#### 5.3.2 Cartes KPI

- 4 cartes (Élèves inscrits actifs, Enseignants actifs, Présence élèves aujourd'hui, Présence enseignants aujourd'hui) : fond blanc, bordure, rayon 16, padding 20.
- Pastille icône 40×40 rayon 12 (fond doux de la couleur de la carte).
- Valeur 28–32px 900 tabulaire, animée par `countUp()` (900ms) **une seule fois** au chargement.
- **État vide (corrige D6)** : au lieu de « — », afficher « Appel non effectué » ou « Aucun pointage aujourd'hui » en 14px 700 `text-muted`, avec un lien « Faire l'appel » / « Voir le journal ».
- Entrée : `.em-rise` en cascade (`--i` 0 à 3).

#### 5.3.3 Répartition des élèves par classe

- Barres horizontales `green-700` sur piste `--em-border`, rayon 999, hauteur 8–10px, effectif à droite (tabulaire).
- Animation `em-fill-x` à la première apparition, décalée de 40ms par barre (max 12 barres animées ; au-delà, sans délai).
- Classe à 0 élève : barre vide, effectif « 0 » en `text-muted`.

#### 5.3.4 Alertes du jour

- Pastilles « N élève(s) absent(s) » (`terracotta-100`/`terracotta-800`) et « N retard(s) » (`gold-100`/`gold-800`).
- Zéro alerte : message positif « Aucune absence signalée aujourd'hui » avec coche `green-500` (bonne nouvelle d'abord).

#### 5.3.5 Tableaux (élèves, paiements, journal)

- En-tête collant, lignes 48px, zébrage très léger ou séparateurs `--em-border`, survol de ligne `rgba(31,92,70,.04)`.
- **Aucune animation d'entrée ligne par ligne** sur les tableaux (lisibilité, performance).
- Montants alignés à droite, tabulaires, format `600 000 F CFA` (espace insécable fine comme séparateur de milliers : `toLocaleString('fr-FR')`).
- Tableaux larges : conteneur `overflow-x: auto`.

#### 5.3.6 Formulaires

- Champs 44px min, rayon 12, bordure `--em-border`, focus bordure `green-700` + anneau `0 0 0 3px rgba(31,92,70,.15)`.
- Erreur : bordure `danger`, message 13px sous le champ. Pas de secousse.
- Enregistrement réussi : toast « Enregistré » avec coche dessinée.

### 5.4 Espace enseignant (mobile)

- Mêmes en-tête et barre basse que la console parent (onglets : Aujourd'hui, Cours, Pointage, Profil — adapter à l'existant).
- **Pointage** : grand bouton circulaire 160px « Pointer mon arrivée » (`green-700`), anneau qui pulse doucement tant que non pointé ; après succès : `em-pop` + coche dessinée + heure affichée + message « Bonne journée ! ». Si la vérification GPS est implémentée : état « Localisation en cours… » avec spinner, puis succès ou « Vous semblez hors de l'établissement » (sans animation ludique).
- Jalon (ex. 20 jours de pointage ponctuel dans le mois) : **seule occasion** de confettis dans l'espace enseignant. Ne jamais afficher de message négatif en cas de retard.
- Cours / emploi du temps : cartes par créneau, créneau en cours mis en évidence (bordure `gold-400`).

### 5.5 Landing page (site public)

Page de présentation commerciale d'EcoMaZ. Fluide, `max-width: 1200px`, padding latéral 24px, fonctionne de 360px à 1920px.

Sections et mouvements, dans l'ordre :

1. **Navigation** (fond `green-900`) : logo (pastille `gold-400` « E » + « EcoMaZ » 21px 900), liens ancrés (Fonctionnalités, Vos données, Tarifs, Questions) `--em-text-on-dark` 15px 700, CTA pilule « Demander une démo » `gold-400` 44px. Passe à la ligne sur mobile (ou menu burger).
2. **Hero** (fond `green-900`, padding bas 110px) :
   - Orbite décorative : cercle 720px en pointillés `rgba(232,176,75,.25)`, deux points (`gold-400` 14px, `terracotta` 12px), rotation 40s linéaire, `aria-hidden`.
   - Colonne texte (flex 1 1 480px) avec cascade `em-rise-lg` 700ms : sur-titre pilule (délai 80ms) « GESTION SCOLAIRE · DE LA GARDERIE À L'UNIVERSITÉ » ; titre (180ms) `clamp(2.4rem, 5vw, 4rem)` 900 interlignage 1.04 : « L'école tourne. / Les parents sont rassurés. / **Vous pilotez.** » (dernière ligne `gold-400`) ; paragraphe (300ms) 19px `text-on-dark` ; boutons (420ms) : CTA principal `gold-400` 56px avec **reflet** `em-shine` 3.6s et flèche, CTA secondaire contour ; preuve (540ms) : point vert halo + « En service à l'école SUCCESS KIDS, Abidjan, depuis août 2026 ».
   - Colonne visuel (flex 1 1 360px) : maquette de téléphone 300px (cadre `#0b1410` rayon 42, écran rayon 32) en **flottement** 6s ; à l'intérieur, mini console parent avec barre de progression `em-fill-x` (délai 900ms) et **trois notifications en boucle** (cycle 9s, décalages 0s / 3s / 6s ; chacune apparaît, reste ≈ 2s, disparaît vers le haut) : « Arrivée à 7h42 », « Paiement reçu — Scolarité réglée par Mobile Money », « Sortie validée · 16h05 ». **Les prénoms sont fictifs et doivent rester génériques.**
3. **Bandeau des niveaux** : fond `gold-400`, incliné `-1.2deg`, chevauche le hero (`margin-top: -36px`) ; défilement infini 28s linéaire de « Garderie · Maternelle · Primaire · Collège · Lycée · Grande école » (liste dupliquée pour la boucle, translation -50%) ; texte 20px 900 `green-900`.
4. **Fonctionnalités** : sur-titre « TOUT EN UN », titre « Ce qui prenait des heures se fait en quelques gestes. » ; grille `repeat(auto-fit, minmax(260px, 1fr))` de 6 cartes (rayon 26, padding 26, pastille icône 52px alternant vert/terracotta/or) : Présences en temps réel, Parents prévenus aussitôt, Paiement Mobile Money, Sorties sécurisées, Comptabilité complète, Emplois du temps et programmes. Apparition `.em-reveal`, survol soulèvement -6px.
5. **Une journée avec EcoMaZ** : titre « Du portail au bulletin, chacun a son espace. » ; frise verticale 7h30 / 9h00 / 12h00 / 16h00 ; la **ligne se dessine au défilement** (`scaleY` lié à `animation-timeline: view()`, origine en haut), pastilles rondes à chaque étape.
6. **Souveraineté des données** : grande carte `green-900` rayon 36, anneau décoratif, titre « Vos données restent les vôtres. », texte sur la base dédiée par école, trois garanties avec icône cadenas sur pastille `gold-400`.
7. **Témoignage** : guillemets SVG `gold-400` 48px, citation `clamp(1.4rem, 2.6vw, 2rem)` 800. **Le contenu est un espace réservé** : `[Citation de la direction de SUCCESS KIDS à recueillir]`, `[Nom, fonction]`. Ne jamais inventer de citation.
8. **Tarifs** : deux cartes — Installation **600 000 F CFA** (blanche) et Entretien technique **50 000 F CFA / mois** (`green-900`) ; prix 42px 900.
9. **FAQ** : accordéon accessible (`<button aria-expanded>`), ouverture par `grid-template-rows: 0fr → 1fr` 380ms + opacité, chevron qui pivote 180° en rebond. Une seule réponse ouverte à la fois. La question « Combien de temps faut-il pour démarrer ? » a une réponse en **espace réservé** `[Délai de mise en place à préciser]`.
10. **Appel final** : carte `gold-400` rayon 36, « Voyez EcoMaZ fonctionner dans votre école. », bouton `green-900` « Écrire sur WhatsApp ».
11. **Pied de page** (`#0f1613`) : nom, « Gestion scolaire conçue à Abidjan, Côte d'Ivoire. », contacts.

**Contacts actuels** (fournis par l'utilisateur, à confirmer) : téléphone `+225 05 44 15 61 26` (`tel:+2250544156126`), WhatsApp `+225 07 49 66 06 43` (`https://wa.me/2250749660643`), e-mail `zohjunior@gmail.com`. Centralise-les dans un fichier de configuration (`siteConfig`) pour pouvoir les remplacer par des contacts EcoMaZ dédiés.

**SEO de la landing** : `<title>` « EcoMaZ — Gestion scolaire de la garderie à l'université | Côte d'Ivoire », meta description (≤ 160 caractères), balises Open Graph (titre, description, image 1200×630), `lang="fr"`, un seul `<h1>`, hiérarchie `h2`/`h3` correcte, images avec `alt`, sitemap si le site a plusieurs pages.

---

## 6. Corrections fonctionnelles liées au design

### 6.1 Bug D1 — texte des cartes d'honneur en miroir

Procédure de diagnostic :

1. Inspecte le composant de carte d'honneur et **toute la chaîne de parents** à la recherche de : `transform: scaleX(-1)`, `scale(-1)`, `rotateY(180deg)`, `rotate(180deg)`, `direction: rtl`, `writing-mode`, ou une carte « retournable » (flip card) dont la face arrière est affichée par défaut sans `backface-visibility: hidden`.
2. Cherche dans le CSS et le JS les mots-clés `flip`, `rotateY`, `scaleX(-1)`, `backface`.
3. Cause probable : effet de carte retournée (recto/verso) mal initialisé, ou miroir appliqué au conteneur pour retourner le dégradé.
4. Correction : supprimer la transformation (la nouvelle carte § 5.1.6 n'a pas de verso). Si un effet de retournement est souhaité plus tard, il devra utiliser `backface-visibility: hidden` sur les deux faces et partir de la face avant.
5. Vérifie sur Chrome Android, Safari iOS et Chrome desktop.

### 6.2 Défaut D4 — cohérence des dates

- Validation à la saisie (formulaire d'inscription) : `date_naissance < date_inscription`, et âge plausible selon le niveau (ex. garderie ≥ 6 mois). Message clair en cas d'incohérence.
- **Ne corrige pas les données existantes automatiquement.** Produis une liste des fiches incohérentes pour l'utilisateur.
- Toute contrainte en base (`CHECK`) uniquement après accord explicite.

### 6.3 Défaut D3 — doublons au tableau d'honneur

- Vérifie la requête : la même personne ne doit apparaître qu'une fois par catégorie et par période. Ajoute une déduplication côté affichage (par identifiant) en attendant.

---

## 7. Accessibilité (obligatoire)

- Contraste texte ≥ **4.5:1** (≥ 3:1 au-delà de 24px ou 19px gras). Le texte blanc sur `gold-400` est **interdit** ; utiliser `green-900`.
- Éléments interactifs = vrais `<button>`, `<a href>`, `<input>` + `<label>`. Jamais de `onClick` sur un `div`.
- `aria-label` sur les boutons-icônes ; `aria-hidden="true"` sur les décors (orbite, confettis, anneaux).
- `aria-current="page"` (navigation), `aria-expanded` (accordéon), `aria-pressed` (applaudir), `role="status"` (toasts), `aria-live="polite"` pour les compteurs mis à jour.
- Navigation complète au clavier sur desktop ; ordre de tabulation logique ; focus visible (§ 2.5).
- `prefers-reduced-motion` respecté partout (§ 3.6) ; aucune information transmise **uniquement** par une animation ou une couleur.
- Taille de texte : l'interface reste utilisable avec un zoom navigateur à 200 % et avec la taille de police système agrandie (utiliser `rem`).

---

## 8. Performance (contexte : Android d'entrée de gamme, réseau 3G/4G instable)

- Animations : `transform` et `opacity` uniquement (§ 3.5). Viser 60 i/s sur un Android d'entrée de gamme.
- Au plus **2 boucles infinies visibles simultanément** par écran mobile (ex. pulse de la cloche + halo de l'élève du mois). Mettre en pause les boucles hors écran (`animation-play-state: paused` via IntersectionObserver si nécessaire).
- Aucune bibliothèque lourde ajoutée sans justification (pas de Lottie/Rive pour cette refonte ; le CSS couvre tout).
- Polices : `display=swap`, deux graisses minimum chargées en priorité (400 et 800/900).
- Images (photos d'élèves) : redimensionnées côté serveur (128px et 256px pour les avatars), `loading="lazy"`, `decoding="async"`, format WebP.
- Budget : la refonte ne doit pas augmenter le JavaScript initial de plus de **10 ko gzippés**.
- Mesure avant/après avec Lighthouse (mobile) : Performance et Accessibilité ne doivent pas baisser ; viser Accessibilité ≥ 95.

---

## 9. Ordre d'exécution (lots)

Chaque lot = une PR/commit séparé, déployé en prévisualisation, validé avant le suivant.

| Lot | Contenu | Risque |
|---|---|---|
| **L0** | Rapport de reconnaissance (§ 0.3) | Nul |
| **L1** | Correctifs bloquants : bug miroir D1, doublons D3, en-tête D5 | Faible |
| **L2** | Jetons (`ecomaz-tokens.css`), police Nunito, bibliothèque de mouvement (`ecomaz-motion.css`, `motion.js`) — sans changer l'apparence des écrans au-delà des couleurs harmonisées | Faible |
| **L3** | Icônes SVG à la place des emojis (D7), partout | Faible |
| **L4** | Console parent complète (§ 5.1) : en-tête, salutation, fiche enfant + présence de la semaine, actualités, tableau d'honneur (bouton Applaudir derrière drapeau), navigation basse | Moyen |
| **L5** | Console portier (§ 5.2) | Moyen — **tester hors heures de sortie** |
| **L6** | Administration (§ 5.3) : KPI + états vides, barres, alertes, tableaux, formulaires, validation des dates D4 | Moyen |
| **L7** | Espace enseignant (§ 5.4) | Moyen |
| **L8** | Landing page (§ 5.5) + SEO | Faible (site public séparé) |
| **L9** | Passe finale accessibilité, performance, mode sombre, réduction des animations | Faible |

Après chaque lot : résumé des fichiers modifiés, captures avant/après si possible, liste de ce qui reste à valider par l'utilisateur.

---

## 10. Critères d'acceptation (check-list)

### Général
- [ ] Aucune régression fonctionnelle : appel, pointage enseignant, scanner de badge, paiements, notifications, journal, comptabilité fonctionnent comme avant.
- [ ] Aucune couleur, durée, rayon ou ombre en dur dans les composants modifiés : tout passe par les jetons.
- [ ] Plus aucun emoji utilisé comme icône d'interface.
- [ ] Police Nunito chargée partout, chiffres tabulaires sur les montants et compteurs.
- [ ] Mode clair et mode sombre corrects sur les 4 espaces (le portier reste sombre).
- [ ] Avec « Réduire les animations » activé (Android : Accessibilité > Supprimer les animations ; iOS : Réduire les animations ; Windows/macOS équivalents) : tout s'affiche, rien ne reste invisible, aucune boucle.

### Console parent
- [ ] Noms du tableau d'honneur lisibles, à l'endroit, sur tous les navigateurs.
- [ ] Aucune personne en double dans une même catégorie.
- [ ] Cartes d'honneur compactes, photo ou initiales, halo doré uniquement sur l'élève du mois.
- [ ] Entrée en cascade terminée en ≤ 700ms ; main qui salue deux fois puis s'arrête.
- [ ] Présence de la semaine branchée sur les vraies données (ou masquée si indisponible — jamais de fausses données).
- [ ] Alerte d'absence affichée immédiatement, au-dessus de la fiche enfant.
- [ ] Pastille d'onglet qui glisse ; `aria-current` correct.
- [ ] En-tête qui ne flotte plus au milieu du contenu.

### Portier
- [ ] Les trois états (attente, vérification, résultat) + refus sont distincts et lisibles en plein soleil.
- [ ] Aucun délai artificiel ajouté au scan.
- [ ] Le journal de passage est toujours alimenté.

### Administration
- [ ] KPI animés une seule fois ; états vides explicites à la place de « — ».
- [ ] Validation date de naissance < date d'inscription à la saisie ; liste des incohérences existantes fournie.
- [ ] Tableaux sans animation par ligne ; montants formatés `600 000 F CFA`.

### Landing page
- [ ] Hero lisible immédiatement (le texte n'attend pas la fin des animations).
- [ ] Notifications du téléphone en boucle sans chevauchement.
- [ ] Apparitions au défilement fonctionnelles sur Chrome/Edge et repli `IntersectionObserver` sur Safari/Firefox.
- [ ] Espaces réservés (témoignage, délai) clairement signalés et non remplacés par du contenu inventé.
- [ ] Contacts centralisés dans un fichier de configuration.
- [ ] Lighthouse mobile : Accessibilité ≥ 95, pas de baisse de Performance.

---

## 11. Ce qu'il ne faut pas faire

- Ne pas ajouter de streaks, de compteurs de temps passé ou de messages culpabilisants.
- Ne pas mettre de confettis sur un paiement, une connexion ou un simple enregistrement.
- Ne pas animer les tableaux de données ligne par ligne.
- Ne pas utiliser de dégradés plein cadre, de néons ou de glassmorphisme sur les zones de lecture.
- Ne pas introduire de données fictives dans l'application réelle.
- Ne pas modifier le schéma Supabase, les règles de sécurité (RLS) ou les fonctions de paiement sans accord explicite.
- Ne pas déployer en production sans validation de l'utilisateur sur la prévisualisation.
- Ne pas ajouter de dépendance lourde (Lottie, Rive, GSAP) pour cette refonte.

---

## 12. Référence visuelle

Les maquettes animées validées par l'utilisateur existent sur un canvas Claude « EcoMaZ — Motion Design » (planches : Console parent — accueil animé ; Console portier — contrôle de sortie ; Système de mouvement EcoMaZ ; Landing page EcoMaZ). Si l'utilisateur t'en fournit des exports ou des captures, elles priment sur les descriptions textuelles en cas d'écart **visuel** ; ce document prime pour les **valeurs** (couleurs, durées, courbes) et pour les **règles** (accessibilité, performance, sécurité du chantier).

Fin du document.
