/* ---------------------------------------------------------------------
   5. ÉLÈVES
   --------------------------------------------------------------------- */
/* ---------- Liste de classe imprimable : simple, avec contacts, émargement ---------- */
function ouvrirListeClasse(classeId, type){
  const admin = ['secretariat','direction','fondation'].includes(ui.role);
  type = type || 'simple';
  if(type === 'contacts' && !admin) type = 'simple';
  const c = DB.classes.find(x => x.id === classeId); if(!c) return;
  const m = DB.meta || {};
  const eleves = DB.eleves.filter(e => e.classeId === classeId && e.statut === 'Actif')
    .sort((a, b) => (a.nom || '').localeCompare(b.nom || '') || (a.prenom || '').localeCompare(b.prenom || ''));
  const g = eleves.filter(e => e.sexe === 'M').length, f = eleves.filter(e => e.sexe === 'F').length;
  const titres = { simple:'LISTE DE CLASSE', contacts:'LISTE DE CLASSE — CONTACTS DES PARENTS', emargement:'FEUILLE D’ÉMARGEMENT' };
  const nbCases = 6;
  const entete = type === 'simple' ? '<th>N°</th><th>Matricule</th><th>Nom</th><th>Prénom(s)</th><th>Sexe</th><th>Né(e) le</th>'
    : type === 'contacts' ? '<th>N°</th><th>Nom et prénom(s)</th><th>Parent / Tuteur</th><th>Téléphone</th>'
    : `<th>N°</th><th>Nom et prénom(s)</th>${Array.from({ length: nbCases }, () => '<th class="lc-case"></th>').join('')}`;
  const ligne = (e, i) => type === 'simple'
      ? `<td>${i + 1}</td><td>${escapeHtml(e.matricule || '')}</td><td><strong>${escapeHtml(String(e.nom || '').toUpperCase())}</strong></td><td>${escapeHtml(e.prenom || '')}</td><td>${escapeHtml(e.sexe || '')}</td><td>${e.dateNaissance ? fmtDate(e.dateNaissance) : ''}</td>`
    : type === 'contacts'
      ? `<td>${i + 1}</td><td><strong>${escapeHtml(String(e.nom || '').toUpperCase())}</strong> ${escapeHtml(e.prenom || '')}</td><td>${escapeHtml(e.parentNom || '')}</td><td style="white-space:nowrap;">${escapeHtml(e.parentTel || '')}</td>`
      : `<td>${i + 1}</td><td><strong>${escapeHtml(String(e.nom || '').toUpperCase())}</strong> ${escapeHtml(e.prenom || '')}</td>${Array.from({ length: nbCases }, () => '<td class="lc-case"></td>').join('')}`;
  const choix = [['simple', 'Liste simple'], ...(admin ? [['contacts', 'Avec contacts des parents']] : []), ['emargement', 'Feuille d’émargement']];
  openModal(`Liste — ${c.nom}`, `
    <div class="no-print" style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:space-between;margin-bottom:12px;">
      <div class="segmente" role="group" aria-label="Type de liste">${choix.map(([k, l]) => `<button type="button" class="seg${type === k ? ' actif' : ''}" onclick="ouvrirListeClasse('${classeId}','${k}')">${l}</button>`).join('')}</div>
      <button type="button" class="btn" onclick="window.print()">${icone('printer')} Imprimer / PDF</button>
    </div>
    <section class="liste-classe">
      <div class="recu-head">${m.logo ? `<img src="${escapeHtml(m.logo)}" alt="">` : `<div class="recu-logo-ph">🎓</div>`}
        <div><strong>${escapeHtml(m.nomEcole || '')}</strong><div class="hint">${escapeHtml(m.adresse || '')}${m.telephone ? ' · ' + escapeHtml(m.telephone) : ''}</div></div>
        <div style="margin-left:auto;text-align:right;"><strong>${titres[type]}</strong><div class="hint">${escapeHtml(c.nom)} · ${escapeHtml(m.anneeScolaire || '')}</div></div></div>
      <div class="lc-resume">Effectif : <strong>${eleves.length}</strong> · Garçons : <strong>${g}</strong> · Filles : <strong>${f}</strong>${type === 'emargement' ? ' · Objet : ……………………………… · Date : ……/……/………' : ''}</div>
      <table class="lc-table${type === 'emargement' ? ' emargement' : ''}"><thead><tr>${entete}</tr></thead>
        <tbody>${eleves.map((e, i) => `<tr>${ligne(e, i)}</tr>`).join('')}</tbody></table>
      <div class="hint" style="margin-top:8px;">Imprimé le ${fmtDate(todayISO())}${type === 'contacts' ? ' — document confidentiel : ne pas afficher' : ''}</div>
    </section>`);
}
/* ---------- Cartes scolaires (format carte bancaire, 8 par page A4) ---------- */
function ouvrirCartesScolaires(classeId){
  const c = DB.classes.find(x => x.id === classeId); if(!c) return;
  const m = DB.meta || {};
  const eleves = DB.eleves.filter(e => e.classeId === classeId && e.statut === 'Actif')
    .sort((a, b) => (a.nom || '').localeCompare(b.nom || '') || (a.prenom || '').localeCompare(b.prenom || ''));
  const carte = e => `<article class="carte-scolaire">
    <header class="cs-tete">${m.logo ? `<img src="${escapeHtml(m.logo)}" alt="">` : `<span class="cs-logo">${escapeHtml(String(m.nomEcole || 'E').charAt(0))}</span>`}
      <span class="cs-ecole"><strong>${escapeHtml(m.nomEcole || '')}</strong><small>CARTE SCOLAIRE ${escapeHtml(m.anneeScolaire || '')}</small></span></header>
    <div class="cs-corps">
      <span class="cs-av" aria-hidden="true">${escapeHtml(initials(e.prenom, e.nom))}</span>
      <dl class="cs-infos">
        <div><dt>Nom</dt><dd><strong>${escapeHtml(String(e.nom || '').toUpperCase())}</strong></dd></div>
        <div><dt>Prénom(s)</dt><dd>${escapeHtml(e.prenom || '')}</dd></div>
        <div><dt>Classe</dt><dd>${escapeHtml(c.nom)}</dd></div>
        <div><dt>Matricule</dt><dd>${escapeHtml(e.matricule || '—')}</dd></div>
        <div><dt>Né(e) le</dt><dd>${e.dateNaissance ? fmtDate(e.dateNaissance) : '—'}</dd></div>
      </dl>
    </div>
    <footer class="cs-pied"><span>${m.telephone ? 'Tél. école : ' + escapeHtml(m.telephone) : escapeHtml(m.adresse || '')}</span><span class="cs-signe">Le Directeur</span></footer>
  </article>`;
  openModal(`Cartes scolaires — ${c.nom} (${eleves.length})`, `
    <div class="form-actions no-print" style="margin-top:0;justify-content:space-between;align-items:center;">
      <span class="hint" style="margin:0;">8 cartes par page A4, à découper (format carte bancaire). Imprimez de préférence sur papier cartonné.</span>
      <button type="button" class="btn" onclick="window.print()">${icone('printer')} Imprimer / PDF</button>
    </div>
    <div class="cartes-scolaires">${eleves.map(carte).join('')}</div>`);
}
function renderEleves(){
  if(ui.eleveProfileId) return renderEleveProfile(ui.eleveProfileId);
  return renderEleveListe();
}
/* ---------- Élèves en double (même nom et prénoms + même classe ou même date de naissance) ----------
   Repérés automatiquement ; l'école décide : passer la fiche en trop en « Inactif » (réversible), ou
   indiquer que ce sont bien deux élèves différents (choix mémorisé sur cet appareil). */
const cleNom = e => `${e.nom || ''} ${e.prenom || ''}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
function doublonsIgnores(){ try{ return new Set(JSON.parse(localStorage.getItem('ecomaz_doublons_ok') || '[]')); }catch(_e){ return new Set(); } }
function pairesDoublons(){
  const actifs = (DB.eleves || []).filter(e => e.statut !== 'Inactif'), ignores = doublonsIgnores(), paires = [], parNom = new Map();
  actifs.forEach(e => { const k = cleNom(e); if(!k) return; if(!parNom.has(k)) parNom.set(k, []); parNom.get(k).push(e); });
  parNom.forEach(l => { for(let i = 0; i < l.length; i++) for(let j = i + 1; j < l.length; j++){
    const a = l[i], b = l[j];
    if(a.classeId === b.classeId || (a.dateNaissance && a.dateNaissance === b.dateNaissance)){
      const id = [a.id, b.id].sort().join('|'); if(!ignores.has(id)) paires.push({ id, a, b });
    } } });
  return paires;
}
function renderDoublonsEleves(){
  if(!est_perso_admin_client()) return '';
  const paires = pairesDoublons(); if(!paires.length) return '';
  const compte = e => { const p = (DB.presencesEleves || []).filter(x => x.eleveId === e.id).length, v = (DB.paiementsScolarite || []).filter(x => x.eleveId === e.id).length, n = (DB.notes || []).filter(x => x.eleveId === e.id).length;
    return [p ? `${p} appel(s)` : '', v ? `${v} versement(s)` : '', n ? `${n} note(s)` : ''].filter(Boolean).join(' · ') || 'aucun appel, versement ni note'; };
  const fiche = e => `<div class="dbl-fiche"><strong>${escapeHtml(e.matricule || '')}</strong><small>${escapeHtml(classeName(e.classeId))}${e.dateNaissance ? ' · né(e) le ' + fmtDate(e.dateNaissance) : ''}${e.parentTel ? ' · ' + escapeHtml(e.parentTel) : ''}</small><small>${compte(e)}</small>
    <span class="dbl-actions"><button type="button" class="btn secondary sm" onclick="ui.eleveProfileId='${e.id}'; renderView('eleves')">Voir la fiche</button>
    <button type="button" class="btn sm" onclick="desactiverDoublon('${e.id}')">Passer ${escapeHtml(e.matricule || 'cette fiche')} en Inactif</button></span></div>`;
  return `<div class="panel panneau-doublons">
    <div class="panel-head"><div><h2>${icone('users')} Élèves en double probable (${paires.length})</h2>
      <div class="sub">Même nom et prénoms, avec la même classe ou la même date de naissance. Vérifiez, puis passez la fiche en trop en « Inactif » (réversible) : gardez celle qui a des appels, versements ou notes.</div></div></div>
    <ul class="dbl-liste">${paires.map(p => `<li class="dbl-paire"><div class="dbl-nom">${escapeHtml(eleveFullName(p.a))}</div>
      <div class="dbl-deux">${fiche(p.a)}${fiche(p.b)}</div>
      <button type="button" class="lien-discret" onclick="ignorerDoublon('${p.id}')">Ce sont bien deux élèves différents</button></li>`).join('')}</ul>
  </div>`;
}
function est_perso_admin_client(){ return ['secretariat', 'direction', 'fondation'].includes(ui.role); }
async function desactiverDoublon(id){
  const e = eleveById(id); if(!e) return;
  if(!confirm(`Passer ${eleveFullName(e)} (${e.matricule || ''}) en « Inactif » ?\n\nLa fiche n’est pas supprimée : elle reste consultable et peut être réactivée (modifier la fiche → statut Actif).`)) return;
  try{ await dbUpdate('eleves', id, { statut: 'Inactif' }); e.statut = 'Inactif'; toast(`${e.matricule || 'Fiche'} passée en Inactif`); renderView('eleves'); }
  catch(err){ alert('Erreur : ' + err.message); }
}
function ignorerDoublon(cle){
  try{ const s = doublonsIgnores(); s.add(cle); localStorage.setItem('ecomaz_doublons_ok', JSON.stringify([...s])); }catch(_e){}
  renderView('eleves');
}

/* ---------------------------------------------------------------------
   BILAN HEBDOMADAIRE (Direction / Fondation)
   Semaine du lundi au dimanche : présences élèves et enseignants,
   encaissements, dépenses, nouvelles inscriptions. Imprimable, et
   partageable gratuitement par WhatsApp (résumé texte).
   --------------------------------------------------------------------- */
function lundiDe(iso){
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}
function decalerJours(iso, n){ const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); }
function calculerBilanHebdo(lundi){
  const dimanche = decalerJours(lundi, 6);
  const dansSemaine = x => x.date >= lundi && x.date <= dimanche;
  const presEl = DB.presencesEleves.filter(dansSemaine);
  const presEns = DB.presencesEnseignants.filter(dansSemaine);
  const pct = (n, t) => t ? Math.round(100 * n / t) : null;
  const absencesParEleve = {};
  presEl.filter(p => p.statut === 'Absent').forEach(p => absencesParEleve[p.eleveId] = (absencesParEleve[p.eleveId] || 0) + 1);
  const parClasse = DB.classes.map(c => {
    const l = presEl.filter(p => p.classeId === c.id);
    return { nom: c.nom, appels: new Set(l.map(p => p.date)).size, taux: pct(l.filter(p => p.statut !== 'Absent').length, l.length) };
  }).filter(c => c.appels);
  const retardsEns = {};
  presEns.filter(p => p.statut === 'Retard' || p.statut === 'Absent').forEach(p => {
    const r = retardsEns[p.enseignantId] = retardsEns[p.enseignantId] || { retards: 0, minutes: 0, absences: 0 };
    if(p.statut === 'Retard'){ r.retards++; r.minutes += Number(p.minutesRetard) || 0; } else r.absences++;
  });
  const paiements = (DB.paiementsScolarite || []).filter(dansSemaine);
  const parMode = {};
  paiements.forEach(p => parMode[p.modePaiement || 'Autre'] = (parMode[p.modePaiement || 'Autre'] || 0) + Number(p.montant || 0));
  const depenses = (DB.depenses || []).filter(dansSemaine);
  return {
    lundi, dimanche,
    joursAppel: new Set(presEl.map(p => p.date)).size,
    tauxEleves: pct(presEl.filter(p => p.statut !== 'Absent').length, presEl.length),
    nbAbsences: presEl.filter(p => p.statut === 'Absent').length,
    nbRetardsEleves: presEl.filter(p => p.statut === 'Retard').length,
    elevesSouventAbsents: Object.entries(absencesParEleve).filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1])
      .map(([id, n]) => ({ e: eleveById(id), n })).filter(x => x.e),
    parClasse,
    tauxEns: pct(presEns.filter(p => p.statut !== 'Absent').length, presEns.length),
    ensRetards: Object.entries(retardsEns).map(([id, r]) => ({ t: enseignantById(id), ...r })).filter(x => x.t)
      .sort((a, b) => (b.absences - a.absences) || (b.minutes - a.minutes)),
    encaisse: paiements.reduce((s, p) => s + Number(p.montant || 0), 0), nbPaiements: paiements.length, parMode,
    depense: depenses.reduce((s, d) => s + Number(d.montant || 0), 0), nbDepenses: depenses.length,
    inscriptions: DB.eleves.filter(e => e.dateInscription >= lundi && e.dateInscription <= dimanche),
  };
}
function texteBilanHebdo(b){
  const pc = v => v === null ? 'pas d’appel' : v + ' %';
  const lignes = [
    `*Bilan de la semaine — ${DB.meta?.nomEcole || 'École'}*`,
    `Du ${fmtDate(b.lundi)} au ${fmtDate(b.dimanche)}`,
    '',
    `Élèves : présence ${pc(b.tauxEleves)} (${b.joursAppel} jour(s) d’appel), ${b.nbAbsences} absence(s), ${b.nbRetardsEleves} retard(s).`,
  ];
  if(b.elevesSouventAbsents.length) lignes.push(`Absents 2 fois ou plus : ${b.elevesSouventAbsents.map(x => `${eleveFullName(x.e)} (${x.n})`).join(', ')}.`);
  lignes.push(`Enseignants : présence ${pc(b.tauxEns)}${b.ensRetards.length ? ', ' + b.ensRetards.map(x => `${ensFullName(x.t)} : ${x.retards ? x.retards + ' retard(s), ' + x.minutes + ' min' : ''}${x.retards && x.absences ? ', ' : ''}${x.absences ? x.absences + ' absence(s)' : ''}`).join(' ; ') : ', aucun retard'}.`);
  lignes.push(`Scolarité encaissée : ${fmtFCFA(b.encaisse)} (${b.nbPaiements} paiement(s)).`);
  lignes.push(`Dépenses : ${fmtFCFA(b.depense)} (${b.nbDepenses}).`);
  lignes.push(`Nouvelles inscriptions : ${b.inscriptions.length}.`);
  lignes.push('', '— EcoMaZ');
  return lignes.join('\n');
}
function ouvrirBilanHebdo(lundi){
  lundi = lundi || lundiDe(todayISO());
  const b = calculerBilanHebdo(lundi);
  const pc = v => v === null ? '—' : v + ' %';
  const carte = (titre, valeur, sous) => `<div class="panel" style="margin:0;padding:var(--sp-3);"><div class="hint" style="margin:0;">${titre}</div><div style="font-size:var(--em-fs-24, 24px);font-weight:900;">${valeur}</div>${sous ? `<div class="hint" style="margin:0;">${sous}</div>` : ''}</div>`;
  const lienWa = `https://wa.me/?text=${encodeURIComponent(texteBilanHebdo(b))}`;
  const futur = decalerJours(lundi, 7) > todayISO();
  openModal(`Bilan de la semaine`, `
    <div class="form-actions no-print" style="justify-content:space-between;margin-top:0;">
      <button type="button" class="btn secondary sm" onclick="ouvrirBilanHebdo('${decalerJours(lundi, -7)}')">← Semaine précédente</button>
      ${futur ? '' : `<button type="button" class="btn secondary sm" onclick="ouvrirBilanHebdo('${decalerJours(lundi, 7)}')">Semaine suivante →</button>`}
    </div>
    <h3 style="margin:var(--sp-2) 0;">${escapeHtml(DB.meta?.nomEcole || '')} — du ${fmtDate(b.lundi)} au ${fmtDate(b.dimanche)}</h3>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:var(--sp-3);margin-bottom:var(--sp-4);">
      ${carte('Présence élèves', pc(b.tauxEleves), `${b.joursAppel} jour(s) d’appel · ${b.nbAbsences} absence(s)`)}
      ${carte('Présence enseignants', pc(b.tauxEns), `${b.ensRetards.reduce((s, x) => s + x.retards, 0)} retard(s)`)}
      ${carte('Scolarité encaissée', fmtFCFA(b.encaisse), `${b.nbPaiements} paiement(s)`)}
      ${carte('Dépenses', fmtFCFA(b.depense), `${b.nbDepenses} opération(s)`)}
      ${carte('Nouvelles inscriptions', b.inscriptions.length, '')}
    </div>
    ${b.parClasse.length ? `<h4>Présence par classe</h4><div class="table-wrap"><table><thead><tr><th>Classe</th><th>Jours d’appel</th><th>Présence</th></tr></thead><tbody>
      ${b.parClasse.map(c => `<tr><td>${escapeHtml(c.nom)}</td><td>${c.appels}</td><td>${pc(c.taux)}</td></tr>`).join('')}</tbody></table></div>` : '<div class="hint">Aucun appel enregistré cette semaine.</div>'}
    ${b.elevesSouventAbsents.length ? `<h4>Élèves absents 2 fois ou plus</h4><div class="table-wrap"><table><thead><tr><th>Élève</th><th>Classe</th><th>Absences</th></tr></thead><tbody>
      ${b.elevesSouventAbsents.map(x => `<tr><td>${escapeHtml(eleveFullName(x.e))}</td><td>${escapeHtml(classeName(x.e.classeId))}</td><td>${x.n}</td></tr>`).join('')}</tbody></table></div>` : ''}
    ${b.ensRetards.length ? `<h4>Retards et absences des enseignants</h4><div class="table-wrap"><table><thead><tr><th>Enseignant</th><th>Retards</th><th>Minutes</th><th>Absences</th></tr></thead><tbody>
      ${b.ensRetards.map(x => `<tr><td>${escapeHtml(ensFullName(x.t))}</td><td>${x.retards}</td><td>${x.minutes}</td><td>${x.absences}</td></tr>`).join('')}</tbody></table></div>` : ''}
    ${Object.keys(b.parMode).length ? `<h4>Encaissements par mode de paiement</h4><div class="table-wrap"><table><tbody>
      ${Object.entries(b.parMode).map(([m, v]) => `<tr><td>${escapeHtml(m)}</td><td>${fmtFCFA(v)}</td></tr>`).join('')}</tbody></table></div>` : ''}
    <div class="form-actions no-print" style="flex-wrap:wrap;">
      <a class="btn secondary" href="${lienWa}" target="_blank" rel="noopener">📲 Partager par WhatsApp</a>
      <button type="button" class="btn" onclick="window.print()">🖨️ Imprimer</button>
    </div>`);
}
/* ---------------------------------------------------------------------
   MISE EN ROUTE DE L'ÉCOLE — tableau de bord Direction / Fondation.
   Liste d'étapes calculée sur les vraies données : ce qui est fait, ce
   qui manque, et un bouton pour y aller. Se replie quand tout est fait.
   --------------------------------------------------------------------- */
function ouvrirAideAlertesPersonnel(){
  openModal('Activer les alertes sur un téléphone', `
    <p style="margin-top:0;">Chaque personne le fait <strong>une fois, sur son propre téléphone</strong> :</p>
    <ol class="son-etapes">
      <li>Ouvrir EcoMaZ et se connecter avec <strong>son</strong> compte (fondation, secrétariat ou portier).</li>
      <li>Sur le tableau de bord, toucher <strong>« Activer »</strong> dans le bandeau « Recevez les alertes sur ce téléphone », puis <strong>« Autoriser »</strong>.</li>
      <li>Sur iPhone : d’abord installer EcoMaZ sur l’écran d’accueil (Partager → « Sur l’écran d’accueil »), puis l’ouvrir depuis son icône.</li>
    </ol>
    <p class="hint">Bandeau fermé par erreur ? Dans Chrome : ⋮ → Paramètres → Paramètres des sites → Notifications → autoriser le site d’EcoMaZ.</p>
    <div class="form-actions"><button type="button" class="btn" onclick="closeModal()">J’ai compris</button></div>`);
}
function etapesMiseEnRoute(){
  const actifs = (DB.eleves || []).filter(e => e.statut === 'Actif');
  const relies = actifs.filter(e => (DB.parentsEleves || []).some(pe => pe.eleveId === e.id)).length;
  const ensActifs = (DB.enseignants || []).filter(t => t.statut === 'Actif').length;
  const semaine = decalerJours(todayISO(), -7);
  const appelsRecents = (DB.presencesEleves || []).filter(p => p.date >= semaine).length;
  // Classe par classe : une seule classe qui fait l'appel ne suffit pas à mettre l'étape au vert
  const classesAvecEleves = (DB.classes || []).filter(c => actifs.some(e => e.classeId === c.id));
  const classesSansAppel = classesAvecEleves.filter(c => !(DB.presencesEleves || []).some(p => p.classeId === c.id && p.date >= semaine));
  if(DB.etatComptes === undefined && ['secretariat','direction','fondation'].includes(ui.role)){ DB.etatComptes = null; sb.rpc('etat_comptes_enseignants')
    .then(({ data }) => { DB.etatComptes = rowsToCamel(data || []); if(ui.currentView === 'dashboard') renderView('dashboard'); }, () => { DB.etatComptes = []; }); }
  const ensAvecCompte = (DB.etatComptes || []).filter(x => x.aCompte), ensAlertes = ensAvecCompte.filter(x => x.alertesActives);
  // Alertes du personnel (direction, fondation, secrétariat, portier) — schema.sql section 112
  if(DB.alertesPersonnel === undefined && ['direction','fondation'].includes(ui.role)){ DB.alertesPersonnel = null; sb.rpc('etat_alertes_personnel')
    .then(({ data }) => { DB.alertesPersonnel = rowsToCamel(data || []); if(ui.currentView === 'dashboard') renderView('dashboard'); }, () => { DB.alertesPersonnel = []; }); }
  const libRole = { direction:'direction', fondation:'fondation', secretariat:'secrétariat', portier:'portier' };
  const rolesSansAlertes = (DB.alertesPersonnel || []).filter(x => x.comptes > 0 && x.avecAlertes < x.comptes).map(x => libRole[x.role] || x.role);
  const m = DB.meta || {};
  const comptesEnseignants = (DB.profiles || []).filter(pr => pr.role === 'enseignant' && pr.enseignantId).length;
  const classesAvecEdt = (DB.classes || []).filter(c => (DB.emploiTemps || []).some(e => e.classeId === c.id));
  const classeSansEdt = (DB.classes || []).find(c => !classesAvecEdt.includes(c));
  return [
    { ok: (DB.classes || []).length > 0, titre: 'Classes créées', detail: `${(DB.classes || []).length} classe(s)`, vue: 'parametres', bouton: 'Paramètres' },
    { ok: actifs.length > 0, titre: 'Élèves inscrits', detail: `${actifs.length} élève(s) actif(s)`, vue: 'eleves', bouton: 'Élèves' },
    { ok: ensActifs > 0, titre: 'Enseignants saisis', detail: ensActifs ? `${ensActifs} enseignant(s)` : 'Aucun enseignant : pas de pointage, ni d’appel par les enseignants', vue: 'enseignants', bouton: 'Ajouter les enseignants' },
    { ok: actifs.length > 0 && relies / actifs.length >= 0.8, titre: 'Parents reliés à leur enfant', detail: `${relies} / ${actifs.length} — sans lien, le parent ne reçoit ni annonces ni alertes`, vue: 'liens-parents', bouton: 'Inviter les familles', action: "go('liens-parents'); setTimeout(() => ouvrirRelanceParents(), 200)" },
    { ok: classesAvecEleves.length > 0 && !classesSansAppel.length, titre: 'Appel fait dans chaque classe cette semaine', detail: !appelsRecents ? 'Aucun appel depuis 7 jours : les parents ne sont pas prévenus des absences'
        : classesSansAppel.length ? `${classesAvecEleves.length - classesSansAppel.length} / ${classesAvecEleves.length} classe(s) — sans appel : ${classesSansAppel.slice(0, 5).map(c => c.nom).join(', ')}${classesSansAppel.length > 5 ? '…' : ''}` : `${classesAvecEleves.length} / ${classesAvecEleves.length} classe(s)`,
      vue: 'dashboard', bouton: 'Voir le suivi des enseignants', action: "ouvrirSection('titreSuiviEns')" },
    ...(Array.isArray(DB.alertesPersonnel) && DB.alertesPersonnel.length ? [{ ok: !rolesSansAlertes.length, titre: 'Alertes sur les téléphones du personnel',
      detail: rolesSansAlertes.length ? `Sans alertes : ${rolesSansAlertes.join(', ')} — pas de bilan du vendredi, ni d’alerte « appel non fait », d’absence signalée ou de demande` : 'direction, fondation, secrétariat et portier sont prévenus',
      vue: 'dashboard', bouton: 'Comment faire', action: 'ouvrirAideAlertesPersonnel()' }] : []),
    ...(DB.etatComptes && ensAvecCompte.length ? [{ ok: ensAlertes.length >= ensAvecCompte.length, titre: 'Rappel de l’appel sur le téléphone des enseignants', detail: `${ensAlertes.length} / ${ensAvecCompte.length} enseignant(s) ont activé les alertes — sans elles, le rappel de l’appel n’arrive pas`,
      vue: 'dashboard', bouton: 'Voir qui relancer', action: "ouvrirSection('titreSuiviEns')" }] : []),
    { ok: (DB.paiementsScolarite || []).length > 0, titre: 'Paiements de scolarité enregistrés', detail: (DB.paiementsScolarite || []).length ? `${DB.paiementsScolarite.length} paiement(s)` : 'Aucun paiement saisi : reprenez le cahier de caisse classe par classe (« Versements déjà reçus »)', vue: 'comptabilite', bouton: 'Saisir les versements reçus',
      action: (DB.echeancesScolarite || []).length && (DB.classes || []).length ? `ui.filters.comptaTab='scolarite'; ui.filters.comptaClasse='${(DB.classes[0] || {}).id}'; go('comptabilite'); setTimeout(() => ouvrirRepriseVersements('${(DB.classes[0] || {}).id}'), 200)` : null },
    { ok: (DB.classes || []).length > 0 && !classeSansEdt, titre: 'Emploi du temps de chaque classe', detail: `${classesAvecEdt.length} / ${(DB.classes || []).length} classe(s) remplie(s)${classeSansEdt ? ' — sans lui, la « Ma journée » des enseignants reste vide' : ''}`, vue: 'emploi-temps', bouton: 'Remplir rapidement',
      action: classeSansEdt ? `ui.filters.ttClasse='${classeSansEdt.id}'; go('emploi-temps'); setTimeout(() => ouvrirRemplissageEdt('${classeSansEdt.id}'), 200)` : null },
    { ok: m.geofenceLatitude != null, titre: 'Zone de l’école (pointage GPS)', detail: m.geofenceLatitude != null ? 'définie' : 'non définie', vue: 'parametres', bouton: 'Paramètres' },
    { ok: !!m.logo, titre: 'Logo de l’école', detail: m.logo ? 'ajouté' : 'non ajouté (apparaît sur les reçus et les applications)', vue: 'parametres', bouton: 'Paramètres' },
    { ok: !!(m.directeurNom && m.telephone), titre: 'Nom du directeur et téléphone de l’école', detail: !m.directeurNom ? 'nom du directeur manquant (signature des certificats et des reçus)' : !m.telephone ? 'téléphone manquant (bouton « Appeler » des parents)' : 'renseignés', vue: 'parametres', bouton: 'Paramètres' },
    { ok: (DB.echeancesScolarite || []).length > 0, titre: 'Scolarité et tranches paramétrées', detail: (DB.echeancesScolarite || []).length ? `${DB.echeancesScolarite.length} tranche(s)` : 'aucune tranche : pas de reste à payer ni de relances', vue: 'parametres', bouton: 'Paramètres' },
    // Contrôles ajoutés le 15/11/2026 : horaires des enseignants (rappels d'appel), élèves en double, échéancier cohérent
    ...(() => { const avecClasses = (DB.enseignants || []).filter(t => t.statut === 'Actif' && (t.classesAssignees || []).length); if(!avecClasses.length) return [];
      const sans = avecClasses.filter(t => !creneauxEnseignant(t).length);
      return [{ ok: !sans.length, titre: 'Horaires de cours des enseignants', detail: sans.length ? `${avecClasses.length - sans.length} / ${avecClasses.length} — sans horaire, un enseignant ne reçoit aucun rappel d’appel` : `${avecClasses.length} / ${avecClasses.length} : rappels d’appel pendant les cours`,
        vue: 'enseignants', bouton: 'Remplir les horaires', action: sans.length ? "go('enseignants'); setTimeout(() => { if(typeof ouvrirRemplissageHoraires === 'function') ouvrirRemplissageHoraires(); }, 200)" : null }]; })(),
    ...(() => { if(!actifs.length) return []; const n = pairesDoublons().length;
      return [{ ok: !n, titre: 'Pas d’élève en double', detail: n ? `${n} paire(s) d’élèves en double probable : un doublon fausse l’effectif, la scolarité et les relances` : 'aucun doublon repéré',
        vue: 'eleves', bouton: 'Vérifier les doublons', action: n ? "go('eleves'); setTimeout(() => document.querySelector('.panneau-doublons')?.scrollIntoView({ behavior:'smooth', block:'start' }), 200)" : null }]; })(),
    ...(() => { if(!(DB.echeancesScolarite || []).length) return []; const n = anomaliesEcheancier().length;
      return [{ ok: !n, titre: 'Échéancier cohérent', detail: n ? `${n} point(s) à vérifier (date, montant ou versement incohérent) : les rappels aux parents en dépendent` : 'dates et montants cohérents',
        vue: 'comptabilite', bouton: 'Voir les points', action: n ? "ui.filters.comptaTab='scolarite'; go('comptabilite'); setTimeout(() => document.querySelector('.panneau-echeancier')?.scrollIntoView({ behavior:'smooth', block:'start' }), 200)" : null }]; })(),
    { ok: ensActifs > 0 && comptesEnseignants >= ensActifs, titre: 'Enseignants inscrits dans leur application', detail: `${comptesEnseignants} / ${Math.max(ensActifs, comptesEnseignants)} enseignant(s) avec leur compte — appel, devoirs, « Ma journée »`, vue: 'enseignants',
      bouton: ensActifs > comptesEnseignants ? 'Relancer les non-inscrits' : '📲 Envoyer le lien par WhatsApp',
      action: ensActifs > comptesEnseignants ? "go('enseignants'); setTimeout(ouvrirRelanceEnseignants, 200)" : "window.open('https://wa.me/?text=' + encodeURIComponent(messagePartageApplication('enseignant.html')), '_blank')" },
  ];
}
// Tableau de bord ENSEIGNANT : « Ma journée », classe par classe
function renderMaJournee(){
  if(ui.role !== 'enseignant') return '';
  if(!session.enseignantId) return renderListeCollegues();
  const maFiche = enseignantById(session.enseignantId);
  if(maFiche && !(maFiche.classesAssignees || []).length) return renderJeMEnrole() + renderListeCollegues();
  // Données chargées une fois (absences signalées, agenda), puis le tableau de bord se réaffiche
  if(DB.absencesSignalees === undefined){ DB.absencesSignalees = null; chargerAbsencesSignalees().then(() => { if(ui.currentView === 'dashboard') renderView('dashboard'); }).catch(() => { DB.absencesSignalees = []; }); }
  chargerAgenda();
  if(DB.devoirs === undefined){ DB.devoirs = null; sb.from('devoirs').select('*').eq('ecole_id', session.ecoleId).gte('pour_le', isoDansJours(-14)).order('pour_le')
    .then(({ data }) => { DB.devoirs = rowsToCamel(data || []); if(ui.currentView === 'dashboard') renderView('dashboard'); }); }
  chargerSecuriteEleves();
  const prochain = prochainJourClasse();
  const aujourd = todayISO(), jourIso = ((new Date().getDay() + 6) % 7) + 1;
  const renfAujourdhui = (DB?.horairesAnnonces?.joursRenforcement || [1,2,3,4,5]).includes(jourIso);
  const classes = classesVisibles();
  const cartes = classes.map(c => {
    const eleves = DB.eleves.filter(e => e.classeId === c.id && e.statut === 'Actif');
    const appel = DB.presencesEleves.filter(p => p.classeId === c.id && p.date === aujourd);
    const absents = appel.filter(p => p.statut === 'Absent').length;
    const signales = eleves.map(e => ({ e, a: absenceSignalee(e.id, aujourd) })).filter(x => x.a);
    const renf = renfAujourdhui ? eleves.filter(e => e.renforcement) : [];
    const arrivees = (DB.notificationsPortier || []).filter(n => n.classeId === c.id && String(n.createdAt || '').slice(0, 10) === aujourd);
    return `<div class="mj-classe">
      <div class="mj-tete"><strong>${escapeHtml(c.nom)}</strong><span class="hint" style="margin:0;">${eleves.length} élève(s)</span></div>
      <div class="mj-ligne">${appel.length ? `<span class="badge green">✓ Appel fait</span> ${absents} absent(s)` : `<span class="badge red">Appel non fait</span> <button class="btn sm" onclick="ui.filters.presEleves={classeId:'${c.id}', date:'${aujourd}'}; go('presences-eleves')">Faire l’appel</button>`}</div>
      ${signales.length ? `<div class="mj-ligne">📝 Absences signalées : ${signales.map(x => `${escapeHtml(eleveFullName(x.e))} <span class="hint">(${escapeHtml(x.a.motif)})</span>`).join(', ')}</div>` : ''}
      ${DB.devoirs ? (() => { const dv = DB.devoirs.filter(d => d.classeId === c.id && d.pourLe === prochain); return `<div class="mj-ligne">📒 ${dv.length ? `Devoirs ${quandDevoir(prochain)} : ${dv.map(d => escapeHtml(d.matiere || 'travail')).join(', ')}` : `Aucun devoir noté ${quandDevoir(prochain)}`} <button class="btn secondary sm" onclick="ui.filters.devoirsClasse='${c.id}'; go('devoirs')">${dv.length ? 'Voir' : 'Noter un devoir'}</button></div>`; })() : ''}
      ${(() => { const al = eleves.map(e => ({ e, s: santeDe(e.id) })).filter(x => x.s && x.s.allergies); return al.length ? `<div class="mj-ligne">⚕️ Allergies : ${al.map(x => `${escapeHtml(eleveFullName(x.e))} <span class="hint">(${escapeHtml(x.s.allergies)})</span>`).join(', ')}</div>` : ''; })()}
      ${renf.length ? `<div class="mj-ligne">📘 Renforcement ce soir : ${renf.map(e => escapeHtml(eleveFullName(e))).join(', ')}</div>` : ''}
      ${arrivees.length ? `<div class="mj-ligne">🚪 Parents arrivés : ${arrivees.map(n => `${escapeHtml(n.eleveNom)} <span class="hint">(${new Date(n.createdAt).toLocaleTimeString('fr-FR', {hour:'2-digit', minute:'2-digit'})})</span>`).join(', ')}</div>` : ''}
    </div>`;
  }).join('');
  const ids = new Set(classes.map(c => c.id));
  const dates = (DB.agenda || []).filter(ev => ev.dateFin >= aujourd && (!ev.classeIds || ev.classeIds.some(id => ids.has(id)))).slice(0, 3);
  return `${renderPremiersPasEnseignant()}<div class="panel">
    <div class="panel-head"><div><h2>Ma journée</h2><div class="sub">${(d => d.charAt(0).toUpperCase() + d.slice(1))(new Date().toLocaleDateString('fr-FR', {weekday:'long', day:'numeric', month:'long'}))} · vos classes</div></div></div>
    ${renderFriseDuJour(classes)}
    <div class="mj-grille">${cartes || '<div class="hint">Aucune classe.</div>'}</div>
    ${dates.length ? `<div class="mj-ligne" style="margin-top:10px;">📅 À venir : ${dates.map(ev => `${escapeHtml(ev.titre)} <span class="hint">(${delaiAgenda(ev)})</span>`).join(' · ')}</div>` : ''}
  </div>
  ${renderJeMEnrole()}
  ${renderListeCollegues()}`;
}
function renderClassesAValider(){
  const fiches = (DB.enseignants || []).filter(t => (t.classesDemandees || []).length);
  if(!fiches.length) return '';
  return `<div class="enrole-a-valider">${fiches.map(t => {
    const coches = new Set([...(t.classesAssignees || []), ...(t.classesDemandees || [])]);
    return `<div class="dem-carte">
      <strong>${escapeHtml(ensFullName(t))}</strong> <span class="badge-etat attente">Classes demandées</span>
      <div class="hint">${escapeHtml(t.matricule || '')}${t.telephone ? ' · ' + escapeHtml(t.telephone) : ''}${(t.matieres || []).length ? ' · ' + escapeHtml(t.matieres.join(', ')) : ''} · inscrit depuis sa console</div>
      <div class="hint" style="margin:8px 0 4px;">Classes à ouvrir pour cet enseignant — vérifiez :</div>
      <div style="display:flex;flex-wrap:wrap;gap:8px;">${DB.classes.map(c => `<label style="display:flex;align-items:center;gap:6px;"><input type="checkbox" class="ensClasseVal_${t.id}" value="${c.id}" ${coches.has(c.id) ? 'checked' : ''}> ${escapeHtml(c.nom)}${(t.classesDemandees || []).includes(c.id) ? ' <span class="hint" style="margin:0;">(demandée)</span>' : ''}</label>`).join('')}</div>
      <div style="margin-top:8px;"><button class="btn sm" onclick="validerClassesEnseignant('${t.id}', true)">Valider les classes</button>
      <button class="btn secondary sm" onclick="validerClassesEnseignant('${t.id}', false)">Refuser la demande</button></div>
    </div>`; }).join('')}</div>`;
}
async function validerClassesEnseignant(id, valider){
  const t = enseignantById(id); if(!t) return;
  const classes = valider ? $$('.ensClasseVal_' + id).filter(c => c.checked).map(c => c.value) : (t.classesAssignees || []);
  if(valider && !classes.length){ toast('Cochez au moins une classe.'); return; }
  try{
    await dbUpdate('enseignants', id, { classesAssignees: classes, classesDemandees: [] });
    DB.enseignants = await dbSelectAll('enseignants_lecture');
  }catch(e){ toast('Erreur : ' + e.message); return; }
  if(DB.aTraiter) DB.aTraiter.charge = 0;
  toast(valider ? `Classes ouvertes ✅ : ${ensFullName(t)} ne voit que ces classes` : 'Demande refusée');
  renderView('enseignants');
}
// Guide « vos 3 premiers gestes » : affiché à l'enseignant jusqu'à ce qu'il le ferme (une fois par appareil et par compte)
function renderPremiersPasEnseignant(){
  const cle = 'ecomaz_premiers_pas_' + (session.userId || '');
  try{ if(localStorage.getItem(cle)) return ''; }catch(_e){ return ''; }
  const gestes = [
    ['circle-check', 'Faire l’appel', 'Chaque matin : touchez chaque élève (présent, absent, retard). Les parents des absents sont prévenus.', "go('presences-eleves')"],
    ['notebook-pen', 'Noter un devoir', 'Écrivez le travail pour demain : les parents le voient dans leur application.', "go('devoirs')"],
    ['file-text', 'Saisir des notes', 'Évaluations et compositions de vos classes : les moyennes et bulletins se calculent seuls.', "go('notes')"],
  ];
  return `<div class="panel premiers-pas">
    <div class="panel-head"><div><h2>Bienvenue dans votre console 👋</h2><div class="sub">Vos 3 premiers gestes — vous ne voyez que vos classes.</div></div>
      <button type="button" class="btn secondary sm" onclick="try{localStorage.setItem('${cle}','1')}catch(_e){}; renderView('dashboard')">J’ai compris</button></div>
    <div class="pp-grille">${gestes.map(([ic, t, d, act], i) => `<button type="button" class="pp-geste" onclick="${act}">
      <span class="pp-num">${i + 1}</span><span class="pp-txt"><strong>${icone(ic) || ''} ${t}</strong><small>${d}</small></span></button>`).join('')}</div>
    <div class="hint" style="margin-bottom:0;">Astuce : installez l’application sur votre téléphone (menu ⋮ de Chrome → « Installer l’application ») pour l’ouvrir d’un seul geste.</div>
  </div>`;
}
/* ---------- « Je m'enrôle » : l'enseignant s'inscrit lui-même dans la base de son école ---------- */
function renderJeMEnrole(){
  if(ui.role !== 'enseignant') return '';
  const fiche = session.enseignantId ? enseignantById(session.enseignantId) : null;
  const assignees = new Set(fiche?.classesAssignees || []), demandees = new Set(fiche?.classesDemandees || []);
  if(fiche && !ui.filters.enroleOuvert){
    return `<div class="panel enrole-panneau">
      <div class="panel-head"><div><h2>${icone('id-card') || '🪪'} Mon inscription</h2>
        <div class="sub">${escapeHtml(ensFullName(fiche))} · ${escapeHtml(fiche.matricule || '')}</div></div>
        <button type="button" class="btn secondary sm" onclick="ui.filters.enroleOuvert=true; renderView('dashboard')">Compléter / demander une classe</button></div>
      <div class="enrole-classes">${assignees.size ? [...assignees].map(id => `<span class="badge-etat ok">${escapeHtml(classeName(id))}</span>`).join(' ') : '<span class="hint" style="margin:0;">Aucune classe validée pour le moment.</span>'}
        ${[...demandees].map(id => `<span class="badge-etat attente">${escapeHtml(classeName(id))} · en attente</span>`).join(' ')}</div>
      ${demandees.size ? `<div class="hint">Les classes « en attente » seront ouvertes dès que la direction ou le secrétariat les aura validées.</div>` : ''}
      <div class="creneaux-fiche">${creneauxEnseignant(fiche).length ? `<span class="cr-titre-court">${icone('clock') || '🕒'} Mes heures de cours :</span>${texteCreneaux(creneauxEnseignant(fiche))}`
        : `<div class="alerte-inscription" style="margin:0;"><strong>Indiquez vos jours et heures de cours.</strong> Sans eux, EcoMaZ ne peut pas vous rappeler l’appel au bon moment.
          <button type="button" class="btn sm" style="margin-top:8px;" onclick="ui.filters.enroleOuvert=true; renderView('dashboard')">Indiquer mes horaires</button></div>`}</div>
    </div>`;
  }
  const civ = fiche?.sexe || session.civilite || '';
  const nomProfil = String(session.nomComplet || '').trim();
  const generique = /^(enseignant|compte)/i.test(nomProfil);
  const prenomDefaut = fiche ? fiche.prenom : '', nomDefaut = fiche ? fiche.nom : '';
  const matieres = [...new Set([...new Set(DB.classes.map(c => c.cycle))].flatMap(cy => MATIERES_BY_CYCLE[cy] || []).concat(fiche?.matieres || []))];
  const mesMat = new Set(fiche?.matieres || []);
  return `<div class="panel enrole-panneau enrole-ouvert" id="jeMEnrole">
    <div class="panel-head"><div><h2>✍️ Je m’enrôle</h2>
      <div class="sub">${fiche ? 'Complétez votre fiche ou demandez une autre classe.' : 'Inscrivez-vous dans la base de votre école : votre nom, vos matières et vos classes.'}</div></div></div>
    ${!fiche ? `<div class="alerte-inscription" style="margin-top:0;">Ce compte doit être <strong>le vôtre uniquement</strong>.${generique ? ' S’il est partagé avec d’autres collègues, chacun doit plutôt s’inscrire avec son propre compte Google.' : ''}
      <button type="button" class="btn secondary sm" style="margin-top:8px;" onclick="inscriptionCompteGoogle()">M’inscrire avec mon propre compte Google</button></div>` : ''}
    <form class="enrole-form" onsubmit="return enregistrerEnrolement(event)">
      <div class="field"><label>Civilité</label><div class="segmente seg-radio" role="radiogroup" aria-label="Civilité">
        ${[['M', 'Monsieur'], ['F', 'Madame']].map(([k, l]) => `<label class="seg"><input type="radio" name="civ" value="${k}" ${civ === k ? 'checked' : ''} required>${l}</label>`).join('')}</div></div>
      <div class="enrole-ligne">
        <div class="field"><label for="enrPrenom">Prénom(s)</label><input id="enrPrenom" name="prenom" required minlength="2" maxlength="60" value="${escapeHtml(prenomDefaut)}" ${fiche ? 'readonly' : ''} autocomplete="given-name"></div>
        <div class="field"><label for="enrNom">Nom</label><input id="enrNom" name="nom" required minlength="2" maxlength="60" value="${escapeHtml(nomDefaut)}" ${fiche ? 'readonly' : ''} autocomplete="family-name" style="text-transform:uppercase;"></div>
      </div>
      ${fiche ? '<div class="hint" style="margin-top:-6px;">Pour corriger votre nom, adressez-vous à la direction.</div>' : ''}
      <div class="field"><label for="enrTel">Numéro WhatsApp</label><input id="enrTel" name="tel" type="tel" required placeholder="07 00 00 00 00" value="${escapeHtml(fiche?.telephone || '')}" autocomplete="tel"></div>
      <div class="field"><label>Mes matières</label><div class="enrole-choix">${matieres.map(m => `<label class="enrol-choix"><input type="checkbox" name="mat" value="${escapeHtml(m)}" ${mesMat.has(m) ? 'checked' : ''}> ${escapeHtml(m)}</label>`).join('')}</div></div>
      <div class="field"><label>${fiche ? 'Classes supplémentaires à demander' : 'Mes classes (validées ensuite par l’école)'}</label><div class="enrole-choix">
        ${DB.classes.filter(c => !assignees.has(c.id)).map(c => `<label class="enrol-choix"><input type="checkbox" name="cls" value="${c.id}" ${demandees.has(c.id) ? 'checked' : ''}> ${escapeHtml(c.nom)}</label>`).join('') || '<span class="hint">Aucune autre classe.</span>'}</div></div>
      <div class="field">${editeurCreneaux(DB.classes.map(c => c.id), creneauxEnseignant(fiche), '', fiche ? creneauxProposes(fiche.id, [...assignees, ...demandees]) : [])}</div>
      <div class="pin-error" id="enrErr"></div>
      <div class="form-actions" style="justify-content:flex-start;">
        <button type="submit" class="btn">${fiche ? 'Enregistrer' : 'M’inscrire'}</button>
        ${fiche ? `<button type="button" class="btn secondary" onclick="ui.filters.enroleOuvert=false; renderView('dashboard')">Fermer</button>` : ''}
      </div>
    </form>
  </div>`;
}
async function enregistrerEnrolement(ev){
  ev.preventDefault();
  const f = ev.target, err = f.querySelector('#enrErr');
  const civ = f.querySelector('input[name=civ]:checked')?.value;
  const prenom = f.prenom.value.trim(), nom = f.nom.value.trim().toUpperCase(), tel = f.tel.value.trim();
  const matieres = [...f.querySelectorAll('input[name=mat]:checked')].map(x => x.value);
  const classes = [...f.querySelectorAll('input[name=cls]:checked')].map(x => x.value);
  if(!civ){ err.textContent = 'Choisissez Monsieur ou Madame.'; return false; }
  if(!session.enseignantId && !classes.length){ err.textContent = 'Cochez au moins une classe.'; return false; }
  // Horaires : seulement pour ses classes (validées ou cochées)
  const lu = lireCreneaux(f) || { creneaux: [] };
  if(lu.erreur){ err.textContent = lu.erreur; return false; }
  const fiche = session.enseignantId ? enseignantById(session.enseignantId) : null;
  const siennes = new Set([...(fiche?.classesAssignees || []), ...classes]);
  const horsClasse = lu.creneaux.find(c => !siennes.has(c.classe));
  if(horsClasse){ err.textContent = `Cochez aussi la classe ${classeName(horsClasse.classe)} (ou retirez son horaire).`; return false; }
  const bouton = f.querySelector('button[type=submit]'); bouton.disabled = true;
  const { data: id, error } = await sb.rpc('m_enroler_enseignant', { p_civilite: civ, p_prenom: prenom, p_nom: nom, p_telephone: tel, p_matieres: matieres, p_classes: classes });
  let errHoraires = null;
  if(!error) ({ error: errHoraires } = await sb.rpc('definir_creneaux', { p_creneaux: lu.creneaux }));
  bouton.disabled = false;
  if(error){ err.textContent = 'Envoi impossible : ' + error.message; return false; }
  if(errHoraires){ err.textContent = 'Fiche enregistrée, mais horaires refusés : ' + errHoraires.message; }
  const nouveau = !session.enseignantId;
  session.enseignantId = id; session.civilite = civ;
  if(nouveau){ session.nomComplet = `${prenom} ${nom}`; session.nomAppel = `${prenom} ${nom}`; }
  try{ const k = 'ecomaz_profil_cache'; const v = JSON.parse(localStorage.getItem(k) || 'null'); if(v){ v.enseignant_id = id; v.civilite = civ; if(nouveau){ v.nom_complet = session.nomComplet; v.nom_appel = session.nomAppel; } localStorage.setItem(k, JSON.stringify(v)); } }catch(_e){}
  try{ DB.enseignants = await dbSelectAll('enseignants_lecture'); }catch(_e){}
  ui.filters.enroleOuvert = false;
  if(errHoraires) return false;
  toast(classes.length ? 'Inscription enregistrée ✅ : l’école va valider vos classes' : (lu.creneaux.length ? 'Fiche et horaires enregistrés ✅ : rappels seulement pendant vos cours' : 'Fiche mise à jour ✅'));
  renderView('dashboard');
  return false;
}
async function inscriptionCompteGoogle(){
  if(!confirm('Vous allez quitter ce compte, puis vous inscrire avec votre propre compte Google. Continuer ?')) return;
  const lien = lienApplication('enseignant.html');
  await deconnexion();
  location.href = lien;
}
/* ---------- Liste des enseignants (console Enseignant) : noms, classes, matières, sans données privées ---------- */
function renderListeCollegues(){
  const liste = (DB.enseignants || []).filter(t => t.statut === 'Actif').sort((a, b) => (a.nom || '').localeCompare(b.nom || ''));
  if(!liste.length) return '';
  const titre = t => t.sexe === 'F' ? 'Maîtresse' : t.sexe === 'M' ? 'M.' : '';
  return `<div class="panel">
    <div class="panel-head"><div><h2>Liste des enseignants</h2><div class="sub">${liste.length} enseignant${liste.length > 1 ? 's' : ''} dans l’école</div></div></div>
    <ul class="collegues">${liste.map(t => `<li class="collegue${t.id === session.enseignantId ? ' moi' : ''}">
      <span class="avatar" aria-hidden="true">${escapeHtml(initials(t.prenom, t.nom))}</span>
      <span class="collegue-txt"><strong>${escapeHtml([titre(t), t.prenom, t.nom].filter(Boolean).join(' '))}${t.id === session.enseignantId ? ' <span class="badge green">Vous</span>' : ''}</strong>
        <small>${ui.role === 'enseignant' && t.id !== session.enseignantId ? ((t.matieres || []).length ? escapeHtml(t.matieres.join(', ')) : 'Enseignant(e)') : ((t.classesAssignees || []).map(id => escapeHtml(classeName(id))).join(', ') || 'Classes à valider') + ((t.matieres || []).length ? ' · ' + escapeHtml(t.matieres.join(', ')) : '')}</small></span>
    </li>`).join('')}</ul>
  </div>`;
}
// Emploi du temps du jour en frise, cours en cours mis en évidence (DESIGN.md §11 Console Enseignant)
function renderFriseDuJour(classes){
  const jour = JOURS[(new Date().getDay() + 6) % 7];
  if(!jour) return '';
  const maintenant = new Date(), hhmm = `${String(maintenant.getHours()).padStart(2,'0')}:${String(maintenant.getMinutes()).padStart(2,'0')}`;
  const cours = [];
  classes.filter(c => classeEnHorairesLibres(c.id)).forEach(c => seancesEdt(c.id, jour, todayISO()).forEach(e => {
    if(!session.enseignantId || !e.enseignantId || e.enseignantId === session.enseignantId) cours.push({ p: { debut: hhmmEdt(e.heureDebut), fin: hhmmEdt(e.heureFin) }, e, c });
  }));
  classes.filter(c => !classeEnHorairesLibres(c.id)).forEach(c => (PERIODES_BY_CYCLE[c.cycle] || []).forEach((p, i) => {
    if(p.type !== 'cours') return;
    const e = (DB.emploiTemps || []).find(x => x.classeId === c.id && x.jour === jour && x.slotIndex === i);
    if(e && (!session.enseignantId || !e.enseignantId || e.enseignantId === session.enseignantId)) cours.push({ p, e, c });
  }));
  cours.sort((a, b) => a.p.debut.localeCompare(b.p.debut));
  if(!cours.length) return `<div class="etat-vide" style="margin-bottom:12px;"><span class="etat-vide-ic" aria-hidden="true">${icone('calendar')}</span><span>Aucun cours prévu pour vous aujourd’hui dans l’emploi du temps. <button type="button" class="lien-discret" onclick="go('emploi-temps')">Voir l’emploi du temps</button></span></div>`;
  return `<ol class="frise" aria-label="Cours d’aujourd’hui">${cours.map(({ p, e, c }) => {
    const etat = hhmm >= p.fin ? 'passe' : hhmm >= p.debut ? 'encours' : 'avenir';
    return `<li class="frise-cours ${etat}" style="--mat:${e.heureDebut ? couleurActivite(e.matiere) : couleurMatiere(e.matiere)}">
      <span class="frise-heure">${p.debut}<small>${p.fin}</small></span>
      <span class="frise-txt"><strong>${escapeHtml(e.matiere)}</strong><small>${escapeHtml(c.nom)}</small></span>
      ${etat === 'encours' ? '<span class="tt-badge-encours">En cours</span>' : etat === 'passe' ? '<span class="frise-fait" aria-label="terminé">✓</span>' : ''}
    </li>`; }).join('')}</ol>`;
}
function renderMiseEnRoute(){
  if(!['direction','fondation','secretariat'].includes(ui.role)) return '';
  // Le secrétariat n'ouvre pas les Paramètres : il voit seulement les étapes qu'il peut faire
  const etapes = etapesMiseEnRoute().filter(e => ui.role !== 'secretariat' || e.vue !== 'parametres'), faites = etapes.filter(e => e.ok).length;
  if(faites === etapes.length) return '';
  const pct = Math.round(100 * faites / etapes.length);
  const ouvert = ui.filters.miseEnRouteOuvert !== false;
  return `<div class="panel mise-en-route">
    <div class="panel-head">
      <div><h2>Mise en route de l’école <span class="mer-score">${faites} / ${etapes.length}</span></h2><div class="sub">Plus ces étapes sont faites, plus EcoMaZ travaille pour vous.</div></div>
      <button class="btn secondary sm" onclick="ui.filters.miseEnRouteOuvert=${!ouvert}; renderView('dashboard')">${ouvert ? 'Replier' : 'Afficher'}</button>
    </div>
    <div class="mer-barre" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><div style="width:${pct}%"></div></div>
    ${ouvert ? `<ul class="mer-liste">${etapes.filter(e => !e.ok || ui.filters.merFaites).map(e => `<li class="${e.ok ? 'fait' : ''}">
      <span class="mer-ic" aria-hidden="true">${e.ok ? '✓' : '•'}</span>
      <div class="mer-txt"><strong>${e.titre}</strong><span>${escapeHtml(e.detail)}</span></div>
      ${e.ok ? '' : `<button class="btn sm" onclick="${e.action || `go('${e.vue}')`}">${e.bouton}</button>`}
    </li>`).join('')}</ul>
    <button type="button" class="lien-discret" onclick="ui.filters.merFaites=${!ui.filters.merFaites}; renderView('dashboard')">${ui.filters.merFaites ? 'Masquer les étapes faites' : `Voir les ${faites} étape${faites > 1 ? 's' : ''} déjà faite${faites > 1 ? 's' : ''}`}</button>` : ''}
  </div>`;
}
/* =====================================================================
   PARENTS ↔ ÉLÈVES — relier chaque élève au compte de son parent, pour
   que notifications, annonces et messages arrivent à la bonne personne.
   ===================================================================== */
function comptesParents(){ return (DB.profiles || []).filter(p => p.role === 'parent'); }
function parentsDeLEleve(eleveId){
  return (DB.parentsEleves || []).filter(pe => pe.eleveId === eleveId)
    .map(pe => ({ lien: pe, profil: comptesParents().find(p => p.id === pe.parentProfileId) }));
}
// Suggestions : comptes parents dont le nom ressemble au parent noté sur la
// fiche, ou qui portent le nom de famille de l'élève.
function suggestionsParent(e){
  const mots = t => simplifierTexte(t).split(' ').filter(m => m.length >= 3);
  const cles = new Set(mots(e.parentNom).concat(mots(e.nom)));
  return comptesParents().map(p => ({ p, score: mots(p.nomComplet).filter(m => cles.has(m)).length }))
    .filter(x => x.score > 0).sort((a, b) => b.score - a.score).map(x => x.p);
}
// Numéros lisibles de la fiche (« 07 67 68 68 77 »), sans l'indicatif 225
function telsDeFiche(e){
  return String(e.parentTel || '').split(/\s*[\/;,|]\s*|\s+-\s+|\s+et\s+/i).map(t => t.replace(/\D/g, '').replace(/^225/, '')).filter(t => t.length === 10);
}
const telLisible = t => t.replace(/(\d{2})(?=\d)/g, '$1 ');
// Refonte (DESIGN.md §11) : une carte par élève, rien ne peut déborder sur la carte suivante
function renderLiensParents(){
  const eleves = DB.eleves.filter(e => e.statut === 'Actif').sort((a, b) => a.nom.localeCompare(b.nom));
  const sansParent = eleves.filter(e => !parentsDeLEleve(e.id).length);
  const parents = comptesParents().slice().sort((a, b) => (a.nomComplet||'').localeCompare(b.nomComplet||''));
  const optionsParents = sel => parents.map(p => `<option value="${p.id}" ${sel===p.id?'selected':''}>${escapeHtml(p.nomComplet || '—')}</option>`).join('');
  const etat = ui.filters.peEtat || 'tous';
  const carte = e => {
    const liens = parentsDeLEleve(e.id), relie = liens.length > 0;
    const sugg = suggestionsParent(e), tels = telsDeFiche(e);
    return `<article class="pe-carte" data-nom="${escapeHtml((eleveFullName(e) + ' ' + (e.parentNom || '')).toLowerCase())}" data-etat="${relie ? 'relie' : 'non'}">
      <header class="pe-tete">
        <span class="lc-avatar" aria-hidden="true">${escapeHtml(initials(e.prenom, e.nom))}</span>
        <span class="pe-id"><strong>${escapeHtml(eleveFullName(e))}</strong><span class="puce-classe">${escapeHtml(classeName(e.classeId))}</span></span>
        ${relie ? `<span class="badge-etat ok">${icone('check')}Compte relié</span>` : `<span class="badge-etat attente">${icone('clock')}Non relié</span>`}
      </header>
      <div class="pe-parent">
        <span class="pe-lib">Parent sur la fiche</span>
        <span class="pe-nom">${escapeHtml(e.parentNom || '—')}</span>
        ${tels.length ? `<span class="pe-tels">${tels.map(t => `<span class="puce-tel">${telLisible(t)}</span>`).join('')}</span>` : (e.parentTel ? `<span class="pe-tels"><span class="puce-tel invalide" title="Numéro incomplet ou illisible">${escapeHtml(e.parentTel)}</span></span>` : '')}
      </div>
      ${relie ? `<div class="pe-comptes"><span class="pe-lib">Compte(s) relié(s)</span>${liens.map(x => `<span class="puce-compte">${escapeHtml(x.profil?.nomComplet || 'parent')}<button type="button" class="puce-retirer" aria-label="Retirer le lien avec ${escapeHtml(x.profil?.nomComplet || 'ce parent')}" title="Retirer le lien" onclick="retirerAccesParentLiens('${x.lien.id}')">✕</button></span>`).join('')}</div>` : `
      <div class="pe-actions">
        <button type="button" class="btn sm" onclick="ouvrirInvitationParent('${e.id}')">Inviter</button>
        ${parents.length ? `<details class="pe-relier">
          <summary class="btn secondary sm">Relier à un compte</summary>
          <div class="pe-feuille">
            <input type="search" class="pe-cherche" placeholder="Rechercher un compte parent" aria-label="Rechercher un compte parent" oninput="filtrerOptionsParent(this, 'lienParent-${e.id}')">
            <select id="lienParent-${e.id}" size="${Math.min(6, Math.max(3, parents.length + (sugg.length ? 2 : 0)))}"><option value="">— Choisir un compte —</option>
              ${sugg.length ? `<optgroup label="Suggestions">${sugg.map(p => `<option value="${p.id}">${escapeHtml(p.nomComplet || '—')}</option>`).join('')}</optgroup><optgroup label="Tous les comptes">` : ''}${optionsParents(sugg[0]?.id)}${sugg.length ? '</optgroup>' : ''}</select>
            <button type="button" class="btn sm" onclick="relierParentEleve('${e.id}')">Relier</button>
          </div>
        </details>` : ''}
        <details class="pe-plus">
          <summary class="btn secondary sm" aria-label="Plus d’actions" title="Plus d’actions">⋯</summary>
          <div class="pe-menu"><button type="button" class="btn-reset" onclick="ouvrirCreerCompteParent('${e.id}')">Créer le compte par e-mail</button></div>
        </details>
      </div>`}
    </article>`;
  };
  return `<div class="view active">
    <div class="panel panneau-inscriptions">
      <div class="panel-head">
        <div><h2>Inscriptions des parents</h2><div class="sub" id="compteurInscriptions">Chargement…</div></div>
        <button type="button" class="btn secondary sm" onclick="chargerDemandesAcces()">Actualiser</button>
      </div>
      <div class="hint" style="margin-top:0;">Le parent s’inscrit avec Google et coche son enfant. « Sûre » = son téléphone est celui de la fiche de l’enfant. Vérifiez puis touchez « Approuver » : il ne verra que son ou ses enfants.</div>
      <div data-demandes-role="parent"><div class="hint">Chargement…</div></div>
      ${(setTimeout(chargerDemandesAcces, 0), '')}
    </div>
    <div class="section-note">👪 Un élève relié au compte de son parent permet à ce parent de recevoir <strong>uniquement</strong> ce qui concerne son enfant : absences, annonces de son cycle, cours de renforcement, objets perdus et messages de l'école.</div>
    <div class="panel">
      <div class="panel-head"><div><h2>Élèves et parents</h2><div class="sub"><strong class="${sansParent.length ? 'pe-a-faire' : ''}">${sansParent.length ? `${sansParent.length} élève${sansParent.length > 1 ? 's' : ''} non relié${sansParent.length > 1 ? 's' : ''}` : 'Tous les élèves sont reliés 🎉'}</strong> · ${eleves.length - sansParent.length} / ${eleves.length} reliés · ${parents.length} compte${parents.length > 1 ? 's' : ''} parent${parents.length > 1 ? 's' : ''}</div></div></div>
      <div class="mer-barre" role="progressbar" aria-valuenow="${eleves.length ? Math.round(100 * (eleves.length - sansParent.length) / eleves.length) : 0}" aria-valuemin="0" aria-valuemax="100"><div style="width:${eleves.length ? Math.round(100 * (eleves.length - sansParent.length) / eleves.length) : 0}%"></div></div>
      <div class="scol-outils">
        <input type="search" class="scol-recherche pe-recherche" placeholder="Rechercher un élève ou un parent" aria-label="Rechercher un élève ou un parent" oninput="filtrerLiensParents()">
        <div class="segmente" role="group" aria-label="Filtrer les élèves">${[['tous','Tous'],['non','Non reliés'],['relie','Reliés']].map(([k, l]) => `<button type="button" class="seg${etat === k ? ' actif' : ''}" data-etat="${k}" onclick="ui.filters.peEtat='${k}'; filtrerLiensParents()">${l}</button>`).join('')}</div>
      </div>
      ${eleves.length ? `<div class="pe-grille">${eleves.map(carte).join('')}</div>` : '<div class="hint">Aucun élève actif.</div>'}
      <div class="etat-vide pe-aucun" hidden><span class="etat-vide-ic" aria-hidden="true">${icone('search')}</span><span>Aucun élève pour ce filtre. <button type="button" class="lien-discret" onclick="ui.filters.peEtat='tous'; const r=document.querySelector('.pe-recherche'); if(r) r.value=''; filtrerLiensParents()">Effacer les filtres</button></span></div>
      ${(setTimeout(filtrerLiensParents, 0), '')}
    </div>

    <div class="panel">
      <div class="panel-head"><div><h2>Inviter les parents</h2><div class="sub">À glisser dans le cahier de liaison ou à afficher à l’entrée</div></div></div>
      ${sansParent.length ? `<div class="relance-par-cta"><div><strong>Inviter chaque famille sur WhatsApp</strong><span>${famillesARelancer().length} famille(s) à inviter : un message personnel par numéro, frères et sœurs regroupés. Le parent est reconnu tout seul grâce à son numéro.</span></div>
        <button type="button" class="btn" onclick="ouvrirRelanceParents()">${icone('send') || '📲'} Inviter les familles</button></div>` : ''}
      <div class="pe-invit">
        <button class="btn${sansParent.length ? ' secondary' : ''}" onclick="imprimerInvitationsPapier('')">🖨️ Coupons personnels (familles non reliées)</button>
        <button class="btn secondary" onclick="ouvrirCouponsInvitation(false)" title="Lien général de l’application, sans code personnel (réunion de rentrée…)">Coupons généraux (lien de l’école)</button>
        <button class="btn secondary" onclick="imprimerAffiche('parent.html')">🖨️ Affiche A4</button>
      </div>
      <div class="groupe-wa">
        <div class="groupe-wa-tete"><span class="etat-vide-ic" aria-hidden="true">${icone('send')}</span><div><strong>Le plus rapide : le groupe WhatsApp de la classe</strong><span>Un message prêt à coller, avec le lien et 3 étapes simples.</span></div></div>
        <div class="groupe-wa-choix">
          <select id="groupeWaClasse" class="puce-select petit" aria-label="Classe">${DB.classes.map(c => { const n = eleves.filter(e => e.classeId === c.id && !parentsDeLEleve(e.id).length).length; return `<option value="${c.id}">${escapeHtml(c.nom)}${n ? ` — ${n} non relié${n > 1 ? 's' : ''}` : ' — tous reliés'}</option>`; }).join('')}</select>
          <button type="button" class="btn" onclick="ouvrirMessageGroupeClasse(document.getElementById('groupeWaClasse').value)">Préparer le message</button>
        </div>
      </div>
    </div>

    <div class="panel">
      <div class="panel-head"><div><h2>Comptes parents et leurs enfants</h2><div class="sub">Un parent peut avoir plusieurs enfants dans l'école</div></div></div>
      ${!parents.length ? `<div class="etat-vide"><span class="etat-vide-ic" aria-hidden="true">${icone('users')}</span><span>Aucun compte parent pour l’instant. Invitez les parents : leurs demandes arrivent en haut de cet écran (Inscriptions des parents).</span></div>` : `<div class="pe-grille">${parents.map(p => {
          const liens = (DB.parentsEleves || []).filter(pe => pe.parentProfileId === p.id);
          const dejaRelies = new Set(liens.map(l => l.eleveId));
          return `<article class="pe-carte">
            <header class="pe-tete"><span class="lc-avatar" aria-hidden="true">${escapeHtml(initials(...String(p.nomComplet || '? ?').split(' ')))}</span><span class="pe-id"><strong>${escapeHtml(p.nomComplet || '—')}</strong><small>${liens.length} enfant${liens.length > 1 ? 's' : ''} relié${liens.length > 1 ? 's' : ''}</small></span></header>
            <div class="pe-comptes">${liens.map(l => { const e = eleveById(l.eleveId); return `<span class="puce-compte">${escapeHtml(e ? eleveFullName(e) : '—')}<button type="button" class="puce-retirer" aria-label="Retirer le lien" title="Retirer le lien" onclick="retirerAccesParentLiens('${l.id}')">✕</button></span>`; }).join('') || '<span class="hint">Aucun enfant relié</span>'}</div>
            <div class="pe-ajout"><select id="ajoutEnfant-${p.id}" aria-label="Élève à ajouter"><option value="">— Ajouter un enfant —</option>${eleves.filter(e => !dejaRelies.has(e.id)).map(e => `<option value="${e.id}">${escapeHtml(eleveFullName(e))} (${escapeHtml(classeName(e.classeId))})</option>`).join('')}</select>
              <button type="button" class="btn secondary sm" onclick="relierEnfantAuParent('${p.id}')">Ajouter</button></div>
          </article>`;
        }).join('')}</div>`}
    </div>
  </div>`;
}
// Message pour le groupe WhatsApp des parents d'une classe (gratuit ; rien n'est
// envoyé automatiquement : l'école relit, puis colle ou partage elle-même)
function messageGroupeClasse(classeId){
  const nomEcole = DB.meta?.nomEcole || 'L’école';
  return `Chers parents de la classe ${classeName(classeId)},\n\n`
    + `${nomEcole} utilise l’application EcoMaZ. Sur votre téléphone, vous recevrez les absences et retards de votre enfant, ses devoirs, les annonces de l’école et le menu de la cantine.\n\n`
    + `1. Ouvrez ce lien : ${lienApplication('parent.html')}\n`
    + `2. Touchez « Continuer avec Google »\n`
    + `3. Écrivez votre numéro et le nom de votre enfant : l’école valide votre accès.\n\n`
    + `C’est gratuit. Merci de votre confiance !`;
}
function ouvrirMessageGroupeClasse(classeId){
  if(!classeId) return;
  openModal(`Message pour le groupe WhatsApp — ${classeName(classeId)}`, `
    <p class="hint" style="margin-top:0;">Relisez ou modifiez le message, puis partagez-le dans le groupe WhatsApp des parents de la classe.</p>
    <div class="field"><label for="msgGroupeClasse">Message</label><textarea id="msgGroupeClasse" rows="11">${escapeHtml(messageGroupeClasse(classeId))}</textarea></div>
    <div class="form-actions">
      <button type="button" class="btn secondary" onclick="copierMessageGroupe()">Copier</button>
      <button type="button" class="btn" onclick="window.open('https://wa.me/?text=' + encodeURIComponent(document.getElementById('msgGroupeClasse').value), '_blank', 'noopener')">Partager sur WhatsApp</button>
    </div>`);
}
function copierMessageGroupe(){
  const t = document.getElementById('msgGroupeClasse')?.value || '';
  (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(() => toast('Message copié : collez-le dans le groupe'), () => window.prompt('Copiez ce message :', t));
}
// Feuille « Inviter » : choix du numéro, envoi par WhatsApp (gratuit)
/* ---------- Invitation famille par famille (un numéro = une famille, frères et sœurs regroupés) ---------- */
function famillesARelancer(classeId){
  const familles = new Map();
  DB.eleves.filter(e => e.statut === 'Actif' && !parentsDeLEleve(e.id).length && (!classeId || e.classeId === classeId)).forEach(e => {
    const tel = telsDeFiche(e)[0] || ('sans:' + e.id);
    if(!familles.has(tel)) familles.set(tel, { tel: tel.startsWith('sans:') ? null : tel, enfants: [], parentNom: e.parentNom || '' });
    familles.get(tel).enfants.push(e);
  });
  const rang = id => DB.classes.findIndex(c => c.id === id);
  return [...familles.values()].sort((a, b) => (!a.tel) - (!b.tel) || rang(a.enfants[0].classeId) - rang(b.enfants[0].classeId) || a.enfants[0].nom.localeCompare(b.enfants[0].nom));
}
function cleRelancesParents(){ return 'ecomaz_relances_parents_' + (session.ecoleId || ''); }
function relancesParents(){ try{ return JSON.parse(localStorage.getItem(cleRelancesParents()) || '{}'); }catch(_e){ return {}; } }
function messageInvitationFamille(f, code){
  if(code){
    const enfants = f.enfants.map(e => `${e.prenom} (${classeName(e.classeId)})`);
    const liste = enfants.length > 1 ? enfants.slice(0, -1).join(', ') + ' et ' + enfants[enfants.length - 1] : enfants[0];
    return `Bonjour, parent de ${liste},\n\n`
      + `${DB.meta.nomEcole} vous invite dans son application EcoMaZ-PARENTS D'ELEVES : absences, devoirs, emploi du temps, scolarité, annonces.\n\n`
      + `Votre lien personnel (valable 30 jours, pour vous seul) :\n${lienApplication('parent.html')}&invitation=${encodeURIComponent(code)}\n\n`
      + `1. Ouvrez-le dans Chrome\n2. Touchez « Continuer avec Google »\n3. Choisissez Papa ou Maman : vous arrivez directement dans votre espace, déjà relié à ${f.enfants.length > 1 ? 'vos enfants' : 'votre enfant'}.\n\nMerci !`;
  }
  return messageInvitationFamilleSansLien(f);
}
function messageInvitationFamilleSansLien(f){
  const enfants = f.enfants.map(e => `${e.prenom} (${classeName(e.classeId)})`);
  const liste = enfants.length > 1 ? enfants.slice(0, -1).join(', ') + ' et ' + enfants[enfants.length - 1] : enfants[0];
  return `Bonjour, parent de ${liste},\n\n`
    + `${DB.meta.nomEcole} vous informe désormais par l’application EcoMaZ-PARENTS D'ELEVES : absences, devoirs, scolarité, annonces.\n\n`
    + `1. Ouvrez ce lien dans Chrome : ${lienApplication('parent.html')}\n`
    + `2. Touchez « Continuer avec Google »\n`
    + `3. Indiquez ce numéro WhatsApp (${telLisible(f.tel)}) : ${f.enfants.length > 1 ? 'vos enfants apparaissent' : 'votre enfant apparaît'} tout seul${f.enfants.length > 1 ? 's' : ''}, cochez et envoyez.\n\n`
    + `L’école valide ensuite votre accès. Merci !`;
}
async function ouvrirRelanceParents(classeId){
  classeId = classeId || '';
  const familles = famillesARelancer(classeId || null), envois = relancesParents();
  // Un lien personnel par famille (réutilisé tant qu'il est valable) : le parent entrera directement
  await preparerCodesInvitation(familles, 'Inviter les familles sur WhatsApp');
  const avecTel = familles.filter(f => f.tel), sansTel = familles.filter(f => !f.tel);
  const faites = avecTel.filter(f => envois[f.tel]).length;
  const ligne = f => {
    const envoye = f.tel && envois[f.tel];
    return `<li class="relance-ligne${envoye ? ' envoye' : ''}"${f.tel ? ` id="relpar_${f.tel}"` : ''}>
      <span class="relance-txt"><strong>${f.enfants.map(e => escapeHtml(eleveFullName(e))).join(' · ')}</strong>
        <small>${[...new Set(f.enfants.map(e => classeName(e.classeId)))].map(escapeHtml).join(', ')}${f.parentNom ? ' · parent : ' + escapeHtml(f.parentNom) : ''}</small></span>
      <span class="relance-actions">${f.tel
        ? `<a class="btn sm" href="https://wa.me/225${f.tel}?text=${encodeURIComponent(messageInvitationFamille(f, window.__codesInvitation[f.tel]))}" target="_blank" rel="noopener" onclick="marquerRelanceParent(${jsArg(f.tel)})">WhatsApp · ${telLisible(f.tel)}</a>${envoye ? `<span class="badge-etat ok">Envoyé le ${fmtDate(envoye)}</span>` : ''}`
        : `<button type="button" class="btn secondary sm" onclick="closeModal(); ui.eleveProfileId='${f.enfants[0].id}'; go('eleves')">Numéro à corriger</button>`}</span>
    </li>`;
  };
  openModal('Inviter les familles sur WhatsApp', `
    <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:space-between;margin-bottom:8px;">
      <select class="puce-select petit" aria-label="Classe" onchange="ouvrirRelanceParents(this.value)"><option value="">Toutes les classes</option>${DB.classes.map(c => `<option value="${c.id}" ${classeId === c.id ? 'selected' : ''}>${escapeHtml(c.nom)}</option>`).join('')}</select>
      <span class="hint" style="margin:0;"><strong>${faites}</strong> / ${avecTel.length} famille(s) invitée(s) depuis ce téléphone</span>
    </div>
    <div class="relance-papier"><span class="relance-papier-txt"><strong>${icone('printer')} Familles sans WhatsApp, ou pour aller plus vite : coupons papier</strong>
      <small>Une feuille A4 = 8 coupons à découper et glisser dans le cahier de liaison. Chaque famille scanne SON code et entre directement, déjà reliée à ${familles.length > 1 ? 'ses enfants' : 'son enfant'}.</small></span>
      <button type="button" class="btn secondary sm" onclick="imprimerInvitationsPapier('${classeId}')" ${familles.length ? '' : 'disabled'}>Imprimer ${familles.length} coupon(s)</button></div>
    <p class="hint" style="margin-top:0;">Touchez « WhatsApp » : le message est prêt, avec le <strong>lien personnel</strong> de la famille (valable 30 jours, utilisable une seule fois). Le parent se connecte avec Google, choisit Papa ou Maman et <strong>entre directement</strong>, déjà relié à ses enfants — rien à valider de votre côté.</p>
    ${familles.length ? `<ul class="relance-liste">${avecTel.concat(sansTel).map(ligne).join('')}</ul>` : '<div class="etat-vide etat-vide-ok"><span>Toutes les familles de cette sélection sont déjà reliées 🎉</span></div>'}
    <div class="form-actions"><button type="button" class="btn secondary" onclick="closeModal()">Fermer</button></div>`);
}
// Un lien personnel par famille (réutilisé tant qu'il est valable) : le parent entre directement, déjà relié
async function preparerCodesInvitation(familles, titre){
  window.__codesInvitation = window.__codesInvitation || {};
  const aPreparer = familles.filter(f => f.tel && !window.__codesInvitation[f.tel]);
  if(!aPreparer.length) return;
  openModal(titre, `<div class="hint">Préparation des liens personnels (${aPreparer.length})…</div>`);
  for(let i = 0; i < aPreparer.length; i += 8){
    await Promise.all(aPreparer.slice(i, i + 8).map(async f => {
      const { data, error } = await sb.rpc('creer_invitation_parent', { p_eleve_ids: f.enfants.map(e => e.id), p_tel: f.tel });
      if(!error && data) window.__codesInvitation[f.tel] = data;
    }));
  }
}
/* ---------- Coupons d'invitation papier (cahier de liaison) : 8 par feuille A4 ---------- */
async function imprimerInvitationsPapier(classeId){
  const familles = famillesARelancer(classeId || null);
  if(!familles.length){ toast('Toutes les familles de cette sélection sont déjà reliées.'); return; }
  await preparerCodesInvitation(familles, 'Coupons d’invitation');
  const m = DB.meta || {};
  const coupon = f => {
    const code = f.tel && window.__codesInvitation[f.tel];
    const lien = code ? `${lienApplication('parent.html')}&invitation=${encodeURIComponent(code)}` : lienApplication('parent.html');
    let qr = ''; try{ const q = qrcode(0, 'M'); q.addData(lien); q.make(); qr = q.createSvgTag({ cellSize: 3, margin: 0, scalable: true }); }catch(_e){}
    const prenoms = f.enfants.map(e => `<strong>${escapeHtml(e.prenom)}</strong> (${escapeHtml(classeName(e.classeId))})`);
    return `<article class="ip-coupon">
      <header class="ip-tete">${m.logo ? `<img src="${escapeHtml(m.logo)}" alt="">` : ''}<span><strong>${escapeHtml(m.nomEcole || '')}</strong><small>Application EcoMaZ-PARENTS D’ÉLÈVES</small></span></header>
      <div class="ip-corps">
        <div class="ip-qr" aria-hidden="true">${qr}</div>
        <div class="ip-txt">
          <div class="ip-pour">Parents de ${prenoms.join(', ')}</div>
          <ol><li>Scannez ce code avec l’appareil photo du téléphone.</li><li>Touchez « Continuer avec Google ».</li><li>${code ? `Choisissez Papa ou Maman : ${f.enfants.length > 1 ? 'vos enfants apparaissent' : 'votre enfant apparaît'} tout seul.` : 'Cochez le nom de votre enfant : l’école valide votre accès.'}</li></ol>
          <div class="ip-plus">Absences, devoirs, emploi du temps, bulletins, annonces de l’école.</div>
        </div>
      </div>
      <footer class="ip-pied">${code ? 'Code personnel à utiliser rapidement — ne le partagez pas : il donne accès aux informations de votre enfant.' : 'Lien de l’application de l’école.'}</footer>
    </article>`;
  };
  openModal('Coupons d’invitation des parents', `
    <div class="form-actions no-print" style="margin-top:0;justify-content:space-between;align-items:center;flex-wrap:wrap;">
      <span class="hint" style="margin:0;">${familles.length} coupon(s) · ${Math.ceil(familles.length / 8)} feuille(s) A4 · découpez le long des pointillés</span>
      <button type="button" class="btn" onclick="window.print()">${icone('printer')} Imprimer / PDF</button></div>
    ${Array.from({ length: Math.ceil(familles.length / 8) }, (_, k) => `<section class="ip-feuille">${familles.slice(k * 8, k * 8 + 8).map(coupon).join('')}</section>`).join('')}`);
}
function marquerRelanceParent(tel){
  const envois = relancesParents(); envois[tel] = todayISO();
  try{ localStorage.setItem(cleRelancesParents(), JSON.stringify(envois)); }catch(_e){}
  const li = document.getElementById('relpar_' + tel);
  if(li && !li.classList.contains('envoye')){ li.classList.add('envoye'); li.querySelector('.relance-actions')?.insertAdjacentHTML('beforeend', `<span class="badge-etat ok">Envoyé le ${fmtDate(todayISO())}</span>`); }
}
function ouvrirInvitationParent(eleveId){
  const e = eleveById(eleveId); if(!e) return;
  const tels = telsDeFiche(e);
  const texte = encodeURIComponent(messagePartageApplication('parent.html'));
  openModal(`Inviter le parent de ${eleveFullName(e)}`, `
    <p class="hint" style="margin-top:0;">Le parent reçoit le lien de l’application par WhatsApp, se connecte avec Google, puis vous validez sa demande en haut de cet écran (Inscriptions des parents).</p>
    ${tels.length ? `<div class="pe-invit-liste">${tels.map(t => `<a class="btn" href="https://wa.me/225${t}?text=${texte}" target="_blank" rel="noopener">📲 WhatsApp · ${telLisible(t)}</a>`).join('')}</div>`
      : `<div class="etat-vide"><span class="etat-vide-ic" aria-hidden="true">${icone('triangle-alert')}</span><span>Aucun numéro valide sur la fiche${e.parentTel ? ` (« ${escapeHtml(e.parentTel)} »)` : ''}. Corrigez le numéro dans la fiche de l’élève, ou imprimez un coupon d’invitation.</span></div>`}
    <div class="form-actions"><button type="button" class="btn secondary" onclick="closeModal()">Fermer</button><button type="button" class="btn secondary" onclick="closeModal(); ouvrirCreerCompteParent('${e.id}')">Créer par e-mail</button></div>`);
}
function filtrerOptionsParent(champ, idSelect){
  const t = simplifierTexte(champ.value || ''), sel = document.getElementById(idSelect); if(!sel) return;
  sel.querySelectorAll('option').forEach(o => { if(o.value) o.hidden = !!t && !simplifierTexte(o.textContent).includes(t); });
}
function filtrerLiensParents(){
  const etat = ui.filters.peEtat || 'tous';
  const texte = simplifierTexte(document.querySelector('.pe-recherche')?.value || '');
  let visibles = 0;
  document.querySelectorAll('.pe-carte[data-etat]').forEach(el => {
    const ok = (etat === 'tous' || el.dataset.etat === etat) && (!texte || simplifierTexte(el.dataset.nom || '').includes(texte));
    el.hidden = !ok; if(ok) visibles++;
  });
  document.querySelectorAll('.segmente .seg').forEach(b => b.classList.toggle('actif', b.dataset.etat === etat));
  const vide = document.querySelector('.pe-aucun'); if(vide) vide.hidden = visibles > 0 || !document.querySelector('.pe-carte[data-etat]');
}
// Coupons à imprimer et glisser dans le cahier de liaison : nom de l'élève,
// QR code de l'application des parents, étapes d'installation.
function ouvrirCouponsInvitation(seulementSansParent){
  const eleves = DB.eleves.filter(e => e.statut === 'Actif' && (!seulementSansParent || !parentsDeLEleve(e.id).length))
    .sort((a, b) => classeName(a.classeId).localeCompare(classeName(b.classeId)) || a.nom.localeCompare(b.nom));
  if(!eleves.length) return toast('Tous les élèves ont déjà un parent relié 🎉');
  const lien = lienApplication('parent.html');
  let qr = '';
  try{ const q = qrcode(0, 'M'); q.addData(lien); q.make(); qr = q.createSvgTag({ cellSize: 3, margin: 1, scalable: true }); }catch(_e){}
  const nomApp = `EcoMaZ-PARENTS D'ELEVES ${DB.meta.nomEcole}`;
  openModal(`Coupons d’invitation (${eleves.length})`, `
    <div class="form-actions no-print" style="margin-top:0;"><button type="button" class="btn secondary" onclick="closeModal()">Fermer</button><button type="button" class="btn" onclick="window.print()">🖨️ Imprimer</button></div>
    <div class="coupons">${eleves.map(e => `
      <div class="coupon">
        <div class="coupon-qr">${qr}</div>
        <div class="coupon-texte">
          <div class="coupon-titre">Parents de <strong>${escapeHtml(eleveFullName(e))}</strong> — ${escapeHtml(classeName(e.classeId))}</div>
          <div class="coupon-app">${escapeHtml(nomApp)}</div>
          <ol>
            <li>Scannez le QR code avec l’appareil photo du téléphone (ou ouvrez le lien ci-dessous).</li>
            <li>Touchez « Installer l’application », puis « Continuer avec Google ».</li>
            <li>Dans votre demande, écrivez le nom de votre enfant : l’école valide votre accès.</li>
          </ol>
          <div class="coupon-lien">${escapeHtml(lien)}</div>
        </div>
      </div>`).join('')}
    </div>`);
}
async function creerLienParentEleve(parentId, eleveId){
  const { data, error } = await sb.from('parents_eleves').insert({ parent_profile_id: parentId, eleve_id: eleveId, ecole_id: session.ecoleId }).select().single();
  if(error) throw error;
  DB.parentsEleves = (DB.parentsEleves || []).concat(rowToCamel(data));
}
async function relierParentEleve(eleveId){
  const parentId = document.getElementById('lienParent-' + eleveId)?.value;
  if(!parentId) return alert('Choisissez d’abord le compte du parent.');
  try{ await creerLienParentEleve(parentId, eleveId); toast('Élève relié à son parent'); renderView('liens-parents'); }
  catch(e){ alert('Erreur : ' + e.message); }
}
async function relierEnfantAuParent(parentId){
  const eleveId = document.getElementById('ajoutEnfant-' + parentId)?.value;
  if(!eleveId) return alert('Choisissez d’abord l’élève.');
  try{ await creerLienParentEleve(parentId, eleveId); toast('Enfant ajouté à ce parent'); renderView('liens-parents'); }
  catch(e){ alert('Erreur : ' + e.message); }
}
async function retirerAccesParentLiens(peId){
  if(!confirm("Retirer le lien entre ce parent et cet élève ? Le parent ne verra plus rien de cet enfant.")) return;
  try{
    const { error } = await exigerEffet(sb.from('parents_eleves').delete().eq('id', peId));
    if(error) throw error;
    DB.parentsEleves = (DB.parentsEleves || []).filter(pe => pe.id !== peId);
    toast('Lien retiré'); renderView('liens-parents');
  }catch(e){ alert('Erreur : ' + e.message); }
}

/* =====================================================================
   COURS DE RENFORCEMENT — inscriptions, jours et heure, parents prévenus
   (annonces automatiques : fonction annoncer-horaires, sections 50 et 51).
   ===================================================================== */
function renderRenforcement(){
  const h = DB?.horairesAnnonces || {};
  const inscrits = DB.eleves.filter(e => e.statut === 'Actif' && e.renforcement).sort((a, b) => a.nom.localeCompare(b.nom));
  const jours = h.joursRenforcement || [1,2,3,4,5];
  const debut = (h.apresmidiFinPrimaire || '16:00').slice(0, 5), fin = (h.renforcementFin || '17:00').slice(0, 5);
  const classes = classesVisibles ? classesVisibles() : DB.classes;
  const f = ui.filters.renforcement = ui.filters.renforcement || { classeId: classes[0]?.id || '' };
  if(!classes.some(c => c.id === f.classeId)) f.classeId = classes[0]?.id || '';
  const elevesClasse = DB.eleves.filter(e => e.classeId === f.classeId && e.statut === 'Actif').sort((a, b) => a.nom.localeCompare(b.nom));
  const sansParent = inscrits.filter(e => !parentsDeLEleve(e.id).length);
  return `<div class="view active">
    <div class="cards">
      <div class="card"><div class="num">${inscrits.length}</div><div class="label">Élèves inscrits</div></div>
      <div class="card"><div class="num">${debut.replace(':','h')} → ${fin.replace(':','h')}</div><div class="label">Horaire (après la fin des cours)</div></div>
      <div class="card"><div class="num">${jours.length} j</div><div class="label">${JOURS_COMPLETS.filter((_, i) => jours.includes(i+1)).map(j => j.slice(0,3)).join(', ') || 'aucun jour'}</div></div>
      <div class="card"><div class="num">${inscrits.length - sansParent.length} / ${inscrits.length}</div><div class="label">Parents reliés (prévenus)</div></div>
    </div>

    <div class="panel">
      <div class="panel-head"><div><h2>📘 Inscrire des élèves</h2><div class="sub">Cochez les élèves de la classe qui suivent le renforcement, puis enregistrez</div></div></div>
      <div class="filters"><select onchange="ui.filters.renforcement.classeId=this.value; renderView('renforcement')">${classes.map(c => `<option value="${c.id}" ${c.id===f.classeId?'selected':''}>${escapeHtml(c.nom)}</option>`).join('')}</select></div>
      ${!elevesClasse.length ? '<div class="hint">Aucun élève actif dans cette classe.</div>' : `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:8px;">
        ${elevesClasse.map(e => `<label style="display:flex;align-items:center;gap:8px;padding:8px 10px;border:1px solid var(--border);border-radius:var(--r-card);"><input type="checkbox" class="case-renf" value="${e.id}" ${e.renforcement?'checked':''}> ${escapeHtml(eleveFullName(e))}</label>`).join('')}
      </div>
      <div class="form-actions"><button class="btn" onclick="enregistrerRenforcementClasse()">Enregistrer pour ${escapeHtml(classeName(f.classeId))}</button></div>`}
    </div>

    <div class="panel">
      <div class="panel-head"><div><h2>Élèves inscrits (${inscrits.length})</h2><div class="sub">Leurs parents sont prévenus automatiquement : « votre enfant est retenu », puis la fin du renforcement</div></div></div>
      ${!inscrits.length ? '<div class="hint">Aucun élève inscrit pour l’instant.</div>' : `<div class="table-wrap"><table>
        <thead><tr><th>Élève</th><th>Classe</th><th>Parent relié</th><th></th></tr></thead>
        <tbody>${inscrits.map(e => { const ps = parentsDeLEleve(e.id); return `<tr>
          <td>${escapeHtml(eleveFullName(e))}</td><td>${escapeHtml(classeName(e.classeId))}</td>
          <td>${ps.length ? ps.map(x => `<span class="badge green">${escapeHtml(x.profil?.nomComplet || 'parent')}</span>`).join(' ') : `<span class="badge amber">aucun — ne sera pas prévenu</span> <button class="btn secondary sm" onclick="go('liens-parents')">Relier</button>`}</td>
          <td><button class="btn secondary sm" onclick="retirerDuRenforcement('${e.id}')">Retirer</button></td>
        </tr>`; }).join('')}</tbody></table></div>`}
    </div>

    <div class="grid-2">
      <div class="panel">
        <div class="panel-head"><div><h2>⏰ Jours et heure</h2></div></div>
        <form onsubmit="return enregistrerReglagesRenforcement(event)">
          <div class="field"><label>Fin du renforcement (il commence à la fin des cours, ${debut.replace(':','h')})</label><input type="time" name="renforcementFin" value="${fin}"></div>
          <div class="field"><label>Jours du renforcement</label>
            <div style="display:flex;flex-wrap:wrap;gap:10px;">${JOURS_COMPLETS.slice(0,6).map((j, i) => `<label style="display:flex;align-items:center;gap:6px;font-weight:600;"><input type="checkbox" name="jourRenf" value="${i+1}" ${jours.includes(i+1)?'checked':''}> ${j}</label>`).join('')}</div>
            <div class="hint" style="margin:4px 0 0;">Les autres jours, les parents des inscrits reçoivent l’annonce normale de fin des cours.</div></div>
          <div class="form-actions"><button class="btn" type="submit">Enregistrer</button></div>
        </form>
      </div>
      <div class="panel">
        <div class="panel-head"><div><h2>✉️ Message aux parents des inscrits</h2><div class="sub">Arrive uniquement chez les parents des élèves du renforcement</div></div></div>
        <form onsubmit="return envoyerMessageRenforcement(event)">
          <div class="field"><textarea name="contenu" rows="4" required maxlength="1000" placeholder="Ex : Le cours de renforcement de vendredi est annulé."></textarea></div>
          ${sansParent.length ? `<div class="hint">⚠️ ${sansParent.length} élève(s) inscrit(s) n’ont pas de parent relié : leur parent ne recevra pas ce message.</div>` : ''}
          <div class="form-actions"><button class="btn" type="submit" ${inscrits.length ? '' : 'disabled'}>Envoyer à ${inscrits.length - sansParent.length} famille(s)</button></div>
        </form>
      </div>
    </div>
  </div>`;
}
async function majRenforcement(ids, valeur){
  if(!ids.length) return;
  const { error } = await sb.from('eleves').update({ renforcement: valeur }).in('id', ids).eq('ecole_id', session.ecoleId);
  if(error) throw error;
  DB.eleves.forEach(e => { if(ids.includes(e.id)) e.renforcement = valeur; });
}
async function enregistrerRenforcementClasse(){
  const cases = $$('.case-renf');
  try{
    await majRenforcement(cases.filter(c => c.checked).map(c => c.value), true);
    await majRenforcement(cases.filter(c => !c.checked).map(c => c.value), false);
    toast('Inscriptions au renforcement enregistrées'); renderView('renforcement');
  }catch(e){ alert('Erreur : ' + e.message); }
}
async function retirerDuRenforcement(id){
  try{ await majRenforcement([id], false); toast('Élève retiré du renforcement'); renderView('renforcement'); }
  catch(e){ alert('Erreur : ' + e.message); }
}
async function enregistrerReglagesRenforcement(ev){
  ev.preventDefault();
  const fd = new FormData(ev.target);
  const jours = fd.getAll('jourRenf').map(Number).sort();
  try{
    const { data, error } = await sb.from('horaires_annonces').upsert({ ecole_id: session.ecoleId, renforcement_fin: fd.get('renforcementFin') || '17:00', jours_renforcement: jours }, { onConflict: 'ecole_id' }).select().single();
    if(error) throw error;
    DB.horairesAnnonces = rowToCamel(data);
    toast('Réglages du renforcement enregistrés'); renderView('renforcement');
  }catch(e){ alert('Erreur : ' + e.message); }
  return false;
}
async function envoyerMessageRenforcement(ev){
  ev.preventDefault();
  const contenu = new FormData(ev.target).get('contenu').trim();
  const cibles = DB.eleves.filter(e => e.statut === 'Actif' && e.renforcement && parentsDeLEleve(e.id).length);
  if(!cibles.length) return alert('Aucun élève inscrit n’a de parent relié.'), false;
  if(!confirm(`Envoyer ce message aux parents de ${cibles.length} élève(s) du renforcement ?`)) return false;
  try{
    const lignes = cibles.map(e => ({ destinataire_type: 'parent', eleve_id: e.id, contenu: '📘 Renforcement — ' + contenu, auteur_nom: signatureAuteur() }));
    const { data, error } = await sb.from('messages_internes').insert(lignes).select();
    if(error) throw error;
    DB.messagesInternes = rowsToCamel(data).concat(DB.messagesInternes || []);
    notifierParentsPush(cibles.map(e => e.id), '📘 Renforcement — ' + contenu);
    ev.target.reset();
    toast(`Message envoyé à ${cibles.length} famille(s)`);
  }catch(e){ alert('Erreur : ' + e.message); }
  return false;
}
/* =====================================================================
   VIE DE L'ÉCOLE (schema.sql section 54) — fil de publications avec
   photos et vidéos des événements, J'aime / Bravo et commentaires.
   Les fichiers sont dans un stockage PRIVÉ : on les affiche avec des
   liens temporaires (1 h) réservés aux comptes de l'école.
   ===================================================================== */
const FIL_PAGE = 8;
const VIDEO_MAX_OCTETS = 25 * 1024 * 1024;
function estGestionnaireFil(){ return ['secretariat','direction','fondation'].includes(ui.role); }
function nouveauFil(){ return { pubs: [], medias: {}, urls: {}, reactions: {}, commentaires: {}, fin: false, charge: false, ouverts: {} }; }
async function chargerFil(suite){
  if(!DB.fil || !suite) DB.fil = nouveauFil();
  const f = DB.fil;
  const { data: pubs, error } = await sb.from('publications').select('*').eq('ecole_id', session.ecoleId)
    .order('created_at', { ascending: false }).range(f.pubs.length, f.pubs.length + FIL_PAGE - 1);
  if(error) throw error;
  const nouvelles = rowsToCamel(pubs);
  f.fin = nouvelles.length < FIL_PAGE;
  f.charge = true;
  if(!nouvelles.length) return;
  const ids = nouvelles.map(p => p.id);
  const [medias, reactions, commentaires] = await Promise.all([
    sb.from('publication_medias').select('*').in('publication_id', ids).order('ordre'),
    sb.from('publication_reactions').select('publication_id, user_id, type').in('publication_id', ids),
    sb.from('publication_commentaires').select('*').in('publication_id', ids).order('created_at'),
  ]);
  rowsToCamel(medias.data || []).forEach(m => (f.medias[m.publicationId] = f.medias[m.publicationId] || []).push(m));
  rowsToCamel(reactions.data || []).forEach(r => (f.reactions[r.publicationId] = f.reactions[r.publicationId] || []).push(r));
  rowsToCamel(commentaires.data || []).forEach(c => (f.commentaires[c.publicationId] = f.commentaires[c.publicationId] || []).push(c));
  const chemins = rowsToCamel(medias.data || []).filter(m => m.type !== 'youtube').map(m => m.chemin);
  if(chemins.length){
    const { data: liens } = await sb.storage.from('publications').createSignedUrls(chemins, 3600);
    (liens || []).forEach(l => { if(l.signedUrl) f.urls[l.path] = l.signedUrl; });
  }
  f.pubs = f.pubs.concat(nouvelles);
}
function urlMedia(m){ return m.type === 'youtube' ? `https://img.youtube.com/vi/${encodeURIComponent(m.chemin)}/hqdefault.jpg` : (DB.fil.urls[m.chemin] || ''); }
function renderMediasPublication(p){
  const medias = DB.fil.medias[p.id] || [];
  if(!medias.length) return '';
  const visibles = medias.slice(0, 4), reste = medias.length - 4;
  return `<div class="fil-medias fil-medias-${Math.min(medias.length, 4)}">${visibles.map((m, i) => `
    <button type="button" class="fil-media" onclick="ouvrirVisionneuse('${p.id}', ${i})" aria-label="Agrandir">
      ${m.type === 'photo' ? `<img src="${escapeHtml(urlMedia(m))}" alt="" loading="lazy">`
        : m.type === 'youtube' ? `<img src="${escapeHtml(urlMedia(m))}" alt="" loading="lazy"><span class="fil-play" aria-hidden="true">▶</span>`
        : `<video src="${escapeHtml(urlMedia(m))}#t=0.5" preload="metadata" muted playsinline></video><span class="fil-play" aria-hidden="true">▶</span>`}
      ${i === 3 && reste > 0 ? `<span class="fil-plus">+${reste}</span>` : ''}
    </button>`).join('')}</div>`;
}
function renderCommentaires(p){
  const coms = DB.fil.commentaires[p.id] || [];
  return `<div class="fil-commentaires">
    ${coms.map(c => `<div class="fil-com"><strong>${escapeHtml(c.auteurNom || 'Parent')}</strong> ${escapeHtml(c.texte)}
      <span class="fil-com-date">${new Date(c.createdAt).toLocaleDateString('fr-FR', {day:'numeric', month:'short'})}</span>
      ${(c.userId === session.userId || estGestionnaireFil()) ? `<button type="button" class="fil-com-suppr" onclick="supprimerCommentaire('${p.id}','${c.id}')" aria-label="Supprimer">✕</button>` : ''}</div>`).join('')}
    <form class="fil-com-form" onsubmit="return envoyerCommentaire(event, '${p.id}')">
      <input name="texte" maxlength="500" required placeholder="Écrire un commentaire…" autocomplete="off">
      <button class="btn sm" type="submit">Publier</button>
    </form>
  </div>`;
}
function renderPublication(p){
  const f = DB.fil;
  const reacs = f.reactions[p.id] || [];
  const nb = t => reacs.filter(r => r.type === t).length;
  const moi = t => reacs.some(r => r.type === t && r.userId === session.userId);
  const coms = (f.commentaires[p.id] || []).length;
  const cible = p.classeIds && p.classeIds.length ? p.classeIds.map(classeName).join(', ') : 'Toute l’école';
  return `<article class="fil-carte" id="pub-${p.id}">
    <header class="fil-tete">
      <div class="fil-avatar" aria-hidden="true">${DB.meta?.logo ? `<img src="${escapeHtml(DB.meta.logo)}" alt="">` : 'E'}</div>
      <div class="fil-qui"><strong>${escapeHtml(DB.meta?.nomEcole || 'École')}</strong>
        <span>${new Date(p.createdAt).toLocaleDateString('fr-FR', {day:'numeric', month:'long'})}${p.dateEvenement ? ' · événement du ' + fmtDate(p.dateEvenement) : ''} · ${escapeHtml(cible)}</span></div>
      ${estGestionnaireFil() ? menuPlus([{ label: 'Supprimer la publication', danger: true, onclick: `supprimerPublication('${p.id}')` }]) : ''}
    </header>
    <h3 class="fil-titre">${escapeHtml(p.titre)}</h3>
    ${p.texte ? `<p class="fil-texte">${escapeHtml(p.texte)}</p>` : ''}
    ${renderMediasPublication(p)}
    <div class="fil-actions">
      <button type="button" class="fil-btn ${moi('coeur') ? 'actif' : ''}" onclick="basculerReaction('${p.id}','coeur')" aria-pressed="${moi('coeur')}">❤️ <span>${nb('coeur') || ''}</span> J’aime</button>
      <button type="button" class="fil-btn ${moi('bravo') ? 'actif' : ''}" onclick="basculerReaction('${p.id}','bravo')" aria-pressed="${moi('bravo')}">👏 <span>${nb('bravo') || ''}</span> Bravo</button>
      <button type="button" class="fil-btn" onclick="basculerCommentaires('${p.id}')">💬 ${coms || ''} Commenter</button>
    </div>
    ${f.ouverts[p.id] ? renderCommentaires(p) : ''}
  </article>`;
}
function renderFilContenu(){
  const f = DB.fil;
  if(!f || !f.charge) return '<div class="hint">Chargement des publications…</div>';
  if(!f.pubs.length) return `<div class="empty-state"><div class="em-ic">📷</div>Aucune publication pour l’instant.${estGestionnaireFil() ? ' Publiez le premier événement ci-dessus.' : ' Les photos et vidéos des événements de l’école apparaîtront ici.'}</div>`;
  return f.pubs.map(renderPublication).join('') + (f.fin ? '' : `<div class="form-actions" style="justify-content:center;"><button class="btn secondary" onclick="chargerFil(true).then(rafraichirFil)">Voir plus de publications</button></div>`);
}
function rafraichirFil(){ const z = document.getElementById('filContenu'); if(z) z.innerHTML = renderFilContenu(); }
function rafraichirPublication(id){
  const el = document.getElementById('pub-' + id), p = (DB.fil?.pubs || []).find(x => x.id === id);
  if(el && p) el.outerHTML = renderPublication(p);
}
function demarrerFil(){
  if(DB.fil && DB.fil.charge) return;
  chargerFil(false).then(rafraichirFil).catch(e => { const z = document.getElementById('filContenu'); if(z) z.innerHTML = `<div class="hint">Erreur : ${escapeHtml(e.message)}</div>`; });
}
async function basculerReaction(pubId, type){
  const f = DB.fil, liste = f.reactions[pubId] = f.reactions[pubId] || [];
  const deja = liste.find(r => r.type === type && r.userId === session.userId);
  try{
    if(deja){
      const { error } = await sb.from('publication_reactions').delete().eq('publication_id', pubId).eq('user_id', session.userId).eq('type', type);
      if(error) throw error;
      f.reactions[pubId] = liste.filter(r => r !== deja);
    } else {
      const { error } = await sb.from('publication_reactions').insert({ publication_id: pubId, type });
      if(error) throw error;
      liste.push({ publicationId: pubId, userId: session.userId, type });
      if(navigator.vibrate) try{ navigator.vibrate(15); }catch(_e){}
    }
    rafraichirPublication(pubId);
  }catch(e){ toast('Erreur : ' + e.message); }
}
function basculerCommentaires(pubId){ DB.fil.ouverts[pubId] = !DB.fil.ouverts[pubId]; rafraichirPublication(pubId); }
async function envoyerCommentaire(ev, pubId){
  ev.preventDefault();
  const champ = ev.target.querySelector('input'), texte = champ.value.trim();
  if(!texte) return false;
  try{
    const { data, error } = await sb.from('publication_commentaires').insert({ publication_id: pubId, texte, auteur_nom: signatureAuteur() }).select().single();
    if(error) throw error;
    (DB.fil.commentaires[pubId] = DB.fil.commentaires[pubId] || []).push(rowToCamel(data));
    rafraichirPublication(pubId);
  }catch(e){ toast('Erreur : ' + e.message); }
  return false;
}
async function supprimerCommentaire(pubId, comId){
  if(!confirm('Supprimer ce commentaire ?')) return;
  try{
    const { error } = await exigerEffet(sb.from('publication_commentaires').delete().eq('id', comId));
    if(error) throw error;
    DB.fil.commentaires[pubId] = (DB.fil.commentaires[pubId] || []).filter(c => c.id !== comId);
    rafraichirPublication(pubId);
  }catch(e){ toast('Erreur : ' + e.message); }
}
// --- Visionneuse plein écran (photos, vidéos, YouTube), glisser pour changer ---
let visionneuse = null;
function ouvrirVisionneuse(pubId, index){
  visionneuse = { medias: DB.fil.medias[pubId] || [], index };
  let el = document.getElementById('visionneuse');
  if(!el){ el = document.createElement('div'); el.id = 'visionneuse'; el.className = 'visionneuse'; document.body.appendChild(el);
    let x0 = null;
    el.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; }, { passive: true });
    el.addEventListener('touchend', e => { if(x0 === null) return; const dx = e.changedTouches[0].clientX - x0; if(Math.abs(dx) > 50) changerMedia(dx < 0 ? 1 : -1); x0 = null; });
    document.addEventListener('keydown', e => { if(!visionneuse) return; if(e.key === 'Escape') fermerVisionneuse(); if(e.key === 'ArrowRight') changerMedia(1); if(e.key === 'ArrowLeft') changerMedia(-1); });
  }
  afficherVisionneuse();
}
function afficherVisionneuse(){
  const el = document.getElementById('visionneuse'), { medias, index } = visionneuse, m = medias[index];
  el.innerHTML = `
    <button type="button" class="vis-fermer" onclick="fermerVisionneuse()" aria-label="Fermer">✕</button>
    <div class="vis-scene">${m.type === 'photo' ? `<img src="${escapeHtml(urlMedia(m))}" alt="">`
      : m.type === 'youtube' ? `<iframe src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(m.chemin)}?autoplay=1&rel=0" allow="autoplay; encrypted-media; fullscreen" allowfullscreen title="Vidéo"></iframe>`
      : `<video src="${escapeHtml(urlMedia(m))}" controls autoplay playsinline></video>`}</div>
    ${medias.length > 1 ? `<button type="button" class="vis-nav vis-prec" onclick="changerMedia(-1)" aria-label="Précédent">‹</button>
      <button type="button" class="vis-nav vis-suiv" onclick="changerMedia(1)" aria-label="Suivant">›</button>
      <div class="vis-compteur">${index + 1} / ${medias.length}</div>` : ''}`;
  el.classList.add('ouverte');
}
function changerMedia(sens){ if(!visionneuse) return; const n = visionneuse.medias.length; visionneuse.index = (visionneuse.index + sens + n) % n; afficherVisionneuse(); }
function fermerVisionneuse(){ const el = document.getElementById('visionneuse'); if(el){ el.classList.remove('ouverte'); el.innerHTML = ''; } visionneuse = null; }

// --- Console parent : onglet « Vie de l'école » ---
function renderFilParent(){
  return `<div class="view active parent-accueil">
    <h2 class="parent-greeting" style="margin-bottom:var(--sp-2);">📸 Vie de l’école</h2>
    <div class="groupe-tete groupe-tete-seule groupe-public">${icone('school')}<div><h2>Informations publiques de l’école</h2><span>Les mêmes pour tous les parents. Les informations de votre enfant restent dans « C’est vous seul qui voyez ces informations » (onglet Accueil).</span></div></div>
    <div id="filContenu">${renderFilContenu()}</div>
  </div>`;
}
// --- Application école : page « Vie de l'école » (publier + gérer) ---
function renderVieEcole(){
  setTimeout(demarrerFil, 0);
  const classes = DB.classes || [];
  return `<div class="view active">
    ${estGestionnaireFil() ? `<div class="panel">
      <div class="panel-head"><div><h2>Publier un événement</h2><div class="sub">Visible uniquement par les parents et le personnel de l’école</div></div></div>
${boutonRemplissage('publication', "SCHEMA_PUBLICATION", 'formPublication')}
      <form id="formPublication" onsubmit="return publierEvenement(event)" class="form-sections">
        <fieldset class="form-section"><legend><span class="fs-num">1</span>Titre et date</legend>
          <div class="form-grid">
            <div class="field"><label for="pubTitre">Titre</label><input id="pubTitre" name="titre" required minlength="2" maxlength="150" placeholder="Ex : Fête de fin d’année"></div>
            <div class="field"><label for="pubDate">Date de l’événement</label><input id="pubDate" type="date" name="dateEvenement" value="${todayISO()}"></div>
          </div></fieldset>
        <fieldset class="form-section"><legend><span class="fs-num">2</span>Texte</legend>
          <div class="field"><label for="pubTexte">Racontez l’événement (facultatif)</label><textarea id="pubTexte" name="texte" rows="3" maxlength="3000" placeholder="Ce qui s’est passé, ce dont les parents doivent se souvenir…"></textarea></div></fieldset>
        <fieldset class="form-section"><legend><span class="fs-num">3</span>Photos et vidéos</legend>
          <label class="zone-envoi">
            <input type="file" name="fichiers" accept="image/*,video/mp4,video/quicktime,video/webm" multiple onchange="const n=this.files.length; this.closest('.zone-envoi').querySelector('.ze-etat').textContent = n ? n + (n > 1 ? ' fichiers choisis' : ' fichier choisi') : 'Aucun fichier choisi'; this.closest('.zone-envoi').classList.toggle('rempli', n > 0)">
            <span class="ze-ic" aria-hidden="true">${icone('camera')}</span>
            <span class="ze-txt"><strong>Ajouter des photos ou des vidéos</strong><small>Touchez ici pour choisir dans la galerie</small></span>
            <span class="ze-etat">Aucun fichier choisi</span>
          </label>
          <div class="hint" style="margin:6px 0 0;">Les photos sont allégées automatiquement. Vidéos : 25 Mo maximum (environ 1 minute) ; pour une vidéo plus longue, mettez-la sur YouTube en « non répertoriée » et collez le lien ci-dessous.</div>
          <div class="field" style="margin-top:12px;"><label for="pubYoutube">Lien YouTube (facultatif)</label><input id="pubYoutube" name="youtube" placeholder="https://youtu.be/…"></div></fieldset>
        <fieldset class="form-section"><legend><span class="fs-num">4</span>Qui peut voir ?</legend>
          <div class="segmente seg-radio" role="radiogroup" aria-label="Qui peut voir ?">
            <label class="seg"><input type="radio" name="cible" value="tous" checked onchange="document.getElementById('choixClassesPub').style.display='none'">Toute l’école</label>
            <label class="seg"><input type="radio" name="cible" value="classes" onchange="document.getElementById('choixClassesPub').style.display='flex'">Certaines classes</label>
          </div>
          <div id="choixClassesPub" class="choix-classes" style="display:none;">${classes.map(c => `<label class="puce-case"><input type="checkbox" name="classe" value="${c.id}"><span>${escapeHtml(c.nom)}</span></label>`).join('')}</div>
          <div class="hint" style="margin:10px 0 0;">${icone('lock')} Droit à l’image : ne publiez que des enfants dont les parents sont d’accord.</div></fieldset>
        <div id="progressionPub" class="hint"></div>
        <div class="form-actions"><button class="btn" type="submit" id="btnPublier">Publier</button></div>
      </form>
    </div>` : ''}
    <div class="fil-colonne"><div id="filContenu">${renderFilContenu()}</div></div>
  </div>`;
}
function idYoutube(lien){
  const m = String(lien || '').match(/(?:youtu\.be\/|v=|shorts\/|embed\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}
async function compresserPhoto(fichier){
  const img = await new Promise((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = ko; i.src = URL.createObjectURL(fichier); });
  const max = 1600, r = Math.min(1, max / Math.max(img.width, img.height));
  const c = document.createElement('canvas'); c.width = Math.round(img.width * r); c.height = Math.round(img.height * r);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  URL.revokeObjectURL(img.src);
  return await new Promise(ok => c.toBlob(ok, 'image/jpeg', 0.82));
}
async function publierEvenement(ev){
  ev.preventDefault();
  const fd = new FormData(ev.target), bouton = document.getElementById('btnPublier'), prog = document.getElementById('progressionPub');
  const fichiers = Array.from(ev.target.querySelector('input[name=fichiers]').files || []);
  const yt = fd.get('youtube') ? idYoutube(fd.get('youtube')) : null;
  if(fd.get('youtube') && !yt) return alert('Ce lien YouTube n’est pas reconnu.'), false;
  const tropGrosses = fichiers.filter(f => f.type.startsWith('video/') && f.size > VIDEO_MAX_OCTETS);
  if(tropGrosses.length) return alert(`Vidéo trop lourde (${tropGrosses.map(f => f.name).join(', ')}) : 25 Mo maximum. Raccourcissez-la, ou mettez-la sur YouTube et collez le lien.`), false;
  const classeIds = fd.get('cible') === 'classes' ? fd.getAll('classe') : null;
  if(classeIds && !classeIds.length) return alert('Cochez au moins une classe.'), false;
  bouton.disabled = true;
  let pubId = null; const chemins = [];
  try{
    const { data: pub, error } = await sb.from('publications').insert({ titre: fd.get('titre').trim(), texte: (fd.get('texte') || '').trim(),
      date_evenement: fd.get('dateEvenement') || null, classe_ids: classeIds, auteur_nom: signatureAuteur() }).select().single();
    if(error) throw error;
    pubId = pub.id;
    const lignes = [];
    for(const [i, f] of fichiers.entries()){
      prog.textContent = `Envoi ${i + 1} / ${fichiers.length}…`;
      const video = f.type.startsWith('video/');
      const contenu = video ? f : await compresserPhoto(f);
      const ext = video ? (f.name.split('.').pop() || 'mp4').toLowerCase() : 'jpg';
      const chemin = `${session.ecoleId}/${pubId}/${crypto.randomUUID()}.${ext}`;
      const { error: errUp } = await sb.storage.from('publications').upload(chemin, contenu, { contentType: video ? f.type : 'image/jpeg', upsert: false });
      if(errUp) throw errUp;
      chemins.push(chemin);
      lignes.push({ publication_id: pubId, type: video ? 'video' : 'photo', chemin, ordre: i });
    }
    if(yt) lignes.push({ publication_id: pubId, type: 'youtube', chemin: yt, ordre: lignes.length });
    if(lignes.length){ const { error: errM } = await sb.from('publication_medias').insert(lignes); if(errM) throw errM; }
    // Notification aux parents concernés
    const eleves = DB.eleves.filter(e => e.statut === 'Actif' && (!classeIds || classeIds.includes(e.classeId))).map(e => e.id);
    notifierParentsPush(eleves, `📸 Nouvelle publication : ${fd.get('titre').trim()}`);
    prog.textContent = '';
    toast('Publication en ligne ✅');
    DB.fil = null;
    renderView('vie-ecole');
  }catch(e){
    // Annulation propre : rien de publié à moitié
    if(chemins.length) await sb.storage.from('publications').remove(chemins).catch(() => {});
    if(pubId) await sb.from('publications').delete().eq('id', pubId);
    bouton.disabled = false; prog.textContent = '';
    alert('Erreur : ' + e.message);
  }
  return false;
}
async function supprimerPublication(id){
  if(!confirm('Supprimer cette publication et ses photos / vidéos ?')) return;
  try{
    const chemins = (DB.fil.medias[id] || []).filter(m => m.type !== 'youtube').map(m => m.chemin);
    if(chemins.length) await sb.storage.from('publications').remove(chemins);
    const { error } = await exigerEffet(sb.from('publications').delete().eq('id', id));
    if(error) throw error;
    DB.fil.pubs = DB.fil.pubs.filter(p => p.id !== id);
    rafraichirFil(); toast('Publication supprimée');
  }catch(e){ alert('Erreur : ' + e.message); }
}
/* =====================================================================
   « À TRAITER » — tableau de bord du secrétariat et de la direction
   Compte (sans rien télécharger d'autre) ce qui attend une action.
   ===================================================================== */
const SUJETS_A_TRAITER = [
  { cle:'classes-ens', ic:'✍️', lib:'enseignant(s) inscrit(s) depuis sa console : classes à valider', vue:'enseignants', table:'enseignants', filtre: q => q.not('classes_demandees', 'eq', '{}') },
  { cle:'acces-ens', ic:'👩‍🏫', lib:'inscription(s) enseignant à valider', vue:'enseignants', table:'demandes_acces', filtre: q => q.eq('statut', 'en_attente').eq('role_demande', 'enseignant') },
  { cle:'acces-par', ic:'👪', lib:'inscription(s) parent à valider', vue:'liens-parents', table:'demandes_acces', filtre: q => q.eq('statut', 'en_attente').eq('role_demande', 'parent') },
  { cle:'acces', ic:'🔑', lib:'demande(s) d’accès portier à valider', vue:'parametres', table:'demandes_acces', filtre: q => q.eq('statut', 'en_attente').eq('role_demande', 'portier'), roles:['direction','fondation'] },
  { cle:'preinsc', ic:'📥', lib:'pré-inscription(s) à rappeler', vue:'eleves', table:'preinscriptions', filtre: q => q.eq('statut', 'nouvelle') },
  { cle:'docs', ic:'📄', lib:'document(s) demandé(s) par les parents', vue:'eleves', table:'demandes_documents', filtre: q => q.eq('statut', 'en_attente') },
  { cle:'corr', ic:'✏️', lib:'correction(s) de fiche proposée(s)', vue:'eleves', table:'corrections_fiches', filtre: q => q.eq('statut', 'en_attente') },
  { cle:'msg', ic:'✉️', lib:'message(s) de parents non lu(s)', vue:'messagerie', table:'messages_internes', filtre: q => q.eq('destinataire_type', 'ecole').eq('lu', false) },
  { cle:'objets', ic:'🎒', lib:'objet(s) perdu(s) signalé(s)', vue:'messagerie', table:'objets_perdus', filtre: q => q.eq('statut', 'signale') },
];
function chargerATraiter(){
  if(DB.aTraiter && DB.aTraiter.charge && Date.now() - DB.aTraiter.charge < 60000) return;
  DB.aTraiter = Object.assign(DB.aTraiter || {}, { charge: Date.now() });
  const sujets = SUJETS_A_TRAITER.filter(s => !s.roles || s.roles.includes(ui.role));
  Promise.all(sujets.map(s => s.filtre(sb.from(s.table).select('*', { count:'exact', head:true }).eq('ecole_id', session.ecoleId))
    .then(r => [s.cle, r.error ? 0 : (r.count || 0)], () => [s.cle, 0])))
    .then(res => { DB.aTraiter.compteurs = Object.fromEntries(res); if(ui.currentView === 'dashboard') renderView('dashboard'); });
}
function renderATraiter(){
  if(!['secretariat','direction','fondation'].includes(ui.role)) return '';
  chargerATraiter();
  const c = DB.aTraiter?.compteurs;
  if(!c) return '';
  const items = SUJETS_A_TRAITER.filter(s => (c[s.cle] || 0) > 0);
  if(!items.length) return `<div class="panel" style="padding:10px 16px;"><span class="hint" style="margin:0;">✅ Rien en attente : aucune demande de parent ou de famille à traiter.</span></div>`;
  return `<div class="panel a-traiter">
    <div class="panel-head"><div><h2>📥 À traiter</h2><div class="sub">Demandes qui attendent une action de l’école.</div></div></div>
    <div class="a-traiter-liste">${items.map(s => `<button type="button" class="a-traiter-item" onclick="DB.aTraiter.charge=0; go('${s.vue}')"><span class="a-traiter-ic">${s.ic}</span><strong>${c[s.cle]}</strong> ${s.lib}<span class="a-traiter-fleche">›</span></button>`).join('')}</div>
  </div>`;
}
/* =====================================================================
   DEMANDES DE DOCUMENTS PAR LES PARENTS (schema.sql section 72)
   ===================================================================== */
const TYPES_DOCUMENT = { certificat_scolarite: 'Certificat de scolarité', autre: 'Autre document' };
const STATUTS_DOCUMENT = { en_attente:['En préparation','amber'], pret:['Prêt à retirer','green'], remis:['Remis',''], refuse:['Non disponible','red'] };
// --- Console parent ---
function ouvrirDemandeDocument(){
  const enfants = DB.eleves || [];
  const demandes = (DB.demandesDocuments || []).slice().sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  openModal('📄 Demander un document', `
    <p class="hint" style="margin-top:0;">Le secrétariat prépare le document ; vous êtes prévenu(e) dès qu’il est prêt à retirer.</p>
    <form onsubmit="return envoyerDemandeDocument(event)">
      ${enfants.length > 1 ? `<div class="field"><label>Enfant</label><select name="eleveId" required>${enfants.map(e => `<option value="${e.id}">${escapeHtml(eleveFullName(e))}</option>`).join('')}</select></div>`
        : `<input type="hidden" name="eleveId" value="${enfants[0]?.id || ''}">`}
      <div class="field"><label>Document</label><select name="type">${Object.entries(TYPES_DOCUMENT).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>
      <div class="field"><label>Précision (facultatif)</label><input name="precision" maxlength="300" placeholder="Ex : 2 exemplaires, pour la CNPS, attestation de fréquentation…"></div>
      <button class="btn" type="submit" style="width:100%;">Envoyer la demande</button>
    </form>
    ${demandes.length ? `<h4 style="margin:var(--sp-4) 0 var(--sp-2);">Vos demandes</h4>${demandes.map(d => { const e = enfants.find(x => x.id === d.eleveId); const st = STATUTS_DOCUMENT[d.statut] || ['', '']; return `<div class="actu-carte" style="justify-content:space-between;margin-bottom:6px;"><div class="actu-corps"><div class="actu-titre">${escapeHtml(TYPES_DOCUMENT[d.type] || d.type)} — ${escapeHtml(e ? e.prenom : '')}</div><div class="actu-meta">Demandé le ${fmtDate(String(d.createdAt).slice(0, 10))}${d.precision ? ' · ' + escapeHtml(d.precision) : ''}</div></div><span class="badge ${st[1]}">${st[0]}</span></div>`; }).join('')}` : ''}`);
}
async function envoyerDemandeDocument(ev){
  ev.preventDefault();
  const fd = new FormData(ev.target);
  try{
    const { data, error } = await sb.from('demandes_documents').insert({ eleve_id: fd.get('eleveId'), type: fd.get('type'), precision: (fd.get('precision') || '').trim() }).select().single();
    if(error) throw error;
    DB.demandesDocuments = (DB.demandesDocuments || []).concat(rowToCamel(data));
    sb.functions.invoke('notifier-personnel', { body: { type: 'document' } }).catch(() => {});
    toast('Demande envoyée au secrétariat'); ouvrirDemandeDocument();
  }catch(err){ alert('Erreur : ' + err.message); }
  return false;
}
// --- École : Élèves & Inscriptions ---
function renderDemandesDocuments(){
  if(!['secretariat','direction','fondation'].includes(ui.role)) return '';
  if(DB.demandesDocuments === undefined){
    DB.demandesDocuments = null;
    sb.from('demandes_documents').select('*').eq('ecole_id', session.ecoleId).in('statut', ['en_attente','pret']).order('created_at')
      .then(({ data }) => { DB.demandesDocuments = rowsToCamel(data || []); if(ui.currentView === 'eleves' && DB.demandesDocuments.length) renderView('eleves'); });
  }
  const liste = (DB.demandesDocuments || []).filter(d => d.statut === 'en_attente' || d.statut === 'pret');
  if(!liste.length) return '';
  return `<div class="panel">
    <div class="panel-head"><div><h2>📄 Documents demandés par les parents (${liste.length})</h2><div class="sub">Préparez le document, marquez-le « prêt » (le parent est prévenu), puis « remis » quand il est retiré.</div></div></div>
    <div class="table-wrap"><table>
      <thead><tr><th>Élève</th><th>Document</th><th>Statut</th><th></th></tr></thead>
      <tbody>${liste.map(d => { const e = eleveById(d.eleveId); const st = STATUTS_DOCUMENT[d.statut] || ['', '']; return `<tr>
        <td>${e ? `<strong>${escapeHtml(eleveFullName(e))}</strong><br><span class="hint">${escapeHtml(classeName(e.classeId))}</span>` : '—'}</td>
        <td>${escapeHtml(TYPES_DOCUMENT[d.type] || d.type)}${d.precision ? `<br><span class="hint">« ${escapeHtml(d.precision)} »</span>` : ''}<br><span class="hint">demandé le ${fmtDate(String(d.createdAt).slice(0, 10))}</span></td>
        <td><span class="badge ${st[1]}">${st[0]}</span></td>
        <td style="white-space:nowrap;">
          ${d.type === 'certificat_scolarite' && e ? `<button class="btn secondary sm" onclick="ouvrirCertificatScolarite('${e.id}')">📄 Préparer</button>` : ''}
          ${d.statut === 'en_attente' ? `<button class="btn sm" onclick="statutDemandeDocument('${d.id}','pret')">✓ Prêt</button> <button class="btn secondary sm" title="Document non disponible" onclick="statutDemandeDocument('${d.id}','refuse')">✕</button>` : `<button class="btn sm" onclick="statutDemandeDocument('${d.id}','remis')">Remis</button>`}
        </td></tr>`; }).join('')}</tbody></table></div>
  </div>`;
}
async function statutDemandeDocument(id, statut){
  const d = (DB.demandesDocuments || []).find(x => x.id === id);
  if(!d) return;
  let motif = '';
  if(statut === 'refuse'){ motif = prompt('Expliquez brièvement au parent pourquoi (il recevra ce message) :', ''); if(motif === null) return; }
  try{
    const { error } = await exigerEffet(sb.from('demandes_documents').update({ statut, traite_at: new Date().toISOString() }).eq('id', id));
    if(error) throw error;
    d.statut = statut;
    const e = eleveById(d.eleveId);
    const doc = TYPES_DOCUMENT[d.type] || 'document';
    if(statut === 'pret' || statut === 'refuse'){
      const texte = statut === 'pret'
        ? `📄 Le ${doc.toLowerCase()} de ${e ? e.prenom : 'votre enfant'} est prêt : vous pouvez le retirer au secrétariat.`
        : `📄 Votre demande (${doc.toLowerCase()} de ${e ? e.prenom : 'votre enfant'}) n’a pas pu être satisfaite${motif ? ' : ' + motif : '.'}`;
      await sb.from('messages_internes').insert({ destinataire_type: 'parent', eleve_id: d.eleveId, contenu: texte, auteur_nom: DB.meta?.nomEcole || '' });
      notifierParentsPush([d.eleveId], texte);
    }
    toast(statut === 'pret' ? 'Parent prévenu : document prêt' : statut === 'remis' ? 'Document remis' : 'Parent prévenu');
    renderView('eleves');
  }catch(err){ alert('Erreur : ' + err.message); }
}
/* =====================================================================
   NOTES : CAMPS DE BASE + COMPOSITION → BULLETIN (schema.sql section 78)
   Moyenne de classe = moyenne (ramenée sur 20) de toutes les notes de
   « Camps de base » (devoirs, exercices de classe, exercices de maison,
   interrogations) ; moyenne de la matière = (classe + 2 × composition) / 3.
   ===================================================================== */
const TYPES_BASE = ['Devoir','Exercice de classe','Exercice de maison','Interrogation'];
const ICONES_EVAL = { 'Devoir':'📝', 'Exercice de classe':'✏️', 'Exercice de maison':'🏠', 'Interrogation':'❓' };
function sur20(n){ return Number(n.note) * 20 / (Number(n.noteSur) || 20); }
function moyenneMatiere(eleveId, matiere, trimestre){
  const notes = (DB.notes || []).filter(n => n.eleveId === eleveId && n.matiere === matiere && n.trimestre === trimestre && n.note != null);
  const base = notes.filter(n => TYPES_BASE.includes(n.type)), compos = notes.filter(n => n.type === 'Composition');
  const moyClasse = base.length ? base.reduce((s, n) => s + sur20(n), 0) / base.length : null;
  const compo = compos.length ? compos.reduce((s, n) => s + sur20(n), 0) / compos.length : null;
  const moy = moyClasse !== null && compo !== null ? (moyClasse + 2 * compo) / 3 : (moyClasse ?? compo);
  return { classe: moyClasse, nbClasse: base.length, compo, moy };
}

/* ---------- 🏕️ CAMPS DE BASE ---------- */
function renderCampsDeBase(){
  const mesClasses = classesVisibles();
  if(!mesClasses.length) return `<div class="view active"><div class="panel"><div class="empty-state"><div class="em-ic">🏕️</div>Aucune classe : activez un niveau dans Paramètres, ou faites valider vos classes par la direction.</div></div></div>`;
  chargerAgenda();
  const f = ui.filters.camps || { classeId: mesClasses[0].id, matiere: '', trimestre: trimestreCourant(), auto: true };
  if(f.auto) f.trimestre = trimestreCourant();
  if(!mesClasses.some(c => c.id === f.classeId)) f.classeId = mesClasses[0].id;
  const matieres = MATIERES_BY_CYCLE[classeCycle(f.classeId)] || [];
  if(!matieres.includes(f.matiere)) f.matiere = matieres[0] || '';
  ui.filters.camps = f;
  if(DB.evaluations === undefined){
    DB.evaluations = null;
    sb.from('evaluations').select('*').eq('ecole_id', session.ecoleId).order('date')
      .then(({ data }) => { DB.evaluations = rowsToCamel(data || []); if(ui.currentView === 'camps-de-base') renderView('camps-de-base'); });
  }
  const evals = (DB.evaluations || []).filter(e => e.classeId === f.classeId && e.matiere === f.matiere && e.trimestre === f.trimestre)
    .sort((a, b) => a.date.localeCompare(b.date));
  const eleves = DB.eleves.filter(e => e.classeId === f.classeId && e.statut === 'Actif').sort((a, b) => eleveFullName(a).localeCompare(eleveFullName(b)));
  const noteDe = (ev, el) => (DB.notes || []).find(n => n.evaluationId === ev.id && n.eleveId === el.id);
  const ouverte = evals.find(e => e.id === ui.filters.campsEval);
  const sel = (nom, opts, val) => `<select onchange="ui.filters.camps.${nom}=this.value; ui.filters.campsEval=null; renderView('camps-de-base')">${opts.map(o => `<option value="${escapeHtml(o[0])}" ${o[0] === val ? 'selected' : ''}>${escapeHtml(o[1])}</option>`).join('')}</select>`;
  return `<div class="view active">
    <details class="section-note camps-aide"><summary>🎯 <strong>Camps de base</strong> : notez ici les devoirs, exercices et interrogations. Ils font la <strong>moyenne de classe</strong> du bulletin. <span class="lien-discret">Comment est calculée la moyenne ?</span></summary>
      <p>Moyenne de classe = moyenne de toutes les notes de Camps de base (ramenées sur 20). Moyenne de la matière = (moyenne de classe + 2 × composition) ÷ 3. Les compositions se saisissent dans « Compositions et bulletins ».</p></details>
    <div class="panel">
      ${ouverte ? '' : `<div class="camps-choix">
        ${mesClasses.length > 1 ? `<div class="camps-ligne"><span class="camps-lib">Classe</span><div class="dv-puces">${mesClasses.map(c => `<button type="button" class="dv-puce${c.id === f.classeId ? ' actif' : ''}" data-val="${escapeHtml(c.id)}" onclick="campsChoisir('classeId', this.dataset.val)">${escapeHtml(c.nom)}</button>`).join('')}</div></div>` : ''}
        <div class="camps-ligne"><span class="camps-lib">Matière</span><div class="dv-puces">${matieres.map(m => `<button type="button" class="dv-puce${m === f.matiere ? ' actif' : ''}" data-val="${escapeHtml(m)}" onclick="campsChoisir('matiere', this.dataset.val)">${escapeHtml(m)}</button>`).join('')}</div></div>
        <div class="camps-ligne"><span class="camps-lib">Trimestre</span><div class="dv-puces">${TRIMESTRES.map(t => `<button type="button" class="dv-puce${t === f.trimestre ? ' actif' : ''}" data-val="${t}" onclick="campsChoisir('trimestre', this.dataset.val)">${libelleTrimestre(t)}${t === trimestreCourant() ? ' (en cours)' : ''}</button>`).join('')}</div></div>
      </div>`}
      ${DB.evaluations === null ? '<div class="hint">Chargement…</div>' : ouverte ? renderSaisieEvaluation(ouverte, eleves, noteDe) : `
      <div class="panel-head" style="margin-top:8px;"><div><h2>${escapeHtml(f.matiere)} — ${escapeHtml(classeName(f.classeId))}</h2><div class="sub">${evals.length} évaluation(s) · ${eleves.length} élève(s) · ${libelleTrimestre(f.trimestre)}</div></div>
        <button class="btn camps-nouvelle" onclick="ouvrirNouvelleEvaluation()">+ Ajouter des notes</button></div>
      ${!evals.length ? '<div class="empty-state"><div class="em-ic">🎯</div>Aucune note pour cette matière et ce trimestre.<br>Touchez « + Ajouter des notes » : choisissez le type (devoir, exercice…), puis tapez la note de chaque élève.</div>' : `
      <div class="table-wrap"><table class="camps-table">
        <thead><tr><th>Élève</th>${evals.map(ev => `<th class="camps-col" title="${escapeHtml(ev.titre || ev.type)}"><button class="lien-btn" onclick="ui.filters.campsEval='${ev.id}'; renderView('camps-de-base')">${ICONES_EVAL[ev.type] || ''} ${fmtDate(ev.date).slice(0, 5)}<br><span class="hint">/${Number(ev.noteSur)}</span></button></th>`).join('')}<th>Moy. classe /20</th></tr></thead>
        <tbody>${eleves.map(el => { const m = moyenneMatiere(el.id, f.matiere, f.trimestre); return `<tr>
          <td>${escapeHtml(eleveFullName(el))}</td>
          ${evals.map(ev => { const n = noteDe(ev, el); return `<td class="camps-col">${n && n.note != null ? Number(n.note) : '<span class="hint">—</span>'}</td>`; }).join('')}
          <td><strong class="${m.classe !== null ? moyenneClass(m.classe) : ''}">${m.classe !== null ? m.classe.toFixed(2) : '—'}</strong></td></tr>`; }).join('')}</tbody>
        <tfoot><tr><td><strong>Moyenne de la classe</strong></td>${evals.map(ev => { const ns = eleves.map(el => noteDe(ev, el)).filter(n => n && n.note != null); return `<td class="camps-col">${ns.length ? (ns.reduce((s, n) => s + Number(n.note), 0) / ns.length).toFixed(1) : '—'}</td>`; }).join('')}<td></td></tr></tfoot>
      </table></div>
      <div class="hint" style="margin-top:8px;">Pour corriger une note : touchez la date de l’évaluation, en haut de sa colonne.</div>`}`}
    </div>
  </div>`;
}
function campsChoisir(champ, valeur){
  const f = ui.filters.camps; if(!f) return;
  f[champ] = valeur; if(champ === 'trimestre') f.auto = false;
  ui.filters.campsEval = null; renderView('camps-de-base');
}
function trimestreCourant(){
  if((DB.agenda || []).some(e => /fin du\s*1/i.test(e.titre || ''))) return trimestreDeDate(todayISO());
  const m = new Date().getMonth() + 1; // septembre-décembre : T1 ; janvier-mars : T2 ; avril-juillet : T3
  return m >= 8 ? 'Trimestre 1' : m <= 3 ? 'Trimestre 2' : 'Trimestre 3';
}
function renderSaisieEvaluation(ev, eleves, noteDe){
  return `<div class="panel-head" style="margin-top:8px;"><div><h2>${ICONES_EVAL[ev.type] || ''} ${escapeHtml(ev.type)}${ev.titre ? ' — ' + escapeHtml(ev.titre) : ''}</h2><div class="sub">${fmtDate(ev.date)} · noté sur ${Number(ev.noteSur)} · ${escapeHtml(ev.matiere)} · ${escapeHtml(ev.trimestre)}</div></div>
      <button class="btn secondary sm" onclick="ui.filters.campsEval=null; renderView('camps-de-base')">← Retour au tableau</button></div>
    ${blocRemplissageNotes('camps', eleves.map(e => e.id), Number(ev.noteSur))}
    <form onsubmit="return enregistrerNotesEvaluation(event, '${ev.id}')" oninput="majCompteurNotes(this)">
      <div class="camps-compteur" aria-live="polite"><span id="campsCompteur">${eleves.filter(el => { const n = noteDe(ev, el); return n && n.note != null; }).length}</span> note(s) sur ${eleves.length} élève(s) · Tapez une note puis « Entrée » (ou ↵) pour passer à l’élève suivant.</div>
      <div class="table-wrap"><table>
        <thead><tr><th>Élève</th><th>Note / ${Number(ev.noteSur)}</th></tr></thead>
        <tbody>${eleves.map((el, i) => { const n = noteDe(ev, el); return `<tr><td>${escapeHtml(eleveFullName(el))}</td>
          <td><input type="number" inputmode="decimal" name="n_${el.id}" min="0" max="${Number(ev.noteSur)}" step="0.25" value="${n && n.note != null ? Number(n.note) : ''}" class="camps-note" enterkeyhint="next" onkeydown="if(event.key==='Enter'){ event.preventDefault(); const s=document.querySelectorAll('[name^=n_]')[${i + 1}]; if(s) s.focus(); }" aria-label="Note de ${escapeHtml(eleveFullName(el))}"></td></tr>`; }).join('')}</tbody>
      </table></div>
      <div class="hint">Laissez vide pour un élève absent ou non noté (il ne compte pas dans sa moyenne).</div>
      <div class="form-actions">
        <button type="button" class="btn danger" onclick="supprimerEvaluation('${ev.id}')">Supprimer l’évaluation</button>
        <button class="btn" type="submit">Enregistrer les notes</button></div>
    </form>`;
}
/* ---------- Notes : remplissage intelligent depuis la fiche de notes (photo, PDF, Excel) ----------
   Un champ par élève : « note obtenue par NOM Prénom (sur X) ». Garde-fous : note entre 0 et X (sinon
   écartée), une case DÉJÀ remplie n'est jamais écrasée (elle est signalée), absent = case laissée vide. */
const champNote = (mode, id) => mode === 'camps' ? document.querySelector(`[name="n_${id}"]`) : document.querySelector(`#tableNotes .nt-note[data-eleve="${id}"]`);
function schemaNotes(ids, sur){
  return ids.map(eleveById).filter(Boolean).slice(0, 60).map(e => ({ name: 'note_' + e.id, label: `Note obtenue par l’élève ${String(e.nom || '').toUpperCase()} ${e.prenom || ''} (sur ${sur}) — seulement si son nom figure dans le document ; absent ou non noté = null`, type: 'note', max: sur, format: `nombre entre 0 et ${sur}, décimales possibles (ex. 12,5)` }));
}
function blocRemplissageNotes(mode, ids, sur){
  if(!ids.length || !(['secretariat', 'direction', 'fondation'].includes(ui.role) || (ui.role === 'enseignant' && session.enseignantId))) return '';
  window.__notesSf = { mode, ids, sur };
  return `<div class="choix-remplissage" role="group" aria-label="Comment saisir les notes" onclick="if(this.classList.contains('cr-replie')) this.classList.remove('cr-replie')">
    <span class="cr-question">Comment voulez-vous saisir les notes ?</span>
    <div class="cr-modes">
      <button type="button" class="cr-mode cr-intelligent btn-sf" onclick="ouvrirRemplissageIntelligent('notes-${mode}', schemaNotes(window.__notesSf.ids, window.__notesSf.sur), (r) => appliquerNotesLues(r))">
        <span class="cr-ic">${icone('sparkles') || '✨'}</span><strong>Remplissage intelligent</strong><small>Photo de votre fiche de notes ou de la liste de la classe (ou fichier Excel, PDF) : chaque note va sur la ligne de l’élève.</small></button>
      <button type="button" class="cr-mode cr-manuel" onclick="this.closest('.choix-remplissage').classList.add('cr-replie'); const c = champNote(window.__notesSf.mode, window.__notesSf.ids[0]); if(c) c.focus()">
        <span class="cr-ic">${icone('pencil') || '✍️'}</span><strong>Remplissage manuel</strong><small>Vous tapez la note de chaque élève.</small></button>
    </div>
  </div>`;
}
function appliquerNotesLues(resultat){
  const { mode, sur } = window.__notesSf || {}; if(!mode) return;
  let poses = 0, aVerifier = 0; const dejaLa = [], horsBareme = [];
  Object.keys(resultat || {}).forEach(cle => {
    if(!cle.startsWith('note_')) return;
    const { valeur, confiance } = resultat[cle] || {};
    if(valeur == null || valeur === '') return;
    const id = cle.slice(5), champ = champNote(mode, id), e = eleveById(id), nom = e ? eleveFullName(e) : 'Un élève';
    if(!champ) return;
    const n = Number(String(valeur).replace(',', '.'));
    if(!Number.isFinite(n) || n < 0 || n > sur){ horsBareme.push(`${nom} : ${valeur}`); return; }
    if(String(champ.value).trim() !== ''){ if(Number(String(champ.value).replace(',', '.')) !== n) dejaLa.push(`${nom} : ${champ.value} déjà saisi, ${String(n).replace('.', ',')} lu`); return; }
    champ.value = mode === 'compo' ? String(n).replace('.', ',') : n;
    champ.dispatchEvent(new Event('input', { bubbles: true })); // compteurs, AVANT la couleur (une saisie à la main l'efface ensuite)
    champ.classList.remove('champ-pre-rempli', 'champ-a-verifier');
    champ.classList.add('champ-pre-rempli'); if(confiance !== 'élevé'){ champ.classList.add('champ-a-verifier'); aVerifier++; }
    champ.addEventListener('input', () => champ.classList.remove('champ-pre-rempli', 'champ-a-verifier'), { once: true });
    poses++;
  });
  const bloc = document.querySelector('.choix-remplissage'); if(bloc) bloc.classList.add('cr-replie');
  const avis = [];
  if(dejaLa.length) avis.push(`Notes déjà saisies, NON modifiées (corrigez à la main si besoin) :\n${dejaLa.join('\n')}`);
  if(horsBareme.length) avis.push(`Écartées, en dehors du barème (0 à ${sur}) :\n${horsBareme.join('\n')}`);
  if(avis.length) alert(avis.join('\n\n'));
  toast(poses ? `${poses} note(s) pré-remplie(s)${aVerifier ? `, dont ${aVerifier} à vérifier (en orange)` : ''} — relisez puis « Enregistrer les notes »` : 'Aucune nouvelle note trouvée pour les élèves de cette liste');
}
function ouvrirNouvelleEvaluation(){
  const f = ui.filters.camps;
  openModal('🎯 Ajouter des notes', `
    <form onsubmit="return creerEvaluation(event)">
      <p class="hint" style="margin-top:0;">${escapeHtml(classeName(f.classeId))} · ${escapeHtml(f.matiere)} · ${escapeHtml(f.trimestre)}</p>
      <div class="form-grid">
        <div class="field span2"><label>Quel type de note ?</label><div class="dv-puces" role="radiogroup">${TYPES_BASE.map((t, i) => `<label class="dv-puce${i === 0 ? ' actif' : ''}"><input type="radio" name="type" value="${t}" ${i === 0 ? 'checked' : ''} class="sr-only" onchange="choisirPuceRadio(this)">${ICONES_EVAL[t]} ${t}</label>`).join('')}</div></div>
        <div class="field span2"><label>Noté sur</label><div class="dv-puces" role="radiogroup">${[5, 10, 20, 40, 50, 100].map(v => `<label class="dv-puce${v === 20 ? ' actif' : ''}"><input type="radio" name="noteSur" value="${v}" ${v === 20 ? 'checked' : ''} class="sr-only" onchange="choisirPuceRadio(this)">${v}</label>`).join('')}</div></div>
        <div class="field"><label>Date</label><input type="date" name="date" required value="${todayISO()}" max="${todayISO()}"></div>
        <div class="field"><label>Titre (facultatif)</label><input name="titre" maxlength="120" placeholder="Ex : Les fractions"></div>
      </div>
      <div class="form-actions"><button type="button" class="btn secondary" onclick="closeModal()">Annuler</button><button class="btn" type="submit">Continuer : taper les notes</button></div>
    </form>`);
}
function majCompteurNotes(form){
  const c = document.getElementById('campsCompteur'); if(!c) return;
  c.textContent = [...form.querySelectorAll('[name^=n_]')].filter(i => i.value.trim() !== '').length;
}
function choisirPuceRadio(input){
  input.closest('.dv-puces').querySelectorAll('.dv-puce').forEach(l => l.classList.toggle('actif', l.contains(input) && input.checked));
}
async function creerEvaluation(ev){
  ev.preventDefault();
  const fd = new FormData(ev.target), f = ui.filters.camps;
  try{
    const e = await dbInsert('evaluations', { classeId: f.classeId, matiere: f.matiere, trimestre: f.trimestre, type: fd.get('type'), titre: (fd.get('titre') || '').trim(), date: fd.get('date'), noteSur: Number(fd.get('noteSur')) });
    DB.evaluations = (DB.evaluations || []).concat(e);
    ui.filters.campsEval = e.id;
    closeModal(); renderView('camps-de-base');
    setTimeout(() => { const p = document.querySelector('[name^=n_]'); if(p) p.focus(); }, 50);
  }catch(err){ alert('Erreur : ' + err.message); }
  return false;
}
async function enregistrerNotesEvaluation(event, evalId){
  event.preventDefault();
  const ev = (DB.evaluations || []).find(e => e.id === evalId); if(!ev) return false;
  const bouton = event.target.querySelector('button[type=submit]'); if(bouton) bouton.disabled = true;
  let nb = 0;
  try{
    for(const input of event.target.querySelectorAll('[name^=n_]')){
      const eleveId = input.name.slice(2), brut = input.value.trim().replace(',', '.');
      const exist = (DB.notes || []).find(n => n.evaluationId === evalId && n.eleveId === eleveId);
      if(brut === ''){
        if(exist){ await dbDelete('notes', exist.id); DB.notes = DB.notes.filter(n => n.id !== exist.id); nb++; }
        continue;
      }
      const note = Number(brut);
      if(!(note >= 0 && note <= Number(ev.noteSur))){ input.focus(); throw new Error(`Note impossible (${brut}) : elle doit être entre 0 et ${Number(ev.noteSur)}.`); }
      if(exist){ if(Number(exist.note) !== note){ await dbUpdate('notes', exist.id, { note }); exist.note = note; nb++; } }
      else { DB.notes.push(await dbInsert('notes', { eleveId, matiere: ev.matiere, note, noteSur: Number(ev.noteSur), trimestre: ev.trimestre, type: ev.type, date: ev.date, evaluationId: ev.id })); nb++; }
    }
    toast(nb ? `${nb} note(s) enregistrée(s)` : 'Aucun changement');
    if(nb && DB.meta?.notesContinuesParents){
      const notes = (DB.notes || []).filter(n => n.evaluationId === evalId).map(n => n.eleveId);
      notifierParentsPush(notes, `📝 Nouvelle note en ${ev.matiere}${ev.titre ? ' (' + ev.titre + ')' : ''} — consultez l’application.`);
    }
    ui.filters.campsEval = null; renderView('camps-de-base');
  }catch(err){ alert('Erreur : ' + err.message); if(bouton) bouton.disabled = false; }
  return false;
}
async function supprimerEvaluation(evalId){
  if(!confirm('Supprimer cette évaluation et toutes ses notes ?')) return;
  try{
    await dbDelete('evaluations', evalId);
    DB.evaluations = (DB.evaluations || []).filter(e => e.id !== evalId);
    DB.notes = (DB.notes || []).filter(n => n.evaluationId !== evalId);
    ui.filters.campsEval = null; toast('Évaluation supprimée'); renderView('camps-de-base');
  }catch(err){ alert('Erreur : ' + err.message); }
}

/* ---------- 🏆 BULLETIN OFFICIEL : coefficients, rang, statistiques ---------- */
function coefficientDe(cycle, matiere){
  const c = (DB.coefficientsMatieres || []).find(x => x.cycle === cycle && x.matiere === matiere);
  return c ? Number(c.coefficient) : 1;
}
function rangTexte(r, exAequo){ return r ? `${r}${r === 1 ? 'er' : 'e'}${exAequo ? ' ex æquo' : ''}` : '—'; }
// Résultats d'une classe pour un trimestre : moyenne pondérée, rang (ex æquo gérés), statistiques
function resultatsClasse(classeId, trimestre){
  const cycle = classeCycle(classeId);
  const matieres = MATIERES_BY_CYCLE[cycle] || [];
  const eleves = DB.eleves.filter(e => e.classeId === classeId && e.statut === 'Actif');
  const lignes = eleves.map(e => {
    let somme = 0, coefs = 0;
    const details = matieres.map(mat => {
      const m = moyenneMatiere(e.id, mat, trimestre), coef = coefficientDe(cycle, mat);
      if(m.moy !== null){ somme += m.moy * coef; coefs += coef; }
      return { matiere: mat, coef, classe: m.classe, compo: m.compo, moy: m.moy };
    });
    return { eleve: e, moyenne: coefs ? somme / coefs : null, details };
  });
  const classees = lignes.filter(l => l.moyenne !== null).sort((a, b) => b.moyenne - a.moyenne);
  classees.forEach((l, i) => {
    const egal = classees.findIndex(x => Math.abs(x.moyenne - l.moyenne) < 0.005);
    l.rang = egal + 1;
    l.exAequo = classees.filter(x => Math.abs(x.moyenne - l.moyenne) < 0.005).length > 1;
  });
  // Moyenne de chaque matière dans la classe (pour le bulletin)
  const moyMatiere = {};
  matieres.forEach(mat => { const vals = lignes.map(l => l.details.find(d => d.matiere === mat).moy).filter(v => v !== null); moyMatiere[mat] = vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null; });
  lignes.forEach(l => l.details.forEach(d => { d.moyClasseMatiere = moyMatiere[d.matiere]; }));
  const moys = classees.map(l => l.moyenne);
  return { lignes, effectif: classees.length, moyenneClasse: moys.length ? moys.reduce((s, v) => s + v, 0) / moys.length : null,
    plusForte: moys.length ? Math.max(...moys) : null, plusFaible: moys.length ? Math.min(...moys) : null };
}
const arr2 = v => v === null || v === undefined ? null : Math.round(Number(v) * 100) / 100;
// Fige les résultats (pour les parents) : appelé à la publication du trimestre
async function figerResultats(trimestre){
  const lignes = [];
  for(const c of DB.classes){
    const r = resultatsClasse(c.id, trimestre);
    for(const l of r.lignes){
      if(l.moyenne === null) continue;
      lignes.push({ eleve_id: l.eleve.id, trimestre, ecole_id: session.ecoleId, classe_id: c.id, moyenne: arr2(l.moyenne), rang: l.rang, ex_aequo: !!l.exAequo,
        effectif: r.effectif, moyenne_classe: arr2(r.moyenneClasse), plus_forte: arr2(r.plusForte), plus_faible: arr2(r.plusFaible),
        details: l.details.map(d => ({ matiere: d.matiere, coef: d.coef, classe: arr2(d.classe), compo: arr2(d.compo), moy: arr2(d.moy), moyClasse: arr2(d.moyClasseMatiere) })),
        calcule_at: new Date().toISOString() });
    }
  }
  if(!lignes.length) return 0;
  for(let i = 0; i < lignes.length; i += 200){
    const { error } = await sb.from('bulletins_resultats').upsert(lignes.slice(i, i + 200), { onConflict: 'eleve_id,trimestre' });
    if(error) throw erreurLisible(error);
  }
  DB.bulletinsResultats = (DB.bulletinsResultats || []).filter(b => b.trimestre !== trimestre).concat(rowsToCamel(lignes));
  return lignes.length;
}
// Panneau « Résultats du trimestre » (Notes & Bulletins)
function renderResultatsTrimestre(classeId, trimestre){
  const r = resultatsClasse(classeId, trimestre);
  if(!r.effectif) return '';
  const tri = r.lignes.filter(l => l.moyenne !== null).sort((a, b) => a.rang - b.rang);
  return `<div class="panel">
    <div class="panel-head"><div><h2>🏆 Résultats — ${escapeHtml(classeName(classeId))} · ${escapeHtml(trimestre)}</h2>
      <div class="sub">Moyenne de la classe ${r.moyenneClasse.toFixed(2)} · plus forte ${r.plusForte.toFixed(2)} · plus faible ${r.plusFaible.toFixed(2)} · ${r.effectif} élève(s) classé(s)</div></div>
      <button class="btn sm" onclick="imprimerBulletinsClasse('${classeId}', '${trimestre}')">🖨️ Imprimer les bulletins de la classe</button></div>
    <div class="table-wrap"><table>
      <thead><tr><th>Rang</th><th>Élève</th><th>Moyenne /20</th><th>Mention</th></tr></thead>
      <tbody>${tri.map(l => `<tr><td><strong>${rangTexte(l.rang, l.exAequo)}</strong></td><td>${escapeHtml(eleveFullName(l.eleve))}</td>
        <td><strong class="${moyenneClass(l.moyenne)}">${l.moyenne.toFixed(2)}</strong></td><td>${escapeHtml(mentionFromAvg(l.moyenne))}</td></tr>`).join('')}</tbody>
    </table></div>
  </div>`;
}
// Bulletin officiel d'un élève (une page A4)
// Matières « au choix » (Anglais OU Informatique le vendredi) : sur le bulletin d'un élève,
// celle qu'il ne suit pas (aucune note) n'apparaît pas — elle ne compte jamais dans la moyenne
const MATIERES_AU_CHOIX = ['Anglais', 'Informatique'];
function ligneBulletinUtile(matiere, moy){ return moy !== null || !MATIERES_AU_CHOIX.includes(matiere); }
// Assiduité du trimestre sur le bulletin : absences (justifiées ou non) et retards, d'après l'appel.
// Seulement quand tout l'appel de l'année est chargé (personnel) — jamais un chiffre partiel.
function assiduiteBulletinHtml(e, trimestre){
  if(!Array.isArray(DB.presencesEleves) || ui.role === 'parent') return '';
  return assiduiteHtml(DB.presencesEleves.filter(p => p.eleveId === e.id), trimestre);
}
// Parent : l'appel de l'année de SON enfant est lu seulement à l'ouverture du bulletin (RLS : ses enfants uniquement)
function assiduiteParentHtml(e, trimestre){
  DB.assiduiteParent = DB.assiduiteParent || {};
  const deja = DB.assiduiteParent[e.id];
  if(deja === undefined){
    DB.assiduiteParent[e.id] = null;
    const debut = (/^(\d{4})/.exec(DB.meta?.anneeScolaire || '') || [])[1];
    sb.from('presences_eleves').select('eleve_id,date,statut,motif').eq('eleve_id', e.id).gte('date', (debut || '2000') + '-08-01')
      .then(({ data, error }) => { DB.assiduiteParent[e.id] = error ? [] : rowsToCamel(data || []);
        document.querySelectorAll(`[data-assiduite="${e.id}"]`).forEach(z => { z.innerHTML = assiduiteHtml(DB.assiduiteParent[e.id], z.dataset.trimestre); }); });
  }
  return `<div data-assiduite="${e.id}" data-trimestre="${escapeHtml(trimestre)}">${deja ? assiduiteHtml(deja, trimestre) : ''}</div>`;
}
function assiduiteHtml(presencesEleve, trimestre){
  const debut = (/^(\d{4})/.exec(DB.meta?.anneeScolaire || '') || [])[1];
  const pres = presencesEleve.filter(p => (!debut || p.date >= debut + '-08-01') && trimestreDeDate(p.date) === trimestre);
  if(!pres.length) return `<div class="bo-assiduite"><strong>Assiduité du trimestre :</strong> appel non enregistré dans EcoMaZ pour cette période.</div>`;
  const abs = pres.filter(p => p.statut === 'Absent'), ret = pres.filter(p => p.statut === 'Retard').length;
  const justif = abs.filter(p => String(p.motif || '').trim() && !/non justifi/i.test(p.motif) && !/présent selon le parent/i.test(p.motif)).length;
  return `<div class="bo-assiduite"><strong>Assiduité du trimestre :</strong> ${abs.length ? `${abs.length} absence${abs.length > 1 ? 's' : ''} (${justif} justifiée${justif > 1 ? 's' : ''}, ${abs.length - justif} non justifiée${abs.length - justif > 1 ? 's' : ''})` : 'aucune absence'} · ${ret ? `${ret} retard${ret > 1 ? 's' : ''}` : 'aucun retard'} <span class="bo-assiduite-base">(${pres.length} jour${pres.length > 1 ? 's' : ''} d’appel)</span></div>`;
}
function bulletinOfficielHtml(l, r, trimestre){
  const m = DB.meta || {}, e = l.eleve;
  const app = (DB.bulletinsComments || {})[`${e.id}_${trimestre}`] || '';
  const totalCoef = l.details.filter(d => d.moy !== null).reduce((s, d) => s + d.coef, 0);
  return `<section class="bulletin-page">
    <div class="recu-head">${m.logo ? `<img src="${escapeHtml(m.logo)}" alt="">` : `<div class="recu-logo-ph">🎓</div>`}
      <div><strong>${escapeHtml(m.nomEcole || '')}</strong><div class="hint">${escapeHtml(m.adresse || '')}${m.telephone ? ' · ' + escapeHtml(m.telephone) : ''}</div></div>
      <div style="margin-left:auto;text-align:right;"><strong>BULLETIN DE NOTES</strong><div class="hint">${escapeHtml(trimestre)} · ${escapeHtml(m.anneeScolaire || '')}</div></div></div>
    <div class="bo-identite"><div><span>Élève</span><strong>${escapeHtml(eleveFullName(e))}</strong></div><div><span>Matricule</span><strong>${escapeHtml(e.matricule || '—')}</strong></div>
      <div><span>Classe</span><strong>${escapeHtml(classeName(e.classeId))}</strong></div><div><span>Effectif</span><strong>${r.effectif}</strong></div></div>
    <table class="bo-table"><thead><tr><th>Matière</th><th>Coef.</th><th>Moy. classe<br><small>(camps de base)</small></th><th>Compo.</th><th>Moy. /20</th><th>Moy. × coef.</th><th>Moy. de la classe</th><th>Appréciation</th></tr></thead>
      <tbody>${l.details.filter(d => ligneBulletinUtile(d.matiere, d.moy)).map(d => `<tr><td style="text-align:left;">${escapeHtml(d.matiere)}</td><td>${d.coef}</td><td>${d.classe !== null ? d.classe.toFixed(2) : '—'}</td><td>${d.compo !== null ? d.compo.toFixed(2) : '—'}</td>
        <td><strong>${d.moy !== null ? d.moy.toFixed(2) : '—'}</strong></td><td>${d.moy !== null ? (d.moy * d.coef).toFixed(2) : '—'}</td><td>${d.moyClasseMatiere != null ? d.moyClasseMatiere.toFixed(2) : '—'}</td><td>${d.moy !== null ? escapeHtml(mentionFromAvg(d.moy)) : ''}</td></tr>`).join('')}</tbody>
      <tfoot><tr><td style="text-align:left;"><strong>Total</strong></td><td>${totalCoef}</td><td colspan="3"></td><td><strong>${l.moyenne !== null ? (l.moyenne * totalCoef).toFixed(2) : '—'}</strong></td><td colspan="2"></td></tr></tfoot></table>
    <div class="bo-synthese">
      <div><span>Moyenne générale</span><strong>${l.moyenne !== null ? l.moyenne.toFixed(2) + ' / 20' : '—'}</strong></div>
      <div><span>Rang</span><strong>${rangTexte(l.rang, l.exAequo)} sur ${r.effectif}</strong></div>
      <div><span>Mention</span><strong>${l.moyenne !== null ? escapeHtml(mentionFromAvg(l.moyenne)) : '—'}</strong></div>
      <div><span>Moyenne de la classe</span><strong>${r.moyenneClasse !== null ? r.moyenneClasse.toFixed(2) : '—'}</strong></div>
      <div><span>Plus forte / plus faible</span><strong>${r.plusForte !== null ? r.plusForte.toFixed(2) + ' / ' + r.plusFaible.toFixed(2) : '—'}</strong></div></div>
    ${assiduiteBulletinHtml(e, trimestre)}
    <div class="eb-appreciation" style="min-height:40px;"><strong>Appréciation du titulaire :</strong> ${escapeHtml(app)}</div>
    <div class="signatures"><div class="sign-box"><div class="sign-role">Le/La titulaire</div><div class="sign-line">&nbsp;</div></div>
      <div class="sign-box"><div class="sign-role">Le Directeur / La Directrice</div><div class="sign-line">${escapeHtml(m.directeurNom || '')}</div></div>
      <div class="sign-box"><div class="sign-role">Le parent</div><div class="sign-line">&nbsp;</div></div></div>
  </section>`;
}
function imprimerBulletinsClasse(classeId, trimestre){
  const r = resultatsClasse(classeId, trimestre);
  const lignes = r.lignes.filter(l => l.moyenne !== null).sort((a, b) => eleveFullName(a.eleve).localeCompare(eleveFullName(b.eleve)));
  if(!lignes.length) return alert('Aucune note pour ce trimestre dans cette classe.');
  openModal(`🖨️ Bulletins — ${classeName(classeId)} · ${trimestre}`, `
    <div class="form-actions no-print" style="justify-content:flex-start;"><button class="btn" onclick="window.print()">🖨️ Imprimer les ${lignes.length} bulletins</button><span class="hint" style="align-self:center;">Une page par élève — choisissez « Enregistrer en PDF » pour garder une copie.</span></div>
    ${lignes.map(l => bulletinOfficielHtml(l, r, trimestre)).join('')}`);
}
// Paramètres : coefficients par niveau et matière
function renderCoefficients(){
  if(!['direction','fondation'].includes(ui.role)) return '';
  const cycles = [...new Set(DB.classes.map(c => c.cycle))].filter(c => MATIERES_BY_CYCLE[c]);
  if(!cycles.length) return '';
  return `<div class="panel">
    <div class="panel-head"><div><h2>⚖️ Coefficients des matières</h2><div class="sub">Utilisés pour la moyenne générale, le rang et le bulletin officiel. Par défaut : 1.</div></div></div>
    <form onsubmit="return enregistrerCoefficients(event)">
      ${cycles.map(cy => `<h4 style="margin:12px 0 6px;">${escapeHtml(cy)}</h4><div class="coef-grille">${MATIERES_BY_CYCLE[cy].map(mat => `<label class="coef-ligne"><span>${escapeHtml(mat)}</span>
        <input type="number" min="0.5" max="10" step="0.5" name="${escapeHtml(cy + '|' + mat)}" value="${coefficientDe(cy, mat)}"></label>`).join('')}</div>`).join('')}
      <div class="form-actions"><button class="btn" type="submit">Enregistrer les coefficients</button></div>
    </form>
  </div>`;
}
async function enregistrerCoefficients(ev){
  ev.preventDefault();
  const lignes = [...new FormData(ev.target).entries()].map(([k, v]) => { const [cycle, matiere] = k.split('|'); return { ecole_id: session.ecoleId, cycle, matiere, coefficient: Number(v) }; })
    .filter(l => l.coefficient > 0 && l.coefficient <= 10);
  try{
    const { error } = await sb.from('coefficients_matieres').upsert(lignes, { onConflict: 'ecole_id,cycle,matiere' });
    if(error) throw erreurLisible(error);
    DB.coefficientsMatieres = rowsToCamel(lignes);
    toast('Coefficients enregistrés');
  }catch(e){ alert('Erreur : ' + e.message); }
  return false;
}
/* ---------- 📒 CAHIER D'APPEL (registre mensuel) ---------- */
const CYCLE_APPEL = ['', 'Présent', 'Absent', 'Retard'];
function joursDeClasseDuMois(mois){
  const [a, m] = mois.split('-').map(Number);
  const jours = DB?.horairesAnnonces?.joursCours || [1, 2, 3, 4, 5];
  const res = [];
  for(let j = 1; j <= new Date(a, m, 0).getDate(); j++){
    const d = new Date(a, m - 1, j, 12), iso = ((d.getDay() + 6) % 7) + 1;
    if(jours.includes(iso)) res.push(`${a}-${String(m).padStart(2, '0')}-${String(j).padStart(2, '0')}`);
  }
  return res;
}
function renderCahierAppel(){
  const mesClasses = classesVisibles();
  if(!mesClasses.length) return `<div class="view active"><div class="panel"><div class="empty-state"><div class="em-ic">📒</div>Aucune classe.</div></div></div>`;
  const f = ui.filters.cahier || { classeId: mesClasses[0].id, mois: thisMonthISO() };
  if(!mesClasses.some(c => c.id === f.classeId)) f.classeId = mesClasses[0].id;
  ui.filters.cahier = f;
  const jours = joursDeClasseDuMois(f.mois), auj = todayISO();
  const eleves = DB.eleves.filter(e => e.classeId === f.classeId && e.statut === 'Actif').sort((a, b) => eleveFullName(a).localeCompare(eleveFullName(b)));
  const pres = DB.presencesEleves.filter(p => p.date.startsWith(f.mois) && eleves.some(e => e.id === p.eleveId));
  const cle = (e, d) => pres.find(p => p.eleveId === e.id && p.date === d);
  const nomMois = new Date(f.mois + '-15T12:00:00').toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  // Refonte (DESIGN.md §11) : onglet « Aujourd'hui » par défaut sur téléphone, « Mois » sur ordinateur
  const onglet = ui.filters.cahierOnglet || (window.innerWidth < 900 ? 'jour' : 'mois');
  // Sur téléphone : le registre s'ouvre directement sur la colonne d'aujourd'hui
  if(onglet === 'mois') setTimeout(() => { const t = document.querySelector('.ca-table .ca-auj'); if(t && t.scrollIntoView) t.scrollIntoView({ inline: 'center', block: 'nearest' }); }, 0);
  const decale = n => { const [a, m] = f.mois.split('-').map(Number); const d = new Date(a, m - 1 + n, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
  const cellule = (e, d) => {
    const p = cle(e, d), s = p ? p.statut : '';
    const cls = s === 'Présent' ? 'ca-p' : s === 'Absent' ? 'ca-a' : s === 'Retard' ? 'ca-r' : '';
    const lettre = s === 'Présent' ? '•' : s === 'Absent' ? 'A' : s === 'Retard' ? 'R' : '';
    const futur = d > auj;
    return `<td class="ca-cell ${cls}${futur ? ' ca-futur' : ''}"${futur ? '' : ` onclick="basculerCahierAppel('${e.id}','${d}')"`} title="${escapeHtml(eleveFullName(e))} — ${fmtDate(d)}${s ? ' : ' + s : ''}${p && p.motif ? ' (' + escapeHtml(p.motif) + ')' : ''}">${lettre}</td>`;
  };
  return `<div class="view active">
    <div class="panel cahier-appel">
      <div class="panel-head no-print"><div><h2>📒 Cahier d’appel</h2><div class="sub">${onglet === 'jour' ? 'Choisissez Présent, Absent ou Retard pour chaque élève, puis validez.' : 'Touchez une case pour la changer : vide → • présent → A absent → R retard → vide. Les jours futurs sont verrouillés.'}</div></div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;">
          <button class="btn secondary sm" onclick="exporterCahierAppel()">⬇️ Excel</button>
          <button class="btn secondary sm" onclick="window.print()">🖨️ Imprimer</button></div></div>
      <div class="ca-barre no-print">
        ${choixClasse(mesClasses, f.classeId, "ui.filters.cahier.classeId=this.value; renderView('cahier-appel')")}
        <div class="segmente" role="tablist" aria-label="Affichage">${[['jour', 'Aujourd’hui'], ['mois', 'Mois']].map(([k, l]) => `<button type="button" role="tab" class="seg${onglet === k ? ' actif' : ''}" aria-selected="${onglet === k}" onclick="ui.filters.cahierOnglet='${k}'; renderView('cahier-appel')">${l}</button>`).join('')}</div>
      </div>
      ${onglet === 'jour' ? renderAppelDuJour(f.classeId, eleves) : `
      <div class="ca-mois no-print">
        <button type="button" class="ca-fleche" aria-label="Mois précédent" onclick="ui.filters.cahier.mois='${decale(-1)}'; renderView('cahier-appel')">‹</button>
        <strong>${nomMois}</strong>
        <button type="button" class="ca-fleche" aria-label="Mois suivant" onclick="ui.filters.cahier.mois='${decale(1)}'; renderView('cahier-appel')">›</button>
      </div>
      <div class="print-only"><h2>${escapeHtml(DB.meta?.nomEcole || '')} — Cahier d’appel · ${escapeHtml(classeName(f.classeId))} · <span style="text-transform:capitalize;">${nomMois}</span></h2></div>
      ${!eleves.length ? '<div class="empty-state"><div class="em-ic">📒</div>Aucun élève actif dans cette classe.</div>' : `
      <div class="table-wrap ca-defile"><table class="ca-table">
        <thead><tr><th class="ca-nom">Élève</th>${jours.map(d => `<th class="ca-jour${d === auj ? ' ca-auj' : ''}">${new Date(d + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'narrow' })}<br>${Number(d.slice(8))}</th>`).join('')}<th>Abs.</th><th>Ret.</th><th>Prés. %</th></tr></thead>
        <tbody>${eleves.map(e => { const ps = pres.filter(p => p.eleveId === e.id), a = ps.filter(p => p.statut === 'Absent').length, r = ps.filter(p => p.statut === 'Retard').length;
          return `<tr><td class="ca-nom" title="${escapeHtml(eleveFullName(e))}"><span class="ca-nom-txt">${escapeHtml(eleveFullName(e))}</span></td>${jours.map(d => cellule(e, d)).join('')}<td class="ca-tot">${a || ''}</td><td class="ca-tot">${r || ''}</td><td class="ca-tot">${ps.length ? Math.round(100 * (ps.length - a) / ps.length) + ' %' : '—'}</td></tr>`; }).join('')}</tbody>
        <tfoot><tr><td class="ca-nom"><strong>Présents</strong></td>${jours.map(d => { const ps = pres.filter(p => p.date === d); return `<td class="ca-tot">${ps.length ? ps.filter(p => p.statut !== 'Absent').length : ''}</td>`; }).join('')}<td colspan="3"></td></tr></tfoot>
      </table></div>
      <div class="ca-legende"><span><i class="ca-pastille ca-p">•</i> Présent</span><span><i class="ca-pastille ca-a">A</i> Absent</span><span><i class="ca-pastille ca-r">R</i> Retard</span><span class="hint" style="margin:0;">Une absence saisie pour aujourd’hui prévient le parent.</span></div>
      <div class="signatures print-only"><div class="sign-box"><div class="sign-role">L’enseignant(e)</div><div class="sign-line">&nbsp;</div></div><div class="sign-box"><div class="sign-role">La Direction</div><div class="sign-line">&nbsp;</div></div></div>`}`}
    </div>
  </div>`;
}
// Appel du jour dans le cahier : mêmes champs (.sel-statut, data-motif) et même
// enregistrement que l'écran « Pointage élèves » — alerte aux parents incluse.
function renderAppelDuJour(classeId, eleves, date){
  const auj = date || todayISO();
  ui.filters.presEleves = { classeId, date: auj };
  if(DB.absencesSignalees === undefined){
    DB.absencesSignalees = null;
    chargerAbsencesSignalees().then(() => { if(ui.currentView === 'cahier-appel') renderView('cahier-appel'); }).catch(() => { DB.absencesSignalees = []; });
  }
  if(!eleves.length) return '<div class="empty-state"><div class="em-ic">📒</div>Aucun élève actif dans cette classe.</div>';
  const jourIso = ((new Date(auj + 'T12:00:00').getDay() + 6) % 7) + 1;
  const jourDeClasse = (DB?.horairesAnnonces?.joursCours || [1, 2, 3, 4, 5]).includes(jourIso);
  const dejaFait = DB.presencesEleves.some(p => p.date === auj && p.classeId === classeId);
  const lignes = eleves.map(e => {
    const rec = DB.presencesEleves.find(p => p.eleveId === e.id && p.date === auj);
    const sig = absenceSignalee(e.id, auj);
    const statut = rec ? rec.statut : (sig ? 'Absent' : 'Présent');
    const motif = rec ? rec.motif : (sig ? sig.motif + (sig.commentaire ? ' — ' + sig.commentaire : '') : '');
    return `<li class="appel-ligne appel-${statut === 'Présent' ? 'present' : statut === 'Absent' ? 'absent' : 'retard'}" data-ligne="${e.id}">
      <div class="cj-eleve"><span class="lc-avatar" aria-hidden="true">${escapeHtml(initials(e.prenom, e.nom))}</span><span class="cj-nom"><strong>${escapeHtml(eleveFullName(e))}</strong>${sig ? `<small class="cj-signale">Absence signalée : ${escapeHtml(sig.motif)}</small>` : ''}</span></div>
      <div class="cj-etats" role="group" aria-label="Statut de ${escapeHtml(eleveFullName(e))}">${['Présent', 'Absent', 'Retard'].map(st => `<button type="button" class="cj-btn" data-s="${st}" onclick="choisirStatutAppel('${e.id}','${st}')">${st}</button>`).join('')}</div>
      <select class="sel-statut" data-eleve="${e.id}" hidden aria-hidden="true">${['Présent', 'Absent', 'Retard'].map(st => `<option ${statut === st ? 'selected' : ''}>${st}</option>`).join('')}</select>
      <input type="text" class="cj-motif" data-motif="${e.id}" placeholder="Motif (facultatif)" aria-label="Motif" value="${escapeHtml(motif || '')}">
    </li>`;
  }).join('');
  return `${!jourDeClasse ? `<div class="section-note">${auj === todayISO() ? 'Aujourd’hui n’est' : 'Ce jour n’est'} pas un jour de classe. Vous pouvez quand même faire l’appel si besoin.</div>` : ''}
    ${dejaFait ? (() => {
      const suivante = ui.role === 'enseignant' && auj === todayISO() ? classesVisibles().find(c => c.id !== classeId && DB.eleves.some(e => e.classeId === c.id && e.statut === 'Actif') && !DB.presencesEleves.some(p => p.classeId === c.id && p.date === auj)) : null;
      return `<div class="appel-fait" role="status"><span class="appel-fait-ic" aria-hidden="true">${icone('circle-check')}</span>
        <div class="appel-fait-txt"><strong>Appel ${auj === todayISO() ? 'd’aujourd’hui' : 'de ce jour'} enregistré.</strong><span>Vous pouvez encore le corriger : changez un statut puis validez à nouveau.</span>
        ${ui.role === 'enseignant' ? `<div class="appel-fait-actions">${suivante ? `<button type="button" class="btn sm" onclick="allerAppel('${suivante.id}','${auj}')">Appel suivant : ${escapeHtml(suivante.nom)}</button>` : ''}<button type="button" class="btn ${suivante ? 'secondary ' : ''}sm" onclick="go('dashboard')">${icone('house')} Retour à mes tâches</button></div>` : ''}</div></div>`; })() : ''}
    <div class="cj-haut"><button type="button" class="btn secondary sm" onclick="tousPresents()">${icone('check')} Tous présents</button><span class="hint" style="margin:0;">${fmtDate(auj)}</span></div>
    <ul class="cj-liste">${lignes}</ul>
    <div class="cj-valider"><span class="appel-compteur" id="appelCompteur"></span><button type="button" class="btn" id="btnValiderAppel" onclick="validerAppelDuJour()">Valider l’appel</button></div>
    ${(setTimeout(majCompteurAppel, 0), '')}`;
}
function choisirStatutAppel(eleveId, statut){
  const sel = document.querySelector(`.sel-statut[data-eleve="${eleveId}"]`); if(!sel) return;
  sel.value = statut;
  if(navigator.vibrate) try{ navigator.vibrate(10); }catch(_e){}
  majLigneAppel(eleveId);
}
async function validerAppelDuJour(){
  await savePresencesEleves();
  if(ui.currentView !== 'presences-eleves') renderView(ui.currentView);
}
async function basculerCahierAppel(eleveId, date){
  if(date > todayISO()) return;
  const e = eleveById(eleveId); if(!e) return;
  const rec = DB.presencesEleves.find(p => p.eleveId === eleveId && p.date === date);
  const suivant = CYCLE_APPEL[(CYCLE_APPEL.indexOf(rec ? rec.statut : '') + 1) % CYCLE_APPEL.length];
  if((suivant === 'Présent' || suivant === 'Retard') && !(rec && ['Présent', 'Retard'].includes(rec.statut)) && !(await verifierPositionAvantAppel(e.classeId))) return;
  try{
    if(!suivant){
      if(rec){ await dbDelete('presences_eleves', rec.id); DB.presencesEleves = DB.presencesEleves.filter(p => p.id !== rec.id); }
    } else if(rec){
      await dbUpdate('presences_eleves', rec.id, { statut: suivant }); rec.statut = suivant;
    } else {
      DB.presencesEleves.push(await dbInsert('presences_eleves', { date, classeId: e.classeId, eleveId, statut: suivant, motif: '' }));
    }
    if(suivant === 'Absent' && date === todayISO() && !absenceSignalee(eleveId, date)) envoyerNotificationAbsenceEleve(eleveId, date, '').catch(() => {});
    renderView('cahier-appel');
  }catch(err){ alert('Erreur : ' + err.message); }
}
async function exporterCahierAppel(){
  const f = ui.filters.cahier, jours = joursDeClasseDuMois(f.mois);
  const eleves = DB.eleves.filter(e => e.classeId === f.classeId && e.statut === 'Actif').sort((a, b) => eleveFullName(a).localeCompare(eleveFullName(b)));
  const lettre = s => s === 'Présent' ? 'P' : s === 'Absent' ? 'A' : s === 'Retard' ? 'R' : '';
  const lignes = [['Élève', ...jours.map(d => d.slice(8) + '/' + d.slice(5, 7)), 'Absences', 'Retards']];
  for(const e of eleves){
    const ps = DB.presencesEleves.filter(p => p.eleveId === e.id && p.date.startsWith(f.mois));
    lignes.push([eleveFullName(e), ...jours.map(d => lettre(ps.find(p => p.date === d)?.statut)), ps.filter(p => p.statut === 'Absent').length, ps.filter(p => p.statut === 'Retard').length]);
  }
  try{ await ecrireClasseurExcel([[`Appel ${f.mois}`, lignes]], `Cahier-appel_${classeName(f.classeId).replace(/\s+/g, '-')}_${f.mois}.xlsx`); }
  catch(err){ alert('Export impossible : ' + err.message); }
}
/* =====================================================================
   CERTIFICAT DE SCOLARITÉ (imprimable, depuis la fiche élève)
   ===================================================================== */
function ouvrirCertificatScolarite(eleveId){
  const e = eleveById(eleveId);
  if(!e) return;
  if(e.statut && e.statut !== 'Actif') return alert(`${eleveFullName(e)} n’est pas inscrit(e) actuellement (statut : ${e.statut}) : pas de certificat de scolarité.`);
  const m = DB.meta || {};
  const feminin = e.sexe === 'F';
  const signataire = m.directeurNom || '……………………………';
  const ville = (m.adresse || '').split(/[,–-]/).map(x => x.trim()).filter(Boolean).pop() || '……………';
  const numero = `CS-${String(m.anneeScolaire || new Date().getFullYear()).replace(/\s+/g, '')}-${e.matricule || e.id.slice(0, 6).toUpperCase()}`;
  openModal('📄 Certificat de scolarité', `
    <div class="recu certif">
      <div class="recu-head">
        ${m.logo ? `<img src="${escapeHtml(m.logo)}" alt="">` : `<div class="recu-logo-ph">🎓</div>`}
        <div><strong>${escapeHtml(m.nomEcole || '')}</strong>
          <div class="hint">${escapeHtml(m.adresse || '')}${m.telephone ? ' · ' + escapeHtml(m.telephone) : ''}</div></div>
      </div>
      <div class="recu-title">CERTIFICAT DE SCOLARITÉ</div>
      <div class="hint" style="text-align:center;margin:-6px 0 14px;">N° ${escapeHtml(numero)}</div>
      <p>Je soussigné(e), <strong>${escapeHtml(signataire)}</strong>, Directeur / Directrice de l’établissement <strong>${escapeHtml(m.nomEcole || '')}</strong>, certifie que :</p>
      <p style="text-align:center;font-size:1.15em;margin:14px 0;"><strong>${escapeHtml(String(e.nom || '').toUpperCase())} ${escapeHtml(e.prenom || '')}</strong></p>
      <p>${feminin ? 'née' : 'né'} le <strong>${e.dateNaissance ? fmtDate(e.dateNaissance) : '……………'}</strong>, matricule <strong>${escapeHtml(e.matricule || '—')}</strong>,
        est régulièrement ${feminin ? 'inscrite' : 'inscrit'} dans notre établissement en classe de <strong>${escapeHtml(classeName(e.classeId))}</strong>
        pour l’année scolaire <strong>${escapeHtml(m.anneeScolaire || '')}</strong>${e.dateInscription ? `, depuis le <strong>${fmtDate(e.dateInscription)}</strong>` : ''}.</p>
      <p>En foi de quoi, le présent certificat lui est délivré pour servir et valoir ce que de droit.</p>
      <p style="text-align:right;margin-top:18px;">Fait à ${escapeHtml(ville)}, le ${fmtDate(todayISO())}</p>
      <div class="signatures">
        <div class="sign-box"><div class="sign-role">Cachet de l’établissement</div><div class="sign-line">&nbsp;</div></div>
        <div class="sign-box"><div class="sign-role">Le Directeur / La Directrice</div><div class="sign-line">${escapeHtml(signataire)}</div></div>
      </div>
    </div>
    ${!e.dateNaissance ? '<div class="hint no-print" style="color:var(--amber);">⚠️ Date de naissance manquante sur la fiche : complétez-la avant d’imprimer.</div>' : ''}
    <div class="form-actions no-print"><button type="button" class="btn secondary" onclick="closeModal()">Fermer</button><button type="button" class="btn" onclick="window.print()">🖨️ Imprimer</button></div>`);
}
/* =====================================================================
   PRÉ-INSCRIPTIONS EN LIGNE (schema.sql section 71, page preinscription.html)
   ===================================================================== */
const STATUTS_PREINSCRIPTION = { nouvelle:['Nouvelle','amber'], contactee:['Contactée','blue'], inscrite:['Inscrite','green'], refusee:['Sans suite',''] };
function lienPreinscription(){ return new URL('preinscription.html?ecole=' + encodeURIComponent(session.ecoleId), location.href).href; }
function partagerPreinscription(){
  const lien = lienPreinscription();
  const message = `📝 Pré-inscriptions ouvertes à ${DB.meta?.nomEcole || 'notre école'} ! Remplissez le formulaire en ligne, nous vous rappelons : ${lien}`;
  openModal('📝 Lien de pré-inscription', `
    <p>Partagez ce lien sur WhatsApp, Facebook ou par SMS. Les familles remplissent le formulaire sans créer de compte ; les demandes arrivent ici, dans Élèves & Inscriptions.</p>
    <div class="hint" style="word-break:break-all;user-select:all;">${escapeHtml(lien)}</div>
    <div class="form-actions" style="flex-wrap:wrap;">
      <button class="btn secondary" onclick="navigator.clipboard && navigator.clipboard.writeText(${jsArg(lien)}).then(() => toast('Lien copié'))">📋 Copier le lien</button>
      <a class="btn" href="https://wa.me/?text=${encodeURIComponent(message)}" target="_blank" rel="noopener">📲 Partager sur WhatsApp</a>
      <a class="btn secondary" href="${lien}" target="_blank" rel="noopener">👁️ Voir le formulaire</a>
      <button class="btn secondary" onclick="imprimerAffiche('preinscription.html')">🖨️ Affiche A4</button>
    </div>`);
}
function renderPreinscriptions(){
  if(!['secretariat','direction','fondation'].includes(ui.role)) return '';
  if(DB.preinscriptions === undefined){
    DB.preinscriptions = null;
    sb.from('preinscriptions').select('*').eq('ecole_id', session.ecoleId).order('created_at', { ascending:false }).limit(200)
      .then(({ data }) => { DB.preinscriptions = rowsToCamel(data || []); if(ui.currentView === 'eleves') renderView('eleves'); });
  }
  const tous = ui.filters.preinscriptionsToutes;
  const liste = (DB.preinscriptions || []).filter(p => tous || p.statut === 'nouvelle' || p.statut === 'contactee');
  const nouvelles = (DB.preinscriptions || []).filter(p => p.statut === 'nouvelle').length;
  return `<div class="panel">
    <div class="panel-head"><div><h2>📥 Pré-inscriptions en ligne${nouvelles ? ` <span class="badge amber">${nouvelles} nouvelle(s)</span>` : ''}</h2><div class="sub">Les familles remplissent le formulaire public ; rappelez-les puis « Inscrire » pour créer la fiche.</div></div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;"><button class="btn sm" onclick="partagerPreinscription()">📝 Lien à partager</button>
      ${(DB.preinscriptions || []).length ? `<button class="btn secondary sm" onclick="ui.filters.preinscriptionsToutes=${!tous}; renderView('eleves')">${tous ? 'En cours seulement' : 'Tout afficher'}</button>` : ''}</div></div>
    ${DB.preinscriptions === null ? '<div class="hint">Chargement…</div>' : !liste.length ? '<div class="hint">Aucune demande en cours. Partagez le lien pour recevoir des pré-inscriptions.</div>' : `<div class="table-wrap"><table>
      <thead><tr><th>Enfant</th><th>Parent</th><th>Statut</th><th></th></tr></thead>
      <tbody>${liste.map(p => { const st = STATUTS_PREINSCRIPTION[p.statut] || ['', '']; const tels = telephonesWhatsapp(p.parentTel); return `<tr>
        <td><strong>${escapeHtml(p.enfantPrenom)} ${escapeHtml(p.enfantNom)}</strong><br><span class="hint">${p.classeSouhaitee ? escapeHtml(p.classeSouhaitee) + ' · ' : ''}${p.dateNaissance ? 'né(e) le ' + fmtDate(p.dateNaissance) + ' · ' : ''}reçue le ${fmtDate(String(p.createdAt).slice(0, 10))}</span>${p.message ? `<br><span class="hint">« ${escapeHtml(p.message)} »</span>` : ''}</td>
        <td>${escapeHtml(p.parentNom)}<br><a href="tel:${escapeHtml(p.parentTel.replace(/[^\d+]/g, ''))}">${escapeHtml(p.parentTel)}</a></td>
        <td><span class="badge ${st[1]}">${st[0]}</span></td>
        <td style="white-space:nowrap;">
          ${tels.length ? `<a class="btn secondary sm" target="_blank" rel="noopener" onclick="statutPreinscription('${p.id}','contactee', true)" href="https://wa.me/${tels[0]}?text=${encodeURIComponent(`Bonjour ${p.parentNom}, ici ${DB.meta?.nomEcole || 'l’école'}. Nous avons bien reçu la pré-inscription de ${p.enfantPrenom}. `)}">📲</a>` : ''}
          ${p.statut !== 'inscrite' ? `<button class="btn sm" onclick="inscrireDepuisPreinscription('${p.id}')">Inscrire</button>` : ''}
          ${p.statut === 'nouvelle' || p.statut === 'contactee' ? `<button class="btn secondary sm" title="Sans suite" onclick="statutPreinscription('${p.id}','refusee')">✕</button>` : ''}
        </td></tr>`; }).join('')}</tbody></table></div>`}
  </div>`;
}
async function statutPreinscription(id, statut, silencieux){
  const p = (DB.preinscriptions || []).find(x => x.id === id);
  if(!p || (silencieux && p.statut !== 'nouvelle')) return;
  if(statut === 'refusee' && !confirm('Classer cette demande sans suite ?')) return;
  try{
    const { error } = await exigerEffet(sb.from('preinscriptions').update({ statut }).eq('id', id));
    if(error) throw error;
    p.statut = statut;
    if(!silencieux) toast('Demande mise à jour');
    renderView('eleves');
  }catch(e){ alert('Erreur : ' + e.message); }
}
function inscrireDepuisPreinscription(id){
  const p = (DB.preinscriptions || []).find(x => x.id === id);
  if(!p) return;
  openEleveForm(null);
  ui._preinscriptionId = id;
  const f = document.getElementById('formEleve');
  if(!f) return;
  const mettre = (nom, v) => { const c = f.querySelector(`[name="${nom}"]`); if(c && v) c.value = v; };
  mettre('prenom', p.enfantPrenom); mettre('nom', p.enfantNom); mettre('sexe', p.sexe); mettre('dateNaissance', p.dateNaissance);
  mettre('parentNom', p.parentNom); mettre('parentTel', p.parentTel);
  const classe = DB.classes.find(c => c.nom === p.classeSouhaitee);
  if(classe) mettre('classeId', classe.id);
  toast('Fiche pré-remplie : vérifiez puis enregistrez');
}
/* =====================================================================
   MENU DE LA CANTINE (schema.sql section 70)
   ===================================================================== */
function joursSemaineCantine(decalage){
  const lundi = debutSemaine(new Date()); lundi.setDate(lundi.getDate() + 7 * (decalage || 0));
  return [0, 1, 2, 3, 4].map(i => { const d = new Date(lundi); d.setDate(lundi.getDate() + i); return isoLocal(d); });
}
function renderCantine(){
  const dec = ui.filters.cantineSemaine || 0;
  const jours = joursSemaineCantine(dec);
  const cle = jours[0];
  DB.menusCantine = (DB.menusCantine && !Array.isArray(DB.menusCantine)) ? DB.menusCantine : {};
  if(DB.menusCantine[cle] === undefined){
    DB.menusCantine[cle] = null;
    sb.from('menus_cantine').select('*').eq('ecole_id', session.ecoleId).gte('date', jours[0]).lte('date', jours[4])
      .then(({ data }) => { DB.menusCantine[cle] = rowsToCamel(data || []); if(ui.currentView === 'cantine') renderView('cantine'); });
  }
  const menus = DB.menusCantine[cle];
  const gestion = ['secretariat','direction','fondation'].includes(ui.role);
  const jourLong = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('fr-FR', { weekday:'long', day:'numeric', month:'long' });
  return `<div class="view active"><div class="panel">
    <div class="panel-head"><div><h2>🍽️ Menu de la semaine</h2><div class="sub">Du ${fmtDate(jours[0])} au ${fmtDate(jours[4])} — les parents voient le menu du jour et du lendemain sur l’accueil de leur application.</div></div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;">
        <button class="btn secondary sm" onclick="ui.filters.cantineSemaine=${dec - 1}; renderView('cantine')">← Semaine précédente</button>
        ${dec !== 0 ? `<button class="btn secondary sm" onclick="ui.filters.cantineSemaine=0; renderView('cantine')">Cette semaine</button>` : ''}
        <button class="btn secondary sm" onclick="ui.filters.cantineSemaine=${dec + 1}; renderView('cantine')">Semaine suivante →</button></div></div>
    ${menus === null ? '<div class="hint">Chargement…</div>' : `${gestion ? boutonRemplissage('cantine', "schemaCantine('formCantine')", 'formCantine') : ''}<form id="formCantine" onsubmit="return enregistrerMenusCantine(event, '${cle}')">
      <div class="table-wrap"><table>
        <thead><tr><th>Jour</th><th>Repas</th><th>Goûter</th></tr></thead>
        <tbody>${jours.map(iso => { const m = menus.find(x => x.date === iso) || {}; return `<tr>
          <td style="white-space:nowrap;text-transform:capitalize;">${jourLong(iso)}</td>
          <td><input name="repas_${iso}" maxlength="300" value="${escapeHtml(m.repas || '')}" placeholder="Ex : Riz sauce graine, poisson" ${gestion ? '' : 'disabled'}></td>
          <td><input name="gouter_${iso}" maxlength="200" value="${escapeHtml(m.gouter || '')}" placeholder="Ex : Banane, bouillie" ${gestion ? '' : 'disabled'}></td>
        </tr>`; }).join('')}</tbody></table></div>
      ${gestion ? `<label style="display:flex;align-items:center;gap:8px;margin-top:8px;"><input type="checkbox" name="prevenir"> Prévenir les parents par une notification (« le menu de la semaine est en ligne »)</label>
      <div class="form-actions"><button type="button" class="btn secondary" onclick="copierMenusSemainePrecedente()">Copier la semaine précédente</button><button class="btn" type="submit">Enregistrer le menu</button></div>` : ''}
    </form>`}
  </div></div>`;
}
async function enregistrerMenusCantine(ev, cle){
  ev.preventDefault();
  const fd = new FormData(ev.target);
  const jours = joursSemaineCantine(ui.filters.cantineSemaine || 0);
  const pleins = [], vides = [];
  jours.forEach(iso => {
    const repas = (fd.get('repas_' + iso) || '').trim(), gouter = (fd.get('gouter_' + iso) || '').trim();
    if(repas || gouter) pleins.push({ date: iso, repas, gouter, maj_at: new Date().toISOString() }); else vides.push(iso);
  });
  try{
    if(pleins.length){ const { error } = await sb.from('menus_cantine').upsert(pleins.map(p => ({ ...p, ecole_id: session.ecoleId }))); if(error) throw error; }
    if(vides.length){ const { error } = await sb.from('menus_cantine').delete().eq('ecole_id', session.ecoleId).in('date', vides); if(error) throw error; }
    DB.menusCantine[cle] = pleins.map(p => ({ date: p.date, repas: p.repas, gouter: p.gouter }));
    if(fd.get('prevenir') === 'on' && pleins.length){
      notifierParentsPush(DB.eleves.filter(e => e.statut === 'Actif').map(e => e.id), `🍽️ Le menu de la cantine du ${fmtDate(jours[0])} au ${fmtDate(jours[4])} est en ligne dans l’application.`);
    }
    toast('Menu enregistré'); renderView('cantine');
  }catch(e){ alert('Erreur : ' + e.message); }
  return false;
}
async function copierMenusSemainePrecedente(){
  const dec = ui.filters.cantineSemaine || 0;
  const avant = joursSemaineCantine(dec - 1), cible = joursSemaineCantine(dec);
  try{
    const { data, error } = await sb.from('menus_cantine').select('*').eq('ecole_id', session.ecoleId).gte('date', avant[0]).lte('date', avant[4]);
    if(error) throw error;
    if(!data || !data.length) return alert('La semaine précédente n’a pas de menu.');
    data.forEach(m => {
      const i = avant.indexOf(m.date); if(i < 0) return;
      const r = document.querySelector(`[name="repas_${cible[i]}"]`), g = document.querySelector(`[name="gouter_${cible[i]}"]`);
      if(r && !r.value) r.value = m.repas || '';
      if(g && !g.value) g.value = m.gouter || '';
    });
    toast('Menus copiés — vérifiez puis enregistrez');
  }catch(e){ alert('Erreur : ' + e.message); }
}
// Console parent : menu du jour et du prochain jour de classe
function renderMenuParent(){
  const menus = DB.menusCantine;
  if(!Array.isArray(menus) || !menus.length) return '';
  const auj = todayISO(), demain = prochainJourClasse();
  const libDemain = demain === isoDansJours(1) ? 'Demain' : new Date(demain + 'T12:00:00').toLocaleDateString('fr-FR', { weekday:'long' });
  const liste = [[auj, 'Aujourd’hui'], [demain, libDemain]].map(([iso, lib]) => ({ lib, m: menus.find(x => x.date === iso) })).filter(x => x.m);
  if(!liste.length) return '';
  return `<section class="panel actus-panel" aria-labelledby="titreMenu">
    <div class="panel-head"><div><h2 id="titreMenu">🍽️ À la cantine</h2></div></div>
    ${liste.map(({ lib, m }) => `<div class="menu-jour"><span class="menu-lib">${escapeHtml(lib)}</span>
      <div>${m.repas ? `🍛 ${escapeHtml(m.repas)}` : ''}${m.gouter ? `<div class="hint" style="margin:2px 0 0;">🍌 Goûter : ${escapeHtml(m.gouter)}</div>` : ''}</div></div>`).join('')}
  </section>`;
}
/* =====================================================================
   ÉLÈVES À SURVEILLER : absences répétées (tableau de bord)
   3 absences ou plus sur les 30 derniers jours, ou absent aux 2 derniers
   appels de sa classe. Bouton WhatsApp (gratuit) pour joindre le parent.
   ===================================================================== */
function elevesASurveiller(){
  const ids = classesVisibles().map(c => c.id);
  const depuis = new Date(); depuis.setDate(depuis.getDate() - 30);
  const limite = `${depuis.getFullYear()}-${String(depuis.getMonth()+1).padStart(2,'0')}-${String(depuis.getDate()).padStart(2,'0')}`;
  const recentes = DB.presencesEleves.filter(p => p.date >= limite);
  return DB.eleves.filter(e => e.statut === 'Actif' && ids.includes(e.classeId)).map(e => {
    const siennes = recentes.filter(p => p.eleveId === e.id).sort((a, b) => b.date.localeCompare(a.date));
    const absences = siennes.filter(p => p.statut === 'Absent');
    const signalees = absences.filter(p => absenceSignalee(e.id, p.date)).length;
    const suite = siennes.length >= 2 && siennes[0].statut === 'Absent' && siennes[1].statut === 'Absent';
    return { e, absences: absences.length, signalees, suite, derniere: absences[0]?.date };
  }).filter(x => x.absences >= 3 || x.suite).sort((a, b) => b.absences - a.absences);
}
function renderElevesASurveiller(){
  if(!['enseignant','secretariat','direction','fondation'].includes(ui.role)) return '';
  if(DB.absencesSignalees === undefined){ DB.absencesSignalees = null; chargerAbsencesSignalees().then(() => { if(ui.currentView === 'dashboard') renderView('dashboard'); }).catch(() => { DB.absencesSignalees = []; }); }
  const liste = elevesASurveiller();
  if(!liste.length) return '';
  const admin = ui.role !== 'enseignant';
  return `<div class="panel">
    <div class="panel-head"><div><h2>Élèves à surveiller <span class="mer-score">${liste.length}</span></h2><div class="sub">Absences répétées sur 30 jours. Un petit message au parent suffit souvent.</div></div></div>
    <ul class="liste-compacte">${liste.map(x => `<li class="lc-ligne">
        <span class="lc-avatar" aria-hidden="true">${escapeHtml(initials(x.e.prenom, x.e.nom))}</span>
        <span class="lc-corps"><strong>${escapeHtml(eleveFullName(x.e))}</strong>
          <span>${escapeHtml(classeName(x.e.classeId))} · ${x.absences} absence${x.absences > 1 ? 's' : ''} en 30 jours${x.derniere ? ' · dernière le ' + fmtDate(x.derniere).slice(0, 5) : ''}${x.signalees ? ` · ${x.signalees} signalée${x.signalees > 1 ? 's' : ''} par le parent` : ''}</span>
          ${x.suite ? '<span class="badge-etat erreur">Absent(e) aux 2 derniers appels</span>' : ''}</span>
        ${admin ? (telephonesWhatsapp(x.e.parentTel).length ? `<button class="btn secondary sm" onclick="contacterParentAbsences('${x.e.id}', ${x.absences})">Contacter</button>` : '<span class="hint">Pas de numéro</span>') : ''}
      </li>`).join('')}</ul>
  </div>`;
}
function contacterParentAbsences(eleveId, nb){
  const e = eleveById(eleveId);
  if(!e) return;
  const message = `Bonjour, ici ${DB.meta?.nomEcole || 'l’école'}. Nous avons remarqué que ${e.prenom} a été absent(e) ${nb} fois ces dernières semaines. Tout va bien ? N’hésitez pas à nous contacter. Merci !`;
  ouvrirEnvoiWhatsapp(`📲 Parent de ${eleveFullName(e)}`, telephonesWhatsapp(e.parentTel), message, 'WhatsApp s’ouvrira au numéro du parent avec ce message (gratuit) :');
}
/* =====================================================================
   CORRECTIONS DE FICHE PROPOSÉES PAR LES PARENTS (schema.sql section 68)
   ===================================================================== */
const CHAMPS_CORRECTION = {
  date_naissance: { lib:'Date de naissance', cle:'dateNaissance', type:'date' },
  parent_nom: { lib:'Nom du parent', cle:'parentNom', type:'text' },
  parent_tel: { lib:'Téléphone du parent', cle:'parentTel', type:'tel' },
  parent_adresse: { lib:'Adresse', cle:'parentAdresse', type:'text' },
};
function valeurLisible(champ, v){ return champ === 'date_naissance' && v ? fmtDate(v) : (v || '—'); }
// Console parent
function renderLienCorrection(e){
  const attente = (DB.correctionsFiches || []).filter(c => c.eleveId === e.id && c.statut === 'en_attente').length;
  return `<div style="margin:4px 0 8px;">${attente ? '<span class="hint">✏️ Votre correction a été envoyée : l’école va la vérifier.</span>'
    : `<button type="button" class="btn secondary sm" onclick="ouvrirCorrectionFiche('${e.id}')">✏️ Signaler une erreur sur la fiche</button>`}</div>`;
}
function ouvrirCorrectionFiche(eleveId){
  const e = (DB.eleves || []).find(x => x.id === eleveId);
  if(!e) return;
  openModal('✏️ Corriger la fiche de ' + e.prenom, `
    <p class="hint" style="margin-top:0;">Modifiez seulement ce qui est faux. L’école vérifie avant d’enregistrer.</p>
    <form onsubmit="return envoyerCorrectionFiche(event, '${e.id}')">
      ${Object.entries(CHAMPS_CORRECTION).map(([k, c]) => `<div class="field"><label>${c.lib}</label><input name="${k}" type="${c.type}" maxlength="200" value="${escapeHtml(e[c.cle] || '')}"${c.type === 'date' ? ` max="${todayISO()}"` : ''}></div>`).join('')}
      <div class="field"><label>Précision (facultatif)</label><input name="commentaire" maxlength="300" placeholder="Ex : voir l’extrait de naissance"></div>
      <button class="btn" type="submit" style="width:100%;">Envoyer à l’école</button>
    </form>`);
}
async function envoyerCorrectionFiche(ev, eleveId){
  ev.preventDefault();
  const e = (DB.eleves || []).find(x => x.id === eleveId);
  const fd = new FormData(ev.target);
  const champs = {};
  Object.entries(CHAMPS_CORRECTION).forEach(([k, c]) => { const v = (fd.get(k) || '').trim(); if(v && v !== (e[c.cle] || '')) champs[k] = v; });
  if(!Object.keys(champs).length) return alert('Vous n’avez rien modifié.'), false;
  try{
    const { data, error } = await sb.from('corrections_fiches').insert({ eleve_id: eleveId, champs, commentaire: (fd.get('commentaire') || '').trim() }).select().single();
    if(error) throw error;
    DB.correctionsFiches = (DB.correctionsFiches || []).concat(rowToCamel(data));
    sb.functions.invoke('notifier-personnel', { body: { type: 'correction' } }).catch(() => {});
    closeModal(); toast('Correction envoyée à l’école'); renderView(ui.currentView);
  }catch(err){ alert('Erreur : ' + err.message); }
  return false;
}
// École : corrections à valider (Élèves & Inscriptions)
function renderCorrectionsParents(){
  if(!['secretariat','direction','fondation'].includes(ui.role)) return '';
  if(DB.correctionsFiches === undefined){
    DB.correctionsFiches = null;
    sb.from('corrections_fiches').select('*').eq('ecole_id', session.ecoleId).eq('statut', 'en_attente').order('created_at')
      .then(({ data }) => { DB.correctionsFiches = rowsToCamel(data || []); if(ui.currentView === 'eleves' && DB.correctionsFiches.length) renderView('eleves'); });
  }
  const liste = (DB.correctionsFiches || []).filter(c => c.statut === 'en_attente');
  if(!liste.length) return '';
  return `<div class="panel">
    <div class="panel-head"><div><h2>✏️ Corrections proposées par les parents (${liste.length})</h2><div class="sub">Vérifiez avec les documents de l’élève, puis appliquez : la fiche est mise à jour.</div></div></div>
    <div class="table-wrap"><table>
      <thead><tr><th>Élève</th><th>Changement demandé</th><th></th></tr></thead>
      <tbody>${liste.map(c => { const e = eleveById(c.eleveId); return `<tr>
        <td>${e ? escapeHtml(eleveFullName(e)) : '—'}<br><span class="hint">${e ? escapeHtml(classeName(e.classeId)) : ''} · ${fmtDate(String(c.createdAt).slice(0, 10))}</span></td>
        <td>${Object.entries(c.champs || {}).map(([k, v]) => `<div><strong>${escapeHtml(CHAMPS_CORRECTION[k]?.lib || k)} :</strong> <span class="hint">${escapeHtml(valeurLisible(k, e ? e[CHAMPS_CORRECTION[k]?.cle] : ''))}</span> → <strong>${escapeHtml(valeurLisible(k, v))}</strong></div>`).join('')}${c.commentaire ? `<div class="hint">« ${escapeHtml(c.commentaire)} »</div>` : ''}</td>
        <td style="white-space:nowrap;"><button class="btn sm" onclick="traiterCorrectionFiche('${c.id}', true)">✓ Appliquer</button> <button class="btn secondary sm" onclick="traiterCorrectionFiche('${c.id}', false)">Refuser</button></td>
      </tr>`; }).join('')}</tbody></table></div>
  </div>`;
}
async function traiterCorrectionFiche(id, appliquer){
  const c = (DB.correctionsFiches || []).find(x => x.id === id);
  if(!c) return;
  if(!appliquer && !confirm('Refuser cette correction ? La fiche reste inchangée.')) return;
  try{
    if(appliquer){
      const champs = {};
      Object.entries(c.champs || {}).forEach(([k, v]) => { if(CHAMPS_CORRECTION[k]) champs[k] = v; });
      const { error } = await exigerEffet(sb.from('eleves').update(champs).eq('id', c.eleveId));
      if(error) throw error;
      const e = eleveById(c.eleveId);
      if(e) Object.entries(champs).forEach(([k, v]) => { e[CHAMPS_CORRECTION[k].cle] = v; });
    }
    const { error: err2 } = await exigerEffet(sb.from('corrections_fiches').update({ statut: appliquer ? 'appliquee' : 'refusee', traite_at: new Date().toISOString() }).eq('id', id));
    if(err2) throw err2;
    c.statut = appliquer ? 'appliquee' : 'refusee';
    toast(appliquer ? 'Fiche mise à jour' : 'Correction refusée'); renderView('eleves');
  }catch(e){ alert('Erreur : ' + e.message); }
}
/* =====================================================================
   SÉCURITÉ ET SANTÉ DE L'ÉLÈVE (schema.sql section 66)
   Le parent (ou le secrétariat) indique les personnes autorisées à venir
   chercher l'enfant et ses informations de santé. Le portier ne voit que
   le nom et le lien des personnes autorisées, après son signalement.
   ===================================================================== */
const LIENS_AUTORISES = ['Père','Mère','Grand-père','Grand-mère','Oncle','Tante','Frère','Sœur','Tuteur','Chauffeur','Nounou','Voisin(e)'];
function personnesDe(eleveId){ return (DB.personnesAutorisees || []).filter(p => p.eleveId === eleveId); }
function santeDe(eleveId){ return (DB.santeEleves || []).find(s => s.eleveId === eleveId) || null; }
// Personnel : chargement unique (RLS : élèves visibles seulement)
function chargerSecuriteEleves(){
  if(DB.santeEleves !== undefined) return;
  DB.santeEleves = null; DB.personnesAutorisees = DB.personnesAutorisees || [];
  Promise.all([sb.from('sante_eleves').select('*').eq('ecole_id', session.ecoleId), sb.from('personnes_autorisees').select('*').eq('ecole_id', session.ecoleId)])
    .then(([s, p]) => { DB.santeEleves = rowsToCamel(s.data || []); DB.personnesAutorisees = rowsToCamel(p.data || []); if(['dashboard','eleves'].includes(ui.currentView)) renderView(ui.currentView); })
    .catch(() => { DB.santeEleves = []; });
}
// Console parent : résumé sur la fiche de l'enfant
function renderSecuriteEnfant(e){
  const pers = personnesDe(e.id), sante = santeDe(e.id);
  return `<div class="enfant-secu">
    <div><strong>🛡️ Peuvent venir le chercher :</strong> ${pers.length ? pers.map(p => `${escapeHtml(p.nom)}${p.lien ? ` <span class="hint">(${escapeHtml(p.lien)})</span>` : ''}`).join(', ') : '<span class="hint">personne d’autre que vous n’est indiqué</span>'}</div>
    ${sante && sante.allergies ? `<div><strong>⚕️ Allergies :</strong> ${escapeHtml(sante.allergies)}</div>` : ''}
    <button type="button" class="btn secondary sm" onclick="ouvrirSecuriteEleve('${e.id}')">${pers.length || sante ? 'Mettre à jour' : 'Indiquer les personnes autorisées et la santé'}</button>
  </div>`;
}
async function ouvrirSecuriteEleve(eleveId){
  const e = (DB.eleves || []).find(x => x.id === eleveId);
  openModal('🛡️ Sécurité & santé', '<div class="hint">Chargement…</div>');
  try{
    const [p, s] = await Promise.all([
      sb.from('personnes_autorisees').select('*').eq('eleve_id', eleveId).order('created_at'),
      sb.from('sante_eleves').select('*').eq('eleve_id', eleveId).maybeSingle(),
    ]);
    if(p.error) throw p.error;
    DB.personnesAutorisees = (DB.personnesAutorisees || []).filter(x => x.eleveId !== eleveId).concat(rowsToCamel(p.data || []));
    DB.santeEleves = (DB.santeEleves || []).filter(x => x.eleveId !== eleveId).concat(s.data ? [rowToCamel(s.data)] : []);
  }catch(err){ $('#modalBody').innerHTML = `<div class="hint">Erreur : ${escapeHtml(err.message)}</div>`; return; }
  afficherSecuriteEleve(e || { id: eleveId, prenom: '', nom: '' });
}
function afficherSecuriteEleve(e){
  const pers = personnesDe(e.id), sante = santeDe(e.id) || {};
  openModal('🛡️ Sécurité & santé — ' + eleveFullName(e), `
    <h4 style="margin:0 0 6px;">Personnes autorisées à venir chercher ${escapeHtml(e.prenom || 'l’enfant')}</h4>
    <p class="hint" style="margin-top:0;">Le portier voit leur nom et leur lien quand il signale l’arrivée d’un parent (jamais leur téléphone).</p>
    ${pers.length ? pers.map(p => `<div class="actu-carte" style="justify-content:space-between;margin-bottom:6px;"><div class="actu-corps"><div class="actu-titre">${escapeHtml(p.nom)}${p.lien ? ` <span class="hint">(${escapeHtml(p.lien)})</span>` : ''}</div>${p.telephone ? `<div class="actu-meta">${escapeHtml(p.telephone)}</div>` : ''}</div>
      <button class="icon-btn danger" title="Retirer" onclick="supprimerPersonneAutorisee('${p.id}', '${e.id}')">🗑️</button></div>`).join('') : '<div class="hint">Aucune personne indiquée pour l’instant.</div>'}
${boutonRemplissage('personne-autorisee', "SCHEMA_PERSONNE_AUTORISEE", 'formPersonneAutorisee')}
    <form id="formPersonneAutorisee" onsubmit="return ajouterPersonneAutorisee(event, '${e.id}')" style="margin-top:8px;">
      <div class="form-grid">
        <div class="field"><label>Nom et prénom</label><input name="nom" required minlength="2" maxlength="120" placeholder="Ex : KOUASSI Marie"></div>
        <div class="field"><label>Lien avec l’enfant</label><input name="lien" maxlength="60" list="listeLiensAutorises" placeholder="Ex : Tante"><datalist id="listeLiensAutorises">${LIENS_AUTORISES.map(l => `<option value="${l}">`).join('')}</datalist></div>
        <div class="field span2"><label>Téléphone (facultatif)</label><input name="telephone" type="tel" maxlength="30" placeholder="Ex : 07 00 00 00 00"></div>
      </div>
      <div class="form-actions"><button class="btn secondary" type="submit">+ Ajouter cette personne</button></div>
    </form>
    <h4 style="margin:var(--sp-4) 0 6px;">⚕️ Santé</h4>
    <p class="hint" style="margin-top:0;">Visible seulement par vous, l’administration de l’école et l’enseignant de la classe.</p>
${boutonRemplissage('sante', "SCHEMA_SANTE", 'formSante')}
    <form id="formSante" onsubmit="return enregistrerSanteEleve(event, '${e.id}')">
      <div class="field"><label>Allergies</label><input name="allergies" maxlength="300" value="${escapeHtml(sante.allergies || '')}" placeholder="Ex : arachides, pénicilline — ou laissez vide"></div>
      <div class="field"><label>Autres informations utiles</label><textarea name="infos" maxlength="1000" rows="3" placeholder="Ex : asthme (ventoline dans le sac), lunettes, médecin traitant…">${escapeHtml(sante.infos || '')}</textarea></div>
      <div class="form-actions"><button class="btn" type="submit">Enregistrer la santé</button></div>
    </form>`);
}
function apresMajSecurite(e){
  afficherSecuriteEleve(e);
  if(ui.role === 'parent') renderView(ui.currentView);
}
async function ajouterPersonneAutorisee(ev, eleveId){
  ev.preventDefault();
  const fd = new FormData(ev.target);
  const e = (DB.eleves || []).find(x => x.id === eleveId) || { id: eleveId };
  try{
    const { data, error } = await sb.from('personnes_autorisees').insert({ eleve_id: eleveId, nom: fd.get('nom').trim(), lien: (fd.get('lien') || '').trim(), telephone: (fd.get('telephone') || '').trim() }).select().single();
    if(error) throw error;
    DB.personnesAutorisees = (DB.personnesAutorisees || []).concat(rowToCamel(data));
    toast('Personne ajoutée'); apresMajSecurite(e);
  }catch(err){ alert('Erreur : ' + err.message); }
  return false;
}
async function supprimerPersonneAutorisee(id, eleveId){
  if(!confirm('Retirer cette personne de la liste ?')) return;
  const e = (DB.eleves || []).find(x => x.id === eleveId) || { id: eleveId };
  try{
    const { error } = await exigerEffet(sb.from('personnes_autorisees').delete().eq('id', id));
    if(error) throw error;
    DB.personnesAutorisees = (DB.personnesAutorisees || []).filter(p => p.id !== id);
    toast('Personne retirée'); apresMajSecurite(e);
  }catch(err){ alert('Erreur : ' + err.message); }
}
async function enregistrerSanteEleve(ev, eleveId){
  ev.preventDefault();
  const fd = new FormData(ev.target);
  const e = (DB.eleves || []).find(x => x.id === eleveId) || { id: eleveId };
  try{
    const { data, error } = await sb.from('sante_eleves').upsert({ eleve_id: eleveId, allergies: (fd.get('allergies') || '').trim(), infos: (fd.get('infos') || '').trim(), maj_at: new Date().toISOString() }).select().single();
    if(error) throw error;
    DB.santeEleves = (DB.santeEleves || []).filter(s => s.eleveId !== eleveId).concat(rowToCamel(data));
    toast('Santé enregistrée'); apresMajSecurite(e);
  }catch(err){ alert('Erreur : ' + err.message); }
  return false;
}
// Portier : après le signalement, affiche qui peut venir chercher l'enfant
async function afficherAutorisesPortier(eleveId){
  const zone = document.getElementById('gateAutorises');
  if(!zone) return;
  try{
    const { data, error } = await sb.rpc('personnes_autorisees_portier', { p_eleve: eleveId });
    if(error) throw error;
    zone.innerHTML = data && data.length
      ? `<div class="gate-autorises"><strong>🛡️ Peuvent venir chercher l’enfant :</strong><ul>${data.map(p => `<li>${escapeHtml(p.nom)}${p.lien ? ` — ${escapeHtml(p.lien)}` : ''}</li>`).join('')}</ul><span>et les parents. En cas de doute, appelez l’administration.</span></div>`
      : '';
  }catch(_e){ zone.innerHTML = ''; }
}
/* =====================================================================
   ANNIVERSAIRES DES ÉLÈVES (schema.sql section 65)
   Tableau de bord : anniversaires des 7 prochains jours ; console parent :
   bandeau le jour J ; vœux automatiques de l'école à 8h (annoncer-horaires).
   ===================================================================== */
// Jours avant le prochain anniversaire (0 = aujourd'hui), null si date inconnue
function joursAvantAnniversaire(dateNaissance){
  if(!dateNaissance || !/^\d{4}-\d{2}-\d{2}/.test(dateNaissance)) return null;
  const auj = new Date(todayISO() + 'T12:00:00');
  const [, m, j] = dateNaissance.slice(0, 10).split('-').map(Number);
  const prochaine = (an) => { const d = new Date(an, m - 1, j, 12); if(d.getMonth() !== m - 1) d.setDate(0); return d; }; // 29 février → 28
  let d = prochaine(auj.getFullYear());
  if(d < auj) d = prochaine(auj.getFullYear() + 1);
  return Math.round((d - auj) / 86400000);
}
function ageAnniversaire(dateNaissance, jours){
  const d = new Date(todayISO() + 'T12:00:00'); d.setDate(d.getDate() + (jours || 0));
  return d.getFullYear() - Number(dateNaissance.slice(0, 4));
}
function renderAnniversaires(){
  if(!['enseignant','secretariat','direction','fondation'].includes(ui.role)) return '';
  const ids = classesVisibles().map(c => c.id);
  const liste = DB.eleves.filter(e => e.statut === 'Actif' && ids.includes(e.classeId))
    .map(e => ({ e, j: joursAvantAnniversaire(e.dateNaissance) }))
    .filter(x => x.j !== null && x.j <= 7 && ageAnniversaire(x.e.dateNaissance, x.j) > 0 && ageAnniversaire(x.e.dateNaissance, x.j) < 30)
    .sort((a, b) => a.j - b.j);
  if(!liste.length) return '';
  const quand = (j) => j === 0 ? '<strong>aujourd’hui</strong>' : j === 1 ? 'demain' : new Date(Date.now() + j * 86400000).toLocaleDateString('fr-FR', {weekday:'long', day:'numeric'});
  return `<div class="panel">
    <div class="panel-head"><div><h2>🎂 Anniversaires de la semaine</h2>${DB.meta?.voeuxAnniversaire !== false ? '<div class="sub">Le jour J, les parents reçoivent automatiquement les vœux de l’école à 8h.</div>' : ''}</div></div>
    <div class="mj-grille">${liste.map(({ e, j }) => `<div class="mj-classe"${j === 0 ? ' style="border-color:var(--amber, #d4a017);"' : ''}>
      <div class="mj-tete"><strong>${j === 0 ? '🎉 ' : ''}${escapeHtml(eleveFullName(e))}</strong><span class="hint" style="margin:0;">${escapeHtml(classeName(e.classeId))}</span></div>
      <div class="mj-ligne">${ageAnniversaire(e.dateNaissance, j)} ans ${quand(j)}</div></div>`).join('')}</div>
  </div>`;
}
// Console parent : bandeau sur la fiche de l'enfant le jour de son anniversaire
function renderAnniversaireEnfant(e){
  if(joursAvantAnniversaire(e.dateNaissance) !== 0) return '';
  const age = ageAnniversaire(e.dateNaissance, 0);
  return `<div class="enfant-anniv" role="note">🎂 Joyeux anniversaire ${escapeHtml(e.prenom)}${age > 0 && age < 30 ? ` — ${age} ans` : ''} ! <span>Toute l’équipe ${DB.meta?.nomEcole ? 'de ' + escapeHtml(DB.meta.nomEcole) : 'de l’école'} lui souhaite une très belle journée.</span></div>`;
}
async function reglerOptionEcole(colonne, cle, actif, libelle){
  try{
    const { error } = await exigerEffet(sb.from('ecoles').update({ [colonne]: actif }).eq('id', session.ecoleId));
    if(error) throw error;
    DB.meta[cle] = actif;
    toast(`${libelle} : ${actif ? 'activé' : 'désactivé'}`);
  }catch(e){ alert('Erreur : ' + e.message); renderView('parametres'); }
}
async function reglerVoeuxAnniversaire(actif){
  try{
    const { error } = await exigerEffet(sb.from('ecoles').update({ voeux_anniversaire: actif }).eq('id', session.ecoleId));
    if(error) throw error;
    DB.meta.voeuxAnniversaire = actif;
    toast(actif ? 'Vœux d’anniversaire activés' : 'Vœux d’anniversaire désactivés');
  }catch(e){ alert('Erreur : ' + e.message); renderView('parametres'); }
}
/* =====================================================================
   CAHIER DE TEXTES — devoirs par classe (schema.sql section 64)
   L'enseignant note les devoirs de ses classes ; chaque parent voit ceux
   de la classe de ses enfants (accueil de la console parent).
   ===================================================================== */
// Prochain jour de classe (le lundi si l'on est vendredi ou le week-end)
function isoDansJours(n, ouvre){
  const d = new Date(); d.setDate(d.getDate() + n);
  while(ouvre && (d.getDay() === 0 || d.getDay() === 6)) d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function prochainJourClasse(){ return isoDansJours(1, true); }
function quandDevoir(iso){
  if(iso === todayISO()) return 'pour aujourd’hui';
  if(iso === isoDansJours(1)) return 'pour demain';
  const jour = new Date(iso + 'T12:00:00');
  if(iso === prochainJourClasse()) return 'pour ' + jour.toLocaleDateString('fr-FR', {weekday:'long'});
  return 'pour le ' + jour.toLocaleDateString('fr-FR', {weekday:'long', day:'numeric', month:'long'});
}
function renderDevoirs(){
  if(DB.devoirs === undefined){
    DB.devoirs = null;
    sb.from('devoirs').select('*').eq('ecole_id', session.ecoleId).gte('pour_le', isoDansJours(-14)).order('pour_le')
      .then(({ data }) => { DB.devoirs = rowsToCamel(data || []); if(ui.currentView === 'devoirs') renderView('devoirs'); });
  }
  const classes = classesVisibles();
  const idsClasses = classes.map(c => c.id);
  if(!classes.length) return `<div class="view active"><div class="panel"><div class="hint">Aucune classe ne vous est attribuée : demandez à la direction de valider votre inscription.</div></div></div>`;
  const choix = ui.filters.devoirsClasse && idsClasses.includes(ui.filters.devoirsClasse) ? ui.filters.devoirsClasse : '';
  const tous = ui.filters.devoirsPasses;
  const liste = (DB.devoirs || []).filter(d => idsClasses.includes(d.classeId) && (!choix || d.classeId === choix) && (tous || d.pourLe >= todayISO()));
  const t = session.enseignantId ? enseignantById(session.enseignantId) : null;
  const matieres = (t?.matieres || []).length ? t.matieres : [...new Set(classes.flatMap(c => MATIERES_BY_CYCLE[c.cycle] || []))];
  // Les 3 prochains jours de classe (mercredi, week-end et congés exclus)
  const joursDevoir = []; let j = todayISO();
  for(let i = 0; i < 3; i++){ j = prochainJourDeClasse(j); if(!j) break; joursDevoir.push(j); }
  if(!joursDevoir.length) joursDevoir.push(prochainJourClasse());
  return `<div class="view active">
    <div class="panel">
      <div class="panel-head"><div><h2>📒 Noter un devoir</h2><div class="sub">Les parents de la classe le voient aussitôt dans leur application, avec une notification s’ils le souhaitent.</div></div></div>
${boutonRemplissage('devoir', "SCHEMA_DEVOIR", 'formDevoir')}
      <form id="formDevoir" onsubmit="return ajouterDevoir(event)">
        <div class="form-grid">
          <div class="field"><label>Classe</label>${classes.length === 1 ? `<input type="hidden" name="classeId" value="${classes[0].id}"><span class="classe-unique">${icone('school')} ${escapeHtml(classes[0].nom)}</span>` : `<select name="classeId" required>${classes.map(c => `<option value="${c.id}"${c.id === choix ? ' selected' : ''}>${escapeHtml(c.nom)}</option>`).join('')}</select>`}</div>
          <div class="field span2"><label>Matière <span class="hint" style="margin:0;font-weight:400;">— touchez-en une (ou écrivez)</span></label>
            <div class="dv-puces" role="group" aria-label="Matière">${matieres.map(m => `<button type="button" class="dv-puce" onclick="choisirPuceDevoir(this,'matiere')">${escapeHtml(m)}</button>`).join('')}</div>
            <input name="matiere" maxlength="80" placeholder="Ou écrivez la matière ici" oninput="majPucesDevoir('matiere', this.value)"></div>
          <div class="field span2"><label>Pour quel jour ?</label>
            <div class="dv-puces" role="group" aria-label="Pour quel jour">${joursDevoir.map((j, i) => `<button type="button" class="dv-puce${i === 0 ? ' actif' : ''}" data-val="${j}" onclick="choisirPuceDevoir(this,'pourLe')">${escapeHtml(libelleJourDevoir(j))}</button>`).join('')}</div>
            <input type="date" name="pourLe" required min="${todayISO()}" value="${joursDevoir[0]}" aria-label="Autre date" oninput="majPucesDevoir('pourLe', this.value)"></div>
          <div class="field span2"><label>Travail à faire</label>
            <div class="dv-puces dv-phrases" role="group" aria-label="Phrases toutes prêtes">${['Apprendre la leçon', 'Faire les exercices', 'Réviser', 'Lire le texte', 'Recopier', 'Apporter'].map(p => `<button type="button" class="dv-puce" onclick="ajouterPhraseDevoir(${jsArg(p)})">+ ${p}</button>`).join('')}</div>
            <textarea name="travail" required minlength="2" maxlength="1000" rows="3" placeholder="Ex : Apprendre la leçon 4, faire les exercices 2 et 3 page 18"></textarea></div>
        </div>
        <label style="display:flex;align-items:center;gap:8px;margin-top:8px;"><input type="checkbox" name="prevenir" checked> Prévenir les parents de la classe par une notification</label>
        <div class="form-actions"><button class="btn" type="submit">Enregistrer le devoir</button></div>
      </form>
    </div>
    <div class="panel">
      <div class="panel-head"><div><h2>${tous ? 'Devoirs des 2 dernières semaines' : 'Devoirs à venir'}</h2></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          ${classes.length > 1 ? choixClasse(classes, choix, "ui.filters.devoirsClasse=this.value; renderView('devoirs')", { tous: 'Toutes mes classes', classe: '' }) : ''}
          <button class="btn secondary sm" onclick="ui.filters.devoirsPasses=${!tous}; renderView('devoirs')">${tous ? 'À venir seulement' : 'Voir aussi les passés'}</button></div></div>
      ${DB.devoirs === null ? '<div class="hint">Chargement…</div>' : !liste.length ? '<div class="empty-state"><div class="em-ic">📒</div>Aucun devoir noté pour l’instant.</div>' : `<div class="table-wrap"><table>
        <thead><tr><th>Pour le</th><th>Classe</th><th>Travail</th><th></th></tr></thead>
        <tbody>${liste.map(d => `<tr>
          <td style="white-space:nowrap;">${fmtDate(d.pourLe)}<br><span class="hint">${d.pourLe >= todayISO() ? quandDevoir(d.pourLe) : 'passé'}</span></td>
          <td>${escapeHtml(classeName(d.classeId))}</td>
          <td>${d.matiere ? `<strong>${escapeHtml(d.matiere)}</strong><br>` : ''}${escapeHtml(d.travail).replace(/\n/g, '<br>')}</td>
          <td><button class="icon-btn danger" title="Supprimer" onclick="supprimerDevoir('${d.id}')">🗑️</button></td>
        </tr>`).join('')}</tbody></table></div>`}
    </div>
  </div>`;
}
function libelleJourDevoir(iso){
  const d = new Date(iso + 'T12:00:00'), l = d.toLocaleDateString('fr-FR', { weekday:'long', day:'numeric' });
  return (iso === isoDansJours(1) ? 'Demain, ' : '') + l;
}
function choisirPuceDevoir(btn, champ){
  const form = btn.closest('form'), input = form && form.elements[champ]; if(!input) return;
  input.value = btn.dataset.val || btn.textContent.trim();
  majPucesDevoir(champ, input.value, form);
}
function majPucesDevoir(champ, valeur, form){
  form = form || document.querySelector(`[name="${champ}"]`)?.closest('form'); if(!form) return;
  const input = form.elements[champ];
  input.parentElement.querySelectorAll('.dv-puce').forEach(b => { const v = b.dataset.val || b.textContent.trim(); b.classList.toggle('actif', v === valeur); b.setAttribute('aria-pressed', v === valeur); });
}
function ajouterPhraseDevoir(p){
  const ta = document.querySelector('textarea[name="travail"]'); if(!ta) return;
  const v = ta.value.trim();
  ta.value = v ? (/[.;,:]$/.test(v) ? v + ' ' : v + ', ') + p.charAt(0).toLowerCase() + p.slice(1) + ' ' : p + ' ';
  ta.focus(); try{ ta.setSelectionRange(ta.value.length, ta.value.length); }catch(_e){}
}
async function ajouterDevoir(ev){
  ev.preventDefault();
  const fd = new FormData(ev.target);
  const ligne = { classe_id: fd.get('classeId'), matiere: (fd.get('matiere') || '').trim(), travail: fd.get('travail').trim(), pour_le: fd.get('pourLe') };
  if(ligne.pour_le < todayISO()) return alert('Choisissez une date à partir d’aujourd’hui.'), false;
  const bouton = ev.target.querySelector('button[type="submit"]'); if(bouton) bouton.disabled = true;
  try{
    // dbInsert : sans réseau, le devoir est gardé dans le téléphone et publié au retour de la connexion
    const horsLigne = navigator.onLine === false;
    const d = await dbInsert('devoirs', { classeId: ligne.classe_id, matiere: ligne.matiere, travail: ligne.travail, pourLe: ligne.pour_le });
    DB.devoirs = (DB.devoirs || []).concat(d).sort((a, b) => a.pourLe.localeCompare(b.pourLe));
    if(horsLigne || navigator.onLine === false){
      ui.filters.devoirsClasse = d.classeId;
      toast('Pas de réseau : devoir gardé dans le téléphone. Il sera publié aux parents dès le retour du réseau.'); renderView('devoirs');
      return false;
    }
    if(fd.get('prevenir') === 'on'){
      const eleves = DB.eleves.filter(e => e.statut === 'Actif' && e.classeId === d.classeId).map(e => e.id);
      notifierParentsPush(eleves, `📒 Devoir ${quandDevoir(d.pourLe)} (${classeName(d.classeId)})${d.matiere ? ' — ' + d.matiere : ''} : ${d.travail}`);
    }
    ui.filters.devoirsClasse = d.classeId;
    toast('Devoir enregistré'); renderView('devoirs');
  }catch(e){ alert('Erreur : ' + e.message); if(bouton) bouton.disabled = false; }
  return false;
}
async function supprimerDevoir(id){
  if(!confirm('Supprimer ce devoir ? Les parents ne le verront plus.')) return;
  try{
    const { error } = await exigerEffet(sb.from('devoirs').delete().eq('id', id));
    if(error) throw error;
    DB.devoirs = (DB.devoirs || []).filter(d => d.id !== id);
    toast('Devoir supprimé'); renderView('devoirs');
  }catch(e){ alert('Erreur : ' + e.message); }
}
// Console parent : devoirs à venir de chaque enfant
function renderDevoirsParent(enfants){
  const blocs = enfants.map(e => ({ e, ds: (DB.devoirs || []).filter(d => d.classeId === e.classeId && d.pourLe >= todayISO()) })).filter(x => x.ds.length);
  if(!blocs.length) return '';
  const plusieurs = enfants.length > 1;
  return `<section class="panel actus-panel" aria-labelledby="titreDevoirs">
    <div class="panel-head"><div><h2 id="titreDevoirs">📒 Devoirs</h2></div></div>
    ${blocs.map(({ e, ds }) => `${plusieurs ? `<div class="hint" style="margin:6px 0 4px;font-weight:600;">${escapeHtml(e.prenom)} — ${escapeHtml(classeName(e.classeId))}</div>` : ''}
      <div class="actu-liste">${ds.map(d => `<article class="actu-carte">
        <div class="actu-date" aria-hidden="true"><span class="actu-jour">${new Date(d.pourLe + 'T12:00:00').getDate()}</span><span class="actu-mois">${new Date(d.pourLe + 'T12:00:00').toLocaleDateString('fr-FR', {month:'short'}).replace('.', '').toUpperCase()}</span></div>
        <div class="actu-corps"><div class="actu-titre">${d.matiere ? escapeHtml(d.matiere) : 'Travail à faire'} <span class="hint" style="font-weight:600;">· ${quandDevoir(d.pourLe)}</span></div>
          <div class="actu-meta">${escapeHtml(d.travail).replace(/\n/g, '<br>')}</div></div>
      </article>`).join('')}</div>`).join('')}
  </section>`;
}
/* =====================================================================
   AGENDA DE L'ÉCOLE (schema.sql section 61)
   ===================================================================== */
const TYPES_AGENDA = {
  vacances: { lib:'Vacances / congé', ic:'🏖️' }, examen: { lib:'Composition / examen', ic:'📝' },
  reunion: { lib:'Réunion de parents', ic:'👪' }, fete: { lib:'Fête / cérémonie', ic:'🎉' },
  sortie: { lib:'Sortie / excursion', ic:'🚌' }, autre: { lib:'Autre', ic:'📌' },
};
// Tableau de bord du personnel : les dates des 3 prochaines semaines (congés, compositions, sorties…)
function renderProchainesDatesEcole(){
  if(!['secretariat','direction','fondation'].includes(ui.role)) return '';
  chargerAgenda();
  if(!DB.agenda) return '';
  const auj = todayISO(), limite = decalerJours(auj, 21);
  const evs = DB.agenda.filter(e => e.dateFin >= auj && e.dateDebut <= limite).slice(0, 6);
  if(!evs.length) return '';
  const classes = ids => !ids || !ids.length ? '' : ids.length === DB.classes.length ? '' : ' · ' + ids.map(id => classeName(id)).join(', ');
  return `<div class="panel prochaines-dates">
    <div class="panel-head"><div><h2>${icone('calendar')} Dans les 3 prochaines semaines</h2><div class="sub">D’après l’agenda de l’école — les parents concernés reçoivent un rappel la veille</div></div>
      <button type="button" class="btn secondary sm" onclick="go('agenda')">Tout l’agenda</button></div>
    <ul class="pd-liste">${evs.map(ev => `<li class="pd-ligne pd-${ev.type}">
      <span class="pd-ic" aria-hidden="true">${(TYPES_AGENDA[ev.type] || TYPES_AGENDA.autre).ic}</span>
      <span class="pd-txt"><strong>${escapeHtml(ev.titre)}</strong><small>${datesAgenda(ev)}${escapeHtml(classes(ev.classeIds))}</small></span>
      <span class="pd-delai">${delaiAgenda(ev)}</span></li>`).join('')}</ul>
  </div>`;
}
function datesAgenda(ev){
  return ev.dateDebut === ev.dateFin ? fmtDate(ev.dateDebut) : `du ${fmtDate(ev.dateDebut)} au ${fmtDate(ev.dateFin)}`;
}
function delaiAgenda(ev){
  const aujourd = todayISO();
  if(ev.dateDebut <= aujourd && ev.dateFin >= aujourd) return 'en cours';
  const j = Math.round((Date.parse(ev.dateDebut + 'T12:00:00') - Date.parse(aujourd + 'T12:00:00')) / 86400000);
  return j === 1 ? 'demain' : `dans ${j} jours`;
}
// Console parent : prochaines dates
/* --- Réponses des parents (schema.sql section 67) --- */
const DEMANDES_REPONSE = {
  autorisation: { lib:'Autorisation parentale', oui:'✅ J’autorise', non:'❌ Je n’autorise pas', ouiCourt:'autorisé', nonCourt:'non autorisé' },
  presence: { lib:'Confirmation de présence', oui:'✅ Je serai présent(e)', non:'❌ Je ne pourrai pas venir', ouiCourt:'présent', nonCourt:'absent' },
};
function elevesConcernesAgenda(ev, eleves){
  return (eleves || []).filter(e => e.statut !== 'Inactif' && (!ev.classeIds || !ev.classeIds.length || ev.classeIds.includes(e.classeId)));
}
function renderReponsesParent(ev){
  const d = DEMANDES_REPONSE[ev.demandeReponse];
  if(!d) return '';
  const enfants = elevesConcernesAgenda(ev, DB.eleves);
  if(!enfants.length) return '';
  return `<div class="agenda-reponses">${enfants.map(e => {
    const r = (DB.reponsesAgenda || []).find(x => x.evenementId === ev.id && x.eleveId === e.id);
    const qui = enfants.length > 1 || (DB.eleves || []).length > 1 ? `<strong>${escapeHtml(e.prenom)}</strong> : ` : '';
    return r
      ? `<div class="agenda-rep-ligne">${qui}<span class="badge ${r.reponse ? 'green' : 'red'}">${r.reponse ? d.ouiCourt : d.nonCourt}</span> <button type="button" class="btn secondary sm" onclick="repondreAgenda('${ev.id}','${e.id}', ${!r.reponse})">Changer</button></div>`
      : `<div class="agenda-rep-ligne">${qui}<button type="button" class="btn sm" onclick="repondreAgenda('${ev.id}','${e.id}', true)">${d.oui}</button> <button type="button" class="btn secondary sm" onclick="repondreAgenda('${ev.id}','${e.id}', false)">${d.non}</button></div>`;
  }).join('')}</div>`;
}
async function repondreAgenda(evenementId, eleveId, reponse){
  try{
    const { data, error } = await sb.from('reponses_agenda').upsert({ evenement_id: evenementId, eleve_id: eleveId, reponse, repondu_at: new Date().toISOString() }).select().single();
    if(error) throw error;
    DB.reponsesAgenda = (DB.reponsesAgenda || []).filter(x => !(x.evenementId === evenementId && x.eleveId === eleveId)).concat(rowToCamel(data));
    toast('Réponse envoyée à l’école'); renderView(ui.currentView);
  }catch(e){ alert('Erreur : ' + e.message); }
}
function renderAgendaParent(){
  const evs = (DB.agenda || []).filter(e => e.dateFin >= todayISO()).slice(0, 5);
  if(!evs.length) return '';
  return `<section class="panel actus-panel" aria-labelledby="titreAgenda">
    <div class="panel-head"><div><h2 id="titreAgenda">📅 À venir</h2></div></div>
    <div class="actu-liste">${evs.map(ev => `<article class="actu-carte">
      <div class="actu-date" aria-hidden="true"><span class="actu-jour">${new Date(ev.dateDebut + 'T12:00:00').getDate()}</span><span class="actu-mois">${new Date(ev.dateDebut + 'T12:00:00').toLocaleDateString('fr-FR', {month:'short'}).replace('.', '').toUpperCase()}</span></div>
      <div class="actu-corps"><div class="actu-titre">${(TYPES_AGENDA[ev.type] || TYPES_AGENDA.autre).ic} ${escapeHtml(ev.titre)}</div>
        <div class="actu-meta">${datesAgenda(ev)} · <strong>${delaiAgenda(ev)}</strong>${ev.description ? ' · ' + escapeHtml(ev.description) : ''}</div>
        ${ev.demandeReponse ? `<div class="hint" style="margin:6px 0 0;font-weight:600;">✍️ ${DEMANDES_REPONSE[ev.demandeReponse]?.lib || ''} : l’école attend votre réponse</div>${renderReponsesParent(ev)}` : ''}</div>
    </article>`).join('')}</div>
  </section>`;
}
// École : réponses reçues pour une date de l'agenda
function telephonesWhatsapp(tel){
  return String(tel || '').split(/\s*[\/;,|]\s*|\s+-\s+|\s+et\s+/i)
    .map(m => m.replace(/\D/g, '').replace(/^225/, '')).filter(m => m.length === 10).map(m => '225' + m);
}
async function ouvrirReponsesAgenda(evenementId){
  const ev = (DB.agenda || []).find(x => x.id === evenementId);
  if(!ev) return;
  openModal('✍️ Réponses des parents', '<div class="hint">Chargement…</div>');
  try{
    const { data, error } = await sb.from('reponses_agenda').select('*').eq('evenement_id', evenementId);
    if(error) throw error;
    DB.reponsesAgenda = (DB.reponsesAgenda || []).filter(x => x.evenementId !== evenementId).concat(rowsToCamel(data || []));
  }catch(e){ $('#modalBody').innerHTML = `<div class="hint">Erreur : ${escapeHtml(e.message)}</div>`; return; }
  afficherReponsesAgenda(ev);
}
function afficherReponsesAgenda(ev){
  const d = DEMANDES_REPONSE[ev.demandeReponse] || DEMANDES_REPONSE.autorisation;
  const gestion = ['secretariat','direction','fondation'].includes(ui.role);
  const idsVisibles = classesVisibles().map(c => c.id);
  const eleves = elevesConcernesAgenda(ev, DB.eleves.filter(e => e.statut === 'Actif' && idsVisibles.includes(e.classeId)));
  const rep = (e) => (DB.reponsesAgenda || []).find(x => x.evenementId === ev.id && x.eleveId === e.id);
  const oui = eleves.filter(e => rep(e)?.reponse === true).length, non = eleves.filter(e => rep(e)?.reponse === false).length;
  const sans = eleves.filter(e => !rep(e));
  const numeros = [...new Set(sans.flatMap(e => telephonesWhatsapp(e.parentTel)))];
  const classes = DB.classes.filter(c => eleves.some(e => e.classeId === c.id));
  ui._repAgenda = { ev, numeros };
  openModal(`✍️ ${ev.titre}`, `
    <p class="hint" style="margin-top:0;">${d.lib} · ${datesAgenda(ev)}</p>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;">
      <span class="badge green">${oui} ${d.ouiCourt}</span><span class="badge red">${non} ${d.nonCourt}</span><span class="badge">${sans.length} sans réponse</span></div>
    ${sans.length && numeros.length ? `<button type="button" class="btn secondary sm" style="margin-bottom:12px;" onclick="relancerReponsesAgenda()">📲 Relancer par WhatsApp les parents sans réponse (${numeros.length} numéro(s))</button>` : ''}
    ${classes.map(c => `<h4 style="margin:12px 0 6px;">${escapeHtml(c.nom)}</h4>
      <div class="table-wrap"><table><tbody>${eleves.filter(e => e.classeId === c.id).sort((a, b) => eleveFullName(a).localeCompare(eleveFullName(b))).map(e => { const r = rep(e); return `<tr>
        <td>${escapeHtml(eleveFullName(e))}</td>
        <td>${r ? `<span class="badge ${r.reponse ? 'green' : 'red'}">${r.reponse ? d.ouiCourt : d.nonCourt}</span>` : '<span class="hint">sans réponse</span>'}</td>
        <td style="white-space:nowrap;">${gestion ? `<button class="btn secondary sm" title="Réponse reçue sur papier ou par téléphone" onclick="noterReponseAgenda('${ev.id}','${e.id}',true)">Oui</button> <button class="btn secondary sm" onclick="noterReponseAgenda('${ev.id}','${e.id}',false)">Non</button>` : ''}</td>
      </tr>`; }).join('')}</tbody></table></div>`).join('') || '<div class="hint">Aucun élève concerné.</div>'}
    ${gestion ? '<p class="hint">« Oui / Non » : pour noter une réponse reçue sur papier ou par téléphone.</p>' : ''}`);
}
function relancerReponsesAgenda(){
  const { ev, numeros } = ui._repAgenda || {};
  if(!ev) return;
  const d = DEMANDES_REPONSE[ev.demandeReponse] || DEMANDES_REPONSE.autorisation;
  const message = `Bonjour, ${DB.meta?.nomEcole || 'l’école'} attend votre réponse (${d.lib.toLowerCase()}) pour « ${ev.titre} » — ${datesAgenda(ev)}. Merci de répondre dans l’application EcoMaZ Parents (accueil → À venir). Merci !`;
  ouvrirEnvoiWhatsapp('📲 Relance des parents', numeros, message, 'Touchez chaque numéro : WhatsApp s’ouvre avec ce message (gratuit).');
}
async function noterReponseAgenda(evenementId, eleveId, reponse){
  try{
    const { data, error } = await sb.from('reponses_agenda').upsert({ evenement_id: evenementId, eleve_id: eleveId, reponse, repondu_at: new Date().toISOString() }).select().single();
    if(error) throw error;
    DB.reponsesAgenda = (DB.reponsesAgenda || []).filter(x => !(x.evenementId === evenementId && x.eleveId === eleveId)).concat(rowToCamel(data));
    afficherReponsesAgenda((DB.agenda || []).find(x => x.id === evenementId));
  }catch(e){ alert('Erreur : ' + e.message); }
}
// Application école : page Agenda
// Agenda complet de l'école (passé et à venir), chargé une seule fois et partagé par tous les écrans
function chargerAgenda(){
  if(DB.agenda !== undefined) return;
  DB.agenda = null;
  sb.from('evenements_agenda').select('*').eq('ecole_id', session.ecoleId).order('date_debut')
    .then(({ data }) => { DB.agenda = rowsToCamel(data || []); if(['dashboard', 'agenda', 'notes', 'camps-de-base'].includes(ui.currentView)) renderView(ui.currentView); });
}
function renderAgenda(){
  chargerAgenda();
  const gestion = ['secretariat','direction','fondation'].includes(ui.role);
  const tous = ui.filters.agendaPasses;
  const sesClasses = ui.role === 'enseignant' ? new Set(classesVisibles().map(c => c.id)) : null;
  const liste = (DB.agenda || []).filter(e => (tous || e.dateFin >= todayISO()) && (!sesClasses || !e.classeIds || !e.classeIds.length || e.classeIds.some(id => sesClasses.has(id))));
  return `<div class="view active">
    ${gestion ? `<div class="panel">
      <div class="panel-head"><div><h2>📅 Ajouter une date</h2><div class="sub">Visible par le personnel et par les parents concernés. Les vacances arrêtent automatiquement les annonces et le rappel d’appel.</div></div></div>
      ${boutonRemplissage('agenda', 'SCHEMA_AGENDA', 'formAgenda')}
      <form id="formAgenda" onsubmit="return ajouterEvenementAgenda(event)">
        <div class="form-grid">
          <div class="field"><label>Titre</label><input name="titre" required minlength="2" maxlength="150" placeholder="Ex : Compositions du 1er trimestre"></div>
          <div class="field"><label>Type</label><select name="type">${Object.entries(TYPES_AGENDA).map(([k, v]) => `<option value="${k}">${v.ic} ${v.lib}</option>`).join('')}</select></div>
          <div class="field"><label>Du</label><input type="date" name="dateDebut" required value="${todayISO()}"></div>
          <div class="field"><label>Au (inclus)</label><input type="date" name="dateFin" required value="${todayISO()}"></div>
          <div class="field span2"><label>Précision (facultatif)</label><input name="description" maxlength="1000" placeholder="Ex : apporter la tenue de sport"></div>
          <div class="field span2"><label>Pour qui ?</label>
            <select name="cible" onchange="document.getElementById('choixClassesAgenda').style.display = this.value === 'classes' ? 'flex' : 'none'"><option value="tous">Toute l’école</option><option value="classes">Certaines classes</option></select>
            <div id="choixClassesAgenda" style="display:none;flex-wrap:wrap;gap:10px;margin-top:8px;">${DB.classes.map(c => `<label style="display:flex;align-items:center;gap:6px;"><input type="checkbox" name="classe" value="${c.id}"> ${escapeHtml(c.nom)}</label>`).join('')}</div></div>
        </div>
        <div class="field" style="margin-top:8px;"><label>Demander une réponse aux parents ?</label>
          <select name="demandeReponse"><option value="">Non, simple information</option><option value="autorisation">Oui : autorisation parentale (sortie, excursion…)</option><option value="presence">Oui : confirmation de présence (réunion, fête…)</option></select></div>
        <label style="display:flex;align-items:center;gap:8px;margin-top:8px;"><input type="checkbox" name="prevenir" checked> Prévenir les parents concernés par une notification</label>
        <div class="form-actions"><button class="btn" type="submit">Ajouter à l’agenda</button></div>
      </form>
    </div>` : ''}
    <div class="panel">
      <div class="panel-head"><div><h2>${tous ? 'Toutes les dates' : 'Dates à venir'}</h2></div>
        <button class="btn secondary sm" onclick="ui.filters.agendaPasses=${!tous}; renderView('agenda')">${tous ? 'À venir seulement' : 'Voir aussi les dates passées'}</button></div>
      ${DB.agenda === null ? '<div class="hint">Chargement…</div>' : !liste.length ? '<div class="empty-state"><div class="em-ic">📅</div>Aucune date pour l’instant.</div>' : `<div class="table-wrap"><table>
        <thead><tr><th>Date</th><th>Événement</th><th>Pour</th><th></th></tr></thead>
        <tbody>${liste.map(ev => `<tr>
          <td style="white-space:nowrap;">${datesAgenda(ev)}<br><span class="hint">${ev.dateFin >= todayISO() ? delaiAgenda(ev) : 'passé'}</span></td>
          <td>${(TYPES_AGENDA[ev.type] || TYPES_AGENDA.autre).ic} <strong>${escapeHtml(ev.titre)}</strong>${ev.description ? `<br><span class="hint">${escapeHtml(ev.description)}</span>` : ''}${ev.demandeReponse ? `<br><button class="btn secondary sm" style="margin-top:4px;" onclick="ouvrirReponsesAgenda('${ev.id}')">✍️ Réponses des parents</button>` : ''}</td>
          <td>${ev.classeIds && ev.classeIds.length ? ev.classeIds.map(classeName).join(', ') : 'Toute l’école'}</td>
          <td>${gestion ? `<button class="icon-btn danger" title="Supprimer" onclick="supprimerEvenementAgenda('${ev.id}')">🗑️</button>` : ''}</td>
        </tr>`).join('')}</tbody></table></div>`}
    </div>
  </div>`;
}
async function ajouterEvenementAgenda(ev){
  ev.preventDefault();
  const fd = new FormData(ev.target);
  if(fd.get('dateFin') < fd.get('dateDebut')) return alert('La date de fin doit être après la date de début.'), false;
  const classeIds = fd.get('cible') === 'classes' ? fd.getAll('classe') : null;
  if(classeIds && !classeIds.length) return alert('Cochez au moins une classe.'), false;
  const ligne = { titre: fd.get('titre').trim(), type: fd.get('type'), date_debut: fd.get('dateDebut'), date_fin: fd.get('dateFin'),
    description: (fd.get('description') || '').trim(), classe_ids: classeIds, demande_reponse: fd.get('demandeReponse') || null };
  try{
    const { data, error } = await sb.from('evenements_agenda').insert(ligne).select().single();
    if(error) throw error;
    DB.agenda = (DB.agenda || []).concat(rowToCamel(data)).sort((a, b) => a.dateDebut.localeCompare(b.dateDebut));
    if(fd.get('prevenir') === 'on'){
      const eleves = DB.eleves.filter(e => e.statut === 'Actif' && (!classeIds || classeIds.includes(e.classeId))).map(e => e.id);
      const evt = rowToCamel(data);
      notifierParentsPush(eleves, `${(TYPES_AGENDA[evt.type] || TYPES_AGENDA.autre).ic} ${evt.titre} — ${datesAgenda(evt)}${evt.demandeReponse ? ' · Merci de répondre dans l’application.' : ''}`);
    }
    toast('Ajouté à l’agenda'); renderView('agenda');
  }catch(e){ alert('Erreur : ' + e.message); }
  return false;
}
async function supprimerEvenementAgenda(id){
  if(!confirm('Supprimer cette date de l’agenda ?')) return;
  try{
    const { error } = await exigerEffet(sb.from('evenements_agenda').delete().eq('id', id));
    if(error) throw error;
    DB.agenda = (DB.agenda || []).filter(e => e.id !== id);
    toast('Date supprimée'); renderView('agenda');
  }catch(e){ alert('Erreur : ' + e.message); }
}
