/* ---------------------------------------------------------------------
   ESPACE PORTIER — recherche un élève, signale que son parent est arrivé.
   Aucune autre donnée que nom/prénom/classe n'est jamais chargée (voir
   chargerDBPortier() dans supabase-client.js).
   --------------------------------------------------------------------- */
function enterAppPortier(){
  document.body.classList.add('theme-portier');
  $('#loginGate').classList.remove('open');
  $('#appRoot').style.display = '';
  $('#sidebar').style.display = 'none';
  $('#burger').style.display = 'none';
  applyBranding();
  $('#viewTitle').innerHTML = `<span class="gate-sur">${titreTableauDeBord('portier')} · ${escapeHtml(DB.meta.nomEcole || '')}</span>
    <span class="gate-titre">Arrivée des parents</span>
    <span class="sr-only">${escapeHtml(window.ESPACE_FIXE ? nomApplication() : 'Espace Portier')}</span>`;
  const pill = $('#topbarPill');
  pill.innerHTML = `<span class="gate-etat"><span class="gate-point" aria-hidden="true"></span>En service</span>
    <span class="gate-compteur" id="gateCompteur" title="Parents signalés aujourd’hui">Aujourd’hui : <strong>…</strong></span>
    <button class="btn secondary sm" onclick="logoutRole()">🔒 Déconnexion</button>`;
  ui.filters.portierRecherche = '';
  refreshPortierDashboard();
  majCompteurPortier();
  startIdleWatcher();
  afficherNouveautes();
}
function refreshPortierDashboard(){
  $('#viewContainer').innerHTML = renderPortierDashboard();
  const input = $('#portierRecherche');
  if(input){ input.focus(); const pos = input.value.length; input.setSelectionRange(pos, pos); }
}
function renderBoutonEleve(e){
  return `<button class="gate-eleve em-press" onclick="handleNotifierPortier('${e.id}')">
    <span class="gate-eleve-id"><strong>${escapeHtml(eleveFullName(e))}</strong><span class="gate-eleve-classe">${escapeHtml(classeName(e.classeId))}</span></span>
    <span class="gate-eleve-action">${icone('bell')} Prévenir</span>
  </button>`;
}
function renderPortierDashboard(){
  const q = (ui.filters.portierRecherche || '').toLowerCase().trim();

  // Mode recherche : prioritaire dès qu'on tape quelque chose, quelle que
  // soit la classe sélectionnée par ailleurs.
  if(q){
    const resultats = DB.eleves.filter(e => `${e.prenom} ${e.nom}`.toLowerCase().includes(q)).slice(0, 30);
    return `<div class="view active">
      <div class="panel">
        <div class="panel-head"><div><h2>Le parent d’un élève est arrivé</h2><div class="sub">Tapez le nom de l’élève, ou parcourez par classe</div></div></div>
        ${renderPortierBarreRecherche()}
        ${!resultats.length ? `<div class="etat-vide"><span class="etat-vide-ic" aria-hidden="true">${icone('search')}</span><span>Aucun élève à ce nom. Vérifiez l’orthographe ou cherchez par classe.</span></div>` :
          `<div style="display:flex;flex-direction:column;gap:8px;">${resultats.map(renderBoutonEleve).join('')}</div>`}
      </div>
    </div>`;
  }

  // Mode "classe sélectionnée" : liste des élèves de cette classe.
  const classeId = ui.filters.portierClasse;
  if(classeId){
    const c = DB.classes.find(c=>c.id===classeId);
    const elevesClasse = DB.eleves.filter(e=>e.classeId===classeId)
      .sort((a,b)=>eleveFullName(a).localeCompare(eleveFullName(b)));
    return `<div class="view active">
      <div class="panel">
        <button class="btn secondary sm" style="margin-bottom:14px;" onclick="ui.filters.portierClasse=null; refreshPortierDashboard()">‹ Toutes les classes</button>
        <div class="panel-head"><div><h2>${escapeHtml(c?c.nom:'Classe')}</h2><div class="sub">Touchez un nom pour prévenir l’enseignant(e)</div></div></div>
        ${renderPortierBarreRecherche()}
        ${!elevesClasse.length ? `<div class="etat-vide"><span class="etat-vide-ic" aria-hidden="true">${icone('users')}</span><span>Aucun élève actif dans cette classe.</span></div>` :
          `<div style="display:flex;flex-direction:column;gap:8px;">${elevesClasse.map(renderBoutonEleve).join('')}</div>`}
      </div>
    </div>`;
  }

  // Mode par défaut : liste des classes, groupées par cycle.
  const cycles = [...new Set(DB.classes.map(c=>c.cycle))];
  return `<div class="view active">
    ${renderAccueilPortierApp()}
    <div class="portier-bonjour"><h2>${escapeHtml(salutation())}</h2>${renderQuestionAppel()}</div>
    <div class="panel">
      <div class="panel-head">
        <div><h2>Le parent d’un élève est arrivé</h2><div class="sub">Choisissez une classe, ou tapez le nom de l’élève</div></div>
      </div>
      ${renderPortierBarreRecherche()}
      ${cycles.map(cycle=>`
        <div class="hint" style="font-weight:700;margin:14px 0 8px;">${escapeHtml(cycle)}</div>
        <div class="dbr-barre">
          ${DB.classes.filter(c=>c.cycle===cycle).map((c, k)=>{
            const effectif = DB.eleves.filter(e=>e.classeId===c.id).length;
            return `<button type="button" class="dbr-onglet gate-classe" onclick="ui.filters.portierClasse='${c.id}'; refreshPortierDashboard()">
              ${iconeService('school', ['nuit', 'indigo', 'ocean', 'menthe'][k % 4])}<span class="dbr-titre">${escapeHtml(c.nom)}</span><small class="dbr-sous">${effectif} élève(s)</small>
            </button>`;
          }).join('')}
        </div>`).join('') || `<div class="empty">Aucune classe active.</div>`}
    </div>
  </div>`;
}
function renderPortierBarreRecherche(){
  return `<input type="text" id="portierRecherche" placeholder="Rechercher un élève…" aria-label="Rechercher un élève dans toutes les classes" value="${escapeHtml(ui.filters.portierRecherche||'')}"
    oninput="ui.filters.portierRecherche=this.value; refreshPortierDashboard()"
    style="width:100%;padding:14px;font-size:var(--fs-md);border:1px solid var(--border);border-radius:var(--r-card);margin-bottom:16px;">`;
}
function renderEtatPortier(etat, e, detail){
  const eleve = e ? `<div class="gate-fiche"><span class="gate-av" aria-hidden="true">${escapeHtml(initials(e.prenom, e.nom))}</span><strong>${escapeHtml(eleveFullName(e))}</strong><span>${escapeHtml(classeName(e.classeId))}</span>
      ${detail && detail.heure ? `<span class="gate-heure">Signalé à ${detail.heure}</span>` : ''}</div>` : '';
  if(etat === 'envoi') return `<div class="view active"><div class="gate-etat-carte" role="status" aria-live="polite">
      <svg class="gate-spinner em-spin" viewBox="0 0 72 72" aria-hidden="true"><circle cx="36" cy="36" r="30" fill="none" stroke="var(--em-gate-border)" stroke-width="6"/><path d="M36 6a30 30 0 0 1 30 30" fill="none" stroke="var(--em-gold-400)" stroke-width="6" stroke-linecap="round"/></svg>
      <div class="gate-etat-titre">Envoi à l’enseignant…</div>${eleve}</div></div>`;
  if(etat === 'ok') return `<div class="view active"><div class="gate-etat-carte" role="status" aria-live="polite">
      <div class="gate-rond gate-rond-ok em-pop"><span class="gate-onde" aria-hidden="true"></span>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path class="gate-coche" d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
      <div class="gate-etat-titre">Enseignant prévenu</div>${eleve}
      <div id="gateAutorises"></div>
      <button class="gate-btn-principal em-press" onclick="ui.filters.portierRecherche=''; refreshPortierDashboard()">Nouveau signalement</button></div></div>`;
  return `<div class="view active"><div class="gate-etat-carte" role="alert">
      <div class="gate-rond gate-rond-erreur"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7L7 17" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"/></svg></div>
      <div class="gate-etat-titre">Envoi impossible</div>${eleve}
      <div class="gate-erreur-detail">${escapeHtml(detail && detail.message ? detail.message : 'Vérifiez la connexion internet puis réessayez.')}</div>
      ${e ? `<button class="gate-btn-principal em-press" onclick="handleNotifierPortier('${e.id}')">Réessayer</button>` : ''}
      <button class="gate-btn-contour em-press" onclick="refreshPortierDashboard()">Retour à la liste</button></div></div>`;
}
// Compteur du jour (DESIGN.md §11) : uniquement un nombre, jamais de nom (schema.sql section 100)
async function majCompteurPortier(){
  const z = document.querySelector('#gateCompteur strong'); if(!z) return;
  try{
    const { data, error } = await sb.rpc('compteur_portier_jour');
    if(error || data === null || data === undefined) throw error || new Error('');
    z.textContent = data;
    z.parentElement.title = `${data} parent${data > 1 ? 's' : ''} signalé${data > 1 ? 's' : ''} aujourd’hui`;
  }catch(_e){ z.textContent = '—'; }
}
async function handleNotifierPortier(eleveId){
  const e = (DB.eleves||[]).find(x => x.id === eleveId);
  $('#viewContainer').innerHTML = renderEtatPortier('envoi', e);
  try{
    const { error } = await sb.from('notifications_portier').insert({ eleve_id: eleveId });
    if(error) throw error;
    // Notification push sur le téléphone de l'enseignant (même application fermée)
    sb.functions.invoke('notifier-arrivee-parent', { body: { eleveId } }).catch(() => {});
    const d = new Date();
    const heure = `${String(d.getHours()).padStart(2,'0')}h${String(d.getMinutes()).padStart(2,'0')}`;
    ui.filters.portierRecherche = '';
    $('#viewContainer').innerHTML = renderEtatPortier('ok', e, { heure });
    afficherAutorisesPortier(eleveId);
    if(navigator.vibrate) try{ navigator.vibrate(30); }catch(_e){}
    toast('Enseignant prévenu · signalement enregistré');
    majCompteurPortier();
  }catch(err){
    $('#viewContainer').innerHTML = renderEtatPortier('erreur', e, { message: err && err.message ? 'Erreur : ' + err.message : '' });
    if(navigator.vibrate) try{ navigator.vibrate([60,40,60]); }catch(_e){}
  }
}

// Notification de mise à jour : affichée une fois par version, par appareil et par compte.
// Chaque version garde sa liste : un utilisateur qui a manqué une version voit
// aussi ses nouveautés (la plus récente en premier).
const VERSIONS = [
  { version: '2026.11.21-4', nouveautes: {
    commun: [],
    parent: [],
    portier: [],
    personnel: [ 'Reçus : le montant en lettres respecte maintenant la règle française (« deux cent mille », « quatre-vingt mille », « cinq cent mille »). Avant, un « s » fautif s’ajoutait devant « mille ».' ],
  } },
  { version: '2026.11.21-3', nouveautes: {
    commun: [],
    parent: [],
    portier: [],
    personnel: [ 'Sécurité : chaque compte qui se connecte par e-mail et mot de passe choisit, une seule fois, son propre mot de passe (au moins 10 caractères, lettres et chiffres). Les comptes Google ne sont pas concernés.' ],
  } },
  { version: '2026.11.21-2', nouveautes: {
    commun: [ 'L’application démarre maintenant aussi sans réseau : les bibliothèques de connexion et de lecture des QR codes sont gardées dans le téléphone.' ],
    parent: [],
    portier: [],
    personnel: [ 'Pointage et appel : la position est lue pendant quelques secondes pour garder la plus précise. Une position un peu imprécise est acceptée si elle tombe dans l’enceinte de l’école.', 'Alertes de pointage : « Suspect » (hors de l’école, fausse position, QR détourné) est maintenant séparé de « Position incertaine » (souci de GPS, sans soupçon de fraude).' ],
  } },
  { version: '2026.11.21-1', nouveautes: {
    commun: [ 'Fiabilité : les données sont maintenant lues en entier, par paquets (avant, au-delà de 1 000 lignes — notes, appels, paiements — la suite pouvait manquer sans message).', 'Sans réseau : un enregistrement refusé par le serveur au retour du réseau n’est plus jamais effacé. Il reste dans le téléphone, un bandeau rouge le signale, et vous choisissez « Réessayer » ou « Abandonner ».' ],
    parent: [],
    portier: [],
    personnel: [],
  } },
  { version: '2026.11.20-10', nouveautes: {
    commun: [ 'Nouvelles pages : Conditions générales d’utilisation, et politique de confidentialité mise à jour (pointage GPS et photo, paiement PayDunya, cookies). Liens en bas de l’écran de connexion.' ],
    parent: [],
    portier: [],
    personnel: [ 'Paramètres : lien vers les Conditions générales d’utilisation.' ],
  } },
  { version: '2026.11.20-9', nouveautes: {
    commun: [],
    parent: [],
    portier: [],
    personnel: [ 'Pointage depuis l’application : sur son accueil, l’enseignant pointe son arrivée et son départ par GPS, en scannant l’affiche QR de l’école ou par photo prise en direct. Le GPS est déterminant : hors de l’établissement, le pointage est refusé.', 'Appel des élèves : « Présent » et « Retard » ne sont acceptés que depuis l’établissement (position vérifiée par le serveur).', 'Direction : chaque tentative refusée (pointage ou appel hors de l’école, position douteuse, QR non reconnu) arrive en notification et dans Tableau de bord → Alertes pointage, avec la carte et la photo.', 'Paramètres : affiche QR de pointage à imprimer.' ],
  } },
  { version: '2026.11.20-8', nouveautes: {
    commun: [],
    parent: [],
    portier: [],
    personnel: [ 'Les chiffres du jour se déplient d’un toucher : élèves inscrits (par classe, garçons/filles), enseignants ayant pointé (heure d’arrivée, retard, départ), enseignants sans pointage, présence des élèves par classe (présents, retards, absents) et résumé de la présence des enseignants.' ],
  } },
  { version: '2026.11.20-7', nouveautes: {
    commun: [ 'Accueil rangé partout comme « Nos services » : après la salutation, chaque rubrique est une tuile (icône ronde colorée, titre, petite description) sur une seule ligne ; un toucher l’ouvre juste en dessous.' ],
    parent: [ 'Votre accueil : deux lignes de tuiles — vos informations privées (Aujourd’hui, Mes enfants, Devoirs, Absence) et les informations publiques (Menu, Agenda, Nouvelles, Honneur, Photos, Contacter).' ],
    portier: [ 'Les classes s’affichent en tuiles, sur une ligne par cycle.' ],
    personnel: [ 'Les 4 chiffres du jour passent aussi en tuiles sur une ligne ; l’accueil enseignant (Mes cours, Aujourd’hui, Cette semaine, Ce mois-ci, Ce trimestre, Mes outils, Mon inscription) suit le même rangement.' ],
  } },
  { version: '2026.11.20-6', nouveautes: {
    commun: [],
    parent: [],
    portier: [],
    personnel: [ 'Tableau de bord : toutes les rubriques (À faire, Enseignants, 3 semaines, Trésorerie, Mise en route, À surveiller, Anniversaires, Bilan de la semaine, Répartition, Par classe) sont rangées sur une seule ligne d’onglets avec icônes. Un toucher ouvre la rubrique juste en dessous, un second la referme.' ],
  } },
  { version: '2026.11.20-5', nouveautes: {
    commun: [],
    parent: [],
    portier: [],
    personnel: [ 'Le menu de gauche devient une grille de tuiles (mêmes icônes colorées que « Tous nos services ») : chaque service avec sa petite description. Le panneau du milieu est libéré : le bloc « Nos services » n’y est plus.' ],
  } },
  { version: '2026.11.20-4', nouveautes: {
    commun: [],
    parent: [],
    portier: [],
    personnel: [ 'Tableau de bord aéré : chaque rubrique (À faire aujourd’hui, Suivi des enseignants, Dans les 3 prochaines semaines, Trésorerie, Mise en route, Élèves à surveiller, Anniversaires, Répartition des élèves…) est repliée sous son titre, avec un petit indicateur. Un toucher sur le titre la déroule ; l’appli se souvient de celles que vous gardez ouvertes.' ],
  } },
  { version: '2026.11.20-3', nouveautes: {
    commun: [ 'Nouvel accueil : un bandeau bleu nuit avec votre chiffre clé et vos 2 actions principales, une grande barre de recherche, « Nos services » en 4 tuiles et « Voir tout » pour tous les services en grille. Rien n’a disparu : ce sont de nouveaux accès plus rapides.' ],
    parent: [ 'En bas, le bouton central « Services » ouvre tous les services : payer, signaler une absence, messages, devoirs, menu, agenda, objets perdus, suggestions, profil.' ],
    portier: [],
    personnel: [ 'Sur téléphone, le bouton central « Services » de la barre du bas ouvre tous les services en grille.' ],
  } },
  { version: '2026.11.20-2', nouveautes: {
    commun: [ 'Nouvelles couleurs d’EcoMaZ : bleu nuit, blanc et vert menthe — dans toute l’application, en mode clair comme en mode sombre, et sur l’icône du téléphone.' ],
    parent: [],
    portier: [],
    personnel: [],
  } },
  { version: '2026.11.20-1', nouveautes: {
    commun: [],
    parent: [],
    portier: [],
    personnel: [ 'Une même personne, plusieurs fonctions (ex. directeur qui enseigne, secrétaire qui enseigne) : un seul compte, et à la connexion « Se connecter en tant que … ». Chaque fonction a son espace séparé : en Direction ou au Secrétariat, rien de l’espace Enseignant n’apparaît (ni tâches, ni rappels, ni brouillons). Bouton « Changer de fonction » sous le nom de la fonction. La direction attribue les fonctions dans Enseignants → « Une même personne, plusieurs fonctions ».' ],
  } },
  { version: '2026.11.17-2', nouveautes: {
    commun: [ 'Sécurité : noms avec apostrophe (N’Guessan…) corrigés sur les boutons Reçu et Encaisser ; données gardées pour le mode hors ligne effacées à la déconnexion (téléphone partagé) ; verrouillage après 10 minutes d’inactivité même si l’application a été fermée.' ],
    parent: [ 'Demande d’accès : pour retrouver votre enfant par son nom, écrivez son NOM de famille complet puis le début de son prénom (ou utilisez votre numéro de téléphone enregistré à l’école).' ],
    portier: [],
    personnel: [],
  } },
  { version: '2026.11.17-1', nouveautes: {
    commun: [ 'Sécurité renforcée : bibliothèques verrouillées (empreinte vérifiée), politique de sécurité du navigateur, protection contre l’affichage dans un autre site, limitation des demandes répétées et messages d’erreur sans détail technique.' ],
    parent: [],
    portier: [],
    personnel: [],
  } },
  { version: '2026.11.15-9', nouveautes: {
    commun: [],
    parent: [],
    portier: [],
    personnel: [ 'Comptabilité → Cantine : tarif (par mois, trimestre ou année), inscription des élèves classe par classe, paiements avec reçu et remplissage assisté, reste dû calculé depuis l’inscription, encaissé du mois, dépenses de restauration et solde de la cantine.' ],
  } },
  { version: '2026.11.15-8', nouveautes: {
    commun: [],
    parent: [],
    portier: [],
    personnel: [ 'Souches des reçus : filtre par classe et bouton « Imprimer les reçus » — tous les reçus du mois (ou d’une classe) d’un coup, 2 par page A4, rangés par élève, à remettre aux familles.' ],
  } },
  { version: '2026.11.15-7', nouveautes: {
    commun: [],
    parent: [],
    portier: [],
    personnel: [ 'Échéancier : points à vérifier — signale aussi une tranche au montant anormalement faible (faute de frappe probable) et une tranche payée au-delà de son montant (grille modifiée après les versements, ou versement trop élevé), avec les élèves concernés.' ],
  } },
  { version: '2026.11.15-6', nouveautes: {
    commun: [],
    parent: [],
    portier: [],
    personnel: [ 'Tableau de bord, « Mise en route » : trois contrôles de plus, avec leur bouton — horaires de cours des enseignants, élèves en double, échéancier cohérent.' ],
  } },
  { version: '2026.11.15-5', nouveautes: {
    commun: [],
    parent: [],
    portier: [],
    personnel: [ 'Remplissage intelligent : la fenêtre indique combien d’analyses gratuites l’école a utilisées ce mois-ci et combien il en reste (avertissement à 80 %, message clair si le quota est atteint ; le remplissage manuel reste toujours possible).' ],
  } },
  { version: '2026.11.15-4', nouveautes: {
    commun: [],
    parent: [],
    portier: [],
    personnel: [ 'Notes (Camps de base et Compositions) : « Remplissage intelligent » depuis une photo de la fiche de notes, un PDF ou un fichier Excel. Chaque note va sur la ligne de l’élève ; une note hors barème est écartée ; une note déjà saisie n’est jamais écrasée (elle est signalée). Vous relisez avant d’enregistrer.' ],
  } },
  { version: '2026.11.15-3', nouveautes: {
    commun: [],
    parent: [],
    portier: [],
    personnel: [ 'Versements déjà reçus (Comptabilité → Scolarité) : « Remplissage intelligent » depuis une photo du cahier de caisse de la classe, un PDF ou un fichier Excel. Le total versé par chaque élève est réparti sur ses tranches dans l’ordre de l’échéancier ; un montant supérieur à ce qui est dû est signalé et jamais appliqué. Vous relisez avant d’enregistrer.' ],
  } },
  { version: '2026.11.15-2', nouveautes: {
    commun: [],
    parent: [],
    portier: [],
    personnel: [ 'En tête de chaque fiche à remplir (élève, enseignant, personnel, toute la comptabilité, devoirs, programme, cantine, publication, école…), deux grands boutons : « Remplissage intelligent » (photo, fichier, vocal) ou « Remplissage manuel ». Vous choisissez à chaque fois.' ],
  } },
  { version: '2026.11.15-1', nouveautes: {
    commun: [],
    parent: [],
    portier: [],
    personnel: [ 'Remplissage assisté partout : bouton « ✨ Remplir automatiquement » dans tous les modules de la comptabilité (paiement, modification de paiement, cotisation, activité, article, vente, salaire, loyer, tranche, assistant de grille, frais par classe, dépense, FNE) et dans la pédagogie et l’école (devoir, séance, programme, publication, menu de la cantine, personne autorisée, santé, fiche de l’école). Photo, PDF, Word, Excel, image ou message vocal : seules les informations réellement présentes sont proposées, chacune avec son niveau de certitude ; rien n’est enregistré sans votre relecture.', 'Les enseignants disposent aussi du remplissage assisté (devoirs, séances, programmes, publications).' ],
  } },
  { version: '2026.11.14-9', nouveautes: {
    commun: [],
    parent: [],
    portier: [],
    personnel: [ 'Rappel d’appel personnel : au 5e rappel (30 minutes après le début du cours), la direction et la fondation sont prévenues (nom de l’enseignant et classe). L’enseignant en est informé dans son rappel.' ],
  } },
  { version: '2026.11.14-8', nouveautes: {
    commun: [],
    parent: [],
    portier: [],
    personnel: [ 'Comptabilité → Scolarité : « Échéancier : points à vérifier » signale une tranche datée dans le désordre ou hors de l’année scolaire (bouton « Corriger la date », appliqué à toutes les classes concernées) et une grille commune inutilisée (bouton pour la supprimer).' ],
  } },
  { version: '2026.11.14-7', nouveautes: {
    commun: [],
    parent: [],
    portier: [],
    personnel: [ 'Élèves : les fiches en double probable (même nom et prénoms, même classe ou même date de naissance) sont signalées en haut de la liste, avec ce que contient chaque fiche (appels, versements, notes). Un bouton passe la fiche en trop en « Inactif » (réversible), ou vous indiquez que ce sont deux élèves différents.' ],
  } },
  { version: '2026.11.14-6', nouveautes: {
    commun: [ 'Audit complet : sécurité de la base renforcée (aucun droit d’écriture pour un visiteur non connecté), tous les écrans vérifiés sur téléphone et ordinateur, en clair et en sombre.' ],
    parent: [],
    portier: [],
    personnel: [],
  } },
  { version: '2026.11.14-5', nouveautes: {
    commun: [],
    parent: [],
    portier: [],
    personnel: [ 'Enseignants : le jour prévu d’une évaluation validée, l’accueil propose « Saisir les notes » ; un geste crée la grille de notes (Camps de base) d’après le sujet (classe, matière, type, titre, date). Les compositions renvoient vers « Compositions et bulletins ». Plus de rappel de notes « au hasard » : il suit l’évaluation que vous avez vous-même validée.' ],
  } },
  { version: '2026.11.14-4', nouveautes: {
    commun: [],
    parent: [],
    portier: [],
    personnel: [ 'Horaires de cours : pour une classe sans emploi du temps (maternelle), l’horaire proposé reprend les horaires de l’école (Paramètres → Horaires) sur les jours de classe. Chaque enseignant peut maintenant être rempli en un geste.' ],
  } },
  { version: '2026.11.14-3', nouveautes: {
    commun: [],
    parent: [],
    portier: [],
    personnel: [ 'Horaires de cours proposés automatiquement d’après l’emploi du temps de l’école (Je m’enrôle et fiche enseignant) : il suffit de vérifier et d’enregistrer.', 'Enseignants : encadré « Horaires de cours » (qui les a remplis) et bouton « Remplir d’après l’emploi du temps » pour tous les enseignants d’un coup.', 'Secrétariat : notification « Évaluation à imprimer » dès qu’un enseignant valide une évaluation.' ],
  } },
  { version: '2026.11.14-2', nouveautes: {
    commun: [],
    parent: [],
    portier: [],
    personnel: [ 'Enseignants — « Je crée une évaluation » : photographiez votre sujet sur papier (il devient un document modifiable), importez votre fichier (PDF, Word, Excel, image) ou écrivez-le directement ; bouton « Modifier le document », téléchargement Word ou Excel, puis « Valider l’évaluation ».', 'Secrétariat — « Boîte à évaluations » : les évaluations validées par les enseignants y arrivent, prêtes à imprimer (une ou plusieurs à la fois, avec l’effectif de la classe). Lecture seule : aucune modification possible.' ],
  } },
  { version: '2026.11.14-1', nouveautes: {
    commun: [],
    parent: [],
    portier: [],
    personnel: [ 'Horaires de cours : chaque enseignant indique, pour chacune de ses classes, ses jours et ses heures de cours (Je m’enrôle). Le rappel de l’appel ne lui arrive QUE pendant ses cours (10 minutes après le début), jamais en dehors ; sans horaire, aucun rappel. Le secrétariat et la direction peuvent aussi les saisir dans la fiche de l’enseignant.' ],
  } },
  { version: '2026.11.10-15', nouveautes: {
    commun: [],
    parent: [],
    portier: [],
    personnel: [ 'Remplissage intelligent : nouvelle source « Document » (PDF, Word, Excel, image) en plus de la photo, du vocal et du texte ; l’application reconnaît, parmi toutes les informations du document, celles qui conviennent à chaque champ (montant payé, date, tranche, mode de paiement…).', 'Bouton « ✨ Remplir automatiquement » ajouté aux formulaires de paiement de scolarité, de dépense, d’événement de l’agenda et de numéro FNE.' ],
  } },
  { version: '2026.11.10-14', nouveautes: {
    commun: [],
    parent: [ 'Chaque paiement de scolarité a son reçu officiel numéroté : bouton « Reçu » dans la scolarité de votre enfant, à télécharger en PDF ou imprimer (les paiements Mobile Money aussi).' ],
    portier: [],
    personnel: [ 'Souches des reçus : chaque versement (au secrétariat ou en ligne) reçoit automatiquement un numéro de reçu unique (R2026-00001…), impossible à modifier ; liste « Souches des reçus » par mois dans Comptabilité → Scolarité, avec réimpression.' ],
  } },
  { version: '2026.11.10-13', nouveautes: {
    commun: [],
    parent: [ 'Votre accueil est rangé en deux groupes bien séparés : « C’est vous seul qui voyez ces informations » (vos enfants, absences, notes, bulletins, scolarité, messages) et « Informations publiques de l’école » (activités, cantine, agenda, nouvelles, tableau d’honneur, photos).' ],
    portier: [],
    personnel: [],
  } },
  { version: '2026.11.10-12', nouveautes: {
    commun: [],
    parent: [ 'Scolarité : le suivi des paiements et le bouton Mobile Money apparaissent dès que l’école a enregistré les versements déjà reçus (pour qu’aucun parent ne paie deux fois).' ],
    portier: [],
    personnel: [],
  } },
  { version: '2026.11.10-11', nouveautes: {
    commun: [],
    parent: [ 'Payer la scolarité par Mobile Money depuis l’application : bouton « Payer … par Mobile Money » sur chaque tranche à régler (Orange Money, MTN, Moov, Wave, via la page sécurisée PayDunya ; l’argent va directement à l’école). Le reçu arrive tout seul (notification et Messages).' ],
    portier: [],
    personnel: [ 'Paiement Mobile Money : à chaque paiement reçu, le secrétariat et la direction sont prévenus ; le paiement est déjà enregistré en comptabilité.' ],
  } },
  { version: '2026.11.10-10', nouveautes: {
    commun: [],
    parent: [],
    portier: [],
    personnel: [ 'Mise en route (direction, fondation) : nouvelle étape « Alertes sur les téléphones du personnel » — indique qui (fondation, secrétariat, portier…) n’a pas encore activé les alertes, avec la marche à suivre.' ],
  } },
  { version: '2026.11.10-9', nouveautes: {
    commun: [],
    parent: [],
    portier: [],
    personnel: [ 'Notes et bulletins (direction) : bouton « État des bulletins » à consulter à tout moment — moyennes, compositions et appréciations classe par classe, avec accès direct au suivi des enseignants pour relancer.' ],
  } },
  { version: '2026.11.10-8', nouveautes: {
    commun: [],
    parent: [],
    portier: [],
    personnel: [ 'Publication des bulletins : avant de publier un trimestre, un tableau montre classe par classe les moyennes calculées, les notes de composition saisies et les appréciations écrites ; en cas de manques, « Compléter d’abord » ou « Publier quand même ».' ],
  } },
  { version: '2026.11.10-7', nouveautes: {
    commun: [],
    parent: [],
    portier: [],
    personnel: [ 'Versements déjà reçus : nouveaux boutons « Toute la classe a payé : 1er versement » (une tranche pour toute la classe en un toucher) ; il ne reste qu’à corriger les exceptions avant d’enregistrer.' ],
  } },
  { version: '2026.11.10-6', nouveautes: {
    commun: [],
    parent: [ 'Votre accueil est séparé en deux : « Mon espace privé » (visible seulement par vous et l’école : absences, devoirs, notes, bulletins, scolarité, messages) et « Le fil de l’école » (informations communes à tous les parents).', 'Scolarité : dès le 25 du mois, un rappel (notification avec son et vibration) vous indique la tranche du mois suivant à régler ; un encadré « Scolarité à régler » apparaît sur votre accueil.' ],
    portier: [],
    personnel: [],
  } },
  { version: '2026.11.10-5', nouveautes: {
    commun: [],
    parent: [],
    portier: [],
    personnel: [ 'Téléphone : le bouton « Aa » (taille du texte) est sur la même ligne que la recherche et les notifications ; la barre du haut reprend sa hauteur normale.' ],
  } },
  { version: '2026.11.10-4', nouveautes: {
    commun: [],
    parent: [],
    portier: [],
    personnel: [ 'Enseignant : uniquement sa ou ses classes partout. Avec une seule classe (ex. CP1), plus aucune liste à choisir : la page affiche « CP1 » ; avec plusieurs classes, la liste ne propose que les siennes. L’accueil indique « Ma classe » / « Mes classes ». L’agenda ne montre que les événements de toute l’école et de ses classes ; la liste des collègues n’affiche plus leurs classes.' ],
  } },
  { version: '2026.11.10-3', nouveautes: {
    commun: [],
    parent: [],
    portier: [],
    personnel: [ 'Appel non fait : l’alarme est beaucoup plus insistante — 3 secondes de sonnerie à deux tons, toutes les 15 secondes puis toutes les 8 secondes, longue vibration, écran maintenu allumé. Elle ne s’arrête qu’avec l’appel validé.', 'Sur le téléphone : un rappel toutes les 5 minutes pendant la demi-heure qui suit l’heure du rappel, tant que l’appel n’est pas fait.' ],
  } },
  { version: '2026.11.10-2', nouveautes: {
    commun: [],
    parent: [],
    portier: [],
    personnel: [ 'Nouvelle étape sur l’accueil enseignant : « Autoriser la sonnerie de l’appel » (tester les 3 bips, laisser passer EcoMaZ en mode « Ne pas déranger »). Le bip de l’écran « Appel non fait » passe par le son des médias : il sonne même téléphone en silencieux, tant que le volume des médias n’est pas à zéro.' ],
  } },
  { version: '2026.11.10-1', nouveautes: {
    commun: [],
    parent: [],
    portier: [],
    personnel: [ 'Appel obligatoire : à partir de l’heure du rappel, tant que l’appel de ses classes n’est pas validé, l’enseignant voit un écran « L’appel n’est pas encore fait » avec un bip chaque minute ; seul le bouton « Faire l’appel maintenant » le fait disparaître.', 'Rappel sur le téléphone : la notification reste affichée jusqu’à ce qu’on la touche (longue vibration, son), puis revient 10 et 20 minutes plus tard si l’appel n’est toujours pas fait ; au 3e rappel, la direction est informée des classes sans appel.' ],
  } },
  { version: '2026.11.9-22', nouveautes: {
    commun: [],
    parent: [],
    portier: [],
    personnel: [ 'Enseignants : nouveau « Mode d’emploi (1 page) » à imprimer et remettre à chaque enseignant (gestes du jour, de la semaine, du mois et du trimestre, astuces, QR code de l’application).' ],
  } },
  { version: '2026.11.9-21', nouveautes: {
    commun: [],
    parent: [],
    portier: [],
    personnel: [ 'Rapport du mois (direction) : nouveau tableau « Régularité de l’appel par classe » (jours avec appel / jours de classe du mois), en vert si complet, en rouge sous la moitié.' ],
  } },
  { version: '2026.11.9-20', nouveautes: {
    commun: [],
    parent: [ 'Bulletin de votre enfant : la ligne « Assiduité du trimestre » (absences justifiées ou non, retards) apparaît aussi dans l’application et dans le bulletin à imprimer.' ],
    portier: [],
    personnel: [],
  } },
  { version: '2026.11.9-19', nouveautes: {
    commun: [],
    parent: [],
    portier: [ 'Les classes s’affichent sur deux colonnes : moins de défilement pour trouver un élève quand un parent attend.' ],
    personnel: [],
  } },
  { version: '2026.11.9-18', nouveautes: {
    commun: [],
    parent: [],
    portier: [],
    personnel: [ 'Bulletin officiel : nouvelle ligne « Assiduité du trimestre » (absences justifiées / non justifiées, retards, d’après l’appel).', 'Le motif donné par un parent (« Absence à justifier ») est reporté automatiquement sur l’absence enregistrée à l’appel ; l’auteur de l’appel reste l’enseignant.' ],
  } },
  { version: '2026.11.9-17', nouveautes: {
    commun: [],
    parent: [ 'Votre enfant a été noté absent ? Une carte « Absence à justifier » apparaît sur l’accueil : touchez le motif (maladie, rendez-vous…), l’école et l’enseignant sont prévenus. Vous pouvez aussi signaler une erreur d’appel.' ],
    portier: [],
    personnel: [],
  } },
  { version: '2026.11.9-16', nouveautes: {
    commun: [],
    parent: [],
    portier: [],
    personnel: [ 'Cahier de textes sans réseau : le devoir est gardé dans le téléphone et publié tout seul au retour de la connexion (avant : message d’erreur, devoir à retaper).' ],
  } },
  { version: '2026.11.9-15', nouveautes: {
    commun: [],
    parent: [],
    portier: [],
    personnel: [ 'Appel sans réseau : les absences ne sont plus perdues. L’appel et les notifications aux parents des absents sont gardés dans le téléphone et partent tout seuls au retour du réseau (sauf si l’élève a été remis présent entre-temps). Le message affiché le dit clairement.' ],
  } },
  { version: '2026.11.9-14', nouveautes: {
    commun: [ 'Lisibilité : textes trop pâles corrigés (bouton « Déconnexion » des parents, phrase « personne d’autre que vous » sur la carte de l’enfant, liens discrets et numéros d’étapes en mode sombre).' ],
    parent: [],
    portier: [],
    personnel: [],
  } },
  { version: '2026.11.9-13', nouveautes: {
    commun: [ 'Nouveau bouton « Aa » en haut de l’écran : taille du texte Normale, Grande ou Très grande, mémorisée sur ce téléphone (plus confortable pour lire).' ],
    parent: [],
    portier: [],
    personnel: [],
  } },
  { version: '2026.11.9-12', nouveautes: {
    commun: [],
    parent: [],
    portier: [],
    personnel: [ 'Mise en route : l’étape « Appel » compte maintenant classe par classe (une seule classe ne suffit plus à la mettre au vert) et nomme les classes sans appel ; nouvelle étape « Rappel de l’appel sur le téléphone des enseignants ».' ],
  } },
  { version: '2026.11.9-11', nouveautes: {
    commun: [],
    parent: [],
    portier: [],
    personnel: [ 'Inviter les familles : nouveaux coupons papier à glisser dans le cahier de liaison (8 par feuille A4, un par famille, frères et sœurs regroupés). Chaque coupon porte le QR code personnel de la famille : le parent scanne, se connecte avec Google et entre directement, déjà relié à son enfant — rien à valider.' ],
  } },
  { version: '2026.11.9-10', nouveautes: {
    commun: [],
    parent: [],
    portier: [],
    personnel: [ 'Suivi des enseignants : on voit maintenant qui ne s’est jamais connecté à son application et qui n’a pas activé les alertes du téléphone (rappel de l’appel). Le message WhatsApp de relance le mentionne, avec le lien de l’application.' ],
  } },
  { version: '2026.11.9-9', nouveautes: {
    commun: [],
    parent: [],
    portier: [],
    personnel: [ 'Accueil enseignant : première tâche du jour « Recevoir le rappel de l’appel sur ce téléphone » tant que les alertes ne sont pas activées (aide pas à pas pour iPhone ou si les alertes sont bloquées). Le rappel de l’appel ouvre maintenant directement l’application des enseignants.' ],
  } },
  { version: '2026.11.9-8', nouveautes: {
    commun: [ 'Moins de données mobiles : l’application ne vérifie plus les nouveautés quand elle est en arrière-plan (téléphone en poche), et ne télécharge plus l’historique complet des annonces et des arrivées au portail (seulement ce qui s’affiche : aujourd’hui, 7 derniers jours).' ],
    parent: [],
    portier: [],
    personnel: [],
  } },
  { version: '2026.11.9-7', nouveautes: {
    commun: [],
    parent: [],
    portier: [],
    personnel: [ 'Mon programme (enseignant) : seulement ses propres lignes ; « Mettre à jour l’avancement » d’un toucher (0 à 100 %), même sans changement pour confirmer ; lignes à mettre à jour signalées. Chapitres facultatifs, trimestre en cours proposé, matières du spécialiste.', 'Correction : un nouveau programme créé par un enseignant était rangé au nom du premier enseignant de la liste ; il est désormais toujours au nom de l’enseignant connecté (la direction choisit l’enseignant explicitement).' ],
  } },
  { version: '2026.11.9-6', nouveautes: {
    commun: [],
    parent: [],
    portier: [],
    personnel: [ 'Compositions et bulletins : classe, matière et trimestre d’un toucher, une ligne courte par élève (moyenne de Camps de base à côté), compteur de saisie. Un enseignant spécialiste ne voit que ses matières.', 'Nouveau : « Appréciations du bulletin » pour toute la classe sur la même page, avec la moyenne et le rang de chaque élève et des phrases toutes prêtes (la phrase adaptée à la moyenne est marquée ★). Avant, elles ne s’écrivaient que depuis la fiche de l’élève, inaccessible aux enseignants.', 'Correction : l’enregistrement des notes de composition n’envoie plus que les notes modifiées (plus rapide ; plus d’échec après publication ; l’auteur d’une note reste celui qui l’a vraiment saisie).' ],
  } },
  { version: '2026.11.9-5', nouveautes: {
    commun: [],
    parent: [],
    portier: [],
    personnel: [ 'Camps de base plus simple : classe, matière et trimestre se choisissent d’un toucher ; « + Ajouter des notes » demande le type et le barème d’un toucher, puis on tape les notes avec un compteur (« 12 notes sur 25 élèves ») et « Entrée » pour passer à l’élève suivant.', 'Correction : le trimestre en cours suit maintenant l’agenda de l’école (fin du 1er trimestre le 4 décembre…) dans Camps de base et Compositions et bulletins, comme sur l’accueil. Avant, il était déduit du mois et « Notes et bulletins » s’ouvrait toujours sur le 1er trimestre.' ],
  } },
  { version: '2026.11.9-4', nouveautes: {
    commun: [],
    parent: [],
    portier: [],
    personnel: [ 'Cahier de textes plus simple : la matière et le jour se choisissent d’un toucher (seulement les vrais jours de classe : pas le mercredi, ni les congés), et des phrases toutes prêtes (« Apprendre la leçon », « Faire les exercices »…) s’ajoutent au travail à faire.', 'Correction : « Voir aussi les passés » montre bien les devoirs des 2 dernières semaines, même après être passé par l’accueil.' ],
  } },
  { version: '2026.11.9-3', nouveautes: {
    commun: [],
    parent: [],
    portier: [],
    personnel: [ 'Appel plus simple : consigne en 2 étapes, classes en boutons (✓ quand l’appel est fait), « Jour de l’appel » et « Revenir à aujourd’hui ». Après validation : « Appel suivant » ou « Retour à mes tâches ».', 'Appel enregistré en une seule fois pour toute la classe : beaucoup plus rapide avec un réseau faible, et un double appui sur « Valider » ne crée plus rien en double.', 'Historique de l’appel : seulement la classe choisie, replié (secrétariat, direction, fondation) ; l’enseignant passe par le Cahier d’appel.' ],
  } },
  { version: '2026.11.9-2', nouveautes: {
    commun: [],
    parent: [],
    portier: [],
    personnel: [ 'Nouveau sur le tableau de bord (secrétariat, direction, fondation) : « Suivi des enseignants ». Pour chacun : appel du jour, appels oubliés de la semaine, cahier de textes du prochain jour de classe, évaluations du trimestre, avancement du programme, compte activé ou non. Les enseignants à relancer apparaissent en premier, avec un message WhatsApp prêt à envoyer (gratuit) et l’accès à leur rapport d’activité.' ],
  } },
  { version: '2026.11.9-1', nouveautes: {
    commun: [],
    parent: [],
    portier: [],
    personnel: [ 'Console enseignant simplifiée : l’accueil « Mes tâches » montre, dans l’ordre, ce qu’il faut faire aujourd’hui (appel, cahier de textes), puis cette semaine (appels à rattraper, notes à saisir), ce mois-ci (régularité, programme) et ce trimestre (compositions, appréciations du bulletin). Chaque tâche a un bouton qui ouvre directement la bonne page.', 'Menu enseignant rangé de la même façon : Chaque jour, Chaque semaine, Chaque mois et trimestre, L’école.', 'Correction : le « Rapport d’activité » s’ouvre maintenant bien depuis la console enseignant.' ],
  } },
  { version: '2026.11.8-5', nouveautes: {
    commun: [],
    parent: [],
    portier: [],
    personnel: [ 'Nouveau : « Rapport d’activité » (menu Pédagogie). L’enseignant voit le sien ; le secrétariat, la direction et la fondation choisissent l’enseignant (aussi depuis la liste des enseignants, bouton 📈). Par période : régularité de l’appel et appels non faits, pointage et retards, devoirs, évaluations, notes et appréciations, programmes, messages aux parents, publications, chronologie, points forts / à surveiller, impression.', 'L’auteur de chaque appel, note et appréciation est désormais enregistré automatiquement.' ],
  } },
  { version: '2026.11.8-4', nouveautes: {
    commun: [],
    parent: [],
    portier: [],
    personnel: [ 'Comptabilité → FNE : suivi de la Facture Normalisée Électronique en mode assisté — « Copier les infos » pour la plateforme FNE de la DGI, « Noter le n° FNE », reçus avec le numéro FNE et le QR de vérification, encaissements certifiés / à certifier par mois, export CSV pour le comptable.' ],
  } },
  { version: '2026.11.8-3', nouveautes: {
    commun: [],
    parent: [],
    portier: [],
    personnel: [ 'Tableau de bord (fondation, direction) : nouveau module Trésorerie — entrées, sorties et solde du mois (par source), recouvrement de la scolarité (retards, pas encore échu, prochaine échéance), modes de paiement, six derniers mois, derniers mouvements avec leur auteur, et alertes (sorties > entrées, paiements modifiés ou supprimés, part d’espèces, aucun encaissement récent).' ],
  } },
  { version: '2026.11.8-2', nouveautes: {
    commun: [ 'Applications installées : le nom de l’école apparaît de nouveau sous l’icône (EcoMaZ-ENSEIGNANTS SUCCESS KIDS…).' ],
    parent: [],
    portier: [],
    personnel: [ 'Tableau d’affichage : lisible aussi sur téléphone (une colonne).' ],
  } },
  { version: '2026.11.8-1', nouveautes: {
    commun: [],
    parent: [],
    portier: [],
    personnel: [ 'Paramètres → Scolarité : alerte quand les dates des tranches sont incohérentes (ex. frais d’inscription dus après tous les versements), car une date mal saisie fausse les relances et les retards.' ],
  } },
  { version: '2026.10.19-8', nouveautes: {
    commun: [],
    parent: [ 'Invitation personnelle : avec le lien reçu de l’école, connectez-vous avec Google, choisissez Papa ou Maman et entrez directement dans votre espace, déjà relié à vos enfants.' ],
    portier: [],
    personnel: [ 'Inviter les familles : chaque message WhatsApp contient maintenant un lien personnel (30 jours, usage unique). Le parent entre directement, relié à ses enfants — plus de demande à valider.' ],
  } },
  { version: '2026.10.19-7', nouveautes: {
    commun: [],
    parent: [ 'Aujourd’hui : les matières de la journée de votre enfant et celles du prochain jour de classe, avec un rappel « Il y a EPS : pensez à la tenue de sport ».', 'Emploi du temps de la semaine de votre enfant (bouton « Voir son emploi du temps »).' ],
    portier: [],
    personnel: [],
  } },
  { version: '2026.10.19-6', nouveautes: {
    commun: [],
    parent: [],
    portier: [],
    personnel: [ 'Primaire : matière Informatique ajoutée (Anglais ou Informatique au choix). Sur le bulletin, la matière au choix qu’un élève ne suit pas n’apparaît pas et ne compte pas dans sa moyenne.' ],
  } },
  { version: '2026.10.19-5', nouveautes: {
    commun: [],
    parent: [],
    portier: [],
    personnel: [ 'Primaire : matières aux intitulés du programme officiel — Français, Mathématiques, Sciences et Technologie, Histoire-Géographie, EDHC, AEC, EPS, Anglais (notes, devoirs, programmes et bulletins).' ],
  } },
  { version: '2026.10.19-4', nouveautes: {
    commun: [],
    parent: [],
    portier: [],
    personnel: [ 'Notes & Bulletins : plusieurs compositions par trimestre. Les compositions de l’agenda de l’école apparaissent en boutons (ex. « 2e compo. · 10/12 ») ; chaque note est rangée sous SA composition, et la moyenne de composition du trimestre se calcule seule.' ],
  } },
  { version: '2026.10.19-3', nouveautes: {
    commun: [],
    parent: [],
    portier: [],
    personnel: [ 'Comptabilité sur téléphone : les onglets tiennent sur une seule ligne que l’on fait glisser, l’onglet ouvert reste visible — le contenu apparaît tout de suite.' ],
  } },
  { version: '2026.10.19-2', nouveautes: {
    commun: [],
    parent: [ 'Présence de la semaine : seulement les jours de classe de l’école.', 'Boutons « Signaler une absence » et « Demander un document » toujours lisibles en entier, même sur petit téléphone.', 'À venir : la date reste en haut de chaque carte.' ],
    portier: [],
    personnel: [],
  } },
  { version: '2026.10.19-1', nouveautes: {
    commun: [],
    parent: [],
    portier: [],
    personnel: [ 'Enseignants : bouton « Activer son accès » sur chaque fiche sans compte — indiquez l’adresse Gmail de l’enseignant ; il entre ensuite directement avec « Continuer avec Google », relié à sa fiche et à ses classes. Message WhatsApp prêt pour le prévenir.' ],
  } },
  { version: '2026.10.18-42', nouveautes: {
    commun: [],
    parent: [],
    portier: [],
    personnel: [ 'Tableau de bord : encart « Dans les 3 prochaines semaines » (congés, compositions, sorties, fêtes, d’après l’agenda de l’école).', 'Agenda : toutes les dates de l’année s’affichent toujours, même après un passage par le tableau de bord.' ],
  } },
  { version: '2026.10.18-41', nouveautes: {
    commun: [],
    parent: [],
    portier: [],
    personnel: [ 'Emploi du temps : la grille, l’impression et le remplissage rapide ne montrent que les jours de classe de l’école (plus de colonne Mercredi).' ],
  } },
  { version: '2026.10.18-40', nouveautes: {
    commun: [],
    parent: [],
    portier: [],
    personnel: [ 'Emploi du temps : les emplois du temps officiels 2026-2027 du CP1 au CM2 sont en place, aux horaires réels de l’école (séances de 10 à 40 minutes, récréation et pause de midi, couleurs par domaine). CP1 : semaines 1 à 8 puis à partir du 16/11/2026.', 'Emploi du temps : chaque séance se modifie ou s’ajoute (heures, activité, enseignant) ; impression A4 par classe ; « Ma journée » des enseignants suit les vraies séances.' ],
  } },
  { version: '2026.10.18-39', nouveautes: {
    commun: [],
    parent: [],
    portier: [],
    personnel: [ 'Comptabilité → Scolarité : « Relancer les retards » — un message WhatsApp courtois par famille (tranches échues non soldées, montant, échéance), frères et sœurs regroupés, suivi « Relancé le … ». Bloqué tant qu’aucun versement n’est saisi.' ],
  } },
  { version: '2026.10.18-38', nouveautes: {
    commun: [ 'Connexion : si vous utilisez un email et un mot de passe, votre téléphone s’en souvient et affiche directement ce formulaire.' ],
    parent: [],
    portier: [],
    personnel: [],
  } },
  { version: '2026.10.18-37', nouveautes: {
    commun: [],
    parent: [ 'Bienvenue : à la première ouverture, un petit guide montre l’essentiel — recevoir les alertes, signaler une absence, écrire à l’école.' ],
    portier: [],
    personnel: [],
  } },
  { version: '2026.10.18-36', nouveautes: {
    commun: [],
    parent: [],
    portier: [],
    personnel: [ 'Élèves → Fiches à vérifier : signale aussi un âge inhabituel pour la classe (date de naissance probablement mal saisie) et les doublons possibles (même nom et prénom). Rien n’est modifié automatiquement : vous vérifiez et corrigez.' ],
  } },
  { version: '2026.10.18-35', nouveautes: {
    commun: [],
    parent: [],
    portier: [],
    personnel: [ 'Textes revus : salutation et signature des messages, publications et commentaires sans intitulé technique de compte (nom choisi par la personne, sinon « Le secrétariat — nom de l’école »…), message du lien de paiement en ligne plus clair.' ],
  } },
  { version: '2026.10.18-33', nouveautes: {
    commun: [],
    parent: [],
    portier: [],
    personnel: [ 'Parents ↔ Élèves : « Inviter les familles » — un message WhatsApp personnel par numéro (prénoms des enfants, frères et sœurs regroupés, lien, numéro à utiliser pour être reconnu tout seul), suivi « Envoyé le … », filtre par classe.' ],
  } },
  { version: '2026.10.18-32', nouveautes: {
    commun: [],
    parent: [],
    portier: [],
    personnel: [ 'Tableau de bord — « Mise en route de l’école » : boutons qui ouvrent directement « Remplir rapidement », « Versements déjà reçus » et « Relancer les non-inscrits » ; emploi du temps compté classe par classe ; aussi visible par le secrétariat (ses étapes).' ],
  } },
  { version: '2026.10.18-31', nouveautes: {
    commun: [],
    parent: [],
    portier: [],
    personnel: [ 'Comptabilité → Scolarité : « Saisir les versements déjà reçus » — toute une classe sur un seul écran, bouton « Payée » par tranche ou montant libre, total en direct, enregistrement en une fois (contrôle : jamais plus que le reste dû).' ],
  } },
  { version: '2026.10.18-30', nouveautes: {
    commun: [],
    parent: [],
    portier: [],
    personnel: [ 'Emploi du temps : bouton « Remplir rapidement » — proposition automatique de la semaine, copie du lundi sur tous les jours ou copie d’une autre classe (seules les cases vides sont remplies), puis vous ajustez.', 'Emploi du temps : compteur de créneaux remplis, titulaire proposé en premier, cours possible sans enseignant attribué ; les enseignants consultent sans boutons de modification.' ],
  } },
  { version: '2026.10.18-29', nouveautes: {
    commun: [],
    parent: [],
    portier: [],
    personnel: [ 'Enseignants : bouton « Relancer les non-inscrits » — un message WhatsApp personnel et prêt à envoyer pour chaque enseignant qui n’a pas encore son compte.', 'Enseignants : « Imprimer la liste » — liste A4 du personnel enseignant (classes, matières, téléphone, inscrit ou non).' ],
  } },
  { version: '2026.10.18-28', nouveautes: {
    commun: [],
    parent: [ 'Après votre inscription : laissez la page ouverte, elle s’ouvre toute seule dès que l’école a validé.' ],
    portier: [],
    personnel: [ 'Console Enseignant : guide « vos 3 premiers gestes » (appel, devoirs, notes) à la première ouverture ; après l’inscription, la page s’ouvre toute seule dès la validation.' ],
  } },
  { version: '2026.10.18-27', nouveautes: {
    commun: [],
    parent: [ 'Inscription : choisissez Papa ou Maman, l’application vous salue ensuite comme il faut.' ],
    portier: [],
    personnel: [ 'Inscription des enseignants : Monsieur / Madame, NOM et prénoms demandés séparément — la fiche créée à la validation est exacte (plus de nom découpé au hasard).' ],
  } },
  { version: '2026.10.18-26', nouveautes: {
    commun: [],
    parent: [],
    portier: [],
    personnel: [ 'Console Enseignant : module « Je m’enrôle » — l’enseignant s’inscrit lui-même (civilité, nom, WhatsApp, matières, classes) ; ses classes s’ouvrent quand la direction ou le secrétariat les valide dans Enseignants.', 'Console Enseignant : liste des enseignants de l’école (noms, classes, matières, sans données privées) et salutation au nom de SA fiche.' ],
  } },
  { version: '2026.10.18-25', nouveautes: {
    commun: [],
    parent: [],
    portier: [],
    personnel: [ 'Parents ↔ Élèves : nouvelle rubrique « Inscriptions des parents » en haut — la fondation, la direction et le secrétariat valident les parents inscrits avec Google (les demandes « sûres » en un seul geste), et la liste se met à jour aussitôt.' ],
  } },
  { version: '2026.10.18-24', nouveautes: {
    commun: [],
    parent: [ 'Inscription plus simple : dès l’ouverture du lien, un grand bouton « Continuer avec Google » et les 3 étapes expliquées.' ],
    portier: [],
    personnel: [ 'Applications Enseignants et Parents : l’écran d’ouverture propose d’abord l’inscription avec Google (plus de mot de passe demandé), et prévient si le lien a été ouvert dans WhatsApp ou Facebook.', 'Écran Enseignants : nouvelle rubrique « Inscriptions des enseignants » en haut — la fondation, la direction et le secrétariat voient les enseignants inscrits et les valident en un geste (le secrétariat reçoit aussi la notification).' ],
  } },
  { version: '2026.10.18-23', nouveautes: {
    commun: [],
    parent: [],
    portier: [],
    personnel: [ 'Emploi du temps : bouton « Imprimer » — une page A4 par classe (horaires, matières, enseignants, récréations), à afficher en classe ou à donner aux parents.' ],
  } },
  { version: '2026.10.18-22', nouveautes: {
    commun: [],
    parent: [],
    portier: [ 'En haut de l’écran : le nombre de parents signalés aujourd’hui.' ],
    personnel: [ 'Bulletins : après publication d’un trimestre, l’appréciation du titulaire est verrouillée comme les notes (seules la direction et la fondation peuvent la corriger).' ],
  } },
  { version: '2026.10.18-21', nouveautes: {
    commun: [],
    parent: [],
    portier: [],
    personnel: [ 'Notes : une fois les bulletins d’un trimestre publiés, ses notes sont verrouillées (seules la direction et la fondation peuvent corriger). Chaque modification de note est gardée dans un historique (Notes & Bulletins → Historique des modifications de notes).' ],
  } },
  { version: '2026.10.18-20', nouveautes: {
    commun: [],
    parent: [],
    portier: [],
    personnel: [ 'Paiements : le secrétariat encaisse et imprime les reçus ; seules la direction et la fondation peuvent modifier ou supprimer un paiement déjà enregistré. Chaque opération sur l’argent est notée automatiquement dans le journal d’audit.' ],
  } },
  { version: '2026.10.18-19', nouveautes: {
    commun: [ 'L’application vous demande : « Comment voudriez-vous que je vous appelle ? » — choisissez votre titre et votre nom, un aperçu s’affiche. Vous pouvez le changer à tout moment sur votre page d’accueil.' ],
    parent: [],
    portier: [],
    personnel: [],
  } },
  { version: '2026.10.18-18', nouveautes: {
    commun: [],
    parent: [],
    portier: [],
    personnel: [ 'Fiche élève plus courte et plus claire : onglets Infos / Bulletin / Présences, bulletin en tableau compact, présences en une ligne par jour.' ],
  } },
  { version: '2026.10.18-17', nouveautes: {
    commun: [],
    parent: [],
    portier: [],
    personnel: [ 'Demandes d’accès : après chaque validation, un bouton « Prévenir sur WhatsApp » envoie à la personne un message prêt (« Votre accès est validé… ») pour qu’elle ne reste pas à attendre.' ],
  } },
  { version: '2026.10.18-16', nouveautes: {
    commun: [ 'Chaque espace porte son nom (« Tableau de bord Direction », « Tableau de bord Parent »…) et vous salue selon votre titre (ex. « Bonjour, Monsieur le Directeur… », « Bonjour, Maman… »). Une seule fois, l’application vous demande « Monsieur » ou « Madame ».' ],
    parent: [],
    portier: [],
    personnel: [ 'Enseignants : chaque enseignant a son propre compte et ne voit que ses classes — et seulement ses matières si des matières sont cochées sur sa fiche.',
      'Scolarité et tranches de versement : modifiables uniquement par la direction et la fondation. Les salaires restent visibles uniquement par la direction et la fondation.' ],
  } },
  { version: '2026.10.18-15', nouveautes: {
    commun: [],
    parent: [],
    portier: [],
    personnel: [ 'Correction : sur les bulletins imprimés, la colonne « Appréciation » n’est plus coupée au bord de la page ; les coupons d’invitation ne sont plus coupés entre deux pages.' ],
  } },
  { version: '2026.10.18-14', nouveautes: {
    commun: [],
    parent: [],
    portier: [],
    personnel: [ 'Élèves & Inscriptions : « Cartes scolaires » pour chaque classe — 8 cartes par page A4 (format carte bancaire), à découper.',
      'Correction : les documents imprimés (bulletins, reçus, listes, rapports…) ne commencent plus par une page blanche.' ],
  } },
  { version: '2026.10.18-13', nouveautes: {
    commun: [],
    parent: [],
    portier: [],
    personnel: [ 'Élèves & Inscriptions : « Imprimer la liste » pour chaque classe — liste simple (avec garçons / filles), liste avec les contacts des parents (secrétariat, direction) ou feuille d’émargement.' ],
  } },
  { version: '2026.10.18-12', nouveautes: {
    commun: [],
    parent: [],
    portier: [],
    personnel: [ 'Sécurité : à l’inscription d’un parent, ses enfants sont proposés d’après son numéro (s’il correspond à la fiche) ; la recherche par nom est limitée pour protéger la liste des élèves.' ],
  } },
  { version: '2026.10.18-11', nouveautes: {
    commun: [],
    parent: [],
    portier: [],
    personnel: [ 'Tableau de bord (direction) : bouton « Rapport du mois » — élèves, encaissements et dépenses, reste à encaisser, présence des élèves, ponctualité des enseignants ; à imprimer ou enregistrer en PDF, mois par mois.' ],
  } },
  { version: '2026.10.18-10', nouveautes: {
    commun: [],
    parent: [],
    portier: [],
    personnel: [ 'Paramètres → « Sauvegarde de vos données » (direction) : un fichier Excel avec toutes les données de l’école, une feuille par sujet, à garder sur votre ordinateur.' ],
  } },
  { version: '2026.10.18-9', nouveautes: {
    commun: [],
    parent: [],
    portier: [],
    personnel: [ 'Demandes d’accès : « Traiter » (À faire aujourd’hui) mène directement aux demandes ; les demandes de parents dont le téléphone correspond à la fiche de l’enfant sont marquées « Sûre » et peuvent être approuvées d’un coup.' ],
  } },
  { version: '2026.10.18-8', nouveautes: {
    commun: [ 'Ouverture de l’application : un écran « Ouverture de votre espace… » remplace la page vide ; si la connexion internet manque, un message clair et un bouton « Réessayer » s’affichent — vous n’êtes plus renvoyé à l’écran de connexion.' ],
    parent: [],
    portier: [],
    personnel: [],
  } },
  { version: '2026.10.18-7', nouveautes: {
    commun: [],
    parent: [],
    portier: [],
    personnel: [ 'Parents ↔ Élèves : « Préparer le message » pour le groupe WhatsApp des parents d’une classe (lien + 3 étapes, à relire puis partager).',
      'Enseignants : carte « Invitez vos enseignants » avec QR code, partage WhatsApp et affiche — chaque enseignant s’inscrit lui-même, vous validez.' ],
  } },
  { version: '2026.10.18-6', nouveautes: {
    commun: [ 'Nouvel écran de connexion : accueil « Bienvenue », choix du profil plus clair sur téléphone, logo ou initiales de l’école, champs plus grands.' ],
    parent: [],
    portier: [],
    personnel: [],
  } },
  { version: '2026.10.18-5', nouveautes: {
    commun: [],
    parent: [ 'Nouvelle carte « Aujourd’hui » en haut de l’accueil : présence du jour, prochain événement, devoirs. Plusieurs enfants ? Touchez son prénom pour changer.' ],
    portier: [ 'L’écran de confirmation affiche les initiales, le nom et la classe de l’élève.' ],
    personnel: [ 'Enseignants : « Ma journée » montre vos cours du jour en frise, le cours en cours est mis en évidence.' ],
  } },
  { version: '2026.10.18-4', nouveautes: {
    commun: [],
    parent: [],
    portier: [],
    personnel: [ 'Sur téléphone, toutes les listes (élèves, enseignants, devoirs, agenda, notes…) sont plus lisibles : plus aucun texte qui se chevauche.',
      'Les boutons ont un nom (« Voir le profil », « Modifier »…) ; « Supprimer » est rangé dans le menu « ⋯ ».',
      'Les fenêtres s’ouvrent depuis le bas de l’écran sur téléphone. Appel des élèves : 3 boutons Présent / Absent / Retard.' ],
  } },
  { version: '2026.10.18-3', nouveautes: {
    commun: [],
    parent: [],
    portier: [],
    personnel: [ 'Tableau d’affichage : élèves et enseignants à l’honneur en cartes de célébration, aperçu de la bannière qui défile.',
      'Vie de l’école : formulaire de publication en 4 étapes, ajout de photos plus simple, choix « Toute l’école / Certaines classes ».',
      'Programmes : filtres compacts (classe, enseignant, T1/T2/T3) et une carte par programme avec sa progression.' ],
  } },
  { version: '2026.10.18-2', nouveautes: {
    commun: [],
    parent: [],
    portier: [],
    personnel: [ 'Pointage des enseignants : onglets Aujourd’hui / Journal / Alertes, une carte claire par enseignant (arrivée, départ, badge QR ou GPS) avec 3 boutons Présent / Absent / Retard ; explication du pointage GPS.' ],
  } },
  { version: '2026.10.18-1', nouveautes: {
    commun: [],
    parent: [],
    portier: [],
    personnel: [ 'Emploi du temps : sur téléphone, un jour à la fois (onglets Lun → Ven), une couleur par matière, « + Ajouter un cours » sur les créneaux vides.',
      'Cahier d’appel : nouvel onglet « Aujourd’hui » — 3 boutons Présent / Absent / Retard par élève, « Tous présents », puis « Valider l’appel » (les parents des absents sont prévenus comme avant). L’onglet « Mois » garde le registre complet.' ],
  } },
  { version: '2026.10.17-3', nouveautes: {
    commun: [],
    parent: [],
    portier: [],
    personnel: [ 'Parents ↔ Élèves : une carte claire par élève (Compte relié / Non relié, numéros lisibles), recherche et filtres Non reliés / Reliés ; « Inviter » envoie le lien par WhatsApp, « Relier à un compte » avec recherche.' ],
  } },
  { version: '2026.10.17-2', nouveautes: {
    commun: [],
    parent: [],
    portier: [],
    personnel: [ 'Nouveau look : en-tête plus compact, une seule cloche 🔔 pour les notifications, messages et suggestions (onglets), mode clair/sombre dans le menu.',
      'Tableau de bord plus clair : « À faire aujourd’hui », chiffres clés lisibles, vos classes en un coup d’œil.',
      'Compta → Scolarité : sur téléphone, une carte par élève (reste à payer, tranches Payé / À payer / En retard, bouton « Encaisser »), avec recherche et filtres Soldés / Avec reste / En retard.' ],
  } },
  { version: '2026.10.17-1', nouveautes: {
    commun: [],
    parent: [],
    portier: [],
    personnel: [ 'Correction : une nouvelle école peut maintenant activer ses niveaux et créer ses classes (les classes existantes ne changent pas).' ],
  } },
  { version: '2026.10.13-29', nouveautes: {
    commun: [],
    parent: [],
    portier: [],
    personnel: [ 'Nouveau : « 🔐 Sécurité du compte » (en bas du menu) — double vérification par code à 6 chiffres (Google Authenticator, gratuit). Recommandé pour la direction et le secrétariat : même avec votre mot de passe, personne d’autre ne peut entrer.' ],
  } },
  { version: '2026.10.13-28', nouveautes: {
    commun: [],
    parent: [ 'Si votre école l’active : les notes des devoirs et exercices de votre enfant, dès qu’elles sont saisies, avec la moyenne en cours par matière.' ],
    portier: [],
    personnel: [ 'Paramètres : « Notes au fil de l’eau pour les parents » — chaque parent voit les notes des Camps de base de son enfant dès leur saisie, avec notification (désactivé par défaut).' ],
  } },
  { version: '2026.10.13-27', nouveautes: {
    commun: [],
    parent: [ 'Bulletin : votre enfant voit maintenant son rang dans la classe et la moyenne de la classe.' ],
    portier: [],
    personnel: [ 'Bulletin officiel : coefficients par matière (Paramètres), moyenne générale pondérée, rang (ex æquo gérés), moyenne de la classe, plus forte et plus faible moyenne.', 'Notes & Bulletins : « Résultats » de la classe et impression de tous les bulletins de la classe en une fois (une page par élève).' ],
  } },
  { version: '2026.10.13-26', nouveautes: {
    commun: [],
    parent: [ 'Bulletin : la colonne « Classe » regroupe maintenant tous les devoirs et exercices de l’enfant.' ],
    portier: [],
    personnel: [ 'Nouveau module « Cahier d’appel » : registre du mois (élèves × jours), présent / absent / retard en un toucher, totaux, impression et Excel.', 'Nouveau module « Camps de base » : autant de devoirs, exercices de classe, exercices de maison et interrogations que voulu, notés sur 10, 20… ; leur moyenne entre dans le bulletin avec la composition.' ],
  } },
  { version: '2026.10.14-2', nouveautes: {
    commun: [],
    parent: [],
    portier: [],
    personnel: [ '« Remplir automatiquement » amélioré : photo recto/verso, vocal (2 min), ou texte collé (message WhatsApp du parent) ; aperçu de ce qui a été trouvé avant d’appliquer ; dates, sexe, noms et téléphones vérifiés.' ],
  } },
  { version: '2026.10.14-1', nouveautes: {
    commun: [ 'Correction : une suppression ou une modification refusée n’affiche plus « enregistré » à tort ; un message clair explique pourquoi.' ],
    parent: [],
    portier: [],
    personnel: [],
  } },
  { version: '2026.10.13-25', nouveautes: {
    commun: [],
    parent: [],
    portier: [],
    personnel: [ 'Demandes d’accès des enseignants : fiche retrouvée par le téléphone, indices de confiance (téléphone, nom, classes identiques à la fiche).' ],
  } },
  { version: '2026.10.13-24', nouveautes: {
    commun: [],
    parent: [],
    portier: [],
    personnel: [ 'Fiche élève : encadré « En un coup d’œil » — reste à payer, allergies, personnes autorisées, derniers messages (lus ou non), WhatsApp et appel du parent, certificat.' ],
  } },
  { version: '2026.10.13-23', nouveautes: {
    commun: [],
    parent: [ 'La veille d’une sortie, d’une réunion, d’une fête ou des vacances, rappel à 18h sur votre téléphone (et « pensez à répondre » si l’école attend votre autorisation).' ],
    portier: [],
    personnel: [ 'Agenda : rappel automatique aux parents concernés la veille à 18h ; ceux qui n’ont pas répondu à une autorisation sont relancés.' ],
  } },
  { version: '2026.10.13-22', nouveautes: {
    commun: [],
    parent: [ 'Bulletin : bouton « Imprimer / enregistrer en PDF » pour le garder ou l’envoyer.' ],
    portier: [],
    personnel: [],
  } },
  { version: '2026.10.13-21', nouveautes: {
    commun: [],
    parent: [ 'Inscription : indiquez votre numéro WhatsApp, l’école valide votre demande plus vite.' ],
    portier: [],
    personnel: [ 'Demandes d’accès des parents : indices de confiance (téléphone et nom identiques à la fiche, ou différents) et enregistrement du numéro sur les fiches qui n’en ont pas.' ],
  } },
  { version: '2026.10.13-20', nouveautes: {
    commun: [],
    parent: [],
    portier: [],
    personnel: [ 'Affiches A4 à imprimer (grand QR code + 3 étapes) : application des parents pour l’entrée, application des enseignants pour la salle des professeurs, pré-inscription en ligne.' ],
  } },
  { version: '2026.10.13-19', nouveautes: {
    commun: [],
    parent: [],
    portier: [],
    personnel: [ 'Direction : « Mise en route de l’école » complétée — nom du directeur et téléphone, scolarité paramétrée, enseignants inscrits (bouton pour leur envoyer le lien par WhatsApp).' ],
  } },
  { version: '2026.10.13-18', nouveautes: {
    commun: [],
    parent: [ 'En bas de l’accueil : « Contacter l’école » — appeler, WhatsApp, itinéraire jusqu’à l’école, écrire dans l’application.' ],
    portier: [],
    personnel: [],
  } },
  { version: '2026.10.13-17', nouveautes: {
    commun: [],
    parent: [],
    portier: [],
    personnel: [ 'Messagerie : « Messages envoyés aux parents » avec accusés de lecture (✓ envoyé, ✓✓ lu, avec l’heure) et bouton WhatsApp pour prévenir un parent qui n’a pas lu.' ],
  } },
  { version: '2026.10.13-16', nouveautes: {
    commun: [],
    parent: [],
    portier: [],
    personnel: [ 'Tableau de bord : encadré « À traiter » — demandes d’accès, pré-inscriptions, documents, corrections, messages de parents et objets perdus en attente, d’un coup d’œil.' ],
  } },
  { version: '2026.10.13-15', nouveautes: {
    commun: [],
    parent: [ 'Nouveau sur l’accueil : « Demander un document » (certificat de scolarité…) — vous êtes prévenu(e) dès qu’il est prêt à retirer.' ],
    portier: [],
    personnel: [ 'Élèves & Inscriptions : « Documents demandés par les parents » — Préparer (certificat), Prêt (le parent est prévenu), Remis.' ],
  } },
  { version: '2026.10.13-14', nouveautes: {
    commun: [],
    parent: [],
    portier: [],
    personnel: [ 'Fiche élève : bouton « 📄 Certificat de scolarité » — document prêt à imprimer (logo, n°, classe, année scolaire, signature et cachet).' ],
  } },
  { version: '2026.10.13-13', nouveautes: {
    commun: [],
    parent: [],
    portier: [],
    personnel: [ 'Nouveau : pré-inscription en ligne. Élèves & Inscriptions → « Lien à partager » (WhatsApp, Facebook) ; les demandes des familles arrivent ici, avec bouton « Inscrire » qui pré-remplit la fiche.' ],
  } },
  { version: '2026.10.13-12', nouveautes: {
    commun: [],
    parent: [ 'Nouveau sur l’accueil : « À la cantine » — le repas et le goûter du jour et du lendemain (si l’école publie son menu).' ],
    portier: [],
    personnel: [ 'Nouveau menu « Menu de la cantine » : saisissez les repas et goûters de la semaine, copiez la semaine précédente, prévenez les parents.' ],
  } },
  { version: '2026.10.13-11', nouveautes: {
    commun: [],
    parent: [],
    portier: [],
    personnel: [ 'Tableau de bord : « Élèves à surveiller » — absences répétées (3 ou plus en 30 jours, ou absent aux 2 derniers appels), avec bouton WhatsApp vers le parent.' ],
  } },
  { version: '2026.10.13-10', nouveautes: {
    commun: [],
    parent: [ 'Fiche de votre enfant : « Historique depuis la rentrée » — taux de présence, absences et retards mois par mois.' ],
    portier: [],
    personnel: [],
  } },
  { version: '2026.10.13-9', nouveautes: {
    commun: [],
    parent: [ 'Chaque vendredi à 17h30 : le résumé de la semaine de vos enfants (présences, devoirs à venir, prochaines dates).' ],
    portier: [],
    personnel: [ 'Les parents reçoivent chaque vendredi le résumé de la semaine de leurs enfants (désactivable dans Paramètres).' ],
  } },
  { version: '2026.10.13-8', nouveautes: {
    commun: [],
    parent: [ 'Une erreur sur la fiche de votre enfant (date de naissance, téléphone…) ? Bouton « Signaler une erreur sur la fiche » : l’école vérifie et corrige.' ],
    portier: [],
    personnel: [ 'Élèves & Inscriptions : « Corrections proposées par les parents » — ancien → nouveau, appliquez en un clic (notification à chaque demande).' ],
  } },
  { version: '2026.10.13-7', nouveautes: {
    commun: [],
    parent: [ 'Sorties, réunions, fêtes : répondez directement à l’école depuis « À venir » (j’autorise / je serai présent).' ],
    portier: [],
    personnel: [ 'Agenda : demandez une autorisation parentale ou une confirmation de présence ; suivez les réponses par classe et relancez par WhatsApp les parents sans réponse.' ],
  } },
  { version: '2026.10.13-6', nouveautes: {
    commun: [],
    parent: [ 'Nouveau sur la fiche de votre enfant : « Sécurité & santé » — indiquez qui peut venir le chercher (le portier le verra) et ses allergies.' ],
    portier: [ 'Après chaque signalement, la liste des personnes autorisées à venir chercher l’enfant s’affiche.' ],
    personnel: [ 'Fiche élève : bouton « Sécurité & santé » (personnes autorisées, allergies, informations utiles).', 'Enseignants : les allergies des élèves de vos classes apparaissent dans « Ma journée ».' ],
  } },
  { version: '2026.10.13-5', nouveautes: {
    commun: [],
    parent: [ 'Le jour de l’anniversaire de votre enfant, l’école lui souhaite un joyeux anniversaire dans votre application. 🎂' ],
    portier: [],
    personnel: [ 'Tableau de bord : « Anniversaires de la semaine » de vos élèves.', 'Le jour J à 8h, les parents reçoivent automatiquement les vœux de l’école (désactivable dans Paramètres → Anniversaires des élèves).' ],
  } },
  { version: '2026.10.13-4', nouveautes: {
    commun: [],
    parent: [ 'Chaque soir à 18h, rappel des devoirs pour le lendemain sur votre téléphone.' ],
    portier: [],
    personnel: [ 'Chaque soir à 18h (dimanche au jeudi), les parents reçoivent automatiquement le rappel des devoirs du lendemain.', '« Ma journée » : rappel des devoirs notés pour le prochain jour de classe, bouton « Noter un devoir ».' ],
  } },
  { version: '2026.10.13-3', nouveautes: {
    commun: [],
    parent: [ 'Nouveau : « Devoirs » sur l’accueil — le travail à faire noté par l’enseignant de votre enfant, avec une notification.' ],
    portier: [],
    personnel: [ 'Nouveau menu « Cahier de textes » : notez les devoirs de vos classes, les parents les voient aussitôt (notification au choix).' ],
  } },
  { version: '2026.10.13-2', nouveautes: {
    commun: [],
    parent: [ 'Chaque paiement de scolarité vous est confirmé dans vos messages, avec le reste à payer.', 'Nouveau : « Écrire à l’école » dans vos messages — l’école vous répond ici.', 'Nouveau : « À venir » sur l’accueil — vacances, compositions, réunions et fêtes de l’école.', 'Nouvel onglet « Vie de l’école » : photos et vidéos des événements, J’aime, Bravo et commentaires.' ],
    portier: [],
    personnel: [ 'Enseignants : encadré « Ma journée » (appel, absences signalées, renforcement, parents arrivés, agenda) pour vos classes.', 'Paiement de scolarité : le parent reçoit automatiquement la confirmation (application + notification), avec bouton WhatsApp sous le reçu.', 'Exports Excel : liste des élèves (une feuille par classe) et état de la scolarité avec les impayés.', 'Messagerie : les parents peuvent vous écrire ; bouton « Répondre » et notification à chaque message.', 'Nouveau menu « Agenda de l’école » : vacances, compositions, réunions ; les vacances arrêtent les annonces automatiquement.', 'Notes & Bulletins : la Direction publie un trimestre, les parents voient le bulletin de leurs enfants.', 'Enseignants : application « EcoMaZ-ENSEIGNANTS » — chacun s’inscrit avec Google, coche ses classes et ne voit que ses classes.', 'Parents : à l’inscription, ils cochent eux-mêmes leurs enfants ; vous n’avez plus qu’à approuver.', 'Paramètres → Scolarité : assistant « inscription + scolarité par classe ».', 'Paramètres → Scolarité : relances automatiques et polies des tranches impayées (3 jours avant, le jour même, 7 jours après).', 'Notifications sur le téléphone pour tout le personnel : demandes d’accès, absences signalées, objets perdus, appel non fait.', 'Appel rapide : « Tous présents », puis touchez le nom des absents ; rappel à 9h00 si l’appel n’est pas fait.', 'Paramètres → Scolarité : montants et tranches de paiement propres à chaque classe, copie vers d’autres classes, affichage aux parents au choix.', 'Direction : liste « Mise en route de l’école » sur le tableau de bord, avec ce qui reste à faire.', 'Nouveau menu « Vie de l’école » : publiez les photos et vidéos des événements pour les parents (toute l’école ou certaines classes).' ],
  } },
  { version: '2026.10.12-2', nouveautes: {
    commun: [],
    parent: [ 'Nouveau : bouton « Signaler une absence à l’avance » (maladie, rendez-vous…) sur l’accueil.' ],
    portier: [ 'L’enseignant est maintenant prévenu sur son téléphone, même application fermée.' ],
    personnel: [ 'Appel : les absences signalées à l’avance par les parents sont déjà marquées, avec leur motif.', 'Enseignants : notification sur le téléphone quand un parent arrive au portail (même application fermée).', 'Parents ↔ Élèves : coupons d’invitation à imprimer (QR code) ; demandes d’accès avec les enfants probables cochés d’avance.' ],
  } },
  { version: '2026.10.12', nouveautes: {
    commun: [],
    parent: [ 'Nouveau : bouton « Signaler une absence à l’avance » (maladie, rendez-vous…) sur l’accueil.', 'Notifications sur le téléphone, même application fermée : touchez « Activer les notifications » sur l’accueil.', 'Annonces de la journée 15 minutes avant : début des cours, pauses, fin des cours et cours de renforcement — avec notification du téléphone si vous l’autorisez.', 'L’information sur l’activité à venir défile dans une bande jaune en haut de l’accueil (touchez-la pour la mettre en pause) ; les précédentes sont dans « Informations passées ».', 'Nouvel onglet « Objets perdus » : signalez une affaire de votre enfant perdue à l’école, l’école vous répond.' ],
    portier: [],
    personnel: [ 'Appel : les absences signalées à l’avance par les parents sont déjà marquées, avec leur motif.', 'Enseignants : notification sur le téléphone quand un parent arrive au portail (même application fermée).', 'Nouveau menu « Parents ↔ Élèves » : reliez chaque élève au compte de son parent (suggestions, invitation WhatsApp).', 'Nouveau menu « Cours de renforcement » : inscriptions par classe, jours et heure, message aux seuls parents concernés.', 'Paramètres → Annonces horaires : heures réelles, pause de 10h, jours de classe, vacances ; case « cours de renforcement » sur la fiche élève.', 'Messagerie : les objets perdus signalés par les parents, avec une réponse à leur envoyer.' ],
  } },
  { version: '2026.10.11-2', nouveautes: {
    commun: [
      'Nouvelle icône de l’application, aux couleurs vert forêt et or.',
    ],
    parent: [],
    portier: [],
    personnel: [
      'Appel : bouton « Prévenir le parent » pour envoyer l’absence par WhatsApp, gratuitement (secrétariat, direction).',
      'Pointage GPS : le lien est envoyé à l’enseignant par WhatsApp.',
      'Fiche élève : une question de confirmation si la date d’inscription est dans le futur.',
      'Matricules : deux élèves ne peuvent plus avoir le même numéro.',
      'Élèves & Inscriptions : encadré « Fiches à vérifier » pour corriger les dates ou numéros mal saisis.',
      'Élèves & Inscriptions : bouton « Importer depuis Excel » pour ajouter une liste d’élèves d’un coup.',
      'Direction : bouton « Bilan de la semaine » sur le tableau de bord (à imprimer ou partager par WhatsApp).',
    ],
  } },
  { version: '2026.10.11', nouveautes: {
    commun: [
      'Nouvelle apparence : couleurs vert forêt et or, police plus lisible, icônes plus nettes.',
      'Mode sombre : bouton lune / soleil en haut de l’écran.',
    ],
    parent: [
      'La fiche de votre enfant affiche sa présence de la semaine.',
      'Les actualités de l’école sont présentées avec leur date.',
      'Tableau d’honneur : vous pouvez désormais applaudir les lauréats.',
      'Barre en bas : Accueil, Messages, Suggestions et Profil (déconnexion).',
    ],
    portier: [
      'Écran sombre plus lisible dehors, grands boutons « Prévenir ».',
      'Confirmation claire quand l’enseignant est prévenu, avec l’heure.',
    ],
    personnel: [
      'Recherche rapide : bouton loupe (ou Ctrl + K) pour trouver un élève ou une page.',
      'Sur téléphone : barre de raccourcis en bas de l’écran.',
      'Tableau de bord : messages clairs quand l’appel n’est pas encore fait.',
      'Fiche élève : la date de naissance est vérifiée à la saisie.',
    ],
  } },
];
const APP_VERSION = VERSIONS[0].version;
function afficherNouveautes(){
  try{
    if(!session.userId) return;
    const cle = v => `ecomaz_nouveautes_${v}_${session.userId}`;
    const nonVues = VERSIONS.filter(v => !localStorage.getItem(cle(v.version)));
    if(nonVues.length === 0) return;
    const role = ui.role === 'parent' ? 'parent' : ui.role === 'portier' ? 'portier' : 'personnel';
    const textes = [];
    nonVues.forEach(v => v.nouveautes.commun.concat(v.nouveautes[role]).forEach(t => { if(!textes.includes(t)) textes.push(t); }));
    if(textes.length === 0){ nonVues.forEach(v => localStorage.setItem(cle(v.version), '1')); return; }
    // Les 6 plus récentes d'abord ; les autres dans un volet repliable
    const li = t => `<li>${escapeHtml(t)}</li>`;
    const premieres = textes.slice(0, 6).map(li).join(''), autres = textes.slice(6).map(li).join('');
    setTimeout(() => {
      if(document.getElementById('modalBackdrop').classList.contains('open')) return;
      openModal('EcoMaZ a été mis à jour', `
        <div class="maj-intro">✨ Votre application <strong>${escapeHtml(nomApplication())}</strong> vient d’être mise à jour. Vos données et vos habitudes ne changent pas.</div>
        <ul class="maj-liste">${premieres}</ul>
        ${autres ? `<details class="maj-autres"><summary>Voir les ${textes.length - 6} autres nouveautés</summary><ul class="maj-liste">${autres}</ul></details>` : ''}
        ${role === 'personnel' ? `<p class="hint" style="margin-top:10px;">📘 Tous les gestes expliqués pas à pas : <a href="docs/EcoMaZ-Guide-du-personnel.pdf" target="_blank" rel="noopener">guide du personnel (PDF)</a>.</p>` : ''}
        <div class="form-actions"><button type="button" class="btn" onclick="closeModal()">J’ai compris</button></div>`);
      nonVues.forEach(v => localStorage.setItem(cle(v.version), '1'));
    }, 900);
  }catch(_e){ /* stockage indisponible : on n'insiste pas */ }
}
