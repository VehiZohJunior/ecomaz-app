/* =========================================================================
   EcoMaZ — Gestion scolaire multi-établissements
   Les données sont hébergées sur Supabase (Postgres + Auth + RLS), pas en
   local — voir supabase-client.js pour la couche de connexion.
   ========================================================================= */

/* ---------------------------------------------------------------------
   0. CONSTANTES
   --------------------------------------------------------------------- */
const JOURS = ['Lundi','Mardi','Mercredi','Jeudi','Vendredi'];
const TRIMESTRES = ['Trimestre 1','Trimestre 2','Trimestre 3'];

/* --- Niveaux scolaires : chaque école choisit ceux qu'elle couvre --- */
const NIVEAUX_DEF = {
  prescolaire: {label:'Préscolaire', desc:'Garderie, Maternelle', icon:'🍼', classes:[
    {id:'garderie', nom:'Garderie',        cycle:'Garderie'},
    {id:'ps',       nom:'Petite Section',  cycle:'Maternelle'},
    {id:'ms',       nom:'Moyenne Section', cycle:'Maternelle'},
    {id:'gs',       nom:'Grande Section',  cycle:'Maternelle'},
  ]},
  primaire: {label:'Primaire', desc:'CP1 → CM2', icon:'🎒', classes:[
    {id:'cp1', nom:'CP1', cycle:'Primaire'}, {id:'cp2', nom:'CP2', cycle:'Primaire'},
    {id:'ce1', nom:'CE1', cycle:'Primaire'}, {id:'ce2', nom:'CE2', cycle:'Primaire'},
    {id:'cm1', nom:'CM1', cycle:'Primaire'}, {id:'cm2', nom:'CM2', cycle:'Primaire'},
  ]},
  college: {label:'Collège', desc:'6ème → 3ème', icon:'📘', classes:[
    {id:'sixieme',   nom:'6ème', cycle:'Collège'},
    {id:'cinquieme', nom:'5ème', cycle:'Collège'},
    {id:'quatrieme', nom:'4ème', cycle:'Collège'},
    {id:'troisieme', nom:'3ème', cycle:'Collège'},
  ]},
  lycee: {label:'Lycée', desc:'2nde → Terminale', icon:'🎓', classes:[
    {id:'seconde',   nom:'2nde',      cycle:'Lycée'},
    {id:'premiere',  nom:'1ère',      cycle:'Lycée'},
    {id:'terminale', nom:'Terminale', cycle:'Lycée'},
  ]},
  grande_ecole: {label:'Grande École', desc:'Cycle ingénieur / commerce (Bac+3 à Bac+5)', icon:'🏛️', classes:[
    {id:'ge1', nom:'1ère année', cycle:'Grande École'},
    {id:'ge2', nom:'2ème année', cycle:'Grande École'},
    {id:'ge3', nom:'3ème année', cycle:'Grande École'},
    {id:'ge4', nom:'4ème année', cycle:'Grande École'},
    {id:'ge5', nom:'5ème année', cycle:'Grande École'},
  ]},
  formation_qualifiante: {label:'Formation Qualifiante', desc:'Courtes formations aux métiers manuels', icon:'🛠️', classes:[
    {id:'fq1', nom:'Année 1', cycle:'Formation Qualifiante'},
    {id:'fq2', nom:'Année 2', cycle:'Formation Qualifiante'},
  ]},
  formation_professionnelle: {label:'Formation Professionnelle', desc:'Filières professionnelles diplômantes', icon:'🏭', classes:[
    {id:'fp1', nom:'Année 1', cycle:'Formation Professionnelle'},
    {id:'fp2', nom:'Année 2', cycle:'Formation Professionnelle'},
    {id:'fp3', nom:'Année 3', cycle:'Formation Professionnelle'},
  ]},
  formation_technique: {label:'Formation Technique', desc:'Filières techniques et industrielles', icon:'⚙️', classes:[
    {id:'ft1', nom:'Année 1', cycle:'Formation Technique'},
    {id:'ft2', nom:'Année 2', cycle:'Formation Technique'},
    {id:'ft3', nom:'Année 3', cycle:'Formation Technique'},
  ]},
  universite: {label:'Université (privée)', desc:'Licence → Master (système LMD)', icon:'🏢', classes:[
    {id:'l1', nom:'Licence 1', cycle:'Université'},
    {id:'l2', nom:'Licence 2', cycle:'Université'},
    {id:'l3', nom:'Licence 3', cycle:'Université'},
    {id:'m1', nom:'Master 1', cycle:'Université'},
    {id:'m2', nom:'Master 2', cycle:'Université'},
  ]},
};
function classesForNiveaux(niveaux){
  return (niveaux||[]).flatMap(n => (NIVEAUX_DEF[n]?.classes || []).map(c => ({...c})));
}
/* Masque du reste de l'appli les classes/élèves des niveaux décochés, sans rien
   supprimer en base : elles réapparaissent dès que le niveau est recoché. */
// Code de niveau d'une classe (ps, cp1…). Les classes créées avant le
// 17/10/2026 ont pour identifiant leur code ; les suivantes ont un
// identifiant propre à leur école (schema.sql section 83).
function codeClasse(c){ return (c && (c.code || c.id)) || ''; }
function appliquerFiltreNiveaux(db){
  const codesActifs = new Set(classesForNiveaux(db.meta.niveaux).map(c=>c.id));
  db.classesTout = db.classes;
  db.classes = db.classes.filter(c => codesActifs.has(codeClasse(c)));
  const idsActifs = new Set(db.classes.map(c => c.id));
  db.eleves = db.eleves.filter(e => idsActifs.has(e.classeId));
  return db;
}
// Copie hors ligne propre à CHAQUE utilisateur : sur un téléphone partagé, personne ne voit la copie d'un autre
function cleCopieHorsLigne(){ return `${session.ecoleId}|${session.userId}`; }
async function chargerDB(){
  try{
    const db = appliquerFiltreNiveaux(await loadAllFromSupabase());
    db.meta.horsLigne = false;
    try{ await idbPut('snapshot', { ecoleId: cleCopieHorsLigne(), donnees: db, horodatage: Date.now() }); }catch(_e){ /* cache best-effort */ }
    return db;
  }catch(e){
    if(!erreurReseau(e)) throw e;
    // Hors ligne : on retombe sur la dernière copie connue des données de
    // cette école, enregistrée localement lors du dernier chargement réussi.
    const cache = await idbGet('snapshot', cleCopieHorsLigne()).catch(()=>null);
    if(!cache) throw e; // jamais chargé avec succès sur cet appareil : rien à afficher
    const db = cache.donnees;
    db.meta.horsLigne = true;
    return db;
  }
}

const MATIERES_BY_CYCLE = {
  'Garderie':   ['Éveil','Motricité','Chant & Comptines','Activités Manuelles'],
  'Maternelle': ['Langage','Graphisme','Éveil Scientifique','Activités Numériques','Motricité','Chant & Poésie'],
  // Primaire : intitulés du programme officiel ivoirien (PNAPAS) — Sciences et Technologie, EDHC
  // (Éducation aux Droits de l'Homme et à la Citoyenneté), AEC (Activités d'Expression et de Création)
  'Primaire':   ['Français','Mathématiques','Sciences et Technologie','Histoire-Géographie','EDHC','AEC','EPS','Anglais','Informatique'],
  'Collège':    ['Français','Mathématiques','Anglais','SVT','Physique-Chimie','Histoire-Géographie','EPS','Éducation Civique et Morale'],
  'Lycée':      ['Français','Mathématiques','Anglais','Philosophie','Physique-Chimie','SVT','Histoire-Géographie','EPS'],
  'Grande École': ['Anglais','Informatique','Méthodologie','Communication professionnelle','Spécialité','Stage / Projet tuteuré'],
  'Formation Qualifiante': ['Pratique du métier','Théorie du métier','Sécurité au travail','Entrepreneuriat'],
  'Formation Professionnelle': ['Pratique professionnelle','Théorie du métier','Technologie','Anglais professionnel','Entrepreneuriat','Stage pratique'],
  'Formation Technique': ['Mathématiques appliquées','Technologie','Dessin technique','Pratique en atelier','Informatique','Anglais technique'],
  'Université': ['Unité fondamentale 1','Unité fondamentale 2','Anglais','Méthodologie du travail universitaire','Spécialité','Stage / Mémoire'],
};

const PERIODES_BY_CYCLE = {
  'Garderie': [
    {debut:'08:00',fin:'09:00',type:'cours'},
    {debut:'09:00',fin:'10:00',type:'cours'},
    {debut:'10:00',fin:'10:30',type:'pause',label:'Récréation'},
    {debut:'10:30',fin:'11:30',type:'cours'},
    {debut:'11:30',fin:'12:00',type:'cours'},
    {debut:'12:00',fin:'13:00',type:'pause',label:'Repos / Repas'},
  ],
  'Maternelle': [
    {debut:'08:00',fin:'09:00',type:'cours'},
    {debut:'09:00',fin:'10:00',type:'cours'},
    {debut:'10:00',fin:'10:30',type:'pause',label:'Récréation'},
    {debut:'10:30',fin:'11:30',type:'cours'},
    {debut:'11:30',fin:'12:30',type:'cours'},
    {debut:'12:30',fin:'14:00',type:'pause',label:'Pause déjeuner'},
    {debut:'14:00',fin:'15:00',type:'cours'},
  ],
  'Primaire': [
    {debut:'07:30',fin:'08:30',type:'cours'},
    {debut:'08:30',fin:'09:30',type:'cours'},
    {debut:'09:30',fin:'10:00',type:'pause',label:'Récréation'},
    {debut:'10:00',fin:'11:00',type:'cours'},
    {debut:'11:00',fin:'12:00',type:'cours'},
    {debut:'12:00',fin:'13:30',type:'pause',label:'Pause déjeuner'},
    {debut:'13:30',fin:'14:30',type:'cours'},
    {debut:'14:30',fin:'15:30',type:'cours'},
  ],
  'Collège': [
    {debut:'07:30',fin:'08:30',type:'cours'},
    {debut:'08:30',fin:'09:30',type:'cours'},
    {debut:'09:30',fin:'10:00',type:'pause',label:'Récréation'},
    {debut:'10:00',fin:'11:00',type:'cours'},
    {debut:'11:00',fin:'12:00',type:'cours'},
    {debut:'12:00',fin:'13:30',type:'pause',label:'Pause déjeuner'},
    {debut:'13:30',fin:'14:30',type:'cours'},
    {debut:'14:30',fin:'15:30',type:'cours'},
  ],
  'Lycée': [
    {debut:'07:30',fin:'08:30',type:'cours'},
    {debut:'08:30',fin:'09:30',type:'cours'},
    {debut:'09:30',fin:'10:30',type:'cours'},
    {debut:'10:30',fin:'11:00',type:'pause',label:'Récréation'},
    {debut:'11:00',fin:'12:00',type:'cours'},
    {debut:'12:00',fin:'13:30',type:'pause',label:'Pause déjeuner'},
    {debut:'13:30',fin:'14:30',type:'cours'},
    {debut:'14:30',fin:'15:30',type:'cours'},
  ],
};
const PERIODES_SUPERIEUR = [
  {debut:'08:00',fin:'10:00',type:'cours'},
  {debut:'10:00',fin:'10:15',type:'pause',label:'Pause'},
  {debut:'10:15',fin:'12:15',type:'cours'},
  {debut:'12:15',fin:'13:30',type:'pause',label:'Pause déjeuner'},
  {debut:'13:30',fin:'15:30',type:'cours'},
  {debut:'15:30',fin:'15:45',type:'pause',label:'Pause'},
  {debut:'15:45',fin:'17:00',type:'cours'},
];
['Grande École','Formation Qualifiante','Formation Professionnelle','Formation Technique','Université'].forEach(cycle=>{
  PERIODES_BY_CYCLE[cycle] = PERIODES_SUPERIEUR;
});

const VIEW_TITLES = {
  dashboard: 'Tableau de bord',
  eleves: 'Élèves & Inscriptions',
  notes: 'Notes & Bulletins',
  'presences-eleves': 'Pointage élèves — Appel',
  'emploi-temps': 'Emploi du temps',
  enseignants: 'Enseignants',
  'presences-enseignants': 'Pointage enseignants — Journal',
  'pointage-scan': 'Pointage — Scanner un badge',
  programmes: 'Programmes pédagogiques',
  comptabilite: 'Comptabilité',
  messagerie: 'Messagerie',
  'tableau-affichage': "Tableau d'affichage",
  parametres: 'Paramètres',
  'liens-parents': 'Parents ↔ Élèves',
  'vie-ecole': 'Vie de l’école',
  agenda: 'Agenda de l’école',
  devoirs: 'Cahier de textes',
  cantine: 'Menu de la cantine',
  'cahier-appel': 'Cahier d’appel',
  'camps-de-base': 'Camps de base — devoirs et exercices',
  renforcement: 'Cours de renforcement',
  'rapport-activite': 'Rapport d’activité',
  services: 'Tous nos services',
  'creer-evaluation': 'Je crée une évaluation',
  'boite-evaluations': 'Boîte à évaluations',
  rapports: 'Rapports et téléchargements',
  'registre-notes': 'Registre des notes du jour',
  'appels-groupes': 'Appels : cantine, activités, renforcement',
  permissions: 'Demandes de permission',
};

/* --- Comptabilité --- */
const DEVISE = 'F\u00a0CFA'; // format de la spécification : « 600 000 F CFA »
const CATEGORIES_DEPENSES = ['Loyer','Entretien','Matériel pédagogique','Fournitures scolaires','Électricité & Eau','Transport','Restauration','Autre'];
const TRANCHES_SCOLARITE = ['Inscription','Tranche 1','Tranche 2','Tranche 3','Versement libre'];
const MODES_PAIEMENT = ['Espèces','Mobile Money','Virement bancaire','Chèque'];
const POSTES_PERSONNEL = ["Gardien(ne)","Agent d'entretien","Cuisinier(ère)","Comptable","Secrétaire","Aide-maternelle","Infirmier(ère) scolaire","Chauffeur"];
const FRAIS_SCOLARITE_DEFAUT = {
  garderie:180000, ps:220000, ms:220000, gs:240000, cp1:280000, cp2:280000, ce1:300000, ce2:300000, cm1:320000, cm2:340000,
  sixieme:360000, cinquieme:360000, quatrieme:380000, troisieme:400000,
  seconde:420000, premiere:440000, terminale:460000,
  ge1:900000, ge2:900000, ge3:950000, ge4:1000000, ge5:1050000,
  fq1:350000, fq2:350000,
  fp1:450000, fp2:450000, fp3:450000,
  ft1:500000, ft2:500000, ft3:500000,
  l1:600000, l2:600000, l3:650000, m1:750000, m2:800000,
};
const COMPTA_TABS = [
  {id:'apercu', label:'Aperçu', icon:'📊'},
  {id:'rapport', label:'Rapport financier', icon:'📈'},
  {id:'scolarite', label:'Scolarité', icon:'🎓'},
  {id:'cantine', label:'Cantine', icon:'🍽️'},
  {id:'activites', label:'Activités extra-scolaires', icon:'🎨'},
  {id:'ventes', label:'Boutique scolaire', icon:'🛍️'},
  {id:'salaires', label:'Salaires', icon:'💵'},
  {id:'depenses', label:'Charges & Dépenses', icon:'🏠'},
  {id:'fne', label:'FNE', icon:'🧾'},
  {id:'journal', label:"Journal d'audit", icon:'📜'},
  {id:'annees', label:'Comparaison annuelle', icon:'📅'},
  {id:'budget', label:'Budget prévisionnel', icon:'🎯'},
  {id:'syscohada', label:'Plan SYSCOHADA', icon:'📗'},
  {id:'rapprochement', label:'Rapprochement bancaire', icon:'🏦'},
];

/* --- Rôles / Interfaces --- */
const ROLES = {
  enseignant:  {label:'Enseignant(e)', icon:'👩‍🏫', desc:'Notes, présences, emploi du temps', nav:['dashboard','services','cahier-appel','camps-de-base','creer-evaluation','notes','presences-eleves','devoirs','emploi-temps','programmes','rapport-activite','rapports','appels-groupes','permissions','vie-ecole','agenda']},
  secretariat: {label:'Secrétariat', icon:'🗂️', desc:'Gestion administrative & scolarité', nav:['dashboard','services','eleves','liens-parents','renforcement','vie-ecole','agenda','devoirs','cantine','cahier-appel','camps-de-base','notes','presences-eleves','emploi-temps','programmes','pointage-scan','enseignants','presences-enseignants','comptabilite','rapports','registre-notes','appels-groupes','permissions','messagerie','boite-evaluations']},
  direction:   {label:'Direction', icon:'🎩', desc:'Accès complet', nav:'all'},
  fondation:   {label:'Fondation', icon:'🏛️', desc:'Accès complet', nav:'all'},
  parent:      {label:'Parent', icon:'👪', desc:"Suivi de l'enfant", nav:[]},
  portier:     {label:'Portier', icon:'🚪', desc:"Signaler l'arrivée d'un parent", nav:[]},
};
const IDLE_TIMEOUT_MS = 10*60*1000; // auto-déconnexion après 10 min d'inactivité

const NOMS = ['Kouassi','Kouamé','Yao','N\'Guessan','Koffi','Bamba','Traoré','Ouattara','Diabaté','Fofana','Coulibaly','Koné','Diarra','Sanogo','Yéo','Assi','Angoran','Kacou','Tanoh','Brou','Zadi','Gnahoré'];
const PRENOMS_G = ['Kouassi','Junior','Emmanuel','David','Samuel','Daniel','Christ','Josué','Franck','Éric','Moussa','Ibrahim','Serge','Aristide','Steve','Grégoire','Élie'];
const PRENOMS_F = ['Aya','Adjoua','Akissi','Grace','Prisca','Rachel','Naomi','Esther','Ruth','Divine','Aïcha','Fatim','Marie','Chantal','Affoué','Amenan','Nafissatou','Clarisse'];
const MOTIFS_ABSENCE = ['Maladie','Rendez-vous médical','Voyage familial','Problème de transport','Non justifié'];

