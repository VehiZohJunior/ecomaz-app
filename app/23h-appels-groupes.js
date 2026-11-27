/* =====================================================================
   APPELS : CANTINE, ACTIVITÉS (TAEKWONDO…), RENFORCEMENT (27/11/2026)
   Demande de Vehi Zoh Junior : appel à la cantine chaque midi, au
   taekwondo chaque samedi avant l'entraînement, au cours de renforcement
   (espace enseignant).
   - Groupes : chaque activité de type « cantine », chaque activité
     extra-scolaire (élèves inscrits dans Comptabilité → Activités), et le
     cours de renforcement (élèves cochés sur leur fiche ; un enseignant ne
     voit que ceux de ses classes).
   - Jours d'appel par activité (ex. Taekwondo : samedi) ; la cantine les
     jours de classe ; le renforcement les jours de renforcement.
   - Appel du jour ou des 7 derniers jours (règle du serveur, section 131).
   ===================================================================== */
const AG_JOURS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const agEtat = { appels: {}, charge: {} };

function agGroupes(){
  const g = [];
  (DB.activites || []).filter(a => a.type === 'cantine').forEach(a => g.push({ cle: 'activite:' + a.id, ic: '🍽️', nom: a.nom || 'Cantine', act: a, cantine: true }));
  (DB.activites || []).filter(a => a.type !== 'cantine' && !/renforcement/i.test(a.nom || '')).forEach(a => g.push({ cle: 'activite:' + a.id, ic: /taekw|karat|judo|sport|foot|basket/i.test(a.nom || '') ? '🥋' : /danse/i.test(a.nom || '') ? '💃' : '🎨', nom: a.nom, act: a }));
  g.push({ cle: 'renforcement', ic: '📘', nom: 'Cours de renforcement', renf: true });
  return g;
}
function agJoursAppel(gr){
  if(gr.renf) return (DB.horairesAnnonces?.joursRenforcement || [1, 2, 3, 4, 5]);
  if(gr.act && Array.isArray(gr.act.joursAppel) && gr.act.joursAppel.length) return gr.act.joursAppel;
  if(gr.cantine) return (DB.horairesAnnonces?.joursCours || [1, 2, 3, 4, 5]);
  return null;   // activité sans jours définis : appel possible tous les jours
}
function agEleves(gr){
  let l;
  if(gr.renf){
    l = DB.eleves.filter(e => e.statut === 'Actif' && e.renforcement);
    if(ui.role === 'enseignant'){ const mes = new Set(classesVisibles().map(c => c.id)); l = l.filter(e => mes.has(e.classeId)); }
  }else{
    const ids = new Set((DB.inscriptionsActivites || []).filter(i => i.activiteId === gr.act.id).map(i => i.eleveId));
    l = DB.eleves.filter(e => e.statut === 'Actif' && ids.has(e.id));
  }
  return l.sort((a, b) => classeName(a.classeId).localeCompare(classeName(b.classeId)) || eleveFullName(a).localeCompare(eleveFullName(b)));
}
async function agCharger(cle, date){
  const k = cle + '|' + date;
  if(agEtat.charge[k]) return;
  agEtat.charge[k] = 'en cours';
  try{
    const { data, error } = await sb.from('appels_groupes').select('eleve_id,statut,saisi_le').eq('groupe', cle).eq('date', date);
    if(error) throw error;
    agEtat.appels[k] = Object.fromEntries((data || []).map(r => [r.eleve_id, { statut: r.statut, enregistre: true, saisiLe: r.saisi_le }]));
  }catch(_e){ agEtat.appels[k] = agEtat.appels[k] || {}; }
  agEtat.charge[k] = 'ok';
  if(ui.currentView === 'appels-groupes') renderView('appels-groupes');
}

function renderAppelsGroupes(){
  const f = ui.filters.ag || (ui.filters.ag = {});
  const groupes = agGroupes();
  if(!f.cle || !groupes.some(g => g.cle === f.cle)){
    // par défaut : la cantine à midi, le renforcement en fin de journée, l'activité du jour le samedi
    const h = new Date().getHours(), jIso = ((new Date().getDay() + 6) % 7) + 1;
    const duJour = groupes.find(g => g.act && !g.cantine && (agJoursAppel(g) || []).includes(jIso));
    f.cle = (duJour && jIso >= 6 ? duJour : h >= 15 ? groupes.find(g => g.renf) : groupes.find(g => g.cantine) || groupes[0]).cle;
  }
  if(!f.date) f.date = todayISO();
  const gr = groupes.find(g => g.cle === f.cle);
  const k = gr.cle + '|' + f.date;
  if(!agEtat.charge[k]) agCharger(gr.cle, f.date);
  const appel = agEtat.appels[k] || {};
  const eleves = agEleves(gr);
  const jours = agJoursAppel(gr), jIso = ((new Date(f.date + 'T12:00:00').getDay() + 6) % 7) + 1;
  const horsJour = jours && !jours.includes(jIso);
  const admin = ['secretariat', 'direction', 'fondation'].includes(ui.role);
  const fait = eleves.length && eleves.every(e => appel[e.id]?.enregistre);
  const nbP = eleves.filter(e => (appel[e.id]?.statut || '') === 'Présent').length, nbA = eleves.filter(e => appel[e.id]?.statut === 'Absent').length, nbR = eleves.filter(e => appel[e.id]?.statut === 'Retard').length;
  const min = toISO(new Date(Date.now() - 7 * 86400000));
  return `<div class="ag">
    <div class="ag-groupes" role="tablist" aria-label="Appel de quel groupe ?">${groupes.map(g => `<button type="button" role="tab" class="ag-groupe${g.cle === gr.cle ? ' actif' : ''}" aria-selected="${g.cle === gr.cle}" onclick="ui.filters.ag.cle='${g.cle}'; renderView('appels-groupes')"><span aria-hidden="true">${g.ic}</span> ${escapeHtml(g.nom)}</button>`).join('')}
      ${!groupes.some(g => g.cantine) && admin ? `<button type="button" class="ag-groupe ag-ajout" onclick="agCreerCantine()">🍽️ + Créer la cantine</button>` : ''}</div>
    <section class="panel">
      <div class="ag-tete"><div><h2>${gr.ic} Appel — ${escapeHtml(gr.nom)}</h2>
        <p class="hint">${gr.cantine ? 'Chaque midi, avant le repas.' : gr.renf ? 'Au début du cours de renforcement.' : 'Avant l’entraînement.'} Jours d’appel : <strong>${jours ? jours.slice().sort().map(j => AG_JOURS[j - 1]).join(', ') : 'tous les jours'}</strong>${gr.act && admin ? ` · <button type="button" class="lien-bouton" onclick="agReglerJours('${gr.act.id}')">modifier</button>` : ''}</p></div>
        <label class="ag-date">Jour <input type="date" value="${f.date}" min="${min}" max="${todayISO()}" onchange="ui.filters.ag.date=this.value; renderView('appels-groupes')"></label></div>
      ${horsJour ? `<div class="ag-info">📅 Pas d’appel prévu ce jour-là pour ce groupe (${jours.map(j => AG_JOURS[j - 1]).join(', ')}). Vous pouvez tout de même le faire en cas de séance exceptionnelle.</div>` : ''}
      ${fait ? `<div class="ag-ok">✅ Appel enregistré : ${nbP} présent(s), ${nbA} absent(s), ${nbR} retard(s).</div>` : ''}
      ${!eleves.length ? `<div class="etat-vide">${gr.renf ? `Aucun élève ${ui.role === 'enseignant' ? 'de vos classes ' : ''}n’est inscrit au cours de renforcement.${admin ? ` <button type="button" class="btn sm" onclick="go('renforcement')">Inscrire des élèves</button>` : ''}`
          : `Aucun élève inscrit à « ${escapeHtml(gr.nom)} ».${admin ? ` <button type="button" class="btn sm" onclick="agInscrire('${gr.act.id}')">➕ Inscrire des élèves</button>` : ' La direction ou le secrétariat inscrit les élèves.'}`}</div>`
        : `<div class="ag-barre"><button type="button" class="btn secondary sm" onclick="agTous('${gr.cle}', '${f.date}')">✓ Tous présents</button>${admin && gr.act ? `<button type="button" class="btn secondary sm" onclick="agInscrire('${gr.act.id}')">➕ Inscrire d’autres élèves</button>` : ''}<span class="hint">${eleves.length} élève(s)</span></div>
          <ul class="ag-liste">${eleves.map(e => { const s = appel[e.id]?.statut || ''; return `<li class="ag-ligne ${s ? 'ag-' + (s === 'Présent' ? 'p' : s === 'Absent' ? 'a' : 'r') : ''}">
            <span class="ag-nom"><strong>${escapeHtml(eleveFullName(e))}</strong><small>${escapeHtml(classeName(e.classeId))}</small></span>
            <span class="ag-choix" role="group" aria-label="Présence de ${escapeHtml(eleveFullName(e))}">${['Présent', 'Absent', 'Retard'].map(x => `<button type="button" class="ag-c${s === x ? ' actif' : ''}" aria-pressed="${s === x}" onclick="agMarquer('${gr.cle}', '${f.date}', '${e.id}', '${x}')">${x}</button>`).join('')}</span></li>`; }).join('')}</ul>
          <div class="ag-valider"><button type="button" class="btn" id="agValider" onclick="agValider('${gr.cle}', '${f.date}')">💾 Enregistrer l’appel</button></div>`}
    </section>
    <section class="panel"><h3>📊 Les 30 derniers jours</h3><div id="agHistorique"><button type="button" class="btn secondary sm" onclick="agHistorique('${gr.cle}')">Afficher la présence de chaque élève</button></div></section>
  </div>`;
}
function agMarquer(cle, date, eleveId, statut){
  const k = cle + '|' + date; const a = agEtat.appels[k] = agEtat.appels[k] || {};
  a[eleveId] = { statut, enregistre: false };
  renderView('appels-groupes');
}
function agTous(cle, date){
  const gr = agGroupes().find(g => g.cle === cle); if(!gr) return;
  const k = cle + '|' + date; const a = agEtat.appels[k] = agEtat.appels[k] || {};
  agEleves(gr).forEach(e => { if(!a[e.id] || !a[e.id].statut) a[e.id] = { statut: 'Présent', enregistre: false }; });
  renderView('appels-groupes');
}
async function agValider(cle, date){
  const gr = agGroupes().find(g => g.cle === cle); if(!gr) return;
  const k = cle + '|' + date; const a = agEtat.appels[k] || {};
  const eleves = agEleves(gr), manquants = eleves.filter(e => !a[e.id]?.statut);
  if(manquants.length){ toast(`Indiquez présent / absent pour ${manquants.length} élève(s) (ou touchez « Tous présents »).`); return; }
  const lignes = eleves.map(e => ({ id: crypto.randomUUID(), ecole_id: session.ecoleId, groupe: cle, eleve_id: e.id, date, statut: a[e.id].statut }));
  const b = document.getElementById('agValider'); if(b) b.disabled = true;
  try{
    const { error } = await sb.from('appels_groupes').upsert(lignes, { onConflict: 'ecole_id,groupe,eleve_id,date', ignoreDuplicates: false });
    if(error) throw error;
    eleves.forEach(e => { a[e.id].enregistre = true; });
    const abs = eleves.filter(e => a[e.id].statut === 'Absent').length;
    toast(`✅ Appel enregistré — ${eleves.length - abs} présent(s), ${abs} absent(s)`);
    renderView('appels-groupes');
  }catch(err){ if(b) b.disabled = false; toast('Appel non enregistré : ' + (erreurLisible ? erreurLisible(err).message : err.message)); }
}
async function agHistorique(cle){
  const z = document.getElementById('agHistorique'); if(!z) return;
  z.innerHTML = '<p class="hint">Chargement…</p>';
  const gr = agGroupes().find(g => g.cle === cle); if(!gr) return;
  const depuis = toISO(new Date(Date.now() - 30 * 86400000));
  const { data, error } = await sb.from('appels_groupes').select('eleve_id,date,statut').eq('groupe', cle).gte('date', depuis);
  if(error){ z.innerHTML = '<p class="hint">Historique indisponible (connexion ?).</p>'; return; }
  const jours = [...new Set((data || []).map(r => r.date))].sort();
  const lignes = agEleves(gr).map(e => { const r = (data || []).filter(x => x.eleve_id === e.id); return { e, p: r.filter(x => x.statut !== 'Absent').length, a: r.filter(x => x.statut === 'Absent').length }; });
  window.__agHisto = { gr, jours, data: data || [], lignes };
  z.innerHTML = !jours.length ? '<p class="hint">Aucun appel enregistré ces 30 derniers jours.</p>' : `<p class="hint">${jours.length} appel(s) depuis le ${fmtDate(depuis)}.</p>
    <div class="table-wrap"><table class="table"><thead><tr><th>Élève</th><th>Classe</th><th>Présent</th><th>Absent</th></tr></thead><tbody>${lignes.map(l => `<tr><td>${escapeHtml(eleveFullName(l.e))}</td><td>${escapeHtml(classeName(l.e.classeId))}</td><td>${l.p}</td><td${l.a ? ' style="color:var(--danger);font-weight:700"' : ''}>${l.a}</td></tr>`).join('')}</tbody></table></div>
    <button type="button" class="btn secondary sm" onclick="agExcel()">⬇️ Excel</button>`;
}
async function agExcel(){
  const h = window.__agHisto; if(!h) return;
  const lettre = s => s === 'Présent' ? 'P' : s === 'Absent' ? 'A' : s === 'Retard' ? 'R' : '';
  const lignes = [['Élève', 'Classe', ...h.jours.map(fmtDate), 'Présences', 'Absences']].concat(h.lignes.map(l => [eleveFullName(l.e), classeName(l.e.classeId), ...h.jours.map(j => lettre((h.data.find(x => x.eleve_id === l.e.id && x.date === j) || {}).statut)), l.p, l.a]));
  try{ await ecrireClasseurExcel([[h.gr.nom.slice(0, 28), lignes]], nomFichierExport('appel-' + simplifierTexte(h.gr.nom).replace(/ /g, '-'))); }catch(e){ alert('Export impossible : ' + e.message); }
}
// Inscrire des élèves à une activité / à la cantine (direction, fondation, secrétariat)
function agInscrire(activiteId){
  const act = (DB.activites || []).find(a => a.id === activiteId); if(!act) return;
  const deja = new Set((DB.inscriptionsActivites || []).filter(i => i.activiteId === activiteId).map(i => i.eleveId));
  openModal(`➕ Inscrire à « ${act.nom} »`, `<form onsubmit="event.preventDefault(); agEnregistrerInscriptions('${activiteId}')">
    <p class="hint">Cochez les élèves, classe par classe. Ceux qui sont déjà inscrits sont cochés.</p>
    <input type="search" class="rn-cherche" placeholder="Chercher un élève…" oninput="const q=simplifierTexte(this.value); document.querySelectorAll('.ag-insc li').forEach(li => li.hidden = q && !simplifierTexte(li.textContent).includes(q))">
    ${DB.classes.map(c => { const el = DB.eleves.filter(e => e.classeId === c.id && e.statut === 'Actif').sort((a, b) => eleveFullName(a).localeCompare(eleveFullName(b))); if(!el.length) return '';
      return `<details class="ag-classe"><summary>${escapeHtml(c.nom)} <small>(${el.filter(e => deja.has(e.id)).length}/${el.length})</small></summary><ul class="ag-insc">${el.map(e => `<li><label><input type="checkbox" name="el" value="${e.id}"${deja.has(e.id) ? ' checked' : ''}> ${escapeHtml(eleveFullName(e))}</label></li>`).join('')}</ul></details>`; }).join('')}
    <div class="form-actions"><button type="button" class="btn secondary" onclick="closeModal()">Annuler</button><button type="submit" class="btn">Enregistrer</button></div></form>`);
}
async function agEnregistrerInscriptions(activiteId){
  const coches = new Set([...document.querySelectorAll('#modalBody input[name=el]:checked')].map(x => x.value));
  const actuels = (DB.inscriptionsActivites || []).filter(i => i.activiteId === activiteId);
  const aAjouter = [...coches].filter(id => !actuels.some(i => i.eleveId === id));
  const aRetirer = actuels.filter(i => !coches.has(i.eleveId));
  try{
    if(aAjouter.length){ const ins = await dbInsertMany('inscriptions_activites', aAjouter.map(eleveId => ({ eleveId, activiteId, dateInscription: todayISO() }))); DB.inscriptionsActivites = (DB.inscriptionsActivites || []).concat(ins); }
    for(const i of aRetirer){ await dbDelete('inscriptions_activites', i.id); }
    DB.inscriptionsActivites = (DB.inscriptionsActivites || []).filter(i => !aRetirer.includes(i));
    closeModal(); toast(`${coches.size} élève(s) inscrit(s)`); renderView(ui.currentView);
  }catch(e){ alert('Erreur : ' + e.message); }
}
function agReglerJours(activiteId){
  const act = (DB.activites || []).find(a => a.id === activiteId); if(!act) return;
  const j = new Set(act.joursAppel || []);
  openModal(`📅 Jours d’appel — ${act.nom}`, `<form onsubmit="event.preventDefault(); agEnregistrerJours('${activiteId}')">
    <p class="hint">Les jours où l’on fait l’appel (ex. Taekwondo : samedi). Sans jour coché : ${act.type === 'cantine' ? 'les jours de classe' : 'tous les jours'}.</p>
    <div class="ag-jours">${AG_JOURS.map((n, i) => `<label class="ag-jour"><input type="checkbox" name="j" value="${i + 1}"${j.has(i + 1) ? ' checked' : ''}> ${n}</label>`).join('')}</div>
    <div class="form-actions"><button type="button" class="btn secondary" onclick="closeModal()">Annuler</button><button type="submit" class="btn">Enregistrer</button></div></form>`);
}
async function agEnregistrerJours(activiteId){
  const jours = [...document.querySelectorAll('#modalBody input[name=j]:checked')].map(x => Number(x.value));
  try{ await dbUpdate('activites', activiteId, { joursAppel: jours.length ? jours : null }); const a = DB.activites.find(x => x.id === activiteId); if(a) a.joursAppel = jours.length ? jours : null; closeModal(); toast('Jours d’appel enregistrés'); renderView(ui.currentView); }
  catch(e){ alert('Erreur : ' + e.message); }
}
async function agCreerCantine(){
  try{ const a = await dbInsert('activites', { nom: 'Cantine', type: 'cantine', montantCotisation: 0, periode: 'Mensuel' }); DB.activites = (DB.activites || []).concat(a); ui.filters.ag = { cle: 'activite:' + a.id }; toast('Cantine créée : inscrivez les élèves qui mangent à l’école.'); renderView('appels-groupes'); setTimeout(() => agInscrire(a.id), 300); }
  catch(e){ alert('Erreur : ' + e.message); }
}
// « À faire aujourd'hui » : appel de la cantine (après 11 h 30) et des activités du jour pas encore faits
function conseilsAppelsGroupes(){
  const l = [];
  if(!['secretariat', 'direction', 'fondation'].includes(ui.role)) return l;
  const auj = todayISO(), jIso = ((new Date().getDay() + 6) % 7) + 1, h = new Date().getHours() + new Date().getMinutes() / 60;
  agGroupes().filter(g => !g.renf).forEach(g => {
    const jours = agJoursAppel(g); if(jours && !jours.includes(jIso)) return;
    if(g.cantine && h < 11.5) return;
    if(!agEleves(g).length) return;
    const k = g.cle + '|' + auj;
    if(!agEtat.charge[k]){ agCharger(g.cle, auj).then(() => { if(ui.currentView === 'dashboard') renderView('dashboard'); }); return; }
    const a = agEtat.appels[k] || {};
    if(!Object.values(a).some(x => x.enregistre)) l.push({ ic: 'clipboard', texte: `Appel « ${g.nom} » pas encore fait`, detail: g.cantine ? 'Chaque midi, avant le repas' : 'Avant l’entraînement', bouton: 'Faire l’appel', action: `ui.filters.ag={ cle:'${g.cle}', date:'${auj}' }; go('appels-groupes')` });
  });
  return l;
}
