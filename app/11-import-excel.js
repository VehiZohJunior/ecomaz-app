/* ---------------------------------------------------------------------
   IMPORT DES ÉLÈVES DEPUIS EXCEL (.xlsx, .xls ou .csv)
   Pour installer une école en quelques minutes. La bibliothèque SheetJS
   (gratuite) n'est chargée qu'à l'ouverture de l'import. Rien n'est
   enregistré avant l'aperçu et la confirmation ; les doublons (même nom,
   prénom et date de naissance) sont ignorés.
   --------------------------------------------------------------------- */
const XLSX_URL = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';
let importEleves = null;   // { lignes:[{patch, erreurs, avertissements}], nomFichier }
function chargerXLSX(){
  if(window.XLSX) return Promise.resolve(window.XLSX);
  return new Promise((ok, ko) => {
    const sc = scriptSur(XLSX_URL); sc.onload = () => ok(window.XLSX);
    sc.onerror = () => ko(new Error('Connexion internet nécessaire pour lire un fichier Excel.'));
    document.head.appendChild(sc);
  });
}
const COLONNES_IMPORT = [
  { cle:'nom', titre:'Nom', alias:['nom','nom de famille','nom eleve','nom de l eleve'] },
  { cle:'prenom', titre:'Prénoms', alias:['prenom','prenoms','prenom s'] },
  { cle:'sexe', titre:'Sexe (M/F)', alias:['sexe','genre','sexe m f'] },
  { cle:'dateNaissance', titre:'Date de naissance', alias:['date de naissance','naissance','ne le','nee le','date naissance','ne e le'] },
  { cle:'classe', titre:'Classe', alias:['classe','niveau'] },
  { cle:'parentNom', titre:'Nom du parent', alias:['nom du parent','parent','nom parent','tuteur','nom du tuteur','parent tuteur'] },
  { cle:'parentTel', titre:'Téléphone du parent', alias:['telephone du parent','telephone','tel','contact','telephone parent','tel parent','numero','contact parent'] },
  { cle:'parentAdresse', titre:'Adresse', alias:['adresse','lieu d habitation','domicile','quartier'] },
  { cle:'dateInscription', titre:'Date d’inscription', alias:['date d inscription','inscription','date inscription','inscrit le'] },
];
function simplifierTexte(t){
  return String(t ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
function dateImportISO(v){
  const iso = dateImportBrute(v);
  if(!iso || iso === 'invalide') return iso;
  const [a, m, j] = iso.split('-').map(Number), d = new Date(a, m - 1, j);   // refuse 31/02, 13e mois…
  return d.getFullYear() === a && d.getMonth() === m - 1 && d.getDate() === j && a > 1900 ? iso : 'invalide';
}
function dateImportBrute(v){
  if(v == null || v === '') return '';
  if(v instanceof Date && !isNaN(v)) return `${v.getFullYear()}-${String(v.getMonth()+1).padStart(2,'0')}-${String(v.getDate()).padStart(2,'0')}`;
  const t = String(v).trim();
  let m = t.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})$/);
  if(m) return `${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;
  m = t.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{2}|\d{4})$/);   // JJ/MM/AAAA (usage ivoirien)
  if(m){ const an = m[3].length === 2 ? (Number(m[3]) > 50 ? '19' : '20') + m[3] : m[3]; return `${an}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`; }
  return 'invalide';
}
function sexeImport(v){
  const t = simplifierTexte(v);
  if(['m','masculin','garcon','g','homme','h'].includes(t)) return 'M';
  if(['f','feminin','fille','femme'].includes(t)) return 'F';
  return '';
}
function ouvrirImportEleves(){
  importEleves = null;
  openModal('Importer des élèves depuis Excel', `
    <ol class="hint" style="padding-left:18px;margin-top:0;">
      <li>Téléchargez le modèle, ou utilisez votre propre fichier : la 1<sup>re</sup> ligne doit contenir les titres des colonnes (Nom, Prénoms, Sexe, Date de naissance, Classe, Nom du parent, Téléphone du parent…).</li>
      <li>Les classes doivent porter le même nom que dans EcoMaZ (${escapeHtml(DB.classes.slice(0,4).map(c=>c.nom).join(', '))}${DB.classes.length>4?'…':''}).</li>
      <li>Choisissez le fichier : un aperçu s'affiche, rien n'est enregistré avant votre confirmation.</li>
    </ol>
    <div class="form-actions" style="flex-wrap:wrap;justify-content:flex-start;">
      <button type="button" class="btn secondary" onclick="telechargerModeleImport()">⬇️ Télécharger le modèle</button>
      <label class="btn" style="cursor:pointer;">📄 Choisir le fichier Excel
        <input type="file" accept=".xlsx,.xls,.csv" style="display:none;" onchange="lireFichierImport(this.files[0])">
      </label>
    </div>
    <div id="importApercu"></div>`);
}
// --- Exports Excel (gratuits, produits sur l'appareil) ---
function nomFichierExport(sujet){ return `${simplifierTexte(DB.meta?.nomEcole || 'ecole').replace(/ /g, '-')}-${sujet}-${todayISO()}.xlsx`; }
/* ---------- Sauvegarde complète (Excel) — direction / fondation ----------
   Utilise uniquement les données déjà chargées dans l'application (aucune
   nouvelle requête) ; identifiants internes remplacés par des noms lisibles. */
const SAUVEGARDE_FEUILLES = [
  ['Élèves', 'eleves'], ['Classes', 'classes'], ['Enseignants', 'enseignants'], ['Personnel', 'personnelAutre'],
  ['Paiements scolarité', 'paiementsScolarite'], ['Échéances', 'echeancesScolarite'], ['Activités', 'activites'],
  ['Inscriptions activités', 'inscriptionsActivites'], ['Cotisations', 'paiementsCotisations'], ['Boutique', 'gadgets'],
  ['Ventes boutique', 'ventesGadgets'], ['Salaires', 'paiementsSalaires'], ['Dépenses', 'depenses'],
  ['Présences élèves', 'presencesEleves'], ['Présences enseignants', 'presencesEnseignants'], ['Notes', 'notes'],
  ['Emploi du temps', 'emploiTemps'], ['Programmes', 'programmes'], ['Agenda', 'agenda'], ['Devoirs', 'devoirs'],
  ['Parents reliés', 'parentsEleves'], ['Messages', 'messages'],
];
const SAUVEGARDE_EXCLUS = new Set(['id', 'ecoleId', 'createdBy', 'traitePar', 'userId', 'auteurId']);
function libelleColonne(cle){
  const noms = { classeId:'Classe', eleveId:'Élève', enseignantId:'Enseignant', parentProfileId:'Compte parent', classeIds:'Classes', classesAssignees:'Classes',
    prenom:'Prénom', parentNom:'Nom du parent', parentTel:'Téléphone du parent', parentAdresse:'Adresse du parent', dateNaissance:'Date de naissance',
    dateInscription:'Date d’inscription', dateEmbauche:'Date d’embauche', telephone:'Téléphone', modePaiement:'Mode de paiement', matieres:'Matières', matiere:'Matière', createdAt:'Créé le' };
  if(noms[cle]) return noms[cle];
  const t = cle.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
  return t.charAt(0).toUpperCase() + t.slice(1);
}
function valeurLisible(cle, v){
  if(v == null) return '';
  if(cle === 'classeId') return classeName(v);
  if(cle === 'eleveId'){ const e = eleveById(v); return e ? eleveFullName(e) : v; }
  if(cle === 'enseignantId'){ const t = enseignantById(v); return t ? ensFullName(t) : v; }
  if(cle === 'parentProfileId'){ const p = (DB.profiles || []).find(x => x.id === v); return p ? (p.nomComplet || '') : v; }
  if(Array.isArray(v)) return (cle === 'classeIds' || cle === 'classesAssignees') ? v.map(classeName).join(', ') : v.join(', ');
  if(typeof v === 'object') return JSON.stringify(v);
  return v;
}
async function exporterSauvegardeComplete(){
  if(!['direction','fondation'].includes(ui.role)) return;
  const feuilles = [];
  for(const [nom, cle] of SAUVEGARDE_FEUILLES){
    const lignes = Array.isArray(DB[cle]) ? DB[cle] : [];
    if(!lignes.length) continue;
    const ordre = ['matricule', 'nom', 'prenom', 'eleveId', 'enseignantId', 'classeId', 'date', 'montant', 'statut'];
    const rang = k => { const i = ordre.indexOf(k); return i < 0 ? ordre.length : i; };
    const colonnes = [...new Set(lignes.flatMap(l => Object.keys(l)))].filter(k => !SAUVEGARDE_EXCLUS.has(k)).sort((a, b) => rang(a) - rang(b));
    feuilles.push([nom.slice(0, 31), [colonnes.map(libelleColonne), ...lignes.map(l => colonnes.map(k => valeurLisible(k, l[k])))]]);
  }
  if(!feuilles.length) return toast('Aucune donnée à sauvegarder pour l’instant.');
  const nomEcole = String(DB.meta?.nomEcole || 'ecole').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '');
  try{
    await ecrireClasseurExcel(feuilles, `Sauvegarde-${nomEcole}-${todayISO()}.xlsx`);
    toast(`Sauvegarde téléchargée : ${feuilles.length} feuilles`);
  }catch(err){ alert('Sauvegarde impossible : ' + err.message); }
}
async function ecrireClasseurExcel(feuilles, nomFichier){
  const X = await chargerXLSX();
  const classeur = X.utils.book_new();
  for(const [nom, lignes] of feuilles){
    const f = X.utils.aoa_to_sheet(lignes);
    f['!cols'] = (lignes[0] || []).map((_, i) => ({ wch: Math.min(40, Math.max(10, ...lignes.map(l => String(l[i] ?? '').length + 2))) }));
    X.utils.book_append_sheet(classeur, f, nom.slice(0, 31));
  }
  X.writeFile(classeur, nomFichier);
}
async function exporterElevesExcel(){
  try{
    const relies = new Set((DB.parentsEleves || []).map(pe => pe.eleveId));
    const eleves = DB.eleves.slice().sort((a, b) => classeName(a.classeId).localeCompare(classeName(b.classeId)) || a.nom.localeCompare(b.nom));
    const lignes = [['Matricule','Nom','Prénoms','Sexe','Date de naissance','Classe','Statut','Date d’inscription','Parent / tuteur','Téléphone du parent','Adresse','Renforcement','Parent relié dans l’application']]
      .concat(eleves.map(e => [e.matricule || '', e.nom, e.prenom, e.sexe || '', e.dateNaissance ? fmtDate(e.dateNaissance) : '', classeName(e.classeId), e.statut || '',
        e.dateInscription ? fmtDate(e.dateInscription) : '', e.parentNom || '', e.parentTel || '', e.parentAdresse || '', e.renforcement ? 'Oui' : 'Non', relies.has(e.id) ? 'Oui' : 'Non']));
    // Une feuille par classe en plus de la liste complète
    const parClasse = DB.classes.map(c => [c.nom, [lignes[0]].concat(lignes.slice(1).filter(l => l[5] === c.nom))]).filter(([, l]) => l.length > 1);
    await ecrireClasseurExcel([['Tous les élèves', lignes], ...parClasse], nomFichierExport('eleves'));
    toast(`${eleves.length} élève(s) exporté(s)`);
  }catch(e){ alert('Erreur : ' + e.message); }
}
async function exporterScolariteExcel(){
  try{
    const lignes = [['Classe','Matricule','Élève','Parent','Téléphone','Scolarité due','Payé','Reste à payer','Prochaine tranche','Date limite','Statut']];
    let totDu = 0, totPaye = 0;
    DB.classes.forEach(c => {
      DB.eleves.filter(e => e.classeId === c.id && e.statut === 'Actif').sort((a, b) => a.nom.localeCompare(b.nom)).forEach(e => {
        const g = scolariteEleveParEcheance(e.id), info = scolariteEleveInfo(e.id);
        const du = g.total || info.du, paye = g.total ? g.totalPaye : info.paye, reste = Math.max(0, du - paye);
        const proch = g.detail.find(d => d.statut !== 'paye'), ech = proch ? echeancesDeClasse(c.id).find(x => x.label === proch.label) : null;
        totDu += du; totPaye += paye;
        lignes.push([c.nom, e.matricule || '', eleveFullName(e), e.parentNom || '', e.parentTel || '', du, paye, reste, proch ? proch.label : '', ech?.dateEcheance ? fmtDate(ech.dateEcheance) : '',
          reste <= 0 && du > 0 ? 'Soldé' : paye > 0 ? 'Partiel' : 'Impayé']);
      });
    });
    lignes.push([], ['TOTAL', '', '', '', '', totDu, totPaye, Math.max(0, totDu - totPaye)]);
    const impayes = [lignes[0]].concat(lignes.slice(1).filter(l => l.length > 10 && l[7] > 0));
    await ecrireClasseurExcel([['État de la scolarité', lignes], ['Impayés seulement', impayes]], nomFichierExport('scolarite'));
    toast('Export de la scolarité prêt');
  }catch(e){ alert('Erreur : ' + e.message); }
}
async function telechargerModeleImport(){
  try{
    const X = await chargerXLSX();
    const ex = DB.classes[0]?.nom || 'CP1';
    const feuille = X.utils.aoa_to_sheet([COLONNES_IMPORT.map(c => c.titre),
      ['KOUASSI', 'Jean Daniel', 'M', '15/03/2018', ex, 'KOUASSI Marc', '0701020304', 'Cocody', '']]);
    feuille['!cols'] = COLONNES_IMPORT.map(() => ({ wch: 20 }));
    const classeur = X.utils.book_new();
    X.utils.book_append_sheet(classeur, feuille, 'Élèves');
    X.writeFile(classeur, 'modele-import-eleves-ecomaz.xlsx');
  }catch(e){ alert('Erreur : ' + e.message); }
}
async function lireFichierImport(fichier){
  if(!fichier) return;
  const zone = document.getElementById('importApercu');
  zone.innerHTML = '<div class="hint">Lecture du fichier…</div>';
  try{
    const X = await chargerXLSX();
    const classeur = X.read(await fichier.arrayBuffer(), { cellDates:true });
    const feuille = classeur.Sheets[classeur.SheetNames[0]];
    const tableau = X.utils.sheet_to_json(feuille, { header:1, raw:true, defval:'' })
      .filter(l => l.some(c => String(c).trim() !== ''));
    if(tableau.length < 2) throw new Error('Le fichier ne contient aucune ligne d’élève sous les titres.');
    // Repérer les colonnes d'après les titres de la 1re ligne
    const titres = tableau[0].map(simplifierTexte);
    const index = {};
    COLONNES_IMPORT.forEach(c => { const i = titres.findIndex(t => c.alias.includes(t)); if(i >= 0) index[c.cle] = i; });
    const manquantes = ['nom','prenom','classe'].filter(k => index[k] === undefined);
    if(manquantes.length) throw new Error('Colonnes introuvables : ' + manquantes.map(k => COLONNES_IMPORT.find(c=>c.cle===k).titre).join(', ') + '. Vérifiez la 1re ligne du fichier.');
    const classesParNom = {};
    DB.classes.forEach(c => classesParNom[simplifierTexte(c.nom)] = c);
    const existants = new Set(DB.eleves.map(e => simplifierTexte(`${e.nom} ${e.prenom} ${e.dateNaissance||''}`)));
    const vus = new Set();
    const val = (l, k) => index[k] === undefined ? '' : l[index[k]];
    const lignes = tableau.slice(1).map((l, n) => {
      const erreurs = [], avertissements = [];
      const nom = String(val(l,'nom')).trim().toUpperCase(), prenom = String(val(l,'prenom')).trim();
      const classe = classesParNom[simplifierTexte(val(l,'classe'))];
      const dateNaissance = dateImportISO(val(l,'dateNaissance'));
      let dateInscription = dateImportISO(val(l,'dateInscription'));
      if(!nom || !prenom) erreurs.push('nom ou prénom manquant');
      if(!classe) erreurs.push(`classe « ${String(val(l,'classe')).trim() || 'vide'} » inconnue`);
      if(dateNaissance === 'invalide') erreurs.push('date de naissance illisible');
      if(dateInscription === 'invalide'){ avertissements.push('date d’inscription illisible : aujourd’hui'); dateInscription = ''; }
      const sexe = sexeImport(val(l,'sexe'));
      if(!sexe) avertissements.push('sexe non précisé');
      const patch = {
        matricule: null, nom, prenom, sexe: sexe || 'M', classeId: classe?.id || '', statut: 'Actif',
        dateNaissance: dateNaissance === 'invalide' ? null : (dateNaissance || null),
        dateInscription: dateInscription || todayISO(),
        parentNom: String(val(l,'parentNom')).trim(), parentTel: String(val(l,'parentTel')).trim(), parentAdresse: String(val(l,'parentAdresse')).trim(),
      };
      if(!erreurs.length){
        const erreurDate = verifierDatesEleve(patch.dateNaissance, patch.dateInscription);
        if(erreurDate) avertissements.push('date de naissance à vérifier');
        if(!patch.parentTel) avertissements.push('pas de numéro de parent');
        else if(!numerosParentValides(patch.parentTel)) avertissements.push('numéro du parent à vérifier');
        const cle = simplifierTexte(`${nom} ${prenom} ${patch.dateNaissance}`);
        if(existants.has(cle)) erreurs.push('déjà inscrit dans EcoMaZ');
        else if(vus.has(cle)) erreurs.push('en double dans le fichier');
        vus.add(cle);
      }
      return { ligne: n + 2, patch, erreurs, avertissements };
    });
    importEleves = { lignes, nomFichier: fichier.name };
    afficherApercuImport();
  }catch(e){ zone.innerHTML = `<div class="hint" style="color:var(--danger);">Erreur : ${escapeHtml(e.message)}</div>`; }
}
function afficherApercuImport(){
  const { lignes } = importEleves;
  const bonnes = lignes.filter(l => !l.erreurs.length);
  document.getElementById('importApercu').innerHTML = `
    <p><strong>${bonnes.length}</strong> élève(s) prêt(s) à importer${lignes.length - bonnes.length ? `, <strong>${lignes.length - bonnes.length}</strong> ligne(s) ignorée(s)` : ''}.</p>
    <div class="table-wrap" style="max-height:320px;overflow:auto;"><table>
      <thead><tr><th>Ligne</th><th>Élève</th><th>Classe</th><th>Remarques</th></tr></thead>
      <tbody>${lignes.map(l => `<tr>
        <td>${l.ligne}</td>
        <td>${escapeHtml(`${l.patch.nom} ${l.patch.prenom}`.trim() || '—')}</td>
        <td>${escapeHtml(l.patch.classeId ? classeName(l.patch.classeId) : '—')}</td>
        <td>${l.erreurs.map(x => `<span class="badge red" style="margin:1px;">${escapeHtml(x)}</span>`).join(' ')}
            ${l.avertissements.map(x => `<span class="badge amber" style="margin:1px;">${escapeHtml(x)}</span>`).join(' ')}
            ${!l.erreurs.length && !l.avertissements.length ? '<span class="badge green">OK</span>' : ''}</td>
      </tr>`).join('')}</tbody>
    </table></div>
    <div class="hint">En rouge : ligne ignorée. En orange : importée, à compléter ensuite (elle apparaîtra dans « Fiches à vérifier »).</div>
    <div class="form-actions">
      <button type="button" class="btn secondary" onclick="closeModal()">Annuler</button>
      ${bonnes.length ? `<button type="button" class="btn" id="btnLancerImport" onclick="lancerImportEleves()">Importer ${bonnes.length} élève(s)</button>` : ''}
    </div>`;
}
async function lancerImportEleves(){
  const bouton = document.getElementById('btnLancerImport');
  const aImporter = importEleves.lignes.filter(l => !l.erreurs.length);
  if(!confirm(`Importer ${aImporter.length} élève(s) dans EcoMaZ ?`)) return;
  bouton.disabled = true;
  let faits = 0, echecs = 0;
  // Matricule de départ lu une seule fois sur le serveur, puis +1 à chaque élève
  // (en cas de conflit, insererAvecMatricule reprend le numéro suivant).
  let numero = parseInt((await prochainMatricule('eleves', 'EL-', 4)).replace('EL-', ''), 10);
  for(const l of aImporter){
    bouton.textContent = `Import en cours… ${faits + echecs + 1} / ${aImporter.length}`;
    l.patch.matricule = 'EL-' + String(numero).padStart(4, '0');
    try{
      const cree = await insererAvecMatricule('eleves', l.patch, 'EL-', 4);
      DB.eleves.push(cree);
      numero = parseInt(String(cree.matricule).replace('EL-', ''), 10) + 1;
      faits++;
    }catch(e){ echecs++; l.erreurs.push('échec : ' + e.message); }
  }
  closeModal();
  renderView('eleves');
  toast(`${faits} élève(s) importé(s)` + (echecs ? ` · ${echecs} échec(s)` : ''));
  if(echecs) alert(`${echecs} élève(s) n'ont pas pu être importés. Réessayez l'import : les élèves déjà importés seront ignorés.`);
}
// Fiches à vérifier : l'école voit elle-même ce qui empêche l'application de
// bien fonctionner (date impossible, numéro de parent manquant ou mal saisi,
// qui ferait échouer le bouton WhatsApp). Élèves actifs uniquement.
function numerosParentValides(tel){
  const morceaux = String(tel || '').split(/\s*[\/;,|]\s*|\s+-\s+|\s+et\s+/i)
    .map(m => m.replace(/\D/g, '').replace(/^225/, '')).filter(m => m.length);
  return morceaux.length > 0 && morceaux.every(m => m.length === 10);
}
// Âges habituels par cycle (en années, à la date du jour) : au-delà, la date de naissance mérite un coup d'œil
const AGES_CYCLE = { 'Garderie':[0, 4], 'Maternelle':[2, 7], 'Primaire':[5, 15], 'Collège':[10, 19], 'Lycée':[13, 23] };
function ageEnAnnees(iso){
  const n = new Date(iso + 'T12:00:00'), a = new Date(todayISO() + 'T12:00:00');
  let age = a.getFullYear() - n.getFullYear();
  if(a.getMonth() < n.getMonth() || (a.getMonth() === n.getMonth() && a.getDate() < n.getDate())) age--;
  return age;
}
// Doublons possibles : même nom et même prénom (accents et majuscules ignorés) parmi les élèves actifs
function doublonsEleves(){
  const groupes = {};
  DB.eleves.filter(e => e.statut === 'Actif').forEach(e => {
    const cle = simplifierTexte(`${e.nom} ${e.prenom}`); (groupes[cle] = groupes[cle] || []).push(e);
  });
  const res = {};
  Object.values(groupes).filter(g => g.length > 1).forEach(g => g.forEach(e => { res[e.id] = g.filter(x => x.id !== e.id); }));
  return res;
}
function problemesFicheEleve(e, doublons){
  const p = [];
  const erreurDate = verifierDatesEleve(e.dateNaissance, e.dateInscription);
  if(!e.dateNaissance) p.push('date de naissance manquante');
  else if(erreurDate) p.push('date de naissance impossible');
  if(e.dateInscription && e.dateInscription > todayISO()) p.push('date d’inscription dans le futur');
  if(!String(e.parentTel || '').trim()) p.push('numéro du parent manquant');
  else if(!numerosParentValides(e.parentTel)) p.push('numéro du parent à vérifier (10 chiffres attendus)');
  if(!String(e.parentNom || '').trim()) p.push('nom du parent manquant');
  if(e.dateNaissance && !erreurDate){
    const c = DB.classes.find(x => x.id === e.classeId), plage = c && AGES_CYCLE[c.cycle];
    const age = ageEnAnnees(e.dateNaissance);
    if(plage && (age < plage[0] || age > plage[1])) p.push(`${age < 1 ? 'moins d’1 an' : age + ' an' + (age > 1 ? 's' : '')} : âge inhabituel en ${c.nom} — date de naissance à vérifier`);
  }
  const autres = doublons && doublons[e.id];
  if(autres && autres.length) p.push(`doublon possible avec ${autres.map(x => `${eleveFullName(x)} (${classeName(x.classeId)}${x.dateNaissance ? ', né(e) le ' + fmtDate(x.dateNaissance) : ''})`).join(', ')} — vérifier avant toute action`);
  return p;
}
function renderFichesAVerifier(){
  if(!['secretariat','direction','fondation'].includes(ui.role)) return '';
  const doublons = doublonsEleves();
  const fiches = DB.eleves.filter(e => e.statut === 'Actif')
    .map(e => ({ e, p: problemesFicheEleve(e, doublons) })).filter(x => x.p.length)
    .sort((a, b) => a.e.nom.localeCompare(b.e.nom));
  if(fiches.length === 0) return '';
  const ouvert = ui.filters.fichesAVerifierOuvert;
  return `
    <div class="panel">
      <div class="panel-head">
        <div><h2>⚠️ Fiches à vérifier (${fiches.length})</h2><div class="sub">Informations manquantes ou impossibles — à corriger avec les documents de l'élève</div></div>
        <button class="btn secondary sm" onclick="ui.filters.fichesAVerifierOuvert=${!ouvert}; renderView('eleves')">${ouvert ? 'Masquer' : 'Afficher'}</button>
      </div>
      ${ouvert ? `<div class="table-wrap"><table>
        <thead><tr><th>Élève</th><th>Classe</th><th>À corriger</th><th></th></tr></thead>
        <tbody>${fiches.map(({e, p}) => `<tr>
          <td>${escapeHtml(eleveFullName(e))}<br><span class="hint">${escapeHtml(e.matricule || '')}</span></td>
          <td>${escapeHtml(classeName(e.classeId))}</td>
          <td>${p.map(x => `<span class="badge amber" style="margin:1px;">${escapeHtml(x)}</span>`).join(' ')}</td>
          <td><button class="btn secondary sm" onclick="openEleveForm('${e.id}')">Corriger</button></td>
        </tr>`).join('')}</tbody>
      </table></div>` : ''}
    </div>`;
}
function toggleEleveNiveau(key){
  const f = ui.filters.eleves;
  f.collapsed = f.collapsed || {};
  f.collapsed[key] = !f.collapsed[key];
  renderView('eleves');
}

function renderEleveListe(){
  const f = ui.filters.eleves || {q:'', statut:'', collapsed:{}};
  f.collapsed = f.collapsed || {};
  ui.filters.eleves = f;

  const filtreActif = !!(f.q || f.statut);

  function filtreEleves(eleves){
    let list = eleves.slice();
    if(f.statut) list = list.filter(e=>e.statut===f.statut);
    if(f.q){
      const q = f.q.toLowerCase();
      list = list.filter(e => `${e.nom} ${e.prenom} ${e.matricule}`.toLowerCase().includes(q));
    }
    list.sort((a,b)=> a.nom.localeCompare(b.nom));
    return list;
  }

  function rowsHtml(list){
    return list.map(e=>`
      <tr>
        <td><div class="row-name"><span class="avatar">${initials(e.prenom,e.nom)}</span>${escapeHtml(eleveFullName(e))}</div></td>
        <td>${escapeHtml(e.matricule)}</td>
        <td>${e.sexe}</td>
        <td>${ageFromISO(e.dateNaissance)} ans</td>
        <td>${escapeHtml(e.parentNom)}<br><span class="hint">${escapeHtml(e.parentTel)}</span></td>
        <td><span class="badge ${e.statut==='Actif'?'green':e.statut==='Transféré'?'amber':'gray'}">${e.statut}</span></td>
        <td style="white-space:nowrap;">
          <button class="icon-btn" title="Voir le profil" onclick="viewEleveProfile('${e.id}')">👁️</button>
          <button class="icon-btn" title="Modifier" onclick="openEleveForm('${e.id}')">✏️</button>
          <button class="icon-btn danger" title="Supprimer" onclick="deleteEleve('${e.id}')">🗑️</button>
        </td>
      </tr>`).join('');
  }

  let totalAffiche = 0;
  const niveauxBlocs = Object.entries(NIVEAUX_DEF).map(([key,n])=>{
    // Classes réelles de l'école pour ce niveau (retrouvées par leur code)
    const classesNiveau = n.classes.map(c => DB.classes.find(dc => codeClasse(dc) === c.id)).filter(Boolean);
    if(classesNiveau.length===0) return '';

    let classesBlocs = classesNiveau.map(c=>{
      const elevesClasse = filtreEleves(DB.eleves.filter(e=>e.classeId===c.id));
      if(filtreActif && elevesClasse.length===0) return '';
      totalAffiche += elevesClasse.length;
      return `
        <div class="panel" style="margin:0 0 12px;box-shadow:none;border:1px solid var(--border);">
          <div class="panel-head" style="padding:12px 14px;">
            <div><h3 style="margin:0;font-size:var(--fs-sm);">${escapeHtml(c.nom)}</h3><div class="sub">${elevesClasse.length} élève(s)</div></div>
            ${elevesClasse.length ? `<span style="display:flex;gap:6px;flex-wrap:wrap;"><button type="button" class="btn secondary sm" onclick="ouvrirListeClasse('${c.id}')">${icone('printer')} Imprimer la liste</button><button type="button" class="btn secondary sm" onclick="ouvrirCartesScolaires('${c.id}')">${icone('credit-card')} Cartes scolaires</button></span>` : ''}
          </div>
          ${elevesClasse.length===0 ? `<div class="empty-state" style="padding:16px;"><div class="em-ic">🧒</div>Aucun élève dans cette classe.</div>` : `
          <div class="table-wrap"><table>
            <thead><tr><th>Élève</th><th>Matricule</th><th>Sexe</th><th>Âge</th><th>Parent / Tuteur</th><th>Statut</th><th>Actions</th></tr></thead>
            <tbody>${rowsHtml(elevesClasse)}</tbody>
          </table></div>`}
        </div>`;
    }).join('');

    if(filtreActif && !classesBlocs.trim()) return '';

    const effectifNiveau = classesNiveau.reduce((s,c)=>s + DB.eleves.filter(e=>e.classeId===c.id).length, 0);
    const collapsed = !!f.collapsed[key];

    return `
      <div class="panel" style="margin-bottom:14px;">
        <div class="panel-head" style="cursor:pointer;user-select:none;" onclick="toggleEleveNiveau('${key}')">
          <div><h2>${n.icon} ${n.label}</h2><div class="sub">${n.desc} · ${effectifNiveau} élève(s) · ${classesNiveau.length} classe(s)</div></div>
          <span class="badge blue" style="font-size:var(--fs-md);">${collapsed ? '▸' : '▾'}</span>
        </div>
        ${collapsed ? '' : `<div style="padding-top:4px;">${classesBlocs}</div>`}
      </div>`;
  }).join('');

  return `
  <div class="view active">
    ${renderPreinscriptions()}
    ${renderDemandesDocuments()}
    ${renderCorrectionsParents()}
    ${renderFichesAVerifier()}
    ${renderDoublonsEleves()}
    <div class="panel">
      <div class="panel-head">
        <div><h2>Liste des élèves</h2><div class="sub">${DB.eleves.length} élève(s) au total</div></div>
        <button class="btn secondary" onclick="ouvrirImportEleves()">⬆️ Importer depuis Excel</button>
        <button class="btn secondary" onclick="exporterElevesExcel()">⬇️ Exporter vers Excel</button>
        <button class="btn" onclick="openEleveForm()">+ Nouvel élève</button>
      </div>
      <div class="filters">
        <input type="text" placeholder="Rechercher nom, prénom, matricule…" value="${escapeHtml(f.q)}" oninput="ui.filters.eleves.q=this.value; renderView('eleves')">
        <select onchange="ui.filters.eleves.statut=this.value; renderView('eleves')">
          <option value="">Tous les statuts</option>
          <option ${f.statut==='Actif'?'selected':''}>Actif</option>
          <option ${f.statut==='Inactif'?'selected':''}>Inactif</option>
          <option ${f.statut==='Transféré'?'selected':''}>Transféré</option>
        </select>
      </div>
    </div>
    ${niveauxBlocs.trim() ? niveauxBlocs : `<div class="panel"><div class="empty-state"><div class="em-ic">🧒</div>Aucun élève ne correspond à ces critères.</div></div>`}
  </div>`;
}

