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
  {id:'scolarite', label:'Scolarité', icon:'🎓'},
  {id:'activites', label:'Activités extra-scolaires', icon:'🎨'},
  {id:'ventes', label:'Boutique scolaire', icon:'🛍️'},
  {id:'salaires', label:'Salaires', icon:'💵'},
  {id:'depenses', label:'Charges & Dépenses', icon:'🏠'},
  {id:'journal', label:"Journal d'audit", icon:'📜'},
  {id:'annees', label:'Comparaison annuelle', icon:'📅'},
  {id:'budget', label:'Budget prévisionnel', icon:'🎯'},
  {id:'syscohada', label:'Plan SYSCOHADA', icon:'📗'},
  {id:'rapprochement', label:'Rapprochement bancaire', icon:'🏦'},
];

/* --- Rôles / Interfaces --- */
const ROLES = {
  enseignant:  {label:'Enseignant(e)', icon:'👩‍🏫', desc:'Notes, présences, emploi du temps', nav:['dashboard','cahier-appel','camps-de-base','notes','presences-eleves','devoirs','emploi-temps','programmes','vie-ecole','agenda']},
  secretariat: {label:'Secrétariat', icon:'🗂️', desc:'Gestion administrative & scolarité', nav:['dashboard','eleves','liens-parents','renforcement','vie-ecole','agenda','devoirs','cantine','cahier-appel','camps-de-base','notes','presences-eleves','emploi-temps','programmes','pointage-scan','enseignants','presences-enseignants','comptabilite','messagerie']},
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
  return Math.round(n||0).toLocaleString('fr-FR') + '\u00a0' + DEVISE;
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

// Quand une fonction Edge répond avec un code d'erreur (ex : validation
// refusée), supabase-js met "data" à null et "error" à un message générique
// et inexploitable ("Edge Function returned a non-2xx status code") — le
// vrai message ({ok:false, error:"..."}) est dans le corps de la réponse,
// accessible via error.context (l'objet Response brut).
async function messageErreurFonction(error){
  try{
    if(error?.context?.json){
      const corps = await error.context.json();
      if(corps?.error) return corps.error;
    }
  }catch(_e){ /* corps non-JSON ou déjà consommé : on retombe sur error.message */ }
  return error?.message || 'Erreur inconnue';
}

function toast(msg){
  let pile = $('#toastStack');
  if(!pile){
    pile = document.createElement('div');
    pile.id = 'toastStack';
    pile.setAttribute('role', 'status');
    pile.setAttribute('aria-live', 'polite');
    document.body.appendChild(pile);
  }
  const erreur = /^(erreur|impossible|échec|echec)|❌|⚠️/i.test(String(msg).trim());
  const el = document.createElement('div');
  el.className = 'toast-item' + (erreur ? ' error' : '');
  el.textContent = msg;
  if(!erreur && window.EmIcones){
    const coche = document.createElement('span');
    coche.className = 'toast-coche'; coche.setAttribute('aria-hidden', 'true');
    coche.innerHTML = '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    el.prepend(coche);
  }
  if(erreur) el.setAttribute('role', 'alert');
  pile.appendChild(el);
  while(pile.children.length > 4) pile.firstChild.remove();
  requestAnimationFrame(()=>el.classList.add('show'));
  const duree = erreur ? 6500 : 2600;
  setTimeout(()=>{ el.classList.remove('show'); setTimeout(()=>el.remove(), 250); }, duree);
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

// Noms officiels des applications :
//   personnel : EcoMaZ-<école> · parents : EcoMaZ-PARENTS D'ELEVES <école> · portier : EcoMaZ-PORTIER <école>
function nomApplication(nomEcole){
  const n = nomEcole || (typeof DB !== 'undefined' && DB && DB.meta && DB.meta.nomEcole) || (window.ECOLE_VITRINE && window.ECOLE_VITRINE.nom_ecole) || '';
  if(window.ESPACE_FIXE === 'parent') return "EcoMaZ-PARENTS D'ELEVES" + (n ? ' ' + n : '');
  if(window.ESPACE_FIXE === 'portier') return 'EcoMaZ-PORTIER' + (n ? ' ' + n : '');
  if(window.ESPACE_FIXE === 'enseignant') return 'EcoMaZ-ENSEIGNANTS' + (n ? ' ' + n : '');
  return n ? 'EcoMaZ-' + n : 'EcoMaZ';
}
// Le nom sous l'icône du téléphone vient du manifeste : on le génère à la volée
// avec le nom de l'école (les applications Parent/Portier le font dans espace-fixe.js).
function appliquerManifestePersonnel(titre){
  try{
    const base = new URL('./', window.location.href);
    const abs = f => new URL(f, base).href;
    const m = { name: titre, short_name: titre, description: 'Gestion scolaire : élèves, notes, présences, comptabilité',
      start_url: base.href, scope: base.href, display: 'standalone', background_color: '#ffffff', theme_color: '#245840', orientation: 'portrait-primary',
      icons: [
        { src: abs('icon-192.png'), sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: abs('icon-512.png'), sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: abs('icon-maskable-512.png'), sizes: '512x512', type: 'image/png', purpose: 'maskable' } ] };
    const url = URL.createObjectURL(new Blob([JSON.stringify(m)], { type: 'application/manifest+json' }));
    let link = document.querySelector('link[rel="manifest"]');
    if(!link){ link = document.createElement('link'); link.rel = 'manifest'; document.head.appendChild(link); }
    link.href = url;
    const meta = document.querySelector('meta[name="apple-mobile-web-app-title"]');
    if(meta) meta.setAttribute('content', titre);
  }catch(_e){ /* le manifeste statique reste utilisé */ }
}
function applyBranding(){
  const m = DB.meta;
  document.title = nomApplication(m.nomEcole);
  if(!window.ESPACE_FIXE) appliquerManifestePersonnel(nomApplication(m.nomEcole));
  $('#brandSchoolName').textContent = m.nomEcole;
  $('#anneeScolaire').textContent = m.anneeScolaire;
  $('#topbarPill').textContent = m.anneeScolaire || '';
  $('#topbarPill').title = `Année scolaire ${m.anneeScolaire || ''}`;
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

/* ---------- Tableau de bord par rôle et salutations personnalisées ---------- */
const LIBELLES_ROLES = { direction:'Direction', fondation:'Fondation', secretariat:'Secrétariat', enseignant:'Enseignant', parent:'Parent', portier:'Portier', developpeur:'Développeur' };
function titreTableauDeBord(role){ return 'Tableau de bord ' + (LIBELLES_ROLES[role || ui.role] || ''); }
// Civilité : fiche enseignant (sexe) pour un enseignant, sinon le choix de la personne
const TITRES_APPEL = {
  direction: { M:'Monsieur le Directeur', F:'Madame la Directrice' },
  fondation: { M:'Monsieur le Fondateur', F:'Madame la Fondatrice' },
  secretariat: { M:'Monsieur', F:'Madame' },
  enseignant: { M:'M.', F:'Maîtresse' },
  parent: { M:'Papa', F:'Maman' },
  portier: { M:'Monsieur', F:'Madame' },
};
// Civilité : celle que la personne a choisie, sinon la fiche enseignant (sexe)
function civiliteCourante(){
  if(session.civilite === 'M' || session.civilite === 'F') return session.civilite;
  if(ui.role === 'enseignant' && session.enseignantId){
    const t = (DB?.enseignants || []).find(x => x.id === session.enseignantId);
    if(t && (t.sexe === 'M' || t.sexe === 'F')) return t.sexe;
  }
  return null;
}
function nomPourSalutation(){
  let nom = String(session.nomComplet || '').trim();
  const generique = !nom || /^(direction|fondation|secr[ée]tariat|enseignant\(?e?\)?|parent|portier|directeur|fondateur)$/i.test(nom);
  if(generique) nom = ui.role === 'direction' ? (DB?.meta?.directeurNom || '') : ui.role === 'fondation' ? (DB?.meta?.fondateurNom || '') : '';
  return nom.replace(/^(M\.|Mme|Mlle|Monsieur|Madame)\s+/i, '');
}
// Nom proposé par défaut : nom de famille pour un parent (« Maman NAHI »), nom complet sinon
function nomAppelParDefaut(){
  const nom = nomPourSalutation();
  return ui.role === 'parent' && nom ? nom.split(/\s+/).pop().toUpperCase() : nom;
}
function texteSalutation(civ, nom){
  const titres = TITRES_APPEL[ui.role];
  if(!titres || !civ) return 'Bonjour' + (nom ? ', ' + nom : '');
  return `Bonjour, ${titres[civ]}${nom ? ' ' + nom : ''}`;
}
function salutation(){ return texteSalutation(civiliteCourante(), session.nomAppel || nomAppelParDefaut()); }
// « Comment voudriez-vous que je vous appelle ? » — posée à chaque utilisateur
// tant qu'il n'a pas répondu (ou quand il veut changer)
function renderQuestionAppel(){
  if(!TITRES_APPEL[ui.role]) return '';
  if(session.nomAppel && !ui.modifierAppel) return `<button type="button" class="lien-discret appel-changer" onclick="ui.modifierAppel=true; rafraichirAccueil()">Changer comment je vous appelle</button>`;
  if(ui.appelPlusTard && !ui.modifierAppel) return '';
  const t = TITRES_APPEL[ui.role], civ = civiliteCourante() || '', nom = session.nomAppel || nomAppelParDefaut();
  return `<form class="question-appel" onsubmit="return enregistrerAppellation(event)">
    <strong>Comment voudriez-vous que je vous appelle&nbsp;?</strong>
    <div class="segmente seg-radio" role="radiogroup" aria-label="Votre titre">
      ${['M', 'F'].map(k => `<label class="seg"><input type="radio" name="civ" value="${k}" ${civ === k ? 'checked' : ''} onchange="apercuAppellation()">${escapeHtml(t[k])}</label>`).join('')}
    </div>
    <div class="field"><label for="nomAppel">Votre nom</label><input id="nomAppel" name="nom" maxlength="80" value="${escapeHtml(nom)}" placeholder="Ex : ${ui.role === 'parent' ? 'KOUAMÉ' : 'Aya KOUAMÉ'}" oninput="apercuAppellation()" autocomplete="off"></div>
    <div class="appel-apercu" id="appelApercu">${escapeHtml(texteSalutation(civ || null, nom))}</div>
    <div class="appel-actions"><button type="submit" class="btn sm">Enregistrer</button>
      <button type="button" class="lien-discret" onclick="ui.modifierAppel=false; ui.appelPlusTard=true; rafraichirAccueil()">${session.nomAppel ? 'Annuler' : 'Plus tard'}</button></div>
  </form>`;
}
function apercuAppellation(){
  const f = document.querySelector('.question-appel'); if(!f) return;
  const civ = f.querySelector('input[name=civ]:checked')?.value || null;
  const z = document.getElementById('appelApercu'); if(z) z.textContent = texteSalutation(civ, f.querySelector('#nomAppel').value.trim());
}
async function enregistrerAppellation(ev){
  ev.preventDefault();
  const f = ev.target, civ = f.querySelector('input[name=civ]:checked')?.value, nom = f.querySelector('#nomAppel').value.trim();
  if(!civ){ toast('Choisissez votre titre.'); return false; }
  if(!nom){ toast('Indiquez le nom à utiliser.'); return false; }
  const { error } = await sb.rpc('definir_appellation', { p_civilite: civ, p_nom: nom });
  if(error){ toast('Erreur : ' + error.message); return false; }
  session.civilite = civ; session.nomAppel = nom; ui.modifierAppel = false;
  try{ const k = 'ecomaz_profil_cache'; const v = JSON.parse(localStorage.getItem(k) || 'null'); if(v){ v.civilite = civ; v.nom_appel = nom; localStorage.setItem(k, JSON.stringify(v)); } }catch(_e){}
  rafraichirAccueil();
  toast('Merci, c’est noté !');
  return false;
}
function rafraichirAccueil(){
  if(ui.role === 'parent'){ $('#viewContainer').innerHTML = renderParentDashboard(); }
  else if(ui.role === 'portier'){ refreshPortierDashboard(); }
  else renderView(ui.currentView || 'dashboard');
}
function go(view){
  if(!hasAccess(view)) view = 'dashboard';
  if(ui.currentView === 'pointage-scan' && view !== 'pointage-scan' && typeof arreterScanPointage === 'function') arreterScanPointage();
  if(view!==('eleves')) ui.eleveProfileId = null;
  $$('.nav-item').forEach(b=>b.classList.toggle('active', b.dataset.view===view));
  $('#viewTitle').textContent = view === 'dashboard' ? titreTableauDeBord() : (VIEW_TITLES[view] || '');
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
    'tableau-affichage': renderTableauAffichage,
    parametres: renderParametres,
    'liens-parents': renderLiensParents,
    'vie-ecole': renderVieEcole,
    agenda: renderAgenda,
    devoirs: renderDevoirs,
    cantine: renderCantine,
    'cahier-appel': renderCahierAppel,
    'camps-de-base': renderCampsDeBase,
    renforcement: renderRenforcement,
  };
  // Données pas encore chargées, ou déjà effacées par une déconnexion (fin
  // de session, inactivité) : rien à afficher, l'écran de connexion est là.
  // Évite l'erreur « Cannot read properties of null » vue en service le 06/10.
  if(!DB) return;
  const bandeauDemo = DB.meta?.estDemo ? '<div class="bandeau-demo" role="note">🎭 École de démonstration — toutes les données sont fictives</div>' : '';
  $('#viewContainer').innerHTML = bandeauDemo + (map[view] || renderDashboard)();
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
  majBoutonsInstall();
});
window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
  const btn = $('#btnInstallApp');
  if(btn) btn.style.display = 'none';
  majBoutonsInstall();
});
// Boutons "Installer" des applications dédiées Parent / Portier
function majBoutonsInstall(){
  $$('.btn-install-pwa').forEach(b=>{ b.style.display = deferredInstallPrompt ? '' : 'none'; });
  // Le bouton remplace l'explication manuelle quand Chrome propose l'installation
  $$('.aide-install-android').forEach(el=>{ el.hidden = !!deferredInstallPrompt; });
}
// Aide à l'installation selon le téléphone et le navigateur utilisé
function aideInstallation(){
  const ua = navigator.userAgent || '';
  const dejaInstallee = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
  if(dejaInstallee) return '';
  const boite = t => `<div class="sub aide-install" style="margin-top:12px;line-height:1.5;">${t}</div>`;
  // Navigateur intégré (Facebook, Instagram, Messenger…) : installation impossible
  if(/FBAN|FBAV|FB_IAB|Instagram|Messenger|Line\/|; wv\)/i.test(ua)){
    return boite(/iphone|ipad|ipod/i.test(ua)
      ? '📲 Pour installer l’application, ouvrez ce lien dans <strong>Safari</strong> : touchez <strong>⋯</strong> puis <strong>Ouvrir dans Safari</strong>.'
      : '📲 Pour installer l’application, ouvrez ce lien dans <strong>Chrome</strong> : touchez <strong>⋮</strong> puis <strong>Ouvrir dans Chrome</strong>.');
  }
  if(/iphone|ipad|ipod/i.test(ua)){
    return boite(/CriOS|FxiOS|EdgiOS/i.test(ua)
      ? '📲 Pour installer sur iPhone : ouvrez ce lien dans <strong>Safari</strong>, puis <strong>Partager</strong> → <strong>Sur l’écran d’accueil</strong>.'
      : '📲 Pour installer sur iPhone : touchez <strong>Partager</strong> (carré avec une flèche) puis <strong>Sur l’écran d’accueil</strong>.');
  }
  if(/android/i.test(ua)){
    return `<div class="sub aide-install aide-install-android" style="margin-top:12px;line-height:1.5;" ${deferredInstallPrompt ? 'hidden' : ''}>📲 Pour installer : menu <strong>⋮</strong> de Chrome → <strong>Installer l’application</strong> (ou <strong>Ajouter à l’écran d’accueil</strong>).</div>`;
  }
  return '';
}
document.addEventListener('click', async (e) => {
  if(!e.target.closest || !e.target.closest('.btn-install-pwa') || !deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  majBoutonsInstall();
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
  { key:'parent',      ic:'👪' },
  { key:'portier',     ic:'🚪' },
];
// Parent et Portier ont leurs propres applications installables (parent.html /
// portier.html, voir espace-fixe.js) : la page principale ne propose que le personnel.
const ESPACES_PERSONNEL = ESPACES_DEF.filter(e=>e.key!=='parent' && e.key!=='portier');
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
      <div class="login-logo login-marque" aria-hidden="true">E</div>
      <h1>${t('espaces_bienvenue')}</h1>
      <div class="sub">${t('espaces_sub')}</div>
      <div class="role-grid">
        ${ESPACES_PERSONNEL.map(e=>`
          <button type="button" class="role-card" onclick="chooseEspace('${e.key}')">
            <span class="ric">${e.ic}</span>
            <span class="rtxt"><span class="rlabel">${t('espace_'+e.key+'_label')}</span>
            <span class="rdesc">${t('espace_'+e.key+'_desc')}</span></span>
            <span class="rchev" aria-hidden="true">›</span>
          </button>`).join('')}
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
  const fixe = window.ESPACE_FIXE;
  const ecoleV = window.ECOLE_VITRINE;
  const logoHtml = (fixe && ecoleV && ecoleV.logo_url)
    ? `<img src="${escapeHtml(ecoleV.logo_url)}" alt="" style="width:64px;height:64px;border-radius:var(--r-lg);object-fit:cover;background:#fff;">`
    : (fixe && ecoleV && ecoleV.nom_ecole) ? `<span class="login-initiales">${escapeHtml(String(ecoleV.nom_ecole).replace(/^(école|ecole|groupe scolaire|gs)\s+/i, '').split(/\s+/).slice(0, 2).map(m => m.charAt(0)).join('').toUpperCase())}</span>`
    : (espace ? espace.ic : '🎓');
  const titreLogin = fixe
    ? (ecoleV ? escapeHtml(nomApplication(ecoleV.nom_ecole)) : t('app_name'))
    : (espace ? t('login_espace_prefix') + t('espace_'+espace.key+'_label') : t('app_name'));
  const iosHint = fixe ? aideInstallation() : '';
  return `
    <div class="login-card">
      <div class="login-logo">${logoHtml}</div>
      <h1>${titreLogin}</h1>
      ${fixe ? `<div class="sub" style="font-weight:700;margin-bottom:2px;">${t('espace_'+fixe+'_label')}</div>` : ''}
      <div class="sub">${t('login_sub')}</div>
      <form class="pin-pad" onsubmit="return handleLoginSubmit(event)">
        <div class="field" style="text-align:left;margin-bottom:10px;">
          <label>${t('label_email')}</label>
          <input type="email" id="loginEmail" required autocomplete="username" autocapitalize="off" autocorrect="off" spellcheck="false" inputmode="email" value="${escapeHtml(window.__dernierEmail||'')}" ${window.__dernierEmail?'':'autofocus'}>
        </div>
        <div class="field" style="text-align:left;">
          <label>${t('label_password')}</label>
          <div style="position:relative;">
            <input type="password" id="loginPassword" required autocomplete="current-password" autocapitalize="off" autocorrect="off" spellcheck="false" style="padding-right:84px;" ${window.__dernierEmail?'autofocus':''}>
            <button type="button" class="btn secondary sm" style="position:absolute;right:6px;top:50%;transform:translateY(-50%);" onclick="const i=$('#loginPassword');const v=i.type==='password';i.type=v?'text':'password';this.textContent=v?'Cacher':'Voir';">Voir</button>
          </div>
        </div>
        <div class="pin-error">${error ? escapeHtml(error) : ''}</div>
        <button class="btn" type="submit" style="width:100%;margin-top:14px;" ${loading?'disabled':''}>${loading?t('btn_login_loading'):t('btn_login')}</button>
        <button type="button" class="pin-back" onclick="showForgotPassword()">${t('btn_forgot')}</button>
        ${fixe ? '' : `<button type="button" class="pin-back" onclick="showEspaces()">${t('btn_change_espace')}</button>`}
      </form>
      ${fixe ? `<div class="sub" style="margin:16px 0 8px;">— ou —</div>
        <button type="button" class="btn secondary" style="width:100%;" onclick="handleGoogleLogin()">🔵 Continuer avec Google</button>
        <div class="sub" style="margin-top:6px;font-size:var(--fs-xs);">Première fois ? Connectez-vous avec Google : l'école validera votre accès.</div>` : ''}
      ${fixe ? `<button type="button" class="btn btn-install-pwa" style="display:none;width:100%;margin-top:10px;">📲 Installer l'application sur ce téléphone</button>${iosHint}` : ''}
    </div>`;
}
// Démarrage : écran de chargement et écran d'erreur réseau (sans déconnecter)
function afficherChargementDemarrage(){
  const gate = $('#loginGate'); if(!gate) return;
  gate.classList.add('open');
  gate.innerHTML = `<div class="login-card demarrage" role="status" aria-live="polite">
    <div class="login-logo login-marque demarrage-logo" aria-hidden="true">E</div>
    <h1>Ouverture de votre espace…</h1>
    <div class="sub">Nous chargeons les données de votre école.</div>
    <div class="demarrage-barre" aria-hidden="true"><div></div></div>
  </div>`;
}
function afficherErreurDemarrage(){
  const gate = $('#loginGate'); if(!gate) return;
  $('#appRoot').style.display = 'none';
  gate.classList.add('open');
  gate.innerHTML = `<div class="login-card demarrage" role="alert">
    <div class="login-logo" aria-hidden="true">${icone('plug') || '⚠️'}</div>
    <h1>Connexion impossible pour le moment</h1>
    <div class="sub">Vos données sont en sécurité et vous êtes toujours connecté(e). Vérifiez la connexion internet (données mobiles ou Wi-Fi), puis réessayez.</div>
    <button type="button" class="btn" style="width:100%;" onclick="location.reload()">Réessayer</button>
    <button type="button" class="pin-back" onclick="showEspaces()">Revenir à l’écran de connexion</button>
  </div>`;
}
function showEspaces(){
  if(window.ESPACE_FIXE){ chooseEspace(window.ESPACE_FIXE); return; }
  stopIdleWatcher();
  document.body.classList.remove('theme-parent');
  $('#appRoot').style.display = 'none';
  $('#loginGate').classList.add('open');
  $('#loginGate').innerHTML = renderLoginGate('espaces');
}
function chooseEspace(key){
  ui.espaceChoisi = key;
  document.body.classList.toggle('theme-parent', key === 'parent');
  showLoginGate();
}
function showLoginGate(error){
  stopIdleWatcher();
  $('#appRoot').style.display = 'none';
  $('#loginGate').classList.add('open');
  $('#loginGate').innerHTML = renderLoginGate('login', error);
  majBoutonsInstall();
}
async function handleGoogleLogin(){
  const r = await connexionGoogle();
  if(!r.ok) showLoginGate(r.message);
}
// Compte Google/réseau social sans profil : demande d'accès à valider par l'école.
async function showDemandeAcces(){
  const user = await utilisateurAuthCourant();
  const ecoleId = window.ECOLE_VITRINE && window.ECOLE_VITRINE.id;
  $('#appRoot').style.display = 'none';
  $('#loginGate').classList.add('open');
  if(!user || !ecoleId){ showLoginGate("Impossible d'identifier l'établissement. Ouvrez le lien fourni par l'école."); return; }
  const fixe = window.ESPACE_FIXE;
  const { data: demandes } = await sb.from('demandes_acces').select('*').eq('user_id', user.id).eq('ecole_id', ecoleId).eq('role_demande', fixe);
  const dem = demandes && demandes[0];
  const nomEcole = escapeHtml(window.ECOLE_VITRINE.nom_ecole);
  const carte = (icone, titre, corps) => `<div class="login-card"><div class="login-logo">${icone}</div><h1>${escapeHtml(nomApplication(window.ECOLE_VITRINE.nom_ecole))}</h1><div class="sub" style="font-weight:700;">${titre}</div><div class="sub">${corps}</div>
    <button type="button" class="btn secondary" style="width:100%;margin-top:14px;" onclick="logoutDemande()">Changer de compte</button></div>`;
  if(dem && dem.statut === 'en_attente'){
    $('#loginGate').innerHTML = carte('⏳', 'Demande envoyée', `Compte : <strong>${escapeHtml(user.email||'')}</strong><br>L'école doit valider votre accès. Revenez plus tard : vous entrerez automatiquement dès que ce sera fait.<br><button type="button" class="btn sm" style="margin-top:10px;" onclick="location.reload()">🔄 Vérifier maintenant</button>`);
    return;
  }
  if(dem && dem.statut === 'refusee'){
    $('#loginGate').innerHTML = carte('🚫', 'Demande refusée', "L'école n'a pas validé cette demande. Contactez l'établissement.");
    return;
  }
  const nomDefaut = (user.user_metadata && (user.user_metadata.full_name || user.user_metadata.name)) || '';
  const parent = fixe === 'parent', enseignant = fixe === 'enseignant';
  window.__enfantsChoisis = new Map();
  let classesHtml = '';
  if(enseignant){
    const { data: classes } = await sb.rpc('classes_demande', { p_ecole: ecoleId });
    classesHtml = (classes || []).map(c => `<label class="enrol-choix"><input type="checkbox" class="demClasse" value="${escapeHtml(c.id)}"> ${escapeHtml(c.nom)}</label>`).join('') || '<div class="hint">Aucune classe n’est encore créée par l’école.</div>';
  }
  $('#loginGate').innerHTML = `<div class="login-card"><div class="login-logo">${parent?'👪':enseignant?'👩‍🏫':'🚪'}</div><h1>${escapeHtml(nomApplication(window.ECOLE_VITRINE.nom_ecole))}</h1>
    <div class="sub" style="font-weight:700;">${parent ? 'Inscription parent' : enseignant ? 'Inscription enseignant' : 'Demande d’accès portier'}</div>
    <div class="sub">Compte Google : <strong>${escapeHtml(user.email||'')}</strong></div>
    <form class="pin-pad" onsubmit="return handleDemandeAcces(event)">
      <div class="field" style="text-align:left;margin-bottom:10px;"><label>Votre nom complet (prénom et nom)</label><input type="text" id="demNom" required minlength="3" value="${escapeHtml(nomDefaut)}"></div>
      ${enseignant ? `<div class="field" style="text-align:left;margin-bottom:10px;"><label>Votre numéro WhatsApp</label><input type="tel" id="demTel" required placeholder="07 00 00 00 00"></div>
        <div class="field" style="text-align:left;"><label>Cochez la ou les classes dont vous êtes l’enseignant(e)</label><div class="enrol-liste">${classesHtml}</div></div>` : ''}
      ${parent ? `<div class="field" style="text-align:left;margin-bottom:10px;"><label>Votre numéro WhatsApp</label><input type="tel" id="demTel" required placeholder="07 00 00 00 00" oninput="if(this.value.replace(/\D/g, '').length >= 10) rechercherEnfantDemande(document.getElementById('demRecherche')?.value || '')"><div class="hint" style="margin:4px 0 0;">Celui que vous avez donné à l’école : vos enfants apparaissent tout seuls et votre demande est validée plus vite.</div></div>
        <div class="field" style="text-align:left;"><label>Cochez votre enfant (ou vos enfants)</label>
          <input type="search" id="demRecherche" placeholder="Sinon, tapez le début de son nom ou de son prénom" oninput="rechercherEnfantDemande(this.value)" autocomplete="off">
          <div class="enrol-liste" id="demResultats"></div>
          <div id="demChoisis" class="enrol-choisis"></div></div>` : ''}
      ${!parent && !enseignant ? `<div class="field" style="text-align:left;"><label>Message pour la direction (facultatif)</label><input type="text" id="demMsg"></div>` : ''}
      <div class="pin-error" id="demErr"></div>
      <button class="btn" type="submit" style="width:100%;margin-top:10px;">Envoyer ma demande</button>
      <button type="button" class="pin-back" onclick="logoutDemande()">Changer de compte</button>
    </form></div>`;
}
// Recherche d'un enfant pendant l'inscription du parent (3 lettres minimum)
let __minuteurRechercheEnfant = null;
function rechercherEnfantDemande(texte){
  clearTimeout(__minuteurRechercheEnfant);
  __minuteurRechercheEnfant = setTimeout(async () => {
    const zone = document.getElementById('demResultats'); if(!zone) return;
    const tel = (document.getElementById('demTel')?.value || '').replace(/\D/g, '');
    if(texte.trim().length < 3 && tel.length < 10){ zone.innerHTML = ''; return; }
    const { data, error } = await sb.rpc('rechercher_eleves_demande', { p_ecole: window.ECOLE_VITRINE.id, p_texte: texte, p_tel: tel.length >= 10 ? tel : null });
    if(error){ zone.innerHTML = `<div class="hint" style="color:var(--accent-ink);">${escapeHtml(/Trop de recherches/.test(error.message) ? error.message : 'Recherche impossible pour le moment : vérifiez la connexion internet.')}</div>`; return; }
    zone.innerHTML = (data || []).map(e => `<label class="enrol-choix"><input type="checkbox" ${window.__enfantsChoisis.has(e.id) ? 'checked' : ''}
      onchange="choisirEnfantDemande('${e.id}', this.checked, ${escapeHtml(JSON.stringify(`${e.prenom} ${e.nom} — ${e.classe || ''}`))})"> ${escapeHtml(e.prenom + ' ' + e.nom)} <span class="hint">${escapeHtml(e.classe || '')}</span></label>`).join('')
      || (texte.trim().length >= 3 ? '<div class="hint">Aucun élève trouvé : tapez le début du nom ou du prénom, sans faute.</div>' : '');
  }, 300);
}
function choisirEnfantDemande(id, coche, libelle){
  if(coche) window.__enfantsChoisis.set(id, libelle); else window.__enfantsChoisis.delete(id);
  const z = document.getElementById('demChoisis');
  if(z) z.innerHTML = [...window.__enfantsChoisis.values()].map(l => `<span class="badge green">✓ ${escapeHtml(l)}</span>`).join(' ');
}
async function handleDemandeAcces(ev){
  ev.preventDefault();
  const fixe = window.ESPACE_FIXE;
  const ligne = { ecole_id: window.ECOLE_VITRINE.id, role_demande: fixe, nom: $('#demNom').value.trim(), message: ($('#demMsg')?.value || '').trim() };
  if(fixe === 'parent'){
    ligne.eleve_ids = [...(window.__enfantsChoisis || new Map()).keys()];
    if(!ligne.eleve_ids.length){ $('#demErr').textContent = 'Cherchez et cochez au moins un enfant.'; return false; }
    ligne.message = [...window.__enfantsChoisis.values()].join(' ; ');
    ligne.telephone = ($('#demTel')?.value || '').trim();
    if(ligne.telephone.replace(/\D/g, '').length < 8){ $('#demErr').textContent = 'Indiquez votre numéro WhatsApp.'; return false; }
  }
  if(fixe === 'enseignant'){
    ligne.classe_ids = $$('.demClasse').filter(c => c.checked).map(c => c.value);
    ligne.telephone = $('#demTel').value.trim();
    if(!ligne.classe_ids.length){ $('#demErr').textContent = 'Cochez au moins une classe.'; return false; }
  }
  const { error } = await sb.from('demandes_acces').insert(ligne);
  if(error){ $('#demErr').textContent = "Envoi impossible : " + error.message; return false; }
  sb.functions.invoke('notifier-personnel', { body: { type: 'demande_acces' } }).catch(() => {});
  showDemandeAcces();
  return false;
}
async function logoutDemande(){ await deconnexion(); showLoginGate(); }
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
  const email = $('#loginEmail').value.trim().toLowerCase();
  const password = $('#loginPassword').value;
  window.__dernierEmail = email; // conservé si le mot de passe est refusé (évite de tout retaper sur téléphone)
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
/* ---------------------------------------------------------------------
   ESPACE PARENT — écran dédié, séparé du tableau de bord/menu du
   personnel (voir chargerDBParent() dans supabase-client.js : le parent
   n'a accès, via RLS, qu'à son/ses propre(s) enfant(s)).
   --------------------------------------------------------------------- */
function enterAppParent(){
  document.body.classList.add('theme-parent');
  $('#loginGate').classList.remove('open');
  $('#appRoot').style.display = '';
  $('#sidebar').style.display = 'none';
  $('#burger').style.display = 'none';
  applyBranding();
  $('#viewTitle').innerHTML = `<span class="pt-marque em-rise" style="--i:0"><span class="pt-logo" aria-hidden="true">E</span>
    <span class="pt-textes"><span class="pt-sur">EcoMaZ Parents</span><span class="pt-ecole">${escapeHtml(DB.meta.nomEcole || '')}</span></span></span>
    <span class="sr-only">${escapeHtml(window.ESPACE_FIXE ? nomApplication() : 'Espace Parent')}</span>`;
  const pill = $('#topbarPill');
  pill.innerHTML = `${escapeHtml(session.nomComplet||'')} <button class="btn secondary sm" style="margin-left:10px;" onclick="logoutRole()">🔒 Déconnexion</button>`;
  rafraichirBulles();
  $('#viewContainer').innerHTML = renderParentDashboard();
  let nav = document.getElementById('parentNav');
  if(!nav){ nav = document.createElement('nav'); nav.id = 'parentNav'; nav.className = 'parent-nav'; nav.setAttribute('aria-label', 'Navigation de la console parent'); document.body.appendChild(nav); }
  nav.innerHTML = renderNavParent('accueil');
  document.body.classList.add('has-parent-nav');
  afficherNouveautes();
  activerPush(true);
  startIdleWatcher();
  startPollingBulles();
}
function renderActualitesParent(){
  // Trié ici (plutôt que de faire confiance à l'ordre déjà renvoyé par le
  // chargement) : la vue publique est explicitement triée pour l'espace
  // Parent, mais pas pour le chargement général du personnel — même
  // logique que renderListeActualites() côté gestion Direction.
  const actus = (DB.actualitesAffichage||[]).slice().sort((a,b)=> (b.createdAt||'').localeCompare(a.createdAt||'')).slice(0, 8);
  if(!actus.length) return '';
  const vivant = ui.role === 'parent';
  const carte = (a, i) => {
    const d = a.createdAt ? new Date(a.createdAt) : null;
    const jour = d ? d.getDate() : '';
    const mois = d ? d.toLocaleDateString('fr-FR', {month:'short'}).replace('.', '').toUpperCase() : '';
    const meta = d ? d.toLocaleDateString('fr-FR', {weekday:'long', day:'numeric', month:'long'}) : '';
    return `<article class="actu-carte${vivant ? ' em-lift em-rise' : ''}" ${vivant ? `style="animation-delay:${340 + i*70}ms"` : ''}>
      <div class="actu-date" aria-hidden="true"><span class="actu-jour">${jour}</span><span class="actu-mois">${mois}</span></div>
      <div class="actu-corps"><div class="actu-titre">${escapeHtml(a.texte)}</div>${meta ? `<div class="actu-meta">Publié le ${meta}</div>` : ''}</div>
    </article>`;
  };
  const visibles = actus.slice(0, 3), autres = actus.slice(3);
  return `<section class="panel actus-panel" aria-labelledby="titreActus">
    <div class="panel-head"><div><h2 id="titreActus">📰 Actualités</h2></div></div>
    <div class="actu-liste">${visibles.map(carte).join('')}</div>
    ${autres.length ? `<div class="actu-liste" id="actusSuite" hidden>${autres.map((a,i)=>carte(a, i)).join('')}</div>
      <button type="button" class="btn ghost sm actu-tout" aria-expanded="false" aria-controls="actusSuite" onclick="basculerActus(this)">Tout voir (${actus.length})</button>` : ''}
  </section>`;
}
// Console parent (demandes de Vehi Zoh Junior) : seule l'information la plus
// récente — l'activité à venir — défile de droite à gauche dans une bande
// jaune or en haut de l'accueil ; les précédentes restent fixes dans la case
// « Informations passées ». Toucher la bande la met en pause (et la relance) ;
// si le téléphone demande moins d'animations, le texte ne défile pas.
function actualitesTriees(){
  return (DB.actualitesAffichage||[]).slice().sort((a,b)=> (b.createdAt||'').localeCompare(a.createdAt||''));
}
/* ---------------------------------------------------------------------
   ANNONCES HORAIRES — console parent (schema.sql section 50)
   Le serveur publie chaque annonce 15 min avant le moment (début des cours,
   pauses, fin, renforcement). La console les récupère toutes les 20 s :
   encadré bien visible en haut de l'accueil, message, vibration, et
   notification du téléphone si le parent l'a autorisée.
   --------------------------------------------------------------------- */
/* ---------------------------------------------------------------------
   NOTIFICATIONS PUSH (schema.sql section 52) — le téléphone du parent
   reçoit les annonces et messages même application fermée. Clé publique
   VAPID ci-dessous (publique par nature) ; la clé privée est seulement
   dans les secrets du serveur.
   --------------------------------------------------------------------- */
const VAPID_PUBLIQUE = 'BPvimaCoVNd8hXr68GXosfSO6CsV0k5iCzaQOWFg3b_T30-z_lCbal45PtSaooq_L4Tne_XvmIgIpPNFnKAdFHw';
function pushPossible(){ return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window; }
function cleVapidOctets(){
  const b64 = VAPID_PUBLIQUE.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - VAPID_PUBLIQUE.length % 4) % 4);
  return Uint8Array.from(atob(b64), c => c.charCodeAt(0));
}
// Abonne ce téléphone et enregistre l'abonnement pour le compte connecté.
async function activerPush(silencieux){
  try{
    if(!pushPossible() || !session.userId) return false;
    if(Notification.permission !== 'granted'){
      if(silencieux) return false;
      if(await Notification.requestPermission() !== 'granted') return false;
    }
    const reg = await navigator.serviceWorker.ready;
    let abo = await reg.pushManager.getSubscription();
    if(!abo) abo = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: cleVapidOctets() });
    const j = abo.toJSON();
    // Un même téléphone peut changer de compte : le serveur remplace l'ancien enregistrement
    const { error } = await sb.rpc('enregistrer_abonnement_push', { p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth,
      p_appareil: (navigator.userAgent || '').slice(0, 160) });
    if(error) throw error;
    return true;
  }catch(e){
    if(!silencieux) alert('Impossible d’activer les notifications sur ce téléphone : ' + e.message);
    return false;
  }
}
async function desactiverPushAppareil(){
  try{
    if(!pushPossible()) return;
    const reg = await navigator.serviceWorker.getRegistration();
    const abo = reg && await reg.pushManager.getSubscription();
    if(abo) await sb.from('push_abonnements').delete().eq('endpoint', abo.endpoint);
  }catch(_e){}
}
// Après un message de l'école : prévient le téléphone des parents concernés
function notifierParentsPush(eleveIds, texte){
  const ids = [...new Set((eleveIds || []).filter(Boolean))];
  if(!ids.length) return;
  sb.functions.invoke('notifier-parents', { body: { eleveIds: ids, texte } }).catch(() => {});
}
function annonceRecente(a){
  return a && a.date === todayISO() && a.createdAt && (Date.now() - new Date(a.createdAt).getTime()) < 30 * 60 * 1000;
}
function renderAnnonceDuMoment(){
  const a = (DB.annoncesHoraires || []).filter(annonceRecente)
    .sort((x, y) => String(y.createdAt).localeCompare(String(x.createdAt)))[0];
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.navigator.standalone;
  const autoriser = ios && !pushPossible()
    ? `<div class="hint annonce-autoriser">🔔 Sur iPhone, installez d’abord l’application (Partager → Sur l’écran d’accueil) pour recevoir les notifications.</div>`
    : (pushPossible() && Notification.permission === 'default'
      ? `<div class="banniere-discrete annonce-autoriser"><span class="bd-ic" aria-hidden="true">${icone('bell')}</span><span class="bd-txt">Soyez prévenu des absences et annonces, même application fermée.</span><button type="button" class="btn sm" onclick="autoriserAlertesTelephone()">Activer</button></div>` : '');
  if(!a) return autoriser ? `<div id="annonceDuMoment">${autoriser}</div>` : '<div id="annonceDuMoment"></div>';
  const minutes = Math.max(0, Math.round((Date.now() - new Date(a.createdAt).getTime()) / 60000));
  return `<div id="annonceDuMoment">
    <div class="annonce-moment" role="status">
      <div class="annonce-moment-texte">${escapeHtml(a.contenu)}</div>
      <div class="annonce-moment-quand">${minutes ? `il y a ${minutes} min` : 'à l’instant'}</div>
    </div>${autoriser}</div>`;
}
function rafraichirAnnonceDuMoment(){
  const zone = document.getElementById('annonceDuMoment');
  if(zone) zone.outerHTML = renderAnnonceDuMoment();
}
async function autoriserAlertesTelephone(){
  const ok = await activerPush(false);
  rafraichirAnnonceDuMoment();
  if(ok) toast('Notifications activées : vous serez prévenu même application fermée');
}
async function notifierTelephone(texte){
  try{
    if(!('Notification' in window) || Notification.permission !== 'granted') return;
    const titre = DB.meta?.nomEcole || 'EcoMaZ';
    const reg = navigator.serviceWorker && await navigator.serviceWorker.getRegistration();
    if(reg) reg.showNotification(titre, { body: texte, icon: 'icon-192.png', badge: 'icon-192.png', tag: 'annonce-' + Date.now() });
    else new Notification(titre, { body: texte, icon: 'icon-192.png' });
  }catch(_e){ /* notification refusée par le navigateur : l'encadré suffit */ }
}
async function verifierNouvellesAnnonces(){
  const { data, error } = await sb.from('annonces_horaires_envoyees').select('*')
    .eq('ecole_id', session.ecoleId).eq('date', todayISO()).order('created_at', { ascending:false });
  if(error) return;
  const connues = new Set((DB.annoncesHoraires || []).map(a => a.id));
  const recues = rowsToCamel(data);
  const nouvelles = recues.filter(a => !connues.has(a.id));
  DB.annoncesHoraires = recues.concat((DB.annoncesHoraires || []).filter(a => a.date !== todayISO()));
  if(!nouvelles.length) return;
  rafraichirAnnonceDuMoment();
  // Avec les notifications push, le téléphone est déjà prévenu par le serveur : pas de doublon
  const pushActif = pushPossible() && Notification.permission === 'granted';
  nouvelles.forEach(a => { toast(a.contenu); if(!pushActif) notifierTelephone(a.contenu); });
  try{ if(navigator.vibrate) navigator.vibrate([200, 100, 200]); }catch(_e){}
}
/* ---------------------------------------------------------------------
   ABSENCES SIGNALÉES PAR LE PARENT (schema.sql section 53)
   --------------------------------------------------------------------- */
const MOTIFS_SIGNALEMENT = ['Maladie', 'Rendez-vous médical', 'Voyage familial', 'Événement familial', 'Autre'];
async function chargerAbsencesSignalees(){
  const depuis = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const { data, error } = await sb.from('absences_signalees').select('*').eq('ecole_id', session.ecoleId).gte('date_fin', depuis).order('date_debut');
  if(error) throw error;
  DB.absencesSignalees = rowsToCamel(data);
  return DB.absencesSignalees;
}
function absenceSignalee(eleveId, date){
  return (DB.absencesSignalees || []).find(a => a.eleveId === eleveId && a.dateDebut <= date && a.dateFin >= date);
}
// --- Côté parent ---
async function ouvrirSignalerAbsence(){
  openModal('📝 Signaler une absence', '<div class="hint">Chargement…</div>');
  try{ await chargerAbsencesSignalees(); }catch(_e){ DB.absencesSignalees = DB.absencesSignalees || []; }
  afficherSignalerAbsence();
}
function afficherSignalerAbsence(){
  const enfants = DB.eleves || [];
  const aVenir = (DB.absencesSignalees || []).filter(a => a.dateFin >= todayISO());
  const demain = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  openModal('📝 Signaler une absence', `
    <p class="hint" style="margin-top:0;">Votre enfant ne viendra pas à l'école ? Prévenez-la ici : l'enseignant le verra au moment de l'appel.</p>
    <form onsubmit="return handleSignalerAbsence(event)">
      ${enfants.length > 1 ? `<div class="field"><label>Enfant</label><select name="eleveId" required>${enfants.map(e => `<option value="${e.id}">${escapeHtml(eleveFullName(e))}</option>`).join('')}</select></div>`
        : `<input type="hidden" name="eleveId" value="${enfants[0]?.id || ''}">`}
      <div class="form-grid">
        <div class="field"><label>Du</label><input type="date" name="dateDebut" required min="${todayISO()}" value="${demain}"></div>
        <div class="field"><label>Au (inclus)</label><input type="date" name="dateFin" required min="${todayISO()}" value="${demain}"></div>
      </div>
      <div class="field"><label>Motif</label><select name="motif" required>${MOTIFS_SIGNALEMENT.map(m => `<option>${m}</option>`).join('')}</select></div>
      <div class="field"><label>Précision (facultatif)</label><input name="commentaire" maxlength="500" placeholder="Ex : fièvre, retour prévu lundi"></div>
      <button class="btn" type="submit" style="width:100%;">Prévenir l'école</button>
    </form>
    ${aVenir.length ? `<h4 style="margin:var(--sp-4) 0 var(--sp-2);">Absences déjà signalées</h4>${aVenir.map(a => {
      const e = enfants.find(x => x.id === a.eleveId);
      return `<div class="actu-carte" style="justify-content:space-between;"><div class="actu-corps"><div class="actu-titre">${escapeHtml(e ? eleveFullName(e) : '')} — ${escapeHtml(a.motif)}</div>
        <div class="actu-meta">${a.dateDebut === a.dateFin ? 'Le ' + fmtDate(a.dateDebut) : 'Du ' + fmtDate(a.dateDebut) + ' au ' + fmtDate(a.dateFin)}${a.commentaire ? ' · ' + escapeHtml(a.commentaire) : ''}</div></div>
        <button type="button" class="btn secondary sm" onclick="annulerAbsenceSignalee('${a.id}')">Annuler</button></div>`;
    }).join('')}` : ''}
    <div class="form-actions"><button type="button" class="btn secondary" onclick="closeModal()">Fermer</button></div>`);
}
async function handleSignalerAbsence(ev){
  ev.preventDefault();
  const fd = new FormData(ev.target);
  if(fd.get('dateFin') < fd.get('dateDebut')) return alert('La date de fin doit être après la date de début.'), false;
  const bouton = ev.target.querySelector('button[type="submit"]'); bouton.disabled = true;
  try{
    const { data, error } = await sb.from('absences_signalees').insert({
      eleve_id: fd.get('eleveId'), date_debut: fd.get('dateDebut'), date_fin: fd.get('dateFin'),
      motif: fd.get('motif'), commentaire: (fd.get('commentaire') || '').trim(), parent_nom: session.nomComplet || '',
    }).select().single();
    if(error) throw error;
    DB.absencesSignalees = (DB.absencesSignalees || []).concat(rowToCamel(data));
    sb.functions.invoke('notifier-personnel', { body: { type: 'absence' } }).catch(() => {});
    toast('L’école est prévenue, merci !');
    afficherSignalerAbsence();
  }catch(e){ bouton.disabled = false; alert('Erreur : ' + e.message); }
  return false;
}
async function annulerAbsenceSignalee(id){
  if(!confirm('Annuler ce signalement d’absence ?')) return;
  try{
    const { error } = await exigerEffet(sb.from('absences_signalees').delete().eq('id', id));
    if(error) throw error;
    DB.absencesSignalees = (DB.absencesSignalees || []).filter(a => a.id !== id);
    toast('Signalement annulé'); afficherSignalerAbsence();
  }catch(e){ alert('Erreur : ' + e.message); }
}
function renderBandeDefilanteParent(){
  const actus = actualitesTriees().slice(0, 1);
  if(!actus.length) return '';
  const textes = actus.map(a => `<span class="bande-info-item">${escapeHtml(a.texte)}</span>`).join('<span class="bande-info-sep" aria-hidden="true">✦</span>');
  const longueur = actus.reduce((n, a) => n + String(a.texte||'').length, 0);
  const duree = Math.max(14, Math.round(longueur * 0.2));      // ~5 caractères par seconde
  return `<section class="bande-info" aria-label="Actualités de l'école" onclick="this.classList.toggle('en-pause')">
    <span class="bande-info-etiquette">${window.EmIcones ? EmIcones.svg('newspaper') : '📰'} À venir</span>
    <div class="bande-info-fenetre">
      <div class="bande-info-piste" style="animation-duration:${duree}s">
        <div class="bande-info-texte">${textes}<span class="bande-info-sep" aria-hidden="true">✦</span></div>
        <div class="bande-info-texte" aria-hidden="true">${textes}<span class="bande-info-sep">✦</span></div>
      </div>
    </div>
  </section>`;
}
function renderInformationsPassees(){
  const passees = actualitesTriees().slice(1, 9);
  if(!passees.length) return '';
  return `<section class="panel actus-panel" aria-labelledby="titreInfosPassees">
    <div class="panel-head"><div><h2 id="titreInfosPassees">🗂️ Informations passées</h2></div></div>
    <div class="actu-liste">${passees.map(a => {
      const d = a.createdAt ? new Date(a.createdAt) : null;
      return `<article class="actu-carte">
        <div class="actu-date" aria-hidden="true"><span class="actu-jour">${d ? d.getDate() : ''}</span><span class="actu-mois">${d ? d.toLocaleDateString('fr-FR', {month:'short'}).replace('.', '').toUpperCase() : ''}</span></div>
        <div class="actu-corps"><div class="actu-titre">${escapeHtml(a.texte)}</div>${d ? `<div class="actu-meta">Publié le ${d.toLocaleDateString('fr-FR', {weekday:'long', day:'numeric', month:'long'})}</div>` : ''}</div>
      </article>`;
    }).join('')}</div>
  </section>`;
}
function basculerActus(btn){
  const suite = document.getElementById('actusSuite');
  if(!suite) return;
  const ouvrir = suite.hidden;
  suite.hidden = !ouvrir;
  btn.setAttribute('aria-expanded', String(ouvrir));
  btn.textContent = ouvrir ? 'Voir moins' : `Tout voir (${(DB.actualitesAffichage||[]).slice(0,8).length})`;
}
const HONNEUR_BADGES = { mois:'Mois', trimestre:'Trimestre', annee:'Année' };
const ENABLE_APPLAUSE = true;
function applaudissementsDe(categorie, nom){
  const cle = String(nom||'').trim().toLowerCase();
  return (DB.applaudissements||[]).find(a => a.categorie === categorie && a.nomCle === cle) || { total:0, moi:false };
}
async function applaudir(btn){
  if(!ENABLE_APPLAUSE || btn.getAttribute('aria-pressed') === 'true' || btn.dataset.envoi) return;
  btn.dataset.envoi = '1';
  const { categorie, nom } = btn.dataset;
  try{
    const { data, error } = await sb.rpc('applaudir_honneur', { p_categorie: categorie, p_nom: nom });
    if(error) throw error;
    const cle = String(nom).trim().toLowerCase();
    DB.applaudissements = (DB.applaudissements||[]).filter(a => !(a.categorie === categorie && a.nomCle === cle));
    DB.applaudissements.push({ categorie, nomCle: cle, total: data, moi: true });
    const compteur = btn.querySelector('.hn-applause-n');
    if(compteur){ compteur.textContent = String(data); if(window.EmMotion) EmMotion.replay(compteur, 'em-bump'); }
    if(window.EmMotion) EmMotion.burst(btn.closest('.hn-carte'));
    btn.setAttribute('aria-pressed', 'true');
    btn.disabled = true;
    const lib = btn.querySelector('.hn-applause-lib'); if(lib) lib.textContent = 'Applaudi';
  }catch(e){
    toast('Erreur : applaudissement non enregistré, réessayez.');
  }finally{ delete btn.dataset.envoi; }
}
function initialesHonneur(nom){
  const mots = String(nom||'').replace(/\b(M|Mme|Mlle|Mr|Dr|Pr)\.?(?=\s)/gi, ' ').trim().split(/\s+/).filter(Boolean);
  return ((mots[0]||'')[0] || '') + ((mots[mots.length-1]||'')[0] && mots.length > 1 ? mots[mots.length-1][0] : '');
}
function laureatsHonneur(categorie){
  const groupes = [];
  HONNEUR_PERIODES.forEach(per => {
    const h = honneurActuel(categorie, per.id);
    if(!h || !h.nomAffiche) return;
    const cle = h.nomAffiche.trim().toLowerCase();
    let g = groupes.find(x => x.cle === cle);
    if(!g){ g = { cle, nom:h.nomAffiche.trim(), detail:h.classeOuMatiere||'', commentaire:'', periodes:[] }; groupes.push(g); }
    g.periodes.push(per.id);
    if(!g.detail && h.classeOuMatiere) g.detail = h.classeOuMatiere;
    if(!g.commentaire && h.commentaire) g.commentaire = h.commentaire;
  });
  return groupes;
}
function renderTableauHonneurParent(){
  const auMoinsUn = (DB.tableauHonneur||[]).some(h=>h.nomAffiche);
  if(!auMoinsUn) return '';
  const groupes = HONNEUR_CATEGORIES.map(cat => ({ cat, laureats: laureatsHonneur(cat.id) })).filter(g => g.laureats.length);
  const vivant = ui.role === 'parent';
  let rang = 0;
  return `<div class="panel">
    <div class="panel-head"><div><h2>🏆 Tableau d'honneur</h2></div></div>
    ${groupes.map(({cat, laureats}) => `
      <div class="hn-sous-titre">${cat.icon} ${cat.id === 'eleve' ? 'Élève(s) à l’honneur' : 'Enseignant·e(s) à l’honneur'}</div>
      <div class="hn-rangee" role="list">
        ${laureats.map((l, i) => `<article class="hn-carte${cat.id === 'eleve' && i === 0 ? ' hn-carte--une' : ''}${vivant ? ' em-rise' : ''}" role="listitem" ${vivant ? `style="animation-delay:${560 + (rang++)*90}ms"` : ''}>
          <div class="hn-avatar${vivant && cat.id === 'eleve' && i === 0 ? ' em-glow' : ''}" aria-hidden="true">${escapeHtml(initialesHonneur(l.nom).toUpperCase())}</div>
          <strong class="hn-nom">${escapeHtml(l.nom)}</strong>
          ${l.detail ? `<span class="hn-detail">${escapeHtml(l.detail)}</span>` : ''}
          <span class="hn-badges">${l.periodes.map(p => `<span class="hn-badge">${HONNEUR_BADGES[p] || p}</span>`).join('')}</span>
          ${l.commentaire ? `<span class="hn-mot">« ${escapeHtml(l.commentaire)} »</span>` : ''}
          ${ENABLE_APPLAUSE && vivant ? (() => { const ap = applaudissementsDe(cat.id, l.nom); return `<button type="button" class="hn-applause em-press" data-categorie="${cat.id}" data-nom="${escapeHtml(l.nom)}" aria-pressed="${ap.moi}" ${ap.moi ? 'disabled' : ''} onclick="applaudir(this)" aria-label="Applaudir ${escapeHtml(l.nom)}">${window.EmIcones ? EmIcones.svg('thumbs-up') : ''}<span class="hn-applause-lib">${ap.moi ? 'Applaudi' : 'Applaudir'}</span><span class="hn-applause-n" aria-live="polite">${ap.total}</span></button>`; })() : ''}
        </article>`).join('')}
      </div>
    `).join('')}
  </div>`;
}
const JOURS_SEMAINE = ['Lun','Mar','Mer','Jeu','Ven'];
const JOURS_LONGS = ['lundi','mardi','mercredi','jeudi','vendredi'];
function isoLocal(d){ return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function renderPresenceSemaine(e){
  if(!Array.isArray(DB.presencesSemaine)) return '';
  const lundi = debutSemaine(new Date());
  const aujourdhui = isoLocal(new Date());
  const cases = JOURS_SEMAINE.map((lib, i) => {
    const d = new Date(lundi); d.setDate(lundi.getDate() + i);
    const iso = isoLocal(d);
    const p = DB.presencesSemaine.find(x => x.eleveId === e.id && x.date === iso);
    const futur = iso > aujourdhui;
    let etat = 'vide', libelle = 'non renseigné';
    if(p && p.statut === 'Présent'){ etat = 'present'; libelle = 'présent'; }
    else if(p && p.statut === 'Retard'){ etat = 'retard'; libelle = 'en retard'; }
    else if(p && p.statut === 'Absent'){ etat = 'absent'; libelle = 'absent'; }
    else if(futur){ etat = 'futur'; libelle = 'à venir'; }
    const coche = (etat === 'present' || etat === 'retard')
      ? `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>` : '';
    return `<div class="sem-jour">
      <div class="sem-case sem-${etat}${iso === aujourdhui ? ' sem-auj' : ''}" role="img" aria-label="${JOURS_LONGS[i]} : ${libelle}">
        ${coche ? `<span class="sem-remplir em-fill-y" style="animation-delay:${520 + i*110}ms">${coche}</span>` : ''}
        ${etat === 'absent' ? '<span class="sem-point" aria-hidden="true"></span>' : ''}
      </div>
      <span class="sem-lib" aria-hidden="true">${lib}</span>
    </div>`;
  }).join('');
  const aucun = !DB.presencesSemaine.some(x => x.eleveId === e.id);
  return `<div class="sem-bloc">
    <div class="sem-titre">Présence de la semaine</div>
    <div class="sem-grille">${cases}</div>
    ${aucun ? '<div class="sem-note">L’appel de cette semaine n’a pas encore été enregistré par l’école.</div>' : ''}
    <button type="button" class="btn secondary sm" style="margin-top:8px;" onclick="ouvrirHistoriquePresences('${e.id}')">📅 Historique depuis la rentrée</button>
  </div>`;
}
// Console parent : présences depuis la rentrée (RLS : ses enfants seulement)
async function ouvrirHistoriquePresences(eleveId){
  const e = (DB.eleves || []).find(x => x.id === eleveId);
  openModal('📅 Présences de ' + (e ? e.prenom : ''), '<div class="hint">Chargement…</div>');
  const auj = new Date();
  const rentree = `${auj.getMonth() >= 8 ? auj.getFullYear() : auj.getFullYear() - 1}-09-01`;
  try{
    const { data, error } = await sb.from('presences_eleves').select('date, statut, motif').eq('eleve_id', eleveId).gte('date', rentree).order('date', { ascending:false });
    if(error) throw error;
    const lignes = rowsToCamel(data || []);
    if(!lignes.length){ $('#modalBody').innerHTML = '<div class="empty-state"><div class="em-ic">📅</div>Aucun appel enregistré depuis la rentrée.</div>'; return; }
    const compte = (l, s) => l.filter(p => p.statut === s).length;
    const abs = compte(lignes, 'Absent'), ret = compte(lignes, 'Retard');
    const taux = Math.round(100 * (lignes.length - abs) / lignes.length);
    const mois = {};
    lignes.forEach(p => { (mois[p.date.slice(0, 7)] ||= []).push(p); });
    const nomMois = (k) => new Date(k + '-15T12:00:00').toLocaleDateString('fr-FR', { month:'long', year:'numeric' });
    const evenements = lignes.filter(p => p.statut === 'Absent' || p.statut === 'Retard');
    $('#modalTitle').textContent = '📅 Présences de ' + (e ? eleveFullName(e) : '');
    $('#modalBody').innerHTML = `
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;">
        <span class="badge green">${taux} % de présence</span><span class="badge">${lignes.length} jour(s) d’appel</span>
        <span class="badge red">${abs} absence(s)</span><span class="badge amber">${ret} retard(s)</span></div>
      <div class="table-wrap"><table>
        <thead><tr><th>Mois</th><th>Jours</th><th>Absences</th><th>Retards</th></tr></thead>
        <tbody>${Object.keys(mois).sort().reverse().map(k => `<tr><td style="text-transform:capitalize;">${nomMois(k)}</td><td>${mois[k].length}</td><td>${compte(mois[k], 'Absent') || '—'}</td><td>${compte(mois[k], 'Retard') || '—'}</td></tr>`).join('')}</tbody>
      </table></div>
      ${evenements.length ? `<h4 style="margin:14px 0 6px;">Détail des absences et retards</h4>
        ${evenements.map(p => `<div style="padding:4px 0;border-bottom:1px solid var(--border);"><span class="badge ${p.statut === 'Absent' ? 'red' : 'amber'}">${p.statut === 'Absent' ? 'Absent' : 'Retard'}</span> ${new Date(p.date + 'T12:00:00').toLocaleDateString('fr-FR', { weekday:'long', day:'numeric', month:'long' })}${p.motif ? ` <span class="hint">— ${escapeHtml(p.motif)}</span>` : ''}</div>`).join('')}`
        : '<p class="hint">Aucune absence ni aucun retard depuis la rentrée. Bravo ! 👏</p>'}
      <p class="hint" style="margin-top:12px;">Une absence à venir ? Utilisez « Signaler une absence à l’avance » sur l’accueil.</p>`;
  }catch(err){ $('#modalBody').innerHTML = `<div class="hint">Erreur : ${escapeHtml(err.message)}</div>`; }
}
function renderAlerteAbsence(enfants){
  if(!Array.isArray(DB.presencesSemaine)) return '';
  const auj = isoLocal(new Date());
  const absents = enfants.filter(e => DB.presencesSemaine.some(x => x.eleveId === e.id && x.date === auj && x.statut === 'Absent'));
  if(!absents.length) return '';
  return absents.map(e => `<div class="alerte-absence" role="alert">
    <span class="alerte-ic" aria-hidden="true">${window.EmIcones ? EmIcones.svg('triangle-alert') : '⚠️'}</span>
    <div><strong>${escapeHtml(e.prenom || eleveFullName(e))} est noté(e) absent(e) aujourd’hui.</strong>
      <div class="alerte-sous">Les détails sont dans vos notifications.</div></div>
    <button type="button" class="btn sm" onclick="event.stopPropagation(); toggleBulle('notif')">Voir</button>
  </div>`).join('');
}
// Bulletin d'un élève pour un trimestre (même calcul que la fiche élève du personnel)
function calculBulletin(eleveId, trimestre){
  const e = eleveById(eleveId);
  const matieres = MATIERES_BY_CYCLE[classeCycle(e?.classeId)] || [];
  let somme = 0, nb = 0;
  const cycle = classeCycle(e?.classeId);
  const lignes = matieres.map(mat => {
    const m = moyenneMatiere(eleveId, mat, trimestre), coef = coefficientDe(cycle, mat);
    if(m.moy !== null){ somme += m.moy * coef; nb += coef; }   // moyenne pondérée par les coefficients
    const arr = v => v === null ? null : Math.round(v * 100) / 100;
    return { mat, devoir: arr(m.classe), compo: arr(m.compo), moy: m.moy, coef };
  });
  return { lignes, moyenne: nb ? somme / nb : null };
}
// Console parent : bulletin de l'enfant (trimestres publiés par l'école)
function renderBulletinEnfant(e){
  const publies = (DB.meta?.bulletinsPublies || []).filter(t => (DB.notes || []).some(n => n.eleveId === e.id && n.trimestre === t));
  if(!publies.length) return '';
  const t = (ui.filters.bulletinParent || {})[e.id] || publies[publies.length - 1];
  const b = calculBulletin(e.id, t);
  const fige = (DB.bulletinsResultats || []).find(x => x.eleveId === e.id && x.trimestre === t);
  if(fige){ b.moyenne = Number(fige.moyenne); b.lignes = (fige.details || []).map(d => ({ mat: d.matiere, devoir: d.classe, compo: d.compo, moy: d.moy, coef: d.coef })); }
  const app = (DB.bulletinsComments || {})[`${e.id}_${t}`];
  return `<details class="enfant-bulletin"><summary>📒 Bulletin — ${escapeHtml(t)}${b.moyenne !== null ? ` · moyenne ${b.moyenne.toFixed(2)}/20` : ''}</summary>
    ${publies.length > 1 ? `<div class="filters" style="margin:8px 0;"><select onchange="ui.filters.bulletinParent = Object.assign(ui.filters.bulletinParent || {}, { '${e.id}': this.value }); $('#viewContainer').innerHTML = renderParentDashboard();">${publies.map(x => `<option ${x===t?'selected':''}>${escapeHtml(x)}</option>`).join('')}</select></div>` : ''}
    <table class="eb-table"><thead><tr><th>Matière</th><th>Classe</th><th>Compo.</th><th>Moy.</th></tr></thead>
      <tbody>${b.lignes.filter(l => l.moy !== null).map(l => `<tr><td>${escapeHtml(l.mat)}</td><td>${l.devoir ?? '—'}</td><td>${l.compo ?? '—'}</td><td><strong>${l.moy.toFixed(1)}</strong></td></tr>`).join('')}</tbody></table>
    ${b.moyenne !== null ? `<div class="eb-moyenne">Moyenne générale : <strong>${b.moyenne.toFixed(2)} / 20</strong> — ${escapeHtml(mentionFromAvg(b.moyenne))}</div>` : ''}
    ${fige ? `<div class="eb-moyenne">Rang : <strong>${rangTexte(fige.rang, fige.exAequo)} sur ${fige.effectif}</strong> · Moyenne de la classe : ${Number(fige.moyenneClasse).toFixed(2)}</div>` : ''}
    ${app ? `<div class="eb-appreciation"><strong>Appréciation :</strong> ${escapeHtml(app)}</div>` : ''}
    <button type="button" class="btn secondary sm" style="margin-top:8px;" onclick="ouvrirBulletinImprimable('${e.id}', ${escapeHtml(JSON.stringify(t))})">🖨️ Imprimer / enregistrer en PDF</button>
  </details>`;
}
// Console parent : bulletin au format document (imprimer ou « Enregistrer en PDF » depuis le téléphone)
function ouvrirBulletinImprimable(eleveId, trimestre){
  const e = (DB.eleves || []).find(x => x.id === eleveId);
  if(!e) return;
  const b = calculBulletin(e.id, trimestre);
  const app = (DB.bulletinsComments || {})[`${e.id}_${trimestre}`];
  const m = DB.meta || {};
  openModal('📒 Bulletin', `
    <div class="recu certif">
      <div class="recu-head">${m.logo ? `<img src="${m.logo}" alt="">` : `<div class="recu-logo-ph">🎓</div>`}
        <div><strong>${escapeHtml(m.nomEcole || '')}</strong><div class="hint">${escapeHtml(m.adresse || '')}${m.telephone ? ' · ' + escapeHtml(m.telephone) : ''}</div></div></div>
      <div class="recu-title">BULLETIN — ${escapeHtml(String(trimestre).toUpperCase())}</div>
      <div class="recu-row"><span>Élève</span><strong>${escapeHtml(eleveFullName(e))}</strong></div>
      <div class="recu-row"><span>Classe</span><strong>${escapeHtml(classeName(e.classeId))}</strong></div>
      <div class="recu-row"><span>Année scolaire</span><strong>${escapeHtml(m.anneeScolaire || '')}</strong></div>
      <table class="eb-table" style="margin-top:12px;"><thead><tr><th>Matière</th><th>Classe</th><th>Compo.</th><th>Moy.</th></tr></thead>
        <tbody>${b.lignes.filter(l => l.moy !== null).map(l => `<tr><td>${escapeHtml(l.mat)}</td><td>${l.devoir ?? '—'}</td><td>${l.compo ?? '—'}</td><td><strong>${l.moy.toFixed(1)}</strong></td></tr>`).join('')}</tbody></table>
      ${b.moyenne !== null ? `<div class="eb-moyenne" style="margin-top:10px;">Moyenne générale : <strong>${b.moyenne.toFixed(2)} / 20</strong> — ${escapeHtml(mentionFromAvg(b.moyenne))}</div>` : ''}
      ${app ? `<div class="eb-appreciation"><strong>Appréciation :</strong> ${escapeHtml(app)}</div>` : ''}
      <p class="hint" style="margin-top:14px;">Document consulté dans l’application des parents le ${fmtDate(todayISO())}. Le bulletin officiel signé est remis par l’établissement.</p>
    </div>
    <div class="form-actions no-print"><button type="button" class="btn secondary" onclick="closeModal()">Fermer</button><button type="button" class="btn" onclick="window.print()">🖨️ Imprimer / PDF</button></div>`);
}
// Console parent : scolarité de l'enfant (si l'école l'a rendue visible)
function renderScolariteEnfant(e){
  if(!DB.meta?.scolariteVisibleParents) return '';
  const info = scolariteEleveParEcheance(e.id);
  if(!info.total) return '';
  const recus = (DB.paiementsScolarite || []).filter(p => p.eleveId === e.id);
  const pct = Math.min(100, Math.round(100 * info.totalPaye / info.total));
  const prochaine = info.detail.find(d => d.statut !== 'paye');
  return `<div class="enfant-scolarite">
    <div class="es-tete"><strong>Scolarité ${escapeHtml(DB.meta?.anneeScolaire || '')}</strong><span>${fmtFCFA(info.totalPaye)} / ${fmtFCFA(info.total)}</span></div>
    <div class="mer-barre" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><div style="width:${pct}%"></div></div>
    <div class="es-reste">${info.reste ? `Reste à payer : <strong>${fmtFCFA(info.reste)}</strong>${prochaine ? ` · prochaine tranche : ${escapeHtml(prochaine.label)}` : ''}` : '✅ Scolarité soldée, merci !'}</div>
    <details class="es-detail"><summary>Voir les tranches${recus.length ? ' et les paiements' : ''}</summary>
      <ul>${info.detail.map(d => `<li><span>${escapeHtml(d.label)}</span><span class="badge ${d.statut === 'paye' ? 'green' : d.statut === 'partiel' ? 'amber' : 'gray'}">${d.statut === 'paye' ? 'payé' : d.statut === 'partiel' ? fmtFCFA(d.paye) + ' / ' + fmtFCFA(d.montant) : fmtFCFA(d.montant)}</span></li>`).join('')}</ul>
      ${recus.length ? `<div class="hint" style="margin:6px 0 2px;">Paiements reçus :</div><ul>${recus.map(p => `<li><span>${fmtDate(p.date)} — ${escapeHtml(p.tranche || '')}</span><span>${fmtFCFA(p.montant)} (${escapeHtml(p.modePaiement || '')})</span></li>`).join('')}</ul>` : ''}
    </details>
  </div>`;
}
// Console parent : notes des Camps de base au fil de l'eau (si l'école l'a activé)
function renderNotesContinuesEnfant(e){
  if(!DB.meta?.notesContinuesParents) return '';
  const t = trimestreCourant();
  const notes = (DB.notes || []).filter(n => n.eleveId === e.id && n.evaluationId && n.trimestre === t && n.note != null)
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  if(!notes.length) return '';
  const ev = id => (DB.evaluations || []).find(x => x.id === id) || {};
  const matieres = [...new Set(notes.map(n => n.matiere))];
  return `<details class="enfant-bulletin"><summary>📝 Notes du ${escapeHtml(t)} (${notes.length})</summary>
    <div class="nc-moyennes">${matieres.map(mat => { const m = moyenneMatiere(e.id, mat, t); return m.classe !== null ? `<span class="badge ${m.classe >= 10 ? 'green' : 'red'}">${escapeHtml(mat)} : ${m.classe.toFixed(1)}/20</span>` : ''; }).join(' ')}</div>
    <table class="eb-table"><thead><tr><th>Date</th><th>Matière</th><th>Évaluation</th><th>Note</th></tr></thead>
      <tbody>${notes.slice(0, 15).map(n => { const v = ev(n.evaluationId); return `<tr><td>${n.date ? fmtDate(n.date).slice(0, 5) : ''}</td><td>${escapeHtml(n.matiere)}</td>
        <td>${ICONES_EVAL[n.type] || ''} ${escapeHtml(v.titre || n.type || '')}</td><td><strong>${Number(n.note)}</strong>/${Number(n.noteSur) || 20}</td></tr>`; }).join('')}</tbody></table>
    <div class="hint">Moyenne en cours des devoirs et exercices (la composition s’ajoute au bulletin).</div>
  </details>`;
}
function renderFicheEnfant(e){
  const ini = initials(e.prenom, e.nom);
  return `<article class="enfant-carte">
    <div class="enfant-tete">
      <div class="enfant-avatar em-pop" style="animation-delay:320ms" aria-hidden="true">${escapeHtml(ini)}</div>
      <div class="enfant-id">
        <h3 class="enfant-nom">${escapeHtml(eleveFullName(e))}</h3>
        <div class="enfant-classe">${escapeHtml(classeName(e.classeId))} <span class="enfant-statut">${escapeHtml(e.statut || '')}</span></div>
      </div>
    </div>
    ${renderAnniversaireEnfant(e)}
    <dl class="enfant-details">
      <div><dt>Matricule</dt><dd>${escapeHtml(e.matricule || '—')}</dd></div>
      <div><dt>Naissance</dt><dd>${fmtDate(e.dateNaissance)}</dd></div>
      <div><dt>Inscription</dt><dd>${fmtDate(e.dateInscription)}</dd></div>
    </dl>
    ${renderLienCorrection(e)}
    ${renderSecuriteEnfant(e)}
    ${renderPresenceSemaine(e)}
    ${renderNotesContinuesEnfant(e)}
    ${renderBulletinEnfant(e)}
    ${renderScolariteEnfant(e)}
  </article>`;
}
// Carte « Aujourd'hui » : présence du jour, prochain événement, devoirs, reste à payer.
// Plusieurs enfants : sélecteur par avatars (affichage seulement, données déjà chargées).
function renderAujourdhuiParent(enfants){
  if(!enfants.length) return '';
  const e = enfants.find(x => x.id === ui.enfantAujourdhui) || enfants[0];
  const auj = isoLocal(new Date());
  const jourIso = ((new Date().getDay() + 6) % 7) + 1;
  const jourDeClasse = (DB.meta?.joursCours || DB.horairesAnnonces?.joursCours || [1, 2, 3, 4, 5]).includes(jourIso);
  const p = Array.isArray(DB.presencesSemaine) ? DB.presencesSemaine.find(x => x.eleveId === e.id && x.date === auj) : null;
  const presence = p ? (p.statut === 'Présent' ? { cls:'ok', ic:'circle-check', txt:'Présent(e) à l’école' } : p.statut === 'Retard' ? { cls:'attente', ic:'clock', txt:'Arrivé(e) en retard' } : { cls:'erreur', ic:'circle-x', txt:'Absent(e) aujourd’hui' })
    : jourDeClasse ? { cls:'neutre', ic:'clock', txt:'L’appel n’est pas encore fait' } : { cls:'neutre', ic:'calendar', txt:'Pas de classe aujourd’hui' };
  const ev = (DB.agenda || []).filter(a => (a.dateFin || a.dateDebut) >= auj && (!a.classeIds || !a.classeIds.length || a.classeIds.includes(e.classeId)))
    .sort((a, b) => String(a.dateDebut).localeCompare(String(b.dateDebut)))[0];
  const devoirs = (DB.devoirs || []).filter(d => d.classeId === e.classeId && d.pourLe > auj).sort((a, b) => a.pourLe.localeCompare(b.pourLe));
  const prochainJour = devoirs[0]?.pourLe, nbDevoirs = devoirs.filter(d => d.pourLe === prochainJour).length;
  let reste = null;
  if(DB.meta?.scolariteVisibleParents){ const info = scolariteEleveParEcheance(e.id); if(info.total) reste = info.reste; }
  const ligne = (ic, lib, val, cls) => `<li class="aj-ligne"><span class="aj-ic ${cls || ''}" aria-hidden="true">${icone(ic)}</span><span class="aj-txt"><small>${lib}</small><strong>${val}</strong></span></li>`;
  return `<section class="aj-parent em-rise" style="--i:2" id="aujParent" aria-label="Aujourd’hui">
    ${enfants.length > 1 ? `<div class="aj-enfants" role="tablist" aria-label="Choisir l’enfant">${enfants.map(x => `<button type="button" role="tab" class="aj-enfant${x.id === e.id ? ' actif' : ''}" aria-selected="${x.id === e.id}" onclick="choisirEnfantAujourdhui('${x.id}')"><span class="aj-av" aria-hidden="true">${escapeHtml(initials(x.prenom, x.nom))}</span><span>${escapeHtml(x.prenom || x.nom)}</span></button>`).join('')}</div>` : ''}
    <div class="aj-carte">
      <div class="aj-tete"><strong>Aujourd’hui</strong><span>${escapeHtml(new Date().toLocaleDateString('fr-FR', { weekday:'long', day:'numeric', month:'long' }))}</span></div>
      <ul class="aj-liste">
        ${ligne(presence.ic, escapeHtml(e.prenom || eleveFullName(e)), presence.txt, presence.cls)}
        ${ev ? ligne('calendar-days', 'Prochain événement', `${escapeHtml(ev.titre)} <span class="aj-delai">${escapeHtml(delaiAgenda(ev))}</span>`) : ''}
        ${prochainJour ? ligne('book-open', 'Devoirs', `${nbDevoirs} devoir${nbDevoirs > 1 ? 's' : ''} ${escapeHtml(quandDevoir(prochainJour))}`) : ''}
        ${reste !== null ? ligne('wallet', 'Scolarité', reste ? `Reste à payer : ${fmtFCFA(reste)}` : 'Soldée, merci !', reste ? 'attente' : 'ok') : ''}
      </ul>
    </div>
  </section>`;
}
function choisirEnfantAujourdhui(id){
  ui.enfantAujourdhui = id;
  const z = document.getElementById('aujParent');
  if(z) z.outerHTML = renderAujourdhuiParent(DB.eleves || []);
}
function renderParentDashboard(){
  const mesEnfants = DB.eleves || [];
  if(!mesEnfants.length){
    return `<div class="view active">
      <div class="panel"><div class="etat-vide"><span class="etat-vide-ic" aria-hidden="true">${icone('users')}</span><span>Aucun enfant n’est encore relié à votre compte. Le secrétariat de l’école le fera après avoir validé votre demande.</span></div></div>
    </div>`;
  }
  const prenomParent = (session.nomComplet||'').trim().split(/\s+/)[0] || '';
  const plusieurs = mesEnfants.length > 1;
  return `<div class="view active parent-accueil">
    ${renderBandeDefilanteParent()}
    ${renderAnnonceDuMoment()}
    ${renderAlerteAbsence(mesEnfants)}
    <div class="em-rise" style="--i:1">
      <div class="role-etiquette">${titreTableauDeBord('parent')}</div>
      <h2 class="parent-greeting">${escapeHtml(salutation())} <span class="salut-main em-wave">${window.EmIcones ? EmIcones.svg('hand') : '👋'}</span></h2>
      <p class="parent-greeting-sub">Voici la semaine de ${plusieurs ? 'vos enfants' : 'votre enfant'}.</p>
      ${renderQuestionAppel()}
    </div>
    ${renderAujourdhuiParent(mesEnfants)}
    <div class="enfants${plusieurs ? ' enfants--carrousel' : ''} em-rise" style="--i:2">
      ${mesEnfants.map(renderFicheEnfant).join('')}
    </div>
    <div class="form-actions" style="justify-content:flex-start;margin:0 0 var(--sp-4);"><button type="button" class="btn secondary" onclick="ouvrirSignalerAbsence()">📝 Signaler une absence à l’avance</button><button type="button" class="btn secondary" onclick="ouvrirDemandeDocument()">📄 Demander un document</button></div>
    ${renderMenuParent()}
    ${renderDevoirsParent(mesEnfants)}
    ${renderAgendaParent()}
    ${renderInformationsPassees()}
    ${renderTableauHonneurParent()}
    ${renderContactEcole()}
  </div>`;
}
const NAV_PARENT = [
  {id:'accueil', ic:'house', lib:'Accueil'},
  {id:'msg', ic:'mail', lib:'Messages'},
  {id:'vie', ic:'camera', lib:'Vie de l’école'},
  {id:'objets', ic:'backpack', lib:'Objets perdus'},
  {id:'profil', ic:'user', lib:'Profil'},
];
function renderNavParent(actif){
  const idx = Math.max(0, NAV_PARENT.findIndex(n => n.id === actif));
  const nbMsg = (DB.messagesInternes||[]).filter(m=>!m.lu && m.destinataireType !== 'ecole').length;
  return `<div class="pn-pastille" style="transform:translateX(${idx*100}%)" aria-hidden="true"></div>
    ${NAV_PARENT.map((n, i) => `<button type="button" class="pn-item em-press${i === idx ? ' actif' : ''}" ${i === idx ? 'aria-current="page"' : ''} onclick="navParent('${n.id}', event)">
      <span class="pn-ic" aria-hidden="true">${window.EmIcones ? EmIcones.svg(n.ic) : ''}${n.id === 'msg' && nbMsg ? `<span class="pn-badge">${nbMsg>9?'9+':nbMsg}</span>` : ''}</span>
      <span class="pn-lib">${n.lib}</span>
    </button>`).join('')}`;
}
function navParent(id, ev){
  if(ev) ev.stopPropagation();
  const nav = document.getElementById('parentNav');
  const idx = NAV_PARENT.findIndex(n => n.id === id);
  if(nav && idx >= 0){
    const pastille = nav.querySelector('.pn-pastille');
    if(pastille) pastille.style.transform = `translateX(${idx*100}%)`;
    nav.querySelectorAll('.pn-item').forEach((b, i) => {
      b.classList.toggle('actif', i === idx);
      if(i === idx) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
  }
  if(id === 'accueil'){
    $$('.bulle-dropdown').forEach(el=>el.style.display='none');
    if(ui.vueParent === 'vie'){ ui.vueParent = 'accueil'; $('#viewContainer').innerHTML = renderParentDashboard(); }
    window.scrollTo({top:0, behavior: (window.EmMotion && EmMotion.prefersReducedMotion()) ? 'auto' : 'smooth'});
  }
  else if(id === 'vie'){ ui.vueParent = 'vie'; $('#viewContainer').innerHTML = renderFilParent(); window.scrollTo({top:0}); demarrerFil(); }
  else if(id === 'msg' || id === 'sugg'){ window.scrollTo({top:0}); toggleBulle(id); }
  else if(id === 'objets'){ ouvrirObjetsPerdus(); }
  else if(id === 'profil'){ ouvrirProfilParent(); }
}
/* ---------------------------------------------------------------------
   OBJETS PERDUS (schema.sql section 49) — le parent signale une affaire
   de son enfant perdue à l'école ; le secrétariat / la direction répond
   depuis la Messagerie.
   --------------------------------------------------------------------- */
const STATUTS_OBJET = {
  signale:      { lib:'Signalé — en recherche', badge:'amber' },
  retrouve:     { lib:'Retrouvé — à récupérer à l’école', badge:'green' },
  non_retrouve: { lib:'Pas retrouvé pour le moment', badge:'gray' },
  rendu:        { lib:'Rendu', badge:'blue' },
};
function badgeStatutObjet(statut){
  const s = STATUTS_OBJET[statut] || STATUTS_OBJET.signale;
  return `<span class="badge ${s.badge}">${s.lib}</span>`;
}
async function chargerObjetsPerdus(){
  const { data, error } = await sb.from('objets_perdus').select('*').eq('ecole_id', session.ecoleId).order('created_at', { ascending:false });
  if(error) throw error;
  DB.objetsPerdus = rowsToCamel(data);
  return DB.objetsPerdus;
}
// --- Côté parent ---
async function ouvrirObjetsPerdus(){
  openModal('🎒 Objets perdus', `<div class="hint">Chargement…</div>`);
  try{ await chargerObjetsPerdus(); }catch(_e){ DB.objetsPerdus = DB.objetsPerdus || []; }
  afficherObjetsPerdusParent();
}
function afficherObjetsPerdusParent(){
  const enfants = DB.eleves || [];
  const liste = DB.objetsPerdus || [];
  openModal('🎒 Objets perdus', `
    <p class="hint" style="margin-top:0;">Votre enfant est rentré sans une de ses affaires ? Signalez-la : l'école la recherche et vous répond ici.</p>
    <form onsubmit="return handleSignalerObjetPerdu(event)">
      ${enfants.length > 1 ? `<div class="field"><label>Enfant concerné</label><select name="eleveId" required>${enfants.map(e => `<option value="${e.id}">${escapeHtml(eleveFullName(e))}</option>`).join('')}</select></div>`
        : `<input type="hidden" name="eleveId" value="${enfants[0]?.id || ''}">`}
      <div class="field"><label>Objet perdu</label><input name="objet" required minlength="2" maxlength="200" placeholder="Ex : gourde bleue, pull de l'uniforme, cahier de maths…"></div>
      <div class="field"><label>Détails (facultatif)</label><textarea name="description" rows="3" maxlength="1000" placeholder="Couleur, marque, nom écrit dessus, où il a pu être oublié…"></textarea></div>
      <div class="field"><label>Remarqué à la maison le</label><input type="date" name="dateConstat" value="${todayISO()}" max="${todayISO()}" required></div>
      <button class="btn" type="submit" style="width:100%;">Signaler l'objet perdu</button>
    </form>
    ${liste.length ? `<h4 style="margin:var(--sp-4) 0 var(--sp-2);">Mes signalements</h4>
      <div class="actu-liste">${liste.map(o => {
        const e = (DB.eleves||[]).find(x => x.id === o.eleveId);
        return `<div class="actu-carte" style="flex-direction:column;align-items:flex-start;">
          <div class="actu-titre">${escapeHtml(o.objet)}${e ? ` <span class="hint">— ${escapeHtml(eleveFullName(e))}</span>` : ''}</div>
          ${o.description ? `<div class="actu-meta">${escapeHtml(o.description)}</div>` : ''}
          <div>${badgeStatutObjet(o.statut)}</div>
          ${o.reponseEcole ? `<div class="actu-meta"><strong>Réponse de l'école :</strong> ${escapeHtml(o.reponseEcole)}</div>` : ''}
          <div class="actu-meta">Remarqué le ${fmtDate(o.dateConstat)}</div>
        </div>`;
      }).join('')}</div>` : ''}
    <div class="form-actions"><button type="button" class="btn secondary" onclick="closeModal(); navParent('accueil')">Fermer</button></div>`);
}
async function handleSignalerObjetPerdu(ev){
  ev.preventDefault();
  const fd = new FormData(ev.target);
  const bouton = ev.target.querySelector('button[type="submit"]');
  bouton.disabled = true;
  try{
    const { data, error } = await sb.from('objets_perdus').insert({
      eleve_id: fd.get('eleveId'), objet: fd.get('objet').trim(), description: (fd.get('description') || '').trim(),
      date_constat: fd.get('dateConstat'), parent_nom: session.nomComplet || '',
    }).select().single();
    if(error) throw error;
    DB.objetsPerdus = [rowToCamel(data)].concat(DB.objetsPerdus || []);
    sb.functions.invoke('notifier-personnel', { body: { type: 'objet_perdu' } }).catch(() => {});
    toast('Objet signalé à l’école, merci !');
    afficherObjetsPerdusParent();
  }catch(e){ bouton.disabled = false; alert('Erreur : ' + e.message); }
  return false;
}
// --- Côté école (Messagerie) ---
function renderObjetsPerdusEcole(){
  if(!['secretariat','direction','fondation'].includes(ui.role)) return '';
  if(DB.objetsPerdus === undefined){
    DB.objetsPerdus = null;
    chargerObjetsPerdus().then(() => { if(ui.currentView === 'messagerie') renderView('messagerie'); }).catch(() => { DB.objetsPerdus = []; });
  }
  const liste = DB.objetsPerdus || [];
  const aTraiter = liste.filter(o => o.statut === 'signale' || o.statut === 'retrouve');
  const afficher = ui.filters.objetsTous ? liste : aTraiter;
  return `<div class="panel">
    <div class="panel-head">
      <div><h2>🎒 Objets perdus signalés par les parents${aTraiter.length ? ` (${aTraiter.length})` : ''}</h2><div class="sub">Répondez au parent : il voit la réponse dans son application</div></div>
      ${liste.length > aTraiter.length ? `<button class="btn secondary sm" onclick="ui.filters.objetsTous=${!ui.filters.objetsTous}; renderView('messagerie')">${ui.filters.objetsTous ? 'En cours seulement' : 'Tout afficher'}</button>` : ''}
    </div>
    ${DB.objetsPerdus === null ? '<div class="hint">Chargement…</div>' : !afficher.length ? '<div class="hint">Aucun objet perdu en cours.</div>' : `<div class="table-wrap"><table>
      <thead><tr><th>Date</th><th>Élève</th><th>Objet</th><th>Parent</th><th>Statut et réponse</th></tr></thead>
      <tbody>${afficher.map(o => {
        const e = eleveById(o.eleveId);
        return `<tr>
          <td>${fmtDate(o.dateConstat)}</td>
          <td>${e ? escapeHtml(eleveFullName(e)) + `<br><span class="hint">${escapeHtml(classeName(e.classeId))}</span>` : '—'}</td>
          <td><strong>${escapeHtml(o.objet)}</strong>${o.description ? `<br><span class="hint">${escapeHtml(o.description)}</span>` : ''}</td>
          <td>${escapeHtml(o.parentNom || '')}</td>
          <td style="min-width:220px;">
            <select id="objStatut-${o.id}">${Object.entries(STATUTS_OBJET).map(([k, v]) => `<option value="${k}" ${o.statut === k ? 'selected' : ''}>${v.lib}</option>`).join('')}</select>
            <input id="objRep-${o.id}" maxlength="1000" placeholder="Message au parent (facultatif)" value="${escapeHtml(o.reponseEcole || '')}" style="margin-top:6px;width:100%;">
            <button class="btn secondary sm" style="margin-top:6px;" onclick="handleRepondreObjetPerdu('${o.id}')">Enregistrer</button>
          </td>
        </tr>`;
      }).join('')}</tbody>
    </table></div>`}
  </div>`;
}
async function handleRepondreObjetPerdu(id){
  const statut = document.getElementById('objStatut-' + id).value;
  const reponse = document.getElementById('objRep-' + id).value.trim();
  try{
    const { error } = await exigerEffet(sb.from('objets_perdus').update({ statut, reponse_ecole: reponse, updated_at: new Date().toISOString() }).eq('id', id));
    if(error) throw error;
    DB.objetsPerdus = (DB.objetsPerdus || []).map(o => o.id === id ? { ...o, statut, reponseEcole: reponse } : o);
    const objet = DB.objetsPerdus.find(o => o.id === id);
    if(objet) notifierParentsPush([objet.eleveId], `🎒 ${objet.objet} : ${(STATUTS_OBJET[statut] || {}).lib || ''}${reponse ? ' — ' + reponse : ''}`);
    toast('Réponse enregistrée : le parent la verra dans son application');
    renderView('messagerie');
  }catch(e){ alert('Erreur : ' + e.message); }
}
// Console parent : appeler l'école, lui écrire sur WhatsApp, s'y rendre
function renderContactEcole(){
  const m = DB.meta || {};
  const tels = telephonesWhatsapp(m.telephone);
  const appel = String(m.telephone || '').split(/[\/;,|]/)[0].replace(/[^\d+]/g, '');
  const carte = (m.geofenceLatitude != null && m.geofenceLongitude != null)
    ? `https://www.google.com/maps/dir/?api=1&destination=${m.geofenceLatitude},${m.geofenceLongitude}`
    : (m.adresse ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent((m.nomEcole || '') + ' ' + m.adresse)}` : '');
  if(!appel && !tels.length && !carte) return '';
  return `<section class="panel contact-ecole" aria-labelledby="titreContactEcole">
    <div class="panel-head"><div><h2 id="titreContactEcole">📞 Contacter ${escapeHtml(m.nomEcole || 'l’école')}</h2>${m.adresse ? `<div class="sub">${escapeHtml(m.adresse)}</div>` : ''}</div></div>
    <div class="contact-ecole-boutons">
      ${appel ? `<a class="btn secondary" href="tel:${escapeHtml(appel)}">📞 Appeler</a>` : ''}
      ${tels.length ? `<a class="btn secondary" href="https://wa.me/${tels[0]}" target="_blank" rel="noopener">💬 WhatsApp</a>` : ''}
      ${carte ? `<a class="btn secondary" href="${carte}" target="_blank" rel="noopener">🗺️ Itinéraire</a>` : ''}
      <button type="button" class="btn secondary" onclick="ouvrirEcrireEcole && ouvrirEcrireEcole()">✉️ Écrire dans l’application</button>
    </div>
  </section>`;
}
function ouvrirProfilParent(){
  const enfants = (DB.eleves||[]).map(e => `<li>${escapeHtml(eleveFullName(e))} — ${escapeHtml(classeName(e.classeId))}</li>`).join('');
  openModal('Mon profil', `
    <div class="profil-parent">
      <div class="profil-nom">${escapeHtml(session.nomComplet || '')}</div>
      <div class="hint">${escapeHtml(nomApplication())}</div>
      ${enfants ? `<div class="profil-sous">Enfant(s) relié(s)</div><ul class="profil-enfants">${enfants}</ul>` : ''}
    </div>
    <div class="form-actions">
      <button type="button" class="btn secondary" onclick="closeModal(); navParent('accueil')">Fermer</button>
      <button type="button" class="btn danger" onclick="closeModal(); logoutRole()">🔒 Déconnexion</button>
    </div>`);
}
/* ---------------------------------------------------------------------
   BULLES — Notifications / Messages / Suggestions. 3 icônes dans la
   barre du haut, visibles sur toutes les vues (personnel ET parent).
   Regroupe ce qui était auparavant éparpillé en panneaux séparés sur
   les tableaux de bord (schema.sql section 38).
   --------------------------------------------------------------------- */
function rafraichirBulles(){
  const c = $('#bullesContainer');
  if(c) c.innerHTML = renderBulles();
}
function renderBulles(){
  const estAdmin = ui.role==='direction' || ui.role==='fondation';
  const nbNotif = calculerNotificationsBulle().filter(it=>it.nonLu).length;
  const nbMsg = (ui.role==='parent'||ui.role==='enseignant') ? (DB.messagesInternes||[]).filter(m=>!m.lu && m.destinataireType !== 'ecole').length
    : ['secretariat','direction','fondation'].includes(ui.role) ? (DB.messagesInternes||[]).filter(m=>!m.lu && m.destinataireType === 'ecole').length : 0;
  const nbSugg = estAdmin ? (DB.suggestions||[]).filter(s=>!s.lu).length : 0;
  const badge = n => n ? `<span class="bulle-badge">${n>9?'9+':n}</span>` : '';
  // Refonte (DESIGN.md §7) : une seule cloche → centre à onglets (mêmes contenus qu'avant)
  const total = nbNotif + nbMsg + nbSugg;
  const onglet = ui.ongletCentre || 'notif';
  const ong = (cle, lib, n) => `<button type="button" role="tab" class="cn-onglet${onglet === cle ? ' actif' : ''}" aria-selected="${onglet === cle}" onclick="choisirOngletCentre('${cle}')">${lib}${n ? ` <span class="cn-compte">${n > 9 ? '9+' : n}</span>` : ''}</button>`;
  return `
    <div class="bulle-wrap">
      <button class="bulle-btn" onclick="toggleCentre()" aria-haspopup="dialog" aria-controls="centreNotif" aria-label="Centre de notifications${total ? ', ' + total + ' nouveau' + (total > 1 ? 'x' : '') : ''}" title="Notifications, messages et suggestions">🔔${badge(total)}</button>
      <div class="bulle-dropdown centre-notif" id="centreNotif" style="display:none;" role="dialog" aria-label="Centre de notifications">
        <div class="cn-poignee" aria-hidden="true"></div>
        <div class="cn-tete"><strong>Notifications</strong><button type="button" class="cn-fermer" onclick="toggleCentre(false)" aria-label="Fermer">✕</button></div>
        <div class="cn-onglets" role="tablist">${ong('notif', 'Notifications', nbNotif)}${ong('msg', 'Messages', nbMsg)}${ong('sugg', 'Suggestions', nbSugg)}</div>
        <div class="cn-panneau" id="dropdownNotif"${onglet === 'notif' ? '' : ' hidden'}>${renderDropdownNotifications()}</div>
        <div class="cn-panneau" id="dropdownMsg"${onglet === 'msg' ? '' : ' hidden'}>${renderDropdownMessages()}</div>
        <div class="cn-panneau" id="dropdownSugg"${onglet === 'sugg' ? '' : ' hidden'}>${renderDropdownSuggestions()}</div>
      </div>
    </div>
  `;
}
// Ouvre le centre sur l'onglet demandé (gardé pour les anciens appels)
function toggleBulle(nom){ ui.ongletCentre = nom; choisirOngletCentre(nom); toggleCentre(true); }
function toggleCentre(ouvrir){
  const c = $('#centreNotif'); if(!c) return;
  const visible = c.style.display !== 'none';
  const montrer = ouvrir === undefined ? !visible : !!ouvrir;
  c.style.display = montrer ? 'flex' : 'none';
  document.body.classList.toggle('centre-ouvert', montrer);
  const b = c.parentElement && c.parentElement.querySelector('.bulle-btn'); if(b) b.setAttribute('aria-expanded', String(montrer));
}
function choisirOngletCentre(cle){
  ui.ongletCentre = cle;
  const ids = { notif:'dropdownNotif', msg:'dropdownMsg', sugg:'dropdownSugg' };
  Object.entries(ids).forEach(([k, id]) => { const el = $('#' + id); if(el) el.hidden = k !== cle; });
  $$('.cn-onglet').forEach(o => { const actif = o.getAttribute('onclick').includes(`'${cle}'`); o.classList.toggle('actif', actif); o.setAttribute('aria-selected', String(actif)); });
}
document.addEventListener('click', (e)=>{
  if(!e.target.closest('.bulles')){ $$('.bulle-dropdown').forEach(el=>el.style.display='none'); document.body.classList.remove('centre-ouvert'); }
});
function calculerNotificationsBulle(){
  const items = [];
  const aujourdhui = todayISO();
  (DB.annoncesHoraires||[]).filter(a=>a.date===aujourdhui).forEach(a=>{
    items.push({ texte: a.contenu, temps: a.createdAt, nonLu: true, type:'annonce' });
  });
  if(['enseignant','secretariat','direction','fondation'].includes(ui.role)){
    (DB.notificationsPortier||[]).forEach(n=>{
      items.push({ id:n.id, texte: `👪 Le parent de ${n.eleveNom} est à la porte`, temps: n.createdAt, nonLu: !n.vue, type:'portier' });
    });
  }
  (DB.messages||[]).slice(0,20).forEach(m=>{
    items.push({ texte: m.contenu, temps: `${m.date}T${(m.heure||'00:00').slice(0,5)}`, nonLu: m.date===aujourdhui, type:'message' });
  });
  items.sort((a,b)=> String(b.temps||'').localeCompare(String(a.temps||'')));
  return items.slice(0,25);
}
function renderDropdownNotifications(){
  const items = calculerNotificationsBulle();
  if(!items.length) return `<h4>🔔 Notifications</h4><div class="etat-vide etat-vide-ok"><span class="etat-vide-ic" aria-hidden="true">${icone('bell')}</span><span>Rien de nouveau : vous êtes à jour.</span></div>`;
  return `<h4>🔔 Notifications</h4>${items.map(it=>`
    <div class="bulle-item ${it.nonLu?'non-lu':''}">
      ${escapeHtml(it.texte)}
      ${it.type==='portier' && it.nonLu && ui.role==='enseignant' ? `<div style="margin-top:6px;"><button class="btn secondary sm" onclick="handleMarquerVuPortier('${it.id}')">✅ J'ai vu</button></div>` : ''}
      <div class="bulle-meta">${it.temps ? new Date(it.temps).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'}) : ''}</div>
    </div>`).join('')}`;
}
async function handleMarquerVuPortier(id){
  try{
    const { error } = await exigerEffet(sb.from('notifications_portier').update({ vue: true }).eq('id', id));
    if(error) throw error;
    DB.notificationsPortier = (DB.notificationsPortier||[]).map(n=>n.id===id?{...n,vue:true}:n);
    rafraichirBulles();
  }catch(e){ alert('Erreur : ' + e.message); }
}
function renderDropdownMessages(){
  const estStaff = ['secretariat','direction','fondation'].includes(ui.role);
  const liste = (DB.messagesInternes||[]).slice().sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||''))).slice(0,30);
  const quand = m => m.createdAt ? new Date(m.createdAt).toLocaleString('fr-FR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}) : '';
  const nomEleve = id => eleveById(id) ? eleveFullName(eleveById(id)) : '—';
  return `<h4>✉️ Messages</h4>
    ${estStaff ? `<button class="btn sm" style="width:100%;margin-bottom:10px;" onclick="ouvrirComposerMessage()">+ Nouveau message</button>` : ''}
    ${ui.role === 'parent' ? `<button class="btn sm" style="width:100%;margin-bottom:10px;" onclick="ouvrirEcrireEcole()">✉️ Écrire à l’école</button>` : ''}
    ${!liste.length ? `<div class="etat-vide"><span class="etat-vide-ic" aria-hidden="true">${icone('mail')}</span><span>Aucun message pour l’instant. Les messages de l’école arriveront ici.</span></div>` : liste.map(m=>{
      const deParent = m.destinataireType === 'ecole';
      if(estStaff){
        const entete = deParent ? `📩 De : ${escapeHtml(m.auteurNom || 'parent')} (parent de ${escapeHtml(nomEleve(m.eleveId))})`
          : m.destinataireType==='parent' ? 'À : parent de ' + escapeHtml(nomEleve(m.eleveId)) : 'À : enseignant(e)';
        return `<div class="bulle-item ${deParent && !m.lu ? 'non-lu' : ''}">
          <div class="hint">${entete}</div>${escapeHtml(m.contenu)}
          <div class="bulle-meta">${quand(m)}</div>
          ${deParent ? `<div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap;"><button class="btn sm" onclick="repondreParent('${m.id}')">Répondre</button>${!m.lu ? `<button class="btn secondary sm" onclick="marquerMessageParentLu('${m.id}')">Marquer comme lu</button>` : ''}</div>` : ''}
        </div>`;
      }
      if(deParent) return `<div class="bulle-item msg-envoye"><div class="hint">Vous (au sujet de ${escapeHtml(nomEleve(m.eleveId))})</div>${escapeHtml(m.contenu)}<div class="bulle-meta">${quand(m)} · envoyé</div></div>`;
      return `<div class="bulle-item ${!m.lu ?'non-lu':''}">
        ${ui.role === 'parent' ? `<div class="hint">${escapeHtml(m.auteurNom || 'L’école')}</div>` : ''}
        ${escapeHtml(m.contenu)}
        <div class="bulle-meta">${quand(m)}</div>
        ${!m.lu ? `<div style="margin-top:6px;"><button class="btn secondary sm" onclick="handleMarquerMessageLu('${m.id}')">Marquer comme lu</button></div>`:''}
      </div>`;
    }).join('')}`;
}
// Le parent écrit à l'école au sujet d'un de ses enfants
function ouvrirEcrireEcole(){
  const enfants = DB.eleves || [];
  openModal('✉️ Écrire à l’école', `
    <form onsubmit="return envoyerMessageEcole(event)">
      ${enfants.length > 1 ? `<div class="field"><label>Au sujet de</label><select name="eleveId" required>${enfants.map(e => `<option value="${e.id}">${escapeHtml(eleveFullName(e))}</option>`).join('')}</select></div>`
        : `<input type="hidden" name="eleveId" value="${enfants[0]?.id || ''}">`}
      <div class="field"><label>Votre message</label><textarea name="contenu" rows="5" required maxlength="2000" placeholder="Ex : Bonjour, mon enfant aura un rendez-vous médical jeudi matin…"></textarea></div>
      <div class="hint">Lu par le secrétariat et la direction. La réponse arrive ici, dans vos messages.</div>
      <button class="btn" type="submit" style="width:100%;margin-top:10px;">Envoyer</button>
    </form>`);
}
async function envoyerMessageEcole(ev){
  ev.preventDefault();
  const fd = new FormData(ev.target), bouton = ev.target.querySelector('button[type=submit]');
  bouton.disabled = true;
  try{
    const { data, error } = await sb.from('messages_internes').insert({ destinataire_type: 'ecole', eleve_id: fd.get('eleveId'), contenu: fd.get('contenu').trim(), auteur_nom: session.nomComplet || '' }).select().single();
    if(error) throw error;
    DB.messagesInternes = [rowToCamel(data)].concat(DB.messagesInternes || []);
    sb.functions.invoke('notifier-personnel', { body: { type: 'message' } }).catch(() => {});
    closeModal(); toast('Message envoyé à l’école'); rafraichirBulles();
  }catch(e){ bouton.disabled = false; alert('Erreur : ' + e.message); }
  return false;
}
async function marquerMessageParentLu(id){
  try{
    const { error } = await exigerEffet(sb.from('messages_internes').update({ lu: true }).eq('id', id));
    if(error) throw error;
    DB.messagesInternes = (DB.messagesInternes || []).map(m => m.id === id ? { ...m, lu: true } : m);
    rafraichirBulles(); if(ui.currentView === 'messagerie') renderView('messagerie');
  }catch(e){ toast('Erreur : ' + e.message); }
}
// L'école répond : composeur pré-rempli (parent de l'élève concerné)
function repondreParent(id){
  const m = (DB.messagesInternes || []).find(x => x.id === id);
  if(!m) return;
  ouvrirComposerMessage();
  const sel = document.querySelector('#modalBody select[name=eleveId]');
  if(sel) sel.value = m.eleveId;
  const zone = document.querySelector('#modalBody textarea[name=contenu]');
  if(zone){ zone.placeholder = 'Votre réponse…'; zone.focus(); }
  const titre = document.getElementById('modalTitle'); if(titre) titre.textContent = `✉️ Répondre à ${m.auteurNom || 'ce parent'}`;
  if(!m.lu) marquerMessageParentLu(id);
}
function renderSelectEleveMessage(){
  return `<div class="field"><label>Élève (le message ira à son/ses parent(s))</label>
    <select name="eleveId" required>${DB.eleves.slice().sort((a,b)=>eleveFullName(a).localeCompare(eleveFullName(b))).map(e=>`<option value="${e.id}">${escapeHtml(eleveFullName(e))} — ${escapeHtml(classeName(e.classeId))}</option>`).join('')}</select>
  </div>`;
}
function renderSelectEnseignantMessage(){
  return `<div class="field"><label>Enseignant(e)</label>
    <select name="enseignantId" required>${(DB.enseignants||[]).slice().sort((a,b)=>ensFullName(a).localeCompare(ensFullName(b))).map(en=>`<option value="${en.id}">${escapeHtml(ensFullName(en))}</option>`).join('')}</select>
  </div>`;
}
function majChampsDestinataireMessage(type){
  $('#champDestinataireMessage').innerHTML = type==='parent' ? renderSelectEleveMessage() : renderSelectEnseignantMessage();
}
function ouvrirComposerMessage(){
  openModal('✉️ Nouveau message', `
    <form onsubmit="return handleEnvoyerMessage(event)">
      <div class="field">
        <label>Destinataire</label>
        <select name="destinataireType" onchange="majChampsDestinataireMessage(this.value)">
          <option value="parent">Parent d'un élève</option>
          <option value="enseignant">Enseignant(e)</option>
        </select>
      </div>
      <div id="champDestinataireMessage">${renderSelectEleveMessage()}</div>
      <div class="field">
        <label>Message</label>
        <textarea name="contenu" rows="4" required></textarea>
      </div>
      <button class="btn" type="submit" style="width:100%;margin-top:10px;">Envoyer</button>
    </form>
  `);
}
async function handleEnvoyerMessage(ev){
  ev.preventDefault();
  const fd = new FormData(ev.target);
  const destinataireType = fd.get('destinataireType');
  const payload = {
    destinataire_type: destinataireType,
    contenu: fd.get('contenu').trim(),
    auteur_nom: session.nomComplet || '',
  };
  if(destinataireType==='parent') payload.eleve_id = fd.get('eleveId');
  else payload.enseignant_id = fd.get('enseignantId');
  try{
    const { data, error } = await sb.from('messages_internes').insert(payload).select().single();
    if(error) throw error;
    DB.messagesInternes = DB.messagesInternes || [];
    DB.messagesInternes.unshift(rowToCamel(data));
    if(destinataireType === 'parent') notifierParentsPush([payload.eleve_id], '✉️ ' + payload.contenu);
    closeModal();
    toast('Message envoyé');
    rafraichirBulles();
  }catch(e){ alert('Erreur : ' + e.message); }
  return false;
}
async function handleMarquerMessageLu(id){
  try{
    const { error } = await exigerEffet(sb.from('messages_internes').update({ lu:true }).eq('id', id));
    if(error) throw error;
    DB.messagesInternes = (DB.messagesInternes||[]).map(m=>m.id===id?{...m,lu:true}:m);
    rafraichirBulles();
  }catch(e){ alert('Erreur : ' + e.message); }
}
function renderDropdownSuggestions(){
  const estAdmin = ui.role==='direction' || ui.role==='fondation';
  if(!estAdmin){
    return `<h4>💡 Suggestions</h4>
      <div class="hint" style="margin-bottom:10px;">Une idée, une remarque pour l'établissement ? Elle sera lue par la Direction.</div>
      <button class="btn sm" style="width:100%;" onclick="ouvrirComposerSuggestion()">+ Envoyer une suggestion</button>`;
  }
  const liste = (DB.suggestions||[]).slice(0,20);
  return `<h4>💡 Suggestions reçues</h4>
    ${!liste.length ? `<div class="etat-vide"><span class="etat-vide-ic" aria-hidden="true">${icone('lightbulb')}</span><span>Aucune suggestion pour l’instant.</span></div>` : liste.map(s=>`
      <div class="bulle-item ${!s.lu?'non-lu':''}">
        <div class="hint">${escapeHtml(s.auteurNom||'Anonyme')} · ${escapeHtml(s.auteurRole||'')}</div>
        ${escapeHtml(s.contenu)}
        <div class="bulle-meta">${s.createdAt?new Date(s.createdAt).toLocaleString('fr-FR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):''}</div>
        ${!s.lu ? `<div style="margin-top:6px;"><button class="btn secondary sm" onclick="handleMarquerSuggestionLue('${s.id}')">Marquer comme lue</button></div>`:''}
      </div>`).join('')}`;
}
function ouvrirComposerSuggestion(){
  openModal('💡 Envoyer une suggestion', `
    <form onsubmit="return handleEnvoyerSuggestion(event)">
      <div class="field">
        <label>Votre suggestion</label>
        <textarea name="contenu" rows="5" required placeholder="Ex : Prévoir un abri pour les vélos..."></textarea>
      </div>
      <button class="btn" type="submit" style="width:100%;margin-top:10px;">Envoyer</button>
    </form>
  `);
}
async function handleEnvoyerSuggestion(ev){
  ev.preventDefault();
  const contenu = new FormData(ev.target).get('contenu').trim();
  try{
    const { error } = await sb.from('suggestions').insert({
      contenu, auteur_nom: session.nomComplet || '', auteur_role: ui.role || '',
    });
    if(error) throw error;
    closeModal();
    toast('Suggestion envoyée, merci !');
  }catch(e){ alert('Erreur : ' + e.message); }
  return false;
}
async function handleMarquerSuggestionLue(id){
  try{
    const { error } = await exigerEffet(sb.from('suggestions').update({ lu:true }).eq('id', id));
    if(error) throw error;
    DB.suggestions = (DB.suggestions||[]).map(s=>s.id===id?{...s,lu:true}:s);
    rafraichirBulles();
  }catch(e){ alert('Erreur : ' + e.message); }
}
/* ---------------------------------------------------------------------
   ESPACE PORTIER — recherche un élève, signale que son parent est arrivé.
   Aucune autre donnée que nom/prénom/classe n'est jamais chargée (voir
   chargerDBPortier() dans supabase-client.js).
   --------------------------------------------------------------------- */
function enterAppPortier(){
  document.body.classList.add('theme-portier');
  $('#loginGate').classList.remove('open');
  $('#appRoot').style.display = '';
  $('#sidebar').style.display = 'none';
  $('#burger').style.display = 'none';
  applyBranding();
  $('#viewTitle').innerHTML = `<span class="gate-sur">${titreTableauDeBord('portier')} · ${escapeHtml(DB.meta.nomEcole || '')}</span>
    <span class="gate-titre">Arrivée des parents</span>
    <span class="sr-only">${escapeHtml(window.ESPACE_FIXE ? nomApplication() : 'Espace Portier')}</span>`;
  const pill = $('#topbarPill');
  pill.innerHTML = `<span class="gate-etat"><span class="gate-point" aria-hidden="true"></span>En service</span>
    <button class="btn secondary sm" onclick="logoutRole()">🔒 Déconnexion</button>`;
  ui.filters.portierRecherche = '';
  refreshPortierDashboard();
  startIdleWatcher();
  afficherNouveautes();
}
function refreshPortierDashboard(){
  $('#viewContainer').innerHTML = renderPortierDashboard();
  const input = $('#portierRecherche');
  if(input){ input.focus(); const pos = input.value.length; input.setSelectionRange(pos, pos); }
}
function renderBoutonEleve(e){
  return `<button class="gate-eleve em-press" onclick="handleNotifierPortier('${e.id}')">
    <span class="gate-eleve-id"><strong>${escapeHtml(eleveFullName(e))}</strong><span class="gate-eleve-classe">${escapeHtml(classeName(e.classeId))}</span></span>
    <span class="gate-eleve-action">${icone('bell')} Prévenir</span>
  </button>`;
}
function renderPortierDashboard(){
  const q = (ui.filters.portierRecherche || '').toLowerCase().trim();

  // Mode recherche : prioritaire dès qu'on tape quelque chose, quelle que
  // soit la classe sélectionnée par ailleurs.
  if(q){
    const resultats = DB.eleves.filter(e => `${e.prenom} ${e.nom}`.toLowerCase().includes(q)).slice(0, 30);
    return `<div class="view active">
      <div class="panel">
        <div class="panel-head"><div><h2>Le parent d’un élève est arrivé</h2><div class="sub">Tapez le nom de l’élève, ou parcourez par classe</div></div></div>
        ${renderPortierBarreRecherche()}
        ${!resultats.length ? `<div class="etat-vide"><span class="etat-vide-ic" aria-hidden="true">${icone('search')}</span><span>Aucun élève à ce nom. Vérifiez l’orthographe ou cherchez par classe.</span></div>` :
          `<div style="display:flex;flex-direction:column;gap:8px;">${resultats.map(renderBoutonEleve).join('')}</div>`}
      </div>
    </div>`;
  }

  // Mode "classe sélectionnée" : liste des élèves de cette classe.
  const classeId = ui.filters.portierClasse;
  if(classeId){
    const c = DB.classes.find(c=>c.id===classeId);
    const elevesClasse = DB.eleves.filter(e=>e.classeId===classeId)
      .sort((a,b)=>eleveFullName(a).localeCompare(eleveFullName(b)));
    return `<div class="view active">
      <div class="panel">
        <button class="btn secondary sm" style="margin-bottom:14px;" onclick="ui.filters.portierClasse=null; refreshPortierDashboard()">‹ Toutes les classes</button>
        <div class="panel-head"><div><h2>${escapeHtml(c?c.nom:'Classe')}</h2><div class="sub">Touchez un nom pour prévenir l’enseignant(e)</div></div></div>
        ${renderPortierBarreRecherche()}
        ${!elevesClasse.length ? `<div class="etat-vide"><span class="etat-vide-ic" aria-hidden="true">${icone('users')}</span><span>Aucun élève actif dans cette classe.</span></div>` :
          `<div style="display:flex;flex-direction:column;gap:8px;">${elevesClasse.map(renderBoutonEleve).join('')}</div>`}
      </div>
    </div>`;
  }

  // Mode par défaut : liste des classes, groupées par cycle.
  const cycles = [...new Set(DB.classes.map(c=>c.cycle))];
  return `<div class="view active">
    <div class="portier-bonjour"><h2>${escapeHtml(salutation())}</h2>${renderQuestionAppel()}</div>
    <div class="panel">
      <div class="panel-head">
        <div><h2>Le parent d’un élève est arrivé</h2><div class="sub">Choisissez une classe, ou tapez le nom de l’élève</div></div>
      </div>
      ${renderPortierBarreRecherche()}
      ${cycles.map(cycle=>`
        <div class="hint" style="font-weight:700;margin:14px 0 8px;">${escapeHtml(cycle)}</div>
        <div class="grid-3">
          ${DB.classes.filter(c=>c.cycle===cycle).map(c=>{
            const effectif = DB.eleves.filter(e=>e.classeId===c.id).length;
            return `<button class="gate-classe em-press" onclick="ui.filters.portierClasse='${c.id}'; refreshPortierDashboard()">
              <strong>${escapeHtml(c.nom)}</strong><span class="gate-eleve-classe">${effectif} élève(s)</span>
            </button>`;
          }).join('')}
        </div>`).join('') || `<div class="empty">Aucune classe active.</div>`}
    </div>
  </div>`;
}
function renderPortierBarreRecherche(){
  return `<input type="text" id="portierRecherche" placeholder="Rechercher un élève…" aria-label="Rechercher un élève dans toutes les classes" value="${escapeHtml(ui.filters.portierRecherche||'')}"
    oninput="ui.filters.portierRecherche=this.value; refreshPortierDashboard()"
    style="width:100%;padding:14px;font-size:var(--fs-md);border:1px solid var(--border);border-radius:var(--r-card);margin-bottom:16px;">`;
}
function renderEtatPortier(etat, e, detail){
  const eleve = e ? `<div class="gate-fiche"><span class="gate-av" aria-hidden="true">${escapeHtml(initials(e.prenom, e.nom))}</span><strong>${escapeHtml(eleveFullName(e))}</strong><span>${escapeHtml(classeName(e.classeId))}</span>
      ${detail && detail.heure ? `<span class="gate-heure">Signalé à ${detail.heure}</span>` : ''}</div>` : '';
  if(etat === 'envoi') return `<div class="view active"><div class="gate-etat-carte" role="status" aria-live="polite">
      <svg class="gate-spinner em-spin" viewBox="0 0 72 72" aria-hidden="true"><circle cx="36" cy="36" r="30" fill="none" stroke="var(--em-gate-border)" stroke-width="6"/><path d="M36 6a30 30 0 0 1 30 30" fill="none" stroke="var(--em-gold-400)" stroke-width="6" stroke-linecap="round"/></svg>
      <div class="gate-etat-titre">Envoi à l’enseignant…</div>${eleve}</div></div>`;
  if(etat === 'ok') return `<div class="view active"><div class="gate-etat-carte" role="status" aria-live="polite">
      <div class="gate-rond gate-rond-ok em-pop"><span class="gate-onde" aria-hidden="true"></span>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path class="gate-coche" d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
      <div class="gate-etat-titre">Enseignant prévenu</div>${eleve}
      <div id="gateAutorises"></div>
      <button class="gate-btn-principal em-press" onclick="ui.filters.portierRecherche=''; refreshPortierDashboard()">Nouveau signalement</button></div></div>`;
  return `<div class="view active"><div class="gate-etat-carte" role="alert">
      <div class="gate-rond gate-rond-erreur"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7L7 17" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"/></svg></div>
      <div class="gate-etat-titre">Envoi impossible</div>${eleve}
      <div class="gate-erreur-detail">${escapeHtml(detail && detail.message ? detail.message : 'Vérifiez la connexion internet puis réessayez.')}</div>
      ${e ? `<button class="gate-btn-principal em-press" onclick="handleNotifierPortier('${e.id}')">Réessayer</button>` : ''}
      <button class="gate-btn-contour em-press" onclick="refreshPortierDashboard()">Retour à la liste</button></div></div>`;
}
async function handleNotifierPortier(eleveId){
  const e = (DB.eleves||[]).find(x => x.id === eleveId);
  $('#viewContainer').innerHTML = renderEtatPortier('envoi', e);
  try{
    const { error } = await sb.from('notifications_portier').insert({ eleve_id: eleveId });
    if(error) throw error;
    // Notification push sur le téléphone de l'enseignant (même application fermée)
    sb.functions.invoke('notifier-arrivee-parent', { body: { eleveId } }).catch(() => {});
    const d = new Date();
    const heure = `${String(d.getHours()).padStart(2,'0')}h${String(d.getMinutes()).padStart(2,'0')}`;
    ui.filters.portierRecherche = '';
    $('#viewContainer').innerHTML = renderEtatPortier('ok', e, { heure });
    afficherAutorisesPortier(eleveId);
    if(navigator.vibrate) try{ navigator.vibrate(30); }catch(_e){}
    toast('Enseignant prévenu · signalement enregistré');
  }catch(err){
    $('#viewContainer').innerHTML = renderEtatPortier('erreur', e, { message: err && err.message ? 'Erreur : ' + err.message : '' });
    if(navigator.vibrate) try{ navigator.vibrate([60,40,60]); }catch(_e){}
  }
}

// Notification de mise à jour : affichée une fois par version, par appareil et par compte.
// Chaque version garde sa liste : un utilisateur qui a manqué une version voit
// aussi ses nouveautés (la plus récente en premier).
const VERSIONS = [
  { version: '2026.10.18-19', nouveautes: {
    commun: [ 'L’application vous demande : « Comment voudriez-vous que je vous appelle ? » — choisissez votre titre et votre nom, un aperçu s’affiche. Vous pouvez le changer à tout moment sur votre page d’accueil.' ],
    parent: [],
    portier: [],
    personnel: [],
  } },
  { version: '2026.10.18-18', nouveautes: {
    commun: [],
    parent: [],
    portier: [],
    personnel: [ 'Fiche élève plus courte et plus claire : onglets Infos / Bulletin / Présences, bulletin en tableau compact, présences en une ligne par jour.' ],
  } },
  { version: '2026.10.18-17', nouveautes: {
    commun: [],
    parent: [],
    portier: [],
    personnel: [ 'Demandes d’accès : après chaque validation, un bouton « Prévenir sur WhatsApp » envoie à la personne un message prêt (« Votre accès est validé… ») pour qu’elle ne reste pas à attendre.' ],
  } },
  { version: '2026.10.18-16', nouveautes: {
    commun: [ 'Chaque espace porte son nom (« Tableau de bord Direction », « Tableau de bord Parent »…) et vous salue selon votre titre (ex. « Bonjour, Monsieur le Directeur… », « Bonjour, Maman… »). Une seule fois, l’application vous demande « Monsieur » ou « Madame ».' ],
    parent: [],
    portier: [],
    personnel: [ 'Enseignants : chaque enseignant a son propre compte et ne voit que ses classes — et seulement ses matières si des matières sont cochées sur sa fiche.',
      'Scolarité et tranches de versement : modifiables uniquement par la direction et la fondation. Les salaires restent visibles uniquement par la direction et la fondation.' ],
  } },
  { version: '2026.10.18-15', nouveautes: {
    commun: [],
    parent: [],
    portier: [],
    personnel: [ 'Correction : sur les bulletins imprimés, la colonne « Appréciation » n’est plus coupée au bord de la page ; les coupons d’invitation ne sont plus coupés entre deux pages.' ],
  } },
  { version: '2026.10.18-14', nouveautes: {
    commun: [],
    parent: [],
    portier: [],
    personnel: [ 'Élèves & Inscriptions : « Cartes scolaires » pour chaque classe — 8 cartes par page A4 (format carte bancaire), à découper.',
      'Correction : les documents imprimés (bulletins, reçus, listes, rapports…) ne commencent plus par une page blanche.' ],
  } },
  { version: '2026.10.18-13', nouveautes: {
    commun: [],
    parent: [],
    portier: [],
    personnel: [ 'Élèves & Inscriptions : « Imprimer la liste » pour chaque classe — liste simple (avec garçons / filles), liste avec les contacts des parents (secrétariat, direction) ou feuille d’émargement.' ],
  } },
  { version: '2026.10.18-12', nouveautes: {
    commun: [],
    parent: [],
    portier: [],
    personnel: [ 'Sécurité : à l’inscription d’un parent, ses enfants sont proposés d’après son numéro (s’il correspond à la fiche) ; la recherche par nom est limitée pour protéger la liste des élèves.' ],
  } },
  { version: '2026.10.18-11', nouveautes: {
    commun: [],
    parent: [],
    portier: [],
    personnel: [ 'Tableau de bord (direction) : bouton « Rapport du mois » — élèves, encaissements et dépenses, reste à encaisser, présence des élèves, ponctualité des enseignants ; à imprimer ou enregistrer en PDF, mois par mois.' ],
  } },
  { version: '2026.10.18-10', nouveautes: {
    commun: [],
    parent: [],
    portier: [],
    personnel: [ 'Paramètres → « Sauvegarde de vos données » (direction) : un fichier Excel avec toutes les données de l’école, une feuille par sujet, à garder sur votre ordinateur.' ],
  } },
  { version: '2026.10.18-9', nouveautes: {
    commun: [],
    parent: [],
    portier: [],
    personnel: [ 'Demandes d’accès : « Traiter » (À faire aujourd’hui) mène directement aux demandes ; les demandes de parents dont le téléphone correspond à la fiche de l’enfant sont marquées « Sûre » et peuvent être approuvées d’un coup.' ],
  } },
  { version: '2026.10.18-8', nouveautes: {
    commun: [ 'Ouverture de l’application : un écran « Ouverture de votre espace… » remplace la page vide ; si la connexion internet manque, un message clair et un bouton « Réessayer » s’affichent — vous n’êtes plus renvoyé à l’écran de connexion.' ],
    parent: [],
    portier: [],
    personnel: [],
  } },
  { version: '2026.10.18-7', nouveautes: {
    commun: [],
    parent: [],
    portier: [],
    personnel: [ 'Parents ↔ Élèves : « Préparer le message » pour le groupe WhatsApp des parents d’une classe (lien + 3 étapes, à relire puis partager).',
      'Enseignants : carte « Invitez vos enseignants » avec QR code, partage WhatsApp et affiche — chaque enseignant s’inscrit lui-même, vous validez.' ],
  } },
  { version: '2026.10.18-6', nouveautes: {
    commun: [ 'Nouvel écran de connexion : accueil « Bienvenue », choix du profil plus clair sur téléphone, logo ou initiales de l’école, champs plus grands.' ],
    parent: [],
    portier: [],
    personnel: [],
  } },
  { version: '2026.10.18-5', nouveautes: {
    commun: [],
    parent: [ 'Nouvelle carte « Aujourd’hui » en haut de l’accueil : présence du jour, prochain événement, devoirs. Plusieurs enfants ? Touchez son prénom pour changer.' ],
    portier: [ 'L’écran de confirmation affiche les initiales, le nom et la classe de l’élève.' ],
    personnel: [ 'Enseignants : « Ma journée » montre vos cours du jour en frise, le cours en cours est mis en évidence.' ],
  } },
  { version: '2026.10.18-4', nouveautes: {
    commun: [],
    parent: [],
    portier: [],
    personnel: [ 'Sur téléphone, toutes les listes (élèves, enseignants, devoirs, agenda, notes…) sont plus lisibles : plus aucun texte qui se chevauche.',
      'Les boutons ont un nom (« Voir le profil », « Modifier »…) ; « Supprimer » est rangé dans le menu « ⋯ ».',
      'Les fenêtres s’ouvrent depuis le bas de l’écran sur téléphone. Appel des élèves : 3 boutons Présent / Absent / Retard.' ],
  } },
  { version: '2026.10.18-3', nouveautes: {
    commun: [],
    parent: [],
    portier: [],
    personnel: [ 'Tableau d’affichage : élèves et enseignants à l’honneur en cartes de célébration, aperçu de la bannière qui défile.',
      'Vie de l’école : formulaire de publication en 4 étapes, ajout de photos plus simple, choix « Toute l’école / Certaines classes ».',
      'Programmes : filtres compacts (classe, enseignant, T1/T2/T3) et une carte par programme avec sa progression.' ],
  } },
  { version: '2026.10.18-2', nouveautes: {
    commun: [],
    parent: [],
    portier: [],
    personnel: [ 'Pointage des enseignants : onglets Aujourd’hui / Journal / Alertes, une carte claire par enseignant (arrivée, départ, badge QR ou GPS) avec 3 boutons Présent / Absent / Retard ; explication du pointage GPS.' ],
  } },
  { version: '2026.10.18-1', nouveautes: {
    commun: [],
    parent: [],
    portier: [],
    personnel: [ 'Emploi du temps : sur téléphone, un jour à la fois (onglets Lun → Ven), une couleur par matière, « + Ajouter un cours » sur les créneaux vides.',
      'Cahier d’appel : nouvel onglet « Aujourd’hui » — 3 boutons Présent / Absent / Retard par élève, « Tous présents », puis « Valider l’appel » (les parents des absents sont prévenus comme avant). L’onglet « Mois » garde le registre complet.' ],
  } },
  { version: '2026.10.17-3', nouveautes: {
    commun: [],
    parent: [],
    portier: [],
    personnel: [ 'Parents ↔ Élèves : une carte claire par élève (Compte relié / Non relié, numéros lisibles), recherche et filtres Non reliés / Reliés ; « Inviter » envoie le lien par WhatsApp, « Relier à un compte » avec recherche.' ],
  } },
  { version: '2026.10.17-2', nouveautes: {
    commun: [],
    parent: [],
    portier: [],
    personnel: [ 'Nouveau look : en-tête plus compact, une seule cloche 🔔 pour les notifications, messages et suggestions (onglets), mode clair/sombre dans le menu.',
      'Tableau de bord plus clair : « À faire aujourd’hui », chiffres clés lisibles, vos classes en un coup d’œil.',
      'Compta → Scolarité : sur téléphone, une carte par élève (reste à payer, tranches Payé / À payer / En retard, bouton « Encaisser »), avec recherche et filtres Soldés / Avec reste / En retard.' ],
  } },
  { version: '2026.10.17-1', nouveautes: {
    commun: [],
    parent: [],
    portier: [],
    personnel: [ 'Correction : une nouvelle école peut maintenant activer ses niveaux et créer ses classes (les classes existantes ne changent pas).' ],
  } },
  { version: '2026.10.13-29', nouveautes: {
    commun: [],
    parent: [],
    portier: [],
    personnel: [ 'Nouveau : « 🔐 Sécurité du compte » (en bas du menu) — double vérification par code à 6 chiffres (Google Authenticator, gratuit). Recommandé pour la direction et le secrétariat : même avec votre mot de passe, personne d’autre ne peut entrer.' ],
  } },
  { version: '2026.10.13-28', nouveautes: {
    commun: [],
    parent: [ 'Si votre école l’active : les notes des devoirs et exercices de votre enfant, dès qu’elles sont saisies, avec la moyenne en cours par matière.' ],
    portier: [],
    personnel: [ 'Paramètres : « Notes au fil de l’eau pour les parents » — chaque parent voit les notes des Camps de base de son enfant dès leur saisie, avec notification (désactivé par défaut).' ],
  } },
  { version: '2026.10.13-27', nouveautes: {
    commun: [],
    parent: [ 'Bulletin : votre enfant voit maintenant son rang dans la classe et la moyenne de la classe.' ],
    portier: [],
    personnel: [ 'Bulletin officiel : coefficients par matière (Paramètres), moyenne générale pondérée, rang (ex æquo gérés), moyenne de la classe, plus forte et plus faible moyenne.', 'Notes & Bulletins : « Résultats » de la classe et impression de tous les bulletins de la classe en une fois (une page par élève).' ],
  } },
  { version: '2026.10.13-26', nouveautes: {
    commun: [],
    parent: [ 'Bulletin : la colonne « Classe » regroupe maintenant tous les devoirs et exercices de l’enfant.' ],
    portier: [],
    personnel: [ 'Nouveau module « Cahier d’appel » : registre du mois (élèves × jours), présent / absent / retard en un toucher, totaux, impression et Excel.', 'Nouveau module « Camps de base » : autant de devoirs, exercices de classe, exercices de maison et interrogations que voulu, notés sur 10, 20… ; leur moyenne entre dans le bulletin avec la composition.' ],
  } },
  { version: '2026.10.14-2', nouveautes: {
    commun: [],
    parent: [],
    portier: [],
    personnel: [ '« Remplir automatiquement » amélioré : photo recto/verso, vocal (2 min), ou texte collé (message WhatsApp du parent) ; aperçu de ce qui a été trouvé avant d’appliquer ; dates, sexe, noms et téléphones vérifiés.' ],
  } },
  { version: '2026.10.14-1', nouveautes: {
    commun: [ 'Correction : une suppression ou une modification refusée n’affiche plus « enregistré » à tort ; un message clair explique pourquoi.' ],
    parent: [],
    portier: [],
    personnel: [],
  } },
  { version: '2026.10.13-25', nouveautes: {
    commun: [],
    parent: [],
    portier: [],
    personnel: [ 'Demandes d’accès des enseignants : fiche retrouvée par le téléphone, indices de confiance (téléphone, nom, classes identiques à la fiche).' ],
  } },
  { version: '2026.10.13-24', nouveautes: {
    commun: [],
    parent: [],
    portier: [],
    personnel: [ 'Fiche élève : encadré « En un coup d’œil » — reste à payer, allergies, personnes autorisées, derniers messages (lus ou non), WhatsApp et appel du parent, certificat.' ],
  } },
  { version: '2026.10.13-23', nouveautes: {
    commun: [],
    parent: [ 'La veille d’une sortie, d’une réunion, d’une fête ou des vacances, rappel à 18h sur votre téléphone (et « pensez à répondre » si l’école attend votre autorisation).' ],
    portier: [],
    personnel: [ 'Agenda : rappel automatique aux parents concernés la veille à 18h ; ceux qui n’ont pas répondu à une autorisation sont relancés.' ],
  } },
  { version: '2026.10.13-22', nouveautes: {
    commun: [],
    parent: [ 'Bulletin : bouton « Imprimer / enregistrer en PDF » pour le garder ou l’envoyer.' ],
    portier: [],
    personnel: [],
  } },
  { version: '2026.10.13-21', nouveautes: {
    commun: [],
    parent: [ 'Inscription : indiquez votre numéro WhatsApp, l’école valide votre demande plus vite.' ],
    portier: [],
    personnel: [ 'Demandes d’accès des parents : indices de confiance (téléphone et nom identiques à la fiche, ou différents) et enregistrement du numéro sur les fiches qui n’en ont pas.' ],
  } },
  { version: '2026.10.13-20', nouveautes: {
    commun: [],
    parent: [],
    portier: [],
    personnel: [ 'Affiches A4 à imprimer (grand QR code + 3 étapes) : application des parents pour l’entrée, application des enseignants pour la salle des professeurs, pré-inscription en ligne.' ],
  } },
  { version: '2026.10.13-19', nouveautes: {
    commun: [],
    parent: [],
    portier: [],
    personnel: [ 'Direction : « Mise en route de l’école » complétée — nom du directeur et téléphone, scolarité paramétrée, enseignants inscrits (bouton pour leur envoyer le lien par WhatsApp).' ],
  } },
  { version: '2026.10.13-18', nouveautes: {
    commun: [],
    parent: [ 'En bas de l’accueil : « Contacter l’école » — appeler, WhatsApp, itinéraire jusqu’à l’école, écrire dans l’application.' ],
    portier: [],
    personnel: [],
  } },
  { version: '2026.10.13-17', nouveautes: {
    commun: [],
    parent: [],
    portier: [],
    personnel: [ 'Messagerie : « Messages envoyés aux parents » avec accusés de lecture (✓ envoyé, ✓✓ lu, avec l’heure) et bouton WhatsApp pour prévenir un parent qui n’a pas lu.' ],
  } },
  { version: '2026.10.13-16', nouveautes: {
    commun: [],
    parent: [],
    portier: [],
    personnel: [ 'Tableau de bord : encadré « À traiter » — demandes d’accès, pré-inscriptions, documents, corrections, messages de parents et objets perdus en attente, d’un coup d’œil.' ],
  } },
  { version: '2026.10.13-15', nouveautes: {
    commun: [],
    parent: [ 'Nouveau sur l’accueil : « Demander un document » (certificat de scolarité…) — vous êtes prévenu(e) dès qu’il est prêt à retirer.' ],
    portier: [],
    personnel: [ 'Élèves & Inscriptions : « Documents demandés par les parents » — Préparer (certificat), Prêt (le parent est prévenu), Remis.' ],
  } },
  { version: '2026.10.13-14', nouveautes: {
    commun: [],
    parent: [],
    portier: [],
    personnel: [ 'Fiche élève : bouton « 📄 Certificat de scolarité » — document prêt à imprimer (logo, n°, classe, année scolaire, signature et cachet).' ],
  } },
  { version: '2026.10.13-13', nouveautes: {
    commun: [],
    parent: [],
    portier: [],
    personnel: [ 'Nouveau : pré-inscription en ligne. Élèves & Inscriptions → « Lien à partager » (WhatsApp, Facebook) ; les demandes des familles arrivent ici, avec bouton « Inscrire » qui pré-remplit la fiche.' ],
  } },
  { version: '2026.10.13-12', nouveautes: {
    commun: [],
    parent: [ 'Nouveau sur l’accueil : « À la cantine » — le repas et le goûter du jour et du lendemain (si l’école publie son menu).' ],
    portier: [],
    personnel: [ 'Nouveau menu « Menu de la cantine » : saisissez les repas et goûters de la semaine, copiez la semaine précédente, prévenez les parents.' ],
  } },
  { version: '2026.10.13-11', nouveautes: {
    commun: [],
    parent: [],
    portier: [],
    personnel: [ 'Tableau de bord : « Élèves à surveiller » — absences répétées (3 ou plus en 30 jours, ou absent aux 2 derniers appels), avec bouton WhatsApp vers le parent.' ],
  } },
  { version: '2026.10.13-10', nouveautes: {
    commun: [],
    parent: [ 'Fiche de votre enfant : « Historique depuis la rentrée » — taux de présence, absences et retards mois par mois.' ],
    portier: [],
    personnel: [],
  } },
  { version: '2026.10.13-9', nouveautes: {
    commun: [],
    parent: [ 'Chaque vendredi à 17h30 : le résumé de la semaine de vos enfants (présences, devoirs à venir, prochaines dates).' ],
    portier: [],
    personnel: [ 'Les parents reçoivent chaque vendredi le résumé de la semaine de leurs enfants (désactivable dans Paramètres).' ],
  } },
  { version: '2026.10.13-8', nouveautes: {
    commun: [],
    parent: [ 'Une erreur sur la fiche de votre enfant (date de naissance, téléphone…) ? Bouton « Signaler une erreur sur la fiche » : l’école vérifie et corrige.' ],
    portier: [],
    personnel: [ 'Élèves & Inscriptions : « Corrections proposées par les parents » — ancien → nouveau, appliquez en un clic (notification à chaque demande).' ],
  } },
  { version: '2026.10.13-7', nouveautes: {
    commun: [],
    parent: [ 'Sorties, réunions, fêtes : répondez directement à l’école depuis « À venir » (j’autorise / je serai présent).' ],
    portier: [],
    personnel: [ 'Agenda : demandez une autorisation parentale ou une confirmation de présence ; suivez les réponses par classe et relancez par WhatsApp les parents sans réponse.' ],
  } },
  { version: '2026.10.13-6', nouveautes: {
    commun: [],
    parent: [ 'Nouveau sur la fiche de votre enfant : « Sécurité & santé » — indiquez qui peut venir le chercher (le portier le verra) et ses allergies.' ],
    portier: [ 'Après chaque signalement, la liste des personnes autorisées à venir chercher l’enfant s’affiche.' ],
    personnel: [ 'Fiche élève : bouton « Sécurité & santé » (personnes autorisées, allergies, informations utiles).', 'Enseignants : les allergies des élèves de vos classes apparaissent dans « Ma journée ».' ],
  } },
  { version: '2026.10.13-5', nouveautes: {
    commun: [],
    parent: [ 'Le jour de l’anniversaire de votre enfant, l’école lui souhaite un joyeux anniversaire dans votre application. 🎂' ],
    portier: [],
    personnel: [ 'Tableau de bord : « Anniversaires de la semaine » de vos élèves.', 'Le jour J à 8h, les parents reçoivent automatiquement les vœux de l’école (désactivable dans Paramètres → Anniversaires des élèves).' ],
  } },
  { version: '2026.10.13-4', nouveautes: {
    commun: [],
    parent: [ 'Chaque soir à 18h, rappel des devoirs pour le lendemain sur votre téléphone.' ],
    portier: [],
    personnel: [ 'Chaque soir à 18h (dimanche au jeudi), les parents reçoivent automatiquement le rappel des devoirs du lendemain.', '« Ma journée » : rappel des devoirs notés pour le prochain jour de classe, bouton « Noter un devoir ».' ],
  } },
  { version: '2026.10.13-3', nouveautes: {
    commun: [],
    parent: [ 'Nouveau : « Devoirs » sur l’accueil — le travail à faire noté par l’enseignant de votre enfant, avec une notification.' ],
    portier: [],
    personnel: [ 'Nouveau menu « Cahier de textes » : notez les devoirs de vos classes, les parents les voient aussitôt (notification au choix).' ],
  } },
  { version: '2026.10.13-2', nouveautes: {
    commun: [],
    parent: [ 'Chaque paiement de scolarité vous est confirmé dans vos messages, avec le reste à payer.', 'Nouveau : « Écrire à l’école » dans vos messages — l’école vous répond ici.', 'Nouveau : « À venir » sur l’accueil — vacances, compositions, réunions et fêtes de l’école.', 'Nouvel onglet « Vie de l’école » : photos et vidéos des événements, J’aime, Bravo et commentaires.' ],
    portier: [],
    personnel: [ 'Enseignants : encadré « Ma journée » (appel, absences signalées, renforcement, parents arrivés, agenda) pour vos classes.', 'Paiement de scolarité : le parent reçoit automatiquement la confirmation (application + notification), avec bouton WhatsApp sous le reçu.', 'Exports Excel : liste des élèves (une feuille par classe) et état de la scolarité avec les impayés.', 'Messagerie : les parents peuvent vous écrire ; bouton « Répondre » et notification à chaque message.', 'Nouveau menu « Agenda de l’école » : vacances, compositions, réunions ; les vacances arrêtent les annonces automatiquement.', 'Notes & Bulletins : la Direction publie un trimestre, les parents voient le bulletin de leurs enfants.', 'Enseignants : application « EcoMaZ-ENSEIGNANTS » — chacun s’inscrit avec Google, coche ses classes et ne voit que ses classes.', 'Parents : à l’inscription, ils cochent eux-mêmes leurs enfants ; vous n’avez plus qu’à approuver.', 'Paramètres → Scolarité : assistant « inscription + scolarité par classe ».', 'Paramètres → Scolarité : relances automatiques et polies des tranches impayées (3 jours avant, le jour même, 7 jours après).', 'Notifications sur le téléphone pour tout le personnel : demandes d’accès, absences signalées, objets perdus, appel non fait.', 'Appel rapide : « Tous présents », puis touchez le nom des absents ; rappel à 9h00 si l’appel n’est pas fait.', 'Paramètres → Scolarité : montants et tranches de paiement propres à chaque classe, copie vers d’autres classes, affichage aux parents au choix.', 'Direction : liste « Mise en route de l’école » sur le tableau de bord, avec ce qui reste à faire.', 'Nouveau menu « Vie de l’école » : publiez les photos et vidéos des événements pour les parents (toute l’école ou certaines classes).' ],
  } },
  { version: '2026.10.12-2', nouveautes: {
    commun: [],
    parent: [ 'Nouveau : bouton « Signaler une absence à l’avance » (maladie, rendez-vous…) sur l’accueil.' ],
    portier: [ 'L’enseignant est maintenant prévenu sur son téléphone, même application fermée.' ],
    personnel: [ 'Appel : les absences signalées à l’avance par les parents sont déjà marquées, avec leur motif.', 'Enseignants : notification sur le téléphone quand un parent arrive au portail (même application fermée).', 'Parents ↔ Élèves : coupons d’invitation à imprimer (QR code) ; demandes d’accès avec les enfants probables cochés d’avance.' ],
  } },
  { version: '2026.10.12', nouveautes: {
    commun: [],
    parent: [ 'Nouveau : bouton « Signaler une absence à l’avance » (maladie, rendez-vous…) sur l’accueil.', 'Notifications sur le téléphone, même application fermée : touchez « Activer les notifications » sur l’accueil.', 'Annonces de la journée 15 minutes avant : début des cours, pauses, fin des cours et cours de renforcement — avec notification du téléphone si vous l’autorisez.', 'L’information sur l’activité à venir défile dans une bande jaune en haut de l’accueil (touchez-la pour la mettre en pause) ; les précédentes sont dans « Informations passées ».', 'Nouvel onglet « Objets perdus » : signalez une affaire de votre enfant perdue à l’école, l’école vous répond.' ],
    portier: [],
    personnel: [ 'Appel : les absences signalées à l’avance par les parents sont déjà marquées, avec leur motif.', 'Enseignants : notification sur le téléphone quand un parent arrive au portail (même application fermée).', 'Nouveau menu « Parents ↔ Élèves » : reliez chaque élève au compte de son parent (suggestions, invitation WhatsApp).', 'Nouveau menu « Cours de renforcement » : inscriptions par classe, jours et heure, message aux seuls parents concernés.', 'Paramètres → Annonces horaires : heures réelles, pause de 10h, jours de classe, vacances ; case « cours de renforcement » sur la fiche élève.', 'Messagerie : les objets perdus signalés par les parents, avec une réponse à leur envoyer.' ],
  } },
  { version: '2026.10.11-2', nouveautes: {
    commun: [
      'Nouvelle icône de l’application, aux couleurs vert forêt et or.',
    ],
    parent: [],
    portier: [],
    personnel: [
      'Appel : bouton « Prévenir le parent » pour envoyer l’absence par WhatsApp, gratuitement (secrétariat, direction).',
      'Pointage GPS : le lien est envoyé à l’enseignant par WhatsApp.',
      'Fiche élève : une question de confirmation si la date d’inscription est dans le futur.',
      'Matricules : deux élèves ne peuvent plus avoir le même numéro.',
      'Élèves & Inscriptions : encadré « Fiches à vérifier » pour corriger les dates ou numéros mal saisis.',
      'Élèves & Inscriptions : bouton « Importer depuis Excel » pour ajouter une liste d’élèves d’un coup.',
      'Direction : bouton « Bilan de la semaine » sur le tableau de bord (à imprimer ou partager par WhatsApp).',
    ],
  } },
  { version: '2026.10.11', nouveautes: {
    commun: [
      'Nouvelle apparence : couleurs vert forêt et or, police plus lisible, icônes plus nettes.',
      'Mode sombre : bouton lune / soleil en haut de l’écran.',
    ],
    parent: [
      'La fiche de votre enfant affiche sa présence de la semaine.',
      'Les actualités de l’école sont présentées avec leur date.',
      'Tableau d’honneur : vous pouvez désormais applaudir les lauréats.',
      'Barre en bas : Accueil, Messages, Suggestions et Profil (déconnexion).',
    ],
    portier: [
      'Écran sombre plus lisible dehors, grands boutons « Prévenir ».',
      'Confirmation claire quand l’enseignant est prévenu, avec l’heure.',
    ],
    personnel: [
      'Recherche rapide : bouton loupe (ou Ctrl + K) pour trouver un élève ou une page.',
      'Sur téléphone : barre de raccourcis en bas de l’écran.',
      'Tableau de bord : messages clairs quand l’appel n’est pas encore fait.',
      'Fiche élève : la date de naissance est vérifiée à la saisie.',
    ],
  } },
];
const APP_VERSION = VERSIONS[0].version;
function afficherNouveautes(){
  try{
    if(!session.userId) return;
    const cle = v => `ecomaz_nouveautes_${v}_${session.userId}`;
    const nonVues = VERSIONS.filter(v => !localStorage.getItem(cle(v.version)));
    if(nonVues.length === 0) return;
    const role = ui.role === 'parent' ? 'parent' : ui.role === 'portier' ? 'portier' : 'personnel';
    const textes = [];
    nonVues.forEach(v => v.nouveautes.commun.concat(v.nouveautes[role]).forEach(t => { if(!textes.includes(t)) textes.push(t); }));
    if(textes.length === 0){ nonVues.forEach(v => localStorage.setItem(cle(v.version), '1')); return; }
    // Les 6 plus récentes d'abord ; les autres dans un volet repliable
    const li = t => `<li>${escapeHtml(t)}</li>`;
    const premieres = textes.slice(0, 6).map(li).join(''), autres = textes.slice(6).map(li).join('');
    setTimeout(() => {
      if(document.getElementById('modalBackdrop').classList.contains('open')) return;
      openModal('EcoMaZ a été mis à jour', `
        <div class="maj-intro">✨ Votre application <strong>${escapeHtml(nomApplication())}</strong> vient d’être mise à jour. Vos données et vos habitudes ne changent pas.</div>
        <ul class="maj-liste">${premieres}</ul>
        ${autres ? `<details class="maj-autres"><summary>Voir les ${textes.length - 6} autres nouveautés</summary><ul class="maj-liste">${autres}</ul></details>` : ''}
        ${role === 'personnel' ? `<p class="hint" style="margin-top:10px;">📘 Tous les gestes expliqués pas à pas : <a href="docs/EcoMaZ-Guide-du-personnel.pdf" target="_blank" rel="noopener">guide du personnel (PDF)</a>.</p>` : ''}
        <div class="form-actions"><button type="button" class="btn" onclick="closeModal()">J’ai compris</button></div>`);
      nonVues.forEach(v => localStorage.setItem(cle(v.version), '1'));
    }, 900);
  }catch(_e){ /* stockage indisponible : on n'insiste pas */ }
}
function enterApp(){
  document.body.classList.remove('theme-parent');
  $('#loginGate').classList.remove('open');
  $('#appRoot').style.display = '';
  $('#sidebar').style.display = '';
  $('#burger').style.display = '';
  applyBranding();
  applyRoleVisibility();
  rafraichirBulles();
  go('dashboard');
  startIdleWatcher();
  majBanniereHorsLigne();
  synchroniserFileAttente();
  startPollingBulles();
  afficherNouveautes();
  activerPush(true);
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
/* =====================================================================
   🔐 DOUBLE VÉRIFICATION (code à 6 chiffres, schema.sql section 81)
   Application gratuite sur le téléphone : Google Authenticator, Microsoft
   Authenticator… La base elle-même refuse toute donnée à un compte protégé
   tant que le code n'est pas saisi.
   ===================================================================== */
async function niveauVerification(){
  try{ const { data } = await sb.auth.mfa.getAuthenticatorAssuranceLevel(); return data; }catch(_e){ return null; }
}
// À l'entrée : si le compte est protégé et que le code n'a pas été saisi, on le demande
async function exigerDoubleVerification(){
  const n = await niveauVerification();
  if(n && n.nextLevel === 'aal2' && n.currentLevel !== 'aal2'){ afficherEcranCode(); return true; }
  return false;
}
function afficherEcranCode(message){
  const gate = $('#loginGate');
  gate.classList.add('open');
  gate.innerHTML = `<div class="login-card"><div class="login-logo">🔐</div><h1>Double vérification</h1>
    <div class="sub">Ouvrez votre application d’authentification (Google Authenticator…) et tapez le code à 6 chiffres affiché pour EcoMaZ.</div>
    <form class="pin-pad" onsubmit="return validerCodeConnexion(event)">
      <input id="codeMfa" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required placeholder="000000" style="font-size:1.6rem;letter-spacing:.4em;text-align:center;">
      <div class="pin-error" role="alert">${message ? escapeHtml(message) : ''}</div>
      <button class="btn" type="submit" style="width:100%;margin-top:10px;">Vérifier</button>
      <button type="button" class="pin-back" onclick="logoutRole()">Se déconnecter</button>
    </form></div>`;
  setTimeout(() => { const c = $('#codeMfa'); if(c) c.focus(); }, 50);
}
async function validerCodeConnexion(ev){
  ev.preventDefault();
  const code = ($('#codeMfa')?.value || '').replace(/\D/g, '');
  try{
    const { data, error } = await sb.auth.mfa.listFactors();
    if(error) throw error;
    const facteur = (data?.totp || []).find(f => f.status === 'verified');
    if(!facteur) throw new Error('Aucune double vérification trouvée sur ce compte.');
    const r = await sb.auth.mfa.challengeAndVerify({ factorId: facteur.id, code });
    if(r.error) throw new Error('Code incorrect ou expiré : tapez le nouveau code affiché.');
    $('#loginGate').innerHTML = renderLoginGate('login', '', true);
    await entrerSelonRole();
  }catch(e){ afficherEcranCode(e.message); }
  return false;
}
// Menu « Sécurité du compte » : activer / désactiver
async function ouvrirSecuriteCompte(){
  openModal('🔐 Sécurité du compte', '<div class="hint">Chargement…</div>');
  try{
    const { data } = await sb.auth.mfa.listFactors();
    const actif = (data?.totp || []).find(f => f.status === 'verified');
    $('#modalBody').innerHTML = actif ? `
      <div class="section-note" style="background:var(--green-bg, #e3f1eb);">✅ <strong>Double vérification activée</strong> sur ce compte. À chaque connexion, le code à 6 chiffres de votre application d’authentification est demandé — même avec votre mot de passe, personne d’autre ne peut entrer.</div>
      <div class="form-actions"><button class="btn secondary" onclick="closeModal()">Fermer</button><button class="btn danger" onclick="desactiverDoubleVerification('${actif.id}')">Désactiver</button></div>` : `
      <p>Protégez ce compte : après le mot de passe, EcoMaZ demandera un <strong>code à 6 chiffres</strong> qui change toutes les 30 secondes sur votre téléphone. Même si quelqu’un découvre votre mot de passe, il ne pourra pas entrer.</p>
      <ol class="hint" style="line-height:1.7;"><li>Installez sur votre téléphone l’application gratuite <strong>Google Authenticator</strong> (ou Microsoft Authenticator).</li><li>Cliquez sur « Commencer », puis scannez le QR code avec cette application.</li><li>Tapez le code affiché pour confirmer.</li></ol>
      <div class="form-actions"><button class="btn secondary" onclick="closeModal()">Plus tard</button><button class="btn" onclick="commencerDoubleVerification()">Commencer</button></div>`;
  }catch(e){ $('#modalBody').innerHTML = `<div class="hint">Erreur : ${escapeHtml(e.message)}</div>`; }
}
async function commencerDoubleVerification(){
  try{
    // Un essai précédent non terminé est retiré d'abord
    const { data: liste } = await sb.auth.mfa.listFactors();
    for(const f of (liste?.all || []).filter(f => f.status !== 'verified')) await sb.auth.mfa.unenroll({ factorId: f.id });
    const { data, error } = await sb.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'EcoMaZ ' + new Date().toISOString().slice(0, 10) });
    if(error) throw error;
    $('#modalBody').innerHTML = `
      <p>Scannez ce QR code avec Google Authenticator (bouton « + » → « Scanner un code QR ») :</p>
      <div style="text-align:center;"><img id="qrDoubleVerif" alt="QR code de double vérification" style="width:220px;height:220px;background:#fff;padding:8px;border-radius:12px;"></div>
      <p class="hint">Impossible de scanner ? Saisissez cette clé dans l’application : <code style="user-select:all;word-break:break-all;">${escapeHtml(data.totp.secret)}</code></p>
      <form onsubmit="return confirmerDoubleVerification(event, '${data.id}')">
        <div class="field"><label>Code à 6 chiffres affiché par l’application</label><input id="codeActivation" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required style="font-size:1.4rem;letter-spacing:.3em;"></div>
        <div class="pin-error" id="erreurActivation" role="alert"></div>
        <div class="form-actions"><button type="button" class="btn secondary" onclick="closeModal()">Annuler</button><button class="btn" type="submit">Activer</button></div>
      </form>`;
    // Le QR code (SVG) contient des guillemets : on l'affecte par le DOM, jamais dans le HTML
    const img = document.getElementById('qrDoubleVerif');
    if(img) img.src = /^data:image\/svg\+xml;utf-?8,/.test(data.totp.qr_code)
      ? 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(data.totp.qr_code.replace(/^data:image\/svg\+xml;utf-?8,/, ''))
      : data.totp.qr_code;
  }catch(e){ $('#modalBody').innerHTML = `<div class="hint">Activation impossible : ${escapeHtml(e.message)}</div>`; }
}
async function confirmerDoubleVerification(ev, factorId){
  ev.preventDefault();
  const code = ($('#codeActivation')?.value || '').replace(/\D/g, '');
  const r = await sb.auth.mfa.challengeAndVerify({ factorId, code });
  if(r.error){ $('#erreurActivation').textContent = 'Code incorrect : tapez le code actuellement affiché (il change toutes les 30 secondes).'; return false; }
  closeModal(); toast('🔐 Double vérification activée : le code sera demandé à chaque connexion');
  return false;
}
async function desactiverDoubleVerification(factorId){
  if(!confirm('Désactiver la double vérification ? Votre compte ne sera plus protégé que par le mot de passe.')) return;
  const { error } = await sb.auth.mfa.unenroll({ factorId });
  if(error){ alert('Désactivation impossible : ' + error.message); return; }
  await sb.auth.refreshSession().catch(() => {});
  closeModal(); toast('Double vérification désactivée');
}
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
  // Parent et Portier ont chacun leur application dédiée (parent.html /
  // portier.html). Page dédiée : seul le bon rôle y entre. Page du personnel :
  // un compte parent/portier est renvoyé vers son application.
  const fixe = window.ESPACE_FIXE;
  if(fixe && session.role !== fixe){
    await deconnexion();
    ui.role = null;
    const err = new Error(`Ce compte n'est pas un compte ${fixe === 'parent' ? 'parent' : fixe === 'enseignant' ? 'enseignant' : 'portier'}. Utilisez l'application qui correspond à votre profil.`);
    err.suspendu = true;
    throw err;
  }
  if(!fixe && (session.role === 'parent' || session.role === 'portier')){
    const page = session.role === 'parent' ? 'parent.html' : 'portier.html';
    window.location.replace(page + '?ecole=' + encodeURIComponent(session.ecoleId));
    return;
  }
  if(fixe){ try{ localStorage.setItem('ecomaz_ecole_' + fixe, session.ecoleId); }catch(_e){} }
  // Compte protégé par la double vérification : code à 6 chiffres avant toute donnée
  if(await exigerDoubleVerification()) return;
  // Un compte parent a son propre chemin de chargement (minimal, jamais le
  // chargeur générique du personnel — voir chargerDBParent()) et son propre
  // écran, sans le tableau de bord/menu du personnel.
  if(session.role === 'parent'){
    DB = await chargerDBParent();
    if(DB.meta.actif === false){
      await deconnexion();
      ui.role = null; DB = null;
      const err = new Error("Cet établissement a été suspendu. Contactez l'administrateur.");
      err.suspendu = true;
      throw err;
    }
    enterAppParent();
    return;
  }
  // Un compte portier a lui aussi son propre chemin de chargement minimal
  // (uniquement la liste des élèves actifs, noms/classes — jamais les
  // coordonnées des parents ni aucune autre donnée).
  if(session.role === 'portier'){
    DB = await chargerDBPortier();
    if(DB.meta.actif === false){
      await deconnexion();
      ui.role = null; DB = null;
      const err = new Error("Cet établissement a été suspendu. Contactez l'administrateur.");
      err.suspendu = true;
      throw err;
    }
    enterAppPortier();
    return;
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
  stopPollingBulles();
  document.body.classList.remove('theme-parent', 'has-parent-nav');
  if(window.ESPACE_FIXE !== 'portier') document.body.classList.remove('theme-portier');
  const navParentEl = document.getElementById('parentNav'); if(navParentEl) navParentEl.remove();
  if(typeof arreterScanPointage === 'function') arreterScanPointage();
  await desactiverPushAppareil();
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

/* ---------------------------------------------------------------------
   "Parent à la porte" — un compte enseignant vérifie toutes les 20 sec.
   s'il y a une nouvelle notification du portier (voir schema.sql section
   36). Pas de websocket/Realtime ici : un simple sondage périodique
   suffit largement pour ce cas d'usage (portier au portail, enseignant
   en classe) et reste plus simple à garder fiable.
   --------------------------------------------------------------------- */
let bullesPollTimer = null;
function startPollingBulles(){
  stopPollingBulles();
  bullesPollTimer = setInterval(async () => {
    try{
      if(['enseignant','secretariat','direction','fondation'].includes(ui.role)){
        const { data, error } = await sb.from('notifications_portier').select('*').order('created_at', {ascending:false});
        if(error) throw error;
        const nouvelles = rowsToCamel(data);
        const avaitDejaNonVues = (DB.notificationsPortier||[]).some(n=>!n.vue);
        const aMaintenantNonVues = nouvelles.some(n=>!n.vue);
        DB.notificationsPortier = nouvelles;
        if(ui.role==='enseignant' && aMaintenantNonVues && !avaitDejaNonVues) toast('🚪 Un parent est à la porte');
      }
      // Messages/suggestions ne sont pas poussés en temps réel (pas de
      // websocket) : on les re-interroge au même rythme que le sondage
      // portier, pour les rôles concernés seulement.
      if(['parent','enseignant','secretariat','direction','fondation'].includes(ui.role)){
        const { data, error } = await sb.from('messages_internes').select('*').order('created_at', {ascending:false});
        if(!error) DB.messagesInternes = rowsToCamel(data);
      }
      // Annonces horaires (début des cours, pauses, fin) : arrivent sans recharger
      if(ui.role === 'parent') await verifierNouvellesAnnonces();
      if(['direction','fondation'].includes(ui.role)){
        const { data, error } = await sb.from('suggestions').select('*').order('created_at', {ascending:false});
        if(!error) DB.suggestions = rowsToCamel(data);
      }
      rafraichirBulles();
    }catch(_e){ /* échec silencieux : on retentera au prochain sondage */ }
  }, 20000);
}
function stopPollingBulles(){
  clearInterval(bullesPollTimer);
  bullesPollTimer = null;
}


/* ---------------------------------------------------------------------
   4. TABLEAU DE BORD
   --------------------------------------------------------------------- */
let dashboardDejaAnime = false;
function animerCompteursKpi(){
  document.querySelectorAll('#viewContainer [data-compteur]').forEach(el => {
    const n = parseInt(el.dataset.compteur, 10);
    el.removeAttribute('data-compteur');
    if(window.EmMotion) EmMotion.countUp(el, n, { duration:900 }); else el.textContent = n;
  });
}
/* ---------- Refonte du tableau de bord (DESIGN.md §11) : affichage seulement ---------- */
function icone(nom){ return window.EmIcones ? EmIcones.svg(nom) : ''; }
function estJourDeClasse(iso){
  const j = ((new Date(iso + 'T12:00:00').getDay() + 6) % 7) + 1;
  return (DB.horairesAnnonces?.joursCours || [1, 2, 3, 4, 5]).includes(j);
}
// Bande unique « À faire aujourd'hui » : appel, pointage, demandes des familles
function renderAFaireAujourdhui(){
  const auj = todayISO(), admin = ['secretariat','direction','fondation'].includes(ui.role);
  const lignes = [];
  if(estJourDeClasse(auj)){
    const sansAppel = classesVisibles().filter(c => DB.eleves.some(e => e.classeId === c.id && e.statut === 'Actif') && !DB.presencesEleves.some(p => p.classeId === c.id && p.date === auj));
    if(sansAppel.length && hasAccess('presences-eleves')) lignes.push({ ic:'clipboard', texte:`Appel non fait dans ${sansAppel.length} classe${sansAppel.length > 1 ? 's' : ''}`, detail: sansAppel.slice(0, 4).map(c => c.nom).join(', ') + (sansAppel.length > 4 ? '…' : ''), bouton:'Faire l’appel', action:"go('presences-eleves')" });
    if(admin && hasAccess('presences-enseignants')){
      const nonPointes = DB.enseignants.filter(t => t.statut === 'Actif' && !DB.presencesEnseignants.some(p => p.enseignantId === t.id && p.date === auj));
      if(nonPointes.length) lignes.push({ ic:'clock', texte:`${nonPointes.length} enseignant${nonPointes.length > 1 ? 's' : ''} non pointé${nonPointes.length > 1 ? 's' : ''}`, detail:'', bouton:'Voir le pointage', action:"go('presences-enseignants')" });
    }
  }
  if(admin){
    chargerATraiter();
    const c = DB.aTraiter?.compteurs || {};
    SUJETS_A_TRAITER.filter(su => (!su.roles || su.roles.includes(ui.role)) && (c[su.cle] || 0) > 0)
      .forEach(su => lignes.push({ ic:'mail', texte:`${c[su.cle]} ${su.lib}`, detail:'', bouton:'Traiter', action:`DB.aTraiter.charge=0; go('${su.vue}')${su.cle === 'acces' ? "; allerAuxDemandesAcces()" : ''}` }));
  }
  return `<section class="panel afaire" aria-labelledby="titreAFaire">
    <div class="afaire-tete"><h2 id="titreAFaire">À faire aujourd’hui</h2>${lignes.length ? `<span class="afaire-compte">${lignes.length}</span>` : ''}</div>
    ${lignes.length ? `<ul class="afaire-liste">${lignes.map(l => `<li class="afaire-ligne">
        <span class="afaire-ic" aria-hidden="true">${icone(l.ic)}</span>
        <span class="afaire-txt"><strong>${escapeHtml(l.texte)}</strong>${l.detail ? `<span>${escapeHtml(l.detail)}</span>` : ''}</span>
        <button type="button" class="btn sm" onclick="${l.action}">${l.bouton}</button></li>`).join('')}</ul>`
      : `<div class="etat-vide etat-vide-ok"><span class="etat-vide-ic" aria-hidden="true">${icone('circle-check')}</span><span>Rien en attente : tout est à jour.</span></div>`}
  </section>`;
}
// Vue d'ensemble : une ligne par classe, détail en feuille
function renderLignesClasses(){
  const auj = todayISO();
  return DB.classes.map(c => {
    const eff = DB.eleves.filter(e => e.classeId === c.id && e.statut === 'Actif').length;
    const pres = DB.presencesEleves.filter(p => p.classeId === c.id && p.date === auj);
    const presents = pres.filter(p => p.statut !== 'Absent').length;
    const badge = pres.length ? `<span class="badge-etat ok">${icone('check')}Appel fait ${presents}/${eff}</span>` : `<span class="badge-etat attente">${icone('clock')}Appel non fait</span>`;
    return `<button type="button" class="ligne-classe" onclick="ouvrirDetailClasse('${c.id}')">
      <span class="lc-nom"><strong>${escapeHtml(c.nom)}</strong><small>${escapeHtml(c.cycle)}</small></span>
      <span class="lc-eff">${eff} élève${eff > 1 ? 's' : ''}</span>${badge}</button>`;
  }).join('');
}
function ouvrirDetailClasse(id){
  const c = DB.classes.find(x => x.id === id); if(!c) return;
  const auj = todayISO();
  const eleves = DB.eleves.filter(e => e.classeId === id && e.statut === 'Actif');
  const pres = DB.presencesEleves.filter(p => p.classeId === id && p.date === auj);
  const nb = s => pres.filter(p => p.statut === s).length;
  const tit = enseignantById(c.titulaireId);
  openModal(c.nom, `
    <div class="detail-lignes">
      <div><span>Cycle</span><strong>${escapeHtml(c.cycle)}</strong></div>
      <div><span>Effectif</span><strong>${eleves.length} élève${eleves.length > 1 ? 's' : ''}</strong></div>
      <div><span>Titulaire</span><strong>${tit ? escapeHtml(ensFullName(tit)) : 'Non désigné'}</strong></div>
      <div><span>Appel du jour</span><strong>${pres.length ? `${nb('Présent')} présents · ${nb('Absent')} absents · ${nb('Retard')} retards` : 'Non fait'}</strong></div>
    </div>
    <div class="form-actions">
      ${hasAccess('eleves') ? `<button type="button" class="btn secondary" onclick="closeModal(); go('eleves')">Voir les élèves</button>` : ''}
      ${hasAccess('presences-eleves') ? `<button type="button" class="btn" onclick="closeModal(); ui.filters.presEleves = { classeId:'${id}', date:'${auj}' }; go('presences-eleves')">${pres.length ? 'Voir l’appel' : 'Faire l’appel'}</button>` : ''}
    </div>`);
}
function renderBanniereNotifications(){
  if(!(pushPossible() && Notification.permission === 'default')) return '';
  try{ if(localStorage.getItem('ecomaz_banniere_push_fermee') === '1') return ''; }catch(_e){}
  return `<div class="banniere-discrete no-print" role="note">
    <span class="bd-ic" aria-hidden="true">${icone('bell')}</span>
    <span class="bd-txt">Recevez les alertes sur ce téléphone${ui.role === 'enseignant' ? ' (parent au portail, appel)' : ' (appel non fait, demandes, absences)'}.</span>
    <button type="button" class="btn sm" onclick="activerPush(false).then(ok => { if(ok){ toast('Notifications activées sur ce téléphone'); renderView('dashboard'); } })">Activer</button>
    <button type="button" class="bd-fermer" aria-label="Fermer" onclick="try{ localStorage.setItem('ecomaz_banniere_push_fermee','1'); }catch(_e){} this.closest('.banniere-discrete').remove()">${icone('x') || '×'}</button>
  </div>`;
}
function montantKpi(n){ return `${Math.round(n || 0).toLocaleString('fr-FR')}<span class="kpi-unite">${DEVISE}</span>`; }
function renderDashboard(){
  const today = todayISO();
  const totalEleves = DB.eleves.filter(e=>e.statut==='Actif').length;
  const totalEns = DB.enseignants.filter(e=>e.statut==='Actif').length;

  const presToday = DB.presencesEleves.filter(p=>p.date===today);
  const tauxEleves = presToday.length ? Math.round(100*presToday.filter(p=>p.statut==='Présent').length/presToday.length) : null;

  const presEnsToday = DB.presencesEnseignants.filter(p=>p.date===today);
  const tauxEns = presEnsToday.length ? Math.round(100*presEnsToday.filter(p=>p.statut==='Présent').length/presEnsToday.length) : null;

  const maxEffectif = Math.max(...DB.classes.map(c=>DB.eleves.filter(e=>e.classeId===c.id && e.statut==='Actif').length), 1);

  const animer = !dashboardDejaAnime;
  dashboardDejaAnime = true;
  const barsHtml = DB.classes.map((c, i)=>{
    const n = DB.eleves.filter(e=>e.classeId===c.id && e.statut==='Actif').length;
    const pct = Math.round(100*n/maxEffectif);
    const anim = animer && i < 12 ? ` em-fill-x" style="width:${pct}%;animation-delay:${i*40}ms` : `" style="width:${pct}%`;
    return `<div class="repart-ligne${n ? '' : ' repart-vide'}">
      <div class="repart-nom">${escapeHtml(c.nom)}</div>
      <div class="repart-piste"><div class="repart-barre${anim}"></div></div>
      <div class="repart-n">${n}</div>
    </div>`;
  }).join('');

  const ensAbsents = presEnsToday.filter(p=>p.statut!=='Présent').map(p=>{
    const t = enseignantById(p.enseignantId);
    return `<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border);font-size:var(--fs-xs);">
      <span>${escapeHtml(ensFullName(t))}</span>
      <span class="badge ${p.statut==='Absent'?'red':'amber'}">${p.statut}</span>
    </div>`;
  }).join('') || (presEnsToday.length
      ? `<div class="alerte-ok">${window.EmIcones ? EmIcones.svg('circle-check') : ''}Aucune absence d'enseignant aujourd'hui.</div>`
      : `<div class="hint">Aucun pointage d'enseignant enregistré aujourd'hui.</div>`);

  const elAbsentsCount = presToday.filter(p=>p.statut==='Absent').length;
  const elRetardCount = presToday.filter(p=>p.statut==='Retard').length;
  const alertesEleves = !presToday.length
    ? `<div class="hint">L'appel n'a pas encore été fait aujourd'hui.${hasAccess('presences-eleves') ? ` <a href="#" onclick="go('presences-eleves');return false;">Faire l'appel</a>` : ''}</div>`
    : (elAbsentsCount || elRetardCount)
      ? `<div class="alerte-pastilles"><span class="pastille-absent">${elAbsentsCount} élève(s) absent(s)</span><span class="pastille-retard">${elRetardCount} retard(s)</span></div>`
      : `<div class="alerte-ok">${window.EmIcones ? EmIcones.svg('circle-check') : ''}Aucune absence signalée aujourd'hui.</div>`;
  const lien = (vue, texte) => hasAccess(vue) ? `<a href="#" class="kpi-lien" onclick="go('${vue}');return false;">${texte}</a>` : '';
  const kpi = (i, icone, fond, valeur, libelle, vide) => `<div class="card kpi-carte${animer ? ' em-rise' : ''}" style="--i:${i}">
        <div class="card-top"><div class="icon-badge" style="background:${fond};">${icone}</div></div>
        ${valeur === null ? `<div class="kpi-vide">${vide[0]}</div>${vide[1]}` : `<div class="num"${animer && typeof valeur === 'number' ? ` data-compteur="${valeur}"` : ''}>${typeof valeur === 'number' ? (animer ? 0 : valeur) : valeur}</div>`}
        <div class="label">${libelle}</div>
      </div>`;

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
      <td>${taux===null ? '<span class="hint">Appel non fait</span>' : `<span class="badge ${taux>=90?'green':taux>=75?'amber':'red'}">${taux}%</span>`}</td>
    </tr>`;
  }).join('');

  const finance = ['direction','fondation'].includes(ui.role);
  const ensPresents = presEnsToday.filter(p => p.statut !== 'Absent').length;
  let encaisseMois = 0, resteTotal = 0;
  if(finance){
    const mois = today.slice(0, 7);
    encaisseMois = (DB.paiementsScolarite || []).filter(p => String(p.date || '').startsWith(mois)).reduce((t, p) => t + Number(p.montant || 0), 0);
    try{ resteTotal = DB.eleves.filter(e => e.statut === 'Actif').reduce((t, e) => t + (scolariteEleveParEcheance(e.id).reste || 0), 0); }catch(_e){ resteTotal = 0; }
  }
  const prenom = (session.nomComplet || '').trim().split(/\s+/)[0] || '';
  const dateLongue = new Date(today + 'T12:00:00').toLocaleDateString('fr-FR', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
  return `
  <div class="view active">
    <div class="db-bonjour"><div><h2>${escapeHtml(salutation())}</h2><div class="db-date">${dateLongue}</div>${renderQuestionAppel()}</div>
      ${['direction','fondation'].includes(ui.role) ? `<button type="button" class="btn secondary sm" onclick="ouvrirRapportMois()">${icone('file-text')} Rapport du mois</button>` : ''}</div>
    ${renderAFaireAujourdhui()}
    <div class="cards cards-2x2">
      ${kpi(0, icone('graduation-cap'), 'var(--primary-dim)', totalEleves, 'Élèves inscrits')}
      ${kpi(1, icone('presentation'), 'var(--purple-bg)', presEnsToday.length ? `${ensPresents}/${totalEns}` : totalEns, presEnsToday.length ? 'Enseignants présents aujourd’hui' : 'Enseignants (pointage non fait)')}
      ${finance ? kpi(2, icone('banknote'), 'var(--green-bg)', montantKpi(encaisseMois), 'Encaissé ce mois')
        : kpi(2, icone('circle-check'), 'var(--green-bg)', tauxEleves===null ? null : tauxEleves+'%', 'Présence élèves aujourd’hui', ['Appel non effectué', lien('presences-eleves', 'Faire l’appel')])}
      ${finance ? kpi(3, icone('wallet'), 'var(--accent-soft)', montantKpi(resteTotal), 'Reste à encaisser')
        : kpi(3, icone('clock'), 'var(--blue-bg)', tauxEns===null ? null : tauxEns+'%', 'Présence enseignants aujourd’hui', ['Aucun pointage aujourd’hui', lien('presences-enseignants', 'Voir le journal')])}
    </div>
    ${animer ? `${(setTimeout(animerCompteursKpi, 0), '')}` : ''}
    ${renderMiseEnRoute()}
    ${renderMaJournee()}
    ${renderElevesASurveiller()}
    ${renderAnniversaires()}
    ${(ui.role==='direction' || ui.role==='fondation') ? `<div class="form-actions no-print" style="justify-content:flex-start;margin:0 0 var(--sp-4);"><button class="btn secondary" onclick="ouvrirBilanHebdo()">📊 Bilan de la semaine</button></div>` : ''}

    ${renderBanniereNotifications()}
    ${ui.role==='enseignant' ? renderActualitesParent() + renderTableauHonneurParent() : ''}

    <div class="grid-2">
      <div class="panel">
        <div class="panel-head"><div><h2>Répartition des élèves par classe</h2></div></div>
        ${barsHtml}
      </div>
      <div class="panel">
        <div class="panel-head"><div><h2>Vue d’ensemble par classe</h2></div></div>
        <div class="lignes-classes">${renderLignesClasses()}</div>
      </div>
    </div>
  </div>`;
}

/* ---------------------------------------------------------------------
   5. ÉLÈVES
   --------------------------------------------------------------------- */
/* ---------- Liste de classe imprimable : simple, avec contacts, émargement ---------- */
function ouvrirListeClasse(classeId, type){
  const admin = ['secretariat','direction','fondation'].includes(ui.role);
  type = type || 'simple';
  if(type === 'contacts' && !admin) type = 'simple';
  const c = DB.classes.find(x => x.id === classeId); if(!c) return;
  const m = DB.meta || {};
  const eleves = DB.eleves.filter(e => e.classeId === classeId && e.statut === 'Actif')
    .sort((a, b) => (a.nom || '').localeCompare(b.nom || '') || (a.prenom || '').localeCompare(b.prenom || ''));
  const g = eleves.filter(e => e.sexe === 'M').length, f = eleves.filter(e => e.sexe === 'F').length;
  const titres = { simple:'LISTE DE CLASSE', contacts:'LISTE DE CLASSE — CONTACTS DES PARENTS', emargement:'FEUILLE D’ÉMARGEMENT' };
  const nbCases = 6;
  const entete = type === 'simple' ? '<th>N°</th><th>Matricule</th><th>Nom</th><th>Prénom(s)</th><th>Sexe</th><th>Né(e) le</th>'
    : type === 'contacts' ? '<th>N°</th><th>Nom et prénom(s)</th><th>Parent / Tuteur</th><th>Téléphone</th>'
    : `<th>N°</th><th>Nom et prénom(s)</th>${Array.from({ length: nbCases }, () => '<th class="lc-case"></th>').join('')}`;
  const ligne = (e, i) => type === 'simple'
      ? `<td>${i + 1}</td><td>${escapeHtml(e.matricule || '')}</td><td><strong>${escapeHtml(String(e.nom || '').toUpperCase())}</strong></td><td>${escapeHtml(e.prenom || '')}</td><td>${escapeHtml(e.sexe || '')}</td><td>${e.dateNaissance ? fmtDate(e.dateNaissance) : ''}</td>`
    : type === 'contacts'
      ? `<td>${i + 1}</td><td><strong>${escapeHtml(String(e.nom || '').toUpperCase())}</strong> ${escapeHtml(e.prenom || '')}</td><td>${escapeHtml(e.parentNom || '')}</td><td style="white-space:nowrap;">${escapeHtml(e.parentTel || '')}</td>`
      : `<td>${i + 1}</td><td><strong>${escapeHtml(String(e.nom || '').toUpperCase())}</strong> ${escapeHtml(e.prenom || '')}</td>${Array.from({ length: nbCases }, () => '<td class="lc-case"></td>').join('')}`;
  const choix = [['simple', 'Liste simple'], ...(admin ? [['contacts', 'Avec contacts des parents']] : []), ['emargement', 'Feuille d’émargement']];
  openModal(`Liste — ${c.nom}`, `
    <div class="no-print" style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:space-between;margin-bottom:12px;">
      <div class="segmente" role="group" aria-label="Type de liste">${choix.map(([k, l]) => `<button type="button" class="seg${type === k ? ' actif' : ''}" onclick="ouvrirListeClasse('${classeId}','${k}')">${l}</button>`).join('')}</div>
      <button type="button" class="btn" onclick="window.print()">${icone('printer')} Imprimer / PDF</button>
    </div>
    <section class="liste-classe">
      <div class="recu-head">${m.logo ? `<img src="${escapeHtml(m.logo)}" alt="">` : `<div class="recu-logo-ph">🎓</div>`}
        <div><strong>${escapeHtml(m.nomEcole || '')}</strong><div class="hint">${escapeHtml(m.adresse || '')}${m.telephone ? ' · ' + escapeHtml(m.telephone) : ''}</div></div>
        <div style="margin-left:auto;text-align:right;"><strong>${titres[type]}</strong><div class="hint">${escapeHtml(c.nom)} · ${escapeHtml(m.anneeScolaire || '')}</div></div></div>
      <div class="lc-resume">Effectif : <strong>${eleves.length}</strong> · Garçons : <strong>${g}</strong> · Filles : <strong>${f}</strong>${type === 'emargement' ? ' · Objet : ……………………………… · Date : ……/……/………' : ''}</div>
      <table class="lc-table${type === 'emargement' ? ' emargement' : ''}"><thead><tr>${entete}</tr></thead>
        <tbody>${eleves.map((e, i) => `<tr>${ligne(e, i)}</tr>`).join('')}</tbody></table>
      <div class="hint" style="margin-top:8px;">Imprimé le ${fmtDate(todayISO())}${type === 'contacts' ? ' — document confidentiel : ne pas afficher' : ''}</div>
    </section>`);
}
/* ---------- Cartes scolaires (format carte bancaire, 8 par page A4) ---------- */
function ouvrirCartesScolaires(classeId){
  const c = DB.classes.find(x => x.id === classeId); if(!c) return;
  const m = DB.meta || {};
  const eleves = DB.eleves.filter(e => e.classeId === classeId && e.statut === 'Actif')
    .sort((a, b) => (a.nom || '').localeCompare(b.nom || '') || (a.prenom || '').localeCompare(b.prenom || ''));
  const carte = e => `<article class="carte-scolaire">
    <header class="cs-tete">${m.logo ? `<img src="${escapeHtml(m.logo)}" alt="">` : `<span class="cs-logo">${escapeHtml(String(m.nomEcole || 'E').charAt(0))}</span>`}
      <span class="cs-ecole"><strong>${escapeHtml(m.nomEcole || '')}</strong><small>CARTE SCOLAIRE ${escapeHtml(m.anneeScolaire || '')}</small></span></header>
    <div class="cs-corps">
      <span class="cs-av" aria-hidden="true">${escapeHtml(initials(e.prenom, e.nom))}</span>
      <dl class="cs-infos">
        <div><dt>Nom</dt><dd><strong>${escapeHtml(String(e.nom || '').toUpperCase())}</strong></dd></div>
        <div><dt>Prénom(s)</dt><dd>${escapeHtml(e.prenom || '')}</dd></div>
        <div><dt>Classe</dt><dd>${escapeHtml(c.nom)}</dd></div>
        <div><dt>Matricule</dt><dd>${escapeHtml(e.matricule || '—')}</dd></div>
        <div><dt>Né(e) le</dt><dd>${e.dateNaissance ? fmtDate(e.dateNaissance) : '—'}</dd></div>
      </dl>
    </div>
    <footer class="cs-pied"><span>${m.telephone ? 'Tél. école : ' + escapeHtml(m.telephone) : escapeHtml(m.adresse || '')}</span><span class="cs-signe">Le Directeur</span></footer>
  </article>`;
  openModal(`Cartes scolaires — ${c.nom} (${eleves.length})`, `
    <div class="form-actions no-print" style="margin-top:0;justify-content:space-between;align-items:center;">
      <span class="hint" style="margin:0;">8 cartes par page A4, à découper (format carte bancaire). Imprimez de préférence sur papier cartonné.</span>
      <button type="button" class="btn" onclick="window.print()">${icone('printer')} Imprimer / PDF</button>
    </div>
    <div class="cartes-scolaires">${eleves.map(carte).join('')}</div>`);
}
function renderEleves(){
  if(ui.eleveProfileId) return renderEleveProfile(ui.eleveProfileId);
  return renderEleveListe();
}

/* ---------------------------------------------------------------------
   BILAN HEBDOMADAIRE (Direction / Fondation)
   Semaine du lundi au dimanche : présences élèves et enseignants,
   encaissements, dépenses, nouvelles inscriptions. Imprimable, et
   partageable gratuitement par WhatsApp (résumé texte).
   --------------------------------------------------------------------- */
function lundiDe(iso){
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}
function decalerJours(iso, n){ const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); }
function calculerBilanHebdo(lundi){
  const dimanche = decalerJours(lundi, 6);
  const dansSemaine = x => x.date >= lundi && x.date <= dimanche;
  const presEl = DB.presencesEleves.filter(dansSemaine);
  const presEns = DB.presencesEnseignants.filter(dansSemaine);
  const pct = (n, t) => t ? Math.round(100 * n / t) : null;
  const absencesParEleve = {};
  presEl.filter(p => p.statut === 'Absent').forEach(p => absencesParEleve[p.eleveId] = (absencesParEleve[p.eleveId] || 0) + 1);
  const parClasse = DB.classes.map(c => {
    const l = presEl.filter(p => p.classeId === c.id);
    return { nom: c.nom, appels: new Set(l.map(p => p.date)).size, taux: pct(l.filter(p => p.statut !== 'Absent').length, l.length) };
  }).filter(c => c.appels);
  const retardsEns = {};
  presEns.filter(p => p.statut === 'Retard' || p.statut === 'Absent').forEach(p => {
    const r = retardsEns[p.enseignantId] = retardsEns[p.enseignantId] || { retards: 0, minutes: 0, absences: 0 };
    if(p.statut === 'Retard'){ r.retards++; r.minutes += Number(p.minutesRetard) || 0; } else r.absences++;
  });
  const paiements = (DB.paiementsScolarite || []).filter(dansSemaine);
  const parMode = {};
  paiements.forEach(p => parMode[p.modePaiement || 'Autre'] = (parMode[p.modePaiement || 'Autre'] || 0) + Number(p.montant || 0));
  const depenses = (DB.depenses || []).filter(dansSemaine);
  return {
    lundi, dimanche,
    joursAppel: new Set(presEl.map(p => p.date)).size,
    tauxEleves: pct(presEl.filter(p => p.statut !== 'Absent').length, presEl.length),
    nbAbsences: presEl.filter(p => p.statut === 'Absent').length,
    nbRetardsEleves: presEl.filter(p => p.statut === 'Retard').length,
    elevesSouventAbsents: Object.entries(absencesParEleve).filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1])
      .map(([id, n]) => ({ e: eleveById(id), n })).filter(x => x.e),
    parClasse,
    tauxEns: pct(presEns.filter(p => p.statut !== 'Absent').length, presEns.length),
    ensRetards: Object.entries(retardsEns).map(([id, r]) => ({ t: enseignantById(id), ...r })).filter(x => x.t)
      .sort((a, b) => (b.absences - a.absences) || (b.minutes - a.minutes)),
    encaisse: paiements.reduce((s, p) => s + Number(p.montant || 0), 0), nbPaiements: paiements.length, parMode,
    depense: depenses.reduce((s, d) => s + Number(d.montant || 0), 0), nbDepenses: depenses.length,
    inscriptions: DB.eleves.filter(e => e.dateInscription >= lundi && e.dateInscription <= dimanche),
  };
}
function texteBilanHebdo(b){
  const pc = v => v === null ? 'pas d’appel' : v + ' %';
  const lignes = [
    `*Bilan de la semaine — ${DB.meta?.nomEcole || 'École'}*`,
    `Du ${fmtDate(b.lundi)} au ${fmtDate(b.dimanche)}`,
    '',
    `Élèves : présence ${pc(b.tauxEleves)} (${b.joursAppel} jour(s) d’appel), ${b.nbAbsences} absence(s), ${b.nbRetardsEleves} retard(s).`,
  ];
  if(b.elevesSouventAbsents.length) lignes.push(`Absents 2 fois ou plus : ${b.elevesSouventAbsents.map(x => `${eleveFullName(x.e)} (${x.n})`).join(', ')}.`);
  lignes.push(`Enseignants : présence ${pc(b.tauxEns)}${b.ensRetards.length ? ', ' + b.ensRetards.map(x => `${ensFullName(x.t)} : ${x.retards ? x.retards + ' retard(s), ' + x.minutes + ' min' : ''}${x.retards && x.absences ? ', ' : ''}${x.absences ? x.absences + ' absence(s)' : ''}`).join(' ; ') : ', aucun retard'}.`);
  lignes.push(`Scolarité encaissée : ${fmtFCFA(b.encaisse)} (${b.nbPaiements} paiement(s)).`);
  lignes.push(`Dépenses : ${fmtFCFA(b.depense)} (${b.nbDepenses}).`);
  lignes.push(`Nouvelles inscriptions : ${b.inscriptions.length}.`);
  lignes.push('', '— EcoMaZ');
  return lignes.join('\n');
}
function ouvrirBilanHebdo(lundi){
  lundi = lundi || lundiDe(todayISO());
  const b = calculerBilanHebdo(lundi);
  const pc = v => v === null ? '—' : v + ' %';
  const carte = (titre, valeur, sous) => `<div class="panel" style="margin:0;padding:var(--sp-3);"><div class="hint" style="margin:0;">${titre}</div><div style="font-size:var(--em-fs-24, 24px);font-weight:900;">${valeur}</div>${sous ? `<div class="hint" style="margin:0;">${sous}</div>` : ''}</div>`;
  const lienWa = `https://wa.me/?text=${encodeURIComponent(texteBilanHebdo(b))}`;
  const futur = decalerJours(lundi, 7) > todayISO();
  openModal(`Bilan de la semaine`, `
    <div class="form-actions no-print" style="justify-content:space-between;margin-top:0;">
      <button type="button" class="btn secondary sm" onclick="ouvrirBilanHebdo('${decalerJours(lundi, -7)}')">← Semaine précédente</button>
      ${futur ? '' : `<button type="button" class="btn secondary sm" onclick="ouvrirBilanHebdo('${decalerJours(lundi, 7)}')">Semaine suivante →</button>`}
    </div>
    <h3 style="margin:var(--sp-2) 0;">${escapeHtml(DB.meta?.nomEcole || '')} — du ${fmtDate(b.lundi)} au ${fmtDate(b.dimanche)}</h3>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:var(--sp-3);margin-bottom:var(--sp-4);">
      ${carte('Présence élèves', pc(b.tauxEleves), `${b.joursAppel} jour(s) d’appel · ${b.nbAbsences} absence(s)`)}
      ${carte('Présence enseignants', pc(b.tauxEns), `${b.ensRetards.reduce((s, x) => s + x.retards, 0)} retard(s)`)}
      ${carte('Scolarité encaissée', fmtFCFA(b.encaisse), `${b.nbPaiements} paiement(s)`)}
      ${carte('Dépenses', fmtFCFA(b.depense), `${b.nbDepenses} opération(s)`)}
      ${carte('Nouvelles inscriptions', b.inscriptions.length, '')}
    </div>
    ${b.parClasse.length ? `<h4>Présence par classe</h4><div class="table-wrap"><table><thead><tr><th>Classe</th><th>Jours d’appel</th><th>Présence</th></tr></thead><tbody>
      ${b.parClasse.map(c => `<tr><td>${escapeHtml(c.nom)}</td><td>${c.appels}</td><td>${pc(c.taux)}</td></tr>`).join('')}</tbody></table></div>` : '<div class="hint">Aucun appel enregistré cette semaine.</div>'}
    ${b.elevesSouventAbsents.length ? `<h4>Élèves absents 2 fois ou plus</h4><div class="table-wrap"><table><thead><tr><th>Élève</th><th>Classe</th><th>Absences</th></tr></thead><tbody>
      ${b.elevesSouventAbsents.map(x => `<tr><td>${escapeHtml(eleveFullName(x.e))}</td><td>${escapeHtml(classeName(x.e.classeId))}</td><td>${x.n}</td></tr>`).join('')}</tbody></table></div>` : ''}
    ${b.ensRetards.length ? `<h4>Retards et absences des enseignants</h4><div class="table-wrap"><table><thead><tr><th>Enseignant</th><th>Retards</th><th>Minutes</th><th>Absences</th></tr></thead><tbody>
      ${b.ensRetards.map(x => `<tr><td>${escapeHtml(ensFullName(x.t))}</td><td>${x.retards}</td><td>${x.minutes}</td><td>${x.absences}</td></tr>`).join('')}</tbody></table></div>` : ''}
    ${Object.keys(b.parMode).length ? `<h4>Encaissements par mode de paiement</h4><div class="table-wrap"><table><tbody>
      ${Object.entries(b.parMode).map(([m, v]) => `<tr><td>${escapeHtml(m)}</td><td>${fmtFCFA(v)}</td></tr>`).join('')}</tbody></table></div>` : ''}
    <div class="form-actions no-print" style="flex-wrap:wrap;">
      <a class="btn secondary" href="${lienWa}" target="_blank" rel="noopener">📲 Partager par WhatsApp</a>
      <button type="button" class="btn" onclick="window.print()">🖨️ Imprimer</button>
    </div>`);
}
/* ---------------------------------------------------------------------
   MISE EN ROUTE DE L'ÉCOLE — tableau de bord Direction / Fondation.
   Liste d'étapes calculée sur les vraies données : ce qui est fait, ce
   qui manque, et un bouton pour y aller. Se replie quand tout est fait.
   --------------------------------------------------------------------- */
function etapesMiseEnRoute(){
  const actifs = (DB.eleves || []).filter(e => e.statut === 'Actif');
  const relies = actifs.filter(e => (DB.parentsEleves || []).some(pe => pe.eleveId === e.id)).length;
  const ensActifs = (DB.enseignants || []).filter(t => t.statut === 'Actif').length;
  const semaine = decalerJours(todayISO(), -7);
  const appelsRecents = (DB.presencesEleves || []).filter(p => p.date >= semaine).length;
  const m = DB.meta || {};
  const comptesEnseignants = (DB.profiles || []).filter(pr => pr.role === 'enseignant' && pr.enseignantId).length;
  return [
    { ok: (DB.classes || []).length > 0, titre: 'Classes créées', detail: `${(DB.classes || []).length} classe(s)`, vue: 'parametres', bouton: 'Paramètres' },
    { ok: actifs.length > 0, titre: 'Élèves inscrits', detail: `${actifs.length} élève(s) actif(s)`, vue: 'eleves', bouton: 'Élèves' },
    { ok: ensActifs > 0, titre: 'Enseignants saisis', detail: ensActifs ? `${ensActifs} enseignant(s)` : 'Aucun enseignant : pas de pointage, ni d’appel par les enseignants', vue: 'enseignants', bouton: 'Ajouter les enseignants' },
    { ok: actifs.length > 0 && relies / actifs.length >= 0.8, titre: 'Parents reliés à leur enfant', detail: `${relies} / ${actifs.length} — sans lien, le parent ne reçoit ni annonces ni alertes`, vue: 'liens-parents', bouton: 'Relier les parents' },
    { ok: appelsRecents > 0, titre: 'Appel fait cette semaine', detail: appelsRecents ? `${appelsRecents} présence(s) enregistrée(s) en 7 jours` : 'Aucun appel depuis 7 jours : les parents ne sont pas prévenus des absences', vue: 'presences-eleves', bouton: 'Faire l’appel' },
    { ok: (DB.paiementsScolarite || []).length > 0, titre: 'Paiements de scolarité enregistrés', detail: (DB.paiementsScolarite || []).length ? `${DB.paiementsScolarite.length} paiement(s)` : 'Aucun paiement saisi : pas de reçus, ni de suivi des impayés', vue: 'comptabilite', bouton: 'Comptabilité' },
    { ok: (DB.emploiTemps || []).length > 0, titre: 'Emploi du temps', detail: (DB.emploiTemps || []).length ? 'rempli' : 'vide', vue: 'emploi-temps', bouton: 'Emploi du temps' },
    { ok: m.geofenceLatitude != null, titre: 'Zone de l’école (pointage GPS)', detail: m.geofenceLatitude != null ? 'définie' : 'non définie', vue: 'parametres', bouton: 'Paramètres' },
    { ok: !!m.logo, titre: 'Logo de l’école', detail: m.logo ? 'ajouté' : 'non ajouté (apparaît sur les reçus et les applications)', vue: 'parametres', bouton: 'Paramètres' },
    { ok: !!(m.directeurNom && m.telephone), titre: 'Nom du directeur et téléphone de l’école', detail: !m.directeurNom ? 'nom du directeur manquant (signature des certificats et des reçus)' : !m.telephone ? 'téléphone manquant (bouton « Appeler » des parents)' : 'renseignés', vue: 'parametres', bouton: 'Paramètres' },
    { ok: (DB.echeancesScolarite || []).length > 0, titre: 'Scolarité et tranches paramétrées', detail: (DB.echeancesScolarite || []).length ? `${DB.echeancesScolarite.length} tranche(s)` : 'aucune tranche : pas de reste à payer ni de relances', vue: 'parametres', bouton: 'Paramètres' },
    { ok: comptesEnseignants > 0, titre: 'Enseignants inscrits dans leur application', detail: comptesEnseignants ? `${comptesEnseignants} compte(s) enseignant relié(s)` : 'aucun : envoyez le lien EcoMaZ-ENSEIGNANTS (appel, devoirs, « Ma journée »)', vue: 'enseignants', bouton: '📲 Envoyer le lien par WhatsApp', action: "window.open('https://wa.me/?text=' + encodeURIComponent(messagePartageApplication('enseignant.html')), '_blank')" },
  ];
}
// Tableau de bord ENSEIGNANT : « Ma journée », classe par classe
function renderMaJournee(){
  if(ui.role !== 'enseignant') return '';
  if(!session.enseignantId) return `<div class="panel"><div class="hint">Votre compte n’est relié à aucune classe : demandez à la direction de valider votre inscription (application EcoMaZ-ENSEIGNANTS).</div></div>`;
  // Données chargées une fois (absences signalées, agenda), puis le tableau de bord se réaffiche
  if(DB.absencesSignalees === undefined){ DB.absencesSignalees = null; chargerAbsencesSignalees().then(() => { if(ui.currentView === 'dashboard') renderView('dashboard'); }).catch(() => { DB.absencesSignalees = []; }); }
  if(DB.agenda === undefined){ DB.agenda = null; sb.from('evenements_agenda').select('*').eq('ecole_id', session.ecoleId).gte('date_fin', todayISO()).order('date_debut').limit(20)
    .then(({ data }) => { DB.agenda = rowsToCamel(data || []); if(ui.currentView === 'dashboard') renderView('dashboard'); }); }
  if(DB.devoirs === undefined){ DB.devoirs = null; sb.from('devoirs').select('*').eq('ecole_id', session.ecoleId).gte('pour_le', todayISO()).order('pour_le')
    .then(({ data }) => { DB.devoirs = rowsToCamel(data || []); if(ui.currentView === 'dashboard') renderView('dashboard'); }); }
  chargerSecuriteEleves();
  const prochain = prochainJourClasse();
  const aujourd = todayISO(), jourIso = ((new Date().getDay() + 6) % 7) + 1;
  const renfAujourdhui = (DB.horairesAnnonces?.joursRenforcement || [1,2,3,4,5]).includes(jourIso);
  const classes = classesVisibles();
  const cartes = classes.map(c => {
    const eleves = DB.eleves.filter(e => e.classeId === c.id && e.statut === 'Actif');
    const appel = DB.presencesEleves.filter(p => p.classeId === c.id && p.date === aujourd);
    const absents = appel.filter(p => p.statut === 'Absent').length;
    const signales = eleves.map(e => ({ e, a: absenceSignalee(e.id, aujourd) })).filter(x => x.a);
    const renf = renfAujourdhui ? eleves.filter(e => e.renforcement) : [];
    const arrivees = (DB.notificationsPortier || []).filter(n => n.classeId === c.id && String(n.createdAt || '').slice(0, 10) === aujourd);
    return `<div class="mj-classe">
      <div class="mj-tete"><strong>${escapeHtml(c.nom)}</strong><span class="hint" style="margin:0;">${eleves.length} élève(s)</span></div>
      <div class="mj-ligne">${appel.length ? `<span class="badge green">✓ Appel fait</span> ${absents} absent(s)` : `<span class="badge red">Appel non fait</span> <button class="btn sm" onclick="ui.filters.presEleves={classeId:'${c.id}', date:'${aujourd}'}; go('presences-eleves')">Faire l’appel</button>`}</div>
      ${signales.length ? `<div class="mj-ligne">📝 Absences signalées : ${signales.map(x => `${escapeHtml(eleveFullName(x.e))} <span class="hint">(${escapeHtml(x.a.motif)})</span>`).join(', ')}</div>` : ''}
      ${DB.devoirs ? (() => { const dv = DB.devoirs.filter(d => d.classeId === c.id && d.pourLe === prochain); return `<div class="mj-ligne">📒 ${dv.length ? `Devoirs ${quandDevoir(prochain)} : ${dv.map(d => escapeHtml(d.matiere || 'travail')).join(', ')}` : `Aucun devoir noté ${quandDevoir(prochain)}`} <button class="btn secondary sm" onclick="ui.filters.devoirsClasse='${c.id}'; go('devoirs')">${dv.length ? 'Voir' : 'Noter un devoir'}</button></div>`; })() : ''}
      ${(() => { const al = eleves.map(e => ({ e, s: santeDe(e.id) })).filter(x => x.s && x.s.allergies); return al.length ? `<div class="mj-ligne">⚕️ Allergies : ${al.map(x => `${escapeHtml(eleveFullName(x.e))} <span class="hint">(${escapeHtml(x.s.allergies)})</span>`).join(', ')}</div>` : ''; })()}
      ${renf.length ? `<div class="mj-ligne">📘 Renforcement ce soir : ${renf.map(e => escapeHtml(eleveFullName(e))).join(', ')}</div>` : ''}
      ${arrivees.length ? `<div class="mj-ligne">🚪 Parents arrivés : ${arrivees.map(n => `${escapeHtml(n.eleveNom)} <span class="hint">(${new Date(n.createdAt).toLocaleTimeString('fr-FR', {hour:'2-digit', minute:'2-digit'})})</span>`).join(', ')}</div>` : ''}
    </div>`;
  }).join('');
  const ids = new Set(classes.map(c => c.id));
  const dates = (DB.agenda || []).filter(ev => ev.dateFin >= aujourd && (!ev.classeIds || ev.classeIds.some(id => ids.has(id)))).slice(0, 3);
  return `<div class="panel">
    <div class="panel-head"><div><h2>Ma journée</h2><div class="sub">${(d => d.charAt(0).toUpperCase() + d.slice(1))(new Date().toLocaleDateString('fr-FR', {weekday:'long', day:'numeric', month:'long'}))} · vos classes</div></div></div>
    ${renderFriseDuJour(classes)}
    <div class="mj-grille">${cartes || '<div class="hint">Aucune classe.</div>'}</div>
    ${dates.length ? `<div class="mj-ligne" style="margin-top:10px;">📅 À venir : ${dates.map(ev => `${escapeHtml(ev.titre)} <span class="hint">(${delaiAgenda(ev)})</span>`).join(' · ')}</div>` : ''}
  </div>`;
}
// Emploi du temps du jour en frise, cours en cours mis en évidence (DESIGN.md §11 Console Enseignant)
function renderFriseDuJour(classes){
  const jour = JOURS[(new Date().getDay() + 6) % 7];
  if(!jour) return '';
  const maintenant = new Date(), hhmm = `${String(maintenant.getHours()).padStart(2,'0')}:${String(maintenant.getMinutes()).padStart(2,'0')}`;
  const cours = [];
  classes.forEach(c => (PERIODES_BY_CYCLE[c.cycle] || []).forEach((p, i) => {
    if(p.type !== 'cours') return;
    const e = (DB.emploiTemps || []).find(x => x.classeId === c.id && x.jour === jour && x.slotIndex === i);
    if(e && (!session.enseignantId || !e.enseignantId || e.enseignantId === session.enseignantId)) cours.push({ p, e, c });
  }));
  cours.sort((a, b) => a.p.debut.localeCompare(b.p.debut));
  if(!cours.length) return `<div class="etat-vide" style="margin-bottom:12px;"><span class="etat-vide-ic" aria-hidden="true">${icone('calendar')}</span><span>Aucun cours prévu pour vous aujourd’hui dans l’emploi du temps. <button type="button" class="lien-discret" onclick="go('emploi-temps')">Voir l’emploi du temps</button></span></div>`;
  return `<ol class="frise" aria-label="Cours d’aujourd’hui">${cours.map(({ p, e, c }) => {
    const etat = hhmm >= p.fin ? 'passe' : hhmm >= p.debut ? 'encours' : 'avenir';
    return `<li class="frise-cours ${etat}" style="--mat:${couleurMatiere(e.matiere)}">
      <span class="frise-heure">${p.debut}<small>${p.fin}</small></span>
      <span class="frise-txt"><strong>${escapeHtml(e.matiere)}</strong><small>${escapeHtml(c.nom)}</small></span>
      ${etat === 'encours' ? '<span class="tt-badge-encours">En cours</span>' : etat === 'passe' ? '<span class="frise-fait" aria-label="terminé">✓</span>' : ''}
    </li>`; }).join('')}</ol>`;
}
function renderMiseEnRoute(){
  if(!['direction','fondation'].includes(ui.role)) return '';
  const etapes = etapesMiseEnRoute(), faites = etapes.filter(e => e.ok).length;
  if(faites === etapes.length) return '';
  const pct = Math.round(100 * faites / etapes.length);
  const ouvert = ui.filters.miseEnRouteOuvert !== false;
  return `<div class="panel mise-en-route">
    <div class="panel-head">
      <div><h2>Mise en route de l’école <span class="mer-score">${faites} / ${etapes.length}</span></h2><div class="sub">Plus ces étapes sont faites, plus EcoMaZ travaille pour vous.</div></div>
      <button class="btn secondary sm" onclick="ui.filters.miseEnRouteOuvert=${!ouvert}; renderView('dashboard')">${ouvert ? 'Replier' : 'Afficher'}</button>
    </div>
    <div class="mer-barre" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><div style="width:${pct}%"></div></div>
    ${ouvert ? `<ul class="mer-liste">${etapes.filter(e => !e.ok || ui.filters.merFaites).map(e => `<li class="${e.ok ? 'fait' : ''}">
      <span class="mer-ic" aria-hidden="true">${e.ok ? '✓' : '•'}</span>
      <div class="mer-txt"><strong>${e.titre}</strong><span>${escapeHtml(e.detail)}</span></div>
      ${e.ok ? '' : `<button class="btn sm" onclick="${e.action || `go('${e.vue}')`}">${e.bouton}</button>`}
    </li>`).join('')}</ul>
    <button type="button" class="lien-discret" onclick="ui.filters.merFaites=${!ui.filters.merFaites}; renderView('dashboard')">${ui.filters.merFaites ? 'Masquer les étapes faites' : `Voir les ${faites} étape${faites > 1 ? 's' : ''} déjà faite${faites > 1 ? 's' : ''}`}</button>` : ''}
  </div>`;
}
/* =====================================================================
   PARENTS ↔ ÉLÈVES — relier chaque élève au compte de son parent, pour
   que notifications, annonces et messages arrivent à la bonne personne.
   ===================================================================== */
function comptesParents(){ return (DB.profiles || []).filter(p => p.role === 'parent'); }
function parentsDeLEleve(eleveId){
  return (DB.parentsEleves || []).filter(pe => pe.eleveId === eleveId)
    .map(pe => ({ lien: pe, profil: comptesParents().find(p => p.id === pe.parentProfileId) }));
}
// Suggestions : comptes parents dont le nom ressemble au parent noté sur la
// fiche, ou qui portent le nom de famille de l'élève.
function suggestionsParent(e){
  const mots = t => simplifierTexte(t).split(' ').filter(m => m.length >= 3);
  const cles = new Set(mots(e.parentNom).concat(mots(e.nom)));
  return comptesParents().map(p => ({ p, score: mots(p.nomComplet).filter(m => cles.has(m)).length }))
    .filter(x => x.score > 0).sort((a, b) => b.score - a.score).map(x => x.p);
}
// Numéros lisibles de la fiche (« 07 67 68 68 77 »), sans l'indicatif 225
function telsDeFiche(e){
  return String(e.parentTel || '').split(/\s*[\/;,|]\s*|\s+-\s+|\s+et\s+/i).map(t => t.replace(/\D/g, '').replace(/^225/, '')).filter(t => t.length === 10);
}
const telLisible = t => t.replace(/(\d{2})(?=\d)/g, '$1 ');
// Refonte (DESIGN.md §11) : une carte par élève, rien ne peut déborder sur la carte suivante
function renderLiensParents(){
  const eleves = DB.eleves.filter(e => e.statut === 'Actif').sort((a, b) => a.nom.localeCompare(b.nom));
  const sansParent = eleves.filter(e => !parentsDeLEleve(e.id).length);
  const parents = comptesParents().slice().sort((a, b) => (a.nomComplet||'').localeCompare(b.nomComplet||''));
  const optionsParents = sel => parents.map(p => `<option value="${p.id}" ${sel===p.id?'selected':''}>${escapeHtml(p.nomComplet || '—')}</option>`).join('');
  const etat = ui.filters.peEtat || 'tous';
  const carte = e => {
    const liens = parentsDeLEleve(e.id), relie = liens.length > 0;
    const sugg = suggestionsParent(e), tels = telsDeFiche(e);
    return `<article class="pe-carte" data-nom="${escapeHtml((eleveFullName(e) + ' ' + (e.parentNom || '')).toLowerCase())}" data-etat="${relie ? 'relie' : 'non'}">
      <header class="pe-tete">
        <span class="lc-avatar" aria-hidden="true">${escapeHtml(initials(e.prenom, e.nom))}</span>
        <span class="pe-id"><strong>${escapeHtml(eleveFullName(e))}</strong><span class="puce-classe">${escapeHtml(classeName(e.classeId))}</span></span>
        ${relie ? `<span class="badge-etat ok">${icone('check')}Compte relié</span>` : `<span class="badge-etat attente">${icone('clock')}Non relié</span>`}
      </header>
      <div class="pe-parent">
        <span class="pe-lib">Parent sur la fiche</span>
        <span class="pe-nom">${escapeHtml(e.parentNom || '—')}</span>
        ${tels.length ? `<span class="pe-tels">${tels.map(t => `<span class="puce-tel">${telLisible(t)}</span>`).join('')}</span>` : (e.parentTel ? `<span class="pe-tels"><span class="puce-tel invalide" title="Numéro incomplet ou illisible">${escapeHtml(e.parentTel)}</span></span>` : '')}
      </div>
      ${relie ? `<div class="pe-comptes"><span class="pe-lib">Compte(s) relié(s)</span>${liens.map(x => `<span class="puce-compte">${escapeHtml(x.profil?.nomComplet || 'parent')}<button type="button" class="puce-retirer" aria-label="Retirer le lien avec ${escapeHtml(x.profil?.nomComplet || 'ce parent')}" title="Retirer le lien" onclick="retirerAccesParentLiens('${x.lien.id}')">✕</button></span>`).join('')}</div>` : `
      <div class="pe-actions">
        <button type="button" class="btn sm" onclick="ouvrirInvitationParent('${e.id}')">Inviter</button>
        ${parents.length ? `<details class="pe-relier">
          <summary class="btn secondary sm">Relier à un compte</summary>
          <div class="pe-feuille">
            <input type="search" class="pe-cherche" placeholder="Rechercher un compte parent" aria-label="Rechercher un compte parent" oninput="filtrerOptionsParent(this, 'lienParent-${e.id}')">
            <select id="lienParent-${e.id}" size="${Math.min(6, Math.max(3, parents.length + (sugg.length ? 2 : 0)))}"><option value="">— Choisir un compte —</option>
              ${sugg.length ? `<optgroup label="Suggestions">${sugg.map(p => `<option value="${p.id}">${escapeHtml(p.nomComplet || '—')}</option>`).join('')}</optgroup><optgroup label="Tous les comptes">` : ''}${optionsParents(sugg[0]?.id)}${sugg.length ? '</optgroup>' : ''}</select>
            <button type="button" class="btn sm" onclick="relierParentEleve('${e.id}')">Relier</button>
          </div>
        </details>` : ''}
        <details class="pe-plus">
          <summary class="btn secondary sm" aria-label="Plus d’actions" title="Plus d’actions">⋯</summary>
          <div class="pe-menu"><button type="button" class="btn-reset" onclick="ouvrirCreerCompteParent('${e.id}')">Créer le compte par e-mail</button></div>
        </details>
      </div>`}
    </article>`;
  };
  return `<div class="view active">
    <div class="section-note">👪 Un élève relié au compte de son parent permet à ce parent de recevoir <strong>uniquement</strong> ce qui concerne son enfant : absences, annonces de son cycle, cours de renforcement, objets perdus et messages de l'école.</div>
    <div class="panel">
      <div class="panel-head"><div><h2>Élèves et parents</h2><div class="sub"><strong class="${sansParent.length ? 'pe-a-faire' : ''}">${sansParent.length ? `${sansParent.length} élève${sansParent.length > 1 ? 's' : ''} non relié${sansParent.length > 1 ? 's' : ''}` : 'Tous les élèves sont reliés 🎉'}</strong> · ${eleves.length - sansParent.length} / ${eleves.length} reliés · ${parents.length} compte${parents.length > 1 ? 's' : ''} parent${parents.length > 1 ? 's' : ''}</div></div></div>
      <div class="mer-barre" role="progressbar" aria-valuenow="${eleves.length ? Math.round(100 * (eleves.length - sansParent.length) / eleves.length) : 0}" aria-valuemin="0" aria-valuemax="100"><div style="width:${eleves.length ? Math.round(100 * (eleves.length - sansParent.length) / eleves.length) : 0}%"></div></div>
      <div class="scol-outils">
        <input type="search" class="scol-recherche pe-recherche" placeholder="Rechercher un élève ou un parent" aria-label="Rechercher un élève ou un parent" oninput="filtrerLiensParents()">
        <div class="segmente" role="group" aria-label="Filtrer les élèves">${[['tous','Tous'],['non','Non reliés'],['relie','Reliés']].map(([k, l]) => `<button type="button" class="seg${etat === k ? ' actif' : ''}" data-etat="${k}" onclick="ui.filters.peEtat='${k}'; filtrerLiensParents()">${l}</button>`).join('')}</div>
      </div>
      ${eleves.length ? `<div class="pe-grille">${eleves.map(carte).join('')}</div>` : '<div class="hint">Aucun élève actif.</div>'}
      <div class="etat-vide pe-aucun" hidden><span class="etat-vide-ic" aria-hidden="true">${icone('search')}</span><span>Aucun élève pour ce filtre. <button type="button" class="lien-discret" onclick="ui.filters.peEtat='tous'; const r=document.querySelector('.pe-recherche'); if(r) r.value=''; filtrerLiensParents()">Effacer les filtres</button></span></div>
      ${(setTimeout(filtrerLiensParents, 0), '')}
    </div>

    <div class="panel">
      <div class="panel-head"><div><h2>Inviter les parents</h2><div class="sub">À glisser dans le cahier de liaison ou à afficher à l’entrée</div></div></div>
      <div class="pe-invit">
        <button class="btn" onclick="ouvrirCouponsInvitation(true)">🖨️ Coupons (élèves non reliés)</button>
        <button class="btn secondary" onclick="ouvrirCouponsInvitation(false)">Coupons pour tous</button>
        <button class="btn secondary" onclick="imprimerAffiche('parent.html')">🖨️ Affiche A4</button>
      </div>
      <div class="groupe-wa">
        <div class="groupe-wa-tete"><span class="etat-vide-ic" aria-hidden="true">${icone('send')}</span><div><strong>Le plus rapide : le groupe WhatsApp de la classe</strong><span>Un message prêt à coller, avec le lien et 3 étapes simples.</span></div></div>
        <div class="groupe-wa-choix">
          <select id="groupeWaClasse" class="puce-select petit" aria-label="Classe">${DB.classes.map(c => { const n = eleves.filter(e => e.classeId === c.id && !parentsDeLEleve(e.id).length).length; return `<option value="${c.id}">${escapeHtml(c.nom)}${n ? ` — ${n} non relié${n > 1 ? 's' : ''}` : ' — tous reliés'}</option>`; }).join('')}</select>
          <button type="button" class="btn" onclick="ouvrirMessageGroupeClasse(document.getElementById('groupeWaClasse').value)">Préparer le message</button>
        </div>
      </div>
    </div>

    <div class="panel">
      <div class="panel-head"><div><h2>Comptes parents et leurs enfants</h2><div class="sub">Un parent peut avoir plusieurs enfants dans l'école</div></div></div>
      ${!parents.length ? `<div class="etat-vide"><span class="etat-vide-ic" aria-hidden="true">${icone('users')}</span><span>Aucun compte parent pour l’instant. Invitez les parents : leurs demandes arrivent dans Paramètres → Demandes d’accès.</span></div>` : `<div class="pe-grille">${parents.map(p => {
          const liens = (DB.parentsEleves || []).filter(pe => pe.parentProfileId === p.id);
          const dejaRelies = new Set(liens.map(l => l.eleveId));
          return `<article class="pe-carte">
            <header class="pe-tete"><span class="lc-avatar" aria-hidden="true">${escapeHtml(initials(...String(p.nomComplet || '? ?').split(' ')))}</span><span class="pe-id"><strong>${escapeHtml(p.nomComplet || '—')}</strong><small>${liens.length} enfant${liens.length > 1 ? 's' : ''} relié${liens.length > 1 ? 's' : ''}</small></span></header>
            <div class="pe-comptes">${liens.map(l => { const e = eleveById(l.eleveId); return `<span class="puce-compte">${escapeHtml(e ? eleveFullName(e) : '—')}<button type="button" class="puce-retirer" aria-label="Retirer le lien" title="Retirer le lien" onclick="retirerAccesParentLiens('${l.id}')">✕</button></span>`; }).join('') || '<span class="hint">Aucun enfant relié</span>'}</div>
            <div class="pe-ajout"><select id="ajoutEnfant-${p.id}" aria-label="Élève à ajouter"><option value="">— Ajouter un enfant —</option>${eleves.filter(e => !dejaRelies.has(e.id)).map(e => `<option value="${e.id}">${escapeHtml(eleveFullName(e))} (${escapeHtml(classeName(e.classeId))})</option>`).join('')}</select>
              <button type="button" class="btn secondary sm" onclick="relierEnfantAuParent('${p.id}')">Ajouter</button></div>
          </article>`;
        }).join('')}</div>`}
    </div>
  </div>`;
}
// Message pour le groupe WhatsApp des parents d'une classe (gratuit ; rien n'est
// envoyé automatiquement : l'école relit, puis colle ou partage elle-même)
function messageGroupeClasse(classeId){
  const nomEcole = DB.meta?.nomEcole || 'L’école';
  return `Chers parents de la classe ${classeName(classeId)},\n\n`
    + `${nomEcole} utilise l’application EcoMaZ. Sur votre téléphone, vous recevrez les absences et retards de votre enfant, ses devoirs, les annonces de l’école et le menu de la cantine.\n\n`
    + `1. Ouvrez ce lien : ${lienApplication('parent.html')}\n`
    + `2. Touchez « Continuer avec Google »\n`
    + `3. Écrivez votre numéro et le nom de votre enfant : l’école valide votre accès.\n\n`
    + `C’est gratuit. Merci de votre confiance !`;
}
function ouvrirMessageGroupeClasse(classeId){
  if(!classeId) return;
  openModal(`Message pour le groupe WhatsApp — ${classeName(classeId)}`, `
    <p class="hint" style="margin-top:0;">Relisez ou modifiez le message, puis partagez-le dans le groupe WhatsApp des parents de la classe.</p>
    <div class="field"><label for="msgGroupeClasse">Message</label><textarea id="msgGroupeClasse" rows="11">${escapeHtml(messageGroupeClasse(classeId))}</textarea></div>
    <div class="form-actions">
      <button type="button" class="btn secondary" onclick="copierMessageGroupe()">Copier</button>
      <button type="button" class="btn" onclick="window.open('https://wa.me/?text=' + encodeURIComponent(document.getElementById('msgGroupeClasse').value), '_blank', 'noopener')">Partager sur WhatsApp</button>
    </div>`);
}
function copierMessageGroupe(){
  const t = document.getElementById('msgGroupeClasse')?.value || '';
  (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(() => toast('Message copié : collez-le dans le groupe'), () => window.prompt('Copiez ce message :', t));
}
// Feuille « Inviter » : choix du numéro, envoi par WhatsApp (gratuit)
function ouvrirInvitationParent(eleveId){
  const e = eleveById(eleveId); if(!e) return;
  const tels = telsDeFiche(e);
  const texte = encodeURIComponent(messagePartageApplication('parent.html'));
  openModal(`Inviter le parent de ${eleveFullName(e)}`, `
    <p class="hint" style="margin-top:0;">Le parent reçoit le lien de l’application par WhatsApp, se connecte avec Google, puis vous validez sa demande (Paramètres → Demandes d’accès).</p>
    ${tels.length ? `<div class="pe-invit-liste">${tels.map(t => `<a class="btn" href="https://wa.me/225${t}?text=${texte}" target="_blank" rel="noopener">📲 WhatsApp · ${telLisible(t)}</a>`).join('')}</div>`
      : `<div class="etat-vide"><span class="etat-vide-ic" aria-hidden="true">${icone('triangle-alert')}</span><span>Aucun numéro valide sur la fiche${e.parentTel ? ` (« ${escapeHtml(e.parentTel)} »)` : ''}. Corrigez le numéro dans la fiche de l’élève, ou imprimez un coupon d’invitation.</span></div>`}
    <div class="form-actions"><button type="button" class="btn secondary" onclick="closeModal()">Fermer</button><button type="button" class="btn secondary" onclick="closeModal(); ouvrirCreerCompteParent('${e.id}')">Créer par e-mail</button></div>`);
}
function filtrerOptionsParent(champ, idSelect){
  const t = simplifierTexte(champ.value || ''), sel = document.getElementById(idSelect); if(!sel) return;
  sel.querySelectorAll('option').forEach(o => { if(o.value) o.hidden = !!t && !simplifierTexte(o.textContent).includes(t); });
}
function filtrerLiensParents(){
  const etat = ui.filters.peEtat || 'tous';
  const texte = simplifierTexte(document.querySelector('.pe-recherche')?.value || '');
  let visibles = 0;
  document.querySelectorAll('.pe-carte[data-etat]').forEach(el => {
    const ok = (etat === 'tous' || el.dataset.etat === etat) && (!texte || simplifierTexte(el.dataset.nom || '').includes(texte));
    el.hidden = !ok; if(ok) visibles++;
  });
  document.querySelectorAll('.segmente .seg').forEach(b => b.classList.toggle('actif', b.dataset.etat === etat));
  const vide = document.querySelector('.pe-aucun'); if(vide) vide.hidden = visibles > 0 || !document.querySelector('.pe-carte[data-etat]');
}
// Coupons à imprimer et glisser dans le cahier de liaison : nom de l'élève,
// QR code de l'application des parents, étapes d'installation.
function ouvrirCouponsInvitation(seulementSansParent){
  const eleves = DB.eleves.filter(e => e.statut === 'Actif' && (!seulementSansParent || !parentsDeLEleve(e.id).length))
    .sort((a, b) => classeName(a.classeId).localeCompare(classeName(b.classeId)) || a.nom.localeCompare(b.nom));
  if(!eleves.length) return toast('Tous les élèves ont déjà un parent relié 🎉');
  const lien = lienApplication('parent.html');
  let qr = '';
  try{ const q = qrcode(0, 'M'); q.addData(lien); q.make(); qr = q.createSvgTag({ cellSize: 3, margin: 1, scalable: true }); }catch(_e){}
  const nomApp = `EcoMaZ-PARENTS D'ELEVES ${DB.meta.nomEcole}`;
  openModal(`Coupons d’invitation (${eleves.length})`, `
    <div class="form-actions no-print" style="margin-top:0;"><button type="button" class="btn secondary" onclick="closeModal()">Fermer</button><button type="button" class="btn" onclick="window.print()">🖨️ Imprimer</button></div>
    <div class="coupons">${eleves.map(e => `
      <div class="coupon">
        <div class="coupon-qr">${qr}</div>
        <div class="coupon-texte">
          <div class="coupon-titre">Parents de <strong>${escapeHtml(eleveFullName(e))}</strong> — ${escapeHtml(classeName(e.classeId))}</div>
          <div class="coupon-app">${escapeHtml(nomApp)}</div>
          <ol>
            <li>Scannez le QR code avec l’appareil photo du téléphone (ou ouvrez le lien ci-dessous).</li>
            <li>Touchez « Installer l’application », puis « Continuer avec Google ».</li>
            <li>Dans votre demande, écrivez le nom de votre enfant : l’école valide votre accès.</li>
          </ol>
          <div class="coupon-lien">${escapeHtml(lien)}</div>
        </div>
      </div>`).join('')}
    </div>`);
}
async function creerLienParentEleve(parentId, eleveId){
  const { data, error } = await sb.from('parents_eleves').insert({ parent_profile_id: parentId, eleve_id: eleveId, ecole_id: session.ecoleId }).select().single();
  if(error) throw error;
  DB.parentsEleves = (DB.parentsEleves || []).concat(rowToCamel(data));
}
async function relierParentEleve(eleveId){
  const parentId = document.getElementById('lienParent-' + eleveId)?.value;
  if(!parentId) return alert('Choisissez d’abord le compte du parent.');
  try{ await creerLienParentEleve(parentId, eleveId); toast('Élève relié à son parent'); renderView('liens-parents'); }
  catch(e){ alert('Erreur : ' + e.message); }
}
async function relierEnfantAuParent(parentId){
  const eleveId = document.getElementById('ajoutEnfant-' + parentId)?.value;
  if(!eleveId) return alert('Choisissez d’abord l’élève.');
  try{ await creerLienParentEleve(parentId, eleveId); toast('Enfant ajouté à ce parent'); renderView('liens-parents'); }
  catch(e){ alert('Erreur : ' + e.message); }
}
async function retirerAccesParentLiens(peId){
  if(!confirm("Retirer le lien entre ce parent et cet élève ? Le parent ne verra plus rien de cet enfant.")) return;
  try{
    const { error } = await exigerEffet(sb.from('parents_eleves').delete().eq('id', peId));
    if(error) throw error;
    DB.parentsEleves = (DB.parentsEleves || []).filter(pe => pe.id !== peId);
    toast('Lien retiré'); renderView('liens-parents');
  }catch(e){ alert('Erreur : ' + e.message); }
}

/* =====================================================================
   COURS DE RENFORCEMENT — inscriptions, jours et heure, parents prévenus
   (annonces automatiques : fonction annoncer-horaires, sections 50 et 51).
   ===================================================================== */
function renderRenforcement(){
  const h = DB.horairesAnnonces || {};
  const inscrits = DB.eleves.filter(e => e.statut === 'Actif' && e.renforcement).sort((a, b) => a.nom.localeCompare(b.nom));
  const jours = h.joursRenforcement || [1,2,3,4,5];
  const debut = (h.apresmidiFinPrimaire || '16:00').slice(0, 5), fin = (h.renforcementFin || '17:00').slice(0, 5);
  const classes = classesVisibles ? classesVisibles() : DB.classes;
  const f = ui.filters.renforcement = ui.filters.renforcement || { classeId: classes[0]?.id || '' };
  if(!classes.some(c => c.id === f.classeId)) f.classeId = classes[0]?.id || '';
  const elevesClasse = DB.eleves.filter(e => e.classeId === f.classeId && e.statut === 'Actif').sort((a, b) => a.nom.localeCompare(b.nom));
  const sansParent = inscrits.filter(e => !parentsDeLEleve(e.id).length);
  return `<div class="view active">
    <div class="cards">
      <div class="card"><div class="num">${inscrits.length}</div><div class="label">Élèves inscrits</div></div>
      <div class="card"><div class="num">${debut.replace(':','h')} → ${fin.replace(':','h')}</div><div class="label">Horaire (après la fin des cours)</div></div>
      <div class="card"><div class="num">${jours.length} j</div><div class="label">${JOURS_COMPLETS.filter((_, i) => jours.includes(i+1)).map(j => j.slice(0,3)).join(', ') || 'aucun jour'}</div></div>
      <div class="card"><div class="num">${inscrits.length - sansParent.length} / ${inscrits.length}</div><div class="label">Parents reliés (prévenus)</div></div>
    </div>

    <div class="panel">
      <div class="panel-head"><div><h2>📘 Inscrire des élèves</h2><div class="sub">Cochez les élèves de la classe qui suivent le renforcement, puis enregistrez</div></div></div>
      <div class="filters"><select onchange="ui.filters.renforcement.classeId=this.value; renderView('renforcement')">${classes.map(c => `<option value="${c.id}" ${c.id===f.classeId?'selected':''}>${escapeHtml(c.nom)}</option>`).join('')}</select></div>
      ${!elevesClasse.length ? '<div class="hint">Aucun élève actif dans cette classe.</div>' : `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:8px;">
        ${elevesClasse.map(e => `<label style="display:flex;align-items:center;gap:8px;padding:8px 10px;border:1px solid var(--border);border-radius:var(--r-card);"><input type="checkbox" class="case-renf" value="${e.id}" ${e.renforcement?'checked':''}> ${escapeHtml(eleveFullName(e))}</label>`).join('')}
      </div>
      <div class="form-actions"><button class="btn" onclick="enregistrerRenforcementClasse()">Enregistrer pour ${escapeHtml(classeName(f.classeId))}</button></div>`}
    </div>

    <div class="panel">
      <div class="panel-head"><div><h2>Élèves inscrits (${inscrits.length})</h2><div class="sub">Leurs parents sont prévenus automatiquement : « votre enfant est retenu », puis la fin du renforcement</div></div></div>
      ${!inscrits.length ? '<div class="hint">Aucun élève inscrit pour l’instant.</div>' : `<div class="table-wrap"><table>
        <thead><tr><th>Élève</th><th>Classe</th><th>Parent relié</th><th></th></tr></thead>
        <tbody>${inscrits.map(e => { const ps = parentsDeLEleve(e.id); return `<tr>
          <td>${escapeHtml(eleveFullName(e))}</td><td>${escapeHtml(classeName(e.classeId))}</td>
          <td>${ps.length ? ps.map(x => `<span class="badge green">${escapeHtml(x.profil?.nomComplet || 'parent')}</span>`).join(' ') : `<span class="badge amber">aucun — ne sera pas prévenu</span> <button class="btn secondary sm" onclick="go('liens-parents')">Relier</button>`}</td>
          <td><button class="btn secondary sm" onclick="retirerDuRenforcement('${e.id}')">Retirer</button></td>
        </tr>`; }).join('')}</tbody></table></div>`}
    </div>

    <div class="grid-2">
      <div class="panel">
        <div class="panel-head"><div><h2>⏰ Jours et heure</h2></div></div>
        <form onsubmit="return enregistrerReglagesRenforcement(event)">
          <div class="field"><label>Fin du renforcement (il commence à la fin des cours, ${debut.replace(':','h')})</label><input type="time" name="renforcementFin" value="${fin}"></div>
          <div class="field"><label>Jours du renforcement</label>
            <div style="display:flex;flex-wrap:wrap;gap:10px;">${JOURS_COMPLETS.slice(0,6).map((j, i) => `<label style="display:flex;align-items:center;gap:6px;font-weight:600;"><input type="checkbox" name="jourRenf" value="${i+1}" ${jours.includes(i+1)?'checked':''}> ${j}</label>`).join('')}</div>
            <div class="hint" style="margin:4px 0 0;">Les autres jours, les parents des inscrits reçoivent l’annonce normale de fin des cours.</div></div>
          <div class="form-actions"><button class="btn" type="submit">Enregistrer</button></div>
        </form>
      </div>
      <div class="panel">
        <div class="panel-head"><div><h2>✉️ Message aux parents des inscrits</h2><div class="sub">Arrive uniquement chez les parents des élèves du renforcement</div></div></div>
        <form onsubmit="return envoyerMessageRenforcement(event)">
          <div class="field"><textarea name="contenu" rows="4" required maxlength="1000" placeholder="Ex : Le cours de renforcement de vendredi est annulé."></textarea></div>
          ${sansParent.length ? `<div class="hint">⚠️ ${sansParent.length} élève(s) inscrit(s) n’ont pas de parent relié : leur parent ne recevra pas ce message.</div>` : ''}
          <div class="form-actions"><button class="btn" type="submit" ${inscrits.length ? '' : 'disabled'}>Envoyer à ${inscrits.length - sansParent.length} famille(s)</button></div>
        </form>
      </div>
    </div>
  </div>`;
}
async function majRenforcement(ids, valeur){
  if(!ids.length) return;
  const { error } = await sb.from('eleves').update({ renforcement: valeur }).in('id', ids).eq('ecole_id', session.ecoleId);
  if(error) throw error;
  DB.eleves.forEach(e => { if(ids.includes(e.id)) e.renforcement = valeur; });
}
async function enregistrerRenforcementClasse(){
  const cases = $$('.case-renf');
  try{
    await majRenforcement(cases.filter(c => c.checked).map(c => c.value), true);
    await majRenforcement(cases.filter(c => !c.checked).map(c => c.value), false);
    toast('Inscriptions au renforcement enregistrées'); renderView('renforcement');
  }catch(e){ alert('Erreur : ' + e.message); }
}
async function retirerDuRenforcement(id){
  try{ await majRenforcement([id], false); toast('Élève retiré du renforcement'); renderView('renforcement'); }
  catch(e){ alert('Erreur : ' + e.message); }
}
async function enregistrerReglagesRenforcement(ev){
  ev.preventDefault();
  const fd = new FormData(ev.target);
  const jours = fd.getAll('jourRenf').map(Number).sort();
  try{
    const { data, error } = await sb.from('horaires_annonces').upsert({ ecole_id: session.ecoleId, renforcement_fin: fd.get('renforcementFin') || '17:00', jours_renforcement: jours }, { onConflict: 'ecole_id' }).select().single();
    if(error) throw error;
    DB.horairesAnnonces = rowToCamel(data);
    toast('Réglages du renforcement enregistrés'); renderView('renforcement');
  }catch(e){ alert('Erreur : ' + e.message); }
  return false;
}
async function envoyerMessageRenforcement(ev){
  ev.preventDefault();
  const contenu = new FormData(ev.target).get('contenu').trim();
  const cibles = DB.eleves.filter(e => e.statut === 'Actif' && e.renforcement && parentsDeLEleve(e.id).length);
  if(!cibles.length) return alert('Aucun élève inscrit n’a de parent relié.'), false;
  if(!confirm(`Envoyer ce message aux parents de ${cibles.length} élève(s) du renforcement ?`)) return false;
  try{
    const lignes = cibles.map(e => ({ destinataire_type: 'parent', eleve_id: e.id, contenu: '📘 Renforcement — ' + contenu, auteur_nom: session.nomComplet || '' }));
    const { data, error } = await sb.from('messages_internes').insert(lignes).select();
    if(error) throw error;
    DB.messagesInternes = rowsToCamel(data).concat(DB.messagesInternes || []);
    notifierParentsPush(cibles.map(e => e.id), '📘 Renforcement — ' + contenu);
    ev.target.reset();
    toast(`Message envoyé à ${cibles.length} famille(s)`);
  }catch(e){ alert('Erreur : ' + e.message); }
  return false;
}
/* =====================================================================
   VIE DE L'ÉCOLE (schema.sql section 54) — fil de publications avec
   photos et vidéos des événements, J'aime / Bravo et commentaires.
   Les fichiers sont dans un stockage PRIVÉ : on les affiche avec des
   liens temporaires (1 h) réservés aux comptes de l'école.
   ===================================================================== */
const FIL_PAGE = 8;
const VIDEO_MAX_OCTETS = 25 * 1024 * 1024;
function estGestionnaireFil(){ return ['secretariat','direction','fondation'].includes(ui.role); }
function nouveauFil(){ return { pubs: [], medias: {}, urls: {}, reactions: {}, commentaires: {}, fin: false, charge: false, ouverts: {} }; }
async function chargerFil(suite){
  if(!DB.fil || !suite) DB.fil = nouveauFil();
  const f = DB.fil;
  const { data: pubs, error } = await sb.from('publications').select('*').eq('ecole_id', session.ecoleId)
    .order('created_at', { ascending: false }).range(f.pubs.length, f.pubs.length + FIL_PAGE - 1);
  if(error) throw error;
  const nouvelles = rowsToCamel(pubs);
  f.fin = nouvelles.length < FIL_PAGE;
  f.charge = true;
  if(!nouvelles.length) return;
  const ids = nouvelles.map(p => p.id);
  const [medias, reactions, commentaires] = await Promise.all([
    sb.from('publication_medias').select('*').in('publication_id', ids).order('ordre'),
    sb.from('publication_reactions').select('publication_id, user_id, type').in('publication_id', ids),
    sb.from('publication_commentaires').select('*').in('publication_id', ids).order('created_at'),
  ]);
  rowsToCamel(medias.data || []).forEach(m => (f.medias[m.publicationId] = f.medias[m.publicationId] || []).push(m));
  rowsToCamel(reactions.data || []).forEach(r => (f.reactions[r.publicationId] = f.reactions[r.publicationId] || []).push(r));
  rowsToCamel(commentaires.data || []).forEach(c => (f.commentaires[c.publicationId] = f.commentaires[c.publicationId] || []).push(c));
  const chemins = rowsToCamel(medias.data || []).filter(m => m.type !== 'youtube').map(m => m.chemin);
  if(chemins.length){
    const { data: liens } = await sb.storage.from('publications').createSignedUrls(chemins, 3600);
    (liens || []).forEach(l => { if(l.signedUrl) f.urls[l.path] = l.signedUrl; });
  }
  f.pubs = f.pubs.concat(nouvelles);
}
function urlMedia(m){ return m.type === 'youtube' ? `https://img.youtube.com/vi/${encodeURIComponent(m.chemin)}/hqdefault.jpg` : (DB.fil.urls[m.chemin] || ''); }
function renderMediasPublication(p){
  const medias = DB.fil.medias[p.id] || [];
  if(!medias.length) return '';
  const visibles = medias.slice(0, 4), reste = medias.length - 4;
  return `<div class="fil-medias fil-medias-${Math.min(medias.length, 4)}">${visibles.map((m, i) => `
    <button type="button" class="fil-media" onclick="ouvrirVisionneuse('${p.id}', ${i})" aria-label="Agrandir">
      ${m.type === 'photo' ? `<img src="${escapeHtml(urlMedia(m))}" alt="" loading="lazy">`
        : m.type === 'youtube' ? `<img src="${escapeHtml(urlMedia(m))}" alt="" loading="lazy"><span class="fil-play" aria-hidden="true">▶</span>`
        : `<video src="${escapeHtml(urlMedia(m))}#t=0.5" preload="metadata" muted playsinline></video><span class="fil-play" aria-hidden="true">▶</span>`}
      ${i === 3 && reste > 0 ? `<span class="fil-plus">+${reste}</span>` : ''}
    </button>`).join('')}</div>`;
}
function renderCommentaires(p){
  const coms = DB.fil.commentaires[p.id] || [];
  return `<div class="fil-commentaires">
    ${coms.map(c => `<div class="fil-com"><strong>${escapeHtml(c.auteurNom || 'Parent')}</strong> ${escapeHtml(c.texte)}
      <span class="fil-com-date">${new Date(c.createdAt).toLocaleDateString('fr-FR', {day:'numeric', month:'short'})}</span>
      ${(c.userId === session.userId || estGestionnaireFil()) ? `<button type="button" class="fil-com-suppr" onclick="supprimerCommentaire('${p.id}','${c.id}')" aria-label="Supprimer">✕</button>` : ''}</div>`).join('')}
    <form class="fil-com-form" onsubmit="return envoyerCommentaire(event, '${p.id}')">
      <input name="texte" maxlength="500" required placeholder="Écrire un commentaire…" autocomplete="off">
      <button class="btn sm" type="submit">Publier</button>
    </form>
  </div>`;
}
function renderPublication(p){
  const f = DB.fil;
  const reacs = f.reactions[p.id] || [];
  const nb = t => reacs.filter(r => r.type === t).length;
  const moi = t => reacs.some(r => r.type === t && r.userId === session.userId);
  const coms = (f.commentaires[p.id] || []).length;
  const cible = p.classeIds && p.classeIds.length ? p.classeIds.map(classeName).join(', ') : 'Toute l’école';
  return `<article class="fil-carte" id="pub-${p.id}">
    <header class="fil-tete">
      <div class="fil-avatar" aria-hidden="true">${DB.meta?.logo ? `<img src="${escapeHtml(DB.meta.logo)}" alt="">` : 'E'}</div>
      <div class="fil-qui"><strong>${escapeHtml(DB.meta?.nomEcole || 'École')}</strong>
        <span>${new Date(p.createdAt).toLocaleDateString('fr-FR', {day:'numeric', month:'long'})}${p.dateEvenement ? ' · événement du ' + fmtDate(p.dateEvenement) : ''} · ${escapeHtml(cible)}</span></div>
      ${estGestionnaireFil() ? menuPlus([{ label: 'Supprimer la publication', danger: true, onclick: `supprimerPublication('${p.id}')` }]) : ''}
    </header>
    <h3 class="fil-titre">${escapeHtml(p.titre)}</h3>
    ${p.texte ? `<p class="fil-texte">${escapeHtml(p.texte)}</p>` : ''}
    ${renderMediasPublication(p)}
    <div class="fil-actions">
      <button type="button" class="fil-btn ${moi('coeur') ? 'actif' : ''}" onclick="basculerReaction('${p.id}','coeur')" aria-pressed="${moi('coeur')}">❤️ <span>${nb('coeur') || ''}</span> J’aime</button>
      <button type="button" class="fil-btn ${moi('bravo') ? 'actif' : ''}" onclick="basculerReaction('${p.id}','bravo')" aria-pressed="${moi('bravo')}">👏 <span>${nb('bravo') || ''}</span> Bravo</button>
      <button type="button" class="fil-btn" onclick="basculerCommentaires('${p.id}')">💬 ${coms || ''} Commenter</button>
    </div>
    ${f.ouverts[p.id] ? renderCommentaires(p) : ''}
  </article>`;
}
function renderFilContenu(){
  const f = DB.fil;
  if(!f || !f.charge) return '<div class="hint">Chargement des publications…</div>';
  if(!f.pubs.length) return `<div class="empty-state"><div class="em-ic">📷</div>Aucune publication pour l’instant.${estGestionnaireFil() ? ' Publiez le premier événement ci-dessus.' : ' Les photos et vidéos des événements de l’école apparaîtront ici.'}</div>`;
  return f.pubs.map(renderPublication).join('') + (f.fin ? '' : `<div class="form-actions" style="justify-content:center;"><button class="btn secondary" onclick="chargerFil(true).then(rafraichirFil)">Voir plus de publications</button></div>`);
}
function rafraichirFil(){ const z = document.getElementById('filContenu'); if(z) z.innerHTML = renderFilContenu(); }
function rafraichirPublication(id){
  const el = document.getElementById('pub-' + id), p = (DB.fil?.pubs || []).find(x => x.id === id);
  if(el && p) el.outerHTML = renderPublication(p);
}
function demarrerFil(){
  if(DB.fil && DB.fil.charge) return;
  chargerFil(false).then(rafraichirFil).catch(e => { const z = document.getElementById('filContenu'); if(z) z.innerHTML = `<div class="hint">Erreur : ${escapeHtml(e.message)}</div>`; });
}
async function basculerReaction(pubId, type){
  const f = DB.fil, liste = f.reactions[pubId] = f.reactions[pubId] || [];
  const deja = liste.find(r => r.type === type && r.userId === session.userId);
  try{
    if(deja){
      const { error } = await sb.from('publication_reactions').delete().eq('publication_id', pubId).eq('user_id', session.userId).eq('type', type);
      if(error) throw error;
      f.reactions[pubId] = liste.filter(r => r !== deja);
    } else {
      const { error } = await sb.from('publication_reactions').insert({ publication_id: pubId, type });
      if(error) throw error;
      liste.push({ publicationId: pubId, userId: session.userId, type });
      if(navigator.vibrate) try{ navigator.vibrate(15); }catch(_e){}
    }
    rafraichirPublication(pubId);
  }catch(e){ toast('Erreur : ' + e.message); }
}
function basculerCommentaires(pubId){ DB.fil.ouverts[pubId] = !DB.fil.ouverts[pubId]; rafraichirPublication(pubId); }
async function envoyerCommentaire(ev, pubId){
  ev.preventDefault();
  const champ = ev.target.querySelector('input'), texte = champ.value.trim();
  if(!texte) return false;
  try{
    const { data, error } = await sb.from('publication_commentaires').insert({ publication_id: pubId, texte, auteur_nom: session.nomComplet || '' }).select().single();
    if(error) throw error;
    (DB.fil.commentaires[pubId] = DB.fil.commentaires[pubId] || []).push(rowToCamel(data));
    rafraichirPublication(pubId);
  }catch(e){ toast('Erreur : ' + e.message); }
  return false;
}
async function supprimerCommentaire(pubId, comId){
  if(!confirm('Supprimer ce commentaire ?')) return;
  try{
    const { error } = await exigerEffet(sb.from('publication_commentaires').delete().eq('id', comId));
    if(error) throw error;
    DB.fil.commentaires[pubId] = (DB.fil.commentaires[pubId] || []).filter(c => c.id !== comId);
    rafraichirPublication(pubId);
  }catch(e){ toast('Erreur : ' + e.message); }
}
// --- Visionneuse plein écran (photos, vidéos, YouTube), glisser pour changer ---
let visionneuse = null;
function ouvrirVisionneuse(pubId, index){
  visionneuse = { medias: DB.fil.medias[pubId] || [], index };
  let el = document.getElementById('visionneuse');
  if(!el){ el = document.createElement('div'); el.id = 'visionneuse'; el.className = 'visionneuse'; document.body.appendChild(el);
    let x0 = null;
    el.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; }, { passive: true });
    el.addEventListener('touchend', e => { if(x0 === null) return; const dx = e.changedTouches[0].clientX - x0; if(Math.abs(dx) > 50) changerMedia(dx < 0 ? 1 : -1); x0 = null; });
    document.addEventListener('keydown', e => { if(!visionneuse) return; if(e.key === 'Escape') fermerVisionneuse(); if(e.key === 'ArrowRight') changerMedia(1); if(e.key === 'ArrowLeft') changerMedia(-1); });
  }
  afficherVisionneuse();
}
function afficherVisionneuse(){
  const el = document.getElementById('visionneuse'), { medias, index } = visionneuse, m = medias[index];
  el.innerHTML = `
    <button type="button" class="vis-fermer" onclick="fermerVisionneuse()" aria-label="Fermer">✕</button>
    <div class="vis-scene">${m.type === 'photo' ? `<img src="${escapeHtml(urlMedia(m))}" alt="">`
      : m.type === 'youtube' ? `<iframe src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(m.chemin)}?autoplay=1&rel=0" allow="autoplay; encrypted-media; fullscreen" allowfullscreen title="Vidéo"></iframe>`
      : `<video src="${escapeHtml(urlMedia(m))}" controls autoplay playsinline></video>`}</div>
    ${medias.length > 1 ? `<button type="button" class="vis-nav vis-prec" onclick="changerMedia(-1)" aria-label="Précédent">‹</button>
      <button type="button" class="vis-nav vis-suiv" onclick="changerMedia(1)" aria-label="Suivant">›</button>
      <div class="vis-compteur">${index + 1} / ${medias.length}</div>` : ''}`;
  el.classList.add('ouverte');
}
function changerMedia(sens){ if(!visionneuse) return; const n = visionneuse.medias.length; visionneuse.index = (visionneuse.index + sens + n) % n; afficherVisionneuse(); }
function fermerVisionneuse(){ const el = document.getElementById('visionneuse'); if(el){ el.classList.remove('ouverte'); el.innerHTML = ''; } visionneuse = null; }

// --- Console parent : onglet « Vie de l'école » ---
function renderFilParent(){
  return `<div class="view active parent-accueil">
    <h2 class="parent-greeting" style="margin-bottom:var(--sp-3);">📸 Vie de l’école</h2>
    <div id="filContenu">${renderFilContenu()}</div>
  </div>`;
}
// --- Application école : page « Vie de l'école » (publier + gérer) ---
function renderVieEcole(){
  setTimeout(demarrerFil, 0);
  const classes = DB.classes || [];
  return `<div class="view active">
    ${estGestionnaireFil() ? `<div class="panel">
      <div class="panel-head"><div><h2>Publier un événement</h2><div class="sub">Visible uniquement par les parents et le personnel de l’école</div></div></div>
      <form onsubmit="return publierEvenement(event)" class="form-sections">
        <fieldset class="form-section"><legend><span class="fs-num">1</span>Titre et date</legend>
          <div class="form-grid">
            <div class="field"><label for="pubTitre">Titre</label><input id="pubTitre" name="titre" required minlength="2" maxlength="150" placeholder="Ex : Fête de fin d’année"></div>
            <div class="field"><label for="pubDate">Date de l’événement</label><input id="pubDate" type="date" name="dateEvenement" value="${todayISO()}"></div>
          </div></fieldset>
        <fieldset class="form-section"><legend><span class="fs-num">2</span>Texte</legend>
          <div class="field"><label for="pubTexte">Racontez l’événement (facultatif)</label><textarea id="pubTexte" name="texte" rows="3" maxlength="3000" placeholder="Ce qui s’est passé, ce dont les parents doivent se souvenir…"></textarea></div></fieldset>
        <fieldset class="form-section"><legend><span class="fs-num">3</span>Photos et vidéos</legend>
          <label class="zone-envoi">
            <input type="file" name="fichiers" accept="image/*,video/mp4,video/quicktime,video/webm" multiple onchange="const n=this.files.length; this.closest('.zone-envoi').querySelector('.ze-etat').textContent = n ? n + (n > 1 ? ' fichiers choisis' : ' fichier choisi') : 'Aucun fichier choisi'; this.closest('.zone-envoi').classList.toggle('rempli', n > 0)">
            <span class="ze-ic" aria-hidden="true">${icone('camera')}</span>
            <span class="ze-txt"><strong>Ajouter des photos ou des vidéos</strong><small>Touchez ici pour choisir dans la galerie</small></span>
            <span class="ze-etat">Aucun fichier choisi</span>
          </label>
          <div class="hint" style="margin:6px 0 0;">Les photos sont allégées automatiquement. Vidéos : 25 Mo maximum (environ 1 minute) ; pour une vidéo plus longue, mettez-la sur YouTube en « non répertoriée » et collez le lien ci-dessous.</div>
          <div class="field" style="margin-top:12px;"><label for="pubYoutube">Lien YouTube (facultatif)</label><input id="pubYoutube" name="youtube" placeholder="https://youtu.be/…"></div></fieldset>
        <fieldset class="form-section"><legend><span class="fs-num">4</span>Qui peut voir ?</legend>
          <div class="segmente seg-radio" role="radiogroup" aria-label="Qui peut voir ?">
            <label class="seg"><input type="radio" name="cible" value="tous" checked onchange="document.getElementById('choixClassesPub').style.display='none'">Toute l’école</label>
            <label class="seg"><input type="radio" name="cible" value="classes" onchange="document.getElementById('choixClassesPub').style.display='flex'">Certaines classes</label>
          </div>
          <div id="choixClassesPub" class="choix-classes" style="display:none;">${classes.map(c => `<label class="puce-case"><input type="checkbox" name="classe" value="${c.id}"><span>${escapeHtml(c.nom)}</span></label>`).join('')}</div>
          <div class="hint" style="margin:10px 0 0;">${icone('lock')} Droit à l’image : ne publiez que des enfants dont les parents sont d’accord.</div></fieldset>
        <div id="progressionPub" class="hint"></div>
        <div class="form-actions"><button class="btn" type="submit" id="btnPublier">Publier</button></div>
      </form>
    </div>` : ''}
    <div class="fil-colonne"><div id="filContenu">${renderFilContenu()}</div></div>
  </div>`;
}
function idYoutube(lien){
  const m = String(lien || '').match(/(?:youtu\.be\/|v=|shorts\/|embed\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}
async function compresserPhoto(fichier){
  const img = await new Promise((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = ko; i.src = URL.createObjectURL(fichier); });
  const max = 1600, r = Math.min(1, max / Math.max(img.width, img.height));
  const c = document.createElement('canvas'); c.width = Math.round(img.width * r); c.height = Math.round(img.height * r);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  URL.revokeObjectURL(img.src);
  return await new Promise(ok => c.toBlob(ok, 'image/jpeg', 0.82));
}
async function publierEvenement(ev){
  ev.preventDefault();
  const fd = new FormData(ev.target), bouton = document.getElementById('btnPublier'), prog = document.getElementById('progressionPub');
  const fichiers = Array.from(ev.target.querySelector('input[name=fichiers]').files || []);
  const yt = fd.get('youtube') ? idYoutube(fd.get('youtube')) : null;
  if(fd.get('youtube') && !yt) return alert('Ce lien YouTube n’est pas reconnu.'), false;
  const tropGrosses = fichiers.filter(f => f.type.startsWith('video/') && f.size > VIDEO_MAX_OCTETS);
  if(tropGrosses.length) return alert(`Vidéo trop lourde (${tropGrosses.map(f => f.name).join(', ')}) : 25 Mo maximum. Raccourcissez-la, ou mettez-la sur YouTube et collez le lien.`), false;
  const classeIds = fd.get('cible') === 'classes' ? fd.getAll('classe') : null;
  if(classeIds && !classeIds.length) return alert('Cochez au moins une classe.'), false;
  bouton.disabled = true;
  let pubId = null; const chemins = [];
  try{
    const { data: pub, error } = await sb.from('publications').insert({ titre: fd.get('titre').trim(), texte: (fd.get('texte') || '').trim(),
      date_evenement: fd.get('dateEvenement') || null, classe_ids: classeIds, auteur_nom: session.nomComplet || '' }).select().single();
    if(error) throw error;
    pubId = pub.id;
    const lignes = [];
    for(const [i, f] of fichiers.entries()){
      prog.textContent = `Envoi ${i + 1} / ${fichiers.length}…`;
      const video = f.type.startsWith('video/');
      const contenu = video ? f : await compresserPhoto(f);
      const ext = video ? (f.name.split('.').pop() || 'mp4').toLowerCase() : 'jpg';
      const chemin = `${session.ecoleId}/${pubId}/${crypto.randomUUID()}.${ext}`;
      const { error: errUp } = await sb.storage.from('publications').upload(chemin, contenu, { contentType: video ? f.type : 'image/jpeg', upsert: false });
      if(errUp) throw errUp;
      chemins.push(chemin);
      lignes.push({ publication_id: pubId, type: video ? 'video' : 'photo', chemin, ordre: i });
    }
    if(yt) lignes.push({ publication_id: pubId, type: 'youtube', chemin: yt, ordre: lignes.length });
    if(lignes.length){ const { error: errM } = await sb.from('publication_medias').insert(lignes); if(errM) throw errM; }
    // Notification aux parents concernés
    const eleves = DB.eleves.filter(e => e.statut === 'Actif' && (!classeIds || classeIds.includes(e.classeId))).map(e => e.id);
    notifierParentsPush(eleves, `📸 Nouvelle publication : ${fd.get('titre').trim()}`);
    prog.textContent = '';
    toast('Publication en ligne ✅');
    DB.fil = null;
    renderView('vie-ecole');
  }catch(e){
    // Annulation propre : rien de publié à moitié
    if(chemins.length) await sb.storage.from('publications').remove(chemins).catch(() => {});
    if(pubId) await sb.from('publications').delete().eq('id', pubId);
    bouton.disabled = false; prog.textContent = '';
    alert('Erreur : ' + e.message);
  }
  return false;
}
async function supprimerPublication(id){
  if(!confirm('Supprimer cette publication et ses photos / vidéos ?')) return;
  try{
    const chemins = (DB.fil.medias[id] || []).filter(m => m.type !== 'youtube').map(m => m.chemin);
    if(chemins.length) await sb.storage.from('publications').remove(chemins);
    const { error } = await exigerEffet(sb.from('publications').delete().eq('id', id));
    if(error) throw error;
    DB.fil.pubs = DB.fil.pubs.filter(p => p.id !== id);
    rafraichirFil(); toast('Publication supprimée');
  }catch(e){ alert('Erreur : ' + e.message); }
}
/* =====================================================================
   « À TRAITER » — tableau de bord du secrétariat et de la direction
   Compte (sans rien télécharger d'autre) ce qui attend une action.
   ===================================================================== */
const SUJETS_A_TRAITER = [
  { cle:'acces', ic:'🔑', lib:'demande(s) d’accès à valider', vue:'parametres', table:'demandes_acces', filtre: q => q.eq('statut', 'en_attente'), roles:['direction','fondation'] },
  { cle:'preinsc', ic:'📥', lib:'pré-inscription(s) à rappeler', vue:'eleves', table:'preinscriptions', filtre: q => q.eq('statut', 'nouvelle') },
  { cle:'docs', ic:'📄', lib:'document(s) demandé(s) par les parents', vue:'eleves', table:'demandes_documents', filtre: q => q.eq('statut', 'en_attente') },
  { cle:'corr', ic:'✏️', lib:'correction(s) de fiche proposée(s)', vue:'eleves', table:'corrections_fiches', filtre: q => q.eq('statut', 'en_attente') },
  { cle:'msg', ic:'✉️', lib:'message(s) de parents non lu(s)', vue:'messagerie', table:'messages_internes', filtre: q => q.eq('destinataire_type', 'ecole').eq('lu', false) },
  { cle:'objets', ic:'🎒', lib:'objet(s) perdu(s) signalé(s)', vue:'messagerie', table:'objets_perdus', filtre: q => q.eq('statut', 'signale') },
];
function chargerATraiter(){
  if(DB.aTraiter && DB.aTraiter.charge && Date.now() - DB.aTraiter.charge < 60000) return;
  DB.aTraiter = Object.assign(DB.aTraiter || {}, { charge: Date.now() });
  const sujets = SUJETS_A_TRAITER.filter(s => !s.roles || s.roles.includes(ui.role));
  Promise.all(sujets.map(s => s.filtre(sb.from(s.table).select('*', { count:'exact', head:true }).eq('ecole_id', session.ecoleId))
    .then(r => [s.cle, r.error ? 0 : (r.count || 0)], () => [s.cle, 0])))
    .then(res => { DB.aTraiter.compteurs = Object.fromEntries(res); if(ui.currentView === 'dashboard') renderView('dashboard'); });
}
function renderATraiter(){
  if(!['secretariat','direction','fondation'].includes(ui.role)) return '';
  chargerATraiter();
  const c = DB.aTraiter?.compteurs;
  if(!c) return '';
  const items = SUJETS_A_TRAITER.filter(s => (c[s.cle] || 0) > 0);
  if(!items.length) return `<div class="panel" style="padding:10px 16px;"><span class="hint" style="margin:0;">✅ Rien en attente : aucune demande de parent ou de famille à traiter.</span></div>`;
  return `<div class="panel a-traiter">
    <div class="panel-head"><div><h2>📥 À traiter</h2><div class="sub">Demandes qui attendent une action de l’école.</div></div></div>
    <div class="a-traiter-liste">${items.map(s => `<button type="button" class="a-traiter-item" onclick="DB.aTraiter.charge=0; go('${s.vue}')"><span class="a-traiter-ic">${s.ic}</span><strong>${c[s.cle]}</strong> ${s.lib}<span class="a-traiter-fleche">›</span></button>`).join('')}</div>
  </div>`;
}
/* =====================================================================
   DEMANDES DE DOCUMENTS PAR LES PARENTS (schema.sql section 72)
   ===================================================================== */
const TYPES_DOCUMENT = { certificat_scolarite: 'Certificat de scolarité', autre: 'Autre document' };
const STATUTS_DOCUMENT = { en_attente:['En préparation','amber'], pret:['Prêt à retirer','green'], remis:['Remis',''], refuse:['Non disponible','red'] };
// --- Console parent ---
function ouvrirDemandeDocument(){
  const enfants = DB.eleves || [];
  const demandes = (DB.demandesDocuments || []).slice().sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  openModal('📄 Demander un document', `
    <p class="hint" style="margin-top:0;">Le secrétariat prépare le document ; vous êtes prévenu(e) dès qu’il est prêt à retirer.</p>
    <form onsubmit="return envoyerDemandeDocument(event)">
      ${enfants.length > 1 ? `<div class="field"><label>Enfant</label><select name="eleveId" required>${enfants.map(e => `<option value="${e.id}">${escapeHtml(eleveFullName(e))}</option>`).join('')}</select></div>`
        : `<input type="hidden" name="eleveId" value="${enfants[0]?.id || ''}">`}
      <div class="field"><label>Document</label><select name="type">${Object.entries(TYPES_DOCUMENT).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>
      <div class="field"><label>Précision (facultatif)</label><input name="precision" maxlength="300" placeholder="Ex : 2 exemplaires, pour la CNPS, attestation de fréquentation…"></div>
      <button class="btn" type="submit" style="width:100%;">Envoyer la demande</button>
    </form>
    ${demandes.length ? `<h4 style="margin:var(--sp-4) 0 var(--sp-2);">Vos demandes</h4>${demandes.map(d => { const e = enfants.find(x => x.id === d.eleveId); const st = STATUTS_DOCUMENT[d.statut] || ['', '']; return `<div class="actu-carte" style="justify-content:space-between;margin-bottom:6px;"><div class="actu-corps"><div class="actu-titre">${escapeHtml(TYPES_DOCUMENT[d.type] || d.type)} — ${escapeHtml(e ? e.prenom : '')}</div><div class="actu-meta">Demandé le ${fmtDate(String(d.createdAt).slice(0, 10))}${d.precision ? ' · ' + escapeHtml(d.precision) : ''}</div></div><span class="badge ${st[1]}">${st[0]}</span></div>`; }).join('')}` : ''}`);
}
async function envoyerDemandeDocument(ev){
  ev.preventDefault();
  const fd = new FormData(ev.target);
  try{
    const { data, error } = await sb.from('demandes_documents').insert({ eleve_id: fd.get('eleveId'), type: fd.get('type'), precision: (fd.get('precision') || '').trim() }).select().single();
    if(error) throw error;
    DB.demandesDocuments = (DB.demandesDocuments || []).concat(rowToCamel(data));
    sb.functions.invoke('notifier-personnel', { body: { type: 'document' } }).catch(() => {});
    toast('Demande envoyée au secrétariat'); ouvrirDemandeDocument();
  }catch(err){ alert('Erreur : ' + err.message); }
  return false;
}
// --- École : Élèves & Inscriptions ---
function renderDemandesDocuments(){
  if(!['secretariat','direction','fondation'].includes(ui.role)) return '';
  if(DB.demandesDocuments === undefined){
    DB.demandesDocuments = null;
    sb.from('demandes_documents').select('*').eq('ecole_id', session.ecoleId).in('statut', ['en_attente','pret']).order('created_at')
      .then(({ data }) => { DB.demandesDocuments = rowsToCamel(data || []); if(ui.currentView === 'eleves' && DB.demandesDocuments.length) renderView('eleves'); });
  }
  const liste = (DB.demandesDocuments || []).filter(d => d.statut === 'en_attente' || d.statut === 'pret');
  if(!liste.length) return '';
  return `<div class="panel">
    <div class="panel-head"><div><h2>📄 Documents demandés par les parents (${liste.length})</h2><div class="sub">Préparez le document, marquez-le « prêt » (le parent est prévenu), puis « remis » quand il est retiré.</div></div></div>
    <div class="table-wrap"><table>
      <thead><tr><th>Élève</th><th>Document</th><th>Statut</th><th></th></tr></thead>
      <tbody>${liste.map(d => { const e = eleveById(d.eleveId); const st = STATUTS_DOCUMENT[d.statut] || ['', '']; return `<tr>
        <td>${e ? `<strong>${escapeHtml(eleveFullName(e))}</strong><br><span class="hint">${escapeHtml(classeName(e.classeId))}</span>` : '—'}</td>
        <td>${escapeHtml(TYPES_DOCUMENT[d.type] || d.type)}${d.precision ? `<br><span class="hint">« ${escapeHtml(d.precision)} »</span>` : ''}<br><span class="hint">demandé le ${fmtDate(String(d.createdAt).slice(0, 10))}</span></td>
        <td><span class="badge ${st[1]}">${st[0]}</span></td>
        <td style="white-space:nowrap;">
          ${d.type === 'certificat_scolarite' && e ? `<button class="btn secondary sm" onclick="ouvrirCertificatScolarite('${e.id}')">📄 Préparer</button>` : ''}
          ${d.statut === 'en_attente' ? `<button class="btn sm" onclick="statutDemandeDocument('${d.id}','pret')">✓ Prêt</button> <button class="btn secondary sm" title="Document non disponible" onclick="statutDemandeDocument('${d.id}','refuse')">✕</button>` : `<button class="btn sm" onclick="statutDemandeDocument('${d.id}','remis')">Remis</button>`}
        </td></tr>`; }).join('')}</tbody></table></div>
  </div>`;
}
async function statutDemandeDocument(id, statut){
  const d = (DB.demandesDocuments || []).find(x => x.id === id);
  if(!d) return;
  let motif = '';
  if(statut === 'refuse'){ motif = prompt('Expliquez brièvement au parent pourquoi (il recevra ce message) :', ''); if(motif === null) return; }
  try{
    const { error } = await exigerEffet(sb.from('demandes_documents').update({ statut, traite_at: new Date().toISOString() }).eq('id', id));
    if(error) throw error;
    d.statut = statut;
    const e = eleveById(d.eleveId);
    const doc = TYPES_DOCUMENT[d.type] || 'document';
    if(statut === 'pret' || statut === 'refuse'){
      const texte = statut === 'pret'
        ? `📄 Le ${doc.toLowerCase()} de ${e ? e.prenom : 'votre enfant'} est prêt : vous pouvez le retirer au secrétariat.`
        : `📄 Votre demande (${doc.toLowerCase()} de ${e ? e.prenom : 'votre enfant'}) n’a pas pu être satisfaite${motif ? ' : ' + motif : '.'}`;
      await sb.from('messages_internes').insert({ destinataire_type: 'parent', eleve_id: d.eleveId, contenu: texte, auteur_nom: DB.meta?.nomEcole || '' });
      notifierParentsPush([d.eleveId], texte);
    }
    toast(statut === 'pret' ? 'Parent prévenu : document prêt' : statut === 'remis' ? 'Document remis' : 'Parent prévenu');
    renderView('eleves');
  }catch(err){ alert('Erreur : ' + err.message); }
}
/* =====================================================================
   NOTES : CAMPS DE BASE + COMPOSITION → BULLETIN (schema.sql section 78)
   Moyenne de classe = moyenne (ramenée sur 20) de toutes les notes de
   « Camps de base » (devoirs, exercices de classe, exercices de maison,
   interrogations) ; moyenne de la matière = (classe + 2 × composition) / 3.
   ===================================================================== */
const TYPES_BASE = ['Devoir','Exercice de classe','Exercice de maison','Interrogation'];
const ICONES_EVAL = { 'Devoir':'📝', 'Exercice de classe':'✏️', 'Exercice de maison':'🏠', 'Interrogation':'❓' };
function sur20(n){ return Number(n.note) * 20 / (Number(n.noteSur) || 20); }
function moyenneMatiere(eleveId, matiere, trimestre){
  const notes = (DB.notes || []).filter(n => n.eleveId === eleveId && n.matiere === matiere && n.trimestre === trimestre && n.note != null);
  const base = notes.filter(n => TYPES_BASE.includes(n.type)), compos = notes.filter(n => n.type === 'Composition');
  const moyClasse = base.length ? base.reduce((s, n) => s + sur20(n), 0) / base.length : null;
  const compo = compos.length ? compos.reduce((s, n) => s + sur20(n), 0) / compos.length : null;
  const moy = moyClasse !== null && compo !== null ? (moyClasse + 2 * compo) / 3 : (moyClasse ?? compo);
  return { classe: moyClasse, nbClasse: base.length, compo, moy };
}

/* ---------- 🏕️ CAMPS DE BASE ---------- */
function renderCampsDeBase(){
  const mesClasses = classesVisibles();
  if(!mesClasses.length) return `<div class="view active"><div class="panel"><div class="empty-state"><div class="em-ic">🏕️</div>Aucune classe : activez un niveau dans Paramètres, ou faites valider vos classes par la direction.</div></div></div>`;
  const f = ui.filters.camps || { classeId: mesClasses[0].id, matiere: '', trimestre: trimestreCourant() };
  if(!mesClasses.some(c => c.id === f.classeId)) f.classeId = mesClasses[0].id;
  const matieres = MATIERES_BY_CYCLE[classeCycle(f.classeId)] || [];
  if(!matieres.includes(f.matiere)) f.matiere = matieres[0] || '';
  ui.filters.camps = f;
  if(DB.evaluations === undefined){
    DB.evaluations = null;
    sb.from('evaluations').select('*').eq('ecole_id', session.ecoleId).order('date')
      .then(({ data }) => { DB.evaluations = rowsToCamel(data || []); if(ui.currentView === 'camps-de-base') renderView('camps-de-base'); });
  }
  const evals = (DB.evaluations || []).filter(e => e.classeId === f.classeId && e.matiere === f.matiere && e.trimestre === f.trimestre)
    .sort((a, b) => a.date.localeCompare(b.date));
  const eleves = DB.eleves.filter(e => e.classeId === f.classeId && e.statut === 'Actif').sort((a, b) => eleveFullName(a).localeCompare(eleveFullName(b)));
  const noteDe = (ev, el) => (DB.notes || []).find(n => n.evaluationId === ev.id && n.eleveId === el.id);
  const ouverte = evals.find(e => e.id === ui.filters.campsEval);
  const sel = (nom, opts, val) => `<select onchange="ui.filters.camps.${nom}=this.value; ui.filters.campsEval=null; renderView('camps-de-base')">${opts.map(o => `<option value="${escapeHtml(o[0])}" ${o[0] === val ? 'selected' : ''}>${escapeHtml(o[1])}</option>`).join('')}</select>`;
  return `<div class="view active">
    <div class="section-note">🏕️ <strong>Camps de base</strong> : notez ici tous les devoirs, exercices de classe, exercices de maison et interrogations, autant que vous voulez. Leur moyenne forme la <strong>moyenne de classe</strong> du bulletin ; avec la composition (menu Notes & Bulletins) : moyenne de la matière = (classe + 2 × composition) ÷ 3.</div>
    <div class="panel">
      <div class="filters">
        ${sel('classeId', mesClasses.map(c => [c.id, c.nom]), f.classeId)}
        ${sel('matiere', matieres.map(m => [m, m]), f.matiere)}
        ${sel('trimestre', TRIMESTRES.map(t => [t, t]), f.trimestre)}
      </div>
      ${DB.evaluations === null ? '<div class="hint">Chargement…</div>' : ouverte ? renderSaisieEvaluation(ouverte, eleves, noteDe) : `
      <div class="panel-head" style="margin-top:8px;"><div><h2>Évaluations — ${escapeHtml(f.matiere)}</h2><div class="sub">${evals.length} évaluation(s) · ${eleves.length} élève(s)</div></div>
        <button class="btn" onclick="ouvrirNouvelleEvaluation()">+ Nouvelle évaluation</button></div>
      ${!evals.length ? '<div class="empty-state"><div class="em-ic">🏕️</div>Aucune évaluation pour cette matière et ce trimestre. Cliquez sur « + Nouvelle évaluation ».</div>' : `
      <div class="table-wrap"><table class="camps-table">
        <thead><tr><th>Élève</th>${evals.map(ev => `<th class="camps-col" title="${escapeHtml(ev.titre || ev.type)}"><button class="lien-btn" onclick="ui.filters.campsEval='${ev.id}'; renderView('camps-de-base')">${ICONES_EVAL[ev.type] || ''} ${fmtDate(ev.date).slice(0, 5)}<br><span class="hint">/${Number(ev.noteSur)}</span></button></th>`).join('')}<th>Moy. classe /20</th></tr></thead>
        <tbody>${eleves.map(el => { const m = moyenneMatiere(el.id, f.matiere, f.trimestre); return `<tr>
          <td>${escapeHtml(eleveFullName(el))}</td>
          ${evals.map(ev => { const n = noteDe(ev, el); return `<td class="camps-col">${n && n.note != null ? Number(n.note) : '<span class="hint">—</span>'}</td>`; }).join('')}
          <td><strong class="${m.classe !== null ? moyenneClass(m.classe) : ''}">${m.classe !== null ? m.classe.toFixed(2) : '—'}</strong></td></tr>`; }).join('')}</tbody>
        <tfoot><tr><td><strong>Moyenne de la classe</strong></td>${evals.map(ev => { const ns = eleves.map(el => noteDe(ev, el)).filter(n => n && n.note != null); return `<td class="camps-col">${ns.length ? (ns.reduce((s, n) => s + Number(n.note), 0) / ns.length).toFixed(1) : '—'}</td>`; }).join('')}<td></td></tr></tfoot>
      </table></div>
      <div class="hint" style="margin-top:8px;">Touchez la date d’une évaluation pour saisir ou corriger ses notes.</div>`}`}
    </div>
  </div>`;
}
function trimestreCourant(){
  const m = new Date().getMonth() + 1; // septembre-décembre : T1 ; janvier-mars : T2 ; avril-juillet : T3
  return m >= 8 ? 'Trimestre 1' : m <= 3 ? 'Trimestre 2' : 'Trimestre 3';
}
function renderSaisieEvaluation(ev, eleves, noteDe){
  return `<div class="panel-head" style="margin-top:8px;"><div><h2>${ICONES_EVAL[ev.type] || ''} ${escapeHtml(ev.type)}${ev.titre ? ' — ' + escapeHtml(ev.titre) : ''}</h2><div class="sub">${fmtDate(ev.date)} · noté sur ${Number(ev.noteSur)} · ${escapeHtml(ev.matiere)} · ${escapeHtml(ev.trimestre)}</div></div>
      <button class="btn secondary sm" onclick="ui.filters.campsEval=null; renderView('camps-de-base')">← Retour au tableau</button></div>
    <form onsubmit="return enregistrerNotesEvaluation(event, '${ev.id}')">
      <div class="table-wrap"><table>
        <thead><tr><th>Élève</th><th>Note / ${Number(ev.noteSur)}</th></tr></thead>
        <tbody>${eleves.map((el, i) => { const n = noteDe(ev, el); return `<tr><td>${escapeHtml(eleveFullName(el))}</td>
          <td><input type="number" inputmode="decimal" name="n_${el.id}" min="0" max="${Number(ev.noteSur)}" step="0.25" value="${n && n.note != null ? Number(n.note) : ''}" style="width:90px;" onkeydown="if(event.key==='Enter'){ event.preventDefault(); const s=document.querySelectorAll('[name^=n_]')[${i + 1}]; if(s) s.focus(); }" aria-label="Note de ${escapeHtml(eleveFullName(el))}"></td></tr>`; }).join('')}</tbody>
      </table></div>
      <div class="hint">Laissez vide pour un élève absent ou non noté (il ne compte pas dans sa moyenne).</div>
      <div class="form-actions">
        <button type="button" class="btn danger" onclick="supprimerEvaluation('${ev.id}')">Supprimer l’évaluation</button>
        <button class="btn" type="submit">Enregistrer les notes</button></div>
    </form>`;
}
function ouvrirNouvelleEvaluation(){
  const f = ui.filters.camps;
  openModal('🏕️ Nouvelle évaluation', `
    <form onsubmit="return creerEvaluation(event)">
      <p class="hint" style="margin-top:0;">${escapeHtml(classeName(f.classeId))} · ${escapeHtml(f.matiere)} · ${escapeHtml(f.trimestre)}</p>
      <div class="form-grid">
        <div class="field"><label>Type</label><select name="type">${TYPES_BASE.map(t => `<option value="${t}">${ICONES_EVAL[t]} ${t}</option>`).join('')}</select></div>
        <div class="field"><label>Date</label><input type="date" name="date" required value="${todayISO()}" max="${todayISO()}"></div>
        <div class="field"><label>Noté sur</label><select name="noteSur">${[20, 10, 5, 40, 50, 100].map(v => `<option value="${v}">${v}</option>`).join('')}</select></div>
        <div class="field"><label>Titre (facultatif)</label><input name="titre" maxlength="120" placeholder="Ex : Les fractions"></div>
      </div>
      <div class="form-actions"><button type="button" class="btn secondary" onclick="closeModal()">Annuler</button><button class="btn" type="submit">Créer et saisir les notes</button></div>
    </form>`);
}
async function creerEvaluation(ev){
  ev.preventDefault();
  const fd = new FormData(ev.target), f = ui.filters.camps;
  try{
    const e = await dbInsert('evaluations', { classeId: f.classeId, matiere: f.matiere, trimestre: f.trimestre, type: fd.get('type'), titre: (fd.get('titre') || '').trim(), date: fd.get('date'), noteSur: Number(fd.get('noteSur')) });
    DB.evaluations = (DB.evaluations || []).concat(e);
    ui.filters.campsEval = e.id;
    closeModal(); renderView('camps-de-base');
    setTimeout(() => { const p = document.querySelector('[name^=n_]'); if(p) p.focus(); }, 50);
  }catch(err){ alert('Erreur : ' + err.message); }
  return false;
}
async function enregistrerNotesEvaluation(event, evalId){
  event.preventDefault();
  const ev = (DB.evaluations || []).find(e => e.id === evalId); if(!ev) return false;
  const bouton = event.target.querySelector('button[type=submit]'); if(bouton) bouton.disabled = true;
  let nb = 0;
  try{
    for(const input of event.target.querySelectorAll('[name^=n_]')){
      const eleveId = input.name.slice(2), brut = input.value.trim().replace(',', '.');
      const exist = (DB.notes || []).find(n => n.evaluationId === evalId && n.eleveId === eleveId);
      if(brut === ''){
        if(exist){ await dbDelete('notes', exist.id); DB.notes = DB.notes.filter(n => n.id !== exist.id); nb++; }
        continue;
      }
      const note = Number(brut);
      if(!(note >= 0 && note <= Number(ev.noteSur))){ input.focus(); throw new Error(`Note impossible (${brut}) : elle doit être entre 0 et ${Number(ev.noteSur)}.`); }
      if(exist){ if(Number(exist.note) !== note){ await dbUpdate('notes', exist.id, { note }); exist.note = note; nb++; } }
      else { DB.notes.push(await dbInsert('notes', { eleveId, matiere: ev.matiere, note, noteSur: Number(ev.noteSur), trimestre: ev.trimestre, type: ev.type, date: ev.date, evaluationId: ev.id })); nb++; }
    }
    toast(nb ? `${nb} note(s) enregistrée(s)` : 'Aucun changement');
    if(nb && DB.meta?.notesContinuesParents){
      const notes = (DB.notes || []).filter(n => n.evaluationId === evalId).map(n => n.eleveId);
      notifierParentsPush(notes, `📝 Nouvelle note en ${ev.matiere}${ev.titre ? ' (' + ev.titre + ')' : ''} — consultez l’application.`);
    }
    ui.filters.campsEval = null; renderView('camps-de-base');
  }catch(err){ alert('Erreur : ' + err.message); if(bouton) bouton.disabled = false; }
  return false;
}
async function supprimerEvaluation(evalId){
  if(!confirm('Supprimer cette évaluation et toutes ses notes ?')) return;
  try{
    await dbDelete('evaluations', evalId);
    DB.evaluations = (DB.evaluations || []).filter(e => e.id !== evalId);
    DB.notes = (DB.notes || []).filter(n => n.evaluationId !== evalId);
    ui.filters.campsEval = null; toast('Évaluation supprimée'); renderView('camps-de-base');
  }catch(err){ alert('Erreur : ' + err.message); }
}

/* ---------- 🏆 BULLETIN OFFICIEL : coefficients, rang, statistiques ---------- */
function coefficientDe(cycle, matiere){
  const c = (DB.coefficientsMatieres || []).find(x => x.cycle === cycle && x.matiere === matiere);
  return c ? Number(c.coefficient) : 1;
}
function rangTexte(r, exAequo){ return r ? `${r}${r === 1 ? 'er' : 'e'}${exAequo ? ' ex æquo' : ''}` : '—'; }
// Résultats d'une classe pour un trimestre : moyenne pondérée, rang (ex æquo gérés), statistiques
function resultatsClasse(classeId, trimestre){
  const cycle = classeCycle(classeId);
  const matieres = MATIERES_BY_CYCLE[cycle] || [];
  const eleves = DB.eleves.filter(e => e.classeId === classeId && e.statut === 'Actif');
  const lignes = eleves.map(e => {
    let somme = 0, coefs = 0;
    const details = matieres.map(mat => {
      const m = moyenneMatiere(e.id, mat, trimestre), coef = coefficientDe(cycle, mat);
      if(m.moy !== null){ somme += m.moy * coef; coefs += coef; }
      return { matiere: mat, coef, classe: m.classe, compo: m.compo, moy: m.moy };
    });
    return { eleve: e, moyenne: coefs ? somme / coefs : null, details };
  });
  const classees = lignes.filter(l => l.moyenne !== null).sort((a, b) => b.moyenne - a.moyenne);
  classees.forEach((l, i) => {
    const egal = classees.findIndex(x => Math.abs(x.moyenne - l.moyenne) < 0.005);
    l.rang = egal + 1;
    l.exAequo = classees.filter(x => Math.abs(x.moyenne - l.moyenne) < 0.005).length > 1;
  });
  // Moyenne de chaque matière dans la classe (pour le bulletin)
  const moyMatiere = {};
  matieres.forEach(mat => { const vals = lignes.map(l => l.details.find(d => d.matiere === mat).moy).filter(v => v !== null); moyMatiere[mat] = vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null; });
  lignes.forEach(l => l.details.forEach(d => { d.moyClasseMatiere = moyMatiere[d.matiere]; }));
  const moys = classees.map(l => l.moyenne);
  return { lignes, effectif: classees.length, moyenneClasse: moys.length ? moys.reduce((s, v) => s + v, 0) / moys.length : null,
    plusForte: moys.length ? Math.max(...moys) : null, plusFaible: moys.length ? Math.min(...moys) : null };
}
const arr2 = v => v === null || v === undefined ? null : Math.round(Number(v) * 100) / 100;
// Fige les résultats (pour les parents) : appelé à la publication du trimestre
async function figerResultats(trimestre){
  const lignes = [];
  for(const c of DB.classes){
    const r = resultatsClasse(c.id, trimestre);
    for(const l of r.lignes){
      if(l.moyenne === null) continue;
      lignes.push({ eleve_id: l.eleve.id, trimestre, ecole_id: session.ecoleId, classe_id: c.id, moyenne: arr2(l.moyenne), rang: l.rang, ex_aequo: !!l.exAequo,
        effectif: r.effectif, moyenne_classe: arr2(r.moyenneClasse), plus_forte: arr2(r.plusForte), plus_faible: arr2(r.plusFaible),
        details: l.details.map(d => ({ matiere: d.matiere, coef: d.coef, classe: arr2(d.classe), compo: arr2(d.compo), moy: arr2(d.moy), moyClasse: arr2(d.moyClasseMatiere) })),
        calcule_at: new Date().toISOString() });
    }
  }
  if(!lignes.length) return 0;
  for(let i = 0; i < lignes.length; i += 200){
    const { error } = await sb.from('bulletins_resultats').upsert(lignes.slice(i, i + 200), { onConflict: 'eleve_id,trimestre' });
    if(error) throw erreurLisible(error);
  }
  DB.bulletinsResultats = (DB.bulletinsResultats || []).filter(b => b.trimestre !== trimestre).concat(rowsToCamel(lignes));
  return lignes.length;
}
// Panneau « Résultats du trimestre » (Notes & Bulletins)
function renderResultatsTrimestre(classeId, trimestre){
  const r = resultatsClasse(classeId, trimestre);
  if(!r.effectif) return '';
  const tri = r.lignes.filter(l => l.moyenne !== null).sort((a, b) => a.rang - b.rang);
  return `<div class="panel">
    <div class="panel-head"><div><h2>🏆 Résultats — ${escapeHtml(classeName(classeId))} · ${escapeHtml(trimestre)}</h2>
      <div class="sub">Moyenne de la classe ${r.moyenneClasse.toFixed(2)} · plus forte ${r.plusForte.toFixed(2)} · plus faible ${r.plusFaible.toFixed(2)} · ${r.effectif} élève(s) classé(s)</div></div>
      <button class="btn sm" onclick="imprimerBulletinsClasse('${classeId}', '${trimestre}')">🖨️ Imprimer les bulletins de la classe</button></div>
    <div class="table-wrap"><table>
      <thead><tr><th>Rang</th><th>Élève</th><th>Moyenne /20</th><th>Mention</th></tr></thead>
      <tbody>${tri.map(l => `<tr><td><strong>${rangTexte(l.rang, l.exAequo)}</strong></td><td>${escapeHtml(eleveFullName(l.eleve))}</td>
        <td><strong class="${moyenneClass(l.moyenne)}">${l.moyenne.toFixed(2)}</strong></td><td>${escapeHtml(mentionFromAvg(l.moyenne))}</td></tr>`).join('')}</tbody>
    </table></div>
  </div>`;
}
// Bulletin officiel d'un élève (une page A4)
function bulletinOfficielHtml(l, r, trimestre){
  const m = DB.meta || {}, e = l.eleve;
  const app = (DB.bulletinsComments || {})[`${e.id}_${trimestre}`] || '';
  const totalCoef = l.details.filter(d => d.moy !== null).reduce((s, d) => s + d.coef, 0);
  return `<section class="bulletin-page">
    <div class="recu-head">${m.logo ? `<img src="${m.logo}" alt="">` : `<div class="recu-logo-ph">🎓</div>`}
      <div><strong>${escapeHtml(m.nomEcole || '')}</strong><div class="hint">${escapeHtml(m.adresse || '')}${m.telephone ? ' · ' + escapeHtml(m.telephone) : ''}</div></div>
      <div style="margin-left:auto;text-align:right;"><strong>BULLETIN DE NOTES</strong><div class="hint">${escapeHtml(trimestre)} · ${escapeHtml(m.anneeScolaire || '')}</div></div></div>
    <div class="bo-identite"><div><span>Élève</span><strong>${escapeHtml(eleveFullName(e))}</strong></div><div><span>Matricule</span><strong>${escapeHtml(e.matricule || '—')}</strong></div>
      <div><span>Classe</span><strong>${escapeHtml(classeName(e.classeId))}</strong></div><div><span>Effectif</span><strong>${r.effectif}</strong></div></div>
    <table class="bo-table"><thead><tr><th>Matière</th><th>Coef.</th><th>Moy. classe<br><small>(camps de base)</small></th><th>Compo.</th><th>Moy. /20</th><th>Moy. × coef.</th><th>Moy. de la classe</th><th>Appréciation</th></tr></thead>
      <tbody>${l.details.map(d => `<tr><td style="text-align:left;">${escapeHtml(d.matiere)}</td><td>${d.coef}</td><td>${d.classe !== null ? d.classe.toFixed(2) : '—'}</td><td>${d.compo !== null ? d.compo.toFixed(2) : '—'}</td>
        <td><strong>${d.moy !== null ? d.moy.toFixed(2) : '—'}</strong></td><td>${d.moy !== null ? (d.moy * d.coef).toFixed(2) : '—'}</td><td>${d.moyClasseMatiere != null ? d.moyClasseMatiere.toFixed(2) : '—'}</td><td>${d.moy !== null ? escapeHtml(mentionFromAvg(d.moy)) : ''}</td></tr>`).join('')}</tbody>
      <tfoot><tr><td style="text-align:left;"><strong>Total</strong></td><td>${totalCoef}</td><td colspan="3"></td><td><strong>${l.moyenne !== null ? (l.moyenne * totalCoef).toFixed(2) : '—'}</strong></td><td colspan="2"></td></tr></tfoot></table>
    <div class="bo-synthese">
      <div><span>Moyenne générale</span><strong>${l.moyenne !== null ? l.moyenne.toFixed(2) + ' / 20' : '—'}</strong></div>
      <div><span>Rang</span><strong>${rangTexte(l.rang, l.exAequo)} sur ${r.effectif}</strong></div>
      <div><span>Mention</span><strong>${l.moyenne !== null ? escapeHtml(mentionFromAvg(l.moyenne)) : '—'}</strong></div>
      <div><span>Moyenne de la classe</span><strong>${r.moyenneClasse !== null ? r.moyenneClasse.toFixed(2) : '—'}</strong></div>
      <div><span>Plus forte / plus faible</span><strong>${r.plusForte !== null ? r.plusForte.toFixed(2) + ' / ' + r.plusFaible.toFixed(2) : '—'}</strong></div></div>
    <div class="eb-appreciation" style="min-height:40px;"><strong>Appréciation du titulaire :</strong> ${escapeHtml(app)}</div>
    <div class="signatures"><div class="sign-box"><div class="sign-role">Le/La titulaire</div><div class="sign-line">&nbsp;</div></div>
      <div class="sign-box"><div class="sign-role">Le Directeur / La Directrice</div><div class="sign-line">${escapeHtml(m.directeurNom || '')}</div></div>
      <div class="sign-box"><div class="sign-role">Le parent</div><div class="sign-line">&nbsp;</div></div></div>
  </section>`;
}
function imprimerBulletinsClasse(classeId, trimestre){
  const r = resultatsClasse(classeId, trimestre);
  const lignes = r.lignes.filter(l => l.moyenne !== null).sort((a, b) => eleveFullName(a.eleve).localeCompare(eleveFullName(b.eleve)));
  if(!lignes.length) return alert('Aucune note pour ce trimestre dans cette classe.');
  openModal(`🖨️ Bulletins — ${classeName(classeId)} · ${trimestre}`, `
    <div class="form-actions no-print" style="justify-content:flex-start;"><button class="btn" onclick="window.print()">🖨️ Imprimer les ${lignes.length} bulletins</button><span class="hint" style="align-self:center;">Une page par élève — choisissez « Enregistrer en PDF » pour garder une copie.</span></div>
    ${lignes.map(l => bulletinOfficielHtml(l, r, trimestre)).join('')}`);
}
// Paramètres : coefficients par niveau et matière
function renderCoefficients(){
  if(!['direction','fondation'].includes(ui.role)) return '';
  const cycles = [...new Set(DB.classes.map(c => c.cycle))].filter(c => MATIERES_BY_CYCLE[c]);
  if(!cycles.length) return '';
  return `<div class="panel">
    <div class="panel-head"><div><h2>⚖️ Coefficients des matières</h2><div class="sub">Utilisés pour la moyenne générale, le rang et le bulletin officiel. Par défaut : 1.</div></div></div>
    <form onsubmit="return enregistrerCoefficients(event)">
      ${cycles.map(cy => `<h4 style="margin:12px 0 6px;">${escapeHtml(cy)}</h4><div class="coef-grille">${MATIERES_BY_CYCLE[cy].map(mat => `<label class="coef-ligne"><span>${escapeHtml(mat)}</span>
        <input type="number" min="0.5" max="10" step="0.5" name="${escapeHtml(cy + '|' + mat)}" value="${coefficientDe(cy, mat)}"></label>`).join('')}</div>`).join('')}
      <div class="form-actions"><button class="btn" type="submit">Enregistrer les coefficients</button></div>
    </form>
  </div>`;
}
async function enregistrerCoefficients(ev){
  ev.preventDefault();
  const lignes = [...new FormData(ev.target).entries()].map(([k, v]) => { const [cycle, matiere] = k.split('|'); return { ecole_id: session.ecoleId, cycle, matiere, coefficient: Number(v) }; })
    .filter(l => l.coefficient > 0 && l.coefficient <= 10);
  try{
    const { error } = await sb.from('coefficients_matieres').upsert(lignes, { onConflict: 'ecole_id,cycle,matiere' });
    if(error) throw erreurLisible(error);
    DB.coefficientsMatieres = rowsToCamel(lignes);
    toast('Coefficients enregistrés');
  }catch(e){ alert('Erreur : ' + e.message); }
  return false;
}
/* ---------- 📒 CAHIER D'APPEL (registre mensuel) ---------- */
const CYCLE_APPEL = ['', 'Présent', 'Absent', 'Retard'];
function joursDeClasseDuMois(mois){
  const [a, m] = mois.split('-').map(Number);
  const jours = DB.horairesAnnonces?.joursCours || [1, 2, 3, 4, 5];
  const res = [];
  for(let j = 1; j <= new Date(a, m, 0).getDate(); j++){
    const d = new Date(a, m - 1, j, 12), iso = ((d.getDay() + 6) % 7) + 1;
    if(jours.includes(iso)) res.push(`${a}-${String(m).padStart(2, '0')}-${String(j).padStart(2, '0')}`);
  }
  return res;
}
function renderCahierAppel(){
  const mesClasses = classesVisibles();
  if(!mesClasses.length) return `<div class="view active"><div class="panel"><div class="empty-state"><div class="em-ic">📒</div>Aucune classe.</div></div></div>`;
  const f = ui.filters.cahier || { classeId: mesClasses[0].id, mois: thisMonthISO() };
  if(!mesClasses.some(c => c.id === f.classeId)) f.classeId = mesClasses[0].id;
  ui.filters.cahier = f;
  const jours = joursDeClasseDuMois(f.mois), auj = todayISO();
  const eleves = DB.eleves.filter(e => e.classeId === f.classeId && e.statut === 'Actif').sort((a, b) => eleveFullName(a).localeCompare(eleveFullName(b)));
  const pres = DB.presencesEleves.filter(p => p.date.startsWith(f.mois) && eleves.some(e => e.id === p.eleveId));
  const cle = (e, d) => pres.find(p => p.eleveId === e.id && p.date === d);
  const nomMois = new Date(f.mois + '-15T12:00:00').toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  // Refonte (DESIGN.md §11) : onglet « Aujourd'hui » par défaut sur téléphone, « Mois » sur ordinateur
  const onglet = ui.filters.cahierOnglet || (window.innerWidth < 900 ? 'jour' : 'mois');
  // Sur téléphone : le registre s'ouvre directement sur la colonne d'aujourd'hui
  if(onglet === 'mois') setTimeout(() => { const t = document.querySelector('.ca-table .ca-auj'); if(t && t.scrollIntoView) t.scrollIntoView({ inline: 'center', block: 'nearest' }); }, 0);
  const decale = n => { const [a, m] = f.mois.split('-').map(Number); const d = new Date(a, m - 1 + n, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
  const cellule = (e, d) => {
    const p = cle(e, d), s = p ? p.statut : '';
    const cls = s === 'Présent' ? 'ca-p' : s === 'Absent' ? 'ca-a' : s === 'Retard' ? 'ca-r' : '';
    const lettre = s === 'Présent' ? '•' : s === 'Absent' ? 'A' : s === 'Retard' ? 'R' : '';
    const futur = d > auj;
    return `<td class="ca-cell ${cls}${futur ? ' ca-futur' : ''}"${futur ? '' : ` onclick="basculerCahierAppel('${e.id}','${d}')"`} title="${escapeHtml(eleveFullName(e))} — ${fmtDate(d)}${s ? ' : ' + s : ''}${p && p.motif ? ' (' + escapeHtml(p.motif) + ')' : ''}">${lettre}</td>`;
  };
  return `<div class="view active">
    <div class="panel cahier-appel">
      <div class="panel-head no-print"><div><h2>📒 Cahier d’appel</h2><div class="sub">${onglet === 'jour' ? 'Choisissez Présent, Absent ou Retard pour chaque élève, puis validez.' : 'Touchez une case pour la changer : vide → • présent → A absent → R retard → vide. Les jours futurs sont verrouillés.'}</div></div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;">
          <button class="btn secondary sm" onclick="exporterCahierAppel()">⬇️ Excel</button>
          <button class="btn secondary sm" onclick="window.print()">🖨️ Imprimer</button></div></div>
      <div class="ca-barre no-print">
        <select class="puce-select" aria-label="Classe" onchange="ui.filters.cahier.classeId=this.value; renderView('cahier-appel')">${mesClasses.map(c => `<option value="${c.id}" ${c.id === f.classeId ? 'selected' : ''}>${escapeHtml(c.nom)}</option>`).join('')}</select>
        <div class="segmente" role="tablist" aria-label="Affichage">${[['jour', 'Aujourd’hui'], ['mois', 'Mois']].map(([k, l]) => `<button type="button" role="tab" class="seg${onglet === k ? ' actif' : ''}" aria-selected="${onglet === k}" onclick="ui.filters.cahierOnglet='${k}'; renderView('cahier-appel')">${l}</button>`).join('')}</div>
      </div>
      ${onglet === 'jour' ? renderAppelDuJour(f.classeId, eleves) : `
      <div class="ca-mois no-print">
        <button type="button" class="ca-fleche" aria-label="Mois précédent" onclick="ui.filters.cahier.mois='${decale(-1)}'; renderView('cahier-appel')">‹</button>
        <strong>${nomMois}</strong>
        <button type="button" class="ca-fleche" aria-label="Mois suivant" onclick="ui.filters.cahier.mois='${decale(1)}'; renderView('cahier-appel')">›</button>
      </div>
      <div class="print-only"><h2>${escapeHtml(DB.meta?.nomEcole || '')} — Cahier d’appel · ${escapeHtml(classeName(f.classeId))} · <span style="text-transform:capitalize;">${nomMois}</span></h2></div>
      ${!eleves.length ? '<div class="empty-state"><div class="em-ic">📒</div>Aucun élève actif dans cette classe.</div>' : `
      <div class="table-wrap ca-defile"><table class="ca-table">
        <thead><tr><th class="ca-nom">Élève</th>${jours.map(d => `<th class="ca-jour${d === auj ? ' ca-auj' : ''}">${new Date(d + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'narrow' })}<br>${Number(d.slice(8))}</th>`).join('')}<th>Abs.</th><th>Ret.</th><th>Prés. %</th></tr></thead>
        <tbody>${eleves.map(e => { const ps = pres.filter(p => p.eleveId === e.id), a = ps.filter(p => p.statut === 'Absent').length, r = ps.filter(p => p.statut === 'Retard').length;
          return `<tr><td class="ca-nom" title="${escapeHtml(eleveFullName(e))}"><span class="ca-nom-txt">${escapeHtml(eleveFullName(e))}</span></td>${jours.map(d => cellule(e, d)).join('')}<td class="ca-tot">${a || ''}</td><td class="ca-tot">${r || ''}</td><td class="ca-tot">${ps.length ? Math.round(100 * (ps.length - a) / ps.length) + ' %' : '—'}</td></tr>`; }).join('')}</tbody>
        <tfoot><tr><td class="ca-nom"><strong>Présents</strong></td>${jours.map(d => { const ps = pres.filter(p => p.date === d); return `<td class="ca-tot">${ps.length ? ps.filter(p => p.statut !== 'Absent').length : ''}</td>`; }).join('')}<td colspan="3"></td></tr></tfoot>
      </table></div>
      <div class="ca-legende"><span><i class="ca-pastille ca-p">•</i> Présent</span><span><i class="ca-pastille ca-a">A</i> Absent</span><span><i class="ca-pastille ca-r">R</i> Retard</span><span class="hint" style="margin:0;">Une absence saisie pour aujourd’hui prévient le parent.</span></div>
      <div class="signatures print-only"><div class="sign-box"><div class="sign-role">L’enseignant(e)</div><div class="sign-line">&nbsp;</div></div><div class="sign-box"><div class="sign-role">La Direction</div><div class="sign-line">&nbsp;</div></div></div>`}`}
    </div>
  </div>`;
}
// Appel du jour dans le cahier : mêmes champs (.sel-statut, data-motif) et même
// enregistrement que l'écran « Pointage élèves » — alerte aux parents incluse.
function renderAppelDuJour(classeId, eleves, date){
  const auj = date || todayISO();
  ui.filters.presEleves = { classeId, date: auj };
  if(DB.absencesSignalees === undefined){
    DB.absencesSignalees = null;
    chargerAbsencesSignalees().then(() => { if(ui.currentView === 'cahier-appel') renderView('cahier-appel'); }).catch(() => { DB.absencesSignalees = []; });
  }
  if(!eleves.length) return '<div class="empty-state"><div class="em-ic">📒</div>Aucun élève actif dans cette classe.</div>';
  const jourIso = ((new Date(auj + 'T12:00:00').getDay() + 6) % 7) + 1;
  const jourDeClasse = (DB.horairesAnnonces?.joursCours || [1, 2, 3, 4, 5]).includes(jourIso);
  const dejaFait = DB.presencesEleves.some(p => p.date === auj && p.classeId === classeId);
  const lignes = eleves.map(e => {
    const rec = DB.presencesEleves.find(p => p.eleveId === e.id && p.date === auj);
    const sig = absenceSignalee(e.id, auj);
    const statut = rec ? rec.statut : (sig ? 'Absent' : 'Présent');
    const motif = rec ? rec.motif : (sig ? sig.motif + (sig.commentaire ? ' — ' + sig.commentaire : '') : '');
    return `<li class="appel-ligne appel-${statut === 'Présent' ? 'present' : statut === 'Absent' ? 'absent' : 'retard'}" data-ligne="${e.id}">
      <div class="cj-eleve"><span class="lc-avatar" aria-hidden="true">${escapeHtml(initials(e.prenom, e.nom))}</span><span class="cj-nom"><strong>${escapeHtml(eleveFullName(e))}</strong>${sig ? `<small class="cj-signale">Absence signalée : ${escapeHtml(sig.motif)}</small>` : ''}</span></div>
      <div class="cj-etats" role="group" aria-label="Statut de ${escapeHtml(eleveFullName(e))}">${['Présent', 'Absent', 'Retard'].map(st => `<button type="button" class="cj-btn" data-s="${st}" onclick="choisirStatutAppel('${e.id}','${st}')">${st}</button>`).join('')}</div>
      <select class="sel-statut" data-eleve="${e.id}" hidden aria-hidden="true">${['Présent', 'Absent', 'Retard'].map(st => `<option ${statut === st ? 'selected' : ''}>${st}</option>`).join('')}</select>
      <input type="text" class="cj-motif" data-motif="${e.id}" placeholder="Motif (facultatif)" aria-label="Motif" value="${escapeHtml(motif || '')}">
    </li>`;
  }).join('');
  return `${!jourDeClasse ? `<div class="section-note">${auj === todayISO() ? 'Aujourd’hui n’est' : 'Ce jour n’est'} pas un jour de classe. Vous pouvez quand même faire l’appel si besoin.</div>` : ''}
    ${dejaFait ? `<div class="banniere-discrete" style="margin-bottom:10px;"><span>${icone('circle-check')}</span><span>L’appel ${auj === todayISO() ? 'd’aujourd’hui' : 'de ce jour'} est déjà enregistré. Vous pouvez le corriger puis valider à nouveau.</span></div>` : ''}
    <div class="cj-haut"><button type="button" class="btn secondary sm" onclick="tousPresents()">${icone('check')} Tous présents</button><span class="hint" style="margin:0;">${fmtDate(auj)}</span></div>
    <ul class="cj-liste">${lignes}</ul>
    <div class="cj-valider"><span class="appel-compteur" id="appelCompteur"></span><button type="button" class="btn" onclick="validerAppelDuJour()">Valider l’appel</button></div>
    ${(setTimeout(majCompteurAppel, 0), '')}`;
}
function choisirStatutAppel(eleveId, statut){
  const sel = document.querySelector(`.sel-statut[data-eleve="${eleveId}"]`); if(!sel) return;
  sel.value = statut;
  if(navigator.vibrate) try{ navigator.vibrate(10); }catch(_e){}
  majLigneAppel(eleveId);
}
async function validerAppelDuJour(){
  await savePresencesEleves();
  if(ui.currentView !== 'presences-eleves') renderView(ui.currentView);
}
async function basculerCahierAppel(eleveId, date){
  if(date > todayISO()) return;
  const e = eleveById(eleveId); if(!e) return;
  const rec = DB.presencesEleves.find(p => p.eleveId === eleveId && p.date === date);
  const suivant = CYCLE_APPEL[(CYCLE_APPEL.indexOf(rec ? rec.statut : '') + 1) % CYCLE_APPEL.length];
  try{
    if(!suivant){
      if(rec){ await dbDelete('presences_eleves', rec.id); DB.presencesEleves = DB.presencesEleves.filter(p => p.id !== rec.id); }
    } else if(rec){
      await dbUpdate('presences_eleves', rec.id, { statut: suivant }); rec.statut = suivant;
    } else {
      DB.presencesEleves.push(await dbInsert('presences_eleves', { date, classeId: e.classeId, eleveId, statut: suivant, motif: '' }));
    }
    if(suivant === 'Absent' && date === todayISO() && !absenceSignalee(eleveId, date)) envoyerNotificationAbsenceEleve(eleveId, date, '').catch(() => {});
    renderView('cahier-appel');
  }catch(err){ alert('Erreur : ' + err.message); }
}
async function exporterCahierAppel(){
  const f = ui.filters.cahier, jours = joursDeClasseDuMois(f.mois);
  const eleves = DB.eleves.filter(e => e.classeId === f.classeId && e.statut === 'Actif').sort((a, b) => eleveFullName(a).localeCompare(eleveFullName(b)));
  const lettre = s => s === 'Présent' ? 'P' : s === 'Absent' ? 'A' : s === 'Retard' ? 'R' : '';
  const lignes = [['Élève', ...jours.map(d => d.slice(8) + '/' + d.slice(5, 7)), 'Absences', 'Retards']];
  for(const e of eleves){
    const ps = DB.presencesEleves.filter(p => p.eleveId === e.id && p.date.startsWith(f.mois));
    lignes.push([eleveFullName(e), ...jours.map(d => lettre(ps.find(p => p.date === d)?.statut)), ps.filter(p => p.statut === 'Absent').length, ps.filter(p => p.statut === 'Retard').length]);
  }
  try{ await ecrireClasseurExcel([[`Appel ${f.mois}`, lignes]], `Cahier-appel_${classeName(f.classeId).replace(/\s+/g, '-')}_${f.mois}.xlsx`); }
  catch(err){ alert('Export impossible : ' + err.message); }
}
/* =====================================================================
   CERTIFICAT DE SCOLARITÉ (imprimable, depuis la fiche élève)
   ===================================================================== */
function ouvrirCertificatScolarite(eleveId){
  const e = eleveById(eleveId);
  if(!e) return;
  if(e.statut && e.statut !== 'Actif') return alert(`${eleveFullName(e)} n’est pas inscrit(e) actuellement (statut : ${e.statut}) : pas de certificat de scolarité.`);
  const m = DB.meta || {};
  const feminin = e.sexe === 'F';
  const signataire = m.directeurNom || '……………………………';
  const ville = (m.adresse || '').split(/[,–-]/).map(x => x.trim()).filter(Boolean).pop() || '……………';
  const numero = `CS-${String(m.anneeScolaire || new Date().getFullYear()).replace(/\s+/g, '')}-${e.matricule || e.id.slice(0, 6).toUpperCase()}`;
  openModal('📄 Certificat de scolarité', `
    <div class="recu certif">
      <div class="recu-head">
        ${m.logo ? `<img src="${m.logo}" alt="">` : `<div class="recu-logo-ph">🎓</div>`}
        <div><strong>${escapeHtml(m.nomEcole || '')}</strong>
          <div class="hint">${escapeHtml(m.adresse || '')}${m.telephone ? ' · ' + escapeHtml(m.telephone) : ''}</div></div>
      </div>
      <div class="recu-title">CERTIFICAT DE SCOLARITÉ</div>
      <div class="hint" style="text-align:center;margin:-6px 0 14px;">N° ${escapeHtml(numero)}</div>
      <p>Je soussigné(e), <strong>${escapeHtml(signataire)}</strong>, Directeur / Directrice de l’établissement <strong>${escapeHtml(m.nomEcole || '')}</strong>, certifie que :</p>
      <p style="text-align:center;font-size:1.15em;margin:14px 0;"><strong>${escapeHtml(String(e.nom || '').toUpperCase())} ${escapeHtml(e.prenom || '')}</strong></p>
      <p>${feminin ? 'née' : 'né'} le <strong>${e.dateNaissance ? fmtDate(e.dateNaissance) : '……………'}</strong>, matricule <strong>${escapeHtml(e.matricule || '—')}</strong>,
        est régulièrement ${feminin ? 'inscrite' : 'inscrit'} dans notre établissement en classe de <strong>${escapeHtml(classeName(e.classeId))}</strong>
        pour l’année scolaire <strong>${escapeHtml(m.anneeScolaire || '')}</strong>${e.dateInscription ? `, depuis le <strong>${fmtDate(e.dateInscription)}</strong>` : ''}.</p>
      <p>En foi de quoi, le présent certificat lui est délivré pour servir et valoir ce que de droit.</p>
      <p style="text-align:right;margin-top:18px;">Fait à ${escapeHtml(ville)}, le ${fmtDate(todayISO())}</p>
      <div class="signatures">
        <div class="sign-box"><div class="sign-role">Cachet de l’établissement</div><div class="sign-line">&nbsp;</div></div>
        <div class="sign-box"><div class="sign-role">Le Directeur / La Directrice</div><div class="sign-line">${escapeHtml(signataire)}</div></div>
      </div>
    </div>
    ${!e.dateNaissance ? '<div class="hint no-print" style="color:var(--amber);">⚠️ Date de naissance manquante sur la fiche : complétez-la avant d’imprimer.</div>' : ''}
    <div class="form-actions no-print"><button type="button" class="btn secondary" onclick="closeModal()">Fermer</button><button type="button" class="btn" onclick="window.print()">🖨️ Imprimer</button></div>`);
}
/* =====================================================================
   PRÉ-INSCRIPTIONS EN LIGNE (schema.sql section 71, page preinscription.html)
   ===================================================================== */
const STATUTS_PREINSCRIPTION = { nouvelle:['Nouvelle','amber'], contactee:['Contactée','blue'], inscrite:['Inscrite','green'], refusee:['Sans suite',''] };
function lienPreinscription(){ return new URL('preinscription.html?ecole=' + encodeURIComponent(session.ecoleId), location.href).href; }
function partagerPreinscription(){
  const lien = lienPreinscription();
  const message = `📝 Pré-inscriptions ouvertes à ${DB.meta?.nomEcole || 'notre école'} ! Remplissez le formulaire en ligne, nous vous rappelons : ${lien}`;
  openModal('📝 Lien de pré-inscription', `
    <p>Partagez ce lien sur WhatsApp, Facebook ou par SMS. Les familles remplissent le formulaire sans créer de compte ; les demandes arrivent ici, dans Élèves & Inscriptions.</p>
    <div class="hint" style="word-break:break-all;user-select:all;">${escapeHtml(lien)}</div>
    <div class="form-actions" style="flex-wrap:wrap;">
      <button class="btn secondary" onclick="navigator.clipboard && navigator.clipboard.writeText('${lien}').then(() => toast('Lien copié'))">📋 Copier le lien</button>
      <a class="btn" href="https://wa.me/?text=${encodeURIComponent(message)}" target="_blank" rel="noopener">📲 Partager sur WhatsApp</a>
      <a class="btn secondary" href="${lien}" target="_blank" rel="noopener">👁️ Voir le formulaire</a>
      <button class="btn secondary" onclick="imprimerAffiche('preinscription.html')">🖨️ Affiche A4</button>
    </div>`);
}
function renderPreinscriptions(){
  if(!['secretariat','direction','fondation'].includes(ui.role)) return '';
  if(DB.preinscriptions === undefined){
    DB.preinscriptions = null;
    sb.from('preinscriptions').select('*').eq('ecole_id', session.ecoleId).order('created_at', { ascending:false }).limit(200)
      .then(({ data }) => { DB.preinscriptions = rowsToCamel(data || []); if(ui.currentView === 'eleves') renderView('eleves'); });
  }
  const tous = ui.filters.preinscriptionsToutes;
  const liste = (DB.preinscriptions || []).filter(p => tous || p.statut === 'nouvelle' || p.statut === 'contactee');
  const nouvelles = (DB.preinscriptions || []).filter(p => p.statut === 'nouvelle').length;
  return `<div class="panel">
    <div class="panel-head"><div><h2>📥 Pré-inscriptions en ligne${nouvelles ? ` <span class="badge amber">${nouvelles} nouvelle(s)</span>` : ''}</h2><div class="sub">Les familles remplissent le formulaire public ; rappelez-les puis « Inscrire » pour créer la fiche.</div></div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;"><button class="btn sm" onclick="partagerPreinscription()">📝 Lien à partager</button>
      ${(DB.preinscriptions || []).length ? `<button class="btn secondary sm" onclick="ui.filters.preinscriptionsToutes=${!tous}; renderView('eleves')">${tous ? 'En cours seulement' : 'Tout afficher'}</button>` : ''}</div></div>
    ${DB.preinscriptions === null ? '<div class="hint">Chargement…</div>' : !liste.length ? '<div class="hint">Aucune demande en cours. Partagez le lien pour recevoir des pré-inscriptions.</div>' : `<div class="table-wrap"><table>
      <thead><tr><th>Enfant</th><th>Parent</th><th>Statut</th><th></th></tr></thead>
      <tbody>${liste.map(p => { const st = STATUTS_PREINSCRIPTION[p.statut] || ['', '']; const tels = telephonesWhatsapp(p.parentTel); return `<tr>
        <td><strong>${escapeHtml(p.enfantPrenom)} ${escapeHtml(p.enfantNom)}</strong><br><span class="hint">${p.classeSouhaitee ? escapeHtml(p.classeSouhaitee) + ' · ' : ''}${p.dateNaissance ? 'né(e) le ' + fmtDate(p.dateNaissance) + ' · ' : ''}reçue le ${fmtDate(String(p.createdAt).slice(0, 10))}</span>${p.message ? `<br><span class="hint">« ${escapeHtml(p.message)} »</span>` : ''}</td>
        <td>${escapeHtml(p.parentNom)}<br><a href="tel:${escapeHtml(p.parentTel.replace(/[^\d+]/g, ''))}">${escapeHtml(p.parentTel)}</a></td>
        <td><span class="badge ${st[1]}">${st[0]}</span></td>
        <td style="white-space:nowrap;">
          ${tels.length ? `<a class="btn secondary sm" target="_blank" rel="noopener" onclick="statutPreinscription('${p.id}','contactee', true)" href="https://wa.me/${tels[0]}?text=${encodeURIComponent(`Bonjour ${p.parentNom}, ici ${DB.meta?.nomEcole || 'l’école'}. Nous avons bien reçu la pré-inscription de ${p.enfantPrenom}. `)}">📲</a>` : ''}
          ${p.statut !== 'inscrite' ? `<button class="btn sm" onclick="inscrireDepuisPreinscription('${p.id}')">Inscrire</button>` : ''}
          ${p.statut === 'nouvelle' || p.statut === 'contactee' ? `<button class="btn secondary sm" title="Sans suite" onclick="statutPreinscription('${p.id}','refusee')">✕</button>` : ''}
        </td></tr>`; }).join('')}</tbody></table></div>`}
  </div>`;
}
async function statutPreinscription(id, statut, silencieux){
  const p = (DB.preinscriptions || []).find(x => x.id === id);
  if(!p || (silencieux && p.statut !== 'nouvelle')) return;
  if(statut === 'refusee' && !confirm('Classer cette demande sans suite ?')) return;
  try{
    const { error } = await exigerEffet(sb.from('preinscriptions').update({ statut }).eq('id', id));
    if(error) throw error;
    p.statut = statut;
    if(!silencieux) toast('Demande mise à jour');
    renderView('eleves');
  }catch(e){ alert('Erreur : ' + e.message); }
}
function inscrireDepuisPreinscription(id){
  const p = (DB.preinscriptions || []).find(x => x.id === id);
  if(!p) return;
  openEleveForm(null);
  ui._preinscriptionId = id;
  const f = document.getElementById('formEleve');
  if(!f) return;
  const mettre = (nom, v) => { const c = f.querySelector(`[name="${nom}"]`); if(c && v) c.value = v; };
  mettre('prenom', p.enfantPrenom); mettre('nom', p.enfantNom); mettre('sexe', p.sexe); mettre('dateNaissance', p.dateNaissance);
  mettre('parentNom', p.parentNom); mettre('parentTel', p.parentTel);
  const classe = DB.classes.find(c => c.nom === p.classeSouhaitee);
  if(classe) mettre('classeId', classe.id);
  toast('Fiche pré-remplie : vérifiez puis enregistrez');
}
/* =====================================================================
   MENU DE LA CANTINE (schema.sql section 70)
   ===================================================================== */
function joursSemaineCantine(decalage){
  const lundi = debutSemaine(new Date()); lundi.setDate(lundi.getDate() + 7 * (decalage || 0));
  return [0, 1, 2, 3, 4].map(i => { const d = new Date(lundi); d.setDate(lundi.getDate() + i); return isoLocal(d); });
}
function renderCantine(){
  const dec = ui.filters.cantineSemaine || 0;
  const jours = joursSemaineCantine(dec);
  const cle = jours[0];
  DB.menusCantine = (DB.menusCantine && !Array.isArray(DB.menusCantine)) ? DB.menusCantine : {};
  if(DB.menusCantine[cle] === undefined){
    DB.menusCantine[cle] = null;
    sb.from('menus_cantine').select('*').eq('ecole_id', session.ecoleId).gte('date', jours[0]).lte('date', jours[4])
      .then(({ data }) => { DB.menusCantine[cle] = rowsToCamel(data || []); if(ui.currentView === 'cantine') renderView('cantine'); });
  }
  const menus = DB.menusCantine[cle];
  const gestion = ['secretariat','direction','fondation'].includes(ui.role);
  const jourLong = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('fr-FR', { weekday:'long', day:'numeric', month:'long' });
  return `<div class="view active"><div class="panel">
    <div class="panel-head"><div><h2>🍽️ Menu de la semaine</h2><div class="sub">Du ${fmtDate(jours[0])} au ${fmtDate(jours[4])} — les parents voient le menu du jour et du lendemain sur l’accueil de leur application.</div></div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;">
        <button class="btn secondary sm" onclick="ui.filters.cantineSemaine=${dec - 1}; renderView('cantine')">← Semaine précédente</button>
        ${dec !== 0 ? `<button class="btn secondary sm" onclick="ui.filters.cantineSemaine=0; renderView('cantine')">Cette semaine</button>` : ''}
        <button class="btn secondary sm" onclick="ui.filters.cantineSemaine=${dec + 1}; renderView('cantine')">Semaine suivante →</button></div></div>
    ${menus === null ? '<div class="hint">Chargement…</div>' : `<form onsubmit="return enregistrerMenusCantine(event, '${cle}')">
      <div class="table-wrap"><table>
        <thead><tr><th>Jour</th><th>Repas</th><th>Goûter</th></tr></thead>
        <tbody>${jours.map(iso => { const m = menus.find(x => x.date === iso) || {}; return `<tr>
          <td style="white-space:nowrap;text-transform:capitalize;">${jourLong(iso)}</td>
          <td><input name="repas_${iso}" maxlength="300" value="${escapeHtml(m.repas || '')}" placeholder="Ex : Riz sauce graine, poisson" ${gestion ? '' : 'disabled'}></td>
          <td><input name="gouter_${iso}" maxlength="200" value="${escapeHtml(m.gouter || '')}" placeholder="Ex : Banane, bouillie" ${gestion ? '' : 'disabled'}></td>
        </tr>`; }).join('')}</tbody></table></div>
      ${gestion ? `<label style="display:flex;align-items:center;gap:8px;margin-top:8px;"><input type="checkbox" name="prevenir"> Prévenir les parents par une notification (« le menu de la semaine est en ligne »)</label>
      <div class="form-actions"><button type="button" class="btn secondary" onclick="copierMenusSemainePrecedente()">Copier la semaine précédente</button><button class="btn" type="submit">Enregistrer le menu</button></div>` : ''}
    </form>`}
  </div></div>`;
}
async function enregistrerMenusCantine(ev, cle){
  ev.preventDefault();
  const fd = new FormData(ev.target);
  const jours = joursSemaineCantine(ui.filters.cantineSemaine || 0);
  const pleins = [], vides = [];
  jours.forEach(iso => {
    const repas = (fd.get('repas_' + iso) || '').trim(), gouter = (fd.get('gouter_' + iso) || '').trim();
    if(repas || gouter) pleins.push({ date: iso, repas, gouter, maj_at: new Date().toISOString() }); else vides.push(iso);
  });
  try{
    if(pleins.length){ const { error } = await sb.from('menus_cantine').upsert(pleins.map(p => ({ ...p, ecole_id: session.ecoleId }))); if(error) throw error; }
    if(vides.length){ const { error } = await sb.from('menus_cantine').delete().eq('ecole_id', session.ecoleId).in('date', vides); if(error) throw error; }
    DB.menusCantine[cle] = pleins.map(p => ({ date: p.date, repas: p.repas, gouter: p.gouter }));
    if(fd.get('prevenir') === 'on' && pleins.length){
      notifierParentsPush(DB.eleves.filter(e => e.statut === 'Actif').map(e => e.id), `🍽️ Le menu de la cantine du ${fmtDate(jours[0])} au ${fmtDate(jours[4])} est en ligne dans l’application.`);
    }
    toast('Menu enregistré'); renderView('cantine');
  }catch(e){ alert('Erreur : ' + e.message); }
  return false;
}
async function copierMenusSemainePrecedente(){
  const dec = ui.filters.cantineSemaine || 0;
  const avant = joursSemaineCantine(dec - 1), cible = joursSemaineCantine(dec);
  try{
    const { data, error } = await sb.from('menus_cantine').select('*').eq('ecole_id', session.ecoleId).gte('date', avant[0]).lte('date', avant[4]);
    if(error) throw error;
    if(!data || !data.length) return alert('La semaine précédente n’a pas de menu.');
    data.forEach(m => {
      const i = avant.indexOf(m.date); if(i < 0) return;
      const r = document.querySelector(`[name="repas_${cible[i]}"]`), g = document.querySelector(`[name="gouter_${cible[i]}"]`);
      if(r && !r.value) r.value = m.repas || '';
      if(g && !g.value) g.value = m.gouter || '';
    });
    toast('Menus copiés — vérifiez puis enregistrez');
  }catch(e){ alert('Erreur : ' + e.message); }
}
// Console parent : menu du jour et du prochain jour de classe
function renderMenuParent(){
  const menus = DB.menusCantine;
  if(!Array.isArray(menus) || !menus.length) return '';
  const auj = todayISO(), demain = prochainJourClasse();
  const libDemain = demain === isoDansJours(1) ? 'Demain' : new Date(demain + 'T12:00:00').toLocaleDateString('fr-FR', { weekday:'long' });
  const liste = [[auj, 'Aujourd’hui'], [demain, libDemain]].map(([iso, lib]) => ({ lib, m: menus.find(x => x.date === iso) })).filter(x => x.m);
  if(!liste.length) return '';
  return `<section class="panel actus-panel" aria-labelledby="titreMenu">
    <div class="panel-head"><div><h2 id="titreMenu">🍽️ À la cantine</h2></div></div>
    ${liste.map(({ lib, m }) => `<div class="menu-jour"><span class="menu-lib">${escapeHtml(lib)}</span>
      <div>${m.repas ? `🍛 ${escapeHtml(m.repas)}` : ''}${m.gouter ? `<div class="hint" style="margin:2px 0 0;">🍌 Goûter : ${escapeHtml(m.gouter)}</div>` : ''}</div></div>`).join('')}
  </section>`;
}
/* =====================================================================
   ÉLÈVES À SURVEILLER : absences répétées (tableau de bord)
   3 absences ou plus sur les 30 derniers jours, ou absent aux 2 derniers
   appels de sa classe. Bouton WhatsApp (gratuit) pour joindre le parent.
   ===================================================================== */
function elevesASurveiller(){
  const ids = classesVisibles().map(c => c.id);
  const depuis = new Date(); depuis.setDate(depuis.getDate() - 30);
  const limite = `${depuis.getFullYear()}-${String(depuis.getMonth()+1).padStart(2,'0')}-${String(depuis.getDate()).padStart(2,'0')}`;
  const recentes = DB.presencesEleves.filter(p => p.date >= limite);
  return DB.eleves.filter(e => e.statut === 'Actif' && ids.includes(e.classeId)).map(e => {
    const siennes = recentes.filter(p => p.eleveId === e.id).sort((a, b) => b.date.localeCompare(a.date));
    const absences = siennes.filter(p => p.statut === 'Absent');
    const signalees = absences.filter(p => absenceSignalee(e.id, p.date)).length;
    const suite = siennes.length >= 2 && siennes[0].statut === 'Absent' && siennes[1].statut === 'Absent';
    return { e, absences: absences.length, signalees, suite, derniere: absences[0]?.date };
  }).filter(x => x.absences >= 3 || x.suite).sort((a, b) => b.absences - a.absences);
}
function renderElevesASurveiller(){
  if(!['enseignant','secretariat','direction','fondation'].includes(ui.role)) return '';
  if(DB.absencesSignalees === undefined){ DB.absencesSignalees = null; chargerAbsencesSignalees().then(() => { if(ui.currentView === 'dashboard') renderView('dashboard'); }).catch(() => { DB.absencesSignalees = []; }); }
  const liste = elevesASurveiller();
  if(!liste.length) return '';
  const admin = ui.role !== 'enseignant';
  return `<div class="panel">
    <div class="panel-head"><div><h2>Élèves à surveiller <span class="mer-score">${liste.length}</span></h2><div class="sub">Absences répétées sur 30 jours. Un petit message au parent suffit souvent.</div></div></div>
    <ul class="liste-compacte">${liste.map(x => `<li class="lc-ligne">
        <span class="lc-avatar" aria-hidden="true">${escapeHtml(initials(x.e.prenom, x.e.nom))}</span>
        <span class="lc-corps"><strong>${escapeHtml(eleveFullName(x.e))}</strong>
          <span>${escapeHtml(classeName(x.e.classeId))} · ${x.absences} absence${x.absences > 1 ? 's' : ''} en 30 jours${x.derniere ? ' · dernière le ' + fmtDate(x.derniere).slice(0, 5) : ''}${x.signalees ? ` · ${x.signalees} signalée${x.signalees > 1 ? 's' : ''} par le parent` : ''}</span>
          ${x.suite ? '<span class="badge-etat erreur">Absent(e) aux 2 derniers appels</span>' : ''}</span>
        ${admin ? (telephonesWhatsapp(x.e.parentTel).length ? `<button class="btn secondary sm" onclick="contacterParentAbsences('${x.e.id}', ${x.absences})">Contacter</button>` : '<span class="hint">Pas de numéro</span>') : ''}
      </li>`).join('')}</ul>
  </div>`;
}
function contacterParentAbsences(eleveId, nb){
  const e = eleveById(eleveId);
  if(!e) return;
  const message = `Bonjour, ici ${DB.meta?.nomEcole || 'l’école'}. Nous avons remarqué que ${e.prenom} a été absent(e) ${nb} fois ces dernières semaines. Tout va bien ? N’hésitez pas à nous contacter. Merci !`;
  ouvrirEnvoiWhatsapp(`📲 Parent de ${eleveFullName(e)}`, telephonesWhatsapp(e.parentTel), message, 'WhatsApp s’ouvrira au numéro du parent avec ce message (gratuit) :');
}
/* =====================================================================
   CORRECTIONS DE FICHE PROPOSÉES PAR LES PARENTS (schema.sql section 68)
   ===================================================================== */
const CHAMPS_CORRECTION = {
  date_naissance: { lib:'Date de naissance', cle:'dateNaissance', type:'date' },
  parent_nom: { lib:'Nom du parent', cle:'parentNom', type:'text' },
  parent_tel: { lib:'Téléphone du parent', cle:'parentTel', type:'tel' },
  parent_adresse: { lib:'Adresse', cle:'parentAdresse', type:'text' },
};
function valeurLisible(champ, v){ return champ === 'date_naissance' && v ? fmtDate(v) : (v || '—'); }
// Console parent
function renderLienCorrection(e){
  const attente = (DB.correctionsFiches || []).filter(c => c.eleveId === e.id && c.statut === 'en_attente').length;
  return `<div style="margin:4px 0 8px;">${attente ? '<span class="hint">✏️ Votre correction a été envoyée : l’école va la vérifier.</span>'
    : `<button type="button" class="btn secondary sm" onclick="ouvrirCorrectionFiche('${e.id}')">✏️ Signaler une erreur sur la fiche</button>`}</div>`;
}
function ouvrirCorrectionFiche(eleveId){
  const e = (DB.eleves || []).find(x => x.id === eleveId);
  if(!e) return;
  openModal('✏️ Corriger la fiche de ' + e.prenom, `
    <p class="hint" style="margin-top:0;">Modifiez seulement ce qui est faux. L’école vérifie avant d’enregistrer.</p>
    <form onsubmit="return envoyerCorrectionFiche(event, '${e.id}')">
      ${Object.entries(CHAMPS_CORRECTION).map(([k, c]) => `<div class="field"><label>${c.lib}</label><input name="${k}" type="${c.type}" maxlength="200" value="${escapeHtml(e[c.cle] || '')}"${c.type === 'date' ? ` max="${todayISO()}"` : ''}></div>`).join('')}
      <div class="field"><label>Précision (facultatif)</label><input name="commentaire" maxlength="300" placeholder="Ex : voir l’extrait de naissance"></div>
      <button class="btn" type="submit" style="width:100%;">Envoyer à l’école</button>
    </form>`);
}
async function envoyerCorrectionFiche(ev, eleveId){
  ev.preventDefault();
  const e = (DB.eleves || []).find(x => x.id === eleveId);
  const fd = new FormData(ev.target);
  const champs = {};
  Object.entries(CHAMPS_CORRECTION).forEach(([k, c]) => { const v = (fd.get(k) || '').trim(); if(v && v !== (e[c.cle] || '')) champs[k] = v; });
  if(!Object.keys(champs).length) return alert('Vous n’avez rien modifié.'), false;
  try{
    const { data, error } = await sb.from('corrections_fiches').insert({ eleve_id: eleveId, champs, commentaire: (fd.get('commentaire') || '').trim() }).select().single();
    if(error) throw error;
    DB.correctionsFiches = (DB.correctionsFiches || []).concat(rowToCamel(data));
    sb.functions.invoke('notifier-personnel', { body: { type: 'correction' } }).catch(() => {});
    closeModal(); toast('Correction envoyée à l’école'); renderView(ui.currentView);
  }catch(err){ alert('Erreur : ' + err.message); }
  return false;
}
// École : corrections à valider (Élèves & Inscriptions)
function renderCorrectionsParents(){
  if(!['secretariat','direction','fondation'].includes(ui.role)) return '';
  if(DB.correctionsFiches === undefined){
    DB.correctionsFiches = null;
    sb.from('corrections_fiches').select('*').eq('ecole_id', session.ecoleId).eq('statut', 'en_attente').order('created_at')
      .then(({ data }) => { DB.correctionsFiches = rowsToCamel(data || []); if(ui.currentView === 'eleves' && DB.correctionsFiches.length) renderView('eleves'); });
  }
  const liste = (DB.correctionsFiches || []).filter(c => c.statut === 'en_attente');
  if(!liste.length) return '';
  return `<div class="panel">
    <div class="panel-head"><div><h2>✏️ Corrections proposées par les parents (${liste.length})</h2><div class="sub">Vérifiez avec les documents de l’élève, puis appliquez : la fiche est mise à jour.</div></div></div>
    <div class="table-wrap"><table>
      <thead><tr><th>Élève</th><th>Changement demandé</th><th></th></tr></thead>
      <tbody>${liste.map(c => { const e = eleveById(c.eleveId); return `<tr>
        <td>${e ? escapeHtml(eleveFullName(e)) : '—'}<br><span class="hint">${e ? escapeHtml(classeName(e.classeId)) : ''} · ${fmtDate(String(c.createdAt).slice(0, 10))}</span></td>
        <td>${Object.entries(c.champs || {}).map(([k, v]) => `<div><strong>${escapeHtml(CHAMPS_CORRECTION[k]?.lib || k)} :</strong> <span class="hint">${escapeHtml(valeurLisible(k, e ? e[CHAMPS_CORRECTION[k]?.cle] : ''))}</span> → <strong>${escapeHtml(valeurLisible(k, v))}</strong></div>`).join('')}${c.commentaire ? `<div class="hint">« ${escapeHtml(c.commentaire)} »</div>` : ''}</td>
        <td style="white-space:nowrap;"><button class="btn sm" onclick="traiterCorrectionFiche('${c.id}', true)">✓ Appliquer</button> <button class="btn secondary sm" onclick="traiterCorrectionFiche('${c.id}', false)">Refuser</button></td>
      </tr>`; }).join('')}</tbody></table></div>
  </div>`;
}
async function traiterCorrectionFiche(id, appliquer){
  const c = (DB.correctionsFiches || []).find(x => x.id === id);
  if(!c) return;
  if(!appliquer && !confirm('Refuser cette correction ? La fiche reste inchangée.')) return;
  try{
    if(appliquer){
      const champs = {};
      Object.entries(c.champs || {}).forEach(([k, v]) => { if(CHAMPS_CORRECTION[k]) champs[k] = v; });
      const { error } = await exigerEffet(sb.from('eleves').update(champs).eq('id', c.eleveId));
      if(error) throw error;
      const e = eleveById(c.eleveId);
      if(e) Object.entries(champs).forEach(([k, v]) => { e[CHAMPS_CORRECTION[k].cle] = v; });
    }
    const { error: err2 } = await exigerEffet(sb.from('corrections_fiches').update({ statut: appliquer ? 'appliquee' : 'refusee', traite_at: new Date().toISOString() }).eq('id', id));
    if(err2) throw err2;
    c.statut = appliquer ? 'appliquee' : 'refusee';
    toast(appliquer ? 'Fiche mise à jour' : 'Correction refusée'); renderView('eleves');
  }catch(e){ alert('Erreur : ' + e.message); }
}
/* =====================================================================
   SÉCURITÉ ET SANTÉ DE L'ÉLÈVE (schema.sql section 66)
   Le parent (ou le secrétariat) indique les personnes autorisées à venir
   chercher l'enfant et ses informations de santé. Le portier ne voit que
   le nom et le lien des personnes autorisées, après son signalement.
   ===================================================================== */
const LIENS_AUTORISES = ['Père','Mère','Grand-père','Grand-mère','Oncle','Tante','Frère','Sœur','Tuteur','Chauffeur','Nounou','Voisin(e)'];
function personnesDe(eleveId){ return (DB.personnesAutorisees || []).filter(p => p.eleveId === eleveId); }
function santeDe(eleveId){ return (DB.santeEleves || []).find(s => s.eleveId === eleveId) || null; }
// Personnel : chargement unique (RLS : élèves visibles seulement)
function chargerSecuriteEleves(){
  if(DB.santeEleves !== undefined) return;
  DB.santeEleves = null; DB.personnesAutorisees = DB.personnesAutorisees || [];
  Promise.all([sb.from('sante_eleves').select('*').eq('ecole_id', session.ecoleId), sb.from('personnes_autorisees').select('*').eq('ecole_id', session.ecoleId)])
    .then(([s, p]) => { DB.santeEleves = rowsToCamel(s.data || []); DB.personnesAutorisees = rowsToCamel(p.data || []); if(['dashboard','eleves'].includes(ui.currentView)) renderView(ui.currentView); })
    .catch(() => { DB.santeEleves = []; });
}
// Console parent : résumé sur la fiche de l'enfant
function renderSecuriteEnfant(e){
  const pers = personnesDe(e.id), sante = santeDe(e.id);
  return `<div class="enfant-secu">
    <div><strong>🛡️ Peuvent venir le chercher :</strong> ${pers.length ? pers.map(p => `${escapeHtml(p.nom)}${p.lien ? ` <span class="hint">(${escapeHtml(p.lien)})</span>` : ''}`).join(', ') : '<span class="hint">personne d’autre que vous n’est indiqué</span>'}</div>
    ${sante && sante.allergies ? `<div><strong>⚕️ Allergies :</strong> ${escapeHtml(sante.allergies)}</div>` : ''}
    <button type="button" class="btn secondary sm" onclick="ouvrirSecuriteEleve('${e.id}')">${pers.length || sante ? 'Mettre à jour' : 'Indiquer les personnes autorisées et la santé'}</button>
  </div>`;
}
async function ouvrirSecuriteEleve(eleveId){
  const e = (DB.eleves || []).find(x => x.id === eleveId);
  openModal('🛡️ Sécurité & santé', '<div class="hint">Chargement…</div>');
  try{
    const [p, s] = await Promise.all([
      sb.from('personnes_autorisees').select('*').eq('eleve_id', eleveId).order('created_at'),
      sb.from('sante_eleves').select('*').eq('eleve_id', eleveId).maybeSingle(),
    ]);
    if(p.error) throw p.error;
    DB.personnesAutorisees = (DB.personnesAutorisees || []).filter(x => x.eleveId !== eleveId).concat(rowsToCamel(p.data || []));
    DB.santeEleves = (DB.santeEleves || []).filter(x => x.eleveId !== eleveId).concat(s.data ? [rowToCamel(s.data)] : []);
  }catch(err){ $('#modalBody').innerHTML = `<div class="hint">Erreur : ${escapeHtml(err.message)}</div>`; return; }
  afficherSecuriteEleve(e || { id: eleveId, prenom: '', nom: '' });
}
function afficherSecuriteEleve(e){
  const pers = personnesDe(e.id), sante = santeDe(e.id) || {};
  openModal('🛡️ Sécurité & santé — ' + eleveFullName(e), `
    <h4 style="margin:0 0 6px;">Personnes autorisées à venir chercher ${escapeHtml(e.prenom || 'l’enfant')}</h4>
    <p class="hint" style="margin-top:0;">Le portier voit leur nom et leur lien quand il signale l’arrivée d’un parent (jamais leur téléphone).</p>
    ${pers.length ? pers.map(p => `<div class="actu-carte" style="justify-content:space-between;margin-bottom:6px;"><div class="actu-corps"><div class="actu-titre">${escapeHtml(p.nom)}${p.lien ? ` <span class="hint">(${escapeHtml(p.lien)})</span>` : ''}</div>${p.telephone ? `<div class="actu-meta">${escapeHtml(p.telephone)}</div>` : ''}</div>
      <button class="icon-btn danger" title="Retirer" onclick="supprimerPersonneAutorisee('${p.id}', '${e.id}')">🗑️</button></div>`).join('') : '<div class="hint">Aucune personne indiquée pour l’instant.</div>'}
    <form onsubmit="return ajouterPersonneAutorisee(event, '${e.id}')" style="margin-top:8px;">
      <div class="form-grid">
        <div class="field"><label>Nom et prénom</label><input name="nom" required minlength="2" maxlength="120" placeholder="Ex : KOUASSI Marie"></div>
        <div class="field"><label>Lien avec l’enfant</label><input name="lien" maxlength="60" list="listeLiensAutorises" placeholder="Ex : Tante"><datalist id="listeLiensAutorises">${LIENS_AUTORISES.map(l => `<option value="${l}">`).join('')}</datalist></div>
        <div class="field span2"><label>Téléphone (facultatif)</label><input name="telephone" type="tel" maxlength="30" placeholder="Ex : 07 00 00 00 00"></div>
      </div>
      <div class="form-actions"><button class="btn secondary" type="submit">+ Ajouter cette personne</button></div>
    </form>
    <h4 style="margin:var(--sp-4) 0 6px;">⚕️ Santé</h4>
    <p class="hint" style="margin-top:0;">Visible seulement par vous, l’administration de l’école et l’enseignant de la classe.</p>
    <form onsubmit="return enregistrerSanteEleve(event, '${e.id}')">
      <div class="field"><label>Allergies</label><input name="allergies" maxlength="300" value="${escapeHtml(sante.allergies || '')}" placeholder="Ex : arachides, pénicilline — ou laissez vide"></div>
      <div class="field"><label>Autres informations utiles</label><textarea name="infos" maxlength="1000" rows="3" placeholder="Ex : asthme (ventoline dans le sac), lunettes, médecin traitant…">${escapeHtml(sante.infos || '')}</textarea></div>
      <div class="form-actions"><button class="btn" type="submit">Enregistrer la santé</button></div>
    </form>`);
}
function apresMajSecurite(e){
  afficherSecuriteEleve(e);
  if(ui.role === 'parent') renderView(ui.currentView);
}
async function ajouterPersonneAutorisee(ev, eleveId){
  ev.preventDefault();
  const fd = new FormData(ev.target);
  const e = (DB.eleves || []).find(x => x.id === eleveId) || { id: eleveId };
  try{
    const { data, error } = await sb.from('personnes_autorisees').insert({ eleve_id: eleveId, nom: fd.get('nom').trim(), lien: (fd.get('lien') || '').trim(), telephone: (fd.get('telephone') || '').trim() }).select().single();
    if(error) throw error;
    DB.personnesAutorisees = (DB.personnesAutorisees || []).concat(rowToCamel(data));
    toast('Personne ajoutée'); apresMajSecurite(e);
  }catch(err){ alert('Erreur : ' + err.message); }
  return false;
}
async function supprimerPersonneAutorisee(id, eleveId){
  if(!confirm('Retirer cette personne de la liste ?')) return;
  const e = (DB.eleves || []).find(x => x.id === eleveId) || { id: eleveId };
  try{
    const { error } = await exigerEffet(sb.from('personnes_autorisees').delete().eq('id', id));
    if(error) throw error;
    DB.personnesAutorisees = (DB.personnesAutorisees || []).filter(p => p.id !== id);
    toast('Personne retirée'); apresMajSecurite(e);
  }catch(err){ alert('Erreur : ' + err.message); }
}
async function enregistrerSanteEleve(ev, eleveId){
  ev.preventDefault();
  const fd = new FormData(ev.target);
  const e = (DB.eleves || []).find(x => x.id === eleveId) || { id: eleveId };
  try{
    const { data, error } = await sb.from('sante_eleves').upsert({ eleve_id: eleveId, allergies: (fd.get('allergies') || '').trim(), infos: (fd.get('infos') || '').trim(), maj_at: new Date().toISOString() }).select().single();
    if(error) throw error;
    DB.santeEleves = (DB.santeEleves || []).filter(s => s.eleveId !== eleveId).concat(rowToCamel(data));
    toast('Santé enregistrée'); apresMajSecurite(e);
  }catch(err){ alert('Erreur : ' + err.message); }
  return false;
}
// Portier : après le signalement, affiche qui peut venir chercher l'enfant
async function afficherAutorisesPortier(eleveId){
  const zone = document.getElementById('gateAutorises');
  if(!zone) return;
  try{
    const { data, error } = await sb.rpc('personnes_autorisees_portier', { p_eleve: eleveId });
    if(error) throw error;
    zone.innerHTML = data && data.length
      ? `<div class="gate-autorises"><strong>🛡️ Peuvent venir chercher l’enfant :</strong><ul>${data.map(p => `<li>${escapeHtml(p.nom)}${p.lien ? ` — ${escapeHtml(p.lien)}` : ''}</li>`).join('')}</ul><span>et les parents. En cas de doute, appelez l’administration.</span></div>`
      : '';
  }catch(_e){ zone.innerHTML = ''; }
}
/* =====================================================================
   ANNIVERSAIRES DES ÉLÈVES (schema.sql section 65)
   Tableau de bord : anniversaires des 7 prochains jours ; console parent :
   bandeau le jour J ; vœux automatiques de l'école à 8h (annoncer-horaires).
   ===================================================================== */
// Jours avant le prochain anniversaire (0 = aujourd'hui), null si date inconnue
function joursAvantAnniversaire(dateNaissance){
  if(!dateNaissance || !/^\d{4}-\d{2}-\d{2}/.test(dateNaissance)) return null;
  const auj = new Date(todayISO() + 'T12:00:00');
  const [, m, j] = dateNaissance.slice(0, 10).split('-').map(Number);
  const prochaine = (an) => { const d = new Date(an, m - 1, j, 12); if(d.getMonth() !== m - 1) d.setDate(0); return d; }; // 29 février → 28
  let d = prochaine(auj.getFullYear());
  if(d < auj) d = prochaine(auj.getFullYear() + 1);
  return Math.round((d - auj) / 86400000);
}
function ageAnniversaire(dateNaissance, jours){
  const d = new Date(todayISO() + 'T12:00:00'); d.setDate(d.getDate() + (jours || 0));
  return d.getFullYear() - Number(dateNaissance.slice(0, 4));
}
function renderAnniversaires(){
  if(!['enseignant','secretariat','direction','fondation'].includes(ui.role)) return '';
  const ids = classesVisibles().map(c => c.id);
  const liste = DB.eleves.filter(e => e.statut === 'Actif' && ids.includes(e.classeId))
    .map(e => ({ e, j: joursAvantAnniversaire(e.dateNaissance) }))
    .filter(x => x.j !== null && x.j <= 7 && ageAnniversaire(x.e.dateNaissance, x.j) > 0 && ageAnniversaire(x.e.dateNaissance, x.j) < 30)
    .sort((a, b) => a.j - b.j);
  if(!liste.length) return '';
  const quand = (j) => j === 0 ? '<strong>aujourd’hui</strong>' : j === 1 ? 'demain' : new Date(Date.now() + j * 86400000).toLocaleDateString('fr-FR', {weekday:'long', day:'numeric'});
  return `<div class="panel">
    <div class="panel-head"><div><h2>🎂 Anniversaires de la semaine</h2>${DB.meta?.voeuxAnniversaire !== false ? '<div class="sub">Le jour J, les parents reçoivent automatiquement les vœux de l’école à 8h.</div>' : ''}</div></div>
    <div class="mj-grille">${liste.map(({ e, j }) => `<div class="mj-classe"${j === 0 ? ' style="border-color:var(--amber, #d4a017);"' : ''}>
      <div class="mj-tete"><strong>${j === 0 ? '🎉 ' : ''}${escapeHtml(eleveFullName(e))}</strong><span class="hint" style="margin:0;">${escapeHtml(classeName(e.classeId))}</span></div>
      <div class="mj-ligne">${ageAnniversaire(e.dateNaissance, j)} ans ${quand(j)}</div></div>`).join('')}</div>
  </div>`;
}
// Console parent : bandeau sur la fiche de l'enfant le jour de son anniversaire
function renderAnniversaireEnfant(e){
  if(joursAvantAnniversaire(e.dateNaissance) !== 0) return '';
  const age = ageAnniversaire(e.dateNaissance, 0);
  return `<div class="enfant-anniv" role="note">🎂 Joyeux anniversaire ${escapeHtml(e.prenom)}${age > 0 && age < 30 ? ` — ${age} ans` : ''} ! <span>Toute l’équipe ${DB.meta?.nomEcole ? 'de ' + escapeHtml(DB.meta.nomEcole) : 'de l’école'} lui souhaite une très belle journée.</span></div>`;
}
async function reglerOptionEcole(colonne, cle, actif, libelle){
  try{
    const { error } = await exigerEffet(sb.from('ecoles').update({ [colonne]: actif }).eq('id', session.ecoleId));
    if(error) throw error;
    DB.meta[cle] = actif;
    toast(`${libelle} : ${actif ? 'activé' : 'désactivé'}`);
  }catch(e){ alert('Erreur : ' + e.message); renderView('parametres'); }
}
async function reglerVoeuxAnniversaire(actif){
  try{
    const { error } = await exigerEffet(sb.from('ecoles').update({ voeux_anniversaire: actif }).eq('id', session.ecoleId));
    if(error) throw error;
    DB.meta.voeuxAnniversaire = actif;
    toast(actif ? 'Vœux d’anniversaire activés' : 'Vœux d’anniversaire désactivés');
  }catch(e){ alert('Erreur : ' + e.message); renderView('parametres'); }
}
/* =====================================================================
   CAHIER DE TEXTES — devoirs par classe (schema.sql section 64)
   L'enseignant note les devoirs de ses classes ; chaque parent voit ceux
   de la classe de ses enfants (accueil de la console parent).
   ===================================================================== */
// Prochain jour de classe (le lundi si l'on est vendredi ou le week-end)
function isoDansJours(n, ouvre){
  const d = new Date(); d.setDate(d.getDate() + n);
  while(ouvre && (d.getDay() === 0 || d.getDay() === 6)) d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function prochainJourClasse(){ return isoDansJours(1, true); }
function quandDevoir(iso){
  if(iso === todayISO()) return 'pour aujourd’hui';
  if(iso === isoDansJours(1)) return 'pour demain';
  const jour = new Date(iso + 'T12:00:00');
  if(iso === prochainJourClasse()) return 'pour ' + jour.toLocaleDateString('fr-FR', {weekday:'long'});
  return 'pour le ' + jour.toLocaleDateString('fr-FR', {weekday:'long', day:'numeric', month:'long'});
}
function renderDevoirs(){
  if(DB.devoirs === undefined){
    DB.devoirs = null;
    const depuis = new Date(); depuis.setDate(depuis.getDate() - 14);
    sb.from('devoirs').select('*').eq('ecole_id', session.ecoleId).gte('pour_le', depuis.toISOString().slice(0, 10)).order('pour_le')
      .then(({ data }) => { DB.devoirs = rowsToCamel(data || []); if(ui.currentView === 'devoirs') renderView('devoirs'); });
  }
  const classes = classesVisibles();
  const idsClasses = classes.map(c => c.id);
  if(!classes.length) return `<div class="view active"><div class="panel"><div class="hint">Aucune classe ne vous est attribuée : demandez à la direction de valider votre inscription.</div></div></div>`;
  const choix = ui.filters.devoirsClasse && idsClasses.includes(ui.filters.devoirsClasse) ? ui.filters.devoirsClasse : '';
  const tous = ui.filters.devoirsPasses;
  const liste = (DB.devoirs || []).filter(d => idsClasses.includes(d.classeId) && (!choix || d.classeId === choix) && (tous || d.pourLe >= todayISO()));
  const t = session.enseignantId ? enseignantById(session.enseignantId) : null;
  const matieres = [...new Set([...(t?.matieres || []), ...classes.flatMap(c => MATIERES_BY_CYCLE[c.cycle] || [])])];
  return `<div class="view active">
    <div class="panel">
      <div class="panel-head"><div><h2>📒 Noter un devoir</h2><div class="sub">Les parents de la classe le voient aussitôt dans leur application, avec une notification s’ils le souhaitent.</div></div></div>
      <form onsubmit="return ajouterDevoir(event)">
        <div class="form-grid">
          <div class="field"><label>Classe</label><select name="classeId" required>${classes.map(c => `<option value="${c.id}"${c.id === choix ? ' selected' : ''}>${escapeHtml(c.nom)}</option>`).join('')}</select></div>
          <div class="field"><label>Matière</label><input name="matiere" maxlength="80" list="listeMatieresDevoirs" placeholder="Ex : Mathématiques"><datalist id="listeMatieresDevoirs">${matieres.map(m => `<option value="${escapeHtml(m)}">`).join('')}</datalist></div>
          <div class="field"><label>Pour le</label><input type="date" name="pourLe" required value="${prochainJourClasse()}"></div>
          <div class="field span2"><label>Travail à faire</label><textarea name="travail" required minlength="2" maxlength="1000" rows="3" placeholder="Ex : Apprendre la leçon 4, faire les exercices 2 et 3 page 18"></textarea></div>
        </div>
        <label style="display:flex;align-items:center;gap:8px;margin-top:8px;"><input type="checkbox" name="prevenir" checked> Prévenir les parents de la classe par une notification</label>
        <div class="form-actions"><button class="btn" type="submit">Enregistrer le devoir</button></div>
      </form>
    </div>
    <div class="panel">
      <div class="panel-head"><div><h2>${tous ? 'Devoirs des 2 dernières semaines' : 'Devoirs à venir'}</h2></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <select onchange="ui.filters.devoirsClasse=this.value; renderView('devoirs')"><option value="">Toutes mes classes</option>${classes.map(c => `<option value="${c.id}"${c.id === choix ? ' selected' : ''}>${escapeHtml(c.nom)}</option>`).join('')}</select>
          <button class="btn secondary sm" onclick="ui.filters.devoirsPasses=${!tous}; renderView('devoirs')">${tous ? 'À venir seulement' : 'Voir aussi les passés'}</button></div></div>
      ${DB.devoirs === null ? '<div class="hint">Chargement…</div>' : !liste.length ? '<div class="empty-state"><div class="em-ic">📒</div>Aucun devoir noté pour l’instant.</div>' : `<div class="table-wrap"><table>
        <thead><tr><th>Pour le</th><th>Classe</th><th>Travail</th><th></th></tr></thead>
        <tbody>${liste.map(d => `<tr>
          <td style="white-space:nowrap;">${fmtDate(d.pourLe)}<br><span class="hint">${d.pourLe >= todayISO() ? quandDevoir(d.pourLe) : 'passé'}</span></td>
          <td>${escapeHtml(classeName(d.classeId))}</td>
          <td>${d.matiere ? `<strong>${escapeHtml(d.matiere)}</strong><br>` : ''}${escapeHtml(d.travail).replace(/\n/g, '<br>')}</td>
          <td><button class="icon-btn danger" title="Supprimer" onclick="supprimerDevoir('${d.id}')">🗑️</button></td>
        </tr>`).join('')}</tbody></table></div>`}
    </div>
  </div>`;
}
async function ajouterDevoir(ev){
  ev.preventDefault();
  const fd = new FormData(ev.target);
  const ligne = { classe_id: fd.get('classeId'), matiere: (fd.get('matiere') || '').trim(), travail: fd.get('travail').trim(), pour_le: fd.get('pourLe') };
  if(ligne.pour_le < todayISO()) return alert('Choisissez une date à partir d’aujourd’hui.'), false;
  const bouton = ev.target.querySelector('button[type="submit"]'); if(bouton) bouton.disabled = true;
  try{
    const { data, error } = await sb.from('devoirs').insert(ligne).select().single();
    if(error) throw error;
    const d = rowToCamel(data);
    DB.devoirs = (DB.devoirs || []).concat(d).sort((a, b) => a.pourLe.localeCompare(b.pourLe));
    if(fd.get('prevenir') === 'on'){
      const eleves = DB.eleves.filter(e => e.statut === 'Actif' && e.classeId === d.classeId).map(e => e.id);
      notifierParentsPush(eleves, `📒 Devoir ${quandDevoir(d.pourLe)} (${classeName(d.classeId)})${d.matiere ? ' — ' + d.matiere : ''} : ${d.travail}`);
    }
    ui.filters.devoirsClasse = d.classeId;
    toast('Devoir enregistré'); renderView('devoirs');
  }catch(e){ alert('Erreur : ' + e.message); if(bouton) bouton.disabled = false; }
  return false;
}
async function supprimerDevoir(id){
  if(!confirm('Supprimer ce devoir ? Les parents ne le verront plus.')) return;
  try{
    const { error } = await exigerEffet(sb.from('devoirs').delete().eq('id', id));
    if(error) throw error;
    DB.devoirs = (DB.devoirs || []).filter(d => d.id !== id);
    toast('Devoir supprimé'); renderView('devoirs');
  }catch(e){ alert('Erreur : ' + e.message); }
}
// Console parent : devoirs à venir de chaque enfant
function renderDevoirsParent(enfants){
  const blocs = enfants.map(e => ({ e, ds: (DB.devoirs || []).filter(d => d.classeId === e.classeId && d.pourLe >= todayISO()) })).filter(x => x.ds.length);
  if(!blocs.length) return '';
  const plusieurs = enfants.length > 1;
  return `<section class="panel actus-panel" aria-labelledby="titreDevoirs">
    <div class="panel-head"><div><h2 id="titreDevoirs">📒 Devoirs</h2></div></div>
    ${blocs.map(({ e, ds }) => `${plusieurs ? `<div class="hint" style="margin:6px 0 4px;font-weight:600;">${escapeHtml(e.prenom)} — ${escapeHtml(classeName(e.classeId))}</div>` : ''}
      <div class="actu-liste">${ds.map(d => `<article class="actu-carte">
        <div class="actu-date" aria-hidden="true"><span class="actu-jour">${new Date(d.pourLe + 'T12:00:00').getDate()}</span><span class="actu-mois">${new Date(d.pourLe + 'T12:00:00').toLocaleDateString('fr-FR', {month:'short'}).replace('.', '').toUpperCase()}</span></div>
        <div class="actu-corps"><div class="actu-titre">${d.matiere ? escapeHtml(d.matiere) : 'Travail à faire'} <span class="hint" style="font-weight:600;">· ${quandDevoir(d.pourLe)}</span></div>
          <div class="actu-meta">${escapeHtml(d.travail).replace(/\n/g, '<br>')}</div></div>
      </article>`).join('')}</div>`).join('')}
  </section>`;
}
/* =====================================================================
   AGENDA DE L'ÉCOLE (schema.sql section 61)
   ===================================================================== */
const TYPES_AGENDA = {
  vacances: { lib:'Vacances / congé', ic:'🏖️' }, examen: { lib:'Composition / examen', ic:'📝' },
  reunion: { lib:'Réunion de parents', ic:'👪' }, fete: { lib:'Fête / cérémonie', ic:'🎉' },
  sortie: { lib:'Sortie / excursion', ic:'🚌' }, autre: { lib:'Autre', ic:'📌' },
};
function datesAgenda(ev){
  return ev.dateDebut === ev.dateFin ? fmtDate(ev.dateDebut) : `du ${fmtDate(ev.dateDebut)} au ${fmtDate(ev.dateFin)}`;
}
function delaiAgenda(ev){
  const aujourd = todayISO();
  if(ev.dateDebut <= aujourd && ev.dateFin >= aujourd) return 'en cours';
  const j = Math.round((Date.parse(ev.dateDebut + 'T12:00:00') - Date.parse(aujourd + 'T12:00:00')) / 86400000);
  return j === 1 ? 'demain' : `dans ${j} jours`;
}
// Console parent : prochaines dates
/* --- Réponses des parents (schema.sql section 67) --- */
const DEMANDES_REPONSE = {
  autorisation: { lib:'Autorisation parentale', oui:'✅ J’autorise', non:'❌ Je n’autorise pas', ouiCourt:'autorisé', nonCourt:'non autorisé' },
  presence: { lib:'Confirmation de présence', oui:'✅ Je serai présent(e)', non:'❌ Je ne pourrai pas venir', ouiCourt:'présent', nonCourt:'absent' },
};
function elevesConcernesAgenda(ev, eleves){
  return (eleves || []).filter(e => e.statut !== 'Inactif' && (!ev.classeIds || !ev.classeIds.length || ev.classeIds.includes(e.classeId)));
}
function renderReponsesParent(ev){
  const d = DEMANDES_REPONSE[ev.demandeReponse];
  if(!d) return '';
  const enfants = elevesConcernesAgenda(ev, DB.eleves);
  if(!enfants.length) return '';
  return `<div class="agenda-reponses">${enfants.map(e => {
    const r = (DB.reponsesAgenda || []).find(x => x.evenementId === ev.id && x.eleveId === e.id);
    const qui = enfants.length > 1 || (DB.eleves || []).length > 1 ? `<strong>${escapeHtml(e.prenom)}</strong> : ` : '';
    return r
      ? `<div class="agenda-rep-ligne">${qui}<span class="badge ${r.reponse ? 'green' : 'red'}">${r.reponse ? d.ouiCourt : d.nonCourt}</span> <button type="button" class="btn secondary sm" onclick="repondreAgenda('${ev.id}','${e.id}', ${!r.reponse})">Changer</button></div>`
      : `<div class="agenda-rep-ligne">${qui}<button type="button" class="btn sm" onclick="repondreAgenda('${ev.id}','${e.id}', true)">${d.oui}</button> <button type="button" class="btn secondary sm" onclick="repondreAgenda('${ev.id}','${e.id}', false)">${d.non}</button></div>`;
  }).join('')}</div>`;
}
async function repondreAgenda(evenementId, eleveId, reponse){
  try{
    const { data, error } = await sb.from('reponses_agenda').upsert({ evenement_id: evenementId, eleve_id: eleveId, reponse, repondu_at: new Date().toISOString() }).select().single();
    if(error) throw error;
    DB.reponsesAgenda = (DB.reponsesAgenda || []).filter(x => !(x.evenementId === evenementId && x.eleveId === eleveId)).concat(rowToCamel(data));
    toast('Réponse envoyée à l’école'); renderView(ui.currentView);
  }catch(e){ alert('Erreur : ' + e.message); }
}
function renderAgendaParent(){
  const evs = (DB.agenda || []).filter(e => e.dateFin >= todayISO()).slice(0, 5);
  if(!evs.length) return '';
  return `<section class="panel actus-panel" aria-labelledby="titreAgenda">
    <div class="panel-head"><div><h2 id="titreAgenda">📅 À venir</h2></div></div>
    <div class="actu-liste">${evs.map(ev => `<article class="actu-carte">
      <div class="actu-date" aria-hidden="true"><span class="actu-jour">${new Date(ev.dateDebut + 'T12:00:00').getDate()}</span><span class="actu-mois">${new Date(ev.dateDebut + 'T12:00:00').toLocaleDateString('fr-FR', {month:'short'}).replace('.', '').toUpperCase()}</span></div>
      <div class="actu-corps"><div class="actu-titre">${(TYPES_AGENDA[ev.type] || TYPES_AGENDA.autre).ic} ${escapeHtml(ev.titre)}</div>
        <div class="actu-meta">${datesAgenda(ev)} · <strong>${delaiAgenda(ev)}</strong>${ev.description ? ' · ' + escapeHtml(ev.description) : ''}</div>
        ${ev.demandeReponse ? `<div class="hint" style="margin:6px 0 0;font-weight:600;">✍️ ${DEMANDES_REPONSE[ev.demandeReponse]?.lib || ''} : l’école attend votre réponse</div>${renderReponsesParent(ev)}` : ''}</div>
    </article>`).join('')}</div>
  </section>`;
}
// École : réponses reçues pour une date de l'agenda
function telephonesWhatsapp(tel){
  return String(tel || '').split(/\s*[\/;,|]\s*|\s+-\s+|\s+et\s+/i)
    .map(m => m.replace(/\D/g, '').replace(/^225/, '')).filter(m => m.length === 10).map(m => '225' + m);
}
async function ouvrirReponsesAgenda(evenementId){
  const ev = (DB.agenda || []).find(x => x.id === evenementId);
  if(!ev) return;
  openModal('✍️ Réponses des parents', '<div class="hint">Chargement…</div>');
  try{
    const { data, error } = await sb.from('reponses_agenda').select('*').eq('evenement_id', evenementId);
    if(error) throw error;
    DB.reponsesAgenda = (DB.reponsesAgenda || []).filter(x => x.evenementId !== evenementId).concat(rowsToCamel(data || []));
  }catch(e){ $('#modalBody').innerHTML = `<div class="hint">Erreur : ${escapeHtml(e.message)}</div>`; return; }
  afficherReponsesAgenda(ev);
}
function afficherReponsesAgenda(ev){
  const d = DEMANDES_REPONSE[ev.demandeReponse] || DEMANDES_REPONSE.autorisation;
  const gestion = ['secretariat','direction','fondation'].includes(ui.role);
  const idsVisibles = classesVisibles().map(c => c.id);
  const eleves = elevesConcernesAgenda(ev, DB.eleves.filter(e => e.statut === 'Actif' && idsVisibles.includes(e.classeId)));
  const rep = (e) => (DB.reponsesAgenda || []).find(x => x.evenementId === ev.id && x.eleveId === e.id);
  const oui = eleves.filter(e => rep(e)?.reponse === true).length, non = eleves.filter(e => rep(e)?.reponse === false).length;
  const sans = eleves.filter(e => !rep(e));
  const numeros = [...new Set(sans.flatMap(e => telephonesWhatsapp(e.parentTel)))];
  const classes = DB.classes.filter(c => eleves.some(e => e.classeId === c.id));
  ui._repAgenda = { ev, numeros };
  openModal(`✍️ ${ev.titre}`, `
    <p class="hint" style="margin-top:0;">${d.lib} · ${datesAgenda(ev)}</p>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;">
      <span class="badge green">${oui} ${d.ouiCourt}</span><span class="badge red">${non} ${d.nonCourt}</span><span class="badge">${sans.length} sans réponse</span></div>
    ${sans.length && numeros.length ? `<button type="button" class="btn secondary sm" style="margin-bottom:12px;" onclick="relancerReponsesAgenda()">📲 Relancer par WhatsApp les parents sans réponse (${numeros.length} numéro(s))</button>` : ''}
    ${classes.map(c => `<h4 style="margin:12px 0 6px;">${escapeHtml(c.nom)}</h4>
      <div class="table-wrap"><table><tbody>${eleves.filter(e => e.classeId === c.id).sort((a, b) => eleveFullName(a).localeCompare(eleveFullName(b))).map(e => { const r = rep(e); return `<tr>
        <td>${escapeHtml(eleveFullName(e))}</td>
        <td>${r ? `<span class="badge ${r.reponse ? 'green' : 'red'}">${r.reponse ? d.ouiCourt : d.nonCourt}</span>` : '<span class="hint">sans réponse</span>'}</td>
        <td style="white-space:nowrap;">${gestion ? `<button class="btn secondary sm" title="Réponse reçue sur papier ou par téléphone" onclick="noterReponseAgenda('${ev.id}','${e.id}',true)">Oui</button> <button class="btn secondary sm" onclick="noterReponseAgenda('${ev.id}','${e.id}',false)">Non</button>` : ''}</td>
      </tr>`; }).join('')}</tbody></table></div>`).join('') || '<div class="hint">Aucun élève concerné.</div>'}
    ${gestion ? '<p class="hint">« Oui / Non » : pour noter une réponse reçue sur papier ou par téléphone.</p>' : ''}`);
}
function relancerReponsesAgenda(){
  const { ev, numeros } = ui._repAgenda || {};
  if(!ev) return;
  const d = DEMANDES_REPONSE[ev.demandeReponse] || DEMANDES_REPONSE.autorisation;
  const message = `Bonjour, ${DB.meta?.nomEcole || 'l’école'} attend votre réponse (${d.lib.toLowerCase()}) pour « ${ev.titre} » — ${datesAgenda(ev)}. Merci de répondre dans l’application EcoMaZ Parents (accueil → À venir). Merci !`;
  ouvrirEnvoiWhatsapp('📲 Relance des parents', numeros, message, 'Touchez chaque numéro : WhatsApp s’ouvre avec ce message (gratuit).');
}
async function noterReponseAgenda(evenementId, eleveId, reponse){
  try{
    const { data, error } = await sb.from('reponses_agenda').upsert({ evenement_id: evenementId, eleve_id: eleveId, reponse, repondu_at: new Date().toISOString() }).select().single();
    if(error) throw error;
    DB.reponsesAgenda = (DB.reponsesAgenda || []).filter(x => !(x.evenementId === evenementId && x.eleveId === eleveId)).concat(rowToCamel(data));
    afficherReponsesAgenda((DB.agenda || []).find(x => x.id === evenementId));
  }catch(e){ alert('Erreur : ' + e.message); }
}
// Application école : page Agenda
function renderAgenda(){
  if(DB.agenda === undefined){
    DB.agenda = null;
    sb.from('evenements_agenda').select('*').eq('ecole_id', session.ecoleId).order('date_debut')
      .then(({ data }) => { DB.agenda = rowsToCamel(data || []); if(ui.currentView === 'agenda') renderView('agenda'); });
  }
  const gestion = ['secretariat','direction','fondation'].includes(ui.role);
  const tous = ui.filters.agendaPasses;
  const liste = (DB.agenda || []).filter(e => tous || e.dateFin >= todayISO());
  return `<div class="view active">
    ${gestion ? `<div class="panel">
      <div class="panel-head"><div><h2>📅 Ajouter une date</h2><div class="sub">Visible par le personnel et par les parents concernés. Les vacances arrêtent automatiquement les annonces et le rappel d’appel.</div></div></div>
      <form onsubmit="return ajouterEvenementAgenda(event)">
        <div class="form-grid">
          <div class="field"><label>Titre</label><input name="titre" required minlength="2" maxlength="150" placeholder="Ex : Compositions du 1er trimestre"></div>
          <div class="field"><label>Type</label><select name="type">${Object.entries(TYPES_AGENDA).map(([k, v]) => `<option value="${k}">${v.ic} ${v.lib}</option>`).join('')}</select></div>
          <div class="field"><label>Du</label><input type="date" name="dateDebut" required value="${todayISO()}"></div>
          <div class="field"><label>Au (inclus)</label><input type="date" name="dateFin" required value="${todayISO()}"></div>
          <div class="field span2"><label>Précision (facultatif)</label><input name="description" maxlength="1000" placeholder="Ex : apporter la tenue de sport"></div>
          <div class="field span2"><label>Pour qui ?</label>
            <select name="cible" onchange="document.getElementById('choixClassesAgenda').style.display = this.value === 'classes' ? 'flex' : 'none'"><option value="tous">Toute l’école</option><option value="classes">Certaines classes</option></select>
            <div id="choixClassesAgenda" style="display:none;flex-wrap:wrap;gap:10px;margin-top:8px;">${DB.classes.map(c => `<label style="display:flex;align-items:center;gap:6px;"><input type="checkbox" name="classe" value="${c.id}"> ${escapeHtml(c.nom)}</label>`).join('')}</div></div>
        </div>
        <div class="field" style="margin-top:8px;"><label>Demander une réponse aux parents ?</label>
          <select name="demandeReponse"><option value="">Non, simple information</option><option value="autorisation">Oui : autorisation parentale (sortie, excursion…)</option><option value="presence">Oui : confirmation de présence (réunion, fête…)</option></select></div>
        <label style="display:flex;align-items:center;gap:8px;margin-top:8px;"><input type="checkbox" name="prevenir" checked> Prévenir les parents concernés par une notification</label>
        <div class="form-actions"><button class="btn" type="submit">Ajouter à l’agenda</button></div>
      </form>
    </div>` : ''}
    <div class="panel">
      <div class="panel-head"><div><h2>${tous ? 'Toutes les dates' : 'Dates à venir'}</h2></div>
        <button class="btn secondary sm" onclick="ui.filters.agendaPasses=${!tous}; renderView('agenda')">${tous ? 'À venir seulement' : 'Voir aussi les dates passées'}</button></div>
      ${DB.agenda === null ? '<div class="hint">Chargement…</div>' : !liste.length ? '<div class="empty-state"><div class="em-ic">📅</div>Aucune date pour l’instant.</div>' : `<div class="table-wrap"><table>
        <thead><tr><th>Date</th><th>Événement</th><th>Pour</th><th></th></tr></thead>
        <tbody>${liste.map(ev => `<tr>
          <td style="white-space:nowrap;">${datesAgenda(ev)}<br><span class="hint">${ev.dateFin >= todayISO() ? delaiAgenda(ev) : 'passé'}</span></td>
          <td>${(TYPES_AGENDA[ev.type] || TYPES_AGENDA.autre).ic} <strong>${escapeHtml(ev.titre)}</strong>${ev.description ? `<br><span class="hint">${escapeHtml(ev.description)}</span>` : ''}${ev.demandeReponse ? `<br><button class="btn secondary sm" style="margin-top:4px;" onclick="ouvrirReponsesAgenda('${ev.id}')">✍️ Réponses des parents</button>` : ''}</td>
          <td>${ev.classeIds && ev.classeIds.length ? ev.classeIds.map(classeName).join(', ') : 'Toute l’école'}</td>
          <td>${gestion ? `<button class="icon-btn danger" title="Supprimer" onclick="supprimerEvenementAgenda('${ev.id}')">🗑️</button>` : ''}</td>
        </tr>`).join('')}</tbody></table></div>`}
    </div>
  </div>`;
}
async function ajouterEvenementAgenda(ev){
  ev.preventDefault();
  const fd = new FormData(ev.target);
  if(fd.get('dateFin') < fd.get('dateDebut')) return alert('La date de fin doit être après la date de début.'), false;
  const classeIds = fd.get('cible') === 'classes' ? fd.getAll('classe') : null;
  if(classeIds && !classeIds.length) return alert('Cochez au moins une classe.'), false;
  const ligne = { titre: fd.get('titre').trim(), type: fd.get('type'), date_debut: fd.get('dateDebut'), date_fin: fd.get('dateFin'),
    description: (fd.get('description') || '').trim(), classe_ids: classeIds, demande_reponse: fd.get('demandeReponse') || null };
  try{
    const { data, error } = await sb.from('evenements_agenda').insert(ligne).select().single();
    if(error) throw error;
    DB.agenda = (DB.agenda || []).concat(rowToCamel(data)).sort((a, b) => a.dateDebut.localeCompare(b.dateDebut));
    if(fd.get('prevenir') === 'on'){
      const eleves = DB.eleves.filter(e => e.statut === 'Actif' && (!classeIds || classeIds.includes(e.classeId))).map(e => e.id);
      const evt = rowToCamel(data);
      notifierParentsPush(eleves, `${(TYPES_AGENDA[evt.type] || TYPES_AGENDA.autre).ic} ${evt.titre} — ${datesAgenda(evt)}${evt.demandeReponse ? ' · Merci de répondre dans l’application.' : ''}`);
    }
    toast('Ajouté à l’agenda'); renderView('agenda');
  }catch(e){ alert('Erreur : ' + e.message); }
  return false;
}
async function supprimerEvenementAgenda(id){
  if(!confirm('Supprimer cette date de l’agenda ?')) return;
  try{
    const { error } = await exigerEffet(sb.from('evenements_agenda').delete().eq('id', id));
    if(error) throw error;
    DB.agenda = (DB.agenda || []).filter(e => e.id !== id);
    toast('Date supprimée'); renderView('agenda');
  }catch(e){ alert('Erreur : ' + e.message); }
}
/* ---------------------------------------------------------------------
   IMPORT DES ÉLÈVES DEPUIS EXCEL (.xlsx, .xls ou .csv)
   Pour installer une école en quelques minutes. La bibliothèque SheetJS
   (gratuite) n'est chargée qu'à l'ouverture de l'import. Rien n'est
   enregistré avant l'aperçu et la confirmation ; les doublons (même nom,
   prénom et date de naissance) sont ignorés.
   --------------------------------------------------------------------- */
const XLSX_URL = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';
let importEleves = null;   // { lignes:[{patch, erreurs, avertissements}], nomFichier }
function chargerXLSX(){
  if(window.XLSX) return Promise.resolve(window.XLSX);
  return new Promise((ok, ko) => {
    const sc = document.createElement('script');
    sc.src = XLSX_URL; sc.onload = () => ok(window.XLSX);
    sc.onerror = () => ko(new Error('Connexion internet nécessaire pour lire un fichier Excel.'));
    document.head.appendChild(sc);
  });
}
const COLONNES_IMPORT = [
  { cle:'nom', titre:'Nom', alias:['nom','nom de famille','nom eleve','nom de l eleve'] },
  { cle:'prenom', titre:'Prénoms', alias:['prenom','prenoms','prenom s'] },
  { cle:'sexe', titre:'Sexe (M/F)', alias:['sexe','genre','sexe m f'] },
  { cle:'dateNaissance', titre:'Date de naissance', alias:['date de naissance','naissance','ne le','nee le','date naissance','ne e le'] },
  { cle:'classe', titre:'Classe', alias:['classe','niveau'] },
  { cle:'parentNom', titre:'Nom du parent', alias:['nom du parent','parent','nom parent','tuteur','nom du tuteur','parent tuteur'] },
  { cle:'parentTel', titre:'Téléphone du parent', alias:['telephone du parent','telephone','tel','contact','telephone parent','tel parent','numero','contact parent'] },
  { cle:'parentAdresse', titre:'Adresse', alias:['adresse','lieu d habitation','domicile','quartier'] },
  { cle:'dateInscription', titre:'Date d’inscription', alias:['date d inscription','inscription','date inscription','inscrit le'] },
];
function simplifierTexte(t){
  return String(t ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
function dateImportISO(v){
  const iso = dateImportBrute(v);
  if(!iso || iso === 'invalide') return iso;
  const [a, m, j] = iso.split('-').map(Number), d = new Date(a, m - 1, j);   // refuse 31/02, 13e mois…
  return d.getFullYear() === a && d.getMonth() === m - 1 && d.getDate() === j && a > 1900 ? iso : 'invalide';
}
function dateImportBrute(v){
  if(v == null || v === '') return '';
  if(v instanceof Date && !isNaN(v)) return `${v.getFullYear()}-${String(v.getMonth()+1).padStart(2,'0')}-${String(v.getDate()).padStart(2,'0')}`;
  const t = String(v).trim();
  let m = t.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})$/);
  if(m) return `${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;
  m = t.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{2}|\d{4})$/);   // JJ/MM/AAAA (usage ivoirien)
  if(m){ const an = m[3].length === 2 ? (Number(m[3]) > 50 ? '19' : '20') + m[3] : m[3]; return `${an}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`; }
  return 'invalide';
}
function sexeImport(v){
  const t = simplifierTexte(v);
  if(['m','masculin','garcon','g','homme','h'].includes(t)) return 'M';
  if(['f','feminin','fille','femme'].includes(t)) return 'F';
  return '';
}
function ouvrirImportEleves(){
  importEleves = null;
  openModal('Importer des élèves depuis Excel', `
    <ol class="hint" style="padding-left:18px;margin-top:0;">
      <li>Téléchargez le modèle, ou utilisez votre propre fichier : la 1<sup>re</sup> ligne doit contenir les titres des colonnes (Nom, Prénoms, Sexe, Date de naissance, Classe, Nom du parent, Téléphone du parent…).</li>
      <li>Les classes doivent porter le même nom que dans EcoMaZ (${escapeHtml(DB.classes.slice(0,4).map(c=>c.nom).join(', '))}${DB.classes.length>4?'…':''}).</li>
      <li>Choisissez le fichier : un aperçu s'affiche, rien n'est enregistré avant votre confirmation.</li>
    </ol>
    <div class="form-actions" style="flex-wrap:wrap;justify-content:flex-start;">
      <button type="button" class="btn secondary" onclick="telechargerModeleImport()">⬇️ Télécharger le modèle</button>
      <label class="btn" style="cursor:pointer;">📄 Choisir le fichier Excel
        <input type="file" accept=".xlsx,.xls,.csv" style="display:none;" onchange="lireFichierImport(this.files[0])">
      </label>
    </div>
    <div id="importApercu"></div>`);
}
// --- Exports Excel (gratuits, produits sur l'appareil) ---
function nomFichierExport(sujet){ return `${simplifierTexte(DB.meta?.nomEcole || 'ecole').replace(/ /g, '-')}-${sujet}-${todayISO()}.xlsx`; }
/* ---------- Sauvegarde complète (Excel) — direction / fondation ----------
   Utilise uniquement les données déjà chargées dans l'application (aucune
   nouvelle requête) ; identifiants internes remplacés par des noms lisibles. */
const SAUVEGARDE_FEUILLES = [
  ['Élèves', 'eleves'], ['Classes', 'classes'], ['Enseignants', 'enseignants'], ['Personnel', 'personnelAutre'],
  ['Paiements scolarité', 'paiementsScolarite'], ['Échéances', 'echeancesScolarite'], ['Activités', 'activites'],
  ['Inscriptions activités', 'inscriptionsActivites'], ['Cotisations', 'paiementsCotisations'], ['Boutique', 'gadgets'],
  ['Ventes boutique', 'ventesGadgets'], ['Salaires', 'paiementsSalaires'], ['Dépenses', 'depenses'],
  ['Présences élèves', 'presencesEleves'], ['Présences enseignants', 'presencesEnseignants'], ['Notes', 'notes'],
  ['Emploi du temps', 'emploiTemps'], ['Programmes', 'programmes'], ['Agenda', 'agenda'], ['Devoirs', 'devoirs'],
  ['Parents reliés', 'parentsEleves'], ['Messages', 'messages'],
];
const SAUVEGARDE_EXCLUS = new Set(['id', 'ecoleId', 'createdBy', 'traitePar', 'userId', 'auteurId']);
function libelleColonne(cle){
  const noms = { classeId:'Classe', eleveId:'Élève', enseignantId:'Enseignant', parentProfileId:'Compte parent', classeIds:'Classes', classesAssignees:'Classes',
    prenom:'Prénom', parentNom:'Nom du parent', parentTel:'Téléphone du parent', parentAdresse:'Adresse du parent', dateNaissance:'Date de naissance',
    dateInscription:'Date d’inscription', dateEmbauche:'Date d’embauche', telephone:'Téléphone', modePaiement:'Mode de paiement', matieres:'Matières', matiere:'Matière', createdAt:'Créé le' };
  if(noms[cle]) return noms[cle];
  const t = cle.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
  return t.charAt(0).toUpperCase() + t.slice(1);
}
function valeurLisible(cle, v){
  if(v == null) return '';
  if(cle === 'classeId') return classeName(v);
  if(cle === 'eleveId'){ const e = eleveById(v); return e ? eleveFullName(e) : v; }
  if(cle === 'enseignantId'){ const t = enseignantById(v); return t ? ensFullName(t) : v; }
  if(cle === 'parentProfileId'){ const p = (DB.profiles || []).find(x => x.id === v); return p ? (p.nomComplet || '') : v; }
  if(Array.isArray(v)) return (cle === 'classeIds' || cle === 'classesAssignees') ? v.map(classeName).join(', ') : v.join(', ');
  if(typeof v === 'object') return JSON.stringify(v);
  return v;
}
async function exporterSauvegardeComplete(){
  if(!['direction','fondation'].includes(ui.role)) return;
  const feuilles = [];
  for(const [nom, cle] of SAUVEGARDE_FEUILLES){
    const lignes = Array.isArray(DB[cle]) ? DB[cle] : [];
    if(!lignes.length) continue;
    const ordre = ['matricule', 'nom', 'prenom', 'eleveId', 'enseignantId', 'classeId', 'date', 'montant', 'statut'];
    const rang = k => { const i = ordre.indexOf(k); return i < 0 ? ordre.length : i; };
    const colonnes = [...new Set(lignes.flatMap(l => Object.keys(l)))].filter(k => !SAUVEGARDE_EXCLUS.has(k)).sort((a, b) => rang(a) - rang(b));
    feuilles.push([nom.slice(0, 31), [colonnes.map(libelleColonne), ...lignes.map(l => colonnes.map(k => valeurLisible(k, l[k])))]]);
  }
  if(!feuilles.length) return toast('Aucune donnée à sauvegarder pour l’instant.');
  const nomEcole = String(DB.meta?.nomEcole || 'ecole').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '');
  try{
    await ecrireClasseurExcel(feuilles, `Sauvegarde-${nomEcole}-${todayISO()}.xlsx`);
    toast(`Sauvegarde téléchargée : ${feuilles.length} feuilles`);
  }catch(err){ alert('Sauvegarde impossible : ' + err.message); }
}
async function ecrireClasseurExcel(feuilles, nomFichier){
  const X = await chargerXLSX();
  const classeur = X.utils.book_new();
  for(const [nom, lignes] of feuilles){
    const f = X.utils.aoa_to_sheet(lignes);
    f['!cols'] = (lignes[0] || []).map((_, i) => ({ wch: Math.min(40, Math.max(10, ...lignes.map(l => String(l[i] ?? '').length + 2))) }));
    X.utils.book_append_sheet(classeur, f, nom.slice(0, 31));
  }
  X.writeFile(classeur, nomFichier);
}
async function exporterElevesExcel(){
  try{
    const relies = new Set((DB.parentsEleves || []).map(pe => pe.eleveId));
    const eleves = DB.eleves.slice().sort((a, b) => classeName(a.classeId).localeCompare(classeName(b.classeId)) || a.nom.localeCompare(b.nom));
    const lignes = [['Matricule','Nom','Prénoms','Sexe','Date de naissance','Classe','Statut','Date d’inscription','Parent / tuteur','Téléphone du parent','Adresse','Renforcement','Parent relié dans l’application']]
      .concat(eleves.map(e => [e.matricule || '', e.nom, e.prenom, e.sexe || '', e.dateNaissance ? fmtDate(e.dateNaissance) : '', classeName(e.classeId), e.statut || '',
        e.dateInscription ? fmtDate(e.dateInscription) : '', e.parentNom || '', e.parentTel || '', e.parentAdresse || '', e.renforcement ? 'Oui' : 'Non', relies.has(e.id) ? 'Oui' : 'Non']));
    // Une feuille par classe en plus de la liste complète
    const parClasse = DB.classes.map(c => [c.nom, [lignes[0]].concat(lignes.slice(1).filter(l => l[5] === c.nom))]).filter(([, l]) => l.length > 1);
    await ecrireClasseurExcel([['Tous les élèves', lignes], ...parClasse], nomFichierExport('eleves'));
    toast(`${eleves.length} élève(s) exporté(s)`);
  }catch(e){ alert('Erreur : ' + e.message); }
}
async function exporterScolariteExcel(){
  try{
    const lignes = [['Classe','Matricule','Élève','Parent','Téléphone','Scolarité due','Payé','Reste à payer','Prochaine tranche','Date limite','Statut']];
    let totDu = 0, totPaye = 0;
    DB.classes.forEach(c => {
      DB.eleves.filter(e => e.classeId === c.id && e.statut === 'Actif').sort((a, b) => a.nom.localeCompare(b.nom)).forEach(e => {
        const g = scolariteEleveParEcheance(e.id), info = scolariteEleveInfo(e.id);
        const du = g.total || info.du, paye = g.total ? g.totalPaye : info.paye, reste = Math.max(0, du - paye);
        const proch = g.detail.find(d => d.statut !== 'paye'), ech = proch ? echeancesDeClasse(c.id).find(x => x.label === proch.label) : null;
        totDu += du; totPaye += paye;
        lignes.push([c.nom, e.matricule || '', eleveFullName(e), e.parentNom || '', e.parentTel || '', du, paye, reste, proch ? proch.label : '', ech?.dateEcheance ? fmtDate(ech.dateEcheance) : '',
          reste <= 0 && du > 0 ? 'Soldé' : paye > 0 ? 'Partiel' : 'Impayé']);
      });
    });
    lignes.push([], ['TOTAL', '', '', '', '', totDu, totPaye, Math.max(0, totDu - totPaye)]);
    const impayes = [lignes[0]].concat(lignes.slice(1).filter(l => l.length > 10 && l[7] > 0));
    await ecrireClasseurExcel([['État de la scolarité', lignes], ['Impayés seulement', impayes]], nomFichierExport('scolarite'));
    toast('Export de la scolarité prêt');
  }catch(e){ alert('Erreur : ' + e.message); }
}
async function telechargerModeleImport(){
  try{
    const X = await chargerXLSX();
    const ex = DB.classes[0]?.nom || 'CP1';
    const feuille = X.utils.aoa_to_sheet([COLONNES_IMPORT.map(c => c.titre),
      ['KOUASSI', 'Jean Daniel', 'M', '15/03/2018', ex, 'KOUASSI Marc', '0701020304', 'Cocody', '']]);
    feuille['!cols'] = COLONNES_IMPORT.map(() => ({ wch: 20 }));
    const classeur = X.utils.book_new();
    X.utils.book_append_sheet(classeur, feuille, 'Élèves');
    X.writeFile(classeur, 'modele-import-eleves-ecomaz.xlsx');
  }catch(e){ alert('Erreur : ' + e.message); }
}
async function lireFichierImport(fichier){
  if(!fichier) return;
  const zone = document.getElementById('importApercu');
  zone.innerHTML = '<div class="hint">Lecture du fichier…</div>';
  try{
    const X = await chargerXLSX();
    const classeur = X.read(await fichier.arrayBuffer(), { cellDates:true });
    const feuille = classeur.Sheets[classeur.SheetNames[0]];
    const tableau = X.utils.sheet_to_json(feuille, { header:1, raw:true, defval:'' })
      .filter(l => l.some(c => String(c).trim() !== ''));
    if(tableau.length < 2) throw new Error('Le fichier ne contient aucune ligne d’élève sous les titres.');
    // Repérer les colonnes d'après les titres de la 1re ligne
    const titres = tableau[0].map(simplifierTexte);
    const index = {};
    COLONNES_IMPORT.forEach(c => { const i = titres.findIndex(t => c.alias.includes(t)); if(i >= 0) index[c.cle] = i; });
    const manquantes = ['nom','prenom','classe'].filter(k => index[k] === undefined);
    if(manquantes.length) throw new Error('Colonnes introuvables : ' + manquantes.map(k => COLONNES_IMPORT.find(c=>c.cle===k).titre).join(', ') + '. Vérifiez la 1re ligne du fichier.');
    const classesParNom = {};
    DB.classes.forEach(c => classesParNom[simplifierTexte(c.nom)] = c);
    const existants = new Set(DB.eleves.map(e => simplifierTexte(`${e.nom} ${e.prenom} ${e.dateNaissance||''}`)));
    const vus = new Set();
    const val = (l, k) => index[k] === undefined ? '' : l[index[k]];
    const lignes = tableau.slice(1).map((l, n) => {
      const erreurs = [], avertissements = [];
      const nom = String(val(l,'nom')).trim().toUpperCase(), prenom = String(val(l,'prenom')).trim();
      const classe = classesParNom[simplifierTexte(val(l,'classe'))];
      const dateNaissance = dateImportISO(val(l,'dateNaissance'));
      let dateInscription = dateImportISO(val(l,'dateInscription'));
      if(!nom || !prenom) erreurs.push('nom ou prénom manquant');
      if(!classe) erreurs.push(`classe « ${String(val(l,'classe')).trim() || 'vide'} » inconnue`);
      if(dateNaissance === 'invalide') erreurs.push('date de naissance illisible');
      if(dateInscription === 'invalide'){ avertissements.push('date d’inscription illisible : aujourd’hui'); dateInscription = ''; }
      const sexe = sexeImport(val(l,'sexe'));
      if(!sexe) avertissements.push('sexe non précisé');
      const patch = {
        matricule: null, nom, prenom, sexe: sexe || 'M', classeId: classe?.id || '', statut: 'Actif',
        dateNaissance: dateNaissance === 'invalide' ? null : (dateNaissance || null),
        dateInscription: dateInscription || todayISO(),
        parentNom: String(val(l,'parentNom')).trim(), parentTel: String(val(l,'parentTel')).trim(), parentAdresse: String(val(l,'parentAdresse')).trim(),
      };
      if(!erreurs.length){
        const erreurDate = verifierDatesEleve(patch.dateNaissance, patch.dateInscription);
        if(erreurDate) avertissements.push('date de naissance à vérifier');
        if(!patch.parentTel) avertissements.push('pas de numéro de parent');
        else if(!numerosParentValides(patch.parentTel)) avertissements.push('numéro du parent à vérifier');
        const cle = simplifierTexte(`${nom} ${prenom} ${patch.dateNaissance}`);
        if(existants.has(cle)) erreurs.push('déjà inscrit dans EcoMaZ');
        else if(vus.has(cle)) erreurs.push('en double dans le fichier');
        vus.add(cle);
      }
      return { ligne: n + 2, patch, erreurs, avertissements };
    });
    importEleves = { lignes, nomFichier: fichier.name };
    afficherApercuImport();
  }catch(e){ zone.innerHTML = `<div class="hint" style="color:var(--danger);">Erreur : ${escapeHtml(e.message)}</div>`; }
}
function afficherApercuImport(){
  const { lignes } = importEleves;
  const bonnes = lignes.filter(l => !l.erreurs.length);
  document.getElementById('importApercu').innerHTML = `
    <p><strong>${bonnes.length}</strong> élève(s) prêt(s) à importer${lignes.length - bonnes.length ? `, <strong>${lignes.length - bonnes.length}</strong> ligne(s) ignorée(s)` : ''}.</p>
    <div class="table-wrap" style="max-height:320px;overflow:auto;"><table>
      <thead><tr><th>Ligne</th><th>Élève</th><th>Classe</th><th>Remarques</th></tr></thead>
      <tbody>${lignes.map(l => `<tr>
        <td>${l.ligne}</td>
        <td>${escapeHtml(`${l.patch.nom} ${l.patch.prenom}`.trim() || '—')}</td>
        <td>${escapeHtml(l.patch.classeId ? classeName(l.patch.classeId) : '—')}</td>
        <td>${l.erreurs.map(x => `<span class="badge red" style="margin:1px;">${escapeHtml(x)}</span>`).join(' ')}
            ${l.avertissements.map(x => `<span class="badge amber" style="margin:1px;">${escapeHtml(x)}</span>`).join(' ')}
            ${!l.erreurs.length && !l.avertissements.length ? '<span class="badge green">OK</span>' : ''}</td>
      </tr>`).join('')}</tbody>
    </table></div>
    <div class="hint">En rouge : ligne ignorée. En orange : importée, à compléter ensuite (elle apparaîtra dans « Fiches à vérifier »).</div>
    <div class="form-actions">
      <button type="button" class="btn secondary" onclick="closeModal()">Annuler</button>
      ${bonnes.length ? `<button type="button" class="btn" id="btnLancerImport" onclick="lancerImportEleves()">Importer ${bonnes.length} élève(s)</button>` : ''}
    </div>`;
}
async function lancerImportEleves(){
  const bouton = document.getElementById('btnLancerImport');
  const aImporter = importEleves.lignes.filter(l => !l.erreurs.length);
  if(!confirm(`Importer ${aImporter.length} élève(s) dans EcoMaZ ?`)) return;
  bouton.disabled = true;
  let faits = 0, echecs = 0;
  // Matricule de départ lu une seule fois sur le serveur, puis +1 à chaque élève
  // (en cas de conflit, insererAvecMatricule reprend le numéro suivant).
  let numero = parseInt((await prochainMatricule('eleves', 'EL-', 4)).replace('EL-', ''), 10);
  for(const l of aImporter){
    bouton.textContent = `Import en cours… ${faits + echecs + 1} / ${aImporter.length}`;
    l.patch.matricule = 'EL-' + String(numero).padStart(4, '0');
    try{
      const cree = await insererAvecMatricule('eleves', l.patch, 'EL-', 4);
      DB.eleves.push(cree);
      numero = parseInt(String(cree.matricule).replace('EL-', ''), 10) + 1;
      faits++;
    }catch(e){ echecs++; l.erreurs.push('échec : ' + e.message); }
  }
  closeModal();
  renderView('eleves');
  toast(`${faits} élève(s) importé(s)` + (echecs ? ` · ${echecs} échec(s)` : ''));
  if(echecs) alert(`${echecs} élève(s) n'ont pas pu être importés. Réessayez l'import : les élèves déjà importés seront ignorés.`);
}
// Fiches à vérifier : l'école voit elle-même ce qui empêche l'application de
// bien fonctionner (date impossible, numéro de parent manquant ou mal saisi,
// qui ferait échouer le bouton WhatsApp). Élèves actifs uniquement.
function numerosParentValides(tel){
  const morceaux = String(tel || '').split(/\s*[\/;,|]\s*|\s+-\s+|\s+et\s+/i)
    .map(m => m.replace(/\D/g, '').replace(/^225/, '')).filter(m => m.length);
  return morceaux.length > 0 && morceaux.every(m => m.length === 10);
}
function problemesFicheEleve(e){
  const p = [];
  const erreurDate = verifierDatesEleve(e.dateNaissance, e.dateInscription);
  if(!e.dateNaissance) p.push('date de naissance manquante');
  else if(erreurDate) p.push('date de naissance impossible');
  if(e.dateInscription && e.dateInscription > todayISO()) p.push('date d’inscription dans le futur');
  if(!String(e.parentTel || '').trim()) p.push('numéro du parent manquant');
  else if(!numerosParentValides(e.parentTel)) p.push('numéro du parent à vérifier (10 chiffres attendus)');
  if(!String(e.parentNom || '').trim()) p.push('nom du parent manquant');
  return p;
}
function renderFichesAVerifier(){
  if(!['secretariat','direction','fondation'].includes(ui.role)) return '';
  const fiches = DB.eleves.filter(e => e.statut === 'Actif')
    .map(e => ({ e, p: problemesFicheEleve(e) })).filter(x => x.p.length)
    .sort((a, b) => a.e.nom.localeCompare(b.e.nom));
  if(fiches.length === 0) return '';
  const ouvert = ui.filters.fichesAVerifierOuvert;
  return `
    <div class="panel">
      <div class="panel-head">
        <div><h2>⚠️ Fiches à vérifier (${fiches.length})</h2><div class="sub">Informations manquantes ou impossibles — à corriger avec les documents de l'élève</div></div>
        <button class="btn secondary sm" onclick="ui.filters.fichesAVerifierOuvert=${!ouvert}; renderView('eleves')">${ouvert ? 'Masquer' : 'Afficher'}</button>
      </div>
      ${ouvert ? `<div class="table-wrap"><table>
        <thead><tr><th>Élève</th><th>Classe</th><th>À corriger</th><th></th></tr></thead>
        <tbody>${fiches.map(({e, p}) => `<tr>
          <td>${escapeHtml(eleveFullName(e))}<br><span class="hint">${escapeHtml(e.matricule || '')}</span></td>
          <td>${escapeHtml(classeName(e.classeId))}</td>
          <td>${p.map(x => `<span class="badge amber" style="margin:1px;">${escapeHtml(x)}</span>`).join(' ')}</td>
          <td><button class="btn secondary sm" onclick="openEleveForm('${e.id}')">Corriger</button></td>
        </tr>`).join('')}</tbody>
      </table></div>` : ''}
    </div>`;
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
    // Classes réelles de l'école pour ce niveau (retrouvées par leur code)
    const classesNiveau = n.classes.map(c => DB.classes.find(dc => codeClasse(dc) === c.id)).filter(Boolean);
    if(classesNiveau.length===0) return '';

    let classesBlocs = classesNiveau.map(c=>{
      const elevesClasse = filtreEleves(DB.eleves.filter(e=>e.classeId===c.id));
      if(filtreActif && elevesClasse.length===0) return '';
      totalAffiche += elevesClasse.length;
      return `
        <div class="panel" style="margin:0 0 12px;box-shadow:none;border:1px solid var(--border);">
          <div class="panel-head" style="padding:12px 14px;">
            <div><h3 style="margin:0;font-size:var(--fs-sm);">${escapeHtml(c.nom)}</h3><div class="sub">${elevesClasse.length} élève(s)</div></div>
            ${elevesClasse.length ? `<span style="display:flex;gap:6px;flex-wrap:wrap;"><button type="button" class="btn secondary sm" onclick="ouvrirListeClasse('${c.id}')">${icone('printer')} Imprimer la liste</button><button type="button" class="btn secondary sm" onclick="ouvrirCartesScolaires('${c.id}')">${icone('credit-card')} Cartes scolaires</button></span>` : ''}
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
          <span class="badge blue" style="font-size:var(--fs-md);">${collapsed ? '▸' : '▾'}</span>
        </div>
        ${collapsed ? '' : `<div style="padding-top:4px;">${classesBlocs}</div>`}
      </div>`;
  }).join('');

  return `
  <div class="view active">
    ${renderPreinscriptions()}
    ${renderDemandesDocuments()}
    ${renderCorrectionsParents()}
    ${renderFichesAVerifier()}
    <div class="panel">
      <div class="panel-head">
        <div><h2>Liste des élèves</h2><div class="sub">${DB.eleves.length} élève(s) au total</div></div>
        <button class="btn secondary" onclick="ouvrirImportEleves()">⬆️ Importer depuis Excel</button>
        <button class="btn secondary" onclick="exporterElevesExcel()">⬇️ Exporter vers Excel</button>
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

/* ---------------------------------------------------------------------
   REMPLISSAGE INTELLIGENT — photo ou vocal → pré-remplissage IA d'un
   formulaire (voir supabase/functions/smart-fill/index.ts). Générique :
   n'importe quel formulaire peut s'y brancher en lui passant un schéma
   de champs et une fonction "onResultat".
   --------------------------------------------------------------------- */
const SCHEMA_ELEVE = [
  {name:'prenom', label:'Prénom', type:'text'},
  {name:'nom', label:'Nom', type:'text'},
  {name:'sexe', label:'Sexe', type:'text', format:'M ou F'},
  {name:'dateNaissance', label:'Date de naissance', type:'date', format:'AAAA-MM-JJ'},
  {name:'parentNom', label:'Nom du parent ou tuteur', type:'text'},
  {name:'parentTel', label:'Téléphone du parent', type:'tel', format:"10 chiffres, Côte d'Ivoire"},
  {name:'parentAdresse', label:'Adresse', type:'text'},
];
const SCHEMA_ENSEIGNANT = [
  {name:'prenom', label:'Prénom', type:'text'},
  {name:'nom', label:'Nom', type:'text'},
  {name:'sexe', label:'Sexe', type:'text', format:'M ou F'},
  {name:'telephone', label:'Téléphone', type:'tel', format:"10 chiffres, Côte d'Ivoire"},
  {name:'email', label:'Email', type:'text'},
  {name:'dateEmbauche', label:"Date d'embauche", type:'date', format:'AAAA-MM-JJ'},
];
const SCHEMA_PERSONNEL = [
  {name:'prenom', label:'Prénom', type:'text'},
  {name:'nom', label:'Nom', type:'text'},
  {name:'poste', label:'Poste / Fonction', type:'text'},
  {name:'telephone', label:'Téléphone', type:'tel', format:"10 chiffres, Côte d'Ivoire"},
];

let smartFillRecorder = null;
let smartFillChunks = [];
let smartFillMinuteur = null;
const SMARTFILL_DUREE_MAX = 120; // secondes d'enregistrement vocal au maximum

function ouvrirRemplissageIntelligent(formulaire, schema, onResultat){
  window.__smartFillOnResultat = onResultat;
  window.__smartFillFormulaire = formulaire;
  window.__smartFillSchema = schema;
  window.__smartFillResultat = null;
  $('#smartFillBody').innerHTML = renderSmartFillModal();
  $('#smartFillBackdrop').classList.add('open');
}
function closeSmartFillModal(){
  arreterEnregistrementSmartFill(true);
  $('#smartFillBackdrop').classList.remove('open');
  $('#smartFillBody').innerHTML = '';
}
$('#smartFillClose').addEventListener('click', closeSmartFillModal);
$('#smartFillBackdrop').addEventListener('click', e=>{ if(e.target.id==='smartFillBackdrop') closeSmartFillModal(); });
function renderSmartFillModal(etat, message){
  if(etat==='chargement'){
    return `<div style="text-align:center;padding:30px 10px;" role="status" aria-live="polite">
      <div style="font-size:2rem;" class="em-spin">⏳</div>
      <div class="hint">Analyse en cours… (quelques secondes)</div>
    </div>`;
  }
  return `
    <div class="hint" style="margin-bottom:14px;">Trois façons de remplir la fiche sans tout taper : une <strong>photo</strong> de document (acte de naissance, fiche de renseignements — recto et verso possibles), un <strong>message vocal</strong>, ou un <strong>texte collé</strong> (par exemple un message WhatsApp du parent). Vous relisez tout avant de l’appliquer.</div>
    ${message ? `<div class="pin-error" style="margin-bottom:12px;" role="alert">${escapeHtml(message)}</div>` : ''}
    <div class="sf-sources">
      <div class="sf-source">
        <div class="sf-ic">📷</div><strong>Photo</strong>
        <label class="btn secondary sm" style="cursor:pointer;">Prendre / choisir (1 ou 2)
          <input type="file" accept="image/*" multiple style="display:none;" onchange="handleSmartFillPhoto(event)">
        </label>
      </div>
      <div class="sf-source">
        <div class="sf-ic">🎤</div><strong>Vocal</strong>
        <button type="button" class="btn secondary sm" id="btnSmartFillRec" onclick="handleSmartFillToggleRecord()">⏺️ Enregistrer</button>
        <span class="hint" id="smartFillDuree" style="margin:0;"></span>
        <label class="btn secondary sm" style="cursor:pointer;">Importer (dont WhatsApp)
          <input type="file" accept="audio/*" style="display:none;" onchange="handleSmartFillAudioFichier(event)">
        </label>
      </div>
      <div class="sf-source sf-texte">
        <div class="sf-ic">📝</div><strong>Texte</strong>
        <textarea id="smartFillTexte" rows="4" maxlength="4000" placeholder="Collez ici le message du parent : nom de l’enfant, date de naissance, téléphone…"></textarea>
        <button type="button" class="btn secondary sm" onclick="handleSmartFillTexte()">Analyser le texte</button>
      </div>
    </div>
    <div class="form-actions"><button type="button" class="btn secondary" onclick="closeSmartFillModal()">Annuler</button></div>
  `;
}
// Aperçu avant application : la personne voit ce qui a été trouvé et le niveau de certitude
function renderSmartFillApercu(resultat){
  const schema = window.__smartFillSchema || [];
  const badge = c => c === 'élevé' ? '<span class="badge green">sûr</span>' : c === 'moyen' ? '<span class="badge amber">à vérifier</span>' : '<span class="badge">non trouvé</span>';
  const trouves = schema.filter(c => resultat[c.name] && resultat[c.name].valeur);
  return `<div class="hint" style="margin-bottom:10px;">${trouves.length ? `${trouves.length} information(s) trouvée(s) sur ${schema.length}. Vérifiez puis appliquez : la fiche n’est pas encore enregistrée.` : 'Aucune information n’a pu être lue. Essayez une photo plus nette, bien éclairée, ou un autre moyen.'}</div>
    <table class="eb-table"><tbody>${schema.map(c => { const r = resultat[c.name] || {}; return `<tr><td>${escapeHtml(c.label)}</td><td><strong>${r.valeur ? escapeHtml(r.valeur) : '—'}</strong></td><td>${badge(r.valeur ? r.confiance : 'faible')}</td></tr>`; }).join('')}</tbody></table>
    <div class="form-actions">
      <button type="button" class="btn secondary" onclick="$('#smartFillBody').innerHTML = renderSmartFillModal()">Recommencer</button>
      ${trouves.length ? `<button type="button" class="btn" onclick="appliquerSmartFill()">✓ Appliquer à la fiche</button>` : ''}
    </div>`;
}
function appliquerSmartFill(){
  const r = window.__smartFillResultat; const cb = window.__smartFillOnResultat;
  closeSmartFillModal();
  if(r && cb) cb(r);
}
function smartFillFichierEnBase64(fichier){
  return new Promise((resolve, reject) => {
    const lecteur = new FileReader();
    lecteur.onload = () => resolve(String(lecteur.result).split(',')[1]);
    lecteur.onerror = () => reject(new Error('Fichier illisible.'));
    lecteur.readAsDataURL(fichier);
  });
}
// Photo réduite sur le téléphone (1600 px, JPEG) : envoi rapide même en 3G
function smartFillCompresserImage(fichier){
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(fichier);
    img.onload = () => {
      const ratio = Math.min(1, 1600 / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * ratio);
      canvas.height = Math.round(img.height * ratio);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.82).split(',')[1]);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Format de photo non lu (HEIC ?) : prenez la photo directement depuis ce bouton, ou envoyez-la en JPG.')); };
    img.src = url;
  });
}
async function handleSmartFillPhoto(ev){
  const fichiers = [...(ev.target.files || [])].slice(0, 2);
  if(!fichiers.length) return;
  try{
    const photos = [];
    for(const f of fichiers) photos.push(await smartFillCompresserImage(f));
    await smartFillEnvoyer({ typeSource: 'photo', fichiersBase64: photos, mimeType: 'image/jpeg' });
  }catch(e){ $('#smartFillBody').innerHTML = renderSmartFillModal(null, e.message); }
}
async function handleSmartFillAudioFichier(ev){
  const fichier = ev.target.files[0];
  if(!fichier) return;
  if(fichier.size > 8 * 1024 * 1024){ $('#smartFillBody').innerHTML = renderSmartFillModal(null, 'Fichier audio trop lourd (8 Mo maximum, environ 2 minutes).'); return; }
  try{
    const base64 = await smartFillFichierEnBase64(fichier);
    await smartFillEnvoyer({ typeSource: 'audio', fichierBase64: base64, mimeType: fichier.type || 'audio/ogg' });
  }catch(e){ $('#smartFillBody').innerHTML = renderSmartFillModal(null, e.message); }
}
async function handleSmartFillTexte(){
  const texte = ($('#smartFillTexte')?.value || '').trim();
  if(texte.length < 5){ $('#smartFillBody').innerHTML = renderSmartFillModal(null, 'Collez d’abord le texte à analyser.'); return; }
  await smartFillEnvoyer({ typeSource: 'texte', texte });
}
function arreterEnregistrementSmartFill(annuler){
  clearInterval(smartFillMinuteur); smartFillMinuteur = null;
  if(smartFillRecorder && smartFillRecorder.state === 'recording'){
    if(annuler) smartFillRecorder.onstop = () => { try{ smartFillRecorder.stream.getTracks().forEach(t => t.stop()); }catch(_e){} };
    smartFillRecorder.stop();
  }
}
async function handleSmartFillToggleRecord(){
  const btn = $('#btnSmartFillRec');
  if(smartFillRecorder && smartFillRecorder.state === 'recording'){ arreterEnregistrementSmartFill(false); return; }
  try{
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    smartFillChunks = [];
    smartFillRecorder = new MediaRecorder(stream);
    smartFillRecorder.ondataavailable = (e) => { if(e.data && e.data.size) smartFillChunks.push(e.data); };
    smartFillRecorder.onstop = async () => {
      stream.getTracks().forEach(t => t.stop());
      const blob = new Blob(smartFillChunks, { type: smartFillRecorder.mimeType || 'audio/webm' });
      if(blob.size < 2000){ $('#smartFillBody').innerHTML = renderSmartFillModal(null, 'Enregistrement trop court : parlez quelques secondes.'); return; }
      const base64 = await smartFillFichierEnBase64(blob);
      await smartFillEnvoyer({ typeSource: 'audio', fichierBase64: base64, mimeType: blob.type });
    };
    smartFillRecorder.start(1000);
    const debut = Date.now();
    if(btn){ btn.textContent = '⏹️ Arrêter et analyser'; btn.classList.add('btn-recording'); }
    smartFillMinuteur = setInterval(() => {
      const s = Math.round((Date.now() - debut) / 1000);
      const z = $('#smartFillDuree'); if(z) z.textContent = `🔴 ${s} s / ${SMARTFILL_DUREE_MAX} s`;
      if(s >= SMARTFILL_DUREE_MAX) arreterEnregistrementSmartFill(false);
    }, 500);
  }catch(e){ $('#smartFillBody').innerHTML = renderSmartFillModal(null, "Impossible d'accéder au microphone : autorisez-le dans le navigateur, puis réessayez."); }
}
async function smartFillEnvoyer(source){
  if(!navigator.onLine){ $('#smartFillBody').innerHTML = renderSmartFillModal(null, 'Pas de connexion internet : le remplissage automatique a besoin du réseau.'); return; }
  $('#smartFillBody').innerHTML = renderSmartFillModal('chargement');
  try{
    const { data, error } = await sb.functions.invoke('smart-fill', {
      body: { formulaire: window.__smartFillFormulaire, schema: window.__smartFillSchema, ...source },
    });
    if(error) throw new Error(await messageErreurFonction(error));
    if(!data?.ok) throw new Error(data?.error || 'Échec du remplissage automatique');
    window.__smartFillResultat = data.resultat;
    $('#smartFillBody').innerHTML = renderSmartFillApercu(data.resultat);
  }catch(e){ $('#smartFillBody').innerHTML = renderSmartFillModal(null, e.message); }
}
function appliquerRemplissage(formId, resultat){
  const form = document.getElementById(formId);
  if(!form) return;
  let nbRemplis = 0, nbAVerifier = 0;
  for(const champ in resultat){
    const { valeur, confiance } = resultat[champ];
    const input = form.elements[champ];
    if(!input || valeur == null || valeur === '') continue;
    // Liste déroulante : on ne choisit qu'une option qui existe vraiment
    if(input.tagName === 'SELECT' && ![...input.options].some(o => o.value === valeur)) continue;
    input.value = valeur;
    input.classList.remove('champ-a-verifier');
    input.classList.add('champ-pre-rempli');
    input.addEventListener('input', () => input.classList.remove('champ-pre-rempli', 'champ-a-verifier'), { once: true });
    nbRemplis++;
    if(confiance !== 'élevé'){ input.classList.add('champ-a-verifier'); nbAVerifier++; }
  }
  toast(nbRemplis ? `${nbRemplis} champ(s) pré-rempli(s)${nbAVerifier ? ', ' + nbAVerifier + ' à vérifier (en orange)' : ''} — relisez puis enregistrez` : "Aucune information n'a pu être extraite");
}

function openEleveForm(id){
  ui._preinscriptionId = null; // remis par inscrireDepuisPreinscription() juste après, le cas échéant
  const e = id ? eleveById(id) : null;
  openModal(e ? "Modifier l'élève" : 'Nouvel élève', `
    <form id="formEleve" onsubmit="return handleSaveEleve(event)">
      <input type="hidden" name="id" value="${e?e.id:''}">
      <button type="button" class="btn secondary sm" style="margin-bottom:14px;" onclick="ouvrirRemplissageIntelligent('eleve', SCHEMA_ELEVE, (r)=>appliquerRemplissage('formEleve', r))">✨ Remplir automatiquement</button>
      ${e ? `<button type="button" class="btn secondary sm" style="margin-bottom:14px;" onclick="ouvrirSecuriteEleve('${e.id}')">🛡️ Sécurité & santé</button>
      <button type="button" class="btn secondary sm" style="margin-bottom:14px;" onclick="ouvrirCertificatScolarite('${e.id}')">📄 Certificat de scolarité</button>` : ''}
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
        <div class="field span2"><label style="display:flex;align-items:center;gap:8px;"><input type="checkbox" name="renforcement" ${e?.renforcement?'checked':''}> Suit le cours de renforcement (après la fin des cours)</label>
          <div class="hint" style="margin:2px 0 0;">Ses parents seront prévenus qu’il est retenu, puis de la fin du renforcement.</div></div>
      </div>
      <div class="form-actions">
        <button type="button" class="btn secondary" onclick="closeModal()">Annuler</button>
        <button type="submit" class="btn">Enregistrer</button>
      </div>
    </form>`);
}

function verifierDatesEleve(naissance, inscription){
  if(!naissance) return null;
  const aujourdHui = todayISO();
  if(naissance > aujourdHui) return { champ:'dateNaissance', message:"La date de naissance ne peut pas être dans le futur." };
  if(inscription && naissance >= inscription) return { champ:'dateNaissance', message:"La date de naissance doit être antérieure à la date d'inscription (" + fmtDate(inscription) + ")." };
  const ref = new Date(inscription || aujourdHui); const n = new Date(naissance);
  const mois = (ref.getFullYear() - n.getFullYear())*12 + (ref.getMonth() - n.getMonth()) - (ref.getDate() < n.getDate() ? 1 : 0);
  if(mois < 6) return { champ:'dateNaissance', message:"L'enfant aurait moins de 6 mois à l'inscription : vérifiez la date de naissance." };
  return null;
}
// Matricule suivant = plus grand numéro déjà attribué dans l'école + 1 (et non
// « nombre de fiches + 1 », qui redonnait un numéro existant après une
// suppression — cause des deux élèves EL-0005). La liste est relue sur le
// serveur pour tenir compte des fiches créées par un autre poste ; hors ligne,
// on se rabat sur les données de l'appareil.
async function prochainMatricule(table, prefixe, largeur){
  let matricules = (table === 'eleves' ? DB.eleves : DB.enseignants || []).map(x => x.matricule);
  try{
    const { data, error } = await sb.from(table).select('matricule').eq('ecole_id', session.ecoleId);
    if(!error && data) matricules = matricules.concat(data.map(x => x.matricule));
  }catch(_e){ /* hors ligne : données locales */ }
  const max = matricules.reduce((m, mat) => {
    const n = parseInt(String(mat || '').replace(prefixe, ''), 10);
    return String(mat || '').startsWith(prefixe) && Number.isFinite(n) && n > m ? n : m;
  }, 0);
  return prefixe + String(max + 1).padStart(largeur, '0');
}
// La base refuse un matricule déjà pris (schema.sql section 45) : si un autre
// poste vient de l'utiliser, on reprend le numéro suivant (2 essais au plus).
async function insererAvecMatricule(table, patch, prefixe, largeur){
  for(let essai = 0; ; essai++){
    try{ return await dbInsert(table, patch); }
    catch(e){
      const doublon = e && (e.code === '23505' || /matricule_unique_par_ecole/.test(e.message || ''));
      if(!doublon || essai >= 2) throw doublon ? new Error('Ce matricule est déjà utilisé ; réessayez dans un instant.') : e;
      patch.matricule = await prochainMatricule(table, prefixe, largeur);
    }
  }
}
async function handleSaveEleve(ev){
  ev.preventDefault();
  const fd = new FormData(ev.target);
  const id = fd.get('id');
  const patch = {
    matricule: (id && eleveById(id)?.matricule) || null,
    prenom: fd.get('prenom').trim(), nom: fd.get('nom').trim(), sexe: fd.get('sexe'),
    dateNaissance: fd.get('dateNaissance'), classeId: fd.get('classeId'), statut: fd.get('statut'),
    parentNom: fd.get('parentNom').trim(), parentTel: fd.get('parentTel').trim(),
    parentAdresse: fd.get('parentAdresse').trim(), dateInscription: fd.get('dateInscription') || todayISO(),
    renforcement: fd.get('renforcement') === 'on',
  };
  const erreurDate = verifierDatesEleve(patch.dateNaissance, patch.dateInscription);
  ev.target.querySelectorAll('.field.has-error').forEach(f => { f.classList.remove('has-error'); const m = f.querySelector('.error-text'); if(m) m.remove(); });
  if(erreurDate){
    const champ = ev.target.querySelector(`[name="${erreurDate.champ}"]`);
    const field = champ && champ.closest('.field');
    if(field){
      field.classList.add('has-error');
      champ.setAttribute('aria-invalid', 'true');
      const m = document.createElement('div'); m.className = 'error-text'; m.id = 'err-' + erreurDate.champ; m.textContent = erreurDate.message;
      field.appendChild(m); champ.setAttribute('aria-describedby', m.id); champ.focus();
    } else toast('Erreur : ' + erreurDate.message);
    return false;
  }
  // Date d'inscription future : permise (pré-inscription pour la rentrée), mais
  // on fait confirmer une seule fois, quand la date est saisie ou modifiée.
  const inscriptionAvant = id ? eleveById(id)?.dateInscription : null;
  if(patch.dateInscription > todayISO() && patch.dateInscription !== inscriptionAvant
     && !confirm(`La date d'inscription (${fmtDate(patch.dateInscription)}) est dans le futur. Est-ce bien voulu ?`)){
    const champ = ev.target.querySelector('[name="dateInscription"]');
    if(champ) champ.focus();
    return false;
  }
  if(!patch.matricule) patch.matricule = await prochainMatricule('eleves', 'EL-', 4);
  try{
    if(id){
      await dbUpdate('eleves', id, patch);
      const idx = DB.eleves.findIndex(e=>e.id===id);
      DB.eleves[idx] = {...DB.eleves[idx], ...patch};
    } else {
      DB.eleves.push(await insererAvecMatricule('eleves', patch, 'EL-', 4));
      // Inscription faite depuis une pré-inscription en ligne : on la marque « inscrite »
      if(ui._preinscriptionId){ const pid = ui._preinscriptionId; ui._preinscriptionId = null; await statutPreinscription(pid, 'inscrite', false).catch(() => {}); }
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

/* ---------------------------------------------------------------------
   Comptes parent liés à un élève (fiche élève)
   --------------------------------------------------------------------- */
function renderComptesParentEleve(eleveId){
  const liens = (DB.parentsEleves||[]).filter(pe=>pe.eleveId===eleveId);
  if(!liens.length) return `<div class="empty">Aucun compte parent créé pour l'instant.</div>`;
  return `<table class="table">
    <thead><tr><th>Nom</th><th></th></tr></thead>
    <tbody>
      ${liens.map(pe=>{
        const profil = (DB.profiles||[]).find(p=>p.id===pe.parentProfileId);
        return `<tr>
          <td>${escapeHtml(profil?profil.nomComplet:'—')}</td>
          <td style="text-align:right;"><button class="btn secondary sm" onclick="retirerAccesParent('${pe.id}','${eleveId}')">Retirer l'accès</button></td>
        </tr>`;
      }).join('')}
    </tbody>
  </table>`;
}
function ouvrirCreerCompteParent(eleveId){
  openModal('Créer un compte parent', `
    <form onsubmit="return handleCreerCompteParent(event, '${eleveId}')">
      <div class="field">
        <label>Nom complet du parent</label>
        <input type="text" id="parentCompteNom" required autofocus>
      </div>
      <div class="field">
        <label>Email du parent</label>
        <input type="email" id="parentCompteEmail" required>
      </div>
      <div class="hint" style="margin-top:6px;">Le parent recevra un accès sans mot de passe défini ici : indiquez-lui de cliquer sur « Mot de passe oublié ? » sur l'écran de connexion (espace Parent) pour choisir le sien. Si un compte existe déjà pour cet email (ex. l'autre parent), il sera simplement relié à cet élève.</div>
      <button class="btn" type="submit" style="width:100%;margin-top:14px;">Créer / relier le compte</button>
    </form>
  `);
}
async function handleCreerCompteParent(ev, eleveId){
  ev.preventDefault();
  const parentNom = $('#parentCompteNom').value.trim();
  const parentEmail = $('#parentCompteEmail').value.trim();
  try{
    const { data, error } = await sb.functions.invoke('creer-compte-parent', { body: { eleveId, parentNom, parentEmail } });
    if(error) throw new Error(await messageErreurFonction(error));
    if(!data?.ok) throw new Error(data?.error || 'Échec de la création du compte parent');
    DB.parentsEleves = DB.parentsEleves || [];
    DB.parentsEleves.push({ id: crypto.randomUUID(), ecoleId: session.ecoleId, parentProfileId: data.parentUserId, eleveId });
    if(data.nouveauCompte){
      DB.profiles = DB.profiles || [];
      DB.profiles.push({ id: data.parentUserId, ecoleId: session.ecoleId, role:'parent', nomComplet: parentNom });
    }
    closeModal();
    toast(data.nouveauCompte ? 'Compte parent créé' : 'Compte parent existant relié à cet élève');
    renderView('eleves');
  }catch(e){ alert('Erreur : ' + e.message); }
  return false;
}
async function retirerAccesParent(peId, eleveId){
  if(!confirm("Retirer l'accès de ce parent à cet élève ?")) return;
  try{
    const { error } = await exigerEffet(sb.from('parents_eleves').delete().eq('id', peId));
    if(error) throw error;
    DB.parentsEleves = (DB.parentsEleves||[]).filter(pe=>pe.id!==peId);
    toast('Accès retiré');
    renderView('eleves');
  }catch(e){ alert('Erreur : ' + e.message); }
}

// Fiche élève (personnel) : l'essentiel pour répondre à un parent au téléphone
function renderEleveCoupDoeil(e){
  chargerSecuriteEleves();
  const sante = santeDe(e.id), pers = personnesDe(e.id);
  const admin = ['secretariat','direction','fondation'].includes(ui.role);
  let scol = null;
  try{ if(admin) scol = scolariteEleveParEcheance(e.id); }catch(_e){}
  const msgs = (DB.messagesInternes || []).filter(m => m.eleveId === e.id && m.destinataireType === 'parent')
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || ''))).slice(0, 3);
  const tels = telephonesWhatsapp(e.parentTel);
  return `<div class="panel">
    <div class="panel-head"><div><h2>🧾 En un coup d’œil</h2></div></div>
    <div class="grid-3">
      ${scol && scol.total ? `<div><div class="hint">Scolarité</div><strong>${scol.reste ? 'Reste ' + fmtFCFA(scol.reste) : '✅ Soldée'}</strong><div class="hint">${fmtFCFA(scol.totalPaye)} payés sur ${fmtFCFA(scol.total)}</div></div>` : ''}
      <div><div class="hint">Santé</div><strong>${sante && sante.allergies ? '⚕️ ' + escapeHtml(sante.allergies) : 'Aucune allergie indiquée'}</strong>${sante && sante.infos ? `<div class="hint">${escapeHtml(sante.infos.slice(0, 120))}</div>` : ''}</div>
      <div><div class="hint">Peuvent venir le chercher</div><strong>${pers.length ? pers.map(p => escapeHtml(p.nom) + (p.lien ? ` (${escapeHtml(p.lien)})` : '')).join(', ') : 'Parents seulement (rien d’indiqué)'}</strong></div>
    </div>
    ${msgs.length ? `<div class="hint" style="margin:12px 0 4px;">Derniers messages envoyés au parent</div>${msgs.map(m => `<div style="padding:4px 0;border-bottom:1px solid var(--border);">${m.lu ? '<span class="badge green">✓✓ Lu</span>' : '<span class="badge">✓ Envoyé</span>'} <span class="hint">${m.createdAt ? fmtDate(String(m.createdAt).slice(0, 10)) : ''}</span> ${escapeHtml(String(m.contenu || '').slice(0, 110))}</div>`).join('')}` : ''}
    <div class="form-actions no-print" style="justify-content:flex-start;flex-wrap:wrap;">
      ${tels.length ? `<a class="btn sm" href="https://wa.me/${tels[0]}" target="_blank" rel="noopener">📲 WhatsApp du parent</a><a class="btn secondary sm" href="tel:+${tels[0]}">📞 Appeler</a>` : ''}
      ${admin ? `<button class="btn secondary sm" onclick="ouvrirSecuriteEleve('${e.id}')">🛡️ Sécurité & santé</button><button class="btn secondary sm" onclick="ouvrirCertificatScolarite('${e.id}')">📄 Certificat</button>` : ''}
    </div>
  </div>`;
}
function renderEleveProfile(id){
  const e = eleveById(id);
  if(!e){ ui.eleveProfileId=null; return renderEleveListe(); }
  const trimestre = ui.filters.bulletinTrimestre || 'Trimestre 1';
  ui.filters.bulletinTrimestre = trimestre;

  const cycle = classeCycle(e.classeId);
  const matieres = MATIERES_BY_CYCLE[cycle];
  let sumMoy = 0, countMat = 0;
  const bulletinRows = matieres.map(mat=>{
    const mm = moyenneMatiere(id, mat, trimestre);
    const moy = mm.moy, coef = coefficientDe(cycle, mat);
    if(moy!==null){ sumMoy += moy * coef; countMat += coef; }
    return `<tr>
      <td>${mat}</td>
      <td>${mm.classe!==null?mm.classe.toFixed(2):'—'}</td>
      <td>${mm.compo!==null?mm.compo.toFixed(2):'—'}</td>
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

  const presRows = presences.slice(0,30).map(p=>`
    <li class="pr-ligne"><span class="pr-date"><strong>${fmtDate(p.date)}</strong><small>${weekdayFR(p.date)}</small></span>
      <span class="badge-etat ${p.statut==='Présent'?'ok':p.statut==='Absent'?'erreur':'attente'}">${p.statut}</span>
      ${p.motif ? `<span class="pr-motif">${escapeHtml(p.motif)}</span>` : ''}</li>`).join('');
  const onglet = ['infos','bulletin','presences'].includes(ui.filters.profilOnglet) ? ui.filters.profilOnglet : 'infos';

  const commentKey = `${id}_${trimestre}`;
  const comment = DB.bulletinsComments[commentKey] || '';

  return `
  <div class="view active">
    <button class="btn secondary sm no-print" style="margin-bottom:14px;" onclick="ui.eleveProfileId=null; ui.filters.profilOnglet='infos'; renderView('eleves')">← Retour à la liste</button>

    <div class="panel">
      <div class="profile-head">
        <span class="avatar">${initials(e.prenom,e.nom)}</span>
        <div>
          <h2>${escapeHtml(eleveFullName(e))}</h2>
          <div class="meta">${classeName(e.classeId)} · ${ageFromISO(e.dateNaissance)} ans · Matricule ${escapeHtml(e.matricule)} · <span class="badge ${e.statut==='Actif'?'green':'gray'}">${e.statut}</span></div>
        </div>
      </div>
      <div class="grid-3 profil-infos">
        <div><div class="hint">Parent / Tuteur</div><strong>${escapeHtml(e.parentNom)}</strong></div>
        <div><div class="hint">Téléphone</div><strong>${escapeHtml(e.parentTel)}</strong></div>
        <div><div class="hint">Adresse</div><strong>${escapeHtml(e.parentAdresse||'—')}</strong></div>
        <div><div class="hint">Date de naissance</div><strong>${fmtDate(e.dateNaissance)}</strong></div>
        <div><div class="hint">Date d'inscription</div><strong>${fmtDate(e.dateInscription)}</strong></div>
        <div><div class="hint">Taux de présence global</div><strong>${tauxPresence===null?'—':tauxPresence+'%'}</strong></div>
      </div>
    </div>

    <div class="segmente profil-onglets no-print" role="tablist" aria-label="Fiche de l’élève">${[['infos', 'Infos'], ['bulletin', 'Bulletin'], ['presences', `Présences (${totalP})`]].map(([k, l]) => `<button type="button" role="tab" class="seg${onglet === k ? ' actif' : ''}" aria-selected="${onglet === k}" onclick="ui.filters.profilOnglet='${k}'; renderView('eleves')">${l}</button>`).join('')}</div>

    ${onglet === 'infos' ? `${renderEleveCoupDoeil(e)}

    <div class="panel">
      <div class="panel-head">
        <div><h2>👪 Compte(s) parent</h2><div class="sub">Accès à l'espace parent (messagerie, notifications) pour cet élève</div></div>
        <button class="btn sm" onclick="ouvrirCreerCompteParent('${id}')">+ Créer un compte parent</button>
      </div>
      ${renderComptesParentEleve(id)}
    </div>` : ''}

    ${onglet === 'bulletin' ? `
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
        <div class="table-wrap"><table class="sans-cartes bulletin-mini">
          <thead><tr><th>Matière</th><th>Moy. classe</th><th>Compo.</th><th>Moyenne</th><th>Appréciation</th></tr></thead>
          <tbody>${bulletinRows}</tbody>
        </table></div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:14px;padding-top:14px;border-top:1px solid var(--border);">
          <div>Moyenne générale : <span class="bulletin-grade ${moyGenerale!==null?moyenneClass(moyGenerale):''}" style="font-size:var(--fs-lg);">${moyGenerale!==null?moyGenerale.toFixed(2):'—'}</span> / 20</div>
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
      </div>` : ''}

    ${onglet === 'presences' ? `
      <div class="panel">
        <div class="panel-head"><div><h2>Présences</h2><div class="sub">${totalP} enregistrement(s)${totalP > 30 ? ' · les 30 derniers ci-dessous' : ''}</div></div></div>
        <div style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap;">
          <span class="badge green">Présent: ${nbPresent}</span>
          <span class="badge red">Absent: ${nbAbsent}</span>
          <span class="badge amber">Retard: ${nbRetard}</span>
        </div>
        ${presRows ? `<ul class="pr-liste">${presRows}</ul>` : `<div class="etat-vide"><span class="etat-vide-ic" aria-hidden="true">${icone('calendar')}</span><span>Aucun appel enregistré pour cet élève.</span></div>`}
      </div>` : ''}
  </div>`;
}

async function publierBulletins(trimestre, publier){
  const actuels = DB.meta.bulletinsPublies || [];
  if(publier && !confirm(`Publier les bulletins du ${trimestre} ? Chaque parent verra les notes et l’appréciation de ses enfants, et recevra une notification.`)){ renderView('notes'); return; }
  const liste = publier ? [...new Set(actuels.concat(trimestre))] : actuels.filter(t => t !== trimestre);
  try{
    if(publier){ const nb = await figerResultats(trimestre); if(!nb && !confirm('Aucune moyenne n’a pu être calculée pour ce trimestre. Publier quand même ?')){ renderView('notes'); return; } }
    const { error } = await exigerEffet(sb.from('ecoles').update({ bulletins_publies: liste }).eq('id', session.ecoleId));
    if(error) throw error;
    DB.meta.bulletinsPublies = liste;
    if(publier){
      const avecNotes = [...new Set((DB.notes || []).filter(n => n.trimestre === trimestre).map(n => n.eleveId))];
      notifierParentsPush(avecNotes, `📒 Le bulletin du ${trimestre} est disponible dans votre application.`);
    }
    toast(publier ? `Bulletins du ${trimestre} publiés aux parents` : `Bulletins du ${trimestre} masqués aux parents`);
  }catch(e){ alert('Erreur : ' + e.message); renderView('notes'); }
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
    const compo = notes.find(n=>n.type==='Composition');
    const m = moyenneMatiere(e.id, f.matiere, f.trimestre);
    return `<tr>
      <td><div class="row-name"><span class="avatar">${initials(e.prenom,e.nom)}</span>${escapeHtml(eleveFullName(e))}</div></td>
      <td>${m.classe !== null ? `<strong>${m.classe.toFixed(2)}</strong> <span class="hint">(${m.nbClasse} note${m.nbClasse > 1 ? 's' : ''})</span>` : '<span class="hint">—</span>'}</td></td>
      <td><input type="number" min="0" max="20" step="0.5" data-eleve="${e.id}" data-type="Composition" value="${compo?compo.note:''}" style="width:70px;padding:6px 8px;border:1px solid var(--border);border-radius:var(--r-control);"></td>
    </tr>`;
  }).join('');

  return `
  <div class="view active">
    <div class="section-note">💡 Ici : la note de <strong>composition</strong> de chaque élève. Les devoirs, exercices de classe et de maison se saisissent dans <a href="#" onclick="go('camps-de-base'); return false;">🏕️ Camps de base</a> : leur moyenne s’affiche ci-dessous et entre dans le bulletin (classe + 2 × composition) ÷ 3. Consultez le bulletin complet d'un élève depuis sa fiche profil (menu Élèves).</div>
    ${['direction','fondation'].includes(ui.role) ? `<div class="panel">
      <div class="panel-head"><div><h2>📒 Bulletins visibles par les parents</h2><div class="sub">Publiez un trimestre quand toutes les notes sont saisies : chaque parent verra le bulletin de SES enfants dans son application</div></div></div>
      <div style="display:flex;flex-wrap:wrap;gap:14px;">${TRIMESTRES.map(t => `<label style="display:flex;align-items:center;gap:8px;font-weight:700;"><input type="checkbox" ${(DB.meta.bulletinsPublies || []).includes(t) ? 'checked' : ''} onchange="publierBulletins('${t}', this.checked)"> ${t} publié</label>`).join('')}</div>
    </div>` : ''}

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
        <thead><tr><th>Élève</th><th>Moy. de classe /20 <span class="hint">(Camps de base)</span></th><th>Note Composition /20</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
      <div class="form-actions"><button class="btn" onclick="saveNotesTable()">Enregistrer les notes</button></div>`}
    </div>
    ${renderResultatsTrimestre(f.classeId, f.trimestre)}
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

  // Absences signalées par les parents (chargées une fois, puis l'appel se réaffiche)
  if(DB.absencesSignalees === undefined){
    DB.absencesSignalees = null;
    chargerAbsencesSignalees().then(() => { if(ui.currentView === 'presences-eleves') renderView('presences-eleves'); }).catch(() => { DB.absencesSignalees = []; });
  }
  const eleves = DB.eleves.filter(e=>e.classeId===f.classeId && e.statut==='Actif').sort((a,b)=>a.nom.localeCompare(b.nom));
  const nbSignalees = eleves.filter(e => absenceSignalee(e.id, f.date)).length;
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
      <div class="panel-head"><div><h2>Feuille de présence</h2><div class="sub">Par classe et par date</div></div></div>
      ${nbSignalees ? `<div class="section-note">${nbSignalees} absence(s) signalée(s) à l'avance par les parents : déjà marquée(s) « Absent » ci-dessous. Vérifiez puis enregistrez.</div>` : ''}
      <div class="filters">
        <select onchange="ui.filters.presEleves.classeId=this.value; renderView('presences-eleves')">
          ${mesClasses.map(c=>`<option value="${c.id}" ${f.classeId===c.id?'selected':''}>${c.nom}</option>`).join('')}
        </select>
        <input type="date" value="${f.date}" onchange="ui.filters.presEleves.date=this.value; renderView('presences-eleves')">
      </div>
      ${eleves.length===0 ? `<div class="empty-state"><div class="em-ic">✅</div>Aucun élève actif dans cette classe.</div>` : `
      ${renderAppelDuJour(f.classeId, eleves, f.date)}`}
    </div>
    ${renderPrevenirParentsWhatsapp(f)}

    <div class="panel">
      <div class="panel-head"><div><h2>Historique récent</h2><div class="sub">20 derniers enregistrements</div></div></div>
      <div class="table-wrap"><table>
        <thead><tr><th>Date</th><th>Élève</th><th>Classe</th><th>Statut</th><th>Motif</th></tr></thead>
        <tbody>${recentRows || '<tr><td colspan="5" class="hint">Aucun enregistrement</td></tr>'}</tbody>
      </table></div>
    </div>
  </div>`;
}

// Absents enregistrés de la classe et du jour affichés : le secrétariat ou la
// direction prévient chaque parent par WhatsApp (gratuit). Les comptes
// enseignants ne voient pas le numéro des parents : panneau masqué pour eux.
function renderPrevenirParentsWhatsapp(f){
  if(!['secretariat','direction','fondation'].includes(ui.role)) return '';
  const absents = DB.presencesEleves.filter(p => p.date===f.date && p.classeId===f.classeId && p.statut==='Absent')
    .map(p => ({ p, e: eleveById(p.eleveId) })).filter(x => x.e);
  if(absents.length===0) return '';
  return `
    <div class="panel">
      <div class="panel-head"><div><h2>📲 Prévenir les parents des absents</h2><div class="sub">Message gratuit par WhatsApp, déjà écrit : il reste à appuyer sur Envoyer</div></div></div>
      <div style="display:flex;flex-wrap:wrap;gap:8px;">
        ${absents.map(({p, e}) => `
          <div style="display:flex;align-items:center;gap:6px;background:var(--surface-2);border:1px solid var(--border);border-radius:var(--r-card);padding:6px 10px;">
            <span style="font-size:var(--fs-xs);">${escapeHtml(eleveFullName(e))}</span>
            <button class="btn secondary sm" onclick="prevenirParentWhatsapp('${e.id}','${p.date}')">Prévenir le parent</button>
          </div>`).join('')}
      </div>
    </div>`;
}
async function prevenirParentWhatsapp(eleveId, date){
  try{
    const rec = DB.presencesEleves.find(p => p.eleveId===eleveId && p.date===date);
    const { data, error } = await sb.functions.invoke('notifier-absence-eleve', { body: { eleveId, date, motif: rec?.motif || '', canal: 'whatsapp' } });
    if(error) throw new Error(await messageErreurFonction(error));
    if(!data?.ok) throw new Error(data?.error || 'Échec de la préparation du message');
    const e = eleveById(eleveId);
    ouvrirEnvoiWhatsapp(`Absence — ${e ? eleveFullName(e) : ''}`, data.telephones || data.telephone, data.message, "WhatsApp s'ouvrira au numéro du parent avec ce message :");
  }catch(e){ alert('Erreur : ' + e.message); }
}
// Appel rapide : toucher le nom fait tourner Présent → Absent → Retard
function majLigneAppel(eleveId){
  const sel = document.querySelector(`.sel-statut[data-eleve="${eleveId}"]`), ligne = document.querySelector(`[data-ligne="${eleveId}"]`);
  if(sel && ligne) ligne.className = 'appel-ligne appel-' + (sel.value === 'Présent' ? 'present' : sel.value === 'Absent' ? 'absent' : 'retard');
  majCompteurAppel();
}
function basculerStatutAppel(eleveId){
  const sel = document.querySelector(`.sel-statut[data-eleve="${eleveId}"]`);
  if(!sel) return;
  sel.value = { 'Présent':'Absent', 'Absent':'Retard', 'Retard':'Présent' }[sel.value] || 'Présent';
  if(navigator.vibrate) try{ navigator.vibrate(10); }catch(_e){}
  majLigneAppel(eleveId);
}
function tousPresents(){
  const date = ui.filters.presEleves?.date;
  $$('.sel-statut').forEach(sel => { if(!absenceSignalee(sel.dataset.eleve, date)){ sel.value = 'Présent'; majLigneAppel(sel.dataset.eleve); } });
}
function majCompteurAppel(){
  const z = document.getElementById('appelCompteur'); if(!z) return;
  const v = $$('.sel-statut').map(s => s.value);
  z.textContent = `${v.filter(x => x === 'Présent').length} présent(s) · ${v.filter(x => x === 'Absent').length} absent(s) · ${v.filter(x => x === 'Retard').length} retard(s)`;
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
      if(statut==='Absent' && !wasAbsent && !absenceSignalee(eleveId, f.date)){ await envoyerNotificationAbsenceEleve(eleveId, f.date, motif); nbNotifs += 3; }
    }
    toast(nbNotifs ? (['secretariat','direction','fondation'].includes(ui.role)
      ? 'Présence enregistrée · prévenez les parents des absents par WhatsApp (plus bas)'
      : 'Présence enregistrée · absences signalées au parent dans son application et à la direction') : 'Présence enregistrée');
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
    if(error) throw new Error(await messageErreurFonction(error));
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
      <td>${profilLie ? `<span class="badge green">Compte personnel</span>` : `<span class="badge amber">Pas encore inscrit</span>`}</td>
      <td style="white-space:nowrap;">
        <button class="icon-btn" title="Modifier" onclick="openEnseignantForm('${t.id}')">✏️</button>
        <button class="icon-btn" title="${profilLie ? 'Son compte' : 'Inviter'}" onclick="ouvrirAccesPersonnel('${t.id}')">🔗</button>
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
      ${renderInvitationEnseignants()}
      <div class="table-wrap"><table>
        <thead><tr><th>Enseignant</th><th>Matricule</th><th>Classe(s)</th><th>Matière(s)</th><th>Téléphone</th><th>Statut</th><th>Accès</th><th>Actions</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
    </div>
  </div>`;
}

// Invitation des enseignants : chacun s'inscrit avec Google et coche ses classes ;
// la direction valide (Paramètres → Demandes d'accès) et sa fiche est créée.
function renderInvitationEnseignants(){
  const avecCompte = (DB.profiles || []).filter(p => p.role === 'enseignant' && p.enseignantId).length;
  let qr = '';
  try{ const q = qrcode(0, 'M'); q.addData(lienApplication('enseignant.html')); q.make(); qr = q.createSvgTag({ cellSize: 3, margin: 1, scalable: true }); }catch(_e){}
  return `<div class="invit-ens${avecCompte ? ' replie' : ''}">
    <div class="invit-ens-qr" aria-hidden="true">${qr}</div>
    <div class="invit-ens-txt">
      <strong>${avecCompte ? `${avecCompte} enseignant${avecCompte > 1 ? 's ont' : ' a'} son application — invitez les autres` : 'Invitez vos enseignants dans leur application'}</strong>
      <span>Chaque enseignant scanne ce code (ou ouvre le lien), touche « Continuer avec Google » et coche ses classes. Vous validez dans Paramètres → Demandes d’accès : sa fiche est créée toute seule, inutile de la saisir avant.</span>
      <div class="invit-ens-actions">
        <button type="button" class="btn sm" onclick="window.open('https://wa.me/?text=' + encodeURIComponent(messagePartageApplication('enseignant.html')), '_blank', 'noopener')">Partager sur WhatsApp</button>
        <button type="button" class="btn secondary sm" onclick="copierLienApplication('enseignant.html')">Copier le lien</button>
        <button type="button" class="btn secondary sm" onclick="imprimerAffiche('enseignant.html')">Affiche A4</button>
      </div>
    </div>
  </div>`;
}
function ouvrirAccesPersonnel(enseignantId){
  const t = enseignantById(enseignantId); if(!t) return;
  const profilLie = (DB.profiles||[]).find(p=>p.enseignantId===enseignantId);
  const classes = t.classesAssignees.map(cid=>classeName(cid)).join(', ') || 'aucune classe';
  const matieres = (t.matieres || []).length ? t.matieres.join(', ') : 'toutes les matières de ses classes';
  if(profilLie){
    openModal('Compte de ' + ensFullName(t), `
      <div class="banniere-discrete" style="margin-bottom:10px;"><span>${icone('circle-check')}</span><span>${escapeHtml(ensFullName(t))} a son <strong>compte personnel</strong>. Personne d’autre ne l’utilise.</span></div>
      <dl class="acces-ens"><div><dt>Classes visibles</dt><dd>${escapeHtml(classes)}</dd></div><div><dt>Matières</dt><dd>${escapeHtml(matieres)}</dd></div></dl>
      <div class="hint">Il ou elle ne voit que ces classes${(t.matieres || []).length ? ' et ces matières' : ''} : pas les autres enseignants, ni les salaires, ni la scolarité. Pour changer ses classes ou ses matières, modifiez sa fiche.</div>
      <div class="form-actions"><button type="button" class="btn secondary" onclick="closeModal()">Fermer</button><button type="button" class="btn" onclick="closeModal(); openEnseignantForm('${t.id}')">Modifier la fiche</button></div>`);
    return;
  }
  const tels = telephonesWhatsapp(t.telephone);
  const texte = encodeURIComponent(messagePartageApplication('enseignant.html'));
  openModal('Inviter ' + ensFullName(t), `
    <p class="hint" style="margin-top:0;">Chaque enseignant a son <strong>propre compte</strong>. ${escapeHtml(ensFullName(t))} ouvre le lien, touche « Continuer avec Google » et coche ses classes ; vous validez dans Paramètres → Demandes d’accès en choisissant « Relier à la fiche existante : ${escapeHtml(ensFullName(t))} ».</p>
    <dl class="acces-ens"><div><dt>Il ou elle verra</dt><dd>${escapeHtml(classes)} — ${escapeHtml(matieres)}</dd></div></dl>
    <div class="form-actions" style="flex-wrap:wrap;">
      ${tels.map(n => `<a class="btn" href="https://wa.me/${n}?text=${texte}" target="_blank" rel="noopener">Envoyer sur WhatsApp · ${n.replace(/^225/, '').replace(/(\d{2})(?=\d)/g, '$1 ')}</a>`).join('')}
      <button type="button" class="btn secondary" onclick="copierLienApplication('enseignant.html')">Copier le lien</button>
      <button type="button" class="btn secondary" onclick="closeModal()">Fermer</button>
    </div>`);
}

function openEnseignantForm(id){
  const t = id ? enseignantById(id) : null;
  const allMatieres = [...new Set(Object.values(MATIERES_BY_CYCLE).flat())];
  openModal(t ? "Modifier l'enseignant" : 'Nouvel enseignant', `
    <div class="hint" style="margin-top:0;">Si vous cochez des <strong>matières</strong>, l’enseignant ne verra et ne saisira que ces matières dans ses classes. Sans matière cochée : toutes les matières de ses classes.</div>
    <form id="formEns" onsubmit="return handleSaveEnseignant(event)">
      <input type="hidden" name="id" value="${t?t.id:''}">
      <button type="button" class="btn secondary sm" style="margin-bottom:14px;" onclick="ouvrirRemplissageIntelligent('enseignant', SCHEMA_ENSEIGNANT, (r)=>appliquerRemplissage('formEns', r))">✨ Remplir automatiquement</button>
      <div class="form-grid">
        <div class="field"><label>Prénom</label><input name="prenom" required value="${t?escapeHtml(t.prenom):''}"></div>
        <div class="field"><label>Nom</label><input name="nom" required value="${t?escapeHtml(t.nom):''}"></div>
        <div class="field"><label>Sexe</label>
          <select name="sexe"><option value="M" ${t?.sexe==='M'?'selected':''}>Masculin</option><option value="F" ${t?.sexe==='F'?'selected':''}>Féminin</option></select>
        </div>
        <div class="field"><label>Téléphone</label><input name="telephone" required value="${t?escapeHtml(t.telephone):''}"></div>
        <div class="field span2"><label>Email</label><input type="email" name="email" value="${t?escapeHtml(t.email):''}"></div>
        <div class="field"><label>Date d'embauche</label><input type="date" name="dateEmbauche" value="${t?t.dateEmbauche:todayISO()}"></div>
        ${(ui.role==='direction' || ui.role==='fondation') ? `<div class="field"><label>Salaire mensuel (${DEVISE})</label><input type="number" name="salaireMensuel" min="0" step="1000" value="${t?t.salaireMensuel||0:75000}"></div>` : ''}
        <div class="field"><label>Statut</label>
          <select name="statut"><option ${t?.statut==='Actif'?'selected':''}>Actif</option><option ${t?.statut==='Inactif'?'selected':''}>Inactif</option></select>
        </div>
        <div class="field span2"><label>Classes assignées</label>
          <div style="display:flex;flex-wrap:wrap;gap:8px;">
            ${DB.classes.map(c=>`<label style="display:flex;align-items:center;gap:5px;font-size:var(--fs-xs);background:var(--surface-2);padding:5px 9px;border-radius:var(--r-control);border:1px solid var(--border);">
              <input type="checkbox" name="classes" value="${c.id}" ${t?.classesAssignees.includes(c.id)?'checked':''}> ${c.nom}</label>`).join('')}
          </div>
        </div>
        <div class="field span2"><label>Matières enseignées</label>
          <div style="display:flex;flex-wrap:wrap;gap:8px;">
            ${allMatieres.map(m=>`<label style="display:flex;align-items:center;gap:5px;font-size:var(--fs-xs);background:var(--surface-2);padding:5px 9px;border-radius:var(--r-control);border:1px solid var(--border);">
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
    matricule: (id && enseignantById(id)?.matricule) || null,
    prenom: fd.get('prenom').trim(), nom: fd.get('nom').trim(), sexe: fd.get('sexe'),
    telephone: fd.get('telephone').trim(), email: fd.get('email').trim(),
    dateEmbauche: fd.get('dateEmbauche') || todayISO(), statut: fd.get('statut'),
    classesAssignees: fd.getAll('classes'), matieres: fd.getAll('matieres'),
  };
  // Le salaire n'est saisi que par Direction/Fondation (le secrétariat ne l'envoie jamais)
  if(fd.has('salaireMensuel')) patch.salaireMensuel = Math.max(0, parseInt(fd.get('salaireMensuel'))||0);
  if(!patch.matricule) patch.matricule = await prochainMatricule('enseignants', 'ENS-', 3);
  try{
    if(id){
      await dbUpdate('enseignants', id, patch);
      if(patch.salaireMensuel === 0) await sb.from('salaires_enseignants').delete().eq('enseignant_id', id);
      const idx = DB.enseignants.findIndex(e=>e.id===id);
      DB.enseignants[idx] = {...DB.enseignants[idx], ...patch};
    } else {
      const cree = await insererAvecMatricule('enseignants', patch, 'ENS-', 3);
      if('salaireMensuel' in patch) cree.salaireMensuel = patch.salaireMensuel;
      DB.enseignants.push(cree);
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

// Refonte (DESIGN.md §11) : onglets Aujourd'hui / Journal / Alertes, tout en cartes.
// Mêmes champs (.sel-statut-ens, data-motif-ens) et même enregistrement qu'avant.
const BADGE_METHODE = m => `<span class="badge ${m==='QR'?'blue':m==='GPS'?'purple':'gray'}">${m === 'QR' ? 'Badge QR' : m || 'Manuel'}</span>`;
const BADGE_STATUT_ENS = st => st === 'Présent' ? `<span class="badge-etat ok">${icone('check')}Présent</span>` : st === 'Absent' ? `<span class="badge-etat erreur">${icone('circle-x')}Absent</span>` : `<span class="badge-etat attente">${icone('clock')}Retard</span>`;
function renderPresencesEnseignants(){
  const date = ui.filters.presEnsDate || todayISO();
  ui.filters.presEnsDate = date;
  const onglet = ui.filters.presEnsOnglet || 'jour';
  const list = DB.enseignants.filter(t=>t.statut==='Actif').sort((a,b)=>a.nom.localeCompare(b.nom));
  const taux = tauxPonctualite(30);
  const nbAlertes = (DB.alertesPointage || []).length;
  const heures = rec => `<span class="pens-heures"><span><small>Arrivée</small><strong>${rec?.heureArrivee ? rec.heureArrivee.slice(0, 5) : '—'}</strong></span><span><small>Départ</small><strong>${rec?.heureDepart ? rec.heureDepart.slice(0, 5) : '—'}</strong></span></span>`;

  const cartesJour = list.map(t => {
    const rec = DB.presencesEnseignants.find(p=>p.enseignantId===t.id && p.date===date);
    const statut = rec ? rec.statut : 'Présent';
    return `<li class="pens-carte" data-statut="${statut}" data-ens-carte="${t.id}">
      <div class="pens-tete">
        <span class="lc-avatar" aria-hidden="true">${escapeHtml(initials(t.prenom, t.nom))}</span>
        <span class="pens-id"><strong>${escapeHtml(ensFullName(t))}</strong><small>${escapeHtml(t.classesAssignees.map(cid=>classeName(cid)).join(', ') || 'Aucune classe')}</small></span>
        ${rec ? BADGE_METHODE(rec.methode) : '<span class="badge gray">Pas encore pointé</span>'}
      </div>
      ${heures(rec)}
      <div class="cj-etats" role="group" aria-label="Statut de ${escapeHtml(ensFullName(t))}">${['Présent', 'Absent', 'Retard'].map(st => `<button type="button" class="cj-btn" data-s="${st}" onclick="choisirStatutEns('${t.id}','${st}')">${st}</button>`).join('')}</div>
      <select data-ens="${t.id}" class="sel-statut-ens" hidden aria-hidden="true">${['Présent', 'Absent', 'Retard'].map(st => `<option ${statut === st ? 'selected' : ''}>${st}</option>`).join('')}</select>
      <input type="text" class="cj-motif" data-motif-ens="${t.id}" placeholder="Motif (facultatif)" aria-label="Motif" value="${escapeHtml(rec?rec.motif:'')}">
    </li>`;
  }).join('');

  const recent = DB.presencesEnseignants.slice().sort((a,b)=> b.date.localeCompare(a.date) || (b.heureArrivee||'').localeCompare(a.heureArrivee||'')).slice(0,20);
  const cartesJournal = recent.map(p => {
    const t = enseignantById(p.enseignantId);
    if(!t) return '';
    return `<li class="pens-carte">
      <div class="pens-tete">
        <span class="lc-avatar" aria-hidden="true">${escapeHtml(initials(t.prenom, t.nom))}</span>
        <span class="pens-id"><strong>${escapeHtml(ensFullName(t))}</strong><small>${fmtDate(p.date)}</small></span>
        ${BADGE_STATUT_ENS(p.statut)}
      </div>
      <div class="pens-pied">${heures(p)}<span class="pens-meta">${p.minutesRetard ? `<span class="badge amber">${p.minutesRetard} min de retard</span>` : ''}${BADGE_METHODE(p.methode)}</span></div>
      ${p.motif ? `<div class="pens-motif">${escapeHtml(p.motif)}</div>` : ''}
    </li>`;
  }).join('');

  const panneauJour = `
    <div class="pens-outils">
      <label class="pens-date"><span>Date</span><input type="date" value="${date}" onchange="ui.filters.presEnsDate=this.value; renderView('presences-enseignants')"></label>
      <span class="hint" style="margin:0;">Les scans du badge QR remplissent cette liste ; corrigez seulement si besoin.</span>
    </div>
    ${list.length ? `<ul class="pens-liste">${cartesJour}</ul>
      <div class="cj-valider"><span class="appel-compteur">${list.length} enseignant${list.length > 1 ? 's' : ''}</span><button class="btn" onclick="savePresencesEnseignants()">Enregistrer la présence</button></div>`
      : `<div class="etat-vide"><span class="etat-vide-ic" aria-hidden="true">${icone('users')}</span><span>Aucun enseignant actif. Ajoutez vos enseignants dans « Enseignants ».</span></div>`}`;

  const panneauGps = `
    <div class="panel">
      <div class="panel-head">
        <div><h2>Pointage GPS</h2><div class="sub">Un lien envoyé à l’enseignant, qui valide sa position sans se connecter</div></div>
        ${(DB.pointagesGps||[]).some(p=>p.date===date) ? `<button class="btn secondary sm no-print" onclick="exporterPointagesGpsCSV()">Exporter (CSV)</button>` : ''}
      </div>
      <details class="pens-explication"><summary>Comment ça marche ?</summary>
        <ol><li>Touchez « Arrivée » ou « Départ » à côté de l’enseignant : il reçoit un lien personnel par WhatsApp.</li>
          <li>Il ouvre le lien sur son téléphone et autorise sa position.</li>
          <li>Son pointage est validé s’il est dans la zone de l’école (Paramètres → Zone de l’établissement), sinon il apparaît « À vérifier » ou « Hors établissement ».</li></ol>
      </details>
      ${!DB.meta.geofenceLatitude ? `<div class="etat-vide"><span class="etat-vide-ic" aria-hidden="true">${icone('map-pin')}</span><span>La zone de l’établissement n’est pas encore configurée. <button type="button" class="lien-discret" onclick="go('parametres')">Ouvrir les Paramètres</button></span></div>` : `
        <ul class="liste-compacte pens-gps">${list.map(t=>`<li class="lc-ligne"><span class="lc-avatar" aria-hidden="true">${escapeHtml(initials(t.prenom, t.nom))}</span><span class="lc-txt"><strong>${escapeHtml(ensFullName(t))}</strong></span>
            <span class="pens-gps-btn"><button class="btn secondary sm" onclick="handleEnvoyerLienPointage('${t.id}','arrivee')">Arrivée</button><button class="btn secondary sm" onclick="handleEnvoyerLienPointage('${t.id}','depart')">Départ</button></span></li>`).join('')}</ul>
        ${renderPointagesGpsDuJour(date)}`}
    </div>`;

  return `
  <div class="view active">
    <div class="panel">
      <div class="panel-head">
        <div><h2>Pointage des enseignants</h2><div class="sub">Arrivée attendue : ${escapeHtml(DB.meta.heureArriveeAttendue || '—')}${taux!=null ? ` · Ponctualité sur 30 jours : <strong class="${taux>=90?'pens-ok':taux>=70?'':'pens-ko'}">${taux} %</strong>` : ''}</div></div>
        <button class="btn secondary sm no-print" onclick="go('pointage-scan')">${icone('camera')} Scanner un badge</button>
      </div>
      <div class="segmente pens-onglets" role="tablist" aria-label="Affichage">${[['jour', 'Aujourd’hui'], ['journal', 'Journal'], ['alertes', `Alertes${nbAlertes ? ` (${nbAlertes > 9 ? '9+' : nbAlertes})` : ''}`]].map(([k, l]) => `<button type="button" role="tab" class="seg${onglet === k ? ' actif' : ''}" aria-selected="${onglet === k}" onclick="ui.filters.presEnsOnglet='${k}'; renderView('presences-enseignants')">${l}</button>`).join('')}</div>
      ${onglet === 'jour' ? panneauJour
        : onglet === 'journal' ? (cartesJournal ? `<div class="hint" style="margin:0 0 8px;">20 derniers pointages</div><ul class="pens-liste">${cartesJournal}</ul>` : `<div class="etat-vide"><span class="etat-vide-ic" aria-hidden="true">${icone('clock')}</span><span>Aucun pointage pour l’instant. Les scans du badge QR apparaîtront ici.</span></div>`)
        : `<div class="hint" style="margin:0 0 8px;">Tentatives suspectes détectées au scan (capture d’écran d’un badge, badge non reconnu…)</div>${renderAlertesPointage()}`}
    </div>
    ${onglet === 'jour' ? panneauGps : ''}
  </div>`;
}
function choisirStatutEns(id, statut){
  const sel = document.querySelector(`.sel-statut-ens[data-ens="${id}"]`); if(sel) sel.value = statut;
  const carte = document.querySelector(`[data-ens-carte="${id}"]`); if(carte) carte.dataset.statut = statut;
}

function renderPointagesGpsDuJour(date){
  const liste = (DB.pointagesGps||[]).filter(p=>p.date===date).sort((a,b)=>b.heure.localeCompare(a.heure));
  if(!liste.length) return `<div class="etat-vide" style="margin-top:10px;"><span class="etat-vide-ic" aria-hidden="true">${icone('map-pin')}</span><span>Aucun pointage GPS ce jour-là.</span></div>`;
  const labelsStatut = { dans_etablissement:{txt:'Dans l\'établissement', cls:'ok'}, hors_etablissement:{txt:'Hors établissement', cls:'erreur'}, a_verifier:{txt:'À vérifier', cls:'attente'} };
  return `<ul class="pens-liste" style="margin-top:12px;">
      ${liste.map(p=>{
        const t = enseignantById(p.enseignantId);
        const st = labelsStatut[p.statut] || {txt:p.statut, cls:'attente'};
        return `<li class="pens-carte">
          <div class="pens-tete"><span class="pens-id"><strong>${t?escapeHtml(ensFullName(t)):'—'}</strong><small>${p.action==='arrivee'?'Arrivée':'Départ'} à ${p.heure?.slice(0,5)||''}${p.distanceMetres!=null?' · '+p.distanceMetres+' m':''}</small></span><span class="badge-etat ${st.cls}">${st.txt}</span></div>
          <a class="lien-discret" href="https://maps.google.com/?q=${p.latitude},${p.longitude}" target="_blank" rel="noopener">${p.adresseApprox?escapeHtml(p.adresseApprox.slice(0,60)):'Voir sur la carte'}</a>
        </li>`;
      }).join('')}
  </ul>`;
}
function renderMessagesParents(){
  if(!['secretariat','direction','fondation'].includes(ui.role)) return '';
  const recus = (DB.messagesInternes || []).filter(m => m.destinataireType === 'ecole')
    .sort((a, b) => (a.lu - b.lu) || String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 30);
  const nonLus = recus.filter(m => !m.lu).length;
  return `<div class="panel">
    <div class="panel-head"><div><h2>📩 Messages des parents${nonLus ? ` (${nonLus} non lu${nonLus > 1 ? 's' : ''})` : ''}</h2><div class="sub">Répondez : le parent reçoit la réponse dans son application, avec une notification</div></div></div>
    ${!recus.length ? '<div class="hint">Aucun message de parent pour l’instant.</div>' : `<div class="table-wrap"><table>
      <thead><tr><th>Date</th><th>De</th><th>Message</th><th></th></tr></thead>
      <tbody>${recus.map(m => `<tr ${!m.lu ? 'style="font-weight:700;"' : ''}>
        <td style="white-space:nowrap;">${m.createdAt ? new Date(m.createdAt).toLocaleString('fr-FR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}) : ''}</td>
        <td>${escapeHtml(m.auteurNom || 'Parent')}<br><span class="hint">parent de ${escapeHtml(eleveById(m.eleveId) ? eleveFullName(eleveById(m.eleveId)) : '—')}</span></td>
        <td style="white-space:pre-wrap;">${escapeHtml(m.contenu)}</td>
        <td><button class="btn sm" onclick="repondreParent('${m.id}')">Répondre</button></td>
      </tr>`).join('')}</tbody></table></div>`}
  </div>`;
}
// Envoi gratuit par WhatsApp : un vrai bouton (les navigateurs bloquent les
// fenêtres ouvertes automatiquement après une attente réseau). WhatsApp
// s'ouvre avec le message déjà écrit ; il reste à appuyer sur Envoyer.
// telephones : un numéro ou une liste (fiche avec deux numéros « 07… / 05… ») —
// un bouton par numéro.
function ouvrirEnvoiWhatsapp(titre, telephones, message, intro){
  const liste = [].concat(telephones || []).filter(Boolean);
  const lisible = t => String(t).replace(/^225/, '').replace(/(\d{2})(?=\d)/g, '$1 ');
  const boutons = liste.map(t => `<a class="btn" href="https://wa.me/${encodeURIComponent(t)}?text=${encodeURIComponent(message)}" target="_blank" rel="noopener" onclick="setTimeout(closeModal, 400)">📲 ${liste.length > 1 ? 'Envoyer au ' + lisible(t) : 'Envoyer par WhatsApp'}</a>`).join('');
  openModal(titre, `
    <p>${intro}</p>
    <div class="hint" style="white-space:pre-wrap;">${escapeHtml(message)}</div>
    <div class="form-actions" style="flex-wrap:wrap;">
      ${boutons}
      <button type="button" class="btn secondary" onclick="closeModal()">Fermer</button>
    </div>`);
}
async function handleEnvoyerLienPointage(enseignantId, action){
  try{
    const { data, error } = await sb.functions.invoke('generer-lien-pointage', {
      body: { enseignantId, action, canal: 'whatsapp', origine: location.origin + location.pathname.replace(/[^/]*$/, '') },
    });
    if(error) throw new Error(await messageErreurFonction(error));
    if(!data?.ok) throw new Error(data?.error || "Échec de la création du lien");
    const t = enseignantById(enseignantId);
    ouvrirEnvoiWhatsapp(`Lien ${action === 'arrivee' ? 'd’arrivée' : 'de départ'} — ${t ? ensFullName(t) : ''}`, data.telephones || data.telephone, data.message,
      "Le lien est prêt (valable 30 minutes, utilisable une seule fois). WhatsApp s'ouvrira au numéro de l'enseignant :");
  }catch(e){ alert('Erreur : ' + e.message); }
}
function exporterPointagesGpsCSV(){
  const lignes = [['Date','Enseignant','Heure','Action','Statut','Distance (m)','Adresse approximative']];
  (DB.pointagesGps||[]).slice().sort((a,b)=>b.date.localeCompare(a.date)||b.heure.localeCompare(a.heure)).forEach(p=>{
    const t = enseignantById(p.enseignantId);
    lignes.push([fmtDate(p.date), t?ensFullName(t):'—', p.heure?.slice(0,5)||'', p.action, p.statut, p.distanceMetres??'', p.adresseApprox||'']);
  });
  const csv = lignes.map(l=>l.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob(['﻿'+csv], {type:'text/csv;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `ecomaz-pointage-gps-${todayISO()}.csv`;
  a.click(); URL.revokeObjectURL(url);
}
function renderAlertesPointage(){
  const alertes = (DB.alertesPointage||[]).slice().sort((a,b)=> (b.date+b.heure).localeCompare(a.date+a.heure)).slice(0,15);
  if(alertes.length===0) return `<div class="etat-vide etat-vide-ok"><span class="etat-vide-ic" aria-hidden="true">${icone('shield')}</span><span>Aucune alerte : rien de suspect au pointage.</span></div>`;
  return `<ul class="pens-liste">${alertes.map(a=>{
    const t = a.enseignantId ? enseignantById(a.enseignantId) : null;
    return `<li class="pens-carte"><div class="pens-tete"><span class="badge-etat erreur">${icone('triangle-alert')}Alerte</span><span class="pens-id"><strong>${t?escapeHtml(ensFullName(t)):'Badge non reconnu'}</strong><small>${fmtDate(a.date)} ${a.heure?.slice(0,5)||''}${a.score != null ? ' · score ' + a.score : ''}</small></span></div>
      <div class="pens-motif">${escapeHtml(a.raison)}</div></li>`;
  }).join('')}</ul>`;
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
        <div style="position:relative;border-radius:var(--r-card);overflow:hidden;background:#000;aspect-ratio:4/3;">
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
    if(error) throw new Error(await messageErreurFonction(error));
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
  el.innerHTML = `<div style="padding:14px 16px;border-radius:var(--r-card);background:${s.bg};color:${s.color};font-weight:700;">
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
  const maintenant = new Date();
  const jourActuel = JOURS[(maintenant.getDay() + 6) % 7] || null;   // samedi/dimanche -> aucun
  const hhmm = `${String(maintenant.getHours()).padStart(2,'0')}:${String(maintenant.getMinutes()).padStart(2,'0')}`;
  const estEnCours = (p, jour) => jour === jourActuel && p.debut <= hhmm && hhmm < p.fin;

  let rowsHtml = '';
  periodes.forEach((p,i)=>{
    if(p.type==='pause'){
      rowsHtml += `<tr><td class="tt-time">${p.debut}-${p.fin}</td><td colspan="5" style="background:var(--surface-2);color:var(--text-dim);font-weight:700;font-size:var(--fs-xs);">${p.label}</td></tr>`;
      return;
    }
    rowsHtml += `<tr><td class="tt-time">${p.debut}-${p.fin}</td>`;
    JOURS.forEach(jour=>{
      const entry = DB.emploiTemps.find(e=>e.classeId===classeId && e.jour===jour && e.slotIndex===i);
      if(entry){
        const t = enseignantById(entry.enseignantId);
        rowsHtml += `<td${estEnCours(p, jour) ? ' class="tt-encours"' : ''}>
          <div class="tt-slot" style="--mat:${couleurMatiere(entry.matiere)}">
            ${estEnCours(p, jour) ? '<span class="tt-badge-encours">En cours</span>' : ''}
            <b>${escapeHtml(entry.matiere)}</b>
            <span>${escapeHtml(ensFullName(t))}</span>
            <div style="margin-top:5px;display:flex;gap:4px;">
              <button class="icon-btn" style="width:22px;height:22px;font-size:var(--fs-xs);" onclick="openSlotForm('${classeId}','${jour}',${i})">✏️</button>
              <button class="icon-btn danger" style="width:22px;height:22px;font-size:var(--fs-xs);" onclick="clearSlot('${entry.id}')">✕</button>
            </div>
          </div>
        </td>`;
      } else {
        rowsHtml += `<td><button type="button" class="edt-vide" style="width:100%;" onclick="openSlotForm('${classeId}','${jour}',${i})">+ Ajouter</button></td>`;
      }
    });
    rowsHtml += `</tr>`;
  });

  // Refonte (DESIGN.md §11) : sur téléphone, un jour à la fois en liste verticale
  const jourVu = JOURS.includes(ui.filters.ttJour) ? ui.filters.ttJour : (jourActuel || JOURS[0]);
  const listeJour = periodes.map((p, i) => {
    if(p.type === 'pause') return `<li class="edt-pause"><span>${p.debut} – ${p.fin}</span><strong>${escapeHtml(p.label)}</strong></li>`;
    const entry = DB.emploiTemps.find(e => e.classeId === classeId && e.jour === jourVu && e.slotIndex === i);
    const heure = `<span class="edt-heure"><strong>${p.debut}</strong><small>${p.fin}</small></span>`;
    if(!entry) return `<li class="edt-ligne">${heure}<button type="button" class="edt-vide" onclick="openSlotForm('${classeId}','${jourVu}',${i})">+ Ajouter un cours</button></li>`;
    const t = enseignantById(entry.enseignantId), enCours = estEnCours(p, jourVu);
    return `<li class="edt-ligne">${heure}<div class="edt-cours${enCours ? ' en-cours' : ''}" style="--mat:${couleurMatiere(entry.matiere)}">
      <span class="edt-txt"><strong>${escapeHtml(entry.matiere)}</strong><small>${escapeHtml(ensFullName(t))}</small>${enCours ? '<span class="tt-badge-encours">En cours</span>' : ''}</span>
      <span class="edt-act"><button type="button" class="btn secondary sm" onclick="openSlotForm('${classeId}','${jourVu}',${i})">Modifier</button><button type="button" class="icon-btn danger" aria-label="Vider ce créneau" title="Vider ce créneau" onclick="clearSlot('${entry.id}')">✕</button></span>
    </div></li>`;
  }).join('');
  return `
  <div class="view active">
    <div class="panel">
      <div class="panel-head">
        <div><h2>Emploi du temps</h2><div class="sub">${c.nom} · ${c.cycle}</div></div>
        <select class="puce-select" aria-label="Classe" onchange="ui.filters.ttClasse=this.value; renderView('emploi-temps')">
          ${mesClasses.map(cl=>`<option value="${cl.id}" ${classeId===cl.id?'selected':''}>${cl.nom}</option>`).join('')}
        </select>
      </div>
      <div class="seulement-mobile">
        <div class="segmente edt-jours" role="tablist" aria-label="Jour">${JOURS.map(j => `<button type="button" role="tab" class="seg${j === jourVu ? ' actif' : ''}" aria-selected="${j === jourVu}" onclick="ui.filters.ttJour='${j}'; renderView('emploi-temps')">${j.slice(0, 3)}${j === jourActuel ? '<span class="edt-auj" aria-label="aujourd’hui"></span>' : ''}</button>`).join('')}</div>
        <ul class="edt-liste">${listeJour}</ul>
      </div>
      <div class="table-wrap seulement-ordi">
        <table class="timetable">
          <thead><tr><th>Horaire</th>${JOURS.map(j=>`<th>${j}</th>`).join('')}</tr></thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>
    </div>
  </div>`;
}

const COULEURS_MATIERES = ['#2E7D62', '#B5492F', '#C48A1E', '#3E7C8A', '#7A5C99', '#8A6A3B', '#1F5C46', '#A8506A'];
function couleurMatiere(m){
  let h = 0; for(const ch of String(m || '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return COULEURS_MATIERES[h % COULEURS_MATIERES.length];
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

  const cartes = list.map(p=>{
    const t = enseignantById(p.enseignantId);
    const niveau = p.progression>=75 ? 'ok' : p.progression>=40 ? 'moyen' : 'bas';
    return `<article class="prog-carte">
      <header class="prog-tete"><span class="puce-classe">${escapeHtml(classeName(p.classeId))}</span><span class="prog-tri">${escapeHtml(p.trimestre)}</span>
        ${menuPlus([{ label: 'Supprimer ce programme', danger: true, onclick: `deleteProgramme('${p.id}')` }])}</header>
      <strong class="prog-matiere">${escapeHtml(p.matiere)}</strong>
      <span class="prog-ens">${escapeHtml(ensFullName(t))}</span>
      <div class="prog-avancee"><div class="sc-piste"><div class="prog-${niveau}" style="width:${p.progression}%"></div></div><strong>${p.progression} %</strong></div>
      <footer class="prog-pied"><small>Mis à jour le ${fmtDate(p.dateMaj)}</small><button type="button" class="btn secondary sm" onclick="openProgrammeForm('${p.id}')">Modifier</button></footer>
    </article>`;
  }).join('');
  const filtresActifs = !!(f.classeId || f.enseignantId || f.trimestre);

  return `
  <div class="view active">
    <div class="panel">
      <div class="panel-head">
        <div><h2>Progression des enseignants</h2><div class="sub">${list.length} programme${list.length > 1 ? 's' : ''}${filtresActifs ? ' pour ces filtres' : ''}</div></div>
        <button class="btn" onclick="openProgrammeForm()">${icone('plus')} Nouveau programme</button>
      </div>
      <div class="prog-filtres">
        <select class="puce-select petit${f.classeId ? ' actif' : ''}" aria-label="Classe" onchange="ui.filters.prog.classeId=this.value; renderView('programmes')">
          <option value="">Toutes les classes</option>
          ${DB.classes.map(c=>`<option value="${c.id}" ${f.classeId===c.id?'selected':''}>${escapeHtml(c.nom)}</option>`).join('')}
        </select>
        <select class="puce-select petit${f.enseignantId ? ' actif' : ''}" aria-label="Enseignant" onchange="ui.filters.prog.enseignantId=this.value; renderView('programmes')">
          <option value="">Tous les enseignants</option>
          ${DB.enseignants.map(t=>`<option value="${t.id}" ${f.enseignantId===t.id?'selected':''}>${escapeHtml(ensFullName(t))}</option>`).join('')}
        </select>
        <div class="segmente" role="group" aria-label="Trimestre">${[['', 'Tous'], ...TRIMESTRES.map(t => [t, 'T' + t.slice(-1)])].map(([v, l]) => `<button type="button" class="seg${f.trimestre === v ? ' actif' : ''}" ${v ? `title="${v}"` : ''} onclick="ui.filters.prog.trimestre='${v}'; renderView('programmes')">${l}</button>`).join('')}</div>
        ${filtresActifs ? `<button type="button" class="lien-discret" onclick="ui.filters.prog={classeId:'', enseignantId:'', trimestre:''}; renderView('programmes')">Effacer les filtres</button>` : ''}
      </div>
      ${list.length===0 ? `<div class="etat-vide"><span class="etat-vide-ic" aria-hidden="true">${icone('book-open-check')}</span><span>${filtresActifs ? 'Aucun programme pour ces filtres.' : 'Aucun programme enregistré.'} <button type="button" class="lien-discret" onclick="openProgrammeForm()">Ajouter un programme</button></span></div>`
        : `<div class="prog-grille">${cartes}</div>`}
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
// Grille de scolarité d'une classe : ses propres tranches si elle en a,
// sinon la grille commune (tranches sans classe) — schema.sql section 55.
function echeancesDeClasse(classeId){
  const toutes = DB.echeancesScolarite || [];
  const propres = toutes.filter(e => e.classeId === classeId);
  return (propres.length ? propres : toutes.filter(e => !e.classeId)).slice().sort((a,b)=>(a.ordre-b.ordre)||(a.dateEcheance||'').localeCompare(b.dateEcheance||''));
}
function duAnnuelClasse(classeId){
  const ech = echeancesDeClasse(classeId);
  return ech.length ? ech.reduce((s, e) => s + Number(e.montant || 0), 0) : ((DB.fraisScolarite || {})[classeId] || 0);
}
/* ---------- Rapport du mois (direction / fondation) — imprimable ou PDF ----------
   Calculé à partir des données déjà chargées ; mêmes calculs que le reste de l'application. */
function ouvrirRapportMois(mois){
  if(!['direction','fondation'].includes(ui.role)) return;
  mois = mois || thisMonthISO();
  const m = DB.meta || {};
  const dans = d => String(d || '').slice(0, 7) === mois;
  const nomMois = (t => t.charAt(0).toUpperCase() + t.slice(1))(new Date(mois + '-15T12:00:00').toLocaleDateString('fr-FR', { month:'long', year:'numeric' }));
  const decale = n => { const [a, mm] = mois.split('-').map(Number); const d = new Date(a, mm - 1 + n, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
  const actifs = DB.eleves.filter(e => e.statut === 'Actif');
  const nouveaux = actifs.filter(e => dans(e.dateInscription));
  // Finances
  const somme = (liste) => liste.reduce((t, x) => t + (Number(x.montant) || 0), 0);
  const scol = somme((DB.paiementsScolarite || []).filter(x => dans(x.date)));
  const cotis = somme((DB.paiementsCotisations || []).filter(x => dans(x.date)));
  const ventes = (DB.ventesGadgets || []).filter(x => dans(x.date)).reduce((t, v) => t + (Number(v.montantTotal) || Number(v.montant) || 0), 0);
  const salaires = somme((DB.paiementsSalaires || []).filter(x => dans(x.date)));
  const depenses = somme((DB.depenses || []).filter(x => dans(x.date)));
  const entrees = scol + cotis + ventes, sorties = salaires + depenses;
  const soldes = actifs.map(e => ({ e, solde: scolariteEleveInfo(e.id).solde })).filter(x => x.solde > 0);
  const resteTotal = soldes.reduce((t, x) => t + x.solde, 0);
  // Présences des élèves
  const pres = (DB.presencesEleves || []).filter(p => dans(p.date));
  const jours = new Set(pres.map(p => p.date)).size;
  const abs = pres.filter(p => p.statut === 'Absent'), ret = pres.filter(p => p.statut === 'Retard');
  const tauxPres = pres.length ? Math.round(100 * (pres.length - abs.length) / pres.length) : null;
  const parEleve = {}; abs.forEach(p => { parEleve[p.eleveId] = (parEleve[p.eleveId] || 0) + 1; });
  const plusAbsents = Object.entries(parEleve).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([id, n]) => ({ e: eleveById(id), n })).filter(x => x.e);
  const classesSansAppel = DB.classes.filter(c => actifs.some(e => e.classeId === c.id) && !pres.some(p => p.classeId === c.id));
  // Enseignants
  const pe = (DB.presencesEnseignants || []).filter(p => dans(p.date));
  const peRetards = pe.filter(p => p.statut === 'Retard'), peAbs = pe.filter(p => p.statut === 'Absent');
  const ponct = pe.length ? Math.round(100 * pe.filter(p => p.statut === 'Présent').length / pe.length) : null;
  // Parents
  const relies = actifs.filter(e => (DB.parentsEleves || []).some(pe2 => pe2.eleveId === e.id)).length;
  const ligne = (lib, val, cls) => `<tr><td>${lib}</td><td class="rm-val ${cls || ''}">${val}</td></tr>`;
  const pct = v => v === null ? '—' : v + ' %';
  openModal(`Rapport du mois — ${nomMois}`, `
    <div class="form-actions no-print" style="margin-top:0;justify-content:space-between;">
      <span style="display:flex;gap:6px;"><button type="button" class="btn secondary sm" onclick="ouvrirRapportMois('${decale(-1)}')">‹ Mois précédent</button>${mois < thisMonthISO() ? `<button type="button" class="btn secondary sm" onclick="ouvrirRapportMois('${decale(1)}')">Mois suivant ›</button>` : ''}</span>
      <button type="button" class="btn" onclick="window.print()">${icone('printer')} Imprimer / PDF</button>
    </div>
    <section class="rapport-mois">
      <div class="recu-head">${m.logo ? `<img src="${escapeHtml(m.logo)}" alt="">` : `<div class="recu-logo-ph">🎓</div>`}
        <div><strong>${escapeHtml(m.nomEcole || '')}</strong><div class="hint">${escapeHtml(m.adresse || '')}</div></div>
        <div style="margin-left:auto;text-align:right;"><strong>RAPPORT DU MOIS</strong><div class="hint">${escapeHtml(nomMois)} · ${escapeHtml(m.anneeScolaire || '')}</div></div></div>
      <div class="rm-grille">
        <div class="rm-bloc"><h4>Élèves</h4><table>${ligne('Élèves inscrits (actifs)', actifs.length)}${ligne('Nouveaux inscrits ce mois', nouveaux.length)}${ligne('Élèves reliés à un parent', `${relies} / ${actifs.length}`)}</table></div>
        <div class="rm-bloc"><h4>Finances du mois</h4><table>${ligne('Scolarité encaissée', fmtFCFA(scol))}${cotis ? ligne('Activités extra-scolaires', fmtFCFA(cotis)) : ''}${ventes ? ligne('Boutique', fmtFCFA(ventes)) : ''}${ligne('<strong>Total encaissé</strong>', `<strong>${fmtFCFA(entrees)}</strong>`, 'ok')}${ligne('Salaires payés', fmtFCFA(salaires))}${ligne('Dépenses', fmtFCFA(depenses))}${ligne('<strong>Solde du mois</strong>', `<strong>${fmtFCFA(entrees - sorties)}</strong>`, entrees - sorties >= 0 ? 'ok' : 'ko')}</table></div>
        <div class="rm-bloc"><h4>Scolarité à encaisser (à ce jour)</h4><table>${ligne('Reste à encaisser', fmtFCFA(resteTotal), resteTotal ? 'ko' : 'ok')}${ligne('Élèves avec un reste à payer', `${soldes.length} / ${actifs.length}`)}</table></div>
        <div class="rm-bloc"><h4>Présence des élèves</h4><table>${ligne('Jours d’appel enregistrés', jours)}${ligne('Taux de présence', pct(tauxPres), tauxPres !== null && tauxPres < 90 ? 'ko' : '')}${ligne('Absences', abs.length)}${ligne('Retards', ret.length)}</table>
          ${classesSansAppel.length ? `<div class="hint">Aucun appel ce mois : ${classesSansAppel.map(c => escapeHtml(c.nom)).join(', ')}</div>` : ''}
          ${plusAbsents.length ? `<div class="hint" style="margin-top:6px;"><strong>Les plus absents :</strong> ${plusAbsents.map(x => `${escapeHtml(eleveFullName(x.e))} (${x.n})`).join(', ')}</div>` : ''}</div>
        <div class="rm-bloc"><h4>Enseignants</h4><table>${ligne('Pointages enregistrés', pe.length)}${ligne('Ponctualité', pct(ponct), ponct !== null && ponct < 90 ? 'ko' : '')}${ligne('Retards', peRetards.length)}${ligne('Absences', peAbs.length)}</table></div>
      </div>
      <div class="hint" style="margin-top:10px;">Rapport établi le ${fmtDate(todayISO())} à partir des données enregistrées dans EcoMaZ.</div>
      <div class="signatures"><div class="sign-box"><div class="sign-role">La Direction</div><div class="sign-line">${escapeHtml(m.directeurNom || '')}</div></div><div class="sign-box"><div class="sign-role">La Fondation</div><div class="sign-line">${escapeHtml(m.fondateurNom || '')}</div></div></div>
    </section>`);
}
function scolariteEleveInfo(eleveId){
  const el = eleveById(eleveId);
  const du = el ? duAnnuelClasse(el.classeId) : 0;
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
  const paiements = (DB.paiementsScolarite||[]).filter(p=>p.eleveId===eleveId);
  const parTranche = {};
  paiements.forEach(p=>{ parTranche[p.tranche] = (parTranche[p.tranche]||0) + Number(p.montant||0); });
  const el = eleveById(eleveId);
  const echeances = el ? echeancesDeClasse(el.classeId) : [];
  const detail = echeances.map(ech=>{
    const paye = parTranche[ech.label] || 0;
    const statut = ech.montant>0 && paye>=ech.montant ? 'paye' : paye>0 ? 'partiel' : 'impaye';
    return {label:ech.label, montant:ech.montant, paye, statut};
  });
  const total = echeances.reduce((s,e)=>s+e.montant,0);
  const totalPaye = paiements.reduce((s,p)=>s+Number(p.montant||0),0);
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
function statutFneRecu(r){
  // La FNE ne concerne (pour l'instant, confirmé 2026-09-24) que les reçus
  // de scolarité — pas les salaires/dépenses. Voir schema.sql section 27 :
  // aucune certification réelle n'est câblée tant qu'un prestataire n'a
  // pas d'intégration codée, donc jamais de fausse certification affichée.
  const concerne = r.objet && r.objet.startsWith('Scolarité');
  if(!concerne) return '';
  const c = DB.fneConfig || {regime:'recus'};
  if(c.regime!=='fne') return '';
  if(!c.cleConfiguree) return `<div class="recu-row" style="color:var(--red);"><span>⚠️ FNE</span><strong>Régime activé, prestataire non configuré — reçu NON certifié</strong></div>`;
  return `<div class="recu-row" style="color:var(--amber);"><span>🟡 FNE</span><strong>En attente de connexion à ${escapeHtml(c.prestataire)} — reçu NON encore certifié</strong></div>`;
}
function detailTvaRecu(r){
  if(r.type!=='entree') return '';
  const categorie = categorieRecetteDeObjet(r.objet);
  if(!categorie || !DB.meta.assujettiTva || !tvaApplicablePour(categorie)) return '';
  const taux = DB.meta.tauxTva || 0;
  const montantHT = Math.round(r.montant / (1 + taux/100));
  const montantTva = r.montant - montantHT;
  return `
    <div class="recu-row"><span>Montant HT</span><strong>${fmtFCFA(montantHT)}</strong></div>
    <div class="recu-row"><span>TVA (${taux}%)</span><strong>${fmtFCFA(montantTva)}</strong></div>`;
}
function buildRecuHtml(r){
  const m = DB.meta;
  const numero = genRecuNumero(r.type, r.refId);
  const libType = r.type==='entree' ? "REÇU D'ENTRÉE DE CAISSE" : 'REÇU DE SORTIE DE CAISSE';
  const couleur = r.type==='entree' ? 'var(--green)' : 'var(--red)';
  const tvaConcerne = r.type==='entree' && categorieRecetteDeObjet(r.objet) && DB.meta.assujettiTva && tvaApplicablePour(categorieRecetteDeObjet(r.objet));
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
      ${statutFneRecu(r)}
      <div class="recu-row"><span>N° Reçu</span><strong>${numero}</strong></div>
      <div class="recu-row"><span>Date</span><strong>${fmtDate(r.date)}</strong></div>
      <div class="recu-row"><span>${r.type==='entree'?'Reçu de':'Payé à'}</span><strong>${escapeHtml(r.personne||'—')}</strong></div>
      <div class="recu-row"><span>Objet</span><strong>${escapeHtml(r.objet)}</strong></div>
      ${r.sousInfo ? `<div class="recu-row"><span>Détail</span><strong>${escapeHtml(r.sousInfo)}</strong></div>` : ''}
      <div class="recu-row"><span>Mode de paiement</span><strong>${escapeHtml(r.modePaiement||'—')}</strong></div>
      ${detailTvaRecu(r)}
      <div class="recu-montant" style="color:${couleur};">${r.type==='entree'?'+':'−'} ${fmtFCFA(r.montant)}${tvaConcerne?' TTC':''}</div>
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
    journal: renderComptaJournal, annees: renderComptaAnnees, budget: renderComptaBudget,
    syscohada: renderComptaSyscohada, rapprochement: renderComptaRapprochement,
  };
  // Les salaires, les dépenses, le journal d'audit, la comparaison annuelle,
  // le budget, le plan SYSCOHADA et le rapprochement bancaire sont réservés
  // à Direction/Fondation (aussi dans la base : voir schema.sql section 42) —
  // le Secrétariat gère la scolarité, les activités et la boutique.
  const estAdmin = ui.role==='direction' || ui.role==='fondation';
  const ongletsReserves = ['salaires','depenses','journal','annees','budget','syscohada','rapprochement'];
  const tabsVisibles = COMPTA_TABS.filter(t => !ongletsReserves.includes(t.id) || estAdmin);
  const cacheAReinitialiser = {journal:'__journalComptaCache', budget:'__budgetsComptaCache'};
  return `
  <div class="view active">
    <div class="subtabs">
      ${tabsVisibles.map(t=>`<button class="subtab ${tab===t.id?'active':''}" onclick="ui.filters.comptaTab='${t.id}'; ${cacheAReinitialiser[t.id]?cacheAReinitialiser[t.id]+'=null; ':''}renderView('comptabilite')">${t.icon} ${t.label}</button>`).join('')}
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

  // TVA collectée (aide de calcul, voir renderPanneauTva) : les montants
  // ci-dessus sont TTC, on en extrait la part TVA pour les catégories où
  // elle a été activée dans Paramètres.
  const tauxTva = DB.meta.tauxTva || 0;
  const extraireTva = montant => DB.meta.assujettiTva && tauxTva>0 ? Math.round(montant - montant/(1+tauxTva/100)) : 0;
  const tvaCollectee = (tvaApplicablePour('Scolarité')?extraireTva(recScolarite):0)
    + (tvaApplicablePour('Activités extra-scolaires')?extraireTva(recCotisations):0)
    + (tvaApplicablePour('Boutique scolaire')?extraireTva(recVentes):0);

  const depSalaires = DB.paiementsSalaires.filter(p=>inPeriod(p.datePaiement)).reduce((s,p)=>s+p.montant,0);
  const depParCategorie = {};
  CATEGORIES_DEPENSES.forEach(c=> depParCategorie[c] = DB.depenses.filter(d=>d.categorie===c && inPeriod(d.date)).reduce((s,d)=>s+d.montant,0));
  const depAutres = Object.values(depParCategorie).reduce((s,v)=>s+v,0);
  const totalDepenses = depSalaires + depAutres;
  const resultat = totalRecettes - totalDepenses;

  const eleveActifs = DB.eleves.filter(e=>e.statut==='Actif');
  const totalDu = eleveActifs.reduce((s,e)=> s+duAnnuelClasse(e.classeId), 0);
  const totalPayeScolarite = DB.paiementsScolarite.reduce((s,p)=>s+p.montant,0);
  const tauxRecouvrement = totalDu ? Math.round(100*Math.min(totalPayeScolarite,totalDu)/totalDu) : 0;

  const maxRec = Math.max(recScolarite, recCotisations, recVentes, 1);
  const recBars = [
    {label:'Scolarité', val:recScolarite}, {label:'Activités extra-scolaires', val:recCotisations}, {label:'Boutique scolaire', val:recVentes},
  ].map(b=>`<div style="display:flex;align-items:center;gap:10px;margin-bottom:9px;">
    <div style="width:170px;font-size:var(--fs-xs);color:var(--text-dim);flex-shrink:0;">${b.label}</div>
    <div class="progress" style="flex:1;"><div style="width:${Math.round(100*b.val/maxRec)}%;background:var(--green);"></div></div>
    <div style="width:100px;text-align:right;font-size:var(--fs-xs);font-weight:700;">${fmtFCFA(b.val)}</div>
  </div>`).join('');

  const depEntries = [{label:'Salaires', val:depSalaires}, ...CATEGORIES_DEPENSES.map(c=>({label:c, val:depParCategorie[c]}))].filter(d=>d.val>0);
  const maxDep = Math.max(...depEntries.map(d=>d.val), 1);
  const depBars = (depEntries.length ? depEntries : [{label:'Aucune dépense', val:0}]).map(b=>`<div style="display:flex;align-items:center;gap:10px;margin-bottom:9px;">
    <div style="width:170px;font-size:var(--fs-xs);color:var(--text-dim);flex-shrink:0;">${b.label}</div>
    <div class="progress" style="flex:1;"><div style="width:${Math.round(100*b.val/maxDep)}%;background:var(--red);"></div></div>
    <div style="width:100px;text-align:right;font-size:var(--fs-xs);font-weight:700;">${fmtFCFA(b.val)}</div>
  </div>`).join('');

  const impayes = eleveActifs.map(e=>({e, info:scolariteEleveInfo(e.id)})).filter(x=>x.info.solde>0).sort((a,b)=>b.info.solde-a.info.solde).slice(0,8);
  const impayesHtml = impayes.map(x=>`<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border);">
    <div><strong style="font-size:var(--fs-xs);cursor:pointer;" onclick="go('eleves'); viewEleveProfile('${x.e.id}')">${escapeHtml(eleveFullName(x.e))}</strong><div class="hint">${classeName(x.e.classeId)} · ${escapeHtml(x.e.parentTel)}</div></div>
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

  // Solde par mode de paiement — cumulé depuis le début (pas filtré par
  // période, contrairement au reste de l'Aperçu), car un solde est un
  // stock accumulé (ex: combien de FCFA en espèces devraient être dans le
  // tiroir), pas un flux d'une période donnée.
  const soldesParMode = MODES_PAIEMENT.map(mode=>{
    const entrees = DB.paiementsScolarite.filter(p=>p.modePaiement===mode).reduce((s,p)=>s+p.montant,0)
      + DB.paiementsCotisations.filter(p=>p.modePaiement===mode).reduce((s,p)=>s+p.montant,0)
      + DB.ventesGadgets.filter(v=>v.modePaiement===mode).reduce((s,v)=>s+v.montantTotal,0);
    const sorties = DB.paiementsSalaires.filter(p=>p.modePaiement===mode).reduce((s,p)=>s+p.montant,0)
      + DB.depenses.filter(d=>d.modePaiement===mode).reduce((s,d)=>s+d.montant,0);
    return {mode, entrees, sorties, solde: entrees-sorties};
  });
  const soldesRows = soldesParMode.map(s=>`<tr>
    <td>${s.mode}</td>
    <td class="amount in">${fmtFCFA(s.entrees)}</td>
    <td class="amount out">${fmtFCFA(s.sorties)}</td>
    <td style="font-weight:700;color:${s.solde>=0?'var(--green)':'var(--red)'};">${fmtFCFA(s.solde)}</td>
  </tr>`).join('');

  return `
    <div class="section-note">💰 Vue financière consolidée : scolarité, activités extra-scolaires, boutique, salaires et charges. Toutes les données sont générées automatiquement à partir des paiements enregistrés dans les autres onglets.</div>
    ${secret ? `<div class="section-note" style="background:var(--amber-bg);color:var(--amber);">🔒 Les montants globaux (recettes, dépenses, résultat net et répartitions) sont masqués pour le profil Secrétariat. Vous pouvez toujours enregistrer les paiements et consulter le détail par élève.</div>` : ''}
    <div class="filters">
      <select onchange="ui.filters.comptaPeriode=this.value; renderView('comptabilite')">
        <option value="all" ${periode==='all'?'selected':''}>Toute la période</option>
        ${lastNMonths(6).map(m=>`<option value="${m}" ${periode===m?'selected':''}>${moisLabel(m)}</option>`).join('')}
      </select>
      ${secret ? '' : `<button class="btn secondary" onclick="exporterComptabiliteCSV()">⬇️ Exporter (CSV)</button>`}
    </div>
    <div class="cards">
      <div class="card"><div class="card-top"><div class="icon-badge" style="background:var(--green-bg);">📥</div></div>${secret ? maskNum : `<div class="num amount in">${fmtFCFA(totalRecettes)}</div>`}<div class="label">Recettes</div></div>
      <div class="card"><div class="card-top"><div class="icon-badge" style="background:var(--red-bg);">📤</div></div>${secret ? maskNum : `<div class="num amount out">${fmtFCFA(totalDepenses)}</div>`}<div class="label">Dépenses</div></div>
      <div class="card"><div class="card-top"><div class="icon-badge" style="background:${resultat>=0?'var(--green-bg)':'var(--red-bg)'};">${resultat>=0?'📈':'📉'}</div></div>${secret ? maskNum : `<div class="num" style="color:${resultat>=0?'var(--green)':'var(--red)'};">${fmtFCFA(resultat)}</div>`}<div class="label">Résultat net</div></div>
      <div class="card"><div class="card-top"><div class="icon-badge" style="background:var(--blue-bg);">🎓</div></div><div class="num">${tauxRecouvrement}%</div><div class="label">Taux de recouvrement scolarité</div></div>
      ${DB.meta.assujettiTva ? `<div class="card"><div class="card-top"><div class="icon-badge" style="background:var(--amber-bg);">🧾</div></div>${secret ? maskNum : `<div class="num" style="color:var(--amber);">${fmtFCFA(tvaCollectee)}</div>`}<div class="label">TVA collectée (aide de calcul)</div></div>` : ''}
    </div>
    <div class="grid-2">
      <div class="panel"><div class="panel-head"><div><h2>Recettes par source</h2></div></div>${secret ? maskPanel : recBars}</div>
      <div class="panel"><div class="panel-head"><div><h2>Dépenses par catégorie</h2></div></div>${secret ? maskPanel : depBars}</div>
    </div>
    <div class="grid-2">
      <div class="panel"><div class="panel-head"><div><h2>Élèves en impayé</h2><div class="sub">Solde de scolarité dû, tous trimestres confondus</div></div></div>${impayesHtml}</div>
      <div class="panel"><div class="panel-head"><div><h2>Dernières transactions</h2></div></div><div class="txn-list">${txnsHtml}</div></div>
    </div>
    <div class="panel">
      <div class="panel-head"><div><h2>Solde par mode de paiement</h2><div class="sub">Cumulé depuis le début — combien devrait théoriquement se trouver dans chaque caisse (espèces, compte bancaire, mobile money…)</div></div></div>
      ${secret ? maskPanel : `
      <div class="table-wrap"><table><thead><tr><th>Mode</th><th>Entrées</th><th>Sorties</th><th>Solde théorique</th></tr></thead><tbody>${soldesRows}</tbody></table></div>
      <div class="hint" style="margin-top:10px;">⚠️ Ceci est un calcul théorique basé sur ce qui a été saisi dans l'appli — ce n'est pas un rapprochement bancaire vérifié. Compare régulièrement avec le solde réel (tiroir-caisse, relevé bancaire) pour détecter un écart.</div>`}
    </div>`;
}

/* ---------------------------------------------------------------------
   12.1bis COMPARAISON ANNUELLE (ROADMAP COMPTABILITÉ — ÉTAPE 5)
   Déduit automatiquement l'année scolaire de chaque mouvement à partir de
   sa date (septembre à août, calendrier scolaire ivoirien) — aucune
   colonne supplémentaire nécessaire, ça marche même sur l'historique déjà
   enregistré. Purement en lecture, ne modifie ni ne verrouille rien.
   --------------------------------------------------------------------- */
function anneeScolaireDe(dateISO){
  if(!dateISO) return '—';
  const [y, m] = dateISO.split('-').map(Number);
  return m>=9 ? `${y}-${y+1}` : `${y-1}-${y}`;
}
function renderComptaAnnees(){
  const parAnnee = {};
  const ajouter = (annee, type, montant) => {
    if(!parAnnee[annee]) parAnnee[annee] = {recettes:0, depenses:0};
    parAnnee[annee][type] += montant;
  };
  DB.paiementsScolarite.forEach(p=>ajouter(anneeScolaireDe(p.date), 'recettes', p.montant));
  DB.paiementsCotisations.forEach(p=>ajouter(anneeScolaireDe(p.date), 'recettes', p.montant));
  DB.ventesGadgets.forEach(v=>ajouter(anneeScolaireDe(v.date), 'recettes', v.montantTotal));
  DB.paiementsSalaires.forEach(p=>ajouter(anneeScolaireDe(p.datePaiement), 'depenses', p.montant));
  DB.depenses.forEach(d=>ajouter(anneeScolaireDe(d.date), 'depenses', d.montant));

  const annees = Object.keys(parAnnee).sort().reverse();
  const rows = annees.map(a=>{
    const {recettes, depenses} = parAnnee[a];
    const resultat = recettes - depenses;
    const estAnneeCourante = a === DB.meta.anneeScolaire;
    return `<tr>
      <td>${a} ${estAnneeCourante ? '<span class="badge blue">Année en cours</span>' : ''}</td>
      <td class="amount in">${fmtFCFA(recettes)}</td>
      <td class="amount out">${fmtFCFA(depenses)}</td>
      <td style="font-weight:700;color:${resultat>=0?'var(--green)':'var(--red)'};">${fmtFCFA(resultat)}</td>
    </tr>`;
  }).join('');

  return `
    <div class="section-note">📅 Répartition automatique par année scolaire (septembre à août), déduite de la date de chaque mouvement — aucune configuration nécessaire, fonctionne aussi sur l'historique déjà saisi.</div>
    <div class="panel">
      <div class="panel-head"><div><h2>Comparaison par année scolaire</h2></div></div>
      ${annees.length===0 ? `<div class="empty-state"><div class="em-ic">📅</div>Aucun mouvement enregistré pour l'instant.</div>` : `
      <div class="table-wrap"><table><thead><tr><th>Année scolaire</th><th>Recettes</th><th>Dépenses</th><th>Résultat net</th></tr></thead><tbody>${rows}</tbody></table></div>`}
    </div>`;
}

/* ---------------------------------------------------------------------
   12.1ter BUDGET PRÉVISIONNEL (ROADMAP COMPTABILITÉ — ÉTAPE 6)
   Un montant "prévu" par catégorie et par mois (table budgets_comptables,
   voir schema.sql section 25), comparé au "réalisé" déjà calculable à
   partir des tables existantes — rien n'est dupliqué. Chargé à la demande
   comme le Journal d'audit.
   --------------------------------------------------------------------- */
const CATEGORIES_RECETTES_BUDGET = ['Scolarité','Activités extra-scolaires','Boutique scolaire'];
let __budgetsComptaCache = null;
let __budgetsComptaMoisCache = null;
async function chargerBudgetsCompta(mois){
  try{
    const { data, error } = await sb.from('budgets_comptables').select('*').eq('mois', mois);
    if(error) throw error;
    __budgetsComptaCache = data;
  }catch(e){
    __budgetsComptaCache = [];
  }
  __budgetsComptaMoisCache = mois;
  if(ui.currentView==='comptabilite' && ui.filters.comptaTab==='budget') renderView('comptabilite');
}
function realiseCategorieBudget(type, categorie, mois){
  const dansLeMois = iso => iso && iso.slice(0,7)===mois;
  if(type==='recette'){
    if(categorie==='Scolarité') return DB.paiementsScolarite.filter(p=>dansLeMois(p.date)).reduce((s,p)=>s+p.montant,0);
    if(categorie==='Activités extra-scolaires') return DB.paiementsCotisations.filter(p=>dansLeMois(p.date)).reduce((s,p)=>s+p.montant,0);
    if(categorie==='Boutique scolaire') return DB.ventesGadgets.filter(v=>dansLeMois(v.date)).reduce((s,v)=>s+v.montantTotal,0);
    return 0;
  }
  if(categorie==='Salaires') return DB.paiementsSalaires.filter(p=>dansLeMois(p.datePaiement)).reduce((s,p)=>s+p.montant,0);
  return DB.depenses.filter(d=>d.categorie===categorie && dansLeMois(d.date)).reduce((s,d)=>s+d.montant,0);
}
function renderComptaBudget(){
  const mois = ui.filters.comptaMois || thisMonthISO();
  ui.filters.comptaMois = mois;
  if(__budgetsComptaCache===null || __budgetsComptaMoisCache!==mois){
    chargerBudgetsCompta(mois);
    return `<div class="panel"><div class="hint" style="text-align:center;padding:40px 10px;">Chargement…</div></div>`;
  }
  const ligne = (type, categorie) => {
    const b = __budgetsComptaCache.find(x=>x.type===type && x.categorie===categorie);
    const prevu = b ? b.montant : 0;
    const realise = realiseCategorieBudget(type, categorie, mois);
    const ecart = realise - prevu;
    const bon = type==='recette' ? ecart>=0 : ecart<=0;
    return `<tr>
      <td>${categorie}</td>
      <td><input type="number" min="0" step="1000" value="${prevu}" onchange="handleSaveBudget('${type}','${categorie}','${mois}',this.value)" style="width:110px;"></td>
      <td>${fmtFCFA(realise)}</td>
      <td style="font-weight:700;color:${bon?'var(--green)':'var(--red)'};">${ecart>=0?'+':''}${fmtFCFA(ecart)}</td>
    </tr>`;
  };
  const rowsRecettes = CATEGORIES_RECETTES_BUDGET.map(c=>ligne('recette', c)).join('');
  const rowsDepenses = ['Salaires', ...CATEGORIES_DEPENSES].map(c=>ligne('depense', c)).join('');

  return `
    <div class="section-note">🎯 Fixe un montant prévu par catégorie pour le mois choisi — comparé automatiquement au réalisé. Modifie le champ "Prévu" : ça s'enregistre aussitôt.</div>
    <div class="filters">
      <select onchange="ui.filters.comptaMois=this.value; __budgetsComptaCache=null; renderView('comptabilite')">${lastNMonths(6).map(m=>`<option value="${m}" ${mois===m?'selected':''}>${moisLabel(m)}</option>`).join('')}</select>
    </div>
    <div class="panel">
      <div class="panel-head"><div><h2>Recettes — ${moisLabel(mois)}</h2></div></div>
      <div class="table-wrap"><table><thead><tr><th>Catégorie</th><th>Prévu</th><th>Réalisé</th><th>Écart</th></tr></thead><tbody>${rowsRecettes}</tbody></table></div>
    </div>
    <div class="panel">
      <div class="panel-head"><div><h2>Dépenses — ${moisLabel(mois)}</h2></div></div>
      <div class="table-wrap"><table><thead><tr><th>Catégorie</th><th>Prévu</th><th>Réalisé</th><th>Écart</th></tr></thead><tbody>${rowsDepenses}</tbody></table></div>
    </div>`;
}
async function handleSaveBudget(type, categorie, mois, valeurStr){
  const montant = Math.max(0, parseInt(valeurStr)||0);
  try{
    const existant = __budgetsComptaCache.find(x=>x.type===type && x.categorie===categorie);
    if(existant){
      await dbUpdate('budgets_comptables', existant.id, {montant});
      existant.montant = montant;
    } else {
      const rec = await dbInsert('budgets_comptables', {type, categorie, mois, montant});
      __budgetsComptaCache.push(rec);
    }
    toast('Budget enregistré');
  }catch(e){ alert('Erreur : ' + e.message); }
}

/* ---------------------------------------------------------------------
   12.1quater PLAN COMPTABLE SYSCOHADA (ROADMAP COMPTABILITÉ — ÉTAPE 7)
   IMPORTANT : les codes ci-dessous sont des PROPOSITIONS STANDARD, pas
   une validation professionnelle — chaque école doit les faire relire
   par un comptable OHADA avant tout usage officiel (déclaration, audit).
   Modifiables ici, sauvegardés dans comptes_syscohada (schema.sql §26).
   --------------------------------------------------------------------- */
const CODES_SYSCOHADA_DEFAUT = {
  'recette|Scolarité': {code:'706', libelle:'Services vendus (prestations d’enseignement)'},
  'recette|Activités extra-scolaires': {code:'707', libelle:'Produits accessoires'},
  'recette|Boutique scolaire': {code:'707', libelle:'Produits accessoires'},
  'depense|Salaires': {code:'661', libelle:'Rémunérations directes versées au personnel'},
  'depense|Loyer': {code:'6132', libelle:'Locations'},
  'depense|Entretien': {code:'624', libelle:'Entretien, réparations et maintenance'},
  'depense|Matériel pédagogique': {code:'604', libelle:'Achats stockés de matières et fournitures'},
  'depense|Fournitures scolaires': {code:'604', libelle:'Achats stockés de matières et fournitures'},
  'depense|Électricité & Eau': {code:'6051', libelle:'Fournitures non stockables (eau, électricité)'},
  'depense|Transport': {code:'614', libelle:'Transports du personnel'},
  'depense|Restauration': {code:'604', libelle:'Achats stockés de matières et fournitures'},
  'depense|Autre': {code:'628', libelle:'Divers — Autres charges externes'},
  'tresorerie|Espèces': {code:'571', libelle:'Caisse'},
  'tresorerie|Mobile Money': {code:'521', libelle:'Banques locales (simplifié)'},
  'tresorerie|Virement bancaire': {code:'521', libelle:'Banques locales'},
  'tresorerie|Chèque': {code:'521', libelle:'Banques locales'},
};
let __syscohadaCache = null;
async function chargerComptesSyscohada(){
  try{
    const { data, error } = await sb.from('comptes_syscohada').select('*');
    if(error) throw error;
    __syscohadaCache = data;
  }catch(e){
    __syscohadaCache = [];
  }
  if(ui.currentView==='comptabilite' && ui.filters.comptaTab==='syscohada') renderView('comptabilite');
}
function compteSyscohada(type, categorie){
  const trouve = (__syscohadaCache||[]).find(x=>x.type===type && x.categorie===categorie);
  if(trouve) return {code:trouve.code, libelle:trouve.libelle};
  return CODES_SYSCOHADA_DEFAUT[`${type}|${categorie}`] || {code:'', libelle:''};
}
function renderComptaSyscohada(){
  if(__syscohadaCache===null){
    chargerComptesSyscohada();
    return `<div class="panel"><div class="hint" style="text-align:center;padding:40px 10px;">Chargement…</div></div>`;
  }
  const ligne = (type, categorie) => {
    const c = compteSyscohada(type, categorie);
    return `<tr>
      <td>${categorie}</td>
      <td><input type="text" value="${escapeHtml(c.code)}" style="width:80px;" onchange="handleSaveSyscohada('${type}','${categorie}','code',this.value)"></td>
      <td><input type="text" value="${escapeHtml(c.libelle)}" style="width:100%;" onchange="handleSaveSyscohada('${type}','${categorie}','libelle',this.value)"></td>
    </tr>`;
  };
  const rowsRecettes = CATEGORIES_RECETTES_BUDGET.map(c=>ligne('recette', c)).join('');
  const rowsDepenses = ['Salaires', ...CATEGORIES_DEPENSES].map(c=>ligne('depense', c)).join('');
  const rowsTresorerie = MODES_PAIEMENT.map(m=>ligne('tresorerie', m)).join('');

  return `
    <div class="section-note" style="background:var(--amber-bg);color:var(--amber);">⚠️ Ces codes SYSCOHADA sont des propositions standard, PAS une validation professionnelle. Fais-les relire par un comptable OHADA avant tout usage officiel (déclaration, audit). Modifie librement les champs ci-dessous.</div>
    <div class="panel">
      <div class="panel-head"><div><h2>Comptes de produits (recettes) — classe 7</h2></div></div>
      <div class="table-wrap"><table><thead><tr><th>Catégorie</th><th>Compte</th><th>Intitulé</th></tr></thead><tbody>${rowsRecettes}</tbody></table></div>
    </div>
    <div class="panel">
      <div class="panel-head"><div><h2>Comptes de charges (dépenses) — classe 6</h2></div></div>
      <div class="table-wrap"><table><thead><tr><th>Catégorie</th><th>Compte</th><th>Intitulé</th></tr></thead><tbody>${rowsDepenses}</tbody></table></div>
    </div>
    <div class="panel">
      <div class="panel-head"><div><h2>Comptes de trésorerie — classe 5</h2><div class="sub">Par mode de paiement</div></div></div>
      <div class="table-wrap"><table><thead><tr><th>Mode</th><th>Compte</th><th>Intitulé</th></tr></thead><tbody>${rowsTresorerie}</tbody></table></div>
    </div>
    <div class="panel">
      <div class="panel-head"><div><h2>Export grand livre</h2><div class="sub">Écritures en partie double (Débit/Crédit), prêtes pour un logiciel comptable</div></div></div>
      <button class="btn" onclick="exporterGrandLivreSyscohadaCSV()">⬇️ Exporter le grand livre (CSV)</button>
    </div>`;
}
async function handleSaveSyscohada(type, categorie, champ, valeur){
  try{
    const existant = __syscohadaCache.find(x=>x.type===type && x.categorie===categorie);
    if(existant){
      await dbUpdate('comptes_syscohada', existant.id, {[champ]: valeur});
      existant[champ] = valeur;
    } else {
      const defaut = CODES_SYSCOHADA_DEFAUT[`${type}|${categorie}`] || {code:'', libelle:''};
      const patch = {type, categorie, code: defaut.code, libelle: defaut.libelle, [champ]: valeur};
      const rec = await dbInsert('comptes_syscohada', patch);
      __syscohadaCache.push(rec);
    }
    toast('Compte enregistré');
  }catch(e){ alert('Erreur : ' + e.message); }
}
function exporterGrandLivreSyscohadaCSV(){
  const ecritures = [];
  const ajouter = (date, type, categorie, tresorerie, libelle, montant) => {
    const compteMouvement = compteSyscohada(type, categorie);
    const compteTreso = compteSyscohada('tresorerie', tresorerie);
    if(type==='recette'){
      ecritures.push({date, compte:compteTreso.code, intitule:compteTreso.libelle, libelle, debit:montant, credit:0});
      if(DB.meta.assujettiTva && tvaApplicablePour(categorie) && DB.meta.tauxTva>0){
        const montantHT = Math.round(montant / (1 + DB.meta.tauxTva/100));
        const montantTva = montant - montantHT;
        ecritures.push({date, compte:compteMouvement.code, intitule:compteMouvement.libelle, libelle, debit:0, credit:montantHT});
        ecritures.push({date, compte:'4431', intitule:'État, TVA facturée', libelle, debit:0, credit:montantTva});
      } else {
        ecritures.push({date, compte:compteMouvement.code, intitule:compteMouvement.libelle, libelle, debit:0, credit:montant});
      }
    } else {
      ecritures.push({date, compte:compteMouvement.code, intitule:compteMouvement.libelle, libelle, debit:montant, credit:0});
      ecritures.push({date, compte:compteTreso.code, intitule:compteTreso.libelle, libelle, debit:0, credit:montant});
    }
  };
  DB.paiementsScolarite.forEach(p=>ajouter(p.date, 'recette', 'Scolarité', p.modePaiement, `Scolarité — ${p.tranche} — ${eleveFullName(eleveById(p.eleveId)||{prenom:'—',nom:''})}`, p.montant));
  DB.paiementsCotisations.forEach(p=>{
    const act = DB.activites.find(a=>a.id===p.activiteId);
    ajouter(p.date, 'recette', 'Activités extra-scolaires', p.modePaiement, `Cotisation ${act?act.nom:'—'} — ${eleveFullName(eleveById(p.eleveId)||{prenom:'—',nom:''})}`, p.montant);
  });
  DB.ventesGadgets.forEach(v=>{
    const g = DB.gadgets.find(x=>x.id===v.gadgetId);
    ajouter(v.date, 'recette', 'Boutique scolaire', v.modePaiement, `Vente ${g?g.nom:'—'} ×${v.quantite}`, v.montantTotal);
  });
  DB.paiementsSalaires.forEach(p=>ajouter(p.datePaiement, 'depense', 'Salaires', p.modePaiement, `Salaire — ${personnelNomById(p.personnelId,p.personnelType)} — ${moisLabel(p.mois)}`, p.montant));
  DB.depenses.forEach(d=>ajouter(d.date, 'depense', d.categorie, d.modePaiement, d.libelle, d.montant));
  ecritures.sort((a,b)=>a.date.localeCompare(b.date));

  const echapperCSV = v => {
    const s = String(v==null?'':v);
    return /[",;\n]/.test(s) ? '"' + s.replace(/"/g,'""') + '"' : s;
  };
  const entetes = ['Date','Compte','Intitulé du compte','Libellé','Débit (FCFA)','Crédit (FCFA)'];
  const corps = ecritures.map(l=>[l.date,l.compte,l.intitule,l.libelle,l.debit||'',l.credit||''].map(echapperCSV).join(';'));
  const csv = '﻿' + [entetes.join(';'), ...corps].join('\r\n');
  const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `ecomaz-grand-livre-syscohada-${todayISO()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  toast(`Export démarré — ${ecritures.length} lignes d'écriture (à faire valider par un comptable)`);
}

/* ---------------------------------------------------------------------
   12.1quinquies RAPPROCHEMENT BANCAIRE (ROADMAP COMPTABILITÉ — ÉTAPE 8)
   Compare les mouvements enregistrés dans l'appli (pour un mode de
   paiement et un mois donnés) à un relevé collé manuellement — aucune
   donnée n'est envoyée nulle part, tout reste dans le navigateur, rien
   n'est sauvegardé. Appariement simple : même montant, écart de date
   ≤ 5 jours (délai de traitement bancaire habituel).
   --------------------------------------------------------------------- */
function joursEntre(dateA, dateB){
  return Math.round((new Date(dateB) - new Date(dateA)) / 86400000);
}
function normaliserDateReleve(s){
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if(m) return `${m[3]}-${pad(+m[2])}-${pad(+m[1])}`;
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if(m) return `${m[1]}-${pad(+m[2])}-${pad(+m[3])}`;
  return null;
}
function parseLignesReleve(texte){
  return texte.split('\n').map(l=>l.trim()).filter(Boolean).map(ligne=>{
    const parts = ligne.split(/[;\t]+|,(?=\s*[\d"])/).map(p=>p.trim()).filter(p=>p!=='');
    if(parts.length<3) return null;
    const [dateRaw, libelle, montantRaw] = parts;
    const date = normaliserDateReleve(dateRaw);
    const montant = Math.round(Math.abs(parseFloat(String(montantRaw).replace(/[^\d.,-]/g,'').replace(',', '.'))) || 0);
    if(!date || !montant) return null;
    return {date, libelle, montant};
  }).filter(Boolean);
}
function renderComptaRapprochement(){
  const mois = ui.filters.comptaMois || thisMonthISO();
  ui.filters.comptaMois = mois;
  const mode = ui.filters.rapprochementMode || 'Virement bancaire';
  ui.filters.rapprochementMode = mode;
  const texte = ui.filters.rapprochementTexte || '';

  const dansLeMois = iso => iso && iso.slice(0,7)===mois;
  const mouvementsApp = [];
  DB.paiementsScolarite.filter(p=>p.modePaiement===mode && dansLeMois(p.date)).forEach(p=>mouvementsApp.push({date:p.date, libelle:`Scolarité — ${p.tranche}`, montant:p.montant}));
  DB.paiementsCotisations.filter(p=>p.modePaiement===mode && dansLeMois(p.date)).forEach(p=>mouvementsApp.push({date:p.date, libelle:'Cotisation activité', montant:p.montant}));
  DB.ventesGadgets.filter(v=>v.modePaiement===mode && dansLeMois(v.date)).forEach(v=>mouvementsApp.push({date:v.date, libelle:'Vente boutique', montant:v.montantTotal}));
  DB.paiementsSalaires.filter(p=>p.modePaiement===mode && dansLeMois(p.datePaiement)).forEach(p=>mouvementsApp.push({date:p.datePaiement, libelle:`Salaire — ${personnelNomById(p.personnelId,p.personnelType)}`, montant:p.montant}));
  DB.depenses.filter(d=>d.modePaiement===mode && dansLeMois(d.date)).forEach(d=>mouvementsApp.push({date:d.date, libelle:d.libelle, montant:d.montant}));

  const ligneReleve = parseLignesReleve(texte);
  const appDispo = mouvementsApp.map(m=>({...m, matched:false}));
  const releveDispo = ligneReleve.map(l=>({...l, matched:false}));
  const correspondances = [];
  releveDispo.forEach(rl=>{
    const candidat = appDispo.find(am=>!am.matched && am.montant===rl.montant && Math.abs(joursEntre(am.date, rl.date))<=5);
    if(candidat){ candidat.matched=true; rl.matched=true; correspondances.push({app:candidat, releve:rl}); }
  });
  const appNonTrouves = appDispo.filter(m=>!m.matched);
  const releveNonTrouves = releveDispo.filter(l=>!l.matched);

  const ligneCorrespondance = c => `<tr>
    <td>${fmtDate(c.app.date)}</td><td>${escapeHtml(c.app.libelle)}</td><td class="amount in">${fmtFCFA(c.app.montant)}</td>
    <td>${fmtDate(c.releve.date)}</td><td>${escapeHtml(c.releve.libelle)}</td>
  </tr>`;
  const ligneAppSeule = m => `<tr><td>${fmtDate(m.date)}</td><td>${escapeHtml(m.libelle)}</td><td class="amount out">${fmtFCFA(m.montant)}</td></tr>`;
  const ligneReleveSeule = l => `<tr><td>${fmtDate(l.date)}</td><td>${escapeHtml(l.libelle)}</td><td class="amount out">${fmtFCFA(l.montant)}</td></tr>`;

  return `
    <div class="section-note">🏦 Compare les mouvements enregistrés dans l'appli à un relevé bancaire que tu colles ci-dessous — rien n'est envoyé ni sauvegardé, tout reste dans ton navigateur le temps de la vérification.</div>
    <div class="panel">
      <div class="panel-head"><div><h2>1. Choisir la période et le mode</h2></div></div>
      <div class="filters">
        <select onchange="ui.filters.comptaMois=this.value; renderView('comptabilite')">${lastNMonths(6).map(m=>`<option value="${m}" ${mois===m?'selected':''}>${moisLabel(m)}</option>`).join('')}</select>
        <select onchange="ui.filters.rapprochementMode=this.value; renderView('comptabilite')">${MODES_PAIEMENT.filter(m=>m!=='Espèces').map(m=>`<option ${mode===m?'selected':''}>${m}</option>`).join('')}</select>
      </div>
    </div>
    <div class="panel">
      <div class="panel-head"><div><h2>2. Coller le relevé</h2><div class="sub">Une ligne par mouvement : Date;Libellé;Montant — ex : 15/09/2026;Virement Kouassi;25000</div></div></div>
      <textarea id="texteReleve" rows="6" style="width:100%;font-family:monospace;font-size:var(--fs-xs);" placeholder="15/09/2026;Virement reçu — Kouassi;25000
18/09/2026;Virement salaire — Aya Kouadio;60000">${escapeHtml(texte)}</textarea>
      <div class="form-actions" style="justify-content:flex-start;border-top:none;padding-top:10px;">
        <button class="btn" onclick="handleComparerReleve()">🔍 Comparer</button>
      </div>
    </div>
    ${texte ? `
    <div class="cards">
      <div class="card"><div class="num" style="color:var(--green);">${correspondances.length}</div><div class="label">Correspondances trouvées</div></div>
      <div class="card"><div class="num" style="color:var(--red);">${appNonTrouves.length}</div><div class="label">Dans l'appli, absent du relevé</div></div>
      <div class="card"><div class="num" style="color:var(--red);">${releveNonTrouves.length}</div><div class="label">Au relevé, absent de l'appli</div></div>
    </div>
    <div class="panel">
      <div class="panel-head"><div><h2>✅ Correspondances</h2></div></div>
      ${correspondances.length===0 ? `<div class="hint">Aucune correspondance trouvée.</div>` : `
      <div class="table-wrap"><table><thead><tr><th colspan="3">Dans l'appli</th><th colspan="2">Au relevé</th></tr></thead><tbody>${correspondances.map(ligneCorrespondance).join('')}</tbody></table></div>`}
    </div>
    <div class="panel">
      <div class="panel-head"><div><h2>⚠️ Dans l'appli, mais pas dans le relevé</h2><div class="sub">Peut être normal (délai bancaire) ou signaler une erreur de saisie</div></div></div>
      ${appNonTrouves.length===0 ? `<div class="hint">Aucun écart — bravo ! 🎉</div>` : `
      <div class="table-wrap"><table><thead><tr><th>Date</th><th>Libellé</th><th>Montant</th></tr></thead><tbody>${appNonTrouves.map(ligneAppSeule).join('')}</tbody></table></div>`}
    </div>
    <div class="panel">
      <div class="panel-head"><div><h2>⚠️ Au relevé, mais pas dans l'appli</h2><div class="sub">Un mouvement bancaire jamais enregistré dans EcoMaZ — à vérifier</div></div></div>
      ${releveNonTrouves.length===0 ? `<div class="hint">Aucun écart — bravo ! 🎉</div>` : `
      <div class="table-wrap"><table><thead><tr><th>Date</th><th>Libellé</th><th>Montant</th></tr></thead><tbody>${releveNonTrouves.map(ligneReleveSeule).join('')}</tbody></table></div>`}
    </div>` : ''}`;
}
function handleComparerReleve(){
  ui.filters.rapprochementTexte = document.getElementById('texteReleve').value;
  renderView('comptabilite');
}

/* --- 12.2 Scolarité --- */
/* ---------- Refonte : carte de paiement d'un élève (DESIGN.md §11, affichage seulement) ---------- */
function etatScolarite(e, info){
  if(!info.reste) return 'solde';
  const auj = todayISO();
  const ech = echeancesDeClasse(e.classeId);
  return info.detail.some(d => d.statut !== 'paye' && (ech.find(x => x.label === d.label)?.dateEcheance || '9999') < auj) ? 'retard' : 'reste';
}
function carteScolarite(e, info){
  const auj = todayISO(), ech = echeancesDeClasse(e.classeId);
  const pct = info.total ? Math.min(100, Math.round(100 * info.totalPaye / info.total)) : 0;
  const datePaiement = label => (DB.paiementsScolarite || []).filter(p => p.eleveId === e.id && p.tranche === label).map(p => p.date).sort().pop();
  const court = iso => iso ? new Date(iso + 'T12:00:00').toLocaleDateString('fr-FR', { day:'numeric', month:'short' }) : '';
  const lignes = info.detail.map(d => {
    const limite = ech.find(x => x.label === d.label)?.dateEcheance || null;
    const enRetard = d.statut !== 'paye' && limite && limite < auj;
    const badge = d.statut === 'paye' ? `<span class="badge-etat ok">${icone('check')}Payé</span>`
      : enRetard ? `<span class="badge-etat erreur">${icone('triangle-alert')}En retard</span>`
      : `<span class="badge-etat attente">${icone('clock')}À payer</span>`;
    const sous = d.statut === 'paye' ? `Payé le ${court(datePaiement(d.label))}`
      : d.statut === 'partiel' ? `Reste ${fmtFCFA(d.montant - d.paye)}${limite ? ' · avant le ' + court(limite) : ''}`
      : limite ? `Avant le ${court(limite)}` : '';
    return `<li class="sc-ligne">
      <span class="sc-lib"><span>${escapeHtml(d.label)}</span>${sous ? `<small>${sous}</small>` : ''}</span>
      <span class="sc-mt">${fmtFCFA(d.montant)}</span>
      <span class="sc-etat">${badge}${d.statut !== 'paye' ? `<button type="button" class="btn sm" onclick="openPaiementScolariteForm('${e.id}','${escapeHtml(d.label).replace(/'/g, "\\'")}')">Encaisser</button>` : ''}</span>
    </li>`;
  }).join('');
  return `<article class="scol-carte" data-nom="${escapeHtml(eleveFullName(e).toLowerCase())}" data-etat="${etatScolarite(e, info)}">
    <header class="sc-tete">
      <span class="lc-avatar" aria-hidden="true">${escapeHtml(initials(e.prenom, e.nom))}</span>
      <span class="sc-id"><strong>${escapeHtml(eleveFullName(e))}</strong><small>${escapeHtml(classeName(e.classeId))}</small></span>
      <span class="sc-reste ${info.reste ? 'du' : 'ok'}"><small>${info.reste ? 'Reste à payer' : 'Soldé'}</small><strong>${info.reste ? fmtFCFA(info.reste) : icone('circle-check')}</strong></span>
    </header>
    <div class="sc-progression"><div class="sc-piste"><div style="width:${pct}%"></div></div><span>${fmtFCFA(info.totalPaye)} / ${fmtFCFA(info.total)}</span></div>
    <ul class="sc-echeances">${lignes}</ul>
    <footer class="sc-pied">
      <span class="sc-actions"><button type="button" class="btn secondary sm" onclick="voirHistoriqueScolarite('${e.id}')">Reçu</button>${info.reste ? `<button type="button" class="btn secondary sm" onclick="genererLienPaiement('${e.id}', null, ${info.reste})">Lien de paiement</button>` : ''}</span>
      <span class="sc-totaux"><span>Total <strong>${fmtFCFA(info.total)}</strong></span><span>Reste <strong class="${info.reste ? 'du' : 'ok'}">${fmtFCFA(info.reste)}</strong></span></span>
    </footer>
  </article>`;
}
// Recherche + filtres sans recharger l'écran (le champ garde le focus)
function filtrerScolarite(){
  const etat = ui.filters.scolEtat || 'tous';
  const texte = simplifierTexte(document.querySelector('.scol-recherche')?.value || '');
  let visibles = 0;
  document.querySelectorAll('.scol-carte, .scol-table tbody tr').forEach(el => {
    const ok = (etat === 'tous' || el.dataset.etat === etat || (etat === 'reste' && el.dataset.etat === 'retard')) && (!texte || simplifierTexte(el.dataset.nom || '').includes(texte));
    el.hidden = !ok;
    if(ok && el.classList.contains('scol-carte')) visibles++;
  });
  document.querySelectorAll('.segmente .seg').forEach(b => b.classList.toggle('actif', b.dataset.etat === etat));
  const vide = document.querySelector('.scol-aucun'); if(vide) vide.hidden = visibles > 0 || !document.querySelector('.scol-carte');
}
function renderComptaScolarite(){
  if(DB.classes.length === 0){
    return `<div class="panel"><div class="empty-state"><div class="em-ic">🎓</div>Aucune classe configurée pour le moment. Activez au moins un niveau scolaire dans <strong>Paramètres</strong> pour commencer à suivre la scolarité.</div></div>`;
  }
  const classeId = ui.filters.comptaClasse || DB.classes[0].id;
  ui.filters.comptaClasse = classeId;
  const eleves = DB.eleves.filter(e=>e.classeId===classeId && e.statut==='Actif').sort((a,b)=>a.nom.localeCompare(b.nom));
  const echeances = echeancesDeClasse(classeId);
  const grilleActive = echeances.length > 0;

  const du = duAnnuelClasse(classeId);
  let totalDu=0, totalPaye=0;
  const cartesScol = [];

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
            : `<button class="btn secondary sm" onclick="openPaiementScolariteForm('${e.id}','${escapeHtml(d.label).replace(/'/g,"\\'")}')">Encaisser</button>`;
        return `<td style="text-align:center;">${contenu}</td>`;
      }).join('');
      cartesScol.push(carteScolarite(e, info));
      return `<tr data-nom="${escapeHtml(eleveFullName(e).toLowerCase())}" data-etat="${etatScolarite(e, info)}">
        <td><div class="row-name"><span class="avatar">${initials(e.prenom,e.nom)}</span>${escapeHtml(eleveFullName(e))}</div></td>
        ${cellules}
        <td class="amount" style="font-weight:800;">${fmtFCFA(info.total)}</td>
        <td class="amount ${info.reste>0?'out':''}" style="font-weight:800;">${fmtFCFA(info.reste)}</td>
        <td style="white-space:nowrap;">
          <button class="btn secondary sm" onclick="voirHistoriqueScolarite('${e.id}')">Reçu</button>
          ${info.reste>0 ? `<button class="btn secondary sm" title="Lien de paiement pour le parent" aria-label="Lien de paiement" onclick="genererLienPaiement('${e.id}', null, ${info.reste})">Lien</button>` : ''}
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
          ${['direction','fondation'].includes(ui.role) ? `<button class="btn secondary" onclick="go('parametres')" title="Gérer les échéances (Frais d'inscription, versements...) depuis Paramètres">🎓 Échéances</button>` : ''}
          <button class="btn secondary" onclick="exporterScolariteExcel()">⬇️ Excel (toutes les classes)</button>
          ${grilleActive ? '' : `<button class="btn secondary" onclick="openFraisScolariteForm()">⚙️ Configurer les frais</button>`}
        </div>
      </div>
      <div class="progress" style="margin-bottom:16px;"><div style="width:${tauxClasse}%;background:${tauxClasse>=80?'var(--green)':tauxClasse>=50?'var(--amber)':'var(--red)'};"></div></div>
      ${eleves.length===0 ? `<div class="empty-state"><div class="em-ic">🎓</div>Aucun élève actif dans cette classe.</div>` : grilleActive ? `
      <div class="scol-outils">
        <input type="search" class="scol-recherche" placeholder="Rechercher un élève" aria-label="Rechercher un élève" oninput="filtrerScolarite()">
        <div class="segmente" role="group" aria-label="Filtrer les élèves">${[['tous','Tous'],['solde','Soldés'],['reste','Avec reste'],['retard','En retard']].map(([k, l]) => `<button type="button" class="seg${(ui.filters.scolEtat || 'tous') === k ? ' actif' : ''}" data-etat="${k}" onclick="ui.filters.scolEtat='${k}'; filtrerScolarite()">${l}</button>`).join('')}</div>
      </div>
      <div class="scol-cartes seulement-mobile">${cartesScol.join('')}</div>
      <div class="table-wrap seulement-ordi"><table class="scol-table">
        <thead>${theadHtml}</thead>
        <tbody>${rows}</tbody>
      </table></div>
      <div class="etat-vide scol-aucun" hidden><span class="etat-vide-ic" aria-hidden="true">${icone('search')}</span><span>Aucun élève pour ce filtre. <button type="button" class="lien-discret" onclick="ui.filters.scolEtat='tous'; const r=document.querySelector('.scol-recherche'); if(r) r.value=''; filtrerScolarite()">Effacer les filtres</button></span></div>
      ${(setTimeout(filtrerScolarite, 0), '')}` : `
      <div class="table-wrap"><table>
        <thead>${theadHtml}</thead>
        <tbody>${rows}</tbody>
      </table></div>`}
    </div>`;
}

function optionsEcheancesScolarite(selectedLabel, classeId){
  const grille = echeancesDeClasse(classeId);
  if(grille.length){
    return grille.map(e=>`<option value="${escapeHtml(e.label)}" data-montant="${e.montant}" ${selectedLabel===e.label?'selected':''}>${escapeHtml(e.label)} — ${fmtFCFA(e.montant)}</option>`).join('');
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
        <div class="field"><label>Échéance / Tranche</label><select name="tranche" onchange="const o=this.selectedOptions[0]; if(o && o.dataset.montant) document.getElementById('paiementMontant').value = o.dataset.montant;">${optionsEcheancesScolarite(trancheLabel, e?.classeId)}</select></div>
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
    confirmerPaiementParent(rec, e);
  }catch(e){ alert('Erreur : ' + e.message); }
  return false;
}
// Confirmation automatique au parent : message dans son application +
// notification, et bouton WhatsApp sous le reçu (gratuit).
async function confirmerPaiementParent(rec, e){
  if(!e) return;
  const g = scolariteEleveParEcheance(e.id), info = scolariteEleveInfo(e.id);
  const du = g.total || info.du, paye = g.total ? g.totalPaye : info.paye, reste = Math.max(0, du - paye);
  const texte = `🧾 Paiement reçu le ${fmtDate(rec.date)} : ${fmtFCFA(rec.montant)} (${rec.modePaiement || 'espèces'}) — ${rec.tranche || 'Scolarité'} — ${eleveFullName(e)}.`
    + (du ? (reste ? ` Reste à payer : ${fmtFCFA(reste)}.` : ' Scolarité soldée.') : '') + ` Merci ! — ${DB.meta?.nomEcole || ''}`;
  try{
    const { data } = await sb.from('messages_internes').insert({ destinataire_type: 'parent', eleve_id: e.id, contenu: texte, auteur_nom: DB.meta?.nomEcole || '' }).select().single();
    if(data) DB.messagesInternes = [rowToCamel(data)].concat(DB.messagesInternes || []);
  }catch(_e){}
  notifierParentsPush([e.id], texte);
  const tels = String(e.parentTel || '').split(/\s*[\/;,|]\s*|\s+-\s+|\s+et\s+/i).map(t => t.replace(/\D/g, '').replace(/^225/, '')).filter(t => t.length === 10);
  const corps = document.getElementById('modalBody');
  if(corps && tels.length){
    const z = document.createElement('div'); z.className = 'form-actions no-print'; z.style.flexWrap = 'wrap';
    z.innerHTML = `<span class="hint" style="margin:0 auto 0 0;">Le parent a été prévenu dans son application.</span>` + tels.map(t => `<a class="btn secondary sm" href="https://wa.me/225${t}?text=${encodeURIComponent(texte)}" target="_blank" rel="noopener">📲 WhatsApp ${t.replace(/(\d{2})(?=\d)/g, '$1 ')}</a>`).join('');
    corps.appendChild(z);
  }
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
        <div class="field"><label>Échéance / Tranche</label><select name="tranche">${optionsEcheancesScolarite(p.tranche, eleveById(p.eleveId)?.classeId)}</select></div>
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
    <form id="formPersonnel" onsubmit="return handleSavePersonnel(event,'${id||''}')">
      <button type="button" class="btn secondary sm" style="margin-bottom:14px;" onclick="ouvrirRemplissageIntelligent('personnel', SCHEMA_PERSONNEL, (r)=>appliquerRemplissage('formPersonnel', r))">✨ Remplir automatiquement</button>
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
    const { error } = await exigerEffet(sb.from('ecoles').update({ loyer_mensuel: loyerMensuel }).eq('id', session.ecoleId));
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
/* ---------------------------------------------------------------------
   MESSAGES ENVOYÉS AUX PARENTS — accusés de lecture (schema.sql section 73)
   --------------------------------------------------------------------- */
function renderMessagesEnvoyesParents(){
  if(!['secretariat','direction','fondation'].includes(ui.role)) return '';
  const tous = (DB.messagesInternes || []).filter(m => m.destinataireType === 'parent')
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  if(!tous.length) return '';
  const nonLus = ui.filters.envoyesNonLus;
  const liste = tous.filter(m => !nonLus || !m.lu).slice(0, 40);
  const lus = tous.filter(m => m.lu).length;
  const quand = (iso) => { const d = new Date(iso); return `${fmtDate(isoLocal(d))} à ${d.toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' })}`; };
  return `<div class="panel">
    <div class="panel-head"><div><h2>📤 Messages envoyés aux parents</h2><div class="sub">${lus} sur ${tous.length} lu(s) (${Math.round(100 * lus / tous.length)} %) — ✓ envoyé, ✓✓ lu par le parent.</div></div>
      <button class="btn secondary sm" onclick="ui.filters.envoyesNonLus=${!nonLus}; renderView('messagerie')">${nonLus ? 'Tout afficher' : 'Non lus seulement'}</button></div>
    ${!liste.length ? '<div class="hint">Tous les messages ont été lus. 👏</div>' : `<div class="table-wrap"><table>
      <thead><tr><th>Envoyé</th><th>Élève</th><th>Message</th><th>Lecture</th></tr></thead>
      <tbody>${liste.map(m => { const e = eleveById(m.eleveId); return `<tr>
        <td style="white-space:nowrap;">${m.createdAt ? quand(m.createdAt) : '—'}</td>
        <td>${e ? escapeHtml(eleveFullName(e)) : '—'}</td>
        <td style="max-width:340px;">${escapeHtml(String(m.contenu || '').slice(0, 140))}${String(m.contenu || '').length > 140 ? '…' : ''}</td>
        <td style="white-space:nowrap;">${m.lu ? `<span class="badge green">✓✓ Lu</span>${m.luAt ? `<br><span class="hint">${quand(m.luAt)}</span>` : ''}` : `<span class="badge">✓ Envoyé</span>${e && telephonesWhatsapp(e.parentTel).length ? `<br><a class="hint" href="https://wa.me/${telephonesWhatsapp(e.parentTel)[0]}?text=${encodeURIComponent('Bonjour, un message de ' + (DB.meta?.nomEcole || 'l’école') + ' vous attend dans l’application EcoMaZ Parents. Merci !')}" target="_blank" rel="noopener">📲 Prévenir</a>` : ''}`}</td>
      </tr>`; }).join('')}</tbody></table></div>`}
  </div>`;
}
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
    <div class="section-note">📨 À chaque absence, le parent est prévenu dans son application ; le secrétariat peut aussi le prévenir gratuitement par WhatsApp depuis l'appel (« Prévenir le parent »). La Direction et la Fondation reçoivent l'alerte dans l'application. Les absences/retards d'enseignants restent des notifications internes pour Direction et Fondation.</div>
    ${renderMessagesParents()}
    ${renderMessagesEnvoyesParents()}
    ${renderObjetsPerdusEcole()}
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
/* ---------------------------------------------------------------------
   TABLEAU D'AFFICHAGE — tableaux d'honneur + bannière d'actualités,
   gérés ici par Direction/Fondation, affichés publiquement sur
   affichage.html (voir ce fichier — écran de hall, sans connexion).
   --------------------------------------------------------------------- */
const HONNEUR_PERIODES = [
  {id:'mois', label:'Du mois'},
  {id:'trimestre', label:'Du trimestre'},
  {id:'annee', label:"De l'année"},
];
const HONNEUR_CATEGORIES = [
  {id:'eleve', label:'Élève', icon:'🧒'},
  {id:'enseignant', label:'Enseignant(e)', icon:'👩‍🏫'},
];
function honneurActuel(categorie, periode){
  return (DB.tableauHonneur||[]).find(h=>h.categorie===categorie && h.periode===periode);
}
// Menu « ⋯ » : les actions secondaires (dont Supprimer) ne dominent plus l'écran
function menuPlus(actions, libelle){
  return `<details class="menu-plus"><summary class="btn secondary sm" aria-label="${escapeHtml(libelle || 'Plus d’actions')}" title="${escapeHtml(libelle || 'Plus d’actions')}">⋯</summary>
    <div class="menu-plus-liste">${actions.map(a => `<button type="button" class="btn-reset${a.danger ? ' danger' : ''}" onclick="this.closest('details').open=false; ${a.onclick}">${escapeHtml(a.label)}</button>`).join('')}</div></details>`;
}
function renderTableauAffichage(){
  const base = location.href.replace(/[^/]*$/, '');
  const lienPublic = `${base}affichage.html?ecole=${session.ecoleId}`;
  const actus = (DB.actualitesAffichage||[]).slice().sort((a,b)=> (b.createdAt||'').localeCompare(a.createdAt||''));
  return `<div class="view active">
    <div class="panel">
      <div class="panel-head">
        <div><h2>Écran du hall</h2><div class="sub">À ouvrir sur la télévision ou la tablette de l’entrée — aucune connexion nécessaire</div></div>
        <button class="btn secondary sm" onclick="copierLienAffichage('${lienPublic}')">${icone('link')} Copier le lien</button>
      </div>
      <div class="ta-lien">${escapeHtml(lienPublic)}</div>
    </div>

    ${HONNEUR_CATEGORIES.map(cat=>`
      <div class="panel">
        <div class="panel-head"><div><h2>${cat.id === 'eleve' ? 'Élèves à l’honneur' : 'Enseignants à l’honneur'}</h2><div class="sub">Affichés en grand sur l’écran du hall</div></div></div>
        <div class="honneur-grille">
          ${HONNEUR_PERIODES.map(per=>{
            const h = honneurActuel(cat.id, per.id);
            const titre = `${cat.id === 'eleve' ? 'Élève' : 'Enseignant(e)'} ${per.id === 'mois' ? 'du mois' : per.id === 'trimestre' ? 'du trimestre' : 'de l’année'}`;
            return h ? `<article class="honneur-carte honneur-${per.id}">
                <span class="honneur-medaille" aria-hidden="true">${icone('trophy')}</span>
                <span class="honneur-periode">${titre}</span>
                <span class="lc-avatar honneur-avatar" aria-hidden="true">${escapeHtml(initials(...String(h.nomAffiche || '? ?').split(' ')))}</span>
                <strong class="honneur-nom">${escapeHtml(h.nomAffiche)}</strong>
                ${h.classeOuMatiere ? `<span class="puce-classe">${escapeHtml(h.classeOuMatiere)}</span>` : ''}
                ${h.libellePeriode ? `<span class="honneur-libelle">${escapeHtml(h.libellePeriode)}</span>` : ''}
                <button type="button" class="lien-discret" onclick="ouvrirModifierHonneur('${cat.id}','${per.id}')">Modifier</button>
              </article>`
              : `<article class="honneur-carte honneur-vide">
                <span class="honneur-periode">${titre}</span>
                <span class="honneur-medaille vide" aria-hidden="true">${icone('trophy')}</span>
                <span class="hint" style="margin:0;">Personne pour l’instant</span>
                <button type="button" class="btn secondary sm" onclick="ouvrirModifierHonneur('${cat.id}','${per.id}')">Choisir</button>
              </article>`;
          }).join('')}
        </div>
      </div>
    `).join('')}

    <div class="panel">
      <div class="panel-head">
        <div><h2>Bannière d’actualités</h2><div class="sub">Défile en bas de l’écran du hall</div></div>
      </div>
      <div class="ta-bandeau" aria-label="Aperçu du défilement"><div class="ta-bandeau-txt">${actus.length ? actus.map(a => escapeHtml(a.texte)).join('<span class="ta-sep">•</span>') : 'Vos annonces défileront ici.'}</div></div>
      <form onsubmit="return handleAjouterActualite(event)" class="ta-ajout">
        <input type="text" id="nouvelleActualite" placeholder="Ex : Réunion de parents le 15 octobre à 17h" aria-label="Nouvelle annonce" required>
        <button class="btn" type="submit">Ajouter</button>
      </form>
      ${renderListeActualites()}
    </div>
  </div>`;
}
function renderListeActualites(){
  const actus = (DB.actualitesAffichage||[]).slice().sort((a,b)=> (b.createdAt||'').localeCompare(a.createdAt||''));
  if(!actus.length) return `<div class="etat-vide"><span class="etat-vide-ic" aria-hidden="true">${icone('newspaper')}</span><span>Aucune annonce pour l’instant. Écrivez la première ci-dessus.</span></div>`;
  return `<ul class="liste-compacte ta-actus">${actus.map(a => `<li class="lc-ligne">
      <span class="lc-txt"><strong>${escapeHtml(a.texte)}</strong>${a.createdAt ? `<small>Ajoutée le ${fmtDate(String(a.createdAt).slice(0, 10))}</small>` : ''}</span>
      ${menuPlus([{ label: 'Supprimer l’annonce', danger: true, onclick: `handleSupprimerActualite('${a.id}')` }])}
    </li>`).join('')}</ul>`;
}
function copierLienAffichage(lien){
  navigator.clipboard?.writeText(lien).then(()=>toast('Lien copié')).catch(()=>toast('Impossible de copier — sélectionnez le lien manuellement'));
}
function suggestionsPeriode(periode){
  const d = new Date(), mois = d.toLocaleDateString('fr-FR', { month:'long', year:'numeric' });
  const annee = DB.meta?.anneeScolaire || '';
  const m = d.getMonth(), tri = m >= 8 && m <= 11 ? '1er trimestre' : m <= 2 ? '2e trimestre' : '3e trimestre';
  const cap = t => t.charAt(0).toUpperCase() + t.slice(1);
  return periode === 'mois' ? [cap(mois)] : periode === 'trimestre' ? [`${cap(tri)} ${annee}`.trim()] : [`Année scolaire ${annee}`.trim()];
}
function ouvrirModifierHonneur(categorie, periode){
  const h = honneurActuel(categorie, periode) || {};
  const estEleve = categorie === 'eleve';
  const options = estEleve
    ? DB.eleves.slice().sort((a,b)=>eleveFullName(a).localeCompare(eleveFullName(b))).map(e=>`<option value="${e.id}" ${h.nomAffiche===eleveFullName(e)?'selected':''}>${escapeHtml(eleveFullName(e))} — ${escapeHtml(classeName(e.classeId))}</option>`).join('')
    : (DB.enseignants||[]).slice().sort((a,b)=>ensFullName(a).localeCompare(ensFullName(b))).map(en=>`<option value="${en.id}" ${h.nomAffiche===ensFullName(en)?'selected':''}>${escapeHtml(ensFullName(en))}</option>`).join('');
  const labelPeriode = periode==='mois'?'du mois':periode==='trimestre'?'du trimestre':"de l'année";
  openModal(`Modifier — ${estEleve?'Élève':'Enseignant(e)'} ${labelPeriode}`, `
    <form onsubmit="return handleSaveHonneur(event,'${categorie}','${periode}')">
      <div class="field">
        <label>${estEleve?'Élève':'Enseignant(e)'}</label>
        <select id="honneurPersonneId" required>
          <option value="">${estEleve ? 'Choisir un élève' : 'Choisir un enseignant'}</option>
          ${options}
        </select>
      </div>
      <div class="field">
        <label for="honneurLibellePeriode">Période affichée</label>
        <input type="text" id="honneurLibellePeriode" value="${escapeHtml(h.libellePeriode||'')}" placeholder="Ex : Octobre 2026">
        <div class="suggestions-puces">${suggestionsPeriode(periode).map(t => `<button type="button" class="puce-suggestion" onclick="document.getElementById('honneurLibellePeriode').value=this.textContent">${escapeHtml(t)}</button>`).join('')}</div>
      </div>
      <div class="field">
        <label>Commentaire (optionnel)</label>
        <textarea id="honneurCommentaire" rows="3">${escapeHtml(h.commentaire||'')}</textarea>
      </div>
      <button class="btn" type="submit" style="width:100%;margin-top:10px;">Enregistrer</button>
    </form>
  `);
}
async function handleSaveHonneur(ev, categorie, periode){
  ev.preventDefault();
  const personneId = $('#honneurPersonneId').value;
  const libellePeriode = $('#honneurLibellePeriode').value.trim();
  const commentaire = $('#honneurCommentaire').value.trim();
  const estEleve = categorie === 'eleve';
  const personne = estEleve ? eleveById(personneId) : (DB.enseignants||[]).find(en=>en.id===personneId);
  if(!personne){ alert('Choisissez une personne'); return false; }
  const nomAffiche = estEleve ? eleveFullName(personne) : ensFullName(personne);
  const classeOuMatiere = estEleve ? classeName(personne.classeId) : (personne.matieres||[]).join(', ');
  try{
    const { data, error } = await sb.from('tableau_honneur')
      .upsert({ ecole_id: session.ecoleId, categorie, periode, nom_affiche: nomAffiche, classe_ou_matiere: classeOuMatiere, libelle_periode: libellePeriode, commentaire, updated_at: new Date().toISOString() }, { onConflict: 'ecole_id,categorie,periode' })
      .select().single();
    if(error) throw error;
    const row = rowToCamel(data);
    DB.tableauHonneur = (DB.tableauHonneur||[]).filter(h=>!(h.categorie===categorie && h.periode===periode));
    DB.tableauHonneur.push(row);
    closeModal();
    toast('Mis à jour');
    renderView('tableau-affichage');
  }catch(e){ alert('Erreur : ' + e.message); }
  return false;
}
async function handleAjouterActualite(ev){
  ev.preventDefault();
  const texte = $('#nouvelleActualite').value.trim();
  if(!texte) return false;
  try{
    const { data, error } = await sb.from('actualites_affichage').insert({ ecole_id: session.ecoleId, texte }).select().single();
    if(error) throw error;
    DB.actualitesAffichage = DB.actualitesAffichage || [];
    DB.actualitesAffichage.push(rowToCamel(data));
    toast('Actualité ajoutée');
    renderView('tableau-affichage');
  }catch(e){ alert('Erreur : ' + e.message); }
  return false;
}
async function handleSupprimerActualite(id){
  if(!confirm('Supprimer cette actualité ?')) return;
  try{
    const { error } = await exigerEffet(sb.from('actualites_affichage').delete().eq('id', id));
    if(error) throw error;
    DB.actualitesAffichage = (DB.actualitesAffichage||[]).filter(a=>a.id!==id);
    toast('Actualité supprimée');
    renderView('tableau-affichage');
  }catch(e){ alert('Erreur : ' + e.message); }
}

/* ---------------------------------------------------------------------
   ANNONCES HORAIRES AUTOMATIQUES — configuration (Paramètres, Direction/
   Fondation). L'envoi lui-même est géré côté serveur (pg_cron + fonction
   Edge "annoncer-horaires", chaque minute) — voir schema.sql section 35.
   --------------------------------------------------------------------- */
// Heures RÉELLES de chaque moment de la journée ; les parents sont prévenus
// « avance_minutes » avant (schema.sql section 50, fonction annoncer-horaires).
const HORAIRES_CHAMPS = [
  {fonction:'matin_debut', label:'Début des cours du matin', champPrimaire:'matinDebutPrimaire', champMaternelle:'matinDebutMaternelle'},
  {fonction:'pause_matin', label:'Pause du matin (récréation)', champPrimaire:'pauseMatinPrimaire', champMaternelle:'pauseMatinMaternelle'},
  {fonction:'midi_pause', label:'Pause de midi', champPrimaire:'midiPausePrimaire', champMaternelle:'midiPauseMaternelle'},
  {fonction:'apresmidi_debut', label:'Début des cours de l’après-midi', champPrimaire:'apresmidiDebutPrimaire', champMaternelle:'apresmidiDebutMaternelle'},
  {fonction:'apresmidi_fin', label:'Fin des cours', champPrimaire:'apresmidiFinPrimaire', champMaternelle:'apresmidiFinMaternelle'},
];
const HORAIRES_DEFAUTS = {
  matinDebutPrimaire:'07:30', matinDebutMaternelle:'08:00',
  pauseMatinPrimaire:'10:00', pauseMatinMaternelle:'10:00',
  midiPausePrimaire:'12:00', midiPauseMaternelle:'11:00',
  apresmidiDebutPrimaire:'14:00', apresmidiDebutMaternelle:'14:00',
  apresmidiFinPrimaire:'16:00', apresmidiFinMaternelle:'16:00',
  renforcementFin:'17:00',
};
const JOURS_COMPLETS = ['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche'];
function renderHorairesAnnonces(){
  const h = DB.horairesAnnonces || {};
  const avance = Number.isFinite(h.avanceMinutes) ? h.avanceMinutes : 15;
  const jours = h.joursCours || [1,2,3,4,5];
  const nbRenf = (DB.eleves||[]).filter(e => e.renforcement && e.statut === 'Actif').length;
  return `
    <form onsubmit="return handleSaveHoraires(event)">
      <label style="display:flex;align-items:center;gap:10px;margin-bottom:14px;">
        <input type="checkbox" name="actif" ${h.actif!==false?'checked':''}>
        <strong>Activer les annonces automatiques aux parents</strong>
      </label>
      <div class="hint" style="margin-bottom:10px;">Indiquez l’heure <strong>réelle</strong> de chaque moment : les parents sont prévenus automatiquement
        <input type="number" name="avanceMinutes" min="0" max="60" value="${avance}" style="width:70px;display:inline-block;"> minutes avant, dans leur application.</div>
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Moment</th><th>Primaire</th><th>Maternelle / Garderie</th></tr></thead>
        <tbody>
          ${HORAIRES_CHAMPS.map(c=>`
            <tr>
              <td>${c.label}</td>
              <td><input type="time" name="${c.champPrimaire}" value="${(h[c.champPrimaire]||HORAIRES_DEFAUTS[c.champPrimaire]).slice(0,5)}"></td>
              <td><input type="time" name="${c.champMaternelle}" value="${(h[c.champMaternelle]||HORAIRES_DEFAUTS[c.champMaternelle]).slice(0,5)}"></td>
            </tr>`).join('')}
          <tr>
            <td>Fin du cours de renforcement<div class="hint" style="margin:0;">commence à la fin des cours · ${nbRenf} élève(s) coché(s)</div></td>
            <td colspan="2"><input type="time" name="renforcementFin" value="${(h.renforcementFin||HORAIRES_DEFAUTS.renforcementFin).slice(0,5)}"></td>
          </tr>
        </tbody>
      </table></div>
      <div class="field" style="margin-top:12px;"><label>Jours de classe</label>
        <div style="display:flex;flex-wrap:wrap;gap:12px;">${JOURS_COMPLETS.map((j, i) => `<label style="display:flex;align-items:center;gap:6px;font-weight:600;"><input type="checkbox" name="jour" value="${i+1}" ${jours.includes(i+1)?'checked':''}> ${j}</label>`).join('')}</div>
      </div>
      <div class="field"><label>Rappel si l’appel n’est pas fait à</label>
        <input type="time" name="rappelAppel" value="${(h.rappelAppel === undefined ? '09:00' : (h.rappelAppel || '')).slice(0,5)}">
        <div class="hint" style="margin:4px 0 0;">À cette heure, la Direction, le secrétariat et l’enseignant reçoivent une notification pour chaque classe sans appel. Laissez vide pour ne pas être rappelé.</div>
      </div>
      <div class="field"><label>Vacances : suspendre les annonces jusqu’au (inclus)</label>
        <input type="date" name="suspenduJusquau" value="${h.suspenduJusquau || ''}">
        <div class="hint" style="margin:4px 0 0;">Laissez vide pendant l’année scolaire. Les annonces reprennent toutes seules le lendemain de cette date.</div>
      </div>
      <div class="hint" style="margin-top:10px;">Les élèves du cours de renforcement se cochent sur leur fiche (Élèves &amp; Inscriptions → modifier). Leurs parents reçoivent un message à part : « votre enfant est retenu pour le renforcement », puis la fin du renforcement.</div>
      <div class="form-actions"><button class="btn" type="submit">Enregistrer les horaires</button></div>
    </form>
  `;
}
async function handleSaveHoraires(ev){
  ev.preventDefault();
  const fd = new FormData(ev.target);
  const jours = fd.getAll('jour').map(Number).sort();
  const avance = Math.min(60, Math.max(0, parseInt(fd.get('avanceMinutes'), 10) || 0));
  const payload = { ecole_id: session.ecoleId, actif: fd.get('actif') === 'on', avance_minutes: avance,
    jours_cours: jours, suspendu_jusquau: fd.get('suspenduJusquau') || null,
    renforcement_fin: fd.get('renforcementFin') || HORAIRES_DEFAUTS.renforcementFin,
    rappel_appel: fd.get('rappelAppel') || null };
  HORAIRES_CHAMPS.forEach(c=>{
    payload[camelToSnake(c.champPrimaire)] = fd.get(c.champPrimaire) || HORAIRES_DEFAUTS[c.champPrimaire];
    payload[camelToSnake(c.champMaternelle)] = fd.get(c.champMaternelle) || HORAIRES_DEFAUTS[c.champMaternelle];
  });
  if(!jours.length){ alert('Cochez au moins un jour de classe.'); return false; }
  try{
    const { data, error } = await sb.from('horaires_annonces').upsert(payload, { onConflict: 'ecole_id' }).select().single();
    if(error) throw error;
    DB.horairesAnnonces = rowToCamel(data);
    toast('Horaires enregistrés');
    renderView('parametres');
  }catch(e){ alert('Erreur : ' + e.message); }
  return false;
}

/* ---------------------------------------------------------------------
   ZONE DE L'ÉTABLISSEMENT (géofence) — utilisée par le pointage GPS.
   --------------------------------------------------------------------- */
function allerAuxDemandesAcces(){
  setTimeout(() => { const z = document.getElementById('panneauDemandesAcces'); if(z) z.scrollIntoView({ behavior:'smooth', block:'start' }); }, 150);
}
async function chargerDemandesAcces(){
  const box = $('#demandesAccesBox'); if(!box) return;
  const { data, error } = await sb.from('demandes_acces').select('*').eq('statut','en_attente').order('created_at');
  if(error){ box.innerHTML = `<div class="hint">Erreur : ${escapeHtml(error.message)}</div>`; return; }
  window.__demandesAcces = Object.fromEntries((data || []).map(d => [d.id, d]));
  if(!data.length){ box.innerHTML = `<div class="etat-vide etat-vide-ok"><span class="etat-vide-ic" aria-hidden="true">${icone('circle-check')}</span><span>Aucune demande en attente.</span></div>`; return; }
  const chiffres = t => String(t || '').replace(/\D/g, '').replace(/^225/, '').slice(-10);
  const sure = d => {
    if(d.role_demande !== 'parent') return false;
    const tel = chiffres(d.telephone), enfants = (d.eleve_ids || []).map(id => eleveById(id)).filter(Boolean);
    return tel.length >= 8 && enfants.length > 0 && enfants.every(e => telephonesWhatsapp(e.parentTel).map(chiffres).includes(tel));
  };
  const nbSures = data.filter(sure).length;
  const entete = `<div class="dem-resume"><span>${data.length} demande${data.length > 1 ? 's' : ''} en attente${nbSures ? ` · <strong>${nbSures} sûre${nbSures > 1 ? 's' : ''}</strong> (téléphone identique à la fiche de l’enfant)` : ''}</span>
    ${nbSures > 1 ? `<button type="button" class="btn sm" onclick="approuverDemandesSures()">Approuver les ${nbSures} demandes sûres</button>` : ''}</div>`;
  box.innerHTML = entete + data.map(d=>{
    const parent = d.role_demande === 'parent', enseignant = d.role_demande === 'enseignant';
    const opts = (DB.eleves||[]).filter(e=>e.statut==='Actif').map(e=>`<option value="${e.id}">${escapeHtml(e.nom)} ${escapeHtml(e.prenom)}</option>`).join('');
    if(enseignant){
      const choisies = new Set(d.classe_ids || []);
      const libres = (DB.enseignants || []).filter(t => !(DB.profiles || []).some(p => p.enseignantId === t.id));
      const mots = t => simplifierTexte(t).split(' ').filter(m => m.length >= 3);
      const nomDem = new Set(mots(d.nom));
      // Fiche suggérée : même téléphone d'abord (indice fort), sinon nom ressemblant
      const chiffres = t => String(t || '').replace(/\D/g, '').replace(/^225/, '').slice(-10);
      const telDem = chiffres(d.telephone);
      const parTel = telDem.length >= 8 ? libres.find(t => chiffres(t.telephone) === telDem) : null;
      const parNom = libres.find(t => mots(`${t.prenom} ${t.nom}`).filter(m => nomDem.has(m)).length >= 1);
      const suggere = parTel || parNom;
      const classesFiche = new Set(suggere?.classesAssignees || []);
      const memesClasses = suggere && classesFiche.size && [...choisies].every(c => classesFiche.has(c));
      const indices = suggere ? [
        parTel ? '<span class="badge green">✅ Téléphone identique à la fiche ' + escapeHtml(ensFullName(suggere)) + '</span>' : '<span class="badge amber">Fiche trouvée par le nom seulement : vérifiez</span>',
        parNom && parTel && parNom.id === parTel.id ? '<span class="badge green">✅ Nom identique</span>' : '',
        classesFiche.size ? (memesClasses ? '<span class="badge green">✅ Classes cochées = classes de la fiche</span>' : '<span class="badge amber">⚠️ Classes cochées différentes de la fiche</span>') : '',
      ].join(' ') : '<span class="badge">Aucune fiche enseignant correspondante : une nouvelle sera créée</span>';
      return `<div class="dem-carte">
        <strong>Enseignant — ${escapeHtml(d.nom)}</strong>
        <div class="hint">${escapeHtml(d.email||'')}${d.telephone ? ' · ' + escapeHtml(d.telephone) : ''}</div>
        <div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:6px;">${indices}</div>
        <div class="hint" style="margin:8px 0 4px;">Classes cochées par l’enseignant — vérifiez :</div>
        <div style="display:flex;flex-wrap:wrap;gap:8px;">${DB.classes.map(c => `<label style="display:flex;align-items:center;gap:6px;"><input type="checkbox" class="demClasseVal_${d.id}" value="${c.id}" ${choisies.has(c.id)?'checked':''}> ${escapeHtml(c.nom)}</label>`).join('')}</div>
        <select id="demFiche_${d.id}" style="width:100%;margin:8px 0;"><option value="">Créer une nouvelle fiche enseignant</option>${libres.map(t => `<option value="${t.id}" ${suggere && suggere.id===t.id?'selected':''}>Relier à la fiche existante : ${escapeHtml(ensFullName(t))}</option>`).join('')}</select>
        <button class="btn sm" onclick="traiterDemandeAcces('${d.id}', true, 'enseignant')">Approuver</button>
        <button class="btn secondary sm" onclick="traiterDemandeAcces('${d.id}', false, 'enseignant')">Refuser</button>
      </div>`;
    }
    // Enfants cochés par le parent lui-même lors de son inscription
    // Enfants probables : le nom du parent (ou son message) ressemble au parent
    // noté sur la fiche, ou contient le nom / prénom de l'élève
    const choisisParParent = (d.eleve_ids || []).map(id => eleveById(id)).filter(Boolean);
    const probables = parent ? (choisisParParent.length ? choisisParParent : enfantsProbables(d)) : [];
    return `<div class="dem-carte"${sure(d) ? ` data-sure="${d.id}"` : ''}>
      <strong>${parent?'Parent':'Portier'} — ${escapeHtml(d.nom)}</strong>${sure(d) ? ' <span class="badge-etat ok">Sûre</span>' : ''}
      <div class="hint">${escapeHtml(d.email||'')}${d.telephone ? ' · 📱 ' + escapeHtml(d.telephone) : ''}${d.message?` · « ${escapeHtml(d.message)} »`:''}</div>
      ${parent && probables.length ? `<div class="hint" style="margin:8px 0 4px;">${choisisParParent.length ? 'Enfant(s) coché(s) par le parent' : 'Enfant(s) probable(s), d’après les noms'} — vérifiez avant d'approuver :</div>
        ${probables.map(e => `${indiceConfianceParent(d, e)}<label style="display:flex;align-items:center;gap:8px;margin:2px 0;"><input type="checkbox" class="demEnfant_${d.id}" value="${e.id}" checked> ${escapeHtml(eleveFullName(e))} — ${escapeHtml(classeName(e.classeId))} <span class="hint">(parent sur la fiche : ${escapeHtml(e.parentNom || '—')})</span></label>`).join('')}` : ''}
      ${parent && d.telephone && probables.some(e => !telephonesWhatsapp(e.parentTel).length) ? `<label style="display:flex;align-items:center;gap:8px;margin:6px 0;"><input type="checkbox" id="demTelFiche_${d.id}" data-tel="${escapeHtml(d.telephone)}" checked> Enregistrer ce numéro sur la fiche des enfants qui n’en ont pas</label>` : ''}
      ${parent ? `<select id="demEleve_${d.id}" style="width:100%;margin:8px 0;"><option value="">${probables.length ? '— Ajouter un autre enfant… —' : '— Lier à l’enfant… —'}</option>${opts}</select>` : ''}
      <button class="btn sm" onclick="traiterDemandeAcces('${d.id}', true, ${parent})">Approuver</button>
      <button class="btn secondary sm" onclick="traiterDemandeAcces('${d.id}', false, ${parent})">Refuser</button>
    </div>`;
  }).join('');
}
// Indice de confiance pour la direction : le numéro donné par le parent
// correspond-il à celui de la fiche de l'enfant ? Le nom ressemble-t-il ?
function indiceConfianceParent(demande, e){
  const chiffres = t => String(t || '').replace(/\D/g, '').replace(/^225/, '').slice(-10);
  const telDem = chiffres(demande.telephone);
  const telsFiche = telephonesWhatsapp(e.parentTel).map(chiffres);
  const mots = t => simplifierTexte(t).split(' ').filter(m => m.length >= 3);
  const nomOk = mots(e.parentNom).some(m => new Set(mots(demande.nom)).has(m));
  const signes = [];
  if(telDem.length >= 8 && telsFiche.includes(telDem)) signes.push('<span class="badge green">✅ Téléphone identique à la fiche</span>');
  else if(telDem.length >= 8 && telsFiche.length) signes.push('<span class="badge amber">⚠️ Téléphone différent de la fiche — appelez le numéro de la fiche pour vérifier</span>');
  else if(telDem.length >= 8) signes.push('<span class="badge">Fiche sans téléphone</span>');
  if(nomOk) signes.push('<span class="badge green">✅ Nom du parent identique à la fiche</span>');
  return signes.length ? `<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:6px;">${signes.join('')}</div>` : '';
}
function enfantsProbables(demande){
  const mots = t => simplifierTexte(t).split(' ').filter(m => m.length >= 3);
  const nomParent = new Set(mots(demande.nom));
  const message = new Set(mots(demande.message));
  return (DB.eleves || []).filter(e => e.statut === 'Actif').map(e => {
    const parentFiche = mots(e.parentNom);
    let score = parentFiche.filter(m => nomParent.has(m)).length * 2;                 // même nom que le parent de la fiche
    score += mots(e.nom).filter(m => nomParent.has(m)).length;                          // même nom de famille
    score += mots(`${e.nom} ${e.prenom}`).filter(m => message.has(m)).length * 2;       // enfant cité dans le message
    return { e, score };
  }).filter(x => x.score >= 2).sort((a, b) => b.score - a.score).slice(0, 4).map(x => x.e);
}
async function traiterDemandeAcces(id, approuver, parent){
  if(parent === 'enseignant'){
    const classes = $$('.demClasseVal_' + id).filter(c => c.checked).map(c => c.value);
    if(approuver && !classes.length){ toast('Cochez au moins une classe pour cet enseignant.'); return; }
    const fiche = $('#demFiche_' + id)?.value || null;
    const { error } = await sb.rpc('traiter_demande_acces', { p_id: id, p_approuver: approuver, p_eleve_ids: [], p_classe_ids: classes, p_enseignant_id: approuver ? fiche : null });
    if(error){ toast('Erreur : ' + error.message); return; }
    toast(approuver ? 'Enseignant validé ✅ : il ne voit que ses classes' : 'Demande refusée');
    if(approuver) proposerPrevenirApprouve(id);
    if(approuver){ try{ DB.enseignants = await dbSelectAll('enseignants_lecture'); DB.profiles = await dbSelectAll('profiles'); }catch(_e){} }
    chargerDemandesAcces();
    return;
  }
  const choix = choixDemandeParent(id, approuver && parent);
  if(approuver && parent && !choix.eleves.length){ toast("Choisissez l'enfant à lier à ce parent."); return; }
  const err = await appliquerDemandeAcces(id, approuver, choix);
  if(err){ toast('Erreur : ' + err); return; }
  toast(approuver ? 'Accès accordé ✅' : 'Demande refusée');
  if(approuver) proposerPrevenirApprouve(id);
  chargerDemandesAcces();
}
// Après une validation : prévenir la personne sur WhatsApp (gratuit, message prêt)
function proposerPrevenirApprouve(id){
  const d = (window.__demandesAcces || {})[id]; if(!d) return;
  const tels = telephonesWhatsapp(d.telephone);
  const page = d.role_demande === 'enseignant' ? 'enseignant.html' : d.role_demande === 'portier' ? 'portier.html' : 'parent.html';
  const message = `Bonjour ${d.nom || ''},

Votre accès à l’application de ${DB.meta?.nomEcole || 'l’école'} est validé. Ouvrez l’application (ou ce lien) et connectez-vous avec le même compte Google :
${lienApplication(page)}

Bienvenue !`;
  openModal('Accès accordé ✅', `
    <p style="margin-top:0;"><strong>${escapeHtml(d.nom || '')}</strong> peut maintenant entrer dans l’application. Prévenez-le (ou la) pour qu’il (elle) ne reste pas à attendre :</p>
    <div class="pe-invit-liste">${tels.map(n => `<a class="btn" href="https://wa.me/${n}?text=${encodeURIComponent(message)}" target="_blank" rel="noopener">Prévenir sur WhatsApp · ${n.replace(/^225/, '').replace(/(\d{2})(?=\d)/g, '$1 ')}</a>`).join('') || '<div class="hint">Aucun numéro WhatsApp dans la demande.</div>'}</div>
    <div class="form-actions"><button type="button" class="btn secondary" onclick="closeModal()">Plus tard</button></div>`);
}
// Lit ce que la direction a coché sur la carte d'une demande parent
function choixDemandeParent(id, parent){
  if(!parent) return { eleves: [], tel: '' };
  const coches = $$('.demEnfant_' + id).filter(c => c.checked).map(c => c.value);
  const v = $('#demEleve_' + id)?.value;
  const tel = $('#demTelFiche_' + id)?.checked ? ($('#demTelFiche_' + id).dataset.tel || '') : '';
  return { eleves: [...new Set(coches.concat(v ? [v] : []))], tel };
}
// Même fonction sécurisée côté base (traiter_demande_acces) ; renvoie le message d'erreur ou null
async function appliquerDemandeAcces(id, approuver, choix){
  const { error } = await sb.rpc('traiter_demande_acces', { p_id: id, p_approuver: approuver, p_eleve_ids: approuver ? choix.eleves : [], p_classe_ids: [], p_enseignant_id: null });
  if(error) return error.message;
  if(approuver && choix.tel){
    for(const eid of choix.eleves){
      const e = eleveById(eid);
      if(e && !telephonesWhatsapp(e.parentTel).length){
        try{ await dbUpdate('eleves', eid, { parentTel: choix.tel }); e.parentTel = choix.tel; }catch(_e){}
      }
    }
  }
  return null;
}
// Approuve d'un coup les demandes parent « sûres » (téléphone identique à la fiche de chaque enfant)
async function approuverDemandesSures(){
  const ids = $$('[data-sure]').map(el => el.dataset.sure);
  if(!ids.length) return;
  if(!confirm(`Approuver ${ids.length} parents dont le téléphone correspond à la fiche de leur enfant ? Chacun verra uniquement son ou ses enfants.`)) return;
  const choix = ids.map(id => ({ id, ...choixDemandeParent(id, true) })).filter(c => c.eleves.length);
  let ok = 0; const erreurs = [];
  for(const c of choix){ const err = await appliquerDemandeAcces(c.id, true, c); if(err) erreurs.push(err); else ok++; }
  toast(erreurs.length ? `${ok} accès accordé(s) · ${erreurs.length} erreur(s) : ${erreurs[0]}` : `${ok} accès accordés ✅`);
  chargerDemandesAcces();
}
function lienApplication(page){
  const base = window.location.href.replace(/[^/]*([?#].*)?$/, '');
  return base + page + '?ecole=' + encodeURIComponent(session.ecoleId);
}
function copierLienApplication(page){
  const lien = lienApplication(page);
  (navigator.clipboard ? navigator.clipboard.writeText(lien) : Promise.reject()).then(
    ()=>toast('Lien copié ✅'),
    ()=>{ window.prompt('Copiez ce lien :', lien); }
  );
}
// Message prêt à envoyer : le lien + comment installer l'application
function messagePartageApplication(page){
  const nomApp = page === 'parent.html' ? `EcoMaZ-PARENTS D'ELEVES ${DB.meta.nomEcole}` : page === 'enseignant.html' ? `EcoMaZ-ENSEIGNANTS ${DB.meta.nomEcole}` : `EcoMaZ-PORTIER ${DB.meta.nomEcole}`;
  if(page === 'enseignant.html') return `Bonjour, voici l'application ${nomApp} :\n${lienApplication(page)}\n\n`
    + `Ouvrez-la dans Chrome (Android) ou Safari (iPhone), touchez « Continuer avec Google », écrivez votre nom et cochez votre ou vos classes. La direction validera votre inscription.`;
  return `Bonjour, voici l'application ${nomApp} :\n${lienApplication(page)}\n\n`
    + `Pour l'installer : ouvrez ce lien dans Chrome (Android) ou Safari (iPhone), puis touchez « Installer l'application sur ce téléphone » `
    + `(sur iPhone : Partager → Sur l'écran d'accueil). Connectez-vous ensuite avec Google : l'école validera votre accès.`;
}
function afficherQrApplication(page){
  const lien = lienApplication(page);
  let image = '';
  try{ const qr = qrcode(0, 'M'); qr.addData(lien); qr.make(); image = qr.createSvgTag({ cellSize: 6, margin: 2, scalable: true }); }catch(_e){}
  const titre = page === 'parent.html' ? `EcoMaZ-PARENTS D'ELEVES ${DB.meta.nomEcole}` : page === 'enseignant.html' ? `EcoMaZ-ENSEIGNANTS ${DB.meta.nomEcole}` : `EcoMaZ-PORTIER ${DB.meta.nomEcole}`;
  openModal('QR code à afficher', `
    <div style="text-align:center;">
      <h3 style="margin-top:0;">${escapeHtml(titre)}</h3>
      <div style="max-width:280px;margin:0 auto;">${image}</div>
      <p>Scannez avec l'appareil photo du téléphone pour ouvrir et installer l'application.</p>
    </div>
    <div class="form-actions no-print"><button type="button" class="btn secondary" onclick="closeModal()">Fermer</button><button type="button" class="btn" onclick="window.print()">🖨️ Imprimer</button></div>`);
}
// Affiche A4 à imprimer (entrée de l'école, salle des professeurs) : grand QR code + 3 étapes
const AFFICHES = {
  'parent.html': { titre:'Parents, suivez votre enfant', sous:'L’application des parents de l’école', etapes:['Scannez ce code avec l’appareil photo de votre téléphone.','Touchez « Continuer avec Google » puis cochez le nom de votre enfant.','L’école valide : vous recevez absences, devoirs, messages et annonces.'] },
  'enseignant.html': { titre:'Enseignants, votre application', sous:'Appel, devoirs, « Ma journée »', etapes:['Scannez ce code avec l’appareil photo de votre téléphone.','Touchez « Continuer avec Google », écrivez votre nom et cochez vos classes.','La direction valide : vous ne voyez que vos classes.'] },
  'preinscription.html': { titre:'Inscriptions ouvertes', sous:'Pré-inscrivez votre enfant en ligne', etapes:['Scannez ce code avec l’appareil photo de votre téléphone.','Remplissez le formulaire (2 minutes, sans créer de compte).','L’école vous rappelle pour finaliser l’inscription.'] },
};
function imprimerAffiche(page){
  const a = AFFICHES[page]; if(!a) return;
  const lien = page === 'preinscription.html' ? lienPreinscription() : lienApplication(page);
  let qr = '';
  try{ const q = qrcode(0, 'M'); q.addData(lien); q.make(); qr = q.createSvgTag({ cellSize: 8, margin: 2, scalable: true }); }catch(_e){}
  const m = DB.meta || {};
  openModal('🖨️ Affiche à imprimer', `
    <div class="affiche-a4">
      <div class="affiche-tete">${m.logo ? `<img src="${m.logo}" alt="">` : ''}<div><div class="affiche-ecole">${escapeHtml(m.nomEcole || '')}</div><div class="affiche-sous">${escapeHtml(a.sous)}</div></div></div>
      <h1 class="affiche-titre">${escapeHtml(a.titre)}</h1>
      <div class="affiche-qr">${qr}</div>
      <ol class="affiche-etapes">${a.etapes.map(e => `<li>${escapeHtml(e)}</li>`).join('')}</ol>
      <div class="affiche-lien">${escapeHtml(lien)}</div>
      <div class="affiche-pied">Gratuit · sans publicité · EcoMaZ</div>
    </div>
    <div class="form-actions no-print"><button type="button" class="btn secondary" onclick="closeModal()">Fermer</button><button type="button" class="btn" onclick="window.print()">🖨️ Imprimer l’affiche</button></div>`);
}
function renderLiensApplications(){
  const bloc = (titre, page, desc) => `
    <div style="margin-bottom:14px;">
      <strong>${titre}</strong>
      <div class="hint" style="margin:4px 0 6px;">${desc}</div>
      <input type="text" readonly value="${escapeHtml(lienApplication(page))}" onfocus="this.select()" style="width:100%;margin-bottom:6px;">
      <a class="btn sm" href="https://wa.me/?text=${encodeURIComponent(messagePartageApplication(page))}" target="_blank" rel="noopener">📲 Envoyer par WhatsApp</a>
      <button class="btn secondary sm" onclick="copierLienApplication('${page}')">📋 Copier le lien</button>
      <button class="btn secondary sm" onclick="afficherQrApplication('${page}')">🔳 QR code</button>
      ${AFFICHES[page] ? `<button class="btn secondary sm" onclick="imprimerAffiche('${page}')">🖨️ Affiche A4</button>` : ''}
      <a class="btn secondary sm" href="${escapeHtml(lienApplication(page))}" target="_blank" rel="noopener">Ouvrir</a>
    </div>`;
  return `
    ${bloc('👪 Application Parents', 'parent.html', 'À envoyer aux parents avec leurs identifiants (SMS, WhatsApp…). Ils voient les tableaux d’honneur, actualités et messages de l’école.')}
    ${bloc('👩‍🏫 Application Enseignants', 'enseignant.html', 'Chaque enseignant s’inscrit lui-même avec Google et coche ses classes ; vous validez dans Demandes d’accès. Il ne voit ensuite que ses classes.')}
    ${bloc('🚪 Application Portier', 'portier.html', 'À ouvrir une seule fois sur le téléphone du portier. Ses signalements arrivent directement chez les enseignants.')}
    <div class="hint" style="line-height:1.6;">
      <strong>Pour installer :</strong> ouvrir le lien dans Chrome (Android) ou Safari (iPhone), puis toucher « 📲 Installer l’application sur ce téléphone » ou, sur iPhone, <em>Partager → Sur l’écran d’accueil</em>. Le message WhatsApp contient déjà ces explications.
    </div>`;
}
function renderGeofence(){
  const m = DB.meta;
  const configuree = m.geofenceLatitude != null && m.geofenceLongitude != null;
  return `
    <form onsubmit="return handleSaveGeofence(event)">
      <div class="form-grid">
        <div class="field"><label>Latitude</label><input type="number" step="any" name="latitude" id="geofenceLat" required value="${configuree?m.geofenceLatitude:''}"></div>
        <div class="field"><label>Longitude</label><input type="number" step="any" name="longitude" id="geofenceLon" required value="${configuree?m.geofenceLongitude:''}"></div>
        <div class="field"><label>Rayon toléré (mètres)</label><input type="number" min="10" step="10" name="rayon" value="${m.geofenceRayonMetres||100}"></div>
      </div>
      <div class="hint" style="margin:8px 0;">Le plus simple : ouvrez cette page depuis un téléphone, en vous tenant physiquement dans la cour de l'école, puis cliquez sur le bouton ci-dessous.</div>
      <button type="button" class="btn secondary sm" onclick="utiliserPositionActuelle()">📍 Utiliser ma position actuelle</button>
      <div class="form-actions"><button class="btn" type="submit">Enregistrer la zone</button></div>
    </form>
  `;
}
function utiliserPositionActuelle(){
  if(!navigator.geolocation){ alert("Votre navigateur ne permet pas la géolocalisation."); return; }
  navigator.geolocation.getCurrentPosition(
    (pos)=>{
      $('#geofenceLat').value = pos.coords.latitude;
      $('#geofenceLon').value = pos.coords.longitude;
      toast('Position actuelle récupérée — vérifiez puis enregistrez');
    },
    (err)=> alert("Impossible d'obtenir votre position : " + err.message),
    { enableHighAccuracy: true, timeout: 15000 }
  );
}
async function handleSaveGeofence(ev){
  ev.preventDefault();
  const fd = new FormData(ev.target);
  const patch = {
    geofence_latitude: parseFloat(fd.get('latitude')),
    geofence_longitude: parseFloat(fd.get('longitude')),
    geofence_rayon_metres: Math.max(10, parseInt(fd.get('rayon'))||100),
  };
  try{
    const { error } = await exigerEffet(sb.from('ecoles').update(patch).eq('id', session.ecoleId));
    if(error) throw error;
    DB.meta.geofenceLatitude = patch.geofence_latitude;
    DB.meta.geofenceLongitude = patch.geofence_longitude;
    DB.meta.geofenceRayonMetres = patch.geofence_rayon_metres;
    toast('Zone enregistrée');
    renderView('parametres');
  }catch(e){ alert('Erreur : ' + e.message); }
  return false;
}

function voirMessage(id){
  const m = DB.messages.find(x=>x.id===id);
  if(!m) return;
  openModal('Message envoyé', `
    <div class="hint">${fmtDate(m.date)} à ${m.heure} · Canal : ${m.canal}</div>
    <div class="hint" style="margin-bottom:10px;">À : <strong>${escapeHtml(m.destinataireNom)}</strong> (${m.destinataireRole})${m.destinataireTel?' · '+escapeHtml(m.destinataireTel):''}</div>
    <div class="txn-item" style="border:1px solid var(--border);border-radius:var(--r-card);padding:14px;background:var(--surface-2);">
      <div class="txn-body"><div style="font-size:var(--fs-sm);line-height:1.5;">${escapeHtml(m.contenu)}</div></div>
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
            return `<label style="display:flex;align-items:center;gap:10px;padding:12px;border:1px solid var(--border);border-radius:var(--r-card);background:${actif?'var(--primary-dim)':'var(--surface-2)'};cursor:pointer;">
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
        ${DB.classes.map(c=>`<span class="badge blue" style="font-size:var(--fs-xs);padding:6px 12px;">${c.nom} <span style="opacity:.6;">· ${c.cycle}</span></span>`).join('') || `<span class="hint">Aucune classe active pour le moment.</span>`}
      </div>
    </div>

    <div class="panel">
      <div class="panel-head"><div><h2>🎓 Scolarité et tranches de paiement</h2><div class="sub">Montants par classe, tranches (inscription, versements) et dates limites — utilisés pour les paiements, les reçus, les impayés et l’application des parents</div></div></div>
      ${renderEcheancesScolarite()}
    </div>

    <div class="panel">
      <div class="panel-head"><div><h2>Régime de facturation — reçus de scolarité</h2><div class="sub">Reçus simples, ou Facture Normalisée Électronique (FNE) — obligation DGI Côte d'Ivoire pour les reçus de scolarité</div></div></div>
      ${renderRegimeFacturation()}
    </div>

    <div class="panel">
      <div class="panel-head"><div><h2>TVA</h2><div class="sub">Aide de calcul si l'école est assujettie — à valider avec un comptable</div></div></div>
      ${renderPanneauTva()}
    </div>

    <div class="panel">
      <div class="panel-head"><div><h2>Paiement en ligne (Mobile Money)</h2><div class="sub">Permet à un parent de payer directement via un lien, sans passer par le personnel</div></div></div>
      <div class="hint">${(DB.paiementEnLigne||{}).actif ? `✅ Activé (${(DB.paiementEnLigne||{}).prestataire==='cinetpay'?'CinetPay':'PayDunya'})` : '⏳ Pas encore activé'} — la configuration technique (identifiants, prestataire) se fait désormais uniquement depuis la Console Développeur, pour éviter toute erreur de manipulation.</div>
    </div>

    <div class="panel">
      <div class="panel-head"><div><h2>Accès &amp; Interfaces</h2><div class="sub">Chaque profil se connecte avec son propre email et mot de passe, et ne voit que ce qui le concerne</div></div></div>
      <div class="grid-2" style="margin-bottom:14px;">
        <div class="hint">👩‍🏫 <strong>Enseignant(e)</strong> — Notes, présences élèves, emploi du temps, programmes. Pas d'accès aux élèves, à la comptabilité ni aux paramètres. Un compte enseignant peut être relié à une fiche précise (page Enseignants) pour ne voir que ses propres classes.</div>
        <div class="hint">🗂️ <strong>Secrétariat</strong> — Tout ce que voit l'enseignant + élèves, enseignants, comptabilité (chiffres globaux masqués). Pas d'accès aux paramètres.</div>
        <div class="hint">🎩 <strong>Direction</strong> — Accès complet, y compris les chiffres financiers et les paramètres.</div>
        <div class="hint">🏛️ <strong>Fondation</strong> — Accès complet, identique à la Direction.</div>
        <div class="hint">👪 <strong>Parent</strong> — Créé depuis la fiche d'un élève (page Élèves), pas depuis Supabase. Voit uniquement son/ses enfant(s), leurs notifications et annonces.</div>
        <div class="hint">🚪 <strong>Portier</strong> — Recherche un élève et signale l'arrivée de son parent à l'enseignant(e) titulaire. Ne voit aucune autre donnée (pas de coordonnées, pas de notes...).</div>
      </div>
      <div class="section-note">🔐 La création et la suppression des comptes Enseignant/Secrétariat/Direction/Fondation/Portier se font depuis le tableau de bord Supabase (Authentication → Users), puis en associant le compte à un rôle. C'est une opération d'administration technique, volontairement séparée de l'application pour éviter toute création de compte non maîtrisée. Seul le compte Parent se crée directement dans l'application (fiche élève).</div>
    </div>

    <div class="panel">
      <div class="panel-head"><div><h2>⏰ Annonces horaires automatiques</h2><div class="sub">Les parents sont prévenus automatiquement avant le début des cours, les pauses et la fin des cours — jours de classe uniquement</div></div></div>
      ${renderHorairesAnnonces()}
    </div>
    ${renderCoefficients()}
    ${['direction','fondation'].includes(ui.role) ? `<div class="panel">
      <div class="panel-head"><div><h2>📝 Notes au fil de l’eau pour les parents</h2><div class="sub">Si activé : chaque parent voit, dans son application, les notes des Camps de base de SON enfant dès qu’elles sont saisies (devoirs, exercices), avec la moyenne en cours, et reçoit une notification. Les compositions restent visibles seulement à la publication du bulletin.</div></div></div>
      <label style="display:flex;align-items:center;gap:10px;"><input type="checkbox" ${DB.meta?.notesContinuesParents ? 'checked' : ''} onchange="reglerOptionEcole('notes_continues_parents', 'notesContinuesParents', this.checked, 'Notes au fil de l’eau')">
        <strong>Montrer les notes des Camps de base aux parents</strong></label>
    </div>` : ''}

    <div class="panel">
      <div class="panel-head"><div><h2>🎂 Anniversaires des élèves</h2><div class="sub">Le tableau de bord affiche les anniversaires de la semaine ; les parents voient un bandeau de fête le jour J.</div></div></div>
      <label style="display:flex;align-items:center;gap:10px;"><input type="checkbox" ${DB.meta?.voeuxAnniversaire !== false ? 'checked' : ''} onchange="reglerVoeuxAnniversaire(this.checked)">
        <strong>Envoyer automatiquement les vœux de l’école aux parents à 8h</strong> (notification + message)</label>
    </div>

    <div class="panel">
      <div class="panel-head"><div><h2>📊 Résumé de la semaine aux parents</h2><div class="sub">Chaque vendredi à 17h30, chaque parent reçoit sur son téléphone le bilan de ses enfants : présences de la semaine (si l’appel est fait), devoirs de la semaine suivante, prochaines dates de l’agenda.</div></div></div>
      <label style="display:flex;align-items:center;gap:10px;"><input type="checkbox" ${DB.meta?.resumeHebdo !== false ? 'checked' : ''} onchange="reglerOptionEcole('resume_hebdo', 'resumeHebdo', this.checked, 'Résumé de la semaine')">
        <strong>Envoyer le résumé de la semaine chaque vendredi</strong></label>
    </div>

    <div class="panel">
      <div class="panel-head"><div><h2>📍 Zone de l'établissement</h2><div class="sub">Utilisée pour valider les pointages GPS des enseignants (à quelle distance de l'école ils se trouvent)</div></div></div>
      ${renderGeofence()}
    </div>

    ${['direction','fondation'].includes(ui.role) ? `<div class="panel">
      <div class="panel-head"><div><h2>Sauvegarde de vos données</h2><div class="sub">Un fichier Excel avec toutes les données de l’école, une feuille par sujet. À garder sur votre ordinateur ou une clé USB.</div></div></div>
      <div class="sauvegarde-ligne"><span class="etat-vide-ic" aria-hidden="true">${icone('download')}</span>
        <span>Élèves, classes, enseignants, paiements, présences, notes, dépenses, agenda… Les mots de passe ne sont jamais inclus.</span>
        <button type="button" class="btn" onclick="exporterSauvegardeComplete()">Télécharger la sauvegarde</button></div>
    </div>` : ''}

    <div class="panel" id="panneauDemandesAcces">
      <div class="panel-head"><div><h2>Demandes d’accès</h2><div class="sub">Parents, enseignants et portier qui se sont inscrits avec Google et attendent votre validation</div></div></div>
      <div id="demandesAccesBox"><div class="hint">Chargement…</div></div>
      ${(setTimeout(chargerDemandesAcces,0),'')}
    </div>

    <div class="panel">
      <div class="panel-head"><div><h2>📲 Applications Parents, Enseignants &amp; Portier</h2><div class="sub">Trois applications séparées, installables sur le téléphone : « EcoMaZ-PARENTS D'ELEVES ${escapeHtml(DB.meta.nomEcole)} », « EcoMaZ-ENSEIGNANTS ${escapeHtml(DB.meta.nomEcole)} » et « EcoMaZ-PORTIER ${escapeHtml(DB.meta.nomEcole)} »</div></div></div>
      ${renderLiensApplications()}
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
      <label style="display:flex;align-items:center;gap:12px;padding:14px;border:1px solid var(--border);border-radius:var(--r-card);background:${m.accesSupportDeveloppeur?'var(--primary-dim)':'var(--surface-2)'};cursor:pointer;max-width:520px;">
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
    const { error } = await exigerEffet(sb.from('ecoles').update(objToSnake(patch)).eq('id', session.ecoleId));
    if(error) throw error;
    Object.assign(DB.meta, patch);
    toast('Informations enregistrées');
    applyBranding();
  }catch(e){ alert('Erreur : ' + e.message); }
  return false;
}

async function handleToggleAccesSupportDev(actif){
  try{
    const { error } = await exigerEffet(sb.from('ecoles').update({ acces_support_developpeur: actif }).eq('id', session.ecoleId));
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
    const codesExistants = new Set((DB.classesTout || DB.classes).map(codeClasse));
    const nouvellesClasses = toAdd.flatMap(key => NIVEAUX_DEF[key].classes).filter(c => !codesExistants.has(c.id));
    if(nouvellesClasses.length){
      // Identifiant propre à l'école (unique dans toute la base) + code du niveau
      const prefixe = String(session.ecoleId).replace(/-/g, '').slice(0, 8);
      const rows = nouvellesClasses.map(c => objToSnake({
        id: `${prefixe}-${c.id}`, code: c.id, ecoleId: session.ecoleId, nom: c.nom, cycle: c.cycle,
        fraisScolarite: FRAIS_SCOLARITE_DEFAUT[c.id] || 0,
      }));
      const { error } = await sb.from('classes').insert(rows);
      if(error) throw error;
    }
    const niveaux = coches;
    const { error: err2 } = await exigerEffet(sb.from('ecoles').update({ niveaux }).eq('id', session.ecoleId));
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
const PRESTATAIRES_FNE = ['fne.ci', 'ESARTH', 'Faclibr', 'Tidy', 'myOctogone', 'Autre'];
function renderRegimeFacturation(){
  const c = DB.fneConfig || {regime:'recus', prestataire:'', cleConfiguree:false};
  return `
    <div class="section-note" style="background:var(--amber-bg);color:var(--amber);">⚠️ La certification réelle auprès du prestataire n'est pas encore branchée techniquement — activer le régime FNE ici prépare la configuration, mais les reçus resteront marqués "non certifié" tant que l'intégration au prestataire choisi n'est pas terminée.</div>
    <form onsubmit="return handleSaveRegimeFacturation(event)">
      <div class="form-grid">
        <div class="field span2">
          <label>Régime</label>
          <select name="regime" id="selectRegimeFacturation" onchange="document.getElementById('blocPrestataireFne').style.display = this.value==='fne' ? '' : 'none';">
            <option value="recus" ${c.regime==='recus'?'selected':''}>Reçus simples (actuel)</option>
            <option value="fne" ${c.regime==='fne'?'selected':''}>FNE (Facture Normalisée Électronique)</option>
          </select>
        </div>
        <div id="blocPrestataireFne" style="display:${c.regime==='fne'?'':'none'};" class="field span2">
          <div class="form-grid">
            <div class="field"><label>Prestataire de certification</label>
              <select name="prestataire">${PRESTATAIRES_FNE.map(p=>`<option ${c.prestataire===p?'selected':''}>${p}</option>`).join('')}</select>
            </div>
            <div class="field"><label>Clé API ${c.cleConfiguree ? '(✅ déjà enregistrée)' : ''}</label>
              <input type="text" name="apiKey" placeholder="${c.cleConfiguree ? 'Laisser vide pour ne pas changer' : 'Coller la clé API du prestataire'}" autocomplete="off" spellcheck="false">
            </div>
          </div>
          <div class="hint">La clé API n'est jamais réaffichée une fois enregistrée, ni visible par le Secrétariat ou les enseignants — seule Direction/Fondation peut la modifier.</div>
        </div>
      </div>
      <div class="form-actions"><button type="submit" class="btn">Enregistrer</button></div>
    </form>`;
}
async function handleSaveRegimeFacturation(ev){
  ev.preventDefault();
  const fd = new FormData(ev.target);
  const regime = fd.get('regime');
  const prestataire = regime==='fne' ? fd.get('prestataire') : '';
  const apiKey = (fd.get('apiKey')||'').trim();
  try{
    const patch = {ecole_id: session.ecoleId, regime, prestataire};
    if(apiKey) patch.api_key = apiKey;
    const { error } = await sb.from('fne_config').upsert(patch, {onConflict:'ecole_id'});
    if(error) throw error;
    DB.fneConfig = {regime, prestataire, cleConfiguree: DB.fneConfig?.cleConfiguree || !!apiKey};
    toast('Régime de facturation enregistré');
    renderView('parametres');
  }catch(e){ alert('Erreur : ' + e.message); }
  return false;
}

/* ---------------------------------------------------------------------
   TVA (ROADMAP COMPTABILITÉ — ÉTAPE 9, DERNIÈRE)
   Voir schema.sql section 28 : par défaut assujetti_tva = false, donc
   rien ne change tant que Direction/Fondation ne l'active pas. Aide de
   calcul uniquement — l'école doit valider son assujettissement réel et
   quelles catégories sont concernées avec son comptable.
   --------------------------------------------------------------------- */
function categorieRecetteDeObjet(objet){
  if(!objet) return null;
  if(objet.startsWith('Scolarité')) return 'Scolarité';
  if(objet.startsWith('Cotisation')) return 'Activités extra-scolaires';
  if(objet.startsWith('Vente')) return 'Boutique scolaire';
  return null;
}
function tvaApplicablePour(categorie){
  const c = (DB.tvaCategories||[]).find(x=>x.categorie===categorie);
  return c ? c.tvaApplicable===true : false;
}
function renderPanneauTva(){
  const m = DB.meta;
  return `
    <div class="section-note" style="background:var(--amber-bg);color:var(--amber);">⚠️ L'enseignement est en principe exonéré de TVA en Côte d'Ivoire, mais l'assujettissement dépend du régime fiscal de l'école, et certaines recettes (boutique scolaire notamment) peuvent rester taxables même si la scolarité est exonérée. Ceci est une aide de calcul, pas une validation fiscale — à confirmer avec ton comptable avant toute déclaration.</div>
    <form onsubmit="return handleSaveTva(event)">
      <div class="form-grid">
        <div class="field"><label>École assujettie à la TVA ?</label>
          <select name="assujetti">
            <option value="non" ${!m.assujettiTva?'selected':''}>Non</option>
            <option value="oui" ${m.assujettiTva?'selected':''}>Oui</option>
          </select>
        </div>
        <div class="field"><label>Taux de TVA (%)</label><input type="number" name="taux" min="0" max="100" step="0.5" value="${m.tauxTva}"></div>
      </div>
      <div class="form-actions"><button type="submit" class="btn">Enregistrer</button></div>
    </form>
    ${m.assujettiTva ? `
    <div class="hint" style="margin-top:14px;">Catégories de recettes concernées par la TVA (cochées = TVA appliquée sur les reçus et dans les exports) :</div>
    <div class="table-wrap" style="margin-top:10px;"><table><thead><tr><th>Catégorie</th><th>TVA applicable</th></tr></thead><tbody>
      ${CATEGORIES_RECETTES_BUDGET.map(c=>`<tr><td>${c}</td><td><input type="checkbox" ${tvaApplicablePour(c)?'checked':''} onchange="handleSaveTvaCategorie('${c}', this.checked)"></td></tr>`).join('')}
    </tbody></table></div>` : ''}`;
}
async function handleSaveTva(ev){
  ev.preventDefault();
  const fd = new FormData(ev.target);
  const assujettiTva = fd.get('assujetti')==='oui';
  const tauxTva = Math.max(0, parseFloat(fd.get('taux'))||0);
  try{
    const { error } = await exigerEffet(sb.from('ecoles').update({assujetti_tva: assujettiTva, taux_tva: tauxTva}).eq('id', session.ecoleId));
    if(error) throw error;
    DB.meta.assujettiTva = assujettiTva;
    DB.meta.tauxTva = tauxTva;
    toast('TVA enregistrée');
    renderView('parametres');
  }catch(e){ alert('Erreur : ' + e.message); }
  return false;
}
async function handleSaveTvaCategorie(categorie, checked){
  // "existant" (trouvé via la vue tva_categories_lecture) veut dire
  // qu'une ligne comptes_syscohada existe déjà pour cette catégorie —
  // on ne touche alors QUE tva_applicable, jamais code/libellé (qui ont
  // pu être personnalisés dans l'onglet Plan SYSCOHADA, étape 7).
  const existant = (DB.tvaCategories||[]).find(x=>x.categorie===categorie);
  try{
    if(existant){
      const { error } = await sb.from('comptes_syscohada')
        .update({tva_applicable: checked})
        .eq('ecole_id', session.ecoleId).eq('type','recette').eq('categorie', categorie);
      if(error) throw error;
      existant.tvaApplicable = checked;
    } else {
      const defaut = CODES_SYSCOHADA_DEFAUT[`recette|${categorie}`] || {code:'', libelle:''};
      const { error } = await sb.from('comptes_syscohada')
        .insert({ecole_id: session.ecoleId, type:'recette', categorie, tva_applicable: checked, code: defaut.code, libelle: defaut.libelle});
      if(error) throw error;
      DB.tvaCategories = [...(DB.tvaCategories||[]), {categorie, tvaApplicable: checked}];
    }
    toast('TVA mise à jour pour ' + categorie);
  }catch(e){ alert('Erreur : ' + e.message); }
}

/* ---------------------------------------------------------------------
   PAIEMENT EN LIGNE MOBILE MONEY — la configuration (prestataire,
   identifiants API) se fait désormais exclusivement depuis la Console
   Développeur (décision du 2026-09-24, jugée trop technique pour
   Direction/Fondation) — voir EcoMaZ-dev-console/app-dev.js et la
   fonction serveur configurer-paiement-en-ligne. Ici, l'appli cliente ne
   fait que LIRE le statut (DB.paiementEnLigne, chargé via
   paiement_en_ligne_config_lecture) pour savoir si un lien peut être
   généré — voir genererLienPaiement plus bas.
   --------------------------------------------------------------------- */
async function genererLienPaiement(eleveId, trancheLabel, montant){
  const c = DB.paiementEnLigne || {actif:false, prestataire:''};
  if(!c.actif || !c.prestataire){
    toast('Paiement en ligne non activé — configure-le dans Paramètres');
    return;
  }
  const tranche = trancheLabel || 'Solde restant';
  toast('Génération du lien de paiement…');
  try{
    const { data, error } = await sb.functions.invoke('initier-paiement-en-ligne', { body: { eleveId, tranche, montant } });
    if(error) throw new Error(await messageErreurFonction(error));
    if(!data?.ok) throw new Error(data?.error || 'Échec de la génération du lien');
    const eleve = eleveById(eleveId);
    openModal('Lien de paiement généré', `
      <div class="section-note">${data.mode==='test' ? '🧪 Mode TEST — clique dessus pour simuler, aucun vrai argent ne bouge.' : '✅ Mode production — un vrai paiement peut être effectué avec ce lien.'}</div>
      <div class="field"><label>Lien à envoyer à ${escapeHtml(eleveFullName(eleve))} / son parent</label>
        <input type="text" id="lienPaiementGenere" readonly value="${escapeHtml(data.url)}" onclick="this.select()" style="width:100%;">
      </div>
      <div class="hint">Copie ce lien et envoie-le au parent par WhatsApp, SMS ou autre — il paiera directement sur la page sécurisée PayDunya (Orange Money, MTN, Moov, Wave, carte).</div>
      <div class="form-actions">
        <button type="button" class="btn secondary" onclick="closeModal()">Fermer</button>
        <button type="button" class="btn" onclick="copierLienPaiement('${data.url}')">📋 Copier le lien</button>
      </div>`);
  }catch(e){ alert('Erreur : ' + e.message); }
}
async function copierLienPaiement(url){
  try{ await navigator.clipboard.writeText(url); toast('Lien copié'); }
  catch(_e){
    const input = document.getElementById('lienPaiementGenere');
    if(input){ input.select(); document.execCommand('copy'); toast('Lien copié'); }
  }
}
// Paramètres → Scolarité : chaque école règle ses montants par classe et ses
// tranches de paiement (grille propre à une classe, ou grille commune).
function grilleSource(classeId){
  const toutes = DB.echeancesScolarite || [];
  if(toutes.some(e => e.classeId === classeId)) return 'propre';
  if(toutes.some(e => !e.classeId)) return 'commune';
  return 'simple';
}
function renderEcheancesScolarite(){
  const portee = ui.filters.grillePortee || '';            // '' = grille commune, sinon id de classe
  const liste = (DB.echeancesScolarite||[]).filter(e => (e.classeId || '') === portee)
    .sort((a,b)=>(a.ordre-b.ordre)||(a.dateEcheance||'').localeCompare(b.dateEcheance||''));
  const total = liste.reduce((t, e) => t + Number(e.montant || 0), 0);
  const nomPortee = portee ? classeName(portee) : 'Grille commune (toutes les classes sans grille propre)';
  const visible = DB.meta?.scolariteVisibleParents === true;
  const recap = DB.classes.map(c => {
    const src = grilleSource(c.id), du = duAnnuelClasse(c.id), fraisFiche = (DB.fraisScolarite||{})[c.id] || 0;
    const ecart = src !== 'simple' && fraisFiche && fraisFiche !== du;
    return `<tr>
      <td>${escapeHtml(c.nom)}</td>
      <td><strong>${fmtFCFA(du)}</strong>${ecart ? `<div class="hint" style="margin:0;color:var(--warning);">⚠️ différent des frais notés pour la classe (${fmtFCFA(fraisFiche)})</div>` : ''}</td>
      <td>${src === 'propre' ? '<span class="badge green">grille de la classe</span>' : src === 'commune' ? '<span class="badge blue">grille commune</span>' : '<span class="badge gray">montant annuel seul</span>'}</td>
      <td><button class="btn secondary sm" onclick="ui.filters.grillePortee='${c.id}'; renderView('parametres')">${src === 'propre' ? 'Modifier' : 'Créer sa grille'}</button></td>
    </tr>`;
  }).join('');
  return `
    <div class="form-actions" style="justify-content:flex-start;margin-top:0;"><button class="btn" onclick="ouvrirAssistantScolarite()">⚡ Assistant : inscription + scolarité par classe</button></div>
    <div class="section-note">💡 Créez les tranches de paiement de <strong>chaque classe</strong> (frais d’inscription, 1er versement…). Une classe sans grille propre utilise la <strong>grille commune</strong>. Le total des tranches devient le montant annuel de la classe.</div>
    <div class="table-wrap" style="margin-bottom:16px;"><table>
      <thead><tr><th>Classe</th><th>Scolarité annuelle</th><th>Tranches utilisées</th><th></th></tr></thead>
      <tbody>${recap}</tbody>
    </table></div>

    <div class="field"><label>Tranches de :</label>
      <select onchange="ui.filters.grillePortee=this.value; renderView('parametres')">
        <option value="" ${!portee?'selected':''}>Grille commune</option>
        ${DB.classes.map(c => `<option value="${c.id}" ${portee===c.id?'selected':''}>${escapeHtml(c.nom)}${grilleSource(c.id)==='propre' ? ' ✓' : ''}</option>`).join('')}
      </select></div>
    <h4 style="margin:6px 0;">${escapeHtml(nomPortee)} — total ${fmtFCFA(total)}</h4>
    ${liste.length===0 ? `<div class="hint" style="margin-bottom:14px;">${portee ? 'Cette classe n’a pas encore de grille propre : elle utilise la grille commune (ou son montant annuel).' : 'Aucune tranche dans la grille commune.'}</div>` : `
    <div class="table-wrap" style="margin-bottom:14px;"><table>
      <thead><tr><th>Tranche</th><th>Montant</th><th>Date limite</th><th>Actions</th></tr></thead>
      <tbody>${liste.map(e=>`<tr>
        <td>${escapeHtml(e.label)}</td><td>${fmtFCFA(e.montant)}</td><td>${e.dateEcheance ? fmtDate(e.dateEcheance) : '—'}</td>
        <td style="white-space:nowrap;"><button class="icon-btn" title="Modifier" onclick="openEcheanceForm('${e.id}')">✏️</button>
          <button class="icon-btn danger" title="Supprimer" onclick="deleteEcheance('${e.id}')">🗑️</button></td></tr>`).join('')}</tbody>
    </table></div>`}
    <div style="display:flex;flex-wrap:wrap;gap:8px;">
      <button class="btn secondary" onclick="openEcheanceForm()">+ Ajouter une tranche</button>
      ${liste.length ? `<button class="btn secondary" onclick="ouvrirCopieGrille()">Copier ces tranches vers d’autres classes</button>` : ''}
      ${portee && liste.length ? `<button class="btn secondary" onclick="supprimerGrilleClasse('${portee}')">Revenir à la grille commune</button>` : ''}
    </div>

    <div style="margin-top:18px;padding-top:14px;border-top:1px solid var(--border);">
      <label style="display:flex;align-items:center;gap:10px;"><input type="checkbox" ${visible?'checked':''} onchange="basculerScolariteParents(this.checked)">
        <strong>Montrer la scolarité aux parents</strong> (tranches, payé, reste à payer, dans leur application)</label>
      <div class="hint" style="margin:4px 0 0;">Activez seulement quand les montants ci-dessus sont justes et que les paiements sont enregistrés dans EcoMaZ.</div>
      <label style="display:flex;align-items:center;gap:10px;margin-top:12px;"><input type="checkbox" ${DB.meta?.relancesScolarite?'checked':''} ${visible?'':'disabled'} onchange="reglerRelances(this.checked)">
        <strong>Relances automatiques des tranches impayées</strong> à <input type="time" value="${DB.meta?.heureRelances || '10:00'}" ${visible?'':'disabled'} onchange="reglerRelances(null, this.value)" style="width:110px;display:inline-block;"></label>
      <div class="hint" style="margin:4px 0 0;">Message poli au parent 3 jours avant la date limite d’une tranche, le jour même, puis 7 jours après si elle n’est pas réglée (notification + messagerie). Seulement pour les tranches qui ont une date limite${visible ? '' : ' — activez d’abord « Montrer la scolarité aux parents »'}.</div>
    </div>
  `;
}
// Assistant : pour une ou plusieurs classes, frais d'inscription + scolarité
// annuelle répartie en N versements (montants égaux, arrondis à 500 F, le
// reste sur le dernier) → la grille de chaque classe est créée d'un coup.
function lignesDatesAssistant(n){
  return Array.from({ length: n }, (_, i) => `<div class="field"><label>${i + 1}${i ? 'e' : 'er'} versement — date limite</label><input type="date" name="date${i}"></div>`).join('');
}
function ouvrirAssistantScolarite(){
  const lignesDates = lignesDatesAssistant;
  openModal('⚡ Inscription et scolarité par classe', `
    <form onsubmit="return appliquerAssistantScolarite(event)">
      <div class="field"><label>Classe(s) concernée(s) — même montant</label>
        <div style="display:flex;flex-wrap:wrap;gap:10px;">${DB.classes.map(c => `<label style="display:flex;align-items:center;gap:6px;"><input type="checkbox" name="classe" value="${c.id}"> ${escapeHtml(c.nom)}</label>`).join('')}</div></div>
      <div class="form-grid">
        <div class="field"><label>Frais d’inscription (${DEVISE})</label><input type="number" name="inscription" min="0" step="500" value="0"></div>
        <div class="field"><label>Date limite de l’inscription</label><input type="date" name="dateInscription"></div>
        <div class="field"><label>Scolarité annuelle, hors inscription (${DEVISE})</label><input type="number" name="scolarite" min="0" step="500" required></div>
        <div class="field"><label>Nombre de versements</label><select name="nb" onchange="document.getElementById('assistantDates').innerHTML = lignesDatesAssistant(Number(this.value))">${[1,2,3,4,5,6].map(n => `<option ${n===3?'selected':''}>${n}</option>`).join('')}</select></div>
      </div>
      <div class="form-grid" id="assistantDates">${lignesDates(3)}</div>
      <div class="hint">La grille actuelle des classes cochées sera remplacée. Vous pourrez ensuite modifier chaque tranche.</div>
      <div class="form-actions"><button type="button" class="btn secondary" onclick="closeModal()">Annuler</button><button class="btn" type="submit">Créer les grilles</button></div>
    </form>`);
}
async function appliquerAssistantScolarite(ev){
  ev.preventDefault();
  const fd = new FormData(ev.target);
  const classes = fd.getAll('classe');
  if(!classes.length) return alert('Cochez au moins une classe.'), false;
  const inscription = Math.max(0, parseInt(fd.get('inscription')) || 0), total = Math.max(0, parseInt(fd.get('scolarite')) || 0), nb = Number(fd.get('nb')) || 1;
  const part = Math.floor(total / nb / 500) * 500;
  const modele = [];
  if(inscription) modele.push({ label: 'Frais d’inscription', montant: inscription, date_echeance: fd.get('dateInscription') || null });
  for(let i = 0; i < nb; i++) modele.push({ label: nb === 1 ? 'Scolarité' : `${i + 1}${i ? 'e' : 'er'} versement`, montant: i === nb - 1 ? total - part * (nb - 1) : part, date_echeance: fd.get('date' + i) || null });
  if(!confirm(`Créer pour ${classes.length} classe(s) : ${modele.map(m => `${m.label} ${fmtFCFA(m.montant)}`).join(' + ')} = ${fmtFCFA(inscription + total)} ?`)) return false;
  try{
    for(const cid of classes){
      const { error: errDel } = await sb.from('echeances_scolarite').delete().eq('ecole_id', session.ecoleId).eq('classe_id', cid);
      if(errDel) throw errDel;
      const { data, error } = await sb.from('echeances_scolarite').insert(modele.map((m, i) => ({ ...m, ordre: i, classe_id: cid, ecole_id: session.ecoleId }))).select();
      if(error) throw error;
      DB.echeancesScolarite = (DB.echeancesScolarite || []).filter(e => e.classeId !== cid).concat(rowsToCamel(data));
      await synchroniserFraisClasse(cid);
    }
    closeModal(); toast(`Grilles créées pour ${classes.length} classe(s)`); renderView('parametres');
  }catch(e){ alert('Erreur : ' + e.message); }
  return false;
}
function openEcheanceForm(id){
  const e = id ? (DB.echeancesScolarite||[]).find(x=>x.id===id) : null;
  const portee = e ? (e.classeId || '') : (ui.filters.grillePortee || '');
  openModal(e ? 'Modifier la tranche' : 'Nouvelle tranche', `
    <form onsubmit="return handleSaveEcheance(event,'${id||''}')">
      <div class="hint" style="margin-top:0;">Pour : <strong>${escapeHtml(portee ? classeName(portee) : 'grille commune')}</strong></div>
      <input type="hidden" name="classeId" value="${portee}">
      <div class="form-grid">
        <div class="field span2"><label>Libellé</label><input name="label" required placeholder="Ex : Frais d’inscription, 1er versement" value="${e?escapeHtml(e.label):''}"></div>
        <div class="field"><label>Montant (${DEVISE})</label><input type="number" name="montant" min="0" step="500" required value="${e?e.montant:50000}"></div>
        <div class="field"><label>Date limite (facultatif)</label><input type="date" name="dateEcheance" value="${e&&e.dateEcheance?e.dateEcheance:''}"></div>
      </div>
      <div class="form-actions"><button type="button" class="btn secondary" onclick="closeModal()">Annuler</button><button type="submit" class="btn">Enregistrer</button></div>
    </form>`);
}
// Le total des tranches d'une classe devient son montant annuel (cohérence des écrans)
async function synchroniserFraisClasse(classeId){
  if(!classeId) return;
  const total = (DB.echeancesScolarite||[]).filter(e => e.classeId === classeId).reduce((t, e) => t + Number(e.montant||0), 0);
  if(!total) return;
  try{ await sb.from('classes').update({ frais_scolarite: total }).eq('id', classeId).eq('ecole_id', session.ecoleId); DB.fraisScolarite[classeId] = total; }catch(_e){}
}
async function handleSaveEcheance(ev, id){
  ev.preventDefault();
  const fd = new FormData(ev.target);
  const classeId = fd.get('classeId') || null;
  const patch = {
    label: fd.get('label').trim(),
    montant: Math.max(0, parseInt(fd.get('montant'))||0),
    dateEcheance: fd.get('dateEcheance') || null,
    classeId,
  };
  try{
    if(id){
      await dbUpdate('echeances_scolarite', id, patch);
      const idx = DB.echeancesScolarite.findIndex(e=>e.id===id);
      DB.echeancesScolarite[idx] = {...DB.echeancesScolarite[idx], ...patch};
    } else {
      patch.ordre = (DB.echeancesScolarite||[]).filter(e => (e.classeId||null) === classeId).length;
      DB.echeancesScolarite = DB.echeancesScolarite || [];
      DB.echeancesScolarite.push(await dbInsert('echeances_scolarite', patch));
    }
    await synchroniserFraisClasse(classeId);
    closeModal(); toast('Tranche enregistrée');
    renderView('parametres');
  }catch(e){ alert('Erreur : ' + e.message); }
  return false;
}
async function deleteEcheance(id){
  if(!confirm('Supprimer cette tranche ?')) return;
  try{
    const ech = DB.echeancesScolarite.find(e => e.id === id);
    await dbDelete('echeances_scolarite', id);
    DB.echeancesScolarite = DB.echeancesScolarite.filter(e=>e.id!==id);
    await synchroniserFraisClasse(ech?.classeId);
    toast('Tranche supprimée');
    renderView('parametres');
  }catch(e){ alert('Erreur : ' + e.message); }
}
function ouvrirCopieGrille(){
  const portee = ui.filters.grillePortee || '';
  openModal('Copier les tranches', `
    <p class="hint" style="margin-top:0;">Les tranches de <strong>${escapeHtml(portee ? classeName(portee) : 'la grille commune')}</strong> remplaceront celles des classes cochées (vous pourrez ensuite ajuster les montants).</p>
    <div style="display:flex;flex-wrap:wrap;gap:10px;">${DB.classes.filter(c => c.id !== portee).map(c => `<label style="display:flex;align-items:center;gap:6px;"><input type="checkbox" class="copieClasse" value="${c.id}"> ${escapeHtml(c.nom)}</label>`).join('')}</div>
    <div class="form-actions"><button type="button" class="btn secondary" onclick="closeModal()">Annuler</button><button type="button" class="btn" onclick="copierGrille()">Copier</button></div>`);
}
async function copierGrille(){
  const portee = ui.filters.grillePortee || '';
  const cibles = $$('.copieClasse').filter(c => c.checked).map(c => c.value);
  if(!cibles.length) return alert('Cochez au moins une classe.');
  const modele = (DB.echeancesScolarite||[]).filter(e => (e.classeId || '') === portee);
  try{
    for(const cid of cibles){
      const { error: errDel } = await sb.from('echeances_scolarite').delete().eq('ecole_id', session.ecoleId).eq('classe_id', cid);
      if(errDel) throw errDel;
      const lignes = modele.map((e, i) => ({ label: e.label, montant: e.montant, date_echeance: e.dateEcheance || null, ordre: i, classe_id: cid, ecole_id: session.ecoleId }));
      const { data, error } = await sb.from('echeances_scolarite').insert(lignes).select();
      if(error) throw error;
      DB.echeancesScolarite = DB.echeancesScolarite.filter(e => e.classeId !== cid).concat(rowsToCamel(data));
      await synchroniserFraisClasse(cid);
    }
    closeModal(); toast(`Tranches copiées vers ${cibles.length} classe(s)`); renderView('parametres');
  }catch(e){ alert('Erreur : ' + e.message); }
}
async function supprimerGrilleClasse(classeId){
  if(!confirm(`Supprimer la grille propre de ${classeName(classeId)} ? La classe utilisera la grille commune.`)) return;
  try{
    const { error } = await sb.from('echeances_scolarite').delete().eq('ecole_id', session.ecoleId).eq('classe_id', classeId);
    if(error) throw error;
    DB.echeancesScolarite = DB.echeancesScolarite.filter(e => e.classeId !== classeId);
    toast('Grille de la classe supprimée'); renderView('parametres');
  }catch(e){ alert('Erreur : ' + e.message); }
}
async function reglerRelances(actif, heure){
  const patch = {};
  if(actif !== null && actif !== undefined) patch.relances_scolarite = actif;
  if(heure) patch.heure_relances = heure;
  try{
    const { error } = await exigerEffet(sb.from('ecoles').update(patch).eq('id', session.ecoleId));
    if(error) throw error;
    if('relances_scolarite' in patch) DB.meta.relancesScolarite = patch.relances_scolarite;
    if(heure) DB.meta.heureRelances = heure;
    toast(('relances_scolarite' in patch) ? (patch.relances_scolarite ? 'Relances automatiques activées' : 'Relances automatiques désactivées') : 'Heure des relances enregistrée');
  }catch(e){ alert('Erreur : ' + e.message); renderView('parametres'); }
}
async function basculerScolariteParents(visible){
  if(visible && !confirm('Les parents verront dans leur application les tranches, ce qui est payé et le reste à payer de leur enfant. Les montants et les paiements sont-ils à jour ?')){ renderView('parametres'); return; }
  try{
    const { error } = await exigerEffet(sb.from('ecoles').update({ scolarite_visible_parents: visible }).eq('id', session.ecoleId));
    if(error) throw error;
    DB.meta.scolariteVisibleParents = visible;
    toast(visible ? 'Scolarité visible par les parents' : 'Scolarité masquée aux parents');
  }catch(e){ alert('Erreur : ' + e.message); renderView('parametres'); }
}

function handleLogoUpload(ev){
  const file = ev.target.files[0];
  if(!file) return;
  if(!file.type.startsWith('image/')){ alert('Veuillez sélectionner un fichier image (PNG, JPG, SVG…).'); ev.target.value=''; return; }
  if(file.size > 1.5*1024*1024){ alert("L'image est trop volumineuse (max 1,5 Mo). Choisissez un logo plus léger."); ev.target.value=''; return; }
  const reader = new FileReader();
  reader.onload = async () => {
    try{
      const { error } = await exigerEffet(sb.from('ecoles').update({ logo_url: reader.result }).eq('id', session.ecoleId));
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
    const { error } = await exigerEffet(sb.from('ecoles').update({ logo_url: '' }).eq('id', session.ecoleId));
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
   12.9 EXPORT COMPTABLE (ROADMAP COMPTABILITÉ — ÉTAPE 4) — un tableau
   CSV de tous les mouvements financiers (respecte le filtre de période
   déjà sélectionné dans Aperçu), au format attendu par Excel en français
   (séparateur ; et BOM UTF-8 pour les accents), pour transmission à un
   comptable externe.
   --------------------------------------------------------------------- */
function exporterComptabiliteCSV(){
  const periode = ui.filters.comptaPeriode || 'all';
  const inPeriod = iso => periode==='all' || iso.slice(0,7)===periode;
  const lignes = [];
  DB.paiementsScolarite.filter(p=>inPeriod(p.date)).forEach(p=>{
    lignes.push({date:p.date, type:'Entrée', categorie:'Scolarité', libelle:`${p.tranche} — ${eleveFullName(eleveById(p.eleveId)||{prenom:'—',nom:''})}`, montant:p.montant, mode:p.modePaiement});
  });
  DB.paiementsCotisations.filter(p=>inPeriod(p.date)).forEach(p=>{
    const act = DB.activites.find(a=>a.id===p.activiteId);
    lignes.push({date:p.date, type:'Entrée', categorie:'Activité extra-scolaire', libelle:`${act?act.nom:'—'} — ${eleveFullName(eleveById(p.eleveId)||{prenom:'—',nom:''})}`, montant:p.montant, mode:p.modePaiement});
  });
  DB.ventesGadgets.filter(v=>inPeriod(v.date)).forEach(v=>{
    const g = DB.gadgets.find(x=>x.id===v.gadgetId);
    lignes.push({date:v.date, type:'Entrée', categorie:'Boutique scolaire', libelle:`${g?g.nom:'—'} ×${v.quantite}`, montant:v.montantTotal, mode:v.modePaiement});
  });
  DB.paiementsSalaires.filter(p=>inPeriod(p.datePaiement)).forEach(p=>{
    lignes.push({date:p.datePaiement, type:'Sortie', categorie:'Salaire', libelle:`${personnelNomById(p.personnelId,p.personnelType)} — ${moisLabel(p.mois)}`, montant:p.montant, mode:p.modePaiement});
  });
  DB.depenses.filter(d=>inPeriod(d.date)).forEach(d=>{
    lignes.push({date:d.date, type:'Sortie', categorie:d.categorie, libelle:d.libelle, montant:d.montant, mode:d.modePaiement});
  });
  lignes.sort((a,b)=>a.date.localeCompare(b.date));

  const echapperCSV = v => {
    const s = String(v==null?'':v);
    return /[",;\n]/.test(s) ? '"' + s.replace(/"/g,'""') + '"' : s;
  };
  const entetes = ['Date','Type','Catégorie','Libellé','Montant (FCFA)','Mode de paiement'];
  const corps = lignes.map(l=>[l.date,l.type,l.categorie,l.libelle,l.montant,l.mode].map(echapperCSV).join(';'));
  const csv = '﻿' + [entetes.join(';'), ...corps].join('\r\n');
  const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `ecomaz-comptabilite-${periode==='all'?'toute-periode':periode}-${todayISO()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  toast(`Export CSV démarré — ${lignes.length} mouvement(s)`);
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
  // Écran « Chargement » au lieu d'une page vide pendant l'ouverture (connexion lente)
  if(await utilisateurAuthCourant()) afficherChargementDemarrage();
  if(window.ESPACE_FIXE_PRET) await window.ESPACE_FIXE_PRET;

  // Restaure une session Supabase existante (l'utilisateur avait déjà une session active)
  let profil = null;
  try{ profil = await chargerProfilCourant(); }catch(_e){ profil = null; }
  if(profil){
    try{ await entrerSelonRole(); return; }
    catch(e){
      // Compte suspendu / mauvais espace : message de l'écran de connexion (inchangé).
      // Sinon (réseau) : on NE déconnecte PAS — écran clair avec « Réessayer ».
      if(e && e.suspendu){ showLoginGate(e.message); return; }
      afficherErreurDemarrage(); return;
    }
  }
  if(window.ESPACE_FIXE && await utilisateurAuthCourant()){ showDemandeAcces(); return; }
  showEspaces();
})();
