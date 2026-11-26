/* =====================================================================
   APPEL OBLIGATOIRE (enseignant) — 2026-11-10
   À partir de l'heure du rappel (Paramètres → horaires) et jusqu'à 17 h, les jours
   de classe : tant que l'appel d'une de ses classes n'est pas validé, un écran
   « L'appel n'est pas fait » couvre l'application de l'enseignant (pas de bouton
   fermer : seulement « Faire l'appel maintenant ») et un bip retentit chaque minute.
   L'écran disparaît dès que l'appel de toutes ses classes est enregistré.
   ===================================================================== */
let audioRappel = null, minuterieAppel = null, dernierBip = 0, sonBip = null, sonDebloque = false, debutAlarme = 0, verrouEcran = null;
// Écran maintenu allumé tant que l'alarme est affichée (sinon le téléphone se met en veille et l'alarme se tait)
async function garderEcranAllume(oui){
  try{
    if(oui && !verrouEcran && 'wakeLock' in navigator && !document.hidden){ verrouEcran = await navigator.wakeLock.request('screen'); verrouEcran.addEventListener('release', () => { verrouEcran = null; }); }
    if(!oui && verrouEcran){ await verrouEcran.release(); verrouEcran = null; }
  }catch(_e){ verrouEcran = null; }
}
// Son du bip fabriqué une fois (3 tons de 880 Hz, fichier WAV en mémoire)
function fichierBip(){
  // Alarme de 3 s : 10 tons alternés 1 000 Hz / 750 Hz (0,25 s chacun, 0,05 s de silence) — fait pour déranger
  const f = 22050, tons = Array.from({ length: 10 }, (_, k) => [k * 0.3, k * 0.3 + 0.25, k % 2 ? 750 : 1000]), n = Math.round(f * 3), b = new ArrayBuffer(44 + n * 2), v = new DataView(b);
  const ecr = (o, t) => { for(let i = 0; i < t.length; i++) v.setUint8(o + i, t.charCodeAt(i)); };
  ecr(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); ecr(8, 'WAVE'); ecr(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, f, true); v.setUint32(28, f * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); ecr(36, 'data'); v.setUint32(40, n * 2, true);
  for(let i = 0; i < n; i++){ const t = i / f, ton = tons.find(([a, z]) => t >= a && t < z); v.setInt16(44 + i * 2, ton ? (Math.sin(2 * Math.PI * ton[2] * t) > 0 ? 1 : -1) * 26000 : 0, true); }
  return URL.createObjectURL(new Blob([b], { type: 'audio/wav' }));
}
function debloquerSon(){
  try{
    if(!sonBip){ sonBip = new Audio(fichierBip()); sonBip.preload = 'auto'; }
    if(!sonDebloque){ sonBip.muted = true; const p = sonBip.play(); if(p && p.then) p.then(() => { sonBip.pause(); sonBip.currentTime = 0; sonBip.muted = false; sonDebloque = true; }).catch(() => { sonBip.muted = false; }); }
  }catch(_e){}
  try{
    if(!audioRappel){ const C = window.AudioContext || window.webkitAudioContext; if(!C) return; audioRappel = new C(); }
    if(audioRappel.state === 'suspended') audioRappel.resume();
  }catch(_e){}
}
// Les navigateurs n'autorisent le son qu'après un premier toucher de l'écran
document.addEventListener('pointerdown', debloquerSon, { passive: true });
function bipRappel(){
  if(navigator.vibrate) try{ navigator.vibrate([800, 200, 800, 200, 800, 200, 800]); }catch(_e){}
  // 1) son « média » (passe en mode silencieux) ; 2) à défaut, synthèse audio
  try{
    debloquerSon();
    if(sonBip){ sonBip.muted = false; sonBip.volume = 1; sonBip.currentTime = 0; const p = sonBip.play(); if(p && p.catch) p.catch(() => {}); if(sonDebloque) return true; }
  }catch(_e){}
  try{
    if(!audioRappel || audioRappel.state !== 'running') return false;
    const t0 = audioRappel.currentTime;
    Array.from({ length: 10 }, (_, k) => k * 0.3).forEach((dt, k) => {
      const o = audioRappel.createOscillator(), g = audioRappel.createGain();
      o.type = 'square'; o.frequency.value = k % 2 ? 750 : 1000;
      g.gain.setValueAtTime(0.0001, t0 + dt); g.gain.exponentialRampToValueAtTime(0.35, t0 + dt + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dt + 0.3);
      o.connect(g); g.connect(audioRappel.destination); o.start(t0 + dt); o.stop(t0 + dt + 0.32);
    });
    return true;
  }catch(_e){ return false; }
}
/* ---------- Horaires de cours de l'enseignant (schema.sql section 115) ----------
   Créneaux déclarés à l'enrôlement : [{ classe, jour 1-6, debut 'HH:MM', fin 'HH:MM' }] */
const JOURS_COURS = ['', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
function creneauxEnseignant(fiche){ return Array.isArray(fiche?.creneaux) ? fiche.creneaux : []; }
function jourIsoDe(iso){ return ((new Date(iso + 'T12:00:00').getDay() + 6) % 7) + 1; }
function creneauxDuJour(fiche, iso){
  const j = jourIsoDe(iso), mes = new Set(fiche?.classesAssignees || []);
  return creneauxEnseignant(fiche).filter(c => Number(c.jour) === j && mes.has(c.classe)).sort((a, b) => a.debut.localeCompare(b.debut));
}
// Sans horaire déclaré, on ne restreint pas l'affichage (mais aucune alarme n'est envoyée)
function aCoursLe(fiche, classeId, iso){ return !creneauxEnseignant(fiche).length || creneauxDuJour(fiche, iso).some(c => c.classe === classeId); }
const heureLisible = hm => String(hm || '').slice(0, 5).replace(':', 'h');
const minutesDe = hm => { const [h, m] = String(hm).split(':').map(Number); return h * 60 + m; };
// Regroupe les créneaux identiques (même classe, mêmes heures) sur plusieurs jours : « CE1 · Lun, Mar · 07h30–12h00 »
function groupesCreneaux(liste){
  const g = new Map();
  (liste || []).forEach(c => { const k = `${c.classe}|${c.debut}|${c.fin}`; if(!g.has(k)) g.set(k, { classe:c.classe, debut:c.debut, fin:c.fin, jours:[] }); g.get(k).jours.push(Number(c.jour)); });
  return [...g.values()].map(x => ({ ...x, jours: [...new Set(x.jours)].sort() })).sort((a, b) => (a.jours[0] - b.jours[0]) || a.debut.localeCompare(b.debut));
}
function texteCreneaux(liste){
  return groupesCreneaux(liste).map(x => `<span class="creneau-resume"><strong>${escapeHtml(classeName(x.classe))}</strong> · ${x.jours.map(j => JOURS_COURS[j].slice(0, 3)).join(', ')} · ${heureLisible(x.debut)}–${heureLisible(x.fin)}</span>`).join('');
}
function ligneCreneau(classeIds, x){
  const jours = new Set(x?.jours || []);
  return `<div class="creneau-ligne">
    <select class="cr-classe" aria-label="Classe">${classeIds.map(id => `<option value="${id}" ${x?.classe === id ? 'selected' : ''}>${escapeHtml(classeName(id))}</option>`).join('')}</select>
    <div class="cr-jours" role="group" aria-label="Jours de cours">${[1, 2, 3, 4, 5, 6].map(j => `<label class="cr-jour" title="${JOURS_COURS[j]}"><input type="checkbox" value="${j}" ${jours.has(j) ? 'checked' : ''}><span>${JOURS_COURS[j].slice(0, 3)}</span></label>`).join('')}</div>
    <label class="cr-heure"><span>De</span><input type="time" class="cr-debut" value="${escapeHtml(x?.debut || '07:30')}" required></label>
    <label class="cr-heure"><span>à</span><input type="time" class="cr-fin" value="${escapeHtml(x?.fin || '12:00')}" required></label>
    <button type="button" class="icon-btn cr-retirer" aria-label="Retirer ce créneau" title="Retirer" onclick="this.closest('.creneau-ligne').remove()">✕</button>
  </div>`;
}
// Horaires proposés d'après l'emploi du temps de l'école (séances valables aujourd'hui) :
// pour chaque classe et chaque jour, du début de la 1re séance à la fin de la dernière.
// Si des séances sont nommément attribuées à cet enseignant, seules celles-ci comptent ;
// les séances attribuées à un autre enseignant ne comptent jamais.
function creneauxProposes(ficheId, classeIds){
  const auj = todayISO(), sortie = [];
  (classeIds || []).forEach(classe => {
    const seances = (DB.emploiTemps || []).filter(e => e.classeId === classe && e.heureDebut && e.heureFin && seanceValide(e, auj));
    const miennes = seances.filter(e => ficheId && e.enseignantId === ficheId);
    const retenues = miennes.length ? miennes : seances.filter(e => !e.enseignantId || e.enseignantId === ficheId);
    const parJour = new Map();
    retenues.forEach(e => {
      const j = JOURS_COURS.indexOf(e.jour); if(j < 1) return;
      const d = hhmmEdt(e.heureDebut), f = hhmmEdt(e.heureFin), x = parJour.get(j);
      parJour.set(j, x ? { debut: d < x.debut ? d : x.debut, fin: f > x.fin ? f : x.fin } : { debut: d, fin: f });
    });
    [...parJour.entries()].sort((a, b) => a[0] - b[0]).forEach(([jour, h]) => { if(h.debut < h.fin) sortie.push({ classe, jour, debut: h.debut, fin: h.fin, origine: 'edt' }); });
    // Classe sans emploi du temps (ex. maternelle) : horaires de l'école (Paramètres → Horaires), jours de classe de l'école
    if(!parJour.size){
      const h = DB?.horairesAnnonces || {}, mat = classeCycle(classe) !== 'Primaire';
      const debut = hhmmEdt(mat ? h.matinDebutMaternelle : h.matinDebutPrimaire), fin = hhmmEdt(mat ? h.apresmidiFinMaternelle : h.apresmidiFinPrimaire);
      if(/^\d{2}:\d{2}$/.test(debut) && /^\d{2}:\d{2}$/.test(fin) && debut < fin)
        (h.joursCours || []).filter(j => j >= 1 && j <= 6).sort().forEach(jour => sortie.push({ classe, jour, debut, fin, origine: 'ecole' }));
    }
  });
  return sortie;
}
function origineProposition(proposes){
  const o = new Set((proposes || []).map(p => p.origine || 'edt'));
  if(o.has('edt') && o.has('ecole')) return 'l’emploi du temps de l’école et, pour les classes qui n’en ont pas, les horaires de l’école (Paramètres)';
  return o.has('ecole') ? 'les horaires de l’école (Paramètres → Horaires) : cette classe n’a pas d’emploi du temps' : 'l’emploi du temps de l’école';
}
function reprendreEmploiDuTemps(bouton){
  const ed = bouton.closest('.creneaux-editeur'); if(!ed) return;
  const proposes = JSON.parse(ed.dataset.proposes || '[]'); if(!proposes.length) return;
  const ids = ed.dataset.classes.split(',');
  ed.querySelector('.creneaux-liste').innerHTML = groupesCreneaux(proposes).map(x => ligneCreneau(ids, x)).join('');
  const n = ed.querySelector('.cr-propose'); if(n) n.hidden = false;
}
function editeurCreneaux(classeIds, creneaux, titre, proposes){
  proposes = proposes || [];
  const preRempli = !(creneaux || []).length && proposes.length;
  const groupes = groupesCreneaux(preRempli ? proposes : creneaux);
  return `<div class="creneaux-editeur" data-classes="${classeIds.join(',')}" data-proposes="${escapeHtml(JSON.stringify(proposes))}">
    <label class="cr-titre">${titre || 'Mes jours et heures de cours'}</label>
    <div class="hint" style="margin:0 0 8px;">Une ligne par classe et par horaire : cochez les jours, puis l’heure de début et de fin. Les rappels d’appel n’arrivent <strong>que pendant ces heures</strong> (10 minutes après le début du cours).</div>
    <div class="cr-propose" role="note" ${preRempli ? '' : 'hidden'}>${icone('sparkles')} <span>Proposé d’après <strong>${origineProposition(proposes)}</strong> : vérifiez, corrigez si besoin, puis enregistrez.</span></div>
    <div class="creneaux-liste">${groupes.map(x => ligneCreneau(classeIds, x)).join('')}</div>
    ${proposes.length && !preRempli ? `<button type="button" class="btn secondary sm" style="margin-bottom:6px;" onclick="reprendreEmploiDuTemps(this)">${icone('calendar')} Reprendre ${proposes.every(p => p.origine === 'ecole') ? 'les horaires de l’école' : 'l’emploi du temps de l’école'}</button>` : ''}
    ${classeIds.length ? `<button type="button" class="btn secondary sm" onclick="const e=this.closest('.creneaux-editeur'); e.querySelector('.creneaux-liste').insertAdjacentHTML('beforeend', ligneCreneau(e.dataset.classes.split(','), null))">+ Ajouter un horaire</button>` : '<div class="hint">Cochez d’abord une classe.</div>'}
  </div>`;
}
// Lit l'éditeur → liste de créneaux (un par jour coché) ; renvoie { erreur } si une ligne est incomplète
function lireCreneaux(racine){
  const ed = racine?.querySelector('.creneaux-editeur'); if(!ed) return null;
  const sortie = [];
  for(const l of ed.querySelectorAll('.creneau-ligne')){
    const classe = l.querySelector('.cr-classe').value, debut = l.querySelector('.cr-debut').value.slice(0, 5), fin = l.querySelector('.cr-fin').value.slice(0, 5);
    const jours = [...l.querySelectorAll('.cr-jours input:checked')].map(x => Number(x.value));
    if(!jours.length) return { erreur:`Cochez au moins un jour pour ${classeName(classe)}.` };
    if(!/^\d{2}:\d{2}$/.test(debut) || !/^\d{2}:\d{2}$/.test(fin) || debut >= fin) return { erreur:`Vérifiez les heures de ${classeName(classe)} : la fin doit être après le début.` };
    jours.forEach(jour => sortie.push({ classe, jour, debut, fin }));
  }
  return { creneaux: sortie };
}
function classesAppelObligatoire(){
  if(ui.role !== 'enseignant' || !session.enseignantId) return [];
  const auj = todayISO(); if(!estJourDeCours(auj)) return [];
  const fiche = enseignantById(session.enseignantId);
  // Uniquement pendant SES cours : de 10 minutes après le début du créneau jusqu'à sa fin. Sans horaire : jamais.
  const d = new Date(), m = d.getHours() * 60 + d.getMinutes();
  const enCours = new Set(creneauxDuJour(fiche, auj).filter(c => m >= minutesDe(c.debut) + 10 && m <= minutesDe(c.fin)).map(c => c.classe));
  if(!enCours.size) return [];
  return classesVisibles().filter(c => enCours.has(c.id) && DB.eleves.some(e => e.classeId === c.id && e.statut === 'Actif') && !DB.presencesEleves.some(p => p.classeId === c.id && p.date === auj));
}
function verifierAppelObligatoire(forcerBip){
  let el = document.getElementById('appelObligatoire');
  const manquantes = classesAppelObligatoire();
  // Rien à faire, ou l'enseignant est déjà sur l'écran d'appel : on laisse travailler
  if(!manquantes.length || ui.currentView === 'presences-eleves'){
    if(el) el.remove();
    try{ if(sonBip) sonBip.pause(); }catch(_e){}
    garderEcranAllume(false);
    if(!manquantes.length){ debutAlarme = 0; if(minuterieAppel){ clearInterval(minuterieAppel); minuterieAppel = null; } }
    return;
  }
  if(!el){
    el = document.createElement('div'); el.id = 'appelObligatoire'; el.className = 'appel-obligatoire no-print';
    el.setAttribute('role', 'alertdialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-labelledby', 'aoTitre');
    document.body.appendChild(el);
    forcerBip = true;
  }
  const auj = todayISO();
  el.innerHTML = `<div class="ao-boite">
    <div class="ao-ic" aria-hidden="true">${icone('alarm-clock')}</div>
    <h2 id="aoTitre">L’appel n’est pas encore fait</h2>
    <p class="ao-classes">${manquantes.map(c => `<strong>${escapeHtml(c.nom)}</strong>`).join(' · ')}</p>
    <p>Les parents attendent de savoir si leur enfant est en classe. L’alarme sonne de plus en plus souvent et ne s’arrête que lorsque l’appel est validé. Au bout de 30 minutes, la direction est prévenue.</p>
    <button type="button" class="btn ao-btn" onclick="allerAppel('${manquantes[0].id}','${auj}')">${icone('circle-check')} Faire l’appel maintenant${manquantes.length > 1 ? ` — ${escapeHtml(manquantes[0].nom)}` : ''}</button>
    ${sonDebloque || (audioRappel && audioRappel.state === 'running') ? '' : '<p class="ao-son">Touchez l’écran une fois pour activer le son des rappels.</p>'}
  </div>`;
  const maintenant = Date.now();
  if(!debutAlarme) debutAlarme = maintenant;
  const delai = maintenant - debutAlarme < 120000 ? 15000 : 8000; // de plus en plus insistant
  if(!document.hidden && (forcerBip || maintenant - dernierBip > delai)){ dernierBip = maintenant; bipRappel(); }
  garderEcranAllume(true);
  if(!minuterieAppel) minuterieAppel = setInterval(() => verifierAppelObligatoire(), 4000);
}
document.addEventListener('visibilitychange', () => { if(!document.hidden && ui.role === 'enseignant') verifierAppelObligatoire(true); });
if('serviceWorker' in navigator) navigator.serviceWorker.addEventListener('message', ev => {
  if(ev.data && ev.data.type === 'rappel-appel' && ui.role === 'enseignant') verifierAppelObligatoire(true);
});
function enterApp(){
  document.body.classList.remove('theme-parent');
  $('#loginGate').classList.remove('open');
  $('#appRoot').style.display = '';
  $('#sidebar').style.display = '';
  $('#burger').style.display = '';
  applyBranding();
  applyRoleVisibility();
  rafraichirBulles();
  go('dashboard');
  if(ui.role === 'enseignant'){ chargerAgenda(); setInterval(() => verifierAppelObligatoire(), 60000); }
  startIdleWatcher();
  majBanniereHorsLigne();
  synchroniserFileAttente();
  startPollingBulles();
  demarrerPersonnesConnectees();
  afficherNouveautes();
  activerPush(true);
}

/* ---------------------------------------------------------------------
   Bannière hors ligne / synchronisation — reflète l'état réel de la
   connexion et de la file d'attente (voir supabase-client.js).
   --------------------------------------------------------------------- */
function majBanniereHorsLigne(){
  const el = $('#offlineBanner');
  if(!el) return;
  if(navigator.onLine === false || DB?.meta?.horsLigne){
    el.hidden = false;
    el.className = 'offline-banner mode-hors-ligne';
    el.textContent = t('banner_offline');
  } else if(compteurFileErreurs > 0){
    el.hidden = false;
    el.className = 'offline-banner mode-refus';
    el.innerHTML = `<button type="button" class="refus-lien" onclick="ouvrirFileAttenteRefus()">⚠️ ${compteurFileErreurs} enregistrement${compteurFileErreurs > 1 ? 's' : ''} gardé${compteurFileErreurs > 1 ? 's' : ''} dans ce téléphone : refusé${compteurFileErreurs > 1 ? 's' : ''} par le serveur. Touchez pour voir.</button>`;
  } else if(compteurFileAttente > 0){
    el.hidden = false;
    el.className = 'offline-banner mode-synchro';
    el.textContent = t('banner_syncing', { n: compteurFileAttente });
  } else {
    el.hidden = true;
  }
}
function onFileAttenteChange(n, nbErreurs){
  compteurFileAttente = n; compteurFileErreurs = nbErreurs || 0;
  majBanniereHorsLigne();
  if(n === 0) setTimeout(renvoyerNotifsAbsence, 1500);
  if(n === 0 && DB?.meta?.horsLigne === true){
    // La file d'attente vient d'être vidée : on recharge les données
    // fraîches depuis le serveur pour sortir proprement du mode hors ligne.
    chargerDB().then(db => { DB = db; majBanniereHorsLigne(); renderView(ui.currentView); }).catch(()=>{});
  }
}
window.addEventListener('online', majBanniereHorsLigne);
window.addEventListener('offline', majBanniereHorsLigne);
/* Enregistrements refusés par le serveur à la synchronisation (21/11/2026) :
   rien n'est plus jeté en silence ; l'utilisateur voit chaque élément,
   la raison, et choisit « Réessayer » ou « Abandonner ». */
const LIB_TABLES_FILE = { presences_eleves: 'Appel des élèves', presences_enseignants: 'Présence d’un enseignant', paiements_scolarite: 'Paiement de scolarité', paiements_cotisations: 'Paiement d’activité', depenses: 'Dépense', notes: 'Note', devoirs: 'Cahier de textes', messages_internes: 'Message', paiements_salaires: 'Salaire', ventes_gadgets: 'Vente', eleves: 'Fiche élève' };
function resumeElementFile(it){
  const p = it.payload || {}, morceaux = [];
  if(p.eleve_id){ const e = (DB?.eleves || []).find(x => x.id === p.eleve_id); if(e) morceaux.push(eleveFullName(e)); }
  if(p.statut) morceaux.push(p.statut);
  if(p.montant != null) morceaux.push(fmtFCFA(Number(p.montant) || 0));
  if(p.libelle || p.categorie) morceaux.push(p.libelle || p.categorie);
  if(p.matiere) morceaux.push(p.matiere);
  if(p.date) morceaux.push(fmtDate(p.date));
  return morceaux.join(' · ');
}
function raisonLisible(m){
  const s = String(m || '');
  if(/position n'a pas été vérifiée|position n’a pas été vérifiée/i.test(s)) return 'Appel envoyé hors de l’établissement ou position non vérifiée. Revenez dans l’école, activez la localisation, puis touchez « Réessayer ».';
  if(/row-level security|row level security/i.test(s)) return 'Votre compte n’a pas le droit d’enregistrer ceci (fonction ou classe différente). Demandez à la direction.';
  if(/null value|not-null/i.test(s)) return 'Une information obligatoire manque dans cet enregistrement.';
  if(/duplicate key/i.test(s)) return 'Cet enregistrement existe déjà sur le serveur (fait depuis un autre appareil).';
  return s.length > 160 ? s.slice(0, 160) + '…' : s;
}
async function ouvrirFileAttenteRefus(){
  const l = (await listerFileAttente()).filter(x => x.erreur);
  if(!l.length){ toast('Plus aucun enregistrement en attente.'); majBanniereHorsLigne(); return; }
  openModal('Enregistrements refusés par le serveur', `<p class="hint" style="margin-top:0;">Ils sont <strong>gardés dans ce téléphone</strong> : rien n’est perdu tant que vous ne les abandonnez pas.</p>
    <div class="kp-liste">${l.map(it => `<div class="kp-ligne pt-alerte"><span class="kp-avatar pt-avatar-alerte" aria-hidden="true">!</span>
      <div class="kp-qui"><strong>${escapeHtml(LIB_TABLES_FILE[it.table] || it.table)}</strong><small>${escapeHtml(resumeElementFile(it))}${it.horodatage ? ' · saisi le ' + escapeHtml(new Date(it.horodatage).toLocaleString('fr-FR')) : ''}</small>
        <span class="pt-raison">${escapeHtml(raisonLisible(it.erreur))}</span></div>
      <div class="kp-droite"><button type="button" class="btn sm" onclick="reessayerElementFile(${Number(it.id)})">Réessayer</button><button type="button" class="btn secondary sm" onclick="abandonnerElementFileUI(${Number(it.id)})">Abandonner</button></div></div>`).join('')}</div>
    <div class="form-actions"><button type="button" class="btn secondary" onclick="closeModal()">Fermer</button></div>`);
}
async function reessayerElementFile(id){
  const it = (await listerFileAttente()).find(x => x.id === id);
  if(it && it.table === 'presences_eleves' && /position/i.test(it.erreur || '')){
    positionAppelOk = 0;
    if(!(await verifierPositionAvantAppel(it.payload?.classe_id))) return;
  }
  toast('Nouvel essai d’envoi…');
  await synchroniserFileAttente(true);
  const reste = (await listerFileAttente()).find(x => x.id === id);
  toast(reste ? 'Toujours refusé : ' + raisonLisible(reste.erreur) : 'Enregistré sur le serveur ✓');
  if(document.querySelector('.modal-backdrop.open')) ouvrirFileAttenteRefus();
}
async function abandonnerElementFileUI(id){
  if(!confirm('Abandonner cet enregistrement ? Il sera définitivement effacé de ce téléphone et ne sera jamais enregistré.')) return;
  await abandonnerElementFile(id);
  ouvrirFileAttenteRefus();
}
// Le rôle "développeur" n'est rattaché à aucune école (ecole_id null) — il
// n'a pas accès à l'application cliente normale, seulement à sa propre
// console de gestion des écoles clientes.
