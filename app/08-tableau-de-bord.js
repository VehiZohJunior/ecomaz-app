/* ---------------------------------------------------------------------
   4. TABLEAU DE BORD
   --------------------------------------------------------------------- */
let dashboardDejaAnime = false;
function animerCompteursKpi(){
  document.querySelectorAll('#viewContainer [data-compteur]').forEach(el => {
    const n = parseInt(el.dataset.compteur, 10);
    el.removeAttribute('data-compteur');
    if(window.EmMotion) EmMotion.countUp(el, n, { duration:900 }); else el.textContent = n;
  });
}
/* ---------- Refonte du tableau de bord (DESIGN.md §11) : affichage seulement ---------- */
function icone(nom){ return window.EmIcones ? EmIcones.svg(nom) : ''; }
function estJourDeClasse(iso){
  const j = ((new Date(iso + 'T12:00:00').getDay() + 6) % 7) + 1;
  return (DB.horairesAnnonces?.joursCours || [1, 2, 3, 4, 5]).includes(j);
}
// Bande unique « À faire aujourd'hui » : appel, pointage, demandes des familles
function renderAFaireAujourdhui(){
  const auj = todayISO(), admin = ['secretariat','direction','fondation'].includes(ui.role);
  const lignes = [];
  if(estJourDeClasse(auj)){
    const sansAppel = classesVisibles().filter(c => DB.eleves.some(e => e.classeId === c.id && e.statut === 'Actif') && !DB.presencesEleves.some(p => p.classeId === c.id && p.date === auj));
    if(sansAppel.length && hasAccess('presences-eleves')) lignes.push({ ic:'clipboard', texte:`Appel non fait dans ${sansAppel.length} classe${sansAppel.length > 1 ? 's' : ''}`, detail: sansAppel.slice(0, 4).map(c => c.nom).join(', ') + (sansAppel.length > 4 ? '…' : ''), bouton:'Faire l’appel', action:"go('presences-eleves')" });
    if(admin && hasAccess('presences-enseignants')){
      const nonPointes = DB.enseignants.filter(t => t.statut === 'Actif' && !DB.presencesEnseignants.some(p => p.enseignantId === t.id && p.date === auj));
      if(nonPointes.length) lignes.push({ ic:'clock', texte:`${nonPointes.length} enseignant${nonPointes.length > 1 ? 's' : ''} non pointé${nonPointes.length > 1 ? 's' : ''}`, detail:'', bouton:'Voir le pointage', action:"go('presences-enseignants')" });
    }
  }
  if(admin){
    chargerATraiter();
    const c = DB.aTraiter?.compteurs || {};
    SUJETS_A_TRAITER.filter(su => (!su.roles || su.roles.includes(ui.role)) && (c[su.cle] || 0) > 0)
      .forEach(su => lignes.push({ ic:'mail', texte:`${c[su.cle]} ${su.lib}`, detail:'', bouton:'Traiter', action:`DB.aTraiter.charge=0; go('${su.vue}')${su.cle === 'acces' ? "; allerAuxDemandesAcces()" : ''}` }));
  }
  return `<section class="panel afaire" aria-labelledby="titreAFaire">
    <div class="afaire-tete"><h2 id="titreAFaire">À faire aujourd’hui</h2>${lignes.length ? `<span class="afaire-compte">${lignes.length}</span>` : ''}</div>
    ${lignes.length ? `<ul class="afaire-liste">${lignes.map(l => `<li class="afaire-ligne">
        <span class="afaire-ic" aria-hidden="true">${icone(l.ic)}</span>
        <span class="afaire-txt"><strong>${escapeHtml(l.texte)}</strong>${l.detail ? `<span>${escapeHtml(l.detail)}</span>` : ''}</span>
        <button type="button" class="btn sm" onclick="${l.action}">${l.bouton}</button></li>`).join('')}</ul>`
      : `<div class="etat-vide etat-vide-ok"><span class="etat-vide-ic" aria-hidden="true">${icone('circle-check')}</span><span>Rien en attente : tout est à jour.</span></div>`}
  </section>`;
}
// Vue d'ensemble : une ligne par classe, détail en feuille
function renderLignesClasses(){
  const auj = todayISO();
  return DB.classes.map(c => {
    const eff = DB.eleves.filter(e => e.classeId === c.id && e.statut === 'Actif').length;
    const pres = DB.presencesEleves.filter(p => p.classeId === c.id && p.date === auj);
    const presents = pres.filter(p => p.statut !== 'Absent').length;
    const badge = pres.length ? `<span class="badge-etat ok">${icone('check')}Appel fait ${presents}/${eff}</span>` : `<span class="badge-etat attente">${icone('clock')}Appel non fait</span>`;
    return `<button type="button" class="ligne-classe" onclick="ouvrirDetailClasse('${c.id}')">
      <span class="lc-nom"><strong>${escapeHtml(c.nom)}</strong><small>${escapeHtml(c.cycle)}</small></span>
      <span class="lc-eff">${eff} élève${eff > 1 ? 's' : ''}</span>${badge}</button>`;
  }).join('');
}
function ouvrirDetailClasse(id){
  const c = DB.classes.find(x => x.id === id); if(!c) return;
  const auj = todayISO();
  const eleves = DB.eleves.filter(e => e.classeId === id && e.statut === 'Actif');
  const pres = DB.presencesEleves.filter(p => p.classeId === id && p.date === auj);
  const nb = s => pres.filter(p => p.statut === s).length;
  const tit = enseignantById(c.titulaireId);
  openModal(c.nom, `
    <div class="detail-lignes">
      <div><span>Cycle</span><strong>${escapeHtml(c.cycle)}</strong></div>
      <div><span>Effectif</span><strong>${eleves.length} élève${eleves.length > 1 ? 's' : ''}</strong></div>
      <div><span>Titulaire</span><strong>${tit ? escapeHtml(ensFullName(tit)) : 'Non désigné'}</strong></div>
      <div><span>Appel du jour</span><strong>${pres.length ? `${nb('Présent')} présents · ${nb('Absent')} absents · ${nb('Retard')} retards` : 'Non fait'}</strong></div>
    </div>
    <div class="form-actions">
      ${hasAccess('eleves') ? `<button type="button" class="btn secondary" onclick="closeModal(); go('eleves')">Voir les élèves</button>` : ''}
      ${hasAccess('presences-eleves') ? `<button type="button" class="btn" onclick="closeModal(); ui.filters.presEleves = { classeId:'${id}', date:'${auj}' }; go('presences-eleves')">${pres.length ? 'Voir l’appel' : 'Faire l’appel'}</button>` : ''}
    </div>`);
}
function renderBanniereNotifications(){
  if(!(pushPossible() && Notification.permission === 'default')) return '';
  try{ if(localStorage.getItem('ecomaz_banniere_push_fermee') === '1') return ''; }catch(_e){}
  return `<div class="banniere-discrete no-print" role="note">
    <span class="bd-ic" aria-hidden="true">${icone('bell')}</span>
    <span class="bd-txt">Recevez les alertes sur ce téléphone${ui.role === 'enseignant' ? ' (parent au portail, appel)' : ' (appel non fait, demandes, absences)'}.</span>
    <button type="button" class="btn sm" onclick="activerPush(false).then(ok => { if(ok){ toast('Notifications activées sur ce téléphone'); renderView('dashboard'); } })">Activer</button>
    <button type="button" class="bd-fermer" aria-label="Fermer" onclick="try{ localStorage.setItem('ecomaz_banniere_push_fermee','1'); }catch(_e){} this.closest('.banniere-discrete').remove()">${icone('x') || '×'}</button>
  </div>`;
}
/* =====================================================================
   TRÉSORERIE (fondation, direction) — traçabilité de l'argent qui entre et qui sort
   ===================================================================== */
const SOURCES_ENTREES = [
  ['Scolarité', () => (DB.paiementsScolarite || []).map(p => ({ m: Number(p.montant || 0), d: p.date, mode: p.modePaiement }))],
  ['Activités', () => (DB.paiementsCotisations || []).map(p => ({ m: Number(p.montant || 0), d: p.date, mode: p.modePaiement }))],
  ['Boutique', () => (DB.ventesGadgets || []).map(p => ({ m: Number(p.montantTotal || 0), d: p.date, mode: p.modePaiement }))],
];
const SOURCES_SORTIES = [
  ['Dépenses', () => (DB.depenses || []).map(p => ({ m: Number(p.montant || 0), d: p.date, mode: p.modePaiement }))],
  ['Salaires', () => (DB.paiementsSalaires || []).map(p => ({ m: Number(p.montant || 0), d: p.datePaiement || p.date, mode: p.modePaiement }))],
];
function moisDecale(mois, n){ const [a, m] = mois.split('-').map(Number); const d = new Date(a, m - 1 + n, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; }
function fluxDuMois(sources, mois){
  const parSource = sources.map(([lib, f]) => [lib, f().filter(x => String(x.d || '').startsWith(mois)).reduce((t, x) => t + x.m, 0)]);
  return { total: parSource.reduce((t, x) => t + x[1], 0), parSource };
}
function modesDuMois(mois){
  const r = {};
  SOURCES_ENTREES.forEach(([, f]) => f().filter(x => String(x.d || '').startsWith(mois)).forEach(x => { const k = x.mode || 'Non précisé'; r[k] = (r[k] || 0) + x.m; }));
  return Object.entries(r).sort((a, b) => b[1] - a[1]);
}
function etatRecouvrement(){
  const auj = todayISO(); let du = 0, paye = 0, echu = 0, enRetard = 0;
  const prochaines = {};
  (DB.eleves || []).filter(e => e.statut === 'Actif').forEach(e => {
    const g = scolariteEleveParEcheance(e.id); du += g.total; paye += Math.min(g.totalPaye, g.total);
    const r = retardsEleve(e); const ret = r.reduce((t, x) => t + x.reste, 0); if(ret){ echu += ret; enRetard++; }
    echeancesDeClasse(e.classeId).filter(x => x.dateEcheance && x.dateEcheance >= auj).forEach(x => {
      const d = g.detail.find(y => y.label === x.label); const reste = d ? Math.max(0, d.montant - d.paye) : Number(x.montant || 0);
      if(reste) (prochaines[x.dateEcheance] = prochaines[x.dateEcheance] || { total: 0, n: 0, label: x.label }), prochaines[x.dateEcheance].total += reste, prochaines[x.dateEcheance].n++;
    });
  });
  const dateProch = Object.keys(prochaines).sort()[0];
  return { du, paye, reste: Math.max(0, du - paye), echu, enRetard, taux: du ? Math.round(100 * paye / du) : 0, prochaine: dateProch ? { date: dateProch, ...prochaines[dateProch] } : null };
}
function chargerJournalTresorerie(){
  if(DB.journalTresorerie !== undefined) return;
  DB.journalTresorerie = null;
  const debutMois = thisMonthISO() + '-01';
  Promise.all([
    sb.from('journal_compta').select('table_cible, action, donnees_avant, donnees_apres, auteur_nom, auteur_role, created_at').eq('ecole_id', session.ecoleId).order('created_at', { ascending: false }).limit(6),
    sb.from('journal_compta').select('id', { count: 'exact', head: true }).eq('ecole_id', session.ecoleId).in('action', ['modification', 'suppression']).gte('created_at', debutMois),
  ]).then(([l, c]) => { DB.journalTresorerie = { lignes: l.data || [], corrections: c.count || 0 }; if(ui.currentView === 'dashboard') renderView('dashboard'); })
    .catch(() => { DB.journalTresorerie = { lignes: [], corrections: 0 }; });
}
function renderTresorerie(){
  const mois = thisMonthISO(), avant = moisDecale(mois, -1);
  const ent = fluxDuMois(SOURCES_ENTREES, mois), sor = fluxDuMois(SOURCES_SORTIES, mois), entAvant = fluxDuMois(SOURCES_ENTREES, avant);
  const solde = ent.total - sor.total, rec = etatRecouvrement(), modes = modesDuMois(mois);
  const nomMois = d => new Date(d + '-15T12:00:00').toLocaleDateString('fr-FR', { month: 'long' });
  const variation = entAvant.total ? Math.round(100 * (ent.total - entAvant.total) / entAvant.total) : null;
  // 6 derniers mois : entrées et sorties
  const six = [-5, -4, -3, -2, -1, 0].map(n => { const m = moisDecale(mois, n); return { m, e: fluxDuMois(SOURCES_ENTREES, m).total, s: fluxDuMois(SOURCES_SORTIES, m).total }; });
  const max = Math.max(1, ...six.map(x => Math.max(x.e, x.s)));
  const barres = six.map((x, i) => {
    const he = Math.round(78 * x.e / max), hs = Math.round(78 * x.s / max), X = 8 + i * 52;
    return `<g><title>${nomMois(x.m)} : entrées ${fmtFCFA(x.e)} · sorties ${fmtFCFA(x.s)}</title>
      <rect x="${X}" y="${90 - he}" width="18" height="${Math.max(he, x.e ? 2 : 0)}" rx="3" class="tr-b-ent"/>
      <rect x="${X + 21}" y="${90 - hs}" width="18" height="${Math.max(hs, x.s ? 2 : 0)}" rx="3" class="tr-b-sor"/>
      <text x="${X + 20}" y="104" text-anchor="middle" class="tr-b-lib">${new Date(x.m + '-15T12:00:00').toLocaleDateString('fr-FR', { month: 'short' }).replace('.', '')}</text></g>`;
  }).join('');
  // Traçabilité : derniers mouvements et corrections du mois (journal d'audit tenu par la base)
  chargerJournalTresorerie();
  const J = DB.journalTresorerie;
  const LIBS = { paiements_scolarite: 'Scolarité', paiements_cotisations: 'Activité', ventes_gadgets: 'Boutique', paiements_salaires: 'Salaire', depenses: 'Dépense', certifications_fne: 'Numéro FNE' };
  const mvt = l => {
    const d = l.donnees_apres || l.donnees_avant || {}, montant = Number(d.montant ?? d.montant_total ?? 0);
    const sortie = ['paiements_salaires', 'depenses'].includes(l.table_cible);
    const e = l.table_cible === 'paiements_salaires' ? '' : 'e';   // Dépense, Scolarité, Activité, Boutique : féminin
    const act = l.action === 'creation' ? '' : l.action === 'modification' ? `<span class="tr-tag avert">modifié${e}</span>` : `<span class="tr-tag alerte">supprimé${e}</span>`;
    return `<li class="tr-mvt"><span class="tr-sens ${sortie ? 'sor' : 'ent'}" aria-hidden="true">${sortie ? '−' : '+'}</span>
      <span class="tr-mvt-txt"><strong>${escapeHtml(LIBS[l.table_cible] || l.table_cible)} ${act}</strong><small>par ${escapeHtml(l.auteur_nom || 'compte inconnu')}${l.auteur_role ? ' (' + escapeHtml(l.auteur_role) + ')' : ''} · ${new Date(l.created_at).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</small></span>
      <span class="tr-mvt-m ${sortie ? 'sor' : 'ent'}">${montant ? (sortie ? '−' : '+') + fmtFCFA(montant) : ''}</span></li>`;
  };
  // Alertes intelligentes
  const alertes = [];
  if(sor.total > ent.total && sor.total > 0) alertes.push(['alerte', `Ce mois, les sorties (${fmtFCFA(sor.total)}) dépassent les entrées (${fmtFCFA(ent.total)}).`]);
  if(J && J.corrections) alertes.push(['avert', `${J.corrections} mouvement${J.corrections > 1 ? 's' : ''} d’argent modifié${J.corrections > 1 ? 's' : ''} ou supprimé${J.corrections > 1 ? 's' : ''} ce mois — à contrôler dans le journal d’audit.`]);
  const tousEnc = SOURCES_ENTREES.flatMap(([, f]) => f()).map(x => x.d).filter(Boolean).sort();
  const dernier = tousEnc[tousEnc.length - 1];
  const joursSans = dernier ? Math.round((Date.parse(todayISO()) - Date.parse(dernier)) / 86400000) : null;
  if(!dernier) alertes.push(['avert', 'Aucun encaissement n’est encore enregistré : saisissez les versements reçus pour suivre l’argent.']);
  else if(joursSans >= 14) alertes.push(['avert', `Aucun encaissement enregistré depuis ${joursSans} jours (dernier le ${fmtDate(dernier)}).`]);
  const especes = modes.find(([k]) => /esp[eè]ce/i.test(k));
  if(especes && ent.total && especes[1] / ent.total >= 0.5) alertes.push(['info', `${Math.round(100 * especes[1] / ent.total)} % des entrées du mois sont en espèces (${fmtFCFA(especes[1])}) : pensez au dépôt en banque et au rapprochement de caisse.`]);
  const ouvrir = (onglet) => `ui.filters.comptaTab='${onglet}'; go('comptabilite')`;
  return `<section class="panel tresorerie" aria-labelledby="titreTreso">
    <div class="panel-head"><div><h2 id="titreTreso">${icone('wallet')} Trésorerie</h2><div class="sub">${nomMois(mois).replace(/^./, c => c.toUpperCase())} — l’argent qui entre, qui sort, et qui l’a enregistré</div></div>
      <button type="button" class="btn secondary sm" onclick="${ouvrir('apercu')}">Comptabilité</button></div>
    <div class="tr-flux">
      <div class="tr-carte ent"><small>Entrées du mois</small><strong>${fmtFCFA(ent.total)}</strong>
        <span class="tr-var">${variation === null ? (entAvant.total ? '' : 'mois précédent : 0') : `${variation >= 0 ? '▲' : '▼'} ${Math.abs(variation)} % vs ${nomMois(avant)}`}</span>
        <ul class="tr-detail">${ent.parSource.filter(x => x[1]).map(([l, m]) => `<li><span>${l}</span><b>${fmtFCFA(m)}</b></li>`).join('') || '<li><span>Aucune entrée ce mois</span></li>'}</ul></div>
      <div class="tr-carte sor"><small>Sorties du mois</small><strong>${fmtFCFA(sor.total)}</strong>
        <ul class="tr-detail">${sor.parSource.filter(x => x[1]).map(([l, m]) => `<li><span>${l}</span><b>${fmtFCFA(m)}</b></li>`).join('') || '<li><span>Aucune sortie ce mois</span></li>'}</ul></div>
      <div class="tr-carte solde ${solde < 0 ? 'neg' : ''}"><small>Solde du mois</small><strong>${solde < 0 ? '−' : ''}${fmtFCFA(Math.abs(solde))}</strong><span class="tr-var">entrées − sorties</span></div>
    </div>
    ${alertes.length ? `<ul class="tr-alertes">${alertes.map(([t, m]) => `<li class="tr-al ${t}">${escapeHtml(m)}</li>`).join('')}</ul>` : ''}
    <div class="tr-grille">
      <div class="tr-bloc">
        <h3>Recouvrement de la scolarité</h3>
        <div class="tr-taux"><strong>${rec.taux} %</strong><span>${fmtFCFA(rec.paye)} encaissés sur ${fmtFCFA(rec.du)}</span></div>
        <div class="tr-jauge" role="progressbar" aria-valuenow="${rec.taux}" aria-valuemin="0" aria-valuemax="100"><div style="width:${rec.taux}%"></div></div>
        <ul class="tr-detail">
          ${!(DB.paiementsScolarite || []).length ? '<li class="tr-provisoire"><span>Chiffres provisoires : aucun versement n’est encore saisi.</span></li>' : ''}
          <li><span>En retard (échéances dépassées)</span><b class="${rec.echu ? 'neg' : ''}">${fmtFCFA(rec.echu)}${rec.enRetard ? ` · ${rec.enRetard} élève${rec.enRetard > 1 ? 's' : ''}` : ''}</b></li>
          <li><span>Pas encore échu</span><b>${fmtFCFA(Math.max(0, rec.reste - rec.echu))}</b></li>
          ${rec.prochaine ? `<li><span>Prochaine échéance : ${fmtDate(rec.prochaine.date)} (${escapeHtml(rec.prochaine.label)})</span><b>${fmtFCFA(rec.prochaine.total)} attendus</b></li>` : ''}
        </ul>
        ${rec.echu ? `<button type="button" class="btn sm" onclick="ui.filters.comptaTab='scolarite'; go('comptabilite'); setTimeout(() => ouvrirRelanceImpayes(), 200)">Relancer les retards</button>` : ''}
      </div>
      <div class="tr-bloc">
        <h3>Comment l’argent est entré ce mois</h3>
        ${modes.length ? `<ul class="tr-modes">${modes.map(([k, m]) => `<li><span>${escapeHtml(k)}</span><span class="tr-mode-barre"><i style="width:${Math.round(100 * m / ent.total)}%"></i></span><b>${Math.round(100 * m / ent.total)} %</b></li>`).join('')}</ul>` : '<div class="hint" style="margin:0;">Aucune entrée ce mois.</div>'}
        <h3 style="margin-top:14px;">Six derniers mois</h3>
        <svg class="tr-graph" viewBox="0 0 320 110" role="img" aria-label="Entrées et sorties des six derniers mois">${barres}</svg>
        <div class="tr-legende"><span><i class="ent"></i>Entrées</span><span><i class="sor"></i>Sorties</span></div>
      </div>
    </div>
    <div class="tr-bloc tr-trace">
      <div class="tr-trace-tete"><h3>Derniers mouvements enregistrés</h3><button type="button" class="lien-discret" onclick="${ouvrir('journal')}">Journal d’audit complet</button></div>
      ${J === null ? '<div class="hint">Chargement…</div>' : J && J.lignes.length ? `<ul class="tr-mvts">${J.lignes.map(mvt).join('')}</ul>` : '<div class="hint" style="margin:0;">Aucun mouvement enregistré pour l’instant.</div>'}
      <div class="hint" style="margin:6px 0 0;">Chaque création, modification ou suppression est notée automatiquement par la base, avec l’auteur et l’heure : personne ne peut l’effacer.</div>
    </div>
  </section>`;
}
function montantKpi(n){ return `${Math.round(n || 0).toLocaleString('fr-FR')}<span class="kpi-unite">${DEVISE}</span>`; }
/* =====================================================================
   ACCUEIL ENSEIGNANT — « Mes tâches », par ordre de priorité
   1. Aujourd'hui  2. Cette semaine  3. Ce mois-ci  4. Ce trimestre.
   Chaque tâche : un état clair (fait / à faire / à préparer), une phrase
   simple, un seul bouton. Tout est calculé sur les vraies données de
   l'enseignant (ses classes, ses matières, l'agenda de l'école).
   ===================================================================== */
function enVacances(iso){ return (DB.agenda || []).some(a => a.type === 'vacances' && (!a.classeIds || !a.classeIds.length) && a.dateDebut <= iso && a.dateFin >= iso); }
function estJourDeCours(iso){ return estJourDeClasse(iso) && !enVacances(iso); }
function listeJours(debut, fin){ const r = [], d = new Date(debut + 'T12:00:00'); while(isoLocal(d) <= fin){ r.push(isoLocal(d)); d.setDate(d.getDate() + 1); } return r; }
function dateLongueFr(iso){ return new Date(iso + 'T12:00:00').toLocaleDateString('fr-FR', { weekday:'long', day:'numeric', month:'long' }); }
function ecartJours(iso){ return Math.round((new Date(iso + 'T12:00:00') - new Date(todayISO() + 'T12:00:00')) / 86400000); }
function dansNJours(iso){ const n = ecartJours(iso); return n === 0 ? 'aujourd’hui' : n === 1 ? 'demain' : n > 1 ? `dans ${n} jours` : `il y a ${-n} jour${n < -1 ? 's' : ''}`; }
function matieresDeEnseignant(fiche, classeId){ return (fiche && (fiche.matieres || []).length) ? fiche.matieres : (MATIERES_BY_CYCLE[classeCycle(classeId)] || []); }
function finDuTrimestre(trim){
  const n = trim === 'Trimestre 1' ? 1 : trim === 'Trimestre 2' ? 2 : 3;
  const re = n === 1 ? /fin du\s*1(er)?\s*trimestre/i : n === 2 ? /fin du\s*2e?\s*trimestre/i : /fin (du\s*3e?\s*trimestre|de l.ann[ée]e)/i;
  const ev = (DB.agenda || []).find(e => re.test(e.titre || ''));
  return ev ? (ev.dateFin || ev.dateDebut) : '';
}
function libelleTrimestre(trim){ return { 'Trimestre 1':'1er trimestre', 'Trimestre 2':'2e trimestre', 'Trimestre 3':'3e trimestre' }[trim] || trim; }
function allerAppel(classeId, date){ ui.filters.presEleves = { classeId, date }; go('presences-eleves'); }
function allerEvaluation(id){
  const ev = (DB.evaluations || []).find(e => e.id === id); if(!ev) return go('camps-de-base');
  ui.filters.camps = { classeId: ev.classeId, matiere: ev.matiere, trimestre: ev.trimestre }; ui.filters.campsEval = id; go('camps-de-base');
}
function allerNotesClasse(classeId, trim){ ui.filters.notes = Object.assign({}, ui.filters.notes || {}, { classeId, trimestre: trim, matiere:'', auto: false }); go('notes'); }

// Une tâche : etat = 'fait' | 'afaire' | 'prevoir' (à préparer, pas encore urgent) | 'info'
function htmlTache(t){
  const ic = { fait:'circle-check', afaire:'circle-dot', prevoir:'hourglass', info:'lightbulb' }[t.etat];
  const lib = { fait:'Fait', afaire:'À faire', prevoir:'À préparer', info:'À savoir' }[t.etat];
  return `<li class="tache tache-${t.etat}">
    <span class="tache-etat"><span class="tache-ic" aria-hidden="true">${icone(ic)}</span><span class="tache-lib">${lib}</span></span>
    <span class="tache-txt"><strong>${t.titre}</strong>${t.detail ? `<small>${t.detail}</small>` : ''}</span>
    ${t.bouton ? `<button type="button" class="btn${t.etat === 'afaire' ? '' : ' secondary'} tache-btn" onclick="${t.action}">${t.bouton}</button>` : ''}
  </li>`;
}
function htmlBlocTaches(num, titre, sousTitre, taches, vide){
  const reste = taches.filter(t => t.etat === 'afaire').length, faits = taches.filter(t => t.etat === 'fait').length;
  const compte = reste ? `<span class="taches-compte afaire">${reste} à faire</span>` : (taches.length ? `<span class="taches-compte ok">${icone('check')} À jour</span>` : '');
  const tri = { afaire:0, prevoir:1, info:2, fait:3 };
  return `<section class="panel taches-bloc taches-${num}" aria-labelledby="taches-t${num}">
    <div class="taches-tete"><span class="taches-num" aria-hidden="true">${num}</span>
      <div class="taches-titres"><h2 id="taches-t${num}">${titre}</h2><div class="sub">${sousTitre}</div></div>${compte}</div>
    ${taches.length ? `<ul class="taches-liste">${taches.slice().sort((a, b) => tri[a.etat] - tri[b.etat]).map(htmlTache).join('')}</ul>` : `<div class="etat-vide etat-vide-ok"><span class="etat-vide-ic" aria-hidden="true">${icone('circle-check')}</span><span>${vide}</span></div>`}
    ${faits && reste ? `<div class="taches-pied">${faits} tâche${faits > 1 ? 's' : ''} déjà faite${faits > 1 ? 's' : ''}</div>` : ''}
  </section>`;
}
function renderAccueilEnseignant(){
  const auj = todayISO();
  const fiche = session.enseignantId ? enseignantById(session.enseignantId) : null;
  const dateLongue = (d => d.charAt(0).toUpperCase() + d.slice(1))(new Date(auj + 'T12:00:00').toLocaleDateString('fr-FR', { weekday:'long', day:'numeric', month:'long', year:'numeric' }));
  const mes = classesVisibles();
  const entete = `<div class="db-bonjour"><div><h2>${escapeHtml(salutation())}</h2><div class="db-date">${dateLongue}</div>
    ${mes.length ? `<div class="mes-classes">${icone('school')} ${mes.length > 1 ? 'Mes classes' : 'Ma classe'} : <strong>${mes.map(c => escapeHtml(c.nom)).join(', ')}</strong></div>` : ''}${renderQuestionAppel()}</div></div>`;
  const annexe = `<details class="panel acc-annexe" open><summary>${icone('users')} Mon inscription et la liste des enseignants</summary>${renderJeMEnrole()}${renderListeCollegues()}</details>`;
  if(!fiche) return `<div class="view active">${entete}${renderJeMEnrole()}${renderListeCollegues()}</div>`;
  if(!(fiche.classesAssignees || []).length) return `<div class="view active">${entete}
    <div class="panel acc-attente"><h2>${icone('hourglass')} Vos classes sont en attente de validation</h2>
      <p>Dès que la direction aura validé vos classes, cette page vous montrera chaque jour ce que vous avez à faire, dans l’ordre.</p></div>
    ${renderJeMEnrole()}${renderListeCollegues()}</div>`;

  // Données nécessaires (chargées une fois, puis la page se réaffiche)
  chargerAgenda(); chargerSecuriteEleves();
  const reafficher = () => { if(ui.currentView === 'dashboard') renderView('dashboard'); };
  if(DB.absencesSignalees === undefined){ DB.absencesSignalees = null; chargerAbsencesSignalees().then(reafficher).catch(() => { DB.absencesSignalees = []; }); }
  if(DB.devoirs === undefined){ DB.devoirs = null; sb.from('devoirs').select('*').eq('ecole_id', session.ecoleId).gte('pour_le', isoDansJours(-14)).order('pour_le')
    .then(({ data }) => { DB.devoirs = rowsToCamel(data || []); reafficher(); }); }
  if(DB.evaluations === undefined){ DB.evaluations = null; sb.from('evaluations').select('*').eq('ecole_id', session.ecoleId).order('date')
    .then(({ data }) => { DB.evaluations = rowsToCamel(data || []); reafficher(); }); }
  chargerSujets();

  const classes = classesVisibles().filter(c => DB.eleves.some(e => e.classeId === c.id && e.statut === 'Actif'));
  const effectif = id => DB.eleves.filter(e => e.classeId === id && e.statut === 'Actif');
  const appelFait = (id, d) => DB.presencesEleves.some(p => p.classeId === id && p.date === d);
  const coursAuj = estJourDeCours(auj);
  const prochain = prochainJourDeClasse(auj);
  const quandProchain = prochain ? (prochain === isoDansJours(1) ? 'demain' : dateLongueFr(prochain)) : '';

  /* ---------- 1. AUJOURD'HUI ---------- */
  const jour = [];
  // Le rappel « Pensez à l'appel » n'arrive que si les alertes sont activées sur CE téléphone
  const tacheAlertes = tacheAlertesTelephone();
  const sansHoraire = !creneauxEnseignant(fiche).length;
  if(sansHoraire) jour.push({ etat:'afaire', titre:'Indiquer mes jours et heures de cours', detail:'Pour chaque classe : les jours et les heures où vous faites cours. Les rappels d’appel n’arrivent qu’à ces moments-là (aucun rappel tant que ce n’est pas rempli).', bouton:'Indiquer mes horaires', action:"ui.filters.enroleOuvert=true; renderView('dashboard'); setTimeout(() => document.getElementById('jeMEnrole')?.scrollIntoView({ block:'start' }), 80)" });
  if(tacheAlertes && !sansHoraire) jour.push(tacheAlertes);
  const mesCoursAuj = creneauxDuJour(fiche, auj);
  if(coursAuj && mesCoursAuj.length) jour.push({ etat:'info', titre:'Mes cours aujourd’hui', detail: mesCoursAuj.map(c => `${escapeHtml(classeName(c.classe))} de ${heureLisible(c.debut)} à ${heureLisible(c.fin)}`).join(' · ') });
  if(coursAuj){
    classes.filter(c => aCoursLe(fiche, c.id, auj)).forEach(c => {
      const pres = DB.presencesEleves.filter(p => p.classeId === c.id && p.date === auj);
      if(pres.length){
        const nb = st => pres.filter(p => p.statut === st).length;
        jour.push({ etat:'fait', titre:`Appel fait — ${escapeHtml(c.nom)}`, detail:`${nb('Présent')} présent(s) · ${nb('Absent')} absent(s) · ${nb('Retard')} en retard`, bouton:'Voir', action:`allerAppel('${c.id}','${auj}')` });
      } else {
        jour.push({ etat:'afaire', titre:`Faire l’appel — ${escapeHtml(c.nom)}`, detail:`${effectif(c.id).length} élèves. Touchez « Présent », « Absent » ou « Retard » pour chacun : les parents des absents sont prévenus.`, bouton:'Faire l’appel', action:`allerAppel('${c.id}','${auj}')` });
      }
    });
  }
  if(prochain && DB.devoirs){
    classes.filter(c => aCoursLe(fiche, c.id, auj) || aCoursLe(fiche, c.id, prochain)).forEach(c => {
      const dv = DB.devoirs.filter(d => d.classeId === c.id && d.pourLe === prochain);
      jour.push(dv.length
        ? { etat:'fait', titre:`Cahier de textes rempli pour ${quandProchain} — ${escapeHtml(c.nom)}`, detail: dv.map(d => escapeHtml(d.matiere || 'travail')).join(', '), bouton:'Voir', action:`ui.filters.devoirsClasse='${c.id}'; go('devoirs')` }
        : { etat:'afaire', titre:`Noter les devoirs pour ${quandProchain} — ${escapeHtml(c.nom)}`, detail:'Écrivez le travail à faire à la maison : les parents le lisent dans leur application.', bouton:'Noter un devoir', action:`ui.filters.devoirsClasse='${c.id}'; go('devoirs')` });
    });
  }
  // À savoir aujourd'hui (pas des tâches : des informations utiles pour la classe)
  const moiPointe = (DB.presencesEnseignants || []).find(p => p.enseignantId === fiche.id && p.date === auj);
  if(coursAuj) jour.push(moiPointe
    ? { etat:'info', titre:`Votre arrivée est enregistrée${moiPointe.heureArrivee ? ' à ' + escapeHtml(String(moiPointe.heureArrivee).slice(0, 5)) : ''}`, detail: moiPointe.statut === 'Retard' ? `Noté en retard${moiPointe.minutesRetard ? ` (${moiPointe.minutesRetard} min)` : ''}.` : '' }
    : { etat:'info', titre:'Votre arrivée n’est pas encore enregistrée', detail:'Pointez-la dans « Mon pointage » ci-dessus (GPS, QR de l’école ou photo), depuis l’établissement, ou faites scanner votre badge à l’accueil.' });
  const jourIso = ((new Date().getDay() + 6) % 7) + 1;
  const renfAuj = coursAuj && (DB.horairesAnnonces?.joursRenforcement || [1, 2, 3, 4, 5]).includes(jourIso);
  if(coursAuj) classes.forEach(c => {
    const eleves = effectif(c.id);
    const signales = eleves.map(e => ({ e, a: absenceSignalee(e.id, auj) })).filter(x => x.a);
    if(signales.length) jour.push({ etat:'info', titre:`Absence(s) prévenue(s) par les parents — ${escapeHtml(c.nom)}`, detail: signales.map(x => `${escapeHtml(eleveFullName(x.e))} (${escapeHtml(x.a.motif || 'motif non précisé')})`).join(', ') });
    const al = eleves.map(e => ({ e, s: santeDe(e.id) })).filter(x => x.s && x.s.allergies);
    if(al.length) jour.push({ etat:'info', titre:`Allergies à surveiller — ${escapeHtml(c.nom)}`, detail: al.map(x => `${escapeHtml(eleveFullName(x.e))} (${escapeHtml(x.s.allergies)})`).join(', ') });
    const renf = renfAuj ? eleves.filter(e => e.renforcement) : [];
    if(renf.length) jour.push({ etat:'info', titre:`Cours de renforcement ce soir — ${escapeHtml(c.nom)}`, detail: renf.map(e => escapeHtml(eleveFullName(e))).join(', ') });
    const arrivees = (DB.notificationsPortier || []).filter(n => n.classeId === c.id && String(n.createdAt || '').slice(0, 10) === auj);
    if(arrivees.length) jour.push({ etat:'info', titre:`Parents arrivés au portail — ${escapeHtml(c.nom)}`, detail: arrivees.map(n => `${escapeHtml(n.eleveNom)} (${new Date(n.createdAt).toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' })})`).join(', ') });
  });

  /* ---------- 2. CETTE SEMAINE ---------- */
  const lundi = lundiDe(auj), semaine = [];
  const passesSemaine = listeJours(lundi, auj).filter(d => d < auj && estJourDeCours(d));
  const manques = [];
  passesSemaine.forEach(d => classes.forEach(c => { if(aCoursLe(fiche, c.id, d) && !appelFait(c.id, d)) manques.push({ d, c }); }));
  manques.slice(0, 5).forEach(({ d, c }) => semaine.push({ etat:'afaire', titre:`Rattraper l’appel du ${dateLongueFr(d)} — ${escapeHtml(c.nom)}`, detail:'Cet appel n’a pas été enregistré.', bouton:'Rattraper', action:`allerAppel('${c.id}','${d}')` }));
  if(manques.length > 5) semaine.push({ etat:'afaire', titre:`${manques.length - 5} autre(s) appel(s) à rattraper cette semaine`, bouton:'Ouvrir le cahier d’appel', action:"go('cahier-appel')" });
  if(passesSemaine.length && !manques.length) semaine.push({ etat:'fait', titre:'Tous les appels de la semaine sont faits', detail:'Merci : les parents sont informés chaque jour.' });
  const trim = trimestreDeDate(auj), ids = new Set(classes.map(c => c.id));
  if(DB.evaluations){
    const mesEvals = DB.evaluations.filter(e => ids.has(e.classeId) && e.trimestre === trim && e.date <= auj
      && (!(fiche.matieres || []).length || fiche.matieres.includes(e.matiere)));
    mesEvals.forEach(ev => {
      const eff = effectif(ev.classeId).length;
      const saisies = new Set((DB.notes || []).filter(n => n.evaluationId === ev.id && n.note != null).map(n => n.eleveId)).size;
      if(eff && saisies < eff) semaine.push({ etat:'afaire', titre:`Saisir les notes — ${escapeHtml(ev.type)}${ev.titre ? ' « ' + escapeHtml(ev.titre) + ' »' : ''} (${escapeHtml(classeName(ev.classeId))})`,
        detail:`${escapeHtml(ev.matiere)} · du ${fmtDate(ev.date)} · ${saisies} note(s) sur ${eff} élèves`, bouton:'Saisir les notes', action:`allerEvaluation('${ev.id}')` });
    });
    // Évaluations validées (Je crée une évaluation) dont le jour est passé : la grille de notes se crée en un geste
    tachesNotesDepuisSujets(fiche, ids, auj, effectif).forEach(t => semaine.push(t));
    const cetteSemaine = mesEvals.filter(e => e.date >= lundi).length;
    semaine.push(cetteSemaine
      ? { etat:'fait', titre:`${cetteSemaine} exercice(s) ou devoir(s) noté(s) enregistré(s) cette semaine`, detail:'Ils comptent dans la moyenne de classe du bulletin (Camps de base).', bouton:'Voir', action:"go('camps-de-base')" }
      : { etat:'afaire', titre:'Enregistrer les exercices et devoirs notés de la semaine', detail:'Devoirs, exercices de classe ou de maison, interrogations : ils font la moyenne de classe du bulletin (Camps de base).', bouton:'Ajouter une note', action:"go('camps-de-base')" });
  }

  /* ---------- 3. CE MOIS-CI ---------- */
  const mois = [], debutMois = auj.slice(0, 8) + '01';
  // Jours passés du mois (aujourd'hui compte seulement une fois l'appel fait : la journée n'est pas finie)
  const joursMois = listeJours(debutMois, auj).filter(d => estJourDeCours(d) && (d < auj || classes.every(c => appelFait(c.id, d))));
  if(joursMois.length && classes.length){
    const attendus = joursMois.length * classes.length;
    const faits = joursMois.reduce((s, d) => s + classes.filter(c => appelFait(c.id, d)).length, 0);
    mois.push({ etat: faits >= attendus ? 'fait' : 'afaire',
      titre:`Appel fait ${faits} fois sur ${attendus} ce mois-ci`, detail: faits >= attendus ? 'Régularité parfaite.' : 'Chaque jour de classe compte : la direction suit cette régularité.', bouton:'Mon rapport', action:"go('rapport-activite')" });
  }
  const mesProg = (DB.programmes || []).filter(p => p.enseignantId === fiche.id && (!p.trimestre || p.trimestre === trim));
  if(!mesProg.length) mois.push({ etat:'afaire', titre:`Enregistrer mon programme du ${libelleTrimestre(trim)}`, detail:'Une ligne par matière et par classe, puis le pourcentage déjà fait.', bouton:'Ajouter mon programme', action:"go('programmes')" });
  else {
    const vieux = mesProg.filter(p => !p.dateMaj || ecartJours(p.dateMaj) < -30);
    const moy = Math.round(mesProg.reduce((s, p) => s + (Number(p.progression) || 0), 0) / mesProg.length);
    mois.push(vieux.length
      ? { etat:'afaire', titre:'Mettre à jour l’avancement de mon programme', detail:`${vieux.length} matière(s) non mise(s) à jour depuis plus d’un mois · avancement moyen ${moy} %`, bouton:'Mettre à jour', action:`go('programmes'); ouvrirAvancement('${vieux[0].id}')` }
      : { etat:'fait', titre:`Programme à jour — avancement moyen ${moy} %`, detail:`${mesProg.length} matière(s) suivie(s).`, bouton:'Voir', action:"go('programmes')" });
  }

  /* ---------- 4. CE TRIMESTRE ---------- */
  const trimestre = [], finTrim = finDuTrimestre(trim);
  classes.forEach(c => {
    const compos = compositionsAgenda(c.id, trim);
    const passees = compos.filter(e => e.dateDebut <= auj), avenir = compos.filter(e => e.dateDebut > auj);
    if(avenir.length){
      const ev = avenir[0], n = ecartJours(ev.dateDebut);
      trimestre.push({ etat: n <= 14 ? 'afaire' : 'prevoir', titre:`Préparer : ${escapeHtml(ev.titre)} — ${escapeHtml(c.nom)}`, detail:`Le ${dateLongueFr(ev.dateDebut)} (${dansNJours(ev.dateDebut)}). Révisions et sujets à prévoir.`, bouton:'Voir l’agenda', action:"go('agenda')" });
    }
    if(passees.length){
      const eleves = effectif(c.id), mats = matieresDeEnseignant(fiche, c.id);
      const attendues = eleves.length * mats.length * passees.length;
      const saisies = (DB.notes || []).filter(nn => nn.type === 'Composition' && nn.trimestre === trim && nn.note != null && mats.includes(nn.matiere) && eleves.some(e => e.id === nn.eleveId)).length;
      if(attendues) trimestre.push(saisies >= attendues
        ? { etat:'fait', titre:`Notes de composition saisies — ${escapeHtml(c.nom)}`, detail:`${saisies} note(s).`, bouton:'Voir', action:`allerNotesClasse('${c.id}','${trim}')` }
        : { etat:'afaire', titre:`Saisir les notes de composition — ${escapeHtml(c.nom)}`, detail:`${saisies} note(s) saisie(s) sur ${attendues} attendue(s)${finTrim ? ` · avant le ${fmtDate(finTrim)}` : ''}.`, bouton:'Saisir les notes', action:`allerNotesClasse('${c.id}','${trim}')` });
    }
    if(!compos.length) trimestre.push({ etat:'info', titre:`Dates de composition pas encore fixées — ${escapeHtml(c.nom)}`, detail:'Elles apparaîtront ici dès que la direction les aura mises à l’agenda.' });
    // Appréciations du bulletin : titulaire de la classe (ou enseignant de toutes les matières)
    const titulaire = c.titulaireId ? c.titulaireId === fiche.id : !(fiche.matieres || []).length;
    if(titulaire){
      const eleves = effectif(c.id);
      const ecrites = eleves.filter(e => String((DB.bulletinsComments || {})[`${e.id}_${trim}`] || '').trim()).length;
      const proche = finTrim && ecartJours(finTrim) <= 21;
      trimestre.push(ecrites >= eleves.length
        ? { etat:'fait', titre:`Appréciations du bulletin écrites — ${escapeHtml(c.nom)}`, detail:`${ecrites} élève(s).` }
        : { etat: proche ? 'afaire' : 'prevoir', titre:`Écrire les appréciations du bulletin — ${escapeHtml(c.nom)}`, detail:`${ecrites} sur ${eleves.length} écrite(s)${finTrim ? ` · à terminer avant le ${fmtDate(finTrim)} (${dansNJours(finTrim)})` : ''}.`, bouton:'Écrire', action:`allerAppreciations('${c.id}','${trim}')` });
    }
  });

  const resteJour = jour.filter(t => t.etat === 'afaire').length, faitJour = jour.filter(t => t.etat === 'fait').length, totalJour = resteJour + faitJour;
  const pct = totalJour ? Math.round(100 * faitJour / totalJour) : 100;
  const bandeau = !coursAuj
    ? `<div class="acc-resume repos">${icone('sun')}<div><strong>Pas de classe aujourd’hui.</strong><span>${prochain ? `Prochain jour de classe : ${dateLongueFr(prochain)}.` : ''} Vous pouvez préparer la suite ci-dessous.</span></div></div>`
    : `<div class="acc-resume${resteJour ? '' : ' fini'}">${icone(resteJour ? 'target' : 'party-popper')}<div><strong>${resteJour ? `Il vous reste ${resteJour} tâche${resteJour > 1 ? 's' : ''} aujourd’hui` : 'Bravo, tout est fait pour aujourd’hui'}</strong>
        <span>Commencez par le haut de la liste : le plus important est en premier.</span>
        <div class="acc-barre" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" aria-label="Tâches du jour faites"><div style="width:${pct}%"></div></div></div></div>`;
  const chargement = DB.evaluations === null || DB.devoirs === null ? '<div class="hint">Chargement de vos tâches…</div>' : '';
  const outils = [
    ['presences-eleves', '✅', 'Faire l’appel', 'Présents, absents, retards'],
    ['devoirs', '📘', 'Cahier de textes', 'Devoirs pour les parents'],
    ['camps-de-base', '🎯', 'Camps de base', 'Exercices et devoirs notés'],
    ['notes', '📝', 'Notes et bulletins', 'Compositions, appréciations'],
    ['emploi-temps', '🗓️', 'Emploi du temps', 'Mes cours de la semaine'],
    ['programmes', '📚', 'Mon programme', 'Avancement par matière'],
    ['cahier-appel', '📋', 'Cahier d’appel', 'Tous les appels du mois'],
    ['rapport-activite', '📈', 'Mon rapport', 'Mon activité, par période'],
    ['agenda', '📅', 'Agenda de l’école', 'Compositions, congés, fêtes'],
    ['vie-ecole', '📷', 'Vie de l’école', 'Photos et nouvelles'],
  ].filter(o => hasAccess(o[0]));
  return `<div class="view active acc-ens">
    ${renderAccueilApp()}
    ${entete}
    ${bandeau}
    ${chargement}
    ${(() => { const nb = l => String(l.filter(t => t.etat === 'afaire').length || ''); const mp = monPointageDuJour(); return barreRubriques([
      session.enseignantId ? rubrique('pointage', 'Mon pointage', 'Mon pointage du jour', 'map-pin', renderMonPointage(), () => mp?.heureArrivee ? (mp.heureDepart ? '✓' : String(mp.heureArrivee).slice(0, 5)) : '!') : null,
      coursAuj ? rubrique('cours', 'Mes cours', 'Mes cours aujourd’hui', 'calendar-days', `<div class="panel acc-cours">${renderFriseDuJour(classes)}</div>`) : null,
      rubrique('jour', 'Aujourd’hui', 'Aujourd’hui', 'circle-dot', htmlBlocTaches(1, 'Aujourd’hui', coursAuj ? 'À faire chaque jour de classe' : 'Pas de classe aujourd’hui : préparez le prochain jour', jour, 'Rien à faire aujourd’hui.'), () => nb(jour)),
      rubrique('semaine', 'Cette semaine', 'Cette semaine', 'calendar-range', htmlBlocTaches(2, 'Cette semaine', `Semaine du ${dateLongueFr(lundi)}`, semaine, 'Rien en retard cette semaine.'), () => nb(semaine)),
      rubrique('mois', 'Ce mois-ci', 'Ce mois-ci', 'calendar', htmlBlocTaches(3, 'Ce mois-ci', (d => d.charAt(0).toUpperCase() + d.slice(1))(new Date(auj + 'T12:00:00').toLocaleDateString('fr-FR', { month:'long', year:'numeric' })), mois, 'Rien à faire ce mois-ci.'), () => nb(mois)),
      rubrique('trimestre', 'Ce trimestre', 'Ce trimestre', 'book-open-check', htmlBlocTaches(4, 'Ce trimestre', `${libelleTrimestre(trim)}${finTrim ? ` · se termine le ${dateLongueFr(finTrim)}` : ''}`, trimestre, 'Rien à préparer pour le moment.'), () => nb(trimestre)),
      rubrique('outils', 'Mes outils', 'Mes outils', 'briefcase', `<div class="svc-grille">${outils.map(([v]) => { const c = CATALOGUE_SERVICES[v]; return c ? carteService(v, c[0], c[1], c[2], c[3], `go('${v}')`, false) : ''; }).join('')}</div>`),
      rubrique('inscription', 'Mon inscription', 'Mon inscription et la liste des enseignants', 'users', annexe),
    ], { ouvrir: ui.filters.enroleOuvert ? 'inscription' : '' }); })()}
  </div>`;
}
function tacheAlertesTelephone(){
  const quand = ' pendant mes cours';
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  if(ios && !window.navigator.standalone) return { etat:'afaire', titre:`Recevoir le rappel de l’appel${quand} sur ce téléphone`, detail:'Sur iPhone : touchez « Partager » (carré avec une flèche) puis « Sur l’écran d’accueil ». Ouvrez ensuite EcoMaZ depuis cette icône et activez les alertes.' };
  if(!pushPossible()) return null;
  if(Notification.permission === 'default') return { etat:'afaire', titre:`Recevoir le rappel de l’appel${quand} sur ce téléphone`, detail:'Un seul toucher : vous serez prévenu même application fermée (appel oublié, parent au portail).', bouton:'Activer les alertes', action:"autoriserAlertesTelephone().then(() => renderView('dashboard'))" };
  if(Notification.permission === 'denied') return { etat:'info', titre:'Les alertes sont bloquées sur ce téléphone', detail:'Pour recevoir le rappel de l’appel : dans Chrome, touchez ⋮ → Paramètres → Paramètres des sites → Notifications, puis autorisez ce site.' };
  // Alertes activées : reste à autoriser la sonnerie (test du bip + « Ne pas déranger »), une fois par téléphone
  let faite = false; try{ faite = localStorage.getItem('ecomaz_sonnerie_ok') === '1'; }catch(_e){}
  if(!faite) return { etat:'afaire', titre:'Autoriser la sonnerie de l’appel sur ce téléphone', detail:'Pour entendre le rappel même téléphone en silencieux : testez la sonnerie et laissez passer EcoMaZ en mode « Ne pas déranger ».', bouton:'Autoriser la sonnerie', action:'ouvrirSonnerieAppel()' };
  return null;
}
function ouvrirSonnerieAppel(){
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  openModal('Autoriser la sonnerie de l’appel', `
    <p style="margin-top:0;">Quand l’appel n’est pas fait, EcoMaZ fait <strong>sonner et vibrer</strong> votre téléphone. Pour l’entendre même en mode silencieux :</p>
    <ol class="son-etapes">
      <li><strong>Touchez « Tester la sonnerie »</strong> : vous devez entendre 3 bips. Rien ? Montez le <strong>volume des médias</strong> (touche volume du téléphone, curseur « Médias » ou « Contenu multimédia »).</li>
      ${ios ? `<li><strong>iPhone :</strong> ouvrez EcoMaZ depuis son icône sur l’écran d’accueil. Dans Réglages → Notifications → EcoMaZ, activez « Sons » et « Notifications ».</li>`
        : `<li><strong>Mode « Ne pas déranger »</strong> : ouvrez les <strong>Paramètres</strong> du téléphone → <strong>Notifications</strong> → <strong>Ne pas déranger</strong> → <strong>Applications</strong> (ou « Exceptions ») → ajoutez <strong>EcoMaZ</strong> (ou <strong>Chrome</strong> si EcoMaZ n’est pas installé).</li>
      <li>Dans <strong>Paramètres → Applications → EcoMaZ (ou Chrome) → Notifications</strong>, laissez « Son » et « Vibreur » activés.</li>`}
    </ol>
    <div class="son-test"><button type="button" class="btn" onclick="testerSonnerieAppel(this)">${icone('bell')} Tester la sonnerie</button><span class="hint" id="sonResultat" style="margin:0;"></span></div>
    <p class="hint">Bon à savoir : avec l’application fermée, c’est la notification du téléphone qui sonne (elle reste affichée jusqu’à ce que vous la touchiez). Le mode silencieux complet du téléphone ne peut pas être contourné par une application web : gardez au moins le vibreur.</p>
    <div class="form-actions"><button type="button" class="btn secondary" onclick="closeModal()">Plus tard</button><button type="button" class="btn" onclick="try{localStorage.setItem('ecomaz_sonnerie_ok','1')}catch(_e){}; closeModal(); toast('Sonnerie de l’appel autorisée sur ce téléphone'); renderView('dashboard')">C’est fait</button></div>`);
}
function testerSonnerieAppel(btn){
  debloquerSon();
  setTimeout(() => {
    const ok = bipRappel();
    const r = document.getElementById('sonResultat');
    if(r) r.textContent = ok ? 'Vous entendez 3 bips ? Parfait. Sinon, montez le volume des médias.' : 'Le son a été bloqué : touchez encore une fois « Tester la sonnerie ».';
  }, 150);
}

/* =====================================================================
   SUIVI DES ENSEIGNANTS (secrétariat, direction, fondation) — 2026-11-09
   Les mêmes tâches que l'accueil enseignant, vues par la direction :
   appel du jour, appels oubliés de la semaine, cahier de textes du
   prochain jour de classe, évaluations du trimestre, programme.
   Relance gratuite par WhatsApp, message prêt à envoyer.
   ===================================================================== */
function etatEnseignant(t, auj){
  const classes = (t.classesAssignees || []).map(id => DB.classes.find(c => c.id === id)).filter(Boolean)
    .filter(c => DB.eleves.some(e => e.classeId === c.id && e.statut === 'Actif'));
  const fait = (id, d) => DB.presencesEleves.some(p => p.classeId === id && p.date === d);
  const coursAuj = estJourDeCours(auj), h = new Date().getHours();
  const sansAppelAuj = coursAuj ? classes.filter(c => !fait(c.id, auj)) : [];
  const passes = listeJours(lundiDe(auj), auj).filter(d => d < auj && estJourDeCours(d));
  const manques = []; passes.forEach(d => classes.forEach(c => { if(!fait(c.id, d)) manques.push({ d, c }); }));
  const prochain = prochainJourDeClasse(auj);
  const sansDevoir = DB.devoirs && prochain ? classes.filter(c => !DB.devoirs.some(d => d.classeId === c.id && d.pourLe === prochain)) : null;
  const trim = trimestreDeDate(auj), ids = new Set(classes.map(c => c.id));
  const evals = DB.evaluations ? DB.evaluations.filter(e => ids.has(e.classeId) && e.trimestre === trim && (!(t.matieres || []).length || t.matieres.includes(e.matiere))).length : null;
  const prog = (DB.programmes || []).filter(p => p.enseignantId === t.id && (!p.trimestre || p.trimestre === trim));
  const progMoy = prog.length ? Math.round(prog.reduce((s, p) => s + (Number(p.progression) || 0), 0) / prog.length) : null;
  const compte = (DB.profiles || []).some(p => p.role === 'enseignant' && p.enseignantId === t.id);
  const etat = (DB.etatComptes || []).find(x => x.enseignantId === t.id);
  const jamaisConnecte = compte && etat ? !etat.dejaConnecte : false;
  const sansAlertes = compte && etat ? !etat.alertesActives : false;
  // En retard : appel du jour non fait après 9 h, ou appels oubliés cette semaine
  const retardAuj = h >= 9 ? sansAppelAuj.length : 0;
  return { t, classes, coursAuj, sansAppelAuj, retardAuj, manques, prochain, sansDevoir, evals, progMoy, compte, jamaisConnecte, sansAlertes,
    score: retardAuj * 2 + manques.length + (compte ? 0 : 1) + (jamaisConnecte ? 2 : 0) + (sansAlertes ? 1 : 0) };
}
function telEnseignant(t){ const d = String(t.telephone || '').replace(/\D/g, '').replace(/^225/, ''); return d.length === 10 ? d : ''; }
function messageRelanceEnseignant(x){
  const t = x.t, titre = t.sexe === 'F' ? 'Madame' : t.sexe === 'M' ? 'Monsieur' : '';
  const qui = { secretariat:'le secrétariat', direction:'la direction', fondation:'la fondation' }[ui.role] || 'l’école';
  const points = [];
  if(!x.compte) points.push(`votre compte EcoMaZ n’est pas encore activé : ouvrez ce lien, touchez « Continuer avec Google » et cochez vos classes : ${lienApplication('enseignant.html')}`);
  else if(x.jamaisConnecte) points.push(`vous ne vous êtes pas encore connecté(e) à votre application EcoMaZ : ${lienApplication('enseignant.html')}`);
  if(x.compte && x.sansAlertes) points.push('activez les alertes : sur l’accueil de l’application, touchez « Activer les alertes » pour recevoir le rappel de l’appel');
  if(x.sansAppelAuj.length) points.push(`l’appel n’est pas encore fait aujourd’hui en ${x.sansAppelAuj.map(c => c.nom).join(', ')}`);
  if(x.manques.length) points.push(`${x.manques.length} appel(s) de la semaine à rattraper (${x.manques.slice(0, 3).map(m => `${m.c.nom} du ${fmtDate(m.d)}`).join(', ')}${x.manques.length > 3 ? '…' : ''})`);
  return `Bonjour ${[titre, t.nom].filter(Boolean).join(' ')}, ici ${qui} de ${DB.meta?.nomEcole || 'l’école'}.\n`
    + (points.length ? `Petit rappel :\n${points.map(p => '- ' + p).join('\n')}\n` : '')
    + 'Tout se fait depuis l’accueil « Mes tâches » de votre application EcoMaZ. Merci et bonne journée !';
}
function renderSuiviEnseignants(){
  if(!['secretariat','direction','fondation'].includes(ui.role)) return '';
  const auj = todayISO();
  chargerAgenda();
  const reafficher = () => { if(ui.currentView === 'dashboard') renderView('dashboard'); };
  if(DB.devoirs === undefined){ DB.devoirs = null; sb.from('devoirs').select('*').eq('ecole_id', session.ecoleId).gte('pour_le', isoDansJours(-14)).order('pour_le')
    .then(({ data }) => { DB.devoirs = rowsToCamel(data || []); reafficher(); }); }
  if(DB.evaluations === undefined){ DB.evaluations = null; sb.from('evaluations').select('*').eq('ecole_id', session.ecoleId).order('date')
    .then(({ data }) => { DB.evaluations = rowsToCamel(data || []); reafficher(); }); }
  // Compte, première connexion, alertes (schema.sql section 109) : trois oui/non, rien de plus
  if(DB.etatComptes === undefined){ DB.etatComptes = null; sb.rpc('etat_comptes_enseignants')
    .then(({ data }) => { DB.etatComptes = rowsToCamel(data || []); reafficher(); }, () => { DB.etatComptes = []; }); }
  const liste = (DB.enseignants || []).filter(t => t.statut === 'Actif' && (t.classesAssignees || []).length)
    .map(t => etatEnseignant(t, auj)).filter(x => x.classes.length)
    .sort((a, b) => b.score - a.score || (a.t.nom || '').localeCompare(b.t.nom || ''));
  if(!liste.length) return '';
  window.__suiviEns = liste;
  const coursAuj = estJourDeCours(auj);
  const classesTot = new Set(liste.flatMap(x => x.classes.map(c => c.id)));
  const classesFaites = [...classesTot].filter(id => DB.presencesEleves.some(p => p.classeId === id && p.date === auj)).length;
  const aRelancer = liste.filter(x => x.score > 0).length;
  const puce = (ok, txt, attente) => `<span class="se-puce ${ok === null ? 'neutre' : ok ? 'ok' : attente ? 'attente' : 'ko'}">${txt}</span>`;
  const quand = x => x.prochain ? (x.prochain === isoDansJours(1) ? 'demain' : new Date(x.prochain + 'T12:00:00').toLocaleDateString('fr-FR', { weekday:'long' })) : '';
  const carte = (x, i) => {
    const t = x.t, tel = telEnseignant(t);
    const nbC = x.classes.length;
    return `<li class="se-carte${x.score ? ' a-relancer' : ''}">
      <div class="se-tete"><span class="avatar" aria-hidden="true">${escapeHtml(initials(t.prenom, t.nom))}</span>
        <span class="se-nom"><strong>${escapeHtml(ensFullName(t))}</strong><small>${x.classes.map(c => escapeHtml(c.nom)).join(', ')}${(t.matieres || []).length ? ' · ' + escapeHtml(t.matieres.join(', ')) : ''}</small></span>
        ${x.score ? '<span class="badge-etat attente">À relancer</span>' : '<span class="badge-etat ok">À jour</span>'}</div>
      <div class="se-puces">
        ${!x.compte ? puce(false, 'Compte non activé') : x.jamaisConnecte ? puce(false, 'Jamais connecté') : ''}
        ${x.compte && !x.jamaisConnecte && DB.etatComptes ? puce(!x.sansAlertes, x.sansAlertes ? 'Alertes téléphone non activées' : 'Alertes téléphone activées', true) : ''}
        ${x.coursAuj ? puce(!x.sansAppelAuj.length, `Appel du jour : ${nbC - x.sansAppelAuj.length}/${nbC}`, !x.retardAuj) : puce(null, 'Pas de classe aujourd’hui')}
        ${puce(!x.manques.length, x.manques.length ? `${x.manques.length} appel(s) oublié(s) cette semaine` : 'Semaine : appels complets')}
        ${x.sansDevoir ? puce(!x.sansDevoir.length, `Cahier de textes pour ${quand(x)} : ${nbC - x.sansDevoir.length}/${nbC}`, true) : ''}
        ${x.evals !== null ? puce(x.evals > 0 ? true : null, `${x.evals} évaluation(s) ce trimestre`) : ''}
        ${puce(x.progMoy === null ? null : true, x.progMoy === null ? 'Programme non saisi' : `Programme : ${x.progMoy} %`)}
      </div>
      <div class="se-actions">
        <button type="button" class="btn secondary sm" onclick="ui.filters.rapportEns='${t.id}'; go('rapport-activite')">${icone('trending-up')} Rapport</button>
        ${x.score ? (tel ? `<a class="btn sm" href="https://wa.me/225${tel}?text=${encodeURIComponent(messageRelanceEnseignant(x))}" target="_blank" rel="noopener">${icone('send')} Relancer sur WhatsApp</a>`
          : `<button type="button" class="btn sm" onclick="copierRelanceEnseignant(${i})">${icone('clipboard')} Copier le message</button><span class="hint se-sans-tel">Numéro absent de la fiche</span>`) : ''}
      </div>
    </li>`;
  };
  return `<section class="panel se-panel" aria-labelledby="titreSuiviEns">
    <div class="panel-head"><div><h2 id="titreSuiviEns">${icone('users')} Suivi des enseignants</h2>
      <div class="sub">${coursAuj ? `Appel du jour : ${classesFaites}/${classesTot.size} classe(s)` : 'Pas de classe aujourd’hui'} · ${aRelancer ? `${aRelancer} enseignant(s) à relancer` : 'tout le monde est à jour'}${DB.etatComptes ? ` · alertes activées : ${liste.filter(x => x.compte && !x.sansAlertes).length}/${liste.length}` : ''}</div></div></div>
    <ul class="se-liste">${liste.slice(0, 4).map(carte).join('')}</ul>
    ${liste.length > 4 ? `<details class="se-plus"><summary>Voir les ${liste.length - 4} autres enseignants</summary><ul class="se-liste">${liste.slice(4).map((x, i) => carte(x, i + 4)).join('')}</ul></details>` : ''}
    <div class="hint" style="margin-bottom:0;">Ces indicateurs sont ceux que chaque enseignant voit sur son accueil « Mes tâches ». Un appel du jour n’est compté en retard qu’après 9 h.</div>
  </section>`;
}
function copierRelanceEnseignant(i){
  const x = (window.__suiviEns || [])[i]; if(!x) return;
  const txt = messageRelanceEnseignant(x);
  (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(() => toast('Message copié : collez-le dans WhatsApp ou un SMS.'))
    .catch(() => openModal('Message de relance', `<textarea rows="8" style="width:100%;">${escapeHtml(txt)}</textarea>`));
}

/* Panneau principal : toutes les rubriques sur UNE ligne horizontale d'onglets (20/11/2026).
   Un toucher sur un onglet ouvre son contenu juste en dessous ; un second le referme.
   La rubrique ouverte est mémorisée sur l'appareil. */
/* Chiffres du jour dépliables (20/11/2026) : élèves inscrits, enseignants ayant pointé / pas encore,
   présence des élèves par classe, présence des enseignants. Lecture seule. */
function initialesNom(n){ return String(n || '').trim().split(/\s+/).map(x => x.charAt(0)).join('').slice(0, 2).toUpperCase() || '?'; }
function heureCourte(h){ return h ? String(h).slice(0, 5) : ''; }
function classesEnseignantTexte(t){ return (t.classesAssignees || []).map(classeName).filter(x => x !== '—').join(', '); }
function chiffresDuJour(){
  const auj = todayISO();
  const actifs = (DB.eleves || []).filter(e => e.statut === 'Actif');
  const ens = (DB.enseignants || []).filter(e => e.statut === 'Actif');
  const recsEns = (DB.presencesEnseignants || []).filter(p => p.date === auj);
  const recDe = id => recsEns.find(p => p.enseignantId === id);
  const pointes = ens.filter(t => { const r = recDe(t.id); return r && (r.heureArrivee || r.statut === 'Présent' || r.statut === 'Retard'); })
    .sort((a, b) => (heureCourte(recDe(a.id).heureArrivee) || '99').localeCompare(heureCourte(recDe(b.id).heureArrivee) || '99'));
  const nonPointes = ens.filter(t => !pointes.includes(t)).sort((a, b) => ensFullName(a).localeCompare(ensFullName(b)));
  const presEl = (DB.presencesEleves || []).filter(p => p.date === auj);
  const presents = presEl.filter(p => p.statut === 'Présent' || p.statut === 'Retard').length;
  const tauxEl = presEl.length ? Math.round(100 * presents / presEl.length) : null;
  const classes = (DB.classes || []).filter(c => actifs.some(e => e.classeId === c.id));
  const triEl = (a, b) => (a.nom || '').localeCompare(b.nom || '') || (a.prenom || '').localeCompare(b.prenom || '');
  const puces = (liste, cls) => liste.length ? `<div class="kp-puces">${liste.map(e => `<span class="kp-puce${cls ? ' ' + cls : ''}">${escapeHtml(eleveFullName(e))}</span>`).join('')}</div>` : '';
  const ligneEns = (t, droite) => `<div class="kp-ligne"><span class="kp-avatar" aria-hidden="true">${escapeHtml(initialesNom(ensFullName(t)))}</span>
    <div class="kp-qui"><strong>${escapeHtml(ensFullName(t))}</strong>${classesEnseignantTexte(t) ? `<small>${escapeHtml(classesEnseignantTexte(t))}</small>` : ''}</div>${droite}</div>`;
  const pied = (lib, action) => hasAccess(action[0]) ? `<div class="kp-pied"><button type="button" class="btn secondary sm" onclick="go('${action[0]}')">${escapeHtml(lib)}</button></div>` : '';

  // 1. Élèves inscrits, par classe
  const inscrits = classes.map(c => {
    const l = actifs.filter(e => e.classeId === c.id).sort(triEl);
    const g = l.filter(e => e.sexe === 'M').length, f = l.filter(e => e.sexe === 'F').length;
    return `<div class="kp-classe"><div class="kp-classe-tete"><strong>${escapeHtml(c.nom)}</strong><span>${l.length} élève${l.length > 1 ? 's' : ''}${g || f ? ` · ${g} G · ${f} F` : ''}</span></div>${puces(l)}</div>`;
  }).join('');

  // 2. Enseignants ayant pointé (heure d'arrivée, retard éventuel, départ)
  const htmlPointes = pointes.length ? pointes.map(t => { const r = recDe(t.id);
    const etat = r.statut === 'Retard' ? `<span class="kp-badge kp-retard">Retard${r.minutesRetard ? ` · ${r.minutesRetard} min` : ''}</span>` : `<span class="kp-badge kp-ok">À l’heure</span>`;
    return ligneEns(t, `<div class="kp-droite"><span class="kp-heure">${icone('log-in')}${escapeHtml(heureCourte(r.heureArrivee) || '—')}</span>${r.heureDepart ? `<span class="kp-heure kp-depart">Départ ${escapeHtml(heureCourte(r.heureDepart))}</span>` : ''}${etat}</div>`); }).join('')
    : `<div class="kp-vide">${icone('hourglass')}Aucun enseignant n’a encore pointé aujourd’hui.</div>`;

  // 3. Enseignants qui n'ont pas encore pointé
  const htmlNon = nonPointes.length ? nonPointes.map(t => { const r = recDe(t.id);
    return ligneEns(t, `<div class="kp-droite">${r && r.statut === 'Absent' ? '<span class="kp-badge kp-absent">Absent</span>' : '<span class="kp-badge kp-attente">Pas encore pointé</span>'}</div>`); }).join('')
    : `<div class="kp-vide kp-vide-ok">${icone('circle-check')}Tous les enseignants ont pointé aujourd’hui.</div>`;

  // 4. Présence des élèves aujourd'hui, par classe
  const htmlPresence = classes.map(c => {
    const l = actifs.filter(e => e.classeId === c.id).sort(triEl);
    const recs = presEl.filter(p => p.classeId === c.id || l.some(e => e.id === p.eleveId));
    if(!recs.length) return `<div class="kp-classe kp-classe-attente"><div class="kp-classe-tete"><strong>${escapeHtml(c.nom)}</strong><span class="kp-badge kp-attente">Appel pas encore fait</span></div></div>`;
    const st = e => (recs.find(p => p.eleveId === e.id) || {}).statut;
    const pres = l.filter(e => st(e) === 'Présent'), ret = l.filter(e => st(e) === 'Retard'), abs = l.filter(e => st(e) === 'Absent');
    const pct = l.length ? Math.round(100 * (pres.length + ret.length) / l.length) : 0;
    return `<div class="kp-classe"><div class="kp-classe-tete"><strong>${escapeHtml(c.nom)}</strong><span>${pres.length + ret.length} / ${l.length} présents</span></div>
      <div class="kp-jauge" role="img" aria-label="${pct} % de présents"><div style="width:${pct}%"></div></div>
      ${pres.length ? `<div class="kp-sous-titre">Présents</div>${puces(pres)}` : ''}
      ${ret.length ? `<div class="kp-sous-titre">En retard</div>${puces(ret, 'kp-puce-retard')}` : ''}
      ${abs.length ? `<div class="kp-sous-titre">Absents</div>${puces(abs, 'kp-puce-absent')}` : ''}</div>`;
  }).join('');

  // 5. Présence des enseignants : le résumé du jour
  const nbRet = pointes.filter(t => recDe(t.id).statut === 'Retard').length, nbAbs = nonPointes.filter(t => (recDe(t.id) || {}).statut === 'Absent').length;
  const tauxEns = ens.length && recsEns.length ? Math.round(100 * pointes.length / ens.length) : null;
  const htmlEns = `<div class="kp-resume">
      <div class="kp-stat"><strong>${pointes.length - nbRet}</strong><span>À l’heure</span></div>
      <div class="kp-stat kp-stat-retard"><strong>${nbRet}</strong><span>En retard</span></div>
      <div class="kp-stat kp-stat-absent"><strong>${nbAbs}</strong><span>Absents</span></div>
      <div class="kp-stat kp-stat-attente"><strong>${nonPointes.length - nbAbs}</strong><span>Pas encore pointé</span></div></div>
    <div class="kp-jauge kp-jauge-large" role="img" aria-label="${tauxEns ?? 0} % des enseignants ont pointé"><div style="width:${tauxEns ?? 0}%"></div></div>`;

  return [
    { id: 'k-inscrits', court: 'Élèves inscrits', titre: `Élèves inscrits — ${actifs.length}`, ic: 'graduation-cap', fam: 'nuit', valeur: actifs.length,
      html: `<div class="kp-grille">${inscrits || '<div class="kp-vide">Aucun élève inscrit.</div>'}</div>${pied('Ouvrir Élèves & Inscriptions', ['eleves'])}` },
    { id: 'k-pointes', court: 'Enseignants ayant pointé', titre: `Enseignants ayant pointé aujourd’hui — ${pointes.length} / ${ens.length}`, ic: 'log-in', fam: 'menthe', valeur: pointes.length,
      html: `<div class="kp-liste">${htmlPointes}</div>${pied('Voir le journal de pointage', ['presences-enseignants'])}` },
    { id: 'k-nonpointes', court: 'Pointage non fait', titre: `Enseignants sans pointage aujourd’hui — ${nonPointes.length} / ${ens.length}`, ic: 'hourglass', fam: 'indigo', valeur: nonPointes.length,
      html: `<div class="kp-liste">${htmlNon}</div>${pied('Scanner un badge', ['pointage-scan'])}` },
    { id: 'k-presents', court: tauxEl === null ? 'Appel non effectué' : 'Présence élèves', titre: tauxEl === null ? 'Présence des élèves — appel pas encore fait' : `Présence des élèves aujourd’hui — ${presents} présents (${tauxEl} %)`, ic: 'circle-check', fam: 'ocean', valeur: tauxEl === null ? '—' : tauxEl + ' %',
      html: `<div class="kp-grille">${htmlPresence || '<div class="kp-vide">Aucune classe.</div>'}</div>${pied('Faire ou voir l’appel', ['presences-eleves'])}` },
    { id: 'k-presence-ens', court: tauxEns === null ? 'Aucun pointage' : 'Présence enseignants', titre: 'Présence des enseignants aujourd’hui', ic: 'clock', fam: 'nuit', valeur: tauxEns === null ? '—' : tauxEns + ' %',
      html: htmlEns + pied('Voir le journal', ['presences-enseignants']) },
  ];
}
function tuileChiffre(ic, fam, valeur, libelle, action){
  return `<button type="button" class="dbr-onglet dbr-chiffre" onclick="${action}">${iconeService(ic, fam)}<span class="dbr-valeur">${escapeHtml(String(valeur))}</span><small class="dbr-sous">${escapeHtml(libelle)}</small></button>`;
}
