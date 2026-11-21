/* =====================================================================
   POINTAGE DEPUIS L'APPLICATION — le GPS est déterminant (20/11/2026)
   L'enseignant pointe lui-même : GPS, scan de l'affiche QR de l'école,
   photo en direct. La décision est prise par le SERVEUR (fonction Edge
   « pointer-presence ») : hors de l'établissement → refus, enregistré et
   signalé à la direction. Même vérification avant l'appel des élèves.
   ===================================================================== */
function monPointageDuJour(){ return (DB.presencesEnseignants || []).find(p => p.enseignantId === session.enseignantId && p.date === todayISO()) || null; }
function zonePointageConfiguree(){ const m = DB.meta || {}; return m.geofenceLatitude != null && m.geofenceLongitude != null; }
function renderMonPointage(){
  const r = monPointageDuJour(), m = DB.meta || {};
  const action = !r || !r.heureArrivee ? 'arrivee' : !r.heureDepart ? 'depart' : null;
  const etat = `<div class="pt-etat">
      <div class="pt-case${r?.heureArrivee ? ' fait' : ''}"><small>Arrivée</small><strong>${r?.heureArrivee ? escapeHtml(String(r.heureArrivee).slice(0, 5)) : '—'}</strong>${r?.heureArrivee ? `<span class="kp-badge ${r.statut === 'Retard' ? 'kp-retard' : 'kp-ok'}">${r.statut === 'Retard' ? `Retard${r.minutesRetard ? ' · ' + r.minutesRetard + ' min' : ''}` : 'À l’heure'}</span>` : ''}</div>
      <div class="pt-case${r?.heureDepart ? ' fait' : ''}"><small>Départ</small><strong>${r?.heureDepart ? escapeHtml(String(r.heureDepart).slice(0, 5)) : '—'}</strong></div></div>`;
  if(!zonePointageConfiguree()) return etat + `<div class="kp-vide">${icone('map-pin')}La zone de l’établissement n’est pas encore configurée : le pointage depuis l’application sera possible dès que la direction l’aura enregistrée (Paramètres).</div>`;
  if(!action) return etat + `<div class="kp-vide kp-vide-ok">${icone('circle-check')}Votre journée est pointée. Bonne fin de journée !</div>`;
  const carte = (meth, ic, fam, titre, sous) => `<button type="button" class="pt-methode" onclick="pointerPresence('${meth}', '${action}')">${iconeService(ic, fam)}<span class="pt-m-texte"><strong>${titre}</strong><small>${sous}</small></span></button>`;
  return etat + `<div class="pt-titre">Pointer ${action === 'arrivee' ? 'mon arrivée' : 'mon départ'} :</div>
    <div class="pt-methodes">
      ${carte('gps', 'map-pin', 'menthe', 'Par GPS', 'Un toucher, depuis l’école')}
      ${carte('qr', 'smartphone', 'indigo', 'Scanner le QR de l’école', 'L’affiche de pointage')}
      ${carte('photo', 'camera', 'ocean', 'Par photo', 'Caméra avant, en direct')}
    </div>
    <p class="pt-note">${icone('lock')}<span>Le pointage n’est accepté que <strong>dans l’enceinte de l’établissement</strong> (zone de ${m.geofenceRayonMetres || 100} m), vérifiée par le GPS du téléphone. Toute tentative refusée est signalée automatiquement à la direction.</span></p>`;
}
// La MEILLEURE position lue pendant quelques secondes (le GPS se précise au fil des
// lectures, surtout à l'intérieur) : arrêt dès ± 30 m, sinon au bout de 12 s.
function obtenirPosition(){
  return new Promise(res => {
    if(!navigator.geolocation) return res({ erreurGps: 'géolocalisation non disponible' });
    let meilleure = null, fini = false, id = null;
    const finir = (r) => { if(fini) return; fini = true; if(id != null) navigator.geolocation.clearWatch(id); clearTimeout(minuterie); res(r); };
    const minuterie = setTimeout(() => finir(meilleure || { erreurGps: 'délai dépassé' }), 12000);
    id = navigator.geolocation.watchPosition(
      p => { const c = { latitude: p.coords.latitude, longitude: p.coords.longitude, precision: p.coords.accuracy };
        if(!meilleure || c.precision < meilleure.precision) meilleure = c;
        if(c.precision <= 30) finir(meilleure); },
      e => { if(e.code === 1 || !meilleure) finir(meilleure || { erreurGps: e.code === 1 ? 'autorisation refusée' : e.code === 3 ? 'délai dépassé' : 'position introuvable' }); },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 });
  });
}
async function appelPointage(corps){
  if(navigator.onLine === false) return { ok: false, error: 'Pas de réseau : le pointage a besoin d’internet. Réessayez dès que le réseau revient.' };
  const { data, error } = await sb.functions.invoke('pointer-presence', { body: corps });
  if(error) return { ok: false, error: await messageErreurFonction(error) };
  return data || { ok: false, error: 'Réponse vide du serveur' };
}
// Caméra (QR ou photo) : arrêtée dès que la fenêtre se ferme
let cameraPointage = null;
function arreterCameraPointage(){ if(cameraPointage){ cameraPointage.actif = false; cameraPointage.flux?.getTracks().forEach(t => t.stop()); cameraPointage.fin?.(null); cameraPointage = null; } }
async function ouvrirCameraPointage(titre, consigne, avant){
  openModal(titre, `<div class="pt-camera"><video id="ptVideo" playsinline muted autoplay></video><div class="pt-viseur${avant ? ' rond' : ''}" aria-hidden="true"></div><div class="pt-compte" id="ptCompte" aria-live="polite"></div></div>
    <p class="pt-consigne" id="ptConsigne">${consigne}</p><div class="form-actions"><button type="button" class="btn secondary" onclick="closeModal()">Annuler</button></div>`);
  try{
    const flux = await navigator.mediaDevices.getUserMedia({ video: { facingMode: avant ? 'user' : 'environment', width: { ideal: 1280 } }, audio: false });
    const v = document.getElementById('ptVideo'); if(!v){ flux.getTracks().forEach(t => t.stop()); return null; }
    v.srcObject = flux; await v.play().catch(() => {});
    return { flux, video: v };
  }catch(_e){
    const c = document.getElementById('ptConsigne'); if(c) c.textContent = 'Caméra indisponible : autorisez la caméra pour EcoMaZ dans le navigateur, puis réessayez.';
    return null;
  }
}
function scannerQrEcole(){
  return new Promise(async fin => {
    arreterCameraPointage();
    const cam = await ouvrirCameraPointage('Scanner le QR de l’école', 'Visez l’affiche « Pointage EcoMaZ » de l’école. Le pointage part tout seul dès que le code est lu.', false);
    if(!cam){ return fin(null); }
    cameraPointage = { ...cam, actif: true, fin };
    const cv = document.createElement('canvas'), ctx = cv.getContext('2d', { willReadFrequently: true });
    const boucle = () => {
      if(!cameraPointage?.actif) return;
      const v = cam.video;
      if(v.readyState >= 2 && v.videoWidth){
        cv.width = Math.min(720, v.videoWidth); cv.height = Math.round(cv.width * v.videoHeight / v.videoWidth);
        ctx.drawImage(v, 0, 0, cv.width, cv.height);
        const code = window.jsQR ? jsQR(ctx.getImageData(0, 0, cv.width, cv.height).data, cv.width, cv.height, { inversionAttempts: 'dontInvert' }) : null;
        if(code?.data){
          if(code.data.startsWith('ECOMAZ-POINTAGE:')){ const j = code.data.slice(16); const f = cameraPointage.fin; cameraPointage.fin = null; arreterCameraPointage(); return f(j); }
          const c = document.getElementById('ptConsigne'); if(c) c.textContent = 'Ce QR code n’est pas l’affiche de pointage de l’école. Visez l’affiche « Pointage EcoMaZ ».';
        }
      }
      requestAnimationFrame(boucle);
    };
    requestAnimationFrame(boucle);
  });
}
function prendrePhotoPointage(){
  return new Promise(async fin => {
    arreterCameraPointage();
    const cam = await ouvrirCameraPointage('Pointage par photo', 'Placez votre visage dans le cercle : la photo est prise automatiquement.', true);
    if(!cam){ return fin(null); }
    cameraPointage = { ...cam, actif: true, fin };
    for(let n = 3; n >= 1; n--){
      const z = document.getElementById('ptCompte'); if(!z || !cameraPointage?.actif) return;
      z.textContent = n; await new Promise(r => setTimeout(r, 1000));
    }
    if(!cameraPointage?.actif) return;
    const v = cam.video, cv = document.createElement('canvas');
    cv.width = Math.min(640, v.videoWidth || 640); cv.height = Math.round(cv.width * (v.videoHeight || 480) / (v.videoWidth || 640));
    cv.getContext('2d').drawImage(v, 0, 0, cv.width, cv.height);
    const photo = cv.toDataURL('image/jpeg', 0.72);
    const f = cameraPointage.fin; cameraPointage.fin = null; arreterCameraPointage(); f(photo);
  });
}
let pointageEnCours = false;
async function pointerPresence(methode, action){
  if(pointageEnCours) return; pointageEnCours = true;
  try{
    const position = obtenirPosition();  // lue pendant le scan ou la photo
    const extra = {};
    if(methode === 'qr'){ const j = await scannerQrEcole(); if(j == null) return; extra.jeton = j; }
    if(methode === 'photo'){ const ph = await prendrePhotoPointage(); if(ph == null) return; extra.photo = ph; }
    openModal('Pointage', `<div class="pt-attente">${icone('map-pin')}<strong>Vérification de votre position…</strong><span>Restez dans l’école : le GPS du téléphone est en cours de lecture.</span></div>`);
    const r = await appelPointage({ methode, action, ...extra, ...(await position) });
    afficherResultatPointage(r, action);
  } finally { pointageEnCours = false; }
}
function afficherResultatPointage(r, action){
  const lib = action === 'depart' ? 'Départ' : 'Arrivée';
  if(r?.ok){
    if(!r.deja){
      let rec = monPointageDuJour();
      if(!rec){ rec = { id: 'local-' + Date.now(), enseignantId: session.enseignantId, date: todayISO(), motif: '' }; DB.presencesEnseignants.push(rec); }
      if(action === 'depart') rec.heureDepart = r.heure;
      else { rec.heureArrivee = r.heure; rec.statut = r.statut; rec.minutesRetard = r.minutesRetard; }
    }
    const detail = action === 'depart' ? '' : r.statut === 'Retard' ? ` — en retard de ${r.minutesRetard} min` : r.deja ? '' : ' — à l’heure';
    openModal('Pointage enregistré', `<div class="pt-resultat ok">${icone('circle-check')}<strong>${lib} ${r.deja ? 'déjà enregistrée' : 'enregistrée'} à ${escapeHtml(r.heure || '')}${escapeHtml(detail)}</strong>
      ${r.distanceMetres != null ? `<span>Position vérifiée dans l’établissement (à ${r.distanceMetres} m du point de l’école).</span>` : ''}</div>
      <div class="form-actions"><button type="button" class="btn" onclick="closeModal(); renderView('dashboard')">Fermer</button></div>`);
    if(navigator.vibrate) try{ navigator.vibrate(30); }catch(_e){}
    return;
  }
  if(r?.refuse){
    const suspect = r.gravite !== 'technique';
    openModal(suspect ? 'Pointage refusé' : 'Pointage non abouti', `<div class="pt-resultat refuse">${icone(suspect ? 'circle-x' : 'map-pin')}<strong>${suspect ? 'Pointage refusé' : 'Votre position n’a pas pu être confirmée'}</strong><span>${escapeHtml(r.raison || '')}</span>
      <span class="pt-prevenu">${icone('bell')} ${suspect ? 'La direction a été prévenue automatiquement de cette tentative.' : 'La direction est informée de cet essai, sans soupçon de fraude. Réessayez.'}</span></div>
      <ul class="pt-aide"><li>Pointez depuis l’intérieur de l’école (cour, bureau).</li><li>Activez la localisation du téléphone, en « haute précision ».</li><li>À l’intérieur d’un bâtiment, approchez-vous d’une fenêtre ou sortez dans la cour, puis réessayez.</li></ul>
      <div class="form-actions"><button type="button" class="btn" onclick="closeModal()">Fermer</button></div>`);
    return;
  }
  openModal('Pointage impossible', `<div class="pt-resultat refuse">${icone('triangle-alert')}<strong>Le pointage n’a pas pu être fait</strong><span>${escapeHtml(r?.error || 'Erreur inconnue')}</span></div>
    <div class="form-actions"><button type="button" class="btn" onclick="closeModal()">Fermer</button></div>`);
}
// Appel des élèves : position vérifiée dans l'école (enseignant, secrétariat) — le serveur refuse sinon
let positionAppelOk = 0;
async function verifierPositionAvantAppel(classeId){
  if(!['enseignant', 'secretariat'].includes(ui.role) || !zonePointageConfiguree()) return true;
  if(Date.now() - positionAppelOk < 20 * 60 * 1000) return true;
  if(navigator.onLine === false) return true; // l'appel part au retour du réseau ; le serveur le vérifie alors
  toast('Vérification de votre position dans l’école…');
  const pos = await obtenirPosition();
  const r = await appelPointage({ methode: 'appel', classeId, ...pos });
  if(r?.ok){ positionAppelOk = Date.now(); return true; }
  openModal('Appel refusé', `<div class="pt-resultat refuse">${icone('circle-x')}<strong>Les élèves ne peuvent être notés présents que depuis l’établissement</strong><span>${escapeHtml(r?.raison || r?.error || '')}</span>
    ${r?.refuse ? `<span class="pt-prevenu">${icone('bell')} ${r.gravite !== 'technique' ? 'La direction a été prévenue automatiquement de cette tentative.' : 'La direction est informée de cet essai, sans soupçon de fraude. Réessayez.'}</span>` : ''}</div>
    <ul class="pt-aide"><li>Faites l’appel depuis la classe ou la cour de l’école.</li><li>Activez la localisation du téléphone, en « haute précision ».</li><li>Vous pouvez toujours noter les absents : seuls « Présent » et « Retard » demandent la vérification.</li></ul>
    <div class="form-actions"><button type="button" class="btn" onclick="closeModal()">Fermer</button></div>`);
  return false;
}
// Direction : tentatives refusées (7 derniers jours)
const LIB_METHODE_POINTAGE = { gps: 'GPS', qr: 'QR de l’école', photo: 'Photo', appel: 'Appel des élèves', lien: 'Lien GPS' };
function alertesPointageRecentes(){
  const depuis = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
  return (DB.alertesPointage || []).filter(a => a.date >= depuis).sort((a, b) => (b.date + (b.heure || '')).localeCompare(a.date + (a.heure || '')));
}
function renderAlertesPointageDirection(){
  const l = alertesPointageRecentes();
  if(!l.length) return `<div class="kp-vide kp-vide-ok">${icone('circle-check')}Aucune tentative de pointage refusée ces 7 derniers jours.</div>`;
  return `<p class="pt-note" style="margin:4px 0 10px;">${icone('bell')}<span>Chaque tentative refusée (hors de l’établissement, position douteuse, QR non reconnu, appel fait hors de l’école) arrive ici et en notification sur le téléphone de la direction.</span></p>
    <div class="kp-liste">${l.map(a => {
      const nom = a.auteurNom || (a.enseignantId ? ensFullName(enseignantById(a.enseignantId)) : 'Personnel');
      const carte = a.latitude != null && a.longitude != null ? `<a class="btn secondary sm" href="https://www.google.com/maps?q=${Number(a.latitude)},${Number(a.longitude)}" target="_blank" rel="noopener">${icone('map-pin')} Carte</a>` : '';
      const photo = a.photoChemin ? `<button type="button" class="btn secondary sm" onclick="voirPhotoPointage(${jsArg(a.photoChemin)})">${icone('camera')} Photo</button>` : '';
      const suspect = a.gravite !== 'technique';
      return `<div class="kp-ligne pt-alerte"><span class="kp-avatar ${suspect ? 'pt-avatar-alerte' : 'pt-avatar-technique'}" aria-hidden="true">${escapeHtml(initialesNom(nom))}</span>
        <div class="kp-qui"><strong>${escapeHtml(nom)} <span class="kp-badge ${suspect ? 'kp-absent' : 'kp-attente'}">${suspect ? 'Suspect' : 'Position incertaine'}</span></strong><small>${a.type === 'appel' ? 'Appel des élèves' : `Pointage enseignant · ${escapeHtml(LIB_METHODE_POINTAGE[a.methode] || 'Badge')}`} · ${escapeHtml(fmtDate(a.date))} à ${escapeHtml(String(a.heure || '').slice(0, 5))}${a.classeId ? ' · ' + escapeHtml(classeName(a.classeId)) : ''}</small>
          <span class="${suspect ? 'pt-raison' : 'pt-raison pt-raison-technique'}">${escapeHtml(a.raison || '')}</span></div>
        <div class="kp-droite">${carte}${photo}</div></div>`; }).join('')}</div>`;
}
async function voirPhotoPointage(chemin){
  const { data, error } = await sb.storage.from('pointages').createSignedUrl(chemin, 300);
  if(error || !data?.signedUrl){ toast('Photo indisponible'); return; }
  openModal('Photo prise au pointage', `<img src="${escapeHtml(data.signedUrl)}" alt="Photo prise au moment du pointage" style="display:block;max-width:100%;margin:0 auto;border-radius:16px;">`);
}
let alertesRelues = 0;
function rafraichirAlertesPointage(){
  if(!['direction', 'fondation', 'secretariat'].includes(ui.role) || Date.now() - alertesRelues < 60000 || navigator.onLine === false) return;
  alertesRelues = Date.now();
  sb.from('alertes_pointage').select('*').eq('ecole_id', session.ecoleId).order('created_at', { ascending: false }).limit(200).then(({ data, error }) => {
    if(error || !data) return;
    const avant = (DB.alertesPointage || []).length;
    DB.alertesPointage = rowsToCamel(data);
    if(DB.alertesPointage.length !== avant && ui.currentView === 'dashboard' && !document.querySelector('.modal-backdrop.open')) renderView('dashboard');
  });
}
// Paramètres : l'affiche QR de pointage à imprimer
async function imprimerAfficheQrPointage(renouveler){
  if(renouveler && !confirm('Créer une nouvelle affiche ? L’ancienne ne fonctionnera plus : il faudra imprimer et afficher la nouvelle.')) return;
  const { data: jeton, error } = await sb.rpc(renouveler ? 'renouveler_jeton_qr_pointage' : 'jeton_qr_pointage');
  if(error || !jeton){ toast('Affiche indisponible : ' + (error?.message || 'réessayez')); return; }
  let qr = ''; try{ const q = qrcode(0, 'M'); q.addData('ECOMAZ-POINTAGE:' + jeton); q.make(); qr = q.createSvgTag({ cellSize: 8, margin: 2, scalable: true }); }catch(_e){}
  const m = DB.meta || {};
  openModal('Affiche de pointage', `<div class="pt-affiche"><div class="pt-affiche-ecole">${escapeHtml(m.nomEcole || 'École')}</div><h2>Pointage EcoMaZ</h2>
    <div class="pt-affiche-qr">${qr}</div>
    <p><strong>Enseignants :</strong> ouvrez EcoMaZ → Accueil → <strong>Mon pointage</strong> → « Scanner le QR de l’école », et visez ce code.</p>
    <p class="pt-affiche-petit">Le pointage n’est accepté que dans l’enceinte de l’établissement (GPS du téléphone). Une photo de cette affiche ne permet pas de pointer depuis l’extérieur.</p></div>
    <div class="form-actions no-print"><button type="button" class="btn secondary" onclick="closeModal()">Fermer</button><button type="button" class="btn" onclick="window.print()">${icone('printer')} Imprimer l’affiche</button></div>`);
}
function rubriqueActive(){ try{ return localStorage.getItem('ecomaz_rubrique_active') || ''; }catch(_e){ return ''; } }
function rubrique(id, court, titre, ic, html, indic){
  if(!html || !String(html).trim()) return null;
  return { id, court, titre, ic, html, info: typeof indic === 'function' ? indic(html) : (indic || '') };
}
// Couleur (mêmes familles que « Nos services ») et petite description de chaque onglet
const STYLE_RUBRIQUES = { afaire: ['menthe', 'Aujourd’hui'], suivi: ['indigo', 'Appels, relances'], dates: ['ocean', 'Agenda à venir'], treso: ['menthe', 'Entrées, sorties'],
  miseenroute: ['nuit', 'Étapes de départ'], journee: ['ocean', 'Mes cours'], surveiller: ['indigo', 'Absences répétées'], anniv: ['menthe', 'Cette semaine'],
  bilan: ['nuit', 'Résumé à partager'], repartition: ['ocean', 'Effectifs'], ensemble: ['indigo', 'Classe par classe'],
  alertes: ['indigo', 'Tentatives refusées'],
  // Enseignant
  pointage: ['menthe', 'GPS, QR, photo'], cours: ['ocean', 'Ma frise du jour'], jour: ['menthe', 'Chaque jour de classe'], semaine: ['indigo', 'Rattrapages, devoirs'], mois: ['ocean', 'Régularité, programme'],
  trimestre: ['nuit', 'Compositions, bulletins'], outils: ['menthe', 'Toutes mes pages'], inscription: ['indigo', 'Classes, horaires, collègues'],
  // Parent
  'p-jour': ['menthe', 'Présence du jour'], 'p-enfants': ['nuit', 'Fiches, scolarité, notes'], 'p-devoirs': ['ocean', 'Travail à la maison'], 'p-absence': ['indigo', 'Prévenir l’école'], 'p-document': ['nuit', 'Certificat de scolarité…'],
  'p-menu': ['menthe', 'Repas de la semaine'], 'p-agenda': ['indigo', 'Compositions, congés'], 'p-nouvelles': ['ocean', 'Informations passées'], 'p-honneur': ['nuit', 'Élèves à l’honneur'],
  'p-photos': ['menthe', 'Photos et nouvelles'], 'p-contact': ['indigo', 'Téléphone, adresse'] };
function barreRubriques(liste, opts){
  opts = opts || {};
  liste = liste.filter(Boolean); if(!liste.length) return '';
  const voulu = opts.ouvrir || rubriqueActive();
  const act = liste.some(r => r.id === voulu && !r.action) ? voulu : '';
  const onglet = r => `<button type="button" class="dbr-onglet${r.valeur != null ? ' dbr-chiffre' : ''}${r.id === act ? ' actif' : ''}" title="${escapeHtml(r.titre)}" ${r.action
      ? `onclick="${r.action}"`
      : `role="tab" id="ong-${r.id}" aria-selected="${r.id === act}" aria-controls="rub-${r.id}" onclick="basculerRubrique('${r.id}')"`}>
      ${iconeService(r.ic, r.fam || (STYLE_RUBRIQUES[r.id] || [])[0] || 'nuit')}${r.valeur != null
        ? `<span class="dbr-valeur">${escapeHtml(String(r.valeur))}</span><small class="dbr-sous dbr-libelle">${escapeHtml(r.court)}</small>`
        : `<span class="dbr-titre">${escapeHtml(r.court)}</span><small class="dbr-sous">${escapeHtml((STYLE_RUBRIQUES[r.id] || [])[1] || '')}</small>`}${r.info ? `<span class="dbr-indic">${escapeHtml(r.info)}</span>` : ''}</button>`;
  return `<section class="db-rubriques" aria-label="${escapeHtml(opts.titre || 'Rubriques')}">
    ${opts.titre ? `<div class="dbr-ligne-tete">${opts.ic ? icone(opts.ic) : ''}<div><h2>${escapeHtml(opts.titre)}</h2>${opts.sous ? `<span>${escapeHtml(opts.sous)}</span>` : ''}</div></div>` : ''}
    <div class="dbr-barre" role="tablist">${liste.map(onglet).join('')}</div>
    ${liste.filter(r => !r.action).map(r => `<div class="dbr-panneau" id="rub-${r.id}" role="tabpanel" aria-labelledby="ong-${r.id}"${r.id === act ? '' : ' hidden'}>
      <div class="dbr-panneau-tete"><h2><span class="dbr-ic" aria-hidden="true">${icone(r.ic) || ''}</span>${escapeHtml(r.titre)}</h2><button type="button" class="dbr-fermer" aria-label="Replier" onclick="basculerRubrique('${r.id}', false)">×</button></div>
      <div class="dbr-corps">${r.html}</div></div>`).join('')}
  </section>`;
}
function basculerRubrique(id, ouvrir){
  const p = document.getElementById('rub-' + id); if(!p) return;
  const ouvre = ouvrir === undefined ? p.hidden : ouvrir;
  document.querySelectorAll('.db-rubriques .dbr-panneau').forEach(x => { x.hidden = true; });
  document.querySelectorAll('.db-rubriques .dbr-onglet[role="tab"]').forEach(b => { b.classList.remove('actif'); b.setAttribute('aria-selected', 'false'); });
  if(ouvre){ p.hidden = false; const b = document.getElementById('ong-' + id); if(b){ b.classList.add('actif'); b.setAttribute('aria-selected', 'true'); b.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } }
  try{ localStorage.setItem('ecomaz_rubrique_active', ouvre ? id : ''); }catch(_e){}
}
// Un bouton qui renvoie à une rubrique l'ouvre d'abord
function ouvrirSection(idElement){
  const el = document.getElementById(idElement); if(!el) return;
  const p = el.closest('.dbr-panneau'); if(p) basculerRubrique(p.id.slice(4), true);
  (p || el).scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function renderDashboard(){
  if(ui.role === 'enseignant') return renderAccueilEnseignant();
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

  const prenom = (session.nomComplet || '').trim().split(/\s+/)[0] || '';
  const dateLongue = new Date(today + 'T12:00:00').toLocaleDateString('fr-FR', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
  return `
  <div class="view active">
    ${renderAccueilApp()}
    <div class="db-bonjour"><div><h2>${escapeHtml(salutation())}</h2><div class="db-date">${dateLongue}</div>${renderQuestionAppel()}</div>
      ${['direction','fondation'].includes(ui.role) ? `<button type="button" class="btn secondary sm" onclick="ouvrirRapportMois()">${icone('file-text')} Rapport du mois</button>` : ''}</div>
    ${ui.role === 'enseignant' && !session.enseignantId ? renderJeMEnrole() : ''}
    ${barreRubriques([
      rubrique('alertes', 'Alertes pointage', 'Alertes de pointage — 7 derniers jours', 'triangle-alert', (rafraichirAlertesPointage(), renderAlertesPointageDirection()), () => { const n = alertesPointageRecentes().filter(a => a.date === todayISO() && a.gravite !== 'technique').length; return n ? String(n) : ''; }),
      rubrique('afaire', 'À faire', 'À faire aujourd’hui', 'circle-dot', renderAFaireAujourdhui(), h => (h.match(/afaire-compte">(\d+)/) || [])[1] || ''),
      rubrique('suivi', 'Enseignants', 'Suivi des enseignants', 'users', renderSuiviEnseignants(), h => (h.match(/(\d+) enseignant\(s\) à relancer/) || [])[1] || ''),
      rubrique('dates', '3 semaines', 'Dans les 3 prochaines semaines', 'calendar-range', renderProchainesDatesEcole()),
      finance ? rubrique('treso', 'Trésorerie', 'Trésorerie', 'wallet', renderTresorerie()) : null,
      rubrique('miseenroute', 'Mise en route', 'Mise en route de l’école', 'target', renderMiseEnRoute(), h => (h.match(/mer-score">([^<]+)</) || [])[1] || ''),
      rubrique('journee', 'Ma journée', 'Ma journée', 'clock', renderMaJournee()),
      rubrique('surveiller', 'À surveiller', 'Élèves à surveiller', 'triangle-alert', renderElevesASurveiller(), h => (h.match(/mer-score">([^<]+)</) || [])[1] || ''),
      rubrique('anniv', 'Anniversaires', 'Anniversaires de la semaine', 'party-popper', renderAnniversaires(), h => { const n = (h.match(/class="mj-classe"/g) || []).length; return n ? String(n) : ''; }),
      ['direction', 'fondation'].includes(ui.role) ? { id: 'bilan', court: 'Bilan semaine', titre: 'Bilan de la semaine', ic: 'book-open-check', action: 'ouvrirBilanHebdo()' } : null,
      rubrique('repartition', 'Répartition', 'Répartition des élèves par classe', 'chart-column', `<div class="panel"><div class="panel-head"><div><h2>Répartition des élèves par classe</h2></div></div>${barsHtml}</div>`, () => String(totalEleves)),
      rubrique('ensemble', 'Par classe', 'Vue d’ensemble par classe', 'school', `<div class="panel"><div class="panel-head"><div><h2>Vue d’ensemble par classe</h2></div></div><div class="lignes-classes">${renderLignesClasses()}</div></div>`),
    ])}
    ${barreRubriques(chiffresDuJour(), { titre: 'Les chiffres du jour', ic: 'chart-column', sous: 'Touchez un chiffre pour voir le détail.' })}
    ${animer ? `${(setTimeout(animerCompteursKpi, 0), '')}` : ''}
    ${renderBanniereNotifications()}
    ${ui.role==='enseignant' ? renderActualitesParent() + renderTableauHonneurParent() : ''}
  </div>`;
}

