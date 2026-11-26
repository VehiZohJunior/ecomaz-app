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
  if(ui.role === 'enseignant' || session.enseignantId){
    const t = session.enseignantId ? enseignantById(session.enseignantId) : null;
    return t ? DB.classes.filter(c => (t.classesAssignees || []).includes(c.id)) : [];
  }
  return DB.classes;
}
// Choix de la classe : une seule classe → simple étiquette (pas de liste) ; plusieurs → liste de SES classes seulement
function choixClasse(classes, choisie, onchange, options){
  options = options || {};
  if(classes.length === 1 && !options.tous) return `<span class="classe-unique" aria-label="Classe">${icone('school')} ${escapeHtml(classes[0].nom)}</span>`;
  return `<select class="${options.classe || 'puce-select'}" aria-label="Classe" onchange="${onchange}">${options.tous ? `<option value="">${options.tous}</option>` : ''}${classes.map(c => `<option value="${c.id}" ${c.id === choisie ? 'selected' : ''}>${escapeHtml(c.nom)}</option>`).join('')}</select>`;
}

/* ---------- Tableau de bord par rôle et salutations personnalisées ---------- */
const LIBELLES_ROLES = { direction:'Direction', fondation:'Fondation', secretariat:'Secrétariat', enseignant:'Enseignant', parent:'Parent', portier:'Portier', developpeur:'Développeur' };
function titreTableauDeBord(role){ return (role || ui.role) === 'enseignant' ? 'Accueil — mes tâches' : 'Tableau de bord ' + (LIBELLES_ROLES[role || ui.role] || ''); }
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
  if(ui.role === 'enseignant' && session.enseignantId){
    const t = (DB?.enseignants || []).find(x => x.id === session.enseignantId);
    if(t) nom = `${t.prenom} ${t.nom}`;
  }
  // Nom de compte générique (rôle, ou intitulé technique) : on salue sans nom plutôt que d'afficher l'intitulé
  const generique = !nom || /^(direction|fondation|secr[ée]tariat|enseignant\(?e?\)?|parent|portier|directeur|fondateur)$/i.test(nom) || /(^|\s)(test|essai|d[ée]mo)(\s|$)/i.test(nom);
  if(generique) nom = ui.role === 'direction' ? (DB?.meta?.directeurNom || '') : ui.role === 'fondation' ? (DB?.meta?.fondateurNom || '') : '';
  return nom.replace(/^(M\.|Mme|Mlle|Monsieur|Madame)\s+/i, '');
}
// Signature visible par les autres (messages, publications, commentaires) :
// le nom choisi par la personne, sinon son nom de compte s'il n'est pas un
// intitulé technique, sinon son rôle et l'école. Les comptes ne sont pas modifiés.
function estIntituleTechnique(nom){
  nom = String(nom || '').trim();
  return !nom || /^(direction|fondation|secr[ée]tariat|enseignant|parent|portier|directeur|fondateur|compte)\b/i.test(nom)
    || /(^|\s)(test|essai|d[ée]mo)(\s|$)/i.test(nom);
}
function signatureAuteur(){
  const nom = String(session.nomAppel || '').trim() || (estIntituleTechnique(session.nomComplet) ? '' : String(session.nomComplet || '').trim());
  if(nom) return nom;
  const roles = { direction:'La direction', fondation:'La fondation', secretariat:'Le secrétariat', enseignant:'L’enseignant(e)', portier:'Le portier', parent:'Parent' };
  const r = roles[ui.role] || '';
  return ui.role === 'parent' ? r : [r, DB?.meta?.nomEcole].filter(Boolean).join(' — ');
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
  if(ui.role === 'enseignant' && !session.enseignantId) return ''; // « Je m'enrôle » demande déjà civilité et nom
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
  if(typeof noterNavigation === 'function') noterNavigation(ui.currentView, view);
  ui.currentView = view;
  renderView(view);
  if(typeof majBoutonRetour === 'function') majBoutonRetour();
  if(ui.role === 'enseignant') setTimeout(verifierAppelObligatoire, 0);
  $('#sidebar').classList.remove('open');
  $('#sidebarBackdrop').classList.remove('open');
  window.scrollTo(0,0);
}

function renderView(view){
  // Parents et portier ont leur propre accueil : ne jamais dessiner un écran du personnel chez eux (audit 26/11/2026)
  if(ui.role === 'parent' || ui.role === 'portier'){ if(DB) rafraichirAccueil(); return; }
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
    'rapport-activite': renderRapportActivite,
    'creer-evaluation': renderCreerEvaluation,
    services: renderServices,
    'boite-evaluations': renderBoiteEvaluations,
    'camps-de-base': renderCampsDeBase,
    renforcement: renderRenforcement,
    rapports: renderRapports,
    'registre-notes': renderRegistreNotes,
  };
  // Données pas encore chargées, ou déjà effacées par une déconnexion (fin
  // de session, inactivité) : rien à afficher, l'écran de connexion est là.
  // Évite l'erreur « Cannot read properties of null » vue en service le 06/10.
  if(!DB) return;
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
/* Menu de gauche en tuiles (20/11/2026) : chaque entrée garde son écran, ses droits
   (data-roles) et son libellé ; elle reçoit l'icône colorée et le sous-titre de « Tous nos services ». */
function habillerMenuTuiles(){
  if(!window.EmIcones || typeof CATALOGUE_SERVICES === 'undefined') return;
  const nav = document.getElementById('nav'); if(!nav || nav.dataset.tuiles === '1') return;
  nav.dataset.tuiles = '1'; nav.classList.add('nav-tuiles');
  const habiller = (b, sous, ic, fam, nouveau) => {
    const lib = b.querySelector('span:not(.ic)') || document.createElement('span');
    lib.classList.add('nt-titre');
    b.classList.add('nav-tuile');
    b.innerHTML = `<span class="nt-haut">${iconeService(ic, fam)}${nouveau ? '<span class="svc-nouveau">Nouveau</span>' : '<span class="svc-chevron" aria-hidden="true">›</span>'}</span>`;
    b.appendChild(lib);
    const sm = document.createElement('small'); sm.textContent = sous; b.appendChild(sm);
  };
  $$('#nav .nav-item[data-view]').forEach(b => {
    const v = b.dataset.view;
    if(v === 'dashboard'){ habiller(b, b.dataset.roles === 'enseignant' ? 'Mes tâches du jour' : 'La journée de l’école', b.dataset.roles === 'enseignant' ? 'house' : 'chart-column', 'nuit', false); b.classList.add('nt-large'); return; }
    const c = CATALOGUE_SERVICES[v]; if(!c) return;
    habiller(b, c[1], c[2], c[3], SERVICES_NOUVEAUX.has(v));
    if(v === 'comptabilite'){
      // La cantine de la comptabilité a sa propre tuile, comme dans « Tous nos services »
      const k = CATALOGUE_SERVICES['compta-cantine'];
      const t = document.createElement('button'); t.type = 'button'; t.className = 'nav-item'; t.dataset.roles = b.dataset.roles; t.dataset.service = 'compta-cantine';
      t.innerHTML = `<span>${k[0]}</span>`; habiller(t, k[1], k[2], k[3], SERVICES_NOUVEAUX.has('compta-cantine'));
      t.addEventListener('click', () => { ouvrirService('compta-cantine'); if(window.innerWidth <= 900) document.getElementById('sidebar')?.classList.remove('open'), document.getElementById('sidebarBackdrop')?.classList.remove('open'); });
      b.after(t);
    }
  });
}
function applyRoleVisibility(){
  habillerMenuTuiles();
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
  majBoutonFonction();
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
      <h1>${session.mdpAChanger ? 'Choisissez votre mot de passe personnel' : t('reset_title')}</h1>
      <div class="sub">${session.mdpAChanger ? 'Pour protéger les données de l’école, ce compte doit avoir un mot de passe que vous seul connaissez. Une seule fois, puis vous entrez normalement.' : t('reset_sub')}</div>
      <div class="hint" style="text-align:left;margin:6px 0 10px;">Au moins 10 caractères, avec des lettres et des chiffres. Évitez votre nom, le nom de l’école et les suites simples (123456, azerty…).</div>
      <form class="pin-pad" onsubmit="return handleResetSubmit(event)">
        <div class="field" style="text-align:left;margin-bottom:10px;">
          <label>${t('label_new_password')}</label>
          <input type="password" id="resetPassword1" required minlength="10" autofocus autocomplete="new-password">
        </div>
        <div class="field" style="text-align:left;">
          <label>${t('label_confirm_password')}</label>
          <input type="password" id="resetPassword2" required minlength="10" autocomplete="new-password">
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
  // Ce téléphone s'est déjà connecté par mot de passe : on montre directement ce formulaire
  if(fixe && ui.loginAvecMotDePasse === undefined){ try{ ui.loginAvecMotDePasse = localStorage.getItem('ecomaz_login_mdp_' + fixe) === '1'; }catch(_e){ ui.loginAvecMotDePasse = false; } }
  if(fixe && !ui.loginAvecMotDePasse) return renderAccueilInscription(logoHtml, titreLogin, error, iosHint);
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
        ${fixe ? `<button type="button" class="pin-back" onclick="ui.loginAvecMotDePasse=false; try{localStorage.removeItem('ecomaz_login_mdp_' + window.ESPACE_FIXE)}catch(_e){}; showLoginGate()">← Se connecter ou s’inscrire avec Google</button>` : `<button type="button" class="pin-back" onclick="showEspaces()">${t('btn_change_espace')}</button>`}
      </form>
      ${fixe ? `<div class="sub" style="margin:16px 0 8px;">— ou —</div>
        <button type="button" class="btn secondary" style="width:100%;" onclick="handleGoogleLogin()">🔵 Continuer avec Google</button>
        <div class="sub" style="margin-top:6px;font-size:var(--fs-xs);">Première fois ? Connectez-vous avec Google : l'école validera votre accès.</div>` : ''}
      ${fixe ? `<button type="button" class="btn btn-install-pwa" style="display:none;width:100%;margin-top:10px;">📲 Installer l'application sur ce téléphone</button>${iosHint}` : ''}
      <div class="login-legal"><a href="confidentialite.html" target="_blank" rel="noopener">Confidentialité</a> · <a href="conditions.html" target="_blank" rel="noopener">Conditions d’utilisation</a></div>
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
// Navigateur intégré (WhatsApp, Facebook, Instagram…) : Google y refuse la connexion
function navigateurIntegre(){
  const ua = navigator.userAgent || '';
  return /; wv\)|FBAN|FBAV|FB_IAB|Instagram|Messenger|Line\/|Snapchat|TikTok|musical_ly/i.test(ua);
}
const ETAPES_INSCRIPTION = {
  enseignant: ['Touchez « Continuer avec Google » et choisissez votre adresse Gmail.', 'Écrivez votre nom et votre numéro WhatsApp, puis cochez vos classes.', 'La direction valide votre demande : vous entrez alors dans votre espace.'],
  parent: ['Touchez « Continuer avec Google » et choisissez votre adresse Gmail.', 'Écrivez votre nom et votre numéro WhatsApp, puis cochez votre ou vos enfants.', 'L’école valide votre demande : vous suivez alors votre enfant.'],
  portier: ['Touchez « Continuer avec Google » et choisissez votre adresse Gmail.', 'Écrivez votre nom.', 'La direction valide votre demande.'],
};
function codeInvitationParent(){
  try{
    const c = new URLSearchParams(location.search).get('invitation');
    if(c) localStorage.setItem('ecomaz_invitation_parent', c);
    return c || localStorage.getItem('ecomaz_invitation_parent') || '';
  }catch(_e){ return ''; }
}
function oublierInvitationParent(){ try{ localStorage.removeItem('ecomaz_invitation_parent'); }catch(_e){} }
function renderAccueilInscription(logoHtml, titreLogin, error, iosHint){
  const fixe = window.ESPACE_FIXE;
  const invitation = fixe === 'parent' && codeInvitationParent();
  const etapes = ETAPES_INSCRIPTION[fixe] || ETAPES_INSCRIPTION.portier;
  const sansEcole = !window.ECOLE_VITRINE;
  const integre = navigateurIntegre();
  return `
    <div class="login-card accueil-inscription">
      <div class="login-logo">${logoHtml}</div>
      <h1>${titreLogin}</h1>
      <div class="sub" style="font-weight:700;margin-bottom:2px;">${t('espace_' + fixe + '_label')}</div>
      ${sansEcole ? `<div class="alerte-inscription">Ce lien ne contient pas le nom de l’école. Demandez à l’école de vous renvoyer le lien complet (bouton « Partager sur WhatsApp » de l’école).</div>` : ''}
      ${error ? `<div class="pin-error">${escapeHtml(error)}</div>` : ''}
      ${invitation ? `<div class="invitation-perso">${icone('mail') || '✉️'} <span><strong>Vous avez reçu une invitation personnelle de l’école.</strong> Touchez « Continuer avec Google » : vous arriverez directement dans votre espace, déjà relié à votre enfant.</span></div>`
        : `<div class="sub" style="margin-top:6px;">Première fois ou déjà inscrit(e) : entrez avec votre compte Google (Gmail). Aucun mot de passe à retenir.</div>`}
      ${integre ? `<div class="alerte-inscription">
          <strong>Ouvrez d’abord ce lien dans Chrome.</strong> Google refuse la connexion à l’intérieur de WhatsApp ou Facebook.
          Touchez les <strong>⋮</strong> (3 points) en haut à droite, puis « Ouvrir dans Chrome » (ou « Ouvrir dans le navigateur »).
          <button type="button" class="btn secondary sm" style="width:100%;margin-top:8px;" onclick="copierLienCourant()">Copier le lien pour le coller dans Chrome</button>
        </div>` : ''}
      <button type="button" class="btn btn-google" style="width:100%;margin-top:12px;" onclick="handleGoogleLogin()" ${sansEcole ? 'disabled' : ''}>
        <span class="g-logo" aria-hidden="true">G</span> Continuer avec Google</button>
      <ol class="etapes-inscription">${etapes.map(e => `<li>${escapeHtml(e)}</li>`).join('')}</ol>
      <div class="sub" style="font-size:var(--fs-xs);">Pas encore d’adresse Gmail ? <a href="https://accounts.google.com/signup" target="_blank" rel="noopener">Créez-en une gratuitement</a>, puis revenez sur ce lien.</div>
      <button type="button" class="pin-back" onclick="ui.loginAvecMotDePasse=true; try{localStorage.setItem('ecomaz_login_mdp_' + window.ESPACE_FIXE, '1')}catch(_e){}; showLoginGate()">J’ai un email et un mot de passe donnés par l’école</button>
      <button type="button" class="btn btn-install-pwa" style="display:none;width:100%;margin-top:10px;">📲 Installer l'application sur ce téléphone</button>${iosHint}
    </div>`;
}
function copierLienCourant(){
  const lien = window.location.href;
  (navigator.clipboard ? navigator.clipboard.writeText(lien) : Promise.reject()).then(
    () => toast('Lien copié : collez-le dans Chrome'),
    () => { window.prompt('Copiez ce lien, puis collez-le dans Chrome :', lien); });
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
  // Invitation personnelle : entrée directe, sans demande à valider
  if(fixe === 'parent' && codeInvitationParent() && await afficherInvitationParent(user)) return;
  const { data: demandes } = await sb.from('demandes_acces').select('*').eq('user_id', user.id).eq('ecole_id', ecoleId).eq('role_demande', fixe);
  const dem = demandes && demandes[0];
  const nomEcole = escapeHtml(window.ECOLE_VITRINE.nom_ecole);
  const carte = (icone, titre, corps) => `<div class="login-card"><div class="login-logo">${icone}</div><h1>${escapeHtml(nomApplication(window.ECOLE_VITRINE.nom_ecole))}</h1><div class="sub" style="font-weight:700;">${titre}</div><div class="sub">${corps}</div>
    <button type="button" class="btn secondary" style="width:100%;margin-top:14px;" onclick="logoutDemande()">Changer de compte</button></div>`;
  clearInterval(window.__attenteValidation);
  if(dem && dem.statut === 'en_attente'){
    $('#loginGate').innerHTML = carte('⏳', 'Demande envoyée', `Compte : <strong>${escapeHtml(user.email||'')}</strong><br>L'école doit valider votre accès. Vous pouvez laisser cette page ouverte : elle s’ouvrira toute seule dès que ce sera fait (ou revenez plus tard).<br><button type="button" class="btn sm" style="margin-top:10px;" onclick="location.reload()">🔄 Vérifier maintenant</button>`);
    // Attente active : dès que l'école valide (profil créé) on entre ; si elle refuse, on l'affiche
    window.__attenteValidation = setInterval(async () => {
      if(document.visibilityState !== 'visible') return;
      try{
        const { data: profil } = await sb.from('profiles').select('id').eq('id', user.id).maybeSingle();
        if(profil){ clearInterval(window.__attenteValidation); location.reload(); return; }
        const { data: suivi } = await sb.from('demandes_acces').select('statut').eq('id', dem.id).maybeSingle();
        if(suivi && suivi.statut !== 'en_attente'){ clearInterval(window.__attenteValidation); showDemandeAcces(); }
      }catch(_e){ /* hors ligne : on réessaiera */ }
    }, 20000);
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
      <div class="field" style="text-align:left;margin-bottom:10px;"><label>Vous êtes</label><div class="segmente seg-radio" role="radiogroup" aria-label="Civilité">
        ${(parent ? [['M', 'Papa'], ['F', 'Maman']] : [['M', 'Monsieur'], ['F', 'Madame']]).map(([k, l]) => `<label class="seg"><input type="radio" name="demCiv" value="${k}" required>${l}</label>`).join('')}</div></div>
      ${enseignant ? `<div class="field" style="text-align:left;margin-bottom:10px;"><label for="demNomFamille">Votre NOM</label><input type="text" id="demNomFamille" required minlength="2" maxlength="60" placeholder="Ex : KOUAKOU" style="text-transform:uppercase;" autocomplete="family-name"></div>
        <div class="field" style="text-align:left;margin-bottom:10px;"><label for="demPrenom">Vos prénoms</label><input type="text" id="demPrenom" required minlength="2" maxlength="60" placeholder="Ex : Amenan Clémentine" autocomplete="given-name"></div>`
      : `<div class="field" style="text-align:left;margin-bottom:10px;"><label>Votre nom complet (prénom et nom)</label><input type="text" id="demNom" required minlength="3" value="${escapeHtml(nomDefaut)}"></div>`}
      ${enseignant ? `<div class="field" style="text-align:left;margin-bottom:10px;"><label>Votre numéro WhatsApp</label><input type="tel" id="demTel" required placeholder="07 00 00 00 00"></div>
        <div class="field" style="text-align:left;"><label>Cochez la ou les classes dont vous êtes l’enseignant(e)</label><div class="enrol-liste">${classesHtml}</div></div>` : ''}
      ${parent ? `<div class="field" style="text-align:left;margin-bottom:10px;"><label>Votre numéro WhatsApp</label><input type="tel" id="demTel" required placeholder="07 00 00 00 00" oninput="if(this.value.replace(/\D/g, '').length >= 10) rechercherEnfantDemande(document.getElementById('demRecherche')?.value || '')"><div class="hint" style="margin:4px 0 0;">Celui que vous avez donné à l’école : vos enfants apparaissent tout seuls et votre demande est validée plus vite.</div></div>
        <div class="field" style="text-align:left;"><label>Cochez votre enfant (ou vos enfants)</label>
          <input type="search" id="demRecherche" placeholder="Sinon : son NOM complet puis le début de son prénom (ex : KOUASSI Am)" oninput="rechercherEnfantDemande(this.value)" autocomplete="off">
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
    if(texte.trim().length < 5 && tel.length < 10){ zone.innerHTML = ''; return; }
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
  const civilite = document.querySelector('input[name=demCiv]:checked')?.value || null;
  if(!civilite){ $('#demErr').textContent = 'Choisissez ' + (fixe === 'parent' ? 'Papa ou Maman.' : 'Monsieur ou Madame.'); return false; }
  const ligne = { ecole_id: window.ECOLE_VITRINE.id, role_demande: fixe, civilite, nom: ($('#demNom')?.value || '').trim(), message: ($('#demMsg')?.value || '').trim() };
  if(fixe === 'enseignant'){
    ligne.prenom = $('#demPrenom').value.trim().replace(/\s+/g, ' ');
    ligne.nom_famille = $('#demNomFamille').value.trim().replace(/\s+/g, ' ').toUpperCase();
    ligne.nom = `${ligne.prenom} ${ligne.nom_famille}`;
  }
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
async function afficherInvitationParent(user){
  const code = codeInvitationParent();
  const { data, error } = await sb.rpc('apercu_invitation_parent', { p_code: code });
  const inv = data && data[0];
  if(error || !inv || !inv.valide){ oublierInvitationParent(); if(inv && !inv.valide) toast('Ce lien d’invitation a déjà servi ou a expiré : faites votre demande ci-dessous.'); return false; }
  const nomDefaut = (user.user_metadata && (user.user_metadata.full_name || user.user_metadata.name)) || '';
  $('#loginGate').innerHTML = `<div class="login-card"><div class="login-logo">👪</div><h1>${escapeHtml(nomApplication(inv.nom_ecole))}</h1>
    <div class="sub" style="font-weight:700;">Invitation personnelle</div>
    <div class="invitation-perso" style="margin:10px 0;">${icone('users') || '👪'} <span>Pour <strong>${escapeHtml(inv.enfants || '')}</strong></span></div>
    <div class="sub">Compte Google : <strong>${escapeHtml(user.email || '')}</strong></div>
    <form class="pin-pad" onsubmit="return utiliserInvitationParent(event)">
      <div class="field" style="text-align:left;margin-bottom:10px;"><label>Vous êtes</label><div class="segmente seg-radio" role="radiogroup" aria-label="Papa ou Maman">
        ${[['M', 'Papa'], ['F', 'Maman']].map(([k, l]) => `<label class="seg"><input type="radio" name="invCiv" value="${k}" required>${l}</label>`).join('')}</div></div>
      <div class="field" style="text-align:left;margin-bottom:10px;"><label for="invNom">Votre nom complet</label><input type="text" id="invNom" required minlength="2" maxlength="80" value="${escapeHtml(nomDefaut)}" autocomplete="name"></div>
      <div class="pin-error" id="invErr"></div>
      <button class="btn" type="submit" id="invBouton" style="width:100%;margin-top:6px;">Accéder à mon espace</button>
      <button type="button" class="pin-back" onclick="logoutDemande()">Changer de compte Google</button>
    </form></div>`;
  return true;
}
async function utiliserInvitationParent(ev){
  ev.preventDefault();
  const civ = document.querySelector('input[name=invCiv]:checked')?.value, nom = $('#invNom').value.trim(), b = $('#invBouton');
  if(!civ){ $('#invErr').textContent = 'Choisissez Papa ou Maman.'; return false; }
  b.disabled = true; b.textContent = 'Un instant…';
  const { error } = await sb.rpc('utiliser_invitation_parent', { p_code: codeInvitationParent(), p_civilite: civ, p_nom: nom });
  if(error){ $('#invErr').textContent = error.message; b.disabled = false; b.textContent = 'Accéder à mon espace'; return false; }
  oublierInvitationParent();
  try{ localStorage.removeItem('ecomaz_profil_cache'); }catch(_e){}
  location.href = location.pathname + (window.ECOLE_VITRINE ? '?ecole=' + encodeURIComponent(window.ECOLE_VITRINE.id) : '');
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
// Règles d'un mot de passe personnel (21/11/2026) — vérifiées avant l'envoi
function faiblesseMotDePasse(p){
  const s = String(p || ''), bas = s.toLowerCase();
  if(s.length < 10) return 'Le mot de passe doit contenir au moins 10 caractères.';
  if(!/[a-zA-ZÀ-ÿ]/.test(s) || !/[0-9]/.test(s)) return 'Mettez des lettres ET des chiffres.';
  const interdits = ['123456', 'azerty', 'qwerty', 'password', 'motdepasse', 'ecomaz', 'success', 'vehizoh', 'abcdef', '000000', '111111'];
  if(interdits.some(m => bas.includes(m))) return 'Ce mot de passe est trop facile à deviner : évitez les suites simples, le nom de l’école ou d’EcoMaZ.';
  const nom = String(session.nomComplet || '').toLowerCase().split(/\s+/).filter(x => x.length >= 4);
  if(nom.some(m => bas.includes(m))) return 'N’utilisez pas votre nom dans le mot de passe.';
  if(/^(.)\1+$/.test(s)) return 'Ce mot de passe est trop simple.';
  return '';
}
async function handleResetSubmit(ev){
  ev.preventDefault();
  const p1 = $('#resetPassword1').value, p2 = $('#resetPassword2').value;
  if(p1 !== p2){ $('#loginGate').innerHTML = renderLoginGate('reset', 'Les deux mots de passe ne correspondent pas.'); return false; }
  const faiblesse = faiblesseMotDePasse(p1);
  if(faiblesse){ $('#loginGate').innerHTML = renderLoginGate('reset', faiblesse); return false; }
  $('#loginGate').innerHTML = renderLoginGate('reset', '', true);
  const res = await definirNouveauMotDePasse(p1);
  if(!res.ok){ $('#loginGate').innerHTML = renderLoginGate('reset', res.message); return false; }
  toast('Mot de passe mis à jour');
  session.mdpAChanger = false;
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
