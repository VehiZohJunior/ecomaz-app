/* =====================================================================
   DEMANDES DE PERMISSION (27/11/2026) — demande de Vehi Zoh Junior :
   - personnel → direction (absence, sortie, arrivée tardive) : la
     direction ou la fondation accorde ou refuse, avec un mot ;
   - parent → école (sortie de l'enfant avant l'heure, absence, arrivée
     tardive) : l'administration répond ; le portier voit les sorties
     accordées du jour et qui vient chercher l'enfant ;
   - élève → enseignant (toilettes, infirmerie…) : notée par l'enseignant,
     avec l'heure de sortie et l'heure de retour.
   Règles tenues par le serveur : schema.sql section 131 (table permissions).
   ===================================================================== */
const PERM_TYPES = {
  personnel: ['Absence (journée)', 'Sortie pendant les heures', 'Arrivée tardive', 'Départ anticipé', 'Autre'],
  parent: ['Sortie avant l’heure', 'Absence', 'Arrivée tardive', 'Autre'],
  eleve: ['Toilettes', 'Infirmerie', 'Appeler les parents', 'Bureau de la direction', 'Rendez-vous médical', 'Autre'],
};
const PERM_STATUTS = { en_attente: ['En attente', 'rn-attente'], accordee: ['Accordée', 'rn-validee'], refusee: ['Refusée', 'rn-corriger'], annulee: ['Annulée', 'rn-brouillon'] };
const permEtat = { liste: null, promesse: null };

function chargerPermissions(){
  if(permEtat.promesse) return permEtat.promesse;
  permEtat.promesse = (async () => {
    try{ const { data, error } = await sb.from('permissions').select('*').order('created_at', { ascending: false }).limit(400); if(error) throw error; permEtat.liste = rowsToCamel(data || []); }
    catch(_e){ if(permEtat.liste === null) permEtat.liste = []; }
    permEtat.promesse = null;
  })();
  return permEtat.promesse;
}
function permRafraichir(){
  if(ui.role === 'parent' || ui.role === 'portier'){ if(document.getElementById('modalBody')?.querySelector('.perm')) permOuvrirParent(); return; }
  if(ui.currentView === 'permissions') renderView('permissions');
}
function permQuand(p){
  const j = p.dateDebut === p.dateFin ? `le ${fmtDate(p.dateDebut)}` : `du ${fmtDate(p.dateDebut)} au ${fmtDate(p.dateFin)}`;
  const h = p.heureDebut ? ` à partir de ${String(p.heureDebut).slice(0, 5).replace(':', ' h ')}` : '';
  return j + h + (p.heureFin ? ` jusqu’à ${String(p.heureFin).slice(0, 5).replace(':', ' h ')}` : '');
}
function permCarte(p, actions){
  const [lib, cls] = PERM_STATUTS[p.statut] || PERM_STATUTS.en_attente;
  const e = p.eleveId ? eleveById(p.eleveId) : null;
  return `<li class="perm-carte">
    <div class="perm-haut"><strong>${escapeHtml(p.type)}</strong><span class="rn-statut ${cls}">${p.categorie === 'eleve' ? (p.heureRetour ? 'Revenu(e)' : 'Sorti(e)') : lib}</span></div>
    <div class="perm-qui">${p.categorie === 'personnel' ? escapeHtml(p.demandeurNom || '') : `${e ? escapeHtml(eleveFullName(e)) + ' · ' + escapeHtml(classeName(e.classeId)) : 'Élève'}${p.categorie === 'parent' ? ' — demandé par ' + escapeHtml(p.demandeurNom || 'le parent') : ''}`}</div>
    <div class="perm-quand">${p.categorie === 'eleve' ? `Sortie à ${String(p.heureDebut || '').slice(0, 5)}${p.heureRetour ? ` · retour à ${String(p.heureRetour).slice(0, 5)}` : ''} — ${fmtDate(p.dateDebut)}` : permQuand(p)}${p.quiRecupere ? ` · récupéré(e) par <strong>${escapeHtml(p.quiRecupere)}</strong>` : ''}</div>
    <div class="perm-motif">${escapeHtml(p.motif)}</div>
    ${p.decisionLe && p.categorie !== 'eleve' ? `<div class="perm-decision">${p.statut === 'accordee' ? '✅' : '❌'} ${escapeHtml(p.decisionNom || '')} — ${fmtDate(String(p.decisionLe).slice(0, 10))}${p.commentaire ? ` : « ${escapeHtml(p.commentaire)} »` : ''}</div>` : ''}
    ${actions ? `<div class="perm-actions">${actions}</div>` : ''}
  </li>`;
}

/* ------------------------------ Écran du personnel ------------------------------ */
function renderPermissions(){
  if(permEtat.liste === null){ if(!permEtat.promesse) chargerPermissions().then(permRafraichir); return '<div class="panel"><p class="hint">Chargement…</p></div>'; }
  const f = ui.filters.perm || (ui.filters.perm = { onglet: '' });
  const admin = ['direction', 'fondation'].includes(ui.role), perso = admin || ui.role === 'secretariat', ens = ui.role === 'enseignant';
  const onglets = [];
  if(perso) onglets.push(['traiter', 'À traiter']);
  onglets.push(['miennes', 'Mes demandes']);
  if(ens || perso) onglets.push(['classe', 'En classe (élèves)']);
  if(perso || ens) onglets.push(['parents', 'Demandes des parents']);
  if(perso) onglets.push(['historique', 'Historique']);
  if(!f.onglet || !onglets.some(o => o[0] === f.onglet)) f.onglet = onglets[0][0];
  const L = permEtat.liste;
  const peutRepondre = p => p.statut === 'en_attente' && p.demandeurId !== session.userId && (p.categorie === 'parent' ? perso : admin);
  const boutonsDecision = p => peutRepondre(p) ? `<button type="button" class="btn sm" onclick="permDecider('${p.id}', 'accordee')">✅ Accorder</button><button type="button" class="btn secondary sm" onclick="permDecider('${p.id}', 'refusee')">❌ Refuser</button>` : '';
  let corps = '';
  if(f.onglet === 'traiter'){
    const l = L.filter(p => p.statut === 'en_attente' && p.categorie !== 'eleve' && p.demandeurId !== session.userId && (p.categorie === 'parent' || admin));
    corps = l.length ? `<ul class="perm-liste">${l.map(p => permCarte(p, boutonsDecision(p))).join('')}</ul>` : '<div class="etat-vide etat-vide-ok">Aucune demande en attente.</div>';
  }else if(f.onglet === 'miennes'){
    const l = L.filter(p => p.demandeurId === session.userId && p.categorie === 'personnel');
    corps = `<button type="button" class="btn" onclick="permNouvelle('personnel')">✋ Demander une permission</button>
      ${l.length ? `<ul class="perm-liste">${l.map(p => permCarte(p, p.statut === 'en_attente' ? `<button type="button" class="btn secondary sm" onclick="permAnnuler('${p.id}')">Annuler ma demande</button>` : '')).join('')}</ul>` : '<p class="hint">Vous n’avez encore fait aucune demande.</p>'}`;
  }else if(f.onglet === 'classe'){
    const auj = todayISO();
    const l = L.filter(p => p.categorie === 'eleve' && (perso || p.demandeurId === session.userId));
    const dehors = l.filter(p => p.dateDebut === auj && !p.heureRetour);
    corps = `<button type="button" class="btn" onclick="permNouvelle('eleve')">🚶 Un élève demande à sortir</button>
      ${dehors.length ? `<h3 class="perm-sous">Hors de la classe en ce moment (${dehors.length})</h3><ul class="perm-liste">${dehors.map(p => permCarte(p, p.demandeurId === session.userId || perso ? `<button type="button" class="btn sm" onclick="permRetour('${p.id}')">↩️ Revenu(e) en classe</button>` : '')).join('')}</ul>` : ''}
      <h3 class="perm-sous">Aujourd’hui et avant</h3>${l.filter(p => !dehors.includes(p)).length ? `<ul class="perm-liste">${l.filter(p => !dehors.includes(p)).slice(0, 60).map(p => permCarte(p)).join('')}</ul>` : '<p class="hint">Aucune permission en classe enregistrée.</p>'}`;
  }else if(f.onglet === 'parents'){
    const l = L.filter(p => p.categorie === 'parent');
    corps = l.length ? `<ul class="perm-liste">${l.slice(0, 80).map(p => permCarte(p, boutonsDecision(p))).join('')}</ul>` : '<p class="hint">Aucune demande des parents.</p>';
  }else{
    const l = L.filter(p => p.statut !== 'en_attente' || p.categorie === 'eleve');
    corps = `<button type="button" class="btn secondary sm" onclick="permExcel()">⬇️ Excel</button>${l.length ? `<ul class="perm-liste">${l.slice(0, 120).map(p => permCarte(p)).join('')}</ul>` : '<p class="hint">Rien pour l’instant.</p>'}`;
  }
  const nbAtt = L.filter(p => p.statut === 'en_attente' && p.categorie !== 'eleve' && p.demandeurId !== session.userId && (p.categorie === 'parent' || admin)).length;
  return `<div class="perm">
    <div class="segmente" role="tablist">${onglets.map(([k, l]) => `<button type="button" role="tab" class="seg${f.onglet === k ? ' actif' : ''}" aria-selected="${f.onglet === k}" onclick="ui.filters.perm.onglet='${k}'; renderView('permissions')">${l}${k === 'traiter' && nbAtt ? ` <span class="cn-compte">${nbAtt}</span>` : ''}</button>`).join('')}</div>
    <section class="panel">${corps}</section></div>`;
}

/* ------------------------------ Formulaires ------------------------------ */
function permNouvelle(categorie, eleveIdParent){
  const auj = todayISO(), types = PERM_TYPES[categorie];
  const eleves = categorie === 'parent'
    ? DB.eleves.filter(e => !eleveIdParent || e.id === eleveIdParent)
    : (ui.role === 'enseignant' ? DB.eleves.filter(e => e.statut === 'Actif' && classesVisibles().some(c => c.id === e.classeId)) : DB.eleves.filter(e => e.statut === 'Actif'));
  const titre = { personnel: '✋ Demander une permission', parent: '✋ Demander une permission pour mon enfant', eleve: '🚶 Permission de sortie de la classe' }[categorie];
  openModal(titre, `<form class="rn-fiche perm-form" onsubmit="event.preventDefault(); permEnregistrer('${categorie}')">
    ${categorie !== 'personnel' ? `<div class="form-group"><label for="pmEleve">${categorie === 'parent' ? 'Enfant' : 'Élève'} *</label><select id="pmEleve" required>${eleves.length > 1 ? '<option value="">— Choisir —</option>' : ''}${eleves.sort((a, b) => eleveFullName(a).localeCompare(eleveFullName(b))).map(e => `<option value="${e.id}">${escapeHtml(eleveFullName(e))} (${escapeHtml(classeName(e.classeId))})</option>`).join('')}</select></div>` : ''}
    <div class="form-group"><label for="pmType">Objet</label><select id="pmType">${types.map(t => `<option>${escapeHtml(t)}</option>`).join('')}</select></div>
    ${categorie === 'eleve' ? `<div class="form-group"><label for="pmHeure">Heure de sortie</label><input id="pmHeure" type="time" value="${new Date().toTimeString().slice(0, 5)}"></div>`
      : `<div class="perm-2"><div class="form-group"><label for="pmDu">Date *</label><input id="pmDu" type="date" required value="${auj}" min="${auj}"></div>
         <div class="form-group"><label for="pmAu">Jusqu’au (si plusieurs jours)</label><input id="pmAu" type="date" min="${auj}"></div></div>
         <div class="perm-2"><div class="form-group"><label for="pmHeure">À partir de (heure)</label><input id="pmHeure" type="time"></div>
         <div class="form-group"><label for="pmHeureFin">Jusqu’à (heure)</label><input id="pmHeureFin" type="time"></div></div>`}
    ${categorie === 'parent' ? `<div class="form-group"><label for="pmQui">Qui vient chercher l’enfant ?</label><input id="pmQui" maxlength="120" placeholder="Ex. : sa tante, Mme Kouassi Ama"></div>` : ''}
    <div class="form-group"><label for="pmMotif">Motif *</label><textarea id="pmMotif" rows="3" maxlength="1000" required placeholder="${categorie === 'eleve' ? 'Ex. : mal au ventre' : 'Expliquez brièvement'}"></textarea></div>
    <p class="rn-astuce">${categorie === 'personnel' ? 'La direction reçoit votre demande et vous répond dans l’application.' : categorie === 'parent' ? 'L’école vous répond dans l’application. Si c’est accordé, le portier est informé.' : 'L’heure est notée ; touchez « Revenu(e) en classe » à son retour.'}</p>
    <div class="form-actions"><button type="button" class="btn secondary" onclick="closeModal()">Annuler</button><button type="submit" class="btn" id="pmOk">${categorie === 'eleve' ? 'Enregistrer la sortie' : 'Envoyer la demande'}</button></div>
  </form>`);
}
async function permEnregistrer(categorie){
  const v = id => (document.getElementById(id)?.value || '').trim();
  const motif = v('pmMotif'); if(motif.length < 2){ toast('Indiquez le motif.'); return; }
  const eleveId = categorie === 'personnel' ? null : v('pmEleve'); if(categorie !== 'personnel' && !eleveId){ toast('Choisissez l’élève.'); return; }
  const du = categorie === 'eleve' ? todayISO() : v('pmDu'), au = categorie === 'eleve' ? todayISO() : (v('pmAu') || du);
  if(au < du){ toast('La date de fin est avant la date de début.'); return; }
  const ligne = { categorie, demandeurId: session.userId, demandeurNom: session.nomComplet || '', eleveId, type: v('pmType'), dateDebut: du, dateFin: au,
    heureDebut: v('pmHeure') || null, heureFin: categorie === 'eleve' ? null : (v('pmHeureFin') || null), motif, quiRecupere: categorie === 'parent' ? (v('pmQui') || null) : null,
    statut: categorie === 'eleve' ? 'accordee' : 'en_attente' };
  const b = document.getElementById('pmOk'); if(b) b.disabled = true;
  try{
    const r = await dbInsert('permissions', ligne);
    permEtat.liste = [r, ...(permEtat.liste || [])];
    if(categorie !== 'eleve'){ try{ sb.functions.invoke('notifier-personnel', { body: { type: 'permission' } }); }catch(_e){} }
    closeModal();
    toast(categorie === 'eleve' ? 'Sortie notée' : '📨 Demande envoyée');
    if(categorie === 'parent') permOuvrirParent(); else permRafraichir();
  }catch(e){ if(b) b.disabled = false; toast('Non envoyé : ' + e.message); }
}
function permDecider(id, statut){
  const p = (permEtat.liste || []).find(x => x.id === id); if(!p) return;
  openModal(statut === 'accordee' ? '✅ Accorder la permission' : '❌ Refuser la permission', `<form onsubmit="event.preventDefault(); permEnregistrerDecision('${id}', '${statut}')">
    <ul class="perm-liste">${permCarte(p)}</ul>
    <div class="form-group"><label for="pmComm">Un mot pour ${p.categorie === 'parent' ? 'le parent' : 'la personne'} ${statut === 'refusee' ? '*' : '(facultatif)'}</label><textarea id="pmComm" rows="2" maxlength="1000"${statut === 'refusee' ? ' required' : ''}></textarea></div>
    <div class="form-actions"><button type="button" class="btn secondary" onclick="closeModal()">Annuler</button><button type="submit" class="btn">${statut === 'accordee' ? 'Accorder' : 'Refuser'}</button></div></form>`);
}
async function permEnregistrerDecision(id, statut){
  const commentaire = (document.getElementById('pmComm')?.value || '').trim() || null;
  try{
    await dbUpdate('permissions', id, { statut, commentaire, decisionNom: session.nomComplet || '', decisionLe: new Date().toISOString() });
    const p = permEtat.liste.find(x => x.id === id); if(p) Object.assign(p, { statut, commentaire, decisionNom: session.nomComplet || '', decisionLe: new Date().toISOString() });
    try{ sb.functions.invoke('notifier-personnel', { body: { type: 'permission_reponse', permissionId: id } }); }catch(_e){}
    closeModal(); toast(statut === 'accordee' ? 'Permission accordée' : 'Permission refusée'); permRafraichir();
  }catch(e){ toast(e.message || 'Réponse impossible.'); }
}
async function permAnnuler(id){
  if(!confirm('Annuler cette demande ?')) return;
  try{ await dbUpdate('permissions', id, { statut: 'annulee' }); const p = permEtat.liste.find(x => x.id === id); if(p) p.statut = 'annulee'; toast('Demande annulée'); if(ui.role === 'parent') permOuvrirParent(); else permRafraichir(); }
  catch(e){ toast(e.message); }
}
async function permRetour(id){
  const h = new Date().toTimeString().slice(0, 8);
  try{ await dbUpdate('permissions', id, { heureRetour: h }); const p = permEtat.liste.find(x => x.id === id); if(p) p.heureRetour = h; toast('Retour en classe noté'); permRafraichir(); }
  catch(e){ toast(e.message); }
}
async function permExcel(){
  const l = permEtat.liste || [];
  const lignes = [['Catégorie', 'Objet', 'Demandeur', 'Élève', 'Classe', 'Du', 'Au', 'Heure', 'Motif', 'Qui récupère', 'Statut', 'Réponse de', 'Commentaire']].concat(l.map(p => { const e = p.eleveId ? eleveById(p.eleveId) : null;
    return [{ personnel: 'Personnel', parent: 'Parent', eleve: 'En classe' }[p.categorie], p.type, p.demandeurNom || '', e ? eleveFullName(e) : '', e ? classeName(e.classeId) : '', fmtDate(p.dateDebut), fmtDate(p.dateFin), String(p.heureDebut || '').slice(0, 5), p.motif, p.quiRecupere || '', (PERM_STATUTS[p.statut] || [''])[0], p.decisionNom || '', p.commentaire || '']; }));
  try{ await ecrireClasseurExcel([['Permissions', lignes]], nomFichierExport('permissions')); }catch(e){ alert('Export impossible : ' + e.message); }
}

/* ------------------------------ Parent ------------------------------ */
async function permOuvrirParent(){
  if(permEtat.liste === null) await chargerPermissions();
  const l = (permEtat.liste || []).filter(p => p.categorie === 'parent' && p.demandeurId === session.userId);
  openModal('✋ Mes demandes de permission', `<div class="perm">
    <button type="button" class="btn" onclick="permNouvelle('parent')">✋ Nouvelle demande</button>
    <p class="hint">Sortie avant l’heure, absence, arrivée tardive : l’école vous répond ici. Une sortie accordée est communiquée au portier.</p>
    ${l.length ? `<ul class="perm-liste">${l.map(p => permCarte(p, p.statut === 'en_attente' ? `<button type="button" class="btn secondary sm" onclick="permAnnuler('${p.id}')">Annuler</button>` : '')).join('')}</ul>` : '<p class="hint">Aucune demande pour l’instant.</p>'}</div>`);
}

/* ------------------------------ Portier ------------------------------ */
async function renderSortiesAutoriseesPortier(cible){
  const z = typeof cible === 'string' ? document.getElementById(cible) : cible; if(!z) return;
  if(permEtat.liste === null || !permEtat.lu || Date.now() - permEtat.lu > 60000){ await chargerPermissions(); permEtat.lu = Date.now(); }
  const auj = todayISO();
  const l = (permEtat.liste || []).filter(p => p.categorie === 'parent' && p.statut === 'accordee' && p.dateDebut <= auj && p.dateFin >= auj);
  z.innerHTML = `<h3>✋ Sorties autorisées aujourd’hui (${l.length})</h3>${l.length ? `<ul class="perm-liste">${l.map(p => permCarte(p)).join('')}</ul>` : '<p class="hint">Aucune sortie autorisée pour aujourd’hui.</p>'}`;
}

/* ------------------------------ Assistant ------------------------------ */
function conseilsPermissions(){
  const l = [];
  if(!['secretariat', 'direction', 'fondation'].includes(ui.role)) return l;
  if(permEtat.liste === null){ if(!permEtat.promesse) chargerPermissions().then(() => { if(ui.currentView === 'dashboard' && (permEtat.liste || []).length) renderView('dashboard'); }); return l; }
  const admin = ['direction', 'fondation'].includes(ui.role);
  const n = permEtat.liste.filter(p => p.statut === 'en_attente' && p.categorie !== 'eleve' && p.demandeurId !== session.userId && (p.categorie === 'parent' || admin)).length;
  if(n) l.push({ ic: 'hand', texte: `${n} demande${n > 1 ? 's' : ''} de permission à traiter`, detail: 'Personnel et parents', bouton: 'Répondre', action: "ui.filters.perm={ onglet:'traiter' }; go('permissions')" });
  return l;
}
