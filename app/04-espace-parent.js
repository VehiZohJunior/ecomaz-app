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
      motif: fd.get('motif'), commentaire: (fd.get('commentaire') || '').trim(), parent_nom: signatureAuteur(),
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
  const joursClasse = DB?.horairesAnnonces?.joursCours || [1, 2, 3, 4, 5];
  const cases = JOURS_SEMAINE.map((lib, i) => {
    if(!joursClasse.includes(i + 1)) return '';
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
    <div class="sem-grille" style="grid-template-columns:repeat(${joursClasse.filter(j => j <= 5).length || 5}, minmax(0, 1fr));">${cases}</div>
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
  // Absence pas encore justifiée : la carte « Absence à justifier » (motif en un toucher) la remplace
  const absents = enfants.filter(e => DB.presencesSemaine.some(x => x.eleveId === e.id && x.date === auj && x.statut === 'Absent')
    && !(Array.isArray(DB.absencesSignalees) && !absenceSignalee(e.id, auj)));
  if(!absents.length) return '';
  return absents.map(e => { const sig = Array.isArray(DB.absencesSignalees) ? absenceSignalee(e.id, auj) : null; return `<div class="alerte-absence" role="alert">
    <span class="alerte-ic" aria-hidden="true">${window.EmIcones ? EmIcones.svg(sig ? 'circle-check' : 'triangle-alert') : '⚠️'}</span>
    <div><strong>${escapeHtml(e.prenom || eleveFullName(e))} est noté(e) absent(e) aujourd’hui.</strong>
      <div class="alerte-sous">${sig ? `Motif transmis à l’école : ${escapeHtml(sig.motif)}.` : 'Les détails sont dans vos notifications.'}</div></div>
    <button type="button" class="btn sm" onclick="event.stopPropagation(); toggleBulle('notif')">Voir</button>
  </div>`; }).join('');
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
    <table class="eb-table sans-cartes"><thead><tr><th>Matière</th><th>Classe</th><th>Compo.</th><th>Moy.</th></tr></thead>
      <tbody>${b.lignes.filter(l => l.moy !== null).map(l => `<tr><td>${escapeHtml(l.mat)}</td><td>${l.devoir ?? '—'}</td><td>${l.compo ?? '—'}</td><td><strong>${l.moy.toFixed(1)}</strong></td></tr>`).join('')}</tbody></table>
    ${b.moyenne !== null ? `<div class="eb-moyenne">Moyenne générale : <strong>${b.moyenne.toFixed(2)} / 20</strong> — ${escapeHtml(mentionFromAvg(b.moyenne))}</div>` : ''}
    ${fige ? `<div class="eb-moyenne">Rang : <strong>${rangTexte(fige.rang, fige.exAequo)} sur ${fige.effectif}</strong> · Moyenne de la classe : ${Number(fige.moyenneClasse).toFixed(2)}</div>` : ''}
    ${assiduiteParentHtml(e, t)}
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
      <div class="recu-head">${m.logo ? `<img src="${escapeHtml(m.logo)}" alt="">` : `<div class="recu-logo-ph">🎓</div>`}
        <div><strong>${escapeHtml(m.nomEcole || '')}</strong><div class="hint">${escapeHtml(m.adresse || '')}${m.telephone ? ' · ' + escapeHtml(m.telephone) : ''}</div></div></div>
      <div class="recu-title">BULLETIN — ${escapeHtml(String(trimestre).toUpperCase())}</div>
      <div class="recu-row"><span>Élève</span><strong>${escapeHtml(eleveFullName(e))}</strong></div>
      <div class="recu-row"><span>Classe</span><strong>${escapeHtml(classeName(e.classeId))}</strong></div>
      <div class="recu-row"><span>Année scolaire</span><strong>${escapeHtml(m.anneeScolaire || '')}</strong></div>
      <table class="eb-table sans-cartes" style="margin-top:12px;"><thead><tr><th>Matière</th><th>Classe</th><th>Compo.</th><th>Moy.</th></tr></thead>
        <tbody>${b.lignes.filter(l => l.moy !== null).map(l => `<tr><td>${escapeHtml(l.mat)}</td><td>${l.devoir ?? '—'}</td><td>${l.compo ?? '—'}</td><td><strong>${l.moy.toFixed(1)}</strong></td></tr>`).join('')}</tbody></table>
      ${b.moyenne !== null ? `<div class="eb-moyenne" style="margin-top:10px;">Moyenne générale : <strong>${b.moyenne.toFixed(2)} / 20</strong> — ${escapeHtml(mentionFromAvg(b.moyenne))}</div>` : ''}
      ${(DB.assiduiteParent || {})[e.id] ? assiduiteHtml(DB.assiduiteParent[e.id], trimestre) : ''}
      ${app ? `<div class="eb-appreciation"><strong>Appréciation :</strong> ${escapeHtml(app)}</div>` : ''}
      <p class="hint" style="margin-top:14px;">Document consulté dans l’application des parents le ${fmtDate(todayISO())}. Le bulletin officiel signé est remis par l’établissement.</p>
    </div>
    <div class="form-actions no-print"><button type="button" class="btn secondary" onclick="closeModal()">Fermer</button><button type="button" class="btn" onclick="window.print()">🖨️ Imprimer / PDF</button></div>`);
}
// Console parent : scolarité de l'enfant (si l'école l'a rendue visible)
function renderScolariteEnfant(e){
  if(!DB.meta?.scolariteVisibleParents) return '';
  if(ui.role === 'parent' && DB.recus === undefined){ DB.recus = []; sb.from('recus').select('*').then(({ data }) => { DB.recus = rowsToCamel(data || []); }, () => {}); }
  const info = scolariteEleveParEcheance(e.id);
  if(!info.total) return '';
  // Tant que l'école n'a saisi aucun versement, tout le monde paraîtrait « tout devoir » : on ne montre pas de reste
  versementsSaisisParent();
  if(DB.versementsSaisis !== true) return `<div class="enfant-scolarite"><div class="es-tete"><strong>Scolarité ${escapeHtml(DB.meta?.anneeScolaire || '')}</strong></div>
    <div class="es-reste">Le suivi de vos paiements apparaîtra ici dès que l’école aura enregistré les versements déjà reçus.</div></div>`;
  const recus = (DB.paiementsScolarite || []).filter(p => p.eleveId === e.id);
  const pct = Math.min(100, Math.round(100 * info.totalPaye / info.total));
  const prochaine = info.detail.find(d => d.statut !== 'paye');
  return `<div class="enfant-scolarite">
    <div class="es-tete"><strong>Scolarité ${escapeHtml(DB.meta?.anneeScolaire || '')}</strong><span>${fmtFCFA(info.totalPaye)} / ${fmtFCFA(info.total)}</span></div>
    <div class="mer-barre" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><div style="width:${pct}%"></div></div>
    <div class="es-reste">${info.reste ? `Reste à payer : <strong>${fmtFCFA(info.reste)}</strong>${prochaine ? ` · prochaine tranche : ${escapeHtml(prochaine.label)}` : ''}` : '✅ Scolarité soldée, merci !'}</div>
    <details class="es-detail"><summary>Voir les tranches${recus.length ? ' et les paiements' : ''}</summary>
      <ul>${info.detail.map(d => `<li><span>${escapeHtml(d.label)}</span><span class="badge ${d.statut === 'paye' ? 'green' : d.statut === 'partiel' ? 'amber' : 'gray'}">${d.statut === 'paye' ? 'payé' : d.statut === 'partiel' ? fmtFCFA(d.paye) + ' / ' + fmtFCFA(d.montant) : fmtFCFA(d.montant)}</span>${boutonPayerEnLigne(e, d)}</li>`).join('')}</ul>
      ${recus.length ? `<div class="hint" style="margin:6px 0 2px;">Paiements reçus :</div><ul>${recus.map(p => `<li><span>${fmtDate(p.date)} — ${escapeHtml(p.tranche || '')}</span><span>${fmtFCFA(p.montant)} (${escapeHtml(p.modePaiement || '')})</span><button type="button" class="btn secondary sm btn-recu" onclick="ouvrirRecuParent('${p.id}')">${icone('download')} Reçu</button></li>`).join('')}</ul>` : ''}
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
    <table class="eb-table sans-cartes"><thead><tr><th>Date</th><th>Matière</th><th>Évaluation</th><th>Note</th></tr></thead>
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
/* ---------- Parent : absence notée par l'école → justifier en un toucher (aujourd'hui ou hier) ---------- */
function renderAbsencesAJustifier(enfants){
  if(!(DB.presencesSemaine || []).length) return '';
  if(DB.absencesSignalees === undefined){ DB.absencesSignalees = null; chargerAbsencesSignalees().then(() => { if(ui.role === 'parent' && document.querySelector('.abs-justif-zone')) $('#viewContainer').innerHTML = renderParentDashboard(); }).catch(() => { DB.absencesSignalees = []; }); return ''; }
  if(DB.absencesSignalees === null) return '';
  const hier = isoDansJours(-1), auj = todayISO();
  const aJustifier = (DB.presencesSemaine || []).filter(p => p.statut === 'Absent' && p.date >= hier && p.date <= auj && !absenceSignalee(p.eleveId, p.date))
    .map(p => ({ p, e: enfants.find(e => e.id === p.eleveId) })).filter(x => x.e);
  if(!aJustifier.length) return '';
  return aJustifier.map(({ p, e }) => `<section class="panel abs-justif em-rise" aria-label="Absence à justifier">
    <div class="abs-justif-tete">${icone('triangle-alert')}<div><strong>${escapeHtml(e.prenom)} a été noté${e.sexe === 'F' ? 'e' : ''} absent${e.sexe === 'F' ? 'e' : ''} ${p.date === auj ? 'aujourd’hui' : 'hier'}</strong>
      <span>Si vous connaissez la raison, touchez-la : l’école et l’enseignant sont prévenus.</span></div></div>
    <div class="dv-puces">${MOTIFS_SIGNALEMENT.map(m => `<button type="button" class="dv-puce" onclick="justifierAbsence('${e.id}','${p.date}', this.textContent)">${escapeHtml(m)}</button>`).join('')}</div>
    <div class="abs-justif-pied">Votre enfant était bien présent ? <button type="button" class="lien-discret" onclick="justifierAbsence('${e.id}','${p.date}','Présent selon le parent','Le parent indique que l’enfant était présent : vérifier l’appel.')">Signaler une erreur</button></div>
  </section>`).join('');
}
async function justifierAbsence(eleveId, date, motif, commentaire){
  try{
    const { data, error } = await sb.from('absences_signalees').insert({ eleve_id: eleveId, date_debut: date, date_fin: date, motif: motif.trim(), commentaire: commentaire || '', parent_nom: signatureAuteur() }).select().single();
    if(error) throw erreurLisible(error);
    DB.absencesSignalees = (DB.absencesSignalees || []).concat(rowToCamel(data));
    sb.functions.invoke('notifier-personnel', { body: { type: 'absence' } }).catch(() => {});
    toast(commentaire ? 'Merci : l’école va vérifier l’appel.' : 'Merci : l’école est prévenue du motif de l’absence.');
    $('#viewContainer').innerHTML = renderParentDashboard();
  }catch(e){ alert('Erreur : ' + e.message); }
}
function renderAujourdhuiParent(enfants){
  if(!enfants.length) return '';
  const e = enfants.find(x => x.id === ui.enfantAujourdhui) || enfants[0];
  const auj = isoLocal(new Date());
  const jourIso = ((new Date().getDay() + 6) % 7) + 1;
  const jourDeClasse = (DB.meta?.joursCours || DB?.horairesAnnonces?.joursCours || [1, 2, 3, 4, 5]).includes(jourIso);
  const p = Array.isArray(DB.presencesSemaine) ? DB.presencesSemaine.find(x => x.eleveId === e.id && x.date === auj) : null;
  const presence = p ? (p.statut === 'Présent' ? { cls:'ok', ic:'circle-check', txt:'Présent(e) à l’école' } : p.statut === 'Retard' ? { cls:'attente', ic:'clock', txt:'Arrivé(e) en retard' } : { cls:'erreur', ic:'circle-x', txt:'Absent(e) aujourd’hui' })
    : jourDeClasse ? { cls:'neutre', ic:'clock', txt:'L’appel n’est pas encore fait' } : { cls:'neutre', ic:'calendar', txt:'Pas de classe aujourd’hui' };
  const ev = (DB.agenda || []).filter(a => (a.dateFin || a.dateDebut) >= auj && (!a.classeIds || !a.classeIds.length || a.classeIds.includes(e.classeId)))
    .sort((a, b) => String(a.dateDebut).localeCompare(String(b.dateDebut)))[0];
  const devoirs = (DB.devoirs || []).filter(d => d.classeId === e.classeId && d.pourLe > auj).sort((a, b) => a.pourLe.localeCompare(b.pourLe));
  const prochainJour = devoirs[0]?.pourLe, nbDevoirs = devoirs.filter(d => d.pourLe === prochainJour).length;
  let reste = null;
  if(DB.meta?.scolariteVisibleParents){ versementsSaisisParent(); if(DB.versementsSaisis === true){ const info = scolariteEleveParEcheance(e.id); if(info.total) reste = info.reste; } }
  const ligne = (ic, lib, val, cls) => `<li class="aj-ligne"><span class="aj-ic ${cls || ''}" aria-hidden="true">${icone(ic)}</span><span class="aj-txt"><small>${lib}</small><strong>${val}</strong></span></li>`;
  return `<section class="aj-parent em-rise" style="--i:2" id="aujParent" aria-label="Aujourd’hui">
    ${enfants.length > 1 ? `<div class="aj-enfants" role="tablist" aria-label="Choisir l’enfant">${enfants.map(x => `<button type="button" role="tab" class="aj-enfant${x.id === e.id ? ' actif' : ''}" aria-selected="${x.id === e.id}" onclick="choisirEnfantAujourdhui('${x.id}')"><span class="aj-av" aria-hidden="true">${escapeHtml(initials(x.prenom, x.nom))}</span><span>${escapeHtml(x.prenom || x.nom)}</span></button>`).join('')}</div>` : ''}
    <div class="aj-carte">
      <div class="aj-tete"><strong>Aujourd’hui</strong><span>${escapeHtml(new Date().toLocaleDateString('fr-FR', { weekday:'long', day:'numeric', month:'long' }))}</span></div>
      <ul class="aj-liste">
        ${ligne(presence.ic, escapeHtml(e.prenom || eleveFullName(e)), presence.txt, presence.cls)}
        ${coursDuJourParent(e, jourDeClasse, ligne)}
        ${ev ? ligne('calendar-days', 'Prochain événement', `${escapeHtml(ev.titre)} <span class="aj-delai">${escapeHtml(delaiAgenda(ev))}</span>`) : ''}
        ${prochainJour ? ligne('book-open', 'Devoirs', `${nbDevoirs} devoir${nbDevoirs > 1 ? 's' : ''} ${escapeHtml(quandDevoir(prochainJour))}`) : ''}
        ${reste !== null ? ligne('wallet', 'Scolarité', reste ? `Reste à payer : ${fmtFCFA(reste)}` : 'Soldée, merci !', reste ? 'attente' : 'ok') : ''}
      </ul>
    </div>
  </section>`;
}
/* ---------- Emploi du temps côté parent : la journée de l'enfant et le rappel du lendemain ---------- */
const JOURS_NOMS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
// Séances d'une classe pour une date (horaires réels, ou grille classique)
function seancesClasseDate(classeId, iso){
  const jour = JOURS_NOMS[(new Date(iso + 'T12:00:00').getDay() + 6) % 7];
  if(classeEnHorairesLibres(classeId)) return seancesEdt(classeId, jour, iso).map(e => ({ debut: hhmmEdt(e.heureDebut), fin: hhmmEdt(e.heureFin), matiere: e.matiere }));
  const c = (DB.classes || []).find(x => x.id === classeId), per = PERIODES_BY_CYCLE[c?.cycle] || [];
  return (DB.emploiTemps || []).filter(e => e.classeId === classeId && e.jour === jour && !e.heureDebut).sort((a, b) => a.slotIndex - b.slotIndex)
    .map(e => ({ debut: per[e.slotIndex]?.debut || '', fin: per[e.slotIndex]?.fin || '', matiere: e.matiere })).filter(x => x.debut);
}
// Prochain jour de classe (jours de l'école, hors congés de l'agenda)
function prochainJourDeClasse(apresIso){
  const jours = DB?.horairesAnnonces?.joursCours || [1, 2, 3, 4, 5];
  const d = new Date(apresIso + 'T12:00:00');
  for(let i = 0; i < 21; i++){
    d.setDate(d.getDate() + 1);
    const iso = isoLocal(d), j = ((d.getDay() + 6) % 7) + 1;
    const conge = (DB.agenda || []).some(a => a.type === 'vacances' && (!a.classeIds || !a.classeIds.length) && a.dateDebut <= iso && a.dateFin >= iso);
    if(jours.includes(j) && !conge) return iso;
  }
  return null;
}
// Matières de la journée en quelques mots (« Mathématiques, Lecture, EPS… »)
function resumeMatieres(seances){
  const noms = [...new Set(seances.map(x => String(x.matiere || '').replace(/\s*\(.*\)\s*$/, '').replace(/\s+\d+(-\d+)?$/, '').trim()).filter(m => m && !/salut aux couleurs|[ée]tudes surveill/i.test(m)))];
  return noms.slice(0, 5).join(', ') + (noms.length > 5 ? '…' : '');
}
function coursDuJourParent(e, jourDeClasse, ligne){
  if(!(DB.emploiTemps || []).some(x => x.classeId === e.classeId)) return '';
  const auj = isoLocal(new Date());
  const aujourdhui = jourDeClasse ? seancesClasseDate(e.classeId, auj) : [];
  const demainIso = prochainJourDeClasse(auj), demain = demainIso ? seancesClasseDate(e.classeId, demainIso) : [];
  const quand = demainIso ? (demainIso === isoLocal(new Date(Date.now() + 86400000)) ? 'Demain' : (d => d.charAt(0).toUpperCase() + d.slice(1))(new Date(demainIso + 'T12:00:00').toLocaleDateString('fr-FR', { weekday:'long' }))) : '';
  const sport = demain.some(x => /\beps\b|sport/i.test(x.matiere));
  return `${aujourdhui.length ? ligne('book-open', 'En classe aujourd’hui', escapeHtml(resumeMatieres(aujourdhui))) : ''}
    ${demain.length ? ligne(sport ? 'party-popper' : 'calendar', `${quand} en classe`, `${escapeHtml(resumeMatieres(demain))}${sport ? '<br><span class="aj-rappel">Il y a EPS : pensez à la tenue de sport.</span>' : ''}`, sport ? 'attente' : '') : ''}
    <li class="aj-ligne aj-lien"><button type="button" class="lien-discret" onclick="ouvrirEmploiTempsParent('${e.id}')">Voir son emploi du temps de la semaine</button></li>`;
}
function ouvrirEmploiTempsParent(eleveId, jour){
  const e = (DB.eleves || []).find(x => x.id === eleveId); if(!e) return;
  const auj = isoLocal(new Date());
  const lundi = debutSemaine(new Date());
  const jours = JOURS.map((j, i) => { const d = new Date(lundi); d.setDate(lundi.getDate() + i); return { j, iso: isoLocal(d) }; })
    .filter(x => seancesClasseDate(e.classeId, x.iso).length);
  const choisi = jours.find(x => x.j === jour) || jours.find(x => x.iso === auj) || jours[0];
  if(!choisi){ toast('L’emploi du temps de la classe n’est pas encore disponible.'); return; }
  const seances = seancesClasseDate(e.classeId, choisi.iso);
  const lignes = [];
  seances.forEach((x, i) => { const p = seances[i - 1]; if(p && p.fin < x.debut) lignes.push(`<li class="edtl-pause"><span>${p.fin} – ${x.debut}</span><strong>${libellePause(p.fin, x.debut)}</strong></li>`);
    lignes.push(`<li class="edtl-seance" style="--mat:${couleurActivite(x.matiere)}"><span class="edtl-heure">${x.debut}<small>${x.fin}</small></span><span class="edtl-txt"><strong>${escapeHtml(x.matiere)}</strong></span></li>`); });
  openModal(`Emploi du temps — ${e.prenom} (${classeName(e.classeId)})`, `
    <div class="segmente edt-jours" role="tablist" aria-label="Jour" style="margin-bottom:10px;">${jours.map(x => `<button type="button" role="tab" class="seg${x.j === choisi.j ? ' actif' : ''}" aria-selected="${x.j === choisi.j}" onclick="ouvrirEmploiTempsParent('${e.id}','${x.j}')">${x.j.slice(0, 3)}${x.iso === auj ? '<span class="edt-auj" aria-label="aujourd’hui"></span>' : ''}</button>`).join('')}</div>
    <ul class="edtl-liste">${lignes.join('')}</ul>`);
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
    ${renderAccueilParentApp(mesEnfants)}
    ${renderAnnonceDuMoment()}
    <div class="em-rise" style="--i:1">
      <div class="role-etiquette">${titreTableauDeBord('parent')}</div>
      <h2 class="parent-greeting">${escapeHtml(salutation())} <span class="salut-main em-wave">${window.EmIcones ? EmIcones.svg('hand') : '👋'}</span></h2>
      <p class="parent-greeting-sub">Voici la semaine de ${plusieurs ? 'vos enfants' : 'votre enfant'}.</p>
      ${renderQuestionAppel()}
    </div>
    ${renderAlerteAbsence(mesEnfants)}<div class="abs-justif-zone">${renderAbsencesAJustifier(mesEnfants)}</div>
    ${renderRappelScolariteParent(mesEnfants)}
    ${renderBienvenueParent(mesEnfants)}
    ${barreRubriques([
      rubrique('p-jour', 'Aujourd’hui', 'Aujourd’hui', 'sun', renderAujourdhuiParent(mesEnfants)),
      rubrique('p-enfants', plusieurs ? 'Mes enfants' : 'Mon enfant', plusieurs ? 'Mes enfants' : 'Mon enfant', 'users', `<div class="enfants${plusieurs ? ' enfants--carrousel' : ''}">${mesEnfants.map(renderFicheEnfant).join('')}</div>`, () => plusieurs ? String(mesEnfants.length) : ''),
      rubrique('p-devoirs', 'Devoirs', 'Devoirs', 'book', `<div id="secDevoirs">${renderDevoirsParent(mesEnfants)}</div>`),
      { id: 'p-absence', court: 'Absence', titre: 'Signaler une absence à l’avance', ic: 'calendar', action: 'ouvrirSignalerAbsence()' },
      { id: 'p-permission', court: 'Permission', titre: 'Demander une permission (sortie avant l’heure…)', ic: 'hand', action: 'permOuvrirParent()' },
      { id: 'p-document', court: 'Document', titre: 'Demander un document', ic: 'file-text', action: 'ouvrirDemandeDocument()' },
    ], { titre: 'C’est vous seul qui voyez ces informations', sous: 'Aucun autre parent n’y a accès.', ic: 'lock' })}
    ${renderBandeDefilanteParent()}
    ${barreRubriques([
      rubrique('p-menu', 'Menu cantine', 'Menu de la cantine', 'shopping-bag', `<div id="secMenu">${renderMenuParent()}</div>`),
      rubrique('p-agenda', 'Agenda', 'Agenda de l’école', 'calendar-days', `<div id="secAgenda">${renderAgendaParent()}</div>`),
      rubrique('p-nouvelles', 'Nouvelles', 'Informations de l’école', 'bell', renderInformationsPassees()),
      rubrique('p-honneur', 'Honneur', 'Tableau d’honneur', 'trophy', renderTableauHonneurParent()),
      { id: 'p-photos', court: 'Photos', titre: 'Photos et nouvelles de l’école', ic: 'camera', action: "navParent('vie')" },
      rubrique('p-contact', 'Contacter', 'Contacter l’école', 'mail', renderContactEcole()),
    ], { titre: 'Informations publiques de l’école', sous: 'Les mêmes pour tous les parents.', ic: 'school' })}
    <div hidden>
    </div>
  </div>`;
}
/* ---------- Parent : rappel de scolarité (dès le 25 pour le mois suivant), avec bip une fois par jour ----------
   Jamais tant que l'école n'a saisi aucun versement (sinon tout le monde paraîtrait « à payer » à tort). */
/* ---------- Parent : payer une tranche par Mobile Money (PayDunya) ----------
   Le serveur vérifie que l'enfant est relié au parent, que la tranche existe et calcule
   lui-même le reste dû ; la page de paiement est celle de PayDunya (sécurisée). */
function chargerPaiementEnLigneParent(){
  if(DB.paiementEnLigne !== undefined) return;
  DB.paiementEnLigne = null;
  sb.from('paiement_en_ligne_config_lecture').select('actif, prestataire').maybeSingle()
    .then(({ data }) => { DB.paiementEnLigne = data || { actif:false, prestataire:'' }; if(DB.paiementEnLigne.actif && ui.role === 'parent' && !['vie', 'services'].includes(ui.vueParent)) $('#viewContainer').innerHTML = renderParentDashboard(); }, () => { DB.paiementEnLigne = { actif:false }; });
}
function versementsSaisisParent(){
  if(DB.versementsSaisis !== undefined) return;
  DB.versementsSaisis = null;
  sb.rpc('ecole_a_des_versements').then(({ data }) => { DB.versementsSaisis = data === true; if(DB.versementsSaisis && ui.role === 'parent' && !['vie', 'services'].includes(ui.vueParent)) $('#viewContainer').innerHTML = renderParentDashboard(); }, () => { DB.versementsSaisis = false; });
}
function boutonPayerEnLigne(e, d){
  if(ui.role !== 'parent') return '';
  chargerPaiementEnLigneParent();
  versementsSaisisParent();
  if(!DB.paiementEnLigne?.actif || DB.versementsSaisis !== true || d.statut === 'paye') return '';
  const reste = Math.max(0, (d.montant || 0) - (d.paye || 0)); if(reste < 100) return '';
  return ` <button type="button" class="btn sm btn-momo" onclick="payerEnLigneParent('${e.id}', ${escapeHtml(JSON.stringify(d.label))}, ${reste})">${icone('smartphone')} Payer ${fmtFCFA(reste)} par Mobile Money</button>`;
}
async function payerEnLigneParent(eleveId, tranche, reste){
  const e = eleveById(eleveId) || (DB.eleves || []).find(x => x.id === eleveId);
  if(!confirm(`Payer ${fmtFCFA(reste)} pour « ${tranche} » de ${e ? e.prenom : 'votre enfant'} ?\n\nVous allez sur la page sécurisée PayDunya : choisissez Orange Money, MTN, Moov ou Wave, puis validez sur votre téléphone. L’argent va directement à l’école.`)) return;
  toast('Ouverture de la page de paiement…');
  try{
    const { data, error } = await sb.functions.invoke('initier-paiement-en-ligne', { body: { eleveId, tranche } });
    if(error) throw new Error(await messageErreurFonction(error));
    if(!data?.ok || !data.url) throw new Error(data?.error || 'Le paiement n’a pas pu être préparé');
    try{ sessionStorage.setItem('ecomaz_paiement_en_cours', JSON.stringify({ eleveId, tranche, montant: data.montant || reste })); }catch(_e){}
    if(!adressePaiementSure(data.url)) throw new Error('Adresse de paiement inattendue : paiement annulé par sécurité.');
    window.location.href = data.url;
  }catch(err){ alert('Paiement impossible pour le moment : ' + err.message + '\nVous pouvez aussi payer au secrétariat.'); }
}
// Retour de la page PayDunya (?paiement=retour ou annule)
(function retourPaiementParent(){
  try{
    const etat = new URLSearchParams(location.search).get('paiement'); if(!etat) return;
    const u = new URL(location.href); u.searchParams.delete('paiement'); history.replaceState(null, '', u.toString());
    setTimeout(() => {
      if(etat === 'retour') toast('Merci ! Votre paiement est en cours de confirmation : vous recevrez le reçu dans quelques instants (notification et Messages).');
      else toast('Paiement annulé : rien n’a été prélevé. Vous pouvez réessayer quand vous voulez.');
    }, 1500);
  }catch(_e){}
})();
function renderRappelScolariteParent(enfants){
  if(!DB.meta?.scolariteVisibleParents) return '';
  if(DB.versementsSaisis === undefined){ versementsSaisisParent(); return ''; }
  if(DB.versementsSaisis !== true) return '';
  const auj = todayISO(), jour = Number(auj.slice(8, 10)), moisCourant = auj.slice(0, 7);
  const moisSuivant = (([a, m]) => m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, '0')}`)(auj.split('-').map(Number));
  const lignes = [];
  enfants.forEach(e => (scolariteEleveParEcheance(e.id).detail || []).forEach(d => {
    if(d.statut === 'paye' || !d.dateEcheance) return;
    const mois = d.dateEcheance.slice(0, 7), ecart = Math.round((new Date(d.dateEcheance + 'T12:00:00') - new Date(auj + 'T12:00:00')) / 86400000);
    if((mois === moisCourant && ecart >= -7) || (mois === moisSuivant && jour >= 25)) lignes.push({ e, d, reste: Math.max(0, (d.montant || 0) - (d.paye || 0)), ecart });
  }));
  if(!lignes.length) return '';
  // Bip une fois par jour (après un premier toucher si le téléphone l'exige)
  try{ const cle = 'ecomaz_bip_scol_' + auj; if(localStorage.getItem(cle) !== '1'){ localStorage.setItem(cle, '1'); setTimeout(() => { if(!bipDoux()) document.addEventListener('pointerdown', () => bipDoux(), { once: true }); }, 400); } }catch(_e){}
  return `<section class="panel rappel-scol" aria-label="Scolarité à régler">
    <div class="rappel-scol-tete">${icone('wallet')}<strong>Scolarité à régler</strong></div>
    <ul>${lignes.map(({ e, d, reste, ecart }) => `<li><strong>${escapeHtml(e.prenom)}</strong> — tranche « ${escapeHtml(d.label)} » : <strong>${fmtFCFA(reste)}</strong>
      ${ecart > 0 ? `à régler avant le ${fmtDate(d.dateEcheance)}` : ecart === 0 ? `<span class="rs-urgent">à régler aujourd’hui</span>` : `<span class="rs-urgent">échéance dépassée (${fmtDate(d.dateEcheance)})</span>`}${boutonPayerEnLigne(e, d)}</li>`).join('')}</ul>
    <div class="hint" style="margin:6px 0 0;">${DB.paiementEnLigne?.actif ? 'Payez par Mobile Money (Orange, MTN, Moov, Wave) ou au secrétariat.' : 'Vous pouvez payer dès maintenant au secrétariat.'} Déjà payé ? L’école le mettra à jour à réception.</div>
  </section>`;
}
// Bip court et agréable (2 tons) pour les rappels de scolarité des parents
function bipDoux(){
  if(navigator.vibrate) try{ navigator.vibrate([300, 120, 300]); }catch(_e){}
  try{
    if(!audioRappel){ const C = window.AudioContext || window.webkitAudioContext; if(!C) return false; audioRappel = new C(); }
    if(audioRappel.state === 'suspended') audioRappel.resume();
    if(audioRappel.state !== 'running') return false;
    const t0 = audioRappel.currentTime;
    [[0, 880], [0.25, 1175]].forEach(([dt, fq]) => {
      const o = audioRappel.createOscillator(), g = audioRappel.createGain(); o.type = 'sine'; o.frequency.value = fq;
      g.gain.setValueAtTime(0.0001, t0 + dt); g.gain.exponentialRampToValueAtTime(0.4, t0 + dt + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dt + 0.22);
      o.connect(g); g.connect(audioRappel.destination); o.start(t0 + dt); o.stop(t0 + dt + 0.24);
    });
    return true;
  }catch(_e){ return false; }
}
if('serviceWorker' in navigator) navigator.serviceWorker.addEventListener('message', ev => {
  if(ev.data && ev.data.type === 'rappel-scolarite' && ui.role === 'parent'){ bipDoux(); if(!['vie', 'services'].includes(ui.vueParent)) $('#viewContainer').innerHTML = renderParentDashboard(); }
});
// Première ouverture : ce que le parent trouve ici et les 3 gestes utiles (fermé par « J'ai compris »)
function renderBienvenueParent(enfants){
  const cle = 'ecomaz_bienvenue_parent_' + (session.userId || '');
  try{ if(localStorage.getItem(cle)) return ''; }catch(_e){ return ''; }
  const prenoms = enfants.length <= 3 ? enfants.map(e => e.prenom).join(', ') : `${enfants.slice(0, 2).map(e => e.prenom).join(', ')} et ${enfants.length - 2} autres`;
  const pushAProposer = typeof pushPossible === 'function' && pushPossible() && Notification.permission === 'default';
  const gestes = [
    ['bell', 'Recevoir les alertes', 'Absence, retard, devoir, paiement : vous êtes prévenu(e) sur ce téléphone.', pushAProposer ? "activerPush(false).then(ok => { if(ok) toast('Alertes activées sur ce téléphone'); })" : null],
    ['calendar', 'Signaler une absence', 'Prévenez l’école à l’avance : l’enseignant(e) est informé(e).', 'ouvrirSignalerAbsence()'],
    ['mail', 'Écrire à l’école', 'Une question ? Le secrétariat vous répond ici.', "navParent('msg')"],
  ].filter(g => g[3]);
  return `<div class="panel premiers-pas em-rise" style="--i:2">
    <div class="panel-head"><div><h2>Bienvenue dans l’application de ${escapeHtml(DB.meta?.nomEcole || 'l’école')}</h2>
      <div class="sub">Vous suivez ici ${enfants.length > 1 ? 'vos enfants' : 'votre enfant'} (${escapeHtml(prenoms)}) : présences, devoirs, bulletins, scolarité et nouvelles de l’école.</div></div>
      <button type="button" class="btn secondary sm" onclick="try{localStorage.setItem('${cle}','1')}catch(_e){}; $('#viewContainer').innerHTML = renderParentDashboard()">J’ai compris</button></div>
    <div class="pp-grille">${gestes.map(([ic, t, d, act], i) => `<button type="button" class="pp-geste" onclick="${act}">
      <span class="pp-num">${i + 1}</span><span class="pp-txt"><strong>${(window.EmIcones ? EmIcones.svg(ic) : '')} ${t}</strong><small>${d}</small></span></button>`).join('')}</div>
    <div class="hint" style="margin-bottom:0;">Astuce : installez l’application (menu ⋮ de Chrome → « Installer l’application », ou sur iPhone : Partager → « Sur l’écran d’accueil ») pour l’ouvrir d’un seul geste.</div>
  </div>`;
}
const NAV_PARENT = [
  {id:'accueil', ic:'house', lib:'Accueil'},
  {id:'msg', ic:'mail', lib:'Messages'},
  {id:'services', ic:'sparkles', lib:'Services', fab:true},
  {id:'vie', ic:'camera', lib:'Vie de l’école'},
  {id:'profil', ic:'user', lib:'Profil'},
];
function renderNavParent(actif){
  const idx = Math.max(0, NAV_PARENT.findIndex(n => n.id === actif));
  const nbMsg = (DB.messagesInternes||[]).filter(m=>!m.lu && m.destinataireType !== 'ecole').length;
  return `<div class="pn-pastille" style="transform:translateX(${idx*100}%)" aria-hidden="true"></div>
    ${NAV_PARENT.map((n, i) => `<button type="button" class="pn-item em-press${n.fab ? ' pn-fab' : ''}${i === idx ? ' actif' : ''}" ${i === idx ? 'aria-current="page"' : ''} onclick="navParent('${n.id}', event)">
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
    if(ui.vueParent === 'vie' || ui.vueParent === 'services'){ ui.vueParent = 'accueil'; $('#viewContainer').innerHTML = renderParentDashboard(); }
    window.scrollTo({top:0, behavior: (window.EmMotion && EmMotion.prefersReducedMotion()) ? 'auto' : 'smooth'});
  }
  else if(id === 'vie'){ ui.vueParent = 'vie'; $('#viewContainer').innerHTML = renderFilParent(); window.scrollTo({top:0}); demarrerFil(); }
  else if(id === 'msg' || id === 'sugg'){ window.scrollTo({top:0}); toggleBulle(id); }
  else if(id === 'objets'){ ouvrirObjetsPerdus(); }
  else if(id === 'services'){ ui.vueParent = 'services'; $('#viewContainer').innerHTML = renderServicesParent(); window.scrollTo({ top: 0 }); }
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
      date_constat: fd.get('dateConstat'), parent_nom: signatureAuteur(),
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
      ${window.choisirTailleTexte ? `<div class="profil-sous">Taille du texte</div>
      <div class="segmente profil-texte" role="group" aria-label="Taille du texte">${[['normal', 'Normale'], ['grand', 'Grande'], ['tres-grand', 'Très grande']].map(([v, l]) => `<button type="button" class="seg${(window.tailleTexteActuelle ? window.tailleTexteActuelle() : 'normal') === v ? ' actif' : ''}" onclick="choisirTailleTexte('${v}'); this.parentElement.querySelectorAll('.seg').forEach(b => b.classList.toggle('actif', b === this))">${l}</button>`).join('')}</div>` : ''}
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
    const { data, error } = await sb.from('messages_internes').insert({ destinataire_type: 'ecole', eleve_id: fd.get('eleveId'), contenu: fd.get('contenu').trim(), auteur_nom: signatureAuteur() }).select().single();
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
    auteur_nom: signatureAuteur(),
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
      contenu, auteur_nom: signatureAuteur(), auteur_role: ui.role || '',
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
