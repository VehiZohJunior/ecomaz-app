/* ---------------------------------------------------------------------
   10. EMPLOI DU TEMPS
   --------------------------------------------------------------------- */
function renderEmploiTemps(){
  const mesClasses = classesVisibles();
  if(mesClasses.length === 0){
    return `<div class="view active"><div class="panel"><div class="empty-state"><div class="em-ic">🗓️</div>Aucune classe configurée pour le moment. Activez au moins un niveau scolaire dans Paramètres pour commencer à préparer un emploi du temps.</div></div></div>`;
  }
  let classeId = ui.filters.ttClasse || mesClasses[0].id;
  if(!mesClasses.some(c=>c.id===classeId)) classeId = mesClasses[0].id;
  ui.filters.ttClasse = classeId;
  const c = DB.classes.find(x=>x.id===classeId);
  if(classeEnHorairesLibres(classeId)) return renderEdtLibre(c, mesClasses);
  const periodes = PERIODES_BY_CYCLE[c.cycle];
  const maintenant = new Date();
  const jourActuel = JOURS[(maintenant.getDay() + 6) % 7] || null;   // samedi/dimanche -> aucun
  const hhmm = `${String(maintenant.getHours()).padStart(2,'0')}:${String(maintenant.getMinutes()).padStart(2,'0')}`;
  const estEnCours = (p, jour) => jour === jourActuel && p.debut <= hhmm && hhmm < p.fin;
  const modif = ['secretariat','direction','fondation'].includes(ui.role);
  const nbCours = periodes.filter(p => p.type !== 'pause').length * joursDeClasseEdt().length;
  const nbRemplis = DB.emploiTemps.filter(e => e.classeId === classeId).length;

  let rowsHtml = '';
  periodes.forEach((p,i)=>{
    if(p.type==='pause'){
      rowsHtml += `<tr><td class="tt-time">${p.debut}-${p.fin}</td><td colspan="${joursDeClasseEdt().length}" style="background:var(--surface-2);color:var(--text-dim);font-weight:700;font-size:var(--fs-xs);">${p.label}</td></tr>`;
      return;
    }
    rowsHtml += `<tr><td class="tt-time">${p.debut}-${p.fin}</td>`;
    joursDeClasseEdt().forEach(jour=>{
      const entry = DB.emploiTemps.find(e=>e.classeId===classeId && e.jour===jour && e.slotIndex===i);
      if(entry){
        const t = enseignantById(entry.enseignantId);
        rowsHtml += `<td${estEnCours(p, jour) ? ' class="tt-encours"' : ''}>
          <div class="tt-slot" style="--mat:${couleurMatiere(entry.matiere)}">
            ${estEnCours(p, jour) ? '<span class="tt-badge-encours">En cours</span>' : ''}
            <b>${escapeHtml(entry.matiere)}</b>
            <span>${escapeHtml(ensFullName(t))}</span>
            ${modif ? `<div style="margin-top:5px;display:flex;gap:4px;">
              <button class="icon-btn" style="width:22px;height:22px;font-size:var(--fs-xs);" onclick="openSlotForm('${classeId}','${jour}',${i})">✏️</button>
              <button class="icon-btn danger" style="width:22px;height:22px;font-size:var(--fs-xs);" onclick="clearSlot('${entry.id}')">✕</button>
            </div>` : ''}
          </div>
        </td>`;
      } else {
        rowsHtml += modif ? `<td><button type="button" class="edt-vide" style="width:100%;" onclick="openSlotForm('${classeId}','${jour}',${i})">+ Ajouter</button></td>` : '<td></td>';
      }
    });
    rowsHtml += `</tr>`;
  });

  // Refonte (DESIGN.md §11) : sur téléphone, un jour à la fois en liste verticale
  const jourVu = joursDeClasseEdt().includes(ui.filters.ttJour) ? ui.filters.ttJour : (joursDeClasseEdt().includes(jourActuel) ? jourActuel : joursDeClasseEdt()[0]);
  const listeJour = periodes.map((p, i) => {
    if(p.type === 'pause') return `<li class="edt-pause"><span>${p.debut} – ${p.fin}</span><strong>${escapeHtml(p.label)}</strong></li>`;
    const entry = DB.emploiTemps.find(e => e.classeId === classeId && e.jour === jourVu && e.slotIndex === i);
    const heure = `<span class="edt-heure"><strong>${p.debut}</strong><small>${p.fin}</small></span>`;
    if(!entry) return `<li class="edt-ligne">${heure}${modif ? `<button type="button" class="edt-vide" onclick="openSlotForm('${classeId}','${jourVu}',${i})">+ Ajouter un cours</button>` : '<span class="hint" style="margin:0;">—</span>'}</li>`;
    const t = enseignantById(entry.enseignantId), enCours = estEnCours(p, jourVu);
    return `<li class="edt-ligne">${heure}<div class="edt-cours${enCours ? ' en-cours' : ''}" style="--mat:${couleurMatiere(entry.matiere)}">
      <span class="edt-txt"><strong>${escapeHtml(entry.matiere)}</strong><small>${escapeHtml(ensFullName(t))}</small>${enCours ? '<span class="tt-badge-encours">En cours</span>' : ''}</span>
      ${modif ? `<span class="edt-act"><button type="button" class="btn secondary sm" onclick="openSlotForm('${classeId}','${jourVu}',${i})">Modifier</button><button type="button" class="icon-btn danger" aria-label="Vider ce créneau" title="Vider ce créneau" onclick="clearSlot('${entry.id}')">✕</button></span>` : ''}
    </div></li>`;
  }).join('');
  return `
  <div class="view active">
    <div class="panel">
      <div class="panel-head">
        <div><h2>Emploi du temps</h2><div class="sub">${c.nom} · ${c.cycle} · ${nbRemplis} / ${nbCours} créneaux remplis</div></div>
        <span style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
        ${choixClasse(mesClasses, classeId, "ui.filters.ttClasse=this.value; renderView('emploi-temps')")}
        ${modif ? `<button type="button" class="btn sm" onclick="ouvrirRemplissageEdt('${classeId}')">⚡ Remplir rapidement</button>` : ''}
        <button type="button" class="btn secondary sm" onclick="imprimerEmploiTemps('${classeId}')">${icone('printer')} Imprimer</button></span>
      </div>
      ${modif && !nbRemplis ? `<div class="banniere-discrete" style="margin-bottom:12px;"><span>⚡</span><span>Cet emploi du temps est vide. Touchez <strong>« Remplir rapidement »</strong> : une proposition est préparée en un geste, vous n’avez plus qu’à ajuster.</span></div>` : ''}
      <div class="seulement-mobile">
        <div class="segmente edt-jours" role="tablist" aria-label="Jour">${joursDeClasseEdt().map(j => `<button type="button" role="tab" class="seg${j === jourVu ? ' actif' : ''}" aria-selected="${j === jourVu}" onclick="ui.filters.ttJour='${j}'; renderView('emploi-temps')">${j.slice(0, 3)}${j === jourActuel ? '<span class="edt-auj" aria-label="aujourd’hui"></span>' : ''}</button>`).join('')}</div>
        <ul class="edt-liste">${listeJour}</ul>
      </div>
      <div class="table-wrap seulement-ordi">
        <table class="timetable">
          <thead><tr><th>Horaire</th>${joursDeClasseEdt().map(j=>`<th>${j}</th>`).join('')}</tr></thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>
    </div>
  </div>`;
}

const COULEURS_MATIERES = ['#2E7D62', '#B5492F', '#C48A1E', '#3E7C8A', '#7A5C99', '#8A6A3B', '#1F5C46', '#A8506A'];
function couleurMatiere(m){
  let h = 0; for(const ch of String(m || '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return COULEURS_MATIERES[h % COULEURS_MATIERES.length];
}
// Emploi du temps imprimable (A4) : à afficher en classe ou à remettre aux parents
function imprimerEmploiTemps(classeId){
  const c = DB.classes.find(x => x.id === classeId); if(!c) return;
  if(classeEnHorairesLibres(classeId)) return imprimerEdtLibre(c);
  const m = DB.meta || {};
  const periodes = PERIODES_BY_CYCLE[c.cycle] || [];
  const lignes = periodes.map((p, i) => p.type === 'pause'
    ? `<tr class="edt-imp-pause"><td>${p.debut} – ${p.fin}</td><td colspan="${joursDeClasseEdt().length}">${escapeHtml(p.label)}</td></tr>`
    : `<tr><td class="edt-imp-heure">${p.debut}<br>${p.fin}</td>${joursDeClasseEdt().map(j => {
        const e = DB.emploiTemps.find(x => x.classeId === classeId && x.jour === j && x.slotIndex === i);
        if(!e) return '<td></td>';
        const t = enseignantById(e.enseignantId);
        return `<td style="border-left:4px solid ${couleurMatiere(e.matiere)};"><strong>${escapeHtml(e.matiere)}</strong>${t ? `<small>${escapeHtml(ensFullName(t))}</small>` : ''}</td>`;
      }).join('')}</tr>`).join('');
  openModal(`Emploi du temps — ${c.nom}`, `
    <div class="form-actions no-print" style="margin-top:0;justify-content:flex-end;"><button type="button" class="btn" onclick="window.print()">${icone('printer')} Imprimer / PDF</button></div>
    <section class="edt-impression">
      <div class="recu-head">${m.logo ? `<img src="${escapeHtml(m.logo)}" alt="">` : `<div class="recu-logo-ph">🎓</div>`}
        <div><strong>${escapeHtml(m.nomEcole || '')}</strong><div class="hint">${escapeHtml(m.adresse || '')}</div></div>
        <div style="margin-left:auto;text-align:right;"><strong>EMPLOI DU TEMPS</strong><div class="hint">${escapeHtml(c.nom)} · ${escapeHtml(m.anneeScolaire || '')}</div></div></div>
      <table class="edt-imp-table"><thead><tr><th>Horaire</th>${joursDeClasseEdt().map(j => `<th>${j}</th>`).join('')}</tr></thead><tbody>${lignes}</tbody></table>
    </section>`);
}
/* ---------- Emploi du temps aux horaires réels (séances de durée libre, versions dans l'année) ---------- */
// Jours de classe de l'école (Paramètres → horaires) : le mercredi n'apparaît pas s'il n'y a pas cours
function joursDeClasseEdt(){
  const jours = DB?.horairesAnnonces?.joursCours || [1, 2, 3, 4, 5];
  const res = JOURS.filter((j, i) => jours.includes(i + 1));
  return res.length ? res : JOURS;
}
// Barre d'onglets qui glisse (téléphone) : l'onglet actif est ramené au centre, sans faire bouger la page
function centrerOngletActif(){
  document.querySelectorAll('.subtabs').forEach(barre => { const a = barre.querySelector('.subtab.active'); if(a && barre.scrollWidth > barre.clientWidth) barre.scrollLeft = a.offsetLeft - (barre.clientWidth - a.offsetWidth) / 2; });
}
function hhmmEdt(t){ return String(t || '').slice(0, 5); }
function classeEnHorairesLibres(classeId){ return (DB.emploiTemps || []).some(e => e.classeId === classeId && e.heureDebut); }
function seanceValide(e, dateRef){ return (!e.valableDu || e.valableDu <= dateRef) && (!e.valableAu || e.valableAu >= dateRef); }
function seancesEdt(classeId, jour, dateRef){
  dateRef = dateRef || todayISO();
  return (DB.emploiTemps || []).filter(e => e.classeId === classeId && e.jour === jour && e.heureDebut && seanceValide(e, dateRef))
    .sort((a, b) => hhmmEdt(a.heureDebut).localeCompare(hhmmEdt(b.heureDebut)));
}
function versionsEdt(classeId){
  const m = new Map();
  (DB.emploiTemps || []).filter(e => e.classeId === classeId && e.heureDebut).forEach(e => {
    const k = (e.valableDu || '') + '|' + (e.valableAu || '');
    if(!m.has(k)) m.set(k, { cle: k, du: e.valableDu || null, au: e.valableAu || null });
  });
  return [...m.values()].sort((a, b) => (a.du || '').localeCompare(b.du || '') || (a.au || '9').localeCompare(b.au || '9'));
}
function libelleVersionEdt(v){ return v.du && v.au ? `du ${fmtDate(v.du)} au ${fmtDate(v.au)}` : v.au ? `jusqu’au ${fmtDate(v.au)}` : v.du ? `à partir du ${fmtDate(v.du)}` : 'toute l’année'; }
function versionChoisieEdt(classeId){
  const vs = versionsEdt(classeId), auj = todayISO();
  return vs.find(v => v.cle === ui.filters.ttVersion) || vs.find(v => (!v.du || v.du <= auj) && (!v.au || v.au >= auj)) || vs[0] || { cle: '|', du: null, au: null };
}
function dateRefVersion(v){ const auj = todayISO(); return (!v.du || v.du <= auj) && (!v.au || v.au >= auj) ? auj : (v.du || v.au || auj); }
// Domaines de la légende officielle (Français, Mathématiques, Éveil…), pour colorer chaque séance
const DOMAINES_EDT = [
  ['Études surveillées', /[ée]tudes surveill/i, '#8A6A3B'],
  ['Anglais / Informatique', /anglais|informatique/i, '#A8506A'],
  ['Mathématiques', /math/i, '#B5492F'],
  ['Sciences et Technologie / Histoire-Géographie', /science|histoire|g[ée]ographie/i, '#7A5C99'],
  ['Éveil / EPS / AEC / EDHC / Chant', /\beps\b|\baec\b|edhc|chant|comptine|salut aux couleurs|coop[ée]rati/i, '#C48A1E'],
  ['Français', /.*/, '#2E6F86'],
];
function domaineActivite(nom){ return DOMAINES_EDT.find(d => d[1].test(String(nom || ''))) || DOMAINES_EDT[DOMAINES_EDT.length - 1]; }
function couleurActivite(nom){ return domaineActivite(nom)[2]; }
function libellePause(debut, fin){ return debut >= '12:00' && fin <= '14:30' ? 'Pause de midi' : debut >= '09:45' && debut <= '10:30' ? 'Récréation' : 'Pause'; }
// Séances du jour avec les pauses intercalées
function lignesJourEdt(seances){
  const lignes = [];
  seances.forEach((e, i) => {
    const prec = seances[i - 1];
    if(prec && hhmmEdt(prec.heureFin) < hhmmEdt(e.heureDebut)) lignes.push({ pause: true, debut: hhmmEdt(prec.heureFin), fin: hhmmEdt(e.heureDebut) });
    lignes.push({ e });
  });
  return lignes;
}
function renderEdtLibre(c, mesClasses){
  const classeId = c.id, modif = ['secretariat','direction','fondation'].includes(ui.role);
  const vs = versionsEdt(classeId), v = versionChoisieEdt(classeId), ref = dateRefVersion(v), auj = todayISO();
  const jours = JOURS.filter(j => seancesEdt(classeId, j, ref).length);
  const maintenant = new Date(), hm = `${String(maintenant.getHours()).padStart(2,'0')}:${String(maintenant.getMinutes()).padStart(2,'0')}`;
  const jourActuel = JOURS[(maintenant.getDay() + 6) % 7] || null;
  const total = jours.reduce((t, j) => t + seancesEdt(classeId, j, ref).length, 0);
  const ligneHtml = (l, jour) => {
    if(l.pause) return `<li class="edtl-pause"><span>${l.debut} – ${l.fin}</span><strong>${libellePause(l.debut, l.fin)}</strong></li>`;
    const e = l.e, t = enseignantById(e.enseignantId), d = hhmmEdt(e.heureDebut), f = hhmmEdt(e.heureFin);
    const enCours = ref === auj && jour === jourActuel && d <= hm && hm < f;
    return `<li class="edtl-seance${enCours ? ' en-cours' : ''}" style="--mat:${couleurActivite(e.matiere)}">
      <span class="edtl-heure">${d}<small>${f}</small></span>
      <span class="edtl-txt"><strong>${escapeHtml(e.matiere || '')}</strong>${t ? `<small>${escapeHtml(ensFullName(t))}</small>` : ''}${enCours ? '<span class="tt-badge-encours">En cours</span>' : ''}</span>
      ${modif ? `<span class="edtl-act"><button type="button" class="icon-btn" aria-label="Modifier cette séance" title="Modifier" onclick="openSeanceForm('${classeId}','${jour}','${e.id}')">✏️</button></span>` : ''}
    </li>`;
  };
  const colonne = jour => `<div class="edtl-jour${jour === jourActuel && ref === auj ? ' aujourdhui' : ''}"><h3>${jour}</h3>
    <ul class="edtl-liste">${lignesJourEdt(seancesEdt(classeId, jour, ref)).map(l => ligneHtml(l, jour)).join('')}</ul>
    ${modif ? `<button type="button" class="edt-vide" onclick="openSeanceForm('${classeId}','${jour}','')">+ Ajouter une séance</button>` : ''}</div>`;
  const jourVu = jours.includes(ui.filters.ttJour) ? ui.filters.ttJour : (jours.includes(jourActuel) ? jourActuel : jours[0]);
  return `
  <div class="view active">
    <div class="panel">
      <div class="panel-head">
        <div><h2>Emploi du temps</h2><div class="sub">${escapeHtml(c.nom)} · ${escapeHtml(c.cycle)} · ${total} séances par semaine${vs.length > 1 ? ' · ' + libelleVersionEdt(v) : ''}</div></div>
        <span style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
          ${choixClasse(mesClasses, classeId, "ui.filters.ttClasse=this.value; ui.filters.ttVersion=''; renderView('emploi-temps')")}
          <button type="button" class="btn secondary sm" onclick="imprimerEmploiTemps('${classeId}')">${icone('printer')} Imprimer</button></span>
      </div>
      ${vs.length > 1 ? `<div class="segmente edtl-versions" role="tablist" aria-label="Période">${vs.map(x => `<button type="button" role="tab" class="seg${x.cle === v.cle ? ' actif' : ''}" aria-selected="${x.cle === v.cle}" onclick="ui.filters.ttVersion='${x.cle}'; renderView('emploi-temps')">${escapeHtml(libelleVersionEdt(x))}${(!x.du || x.du <= auj) && (!x.au || x.au >= auj) ? ' · en cours' : ''}</button>`).join('')}</div>` : ''}
      <div class="edtl-legende">${DOMAINES_EDT.filter(d => jours.some(j => seancesEdt(classeId, j, ref).some(e => domaineActivite(e.matiere) === d))).map(d => `<span><i style="background:${d[2]}"></i>${escapeHtml(d[0])}</span>`).join('')}</div>
      <div class="seulement-mobile">
        <div class="segmente edt-jours" role="tablist" aria-label="Jour">${jours.map(j => `<button type="button" role="tab" class="seg${j === jourVu ? ' actif' : ''}" aria-selected="${j === jourVu}" onclick="ui.filters.ttJour='${j}'; renderView('emploi-temps')">${j.slice(0, 3)}${j === jourActuel ? '<span class="edt-auj" aria-label="aujourd’hui"></span>' : ''}</button>`).join('')}</div>
        ${jourVu ? colonne(jourVu) : ''}
      </div>
      <div class="edtl-grille seulement-ordi" style="grid-template-columns:repeat(${Math.max(1, jours.length)}, minmax(0, 1fr));">${jours.map(colonne).join('')}</div>
    </div>
  </div>`;
}
function openSeanceForm(classeId, jour, id){
  const c = DB.classes.find(x => x.id === classeId); if(!c) return;
  const e = id ? DB.emploiTemps.find(x => x.id === id) : null;
  const v = versionChoisieEdt(classeId);
  const activites = [...new Set(DB.emploiTemps.filter(x => x.heureDebut && x.matiere).map(x => x.matiere))].sort();
  const ens = DB.enseignants.filter(t => t.statut === 'Actif').sort((a, b) => Number((b.classesAssignees || []).includes(classeId)) - Number((a.classesAssignees || []).includes(classeId)) || (a.nom || '').localeCompare(b.nom || ''));
  const parDefaut = e ? e.enseignantId : titulaireClasse(classeId)?.id;
  openModal(`${e ? 'Séance' : 'Nouvelle séance'} — ${c.nom}, ${jour}`, `
${boutonRemplissage('seance', "SCHEMA_SEANCE", 'formSeance')}
    <form id="formSeance" onsubmit="return enregistrerSeance(event,'${classeId}','${jour}','${e ? e.id : ''}')">
      <div class="form-grid">
        <div class="field"><label>Début</label><input type="time" name="debut" required value="${e ? hhmmEdt(e.heureDebut) : ''}"></div>
        <div class="field"><label>Fin</label><input type="time" name="fin" required value="${e ? hhmmEdt(e.heureFin) : ''}"></div>
      </div>
      <div class="field"><label>Activité</label><input name="matiere" required maxlength="120" list="activitesEdt" value="${escapeHtml(e ? e.matiere || '' : '')}"><datalist id="activitesEdt">${activites.map(a => `<option value="${escapeHtml(a)}">`).join('')}</datalist></div>
      <div class="field"><label>Enseignant</label><select name="enseignantId"><option value="">— À attribuer plus tard —</option>${ens.map(t => `<option value="${t.id}" ${parDefaut === t.id ? 'selected' : ''}>${escapeHtml(ensFullName(t))}${(t.classesAssignees || []).includes(classeId) ? ' (sa classe)' : ''}</option>`).join('')}</select></div>
      ${versionsEdt(classeId).length > 1 ? `<div class="hint">Période : ${escapeHtml(libelleVersionEdt(v))}</div>` : ''}
      <div class="form-actions">
        ${e ? `<button type="button" class="btn secondary danger-texte" onclick="supprimerSeance('${e.id}')">Supprimer</button>` : ''}
        <button type="button" class="btn secondary" onclick="closeModal()">Annuler</button>
        <button type="submit" class="btn">Enregistrer</button>
      </div>
    </form>`);
}
async function enregistrerSeance(ev, classeId, jour, id){
  ev.preventDefault();
  const fd = new FormData(ev.target);
  const debut = fd.get('debut'), fin = fd.get('fin'), matiere = String(fd.get('matiere') || '').trim(), enseignantId = fd.get('enseignantId') || null;
  if(!debut || !fin || fin <= debut){ alert('L’heure de fin doit être après l’heure de début.'); return false; }
  const v = versionChoisieEdt(classeId), ref = dateRefVersion(v);
  const chevauche = seancesEdt(classeId, jour, ref).find(x => x.id !== id && hhmmEdt(x.heureDebut) < fin && debut < hhmmEdt(x.heureFin));
  if(chevauche && !confirm(`Cette séance chevauche « ${chevauche.matiere} » (${hhmmEdt(chevauche.heureDebut)} – ${hhmmEdt(chevauche.heureFin)}). Enregistrer quand même ?`)) return false;
  try{
    if(id){
      await dbUpdate('emploi_temps', id, { heureDebut: debut, heureFin: fin, matiere, enseignantId });
      Object.assign(DB.emploiTemps.find(x => x.id === id), { heureDebut: debut + ':00', heureFin: fin + ':00', matiere, enseignantId });
    } else {
      const rang = Math.max(-1, ...DB.emploiTemps.filter(x => x.classeId === classeId && x.jour === jour).map(x => x.slotIndex || 0)) + 1;
      DB.emploiTemps.push(await dbInsert('emploi_temps', { classeId, jour, slotIndex: rang, matiere, enseignantId, heureDebut: debut, heureFin: fin, valableDu: v.du, valableAu: v.au }));
    }
    closeModal(); toast('Séance enregistrée'); renderView('emploi-temps');
  }catch(e){ alert('Erreur : ' + e.message); }
  return false;
}
async function supprimerSeance(id){
  if(!confirm('Supprimer cette séance ?')) return;
  try{ await dbDelete('emploi_temps', id); DB.emploiTemps = DB.emploiTemps.filter(x => x.id !== id); closeModal(); toast('Séance supprimée'); renderView('emploi-temps'); }
  catch(e){ alert('Erreur : ' + e.message); }
}
function imprimerEdtLibre(c){
  const m = DB.meta || {}, v = versionChoisieEdt(c.id), ref = dateRefVersion(v), vs = versionsEdt(c.id);
  const jours = JOURS.filter(j => seancesEdt(c.id, j, ref).length);
  const colonne = j => `<td>${lignesJourEdt(seancesEdt(c.id, j, ref)).map(l => l.pause
    ? `<div class="edtl-imp-pause">${l.debut} – ${l.fin} · ${libellePause(l.debut, l.fin)}</div>`
    : `<div class="edtl-imp-seance" style="border-left-color:${couleurActivite(l.e.matiere)}"><span>${hhmmEdt(l.e.heureDebut)}–${hhmmEdt(l.e.heureFin)}</span> ${escapeHtml(l.e.matiere || '')}</div>`).join('')}</td>`;
  openModal(`Emploi du temps — ${c.nom}`, `
    <div class="form-actions no-print" style="margin-top:0;justify-content:flex-end;"><button type="button" class="btn" onclick="window.print()">${icone('printer')} Imprimer / PDF</button></div>
    <section class="edt-impression edtl-impression">
      <div class="recu-head">${m.logo ? `<img src="${escapeHtml(m.logo)}" alt="">` : `<div class="recu-logo-ph">🎓</div>`}
        <div><strong>${escapeHtml(m.nomEcole || '')}</strong><div class="hint">${escapeHtml(m.adresse || '')}</div></div>
        <div style="margin-left:auto;text-align:right;"><strong>EMPLOI DU TEMPS</strong><div class="hint">${escapeHtml(c.nom)} · ${escapeHtml(m.anneeScolaire || '')}${vs.length > 1 ? ' · ' + escapeHtml(libelleVersionEdt(v)) : ''}</div></div></div>
      <table class="edtl-imp-table"><thead><tr>${jours.map(j => `<th>${j}</th>`).join('')}</tr></thead><tbody><tr>${jours.map(colonne).join('')}</tr></tbody></table>
      <div class="edtl-legende">${DOMAINES_EDT.map(d => `<span><i style="background:${d[2]}"></i>${escapeHtml(d[0])}</span>`).join('')}</div>
    </section>`);
}
function openSlotForm(classeId, jour, slotIndex){
  const c = DB.classes.find(x=>x.id===classeId);
  const matieres = MATIERES_BY_CYCLE[c.cycle];
  const existing = DB.emploiTemps.find(e=>e.classeId===classeId && e.jour===jour && e.slotIndex===slotIndex);
  const eligibleEns = DB.enseignants.filter(t => t.statut === 'Actif')
    .sort((a, b) => Number((b.classesAssignees || []).includes(classeId)) - Number((a.classesAssignees || []).includes(classeId)) || (a.nom || '').localeCompare(b.nom || ''));
  const parDefaut = existing ? existing.enseignantId : titulaireClasse(classeId)?.id;
  openModal(`Créneau — ${jour}`, `
    <form onsubmit="return handleSaveSlot(event,'${classeId}','${jour}',${slotIndex},'${existing?existing.id:''}')">
      <div class="form-grid single">
        <div class="field"><label>Matière</label>
          <select name="matiere">${matieres.map(m=>`<option ${existing?.matiere===m?'selected':''}>${m}</option>`).join('')}</select>
        </div>
        <div class="field"><label>Enseignant</label>
          <select name="enseignantId"><option value="">— À attribuer plus tard —</option>${eligibleEns.map(t=>`<option value="${t.id}" ${parDefaut===t.id?'selected':''}>${escapeHtml(ensFullName(t))}${(t.classesAssignees || []).includes(classeId) ? ' (sa classe)' : ''}</option>`).join('')}</select>
        </div>
      </div>
      <div class="form-actions">
        <button type="button" class="btn secondary" onclick="closeModal()">Annuler</button>
        <button type="submit" class="btn">Enregistrer</button>
      </div>
    </form>`);
}

async function handleSaveSlot(ev, classeId, jour, slotIndex, existingId){
  ev.preventDefault();
  const fd = new FormData(ev.target);
  const matiere = fd.get('matiere'), enseignantId = fd.get('enseignantId') || null;
  try{
    if(existingId){
      await dbUpdate('emploi_temps', existingId, {matiere, enseignantId});
      const e = DB.emploiTemps.find(x=>x.id===existingId);
      e.matiere = matiere; e.enseignantId = enseignantId;
    } else {
      DB.emploiTemps.push(await dbInsert('emploi_temps', {classeId, jour, slotIndex, matiere, enseignantId}));
    }
    closeModal(); toast('Créneau enregistré');
    renderView('emploi-temps');
  }catch(e){ alert('Erreur : ' + e.message); }
  return false;
}

// Titulaire : premier enseignant actif dont la fiche porte cette classe
function titulaireClasse(classeId){
  return DB.enseignants.find(t => t.statut === 'Actif' && (t.classesAssignees || []).includes(classeId)) || null;
}
function ouvrirRemplissageEdt(classeId){
  const c = DB.classes.find(x => x.id === classeId); if(!c) return;
  const tit = titulaireClasse(classeId);
  const aLundi = DB.emploiTemps.some(e => e.classeId === classeId && e.jour === JOURS[0]);
  const sources = DB.classes.filter(x => x.id !== classeId && x.cycle === c.cycle && DB.emploiTemps.some(e => e.classeId === x.id));
  const nb = DB.emploiTemps.filter(e => e.classeId === classeId).length;
  openModal(`Remplir rapidement — ${c.nom}`, `
    <p class="hint" style="margin-top:0;">Seuls les créneaux <strong>vides</strong> sont remplis : rien de ce qui est déjà saisi n’est écrasé. Enseignant proposé : ${tit ? `<strong>${escapeHtml(ensFullName(tit))}</strong> (titulaire)` : '<strong>à attribuer plus tard</strong> (aucun enseignant n’a encore cette classe sur sa fiche)'}.</p>
    <div class="edt-rapide">
      <button type="button" class="edt-rapide-choix" onclick="remplirEdt('${classeId}','proposition')"><strong>✨ Proposition automatique</strong><small>Les matières du ${escapeHtml(c.cycle.toLowerCase())} réparties sur la semaine, les matières principales le matin. À ajuster ensuite.</small></button>
      ${aLundi ? `<button type="button" class="edt-rapide-choix" onclick="remplirEdt('${classeId}','lundi')"><strong>📋 Copier le lundi sur toute la semaine</strong><small>Les cours du lundi sont recopiés du mardi au vendredi.</small></button>` : ''}
      ${sources.map(x => `<button type="button" class="edt-rapide-choix" onclick="remplirEdt('${classeId}','classe','${x.id}')"><strong>📑 Copier l’emploi du temps de ${escapeHtml(x.nom)}</strong><small>Mêmes matières aux mêmes heures, avec l’enseignant de ${escapeHtml(c.nom)}.</small></button>`).join('')}
    </div>
    ${nb ? `<div class="form-actions" style="justify-content:flex-start;"><button type="button" class="btn secondary sm danger-texte" onclick="viderEdtClasse('${classeId}')">Vider tout l’emploi du temps de ${escapeHtml(c.nom)} (${nb} créneaux)</button></div>` : ''}`);
}
async function remplirEdt(classeId, mode, sourceId){
  const c = DB.classes.find(x => x.id === classeId); if(!c) return;
  const periodes = PERIODES_BY_CYCLE[c.cycle] || [];
  const cours = periodes.map((p, i) => p.type === 'pause' ? null : i).filter(i => i !== null);
  const occupe = (j, i) => DB.emploiTemps.some(e => e.classeId === classeId && e.jour === j && e.slotIndex === i);
  const tit = titulaireClasse(classeId)?.id || null;
  const mats = MATIERES_BY_CYCLE[c.cycle] || [];
  const lignes = [];
  joursDeClasseEdt().forEach((j, d) => cours.forEach((i, k) => {
    if(occupe(j, i)) return;
    let matiere = null;
    if(mode === 'proposition' && mats.length){
      // Matières principales (début de liste) le matin ; les autres tournent sur la semaine
      const principales = mats.slice(0, Math.min(2, mats.length)), autres = mats.slice(principales.length);
      matiere = k < principales.length ? principales[(k + d) % principales.length] : (autres.length ? autres[(k - principales.length + d * 2) % autres.length] : principales[k % principales.length]);
    } else if(mode === 'lundi'){
      matiere = DB.emploiTemps.find(e => e.classeId === classeId && e.jour === JOURS[0] && e.slotIndex === i)?.matiere || null;
    } else if(mode === 'classe'){
      matiere = DB.emploiTemps.find(e => e.classeId === sourceId && e.jour === j && e.slotIndex === i)?.matiere || null;
    }
    if(matiere) lignes.push({ classeId, jour: j, slotIndex: i, matiere, enseignantId: tit });
  }));
  if(!lignes.length){ toast('Rien à remplir : tous les créneaux concernés sont déjà pris.'); return; }
  try{
    const ajoutes = await dbInsertMany('emploi_temps', lignes);
    DB.emploiTemps.push(...ajoutes);
  }catch(e){ alert('Erreur : ' + (e.message || e)); return; }
  closeModal();
  toast(`${lignes.length} créneau${lignes.length > 1 ? 'x' : ''} rempli${lignes.length > 1 ? 's' : ''} ✅ — ajustez si besoin`);
  renderView('emploi-temps');
}
async function viderEdtClasse(classeId){
  const c = DB.classes.find(x => x.id === classeId); if(!c) return;
  if(!confirm(`Vider TOUT l’emploi du temps de ${c.nom} ? Cette action ne peut pas être annulée.`)) return;
  const { error } = await exigerEffet(sb.from('emploi_temps').delete().eq('classe_id', classeId).eq('ecole_id', session.ecoleId));
  if(error){ alert('Erreur : ' + error.message); return; }
  DB.emploiTemps = DB.emploiTemps.filter(e => e.classeId !== classeId);
  closeModal(); toast('Emploi du temps vidé');
  renderView('emploi-temps');
}
async function clearSlot(entryId){
  if(!confirm('Vider ce créneau ?')) return;
  try{
    await dbDelete('emploi_temps', entryId);
    DB.emploiTemps = DB.emploiTemps.filter(e=>e.id!==entryId);
    toast('Créneau supprimé');
    renderView('emploi-temps');
  }catch(e){ alert('Erreur : ' + e.message); }
}

