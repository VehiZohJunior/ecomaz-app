/* ---------------------------------------------------------------------
   REMPLISSAGE INTELLIGENT — photo ou vocal → pré-remplissage IA d'un
   formulaire (voir supabase/functions/smart-fill/index.ts). Générique :
   n'importe quel formulaire peut s'y brancher en lui passant un schéma
   de champs et une fonction "onResultat".
   --------------------------------------------------------------------- */
const SCHEMA_ELEVE = [
  {name:'prenom', label:'Prénom', type:'text'},
  {name:'nom', label:'Nom', type:'text'},
  {name:'sexe', label:'Sexe', type:'text', format:'M ou F'},
  {name:'dateNaissance', label:'Date de naissance', type:'date', format:'AAAA-MM-JJ'},
  {name:'parentNom', label:'Nom du parent ou tuteur', type:'text'},
  {name:'parentTel', label:'Téléphone du parent', type:'tel', format:"10 chiffres, Côte d'Ivoire"},
  {name:'parentAdresse', label:'Adresse', type:'text'},
];
const SCHEMA_ENSEIGNANT = [
  {name:'prenom', label:'Prénom', type:'text'},
  {name:'nom', label:'Nom', type:'text'},
  {name:'sexe', label:'Sexe', type:'text', format:'M ou F'},
  {name:'telephone', label:'Téléphone', type:'tel', format:"10 chiffres, Côte d'Ivoire"},
  {name:'email', label:'Email', type:'text'},
  {name:'dateEmbauche', label:"Date d'embauche", type:'date', format:'AAAA-MM-JJ'},
];
const SCHEMA_PERSONNEL = [
  {name:'prenom', label:'Prénom', type:'text'},
  {name:'nom', label:'Nom', type:'text'},
  {name:'poste', label:'Poste / Fonction', type:'text'},
  {name:'telephone', label:'Téléphone', type:'tel', format:"10 chiffres, Côte d'Ivoire"},
];

const SCHEMA_PAIEMENT = [
  {name:'montant', label:'Montant payé (francs CFA)', type:'number', format:'nombre entier, ex. 25000'},
  {name:'date', label:'Date du paiement', type:'date', format:'AAAA-MM-JJ'},
  {name:'tranche', label:'Tranche / échéance payée', type:'select'},
  {name:'modePaiement', label:'Mode de paiement', type:'select'},
];
const SCHEMA_DEPENSE = [
  {name:'libelle', label:'Libellé de la dépense (objet, fournisseur)', type:'text'},
  {name:'montant', label:'Montant total payé (francs CFA)', type:'number', format:'nombre entier, ex. 25000'},
  {name:'date', label:'Date de la facture ou du paiement', type:'date', format:'AAAA-MM-JJ'},
  {name:'categorie', label:'Catégorie', type:'select'},
  {name:'modePaiement', label:'Mode de paiement', type:'select'},
];
const SCHEMA_AGENDA = [
  {name:'titre', label:'Titre de l’événement', type:'text'},
  {name:'type', label:'Type d’événement', type:'select'},
  {name:'dateDebut', label:'Date de début', type:'date', format:'AAAA-MM-JJ'},
  {name:'dateFin', label:'Date de fin (incluse)', type:'date', format:'AAAA-MM-JJ'},
  {name:'description', label:'Précision (lieu, heure, consignes)', type:'text'},
];
const SCHEMA_FNE = [
  {name:'fneNumero', label:'Numéro de la facture normalisée électronique (FNE) de la DGI', type:'text'},
  {name:'fneLien', label:'Lien de vérification de la facture (commence par https://)', type:'url'},
];
// ---- Comptabilité (2026-11-15) : chaque module a son remplissage assisté
const SCHEMA_COTISATION = [
  {name:'montant', label:'Montant payé pour l’activité (francs CFA)', type:'number', format:'nombre entier'},
  {name:'date', label:'Date du paiement', type:'date', format:'AAAA-MM-JJ'},
  {name:'modePaiement', label:'Mode de paiement', type:'select'},
];
const SCHEMA_ACTIVITE = [
  {name:'nom', label:'Nom de l’activité extra-scolaire (ex. cantine, transport, informatique)', type:'text'},
  {name:'montantCotisation', label:'Montant de la cotisation par élève (francs CFA)', type:'number', format:'nombre entier'},
  {name:'periode', label:'Périodicité de la cotisation', type:'select'},
];
const SCHEMA_GADGET = [
  {name:'nom', label:'Nom de l’article (fourniture, tenue, livre…)', type:'text'},
  {name:'prixUnitaire', label:'Prix de vente unitaire (francs CFA)', type:'number', format:'nombre entier'},
  {name:'stock', label:'Quantité en stock', type:'number', format:'nombre entier'},
];
const SCHEMA_VENTE = [
  {name:'gadgetId', label:'Article vendu', type:'select'},
  {name:'quantite', label:'Quantité vendue', type:'number', format:'nombre entier'},
  {name:'eleveId', label:'Élève acheteur (nom et prénoms)', type:'select'},
  {name:'modePaiement', label:'Mode de paiement', type:'select'},
];
const SCHEMA_SALAIRE = [
  {name:'montant', label:'Montant du salaire versé (francs CFA)', type:'number', format:'nombre entier'},
  {name:'datePaiement', label:'Date du versement du salaire', type:'date', format:'AAAA-MM-JJ'},
  {name:'modePaiement', label:'Mode de paiement', type:'select'},
];
const SCHEMA_LOYER = [ {name:'loyerMensuel', label:'Loyer mensuel des locaux (francs CFA)', type:'number', format:'nombre entier'} ];
const SCHEMA_ECHEANCE = [
  {name:'label', label:'Libellé de la tranche (ex. Frais d’inscription, 1er versement)', type:'text'},
  {name:'montant', label:'Montant de la tranche (francs CFA)', type:'number', format:'nombre entier'},
  {name:'dateEcheance', label:'Date limite de paiement de la tranche', type:'date', format:'AAAA-MM-JJ', futur:true},
];
const SCHEMA_GRILLE = [
  {name:'inscription', label:'Frais d’inscription (francs CFA)', type:'number', format:'nombre entier'},
  {name:'dateInscription', label:'Date limite de paiement de l’inscription', type:'date', format:'AAAA-MM-JJ', futur:true},
  {name:'scolarite', label:'Scolarité annuelle hors inscription (francs CFA) : total de l’année', type:'number', format:'nombre entier'},
  {name:'nb', label:'Nombre de versements de la scolarité', type:'select'},
];
// Frais annuel par classe : un champ par classe (document « tarifs de l'école »)
function schemaFrais(){ return DB.classes.slice(0, 24).map(c => ({ name:'frais_' + c.id, label:`Frais annuel de scolarité de la classe ${c.nom} (francs CFA)`, type:'number', format:'nombre entier' })); }
// Menu de la cantine : un champ par jour (photo du menu affiché ou document)
function schemaCantine(formId){
  const f = document.getElementById(formId); if(!f) return [];
  const jour = iso => new Date(iso + 'T12:00:00').toLocaleDateString('fr-FR', { weekday:'long', day:'numeric', month:'long' });
  return [...f.elements].filter(el => /^(repas|gouter)_\d{4}-\d{2}-\d{2}$/.test(el.name)).slice(0, 24)
    .map(el => ({ name: el.name, label: `${el.name.startsWith('repas') ? 'Repas de midi' : 'Goûter'} du ${jour(el.name.slice(-10))}`, type:'text' }));
}
// ---- Pédagogie et école
const SCHEMA_DEVOIR = [
  {name:'classeId', label:'Classe', type:'select'},
  {name:'matiere', label:'Matière', type:'text'},
  {name:'pourLe', label:'Date pour laquelle le travail est à faire', type:'date', format:'AAAA-MM-JJ', futur:true},
  {name:'travail', label:'Travail à faire à la maison (recopier fidèlement, sans résumer)', type:'text', long:true},
];
const SCHEMA_SEANCE = [
  {name:'debut', label:'Heure de début de la séance', type:'time', format:'HH:MM'},
  {name:'fin', label:'Heure de fin de la séance', type:'time', format:'HH:MM'},
  {name:'matiere', label:'Matière ou activité', type:'text'},
  {name:'enseignantId', label:'Enseignant', type:'select'},
];
const SCHEMA_PROGRAMME = [
  {name:'classeId', label:'Classe', type:'select'},
  {name:'matiere', label:'Matière', type:'select'},
  {name:'trimestre', label:'Trimestre', type:'select'},
  {name:'contenu', label:'Contenu du programme (leçons, chapitres — recopier fidèlement)', type:'text', long:true},
];
const SCHEMA_PUBLICATION = [
  {name:'titre', label:'Titre de l’événement ou de la nouvelle', type:'text'},
  {name:'dateEvenement', label:'Date de l’événement', type:'date', format:'AAAA-MM-JJ', futur:true},
  {name:'texte', label:'Texte de la publication (recopier fidèlement)', type:'text', long:true},
];
const SCHEMA_PERSONNE_AUTORISEE = [
  {name:'nom', label:'Nom et prénom de la personne autorisée', type:'text'},
  {name:'lien', label:'Lien avec l’enfant (mère, père, tante, oncle, chauffeur…)', type:'text'},
  {name:'telephone', label:'Téléphone', type:'tel', format:"10 chiffres, Côte d'Ivoire"},
];
const SCHEMA_SANTE = [
  {name:'allergies', label:'Allergies de l’enfant (aliments, médicaments)', type:'text'},
  {name:'infos', label:'Autres informations de santé utiles (maladie, traitement, médecin, lunettes…)', type:'text', long:true},
];
const SCHEMA_ECOLE = [
  {name:'nomEcole', label:'Nom officiel de l’école', type:'text'},
  {name:'adresse', label:'Adresse de l’école', type:'text'},
  {name:'telephone', label:'Téléphone de l’école', type:'tel', format:"10 chiffres, Côte d'Ivoire"},
  {name:'anneeScolaire', label:'Année scolaire', type:'text', format:'AAAA-AAAA, ex. 2026-2027'},
  {name:'directeurNom', label:'Nom du directeur ou de la directrice', type:'text'},
  {name:'fondateurNom', label:'Nom du fondateur ou de la fondatrice', type:'text'},
];
// Pour chaque liste déroulante du formulaire, on donne au moteur les valeurs permises :
// parmi toutes les informations du document, il choisit celle qui convient.
function schemaAvecOptions(schema, formId){
  const form = document.getElementById(formId);
  return schema.map(c => {
    const el = form && form.elements[c.name];
    if(el && el.tagName === 'SELECT'){
      const opts = [...el.options].map(o => o.textContent.trim()).filter(Boolean).slice(0, 150);
      return { ...c, type: 'text', format: 'une valeur parmi : ' + opts.join(' | ') };
    }
    return c;
  });
}
function boutonRemplissage(formulaire, schemaNom, formId){
  if(!(['secretariat','direction','fondation'].includes(ui.role) || (ui.role === 'enseignant' && session.enseignantId))) return '';
  return `<div class="choix-remplissage" role="group" aria-label="Comment remplir cette fiche" onclick="if(this.classList.contains('cr-replie')) this.classList.remove('cr-replie')">
    <span class="cr-question">Comment voulez-vous remplir ?</span>
    <div class="cr-modes">
      <button type="button" class="cr-mode cr-intelligent btn-sf" onclick="ouvrirRemplissageIntelligent('${formulaire}', schemaAvecOptions(${schemaNom}, '${formId}'), (r)=>appliquerRemplissage('${formId}', r))">
        <span class="cr-ic">${icone('sparkles') || '✨'}</span><strong>Remplissage intelligent</strong><small>Photo, PDF, Word, Excel, image ou message vocal : l’appli lit le document et pré-remplit. Vous relisez.</small></button>
      <button type="button" class="cr-mode cr-manuel" onclick="choisirRemplissageManuel(this, '${formId}')">
        <span class="cr-ic">${icone('pencil') || '✍️'}</span><strong>Remplissage manuel</strong><small>Vous tapez vous-même chaque champ.</small></button>
    </div>
  </div>`;
}
function choisirRemplissageManuel(bouton, formId){
  const bloc = bouton.closest('.choix-remplissage'); if(bloc) bloc.classList.add('cr-replie');
  const form = document.getElementById(formId); if(!form) return;
  const champ = [...form.elements].find(el => !el.disabled && el.type !== 'hidden' && el.offsetParent !== null && ['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName));
  if(champ){ champ.focus(); try{ champ.scrollIntoView({ block: 'center', behavior: 'smooth' }); }catch(_e){} }
}

let smartFillRecorder = null;
let smartFillChunks = [];
let smartFillMinuteur = null;
const SMARTFILL_DUREE_MAX = 120; // secondes d'enregistrement vocal au maximum

// Compteur du mois (schema.sql section 119) : analyses utilisées / quota de l'école, relu à chaque ouverture
let quotaRemplissage = null;
function texteQuotaRemplissage(){
  const q = quotaRemplissage; if(!q || !q.limite) return '';
  const reste = Math.max(0, q.limite - q.utilise), pct = q.utilise / q.limite;
  const cls = reste === 0 ? 'sf-quota-fini' : pct >= 0.8 ? 'sf-quota-bas' : '';
  return `<span class="${cls}">${reste === 0 ? `Quota du mois atteint (${q.utilise} / ${q.limite} analyses) : le remplissage intelligent reprend le 1er du mois prochain. Le remplissage manuel reste disponible.`
    : `Ce mois-ci : <strong>${q.utilise}</strong> analyse(s) utilisée(s) sur ${q.limite} (gratuit) · il en reste <strong>${reste}</strong>.`}</span>`;
}
function majQuotaRemplissage(){
  sb.rpc('usage_remplissage_mois').then(({ data }) => {
    if(!data) return; quotaRemplissage = data;
    const z = document.getElementById('sfQuota'); if(z) z.innerHTML = texteQuotaRemplissage();
  }, () => {});
}
function ouvrirRemplissageIntelligent(formulaire, schema, onResultat){
  majQuotaRemplissage();
  window.__smartFillOnResultat = onResultat;
  window.__smartFillFormulaire = formulaire;
  window.__smartFillSchema = schema;
  window.__smartFillResultat = null;
  $('#smartFillBody').innerHTML = renderSmartFillModal();
  $('#smartFillBackdrop').classList.add('open');
}
function closeSmartFillModal(){
  arreterEnregistrementSmartFill(true);
  $('#smartFillBackdrop').classList.remove('open');
  $('#smartFillBody').innerHTML = '';
}
$('#smartFillClose').addEventListener('click', closeSmartFillModal);
$('#smartFillBackdrop').addEventListener('click', e=>{ if(e.target.id==='smartFillBackdrop') closeSmartFillModal(); });
function renderSmartFillModal(etat, message){
  if(etat==='chargement'){
    return `<div style="text-align:center;padding:30px 10px;" role="status" aria-live="polite">
      <div style="font-size:2rem;" class="em-spin">⏳</div>
      <div class="hint">Analyse en cours… (quelques secondes)</div>
    </div>`;
  }
  return `
    <div class="hint" style="margin-bottom:14px;">Quatre façons de remplir la fiche sans tout taper : une <strong>photo</strong> de document (facture, reçu, cahier, menu, acte de naissance… — recto et verso possibles), un <strong>message vocal</strong>, ou un <strong>texte collé</strong> (par exemple un message WhatsApp du parent). Vous relisez tout avant de l’appliquer.</div>
    ${message ? `<div class="pin-error" style="margin-bottom:12px;" role="alert">${escapeHtml(message)}</div>` : ''}
    <div id="sfQuota" class="sf-quota" aria-live="polite">${texteQuotaRemplissage()}</div>
    <div class="sf-sources">
      <div class="sf-source">
        <div class="sf-ic">📷</div><strong>Photo</strong>
        <label class="btn secondary sm" style="cursor:pointer;">Prendre / choisir (1 ou 2)
          <input type="file" accept="image/*" multiple style="display:none;" onchange="handleSmartFillPhoto(event)">
        </label>
      </div>
      <div class="sf-source">
        <div class="sf-ic">🎤</div><strong>Vocal</strong>
        <button type="button" class="btn secondary sm" id="btnSmartFillRec" onclick="handleSmartFillToggleRecord()">⏺️ Enregistrer</button>
        <span class="hint" id="smartFillDuree" style="margin:0;"></span>
        <label class="btn secondary sm" style="cursor:pointer;">Importer (dont WhatsApp)
          <input type="file" accept="audio/*" style="display:none;" onchange="handleSmartFillAudioFichier(event)">
        </label>
      </div>
      <div class="sf-source">
        <div class="sf-ic">📄</div><strong>Document</strong>
        <label class="btn secondary sm" style="cursor:pointer;">PDF, Word, Excel, image
          <input type="file" accept=".pdf,.docx,.xlsx,.xls,.csv,.txt,image/*,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" style="display:none;" onchange="handleSmartFillDocument(event)">
        </label>
        <span class="hint" style="margin:0;">Reçu, facture, relevé, fiche d’inscription, circulaire…</span>
      </div>
      <div class="sf-source sf-texte">
        <div class="sf-ic">📝</div><strong>Texte</strong>
        <textarea id="smartFillTexte" rows="4" maxlength="4000" placeholder="Collez ici le message du parent : nom de l’enfant, date de naissance, téléphone…"></textarea>
        <button type="button" class="btn secondary sm" onclick="handleSmartFillTexte()">Analyser le texte</button>
      </div>
    </div>
    <div class="form-actions"><button type="button" class="btn secondary" onclick="closeSmartFillModal()">Annuler</button></div>
  `;
}
// Aperçu avant application : la personne voit ce qui a été trouvé et le niveau de certitude
function renderSmartFillApercu(resultat){
  const schema = window.__smartFillSchema || [];
  const badge = c => c === 'élevé' ? '<span class="badge green">sûr</span>' : c === 'moyen' ? '<span class="badge amber">à vérifier</span>' : '<span class="badge">non trouvé</span>';
  const trouves = schema.filter(c => resultat[c.name] && resultat[c.name].valeur);
  return `<div class="hint" style="margin-bottom:10px;">${trouves.length ? `${trouves.length} information(s) trouvée(s) sur ${schema.length}. Vérifiez puis appliquez : la fiche n’est pas encore enregistrée.` : 'Aucune information n’a pu être lue. Essayez une photo plus nette, bien éclairée, ou un autre moyen.'}</div>
    <table class="eb-table sans-cartes"><tbody>${schema.map(c => { const r = resultat[c.name] || {}; return `<tr><td>${escapeHtml(c.label)}</td><td><strong>${r.valeur ? escapeHtml(r.valeur) : '—'}</strong></td><td>${badge(r.valeur ? r.confiance : 'faible')}</td></tr>`; }).join('')}</tbody></table>
    <div class="form-actions">
      <button type="button" class="btn secondary" onclick="$('#smartFillBody').innerHTML = renderSmartFillModal()">Recommencer</button>
      ${trouves.length ? `<button type="button" class="btn" onclick="appliquerSmartFill()">✓ Appliquer à la fiche</button>` : ''}
    </div>`;
}
function appliquerSmartFill(){
  const r = window.__smartFillResultat; const cb = window.__smartFillOnResultat;
  closeSmartFillModal();
  if(r && cb) cb(r);
}
function smartFillFichierEnBase64(fichier){
  return new Promise((resolve, reject) => {
    const lecteur = new FileReader();
    lecteur.onload = () => resolve(String(lecteur.result).split(',')[1]);
    lecteur.onerror = () => reject(new Error('Fichier illisible.'));
    lecteur.readAsDataURL(fichier);
  });
}
// Photo réduite sur le téléphone (1600 px, JPEG) : envoi rapide même en 3G
function smartFillCompresserImage(fichier){
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(fichier);
    img.onload = () => {
      const ratio = Math.min(1, 1600 / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * ratio);
      canvas.height = Math.round(img.height * ratio);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.82).split(',')[1]);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Format de photo non lu (HEIC ?) : prenez la photo directement depuis ce bouton, ou envoyez-la en JPG.')); };
    img.src = url;
  });
}
async function handleSmartFillPhoto(ev){
  const fichiers = [...(ev.target.files || [])].slice(0, 2);
  if(!fichiers.length) return;
  try{
    const photos = [];
    for(const f of fichiers) photos.push(await smartFillCompresserImage(f));
    await smartFillEnvoyer({ typeSource: 'photo', fichiersBase64: photos, mimeType: 'image/jpeg' });
  }catch(e){ $('#smartFillBody').innerHTML = renderSmartFillModal(null, e.message); }
}
async function handleSmartFillAudioFichier(ev){
  const fichier = ev.target.files[0];
  if(!fichier) return;
  if(fichier.size > 8 * 1024 * 1024){ $('#smartFillBody').innerHTML = renderSmartFillModal(null, 'Fichier audio trop lourd (8 Mo maximum, environ 2 minutes).'); return; }
  try{
    const base64 = await smartFillFichierEnBase64(fichier);
    await smartFillEnvoyer({ typeSource: 'audio', fichierBase64: base64, mimeType: fichier.type || 'audio/ogg' });
  }catch(e){ $('#smartFillBody').innerHTML = renderSmartFillModal(null, e.message); }
}
// Documents : le texte est extrait SUR LE TÉLÉPHONE (rien n'est stocké), puis seul ce texte est analysé.
// Empreintes d'intégrité (SRI) : le navigateur refuse une bibliothèque modifiée sur le CDN
const SRI_BIBLIOTHEQUES = {
  'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js': 'sha384-/1qUCSGwTur9vjf/z9lmu/eCUYbpOTgSjmpbMQZ1/CtX2v/WcAIKqRv+U1DUCG6e',
  'https://cdn.jsdelivr.net/npm/mammoth@1.8.0/mammoth.browser.min.js': 'sha384-/cXAMbzovUIKbBERjPmR3SnPTh8siWr5lsvFYj1Uq4XP0yaJUZJmsh0YXyGv5P0y',
  'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js': 'sha384-EnyY0/GSHQGSxSgMwaIPzSESbqoOLSexfnSMN2AP+39Ckmn92stwABZynq1JyzdT',
};
function scriptSur(url){ const sc = document.createElement('script'); sc.src = url; if(SRI_BIBLIOTHEQUES[url]){ sc.integrity = SRI_BIBLIOTHEQUES[url]; sc.crossOrigin = 'anonymous'; } return sc; }
const PDFJS_URL = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js';
const PDFJS_WORKER = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
const MAMMOTH_URL = 'https://cdn.jsdelivr.net/npm/mammoth@1.8.0/mammoth.browser.min.js';
function chargerScript(url, global){
  if(window[global]) return Promise.resolve(window[global]);
  return new Promise((ok, ko) => { const sc = scriptSur(url); sc.onload = () => ok(window[global]); sc.onerror = () => ko(new Error('Connexion internet nécessaire pour lire ce type de document.')); document.head.appendChild(sc); });
}
async function texteDuPdf(fichier){
  const pdfjs = await chargerScript(PDFJS_URL, 'pdfjsLib');
  pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
  const doc = await pdfjs.getDocument({ data: await fichier.arrayBuffer(), isEvalSupported: false }).promise; // CVE-2024-4367
  let texte = '';
  for(let i = 1; i <= Math.min(doc.numPages, 6); i++){
    const page = await doc.getPage(i), c = await page.getTextContent();
    texte += c.items.map(x => x.str).join(' ') + '\n';
  }
  if(texte.replace(/\s/g, '').length >= 30) return { texte };
  // PDF scanné (pas de texte) : les 2 premières pages sont lues comme des photos
  const images = [];
  for(let i = 1; i <= Math.min(doc.numPages, 2); i++){
    const page = await doc.getPage(i), vue = page.getViewport({ scale: 1 });
    const echelle = Math.min(2, 1600 / Math.max(vue.width, vue.height)), v = page.getViewport({ scale: echelle });
    const canvas = document.createElement('canvas'); canvas.width = v.width; canvas.height = v.height;
    await page.render({ canvasContext: canvas.getContext('2d'), viewport: v }).promise;
    images.push(canvas.toDataURL('image/jpeg', 0.82).split(',')[1]);
  }
  return { images };
}
async function texteDuWord(fichier){
  const mammoth = await chargerScript(MAMMOTH_URL, 'mammoth');
  const r = await mammoth.extractRawText({ arrayBuffer: await fichier.arrayBuffer() });
  return r.value || '';
}
async function texteDuTableur(fichier){
  const XLSX = await chargerXLSX();
  const wb = XLSX.read(await fichier.arrayBuffer(), { type: 'array' });
  return wb.SheetNames.slice(0, 3).map(n => `Feuille « ${n} » :\n` + XLSX.utils.sheet_to_csv(wb.Sheets[n], { FS: ' ; ' })).join('\n');
}
async function handleSmartFillDocument(ev){
  const fichier = ev.target.files[0]; if(!fichier) return;
  const nom = (fichier.name || '').toLowerCase(), type = fichier.type || '';
  if(fichier.size > 15 * 1024 * 1024){ $('#smartFillBody').innerHTML = renderSmartFillModal(null, 'Document trop lourd (15 Mo maximum).'); return; }
  $('#smartFillBody').innerHTML = renderSmartFillModal('chargement');
  try{
    if(type.startsWith('image/')) return await smartFillEnvoyer({ typeSource: 'photo', fichiersBase64: [await smartFillCompresserImage(fichier)], mimeType: 'image/jpeg' });
    let texte = '';
    if(nom.endsWith('.pdf') || type === 'application/pdf'){
      const r = await texteDuPdf(fichier);
      if(r.images) return await smartFillEnvoyer({ typeSource: 'photo', fichiersBase64: r.images, mimeType: 'image/jpeg' });
      texte = r.texte;
    } else if(nom.endsWith('.docx')) texte = await texteDuWord(fichier);
    else if(/\.(xlsx|xls|csv)$/.test(nom)) texte = await texteDuTableur(fichier);
    else if(nom.endsWith('.txt') || type.startsWith('text/')) texte = await fichier.text();
    else if(nom.endsWith('.doc')) throw new Error('Ancien format Word (.doc) : enregistrez-le en .docx ou en PDF, ou prenez-le en photo.');
    else throw new Error('Format non reconnu : PDF, Word (.docx), Excel (.xlsx, .xls, .csv), texte ou image.');
    texte = texte.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
    if(texte.length < 5) throw new Error('Aucun texte lisible dans ce document : prenez-le en photo.');
    await smartFillEnvoyer({ typeSource: 'document', texte: texte.slice(0, 15000) });
  }catch(e){ $('#smartFillBody').innerHTML = renderSmartFillModal(null, e.message); }
}
async function handleSmartFillTexte(){
  const texte = ($('#smartFillTexte')?.value || '').trim();
  if(texte.length < 5){ $('#smartFillBody').innerHTML = renderSmartFillModal(null, 'Collez d’abord le texte à analyser.'); return; }
  await smartFillEnvoyer({ typeSource: 'texte', texte });
}
function arreterEnregistrementSmartFill(annuler){
  clearInterval(smartFillMinuteur); smartFillMinuteur = null;
  if(smartFillRecorder && smartFillRecorder.state === 'recording'){
    if(annuler) smartFillRecorder.onstop = () => { try{ smartFillRecorder.stream.getTracks().forEach(t => t.stop()); }catch(_e){} };
    smartFillRecorder.stop();
  }
}
async function handleSmartFillToggleRecord(){
  const btn = $('#btnSmartFillRec');
  if(smartFillRecorder && smartFillRecorder.state === 'recording'){ arreterEnregistrementSmartFill(false); return; }
  try{
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    smartFillChunks = [];
    smartFillRecorder = new MediaRecorder(stream);
    smartFillRecorder.ondataavailable = (e) => { if(e.data && e.data.size) smartFillChunks.push(e.data); };
    smartFillRecorder.onstop = async () => {
      stream.getTracks().forEach(t => t.stop());
      const blob = new Blob(smartFillChunks, { type: smartFillRecorder.mimeType || 'audio/webm' });
      if(blob.size < 2000){ $('#smartFillBody').innerHTML = renderSmartFillModal(null, 'Enregistrement trop court : parlez quelques secondes.'); return; }
      const base64 = await smartFillFichierEnBase64(blob);
      await smartFillEnvoyer({ typeSource: 'audio', fichierBase64: base64, mimeType: blob.type });
    };
    smartFillRecorder.start(1000);
    const debut = Date.now();
    if(btn){ btn.textContent = '⏹️ Arrêter et analyser'; btn.classList.add('btn-recording'); }
    smartFillMinuteur = setInterval(() => {
      const s = Math.round((Date.now() - debut) / 1000);
      const z = $('#smartFillDuree'); if(z) z.textContent = `🔴 ${s} s / ${SMARTFILL_DUREE_MAX} s`;
      if(s >= SMARTFILL_DUREE_MAX) arreterEnregistrementSmartFill(false);
    }, 500);
  }catch(e){ $('#smartFillBody').innerHTML = renderSmartFillModal(null, "Impossible d'accéder au microphone : autorisez-le dans le navigateur, puis réessayez."); }
}
async function smartFillEnvoyer(source){
  if(!navigator.onLine){ $('#smartFillBody').innerHTML = renderSmartFillModal(null, 'Pas de connexion internet : le remplissage automatique a besoin du réseau.'); return; }
  $('#smartFillBody').innerHTML = renderSmartFillModal('chargement');
  try{
    const { data, error } = await sb.functions.invoke('smart-fill', {
      body: { formulaire: window.__smartFillFormulaire, schema: window.__smartFillSchema, ...source },
    });
    if(error) throw new Error(await messageErreurFonction(error));
    if(!data?.ok) throw new Error(data?.error || 'Échec du remplissage automatique');
    window.__smartFillResultat = data.resultat;
    if(quotaRemplissage) quotaRemplissage.utilise++;
    $('#smartFillBody').innerHTML = renderSmartFillApercu(data.resultat);
  }catch(e){ $('#smartFillBody').innerHTML = renderSmartFillModal(null, e.message); }
}
const SYNONYMES_OPTIONS = [
  [/orange|mtn|moov|wave|momo|mobile|flooz|transfert/, 'mobile money'],
  [/esp[eè]ce|cash|liquide/, 'especes'],
  [/ch[eè]que/, 'cheque'],
  [/virement|banque|bancaire|rib/, 'virement bancaire'],
];
function sansAccents(t){ return String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim(); }
function optionCorrespondante(select, valeur){
  const opts = [...select.options].filter(o => o.value !== '' || o.textContent.trim());
  let v = sansAccents(valeur);
  const exact = opts.find(o => sansAccents(o.value) === v || sansAccents(o.textContent) === v);
  if(exact) return exact;
  for(const [re, cible] of SYNONYMES_OPTIONS){ if(re.test(v)){ const o = opts.find(x => sansAccents(x.textContent).includes(cible)); if(o) return o; } }
  const contient = opts.find(o => { const t = sansAccents(o.textContent); return t && (t.includes(v) || v.includes(t)); });
  if(contient) return contient;
  // Mots en commun (ex. « 2e tranche » ↔ « 2e versement », « électricité » ↔ « Électricité & Eau »)
  const mots = t => sansAccents(t).split(/[^a-z0-9]+/).filter(m => m.length > 1);
  const mv = mots(v); let meilleur = null, score = 0;
  opts.forEach(o => { const n = mots(o.textContent).filter(m => mv.includes(m)).length; if(n > score){ score = n; meilleur = o; } });
  return score ? meilleur : null;
}
function appliquerRemplissage(formId, resultat){
  const form = document.getElementById(formId);
  if(!form) return;
  let nbRemplis = 0, nbAVerifier = 0;
  for(const champ in resultat){
    const { valeur, confiance } = resultat[champ];
    const input = form.elements[champ];
    if(!input || valeur == null || valeur === '') continue;
    // Liste déroulante : on ne choisit qu'une option qui existe vraiment (correspondance souple)
    if(input.tagName === 'SELECT'){
      const opt = optionCorrespondante(input, valeur);
      if(!opt) continue;
      input.value = opt.value;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    } else { input.value = valeur; input.dispatchEvent(new Event('input', { bubbles: true })); }
    input.classList.remove('champ-a-verifier');
    input.classList.add('champ-pre-rempli');
    input.addEventListener('input', () => input.classList.remove('champ-pre-rempli', 'champ-a-verifier'), { once: true });
    nbRemplis++;
    if(confiance !== 'élevé'){ input.classList.add('champ-a-verifier'); nbAVerifier++; }
  }
  toast(nbRemplis ? `${nbRemplis} champ(s) pré-rempli(s)${nbAVerifier ? ', ' + nbAVerifier + ' à vérifier (en orange)' : ''} — relisez puis enregistrez` : "Aucune information n'a pu être extraite");
}

function openEleveForm(id){
  ui._preinscriptionId = null; // remis par inscrireDepuisPreinscription() juste après, le cas échéant
  const e = id ? eleveById(id) : null;
  openModal(e ? "Modifier l'élève" : 'Nouvel élève', `
    <form id="formEleve" onsubmit="return handleSaveEleve(event)">
      <input type="hidden" name="id" value="${e?e.id:''}">
      ${boutonRemplissage('eleve', 'SCHEMA_ELEVE', 'formEleve')}
      ${e ? `<button type="button" class="btn secondary sm" style="margin-bottom:14px;" onclick="ouvrirSecuriteEleve('${e.id}')">🛡️ Sécurité & santé</button>
      <button type="button" class="btn secondary sm" style="margin-bottom:14px;" onclick="ouvrirCertificatScolarite('${e.id}')">📄 Certificat de scolarité</button>` : ''}
      <div class="form-grid">
        <div class="field"><label>Prénom</label><input name="prenom" required value="${e?escapeHtml(e.prenom):''}"></div>
        <div class="field"><label>Nom</label><input name="nom" required value="${e?escapeHtml(e.nom):''}"></div>
        <div class="field"><label>Sexe</label>
          <select name="sexe"><option value="M" ${e?.sexe==='M'?'selected':''}>Masculin</option><option value="F" ${e?.sexe==='F'?'selected':''}>Féminin</option></select>
        </div>
        <div class="field"><label>Date de naissance</label><input type="date" name="dateNaissance" required value="${e?e.dateNaissance:''}"></div>
        <div class="field"><label>Classe</label>
          <select name="classeId">${DB.classes.map(c=>`<option value="${c.id}" ${e?.classeId===c.id?'selected':''}>${escapeHtml(c.nom)}</option>`).join('')}</select>
        </div>
        <div class="field"><label>Statut</label>
          <select name="statut">
            <option ${e?.statut==='Actif'?'selected':''}>Actif</option>
            <option ${e?.statut==='Inactif'?'selected':''}>Inactif</option>
            <option ${e?.statut==='Transféré'?'selected':''}>Transféré</option>
          </select>
        </div>
        <div class="field"><label>Nom du parent / tuteur</label><input name="parentNom" required value="${e?escapeHtml(e.parentNom):''}"></div>
        <div class="field"><label>Téléphone du parent</label><input name="parentTel" required value="${e?escapeHtml(e.parentTel):''}"></div>
        <div class="field span2"><label>Adresse</label><input name="parentAdresse" value="${e?escapeHtml(e.parentAdresse):''}"></div>
        <div class="field"><label>Date d'inscription</label><input type="date" name="dateInscription" value="${e?e.dateInscription:todayISO()}"></div>
        <div class="field span2"><label style="display:flex;align-items:center;gap:8px;"><input type="checkbox" name="renforcement" ${e?.renforcement?'checked':''}> Suit le cours de renforcement (après la fin des cours)</label>
          <div class="hint" style="margin:2px 0 0;">Ses parents seront prévenus qu’il est retenu, puis de la fin du renforcement.</div></div>
      </div>
      <div class="form-actions">
        <button type="button" class="btn secondary" onclick="closeModal()">Annuler</button>
        <button type="submit" class="btn">Enregistrer</button>
      </div>
    </form>`);
}

function verifierDatesEleve(naissance, inscription){
  if(!naissance) return null;
  const aujourdHui = todayISO();
  if(naissance > aujourdHui) return { champ:'dateNaissance', message:"La date de naissance ne peut pas être dans le futur." };
  if(inscription && naissance >= inscription) return { champ:'dateNaissance', message:"La date de naissance doit être antérieure à la date d'inscription (" + fmtDate(inscription) + ")." };
  const ref = new Date(inscription || aujourdHui); const n = new Date(naissance);
  const mois = (ref.getFullYear() - n.getFullYear())*12 + (ref.getMonth() - n.getMonth()) - (ref.getDate() < n.getDate() ? 1 : 0);
  if(mois < 6) return { champ:'dateNaissance', message:"L'enfant aurait moins de 6 mois à l'inscription : vérifiez la date de naissance." };
  return null;
}
// Matricule suivant = plus grand numéro déjà attribué dans l'école + 1 (et non
// « nombre de fiches + 1 », qui redonnait un numéro existant après une
// suppression — cause des deux élèves EL-0005). La liste est relue sur le
// serveur pour tenir compte des fiches créées par un autre poste ; hors ligne,
// on se rabat sur les données de l'appareil.
async function prochainMatricule(table, prefixe, largeur){
  let matricules = (table === 'eleves' ? DB.eleves : DB.enseignants || []).map(x => x.matricule);
  try{
    const { data, error } = await sb.from(table).select('matricule').eq('ecole_id', session.ecoleId);
    if(!error && data) matricules = matricules.concat(data.map(x => x.matricule));
  }catch(_e){ /* hors ligne : données locales */ }
  const max = matricules.reduce((m, mat) => {
    const n = parseInt(String(mat || '').replace(prefixe, ''), 10);
    return String(mat || '').startsWith(prefixe) && Number.isFinite(n) && n > m ? n : m;
  }, 0);
  return prefixe + String(max + 1).padStart(largeur, '0');
}
// La base refuse un matricule déjà pris (schema.sql section 45) : si un autre
// poste vient de l'utiliser, on reprend le numéro suivant (2 essais au plus).
async function insererAvecMatricule(table, patch, prefixe, largeur){
  for(let essai = 0; ; essai++){
    try{ return await dbInsert(table, patch); }
    catch(e){
      const doublon = e && (e.code === '23505' || /matricule_unique_par_ecole/.test(e.message || ''));
      if(!doublon || essai >= 2) throw doublon ? new Error('Ce matricule est déjà utilisé ; réessayez dans un instant.') : e;
      patch.matricule = await prochainMatricule(table, prefixe, largeur);
    }
  }
}
async function handleSaveEleve(ev){
  ev.preventDefault();
  const fd = new FormData(ev.target);
  const id = fd.get('id');
  const patch = {
    matricule: (id && eleveById(id)?.matricule) || null,
    prenom: fd.get('prenom').trim(), nom: fd.get('nom').trim(), sexe: fd.get('sexe'),
    dateNaissance: fd.get('dateNaissance'), classeId: fd.get('classeId'), statut: fd.get('statut'),
    parentNom: fd.get('parentNom').trim(), parentTel: fd.get('parentTel').trim(),
    parentAdresse: fd.get('parentAdresse').trim(), dateInscription: fd.get('dateInscription') || todayISO(),
    renforcement: fd.get('renforcement') === 'on',
  };
  const erreurDate = verifierDatesEleve(patch.dateNaissance, patch.dateInscription);
  ev.target.querySelectorAll('.field.has-error').forEach(f => { f.classList.remove('has-error'); const m = f.querySelector('.error-text'); if(m) m.remove(); });
  if(erreurDate){
    const champ = ev.target.querySelector(`[name="${erreurDate.champ}"]`);
    const field = champ && champ.closest('.field');
    if(field){
      field.classList.add('has-error');
      champ.setAttribute('aria-invalid', 'true');
      const m = document.createElement('div'); m.className = 'error-text'; m.id = 'err-' + erreurDate.champ; m.textContent = erreurDate.message;
      field.appendChild(m); champ.setAttribute('aria-describedby', m.id); champ.focus();
    } else toast('Erreur : ' + erreurDate.message);
    return false;
  }
  // Date d'inscription future : permise (pré-inscription pour la rentrée), mais
  // on fait confirmer une seule fois, quand la date est saisie ou modifiée.
  const inscriptionAvant = id ? eleveById(id)?.dateInscription : null;
  if(patch.dateInscription > todayISO() && patch.dateInscription !== inscriptionAvant
     && !confirm(`La date d'inscription (${fmtDate(patch.dateInscription)}) est dans le futur. Est-ce bien voulu ?`)){
    const champ = ev.target.querySelector('[name="dateInscription"]');
    if(champ) champ.focus();
    return false;
  }
  if(!patch.matricule) patch.matricule = await prochainMatricule('eleves', 'EL-', 4);
  try{
    if(id){
      await dbUpdate('eleves', id, patch);
      const idx = DB.eleves.findIndex(e=>e.id===id);
      DB.eleves[idx] = {...DB.eleves[idx], ...patch};
    } else {
      DB.eleves.push(await insererAvecMatricule('eleves', patch, 'EL-', 4));
      // Inscription faite depuis une pré-inscription en ligne : on la marque « inscrite »
      if(ui._preinscriptionId){ const pid = ui._preinscriptionId; ui._preinscriptionId = null; await statutPreinscription(pid, 'inscrite', false).catch(() => {}); }
    }
    closeModal(); toast('Élève enregistré');
    renderView('eleves');
  }catch(e){ alert('Erreur : ' + e.message); }
  return false;
}

async function deleteEleve(id){
  const e = eleveById(id);
  if(!confirm(`Supprimer l'élève ${eleveFullName(e)} ? Ses notes et présences seront également supprimées.`)) return;
  try{
    await dbDelete('eleves', id); // ON DELETE CASCADE supprime aussi ses notes/présences côté base
    DB.eleves = DB.eleves.filter(x=>x.id!==id);
    DB.notes = DB.notes.filter(x=>x.eleveId!==id);
    DB.presencesEleves = DB.presencesEleves.filter(x=>x.eleveId!==id);
    toast('Élève supprimé');
    renderView('eleves');
  }catch(e){ alert('Erreur : ' + e.message); }
}

function viewEleveProfile(id){ ui.eleveProfileId = id; renderView('eleves'); }

/* ---------------------------------------------------------------------
   Comptes parent liés à un élève (fiche élève)
   --------------------------------------------------------------------- */
function renderComptesParentEleve(eleveId){
  const liens = (DB.parentsEleves||[]).filter(pe=>pe.eleveId===eleveId);
  if(!liens.length) return `<div class="empty">Aucun compte parent créé pour l'instant.</div>`;
  return `<table class="table">
    <thead><tr><th>Nom</th><th></th></tr></thead>
    <tbody>
      ${liens.map(pe=>{
        const profil = (DB.profiles||[]).find(p=>p.id===pe.parentProfileId);
        return `<tr>
          <td>${escapeHtml(profil?profil.nomComplet:'—')}</td>
          <td style="text-align:right;"><button class="btn secondary sm" onclick="retirerAccesParent('${pe.id}','${eleveId}')">Retirer l'accès</button></td>
        </tr>`;
      }).join('')}
    </tbody>
  </table>`;
}
function ouvrirCreerCompteParent(eleveId){
  openModal('Créer un compte parent', `
    <form onsubmit="return handleCreerCompteParent(event, '${eleveId}')">
      <div class="field">
        <label>Nom complet du parent</label>
        <input type="text" id="parentCompteNom" required autofocus>
      </div>
      <div class="field">
        <label>Email du parent</label>
        <input type="email" id="parentCompteEmail" required>
      </div>
      <div class="hint" style="margin-top:6px;">Le parent recevra un accès sans mot de passe défini ici : indiquez-lui de cliquer sur « Mot de passe oublié ? » sur l'écran de connexion (espace Parent) pour choisir le sien. Si un compte existe déjà pour cet email (ex. l'autre parent), il sera simplement relié à cet élève.</div>
      <button class="btn" type="submit" style="width:100%;margin-top:14px;">Créer / relier le compte</button>
    </form>
  `);
}
async function handleCreerCompteParent(ev, eleveId){
  ev.preventDefault();
  const parentNom = $('#parentCompteNom').value.trim();
  const parentEmail = $('#parentCompteEmail').value.trim();
  try{
    const { data, error } = await sb.functions.invoke('creer-compte-parent', { body: { eleveId, parentNom, parentEmail } });
    if(error) throw new Error(await messageErreurFonction(error));
    if(!data?.ok) throw new Error(data?.error || 'Échec de la création du compte parent');
    DB.parentsEleves = DB.parentsEleves || [];
    DB.parentsEleves.push({ id: crypto.randomUUID(), ecoleId: session.ecoleId, parentProfileId: data.parentUserId, eleveId });
    if(data.nouveauCompte){
      DB.profiles = DB.profiles || [];
      DB.profiles.push({ id: data.parentUserId, ecoleId: session.ecoleId, role:'parent', nomComplet: parentNom });
    }
    closeModal();
    toast(data.nouveauCompte ? 'Compte parent créé' : 'Compte parent existant relié à cet élève');
    renderView('eleves');
  }catch(e){ alert('Erreur : ' + e.message); }
  return false;
}
async function retirerAccesParent(peId, eleveId){
  if(!confirm("Retirer l'accès de ce parent à cet élève ?")) return;
  try{
    const { error } = await exigerEffet(sb.from('parents_eleves').delete().eq('id', peId));
    if(error) throw error;
    DB.parentsEleves = (DB.parentsEleves||[]).filter(pe=>pe.id!==peId);
    toast('Accès retiré');
    renderView('eleves');
  }catch(e){ alert('Erreur : ' + e.message); }
}

// Fiche élève (personnel) : l'essentiel pour répondre à un parent au téléphone
function renderEleveCoupDoeil(e){
  chargerSecuriteEleves();
  const sante = santeDe(e.id), pers = personnesDe(e.id);
  const admin = ['secretariat','direction','fondation'].includes(ui.role);
  let scol = null;
  try{ if(admin) scol = scolariteEleveParEcheance(e.id); }catch(_e){}
  const msgs = (DB.messagesInternes || []).filter(m => m.eleveId === e.id && m.destinataireType === 'parent')
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || ''))).slice(0, 3);
  const tels = telephonesWhatsapp(e.parentTel);
  return `<div class="panel">
    <div class="panel-head"><div><h2>🧾 En un coup d’œil</h2></div></div>
    <div class="grid-3">
      ${scol && scol.total ? `<div><div class="hint">Scolarité</div><strong>${scol.reste ? 'Reste ' + fmtFCFA(scol.reste) : '✅ Soldée'}</strong><div class="hint">${fmtFCFA(scol.totalPaye)} payés sur ${fmtFCFA(scol.total)}</div></div>` : ''}
      <div><div class="hint">Santé</div><strong>${sante && sante.allergies ? '⚕️ ' + escapeHtml(sante.allergies) : 'Aucune allergie indiquée'}</strong>${sante && sante.infos ? `<div class="hint">${escapeHtml(sante.infos.slice(0, 120))}</div>` : ''}</div>
      <div><div class="hint">Peuvent venir le chercher</div><strong>${pers.length ? pers.map(p => escapeHtml(p.nom) + (p.lien ? ` (${escapeHtml(p.lien)})` : '')).join(', ') : 'Parents seulement (rien d’indiqué)'}</strong></div>
    </div>
    ${msgs.length ? `<div class="hint" style="margin:12px 0 4px;">Derniers messages envoyés au parent</div>${msgs.map(m => `<div style="padding:4px 0;border-bottom:1px solid var(--border);">${m.lu ? '<span class="badge green">✓✓ Lu</span>' : '<span class="badge">✓ Envoyé</span>'} <span class="hint">${m.createdAt ? fmtDate(String(m.createdAt).slice(0, 10)) : ''}</span> ${escapeHtml(String(m.contenu || '').slice(0, 110))}</div>`).join('')}` : ''}
    <div class="form-actions no-print" style="justify-content:flex-start;flex-wrap:wrap;">
      ${tels.length ? `<a class="btn sm" href="https://wa.me/${tels[0]}" target="_blank" rel="noopener">📲 WhatsApp du parent</a><a class="btn secondary sm" href="tel:+${tels[0]}">📞 Appeler</a>` : ''}
      ${admin ? `<button class="btn secondary sm" onclick="ouvrirSecuriteEleve('${e.id}')">🛡️ Sécurité & santé</button><button class="btn secondary sm" onclick="ouvrirCertificatScolarite('${e.id}')">📄 Certificat</button>` : ''}
    </div>
  </div>`;
}
function renderEleveProfile(id){
  const e = eleveById(id);
  if(!e){ ui.eleveProfileId=null; return renderEleveListe(); }
  const trimestre = ui.filters.bulletinTrimestre || 'Trimestre 1';
  ui.filters.bulletinTrimestre = trimestre;

  const cycle = classeCycle(e.classeId);
  const matieres = MATIERES_BY_CYCLE[cycle];
  let sumMoy = 0, countMat = 0;
  const bulletinRows = matieres.map(mat=>{
    const mm = moyenneMatiere(id, mat, trimestre);
    const moy = mm.moy, coef = coefficientDe(cycle, mat);
    if(moy!==null){ sumMoy += moy * coef; countMat += coef; }
    if(!ligneBulletinUtile(mat, moy)) return '';
    return `<tr>
      <td>${mat}</td>
      <td>${mm.classe!==null?mm.classe.toFixed(2):'—'}</td>
      <td>${mm.compo!==null?mm.compo.toFixed(2):'—'}</td>
      <td class="bulletin-grade ${moy!==null?moyenneClass(moy):''}">${moy!==null?moy.toFixed(1):'—'}</td>
      <td>${moy!==null?mentionFromAvg(moy):'—'}</td>
    </tr>`;
  }).join('');
  const moyGenerale = countMat ? sumMoy/countMat : null;

  const presences = DB.presencesEleves.filter(p=>p.eleveId===id).sort((a,b)=>b.date.localeCompare(a.date));
  const totalP = presences.length;
  const nbPresent = presences.filter(p=>p.statut==='Présent').length;
  const nbAbsent = presences.filter(p=>p.statut==='Absent').length;
  const nbRetard = presences.filter(p=>p.statut==='Retard').length;
  const tauxPresence = totalP ? Math.round(100*nbPresent/totalP) : null;

  const presRows = presences.slice(0,30).map(p=>`
    <li class="pr-ligne"><span class="pr-date"><strong>${fmtDate(p.date)}</strong><small>${weekdayFR(p.date)}</small></span>
      <span class="badge-etat ${p.statut==='Présent'?'ok':p.statut==='Absent'?'erreur':'attente'}">${p.statut}</span>
      ${p.motif ? `<span class="pr-motif">${escapeHtml(p.motif)}</span>` : ''}</li>`).join('');
  const onglet = ['infos','bulletin','presences'].includes(ui.filters.profilOnglet) ? ui.filters.profilOnglet : 'infos';

  const commentKey = `${id}_${trimestre}`;
  const comment = DB.bulletinsComments[commentKey] || '';

  return `
  <div class="view active">
    <button class="btn secondary sm no-print" style="margin-bottom:14px;" onclick="ui.eleveProfileId=null; ui.filters.profilOnglet='infos'; renderView('eleves')">← Retour à la liste</button>

    <div class="panel">
      <div class="profile-head">
        <span class="avatar">${initials(e.prenom,e.nom)}</span>
        <div>
          <h2>${escapeHtml(eleveFullName(e))}</h2>
          <div class="meta">${classeName(e.classeId)} · ${ageFromISO(e.dateNaissance)} ans · Matricule ${escapeHtml(e.matricule)} · <span class="badge ${e.statut==='Actif'?'green':'gray'}">${e.statut}</span></div>
        </div>
      </div>
      <div class="grid-3 profil-infos">
        <div><div class="hint">Parent / Tuteur</div><strong>${escapeHtml(e.parentNom)}</strong></div>
        <div><div class="hint">Téléphone</div><strong>${escapeHtml(e.parentTel)}</strong></div>
        <div><div class="hint">Adresse</div><strong>${escapeHtml(e.parentAdresse||'—')}</strong></div>
        <div><div class="hint">Date de naissance</div><strong>${fmtDate(e.dateNaissance)}</strong></div>
        <div><div class="hint">Date d'inscription</div><strong>${fmtDate(e.dateInscription)}</strong></div>
        <div><div class="hint">Taux de présence global</div><strong>${tauxPresence===null?'—':tauxPresence+'%'}</strong></div>
      </div>
    </div>

    <div class="segmente profil-onglets no-print" role="tablist" aria-label="Fiche de l’élève">${[['infos', 'Infos'], ['bulletin', 'Bulletin'], ['presences', `Présences (${totalP})`]].map(([k, l]) => `<button type="button" role="tab" class="seg${onglet === k ? ' actif' : ''}" aria-selected="${onglet === k}" onclick="ui.filters.profilOnglet='${k}'; renderView('eleves')">${l}</button>`).join('')}</div>

    ${onglet === 'infos' ? `${renderEleveCoupDoeil(e)}

    <div class="panel">
      <div class="panel-head">
        <div><h2>👪 Compte(s) parent</h2><div class="sub">Accès à l'espace parent (messagerie, notifications) pour cet élève</div></div>
        <button class="btn sm" onclick="ouvrirCreerCompteParent('${id}')">+ Créer un compte parent</button>
      </div>
      ${renderComptesParentEleve(id)}
    </div>` : ''}

    ${onglet === 'bulletin' ? `
      <div class="panel">
        <div class="letterhead">
          ${DB.meta.logo ? `<img src="${escapeHtml(DB.meta.logo)}" alt="Logo">` : `<div class="lh-ph">🎓</div>`}
          <div class="lh-text">
            <strong>${escapeHtml(DB.meta.nomEcole)}</strong>
            <span>${escapeHtml(DB.meta.adresse)}${DB.meta.telephone ? ' · '+escapeHtml(DB.meta.telephone) : ''}</span>
          </div>
          <div class="lh-doc"><strong>Bulletin de notes</strong>${trimestre} · ${DB.meta.anneeScolaire}</div>
        </div>
        <div class="panel-head">
          <div><h2>Bulletin scolaire</h2><div class="sub">Moyennes par matière</div></div>
          <select onchange="ui.filters.bulletinTrimestre=this.value; renderView('eleves')">
            ${TRIMESTRES.map(t=>`<option ${trimestre===t?'selected':''}>${t}</option>`).join('')}
          </select>
        </div>
        <div class="table-wrap"><table class="sans-cartes bulletin-mini">
          <thead><tr><th>Matière</th><th>Moy. classe</th><th>Compo.</th><th>Moyenne</th><th>Appréciation</th></tr></thead>
          <tbody>${bulletinRows}</tbody>
        </table></div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:14px;padding-top:14px;border-top:1px solid var(--border);">
          <div>Moyenne générale : <span class="bulletin-grade ${moyGenerale!==null?moyenneClass(moyGenerale):''}" style="font-size:var(--fs-lg);">${moyGenerale!==null?moyGenerale.toFixed(2):'—'}</span> / 20</div>
          <span class="badge ${moyGenerale===null?'gray':moyenneClass(moyGenerale)==='good'?'green':moyenneClass(moyGenerale)==='mid'?'amber':'red'}">${moyGenerale!==null?mentionFromAvg(moyGenerale):'—'}</span>
        </div>
        <div class="field" style="margin-top:14px;">
          <label>Appréciation générale du titulaire</label>
          <textarea id="commentBulletin">${escapeHtml(comment)}</textarea>
        </div>
        ${(DB.meta.directeurNom || DB.meta.fondateurNom) ? `
        <div class="signatures">
          <div class="sign-box"><div class="sign-role">Le Directeur / La Directrice</div><div class="sign-line">${escapeHtml(DB.meta.directeurNom || '—')}</div></div>
          <div class="sign-box"><div class="sign-role">Le Fondateur / La Fondatrice</div><div class="sign-line">${escapeHtml(DB.meta.fondateurNom || '—')}</div></div>
        </div>` : ''}
        <div class="form-actions">
          <button class="btn secondary sm no-print" onclick="window.print()">🖨️ Imprimer</button>
          <button class="btn sm no-print" onclick="saveBulletinComment('${id}','${trimestre}')">Enregistrer l'appréciation</button>
        </div>
      </div>` : ''}

    ${onglet === 'presences' ? `
      <div class="panel">
        <div class="panel-head"><div><h2>Présences</h2><div class="sub">${totalP} enregistrement(s)${totalP > 30 ? ' · les 30 derniers ci-dessous' : ''}</div></div></div>
        <div style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap;">
          <span class="badge green">Présent: ${nbPresent}</span>
          <span class="badge red">Absent: ${nbAbsent}</span>
          <span class="badge amber">Retard: ${nbRetard}</span>
        </div>
        ${presRows ? `<ul class="pr-liste">${presRows}</ul>` : `<div class="etat-vide"><span class="etat-vide-ic" aria-hidden="true">${icone('calendar')}</span><span>Aucun appel enregistré pour cet élève.</span></div>`}
      </div>` : ''}
  </div>`;
}

/* ---------- Avant de publier un trimestre : état des bulletins, classe par classe ---------- */
function etatBulletinsTrimestre(trimestre){
  return DB.classes.map(c => {
    const eleves = DB.eleves.filter(e => e.classeId === c.id && e.statut === 'Actif');
    if(!eleves.length) return null;
    const r = resultatsClasse(c.id, trimestre);
    const avecMoyenne = (r.lignes || []).filter(l => l.moyenne !== null).length;
    // Compositions attendues : une par élève et par matière (sauf matière « au choix » que l'élève ne suit pas)
    const matieres = MATIERES_BY_CYCLE[c.cycle] || [];
    let attendues = 0, saisies = 0;
    eleves.forEach(e => matieres.forEach(m => {
      const ses = (DB.notes || []).filter(n => n.eleveId === e.id && n.matiere === m && n.trimestre === trimestre && n.note != null);
      if(MATIERES_AU_CHOIX.includes(m) && !ses.length) return;
      attendues++; if(ses.some(n => n.type === 'Composition')) saisies++;
    }));
    const appr = eleves.filter(e => String((DB.bulletinsComments || {})[`${e.id}_${trimestre}`] || '').trim()).length;
    return { c, eleves: eleves.length, avecMoyenne, attendues, saisies, appr, complet: avecMoyenne === eleves.length && saisies >= attendues && appr === eleves.length };
  }).filter(Boolean);
}
function confirmerPublicationBulletins(trimestre, lecture){
  return new Promise(resoudre => {
    const etat = etatBulletinsTrimestre(trimestre), incomplets = etat.filter(x => !x.complet);
    window.__publication = ok => { window.__publication = null; closeModal(); resoudre(ok); };
    const cell = (n, sur) => `<td class="${n >= sur ? 'pb-ok' : 'pb-ko'}">${n} / ${sur}</td>`;
    openModal(lecture ? `État des bulletins — ${libelleTrimestre(trimestre)}` : `Publier les bulletins du ${libelleTrimestre(trimestre)} ?`, `
      ${incomplets.length
        ? `<div class="pb-alerte">${icone('triangle-alert')}<span><strong>${incomplets.length} classe${incomplets.length > 1 ? 's ont' : ' a'} des bulletins incomplets.</strong> Les parents verraient des notes ou des appréciations manquantes.</span></div>`
        : `<div class="pb-ok-bandeau">${icone('circle-check')}<span>Tous les bulletins sont complets.</span></div>`}
      <ul class="pb-liste">${etat.map(x => `<li class="pb-ligne${x.complet ? ' complet' : ''}"><strong>${escapeHtml(x.c.nom)}</strong>
        <span class="pb-puces"><span class="pb-puce ${x.avecMoyenne >= x.eleves ? 'pb-ok' : 'pb-ko'}">Moyennes ${x.avecMoyenne}/${x.eleves}</span><span class="pb-puce ${x.saisies >= x.attendues ? 'pb-ok' : 'pb-ko'}">Compositions ${x.saisies}/${x.attendues}</span><span class="pb-puce ${x.appr >= x.eleves ? 'pb-ok' : 'pb-ko'}">Appréciations ${x.appr}/${x.eleves}</span></span></li>`).join('')}</ul>
      <p class="hint">Après publication : chaque parent voit le bulletin de SES enfants et reçoit une notification ; les notes sont verrouillées (seule la direction peut encore corriger, avec historique).</p>
      <div class="form-actions">${lecture
        ? `${incomplets.length ? `<button type="button" class="btn secondary" onclick="__publication(false); setTimeout(() => { go('dashboard'); setTimeout(() => ouvrirSection('titreSuiviEns'), 300); }, 50)">Relancer les enseignants</button>` : ''}<button type="button" class="btn" onclick="__publication(false)">Fermer</button>`
        : incomplets.length
        ? `<button type="button" class="btn" onclick="__publication(false)">Compléter d’abord</button><button type="button" class="btn danger" onclick="__publication(true)">Publier quand même</button>`
        : `<button type="button" class="btn secondary" onclick="__publication(false)">Annuler</button><button type="button" class="btn" onclick="__publication(true)">Publier aux parents</button>`}</div>`);
    // Fermeture par la croix ou Échap = pas de publication
    const fermer = document.getElementById('modalClose');
    if(fermer) fermer.addEventListener('click', () => { if(window.__publication) window.__publication(false); }, { once: true });
  });
}
async function publierBulletins(trimestre, publier){
  const actuels = DB.meta.bulletinsPublies || [];
  if(publier && !(await confirmerPublicationBulletins(trimestre))){ renderView('notes'); return; }
  const liste = publier ? [...new Set(actuels.concat(trimestre))] : actuels.filter(t => t !== trimestre);
  try{
    if(publier){ const nb = await figerResultats(trimestre); if(!nb && !confirm('Aucune moyenne n’a pu être calculée pour ce trimestre. Publier quand même ?')){ renderView('notes'); return; } }
    const { error } = await exigerEffet(sb.from('ecoles').update({ bulletins_publies: liste }).eq('id', session.ecoleId));
    if(error) throw error;
    DB.meta.bulletinsPublies = liste;
    if(publier){
      const avecNotes = [...new Set((DB.notes || []).filter(n => n.trimestre === trimestre).map(n => n.eleveId))];
      notifierParentsPush(avecNotes, `📒 Le bulletin du ${trimestre} est disponible dans votre application.`);
    }
    toast(publier ? `Bulletins du ${trimestre} publiés aux parents` : `Bulletins du ${trimestre} masqués aux parents`);
  }catch(e){ alert('Erreur : ' + e.message); renderView('notes'); }
}
async function saveBulletinComment(eleveId, trimestre){
  const val = $('#commentBulletin').value;
  try{
    const { error } = await sb.from('bulletins_commentaires').upsert(
      { eleve_id: eleveId, trimestre, commentaire: val, ecole_id: session.ecoleId },
      { onConflict: 'eleve_id,trimestre' }
    );
    if(error) throw error;
    DB.bulletinsComments[`${eleveId}_${trimestre}`] = val;
    toast('Appréciation enregistrée');
  }catch(e){ alert('Erreur : ' + e.message); }
}

