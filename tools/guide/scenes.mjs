// =====================================================================
// EcoMaZ — Contenu du guide d'utilisation et des vidéos (26/11/2026)
// Une seule source : chaque scène = un écran photographié (avant),
// une légende courte (titre), le texte dit dans la vidéo (voix) et les
// étapes écrites du guide (etapes). Modifier ici, puis relancer :
//   node tools/guide/capturer_guide.mjs   (captures)
//   node tools/guide/faire_videos.mjs     (voix + vidéos)
//   python tools/guide/faire_guide.py     (guide PDF)
// =====================================================================
const vue = v => `(() => { document.querySelector('#sidebar')?.classList.remove('open'); document.querySelector('#sidebarBackdrop')?.classList.remove('open'); if (typeof closeModal === 'function') closeModal(); if (typeof pcBasculer === 'function') pcBasculer(false); go('${v}'); window.scrollTo(0, 0); })()`;

const PERSONNES = (avec) => [
  { nom: 'personnes', titre: 'Qui est connecté ?', avant: `(() => { ${vue('dashboard')}; setTimeout(() => pcBasculer(true), 300); })()`, attente: 1500,
    voix: 'Le bouton Personnes connectées montre vos collègues. Voyant vert : connecté. Voyant gris : pas connecté.',
    etapes: ['Touchez le bouton 👥 en haut de l’écran.', 'Voyant vert : la personne est connectée en ce moment. Voyant gris : elle ne l’est pas.', 'Le chiffre vert donne le nombre de collègues connectés ; un rond rouge signale un message non lu.'] },
  { nom: 'discussion', titre: 'Écrire à un collègue', avant: `(() => { pcBasculer(false); pcOuvrirDiscussion('${avec}'); })()`, attente: 1800,
    voix: 'Touchez un nom pour lui écrire. Le message attend la personne si elle n’est pas connectée.',
    etapes: ['Touchez le nom de la personne.', 'Écrivez votre message puis touchez Envoyer.', '✓ envoyé, ✓✓ lu. Le message attend la personne si elle n’est pas connectée.'] },
];

export const SCENES = {
  enseignant: {
    id: 'demo-enseignant', page: 'enseignant.html', titre: 'Enseignants', couleur: '#0f766e',
    intro: 'EcoMaZ pour les enseignants : l’essentiel en une minute.',
    scenes: [
      { nom: 'accueil', titre: 'Votre accueil : les tâches du jour', avant: vue('dashboard'), attente: 1200,
        voix: 'Votre accueil affiche les tâches du jour : l’appel, les devoirs, les notes.',
        etapes: ['Ouvrez EcoMaZ : l’accueil liste vos tâches du jour.', 'Touchez une tâche pour la faire directement.'] },
      { nom: 'menu', titre: 'Le menu', avant: `(() => { ${vue('dashboard')}; setTimeout(() => document.querySelector('#burger')?.click(), 200); })()`, attente: 1200,
        voix: 'Tous les écrans sont dans le menu, rangés par moment de la semaine.',
        etapes: ['Sur téléphone, touchez Menu en bas à droite de l’écran (sur ordinateur, le menu est à gauche).', 'Il est rangé par moment : chaque jour, chaque semaine, chaque mois et trimestre.'] },
      { nom: 'appel', titre: 'Faire l’appel en 20 secondes', avant: vue('presences-eleves'), attente: 1400,
        voix: 'Chaque matin : Tous présents, puis touchez Absent ou Retard pour les élèves concernés. Validez l’appel : les parents sont prévenus.',
        etapes: ['Menu → Faire l’appel (ou le bouton Appel en bas).', 'Touchez Tous présents, puis Absent ou Retard pour les élèves concernés.', 'Touchez Valider l’appel : les parents des absents sont prévenus.'] },
      { nom: 'devoirs', titre: 'Le cahier de textes', avant: vue('devoirs'), attente: 1200,
        voix: 'Notez les devoirs dans le cahier de textes : les parents les voient aussitôt.',
        etapes: ['Menu → Cahier de textes.', 'Notez la leçon du jour et les devoirs, puis enregistrez.', 'Les parents les voient tout de suite.'] },
      { nom: 'notes', titre: 'Les notes, même en photo', avant: vue('notes'), attente: 1400,
        voix: 'Saisissez les notes, ou prenez votre fiche en photo : l’application la remplit, vous vérifiez.',
        etapes: ['Menu → Compositions et bulletins.', 'Choisissez Remplissage intelligent (photo de votre fiche) ou la saisie élève par élève.', 'Vérifiez les notes proposées, puis enregistrez.'] },
      ...PERSONNES('demo-direction'),
      { nom: 'rapports', titre: 'Vos documents en un toucher', avant: vue('rapports'), attente: 1200,
        voix: 'Rapports et téléchargements : cahier d’appel, bulletins, emploi du temps, en un toucher.',
        etapes: ['Menu → Rapports et téléchargements.', 'Choisissez la classe ou le mois sur la carte, puis touchez le bouton.'] },
    ],
  },
  secretariat: {
    id: 'demo-secretariat', page: 'index.html', titre: 'Secrétariat', couleur: '#7c3aed',
    intro: 'EcoMaZ pour le secrétariat : l’essentiel en une minute.',
    scenes: [
      { nom: 'tableau-de-bord', titre: 'Le tableau de bord', avant: vue('dashboard'), attente: 1400,
        voix: 'Le tableau de bord résume la journée : présences, argent encaissé, et ce qui reste à faire.',
        etapes: ['Le tableau de bord s’ouvre à la connexion : chiffres du jour et encaissements.'] },
      { nom: 'a-faire', titre: 'À faire aujourd’hui', avant: `(() => { ${vue('dashboard')}; setTimeout(() => { basculerRubrique('afaire', true); document.getElementById('rub-afaire')?.scrollIntoView({ block: 'start' }); window.scrollBy(0, -70); }, 400); })()`, attente: 1400,
        voix: 'La tuile À faire donne les priorités du jour, avec un bouton à chaque ligne.',
        etapes: ['Touchez la tuile À faire : les priorités du jour.', 'Chaque ligne a son bouton : Faire l’appel, Voir et contacter, Relancer…'] },
      { nom: 'eleves', titre: 'Inscrire les élèves', avant: vue('eleves'), attente: 1400,
        voix: 'Inscrivez un élève avec Nouvel élève, ou toute une liste depuis Excel.',
        etapes: ['Menu → Élèves et inscriptions.', 'Un élève : + Nouvel élève. Toute une liste : Importer depuis Excel.'] },
      { nom: 'scolarite', titre: 'Encaisser et donner le reçu', avant: `(() => { ui.filters.comptaTab = 'scolarite'; ${vue('comptabilite')}; })()`, attente: 1600,
        voix: 'Comptabilité, Scolarité : touchez la tranche de l’élève, le montant, le mode de paiement. Le reçu est prêt à imprimer.',
        etapes: ['Menu → Comptabilité → onglet Scolarité, puis la classe.', 'Touchez la tranche de l’élève : montant, mode de paiement, Enregistrer.', 'Imprimez le reçu et remettez-le au parent.'] },
      { nom: 'parents', titre: 'Relier les parents', avant: vue('liens-parents'), attente: 1400,
        voix: 'Reliez chaque parent à son enfant avec les coupons d’invitation ou par WhatsApp.',
        etapes: ['Menu → Parents ↔ Élèves.', 'Imprimez les coupons d’invitation ou envoyez-les par WhatsApp.', 'Un parent relié reçoit absences, notes, annonces et reçus.'] },
      ...PERSONNES('demo-direction'),
      { nom: 'rapports', titre: 'Tous les rapports au même endroit', avant: vue('rapports'), attente: 1200,
        voix: 'Rapports et téléchargements : rapport général, scolarité, élèves, reçus. Un toucher, le fichier est prêt.',
        etapes: ['Menu → Rapports et téléchargements.', 'Choisissez le mois ou la classe, puis touchez Télécharger.', 'En bas : Charger pour remplir l’application (liste Excel, photo du cahier de caisse…).'] },
    ],
  },
  direction: {
    id: 'demo-direction', page: 'index.html', titre: 'Direction et Fondation', couleur: '#b45309',
    intro: 'EcoMaZ pour la direction et la fondation : l’essentiel en une minute.',
    scenes: [
      { nom: 'tableau-de-bord', titre: 'L’école d’un coup d’œil', avant: vue('dashboard'), attente: 1400,
        voix: 'Le tableau de bord montre l’école d’un coup d’œil : présences, encaissements, recouvrement.',
        etapes: ['Le tableau de bord s’ouvre à la connexion : présences, encaissements, recouvrement.'] },
      { nom: 'assistant', titre: 'L’assistant vous prévient', avant: `(() => { ${vue('dashboard')}; setTimeout(() => { basculerRubrique('afaire', true); document.getElementById('rub-afaire')?.scrollIntoView({ block: 'start' }); window.scrollBy(0, -70); }, 400); })()`, attente: 1400,
        voix: 'À faire aujourd’hui repère ce qui demande une action : absences répétées, retards de paiement, parents non reliés.',
        etapes: ['Touchez la tuile À faire : appels manquants, élèves absents aux derniers appels, retards de paiement, parents non reliés.', 'Chaque ligne a son bouton pour agir tout de suite.'] },
      { nom: 'relance', titre: 'Relancer poliment par WhatsApp', avant: `(() => { ui.filters.comptaTab = 'scolarite'; ${vue('comptabilite')}; setTimeout(() => ouvrirRelanceImpayes(), 400); })()`, attente: 1500,
        voix: 'Relancer : le message WhatsApp est déjà rédigé poliment. Vous le relisez et vous l’envoyez.',
        etapes: ['Dans À faire aujourd’hui, touchez Relancer (ou Comptabilité → Scolarité → Relancer les retards).', 'Pour chaque famille, WhatsApp s’ouvre avec un message courtois déjà écrit (frères et sœurs regroupés). Vous l’envoyez vous-même.'] },
      { nom: 'pointage', titre: 'Le pointage des enseignants', avant: vue('presences-enseignants'), attente: 1400,
        voix: 'Suivez l’arrivée des enseignants : heure, retard, position vérifiée.',
        etapes: ['Menu → Pointage enseignants — Journal : arrivées, retards, départs, position vérifiée.'] },
      { nom: 'rapport-activite', titre: 'Le travail de chaque enseignant', avant: `(() => { const c = DB.classes.find(x => x.code === 'cp1'); const t = DB.enseignants.find(x => (x.classesAssignees || []).includes(c && c.id)); if (t) ui.filters.rapportEns = t.id; ui.filters.rapportPeriode = 'mois'; ${vue('rapport-activite')}; })()`, attente: 1800,
        voix: 'Le rapport d’activité résume le travail de chaque enseignant, avec points forts et points à surveiller.',
        etapes: ['Menu → Rapport d’activité : appels, devoirs, notes et pointage de chaque enseignant.', 'Points forts et points à surveiller sont écrits en clair ; Imprimer / PDF pour l’archiver.'] },
      ...PERSONNES('demo-secretariat'),
      { nom: 'rapports', titre: 'Le rapport général du mois', avant: vue('rapports'), attente: 1200,
        voix: 'Le rapport général réunit tout le mois dans un seul fichier Excel.',
        etapes: ['Menu → Rapports et téléchargements.', 'Rapport général de l’école : choisissez le mois, touchez Télécharger. Un seul fichier Excel avec la synthèse et le détail.', 'Aussi : comptabilité, grand livre, sauvegarde complète.'] },
    ],
  },
};
