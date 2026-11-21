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

