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
/* ---------- Plusieurs fonctions pour une même personne (schema.sql section 125) ---------- */
const LIB_FONCTIONS = { direction: ['Direction', 'Pilotage de l’école, validations, finances'], fondation: ['Fondation', 'Vue d’ensemble, finances'], secretariat: ['Secrétariat', 'Élèves, scolarité, comptabilité, accueil'], enseignant: ['Enseignant(e)', 'Mes classes : appel, devoirs, notes, évaluations'] };
async function mesFonctions(){
  try{ const { data, error } = await sb.rpc('mes_fonctions'); if(error) throw error; window.__fonctions = rowsToCamel(data || []); }
  catch(_e){ window.__fonctions = window.__fonctions || []; }
  return window.__fonctions;
}
async function passerFonction(role){
  const { error } = await sb.rpc('changer_fonction', { p_role: role });
  if(error) throw new Error(error.message || 'Changement de fonction impossible');
  try{ sessionStorage.setItem('ecomaz_fonction_choisie', role); }catch(_e){}
  await chargerProfilCourant();
  ui.role = session.role;
  (window.__fonctions || []).forEach(f => { f.active = f.role === role; });
}
function afficherChoixFonction(fonctions){
  $('#appRoot').style.display = 'none';
  $('#loginGate').classList.add('open');
  $('#loginGate').innerHTML = `<div class="login-card choix-fonction" role="dialog" aria-labelledby="titreChoixFonction">
    <h2 id="titreChoixFonction">Se connecter en tant que…</h2>
    <p class="hint">Vous occupez plusieurs fonctions dans l’école. Chaque fonction a son propre espace : vous ne voyez que ce qui concerne la fonction choisie.</p>
    <div class="cf-liste">${fonctions.map(f => { const [lib, sous] = LIB_FONCTIONS[f.role] || [f.role, '']; return `<button type="button" class="cf-btn" onclick="choisirFonction('${f.role}')"><strong>${escapeHtml(lib)}</strong><small>${escapeHtml(sous)}</small></button>`; }).join('')}</div>
    <div class="pin-error" id="cfErreur" role="alert"></div>
    <button type="button" class="pin-back" onclick="logoutRole()">Se déconnecter</button>
  </div>`;
}
async function choisirFonction(role){
  const err = document.getElementById('cfErreur'); if(err) err.textContent = '';
  try{
    await passerFonction(role);
    $('#loginGate').innerHTML = '<div class="login-card"><p class="hint">Ouverture…</p></div>';
    await entrerSelonRole();
  }catch(e){ if(err) err.textContent = e.message; else alert(e.message); }
}
// Changer de fonction en cours de session : on repasse par le choix (l'appli enseignant renvoie vers l'appli du personnel)
function changerDeFonction(){
  try{ sessionStorage.removeItem('ecomaz_fonction_choisie'); }catch(_e){}
  if(window.ESPACE_FIXE === 'enseignant'){ location.href = 'index.html'; return; }
  location.reload();
}
function majBoutonFonction(){
  const b = document.getElementById('btnChangerFonction'); if(!b) return;
  const n = (window.__fonctions || []).length;
  b.hidden = n < 2;
  if(n >= 2) b.textContent = 'Changer de fonction';
}
async function entrerSelonRole(){
  // Mot de passe personnel obligatoire (schema.sql section 128) : rien d'autre avant
  if(session.mdpAChanger && session.role !== 'developpeur' && navigator.onLine !== false){ showResetPassword(); return; }
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
  // Une même personne, plusieurs fonctions (schema.sql section 125) : elle choisit la fonction
  // avec laquelle elle entre ; le serveur ne lui montre que les données de cette fonction.
  const fonctions = await mesFonctions();
  if(fonctions.length > 1){
    if(window.ESPACE_FIXE === 'enseignant'){
      if(session.role !== 'enseignant' && fonctions.some(f => f.role === 'enseignant')) await passerFonction('enseignant');
    } else if(!window.ESPACE_FIXE){
      let choisie = null; try{ choisie = sessionStorage.getItem('ecomaz_fonction_choisie'); }catch(_e){}
      if(!choisie || !fonctions.some(f => f.role === choisie)){ afficherChoixFonction(fonctions); return; }
      if(choisie !== session.role) await passerFonction(choisie);
    }
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
  arreterPersonnesConnectees();
  if(typeof rnEtat !== "undefined"){ rnEtat.pages = null; rnEtat.entrees = {}; }
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
const CLE_ACTIVITE = 'ecomaz_derniere_activite';
let derniereEcritureActivite = 0;
function noterActivite(force){ const t = Date.now(); if(force || t - derniereEcritureActivite > 15000){ derniereEcritureActivite = t; try{ localStorage.setItem(CLE_ACTIVITE, String(t)); }catch(_e){} } }
function inactifTropLongtemps(){ let t = 0; try{ t = Number(localStorage.getItem(CLE_ACTIVITE)) || 0; }catch(_e){} return t > 0 && Date.now() - t > IDLE_TIMEOUT_MS; }
function verifierInactivite(){ if(ui.role && inactifTropLongtemps()){ toast('Session verrouillée pour inactivité'); logoutRole(); return true; } return false; }
document.addEventListener('visibilitychange', () => { if(!document.hidden && idleTimer) verifierInactivite(); });
function resetIdleTimer(){
  noterActivite();
  clearTimeout(idleTimer);
  idleTimer = setTimeout(()=>{
    toast('Session verrouillée pour inactivité');
    logoutRole();
  }, IDLE_TIMEOUT_MS);
}
function startIdleWatcher(){
  // Appli rouverte après plus de 10 minutes sans activité : on reverrouille
  if(verifierInactivite()) return;
  ['mousemove','mousedown','keydown','touchstart','scroll'].forEach(ev=>document.addEventListener(ev, resetIdleTimer));
  noterActivite(true);
  resetIdleTimer();
}
function adressePaiementSure(url){ try{ const u = new URL(url); return u.protocol === 'https:' && /(^|\.)paydunya\.com$/.test(u.hostname); }catch(_e){ return false; } }
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
let sondageEnCours = false;
function startPollingBulles(){
  stopPollingBulles();
  bullesPollTimer = setInterval(sonderBulles, 20000);
}
// Application en arrière-plan (téléphone en poche, autre application) : aucun sondage, pas de données mobiles
// consommées pour rien ; au retour à l'écran, une vérification immédiate.
document.addEventListener('visibilitychange', () => { if(!document.hidden && bullesPollTimer) sonderBulles(); });
async function sonderBulles(){
  if(document.hidden || sondageEnCours) return;
  sondageEnCours = true;
    try{
      if(['enseignant','secretariat','direction','fondation'].includes(ui.role)){
        const { data, error } = await sb.from('notifications_portier').select('*').gte('created_at', depuisJours(7)).order('created_at', {ascending:false}).limit(200);
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
  sondageEnCours = false;
}
function stopPollingBulles(){
  clearInterval(bullesPollTimer);
  bullesPollTimer = null;
}


