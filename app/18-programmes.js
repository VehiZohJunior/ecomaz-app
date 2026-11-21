/* ---------------------------------------------------------------------
   11. PROGRAMMES PÉDAGOGIQUES
   --------------------------------------------------------------------- */
function renderProgrammes(){
  const f = ui.filters.prog || {classeId:'', enseignantId:'', trimestre:''};
  ui.filters.prog = f;

  const ens = ui.role === 'enseignant' && session.enseignantId;
  let list = DB.programmes.slice();
  if(ens) list = list.filter(p => p.enseignantId === session.enseignantId);
  if(f.classeId) list = list.filter(p=>p.classeId===f.classeId);
  if(f.enseignantId) list = list.filter(p=>p.enseignantId===f.enseignantId);
  if(f.trimestre) list = list.filter(p=>p.trimestre===f.trimestre);
  list.sort((a,b)=> classeName(a.classeId).localeCompare(classeName(b.classeId)));

  const cartes = list.map(p=>{
    const t = enseignantById(p.enseignantId);
    const niveau = p.progression>=75 ? 'ok' : p.progression>=40 ? 'moyen' : 'bas';
    return `<article class="prog-carte">
      <header class="prog-tete"><span class="puce-classe">${escapeHtml(classeName(p.classeId))}</span><span class="prog-tri">${escapeHtml(p.trimestre)}</span>
        ${menuPlus([{ label: 'Supprimer ce programme', danger: true, onclick: `deleteProgramme('${p.id}')` }])}</header>
      <strong class="prog-matiere">${escapeHtml(p.matiere)}</strong>
      <span class="prog-ens">${escapeHtml(ensFullName(t))}</span>
      <div class="prog-avancee"><div class="sc-piste"><div class="prog-${niveau}" style="width:${p.progression}%"></div></div><strong>${p.progression} %</strong></div>
      <footer class="prog-pied"><small>${!p.dateMaj || ecartJours(p.dateMaj) < -30 ? `<span class="badge-etat attente">À mettre à jour</span> ` : ''}Mis à jour le ${p.dateMaj ? fmtDate(p.dateMaj) : '—'}</small>
        <span class="prog-actions"><button type="button" class="btn sm" onclick="ouvrirAvancement('${p.id}')">Mettre à jour l’avancement</button><button type="button" class="btn secondary sm" onclick="openProgrammeForm('${p.id}')">Modifier</button></span></footer>
    </article>`;
  }).join('');
  const filtresActifs = !!(f.classeId || f.enseignantId || f.trimestre);

  return `
  <div class="view active">
    <div class="panel">
      <div class="panel-head">
        <div><h2>${ens ? 'Mon programme' : 'Progression des enseignants'}</h2><div class="sub">${ens ? 'Une ligne par matière et par classe. Une fois par mois : touchez « Mettre à jour l’avancement ».' : `${list.length} programme${list.length > 1 ? 's' : ''}${filtresActifs ? ' pour ces filtres' : ''}`}</div></div>
        <button class="btn" onclick="openProgrammeForm()">${icone('plus')} ${ens ? 'Ajouter une matière' : 'Nouveau programme'}</button>
      </div>
      <div class="prog-filtres">
        ${ens && classesVisibles().length <= 1 ? '' : `<select class="puce-select petit${f.classeId ? ' actif' : ''}" aria-label="Classe" onchange="ui.filters.prog.classeId=this.value; renderView('programmes')">
          <option value="">${ens ? 'Toutes mes classes' : 'Toutes les classes'}</option>
          ${(ens ? classesVisibles() : DB.classes).map(c=>`<option value="${c.id}" ${f.classeId===c.id?'selected':''}>${escapeHtml(c.nom)}</option>`).join('')}
        </select>`}
        ${ens ? '' : `<select class="puce-select petit${f.enseignantId ? ' actif' : ''}" aria-label="Enseignant" onchange="ui.filters.prog.enseignantId=this.value; renderView('programmes')">
          <option value="">Tous les enseignants</option>
          ${DB.enseignants.map(t=>`<option value="${t.id}" ${f.enseignantId===t.id?'selected':''}>${escapeHtml(ensFullName(t))}</option>`).join('')}
        </select>`}
        <div class="segmente" role="group" aria-label="Trimestre">${[['', 'Tous'], ...TRIMESTRES.map(t => [t, 'T' + t.slice(-1)])].map(([v, l]) => `<button type="button" class="seg${f.trimestre === v ? ' actif' : ''}" ${v ? `title="${v}"` : ''} onclick="ui.filters.prog.trimestre='${v}'; renderView('programmes')">${l}</button>`).join('')}</div>
        ${filtresActifs ? `<button type="button" class="lien-discret" onclick="ui.filters.prog={classeId:'', enseignantId:'', trimestre:''}; renderView('programmes')">Effacer les filtres</button>` : ''}
      </div>
      ${list.length===0 ? `<div class="etat-vide"><span class="etat-vide-ic" aria-hidden="true">${icone('book-open-check')}</span><span>${filtresActifs ? 'Aucun programme pour ces filtres.' : (ens ? 'Aucune matière enregistrée pour le moment.' : 'Aucun programme enregistré.')} <button type="button" class="lien-discret" onclick="openProgrammeForm()">${ens ? 'Ajouter une matière' : 'Ajouter un programme'}</button></span></div>`
        : `<div class="prog-grille">${cartes}</div>`}
    </div>
  </div>`;
}

function openProgrammeForm(id){
  const p = id ? DB.programmes.find(x=>x.id===id) : null;
  const mesClasses = classesVisibles();
  if(!p && mesClasses.length === 0){
    toast("Aucune classe configurée — activez d'abord un niveau scolaire dans Paramètres.");
    return;
  }
  const classeId = p ? p.classeId : mesClasses[0].id;
  const cycle = classeCycle(classeId);
  const ens = ui.role === 'enseignant' && session.enseignantId;
  const trimDefaut = p ? p.trimestre : trimestreCourant();
  openModal(p ? 'Modifier le programme' : (ens ? 'Ajouter une matière à mon programme' : 'Nouveau programme'), `
    ${boutonRemplissage('programme', "SCHEMA_PROGRAMME", 'formProg')}
    <form id="formProg" onsubmit="return handleSaveProgramme(event)">
      <input type="hidden" name="id" value="${p?p.id:''}">
      <div class="form-grid">
        <div class="field"><label>Classe</label>
          <select name="classeId" id="progClasse" onchange="updateProgMatieres()">
            ${mesClasses.map(c=>`<option value="${c.id}" ${classeId===c.id?'selected':''}>${escapeHtml(c.nom)}</option>`).join('')}
          </select>
        </div>
        <div class="field"><label>Matière</label>
          <select name="matiere" id="progMatiere">
            ${matieresProgramme(cycle).map(m=>`<option ${p?.matiere===m?'selected':''}>${m}</option>`).join('')}
          </select>
        </div>
        ${ens ? `<input type="hidden" name="enseignantId" value="${session.enseignantId}">` : `<div class="field"><label>Enseignant</label>
          <select name="enseignantId"><option value="">— Choisir —</option>${DB.enseignants.filter(t => t.statut === 'Actif' || t.id === p?.enseignantId).map(t=>`<option value="${t.id}" ${p?.enseignantId===t.id?'selected':''}>${escapeHtml(ensFullName(t))}</option>`).join('')}</select>
        </div>`}
        <div class="field"><label>Trimestre</label>
          <select name="trimestre">${TRIMESTRES.map(t=>`<option value="${t}" ${trimDefaut===t?'selected':''}>${libelleTrimestre(t)}${t === trimestreCourant() ? ' (en cours)' : ''}</option>`).join('')}</select>
        </div>
        <div class="field span2"><label>Chapitres du programme <span class="hint" style="margin:0;font-weight:400;">(facultatif)</span></label>
          <textarea name="contenu" rows="2" placeholder="Ex : Les nombres jusqu’à 100, l’addition…">${p?escapeHtml(p.contenu || ''):''}</textarea>
        </div>
        <div class="field span2"><label>Avancement : où en êtes-vous ?</label>${pucesAvancement(p ? p.progression : 0)}</div>
      </div>
      <div class="form-actions">
        <button type="button" class="btn secondary" onclick="closeModal()">Annuler</button>
        <button type="submit" class="btn">Enregistrer</button>
      </div>
    </form>`);
}

function updateProgMatieres(){
  const classeId = $('#progClasse').value;
  const cycle = classeCycle(classeId);
  $('#progMatiere').innerHTML = matieresProgramme(cycle).map(m=>`<option>${m}</option>`).join('');
}
// Matières proposées : celles de l'enseignant spécialiste, sinon toutes celles du cycle
function matieresProgramme(cycle){
  const toutes = MATIERES_BY_CYCLE[cycle] || [];
  const fiche = ui.role === 'enseignant' && session.enseignantId ? enseignantById(session.enseignantId) : null;
  const siennes = toutes.filter(m => (fiche?.matieres || []).includes(m));
  return siennes.length ? siennes : toutes;
}
function pucesAvancement(val){
  const v = Math.round((Number(val) || 0) / 10) * 10;
  return `<div class="dv-puces prog-puces" role="radiogroup" aria-label="Avancement en pourcentage">${[0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map(x => `<label class="dv-puce${x === v ? ' actif' : ''}"><input type="radio" name="progression" value="${x}" ${x === v ? 'checked' : ''} class="sr-only" onchange="choisirPuceRadio(this)">${x} %</label>`).join('')}</div>`;
}
function ouvrirAvancement(id){
  const p = DB.programmes.find(x => x.id === id); if(!p) return;
  openModal('Avancement du programme', `<form onsubmit="return enregistrerAvancement(event, '${id}')">
    <p style="margin-top:0;"><strong>${escapeHtml(p.matiere)}</strong> — ${escapeHtml(classeName(p.classeId))} · ${libelleTrimestre(p.trimestre)}</p>
    <p class="hint">Touchez le pourcentage du programme déjà fait (dernière mise à jour : ${p.dateMaj ? fmtDate(p.dateMaj) : '—'}). Si rien n’a changé, touchez simplement « Enregistrer ».</p>
    ${pucesAvancement(p.progression)}
    <div class="form-actions"><button type="button" class="btn secondary" onclick="closeModal()">Annuler</button><button class="btn" type="submit">Enregistrer</button></div>
  </form>`);
}
async function enregistrerAvancement(ev, id){
  ev.preventDefault();
  const p = DB.programmes.find(x => x.id === id); if(!p) return false;
  const progression = Math.max(0, Math.min(100, parseInt(new FormData(ev.target).get('progression')) || 0));
  const bouton = ev.target.querySelector('button[type=submit]'); if(bouton) bouton.disabled = true;
  try{
    await dbUpdate('programmes', id, { progression, dateMaj: todayISO() });
    p.progression = progression; p.dateMaj = todayISO();
    closeModal(); toast(`Avancement enregistré : ${progression} %`); renderView(ui.currentView);
  }catch(e){ if(bouton) bouton.disabled = false; alert('Erreur : ' + e.message); }
  return false;
}

async function handleSaveProgramme(ev){
  ev.preventDefault();
  const fd = new FormData(ev.target);
  const id = fd.get('id');
  if(!fd.get('enseignantId')){ alert('Choisissez l’enseignant de ce programme.'); return false; }
  const patch = {
    classeId: fd.get('classeId'), matiere: fd.get('matiere'), enseignantId: fd.get('enseignantId'),
    trimestre: fd.get('trimestre'), contenu: (fd.get('contenu') || '').trim(),
    progression: Math.max(0, Math.min(100, parseInt(fd.get('progression'))||0)), dateMaj: todayISO(),
  };
  try{
    if(id){
      await dbUpdate('programmes', id, patch);
      const idx = DB.programmes.findIndex(p=>p.id===id);
      DB.programmes[idx] = {id, ...patch};
    } else {
      DB.programmes.push(await dbInsert('programmes', patch));
    }
    closeModal(); toast('Programme enregistré');
    renderView('programmes');
  }catch(e){ alert('Erreur : ' + e.message); }
  return false;
}

async function deleteProgramme(id){
  if(!confirm('Supprimer ce programme ?')) return;
  try{
    await dbDelete('programmes', id);
    DB.programmes = DB.programmes.filter(p=>p.id!==id);
    toast('Programme supprimé');
    renderView('programmes');
  }catch(e){ alert('Erreur : ' + e.message); }
}

