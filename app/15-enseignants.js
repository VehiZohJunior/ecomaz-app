/* ---------------------------------------------------------------------
   8. ENSEIGNANTS
   --------------------------------------------------------------------- */
/* ---------- Horaires de cours : qui les a remplis, et remplissage groupé d'après l'emploi du temps ---------- */
function compteParFonction(enseignantId){ const f = (DB.fonctionsCompte || []).find(x => x.enseignantId === enseignantId); return f ? { id: f.userId, enseignantId } : null; }
function comptesPersonnel(){ return (DB.profiles || []).filter(p => ['direction','fondation','secretariat','enseignant'].includes(p.role)).sort((a, b) => String(a.nomComplet || '').localeCompare(String(b.nomComplet || ''))); }
function fonctionsDe(userId){
  const f = (DB.fonctionsCompte || []).filter(x => x.userId === userId);
  if(f.length) return f;
  const p = (DB.profiles || []).find(x => x.id === userId); return p ? [{ userId, role: p.role, enseignantId: p.enseignantId || null }] : [];
}
function renderPlusieursFonctions(){
  if(!['direction','fondation'].includes(ui.role)) return '';
  const comptes = comptesPersonnel(); if(!comptes.length) return '';
  const lib = r => (LIB_FONCTIONS[r] || [r])[0];
  const multiples = comptes.filter(p => fonctionsDe(p.id).length > 1);
  return `<details class="panel panneau-fonctions"${multiples.length ? ' open' : ''}>
    <summary><strong>${icone('users')} Une même personne, plusieurs fonctions</strong> <span class="hint" style="margin:0;">${multiples.length ? multiples.length + ' compte(s) à plusieurs fonctions' : 'directeur qui enseigne, secrétaire qui enseigne…'}</span></summary>
    <p class="hint">Un seul compte, plusieurs fonctions. À la connexion, la personne choisit « Se connecter en tant que … ». Chaque fonction a son espace : en Direction ou au Secrétariat, rien de son espace Enseignant n’apparaît (ni tâches, ni rappels, ni brouillons) ; elle ne le voit qu’en se connectant en tant qu’Enseignant(e).</p>
    <ul class="fc-liste">${comptes.map(p => { const fs = fonctionsDe(p.id); return `<li class="fc-ligne"><div><strong>${escapeHtml(p.nomComplet || 'Compte')}</strong>
      <span class="fc-badges">${fs.map(f => `<span class="badge-etat ${f.role === p.role ? 'ok' : ''}">${escapeHtml(lib(f.role))}${f.enseignantId ? ' · ' + escapeHtml((e => e ? ensFullName(e) : '')(enseignantById(f.enseignantId))) : ''}${f.role === p.role ? ' (en cours)' : ''}${fs.length > 1 && f.role !== p.role ? ` <button type="button" class="lien-discret" aria-label="Retirer la fonction ${escapeHtml(lib(f.role))}" onclick="retirerFonction('${p.id}','${f.role}')">✕</button>` : ''}</span>`).join(' ')}</span></div>
      <span class="fc-ajout"><select aria-label="Fonction à ajouter à ${escapeHtml(p.nomComplet || 'ce compte')}" id="fcAjout_${p.id}" onchange="document.getElementById('fcFiche_${p.id}').hidden = this.value !== 'enseignant'"><option value="">+ Ajouter une fonction…</option>${['direction','secretariat','enseignant'].concat(ui.role === 'fondation' ? ['fondation'] : []).filter(r => !fs.some(f => f.role === r)).map(r => `<option value="${r}">${escapeHtml(lib(r))}</option>`).join('')}</select>
        <select id="fcFiche_${p.id}" hidden aria-label="Fiche enseignant">${(DB.enseignants || []).filter(t => t.statut === 'Actif' && !(DB.profiles || []).some(x => x.enseignantId === t.id && x.id !== p.id) && !(DB.fonctionsCompte || []).some(x => x.enseignantId === t.id && x.userId !== p.id)).map(t => `<option value="${t.id}">${escapeHtml(ensFullName(t))}</option>`).join('')}</select>
        <button type="button" class="btn secondary sm" onclick="const r = document.getElementById('fcAjout_${p.id}').value; if(!r) return; attribuerFonction('${p.id}', r, r === 'enseignant' ? document.getElementById('fcFiche_${p.id}').value : null)">Ajouter</button></span></li>`; }).join('')}</ul>
  </details>`;
}
async function attribuerFonction(userId, role, enseignantId){
  if(role === 'enseignant' && !enseignantId){ alert('Choisissez la fiche enseignant.'); return; }
  const { error } = await sb.rpc('attribuer_fonction', { p_user: userId, p_role: role, p_enseignant: enseignantId || null });
  if(error){ alert('Impossible : ' + error.message); return; }
  DB.fonctionsCompte = await dbSelectAll('fonctions_compte').catch(() => DB.fonctionsCompte || []);
  closeModal(); toast('Fonction ajoutée ✅ : à sa prochaine connexion, la personne choisira « Se connecter en tant que … »'); renderView(ui.currentView);
}
async function retirerFonction(userId, role){
  if(!confirm(`Retirer la fonction ${(LIB_FONCTIONS[role] || [role])[0]} de ce compte ?`)) return;
  const { error } = await sb.rpc('retirer_fonction', { p_user: userId, p_role: role });
  if(error){ alert('Impossible : ' + error.message); return; }
  DB.fonctionsCompte = await dbSelectAll('fonctions_compte').catch(() => DB.fonctionsCompte || []);
  toast('Fonction retirée'); renderView(ui.currentView);
}
function renderSuiviHoraires(){
  const actifs = (DB.enseignants || []).filter(t => t.statut === 'Actif' && (t.classesAssignees || []).length);
  if(!actifs.length) return '';
  const sans = actifs.filter(t => !creneauxEnseignant(t).length);
  const proposables = sans.filter(t => creneauxProposes(t.id, t.classesAssignees).length);
  if(!sans.length) return `<div class="panel horaires-suivi ok"><div class="hs-tete">${icone('circle-check')} <div><strong>Horaires de cours : ${actifs.length}/${actifs.length} enseignants</strong><span>Chaque enseignant reçoit le rappel de l’appel pendant ses cours.</span></div></div></div>`;
  return `<div class="panel horaires-suivi">
    <div class="hs-tete">${icone('clock')} <div><strong>Horaires de cours : ${actifs.length - sans.length}/${actifs.length} enseignants</strong>
      <span>Sans horaire, un enseignant ne reçoit <strong>aucun</strong> rappel d’appel. Manquent : ${sans.map(t => escapeHtml(ensFullName(t))).join(', ')}.</span></div></div>
    ${proposables.length ? `<button type="button" class="btn sm" onclick="ouvrirRemplissageHoraires()">${icone('sparkles')} Remplir d’après l’emploi du temps (${proposables.length})</button>` : '<p class="hint" style="margin:6px 0 0;">Ouvrez la fiche de chaque enseignant (✏️) pour indiquer ses jours et heures.</p>'}
  </div>`;
}
function ouvrirRemplissageHoraires(){
  const liste = (DB.enseignants || []).filter(t => t.statut === 'Actif' && (t.classesAssignees || []).length && !creneauxEnseignant(t).length)
    .map(t => ({ t, cr: creneauxProposes(t.id, t.classesAssignees) })).filter(x => x.cr.length);
  openModal('Remplir les horaires de cours', `
    <p style="margin-top:0;">Horaires proposés d’après <strong>l’emploi du temps de l’école</strong> (du début de la première séance à la fin de la dernière, chaque jour) ou, pour une classe sans emploi du temps, d’après <strong>les horaires de l’école</strong> (Paramètres → Horaires). Décochez ceux qui ne conviennent pas ; ils restent modifiables dans la fiche de chaque enseignant.</p>
    <ul class="hs-liste">${liste.map(x => `<li><label class="hs-ligne"><input type="checkbox" class="hs-coche" value="${x.t.id}" checked>
      <span><strong>${escapeHtml(ensFullName(x.t))}</strong><small class="hs-origine">D’après ${x.cr.every(p => p.origine === 'ecole') ? 'les horaires de l’école' : x.cr.some(p => p.origine === 'ecole') ? 'l’emploi du temps et les horaires de l’école' : 'l’emploi du temps'}</small><span class="creneaux-fiche" style="margin-top:4px;">${texteCreneaux(x.cr)}</span></span></label></li>`).join('')}</ul>
    <div class="pin-error" id="hsErr"></div>
    <div class="form-actions"><button type="button" class="btn secondary" onclick="closeModal()">Annuler</button>
      <button type="button" class="btn" id="hsOk" onclick="enregistrerRemplissageHoraires()">${icone('save')} Enregistrer ces horaires</button></div>`);
}
async function enregistrerRemplissageHoraires(){
  const ids = [...document.querySelectorAll('.hs-coche:checked')].map(x => x.value);
  if(!ids.length){ closeModal(); return; }
  const b = document.getElementById('hsOk'); if(b) b.disabled = true;
  let ok = 0; const echecs = [];
  for(const id of ids){
    const t = enseignantById(id); if(!t) continue;
    const { data, error } = await sb.rpc('definir_creneaux', { p_creneaux: creneauxProposes(id, t.classesAssignees), p_enseignant: id });
    if(error) echecs.push(`${ensFullName(t)} : ${error.message}`); else { t.creneaux = data; ok++; }
  }
  if(echecs.length){ const e = document.getElementById('hsErr'); if(e) e.textContent = echecs.join(' · '); if(b) b.disabled = false; renderView('enseignants'); return; }
  closeModal(); toast(`Horaires enregistrés pour ${ok} enseignant(s) ✅ : rappels d’appel pendant leurs cours`); renderView('enseignants');
}
function renderEnseignants(){
  const list = DB.enseignants.slice().sort((a,b)=>a.nom.localeCompare(b.nom));
  const sansCompte = list.filter(t => t.statut === 'Actif' && !(DB.profiles || []).some(p => p.enseignantId === t.id)).length;
  const rows = list.map(t=>{
    const profilLie = (DB.profiles||[]).find(p=>p.enseignantId===t.id) || compteParFonction(t.id);
    return `
    <tr>
      <td><div class="row-name"><span class="avatar">${initials(t.prenom,t.nom)}</span>${escapeHtml(ensFullName(t))}</div></td>
      <td>${escapeHtml(t.matricule)}</td>
      <td>${t.classesAssignees.map(cid=>`<span class="badge blue" style="margin:1px;">${classeName(cid)}</span>`).join(' ')}</td>
      <td>${t.matieres.join(', ')}</td>
      <td>${escapeHtml(t.telephone)}</td>
      <td><span class="badge ${t.statut==='Actif'?'green':'gray'}">${t.statut}</span></td>
      <td>${profilLie ? `<span class="badge green">Accès actif</span>` : `<button type="button" class="btn sm" onclick="ouvrirAccesPersonnel('${t.id}')">Activer son accès</button>`}</td>
      <td style="white-space:nowrap;">
        <button class="icon-btn" title="Rapport d’activité" aria-label="Rapport d’activité" onclick="ui.filters.rapportEns='${t.id}'; go('rapport-activite')">📈</button>
        <button class="icon-btn" title="Modifier" onclick="openEnseignantForm('${t.id}')">✏️</button>
        ${profilLie ? `<button class="icon-btn" title="Son compte" aria-label="Son compte" onclick="ouvrirAccesPersonnel('${t.id}')">🔗</button>` : ''}
        <button class="icon-btn danger" title="Supprimer" onclick="deleteEnseignant('${t.id}')">🗑️</button>
      </td>
    </tr>`;
  }).join('');

  return `
  <div class="view active">
    ${renderSuiviHoraires()}
    ${renderPlusieursFonctions()}
    <div class="panel panneau-inscriptions" id="panneauInscriptionsEns">
      <div class="panel-head">
        <div><h2>Inscriptions des enseignants</h2><div class="sub" id="compteurInscriptions">Chargement…</div></div>
        <button type="button" class="btn secondary sm" onclick="chargerDemandesAcces()">Actualiser</button>
      </div>
      <div class="hint" style="margin-top:0;">Chaque enseignant ouvre le lien EcoMaZ-ENSEIGNANTS, touche « Continuer avec Google » et coche ses classes. Vérifiez ses classes puis touchez « Approuver » : sa fiche est créée et il ne voit que ses classes.</div>
      ${renderClassesAValider()}
      <div id="demandesEnsBox" data-demandes-role="enseignant"><div class="hint">Chargement…</div></div>
      ${(setTimeout(chargerDemandesAcces, 0), '')}
    </div>

    <div class="panel">
      <div class="panel-head">
        <div><h2>Liste des enseignants</h2><div class="sub">${list.length} enseignant(s)${sansCompte ? ` · <strong class="pe-a-faire">${sansCompte} pas encore inscrit${sansCompte > 1 ? 's' : ''}</strong>` : ''}</div></div>
        <div style="display:flex;flex-wrap:wrap;gap:6px;">
          ${sansCompte ? `<button type="button" class="btn secondary sm" onclick="ouvrirRelanceEnseignants()">${icone('send') || '📲'} Relancer les non-inscrits</button>` : ''}
          ${list.length ? `<button type="button" class="btn secondary sm" onclick="ouvrirListeEnseignants()">${icone('printer')} Imprimer la liste</button>` : ''}
          <button class="btn" onclick="openEnseignantForm()">+ Nouvel enseignant</button>
        </div>
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
      <span>Chaque enseignant scanne ce code (ou ouvre le lien), touche « Continuer avec Google » et coche ses classes. Vous validez en haut de cet écran (Inscriptions des enseignants) : sa fiche est créée toute seule, inutile de la saisir avant.</span>
      <div class="invit-ens-actions">
        <button type="button" class="btn sm" onclick="window.open('https://wa.me/?text=' + encodeURIComponent(messagePartageApplication('enseignant.html')), '_blank', 'noopener')">Partager sur WhatsApp</button>
        <button type="button" class="btn secondary sm" onclick="copierLienApplication('enseignant.html')">Copier le lien</button>
        <button type="button" class="btn secondary sm" onclick="imprimerAffiche('enseignant.html')">Affiche A4</button>
        <button type="button" class="btn secondary sm" onclick="imprimerGuideEnseignant()">Mode d’emploi (1 page)</button>
      </div>
    </div>
  </div>`;
}
/* ---------- Relance des enseignants qui ont une fiche mais pas encore de compte ---------- */
function titreEnseignant(t){ return t.sexe === 'F' ? 'Maîtresse' : t.sexe === 'M' ? 'M.' : ''; }
function ouvrirRelanceEnseignants(){
  const liste = DB.enseignants.filter(t => t.statut === 'Actif' && !(DB.profiles || []).some(p => p.enseignantId === t.id))
    .sort((a, b) => (a.nom || '').localeCompare(b.nom || ''));
  window.__relancesEnvoyees = window.__relancesEnvoyees || new Set();
  const ligne = t => {
    const tels = telephonesWhatsapp(t.telephone);
    const bonjour = `Bonjour ${[titreEnseignant(t), t.prenom, t.nom].filter(Boolean).join(' ')},\n\n`;
    const texte = encodeURIComponent(bonjour + messagePartageApplication('enseignant.html'));
    const envoye = window.__relancesEnvoyees.has(t.id);
    return `<li class="relance-ligne${envoye ? ' envoye' : ''}" id="relance_${t.id}">
      <span class="relance-txt"><strong>${escapeHtml([titreEnseignant(t), t.prenom, t.nom].filter(Boolean).join(' '))}</strong>
        <small>${(t.classesAssignees || []).map(id => escapeHtml(classeName(id))).join(', ') || 'Aucune classe sur la fiche'}</small></span>
      <span class="relance-actions">${tels.length ? tels.map(n => `<a class="btn sm" href="https://wa.me/${n}?text=${texte}" target="_blank" rel="noopener" onclick="marquerRelance('${t.id}')">WhatsApp · ${n.replace(/^225/, '').replace(/(\d{2})(?=\d)/g, '$1 ')}</a>`).join('')
        : `<button type="button" class="btn secondary sm" onclick="closeModal(); openEnseignantForm('${t.id}')">Ajouter son numéro</button>`}
        ${envoye ? '<span class="badge-etat ok">Envoyé</span>' : ''}</span>
    </li>`;
  };
  openModal(`Relancer les enseignants pas encore inscrits (${liste.length})`, `
    <p class="hint" style="margin-top:0;">Un message personnel par enseignant, avec le lien de son application. Touchez « WhatsApp » : le message est prêt, il n’y a plus qu’à l’envoyer. Quand il s’inscrit, sa demande arrive en haut de l’écran Enseignants : choisissez « Relier à la fiche existante ».</p>
    ${liste.length ? `<ul class="relance-liste">${liste.map(ligne).join('')}</ul>` : '<div class="etat-vide etat-vide-ok"><span>Tous vos enseignants ont leur compte 🎉</span></div>'}
    <div class="form-actions"><button type="button" class="btn secondary" onclick="closeModal()">Fermer</button></div>`);
}
function marquerRelance(id){
  (window.__relancesEnvoyees = window.__relancesEnvoyees || new Set()).add(id);
  const li = document.getElementById('relance_' + id);
  if(li && !li.classList.contains('envoye')){ li.classList.add('envoye'); li.querySelector('.relance-actions')?.insertAdjacentHTML('beforeend', '<span class="badge-etat ok">Envoyé</span>'); }
}
/* ---------- Liste des enseignants imprimable (A4) ---------- */
function ouvrirListeEnseignants(){
  const m = DB.meta || {};
  const liste = DB.enseignants.filter(t => t.statut === 'Actif').sort((a, b) => (a.nom || '').localeCompare(b.nom || '') || (a.prenom || '').localeCompare(b.prenom || ''));
  const h = liste.filter(t => t.sexe === 'M').length, f = liste.filter(t => t.sexe === 'F').length;
  const aCompte = t => (DB.profiles || []).some(p => p.enseignantId === t.id);
  openModal('Liste des enseignants', `
    <div class="form-actions no-print" style="margin-top:0;justify-content:flex-end;"><button type="button" class="btn" onclick="window.print()">${icone('printer')} Imprimer / PDF</button></div>
    <section class="liste-classe">
      <div class="recu-head">${m.logo ? `<img src="${escapeHtml(m.logo)}" alt="">` : `<div class="recu-logo-ph">🎓</div>`}
        <div><strong>${escapeHtml(m.nomEcole || '')}</strong><div class="hint">${escapeHtml(m.adresse || '')}${m.telephone ? ' · ' + escapeHtml(m.telephone) : ''}</div></div>
        <div style="margin-left:auto;text-align:right;"><strong>LISTE DU PERSONNEL ENSEIGNANT</strong><div class="hint">${escapeHtml(m.anneeScolaire || '')}</div></div></div>
      <div class="lc-resume">Effectif : <strong>${liste.length}</strong> · Hommes : <strong>${h}</strong> · Femmes : <strong>${f}</strong> · Inscrits dans l’application : <strong>${liste.filter(aCompte).length}</strong></div>
      <table class="lc-table lc-ens"><thead><tr><th>N°</th><th>Matricule</th><th>Nom et prénom(s)</th><th>Classe(s)</th><th>Matière(s)</th><th>Téléphone</th><th>Appli</th></tr></thead>
        <tbody>${liste.map((t, i) => `<tr><td>${i + 1}</td><td>${escapeHtml(t.matricule || '')}</td>
          <td><strong>${escapeHtml(String(t.nom || '').toUpperCase())}</strong> ${escapeHtml(t.prenom || '')}</td>
          <td>${(t.classesAssignees || []).map(id => escapeHtml(classeName(id))).join(', ')}</td>
          <td>${escapeHtml((t.matieres || []).join(', '))}</td>
          <td style="white-space:nowrap;">${escapeHtml(t.telephone || '')}</td>
          <td>${aCompte(t) ? 'Oui' : 'Non'}</td></tr>`).join('')}</tbody></table>
      <div class="hint" style="margin-top:8px;">Imprimé le ${fmtDate(todayISO())} — document interne : ne pas afficher (contient des numéros de téléphone)</div>
    </section>`);
}
function ouvrirAccesPersonnel(enseignantId){
  const t = enseignantById(enseignantId); if(!t) return;
  const profilLie = (DB.profiles||[]).find(p=>p.enseignantId===enseignantId) || compteParFonction(enseignantId);
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
  if(['secretariat','direction','fondation'].includes(ui.role)){
    openModal('Activer l’accès de ' + ensFullName(t), `
      <form onsubmit="return activerAccesEnseignant(event,'${t.id}')">
        <p class="hint" style="margin-top:0;">Indiquez l’adresse <strong>Gmail</strong> de ${escapeHtml(ensFullName(t))}. Après activation, il ou elle ouvre l’application EcoMaZ-ENSEIGNANTS, touche « Continuer avec Google » avec cette adresse et entre directement dans sa console, sans autre validation.</p>
        <dl class="acces-ens"><div><dt>Classes visibles</dt><dd>${escapeHtml(classes)}</dd></div><div><dt>Matières</dt><dd>${escapeHtml(matieres)}</dd></div></dl>
        <div class="field"><label for="accesEmail">Adresse Gmail de l’enseignant(e)</label>
          <input type="email" id="accesEmail" required maxlength="120" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="prenom.nom@gmail.com" value="${escapeHtml(t.email || '')}"></div>
        <div class="pin-error" id="accesErr"></div>
        <div class="form-actions"><button type="button" class="btn secondary" onclick="closeModal()">Annuler</button><button type="submit" class="btn" id="accesBouton">Activer son accès</button></div>
      </form>
      ${['direction','fondation'].includes(ui.role) && comptesPersonnel().length ? `<details class="acces-autre"><summary>Cette personne a déjà un compte EcoMaZ dans l’école (direction, secrétariat…)</summary>
        <p class="hint">Une même personne peut avoir plusieurs fonctions avec <strong>un seul compte</strong>. À la connexion, elle choisit « Se connecter en tant que Enseignant(e) » ou sa fonction habituelle : chaque fonction a son espace, séparé.</p>
        <div class="field"><label for="fcCompte">Son compte</label><select id="fcCompte">${comptesPersonnel().map(p => `<option value="${p.id}">${escapeHtml(p.nomComplet || 'Compte')} — ${escapeHtml((LIB_FONCTIONS[p.role] || [p.role])[0])}</option>`).join('')}</select></div>
        <div class="form-actions" style="justify-content:flex-start;"><button type="button" class="btn secondary" onclick="attribuerFonction(document.getElementById('fcCompte').value, 'enseignant', '${t.id}')">Lui ajouter la fonction Enseignant(e)</button></div>
      </details>` : ''}
      <details class="acces-autre"><summary>L’enseignant(e) préfère s’inscrire lui-même ou elle-même</summary>
        <p class="hint">Envoyez-lui le lien : il ou elle touche « Continuer avec Google » et coche ses classes ; sa demande arrive en haut de cet écran, choisissez alors « Relier à la fiche existante : ${escapeHtml(ensFullName(t))} ».</p>
        <div class="form-actions" style="flex-wrap:wrap;justify-content:flex-start;">
          ${tels.map(n => `<a class="btn secondary sm" href="https://wa.me/${n}?text=${texte}" target="_blank" rel="noopener">WhatsApp · ${n.replace(/^225/, '').replace(/(\d{2})(?=\d)/g, '$1 ')}</a>`).join('')}
          <button type="button" class="btn secondary sm" onclick="copierLienApplication('enseignant.html')">Copier le lien</button>
        </div>
      </details>`);
    return;
  }
  openModal('Inviter ' + ensFullName(t), `
    <p class="hint" style="margin-top:0;">Chaque enseignant a son <strong>propre compte</strong>. ${escapeHtml(ensFullName(t))} ouvre le lien, touche « Continuer avec Google » et coche ses classes ; vous validez dans Enseignants → Inscriptions des enseignants en choisissant « Relier à la fiche existante : ${escapeHtml(ensFullName(t))} ».</p>
    <dl class="acces-ens"><div><dt>Il ou elle verra</dt><dd>${escapeHtml(classes)} — ${escapeHtml(matieres)}</dd></div></dl>
    <div class="form-actions" style="flex-wrap:wrap;">
      ${tels.map(n => `<a class="btn" href="https://wa.me/${n}?text=${texte}" target="_blank" rel="noopener">Envoyer sur WhatsApp · ${n.replace(/^225/, '').replace(/(\d{2})(?=\d)/g, '$1 ')}</a>`).join('')}
      <button type="button" class="btn secondary" onclick="copierLienApplication('enseignant.html')">Copier le lien</button>
      <button type="button" class="btn secondary" onclick="closeModal()">Fermer</button>
    </div>`);
}

async function activerAccesEnseignant(ev, enseignantId){
  ev.preventDefault();
  const t = enseignantById(enseignantId); if(!t) return false;
  const email = $('#accesEmail').value.trim().toLowerCase(), err = $('#accesErr'), b = $('#accesBouton');
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){ err.textContent = 'Adresse e-mail invalide.'; return false; }
  if(!/@gmail\.com$|@googlemail\.com$/.test(email) && !confirm('Cette adresse n’est pas une adresse Gmail. « Continuer avec Google » ne marchera que si c’est un compte Google. Continuer quand même ?')) return false;
  b.disabled = true; b.textContent = 'Activation…'; err.textContent = '';
  try{
    const { data, error } = await sb.functions.invoke('activer-acces-enseignant', { body: { enseignantId, email } });
    if(error) throw new Error(await messageErreurFonction(error));
    if(!data?.ok) throw new Error(data?.error || 'Activation impossible');
    DB.profiles = (DB.profiles || []).concat([{ id: data.profilId, ecoleId: session.ecoleId, role: 'enseignant', enseignantId, nomComplet: ensFullName(t) }]);
    if(DB.aTraiter) DB.aTraiter.charge = 0;
    toast(`Accès activé ✅ : ${ensFullName(t)} peut entrer avec « Continuer avec Google »`);
    // Prévenir l'enseignant tout de suite (message prêt, gratuit)
    const tels = telephonesWhatsapp(t.telephone);
    const msg = `Bonjour ${[titreEnseignant(t), t.prenom, t.nom].filter(Boolean).join(' ')},\n\nVotre accès à l'application EcoMaZ-ENSEIGNANTS ${DB.meta.nomEcole} est activé.\n\n1. Ouvrez ce lien dans Chrome : ${lienApplication('enseignant.html')}\n2. Touchez « Continuer avec Google »\n3. Choisissez votre adresse ${email}\n\nVous arrivez directement dans votre console, avec vos classes.`;
    openModal('Accès activé ✅', `
      <p style="margin-top:0;">${escapeHtml(ensFullName(t))} peut maintenant entrer dans sa console avec <strong>${escapeHtml(email)}</strong> (bouton « Continuer avec Google »).</p>
      <div class="form-actions" style="flex-wrap:wrap;justify-content:flex-start;">
        ${tels.map(n => `<a class="btn" href="https://wa.me/${n}?text=${encodeURIComponent(msg)}" target="_blank" rel="noopener">Le prévenir sur WhatsApp · ${n.replace(/^225/, '').replace(/(\d{2})(?=\d)/g, '$1 ')}</a>`).join('') || `<button type="button" class="btn" onclick="navigator.clipboard && navigator.clipboard.writeText(${escapeHtml(JSON.stringify(msg))}).then(() => toast('Message copié'))">Copier le message pour le prévenir</button>`}
        <button type="button" class="btn secondary" onclick="closeModal(); renderView('enseignants')">Fermer</button>
      </div>`);
    renderView('enseignants');
  }catch(e){ err.textContent = 'Activation impossible : ' + e.message; b.disabled = false; b.textContent = 'Activer son accès'; }
  return false;
}
function openEnseignantForm(id){
  const t = id ? enseignantById(id) : null;
  const allMatieres = [...new Set(Object.values(MATIERES_BY_CYCLE).flat())];
  openModal(t ? "Modifier l'enseignant" : 'Nouvel enseignant', `
    <div class="hint" style="margin-top:0;">Si vous cochez des <strong>matières</strong>, l’enseignant ne verra et ne saisira que ces matières dans ses classes. Sans matière cochée : toutes les matières de ses classes.</div>
    <form id="formEns" onsubmit="return handleSaveEnseignant(event)">
      <input type="hidden" name="id" value="${t?t.id:''}">
      ${boutonRemplissage('enseignant', 'SCHEMA_ENSEIGNANT', 'formEns')}
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
        <div class="field span2">${editeurCreneaux(DB.classes.map(c => c.id), creneauxEnseignant(t), 'Jours et heures de cours', t ? creneauxProposes(t.id, t.classesAssignees || []) : [])}</div>
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
  const lu = lireCreneaux(ev.target) || { creneaux: [] };
  if(lu.erreur){ alert(lu.erreur); return false; }
  const horsClasse = lu.creneaux.find(c => !patch.classesAssignees.includes(c.classe));
  if(horsClasse){ alert(`Cochez aussi la classe ${classeName(horsClasse.classe)} dans « Classes assignées » (ou retirez son horaire).`); return false; }
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
    const idEns = id || DB.enseignants[DB.enseignants.length - 1]?.id;
    if(idEns && JSON.stringify(lu.creneaux) !== JSON.stringify(creneauxEnseignant(enseignantById(idEns)))){
      const { data: enreg, error } = await sb.rpc('definir_creneaux', { p_creneaux: lu.creneaux, p_enseignant: idEns });
      if(error) throw error;
      const f = enseignantById(idEns); if(f) f.creneaux = enreg;
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

