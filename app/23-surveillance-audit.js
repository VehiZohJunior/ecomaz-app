/* ---------------------------------------------------------------------
   12bis. SURVEILLANCE TECHNIQUE — journalise automatiquement les erreurs
   JavaScript non gérées dans "erreurs_client" (voir schema.sql section 23),
   pour que le développeur soit informé d'un bug sans dépendre d'un
   signalement du client. Toujours "best effort" : ne doit jamais elle-même
   faire planter l'appli, et se limite à un nombre d'erreurs par session
   pour ne pas inonder la base en cas de boucle d'erreurs.
   --------------------------------------------------------------------- */
let __nbErreursJournalisees = 0;
async function journaliserErreurClient(message, pile){
  if(__nbErreursJournalisees >= 20) return;
  __nbErreursJournalisees++;
  try{
    await sb.from('erreurs_client').insert({
      ecole_id: session?.ecoleId || null,
      role: session?.role || null,
      message: String(message || '').slice(0, 2000),
      pile: String(pile || '').slice(0, 4000),
      page: window.location.href,
      user_agent: navigator.userAgent,
    });
  }catch(_e){ /* surveillance best-effort : ne jamais bloquer l'appli pour ça */ }
}
window.addEventListener('error', (ev) => {
  journaliserErreurClient(ev.message, ev.error?.stack);
});
window.addEventListener('unhandledrejection', (ev) => {
  journaliserErreurClient('Promise rejetée : ' + (ev.reason?.message || ev.reason), ev.reason?.stack);
});

/* ---------------------------------------------------------------------
   12ter. PISTE D'AUDIT COMPTABLE — journalise chaque création/modification/
   suppression d'un mouvement financier dans "journal_compta" (voir
   schema.sql section 24), pour qu'on sache toujours qui a fait quoi et
   quand. Best-effort comme la surveillance technique : ne doit jamais
   empêcher l'action comptable elle-même de réussir.
   --------------------------------------------------------------------- */
// Le journal d'audit comptable est désormais tenu par la BASE elle-même
// (schema.sql section 96 : déclencheurs sur paiements, cotisations, ventes,
// salaires et dépenses) — impossible à contourner ou à falsifier. Cette
// fonction est gardée pour ne rien casser, mais n'écrit plus rien.
async function journaliserCompta(){ /* voir schema.sql section 96 */ }


/* =====================================================================
   « JE CRÉE UNE ÉVALUATION » (enseignant) et « BOÎTE À ÉVALUATIONS »
   (secrétariat) — schema.sql section 116, fonction convertir-evaluation.
   Le sujet : photo d'une feuille → document modifiable (IA gratuite),
   fichier importé (Word / Excel lus sur le téléphone, PDF remis en forme),
   ou saisie directe. « Modifier le document », export Word / Excel,
   impression, puis « Valider l'évaluation » : le sujet part au secrétariat
   et devient non modifiable. Le secrétariat ne peut que lire et imprimer.
   ===================================================================== */
const TYPES_SUJET = ['Devoir', 'Interrogation', 'Devoir surveillé', 'Composition', 'Examen blanc', 'Exercice'];
// Liste blanche : tout le reste est retiré (seul le texte est gardé). Indispensable : le
// secrétariat affiche des sujets écrits par d'autres comptes.
function nettoyerHtmlSujet(html){
  const doc = new DOMParser().parseFromString(`<body>${String(html || '')}</body>`, 'text/html');
  const RENOMME = { h1:'h2', h2:'h2', h3:'h3', h4:'h3', h5:'h3', h6:'h3', b:'strong', strong:'strong', i:'em', em:'em', u:'u', p:'p', div:'p',
    br:'br', ol:'ol', ul:'ul', li:'li', table:'table', thead:'thead', tbody:'tbody', tr:'tr', th:'th', td:'td', img:'img', blockquote:'p' };
  const IGNORE = new Set(['script', 'style', 'iframe', 'object', 'embed', 'link', 'meta', 'title', 'noscript', 'template', 'svg', 'math', 'form', 'input', 'button', 'select', 'textarea']);
  const copier = (src, dest) => {
    src.childNodes.forEach(n => {
      if(n.nodeType === 3){ dest.appendChild(document.createTextNode(n.nodeValue)); return; }
      if(n.nodeType !== 1) return;
      const nom = n.nodeName.toLowerCase();
      if(IGNORE.has(nom)) return;
      const cible = RENOMME[nom];
      if(!cible){ copier(n, dest); return; } // balise inconnue (span, font, a…) : on garde le texte
      if(cible === 'img'){
        const s = n.getAttribute('src') || '';
        if(/^data:image\/(png|jpe?g|gif|webp);base64,[a-z0-9+/=\s]+$/i.test(s) && s.length < 1200000){ const im = document.createElement('img'); im.setAttribute('src', s.replace(/\s/g, '')); im.setAttribute('alt', ''); dest.appendChild(im); }
        return;
      }
      const el = document.createElement(cible);
      if(cible === 'td' || cible === 'th') ['colspan', 'rowspan'].forEach(a => { const v = parseInt(n.getAttribute(a), 10); if(v > 1 && v < 30) el.setAttribute(a, String(v)); });
      copier(n, el); dest.appendChild(el);
    });
  };
  const sortie = document.createElement('div');
  copier(doc.body, sortie);
  return sortie.innerHTML.replace(/<p>\s*<\/p>/g, '').trim();
}
const texteSeulSujet = html => String(html || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
function chargerSujets(){
  if(DB.sujets !== undefined) return;
  DB.sujets = null;
  sb.from('sujets_evaluation').select('*').order('updated_at', { ascending: false })
    .then(({ data, error }) => { DB.sujets = error ? [] : rowsToCamel(data || []); if(['creer-evaluation', 'boite-evaluations', 'dashboard'].includes(ui.currentView)) renderView(ui.currentView); }, () => { DB.sujets = []; });
}
function enteteSujet(s){
  const m = DB.meta || {};
  const lignes = [s.type, s.matiere].filter(Boolean).map(escapeHtml).join(' — ');
  return `<header class="sujet-entete">
    <div class="se-ecole">${m.logo ? `<img src="${escapeHtml(m.logo)}" alt="">` : ''}<div><strong>${escapeHtml(m.nomEcole || '')}</strong><span>Année scolaire ${escapeHtml(m.anneeScolaire || '')}</span></div></div>
    <div class="se-infos"><span>Classe : <strong>${escapeHtml(classeName(s.classeId))}</strong></span>${s.duree ? `<span>Durée : <strong>${escapeHtml(s.duree)}</strong></span>` : ''}${s.datePrevue ? `<span>Date : <strong>${fmtDate(s.datePrevue)}</strong></span>` : ''}</div>
    <div class="se-eleve">Nom et prénoms : ……………………………………………………………… N° : ………</div>
    <h1 class="se-titre">${escapeHtml(s.titre || '')}</h1>${lignes ? `<div class="se-sous">${lignes}</div>` : ''}
  </header>`;
}
function htmlImpressionSujet(s){ return `<article class="sujet-impression">${enteteSujet(s)}<div class="sujet-corps">${nettoyerHtmlSujet(s.contenuHtml)}</div></article>`; }

/* ---------- Console enseignant ---------- */
function renderCreerEvaluation(){
  if(ui.role !== 'enseignant') return '<div class="view active"></div>';
  const fiche = session.enseignantId ? enseignantById(session.enseignantId) : null;
  const classes = classesVisibles();
  if(!fiche || !classes.length) return `<div class="view active"><div class="panel"><h2>${icone('file-text')} Je crée une évaluation</h2>
    <p class="hint">Ce module s’ouvre dès que la direction a validé votre ou vos classes (Accueil → Mon inscription).</p></div></div>`;
  if(ui.sujet) return renderEditeurSujet(fiche, classes);
  chargerSujets();
  if(DB.sujets === null) return `<div class="view active"><div class="panel"><div class="etat-vide"><span>Chargement de vos évaluations…</span></div></div></div>`;
  const mes = (DB.sujets || []).filter(s => s.enseignantId === fiche.id);
  const brouillons = mes.filter(s => s.statut !== 'validee'), validees = mes.filter(s => s.statut === 'validee');
  const ligne = s => `<li class="sujet-ligne">
      <div class="sl-txt"><strong>${escapeHtml(s.titre)}</strong><small>${escapeHtml(s.type)} · ${escapeHtml(s.matiere || '')} · ${escapeHtml(classeName(s.classeId))}${s.datePrevue ? ' · prévue le ' + fmtDate(s.datePrevue) : ''}</small>
        ${s.statut === 'validee' ? `<span class="badge-etat ok">${icone('lock')} Validée le ${fmtDate(String(s.valideLe).slice(0, 10))} · envoyée au secrétariat</span>${s.evaluationId ? `<span class="badge-etat ok">${icone('notebook-pen')} Grille de notes créée</span>` : (s.datePrevue && s.datePrevue <= todayISO() && !estComposition(s) ? `<button type="button" class="btn secondary sm" style="align-self:flex-start;" onclick="creerGrilleDepuisSujet('${s.id}')">${icone('notebook-pen')} Créer la grille de notes</button>` : '')}` : '<span class="badge-etat attente">Brouillon — pas encore envoyé</span>'}</div>
      <div class="sl-actions">${s.statut === 'validee'
        ? `<button type="button" class="btn secondary sm" onclick="apercuSujet('${s.id}')">${icone('eye')} Voir / imprimer</button>`
        : `<button type="button" class="btn sm" onclick="ouvrirSujet('${s.id}')">${icone('pencil')} Continuer</button>
           <button type="button" class="icon-btn" aria-label="Supprimer le brouillon ${escapeHtml(s.titre)}" title="Supprimer le brouillon" onclick="supprimerSujet('${s.id}')">🗑️</button>`}</div></li>`;
  return `<div class="view active">
    <div class="panel sujet-accueil">
      <div class="panel-head"><div><h2>${icone('file-text')} Je crée une évaluation</h2>
        <div class="sub">Photographiez votre feuille, importez votre fichier (PDF, Word, Excel) ou écrivez directement. Vous modifiez, puis vous validez : le secrétariat l’imprime.</div></div>
        <button type="button" class="btn" onclick="nouveauSujet()">+ Nouvelle évaluation</button></div>
      <ol class="sujet-etapes"><li><strong>1.</strong> Classe, matière, titre</li><li><strong>2.</strong> Photo, fichier ou saisie</li><li><strong>3.</strong> Modifier le document</li><li><strong>4.</strong> Valider l’évaluation</li></ol>
    </div>
    <div class="panel"><h3>Brouillons (${brouillons.length})</h3>${brouillons.length ? `<ul class="sujets-liste">${brouillons.map(ligne).join('')}</ul>` : '<p class="hint">Aucun brouillon.</p>'}</div>
    <div class="panel"><h3>Évaluations validées (${validees.length})</h3>${validees.length ? `<ul class="sujets-liste">${validees.map(ligne).join('')}</ul>` : '<p class="hint">Aucune évaluation validée pour le moment.</p>'}</div>
  </div>`;
}
function nouveauSujet(){
  const fiche = enseignantById(session.enseignantId), c = classesVisibles()[0];
  ui.sujet = { id:null, classeId:c?.id || '', matiere:(matieresDeEnseignant(fiche, c?.id)[0] || ''), type:'Devoir', titre:'', datePrevue:'', duree:'', contenuHtml:'', source:'saisie', statut:'brouillon' };
  ui.sujetEdition = false; ui.sujetImport = true;
  renderView('creer-evaluation');
}
function ouvrirSujet(id){
  const s = (DB.sujets || []).find(x => x.id === id); if(!s || s.statut === 'validee') return;
  ui.sujet = { ...s }; ui.sujetEdition = false; ui.sujetImport = !texteSeulSujet(s.contenuHtml);
  renderView('creer-evaluation');
}
function fermerSujet(){
  lireFormSujet();
  const s = ui.sujet;
  const original = s?.id ? (DB.sujets || []).find(x => x.id === s.id) : null;
  const modifie = s && (original ? ['titre', 'classeId', 'matiere', 'type', 'datePrevue', 'duree', 'contenuHtml'].some(k => String(original[k] || '') !== String(s[k] || '')) : (s.titre || texteSeulSujet(s.contenuHtml)));
  if(modifie && !confirm('Quitter sans enregistrer vos dernières modifications ?')) return;
  ui.sujet = null; ui.sujetEdition = false; renderView('creer-evaluation');
}
function renderEditeurSujet(fiche, classes){
  const s = ui.sujet, aContenu = !!texteSeulSujet(s.contenuHtml) || /<img/i.test(s.contenuHtml || '');
  const matieres = [...new Set([...matieresDeEnseignant(fiche, s.classeId), s.matiere].filter(Boolean))];
  const choixImport = `<div class="sujet-import">
      <label class="si-choix"><input type="file" accept="image/*" capture="environment" multiple onchange="importerPhotosSujet(event)" hidden>
        <span class="si-ic">${icone('camera')}</span><strong>Photographier ma feuille</strong><small>Le modèle sur papier devient un document modifiable (jusqu’à 4 pages).</small></label>
      <label class="si-choix"><input type="file" accept=".pdf,.docx,.xlsx,.xls,.csv,.txt,image/*,application/pdf" onchange="importerFichierSujet(event)" hidden>
        <span class="si-ic">${icone('upload')}</span><strong>Importer un fichier</strong><small>Depuis le téléphone ou l’ordinateur : PDF, Word (.docx), Excel, image.</small></label>
      <button type="button" class="si-choix" onclick="ecrireSujetDirect()"><span class="si-ic">${icone('pencil')}</span><strong>Écrire directement</strong><small>Une page vierge avec un modèle d’en-tête et d’exercices.</small></button>
    </div>`;
  return `<div class="view active sujet-editeur">
    <div class="panel">
      <div class="panel-head"><div><h2>${icone('file-text')} ${s.id ? 'Modifier mon évaluation' : 'Nouvelle évaluation'}</h2><div class="sub">Brouillon : rien n’est envoyé tant que vous n’avez pas touché « Valider l’évaluation ».</div></div>
        <button type="button" class="btn secondary sm" onclick="fermerSujet()">‹ Mes évaluations</button></div>
      <form id="formSujet" class="form-grid" onsubmit="return false" oninput="ui.sujetModifie=true">
        <div class="field"><label for="sjClasse">Classe</label><select id="sjClasse" onchange="lireFormSujet(); renderView('creer-evaluation')">${classes.map(c => `<option value="${c.id}" ${c.id === s.classeId ? 'selected' : ''}>${escapeHtml(c.nom)}</option>`).join('')}</select></div>
        <div class="field"><label for="sjMatiere">Matière</label><select id="sjMatiere">${matieres.map(m => `<option ${m === s.matiere ? 'selected' : ''}>${escapeHtml(m)}</option>`).join('')}</select></div>
        <div class="field"><label for="sjType">Type d’évaluation</label><select id="sjType">${TYPES_SUJET.map(t => `<option ${t === s.type ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
        <div class="field"><label for="sjDate">Date prévue</label><input id="sjDate" type="date" value="${escapeHtml(s.datePrevue || '')}"></div>
        <div class="field span2"><label for="sjTitre">Titre</label><input id="sjTitre" maxlength="160" required placeholder="Ex : Devoir de mathématiques n°2 — les fractions" value="${escapeHtml(s.titre || '')}"></div>
        <div class="field"><label for="sjDuree">Durée</label><input id="sjDuree" maxlength="40" placeholder="Ex : 1 heure" value="${escapeHtml(s.duree || '')}"></div>
      </form>
    </div>
    <div class="panel">
      <h3>Le sujet</h3>
      <div id="sujetEtat" class="sujet-etat" role="status" aria-live="polite"></div>
      ${!aContenu || ui.sujetImport ? choixImport : ''}
      ${aContenu ? `
        <div class="sujet-barre no-print">
          ${ui.sujetEdition
            ? `<div class="sujet-outils" role="toolbar" aria-label="Mise en forme">
                <button type="button" class="btn secondary sm" onmousedown="event.preventDefault()" onclick="document.execCommand('bold')" title="Gras"><strong>G</strong></button>
                <button type="button" class="btn secondary sm" onmousedown="event.preventDefault()" onclick="document.execCommand('italic')" title="Italique"><em>I</em></button>
                <button type="button" class="btn secondary sm" onmousedown="event.preventDefault()" onclick="document.execCommand('underline')" title="Souligné"><u>S</u></button>
                <button type="button" class="btn secondary sm" onmousedown="event.preventDefault()" onclick="document.execCommand('formatBlock', false, 'h3')">Titre</button>
                <button type="button" class="btn secondary sm" onmousedown="event.preventDefault()" onclick="document.execCommand('formatBlock', false, 'p')">Texte</button>
                <button type="button" class="btn secondary sm" onmousedown="event.preventDefault()" onclick="document.execCommand('insertOrderedList')">1. Liste</button>
                <button type="button" class="btn secondary sm" onmousedown="event.preventDefault()" onclick="document.execCommand('insertText', false, ' ………………………………………… ')">… Ligne à compléter</button>
                <button type="button" class="btn secondary sm" onmousedown="event.preventDefault()" onclick="insererTableauSujet()">Tableau</button>
              </div>
              <button type="button" class="btn sm" onclick="lireFormSujet(); ui.sujetEdition=false; renderView('creer-evaluation')">${icone('check')} Terminer la modification</button>`
            : `<button type="button" class="btn sujet-btn-modifier" onclick="lireFormSujet(); ui.sujetEdition=true; ui.sujetImport=false; renderView('creer-evaluation'); setTimeout(() => document.getElementById('sujetDoc')?.focus(), 50)">${icone('pencil')} Modifier le document</button>
               ${ui.sujetImport ? '' : `<button type="button" class="btn secondary sm" onclick="lireFormSujet(); ui.sujetImport=true; renderView('creer-evaluation')">Remplacer par un autre modèle</button>`}`}
        </div>
        <div class="sujet-page">${enteteSujet(s)}<div id="sujetDoc" class="sujet-corps ${ui.sujetEdition ? 'en-edition' : ''}" ${ui.sujetEdition ? 'contenteditable="true" spellcheck="true" aria-label="Contenu du sujet, modifiable" role="textbox" aria-multiline="true"' : ''}>${nettoyerHtmlSujet(s.contenuHtml)}</div></div>` : ''}
      <div class="form-actions sujet-actions">
        <button type="button" class="btn secondary" onclick="enregistrerSujet(false)">${icone('save') || '💾'} Enregistrer le brouillon</button>
        ${aContenu ? `<button type="button" class="btn secondary" onclick="lireFormSujet(); telechargerSujetWord(ui.sujet)">${icone('download')} Word</button>
        <button type="button" class="btn secondary" onclick="lireFormSujet(); telechargerSujetExcel(ui.sujet)">${icone('download')} Excel</button>
        <button type="button" class="btn secondary" onclick="lireFormSujet(); imprimerSujets([ui.sujet])">${icone('printer')} Aperçu avant impression</button>
        <button type="button" class="btn sujet-valider" onclick="enregistrerSujet(true)">${icone('circle-check')} Valider l’évaluation</button>` : ''}
      </div>
    </div>
  </div>`;
}
// Recopie le formulaire et le document dans ui.sujet (avant tout réaffichage)
function lireFormSujet(){
  const s = ui.sujet; if(!s) return;
  const v = id => document.getElementById(id);
  if(v('sjClasse')) s.classeId = v('sjClasse').value;
  if(v('sjMatiere')) s.matiere = v('sjMatiere').value;
  if(v('sjType')) s.type = v('sjType').value;
  if(v('sjDate')) s.datePrevue = v('sjDate').value || '';
  if(v('sjTitre')) s.titre = v('sjTitre').value.trim();
  if(v('sjDuree')) s.duree = v('sjDuree').value.trim();
  if(v('sujetDoc')) s.contenuHtml = nettoyerHtmlSujet(v('sujetDoc').innerHTML);
}
function ecrireSujetDirect(){
  lireFormSujet();
  const s = ui.sujet;
  if(!texteSeulSujet(s.contenuHtml)) s.contenuHtml = `<p><strong>Consigne :</strong> lisez attentivement chaque question avant de répondre.</p>
    <h3>Exercice 1</h3><p>…</p><h3>Exercice 2</h3><p>…</p><h3>Exercice 3</h3><p>…</p>`;
  s.source = s.source || 'saisie'; ui.sujetImport = false; ui.sujetEdition = true;
  renderView('creer-evaluation');
  setTimeout(() => document.getElementById('sujetDoc')?.focus(), 50);
}
function insererTableauSujet(){
  const html = '<table><tbody><tr><th>…</th><th>…</th><th>…</th></tr><tr><td>…</td><td>…</td><td>…</td></tr><tr><td>…</td><td>…</td><td>…</td></tr></tbody></table><p></p>';
  document.getElementById('sujetDoc')?.focus();
  document.execCommand('insertHTML', false, html);
}
function etatSujet(texte, erreur){
  const el = document.getElementById('sujetEtat'); if(!el) return;
  el.className = 'sujet-etat' + (erreur ? ' erreur' : texte ? ' encours' : '');
  el.innerHTML = texte ? (erreur ? escapeHtml(texte) : `<span class="spinner" aria-hidden="true"></span> ${escapeHtml(texte)}`) : '';
}
function sujetConverti(html, titre, source){
  const s = ui.sujet; if(!s) return;
  s.contenuHtml = nettoyerHtmlSujet(html); s.source = source;
  if(!s.titre && titre) s.titre = String(titre).slice(0, 160);
  ui.sujetImport = false; ui.sujetEdition = false;
  renderView('creer-evaluation');
  toast('Document prêt ✅ : relisez-le, puis « Modifier le document » si besoin');
  setTimeout(() => document.querySelector('.sujet-btn-modifier')?.scrollIntoView({ block:'center', behavior:'smooth' }), 80);
}
async function convertirSujetEnLigne(corps){
  if(!navigator.onLine) throw new Error('Pas de connexion internet : la conversion a besoin du réseau. Vous pouvez « Écrire directement ».');
  const { data, error } = await sb.functions.invoke('convertir-evaluation', { body: corps });
  if(error) throw new Error(await messageErreurFonction(error));
  if(!data?.ok) throw new Error(data?.error || 'Conversion impossible');
  return data;
}
async function importerPhotosSujet(ev){
  lireFormSujet();
  const fichiers = [...(ev.target.files || [])].filter(f => (f.type || '').startsWith('image/')).slice(0, 4);
  if(!fichiers.length) return;
  try{
    etatSujet(`Lecture de ${fichiers.length > 1 ? fichiers.length + ' pages' : 'la feuille'}… (10 à 40 secondes)`);
    const photos = []; for(const f of fichiers) photos.push(await smartFillCompresserImage(f));
    const r = await convertirSujetEnLigne({ typeSource:'photo', photos, mimeType:'image/jpeg' });
    sujetConverti(r.html, r.titre, 'photo');
  }catch(e){ etatSujet(e.message, true); }
  finally{ ev.target.value = ''; }
}
async function importerFichierSujet(ev){
  lireFormSujet();
  const f = ev.target.files?.[0]; if(!f) return;
  const nom = (f.name || '').toLowerCase(), type = f.type || '';
  try{
    if(f.size > 20 * 1024 * 1024) throw new Error('Fichier trop lourd (20 Mo au maximum).');
    etatSujet('Lecture du fichier…');
    if(type.startsWith('image/')){
      etatSujet('Lecture de l’image… (10 à 40 secondes)');
      const r = await convertirSujetEnLigne({ typeSource:'photo', photos:[await smartFillCompresserImage(f)], mimeType:'image/jpeg' });
      return sujetConverti(r.html, r.titre, 'photo');
    }
    if(nom.endsWith('.docx')){
      // Word : la mise en forme (titres, listes, tableaux, images) est gardée, sur le téléphone
      const mammoth = await chargerScript(MAMMOTH_URL, 'mammoth');
      const r = await mammoth.convertToHtml({ arrayBuffer: await f.arrayBuffer() });
      if(!texteSeulSujet(r.value) && !/<img/i.test(r.value)) throw new Error('Ce document Word est vide.');
      return sujetConverti(r.value, f.name.replace(/\.[^.]+$/, ''), 'fichier');
    }
    if(/\.(xlsx|xls|csv)$/.test(nom)){
      const XLSX = await chargerXLSX();
      const wb = XLSX.read(await f.arrayBuffer(), { type:'array' });
      const html = wb.SheetNames.slice(0, 5).map(n => `${wb.SheetNames.length > 1 ? `<h3>${escapeHtml(n)}</h3>` : ''}${XLSX.utils.sheet_to_html(wb.Sheets[n], { header:'', footer:'' })}`).join('');
      return sujetConverti(html, f.name.replace(/\.[^.]+$/, ''), 'fichier');
    }
    if(nom.endsWith('.txt') || type.startsWith('text/')){
      const t = await f.text();
      return sujetConverti(t.split(/\n{2,}/).map(b => `<p>${escapeHtml(b).replace(/\n/g, '<br>')}</p>`).join(''), f.name.replace(/\.[^.]+$/, ''), 'fichier');
    }
    if(nom.endsWith('.pdf') || type === 'application/pdf'){
      // PDF : texte remis en forme ; PDF scanné : lu comme des photos
      etatSujet('Lecture du PDF… (10 à 40 secondes)');
      const r = await texteDuPdf(f);
      const conv = r.images ? await convertirSujetEnLigne({ typeSource:'photo', photos:r.images, mimeType:'image/jpeg' })
        : await convertirSujetEnLigne({ typeSource:'document', texte:r.texte.slice(0, 30000) });
      return sujetConverti(conv.html, conv.titre || f.name.replace(/\.[^.]+$/, ''), 'fichier');
    }
    if(nom.endsWith('.doc')) throw new Error('Ancien format Word (.doc) : enregistrez-le en .docx ou en PDF, ou prenez la feuille en photo.');
    throw new Error('Format non reconnu : PDF, Word (.docx), Excel (.xlsx, .xls, .csv), texte ou image.');
  }catch(e){ etatSujet(e.message, true); }
  finally{ ev.target.value = ''; }
}
async function enregistrerSujet(valider){
  lireFormSujet();
  const s = ui.sujet; if(!s) return;
  if(!s.titre || s.titre.length < 2){ toast('Donnez un titre à l’évaluation'); document.getElementById('sjTitre')?.focus(); return; }
  if(!s.classeId){ toast('Choisissez la classe'); return; }
  if(valider && texteSeulSujet(s.contenuHtml).length < 10){ toast('Le sujet est vide : ajoutez son contenu avant de le valider'); return; }
  if(valider && !confirm(`Valider « ${s.titre} » ?\n\nL’évaluation part au secrétariat pour être imprimée.\nAprès validation, plus personne ne pourra la modifier.`)) return;
  if(!navigator.onLine){ toast('Pas de connexion internet : réessayez dès que le réseau revient'); return; }
  const ligne = { classe_id:s.classeId, matiere:s.matiere || '', type:s.type || 'Devoir', titre:s.titre, date_prevue:s.datePrevue || null, duree:s.duree || '', contenu_html:s.contenuHtml || '', source:s.source || 'saisie' };
  try{
    let res;
    if(s.id) res = await sb.from('sujets_evaluation').update(ligne).eq('id', s.id).select().single();
    else res = await sb.from('sujets_evaluation').insert({ ...ligne, enseignant_id: session.enseignantId }).select().single();
    if(res.error) throw res.error;
    let row = rowToCamel(res.data);
    if(valider){
      const v = await sb.from('sujets_evaluation').update({ statut:'validee' }).eq('id', row.id).select().single();
      if(v.error){ ui.sujet = { ...row }; throw v.error; }
      row = rowToCamel(v.data);
    }
    DB.sujets = [row, ...(DB.sujets || []).filter(x => x.id !== row.id)];
    if(valider){ ui.sujet = null; ui.sujetEdition = false; toast('Évaluation validée ✅ : elle est dans la Boîte à évaluations du secrétariat');
      sb.functions.invoke('notifier-personnel', { body: { type: 'sujet_valide' } }).catch(() => {}); }
    else { ui.sujet = { ...row }; toast('Brouillon enregistré ✅'); }
    renderView('creer-evaluation');
  }catch(e){ toast('Enregistrement impossible : ' + (e.message || e)); }
}
async function supprimerSujet(id){
  const s = (DB.sujets || []).find(x => x.id === id); if(!s || s.statut === 'validee') return;
  if(!confirm(`Supprimer le brouillon « ${s.titre} » ? Il sera effacé définitivement.`)) return;
  const { error } = await sb.from('sujets_evaluation').delete().eq('id', id);
  if(error){ toast('Suppression impossible : ' + error.message); return; }
  DB.sujets = DB.sujets.filter(x => x.id !== id); toast('Brouillon supprimé'); renderView('creer-evaluation');
}
function apercuSujet(id){ const s = (DB.sujets || []).find(x => x.id === id); if(s) imprimerSujets([s]); }

/* ---------- Évaluation validée → grille de notes (schema.sql section 117) ---------- */
const TYPE_GRILLE = { 'Devoir':'Devoir', 'Devoir surveillé':'Devoir', 'Interrogation':'Interrogation', 'Exercice':'Exercice de classe' };
const estComposition = s => /composition|examen/i.test(s.type || '');
function tachesNotesDepuisSujets(fiche, ids, auj, effectif){
  const sortie = [], depuis = isoDansJours(-45);
  (DB.sujets || []).filter(s => s.statut === 'validee' && s.enseignantId === fiche.id && ids.has(s.classeId) && s.datePrevue && s.datePrevue <= auj && s.datePrevue >= depuis)
    .sort((a, b) => a.datePrevue.localeCompare(b.datePrevue)).forEach(s => {
      const cl = escapeHtml(classeName(s.classeId)), quand = `${escapeHtml(s.matiere || '')} · ${s.datePrevue === auj ? 'aujourd’hui' : 'le ' + fmtDate(s.datePrevue)}`;
      if(estComposition(s)){
        const trim = trimestreDeDate(s.datePrevue), eleves = new Set(effectif(s.classeId).map(e => e.id));
        const saisies = (DB.notes || []).some(n => eleves.has(n.eleveId) && n.matiere === s.matiere && n.trimestre === trim && /composition/i.test(n.type || '') && n.note != null);
        if(!saisies) sortie.push({ etat:'afaire', titre:`Saisir les notes de la composition « ${escapeHtml(s.titre)} » (${cl})`, detail:`${quand} · les notes de composition se saisissent dans « Compositions et bulletins ».`, bouton:'Saisir les notes', action:`allerNotesClasse('${s.classeId}','${trim}')` });
        return;
      }
      if(s.evaluationId && (DB.evaluations || []).some(e => e.id === s.evaluationId)) return; // la grille existe : la tâche « Saisir les notes » classique prend le relais
      sortie.push({ etat:'afaire', titre:`Saisir les notes — ${escapeHtml(s.type)} « ${escapeHtml(s.titre)} » (${cl})`, detail:`${quand} · évaluation validée, faite en classe : créez la grille de notes et tapez les notes.`, bouton:'Créer la grille de notes', action:`creerGrilleDepuisSujet('${s.id}')` });
    });
  return sortie;
}
async function creerGrilleDepuisSujet(sujetId){
  const s = (DB.sujets || []).find(x => x.id === sujetId); if(!s) return;
  if(s.evaluationId && (DB.evaluations || []).some(e => e.id === s.evaluationId)) return allerEvaluation(s.evaluationId);
  try{
    const ev = await dbInsert('evaluations', { classeId: s.classeId, matiere: s.matiere || 'Autre', trimestre: trimestreDeDate(s.datePrevue), type: TYPE_GRILLE[s.type] || 'Devoir', titre: String(s.titre || '').slice(0, 120), date: s.datePrevue, noteSur: 20 });
    DB.evaluations = (DB.evaluations || []).concat(ev);
    const { error } = await sb.from('sujets_evaluation').update({ evaluation_id: ev.id }).eq('id', s.id);
    if(!error) s.evaluationId = ev.id;
    toast('Grille de notes créée ✅ : tapez les notes (sur 20)');
    allerEvaluation(ev.id);
    setTimeout(() => { const p = document.querySelector('[name^=n_]'); if(p) p.focus(); }, 80);
  }catch(e){ toast('Création impossible : ' + (e.message || e)); }
}
/* ---------- Export Word / Excel ---------- */
const nomFichierSujet = s => (`${s.type || 'Evaluation'} ${s.matiere || ''} ${classeName(s.classeId)} ${s.titre || ''}`).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w-]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '').slice(0, 90) || 'evaluation';
function telechargerBlobSujet(blob, nom){ const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nom; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }
function telechargerSujetWord(s){
  const corps = htmlImpressionSujet(s);
  const doc = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"><title>${escapeHtml(s.titre || '')}</title>
    <!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument></xml><![endif]-->
    <style>@page{size:21cm 29.7cm;margin:1.8cm} body{font-family:Calibri,Arial,sans-serif;font-size:12pt} h1{font-size:16pt;text-align:center;margin:8pt 0 2pt} h2{font-size:14pt} h3{font-size:12.5pt;margin:12pt 0 4pt}
    table{border-collapse:collapse;width:100%} td,th{border:1px solid #000;padding:4pt;vertical-align:top} .se-ecole img{height:48px} .se-ecole span,.se-sous{display:block;font-size:10pt} .se-infos span{margin-right:18pt} .se-eleve{margin:8pt 0;border-bottom:1px solid #000;padding-bottom:6pt} .se-sous{text-align:center}</style></head><body>${corps}</body></html>`;
  telechargerBlobSujet(new Blob(['﻿', doc], { type:'application/msword' }), nomFichierSujet(s) + '.doc');
  toast('Fichier Word téléchargé (ouvrez-le avec Word ou WPS Office)');
}
async function telechargerSujetExcel(s){
  try{
    const XLSX = await chargerXLSX();
    const m = DB.meta || {}, lignes = [[m.nomEcole || ''], [`Année scolaire ${m.anneeScolaire || ''}`], [`Classe : ${classeName(s.classeId)}`, s.duree ? `Durée : ${s.duree}` : '', s.datePrevue ? `Date : ${fmtDate(s.datePrevue)}` : ''],
      ['Nom et prénoms : ……………………………………'], [], [s.titre || ''], [[s.type, s.matiere].filter(Boolean).join(' — ')], []];
    const racine = document.createElement('div'); racine.innerHTML = nettoyerHtmlSujet(s.contenuHtml);
    const parcourir = el => [...el.children].forEach(n => {
      const nom = n.nodeName.toLowerCase();
      if(nom === 'table') n.querySelectorAll('tr').forEach(tr => lignes.push([...tr.children].map(c => c.textContent.trim())));
      else if(nom === 'ol' || nom === 'ul') [...n.children].forEach((li, i) => lignes.push([`${nom === 'ol' ? (i + 1) + '.' : '•'} ${li.textContent.trim()}`]));
      else if(n.textContent.trim()) lignes.push([n.textContent.trim()]);
    });
    parcourir(racine);
    const ws = XLSX.utils.aoa_to_sheet(lignes);
    ws['!cols'] = [{ wch: 90 }, { wch: 28 }, { wch: 22 }];
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Sujet');
    XLSX.writeFile(wb, nomFichierSujet(s) + '.xlsx');
    toast('Fichier Excel téléchargé');
  }catch(e){ toast('Export Excel impossible : ' + e.message); }
}

/* ---------- Impression (enseignant : aperçu ; secrétariat : impression) ---------- */
function imprimerSujets(liste){
  if(!liste.length) return;
  const un = liste.length === 1 ? liste[0] : null;
  const effectif = id => (DB.eleves || []).filter(e => e.classeId === id && e.statut === 'Actif').length;
  const exemplaires = ui.role === 'secretariat' ? `<p class="hint no-print" style="margin:0 0 8px;">${liste.map(s => `${escapeHtml(classeName(s.classeId))} : <strong>${effectif(s.classeId)} élève(s)</strong>`).filter((v, i, a) => a.indexOf(v) === i).join(' · ')} — choisissez le nombre d’exemplaires dans la fenêtre d’impression.</p>` : '';
  openModal(un ? un.titre : `${liste.length} évaluations à imprimer`, `
    <div class="form-actions no-print" style="margin-top:0;justify-content:space-between;">
      <span class="hint" style="margin:0;">${ui.role === 'secretariat' ? 'Lecture seule : le secrétariat imprime, sans modifier.' : 'Aperçu tel qu’il sera imprimé.'}</span>
      <button type="button" class="btn" onclick="window.print()">${icone('printer')} Imprimer / PDF</button></div>
    ${exemplaires}
    <div class="sujets-impression">${liste.map(htmlImpressionSujet).join('')}</div>`);
}

/* ---------- Secrétariat : Boîte à évaluations (lecture et impression uniquement) ---------- */
function renderBoiteEvaluations(){
  if(ui.role !== 'secretariat') return '<div class="view active"><div class="panel"><p class="hint">La Boîte à évaluations est réservée au secrétariat.</p></div></div>';
  chargerSujets();
  if(DB.sujets === null) return `<div class="view active"><div class="panel"><div class="etat-vide"><span>Chargement de la boîte…</span></div></div></div>`;
  // « Nouveau » : validé depuis la dernière ouverture de la boîte (repère lu une fois par session)
  if(ui.boiteVu === undefined){ ui.boiteVu = ''; try{ ui.boiteVu = localStorage.getItem('ecomaz_boite_eval_vu') || ''; }catch(_e){} }
  const vu = ui.boiteVu;
  const f = ui.filters, recues = (DB.sujets || []).filter(s => s.statut === 'validee');
  const liste = recues.filter(s => (!f.boiteClasse || s.classeId === f.boiteClasse) && (!f.boiteEns || s.enseignantId === f.boiteEns))
    .sort((a, b) => String(b.valideLe).localeCompare(String(a.valideLe)));
  const nouvelles = recues.filter(s => String(s.valideLe) > vu).length;
  // La visite marque les évaluations comme vues (pour la prochaine ouverture)
  try{ const max = recues.reduce((m, s) => String(s.valideLe) > m ? String(s.valideLe) : m, vu); localStorage.setItem('ecomaz_boite_eval_vu', max); }catch(_e){}
  const classes = [...new Set(recues.map(s => s.classeId))].map(id => ({ id, nom: classeName(id) })).sort((a, b) => a.nom.localeCompare(b.nom));
  const profs = [...new Set(recues.map(s => s.enseignantId))].map(id => ({ id, nom: (e => e ? ensFullName(e) : 'Enseignant')(enseignantById(id)) })).sort((a, b) => a.nom.localeCompare(b.nom));
  const sel = ui.boiteSel || (ui.boiteSel = new Set());
  return `<div class="view active">
    <div class="panel">
      <div class="panel-head"><div><h2>${icone('inbox') || '📥'} Boîte à évaluations</h2>
        <div class="sub">Les évaluations validées par les enseignants arrivent ici. Le secrétariat les <strong>imprime</strong> ; il ne peut pas les modifier.</div></div>
        ${nouvelles ? `<span class="badge-etat attente">${nouvelles} nouvelle(s)</span>` : ''}</div>
      <div class="filters no-print">
        <select aria-label="Classe" onchange="ui.filters.boiteClasse=this.value; renderView('boite-evaluations')"><option value="">Toutes les classes</option>${classes.map(c => `<option value="${c.id}" ${f.boiteClasse === c.id ? 'selected' : ''}>${escapeHtml(c.nom)}</option>`).join('')}</select>
        <select aria-label="Enseignant" onchange="ui.filters.boiteEns=this.value; renderView('boite-evaluations')"><option value="">Tous les enseignants</option>${profs.map(p => `<option value="${p.id}" ${f.boiteEns === p.id ? 'selected' : ''}>${escapeHtml(p.nom)}</option>`).join('')}</select>
        ${liste.length ? `<button type="button" class="btn sm" ${sel.size ? '' : 'disabled'} onclick="imprimerSujets((DB.sujets || []).filter(s => ui.boiteSel.has(s.id)))">${icone('printer')} Imprimer la sélection (${sel.size})</button>` : ''}
      </div>
      ${liste.length ? `<ul class="sujets-liste">${liste.map(s => { const e = enseignantById(s.enseignantId); const nouveau = String(s.valideLe) > vu; return `<li class="sujet-ligne ${nouveau ? 'nouveau' : ''}">
          <label class="sl-coche"><input type="checkbox" ${sel.has(s.id) ? 'checked' : ''} aria-label="Sélectionner ${escapeHtml(s.titre)}" onchange="this.checked ? ui.boiteSel.add('${s.id}') : ui.boiteSel.delete('${s.id}'); renderView('boite-evaluations')"></label>
          <div class="sl-txt"><strong>${escapeHtml(s.titre)}${nouveau ? ' <span class="badge-etat attente">Nouveau</span>' : ''}</strong>
            <small>${escapeHtml(s.type)} · ${escapeHtml(s.matiere || '')} · <strong>${escapeHtml(classeName(s.classeId))}</strong>${s.datePrevue ? ' · prévue le ' + fmtDate(s.datePrevue) : ''}</small>
            <small>Par ${e ? escapeHtml(ensFullName(e)) : 'un enseignant'} · validée le ${new Date(s.valideLe).toLocaleString('fr-FR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' })}</small></div>
          <div class="sl-actions"><button type="button" class="btn sm" onclick="apercuSujet('${s.id}')">${icone('printer')} Voir et imprimer</button></div></li>`; }).join('')}</ul>`
        : `<div class="etat-vide"><span>${recues.length ? 'Aucune évaluation pour ce filtre.' : 'Aucune évaluation reçue pour le moment. Elles arrivent ici dès qu’un enseignant touche « Valider l’évaluation ».'}</span></div>`}
    </div>
  </div>`;
}


