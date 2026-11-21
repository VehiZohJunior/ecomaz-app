/* ---------------------------------------------------------------------
   13. PARAMÈTRES
   --------------------------------------------------------------------- */
function renderParametres(){
  const m = DB.meta;
  return `
  <div class="view active">
    <div class="section-note">🏫 Cette application est personnalisable : chaque école cliente peut y configurer son propre logo, son nom, sa direction et sa fondation. Ces informations apparaissent dans le menu, l'onglet du navigateur et sur les bulletins imprimés.</div>

    <div class="panel">
      <div class="panel-head"><div><h2>Logo de l'école</h2><div class="sub">Format PNG ou JPG recommandé, fond transparent de préférence</div></div></div>
      <div class="logo-uploader">
        <div class="logo-preview">
          ${m.logo ? `<img src="${escapeHtml(m.logo)}" alt="Logo">` : `<span class="ph">🎓</span>`}
        </div>
        <div class="logo-actions">
          <label class="btn secondary" style="cursor:pointer;">⬆️ ${m.logo ? 'Changer le logo' : 'Importer un logo'}
            <input type="file" accept="image/*" style="display:none;" onchange="handleLogoUpload(event)">
          </label>
          ${m.logo ? `<button class="btn danger" onclick="removeLogo()">🗑️ Retirer le logo</button>` : ''}
        </div>
      </div>
    </div>

    <div class="panel">
      <div class="panel-head"><div><h2>Identité de l'établissement</h2></div></div>
${boutonRemplissage('ecole', "SCHEMA_ECOLE", 'formEcole')}
      <form id="formEcole" onsubmit="return handleSaveMeta(event)">
        <div class="form-grid">
          <div class="field span2"><label>Nom de l'école</label><input name="nomEcole" required value="${escapeHtml(m.nomEcole)}"></div>
          <div class="field span2"><label>Adresse</label><input name="adresse" value="${escapeHtml(m.adresse)}"></div>
          <div class="field"><label>Téléphone</label><input name="telephone" value="${escapeHtml(m.telephone)}"></div>
          <div class="field"><label>Année scolaire</label><input name="anneeScolaire" value="${escapeHtml(m.anneeScolaire)}"></div>
          <div class="field"><label>Nom du directeur / de la directrice</label><input name="directeurNom" placeholder="Ex : M. Kouassi Jean-Baptiste" value="${escapeHtml(m.directeurNom)}"></div>
          <div class="field"><label>Nom du fondateur / de la fondatrice</label><input name="fondateurNom" placeholder="Ex : Mme Aya Marie-Claire" value="${escapeHtml(m.fondateurNom)}"></div>
          <div class="field"><label>Heure d'arrivée attendue (enseignants)</label><input type="time" name="heureArriveeAttendue" value="${escapeHtml(m.heureArriveeAttendue)}"></div>
        </div>
        <div class="hint">Le directeur et le fondateur apparaissent dans le bloc de signature des bulletins imprimés. L'heure d'arrivée attendue sert au module Pointage pour calculer automatiquement les retards.</div>
        <div class="form-actions"><button class="btn" type="submit">Enregistrer</button></div>
      </form>
    </div>

    <div class="panel">
      <div class="panel-head"><div><h2>Niveaux de l'établissement</h2><div class="sub">Cochez les niveaux couverts par votre école — décochez-en un pour le masquer sans rien supprimer</div></div></div>
      <form onsubmit="return handleSaveNiveaux(event)">
        <div class="grid-2" style="margin-bottom:14px;">
          ${Object.entries(NIVEAUX_DEF).map(([key,n])=>{
            const actif = (DB.meta.niveaux||[]).includes(key);
            return `<label style="display:flex;align-items:center;gap:10px;padding:12px;border:1px solid var(--border);border-radius:var(--r-card);background:${actif?'var(--primary-dim)':'var(--surface-2)'};cursor:pointer;">
              <input type="checkbox" name="niveau_${key}" ${actif?'checked':''}>
              <div><strong>${n.icon} ${n.label}</strong><div class="hint">${n.desc}</div></div>
              ${actif ? `<span class="badge green" style="margin-left:auto;">Actif</span>` : ''}
            </label>`;
          }).join('')}
        </div>
        <div class="hint">Décocher un niveau le masque de toute l'application (tableau de bord, élèves, notes, comptabilité…) — ses classes et élèves restent en mémoire et réapparaissent dès que vous le recochez.</div>
        <div class="form-actions"><button class="btn" type="submit">Enregistrer les niveaux</button></div>
      </form>
      <div class="hint" style="margin:16px 0 8px;">Classes actives (${DB.classes.length}) :</div>
      <div style="display:flex;flex-wrap:wrap;gap:8px;">
        ${DB.classes.map(c=>`<span class="badge blue" style="font-size:var(--fs-xs);padding:6px 12px;">${c.nom} <span style="opacity:.6;">· ${c.cycle}</span></span>`).join('') || `<span class="hint">Aucune classe active pour le moment.</span>`}
      </div>
    </div>

    <div class="panel">
      <div class="panel-head"><div><h2>🎓 Scolarité et tranches de paiement</h2><div class="sub">Montants par classe, tranches (inscription, versements) et dates limites — utilisés pour les paiements, les reçus, les impayés et l’application des parents</div></div></div>
      ${renderEcheancesScolarite()}
    </div>

    <div class="panel">
      <div class="panel-head"><div><h2>Régime de facturation — reçus de scolarité</h2><div class="sub">Reçus simples, ou Facture Normalisée Électronique (FNE) — obligation DGI Côte d'Ivoire pour les reçus de scolarité</div></div></div>
      ${renderRegimeFacturation()}
    </div>

    <div class="panel">
      <div class="panel-head"><div><h2>TVA</h2><div class="sub">Aide de calcul si l'école est assujettie — à valider avec un comptable</div></div></div>
      ${renderPanneauTva()}
    </div>

    <div class="panel">
      <div class="panel-head"><div><h2>Paiement en ligne (Mobile Money)</h2><div class="sub">Permet à un parent de payer directement via un lien, sans passer par le personnel</div></div></div>
      <div class="hint">${(DB.paiementEnLigne||{}).actif ? `✅ Activé (${(DB.paiementEnLigne||{}).prestataire==='cinetpay'?'CinetPay':'PayDunya'})` : '⏳ Pas encore activé'} — la configuration technique (identifiants, prestataire) se fait désormais uniquement depuis la Console Développeur, pour éviter toute erreur de manipulation.</div>
    </div>

    <div class="panel">
      <div class="panel-head"><div><h2>Accès &amp; Interfaces</h2><div class="sub">Chaque profil se connecte avec son propre email et mot de passe, et ne voit que ce qui le concerne</div></div></div>
      <div class="grid-2" style="margin-bottom:14px;">
        <div class="hint">👩‍🏫 <strong>Enseignant(e)</strong> — Notes, présences élèves, emploi du temps, programmes. Pas d'accès aux élèves, à la comptabilité ni aux paramètres. Un compte enseignant peut être relié à une fiche précise (page Enseignants) pour ne voir que ses propres classes.</div>
        <div class="hint">🗂️ <strong>Secrétariat</strong> — Tout ce que voit l'enseignant + élèves, enseignants, comptabilité (chiffres globaux masqués). Pas d'accès aux paramètres.</div>
        <div class="hint">🎩 <strong>Direction</strong> — Accès complet, y compris les chiffres financiers et les paramètres.</div>
        <div class="hint">🏛️ <strong>Fondation</strong> — Accès complet, identique à la Direction.</div>
        <div class="hint">👪 <strong>Parent</strong> — Créé depuis la fiche d'un élève (page Élèves), pas depuis Supabase. Voit uniquement son/ses enfant(s), leurs notifications et annonces.</div>
        <div class="hint">🚪 <strong>Portier</strong> — Recherche un élève et signale l'arrivée de son parent à l'enseignant(e) titulaire. Ne voit aucune autre donnée (pas de coordonnées, pas de notes...).</div>
      </div>
      <div class="section-note">🔐 La création et la suppression des comptes Enseignant/Secrétariat/Direction/Fondation/Portier se font depuis le tableau de bord Supabase (Authentication → Users), puis en associant le compte à un rôle. C'est une opération d'administration technique, volontairement séparée de l'application pour éviter toute création de compte non maîtrisée. Seul le compte Parent se crée directement dans l'application (fiche élève).</div>
    </div>

    <div class="panel">
      <div class="panel-head"><div><h2>⏰ Annonces horaires automatiques</h2><div class="sub">Les parents sont prévenus automatiquement avant le début des cours, les pauses et la fin des cours — jours de classe uniquement</div></div></div>
      ${renderHorairesAnnonces()}
    </div>
    ${renderCoefficients()}
    ${['direction','fondation'].includes(ui.role) ? `<div class="panel">
      <div class="panel-head"><div><h2>📝 Notes au fil de l’eau pour les parents</h2><div class="sub">Si activé : chaque parent voit, dans son application, les notes des Camps de base de SON enfant dès qu’elles sont saisies (devoirs, exercices), avec la moyenne en cours, et reçoit une notification. Les compositions restent visibles seulement à la publication du bulletin.</div></div></div>
      <label style="display:flex;align-items:center;gap:10px;"><input type="checkbox" ${DB.meta?.notesContinuesParents ? 'checked' : ''} onchange="reglerOptionEcole('notes_continues_parents', 'notesContinuesParents', this.checked, 'Notes au fil de l’eau')">
        <strong>Montrer les notes des Camps de base aux parents</strong></label>
    </div>` : ''}

    <div class="panel">
      <div class="panel-head"><div><h2>🎂 Anniversaires des élèves</h2><div class="sub">Le tableau de bord affiche les anniversaires de la semaine ; les parents voient un bandeau de fête le jour J.</div></div></div>
      <label style="display:flex;align-items:center;gap:10px;"><input type="checkbox" ${DB.meta?.voeuxAnniversaire !== false ? 'checked' : ''} onchange="reglerVoeuxAnniversaire(this.checked)">
        <strong>Envoyer automatiquement les vœux de l’école aux parents à 8h</strong> (notification + message)</label>
    </div>

    <div class="panel">
      <div class="panel-head"><div><h2>📊 Résumé de la semaine aux parents</h2><div class="sub">Chaque vendredi à 17h30, chaque parent reçoit sur son téléphone le bilan de ses enfants : présences de la semaine (si l’appel est fait), devoirs de la semaine suivante, prochaines dates de l’agenda.</div></div></div>
      <label style="display:flex;align-items:center;gap:10px;"><input type="checkbox" ${DB.meta?.resumeHebdo !== false ? 'checked' : ''} onchange="reglerOptionEcole('resume_hebdo', 'resumeHebdo', this.checked, 'Résumé de la semaine')">
        <strong>Envoyer le résumé de la semaine chaque vendredi</strong></label>
    </div>

    <div class="panel">
      <div class="panel-head"><div><h2>📍 Zone de l'établissement</h2><div class="sub">Utilisée pour valider les pointages GPS des enseignants (à quelle distance de l'école ils se trouvent)</div></div></div>
      ${renderGeofence()}
    </div>

    ${['direction','fondation'].includes(ui.role) ? `<div class="panel">
      <div class="panel-head"><div><h2>Sauvegarde de vos données</h2><div class="sub">Un fichier Excel avec toutes les données de l’école, une feuille par sujet. À garder sur votre ordinateur ou une clé USB.</div></div></div>
      <div class="sauvegarde-ligne"><span class="etat-vide-ic" aria-hidden="true">${icone('download')}</span>
        <span>Élèves, classes, enseignants, paiements, présences, notes, dépenses, agenda… Les mots de passe ne sont jamais inclus.</span>
        <button type="button" class="btn" onclick="exporterSauvegardeComplete()">Télécharger la sauvegarde</button></div>
    </div>` : ''}

    <div class="panel" id="panneauDemandesAcces">
      <div class="panel-head"><div><h2>Demandes d’accès</h2><div class="sub">Parents, enseignants et portier qui se sont inscrits avec Google et attendent votre validation (les inscriptions enseignants sont aussi dans l’écran Enseignants)</div></div></div>
      <div id="demandesAccesBox"><div class="hint">Chargement…</div></div>
      ${(setTimeout(chargerDemandesAcces,0),'')}
    </div>

    <div class="panel">
      <div class="panel-head"><div><h2>📲 Applications Parents, Enseignants &amp; Portier</h2><div class="sub">Trois applications séparées, installables sur le téléphone : « EcoMaZ-PARENTS D'ELEVES ${escapeHtml(DB.meta.nomEcole)} », « EcoMaZ-ENSEIGNANTS ${escapeHtml(DB.meta.nomEcole)} » et « EcoMaZ-PORTIER ${escapeHtml(DB.meta.nomEcole)} »</div></div></div>
      ${renderLiensApplications()}
    </div>

    <div class="panel">
      <div class="panel-head"><div><h2>Sécurité &amp; confidentialité</h2></div></div>
      <div class="hint" style="line-height:1.6;">
        🔒 Authentification réelle par email et mot de passe (Supabase Auth) — plus aucun code partagé.<br>
        🧱 Chaque école est isolée au niveau de la base de données : techniquement impossible de voir les données d'une autre école, même en cas de faille dans l'interface.<br>
        ⏱️ Déconnexion automatique après 10 minutes d'inactivité.<br>
        💾 Les données sont hébergées sur Supabase (PostgreSQL géré), chiffrées au repos et en transit.
      </div>
      <div class="form-actions" style="justify-content:flex-start;border-top:none;padding-top:10px;">
        <a class="btn secondary" href="confidentialite.html" target="_blank" rel="noopener">📄 Politique de confidentialité</a>
        <a class="btn secondary" href="conditions.html" target="_blank" rel="noopener">📄 Conditions générales d’utilisation</a>
      </div>
    </div>

    <div class="panel">
      <div class="panel-head"><div><h2>Accès technique développeur</h2><div class="sub">Autorisez ponctuellement l'éditeur de l'application à consulter vos données pour vous dépanner</div></div></div>
      <label style="display:flex;align-items:center;gap:12px;padding:14px;border:1px solid var(--border);border-radius:var(--r-card);background:${m.accesSupportDeveloppeur?'var(--primary-dim)':'var(--surface-2)'};cursor:pointer;max-width:520px;">
        <input type="checkbox" id="chkAccesSupportDev" ${m.accesSupportDeveloppeur?'checked':''} onchange="handleToggleAccesSupportDev(this.checked)">
        <div>
          <strong>Autoriser l'accès technique du développeur</strong>
          <div class="hint">Tant que c'est décoché, personne côté développeur ne peut voir vos élèves, notes ou comptabilité — même pas l'éditeur de l'application. Cochez uniquement le temps d'un dépannage, puis décochez. L'accès reste en lecture seule : rien ne peut être modifié sans repasser par vous.</div>
        </div>
      </label>
    </div>

    <div class="panel">
      <div class="panel-head"><div><h2>Données</h2><div class="sub">Hébergées sur Supabase — partagées en temps réel entre tous les postes de l'école</div></div></div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;">
        <button class="btn secondary" onclick="exportData()">⬇️ Exporter une sauvegarde (JSON)</button>
      </div>
    </div>
  </div>`;
}

async function handleSaveMeta(ev){
  ev.preventDefault();
  const fd = new FormData(ev.target);
  const patch = {
    nomEcole: fd.get('nomEcole').trim() || DB.meta.nomEcole,
    adresse: fd.get('adresse').trim(), telephone: fd.get('telephone').trim(),
    anneeScolaire: fd.get('anneeScolaire').trim(),
    directeurNom: fd.get('directeurNom').trim(), fondateurNom: fd.get('fondateurNom').trim(),
    heureArriveeAttendue: fd.get('heureArriveeAttendue') || DB.meta.heureArriveeAttendue,
  };
  // Changer d'année scolaire ici ne fait passer aucun élève en classe supérieure :
  // le passage complet se fera avec l'assistant de fin d'année.
  if(patch.anneeScolaire && patch.anneeScolaire !== DB.meta.anneeScolaire
     && !confirm(`Changer l’année scolaire de « ${DB.meta.anneeScolaire} » à « ${patch.anneeScolaire} » ?

Attention : cela ne fait passer aucun élève en classe supérieure. Les nouveaux paiements et les nouvelles notes seront rangés dans « ${patch.anneeScolaire} ». En fin d’année, utilisez plutôt l’assistant de fin d’année (il sera prêt avant juin 2027).`)){
    return false;
  }
  try{
    const { error } = await exigerEffet(sb.from('ecoles').update(objToSnake(patch)).eq('id', session.ecoleId));
    if(error) throw error;
    Object.assign(DB.meta, patch);
    toast('Informations enregistrées');
    applyBranding();
  }catch(e){ alert('Erreur : ' + e.message); }
  return false;
}

async function handleToggleAccesSupportDev(actif){
  try{
    const { error } = await exigerEffet(sb.from('ecoles').update({ acces_support_developpeur: actif }).eq('id', session.ecoleId));
    if(error) throw error;
    DB.meta.accesSupportDeveloppeur = actif;
    toast(actif ? 'Accès technique développeur activé' : 'Accès technique développeur désactivé');
  }catch(e){
    alert('Erreur : ' + e.message);
    const chk = $('#chkAccesSupportDev'); if(chk) chk.checked = !actif;
  }
}

async function handleSaveNiveaux(ev){
  ev.preventDefault();
  const fd = new FormData(ev.target);
  const actifs = DB.meta.niveaux || [];
  const coches = Object.keys(NIVEAUX_DEF).filter(key => fd.get(`niveau_${key}`));
  const toAdd = coches.filter(key => !actifs.includes(key));
  const toRemove = actifs.filter(key => !coches.includes(key));
  if(toAdd.length===0 && toRemove.length===0){ toast('Aucun changement'); return false; }
  try{
    const codesExistants = new Set((DB.classesTout || DB.classes).map(codeClasse));
    const nouvellesClasses = toAdd.flatMap(key => NIVEAUX_DEF[key].classes).filter(c => !codesExistants.has(c.id));
    if(nouvellesClasses.length){
      // Identifiant propre à l'école (unique dans toute la base) + code du niveau
      const prefixe = String(session.ecoleId).replace(/-/g, '').slice(0, 8);
      const rows = nouvellesClasses.map(c => objToSnake({
        id: `${prefixe}-${c.id}`, code: c.id, ecoleId: session.ecoleId, nom: c.nom, cycle: c.cycle,
        fraisScolarite: FRAIS_SCOLARITE_DEFAUT[c.id] || 0,
      }));
      const { error } = await sb.from('classes').insert(rows);
      if(error) throw error;
    }
    const niveaux = coches;
    const { error: err2 } = await exigerEffet(sb.from('ecoles').update({ niveaux }).eq('id', session.ecoleId));
    if(err2) throw err2;
    DB = await chargerDB();
    const parts = [];
    if(toAdd.length) parts.push(`activé(s) : ${toAdd.map(k=>NIVEAUX_DEF[k].label).join(', ')}`);
    if(toRemove.length) parts.push(`masqué(s) : ${toRemove.map(k=>NIVEAUX_DEF[k].label).join(', ')}`);
    toast('Niveaux ' + parts.join(' — '));
    renderView('parametres');
  }catch(e){ alert('Erreur : ' + e.message); }
  return false;
}

/* ---------------------------------------------------------------------
   ÉCHÉANCES DE SCOLARITÉ CONFIGURABLES
   --------------------------------------------------------------------- */
const PRESTATAIRES_FNE = ['fne.ci', 'ESARTH', 'Faclibr', 'Tidy', 'myOctogone', 'Autre'];
function renderRegimeFacturation(){
  const c = DB.fneConfig || {regime:'recus', prestataire:'', cleConfiguree:false};
  return `
    <div class="section-note" style="background:var(--amber-bg);color:var(--amber);">⚠️ La certification réelle auprès du prestataire n'est pas encore branchée techniquement — activer le régime FNE ici prépare la configuration, mais les reçus resteront marqués "non certifié" tant que l'intégration au prestataire choisi n'est pas terminée.</div>
    <form onsubmit="return handleSaveRegimeFacturation(event)">
      <div class="form-grid">
        <div class="field span2">
          <label>Régime</label>
          <select name="regime" id="selectRegimeFacturation" onchange="document.getElementById('blocPrestataireFne').style.display = this.value==='fne' ? '' : 'none';">
            <option value="recus" ${c.regime==='recus'?'selected':''}>Reçus simples (actuel)</option>
            <option value="fne" ${c.regime==='fne'?'selected':''}>FNE (Facture Normalisée Électronique)</option>
          </select>
        </div>
        <div id="blocPrestataireFne" style="display:${c.regime==='fne'?'':'none'};" class="field span2">
          <div class="form-grid">
            <div class="field"><label>Prestataire de certification</label>
              <select name="prestataire">${PRESTATAIRES_FNE.map(p=>`<option ${c.prestataire===p?'selected':''}>${p}</option>`).join('')}</select>
            </div>
            <div class="field"><label>Clé API ${c.cleConfiguree ? '(✅ déjà enregistrée)' : ''}</label>
              <input type="text" name="apiKey" placeholder="${c.cleConfiguree ? 'Laisser vide pour ne pas changer' : 'Coller la clé API du prestataire'}" autocomplete="off" spellcheck="false">
            </div>
          </div>
          <div class="hint">La clé API n'est jamais réaffichée une fois enregistrée, ni visible par le Secrétariat ou les enseignants — seule Direction/Fondation peut la modifier.</div>
        </div>
      </div>
      <div class="form-actions"><button type="submit" class="btn">Enregistrer</button></div>
    </form>`;
}
async function handleSaveRegimeFacturation(ev){
  ev.preventDefault();
  const fd = new FormData(ev.target);
  const regime = fd.get('regime');
  const prestataire = regime==='fne' ? fd.get('prestataire') : '';
  const apiKey = (fd.get('apiKey')||'').trim();
  try{
    const patch = {ecole_id: session.ecoleId, regime, prestataire};
    if(apiKey) patch.api_key = apiKey;
    const { error } = await sb.from('fne_config').upsert(patch, {onConflict:'ecole_id'});
    if(error) throw error;
    DB.fneConfig = {regime, prestataire, cleConfiguree: DB.fneConfig?.cleConfiguree || !!apiKey};
    toast('Régime de facturation enregistré');
    renderView('parametres');
  }catch(e){ alert('Erreur : ' + e.message); }
  return false;
}

/* ---------------------------------------------------------------------
   TVA (ROADMAP COMPTABILITÉ — ÉTAPE 9, DERNIÈRE)
   Voir schema.sql section 28 : par défaut assujetti_tva = false, donc
   rien ne change tant que Direction/Fondation ne l'active pas. Aide de
   calcul uniquement — l'école doit valider son assujettissement réel et
   quelles catégories sont concernées avec son comptable.
   --------------------------------------------------------------------- */
function categorieRecetteDeObjet(objet){
  if(!objet) return null;
  if(objet.startsWith('Scolarité')) return 'Scolarité';
  if(objet.startsWith('Cotisation')) return 'Activités extra-scolaires';
  if(objet.startsWith('Vente')) return 'Boutique scolaire';
  return null;
}
function tvaApplicablePour(categorie){
  const c = (DB.tvaCategories||[]).find(x=>x.categorie===categorie);
  return c ? c.tvaApplicable===true : false;
}
function renderPanneauTva(){
  const m = DB.meta;
  return `
    <div class="section-note" style="background:var(--amber-bg);color:var(--amber);">⚠️ L'enseignement est en principe exonéré de TVA en Côte d'Ivoire, mais l'assujettissement dépend du régime fiscal de l'école, et certaines recettes (boutique scolaire notamment) peuvent rester taxables même si la scolarité est exonérée. Ceci est une aide de calcul, pas une validation fiscale — à confirmer avec ton comptable avant toute déclaration.</div>
    <form onsubmit="return handleSaveTva(event)">
      <div class="form-grid">
        <div class="field"><label>École assujettie à la TVA ?</label>
          <select name="assujetti">
            <option value="non" ${!m.assujettiTva?'selected':''}>Non</option>
            <option value="oui" ${m.assujettiTva?'selected':''}>Oui</option>
          </select>
        </div>
        <div class="field"><label>Taux de TVA (%)</label><input type="number" name="taux" min="0" max="100" step="0.5" value="${m.tauxTva}"></div>
      </div>
      <div class="form-actions"><button type="submit" class="btn">Enregistrer</button></div>
    </form>
    ${m.assujettiTva ? `
    <div class="hint" style="margin-top:14px;">Catégories de recettes concernées par la TVA (cochées = TVA appliquée sur les reçus et dans les exports) :</div>
    <div class="table-wrap" style="margin-top:10px;"><table><thead><tr><th>Catégorie</th><th>TVA applicable</th></tr></thead><tbody>
      ${CATEGORIES_RECETTES_BUDGET.map(c=>`<tr><td>${c}</td><td><input type="checkbox" ${tvaApplicablePour(c)?'checked':''} onchange="handleSaveTvaCategorie('${c}', this.checked)"></td></tr>`).join('')}
    </tbody></table></div>` : ''}`;
}
async function handleSaveTva(ev){
  ev.preventDefault();
  const fd = new FormData(ev.target);
  const assujettiTva = fd.get('assujetti')==='oui';
  const tauxTva = Math.max(0, parseFloat(fd.get('taux'))||0);
  try{
    const { error } = await exigerEffet(sb.from('ecoles').update({assujetti_tva: assujettiTva, taux_tva: tauxTva}).eq('id', session.ecoleId));
    if(error) throw error;
    DB.meta.assujettiTva = assujettiTva;
    DB.meta.tauxTva = tauxTva;
    toast('TVA enregistrée');
    renderView('parametres');
  }catch(e){ alert('Erreur : ' + e.message); }
  return false;
}
async function handleSaveTvaCategorie(categorie, checked){
  // "existant" (trouvé via la vue tva_categories_lecture) veut dire
  // qu'une ligne comptes_syscohada existe déjà pour cette catégorie —
  // on ne touche alors QUE tva_applicable, jamais code/libellé (qui ont
  // pu être personnalisés dans l'onglet Plan SYSCOHADA, étape 7).
  const existant = (DB.tvaCategories||[]).find(x=>x.categorie===categorie);
  try{
    if(existant){
      const { error } = await sb.from('comptes_syscohada')
        .update({tva_applicable: checked})
        .eq('ecole_id', session.ecoleId).eq('type','recette').eq('categorie', categorie);
      if(error) throw error;
      existant.tvaApplicable = checked;
    } else {
      const defaut = CODES_SYSCOHADA_DEFAUT[`recette|${categorie}`] || {code:'', libelle:''};
      const { error } = await sb.from('comptes_syscohada')
        .insert({ecole_id: session.ecoleId, type:'recette', categorie, tva_applicable: checked, code: defaut.code, libelle: defaut.libelle});
      if(error) throw error;
      DB.tvaCategories = [...(DB.tvaCategories||[]), {categorie, tvaApplicable: checked}];
    }
    toast('TVA mise à jour pour ' + categorie);
  }catch(e){ alert('Erreur : ' + e.message); }
}

/* ---------------------------------------------------------------------
   PAIEMENT EN LIGNE MOBILE MONEY — la configuration (prestataire,
   identifiants API) se fait désormais exclusivement depuis la Console
   Développeur (décision du 2026-09-24, jugée trop technique pour
   Direction/Fondation) — voir EcoMaZ-dev-console/app-dev.js et la
   fonction serveur configurer-paiement-en-ligne. Ici, l'appli cliente ne
   fait que LIRE le statut (DB.paiementEnLigne, chargé via
   paiement_en_ligne_config_lecture) pour savoir si un lien peut être
   généré — voir genererLienPaiement plus bas.
   --------------------------------------------------------------------- */
async function genererLienPaiement(eleveId, trancheLabel, montant){
  const c = DB.paiementEnLigne || {actif:false, prestataire:''};
  if(!c.actif || !c.prestataire){
    toast('Paiement en ligne non activé — configure-le dans Paramètres');
    return;
  }
  const tranche = trancheLabel || 'Solde restant';
  toast('Génération du lien de paiement…');
  try{
    const { data, error } = await sb.functions.invoke('initier-paiement-en-ligne', { body: { eleveId, tranche, montant } });
    if(error) throw new Error(await messageErreurFonction(error));
    if(!data?.ok) throw new Error(data?.error || 'Échec de la génération du lien');
    const eleve = eleveById(eleveId);
    openModal('Lien de paiement généré', `
      <div class="section-note">${data.mode==='test' ? 'Le paiement en ligne n’est pas encore activé pour l’établissement : ce lien ne permet pas encore de régler. Contactez EcoMaZ pour l’activation.' : '✅ Lien de paiement sécurisé : le parent règle directement en ligne.'}</div>
      <div class="field"><label>Lien à envoyer à ${escapeHtml(eleveFullName(eleve))} / son parent</label>
        <input type="text" id="lienPaiementGenere" readonly value="${escapeHtml(data.url)}" onclick="this.select()" style="width:100%;">
      </div>
      <div class="hint">Copiez ce lien et envoyez-le au parent par WhatsApp, SMS ou autre : il paiera directement sur la page sécurisée PayDunya (Orange Money, MTN, Moov, Wave, carte).</div>
      <div class="form-actions">
        <button type="button" class="btn secondary" onclick="closeModal()">Fermer</button>
        <button type="button" class="btn" onclick="copierLienPaiement(${jsArg(data.url)})">📋 Copier le lien</button>
      </div>`);
  }catch(e){ alert('Erreur : ' + e.message); }
}
async function copierLienPaiement(url){
  try{ await navigator.clipboard.writeText(url); toast('Lien copié'); }
  catch(_e){
    const input = document.getElementById('lienPaiementGenere');
    if(input){ input.select(); document.execCommand('copy'); toast('Lien copié'); }
  }
}
// Paramètres → Scolarité : chaque école règle ses montants par classe et ses
// tranches de paiement (grille propre à une classe, ou grille commune).
function grilleSource(classeId){
  const toutes = DB.echeancesScolarite || [];
  if(toutes.some(e => e.classeId === classeId)) return 'propre';
  if(toutes.some(e => !e.classeId)) return 'commune';
  return 'simple';
}
// Contrôle intelligent : une tranche datée APRÈS une tranche suivante, ou des frais d'inscription
// échus après les versements, trahit presque toujours une erreur de saisie (mois ou année)
function anomaliesEcheances(liste){
  const datees = liste.filter(e => e.dateEcheance), pb = [];
  datees.forEach((e, i) => { const suite = datees.slice(i + 1).find(x => x.dateEcheance < e.dateEcheance); if(suite) pb.push(`« ${e.label} » (${fmtDate(e.dateEcheance)}) tombe après « ${suite.label} » (${fmtDate(suite.dateEcheance)})`); });
  const insc = datees.find(e => /inscription/i.test(e.label)), autres = datees.filter(e => e !== insc);
  if(insc && autres.length && autres.every(x => x.dateEcheance < insc.dateEcheance) && !pb.some(t => t.includes(insc.label))) pb.push(`les frais d’inscription (${fmtDate(insc.dateEcheance)}) sont dus après tous les versements`);
  return pb;
}
function classesEcheancesIncoherentes(){
  return DB.classes.filter(c => grilleSource(c.id) === 'propre' && anomaliesEcheances(echeancesDeClasse(c.id)).length);
}
function renderEcheancesScolarite(){
  const portee = ui.filters.grillePortee || '';            // '' = grille commune, sinon id de classe
  const liste = (DB.echeancesScolarite||[]).filter(e => (e.classeId || '') === portee)
    .sort((a,b)=>(a.ordre-b.ordre)||(a.dateEcheance||'').localeCompare(b.dateEcheance||''));
  const total = liste.reduce((t, e) => t + Number(e.montant || 0), 0);
  const nomPortee = portee ? classeName(portee) : 'Grille commune (toutes les classes sans grille propre)';
  const visible = DB.meta?.scolariteVisibleParents === true;
  const recap = DB.classes.map(c => {
    const src = grilleSource(c.id), du = duAnnuelClasse(c.id), fraisFiche = (DB.fraisScolarite||{})[c.id] || 0;
    const ecart = src !== 'simple' && fraisFiche && fraisFiche !== du;
    return `<tr>
      <td>${escapeHtml(c.nom)}</td>
      <td><strong>${fmtFCFA(du)}</strong>${ecart ? `<div class="hint" style="margin:0;color:var(--warning);">⚠️ différent des frais notés pour la classe (${fmtFCFA(fraisFiche)})</div>` : ''}</td>
      <td>${src === 'propre' ? '<span class="badge green">grille de la classe</span>' : src === 'commune' ? '<span class="badge blue">grille commune</span>' : '<span class="badge gray">montant annuel seul</span>'}</td>
      <td><button class="btn secondary sm" onclick="ui.filters.grillePortee='${c.id}'; renderView('parametres')">${src === 'propre' ? 'Modifier' : 'Créer sa grille'}</button></td>
    </tr>`;
  }).join('');
  return `
    <div class="form-actions" style="justify-content:flex-start;margin-top:0;"><button class="btn" onclick="ouvrirAssistantScolarite()">⚡ Assistant : inscription + scolarité par classe</button></div>
    <div class="section-note">💡 Créez les tranches de paiement de <strong>chaque classe</strong> (frais d’inscription, 1er versement…). Une classe sans grille propre utilise la <strong>grille commune</strong>. Le total des tranches devient le montant annuel de la classe.</div>
    <div class="table-wrap" style="margin-bottom:16px;"><table>
      <thead><tr><th>Classe</th><th>Scolarité annuelle</th><th>Tranches utilisées</th><th></th></tr></thead>
      <tbody>${recap}</tbody>
    </table></div>

    <div class="field"><label>Tranches de :</label>
      <select onchange="ui.filters.grillePortee=this.value; renderView('parametres')">
        <option value="" ${!portee?'selected':''}>Grille commune</option>
        ${DB.classes.map(c => `<option value="${c.id}" ${portee===c.id?'selected':''}>${escapeHtml(c.nom)}${grilleSource(c.id)==='propre' ? ' ✓' : ''}</option>`).join('')}
      </select></div>
    ${(() => { const inc = classesEcheancesIncoherentes(); return inc.length ? `<div class="alerte-inscription" style="margin:0 0 12px;"><strong>⚠️ Dates à vérifier dans ${inc.length} classe${inc.length > 1 ? 's' : ''}</strong> (${inc.map(c => escapeHtml(c.nom)).join(', ')}) : ${escapeHtml(anomaliesEcheances(echeancesDeClasse(inc[0].id))[0])}. Une date mal saisie fausse les relances et les retards de paiement.</div>` : ''; })()}
    <h4 style="margin:6px 0;">${escapeHtml(nomPortee)} — total ${fmtFCFA(total)}</h4>
    ${anomaliesEcheances(liste).length ? `<div class="hint" style="color:var(--warning);margin:0 0 8px;">⚠️ ${anomaliesEcheances(liste).map(escapeHtml).join(' · ')}</div>` : ''}
    ${liste.length===0 ? `<div class="hint" style="margin-bottom:14px;">${portee ? 'Cette classe n’a pas encore de grille propre : elle utilise la grille commune (ou son montant annuel).' : 'Aucune tranche dans la grille commune.'}</div>` : `
    <div class="table-wrap" style="margin-bottom:14px;"><table>
      <thead><tr><th>Tranche</th><th>Montant</th><th>Date limite</th><th>Actions</th></tr></thead>
      <tbody>${liste.map(e=>`<tr>
        <td>${escapeHtml(e.label)}</td><td>${fmtFCFA(e.montant)}</td><td>${e.dateEcheance ? fmtDate(e.dateEcheance) : '—'}</td>
        <td style="white-space:nowrap;"><button class="icon-btn" title="Modifier" onclick="openEcheanceForm('${e.id}')">✏️</button>
          <button class="icon-btn danger" title="Supprimer" onclick="deleteEcheance('${e.id}')">🗑️</button></td></tr>`).join('')}</tbody>
    </table></div>`}
    <div style="display:flex;flex-wrap:wrap;gap:8px;">
      <button class="btn secondary" onclick="openEcheanceForm()">+ Ajouter une tranche</button>
      ${liste.length ? `<button class="btn secondary" onclick="ouvrirCopieGrille()">Copier ces tranches vers d’autres classes</button>` : ''}
      ${portee && liste.length ? `<button class="btn secondary" onclick="supprimerGrilleClasse('${portee}')">Revenir à la grille commune</button>` : ''}
    </div>

    <div style="margin-top:18px;padding-top:14px;border-top:1px solid var(--border);">
      <label style="display:flex;align-items:center;gap:10px;"><input type="checkbox" ${visible?'checked':''} onchange="basculerScolariteParents(this.checked)">
        <strong>Montrer la scolarité aux parents</strong> (tranches, payé, reste à payer, dans leur application)</label>
      <div class="hint" style="margin:4px 0 0;">Activez seulement quand les montants ci-dessus sont justes et que les paiements sont enregistrés dans EcoMaZ.</div>
      <label style="display:flex;align-items:center;gap:10px;margin-top:12px;"><input type="checkbox" ${DB.meta?.relancesScolarite?'checked':''} ${visible?'':'disabled'} onchange="reglerRelances(this.checked)">
        <strong>Relances automatiques des tranches impayées</strong> à <input type="time" value="${DB.meta?.heureRelances || '10:00'}" ${visible?'':'disabled'} onchange="reglerRelances(null, this.value)" style="width:110px;display:inline-block;"></label>
      <div class="hint" style="margin:4px 0 0;">Message poli au parent 3 jours avant la date limite d’une tranche, le jour même, puis 7 jours après si elle n’est pas réglée (notification + messagerie). Seulement pour les tranches qui ont une date limite${visible ? '' : ' — activez d’abord « Montrer la scolarité aux parents »'}.</div>
    </div>
  `;
}
// Assistant : pour une ou plusieurs classes, frais d'inscription + scolarité
// annuelle répartie en N versements (montants égaux, arrondis à 500 F, le
// reste sur le dernier) → la grille de chaque classe est créée d'un coup.
function lignesDatesAssistant(n){
  return Array.from({ length: n }, (_, i) => `<div class="field"><label>${i + 1}${i ? 'e' : 'er'} versement — date limite</label><input type="date" name="date${i}"></div>`).join('');
}
function ouvrirAssistantScolarite(){
  const lignesDates = lignesDatesAssistant;
  openModal('⚡ Inscription et scolarité par classe', `
${boutonRemplissage('grille', "SCHEMA_GRILLE", 'formAssistant')}
    <form id="formAssistant" onsubmit="return appliquerAssistantScolarite(event)">
      <div class="field"><label>Classe(s) concernée(s) — même montant</label>
        <div style="display:flex;flex-wrap:wrap;gap:10px;">${DB.classes.map(c => `<label style="display:flex;align-items:center;gap:6px;"><input type="checkbox" name="classe" value="${c.id}"> ${escapeHtml(c.nom)}</label>`).join('')}</div></div>
      <div class="form-grid">
        <div class="field"><label>Frais d’inscription (${DEVISE})</label><input type="number" name="inscription" min="0" step="500" value="0"></div>
        <div class="field"><label>Date limite de l’inscription</label><input type="date" name="dateInscription"></div>
        <div class="field"><label>Scolarité annuelle, hors inscription (${DEVISE})</label><input type="number" name="scolarite" min="0" step="500" required></div>
        <div class="field"><label>Nombre de versements</label><select name="nb" onchange="document.getElementById('assistantDates').innerHTML = lignesDatesAssistant(Number(this.value))">${[1,2,3,4,5,6].map(n => `<option ${n===3?'selected':''}>${n}</option>`).join('')}</select></div>
      </div>
      <div class="form-grid" id="assistantDates">${lignesDates(3)}</div>
      <div class="hint">La grille actuelle des classes cochées sera remplacée. Vous pourrez ensuite modifier chaque tranche.</div>
      <div class="form-actions"><button type="button" class="btn secondary" onclick="closeModal()">Annuler</button><button class="btn" type="submit">Créer les grilles</button></div>
    </form>`);
}
async function appliquerAssistantScolarite(ev){
  ev.preventDefault();
  const fd = new FormData(ev.target);
  const classes = fd.getAll('classe');
  if(!classes.length) return alert('Cochez au moins une classe.'), false;
  const inscription = Math.max(0, parseInt(fd.get('inscription')) || 0), total = Math.max(0, parseInt(fd.get('scolarite')) || 0), nb = Number(fd.get('nb')) || 1;
  const part = Math.floor(total / nb / 500) * 500;
  const modele = [];
  if(inscription) modele.push({ label: 'Frais d’inscription', montant: inscription, date_echeance: fd.get('dateInscription') || null });
  for(let i = 0; i < nb; i++) modele.push({ label: nb === 1 ? 'Scolarité' : `${i + 1}${i ? 'e' : 'er'} versement`, montant: i === nb - 1 ? total - part * (nb - 1) : part, date_echeance: fd.get('date' + i) || null });
  if(!confirm(`Créer pour ${classes.length} classe(s) : ${modele.map(m => `${m.label} ${fmtFCFA(m.montant)}`).join(' + ')} = ${fmtFCFA(inscription + total)} ?`)) return false;
  try{
    for(const cid of classes){
      const { error: errDel } = await sb.from('echeances_scolarite').delete().eq('ecole_id', session.ecoleId).eq('classe_id', cid);
      if(errDel) throw errDel;
      const { data, error } = await sb.from('echeances_scolarite').insert(modele.map((m, i) => ({ ...m, ordre: i, classe_id: cid, ecole_id: session.ecoleId }))).select();
      if(error) throw error;
      DB.echeancesScolarite = (DB.echeancesScolarite || []).filter(e => e.classeId !== cid).concat(rowsToCamel(data));
      await synchroniserFraisClasse(cid);
    }
    closeModal(); toast(`Grilles créées pour ${classes.length} classe(s)`); renderView('parametres');
  }catch(e){ alert('Erreur : ' + e.message); }
  return false;
}
function openEcheanceForm(id){
  const e = id ? (DB.echeancesScolarite||[]).find(x=>x.id===id) : null;
  const portee = e ? (e.classeId || '') : (ui.filters.grillePortee || '');
  openModal(e ? 'Modifier la tranche' : 'Nouvelle tranche', `
${boutonRemplissage('echeance', "SCHEMA_ECHEANCE", 'formEcheance')}
    <form id="formEcheance" onsubmit="return handleSaveEcheance(event,'${id||''}')">
      <div class="hint" style="margin-top:0;">Pour : <strong>${escapeHtml(portee ? classeName(portee) : 'grille commune')}</strong></div>
      <input type="hidden" name="classeId" value="${portee}">
      <div class="form-grid">
        <div class="field span2"><label>Libellé</label><input name="label" required placeholder="Ex : Frais d’inscription, 1er versement" value="${e?escapeHtml(e.label):''}"></div>
        <div class="field"><label>Montant (${DEVISE})</label><input type="number" name="montant" min="0" step="500" required value="${e?e.montant:50000}"></div>
        <div class="field"><label>Date limite (facultatif)</label><input type="date" name="dateEcheance" value="${e&&e.dateEcheance?e.dateEcheance:''}"></div>
      </div>
      <div class="form-actions"><button type="button" class="btn secondary" onclick="closeModal()">Annuler</button><button type="submit" class="btn">Enregistrer</button></div>
    </form>`);
}
// Le total des tranches d'une classe devient son montant annuel (cohérence des écrans)
async function synchroniserFraisClasse(classeId){
  if(!classeId) return;
  const total = (DB.echeancesScolarite||[]).filter(e => e.classeId === classeId).reduce((t, e) => t + Number(e.montant||0), 0);
  if(!total) return;
  try{ await sb.from('classes').update({ frais_scolarite: total }).eq('id', classeId).eq('ecole_id', session.ecoleId); DB.fraisScolarite[classeId] = total; }catch(_e){}
}
async function handleSaveEcheance(ev, id){
  ev.preventDefault();
  const fd = new FormData(ev.target);
  const classeId = fd.get('classeId') || null;
  const patch = {
    label: fd.get('label').trim(),
    montant: Math.max(0, parseInt(fd.get('montant'))||0),
    dateEcheance: fd.get('dateEcheance') || null,
    classeId,
  };
  try{
    if(id){
      await dbUpdate('echeances_scolarite', id, patch);
      const idx = DB.echeancesScolarite.findIndex(e=>e.id===id);
      DB.echeancesScolarite[idx] = {...DB.echeancesScolarite[idx], ...patch};
    } else {
      patch.ordre = (DB.echeancesScolarite||[]).filter(e => (e.classeId||null) === classeId).length;
      DB.echeancesScolarite = DB.echeancesScolarite || [];
      DB.echeancesScolarite.push(await dbInsert('echeances_scolarite', patch));
    }
    await synchroniserFraisClasse(classeId);
    closeModal(); toast('Tranche enregistrée');
    renderView('parametres');
  }catch(e){ alert('Erreur : ' + e.message); }
  return false;
}
async function deleteEcheance(id){
  if(!confirm('Supprimer cette tranche ?')) return;
  try{
    const ech = DB.echeancesScolarite.find(e => e.id === id);
    await dbDelete('echeances_scolarite', id);
    DB.echeancesScolarite = DB.echeancesScolarite.filter(e=>e.id!==id);
    await synchroniserFraisClasse(ech?.classeId);
    toast('Tranche supprimée');
    renderView('parametres');
  }catch(e){ alert('Erreur : ' + e.message); }
}
function ouvrirCopieGrille(){
  const portee = ui.filters.grillePortee || '';
  openModal('Copier les tranches', `
    <p class="hint" style="margin-top:0;">Les tranches de <strong>${escapeHtml(portee ? classeName(portee) : 'la grille commune')}</strong> remplaceront celles des classes cochées (vous pourrez ensuite ajuster les montants).</p>
    <div style="display:flex;flex-wrap:wrap;gap:10px;">${DB.classes.filter(c => c.id !== portee).map(c => `<label style="display:flex;align-items:center;gap:6px;"><input type="checkbox" class="copieClasse" value="${c.id}"> ${escapeHtml(c.nom)}</label>`).join('')}</div>
    <div class="form-actions"><button type="button" class="btn secondary" onclick="closeModal()">Annuler</button><button type="button" class="btn" onclick="copierGrille()">Copier</button></div>`);
}
async function copierGrille(){
  const portee = ui.filters.grillePortee || '';
  const cibles = $$('.copieClasse').filter(c => c.checked).map(c => c.value);
  if(!cibles.length) return alert('Cochez au moins une classe.');
  const modele = (DB.echeancesScolarite||[]).filter(e => (e.classeId || '') === portee);
  try{
    for(const cid of cibles){
      const { error: errDel } = await sb.from('echeances_scolarite').delete().eq('ecole_id', session.ecoleId).eq('classe_id', cid);
      if(errDel) throw errDel;
      const lignes = modele.map((e, i) => ({ label: e.label, montant: e.montant, date_echeance: e.dateEcheance || null, ordre: i, classe_id: cid, ecole_id: session.ecoleId }));
      const { data, error } = await sb.from('echeances_scolarite').insert(lignes).select();
      if(error) throw error;
      DB.echeancesScolarite = DB.echeancesScolarite.filter(e => e.classeId !== cid).concat(rowsToCamel(data));
      await synchroniserFraisClasse(cid);
    }
    closeModal(); toast(`Tranches copiées vers ${cibles.length} classe(s)`); renderView('parametres');
  }catch(e){ alert('Erreur : ' + e.message); }
}
/* ---------- Échéancier : points à vérifier (dates incohérentes, grille commune inutilisée) ----------
   Rien n'est corrigé automatiquement : l'école décide, avec un bouton vers la bonne fiche. */
function bornesAnneeScolaire(){
  const m = String(DB.meta?.anneeScolaire || '').match(/(\d{4})\s*-\s*(\d{4})/);
  return m ? { debut: `${m[1]}-08-01`, fin: `${m[2]}-07-31` } : null;
}
function anomaliesEcheancier(){
  const toutes = DB.echeancesScolarite || [], bornes = bornesAnneeScolaire(), sortie = [];
  const parClasse = new Map();
  toutes.filter(e => e.classeId).forEach(e => { if(!parClasse.has(e.classeId)) parClasse.set(e.classeId, []); parClasse.get(e.classeId).push(e); });
  // 1) Une tranche datée APRÈS une tranche qui vient plus tard dans l'ordre (ex. frais d'inscription au 10/03/2027, après le 4e versement)
  const dejaVu = new Set();
  parClasse.forEach(liste => {
    const tri = liste.slice().sort((a, b) => (a.ordre - b.ordre));
    tri.forEach((e, i) => {
      if(!e.dateEcheance) return;
      const apres = tri.slice(i + 1).filter(x => x.dateEcheance && x.dateEcheance < e.dateEcheance);
      if(apres.length){ const k = `ordre|${e.label}|${e.dateEcheance}`; if(!dejaVu.has(k)){ dejaVu.add(k); sortie.push({ type:'ordre', id:e.id, label:e.label, date:e.dateEcheance, suivante: apres[apres.length - 1], classes:[e.classeId] }); } else sortie.find(x => x.type === 'ordre' && `ordre|${x.label}|${x.date}` === k).classes.push(e.classeId); }
    });
  });
  // 2) Une tranche datée hors de l'année scolaire
  if(bornes) toutes.filter(e => e.classeId && e.dateEcheance && (e.dateEcheance < bornes.debut || e.dateEcheance > bornes.fin)).forEach(e => {
    const k = `hors|${e.label}|${e.dateEcheance}`; const x = sortie.find(y => y.type === 'hors' && `hors|${y.label}|${y.date}` === k);
    if(x) x.classes.push(e.classeId); else sortie.push({ type:'hors', id:e.id, label:e.label, date:e.dateEcheance, classes:[e.classeId] });
  });
  // 3) Grille commune (sans classe) alors que toutes les classes ont leur propre grille : inutilisée
  const commune = toutes.filter(e => !e.classeId);
  if(commune.length && DB.classes.every(c => parClasse.has(c.id))) sortie.push({ type:'commune', n: commune.length, sansDate: commune.filter(e => !e.dateEcheance).length });
  // 4) Montant anormalement faible (moins de 1 000 F) : très probablement une faute de frappe (500 au lieu de 50 000)
  toutes.filter(e => e.classeId && Number(e.montant) > 0 && Number(e.montant) < 1000)
    .forEach(e => sortie.push({ type:'faible', id:e.id, label:e.label, montant:Number(e.montant), classes:[e.classeId] }));
  // 5) Tranche payée au-delà de son montant (grille modifiée APRÈS les versements, ou versement trop élevé)
  const payes = new Map();
  (DB.paiementsScolarite || []).forEach(v => { const k = `${v.eleveId}|${v.tranche}`; payes.set(k, (payes.get(k) || 0) + Number(v.montant || 0)); });
  const trop = new Map();
  (DB.eleves || []).filter(el => el.statut === 'Actif').forEach(el => echeancesDeClasse(el.classeId).forEach(ech => {
    const paye = payes.get(`${el.id}|${ech.label}`) || 0;
    if(paye > Number(ech.montant || 0)){ const k = `${el.classeId}|${ech.label}`; if(!trop.has(k)) trop.set(k, { type:'trop', classe: el.classeId, label: ech.label, du: Number(ech.montant || 0), eleves: [] }); trop.get(k).eleves.push({ el, paye }); }
  }));
  trop.forEach(x => sortie.push(x));
  return sortie;
}
function renderEcheancierAVerifier(){
  if(!['direction', 'fondation', 'secretariat'].includes(ui.role)) return '';
  const a = anomaliesEcheancier(); if(!a.length) return '';
  const nomsClasses = l => { const u = [...new Set(l)]; return u.length === DB.classes.length ? 'toutes les classes' : u.map(id => escapeHtml(classeName(id))).join(', '); };
  return `<div class="panel panneau-echeancier">
    <div class="panel-head"><div><h2>${icone('triangle-alert')} Échéancier : ${a.length} point(s) à vérifier</h2>
      <div class="sub">Les rappels aux parents et les montants « reste à payer » suivent ces dates et ces montants : une erreur envoie des rappels faux ou au mauvais moment.</div></div></div>
    <ul class="ech-anomalies">${a.map(x => x.type === 'faible'
      ? `<li><div><strong>« ${escapeHtml(x.label)} » à ${fmtFCFA(x.montant)} — ${escapeHtml(classeName(x.classes[0]))}</strong><small>Montant anormalement faible pour une tranche : probablement une faute de frappe (un ou deux zéros oubliés ?). Les « reste à payer » et les rappels aux parents en dépendent.</small></div>
          <button type="button" class="btn secondary sm" onclick="openEcheanceForm('${x.id}')">Corriger le montant</button></li>`
      : x.type === 'trop'
      ? `<li><div><strong>« ${escapeHtml(x.label)} » payée au-delà du montant — ${escapeHtml(classeName(x.classe))}</strong><small>Montant de la tranche : ${fmtFCFA(x.du)}. ${x.eleves.length} élève(s) ont versé plus : ${x.eleves.slice(0, 4).map(v => `${escapeHtml(eleveFullName(v.el))} (${fmtFCFA(v.paye)})`).join(', ')}${x.eleves.length > 4 ? '…' : ''}. Soit la grille a été modifiée après les versements, soit un versement est trop élevé : corrigez l’un ou l’autre.</small></div>
          <span style="display:flex;gap:6px;flex-wrap:wrap;"><button type="button" class="btn secondary sm" onclick="openEcheanceForm('${(echeancesDeClasse(x.classe).find(e => e.label === x.label) || {}).id || ''}')">Voir la tranche</button>
          <button type="button" class="btn secondary sm" onclick="ui.filters.comptaClasse='${x.classe}'; renderView('comptabilite'); setTimeout(() => document.querySelector('.panneau-echeancier + .panel')?.scrollIntoView({ behavior:'smooth', block:'start' }), 100)">Voir les versements</button></span></li>`
      : x.type === 'commune'
      ? `<li><div><strong>Grille commune inutilisée</strong><small>${x.n} tranche(s) sans classe${x.sansDate ? `, dont ${x.sansDate} sans date` : ''}. Toutes les classes ont leur propre grille : cette grille commune ne sert à rien.</small></div>
          <button type="button" class="btn secondary sm" onclick="supprimerGrilleCommune()">Supprimer la grille commune</button></li>`
      : `<li><div><strong>« ${escapeHtml(x.label)} » au ${fmtDate(x.date)}</strong><small>${x.type === 'ordre' ? `Datée après « ${escapeHtml(x.suivante.label)} » (${fmtDate(x.suivante.dateEcheance)}) alors qu’elle vient avant dans l’ordre.` : `En dehors de l’année scolaire ${escapeHtml(DB.meta?.anneeScolaire || '')}.`} Concerne ${nomsClasses(x.classes)}.</small></div>
          <button type="button" class="btn secondary sm" onclick="corrigerDateTranche(${jsArg(x.label)},'${x.date}')">Corriger la date</button></li>`).join('')}</ul>
  </div>`;
}
// Corrige la même tranche (même libellé, même date) dans toutes les classes concernées, en une fois
function corrigerDateTranche(label, date){
  const cibles = (DB.echeancesScolarite || []).filter(e => e.classeId && e.label === label && e.dateEcheance === date);
  openModal('Corriger la date de la tranche', `
    <form onsubmit="return enregistrerDateTranche(event)">
      <input type="hidden" name="label" value="${escapeHtml(label)}"><input type="hidden" name="ancienne" value="${date}">
      <p style="margin-top:0;">« <strong>${escapeHtml(label)}</strong> » est datée du <strong>${fmtDate(date)}</strong> dans ${cibles.length} classe(s). Indiquez la bonne date : elle sera appliquée à toutes ces classes.</p>
      <div class="field"><label for="nvDate">Nouvelle date</label><input id="nvDate" type="date" name="date" required value="${date}"></div>
      <div class="form-actions"><button type="button" class="btn secondary" onclick="closeModal()">Annuler</button><button class="btn" type="submit">Enregistrer</button></div>
    </form>`);
}
async function enregistrerDateTranche(ev){
  ev.preventDefault();
  const fd = new FormData(ev.target), label = fd.get('label'), ancienne = fd.get('ancienne'), date = fd.get('date');
  if(!date || date === ancienne){ closeModal(); return false; }
  const cibles = (DB.echeancesScolarite || []).filter(e => e.classeId && e.label === label && e.dateEcheance === ancienne);
  try{
    const { error } = await sb.from('echeances_scolarite').update({ date_echeance: date }).eq('ecole_id', session.ecoleId).eq('label', label).eq('date_echeance', ancienne).not('classe_id', 'is', null);
    if(error) throw error;
    cibles.forEach(e => { e.dateEcheance = date; });
    closeModal(); toast(`Date corrigée dans ${cibles.length} classe(s)`); renderView('comptabilite');
  }catch(e){ alert('Erreur : ' + e.message); }
  return false;
}
async function supprimerGrilleCommune(){
  const n = (DB.echeancesScolarite || []).filter(e => !e.classeId).length;
  if(!confirm(`Supprimer la grille commune (${n} tranche(s) sans classe) ? Les grilles propres à chaque classe ne changent pas.`)) return;
  try{
    const { error } = await sb.from('echeances_scolarite').delete().eq('ecole_id', session.ecoleId).is('classe_id', null);
    if(error) throw error;
    DB.echeancesScolarite = DB.echeancesScolarite.filter(e => e.classeId);
    toast('Grille commune supprimée'); renderView('comptabilite');
  }catch(e){ alert('Erreur : ' + e.message); }
}
async function supprimerGrilleClasse(classeId){
  if(!confirm(`Supprimer la grille propre de ${classeName(classeId)} ? La classe utilisera la grille commune.`)) return;
  try{
    const { error } = await sb.from('echeances_scolarite').delete().eq('ecole_id', session.ecoleId).eq('classe_id', classeId);
    if(error) throw error;
    DB.echeancesScolarite = DB.echeancesScolarite.filter(e => e.classeId !== classeId);
    toast('Grille de la classe supprimée'); renderView('parametres');
  }catch(e){ alert('Erreur : ' + e.message); }
}
async function reglerRelances(actif, heure){
  const patch = {};
  if(actif !== null && actif !== undefined) patch.relances_scolarite = actif;
  if(heure) patch.heure_relances = heure;
  try{
    const { error } = await exigerEffet(sb.from('ecoles').update(patch).eq('id', session.ecoleId));
    if(error) throw error;
    if('relances_scolarite' in patch) DB.meta.relancesScolarite = patch.relances_scolarite;
    if(heure) DB.meta.heureRelances = heure;
    toast(('relances_scolarite' in patch) ? (patch.relances_scolarite ? 'Relances automatiques activées' : 'Relances automatiques désactivées') : 'Heure des relances enregistrée');
  }catch(e){ alert('Erreur : ' + e.message); renderView('parametres'); }
}
async function basculerScolariteParents(visible){
  if(visible && !confirm('Les parents verront dans leur application les tranches, ce qui est payé et le reste à payer de leur enfant. Les montants et les paiements sont-ils à jour ?')){ renderView('parametres'); return; }
  try{
    const { error } = await exigerEffet(sb.from('ecoles').update({ scolarite_visible_parents: visible }).eq('id', session.ecoleId));
    if(error) throw error;
    DB.meta.scolariteVisibleParents = visible;
    toast(visible ? 'Scolarité visible par les parents' : 'Scolarité masquée aux parents');
  }catch(e){ alert('Erreur : ' + e.message); renderView('parametres'); }
}

function handleLogoUpload(ev){
  const file = ev.target.files[0];
  if(!file) return;
  if(!file.type.startsWith('image/')){ alert('Veuillez sélectionner un fichier image (PNG, JPG, SVG…).'); ev.target.value=''; return; }
  if(file.size > 1.5*1024*1024){ alert("L'image est trop volumineuse (max 1,5 Mo). Choisissez un logo plus léger."); ev.target.value=''; return; }
  const reader = new FileReader();
  reader.onload = async () => {
    try{
      const { error } = await exigerEffet(sb.from('ecoles').update({ logo_url: reader.result }).eq('id', session.ecoleId));
      if(error) throw error;
      DB.meta.logo = reader.result;
      applyBranding();
      toast('Logo mis à jour');
      renderView('parametres');
    }catch(e){ alert('Erreur : ' + e.message); }
  };
  reader.readAsDataURL(file);
}

async function removeLogo(){
  if(!confirm('Retirer le logo de l\'école ?')) return;
  try{
    const { error } = await exigerEffet(sb.from('ecoles').update({ logo_url: '' }).eq('id', session.ecoleId));
    if(error) throw error;
    DB.meta.logo = '';
    applyBranding();
    toast('Logo retiré');
    renderView('parametres');
  }catch(e){ alert('Erreur : ' + e.message); }
}

function exportData(){
  if(!confirm("Ce fichier contiendra toutes les données de l'école (élèves, contacts des parents, salaires, finances) en clair, non chiffrées.\n\nConservez-le dans un emplacement sécurisé et ne le partagez qu'avec des personnes autorisées.\n\nContinuer l'export ?")) return;
  const blob = new Blob([JSON.stringify(DB, null, 2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `ecomaz-donnees-${todayISO()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  toast('Export démarré');
}

/* ---------------------------------------------------------------------
   12.9 EXPORT COMPTABLE (ROADMAP COMPTABILITÉ — ÉTAPE 4) — un tableau
   CSV de tous les mouvements financiers (respecte le filtre de période
   déjà sélectionné dans Aperçu), au format attendu par Excel en français
   (séparateur ; et BOM UTF-8 pour les accents), pour transmission à un
   comptable externe.
   --------------------------------------------------------------------- */
function exporterComptabiliteCSV(){
  const periode = ui.filters.comptaPeriode || 'all';
  const inPeriod = iso => periode==='all' || iso.slice(0,7)===periode;
  const lignes = [];
  DB.paiementsScolarite.filter(p=>inPeriod(p.date)).forEach(p=>{
    lignes.push({date:p.date, type:'Entrée', categorie:'Scolarité', libelle:`${p.tranche} — ${eleveFullName(eleveById(p.eleveId)||{prenom:'—',nom:''})}`, montant:p.montant, mode:p.modePaiement});
  });
  DB.paiementsCotisations.filter(p=>inPeriod(p.date)).forEach(p=>{
    const act = DB.activites.find(a=>a.id===p.activiteId);
    lignes.push({date:p.date, type:'Entrée', categorie:'Activité extra-scolaire', libelle:`${act?act.nom:'—'} — ${eleveFullName(eleveById(p.eleveId)||{prenom:'—',nom:''})}`, montant:p.montant, mode:p.modePaiement});
  });
  DB.ventesGadgets.filter(v=>inPeriod(v.date)).forEach(v=>{
    const g = DB.gadgets.find(x=>x.id===v.gadgetId);
    lignes.push({date:v.date, type:'Entrée', categorie:'Boutique scolaire', libelle:`${g?g.nom:'—'} ×${v.quantite}`, montant:v.montantTotal, mode:v.modePaiement});
  });
  DB.paiementsSalaires.filter(p=>inPeriod(p.datePaiement)).forEach(p=>{
    lignes.push({date:p.datePaiement, type:'Sortie', categorie:'Salaire', libelle:`${personnelNomById(p.personnelId,p.personnelType)} — ${moisLabel(p.mois)}`, montant:p.montant, mode:p.modePaiement});
  });
  DB.depenses.filter(d=>inPeriod(d.date)).forEach(d=>{
    lignes.push({date:d.date, type:'Sortie', categorie:d.categorie, libelle:d.libelle, montant:d.montant, mode:d.modePaiement});
  });
  lignes.sort((a,b)=>a.date.localeCompare(b.date));

  const echapperCSV = v => {
    const s = String(v==null?'':v);
    return /[",;\n]/.test(s) ? '"' + s.replace(/"/g,'""') + '"' : s;
  };
  const entetes = ['Date','Type','Catégorie','Libellé','Montant (FCFA)','Mode de paiement'];
  const corps = lignes.map(l=>[l.date,l.type,l.categorie,l.libelle,l.montant,l.mode].map(echapperCSV).join(';'));
  const csv = '﻿' + [entetes.join(';'), ...corps].join('\r\n');
  const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `ecomaz-comptabilite-${periode==='all'?'toute-periode':periode}-${todayISO()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  toast(`Export CSV démarré — ${lignes.length} mouvement(s)`);
}

