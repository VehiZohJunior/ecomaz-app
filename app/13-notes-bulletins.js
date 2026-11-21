/* ---------------------------------------------------------------------
   6. NOTES & BULLETINS (saisie)
   --------------------------------------------------------------------- */
// Trimestre d'une date : d'après les « Fin du 1er / 2e trimestre » de l'agenda, sinon découpage habituel
function trimestreDeDate(iso){
  const fins = (DB.agenda || []).filter(e => /fin du\s*1(er)?\s*trimestre/i.test(e.titre) || /fin du\s*2e?\s*trimestre/i.test(e.titre))
    .map(e => ({ n: /fin du\s*1/i.test(e.titre) ? 1 : 2, d: e.dateFin || e.dateDebut }));
  const f1 = fins.find(x => x.n === 1)?.d, f2 = fins.find(x => x.n === 2)?.d;
  if(f1 && f2) return iso <= f1 ? 'Trimestre 1' : iso <= f2 ? 'Trimestre 2' : 'Trimestre 3';
  const m = Number(iso.slice(5, 7));
  return m >= 9 ? 'Trimestre 1' : m <= 3 ? 'Trimestre 2' : 'Trimestre 3';
}
// Compositions prévues à l'agenda pour une classe et un trimestre (dans l'ordre)
function compositionsAgenda(classeId, trimestre){
  return (DB.agenda || []).filter(e => e.type === 'examen' && /composition/i.test(e.titre) && (!e.classeIds || !e.classeIds.length || e.classeIds.includes(classeId)) && trimestreDeDate(e.dateDebut) === trimestre)
    .sort((a, b) => a.dateDebut.localeCompare(b.dateDebut));
}
function renderNotes(){
  const mesClasses = classesVisibles();
  if(mesClasses.length === 0){
    return `<div class="view active"><div class="panel"><div class="empty-state"><div class="em-ic">📝</div>Aucune classe configurée pour le moment. Activez au moins un niveau scolaire dans Paramètres pour commencer à saisir des notes.</div></div></div>`;
  }
  const f = ui.filters.notes || {classeId: mesClasses[0].id, matiere:'', trimestre: trimestreCourant(), auto: true};
  if(f.auto) f.trimestre = trimestreCourant(); // suit l'agenda dès qu'il est chargé, tant que l'utilisateur n'a pas choisi
  if(!mesClasses.some(c=>c.id===f.classeId)) f.classeId = mesClasses[0].id;
  if(!f.matiere) f.matiere = MATIERES_BY_CYCLE[classeCycle(f.classeId)][0];
  ui.filters.notes = f;

  const cycle = classeCycle(f.classeId);
  const ficheEns = ui.role === 'enseignant' && session.enseignantId ? enseignantById(session.enseignantId) : null;
  const toutes = MATIERES_BY_CYCLE[cycle] || [];
  const siennes = toutes.filter(m => (ficheEns?.matieres || []).includes(m));
  const matieres = siennes.length ? siennes : toutes; // un enseignant spécialiste ne voit que ses matières
  if(!matieres.includes(f.matiere)) f.matiere = matieres[0];

  const eleves = DB.eleves.filter(e=>e.classeId===f.classeId && e.statut==='Actif').sort((a,b)=>a.nom.localeCompare(b.nom));
  // Plusieurs compositions par trimestre (agenda de l'école) : chaque note est rangée à la date de SA composition
  chargerAgenda();
  const compos = compositionsAgenda(f.classeId, f.trimestre);
  const auj = todayISO();
  if(!compos.some(c => c.dateDebut === f.compo)) f.compo = (compos.filter(c => c.dateDebut <= auj).pop() || compos[0] || {}).dateDebut || '';
  const compoChoisie = compos.find(c => c.dateDebut === f.compo);

  const rows = eleves.map((e, i)=>{
    const notes = DB.notes.filter(n=>n.eleveId===e.id && n.matiere===f.matiere && n.trimestre===f.trimestre);
    const notesCompo = notes.filter(n=>n.type==='Composition');
    const compo = compoChoisie ? notesCompo.find(n => n.date === compoChoisie.dateDebut) : notesCompo[0];
    const m = moyenneMatiere(e.id, f.matiere, f.trimestre);
    return `<li class="nt-ligne">
      <span class="nt-eleve"><span class="avatar" aria-hidden="true">${initials(e.prenom,e.nom)}</span><span class="nt-nom"><strong>${escapeHtml(eleveFullName(e))}</strong>
        <small>Camps de base : ${m.classe !== null ? `<b>${m.classe.toFixed(2)}</b> (${m.nbClasse} note${m.nbClasse > 1 ? 's' : ''})` : 'aucune note'}${compos.length > 1 && m.compo !== null ? ` · compositions : <b>${m.compo.toFixed(2)}</b>` : ''}</small></span></span>
      <input type="text" inputmode="decimal" class="nt-note" data-eleve="${e.id}" data-type="Composition" data-date="${compoChoisie ? compoChoisie.dateDebut : ''}" data-avant="${compo ? compo.note : ''}" value="${compo ? compo.note : ''}" placeholder="—" enterkeyhint="next" aria-label="Note de composition de ${escapeHtml(eleveFullName(e))} sur 20"
        onkeydown="if(event.key==='Enter'){ event.preventDefault(); const s=document.querySelectorAll('#tableNotes .nt-note')[${i + 1}]; if(s) s.focus(); else document.getElementById('btnNotesCompo')?.focus(); }" oninput="majCompteurCompo()">
    </li>`;
  }).join('');

  return `
  <div class="view active">
    <details class="section-note camps-aide"><summary>💡 Ici : les notes de <strong>composition</strong> et les <strong>appréciations du bulletin</strong>. <span class="lien-discret">En savoir plus</span></summary>
      <p>Les devoirs, exercices et interrogations se saisissent dans <a href="#" onclick="go('camps-de-base'); return false;">Camps de base</a> : leur moyenne s’affiche à côté de chaque élève. Moyenne de la matière = (moyenne de classe + 2 × composition) ÷ 3.</p></details>
    ${['direction','fondation'].includes(ui.role) ? `<div class="panel">
      <div class="panel-head"><div><h2>📒 Bulletins visibles par les parents</h2><div class="sub">Publiez un trimestre quand toutes les notes sont saisies : chaque parent verra le bulletin de SES enfants dans son application</div></div></div>
      <div style="display:flex;flex-wrap:wrap;gap:14px;">${TRIMESTRES.map(t => `<label style="display:flex;align-items:center;gap:8px;font-weight:700;"><input type="checkbox" ${(DB.meta.bulletinsPublies || []).includes(t) ? 'checked' : ''} onchange="publierBulletins('${t}', this.checked)"> ${t} publié</label>`).join('')}</div>
      <div class="hint" style="margin:10px 0 0;">Une fois un trimestre publié, ses notes sont verrouillées : seules la direction et la fondation peuvent encore les corriger, et chaque correction est gardée dans l’historique.</div>
      <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:10px;">
        <button type="button" class="btn sm" onclick="confirmerPublicationBulletins(trimestreCourant(), true)">${icone('clipboard')} État des bulletins du ${libelleTrimestre(trimestreCourant())}</button>
        <button type="button" class="btn secondary sm" onclick="ouvrirHistoriqueNotes()">${icone('scroll-text')} Historique des modifications de notes</button></div>
    </div>` : ''}

    <div class="panel">
      <div class="panel-head"><div><h2>Notes de composition — ${escapeHtml(f.matiere)}</h2><div class="sub">${escapeHtml(classeName(f.classeId))} · ${eleves.length} élève(s) · ${libelleTrimestre(f.trimestre)}</div></div></div>
      <div class="camps-choix">
        ${mesClasses.length > 1 ? `<div class="camps-ligne"><span class="camps-lib">Classe</span><div class="dv-puces">${mesClasses.map(c => `<button type="button" class="dv-puce${c.id === f.classeId ? ' actif' : ''}" data-val="${escapeHtml(c.id)}" onclick="notesChoisir('classeId', this.dataset.val)">${escapeHtml(c.nom)}</button>`).join('')}</div></div>` : ''}
        ${matieres.length > 1 ? `<div class="camps-ligne"><span class="camps-lib">Matière</span><div class="dv-puces">${matieres.map(m => `<button type="button" class="dv-puce${m === f.matiere ? ' actif' : ''}" data-val="${escapeHtml(m)}" onclick="notesChoisir('matiere', this.dataset.val)">${escapeHtml(m)}</button>`).join('')}</div></div>` : ''}
        <div class="camps-ligne"><span class="camps-lib">Trimestre</span><div class="dv-puces">${TRIMESTRES.map(t => `<button type="button" class="dv-puce${t === f.trimestre ? ' actif' : ''}" data-val="${t}" onclick="notesChoisir('trimestre', this.dataset.val)">${libelleTrimestre(t)}${t === trimestreCourant() ? ' (en cours)' : ''}</button>`).join('')}</div></div>
      </div>
      ${(DB.meta.bulletinsPublies || []).includes(f.trimestre) && !['direction','fondation'].includes(ui.role) ? `<div class="banniere-discrete" style="margin-bottom:10px;"><span>${icone('lock')}</span><span>Les bulletins du ${escapeHtml(f.trimestre)} sont publiés : ces notes sont verrouillées. Pour une correction, adressez-vous à la direction.</span></div>` : ''}
      ${compos.length ? `<div class="segmente compos-choix" role="tablist" aria-label="Composition">${compos.map(c => `<button type="button" role="tab" class="seg${c.dateDebut === f.compo ? ' actif' : ''}" aria-selected="${c.dateDebut === f.compo}" onclick="ui.filters.notes.compo='${c.dateDebut}'; renderView('notes')">${escapeHtml(c.titre.replace(/composition/i, 'compo.').trim())} · ${fmtDate(c.dateDebut).slice(0, 5)}${c.dateDebut > auj ? ' <span class="hint" style="margin:0;">à venir</span>' : ''}</button>`).join('')}</div>
        <div class="hint" style="margin:6px 0 10px;">${compos.length > 1 ? `${compos.length} compositions ce trimestre (agenda de l’école) : la moyenne de composition est la moyenne de toutes. ` : ''}Moyenne de la matière = (moyenne de classe + 2 × composition) ÷ 3.</div>` : ''}
      ${eleves.length===0 ? `<div class="empty-state"><div class="em-ic">📝</div>Aucun élève actif dans cette classe.</div>` : `
      <div class="camps-compteur" aria-live="polite"><span id="compteurCompo">${eleves.filter(e => DB.notes.some(n => n.eleveId === e.id && n.matiere === f.matiere && n.trimestre === f.trimestre && n.type === 'Composition' && (!compoChoisie || n.date === compoChoisie.dateDebut) && n.note != null)).length}</span> note(s) sur ${eleves.length} élève(s) — ${compoChoisie ? `${escapeHtml(compoChoisie.titre)} du ${fmtDate(compoChoisie.dateDebut)}` : 'composition'}, sur 20. « Entrée » passe à l’élève suivant ; laissez vide si l’élève était absent.</div>
      ${blocRemplissageNotes('compo', eleves.map(e => e.id), 20)}
      <ul class="nt-liste" id="tableNotes">${rows}</ul>
      <div class="form-actions"><button class="btn" id="btnNotesCompo" onclick="saveNotesTable()">Enregistrer les notes</button></div>`}
    </div>
    ${renderAppreciations(f.classeId, f.trimestre)}
    ${renderResultatsTrimestre(f.classeId, f.trimestre)}
  </div>`;
}

// Historique des modifications de notes (direction / fondation) — schema.sql section 98
async function ouvrirHistoriqueNotes(){
  openModal('Historique des modifications de notes', '<div class="hint">Chargement…</div>');
  const { data, error } = await sb.from('journal_notes').select('*').eq('ecole_id', session.ecoleId).order('created_at', { ascending: false }).limit(100);
  if(error){ $('#modalBody').innerHTML = `<div class="hint">Erreur : ${escapeHtml(error.message)}</div>`; return; }
  const libs = { modification:'Modifiée', suppression:'Supprimée', ajout_apres_publication:'Ajoutée après publication' };
  $('#modalBody').innerHTML = !data.length
    ? `<div class="etat-vide etat-vide-ok"><span class="etat-vide-ic" aria-hidden="true">${icone('circle-check')}</span><span>Aucune note modifiée pour l’instant.</span></div>`
    : `<p class="hint" style="margin-top:0;">Les 100 dernières modifications, notées automatiquement par la base (impossible à effacer).</p>
       <ul class="liste-compacte hist-notes">${data.map(j => { const e = eleveById(j.eleve_id); return `<li class="lc-ligne"><span class="lc-txt" style="display:flex;flex-direction:column;">
         <strong>${escapeHtml(e ? eleveFullName(e) : 'Élève')} · ${escapeHtml(j.matiere || '')} · ${escapeHtml(j.trimestre || '')}</strong>
         <small>${libs[j.action] || j.action} : ${j.note_avant ?? '—'} → ${j.note_apres ?? '—'} · par ${escapeHtml(j.auteur_nom || '?')} (${escapeHtml(j.auteur_role || '')}) · ${new Date(j.created_at).toLocaleString('fr-FR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' })}</small></span></li>`; }).join('')}</ul>`;
}
let notesEnCours = false;
async function saveNotesTable(){
  const f = ui.filters.notes;
  if(notesEnCours) return;
  const btn = document.getElementById('btnNotesCompo');
  const nouveaux = [], modifs = [], suppr = [];
  for(const inp of $$('#tableNotes .nt-note')){
    const brut = inp.value.trim().replace(',', '.');
    const eleveId = inp.dataset.eleve, type = inp.dataset.type, dateCompo = inp.dataset.date || '';
    const n = DB.notes.find(x=>x.eleveId===eleveId && x.matiere===f.matiere && x.trimestre===f.trimestre && x.type===type && (!dateCompo || x.date === dateCompo));
    if(brut === ''){ if(n) suppr.push(n); continue; }
    const note = Number(brut);
    if(!(note >= 0 && note <= 20)){ inp.focus(); alert(`Note impossible (${inp.value}) : elle doit être entre 0 et 20.`); return; }
    if(!n) nouveaux.push({ eleveId, matiere:f.matiere, note, noteSur:20, trimestre:f.trimestre, type, date: dateCompo || todayISO() });
    else if(Number(n.note) !== note) modifs.push({ n, note }); // une note inchangée n'est jamais renvoyée (ni verrou, ni faux auteur)
  }
  if(!nouveaux.length && !modifs.length && !suppr.length){ toast('Aucun changement'); return; }
  if(suppr.length && !confirm(`${suppr.length} note(s) effacée(s) : elles seront supprimées. Continuer ?`)) return;
  notesEnCours = true; if(btn){ btn.disabled = true; btn.textContent = 'Enregistrement…'; }
  try{
    if(nouveaux.length){
      try{ DB.notes.push(...await dbInsertMany('notes', nouveaux)); }
      catch(_e){ for(const x of nouveaux) DB.notes.push(await dbInsert('notes', x)); }
    }
    for(const m of modifs){ await dbUpdate('notes', m.n.id, { note: m.note }); m.n.note = m.note; }
    for(const n of suppr){ await dbDelete('notes', n.id); DB.notes = DB.notes.filter(x => x.id !== n.id); }
    toast(`${nouveaux.length + modifs.length + suppr.length} note(s) enregistrée(s)`);
    notesEnCours = false; renderView('notes');
  }catch(e){
    notesEnCours = false; if(btn){ btn.disabled = false; btn.textContent = 'Enregistrer les notes'; }
    alert('Erreur : ' + e.message);
  }
}
function majCompteurCompo(){
  const c = document.getElementById('compteurCompo'); if(!c) return;
  c.textContent = $$('#tableNotes .nt-note').filter(i => i.value.trim() !== '').length;
}
function notesChoisir(champ, valeur){
  const f = ui.filters.notes; if(!f) return;
  f[champ] = valeur; if(champ === 'trimestre') f.auto = false; if(champ === 'classeId') f.matiere = '';
  renderView('notes');
}
function allerAppreciations(classeId, trim){
  allerNotesClasse(classeId, trim);
  setTimeout(() => document.getElementById('appreciations')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 250);
}
/* ---------- Appréciations du bulletin, classe entière (titulaire, direction) ---------- */
const PHRASES_APPRECIATION = [
  [16, 'Excellent travail. Félicitations !'],
  [14, 'Très bon travail. Continuez ainsi.'],
  [12, 'Bon travail. Peut encore progresser.'],
  [10, 'Assez bien. Des efforts à poursuivre.'],
  [8, 'Résultats insuffisants. Doit travailler davantage.'],
  [0, 'Travail très insuffisant. Doit redoubler d’efforts.'],
];
function phraseSuggeree(moy){ return moy == null ? '' : (PHRASES_APPRECIATION.find(([s]) => moy >= s) || PHRASES_APPRECIATION[PHRASES_APPRECIATION.length - 1])[1]; }
function renderAppreciations(classeId, trimestre){
  const admin = ['secretariat','direction','fondation'].includes(ui.role);
  const fiche = ui.role === 'enseignant' && session.enseignantId ? enseignantById(session.enseignantId) : null;
  const c = DB.classes.find(x => x.id === classeId); if(!c) return '';
  // Le titulaire (ou l'enseignant de toutes les matières) écrit les appréciations ; un spécialiste ne les voit pas ici
  if(!admin && !(c.titulaireId ? c.titulaireId === session.enseignantId : !(fiche?.matieres || []).length)) return '';
  const eleves = DB.eleves.filter(e => e.classeId === classeId && e.statut === 'Actif').sort((a, b) => a.nom.localeCompare(b.nom));
  if(!eleves.length) return '';
  const r = resultatsClasse(classeId, trimestre);
  const ligneDe = id => (r.lignes || []).find(l => l.eleve.id === id);
  const verrou = (DB.meta.bulletinsPublies || []).includes(trimestre) && !['direction','fondation'].includes(ui.role);
  const ecrites = eleves.filter(e => String((DB.bulletinsComments || {})[`${e.id}_${trimestre}`] || '').trim()).length;
  return `<section class="panel" id="appreciations" aria-labelledby="titreAppr">
    <div class="panel-head"><div><h2 id="titreAppr">✏️ Appréciations du bulletin — ${escapeHtml(c.nom)}</h2>
      <div class="sub">${ecrites} sur ${eleves.length} écrite(s) · ${libelleTrimestre(trimestre)}. Touchez une phrase pour la mettre, puis complétez si vous voulez.</div></div></div>
    ${verrou ? `<div class="banniere-discrete" style="margin-bottom:10px;"><span>${icone('lock')}</span><span>Bulletins publiés : les appréciations sont verrouillées. Pour une correction, adressez-vous à la direction.</span></div>` : `
    <div class="form-actions" style="justify-content:flex-start;margin-top:0;"><button type="button" class="btn secondary sm" onclick="remplirAppreciationsVides()">Mettre la phrase suggérée dans les cases vides</button></div>`}
    <ul class="ap-liste">${eleves.map(e => {
      const l = ligneDe(e.id), moy = l && l.moyenne != null ? l.moyenne : null, txt = (DB.bulletinsComments || {})[`${e.id}_${trimestre}`] || '';
      const sug = phraseSuggeree(moy);
      return `<li class="ap-ligne">
        <div class="ap-tete"><strong>${escapeHtml(eleveFullName(e))}</strong><span class="hint" style="margin:0;">${moy != null ? `Moyenne ${moy.toFixed(2)} · ${rangTexte(l.rang, l.exAequo)}` : 'Pas encore de moyenne'}</span></div>
        <textarea class="ap-texte" rows="2" maxlength="300" data-eleve="${e.id}" data-avant="${escapeHtml(txt)}" data-sug="${escapeHtml(sug)}" ${verrou ? 'disabled' : ''} placeholder="${sug ? 'Suggestion : ' + escapeHtml(sug) : 'Appréciation…'}" aria-label="Appréciation de ${escapeHtml(eleveFullName(e))}">${escapeHtml(txt)}</textarea>
        ${verrou ? '' : (() => { const puce = (p, suggeree) => `<button type="button" class="dv-puce${suggeree ? ' suggeree' : ''}" data-val="${escapeHtml(p)}" onclick="this.closest('.ap-ligne').querySelector('textarea').value=this.dataset.val">${suggeree ? '★ ' : ''}${escapeHtml(p)}</button>`;
          return `<div class="dv-puces ap-phrases">${sug ? puce(sug, true) : ''}<details class="ap-autres"><summary>Autres phrases</summary><div class="dv-puces">${PHRASES_APPRECIATION.filter(([, p]) => p !== sug).map(([, p]) => puce(p, false)).join('')}</div></details></div>`; })()}
      </li>`; }).join('')}</ul>
    ${verrou ? '' : `<div class="form-actions"><button type="button" class="btn" id="btnAppr" onclick="enregistrerAppreciations('${classeId}','${trimestre}')">Enregistrer les appréciations</button></div>`}
  </section>`;
}
function remplirAppreciationsVides(){
  let n = 0;
  $$('.ap-texte').forEach(t => { if(!t.value.trim() && t.dataset.sug){ t.value = t.dataset.sug; n++; } });
  toast(n ? `${n} case(s) remplie(s) : relisez, complétez, puis enregistrez.` : 'Aucune case vide à remplir (ou pas encore de moyenne).');
}
async function enregistrerAppreciations(classeId, trimestre){
  const lignes = $$('.ap-texte').filter(t => t.value.trim() !== (t.dataset.avant || '').trim())
    .map(t => ({ eleve_id: t.dataset.eleve, trimestre, commentaire: t.value.trim(), ecole_id: session.ecoleId }));
  if(!lignes.length){ toast('Aucun changement'); return; }
  const btn = document.getElementById('btnAppr'); if(btn){ btn.disabled = true; btn.textContent = 'Enregistrement…'; }
  try{
    const { error } = await sb.from('bulletins_commentaires').upsert(lignes, { onConflict: 'eleve_id,trimestre' });
    if(error) throw erreurLisible(error);
    lignes.forEach(l => { DB.bulletinsComments[`${l.eleve_id}_${trimestre}`] = l.commentaire; });
    toast(`${lignes.length} appréciation(s) enregistrée(s)`); renderView('notes');
    setTimeout(() => document.getElementById('appreciations')?.scrollIntoView({ block: 'start' }), 100);
  }catch(e){ if(btn){ btn.disabled = false; btn.textContent = 'Enregistrer les appréciations'; } alert('Erreur : ' + e.message); }
}

