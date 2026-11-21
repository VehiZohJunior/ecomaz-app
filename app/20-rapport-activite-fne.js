/* =====================================================================
   RAPPORT D'ACTIVITÉ D'UN ENSEIGNANT (enseignant : le sien ; secrétariat,
   direction, fondation : chaque enseignant) — calculé par la base (section 108)
   ===================================================================== */
const DEBUT_SUIVI_AUTEUR = '2026-11-08';   // auteur des appels et des notes enregistré depuis cette date
function periodeRapport(code){
  const auj = todayISO(), d = new Date(auj + 'T12:00:00');
  const lundi = (() => { const x = new Date(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return isoLocal(x); })();
  const debutMois = auj.slice(0, 8) + '01';
  const evts = DB.agenda || [];
  const rentree = (evts.find(e => /rentr[ée]e scolaire/i.test(e.titre)) || {}).dateDebut || (Number(auj.slice(5, 7)) >= 9 ? auj.slice(0, 4) : String(Number(auj.slice(0, 4)) - 1)) + '-09-01';
  const fins = evts.filter(e => /fin du\s*\d/i.test(e.titre)).map(e => e.dateDebut).sort();
  const finPrec = fins.filter(f => f < auj).pop();
  const debutTrim = finPrec ? decalerJours(finPrec, 1) : rentree;
  const P = {
    semaine: { lib: 'Cette semaine', debut: lundi, fin: auj },
    mois: { lib: 'Ce mois', debut: debutMois, fin: auj },
    'mois-prec': { lib: 'Mois dernier', debut: moisDecale(auj.slice(0, 7), -1) + '-01', fin: decalerJours(debutMois, -1) },
    trimestre: { lib: 'Ce trimestre', debut: debutTrim, fin: auj },
    annee: { lib: 'Depuis la rentrée', debut: rentree, fin: auj },
  };
  return { codes: P, choisi: P[code] || P.mois };
}
function renderRapportActivite(){
  const admin = ['secretariat','direction','fondation'].includes(ui.role);
  chargerAgenda();
  const ensActifs = (DB.enseignants || []).filter(t => t.statut === 'Actif').sort((a, b) => (a.nom || '').localeCompare(b.nom || ''));
  const ensId = admin ? (ensActifs.find(t => t.id === ui.filters.rapportEns) ? ui.filters.rapportEns : ensActifs[0]?.id) : session.enseignantId;
  if(!ensId) return `<div class="view active"><div class="panel"><div class="etat-vide"><span>${admin ? 'Aucun enseignant enregistré.' : 'Votre compte n’est pas encore relié à une fiche enseignant : inscrivez-vous depuis votre tableau de bord (« Je m’enrôle »).'}</span></div></div></div>`;
  ui.filters.rapportEns = ensId;
  const code = ui.filters.rapportPeriode || 'mois';
  const { codes, choisi } = periodeRapport(code);
  const cle = `${ensId}|${choisi.debut}|${choisi.fin}`;
  ui.rapportCache = ui.rapportCache || {};
  if(ui.rapportCache[cle] === undefined){
    ui.rapportCache[cle] = null;
    sb.rpc('rapport_activite_enseignant', { p_enseignant: ensId, p_debut: choisi.debut, p_fin: choisi.fin }).then(({ data, error }) => {
      ui.rapportCache[cle] = error ? { erreur: error.message } : data;
      if(ui.currentView === 'rapport-activite') renderView('rapport-activite');
    });
  }
  const d = ui.rapportCache[cle];
  return `<div class="view active">
    <div class="panel rapport-tete no-print">
      ${admin ? `<div class="field" style="margin:0 0 10px;"><label for="rapEns">Enseignant</label>
        <select id="rapEns" onchange="ui.filters.rapportEns=this.value; renderView('rapport-activite')">${ensActifs.map(t => `<option value="${t.id}" ${t.id === ensId ? 'selected' : ''}>${escapeHtml(ensFullName(t))}${(t.classesAssignees || []).length ? ' — ' + (t.classesAssignees || []).map(classeName).join(', ') : ''}</option>`).join('')}</select></div>` : ''}
      <div class="segmente rapport-periodes" role="tablist" aria-label="Période">${Object.entries(codes).map(([k, v]) => `<button type="button" role="tab" class="seg${k === code ? ' actif' : ''}" aria-selected="${k === code}" onclick="ui.filters.rapportPeriode='${k}'; renderView('rapport-activite')">${v.lib}</button>`).join('')}</div>
    </div>
    ${d === null ? '<div class="panel"><div class="hint">Calcul du rapport…</div></div>' : d.erreur ? `<div class="panel"><div class="etat-vide"><span>Rapport indisponible : ${escapeHtml(d.erreur)}</span></div></div>` : rapportActiviteHtml(d, choisi, admin)}
  </div>`;
}
function rapportActiviteHtml(d, periode, admin){
  const e = d.enseignant || {}, a = d.appels || {}, pt = d.pointage || {}, pr = d.programmes || {};
  const titre = e.sexe === 'F' ? 'Maîtresse' : e.sexe === 'M' ? 'M.' : '';
  const regularite = a.attendus ? Math.round(100 * a.faits / a.attendus) : null;
  const n = v => Number(v || 0);
  // Synthèse : points forts et points à surveiller, en clair
  const forts = [], surveiller = [];
  if(regularite !== null){ if(regularite >= 90) forts.push(`appel fait ${regularite} % des jours de classe`); else if(a.attendus >= 3) surveiller.push(`appel fait seulement ${regularite} % des jours de classe (${a.manquants} manquant${a.manquants > 1 ? 's' : ''})`); }
  if(n(pt.jours_pointes)){ if(!n(pt.retards) && !n(pt.absences)) forts.push('aucun retard ni absence au pointage'); else { if(n(pt.retards)) surveiller.push(`${pt.retards} retard${pt.retards > 1 ? 's' : ''} (${pt.minutes_retard} min au total)`); if(n(pt.absences)) surveiller.push(`${pt.absences} absence${pt.absences > 1 ? 's' : ''}`); } }
  if(n(d.devoirs)) forts.push(`${d.devoirs} devoir${d.devoirs > 1 ? 's' : ''} noté${d.devoirs > 1 ? 's' : ''} au cahier de textes`); else if(n(d.periode?.jours_classe) >= 8) surveiller.push('aucun devoir noté au cahier de textes');
  if(n(d.notes) || n(d.evaluations)) forts.push(`${n(d.evaluations)} évaluation${n(d.evaluations) > 1 ? 's' : ''} et ${n(d.notes)} note${n(d.notes) > 1 ? 's' : ''} saisie${n(d.notes) > 1 ? 's' : ''}`);
  if(n(d.messages)) forts.push(`${d.messages} message${d.messages > 1 ? 's' : ''} aux parents`);
  const tuile = (ic, val, lib, cls, det) => `<div class="ra-tuile ${cls || ''}"><span class="ra-ic" aria-hidden="true">${icone(ic) || ''}</span><strong>${val}</strong><small>${lib}</small>${det ? `<em>${det}</em>` : ''}</div>`;
  const ICONES = { appel: 'circle-check', devoir: 'notebook-pen', evaluation: 'file-text', notes: 'pencil', publication: 'camera', message: 'mail', pointage: 'clock' };
  return `<section class="panel rapport-activite">
    <div class="ra-entete">
      <div><h2>${escapeHtml([titre, e.prenom, e.nom].filter(Boolean).join(' '))}</h2>
        <div class="sub">${escapeHtml(e.matricule || '')}${(e.classes || []).length ? ' · ' + e.classes.map(escapeHtml).join(', ') : ''}${(e.matieres || []).length ? ' · ' + e.matieres.map(escapeHtml).join(', ') : ''}</div>
        <div class="sub">Rapport d’activité — ${escapeHtml(periode.lib.toLowerCase())} (du ${fmtDate(periode.debut)} au ${fmtDate(d.periode?.fin || periode.fin)}) · ${n(d.periode?.jours_classe)} jour${n(d.periode?.jours_classe) > 1 ? 's' : ''} de classe</div></div>
      <button type="button" class="btn secondary sm no-print" onclick="imprimerRapportActivite()">${icone('printer')} Imprimer</button>
    </div>
    ${admin && !e.a_un_compte ? `<div class="alerte-inscription" style="margin:0 0 12px;">Cet enseignant n’a pas encore son accès à l’application : ses appels, devoirs et notes ne peuvent pas encore lui être attribués. <button type="button" class="lien-discret" onclick="ouvrirAccesPersonnel('${ui.filters.rapportEns}')">Activer son accès</button></div>` : ''}
    ${forts.length || surveiller.length ? `<div class="ra-synthese">
      ${forts.length ? `<div class="ra-forts"><strong>Points forts</strong><ul>${forts.map(x => `<li>${escapeHtml(x)}</li>`).join('')}</ul></div>` : ''}
      ${surveiller.length ? `<div class="ra-surveiller"><strong>À surveiller</strong><ul>${surveiller.map(x => `<li>${escapeHtml(x)}</li>`).join('')}</ul></div>` : ''}</div>` : ''}
    <div class="ra-grille">
      ${tuile('circle-check', regularite === null ? '—' : regularite + ' %', 'Régularité de l’appel', regularite === null ? '' : regularite >= 90 ? 'ok' : regularite >= 70 ? 'moyen' : 'ko', `${n(a.faits)} / ${n(a.attendus)} appels${n(a.par_lui) ? ` · ${a.par_lui} par lui-même` : ''}${n(a.par_autre) ? ` · ${a.par_autre} par un autre compte` : ''}${n(a.sans_auteur) ? ` · ${a.sans_auteur} sans auteur connu` : ''}`)}
      ${tuile('clock', n(pt.jours_pointes) ? `${n(pt.presents)} / ${n(pt.jours_pointes)}` : '—', 'Pointage (jours présents)', n(pt.retards) || n(pt.absences) ? 'moyen' : n(pt.jours_pointes) ? 'ok' : '', n(pt.jours_pointes) ? `${n(pt.retards)} retard(s) · ${n(pt.minutes_retard)} min · ${n(pt.absences)} absence(s)` : 'aucun pointage sur la période')}
      ${tuile('notebook-pen', n(d.devoirs), 'Devoirs notés', '', 'cahier de textes')}
      ${tuile('file-text', n(d.evaluations), 'Évaluations créées', '', 'camps de base')}
      ${tuile('pencil', n(d.notes), 'Notes saisies', '', `${n(d.appreciations)} appréciation(s)`)}
      ${tuile('book-open', n(pr.nb) ? n(pr.progression) + ' %' : '—', 'Avancement des programmes', '', n(pr.nb) ? `${pr.nb} programme(s) suivi(s)` : 'aucun programme renseigné')}
      ${tuile('mail', n(d.messages), 'Messages aux parents', '', '')}
      ${tuile('camera', n(d.publications), 'Publications', '', 'vie de l’école')}
    </div>
    ${(a.manques || []).length ? `<div class="ra-bloc"><h3>Appels non faits</h3><div class="ra-manques">${a.manques.map(m => `<span class="badge-etat attente">${fmtDate(m.date)} · ${escapeHtml(m.classe || '')}</span>`).join('')}${n(a.manquants) > a.manques.length ? `<span class="hint" style="margin:0;">et ${a.manquants - a.manques.length} autre(s)</span>` : ''}</div></div>` : ''}
    <div class="ra-bloc"><h3>Chronologie des activités</h3>
      ${(d.chronologie || []).length ? `<ul class="ra-chrono">${d.chronologie.map(c => `<li><span class="ra-chrono-ic" aria-hidden="true">${icone(ICONES[c.type] || 'circle-dot') || ''}</span><span class="ra-chrono-txt">${escapeHtml(c.texte)}</span><time>${c.quand ? new Date(c.quand).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''}</time></li>`).join('')}</ul>`
        : '<div class="hint" style="margin:0;">Aucune activité enregistrée par ce compte sur la période.</div>'}
    </div>
    ${periode.debut < DEBUT_SUIVI_AUTEUR ? `<p class="hint" style="margin-bottom:0;">L’auteur de chaque appel et de chaque note est enregistré depuis le ${fmtDate(DEBUT_SUIVI_AUTEUR)} : avant cette date, les appels faits comptent pour la classe mais ne peuvent pas être attribués à une personne.</p>` : ''}
  </section>`;
}
function imprimerRapportActivite(){
  const z = document.querySelector('.rapport-activite'); if(!z) return;
  const m = DB.meta || {};
  openModal('Rapport d’activité', `
    <div class="form-actions no-print" style="margin-top:0;justify-content:flex-end;"><button type="button" class="btn" onclick="window.print()">${icone('printer')} Imprimer / PDF</button></div>
    <section class="ra-impression">
      <div class="recu-head">${m.logo ? `<img src="${escapeHtml(m.logo)}" alt="">` : `<div class="recu-logo-ph">🎓</div>`}
        <div><strong>${escapeHtml(m.nomEcole || '')}</strong><div class="hint">${escapeHtml(m.adresse || '')}</div></div>
        <div style="margin-left:auto;text-align:right;"><strong>RAPPORT D’ACTIVITÉ</strong><div class="hint">Imprimé le ${fmtDate(todayISO())}</div></div></div>
      ${z.outerHTML.replace(/class="panel rapport-activite"/, 'class="rapport-activite"')}
    </section>`);
}
/* --- 12.1 Aperçu financier --- */
function renderComptaApercu(){
  const periode = ui.filters.comptaPeriode || 'all';
  ui.filters.comptaPeriode = periode;
  const inPeriod = iso => periode==='all' || iso.slice(0,7)===periode;

  const recScolarite = DB.paiementsScolarite.filter(p=>inPeriod(p.date)).reduce((s,p)=>s+p.montant,0);
  const recCotisations = DB.paiementsCotisations.filter(p=>inPeriod(p.date)).reduce((s,p)=>s+p.montant,0);
  const recVentes = DB.ventesGadgets.filter(v=>inPeriod(v.date)).reduce((s,v)=>s+v.montantTotal,0);
  const totalRecettes = recScolarite + recCotisations + recVentes;

  // TVA collectée (aide de calcul, voir renderPanneauTva) : les montants
  // ci-dessus sont TTC, on en extrait la part TVA pour les catégories où
  // elle a été activée dans Paramètres.
  const tauxTva = DB.meta.tauxTva || 0;
  const extraireTva = montant => DB.meta.assujettiTva && tauxTva>0 ? Math.round(montant - montant/(1+tauxTva/100)) : 0;
  const tvaCollectee = (tvaApplicablePour('Scolarité')?extraireTva(recScolarite):0)
    + (tvaApplicablePour('Activités extra-scolaires')?extraireTva(recCotisations):0)
    + (tvaApplicablePour('Boutique scolaire')?extraireTva(recVentes):0);

  const depSalaires = DB.paiementsSalaires.filter(p=>inPeriod(p.datePaiement)).reduce((s,p)=>s+p.montant,0);
  const depParCategorie = {};
  CATEGORIES_DEPENSES.forEach(c=> depParCategorie[c] = DB.depenses.filter(d=>d.categorie===c && inPeriod(d.date)).reduce((s,d)=>s+d.montant,0));
  const depAutres = Object.values(depParCategorie).reduce((s,v)=>s+v,0);
  const totalDepenses = depSalaires + depAutres;
  const resultat = totalRecettes - totalDepenses;

  const eleveActifs = DB.eleves.filter(e=>e.statut==='Actif');
  const totalDu = eleveActifs.reduce((s,e)=> s+duAnnuelClasse(e.classeId), 0);
  const totalPayeScolarite = DB.paiementsScolarite.reduce((s,p)=>s+p.montant,0);
  const tauxRecouvrement = totalDu ? Math.round(100*Math.min(totalPayeScolarite,totalDu)/totalDu) : 0;

  const maxRec = Math.max(recScolarite, recCotisations, recVentes, 1);
  const recBars = [
    {label:'Scolarité', val:recScolarite}, {label:'Activités extra-scolaires', val:recCotisations}, {label:'Boutique scolaire', val:recVentes},
  ].map(b=>`<div style="display:flex;align-items:center;gap:10px;margin-bottom:9px;">
    <div style="width:170px;font-size:var(--fs-xs);color:var(--text-dim);flex-shrink:0;">${b.label}</div>
    <div class="progress" style="flex:1;"><div style="width:${Math.round(100*b.val/maxRec)}%;background:var(--green);"></div></div>
    <div style="width:100px;text-align:right;font-size:var(--fs-xs);font-weight:700;">${fmtFCFA(b.val)}</div>
  </div>`).join('');

  const depEntries = [{label:'Salaires', val:depSalaires}, ...CATEGORIES_DEPENSES.map(c=>({label:c, val:depParCategorie[c]}))].filter(d=>d.val>0);
  const maxDep = Math.max(...depEntries.map(d=>d.val), 1);
  const depBars = (depEntries.length ? depEntries : [{label:'Aucune dépense', val:0}]).map(b=>`<div style="display:flex;align-items:center;gap:10px;margin-bottom:9px;">
    <div style="width:170px;font-size:var(--fs-xs);color:var(--text-dim);flex-shrink:0;">${b.label}</div>
    <div class="progress" style="flex:1;"><div style="width:${Math.round(100*b.val/maxDep)}%;background:var(--red);"></div></div>
    <div style="width:100px;text-align:right;font-size:var(--fs-xs);font-weight:700;">${fmtFCFA(b.val)}</div>
  </div>`).join('');

  const impayes = eleveActifs.map(e=>({e, info:scolariteEleveInfo(e.id)})).filter(x=>x.info.solde>0).sort((a,b)=>b.info.solde-a.info.solde).slice(0,8);
  const impayesHtml = impayes.map(x=>`<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border);">
    <div><strong style="font-size:var(--fs-xs);cursor:pointer;" onclick="go('eleves'); viewEleveProfile('${x.e.id}')">${escapeHtml(eleveFullName(x.e))}</strong><div class="hint">${classeName(x.e.classeId)} · ${escapeHtml(x.e.parentTel)}</div></div>
    <span class="amount out">${fmtFCFA(x.info.solde)}</span>
  </div>`).join('') || `<div class="hint">Aucun impayé — bravo ! 🎉</div>`;

  const txns = [];
  DB.paiementsScolarite.forEach(p=>txns.push({date:p.date, type:'in', ic:'🎓', label:`Scolarité — ${escapeHtml(eleveFullName(eleveById(p.eleveId)||{prenom:'—',nom:''}))}`, sub:p.tranche, montant:p.montant}));
  DB.paiementsCotisations.forEach(p=>{ const act = DB.activites.find(a=>a.id===p.activiteId); txns.push({date:p.date, type:'in', ic:'🎨', label:`Cotisation ${act?escapeHtml(act.nom):''} — ${escapeHtml(eleveFullName(eleveById(p.eleveId)||{prenom:'—',nom:''}))}`, sub:'Activité extra-scolaire', montant:p.montant}); });
  DB.ventesGadgets.forEach(v=>{ const g = DB.gadgets.find(x=>x.id===v.gadgetId); txns.push({date:v.date, type:'in', ic:'🛍️', label:`Vente ${g?escapeHtml(g.nom):''} ×${v.quantite}`, sub:'Boutique scolaire', montant:v.montantTotal}); });
  DB.paiementsSalaires.forEach(p=>txns.push({date:p.datePaiement, type:'out', ic:'💵', label:`Salaire — ${escapeHtml(personnelNomById(p.personnelId,p.personnelType))}`, sub:moisLabel(p.mois), montant:p.montant}));
  DB.depenses.forEach(d=>txns.push({date:d.date, type:'out', ic: d.categorie==='Loyer'?'🏠':'🧾', label:escapeHtml(d.libelle), sub:d.categorie, montant:d.montant}));
  txns.sort((a,b)=>b.date.localeCompare(a.date));
  const recentTxns = txns.filter(t=>inPeriod(t.date)).slice(0,12);
  const txnsHtml = recentTxns.map(t=>`<div class="txn-item">
    <div class="txn-ic ${t.type}">${t.ic}</div>
    <div class="txn-body"><div class="txn-title">${t.label}</div><div class="txn-sub">${t.sub} · ${fmtDate(t.date)}</div></div>
    <div class="amount ${t.type}">${t.type==='in'?'+':'−'} ${fmtFCFA(t.montant)}</div>
  </div>`).join('') || `<div class="hint">Aucune transaction sur cette période.</div>`;

  const secret = ui.role === 'secretariat';
  // Important : quand secret=true, les montants réels ne sont JAMAIS écrits dans le HTML
  // (pas de flou CSS sur la vraie valeur) — inspecter le code source ne révèle rien.
  const maskNum = `<div class="num masked-num">🔒 ••••••</div>`;
  const maskPanel = `<div class="hint" style="text-align:center;padding:40px 10px;">🔒 Répartition masquée pour ce profil<div class="mask-badge" style="margin-top:8px;">Réservé à la Direction / Fondation</div></div>`;

  // Solde par mode de paiement — cumulé depuis le début (pas filtré par
  // période, contrairement au reste de l'Aperçu), car un solde est un
  // stock accumulé (ex: combien de FCFA en espèces devraient être dans le
  // tiroir), pas un flux d'une période donnée.
  const soldesParMode = MODES_PAIEMENT.map(mode=>{
    const entrees = DB.paiementsScolarite.filter(p=>p.modePaiement===mode).reduce((s,p)=>s+p.montant,0)
      + DB.paiementsCotisations.filter(p=>p.modePaiement===mode).reduce((s,p)=>s+p.montant,0)
      + DB.ventesGadgets.filter(v=>v.modePaiement===mode).reduce((s,v)=>s+v.montantTotal,0);
    const sorties = DB.paiementsSalaires.filter(p=>p.modePaiement===mode).reduce((s,p)=>s+p.montant,0)
      + DB.depenses.filter(d=>d.modePaiement===mode).reduce((s,d)=>s+d.montant,0);
    return {mode, entrees, sorties, solde: entrees-sorties};
  });
  const soldesRows = soldesParMode.map(s=>`<tr>
    <td>${s.mode}</td>
    <td class="amount in">${fmtFCFA(s.entrees)}</td>
    <td class="amount out">${fmtFCFA(s.sorties)}</td>
    <td style="font-weight:700;color:${s.solde>=0?'var(--green)':'var(--red)'};">${fmtFCFA(s.solde)}</td>
  </tr>`).join('');

  return `
    <div class="section-note">💰 Vue financière consolidée : scolarité, activités extra-scolaires, boutique, salaires et charges. Toutes les données sont générées automatiquement à partir des paiements enregistrés dans les autres onglets.</div>
    ${secret ? `<div class="section-note" style="background:var(--amber-bg);color:var(--amber);">🔒 Les montants globaux (recettes, dépenses, résultat net et répartitions) sont masqués pour le profil Secrétariat. Vous pouvez toujours enregistrer les paiements et consulter le détail par élève.</div>` : ''}
    <div class="filters">
      <select onchange="ui.filters.comptaPeriode=this.value; renderView('comptabilite')">
        <option value="all" ${periode==='all'?'selected':''}>Toute la période</option>
        ${lastNMonths(6).map(m=>`<option value="${m}" ${periode===m?'selected':''}>${moisLabel(m)}</option>`).join('')}
      </select>
      ${secret ? '' : `<button class="btn secondary" onclick="exporterComptabiliteCSV()">⬇️ Exporter (CSV)</button>`}
    </div>
    <div class="cards">
      <div class="card"><div class="card-top"><div class="icon-badge" style="background:var(--green-bg);">📥</div></div>${secret ? maskNum : `<div class="num amount in">${fmtFCFA(totalRecettes)}</div>`}<div class="label">Recettes</div></div>
      <div class="card"><div class="card-top"><div class="icon-badge" style="background:var(--red-bg);">📤</div></div>${secret ? maskNum : `<div class="num amount out">${fmtFCFA(totalDepenses)}</div>`}<div class="label">Dépenses</div></div>
      <div class="card"><div class="card-top"><div class="icon-badge" style="background:${resultat>=0?'var(--green-bg)':'var(--red-bg)'};">${resultat>=0?'📈':'📉'}</div></div>${secret ? maskNum : `<div class="num" style="color:${resultat>=0?'var(--green)':'var(--red)'};">${fmtFCFA(resultat)}</div>`}<div class="label">Résultat net</div></div>
      <div class="card"><div class="card-top"><div class="icon-badge" style="background:var(--blue-bg);">🎓</div></div><div class="num">${tauxRecouvrement}%</div><div class="label">Taux de recouvrement scolarité</div></div>
      ${DB.meta.assujettiTva ? `<div class="card"><div class="card-top"><div class="icon-badge" style="background:var(--amber-bg);">🧾</div></div>${secret ? maskNum : `<div class="num" style="color:var(--amber);">${fmtFCFA(tvaCollectee)}</div>`}<div class="label">TVA collectée (aide de calcul)</div></div>` : ''}
    </div>
    <div class="grid-2">
      <div class="panel"><div class="panel-head"><div><h2>Recettes par source</h2></div></div>${secret ? maskPanel : recBars}</div>
      <div class="panel"><div class="panel-head"><div><h2>Dépenses par catégorie</h2></div></div>${secret ? maskPanel : depBars}</div>
    </div>
    <div class="grid-2">
      <div class="panel"><div class="panel-head"><div><h2>Élèves en impayé</h2><div class="sub">Solde de scolarité dû, tous trimestres confondus</div></div></div>${impayesHtml}</div>
      <div class="panel"><div class="panel-head"><div><h2>Dernières transactions</h2></div></div><div class="txn-list">${txnsHtml}</div></div>
    </div>
    <div class="panel">
      <div class="panel-head"><div><h2>Solde par mode de paiement</h2><div class="sub">Cumulé depuis le début — combien devrait théoriquement se trouver dans chaque caisse (espèces, compte bancaire, mobile money…)</div></div></div>
      ${secret ? maskPanel : `
      <div class="table-wrap"><table><thead><tr><th>Mode</th><th>Entrées</th><th>Sorties</th><th>Solde théorique</th></tr></thead><tbody>${soldesRows}</tbody></table></div>
      <div class="hint" style="margin-top:10px;">⚠️ Ceci est un calcul théorique basé sur ce qui a été saisi dans l'appli — ce n'est pas un rapprochement bancaire vérifié. Compare régulièrement avec le solde réel (tiroir-caisse, relevé bancaire) pour détecter un écart.</div>`}
    </div>`;
}

/* ---------------------------------------------------------------------
   12.1bis COMPARAISON ANNUELLE (ROADMAP COMPTABILITÉ — ÉTAPE 5)
   Déduit automatiquement l'année scolaire de chaque mouvement à partir de
   sa date (septembre à août, calendrier scolaire ivoirien) — aucune
   colonne supplémentaire nécessaire, ça marche même sur l'historique déjà
   enregistré. Purement en lecture, ne modifie ni ne verrouille rien.
   --------------------------------------------------------------------- */
function anneeScolaireDe(dateISO){
  if(!dateISO) return '—';
  const [y, m] = dateISO.split('-').map(Number);
  return m>=9 ? `${y}-${y+1}` : `${y-1}-${y}`;
}
function renderComptaAnnees(){
  const parAnnee = {};
  const ajouter = (annee, type, montant) => {
    if(!parAnnee[annee]) parAnnee[annee] = {recettes:0, depenses:0};
    parAnnee[annee][type] += montant;
  };
  DB.paiementsScolarite.forEach(p=>ajouter(anneeScolaireDe(p.date), 'recettes', p.montant));
  DB.paiementsCotisations.forEach(p=>ajouter(anneeScolaireDe(p.date), 'recettes', p.montant));
  DB.ventesGadgets.forEach(v=>ajouter(anneeScolaireDe(v.date), 'recettes', v.montantTotal));
  DB.paiementsSalaires.forEach(p=>ajouter(anneeScolaireDe(p.datePaiement), 'depenses', p.montant));
  DB.depenses.forEach(d=>ajouter(anneeScolaireDe(d.date), 'depenses', d.montant));

  const annees = Object.keys(parAnnee).sort().reverse();
  const rows = annees.map(a=>{
    const {recettes, depenses} = parAnnee[a];
    const resultat = recettes - depenses;
    const estAnneeCourante = a === DB.meta.anneeScolaire;
    return `<tr>
      <td>${a} ${estAnneeCourante ? '<span class="badge blue">Année en cours</span>' : ''}</td>
      <td class="amount in">${fmtFCFA(recettes)}</td>
      <td class="amount out">${fmtFCFA(depenses)}</td>
      <td style="font-weight:700;color:${resultat>=0?'var(--green)':'var(--red)'};">${fmtFCFA(resultat)}</td>
    </tr>`;
  }).join('');

  return `
    <div class="section-note">📅 Répartition automatique par année scolaire (septembre à août), déduite de la date de chaque mouvement — aucune configuration nécessaire, fonctionne aussi sur l'historique déjà saisi.</div>
    <div class="panel">
      <div class="panel-head"><div><h2>Comparaison par année scolaire</h2></div></div>
      ${annees.length===0 ? `<div class="empty-state"><div class="em-ic">📅</div>Aucun mouvement enregistré pour l'instant.</div>` : `
      <div class="table-wrap"><table><thead><tr><th>Année scolaire</th><th>Recettes</th><th>Dépenses</th><th>Résultat net</th></tr></thead><tbody>${rows}</tbody></table></div>`}
    </div>`;
}

/* ---------------------------------------------------------------------
   12.1ter BUDGET PRÉVISIONNEL (ROADMAP COMPTABILITÉ — ÉTAPE 6)
   Un montant "prévu" par catégorie et par mois (table budgets_comptables,
   voir schema.sql section 25), comparé au "réalisé" déjà calculable à
   partir des tables existantes — rien n'est dupliqué. Chargé à la demande
   comme le Journal d'audit.
   --------------------------------------------------------------------- */
const CATEGORIES_RECETTES_BUDGET = ['Scolarité','Activités extra-scolaires','Boutique scolaire'];
let __budgetsComptaCache = null;
let __budgetsComptaMoisCache = null;
async function chargerBudgetsCompta(mois){
  try{
    const { data, error } = await sb.from('budgets_comptables').select('*').eq('mois', mois);
    if(error) throw error;
    __budgetsComptaCache = data;
  }catch(e){
    __budgetsComptaCache = [];
  }
  __budgetsComptaMoisCache = mois;
  if(ui.currentView==='comptabilite' && ui.filters.comptaTab==='budget') renderView('comptabilite');
}
function realiseCategorieBudget(type, categorie, mois){
  const dansLeMois = iso => iso && iso.slice(0,7)===mois;
  if(type==='recette'){
    if(categorie==='Scolarité') return DB.paiementsScolarite.filter(p=>dansLeMois(p.date)).reduce((s,p)=>s+p.montant,0);
    if(categorie==='Activités extra-scolaires') return DB.paiementsCotisations.filter(p=>dansLeMois(p.date)).reduce((s,p)=>s+p.montant,0);
    if(categorie==='Boutique scolaire') return DB.ventesGadgets.filter(v=>dansLeMois(v.date)).reduce((s,v)=>s+v.montantTotal,0);
    return 0;
  }
  if(categorie==='Salaires') return DB.paiementsSalaires.filter(p=>dansLeMois(p.datePaiement)).reduce((s,p)=>s+p.montant,0);
  return DB.depenses.filter(d=>d.categorie===categorie && dansLeMois(d.date)).reduce((s,d)=>s+d.montant,0);
}
function renderComptaBudget(){
  const mois = ui.filters.comptaMois || thisMonthISO();
  ui.filters.comptaMois = mois;
  if(__budgetsComptaCache===null || __budgetsComptaMoisCache!==mois){
    chargerBudgetsCompta(mois);
    return `<div class="panel"><div class="hint" style="text-align:center;padding:40px 10px;">Chargement…</div></div>`;
  }
  const ligne = (type, categorie) => {
    const b = __budgetsComptaCache.find(x=>x.type===type && x.categorie===categorie);
    const prevu = b ? b.montant : 0;
    const realise = realiseCategorieBudget(type, categorie, mois);
    const ecart = realise - prevu;
    const bon = type==='recette' ? ecart>=0 : ecart<=0;
    return `<tr>
      <td>${categorie}</td>
      <td><input type="number" min="0" step="1000" value="${prevu}" onchange="handleSaveBudget('${type}','${categorie}','${mois}',this.value)" style="width:110px;"></td>
      <td>${fmtFCFA(realise)}</td>
      <td style="font-weight:700;color:${bon?'var(--green)':'var(--red)'};">${ecart>=0?'+':''}${fmtFCFA(ecart)}</td>
    </tr>`;
  };
  const rowsRecettes = CATEGORIES_RECETTES_BUDGET.map(c=>ligne('recette', c)).join('');
  const rowsDepenses = ['Salaires', ...CATEGORIES_DEPENSES].map(c=>ligne('depense', c)).join('');

  return `
    <div class="section-note">🎯 Fixe un montant prévu par catégorie pour le mois choisi — comparé automatiquement au réalisé. Modifie le champ "Prévu" : ça s'enregistre aussitôt.</div>
    <div class="filters">
      <select onchange="ui.filters.comptaMois=this.value; __budgetsComptaCache=null; renderView('comptabilite')">${lastNMonths(6).map(m=>`<option value="${m}" ${mois===m?'selected':''}>${moisLabel(m)}</option>`).join('')}</select>
    </div>
    <div class="panel">
      <div class="panel-head"><div><h2>Recettes — ${moisLabel(mois)}</h2></div></div>
      <div class="table-wrap"><table><thead><tr><th>Catégorie</th><th>Prévu</th><th>Réalisé</th><th>Écart</th></tr></thead><tbody>${rowsRecettes}</tbody></table></div>
    </div>
    <div class="panel">
      <div class="panel-head"><div><h2>Dépenses — ${moisLabel(mois)}</h2></div></div>
      <div class="table-wrap"><table><thead><tr><th>Catégorie</th><th>Prévu</th><th>Réalisé</th><th>Écart</th></tr></thead><tbody>${rowsDepenses}</tbody></table></div>
    </div>`;
}
async function handleSaveBudget(type, categorie, mois, valeurStr){
  const montant = Math.max(0, parseInt(valeurStr)||0);
  try{
    const existant = __budgetsComptaCache.find(x=>x.type===type && x.categorie===categorie);
    if(existant){
      await dbUpdate('budgets_comptables', existant.id, {montant});
      existant.montant = montant;
    } else {
      const rec = await dbInsert('budgets_comptables', {type, categorie, mois, montant});
      __budgetsComptaCache.push(rec);
    }
    toast('Budget enregistré');
  }catch(e){ alert('Erreur : ' + e.message); }
}

/* ---------------------------------------------------------------------
   12.1quater PLAN COMPTABLE SYSCOHADA (ROADMAP COMPTABILITÉ — ÉTAPE 7)
   IMPORTANT : les codes ci-dessous sont des PROPOSITIONS STANDARD, pas
   une validation professionnelle — chaque école doit les faire relire
   par un comptable OHADA avant tout usage officiel (déclaration, audit).
   Modifiables ici, sauvegardés dans comptes_syscohada (schema.sql §26).
   --------------------------------------------------------------------- */
const CODES_SYSCOHADA_DEFAUT = {
  'recette|Scolarité': {code:'706', libelle:'Services vendus (prestations d’enseignement)'},
  'recette|Activités extra-scolaires': {code:'707', libelle:'Produits accessoires'},
  'recette|Boutique scolaire': {code:'707', libelle:'Produits accessoires'},
  'depense|Salaires': {code:'661', libelle:'Rémunérations directes versées au personnel'},
  'depense|Loyer': {code:'6132', libelle:'Locations'},
  'depense|Entretien': {code:'624', libelle:'Entretien, réparations et maintenance'},
  'depense|Matériel pédagogique': {code:'604', libelle:'Achats stockés de matières et fournitures'},
  'depense|Fournitures scolaires': {code:'604', libelle:'Achats stockés de matières et fournitures'},
  'depense|Électricité & Eau': {code:'6051', libelle:'Fournitures non stockables (eau, électricité)'},
  'depense|Transport': {code:'614', libelle:'Transports du personnel'},
  'depense|Restauration': {code:'604', libelle:'Achats stockés de matières et fournitures'},
  'depense|Autre': {code:'628', libelle:'Divers — Autres charges externes'},
  'tresorerie|Espèces': {code:'571', libelle:'Caisse'},
  'tresorerie|Mobile Money': {code:'521', libelle:'Banques locales (simplifié)'},
  'tresorerie|Virement bancaire': {code:'521', libelle:'Banques locales'},
  'tresorerie|Chèque': {code:'521', libelle:'Banques locales'},
};
let __syscohadaCache = null;
async function chargerComptesSyscohada(){
  try{
    const { data, error } = await sb.from('comptes_syscohada').select('*');
    if(error) throw error;
    __syscohadaCache = data;
  }catch(e){
    __syscohadaCache = [];
  }
  if(ui.currentView==='comptabilite' && ui.filters.comptaTab==='syscohada') renderView('comptabilite');
}
function compteSyscohada(type, categorie){
  const trouve = (__syscohadaCache||[]).find(x=>x.type===type && x.categorie===categorie);
  if(trouve) return {code:trouve.code, libelle:trouve.libelle};
  return CODES_SYSCOHADA_DEFAUT[`${type}|${categorie}`] || {code:'', libelle:''};
}
function renderComptaSyscohada(){
  if(__syscohadaCache===null){
    chargerComptesSyscohada();
    return `<div class="panel"><div class="hint" style="text-align:center;padding:40px 10px;">Chargement…</div></div>`;
  }
  const ligne = (type, categorie) => {
    const c = compteSyscohada(type, categorie);
    return `<tr>
      <td>${categorie}</td>
      <td><input type="text" value="${escapeHtml(c.code)}" style="width:80px;" onchange="handleSaveSyscohada('${type}','${categorie}','code',this.value)"></td>
      <td><input type="text" value="${escapeHtml(c.libelle)}" style="width:100%;" onchange="handleSaveSyscohada('${type}','${categorie}','libelle',this.value)"></td>
    </tr>`;
  };
  const rowsRecettes = CATEGORIES_RECETTES_BUDGET.map(c=>ligne('recette', c)).join('');
  const rowsDepenses = ['Salaires', ...CATEGORIES_DEPENSES].map(c=>ligne('depense', c)).join('');
  const rowsTresorerie = MODES_PAIEMENT.map(m=>ligne('tresorerie', m)).join('');

  return `
    <div class="section-note" style="background:var(--amber-bg);color:var(--amber);">⚠️ Ces codes SYSCOHADA sont des propositions standard, PAS une validation professionnelle. Fais-les relire par un comptable OHADA avant tout usage officiel (déclaration, audit). Modifie librement les champs ci-dessous.</div>
    <div class="panel">
      <div class="panel-head"><div><h2>Comptes de produits (recettes) — classe 7</h2></div></div>
      <div class="table-wrap"><table><thead><tr><th>Catégorie</th><th>Compte</th><th>Intitulé</th></tr></thead><tbody>${rowsRecettes}</tbody></table></div>
    </div>
    <div class="panel">
      <div class="panel-head"><div><h2>Comptes de charges (dépenses) — classe 6</h2></div></div>
      <div class="table-wrap"><table><thead><tr><th>Catégorie</th><th>Compte</th><th>Intitulé</th></tr></thead><tbody>${rowsDepenses}</tbody></table></div>
    </div>
    <div class="panel">
      <div class="panel-head"><div><h2>Comptes de trésorerie — classe 5</h2><div class="sub">Par mode de paiement</div></div></div>
      <div class="table-wrap"><table><thead><tr><th>Mode</th><th>Compte</th><th>Intitulé</th></tr></thead><tbody>${rowsTresorerie}</tbody></table></div>
    </div>
    <div class="panel">
      <div class="panel-head"><div><h2>Export grand livre</h2><div class="sub">Écritures en partie double (Débit/Crédit), prêtes pour un logiciel comptable</div></div></div>
      <button class="btn" onclick="exporterGrandLivreSyscohadaCSV()">⬇️ Exporter le grand livre (CSV)</button>
    </div>`;
}
async function handleSaveSyscohada(type, categorie, champ, valeur){
  try{
    const existant = __syscohadaCache.find(x=>x.type===type && x.categorie===categorie);
    if(existant){
      await dbUpdate('comptes_syscohada', existant.id, {[champ]: valeur});
      existant[champ] = valeur;
    } else {
      const defaut = CODES_SYSCOHADA_DEFAUT[`${type}|${categorie}`] || {code:'', libelle:''};
      const patch = {type, categorie, code: defaut.code, libelle: defaut.libelle, [champ]: valeur};
      const rec = await dbInsert('comptes_syscohada', patch);
      __syscohadaCache.push(rec);
    }
    toast('Compte enregistré');
  }catch(e){ alert('Erreur : ' + e.message); }
}
function exporterGrandLivreSyscohadaCSV(){
  const ecritures = [];
  const ajouter = (date, type, categorie, tresorerie, libelle, montant) => {
    const compteMouvement = compteSyscohada(type, categorie);
    const compteTreso = compteSyscohada('tresorerie', tresorerie);
    if(type==='recette'){
      ecritures.push({date, compte:compteTreso.code, intitule:compteTreso.libelle, libelle, debit:montant, credit:0});
      if(DB.meta.assujettiTva && tvaApplicablePour(categorie) && DB.meta.tauxTva>0){
        const montantHT = Math.round(montant / (1 + DB.meta.tauxTva/100));
        const montantTva = montant - montantHT;
        ecritures.push({date, compte:compteMouvement.code, intitule:compteMouvement.libelle, libelle, debit:0, credit:montantHT});
        ecritures.push({date, compte:'4431', intitule:'État, TVA facturée', libelle, debit:0, credit:montantTva});
      } else {
        ecritures.push({date, compte:compteMouvement.code, intitule:compteMouvement.libelle, libelle, debit:0, credit:montant});
      }
    } else {
      ecritures.push({date, compte:compteMouvement.code, intitule:compteMouvement.libelle, libelle, debit:montant, credit:0});
      ecritures.push({date, compte:compteTreso.code, intitule:compteTreso.libelle, libelle, debit:0, credit:montant});
    }
  };
  DB.paiementsScolarite.forEach(p=>ajouter(p.date, 'recette', 'Scolarité', p.modePaiement, `Scolarité — ${p.tranche} — ${eleveFullName(eleveById(p.eleveId)||{prenom:'—',nom:''})}`, p.montant));
  DB.paiementsCotisations.forEach(p=>{
    const act = DB.activites.find(a=>a.id===p.activiteId);
    ajouter(p.date, 'recette', 'Activités extra-scolaires', p.modePaiement, `Cotisation ${act?act.nom:'—'} — ${eleveFullName(eleveById(p.eleveId)||{prenom:'—',nom:''})}`, p.montant);
  });
  DB.ventesGadgets.forEach(v=>{
    const g = DB.gadgets.find(x=>x.id===v.gadgetId);
    ajouter(v.date, 'recette', 'Boutique scolaire', v.modePaiement, `Vente ${g?g.nom:'—'} ×${v.quantite}`, v.montantTotal);
  });
  DB.paiementsSalaires.forEach(p=>ajouter(p.datePaiement, 'depense', 'Salaires', p.modePaiement, `Salaire — ${personnelNomById(p.personnelId,p.personnelType)} — ${moisLabel(p.mois)}`, p.montant));
  DB.depenses.forEach(d=>ajouter(d.date, 'depense', d.categorie, d.modePaiement, d.libelle, d.montant));
  ecritures.sort((a,b)=>a.date.localeCompare(b.date));

  const echapperCSV = v => {
    const s = String(v==null?'':v);
    return /[",;\n]/.test(s) ? '"' + s.replace(/"/g,'""') + '"' : s;
  };
  const entetes = ['Date','Compte','Intitulé du compte','Libellé','Débit (FCFA)','Crédit (FCFA)'];
  const corps = ecritures.map(l=>[l.date,l.compte,l.intitule,l.libelle,l.debit||'',l.credit||''].map(echapperCSV).join(';'));
  const csv = '﻿' + [entetes.join(';'), ...corps].join('\r\n');
  const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `ecomaz-grand-livre-syscohada-${todayISO()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  toast(`Export démarré — ${ecritures.length} lignes d'écriture (à faire valider par un comptable)`);
}

/* ---------------------------------------------------------------------
   12.1quinquies RAPPROCHEMENT BANCAIRE (ROADMAP COMPTABILITÉ — ÉTAPE 8)
   Compare les mouvements enregistrés dans l'appli (pour un mode de
   paiement et un mois donnés) à un relevé collé manuellement — aucune
   donnée n'est envoyée nulle part, tout reste dans le navigateur, rien
   n'est sauvegardé. Appariement simple : même montant, écart de date
   ≤ 5 jours (délai de traitement bancaire habituel).
   --------------------------------------------------------------------- */
function joursEntre(dateA, dateB){
  return Math.round((new Date(dateB) - new Date(dateA)) / 86400000);
}
function normaliserDateReleve(s){
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if(m) return `${m[3]}-${pad(+m[2])}-${pad(+m[1])}`;
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if(m) return `${m[1]}-${pad(+m[2])}-${pad(+m[3])}`;
  return null;
}
function parseLignesReleve(texte){
  return texte.split('\n').map(l=>l.trim()).filter(Boolean).map(ligne=>{
    const parts = ligne.split(/[;\t]+|,(?=\s*[\d"])/).map(p=>p.trim()).filter(p=>p!=='');
    if(parts.length<3) return null;
    const [dateRaw, libelle, montantRaw] = parts;
    const date = normaliserDateReleve(dateRaw);
    const montant = Math.round(Math.abs(parseFloat(String(montantRaw).replace(/[^\d.,-]/g,'').replace(',', '.'))) || 0);
    if(!date || !montant) return null;
    return {date, libelle, montant};
  }).filter(Boolean);
}
function renderComptaRapprochement(){
  const mois = ui.filters.comptaMois || thisMonthISO();
  ui.filters.comptaMois = mois;
  const mode = ui.filters.rapprochementMode || 'Virement bancaire';
  ui.filters.rapprochementMode = mode;
  const texte = ui.filters.rapprochementTexte || '';

  const dansLeMois = iso => iso && iso.slice(0,7)===mois;
  const mouvementsApp = [];
  DB.paiementsScolarite.filter(p=>p.modePaiement===mode && dansLeMois(p.date)).forEach(p=>mouvementsApp.push({date:p.date, libelle:`Scolarité — ${p.tranche}`, montant:p.montant}));
  DB.paiementsCotisations.filter(p=>p.modePaiement===mode && dansLeMois(p.date)).forEach(p=>mouvementsApp.push({date:p.date, libelle:'Cotisation activité', montant:p.montant}));
  DB.ventesGadgets.filter(v=>v.modePaiement===mode && dansLeMois(v.date)).forEach(v=>mouvementsApp.push({date:v.date, libelle:'Vente boutique', montant:v.montantTotal}));
  DB.paiementsSalaires.filter(p=>p.modePaiement===mode && dansLeMois(p.datePaiement)).forEach(p=>mouvementsApp.push({date:p.datePaiement, libelle:`Salaire — ${personnelNomById(p.personnelId,p.personnelType)}`, montant:p.montant}));
  DB.depenses.filter(d=>d.modePaiement===mode && dansLeMois(d.date)).forEach(d=>mouvementsApp.push({date:d.date, libelle:d.libelle, montant:d.montant}));

  const ligneReleve = parseLignesReleve(texte);
  const appDispo = mouvementsApp.map(m=>({...m, matched:false}));
  const releveDispo = ligneReleve.map(l=>({...l, matched:false}));
  const correspondances = [];
  releveDispo.forEach(rl=>{
    const candidat = appDispo.find(am=>!am.matched && am.montant===rl.montant && Math.abs(joursEntre(am.date, rl.date))<=5);
    if(candidat){ candidat.matched=true; rl.matched=true; correspondances.push({app:candidat, releve:rl}); }
  });
  const appNonTrouves = appDispo.filter(m=>!m.matched);
  const releveNonTrouves = releveDispo.filter(l=>!l.matched);

  const ligneCorrespondance = c => `<tr>
    <td>${fmtDate(c.app.date)}</td><td>${escapeHtml(c.app.libelle)}</td><td class="amount in">${fmtFCFA(c.app.montant)}</td>
    <td>${fmtDate(c.releve.date)}</td><td>${escapeHtml(c.releve.libelle)}</td>
  </tr>`;
  const ligneAppSeule = m => `<tr><td>${fmtDate(m.date)}</td><td>${escapeHtml(m.libelle)}</td><td class="amount out">${fmtFCFA(m.montant)}</td></tr>`;
  const ligneReleveSeule = l => `<tr><td>${fmtDate(l.date)}</td><td>${escapeHtml(l.libelle)}</td><td class="amount out">${fmtFCFA(l.montant)}</td></tr>`;

  return `
    <div class="section-note">🏦 Compare les mouvements enregistrés dans l'appli à un relevé bancaire que tu colles ci-dessous — rien n'est envoyé ni sauvegardé, tout reste dans ton navigateur le temps de la vérification.</div>
    <div class="panel">
      <div class="panel-head"><div><h2>1. Choisir la période et le mode</h2></div></div>
      <div class="filters">
        <select onchange="ui.filters.comptaMois=this.value; renderView('comptabilite')">${lastNMonths(6).map(m=>`<option value="${m}" ${mois===m?'selected':''}>${moisLabel(m)}</option>`).join('')}</select>
        <select onchange="ui.filters.rapprochementMode=this.value; renderView('comptabilite')">${MODES_PAIEMENT.filter(m=>m!=='Espèces').map(m=>`<option ${mode===m?'selected':''}>${m}</option>`).join('')}</select>
      </div>
    </div>
    <div class="panel">
      <div class="panel-head"><div><h2>2. Coller le relevé</h2><div class="sub">Une ligne par mouvement : Date;Libellé;Montant — ex : 15/09/2026;Virement Kouassi;25000</div></div></div>
      <textarea id="texteReleve" rows="6" style="width:100%;font-family:monospace;font-size:var(--fs-xs);" placeholder="15/09/2026;Virement reçu — Kouassi;25000
18/09/2026;Virement salaire — Aya Kouadio;60000">${escapeHtml(texte)}</textarea>
      <div class="form-actions" style="justify-content:flex-start;border-top:none;padding-top:10px;">
        <button class="btn" onclick="handleComparerReleve()">🔍 Comparer</button>
      </div>
    </div>
    ${texte ? `
    <div class="cards">
      <div class="card"><div class="num" style="color:var(--green);">${correspondances.length}</div><div class="label">Correspondances trouvées</div></div>
      <div class="card"><div class="num" style="color:var(--red);">${appNonTrouves.length}</div><div class="label">Dans l'appli, absent du relevé</div></div>
      <div class="card"><div class="num" style="color:var(--red);">${releveNonTrouves.length}</div><div class="label">Au relevé, absent de l'appli</div></div>
    </div>
    <div class="panel">
      <div class="panel-head"><div><h2>✅ Correspondances</h2></div></div>
      ${correspondances.length===0 ? `<div class="hint">Aucune correspondance trouvée.</div>` : `
      <div class="table-wrap"><table><thead><tr><th colspan="3">Dans l'appli</th><th colspan="2">Au relevé</th></tr></thead><tbody>${correspondances.map(ligneCorrespondance).join('')}</tbody></table></div>`}
    </div>
    <div class="panel">
      <div class="panel-head"><div><h2>⚠️ Dans l'appli, mais pas dans le relevé</h2><div class="sub">Peut être normal (délai bancaire) ou signaler une erreur de saisie</div></div></div>
      ${appNonTrouves.length===0 ? `<div class="hint">Aucun écart — bravo ! 🎉</div>` : `
      <div class="table-wrap"><table><thead><tr><th>Date</th><th>Libellé</th><th>Montant</th></tr></thead><tbody>${appNonTrouves.map(ligneAppSeule).join('')}</tbody></table></div>`}
    </div>
    <div class="panel">
      <div class="panel-head"><div><h2>⚠️ Au relevé, mais pas dans l'appli</h2><div class="sub">Un mouvement bancaire jamais enregistré dans EcoMaZ — à vérifier</div></div></div>
      ${releveNonTrouves.length===0 ? `<div class="hint">Aucun écart — bravo ! 🎉</div>` : `
      <div class="table-wrap"><table><thead><tr><th>Date</th><th>Libellé</th><th>Montant</th></tr></thead><tbody>${releveNonTrouves.map(ligneReleveSeule).join('')}</tbody></table></div>`}
    </div>` : ''}`;
}
function handleComparerReleve(){
  ui.filters.rapprochementTexte = document.getElementById('texteReleve').value;
  renderView('comptabilite');
}

/* --- 12.2 Scolarité --- */
/* ---------- Refonte : carte de paiement d'un élève (DESIGN.md §11, affichage seulement) ---------- */
function etatScolarite(e, info){
  if(!info.reste) return 'solde';
  const auj = todayISO();
  const ech = echeancesDeClasse(e.classeId);
  return info.detail.some(d => d.statut !== 'paye' && (ech.find(x => x.label === d.label)?.dateEcheance || '9999') < auj) ? 'retard' : 'reste';
}
function carteScolarite(e, info){
  const auj = todayISO(), ech = echeancesDeClasse(e.classeId);
  const pct = info.total ? Math.min(100, Math.round(100 * info.totalPaye / info.total)) : 0;
  const datePaiement = label => (DB.paiementsScolarite || []).filter(p => p.eleveId === e.id && p.tranche === label).map(p => p.date).sort().pop();
  const court = iso => iso ? new Date(iso + 'T12:00:00').toLocaleDateString('fr-FR', { day:'numeric', month:'short' }) : '';
  const lignes = info.detail.map(d => {
    const limite = ech.find(x => x.label === d.label)?.dateEcheance || null;
    const enRetard = d.statut !== 'paye' && limite && limite < auj;
    const badge = d.statut === 'paye' ? `<span class="badge-etat ok">${icone('check')}Payé</span>`
      : enRetard ? `<span class="badge-etat erreur">${icone('triangle-alert')}En retard</span>`
      : `<span class="badge-etat attente">${icone('clock')}À payer</span>`;
    const sous = d.statut === 'paye' ? `Payé le ${court(datePaiement(d.label))}`
      : d.statut === 'partiel' ? `Reste ${fmtFCFA(d.montant - d.paye)}${limite ? ' · avant le ' + court(limite) : ''}`
      : limite ? `Avant le ${court(limite)}` : '';
    return `<li class="sc-ligne">
      <span class="sc-lib"><span>${escapeHtml(d.label)}</span>${sous ? `<small>${sous}</small>` : ''}</span>
      <span class="sc-mt">${fmtFCFA(d.montant)}</span>
      <span class="sc-etat">${badge}${d.statut !== 'paye' ? `<button type="button" class="btn sm" onclick="openPaiementScolariteForm('${e.id}',${jsArg(d.label)})">Encaisser</button>` : ''}</span>
    </li>`;
  }).join('');
  return `<article class="scol-carte" data-nom="${escapeHtml(eleveFullName(e).toLowerCase())}" data-etat="${etatScolarite(e, info)}">
    <header class="sc-tete">
      <span class="lc-avatar" aria-hidden="true">${escapeHtml(initials(e.prenom, e.nom))}</span>
      <span class="sc-id"><strong>${escapeHtml(eleveFullName(e))}</strong><small>${escapeHtml(classeName(e.classeId))}</small></span>
      <span class="sc-reste ${info.reste ? 'du' : 'ok'}"><small>${info.reste ? 'Reste à payer' : 'Soldé'}</small><strong>${info.reste ? fmtFCFA(info.reste) : icone('circle-check')}</strong></span>
    </header>
    <div class="sc-progression"><div class="sc-piste"><div style="width:${pct}%"></div></div><span>${fmtFCFA(info.totalPaye)} / ${fmtFCFA(info.total)}</span></div>
    <ul class="sc-echeances">${lignes}</ul>
    <footer class="sc-pied">
      <span class="sc-actions"><button type="button" class="btn secondary sm" onclick="voirHistoriqueScolarite('${e.id}')">Reçu</button>${info.reste ? `<button type="button" class="btn secondary sm" onclick="genererLienPaiement('${e.id}', null, ${info.reste})">Lien de paiement</button>` : ''}</span>
      <span class="sc-totaux"><span>Total <strong>${fmtFCFA(info.total)}</strong></span><span>Reste <strong class="${info.reste ? 'du' : 'ok'}">${fmtFCFA(info.reste)}</strong></span></span>
    </footer>
  </article>`;
}
// Recherche + filtres sans recharger l'écran (le champ garde le focus)
function filtrerScolarite(){
  const etat = ui.filters.scolEtat || 'tous';
  const texte = simplifierTexte(document.querySelector('.scol-recherche')?.value || '');
  let visibles = 0;
  document.querySelectorAll('.scol-carte, .scol-table tbody tr').forEach(el => {
    const ok = (etat === 'tous' || el.dataset.etat === etat || (etat === 'reste' && el.dataset.etat === 'retard')) && (!texte || simplifierTexte(el.dataset.nom || '').includes(texte));
    el.hidden = !ok;
    if(ok && el.classList.contains('scol-carte')) visibles++;
  });
  document.querySelectorAll('.segmente .seg').forEach(b => b.classList.toggle('actif', b.dataset.etat === etat));
  const vide = document.querySelector('.scol-aucun'); if(vide) vide.hidden = visibles > 0 || !document.querySelector('.scol-carte');
}
function renderComptaScolarite(){
  if(DB.classes.length === 0){
    return `<div class="panel"><div class="empty-state"><div class="em-ic">🎓</div>Aucune classe configurée pour le moment. Activez au moins un niveau scolaire dans <strong>Paramètres</strong> pour commencer à suivre la scolarité.</div></div>`;
  }
  const classeId = ui.filters.comptaClasse || DB.classes[0].id;
  ui.filters.comptaClasse = classeId;
  const eleves = DB.eleves.filter(e=>e.classeId===classeId && e.statut==='Actif').sort((a,b)=>a.nom.localeCompare(b.nom));
  const echeances = echeancesDeClasse(classeId);
  const grilleActive = echeances.length > 0;

  const du = duAnnuelClasse(classeId);
  let totalDu=0, totalPaye=0;
  const cartesScol = [];

  const rows = eleves.map(e=>{
    if(grilleActive){
      const info = scolariteEleveParEcheance(e.id);
      totalDu += info.total; totalPaye += info.totalPaye;
      const cellules = info.detail.map(d=>{
        const cls = d.statut==='paye' ? 'green' : d.statut==='partiel' ? 'amber' : 'red';
        const contenu = d.statut==='paye'
          ? `<span class="badge ${cls}">✓ ${fmtFCFA(d.paye)}</span>`
          : d.statut==='partiel'
            ? `<span class="badge ${cls}" style="cursor:pointer;" onclick="openPaiementScolariteForm('${e.id}',${jsArg(d.label)})">${fmtFCFA(d.paye)} / ${fmtFCFA(d.montant)}</span>`
            : `<button class="btn secondary sm" onclick="openPaiementScolariteForm('${e.id}',${jsArg(d.label)})">Encaisser</button>`;
        return `<td style="text-align:center;">${contenu}</td>`;
      }).join('');
      cartesScol.push(carteScolarite(e, info));
      return `<tr data-nom="${escapeHtml(eleveFullName(e).toLowerCase())}" data-etat="${etatScolarite(e, info)}">
        <td><div class="row-name"><span class="avatar">${initials(e.prenom,e.nom)}</span>${escapeHtml(eleveFullName(e))}</div></td>
        ${cellules}
        <td class="amount" style="font-weight:800;">${fmtFCFA(info.total)}</td>
        <td class="amount ${info.reste>0?'out':''}" style="font-weight:800;">${fmtFCFA(info.reste)}</td>
        <td style="white-space:nowrap;">
          <button class="btn secondary sm" onclick="voirHistoriqueScolarite('${e.id}')">Reçu</button>
          ${info.reste>0 ? `<button class="btn secondary sm" title="Lien de paiement pour le parent" aria-label="Lien de paiement" onclick="genererLienPaiement('${e.id}', null, ${info.reste})">Lien</button>` : ''}
        </td>
      </tr>`;
    }
    const info = scolariteEleveInfo(e.id);
    totalDu += info.du; totalPaye += info.paye;
    const bc = info.statut==='Soldé'?'green':info.statut==='Partiel'?'amber':'red';
    return `<tr>
      <td><div class="row-name"><span class="avatar">${initials(e.prenom,e.nom)}</span>${escapeHtml(eleveFullName(e))}</div></td>
      <td>${fmtFCFA(info.du)}</td>
      <td class="amount in">${fmtFCFA(info.paye)}</td>
      <td class="amount ${info.solde>0?'out':''}">${fmtFCFA(info.solde)}</td>
      <td><span class="badge ${bc}">${info.statut}</span></td>
      <td style="white-space:nowrap;">
        <button class="btn sm" onclick="openPaiementScolariteForm('${e.id}')">+ Paiement</button>
        <button class="icon-btn" title="Historique" onclick="voirHistoriqueScolarite('${e.id}')">🧾</button>
      </td>
    </tr>`;
  }).join('');
  const tauxClasse = totalDu ? Math.round(100*totalPaye/totalDu) : 0;

  const theadHtml = grilleActive
    ? `<tr><th>Élève</th>${echeances.map(ech=>`<th style="text-align:center;">${escapeHtml(ech.label)}<div class="hint" style="font-weight:400;">${fmtFCFA(ech.montant)}</div></th>`).join('')}<th>TOTAL</th><th>RESTE</th><th>Actions</th></tr>`
    : `<tr><th>Élève</th><th>Dû (annuel)</th><th>Payé</th><th>Solde</th><th>Statut</th><th>Actions</th></tr>`;

  return `
    <div class="form-actions no-print" style="justify-content:flex-end;margin:0 0 8px;"><button type="button" class="btn secondary sm" onclick="ouvrirSouchesRecus()">${icone('receipt')} Souches des reçus</button></div>
    ${renderEcheancierAVerifier()}
    <div class="panel">
      <div class="panel-head">
        <div><h2>État de la scolarité par classe</h2><div class="sub">${grilleActive ? `Recouvré : ${tauxClasse}% (${fmtFCFA(totalPaye)} / ${fmtFCFA(totalDu)})` : `Frais annuel : ${fmtFCFA(du)} · Recouvré : ${tauxClasse}% (${fmtFCFA(totalPaye)} / ${fmtFCFA(totalDu)})`}</div></div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;">
          <select onchange="ui.filters.comptaClasse=this.value; renderView('comptabilite')">
            ${DB.classes.map(c=>`<option value="${c.id}" ${classeId===c.id?'selected':''}>${escapeHtml(c.nom)}</option>`).join('')}
          </select>
          ${['direction','fondation'].includes(ui.role) ? `<button class="btn secondary" onclick="go('parametres')" title="Gérer les échéances (Frais d'inscription, versements...) depuis Paramètres">🎓 Échéances</button>` : ''}
          ${grilleActive && eleves.length ? `<button class="btn" onclick="ouvrirRepriseVersements('${classeId}')">📥 Saisir les versements déjà reçus</button>` : ''}
          ${grilleActive ? `<button class="btn secondary" onclick="ouvrirRelanceImpayes('${classeId}')">📲 Relancer les retards</button>` : ''}
          <button class="btn secondary" onclick="exporterScolariteExcel()">⬇️ Excel (toutes les classes)</button>
          ${grilleActive ? '' : `<button class="btn secondary" onclick="openFraisScolariteForm()">⚙️ Configurer les frais</button>`}
        </div>
      </div>
      <div class="progress" style="margin-bottom:16px;"><div style="width:${tauxClasse}%;background:${tauxClasse>=80?'var(--green)':tauxClasse>=50?'var(--amber)':'var(--red)'};"></div></div>
      ${eleves.length===0 ? `<div class="empty-state"><div class="em-ic">🎓</div>Aucun élève actif dans cette classe.</div>` : grilleActive ? `
      <div class="scol-outils">
        <input type="search" class="scol-recherche" placeholder="Rechercher un élève" aria-label="Rechercher un élève" oninput="filtrerScolarite()">
        <div class="segmente" role="group" aria-label="Filtrer les élèves">${[['tous','Tous'],['solde','Soldés'],['reste','Avec reste'],['retard','En retard']].map(([k, l]) => `<button type="button" class="seg${(ui.filters.scolEtat || 'tous') === k ? ' actif' : ''}" data-etat="${k}" onclick="ui.filters.scolEtat='${k}'; filtrerScolarite()">${l}</button>`).join('')}</div>
      </div>
      <div class="scol-cartes seulement-mobile">${cartesScol.join('')}</div>
      <div class="table-wrap seulement-ordi"><table class="scol-table">
        <thead>${theadHtml}</thead>
        <tbody>${rows}</tbody>
      </table></div>
      <div class="etat-vide scol-aucun" hidden><span class="etat-vide-ic" aria-hidden="true">${icone('search')}</span><span>Aucun élève pour ce filtre. <button type="button" class="lien-discret" onclick="ui.filters.scolEtat='tous'; const r=document.querySelector('.scol-recherche'); if(r) r.value=''; filtrerScolarite()">Effacer les filtres</button></span></div>
      ${(setTimeout(filtrerScolarite, 0), '')}` : `
      <div class="table-wrap"><table>
        <thead>${theadHtml}</thead>
        <tbody>${rows}</tbody>
      </table></div>`}
    </div>`;
}

/* ---------- Saisie groupée des versements déjà reçus (une classe, toutes les tranches) ---------- */
function ouvrirRepriseVersements(classeId){
  const c = DB.classes.find(x => x.id === classeId); if(!c) return;
  const eleves = DB.eleves.filter(e => e.classeId === classeId && e.statut === 'Actif')
    .sort((a, b) => (a.nom || '').localeCompare(b.nom || '') || (a.prenom || '').localeCompare(b.prenom || ''));
  const blocs = eleves.map(e => {
    const g = scolariteEleveParEcheance(e.id);
    const ouvertes = g.detail.filter(d => d.montant > d.paye);
    if(!ouvertes.length) return `<div class="rv-eleve rv-solde"><strong>${escapeHtml(eleveFullName(e))}</strong><span class="badge-etat ok">Soldé</span></div>`;
    return `<div class="rv-eleve"><strong>${escapeHtml(eleveFullName(e))}</strong>
      <div class="rv-echs">${ouvertes.map(d => { const reste = d.montant - d.paye; return `<div class="rv-ech">
        <span class="rv-lib">${escapeHtml(d.label)}<small>reste ${fmtFCFA(reste)}</small></span>
        <input type="number" inputmode="numeric" class="rv-montant" min="0" step="500" max="${reste}" placeholder="0" aria-label="${escapeHtml(eleveFullName(e) + ' — ' + d.label)}"
          data-eleve="${e.id}" data-tranche="${escapeHtml(d.label)}" data-reste="${reste}" oninput="totalReprise()">
        <button type="button" class="btn secondary sm" onclick="const i=this.previousElementSibling; i.value = i.value == ${reste} ? '' : ${reste}; totalReprise()">Payée</button>
      </div>`; }).join('')}</div></div>`;
  }).join('');
  openModal(`Versements déjà reçus — ${c.nom}`, `
    <p class="hint" style="margin-top:0;">Pour reprendre ce que les parents ont <strong>déjà payé</strong> (cahier, reçus papier). Touchez « Payée » si la tranche est réglée en entier, ou écrivez le montant versé. Laissez vide si rien n’a été payé.</p>
    ${boutonRemplissageReprise(classeId)}
    <div class="form-grid">
      <div class="field"><label for="rvDate">Date des versements</label><input type="date" id="rvDate" value="${todayISO()}" max="${todayISO()}"></div>
      <div class="field"><label for="rvMode">Mode de paiement</label><select id="rvMode">${MODES_PAIEMENT.map(m => `<option>${m}</option>`).join('')}</select></div>
    </div>
    ${(() => { const ordre = echeancesDeClasse(classeId).map(x => x.label); const libs = [...new Set(eleves.flatMap(e => scolariteEleveParEcheance(e.id).detail.filter(d => d.montant > d.paye).map(d => d.label)))].sort((x, y) => ordre.indexOf(x) - ordre.indexOf(y));
      return libs.length && eleves.length > 1 ? `<div class="rv-groupe"><span class="hint" style="margin:0;">Gagnez du temps : si presque toute la classe a payé une tranche, touchez-la, puis corrigez seulement les exceptions.</span>
        <div class="dv-puces">${libs.map(l => `<button type="button" class="dv-puce" data-tranche="${escapeHtml(l)}" onclick="repriseToutLaClasse(this)">Toute la classe a payé : ${escapeHtml(l)}</button>`).join('')}</div></div>` : ''; })()}
    <div class="rv-liste">${blocs}</div>
    <div class="rv-pied"><span id="rvTotal">Rien de saisi pour le moment</span>
      <span style="display:flex;gap:8px;"><button type="button" class="btn secondary" onclick="closeModal()">Annuler</button>
      <button type="button" class="btn" id="rvBouton" onclick="enregistrerReprise('${classeId}')" disabled>Enregistrer</button></span></div>`);
}
/* ---------- Versements déjà reçus : remplissage intelligent depuis le cahier de caisse de la classe ----------
   Un champ par élève qui doit encore quelque chose : « total déjà versé ». Le total lu est réparti sur ses
   tranches dans l'ordre de l'échéancier (inscription d'abord), sans jamais dépasser le reste de chaque tranche.
   Un montant qui dépasse ce qui est dû n'est pas appliqué : il est signalé. Rien n'est enregistré sans vous. */
function schemaReprise(classeId){
  return DB.eleves.filter(e => e.classeId === classeId && e.statut === 'Actif')
    .filter(e => scolariteEleveParEcheance(e.id).detail.some(d => d.montant > d.paye))
    .sort((a, b) => (a.nom || '').localeCompare(b.nom || '') || (a.prenom || '').localeCompare(b.prenom || ''))
    .slice(0, 60)
    .map(e => ({ name: 'total_' + e.id, label: `Total déjà versé (inscription et scolarité) par l’élève ${String(e.nom || '').toUpperCase()} ${e.prenom || ''}${e.matricule ? ' (' + e.matricule + ')' : ''} — seulement si son nom figure dans le document`, type: 'number', format: 'nombre entier en francs CFA' }));
}
function boutonRemplissageReprise(classeId){
  if(!['secretariat', 'direction', 'fondation'].includes(ui.role) || !schemaReprise(classeId).length) return '';
  return `<div class="choix-remplissage" role="group" aria-label="Comment remplir cette grille" onclick="if(this.classList.contains('cr-replie')) this.classList.remove('cr-replie')">
    <span class="cr-question">Comment voulez-vous remplir ?</span>
    <div class="cr-modes">
      <button type="button" class="cr-mode cr-intelligent btn-sf" onclick="ouvrirRemplissageIntelligent('reprise-versements', schemaReprise('${classeId}'), (r) => appliquerReprise(r))">
        <span class="cr-ic">${icone('sparkles') || '✨'}</span><strong>Remplissage intelligent</strong><small>Photo du cahier de caisse ou de la liste des paiements de la classe (ou fichier Excel, PDF) : le total de chaque élève est réparti sur ses tranches.</small></button>
      <button type="button" class="cr-mode cr-manuel" onclick="this.closest('.choix-remplissage').classList.add('cr-replie'); document.querySelector('.rv-montant')?.focus()">
        <span class="cr-ic">${icone('pencil') || '✍️'}</span><strong>Remplissage manuel</strong><small>Vous tapez les montants, ou « Payée », élève par élève.</small></button>
    </div>
  </div>`;
}
function appliquerReprise(resultat){
  let eleves = 0, aVerifier = 0; const trop = [];
  const tous = [...document.querySelectorAll('.rv-montant')];
  Object.keys(resultat || {}).forEach(cle => {
    const { valeur, confiance } = resultat[cle] || {}; const total = Math.round(Number(valeur) || 0);
    if(!cle.startsWith('total_') || total <= 0) return;
    const id = cle.slice(6), champs = tous.filter(i => i.dataset.eleve === id);
    if(!champs.length) return;
    const du = champs.reduce((t, i) => t + Number(i.dataset.reste), 0);
    if(total > du){ const e = eleveById(id); trop.push(`${e ? eleveFullName(e) : 'Un élève'} : ${fmtFCFA(total)} lu, ${fmtFCFA(du)} restant dû`); return; }
    let reste = total;
    champs.forEach(i => {
      const m = Math.min(reste, Number(i.dataset.reste)); reste -= m;
      i.value = m > 0 ? m : '';
      i.classList.remove('champ-pre-rempli', 'champ-a-verifier');
      if(m > 0){ i.classList.add('champ-pre-rempli'); if(confiance !== 'élevé') i.classList.add('champ-a-verifier'); }
      i.addEventListener('input', () => i.classList.remove('champ-pre-rempli', 'champ-a-verifier'), { once: true });
    });
    eleves++; if(confiance !== 'élevé') aVerifier++;
  });
  totalReprise();
  const bloc = document.querySelector('.choix-remplissage'); if(bloc) bloc.classList.add('cr-replie');
  if(trop.length) alert(`Non appliqué — montant lu supérieur à ce qui reste dû (vérifiez le document ou l’échéancier) :\n\n${trop.join('\n')}`);
  toast(eleves ? `${eleves} élève(s) pré-rempli(s)${aVerifier ? `, dont ${aVerifier} à vérifier (en orange)` : ''} — relisez la date, le mode, puis « Enregistrer »` : 'Aucun montant d’élève de cette classe n’a été trouvé dans le document');
}
// Remplit (ou vide, si c'est déjà fait) la tranche choisie pour tous les élèves de la classe
function repriseToutLaClasse(btn){
  const champs = [...document.querySelectorAll('.rv-montant')].filter(i => i.dataset.tranche === btn.dataset.tranche);
  const toutRempli = champs.length && champs.every(i => Number(i.value) === Number(i.dataset.reste));
  champs.forEach(i => { i.value = toutRempli ? '' : i.dataset.reste; });
  btn.classList.toggle('actif', !toutRempli);
  totalReprise();
  toast(toutRempli ? `« ${btn.dataset.tranche} » vidée pour toute la classe` : `« ${btn.dataset.tranche} » remplie pour ${champs.length} élève(s) : corrigez les exceptions puis enregistrez`);
}
function lignesReprise(){
  return $$('.rv-montant').map(i => ({ i, montant: Math.round(Number(i.value) || 0), reste: Number(i.dataset.reste) })).filter(x => x.montant > 0);
}
function totalReprise(){
  const l = lignesReprise(), total = l.reduce((t, x) => t + x.montant, 0);
  const trop = l.filter(x => x.montant > x.reste);
  $$('.rv-montant').forEach(i => i.classList.toggle('rv-trop', (Number(i.value) || 0) > Number(i.dataset.reste)));
  const z = $('#rvTotal'), b = $('#rvBouton');
  if(z) z.innerHTML = trop.length ? `<span style="color:var(--danger, #B5492F);">${trop.length} montant(s) plus grand(s) que le reste dû</span>`
    : l.length ? `<strong>${l.length}</strong> versement${l.length > 1 ? 's' : ''} · total <strong>${fmtFCFA(total)}</strong>` : 'Rien de saisi pour le moment';
  if(b){ b.disabled = !l.length || trop.length > 0; b.textContent = l.length ? `Enregistrer ${l.length} versement${l.length > 1 ? 's' : ''}` : 'Enregistrer'; }
}
async function enregistrerReprise(classeId){
  const l = lignesReprise();
  if(!l.length || l.some(x => x.montant > x.reste)) return;
  const date = $('#rvDate').value || todayISO(), mode = $('#rvMode').value;
  if(date > todayISO()){ toast('La date ne peut pas être dans le futur.'); return; }
  const total = l.reduce((t, x) => t + x.montant, 0);
  if(!confirm(`Enregistrer ${l.length} versement(s) pour un total de ${fmtFCFA(total)} ?`)) return;
  const b = $('#rvBouton'); if(b) b.disabled = true;
  try{
    const ajoutes = await dbInsertMany('paiements_scolarite', l.map(x => ({ eleveId: x.i.dataset.eleve, montant: x.montant, tranche: x.i.dataset.tranche, date, modePaiement: mode })));
    DB.paiementsScolarite.push(...ajoutes);
  }catch(e){ if(b) b.disabled = false; alert('Erreur : ' + (e.message || e)); return; }
  closeModal();
  toast(`${l.length} versement${l.length > 1 ? 's' : ''} enregistré${l.length > 1 ? 's' : ''} ✅ (${fmtFCFA(total)})`);
  renderView('comptabilite');
}
/* ---------- Relance des retards de scolarité par WhatsApp, famille par famille ---------- */
// Tranches échues (date dépassée) et non soldées d'un élève
function retardsEleve(e){
  const auj = todayISO();
  const paye = {};
  (DB.paiementsScolarite || []).filter(p => p.eleveId === e.id).forEach(p => { paye[p.tranche] = (paye[p.tranche] || 0) + Number(p.montant || 0); });
  return echeancesDeClasse(e.classeId).filter(x => x.dateEcheance && x.dateEcheance < auj)
    .map(x => ({ label: x.label, date: x.dateEcheance, reste: Math.max(0, Number(x.montant || 0) - (paye[x.label] || 0)) })).filter(x => x.reste > 0);
}
function famillesEnRetard(classeId){
  const familles = new Map();
  DB.eleves.filter(e => e.statut === 'Actif' && (!classeId || e.classeId === classeId)).forEach(e => {
    const r = retardsEleve(e); if(!r.length) return;
    const tel = telsDeFiche(e)[0] || ('sans:' + e.id);
    if(!familles.has(tel)) familles.set(tel, { tel: tel.startsWith('sans:') ? null : tel, enfants: [] });
    familles.get(tel).enfants.push({ e, r, total: r.reduce((t, x) => t + x.reste, 0) });
  });
  const rang = id => DB.classes.findIndex(c => c.id === id);
  return [...familles.values()].map(f => ({ ...f, total: f.enfants.reduce((t, x) => t + x.total, 0) }))
    .sort((a, b) => (!a.tel) - (!b.tel) || rang(a.enfants[0].e.classeId) - rang(b.enfants[0].e.classeId) || a.enfants[0].e.nom.localeCompare(b.enfants[0].e.nom));
}
function messageRelanceImpayes(f){
  const m = DB.meta || {};
  const lignes = f.enfants.map(({ e, r }) => `• ${e.prenom} ${String(e.nom || '').toUpperCase()} (${classeName(e.classeId)}) : ${r.map(x => `${x.label} (échéance du ${fmtDate(x.date)}) — ${fmtFCFA(x.reste)}`).join(' ; ')}`).join('\n');
  return `Bonjour,\n\nSauf erreur de notre part, ${f.enfants.length > 1 ? 'les montants suivants restent' : 'le montant suivant reste'} à régler pour la scolarité :\n${lignes}\n\nTotal : ${fmtFCFA(f.total)}.\n\n`
    + `Merci de bien vouloir passer au secrétariat${m.telephone ? ' ou de nous contacter au ' + m.telephone : ''}. Si le règlement a déjà été effectué, merci de ne pas tenir compte de ce message et de nous le signaler.\n\n`
    + `${ui.role === 'secretariat' ? 'Le secrétariat' : 'La direction'} — ${m.nomEcole || ''}`;
}
function cleRelancesImpayes(){ return 'ecomaz_relances_impayes_' + (session.ecoleId || ''); }
function relancesImpayes(){ try{ return JSON.parse(localStorage.getItem(cleRelancesImpayes()) || '{}'); }catch(_e){ return {}; } }
function ouvrirRelanceImpayes(classeId){
  classeId = classeId || '';
  if(!(DB.paiementsScolarite || []).length){
    openModal('Relancer les retards de scolarité', `
      <div class="etat-vide"><span class="etat-vide-ic" aria-hidden="true">${icone('triangle-alert')}</span><span>Aucun paiement n’est encore enregistré : toutes les familles apparaîtraient en retard à tort. Saisissez d’abord les versements déjà reçus (bouton « Saisir les versements déjà reçus »), puis revenez ici.</span></div>
      <div class="form-actions"><button type="button" class="btn secondary" onclick="closeModal()">Fermer</button></div>`);
    return;
  }
  const familles = famillesEnRetard(classeId || null), envois = relancesImpayes();
  const total = familles.reduce((t, f) => t + f.total, 0);
  const ligne = f => {
    const envoye = f.tel && envois[f.tel];
    return `<li class="relance-ligne${envoye ? ' envoye' : ''}"${f.tel ? ` id="relimp_${f.tel}"` : ''}>
      <span class="relance-txt"><strong>${f.enfants.map(x => escapeHtml(eleveFullName(x.e))).join(' · ')}</strong>
        <small>${f.enfants.map(x => `${escapeHtml(classeName(x.e.classeId))} : ${x.r.map(r => escapeHtml(r.label)).join(', ')}`).join(' · ')} — <strong>${fmtFCFA(f.total)}</strong></small></span>
      <span class="relance-actions">${f.tel
        ? `<a class="btn sm" href="https://wa.me/225${f.tel}?text=${encodeURIComponent(messageRelanceImpayes(f))}" target="_blank" rel="noopener" onclick="marquerRelanceImpayes(${jsArg(f.tel)})">WhatsApp · ${telLisible(f.tel)}</a>${envoye ? `<span class="badge-etat ok">Relancé le ${fmtDate(envoye)}</span>` : ''}`
        : `<span class="hint" style="margin:0;">Numéro à corriger sur la fiche</span>`}</span>
    </li>`;
  };
  openModal('Relancer les retards de scolarité', `
    <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:space-between;margin-bottom:8px;">
      <select class="puce-select petit" aria-label="Classe" onchange="ouvrirRelanceImpayes(this.value)"><option value="">Toutes les classes</option>${DB.classes.map(c => `<option value="${c.id}" ${classeId === c.id ? 'selected' : ''}>${escapeHtml(c.nom)}</option>`).join('')}</select>
      <span class="hint" style="margin:0;"><strong>${familles.length}</strong> famille(s) en retard · ${fmtFCFA(total)}</span>
    </div>
    <p class="hint" style="margin-top:0;">Seules les tranches dont la date est <strong>dépassée</strong> sont comptées. Le message est courtois, signé par l’établissement, et invite à signaler un règlement déjà fait. Vérifiez que les paiements sont à jour avant d’envoyer.</p>
    ${familles.length ? `<ul class="relance-liste">${familles.map(ligne).join('')}</ul>` : '<div class="etat-vide etat-vide-ok"><span>Aucun retard de paiement pour cette sélection 🎉</span></div>'}
    <div class="form-actions"><button type="button" class="btn secondary" onclick="closeModal()">Fermer</button></div>`);
}
function marquerRelanceImpayes(tel){
  const envois = relancesImpayes(); envois[tel] = todayISO();
  try{ localStorage.setItem(cleRelancesImpayes(), JSON.stringify(envois)); }catch(_e){}
  const li = document.getElementById('relimp_' + tel);
  if(li && !li.classList.contains('envoye')){ li.classList.add('envoye'); li.querySelector('.relance-actions')?.insertAdjacentHTML('beforeend', `<span class="badge-etat ok">Relancé le ${fmtDate(todayISO())}</span>`); }
}
function optionsEcheancesScolarite(selectedLabel, classeId){
  const grille = echeancesDeClasse(classeId);
  if(grille.length){
    return grille.map(e=>`<option value="${escapeHtml(e.label)}" data-montant="${e.montant}" ${selectedLabel===e.label?'selected':''}>${escapeHtml(e.label)} — ${fmtFCFA(e.montant)}</option>`).join('');
  }
  return TRANCHES_SCOLARITE.map(t=>`<option ${selectedLabel===t?'selected':''}>${t}</option>`).join('');
}
function openPaiementScolariteForm(eleveId, trancheLabel){
  const e = eleveById(eleveId);
  const info = scolariteEleveInfo(eleveId);
  const grille = scolariteEleveParEcheance(eleveId);
  // Si on cible une échéance précise (clic sur une case de la grille), on
  // pré-remplit avec le reste exact dû sur CETTE échéance, pas le solde global.
  const echCible = trancheLabel ? grille.detail.find(d=>d.label===trancheLabel) : null;
  const montantDefaut = echCible ? Math.max(0, echCible.montant - echCible.paye) : (Math.min(info.solde,info.du)||10000);
  openModal(`Paiement scolarité — ${eleveFullName(e)}`, `
    <div class="section-note">${echCible ? `${escapeHtml(echCible.label)} : reste <strong>${fmtFCFA(montantDefaut)}</strong> sur ${fmtFCFA(echCible.montant)}` : `Solde restant dû : <strong>${fmtFCFA(info.solde)}</strong> sur ${fmtFCFA(info.du)}`}</div>
    ${boutonRemplissage('paiement', 'SCHEMA_PAIEMENT', 'formPaiement')}
    <form id="formPaiement" onsubmit="return handleSavePaiementScolarite(event,'${eleveId}')">
      <div class="form-grid">
        <div class="field"><label>Montant (${DEVISE})</label><input type="number" id="paiementMontant" name="montant" min="500" step="500" required value="${montantDefaut}"></div>
        <div class="field"><label>Échéance / Tranche</label><select name="tranche" onchange="const o=this.selectedOptions[0]; if(o && o.dataset.montant) document.getElementById('paiementMontant').value = o.dataset.montant;">${optionsEcheancesScolarite(trancheLabel, e?.classeId)}</select></div>
        <div class="field"><label>Date</label><input type="date" name="date" value="${todayISO()}"></div>
        <div class="field"><label>Mode de paiement</label><select name="modePaiement">${MODES_PAIEMENT.map(m=>`<option>${m}</option>`).join('')}</select></div>
      </div>
      <div class="form-actions"><button type="button" class="btn secondary" onclick="closeModal()">Annuler</button><button type="submit" class="btn">Enregistrer</button></div>
    </form>`);
}
async function handleSavePaiementScolarite(ev, eleveId){
  ev.preventDefault();
  const fd = new FormData(ev.target);
  const patch = {eleveId, montant: Math.max(0, parseInt(fd.get('montant'))||0), tranche: fd.get('tranche'), date: fd.get('date')||todayISO(), modePaiement: fd.get('modePaiement')};
  try{
    const rec = await dbInsert('paiements_scolarite', patch);
    DB.paiementsScolarite.push(rec);
    journaliserCompta('paiements_scolarite', rec.id, 'creation', null, rec);
    toast('Paiement enregistré');
    renderView('comptabilite');
    const e = eleveById(eleveId);
    openRecu({type:'entree', refId:rec.id, montant:rec.montant, date:rec.date, modePaiement:rec.modePaiement, objet:`Scolarité — ${rec.tranche}`, personne: eleveFullName(e), sousInfo: `${classeName(e.classeId)} · Matricule ${e.matricule}`});
    confirmerPaiementParent(rec, e);
  }catch(e){ alert('Erreur : ' + e.message); }
  return false;
}
// Confirmation automatique au parent : message dans son application +
// notification, et bouton WhatsApp sous le reçu (gratuit).
async function confirmerPaiementParent(rec, e){
  if(!e) return;
  const g = scolariteEleveParEcheance(e.id), info = scolariteEleveInfo(e.id);
  const du = g.total || info.du, paye = g.total ? g.totalPaye : info.paye, reste = Math.max(0, du - paye);
  const texte = `🧾 Paiement reçu le ${fmtDate(rec.date)} : ${fmtFCFA(rec.montant)} (${rec.modePaiement || 'espèces'}) — ${rec.tranche || 'Scolarité'} — ${eleveFullName(e)}.`
    + (du ? (reste ? ` Reste à payer : ${fmtFCFA(reste)}.` : ' Scolarité soldée.') : '') + ` Merci ! — ${DB.meta?.nomEcole || ''}`;
  try{
    const { data } = await sb.from('messages_internes').insert({ destinataire_type: 'parent', eleve_id: e.id, contenu: texte, auteur_nom: DB.meta?.nomEcole || '' }).select().single();
    if(data) DB.messagesInternes = [rowToCamel(data)].concat(DB.messagesInternes || []);
  }catch(_e){}
  notifierParentsPush([e.id], texte);
  const tels = String(e.parentTel || '').split(/\s*[\/;,|]\s*|\s+-\s+|\s+et\s+/i).map(t => t.replace(/\D/g, '').replace(/^225/, '')).filter(t => t.length === 10);
  const corps = document.getElementById('modalBody');
  if(corps && tels.length){
    const z = document.createElement('div'); z.className = 'form-actions no-print'; z.style.flexWrap = 'wrap';
    z.innerHTML = `<span class="hint" style="margin:0 auto 0 0;">Le parent a été prévenu dans son application.</span>` + tels.map(t => `<a class="btn secondary sm" href="https://wa.me/225${t}?text=${encodeURIComponent(texte)}" target="_blank" rel="noopener">📲 WhatsApp ${t.replace(/(\d{2})(?=\d)/g, '$1 ')}</a>`).join('');
    corps.appendChild(z);
  }
}
function voirHistoriqueScolarite(eleveId){
  const e = eleveById(eleveId);
  const paiements = DB.paiementsScolarite.filter(p=>p.eleveId===eleveId).sort((a,b)=>b.date.localeCompare(a.date));
  const admin = ['direction','fondation'].includes(ui.role);   // modifier / supprimer : direction et fondation (section 97)
  const rows = paiements.map(p=>`<tr><td>${fmtDate(p.date)}</td><td>${p.tranche}</td><td class="amount in">${fmtFCFA(p.montant)}</td><td>${p.modePaiement}</td>
    <td style="white-space:nowrap;"><button class="icon-btn" title="Reçu" onclick="openRecu({type:'entree', refId:'${p.id}', montant:${p.montant}, date:'${p.date}', modePaiement:${jsArg(p.modePaiement)}, objet:${jsArg('Scolarité — ' + (p.tranche || ''))}, personne:${jsArg(eleveFullName(e))}, sousInfo:${jsArg(classeName(e.classeId))}})">🧾</button>
    ${admin ? `<button class="icon-btn" title="Modifier" onclick="openModifierPaiementScolariteForm('${p.id}')">✏️</button>
    <button class="icon-btn danger" title="Supprimer" onclick="deletePaiementScolarite('${p.id}','${eleveId}')">🗑️</button>` : ''}</td></tr>`).join('');
  openModal(`Historique scolarité — ${eleveFullName(e)}`, `
    ${admin ? '' : '<div class="hint" style="margin-top:0;">Pour corriger ou annuler un paiement déjà enregistré, adressez-vous à la direction.</div>'}
    <div class="table-wrap"><table><thead><tr><th>Date</th><th>Tranche</th><th>Montant</th><th>Mode</th><th></th></tr></thead>
    <tbody>${rows || '<tr><td colspan="5" class="hint">Aucun paiement enregistré</td></tr>'}</tbody></table></div>`);
}
function openModifierPaiementScolariteForm(paiementId){
  const p = DB.paiementsScolarite.find(x=>x.id===paiementId);
  if(!p) return;
  openModal('Modifier le paiement', `
    <div class="section-note">✏️ La correction sera enregistrée dans le Journal d'audit, avec le montant avant/après.</div>
${boutonRemplissage('paiement', "SCHEMA_PAIEMENT", 'formPaiementModif')}
    <form id="formPaiementModif" onsubmit="return handleModifierPaiementScolarite(event,'${paiementId}')">
      <div class="form-grid">
        <div class="field"><label>Montant (${DEVISE})</label><input type="number" name="montant" min="500" step="500" required value="${p.montant}"></div>
        <div class="field"><label>Échéance / Tranche</label><select name="tranche">${optionsEcheancesScolarite(p.tranche, eleveById(p.eleveId)?.classeId)}</select></div>
        <div class="field"><label>Date</label><input type="date" name="date" value="${p.date}"></div>
        <div class="field"><label>Mode de paiement</label><select name="modePaiement">${MODES_PAIEMENT.map(m=>`<option ${p.modePaiement===m?'selected':''}>${m}</option>`).join('')}</select></div>
      </div>
      <div class="form-actions"><button type="button" class="btn secondary" onclick="closeModal()">Annuler</button><button type="submit" class="btn">Enregistrer la correction</button></div>
    </form>`);
}
async function handleModifierPaiementScolarite(ev, paiementId){
  ev.preventDefault();
  const fd = new FormData(ev.target);
  const eleveId = DB.paiementsScolarite.find(x=>x.id===paiementId)?.eleveId;
  const patch = {montant: Math.max(0, parseInt(fd.get('montant'))||0), tranche: fd.get('tranche'), date: fd.get('date')||todayISO(), modePaiement: fd.get('modePaiement')};
  try{
    const avant = DB.paiementsScolarite.find(x=>x.id===paiementId);
    await dbUpdate('paiements_scolarite', paiementId, patch);
    const idx = DB.paiementsScolarite.findIndex(x=>x.id===paiementId);
    const apres = {...avant, ...patch};
    DB.paiementsScolarite[idx] = apres;
    journaliserCompta('paiements_scolarite', paiementId, 'modification', avant, apres);
    toast('Paiement corrigé');
    voirHistoriqueScolarite(eleveId);
    renderView('comptabilite');
  }catch(e){ alert('Erreur : ' + e.message); }
  return false;
}
async function deletePaiementScolarite(id, eleveId){
  if(!confirm('Supprimer ce paiement ?')) return;
  try{
    const avant = DB.paiementsScolarite.find(p=>p.id===id) || null;
    await dbDelete('paiements_scolarite', id);
    DB.paiementsScolarite = DB.paiementsScolarite.filter(p=>p.id!==id);
    journaliserCompta('paiements_scolarite', id, 'suppression', avant, null);
    toast('Paiement supprimé');
    voirHistoriqueScolarite(eleveId);
    renderView('comptabilite');
  }catch(e){ alert('Erreur : ' + e.message); }
}
function openFraisScolariteForm(){
  openModal('Configurer les frais de scolarité', `
${boutonRemplissage('frais', "schemaFrais()", 'formFrais')}
    <form id="formFrais" onsubmit="return handleSaveFraisScolarite(event)">
      <div class="form-grid">
        ${DB.classes.map(c=>`<div class="field"><label>${c.nom}</label><input type="number" name="frais_${c.id}" min="0" step="1000" value="${DB.fraisScolarite[c.id]||0}"></div>`).join('')}
      </div>
      <div class="hint">Montant annuel en ${DEVISE} par classe.</div>
      <div class="form-actions"><button type="button" class="btn secondary" onclick="closeModal()">Annuler</button><button type="submit" class="btn">Enregistrer</button></div>
    </form>`);
}
async function handleSaveFraisScolarite(ev){
  ev.preventDefault();
  const fd = new FormData(ev.target);
  try{
    for(const c of DB.classes){
      const montant = Math.max(0, parseInt(fd.get(`frais_${c.id}`))||0);
      await dbUpdate('classes', c.id, {fraisScolarite: montant});
      DB.fraisScolarite[c.id] = montant;
    }
    closeModal(); toast('Frais de scolarité mis à jour');
    renderView('comptabilite');
  }catch(e){ alert('Erreur : ' + e.message); }
  return false;
}

/* --- 12.3 Activités extra-scolaires --- */
function renderComptaActivites(){
  const activitesHC = (DB.activites || []).filter(a => a.type !== 'cantine');
  if(ui.filters.comptaActivite && !activitesHC.some(a => a.id === ui.filters.comptaActivite)) ui.filters.comptaActivite = '';
  const actId = ui.filters.comptaActivite || (activitesHC[0] && activitesHC[0].id) || '';
  ui.filters.comptaActivite = actId;

  const catalogRows = activitesHC.map(a=>{
    const nb = DB.inscriptionsActivites.filter(i=>i.activiteId===a.id).length;
    return `<tr><td>${escapeHtml(a.nom)}</td><td>${fmtFCFA(a.montantCotisation)}</td><td>${a.periode}</td><td>${nb}</td>
      <td><button class="icon-btn" onclick="openActiviteForm('${a.id}')">✏️</button><button class="icon-btn danger" onclick="deleteActivite('${a.id}')">🗑️</button></td></tr>`;
  }).join('');

  let inscritsPanel = '';
  if(actId){
    const act = activitesHC.find(a=>a.id===actId);
    const inscriptions = DB.inscriptionsActivites.filter(i=>i.activiteId===actId);
    const eleveIdsInscrits = inscriptions.map(i=>i.eleveId);
    const rows = inscriptions.map(insc=>{
      const e = eleveById(insc.eleveId);
      if(!e) return '';
      const paye = DB.paiementsCotisations.filter(p=>p.eleveId===e.id && p.activiteId===actId).reduce((s,p)=>s+p.montant,0);
      const solde = Math.max(0, act.montantCotisation-paye);
      const statut = paye>=act.montantCotisation ? 'Soldé' : paye>0 ? 'Partiel' : 'Impayé';
      const bc = statut==='Soldé'?'green':statut==='Partiel'?'amber':'red';
      return `<tr>
        <td><div class="row-name"><span class="avatar">${initials(e.prenom,e.nom)}</span>${escapeHtml(eleveFullName(e))}</div></td>
        <td><span class="badge blue">${classeName(e.classeId)}</span></td>
        <td class="amount in">${fmtFCFA(paye)}</td>
        <td class="amount ${solde>0?'out':''}">${fmtFCFA(solde)}</td>
        <td><span class="badge ${bc}">${statut}</span></td>
        <td style="white-space:nowrap;"><button class="btn sm" onclick="openPaiementCotisationForm('${e.id}','${actId}')">+ Paiement</button> <button class="icon-btn danger" title="Désinscrire" onclick="desinscrireActivite('${insc.id}')">✕</button></td>
      </tr>`;
    }).join('');
    inscritsPanel = `
    <div class="panel">
      <div class="panel-head">
        <div><h2>Inscrits — ${escapeHtml(act.nom)}</h2><div class="sub">Cotisation : ${fmtFCFA(act.montantCotisation)} / ${act.periode}</div></div>
        <button class="btn" onclick="openInscriptionActiviteForm('${actId}')">+ Inscrire un élève</button>
      </div>
      ${inscriptions.length===0 ? `<div class="empty-state"><div class="em-ic">🎨</div>Aucun élève inscrit à cette activité.</div>` : `
      <div class="table-wrap"><table>
        <thead><tr><th>Élève</th><th>Classe</th><th>Payé</th><th>Solde</th><th>Statut</th><th>Actions</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>`}
    </div>`;
  }

  return `
    <div class="panel">
      <div class="panel-head"><div><h2>Catalogue des activités extra-scolaires</h2><div class="sub">${activitesHC.length} activité(s)</div></div><button class="btn" onclick="openActiviteForm()">+ Nouvelle activité</button></div>
      ${activitesHC.length===0 ? `<div class="empty-state"><div class="em-ic">🎨</div>Aucune activité créée.</div>` : `
      <div class="table-wrap"><table><thead><tr><th>Activité</th><th>Cotisation</th><th>Périodicité</th><th>Inscrits</th><th>Actions</th></tr></thead><tbody>${catalogRows}</tbody></table></div>`}
    </div>
    ${activitesHC.length>0 ? `
    <div class="filters"><select onchange="ui.filters.comptaActivite=this.value; renderView('comptabilite')">${activitesHC.map(a=>`<option value="${a.id}" ${actId===a.id?'selected':''}>${escapeHtml(a.nom)}</option>`).join('')}</select></div>
    ${inscritsPanel}` : ''}`;
}

function openActiviteForm(id){
  const a = id ? DB.activites.find(x=>x.id===id) : null;
  openModal(a ? "Modifier l'activité" : 'Nouvelle activité', `
${boutonRemplissage('activite', "SCHEMA_ACTIVITE", 'formActivite')}
    <form id="formActivite" onsubmit="return handleSaveActivite(event,'${id||''}')">
      <div class="form-grid">
        <div class="field span2"><label>Nom de l'activité</label><input name="nom" required value="${a?escapeHtml(a.nom):''}"></div>
        <div class="field"><label>Cotisation (${DEVISE})</label><input type="number" name="montantCotisation" min="0" step="500" required value="${a?a.montantCotisation:10000}"></div>
        <div class="field"><label>Périodicité</label>
          <select name="periode"><option ${a?.periode==='Mensuel'?'selected':''}>Mensuel</option><option ${!a||a?.periode==='Trimestriel'?'selected':''}>Trimestriel</option><option ${a?.periode==='Annuel'?'selected':''}>Annuel</option></select>
        </div>
      </div>
      <div class="form-actions"><button type="button" class="btn secondary" onclick="closeModal()">Annuler</button><button type="submit" class="btn">Enregistrer</button></div>
    </form>`);
}
async function handleSaveActivite(ev, id){
  ev.preventDefault();
  const fd = new FormData(ev.target);
  const patch = {nom: fd.get('nom').trim(), montantCotisation: Math.max(0,parseInt(fd.get('montantCotisation'))||0), periode: fd.get('periode')};
  try{
    let finalId = id;
    if(id){
      await dbUpdate('activites', id, patch);
      const idx = DB.activites.findIndex(a=>a.id===id);
      DB.activites[idx] = { ...DB.activites[idx], id, ...patch };
    } else {
      const rec = await dbInsert('activites', patch);
      DB.activites.push(rec);
      finalId = rec.id;
    }
    closeModal(); toast('Activité enregistrée');
    ui.filters.comptaActivite = finalId;
    renderView('comptabilite');
  }catch(e){ alert('Erreur : ' + e.message); }
  return false;
}
async function deleteActivite(id){
  if(!confirm('Supprimer cette activité ? Les inscriptions et paiements liés seront également supprimés.')) return;
  try{
    await dbDelete('activites', id);
    DB.activites = DB.activites.filter(a=>a.id!==id);
    DB.inscriptionsActivites = DB.inscriptionsActivites.filter(i=>i.activiteId!==id);
    DB.paiementsCotisations = DB.paiementsCotisations.filter(p=>p.activiteId!==id);
    if(ui.filters.comptaActivite===id) ui.filters.comptaActivite = '';
    toast('Activité supprimée');
    renderView('comptabilite');
  }catch(e){ alert('Erreur : ' + e.message); }
}
function openInscriptionActiviteForm(activiteId){
  const inscritIds = DB.inscriptionsActivites.filter(i=>i.activiteId===activiteId).map(i=>i.eleveId);
  const dispo = DB.eleves.filter(e=>e.statut==='Actif' && !inscritIds.includes(e.id)).sort((a,b)=>a.nom.localeCompare(b.nom));
  openModal('Inscrire un élève', `
    <form onsubmit="return handleSaveInscriptionActivite(event,'${activiteId}')">
      <div class="form-grid single">
        <div class="field"><label>Élève</label>
          <select name="eleveId" required>${dispo.map(e=>`<option value="${e.id}">${eleveFullName(e)} — ${classeName(e.classeId)}</option>`).join('')}</select>
        </div>
      </div>
      ${dispo.length===0 ? `<div class="hint">Tous les élèves actifs sont déjà inscrits à cette activité.</div>` : ''}
      <div class="form-actions"><button type="button" class="btn secondary" onclick="closeModal()">Annuler</button><button type="submit" class="btn" ${dispo.length===0?'disabled':''}>Inscrire</button></div>
    </form>`);
}
async function handleSaveInscriptionActivite(ev, activiteId){
  ev.preventDefault();
  const fd = new FormData(ev.target);
  try{
    DB.inscriptionsActivites.push(await dbInsert('inscriptions_activites', {eleveId: fd.get('eleveId'), activiteId, dateInscription: todayISO()}));
    closeModal(); toast('Élève inscrit');
    renderView('comptabilite');
  }catch(e){ alert('Erreur : ' + e.message); }
  return false;
}
async function desinscrireActivite(inscriptionId){
  const insc = DB.inscriptionsActivites.find(i=>i.id===inscriptionId);
  if(!insc) return;
  if(!confirm('Désinscrire cet élève de l\'activité ? Son historique de paiement pour cette activité sera supprimé.')) return;
  try{
    await dbDeleteWhere('paiements_cotisations', {eleveId: insc.eleveId, activiteId: insc.activiteId});
    await dbDelete('inscriptions_activites', inscriptionId);
    DB.paiementsCotisations = DB.paiementsCotisations.filter(p=>!(p.eleveId===insc.eleveId && p.activiteId===insc.activiteId));
    DB.inscriptionsActivites = DB.inscriptionsActivites.filter(i=>i.id!==inscriptionId);
    toast('Élève désinscrit');
    renderView('comptabilite');
  }catch(e){ alert('Erreur : ' + e.message); }
}
function openPaiementCotisationForm(eleveId, activiteId){
  const e = eleveById(eleveId);
  const act = DB.activites.find(a=>a.id===activiteId);
  const paye = DB.paiementsCotisations.filter(p=>p.eleveId===eleveId && p.activiteId===activiteId).reduce((s,p)=>s+p.montant,0);
  const solde = act.type === 'cantine' ? situationCantine(eleveId, act).reste : Math.max(0, act.montantCotisation-paye);
  openModal(`Paiement — ${act.nom}`, `
    <div class="section-note">${eleveFullName(e)} · Solde restant dû : <strong>${fmtFCFA(solde)}</strong></div>
${boutonRemplissage('cotisation', "SCHEMA_COTISATION", 'formCotisation')}
    <form id="formCotisation" onsubmit="return handleSavePaiementCotisation(event,'${eleveId}','${activiteId}')">
      <div class="form-grid">
        <div class="field"><label>Montant (${DEVISE})</label><input type="number" name="montant" min="500" step="500" required value="${solde||act.montantCotisation}"></div>
        <div class="field"><label>Date</label><input type="date" name="date" value="${todayISO()}"></div>
        <div class="field span2"><label>Mode de paiement</label><select name="modePaiement">${MODES_PAIEMENT.map(m=>`<option>${m}</option>`).join('')}</select></div>
      </div>
      <div class="form-actions"><button type="button" class="btn secondary" onclick="closeModal()">Annuler</button><button type="submit" class="btn">Enregistrer</button></div>
    </form>`);
}
async function handleSavePaiementCotisation(ev, eleveId, activiteId){
  ev.preventDefault();
  const fd = new FormData(ev.target);
  const patch = {eleveId, activiteId, montant: Math.max(0,parseInt(fd.get('montant'))||0), date: fd.get('date')||todayISO(), modePaiement: fd.get('modePaiement')};
  try{
    const rec = await dbInsert('paiements_cotisations', patch);
    DB.paiementsCotisations.push(rec);
    toast('Paiement enregistré');
    renderView('comptabilite');
    const e = eleveById(eleveId);
    const act = DB.activites.find(a=>a.id===activiteId);
    openRecu({type:'entree', refId:rec.id, montant:rec.montant, date:rec.date, modePaiement:rec.modePaiement, objet:`Cotisation — ${act?act.nom:''}`, personne: eleveFullName(e), sousInfo: classeName(e.classeId)});
  }catch(e){ alert('Erreur : ' + e.message); }
  return false;
}

/* --- Cantine (schema.sql section 120) : tarif, inscrits, paiements, reste dû, dépenses de restauration ---
   Réutilise les activités (type 'cantine') : mêmes droits, mêmes reçus, même remplissage assisté.
   Reste dû = périodes écoulées depuis l'inscription × tarif − total payé (jamais d'invention : tout vient des saisies). */
function cantine(){ return (DB.activites || []).find(a => a.type === 'cantine') || null; }
function periodesCantine(dateInscription, periode){
  const debut = String(dateInscription || todayISO()).slice(0, 7), fin = thisMonthISO();
  const [a1, m1] = debut.split('-').map(Number), [a2, m2] = fin.split('-').map(Number);
  const mois = Math.max(1, (a2 - a1) * 12 + (m2 - m1) + 1);
  return periode === 'Annuel' ? 1 : periode === 'Trimestriel' ? Math.ceil(mois / 3) : mois;
}
function situationCantine(eleveId, act){
  act = act || cantine(); if(!act) return { du: 0, paye: 0, reste: 0, payeMois: 0 };
  const insc = (DB.inscriptionsActivites || []).find(i => i.activiteId === act.id && i.eleveId === eleveId);
  const paiements = (DB.paiementsCotisations || []).filter(x => x.activiteId === act.id && x.eleveId === eleveId);
  const paye = paiements.reduce((t, x) => t + Number(x.montant || 0), 0);
  const payeMois = paiements.filter(x => String(x.date || '').slice(0, 7) === thisMonthISO()).reduce((t, x) => t + Number(x.montant || 0), 0);
  const du = insc ? periodesCantine(insc.dateInscription, act.periode) * Number(act.montantCotisation || 0) : 0;
  return { du, paye, reste: Math.max(0, du - paye), payeMois, periodes: insc ? periodesCantine(insc.dateInscription, act.periode) : 0 };
}
const SCHEMA_CANTINE_TARIF = [
  {name:'montantCotisation', label:'Tarif de la cantine par élève (francs CFA)', type:'number', format:'nombre entier'},
  {name:'periode', label:'Le tarif est payé par (mois, trimestre ou année)', type:'select'},
];
function renderComptaCantine(){
  const act = cantine();
  if(!act) return `<div class="panel cantine-config">
      <div class="panel-head"><div><h2>🍽️ Cantine</h2><div class="sub">Indiquez le tarif : vous pourrez ensuite inscrire les élèves, encaisser et suivre ce qui reste dû.</div></div></div>
      ${formulaireTarifCantine(null)}
    </div>`;
  const inscriptions = (DB.inscriptionsActivites || []).filter(i => i.activiteId === act.id);
  const lignes = inscriptions.map(i => ({ i, e: eleveById(i.eleveId) })).filter(x => x.e && x.e.statut === 'Actif')
    .map(x => ({ ...x, s: situationCantine(x.e.id, act) }))
    .sort((a, b) => classeName(a.e.classeId).localeCompare(classeName(b.e.classeId)) || a.e.nom.localeCompare(b.e.nom));
  const f = ui.filters.cantineClasse || '';
  const visibles = lignes.filter(x => !f || x.e.classeId === f);
  const mois = thisMonthISO();
  const encMois = (DB.paiementsCotisations || []).filter(x => x.activiteId === act.id && String(x.date || '').slice(0, 7) === mois).reduce((t, x) => t + Number(x.montant || 0), 0);
  const resteTotal = lignes.reduce((t, x) => t + x.s.reste, 0);
  const depMois = (DB.depenses || []).filter(d => d.categorie === 'Restauration' && String(d.date || '').slice(0, 7) === mois).reduce((t, d) => t + Number(d.montant || 0), 0);
  const solde = encMois - depMois;
  const parPeriode = { Mensuel: 'mois', Trimestriel: 'trimestre', Annuel: 'an' }[act.periode] || act.periode;
  const classes = [...new Set(lignes.map(x => x.e.classeId))].map(id => ({ id, nom: classeName(id) })).sort((a, b) => a.nom.localeCompare(b.nom));
  return `
    <div class="cards">
      <div class="card"><div class="num">${lignes.length}</div><div class="label">Élève(s) inscrit(s) à la cantine</div></div>
      <div class="card"><div class="num amount in">${fmtFCFA(encMois)}</div><div class="label">Encaissé — ${moisLabel(mois)}</div></div>
      <div class="card"><div class="num amount ${resteTotal ? 'out' : ''}">${fmtFCFA(resteTotal)}</div><div class="label">Reste à encaisser (depuis les inscriptions)</div></div>
      <div class="card"><div class="num amount out">${fmtFCFA(depMois)}</div><div class="label">Dépenses de restauration — ${moisLabel(mois)}</div></div>
      <div class="card"><div class="num amount ${solde >= 0 ? 'in' : 'out'}">${fmtFCFA(solde)}</div><div class="label">Solde cantine du mois</div></div>
    </div>
    <div class="panel">
      <div class="panel-head"><div><h2>🍽️ Cantine</h2><div class="sub">Tarif : <strong>${fmtFCFA(act.montantCotisation)}</strong> par ${escapeHtml(parPeriode)} et par élève</div></div>
        <span style="display:flex;gap:6px;flex-wrap:wrap;"><button class="btn secondary sm" onclick="openTarifCantine()">Modifier le tarif</button>
        <button class="btn secondary sm" onclick="go('cantine')">Menu de la semaine</button>
        <button class="btn secondary sm" onclick="ui.filters.comptaTab='depenses'; renderView('comptabilite'); setTimeout(() => openDepenseForm(), 50)">+ Dépense de restauration</button>
        <button class="btn sm" onclick="ouvrirInscriptionCantine()">+ Inscrire des élèves</button></span></div>
      ${lignes.length ? `
      <div class="filters">${classes.length > 1 ? `<select aria-label="Classe" onchange="ui.filters.cantineClasse=this.value; renderView('comptabilite')"><option value="">Toutes les classes</option>${classes.map(c => `<option value="${c.id}" ${f === c.id ? 'selected' : ''}>${escapeHtml(c.nom)}</option>`).join('')}</select>` : ''}</div>
      <div class="table-wrap"><table>
        <thead><tr><th>Élève</th><th>Classe</th><th>Inscrit le</th><th>Dû à ce jour</th><th>Payé</th><th>Reste</th><th>Statut</th><th>Actions</th></tr></thead>
        <tbody>${visibles.map(x => { const st = x.s.reste <= 0 ? ['À jour', 'green'] : x.s.paye > 0 ? ['Partiel', 'amber'] : ['Impayé', 'red'];
          return `<tr><td><div class="row-name"><span class="avatar">${initials(x.e.prenom, x.e.nom)}</span>${escapeHtml(eleveFullName(x.e))}</div></td>
            <td><span class="badge blue">${escapeHtml(classeName(x.e.classeId))}</span></td>
            <td>${x.i.dateInscription ? fmtDate(x.i.dateInscription) : '—'}</td>
            <td class="amount">${fmtFCFA(x.s.du)}<small class="hint" style="display:block;margin:0;">${x.s.periodes} ${escapeHtml(parPeriode)}${x.s.periodes > 1 && parPeriode !== 'mois' ? 's' : ''}</small></td>
            <td class="amount in">${fmtFCFA(x.s.paye)}</td>
            <td class="amount ${x.s.reste ? 'out' : ''}">${fmtFCFA(x.s.reste)}</td>
            <td><span class="badge ${st[1]}">${st[0]}</span></td>
            <td style="white-space:nowrap;"><button class="btn sm" onclick="openPaiementCotisationForm('${x.e.id}','${act.id}')">+ Paiement</button> <button class="icon-btn danger" title="Retirer de la cantine" aria-label="Retirer ${escapeHtml(eleveFullName(x.e))} de la cantine" onclick="desinscrireActivite('${x.i.id}')">🗑️</button></td></tr>`; }).join('')}</tbody>
      </table></div>` : `<div class="empty-state"><div class="em-ic">🍽️</div>Aucun élève inscrit à la cantine. Touchez « + Inscrire des élèves » : vous pouvez inscrire une classe entière d’un coup.</div>`}
    </div>`;
}
function formulaireTarifCantine(act){
  return `${boutonRemplissage('cantine-tarif', "SCHEMA_CANTINE_TARIF", 'formCantineTarif')}
    <form id="formCantineTarif" onsubmit="return enregistrerTarifCantine(event)">
      <div class="form-grid">
        <div class="field"><label>Tarif par élève (${DEVISE})</label><input type="number" name="montantCotisation" min="0" step="500" required value="${act ? act.montantCotisation : ''}" placeholder="Ex : 15000"></div>
        <div class="field"><label>Payé par</label><select name="periode">${[['Mensuel', 'mois'], ['Trimestriel', 'trimestre'], ['Annuel', 'année']].map(([v, l]) => `<option value="${v}" ${(act ? act.periode : 'Mensuel') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      </div>
      <div class="form-actions">${act ? '<button type="button" class="btn secondary" onclick="closeModal()">Annuler</button>' : ''}<button type="submit" class="btn">Enregistrer le tarif</button></div>
    </form>`;
}
function openTarifCantine(){ openModal('Tarif de la cantine', formulaireTarifCantine(cantine())); }
async function enregistrerTarifCantine(ev){
  ev.preventDefault();
  const fd = new FormData(ev.target), act = cantine();
  const patch = { nom: 'Cantine', type: 'cantine', montantCotisation: Math.max(0, parseInt(fd.get('montantCotisation')) || 0), periode: fd.get('periode') };
  try{
    if(act){ await dbUpdate('activites', act.id, patch); Object.assign(act, patch); }
    else DB.activites.push(await dbInsert('activites', patch));
    closeModal(); toast('Tarif de la cantine enregistré'); renderView('comptabilite');
  }catch(e){ alert('Erreur : ' + e.message); }
  return false;
}
// Inscription par classe : tous les élèves de la classe cochés d'office, on décoche les exceptions
function ouvrirInscriptionCantine(classeId){
  const act = cantine(); if(!act) return;
  const deja = new Set((DB.inscriptionsActivites || []).filter(i => i.activiteId === act.id).map(i => i.eleveId));
  classeId = classeId || ui.filters.cantineClasse || (DB.classes[0] || {}).id;
  const eleves = DB.eleves.filter(e => e.statut === 'Actif' && e.classeId === classeId && !deja.has(e.id)).sort((a, b) => a.nom.localeCompare(b.nom));
  openModal('Inscrire des élèves à la cantine', `
    <form onsubmit="return enregistrerInscriptionCantine(event)">
      <div class="form-grid">
        <div class="field"><label>Classe</label><select onchange="ouvrirInscriptionCantine(this.value)">${DB.classes.map(c => `<option value="${c.id}" ${c.id === classeId ? 'selected' : ''}>${escapeHtml(c.nom)}</option>`).join('')}</select></div>
        <div class="field"><label>Inscrits à partir du</label><input type="date" name="date" required value="${todayISO()}"></div>
      </div>
      ${eleves.length ? `<div class="hint">Tous les élèves non encore inscrits sont cochés : décochez ceux qui ne mangent pas à la cantine.</div>
      <div class="cantine-choix">${eleves.map(e => `<label class="enrol-choix"><input type="checkbox" name="eleve" value="${e.id}" checked> ${escapeHtml(eleveFullName(e))}</label>`).join('')}</div>`
      : '<div class="hint">Tous les élèves actifs de cette classe sont déjà inscrits à la cantine.</div>'}
      <div class="form-actions"><button type="button" class="btn secondary" onclick="closeModal()">Annuler</button>${eleves.length ? '<button type="submit" class="btn">Inscrire les élèves cochés</button>' : ''}</div>
    </form>`);
}
async function enregistrerInscriptionCantine(ev){
  ev.preventDefault();
  const act = cantine(); if(!act) return false;
  const fd = new FormData(ev.target), ids = fd.getAll('eleve'), date = fd.get('date') || todayISO();
  if(!ids.length){ toast('Cochez au moins un élève'); return false; }
  try{
    const crees = await dbInsertMany('inscriptions_activites', ids.map(eleveId => ({ eleveId, activiteId: act.id, dateInscription: date })));
    DB.inscriptionsActivites.push(...crees);
    closeModal(); toast(`${crees.length} élève(s) inscrit(s) à la cantine`); renderView('comptabilite');
  }catch(e){ alert('Erreur : ' + e.message); }
  return false;
}

/* --- 12.4 Boutique scolaire (ventes de gadgets) --- */
function renderComptaVentes(){
  const catalogRows = DB.gadgets.map(g=>{
    const sb = g.stock<=5 ? 'red' : g.stock<=15 ? 'amber' : 'green';
    return `<tr><td>${escapeHtml(g.nom)}</td><td>${fmtFCFA(g.prixUnitaire)}</td><td><span class="badge ${sb}">${g.stock} en stock</span></td>
      <td><button class="icon-btn" onclick="openGadgetForm('${g.id}')">✏️</button><button class="icon-btn danger" onclick="deleteGadget('${g.id}')">🗑️</button></td></tr>`;
  }).join('');

  const ventes = DB.ventesGadgets.slice().sort((a,b)=>b.date.localeCompare(a.date));
  const totalMois = ventes.filter(v=>v.date.slice(0,7)===thisMonthISO()).reduce((s,v)=>s+v.montantTotal,0);
  const ventesRows = ventes.slice(0,20).map(v=>{
    const g = DB.gadgets.find(x=>x.id===v.gadgetId);
    const e = v.eleveId ? eleveById(v.eleveId) : null;
    return `<tr><td>${fmtDate(v.date)}</td><td>${escapeHtml(g?g.nom:'—')}</td><td>${v.quantite}</td><td>${e?escapeHtml(eleveFullName(e)):'<span class="hint">Vente comptoir</span>'}</td><td class="amount in">${fmtFCFA(v.montantTotal)}</td><td>${v.modePaiement}</td>
      <td><button class="icon-btn" title="Reçu" onclick="openRecu({type:'entree', refId:'${v.id}', montant:${v.montantTotal}, date:'${v.date}', modePaiement:${jsArg(v.modePaiement)}, objet:${jsArg('Boutique — ' + (g ? g.nom : '') + ' ×' + v.quantite)}, personne:${jsArg(e ? eleveFullName(e) : 'Vente comptoir')}, sousInfo:''})">🧾</button></td></tr>`;
  }).join('');

  return `
    <div class="cards">
      <div class="card"><div class="num amount in">${fmtFCFA(totalMois)}</div><div class="label">Ventes — ${moisLabel(thisMonthISO())}</div></div>
      <div class="card"><div class="num">${DB.gadgets.reduce((s,g)=>s+g.stock,0)}</div><div class="label">Articles en stock</div></div>
      <div class="card"><div class="num">${DB.gadgets.filter(g=>g.stock<=5).length}</div><div class="label">Références en rupture proche</div></div>
    </div>
    <div class="grid-2">
      <div class="panel">
        <div class="panel-head"><div><h2>Catalogue boutique</h2><div class="sub">${DB.gadgets.length} article(s)</div></div><button class="btn secondary sm" onclick="openGadgetForm()">+ Article</button></div>
        ${DB.gadgets.length===0 ? `<div class="empty-state"><div class="em-ic">🛍️</div>Aucun article dans le catalogue.</div>` : `
        <div class="table-wrap"><table><thead><tr><th>Article</th><th>Prix</th><th>Stock</th><th>Actions</th></tr></thead><tbody>${catalogRows}</tbody></table></div>`}
      </div>
      <div class="panel">
        <div class="panel-head"><div><h2>Nouvelle vente</h2></div></div>
        ${DB.gadgets.length===0 ? `<div class="hint">Ajoutez un article au catalogue pour enregistrer une vente.</div>` : `
${boutonRemplissage('vente', "SCHEMA_VENTE", 'formVente')}
        <form id="formVente" onsubmit="return handleSaveVente(event)">
          <div class="form-grid single">
            <div class="field"><label>Article</label><select name="gadgetId" required>${DB.gadgets.map(g=>`<option value="${g.id}">${escapeHtml(g.nom)} — ${fmtFCFA(g.prixUnitaire)} (stock: ${g.stock})</option>`).join('')}</select></div>
            <div class="field"><label>Quantité</label><input type="number" name="quantite" min="1" value="1" required></div>
            <div class="field"><label>Élève (optionnel)</label>
              <select name="eleveId"><option value="">— Vente comptoir —</option>${DB.eleves.filter(e=>e.statut==='Actif').sort((a,b)=>a.nom.localeCompare(b.nom)).map(e=>`<option value="${e.id}">${eleveFullName(e)} — ${classeName(e.classeId)}</option>`).join('')}</select>
            </div>
            <div class="field"><label>Mode de paiement</label><select name="modePaiement">${MODES_PAIEMENT.map(m=>`<option>${m}</option>`).join('')}</select></div>
          </div>
          <div class="form-actions"><button type="submit" class="btn">💰 Enregistrer la vente</button></div>
        </form>`}
      </div>
    </div>
    <div class="panel">
      <div class="panel-head"><div><h2>Historique des ventes</h2><div class="sub">20 dernières transactions</div></div></div>
      <div class="table-wrap"><table><thead><tr><th>Date</th><th>Article</th><th>Qté</th><th>Client</th><th>Montant</th><th>Mode</th><th></th></tr></thead>
      <tbody>${ventesRows || '<tr><td colspan="7" class="hint">Aucune vente enregistrée</td></tr>'}</tbody></table></div>
    </div>`;
}
function openGadgetForm(id){
  const g = id ? DB.gadgets.find(x=>x.id===id) : null;
  openModal(g ? "Modifier l'article" : 'Nouvel article', `
${boutonRemplissage('article', "SCHEMA_GADGET", 'formGadget')}
    <form id="formGadget" onsubmit="return handleSaveGadget(event,'${id||''}')">
      <div class="form-grid">
        <div class="field span2"><label>Nom de l'article</label><input name="nom" required value="${g?escapeHtml(g.nom):''}"></div>
        <div class="field"><label>Prix unitaire (${DEVISE})</label><input type="number" name="prixUnitaire" min="0" step="100" required value="${g?g.prixUnitaire:1000}"></div>
        <div class="field"><label>Stock disponible</label><input type="number" name="stock" min="0" required value="${g?g.stock:10}"></div>
      </div>
      <div class="form-actions"><button type="button" class="btn secondary" onclick="closeModal()">Annuler</button><button type="submit" class="btn">Enregistrer</button></div>
    </form>`);
}
async function handleSaveGadget(ev, id){
  ev.preventDefault();
  const fd = new FormData(ev.target);
  const patch = {nom:fd.get('nom').trim(), prixUnitaire:Math.max(0,parseInt(fd.get('prixUnitaire'))||0), stock:Math.max(0,parseInt(fd.get('stock'))||0)};
  try{
    if(id){
      await dbUpdate('gadgets', id, patch);
      const idx = DB.gadgets.findIndex(g=>g.id===id);
      DB.gadgets[idx] = {id, ...patch};
    } else {
      DB.gadgets.push(await dbInsert('gadgets', patch));
    }
    closeModal(); toast('Article enregistré');
    renderView('comptabilite');
  }catch(e){ alert('Erreur : ' + e.message); }
  return false;
}
async function deleteGadget(id){
  if(!confirm('Supprimer cet article du catalogue ?')) return;
  try{
    await dbDelete('gadgets', id);
    DB.gadgets = DB.gadgets.filter(g=>g.id!==id);
    toast('Article supprimé');
    renderView('comptabilite');
  }catch(e){ alert('Erreur : ' + e.message); }
}
async function handleSaveVente(ev){
  ev.preventDefault();
  const fd = new FormData(ev.target);
  const gadget = DB.gadgets.find(g=>g.id===fd.get('gadgetId'));
  const quantite = Math.max(1, parseInt(fd.get('quantite'))||1);
  if(!gadget || quantite>gadget.stock){ alert(`Stock insuffisant (disponible : ${gadget?gadget.stock:0}).`); return false; }
  const nouveauStock = gadget.stock - quantite;
  const patch = {gadgetId:gadget.id, eleveId: fd.get('eleveId')||null, quantite, montantTotal: gadget.prixUnitaire*quantite, date: todayISO(), modePaiement: fd.get('modePaiement')};
  try{
    await dbUpdate('gadgets', gadget.id, {stock: nouveauStock});
    gadget.stock = nouveauStock;
    const rec = await dbInsert('ventes_gadgets', patch);
    DB.ventesGadgets.push(rec);
    toast('Vente enregistrée');
    renderView('comptabilite');
    const e = rec.eleveId ? eleveById(rec.eleveId) : null;
    openRecu({type:'entree', refId:rec.id, montant:rec.montantTotal, date:rec.date, modePaiement:rec.modePaiement, objet:`Boutique — ${gadget.nom} ×${quantite}`, personne: e ? eleveFullName(e) : 'Vente comptoir', sousInfo: e ? classeName(e.classeId) : ''});
  }catch(e){ alert('Erreur : ' + e.message); }
  return false;
}

/* --- 12.5 Salaires --- */
function renderComptaSalaires(){
  const mois = ui.filters.comptaMois || thisMonthISO();
  ui.filters.comptaMois = mois;

  const personnel = [
    ...DB.enseignants.filter(t=>t.statut==='Actif').map(t=>({id:t.id, type:'enseignant', nom:ensFullName(t), poste:`Enseignant — ${classeName(t.classesAssignees[0])}`, salaire:t.salaireMensuel||0})),
    ...DB.personnelAutre.filter(p=>p.statut==='Actif').map(p=>({id:p.id, type:'autre', nom:`${p.prenom} ${p.nom}`, poste:p.poste, salaire:p.salaireMensuel||0})),
  ].sort((a,b)=>a.nom.localeCompare(b.nom));

  let masseSalariale=0, totalPaye=0;
  const rows = personnel.map(p=>{
    masseSalariale += p.salaire;
    const paiement = DB.paiementsSalaires.find(x=>x.personnelId===p.id && x.personnelType===p.type && x.mois===mois);
    if(paiement) totalPaye += paiement.montant;
    return `<tr>
      <td>${escapeHtml(p.nom)}</td><td>${escapeHtml(p.poste)}</td><td>${fmtFCFA(p.salaire)}</td>
      <td>${paiement ? `<span class="badge green">Payé le ${fmtDate(paiement.datePaiement)}</span>` : `<span class="badge red">En attente</span>`}</td>
      <td style="white-space:nowrap;">
        ${paiement ? `<button class="icon-btn" title="Reçu" onclick="reimprimerRecuSalaire('${paiement.id}')">🧾</button><button class="icon-btn" title="Modifier" onclick="openModifierPaiementSalaireForm('${paiement.id}')">✏️</button><button class="icon-btn danger" title="Annuler le paiement" onclick="annulerPaiementSalaire('${paiement.id}')">✕</button>`
                    : `<button class="btn sm" onclick="payerSalaire('${p.id}','${p.type}','${mois}',${p.salaire})">Payer</button>`}
        ${p.type==='autre' ? `<button class="icon-btn" title="Modifier" onclick="openPersonnelForm('${p.id}')">✏️</button><button class="icon-btn danger" title="Supprimer" onclick="deletePersonnel('${p.id}')">🗑️</button>` : ''}
      </td>
    </tr>`;
  }).join('');

  return `
    <div class="cards">
      <div class="card"><div class="num">${fmtFCFA(masseSalariale)}</div><div class="label">Masse salariale mensuelle</div></div>
      <div class="card"><div class="num amount in">${fmtFCFA(totalPaye)}</div><div class="label">Payé — ${moisLabel(mois)}</div></div>
      <div class="card"><div class="num amount out">${fmtFCFA(masseSalariale-totalPaye)}</div><div class="label">Restant à payer</div></div>
    </div>
    <div class="panel">
      <div class="panel-head">
        <div><h2>Salaires du personnel</h2><div class="sub">${personnel.length} employé(s) actif(s) — enseignants et personnel non-enseignant</div></div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;">
          <select onchange="ui.filters.comptaMois=this.value; renderView('comptabilite')">${lastNMonths(6).map(m=>`<option value="${m}" ${mois===m?'selected':''}>${moisLabel(m)}</option>`).join('')}</select>
          <button class="btn secondary" onclick="openPersonnelForm()">+ Personnel</button>
          <button class="btn" onclick="payerToutLePersonnel('${mois}')">💵 Payer tout le personnel</button>
        </div>
      </div>
      ${personnel.length===0 ? `<div class="empty-state"><div class="em-ic">💵</div>Aucun employé actif.</div>` : `
      <div class="table-wrap"><table><thead><tr><th>Employé</th><th>Poste</th><th>Salaire mensuel</th><th>Statut ${moisLabel(mois)}</th><th>Actions</th></tr></thead><tbody>${rows}</tbody></table></div>`}
    </div>`;
}
function openPersonnelForm(id){
  const p = id ? DB.personnelAutre.find(x=>x.id===id) : null;
  openModal(p ? 'Modifier le personnel' : 'Nouveau membre du personnel', `
    <form id="formPersonnel" onsubmit="return handleSavePersonnel(event,'${id||''}')">
      ${boutonRemplissage('personnel', 'SCHEMA_PERSONNEL', 'formPersonnel')}
      <div class="form-grid">
        <div class="field"><label>Prénom</label><input name="prenom" required value="${p?escapeHtml(p.prenom):''}"></div>
        <div class="field"><label>Nom</label><input name="nom" required value="${p?escapeHtml(p.nom):''}"></div>
        <div class="field span2"><label>Poste / Fonction</label><input name="poste" list="postesList" required value="${p?escapeHtml(p.poste):''}"></div>
        <datalist id="postesList">${POSTES_PERSONNEL.map(po=>`<option value="${po}">`).join('')}</datalist>
        <div class="field"><label>Salaire mensuel (${DEVISE})</label><input type="number" name="salaireMensuel" min="0" step="1000" required value="${p?p.salaireMensuel:60000}"></div>
        <div class="field"><label>Téléphone</label><input name="telephone" value="${p?escapeHtml(p.telephone):''}"></div>
        <div class="field"><label>Date d'embauche</label><input type="date" name="dateEmbauche" value="${p?p.dateEmbauche:todayISO()}"></div>
        <div class="field"><label>Statut</label><select name="statut"><option ${p?.statut==='Actif'?'selected':''}>Actif</option><option ${p?.statut==='Inactif'?'selected':''}>Inactif</option></select></div>
      </div>
      <div class="form-actions"><button type="button" class="btn secondary" onclick="closeModal()">Annuler</button><button type="submit" class="btn">Enregistrer</button></div>
    </form>`);
}
async function handleSavePersonnel(ev, id){
  ev.preventDefault();
  const fd = new FormData(ev.target);
  const patch = {
    prenom: fd.get('prenom').trim(), nom: fd.get('nom').trim(), poste: fd.get('poste').trim(),
    salaireMensuel: Math.max(0,parseInt(fd.get('salaireMensuel'))||0), telephone: fd.get('telephone').trim(),
    dateEmbauche: fd.get('dateEmbauche')||todayISO(), statut: fd.get('statut'),
  };
  try{
    if(id){
      await dbUpdate('personnel_autre', id, patch);
      const idx = DB.personnelAutre.findIndex(p=>p.id===id);
      DB.personnelAutre[idx] = {...DB.personnelAutre[idx], ...patch};
    } else {
      DB.personnelAutre.push(await dbInsert('personnel_autre', patch));
    }
    closeModal(); toast('Personnel enregistré');
    renderView('comptabilite');
  }catch(e){ alert('Erreur : ' + e.message); }
  return false;
}
async function deletePersonnel(id){
  if(!confirm('Supprimer ce membre du personnel ?')) return;
  try{
    await dbDelete('personnel_autre', id);
    DB.personnelAutre = DB.personnelAutre.filter(p=>p.id!==id);
    DB.paiementsSalaires = DB.paiementsSalaires.filter(p=>!(p.personnelId===id && p.personnelType==='autre'));
    toast('Personnel supprimé');
    renderView('comptabilite');
  }catch(e){ alert('Erreur : ' + e.message); }
}
async function payerSalaire(personnelId, personnelType, mois, montant){
  try{
    const rec = await dbInsert('paiements_salaires', {personnelId, personnelType, mois, montant:parseFloat(montant), datePaiement: todayISO(), modePaiement:'Virement bancaire'});
    DB.paiementsSalaires.push(rec);
    journaliserCompta('paiements_salaires', rec.id, 'creation', null, rec);
    toast('Salaire payé');
    renderView('comptabilite');
    openRecu({type:'sortie', refId:rec.id, montant:rec.montant, date:rec.datePaiement, modePaiement:rec.modePaiement, objet:`Salaire — ${moisLabel(mois)}`, personne: personnelNomById(personnelId, personnelType)});
  }catch(e){ alert('Erreur : ' + e.message); }
}
function reimprimerRecuSalaire(paiementId){
  const p = DB.paiementsSalaires.find(x=>x.id===paiementId);
  if(!p) return;
  openRecu({type:'sortie', refId:p.id, montant:p.montant, date:p.datePaiement, modePaiement:p.modePaiement, objet:`Salaire — ${moisLabel(p.mois)}`, personne: personnelNomById(p.personnelId, p.personnelType)});
}
async function annulerPaiementSalaire(id){
  if(!confirm('Annuler ce paiement de salaire ?')) return;
  try{
    const avant = DB.paiementsSalaires.find(p=>p.id===id) || null;
    await dbDelete('paiements_salaires', id);
    DB.paiementsSalaires = DB.paiementsSalaires.filter(p=>p.id!==id);
    journaliserCompta('paiements_salaires', id, 'suppression', avant, null);
    toast('Paiement annulé');
    renderView('comptabilite');
  }catch(e){ alert('Erreur : ' + e.message); }
}
function openModifierPaiementSalaireForm(paiementId){
  const p = DB.paiementsSalaires.find(x=>x.id===paiementId);
  if(!p) return;
  openModal('Modifier le paiement de salaire', `
    <div class="section-note">✏️ La correction sera enregistrée dans le Journal d'audit, avec le montant avant/après.</div>
${boutonRemplissage('salaire', "SCHEMA_SALAIRE", 'formSalaireModif')}
    <form id="formSalaireModif" onsubmit="return handleModifierPaiementSalaire(event,'${paiementId}')">
      <div class="form-grid">
        <div class="field"><label>Montant (${DEVISE})</label><input type="number" name="montant" min="0" step="1000" required value="${p.montant}"></div>
        <div class="field"><label>Date de paiement</label><input type="date" name="datePaiement" value="${p.datePaiement}"></div>
        <div class="field"><label>Mode de paiement</label><select name="modePaiement">${MODES_PAIEMENT.map(m=>`<option ${p.modePaiement===m?'selected':''}>${m}</option>`).join('')}</select></div>
      </div>
      <div class="form-actions"><button type="button" class="btn secondary" onclick="closeModal()">Annuler</button><button type="submit" class="btn">Enregistrer la correction</button></div>
    </form>`);
}
async function handleModifierPaiementSalaire(ev, paiementId){
  ev.preventDefault();
  const fd = new FormData(ev.target);
  const patch = {montant: Math.max(0, parseInt(fd.get('montant'))||0), datePaiement: fd.get('datePaiement')||todayISO(), modePaiement: fd.get('modePaiement')};
  try{
    const avant = DB.paiementsSalaires.find(x=>x.id===paiementId);
    await dbUpdate('paiements_salaires', paiementId, patch);
    const idx = DB.paiementsSalaires.findIndex(x=>x.id===paiementId);
    const apres = {...avant, ...patch};
    DB.paiementsSalaires[idx] = apres;
    journaliserCompta('paiements_salaires', paiementId, 'modification', avant, apres);
    closeModal(); toast('Paiement corrigé');
    renderView('comptabilite');
  }catch(e){ alert('Erreur : ' + e.message); }
  return false;
}
async function payerToutLePersonnel(mois){
  const personnel = [
    ...DB.enseignants.filter(t=>t.statut==='Actif').map(t=>({id:t.id, type:'enseignant', salaire:t.salaireMensuel||0})),
    ...DB.personnelAutre.filter(p=>p.statut==='Actif').map(p=>({id:p.id, type:'autre', salaire:p.salaireMensuel||0})),
  ];
  const restants = personnel.filter(p=>!DB.paiementsSalaires.some(x=>x.personnelId===p.id && x.personnelType===p.type && x.mois===mois));
  if(restants.length===0){ toast('Tout le personnel est déjà payé pour ce mois'); return; }
  if(!confirm(`Payer ${restants.length} employé(s) pour ${moisLabel(mois)} — total ${fmtFCFA(restants.reduce((s,p)=>s+p.salaire,0))} ?`)) return;
  try{
    const rows = restants.map(p=>({personnelId:p.id, personnelType:p.type, mois, montant:p.salaire, datePaiement: todayISO(), modePaiement:'Virement bancaire'}));
    const inseres = await dbInsertMany('paiements_salaires', rows);
    DB.paiementsSalaires.push(...inseres);
    inseres.forEach(rec => journaliserCompta('paiements_salaires', rec.id, 'creation', null, rec));
    toast('Salaires payés');
    renderView('comptabilite');
  }catch(e){ alert('Erreur : ' + e.message); }
}

/* --- 12.6 Charges & Dépenses --- */
function renderComptaDepenses(){
  const catFilter = ui.filters.comptaCategorie || '';
  ui.filters.comptaCategorie = catFilter;
  const moisFilter = ui.filters.comptaMoisDepenses || 'all';
  ui.filters.comptaMoisDepenses = moisFilter;

  let list = DB.depenses.slice();
  if(catFilter) list = list.filter(d=>d.categorie===catFilter);
  if(moisFilter!=='all') list = list.filter(d=>d.date.slice(0,7)===moisFilter);
  list.sort((a,b)=>b.date.localeCompare(a.date));
  const totalPeriode = list.reduce((s,d)=>s+d.montant,0);
  const loyerCeMois = DB.depenses.find(d=>d.categorie==='Loyer' && d.date.slice(0,7)===thisMonthISO());

  const rows = list.map(d=>`<tr><td>${fmtDate(d.date)}</td><td><span class="badge blue">${d.categorie}</span></td><td>${escapeHtml(d.libelle)}</td><td class="amount out">${fmtFCFA(d.montant)}</td><td>${d.modePaiement}</td>
    <td><button class="icon-btn" title="Reçu" onclick="reimprimerRecuDepense('${d.id}')">🧾</button> <button class="icon-btn danger" onclick="deleteDepense('${d.id}')">🗑️</button></td></tr>`).join('');

  return `
    <div class="cards">
      <div class="card"><div class="num amount out">${fmtFCFA(totalPeriode)}</div><div class="label">Total dépenses (filtre actuel)</div></div>
      <div class="card"><div class="num" style="cursor:pointer;" onclick="openLoyerConfigForm()">${fmtFCFA(DB.meta.loyerMensuel)} ✏️</div><div class="label">Loyer mensuel configuré</div></div>
      <div class="card">
        <div class="num">${loyerCeMois?'✅ Payé':'⏳ En attente'}</div>
        <div class="label">Loyer — ${moisLabel(thisMonthISO())}</div>
        ${!loyerCeMois ? `<button class="btn sm no-print" style="margin-top:8px;" onclick="payerLoyerDuMois()">Enregistrer le paiement</button>` : ''}
      </div>
    </div>
    <div class="panel">
      <div class="panel-head">
        <div><h2>Charges & Dépenses</h2><div class="sub">${list.length} dépense(s) · ${fmtFCFA(totalPeriode)}</div></div>
        <button class="btn" onclick="openDepenseForm()">+ Nouvelle dépense</button>
      </div>
      <div class="filters">
        <select onchange="ui.filters.comptaCategorie=this.value; renderView('comptabilite')"><option value="">Toutes les catégories</option>${CATEGORIES_DEPENSES.map(c=>`<option ${catFilter===c?'selected':''}>${c}</option>`).join('')}</select>
        <select onchange="ui.filters.comptaMoisDepenses=this.value; renderView('comptabilite')"><option value="all" ${moisFilter==='all'?'selected':''}>Tous les mois</option>${lastNMonths(6).map(m=>`<option value="${m}" ${moisFilter===m?'selected':''}>${moisLabel(m)}</option>`).join('')}</select>
      </div>
      ${list.length===0 ? `<div class="empty-state"><div class="em-ic">🏠</div>Aucune dépense pour ces critères.</div>` : `
      <div class="table-wrap"><table><thead><tr><th>Date</th><th>Catégorie</th><th>Libellé</th><th>Montant</th><th>Mode</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`}
    </div>`;
}
function openDepenseForm(id){
  const d = id ? DB.depenses.find(x=>x.id===id) : null;
  openModal(d ? 'Modifier la dépense' : 'Nouvelle dépense', `
    ${boutonRemplissage('depense', 'SCHEMA_DEPENSE', 'formDepense')}
    <form id="formDepense" onsubmit="return handleSaveDepense(event,'${id||''}')">
      <div class="form-grid">
        <div class="field"><label>Catégorie</label><select name="categorie">${CATEGORIES_DEPENSES.map(c=>`<option ${d?.categorie===c?'selected':''}>${c}</option>`).join('')}</select></div>
        <div class="field"><label>Montant (${DEVISE})</label><input type="number" name="montant" min="0" step="500" required value="${d?d.montant:10000}"></div>
        <div class="field span2"><label>Libellé</label><input name="libelle" required value="${d?escapeHtml(d.libelle):''}"></div>
        <div class="field"><label>Date</label><input type="date" name="date" value="${d?d.date:todayISO()}"></div>
        <div class="field"><label>Mode de paiement</label><select name="modePaiement">${MODES_PAIEMENT.map(m=>`<option ${d?.modePaiement===m?'selected':''}>${m}</option>`).join('')}</select></div>
      </div>
      <div class="form-actions"><button type="button" class="btn secondary" onclick="closeModal()">Annuler</button><button type="submit" class="btn">Enregistrer</button></div>
    </form>`);
}
async function handleSaveDepense(ev, id){
  ev.preventDefault();
  const fd = new FormData(ev.target);
  const isNew = !id;
  const patch = {categorie:fd.get('categorie'), libelle:fd.get('libelle').trim(), montant:Math.max(0,parseInt(fd.get('montant'))||0), date:fd.get('date')||todayISO(), modePaiement:fd.get('modePaiement')};
  try{
    let obj;
    if(id){
      const avant = DB.depenses.find(x=>x.id===id) || null;
      await dbUpdate('depenses', id, patch);
      obj = {id, ...patch};
      const idx = DB.depenses.findIndex(x=>x.id===id);
      DB.depenses[idx] = obj;
      journaliserCompta('depenses', id, 'modification', avant, obj);
    } else {
      obj = await dbInsert('depenses', patch);
      DB.depenses.push(obj);
      journaliserCompta('depenses', obj.id, 'creation', null, obj);
    }
    toast('Dépense enregistrée');
    renderView('comptabilite');
    if(isNew) openRecu({type:'sortie', refId:obj.id, montant:obj.montant, date:obj.date, modePaiement:obj.modePaiement, objet:obj.libelle, personne:'—', sousInfo:obj.categorie});
    else closeModal();
  }catch(e){ alert('Erreur : ' + e.message); }
  return false;
}
async function deleteDepense(id){
  if(!confirm('Supprimer cette dépense ?')) return;
  try{
    const avant = DB.depenses.find(d=>d.id===id) || null;
    await dbDelete('depenses', id);
    DB.depenses = DB.depenses.filter(d=>d.id!==id);
    journaliserCompta('depenses', id, 'suppression', avant, null);
    toast('Dépense supprimée');
    renderView('comptabilite');
  }catch(e){ alert('Erreur : ' + e.message); }
}
function reimprimerRecuDepense(id){
  const d = DB.depenses.find(x=>x.id===id);
  if(!d) return;
  openRecu({type:'sortie', refId:d.id, montant:d.montant, date:d.date, modePaiement:d.modePaiement, objet:d.libelle, personne:'—', sousInfo:d.categorie});
}
async function payerLoyerDuMois(){
  try{
    const rec = await dbInsert('depenses', {categorie:'Loyer', libelle:`Loyer mensuel — ${moisLabel(thisMonthISO())}`, montant: DB.meta.loyerMensuel, date: todayISO(), modePaiement:'Virement bancaire'});
    DB.depenses.push(rec);
    journaliserCompta('depenses', rec.id, 'creation', null, rec);
    toast('Loyer enregistré');
    renderView('comptabilite');
    openRecu({type:'sortie', refId:rec.id, montant:rec.montant, date:rec.date, modePaiement:rec.modePaiement, objet:rec.libelle, personne:'—', sousInfo:'Loyer'});
  }catch(e){ alert('Erreur : ' + e.message); }
}
function openLoyerConfigForm(){
  openModal('Configurer le loyer mensuel', `
${boutonRemplissage('loyer', "SCHEMA_LOYER", 'formLoyer')}
    <form id="formLoyer" onsubmit="return handleSaveLoyerConfig(event)">
      <div class="form-grid single"><div class="field"><label>Loyer mensuel (${DEVISE})</label><input type="number" name="loyerMensuel" min="0" step="1000" required value="${DB.meta.loyerMensuel}"></div></div>
      <div class="form-actions"><button type="button" class="btn secondary" onclick="closeModal()">Annuler</button><button type="submit" class="btn">Enregistrer</button></div>
    </form>`);
}
async function handleSaveLoyerConfig(ev){
  ev.preventDefault();
  const fd = new FormData(ev.target);
  const loyerMensuel = Math.max(0, parseInt(fd.get('loyerMensuel'))||0);
  try{
    const { error } = await exigerEffet(sb.from('ecoles').update({ loyer_mensuel: loyerMensuel }).eq('id', session.ecoleId));
    if(error) throw error;
    DB.meta.loyerMensuel = loyerMensuel;
    closeModal(); toast('Loyer mensuel mis à jour');
    renderView('comptabilite');
  }catch(e){ alert('Erreur : ' + e.message); }
  return false;
}

/* ---------------------------------------------------------------------
   12.7 JOURNAL D'AUDIT COMPTABLE (voir journaliserCompta plus haut et
   schema.sql section 24) — qui a créé/modifié/supprimé un mouvement
   financier, et quand. Chargé à la demande (pas au démarrage) car ce
   n'est pas une donnée nécessaire au fonctionnement quotidien.
   --------------------------------------------------------------------- */
let __journalComptaCache = null;
let __journalComptaChargement = false;
async function chargerJournalCompta(){
  if(__journalComptaChargement) return;
  __journalComptaChargement = true;
  try{
    const { data, error } = await sb.from('journal_compta').select('*').order('created_at', {ascending:false}).limit(200);
    if(error) throw error;
    __journalComptaCache = data;
  }catch(e){
    __journalComptaCache = [];
  }finally{
    __journalComptaChargement = false;
    if(ui.currentView==='comptabilite' && ui.filters.comptaTab==='journal') renderView('comptabilite');
  }
}
const LABELS_ACTION_JOURNAL = {creation:'Création', modification:'Modification', suppression:'Suppression'};
const LABELS_TABLE_JOURNAL = {
  paiements_scolarite:'Paiement scolarité', paiements_cotisations:'Cotisation activité',
  ventes_gadgets:'Vente boutique', paiements_salaires:'Salaire', depenses:'Dépense',
};
function renderComptaJournal(){
  if(__journalComptaCache===null){
    chargerJournalCompta();
    return `<div class="panel"><div class="hint" style="text-align:center;padding:40px 10px;">Chargement du journal…</div></div>`;
  }
  const rows = __journalComptaCache.map(j=>{
    const montantAvant = j.donnees_avant?.montant, montantApres = j.donnees_apres?.montant;
    const badgeColor = j.action==='creation' ? 'green' : j.action==='suppression' ? 'red' : 'amber';
    return `<tr>
      <td>${fmtDate(j.created_at.slice(0,10))} <span class="hint">${j.created_at.slice(11,16)}</span></td>
      <td><span class="badge ${badgeColor}">${LABELS_ACTION_JOURNAL[j.action]||j.action}</span></td>
      <td>${LABELS_TABLE_JOURNAL[j.table_cible]||j.table_cible}</td>
      <td>${j.action==='modification' ? `${fmtFCFA(montantAvant||0)} → ${fmtFCFA(montantApres||0)}` : fmtFCFA(montantApres!=null?montantApres:(montantAvant||0))}</td>
      <td>${escapeHtml(j.auteur_nom||'—')} <span class="hint">(${j.auteur_role||'—'})</span></td>
    </tr>`;
  }).join('');
  return `
    <div class="section-note">📜 Historique en lecture seule, immuable : chaque création, modification ou suppression d'un mouvement financier (scolarité, salaires, dépenses) est enregistrée ici automatiquement, avec l'auteur et l'horodatage. Rien ici ne peut être modifié ou effacé.</div>
    <div class="panel">
      <div class="panel-head"><div><h2>Journal d'audit</h2><div class="sub">${__journalComptaCache.length} entrée(s) — 200 plus récentes</div></div></div>
      ${__journalComptaCache.length===0 ? `<div class="empty-state"><div class="em-ic">📜</div>Aucune opération enregistrée pour l'instant.</div>` : `
      <div class="table-wrap"><table><thead><tr><th>Date</th><th>Action</th><th>Mouvement</th><th>Montant</th><th>Par</th></tr></thead><tbody>${rows}</tbody></table></div>`}
    </div>`;
}

/* ---------------------------------------------------------------------
   12.8 MESSAGERIE (notifications automatiques d'absence/retard)
   --------------------------------------------------------------------- */
