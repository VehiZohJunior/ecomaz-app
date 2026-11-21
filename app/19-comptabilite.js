/* ---------------------------------------------------------------------
   12. COMPTABILITÉ GÉNÉRALE
   --------------------------------------------------------------------- */
// Grille de scolarité d'une classe : ses propres tranches si elle en a,
// sinon la grille commune (tranches sans classe) — schema.sql section 55.
function echeancesDeClasse(classeId){
  const toutes = DB.echeancesScolarite || [];
  const propres = toutes.filter(e => e.classeId === classeId);
  return (propres.length ? propres : toutes.filter(e => !e.classeId)).slice().sort((a,b)=>(a.ordre-b.ordre)||(a.dateEcheance||'').localeCompare(b.dateEcheance||''));
}
function duAnnuelClasse(classeId){
  const ech = echeancesDeClasse(classeId);
  return ech.length ? ech.reduce((s, e) => s + Number(e.montant || 0), 0) : ((DB.fraisScolarite || {})[classeId] || 0);
}
/* ---------- Rapport du mois (direction / fondation) — imprimable ou PDF ----------
   Calculé à partir des données déjà chargées ; mêmes calculs que le reste de l'application. */
function ouvrirRapportMois(mois){
  if(!['direction','fondation'].includes(ui.role)) return;
  mois = mois || thisMonthISO();
  const m = DB.meta || {};
  const dans = d => String(d || '').slice(0, 7) === mois;
  const nomMois = (t => t.charAt(0).toUpperCase() + t.slice(1))(new Date(mois + '-15T12:00:00').toLocaleDateString('fr-FR', { month:'long', year:'numeric' }));
  const decale = n => { const [a, mm] = mois.split('-').map(Number); const d = new Date(a, mm - 1 + n, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
  const actifs = DB.eleves.filter(e => e.statut === 'Actif');
  const nouveaux = actifs.filter(e => dans(e.dateInscription));
  // Finances
  const somme = (liste) => liste.reduce((t, x) => t + (Number(x.montant) || 0), 0);
  const scol = somme((DB.paiementsScolarite || []).filter(x => dans(x.date)));
  const cotis = somme((DB.paiementsCotisations || []).filter(x => dans(x.date)));
  const ventes = (DB.ventesGadgets || []).filter(x => dans(x.date)).reduce((t, v) => t + (Number(v.montantTotal) || Number(v.montant) || 0), 0);
  const salaires = somme((DB.paiementsSalaires || []).filter(x => dans(x.date)));
  const depenses = somme((DB.depenses || []).filter(x => dans(x.date)));
  const entrees = scol + cotis + ventes, sorties = salaires + depenses;
  const soldes = actifs.map(e => ({ e, solde: scolariteEleveInfo(e.id).solde })).filter(x => x.solde > 0);
  const resteTotal = soldes.reduce((t, x) => t + x.solde, 0);
  // Présences des élèves
  const pres = (DB.presencesEleves || []).filter(p => dans(p.date));
  const jours = new Set(pres.map(p => p.date)).size;
  const abs = pres.filter(p => p.statut === 'Absent'), ret = pres.filter(p => p.statut === 'Retard');
  const tauxPres = pres.length ? Math.round(100 * (pres.length - abs.length) / pres.length) : null;
  const parEleve = {}; abs.forEach(p => { parEleve[p.eleveId] = (parEleve[p.eleveId] || 0) + 1; });
  const plusAbsents = Object.entries(parEleve).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([id, n]) => ({ e: eleveById(id), n })).filter(x => x.e);
  const classesSansAppel = DB.classes.filter(c => actifs.some(e => e.classeId === c.id) && !pres.some(p => p.classeId === c.id));
  // Régularité de l'appel, classe par classe : jours avec appel / jours de classe du mois (jusqu'à aujourd'hui)
  const finMois = (([a, mm]) => isoLocal(new Date(a, mm, 0)))(mois.split('-').map(Number));
  const joursClasse = listeJours(mois + '-01', finMois < todayISO() ? finMois : todayISO()).filter(estJourDeCours);
  const regularite = DB.classes.filter(c => actifs.some(e => e.classeId === c.id)).map(c => ({ c, n: new Set(pres.filter(p => p.classeId === c.id).map(p => p.date)).size }));
  // Enseignants
  const pe = (DB.presencesEnseignants || []).filter(p => dans(p.date));
  const peRetards = pe.filter(p => p.statut === 'Retard'), peAbs = pe.filter(p => p.statut === 'Absent');
  const ponct = pe.length ? Math.round(100 * pe.filter(p => p.statut === 'Présent').length / pe.length) : null;
  // Parents
  const relies = actifs.filter(e => (DB.parentsEleves || []).some(pe2 => pe2.eleveId === e.id)).length;
  const ligne = (lib, val, cls) => `<tr><td>${lib}</td><td class="rm-val ${cls || ''}">${val}</td></tr>`;
  const pct = v => v === null ? '—' : v + ' %';
  openModal(`Rapport du mois — ${nomMois}`, `
    <div class="form-actions no-print" style="margin-top:0;justify-content:space-between;">
      <span style="display:flex;gap:6px;"><button type="button" class="btn secondary sm" onclick="ouvrirRapportMois('${decale(-1)}')">‹ Mois précédent</button>${mois < thisMonthISO() ? `<button type="button" class="btn secondary sm" onclick="ouvrirRapportMois('${decale(1)}')">Mois suivant ›</button>` : ''}</span>
      <button type="button" class="btn" onclick="window.print()">${icone('printer')} Imprimer / PDF</button>
    </div>
    <section class="rapport-mois">
      <div class="recu-head">${m.logo ? `<img src="${escapeHtml(m.logo)}" alt="">` : `<div class="recu-logo-ph">🎓</div>`}
        <div><strong>${escapeHtml(m.nomEcole || '')}</strong><div class="hint">${escapeHtml(m.adresse || '')}</div></div>
        <div style="margin-left:auto;text-align:right;"><strong>RAPPORT DU MOIS</strong><div class="hint">${escapeHtml(nomMois)} · ${escapeHtml(m.anneeScolaire || '')}</div></div></div>
      <div class="rm-grille">
        <div class="rm-bloc"><h4>Élèves</h4><table>${ligne('Élèves inscrits (actifs)', actifs.length)}${ligne('Nouveaux inscrits ce mois', nouveaux.length)}${ligne('Élèves reliés à un parent', `${relies} / ${actifs.length}`)}</table></div>
        <div class="rm-bloc"><h4>Finances du mois</h4><table>${ligne('Scolarité encaissée', fmtFCFA(scol))}${cotis ? ligne('Activités extra-scolaires', fmtFCFA(cotis)) : ''}${ventes ? ligne('Boutique', fmtFCFA(ventes)) : ''}${ligne('<strong>Total encaissé</strong>', `<strong>${fmtFCFA(entrees)}</strong>`, 'ok')}${ligne('Salaires payés', fmtFCFA(salaires))}${ligne('Dépenses', fmtFCFA(depenses))}${ligne('<strong>Solde du mois</strong>', `<strong>${fmtFCFA(entrees - sorties)}</strong>`, entrees - sorties >= 0 ? 'ok' : 'ko')}</table></div>
        <div class="rm-bloc"><h4>Scolarité à encaisser (à ce jour)</h4><table>${ligne('Reste à encaisser', fmtFCFA(resteTotal), resteTotal ? 'ko' : 'ok')}${ligne('Élèves avec un reste à payer', `${soldes.length} / ${actifs.length}`)}</table></div>
        <div class="rm-bloc"><h4>Présence des élèves</h4><table>${ligne('Jours d’appel enregistrés', jours)}${ligne('Taux de présence', pct(tauxPres), tauxPres !== null && tauxPres < 90 ? 'ko' : '')}${ligne('Absences', abs.length)}${ligne('Retards', ret.length)}</table>
          ${classesSansAppel.length ? `<div class="hint">Aucun appel ce mois : ${classesSansAppel.map(c => escapeHtml(c.nom)).join(', ')}</div>` : ''}
          ${plusAbsents.length ? `<div class="hint" style="margin-top:6px;"><strong>Les plus absents :</strong> ${plusAbsents.map(x => `${escapeHtml(eleveFullName(x.e))} (${x.n})`).join(', ')}</div>` : ''}</div>
        <div class="rm-bloc"><h4>Enseignants</h4><table>${ligne('Pointages enregistrés', pe.length)}${ligne('Ponctualité', pct(ponct), ponct !== null && ponct < 90 ? 'ko' : '')}${ligne('Retards', peRetards.length)}${ligne('Absences', peAbs.length)}</table></div>
      </div>
      ${joursClasse.length ? `<div class="rm-bloc rm-regularite"><h4>Régularité de l’appel par classe (${joursClasse.length} jour${joursClasse.length > 1 ? 's' : ''} de classe${mois === thisMonthISO() ? ' à ce jour' : ''})</h4>
        <table>${regularite.map(({ c, n }) => ligne(escapeHtml(c.nom), `${n} / ${joursClasse.length}`, n >= joursClasse.length ? 'ok' : n < joursClasse.length * 0.5 ? 'ko' : '')).join('')}</table></div>` : ''}
      <div class="hint" style="margin-top:10px;">Rapport établi le ${fmtDate(todayISO())} à partir des données enregistrées dans EcoMaZ.</div>
      <div class="signatures"><div class="sign-box"><div class="sign-role">La Direction</div><div class="sign-line">${escapeHtml(m.directeurNom || '')}</div></div><div class="sign-box"><div class="sign-role">La Fondation</div><div class="sign-line">${escapeHtml(m.fondateurNom || '')}</div></div></div>
    </section>`);
}
function scolariteEleveInfo(eleveId){
  const el = eleveById(eleveId);
  const du = el ? duAnnuelClasse(el.classeId) : 0;
  const paye = DB.paiementsScolarite.filter(p=>p.eleveId===eleveId).reduce((s,p)=>s+p.montant,0);
  const solde = Math.max(0, du-paye);
  let statut = 'Impayé';
  if(du>0 && paye>=du) statut = 'Soldé';
  else if(paye>0) statut = 'Partiel';
  return {du, paye, solde, statut};
}
// Détail élève × échéance (Frais d'inscription, 1er Versement, ...) — la
// "grille intelligente" : chaque échéance configurée dans Paramètres devient
// une colonne, avec son propre statut payé/partiel/impayé, plutôt qu'un
// unique solde global qui ne dit pas QUELLE tranche reste due.
function scolariteEleveParEcheance(eleveId){
  const paiements = (DB.paiementsScolarite||[]).filter(p=>p.eleveId===eleveId);
  const parTranche = {};
  paiements.forEach(p=>{ parTranche[p.tranche] = (parTranche[p.tranche]||0) + Number(p.montant||0); });
  const el = eleveById(eleveId);
  const echeances = el ? echeancesDeClasse(el.classeId) : [];
  const detail = echeances.map(ech=>{
    const paye = parTranche[ech.label] || 0;
    const statut = ech.montant>0 && paye>=ech.montant ? 'paye' : paye>0 ? 'partiel' : 'impaye';
    return {label:ech.label, montant:ech.montant, paye, statut, dateEcheance: ech.dateEcheance || ''};
  });
  const total = echeances.reduce((s,e)=>s+e.montant,0);
  const totalPaye = paiements.reduce((s,p)=>s+Number(p.montant||0),0);
  const reste = Math.max(0, total-totalPaye);
  return {detail, total, totalPaye, reste};
}
function personnelNomById(id, type){
  if(type==='enseignant'){ const t = enseignantById(id); return t ? ensFullName(t) : '—'; }
  const p = DB.personnelAutre.find(x=>x.id===id);
  return p ? `${p.prenom} ${p.nom}` : '—';
}

/* --- Reçus de caisse --- */
function nombreEnLettres(n){
  n = Math.round(Math.abs(n||0));
  if(n===0) return 'zéro';
  const U = ['','un','deux','trois','quatre','cinq','six','sept','huit','neuf','dix','onze','douze','treize','quatorze','quinze','seize','dix-sept','dix-huit','dix-neuf'];
  const D = ['','dix','vingt','trente','quarante','cinquante','soixante','soixante','quatre-vingt','quatre-vingt'];
  // Règle française : « cents » et « quatre-vingts » prennent un s seulement en fin de nombre
  // ou devant « millions / milliards » (des noms), jamais devant « mille » (21/11/2026)
  function deuxChiffres(num, avantMille){
    if(num<20) return U[num];
    const d = Math.floor(num/10), u = num%10;
    if(d===7 || d===9){
      if(u===1) return D[d]+'-et-'+U[10+u];
      return D[d]+'-'+U[10+u];
    }
    if(u===0) return D[d] + (d===8 && !avantMille ? 's' : '');
    if(u===1 && d!==8) return D[d]+'-et-un';
    return D[d]+'-'+U[u];
  }
  function troisChiffres(num, avantMille){
    const c = Math.floor(num/100), r = num%100;
    let s = '';
    if(c>0) s += (c===1?'cent':U[c]+' cent') + (c>1 && r===0 && !avantMille ? 's':'');
    if(r>0) s += (s?' ':'') + deuxChiffres(r, avantMille);
    return s;
  }
  let reste = n;
  const milliards = Math.floor(reste/1e9); reste %= 1e9;
  const millions = Math.floor(reste/1e6); reste %= 1e6;
  const milliers = Math.floor(reste/1e3); reste %= 1e3;
  const unites = reste;
  const parts = [];
  if(milliards>0) parts.push(troisChiffres(milliards)+' milliard'+(milliards>1?'s':''));
  if(millions>0) parts.push(troisChiffres(millions)+' million'+(millions>1?'s':''));
  if(milliers>0) parts.push(milliers===1 ? 'mille' : troisChiffres(milliers, true)+' mille');
  if(unites>0 || parts.length===0) parts.push(troisChiffres(unites));
  return parts.join(' ').replace(/\s+/g,' ').trim();
}
function capitalize(s){ return s ? s.charAt(0).toUpperCase()+s.slice(1) : s; }

let recuSeq = 0;
function souchePour(refId){ return refId ? (DB.recus || []).find(x => x.enregistrementId === refId) || null : null; }
function genRecuNumero(type, refId){
  const souche = souchePour(refId);
  if(souche) return souche.numero; // numéro officiel (souche conservée par l'école)
  return `REC-${type==='entree'?'E':'S'}-${(refId||uid()).toUpperCase()}`;
}
function certificationDe(refId){ return (DB.certificationsFne || []).find(c => c.enregistrementId === refId) || null; }
function statutFneRecu(r){
  const cert = r.refId ? certificationDe(r.refId) : null;
  if(cert){
    let qr = '';
    if(cert.lien){ try{ const q = qrcode(0, 'M'); q.addData(cert.lien); q.make(); qr = q.createSvgTag({ cellSize: 2, margin: 0, scalable: true }); }catch(_e){} }
    return `<div class="recu-row recu-fne"><span>FNE</span><strong><span class="recu-fne-num">N° ${escapeHtml(cert.numero)}</span>${cert.lien ? `<small>Vérification : ${escapeHtml(cert.lien)}</small>` : '<small>Facture Normalisée Électronique (DGI)</small>'}</strong>${qr ? `<span class="recu-fne-qr" aria-hidden="true">${qr}</span>` : ''}</div>`;
  }
  // La FNE ne concerne (pour l'instant, confirmé 2026-09-24) que les reçus
  // de scolarité — pas les salaires/dépenses. Voir schema.sql section 27 :
  // aucune certification réelle n'est câblée tant qu'un prestataire n'a
  // pas d'intégration codée, donc jamais de fausse certification affichée.
  const concerne = r.objet && r.objet.startsWith('Scolarité');
  if(!concerne) return '';
  const c = DB.fneConfig || {regime:'recus'};
  if(c.regime!=='fne') return '';
  if(!c.cleConfiguree) return `<div class="recu-row" style="color:var(--red);"><span>⚠️ FNE</span><strong>Régime activé, prestataire non configuré — reçu NON certifié</strong></div>`;
  return `<div class="recu-row" style="color:var(--amber);"><span>🟡 FNE</span><strong>En attente de connexion à ${escapeHtml(c.prestataire)} — reçu NON encore certifié</strong></div>`;
}
function detailTvaRecu(r){
  if(r.type!=='entree') return '';
  const categorie = categorieRecetteDeObjet(r.objet);
  if(!categorie || !DB.meta.assujettiTva || !tvaApplicablePour(categorie)) return '';
  const taux = DB.meta.tauxTva || 0;
  const montantHT = Math.round(r.montant / (1 + taux/100));
  const montantTva = r.montant - montantHT;
  return `
    <div class="recu-row"><span>Montant HT</span><strong>${fmtFCFA(montantHT)}</strong></div>
    <div class="recu-row"><span>TVA (${taux}%)</span><strong>${fmtFCFA(montantTva)}</strong></div>`;
}
function buildRecuHtml(r){
  const m = DB.meta;
  const numero = genRecuNumero(r.type, r.refId);
  const libType = r.type==='entree' ? "REÇU D'ENTRÉE DE CAISSE" : 'REÇU DE SORTIE DE CAISSE';
  const couleur = r.type==='entree' ? 'var(--green)' : 'var(--red)';
  const tvaConcerne = r.type==='entree' && categorieRecetteDeObjet(r.objet) && DB.meta.assujettiTva && tvaApplicablePour(categorieRecetteDeObjet(r.objet));
  return `
    <div class="recu">
      <div class="recu-head">
        ${m.logo ? `<img src="${escapeHtml(m.logo)}" alt="Logo de ${escapeHtml(m.nomEcole || 'l’école')}">` : `<div class="recu-logo-ph">🎓</div>`}
        <div>
          <strong>${escapeHtml(m.nomEcole)}</strong>
          <div class="hint">${escapeHtml(m.adresse||'')}${m.telephone?' · '+escapeHtml(m.telephone):''}</div>
        </div>
      </div>
      <div class="recu-title" style="color:${couleur};border-color:${couleur};">${libType}</div>
      ${statutFneRecu(r)}
      <div class="recu-row"><span>N° Reçu</span><strong>${numero}</strong></div>
      <div class="recu-row"><span>Date</span><strong>${fmtDate(r.date)}</strong></div>
      <div class="recu-row"><span>${r.type==='entree'?'Reçu de':'Payé à'}</span><strong>${escapeHtml(r.personne||'—')}</strong></div>
      <div class="recu-row"><span>Objet</span><strong>${escapeHtml(r.objet)}</strong></div>
      ${r.sousInfo ? `<div class="recu-row"><span>Détail</span><strong>${escapeHtml(r.sousInfo)}</strong></div>` : ''}
      <div class="recu-row"><span>Mode de paiement</span><strong>${escapeHtml(r.modePaiement||'—')}${souchePour(r.refId)?.enLigne ? ' (paiement en ligne PayDunya, confirmé)' : ''}</strong></div>
      ${detailTvaRecu(r)}
      <div class="recu-montant" style="color:${couleur};">${r.type==='entree'?'+':'−'} ${fmtFCFA(r.montant)}${tvaConcerne?' TTC':''}</div>
      <div class="recu-lettres">Arrêtée la présente somme à : <em>${capitalize(nombreEnLettres(r.montant))} francs CFA</em></div>
      <div class="signatures">
        <div class="sign-box"><div class="sign-role">Le/La Caissier(ère)</div><div class="sign-line">${escapeHtml(m.directeurNom||'—')}</div></div>
        <div class="sign-box"><div class="sign-role">${r.type==='entree'?'Le Payeur':'Le Bénéficiaire'}</div><div class="sign-line">&nbsp;</div></div>
      </div>
    </div>`;
}
function openRecu(r){
  openModal('Reçu de caisse', `
    ${buildRecuHtml(r)}
    <div class="form-actions no-print">
      <button type="button" class="btn secondary" onclick="closeModal()">Fermer</button>
      <button type="button" class="btn" onclick="window.print()">${icone('download')} ${ui.role === 'parent' ? 'Télécharger (PDF) / imprimer' : 'Imprimer le reçu'}</button>
    </div>
    ${ui.role === 'parent' ? '<p class="hint no-print" style="margin:6px 0 0;">Pour l’enregistrer : touchez « Télécharger », puis choisissez « Enregistrer au format PDF ».</p>' : ''}`);
}
// Parent : reçu d'un versement de son enfant (souche officielle de l'école)
function ouvrirRecuParent(paiementId){
  const p = (DB.paiementsScolarite || []).find(x => x.id === paiementId); if(!p) return;
  const e = (DB.eleves || []).find(x => x.id === p.eleveId);
  openRecu({ type:'entree', refId: p.id, montant: p.montant, date: p.date, modePaiement: p.modePaiement, objet: `Scolarité — ${p.tranche || ''}`, personne: e ? eleveFullName(e) : '', sousInfo: e ? classeName(e.classeId) : '' });
}
// École : souches des reçus du mois (numéro, élève, objet, mode, montant) — consultation et réimpression
function ouvrirSouchesRecus(mois){
  mois = mois || thisMonthISO();
  const classeF = ui.filters.soucheClasse || '';
  const duMois = (DB.recus || []).filter(x => String(x.datePaiement || x.emisLe || '').slice(0, 7) === mois);
  const liste = duMois.filter(x => !classeF || eleveById(x.eleveId)?.classeId === classeF).sort((a, b) => String(b.numero).localeCompare(String(a.numero)));
  const classesDuMois = [...new Set(duMois.map(x => eleveById(x.eleveId)?.classeId).filter(Boolean))].map(id => ({ id, nom: classeName(id) })).sort((a, b) => a.nom.localeCompare(b.nom));
  const total = liste.reduce((t, x) => t + Number(x.montant || 0), 0);
  const decale = n => { const [a, m] = mois.split('-').map(Number); const d = new Date(a, m - 1 + n, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
  const nomMois = (t => t.charAt(0).toUpperCase() + t.slice(1))(new Date(mois + '-15T12:00:00').toLocaleDateString('fr-FR', { month:'long', year:'numeric' }));
  openModal(`Souches des reçus — ${nomMois}`, `
    <div class="form-actions no-print" style="margin-top:0;justify-content:space-between;">
      <span style="display:flex;gap:6px;"><button type="button" class="btn secondary sm" onclick="ouvrirSouchesRecus('${decale(-1)}')">‹ Mois précédent</button>${mois < thisMonthISO() ? `<button type="button" class="btn secondary sm" onclick="ouvrirSouchesRecus('${decale(1)}')">Mois suivant ›</button>` : ''}</span>
      <span style="display:flex;gap:6px;flex-wrap:wrap;">${classesDuMois.length > 1 ? `<select class="puce-select petit" aria-label="Classe" onchange="ui.filters.soucheClasse=this.value; ouvrirSouchesRecus('${mois}')"><option value="">Toutes les classes</option>${classesDuMois.map(c => `<option value="${c.id}" ${classeF === c.id ? 'selected' : ''}>${escapeHtml(c.nom)}</option>`).join('')}</select>` : ''}
      <button type="button" class="btn secondary sm" onclick="window.print()">${icone('printer')} Imprimer la liste</button>
      ${liste.length ? `<button type="button" class="btn sm" onclick="imprimerRecusGroupes('${mois}')">${icone('receipt')} Imprimer les ${liste.length} reçu(s)</button>` : ''}</span></div>
    <p class="hint">Un numéro par versement, attribué par la base (impossible à modifier ou effacer). <strong>${liste.length}</strong> reçu(s) · total <strong>${fmtFCFA(total)}</strong>.</p>
    ${liste.length ? `<ul class="souches">${liste.map(x => { const e = eleveById(x.eleveId); return `<li class="souche">
      <span class="souche-num">${escapeHtml(x.numero)}</span>
      <span class="souche-txt"><strong>${e ? escapeHtml(eleveFullName(e)) : 'Élève'}</strong><small>${escapeHtml(x.objet || '')} · ${fmtDate(x.datePaiement || String(x.emisLe).slice(0, 10))} · ${escapeHtml(x.modePaiement || '')}${x.enLigne ? ' (en ligne)' : ''}</small></span>
      <span class="souche-montant">${fmtFCFA(x.montant)}</span>
      <button type="button" class="icon-btn no-print" title="Réimprimer le reçu" aria-label="Réimprimer le reçu ${escapeHtml(x.numero)}" onclick="reimprimerSouche('${x.id}')">🧾</button></li>`; }).join('')}</ul>`
      : '<div class="etat-vide"><span>Aucun reçu ce mois-ci.</span></div>'}`);
}
// Tous les reçus du mois (et de la classe choisie), 2 par page A4, rangés par élève : à remettre aux familles
function imprimerRecusGroupes(mois){
  const classeF = ui.filters.soucheClasse || '';
  const liste = (DB.recus || []).filter(x => String(x.datePaiement || x.emisLe || '').slice(0, 7) === mois && (!classeF || eleveById(x.eleveId)?.classeId === classeF))
    .map(x => ({ x, e: eleveById(x.eleveId) }))
    .sort((a, b) => (a.e ? classeName(a.e.classeId) : '').localeCompare(b.e ? classeName(b.e.classeId) : '') || (a.e ? eleveFullName(a.e) : '').localeCompare(b.e ? eleveFullName(b.e) : '') || String(a.x.numero).localeCompare(String(b.x.numero)));
  if(!liste.length) return;
  const recus = liste.map(({ x, e }) => buildRecuHtml({ type:'entree', refId: x.enregistrementId, montant: x.montant, date: x.datePaiement, modePaiement: x.modePaiement, objet: x.objet, personne: e ? eleveFullName(e) : '', sousInfo: e ? classeName(e.classeId) : '' }));
  const nomMois = (t => t.charAt(0).toUpperCase() + t.slice(1))(new Date(mois + '-15T12:00:00').toLocaleDateString('fr-FR', { month:'long', year:'numeric' }));
  openModal(`${liste.length} reçu(s) — ${nomMois}${classeF ? ' — ' + classeName(classeF) : ''}`, `
    <div class="form-actions no-print" style="margin-top:0;justify-content:space-between;align-items:center;">
      <span class="hint" style="margin:0;">2 reçus par page A4, rangés par classe puis par élève. ${Math.ceil(liste.length / 2)} page(s).</span>
      <span style="display:flex;gap:6px;"><button type="button" class="btn secondary sm" onclick="ouvrirSouchesRecus('${mois}')">‹ Souches</button>
      <button type="button" class="btn sm" onclick="window.print()">${icone('printer')} Imprimer / PDF</button></span></div>
    <div class="recus-lot">${recus.join('')}</div>`);
}
function reimprimerSouche(id){
  const x = (DB.recus || []).find(r => r.id === id); if(!x) return;
  const e = eleveById(x.eleveId);
  openRecu({ type:'entree', refId: x.enregistrementId, montant: x.montant, date: x.datePaiement, modePaiement: x.modePaiement, objet: x.objet, personne: e ? eleveFullName(e) : '', sousInfo: e ? classeName(e.classeId) : '' });
}

function renderComptabilite(){
  const tab = ui.filters.comptaTab || 'apercu';
  ui.filters.comptaTab = tab;
  const renderers = {
    apercu: renderComptaApercu, scolarite: renderComptaScolarite, cantine: renderComptaCantine, activites: renderComptaActivites,
    ventes: renderComptaVentes, salaires: renderComptaSalaires, depenses: renderComptaDepenses,
    journal: renderComptaJournal, annees: renderComptaAnnees, budget: renderComptaBudget, fne: renderComptaFne,
    syscohada: renderComptaSyscohada, rapprochement: renderComptaRapprochement,
  };
  // Les salaires, les dépenses, le journal d'audit, la comparaison annuelle,
  // le budget, le plan SYSCOHADA et le rapprochement bancaire sont réservés
  // à Direction/Fondation (aussi dans la base : voir schema.sql section 42) —
  // le Secrétariat gère la scolarité, les activités et la boutique.
  const estAdmin = ui.role==='direction' || ui.role==='fondation';
  const ongletsReserves = ['salaires','depenses','journal','annees','budget','syscohada','rapprochement'];
  const tabsVisibles = COMPTA_TABS.filter(t => !ongletsReserves.includes(t.id) || estAdmin);
  const cacheAReinitialiser = {journal:'__journalComptaCache', budget:'__budgetsComptaCache'};
  return `
  <div class="view active">
    ${(setTimeout(centrerOngletActif, 0), '')}
    <div class="subtabs">
      ${tabsVisibles.map(t=>`<button class="subtab ${tab===t.id?'active':''}" onclick="ui.filters.comptaTab='${t.id}'; ${cacheAReinitialiser[t.id]?cacheAReinitialiser[t.id]+'=null; ':''}renderView('comptabilite')">${t.icon} ${t.label}</button>`).join('')}
    </div>
    ${(renderers[tab] || renderComptaApercu)()}
  </div>`;
}

/* --- FNE (Facture Normalisée Électronique) — mode assisté ---
   La facture est créée sur la plateforme FNE de la DGI ; on note ici son numéro.
   Le jour où l'école a sa clé API DGI, la certification pourra devenir automatique. */
const LIEN_PLATEFORME_FNE = 'https://www.fne.dgi.gouv.ci/';
function encaissementsFne(mois){
  const ligne = (table, x, montant, objet, payeur) => ({ table, id: x.id, date: x.date, montant: Number(montant || 0), mode: x.modePaiement || '', objet, payeur });
  const el = id => eleveById(id);
  return [
    ...(DB.paiementsScolarite || []).map(x => { const e = el(x.eleveId); return ligne('paiements_scolarite', x, x.montant, `Scolarité — ${x.tranche || ''}`, e ? `${e.parentNom || 'Parent de ' + eleveFullName(e)} (élève : ${eleveFullName(e)}, ${classeName(e.classeId)})` : 'Élève'); }),
    ...(DB.paiementsCotisations || []).map(x => { const e = el(x.eleveId), a = (DB.activites || []).find(y => y.id === x.activiteId); return ligne('paiements_cotisations', x, x.montant, `Activité — ${a ? a.nom : ''}`, e ? `${e.parentNom || 'Parent de ' + eleveFullName(e)} (élève : ${eleveFullName(e)})` : 'Élève'); }),
    ...(DB.ventesGadgets || []).map(x => { const e = x.eleveId ? el(x.eleveId) : null, g = (DB.gadgets || []).find(y => y.id === x.gadgetId); return ligne('ventes_gadgets', x, x.montantTotal, `Boutique — ${g ? g.nom : 'article'}${x.quantite > 1 ? ' × ' + x.quantite : ''}`, e ? `${e.parentNom || 'Parent de ' + eleveFullName(e)} (élève : ${eleveFullName(e)})` : 'Client'); }),
  ].filter(x => String(x.date || '').startsWith(mois)).sort((a, b) => b.date.localeCompare(a.date));
}
function renderComptaFne(){
  const mois = ui.filters.fneMois || thisMonthISO(); ui.filters.fneMois = mois;
  const statut = ui.filters.fneStatut || 'a-certifier';
  const toutes = encaissementsFne(mois);
  const certifiees = toutes.filter(x => certificationDe(x.id)), aFaire = toutes.filter(x => !certificationDe(x.id));
  const liste = statut === 'certifiees' ? certifiees : statut === 'toutes' ? toutes : aFaire;
  const m = DB.meta || {}, total = l => l.reduce((t, x) => t + x.montant, 0);
  const moisLib = d => new Date(d + '-15T12:00:00').toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  const ligne = x => { const c = certificationDe(x.id); return `<li class="fne-ligne${c ? ' faite' : ''}">
      <span class="fne-txt"><strong>${escapeHtml(x.objet)}</strong><small>${fmtDate(x.date)} · ${escapeHtml(x.payeur)}${x.mode ? ' · ' + escapeHtml(x.mode) : ''}</small>
        ${c ? `<small class="fne-num">FNE n° ${escapeHtml(c.numero)} · noté le ${fmtDate(String(c.certifieLe).slice(0, 10))}</small>` : ''}</span>
      <span class="fne-montant">${fmtFCFA(x.montant)}</span>
      <span class="fne-act">${c ? `<button type="button" class="btn secondary sm" onclick="ouvrirSaisieFne('${x.table}','${x.id}')">Modifier</button>`
        : `<button type="button" class="btn secondary sm" onclick="copierInfosFne('${x.table}','${x.id}')">Copier les infos</button><button type="button" class="btn sm" onclick="ouvrirSaisieFne('${x.table}','${x.id}')">Noter le n° FNE</button>`}</span>
    </li>`; };
  return `<div class="panel">
    <div class="panel-head"><div><h2>🧾 FNE — Facture Normalisée Électronique</h2><div class="sub">Mode assisté : la facture est créée sur la plateforme de la DGI, EcoMaZ garde son numéro et l’imprime sur le reçu.</div></div>
      <a class="btn secondary sm" href="${LIEN_PLATEFORME_FNE}" target="_blank" rel="noopener">Ouvrir la plateforme FNE (DGI)</a></div>
    <ol class="fne-etapes">
      <li>Touchez <strong>« Copier les infos »</strong> sur un encaissement.</li>
      <li>Sur la plateforme FNE de la DGI, créez la facture et <strong>collez</strong> les informations.</li>
      <li>Revenez ici, touchez <strong>« Noter le n° FNE »</strong> : le numéro (et le QR de vérification) apparaît sur le reçu EcoMaZ.</li>
    </ol>
    <div class="fne-filtres">
      <span class="fne-mois"><button type="button" class="btn secondary sm" aria-label="Mois précédent" onclick="ui.filters.fneMois='${moisDecale(mois, -1)}'; renderView('comptabilite')">‹</button>
        <strong>${moisLib(mois)}</strong>
        ${mois < thisMonthISO() ? `<button type="button" class="btn secondary sm" aria-label="Mois suivant" onclick="ui.filters.fneMois='${moisDecale(mois, 1)}'; renderView('comptabilite')">›</button>` : ''}</span>
      <div class="segmente" role="tablist">${[['a-certifier', `À certifier (${aFaire.length})`], ['certifiees', `Certifiées (${certifiees.length})`], ['toutes', `Tout (${toutes.length})`]].map(([k, l]) => `<button type="button" class="seg${statut === k ? ' actif' : ''}" onclick="ui.filters.fneStatut='${k}'; renderView('comptabilite')">${l}</button>`).join('')}</div>
    </div>
    <div class="fne-resume">
      <div><small>Encaissé</small><strong>${fmtFCFA(total(toutes))}</strong></div>
      <div class="ok"><small>Certifié FNE</small><strong>${fmtFCFA(total(certifiees))}</strong></div>
      <div class="${aFaire.length ? 'ko' : 'ok'}"><small>Reste à certifier</small><strong>${fmtFCFA(total(aFaire))}</strong></div>
    </div>
    ${liste.length ? `<ul class="fne-liste">${liste.map(ligne).join('')}</ul>` : `<div class="etat-vide${statut === 'a-certifier' && toutes.length ? ' etat-vide-ok' : ''}"><span>${statut === 'a-certifier' && toutes.length ? 'Tous les encaissements de ce mois ont leur numéro FNE 🎉' : 'Aucun encaissement pour ce mois.'}</span></div>`}
    <div class="form-actions" style="justify-content:flex-start;"><button type="button" class="btn secondary sm" onclick="exporterFneCsv('${mois}')">⬇️ Export du mois pour le comptable (CSV)</button></div>
    <p class="hint" style="margin-bottom:0;">Certification automatique (sans recopier) : possible dès que l’école obtient sa <strong>clé API FNE</strong> auprès de la DGI. ${escapeHtml(m.nomEcole || 'L’école')} doit confirmer avec son comptable quels reçus sont concernés.</p>
  </div>`;
}
function infosFne(table, id){ return encaissementsFne(String((({ paiements_scolarite: DB.paiementsScolarite, paiements_cotisations: DB.paiementsCotisations, ventes_gadgets: DB.ventesGadgets })[table] || []).find(x => x.id === id)?.date || '').slice(0, 7)).find(x => x.table === table && x.id === id); }
function copierInfosFne(table, id){
  const x = infosFne(table, id); if(!x) return;
  const m = DB.meta || {};
  const texte = `Vendeur : ${m.nomEcole || ''}${m.adresse ? ' — ' + m.adresse : ''}\nClient : ${x.payeur}\nDésignation : ${x.objet}\nQuantité : 1\nMontant : ${Math.round(x.montant)} FCFA\nDate : ${fmtDate(x.date)}\nMode de paiement : ${x.mode || '—'}\nRéférence EcoMaZ : ${x.id.slice(0, 8).toUpperCase()}`;
  (navigator.clipboard ? navigator.clipboard.writeText(texte) : Promise.reject()).then(() => toast('Informations copiées : collez-les sur la plateforme FNE'), () => window.prompt('Copiez ces informations :', texte));
}
function ouvrirSaisieFne(table, id){
  const x = infosFne(table, id); if(!x) return;
  const c = certificationDe(id);
  openModal('Numéro FNE de l’encaissement', `
    <div class="section-note">${escapeHtml(x.objet)} · ${fmtFCFA(x.montant)} · ${fmtDate(x.date)}<br><small>${escapeHtml(x.payeur)}</small></div>
    ${boutonRemplissage('fne', 'SCHEMA_FNE', 'formFne')}<form id="formFne" onsubmit="return enregistrerSaisieFne(event,'${table}','${id}')">
      <div class="field"><label for="fneNumero">Numéro de la facture FNE (donné par la plateforme de la DGI)</label><input id="fneNumero" required minlength="3" maxlength="60" value="${escapeHtml(c ? c.numero : '')}" autocomplete="off"></div>
      <div class="field"><label for="fneLien">Lien de vérification (facultatif, commence par https://)</label><input id="fneLien" type="url" maxlength="300" placeholder="https://…" value="${escapeHtml(c && c.lien ? c.lien : '')}"></div>
      <div class="pin-error" id="fneErr"></div>
      <div class="form-actions">
        ${c ? `<button type="button" class="btn secondary danger-texte" onclick="retirerSaisieFne('${c.id}')">Retirer</button>` : ''}
        <button type="button" class="btn secondary" onclick="closeModal()">Annuler</button><button type="submit" class="btn">Enregistrer</button>
      </div>
    </form>`);
}
async function enregistrerSaisieFne(ev, table, id){
  ev.preventDefault();
  const numero = $('#fneNumero').value.trim(), lien = $('#fneLien').value.trim() || null;
  if(lien && !/^https:\/\//.test(lien)){ $('#fneErr').textContent = 'Le lien doit commencer par https://'; return false; }
  const c = certificationDe(id);
  const { data, error } = c
    ? await sb.from('certifications_fne').update({ numero, lien }).eq('id', c.id).select().single()
    : await sb.from('certifications_fne').insert({ ecole_id: session.ecoleId, table_cible: table, enregistrement_id: id, numero, lien }).select().single();
  if(error){ $('#fneErr').textContent = /unique|duplicate/i.test(error.message) ? 'Ce numéro FNE est déjà noté sur un autre encaissement.' : 'Erreur : ' + error.message; return false; }
  DB.certificationsFne = (DB.certificationsFne || []).filter(x => x.id !== data.id).concat(rowToCamel(data));
  closeModal(); toast('Numéro FNE enregistré ✅'); renderView('comptabilite');
  return false;
}
async function retirerSaisieFne(certId){
  if(!confirm('Retirer ce numéro FNE de l’encaissement ?')) return;
  const { error } = await exigerEffet(sb.from('certifications_fne').delete().eq('id', certId));
  if(error){ alert('Erreur : ' + error.message); return; }
  DB.certificationsFne = (DB.certificationsFne || []).filter(x => x.id !== certId);
  closeModal(); toast('Numéro FNE retiré'); renderView('comptabilite');
}
function exporterFneCsv(mois){
  const q = v => { const t = String(v ?? ''); return /[",;\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; };
  const lignes = [['Date', 'Désignation', 'Client', 'Montant (FCFA)', 'Mode', 'Numéro FNE', 'Lien de vérification', 'Référence EcoMaZ']]
    .concat(encaissementsFne(mois).map(x => { const c = certificationDe(x.id); return [x.date, x.objet, x.payeur, Math.round(x.montant), x.mode, c ? c.numero : 'À CERTIFIER', c && c.lien ? c.lien : '', x.id.slice(0, 8).toUpperCase()]; }));
  const blob = new Blob(['\ufeff' + lignes.map(l => l.map(q).join(';')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `FNE_${mois}.csv`; a.click(); URL.revokeObjectURL(a.href);
}
