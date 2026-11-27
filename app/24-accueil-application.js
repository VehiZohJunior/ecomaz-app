/* =====================================================================
   ACCUEIL « FAÇON APPLICATION » (2026-11-20) — toutes les applications
   Bandeau bleu nuit (chiffre clé du rôle + 2 actions), grande barre de
   recherche, « Nos services » (4 tuiles + Voir tout) et écran « Tous nos
   services » (grille de cartes). Rien n'est supprimé : ce sont de nouveaux
   accès aux mêmes écrans. Icônes en dégradés bleu nuit / vert menthe.
   ===================================================================== */
// Familles de couleurs (dégradés de la palette bleu nuit · menthe)
const FAMILLES_SERVICES = { nuit: 'svc-nuit', menthe: 'svc-menthe', indigo: 'svc-indigo', ocean: 'svc-ocean' };
// [titre, sous-titre, icône, famille] par écran
const CATALOGUE_SERVICES = {
  'presences-eleves': ['Faire l’appel', 'Présents, absents, retards', 'circle-check', 'menthe'],
  'devoirs': ['Cahier de textes', 'Les devoirs pour les parents', 'book', 'ocean'],
  'emploi-temps': ['Emploi du temps', 'Les cours de la semaine', 'calendar-days', 'indigo'],
  'camps-de-base': ['Camps de base', 'Exercices et devoirs notés', 'target', 'nuit'],
  'cahier-appel': ['Cahier d’appel', 'Tous les appels, jour par jour', 'clipboard', 'indigo'],
  'creer-evaluation': ['Je crée une évaluation', 'Photo, fichier ou saisie', 'file-text', 'menthe'],
  'programmes': ['Programmes', 'Avancement par matière', 'book-open', 'ocean'],
  'notes': ['Notes et bulletins', 'Compositions, appréciations', 'notebook-pen', 'nuit'],
  'rapport-activite': ['Rapport d’activité', 'Le travail de chacun, par période', 'trending-up', 'indigo'],
  'agenda': ['Agenda de l’école', 'Compositions, congés, fêtes', 'calendar', 'ocean'],
  'vie-ecole': ['Vie de l’école', 'Photos et nouvelles', 'camera', 'menthe'],
  'eleves': ['Élèves', 'Inscriptions et fiches', 'users', 'nuit'],
  'liens-parents': ['Parents ↔ Élèves', 'Comptes et invitations', 'link', 'ocean'],
  'renforcement': ['Cours de renforcement', 'Élèves suivis après les cours', 'lightbulb', 'indigo'],
  'boite-evaluations': ['Boîte à évaluations', 'Sujets validés à imprimer', 'printer', 'menthe'],
  'pointage-scan': ['Scanner un badge', 'Arrivée des enseignants', 'camera', 'nuit'],
  'enseignants': ['Enseignants', 'Fiches, accès, horaires', 'school', 'indigo'],
  'presences-enseignants': ['Pointage enseignants', 'Arrivées et retards', 'timer', 'ocean'],
  'comptabilite': ['Comptabilité', 'Scolarité, dépenses, reçus', 'wallet', 'menthe'],
  'compta-cantine': ['Cantine', 'Inscrits, paiements, reste dû', 'shopping-bag', 'ocean'],
  'rapports': ['Rapports et téléchargements', 'Tout télécharger ou charger', 'download', 'nuit'],
  'registre-notes': ['Registre des notes du jour', 'Notes horodatées, rapport du soir', 'scroll-text', 'indigo'],
  'appels-groupes': ['Appels cantine & activités', 'Cantine, taekwondo, renforcement', 'clipboard', 'menthe'],
  'permissions': ['Demandes de permission', 'Personnel, parents, élèves', 'hand', 'ocean'],
  'messagerie': ['Messagerie', 'Messages des familles', 'mail', 'indigo'],
  'cantine': ['Menu de la cantine', 'Repas de la semaine', 'calendar', 'menthe'],
  'tableau-affichage': ['Tableau d’affichage', 'Tableau d’honneur et actualités', 'trophy', 'nuit'],
  'parametres': ['Paramètres', 'École, horaires, sécurité', 'settings', 'indigo'],
};
// Écrans ajoutés récemment : badge « Nouveau »
const SERVICES_NOUVEAUX = new Set(['creer-evaluation', 'boite-evaluations', 'compta-cantine', 'rapports', 'registre-notes', 'appels-groupes', 'permissions']);
// Les 4 tuiles de l'accueil, par rôle (les plus utilisées)
const TUILES_ROLE = {
  enseignant: ['presences-eleves', 'devoirs', 'camps-de-base', 'creer-evaluation'],
  secretariat: ['eleves', 'comptabilite', 'presences-eleves', 'boite-evaluations'],
  direction: ['eleves', 'comptabilite', 'enseignants', 'rapport-activite'],
  fondation: ['eleves', 'comptabilite', 'enseignants', 'rapport-activite'],
};
// Services visibles pour le rôle : ceux du menu (même contrôle d'accès), + la cantine de la comptabilité
function servicesDuRole(){
  const vus = new Set(), liste = [];
  $$('#nav .nav-item[data-view]').forEach(b => {
    const v = b.dataset.view; if(v === 'dashboard' || vus.has(v) || b.style.display === 'none' || !hasAccess(v)) return;
    vus.add(v); liste.push(v);
    if(v === 'comptabilite') liste.push('compta-cantine');
  });
  return liste.filter(v => CATALOGUE_SERVICES[v]);
}
function ouvrirService(v){
  if(v === 'compta-cantine'){ ui.filters.comptaTab = 'cantine'; go('comptabilite'); return; }
  go(v);
}
function iconeService(ic, fam){ return `<span class="svc-ic ${FAMILLES_SERVICES[fam] || 'svc-nuit'}" aria-hidden="true">${icone(ic) || ''}</span>`; }
function tuileService(v, action){
  const [titre, sous, ic, fam] = CATALOGUE_SERVICES[v] || [v, '', 'circle', 'nuit'];
  return `<button type="button" class="svc-tuile" onclick="${action || `ouvrirService('${v}')`}">
    ${SERVICES_NOUVEAUX.has(v) ? '<span class="svc-nouveau">Nouveau</span>' : ''}${iconeService(ic, fam)}
    <strong>${escapeHtml(titre)}</strong><small>${escapeHtml(sous)}</small></button>`;
}
function carteService(v, titre, sous, ic, fam, action, nouveau){
  return `<button type="button" class="svc-carte" onclick="${action}">
    <span class="svc-carte-haut">${iconeService(ic, fam)}${nouveau ? '<span class="svc-nouveau">Nouveau</span>' : `<span class="svc-chevron" aria-hidden="true">›</span>`}</span>
    <strong>${escapeHtml(titre)}</strong><small>${escapeHtml(sous)}</small></button>`;
}
// Montants : œil pour les masquer (comme un solde), mémorisé sur l'appareil
function montantsMasques(){ try{ return localStorage.getItem('ecomaz_montant_masque') === '1'; }catch(_e){ return false; } }
function basculerMontant(){ try{ localStorage.setItem('ecomaz_montant_masque', montantsMasques() ? '0' : '1'); }catch(_e){} document.querySelectorAll('.hero-chiffre[data-montant]').forEach(el => { el.textContent = montantsMasques() ? '•••••• F CFA' : el.dataset.montant; }); document.querySelectorAll('.hero-oeil').forEach(b => b.setAttribute('aria-pressed', String(montantsMasques()))); }
function heroApp({ etiquette, chiffre, montant, ligne, actions }){
  const m = DB.meta || {};
  const libRole = (LIB_FONCTIONS[ui.role] || [titreTableauDeBord()])[0];
  return `<section class="app-hero" aria-label="Résumé">
    <div class="hero-haut"><span class="hero-logo" aria-hidden="true">${m.logo ? `<img src="${escapeHtml(m.logo)}" alt="">` : escapeHtml((m.nomEcole || 'E').trim().charAt(0))}</span>
      <span class="hero-ecole">${escapeHtml(m.nomEcole || 'EcoMaZ')}</span><span class="hero-role">${escapeHtml(ui.role === 'parent' ? 'Parent' : ui.role === 'portier' ? 'Portier' : libRole)}</span></div>
    <div class="hero-etiquette"><span>${escapeHtml(etiquette)}</span>${montant != null ? `<button type="button" class="hero-oeil" aria-label="Masquer ou afficher le montant" aria-pressed="${montantsMasques()}" onclick="basculerMontant()">${icone('eye') || '👁'}</button>` : ''}</div>
    <div class="hero-chiffre"${montant != null ? ` data-montant="${escapeHtml(chiffre)}"` : ''}>${montant != null && montantsMasques() ? '•••••• F CFA' : escapeHtml(chiffre)}</div>
    ${ligne ? `<div class="hero-ligne">${ligne}</div>` : ''}
    ${(actions || []).length ? `<div class="hero-actions">${actions.map(a => `<button type="button" class="hero-btn" onclick="${a.action}">${a.ic ? icone(a.ic) : ''}<span>${escapeHtml(a.lib)}</span></button>`).join('<span class="hero-sep" aria-hidden="true"></span>')}</div>` : ''}
  </section>`;
}
function barreRechercheApp(){
  return `<button type="button" class="app-recherche" onclick="document.getElementById('btnRechercheGlobale')?.click()">${icone('search')}<span>Rechercher un élève, un enseignant, une page…</span></button>`;
}
function blocServices(tuilesHtml, voirTout){
  return `<section class="app-services" aria-labelledby="titreNosServices">
    <div class="svc-tete"><h2 id="titreNosServices">Nos services</h2><button type="button" class="svc-voir" onclick="${voirTout}">Voir tout ›</button></div>
    <div class="svc-tuiles">${tuilesHtml}</div></section>`;
}
// --- Personnel et enseignants : le haut de l'accueil
function renderAccueilApp(){
  if(!['enseignant', 'secretariat', 'direction', 'fondation'].includes(ui.role)) return '';
  const auj = todayISO(), mois = thisMonthISO();
  let hero;
  if(ui.role === 'enseignant'){
    const classes = classesVisibles().filter(c => (DB.eleves || []).some(e => e.classeId === c.id && e.statut === 'Actif'));
    const faits = classes.filter(c => (DB.presencesEleves || []).some(p => p.classeId === c.id && p.date === auj)).length;
    const nbEleves = (DB.eleves || []).filter(e => e.statut === 'Actif' && classes.some(c => c.id === e.classeId)).length;
    hero = heroApp({ etiquette: classes.length > 1 ? 'Mes classes' : 'Ma classe', chiffre: `${nbEleves} élève${nbEleves > 1 ? 's' : ''}`,
      ligne: classes.length ? `Appel aujourd’hui : <strong>${faits} / ${classes.length}</strong> classe${classes.length > 1 ? 's' : ''}` : '',
      actions: [{ lib: 'Faire l’appel', ic: 'circle-check', action: "go('presences-eleves')" }, { lib: 'Noter un devoir', ic: 'book', action: "go('devoirs')" }] });
  } else {
    const encaisse = (DB.paiementsScolarite || []).filter(p => String(p.date || '').slice(0, 7) === mois).reduce((t, p) => t + Number(p.montant || 0), 0)
      + (DB.paiementsCotisations || []).filter(p => String(p.date || '').slice(0, 7) === mois).reduce((t, p) => t + Number(p.montant || 0), 0);
    const classes = (DB.classes || []).filter(c => (DB.eleves || []).some(e => e.classeId === c.id && e.statut === 'Actif'));
    const faits = classes.filter(c => (DB.presencesEleves || []).some(p => p.classeId === c.id && p.date === auj)).length;
    hero = heroApp({ etiquette: `Encaissé — ${moisLabel(mois)}`, chiffre: fmtFCFA(encaisse), montant: true,
      ligne: `Appel aujourd’hui : <strong>${faits} / ${classes.length}</strong> classes`,
      actions: [{ lib: 'Encaisser', ic: 'plus', action: "ui.filters.comptaTab='scolarite'; go('comptabilite')" },
        ui.role === 'secretariat' ? { lib: 'Inscrire un élève', ic: 'users', action: "go('eleves'); setTimeout(() => openEleveForm(), 80)" }
          : { lib: 'Rapport du mois', ic: 'file-text', action: 'ouvrirRapportMois()' }] });
  }
  // 20/11/2026 : les services sont désormais en tuiles dans le menu de gauche (panneau du milieu libéré)
  return hero + barreRechercheApp();
}
// --- Écran « Tous nos services » (personnel, enseignants)
function renderServices(){
  const liste = servicesDuRole();
  return `<div class="view active"><p class="svc-intro">Découvrez toutes les fonctionnalités disponibles</p>
    <div class="svc-grille">${liste.map(v => { const [t, s, ic, fam] = CATALOGUE_SERVICES[v]; return carteService(v, t, s, ic, fam, `ouvrirService('${v}')`, SERVICES_NOUVEAUX.has(v)); }).join('')}</div></div>`;
}
// --- Parents
const SERVICES_PARENT = [
  ['payer', 'Payer la scolarité', 'Reste à payer, Mobile Money, reçus', 'wallet', 'menthe', "allerSectionParent('.enfant-scolarite')"],
  ['absence', 'Signaler une absence', 'Prévenir l’école à l’avance', 'calendar', 'indigo', 'ouvrirSignalerAbsence()'],
  ['msg', 'Messages', 'Écrire à l’école', 'mail', 'nuit', "navParent('msg')"],
  ['devoirs', 'Devoirs', 'Le travail à faire à la maison', 'book', 'ocean', "allerSectionParent('#secDevoirs')"],
  ['document', 'Demander un document', 'Certificat de scolarité…', 'file-text', 'nuit', 'ouvrirDemandeDocument()'],
  ['menu', 'Menu de la cantine', 'Les repas de la semaine', 'shopping-bag', 'menthe', "allerSectionParent('#secMenu')"],
  ['agenda', 'Agenda de l’école', 'Compositions, congés, fêtes', 'calendar-days', 'indigo', "allerSectionParent('#secAgenda')"],
  ['vie', 'Vie de l’école', 'Photos et nouvelles', 'camera', 'ocean', "navParent('vie')"],
  ['objets', 'Objets perdus', 'Signaler une affaire perdue', 'backpack', 'nuit', "navParent('objets')"],
  ['sugg', 'Suggestions', 'Vos idées pour l’école', 'lightbulb', 'menthe', "navParent('sugg')"],
  ['profil', 'Mon profil', 'Nom, téléphone, sécurité', 'user', 'indigo', "navParent('profil')"],
];
function allerSectionParent(sel){
  if(ui.vueParent && ui.vueParent !== 'accueil'){ ui.vueParent = 'accueil'; $('#viewContainer').innerHTML = renderParentDashboard(); }
  const el = document.querySelector(sel);
  const pan = el?.closest('.dbr-panneau'); if(pan) basculerRubrique(pan.id.slice(4), true);
  if(el){ el.scrollIntoView({ behavior: 'smooth', block: 'start' }); el.classList.add('svc-repere'); setTimeout(() => el.classList.remove('svc-repere'), 1600); }
  else toast('Cette rubrique n’a pas encore d’information pour vous');
}
function renderAccueilParentApp(mesEnfants){
  let reste = null;
  if(DB.meta?.scolariteVisibleParents){ versementsSaisisParent(); if(DB.versementsSaisis === true) reste = mesEnfants.reduce((t, e) => { const i = scolariteEleveParEcheance(e.id); return t + (i.total ? i.reste : 0); }, 0); }
  const auj = todayISO();
  const presents = mesEnfants.filter(e => (DB.presencesSemaine || DB.presencesEleves || []).some(p => p.eleveId === e.id && p.date === auj && p.statut !== 'Absent')).length;
  const hero = heroApp(reste != null
    ? { etiquette: 'Reste à payer — scolarité', chiffre: fmtFCFA(reste), montant: true, ligne: `${mesEnfants.length > 1 ? 'Vos enfants' : 'Votre enfant'} à l’école aujourd’hui : <strong>${presents} / ${mesEnfants.length}</strong>`,
        actions: [{ lib: 'Payer', ic: 'wallet', action: "allerSectionParent('.enfant-scolarite')" }, { lib: 'Signaler une absence', ic: 'calendar', action: 'ouvrirSignalerAbsence()' }] }
    : { etiquette: 'À l’école aujourd’hui', chiffre: `${presents} / ${mesEnfants.length} enfant${mesEnfants.length > 1 ? 's' : ''}`, ligne: 'Présence enregistrée par l’appel de la classe.',
        actions: [{ lib: 'Signaler une absence', ic: 'calendar', action: 'ouvrirSignalerAbsence()' }, { lib: 'Messages', ic: 'mail', action: "navParent('msg')" }] });
  // 20/11/2026 : « Nos services » quitte le panneau principal (le bouton central du bas l'ouvre)
  return hero;
}
function renderServicesParent(){
  return `<div class="view active"><div class="svc-retour"><button type="button" class="btn secondary sm" onclick="navParent('accueil')">‹ Accueil</button></div>
    <h2 class="svc-titre">Tous nos services</h2><p class="svc-intro">Découvrez toutes les fonctionnalités disponibles</p>
    <div class="svc-grille">${SERVICES_PARENT.map(([id, t, s, ic, fam, act]) => carteService(id, t, s, ic, fam, act, false)).join('')}</div></div>`;
}
// --- Portier
function renderAccueilPortierApp(){
  const auj = todayISO();
  const n = (DB.notificationsPortier || []).filter(x => String(x.createdAt || '').slice(0, 10) === auj).length;
  return heroApp({ etiquette: 'Parents annoncés aujourd’hui', chiffre: String(n), ligne: 'Un parent arrive ? Tapez le nom de l’élève ci-dessous ou choisissez sa classe.' });
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
