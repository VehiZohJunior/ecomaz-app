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
  const admin = ['secretariat','direction','fondation'].includes(ui.role);
  // Historique : seulement la classe choisie (et replié) ; l'enseignant a le Cahier d'appel
  const recent = admin ? DB.presencesEleves.filter(p => p.classeId === f.classeId).sort((a,b)=>b.date.localeCompare(a.date)).slice(0,20) : [];
  const recentRows = recent.map(p=>{
    const e = eleveById(p.eleveId);
    if(!e) return '';
    return `<tr><td>${fmtDate(p.date)}</td><td>${escapeHtml(eleveFullName(e))}</td><td><span class="badge blue">${classeName(p.classeId)}</span></td>
      <td><span class="badge ${p.statut==='Présent'?'green':p.statut==='Absent'?'red':'amber'}">${p.statut}</span></td><td>${escapeHtml(p.motif||'—')}</td></tr>`;
  }).join('');

  return `
  <div class="view active">
    <div class="panel">
      <div class="panel-head"><div><h2>${admin ? 'Feuille de présence' : `Faire l’appel — ${escapeHtml(classeName(f.classeId))}`}</h2>
        <div class="sub">${admin ? 'Par classe et par date' : '① Touchez « Absent » ou « Retard » pour les élèves concernés : les autres restent « Présent ». ② Appuyez sur « Valider l’appel », en bas.'}</div></div></div>
      ${nbSignalees ? `<div class="section-note">${nbSignalees} absence(s) signalée(s) à l'avance par les parents : déjà marquée(s) « Absent » ci-dessous. Vérifiez puis validez.</div>` : ''}
      <div class="filters appel-filtres">
        ${mesClasses.length === 1 ? '' : mesClasses.length <= 5
          ? `<div class="segmente appel-classes" role="group" aria-label="Classe">${mesClasses.map(c => `<button type="button" class="seg${f.classeId === c.id ? ' actif' : ''}" aria-pressed="${f.classeId === c.id}" onclick="ui.filters.presEleves.classeId='${c.id}'; renderView('presences-eleves')">${escapeHtml(c.nom)}${DB.presencesEleves.some(p => p.classeId === c.id && p.date === f.date) ? ' ✓' : ''}</button>`).join('')}</div>`
          : `<label class="appel-champ"><span>Classe</span><select onchange="ui.filters.presEleves.classeId=this.value; renderView('presences-eleves')">
          ${mesClasses.map(c=>`<option value="${c.id}" ${f.classeId===c.id?'selected':''}>${escapeHtml(c.nom)}</option>`).join('')}
        </select></label>`}
        <label class="appel-champ"><span>Jour de l’appel</span><input type="date" value="${f.date}" max="${todayISO()}" onchange="ui.filters.presEleves.date=this.value || todayISO(); renderView('presences-eleves')"></label>
        ${f.date !== todayISO() ? `<button type="button" class="btn secondary sm" onclick="ui.filters.presEleves.date=todayISO(); renderView('presences-eleves')">Revenir à aujourd’hui</button>` : ''}
      </div>
      ${eleves.length===0 ? `<div class="empty-state"><div class="em-ic">✅</div>Aucun élève actif dans cette classe.</div>` : `
      ${renderAppelDuJour(f.classeId, eleves, f.date)}`}
    </div>
    ${renderPrevenirParentsWhatsapp(f)}

    ${admin ? `<details class="panel appel-histo">
      <summary>Historique récent — ${escapeHtml(classeName(f.classeId))} <span class="hint" style="margin:0;">(20 derniers enregistrements)</span></summary>
      <div class="table-wrap"><table>
        <thead><tr><th>Date</th><th>Élève</th><th>Classe</th><th>Statut</th><th>Motif</th></tr></thead>
        <tbody>${recentRows || '<tr><td colspan="5" class="hint">Aucun enregistrement</td></tr>'}</tbody>
      </table></div>
    </details>` : `<div class="appel-lien-cahier"><button type="button" class="lien-discret" onclick="go('cahier-appel')">${icone('clipboard')} Voir tous les appels du mois (Cahier d’appel)</button></div>`}
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
let appelEnCours = false;
async function savePresencesEleves(){
  const f = ui.filters.presEleves;
  if(appelEnCours) return; // un deuxième appui pendant l'enregistrement ne relance rien
  appelEnCours = true;
  const btn = document.getElementById('btnValiderAppel');
  const texteBtn = btn ? btn.textContent : '';
  if(btn){ btn.disabled = true; btn.textContent = 'Enregistrement…'; }
  let nbNotifs = 0;
  try{
    // 1) Lire la feuille : nouveaux enregistrements, modifications réelles, nouveaux absents
    const nouveaux = [], modifs = [], aPrevenir = [];
    for(const sel of $$('.sel-statut')){
      const eleveId = sel.dataset.eleve;
      const statut = sel.value;
      const motifInput = $(`[data-motif="${eleveId}"]`);
      const motif = motifInput ? motifInput.value.trim() : '';
      const rec = DB.presencesEleves.find(p=>p.eleveId===eleveId && p.date===f.date);
      const wasAbsent = rec && rec.statut==='Absent';
      if(!rec) nouveaux.push({date:f.date, classeId:f.classeId, eleveId, statut, motif});
      else if(rec.statut !== statut || (rec.motif || '') !== motif) modifs.push({ rec, statut, motif });
      if(statut==='Absent' && !wasAbsent && !absenceSignalee(eleveId, f.date)) aPrevenir.push({ eleveId, motif });
    }
    // 1 bis) Présents / retards : seulement depuis l'établissement (GPS vérifié par le serveur)
    if((nouveaux.some(n => n.statut !== 'Absent') || modifs.some(m => m.statut !== 'Absent' && m.rec.statut === 'Absent')) && !(await verifierPositionAvantAppel(f.classeId))){
      appelEnCours = false; if(btn){ btn.disabled = false; btn.textContent = texteBtn; } return;
    }
    // 2) Toute la classe en un seul envoi (rapide même avec un réseau faible ; file d'attente si hors ligne)
    if(nouveaux.length){
      try{ DB.presencesEleves.push(...await dbInsertMany('presences_eleves', nouveaux)); }
      catch(_e){ for(const n of nouveaux){ DB.presencesEleves.push(await dbInsert('presences_eleves', n)); } } // ex. un autre appareil a déjà commencé l'appel
    }
    for(const m of modifs){ await dbUpdate('presences_eleves', m.rec.id, { statut: m.statut, motif: m.motif }); m.rec.statut = m.statut; m.rec.motif = m.motif; }
    // 3) Prévenir les parents des nouveaux absents
    let gardees = 0;
    for(const a of aPrevenir){ if(await envoyerNotificationAbsenceEleve(a.eleveId, f.date, a.motif)) nbNotifs += 3; else if(notifsAbsenceEnAttente().some(n => n.eleveId === a.eleveId && n.date === f.date)) gardees++; }
    if(navigator.onLine === false || gardees){
      toast(navigator.onLine === false
        ? (gardees ? `Pas de réseau : appel gardé dans le téléphone. Il partira, et les parents de ${gardees} absent(s) seront prévenus, dès le retour du réseau.` : 'Pas de réseau : appel gardé dans le téléphone. Il partira dès le retour du réseau.')
        : `Appel enregistré. Réseau instable : les parents de ${gardees} absent(s) seront prévenus dès que possible.`);
      appelEnCours = false; renderView('presences-eleves'); return;
    }
    toast(nbNotifs ? (['secretariat','direction','fondation'].includes(ui.role)
      ? 'Présence enregistrée · prévenez les parents des absents par WhatsApp (plus bas)'
      : 'Présence enregistrée · absences signalées au parent dans son application et à la direction') : 'Présence enregistrée');
    appelEnCours = false;
    renderView('presences-eleves');
  }catch(e){
    appelEnCours = false;
    if(btn){ btn.disabled = false; btn.textContent = 'Valider l’appel'; }
    alert('Erreur : ' + e.message);
  }
}
// Le numéro de téléphone du parent n'est plus jamais chargé ni manipulé
// dans le navigateur : toute la logique (composition du message, journal
// des destinataires, envoi du SMS réel) tourne côté serveur, dans la
// fonction Edge "notifier-absence-eleve" — voir schema.sql section 22.
// Avant ce correctif, le numéro transitait par DB.eleves (visible dans la
// mémoire du navigateur de tout compte pouvant faire l'appel).
// Retourne true si le parent a été prévenu ; sans réseau, la notification est gardée
// dans le téléphone et renvoyée au retour de la connexion (jamais perdue).
async function envoyerNotificationAbsenceEleve(eleveId, date, motif){
  if(navigator.onLine === false){ garderNotifAbsence(eleveId, date, motif); return false; }
  try{
    const { data, error } = await sb.functions.invoke('notifier-absence-eleve', { body: { eleveId, date, motif } });
    if(error) throw error;
    if(!data?.ok) throw new Error(data?.error || "Échec de la notification");
    return true;
  }catch(e){
    if(erreurReseau(e) || /fetch|network|réseau/i.test(String(e?.message || e))) garderNotifAbsence(eleveId, date, motif);
    else console.warn('Échec notification absence élève :', e?.message || e);
    return false;
  }
}
const CLE_NOTIFS_ABSENCE = 'ecomaz_notifs_absence_attente';
function notifsAbsenceEnAttente(){ try{ return JSON.parse(localStorage.getItem(CLE_NOTIFS_ABSENCE) || '[]'); }catch(_e){ return []; } }
function garderNotifAbsence(eleveId, date, motif){
  const l = notifsAbsenceEnAttente().filter(n => !(n.eleveId === eleveId && n.date === date));
  l.push({ eleveId, date, motif: motif || '', ecoleId: session.ecoleId });
  try{ localStorage.setItem(CLE_NOTIFS_ABSENCE, JSON.stringify(l.slice(-200))); }catch(_e){}
}
let renvoiNotifsEnCours = false;
async function renvoyerNotifsAbsence(){
  if(renvoiNotifsEnCours || navigator.onLine === false || !session.userId || compteurFileAttente > 0) return; // l'appel d'abord, puis les parents
  const l = notifsAbsenceEnAttente().filter(n => n.ecoleId === session.ecoleId); if(!l.length) return;
  renvoiNotifsEnCours = true;
  let envoyees = 0;
  try{
    for(const n of l){
      // Absence corrigée entre-temps (élève finalement présent) : on ne prévient pas
      const rec = (DB.presencesEleves || []).find(p => p.eleveId === n.eleveId && p.date === n.date);
      const reste = notifsAbsenceEnAttente().filter(x => !(x.eleveId === n.eleveId && x.date === n.date));
      if(rec && rec.statut !== 'Absent'){ try{ localStorage.setItem(CLE_NOTIFS_ABSENCE, JSON.stringify(reste)); }catch(_e){} continue; }
      try{
        const { data, error } = await sb.functions.invoke('notifier-absence-eleve', { body: { eleveId: n.eleveId, date: n.date, motif: n.motif } });
        if(error && (erreurReseau(error) || /fetch|network/i.test(String(error.message || '')))) break;
        if(!error && data?.ok) envoyees++;
      }catch(e){ if(erreurReseau(e)) break; }
      try{ localStorage.setItem(CLE_NOTIFS_ABSENCE, JSON.stringify(reste)); }catch(_e){}
    }
  }finally{ renvoiNotifsEnCours = false; }
  if(envoyees) toast(`Réseau revenu : ${envoyees} parent(s) d’élève(s) absent(s) prévenu(s)`);
}
window.addEventListener('online', () => setTimeout(renvoyerNotifsAbsence, 4000));

