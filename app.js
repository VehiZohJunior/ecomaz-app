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
function appliquerFiltreNiveaux(db){
  const idsActifs = new Set(classesForNiveaux(db.meta.niveaux).map(c=>c.id));
  db.classesTout = db.classes;
  db.classes = db.classes.filter(c => idsActifs.has(c.id));
  db.eleves = db.eleves.filter(e => idsActifs.has(e.classeId));
  return db;
}
async function chargerDB(){
  try{
    const db = appliquerFiltreNiveaux(await loadAllFromSupabase());
    db.meta.horsLigne = false;
    try{ await idbPut('snapshot', { ecoleId: session.ecoleId, donnees: db, horodatage: Date.now() }); }catch(_e){ /* cache best-effort */ }
    return db;
  }catch(e){
    if(!erreurReseau(e)) throw e;
    // Hors ligne : on retombe sur la dernière copie connue des données de
    // cette école, enregistrée localement lors du dernier chargement réussi.
    const cache = await idbGet('snapshot', session.ecoleId).catch(()=>null);
    if(!cache) throw e; // jamais chargé avec succès sur cet appareil : rien à afficher
    const db = cache.donnees;
    db.meta.horsLigne = true;
    return db;
  }
}

const MATIERES_BY_CYCLE = {
  'Garderie':   ['Éveil','Motricité','Chant & Comptines','Activités Manuelles'],
  'Maternelle': ['Langage','Graphisme','Éveil Scientifique','Activités Numériques','Motricité','Chant & Poésie'],
  'Primaire':   ['Français','Mathématiques',"Sciences d'Observation",'Histoire-Géographie','Éducation Civique et Morale','Anglais','EPS','Arts Plastiques'],
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
  parametres: 'Paramètres',
};

/* --- Comptabilité --- */
const DEVISE = 'FCFA';
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
  {id:'scolarite', label:'Scolarité', icon:'🎓'},
  {id:'activites', label:'Activités extra-scolaires', icon:'🎨'},
  {id:'ventes', label:'Boutique scolaire', icon:'🛍️'},
  {id:'salaires', label:'Salaires', icon:'💵'},
  {id:'depenses', label:'Charges & Dépenses', icon:'🏠'},
  {id:'journal', label:"Journal d'audit", icon:'📜'},
];

/* --- Rôles / Interfaces --- */
const ROLES = {
  enseignant:  {label:'Enseignant(e)', icon:'👩‍🏫', desc:'Notes, présences, emploi du temps', nav:['dashboard','notes','presences-eleves','emploi-temps','programmes']},
  secretariat: {label:'Secrétariat', icon:'🗂️', desc:'Gestion administrative & scolarité', nav:['dashboard','eleves','notes','presences-eleves','emploi-temps','programmes','pointage-scan','enseignants','presences-enseignants','comptabilite','messagerie']},
  direction:   {label:'Direction', icon:'🎩', desc:'Accès complet', nav:'all'},
  fondation:   {label:'Fondation', icon:'🏛️', desc:'Accès complet', nav:'all'},
};
const IDLE_TIMEOUT_MS = 10*60*1000; // auto-déconnexion après 10 min d'inactivité

const NOMS = ['Kouassi','Kouamé','Yao','N\'Guessan','Koffi','Bamba','Traoré','Ouattara','Diabaté','Fofana','Coulibaly','Koné','Diarra','Sanogo','Yéo','Assi','Angoran','Kacou','Tanoh','Brou','Zadi','Gnahoré'];
const PRENOMS_G = ['Kouassi','Junior','Emmanuel','David','Samuel','Daniel','Christ','Josué','Franck','Éric','Moussa','Ibrahim','Serge','Aristide','Steve','Grégoire','Élie'];
const PRENOMS_F = ['Aya','Adjoua','Akissi','Grace','Prisca','Rachel','Naomi','Esther','Ruth','Divine','Aïcha','Fatim','Marie','Chantal','Affoué','Amenan','Nafissatou','Clarisse'];
const MOTIFS_ABSENCE = ['Maladie','Rendez-vous médical','Voyage familial','Problème de transport','Non justifié'];

/* ---------------------------------------------------------------------
   1. UTILITAIRES
   --------------------------------------------------------------------- */
const $  = (sel, root=document) => root.querySelector(sel);
const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));

function uid(){ return Math.random().toString(36).slice(2,9); }
function pick(arr){ return arr[Math.floor(Math.random()*arr.length)]; }
function randInt(min,max){ return Math.floor(Math.random()*(max-min+1))+min; }
function pad(n){ return String(n).padStart(2,'0'); }
function toISO(d){ return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; }
function todayISO(){ return toISO(new Date()); }

function fmtDate(iso){
  if(!iso) return '—';
  const [y,m,d] = iso.split('-');
  return `${d}/${m}/${y}`;
}
function fmtFCFA(n){
  return Math.round(n||0).toLocaleString('fr-FR') + ' ' + DEVISE;
}
function moisLabel(moisISO){
  const [y,m] = moisISO.split('-');
  const noms = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
  return `${noms[parseInt(m)-1]} ${y}`;
}
function thisMonthISO(){ const d=new Date(); return `${d.getFullYear()}-${pad(d.getMonth()+1)}`; }
function lastNMonths(n){
  const out = [];
  const d = new Date();
  d.setDate(1);
  for(let i=0;i<n;i++){
    out.push(`${d.getFullYear()}-${pad(d.getMonth()+1)}`);
    d.setMonth(d.getMonth()-1);
  }
  return out.reverse();
}
function nowTime(){ const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; }

/* --- Messages automatiques (composition pure, sans dépendance à DB) --- */
function composeMsgAbsenceEleve(nomEcole, eleveNomComplet, classeNom, date, motif){
  return `Bonjour, nous vous informons que ${eleveNomComplet} (${classeNom}) est ABSENT(E) de l'école ce ${fmtDate(date)}${motif?` (motif signalé : ${motif})`:''}. Merci de contacter l'établissement pour toute justification. — ${nomEcole}`;
}
function composeMsgEnseignant(nomEcole, ensNomComplet, date, statut, motif){
  const label = statut==='Absent' ? 'ABSENT(E)' : 'EN RETARD';
  return `Information Direction : l'enseignant(e) ${ensNomComplet} est ${label} ce ${fmtDate(date)}${motif?` (motif : ${motif})`:''}. — ${nomEcole}`;
}
function ageFromISO(iso){
  if(!iso) return '—';
  const b = new Date(iso), n = new Date();
  let age = n.getFullYear()-b.getFullYear();
  const md = n.getMonth()-b.getMonth();
  if(md<0 || (md===0 && n.getDate()<b.getDate())) age--;
  return age;
}
function escapeHtml(str){
  return String(str ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function initials(prenom,nom){
  return ((prenom?.[0]||'') + (nom?.[0]||'')).toUpperCase();
}
function lastNWeekdays(n){
  const out = [];
  let d = new Date();
  while(out.length < n){
    const day = d.getDay();
    if(day !== 0 && day !== 6) out.push(toISO(d));
    d.setDate(d.getDate()-1);
  }
  return out.reverse();
}
function weekdayFR(iso){
  const idx = new Date(iso+'T00:00:00').getDay(); // 0=dim
  const map = {1:'Lundi',2:'Mardi',3:'Mercredi',4:'Jeudi',5:'Vendredi',6:'Samedi',0:'Dimanche'};
  return map[idx];
}

function toast(msg){
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(()=>t.classList.remove('show'), 2200);
}

function openModal(title, bodyHtml){
  $('#modalTitle').textContent = title;
  $('#modalBody').innerHTML = bodyHtml;
  $('#modalBackdrop').classList.add('open');
}
function closeModal(){
  $('#modalBackdrop').classList.remove('open');
  $('#modalBody').innerHTML = '';
}
$('#modalClose').addEventListener('click', closeModal);
$('#modalBackdrop').addEventListener('click', e=>{ if(e.target.id==='modalBackdrop') closeModal(); });

function classeName(id){ const c = DB.classes.find(c=>c.id===id); return c ? c.nom : '—'; }
function classeCycle(id){ const c = DB.classes.find(c=>c.id===id); return c ? c.cycle : 'Primaire'; }
function eleveById(id){ return DB.eleves.find(e=>e.id===id); }
function enseignantById(id){ return DB.enseignants.find(e=>e.id===id); }
function eleveFullName(e){ return `${e.prenom} ${e.nom}`; }
function ensFullName(e){ return e ? `${e.prenom} ${e.nom}` : '—'; }

function moyenneClass(avg){
  if(avg>=16) return 'good';
  if(avg>=10) return 'mid';
  return 'low';
}
function mentionFromAvg(avg){
  if(avg>=16) return 'Excellent';
  if(avg>=14) return 'Très Bien';
  if(avg>=12) return 'Bien';
  if(avg>=10) return 'Passable';
  return 'Insuffisant';
}

/* ---------------------------------------------------------------------
   2. BASE DE DONNÉES — chargée depuis Supabase (voir supabase-client.js)
   --------------------------------------------------------------------- */
let DB = null;

function applyBranding(){
  const m = DB.meta;
  document.title = `${m.nomEcole} — Gestion Scolaire`;
  $('#brandSchoolName').textContent = m.nomEcole;
  $('#anneeScolaire').textContent = m.anneeScolaire;
  $('#topbarPill').textContent = `Année scolaire ${m.anneeScolaire}`;
  const img = $('#brandLogoImg'), ph = $('#brandLogoEmoji');
  if(m.logo){
    img.src = m.logo; img.style.display = 'block'; ph.style.display = 'none';
    $('#favicon').href = m.logo;
  } else {
    img.style.display = 'none'; ph.style.display = 'block';
    $('#favicon').href = 'data:,';
  }
}

function buildSeed(existingMeta){
  const niveaux = existingMeta?.niveaux?.length ? existingMeta.niveaux : ['prescolaire','primaire'];
  const db = {
    meta: existingMeta ? {...existingMeta, niveaux} : {
      nomEcole: 'Groupe Scolaire Les Petits Génies',
      adresse: 'Cocody Angré, Abidjan',
      telephone: '+225 07 00 00 00 00',
      anneeScolaire: '2025-2026',
      directeurNom: 'Kouassi Jean-Baptiste',
      fondateurNom: "Aya Marie-Claire N'Guessan",
      logo: '',
      loyerMensuel: 500000,
      niveaux,
      heureArriveeAttendue: '07:30',
    },
    classes: classesForNiveaux(niveaux).map(c => ({...c, titulaireId:null})),
    eleves: [],
    enseignants: [],
    notes: [],
    presencesEleves: [],
    presencesEnseignants: [],
    emploiTemps: [],
    programmes: [],
    bulletinsComments: {},
    fraisScolarite: {...FRAIS_SCOLARITE_DEFAUT},
    paiementsScolarite: [],
    activites: [],
    inscriptionsActivites: [],
    paiementsCotisations: [],
    gadgets: [],
    ventesGadgets: [],
    personnelAutre: [],
    paiementsSalaires: [],
    depenses: [],
    messages: [],
    alertesPointage: [],
    echeancesScolarite: [],
    profiles: [],
  };

  /* --- Enseignants : un titulaire par classe + 2 spécialistes --- */
  let matricule = 1;
  db.classes.forEach(c=>{
    const g = Math.random()<0.5;
    const t = {
      id: uid(),
      matricule: `ENS-${String(matricule++).padStart(3,'0')}`,
      nom: pick(NOMS),
      prenom: pick(g?PRENOMS_G:PRENOMS_F),
      sexe: g?'M':'F',
      telephone: `07 ${randInt(10,99)} ${randInt(10,99)} ${randInt(10,99)} ${randInt(10,99)}`,
      email: '',
      classesAssignees: [c.id],
      matieres: MATIERES_BY_CYCLE[c.cycle].slice(0, c.cycle==='Primaire'?5:MATIERES_BY_CYCLE[c.cycle].length),
      dateEmbauche: toISO(new Date(2015+randInt(0,9), randInt(0,11), randInt(1,28))),
      statut: 'Actif',
      salaireMensuel: randInt(70,110)*1000,
    };
    t.email = `${t.prenom}.${t.nom}`.toLowerCase().replace(/[^a-z.]/g,'') + '@ecole.ci';
    db.enseignants.push(t);
    c.titulaireId = t.id;
  });
  const ensAnglaisEPS = ['Anglais','EPS'].map(mat=>{
    const g = Math.random()<0.5;
    const t = {
      id: uid(),
      matricule: `ENS-${String(matricule++).padStart(3,'0')}`,
      nom: pick(NOMS), prenom: pick(g?PRENOMS_G:PRENOMS_F), sexe:g?'M':'F',
      telephone: `07 ${randInt(10,99)} ${randInt(10,99)} ${randInt(10,99)} ${randInt(10,99)}`,
      email:'', classesAssignees: db.classes.filter(c=>MATIERES_BY_CYCLE[c.cycle].includes(mat)).map(c=>c.id),
      matieres:[mat], dateEmbauche: toISO(new Date(2016+randInt(0,7),randInt(0,11),randInt(1,28))), statut:'Actif',
      salaireMensuel: randInt(75,100)*1000,
    };
    t.email = `${t.prenom}.${t.nom}`.toLowerCase().replace(/[^a-z.]/g,'') + '@ecole.ci';
    db.enseignants.push(t);
    return t;
  });

  /* --- Élèves --- */
  const ageRange = {
    garderie:[2,3], ps:[3,4], ms:[4,5], gs:[5,6], cp1:[6,7], cp2:[7,8], ce1:[8,9], ce2:[9,10], cm1:[10,11], cm2:[11,12],
    sixieme:[11,12], cinquieme:[12,13], quatrieme:[13,14], troisieme:[14,15],
    seconde:[15,16], premiere:[16,17], terminale:[17,18],
    ge1:[18,20], ge2:[19,21], ge3:[20,22], ge4:[21,23], ge5:[22,24],
    fq1:[17,30], fq2:[17,30],
    fp1:[17,30], fp2:[17,30], fp3:[17,30],
    ft1:[17,30], ft2:[17,30], ft3:[17,30],
    l1:[18,22], l2:[19,23], l3:[20,24], m1:[21,26], m2:[22,27],
  };
  let elMat = 1;
  db.classes.forEach(c=>{
    const n = randInt(5,8);
    for(let i=0;i<n;i++){
      const g = Math.random()<0.5;
      const [amin,amax] = ageRange[c.id];
      const age = randInt(amin,amax);
      const birthYear = new Date().getFullYear() - age;
      const eleve = {
        id: uid(),
        matricule: `EL-${String(elMat++).padStart(4,'0')}`,
        nom: pick(NOMS),
        prenom: pick(g?PRENOMS_G:PRENOMS_F),
        sexe: g?'M':'F',
        dateNaissance: toISO(new Date(birthYear, randInt(0,11), randInt(1,28))),
        classeId: c.id,
        parentNom: `${pick(NOMS)} ${pick(Math.random()<0.5?PRENOMS_G:PRENOMS_F)}`,
        parentTel: `0${randInt(1,7)} ${randInt(10,99)} ${randInt(10,99)} ${randInt(10,99)} ${randInt(10,99)}`,
        parentAdresse: pick(['Cocody','Yopougon','Marcory','Treichville','Abobo','Koumassi','Angré','Riviera']) + ', Abidjan',
        dateInscription: toISO(new Date(2025, randInt(7,9), randInt(1,28))),
        statut: 'Actif',
      };
      db.eleves.push(eleve);
    }
  });

  /* --- Notes (Trimestre 1 complet, Trimestre 2 partiel) --- */
  db.eleves.forEach(el=>{
    const cycle = db.classes.find(c=>c.id===el.classeId).cycle;
    const matieres = MATIERES_BY_CYCLE[cycle];
    matieres.forEach(mat=>{
      db.notes.push({id:uid(), eleveId:el.id, matiere:mat, note:randInt(8,20), noteSur:20, trimestre:'Trimestre 1', type:'Devoir', date: toISO(new Date(2025,9,randInt(1,28)))});
      db.notes.push({id:uid(), eleveId:el.id, matiere:mat, note:randInt(8,20), noteSur:20, trimestre:'Trimestre 1', type:'Composition', date: toISO(new Date(2025,10,randInt(1,28)))});
      if(Math.random()<0.5){
        db.notes.push({id:uid(), eleveId:el.id, matiere:mat, note:randInt(8,20), noteSur:20, trimestre:'Trimestre 2', type:'Devoir', date: toISO(new Date(2026,0,randInt(1,28)))});
      }
    });
  });

  /* --- Présences élèves (12 derniers jours ouvrés) --- */
  const days = lastNWeekdays(12);
  days.forEach(date=>{
    db.eleves.forEach(el=>{
      const r = Math.random();
      const statut = r<0.88 ? 'Présent' : (r<0.96 ? 'Absent' : 'Retard');
      db.presencesEleves.push({id:uid(), date, classeId:el.classeId, eleveId:el.id, statut, motif: statut==='Présent' ? '' : pick(MOTIFS_ABSENCE)});
    });
  });

  /* --- Présences enseignants (12 derniers jours ouvrés) --- */
  days.forEach(date=>{
    db.enseignants.forEach(t=>{
      const r = Math.random();
      const statut = r<0.94 ? 'Présent' : (r<0.98 ? 'Absent' : 'Retard');
      db.presencesEnseignants.push({id:uid(), date, enseignantId:t.id, statut, motif: statut==='Présent' ? '' : pick(MOTIFS_ABSENCE)});
    });
  });

  /* --- Messages automatiques générés à partir des absences/retards ci-dessus --- */
  const destAdmin = [
    {nom: db.meta.directeurNom || 'Direction', role:'Directeur', tel:''},
    {nom: db.meta.fondateurNom || 'Fondation', role:'Fondateur', tel:''},
  ];
  db.presencesEleves.filter(p=>p.statut==='Absent').forEach(p=>{
    const el = db.eleves.find(x=>x.id===p.eleveId);
    const classe = db.classes.find(c=>c.id===el.classeId);
    const contenu = composeMsgAbsenceEleve(db.meta.nomEcole, `${el.prenom} ${el.nom}`, classe.nom, p.date, p.motif);
    [{nom:el.parentNom, role:'Parent', tel:el.parentTel}, ...destAdmin].forEach(d=>{
      db.messages.push({id:uid(), date:p.date, heure:`${randInt(7,17)}:${pad(randInt(0,59))}`, destinataireNom:d.nom, destinataireRole:d.role, destinataireTel:d.tel, canal:'SMS', type:'Absence élève', contenu, eleveId:el.id, enseignantId:null});
    });
  });
  db.presencesEnseignants.filter(p=>p.statut==='Absent' || p.statut==='Retard').forEach(p=>{
    const t = db.enseignants.find(x=>x.id===p.enseignantId);
    const contenu = composeMsgEnseignant(db.meta.nomEcole, `${t.prenom} ${t.nom}`, p.date, p.statut, p.motif);
    destAdmin.forEach(d=>{
      db.messages.push({id:uid(), date:p.date, heure:`${randInt(7,17)}:${pad(randInt(0,59))}`, destinataireNom:d.nom, destinataireRole:d.role, destinataireTel:d.tel, canal:'SMS', type: p.statut==='Absent'?'Absence enseignant':'Retard enseignant', contenu, eleveId:null, enseignantId:t.id});
    });
  });

  /* --- Emploi du temps --- */
  db.classes.forEach(c=>{
    const periodes = PERIODES_BY_CYCLE[c.cycle];
    const coursSlots = periodes.map((p,i)=>({...p,i})).filter(p=>p.type==='cours');
    const matieres = MATIERES_BY_CYCLE[c.cycle];
    let matIdx = 0;
    JOURS.forEach(jour=>{
      coursSlots.forEach(slot=>{
        let mat = matieres[matIdx % matieres.length]; matIdx++;
        let ensId = c.titulaireId;
        if(mat==='Anglais') ensId = ensAnglaisEPS[0].id;
        if(mat==='EPS') ensId = ensAnglaisEPS[1].id;
        db.emploiTemps.push({id:uid(), classeId:c.id, jour, slotIndex:slot.i, matiere:mat, enseignantId:ensId});
      });
    });
  });

  /* --- Programmes pédagogiques --- */
  db.classes.forEach(c=>{
    const matieres = MATIERES_BY_CYCLE[c.cycle].slice(0,3);
    matieres.forEach(mat=>{
      db.programmes.push({
        id: uid(), enseignantId: c.titulaireId, classeId: c.id, matiere: mat, trimestre:'Trimestre 1',
        contenu: `Progression du programme officiel de ${mat} pour le niveau ${c.nom} — chapitres 1 à 4 : notions de base, exercices d'application et évaluation formative.`,
        progression: randInt(40,100), dateMaj: todayISO(),
      });
    });
  });

  /* --- Comptabilité : scolarité --- */
  db.eleves.forEach(el=>{
    const du = db.fraisScolarite[el.classeId] || 250000;
    const r = Math.random();
    const cible = r<0.4 ? du : (r<0.85 ? Math.round(du*(randInt(20,80)/100)) : 0);
    const tranches = ['Inscription','Tranche 1','Tranche 2','Tranche 3'];
    let reste = cible, idx = 0;
    while(reste>0 && idx<tranches.length){
      const part = Math.min(reste, Math.round(du/4));
      db.paiementsScolarite.push({id:uid(), eleveId:el.id, montant:part, date: toISO(new Date(2025,9+idx,randInt(1,25))), tranche:tranches[idx], modePaiement:pick(MODES_PAIEMENT)});
      reste -= part; idx++;
    }
  });

  /* --- Comptabilité : activités extra-scolaires --- */
  const activitesSeed = [
    {nom:'Football', montantCotisation:15000, periode:'Trimestriel'},
    {nom:'Danse & Rythme', montantCotisation:12000, periode:'Trimestriel'},
    {nom:'Anglais Renforcé', montantCotisation:20000, periode:'Trimestriel'},
    {nom:'Initiation Informatique', montantCotisation:18000, periode:'Trimestriel'},
  ];
  db.activites = activitesSeed.map(a => ({id:uid(), ...a}));
  db.eleves.forEach(el=>{
    if(Math.random()<0.4){
      const chosen = [...db.activites].sort(()=>Math.random()-0.5).slice(0, randInt(1,2));
      chosen.forEach(act=>{
        db.inscriptionsActivites.push({id:uid(), eleveId:el.id, activiteId:act.id, dateInscription: toISO(new Date(2025,9,randInt(1,28)))});
        if(Math.random()<0.7){
          const montant = Math.random()<0.7 ? act.montantCotisation : Math.round(act.montantCotisation/2);
          db.paiementsCotisations.push({id:uid(), eleveId:el.id, activiteId:act.id, montant, date: toISO(new Date(2025,10,randInt(1,28))), modePaiement:pick(MODES_PAIEMENT)});
        }
      });
    }
  });

  /* --- Comptabilité : boutique scolaire (gadgets) --- */
  const gadgetsSeed = [
    {nom:'T-shirt de sport', prixUnitaire:5000, stock:40},
    {nom:'Cahier de texte officiel', prixUnitaire:1500, stock:80},
    {nom:'Casquette brodée', prixUnitaire:3500, stock:25},
    {nom:'Sac à dos logo école', prixUnitaire:12000, stock:15},
    {nom:'Polo brodé logo', prixUnitaire:6000, stock:30},
    {nom:'Porte-clés École', prixUnitaire:1000, stock:60},
  ];
  db.gadgets = gadgetsSeed.map(g => ({id:uid(), ...g}));
  for(let i=0;i<26;i++){
    const gadget = pick(db.gadgets);
    const qte = randInt(1,3);
    const eleve = Math.random()<0.7 ? pick(db.eleves) : null;
    db.ventesGadgets.push({id:uid(), gadgetId:gadget.id, eleveId: eleve?eleve.id:null, quantite:qte, montantTotal: gadget.prixUnitaire*qte, date: toISO(new Date(Date.now()-randInt(0,45)*86400000)), modePaiement:pick(MODES_PAIEMENT)});
    gadget.stock = Math.max(0, gadget.stock - qte);
  }

  /* --- Comptabilité : personnel non-enseignant --- */
  const personnelSeed = [
    {poste:"Gardien(ne)", salaireMensuel:65000},
    {poste:"Agent d'entretien", salaireMensuel:60000},
    {poste:"Cuisinier(ère)", salaireMensuel:70000},
    {poste:'Comptable', salaireMensuel:120000},
    {poste:'Secrétaire', salaireMensuel:90000},
  ];
  db.personnelAutre = personnelSeed.map(p=>{
    const g = Math.random()<0.5;
    return {
      id: uid(), nom: pick(NOMS), prenom: pick(g?PRENOMS_G:PRENOMS_F), sexe: g?'M':'F',
      poste: p.poste, telephone: `0${randInt(1,7)} ${randInt(10,99)} ${randInt(10,99)} ${randInt(10,99)} ${randInt(10,99)}`,
      salaireMensuel: p.salaireMensuel, dateEmbauche: toISO(new Date(2018+randInt(0,6),randInt(0,11),randInt(1,28))), statut:'Actif',
    };
  });

  /* --- Comptabilité : salaires (3 derniers mois) --- */
  const moisRecents = lastNMonths(3);
  const tousPersonnel = [
    ...db.enseignants.map(t => ({id:t.id, type:'enseignant', salaire:t.salaireMensuel})),
    ...db.personnelAutre.map(p => ({id:p.id, type:'autre', salaire:p.salaireMensuel})),
  ];
  moisRecents.forEach((mois, mi)=>{
    const estMoisCourant = mi === moisRecents.length-1;
    tousPersonnel.forEach(p=>{
      const paye = estMoisCourant ? Math.random()<0.55 : true;
      if(paye){
        const [y,m] = mois.split('-').map(Number);
        db.paiementsSalaires.push({id:uid(), personnelId:p.id, personnelType:p.type, mois, montant:p.salaire, datePaiement: toISO(new Date(y,m-1,randInt(25,28))), modePaiement:pick(MODES_PAIEMENT)});
      }
    });
  });

  /* --- Comptabilité : dépenses & charges (loyer inclus) --- */
  moisRecents.forEach(mois=>{
    const [y,m] = mois.split('-').map(Number);
    db.depenses.push({id:uid(), categorie:'Loyer', libelle:`Loyer mensuel — ${moisLabel(mois)}`, montant: db.meta.loyerMensuel, date: toISO(new Date(y,m-1,5)), modePaiement:'Virement bancaire'});
  });
  const depensesSeed = [
    {categorie:'Entretien', libelle:'Réparation plomberie sanitaires'},
    {categorie:'Entretien', libelle:'Peinture salle de classe'},
    {categorie:'Matériel pédagogique', libelle:'Achat de manuels scolaires'},
    {categorie:'Matériel pédagogique', libelle:'Tableaux et craies'},
    {categorie:'Fournitures scolaires', libelle:'Cahiers et fournitures de bureau'},
    {categorie:'Électricité & Eau', libelle:'Facture CIE (électricité)'},
    {categorie:'Électricité & Eau', libelle:'Facture SODECI (eau)'},
    {categorie:'Transport', libelle:'Carburant véhicule scolaire'},
    {categorie:'Restauration', libelle:'Achat vivres cantine'},
    {categorie:'Autre', libelle:'Fournitures de bureau administration'},
  ];
  depensesSeed.forEach(d=>{
    db.depenses.push({id:uid(), categorie:d.categorie, libelle:d.libelle, montant: randInt(15,120)*1000, date: toISO(new Date(Date.now()-randInt(0,150)*86400000)), modePaiement:pick(MODES_PAIEMENT)});
  });

  return db;
}

/* ---------------------------------------------------------------------
   3. NAVIGATION
   --------------------------------------------------------------------- */
const ui = { currentView:'dashboard', eleveProfileId:null, filters:{}, role:null, espaceChoisi:null };

function currentRole(){ return ui.role; }
function hasAccess(view){
  const role = ROLES[ui.role];
  if(!role) return false;
  return role.nav==='all' || role.nav.includes(view);
}
// Un compte enseignant relié à sa fiche personnelle (session.enseignantId) ne
// voit que ses classes assignées. Un compte non relié (générique, ou tout
// autre rôle) voit toutes les classes — inchangé par rapport à avant.
function classesVisibles(){
  if(session.enseignantId){
    const t = enseignantById(session.enseignantId);
    if(t) return DB.classes.filter(c => (t.classesAssignees||[]).includes(c.id));
  }
  return DB.classes;
}

function go(view){
  if(!hasAccess(view)) view = 'dashboard';
  if(ui.currentView === 'pointage-scan' && view !== 'pointage-scan' && typeof arreterScanPointage === 'function') arreterScanPointage();
  if(view!==('eleves')) ui.eleveProfileId = null;
  $$('.nav-item').forEach(b=>b.classList.toggle('active', b.dataset.view===view));
  $('#viewTitle').textContent = VIEW_TITLES[view] || '';
  ui.currentView = view;
  renderView(view);
  $('#sidebar').classList.remove('open');
  $('#sidebarBackdrop').classList.remove('open');
  window.scrollTo(0,0);
}

function renderView(view){
  const map = {
    dashboard: renderDashboard,
    eleves: renderEleves,
    notes: renderNotes,
    'presences-eleves': renderPresencesEleves,
    'emploi-temps': renderEmploiTemps,
    enseignants: renderEnseignants,
    'presences-enseignants': renderPresencesEnseignants,
    'pointage-scan': renderPointageScan,
    programmes: renderProgrammes,
    comptabilite: renderComptabilite,
    messagerie: renderMessagerie,
    parametres: renderParametres,
  };
  $('#viewContainer').innerHTML = (map[view] || renderDashboard)();
}

$$('.nav-item').forEach(btn => btn.addEventListener('click', () => go(btn.dataset.view)));
/* ---------------------------------------------------------------------
   Installation de l'application (PWA) — bouton visible directement dans
   l'appli, plus fiable que d'expliquer où chercher dans les menus du
   navigateur. Ne s'affiche que quand Chrome/Edge confirment que l'appli
   est réellement installable (l'événement ne se déclenche pas sinon).
   --------------------------------------------------------------------- */
let deferredInstallPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  const btn = $('#btnInstallApp');
  if(btn) btn.style.display = '';
});
window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
  const btn = $('#btnInstallApp');
  if(btn) btn.style.display = 'none';
});
$('#btnInstallApp').addEventListener('click', async () => {
  if(!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  $('#btnInstallApp').style.display = 'none';
});

$('#burger').addEventListener('click', () => {
  $('#sidebar').classList.toggle('open');
  $('#sidebarBackdrop').classList.toggle('open');
});
$('#sidebarBackdrop').addEventListener('click', () => {
  $('#sidebar').classList.remove('open');
  $('#sidebarBackdrop').classList.remove('open');
});
/* ---------------------------------------------------------------------
   3.1 ACCÈS / INTERFACES PAR RÔLE — authentification réelle (Supabase Auth)
   --------------------------------------------------------------------- */
function applyRoleVisibility(){
  $$('#nav [data-roles]').forEach(el=>{
    const allowed = el.dataset.roles.split(' ').includes(ui.role);
    el.style.display = allowed ? '' : 'none';
  });
  $$('#sidebar .btn-reset[data-roles]').forEach(el=>{
    const allowed = el.dataset.roles.split(' ').includes(ui.role);
    el.style.display = allowed ? '' : 'none';
  });
  const r = ROLES[ui.role];
  $('#roleBadge').innerHTML = r ? `${r.icon} ${r.label}` : '—';
}

const ESPACES_DEF = [
  { key:'enseignant',  ic:'👩‍🏫' },
  { key:'secretariat', ic:'🗂️' },
  { key:'direction',   ic:'🎩' },
  { key:'fondation',   ic:'🏛️' },
];
function langSwitcherHtml(){
  return `<div class="lang-switch">${LANGUES_DISPONIBLES.map(l=>`
    <button type="button" class="${l.code===langCourante?'active':''}" onclick="changerLangue('${l.code}')">${l.code.toUpperCase()}</button>
  `).join('')}</div>`;
}
function renderLoginGate(step, error, loading){
  step = step || 'espaces';
  if(step === 'espaces'){
    return `
    <div class="login-card">
      ${langSwitcherHtml()}
      <div class="login-logo">🎓</div>
      <h1>${t('app_name')}</h1>
      <div class="sub">${t('espaces_sub')}</div>
      <div class="role-grid">
        ${ESPACES_DEF.map(e=>`
          <div class="role-card" onclick="chooseEspace('${e.key}')">
            <div class="ric">${e.ic}</div>
            <div class="rlabel">${t('espace_'+e.key+'_label')}</div>
            <div class="rdesc">${t('espace_'+e.key+'_desc')}</div>
          </div>`).join('')}
      </div>
    </div>`;
  }
  if(step === 'forgot'){
    return `
    <div class="login-card">
      <div class="login-logo">🔑</div>
      <h1>${t('forgot_title')}</h1>
      <div class="sub">${t('forgot_sub')}</div>
      <form class="pin-pad" onsubmit="return handleForgotSubmit(event)">
        <div class="field" style="text-align:left;margin-bottom:10px;">
          <label>${t('label_email')}</label>
          <input type="email" id="forgotEmail" required autofocus>
        </div>
        <div class="pin-error">${error?escapeHtml(error):''}</div>
        <button class="btn" type="submit" style="width:100%;margin-top:10px;" ${loading?'disabled':''}>${loading?t('btn_send_link_loading'):t('btn_send_link')}</button>
        <button type="button" class="pin-back" onclick="showLoginGate()">${t('btn_back_to_login')}</button>
      </form>
    </div>`;
  }
  if(step === 'forgot-sent'){
    return `
    <div class="login-card">
      <div class="login-logo">📧</div>
      <h1>${t('sent_title')}</h1>
      <div class="sub">${t('sent_sub')}</div>
      <button type="button" class="btn" style="width:100%;margin-top:14px;" onclick="showLoginGate()">${t('btn_back_to_login_plain')}</button>
    </div>`;
  }
  if(step === 'reset'){
    return `
    <div class="login-card">
      <div class="login-logo">🔑</div>
      <h1>${t('reset_title')}</h1>
      <div class="sub">${t('reset_sub')}</div>
      <form class="pin-pad" onsubmit="return handleResetSubmit(event)">
        <div class="field" style="text-align:left;margin-bottom:10px;">
          <label>${t('label_new_password')}</label>
          <input type="password" id="resetPassword1" required minlength="6" autofocus autocomplete="new-password">
        </div>
        <div class="field" style="text-align:left;">
          <label>${t('label_confirm_password')}</label>
          <input type="password" id="resetPassword2" required minlength="6" autocomplete="new-password">
        </div>
        <div class="pin-error">${error?escapeHtml(error):''}</div>
        <button class="btn" type="submit" style="width:100%;margin-top:10px;" ${loading?'disabled':''}>${loading?t('btn_save_password_loading'):t('btn_save_password')}</button>
      </form>
    </div>`;
  }
  const espace = ESPACES_DEF.find(e=>e.key===ui.espaceChoisi);
  return `
    <div class="login-card">
      <div class="login-logo">${espace ? espace.ic : '🎓'}</div>
      <h1>${espace ? t('login_espace_prefix') + t('espace_'+espace.key+'_label') : t('app_name')}</h1>
      <div class="sub">${t('login_sub')}</div>
      <form class="pin-pad" onsubmit="return handleLoginSubmit(event)">
        <div class="field" style="text-align:left;margin-bottom:10px;">
          <label>${t('label_email')}</label>
          <input type="email" id="loginEmail" required autocomplete="username" autofocus>
        </div>
        <div class="field" style="text-align:left;">
          <label>${t('label_password')}</label>
          <input type="password" id="loginPassword" required autocomplete="current-password">
        </div>
        <div class="pin-error">${error ? escapeHtml(error) : ''}</div>
        <button class="btn" type="submit" style="width:100%;margin-top:14px;" ${loading?'disabled':''}>${loading?t('btn_login_loading'):t('btn_login')}</button>
        <button type="button" class="pin-back" onclick="showForgotPassword()">${t('btn_forgot')}</button>
        <button type="button" class="pin-back" onclick="showEspaces()">${t('btn_change_espace')}</button>
      </form>
    </div>`;
}
function showEspaces(){
  stopIdleWatcher();
  $('#appRoot').style.display = 'none';
  $('#loginGate').classList.add('open');
  $('#loginGate').innerHTML = renderLoginGate('espaces');
}
function chooseEspace(key){
  ui.espaceChoisi = key;
  showLoginGate();
}
function showLoginGate(error){
  stopIdleWatcher();
  $('#appRoot').style.display = 'none';
  $('#loginGate').classList.add('open');
  $('#loginGate').innerHTML = renderLoginGate('login', error);
}
function showForgotPassword(){
  $('#loginGate').innerHTML = renderLoginGate('forgot');
}
function showResetPassword(){
  stopIdleWatcher();
  $('#appRoot').style.display = 'none';
  $('#loginGate').classList.add('open');
  $('#loginGate').innerHTML = renderLoginGate('reset');
}
async function handleForgotSubmit(ev){
  ev.preventDefault();
  const email = $('#forgotEmail').value.trim();
  $('#loginGate').innerHTML = renderLoginGate('forgot', '', true);
  const res = await demanderReinitialisationMotDePasse(email);
  if(!res.ok){ $('#loginGate').innerHTML = renderLoginGate('forgot', res.message); return false; }
  $('#loginGate').innerHTML = renderLoginGate('forgot-sent');
  return false;
}
async function handleResetSubmit(ev){
  ev.preventDefault();
  const p1 = $('#resetPassword1').value, p2 = $('#resetPassword2').value;
  if(p1 !== p2){ $('#loginGate').innerHTML = renderLoginGate('reset', 'Les deux mots de passe ne correspondent pas.'); return false; }
  if(p1.length < 6){ $('#loginGate').innerHTML = renderLoginGate('reset', 'Le mot de passe doit contenir au moins 6 caractères.'); return false; }
  $('#loginGate').innerHTML = renderLoginGate('reset', '', true);
  const res = await definirNouveauMotDePasse(p1);
  if(!res.ok){ $('#loginGate').innerHTML = renderLoginGate('reset', res.message); return false; }
  toast('Mot de passe mis à jour');
  const profil = await chargerProfilCourant();
  if(profil){
    try{ await entrerSelonRole(); return false; }catch(e){ /* retombe sur l'écran de connexion */ }
  }
  showLoginGate();
  return false;
}
async function handleLoginSubmit(ev){
  ev.preventDefault();
  const email = $('#loginEmail').value.trim();
  const password = $('#loginPassword').value;
  $('#loginGate').innerHTML = renderLoginGate('login', '', true);
  const res = await connexion(email, password);
  if(!res.ok){ showLoginGate(res.message); return false; }
  try{
    await entrerSelonRole();
  }catch(e){
    showLoginGate(e.suspendu ? e.message : "Connexion réussie mais impossible de charger les données. Réessayez.");
    return false;
  }
  return false;
}
function enterApp(){
  $('#loginGate').classList.remove('open');
  $('#appRoot').style.display = '';
  $('#sidebar').style.display = '';
  applyBranding();
  applyRoleVisibility();
  go('dashboard');
  startIdleWatcher();
  majBanniereHorsLigne();
  synchroniserFileAttente();
}

/* ---------------------------------------------------------------------
   Bannière hors ligne / synchronisation — reflète l'état réel de la
   connexion et de la file d'attente (voir supabase-client.js).
   --------------------------------------------------------------------- */
function majBanniereHorsLigne(){
  const el = $('#offlineBanner');
  if(!el) return;
  if(navigator.onLine === false || DB?.meta?.horsLigne){
    el.hidden = false;
    el.className = 'offline-banner mode-hors-ligne';
    el.textContent = t('banner_offline');
  } else if(compteurFileAttente > 0){
    el.hidden = false;
    el.className = 'offline-banner mode-synchro';
    el.textContent = t('banner_syncing', { n: compteurFileAttente });
  } else {
    el.hidden = true;
  }
}
function onFileAttenteChange(n){
  compteurFileAttente = n;
  majBanniereHorsLigne();
  if(n === 0 && DB?.meta?.horsLigne === true){
    // La file d'attente vient d'être vidée : on recharge les données
    // fraîches depuis le serveur pour sortir proprement du mode hors ligne.
    chargerDB().then(db => { DB = db; majBanniereHorsLigne(); renderView(ui.currentView); }).catch(()=>{});
  }
}
window.addEventListener('online', majBanniereHorsLigne);
window.addEventListener('offline', majBanniereHorsLigne);
// Le rôle "développeur" n'est rattaché à aucune école (ecole_id null) — il
// n'a pas accès à l'application cliente normale, seulement à sa propre
// console de gestion des écoles clientes.
async function entrerSelonRole(){
  ui.role = session.role;
  // Ce compte est un compte technique de la console développeur — il n'a
  // aucune fonction sur le site client (application volontairement
  // distincte, voir EcoMaZ-dev-console) et ne doit jamais s'y connecter.
  if(session.role === 'developpeur'){
    await deconnexion();
    ui.role = null;
    const err = new Error("Ce compte est un compte technique : connectez-vous sur la console développeur, pas ici.");
    err.suspendu = true;
    throw err;
  }
  DB = await chargerDB();
  if(DB.meta.actif === false){
    await deconnexion();
    ui.role = null; DB = null;
    const err = new Error("Cet établissement a été suspendu. Contactez l'administrateur.");
    err.suspendu = true;
    throw err;
  }
  enterApp();
}
async function logoutRole(){
  stopIdleWatcher();
  if(typeof arreterScanPointage === 'function') arreterScanPointage();
  await deconnexion();
  ui.role = null;
  ui.espaceChoisi = null;
  DB = null;
  showEspaces();
}
$('#btnSwitchRole').addEventListener('click', logoutRole);

/* --- Auto-verrouillage par inactivité --- */
let idleTimer = null;
function resetIdleTimer(){
  clearTimeout(idleTimer);
  idleTimer = setTimeout(()=>{
    toast('Session verrouillée pour inactivité');
    logoutRole();
  }, IDLE_TIMEOUT_MS);
}
function startIdleWatcher(){
  ['mousemove','mousedown','keydown','touchstart','scroll'].forEach(ev=>document.addEventListener(ev, resetIdleTimer));
  resetIdleTimer();
}
function stopIdleWatcher(){
  clearTimeout(idleTimer);
  ['mousemove','mousedown','keydown','touchstart','scroll'].forEach(ev=>document.removeEventListener(ev, resetIdleTimer));
}

async function clearEcoleData(){
  if(!confirm("Vider toutes les données opérationnelles (élèves, enseignants, pédagogie ET comptabilité) pour configurer une nouvelle école cliente ?\n\nLes informations de l'établissement déjà renseignées (nom, logo, directeur, fondateur) seront conservées.\n\nCette action supprime définitivement ces données de la base.")) return;
  const tables = ['messages','depenses','paiements_salaires','personnel_autre','ventes_gadgets',
    'gadgets','paiements_cotisations','inscriptions_activites','activites','paiements_scolarite',
    'bulletins_commentaires','programmes','emploi_temps','alertes_pointage','presences_enseignants','presences_eleves',
    'notes','eleves','enseignants','classes'];
  try{
    for(const t of tables){ await sb.from(t).delete().eq('ecole_id', session.ecoleId); }
    await sb.from('ecoles').update({ niveaux: [] }).eq('id', session.ecoleId); // les classes ayant été supprimées, on libère les niveaux pour pouvoir les recréer
    DB = await chargerDB();
    toast('Données vidées — application prête pour une nouvelle école');
    renderView(ui.currentView);
  }catch(e){
    alert('Erreur lors de la suppression : ' + e.message);
  }
}

/* ---------------------------------------------------------------------
   4. TABLEAU DE BORD
   --------------------------------------------------------------------- */
function renderDashboard(){
  const today = todayISO();
  const totalEleves = DB.eleves.filter(e=>e.statut==='Actif').length;
  const totalEns = DB.enseignants.filter(e=>e.statut==='Actif').length;

  const presToday = DB.presencesEleves.filter(p=>p.date===today);
  const tauxEleves = presToday.length ? Math.round(100*presToday.filter(p=>p.statut==='Présent').length/presToday.length) : null;

  const presEnsToday = DB.presencesEnseignants.filter(p=>p.date===today);
  const tauxEns = presEnsToday.length ? Math.round(100*presEnsToday.filter(p=>p.statut==='Présent').length/presEnsToday.length) : null;

  const maxEffectif = Math.max(...DB.classes.map(c=>DB.eleves.filter(e=>e.classeId===c.id && e.statut==='Actif').length), 1);

  const barsHtml = DB.classes.map(c=>{
    const n = DB.eleves.filter(e=>e.classeId===c.id && e.statut==='Actif').length;
    const pct = Math.round(100*n/maxEffectif);
    return `<div style="display:flex;align-items:center;gap:10px;margin-bottom:9px;">
      <div style="width:110px;font-size:12px;color:var(--text-dim);flex-shrink:0;">${c.nom}</div>
      <div class="progress" style="flex:1;"><div style="width:${pct}%;background:var(--primary);"></div></div>
      <div style="width:26px;text-align:right;font-size:12px;font-weight:700;">${n}</div>
    </div>`;
  }).join('');

  const ensAbsents = presEnsToday.filter(p=>p.statut!=='Présent').map(p=>{
    const t = enseignantById(p.enseignantId);
    return `<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border);font-size:12.5px;">
      <span>${escapeHtml(ensFullName(t))}</span>
      <span class="badge ${p.statut==='Absent'?'red':'amber'}">${p.statut}</span>
    </div>`;
  }).join('') || `<div class="hint">Aucune absence enseignant enregistrée aujourd'hui.</div>`;

  const elAbsentsCount = presToday.filter(p=>p.statut==='Absent').length;
  const elRetardCount = presToday.filter(p=>p.statut==='Retard').length;

  const classesRows = DB.classes.map(c=>{
    const eff = DB.eleves.filter(e=>e.classeId===c.id && e.statut==='Actif').length;
    const pres = DB.presencesEleves.filter(p=>p.classeId===c.id && p.date===today);
    const taux = pres.length ? Math.round(100*pres.filter(p=>p.statut==='Présent').length/pres.length) : null;
    const tit = enseignantById(c.titulaireId);
    return `<tr>
      <td><strong>${c.nom}</strong></td>
      <td><span class="badge gray">${c.cycle}</span></td>
      <td>${eff}</td>
      <td>${escapeHtml(ensFullName(tit))}</td>
      <td>${taux===null ? '<span class="hint">—</span>' : `<span class="badge ${taux>=90?'green':taux>=75?'amber':'red'}">${taux}%</span>`}</td>
    </tr>`;
  }).join('');

  return `
  <div class="view active">
    <div class="cards">
      <div class="card">
        <div class="card-top"><div class="icon-badge" style="background:var(--primary-dim);">🧒</div></div>
        <div class="num">${totalEleves}</div>
        <div class="label">Élèves inscrits (actifs)</div>
      </div>
      <div class="card">
        <div class="card-top"><div class="icon-badge" style="background:var(--purple-bg);">👩‍🏫</div></div>
        <div class="num">${totalEns}</div>
        <div class="label">Enseignants actifs</div>
      </div>
      <div class="card">
        <div class="card-top"><div class="icon-badge" style="background:var(--green-bg);">✅</div></div>
        <div class="num">${tauxEleves===null?'—':tauxEleves+'%'}</div>
        <div class="label">Présence élèves aujourd'hui</div>
      </div>
      <div class="card">
        <div class="card-top"><div class="icon-badge" style="background:var(--blue-bg);">🕘</div></div>
        <div class="num">${tauxEns===null?'—':tauxEns+'%'}</div>
        <div class="label">Présence enseignants aujourd'hui</div>
      </div>
    </div>

    <div class="grid-2">
      <div class="panel">
        <div class="panel-head"><div><h2>Répartition des élèves par classe</h2><div class="sub">Effectifs actifs par niveau</div></div></div>
        ${barsHtml}
      </div>
      <div class="panel">
        <div class="panel-head"><div><h2>Alertes du jour</h2><div class="sub">${fmtDate(today)}</div></div></div>
        <div style="display:flex;gap:10px;margin-bottom:14px;">
          <div class="badge red" style="font-size:12px;padding:6px 10px;">${elAbsentsCount} élève(s) absent(s)</div>
          <div class="badge amber" style="font-size:12px;padding:6px 10px;">${elRetardCount} retard(s)</div>
        </div>
        <div class="sub" style="margin-bottom:6px;font-weight:700;">Enseignants absents</div>
        ${ensAbsents}
      </div>
    </div>

    <div class="panel">
      <div class="panel-head"><div><h2>Vue d'ensemble par classe</h2><div class="sub">Effectif, titulaire et présence du jour</div></div></div>
      <div class="table-wrap"><table>
        <thead><tr><th>Classe</th><th>Cycle</th><th>Effectif</th><th>Titulaire</th><th>Présence aujourd'hui</th></tr></thead>
        <tbody>${classesRows}</tbody>
      </table></div>
    </div>
  </div>`;
}

/* ---------------------------------------------------------------------
   5. ÉLÈVES
   --------------------------------------------------------------------- */
function renderEleves(){
  if(ui.eleveProfileId) return renderEleveProfile(ui.eleveProfileId);
  return renderEleveListe();
}

function toggleEleveNiveau(key){
  const f = ui.filters.eleves;
  f.collapsed = f.collapsed || {};
  f.collapsed[key] = !f.collapsed[key];
  renderView('eleves');
}

function renderEleveListe(){
  const f = ui.filters.eleves || {q:'', statut:'', collapsed:{}};
  f.collapsed = f.collapsed || {};
  ui.filters.eleves = f;

  const filtreActif = !!(f.q || f.statut);

  function filtreEleves(eleves){
    let list = eleves.slice();
    if(f.statut) list = list.filter(e=>e.statut===f.statut);
    if(f.q){
      const q = f.q.toLowerCase();
      list = list.filter(e => `${e.nom} ${e.prenom} ${e.matricule}`.toLowerCase().includes(q));
    }
    list.sort((a,b)=> a.nom.localeCompare(b.nom));
    return list;
  }

  function rowsHtml(list){
    return list.map(e=>`
      <tr>
        <td><div class="row-name"><span class="avatar">${initials(e.prenom,e.nom)}</span>${escapeHtml(eleveFullName(e))}</div></td>
        <td>${escapeHtml(e.matricule)}</td>
        <td>${e.sexe}</td>
        <td>${ageFromISO(e.dateNaissance)} ans</td>
        <td>${escapeHtml(e.parentNom)}<br><span class="hint">${escapeHtml(e.parentTel)}</span></td>
        <td><span class="badge ${e.statut==='Actif'?'green':e.statut==='Transféré'?'amber':'gray'}">${e.statut}</span></td>
        <td style="white-space:nowrap;">
          <button class="icon-btn" title="Voir le profil" onclick="viewEleveProfile('${e.id}')">👁️</button>
          <button class="icon-btn" title="Modifier" onclick="openEleveForm('${e.id}')">✏️</button>
          <button class="icon-btn danger" title="Supprimer" onclick="deleteEleve('${e.id}')">🗑️</button>
        </td>
      </tr>`).join('');
  }

  let totalAffiche = 0;
  const niveauxBlocs = Object.entries(NIVEAUX_DEF).map(([key,n])=>{
    const classesNiveau = n.classes.filter(c => DB.classes.some(dc=>dc.id===c.id));
    if(classesNiveau.length===0) return '';

    let classesBlocs = classesNiveau.map(c=>{
      const elevesClasse = filtreEleves(DB.eleves.filter(e=>e.classeId===c.id));
      if(filtreActif && elevesClasse.length===0) return '';
      totalAffiche += elevesClasse.length;
      return `
        <div class="panel" style="margin:0 0 12px;box-shadow:none;border:1px solid var(--border);">
          <div class="panel-head" style="padding:12px 14px;">
            <div><h3 style="margin:0;font-size:15px;">${escapeHtml(c.nom)}</h3><div class="sub">${elevesClasse.length} élève(s)</div></div>
          </div>
          ${elevesClasse.length===0 ? `<div class="empty-state" style="padding:16px;"><div class="em-ic">🧒</div>Aucun élève dans cette classe.</div>` : `
          <div class="table-wrap"><table>
            <thead><tr><th>Élève</th><th>Matricule</th><th>Sexe</th><th>Âge</th><th>Parent / Tuteur</th><th>Statut</th><th>Actions</th></tr></thead>
            <tbody>${rowsHtml(elevesClasse)}</tbody>
          </table></div>`}
        </div>`;
    }).join('');

    if(filtreActif && !classesBlocs.trim()) return '';

    const effectifNiveau = classesNiveau.reduce((s,c)=>s + DB.eleves.filter(e=>e.classeId===c.id).length, 0);
    const collapsed = !!f.collapsed[key];

    return `
      <div class="panel" style="margin-bottom:14px;">
        <div class="panel-head" style="cursor:pointer;user-select:none;" onclick="toggleEleveNiveau('${key}')">
          <div><h2>${n.icon} ${n.label}</h2><div class="sub">${n.desc} · ${effectifNiveau} élève(s) · ${classesNiveau.length} classe(s)</div></div>
          <span class="badge blue" style="font-size:16px;">${collapsed ? '▸' : '▾'}</span>
        </div>
        ${collapsed ? '' : `<div style="padding-top:4px;">${classesBlocs}</div>`}
      </div>`;
  }).join('');

  return `
  <div class="view active">
    <div class="panel">
      <div class="panel-head">
        <div><h2>Liste des élèves</h2><div class="sub">${DB.eleves.length} élève(s) au total</div></div>
        <button class="btn" onclick="openEleveForm()">+ Nouvel élève</button>
      </div>
      <div class="filters">
        <input type="text" placeholder="Rechercher nom, prénom, matricule…" value="${escapeHtml(f.q)}" oninput="ui.filters.eleves.q=this.value; renderView('eleves')">
        <select onchange="ui.filters.eleves.statut=this.value; renderView('eleves')">
          <option value="">Tous les statuts</option>
          <option ${f.statut==='Actif'?'selected':''}>Actif</option>
          <option ${f.statut==='Inactif'?'selected':''}>Inactif</option>
          <option ${f.statut==='Transféré'?'selected':''}>Transféré</option>
        </select>
      </div>
    </div>
    ${niveauxBlocs.trim() ? niveauxBlocs : `<div class="panel"><div class="empty-state"><div class="em-ic">🧒</div>Aucun élève ne correspond à ces critères.</div></div>`}
  </div>`;
}

function openEleveForm(id){
  const e = id ? eleveById(id) : null;
  openModal(e ? "Modifier l'élève" : 'Nouvel élève', `
    <form id="formEleve" onsubmit="return handleSaveEleve(event)">
      <input type="hidden" name="id" value="${e?e.id:''}">
      <div class="form-grid">
        <div class="field"><label>Prénom</label><input name="prenom" required value="${e?escapeHtml(e.prenom):''}"></div>
        <div class="field"><label>Nom</label><input name="nom" required value="${e?escapeHtml(e.nom):''}"></div>
        <div class="field"><label>Sexe</label>
          <select name="sexe"><option value="M" ${e?.sexe==='M'?'selected':''}>Masculin</option><option value="F" ${e?.sexe==='F'?'selected':''}>Féminin</option></select>
        </div>
        <div class="field"><label>Date de naissance</label><input type="date" name="dateNaissance" required value="${e?e.dateNaissance:''}"></div>
        <div class="field"><label>Classe</label>
          <select name="classeId">${DB.classes.map(c=>`<option value="${c.id}" ${e?.classeId===c.id?'selected':''}>${c.nom}</option>`).join('')}</select>
        </div>
        <div class="field"><label>Statut</label>
          <select name="statut">
            <option ${e?.statut==='Actif'?'selected':''}>Actif</option>
            <option ${e?.statut==='Inactif'?'selected':''}>Inactif</option>
            <option ${e?.statut==='Transféré'?'selected':''}>Transféré</option>
          </select>
        </div>
        <div class="field"><label>Nom du parent / tuteur</label><input name="parentNom" required value="${e?escapeHtml(e.parentNom):''}"></div>
        <div class="field"><label>Téléphone du parent</label><input name="parentTel" required value="${e?escapeHtml(e.parentTel):''}"></div>
        <div class="field span2"><label>Adresse</label><input name="parentAdresse" value="${e?escapeHtml(e.parentAdresse):''}"></div>
        <div class="field"><label>Date d'inscription</label><input type="date" name="dateInscription" value="${e?e.dateInscription:todayISO()}"></div>
      </div>
      <div class="form-actions">
        <button type="button" class="btn secondary" onclick="closeModal()">Annuler</button>
        <button type="submit" class="btn">Enregistrer</button>
      </div>
    </form>`);
}

async function handleSaveEleve(ev){
  ev.preventDefault();
  const fd = new FormData(ev.target);
  const id = fd.get('id');
  const patch = {
    matricule: (id && eleveById(id)?.matricule) || `EL-${String(DB.eleves.length+1).padStart(4,'0')}`,
    prenom: fd.get('prenom').trim(), nom: fd.get('nom').trim(), sexe: fd.get('sexe'),
    dateNaissance: fd.get('dateNaissance'), classeId: fd.get('classeId'), statut: fd.get('statut'),
    parentNom: fd.get('parentNom').trim(), parentTel: fd.get('parentTel').trim(),
    parentAdresse: fd.get('parentAdresse').trim(), dateInscription: fd.get('dateInscription') || todayISO(),
  };
  try{
    if(id){
      await dbUpdate('eleves', id, patch);
      const idx = DB.eleves.findIndex(e=>e.id===id);
      DB.eleves[idx] = {...DB.eleves[idx], ...patch};
    } else {
      DB.eleves.push(await dbInsert('eleves', patch));
    }
    closeModal(); toast('Élève enregistré');
    renderView('eleves');
  }catch(e){ alert('Erreur : ' + e.message); }
  return false;
}

async function deleteEleve(id){
  const e = eleveById(id);
  if(!confirm(`Supprimer l'élève ${eleveFullName(e)} ? Ses notes et présences seront également supprimées.`)) return;
  try{
    await dbDelete('eleves', id); // ON DELETE CASCADE supprime aussi ses notes/présences côté base
    DB.eleves = DB.eleves.filter(x=>x.id!==id);
    DB.notes = DB.notes.filter(x=>x.eleveId!==id);
    DB.presencesEleves = DB.presencesEleves.filter(x=>x.eleveId!==id);
    toast('Élève supprimé');
    renderView('eleves');
  }catch(e){ alert('Erreur : ' + e.message); }
}

function viewEleveProfile(id){ ui.eleveProfileId = id; renderView('eleves'); }

function renderEleveProfile(id){
  const e = eleveById(id);
  if(!e){ ui.eleveProfileId=null; return renderEleveListe(); }
  const trimestre = ui.filters.bulletinTrimestre || 'Trimestre 1';
  ui.filters.bulletinTrimestre = trimestre;

  const cycle = classeCycle(e.classeId);
  const matieres = MATIERES_BY_CYCLE[cycle];
  let sumMoy = 0, countMat = 0;
  const bulletinRows = matieres.map(mat=>{
    const notes = DB.notes.filter(n=>n.eleveId===id && n.matiere===mat && n.trimestre===trimestre);
    const devoir = notes.find(n=>n.type==='Devoir');
    const compo = notes.find(n=>n.type==='Composition');
    let moy = null;
    if(devoir && compo) moy = (devoir.note + compo.note*2)/3;
    else if(devoir) moy = devoir.note;
    else if(compo) moy = compo.note;
    if(moy!==null){ sumMoy += moy; countMat++; }
    return `<tr>
      <td>${mat}</td>
      <td>${devoir?devoir.note:'—'}</td>
      <td>${compo?compo.note:'—'}</td>
      <td class="bulletin-grade ${moy!==null?moyenneClass(moy):''}">${moy!==null?moy.toFixed(1):'—'}</td>
      <td>${moy!==null?mentionFromAvg(moy):'—'}</td>
    </tr>`;
  }).join('');
  const moyGenerale = countMat ? sumMoy/countMat : null;

  const presences = DB.presencesEleves.filter(p=>p.eleveId===id).sort((a,b)=>b.date.localeCompare(a.date));
  const totalP = presences.length;
  const nbPresent = presences.filter(p=>p.statut==='Présent').length;
  const nbAbsent = presences.filter(p=>p.statut==='Absent').length;
  const nbRetard = presences.filter(p=>p.statut==='Retard').length;
  const tauxPresence = totalP ? Math.round(100*nbPresent/totalP) : null;

  const presRows = presences.slice(0,15).map(p=>`
    <tr><td>${fmtDate(p.date)}</td><td>${weekdayFR(p.date)}</td>
    <td><span class="badge ${p.statut==='Présent'?'green':p.statut==='Absent'?'red':'amber'}">${p.statut}</span></td>
    <td>${escapeHtml(p.motif||'—')}</td></tr>`).join('');

  const commentKey = `${id}_${trimestre}`;
  const comment = DB.bulletinsComments[commentKey] || '';

  return `
  <div class="view active">
    <button class="btn secondary sm no-print" style="margin-bottom:14px;" onclick="ui.eleveProfileId=null; renderView('eleves')">← Retour à la liste</button>

    <div class="panel">
      <div class="profile-head">
        <span class="avatar">${initials(e.prenom,e.nom)}</span>
        <div>
          <h2>${escapeHtml(eleveFullName(e))}</h2>
          <div class="meta">${classeName(e.classeId)} · ${ageFromISO(e.dateNaissance)} ans · Matricule ${escapeHtml(e.matricule)} · <span class="badge ${e.statut==='Actif'?'green':'gray'}">${e.statut}</span></div>
        </div>
      </div>
      <div class="grid-3">
        <div><div class="hint">Parent / Tuteur</div><strong>${escapeHtml(e.parentNom)}</strong></div>
        <div><div class="hint">Téléphone</div><strong>${escapeHtml(e.parentTel)}</strong></div>
        <div><div class="hint">Adresse</div><strong>${escapeHtml(e.parentAdresse||'—')}</strong></div>
        <div><div class="hint">Date de naissance</div><strong>${fmtDate(e.dateNaissance)}</strong></div>
        <div><div class="hint">Date d'inscription</div><strong>${fmtDate(e.dateInscription)}</strong></div>
        <div><div class="hint">Taux de présence global</div><strong>${tauxPresence===null?'—':tauxPresence+'%'}</strong></div>
      </div>
    </div>

    <div class="grid-2">
      <div class="panel">
        <div class="letterhead">
          ${DB.meta.logo ? `<img src="${DB.meta.logo}" alt="Logo">` : `<div class="lh-ph">🎓</div>`}
          <div class="lh-text">
            <strong>${escapeHtml(DB.meta.nomEcole)}</strong>
            <span>${escapeHtml(DB.meta.adresse)}${DB.meta.telephone ? ' · '+escapeHtml(DB.meta.telephone) : ''}</span>
          </div>
          <div class="lh-doc"><strong>Bulletin de notes</strong>${trimestre} · ${DB.meta.anneeScolaire}</div>
        </div>
        <div class="panel-head">
          <div><h2>Bulletin scolaire</h2><div class="sub">Moyennes par matière</div></div>
          <select onchange="ui.filters.bulletinTrimestre=this.value; renderView('eleves')">
            ${TRIMESTRES.map(t=>`<option ${trimestre===t?'selected':''}>${t}</option>`).join('')}
          </select>
        </div>
        <div class="table-wrap"><table>
          <thead><tr><th>Matière</th><th>Devoir</th><th>Composition</th><th>Moyenne</th><th>Appréciation</th></tr></thead>
          <tbody>${bulletinRows}</tbody>
        </table></div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:14px;padding-top:14px;border-top:1px solid var(--border);">
          <div>Moyenne générale : <span class="bulletin-grade ${moyGenerale!==null?moyenneClass(moyGenerale):''}" style="font-size:18px;">${moyGenerale!==null?moyGenerale.toFixed(2):'—'}</span> / 20</div>
          <span class="badge ${moyGenerale===null?'gray':moyenneClass(moyGenerale)==='good'?'green':moyenneClass(moyGenerale)==='mid'?'amber':'red'}">${moyGenerale!==null?mentionFromAvg(moyGenerale):'—'}</span>
        </div>
        <div class="field" style="margin-top:14px;">
          <label>Appréciation générale du titulaire</label>
          <textarea id="commentBulletin">${escapeHtml(comment)}</textarea>
        </div>
        ${(DB.meta.directeurNom || DB.meta.fondateurNom) ? `
        <div class="signatures">
          <div class="sign-box"><div class="sign-role">Le Directeur / La Directrice</div><div class="sign-line">${escapeHtml(DB.meta.directeurNom || '—')}</div></div>
          <div class="sign-box"><div class="sign-role">Le Fondateur / La Fondatrice</div><div class="sign-line">${escapeHtml(DB.meta.fondateurNom || '—')}</div></div>
        </div>` : ''}
        <div class="form-actions">
          <button class="btn secondary sm no-print" onclick="window.print()">🖨️ Imprimer</button>
          <button class="btn sm no-print" onclick="saveBulletinComment('${id}','${trimestre}')">Enregistrer l'appréciation</button>
        </div>
      </div>

      <div class="panel">
        <div class="panel-head"><div><h2>Présences</h2><div class="sub">${totalP} enregistrement(s)</div></div></div>
        <div style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap;">
          <span class="badge green">Présent: ${nbPresent}</span>
          <span class="badge red">Absent: ${nbAbsent}</span>
          <span class="badge amber">Retard: ${nbRetard}</span>
        </div>
        <div class="table-wrap"><table>
          <thead><tr><th>Date</th><th>Jour</th><th>Statut</th><th>Motif</th></tr></thead>
          <tbody>${presRows || '<tr><td colspan="4" class="hint">Aucun enregistrement</td></tr>'}</tbody>
        </table></div>
      </div>
    </div>
  </div>`;
}

async function saveBulletinComment(eleveId, trimestre){
  const val = $('#commentBulletin').value;
  try{
    const { error } = await sb.from('bulletins_commentaires').upsert(
      { eleve_id: eleveId, trimestre, commentaire: val, ecole_id: session.ecoleId },
      { onConflict: 'eleve_id,trimestre' }
    );
    if(error) throw error;
    DB.bulletinsComments[`${eleveId}_${trimestre}`] = val;
    toast('Appréciation enregistrée');
  }catch(e){ alert('Erreur : ' + e.message); }
}

/* ---------------------------------------------------------------------
   6. NOTES & BULLETINS (saisie)
   --------------------------------------------------------------------- */
function renderNotes(){
  const mesClasses = classesVisibles();
  if(mesClasses.length === 0){
    return `<div class="view active"><div class="panel"><div class="empty-state"><div class="em-ic">📝</div>Aucune classe configurée pour le moment. Activez au moins un niveau scolaire dans Paramètres pour commencer à saisir des notes.</div></div></div>`;
  }
  const f = ui.filters.notes || {classeId: mesClasses[0].id, matiere:'', trimestre:'Trimestre 1'};
  if(!mesClasses.some(c=>c.id===f.classeId)) f.classeId = mesClasses[0].id;
  if(!f.matiere) f.matiere = MATIERES_BY_CYCLE[classeCycle(f.classeId)][0];
  ui.filters.notes = f;

  const cycle = classeCycle(f.classeId);
  const matieres = MATIERES_BY_CYCLE[cycle];
  if(!matieres.includes(f.matiere)) f.matiere = matieres[0];

  const eleves = DB.eleves.filter(e=>e.classeId===f.classeId && e.statut==='Actif').sort((a,b)=>a.nom.localeCompare(b.nom));

  const rows = eleves.map(e=>{
    const notes = DB.notes.filter(n=>n.eleveId===e.id && n.matiere===f.matiere && n.trimestre===f.trimestre);
    const devoir = notes.find(n=>n.type==='Devoir');
    const compo = notes.find(n=>n.type==='Composition');
    return `<tr>
      <td><div class="row-name"><span class="avatar">${initials(e.prenom,e.nom)}</span>${escapeHtml(eleveFullName(e))}</div></td>
      <td><input type="number" min="0" max="20" step="0.5" data-eleve="${e.id}" data-type="Devoir" value="${devoir?devoir.note:''}" style="width:70px;padding:6px 8px;border:1px solid var(--border);border-radius:7px;"></td>
      <td><input type="number" min="0" max="20" step="0.5" data-eleve="${e.id}" data-type="Composition" value="${compo?compo.note:''}" style="width:70px;padding:6px 8px;border:1px solid var(--border);border-radius:7px;"></td>
    </tr>`;
  }).join('');

  return `
  <div class="view active">
    <div class="section-note">💡 Sélectionnez une classe, une matière et un trimestre pour saisir les notes de devoir et de composition, puis enregistrez. Consultez le bulletin complet d'un élève depuis sa fiche profil (menu Élèves).</div>

    <div class="panel">
      <div class="panel-head"><div><h2>Saisie des notes</h2><div class="sub">${eleves.length} élève(s)</div></div></div>
      <div class="filters">
        <select onchange="ui.filters.notes.classeId=this.value; ui.filters.notes.matiere=''; renderView('notes')">
          ${mesClasses.map(c=>`<option value="${c.id}" ${f.classeId===c.id?'selected':''}>${c.nom}</option>`).join('')}
        </select>
        <select onchange="ui.filters.notes.matiere=this.value; renderView('notes')">
          ${matieres.map(m=>`<option ${f.matiere===m?'selected':''}>${m}</option>`).join('')}
        </select>
        <select onchange="ui.filters.notes.trimestre=this.value; renderView('notes')">
          ${TRIMESTRES.map(t=>`<option ${f.trimestre===t?'selected':''}>${t}</option>`).join('')}
        </select>
      </div>
      ${eleves.length===0 ? `<div class="empty-state"><div class="em-ic">📝</div>Aucun élève actif dans cette classe.</div>` : `
      <div class="table-wrap"><table id="tableNotes">
        <thead><tr><th>Élève</th><th>Note Devoir /20</th><th>Note Composition /20</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
      <div class="form-actions"><button class="btn" onclick="saveNotesTable()">Enregistrer les notes</button></div>`}
    </div>
  </div>`;
}

async function saveNotesTable(){
  const f = ui.filters.notes;
  const inputs = $$('#tableNotes input');
  try{
    for(const inp of inputs){
      const val = inp.value;
      const eleveId = inp.dataset.eleve, type = inp.dataset.type;
      let n = DB.notes.find(x=>x.eleveId===eleveId && x.matiere===f.matiere && x.trimestre===f.trimestre && x.type===type);
      if(val===''){
        if(n){ await dbDelete('notes', n.id); DB.notes = DB.notes.filter(x=>x.id!==n.id); }
        continue;
      }
      const note = Math.max(0, Math.min(20, parseFloat(val)));
      if(n){ await dbUpdate('notes', n.id, {note}); n.note = note; }
      else{ DB.notes.push(await dbInsert('notes', {eleveId, matiere:f.matiere, note, noteSur:20, trimestre:f.trimestre, type, date: todayISO()})); }
    }
    toast('Notes enregistrées');
  }catch(e){ alert('Erreur : ' + e.message); }
}

/* ---------------------------------------------------------------------
   7. PRÉSENCES ÉLÈVES
   --------------------------------------------------------------------- */
function renderPresencesEleves(){
  const mesClasses = classesVisibles();
  if(mesClasses.length === 0){
    return `<div class="view active"><div class="panel"><div class="empty-state"><div class="em-ic">✅</div>Aucune classe configurée pour le moment. Activez au moins un niveau scolaire dans Paramètres pour commencer à faire l'appel.</div></div></div>`;
  }
  const f = ui.filters.presEleves || {classeId: mesClasses[0].id, date: todayISO()};
  if(!mesClasses.some(c=>c.id===f.classeId)) f.classeId = mesClasses[0].id;
  ui.filters.presEleves = f;

  const eleves = DB.eleves.filter(e=>e.classeId===f.classeId && e.statut==='Actif').sort((a,b)=>a.nom.localeCompare(b.nom));
  const rows = eleves.map(e=>{
    const rec = DB.presencesEleves.find(p=>p.eleveId===e.id && p.date===f.date);
    const statut = rec ? rec.statut : 'Présent';
    return `<tr>
      <td><div class="row-name"><span class="avatar">${initials(e.prenom,e.nom)}</span>${escapeHtml(eleveFullName(e))}</div></td>
      <td>
        <select data-eleve="${e.id}" class="sel-statut">
          <option ${statut==='Présent'?'selected':''}>Présent</option>
          <option ${statut==='Absent'?'selected':''}>Absent</option>
          <option ${statut==='Retard'?'selected':''}>Retard</option>
        </select>
      </td>
      <td><input type="text" data-motif="${e.id}" placeholder="Motif (optionnel)" value="${escapeHtml(rec?rec.motif:'')}" style="width:100%;padding:7px 9px;border:1px solid var(--border);border-radius:7px;"></td>
    </tr>`;
  }).join('');

  const recent = DB.presencesEleves.slice().sort((a,b)=>b.date.localeCompare(a.date)).slice(0,20);
  const recentRows = recent.map(p=>{
    const e = eleveById(p.eleveId);
    if(!e) return '';
    return `<tr><td>${fmtDate(p.date)}</td><td>${escapeHtml(eleveFullName(e))}</td><td><span class="badge blue">${classeName(p.classeId)}</span></td>
      <td><span class="badge ${p.statut==='Présent'?'green':p.statut==='Absent'?'red':'amber'}">${p.statut}</span></td><td>${escapeHtml(p.motif||'—')}</td></tr>`;
  }).join('');

  return `
  <div class="view active">
    <div class="panel">
      <div class="panel-head"><div><h2>Feuille de présence — élèves</h2><div class="sub">Marquer la présence par classe et par date</div></div></div>
      <div class="filters">
        <select onchange="ui.filters.presEleves.classeId=this.value; renderView('presences-eleves')">
          ${mesClasses.map(c=>`<option value="${c.id}" ${f.classeId===c.id?'selected':''}>${c.nom}</option>`).join('')}
        </select>
        <input type="date" value="${f.date}" onchange="ui.filters.presEleves.date=this.value; renderView('presences-eleves')">
      </div>
      ${eleves.length===0 ? `<div class="empty-state"><div class="em-ic">✅</div>Aucun élève actif dans cette classe.</div>` : `
      <div class="table-wrap"><table id="tablePresences">
        <thead><tr><th>Élève</th><th style="width:160px;">Statut</th><th>Motif</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
      <div class="form-actions"><button class="btn" onclick="savePresencesEleves()">Enregistrer la présence</button></div>`}
    </div>

    <div class="panel">
      <div class="panel-head"><div><h2>Historique récent</h2><div class="sub">20 derniers enregistrements</div></div></div>
      <div class="table-wrap"><table>
        <thead><tr><th>Date</th><th>Élève</th><th>Classe</th><th>Statut</th><th>Motif</th></tr></thead>
        <tbody>${recentRows || '<tr><td colspan="5" class="hint">Aucun enregistrement</td></tr>'}</tbody>
      </table></div>
    </div>
  </div>`;
}

async function savePresencesEleves(){
  const f = ui.filters.presEleves;
  let nbNotifs = 0;
  try{
    for(const sel of $$('.sel-statut')){
      const eleveId = sel.dataset.eleve;
      const statut = sel.value;
      const motifInput = $(`[data-motif="${eleveId}"]`);
      const motif = motifInput ? motifInput.value.trim() : '';
      let rec = DB.presencesEleves.find(p=>p.eleveId===eleveId && p.date===f.date);
      const wasAbsent = rec && rec.statut==='Absent';
      if(rec){
        await dbUpdate('presences_eleves', rec.id, {statut, motif});
        rec.statut = statut; rec.motif = motif;
      } else {
        DB.presencesEleves.push(await dbInsert('presences_eleves', {date:f.date, classeId:f.classeId, eleveId, statut, motif}));
      }
      if(statut==='Absent' && !wasAbsent){ await envoyerNotificationAbsenceEleve(eleveId, f.date, motif); nbNotifs += 3; }
    }
    toast(nbNotifs ? `Présence enregistrée · ${nbNotifs} notification(s) envoyée(s) (parent, direction, fondation)` : 'Présence enregistrée');
    renderView('presences-eleves');
  }catch(e){ alert('Erreur : ' + e.message); }
}
// Le numéro de téléphone du parent n'est plus jamais chargé ni manipulé
// dans le navigateur : toute la logique (composition du message, journal
// des destinataires, envoi du SMS réel) tourne côté serveur, dans la
// fonction Edge "notifier-absence-eleve" — voir schema.sql section 22.
// Avant ce correctif, le numéro transitait par DB.eleves (visible dans la
// mémoire du navigateur de tout compte pouvant faire l'appel).
async function envoyerNotificationAbsenceEleve(eleveId, date, motif){
  try{
    const { data, error } = await sb.functions.invoke('notifier-absence-eleve', { body: { eleveId, date, motif } });
    if(error) throw error;
    if(!data?.ok) throw new Error(data?.error || "Échec de la notification");
  }catch(e){
    console.warn('Échec notification absence élève :', e.message);
  }
}

/* ---------------------------------------------------------------------
   8. ENSEIGNANTS
   --------------------------------------------------------------------- */
function renderEnseignants(){
  const list = DB.enseignants.slice().sort((a,b)=>a.nom.localeCompare(b.nom));
  const rows = list.map(t=>{
    const profilLie = (DB.profiles||[]).find(p=>p.enseignantId===t.id);
    return `
    <tr>
      <td><div class="row-name"><span class="avatar">${initials(t.prenom,t.nom)}</span>${escapeHtml(ensFullName(t))}</div></td>
      <td>${escapeHtml(t.matricule)}</td>
      <td>${t.classesAssignees.map(cid=>`<span class="badge blue" style="margin:1px;">${classeName(cid)}</span>`).join(' ')}</td>
      <td>${t.matieres.join(', ')}</td>
      <td>${escapeHtml(t.telephone)}</td>
      <td><span class="badge ${t.statut==='Actif'?'green':'gray'}">${t.statut}</span></td>
      <td>${profilLie ? `<span class="badge green">🔗 Accès personnel</span>` : `<span class="badge gray">Compte partagé</span>`}</td>
      <td style="white-space:nowrap;">
        <button class="icon-btn" title="Modifier" onclick="openEnseignantForm('${t.id}')">✏️</button>
        <button class="icon-btn" title="Accès personnel" onclick="ouvrirAccesPersonnel('${t.id}')">🔗</button>
        <button class="icon-btn danger" title="Supprimer" onclick="deleteEnseignant('${t.id}')">🗑️</button>
      </td>
    </tr>`;
  }).join('');

  return `
  <div class="view active">
    <div class="panel">
      <div class="panel-head">
        <div><h2>Liste des enseignants</h2><div class="sub">${list.length} enseignant(s)</div></div>
        <button class="btn" onclick="openEnseignantForm()">+ Nouvel enseignant</button>
      </div>
      <div class="section-note">🔗 Par défaut, tous les enseignants partagent un seul compte de connexion. Cliquez sur 🔗 pour donner à un enseignant précis son propre accès personnel, limité à ses classes assignées.</div>
      <div class="table-wrap"><table>
        <thead><tr><th>Enseignant</th><th>Matricule</th><th>Classe(s)</th><th>Matière(s)</th><th>Téléphone</th><th>Statut</th><th>Accès</th><th>Actions</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
    </div>
  </div>`;
}

function ouvrirAccesPersonnel(enseignantId){
  const t = enseignantById(enseignantId);
  const profilLie = (DB.profiles||[]).find(p=>p.enseignantId===enseignantId);
  if(profilLie){
    openModal('Accès personnel — ' + ensFullName(t), `
      <div class="section-note">✅ ${escapeHtml(ensFullName(t))} a déjà un accès personnel — ce compte ne voit que ses classes assignées (${t.classesAssignees.map(cid=>classeName(cid)).join(', ') || 'aucune classe assignée'}).</div>
      <div class="hint">Pour retirer cet accès personnel (le compte redevient un compte partagé classique), exécutez dans Supabase SQL Editor :</div>
      <pre style="background:var(--surface-2);padding:12px;border-radius:8px;font-size:11.5px;overflow-x:auto;white-space:pre-wrap;">update profiles set enseignant_id = null where enseignant_id = '${enseignantId}';</pre>
      <div class="form-actions"><button type="button" class="btn secondary" onclick="closeModal()">Fermer</button></div>
    `);
    return;
  }
  openModal('Donner un accès personnel — ' + ensFullName(t), `
    <div class="section-note">📋 Cette opération se fait en 2 étapes, comme pour les autres comptes (Direction, Fondation…) :</div>
    <ol style="padding-left:20px;line-height:1.8;font-size:13px;">
      <li>Supabase Dashboard → <strong>Authentication → Users → Add user</strong> — créez un compte avec l'email et le mot de passe personnels de ${escapeHtml(ensFullName(t))}. Notez l'<strong>UID</strong> généré.</li>
      <li>Dans <strong>SQL Editor</strong>, collez cette requête en remplaçant <code>&lt;UID&gt;</code> par l'UID obtenu :</li>
    </ol>
    <pre style="background:var(--surface-2);padding:12px;border-radius:8px;font-size:11.5px;overflow-x:auto;white-space:pre-wrap;">insert into profiles (id, ecole_id, role, nom_complet, enseignant_id)
values ('&lt;UID&gt;', '${session.ecoleId}', 'enseignant', '${escapeHtml(ensFullName(t)).replace(/'/g,"''")}', '${enseignantId}');</pre>
    <div class="hint">Une fois exécuté, ${escapeHtml(ensFullName(t))} se connectera avec son propre email/mot de passe (espace "Enseignant(e)") et ne verra que ses classes : ${t.classesAssignees.map(cid=>classeName(cid)).join(', ') || 'aucune classe assignée pour le moment — assignez-lui une classe avant de continuer'}.</div>
    <div class="form-actions"><button type="button" class="btn secondary" onclick="closeModal()">Fermer</button></div>
  `);
}

function openEnseignantForm(id){
  const t = id ? enseignantById(id) : null;
  const allMatieres = [...new Set(Object.values(MATIERES_BY_CYCLE).flat())];
  openModal(t ? "Modifier l'enseignant" : 'Nouvel enseignant', `
    <form id="formEns" onsubmit="return handleSaveEnseignant(event)">
      <input type="hidden" name="id" value="${t?t.id:''}">
      <div class="form-grid">
        <div class="field"><label>Prénom</label><input name="prenom" required value="${t?escapeHtml(t.prenom):''}"></div>
        <div class="field"><label>Nom</label><input name="nom" required value="${t?escapeHtml(t.nom):''}"></div>
        <div class="field"><label>Sexe</label>
          <select name="sexe"><option value="M" ${t?.sexe==='M'?'selected':''}>Masculin</option><option value="F" ${t?.sexe==='F'?'selected':''}>Féminin</option></select>
        </div>
        <div class="field"><label>Téléphone</label><input name="telephone" required value="${t?escapeHtml(t.telephone):''}"></div>
        <div class="field span2"><label>Email</label><input type="email" name="email" value="${t?escapeHtml(t.email):''}"></div>
        <div class="field"><label>Date d'embauche</label><input type="date" name="dateEmbauche" value="${t?t.dateEmbauche:todayISO()}"></div>
        <div class="field"><label>Salaire mensuel (${DEVISE})</label><input type="number" name="salaireMensuel" min="0" step="1000" value="${t?t.salaireMensuel||0:75000}"></div>
        <div class="field"><label>Statut</label>
          <select name="statut"><option ${t?.statut==='Actif'?'selected':''}>Actif</option><option ${t?.statut==='Inactif'?'selected':''}>Inactif</option></select>
        </div>
        <div class="field span2"><label>Classes assignées</label>
          <div style="display:flex;flex-wrap:wrap;gap:8px;">
            ${DB.classes.map(c=>`<label style="display:flex;align-items:center;gap:5px;font-size:12.5px;background:var(--surface-2);padding:5px 9px;border-radius:8px;border:1px solid var(--border);">
              <input type="checkbox" name="classes" value="${c.id}" ${t?.classesAssignees.includes(c.id)?'checked':''}> ${c.nom}</label>`).join('')}
          </div>
        </div>
        <div class="field span2"><label>Matières enseignées</label>
          <div style="display:flex;flex-wrap:wrap;gap:8px;">
            ${allMatieres.map(m=>`<label style="display:flex;align-items:center;gap:5px;font-size:12.5px;background:var(--surface-2);padding:5px 9px;border-radius:8px;border:1px solid var(--border);">
              <input type="checkbox" name="matieres" value="${m}" ${t?.matieres.includes(m)?'checked':''}> ${m}</label>`).join('')}
          </div>
        </div>
      </div>
      <div class="form-actions">
        <button type="button" class="btn secondary" onclick="closeModal()">Annuler</button>
        <button type="submit" class="btn">Enregistrer</button>
      </div>
    </form>`);
}

async function handleSaveEnseignant(ev){
  ev.preventDefault();
  const fd = new FormData(ev.target);
  const id = fd.get('id');
  const patch = {
    matricule: (id && enseignantById(id)?.matricule) || `ENS-${String(DB.enseignants.length+1).padStart(3,'0')}`,
    prenom: fd.get('prenom').trim(), nom: fd.get('nom').trim(), sexe: fd.get('sexe'),
    telephone: fd.get('telephone').trim(), email: fd.get('email').trim(),
    dateEmbauche: fd.get('dateEmbauche') || todayISO(), statut: fd.get('statut'),
    salaireMensuel: Math.max(0, parseInt(fd.get('salaireMensuel'))||0),
    classesAssignees: fd.getAll('classes'), matieres: fd.getAll('matieres'),
  };
  try{
    if(id){
      await dbUpdate('enseignants', id, patch);
      const idx = DB.enseignants.findIndex(e=>e.id===id);
      DB.enseignants[idx] = {...DB.enseignants[idx], ...patch};
    } else {
      DB.enseignants.push(await dbInsert('enseignants', patch));
    }
    closeModal(); toast('Enseignant enregistré');
    renderView('enseignants');
  }catch(e){ alert('Erreur : ' + e.message); }
  return false;
}

async function deleteEnseignant(id){
  const t = enseignantById(id);
  if(!confirm(`Supprimer l'enseignant ${ensFullName(t)} ?`)) return;
  try{
    await dbDelete('enseignants', id);
    DB.enseignants = DB.enseignants.filter(x=>x.id!==id);
    DB.presencesEnseignants = DB.presencesEnseignants.filter(x=>x.enseignantId!==id);
    toast('Enseignant supprimé');
    renderView('enseignants');
  }catch(e){ alert('Erreur : ' + e.message); }
}

/* ---------------------------------------------------------------------
   9. PRÉSENCES ENSEIGNANTS
   --------------------------------------------------------------------- */
function tauxPonctualite(joursHistorique){
  const seuil = new Date(); seuil.setDate(seuil.getDate() - joursHistorique);
  const seuilISO = toISO(seuil);
  const records = DB.presencesEnseignants.filter(p => p.heureArrivee && p.date >= seuilISO);
  if(records.length === 0) return null;
  const ponctuels = records.filter(p => p.statut === 'Présent').length;
  return Math.round((ponctuels / records.length) * 100);
}

function renderPresencesEnseignants(){
  const date = ui.filters.presEnsDate || todayISO();
  ui.filters.presEnsDate = date;

  const list = DB.enseignants.filter(t=>t.statut==='Actif').sort((a,b)=>a.nom.localeCompare(b.nom));
  const rows = list.map(t=>{
    const rec = DB.presencesEnseignants.find(p=>p.enseignantId===t.id && p.date===date);
    const statut = rec ? rec.statut : 'Présent';
    return `<tr>
      <td><div class="row-name"><span class="avatar">${initials(t.prenom,t.nom)}</span>${escapeHtml(ensFullName(t))}</div></td>
      <td>${t.classesAssignees.map(cid=>classeName(cid)).join(', ')}</td>
      <td>
        <select data-ens="${t.id}" class="sel-statut-ens">
          <option ${statut==='Présent'?'selected':''}>Présent</option>
          <option ${statut==='Absent'?'selected':''}>Absent</option>
          <option ${statut==='Retard'?'selected':''}>Retard</option>
        </select>
      </td>
      <td>${rec?.heureArrivee || '—'}</td>
      <td>${rec?.heureDepart || '—'}</td>
      <td><span class="badge ${rec?.methode==='QR'?'blue':'gray'}">${rec?.methode || 'Manuel'}</span></td>
      <td><input type="text" data-motif-ens="${t.id}" placeholder="Motif (optionnel)" value="${escapeHtml(rec?rec.motif:'')}" style="width:100%;padding:7px 9px;border:1px solid var(--border);border-radius:7px;"></td>
    </tr>`;
  }).join('');

  const recent = DB.presencesEnseignants.slice().sort((a,b)=> b.date.localeCompare(a.date) || (b.heureArrivee||'').localeCompare(a.heureArrivee||'')).slice(0,20);
  const recentRows = recent.map(p=>{
    const t = enseignantById(p.enseignantId);
    if(!t) return '';
    return `<tr><td>${fmtDate(p.date)}</td><td>${escapeHtml(ensFullName(t))}</td>
      <td><span class="badge ${p.statut==='Présent'?'green':p.statut==='Absent'?'red':'amber'}">${p.statut}</span></td>
      <td>${p.heureArrivee || '—'}</td><td>${p.heureDepart || '—'}</td>
      <td>${p.minutesRetard ? p.minutesRetard+' min' : '—'}</td>
      <td><span class="badge ${p.methode==='QR'?'blue':'gray'}">${p.methode || 'Manuel'}</span></td>
      <td>${escapeHtml(p.motif||'—')}</td></tr>`;
  }).join('');

  const taux = tauxPonctualite(30);

  return `
  <div class="view active">
    <div class="panel">
      <div class="panel-head">
        <div><h2>🕘 Journal de pointage — enseignants</h2><div class="sub">Alimenté automatiquement par les scans QR, avec correction manuelle possible</div></div>
        <button class="btn secondary no-print" onclick="go('pointage-scan')">📷 Aller au scanner</button>
      </div>
      <div style="display:flex;gap:10px;margin-bottom:14px;flex-wrap:wrap;">
        <div class="badge blue" style="font-size:12px;padding:6px 12px;">Heure d'arrivée attendue : ${DB.meta.heureArriveeAttendue}</div>
        ${taux!=null ? `<div class="badge ${taux>=90?'green':taux>=70?'amber':'red'}" style="font-size:12px;padding:6px 12px;">Ponctualité (30j) : ${taux}%</div>` : ''}
      </div>
      <div class="filters">
        <input type="date" value="${date}" onchange="ui.filters.presEnsDate=this.value; renderView('presences-enseignants')">
      </div>
      <div class="hint" style="margin-bottom:10px;">Cette liste reflète l'état du jour (scans QR déjà reçus). Vous pouvez corriger manuellement un statut ci-dessous — le pointage QR reste la source principale.</div>
      <div class="table-wrap"><table id="tablePresencesEns">
        <thead><tr><th>Enseignant</th><th>Classe(s)</th><th style="width:140px;">Statut</th><th>Arrivée</th><th>Départ</th><th>Méthode</th><th>Motif</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
      <div class="form-actions"><button class="btn" onclick="savePresencesEnseignants()">Enregistrer la présence</button></div>
    </div>

    <div class="panel">
      <div class="panel-head"><div><h2>Historique récent</h2><div class="sub">20 derniers enregistrements</div></div></div>
      <div class="table-wrap"><table>
        <thead><tr><th>Date</th><th>Enseignant</th><th>Statut</th><th>Arrivée</th><th>Départ</th><th>Retard</th><th>Méthode</th><th>Motif</th></tr></thead>
        <tbody>${recentRows || '<tr><td colspan="8" class="hint">Aucun enregistrement</td></tr>'}</tbody>
      </table></div>
    </div>

    <div class="panel">
      <div class="panel-head"><div><h2>Alertes de pointage</h2><div class="sub">Tentatives suspectes détectées au scan (captures d'écran, badges non reconnus)</div></div></div>
      ${renderAlertesPointage()}
    </div>
  </div>`;
}

function renderAlertesPointage(){
  const alertes = (DB.alertesPointage||[]).slice().sort((a,b)=> (b.date+b.heure).localeCompare(a.date+a.heure)).slice(0,15);
  if(alertes.length===0) return `<div class="hint">Aucune alerte — rien à signaler.</div>`;
  const rows = alertes.map(a=>{
    const t = a.enseignantId ? enseignantById(a.enseignantId) : null;
    return `<tr><td>${fmtDate(a.date)} ${a.heure?.slice(0,5)||''}</td><td>${t?escapeHtml(ensFullName(t)):'—'}</td><td>${escapeHtml(a.raison)}</td><td>${a.score ?? '—'}</td></tr>`;
  }).join('');
  return `<div class="table-wrap"><table>
    <thead><tr><th>Date</th><th>Enseignant</th><th>Raison</th><th>Score</th></tr></thead>
    <tbody>${rows}</tbody>
  </table></div>`;
}

async function savePresencesEnseignants(){
  const date = ui.filters.presEnsDate;
  let nbNotifs = 0;
  try{
    for(const sel of $$('.sel-statut-ens')){
      const enseignantId = sel.dataset.ens;
      const statut = sel.value;
      const motifInput = $(`[data-motif-ens="${enseignantId}"]`);
      const motif = motifInput ? motifInput.value.trim() : '';
      let rec = DB.presencesEnseignants.find(p=>p.enseignantId===enseignantId && p.date===date);
      const wasFlagged = rec && (rec.statut==='Absent' || rec.statut==='Retard');
      if(rec){
        await dbUpdate('presences_enseignants', rec.id, {statut, motif});
        rec.statut = statut; rec.motif = motif;
      } else {
        DB.presencesEnseignants.push(await dbInsert('presences_enseignants', {date, enseignantId, statut, motif, methode:'Manuel'}));
      }
      if((statut==='Absent' || statut==='Retard') && !wasFlagged){ await envoyerNotificationEnseignant(enseignantId, date, statut, motif); nbNotifs += 2; }
    }
    toast(nbNotifs ? `Présence enregistrée · ${nbNotifs} notification(s) envoyée(s) (direction, fondation)` : 'Présence enregistrée');
    renderView('presences-enseignants');
  }catch(e){ alert('Erreur : ' + e.message); }
}
async function envoyerNotificationEnseignant(enseignantId, date, statut, motif){
  const t = enseignantById(enseignantId);
  const contenu = composeMsgEnseignant(DB.meta.nomEcole, ensFullName(t), date, statut, motif);
  const destinataires = [
    {nom:DB.meta.directeurNom||'Direction', role:'Directeur', tel:''},
    {nom:DB.meta.fondateurNom||'Fondation', role:'Fondateur', tel:''},
  ].map(d=>({date, heure:nowTime(), destinataireNom:d.nom, destinataireRole:d.role, destinataireTel:d.tel, canal:'Application', type: statut==='Absent'?'Absence enseignant':'Retard enseignant', contenu, enseignantId}));
  DB.messages.push(...await dbInsertMany('messages', destinataires));
}

/* ---------------------------------------------------------------------
   9bis. POINTAGE — Scan QR enseignants (arrivée / départ)
   Détection anti-capture d'écran : heuristique meilleur-effort basée sur
   l'analyse d'image en direct (reflets, scintillement du rétroéclairage).
   Ce n'est pas une garantie absolue — voir la note affichée à l'écran.
   --------------------------------------------------------------------- */
const pointageScan = { stream:null, raf:null, video:null, canvas:null, ctx:null,
  luminanceBuffer:[], lastToken:null, cooldownUntil:0, active:false };

function renderPointageScan(){
  return `
  <div class="view active">
    <div class="panel">
      <div class="panel-head">
        <div><h2>📷 Scanner un badge</h2><div class="sub">L'enseignant présente son QR imprimé devant la caméra pour pointer son arrivée le matin, puis son départ le soir</div></div>
        <button class="btn secondary no-print" onclick="ouvrirBadgesQR()">🏷️ Imprimer les badges QR</button>
      </div>
      <div class="section-note">🛡️ Une vérification automatique en temps réel refuse les captures d'écran présentées à la place du badge papier (analyse des reflets et du scintillement de l'écran). C'est une protection sérieuse mais pas infaillible à 100% — en cas de refus avec un vrai badge imprimé, réessayez avec un meilleur éclairage et sans reflet sur le papier.</div>
      <div style="max-width:480px;margin:16px auto 0;">
        <div style="position:relative;border-radius:14px;overflow:hidden;background:#000;aspect-ratio:4/3;">
          <video id="pointageVideo" autoplay playsinline muted style="width:100%;height:100%;object-fit:cover;"></video>
          <div id="pointageOverlay" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;text-align:center;padding:20px;color:#fff;background:rgba(0,0,0,.5);font-weight:700;">Caméra arrêtée</div>
        </div>
        <canvas id="pointageCanvas" style="display:none;"></canvas>
        <div style="display:flex;gap:10px;margin-top:14px;justify-content:center;">
          <button class="btn" id="btnStartScan" onclick="demarrerScanPointage()">▶️ Démarrer la caméra</button>
          <button class="btn secondary" id="btnStopScan" onclick="arreterScanPointage()" style="display:none;">⏹️ Arrêter</button>
        </div>
        <div id="pointageResult" style="margin-top:16px;"></div>
      </div>
    </div>
  </div>`;
}

async function demarrerScanPointage(){
  const video = $('#pointageVideo'), overlay = $('#pointageOverlay');
  if(typeof jsQR === 'undefined'){
    overlay.textContent = "La bibliothèque de lecture QR n'a pas pu se charger (vérifiez la connexion internet).";
    return;
  }
  try{
    pointageScan.stream = await navigator.mediaDevices.getUserMedia({ video:{ facingMode:'environment' } });
  }catch(e){
    overlay.textContent = "Impossible d'accéder à la caméra : " + e.message;
    return;
  }
  video.srcObject = pointageScan.stream;
  await video.play();
  overlay.style.display = 'none';
  $('#btnStartScan').style.display = 'none';
  $('#btnStopScan').style.display = '';
  pointageScan.video = video;
  pointageScan.canvas = $('#pointageCanvas');
  pointageScan.ctx = pointageScan.canvas.getContext('2d', { willReadFrequently:true });
  pointageScan.active = true;
  pointageScan.luminanceBuffer = [];
  pointageScan.raf = requestAnimationFrame(boucleScanPointage);
}

function arreterScanPointage(){
  pointageScan.active = false;
  if(pointageScan.raf) cancelAnimationFrame(pointageScan.raf);
  if(pointageScan.stream) pointageScan.stream.getTracks().forEach(t=>t.stop());
  pointageScan.stream = null;
  const overlay = $('#pointageOverlay');
  if(overlay){ overlay.style.display = 'flex'; overlay.textContent = 'Caméra arrêtée'; }
  const btnStart = $('#btnStartScan'), btnStop = $('#btnStopScan');
  if(btnStart) btnStart.style.display = '';
  if(btnStop) btnStop.style.display = 'none';
}

function boucleScanPointage(){
  if(!pointageScan.active) return;
  const { video, canvas, ctx } = pointageScan;
  if(video.readyState === video.HAVE_ENOUGH_DATA && canvas.isConnected){
    canvas.width = video.videoWidth; canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);

    enregistrerLuminanceCoin(frame);

    const code = jsQR(frame.data, frame.width, frame.height, { inversionAttempts:'dontInvert' });
    if(code && code.data && code.data.startsWith('ECOMAZ-POINTAGE:')){
      const token = code.data.slice('ECOMAZ-POINTAGE:'.length);
      const now = Date.now();
      if(!(token===pointageScan.lastToken && now < pointageScan.cooldownUntil)){
        pointageScan.lastToken = token;
        pointageScan.cooldownUntil = now + 5000;
        traiterBadgeScanne(token, frame);
      }
    }
  }
  if(pointageScan.active) pointageScan.raf = requestAnimationFrame(boucleScanPointage);
}

function enregistrerLuminanceCoin(frame){
  // Échantillonne un coin de l'image (hors QR en général) pour détecter le
  // scintillement de rétro-éclairage typique d'un écran de téléphone.
  const { data, width } = frame;
  const size = 20;
  let sum = 0, n = 0;
  for(let y=0; y<size; y++){
    for(let x=0; x<size; x++){
      const i = (y*width + x) * 4;
      sum += (data[i] + data[i+1] + data[i+2]) / 3;
      n++;
    }
  }
  pointageScan.luminanceBuffer.push(sum / n);
  if(pointageScan.luminanceBuffer.length > 12) pointageScan.luminanceBuffer.shift();
}

function evaluerAntiCaptureEcran(frame){
  const { data } = frame;
  let satures = 0, total = 0;
  for(let i=0; i<data.length; i+=4*7){ // sous-échantillonnage pour la performance
    if(data[i]>250 && data[i+1]>250 && data[i+2]>250) satures++;
    total++;
  }
  const ratioSatures = total ? satures / total : 0;

  const buf = pointageScan.luminanceBuffer;
  let variance = 0;
  if(buf.length >= 6){
    const m = buf.reduce((a,b)=>a+b,0) / buf.length;
    variance = buf.reduce((a,b)=>a+(b-m)*(b-m),0) / buf.length;
  }

  const score = Math.round((ratioSatures*300 + Math.min(variance, 15)) * 10) / 10;
  return { suspect: score > 12, score, ratioSatures, variance };
}

async function traiterBadgeScanne(token, frame){
  const diag = evaluerAntiCaptureEcran(frame);
  const t = DB.enseignants.find(e => e.qrToken === token);

  if(diag.suspect){
    afficherResultatScan('rejet', t ? ensFullName(t) : null, "Ceci ressemble à une capture d'écran présentée au lieu du badge imprimé — pointage refusé.");
    try{
      const inserted = await dbInsertMany('alertes_pointage', [{ enseignantId: t?t.id:null, date: todayISO(), heure: nowTime(), raison: "Capture d'écran suspectée au scan", score: diag.score }]);
      DB.alertesPointage = DB.alertesPointage || [];
      DB.alertesPointage.push(...inserted);
    }catch(e){}
    return;
  }
  if(!t){
    afficherResultatScan('erreur', null, "Badge non reconnu — ce QR ne correspond à aucun enseignant de l'école.");
    return;
  }
  if(t.statut !== 'Actif'){
    afficherResultatScan('erreur', ensFullName(t), "Ce compte enseignant n'est plus actif.");
    return;
  }
  await enregistrerPointageEnseignant(t);
}

async function enregistrerPointageEnseignant(t){
  // L'heure et le calcul du retard sont désormais décidés par le SERVEUR
  // (Edge Function "enregistrer-pointage"), jamais par l'horloge ou les
  // calculs du navigateur — un client ne peut plus fabriquer une heure
  // d'arrivée arbitraire en contournant l'interface.
  const date = todayISO();
  let rec = DB.presencesEnseignants.find(p => p.enseignantId===t.id && p.date===date);

  if(rec && rec.heureArrivee && rec.heureDepart){
    afficherResultatScan('info', ensFullName(t), 'Arrivée et départ déjà enregistrés aujourd\'hui.');
    return;
  }

  const action = (!rec || !rec.heureArrivee) ? 'arrivee' : 'depart';

  try{
    const { data, error } = await sb.functions.invoke('enregistrer-pointage', { body: { enseignantId: t.id, action } });
    if(error) throw error;
    if(!data?.ok) throw new Error(data?.error || "Échec de l'enregistrement");

    if(data.deja){
      afficherResultatScan('info', ensFullName(t), data.message);
      return;
    }

    if(action === 'arrivee'){
      const patch = { heureArrivee: data.heure, statut: data.statut, methode:'QR', minutesRetard: data.minutesRetard };
      if(rec){ Object.assign(rec, patch); }
      else { rec = { date, enseignantId:t.id, ...patch }; DB.presencesEnseignants.push(rec); }
      if(data.statut === 'Retard') await envoyerNotificationEnseignant(t.id, date, 'Retard', `Pointage QR — ${data.minutesRetard} min de retard`);
      afficherResultatScan(data.statut==='Retard'?'retard':'arrivee', ensFullName(t),
        data.statut==='Retard' ? `Arrivée enregistrée à ${data.heure} — ${data.minutesRetard} min de retard` : `Bienvenue ! Arrivée enregistrée à ${data.heure}`);
    } else {
      if(rec) rec.heureDepart = data.heure;
      afficherResultatScan('depart', ensFullName(t), `Départ enregistré à ${data.heure} — bonne soirée !`);
    }
  }catch(e){
    afficherResultatScan('erreur', ensFullName(t), 'Erreur technique : ' + e.message);
  }
}

function afficherResultatScan(type, nom, message){
  const el = $('#pointageResult');
  if(!el) return;
  const styles = {
    arrivee: {bg:'var(--green-bg)', color:'var(--green)', icon:'✅'},
    retard:  {bg:'var(--amber-bg)', color:'var(--amber)', icon:'⏰'},
    depart:  {bg:'var(--primary-dim)', color:'var(--primary-dark)', icon:'👋'},
    rejet:   {bg:'var(--red-bg)', color:'var(--red)', icon:'🚫'},
    erreur:  {bg:'var(--red-bg)', color:'var(--red)', icon:'❌'},
    info:    {bg:'var(--surface-2)', color:'var(--text-dim)', icon:'ℹ️'},
  };
  const s = styles[type] || styles.info;
  el.innerHTML = `<div style="padding:14px 16px;border-radius:12px;background:${s.bg};color:${s.color};font-weight:700;">
    ${s.icon} ${nom ? escapeHtml(nom) + ' — ' : ''}${escapeHtml(message)}
  </div>`;
}

function genererBadgeQrHtml(t){
  if(typeof qrcode === 'undefined') return `<div class="badge-qr-card"><div class="hint">QR indisponible hors ligne</div></div>`;
  const qr = qrcode(0, 'M');
  qr.addData('ECOMAZ-POINTAGE:' + t.qrToken);
  qr.make();
  return `<div class="badge-qr-card">
    <div class="badge-qr-school">${escapeHtml(DB.meta.nomEcole)}</div>
    ${qr.createImgTag(6, 8)}
    <div class="badge-qr-name">${escapeHtml(ensFullName(t))}</div>
    <div class="badge-qr-hint">Badge de pointage — à imprimer et présenter au bureau du secrétariat</div>
  </div>`;
}

function ouvrirBadgesQR(){
  const actifs = DB.enseignants.filter(t=>t.statut==='Actif' && t.qrToken).sort((a,b)=>a.nom.localeCompare(b.nom));
  if(actifs.length===0){ toast("Aucun badge disponible — vérifiez que la migration de base de données du module Pointage a bien été appliquée."); return; }
  const cards = actifs.map(genererBadgeQrHtml).join('');
  openModal('Badges QR — Pointage enseignants', `
    <div class="badge-qr-grid">${cards}</div>
    <div class="form-actions no-print"><button class="btn" onclick="window.print()">🖨️ Imprimer tous les badges</button></div>
  `);
}

/* ---------------------------------------------------------------------
   10. EMPLOI DU TEMPS
   --------------------------------------------------------------------- */
function renderEmploiTemps(){
  const mesClasses = classesVisibles();
  if(mesClasses.length === 0){
    return `<div class="view active"><div class="panel"><div class="empty-state"><div class="em-ic">🗓️</div>Aucune classe configurée pour le moment. Activez au moins un niveau scolaire dans Paramètres pour commencer à préparer un emploi du temps.</div></div></div>`;
  }
  let classeId = ui.filters.ttClasse || mesClasses[0].id;
  if(!mesClasses.some(c=>c.id===classeId)) classeId = mesClasses[0].id;
  ui.filters.ttClasse = classeId;
  const c = DB.classes.find(x=>x.id===classeId);
  const periodes = PERIODES_BY_CYCLE[c.cycle];

  let rowsHtml = '';
  periodes.forEach((p,i)=>{
    if(p.type==='pause'){
      rowsHtml += `<tr><td class="tt-time">${p.debut}-${p.fin}</td><td colspan="5" style="background:var(--surface-2);color:var(--text-dim);font-weight:700;font-size:11.5px;">${p.label}</td></tr>`;
      return;
    }
    rowsHtml += `<tr><td class="tt-time">${p.debut}-${p.fin}</td>`;
    JOURS.forEach(jour=>{
      const entry = DB.emploiTemps.find(e=>e.classeId===classeId && e.jour===jour && e.slotIndex===i);
      if(entry){
        const t = enseignantById(entry.enseignantId);
        rowsHtml += `<td>
          <div class="tt-slot">
            <b>${escapeHtml(entry.matiere)}</b>
            <span>${escapeHtml(ensFullName(t))}</span>
            <div style="margin-top:5px;display:flex;gap:4px;">
              <button class="icon-btn" style="width:22px;height:22px;font-size:10px;" onclick="openSlotForm('${classeId}','${jour}',${i})">✏️</button>
              <button class="icon-btn danger" style="width:22px;height:22px;font-size:10px;" onclick="clearSlot('${entry.id}')">✕</button>
            </div>
          </div>
        </td>`;
      } else {
        rowsHtml += `<td><button class="icon-btn" style="width:100%;" onclick="openSlotForm('${classeId}','${jour}',${i})">+ Ajouter</button></td>`;
      }
    });
    rowsHtml += `</tr>`;
  });

  return `
  <div class="view active">
    <div class="panel">
      <div class="panel-head">
        <div><h2>Emploi du temps</h2><div class="sub">${c.nom} · ${c.cycle}</div></div>
        <select onchange="ui.filters.ttClasse=this.value; renderView('emploi-temps')">
          ${mesClasses.map(cl=>`<option value="${cl.id}" ${classeId===cl.id?'selected':''}>${cl.nom}</option>`).join('')}
        </select>
      </div>
      <div class="table-wrap">
        <table class="timetable">
          <thead><tr><th>Horaire</th>${JOURS.map(j=>`<th>${j}</th>`).join('')}</tr></thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>
    </div>
  </div>`;
}

function openSlotForm(classeId, jour, slotIndex){
  const c = DB.classes.find(x=>x.id===classeId);
  const matieres = MATIERES_BY_CYCLE[c.cycle];
  const existing = DB.emploiTemps.find(e=>e.classeId===classeId && e.jour===jour && e.slotIndex===slotIndex);
  const eligibleEns = DB.enseignants.filter(t=>t.classesAssignees.includes(classeId) || t.statut==='Actif');
  openModal(`Créneau — ${jour}`, `
    <form onsubmit="return handleSaveSlot(event,'${classeId}','${jour}',${slotIndex},'${existing?existing.id:''}')">
      <div class="form-grid single">
        <div class="field"><label>Matière</label>
          <select name="matiere">${matieres.map(m=>`<option ${existing?.matiere===m?'selected':''}>${m}</option>`).join('')}</select>
        </div>
        <div class="field"><label>Enseignant</label>
          <select name="enseignantId">${eligibleEns.map(t=>`<option value="${t.id}" ${existing?.enseignantId===t.id?'selected':''}>${ensFullName(t)}</option>`).join('')}</select>
        </div>
      </div>
      <div class="form-actions">
        <button type="button" class="btn secondary" onclick="closeModal()">Annuler</button>
        <button type="submit" class="btn">Enregistrer</button>
      </div>
    </form>`);
}

async function handleSaveSlot(ev, classeId, jour, slotIndex, existingId){
  ev.preventDefault();
  const fd = new FormData(ev.target);
  const matiere = fd.get('matiere'), enseignantId = fd.get('enseignantId');
  try{
    if(existingId){
      await dbUpdate('emploi_temps', existingId, {matiere, enseignantId});
      const e = DB.emploiTemps.find(x=>x.id===existingId);
      e.matiere = matiere; e.enseignantId = enseignantId;
    } else {
      DB.emploiTemps.push(await dbInsert('emploi_temps', {classeId, jour, slotIndex, matiere, enseignantId}));
    }
    closeModal(); toast('Créneau enregistré');
    renderView('emploi-temps');
  }catch(e){ alert('Erreur : ' + e.message); }
  return false;
}

async function clearSlot(entryId){
  if(!confirm('Vider ce créneau ?')) return;
  try{
    await dbDelete('emploi_temps', entryId);
    DB.emploiTemps = DB.emploiTemps.filter(e=>e.id!==entryId);
    toast('Créneau supprimé');
    renderView('emploi-temps');
  }catch(e){ alert('Erreur : ' + e.message); }
}

/* ---------------------------------------------------------------------
   11. PROGRAMMES PÉDAGOGIQUES
   --------------------------------------------------------------------- */
function renderProgrammes(){
  const f = ui.filters.prog || {classeId:'', enseignantId:'', trimestre:''};
  ui.filters.prog = f;

  let list = DB.programmes.slice();
  if(f.classeId) list = list.filter(p=>p.classeId===f.classeId);
  if(f.enseignantId) list = list.filter(p=>p.enseignantId===f.enseignantId);
  if(f.trimestre) list = list.filter(p=>p.trimestre===f.trimestre);
  list.sort((a,b)=> classeName(a.classeId).localeCompare(classeName(b.classeId)));

  const rows = list.map(p=>{
    const t = enseignantById(p.enseignantId);
    return `<tr>
      <td><span class="badge blue">${classeName(p.classeId)}</span></td>
      <td>${escapeHtml(p.matiere)}</td>
      <td>${escapeHtml(ensFullName(t))}</td>
      <td>${p.trimestre}</td>
      <td style="min-width:140px;">
        <div style="display:flex;align-items:center;gap:8px;">
          <div class="progress" style="flex:1;"><div style="width:${p.progression}%;background:${p.progression>=75?'var(--green)':p.progression>=40?'var(--amber)':'var(--red)'};"></div></div>
          <span style="font-size:11.5px;font-weight:700;">${p.progression}%</span>
        </div>
      </td>
      <td>${fmtDate(p.dateMaj)}</td>
      <td style="white-space:nowrap;">
        <button class="icon-btn" title="Modifier" onclick="openProgrammeForm('${p.id}')">✏️</button>
        <button class="icon-btn danger" title="Supprimer" onclick="deleteProgramme('${p.id}')">🗑️</button>
      </td>
    </tr>`;
  }).join('');

  return `
  <div class="view active">
    <div class="panel">
      <div class="panel-head">
        <div><h2>Programmes pédagogiques</h2><div class="sub">${list.length} entrée(s) · Suivi de la progression des enseignants</div></div>
        <button class="btn" onclick="openProgrammeForm()">+ Nouveau programme</button>
      </div>
      <div class="filters">
        <select onchange="ui.filters.prog.classeId=this.value; renderView('programmes')">
          <option value="">Toutes les classes</option>
          ${DB.classes.map(c=>`<option value="${c.id}" ${f.classeId===c.id?'selected':''}>${c.nom}</option>`).join('')}
        </select>
        <select onchange="ui.filters.prog.enseignantId=this.value; renderView('programmes')">
          <option value="">Tous les enseignants</option>
          ${DB.enseignants.map(t=>`<option value="${t.id}" ${f.enseignantId===t.id?'selected':''}>${ensFullName(t)}</option>`).join('')}
        </select>
        <select onchange="ui.filters.prog.trimestre=this.value; renderView('programmes')">
          <option value="">Tous les trimestres</option>
          ${TRIMESTRES.map(t=>`<option ${f.trimestre===t?'selected':''}>${t}</option>`).join('')}
        </select>
      </div>
      ${list.length===0 ? `<div class="empty-state"><div class="em-ic">📚</div>Aucun programme enregistré pour ces critères.</div>` : `
      <div class="table-wrap"><table>
        <thead><tr><th>Classe</th><th>Matière</th><th>Enseignant</th><th>Trimestre</th><th>Progression</th><th>Mise à jour</th><th>Actions</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>`}
    </div>
  </div>`;
}

function openProgrammeForm(id){
  const p = id ? DB.programmes.find(x=>x.id===id) : null;
  const mesClasses = classesVisibles();
  if(!p && mesClasses.length === 0){
    toast("Aucune classe configurée — activez d'abord un niveau scolaire dans Paramètres.");
    return;
  }
  const classeId = p ? p.classeId : mesClasses[0].id;
  const cycle = classeCycle(classeId);
  openModal(p ? 'Modifier le programme' : 'Nouveau programme', `
    <form id="formProg" onsubmit="return handleSaveProgramme(event)">
      <input type="hidden" name="id" value="${p?p.id:''}">
      <div class="form-grid">
        <div class="field"><label>Classe</label>
          <select name="classeId" id="progClasse" onchange="updateProgMatieres()">
            ${mesClasses.map(c=>`<option value="${c.id}" ${classeId===c.id?'selected':''}>${c.nom}</option>`).join('')}
          </select>
        </div>
        <div class="field"><label>Matière</label>
          <select name="matiere" id="progMatiere">
            ${MATIERES_BY_CYCLE[cycle].map(m=>`<option ${p?.matiere===m?'selected':''}>${m}</option>`).join('')}
          </select>
        </div>
        <div class="field"><label>Enseignant</label>
          <select name="enseignantId">${DB.enseignants.map(t=>`<option value="${t.id}" ${p?.enseignantId===t.id?'selected':''}>${ensFullName(t)}</option>`).join('')}</select>
        </div>
        <div class="field"><label>Trimestre</label>
          <select name="trimestre">${TRIMESTRES.map(t=>`<option ${p?.trimestre===t?'selected':''}>${t}</option>`).join('')}</select>
        </div>
        <div class="field span2"><label>Contenu / chapitres du programme</label>
          <textarea name="contenu" required>${p?escapeHtml(p.contenu):''}</textarea>
        </div>
        <div class="field"><label>Progression (%)</label>
          <input type="number" name="progression" min="0" max="100" value="${p?p.progression:0}">
        </div>
      </div>
      <div class="form-actions">
        <button type="button" class="btn secondary" onclick="closeModal()">Annuler</button>
        <button type="submit" class="btn">Enregistrer</button>
      </div>
    </form>`);
}

function updateProgMatieres(){
  const classeId = $('#progClasse').value;
  const cycle = classeCycle(classeId);
  $('#progMatiere').innerHTML = MATIERES_BY_CYCLE[cycle].map(m=>`<option>${m}</option>`).join('');
}

async function handleSaveProgramme(ev){
  ev.preventDefault();
  const fd = new FormData(ev.target);
  const id = fd.get('id');
  const patch = {
    classeId: fd.get('classeId'), matiere: fd.get('matiere'), enseignantId: fd.get('enseignantId'),
    trimestre: fd.get('trimestre'), contenu: fd.get('contenu').trim(),
    progression: Math.max(0, Math.min(100, parseInt(fd.get('progression'))||0)), dateMaj: todayISO(),
  };
  try{
    if(id){
      await dbUpdate('programmes', id, patch);
      const idx = DB.programmes.findIndex(p=>p.id===id);
      DB.programmes[idx] = {id, ...patch};
    } else {
      DB.programmes.push(await dbInsert('programmes', patch));
    }
    closeModal(); toast('Programme enregistré');
    renderView('programmes');
  }catch(e){ alert('Erreur : ' + e.message); }
  return false;
}

async function deleteProgramme(id){
  if(!confirm('Supprimer ce programme ?')) return;
  try{
    await dbDelete('programmes', id);
    DB.programmes = DB.programmes.filter(p=>p.id!==id);
    toast('Programme supprimé');
    renderView('programmes');
  }catch(e){ alert('Erreur : ' + e.message); }
}

/* ---------------------------------------------------------------------
   12. COMPTABILITÉ GÉNÉRALE
   --------------------------------------------------------------------- */
function scolariteEleveInfo(eleveId){
  const el = eleveById(eleveId);
  const du = (el && DB.fraisScolarite[el.classeId]) || 0;
  const paye = DB.paiementsScolarite.filter(p=>p.eleveId===eleveId).reduce((s,p)=>s+p.montant,0);
  const solde = Math.max(0, du-paye);
  let statut = 'Impayé';
  if(du>0 && paye>=du) statut = 'Soldé';
  else if(paye>0) statut = 'Partiel';
  return {du, paye, solde, statut};
}
// Détail élève × échéance (Frais d'inscription, 1er Versement, ...) — la
// "grille intelligente" : chaque échéance configurée dans Paramètres devient
// une colonne, avec son propre statut payé/partiel/impayé, plutôt qu'un
// unique solde global qui ne dit pas QUELLE tranche reste due.
function scolariteEleveParEcheance(eleveId){
  const paiements = DB.paiementsScolarite.filter(p=>p.eleveId===eleveId);
  const parTranche = {};
  paiements.forEach(p=>{ parTranche[p.tranche] = (parTranche[p.tranche]||0) + p.montant; });
  const echeances = (DB.echeancesScolarite||[]).slice().sort((a,b)=>(a.ordre-b.ordre)||(a.dateEcheance||'').localeCompare(b.dateEcheance||''));
  const detail = echeances.map(ech=>{
    const paye = parTranche[ech.label] || 0;
    const statut = ech.montant>0 && paye>=ech.montant ? 'paye' : paye>0 ? 'partiel' : 'impaye';
    return {label:ech.label, montant:ech.montant, paye, statut};
  });
  const total = echeances.reduce((s,e)=>s+e.montant,0);
  const totalPaye = paiements.reduce((s,p)=>s+p.montant,0);
  const reste = Math.max(0, total-totalPaye);
  return {detail, total, totalPaye, reste};
}
function personnelNomById(id, type){
  if(type==='enseignant'){ const t = enseignantById(id); return t ? ensFullName(t) : '—'; }
  const p = DB.personnelAutre.find(x=>x.id===id);
  return p ? `${p.prenom} ${p.nom}` : '—';
}

/* --- Reçus de caisse --- */
function nombreEnLettres(n){
  n = Math.round(Math.abs(n||0));
  if(n===0) return 'zéro';
  const U = ['','un','deux','trois','quatre','cinq','six','sept','huit','neuf','dix','onze','douze','treize','quatorze','quinze','seize','dix-sept','dix-huit','dix-neuf'];
  const D = ['','dix','vingt','trente','quarante','cinquante','soixante','soixante','quatre-vingt','quatre-vingt'];
  function deuxChiffres(num){
    if(num<20) return U[num];
    const d = Math.floor(num/10), u = num%10;
    if(d===7 || d===9){
      if(u===1) return D[d]+'-et-'+U[10+u];
      return D[d]+'-'+U[10+u];
    }
    if(u===0) return D[d] + (d===8?'s':'');
    if(u===1 && d!==8) return D[d]+'-et-un';
    return D[d]+'-'+U[u];
  }
  function troisChiffres(num){
    const c = Math.floor(num/100), r = num%100;
    let s = '';
    if(c>0) s += (c===1?'cent':U[c]+' cent') + (c>1 && r===0 ? 's':'');
    if(r>0) s += (s?' ':'') + deuxChiffres(r);
    return s;
  }
  let reste = n;
  const milliards = Math.floor(reste/1e9); reste %= 1e9;
  const millions = Math.floor(reste/1e6); reste %= 1e6;
  const milliers = Math.floor(reste/1e3); reste %= 1e3;
  const unites = reste;
  const parts = [];
  if(milliards>0) parts.push(troisChiffres(milliards)+' milliard'+(milliards>1?'s':''));
  if(millions>0) parts.push(troisChiffres(millions)+' million'+(millions>1?'s':''));
  if(milliers>0) parts.push(milliers===1 ? 'mille' : troisChiffres(milliers)+' mille');
  if(unites>0 || parts.length===0) parts.push(troisChiffres(unites));
  return parts.join(' ').replace(/\s+/g,' ').trim();
}
function capitalize(s){ return s ? s.charAt(0).toUpperCase()+s.slice(1) : s; }

let recuSeq = 0;
function genRecuNumero(type, refId){
  return `REC-${type==='entree'?'E':'S'}-${(refId||uid()).toUpperCase()}`;
}
function buildRecuHtml(r){
  const m = DB.meta;
  const numero = genRecuNumero(r.type, r.refId);
  const libType = r.type==='entree' ? "REÇU D'ENTRÉE DE CAISSE" : 'REÇU DE SORTIE DE CAISSE';
  const couleur = r.type==='entree' ? 'var(--green)' : 'var(--red)';
  return `
    <div class="recu">
      <div class="recu-head">
        ${m.logo ? `<img src="${m.logo}">` : `<div class="recu-logo-ph">🎓</div>`}
        <div>
          <strong>${escapeHtml(m.nomEcole)}</strong>
          <div class="hint">${escapeHtml(m.adresse||'')}${m.telephone?' · '+escapeHtml(m.telephone):''}</div>
        </div>
      </div>
      <div class="recu-title" style="color:${couleur};border-color:${couleur};">${libType}</div>
      <div class="recu-row"><span>N° Reçu</span><strong>${numero}</strong></div>
      <div class="recu-row"><span>Date</span><strong>${fmtDate(r.date)}</strong></div>
      <div class="recu-row"><span>${r.type==='entree'?'Reçu de':'Payé à'}</span><strong>${escapeHtml(r.personne||'—')}</strong></div>
      <div class="recu-row"><span>Objet</span><strong>${escapeHtml(r.objet)}</strong></div>
      ${r.sousInfo ? `<div class="recu-row"><span>Détail</span><strong>${escapeHtml(r.sousInfo)}</strong></div>` : ''}
      <div class="recu-row"><span>Mode de paiement</span><strong>${escapeHtml(r.modePaiement||'—')}</strong></div>
      <div class="recu-montant" style="color:${couleur};">${r.type==='entree'?'+':'−'} ${fmtFCFA(r.montant)}</div>
      <div class="recu-lettres">Arrêtée la présente somme à : <em>${capitalize(nombreEnLettres(r.montant))} francs CFA</em></div>
      <div class="signatures">
        <div class="sign-box"><div class="sign-role">Le/La Caissier(ère)</div><div class="sign-line">${escapeHtml(m.directeurNom||'—')}</div></div>
        <div class="sign-box"><div class="sign-role">${r.type==='entree'?'Le Payeur':'Le Bénéficiaire'}</div><div class="sign-line">&nbsp;</div></div>
      </div>
    </div>`;
}
function openRecu(r){
  openModal('Reçu de caisse', `
    ${buildRecuHtml(r)}
    <div class="form-actions no-print">
      <button type="button" class="btn secondary" onclick="closeModal()">Fermer</button>
      <button type="button" class="btn" onclick="window.print()">🖨️ Imprimer le reçu</button>
    </div>`);
}

function renderComptabilite(){
  const tab = ui.filters.comptaTab || 'apercu';
  ui.filters.comptaTab = tab;
  const renderers = {
    apercu: renderComptaApercu, scolarite: renderComptaScolarite, activites: renderComptaActivites,
    ventes: renderComptaVentes, salaires: renderComptaSalaires, depenses: renderComptaDepenses,
    journal: renderComptaJournal,
  };
  // Le journal d'audit financier (qui a créé/modifié/supprimé quoi) est
  // réservé à Direction/Fondation, comme les totaux globaux ailleurs dans
  // ce module — le Secrétariat saisit les paiements mais ne voit pas ça.
  const tabsVisibles = COMPTA_TABS.filter(t => t.id!=='journal' || ui.role==='direction' || ui.role==='fondation');
  return `
  <div class="view active">
    <div class="subtabs">
      ${tabsVisibles.map(t=>`<button class="subtab ${tab===t.id?'active':''}" onclick="ui.filters.comptaTab='${t.id}'; ${t.id==='journal'?'__journalComptaCache=null; ':''}renderView('comptabilite')">${t.icon} ${t.label}</button>`).join('')}
    </div>
    ${(renderers[tab] || renderComptaApercu)()}
  </div>`;
}

/* --- 12.1 Aperçu financier --- */
function renderComptaApercu(){
  const periode = ui.filters.comptaPeriode || 'all';
  ui.filters.comptaPeriode = periode;
  const inPeriod = iso => periode==='all' || iso.slice(0,7)===periode;

  const recScolarite = DB.paiementsScolarite.filter(p=>inPeriod(p.date)).reduce((s,p)=>s+p.montant,0);
  const recCotisations = DB.paiementsCotisations.filter(p=>inPeriod(p.date)).reduce((s,p)=>s+p.montant,0);
  const recVentes = DB.ventesGadgets.filter(v=>inPeriod(v.date)).reduce((s,v)=>s+v.montantTotal,0);
  const totalRecettes = recScolarite + recCotisations + recVentes;

  const depSalaires = DB.paiementsSalaires.filter(p=>inPeriod(p.datePaiement)).reduce((s,p)=>s+p.montant,0);
  const depParCategorie = {};
  CATEGORIES_DEPENSES.forEach(c=> depParCategorie[c] = DB.depenses.filter(d=>d.categorie===c && inPeriod(d.date)).reduce((s,d)=>s+d.montant,0));
  const depAutres = Object.values(depParCategorie).reduce((s,v)=>s+v,0);
  const totalDepenses = depSalaires + depAutres;
  const resultat = totalRecettes - totalDepenses;

  const eleveActifs = DB.eleves.filter(e=>e.statut==='Actif');
  const totalDu = eleveActifs.reduce((s,e)=> s+(DB.fraisScolarite[e.classeId]||0), 0);
  const totalPayeScolarite = DB.paiementsScolarite.reduce((s,p)=>s+p.montant,0);
  const tauxRecouvrement = totalDu ? Math.round(100*Math.min(totalPayeScolarite,totalDu)/totalDu) : 0;

  const maxRec = Math.max(recScolarite, recCotisations, recVentes, 1);
  const recBars = [
    {label:'Scolarité', val:recScolarite}, {label:'Activités extra-scolaires', val:recCotisations}, {label:'Boutique scolaire', val:recVentes},
  ].map(b=>`<div style="display:flex;align-items:center;gap:10px;margin-bottom:9px;">
    <div style="width:170px;font-size:12px;color:var(--text-dim);flex-shrink:0;">${b.label}</div>
    <div class="progress" style="flex:1;"><div style="width:${Math.round(100*b.val/maxRec)}%;background:var(--green);"></div></div>
    <div style="width:100px;text-align:right;font-size:12px;font-weight:700;">${fmtFCFA(b.val)}</div>
  </div>`).join('');

  const depEntries = [{label:'Salaires', val:depSalaires}, ...CATEGORIES_DEPENSES.map(c=>({label:c, val:depParCategorie[c]}))].filter(d=>d.val>0);
  const maxDep = Math.max(...depEntries.map(d=>d.val), 1);
  const depBars = (depEntries.length ? depEntries : [{label:'Aucune dépense', val:0}]).map(b=>`<div style="display:flex;align-items:center;gap:10px;margin-bottom:9px;">
    <div style="width:170px;font-size:12px;color:var(--text-dim);flex-shrink:0;">${b.label}</div>
    <div class="progress" style="flex:1;"><div style="width:${Math.round(100*b.val/maxDep)}%;background:var(--red);"></div></div>
    <div style="width:100px;text-align:right;font-size:12px;font-weight:700;">${fmtFCFA(b.val)}</div>
  </div>`).join('');

  const impayes = eleveActifs.map(e=>({e, info:scolariteEleveInfo(e.id)})).filter(x=>x.info.solde>0).sort((a,b)=>b.info.solde-a.info.solde).slice(0,8);
  const impayesHtml = impayes.map(x=>`<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border);">
    <div><strong style="font-size:12.5px;cursor:pointer;" onclick="go('eleves'); viewEleveProfile('${x.e.id}')">${escapeHtml(eleveFullName(x.e))}</strong><div class="hint">${classeName(x.e.classeId)} · ${escapeHtml(x.e.parentTel)}</div></div>
    <span class="amount out">${fmtFCFA(x.info.solde)}</span>
  </div>`).join('') || `<div class="hint">Aucun impayé — bravo ! 🎉</div>`;

  const txns = [];
  DB.paiementsScolarite.forEach(p=>txns.push({date:p.date, type:'in', ic:'🎓', label:`Scolarité — ${escapeHtml(eleveFullName(eleveById(p.eleveId)||{prenom:'—',nom:''}))}`, sub:p.tranche, montant:p.montant}));
  DB.paiementsCotisations.forEach(p=>{ const act = DB.activites.find(a=>a.id===p.activiteId); txns.push({date:p.date, type:'in', ic:'🎨', label:`Cotisation ${act?escapeHtml(act.nom):''} — ${escapeHtml(eleveFullName(eleveById(p.eleveId)||{prenom:'—',nom:''}))}`, sub:'Activité extra-scolaire', montant:p.montant}); });
  DB.ventesGadgets.forEach(v=>{ const g = DB.gadgets.find(x=>x.id===v.gadgetId); txns.push({date:v.date, type:'in', ic:'🛍️', label:`Vente ${g?escapeHtml(g.nom):''} ×${v.quantite}`, sub:'Boutique scolaire', montant:v.montantTotal}); });
  DB.paiementsSalaires.forEach(p=>txns.push({date:p.datePaiement, type:'out', ic:'💵', label:`Salaire — ${escapeHtml(personnelNomById(p.personnelId,p.personnelType))}`, sub:moisLabel(p.mois), montant:p.montant}));
  DB.depenses.forEach(d=>txns.push({date:d.date, type:'out', ic: d.categorie==='Loyer'?'🏠':'🧾', label:escapeHtml(d.libelle), sub:d.categorie, montant:d.montant}));
  txns.sort((a,b)=>b.date.localeCompare(a.date));
  const recentTxns = txns.filter(t=>inPeriod(t.date)).slice(0,12);
  const txnsHtml = recentTxns.map(t=>`<div class="txn-item">
    <div class="txn-ic ${t.type}">${t.ic}</div>
    <div class="txn-body"><div class="txn-title">${t.label}</div><div class="txn-sub">${t.sub} · ${fmtDate(t.date)}</div></div>
    <div class="amount ${t.type}">${t.type==='in'?'+':'−'} ${fmtFCFA(t.montant)}</div>
  </div>`).join('') || `<div class="hint">Aucune transaction sur cette période.</div>`;

  const secret = ui.role === 'secretariat';
  // Important : quand secret=true, les montants réels ne sont JAMAIS écrits dans le HTML
  // (pas de flou CSS sur la vraie valeur) — inspecter le code source ne révèle rien.
  const maskNum = `<div class="num masked-num">🔒 ••••••</div>`;
  const maskPanel = `<div class="hint" style="text-align:center;padding:40px 10px;">🔒 Répartition masquée pour ce profil<div class="mask-badge" style="margin-top:8px;">Réservé à la Direction / Fondation</div></div>`;

  return `
    <div class="section-note">💰 Vue financière consolidée : scolarité, activités extra-scolaires, boutique, salaires et charges. Toutes les données sont générées automatiquement à partir des paiements enregistrés dans les autres onglets.</div>
    ${secret ? `<div class="section-note" style="background:var(--amber-bg);color:var(--amber);">🔒 Les montants globaux (recettes, dépenses, résultat net et répartitions) sont masqués pour le profil Secrétariat. Vous pouvez toujours enregistrer les paiements et consulter le détail par élève.</div>` : ''}
    <div class="filters">
      <select onchange="ui.filters.comptaPeriode=this.value; renderView('comptabilite')">
        <option value="all" ${periode==='all'?'selected':''}>Toute la période</option>
        ${lastNMonths(6).map(m=>`<option value="${m}" ${periode===m?'selected':''}>${moisLabel(m)}</option>`).join('')}
      </select>
    </div>
    <div class="cards">
      <div class="card"><div class="card-top"><div class="icon-badge" style="background:var(--green-bg);">📥</div></div>${secret ? maskNum : `<div class="num amount in">${fmtFCFA(totalRecettes)}</div>`}<div class="label">Recettes</div></div>
      <div class="card"><div class="card-top"><div class="icon-badge" style="background:var(--red-bg);">📤</div></div>${secret ? maskNum : `<div class="num amount out">${fmtFCFA(totalDepenses)}</div>`}<div class="label">Dépenses</div></div>
      <div class="card"><div class="card-top"><div class="icon-badge" style="background:${resultat>=0?'var(--green-bg)':'var(--red-bg)'};">${resultat>=0?'📈':'📉'}</div></div>${secret ? maskNum : `<div class="num" style="color:${resultat>=0?'var(--green)':'var(--red)'};">${fmtFCFA(resultat)}</div>`}<div class="label">Résultat net</div></div>
      <div class="card"><div class="card-top"><div class="icon-badge" style="background:var(--blue-bg);">🎓</div></div><div class="num">${tauxRecouvrement}%</div><div class="label">Taux de recouvrement scolarité</div></div>
    </div>
    <div class="grid-2">
      <div class="panel"><div class="panel-head"><div><h2>Recettes par source</h2></div></div>${secret ? maskPanel : recBars}</div>
      <div class="panel"><div class="panel-head"><div><h2>Dépenses par catégorie</h2></div></div>${secret ? maskPanel : depBars}</div>
    </div>
    <div class="grid-2">
      <div class="panel"><div class="panel-head"><div><h2>Élèves en impayé</h2><div class="sub">Solde de scolarité dû, tous trimestres confondus</div></div></div>${impayesHtml}</div>
      <div class="panel"><div class="panel-head"><div><h2>Dernières transactions</h2></div></div><div class="txn-list">${txnsHtml}</div></div>
    </div>`;
}

/* --- 12.2 Scolarité --- */
function renderComptaScolarite(){
  if(DB.classes.length === 0){
    return `<div class="panel"><div class="empty-state"><div class="em-ic">🎓</div>Aucune classe configurée pour le moment. Activez au moins un niveau scolaire dans <strong>Paramètres</strong> pour commencer à suivre la scolarité.</div></div>`;
  }
  const classeId = ui.filters.comptaClasse || DB.classes[0].id;
  ui.filters.comptaClasse = classeId;
  const eleves = DB.eleves.filter(e=>e.classeId===classeId && e.statut==='Actif').sort((a,b)=>a.nom.localeCompare(b.nom));
  const echeances = (DB.echeancesScolarite||[]).slice().sort((a,b)=>(a.ordre-b.ordre)||(a.dateEcheance||'').localeCompare(b.dateEcheance||''));
  const grilleActive = echeances.length > 0;

  const du = DB.fraisScolarite[classeId] || 0;
  let totalDu=0, totalPaye=0;

  const rows = eleves.map(e=>{
    if(grilleActive){
      const info = scolariteEleveParEcheance(e.id);
      totalDu += info.total; totalPaye += info.totalPaye;
      const cellules = info.detail.map(d=>{
        const cls = d.statut==='paye' ? 'green' : d.statut==='partiel' ? 'amber' : 'red';
        const contenu = d.statut==='paye'
          ? `<span class="badge ${cls}">✓ ${fmtFCFA(d.paye)}</span>`
          : d.statut==='partiel'
            ? `<span class="badge ${cls}" style="cursor:pointer;" onclick="openPaiementScolariteForm('${e.id}','${escapeHtml(d.label).replace(/'/g,"\\'")}')">${fmtFCFA(d.paye)} / ${fmtFCFA(d.montant)}</span>`
            : `<button class="icon-btn" title="Enregistrer ce versement" onclick="openPaiementScolariteForm('${e.id}','${escapeHtml(d.label).replace(/'/g,"\\'")}')">➕</button>`;
        return `<td style="text-align:center;">${contenu}</td>`;
      }).join('');
      return `<tr>
        <td><div class="row-name"><span class="avatar">${initials(e.prenom,e.nom)}</span>${escapeHtml(eleveFullName(e))}</div></td>
        ${cellules}
        <td class="amount" style="font-weight:800;">${fmtFCFA(info.total)}</td>
        <td class="amount ${info.reste>0?'out':''}" style="font-weight:800;">${fmtFCFA(info.reste)}</td>
        <td style="white-space:nowrap;">
          <button class="icon-btn" title="Historique" onclick="voirHistoriqueScolarite('${e.id}')">🧾</button>
        </td>
      </tr>`;
    }
    const info = scolariteEleveInfo(e.id);
    totalDu += info.du; totalPaye += info.paye;
    const bc = info.statut==='Soldé'?'green':info.statut==='Partiel'?'amber':'red';
    return `<tr>
      <td><div class="row-name"><span class="avatar">${initials(e.prenom,e.nom)}</span>${escapeHtml(eleveFullName(e))}</div></td>
      <td>${fmtFCFA(info.du)}</td>
      <td class="amount in">${fmtFCFA(info.paye)}</td>
      <td class="amount ${info.solde>0?'out':''}">${fmtFCFA(info.solde)}</td>
      <td><span class="badge ${bc}">${info.statut}</span></td>
      <td style="white-space:nowrap;">
        <button class="btn sm" onclick="openPaiementScolariteForm('${e.id}')">+ Paiement</button>
        <button class="icon-btn" title="Historique" onclick="voirHistoriqueScolarite('${e.id}')">🧾</button>
      </td>
    </tr>`;
  }).join('');
  const tauxClasse = totalDu ? Math.round(100*totalPaye/totalDu) : 0;

  const theadHtml = grilleActive
    ? `<tr><th>Élève</th>${echeances.map(ech=>`<th style="text-align:center;">${escapeHtml(ech.label)}<div class="hint" style="font-weight:400;">${fmtFCFA(ech.montant)}</div></th>`).join('')}<th>TOTAL</th><th>RESTE</th><th>Actions</th></tr>`
    : `<tr><th>Élève</th><th>Dû (annuel)</th><th>Payé</th><th>Solde</th><th>Statut</th><th>Actions</th></tr>`;

  return `
    <div class="panel">
      <div class="panel-head">
        <div><h2>État de la scolarité par classe</h2><div class="sub">${grilleActive ? `Recouvré : ${tauxClasse}% (${fmtFCFA(totalPaye)} / ${fmtFCFA(totalDu)})` : `Frais annuel : ${fmtFCFA(du)} · Recouvré : ${tauxClasse}% (${fmtFCFA(totalPaye)} / ${fmtFCFA(totalDu)})`}</div></div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;">
          <select onchange="ui.filters.comptaClasse=this.value; renderView('comptabilite')">
            ${DB.classes.map(c=>`<option value="${c.id}" ${classeId===c.id?'selected':''}>${c.nom}</option>`).join('')}
          </select>
          <button class="btn secondary" onclick="renderView('parametres')" title="Gérer les échéances (Frais d'inscription, versements...) depuis Paramètres">🎓 Échéances</button>
          ${grilleActive ? '' : `<button class="btn secondary" onclick="openFraisScolariteForm()">⚙️ Configurer les frais</button>`}
        </div>
      </div>
      ${grilleActive ? `<div class="section-note">💡 Grille par échéance active — configurée dans Paramètres → Échéances de scolarité. Cliquez ➕ pour enregistrer un versement précis.</div>` : ''}
      <div class="progress" style="margin-bottom:16px;"><div style="width:${tauxClasse}%;background:${tauxClasse>=80?'var(--green)':tauxClasse>=50?'var(--amber)':'var(--red)'};"></div></div>
      ${eleves.length===0 ? `<div class="empty-state"><div class="em-ic">🎓</div>Aucun élève actif dans cette classe.</div>` : `
      <div class="table-wrap"><table>
        <thead>${theadHtml}</thead>
        <tbody>${rows}</tbody>
      </table></div>`}
    </div>`;
}

function optionsEcheancesScolarite(selectedLabel){
  if((DB.echeancesScolarite||[]).length){
    return DB.echeancesScolarite.map(e=>`<option value="${escapeHtml(e.label)}" data-montant="${e.montant}" ${selectedLabel===e.label?'selected':''}>${escapeHtml(e.label)} — ${fmtFCFA(e.montant)}</option>`).join('');
  }
  return TRANCHES_SCOLARITE.map(t=>`<option ${selectedLabel===t?'selected':''}>${t}</option>`).join('');
}
function openPaiementScolariteForm(eleveId, trancheLabel){
  const e = eleveById(eleveId);
  const info = scolariteEleveInfo(eleveId);
  const grille = scolariteEleveParEcheance(eleveId);
  // Si on cible une échéance précise (clic sur une case de la grille), on
  // pré-remplit avec le reste exact dû sur CETTE échéance, pas le solde global.
  const echCible = trancheLabel ? grille.detail.find(d=>d.label===trancheLabel) : null;
  const montantDefaut = echCible ? Math.max(0, echCible.montant - echCible.paye) : (Math.min(info.solde,info.du)||10000);
  openModal(`Paiement scolarité — ${eleveFullName(e)}`, `
    <div class="section-note">${echCible ? `${escapeHtml(echCible.label)} : reste <strong>${fmtFCFA(montantDefaut)}</strong> sur ${fmtFCFA(echCible.montant)}` : `Solde restant dû : <strong>${fmtFCFA(info.solde)}</strong> sur ${fmtFCFA(info.du)}`}</div>
    <form onsubmit="return handleSavePaiementScolarite(event,'${eleveId}')">
      <div class="form-grid">
        <div class="field"><label>Montant (${DEVISE})</label><input type="number" id="paiementMontant" name="montant" min="500" step="500" required value="${montantDefaut}"></div>
        <div class="field"><label>Échéance / Tranche</label><select name="tranche" onchange="const o=this.selectedOptions[0]; if(o && o.dataset.montant) document.getElementById('paiementMontant').value = o.dataset.montant;">${optionsEcheancesScolarite(trancheLabel)}</select></div>
        <div class="field"><label>Date</label><input type="date" name="date" value="${todayISO()}"></div>
        <div class="field"><label>Mode de paiement</label><select name="modePaiement">${MODES_PAIEMENT.map(m=>`<option>${m}</option>`).join('')}</select></div>
      </div>
      <div class="form-actions"><button type="button" class="btn secondary" onclick="closeModal()">Annuler</button><button type="submit" class="btn">Enregistrer</button></div>
    </form>`);
}
async function handleSavePaiementScolarite(ev, eleveId){
  ev.preventDefault();
  const fd = new FormData(ev.target);
  const patch = {eleveId, montant: Math.max(0, parseInt(fd.get('montant'))||0), tranche: fd.get('tranche'), date: fd.get('date')||todayISO(), modePaiement: fd.get('modePaiement')};
  try{
    const rec = await dbInsert('paiements_scolarite', patch);
    DB.paiementsScolarite.push(rec);
    journaliserCompta('paiements_scolarite', rec.id, 'creation', null, rec);
    toast('Paiement enregistré');
    renderView('comptabilite');
    const e = eleveById(eleveId);
    openRecu({type:'entree', refId:rec.id, montant:rec.montant, date:rec.date, modePaiement:rec.modePaiement, objet:`Scolarité — ${rec.tranche}`, personne: eleveFullName(e), sousInfo: `${classeName(e.classeId)} · Matricule ${e.matricule}`});
  }catch(e){ alert('Erreur : ' + e.message); }
  return false;
}
function voirHistoriqueScolarite(eleveId){
  const e = eleveById(eleveId);
  const paiements = DB.paiementsScolarite.filter(p=>p.eleveId===eleveId).sort((a,b)=>b.date.localeCompare(a.date));
  const rows = paiements.map(p=>`<tr><td>${fmtDate(p.date)}</td><td>${p.tranche}</td><td class="amount in">${fmtFCFA(p.montant)}</td><td>${p.modePaiement}</td>
    <td style="white-space:nowrap;"><button class="icon-btn" title="Reçu" onclick="openRecu({type:'entree', refId:'${p.id}', montant:${p.montant}, date:'${p.date}', modePaiement:'${p.modePaiement}', objet:'Scolarité — ${p.tranche}', personne:'${escapeHtml(eleveFullName(e))}', sousInfo:'${escapeHtml(classeName(e.classeId))}'})">🧾</button>
    <button class="icon-btn" title="Modifier" onclick="openModifierPaiementScolariteForm('${p.id}')">✏️</button>
    <button class="icon-btn danger" title="Supprimer" onclick="deletePaiementScolarite('${p.id}','${eleveId}')">🗑️</button></td></tr>`).join('');
  openModal(`Historique scolarité — ${eleveFullName(e)}`, `
    <div class="table-wrap"><table><thead><tr><th>Date</th><th>Tranche</th><th>Montant</th><th>Mode</th><th></th></tr></thead>
    <tbody>${rows || '<tr><td colspan="5" class="hint">Aucun paiement enregistré</td></tr>'}</tbody></table></div>`);
}
function openModifierPaiementScolariteForm(paiementId){
  const p = DB.paiementsScolarite.find(x=>x.id===paiementId);
  if(!p) return;
  openModal('Modifier le paiement', `
    <div class="section-note">✏️ La correction sera enregistrée dans le Journal d'audit, avec le montant avant/après.</div>
    <form onsubmit="return handleModifierPaiementScolarite(event,'${paiementId}')">
      <div class="form-grid">
        <div class="field"><label>Montant (${DEVISE})</label><input type="number" name="montant" min="500" step="500" required value="${p.montant}"></div>
        <div class="field"><label>Échéance / Tranche</label><select name="tranche">${optionsEcheancesScolarite(p.tranche)}</select></div>
        <div class="field"><label>Date</label><input type="date" name="date" value="${p.date}"></div>
        <div class="field"><label>Mode de paiement</label><select name="modePaiement">${MODES_PAIEMENT.map(m=>`<option ${p.modePaiement===m?'selected':''}>${m}</option>`).join('')}</select></div>
      </div>
      <div class="form-actions"><button type="button" class="btn secondary" onclick="closeModal()">Annuler</button><button type="submit" class="btn">Enregistrer la correction</button></div>
    </form>`);
}
async function handleModifierPaiementScolarite(ev, paiementId){
  ev.preventDefault();
  const fd = new FormData(ev.target);
  const eleveId = DB.paiementsScolarite.find(x=>x.id===paiementId)?.eleveId;
  const patch = {montant: Math.max(0, parseInt(fd.get('montant'))||0), tranche: fd.get('tranche'), date: fd.get('date')||todayISO(), modePaiement: fd.get('modePaiement')};
  try{
    const avant = DB.paiementsScolarite.find(x=>x.id===paiementId);
    await dbUpdate('paiements_scolarite', paiementId, patch);
    const idx = DB.paiementsScolarite.findIndex(x=>x.id===paiementId);
    const apres = {...avant, ...patch};
    DB.paiementsScolarite[idx] = apres;
    journaliserCompta('paiements_scolarite', paiementId, 'modification', avant, apres);
    toast('Paiement corrigé');
    voirHistoriqueScolarite(eleveId);
    renderView('comptabilite');
  }catch(e){ alert('Erreur : ' + e.message); }
  return false;
}
async function deletePaiementScolarite(id, eleveId){
  if(!confirm('Supprimer ce paiement ?')) return;
  try{
    const avant = DB.paiementsScolarite.find(p=>p.id===id) || null;
    await dbDelete('paiements_scolarite', id);
    DB.paiementsScolarite = DB.paiementsScolarite.filter(p=>p.id!==id);
    journaliserCompta('paiements_scolarite', id, 'suppression', avant, null);
    toast('Paiement supprimé');
    voirHistoriqueScolarite(eleveId);
    renderView('comptabilite');
  }catch(e){ alert('Erreur : ' + e.message); }
}
function openFraisScolariteForm(){
  openModal('Configurer les frais de scolarité', `
    <form onsubmit="return handleSaveFraisScolarite(event)">
      <div class="form-grid">
        ${DB.classes.map(c=>`<div class="field"><label>${c.nom}</label><input type="number" name="frais_${c.id}" min="0" step="1000" value="${DB.fraisScolarite[c.id]||0}"></div>`).join('')}
      </div>
      <div class="hint">Montant annuel en ${DEVISE} par classe.</div>
      <div class="form-actions"><button type="button" class="btn secondary" onclick="closeModal()">Annuler</button><button type="submit" class="btn">Enregistrer</button></div>
    </form>`);
}
async function handleSaveFraisScolarite(ev){
  ev.preventDefault();
  const fd = new FormData(ev.target);
  try{
    for(const c of DB.classes){
      const montant = Math.max(0, parseInt(fd.get(`frais_${c.id}`))||0);
      await dbUpdate('classes', c.id, {fraisScolarite: montant});
      DB.fraisScolarite[c.id] = montant;
    }
    closeModal(); toast('Frais de scolarité mis à jour');
    renderView('comptabilite');
  }catch(e){ alert('Erreur : ' + e.message); }
  return false;
}

/* --- 12.3 Activités extra-scolaires --- */
function renderComptaActivites(){
  const actId = ui.filters.comptaActivite || (DB.activites[0] && DB.activites[0].id) || '';
  ui.filters.comptaActivite = actId;

  const catalogRows = DB.activites.map(a=>{
    const nb = DB.inscriptionsActivites.filter(i=>i.activiteId===a.id).length;
    return `<tr><td>${escapeHtml(a.nom)}</td><td>${fmtFCFA(a.montantCotisation)}</td><td>${a.periode}</td><td>${nb}</td>
      <td><button class="icon-btn" onclick="openActiviteForm('${a.id}')">✏️</button><button class="icon-btn danger" onclick="deleteActivite('${a.id}')">🗑️</button></td></tr>`;
  }).join('');

  let inscritsPanel = '';
  if(actId){
    const act = DB.activites.find(a=>a.id===actId);
    const inscriptions = DB.inscriptionsActivites.filter(i=>i.activiteId===actId);
    const eleveIdsInscrits = inscriptions.map(i=>i.eleveId);
    const rows = inscriptions.map(insc=>{
      const e = eleveById(insc.eleveId);
      if(!e) return '';
      const paye = DB.paiementsCotisations.filter(p=>p.eleveId===e.id && p.activiteId===actId).reduce((s,p)=>s+p.montant,0);
      const solde = Math.max(0, act.montantCotisation-paye);
      const statut = paye>=act.montantCotisation ? 'Soldé' : paye>0 ? 'Partiel' : 'Impayé';
      const bc = statut==='Soldé'?'green':statut==='Partiel'?'amber':'red';
      return `<tr>
        <td><div class="row-name"><span class="avatar">${initials(e.prenom,e.nom)}</span>${escapeHtml(eleveFullName(e))}</div></td>
        <td><span class="badge blue">${classeName(e.classeId)}</span></td>
        <td class="amount in">${fmtFCFA(paye)}</td>
        <td class="amount ${solde>0?'out':''}">${fmtFCFA(solde)}</td>
        <td><span class="badge ${bc}">${statut}</span></td>
        <td style="white-space:nowrap;"><button class="btn sm" onclick="openPaiementCotisationForm('${e.id}','${actId}')">+ Paiement</button> <button class="icon-btn danger" title="Désinscrire" onclick="desinscrireActivite('${insc.id}')">✕</button></td>
      </tr>`;
    }).join('');
    inscritsPanel = `
    <div class="panel">
      <div class="panel-head">
        <div><h2>Inscrits — ${escapeHtml(act.nom)}</h2><div class="sub">Cotisation : ${fmtFCFA(act.montantCotisation)} / ${act.periode}</div></div>
        <button class="btn" onclick="openInscriptionActiviteForm('${actId}')">+ Inscrire un élève</button>
      </div>
      ${inscriptions.length===0 ? `<div class="empty-state"><div class="em-ic">🎨</div>Aucun élève inscrit à cette activité.</div>` : `
      <div class="table-wrap"><table>
        <thead><tr><th>Élève</th><th>Classe</th><th>Payé</th><th>Solde</th><th>Statut</th><th>Actions</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>`}
    </div>`;
  }

  return `
    <div class="panel">
      <div class="panel-head"><div><h2>Catalogue des activités extra-scolaires</h2><div class="sub">${DB.activites.length} activité(s)</div></div><button class="btn" onclick="openActiviteForm()">+ Nouvelle activité</button></div>
      ${DB.activites.length===0 ? `<div class="empty-state"><div class="em-ic">🎨</div>Aucune activité créée.</div>` : `
      <div class="table-wrap"><table><thead><tr><th>Activité</th><th>Cotisation</th><th>Périodicité</th><th>Inscrits</th><th>Actions</th></tr></thead><tbody>${catalogRows}</tbody></table></div>`}
    </div>
    ${DB.activites.length>0 ? `
    <div class="filters"><select onchange="ui.filters.comptaActivite=this.value; renderView('comptabilite')">${DB.activites.map(a=>`<option value="${a.id}" ${actId===a.id?'selected':''}>${a.nom}</option>`).join('')}</select></div>
    ${inscritsPanel}` : ''}`;
}

function openActiviteForm(id){
  const a = id ? DB.activites.find(x=>x.id===id) : null;
  openModal(a ? "Modifier l'activité" : 'Nouvelle activité', `
    <form onsubmit="return handleSaveActivite(event,'${id||''}')">
      <div class="form-grid">
        <div class="field span2"><label>Nom de l'activité</label><input name="nom" required value="${a?escapeHtml(a.nom):''}"></div>
        <div class="field"><label>Cotisation (${DEVISE})</label><input type="number" name="montantCotisation" min="0" step="500" required value="${a?a.montantCotisation:10000}"></div>
        <div class="field"><label>Périodicité</label>
          <select name="periode"><option ${a?.periode==='Mensuel'?'selected':''}>Mensuel</option><option ${!a||a?.periode==='Trimestriel'?'selected':''}>Trimestriel</option><option ${a?.periode==='Annuel'?'selected':''}>Annuel</option></select>
        </div>
      </div>
      <div class="form-actions"><button type="button" class="btn secondary" onclick="closeModal()">Annuler</button><button type="submit" class="btn">Enregistrer</button></div>
    </form>`);
}
async function handleSaveActivite(ev, id){
  ev.preventDefault();
  const fd = new FormData(ev.target);
  const patch = {nom: fd.get('nom').trim(), montantCotisation: Math.max(0,parseInt(fd.get('montantCotisation'))||0), periode: fd.get('periode')};
  try{
    let finalId = id;
    if(id){
      await dbUpdate('activites', id, patch);
      const idx = DB.activites.findIndex(a=>a.id===id);
      DB.activites[idx] = {id, ...patch};
    } else {
      const rec = await dbInsert('activites', patch);
      DB.activites.push(rec);
      finalId = rec.id;
    }
    closeModal(); toast('Activité enregistrée');
    ui.filters.comptaActivite = finalId;
    renderView('comptabilite');
  }catch(e){ alert('Erreur : ' + e.message); }
  return false;
}
async function deleteActivite(id){
  if(!confirm('Supprimer cette activité ? Les inscriptions et paiements liés seront également supprimés.')) return;
  try{
    await dbDelete('activites', id);
    DB.activites = DB.activites.filter(a=>a.id!==id);
    DB.inscriptionsActivites = DB.inscriptionsActivites.filter(i=>i.activiteId!==id);
    DB.paiementsCotisations = DB.paiementsCotisations.filter(p=>p.activiteId!==id);
    if(ui.filters.comptaActivite===id) ui.filters.comptaActivite = '';
    toast('Activité supprimée');
    renderView('comptabilite');
  }catch(e){ alert('Erreur : ' + e.message); }
}
function openInscriptionActiviteForm(activiteId){
  const inscritIds = DB.inscriptionsActivites.filter(i=>i.activiteId===activiteId).map(i=>i.eleveId);
  const dispo = DB.eleves.filter(e=>e.statut==='Actif' && !inscritIds.includes(e.id)).sort((a,b)=>a.nom.localeCompare(b.nom));
  openModal('Inscrire un élève', `
    <form onsubmit="return handleSaveInscriptionActivite(event,'${activiteId}')">
      <div class="form-grid single">
        <div class="field"><label>Élève</label>
          <select name="eleveId" required>${dispo.map(e=>`<option value="${e.id}">${eleveFullName(e)} — ${classeName(e.classeId)}</option>`).join('')}</select>
        </div>
      </div>
      ${dispo.length===0 ? `<div class="hint">Tous les élèves actifs sont déjà inscrits à cette activité.</div>` : ''}
      <div class="form-actions"><button type="button" class="btn secondary" onclick="closeModal()">Annuler</button><button type="submit" class="btn" ${dispo.length===0?'disabled':''}>Inscrire</button></div>
    </form>`);
}
async function handleSaveInscriptionActivite(ev, activiteId){
  ev.preventDefault();
  const fd = new FormData(ev.target);
  try{
    DB.inscriptionsActivites.push(await dbInsert('inscriptions_activites', {eleveId: fd.get('eleveId'), activiteId, dateInscription: todayISO()}));
    closeModal(); toast('Élève inscrit');
    renderView('comptabilite');
  }catch(e){ alert('Erreur : ' + e.message); }
  return false;
}
async function desinscrireActivite(inscriptionId){
  const insc = DB.inscriptionsActivites.find(i=>i.id===inscriptionId);
  if(!insc) return;
  if(!confirm('Désinscrire cet élève de l\'activité ? Son historique de paiement pour cette activité sera supprimé.')) return;
  try{
    await dbDeleteWhere('paiements_cotisations', {eleveId: insc.eleveId, activiteId: insc.activiteId});
    await dbDelete('inscriptions_activites', inscriptionId);
    DB.paiementsCotisations = DB.paiementsCotisations.filter(p=>!(p.eleveId===insc.eleveId && p.activiteId===insc.activiteId));
    DB.inscriptionsActivites = DB.inscriptionsActivites.filter(i=>i.id!==inscriptionId);
    toast('Élève désinscrit');
    renderView('comptabilite');
  }catch(e){ alert('Erreur : ' + e.message); }
}
function openPaiementCotisationForm(eleveId, activiteId){
  const e = eleveById(eleveId);
  const act = DB.activites.find(a=>a.id===activiteId);
  const paye = DB.paiementsCotisations.filter(p=>p.eleveId===eleveId && p.activiteId===activiteId).reduce((s,p)=>s+p.montant,0);
  const solde = Math.max(0, act.montantCotisation-paye);
  openModal(`Paiement — ${act.nom}`, `
    <div class="section-note">${eleveFullName(e)} · Solde restant dû : <strong>${fmtFCFA(solde)}</strong></div>
    <form onsubmit="return handleSavePaiementCotisation(event,'${eleveId}','${activiteId}')">
      <div class="form-grid">
        <div class="field"><label>Montant (${DEVISE})</label><input type="number" name="montant" min="500" step="500" required value="${solde||act.montantCotisation}"></div>
        <div class="field"><label>Date</label><input type="date" name="date" value="${todayISO()}"></div>
        <div class="field span2"><label>Mode de paiement</label><select name="modePaiement">${MODES_PAIEMENT.map(m=>`<option>${m}</option>`).join('')}</select></div>
      </div>
      <div class="form-actions"><button type="button" class="btn secondary" onclick="closeModal()">Annuler</button><button type="submit" class="btn">Enregistrer</button></div>
    </form>`);
}
async function handleSavePaiementCotisation(ev, eleveId, activiteId){
  ev.preventDefault();
  const fd = new FormData(ev.target);
  const patch = {eleveId, activiteId, montant: Math.max(0,parseInt(fd.get('montant'))||0), date: fd.get('date')||todayISO(), modePaiement: fd.get('modePaiement')};
  try{
    const rec = await dbInsert('paiements_cotisations', patch);
    DB.paiementsCotisations.push(rec);
    toast('Paiement enregistré');
    renderView('comptabilite');
    const e = eleveById(eleveId);
    const act = DB.activites.find(a=>a.id===activiteId);
    openRecu({type:'entree', refId:rec.id, montant:rec.montant, date:rec.date, modePaiement:rec.modePaiement, objet:`Cotisation — ${act?act.nom:''}`, personne: eleveFullName(e), sousInfo: classeName(e.classeId)});
  }catch(e){ alert('Erreur : ' + e.message); }
  return false;
}

/* --- 12.4 Boutique scolaire (ventes de gadgets) --- */
function renderComptaVentes(){
  const catalogRows = DB.gadgets.map(g=>{
    const sb = g.stock<=5 ? 'red' : g.stock<=15 ? 'amber' : 'green';
    return `<tr><td>${escapeHtml(g.nom)}</td><td>${fmtFCFA(g.prixUnitaire)}</td><td><span class="badge ${sb}">${g.stock} en stock</span></td>
      <td><button class="icon-btn" onclick="openGadgetForm('${g.id}')">✏️</button><button class="icon-btn danger" onclick="deleteGadget('${g.id}')">🗑️</button></td></tr>`;
  }).join('');

  const ventes = DB.ventesGadgets.slice().sort((a,b)=>b.date.localeCompare(a.date));
  const totalMois = ventes.filter(v=>v.date.slice(0,7)===thisMonthISO()).reduce((s,v)=>s+v.montantTotal,0);
  const ventesRows = ventes.slice(0,20).map(v=>{
    const g = DB.gadgets.find(x=>x.id===v.gadgetId);
    const e = v.eleveId ? eleveById(v.eleveId) : null;
    return `<tr><td>${fmtDate(v.date)}</td><td>${escapeHtml(g?g.nom:'—')}</td><td>${v.quantite}</td><td>${e?escapeHtml(eleveFullName(e)):'<span class="hint">Vente comptoir</span>'}</td><td class="amount in">${fmtFCFA(v.montantTotal)}</td><td>${v.modePaiement}</td>
      <td><button class="icon-btn" title="Reçu" onclick="openRecu({type:'entree', refId:'${v.id}', montant:${v.montantTotal}, date:'${v.date}', modePaiement:'${v.modePaiement}', objet:'Boutique — ${g?escapeHtml(g.nom):''} ×${v.quantite}', personne:'${e?escapeHtml(eleveFullName(e)):'Vente comptoir'}', sousInfo:''})">🧾</button></td></tr>`;
  }).join('');

  return `
    <div class="cards">
      <div class="card"><div class="num amount in">${fmtFCFA(totalMois)}</div><div class="label">Ventes — ${moisLabel(thisMonthISO())}</div></div>
      <div class="card"><div class="num">${DB.gadgets.reduce((s,g)=>s+g.stock,0)}</div><div class="label">Articles en stock</div></div>
      <div class="card"><div class="num">${DB.gadgets.filter(g=>g.stock<=5).length}</div><div class="label">Références en rupture proche</div></div>
    </div>
    <div class="grid-2">
      <div class="panel">
        <div class="panel-head"><div><h2>Catalogue boutique</h2><div class="sub">${DB.gadgets.length} article(s)</div></div><button class="btn secondary sm" onclick="openGadgetForm()">+ Article</button></div>
        ${DB.gadgets.length===0 ? `<div class="empty-state"><div class="em-ic">🛍️</div>Aucun article dans le catalogue.</div>` : `
        <div class="table-wrap"><table><thead><tr><th>Article</th><th>Prix</th><th>Stock</th><th>Actions</th></tr></thead><tbody>${catalogRows}</tbody></table></div>`}
      </div>
      <div class="panel">
        <div class="panel-head"><div><h2>Nouvelle vente</h2></div></div>
        ${DB.gadgets.length===0 ? `<div class="hint">Ajoutez un article au catalogue pour enregistrer une vente.</div>` : `
        <form onsubmit="return handleSaveVente(event)">
          <div class="form-grid single">
            <div class="field"><label>Article</label><select name="gadgetId" required>${DB.gadgets.map(g=>`<option value="${g.id}">${escapeHtml(g.nom)} — ${fmtFCFA(g.prixUnitaire)} (stock: ${g.stock})</option>`).join('')}</select></div>
            <div class="field"><label>Quantité</label><input type="number" name="quantite" min="1" value="1" required></div>
            <div class="field"><label>Élève (optionnel)</label>
              <select name="eleveId"><option value="">— Vente comptoir —</option>${DB.eleves.filter(e=>e.statut==='Actif').sort((a,b)=>a.nom.localeCompare(b.nom)).map(e=>`<option value="${e.id}">${eleveFullName(e)} — ${classeName(e.classeId)}</option>`).join('')}</select>
            </div>
            <div class="field"><label>Mode de paiement</label><select name="modePaiement">${MODES_PAIEMENT.map(m=>`<option>${m}</option>`).join('')}</select></div>
          </div>
          <div class="form-actions"><button type="submit" class="btn">💰 Enregistrer la vente</button></div>
        </form>`}
      </div>
    </div>
    <div class="panel">
      <div class="panel-head"><div><h2>Historique des ventes</h2><div class="sub">20 dernières transactions</div></div></div>
      <div class="table-wrap"><table><thead><tr><th>Date</th><th>Article</th><th>Qté</th><th>Client</th><th>Montant</th><th>Mode</th><th></th></tr></thead>
      <tbody>${ventesRows || '<tr><td colspan="7" class="hint">Aucune vente enregistrée</td></tr>'}</tbody></table></div>
    </div>`;
}
function openGadgetForm(id){
  const g = id ? DB.gadgets.find(x=>x.id===id) : null;
  openModal(g ? "Modifier l'article" : 'Nouvel article', `
    <form onsubmit="return handleSaveGadget(event,'${id||''}')">
      <div class="form-grid">
        <div class="field span2"><label>Nom de l'article</label><input name="nom" required value="${g?escapeHtml(g.nom):''}"></div>
        <div class="field"><label>Prix unitaire (${DEVISE})</label><input type="number" name="prixUnitaire" min="0" step="100" required value="${g?g.prixUnitaire:1000}"></div>
        <div class="field"><label>Stock disponible</label><input type="number" name="stock" min="0" required value="${g?g.stock:10}"></div>
      </div>
      <div class="form-actions"><button type="button" class="btn secondary" onclick="closeModal()">Annuler</button><button type="submit" class="btn">Enregistrer</button></div>
    </form>`);
}
async function handleSaveGadget(ev, id){
  ev.preventDefault();
  const fd = new FormData(ev.target);
  const patch = {nom:fd.get('nom').trim(), prixUnitaire:Math.max(0,parseInt(fd.get('prixUnitaire'))||0), stock:Math.max(0,parseInt(fd.get('stock'))||0)};
  try{
    if(id){
      await dbUpdate('gadgets', id, patch);
      const idx = DB.gadgets.findIndex(g=>g.id===id);
      DB.gadgets[idx] = {id, ...patch};
    } else {
      DB.gadgets.push(await dbInsert('gadgets', patch));
    }
    closeModal(); toast('Article enregistré');
    renderView('comptabilite');
  }catch(e){ alert('Erreur : ' + e.message); }
  return false;
}
async function deleteGadget(id){
  if(!confirm('Supprimer cet article du catalogue ?')) return;
  try{
    await dbDelete('gadgets', id);
    DB.gadgets = DB.gadgets.filter(g=>g.id!==id);
    toast('Article supprimé');
    renderView('comptabilite');
  }catch(e){ alert('Erreur : ' + e.message); }
}
async function handleSaveVente(ev){
  ev.preventDefault();
  const fd = new FormData(ev.target);
  const gadget = DB.gadgets.find(g=>g.id===fd.get('gadgetId'));
  const quantite = Math.max(1, parseInt(fd.get('quantite'))||1);
  if(!gadget || quantite>gadget.stock){ alert(`Stock insuffisant (disponible : ${gadget?gadget.stock:0}).`); return false; }
  const nouveauStock = gadget.stock - quantite;
  const patch = {gadgetId:gadget.id, eleveId: fd.get('eleveId')||null, quantite, montantTotal: gadget.prixUnitaire*quantite, date: todayISO(), modePaiement: fd.get('modePaiement')};
  try{
    await dbUpdate('gadgets', gadget.id, {stock: nouveauStock});
    gadget.stock = nouveauStock;
    const rec = await dbInsert('ventes_gadgets', patch);
    DB.ventesGadgets.push(rec);
    toast('Vente enregistrée');
    renderView('comptabilite');
    const e = rec.eleveId ? eleveById(rec.eleveId) : null;
    openRecu({type:'entree', refId:rec.id, montant:rec.montantTotal, date:rec.date, modePaiement:rec.modePaiement, objet:`Boutique — ${gadget.nom} ×${quantite}`, personne: e ? eleveFullName(e) : 'Vente comptoir', sousInfo: e ? classeName(e.classeId) : ''});
  }catch(e){ alert('Erreur : ' + e.message); }
  return false;
}

/* --- 12.5 Salaires --- */
function renderComptaSalaires(){
  const mois = ui.filters.comptaMois || thisMonthISO();
  ui.filters.comptaMois = mois;

  const personnel = [
    ...DB.enseignants.filter(t=>t.statut==='Actif').map(t=>({id:t.id, type:'enseignant', nom:ensFullName(t), poste:`Enseignant — ${classeName(t.classesAssignees[0])}`, salaire:t.salaireMensuel||0})),
    ...DB.personnelAutre.filter(p=>p.statut==='Actif').map(p=>({id:p.id, type:'autre', nom:`${p.prenom} ${p.nom}`, poste:p.poste, salaire:p.salaireMensuel||0})),
  ].sort((a,b)=>a.nom.localeCompare(b.nom));

  let masseSalariale=0, totalPaye=0;
  const rows = personnel.map(p=>{
    masseSalariale += p.salaire;
    const paiement = DB.paiementsSalaires.find(x=>x.personnelId===p.id && x.personnelType===p.type && x.mois===mois);
    if(paiement) totalPaye += paiement.montant;
    return `<tr>
      <td>${escapeHtml(p.nom)}</td><td>${escapeHtml(p.poste)}</td><td>${fmtFCFA(p.salaire)}</td>
      <td>${paiement ? `<span class="badge green">Payé le ${fmtDate(paiement.datePaiement)}</span>` : `<span class="badge red">En attente</span>`}</td>
      <td style="white-space:nowrap;">
        ${paiement ? `<button class="icon-btn" title="Reçu" onclick="reimprimerRecuSalaire('${paiement.id}')">🧾</button><button class="icon-btn" title="Modifier" onclick="openModifierPaiementSalaireForm('${paiement.id}')">✏️</button><button class="icon-btn danger" title="Annuler le paiement" onclick="annulerPaiementSalaire('${paiement.id}')">✕</button>`
                    : `<button class="btn sm" onclick="payerSalaire('${p.id}','${p.type}','${mois}',${p.salaire})">Payer</button>`}
        ${p.type==='autre' ? `<button class="icon-btn" title="Modifier" onclick="openPersonnelForm('${p.id}')">✏️</button><button class="icon-btn danger" title="Supprimer" onclick="deletePersonnel('${p.id}')">🗑️</button>` : ''}
      </td>
    </tr>`;
  }).join('');

  return `
    <div class="cards">
      <div class="card"><div class="num">${fmtFCFA(masseSalariale)}</div><div class="label">Masse salariale mensuelle</div></div>
      <div class="card"><div class="num amount in">${fmtFCFA(totalPaye)}</div><div class="label">Payé — ${moisLabel(mois)}</div></div>
      <div class="card"><div class="num amount out">${fmtFCFA(masseSalariale-totalPaye)}</div><div class="label">Restant à payer</div></div>
    </div>
    <div class="panel">
      <div class="panel-head">
        <div><h2>Salaires du personnel</h2><div class="sub">${personnel.length} employé(s) actif(s) — enseignants et personnel non-enseignant</div></div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;">
          <select onchange="ui.filters.comptaMois=this.value; renderView('comptabilite')">${lastNMonths(6).map(m=>`<option value="${m}" ${mois===m?'selected':''}>${moisLabel(m)}</option>`).join('')}</select>
          <button class="btn secondary" onclick="openPersonnelForm()">+ Personnel</button>
          <button class="btn" onclick="payerToutLePersonnel('${mois}')">💵 Payer tout le personnel</button>
        </div>
      </div>
      ${personnel.length===0 ? `<div class="empty-state"><div class="em-ic">💵</div>Aucun employé actif.</div>` : `
      <div class="table-wrap"><table><thead><tr><th>Employé</th><th>Poste</th><th>Salaire mensuel</th><th>Statut ${moisLabel(mois)}</th><th>Actions</th></tr></thead><tbody>${rows}</tbody></table></div>`}
    </div>`;
}
function openPersonnelForm(id){
  const p = id ? DB.personnelAutre.find(x=>x.id===id) : null;
  openModal(p ? 'Modifier le personnel' : 'Nouveau membre du personnel', `
    <form onsubmit="return handleSavePersonnel(event,'${id||''}')">
      <div class="form-grid">
        <div class="field"><label>Prénom</label><input name="prenom" required value="${p?escapeHtml(p.prenom):''}"></div>
        <div class="field"><label>Nom</label><input name="nom" required value="${p?escapeHtml(p.nom):''}"></div>
        <div class="field span2"><label>Poste / Fonction</label><input name="poste" list="postesList" required value="${p?escapeHtml(p.poste):''}"></div>
        <datalist id="postesList">${POSTES_PERSONNEL.map(po=>`<option value="${po}">`).join('')}</datalist>
        <div class="field"><label>Salaire mensuel (${DEVISE})</label><input type="number" name="salaireMensuel" min="0" step="1000" required value="${p?p.salaireMensuel:60000}"></div>
        <div class="field"><label>Téléphone</label><input name="telephone" value="${p?escapeHtml(p.telephone):''}"></div>
        <div class="field"><label>Date d'embauche</label><input type="date" name="dateEmbauche" value="${p?p.dateEmbauche:todayISO()}"></div>
        <div class="field"><label>Statut</label><select name="statut"><option ${p?.statut==='Actif'?'selected':''}>Actif</option><option ${p?.statut==='Inactif'?'selected':''}>Inactif</option></select></div>
      </div>
      <div class="form-actions"><button type="button" class="btn secondary" onclick="closeModal()">Annuler</button><button type="submit" class="btn">Enregistrer</button></div>
    </form>`);
}
async function handleSavePersonnel(ev, id){
  ev.preventDefault();
  const fd = new FormData(ev.target);
  const patch = {
    prenom: fd.get('prenom').trim(), nom: fd.get('nom').trim(), poste: fd.get('poste').trim(),
    salaireMensuel: Math.max(0,parseInt(fd.get('salaireMensuel'))||0), telephone: fd.get('telephone').trim(),
    dateEmbauche: fd.get('dateEmbauche')||todayISO(), statut: fd.get('statut'),
  };
  try{
    if(id){
      await dbUpdate('personnel_autre', id, patch);
      const idx = DB.personnelAutre.findIndex(p=>p.id===id);
      DB.personnelAutre[idx] = {...DB.personnelAutre[idx], ...patch};
    } else {
      DB.personnelAutre.push(await dbInsert('personnel_autre', patch));
    }
    closeModal(); toast('Personnel enregistré');
    renderView('comptabilite');
  }catch(e){ alert('Erreur : ' + e.message); }
  return false;
}
async function deletePersonnel(id){
  if(!confirm('Supprimer ce membre du personnel ?')) return;
  try{
    await dbDelete('personnel_autre', id);
    DB.personnelAutre = DB.personnelAutre.filter(p=>p.id!==id);
    DB.paiementsSalaires = DB.paiementsSalaires.filter(p=>!(p.personnelId===id && p.personnelType==='autre'));
    toast('Personnel supprimé');
    renderView('comptabilite');
  }catch(e){ alert('Erreur : ' + e.message); }
}
async function payerSalaire(personnelId, personnelType, mois, montant){
  try{
    const rec = await dbInsert('paiements_salaires', {personnelId, personnelType, mois, montant:parseFloat(montant), datePaiement: todayISO(), modePaiement:'Virement bancaire'});
    DB.paiementsSalaires.push(rec);
    journaliserCompta('paiements_salaires', rec.id, 'creation', null, rec);
    toast('Salaire payé');
    renderView('comptabilite');
    openRecu({type:'sortie', refId:rec.id, montant:rec.montant, date:rec.datePaiement, modePaiement:rec.modePaiement, objet:`Salaire — ${moisLabel(mois)}`, personne: personnelNomById(personnelId, personnelType)});
  }catch(e){ alert('Erreur : ' + e.message); }
}
function reimprimerRecuSalaire(paiementId){
  const p = DB.paiementsSalaires.find(x=>x.id===paiementId);
  if(!p) return;
  openRecu({type:'sortie', refId:p.id, montant:p.montant, date:p.datePaiement, modePaiement:p.modePaiement, objet:`Salaire — ${moisLabel(p.mois)}`, personne: personnelNomById(p.personnelId, p.personnelType)});
}
async function annulerPaiementSalaire(id){
  if(!confirm('Annuler ce paiement de salaire ?')) return;
  try{
    const avant = DB.paiementsSalaires.find(p=>p.id===id) || null;
    await dbDelete('paiements_salaires', id);
    DB.paiementsSalaires = DB.paiementsSalaires.filter(p=>p.id!==id);
    journaliserCompta('paiements_salaires', id, 'suppression', avant, null);
    toast('Paiement annulé');
    renderView('comptabilite');
  }catch(e){ alert('Erreur : ' + e.message); }
}
function openModifierPaiementSalaireForm(paiementId){
  const p = DB.paiementsSalaires.find(x=>x.id===paiementId);
  if(!p) return;
  openModal('Modifier le paiement de salaire', `
    <div class="section-note">✏️ La correction sera enregistrée dans le Journal d'audit, avec le montant avant/après.</div>
    <form onsubmit="return handleModifierPaiementSalaire(event,'${paiementId}')">
      <div class="form-grid">
        <div class="field"><label>Montant (${DEVISE})</label><input type="number" name="montant" min="0" step="1000" required value="${p.montant}"></div>
        <div class="field"><label>Date de paiement</label><input type="date" name="datePaiement" value="${p.datePaiement}"></div>
        <div class="field"><label>Mode de paiement</label><select name="modePaiement">${MODES_PAIEMENT.map(m=>`<option ${p.modePaiement===m?'selected':''}>${m}</option>`).join('')}</select></div>
      </div>
      <div class="form-actions"><button type="button" class="btn secondary" onclick="closeModal()">Annuler</button><button type="submit" class="btn">Enregistrer la correction</button></div>
    </form>`);
}
async function handleModifierPaiementSalaire(ev, paiementId){
  ev.preventDefault();
  const fd = new FormData(ev.target);
  const patch = {montant: Math.max(0, parseInt(fd.get('montant'))||0), datePaiement: fd.get('datePaiement')||todayISO(), modePaiement: fd.get('modePaiement')};
  try{
    const avant = DB.paiementsSalaires.find(x=>x.id===paiementId);
    await dbUpdate('paiements_salaires', paiementId, patch);
    const idx = DB.paiementsSalaires.findIndex(x=>x.id===paiementId);
    const apres = {...avant, ...patch};
    DB.paiementsSalaires[idx] = apres;
    journaliserCompta('paiements_salaires', paiementId, 'modification', avant, apres);
    closeModal(); toast('Paiement corrigé');
    renderView('comptabilite');
  }catch(e){ alert('Erreur : ' + e.message); }
  return false;
}
async function payerToutLePersonnel(mois){
  const personnel = [
    ...DB.enseignants.filter(t=>t.statut==='Actif').map(t=>({id:t.id, type:'enseignant', salaire:t.salaireMensuel||0})),
    ...DB.personnelAutre.filter(p=>p.statut==='Actif').map(p=>({id:p.id, type:'autre', salaire:p.salaireMensuel||0})),
  ];
  const restants = personnel.filter(p=>!DB.paiementsSalaires.some(x=>x.personnelId===p.id && x.personnelType===p.type && x.mois===mois));
  if(restants.length===0){ toast('Tout le personnel est déjà payé pour ce mois'); return; }
  if(!confirm(`Payer ${restants.length} employé(s) pour ${moisLabel(mois)} — total ${fmtFCFA(restants.reduce((s,p)=>s+p.salaire,0))} ?`)) return;
  try{
    const rows = restants.map(p=>({personnelId:p.id, personnelType:p.type, mois, montant:p.salaire, datePaiement: todayISO(), modePaiement:'Virement bancaire'}));
    const inseres = await dbInsertMany('paiements_salaires', rows);
    DB.paiementsSalaires.push(...inseres);
    inseres.forEach(rec => journaliserCompta('paiements_salaires', rec.id, 'creation', null, rec));
    toast('Salaires payés');
    renderView('comptabilite');
  }catch(e){ alert('Erreur : ' + e.message); }
}

/* --- 12.6 Charges & Dépenses --- */
function renderComptaDepenses(){
  const catFilter = ui.filters.comptaCategorie || '';
  ui.filters.comptaCategorie = catFilter;
  const moisFilter = ui.filters.comptaMoisDepenses || 'all';
  ui.filters.comptaMoisDepenses = moisFilter;

  let list = DB.depenses.slice();
  if(catFilter) list = list.filter(d=>d.categorie===catFilter);
  if(moisFilter!=='all') list = list.filter(d=>d.date.slice(0,7)===moisFilter);
  list.sort((a,b)=>b.date.localeCompare(a.date));
  const totalPeriode = list.reduce((s,d)=>s+d.montant,0);
  const loyerCeMois = DB.depenses.find(d=>d.categorie==='Loyer' && d.date.slice(0,7)===thisMonthISO());

  const rows = list.map(d=>`<tr><td>${fmtDate(d.date)}</td><td><span class="badge blue">${d.categorie}</span></td><td>${escapeHtml(d.libelle)}</td><td class="amount out">${fmtFCFA(d.montant)}</td><td>${d.modePaiement}</td>
    <td><button class="icon-btn" title="Reçu" onclick="reimprimerRecuDepense('${d.id}')">🧾</button> <button class="icon-btn danger" onclick="deleteDepense('${d.id}')">🗑️</button></td></tr>`).join('');

  return `
    <div class="cards">
      <div class="card"><div class="num amount out">${fmtFCFA(totalPeriode)}</div><div class="label">Total dépenses (filtre actuel)</div></div>
      <div class="card"><div class="num" style="cursor:pointer;" onclick="openLoyerConfigForm()">${fmtFCFA(DB.meta.loyerMensuel)} ✏️</div><div class="label">Loyer mensuel configuré</div></div>
      <div class="card">
        <div class="num">${loyerCeMois?'✅ Payé':'⏳ En attente'}</div>
        <div class="label">Loyer — ${moisLabel(thisMonthISO())}</div>
        ${!loyerCeMois ? `<button class="btn sm no-print" style="margin-top:8px;" onclick="payerLoyerDuMois()">Enregistrer le paiement</button>` : ''}
      </div>
    </div>
    <div class="panel">
      <div class="panel-head">
        <div><h2>Charges & Dépenses</h2><div class="sub">${list.length} dépense(s) · ${fmtFCFA(totalPeriode)}</div></div>
        <button class="btn" onclick="openDepenseForm()">+ Nouvelle dépense</button>
      </div>
      <div class="filters">
        <select onchange="ui.filters.comptaCategorie=this.value; renderView('comptabilite')"><option value="">Toutes les catégories</option>${CATEGORIES_DEPENSES.map(c=>`<option ${catFilter===c?'selected':''}>${c}</option>`).join('')}</select>
        <select onchange="ui.filters.comptaMoisDepenses=this.value; renderView('comptabilite')"><option value="all" ${moisFilter==='all'?'selected':''}>Tous les mois</option>${lastNMonths(6).map(m=>`<option value="${m}" ${moisFilter===m?'selected':''}>${moisLabel(m)}</option>`).join('')}</select>
      </div>
      ${list.length===0 ? `<div class="empty-state"><div class="em-ic">🏠</div>Aucune dépense pour ces critères.</div>` : `
      <div class="table-wrap"><table><thead><tr><th>Date</th><th>Catégorie</th><th>Libellé</th><th>Montant</th><th>Mode</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`}
    </div>`;
}
function openDepenseForm(id){
  const d = id ? DB.depenses.find(x=>x.id===id) : null;
  openModal(d ? 'Modifier la dépense' : 'Nouvelle dépense', `
    <form onsubmit="return handleSaveDepense(event,'${id||''}')">
      <div class="form-grid">
        <div class="field"><label>Catégorie</label><select name="categorie">${CATEGORIES_DEPENSES.map(c=>`<option ${d?.categorie===c?'selected':''}>${c}</option>`).join('')}</select></div>
        <div class="field"><label>Montant (${DEVISE})</label><input type="number" name="montant" min="0" step="500" required value="${d?d.montant:10000}"></div>
        <div class="field span2"><label>Libellé</label><input name="libelle" required value="${d?escapeHtml(d.libelle):''}"></div>
        <div class="field"><label>Date</label><input type="date" name="date" value="${d?d.date:todayISO()}"></div>
        <div class="field"><label>Mode de paiement</label><select name="modePaiement">${MODES_PAIEMENT.map(m=>`<option ${d?.modePaiement===m?'selected':''}>${m}</option>`).join('')}</select></div>
      </div>
      <div class="form-actions"><button type="button" class="btn secondary" onclick="closeModal()">Annuler</button><button type="submit" class="btn">Enregistrer</button></div>
    </form>`);
}
async function handleSaveDepense(ev, id){
  ev.preventDefault();
  const fd = new FormData(ev.target);
  const isNew = !id;
  const patch = {categorie:fd.get('categorie'), libelle:fd.get('libelle').trim(), montant:Math.max(0,parseInt(fd.get('montant'))||0), date:fd.get('date')||todayISO(), modePaiement:fd.get('modePaiement')};
  try{
    let obj;
    if(id){
      const avant = DB.depenses.find(x=>x.id===id) || null;
      await dbUpdate('depenses', id, patch);
      obj = {id, ...patch};
      const idx = DB.depenses.findIndex(x=>x.id===id);
      DB.depenses[idx] = obj;
      journaliserCompta('depenses', id, 'modification', avant, obj);
    } else {
      obj = await dbInsert('depenses', patch);
      DB.depenses.push(obj);
      journaliserCompta('depenses', obj.id, 'creation', null, obj);
    }
    toast('Dépense enregistrée');
    renderView('comptabilite');
    if(isNew) openRecu({type:'sortie', refId:obj.id, montant:obj.montant, date:obj.date, modePaiement:obj.modePaiement, objet:obj.libelle, personne:'—', sousInfo:obj.categorie});
    else closeModal();
  }catch(e){ alert('Erreur : ' + e.message); }
  return false;
}
async function deleteDepense(id){
  if(!confirm('Supprimer cette dépense ?')) return;
  try{
    const avant = DB.depenses.find(d=>d.id===id) || null;
    await dbDelete('depenses', id);
    DB.depenses = DB.depenses.filter(d=>d.id!==id);
    journaliserCompta('depenses', id, 'suppression', avant, null);
    toast('Dépense supprimée');
    renderView('comptabilite');
  }catch(e){ alert('Erreur : ' + e.message); }
}
function reimprimerRecuDepense(id){
  const d = DB.depenses.find(x=>x.id===id);
  if(!d) return;
  openRecu({type:'sortie', refId:d.id, montant:d.montant, date:d.date, modePaiement:d.modePaiement, objet:d.libelle, personne:'—', sousInfo:d.categorie});
}
async function payerLoyerDuMois(){
  try{
    const rec = await dbInsert('depenses', {categorie:'Loyer', libelle:`Loyer mensuel — ${moisLabel(thisMonthISO())}`, montant: DB.meta.loyerMensuel, date: todayISO(), modePaiement:'Virement bancaire'});
    DB.depenses.push(rec);
    journaliserCompta('depenses', rec.id, 'creation', null, rec);
    toast('Loyer enregistré');
    renderView('comptabilite');
    openRecu({type:'sortie', refId:rec.id, montant:rec.montant, date:rec.date, modePaiement:rec.modePaiement, objet:rec.libelle, personne:'—', sousInfo:'Loyer'});
  }catch(e){ alert('Erreur : ' + e.message); }
}
function openLoyerConfigForm(){
  openModal('Configurer le loyer mensuel', `
    <form onsubmit="return handleSaveLoyerConfig(event)">
      <div class="form-grid single"><div class="field"><label>Loyer mensuel (${DEVISE})</label><input type="number" name="loyerMensuel" min="0" step="1000" required value="${DB.meta.loyerMensuel}"></div></div>
      <div class="form-actions"><button type="button" class="btn secondary" onclick="closeModal()">Annuler</button><button type="submit" class="btn">Enregistrer</button></div>
    </form>`);
}
async function handleSaveLoyerConfig(ev){
  ev.preventDefault();
  const fd = new FormData(ev.target);
  const loyerMensuel = Math.max(0, parseInt(fd.get('loyerMensuel'))||0);
  try{
    const { error } = await sb.from('ecoles').update({ loyer_mensuel: loyerMensuel }).eq('id', session.ecoleId);
    if(error) throw error;
    DB.meta.loyerMensuel = loyerMensuel;
    closeModal(); toast('Loyer mensuel mis à jour');
    renderView('comptabilite');
  }catch(e){ alert('Erreur : ' + e.message); }
  return false;
}

/* ---------------------------------------------------------------------
   12.7 JOURNAL D'AUDIT COMPTABLE (voir journaliserCompta plus haut et
   schema.sql section 24) — qui a créé/modifié/supprimé un mouvement
   financier, et quand. Chargé à la demande (pas au démarrage) car ce
   n'est pas une donnée nécessaire au fonctionnement quotidien.
   --------------------------------------------------------------------- */
let __journalComptaCache = null;
let __journalComptaChargement = false;
async function chargerJournalCompta(){
  if(__journalComptaChargement) return;
  __journalComptaChargement = true;
  try{
    const { data, error } = await sb.from('journal_compta').select('*').order('created_at', {ascending:false}).limit(200);
    if(error) throw error;
    __journalComptaCache = data;
  }catch(e){
    __journalComptaCache = [];
  }finally{
    __journalComptaChargement = false;
    if(ui.currentView==='comptabilite' && ui.filters.comptaTab==='journal') renderView('comptabilite');
  }
}
const LABELS_ACTION_JOURNAL = {creation:'Création', modification:'Modification', suppression:'Suppression'};
const LABELS_TABLE_JOURNAL = {
  paiements_scolarite:'Paiement scolarité', paiements_cotisations:'Cotisation activité',
  ventes_gadgets:'Vente boutique', paiements_salaires:'Salaire', depenses:'Dépense',
};
function renderComptaJournal(){
  if(__journalComptaCache===null){
    chargerJournalCompta();
    return `<div class="panel"><div class="hint" style="text-align:center;padding:40px 10px;">Chargement du journal…</div></div>`;
  }
  const rows = __journalComptaCache.map(j=>{
    const montantAvant = j.donnees_avant?.montant, montantApres = j.donnees_apres?.montant;
    const badgeColor = j.action==='creation' ? 'green' : j.action==='suppression' ? 'red' : 'amber';
    return `<tr>
      <td>${fmtDate(j.created_at.slice(0,10))} <span class="hint">${j.created_at.slice(11,16)}</span></td>
      <td><span class="badge ${badgeColor}">${LABELS_ACTION_JOURNAL[j.action]||j.action}</span></td>
      <td>${LABELS_TABLE_JOURNAL[j.table_cible]||j.table_cible}</td>
      <td>${j.action==='modification' ? `${fmtFCFA(montantAvant||0)} → ${fmtFCFA(montantApres||0)}` : fmtFCFA(montantApres!=null?montantApres:(montantAvant||0))}</td>
      <td>${escapeHtml(j.auteur_nom||'—')} <span class="hint">(${j.auteur_role||'—'})</span></td>
    </tr>`;
  }).join('');
  return `
    <div class="section-note">📜 Historique en lecture seule, immuable : chaque création, modification ou suppression d'un mouvement financier (scolarité, salaires, dépenses) est enregistrée ici automatiquement, avec l'auteur et l'horodatage. Rien ici ne peut être modifié ou effacé.</div>
    <div class="panel">
      <div class="panel-head"><div><h2>Journal d'audit</h2><div class="sub">${__journalComptaCache.length} entrée(s) — 200 plus récentes</div></div></div>
      ${__journalComptaCache.length===0 ? `<div class="empty-state"><div class="em-ic">📜</div>Aucune opération enregistrée pour l'instant.</div>` : `
      <div class="table-wrap"><table><thead><tr><th>Date</th><th>Action</th><th>Mouvement</th><th>Montant</th><th>Par</th></tr></thead><tbody>${rows}</tbody></table></div>`}
    </div>`;
}

/* ---------------------------------------------------------------------
   12.8 MESSAGERIE (notifications automatiques d'absence/retard)
   --------------------------------------------------------------------- */
function renderMessagerie(){
  const typeFilter = ui.filters.msgType || '';
  ui.filters.msgType = typeFilter;
  const roleFilter = ui.filters.msgRole || '';
  ui.filters.msgRole = roleFilter;

  let list = DB.messages.slice();
  if(typeFilter) list = list.filter(m=>m.type===typeFilter);
  if(roleFilter) list = list.filter(m=>m.destinataireRole===roleFilter);
  list.sort((a,b)=> (b.date+b.heure).localeCompare(a.date+a.heure));

  const today = todayISO();
  const totalToday = DB.messages.filter(m=>m.date===today).length;
  const nbAbsEleve = DB.presencesEleves.filter(p=>p.statut==='Absent').length;
  const nbEns = DB.presencesEnseignants.filter(p=>p.statut==='Absent' || p.statut==='Retard').length;

  const typeBadge = t => t==='Absence élève' ? 'red' : t==='Absence enseignant' ? 'amber' : t==='Retard enseignant' ? 'blue' : 'gray';
  const roleIcon = r => r==='Parent' ? '👪' : r==='Directeur' ? '🎩' : r==='Fondateur' ? '🏛️' : '👤';
  const statutBadge = m => {
    if(m.canal==='Application') return `<span class="badge blue">📱 Interne</span>`;
    if(m.statut==='Échec envoi') return `<span class="badge red">✕ Échec SMS</span>`;
    return `<span class="badge green">✓ SMS envoyé</span>`;
  };

  const rows = list.slice(0,80).map(m=>`<tr>
    <td style="white-space:nowrap;">${fmtDate(m.date)}<br><span class="hint">${m.heure}</span></td>
    <td>${roleIcon(m.destinataireRole)} ${escapeHtml(m.destinataireNom)}<br><span class="badge gray">${m.destinataireRole}</span></td>
    <td><span class="badge ${typeBadge(m.type)}">${m.type}</span></td>
    <td style="max-width:320px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(m.contenu)}</td>
    <td>${statutBadge(m)}</td>
    <td><button class="icon-btn" title="Voir le message" onclick='voirMessage(${JSON.stringify(m.id)})'>👁️</button></td>
  </tr>`).join('');

  return `
  <div class="view active">
    <div class="section-note">📨 Le parent reçoit un vrai SMS à chaque absence de son enfant (via Africa's Talking). La Direction et la Fondation reçoivent la même alerte directement dans l'application — déjà connectées, aucun coût SMS supplémentaire pour elles. Les absences/retards d'enseignants restent des notifications internes à l'application pour Direction et Fondation.</div>
    <div class="cards">
      <div class="card"><div class="card-top"><div class="icon-badge" style="background:var(--primary-dim);">📨</div></div><div class="num">${DB.messages.length}</div><div class="label">Messages envoyés (total)</div></div>
      <div class="card"><div class="card-top"><div class="icon-badge" style="background:var(--blue-bg);">📆</div></div><div class="num">${totalToday}</div><div class="label">Envoyés aujourd'hui</div></div>
      <div class="card"><div class="card-top"><div class="icon-badge" style="background:var(--red-bg);">🧒</div></div><div class="num">${nbAbsEleve}</div><div class="label">Absences élèves signalées</div></div>
      <div class="card"><div class="card-top"><div class="icon-badge" style="background:var(--amber-bg);">👩‍🏫</div></div><div class="num">${nbEns}</div><div class="label">Absences/retards enseignants signalés</div></div>
    </div>
    <div class="panel">
      <div class="panel-head"><div><h2>Journal des notifications</h2><div class="sub">${list.length} message(s)</div></div></div>
      <div class="filters">
        <select onchange="ui.filters.msgType=this.value; renderView('messagerie')">
          <option value="">Tous les types</option>
          <option value="Absence élève" ${typeFilter==='Absence élève'?'selected':''}>Absence élève</option>
          <option value="Absence enseignant" ${typeFilter==='Absence enseignant'?'selected':''}>Absence enseignant</option>
          <option value="Retard enseignant" ${typeFilter==='Retard enseignant'?'selected':''}>Retard enseignant</option>
        </select>
        <select onchange="ui.filters.msgRole=this.value; renderView('messagerie')">
          <option value="">Tous les destinataires</option>
          <option value="Parent" ${roleFilter==='Parent'?'selected':''}>Parent</option>
          <option value="Directeur" ${roleFilter==='Directeur'?'selected':''}>Directeur</option>
          <option value="Fondateur" ${roleFilter==='Fondateur'?'selected':''}>Fondateur</option>
        </select>
      </div>
      ${list.length===0 ? `<div class="empty-state"><div class="em-ic">📨</div>Aucune notification pour ces critères.</div>` : `
      <div class="table-wrap"><table>
        <thead><tr><th>Date</th><th>Destinataire</th><th>Type</th><th>Message</th><th>Statut</th><th></th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
      ${list.length>80 ? `<div class="hint" style="margin-top:10px;">Affichage limité aux 80 messages les plus récents.</div>` : ''}`}
    </div>
  </div>`;
}
function voirMessage(id){
  const m = DB.messages.find(x=>x.id===id);
  if(!m) return;
  openModal('Message envoyé', `
    <div class="hint">${fmtDate(m.date)} à ${m.heure} · Canal : ${m.canal}</div>
    <div class="hint" style="margin-bottom:10px;">À : <strong>${escapeHtml(m.destinataireNom)}</strong> (${m.destinataireRole})${m.destinataireTel?' · '+escapeHtml(m.destinataireTel):''}</div>
    <div class="txn-item" style="border:1px solid var(--border);border-radius:12px;padding:14px;background:var(--surface-2);">
      <div class="txn-body"><div style="font-size:13.5px;line-height:1.5;">${escapeHtml(m.contenu)}</div></div>
    </div>
    <div class="form-actions"><button type="button" class="btn secondary" onclick="closeModal()">Fermer</button></div>`);
}

/* ---------------------------------------------------------------------
   13. PARAMÈTRES
   --------------------------------------------------------------------- */
function renderParametres(){
  const m = DB.meta;
  return `
  <div class="view active">
    <div class="section-note">🏫 Cette application est personnalisable : chaque école cliente peut y configurer son propre logo, son nom, sa direction et sa fondation. Ces informations apparaissent dans le menu, l'onglet du navigateur et sur les bulletins imprimés.</div>

    <div class="panel">
      <div class="panel-head"><div><h2>Logo de l'école</h2><div class="sub">Format PNG ou JPG recommandé, fond transparent de préférence</div></div></div>
      <div class="logo-uploader">
        <div class="logo-preview">
          ${m.logo ? `<img src="${m.logo}" alt="Logo">` : `<span class="ph">🎓</span>`}
        </div>
        <div class="logo-actions">
          <label class="btn secondary" style="cursor:pointer;">⬆️ ${m.logo ? 'Changer le logo' : 'Importer un logo'}
            <input type="file" accept="image/*" style="display:none;" onchange="handleLogoUpload(event)">
          </label>
          ${m.logo ? `<button class="btn danger" onclick="removeLogo()">🗑️ Retirer le logo</button>` : ''}
        </div>
      </div>
    </div>

    <div class="panel">
      <div class="panel-head"><div><h2>Identité de l'établissement</h2></div></div>
      <form onsubmit="return handleSaveMeta(event)">
        <div class="form-grid">
          <div class="field span2"><label>Nom de l'école</label><input name="nomEcole" required value="${escapeHtml(m.nomEcole)}"></div>
          <div class="field span2"><label>Adresse</label><input name="adresse" value="${escapeHtml(m.adresse)}"></div>
          <div class="field"><label>Téléphone</label><input name="telephone" value="${escapeHtml(m.telephone)}"></div>
          <div class="field"><label>Année scolaire</label><input name="anneeScolaire" value="${escapeHtml(m.anneeScolaire)}"></div>
          <div class="field"><label>Nom du directeur / de la directrice</label><input name="directeurNom" placeholder="Ex : M. Kouassi Jean-Baptiste" value="${escapeHtml(m.directeurNom)}"></div>
          <div class="field"><label>Nom du fondateur / de la fondatrice</label><input name="fondateurNom" placeholder="Ex : Mme Aya Marie-Claire" value="${escapeHtml(m.fondateurNom)}"></div>
          <div class="field"><label>Heure d'arrivée attendue (enseignants)</label><input type="time" name="heureArriveeAttendue" value="${escapeHtml(m.heureArriveeAttendue)}"></div>
        </div>
        <div class="hint">Le directeur et le fondateur apparaissent dans le bloc de signature des bulletins imprimés. L'heure d'arrivée attendue sert au module Pointage pour calculer automatiquement les retards.</div>
        <div class="form-actions"><button class="btn" type="submit">Enregistrer</button></div>
      </form>
    </div>

    <div class="panel">
      <div class="panel-head"><div><h2>Niveaux de l'établissement</h2><div class="sub">Cochez les niveaux couverts par votre école — décochez-en un pour le masquer sans rien supprimer</div></div></div>
      <form onsubmit="return handleSaveNiveaux(event)">
        <div class="grid-2" style="margin-bottom:14px;">
          ${Object.entries(NIVEAUX_DEF).map(([key,n])=>{
            const actif = (DB.meta.niveaux||[]).includes(key);
            return `<label style="display:flex;align-items:center;gap:10px;padding:12px;border:1px solid var(--border);border-radius:10px;background:${actif?'var(--primary-dim)':'var(--surface-2)'};cursor:pointer;">
              <input type="checkbox" name="niveau_${key}" ${actif?'checked':''}>
              <div><strong>${n.icon} ${n.label}</strong><div class="hint">${n.desc}</div></div>
              ${actif ? `<span class="badge green" style="margin-left:auto;">Actif</span>` : ''}
            </label>`;
          }).join('')}
        </div>
        <div class="hint">Décocher un niveau le masque de toute l'application (tableau de bord, élèves, notes, comptabilité…) — ses classes et élèves restent en mémoire et réapparaissent dès que vous le recochez.</div>
        <div class="form-actions"><button class="btn" type="submit">Enregistrer les niveaux</button></div>
      </form>
      <div class="hint" style="margin:16px 0 8px;">Classes actives (${DB.classes.length}) :</div>
      <div style="display:flex;flex-wrap:wrap;gap:8px;">
        ${DB.classes.map(c=>`<span class="badge blue" style="font-size:12px;padding:6px 12px;">${c.nom} <span style="opacity:.6;">· ${c.cycle}</span></span>`).join('') || `<span class="hint">Aucune classe active pour le moment.</span>`}
      </div>
    </div>

    <div class="panel">
      <div class="panel-head"><div><h2>Échéances de scolarité</h2><div class="sub">Définissez les versements attendus (ex : "1er versement — Novembre — 50 000 F") — utilisés dans le formulaire d'enregistrement des paiements</div></div></div>
      ${renderEcheancesScolarite()}
    </div>

    <div class="panel">
      <div class="panel-head"><div><h2>Accès &amp; Interfaces</h2><div class="sub">4 profils, avec des droits différents — chacun se connecte avec son propre email et mot de passe</div></div></div>
      <div class="grid-2" style="margin-bottom:14px;">
        <div class="hint">👩‍🏫 <strong>Enseignant(e)</strong> — Notes, présences élèves, emploi du temps, programmes. Pas d'accès aux élèves, à la comptabilité ni aux paramètres. Un compte enseignant peut être relié à une fiche précise (page Enseignants) pour ne voir que ses propres classes.</div>
        <div class="hint">🗂️ <strong>Secrétariat</strong> — Tout ce que voit l'enseignant + élèves, enseignants, comptabilité (chiffres globaux masqués). Pas d'accès aux paramètres.</div>
        <div class="hint">🎩 <strong>Direction</strong> — Accès complet, y compris les chiffres financiers et les paramètres.</div>
        <div class="hint">🏛️ <strong>Fondation</strong> — Accès complet, identique à la Direction.</div>
      </div>
      <div class="section-note">🔐 La création et la suppression des comptes du personnel se font depuis le tableau de bord Supabase (Authentication → Users), puis en associant le compte à un rôle. C'est une opération d'administration technique, volontairement séparée de l'application pour éviter toute création de compte non maîtrisée.</div>
    </div>

    <div class="panel">
      <div class="panel-head"><div><h2>Sécurité &amp; confidentialité</h2></div></div>
      <div class="hint" style="line-height:1.6;">
        🔒 Authentification réelle par email et mot de passe (Supabase Auth) — plus aucun code partagé.<br>
        🧱 Chaque école est isolée au niveau de la base de données : techniquement impossible de voir les données d'une autre école, même en cas de faille dans l'interface.<br>
        ⏱️ Déconnexion automatique après 10 minutes d'inactivité.<br>
        💾 Les données sont hébergées sur Supabase (PostgreSQL géré), chiffrées au repos et en transit.
      </div>
      <div class="form-actions" style="justify-content:flex-start;border-top:none;padding-top:10px;">
        <a class="btn secondary" href="confidentialite.html" target="_blank" rel="noopener">📄 Politique de confidentialité</a>
      </div>
    </div>

    <div class="panel">
      <div class="panel-head"><div><h2>Accès technique développeur</h2><div class="sub">Autorisez ponctuellement l'éditeur de l'application à consulter vos données pour vous dépanner</div></div></div>
      <label style="display:flex;align-items:center;gap:12px;padding:14px;border:1px solid var(--border);border-radius:10px;background:${m.accesSupportDeveloppeur?'var(--primary-dim)':'var(--surface-2)'};cursor:pointer;max-width:520px;">
        <input type="checkbox" id="chkAccesSupportDev" ${m.accesSupportDeveloppeur?'checked':''} onchange="handleToggleAccesSupportDev(this.checked)">
        <div>
          <strong>Autoriser l'accès technique du développeur</strong>
          <div class="hint">Tant que c'est décoché, personne côté développeur ne peut voir vos élèves, notes ou comptabilité — même pas l'éditeur de l'application. Cochez uniquement le temps d'un dépannage, puis décochez. L'accès reste en lecture seule : rien ne peut être modifié sans repasser par vous.</div>
        </div>
      </label>
    </div>

    <div class="panel">
      <div class="panel-head"><div><h2>Données</h2><div class="sub">Hébergées sur Supabase — partagées en temps réel entre tous les postes de l'école</div></div></div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;">
        <button class="btn secondary" onclick="exportData()">⬇️ Exporter une sauvegarde (JSON)</button>
      </div>
    </div>
  </div>`;
}

async function handleSaveMeta(ev){
  ev.preventDefault();
  const fd = new FormData(ev.target);
  const patch = {
    nomEcole: fd.get('nomEcole').trim() || DB.meta.nomEcole,
    adresse: fd.get('adresse').trim(), telephone: fd.get('telephone').trim(),
    anneeScolaire: fd.get('anneeScolaire').trim(),
    directeurNom: fd.get('directeurNom').trim(), fondateurNom: fd.get('fondateurNom').trim(),
    heureArriveeAttendue: fd.get('heureArriveeAttendue') || DB.meta.heureArriveeAttendue,
  };
  try{
    const { error } = await sb.from('ecoles').update(objToSnake(patch)).eq('id', session.ecoleId);
    if(error) throw error;
    Object.assign(DB.meta, patch);
    toast('Informations enregistrées');
    applyBranding();
  }catch(e){ alert('Erreur : ' + e.message); }
  return false;
}

async function handleToggleAccesSupportDev(actif){
  try{
    const { error } = await sb.from('ecoles').update({ acces_support_developpeur: actif }).eq('id', session.ecoleId);
    if(error) throw error;
    DB.meta.accesSupportDeveloppeur = actif;
    toast(actif ? 'Accès technique développeur activé' : 'Accès technique développeur désactivé');
  }catch(e){
    alert('Erreur : ' + e.message);
    const chk = $('#chkAccesSupportDev'); if(chk) chk.checked = !actif;
  }
}

async function handleSaveNiveaux(ev){
  ev.preventDefault();
  const fd = new FormData(ev.target);
  const actifs = DB.meta.niveaux || [];
  const coches = Object.keys(NIVEAUX_DEF).filter(key => fd.get(`niveau_${key}`));
  const toAdd = coches.filter(key => !actifs.includes(key));
  const toRemove = actifs.filter(key => !coches.includes(key));
  if(toAdd.length===0 && toRemove.length===0){ toast('Aucun changement'); return false; }
  try{
    const idsExistants = new Set((DB.classesTout || DB.classes).map(c=>c.id));
    const nouvellesClasses = toAdd.flatMap(key => NIVEAUX_DEF[key].classes).filter(c => !idsExistants.has(c.id));
    if(nouvellesClasses.length){
      const rows = nouvellesClasses.map(c => objToSnake({
        id: c.id, ecoleId: session.ecoleId, nom: c.nom, cycle: c.cycle,
        fraisScolarite: FRAIS_SCOLARITE_DEFAUT[c.id] || 0,
      }));
      const { error } = await sb.from('classes').insert(rows);
      if(error) throw error;
    }
    const niveaux = coches;
    const { error: err2 } = await sb.from('ecoles').update({ niveaux }).eq('id', session.ecoleId);
    if(err2) throw err2;
    DB = await chargerDB();
    const parts = [];
    if(toAdd.length) parts.push(`activé(s) : ${toAdd.map(k=>NIVEAUX_DEF[k].label).join(', ')}`);
    if(toRemove.length) parts.push(`masqué(s) : ${toRemove.map(k=>NIVEAUX_DEF[k].label).join(', ')}`);
    toast('Niveaux ' + parts.join(' — '));
    renderView('parametres');
  }catch(e){ alert('Erreur : ' + e.message); }
  return false;
}

/* ---------------------------------------------------------------------
   ÉCHÉANCES DE SCOLARITÉ CONFIGURABLES
   --------------------------------------------------------------------- */
function renderEcheancesScolarite(){
  const list = (DB.echeancesScolarite||[]).slice().sort((a,b)=> (a.ordre-b.ordre) || (a.dateEcheance||'').localeCompare(b.dateEcheance||''));
  const rows = list.map(e=>`
    <tr>
      <td>${escapeHtml(e.label)}</td>
      <td>${fmtFCFA(e.montant)}</td>
      <td>${e.dateEcheance ? fmtDate(e.dateEcheance) : '—'}</td>
      <td style="white-space:nowrap;">
        <button class="icon-btn" title="Modifier" onclick="openEcheanceForm('${e.id}')">✏️</button>
        <button class="icon-btn danger" title="Supprimer" onclick="deleteEcheance('${e.id}')">🗑️</button>
      </td>
    </tr>`).join('');
  return `
    ${list.length===0 ? `<div class="hint" style="margin-bottom:14px;">Aucune échéance configurée — le formulaire de paiement utilise pour l'instant une liste générique (Inscription, Tranche 1, 2, 3…).</div>` : `
    <div class="table-wrap" style="margin-bottom:14px;"><table>
      <thead><tr><th>Libellé</th><th>Montant</th><th>Échéance</th><th>Actions</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>`}
    <button class="btn secondary" onclick="openEcheanceForm()">+ Ajouter une échéance</button>
  `;
}
function openEcheanceForm(id){
  const e = id ? (DB.echeancesScolarite||[]).find(x=>x.id===id) : null;
  openModal(e ? "Modifier l'échéance" : 'Nouvelle échéance', `
    <form onsubmit="return handleSaveEcheance(event,'${id||''}')">
      <div class="form-grid">
        <div class="field span2"><label>Libellé</label><input name="label" required placeholder="Ex : 1er versement" value="${e?escapeHtml(e.label):''}"></div>
        <div class="field"><label>Montant (${DEVISE})</label><input type="number" name="montant" min="0" step="500" required value="${e?e.montant:50000}"></div>
        <div class="field"><label>Échéance (optionnel)</label><input type="date" name="dateEcheance" value="${e&&e.dateEcheance?e.dateEcheance:''}"></div>
      </div>
      <div class="form-actions"><button type="button" class="btn secondary" onclick="closeModal()">Annuler</button><button type="submit" class="btn">Enregistrer</button></div>
    </form>`);
}
async function handleSaveEcheance(ev, id){
  ev.preventDefault();
  const fd = new FormData(ev.target);
  const patch = {
    label: fd.get('label').trim(),
    montant: Math.max(0, parseInt(fd.get('montant'))||0),
    dateEcheance: fd.get('dateEcheance') || null,
  };
  try{
    if(id){
      await dbUpdate('echeances_scolarite', id, patch);
      const idx = DB.echeancesScolarite.findIndex(e=>e.id===id);
      DB.echeancesScolarite[idx] = {...DB.echeancesScolarite[idx], ...patch};
    } else {
      patch.ordre = (DB.echeancesScolarite||[]).length;
      DB.echeancesScolarite = DB.echeancesScolarite || [];
      DB.echeancesScolarite.push(await dbInsert('echeances_scolarite', patch));
    }
    closeModal(); toast('Échéance enregistrée');
    renderView('parametres');
  }catch(e){ alert('Erreur : ' + e.message + (e.message?.includes('does not exist') ? " — la migration du module Pointage/Échéances n'a peut-être pas été appliquée." : '')); }
  return false;
}
async function deleteEcheance(id){
  if(!confirm('Supprimer cette échéance ?')) return;
  try{
    await dbDelete('echeances_scolarite', id);
    DB.echeancesScolarite = DB.echeancesScolarite.filter(e=>e.id!==id);
    toast('Échéance supprimée');
    renderView('parametres');
  }catch(e){ alert('Erreur : ' + e.message); }
}

function handleLogoUpload(ev){
  const file = ev.target.files[0];
  if(!file) return;
  if(!file.type.startsWith('image/')){ alert('Veuillez sélectionner un fichier image (PNG, JPG, SVG…).'); ev.target.value=''; return; }
  if(file.size > 1.5*1024*1024){ alert("L'image est trop volumineuse (max 1,5 Mo). Choisissez un logo plus léger."); ev.target.value=''; return; }
  const reader = new FileReader();
  reader.onload = async () => {
    try{
      const { error } = await sb.from('ecoles').update({ logo_url: reader.result }).eq('id', session.ecoleId);
      if(error) throw error;
      DB.meta.logo = reader.result;
      applyBranding();
      toast('Logo mis à jour');
      renderView('parametres');
    }catch(e){ alert('Erreur : ' + e.message); }
  };
  reader.readAsDataURL(file);
}

async function removeLogo(){
  if(!confirm('Retirer le logo de l\'école ?')) return;
  try{
    const { error } = await sb.from('ecoles').update({ logo_url: '' }).eq('id', session.ecoleId);
    if(error) throw error;
    DB.meta.logo = '';
    applyBranding();
    toast('Logo retiré');
    renderView('parametres');
  }catch(e){ alert('Erreur : ' + e.message); }
}

function exportData(){
  if(!confirm("Ce fichier contiendra toutes les données de l'école (élèves, contacts des parents, salaires, finances) en clair, non chiffrées.\n\nConservez-le dans un emplacement sécurisé et ne le partagez qu'avec des personnes autorisées.\n\nContinuer l'export ?")) return;
  const blob = new Blob([JSON.stringify(DB, null, 2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `ecomaz-donnees-${todayISO()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  toast('Export démarré');
}

/* ---------------------------------------------------------------------
   12bis. SURVEILLANCE TECHNIQUE — journalise automatiquement les erreurs
   JavaScript non gérées dans "erreurs_client" (voir schema.sql section 23),
   pour que le développeur soit informé d'un bug sans dépendre d'un
   signalement du client. Toujours "best effort" : ne doit jamais elle-même
   faire planter l'appli, et se limite à un nombre d'erreurs par session
   pour ne pas inonder la base en cas de boucle d'erreurs.
   --------------------------------------------------------------------- */
let __nbErreursJournalisees = 0;
async function journaliserErreurClient(message, pile){
  if(__nbErreursJournalisees >= 20) return;
  __nbErreursJournalisees++;
  try{
    await sb.from('erreurs_client').insert({
      ecole_id: session?.ecoleId || null,
      role: session?.role || null,
      message: String(message || '').slice(0, 2000),
      pile: String(pile || '').slice(0, 4000),
      page: window.location.href,
      user_agent: navigator.userAgent,
    });
  }catch(_e){ /* surveillance best-effort : ne jamais bloquer l'appli pour ça */ }
}
window.addEventListener('error', (ev) => {
  journaliserErreurClient(ev.message, ev.error?.stack);
});
window.addEventListener('unhandledrejection', (ev) => {
  journaliserErreurClient('Promise rejetée : ' + (ev.reason?.message || ev.reason), ev.reason?.stack);
});

/* ---------------------------------------------------------------------
   12ter. PISTE D'AUDIT COMPTABLE — journalise chaque création/modification/
   suppression d'un mouvement financier dans "journal_compta" (voir
   schema.sql section 24), pour qu'on sache toujours qui a fait quoi et
   quand. Best-effort comme la surveillance technique : ne doit jamais
   empêcher l'action comptable elle-même de réussir.
   --------------------------------------------------------------------- */
async function journaliserCompta(tableCible, enregistrementId, action, donneesAvant, donneesApres){
  try{
    await sb.from('journal_compta').insert({
      table_cible: tableCible,
      enregistrement_id: enregistrementId,
      action,
      donnees_avant: donneesAvant || null,
      donnees_apres: donneesApres || null,
      auteur_nom: session?.nomComplet || '',
      auteur_role: session?.role || '',
    });
  }catch(_e){ /* piste d'audit best-effort : ne jamais bloquer une opération comptable pour ça */ }
}

/* ---------------------------------------------------------------------
   13. INITIALISATION
   --------------------------------------------------------------------- */
(async function init(){
  // Lien "mot de passe oublié" cliqué : Supabase authentifie temporairement l'utilisateur
  // et émet cet événement — on l'intercepte pour afficher le formulaire de nouveau mot de passe
  // au lieu de le laisser atterrir directement sur le tableau de bord.
  const urlIndiqueRecovery = /type=recovery/.test(window.location.hash) || /type=recovery/.test(window.location.search);
  let recoveryMode = urlIndiqueRecovery;
  if(urlIndiqueRecovery) showResetPassword();
  sb.auth.onAuthStateChange((event) => {
    if(event === 'PASSWORD_RECOVERY'){ recoveryMode = true; showResetPassword(); }
  });
  await new Promise(r => setTimeout(r, 300));
  if(recoveryMode) return;

  // Restaure une session Supabase existante (l'utilisateur avait déjà une session active)
  const profil = await chargerProfilCourant();
  if(profil){
    try{ await entrerSelonRole(); return; }catch(e){ /* si le chargement échoue, on retombe sur l'écran de connexion */ }
  }
  showEspaces();
})();
