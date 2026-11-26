/* =====================================================================
   RAPPORTS ET TÉLÉCHARGEMENTS — tout au même endroit (26/11/2026)
   Demande de Vehi Zoh Junior : « que tous les rapports soient rapidement
   téléchargeables… et ce qu'il faut charger pour faire les remplissages,
   facilement chargeable et remplissable ».
   Chaque carte = un rapport, ses choix (mois, classe, trimestre) et UN
   bouton. Les fonctions d'export existantes sont réutilisées telles
   quelles ; seul le « Rapport général » est nouveau (un classeur Excel
   de plusieurs feuilles : synthèse, effectifs, appels, pointage,
   scolarité, mouvements).
   Les droits restent ceux du serveur : le secrétariat ne télécharge pas
   les salaires ni les dépenses (le serveur ne les lui envoie pas).
   ===================================================================== */
function rapportsFiltres(){
  const f = ui.filters.rapports || (ui.filters.rapports = {});
  const classes = classesVisibles();
  if(!f.mois) f.mois = thisMonthISO();
  if(!f.classeId || !classes.some(c => c.id === f.classeId)) f.classeId = classes[0] ? classes[0].id : '';
  if(!f.trimestre) f.trimestre = TRIMESTRES[0];
  return f;
}
function rapportsChoixMois(){
  const f = rapportsFiltres();
  return `<select class="puce-select" aria-label="Mois" onchange="ui.filters.rapports.mois=this.value; renderView('rapports')">${lastNMonths(12).reverse().map(m => `<option value="${m}"${m === f.mois ? ' selected' : ''}>${moisLabel(m)}</option>`).join('')}</select>`;
}
function rapportsChoixClasse(){
  const f = rapportsFiltres(), classes = classesVisibles();
  if(!classes.length) return '<span class="hint">Aucune classe</span>';
  return choixClasse(classes, f.classeId, "ui.filters.rapports.classeId=this.value; renderView('rapports')");
}
function rapportsChoixTrimestre(){
  const f = rapportsFiltres();
  return `<select class="puce-select" aria-label="Trimestre" onchange="ui.filters.rapports.trimestre=this.value; renderView('rapports')">${TRIMESTRES.map(t => `<option${t === f.trimestre ? ' selected' : ''}>${t}</option>`).join('')}</select>`;
}
function carteRapport(ic, titre, texte, format, choix, bouton){
  return `<article class="rp-carte">
    <div class="rp-tete"><span class="rp-ic" aria-hidden="true">${ic}</span><div><h3>${titre}</h3><p>${texte}</p></div><span class="rp-format">${format}</span></div>
    ${choix ? `<div class="rp-choix">${choix}</div>` : ''}
    <div class="rp-action">${bouton}</div>
  </article>`;
}
const btnRapport = (action, lib, sec) => `<button type="button" class="btn${sec ? ' secondary' : ''}" onclick="${action}">${lib}</button>`;

function renderRapports(){
  const f = rapportsFiltres();
  const admin = ['direction', 'fondation'].includes(ui.role), perso = admin || ui.role === 'secretariat', ens = ui.role === 'enseignant';
  const cartes = [];
  if(perso) cartes.push(carteRapport('📊', 'Rapport général de l’école', `Tout le mois en un seul fichier : synthèse, effectifs par classe, appels, pointage des enseignants, scolarité et impayés${admin ? ', entrées et sorties d’argent' : ''}.`, 'Excel',
    rapportsChoixMois(), btnRapport('exporterRapportGeneral()', '⬇️ Télécharger le rapport général')));
  if(admin) cartes.push(carteRapport('💰', 'Comptabilité du mois', 'Toutes les entrées et sorties du mois (scolarité, activités, boutique, salaires, dépenses), à ouvrir dans Excel ou à donner au comptable.', 'Excel (CSV)',
    rapportsChoixMois(), btnRapport("rapportsCompta()", '⬇️ Télécharger la comptabilité')));
  if(perso) cartes.push(carteRapport('🧾', 'Reçus du mois', 'Tous les reçus de paiement du mois, prêts à imprimer ou à enregistrer en PDF.', 'PDF / impression',
    rapportsChoixMois(), btnRapport("rapportsRecus()", '🖨️ Ouvrir les reçus')));
  if(perso) cartes.push(carteRapport('📒', 'Registre des notes du jour', 'Les notes du jour du secrétariat (rapport mis au propre, validation) et toutes les notes horodatées du mois.', 'Excel',
    rapportsChoixMois(), btnRapport('rnExporterMois(ui.filters.rapports.mois)', '⬇️ Télécharger le registre')));
  if(perso) cartes.push(carteRapport('💵', 'Scolarité : qui a payé, qui doit', 'État de chaque élève (dû, payé, reste, prochaine tranche) + une feuille « Impayés seulement » pour les relances.', 'Excel',
    '', btnRapport('exporterScolariteExcel()', '⬇️ Télécharger l’état de la scolarité')));
  if(perso) cartes.push(carteRapport('🧒', 'Liste des élèves', 'Tous les élèves avec parents et téléphones, une feuille par classe.', 'Excel',
    '', btnRapport('exporterElevesExcel()', '⬇️ Télécharger la liste des élèves')));
  cartes.push(carteRapport('📋', 'Cahier d’appel', 'Présents, absents et retards de la classe pour le mois, avec les totaux par élève.', 'Excel',
    rapportsChoixClasse() + rapportsChoixMois(), btnRapport('rapportsCahierAppel()', '⬇️ Télécharger le cahier d’appel')));
  cartes.push(carteRapport('📝', 'Bulletins de la classe', 'Les bulletins du trimestre, prêts à imprimer ou à enregistrer en PDF.', 'PDF / impression',
    rapportsChoixClasse() + rapportsChoixTrimestre(), btnRapport("imprimerBulletinsClasse(ui.filters.rapports.classeId, ui.filters.rapports.trimestre)", '🖨️ Ouvrir les bulletins')));
  cartes.push(carteRapport('🗓️', 'Emploi du temps', 'L’emploi du temps de la classe, à imprimer et afficher.', 'PDF / impression',
    rapportsChoixClasse(), btnRapport("imprimerEmploiTemps(ui.filters.rapports.classeId)", '🖨️ Ouvrir l’emploi du temps')));
  cartes.push(carteRapport('📈', ens ? 'Mon rapport d’activité' : 'Rapport d’activité des enseignants', ens ? 'Votre travail du mois en clair : appels, devoirs, notes, pointage.' : 'Le travail de chaque enseignant : appels, devoirs, notes, pointage, points forts et points à surveiller.', 'PDF / impression',
    '', btnRapport("go('rapport-activite')", '📈 Ouvrir le rapport d’activité')));
  if(admin) cartes.push(carteRapport('🕘', 'Pointage GPS des enseignants', 'Toutes les arrivées et tous les départs pointés depuis le téléphone, avec la distance à l’école.', 'Excel (CSV)',
    '', btnRapport('exporterPointagesGpsCSV()', '⬇️ Télécharger le pointage')));
  if(admin) cartes.push(carteRapport('📒', 'Grand livre (SYSCOHADA)', 'Écritures débit / crédit pour l’expert-comptable.', 'Excel (CSV)',
    '', btnRapport('exporterGrandLivreSyscohadaCSV()', '⬇️ Télécharger le grand livre')));
  if(admin) cartes.push(carteRapport('💾', 'Sauvegarde complète', 'Toutes les données de l’école dans un seul fichier Excel, à garder en lieu sûr.', 'Excel',
    '', btnRapport('exporterSauvegardeComplete()', '⬇️ Télécharger la sauvegarde')));

  // Ce qu'on CHARGE pour remplir l'application
  const charger = [];
  if(perso) charger.push(carteRapport('🧒', 'Inscrire beaucoup d’élèves d’un coup', 'Téléchargez le modèle Excel, remplissez-le (ou utilisez votre propre liste), puis chargez-le : l’application vérifie tout avant d’enregistrer.', 'Excel',
    '', btnRapport('telechargerModeleImport()', '⬇️ Modèle vide', true) + btnRapport('ouvrirImportEleves()', '⬆️ Charger la liste')));
  if(perso) charger.push(carteRapport('💵', 'Versements déjà reçus (cahier de caisse)', 'Une photo du cahier de caisse de la classe (ou un PDF, un Excel) suffit : les montants lus sont proposés, vous vérifiez, puis vous enregistrez.', 'Photo / PDF / Excel',
    rapportsChoixClasse(), btnRapport("ouvrirRepriseVersements(ui.filters.rapports.classeId)", '📷 Charger le cahier de caisse')));
  if(perso) charger.push(carteRapport('🗓️', 'Emploi du temps à partir d’une photo', 'Photographiez l’emploi du temps papier de la classe : il est rempli automatiquement, vous corrigez si besoin.', 'Photo',
    rapportsChoixClasse(), btnRapport("ouvrirRemplissageEdt(ui.filters.rapports.classeId)", '📷 Charger l’emploi du temps')));
  if(admin) charger.push(carteRapport('🕘', 'Horaires de l’école', 'Heures d’entrée, pauses et sortie : à partir d’une photo ou d’un texte.', 'Photo / texte',
    '', btnRapport('ouvrirRemplissageHoraires()', '📷 Remplir les horaires')));
  if(ens) charger.push(carteRapport('📝', 'Notes de la classe', 'Saisissez ou chargez les notes depuis l’écran des compositions (photo de la feuille de notes acceptée).', 'Photo / saisie',
    '', btnRapport("go('notes')", '📝 Ouvrir les compositions')));

  return `
    <div class="rp-intro panel"><strong>Tout ce que vous pouvez télécharger ou charger, au même endroit.</strong>
      <span class="hint">Choisissez le mois ou la classe sur la carte, puis touchez le bouton. Les fichiers Excel s’ouvrent aussi sur téléphone (Excel, Google Sheets, WPS).</span></div>
    <h2 class="rp-titre">⬇️ Télécharger un rapport</h2>
    <div class="rp-grille">${cartes.join('')}</div>
    ${charger.length ? `<h2 class="rp-titre">⬆️ Charger pour remplir l’application</h2><div class="rp-grille">${charger.join('')}</div>` : ''}`;
}

function rapportsCompta(){
  const avant = ui.filters.comptaPeriode;
  ui.filters.comptaPeriode = ui.filters.rapports.mois;
  try{ exporterComptabiliteCSV(); } finally { ui.filters.comptaPeriode = avant; }
}
async function rapportsCahierAppel(){
  const avant = ui.filters.cahier;
  ui.filters.cahier = { classeId: ui.filters.rapports.classeId, mois: ui.filters.rapports.mois };
  try{ await exporterCahierAppel(); } finally { ui.filters.cahier = avant; }
}

/* ---------- Rapport général (Excel, plusieurs feuilles) ---------- */
async function exporterRapportGeneral(){
  const mois = rapportsFiltres().mois, admin = ['direction', 'fondation'].includes(ui.role);
  try{
    toast('Préparation du rapport…');
    const dans = d => typeof d === 'string' && d.startsWith(mois);
    const actifs = DB.eleves.filter(e => e.statut === 'Actif');
    const jours = joursDeClasseDuMois(mois).filter(j => j <= todayISO());   // jours déjà passés seulement
    // Effectifs
    const effectifs = [['Classe', 'Élèves', 'Filles', 'Garçons', 'Parents reliés à l’application']];
    const relies = new Set((DB.parentsEleves || []).map(pe => pe.eleveId));
    DB.classes.forEach(c => { const el = actifs.filter(e => e.classeId === c.id);
      effectifs.push([c.nom, el.length, el.filter(e => e.sexe === 'F').length, el.filter(e => e.sexe === 'M').length, el.filter(e => relies.has(e.id)).length]); });
    effectifs.push([], ['TOTAL', actifs.length, actifs.filter(e => e.sexe === 'F').length, actifs.filter(e => e.sexe === 'M').length, actifs.filter(e => relies.has(e.id)).length]);
    // Appels du mois
    const presMois = (DB.presencesEleves || []).filter(p => dans(p.date));
    const appels = [['Classe', 'Jours de classe', 'Jours où l’appel est fait', 'Absences', 'Retards', 'Taux de présence']];
    DB.classes.forEach(c => { const ids = new Set(actifs.filter(e => e.classeId === c.id).map(e => e.id)); const ps = presMois.filter(p => ids.has(p.eleveId));
      const faits = new Set(ps.map(p => p.date)).size, abs = ps.filter(p => p.statut === 'Absent').length, ret = ps.filter(p => p.statut === 'Retard').length;
      appels.push([c.nom, jours.length, faits, abs, ret, ps.length ? Math.round(100 * (ps.length - abs) / ps.length) + ' %' : '—']); });
    // Élèves souvent absents
    const absParEleve = {}; presMois.filter(p => p.statut === 'Absent').forEach(p => { absParEleve[p.eleveId] = (absParEleve[p.eleveId] || 0) + 1; });
    const absents = [['Élève', 'Classe', 'Absences du mois', 'Parent', 'Téléphone']].concat(Object.entries(absParEleve).filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1])
      .map(([id, n]) => { const e = eleveById(id) || {}; return [eleveFullName(e), classeName(e.classeId), n, e.parentNom || '', e.parentTel || '']; }));
    // Pointage des enseignants
    const pointMois = (DB.presencesEnseignants || []).filter(p => dans(p.date));
    const pointage = [['Enseignant', 'Jours pointés', 'Retards', 'Minutes de retard', 'Absences']];
    (DB.enseignants || []).forEach(t => { const ps = pointMois.filter(p => p.enseignantId === t.id);
      pointage.push([ensFullName(t), ps.filter(p => p.statut !== 'Absent').length, ps.filter(p => p.statut === 'Retard').length, ps.reduce((s, p) => s + (Number(p.minutesRetard) || 0), 0), ps.filter(p => p.statut === 'Absent').length]); });
    // Scolarité
    const scol = [['Classe', 'Élève', 'Parent', 'Téléphone', 'Dû', 'Payé', 'Reste', 'Statut']];
    let du = 0, paye = 0;
    DB.classes.forEach(c => actifs.filter(e => e.classeId === c.id).sort((a, b) => a.nom.localeCompare(b.nom)).forEach(e => {
      const g = scolariteEleveParEcheance(e.id), info = scolariteEleveInfo(e.id);
      const d = g.total || info.du, p = g.total ? g.totalPaye : info.paye, r = Math.max(0, d - p); du += d; paye += p;
      scol.push([c.nom, eleveFullName(e), e.parentNom || '', e.parentTel || '', d, p, r, r <= 0 && d > 0 ? 'Soldé' : p > 0 ? 'Partiel' : 'Impayé']); }));
    scol.push([], ['TOTAL', '', '', '', du, paye, Math.max(0, du - paye)]);
    // Mouvements d'argent du mois
    const mouv = [['Date', 'Type', 'Catégorie', 'Libellé', 'Montant (F CFA)', 'Mode']];
    let entrees = 0, sorties = 0;
    (DB.paiementsScolarite || []).filter(p => dans(p.date)).forEach(p => { entrees += Number(p.montant) || 0; mouv.push([fmtDate(p.date), 'Entrée', 'Scolarité', `${p.tranche || ''} — ${eleveFullName(eleveById(p.eleveId) || { prenom: '—', nom: '' })}`, Number(p.montant) || 0, p.modePaiement || '']); });
    (DB.paiementsCotisations || []).filter(p => dans(p.date)).forEach(p => { entrees += Number(p.montant) || 0; const a = (DB.activites || []).find(x => x.id === p.activiteId); mouv.push([fmtDate(p.date), 'Entrée', 'Activité', `${a ? a.nom : '—'} — ${eleveFullName(eleveById(p.eleveId) || { prenom: '—', nom: '' })}`, Number(p.montant) || 0, p.modePaiement || '']); });
    if(admin){
      (DB.paiementsSalaires || []).filter(p => dans(p.datePaiement)).forEach(p => { sorties += Number(p.montant) || 0; mouv.push([fmtDate(p.datePaiement), 'Sortie', 'Salaire', `${personnelNomById(p.personnelId, p.personnelType)} — ${moisLabel(p.mois)}`, Number(p.montant) || 0, p.modePaiement || '']); });
      (DB.depenses || []).filter(d => dans(d.date)).forEach(d => { sorties += Number(d.montant) || 0; mouv.push([fmtDate(d.date), 'Sortie', d.categorie || '', d.libelle || '', Number(d.montant) || 0, d.modePaiement || '']); });
    }
    // Synthèse (première feuille)
    const m = DB.meta || {};
    const synthese = [
      [`${m.nomEcole || 'École'} — Rapport général`], [`Mois : ${moisLabel(mois)}`, '', `Préparé le ${fmtDate(todayISO())}`], [],
      ['ÉLÈVES'], ['Élèves inscrits (actifs)', actifs.length], ['Parents reliés à l’application', actifs.filter(e => relies.has(e.id)).length],
      [], ['APPEL'], ['Jours de classe dans le mois', jours.length], ['Absences enregistrées', presMois.filter(p => p.statut === 'Absent').length], ['Retards enregistrés', presMois.filter(p => p.statut === 'Retard').length], ['Élèves absents 2 fois ou plus', absents.length - 1],
      [], ['ENSEIGNANTS'], ['Enseignants', (DB.enseignants || []).length], ['Retards au pointage', pointMois.filter(p => p.statut === 'Retard').length], ['Absences au pointage', pointMois.filter(p => p.statut === 'Absent').length],
      [], ['SCOLARITÉ (année en cours)'], ['Total dû', du], ['Total payé', paye], ['Reste à recouvrer', Math.max(0, du - paye)], ['Taux de recouvrement', du ? Math.round(100 * paye / du) + ' %' : '—'],
      [], ['ARGENT DU MOIS'], ['Entrées', entrees], ...(admin ? [['Sorties', sorties], ['Solde du mois', entrees - sorties]] : []),
    ];
    const feuilles = [['Synthèse', synthese], ['Effectifs', effectifs], ['Appels du mois', appels], ['Élèves souvent absents', absents], ['Pointage enseignants', pointage], ['Scolarité', scol], ['Mouvements du mois', mouv]];
    await ecrireClasseurExcel(feuilles, nomFichierExport('rapport-general-' + mois));
    toast('Rapport général prêt ✔');
  }catch(e){ alert('Rapport impossible : ' + e.message); }
}
function rapportsRecus(){
  const avant = ui.filters.soucheClasse;
  ui.filters.soucheClasse = '';   // toute l'école (le filtre de classe de l'écran Comptabilité ne s'applique pas ici)
  try{ imprimerRecusGroupes(ui.filters.rapports.mois); } finally { ui.filters.soucheClasse = avant; }
}
