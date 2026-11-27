/* =====================================================================
   RAPPORT FINANCIER (27/11/2026) — demande de Vehi Zoh Junior :
   « rapport financier pour la comptabilité, sur le compte secrétariat ».
   Onglet « Rapport financier » de la Comptabilité (secrétariat, direction,
   fondation) + carte dans Rapports et téléchargements.
   Période au choix ; entrées par source, par mode de paiement, par jour et
   par classe ; recouvrement de la scolarité, retards et encaissements à
   venir ; comparaison avec la période précédente. Les sorties (salaires,
   dépenses) n'apparaissent que pour la direction et la fondation (le
   serveur ne les envoie pas au secrétariat). Impression / PDF et Excel.
   ===================================================================== */
function rfPeriode(){
  const f = ui.filters.rf || (ui.filters.rf = { code: 'mois', du: '', au: '' });
  const auj = todayISO(), d = new Date();
  const iso = x => toISO(x);
  let du, au = auj, lib;
  if(f.code === 'jour'){ du = auj; lib = 'Aujourd’hui'; }
  else if(f.code === 'semaine'){ const l = new Date(d); l.setDate(d.getDate() - ((d.getDay() + 6) % 7)); du = iso(l); lib = 'Cette semaine'; }
  else if(f.code === 'mois'){ du = auj.slice(0, 8) + '01'; lib = moisLabel(auj.slice(0, 7)); }
  else if(f.code === 'mois-prec'){ const p = new Date(d.getFullYear(), d.getMonth() - 1, 1), q = new Date(d.getFullYear(), d.getMonth(), 0); du = iso(p); au = iso(q); lib = moisLabel(du.slice(0, 7)); }
  else if(f.code === 'trimestre'){ const m = d.getMonth() + 1; const debutM = m >= 9 ? 9 : m >= 4 ? 4 : 1; du = `${m >= 9 ? d.getFullYear() : d.getFullYear()}-${String(debutM).padStart(2, '0')}-01`; lib = 'Ce trimestre'; }
  else if(f.code === 'annee'){ const a = d.getMonth() + 1 >= 8 ? d.getFullYear() : d.getFullYear() - 1; du = `${a}-09-01`; lib = `Année scolaire ${a}-${a + 1}`; }
  else { du = f.du || auj.slice(0, 8) + '01'; au = f.au || auj; lib = `Du ${fmtDate(du)} au ${fmtDate(au)}`; }
  if(du > au) [du, au] = [au, du];
  // période précédente de même durée (comparaison)
  const nbJ = Math.round((new Date(au + 'T12:00:00') - new Date(du + 'T12:00:00')) / 86400000) + 1;
  const pAu = new Date(new Date(du + 'T12:00:00').getTime() - 86400000), pDu = new Date(pAu.getTime() - (nbJ - 1) * 86400000);
  return { du, au, lib, nbJ, precDu: iso(pDu), precAu: iso(pAu), code: f.code };
}
function rfCalculer(du, au){
  const dans = x => typeof x === 'string' && x.slice(0, 10) >= du && x.slice(0, 10) <= au;
  const admin = ['direction', 'fondation'].includes(ui.role);
  const actCantine = new Set((DB.activites || []).filter(a => a.type === 'cantine').map(a => a.id));
  const lignes = [];
  (DB.paiementsScolarite || []).filter(p => dans(p.date)).forEach(p => { const e = eleveById(p.eleveId); lignes.push({ sens: 'entree', source: 'Scolarité', date: p.date, montant: Number(p.montant) || 0, mode: p.modePaiement || '—', classe: e ? classeName(e.classeId) : '—', libelle: `${p.tranche || ''} — ${e ? eleveFullName(e) : '—'}` }); });
  (DB.paiementsCotisations || []).filter(p => dans(p.date)).forEach(p => { const e = eleveById(p.eleveId), a = (DB.activites || []).find(x => x.id === p.activiteId); lignes.push({ sens: 'entree', source: actCantine.has(p.activiteId) ? 'Cantine' : 'Activités', date: p.date, montant: Number(p.montant) || 0, mode: p.modePaiement || '—', classe: e ? classeName(e.classeId) : '—', libelle: `${a ? a.nom : 'Activité'} — ${e ? eleveFullName(e) : '—'}` }); });
  (DB.ventesGadgets || []).filter(v => dans(v.date)).forEach(v => { const g = (DB.gadgets || []).find(x => x.id === v.gadgetId); lignes.push({ sens: 'entree', source: 'Boutique', date: v.date, montant: Number(v.montantTotal) || 0, mode: v.modePaiement || '—', classe: '—', libelle: `${g ? g.nom : 'Article'} ×${v.quantite || 1}` }); });
  if(admin){
    (DB.paiementsSalaires || []).filter(p => dans(p.datePaiement)).forEach(p => lignes.push({ sens: 'sortie', source: 'Salaires', date: p.datePaiement, montant: Number(p.montant) || 0, mode: p.modePaiement || '—', classe: '—', libelle: `${personnelNomById(p.personnelId, p.personnelType)} — ${moisLabel(p.mois)}` }));
    (DB.depenses || []).filter(d => dans(d.date)).forEach(d => lignes.push({ sens: 'sortie', source: d.categorie || 'Dépenses', date: d.date, montant: Number(d.montant) || 0, mode: d.modePaiement || '—', classe: '—', libelle: d.libelle || '' }));
  }
  lignes.sort((a, b) => a.date.localeCompare(b.date));
  const somme = (l) => l.reduce((s, x) => s + x.montant, 0);
  const grouper = (l, cle) => { const g = {}; l.forEach(x => { g[x[cle]] = (g[x[cle]] || 0) + x.montant; }); return Object.entries(g).sort((a, b) => b[1] - a[1]); };
  const entrees = lignes.filter(x => x.sens === 'entree'), sorties = lignes.filter(x => x.sens === 'sortie');
  return { lignes, entrees, sorties, totalE: somme(entrees), totalS: somme(sorties), parSource: grouper(entrees, 'source'), parMode: grouper(entrees, 'mode'),
    parClasse: grouper(entrees.filter(x => x.source === 'Scolarité'), 'classe'), parJour: grouper(entrees, 'date').sort((a, b) => a[0].localeCompare(b[0])), parSortie: grouper(sorties, 'source'), admin };
}
function rfRecouvrement(){
  let du = 0, paye = 0;
  DB.eleves.filter(e => e.statut === 'Actif').forEach(e => { const g = scolariteEleveParEcheance(e.id), info = scolariteEleveInfo(e.id); du += g.total || info.du; paye += g.total ? g.totalPaye : info.paye; });
  const retards = (DB.paiementsScolarite || []).length && typeof famillesEnRetard === 'function' ? famillesEnRetard(null) : [];
  const avenir = typeof encaissementsAVenir === 'function' ? encaissementsAVenir(30) : [];
  return { du, paye, reste: Math.max(0, du - paye), taux: du ? Math.round(100 * paye / du) : 0, retards, montantRetards: retards.reduce((s, f) => s + f.total, 0), avenir, montantAvenir: avenir.reduce((s, x) => s + x.reste, 0) };
}
function rfBarres(liste, total, fmt){
  if(!liste.length) return '<p class="hint">Aucun mouvement sur la période.</p>';
  const max = Math.max(...liste.map(x => x[1])) || 1;
  return `<ul class="rf-barres">${liste.map(([k, v]) => `<li><span class="rf-lib">${escapeHtml(fmt ? fmt(k) : k)}</span><span class="rf-barre"><span style="width:${Math.max(2, Math.round(100 * v / max))}%"></span></span><span class="rf-val">${fmtFCFA(v)}${total ? ` <small>${Math.round(100 * v / total)} %</small>` : ''}</span></li>`).join('')}</ul>`;
}
function renderComptaRapportFinancier(){
  const P = rfPeriode(), R = rfCalculer(P.du, P.au), A = rfCalculer(P.precDu, P.precAu), rec = rfRecouvrement();
  const evo = A.totalE ? Math.round(100 * (R.totalE - A.totalE) / A.totalE) : null;
  const choix = [['jour', 'Aujourd’hui'], ['semaine', 'Cette semaine'], ['mois', 'Ce mois'], ['mois-prec', 'Mois dernier'], ['trimestre', 'Ce trimestre'], ['annee', 'Année scolaire'], ['perso', 'Dates au choix']];
  const f = ui.filters.rf;
  return `<div class="rf">
    <div class="panel rf-tete">
      <div class="segmente rf-periodes" role="tablist" aria-label="Période">${choix.map(([k, l]) => `<button type="button" role="tab" class="seg${f.code === k ? ' actif' : ''}" aria-selected="${f.code === k}" onclick="ui.filters.rf.code='${k}'; renderView('comptabilite')">${l}</button>`).join('')}</div>
      ${f.code === 'perso' ? `<div class="rf-dates"><label>Du <input type="date" value="${P.du}" onchange="ui.filters.rf.du=this.value; renderView('comptabilite')"></label><label>au <input type="date" value="${P.au}" max="${todayISO()}" onchange="ui.filters.rf.au=this.value; renderView('comptabilite')"></label></div>` : ''}
      <div class="rf-actions"><button type="button" class="btn" onclick="rfImprimer()">🖨️ Imprimer / PDF</button><button type="button" class="btn secondary" onclick="rfExcel()">⬇️ Excel</button></div>
    </div>
    <h2 class="rf-titre">📈 Rapport financier — ${escapeHtml(P.lib)} <small>(${fmtDate(P.du)} → ${fmtDate(P.au)})</small></h2>
    <div class="rf-kpis">
      <div class="rf-kpi rf-entree"><small>Encaissé</small><strong>${fmtFCFA(R.totalE)}</strong><em>${R.entrees.length} paiement(s)${evo !== null ? ` · ${evo >= 0 ? '▲' : '▼'} ${Math.abs(evo)} % vs période précédente` : ''}</em></div>
      ${R.admin ? `<div class="rf-kpi rf-sortie"><small>Sorties</small><strong>${fmtFCFA(R.totalS)}</strong><em>${R.sorties.length} mouvement(s)</em></div>
      <div class="rf-kpi ${R.totalE - R.totalS >= 0 ? 'rf-entree' : 'rf-sortie'}"><small>Solde de la période</small><strong>${fmtFCFA(R.totalE - R.totalS)}</strong><em>entrées − sorties</em></div>` : ''}
      <div class="rf-kpi"><small>Recouvrement scolarité (année)</small><strong>${rec.taux} %</strong><em>${fmtFCFA(rec.paye)} sur ${fmtFCFA(rec.du)}</em></div>
      <div class="rf-kpi rf-sortie"><small>Retards (date limite passée)</small><strong>${fmtFCFA(rec.montantRetards)}</strong><em>${rec.retards.length} famille(s)</em></div>
      <div class="rf-kpi"><small>Attendu sous 30 jours</small><strong>${fmtFCFA(rec.montantAvenir)}</strong><em>${new Set(rec.avenir.map(x => x.eleve.id)).size} élève(s)</em></div>
    </div>
    <div class="rf-grille">
      <section class="panel"><h3>Entrées par source</h3>${rfBarres(R.parSource, R.totalE)}</section>
      <section class="panel"><h3>Entrées par mode de paiement</h3>${rfBarres(R.parMode, R.totalE)}</section>
      <section class="panel"><h3>Scolarité encaissée par classe</h3>${rfBarres(R.parClasse, R.parClasse.reduce((s, x) => s + x[1], 0))}</section>
      <section class="panel"><h3>Encaissements jour par jour</h3>${rfBarres(R.parJour, 0, fmtDate)}</section>
      ${R.admin ? `<section class="panel"><h3>Sorties par catégorie</h3>${rfBarres(R.parSortie, R.totalS)}</section>` : `<section class="panel"><h3>Sorties</h3><p class="hint">Les salaires et les dépenses sont réservés à la direction et à la fondation : ils figurent dans leur rapport.</p></section>`}
    </div>
    <section class="panel"><h3>Détail des mouvements (${R.lignes.length})</h3>
      ${R.lignes.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Date</th><th>Source</th><th>Libellé</th><th>Mode</th><th style="text-align:right">Montant</th></tr></thead><tbody>
        ${R.lignes.slice(-300).reverse().map(x => `<tr><td>${fmtDate(x.date)}</td><td>${escapeHtml(x.source)}</td><td>${escapeHtml(x.libelle)}</td><td>${escapeHtml(x.mode)}</td><td style="text-align:right;color:${x.sens === 'sortie' ? 'var(--danger)' : 'inherit'}">${x.sens === 'sortie' ? '−' : ''}${fmtFCFA(x.montant)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="hint">Aucun mouvement sur la période.</p>'}
    </section>
  </div>`;
}
function rfImprimer(){
  const P = rfPeriode(), R = rfCalculer(P.du, P.au), rec = rfRecouvrement(), m = DB.meta || {};
  const tab = (titre, l, total) => `<h4>${titre}</h4><table class="table"><tbody>${l.map(([k, v]) => `<tr><td>${escapeHtml(k)}</td><td style="text-align:right">${fmtFCFA(v)}</td><td style="text-align:right">${total ? Math.round(100 * v / total) + ' %' : ''}</td></tr>`).join('') || '<tr><td>Aucun</td></tr>'}</tbody></table>`;
  openModal('Rapport financier — impression', `
    <div class="form-actions no-print" style="margin-top:0;justify-content:flex-end;"><button type="button" class="btn" onclick="window.print()">🖨️ Imprimer / PDF</button></div>
    <section class="rf-impression">
      <div class="recu-head">${m.logo ? `<img src="${escapeHtml(m.logo)}" alt="">` : '<div class="recu-logo-ph">🎓</div>'}
        <div><strong>${escapeHtml(m.nomEcole || '')}</strong><div class="hint">${escapeHtml(m.adresse || '')}</div></div>
        <div style="margin-left:auto;text-align:right;"><strong>RAPPORT FINANCIER</strong><div class="hint">${escapeHtml(P.lib)} · du ${fmtDate(P.du)} au ${fmtDate(P.au)}</div><div class="hint">Imprimé le ${fmtDate(todayISO())}</div></div></div>
      <table class="table"><tbody>
        <tr><td><strong>Total encaissé</strong></td><td style="text-align:right"><strong>${fmtFCFA(R.totalE)}</strong></td></tr>
        ${R.admin ? `<tr><td>Total des sorties</td><td style="text-align:right">${fmtFCFA(R.totalS)}</td></tr><tr><td><strong>Solde</strong></td><td style="text-align:right"><strong>${fmtFCFA(R.totalE - R.totalS)}</strong></td></tr>` : ''}
        <tr><td>Recouvrement de la scolarité (année)</td><td style="text-align:right">${rec.taux} % — ${fmtFCFA(rec.paye)} / ${fmtFCFA(rec.du)}</td></tr>
        <tr><td>Retards (date limite passée)</td><td style="text-align:right">${fmtFCFA(rec.montantRetards)} — ${rec.retards.length} famille(s)</td></tr>
        <tr><td>Attendu dans les 30 jours</td><td style="text-align:right">${fmtFCFA(rec.montantAvenir)}</td></tr>
      </tbody></table>
      ${tab('Entrées par source', R.parSource, R.totalE)}${tab('Entrées par mode de paiement', R.parMode, R.totalE)}${tab('Scolarité par classe', R.parClasse, 0)}
      ${R.admin ? tab('Sorties par catégorie', R.parSortie, R.totalS) : ''}
      <div class="rn-signatures"><div>Le secrétariat</div><div>La direction</div></div>
    </section>`);
}
async function rfExcel(){
  const P = rfPeriode(), R = rfCalculer(P.du, P.au), rec = rfRecouvrement();
  const synthese = [[`${DB.meta?.nomEcole || 'École'} — Rapport financier`], [`${P.lib} : du ${fmtDate(P.du)} au ${fmtDate(P.au)}`], [],
    ['Total encaissé', R.totalE], ...(R.admin ? [['Total des sorties', R.totalS], ['Solde', R.totalE - R.totalS]] : []),
    ['Recouvrement scolarité (année)', rec.taux + ' %'], ['Scolarité due (année)', rec.du], ['Scolarité payée (année)', rec.paye], ['Retards (date limite passée)', rec.montantRetards], ['Attendu sous 30 jours', rec.montantAvenir], [],
    ['ENTRÉES PAR SOURCE'], ...R.parSource, [], ['PAR MODE DE PAIEMENT'], ...R.parMode, [], ['SCOLARITÉ PAR CLASSE'], ...R.parClasse, ...(R.admin ? [[], ['SORTIES PAR CATÉGORIE'], ...R.parSortie] : [])];
  const detail = [['Date', 'Entrée / Sortie', 'Source', 'Libellé', 'Classe', 'Mode', 'Montant (F CFA)']].concat(R.lignes.map(x => [fmtDate(x.date), x.sens === 'entree' ? 'Entrée' : 'Sortie', x.source, x.libelle, x.classe, x.mode, x.sens === 'sortie' ? -x.montant : x.montant]));
  try{ await ecrireClasseurExcel([['Synthèse', synthese], ['Mouvements', detail], ['Par jour', [['Date', 'Encaissé'], ...R.parJour.map(([d, v]) => [fmtDate(d), v])]]], nomFichierExport('rapport-financier-' + P.du + '_' + P.au)); toast('Rapport financier prêt ✔'); }
  catch(e){ alert('Export impossible : ' + e.message); }
}
