/* =====================================================================
   REGISTRE DES NOTES DU JOUR — secrétariat (26/11/2026)
   Demande de Vehi Zoh Junior : pendant la journée, la secrétaire prend des
   notes (chacune datée et horodatée) ; le soir elle les met au propre et
   les envoie à la validation ; validées, elles entrent dans le registre des
   notes journalières (une page « Note du jour » par date).
   Intelligent : thème deviné à la saisie, dictée à la voix (si le téléphone
   la permet), mise au propre préparée automatiquement (classée par thème,
   avec un résumé et « À suivre demain »).
   Règles tenues par le serveur : schema.sql section 130.
   ===================================================================== */
const RN_THEMES = [
  // (?<!\p{L}) … (?!\p{L}) : début/fin de mot qui marche aussi avec les accents (« élève »)
  { cle: 'Parent', ic: '👪', mots: /(?<!\p{L})(parents?|mamans?|papas?|m[eè]res?|p[eè]res?|tuteurs?|tutrices?|familles?)(?!\p{L})/iu },
  { cle: 'Paiement', ic: '💵', mots: /(?<!\p{L})(pay[ée]e?s?|payer|paiements?|vers[ée]e?s?|versements?|frais|re[çc]us?|f ?cfa|fcfa|mobile money|esp[eè]ces|tranches?|reste [àa] payer)(?!\p{L})|\d[\d  .]*000(?!\d)/iu },
  { cle: 'Élève', ic: '🧒', mots: /(?<!\p{L})([ée]l[eè]ves?|enfants?|absente?s?|malades?|retards?|bless[ée]e?s?|infirmerie|tomb[ée]e?)(?!\p{L})/iu },
  { cle: 'Enseignant', ic: '👩‍🏫', mots: /(?<!\p{L})(enseignante?s?|ma[iî]tres?|ma[iî]tresses?|professeurs?|profs?)(?!\p{L})/iu },
  { cle: 'Appel reçu', ic: '📞', mots: /(?<!\p{L})(appels?|t[ée]l[ée]phon\p{L}*|appel[ée]e?|rappel\p{L}*|whatsapp)(?!\p{L})/iu },
  { cle: 'Visite', ic: '🚪', mots: /(?<!\p{L})(visites?|visiteurs?|rendez-vous|rdv|r[ée]union|pass[ée]e? [àa] l)(?!\p{L})/iu },
  { cle: 'Courrier', ic: '✉️', mots: /(?<!\p{L})(courriers?|lettres?|documents?|dossiers?|certificats?|attestations?|imprim\p{L}*)(?!\p{L})/iu },
  { cle: 'Divers', ic: '📌', mots: null },
];
const RN_STATUTS = { brouillon: ['Brouillon', 'rn-brouillon'], a_valider: ['À valider', 'rn-attente'], a_corriger: ['À corriger', 'rn-corriger'], validee: ['Validée', 'rn-validee'] };
const rnEtat = { pages: null, entrees: {}, chargement: false, promesse: null, theme: '', dictee: null };

function rnThemeIcone(cle){ return (RN_THEMES.find(t => t.cle === cle) || RN_THEMES[RN_THEMES.length - 1]).ic; }
// Ordre de détection : du plus précis au plus général (« la famille a versé 50 000 F » = Paiement, pas Parent)
const RN_ORDRE_DETECTION = ['Paiement', 'Visite', 'Appel reçu', 'Courrier', 'Enseignant', 'Élève', 'Parent'];
function rnDevinerTheme(texte){ const cle = RN_ORDRE_DETECTION.find(c => RN_THEMES.find(t => t.cle === c).mots.test(texte || '')); return cle || 'Divers'; }
function rnDateLongue(iso){ const s = new Date(iso + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); return s.charAt(0).toUpperCase() + s.slice(1); }
function rnHeure(ts){ return ts ? new Date(ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : ''; }
function rnHorodatage(ts){ return ts ? `${fmtDate(new Date(ts).toISOString().slice(0, 10))} à ${rnHeure(ts)}` : ''; }
function rnAdmin(){ return ['direction', 'fondation'].includes(ui.role); }
function rnMaPageDuJour(){ return (rnEtat.pages || []).find(p => p.auteurId === session.userId && p.jour === todayISO()) || null; }
function rnModifiable(p){ return p && p.auteurId === session.userId && ['brouillon', 'a_corriger'].includes(p.statut); }

function chargerRegistreNotes(){
  // Une seule lecture à la fois : les appels pendant la lecture attendent la même (pas de boucle)
  if(rnEtat.promesse) return rnEtat.promesse;
  rnEtat.chargement = true;
  rnEtat.promesse = (async () => {
    try{
      const { data, error } = await sb.from('notes_jour_pages').select('*').order('jour', { ascending: false }).limit(500);
      if(error) throw error;
      rnEtat.pages = rowsToCamel(data || []);
    }catch(_e){ if(rnEtat.pages === null) rnEtat.pages = []; }
    rnEtat.chargement = false; rnEtat.promesse = null;
  })();
  return rnEtat.promesse;
}
const rnEntreesEnCours = {};
function rnChargerEntrees(pageId){
  if(rnEntreesEnCours[pageId]) return rnEntreesEnCours[pageId];
  return (rnEntreesEnCours[pageId] = (async () => {
    try{
      const { data, error } = await sb.from('notes_jour_entrees').select('*').eq('page_id', pageId).order('created_at', { ascending: true });
      if(error) throw error;
      rnEtat.entrees[pageId] = rowsToCamel(data || []);
    }catch(_e){ if(!rnEtat.entrees[pageId]) rnEtat.entrees[pageId] = []; }
    delete rnEntreesEnCours[pageId];
  })());
}
function rnRafraichir(){ if(ui.currentView === 'registre-notes') renderView('registre-notes'); }

/* ------------------------------- Écran ------------------------------- */
function renderRegistreNotes(){
  const f = ui.filters.rn || (ui.filters.rn = { pageId: null, mois: '', recherche: '', filtre: 'tous' });
  if(rnEtat.pages === null){ if(!rnEtat.promesse) chargerRegistreNotes().then(rnRafraichir); return '<div class="panel"><p class="hint">Ouverture du registre…</p></div>'; }
  if(f.pageId){
    const p = rnEtat.pages.find(x => x.id === f.pageId);
    if(p){ if(!rnEtat.entrees[p.id] && !rnEntreesEnCours[p.id]){ rnChargerEntrees(p.id).then(rnRafraichir); } return rnPageHtml(p, true); }
    f.pageId = null;
  }
  const secretaire = ['secretariat', 'direction', 'fondation'].includes(ui.role);
  let haut = '';
  if(secretaire){
    const p = rnMaPageDuJour();
    if(p && !rnEtat.entrees[p.id] && !rnEntreesEnCours[p.id]) rnChargerEntrees(p.id).then(rnRafraichir);
    haut = p ? rnPageHtml(p, false) : rnPageVideHtml();
  }
  return `<div class="rn">${haut}${rnRegistreHtml()}</div>`;
}

function rnPageVideHtml(){
  return `<section class="panel rn-page rn-papier">
    <div class="rn-entete"><div><span class="rn-sur">📒 Note du jour</span><h2>${rnDateLongue(todayISO())}</h2></div><span class="rn-statut rn-brouillon">Pas encore commencée</span></div>
    ${rnSaisieHtml()}
    <p class="hint">Chaque note est enregistrée avec sa date et son heure. Le soir : « Préparer la mise au propre », relisez, puis envoyez à la direction.</p>
  </section>`;
}
function rnSaisieHtml(){
  const dictee = ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window);
  return `<form class="rn-saisie" onsubmit="event.preventDefault(); rnAjouterNote()">
    <div class="rn-themes" role="group" aria-label="Thème de la note">${RN_THEMES.map(t => `<button type="button" class="rn-theme" onclick="rnOuvrirFormulaire('${t.cle}')">${t.ic} ${t.cle}</button>`).join('')}</div>
    <p class="rn-astuce">Touchez un thème pour remplir sa petite fiche, ou écrivez directement une note libre ci-dessous.</p>
    <textarea id="rnTexte" rows="2" maxlength="4000" placeholder="Ex. : 9 h 10, la maman de Koffi (CE1) a appelé : il est malade aujourd’hui." aria-label="Nouvelle note"
      onkeydown="if(event.key==='Enter' && !event.shiftKey){ event.preventDefault(); rnAjouterNote(); }"></textarea>
    <div class="rn-actions">
      ${dictee ? `<button type="button" class="btn secondary" id="rnBtnDicter" onclick="rnDicter('rnTexte', 'rnBtnDicter')">🎤 Dicter</button>` : ''}
      <button type="submit" class="btn" id="rnAjouter">➕ Ajouter la note</button>
    </div>
    <p class="rn-astuce">Note libre : le thème est deviné (parent, paiement, élève…).</p>
  </form>`;
}

function rnPageHtml(p, seule){
  const ent = rnEtat.entrees[p.id];
  const modif = rnModifiable(p), auteur = p.auteurId === session.userId;
  const [lib, cls] = RN_STATUTS[p.statut] || RN_STATUTS.brouillon;
  const peutValider = rnAdmin() && !auteur && p.statut === 'a_valider';
  const liste = !ent ? '<p class="hint">Chargement des notes…</p>' : !ent.length ? '<p class="hint">Aucune note prise ce jour-là.</p>'
    : `<ol class="rn-notes">${ent.map(e => `<li><span class="rn-h">${rnHeure(e.createdAt)}</span><span class="rn-tag">${rnThemeIcone(e.categorie)} ${escapeHtml(e.categorie)}</span>
        <span class="rn-txt">${escapeHtml(e.texte).replace(/\n/g, '<br>')}</span>${modif ? `<button type="button" class="rn-suppr" aria-label="Retirer cette note" onclick="rnRetirerNote('${e.id}', '${p.id}')">✕</button>` : ''}</li>`).join('')}</ol>`;
  return `<section class="panel rn-page rn-papier" id="rnPage">
    ${seule ? `<button type="button" class="btn secondary sm rn-retour" onclick="ui.filters.rn.pageId=null; renderView('registre-notes')">← Registre</button>` : ''}
    <div class="rn-entete"><div><span class="rn-sur">📒 Note du jour · ${escapeHtml(p.auteurNom || '')}</span><h2>${rnDateLongue(p.jour)}</h2></div><span class="rn-statut ${cls}">${lib}</span></div>
    <div class="rn-horo">Ouverte le ${rnHorodatage(p.createdAt)}${p.soumisLe ? ` · envoyée le ${rnHorodatage(p.soumisLe)}` : ''}${p.valideLe ? ` · ${p.statut === 'validee' ? 'validée' : 'retournée'} par ${escapeHtml(p.valideParNom || '')} le ${rnHorodatage(p.valideLe)}` : ''}</div>
    ${p.statut === 'a_corriger' && p.commentaireValidation ? `<div class="rn-retourne">↩️ <strong>À corriger :</strong> ${escapeHtml(p.commentaireValidation)}</div>` : ''}
    ${modif ? rnSaisieHtml() : ''}
    <h3 class="rn-sous">Notes de la journée${ent && ent.length ? ` (${ent.length})` : ''}</h3>
    ${liste}
    <h3 class="rn-sous">Mise au propre — rapport du jour</h3>
    ${modif ? `<textarea id="rnPropre" class="rn-propre" rows="10" maxlength="20000" placeholder="Le soir, touchez « Préparer la mise au propre » : le rapport est rédigé à partir de vos notes. Relisez et complétez.">${escapeHtml(p.contenuPropre || '')}</textarea>
      <div class="rn-actions">
        <button type="button" class="btn secondary" onclick="rnPreparerPropre('${p.id}')">✨ Préparer la mise au propre</button>
        <button type="button" class="btn secondary" onclick="rnEnregistrerPropre('${p.id}', false)">💾 Enregistrer</button>
        <button type="button" class="btn" onclick="rnEnregistrerPropre('${p.id}', true)">📨 Envoyer pour validation</button>
      </div>`
      : `<div class="rn-propre-lu">${p.contenuPropre ? escapeHtml(p.contenuPropre).replace(/\n/g, '<br>') : '<span class="hint">Pas encore mise au propre.</span>'}</div>`}
    ${p.statut === 'a_valider' && auteur ? '<p class="hint">⏳ Envoyée : la direction va la valider. Vous serez prévenu(e) si une correction est demandée.</p>' : ''}
    ${p.statut === 'validee' ? `<p class="rn-ok">✅ Validée par ${escapeHtml(p.valideParNom || 'la direction')} le ${rnHorodatage(p.valideLe)} — rangée dans le registre, plus modifiable.</p>` : ''}
    <div class="rn-actions">
      ${peutValider ? `<button type="button" class="btn" onclick="rnValider('${p.id}')">✅ Valider</button><button type="button" class="btn secondary" onclick="rnDemanderCorrection('${p.id}')">↩️ Demander une correction</button>` : ''}
      <button type="button" class="btn secondary" onclick="rnImprimer('${p.id}')">🖨️ Imprimer / PDF</button>
    </div>
  </section>`;
}

function rnRegistreHtml(){
  const f = ui.filters.rn;
  const pages = rnEtat.pages || [];
  const mois = [...new Set(pages.map(p => p.jour.slice(0, 7)))];
  const q = simplifierTexte(f.recherche || '');
  const visibles = pages.filter(p => (!f.mois || p.jour.startsWith(f.mois)) && (f.filtre !== 'a_valider' || p.statut === 'a_valider')
    && (!q || simplifierTexte(`${p.contenuPropre} ${p.auteurNom} ${rnDateLongue(p.jour)}`).includes(q)));
  const aValider = pages.filter(p => p.statut === 'a_valider' && p.auteurId !== session.userId).length;
  const groupes = {};
  visibles.forEach(p => { (groupes[p.jour.slice(0, 7)] = groupes[p.jour.slice(0, 7)] || []).push(p); });
  return `<section class="panel rn-registre">
    <div class="rn-reg-tete"><div><h2>📚 Registre des notes journalières</h2><p class="hint">${pages.length} page${pages.length > 1 ? 's' : ''} · une page « Note du jour » par date, datée et horodatée.</p></div>
      ${rnAdmin() && aValider ? `<span class="rn-statut rn-attente">${aValider} à valider</span>` : ''}</div>
    <div class="rn-filtres">
      <select class="puce-select" aria-label="Mois" onchange="ui.filters.rn.mois=this.value; renderView('registre-notes')"><option value="">Tous les mois</option>${mois.map(m => `<option value="${m}"${m === f.mois ? ' selected' : ''}>${moisLabel(m)}</option>`).join('')}</select>
      ${rnAdmin() ? `<select class="puce-select" aria-label="Filtre" onchange="ui.filters.rn.filtre=this.value; renderView('registre-notes')"><option value="tous">Toutes les pages</option><option value="a_valider"${f.filtre === 'a_valider' ? ' selected' : ''}>À valider</option></select>` : ''}
      <input type="search" class="rn-cherche" placeholder="Chercher un mot, un nom…" value="${escapeHtml(f.recherche || '')}" aria-label="Chercher dans le registre"
        onchange="ui.filters.rn.recherche=this.value; renderView('registre-notes')">
      ${pages.length ? `<button type="button" class="btn secondary sm" onclick="rnExporterMois(ui.filters.rn.mois || '')">⬇️ Excel</button>` : ''}
    </div>
    ${!visibles.length ? '<p class="hint">Aucune page pour l’instant.</p>' : Object.entries(groupes).map(([m, ps]) => `<h3 class="rn-mois">${moisLabel(m)}</h3>
      <ul class="rn-liste">${ps.map(p => { const [lib, cls] = RN_STATUTS[p.statut] || RN_STATUTS.brouillon;
        return `<li><button type="button" class="rn-ligne" onclick="rnOuvrir('${p.id}')">
          <span class="rn-jour"><strong>${new Date(p.jour + 'T12:00:00').getDate()}</strong><small>${new Date(p.jour + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'short' })}</small></span>
          <span class="rn-resume"><strong>Note du jour — ${rnDateLongue(p.jour)}</strong><small>${escapeHtml(p.auteurNom || '')}${p.contenuPropre ? ' · ' + escapeHtml(p.contenuPropre.replace(/\s+/g, ' ').slice(0, 90)) + (p.contenuPropre.length > 90 ? '…' : '') : ''}</small></span>
          <span class="rn-statut ${cls}">${lib}</span></button></li>`; }).join('')}</ul>`).join('')}
  </section>`;
}

/* ------------------------------ Actions ------------------------------ */
function rnOuvrir(id){ ui.filters.rn = Object.assign({ mois: '', recherche: '', filtre: 'tous' }, ui.filters.rn || {}, { pageId: id }); renderView('registre-notes'); window.scrollTo(0, 0); }

async function rnPageDuJourCreee(){
  let p = rnMaPageDuJour();
  if(p) return p;
  p = await dbInsert('notes_jour_pages', { auteurId: session.userId, auteurNom: session.nomComplet || '', jour: todayISO(), statut: 'brouillon', contenuPropre: '' });
  if(!p.createdAt) p.createdAt = new Date().toISOString();
  if(!p.auteurNom) p.auteurNom = session.nomComplet || '';
  rnEtat.pages = [p, ...(rnEtat.pages || [])];
  rnEtat.entrees[p.id] = [];
  return p;
}
// Enregistre une note (datée et horodatée par le serveur) dans la page du jour ouverte
async function rnEnregistrerEntree(categorie, texte){
  const ouverte = ui.filters.rn?.pageId ? (rnEtat.pages || []).find(x => x.id === ui.filters.rn.pageId) : null;
  const p = ouverte && rnModifiable(ouverte) ? ouverte : await rnPageDuJourCreee();
  const e = await dbInsert('notes_jour_entrees', { pageId: p.id, auteurId: session.userId, categorie, texte });
  if(!e.createdAt) e.createdAt = new Date().toISOString();
  (rnEtat.entrees[p.id] = rnEtat.entrees[p.id] || []).push(e);
  return e;
}
async function rnAjouterNote(){
  const t = document.getElementById('rnTexte'); if(!t) return;
  const texte = t.value.trim(); if(!texte){ toast('Écrivez la note, ou touchez un thème pour remplir sa fiche.'); t.focus(); return; }
  const b = document.getElementById('rnAjouter'); if(b) b.disabled = true;
  try{
    const categorie = rnDevinerTheme(texte);
    const e = await rnEnregistrerEntree(categorie, texte);
    toast(`Note ajoutée à ${rnHeure(e.createdAt)} (${categorie})`);
    rnRafraichir();
    setTimeout(() => document.getElementById('rnTexte')?.focus(), 50);
  }catch(err){ toast('Note non enregistrée : ' + (err.message || err)); if(b) b.disabled = false; }
}

/* ---------- Une petite fiche par thème : la note est rédigée à partir de la fiche ---------- */
const RN_SUITES = ['Réglé', 'À rappeler', 'Transmis à la direction', 'En attente'];
const RN_FORMULAIRES = {
  'Parent': { titre: 'Parent', champs: [
      { id: 'parent', lib: 'Nom du parent', type: 'texte', requis: true, ex: 'Mme Koné' },
      { id: 'eleve', lib: 'Élève concerné', type: 'eleve' },
      { id: 'objet', lib: 'Objet', type: 'choix', options: ['Information', 'Réclamation', 'Demande de rendez-vous', 'Absence signalée', 'Retrait de l’enfant avant l’heure', 'Autre'] },
      { id: 'details', lib: 'Détails', type: 'long', dictee: true },
      { id: 'suivre', lib: 'À suivre demain', type: 'case' } ],
    rediger: v => `${v.parent}${v.eleve ? ` (parent de ${v.eleve})` : ''} — ${v.objet}${v.details ? ' : ' + v.details : ''}` },
  'Paiement': { titre: 'Paiement reçu', champs: [
      { id: 'eleve', lib: 'Élève', type: 'eleve', requis: true },
      { id: 'montant', lib: 'Montant (F CFA)', type: 'nombre', requis: true },
      { id: 'tranche', lib: 'Pour', type: 'choix', options: () => [...new Set([...(typeof TRANCHES_SCOLARITE !== 'undefined' ? TRANCHES_SCOLARITE : []), 'Cantine', 'Activité', 'Tenue / fournitures', 'Autre'])] },
      { id: 'mode', lib: 'Mode de paiement', type: 'choix', options: () => (typeof MODES_PAIEMENT !== 'undefined' ? MODES_PAIEMENT : ['Espèces', 'Mobile Money']) },
      { id: 'recu', lib: 'Reçu remis au parent', type: 'case', defaut: true },
      { id: 'details', lib: 'Remarque', type: 'long' } ],
    aide: 'Cette fiche garde une trace dans la note du jour. Le paiement lui-même s’enregistre dans Comptabilité → Scolarité (reçu numéroté).',
    rediger: v => `Paiement de ${fmtFCFA(Number(v.montant) || 0)} pour ${v.eleve} (${v.tranche}, ${v.mode})${v.recu ? ', reçu remis' : ', reçu à remettre'}${v.details ? '. ' + v.details : ''}` },
  'Élève': { titre: 'Élève', champs: [
      { id: 'eleve', lib: 'Élève', type: 'eleve', requis: true },
      { id: 'evenement', lib: 'Ce qui s’est passé', type: 'choix', options: ['Malade', 'Blessé(e)', 'Arrivé(e) en retard', 'Parti(e) plus tôt', 'Comportement', 'Objet perdu / trouvé', 'Autre'] },
      { id: 'details', lib: 'Ce qui a été fait', type: 'long', dictee: true },
      { id: 'prevenu', lib: 'Parent prévenu', type: 'case' },
      { id: 'suivre', lib: 'À suivre demain', type: 'case' } ],
    rediger: v => `${v.eleve} : ${v.evenement.toLowerCase()}${v.details ? '. ' + v.details : ''}${v.prevenu ? '. Parent prévenu' : '. Parent pas encore prévenu'}` },
  'Enseignant': { titre: 'Enseignant', champs: [
      { id: 'enseignant', lib: 'Enseignant', type: 'enseignant', requis: true },
      { id: 'objet', lib: 'Objet', type: 'choix', options: ['Absence', 'Retard', 'Demande de permission', 'Demande de matériel', 'Information', 'Autre'] },
      { id: 'details', lib: 'Détails', type: 'long', dictee: true },
      { id: 'suivre', lib: 'À suivre demain', type: 'case' } ],
    rediger: v => `${v.enseignant} — ${v.objet}${v.details ? ' : ' + v.details : ''}` },
  'Appel reçu': { titre: 'Appel reçu', champs: [
      { id: 'qui', lib: 'De la part de', type: 'texte', requis: true, ex: 'M. Bamba' },
      { id: 'tel', lib: 'Numéro', type: 'tel' },
      { id: 'objet', lib: 'Objet de l’appel', type: 'long', requis: true, dictee: true },
      { id: 'suite', lib: 'Suite', type: 'choix', options: RN_SUITES } ],
    rediger: v => `Appel de ${v.qui}${v.tel ? ` (${v.tel})` : ''} : ${v.objet} — ${v.suite.toLowerCase()}` },
  'Visite': { titre: 'Visite', champs: [
      { id: 'qui', lib: 'Visiteur', type: 'texte', requis: true, ex: 'M. Bamba' },
      { id: 'motif', lib: 'Motif', type: 'choix', options: ['Inscription', 'Renseignements', 'Rendez-vous avec la direction', 'Livraison', 'Réunion', 'Autre'] },
      { id: 'heure', lib: 'Heure d’arrivée', type: 'heure' },
      { id: 'details', lib: 'Détails', type: 'long', dictee: true },
      { id: 'suite', lib: 'Suite', type: 'choix', options: RN_SUITES } ],
    rediger: v => `Visite de ${v.qui}${v.heure ? ` à ${v.heure.replace(':', ' h ')}` : ''} — ${v.motif}${v.details ? ' : ' + v.details : ''} — ${v.suite.toLowerCase()}` },
  'Courrier': { titre: 'Courrier / document', champs: [
      { id: 'sens', lib: 'Sens', type: 'choix', options: ['Reçu', 'Envoyé', 'Préparé (certificat, attestation…)'] },
      { id: 'qui', lib: 'Expéditeur ou destinataire', type: 'texte', requis: true },
      { id: 'objet', lib: 'Objet', type: 'texte', requis: true, ex: 'Certificat de scolarité' },
      { id: 'remis', lib: 'Remis à', type: 'texte' } ],
    rediger: v => `Courrier ${v.sens.toLowerCase()} — ${v.objet} (${v.qui})${v.remis ? `, remis à ${v.remis}` : ''}` },
  'Divers': { titre: 'Note libre', champs: [ { id: 'details', lib: 'Note', type: 'long', requis: true, dictee: true }, { id: 'suivre', lib: 'À suivre demain', type: 'case' } ],
    rediger: v => v.details },
};
function rnOuvrirFormulaire(cle){
  const f = RN_FORMULAIRES[cle]; if(!f) return;
  const dicteeOk = ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window);
  const opts = o => (typeof o === 'function' ? o() : o);
  const eleves = (DB.eleves || []).filter(e => e.statut === 'Actif').sort((a, b) => eleveFullName(a).localeCompare(eleveFullName(b)));
  const champ = c => {
    const id = 'rnF_' + c.id, lib = `<label for="${id}">${c.lib}${c.requis ? ' *' : ''}</label>`;
    if(c.type === 'case') return `<label class="rn-case"><input type="checkbox" id="${id}"${c.defaut ? ' checked' : ''}> ${c.lib}</label>`;
    if(c.type === 'choix') return `<div class="form-group">${lib}<select id="${id}">${opts(c.options).map(o => `<option>${escapeHtml(o)}</option>`).join('')}</select></div>`;
    if(c.type === 'long') return `<div class="form-group">${lib}<textarea id="${id}" rows="3" maxlength="1500"></textarea>${c.dictee && dicteeOk ? `<button type="button" class="btn secondary sm rn-dicter-champ" id="${id}_dic" onclick="rnDicter('${id}', '${id}_dic')">🎤 Dicter</button>` : ''}</div>`;
    if(c.type === 'eleve') return `<div class="form-group">${lib}<input id="${id}" list="rnListeEleves" autocomplete="off" placeholder="Tapez quelques lettres du nom"></div>`;
    if(c.type === 'enseignant') return `<div class="form-group">${lib}<input id="${id}" list="rnListeEnseignants" autocomplete="off" placeholder="Tapez quelques lettres du nom"></div>`;
    const type = { nombre: 'number', tel: 'tel', heure: 'time' }[c.type] || 'text';
    const val = c.type === 'heure' ? new Date().toTimeString().slice(0, 5) : '';
    return `<div class="form-group">${lib}<input id="${id}" type="${type}"${type === 'number' ? ' min="0" step="any" inputmode="numeric"' : ''}${c.ex ? ` placeholder="Ex. : ${escapeHtml(c.ex)}"` : ''} value="${val}"></div>`;
  };
  openModal(`${rnThemeIcone(cle)} ${f.titre}`, `<form class="rn-fiche" onsubmit="event.preventDefault(); rnEnregistrerFiche('${cle}')">
      ${f.aide ? `<p class="hint">${f.aide}</p>` : ''}
      ${f.champs.map(champ).join('')}
      <datalist id="rnListeEleves">${eleves.map(e => `<option value="${escapeHtml(eleveFullName(e))} (${escapeHtml(classeName(e.classeId))})"></option>`).join('')}</datalist>
      <datalist id="rnListeEnseignants">${(DB.enseignants || []).map(t => `<option value="${escapeHtml(ensFullName(t))}"></option>`).join('')}</datalist>
      <p class="rn-astuce">L’heure de la note est enregistrée automatiquement.</p>
      <div class="form-actions"><button type="button" class="btn secondary" onclick="closeModal()">Annuler</button><button type="submit" class="btn" id="rnFicheOk">💾 Enregistrer la note</button></div>
    </form>`);
  setTimeout(() => document.querySelector('.rn-fiche input:not([type=checkbox]), .rn-fiche textarea')?.focus(), 60);
}
async function rnEnregistrerFiche(cle){
  const f = RN_FORMULAIRES[cle]; if(!f) return;
  const v = {};
  for(const c of f.champs){
    const el = document.getElementById('rnF_' + c.id); if(!el) continue;
    v[c.id] = c.type === 'case' ? el.checked : String(el.value || '').trim();
    if(c.requis && !v[c.id]){ toast(`Indiquez : ${c.lib.toLowerCase()}.`); el.focus(); return; }
  }
  let texte = f.rediger(v).replace(/\s+/g, ' ').trim();
  if(v.suivre) texte += ' — à suivre demain';
  const b = document.getElementById('rnFicheOk'); if(b) b.disabled = true;
  try{
    const e = await rnEnregistrerEntree(cle, texte);
    closeModal();
    toast(`Note « ${cle} » enregistrée à ${rnHeure(e.createdAt)}`);
    rnRafraichir();
  }catch(err){ toast('Note non enregistrée : ' + (err.message || err)); if(b) b.disabled = false; }
}

async function rnRetirerNote(id, pageId){
  if(!confirm('Retirer cette note ?')) return;
  try{ await dbDelete('notes_jour_entrees', id); rnEtat.entrees[pageId] = (rnEtat.entrees[pageId] || []).filter(e => e.id !== id); rnRafraichir(); }
  catch(err){ toast('Impossible : ' + (err.message || err)); }
}

// Mise au propre préparée à partir des notes : classée par thème, résumé, « À suivre demain »
function rnRedigerPropre(p, ent){
  const parTheme = RN_THEMES.map(t => [t, ent.filter(e => e.categorie === t.cle)]).filter(([, l]) => l.length);
  const autres = ent.filter(e => !RN_THEMES.some(t => t.cle === e.categorie));
  if(autres.length) parTheme.push([{ cle: 'Autres', ic: '📌' }, autres]);
  const phrase = s => { s = s.trim().replace(/\s+/g, ' '); s = s.charAt(0).toUpperCase() + s.slice(1); return /[.!?…]$/.test(s) ? s : s + '.'; };
  const suivre = ent.filter(e => /(?<!\p{L})(rappeler|demain|[àa] suivre|relancer|en attente|attendre|revenir|reviendra|promis|pr[ée]voir|penser [àa]|[àa] faire)(?!\p{L})/iu.test(e.texte));
  const lignes = [`RAPPORT JOURNALIER DU SECRÉTARIAT`, `${rnDateLongue(p.jour)} — ${p.auteurNom || session.nomComplet || ''}`, ''];
  lignes.push(`En bref : ${ent.length} note${ent.length > 1 ? 's' : ''} — ` + parTheme.map(([t, l]) => `${l.length} ${t.cle.toLowerCase()}`).join(', ') + '.', '');
  parTheme.forEach(([t, l]) => { lignes.push(`${t.ic} ${t.cle.toUpperCase()} (${l.length})`); l.forEach(e => lignes.push(`• ${rnHeure(e.createdAt)} — ${phrase(e.texte)}`)); lignes.push(''); });
  if(suivre.length){ lignes.push('➡️ À SUIVRE DEMAIN'); suivre.forEach(e => lignes.push(`• ${phrase(e.texte)}`)); lignes.push(''); }
  lignes.push('Observations : ');
  return lignes.join('\n');
}
async function rnPreparerPropre(pageId){
  const p = rnEtat.pages.find(x => x.id === pageId); if(!p) return;
  if(!rnEtat.entrees[pageId]) await rnChargerEntrees(pageId);
  const ent = rnEtat.entrees[pageId] || [];
  if(!ent.length){ toast('Ajoutez d’abord des notes dans la journée.'); return; }
  const zone = document.getElementById('rnPropre'); if(!zone) return;
  if(zone.value.trim() && !confirm('Remplacer le texte déjà écrit par une nouvelle mise au propre ?')) return;
  zone.value = rnRedigerPropre(p, ent);
  zone.focus();
  toast('Mise au propre préparée : relisez, complétez, puis envoyez.');
}
async function rnEnregistrerPropre(pageId, envoyer){
  const p = rnEtat.pages.find(x => x.id === pageId); const zone = document.getElementById('rnPropre'); if(!p || !zone) return;
  const contenu = zone.value.trim();
  if(envoyer && !contenu){ toast('Mettez d’abord la note au propre (bouton ✨).'); return; }
  if(envoyer && !confirm('Envoyer la note du jour à la direction pour validation ?')) return;
  try{
    const patch = { contenuPropre: contenu };
    if(envoyer) patch.statut = 'a_valider';
    await dbUpdate('notes_jour_pages', p.id, patch);
    Object.assign(p, patch); if(envoyer) p.soumisLe = new Date().toISOString();
    toast(envoyer ? '📨 Envoyée à la direction pour validation.' : 'Enregistré.');
    rnRafraichir();
  }catch(err){ toast(err.message || 'Enregistrement impossible.'); }
}
async function rnValider(pageId){
  const p = rnEtat.pages.find(x => x.id === pageId); if(!p) return;
  if(!confirm(`Valider la note du jour du ${fmtDate(p.jour)} ? Elle ne pourra plus être modifiée.`)) return;
  try{ await dbUpdate('notes_jour_pages', p.id, { statut: 'validee', valideParNom: session.nomComplet || '', valideLe: new Date().toISOString() }); await chargerRegistreNotes(); toast('✅ Note du jour validée et rangée dans le registre.'); rnRafraichir(); }
  catch(err){ toast(err.message || 'Validation impossible.'); }
}
function rnDemanderCorrection(pageId){
  openModal('↩️ Demander une correction', `<form onsubmit="event.preventDefault(); rnEnvoyerCorrection('${pageId}')">
    <label for="rnComm">Que faut-il corriger ou compléter ?</label>
    <textarea id="rnComm" rows="4" maxlength="2000" required style="width:100%;" placeholder="Ex. : précisez le montant reçu de la famille Koné."></textarea>
    <div class="form-actions"><button type="button" class="btn secondary" onclick="closeModal()">Annuler</button><button type="submit" class="btn">Renvoyer au secrétariat</button></div></form>`);
  setTimeout(() => document.getElementById('rnComm')?.focus(), 50);
}
async function rnEnvoyerCorrection(pageId){
  const c = (document.getElementById('rnComm')?.value || '').trim(); if(!c) return;
  try{ await dbUpdate('notes_jour_pages', pageId, { statut: 'a_corriger', commentaireValidation: c, valideParNom: session.nomComplet || '', valideLe: new Date().toISOString() }); closeModal(); await chargerRegistreNotes(); toast('Renvoyée au secrétariat avec votre commentaire.'); rnRafraichir(); }
  catch(err){ toast(err.message || 'Envoi impossible.'); }
}

// Impression / PDF d'une page du registre
async function rnImprimer(pageId){
  const p = rnEtat.pages.find(x => x.id === pageId); if(!p) return;
  if(!rnEtat.entrees[pageId]) await rnChargerEntrees(pageId);
  const ent = rnEtat.entrees[pageId] || [], m = DB.meta || {};
  openModal('Note du jour — impression', `
    <div class="form-actions no-print" style="margin-top:0;justify-content:flex-end;"><button type="button" class="btn" onclick="window.print()">🖨️ Imprimer / PDF</button></div>
    <section class="rn-impression">
      <div class="recu-head">${m.logo ? `<img src="${escapeHtml(m.logo)}" alt="">` : '<div class="recu-logo-ph">🎓</div>'}
        <div><strong>${escapeHtml(m.nomEcole || '')}</strong><div class="hint">Registre des notes journalières — secrétariat</div></div>
        <div style="margin-left:auto;text-align:right;"><strong>NOTE DU JOUR</strong><div class="hint">${rnDateLongue(p.jour)}</div></div></div>
      <p class="hint">Rédigée par ${escapeHtml(p.auteurNom || '')} · ouverte le ${rnHorodatage(p.createdAt)}${p.soumisLe ? ` · envoyée le ${rnHorodatage(p.soumisLe)}` : ''}${p.statut === 'validee' ? ` · <strong>validée par ${escapeHtml(p.valideParNom || '')} le ${rnHorodatage(p.valideLe)}</strong>` : ` · ${RN_STATUTS[p.statut][0]}`}</p>
      <div class="rn-propre-lu">${p.contenuPropre ? escapeHtml(p.contenuPropre).replace(/\n/g, '<br>') : '<em>Pas encore mise au propre.</em>'}</div>
      ${ent.length ? `<h4>Notes prises dans la journée</h4><table class="table"><thead><tr><th>Heure</th><th>Thème</th><th>Note</th></tr></thead><tbody>${ent.map(e => `<tr><td>${rnHeure(e.createdAt)}</td><td>${escapeHtml(e.categorie)}</td><td>${escapeHtml(e.texte)}</td></tr>`).join('')}</tbody></table>` : ''}
      <div class="rn-signatures"><div>Le secrétariat</div><div>La direction</div></div>
    </section>`);
}

// Export Excel du registre (un mois, ou tout)
async function rnExporterMois(mois){
  try{
    if(rnEtat.pages === null) await chargerRegistreNotes();
    const pages = (rnEtat.pages || []).filter(p => !mois || p.jour.startsWith(mois)).sort((a, b) => a.jour.localeCompare(b.jour));
    if(!pages.length){ toast('Aucune page pour cette période.'); return; }
    const { data } = await sb.from('notes_jour_entrees').select('*').in('page_id', pages.map(p => p.id)).order('created_at', { ascending: true });
    const ent = rowsToCamel(data || []);
    const registre = [['Date', 'Auteur', 'Statut', 'Envoyée le', 'Validée par', 'Validée le', 'Rapport du jour (mis au propre)']]
      .concat(pages.map(p => [fmtDate(p.jour), p.auteurNom || '', RN_STATUTS[p.statut][0], rnHorodatage(p.soumisLe), p.valideParNom || '', rnHorodatage(p.valideLe), p.contenuPropre || '']));
    const notes = [['Date', 'Heure', 'Auteur', 'Thème', 'Note']].concat(ent.map(e => { const p = pages.find(x => x.id === e.pageId) || {}; return [fmtDate(p.jour || ''), rnHeure(e.createdAt), p.auteurNom || '', e.categorie, e.texte]; }));
    await ecrireClasseurExcel([['Registre', registre], ['Notes horodatées', notes]], nomFichierExport('registre-notes' + (mois ? '-' + mois : '')));
    toast('Registre exporté.');
  }catch(err){ alert('Export impossible : ' + (err.message || err)); }
}

// Dictée à la voix (reconnaissance vocale du navigateur, gratuite)
function rnDicter(idCible, idBouton){
  const R = window.SpeechRecognition || window.webkitSpeechRecognition; if(!R){ toast('La dictée n’est pas possible sur ce navigateur : utilisez Chrome.'); return; }
  const b = document.getElementById(idBouton || 'rnBtnDicter'), t = document.getElementById(idCible || 'rnTexte'); if(!t) return;
  if(rnEtat.dictee){ rnEtat.dictee.stop(); return; }
  const r = new R(); r.lang = 'fr-FR'; r.interimResults = false; r.continuous = false;
  const depart = t.value;
  r.onresult = ev => { const txt = Array.from(ev.results).map(x => x[0].transcript).join(' '); t.value = (depart ? depart + ' ' : '') + txt; };
  r.onerror = () => toast('Dictée impossible : vérifiez le micro et la connexion.');
  r.onend = () => { rnEtat.dictee = null; if(b){ b.textContent = '🎤 Dicter'; b.classList.remove('btn-recording'); } };
  rnEtat.dictee = r; r.start();
  if(b){ b.textContent = '⏹️ Arrêter'; b.classList.add('btn-recording'); }
}

// Pour « À faire aujourd'hui »
function conseilsRegistreNotes(){
  const l = [];
  if(!['secretariat', 'direction', 'fondation'].includes(ui.role)) return l;
  if(rnEtat.pages === null){ if(!rnEtat.promesse) chargerRegistreNotes().then(() => { if(ui.currentView === 'dashboard' && rnEtat.pages && rnEtat.pages.length) renderView('dashboard'); }); return l; }
  if(rnAdmin()){
    const n = rnEtat.pages.filter(p => p.statut === 'a_valider' && p.auteurId !== session.userId).length;
    if(n) l.push({ ic: 'notebook-pen', texte: `${n} note${n > 1 ? 's' : ''} du jour à valider`, detail: 'Registre des notes journalières du secrétariat', bouton: 'Valider', action: "ui.filters.rn = { pageId: null, mois: '', recherche: '', filtre: 'a_valider' }; go('registre-notes')" });
  }
  const p = rnMaPageDuJour();
  if(p && p.statut === 'a_corriger') l.push({ ic: 'notebook-pen', texte: 'Votre note du jour est à corriger', detail: p.commentaireValidation || '', bouton: 'Corriger', action: `ui.filters.rn = { pageId: '${p.id}' }; go('registre-notes')` });
  else if(ui.role === 'secretariat' && new Date().getHours() >= 15 && (!p || p.statut === 'brouillon'))
    l.push({ ic: 'notebook-pen', texte: p ? 'Mettez au propre la note du jour' : 'Note du jour pas encore commencée', detail: 'Préparez le rapport du jour et envoyez-le à la direction', bouton: 'Ouvrir', action: "go('registre-notes')" });
  return l;
}
