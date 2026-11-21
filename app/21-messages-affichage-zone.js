/* ---------------------------------------------------------------------
   MESSAGES ENVOYÉS AUX PARENTS — accusés de lecture (schema.sql section 73)
   --------------------------------------------------------------------- */
function renderMessagesEnvoyesParents(){
  if(!['secretariat','direction','fondation'].includes(ui.role)) return '';
  const tous = (DB.messagesInternes || []).filter(m => m.destinataireType === 'parent')
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  if(!tous.length) return '';
  const nonLus = ui.filters.envoyesNonLus;
  const liste = tous.filter(m => !nonLus || !m.lu).slice(0, 40);
  const lus = tous.filter(m => m.lu).length;
  const quand = (iso) => { const d = new Date(iso); return `${fmtDate(isoLocal(d))} à ${d.toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' })}`; };
  return `<div class="panel">
    <div class="panel-head"><div><h2>📤 Messages envoyés aux parents</h2><div class="sub">${lus} sur ${tous.length} lu(s) (${Math.round(100 * lus / tous.length)} %) — ✓ envoyé, ✓✓ lu par le parent.</div></div>
      <button class="btn secondary sm" onclick="ui.filters.envoyesNonLus=${!nonLus}; renderView('messagerie')">${nonLus ? 'Tout afficher' : 'Non lus seulement'}</button></div>
    ${!liste.length ? '<div class="hint">Tous les messages ont été lus. 👏</div>' : `<div class="table-wrap"><table>
      <thead><tr><th>Envoyé</th><th>Élève</th><th>Message</th><th>Lecture</th></tr></thead>
      <tbody>${liste.map(m => { const e = eleveById(m.eleveId); return `<tr>
        <td style="white-space:nowrap;">${m.createdAt ? quand(m.createdAt) : '—'}</td>
        <td>${e ? escapeHtml(eleveFullName(e)) : '—'}</td>
        <td style="max-width:340px;">${escapeHtml(String(m.contenu || '').slice(0, 140))}${String(m.contenu || '').length > 140 ? '…' : ''}</td>
        <td style="white-space:nowrap;">${m.lu ? `<span class="badge green">✓✓ Lu</span>${m.luAt ? `<br><span class="hint">${quand(m.luAt)}</span>` : ''}` : `<span class="badge">✓ Envoyé</span>${e && telephonesWhatsapp(e.parentTel).length ? `<br><a class="hint" href="https://wa.me/${telephonesWhatsapp(e.parentTel)[0]}?text=${encodeURIComponent('Bonjour, un message de ' + (DB.meta?.nomEcole || 'l’école') + ' vous attend dans l’application EcoMaZ Parents. Merci !')}" target="_blank" rel="noopener">📲 Prévenir</a>` : ''}`}</td>
      </tr>`; }).join('')}</tbody></table></div>`}
  </div>`;
}
function renderMessagerie(){
  const typeFilter = ui.filters.msgType || '';
  ui.filters.msgType = typeFilter;
  const roleFilter = ui.filters.msgRole || '';
  ui.filters.msgRole = roleFilter;

  let list = DB.messages.slice();
  if(typeFilter) list = list.filter(m=>m.type===typeFilter);
  if(roleFilter) list = list.filter(m=>m.destinataireRole===roleFilter);
  list.sort((a,b)=> (b.date+b.heure).localeCompare(a.date+a.heure));

  const today = todayISO();
  const totalToday = DB.messages.filter(m=>m.date===today).length;
  const nbAbsEleve = DB.presencesEleves.filter(p=>p.statut==='Absent').length;
  const nbEns = DB.presencesEnseignants.filter(p=>p.statut==='Absent' || p.statut==='Retard').length;

  const typeBadge = t => t==='Absence élève' ? 'red' : t==='Absence enseignant' ? 'amber' : t==='Retard enseignant' ? 'blue' : 'gray';
  const roleIcon = r => r==='Parent' ? '👪' : r==='Directeur' ? '🎩' : r==='Fondateur' ? '🏛️' : '👤';
  const statutBadge = m => {
    if(m.canal==='Application') return `<span class="badge blue">📱 Interne</span>`;
    if(m.statut==='Échec envoi') return `<span class="badge red">✕ Échec SMS</span>`;
    return `<span class="badge green">✓ SMS envoyé</span>`;
  };

  const rows = list.slice(0,80).map(m=>`<tr>
    <td style="white-space:nowrap;">${fmtDate(m.date)}<br><span class="hint">${m.heure}</span></td>
    <td>${roleIcon(m.destinataireRole)} ${escapeHtml(m.destinataireNom)}<br><span class="badge gray">${m.destinataireRole}</span></td>
    <td><span class="badge ${typeBadge(m.type)}">${m.type}</span></td>
    <td style="max-width:320px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(m.contenu)}</td>
    <td>${statutBadge(m)}</td>
    <td><button class="icon-btn" title="Voir le message" onclick='voirMessage(${JSON.stringify(m.id)})'>👁️</button></td>
  </tr>`).join('');

  return `
  <div class="view active">
    <div class="section-note">📨 À chaque absence, le parent est prévenu dans son application ; le secrétariat peut aussi le prévenir gratuitement par WhatsApp depuis l'appel (« Prévenir le parent »). La Direction et la Fondation reçoivent l'alerte dans l'application. Les absences/retards d'enseignants restent des notifications internes pour Direction et Fondation.</div>
    ${renderMessagesParents()}
    ${renderMessagesEnvoyesParents()}
    ${renderObjetsPerdusEcole()}
    <div class="cards">
      <div class="card"><div class="card-top"><div class="icon-badge" style="background:var(--primary-dim);">📨</div></div><div class="num">${DB.messages.length}</div><div class="label">Messages envoyés (total)</div></div>
      <div class="card"><div class="card-top"><div class="icon-badge" style="background:var(--blue-bg);">📆</div></div><div class="num">${totalToday}</div><div class="label">Envoyés aujourd'hui</div></div>
      <div class="card"><div class="card-top"><div class="icon-badge" style="background:var(--red-bg);">🧒</div></div><div class="num">${nbAbsEleve}</div><div class="label">Absences élèves signalées</div></div>
      <div class="card"><div class="card-top"><div class="icon-badge" style="background:var(--amber-bg);">👩‍🏫</div></div><div class="num">${nbEns}</div><div class="label">Absences/retards enseignants signalés</div></div>
    </div>
    <div class="panel">
      <div class="panel-head"><div><h2>Journal des notifications</h2><div class="sub">${list.length} message(s)</div></div></div>
      <div class="filters">
        <select onchange="ui.filters.msgType=this.value; renderView('messagerie')">
          <option value="">Tous les types</option>
          <option value="Absence élève" ${typeFilter==='Absence élève'?'selected':''}>Absence élève</option>
          <option value="Absence enseignant" ${typeFilter==='Absence enseignant'?'selected':''}>Absence enseignant</option>
          <option value="Retard enseignant" ${typeFilter==='Retard enseignant'?'selected':''}>Retard enseignant</option>
        </select>
        <select onchange="ui.filters.msgRole=this.value; renderView('messagerie')">
          <option value="">Tous les destinataires</option>
          <option value="Parent" ${roleFilter==='Parent'?'selected':''}>Parent</option>
          <option value="Directeur" ${roleFilter==='Directeur'?'selected':''}>Directeur</option>
          <option value="Fondateur" ${roleFilter==='Fondateur'?'selected':''}>Fondateur</option>
        </select>
      </div>
      ${list.length===0 ? `<div class="empty-state"><div class="em-ic">📨</div>Aucune notification pour ces critères.</div>` : `
      <div class="table-wrap"><table>
        <thead><tr><th>Date</th><th>Destinataire</th><th>Type</th><th>Message</th><th>Statut</th><th></th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
      ${list.length>80 ? `<div class="hint" style="margin-top:10px;">Affichage limité aux 80 messages les plus récents.</div>` : ''}`}
    </div>
  </div>`;
}
/* ---------------------------------------------------------------------
   TABLEAU D'AFFICHAGE — tableaux d'honneur + bannière d'actualités,
   gérés ici par Direction/Fondation, affichés publiquement sur
   affichage.html (voir ce fichier — écran de hall, sans connexion).
   --------------------------------------------------------------------- */
const HONNEUR_PERIODES = [
  {id:'mois', label:'Du mois'},
  {id:'trimestre', label:'Du trimestre'},
  {id:'annee', label:"De l'année"},
];
const HONNEUR_CATEGORIES = [
  {id:'eleve', label:'Élève', icon:'🧒'},
  {id:'enseignant', label:'Enseignant(e)', icon:'👩‍🏫'},
];
function honneurActuel(categorie, periode){
  return (DB.tableauHonneur||[]).find(h=>h.categorie===categorie && h.periode===periode);
}
// Menu « ⋯ » : les actions secondaires (dont Supprimer) ne dominent plus l'écran
function menuPlus(actions, libelle){
  return `<details class="menu-plus"><summary class="btn secondary sm" aria-label="${escapeHtml(libelle || 'Plus d’actions')}" title="${escapeHtml(libelle || 'Plus d’actions')}">⋯</summary>
    <div class="menu-plus-liste">${actions.map(a => `<button type="button" class="btn-reset${a.danger ? ' danger' : ''}" onclick="this.closest('details').open=false; ${a.onclick}">${escapeHtml(a.label)}</button>`).join('')}</div></details>`;
}
function renderTableauAffichage(){
  const base = location.href.replace(/[^/]*$/, '');
  const lienPublic = `${base}affichage.html?ecole=${session.ecoleId}`;
  const actus = (DB.actualitesAffichage||[]).slice().sort((a,b)=> (b.createdAt||'').localeCompare(a.createdAt||''));
  return `<div class="view active">
    <div class="panel">
      <div class="panel-head">
        <div><h2>Écran du hall</h2><div class="sub">À ouvrir sur la télévision ou la tablette de l’entrée — aucune connexion nécessaire</div></div>
        <button class="btn secondary sm" onclick="copierLienAffichage(${jsArg(lienPublic)})">${icone('link')} Copier le lien</button>
      </div>
      <div class="ta-lien">${escapeHtml(lienPublic)}</div>
    </div>

    ${HONNEUR_CATEGORIES.map(cat=>`
      <div class="panel">
        <div class="panel-head"><div><h2>${cat.id === 'eleve' ? 'Élèves à l’honneur' : 'Enseignants à l’honneur'}</h2><div class="sub">Affichés en grand sur l’écran du hall</div></div></div>
        <div class="honneur-grille">
          ${HONNEUR_PERIODES.map(per=>{
            const h = honneurActuel(cat.id, per.id);
            const titre = `${cat.id === 'eleve' ? 'Élève' : 'Enseignant(e)'} ${per.id === 'mois' ? 'du mois' : per.id === 'trimestre' ? 'du trimestre' : 'de l’année'}`;
            return h ? `<article class="honneur-carte honneur-${per.id}">
                <span class="honneur-medaille" aria-hidden="true">${icone('trophy')}</span>
                <span class="honneur-periode">${titre}</span>
                <span class="lc-avatar honneur-avatar" aria-hidden="true">${escapeHtml(initials(...String(h.nomAffiche || '? ?').split(' ')))}</span>
                <strong class="honneur-nom">${escapeHtml(h.nomAffiche)}</strong>
                ${h.classeOuMatiere ? `<span class="puce-classe">${escapeHtml(h.classeOuMatiere)}</span>` : ''}
                ${h.libellePeriode ? `<span class="honneur-libelle">${escapeHtml(h.libellePeriode)}</span>` : ''}
                <button type="button" class="lien-discret" onclick="ouvrirModifierHonneur('${cat.id}','${per.id}')">Modifier</button>
              </article>`
              : `<article class="honneur-carte honneur-vide">
                <span class="honneur-periode">${titre}</span>
                <span class="honneur-medaille vide" aria-hidden="true">${icone('trophy')}</span>
                <span class="hint" style="margin:0;">Personne pour l’instant</span>
                <button type="button" class="btn secondary sm" onclick="ouvrirModifierHonneur('${cat.id}','${per.id}')">Choisir</button>
              </article>`;
          }).join('')}
        </div>
      </div>
    `).join('')}

    <div class="panel">
      <div class="panel-head">
        <div><h2>Bannière d’actualités</h2><div class="sub">Défile en bas de l’écran du hall</div></div>
      </div>
      <div class="ta-bandeau" aria-label="Aperçu du défilement"><div class="ta-bandeau-txt">${actus.length ? actus.map(a => escapeHtml(a.texte)).join('<span class="ta-sep">•</span>') : 'Vos annonces défileront ici.'}</div></div>
      <form onsubmit="return handleAjouterActualite(event)" class="ta-ajout">
        <input type="text" id="nouvelleActualite" placeholder="Ex : Réunion de parents le 15 octobre à 17h" aria-label="Nouvelle annonce" required>
        <button class="btn" type="submit">Ajouter</button>
      </form>
      ${renderListeActualites()}
    </div>
  </div>`;
}
function renderListeActualites(){
  const actus = (DB.actualitesAffichage||[]).slice().sort((a,b)=> (b.createdAt||'').localeCompare(a.createdAt||''));
  if(!actus.length) return `<div class="etat-vide"><span class="etat-vide-ic" aria-hidden="true">${icone('newspaper')}</span><span>Aucune annonce pour l’instant. Écrivez la première ci-dessus.</span></div>`;
  return `<ul class="liste-compacte ta-actus">${actus.map(a => `<li class="lc-ligne">
      <span class="lc-txt"><strong>${escapeHtml(a.texte)}</strong>${a.createdAt ? `<small>Ajoutée le ${fmtDate(String(a.createdAt).slice(0, 10))}</small>` : ''}</span>
      ${menuPlus([{ label: 'Supprimer l’annonce', danger: true, onclick: `handleSupprimerActualite('${a.id}')` }])}
    </li>`).join('')}</ul>`;
}
function copierLienAffichage(lien){
  navigator.clipboard?.writeText(lien).then(()=>toast('Lien copié')).catch(()=>toast('Impossible de copier — sélectionnez le lien manuellement'));
}
function suggestionsPeriode(periode){
  const d = new Date(), mois = d.toLocaleDateString('fr-FR', { month:'long', year:'numeric' });
  const annee = DB.meta?.anneeScolaire || '';
  const m = d.getMonth(), tri = m >= 8 && m <= 11 ? '1er trimestre' : m <= 2 ? '2e trimestre' : '3e trimestre';
  const cap = t => t.charAt(0).toUpperCase() + t.slice(1);
  return periode === 'mois' ? [cap(mois)] : periode === 'trimestre' ? [`${cap(tri)} ${annee}`.trim()] : [`Année scolaire ${annee}`.trim()];
}
function ouvrirModifierHonneur(categorie, periode){
  const h = honneurActuel(categorie, periode) || {};
  const estEleve = categorie === 'eleve';
  const options = estEleve
    ? DB.eleves.slice().sort((a,b)=>eleveFullName(a).localeCompare(eleveFullName(b))).map(e=>`<option value="${e.id}" ${h.nomAffiche===eleveFullName(e)?'selected':''}>${escapeHtml(eleveFullName(e))} — ${escapeHtml(classeName(e.classeId))}</option>`).join('')
    : (DB.enseignants||[]).slice().sort((a,b)=>ensFullName(a).localeCompare(ensFullName(b))).map(en=>`<option value="${en.id}" ${h.nomAffiche===ensFullName(en)?'selected':''}>${escapeHtml(ensFullName(en))}</option>`).join('');
  const labelPeriode = periode==='mois'?'du mois':periode==='trimestre'?'du trimestre':"de l'année";
  openModal(`Modifier — ${estEleve?'Élève':'Enseignant(e)'} ${labelPeriode}`, `
    <form onsubmit="return handleSaveHonneur(event,'${categorie}','${periode}')">
      <div class="field">
        <label>${estEleve?'Élève':'Enseignant(e)'}</label>
        <select id="honneurPersonneId" required>
          <option value="">${estEleve ? 'Choisir un élève' : 'Choisir un enseignant'}</option>
          ${options}
        </select>
      </div>
      <div class="field">
        <label for="honneurLibellePeriode">Période affichée</label>
        <input type="text" id="honneurLibellePeriode" value="${escapeHtml(h.libellePeriode||'')}" placeholder="Ex : Octobre 2026">
        <div class="suggestions-puces">${suggestionsPeriode(periode).map(t => `<button type="button" class="puce-suggestion" onclick="document.getElementById('honneurLibellePeriode').value=this.textContent">${escapeHtml(t)}</button>`).join('')}</div>
      </div>
      <div class="field">
        <label>Commentaire (optionnel)</label>
        <textarea id="honneurCommentaire" rows="3">${escapeHtml(h.commentaire||'')}</textarea>
      </div>
      <button class="btn" type="submit" style="width:100%;margin-top:10px;">Enregistrer</button>
    </form>
  `);
}
async function handleSaveHonneur(ev, categorie, periode){
  ev.preventDefault();
  const personneId = $('#honneurPersonneId').value;
  const libellePeriode = $('#honneurLibellePeriode').value.trim();
  const commentaire = $('#honneurCommentaire').value.trim();
  const estEleve = categorie === 'eleve';
  const personne = estEleve ? eleveById(personneId) : (DB.enseignants||[]).find(en=>en.id===personneId);
  if(!personne){ alert('Choisissez une personne'); return false; }
  const nomAffiche = estEleve ? eleveFullName(personne) : ensFullName(personne);
  const classeOuMatiere = estEleve ? classeName(personne.classeId) : (personne.matieres||[]).join(', ');
  try{
    const { data, error } = await sb.from('tableau_honneur')
      .upsert({ ecole_id: session.ecoleId, categorie, periode, nom_affiche: nomAffiche, classe_ou_matiere: classeOuMatiere, libelle_periode: libellePeriode, commentaire, updated_at: new Date().toISOString() }, { onConflict: 'ecole_id,categorie,periode' })
      .select().single();
    if(error) throw error;
    const row = rowToCamel(data);
    DB.tableauHonneur = (DB.tableauHonneur||[]).filter(h=>!(h.categorie===categorie && h.periode===periode));
    DB.tableauHonneur.push(row);
    closeModal();
    toast('Mis à jour');
    renderView('tableau-affichage');
  }catch(e){ alert('Erreur : ' + e.message); }
  return false;
}
async function handleAjouterActualite(ev){
  ev.preventDefault();
  const texte = $('#nouvelleActualite').value.trim();
  if(!texte) return false;
  try{
    const { data, error } = await sb.from('actualites_affichage').insert({ ecole_id: session.ecoleId, texte }).select().single();
    if(error) throw error;
    DB.actualitesAffichage = DB.actualitesAffichage || [];
    DB.actualitesAffichage.push(rowToCamel(data));
    toast('Actualité ajoutée');
    renderView('tableau-affichage');
  }catch(e){ alert('Erreur : ' + e.message); }
  return false;
}
async function handleSupprimerActualite(id){
  if(!confirm('Supprimer cette actualité ?')) return;
  try{
    const { error } = await exigerEffet(sb.from('actualites_affichage').delete().eq('id', id));
    if(error) throw error;
    DB.actualitesAffichage = (DB.actualitesAffichage||[]).filter(a=>a.id!==id);
    toast('Actualité supprimée');
    renderView('tableau-affichage');
  }catch(e){ alert('Erreur : ' + e.message); }
}

/* ---------------------------------------------------------------------
   ANNONCES HORAIRES AUTOMATIQUES — configuration (Paramètres, Direction/
   Fondation). L'envoi lui-même est géré côté serveur (pg_cron + fonction
   Edge "annoncer-horaires", chaque minute) — voir schema.sql section 35.
   --------------------------------------------------------------------- */
// Heures RÉELLES de chaque moment de la journée ; les parents sont prévenus
// « avance_minutes » avant (schema.sql section 50, fonction annoncer-horaires).
const HORAIRES_CHAMPS = [
  {fonction:'matin_debut', label:'Début des cours du matin', champPrimaire:'matinDebutPrimaire', champMaternelle:'matinDebutMaternelle'},
  {fonction:'pause_matin', label:'Pause du matin (récréation)', champPrimaire:'pauseMatinPrimaire', champMaternelle:'pauseMatinMaternelle'},
  {fonction:'midi_pause', label:'Pause de midi', champPrimaire:'midiPausePrimaire', champMaternelle:'midiPauseMaternelle'},
  {fonction:'apresmidi_debut', label:'Début des cours de l’après-midi', champPrimaire:'apresmidiDebutPrimaire', champMaternelle:'apresmidiDebutMaternelle'},
  {fonction:'apresmidi_fin', label:'Fin des cours', champPrimaire:'apresmidiFinPrimaire', champMaternelle:'apresmidiFinMaternelle'},
];
const HORAIRES_DEFAUTS = {
  matinDebutPrimaire:'07:30', matinDebutMaternelle:'08:00',
  pauseMatinPrimaire:'10:00', pauseMatinMaternelle:'10:00',
  midiPausePrimaire:'12:00', midiPauseMaternelle:'11:00',
  apresmidiDebutPrimaire:'14:00', apresmidiDebutMaternelle:'14:00',
  apresmidiFinPrimaire:'16:00', apresmidiFinMaternelle:'16:00',
  renforcementFin:'17:00',
};
const JOURS_COMPLETS = ['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche'];
function renderHorairesAnnonces(){
  const h = DB.horairesAnnonces || {};
  const avance = Number.isFinite(h.avanceMinutes) ? h.avanceMinutes : 15;
  const jours = h.joursCours || [1,2,3,4,5];
  const nbRenf = (DB.eleves||[]).filter(e => e.renforcement && e.statut === 'Actif').length;
  return `
    <form onsubmit="return handleSaveHoraires(event)">
      <label style="display:flex;align-items:center;gap:10px;margin-bottom:14px;">
        <input type="checkbox" name="actif" ${h.actif!==false?'checked':''}>
        <strong>Activer les annonces automatiques aux parents</strong>
      </label>
      <div class="hint" style="margin-bottom:10px;">Indiquez l’heure <strong>réelle</strong> de chaque moment : les parents sont prévenus automatiquement
        <input type="number" name="avanceMinutes" min="0" max="60" value="${avance}" style="width:70px;display:inline-block;"> minutes avant, dans leur application.</div>
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Moment</th><th>Primaire</th><th>Maternelle / Garderie</th></tr></thead>
        <tbody>
          ${HORAIRES_CHAMPS.map(c=>`
            <tr>
              <td>${c.label}</td>
              <td><input type="time" name="${c.champPrimaire}" value="${(h[c.champPrimaire]||HORAIRES_DEFAUTS[c.champPrimaire]).slice(0,5)}"></td>
              <td><input type="time" name="${c.champMaternelle}" value="${(h[c.champMaternelle]||HORAIRES_DEFAUTS[c.champMaternelle]).slice(0,5)}"></td>
            </tr>`).join('')}
          <tr>
            <td>Fin du cours de renforcement<div class="hint" style="margin:0;">commence à la fin des cours · ${nbRenf} élève(s) coché(s)</div></td>
            <td colspan="2"><input type="time" name="renforcementFin" value="${(h.renforcementFin||HORAIRES_DEFAUTS.renforcementFin).slice(0,5)}"></td>
          </tr>
        </tbody>
      </table></div>
      <div class="field" style="margin-top:12px;"><label>Jours de classe</label>
        <div style="display:flex;flex-wrap:wrap;gap:12px;">${JOURS_COMPLETS.map((j, i) => `<label style="display:flex;align-items:center;gap:6px;font-weight:600;"><input type="checkbox" name="jour" value="${i+1}" ${jours.includes(i+1)?'checked':''}> ${j}</label>`).join('')}</div>
      </div>
      <div class="field"><label>Rappel si l’appel n’est pas fait à</label>
        <input type="time" name="rappelAppel" value="${(h.rappelAppel === undefined ? '09:00' : (h.rappelAppel || '')).slice(0,5)}">
        <div class="hint" style="margin:4px 0 0;">À cette heure, la Direction, le secrétariat et l’enseignant reçoivent une notification pour chaque classe sans appel. Laissez vide pour ne pas être rappelé.</div>
      </div>
      <div class="field"><label>Vacances : suspendre les annonces jusqu’au (inclus)</label>
        <input type="date" name="suspenduJusquau" value="${h.suspenduJusquau || ''}">
        <div class="hint" style="margin:4px 0 0;">Laissez vide pendant l’année scolaire. Les annonces reprennent toutes seules le lendemain de cette date.</div>
      </div>
      <div class="hint" style="margin-top:10px;">Les élèves du cours de renforcement se cochent sur leur fiche (Élèves &amp; Inscriptions → modifier). Leurs parents reçoivent un message à part : « votre enfant est retenu pour le renforcement », puis la fin du renforcement.</div>
      <div class="form-actions"><button class="btn" type="submit">Enregistrer les horaires</button></div>
    </form>
  `;
}
async function handleSaveHoraires(ev){
  ev.preventDefault();
  const fd = new FormData(ev.target);
  const jours = fd.getAll('jour').map(Number).sort();
  const avance = Math.min(60, Math.max(0, parseInt(fd.get('avanceMinutes'), 10) || 0));
  const payload = { ecole_id: session.ecoleId, actif: fd.get('actif') === 'on', avance_minutes: avance,
    jours_cours: jours, suspendu_jusquau: fd.get('suspenduJusquau') || null,
    renforcement_fin: fd.get('renforcementFin') || HORAIRES_DEFAUTS.renforcementFin,
    rappel_appel: fd.get('rappelAppel') || null };
  HORAIRES_CHAMPS.forEach(c=>{
    payload[camelToSnake(c.champPrimaire)] = fd.get(c.champPrimaire) || HORAIRES_DEFAUTS[c.champPrimaire];
    payload[camelToSnake(c.champMaternelle)] = fd.get(c.champMaternelle) || HORAIRES_DEFAUTS[c.champMaternelle];
  });
  if(!jours.length){ alert('Cochez au moins un jour de classe.'); return false; }
  try{
    const { data, error } = await sb.from('horaires_annonces').upsert(payload, { onConflict: 'ecole_id' }).select().single();
    if(error) throw error;
    DB.horairesAnnonces = rowToCamel(data);
    toast('Horaires enregistrés');
    renderView('parametres');
  }catch(e){ alert('Erreur : ' + e.message); }
  return false;
}

/* ---------------------------------------------------------------------
   ZONE DE L'ÉTABLISSEMENT (géofence) — utilisée par le pointage GPS.
   --------------------------------------------------------------------- */
function allerAuxDemandesAcces(){
  setTimeout(() => { const z = document.getElementById('panneauDemandesAcces'); if(z) z.scrollIntoView({ behavior:'smooth', block:'start' }); }, 150);
}
async function chargerDemandesAcces(){
  const boxRole = document.querySelector('[data-demandes-role]');
  const role = boxRole?.dataset.demandesRole || null;
  const box = boxRole || $('#demandesAccesBox'); if(!box) return;
  let q = sb.from('demandes_acces').select('*').eq('statut','en_attente').order('created_at');
  if(role) q = q.eq('role_demande', role);
  const { data, error } = await q;
  if(error){ box.innerHTML = `<div class="hint">Erreur : ${escapeHtml(error.message)}</div>`; return; }
  window.__demandesAcces = Object.fromEntries((data || []).map(d => [d.id, d]));
  if(role){
    const n = data.length + (role === 'enseignant' ? document.querySelectorAll('.enrole-a-valider .dem-carte').length : 0), qui = role === 'enseignant' ? 'enseignant' : 'parent';
    const compteur = $('#compteurInscriptions');
    if(compteur) compteur.textContent = n ? `${n} ${qui}${n > 1 ? 's attendent' : ' attend'} votre validation` : 'Aucune inscription en attente';
    const panneau = $('.panneau-inscriptions'); if(panneau) panneau.classList.toggle('inscr-attente', n > 0 || !!document.querySelector('.enrole-a-valider'));
  }
  const videRole = { enseignant: 'Aucune inscription en attente. Envoyez le lien EcoMaZ-ENSEIGNANTS ci-dessous : chaque enseignant s’inscrit avec Google et apparaît ici.',
    parent: 'Aucune inscription en attente. Chaque parent qui s’inscrit avec Google dans l’application PARENTS D’ELEVES apparaît ici.' };
  if(!data.length && role === 'enseignant' && document.querySelector('.enrole-a-valider')){ box.innerHTML = ''; return; }
  if(!data.length){ box.innerHTML = `<div class="etat-vide etat-vide-ok"><span class="etat-vide-ic" aria-hidden="true">${icone('circle-check')}</span><span>${videRole[role] || 'Aucune demande en attente.'}</span></div>`; return; }
  const chiffres = t => String(t || '').replace(/\D/g, '').replace(/^225/, '').slice(-10);
  const sure = d => {
    if(d.role_demande !== 'parent') return false;
    const tel = chiffres(d.telephone), enfants = (d.eleve_ids || []).map(id => eleveById(id)).filter(Boolean);
    return tel.length >= 8 && enfants.length > 0 && enfants.every(e => telephonesWhatsapp(e.parentTel).map(chiffres).includes(tel));
  };
  const nbSures = data.filter(sure).length;
  const entete = `<div class="dem-resume"><span>${data.length} demande${data.length > 1 ? 's' : ''} en attente${nbSures ? ` · <strong>${nbSures} sûre${nbSures > 1 ? 's' : ''}</strong> (téléphone identique à la fiche de l’enfant)` : ''}</span>
    ${nbSures > 1 ? `<button type="button" class="btn sm" onclick="approuverDemandesSures()">Approuver les ${nbSures} demandes sûres</button>` : ''}</div>`;
  box.innerHTML = entete + data.map(d=>{
    const parent = d.role_demande === 'parent', enseignant = d.role_demande === 'enseignant';
    const opts = (DB.eleves||[]).filter(e=>e.statut==='Actif').map(e=>`<option value="${e.id}">${escapeHtml(e.nom)} ${escapeHtml(e.prenom)}</option>`).join('');
    if(enseignant){
      const choisies = new Set(d.classe_ids || []);
      const libres = (DB.enseignants || []).filter(t => !(DB.profiles || []).some(p => p.enseignantId === t.id));
      const mots = t => simplifierTexte(t).split(' ').filter(m => m.length >= 3);
      const nomDem = new Set(mots(d.nom));
      // Fiche suggérée : même téléphone d'abord (indice fort), sinon nom ressemblant
      const chiffres = t => String(t || '').replace(/\D/g, '').replace(/^225/, '').slice(-10);
      const telDem = chiffres(d.telephone);
      const parTel = telDem.length >= 8 ? libres.find(t => chiffres(t.telephone) === telDem) : null;
      const parNom = libres.find(t => mots(`${t.prenom} ${t.nom}`).filter(m => nomDem.has(m)).length >= 1);
      const suggere = parTel || parNom;
      const classesFiche = new Set(suggere?.classesAssignees || []);
      const memesClasses = suggere && classesFiche.size && [...choisies].every(c => classesFiche.has(c));
      const indices = suggere ? [
        parTel ? '<span class="badge green">✅ Téléphone identique à la fiche ' + escapeHtml(ensFullName(suggere)) + '</span>' : '<span class="badge amber">Fiche trouvée par le nom seulement : vérifiez</span>',
        parNom && parTel && parNom.id === parTel.id ? '<span class="badge green">✅ Nom identique</span>' : '',
        classesFiche.size ? (memesClasses ? '<span class="badge green">✅ Classes cochées = classes de la fiche</span>' : '<span class="badge amber">⚠️ Classes cochées différentes de la fiche</span>') : '',
      ].join(' ') : '<span class="badge">Aucune fiche enseignant correspondante : une nouvelle sera créée</span>';
      return `<div class="dem-carte">
        <strong>Enseignant — ${escapeHtml(d.nom)}</strong>
        <div class="hint">${escapeHtml(d.email||'')}${d.telephone ? ' · ' + escapeHtml(d.telephone) : ''}</div>
        <div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:6px;">${indices}</div>
        <div class="hint" style="margin:8px 0 4px;">Classes cochées par l’enseignant — vérifiez :</div>
        <div style="display:flex;flex-wrap:wrap;gap:8px;">${DB.classes.map(c => `<label style="display:flex;align-items:center;gap:6px;"><input type="checkbox" class="demClasseVal_${d.id}" value="${c.id}" ${choisies.has(c.id)?'checked':''}> ${escapeHtml(c.nom)}</label>`).join('')}</div>
        <select id="demFiche_${d.id}" style="width:100%;margin:8px 0;"><option value="">Créer une nouvelle fiche enseignant</option>${libres.map(t => `<option value="${t.id}" ${suggere && suggere.id===t.id?'selected':''}>Relier à la fiche existante : ${escapeHtml(ensFullName(t))}</option>`).join('')}</select>
        <button class="btn sm" onclick="traiterDemandeAcces('${d.id}', true, 'enseignant')">Approuver</button>
        <button class="btn secondary sm" onclick="traiterDemandeAcces('${d.id}', false, 'enseignant')">Refuser</button>
      </div>`;
    }
    // Enfants cochés par le parent lui-même lors de son inscription
    // Enfants probables : le nom du parent (ou son message) ressemble au parent
    // noté sur la fiche, ou contient le nom / prénom de l'élève
    const choisisParParent = (d.eleve_ids || []).map(id => eleveById(id)).filter(Boolean);
    const probables = parent ? (choisisParParent.length ? choisisParParent : enfantsProbables(d)) : [];
    return `<div class="dem-carte"${sure(d) ? ` data-sure="${d.id}"` : ''}>
      <strong>${parent?'Parent':'Portier'} — ${escapeHtml(d.nom)}</strong>${sure(d) ? ' <span class="badge-etat ok">Sûre</span>' : ''}
      <div class="hint">${escapeHtml(d.email||'')}${d.telephone ? ' · 📱 ' + escapeHtml(d.telephone) : ''}${d.message?` · « ${escapeHtml(d.message)} »`:''}</div>
      ${parent && probables.length ? `<div class="hint" style="margin:8px 0 4px;">${choisisParParent.length ? 'Enfant(s) coché(s) par le parent' : 'Enfant(s) probable(s), d’après les noms'} — vérifiez avant d'approuver :</div>
        ${probables.map(e => `${indiceConfianceParent(d, e)}<label style="display:flex;align-items:center;gap:8px;margin:2px 0;"><input type="checkbox" class="demEnfant_${d.id}" value="${e.id}" checked> ${escapeHtml(eleveFullName(e))} — ${escapeHtml(classeName(e.classeId))} <span class="hint">(parent sur la fiche : ${escapeHtml(e.parentNom || '—')})</span></label>`).join('')}` : ''}
      ${parent && d.telephone && probables.some(e => !telephonesWhatsapp(e.parentTel).length) ? `<label style="display:flex;align-items:center;gap:8px;margin:6px 0;"><input type="checkbox" id="demTelFiche_${d.id}" data-tel="${escapeHtml(d.telephone)}" checked> Enregistrer ce numéro sur la fiche des enfants qui n’en ont pas</label>` : ''}
      ${parent ? `<select id="demEleve_${d.id}" style="width:100%;margin:8px 0;"><option value="">${probables.length ? '— Ajouter un autre enfant… —' : '— Lier à l’enfant… —'}</option>${opts}</select>` : ''}
      <button class="btn sm" onclick="traiterDemandeAcces('${d.id}', true, ${parent})">Approuver</button>
      <button class="btn secondary sm" onclick="traiterDemandeAcces('${d.id}', false, ${parent})">Refuser</button>
    </div>`;
  }).join('');
}
// Indice de confiance pour la direction : le numéro donné par le parent
// correspond-il à celui de la fiche de l'enfant ? Le nom ressemble-t-il ?
function indiceConfianceParent(demande, e){
  const chiffres = t => String(t || '').replace(/\D/g, '').replace(/^225/, '').slice(-10);
  const telDem = chiffres(demande.telephone);
  const telsFiche = telephonesWhatsapp(e.parentTel).map(chiffres);
  const mots = t => simplifierTexte(t).split(' ').filter(m => m.length >= 3);
  const nomOk = mots(e.parentNom).some(m => new Set(mots(demande.nom)).has(m));
  const signes = [];
  if(telDem.length >= 8 && telsFiche.includes(telDem)) signes.push('<span class="badge green">✅ Téléphone identique à la fiche</span>');
  else if(telDem.length >= 8 && telsFiche.length) signes.push('<span class="badge amber">⚠️ Téléphone différent de la fiche — appelez le numéro de la fiche pour vérifier</span>');
  else if(telDem.length >= 8) signes.push('<span class="badge">Fiche sans téléphone</span>');
  if(nomOk) signes.push('<span class="badge green">✅ Nom du parent identique à la fiche</span>');
  return signes.length ? `<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:6px;">${signes.join('')}</div>` : '';
}
function enfantsProbables(demande){
  const mots = t => simplifierTexte(t).split(' ').filter(m => m.length >= 3);
  const nomParent = new Set(mots(demande.nom));
  const message = new Set(mots(demande.message));
  return (DB.eleves || []).filter(e => e.statut === 'Actif').map(e => {
    const parentFiche = mots(e.parentNom);
    let score = parentFiche.filter(m => nomParent.has(m)).length * 2;                 // même nom que le parent de la fiche
    score += mots(e.nom).filter(m => nomParent.has(m)).length;                          // même nom de famille
    score += mots(`${e.nom} ${e.prenom}`).filter(m => message.has(m)).length * 2;       // enfant cité dans le message
    return { e, score };
  }).filter(x => x.score >= 2).sort((a, b) => b.score - a.score).slice(0, 4).map(x => x.e);
}
async function traiterDemandeAcces(id, approuver, parent){
  if(parent === 'enseignant'){
    const classes = $$('.demClasseVal_' + id).filter(c => c.checked).map(c => c.value);
    if(approuver && !classes.length){ toast('Cochez au moins une classe pour cet enseignant.'); return; }
    const fiche = $('#demFiche_' + id)?.value || null;
    const { error } = await sb.rpc('traiter_demande_acces', { p_id: id, p_approuver: approuver, p_eleve_ids: [], p_classe_ids: classes, p_enseignant_id: approuver ? fiche : null });
    if(error){ toast('Erreur : ' + error.message); return; }
    toast(approuver ? 'Enseignant validé ✅ : il ne voit que ses classes' : 'Demande refusée');
    if(approuver) proposerPrevenirApprouve(id);
    if(approuver){ try{ DB.enseignants = await dbSelectAll('enseignants_lecture'); DB.profiles = await dbSelectAll('profiles'); }catch(_e){} }
    if(approuver && $('#demandesEnsBox')) renderView('enseignants'); else chargerDemandesAcces();
    if(DB.aTraiter) DB.aTraiter.charge = 0;
    return;
  }
  const choix = choixDemandeParent(id, approuver && parent);
  if(approuver && parent && !choix.eleves.length){ toast("Choisissez l'enfant à lier à ce parent."); return; }
  const err = await appliquerDemandeAcces(id, approuver, choix);
  if(err){ toast('Erreur : ' + err); return; }
  toast(approuver ? 'Accès accordé ✅' : 'Demande refusée');
  if(approuver) proposerPrevenirApprouve(id);
  if(DB.aTraiter) DB.aTraiter.charge = 0;
  if(approuver && ui.currentView === 'liens-parents') await rechargerLiensParents(); else chargerDemandesAcces();
}
async function rechargerLiensParents(){
  try{ DB.profiles = await dbSelectAll('profiles'); DB.parentsEleves = await dbSelectAll('parents_eleves'); }catch(_e){}
  renderView('liens-parents');
}
// Après une validation : prévenir la personne sur WhatsApp (gratuit, message prêt)
function proposerPrevenirApprouve(id){
  const d = (window.__demandesAcces || {})[id]; if(!d) return;
  const tels = telephonesWhatsapp(d.telephone);
  const page = d.role_demande === 'enseignant' ? 'enseignant.html' : d.role_demande === 'portier' ? 'portier.html' : 'parent.html';
  const message = `Bonjour ${d.nom || ''},

Votre accès à l’application de ${DB.meta?.nomEcole || 'l’école'} est validé. Ouvrez l’application (ou ce lien) et connectez-vous avec le même compte Google :
${lienApplication(page)}

Bienvenue !`;
  openModal('Accès accordé ✅', `
    <p style="margin-top:0;"><strong>${escapeHtml(d.nom || '')}</strong> peut maintenant entrer dans l’application. Prévenez-le (ou la) pour qu’il (elle) ne reste pas à attendre :</p>
    <div class="pe-invit-liste">${tels.map(n => `<a class="btn" href="https://wa.me/${n}?text=${encodeURIComponent(message)}" target="_blank" rel="noopener">Prévenir sur WhatsApp · ${n.replace(/^225/, '').replace(/(\d{2})(?=\d)/g, '$1 ')}</a>`).join('') || '<div class="hint">Aucun numéro WhatsApp dans la demande.</div>'}</div>
    <div class="form-actions"><button type="button" class="btn secondary" onclick="closeModal()">Plus tard</button></div>`);
}
// Lit ce que la direction a coché sur la carte d'une demande parent
function choixDemandeParent(id, parent){
  if(!parent) return { eleves: [], tel: '' };
  const coches = $$('.demEnfant_' + id).filter(c => c.checked).map(c => c.value);
  const v = $('#demEleve_' + id)?.value;
  const tel = $('#demTelFiche_' + id)?.checked ? ($('#demTelFiche_' + id).dataset.tel || '') : '';
  return { eleves: [...new Set(coches.concat(v ? [v] : []))], tel };
}
// Même fonction sécurisée côté base (traiter_demande_acces) ; renvoie le message d'erreur ou null
async function appliquerDemandeAcces(id, approuver, choix){
  const { error } = await sb.rpc('traiter_demande_acces', { p_id: id, p_approuver: approuver, p_eleve_ids: approuver ? choix.eleves : [], p_classe_ids: [], p_enseignant_id: null });
  if(error) return error.message;
  if(approuver && choix.tel){
    for(const eid of choix.eleves){
      const e = eleveById(eid);
      if(e && !telephonesWhatsapp(e.parentTel).length){
        try{ await dbUpdate('eleves', eid, { parentTel: choix.tel }); e.parentTel = choix.tel; }catch(_e){}
      }
    }
  }
  return null;
}
// Approuve d'un coup les demandes parent « sûres » (téléphone identique à la fiche de chaque enfant)
async function approuverDemandesSures(){
  const ids = $$('[data-sure]').map(el => el.dataset.sure);
  if(!ids.length) return;
  if(!confirm(`Approuver ${ids.length} parents dont le téléphone correspond à la fiche de leur enfant ? Chacun verra uniquement son ou ses enfants.`)) return;
  const choix = ids.map(id => ({ id, ...choixDemandeParent(id, true) })).filter(c => c.eleves.length);
  let ok = 0; const erreurs = [];
  for(const c of choix){ const err = await appliquerDemandeAcces(c.id, true, c); if(err) erreurs.push(err); else ok++; }
  toast(erreurs.length ? `${ok} accès accordé(s) · ${erreurs.length} erreur(s) : ${erreurs[0]}` : `${ok} accès accordés ✅`);
  if(DB.aTraiter) DB.aTraiter.charge = 0;
  if(ok && ui.currentView === 'liens-parents') await rechargerLiensParents(); else chargerDemandesAcces();
}
function lienApplication(page){
  const base = window.location.href.replace(/[^/]*([?#].*)?$/, '');
  return base + page + '?ecole=' + encodeURIComponent(session.ecoleId);
}
function copierLienApplication(page){
  const lien = lienApplication(page);
  (navigator.clipboard ? navigator.clipboard.writeText(lien) : Promise.reject()).then(
    ()=>toast('Lien copié ✅'),
    ()=>{ window.prompt('Copiez ce lien :', lien); }
  );
}
// Message prêt à envoyer : le lien + comment installer l'application
function messagePartageApplication(page){
  const nomApp = page === 'parent.html' ? `EcoMaZ-PARENTS D'ELEVES ${DB.meta.nomEcole}` : page === 'enseignant.html' ? `EcoMaZ-ENSEIGNANTS ${DB.meta.nomEcole}` : `EcoMaZ-PORTIER ${DB.meta.nomEcole}`;
  if(page === 'enseignant.html') return `Bonjour, voici l'application ${nomApp} :\n${lienApplication(page)}\n\n`
    + `Ouvrez-la dans Chrome (Android) ou Safari (iPhone), touchez « Continuer avec Google », choisissez Monsieur ou Madame, écrivez votre NOM, vos prénoms et cochez votre ou vos classes. La direction validera votre inscription.`;
  return `Bonjour, voici l'application ${nomApp} :\n${lienApplication(page)}\n\n`
    + `Pour l'installer : ouvrez ce lien dans Chrome (Android) ou Safari (iPhone), puis touchez « Installer l'application sur ce téléphone » `
    + `(sur iPhone : Partager → Sur l'écran d'accueil). Connectez-vous ensuite avec Google : l'école validera votre accès.`;
}
function afficherQrApplication(page){
  const lien = lienApplication(page);
  let image = '';
  try{ const qr = qrcode(0, 'M'); qr.addData(lien); qr.make(); image = qr.createSvgTag({ cellSize: 6, margin: 2, scalable: true }); }catch(_e){}
  const titre = page === 'parent.html' ? `EcoMaZ-PARENTS D'ELEVES ${DB.meta.nomEcole}` : page === 'enseignant.html' ? `EcoMaZ-ENSEIGNANTS ${DB.meta.nomEcole}` : `EcoMaZ-PORTIER ${DB.meta.nomEcole}`;
  openModal('QR code à afficher', `
    <div style="text-align:center;">
      <h3 style="margin-top:0;">${escapeHtml(titre)}</h3>
      <div style="max-width:280px;margin:0 auto;">${image}</div>
      <p>Scannez avec l'appareil photo du téléphone pour ouvrir et installer l'application.</p>
    </div>
    <div class="form-actions no-print"><button type="button" class="btn secondary" onclick="closeModal()">Fermer</button><button type="button" class="btn" onclick="window.print()">🖨️ Imprimer</button></div>`);
}
// Affiche A4 à imprimer (entrée de l'école, salle des professeurs) : grand QR code + 3 étapes
const AFFICHES = {
  'parent.html': { titre:'Parents, suivez votre enfant', sous:'L’application des parents de l’école', etapes:['Scannez ce code avec l’appareil photo de votre téléphone.','Touchez « Continuer avec Google » puis cochez le nom de votre enfant.','L’école valide : vous recevez absences, devoirs, messages et annonces.'] },
  'enseignant.html': { titre:'Enseignants, votre application', sous:'Appel, devoirs, « Ma journée »', etapes:['Scannez ce code avec l’appareil photo de votre téléphone.','Touchez « Continuer avec Google », écrivez votre nom et cochez vos classes.','La direction valide : vous ne voyez que vos classes.'] },
  'preinscription.html': { titre:'Inscriptions ouvertes', sous:'Pré-inscrivez votre enfant en ligne', etapes:['Scannez ce code avec l’appareil photo de votre téléphone.','Remplissez le formulaire (2 minutes, sans créer de compte).','L’école vous rappelle pour finaliser l’inscription.'] },
};
function imprimerAffiche(page){
  const a = AFFICHES[page]; if(!a) return;
  const lien = page === 'preinscription.html' ? lienPreinscription() : lienApplication(page);
  let qr = '';
  try{ const q = qrcode(0, 'M'); q.addData(lien); q.make(); qr = q.createSvgTag({ cellSize: 8, margin: 2, scalable: true }); }catch(_e){}
  const m = DB.meta || {};
  openModal('🖨️ Affiche à imprimer', `
    <div class="affiche-a4">
      <div class="affiche-tete">${m.logo ? `<img src="${escapeHtml(m.logo)}" alt="">` : ''}<div><div class="affiche-ecole">${escapeHtml(m.nomEcole || '')}</div><div class="affiche-sous">${escapeHtml(a.sous)}</div></div></div>
      <h1 class="affiche-titre">${escapeHtml(a.titre)}</h1>
      <div class="affiche-qr">${qr}</div>
      <ol class="affiche-etapes">${a.etapes.map(e => `<li>${escapeHtml(e)}</li>`).join('')}</ol>
      <div class="affiche-lien">${escapeHtml(lien)}</div>
      <div class="affiche-pied">Gratuit · sans publicité · EcoMaZ</div>
    </div>
    <div class="form-actions no-print"><button type="button" class="btn secondary" onclick="closeModal()">Fermer</button><button type="button" class="btn" onclick="window.print()">🖨️ Imprimer l’affiche</button></div>`);
}
/* ---------- Mode d'emploi enseignant : une page A4 à remettre à chacun (démonstration en salle des maîtres) ---------- */
function imprimerGuideEnseignant(){
  const m = DB.meta || {};
  const lien = lienApplication('enseignant.html');
  let qr = ''; try{ const q = qrcode(0, 'M'); q.addData(lien); q.make(); qr = q.createSvgTag({ cellSize: 4, margin: 1, scalable: true }); }catch(_e){}
  const rappel = String(DB.horairesAnnonces?.rappelAppel || '').slice(0, 5);
  const heure = /^\d{2}:\d{2}$/.test(rappel) ? rappel.replace(/^0/, '').replace(':', ' h ').replace(' h 00', ' h') : '';
  const bloc = (num, titre, items) => `<section class="ge-bloc"><h3><span class="ge-num">${num}</span>${titre}</h3><ul>${items.map(i => `<li>${i}</li>`).join('')}</ul></section>`;
  openModal('Mode d’emploi enseignant', `
    <div class="form-actions no-print" style="margin-top:0;justify-content:flex-end;"><button type="button" class="btn" onclick="window.print()">${icone('printer')} Imprimer / PDF</button></div>
    <section class="guide-ens">
      <header class="ge-tete">${m.logo ? `<img src="${escapeHtml(m.logo)}" alt="">` : ''}
        <div><div class="ge-ecole">${escapeHtml(m.nomEcole || '')}</div><h2>EcoMaZ — mode d’emploi de l’enseignant</h2>
          <div class="ge-sous">Tout se fait depuis l’accueil « Mes tâches » : le plus important est toujours en haut.</div></div>
        <div class="ge-qr">${qr}<small>Scannez pour ouvrir votre application</small></div></header>
      <div class="ge-grille">
        ${bloc(1, 'Chaque jour de classe', [
          `<strong>Faire l’appel</strong>${heure ? ` avant ${heure}` : ''} : touchez « Absent » ou « Retard », les autres restent « Présent », puis « Valider l’appel ». Les parents des absents sont prévenus tout seuls.`,
          '<strong>Noter les devoirs</strong> (Cahier de textes) : touchez la matière, le jour, une phrase toute prête, puis « Enregistrer ». Les parents les lisent dans leur application.',
          '<strong>À savoir</strong> : absences prévenues par les parents, allergies, renforcement, parents arrivés au portail.'])}
        ${bloc(2, 'Chaque semaine', [
          '<strong>Rattraper un appel oublié</strong> : il apparaît dans « Cette semaine », un bouton suffit.',
          '<strong>Camps de base</strong> : « + Ajouter des notes », choisissez le type (devoir, exercice, interrogation), tapez la note de chaque élève. Elles font la moyenne de classe du bulletin.'])}
        ${bloc(3, 'Chaque mois', [
          '<strong>Mon programme</strong> : touchez « Mettre à jour l’avancement » et choisissez le pourcentage déjà fait.',
          '<strong>Mon rapport d’activité</strong> : votre régularité, vos devoirs et vos notes du mois.'])}
        ${bloc(4, 'Chaque trimestre', [
          '<strong>Compositions</strong> (Compositions et bulletins) : une note sur 20 par élève, « Entrée » passe au suivant.',
          '<strong>Appréciations du bulletin</strong> (titulaire) : touchez la phrase proposée ★ selon la moyenne, complétez si besoin, enregistrez.'])}
      </div>
      <section class="ge-astuces"><h3>Astuces</h3><ul>
        <li><strong>Alertes</strong> : sur l’accueil, touchez « Activer les alertes » une fois${heure ? ` : vous recevrez le rappel de l’appel à ${heure}` : ''}, même application fermée.</li>
        <li><strong>Texte trop petit ?</strong> Touchez « Aa » en haut de l’écran : Normale, Grande, Très grande.</li>
        <li><strong>Pas de réseau ?</strong> Faites l’appel quand même : il est gardé dans le téléphone et part tout seul au retour du réseau.</li>
        <li><strong>Installer l’application</strong> : dans Chrome, menu ⋮ → « Installer l’application » (iPhone : Partager → « Sur l’écran d’accueil »).</li>
      </ul></section>
      <footer class="ge-pied">Une question ? Adressez-vous à la direction.</footer>
    </section>`);
}
function renderLiensApplications(){
  const bloc = (titre, page, desc) => `
    <div style="margin-bottom:14px;">
      <strong>${titre}</strong>
      <div class="hint" style="margin:4px 0 6px;">${desc}</div>
      <input type="text" readonly value="${escapeHtml(lienApplication(page))}" onfocus="this.select()" style="width:100%;margin-bottom:6px;">
      <a class="btn sm" href="https://wa.me/?text=${encodeURIComponent(messagePartageApplication(page))}" target="_blank" rel="noopener">📲 Envoyer par WhatsApp</a>
      <button class="btn secondary sm" onclick="copierLienApplication('${page}')">📋 Copier le lien</button>
      <button class="btn secondary sm" onclick="afficherQrApplication('${page}')">🔳 QR code</button>
      ${AFFICHES[page] ? `<button class="btn secondary sm" onclick="imprimerAffiche('${page}')">🖨️ Affiche A4</button>` : ''}
      <a class="btn secondary sm" href="${escapeHtml(lienApplication(page))}" target="_blank" rel="noopener">Ouvrir</a>
    </div>`;
  return `
    ${bloc('👪 Application Parents', 'parent.html', 'À envoyer aux parents avec leurs identifiants (SMS, WhatsApp…). Ils voient les tableaux d’honneur, actualités et messages de l’école.')}
    ${bloc('👩‍🏫 Application Enseignants', 'enseignant.html', 'Chaque enseignant s’inscrit lui-même avec Google et coche ses classes ; vous validez dans Enseignants → Inscriptions des enseignants. Il ne voit ensuite que ses classes.')}
    ${bloc('🚪 Application Portier', 'portier.html', 'À ouvrir une seule fois sur le téléphone du portier. Ses signalements arrivent directement chez les enseignants.')}
    <div class="hint" style="line-height:1.6;">
      <strong>Pour installer :</strong> ouvrir le lien dans Chrome (Android) ou Safari (iPhone), puis toucher « 📲 Installer l’application sur ce téléphone » ou, sur iPhone, <em>Partager → Sur l’écran d’accueil</em>. Le message WhatsApp contient déjà ces explications.
    </div>`;
}
function renderGeofence(){
  const m = DB.meta;
  const configuree = m.geofenceLatitude != null && m.geofenceLongitude != null;
  return `
    <form onsubmit="return handleSaveGeofence(event)">
      <div class="form-grid">
        <div class="field"><label>Latitude</label><input type="number" step="any" name="latitude" id="geofenceLat" required value="${configuree?m.geofenceLatitude:''}"></div>
        <div class="field"><label>Longitude</label><input type="number" step="any" name="longitude" id="geofenceLon" required value="${configuree?m.geofenceLongitude:''}"></div>
        <div class="field"><label>Rayon toléré (mètres)</label><input type="number" min="10" step="10" name="rayon" value="${m.geofenceRayonMetres||100}"></div>
      </div>
      <div class="hint" style="margin:8px 0;">Le plus simple : ouvrez cette page depuis un téléphone, en vous tenant physiquement dans la cour de l'école, puis cliquez sur le bouton ci-dessous.</div>
      <button type="button" class="btn secondary sm" onclick="utiliserPositionActuelle()">📍 Utiliser ma position actuelle</button>
      <div class="form-actions"><button class="btn" type="submit">Enregistrer la zone</button></div>
    </form>
    <div class="pt-param">
      <strong>${icone('smartphone')} Affiche QR de pointage des enseignants</strong>
      <p class="hint">Imprimez-la et collez-la à l’entrée. Les enseignants la scannent dans « Mon pointage » ; le pointage n’est accepté que si leur téléphone est dans la zone ci-dessus. Les tentatives refusées arrivent dans Tableau de bord → Alertes pointage.</p>
      <div class="form-actions" style="justify-content:flex-start;"><button type="button" class="btn secondary" onclick="imprimerAfficheQrPointage(false)">${icone('printer')} Afficher / imprimer l’affiche</button>
      ${['direction', 'fondation'].includes(ui.role) ? `<button type="button" class="btn secondary" onclick="imprimerAfficheQrPointage(true)">${icone('refresh-cw')} Nouvelle affiche</button>` : ''}</div>
    </div>
  `;
}
function utiliserPositionActuelle(){
  if(!navigator.geolocation){ alert("Votre navigateur ne permet pas la géolocalisation."); return; }
  navigator.geolocation.getCurrentPosition(
    (pos)=>{
      $('#geofenceLat').value = pos.coords.latitude;
      $('#geofenceLon').value = pos.coords.longitude;
      toast('Position actuelle récupérée — vérifiez puis enregistrez');
    },
    (err)=> alert("Impossible d'obtenir votre position : " + err.message),
    { enableHighAccuracy: true, timeout: 15000 }
  );
}
async function handleSaveGeofence(ev){
  ev.preventDefault();
  const fd = new FormData(ev.target);
  const patch = {
    geofence_latitude: parseFloat(fd.get('latitude')),
    geofence_longitude: parseFloat(fd.get('longitude')),
    geofence_rayon_metres: Math.max(10, parseInt(fd.get('rayon'))||100),
  };
  try{
    const { error } = await exigerEffet(sb.from('ecoles').update(patch).eq('id', session.ecoleId));
    if(error) throw error;
    DB.meta.geofenceLatitude = patch.geofence_latitude;
    DB.meta.geofenceLongitude = patch.geofence_longitude;
    DB.meta.geofenceRayonMetres = patch.geofence_rayon_metres;
    toast('Zone enregistrée');
    renderView('parametres');
  }catch(e){ alert('Erreur : ' + e.message); }
  return false;
}

function voirMessage(id){
  const m = DB.messages.find(x=>x.id===id);
  if(!m) return;
  openModal('Message envoyé', `
    <div class="hint">${fmtDate(m.date)} à ${m.heure} · Canal : ${m.canal}</div>
    <div class="hint" style="margin-bottom:10px;">À : <strong>${escapeHtml(m.destinataireNom)}</strong> (${m.destinataireRole})${m.destinataireTel?' · '+escapeHtml(m.destinataireTel):''}</div>
    <div class="txn-item" style="border:1px solid var(--border);border-radius:var(--r-card);padding:14px;background:var(--surface-2);">
      <div class="txn-body"><div style="font-size:var(--fs-sm);line-height:1.5;">${escapeHtml(m.contenu)}</div></div>
    </div>
    <div class="form-actions"><button type="button" class="btn secondary" onclick="closeModal()">Fermer</button></div>`);
}

